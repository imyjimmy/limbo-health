import type { AuthState, OAuthConnection } from '../../types/auth';

const STORAGE_KEY_PREFIX = 'limbo_bio_profile_v1';

function pushOwnerKey(target: string[], ownerKey: string | null): void {
  if (!ownerKey || target.includes(ownerKey)) return;
  target.push(ownerKey);
}

function oauthOwnerKeysFromConnections(connections: OAuthConnection[]): string[] {
  const ownerKeys: string[] = [];

  for (const connection of connections) {
    const provider = connection.provider.trim().toLowerCase();
    if (!provider) continue;

    pushOwnerKey(ownerKeys, connection.providerId ? `${provider}-id:${connection.providerId}` : null);
    pushOwnerKey(ownerKeys, connection.email ? `${provider}-email:${connection.email}` : null);
  }

  return ownerKeys;
}

export function resolveBioProfileOwnerKeys(
  auth: Pick<AuthState, 'status' | 'pubkey' | 'oauthProfile' | 'connections'>,
): string[] {
  if (auth.status !== 'authenticated' && auth.status !== 'expired') return [];

  const ownerKeys: string[] = [];

  pushOwnerKey(ownerKeys, auth.pubkey ? `nostr:${auth.pubkey}` : null);
  pushOwnerKey(
    ownerKeys,
    auth.oauthProfile?.providerUserId
      ? `${auth.oauthProfile.provider}-id:${auth.oauthProfile.providerUserId}`
      : null,
  );
  pushOwnerKey(
    ownerKeys,
    auth.oauthProfile?.email ? `${auth.oauthProfile.provider}-email:${auth.oauthProfile.email}` : null,
  );

  for (const connectionOwnerKey of oauthOwnerKeysFromConnections(auth.connections)) {
    pushOwnerKey(ownerKeys, connectionOwnerKey);
  }

  return ownerKeys;
}

export function storageKeyForBioProfileOwner(ownerKey: string): string {
  const encodedOwner = encodeURIComponent(ownerKey).replace(/%/g, '_');
  return `${STORAGE_KEY_PREFIX}.${encodedOwner}`;
}
