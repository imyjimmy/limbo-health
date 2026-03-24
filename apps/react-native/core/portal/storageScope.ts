export function resolvePortalOwnerKey(input: {
  status: string;
  pubkey: string | null;
  loginMethod: string | null;
  googleId?: string | null;
  googleEmail?: string | null;
}): string | null {
  if (input.status !== 'authenticated' && input.status !== 'expired') {
    return null;
  }

  if (input.pubkey) {
    return `nostr:${input.pubkey}`;
  }

  if (input.loginMethod === 'google' && input.googleId) {
    return `google-id:${input.googleId}`;
  }

  if (input.loginMethod === 'google' && input.googleEmail) {
    return `google-email:${input.googleEmail}`;
  }

  return null;
}

export function encodeOwnerScope(ownerKey: string): string {
  return encodeURIComponent(ownerKey).replace(/%/g, '_');
}
