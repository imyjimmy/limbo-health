import { getRandomValues } from 'expo-crypto';
import { Buffer } from 'buffer';

globalThis.Buffer = Buffer;

if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = {} as Crypto;
}
if (typeof globalThis.crypto.getRandomValues === 'undefined') {
  globalThis.crypto.getRandomValues = getRandomValues as any;
}