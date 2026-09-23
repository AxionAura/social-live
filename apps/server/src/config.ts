import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isAbsolute, join, resolve } from 'node:path';
import { scryptSync } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  dbPath: string;
  webDistDir: string | null;
  ffmpegPath?: string;
  ffprobePath?: string;
  sessionSecret: string;
  encryptionKey: Buffer;
  maxUploadSize: number;
  maxConcurrentStreams: number;
  maxReconnectAttempts: number;
  retryDelaysMs: number[];
  sessionTtlHours: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  ffmpegPreset: string;
  videoFps: number;
  allowPrivateRtmpTargets: boolean;
  logLevel: LogLevel;
  isProduction: boolean;
  version: string;
}

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function intEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function parseDatabaseUrl(value: string | undefined, dataDir: string): string {
  if (!value) return join(dataDir, 'database', 'app.db');
  if (value.startsWith('sqlite:')) {
    const path = value.slice('sqlite:'.length);
    return isAbsolute(path) ? path : resolve(path);
  }
  if (value.startsWith('postgres')) {
    throw new Error(
      'PostgreSQL support is planned for a future release. SocialLive V1 ships with SQLite; unset DATABASE_URL to use the default.',
    );
  }
  return isAbsolute(value) ? value : resolve(value);
}

function loadOrCreateSecret(path: string): string {
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8').trim();
    if (existing.length >= 32) return existing;
  }
  const secret = randomBytes(48).toString('hex');
  writeFileSync(path, secret, { mode: 0o600 });
  process.stderr.write(
    `[social-live] No SESSION_SECRET configured — generated a random secret at ${path}. ` +
      'Set SESSION_SECRET in your environment to keep sessions valid across restarts.\n',
  );
  return secret;
}

function loadOrCreateEncryptionKey(path: string): Buffer {
  if (existsSync(path)) {
    const existing = readFileSync(path, 'utf8').trim();
    if (existing.length >= 32) {
      return deriveKeyFromMaterial(existing);
    }
  }
  const key = randomBytes(32).toString('base64');
  writeFileSync(path, key, { mode: 0o600 });
  process.stderr.write(
    `[social-live] No ENCRYPTION_KEY configured — generated a random key at ${path}. ` +
      'BACK UP this key: credentials cannot be recovered without it.\n',
  );
  return deriveKeyFromMaterial(key);
}

function deriveKeyFromMaterial(material: string): Buffer {
  return scryptSync(material, 'sociallive:encryption:v1', 32);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = resolve(env.DATA_DIR ?? './data');
  for (const sub of ['videos', 'thumbnails', 'logs', 'tmp', 'config', 'database']) {
    mkdirSync(join(dataDir, sub), { recursive: true });
  }

  const logLevel = LOG_LEVELS.includes(env.LOG_LEVEL as LogLevel) ? (env.LOG_LEVEL as LogLevel) : 'info';

  const webDistDir = env.WEB_DIST_DIR
    ? resolve(env.WEB_DIST_DIR)
    : fileURLToPath(new URL('../../web/dist', import.meta.url));

  return {
    host: env.APP_HOST ?? '0.0.0.0',
    port: intEnv(env.APP_PORT, 3000),
    dataDir,
    dbPath: parseDatabaseUrl(env.DATABASE_URL, dataDir),
    webDistDir,
    ffmpegPath: env.FFMPEG_PATH || undefined,
    ffprobePath: env.FFPROBE_PATH || undefined,
    sessionSecret: env.SESSION_SECRET && env.SESSION_SECRET.length >= 16
      ? env.SESSION_SECRET
      : loadOrCreateSecret(join(dataDir, 'config', 'session-secret.key')),
    encryptionKey: env.ENCRYPTION_KEY && env.ENCRYPTION_KEY.length >= 16
      ? deriveKeyFromMaterial(env.ENCRYPTION_KEY)
      : loadOrCreateEncryptionKey(join(dataDir, 'config', 'encryption.key')),
    maxUploadSize: intEnv(env.MAX_UPLOAD_SIZE, 5 * 1024 * 1024 * 1024),
    maxConcurrentStreams: intEnv(env.MAX_CONCURRENT_STREAMS, 4),
    maxReconnectAttempts: intEnv(env.MAX_RECONNECT_ATTEMPTS, 5),
    retryDelaysMs: (env.RETRY_DELAYS ?? '5,10,20,30,60')
      .split(',')
      .map((v) => Number(v.trim()) * 1000)
      .filter((n) => Number.isFinite(n) && n > 0),
    sessionTtlHours: intEnv(env.SESSION_TTL_HOURS, 168),
    videoBitrateKbps: intEnv(env.VIDEO_BITRATE_KBPS, 4500),
    audioBitrateKbps: intEnv(env.AUDIO_BITRATE_KBPS, 128),
    ffmpegPreset: env.FFMPEG_PRESET ?? 'veryfast',
    videoFps: intEnv(env.VIDEO_FPS, 30),
    allowPrivateRtmpTargets: env.ALLOW_PRIVATE_RTMP_TARGETS === 'true',
    logLevel,
    isProduction: env.NODE_ENV === 'production',
    version: '0.2.1',
  };
}
