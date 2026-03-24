import type { AuthState, OAuthConnection } from '../../types/auth';

const STORAGE_KEY_PREFIX = 'limbo_bio_profile_v1';

function pushOwnerKey(target: string[], ownerKey: string | null): void {
  if (!ownerKey || target.includes(ownerKey)) return;
  target.push(ownerKey);
}

function googleOwnerKeysFromConnections(connections: OAuthConnection[]): string[] {
  const ownerKeys: string[] = [];

  for (const connection of connections) {
    if (connection.provider.trim().toLowerCase() !== 'google') continue;

    pushOwnerKey(ownerKeys, connection.providerId ? `google-id:${connection.providerId}` : null);
    pushOwnerKey(ownerKeys, connection.email ? `google-email:${connection.email}` : null);
  }

  return ownerKeys;
}

export function resolveBioProfileOwnerKeys(
  auth: Pick<AuthState, 'status' | 'pubkey' | 'googleProfile' | 'connections'>,
): string[] {
  if (auth.status !== 'authenticated' && auth.status !== 'expired') return [];

  const ownerKeys: string[] = [];

  pushOwnerKey(ownerKeys, auth.pubkey ? `nostr:${auth.pubkey}` : null);
  pushOwnerKey(
    ownerKeys,
    auth.googleProfile?.googleId ? `google-id:${auth.googleProfile.googleId}` : null,
  );
  pushOwnerKey(
    ownerKeys,
    auth.googleProfile?.email ? `google-email:${auth.googleProfile.email}` : null,
  );

  for (const connectionOwnerKey of googleOwnerKeysFromConnections(auth.connections)) {
    pushOwnerKey(ownerKeys, connectionOwnerKey);
  }

  return ownerKeys;
}

export function storageKeyForBioProfileOwner(ownerKey: string): string {
  const encodedOwner = encodeURIComponent(ownerKey).replace(/%/g, '_');
  return `${STORAGE_KEY_PREFIX}.${encodedOwner}`;
}
