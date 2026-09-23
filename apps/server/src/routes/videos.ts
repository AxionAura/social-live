import { createReadStream } from 'node:fs';
import { createWriteStream, renameSync, statSync, unlinkSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance } from 'fastify';
import type { Video } from '@social-live/shared';
import { ALLOWED_VIDEO_EXTENSIONS, updateVideoSchema } from '@social-live/shared';
import { newId } from '@social-live/database';
import { AppError, badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAuth, currentUser } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import { generateThumbnail, probeVideo, validateMagicBytes } from '../services/upload.js';

function sanitizeDisplayName(input: string): string {
  const withoutPath = basename(input);
  const cleaned = withoutPath.replace(/[/\\?%*:|"<>\u0000-\u001f]/g, '').trim();
  return (cleaned || 'video').slice(0, 120);
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

export function registerVideoRoutes(app: FastifyInstance): void {
  const { repos, config, bus } = app.sl;

  app.get('/api/videos', { preHandler: requireAuth }, async (req) => {
    const query = req.query as {
      search?: string;
      sort?: string;
      order?: string;
      page?: string;
      pageSize?: string;
    };
    const page = Math.max(1, Math.floor(Number(query.page)) || 1);
    const pageSize = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize)) || 24));
    const search = query.search?.trim() || undefined;
    const items = repos.videos.list({
      search,
      sort: query.sort,
      order: query.order,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    const total = repos.videos.countListed(search);
    return { items, total, page, pageSize };
  });

  app.post(
    '/api/videos',
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const file = await req.file({ limits: { fileSize: config.maxUploadSize, files: 1 } });
      if (!file) {
        throw badRequest('No file was uploaded');
      }

      const originalName = basename(file.filename || 'video.mp4');
      const extension = extname(originalName).toLowerCase();
      if (!(ALLOWED_VIDEO_EXTENSIONS as readonly string[]).includes(extension)) {
        throw badRequest(
          `Unsupported file type "${extension || '(none)'}". Allowed: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`,
        );
      }

      const videoId = newId();
      const tempPath = join(config.dataDir, 'tmp', `upload-${videoId}${extension}`);
      let tooLarge = false;
      file.file.on('limit', () => {
        tooLarge = true;
      });

      try {
        await pipeline(file.file, createWriteStream(tempPath));
      } catch (error) {
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore
        }
        if (tooLarge) {
          throw new AppError(413, `File exceeds the maximum upload size (${formatBytes(config.maxUploadSize)})`);
        }
        throw error;
      }
      if (tooLarge) {
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore
        }
        throw new AppError(413, `File exceeds the maximum upload size (${formatBytes(config.maxUploadSize)})`);
      }

      const thumbnailPath = join(config.dataDir, 'thumbnails', `${videoId}.jpg`);
      try {
        if (!validateMagicBytes(tempPath)) {
          throw badRequest('File signature check failed — this is not a valid video file');
        }
        const ffprobePath = app.sl.ffprobePath;
        if (!ffprobePath) {
          throw badRequest('FFprobe is not available. See Settings → Diagnostics.');
        }
        const probe = await probeVideo(ffprobePath, tempPath);
        if (!probe) {
          throw badRequest('Could not read video metadata — the file may be corrupted');
        }
        const thumbnailOk = await generateThumbnail(
          app.sl.ffmpegPath!,
          tempPath,
          thumbnailPath,
          probe.duration ? Math.min(10, probe.duration * 0.1) : 1,
        );
        const finalPath = join(config.dataDir, 'videos', `${videoId}${extension}`);
        renameSync(tempPath, finalPath);

        const video = repos.videos.create({
          id: videoId,
          userId: currentUser(req).id,
          name: sanitizeDisplayName(originalName.replace(/\.[^.]+$/, '')),
          originalName,
          storagePath: `${videoId}${extension}`,
          fileSize: statSync(finalPath).size,
          duration: probe.duration,
          resolution: probe.resolution,
          codec: probe.codec,
          hasThumbnail: thumbnailOk,
        });
        bus.publish({ type: 'video.created', data: video });
        repos.audit.add({ userId: video.userId, action: 'video.uploaded', detail: video.name, ip: req.ip });
        reply.status(201);
        return video;
      } catch (error) {
        try {
          unlinkSync(tempPath);
        } catch {
          // ignore
        }
        try {
          unlinkSync(thumbnailPath);
        } catch {
          // ignore
        }
        throw error;
      }
    },
  );

  app.get('/api/videos/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const video = repos.videos.get(id);
    if (!video || video.userId !== currentUser(req).id) throw notFound('Video not found');
    return video;
  });

  app.get('/api/videos/:id/thumbnail', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const video = repos.videos.get(id);
    if (!video || video.userId !== currentUser(req).id || !video.hasThumbnail) {
      throw notFound('Thumbnail not found');
    }
    const thumbnailPath = join(config.dataDir, 'thumbnails', `${id}.jpg`);
    reply.type('image/jpeg');
    return createReadStream(thumbnailPath);
  });

  app.patch('/api/videos/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const video = repos.videos.get(id);
    if (!video || video.userId !== currentUser(req).id) throw notFound('Video not found');
    const input = parseBody(updateVideoSchema, req.body);
    repos.videos.rename(id, input.name);
    const updated = repos.videos.get(id)!;
    bus.publish({ type: 'video.updated', data: updated });
    return updated;
  });

  app.delete('/api/videos/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const video = repos.videos.get(id);
    if (!video || video.userId !== currentUser(req).id) throw notFound('Video not found');
    if (repos.videos.referencedByActiveStream(id)) {
      throw conflict('This video is used by an active stream. Stop the stream first.');
    }
    try {
      unlinkSync(join(config.dataDir, 'videos', video.storagePath));
    } catch {
      // file may already be gone
    }
    try {
      unlinkSync(join(config.dataDir, 'thumbnails', `${id}.jpg`));
    } catch {
      // thumbnail may not exist
    }
    repos.videos.delete(id);
    bus.publish({ type: 'video.deleted', data: { id } });
    repos.audit.add({ userId: currentUser(req).id, action: 'video.deleted', detail: video.name, ip: req.ip });
    return { ok: true };
  });
}
