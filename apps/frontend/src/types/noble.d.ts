declare module '@noble/curves/secp256k1' {
  export const secp256k1: any;
}
declare module '@noble/hashes/hkdf' {
  export const hkdf: any;
  export const extract: any;
}
declare module '@noble/hashes/sha2' {
  export const sha256: any;
}
declare module '@noble/hashes/hmac' {
  export const hmac: any;
}
declare module '@noble/hashes/utils' {
  export function concatBytes(...arrays: Uint8Array[]): Uint8Array;
  export function hexToBytes(hex: string): Uint8Array;
  export function bytesToHex(bytes: Uint8Array): string;
}
declare module '@noble/ciphers/chacha' {
  export function chacha20(key: Uint8Array, nonce: Uint8Array, data: Uint8Array): Uint8Array;
}