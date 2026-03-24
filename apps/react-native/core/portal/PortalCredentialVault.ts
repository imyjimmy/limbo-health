import type { PortalCredentialRecord } from '../../types/portal';

interface SecureStoreAdapter {
  getItemAsync(key: string, options?: { requireAuthentication?: boolean }): Promise<string | null>;
  setItemAsync(
    key: string,
    value: string,
    options?: { requireAuthentication?: boolean; keychainAccessible?: number },
  ): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const CREDENTIAL_KEY_PREFIX = 'limbo.portal_credential.v1';
const SENTINEL_KEY_PREFIX = 'limbo.portal_credential_sentinel.v1';
const IOS_THIS_DEVICE_ONLY_ACCESSIBILITY = 6;

function credentialKeyFor(scopeKey: string): string {
  return `${CREDENTIAL_KEY_PREFIX}.${encodeURIComponent(scopeKey)}`;
}

function sentinelKeyFor(scopeKey: string): string {
  return `${SENTINEL_KEY_PREFIX}.${encodeURIComponent(scopeKey)}`;
}

function normalizeCredential(record: PortalCredentialRecord): PortalCredentialRecord {
  return {
    ...record,
    username: record.username.trim(),
    password: record.password,
    notes: record.notes?.trim() || null,
  };
}

export class PortalCredentialVault {
  private readonly store: SecureStoreAdapter;

  constructor(store: SecureStoreAdapter) {
    this.store = store;
  }

  async hasCredential(scopeKey: string): Promise<boolean> {
    const value = await this.store.getItemAsync(sentinelKeyFor(scopeKey));
    return value === 'true';
  }

  async getCredential(scopeKey: string): Promise<PortalCredentialRecord | null> {
    const raw = await this.store.getItemAsync(credentialKeyFor(scopeKey), {
      requireAuthentication: true,
    });

    if (!raw) {
      return null;
    }

    try {
      return normalizeCredential(JSON.parse(raw) as PortalCredentialRecord);
    } catch (_error) {
      return null;
    }
  }

  async saveCredential(scopeKey: string, record: PortalCredentialRecord): Promise<void> {
    const normalized = normalizeCredential(record);

    await this.store.setItemAsync(credentialKeyFor(scopeKey), JSON.stringify(normalized), {
      requireAuthentication: true,
      keychainAccessible: IOS_THIS_DEVICE_ONLY_ACCESSIBILITY,
    });
    await this.store.setItemAsync(sentinelKeyFor(scopeKey), 'true');
  }

  async deleteCredential(scopeKey: string): Promise<void> {
    await this.store.deleteItemAsync(credentialKeyFor(scopeKey));
    await this.store.deleteItemAsync(sentinelKeyFor(scopeKey));
  }
}
