export const PLATFORMS = ['youtube', 'facebook', 'twitch', 'kick'] as const;

export type Platform = (typeof PLATFORMS)[number];

export type StreamStatus =
  | 'CREATED'
  | 'QUEUED'
  | 'STARTING'
  | 'RUNNING'
  | 'RECONNECTING'
  | 'STOPPING'
  | 'STOPPED'
  | 'COMPLETED'
  | 'FAILED';

export const STREAM_STATUS_TRANSITIONS: Record<StreamStatus, StreamStatus[]> = {
  CREATED: ['QUEUED', 'STARTING', 'STOPPED', 'FAILED'],
  QUEUED: ['STARTING', 'STOPPED'],
  STARTING: ['RUNNING', 'STOPPING', 'FAILED'],
  RUNNING: ['RECONNECTING', 'STOPPING', 'FAILED', 'COMPLETED'],
  RECONNECTING: ['RUNNING', 'STOPPING', 'FAILED'],
  STOPPING: ['STOPPED', 'FAILED'],
  STOPPED: [],
  COMPLETED: [],
  FAILED: [],
};

/** Streams considered "live or about to be live" for concurrency limits and dashboard. */
export const ACTIVE_STREAM_STATUSES: StreamStatus[] = ['STARTING', 'RUNNING', 'RECONNECTING', 'STOPPING'];

export const TERMINAL_STREAM_STATUSES: StreamStatus[] = ['STOPPED', 'COMPLETED', 'FAILED'];

export const STREAM_DESTINATION_STATUS_TRANSITIONS: Record<StreamDestinationStatus, StreamDestinationStatus[]> = {
  CREATED: ['STARTING', 'FAILED'],
  STARTING: ['RUNNING', 'RECONNECTING', 'STOPPING', 'FAILED'],
  RUNNING: ['RECONNECTING', 'STOPPING', 'COMPLETED', 'FAILED'],
  RECONNECTING: ['RUNNING', 'STOPPING', 'FAILED'],
  STOPPING: ['STOPPED', 'FAILED'],
  STOPPED: [],
  COMPLETED: [],
  FAILED: [],
};

export type StreamDestinationStatus =
  | 'CREATED'
  | 'STARTING'
  | 'RUNNING'
  | 'RECONNECTING'
  | 'STOPPING'
  | 'STOPPED'
  | 'COMPLETED'
  | 'FAILED';

/** User-facing status metadata used by both server and dashboard. */
export const STREAM_STATUS_META: Record<StreamStatus, { label: string; color: string }> = {
  CREATED: { label: 'Created', color: 'default' },
  QUEUED: { label: 'Scheduled', color: 'info' },
  STARTING: { label: 'Starting', color: 'warning' },
  RUNNING: { label: 'Live', color: 'error' },
  RECONNECTING: { label: 'Reconnecting', color: 'warning' },
  STOPPING: { label: 'Stopping', color: 'warning' },
  STOPPED: { label: 'Stopped', color: 'default' },
  COMPLETED: { label: 'Completed', color: 'success' },
  FAILED: { label: 'Failed', color: 'error' },
};

export const PRIVACY_OPTIONS = ['public', 'unlisted', 'private'] as const;
export type Privacy = (typeof PRIVACY_OPTIONS)[number];

export const LOOP_MODES = ['none', 'times', 'infinite'] as const;
export type LoopMode = (typeof LOOP_MODES)[number];

export const START_MODES = ['now', 'schedule'] as const;
export type StartMode = (typeof START_MODES)[number];

/** Allowed video container extensions for upload. */
export const ALLOWED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv'] as const;

export const DEFAULT_RETRY_DELAYS_SECONDS = [5, 10, 20, 30, 60];

export const APP_NAME = 'SocialLive';

/** Platform metadata for dashboards and documentation (adapter details live server-side). */
export const PLATFORM_META: Record<
  Platform,
  { label: string; defaultIngestUrl: string; keyHelpUrl: string; keyHelpText: string }
> = {
  youtube: {
    label: 'YouTube Live',
    defaultIngestUrl: 'rtmps://a.rtmp.youtube.com/live2',
    keyHelpUrl: 'https://www.youtube.com/live_dashboard',
    keyHelpText: 'YouTube Studio → Create → Go live → Streaming software: copy the stream key.',
  },
  facebook: {
    label: 'Facebook Live',
    defaultIngestUrl: 'rtmps://live-api-s.facebook.com:443/rtmp/',
    keyHelpUrl: 'https://www.facebook.com/live/production',
    keyHelpText: 'Facebook Live Producer → Streaming software: copy the stream key.',
  },
  twitch: {
    label: 'Twitch',
    defaultIngestUrl: 'rtmps://live.twitch.tv:443/app',
    keyHelpUrl: 'https://dashboard.twitch.tv/settings/stream',
    keyHelpText: 'Twitch Creator Dashboard → Settings → Stream: copy the primary stream key.',
  },
  kick: {
    label: 'Kick',
    defaultIngestUrl: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app',
    keyHelpUrl: 'https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com',
    keyHelpText: 'Kick Creator Dashboard → Settings → Stream Key: copy the stream key.',
  },
};
