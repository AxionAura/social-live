import { EventEmitter } from 'node:events';
import type { ServerEvent } from '@social-live/shared';

/**
 * In-process publish/subscribe bus feeding the SSE channel and other
 * listeners. V1 runs a single process; the interface is ready for a
 * distributed worker setup later.
 */
export class EventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(200);
  }

  publish(event: Omit<ServerEvent, 'ts'>): void {
    this.emitter.emit('server-event', { ...event, ts: new Date().toISOString() });
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.emitter.on('server-event', listener);
    return () => this.emitter.off('server-event', listener);
  }
}
