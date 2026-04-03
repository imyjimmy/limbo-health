export function resolvePortalOwnerKey(input: {
  status: string;
  pubkey: string | null;
  loginMethod: string | null;
  oauthProviderUserId?: string | null;
  oauthEmail?: string | null;
}): string | null {
  if (input.status !== 'authenticated' && input.status !== 'expired') {
    return null;
  }

  if (input.pubkey) {
    return `nostr:${input.pubkey}`;
  }

  if (input.loginMethod && input.loginMethod !== 'nostr' && input.oauthProviderUserId) {
    return `${input.loginMethod}-id:${input.oauthProviderUserId}`;
  }

  if (input.loginMethod && input.loginMethod !== 'nostr' && input.oauthEmail) {
    return `${input.loginMethod}-email:${input.oauthEmail}`;
  }

  return null;
}

export function encodeOwnerScope(ownerKey: string): string {
  return encodeURIComponent(ownerKey).replace(/%/g, '_');
}
