// core/crypto/base64.ts
// Pure lookup-table base64 encode/decode.
// No Buffer, atob, or btoa — safe for Hermes.

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const lookup = new Uint8Array(128);
for (let i = 0; i < CHARS.length; i++) {
  lookup[CHARS.charCodeAt(i)] = i;
}

/**
 * Encode a Uint8Array to a base64 string.
 */
export function encode(bytes: Uint8Array): string {
  const len = bytes.length;
  let result = '';
  let i = 0;

  while (i < len) {
    const a = bytes[i++];
    const b = i < len ? bytes[i++] : 0;
    const c = i < len ? bytes[i++] : 0;

    const triplet = (a << 16) | (b << 8) | c;

    const padCount = i - len; // 0, 0, or will be 1 or 2 at the end

    result += CHARS[(triplet >> 18) & 0x3f];
    result += CHARS[(triplet >> 12) & 0x3f];
    result += CHARS[(triplet >> 6) & 0x3f];
    result += CHARS[triplet & 0x3f];
  }

  // Fix padding
  const remainder = len % 3;
  if (remainder === 1) {
    result = result.slice(0, -2) + '==';
  } else if (remainder === 2) {
    result = result.slice(0, -1) + '=';
  }

  return result;
}

/**
 * Decode a base64 string to a Uint8Array.
 */
export function decode(base64: string): Uint8Array {
  // Strip whitespace and padding
  let str = base64.replace(/[\s]/g, '');
  const padLen = str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0;
  str = str.replace(/=/g, '');

  const byteLen = (str.length * 3) / 4;
  const bytes = new Uint8Array(byteLen);

  let p = 0;
  for (let i = 0; i < str.length; i += 4) {
    const a = lookup[str.charCodeAt(i)];
    const b = lookup[str.charCodeAt(i + 1)];
    const c = lookup[str.charCodeAt(i + 2)];
    const d = lookup[str.charCodeAt(i + 3)];

    const triplet = (a << 18) | (b << 12) | (c << 6) | d;

    bytes[p++] = (triplet >> 16) & 0xff;
    if (p < byteLen) bytes[p++] = (triplet >> 8) & 0xff;
    if (p < byteLen) bytes[p++] = triplet & 0xff;
  }

  return bytes;
}

/**
 * Encode a UTF-8 string to base64.
 */
export function encodeString(str: string): string {
  const encoder = new TextEncoder();
  return encode(encoder.encode(str));
}

/**
 * Decode a base64 string to a UTF-8 string.
 */
export function decodeString(base64: string): string {
  const decoder = new TextDecoder();
  return decoder.decode(decode(base64));
}

/**
 * Encode a Uint8Array to a hex string.
 * Used for Nostr pubkeys and event IDs.
 */
// USE import { bytesToHex, concatBytes, hexToBytes } from '@noble/hashes/utils.js';