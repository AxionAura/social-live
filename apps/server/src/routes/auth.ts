import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SafeUser } from '@social-live/shared';
import { loginSchema, passwordChangeSchema, setupSchema } from '@social-live/shared';
import { hashPassword, verifyPassword } from '../lib/crypto.js';
import { LOGIN_LOCK_MS, MAX_LOGIN_FAILURES, SESSION_COOKIE } from '../lib/constants.js';
import { badRequest, conflict, forbidden, tooManyRequests, unauthorized } from '../lib/errors.js';
import { requireAuth, currentUser } from '../plugins/auth.js';
import { parseBody } from '../lib/validate.js';

interface LoginGuard {
  count: number;
  lockedUntil: number;
}

const loginGuards = new Map<string, LoginGuard>();

function setSessionCookie(reply: FastifyReply, req: FastifyRequest, sessionId: string): void {
  const { config } = req.server.sl;
  reply.setCookie(SESSION_COOKIE, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: req.protocol === 'https',
    signed: true,
    maxAge: config.sessionTtlHours * 3600,
  });
}

function createSession(req: FastifyRequest, userId: string): string {
  const { repos, config } = req.server.sl;
  return repos.sessions.create({
    userId,
    ttlHours: config.sessionTtlHours,
    userAgent: req.headers['user-agent'] ?? null,
    ip: req.ip,
  });
}

export function registerAuthRoutes(app: FastifyInstance): void {
  const { repos } = app.sl;

  app.get('/api/auth/status', async (req) => {
    return { needsSetup: repos.users.count() === 0, user: req.user };
  });

  app.post(
    '/api/auth/setup',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      if (repos.users.count() > 0) {
        throw forbidden('The administrator account already exists. Log in instead.');
      }
      const input = parseBody(setupSchema, req.body);
      if (repos.users.byUsername(input.username)) {
        throw conflict('This username is already taken');
      }
      const user = repos.users.create({
        username: input.username,
        email: input.email ? input.email : null,
        passwordHash: hashPassword(input.password),
      });
      repos.audit.add({ userId: user.id, action: 'admin.created', detail: user.username, ip: req.ip });
      setSessionCookie(reply, req, createSession(req, user.id));
      reply.status(201);
      return { user };
    },
  );

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const input = parseBody(loginSchema, req.body);
      const guardKey = `${req.ip}|${input.username.toLowerCase()}`;
      const now = Date.now();
      const guard = loginGuards.get(guardKey);
      if (guard && guard.lockedUntil > now) {
        throw tooManyRequests(
          'Too many failed attempts. This account is temporarily locked — try again in a few minutes.',
        );
      }

      const user = repos.users.byUsername(input.username);
      const passwordOk = user ? verifyPassword(input.password, user.passwordHash) : false;
      if (!user || !passwordOk) {
        const previous = guard && guard.lockedUntil <= now ? 0 : guard?.count ?? 0;
        const count = previous + 1;
        loginGuards.set(guardKey, {
          count,
          lockedUntil: count >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_MS : 0,
        });
        repos.audit.add({ userId: user?.id ?? null, action: 'login.failed', detail: input.username, ip: req.ip });
        throw unauthorized('Invalid username or password');
      }

      loginGuards.delete(guardKey);
      setSessionCookie(reply, req, createSession(req, user.id));
      repos.audit.add({ userId: user.id, action: 'login.success', ip: req.ip });
      const safeUser: SafeUser = {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt,
      };
      return { user: safeUser };
    },
  );

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    if (req.sessionId) {
      repos.sessions.revoke(req.sessionId);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    repos.audit.add({ userId: req.user!.id, action: 'logout', ip: req.ip });
    return { ok: true };
  });

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req) => {
    const input = parseBody(passwordChangeSchema, req.body);
    const me = currentUser(req);
    const user = repos.users.byUsername(me.username);
    if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
      throw badRequest('The current password is incorrect');
    }
    repos.users.setPassword(user.id, hashPassword(input.newPassword));
    // Keep the current session, revoke every other one.
    repos.sessions.revokeAllForUser(user.id, req.sessionId ?? undefined);
    repos.audit.add({ userId: user.id, action: 'password.changed', ip: req.ip });
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    return { user: currentUser(req) };
  });
}
