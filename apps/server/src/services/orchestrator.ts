import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  DestinationCredentials,
  Platform,
  PlatformAdapter,
  ServerEvent,
  ServerEventType,
  Stream,
  StreamDestinationStatus,
  StreamStatus,
} from '@social-live/shared';
import { ACTIVE_STREAM_STATUSES, TERMINAL_STREAM_STATUSES } from '@social-live/shared';
import type { Repos } from '@social-live/database';
import {
  assertPublicRtmpTarget,
  buildStreamArgs,
  FFmpegStreamProcess,
  type FFmpegProcessEvent,
} from '@social-live/streaming';
import { nowIso } from '@social-live/database';
import { decryptJson } from '../lib/crypto.js';
import { badRequest, conflict, notFound, tooManyRequests, AppError } from '../lib/errors.js';
import type { EventBus } from '../lib/bus.js';
import type { Logger } from '../lib/logger.js';
import type { AppConfig } from '../config.js';
import type { StreamLogEntry } from '@social-live/shared';

interface OrchestratorDeps {
  config: AppConfig;
  repos: Repos;
  bus: EventBus;
  logger: Logger;
  adapters: Record<Platform, PlatformAdapter>;
  ffmpegPath: string | null;
}

const METRICS_PERSIST_INTERVAL_MS = 5_000;

/**
 * Owns every running FFmpeg process, maps process events to database
 * updates, audit entries and SSE events, and aggregates per-destination
 * outcomes into the stream-level state machine.
 */
export class StreamOrchestrator {
  private processes = new Map<string, FFmpegStreamProcess>();
  private lastMetricsPersist = new Map<string, number>();

  constructor(private readonly deps: OrchestratorDeps) {}

  get activeProcessCount(): number {
    return this.processes.size;
  }

  async start(streamId: string): Promise<Stream> {
    const { repos, config } = this.deps;
    const stream = repos.streams.get(streamId);
    if (!stream) throw notFound('Stream not found');
    if (!['CREATED', 'QUEUED'].includes(stream.status)) {
      throw conflict(`Stream cannot be started from status ${stream.status}`);
    }
    if (stream.destinations.length === 0) {
      throw badRequest('Stream has no destinations');
    }
    if (repos.streams.countActive() >= config.maxConcurrentStreams) {
      throw tooManyRequests(
        `Concurrent stream limit reached (${config.maxConcurrentStreams}). Stop a stream first or raise MAX_CONCURRENT_STREAMS.`,
      );
    }
    if (!this.deps.ffmpegPath) {
      throw badRequest('FFmpeg was not found. Install FFmpeg or set FFMPEG_PATH (see Settings → Diagnostics).');
    }

    const video = stream.videoId ? repos.videos.get(stream.videoId) : null;
    if (!video || video.status !== 'READY') {
      throw badRequest('The selected video is not ready for streaming');
    }
    const inputPath = join(config.dataDir, 'videos', video.storagePath);
    if (!existsSync(inputPath)) {
      throw badRequest('The video file is missing on disk. Re-upload it or pick another video.');
    }

    repos.streams.updateStatus(streamId, 'STARTING', {
      startedAt: stream.startedAt ?? nowIso(),
      endedAt: null,
      errorMessage: null,
    });
    this.log(streamId, null, 'info', 'Stream starting');
    const updated = repos.streams.get(streamId)!;
    this.publish({ type: 'stream.starting', data: updated });

    let anyStarted = false;
    for (const sd of updated.destinations) {
      if (sd.status !== 'CREATED') continue;
      const ok = await this.startDestination(updated, sd, inputPath);
      anyStarted = anyStarted || ok;
    }
    if (!anyStarted) {
      this.finalizeIfDone(streamId);
    }
    return repos.streams.get(streamId)!;
  }

  async stop(streamId: string): Promise<Stream> {
    const { repos } = this.deps;
    const stream = repos.streams.get(streamId);
    if (!stream) throw notFound('Stream not found');

    if (stream.status === 'QUEUED') {
      repos.streams.updateStatus(streamId, 'STOPPED', { endedAt: nowIso() });
      const updated = repos.streams.get(streamId)!;
      this.publish({ type: 'stream.stopped', data: updated });
      return updated;
    }
    if (!ACTIVE_STREAM_STATUSES.includes(stream.status)) {
      throw conflict(`Stream cannot be stopped from status ${stream.status}`);
    }

    repos.streams.updateStatus(streamId, 'STOPPING');
    const stopping = repos.streams.get(streamId)!;
    this.publish({ type: 'stream.status', data: stopping });

    for (const sd of stream.destinations) {
      const process = this.processes.get(sd.id);
      if (process) {
        process.stop();
      } else if (!TERMINAL_STREAM_STATUSES.includes(sd.status)) {
        repos.streamDestinations.update(sd.id, { status: 'STOPPED', endedAt: nowIso() });
      }
    }
    this.finalizeIfDone(streamId);
    return repos.streams.get(streamId)!;
  }

