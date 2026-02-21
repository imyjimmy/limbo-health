/**
 * tests/mgit/repo-listing.test.ts
 *
 * Tests GET /api/mgit/user/repositories
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { request } from './setup/testClient';
import { authenticate } from './setup/nostrHelpers';

describe('Repository Listing', () => {
  let jwt: string;

  beforeAll(async () => {
    jwt = await authenticate(1, 'patient');
  });

  it('should return a list for authenticated user', async () => {
    const res = await request<any[]>('/api/mgit/user/repositories', {
      method: 'GET',
      jwt,
    });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
    // May be empty if no repos exist yet for this freshly-generated test pubkey
  });

  it('should reject unauthenticated request', async () => {
    const res = await request('/api/mgit/user/repositories', {
      method: 'GET',
    });

    expect(res.status).toBe(401);
  });

  it('should reject request with invalid JWT', async () => {
    const res = await request('/api/mgit/user/repositories', {
      method: 'GET',
      jwt: 'not.a.valid.jwt',
    });

    // mgit-api validateAuthToken → processAuthToken returns error → 401
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});