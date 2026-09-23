import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import type { Platform, PlatformAdapter } from '@social-live/shared';
import { facebookAdapter } from '@social-live/facebook';
import { youtubeAdapter } from '@social-live/youtube';
import { Database, createRepos } from '@social-live/database';
import { resolveFfmpeg, resolveFfprobe } from '@social-live/streaming';
import { loadConfig, type AppConfig } from './config.js';
import { Logger } from './lib/logger.js';
import { EventBus } from './lib/bus.js';
import { AppError } from './lib/errors.js';
import { StreamOrchestrator } from './services/orchestrator.js';
import { Scheduler } from './services/scheduler.js';
import { sessionHook } from './plugins/auth.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerVideoRoutes } from './routes/videos.js';
import { registerDestinationRoutes } from './routes/destinations.js';
import { registerStreamRoutes } from './routes/streams.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerSystemRoutes } from './routes/system.js';
import { registerEventsRoute } from './routes/events.js';
import type { ServerContext } from './types.js';

const adapters: Record<Platform, PlatformAdapter> = {
  youtube: youtubeAdapter,
  facebook: facebookAdapter,
};

export interface BuildAppOptions {
  config?: AppConfig;
  logger?: Logger;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? new Logger(config.logLevel);

  const db = new Database(config.dbPath);
  const repos = createRepos(db);
  const bus = new EventBus();

  const ffmpeg = resolveFfmpeg(config.ffmpegPath);
  const ffprobe = resolveFfprobe(config.ffprobePath);
  if (!ffmpeg) {
    logger.warn('FFmpeg was not found — streaming will be unavailable until it is installed or FFMPEG_PATH is set');
  }

  const orchestrator = new StreamOrchestrator({
    config,
    repos,
    bus,
    logger,
    adapters,
    ffmpegPath: ffmpeg?.path ?? null,
  });
  const scheduler = new Scheduler({ repos, orchestrator, logger });

  const context: ServerContext = {
    config,
    db,
    repos,
    bus,
    logger,
    orchestrator,
    scheduler,
    adapters,
    ffmpegPath: ffmpeg?.path ?? null,
    ffmpegVersion: ffmpeg?.version ?? null,
    ffprobePath: ffprobe?.path ?? null,
  };

  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024,
    trustProxy: true,
  });
  app.decorate('sl', context);

  /* ── security headers ── */
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: config.isProduction ? { maxAge: 15_552_000 } : false,
  });

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    const contentType = String(reply.getHeader('content-type') ?? '');
    if (contentType.includes('text/html')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    }
    return payload;
  });

  await app.register(cookie, { secret: config.sessionSecret });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadSize,
      files: 1,
    },
  });

  /* ── session parsing ── */
  app.addHook('onRequest', sessionHook);

  /* ── routes ── */
  registerAuthRoutes(app);
  registerVideoRoutes(app);
  registerDestinationRoutes(app);
  registerStreamRoutes(app);
  registerDashboardRoutes(app);
  registerSystemRoutes(app);
  registerEventsRoute(app);

  /* ── SPA static files ── */
  const webDist = config.webDistDir;
  if (webDist && existsSync(join(webDist, 'index.html'))) {
    // wildcard keeps the /* route resolving files per-request, so a rebuilt
    // dashboard (new hashed assets) is picked up without a server restart.
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (
        req.raw.url?.startsWith('/api/') ||
        req.raw.url === '/health' ||
        req.raw.url === '/ready'
      ) {
        return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Route not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    logger.warn(`Web dashboard not found at ${webDist ?? '(unset)'} — API-only mode. Build apps/web first.`);
  }

  /* ── error mapping ── */
  app.setErrorHandler((error: FastifyError, req, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.statusCode >= 500 ? 'Internal Server Error' : 'Request Failed',
        message: error.message,
      });
    }
    if (error.name === 'ZodError') {
      return reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body' });
    }
    if (error.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.validation[0]?.message ?? 'Invalid request',
      });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: 'Request Failed',
        message: error.message.length < 300 ? error.message : 'Request failed',
      });
    }
    logger.error(`Unhandled error on ${req.method} ${req.raw.url}`, {
      error: error.stack ?? String(error),
    });
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong. Check the server logs for details.',
    });
  });

  app.addHook('onClose', async () => {
    scheduler.stop();
    await orchestrator.shutdown();
    db.close();
    logger.info('SocialLive stopped');
  });

  return app;
}
