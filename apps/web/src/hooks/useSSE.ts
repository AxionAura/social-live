import { useEffect, useRef } from 'react';
import type { ServerEvent, ServerEventType } from '@social-live/shared';

const EVENT_TYPES: ServerEventType[] = [
  'stream.created',
  'stream.starting',
  'stream.started',
  'stream.status',
  'stream.reconnecting',
  'stream.error',
  'stream.stopped',
  'stream.completed',
  'stream.deleted',
  'video.created',
  'video.updated',
  'video.deleted',
  'destination.created',
  'destination.updated',
  'destination.deleted',
  'notification',
];

/** Subscribe to the server's SSE channel with automatic cleanup. */
export function useSSE(onEvent: (event: ServerEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const source = new EventSource('/api/events');
    const listeners: [ServerEventType, (event: MessageEvent) => void][] = EVENT_TYPES.map((type) => {
      const listener = (event: MessageEvent) => {
        try {
          handlerRef.current(JSON.parse(event.data) as ServerEvent);
        } catch {
          // malformed payload — ignore
        }
      };
      source.addEventListener(type, listener as EventListener);
      return [type, listener];
    });
    return () => {
      for (const [type, listener] of listeners) {
        source.removeEventListener(type, listener as EventListener);
      }
      source.close();
    };
  }, []);
}
