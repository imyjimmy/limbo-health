// core/crypto/dek.ts
// DEK (Data Encryption Key) utilities for two-layer sidecar encryption.
//
// File format for .enc sidecars:
//   [version: 1 byte][wrappedDekLength: 2 bytes big-endian][wrappedDek: N bytes][nonce: 12 bytes][ciphertext+tag]
//
// - version: 0x02 for DEK-wrapped format
// - wrappedDek: the 32-byte random DEK, hex-encoded, then NIP-44-encrypted with the conversation key
// - nonce: 12-byte random nonce for ChaCha20-Poly1305
// - ciphertext+tag: bulk content encrypted with the DEK via ChaCha20-Poly1305 (tag is last 16 bytes)
//
// Legacy files (version !== 0x02) fall back to direct NIP-44 decrypt in EncryptedIO.

import { chacha20poly1305 } from '@noble/ciphers/chacha.js';
import { concatBytes } from '@noble/hashes/utils.js';

export const DEK_VERSION = 0x02;
const CHACHA_NONCE_LENGTH = 12;
const DEK_LENGTH = 32;

/**
 * Generate a random 32-byte DEK.
 */
export function generateDEK(): Uint8Array {
  const dek = new Uint8Array(DEK_LENGTH);
  globalThis.crypto.getRandomValues(dek);
  return dek;
}

/**
 * Encrypt bulk data with a DEK using ChaCha20-Poly1305.
 * Returns { nonce, ciphertext } where ciphertext includes the Poly1305 tag.
 */
export function encryptWithDEK(
  plaintext: Uint8Array,
  dek: Uint8Array,
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const nonce = new Uint8Array(CHACHA_NONCE_LENGTH);
  globalThis.crypto.getRandomValues(nonce);
  const cipher = chacha20poly1305(dek, nonce);
  const ciphertext = cipher.encrypt(plaintext);
  return { nonce, ciphertext };
}

/**
 * Decrypt bulk data with a DEK using ChaCha20-Poly1305.
 */
export function decryptWithDEK(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  dek: Uint8Array,
): Uint8Array {
  const cipher = chacha20poly1305(dek, nonce);
  return cipher.decrypt(ciphertext);
}

/**
 * Serialize DEK-wrapped sidecar into the on-disk format.
 *
 * @param wrappedDek - NIP-44 ciphertext string wrapping the hex-encoded DEK
 * @param nonce      - 12-byte ChaCha20-Poly1305 nonce
 * @param ciphertext - bulk ciphertext (includes Poly1305 tag)
 */
export function serializeDEKFile(
  wrappedDek: string,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
): Uint8Array {
  const wrappedDekBytes = utf8Encode(wrappedDek);
  const length = wrappedDekBytes.length;

  // 2-byte big-endian length prefix
  const lengthBytes = new Uint8Array(2);
  lengthBytes[0] = (length >> 8) & 0xff;
  lengthBytes[1] = length & 0xff;

  return concatBytes(
    new Uint8Array([DEK_VERSION]),
    lengthBytes,
    wrappedDekBytes,
    nonce,
    ciphertext,
  );
}

/**
 * Parse the on-disk DEK-wrapped sidecar format.
 * Returns null if this is a legacy file (first byte !== DEK_VERSION).
 */
export function parseDEKFile(
  data: Uint8Array,
): { wrappedDek: string; nonce: Uint8Array; ciphertext: Uint8Array } | null {
  if (data.length < 1 || data[0] !== DEK_VERSION) {
    return null; // legacy format
  }

  const wrappedDekLength = (data[1] << 8) | data[2];
  const wrappedDekStart = 3;
  const wrappedDekEnd = wrappedDekStart + wrappedDekLength;
  const nonceStart = wrappedDekEnd;
  const nonceEnd = nonceStart + CHACHA_NONCE_LENGTH;

  const wrappedDek = utf8Decode(data.slice(wrappedDekStart, wrappedDekEnd));
  const nonce = data.slice(nonceStart, nonceEnd);
  const ciphertext = data.slice(nonceEnd);

  return { wrappedDek, nonce, ciphertext };
}

/**
 * Extract just the wrapped DEK from a file without parsing bulk ciphertext into a separate buffer.
 * Used by rewrap operations to avoid unnecessary memory allocation.
 */
export function extractWrappedDEK(data: Uint8Array): {
  wrappedDek: string;
  headerLength: number; // bytes before the nonce (version + length prefix + wrappedDek)
} | null {
  if (data.length < 1 || data[0] !== DEK_VERSION) {
    return null;
  }

  const wrappedDekLength = (data[1] << 8) | data[2];
  const wrappedDekStart = 3;
  const wrappedDekEnd = wrappedDekStart + wrappedDekLength;

  return {
    wrappedDek: utf8Decode(data.slice(wrappedDekStart, wrappedDekEnd)),
    headerLength: wrappedDekEnd,
  };
}

// -- Helpers (no Buffer/atob/btoa — safe for Hermes) --

function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
