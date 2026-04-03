import { describe, expect, it } from 'vitest';
import { detectPortalFamily, getPortalAdapter } from '../core/portal/adapters';
import { resolvePortalOwnerKey } from '../core/portal/storageScope';

describe('portal adapter helpers', () => {
  it('detects known portal families from common URLs and names', () => {
    expect(
      detectPortalFamily({
        url: 'https://mychart.texashealth.org/MyChart/Authentication/Login',
        portalName: 'MyChart',
      }),
    ).toBe('mychart');

    expect(
      detectPortalFamily({
        url: 'https://12345.portal.athenahealth.com',
        portalName: 'athenahealth',
      }),
    ).toBe('athena');

    expect(
      detectPortalFamily({
        url: 'https://patientportal.example.org/login',
        healthSystemName: 'Example Health',
      }),
    ).toBe('generic');
  });

  it('returns stable adapter metadata for supported families', () => {
    const adapter = getPortalAdapter('mychart');
    expect(adapter.usernameHint).toContain('Email');
    expect(adapter.login.passwordSelectors).toContain('input[type="password"]');
  });
});

describe('portal storage scoping', () => {
  it('keeps portal data scoped to the authenticated identity', () => {
    expect(
      resolvePortalOwnerKey({
        status: 'authenticated',
        pubkey: 'abc123',
        loginMethod: 'nostr',
      }),
    ).toBe('nostr:abc123');

    expect(
      resolvePortalOwnerKey({
        status: 'authenticated',
        pubkey: null,
        loginMethod: 'google',
        oauthProviderUserId: 'google-user-1',
      }),
    ).toBe('google-id:google-user-1');

    expect(
      resolvePortalOwnerKey({
        status: 'authenticated',
        pubkey: null,
        loginMethod: 'apple',
        oauthProviderUserId: 'apple-user-1',
      }),
    ).toBe('apple-id:apple-user-1');

    expect(
      resolvePortalOwnerKey({
        status: 'signed_out',
        pubkey: null,
        loginMethod: null,
      }),
    ).toBeNull();
  });
});
