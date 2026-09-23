import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SESSION_SECRET = 'test-session-secret-0123456789abcdef';
process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789abcdef';
process.env.LOG_LEVEL = 'error';
process.env.WEB_DIST_DIR = '/nonexistent'; // API-only mode for tests

const RTMP_PORT = 19350;

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'sl-it-'));
}

async function makeApp(dataDir, allowPrivate = true) {
  process.env.DATA_DIR = dataDir;
  process.env.ALLOW_PRIVATE_RTMP_TARGETS = allowPrivate ? 'true' : 'false';
  const { buildApp } = await import('../../apps/server/dist/app.js');
  const app = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  return app;
}

function makeClient(app) {
  const base = `http://127.0.0.1:${app.server.address().port}`;
  let cookie = '';
  return {
    base,
    async call(path, options = {}) {
      const response = await fetch(base + path, {
        method: options.method ?? 'GET',
        headers: {
          ...(options.json !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(cookie ? { cookie } : {}),
        },
        body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
        redirect: 'manual',
      });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie && setCookie.includes('sl_session')) {
        cookie = setCookie.split(';')[0];
      }
      const isJson = response.headers.get('content-type')?.includes('application/json');
      const body = isJson ? await response.json() : await response.text();
      return { status: response.status, body };
    },
    async upload(path, filePath, contentType = 'video/mp4') {
      const buffer = await import('node:fs/promises').then((fs) => fs.readFile(filePath));
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: contentType }), 'sample.mp4');
      return fetch(base + path, { method: 'POST', headers: cookie ? { cookie } : {}, body: form });
    },
    async uploadBlob(path, blob, filename) {
      const form = new FormData();
      form.append('file', blob, filename);
      return fetch(base + path, { method: 'POST', headers: cookie ? { cookie } : {}, body: form });
    },
  };
}

function createSampleVideo(dataDir) {
  execFileSync(
    'ffmpeg',
    [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'testsrc2=duration=4:size=320x240:rate=24',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest',
      join(dataDir, 'sample.mp4'),
    ],
    { stdio: 'ignore' },
  );
}

