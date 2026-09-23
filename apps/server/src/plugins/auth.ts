import type { FastifyReply, FastifyRequest } from 'fastify';
import type { SafeUser } from '@social-live/shared';
import { unauthorized } from '../lib/errors.js';
import { SESSION_COOKIE } from '../lib/constants.js';

/** Parse + validate the session cookie on every request. */
export async function sessionHook(req: FastifyRequest): Promise<void> {
  req.user = null;
  req.sessionId = null;
  const cookieValue = req.cookies[SESSION_COOKIE];
  if (!cookieValue) return;
  const unsigned = req.unsignCookie(cookieValue);
  if (!unsigned.valid || !unsigned.value) return;
  const session = req.server.sl.repos.sessions.findActive(unsigned.value);
  if (!session) return;
  req.user = {
    id: session.id,
    username: session.username,
    email: session.email,
    createdAt: session.createdAt,
  };
  req.sessionId = unsigned.value;
}

export async function requireAuth(req: FastifyRequest): Promise<void> {
  if (!req.user) {
    throw unauthorized();
  }
}

export function currentUser(req: FastifyRequest): SafeUser {
  if (!req.user) throw unauthorized();
  return req.user;
}
