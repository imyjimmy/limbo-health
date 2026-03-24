import type { PortalProfile } from '../../types/portal';
import { encodeOwnerScope } from './storageScope';

interface JsonStoreAdapter {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const STORAGE_KEY_PREFIX = 'limbo.portal_profiles.v1';

function normalizeProfile(profile: PortalProfile): PortalProfile {
  return {
    ...profile,
    healthSystemId: profile.healthSystemId.trim(),
    healthSystemName: profile.healthSystemName.trim(),
    displayName: profile.displayName.trim(),
    portalName: profile.portalName?.trim() || null,
    portalScope: profile.portalScope.trim(),
    baseUrl: profile.baseUrl.trim(),
    loginUrl: profile.loginUrl.trim(),
    registrationUrl: profile.registrationUrl?.trim() || null,
    usernameHint: profile.usernameHint.trim(),
    credentialKey: profile.credentialKey.trim(),
  };
}

function sortProfiles(left: PortalProfile, right: PortalProfile): number {
  const leftTs = left.lastSuccessfulLoginAt ? Date.parse(left.lastSuccessfulLoginAt) : 0;
  const rightTs = right.lastSuccessfulLoginAt ? Date.parse(right.lastSuccessfulLoginAt) : 0;

  if (leftTs !== rightTs) {
    return rightTs - leftTs;
  }

  return left.displayName.localeCompare(right.displayName);
}

export class PortalProfileStore {
  private readonly store: JsonStoreAdapter;
  private readonly storageKey: string;

  constructor(store: JsonStoreAdapter, ownerKey: string) {
    this.store = store;
    this.storageKey = `${STORAGE_KEY_PREFIX}.${encodeOwnerScope(ownerKey)}`;
  }

  async listProfiles(): Promise<PortalProfile[]> {
    const raw = await this.store.getItemAsync(this.storageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as PortalProfile[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map(normalizeProfile).sort(sortProfiles);
    } catch (_error) {
      return [];
    }
  }

  async getProfile(profileId: string): Promise<PortalProfile | null> {
    const profiles = await this.listProfiles();
    return profiles.find((profile) => profile.id === profileId) ?? null;
  }

  async upsertProfile(profile: PortalProfile): Promise<PortalProfile[]> {
    const normalized = normalizeProfile(profile);
    const profiles = await this.listProfiles();
    const nextProfiles = profiles.some((candidate) => candidate.id === normalized.id)
      ? profiles.map((candidate) => (candidate.id === normalized.id ? normalized : candidate))
      : [...profiles, normalized];

    const sortedProfiles = nextProfiles.sort(sortProfiles);
    await this.store.setItemAsync(this.storageKey, JSON.stringify(sortedProfiles));
    return sortedProfiles;
  }

  async deleteProfile(profileId: string): Promise<PortalProfile[]> {
    const profiles = await this.listProfiles();
    const nextProfiles = profiles.filter((profile) => profile.id !== profileId);

    if (nextProfiles.length === 0) {
      await this.store.deleteItemAsync(this.storageKey);
      return [];
    }

    await this.store.setItemAsync(this.storageKey, JSON.stringify(nextProfiles));
    return nextProfiles;
  }
}
