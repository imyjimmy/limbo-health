import { describe, expect, it } from 'vitest';
import {
  resolveBioProfileOwnerKeys,
  storageKeyForBioProfileOwner,
} from '../core/bio/storage';

describe('bio profile owner key resolution', () => {
  it('uses Google identifiers for a Google-only session', () => {
    expect(
      resolveBioProfileOwnerKeys({
        status: 'authenticated',
        pubkey: null,
        oauthProfile: {
          provider: 'google',
          email: 'person@example.com',
          providerUserId: 'google-123',
          name: 'Person Example',
        },
        connections: [],
      }),
    ).toEqual(['google-id:google-123', 'google-email:person@example.com']);
  });

  it('prefers the Nostr pubkey but keeps Google fallbacks after linking', () => {
    expect(
      resolveBioProfileOwnerKeys({
        status: 'authenticated',
        pubkey: 'npub-linked',
        oauthProfile: {
          provider: 'google',
          email: 'person@example.com',
          providerUserId: 'google-123',
          name: 'Person Example',
        },
        connections: [],
      }),
    ).toEqual([
      'nostr:npub-linked',
      'google-id:google-123',
      'google-email:person@example.com',
    ]);
  });

  it('uses linked OAuth connections during a Nostr session', () => {
    expect(
      resolveBioProfileOwnerKeys({
        status: 'authenticated',
        pubkey: 'npub-linked',
        oauthProfile: null,
        connections: [
          { provider: 'google', providerId: 'google-123', email: 'person@example.com' },
          { provider: 'github', providerId: 'gh-1', email: 'person@example.com' },
        ],
      }),
    ).toEqual([
      'nostr:npub-linked',
      'google-id:google-123',
      'google-email:person@example.com',
      'github-id:gh-1',
      'github-email:person@example.com',
    ]);
  });

  it('deduplicates overlapping Google identity sources', () => {
    expect(
      resolveBioProfileOwnerKeys({
        status: 'authenticated',
        pubkey: 'npub-linked',
        oauthProfile: {
          provider: 'google',
          email: 'person@example.com',
          providerUserId: 'google-123',
          name: 'Person Example',
        },
        connections: [
          { provider: 'google', providerId: 'google-123', email: 'person@example.com' },
        ],
      }),
    ).toEqual([
      'nostr:npub-linked',
      'google-id:google-123',
      'google-email:person@example.com',
    ]);
  });

  it('scopes Apple sessions with Apple identifiers', () => {
    expect(
      resolveBioProfileOwnerKeys({
        status: 'authenticated',
        pubkey: null,
        oauthProfile: {
          provider: 'apple',
          email: 'relay@privaterelay.appleid.com',
          providerUserId: 'apple-123',
          name: 'Person Example',
        },
        connections: [],
      }),
    ).toEqual([
      'apple-id:apple-123',
      'apple-email:relay@privaterelay.appleid.com',
    ]);
  });
});

describe('bio profile storage keys', () => {
  it('encodes owner keys for SecureStore', () => {
    expect(storageKeyForBioProfileOwner('google-email:person@example.com')).toBe(
      'limbo_bio_profile_v1.google-email_3Aperson_40example.com',
    );
  });
});
