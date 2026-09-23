import type { DestinationConfigInput, PlatformAdapter } from '@social-live/shared';

const DEFAULT_INGEST = 'rtmps://live-api-s.facebook.com:443/rtmp/';

/**
 * Facebook Live adapter (manual stream-key mode).
 * Uses the persistent/one-off stream key from Meta Live Producer.
 */
export const facebookAdapter: PlatformAdapter = {
  platform: 'facebook',
  label: 'Facebook Live',
  defaultIngestUrl: DEFAULT_INGEST,
  keyHelpUrl: 'https://www.facebook.com/live/production',
  keyHelpText: 'Facebook Live Producer → Streaming software: copy the stream key.',
  validateConfig(config: DestinationConfigInput) {
    if (!config.streamKey || config.streamKey.length < 4) {
      return { ok: false as const, error: 'Facebook stream key is required' };
    }
    return { ok: true as const };
  },
  buildOutputUrl(config: DestinationConfigInput): string {
    const base = (config.streamUrl?.trim() || DEFAULT_INGEST).replace(/\/+$/, '');
    return `${base}/${config.streamKey}`;
  },
};
