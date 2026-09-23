import { spawnSync } from 'node:child_process';

export interface BinaryInfo {
  path: string;
  version: string | null;
}

/**
 * Resolve an FFmpeg-family binary. Prefers the explicitly configured path,
 * otherwise falls back to the command name on PATH.
 * Returns null when the binary cannot be executed.
 */
export function resolveBinary(configuredPath: string | undefined, fallbackName: string): BinaryInfo | null {
  const candidates = configuredPath ? [configuredPath] : [fallbackName];
  for (const candidate of candidates) {
    try {
      const result = spawnSync(candidate, ['-version'], { timeout: 10_000, windowsHide: true });
      if (result.status === 0) {
        const output = result.stdout?.toString() ?? '';
        const match = output.match(/version\s+(\S+)/);
        return { path: candidate, version: match?.[1] ?? null };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function resolveFfmpeg(configuredPath?: string): BinaryInfo | null {
  return resolveBinary(configuredPath, 'ffmpeg');
}

export function resolveFfprobe(configuredPath?: string): BinaryInfo | null {
  return resolveBinary(configuredPath, 'ffprobe');
}
