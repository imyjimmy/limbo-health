// core/crypto/nip44.ts
// NIP-44 v2 encrypt/decrypt implementation.
// Uses @noble primitives proven working on Hermes by the spike.
// Spec: https://github.com/nostr-protocol/nips/blob/master/44.md

import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { extract as hkdfExtract } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { chacha20 } from '@noble/ciphers/chacha.js';
import { concatBytes, hexToBytes } from '@noble/hashes/utils.js';
import { encode as b64encode, decode as b64decode } from './base64';

// --- Constants ---

const VERSION = 2;
const MIN_PLAINTEXT_SIZE = 1;
const MAX_PLAINTEXT_SIZE = 65535;
const HKDF_SALT = new TextEncoder().encode('nip44-v2');

// --- Conversation Key ---

/**
 * Derive a NIP-44 conversation key from a private key and a public key.
 * The conversation key is symmetric: getConversationKey(a, B) === getConversationKey(b, A)
 *
 * @param privkey - 32-byte private key (Uint8Array)
 * @param pubkey  - 32-byte x-only public key (hex string, no 02/03 prefix)
 */
export function getConversationKey(
  privkey: Uint8Array,
  pubkey: string,
): Uint8Array {
  // secp256k1.getSharedSecret returns 33-byte compressed point (02 + x).
  // NIP-44 needs only the 32-byte x coordinate, unhashed.
  const sharedPoint = secp256k1.getSharedSecret(privkey, hexToBytes('02' + pubkey));
  const sharedX = sharedPoint.slice(1, 33); // drop the 02 prefix byte

  return hkdfExtract(sha256, sharedX, HKDF_SALT);
}

// --- Padding ---

function calcPaddedLen(unpaddedLen: number): number {
  if (unpaddedLen <= 32) return 32;
  const nextPower = 1 << (Math.floor(Math.log2(unpaddedLen - 1)) + 1);
  const chunk = nextPower <= 256 ? 32 : nextPower / 8;
  return chunk * (Math.floor((unpaddedLen - 1) / chunk) + 1);
}

function pad(plaintext: string): Uint8Array {
  const encoder = new TextEncoder();
  const unpadded = encoder.encode(plaintext);
  const unpaddedLen = unpadded.length;

  if (unpaddedLen < MIN_PLAINTEXT_SIZE || unpaddedLen > MAX_PLAINTEXT_SIZE) {
    throw new Error(
      `invalid plaintext length: ${unpaddedLen} (must be ${MIN_PLAINTEXT_SIZE}–${MAX_PLAINTEXT_SIZE})`,
    );
  }

  const paddedLen = calcPaddedLen(unpaddedLen);

  // prefix: 2-byte big-endian length
  const prefix = new Uint8Array(2);
  prefix[0] = (unpaddedLen >> 8) & 0xff;
  prefix[1] = unpaddedLen & 0xff;

  // suffix: zero padding
  const suffix = new Uint8Array(paddedLen - unpaddedLen);

  return concatBytes(prefix, unpadded, suffix);
}

function unpad(padded: Uint8Array): string {
  const unpaddedLen = (padded[0] << 8) | padded[1];
  const unpadded = padded.slice(2, 2 + unpaddedLen);

  if (
    unpaddedLen === 0 ||
    unpadded.length !== unpaddedLen ||
    padded.length !== 2 + calcPaddedLen(unpaddedLen)
  ) {
    throw new Error('invalid padding');
  }

  const decoder = new TextDecoder();
  return decoder.decode(unpadded);
}

// --- Message Keys ---

function getMessageKeys(
  conversationKey: Uint8Array,
  nonce: Uint8Array,
): { chachaKey: Uint8Array; chachaNonce: Uint8Array; hmacKey: Uint8Array } {
  if (conversationKey.length !== 32)
    throw new Error('invalid conversation_key length');
  if (nonce.length !== 32) throw new Error('invalid nonce length');

  const keys = hkdf(sha256, conversationKey, undefined, nonce, 76);

  return {
    chachaKey: keys.slice(0, 32),
    chachaNonce: keys.slice(32, 44),
    hmacKey: keys.slice(44, 76),
  };
}

// --- HMAC with AAD ---

function hmacAad(
  key: Uint8Array,
  message: Uint8Array,
  aad: Uint8Array,
): Uint8Array {
  if (aad.length !== 32)
    throw new Error('AAD associated data must be 32 bytes');
  return hmac(sha256, key, concatBytes(aad, message));
}

// --- Constant-time comparison ---

