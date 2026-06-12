import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyGithubSignature } from './verify';

const SECRET = 'test_secret_123';
const BODY = JSON.stringify({ action: 'opened', number: 42 });

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

test('accepts a valid signature', () => {
  assert.equal(verifyGithubSignature(BODY, sign(BODY, SECRET), SECRET), true);
});

test('accepts a valid signature over a Buffer body', () => {
  const buf = Buffer.from(BODY);
  assert.equal(verifyGithubSignature(buf, sign(BODY, SECRET), SECRET), true);
});

test('rejects a signature made with the wrong secret', () => {
  assert.equal(verifyGithubSignature(BODY, sign(BODY, 'wrong_secret'), SECRET), false);
});

test('rejects a tampered body', () => {
  const sig = sign(BODY, SECRET);
  assert.equal(verifyGithubSignature(BODY + 'tampered', sig, SECRET), false);
});

test('rejects a missing signature header', () => {
  assert.equal(verifyGithubSignature(BODY, undefined, SECRET), false);
});

test('rejects a malformed signature header (no sha256= prefix)', () => {
  assert.equal(verifyGithubSignature(BODY, 'deadbeef', SECRET), false);
});

test('rejects when the secret is empty', () => {
  assert.equal(verifyGithubSignature(BODY, sign(BODY, SECRET), ''), false);
});
