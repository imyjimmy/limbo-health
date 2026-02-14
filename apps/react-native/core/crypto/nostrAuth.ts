// core/crypto/nostrAuth.ts
// Nostr kind:22242 challenge/verify flow for JWT acquisition.
// Core layer: no Expo imports. Privkey and base URL are injected by callers.

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils.js';
import { KeyManager } from './KeyManager';
import type { NostrMetadata } from '../../types/auth';

// --- NIP-01 Event ---

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Compute a NIP-01 event ID: sha256 of the serialized event array.
 * Serialization: [0, pubkey, created_at, kind, tags, content]
 */
function computeEventId(
  pubkey: string,
  createdAt: number,
  kind: number,
  tags: string[][],
  content: string,
): string {
  const serialized = JSON.stringify([0, pubkey, createdAt, kind, tags, content]);
  const encoder = new TextEncoder();
  const hash = sha256(encoder.encode(serialized));
  return bytesToHex(hash);
}

/**
 * Build and sign a kind:22242 auth event for the given challenge.
 */
export function signChallenge(
  privkey: Uint8Array,
  challenge: string,
): NostrEvent {
  const pubkey = KeyManager.pubkeyFromPrivkey(privkey);
  const createdAt = Math.floor(Date.now() / 1000);
  const kind = 22242;
  const content = challenge;
  const tags: string[][] = [['challenge', challenge]];

  const id = computeEventId(pubkey, createdAt, kind, tags, content);
  const idBytes = Uint8Array.from(
    id.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)),
  );
  const sig = bytesToHex(schnorr.sign(idBytes, privkey));

  return { id, pubkey, created_at: createdAt, kind, tags, content, sig };
}

// --- Challenge/Verify Flow ---

export interface AuthResult {
  jwt: string;
  pubkey: string;
  metadata: NostrMetadata | null;
}

/**
 * Full Nostr auth flow: request challenge, sign it, submit for JWT.
 *
 * @param privkey  - 32-byte master private key
 * @param baseUrl  - API base URL (e.g., 'https://limbo.health')
 * @returns JWT token and the authenticated pubkey
 * @throws on network errors or auth rejection
 */
export async function authenticateNostr(
  privkey: Uint8Array,
  baseUrl: string,
): Promise<AuthResult> {
  // Step 1: Request challenge
  const challengeRes = await fetch(`${baseUrl}/api/auth/nostr/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!challengeRes.ok) {
    throw new Error(
      `Challenge request failed: ${challengeRes.status} ${challengeRes.statusText}`,
    );
  }

  const { challenge } = await challengeRes.json();
  if (!challenge || typeof challenge !== 'string') {
    throw new Error('Invalid challenge response: missing challenge string');
  }

  // Step 2: Sign the challenge as a kind:22242 event
  const signedEvent = signChallenge(privkey, challenge);

  // Step 3: Submit signed event for verification
  const verifyRes = await fetch(`${baseUrl}/api/auth/nostr/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedEvent, challenge, userType: 'patient' }),
  });

  if (!verifyRes.ok) {
    throw new Error(
      `Verify request failed: ${verifyRes.status} ${verifyRes.statusText}`,
    );
  }

  const { token, metadata } = await verifyRes.json();

  if (!token || typeof token !== 'string') {
    throw new Error('Invalid verify response: missing token');
  }

  return { jwt: token, pubkey: signedEvent.pubkey, metadata: metadata ?? null };
}