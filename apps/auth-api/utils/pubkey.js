import { nip19 } from 'nostr-tools';

/**
 * Normalize any pubkey to lowercase hex format.
 * Accepts: 64-char hex string or bech32 npub string.
 * Returns: 64-char lowercase hex string.
 */
export function normalizeToHex(pubkey) {
  if (!pubkey) throw new Error('pubkey is required');

  // Already hex
  if (/^[0-9a-fA-F]{64}$/.test(pubkey)) {
    return pubkey.toLowerCase();
  }

  // Bech32 npub
  if (pubkey.startsWith('npub')) {
    try {
      const decoded = nip19.decode(pubkey);
      if (decoded.type !== 'npub') {
        throw new Error('Expected npub, got ' + decoded.type);
      }
      return decoded.data.toLowerCase();
    } catch (err) {
      throw new Error('Invalid npub: ' + err.message);
    }
  }

  throw new Error('Invalid pubkey format: must be 64-char hex or npub');
}