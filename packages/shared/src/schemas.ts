import { z } from 'zod';
import { LOOP_MODES, PLATFORMS, PRIVACY_OPTIONS, START_MODES } from './constants.js';

/** Shared primitives */
const idSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(120);
const streamKeySchema = z
  .string()
  .trim()
  .min(4)
  .max(256)
  .regex(/^[A-Za-z0-9_\-=/+.]+$/, 'Stream key contains invalid characters');
const ingestUrlSchema = z
  .string()
  .trim()
  .url()
  .regex(/^rtmps?:\/\//i, 'Ingest URL must start with rtmp:// or rtmps://');
const isoDateTimeSchema = z
  .string()
  .datetime({ offset: true })
  .refine((v) => Date.parse(v) > Date.now() + 30_000, 'Scheduled time must be in the future');

/** POST /api/auth/setup */
export const setupSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, digits, dot, dash and underscore'),
    email: z.string().trim().email().max(254).optional().or(z.literal('')),
    password: z.string().min(8, 'Password must be at least 8 characters').max(256),
  })
  .strict();

/** POST /api/auth/login */
export const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

/** POST /api/auth/password */
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(256),
  })
  .strict();

/** POST /api/destinations */
export const createDestinationSchema = z
  .object({
    platform: z.enum(PLATFORMS),
    name: nameSchema,
    streamKey: streamKeySchema,
    /** Optional override of the platform default ingest URL. */
    streamUrl: ingestUrlSchema.optional().or(z.literal('')),
  })
  .strict();

/** PATCH /api/destinations/:id */
export const updateDestinationSchema = z
  .object({
    name: nameSchema.optional(),
    streamKey: streamKeySchema.optional(),
    streamUrl: ingestUrlSchema.optional().or(z.literal('')),
  })
  .strict();

/** POST /api/streams */
export const createStreamSchema = z
  .object({
    videoId: idSchema,
    destinationIds: z.array(idSchema).min(1, 'Select at least one destination').max(10),
    title: z.string().trim().min(1, 'Title is required').max(200),
    description: z.string().trim().max(5000).default(''),
    privacy: z.enum(PRIVACY_OPTIONS).default('unlisted'),
    startMode: z.enum(START_MODES).default('now'),
    /** Required when startMode is "schedule". ISO 8601 with timezone. */
    scheduledAt: isoDateTimeSchema.optional(),
    loopMode: z.enum(LOOP_MODES).default('none'),
    /** Required when loopMode is "times". */
    loopCount: z.number().int().min(2).max(1000).optional(),
  })
  .strict()
  .refine((v) => v.startMode !== 'schedule' || v.scheduledAt !== undefined, {
    message: 'scheduledAt is required when startMode is "schedule"',
    path: ['scheduledAt'],
  })
  .refine((v) => v.loopMode !== 'times' || v.loopCount !== undefined, {
    message: 'loopCount is required when loopMode is "times"',
    path: ['loopCount'],
  });

/** PATCH /api/videos/:id */
export const updateVideoSchema = z.object({ name: nameSchema }).strict();

export type SetupInput = z.infer<typeof setupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PasswordChangeInput = z.infer<typeof passwordChangeSchema>;
export type CreateDestinationInput = z.infer<typeof createDestinationSchema>;
export type UpdateDestinationInput = z.infer<typeof updateDestinationSchema>;
export type CreateStreamInput = z.infer<typeof createStreamSchema>;
export type UpdateVideoInput = z.infer<typeof updateVideoSchema>;
