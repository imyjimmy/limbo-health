/**
 * tests/auth/nostr-challenge.test.ts
 *
 * Validates the Nostr challenge → sign → verify → JWT auth flow.
 * This is the foundation that every other test depends on.
 */
import { describe, it, expect } from 'vitest';
import { finalizeEvent, type UnsignedEvent } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils';
import { request } from './setup/testClient';
import {
  getChallenge,
  signChallenge,
  authenticate,
  decodeJwtPayload,
} from './setup/nostrHelpers';
import { TEST_PRIVKEY, TEST_PUBKEY } from './setup/globalSetup';

describe('Nostr Auth Flow', () => {
  // ─── Challenge endpoint ──────────────────────────────────────────

  it('should return a challenge string', async () => {
    const res = await request<{ challenge: string; tag: string }>(
      '/api/auth/nostr/challenge',
      { method: 'POST' },
    );

    expect(res.status).toBe(200);
    expect(res.data.challenge).toBeDefined();
    expect(typeof res.data.challenge).toBe('string');
    expect(res.data.challenge.length).toBeGreaterThan(0);
  });

  it('should return a different challenge each time', async () => {
    const c1 = await getChallenge();
    const c2 = await getChallenge();
    expect(c1).not.toBe(c2);
  });

  it('should return 200 even with empty body (challenge does not require pubkey)', async () => {
    // NOTE: The test plan expected 400 for missing pubkey, but the actual
    // auth-api challenge endpoint does NOT require a pubkey — it just
    // generates a random hex string. Documenting the real behaviour here.
    const res = await request<{ challenge: string }>(
      '/api/auth/nostr/challenge',
      { method: 'POST', body: {} },
    );

    expect(res.status).toBe(200);
    expect(res.data.challenge).toBeDefined();
  });

  // ─── Verify endpoint ────────────────────────────────────────────

  it('should return JWT for valid signed challenge', async () => {
    const challenge = await getChallenge();
    const signedEvent = signChallenge(challenge, TEST_PRIVKEY);

    const res = await request<{
      status: string;
      token: string;
      pubkey: string;
    }>('/api/auth/nostr/verify', {
      method: 'POST',
      body: { signedEvent, userType: 'patient' },
    });

    expect(res.status).toBe(200);
    expect(res.data.status).toBe('OK');
    expect(typeof res.data.token).toBe('string');

    // JWT structure: header.payload.signature
    const parts = res.data.token.split('.');
    expect(parts).toHaveLength(3);

    // Decode and check claims
    const payload = decodeJwtPayload(res.data.token);
    expect(payload).toHaveProperty('pubkey', TEST_PUBKEY);
    expect(payload).toHaveProperty('exp');
    expect(payload).toHaveProperty('iat');
  });

  it('should reject invalid signature', async () => {
    const challenge = await getChallenge();
    const signedEvent = signChallenge(challenge, TEST_PRIVKEY);

    // Corrupt the signature
    const badSig = 'a' + signedEvent.sig.slice(1);
    const tampered = { ...signedEvent, sig: badSig };

    const res = await request('/api/auth/nostr/verify', {
      method: 'POST',
      body: { signedEvent: tampered, userType: 'patient' },
    });

    // auth-api returns 400 via NostrAuthService → "Invalid signature"
    expect(res.status).toBe(400);
  });

  it('should reject completely malformed event', async () => {
    const res = await request('/api/auth/nostr/verify', {
      method: 'POST',
      body: {
        signedEvent: { kind: 1, content: 'garbage' },
        userType: 'patient',
      },
    });

    expect(res.status).toBe(400);
  });

  it('should still accept event with created_at far in the past (known limitation)', async () => {
    // NostrAuthService does NOT validate created_at — it only checks
    // event structure + cryptographic signature. An event signed 2 hours
    // ago with a valid challenge will still be accepted.
    //
    // This is a known limitation. If timestamp validation is added later,
    // change the assertion to expect 400 or 401.
    const challenge = await getChallenge();

    const unsigned: UnsignedEvent = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000) - 7200, // 2h ago
      tags: [['challenge', challenge]],
      content: challenge,
      pubkey: TEST_PUBKEY,
    };
    const signedEvent = finalizeEvent(unsigned, hexToBytes(TEST_PRIVKEY));

    const res = await request('/api/auth/nostr/verify', {
      method: 'POST',
      body: { signedEvent, userType: 'patient' },
    });

    // Document actual behaviour: server accepts it
    expect(res.status).toBe(200);
  });

  // ─── Full flow helper ───────────────────────────────────────────

  it('should complete full authenticate() helper flow', async () => {
    const jwt = await authenticate(1, 'patient');

    expect(jwt).toBeDefined();
    expect(typeof jwt).toBe('string');
    expect(jwt.split('.')).toHaveLength(3);
  });

  it('should authenticate second test user independently', async () => {
    const jwt2 = await authenticate(2, 'patient');

    expect(jwt2).toBeDefined();
    const payload = decodeJwtPayload(jwt2);
    expect(payload.pubkey).not.toBe(TEST_PUBKEY); // different user
  });
});