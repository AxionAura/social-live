export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  file_size INTEGER NOT NULL,
  duration REAL,
  resolution TEXT,
  codec TEXT,
  status TEXT NOT NULL DEFAULT 'READY',
  has_thumbnail INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_videos_user ON videos(user_id, created_at);

CREATE TABLE destinations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','facebook')),
  name TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CONNECTED',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE streams (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  video_id TEXT REFERENCES videos(id) ON DELETE SET NULL,
  video_name TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  privacy TEXT NOT NULL DEFAULT 'unlisted',
  status TEXT NOT NULL DEFAULT 'CREATED',
  loop_mode TEXT NOT NULL DEFAULT 'none',
  loop_count INTEGER,
  scheduled_at TEXT,
  started_at TEXT,
  ended_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_streams_user ON streams(user_id, created_at);
CREATE INDEX idx_streams_status ON streams(status);

CREATE TABLE stream_destinations (
  id TEXT PRIMARY KEY,
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  destination_id TEXT REFERENCES destinations(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'CREATED',
  external_id TEXT,
  started_at TEXT,
  ended_at TEXT,
  reconnect_count INTEGER NOT NULL DEFAULT 0,
  last_metrics TEXT,
  error_message TEXT
);
CREATE INDEX idx_stream_dest_stream ON stream_destinations(stream_id);

CREATE TABLE stream_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stream_id TEXT NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  stream_destination_id TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_stream_logs_stream ON stream_logs(stream_id, id);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  ip TEXT,
  created_at TEXT NOT NULL
);
`,
  },
];
