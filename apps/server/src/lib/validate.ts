import type { ZodType } from 'zod';
import { badRequest } from './errors.js';

/** Validate a request body against a shared zod schema. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw badRequest(issue ? `${issue.message}` : 'Invalid request body');
  }
  return result.data;
}
