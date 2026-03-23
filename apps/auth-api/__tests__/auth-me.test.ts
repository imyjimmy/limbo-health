/**
 * apps/auth-api/__tests__/auth-me.test.ts
 *
 * Integration coverage for GET /api/auth/me.
 * Verifies auth guarding, profile payload shape, and oauth_connections mapping.
 */
import { describe, it, expect } from 'vitest';
import { Client } from 'pg';
import { authenticate } from './setup/nostrHelpers';
import { request } from './setup/testClient';

interface MeResponse {
  status: string;
  reason?: string;
  user: {
    id: number;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    nostrPubkey: string | null;
    role: number;
  };
  connections: Array<{
    provider: string;
    email: string | null;
    providerId: string;
  }>;
}

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgres://postgres:postgres@localhost:5433/records_workflow';

async function runSql(sql: string, params: unknown[] = []): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(sql, params);
  } finally {
    await client.end();
  }
}

describe('GET /api/auth/me', () => {
  it('should require Authorization header', async () => {
    const res = await request<{ status: string; reason: string }>('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.data.status).toBe('error');
  });

  it('should reject invalid JWT', async () => {
    const res = await request<{ status: string; reason: string }>('/api/auth/me', {
      jwt: 'not-a-real-token',
    });
    expect(res.status).toBe(401);
    expect(res.data.status).toBe('error');
  });

  it('should return user profile and oauth connections for authenticated user', async () => {
    const jwt = await authenticate(1, 'patient');

    const initial = await request<MeResponse>('/api/auth/me', { jwt });
    expect(initial.status).toBe(200);
    expect(initial.data.status).toBe('OK');
    expect(typeof initial.data.user.id).toBe('number');
    expect(initial.data.user.nostrPubkey).toBeTruthy();
    expect(Array.isArray(initial.data.connections)).toBe(true);

    const userId = initial.data.user.id;
    const providerUserId = `itest-google-${Date.now()}-${userId}`;
    const providerEmail = `itest-${userId}@example.com`;

    // Seed oauth_connections + name fields to verify /api/auth/me mapping.
    await runSql(
      `INSERT INTO oauth_connections (user_id, provider, provider_user_id, provider_email, access_token)
       VALUES ($1, 'google', $2, $3, 'test-token')`,
      [userId, providerUserId, providerEmail]
    );
    await runSql(
      `UPDATE users
       SET first_name = 'Integration', last_name = 'Tester'
       WHERE id = $1`,
      [userId]
    );

    const seeded = await request<MeResponse>('/api/auth/me', { jwt });
    expect(seeded.status).toBe(200);
    expect(seeded.data.status).toBe('OK');
    expect(seeded.data.user.firstName).toBe('Integration');
    expect(seeded.data.user.lastName).toBe('Tester');
    expect(seeded.data.connections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'google',
          email: providerEmail,
          providerId: providerUserId,
        }),
      ])
    );
  });
});
