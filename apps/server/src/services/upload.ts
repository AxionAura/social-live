import { spawn } from 'node:child_process';
import { openSync, readSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export interface ProbeResult {
  duration: number | null;
  resolution: string | null;
  codec: string | null;
}

/** Container signature check: MP4/MOV (ftyp box) or Matroska/WebM (EBML). */
export function validateMagicBytes(filePath: string): boolean {
  let header: Buffer;
  try {
    const fd = openSync(filePath, 'r');
    try {
      header = Buffer.alloc(12);
      const bytesRead = readSync(fd, header, 0, 12, 0);
      if (bytesRead < 12) return false;
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
  if (header.subarray(4, 8).toString('latin1') === 'ftyp') return true; // MP4 / MOV
  return header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3; // Matroska / WebM
}

interface FfprobeOutput {
  format?: { duration?: string };
  streams?: {
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
  }[];
}

/**
 * Extract metadata with ffprobe. Resolves null when the file cannot be
 * probed (corrupt file, ffprobe missing, …).
 */
export function probeVideo(ffprobePath: string, filePath: string): Promise<ProbeResult | null> {
  return new Promise((resolve) => {
    const child = spawn(
      ffprobePath,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true },
    );
    let stdout = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      if (code !== 0) return resolve(null);
      try {
        const parsed = JSON.parse(stdout) as FfprobeOutput;
        const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
        if (!videoStream) return resolve(null);
        resolve({
          duration: parsed.format?.duration ? Number(parsed.format.duration) : null,
          resolution:
            videoStream.width && videoStream.height ? `${videoStream.width}x${videoStream.height}` : null,
          codec: videoStream.codec_name ?? null,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/** Grab a single frame as a JPEG thumbnail. Resolves false on any failure. */
export function generateThumbnail(
  ffmpegPath: string,
  filePath: string,
  outputPath: string,
  atSeconds: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    mkdirSync(dirname(outputPath), { recursive: true });
    const child = spawn(
      ffmpegPath,
      [
        '-hide_banner', '-loglevel', 'error', '-nostdin',
        '-ss', Math.max(0, atSeconds).toFixed(2),
        '-i', filePath,
        '-frames:v', '1',
        '-vf', 'scale=640:-2',
        '-y', outputPath,
      ],
      { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true, timeout: 30_000 },
    );
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}
