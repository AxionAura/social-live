import type { FastifyInstance } from 'fastify';
import type { Platform, StreamStatus } from '@social-live/shared';
import { createStreamSchema, TERMINAL_STREAM_STATUSES } from '@social-live/shared';
import { newId } from '@social-live/database';
import { badRequest, notFound } from '../lib/errors.js';
import { requireAuth, currentUser } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import { assertOwned } from '../types.js';

export function registerStreamRoutes(app: FastifyInstance): void {
  const { repos, bus } = app.sl;

  app.get('/api/streams', { preHandler: requireAuth }, async (req) => {
    const query = req.query as {
      status?: string;
      platform?: string;
      from?: string;
      to?: string;
      search?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Math.floor(Number(query.page)) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize)) || 20));
    const { items, total } = repos.streams.list({
      status: query.status,
      platform: query.platform,
      from: query.from,
      to: query.to,
      search: query.search?.trim() || undefined,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    // V1 is single-user; every stream belongs to the requesting admin.
    return { items, total, page, pageSize };
  });

  app.post(
    '/api/streams',
    { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = parseBody(createStreamSchema, req.body);
      const userId = currentUser(req).id;

      const video = repos.videos.get(input.videoId);
      if (!video || video.userId !== userId) throw notFound('Video not found');
      if (video.status !== 'READY') throw badRequest('The selected video is not ready');

      const seen = new Set<string>();
      const destinations = input.destinationIds.map((destinationId) => {
        if (seen.has(destinationId)) throw badRequest('Duplicate destinations selected');
        seen.add(destinationId);
        const raw = repos.destinations.getRaw(destinationId);
        if (!raw || raw.user_id !== userId) throw notFound('One of the selected destinations was not found');
        return {
          destinationId,
          platform: raw.platform as Platform,
          name: raw.name as string,
        };
      });

      const status: StreamStatus = input.startMode === 'schedule' ? 'QUEUED' : 'CREATED';
      const stream = repos.streams.createWithDestinations(
        {
          id: newId(),
          userId,
          videoId: video.id,
          videoName: video.name,
          title: input.title,
          description: input.description ?? '',
          privacy: input.privacy ?? 'unlisted',
          status,
          loopMode: input.loopMode ?? 'none',
          loopCount: input.loopMode === 'times' ? input.loopCount ?? null : null,
          scheduledAt: input.scheduledAt ?? null,
        },
        destinations,
      );

      repos.audit.add({ userId, action: 'stream.created', detail: stream.title, ip: req.ip });
      bus.publish({ type: 'stream.created', data: stream });
      reply.status(201);
      return stream;
    },
  );

  app.get('/api/streams/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const stream = repos.streams.get(id);
    if (!stream || stream.userId !== currentUser(req).id) throw notFound('Stream not found');
    return stream;
  });

  app.get('/api/streams/:id/status', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const stream = repos.streams.get(id);
    if (!stream || stream.userId !== currentUser(req).id) throw notFound('Stream not found');
    return {
      status: stream.status,
      startedAt: stream.startedAt,
      endedAt: stream.endedAt,
      destinations: stream.destinations.map((d) => ({
        id: d.id,
        platform: d.platform,
        status: d.status,
        reconnectCount: d.reconnectCount,
        lastMetrics: d.lastMetrics,
      })),
    };
  });

  app.get('/api/streams/:id/logs', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const stream = repos.streams.get(id);
    if (!stream || stream.userId !== currentUser(req).id) throw notFound('Stream not found');
    return { items: repos.logs.list(id, 300) };
  });

  app.post(
    '/api/streams/:id/start',
    { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = req.params as { id: string };
      const stream = repos.streams.get(id);
      if (!stream || stream.userId !== currentUser(req).id) throw notFound('Stream not found');
      const started = await app.sl.orchestrator.start(id);
      return started;
    },
  );

  app.post(
    '/api/streams/:id/stop',
    { preHandler: requireAuth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = req.params as { id: string };
      const stream = repos.streams.get(id);
      if (!stream || stream.userId !== currentUser(req).id) throw notFound('Stream not found');
      return app.sl.orchestrator.stop(id);
    },
  );

  app.delete('/api/streams/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const stream = repos.streams.get(id);
    if (!stream || stream.userId !== currentUser(req).id) throw notFound('Stream not found');
    if (!TERMINAL_STREAM_STATUSES.includes(stream.status)) {
      throw badRequest('Only finished streams can be deleted. Stop the stream first.');
    }
    repos.streams.delete(id);
    bus.publish({ type: 'stream.deleted', data: { id } });
    repos.audit.add({ userId: currentUser(req).id, action: 'stream.deleted', detail: stream.title, ip: req.ip });
    return { ok: true };
  });
}
