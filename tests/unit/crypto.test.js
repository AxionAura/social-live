import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  encryptString,
  decryptString,
  encryptJson,
  decryptJson,
} from '../../apps/server/dist/lib/crypto.js';

const KEY = Buffer.alloc(32, 7);

test('password hashing roundtrip', () => {
  const hash = hashPassword('correct horse battery staple');
  assert.match(hash, /^scrypt\$/);
  assert.equal(verifyPassword('correct horse battery staple', hash), true);
  assert.equal(verifyPassword('wrong password', hash), false);
});

test('password hash is salted (unique per call)', () => {
  assert.notEqual(hashPassword('same'), hashPassword('same'));
});

test('verifyPassword rejects malformed stored hashes', () => {
  assert.equal(verifyPassword('x', 'not-a-hash'), false);
  assert.equal(verifyPassword('x', ''), false);
});

test('string encryption roundtrip', () => {
  const blob = encryptString(KEY, 'rtmps://a.rtmp.youtube.com/live2/abcd-1234-xyz');
  assert.match(blob, /^v1:/);
  assert.equal(decryptString(KEY, blob), 'rtmps://a.rtmp.youtube.com/live2/abcd-1234-xyz');
});

test('ciphertext does not contain plaintext', () => {
  const secret = 'SUPER-SECRET-STREAM-KEY-42';
  const blob = encryptString(KEY, secret);
  assert.equal(blob.includes(secret), false);
});

test('json encryption roundtrip', () => {
  const value = { streamUrl: 'rtmp://host/live', streamKey: 'k-123' };
  assert.deepEqual(decryptJson(KEY, encryptJson(KEY, value)), value);
});

test('decryption with wrong key fails', () => {
  const blob = encryptString(KEY, 'data');
  assert.throws(() => decryptString(Buffer.alloc(32, 9), blob));
});

test('decryption of tampered ciphertext fails (GCM auth)', () => {
  const blob = encryptString(KEY, 'data');
  const parts = blob.split(':');
  const tampered = Buffer.from(parts[3], 'base64');
  tampered[0] ^= 0xff;
  parts[3] = tampered.toString('base64');
  assert.throws(() => decryptString(KEY, parts.join(':')));
});
