// lib/scanCrypto.ts
// Standalone NIP-44 v2 encrypt/decrypt using raw keys.
// No browser extension required — used by the /scan page
// where the ephemeral private key comes from the QR code.
//
// Ported from mobile app core/crypto/nip44.ts with browser-native base64.

import { secp256k1 } from '@noble/curves/secp256k1';
import { hkdf } from '@noble/hashes/hkdf';
import { extract as hkdfExtract } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha2';
import { hmac } from '@noble/hashes/hmac';
import { chacha20 } from '@noble/ciphers/chacha.js';
import { concatBytes, hexToBytes, bytesToHex } from '@noble/hashes/utils';

// --- Base64 (browser-native) ---

function b64encode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function b64decode(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Constants ---

const VERSION = 2;
const MIN_PLAINTEXT_SIZE = 1;
const MAX_PLAINTEXT_SIZE = 65535;
const HKDF_SALT = new TextEncoder().encode('nip44-v2');

// --- Conversation Key ---

export function getConversationKey(
  privkey: Uint8Array,
  pubkey: string,
): Uint8Array {
  const sharedPoint = secp256k1.getSharedSecret(privkey, hexToBytes('02' + pubkey));
  const sharedX = sharedPoint.slice(1, 33);
  return hkdfExtract(sha256, sharedX, HKDF_SALT);
}

/**
 * Derive the conversation key from just the ephemeral private key.
 * The scan flow uses encrypt-to-self on the ephemeral keypair:
 * ECDH(ephemeralPriv, ephemeralPub) → conversationKey
 */
export function getEphemeralConversationKey(privkeyHex: string): Uint8Array {
  const privkey = hexToBytes(privkeyHex);
  const pubkeyBytes = secp256k1.getPublicKey(privkey, true); // 33-byte compressed
  const pubkeyHex = bytesToHex(pubkeyBytes.slice(1));         // x-only, no prefix
  return getConversationKey(privkey, pubkeyHex);
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
  const prefix = new Uint8Array(2);
  prefix[0] = (unpaddedLen >> 8) & 0xff;
  prefix[1] = unpaddedLen & 0xff;
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

  return new TextDecoder().decode(unpadded);
}

// --- Message Keys ---

function getMessageKeys(
  conversationKey: Uint8Array,
  nonce: Uint8Array,
): { chachaKey: Uint8Array; chachaNonce: Uint8Array; hmacKey: Uint8Array } {
  if (conversationKey.length !== 32) throw new Error('invalid conversation_key length');
  if (nonce.length !== 32) throw new Error('invalid nonce length');

  const keys = hkdf(sha256, conversationKey, undefined, nonce, 76);
  return {
    chachaKey: keys.slice(0, 32),
    chachaNonce: keys.slice(32, 44),
    hmacKey: keys.slice(44, 76),
  };
}

// --- HMAC with AAD ---

function hmacAad(key: Uint8Array, message: Uint8Array, aad: Uint8Array): Uint8Array {
  if (aad.length !== 32) throw new Error('AAD associated data must be 32 bytes');
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

function encodePayload(nonce: Uint8Array, ciphertext: Uint8Array, mac: Uint8Array): string {
  const version = new Uint8Array([VERSION]);
  return b64encode(concatBytes(version, nonce, ciphertext, mac));
}

function decodePayload(payload: string): {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  mac: Uint8Array;
} {
  if (payload.length === 0 || payload[0] === '#') throw new Error('unknown version');
  if (payload.length < 132 || payload.length > 87472) throw new Error('invalid payload size');

  const data = b64decode(payload);
  if (data.length < 99 || data.length > 65603) throw new Error('invalid data size');
  if (data[0] !== VERSION) throw new Error('unknown version ' + data[0]);

  return {
    nonce: data.slice(1, 33),
    ciphertext: data.slice(33, data.length - 32),
    mac: data.slice(data.length - 32),
  };
}

// --- Standard NIP-44 encrypt/decrypt (≤65KB plaintext) ---

export function encrypt(plaintext: string, conversationKey: Uint8Array): string {
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);

  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(conversationKey, nonce);
  const padded = pad(plaintext);
  const ciphertext = chacha20(chachaKey, chachaNonce, padded);
  const mac = hmacAad(hmacKey, ciphertext, nonce);

  return encodePayload(nonce, ciphertext, mac);
}

export function decrypt(payload: string, conversationKey: Uint8Array): string {
  const { nonce, ciphertext, mac } = decodePayload(payload);
  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(conversationKey, nonce);

  const calculatedMac = hmacAad(hmacKey, ciphertext, nonce);
  if (!isEqualCt(calculatedMac, mac)) throw new Error('invalid MAC');

  const padded = chacha20(chachaKey, chachaNonce, ciphertext);
  return unpad(padded);
}

// --- Large payload encrypt/decrypt (sidecars exceeding 65KB) ---

const LARGE_VERSION = 0xff;

export function encryptLarge(data: string, conversationKey: Uint8Array): string {
  const plainBytes = new TextEncoder().encode(data);
  const nonce = new Uint8Array(32);
  crypto.getRandomValues(nonce);

  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(conversationKey, nonce);
  const ciphertext = chacha20(chachaKey, chachaNonce, plainBytes);
  const mac = hmacAad(hmacKey, ciphertext, nonce);

  const version = new Uint8Array([LARGE_VERSION]);
  return b64encode(concatBytes(version, nonce, ciphertext, mac));
}

export function decryptLarge(payload: string, conversationKey: Uint8Array): string {
  const data = b64decode(payload);
  if (data.length < 65) throw new Error('invalid large payload size');
  if (data[0] !== LARGE_VERSION) throw new Error('invalid large payload version: ' + data[0]);

  const nonce = data.slice(1, 33);
  const ciphertext = data.slice(33, data.length - 32);
  const mac = data.slice(data.length - 32);

  const { chachaKey, chachaNonce, hmacKey } = getMessageKeys(conversationKey, nonce);
  const calculatedMac = hmacAad(hmacKey, ciphertext, nonce);
  if (!isEqualCt(calculatedMac, mac)) throw new Error('invalid MAC');

  const plainBytes = chacha20(chachaKey, chachaNonce, ciphertext);
  return new TextDecoder().decode(plainBytes);
}