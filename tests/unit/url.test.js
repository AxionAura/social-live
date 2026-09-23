import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicRtmpTarget, isPrivateAddress, InvalidStreamTargetError } from '../../packages/streaming/dist/url.js';

test('isPrivateAddress detects private IPv4 ranges', () => {
  for (const ip of ['10.0.0.1', '192.168.1.1', '172.16.0.1', '172.31.255.255', '127.0.0.1', '0.0.0.0', '169.254.1.1', '100.64.0.1', '224.0.0.1']) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
});

test('isPrivateAddress allows public IPv4', () => {
  for (const ip of ['8.8.8.8', '142.250.0.10', '172.32.0.1', '1.1.1.1']) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test('isPrivateAddress detects private IPv6', () => {
  assert.equal(isPrivateAddress('::1'), true);
  assert.equal(isPrivateAddress('::'), true);
  assert.equal(isPrivateAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateAddress('fd00::1'), true);
  assert.equal(isPrivateAddress('2606:4700::1111'), false);
});

test('rejects non-rtmp protocols', async () => {
  await assert.rejects(() => assertPublicRtmpTarget('http://example.com/live'), InvalidStreamTargetError);
  await assert.rejects(() => assertPublicRtmpTarget('file:///etc/passwd'), InvalidStreamTargetError);
});

test('rejects malformed URLs', async () => {
  await assert.rejects(() => assertPublicRtmpTarget('not a url'), InvalidStreamTargetError);
});

test('blocks loopback / internal hostnames (SSRF)', async () => {
  await assert.rejects(() => assertPublicRtmpTarget('rtmp://127.0.0.1:1935/live'), InvalidStreamTargetError);
  await assert.rejects(() => assertPublicRtmpTarget('rtmp://localhost/live'), InvalidStreamTargetError);
  await assert.rejects(() => assertPublicRtmpTarget('rtmp://myhost.local/live'), InvalidStreamTargetError);
});

test('blocks hostnames resolving to private ranges (SSRF)', async () => {
  await assert.rejects(() => assertPublicRtmpTarget('rtmp://metadata.google.internal/live'), InvalidStreamTargetError);
});

test('allows public ingest endpoints', async () => {
  const target = await assertPublicRtmpTarget('rtmps://a.rtmp.youtube.com/live2/key');
  assert.equal(target.protocol, 'rtmps');
  assert.equal(target.host, 'a.rtmp.youtube.com');
  assert.equal(target.port, 443);
});

test('derives default RTMP port 1935', async () => {
  const target = await assertPublicRtmpTarget('rtmp://a.rtmp.youtube.com/live2');
  assert.equal(target.port, 1935);
});

test('allowPrivate flag permits loopback (test mode)', async () => {
  const target = await assertPublicRtmpTarget('rtmp://127.0.0.1:1935/live/key', true);
  assert.equal(target.host, '127.0.0.1');
});
