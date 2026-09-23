import type {
  AuditLogEntry,
  Destination,
  Platform,
  SafeUser,
  Stream,
  StreamDestination,
  StreamDestinationStatus,
  StreamLogEntry,
  StreamMetrics,
  StreamStatus,
  Video,
} from '@social-live/shared';
import { ACTIVE_STREAM_STATUSES } from '@social-live/shared';
import { Database, newId, nowIso, type Row } from './db.js';

/* ────────────────────────── row mappers ────────────────────────── */

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapUser(row: Row): SafeUser {
  return {
    id: row.id as string,
    username: row.username as string,
    email: str(row.email),
    createdAt: row.created_at as string,
  };
}

function mapVideo(row: Row): Video {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    name: row.name as string,
    originalName: row.original_name as string,
    storagePath: row.storage_path as string,
    fileSize: Number(row.file_size),
    duration: row.duration === null || row.duration === undefined ? null : Number(row.duration),
    resolution: str(row.resolution),
    codec: str(row.codec),
    status: row.status as Video['status'],
    hasThumbnail: Number(row.has_thumbnail) === 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapDestination(row: Row): Destination {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    platform: row.platform as Platform,
    name: row.name as string,
    status: row.status as Destination['status'],
    streamUrl: str(row.stream_url),
    hasStreamKey: false, // credentials are encrypted; masked in toPublicDestination
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function mapStreamDestination(row: Row): StreamDestination {
  let metrics: StreamMetrics | null = null;
  if (typeof row.last_metrics === 'string') {
    try {
      metrics = JSON.parse(row.last_metrics) as StreamMetrics;
    } catch {
      metrics = null;
    }
  }
  return {
    id: row.id as string,
    streamId: row.stream_id as string,
    destinationId: str(row.destination_id),
    platform: row.platform as Platform,
    destinationName: row.destination_name as string,
    status: row.status as StreamDestinationStatus,
    reconnectCount: Number(row.reconnect_count ?? 0),
    lastMetrics: metrics,
    startedAt: str(row.started_at),
    endedAt: str(row.ended_at),
    errorMessage: str(row.error_message),
  };
}

function mapStream(row: Row, destinations: StreamDestination[]): Stream {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    videoId: str(row.video_id),
    videoName: str(row.video_name),
    title: row.title as string,
    description: str(row.description) ?? '',
    privacy: (str(row.privacy) ?? 'unlisted') as Stream['privacy'],
    status: row.status as StreamStatus,
    loopMode: (str(row.loop_mode) ?? 'none') as Stream['loopMode'],
    loopCount: row.loop_count === null || row.loop_count === undefined ? null : Number(row.loop_count),
    scheduledAt: str(row.scheduled_at),
    startedAt: str(row.started_at),
    endedAt: str(row.ended_at),
    errorMessage: str(row.error_message),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    destinations,
  };
}

function mapLog(row: Row): StreamLogEntry {
  return {
    id: Number(row.id),
    streamId: row.stream_id as string,
    streamDestinationId: str(row.stream_destination_id),
    level: row.level as StreamLogEntry['level'],
    message: row.message as string,
    createdAt: row.created_at as string,
  };
}

/* ────────────────────────── repos ────────────────────────── */

export function createRepos(db: Database) {
  const handle = db.handle;

  const users = {
    count(): number {
      const row = handle.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
      return Number(row.c);
    },
    create(input: { username: string; email: string | null; passwordHash: string }): SafeUser {
      const id = newId();
      const ts = nowIso();
      handle
        .prepare('INSERT INTO users (id, username, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, input.username, input.email, input.passwordHash, ts, ts);
      return { id, username: input.username, email: input.email, createdAt: ts };
    },
    byId(id: string): SafeUser | null {
      const row = handle.prepare('SELECT * FROM users WHERE id = ?').get(id);
      return row ? mapUser(row as Row) : null;
    },
    byUsername(username: string): (SafeUser & { passwordHash: string }) | null {
      const row = handle.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username) as
        | Row
        | undefined;
      if (!row) return null;
      return { ...mapUser(row), passwordHash: row.password_hash as string };
    },
    setPassword(id: string, passwordHash: string): void {
      handle.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(passwordHash, nowIso(), id);
    },
  };

  const sessions = {
    create(input: { userId: string; ttlHours: number; userAgent: string | null; ip: string | null }): string {
      const id = newId() + newId().replace(/-/g, '');
      const now = Date.now();
      handle
        .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at, user_agent, ip) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, input.userId, nowIso(), new Date(now + input.ttlHours * 3600_000).toISOString(), input.userAgent, input.ip);
      return id;
    },
    findActive(id: string): (SafeUser & { sessionId: string; expiresAt: string }) | null {
      const row = handle
        .prepare(
          `SELECT u.id, u.username, u.email, u.created_at, s.expires_at
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.id = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
        )
        .get(id, nowIso());
      if (!row) return null;
      const r = row as Row;
      return { ...mapUser(r), sessionId: id, expiresAt: r.expires_at as string };
    },
    revoke(id: string): void {
      handle.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(nowIso(), id);
    },
    revokeAllForUser(userId: string, exceptId?: string): void {
      if (exceptId) {
        handle
          .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id != ?')
          .run(nowIso(), userId, exceptId);
      } else {
        handle.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(nowIso(), userId);
      }
    },
    deleteExpired(): number {
      const res = handle.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(nowIso());
      return Number(res.changes);
    },
  };

  const videos = {
    create(input: {
      id: string;
      userId: string;
      name: string;
      originalName: string;
      storagePath: string;
      fileSize: number;
      duration: number | null;
      resolution: string | null;
      codec: string | null;
      hasThumbnail: boolean;
    }): Video {
      const ts = nowIso();
      handle
        .prepare(
          `INSERT INTO videos (id, user_id, name, original_name, storage_path, file_size, duration, resolution, codec, status, has_thumbnail, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?)`,
        )
        .run(
          input.id,
          input.userId,
          input.name,
          input.originalName,
          input.storagePath,
          input.fileSize,
          input.duration,
          input.resolution,
          input.codec,
          input.hasThumbnail ? 1 : 0,
          ts,
          ts,
        );
      return videos.get(input.id)!;
    },
    get(id: string): Video | null {
      const row = handle.prepare('SELECT * FROM videos WHERE id = ?').get(id);
      return row ? mapVideo(row as Row) : null;
    },
    count(): number {
      const row = handle.prepare('SELECT COUNT(*) AS c FROM videos').get() as { c: number };
      return Number(row.c);
    },
    list(options: { search?: string; sort?: string; order?: string; limit: number; offset: number }): Video[] {
      const params: (string | number | null)[] = [];
      let where = '';
      if (options.search) {
        where = 'WHERE name LIKE ? ESCAPE \'\\\'';
        params.push(`%${escapeLike(options.search)}%`);
      }
      const sortColumn = VIDEO_SORT_COLUMNS[options.sort ?? 'created_at'] ?? VIDEO_SORT_COLUMNS.created_at;
      const order = options.order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      params.push(options.limit, options.offset);
      const rows = handle
        .prepare(`SELECT * FROM videos ${where} ORDER BY ${sortColumn} ${order} LIMIT ? OFFSET ?`)
        .all(...params);
      return (rows as Row[]).map(mapVideo);
    },
    countListed(search?: string): number {
      if (!search) return videos.count();
      const row = handle
        .prepare(`SELECT COUNT(*) AS c FROM videos WHERE name LIKE ? ESCAPE '\\'`)
        .get(`%${escapeLike(search)}%`) as { c: number };
      return Number(row.c);
    },
    rename(id: string, name: string): void {
      handle.prepare('UPDATE videos SET name = ?, updated_at = ? WHERE id = ?').run(name, nowIso(), id);
    },
    setThumbnail(id: string, has: boolean): void {
      handle.prepare('UPDATE videos SET has_thumbnail = ? WHERE id = ?').run(has ? 1 : 0, id);
    },
    delete(id: string): void {
      handle.prepare('DELETE FROM videos WHERE id = ?').run(id);
    },
    referencedByActiveStream(id: string): boolean {
      const placeholders = ACTIVE_STREAM_STATUSES.map(() => '?').join(', ');
      const row = handle
        .prepare(
          `SELECT COUNT(*) AS c FROM streams WHERE video_id = ? AND status IN (${placeholders})`,
        )
        .get(id, ...ACTIVE_STREAM_STATUSES) as { c: number };
      return Number(row.c) > 0;
    },
  };

  const destinations = {
    create(input: {
      id: string;
      userId: string;
      platform: Platform;
      name: string;
      encryptedCredentials: string;
    }): Destination {
      const ts = nowIso();
      handle
        .prepare(
          `INSERT INTO destinations (id, user_id, platform, name, encrypted_credentials, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'CONNECTED', ?, ?)`,
        )
        .run(input.id, input.userId, input.platform, input.name, input.encryptedCredentials, ts, ts);
      return destinations.get(input.id)!;
    },
    get(id: string): Destination | null {
      const row = handle.prepare('SELECT * FROM destinations WHERE id = ?').get(id);
      return row ? mapDestination(row as Row) : null;
    },
    /** Raw row incl. encrypted credentials blob — internal use (decrypt server-side). */
    getRaw(id: string): Row | null {
      const row = handle.prepare('SELECT * FROM destinations WHERE id = ?').get(id);
      return (row as Row) ?? null;
    },
    list(userId: string): Destination[] {
      const rows = handle.prepare('SELECT * FROM destinations WHERE user_id = ? ORDER BY created_at ASC').all(userId);
      return (rows as Row[]).map(mapDestination);
    },
    /** Raw rows including the encrypted credentials blob. */
    listRaw(userId: string): Row[] {
      return handle.prepare('SELECT * FROM destinations WHERE user_id = ? ORDER BY created_at ASC').all(userId) as Row[];
    },
    countDistinctPlatforms(userId: string): number {
      const row = handle
        .prepare('SELECT COUNT(DISTINCT platform) AS c FROM destinations WHERE user_id = ?')
        .get(userId) as { c: number };
      return Number(row.c);
    },
    update(
      id: string,
      fields: { name?: string; encryptedCredentials?: string; status?: Destination['status'] },
    ): void {
      const sets: string[] = [];
      const params: (string | number | null)[] = [];
      if (fields.name !== undefined) {
        sets.push('name = ?');
        params.push(fields.name);
      }
      if (fields.encryptedCredentials !== undefined) {
        sets.push('encrypted_credentials = ?');
        params.push(fields.encryptedCredentials);
      }
      if (fields.status !== undefined) {
        sets.push('status = ?');
        params.push(fields.status);
      }
      if (sets.length === 0) return;
      sets.push('updated_at = ?');
      params.push(nowIso(), id);
      handle.prepare(`UPDATE destinations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    },
    delete(id: string): void {
      handle.prepare('DELETE FROM destinations WHERE id = ?').run(id);
    },
  };

  const streams = {
    createWithDestinations(
      stream: {
        id: string;
        userId: string;
        videoId: string;
        videoName: string;
        title: string;
        description: string;
        privacy: Stream['privacy'];
        status: StreamStatus;
        loopMode: Stream['loopMode'];
        loopCount: number | null;
        scheduledAt: string | null;
      },
      destinationIds: { destinationId: string; platform: Platform; name: string }[],
    ): Stream {
      return db.transaction(() => {
        const ts = nowIso();
        handle
          .prepare(
            `INSERT INTO streams (id, user_id, video_id, video_name, title, description, privacy, status, loop_mode, loop_count, scheduled_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            stream.id,
            stream.userId,
            stream.videoId,
            stream.videoName,
            stream.title,
            stream.description,
            stream.privacy,
            stream.status,
            stream.loopMode,
            stream.loopCount,
            stream.scheduledAt,
            ts,
            ts,
          );
        const insertSd = handle.prepare(
          `INSERT INTO stream_destinations (id, stream_id, destination_id, platform, destination_name, status)
           VALUES (?, ?, ?, ?, ?, 'CREATED')`,
        );
        for (const dest of destinationIds) {
          insertSd.run(newId(), stream.id, dest.destinationId, dest.platform, dest.name);
        }
        return streams.get(stream.id)!;
      });
    },
    get(id: string): Stream | null {
      const row = handle.prepare('SELECT * FROM streams WHERE id = ?').get(id) as Row | undefined;
      if (!row) return null;
      const destRows = handle
        .prepare('SELECT * FROM stream_destinations WHERE stream_id = ? ORDER BY rowid ASC')
        .all(id) as Row[];
      return mapStream(row, destRows.map(mapStreamDestination));
    },
    list(filters: {
      status?: string;
      platform?: string;
      from?: string;
      to?: string;
      search?: string;
      limit: number;
      offset: number;
    }): { items: Stream[]; total: number } {
      const params: (string | number | null)[] = [];
      const where: string[] = [];
      if (filters.status && filters.status !== 'ALL') {
        where.push('s.status = ?');
        params.push(filters.status);
      }
      if (filters.platform) {
        where.push('EXISTS (SELECT 1 FROM stream_destinations sd WHERE sd.stream_id = s.id AND sd.platform = ?)');
        params.push(filters.platform);
      }
      if (filters.from) {
        where.push('s.created_at >= ?');
        params.push(filters.from);
      }
      if (filters.to) {
        where.push('s.created_at <= ?');
        params.push(filters.to);
      }
      if (filters.search) {
        where.push('(s.title LIKE ? ESCAPE \'\\\' OR s.video_name LIKE ? ESCAPE \'\\\')');
        const like = `%${escapeLike(filters.search)}%`;
        params.push(like, like);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const totalRow = handle.prepare(`SELECT COUNT(*) AS c FROM streams s ${whereSql}`).get(...params) as {
        c: number;
      };
      const rows = handle
        .prepare(`SELECT s.* FROM streams s ${whereSql} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`)
        .all(...params, filters.limit, filters.offset) as Row[];
      return { items: rows.map((r) => streams.get(r.id as string)!), total: Number(totalRow.c) };
    },
    listActive(userId: string): Stream[] {
      const placeholders = ACTIVE_STREAM_STATUSES.map(() => '?').join(', ');
      const rows = handle
        .prepare(`SELECT * FROM streams WHERE user_id = ? AND status IN (${placeholders}) ORDER BY created_at DESC`)
        .all(userId, ...ACTIVE_STREAM_STATUSES) as Row[];
      return rows.map((r) => streams.get(r.id as string)!);
    },
    countActive(): number {
      const placeholders = ACTIVE_STREAM_STATUSES.map(() => '?').join(', ');
      const row = handle
        .prepare(`SELECT COUNT(*) AS c FROM streams WHERE status IN (${placeholders})`)
        .get(...ACTIVE_STREAM_STATUSES) as { c: number };
      return Number(row.c);
    },
    countByStatus(status: StreamStatus): number {
      const row = handle.prepare('SELECT COUNT(*) AS c FROM streams WHERE status = ?').get(status) as { c: number };
      return Number(row.c);
    },
    listDueScheduled(): string[] {
      const rows = handle
        .prepare("SELECT id FROM streams WHERE status = 'QUEUED' AND scheduled_at IS NOT NULL AND scheduled_at <= ?")
        .all(nowIso()) as Row[];
      return rows.map((r) => r.id as string);
    },
    /** Streams left in a live state after an application restart — recovery. */
    listInterrupted(): string[] {
      const placeholders = ['STARTING', 'RUNNING', 'RECONNECTING', 'STOPPING'].map(() => '?').join(', ');
      const rows = handle
        .prepare(`SELECT id FROM streams WHERE status IN (${placeholders})`)
        .all('STARTING', 'RUNNING', 'RECONNECTING', 'STOPPING') as Row[];
      return rows.map((r) => r.id as string);
    },
    updateStatus(
      id: string,
      status: StreamStatus,
      extra: { startedAt?: string | null; endedAt?: string | null; errorMessage?: string | null } = {},
    ): void {
      const sets = ['status = ?', 'updated_at = ?'];
      const params: (string | number | null)[] = [status, nowIso()];
      if (extra.startedAt !== undefined) {
        sets.push('started_at = ?');
        params.push(extra.startedAt);
      }
      if (extra.endedAt !== undefined) {
        sets.push('ended_at = ?');
        params.push(extra.endedAt);
      }
      if (extra.errorMessage !== undefined) {
        sets.push('error_message = ?');
        params.push(extra.errorMessage);
      }
      params.push(id);
      handle.prepare(`UPDATE streams SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    },
    delete(id: string): void {
      handle.prepare('DELETE FROM streams WHERE id = ?').run(id);
    },
  };

  const streamDestinations = {
    update(
      id: string,
      fields: {
        status?: StreamDestinationStatus;
        startedAt?: string | null;
        endedAt?: string | null;
        errorMessage?: string | null;
        reconnectCount?: number;
        metrics?: StreamMetrics | null;
      },
    ): void {
      const sets: string[] = [];
      const params: (string | number | null)[] = [];
      if (fields.status !== undefined) {
        sets.push('status = ?');
        params.push(fields.status);
      }
      if (fields.startedAt !== undefined) {
        sets.push('started_at = ?');
        params.push(fields.startedAt);
      }
      if (fields.endedAt !== undefined) {
        sets.push('ended_at = ?');
        params.push(fields.endedAt);
      }
      if (fields.errorMessage !== undefined) {
        sets.push('error_message = ?');
        params.push(fields.errorMessage);
      }
      if (fields.reconnectCount !== undefined) {
        sets.push('reconnect_count = ?');
        params.push(fields.reconnectCount);
      }
      if (fields.metrics !== undefined) {
        sets.push('last_metrics = ?');
        params.push(fields.metrics ? JSON.stringify(fields.metrics) : null);
      }
      if (sets.length === 0) return;
      params.push(id);
      handle.prepare(`UPDATE stream_destinations SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    },
  };

  const logs = {
    add(entry: {
      streamId: string;
      streamDestinationId?: string | null;
      level: StreamLogEntry['level'];
      message: string;
    }): void {
      handle
        .prepare('INSERT INTO stream_logs (stream_id, stream_destination_id, level, message, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(entry.streamId, entry.streamDestinationId ?? null, entry.level, entry.message.slice(0, 2000), nowIso());
    },
    addMany(entries: Omit<StreamLogEntry, 'id' | 'createdAt'>[]): void {
      if (entries.length === 0) return;
      const stmt = handle.prepare(
        'INSERT INTO stream_logs (stream_id, stream_destination_id, level, message, created_at) VALUES (?, ?, ?, ?, ?)',
      );
      db.transaction(() => {
        for (const e of entries) {
          stmt.run(e.streamId, e.streamDestinationId ?? null, e.level, e.message.slice(0, 2000), nowIso());
        }
      });
    },
    list(streamId: string, limit = 200): StreamLogEntry[] {
      const rows = handle
        .prepare('SELECT * FROM stream_logs WHERE stream_id = ? ORDER BY id DESC LIMIT ?')
        .all(streamId, limit) as Row[];
      return rows.map(mapLog).reverse();
    },
  };

  const audit = {
    add(entry: { userId?: string | null; action: string; detail?: string | null; ip?: string | null }): void {
      handle
        .prepare('INSERT INTO audit_logs (user_id, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(entry.userId ?? null, entry.action, entry.detail ?? null, entry.ip ?? null, nowIso());
    },
    list(limit = 100): AuditLogEntry[] {
      const rows = handle.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit) as Row[];
      return rows.map((r) => ({
        id: Number(r.id),
        userId: str(r.user_id),
        action: r.action as string,
        detail: str(r.detail),
        ip: str(r.ip),
        createdAt: r.created_at as string,
      }));
    },
  };

  return { users, sessions, videos, destinations, streams, streamDestinations, logs, audit };
}

export type Repos = ReturnType<typeof createRepos>;

const VIDEO_SORT_COLUMNS: Record<string, string> = {
  created_at: 'created_at',
  name: 'name COLLATE NOCASE',
  duration: 'duration',
  file_size: 'file_size',
};

function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}
