import type { Repos } from '@social-live/database';
import type { Logger } from '../lib/logger.js';
import type { StreamOrchestrator } from './orchestrator.js';

interface SchedulerDeps {
  repos: Repos;
  orchestrator: StreamOrchestrator;
  logger: Logger;
}

/**
 * Background scheduler: starts QUEUED streams when their scheduled time
 * arrives. Runs inside the application process — the browser does not need
 * to be open for scheduled streams to fire.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly deps: SchedulerDeps) {}

  start(intervalMs = 5_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      if (this.running) return;
      this.running = true;
      this.tick()
        .catch((error) => this.deps.logger.error('Scheduler tick failed', { error: String(error) }))
        .finally(() => {
          this.running = false;
        });
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    const due = this.deps.repos.streams.listDueScheduled();
    for (const streamId of due) {
      try {
        this.deps.logger.info(`Scheduler starting scheduled stream ${streamId}`);
        await this.deps.orchestrator.start(streamId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Scheduled start failed';
        this.deps.repos.streams.updateStatus(streamId, 'FAILED', { endedAt: null, errorMessage: message });
        this.deps.repos.logs.add({ streamId, level: 'error', message });
        this.deps.logger.error(`Scheduled stream ${streamId} failed: ${message}`);
      }
    }
  }
}
