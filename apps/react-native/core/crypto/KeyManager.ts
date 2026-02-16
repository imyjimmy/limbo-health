// core/crypto/KeyManager.ts
// Manages the master Nostr private key (iOS Keychain via expo-secure-store),
// derives public keys, computes conversation keys, generates ephemeral keypairs.
//
// Core layer rule: no direct Expo imports. SecureStore is injected.

import { secp256k1, schnorr } from '@noble/curves/secp256k1';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getConversationKey } from './nip44';

// --- Injected platform dependency ---

export interface SecureStoreAdapter {
  getItemAsync(key: string, options?: { requireAuthentication?: boolean }): Promise<string | null>;
  setItemAsync(key: string, value: string, options?: { requireAuthentication?: boolean; keychainAccessible?: number }): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

// --- Constants ---

const KEYCHAIN_KEY = 'limbo_master_privkey';
const SENTINEL_KEY = 'limbo_has_key';

// --- KeyManager ---

export class KeyManager {
  private store: SecureStoreAdapter;

  constructor(store: SecureStoreAdapter) {
    this.store = store;
  }

  /**
   * Read master private key from Keychain. Triggers biometric prompt.
   * Returns null if no key is stored (first launch / logged out).
   */
  async getMasterPrivkey(): Promise<Uint8Array | null> {
    const hex = await this.store.getItemAsync(KEYCHAIN_KEY, {
      requireAuthentication: true,
    });
    if (!hex) return null;
    return hexToBytes(hex);
  }

  /**
   * Derive the x-only public key (32 bytes, hex) from the stored master key.
   * Returns null if no key is stored.
   */
  async getMasterPubkey(): Promise<string | null> {
    const privkey = await this.getMasterPrivkey();
    if (!privkey) return null;
    return bytesToHex(schnorr.getPublicKey(privkey));
  }

  /**
   * Derive x-only public key from any private key (no Keychain access).
   */
  static pubkeyFromPrivkey(privkey: Uint8Array): string {
    return bytesToHex(schnorr.getPublicKey(privkey));
  }

  /**
   * Compute NIP-44 conversation key from a private key and a public key.
   * Re-exported from nip44.ts for convenience.
   */
  static computeConversationKey(
    privkey: Uint8Array,
    pubkey: string,
  ): Uint8Array {
    return getConversationKey(privkey, pubkey);
  }

  /**
   * Generate an ephemeral keypair for /scan sessions.
   * NOT stored in Keychain — lives in React state for session duration only.
   */
  static generateEphemeralKeypair(): {
    privkey: Uint8Array;
    pubkey: string;
  } {
    const privkey = secp256k1.utils.randomSecretKey();
    const pubkey = bytesToHex(schnorr.getPublicKey(privkey));
    return { privkey, pubkey };
  }

  /**
   * Store master private key in Keychain during onboarding.
   * Biometric-gated: accessible only when device is unlocked.
   */
  async storeMasterPrivkey(privkey: Uint8Array): Promise<void> {
    const hex = bytesToHex(privkey);
    await this.store.setItemAsync(KEYCHAIN_KEY, hex, {
      requireAuthentication: true,
      // expo-secure-store maps this to kSecAttrAccessibleWhenUnlockedThisDeviceOnly
      keychainAccessible: 6,
    });
    // Write non-biometric sentinel so hasStoredKey() never triggers Face ID
    await this.store.setItemAsync(SENTINEL_KEY, 'true');
  }

  /**
   * Delete master private key from Keychain. Used for logout / key rotation.
   */
  async deleteMasterPrivkey(): Promise<void> {
    await this.store.deleteItemAsync(KEYCHAIN_KEY);
    await this.store.deleteItemAsync(SENTINEL_KEY);
  }

  /**
   * Check if a master key exists without triggering biometric.
   * Uses a non-authenticated read — returns true/false only.
   */
  async hasStoredKey(): Promise<boolean> {
    const value = await this.store.getItemAsync(SENTINEL_KEY);
    return value === 'true';
  }
}