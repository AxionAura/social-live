import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';

/**
 * Server-Sent Events channel: stream.*, video.* and destination.* events
 * push live updates to the dashboard. Cookies authenticate the connection,
 * so the browser does not need to expose any token to JS.
 */
export function registerEventsRoute(app: FastifyInstance): void {
  app.get('/api/events', { preHandler: requireAuth }, async (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (payload: string): void => {
      try {
        res.write(payload);
      } catch {
        // connection already gone
      }
    };

    send(`event: hello\ndata: ${JSON.stringify({ type: 'hello', ts: new Date().toISOString() })}\n\n`);

    const unsubscribe = app.sl.bus.subscribe((event) => {
      send(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    const heartbeat = setInterval(() => send(`: ping ${Date.now()}\n\n`), 15_000);
    heartbeat.unref();

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
