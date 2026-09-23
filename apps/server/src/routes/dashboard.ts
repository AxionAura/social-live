import type { FastifyInstance } from 'fastify';
import { requireAuth, currentUser } from '../plugins/auth.js';

export function registerDashboardRoutes(app: FastifyInstance): void {
  const { repos } = app.sl;

  app.get('/api/dashboard', { preHandler: requireAuth }, async (req) => {
    const userId = currentUser(req).id;
    return {
      stats: {
        activeStreams: repos.streams.countActive(),
        connectedPlatforms: repos.destinations.countDistinctPlatforms(userId),
        videos: repos.videos.count(),
        completedStreams: repos.streams.countByStatus('COMPLETED'),
      },
      activeStreams: repos.streams.listActive(userId),
    };
  });
}