function isEqualCt(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

// --- Payload encode/decode ---

function encodePayload(
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  mac: Uint8Array,
): string {
  const version = new Uint8Array([VERSION]);
  const raw = concatBytes(version, nonce, ciphertext, mac);
  return b64encode(raw);
}

function decodePayload(
  payload: string,
): { nonce: Uint8Array; ciphertext: Uint8Array; mac: Uint8Array } {
  const plen = payload.length;
  if (plen === 0 || payload[0] === '#') throw new Error('unknown version');
  if (plen < 132 || plen > 87472) throw new Error('invalid payload size');

  const data = b64decode(payload);
  const dlen = data.length;
  if (dlen < 99 || dlen > 65603) throw new Error('invalid data size');

  const vers = data[0];
  if (vers !== VERSION) throw new Error('unknown version ' + vers);

  return {
    nonce: data.slice(1, 33),
    ciphertext: data.slice(33, dlen - 32),
    mac: data.slice(dlen - 32, dlen),
  };
}

// --- Standard NIP-44 encrypt/decrypt (≤65KB plaintext) ---

/**
 * Encrypt a plaintext string using NIP-44 v2.
 * Plaintext must be 1–65535 bytes when UTF-8 encoded.
 */
export function encrypt(
  plaintext: string,
  conversationKey: Uint8Array,
): string {
  const nonce = new Uint8Array(32);
  globalThis.crypto.getRandomValues(nonce);

  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(
    conversationKey,
    nonce,
  );

  const padded = pad(plaintext);
  const ciphertext = chacha20(chachaKey, chachaNonce, padded);
  const mac = hmacAad(hmacKey, ciphertext, nonce);

  return encodePayload(nonce, ciphertext, mac);
}

/**
 * Decrypt a NIP-44 v2 payload string.
 * Returns the original plaintext.
 */
export function decrypt(
  payload: string,
  conversationKey: Uint8Array,
): string {
  const { nonce, ciphertext, mac } = decodePayload(payload);
  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(
    conversationKey,
    nonce,
  );

  const calculatedMac = hmacAad(hmacKey, ciphertext, nonce);
  if (!isEqualCt(calculatedMac, mac)) throw new Error('invalid MAC');

  const padded = chacha20(chachaKey, chachaNonce, ciphertext);
  return unpad(padded);
}

// --- Large payload encrypt/decrypt (sidecars exceeding 65KB) ---
//
// NIP-44 has a 65535-byte plaintext limit due to padding.
// Sidecar files (photos, PDFs) routinely exceed this after base64 encoding.
//
// Strategy: use the same conversation key, but encrypt with raw
// ChaCha20 + HMAC-SHA256 without the NIP-44 padding scheme.
// Format: version(1) || nonce(32) || ciphertext(N) || mac(32)
// The version byte is 0xFF to distinguish from standard NIP-44 (0x02).

const LARGE_VERSION = 0xff;

/**
 * Encrypt a large string payload (sidecar files).
 * Uses the NIP-44 conversation key with raw ChaCha20 + HMAC.
 * No padding — the 65KB limit does not apply.
 */
export function encryptLarge(
  data: string,
  conversationKey: Uint8Array,
): string {
  const encoder = new TextEncoder();
  const plainBytes = encoder.encode(data);

  const nonce = new Uint8Array(32);
  globalThis.crypto.getRandomValues(nonce);

  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(
    conversationKey,
    nonce,
  );

  const ciphertext = chacha20(chachaKey, chachaNonce, plainBytes);
  const mac = hmacAad(hmacKey, ciphertext, nonce);

  const version = new Uint8Array([LARGE_VERSION]);
  const raw = concatBytes(version, nonce, ciphertext, mac);
  return b64encode(raw);
}

/**
 * Decrypt a large payload string (sidecar files).
 * Expects the 0xFF version byte format from encryptLarge.
 */
export function decryptLarge(
  payload: string,
  conversationKey: Uint8Array,
): string {
  const data = b64decode(payload);
  const dlen = data.length;

  if (dlen < 65) throw new Error('invalid large payload size');

  const vers = data[0];
  if (vers !== LARGE_VERSION)
    throw new Error('invalid large payload version: ' + vers);

  const nonce = data.slice(1, 33);
  const ciphertext = data.slice(33, dlen - 32);
  const mac = data.slice(dlen - 32, dlen);

  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(
    conversationKey,
    nonce,
  );

  const calculatedMac = hmacAad(hmacKey, ciphertext, nonce);
  if (!isEqualCt(calculatedMac, mac)) throw new Error('invalid MAC');

  const plainBytes = chacha20(chachaKey, chachaNonce, ciphertext);
  const decoder = new TextDecoder();
  return decoder.decode(plainBytes);
}