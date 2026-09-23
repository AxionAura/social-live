import type { DestinationConfigInput, PlatformAdapter } from '@social-live/shared';

const DEFAULT_INGEST = 'rtmps://live.twitch.tv:443/app';

/**
 * Twitch adapter (manual stream-key mode).
 *
 * RTMPS publishing cannot set title/category — those are configured in the
 * Twitch Creator Dashboard. The adapter interface keeps the door open for the
 * Helix API workflow where broadcast metadata can be managed programmatically.
 */
export const twitchAdapter: PlatformAdapter = {
  platform: 'twitch',
  label: 'Twitch',
  defaultIngestUrl: DEFAULT_INGEST,
  keyHelpUrl: 'https://dashboard.twitch.tv/settings/stream',
  keyHelpText: 'Twitch Creator Dashboard → Settings → Stream: copy the primary stream key.',
  validateConfig(config: DestinationConfigInput) {
    if (!config.streamKey || config.streamKey.length < 4) {
      return { ok: false as const, error: 'Twitch stream key is required' };
    }
    return { ok: true as const };
  },
  buildOutputUrl(config: DestinationConfigInput): string {
    const base = (config.streamUrl?.trim() || DEFAULT_INGEST).replace(/\/+$/, '');
    return `${base}/${config.streamKey}`;
  },
};
