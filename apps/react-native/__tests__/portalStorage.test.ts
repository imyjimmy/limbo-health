import { describe, expect, it } from 'vitest';
import { PortalCredentialVault } from '../core/portal/PortalCredentialVault';
import { PortalProfileStore } from '../core/portal/PortalProfileStore';
import type { PortalProfile } from '../types/portal';

class MemoryStore {
  private readonly values = new Map<string, string>();

  async getItemAsync(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItemAsync(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async deleteItemAsync(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function makeProfile(overrides: Partial<PortalProfile> = {}): PortalProfile {
  return {
    id: 'portal-1',
    healthSystemId: 'system-1',
    healthSystemName: 'Example Health',
    portalFamily: 'mychart',
    displayName: 'Example Health MyChart',
    portalName: 'MyChart',
    portalScope: 'most_records',
    baseUrl: 'https://portal.example.org',
    loginUrl: 'https://portal.example.org/login',
    registrationUrl: 'https://portal.example.org/signup',
    usernameHint: 'Email or username',
    credentialKey: 'portal-1',
    lastSuccessfulLoginAt: null,
    lastVerifiedAt: null,
    status: 'active',
    ...overrides,
  };
}

describe('portal storage helpers', () => {
  it('stores and retrieves portal profiles in owner scope', async () => {
    const store = new MemoryStore();
    const profileStore = new PortalProfileStore(store, 'nostr:test-owner');

    await profileStore.upsertProfile(makeProfile());
    await profileStore.upsertProfile(
      makeProfile({
        id: 'portal-2',
        displayName: 'Another Portal',
        credentialKey: 'portal-2',
        lastSuccessfulLoginAt: '2026-03-23T10:00:00.000Z',
      }),
    );

    const profiles = await profileStore.listProfiles();

    expect(profiles).toHaveLength(2);
    expect(profiles[0]?.id).toBe('portal-2');
    expect(profiles[1]?.id).toBe('portal-1');
  });

  it('tracks a non-secret credential sentinel separately from the secret payload', async () => {
    const store = new MemoryStore();
    const vault = new PortalCredentialVault(store);

    await vault.saveCredential('portal-1', {
      username: 'patient@example.org',
      password: 'super-secret',
      notes: 'Username is email',
      createdAt: '2026-03-23T00:00:00.000Z',
      lastUsedAt: null,
      lastVerifiedAt: null,
    });

    await expect(vault.hasCredential('portal-1')).resolves.toBe(true);
    await expect(vault.getCredential('portal-1')).resolves.toMatchObject({
      username: 'patient@example.org',
      notes: 'Username is email',
    });

    await vault.deleteCredential('portal-1');

    await expect(vault.hasCredential('portal-1')).resolves.toBe(false);
    await expect(vault.getCredential('portal-1')).resolves.toBeNull();
  });
});
