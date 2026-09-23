import type { DestinationConfigInput, PlatformAdapter } from '@social-live/shared';

const DEFAULT_INGEST = 'rtmps://a.rtmp.youtube.com/live2';

/**
 * YouTube Live adapter (manual stream-key mode).
 *
 * RTMP(S) publishing cannot set title/description/privacy — those are
 * configured in YouTube Studio when the broadcast is created. The adapter
 * interface keeps the door open for the OAuth (Live Streaming API) workflow
 * where metadata can be managed programmatically.
 */
export const youtubeAdapter: PlatformAdapter = {
  platform: 'youtube',
  label: 'YouTube Live',
  defaultIngestUrl: DEFAULT_INGEST,
  keyHelpUrl: 'https://www.youtube.com/live_dashboard',
  keyHelpText: 'YouTube Studio → Create → Go live → Streaming software: copy the stream key.',
  validateConfig(config: DestinationConfigInput) {
    if (!config.streamKey || config.streamKey.length < 4) {
      return { ok: false as const, error: 'YouTube stream key is required' };
    }
    return { ok: true as const };
  },
  buildOutputUrl(config: DestinationConfigInput): string {
    const base = (config.streamUrl?.trim() || DEFAULT_INGEST).replace(/\/+$/, '');
    return `${base}/${config.streamKey}`;
  },
};
