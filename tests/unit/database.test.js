import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Database, createRepos } from '../../packages/database/dist/index.js';
import { hashPassword } from '../../apps/server/dist/lib/crypto.js';

function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'sl-db-'));
  const db = new Database(join(dir, 'test.db'));
  return { db, repos: createRepos(db), dir };
}

test('migrations create all tables', () => {
  const { db, dir } = freshDb();
  const tables = db.handle
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r) => r.name);
  for (const expected of [
    'users',
    'sessions',
    'videos',
    'destinations',
    'streams',
    'stream_destinations',
    'stream_logs',
    'audit_logs',
    'schema_version',
  ]) {
    assert.ok(tables.includes(expected), `missing table ${expected}`);
  }
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('user + session lifecycle', () => {
  const { db, repos, dir } = freshDb();
  const user = repos.users.create({ username: 'Admin', email: null, passwordHash: hashPassword('pw-123456') });
  assert.equal(repos.users.byUsername('admin').id, user.id); // case-insensitive lookup
  assert.equal(repos.users.count(), 1);

  const sessionId = repos.sessions.create({ userId: user.id, ttlHours: 1, userAgent: null, ip: null });
  assert.equal(repos.sessions.findActive(sessionId).username, 'Admin');
  repos.sessions.revoke(sessionId);
  assert.equal(repos.sessions.findActive(sessionId), null);

  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('video create/list/search/delete', () => {
  const { db, repos, dir } = freshDb();
  const user = repos.users.create({ username: 'u1', email: null, passwordHash: 'x' });
  repos.videos.create({
    id: 'v1',
    userId: user.id,
    name: 'Event',
    originalName: 'event.mp4',
    storagePath: 'v1.mp4',
    fileSize: 1000,
    duration: 60,
    resolution: '1920x1080',
    codec: 'h264',
    hasThumbnail: true,
  });
  repos.videos.create({
    id: 'v2',
    userId: user.id,
    name: 'Demo',
    originalName: 'demo.mp4',
    storagePath: 'v2.mp4',
    fileSize: 500,
    duration: 10,
    resolution: null,
    codec: null,
    hasThumbnail: false,
  });
  assert.equal(repos.videos.count(), 2);
  assert.equal(repos.videos.list({ search: 'dem', limit: 10, offset: 0 }).length, 1);
  assert.equal(repos.videos.list({ search: 'eve', limit: 10, offset: 0 })[0].name, 'Event');
  assert.equal(repos.videos.list({ limit: 10, offset: 0, sort: 'name', order: 'ASC' })[0].name, 'Demo');
  repos.videos.rename('v1', 'Renamed');
  assert.equal(repos.videos.get('v1').name, 'Renamed');
  repos.videos.delete('v1');
  assert.equal(repos.videos.count(), 1);

  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('stream + destinations + logs', () => {
  const { db, repos, dir } = freshDb();
  const user = repos.users.create({ username: 'u1', email: null, passwordHash: 'x' });
  repos.videos.create({
    id: 'v1',
    userId: user.id,
    name: 'Event',
    originalName: 'event.mp4',
    storagePath: 'v1.mp4',
    fileSize: 1,
    duration: 1,
    resolution: null,
    codec: null,
    hasThumbnail: false,
  });
  repos.destinations.create({
    id: 'd1',
    userId: user.id,
    platform: 'youtube',
    name: 'YT',
    encryptedCredentials: 'v1:blob',
  });
  const stream = repos.streams.createWithDestinations(
    {
      id: 's1',
      userId: user.id,
      videoId: 'v1',
      videoName: 'Event',
      title: 'Test',
      description: '',
      privacy: 'unlisted',
      status: 'CREATED',
      loopMode: 'none',
      loopCount: null,
      scheduledAt: null,
    },
    [{ destinationId: 'd1', platform: 'youtube', name: 'YT' }],
  );
  assert.equal(stream.destinations.length, 1);
  assert.equal(stream.destinations[0].status, 'CREATED');

  repos.streams.updateStatus('s1', 'RUNNING', { startedAt: new Date().toISOString() });
  assert.equal(repos.streams.get('s1').status, 'RUNNING');
  assert.equal(repos.streams.countActive(), 1);
  assert.equal(repos.videos.referencedByActiveStream('v1'), true);

  repos.streamDestinations.update(stream.destinations[0].id, {
    status: 'COMPLETED',
    metrics: { fps: 30, bitrateKbps: 4000, streamedSeconds: 60, updatedAt: new Date().toISOString() },
  });
  const updated = repos.streams.get('s1');
  assert.equal(updated.destinations[0].lastMetrics.fps, 30);

  repos.logs.add({ streamId: 's1', level: 'info', message: 'hello' });
  assert.equal(repos.logs.list('s1', 10).length, 1);

  // audit
  repos.audit.add({ userId: user.id, action: 'login.success' });
  assert.equal(repos.audit.list(10)[0].action, 'login.success');

  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('scheduled stream due query only returns due items', () => {
  const { db, repos, dir } = freshDb();
  const user = repos.users.create({ username: 'u1', email: null, passwordHash: 'x' });
  const past = new Date(Date.now() - 60_000).toISOString();
  const future = new Date(Date.now() + 3_600_000).toISOString();
  for (const [id, scheduledAt] of [['s-past', past], ['s-future', future]]) {
    repos.streams.createWithDestinations(
      {
        id,
        userId: user.id,
        videoId: null,
        videoName: null,
        title: id,
        description: '',
        privacy: 'unlisted',
        status: 'QUEUED',
        loopMode: 'none',
        loopCount: null,
        scheduledAt,
      },
      [],
    );
  }
  const due = repos.streams.listDueScheduled();
  assert.deepEqual(due, ['s-past']);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

test('sqlite database file is created at custom path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-file-'));
  writeFileSync(join(dir, 'keep'), '');
  const db = new Database(join(dir, 'nested', 'deep', 'x.db'));
  assert.ok(db.handle);
  db.close();
  rmSync(dir, { recursive: true, force: true });
});
