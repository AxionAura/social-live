import type { Platform, StreamStatus, StreamDestinationStatus } from './constants.js';

/** Public shape of a user (never includes password hash). */
export interface SafeUser {
  id: string;
  username: string;
  email: string | null;
  createdAt: string;
}

export interface Video {
  id: string;
  userId: string;
  name: string;
  originalName: string;
  /** File name inside DATA_DIR/videos (generated, never user-controlled). */
  storagePath: string;
  fileSize: number;
  duration: number | null;
  resolution: string | null;
  codec: string | null;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  hasThumbnail: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Destination {
  id: string;
  userId: string;
  platform: Platform;
  name: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  /** Masked representation, safe to display. Never contains the real key. */
  streamUrl: string | null;
  hasStreamKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StreamMetrics {
  fps: number | null;
  bitrateKbps: number | null;
  streamedSeconds: number | null;
  updatedAt: string;
}

export interface StreamDestination {
  id: string;
  streamId: string;
  /** Null when the origin destination was deleted (history snapshot kept). */
  destinationId: string | null;
  platform: Platform;
  destinationName: string;
  status: StreamDestinationStatus;
  reconnectCount: number;
  lastMetrics: StreamMetrics | null;
  startedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;
}

export interface Stream {
  id: string;
  userId: string;
  /** Null when the origin video was deleted (history snapshot kept). */
  videoId: string | null;
  videoName: string | null;
  title: string;
  description: string;
  privacy: 'public' | 'unlisted' | 'private';
  status: StreamStatus;
  loopMode: 'none' | 'times' | 'infinite';
  loopCount: number | null;
  scheduledAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  destinations: StreamDestination[];
}

export interface StreamLogEntry {
  id: number;
  streamId: string;
  streamDestinationId: string | null;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: number;
  userId: string | null;
  action: string;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

export interface DashboardStats {
  activeStreams: number;
  connectedPlatforms: number;
  videos: number;
  completedStreams: number;
}

export interface DashboardData {
  stats: DashboardStats;
  activeStreams: Stream[];
}

/** Payload pushed over the /api/events SSE channel. */
export interface ServerEvent<T = unknown> {
  type: ServerEventType;
  data: T;
  ts: string;
}

export type ServerEventType =
  | 'stream.created'
  | 'stream.starting'
  | 'stream.started'
  | 'stream.status'
  | 'stream.reconnecting'
  | 'stream.error'
  | 'stream.stopped'
  | 'stream.completed'
  | 'stream.deleted'
  | 'video.created'
  | 'video.updated'
  | 'video.deleted'
  | 'destination.created'
  | 'destination.updated'
  | 'destination.deleted'
  | 'notification';

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  detail: string;
  hint: string | null;
}

export interface SystemInfo {
  name: string;
  version: string;
  nodeVersion: string;
  platform: string;
  dataDir: string;
  ffmpegPath: string | null;
  ffmpegVersion: string | null;
  ffprobePath: string | null;
  maxUploadSize: number;
  maxConcurrentStreams: number;
  https: boolean;
}

/** Contract every streaming platform adapter must implement. */
export interface PlatformAdapter {
  platform: Platform;
  label: string;
  /** Default RTMPS ingest endpoint for the platform. */
  defaultIngestUrl: string;
  /** Where users find their stream key. */
  keyHelpUrl: string;
  keyHelpText: string;
  validateConfig(config: DestinationConfigInput): { ok: true } | { ok: false; error: string };
  buildOutputUrl(config: DestinationConfigInput): string;
}

export interface DestinationConfigInput {
  /** Ingest base URL, e.g. rtmps://a.rtmp.youtube.com/live2 */
  streamUrl?: string | null;
  streamKey: string;
}

export interface DestinationCredentials extends DestinationConfigInput {
  streamUrl: string;
}
