import { connect as netConnect } from 'node:net';
import type { FastifyInstance } from 'fastify';
import type { Destination, DestinationConfigInput, DestinationCredentials, Platform } from '@social-live/shared';
import { createDestinationSchema, updateDestinationSchema } from '@social-live/shared';
import type { Row } from '@social-live/database';
import { newId } from '@social-live/database';
import { assertPublicRtmpTarget } from '@social-live/streaming';
import { decryptJson, encryptJson } from '../lib/crypto.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { requireAuth, currentUser } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';
import type { ServerContext } from '../types.js';

/** Build the public DTO — decrypted ingest URL, key masked (never included). */
function destinationDTO(ctx: ServerContext, raw: Row): Destination {
  const credentials = decryptJson<DestinationCredentials>(
    ctx.config.encryptionKey,
    raw.encrypted_credentials as string,
  );
  return {
    id: raw.id as string,
    userId: raw.user_id as string,
    platform: raw.platform as Platform,
    name: raw.name as string,
    status: raw.status as Destination['status'],
    streamUrl: credentials.streamUrl ?? null,
    hasStreamKey: Boolean(credentials.streamKey),
    createdAt: raw.created_at as string,
    updatedAt: raw.updated_at as string,
  };
}

async function validateAndEncrypt(
  ctx: ServerContext,
  platform: Platform,
  streamKey: string,
  streamUrlOverride?: string,
): Promise<string> {
  const adapter = ctx.adapters[platform];
  const candidate: DestinationConfigInput = {
    streamKey,
    streamUrl: streamUrlOverride || adapter.defaultIngestUrl,
  };
  const validation = adapter.validateConfig(candidate);
  if (!validation.ok) {
    throw badRequest(validation.error);
  }
  const outputUrl = adapter.buildOutputUrl(candidate);
  try {
    await assertPublicRtmpTarget(outputUrl, ctx.config.allowPrivateRtmpTargets);
  } catch (error) {
    throw badRequest(error instanceof Error ? error.message : 'Invalid streaming target');
  }
  return encryptJson(ctx.config.encryptionKey, {
    streamUrl: candidate.streamUrl as string,
    streamKey,
  });
}

export function registerDestinationRoutes(app: FastifyInstance): void {
  const { repos, config, bus, adapters } = app.sl;

  app.get('/api/destinations', { preHandler: requireAuth }, async (req) => {
    const userId = currentUser(req).id;
    return { items: repos.destinations.listRaw(userId).map((raw) => destinationDTO(app.sl, raw)) };
  });

  app.post(
    '/api/destinations',
    { preHandler: requireAuth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = parseBody(createDestinationSchema, req.body);
      const adapter = adapters[input.platform];
      const encrypted = await validateAndEncrypt(app.sl, input.platform, input.streamKey, input.streamUrl || undefined);
      const destination = repos.destinations.create({
        id: newId(),
        userId: currentUser(req).id,
        platform: input.platform,
        name: input.name,
        encryptedCredentials: encrypted,
      });
      repos.audit.add({
        userId: destination.userId,
        action: 'destination.added',
        detail: `${adapter.label}: ${destination.name}`,
        ip: req.ip,
      });
      const raw = repos.destinations.getRaw(destination.id)!;
      const dto = destinationDTO(app.sl, raw);
      bus.publish({ type: 'destination.created', data: dto });
      reply.status(201);
      return dto;
    },
  );

  app.get('/api/destinations/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const raw = repos.destinations.getRaw(id);
    if (!raw || raw.user_id !== currentUser(req).id) throw notFound('Destination not found');
    return destinationDTO(app.sl, raw);
  });

  app.patch('/api/destinations/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const raw = repos.destinations.getRaw(id);
    if (!raw || raw.user_id !== currentUser(req).id) throw notFound('Destination not found');
    const input = parseBody(updateDestinationSchema, req.body);

    const fields: { name?: string; encryptedCredentials?: string } = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.streamKey !== undefined || input.streamUrl !== undefined) {
      const existing = decryptJson<DestinationCredentials>(config.encryptionKey, raw.encrypted_credentials as string);
      fields.encryptedCredentials = await validateAndEncrypt(
        app.sl,
        raw.platform as Platform,
        input.streamKey ?? existing.streamKey,
        input.streamUrl !== undefined ? input.streamUrl || undefined : existing.streamUrl,
      );
    }
    repos.destinations.update(id, fields);
    repos.audit.add({
      userId: currentUser(req).id,
      action: 'destination.updated',
      detail: raw.name as string,
      ip: req.ip,
    });
    const dto = destinationDTO(app.sl, repos.destinations.getRaw(id)!);
    bus.publish({ type: 'destination.updated', data: dto });
    return dto;
  });

  /** Return the decrypted stream key (UI "Reveal"). Heavily rate limited + audited. */
  app.post(
    '/api/destinations/:id/reveal',
    { preHandler: requireAuth, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = req.params as { id: string };
      const raw = repos.destinations.getRaw(id);
      if (!raw || raw.user_id !== currentUser(req).id) throw notFound('Destination not found');
      const credentials = decryptJson<DestinationCredentials>(config.encryptionKey, raw.encrypted_credentials as string);
      repos.audit.add({
        userId: currentUser(req).id,
        action: 'destination.credentials_revealed',
        detail: raw.name as string,
        ip: req.ip,
      });
      return { streamUrl: credentials.streamUrl ?? null, streamKey: credentials.streamKey };
    },
  );

  /** TCP reachability probe of the ingest endpoint (no credentials sent). */
  app.post(
    '/api/destinations/:id/test',
    { preHandler: requireAuth, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } },
    async (req) => {
      const { id } = req.params as { id: string };
      const raw = repos.destinations.getRaw(id);
      if (!raw || raw.user_id !== currentUser(req).id) throw notFound('Destination not found');
      const credentials = decryptJson<DestinationCredentials>(config.encryptionKey, raw.encrypted_credentials as string);
      const adapter = adapters[raw.platform as Platform];
      const outputUrl = adapter.buildOutputUrl(credentials);
      const target = await assertPublicRtmpTarget(outputUrl, config.allowPrivateRtmpTargets).catch((error) => {
        throw badRequest(error instanceof Error ? error.message : 'Invalid streaming target');
      });

      const started = Date.now();
      const reachable = await new Promise<boolean>((resolve) => {
        const socket = netConnect({ host: target.host, port: target.port });
        socket.setTimeout(5_000);
        socket.once('connect', () => {
          socket.destroy();
          resolve(true);
        });
        socket.once('timeout', () => {
          socket.destroy();
          resolve(false);
        });
        socket.once('error', () => resolve(false));
      });
      return { ok: reachable, latencyMs: reachable ? Date.now() - started : null, host: target.host, port: target.port };
    },
  );

  app.delete('/api/destinations/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const raw = repos.destinations.getRaw(id);
    if (!raw || raw.user_id !== currentUser(req).id) throw notFound('Destination not found');

    const activeStreams = repos.streams.listActive(currentUser(req).id);
    if (activeStreams.some((s) => s.destinations.some((d) => d.destinationId === id))) {
      throw conflict('This destination is used by an active stream. Stop the stream first.');
    }

    repos.destinations.delete(id);
    repos.audit.add({
      userId: currentUser(req).id,
      action: 'destination.removed',
      detail: raw.name as string,
      ip: req.ip,
    });
    bus.publish({ type: 'destination.deleted', data: { id } });
    return { ok: true };
  });
}
