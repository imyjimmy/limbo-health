// core/scan/ScanSession.ts
// Creates a scan session on the server and assembles the QR payload.
// The QR payload contains everything the doctor's browser needs:
// ephemeral private key, session token, staging repo ID, and server endpoint.

import { bytesToHex } from '@noble/hashes/utils.js';
import { API_BASE_URL } from '../../constants/api';

// --- Types ---

export interface ScanQRPayload {
  action: 'scan_session';
  ephemeralPrivkey: string;   // hex — doctor decrypts and encrypts with this
  sessionToken: string;       // grants read+write to staging repo only
  repoId: string;             // scan-{randomId}
  expiresAt: number;          // unix timestamp
  endpoint: string;           // https://limbo.health
}

interface CreateSessionResponse {
  sessionToken: string;
  expiresAt: number;
}

// --- Session creation ---

/**
 * Create a scan session on auth-api and assemble the full QR payload.
 *
 * @param repoId - The staging repo ID (e.g. 'scan-abc123')
 * @param ephemeralPrivkey - The ephemeral private key (32 bytes)
 * @param jwt - Patient's JWT for authentication
 * @returns The complete QR payload ready to encode
 */
export async function createScanSession(
  repoId: string,
  ephemeralPrivkey: Uint8Array,
  jwt: string,
): Promise<ScanQRPayload> {
  const res = await fetch(`${API_BASE_URL}/api/auth/scan/session`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ stagingRepoId: repoId }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Failed to create scan session: ${res.status} ${body}`);
  }

  const data: CreateSessionResponse = await res.json();

  return {
    action: 'scan_session',
    ephemeralPrivkey: bytesToHex(ephemeralPrivkey),
    sessionToken: data.sessionToken,
    repoId,
    expiresAt: data.expiresAt,
    endpoint: API_BASE_URL,
  };
}

/**
 * Revoke a scan session. Call after incorporating doctor's notes
 * or when the patient cancels sharing.
 */
export async function revokeScanSession(
  sessionToken: string,
  jwt: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/auth/scan/revoke`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sessionToken }),
  });

  if (!res.ok) {
    console.warn(`Failed to revoke scan session: ${res.status}`);
  }
}
