import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface FFmpegRunOptions {
  ffmpegPath: string;
  args: string[];
  /** Secrets to redact from captured log output (stream key, target URL …). */
  redact: string[];
  /** Reconnect delays in ms. Index i is used for attempt i+1. */
  retryDelaysMs: number[];
  /** Grace period for a graceful stop before SIGKILL (default 10s). */
  stopGraceMs?: number;
  /** Kill + reconnect when no progress line is seen for this long (default 90s; 0 disables). */
  stallTimeoutMs?: number;
}

export type FFmpegProcessEvent =
  | { event: 'starting' }
  | { event: 'running' }
  | {
      event: 'progress';
      fps: number | null;
      bitrateKbps: number | null;
      streamedSeconds: number | null;
    }
  | { event: 'log'; line: string }
  | { event: 'reconnecting'; attempt: number; delayMs: number; reason: string }
  | { event: 'stopped' }
  | { event: 'completed' }
  | { event: 'failed'; reason: string };

const PROGRESS_THROTTLE_MS = 2_000;

/**
 * Manages a single FFmpeg publishing process with automatic reconnect,
 * progress parsing and secret redaction. One instance = one destination.
 *
 * Listeners subscribe via `process.on('event', (e: FFmpegProcessEvent) => …)`.
 */
export class FFmpegStreamProcess extends EventEmitter {
  private readonly options: FFmpegRunOptions;
  private child: ChildProcess | null = null;
  private stderrBuffer = '';
  private attempt = 0;
  private userStopRequested = false;
  private finished = false;
  private running = false;
  private runningNotified = false;
  private stopTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stallTimer: NodeJS.Timeout | null = null;
  private lastProgressEmit = 0;

  constructor(options: FFmpegRunOptions) {
    super();
    this.options = options;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentAttempt(): number {
    return this.attempt;
  }

  start(): void {
    if (this.finished || this.running || this.reconnectTimer) return;
    this.userStopRequested = false;
    this.attempt = 0;
    this.spawnOnce();
  }

  /** Request a graceful stop (SIGINT → SIGKILL after grace period). */
  stop(): void {
    if (this.finished) return;
    this.userStopRequested = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      // A pending reconnect was cancelled — treat as stopped.
      this.finish(() => ({ event: 'stopped' }));
      return;
    }
    if (this.child) {
      this.clearStallTimer();
      try {
        this.child.kill('SIGINT');
      } catch {
        // process may have exited already
      }
      const grace = this.options.stopGraceMs ?? 10_000;
      this.stopTimer = setTimeout(() => {
        try {
          this.child?.kill('SIGKILL');
        } catch {
          // already dead
        }
      }, grace);
    } else if (!this.running) {
      this.finish(() => ({ event: 'stopped' }));
    }
  }

  /** Force-stop without grace, used on application shutdown. */
  destroy(): void {
    this.stop();
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    try {
      this.child?.kill('SIGKILL');
    } catch {
      // already dead
    }
  }

  private spawnOnce(): void {
    this.running = true;
    this.runningNotified = false;

    const child = spawn(this.options.ffmpegPath, this.options.args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    this.armStallTimer();

    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString();
      const lines = this.stderrBuffer.split(/\r?\n|\r/);
      this.stderrBuffer = lines.pop() ?? '';
      for (const line of lines) {
        this.handleStderrLine(line);
      }
    });

    child.on('error', (error) => {
      // Spawn failure (e.g. binary missing) — terminal.
      this.running = false;
      this.finish(() => ({ event: 'failed' as const, reason: `Failed to start FFmpeg: ${error.message}` }));
    });

