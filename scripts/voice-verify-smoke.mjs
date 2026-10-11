import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createVoiceVerificationApp } from './voice-verify.mjs';
import { buildApp, CONTENT_SECURITY_POLICY } from '../packages/server/dist/app.js';
import { FakeProvider } from '../packages/server/dist/inference/fake.js';
import { noSafety } from '../packages/server/dist/chat/safety.js';

test('isolated app retains real auth/security, encryption, loopback and cleanup', async () => {
  const { app, database, directory } = await createVoiceVerificationApp();
  try {
    await app.listen({ host: '127.0.0.1', port: 0 });
    assert.equal(app.server.address().address, '127.0.0.1');
    const page = await app.inject('/');
    assert.equal(page.statusCode, 200);
    assert.equal(page.headers['content-security-policy'], CONTENT_SECURITY_POLICY);
    assert.equal(page.headers['permissions-policy'], 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()');
    assert.equal(page.headers['x-content-type-options'], 'nosniff');
    assert.equal(page.headers['referrer-policy'], 'no-referrer');
    assert.equal(page.headers['cross-origin-opener-policy'], 'same-origin');
    const passphrase = 'fictional-isolated-test-only';
    assert.equal((await app.inject({ method: 'POST', url: '/api/setup', payload: { passphrase } })).statusCode, 201);
    assert.notEqual(readFileSync(`${directory}/fictional.db`).subarray(0,16).toString(), 'SQLite format 3\0');
    const audio = { method: 'POST', url: '/api/transcribe', headers: { 'content-type': 'audio/wav' }, payload: Buffer.alloc(0) };
    assert.equal((await app.inject(audio)).statusCode, 401);
    const session = await app.inject({ method: 'POST', url: '/api/session', payload: { login: 'admin', passphrase } });
    assert.equal(session.statusCode, 200);
    const cookie = String(session.headers['set-cookie']).split(';')[0];
    assert.match(String(session.headers['set-cookie']), /HttpOnly/);
    assert.equal((await app.inject({ ...audio, headers: { ...audio.headers, cookie } })).statusCode, 400);
    assert.equal((await app.inject({ ...audio, headers: { ...audio.headers, cookie, origin: 'https://untrusted.invalid' } })).statusCode, 403);
    const normal = await buildApp({ database, provider: new FakeProvider(), safety: noSafety, systemPrompt: 'fictional', stats: { lastReply: null } }, false);
    try { assert.match(String((await normal.inject('/api/health')).headers['permissions-policy']), /microphone=\(\)/); }
    finally { await normal.close(); }
  } finally { await app.close(); }
  assert.equal(existsSync(directory), false);
});
