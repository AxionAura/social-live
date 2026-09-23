import type { DestinationConfigInput, PlatformAdapter } from '@social-live/shared';

const DEFAULT_INGEST = 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app';

/**
 * Kick adapter (manual stream-key mode).
 *
 * Kick publishes through an IVS contribution endpoint. If Kick shows a
 * region-specific ingest URL in the Creator Dashboard, override the default
 * ingest URL on the destination.
 */
export const kickAdapter: PlatformAdapter = {
  platform: 'kick',
  label: 'Kick',
  defaultIngestUrl: DEFAULT_INGEST,
  keyHelpUrl: 'https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com',
  keyHelpText: 'Kick Creator Dashboard → Settings → Stream Key: copy the stream key.',
  validateConfig(config: DestinationConfigInput) {
    if (!config.streamKey || config.streamKey.length < 4) {
      return { ok: false as const, error: 'Kick stream key is required' };
    }
    return { ok: true as const };
  },
  buildOutputUrl(config: DestinationConfigInput): string {
    const base = (config.streamUrl?.trim() || DEFAULT_INGEST).replace(/\/+$/, '');
    return `${base}/${config.streamKey}`;
  },
};