    child.on('exit', (code, signal) => {
      this.running = false;
      this.clearStallTimer();
      if (this.stopTimer) {
        clearTimeout(this.stopTimer);
        this.stopTimer = null;
      }
      this.child = null;

      if (this.userStopRequested) {
        this.finish(() => ({ event: 'stopped' as const }));
        return;
      }

      if (code === 0 && !signal) {
        this.finish(() => ({ event: 'completed' as const }));
        return;
      }

      const reason = signal
        ? `FFmpeg terminated by signal ${signal}`
        : `FFmpeg exited with code ${code}`;

      const delays = this.options.retryDelaysMs;
      if (this.attempt < delays.length) {
        this.attempt += 1;
        const delayMs = delays[this.attempt - 1];
        this.dispatch({ event: 'reconnecting', attempt: this.attempt, delayMs, reason });
        this.reconnectTimer = setTimeout(() => {
          this.reconnectTimer = null;
          if (!this.userStopRequested && !this.finished) {
            this.spawnOnce();
          }
        }, delayMs);
      } else {
        this.finish(() => ({
          event: 'failed' as const,
          reason: `${reason} after ${delays.length} reconnect attempts`,
        }));
      }
    });
  }

  private handleStderrLine(rawLine: string): void {
    const line = this.redact(rawLine);
    if (!line.trim()) return;

    const progress = parseProgress(line);
    if (progress) {
      if (!this.runningNotified && !this.userStopRequested) {
        // First status line = the output opened successfully.
        this.runningNotified = true;
        this.dispatch({ event: 'running' });
      }
      this.running = true;
      this.clearStallTimer();
      this.armStallTimer();
      const now = Date.now();
      if (now - this.lastProgressEmit >= PROGRESS_THROTTLE_MS) {
        this.lastProgressEmit = now;
        this.dispatch({ event: 'progress', ...progress });
      }
      return;
    }

    this.dispatch({ event: 'log', line });
  }

  private redact(text: string): string {
    let out = text;
    for (const secret of this.options.redact) {
      if (secret && secret.length > 2) {
        out = out.split(secret).join('••••••••');
      }
    }
    return out;
  }

  private armStallTimer(): void {
    this.clearStallTimer();
    const ms = this.options.stallTimeoutMs ?? 90_000;
    if (ms <= 0) return;
    this.stallTimer = setTimeout(() => {
      if (!this.running || this.userStopRequested) return;
      this.dispatch({ event: 'log', line: 'No output progress detected — restarting the stream process' });
      try {
        this.child?.kill('SIGKILL');
      } catch {
        // already dead
      }
    }, ms);
  }

  private clearStallTimer(): void {
    if (this.stallTimer) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private finish(finalEvent: () => FFmpegProcessEvent): void {
    if (this.finished) return;
    this.finished = true;
    this.clearStallTimer();
    setImmediate(() => {
      this.dispatch(finalEvent());
      this.removeAllListeners();
    });
  }

  private dispatch(event: FFmpegProcessEvent): void {
    this.emit('event', event);
  }
}

export interface ProgressSnapshot {
  fps: number | null;
  bitrateKbps: number | null;
  streamedSeconds: number | null;
}

/**
 * Parse an FFmpeg status line such as:
 * frame= 1200 fps= 30 q=28.0 size= 1234kB time=00:00:40.00 bitrate= 253.1kbits/s speed=1.01x
 */
export function parseProgress(line: string): ProgressSnapshot | null {
  if (!/frame=\s*\d+/.test(line) || !/time=/.test(line)) return null;

  const timeMatch = line.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  let streamedSeconds: number | null = null;
  if (timeMatch) {
    streamedSeconds = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]);
  }

  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  const fps = fpsMatch ? Number(fpsMatch[1]) : null;

  let bitrateKbps: number | null = null;
  const kbitMatch = line.match(/bitrate=\s*([\d.]+)\s*kbits\/s/);
  if (kbitMatch) {
    bitrateKbps = Number(kbitMatch[1]);
  } else {
    const mbitMatch = line.match(/bitrate=\s*([\d.]+)\s*Mbits\/s/);
    if (mbitMatch) bitrateKbps = Math.round(Number(mbitMatch[1]) * 1000);
  }

  return { fps, bitrateKbps, streamedSeconds };
}
