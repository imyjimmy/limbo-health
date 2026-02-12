// constants/api.ts
// Central API configuration. All endpoint URLs derive from this base.

export const API_BASE_URL = 'https://limbo.health';

// Auth endpoints
export const ENDPOINTS = {
  nostrChallenge: `${API_BASE_URL}/api/auth/nostr/challenge`,
  nostrVerify: `${API_BASE_URL}/api/auth/nostr/verify`,
  scanSessionCreate: `${API_BASE_URL}/api/auth/scan/session`,
  scanSessionRevoke: `${API_BASE_URL}/api/auth/scan/revoke`,
  userRepositories: `${API_BASE_URL}/api/mgit/user/repositories`,
} as const;

// Git remote URL builder (used by GitEngine)
export function gitRepoUrl(repoId: string): string {
  return `${API_BASE_URL}/api/mgit/repos/${repoId}`;
}