test('full API + streaming integration', async (t) => {
  const dataDir = makeTempDir();
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));
  createSampleVideo(dataDir);

  const { TestRtmpReceiver } = await import('../helpers/rtmp-receiver.js');
  const receiver = new TestRtmpReceiver(RTMP_PORT);
  await receiver.start();
  t.after(() => receiver.stop());

  const app = await makeApp(dataDir);
  t.after(() => app.close());
  const client = makeClient(app);

  // ── unauthenticated access is rejected ──
  assert.equal((await client.call('/api/videos')).status, 401);

  // ── first-run setup ──
  let res = await client.call('/api/auth/status');
  assert.equal(res.body.needsSetup, true);
  res = await client.call('/api/auth/setup', {
    method: 'POST',
    json: { username: 'admin', email: '', password: 'password-123' },
  });
  assert.equal(res.status, 201);

  // setup cannot run twice
  res = await client.call('/api/auth/setup', {
    method: 'POST',
    json: { username: 'other', email: '', password: 'password-123' },
  });
  assert.equal(res.status, 403);

  // ── authenticated now ──
  res = await client.call('/api/auth/status');
  assert.equal(res.body.user.username, 'admin');

  // ── wrong password rejected ──
  const fresh = makeClient(app);
  res = await fresh.call('/api/auth/login', { method: 'POST', json: { username: 'admin', password: 'nope' } });
  assert.equal(res.status, 401);

  // ── health endpoints ──
  assert.equal((await client.call('/health')).body.status, 'ok');
  assert.equal((await client.call('/ready')).body.checks.ffmpeg, true);

  // ── real upload ──
  const uploadRes = await client.upload('/api/videos', join(dataDir, 'sample.mp4'));
  assert.equal(uploadRes.status, 201);
  const video = await uploadRes.json();
  assert.equal(video.status, 'READY');
  assert.equal(video.duration >= 3.5, true);
  assert.equal(video.resolution, '320x240');
  assert.equal(video.hasThumbnail, true);

  // ── SSRF guard on destination create (strict app, no private-target bypass) ──
  {
    const strictApp = await makeApp(dataDir, false);
    t.after(() => strictApp.close());
    const strictClient = makeClient(strictApp);
    await strictClient.call('/api/auth/login', { method: 'POST', json: { username: 'admin', password: 'password-123' } });
    const ssrf = await strictClient.call('/api/destinations', {
      method: 'POST',
      json: { platform: 'youtube', name: 'Internal', streamKey: 'aaaa-bbbb', streamUrl: 'rtmp://192.168.0.5/live' },
    });
    assert.equal(ssrf.status, 400);
  }

  // ── destination to the local test receiver ──
  res = await client.call('/api/destinations', {
    method: 'POST',
    json: { platform: 'youtube', name: 'Receiver', streamKey: 'it-key', streamUrl: `rtmp://127.0.0.1:${RTMP_PORT}/live` },
  });
  assert.equal(res.status, 201);
  const destination = res.body;
  assert.equal(destination.hasStreamKey, true);
  assert.equal(destination.streamUrl, `rtmp://127.0.0.1:${RTMP_PORT}/live`);
  // stream key must never appear in the API payload
  assert.equal(JSON.stringify(destination).includes('it-key'), false);

  // ── second destination on another platform (twitch) → same receiver ──
  res = await client.call('/api/destinations', {
    method: 'POST',
    json: {
      platform: 'twitch',
      name: 'Receiver TW',
      streamKey: 'it-key-tw',
      streamUrl: `rtmp://127.0.0.1:${RTMP_PORT}/live`,
    },
  });
  assert.equal(res.status, 201);
  const twitchDestination = res.body;

  // ── kick destination with default public ingest (config-only, no network) ──
  res = await client.call('/api/destinations', {
    method: 'POST',
    json: { platform: 'kick', name: 'Kick', streamKey: 'it-key-kick' },
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.streamUrl.startsWith('rtmps://'), true);

  // ── stream create + start ──
  res = await client.call('/api/streams', {
    method: 'POST',
    json: {
      videoId: video.id,
      destinationIds: [destination.id, twitchDestination.id],
      title: 'Integration test',
      loopMode: 'none',
    },
  });
  assert.equal(res.status, 201);
  const stream = res.body;
  assert.equal(stream.status, 'CREATED');

  res = await client.call(`/api/streams/${stream.id}/start`, { method: 'POST' });
  assert.equal(res.status, 200);

  // ── wait for RUNNING then COMPLETED (4s video) ──
  const deadline = Date.now() + 30_000;
  let final = null;
  let sawRunning = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const status = await client.call(`/api/streams/${stream.id}`);
    if (status.body.status === 'RUNNING') sawRunning = true;
    if (['COMPLETED', 'FAILED'].includes(status.body.status)) {
      final = status.body;
      break;
    }
  }
  assert.ok(final, 'stream reached a terminal state');
  assert.equal(sawRunning, true, 'stream reported RUNNING');
  assert.equal(final.status, 'COMPLETED', `expected COMPLETED, got ${final.status} (${final.errorMessage})`);
  assert.equal(final.destinations.length, 2, 'both destinations were part of the stream');
  assert.ok(
    final.destinations.every((d) => d.status === 'COMPLETED'),
    `every destination completed: ${JSON.stringify(final.destinations.map((d) => d.status))}`,
  );
  assert.ok(final.destinations[0].lastMetrics, 'metrics were captured');
  assert.ok(final.destinations[0].startedAt && final.destinations[0].endedAt);

  // ── RTMP receiver actually got the publish (one per platform destination) ──
  assert.ok(receiver.published.length >= 2, 'receiver saw both RTMP publishes');

  // ── logs exist and never contain the stream keys ──
  res = await client.call(`/api/streams/${stream.id}/logs`);
  const logBlob = JSON.stringify(res.body);
  assert.equal(logBlob.includes('it-key'), false);
  assert.equal(logBlob.includes('it-key-tw'), false);
  assert.ok(res.body.items.length > 3, 'stream logs were collected');

  // ── history reflects the completed stream ──
  res = await client.call('/api/streams?status=COMPLETED');
  assert.equal(res.body.total, 1);

  // ── dashboard stats ──
  res = await client.call('/api/dashboard');
  assert.equal(res.body.stats.completedStreams, 1);
  assert.equal(res.body.stats.videos, 1);
  assert.equal(res.body.stats.connectedPlatforms, 3);

  // ── video delete blocked while an active stream uses it; allowed after ──
  res = await client.call(`/api/videos/${video.id}`, { method: 'DELETE' });
  assert.equal(res.status, 200);

  // ── audit log recorded key events ──
  res = await client.call('/api/audit');
  const actions = res.body.items.map((entry) => entry.action);
  for (const expected of ['admin.created', 'stream.created', 'stream.started', 'stream.completed']) {
    assert.ok(actions.includes(expected), `audit contains ${expected}`);
  }

  // ── logout invalidates the session ──
  res = await client.call('/api/auth/logout', { method: 'POST' });
  assert.equal(res.status, 200);
  assert.equal((await client.call('/api/videos')).status, 401);
});

test('upload rejects non-video files via signature check', async (t) => {
  const dataDir = makeTempDir();
  t.after(() => rmSync(dataDir, { recursive: true, force: true }));

  const app = await makeApp(dataDir);
  t.after(() => app.close());
  const client = makeClient(app);

  await client.call('/api/auth/setup', {
    method: 'POST',
    json: { username: 'admin', email: '', password: 'password-123' },
  });

  // "fake.mp4" that is actually text — extension passes, signature check fails
  const fake = new Blob([Buffer.from('this is definitely not a video file at all')], { type: 'video/mp4' });
  const response = await client.uploadBlob('/api/videos', fake, 'fake.mp4');
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.message, /signature|metadata/i);
});