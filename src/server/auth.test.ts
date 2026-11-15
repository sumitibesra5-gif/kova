import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import {
  getCookieSecurityOptions,
  isHttpsRequest,
  signPayload,
  verifySignedToken,
} from './auth.ts';

test('signPayload and verifySignedToken round-trip valid session payloads and reject tampering or expiry', () => {
  const token = signPayload({
    userId: 42,
    uid: 'firebase_123',
    exp: Date.now() + 60_000,
  });
  const verified = verifySignedToken<{ userId: number; uid: string }>(token);
  assert.equal(verified?.userId, 42);
  assert.equal(verified?.uid, 'firebase_123');

  const tampered = `${token.slice(0, -3)}xxx`;
  assert.equal(verifySignedToken(tampered), null);

  const expired = signPayload({
    userId: 42,
    exp: Date.now() - 1000,
  });
  assert.equal(verifySignedToken(expired), null);
});

test('getCookieSecurityOptions enables SameSite=None; Secure for HTTPS proxy requests and Lax for local HTTP', () => {
  const httpsProxyReq = {
    secure: false,
    headers: { 'x-forwarded-proto': 'https' },
  } as unknown as Request;
  assert.equal(isHttpsRequest(httpsProxyReq), true);
  assert.deepEqual(getCookieSecurityOptions(httpsProxyReq), {
    sameSite: 'none',
    secure: true,
    path: '/',
  });

  const httpLocalReq = {
    secure: false,
    headers: {},
  } as unknown as Request;
  assert.equal(isHttpsRequest(httpLocalReq), false);
  assert.deepEqual(getCookieSecurityOptions(httpLocalReq), {
    sameSite: 'lax',
    secure: false,
    path: '/',
  });
});
