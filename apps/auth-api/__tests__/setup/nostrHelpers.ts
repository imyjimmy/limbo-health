/**
 * tests/setup/nostrHelpers.ts
 *
 * Helpers for the Nostr challenge → sign → verify → JWT auth flow.
 * Matches the frontend's auth.ts behaviour (kind:1 events with challenge in content + tags).
 */
import { finalizeEvent, type UnsignedEvent } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { request } from './testClient';
import { schnorr } from '@noble/curves/secp256k1.js';
import { TEST_PRIVKEY, TEST_PUBKEY, TEST_PRIVKEY_2, TEST_PUBKEY_2 } from './globalSetup';

// ─── Challenge ─────────────────────────────────────────────────────

/**
 * Request a challenge string from auth-api.
 * Note: the current endpoint does NOT require a pubkey in the body.
 */
export async function getChallenge(): Promise<string> {
  const res = await request<{ challenge: string; tag: string }>(
    '/api/auth/nostr/challenge',
    { method: 'POST' },
  );

  if (!res.ok) {
    throw new Error(`Challenge request failed: ${res.status} — ${JSON.stringify(res.data)}`);
  }

  return res.data.challenge;
}

// ─── Sign ──────────────────────────────────────────────────────────

/**
 * Create and sign a kind:1 Nostr event containing the challenge.
 * This matches the exact format the frontend sends to /api/auth/nostr/verify.
 */
export function signChallenge(
  challenge: string,
  privkeyHex: string,
): ReturnType<typeof finalizeEvent> {
  const privBytes = hexToBytes(privkeyHex);
  const pubkey = bytesToHex(schnorr.getPublicKey(privBytes));

  const unsigned: UnsignedEvent = {
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['challenge', challenge]],
    content: challenge,
    pubkey
  };

  // finalizeEvent computes id, derives pubkey, and signs
  return finalizeEvent(unsigned, hexToBytes(privkeyHex));
}

// ─── Full Auth Flow ────────────────────────────────────────────────

/**
 * Complete authenticate: challenge → sign → verify → JWT string.
 *
 * @param userIndex  1 = primary test user, 2 = secondary
 * @param userType   'patient' | 'provider'  — auth-api stores this as the user's role
 */
export async function authenticate(
  userIndex: 1 | 2 = 1,
  userType: 'patient' | 'provider' = 'patient',
): Promise<string> {
  const privkey = userIndex === 1 ? TEST_PRIVKEY : TEST_PRIVKEY_2;

  const challenge = await getChallenge();
  const signedEvent = signChallenge(challenge, privkey);

  const res = await request<{ status: string; token: string; pubkey: string }>(
    '/api/auth/nostr/verify',
    {
      method: 'POST',
      body: { signedEvent, userType },
    },
  );

  if (!res.ok || res.data.status !== 'OK') {
    throw new Error(`authenticate() failed: ${res.status} — ${JSON.stringify(res.data)}`);
  }

  return res.data.token;
}

// ─── JWT Inspection ────────────────────────────────────────────────

/**
 * Decode a JWT payload without verification (tests just need to inspect claims).
 * Safe to use Buffer here since tests always run in Node/Bun.
 */
export function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT — expected 3 segments');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf-8');
  return JSON.parse(payload);
}