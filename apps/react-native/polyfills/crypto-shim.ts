// polyfills/crypto-shim.ts
// Bridges expo-crypto's getRandomValues to globalThis.crypto
// Must be imported before any @noble library or isomorphic-git

import { getRandomValues } from 'expo-crypto';

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {} as Crypto;
}

if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  globalThis.crypto.getRandomValues = getRandomValues as any;
}