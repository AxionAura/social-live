import { accessSync, constants, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import type { DiagnosticCheck, SystemInfo } from '@social-live/shared';
import { resolveFfmpeg, resolveFfprobe } from '@social-live/streaming';
import type { AppConfig } from '../config.js';
import type { Repos } from '@social-live/database';

function nodeVersionOk(): boolean {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 13);
}

export function systemInfo(config: AppConfig, ffmpegVersion: string | null): SystemInfo {
  return {
    name: 'SocialLive',
    version: config.version,
    nodeVersion: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    dataDir: config.dataDir,
    ffmpegPath: resolveFfmpeg(config.ffmpegPath)?.path ?? null,
    ffmpegVersion,
    ffprobePath: resolveFfprobe(config.ffprobePath)?.path ?? null,
    maxUploadSize: config.maxUploadSize,
    maxConcurrentStreams: config.maxConcurrentStreams,
    https: config.isProduction,
  };
}

/**
 * Self-hosted diagnostics ("doctor"). Run with checkPort=true before the
 * server binds (CLI), false when called from the running API.
 */
export async function runDiagnostics(
  config: AppConfig,
  repos: Repos,
  options: { checkPort: boolean },
): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];

  checks.push({
    name: 'Runtime',
    ok: nodeVersionOk(),
    detail: `Node.js ${process.versions.node} (${process.platform}/${process.arch})`,
    hint: nodeVersionOk() ? null : 'Node.js 22.13+ is required for the built-in SQLite driver.',
  });

  const dbOk = (() => {
    try {
      repos.users.count();
      return true;
    } catch {
      return false;
    }
  })();
  checks.push({
    name: 'Database',
    ok: dbOk,
    detail: dbOk ? `SQLite at ${config.dbPath}` : 'Database is not reachable',
    hint: dbOk ? null : 'Check that the data directory is writable and the disk is not full.',
  });

  const ffmpeg = resolveFfmpeg(config.ffmpegPath);
  checks.push({
    name: 'FFmpeg',
    ok: Boolean(ffmpeg),
    detail: ffmpeg ? `${ffmpeg.path} (version ${ffmpeg.version ?? 'unknown'})` : 'FFmpeg not found',
    hint: ffmpeg
      ? null
      : 'Install FFmpeg (e.g. apt install ffmpeg / pkg install ffmpeg / choco install ffmpeg) or set FFMPEG_PATH.',
  });

  const ffprobe = resolveFfprobe(config.ffprobePath);
  checks.push({
    name: 'FFprobe',
    ok: Boolean(ffprobe),
    detail: ffprobe ? ffprobe.path : 'FFprobe not found',
    hint: ffprobe ? null : 'FFprobe ships with FFmpeg. If you use FFMPEG_PATH, also set FFPROBE_PATH.',
  });

  const storageOk = (() => {
    const probeFile = join(config.dataDir, 'tmp', `.doctor-${Date.now()}`);
    try {
      accessSync(config.dataDir, constants.W_OK);
      writeFileSync(probeFile, 'probe');
      unlinkSync(probeFile);
      return true;
    } catch {
      try {
        unlinkSync(probeFile);
      } catch {
        // nothing to clean up
      }
      return false;
    }
  })();
  checks.push({
    name: 'Storage',
    ok: storageOk,
    detail: storageOk ? `${config.dataDir} is writable` : `${config.dataDir} is not writable`,
    hint: storageOk ? null : `Grant write permission on ${config.dataDir} to the user running SocialLive.`,
  });

  checks.push({
    name: 'Encryption',
    ok: true,
    detail: 'Master encryption key loaded (credentials are encrypted at rest)',
    hint: 'Back up DATA_DIR/config/encryption.key — without it stored credentials cannot be recovered.',
  });

  if (options.checkPort) {
    const portFree = await new Promise<boolean>((resolve) => {
      const tester = createServer();
      tester.once('error', () => resolve(false));
      tester.once('listening', () => tester.close(() => resolve(true)));
      tester.listen(config.port, config.host);
    });
    checks.push({
      name: 'Port',
      ok: portFree,
      detail: portFree ? `Port ${config.port} is available` : `Port ${config.port} is already in use`,
      hint: portFree ? null : `Stop the other process or set APP_PORT to a free port.`,
    });
  }

  return checks;
}
