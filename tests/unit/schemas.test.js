import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupSchema,
  loginSchema,
  createDestinationSchema,
  createStreamSchema,
} from '../../packages/shared/dist/index.js';

test('setup schema accepts a valid admin', () => {
  const result = setupSchema.safeParse({ username: 'admin', email: '', password: 'longenough1' });
  assert.equal(result.success, true);
});

test('setup schema rejects weak passwords and bad usernames', () => {
  assert.equal(setupSchema.safeParse({ username: 'a', password: 'longenough1' }).success, false);
  assert.equal(setupSchema.safeParse({ username: 'admin', password: 'short' }).success, false);
  assert.equal(setupSchema.safeParse({ username: 'bad name!', password: 'longenough1' }).success, false);
  assert.equal(setupSchema.safeParse({ username: 'admin', password: 'x', role: 'admin' }).success, false);
});

test('login schema requires both fields', () => {
  assert.equal(loginSchema.safeParse({ username: 'a' }).success, false);
  assert.equal(loginSchema.safeParse({ username: 'a', password: 'b' }).success, true);
});

test('destination schema validates stream key charset and url protocol', () => {
  assert.equal(
    createDestinationSchema.safeParse({ platform: 'youtube', name: 'Y', streamKey: 'abcd-1234' }).success,
    true,
  );
  assert.equal(
    createDestinationSchema.safeParse({ platform: 'twitch', name: 'T', streamKey: 'abcd-1234' }).success,
    false,
  );
  assert.equal(
    createDestinationSchema.safeParse({ platform: 'youtube', name: 'Y', streamKey: 'bad key!' }).success,
    false,
  );
  assert.equal(
    createDestinationSchema.safeParse({
      platform: 'youtube',
      name: 'Y',
      streamKey: 'abcd-1234',
      streamUrl: 'http://evil.example/live',
    }).success,
    false,
  );
});

test('stream schema requires scheduledAt only for schedule mode', () => {
  const base = {
    videoId: '9b4b0a52-6f53-4b4c-9a2d-2f0b4b1c2d31',
    destinationIds: ['8b4b0a52-6f53-4b4c-9a2d-2f0b4b1c2d31'],
    title: 'Event',
  };
  assert.equal(createStreamSchema.safeParse({ ...base, startMode: 'now' }).success, true);
  const scheduled = createStreamSchema.safeParse({
    ...base,
    startMode: 'schedule',
    scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
  });
  assert.equal(scheduled.success, true);
  assert.equal(createStreamSchema.safeParse({ ...base, startMode: 'schedule' }).success, false);
  // scheduledAt in the past is rejected
  assert.equal(
    createStreamSchema.safeParse({
      ...base,
      startMode: 'schedule',
      scheduledAt: new Date(Date.now() - 3600_000).toISOString(),
    }).success,
    false,
  );
});

test('stream schema requires loopCount for repeat mode', () => {
  const base = {
    videoId: '9b4b0a52-6f53-4b4c-9a2d-2f0b4b1c2d31',
    destinationIds: ['8b4b0a52-6f53-4b4c-9a2d-2f0b4b1c2d31'],
    title: 'Event',
  };
  assert.equal(createStreamSchema.safeParse({ ...base, loopMode: 'times' }).success, false);
  assert.equal(createStreamSchema.safeParse({ ...base, loopMode: 'times', loopCount: 3 }).success, true);
  assert.equal(createStreamSchema.safeParse({ ...base, loopMode: 'times', loopCount: 1 }).success, false);
});

test('defaults are applied', () => {
  const parsed = createStreamSchema.parse({
    videoId: '9b4b0a52-6f53-4b4c-9a2d-2f0b4b1c2d31',
    destinationIds: ['8b4b0a52-6f53-4b4c-9a2d-2f0b4b1c2d31'],
    title: 'Event',
  });
  assert.equal(parsed.privacy, 'unlisted');
  assert.equal(parsed.startMode, 'now');
  assert.equal(parsed.loopMode, 'none');
  assert.equal(parsed.description, '');
});
