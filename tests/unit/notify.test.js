import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatMessage, Notifier } from '../../apps/server/dist/services/notify.js';
import { EventBus } from '../../apps/server/dist/lib/bus.js';

const STREAM = {
  id: 's1',
  title: 'Cityscape Night Loop',
  status: 'RUNNING',
  startedAt: '2026-09-30T10:00:00Z',
  endedAt: '2026-09-30T11:30:00Z',
  errorMessage: null,
  destinations: [{ platform: 'youtube' }, { platform: 'twitch' }],
};

test('formatMessage: started shows title and platforms', () => {
  const msg = formatMessage('stream.started', STREAM);
  assert.match(msg, /LIVE now/);
  assert.match(msg, /Cityscape Night Loop/);
  assert.match(msg, /youtube, twitch/);
});

test('formatMessage: completed shows duration', () => {
  const msg = formatMessage('stream.completed', STREAM);
  assert.match(msg, /finished/);
  assert.match(msg, /90 min/);
});

test('formatMessage: failed includes error message', () => {
  const msg = formatMessage('stream.failed', { ...STREAM, errorMessage: 'FFmpeg exited 251' });
  assert.match(msg, /FAILED/);
  assert.match(msg, /FFmpeg exited 251/);
});

test('formatMessage: null for non-notifiable events', () => {
  assert.equal(formatMessage('video.created', {}), null);
  assert.equal(formatMessage('stream.starting', STREAM), null);
  assert.equal(formatMessage('stream.status', STREAM), null);
});

test('formatMessage: tolerates empty data', () => {
  const msg = formatMessage('stream.started', null);
  assert.match(msg, /Untitled stream/);
});

function makeNotifier(spy) {
  return new Notifier({ botToken: 'tok', chatId: 'chat' }, undefined, spy);
}

test('configured notifier delivers on bus events', async () => {
  const sent = [];
  const notifier = makeNotifier(async (text) => { sent.push(text); });
  const bus = new EventBus();
  notifier.watch(bus);
  bus.publish({ type: 'stream.started', data: STREAM });
  bus.publish({ type: 'video.created', data: {} });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(sent.length, 1);
  assert.match(sent[0], /LIVE now/);
});

test('unconfigured notifier stays silent', async () => {
  let calls = 0;
  const notifier = new Notifier({ botToken: null, chatId: null }, undefined, async () => { calls++; });
  await notifier.deliver('hello');
  assert.equal(calls, 0);
});

test('send failures never throw and never break the flow', async () => {
  const notifier = makeNotifier(async () => { throw new Error('network down'); });
  await notifier.deliver('hello');   // must not reject
  const bus = new EventBus();
  notifier.watch(bus);
  bus.publish({ type: 'stream.failed', data: STREAM });
  await new Promise((r) => setTimeout(r, 30));  // must not throw
});

test('watch returns unsubscribe', async () => {
  const sent = [];
  const notifier = makeNotifier(async (text) => { sent.push(text); });
  const bus = new EventBus();
  const off = notifier.watch(bus);
  off();
  bus.publish({ type: 'stream.started', data: STREAM });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(sent.length, 0);
});

test('integration: server boots with telegram env and bus stays functional', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sl-notify-'));
  process.env.DATA_DIR = join(dir, 'data');
  process.env.SESSION_SECRET = 'x'.repeat(32);
  process.env.ENCRYPTION_KEY = 'y'.repeat(32);
  process.env.LOG_LEVEL = 'error';
  process.env.WEB_DIST_DIR = '/nonexistent';
  process.env.TELEGRAM_BOT_TOKEN = 'test-token';
  process.env.TELEGRAM_CHAT_ID = 'test-chat';
  const { buildApp } = await import('../../apps/server/dist/app.js');
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/ready' });
  assert.equal(res.statusCode, 200);
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});
