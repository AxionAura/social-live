import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStreamArgs } from '../../packages/streaming/dist/args.js';
import { parseProgress } from '../../packages/streaming/dist/process.js';

const BASE = {
  inputPath: '/data/videos/x.mp4',
  outputUrl: 'rtmps://ingest.example.com/live/key-123',
  loopMode: 'none',
  videoBitrateKbps: 4500,
  audioBitrateKbps: 128,
  preset: 'veryfast',
};

test('builds re-encoded RTMP push args', () => {
  const args = buildStreamArgs(BASE);
  assert.equal(args[0], '-hide_banner');
  assert.ok(args.includes('-re'));
  assert.ok(args.includes('-i'));
  assert.equal(args[args.indexOf('-i') + 1], BASE.inputPath);
  assert.ok(args.join(' ').includes('libx264'));
  assert.equal(args[args.length - 1], BASE.outputUrl);
});

test('shell metacharacters in paths stay as single argv entries', () => {
  const evil = '/data/videos/a.mp4; rm -rf /';
  const args = buildStreamArgs({ ...BASE, inputPath: evil });
  const inputIndex = args.indexOf('-i');
  assert.equal(args[inputIndex + 1], evil);
  assert.equal(args.filter((a) => a === evil).length, 1);
});

test('infinite loop adds -stream_loop -1', () => {
  const args = buildStreamArgs({ ...BASE, loopMode: 'infinite' });
  assert.ok(args.includes('-stream_loop'));
  assert.equal(args[args.indexOf('-stream_loop') + 1], '-1');
});

test('repeat N adds N-1 extra loops', () => {
  const args = buildStreamArgs({ ...BASE, loopMode: 'times', loopCount: 3 });
  assert.equal(args[args.indexOf('-stream_loop') + 1], '2');
});

test('no loop mode omits -stream_loop', () => {
  const args = buildStreamArgs({ ...BASE, loopMode: 'none' });
  assert.equal(args.includes('-stream_loop'), false);
});

test('parses a standard ffmpeg progress line', () => {
  const parsed = parseProgress('frame= 1200 fps= 30 q=28.0 size= 1234kB time=00:00:40.00 bitrate= 253.1kbits/s speed=1.01x');
  assert.equal(parsed.fps, 30);
  assert.equal(parsed.bitrateKbps, 253.1);
  assert.equal(parsed.streamedSeconds, 40);
});

test('parses Mbit/s progress lines', () => {
  const parsed = parseProgress('frame= 300 fps= 25 q=23.0 size= 2048kB time=00:00:10.00 bitrate= 1.6Mbits/s speed=1x');
  assert.equal(parsed.bitrateKbps, 1600);
});

test('non-progress lines return null', () => {
  assert.equal(parseProgress('[libx264] using cpu capabilities'), null);
  assert.equal(parseOutputHelper('Output #0, flv'), null);
});

function parseOutputHelper(line) {
  return parseProgress(line);
}
