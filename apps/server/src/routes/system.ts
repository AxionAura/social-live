import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../plugins/auth.js';
import { runDiagnostics, systemInfo } from '../services/doctor.js';

export function registerSystemRoutes(app: FastifyInstance): void {
  const { config, repos } = app.sl;

  app.get('/health', async () => ({ status: 'ok', name: 'SocialLive', version: config.version }));

  app.get('/ready', async () => {
    const dbOk = (() => {
      try {
        repos.users.count();
        return true;
      } catch {
        return false;
      }
    })();
    const ffmpegOk = Boolean(app.sl.ffmpegPath);
    return {
      status: dbOk && ffmpegOk ? 'ok' : 'degraded',
      checks: { database: dbOk, ffmpeg: ffmpegOk },
    };
  });

  app.get('/api/system/info', { preHandler: requireAuth }, async () => {
    return systemInfo(config, app.sl.ffmpegVersion);
  });

  app.get('/api/system/diagnostics', { preHandler: requireAuth }, async () => {
    return { items: await runDiagnostics(config, repos, { checkPort: false }) };
  });

  app.get('/api/audit', { preHandler: requireAuth }, async (req) => {
    const query = req.query as { limit?: string };
    const limit = Math.min(500, Math.max(1, Math.floor(Number(query.limit)) || 100));
    return { items: repos.audit.list(limit) };
  });
}
