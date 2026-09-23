import type { Platform, PlatformAdapter, SafeUser, Stream } from '@social-live/shared';
import type { Database, Repos } from '@social-live/database';
import type { AppConfig } from './config.js';
import type { EventBus } from './lib/bus.js';
import type { Logger } from './lib/logger.js';
import type { Scheduler } from './services/scheduler.js';
import type { StreamOrchestrator } from './services/orchestrator.js';

export interface ServerContext {
  config: AppConfig;
  db: Database;
  repos: Repos;
  bus: EventBus;
  logger: Logger;
  orchestrator: StreamOrchestrator;
  scheduler: Scheduler;
  adapters: Record<Platform, PlatformAdapter>;
  ffmpegPath: string | null;
  ffmpegVersion: string | null;
  ffprobePath: string | null;
}

declare module 'fastify' {
  interface FastifyInstance {
    sl: ServerContext;
  }
  interface FastifyRequest {
    user: SafeUser | null;
    sessionId: string | null;
  }
}

/** Streams owned by another user are treated as non-existent. */
export function assertOwned(stream: Stream, userId: string): Stream | null {
  return stream.userId === userId ? stream : null;
}
