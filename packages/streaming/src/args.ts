import type { LoopMode } from '@social-live/shared';

export interface StreamArgsOptions {
  inputPath: string;
  outputUrl: string;
  loopMode: LoopMode;
  loopCount?: number | null;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  /** x264 speed preset: ultrafast … veryslow (default veryfast). */
  preset: string;
  /** Output frame rate forced on the encoder (default 30 — platforms such as Kick require 30/60). */
  fps?: number;
}

/**
 * Build the FFmpeg argument list for one publishing process.
 *
 * The array is passed to child_process.spawn with shell:false, so no user
 * input is ever interpreted by a shell (command injection safe by design).
 */
export function buildStreamArgs(options: StreamArgsOptions): string[] {
  const args: string[] = ['-hide_banner', '-loglevel', 'info', '-nostdin', '-re'];

  if (options.loopMode === 'infinite') {
    args.push('-stream_loop', '-1');
  } else if (options.loopMode === 'times' && (options.loopCount ?? 0) > 1) {
    // -stream_loop N replays the input N extra times.
    args.push('-stream_loop', String(options.loopCount! - 1));
  }

  args.push('-i', options.inputPath);

  const maxRate = options.videoBitrateKbps;
  args.push(
    '-c:v', 'libx264',
    '-preset', options.preset,
    '-tune', 'zerolatency',
    '-pix_fmt', 'yuv420p',
    '-b:v', `${options.videoBitrateKbps}k`,
    '-maxrate', `${maxRate}k`,
    '-bufsize', `${maxRate * 2}k`,
    '-r', String(options.fps ?? 30),
    '-g', String((options.fps ?? 30) * 2),
    '-c:a', 'aac',
    '-b:a', `${options.audioBitrateKbps}k`,
    '-ar', '44100',
    '-ac', '2',
    '-f', 'flv',
    options.outputUrl,
  );

  return args;
}