  /** Graceful shutdown: stop all processes, wait up to timeoutMs. */
  async shutdown(timeoutMs = 8_000): Promise<void> {
    for (const process of this.processes.values()) {
      process.stop();
    }
    const deadline = Date.now() + timeoutMs;
    while (this.processes.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    for (const process of this.processes.values()) {
      process.destroy();
    }
    this.processes.clear();
  }

  /** After a restart, streams that were live cannot be trusted — mark them failed. */
  recoverInterrupted(): void {
    const { repos, logger } = this.deps;
    for (const id of repos.streams.listInterrupted()) {
      const stream = repos.streams.get(id);
      if (!stream) continue;
      for (const sd of stream.destinations) {
        if (!TERMINAL_STREAM_STATUSES.includes(sd.status)) {
          repos.streamDestinations.update(sd.id, {
            status: 'FAILED',
            errorMessage: 'Interrupted by application restart',
            endedAt: nowIso(),
          });
        }
      }
      repos.streams.updateStatus(id, 'FAILED', {
        endedAt: nowIso(),
        errorMessage: 'Interrupted by application restart',
      });
      logger.warn(`Marked stream ${id} as FAILED (interrupted by application restart)`);
    }
  }

  private async startDestination(stream: Stream, sd: Stream['destinations'][number], inputPath: string): Promise<boolean> {
    const { repos, config, adapters } = this.deps;
    const adapter = adapters[sd.platform];
    try {
      const raw = sd.destinationId ? repos.destinations.getRaw(sd.destinationId) : null;
      if (!raw) throw new Error('The destination has been removed');
      const credentials = decryptJson<DestinationCredentials>(
        config.encryptionKey,
        raw.encrypted_credentials as string,
      );
      const outputUrl = adapter.buildOutputUrl(credentials);
      await assertPublicRtmpTarget(outputUrl, config.allowPrivateRtmpTargets);

      const args = buildStreamArgs({
        inputPath,
        outputUrl,
        loopMode: stream.loopMode,
        loopCount: stream.loopCount,
        videoBitrateKbps: config.videoBitrateKbps,
        audioBitrateKbps: config.audioBitrateKbps,
        preset: config.ffmpegPreset,
        fps: config.videoFps,
      });

      const process = new FFmpegStreamProcess({
        ffmpegPath: this.deps.ffmpegPath!,
        args,
        redact: [credentials.streamKey, outputUrl],
        retryDelaysMs: config.retryDelaysMs,
      });
      this.processes.set(sd.id, process);
      process.on('event', (event: FFmpegProcessEvent) => this.onProcessEvent(stream.id, sd.id, event));

      repos.streamDestinations.update(sd.id, { status: 'STARTING', errorMessage: null });
      this.log(stream.id, sd.id, 'info', `Starting ${adapter.label} → ${sd.destinationName}`);
      process.start();
      return true;
    } catch (error) {
      const message = error instanceof AppError || error instanceof Error
        ? error.message
        : 'Failed to start destination';
      repos.streamDestinations.update(sd.id, { status: 'FAILED', errorMessage: message, endedAt: nowIso() });
      this.log(stream.id, sd.id, 'error', message);
      this.publish({ type: 'stream.error', data: { streamId: stream.id, destinationId: sd.id, message } });
      return false;
    }
  }

  private onProcessEvent(streamId: string, destinationRowId: string, event: FFmpegProcessEvent): void {
    const { repos } = this.deps;
    switch (event.event) {
      case 'running': {
        const ts = nowIso();
        repos.streamDestinations.update(destinationRowId, { status: 'RUNNING', startedAt: ts, errorMessage: null });
        this.log(streamId, destinationRowId, 'info', 'Connected — streaming');
        const stream = repos.streams.get(streamId);
        if (!stream) break;
        if (stream.status !== 'RUNNING') {
          repos.streams.updateStatus(streamId, 'RUNNING', { startedAt: stream.startedAt ?? ts });
          this.deps.repos.audit.add({ userId: stream.userId, action: 'stream.started', detail: stream.title });
          this.publish({ type: 'stream.started', data: repos.streams.get(streamId) });
        } else {
          this.publish({ type: 'stream.status', data: stream });
        }
        break;
      }
      case 'progress': {
        const now = Date.now();
        const last = this.lastMetricsPersist.get(destinationRowId) ?? 0;
        if (now - last >= METRICS_PERSIST_INTERVAL_MS) {
          this.lastMetricsPersist.set(destinationRowId, now);
          repos.streamDestinations.update(destinationRowId, {
            metrics: {
              fps: event.fps,
              bitrateKbps: event.bitrateKbps,
              streamedSeconds: event.streamedSeconds,
              updatedAt: nowIso(),
            },
          });
          const stream = repos.streams.get(streamId);
          if (stream) this.publish({ type: 'stream.status', data: stream });
        }
        break;
      }
      case 'log': {
        this.log(streamId, destinationRowId, 'info', event.line);
        break;
      }
      case 'reconnecting': {
        repos.streamDestinations.update(destinationRowId, {
          status: 'RECONNECTING',
          reconnectCount: event.attempt,
        });
        this.log(streamId, destinationRowId, 'warn', `Reconnecting (attempt ${event.attempt}) — ${event.reason}`);
        this.publish({
          type: 'stream.reconnecting',
          data: { streamId, destinationId: destinationRowId, attempt: event.attempt, delayMs: event.delayMs },
        });
        break;
      }
      case 'stopped': {
        this.processes.delete(destinationRowId);
        repos.streamDestinations.update(destinationRowId, { status: 'STOPPED', endedAt: nowIso() });
        this.log(streamId, destinationRowId, 'info', 'Destination stopped');
        this.finalizeIfDone(streamId);
        break;
      }
      case 'completed': {
        this.processes.delete(destinationRowId);
        repos.streamDestinations.update(destinationRowId, { status: 'COMPLETED', endedAt: nowIso() });
        this.log(streamId, destinationRowId, 'info', 'Video finished — destination completed');
        this.finalizeIfDone(streamId);
        break;
      }
      case 'failed': {
        this.processes.delete(destinationRowId);
        repos.streamDestinations.update(destinationRowId, {
          status: 'FAILED',
          errorMessage: event.reason,
          endedAt: nowIso(),
        });
        this.log(streamId, destinationRowId, 'error', event.reason);
        this.publish({
          type: 'stream.error',
          data: { streamId, destinationId: destinationRowId, message: event.reason },
        });
        this.finalizeIfDone(streamId);
        break;
      }
    }
  }

  private finalizeIfDone(streamId: string): void {
    const { repos } = this.deps;
    const stream = repos.streams.get(streamId);
    if (!stream) return;
    const statuses = stream.destinations.map((d) => d.status);
    if (statuses.length === 0 || !statuses.every((s) => TERMINAL_STREAM_STATUSES.includes(s))) return;
    if (TERMINAL_STREAM_STATUSES.includes(stream.status)) return;

    let final: StreamStatus;
    let errorMessage: string | null = null;
    if (statuses.includes('FAILED')) {
      final = 'FAILED';
      errorMessage =
        stream.destinations.find((d) => d.status === 'FAILED')?.errorMessage ?? 'One or more destinations failed';
    } else if (statuses.includes('STOPPED')) {
      final = 'STOPPED';
    } else {
      final = 'COMPLETED';
    }

    repos.streams.updateStatus(streamId, final, { endedAt: nowIso(), errorMessage });
    this.deps.repos.audit.add({ userId: stream.userId, action: `stream.${final.toLowerCase()}`, detail: stream.title });
    this.log(streamId, null, final === 'COMPLETED' ? 'info' : 'warn', `Stream ${final.toLowerCase()}`);
    const updated = repos.streams.get(streamId)!;
    const eventType: ServerEventType =
      final === 'COMPLETED' ? 'stream.completed' : final === 'STOPPED' ? 'stream.stopped' : 'stream.error';
    this.publish({ type: eventType, data: updated });
    this.publish({ type: 'stream.status', data: updated });
    this.deps.logger.info(`Stream ${streamId} finished: ${final}`);
  }

  private log(
    streamId: string,
    streamDestinationId: string | null,
    level: StreamLogEntry['level'],
    message: string,
  ): void {
    this.deps.repos.logs.add({ streamId, streamDestinationId, level, message });
  }

  private publish(event: Omit<ServerEvent, 'ts'>): void {
    this.deps.bus.publish(event);
  }
}
