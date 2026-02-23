/**
 * tests/mgit/repo-delete.test.ts
 *
 * Integration coverage for DELETE /api/mgit/repos/:repoId.
 * Verifies that:
 * - non-owner delete is rejected
 * - owner delete succeeds
 * - deleted repo is no longer returned by server-side listing
 * - clone attempts fail after deletion
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from './setup/testClient';
import { authenticate } from './setup/nostrHelpers';
import {
  initLocalRepo,
  createTestFile,
  pushRepo,
  cloneRepo,
  uniqueRepoId,
  makeEncryptedEnvelope,
} from './setup/gitHelpers';
import { registerRepoForCleanup } from './setup/globalSetup';
import { cleanupAllTestRepos } from './setup/cleanup';

async function listContainsRepo(jwt: string, repoId: string): Promise<boolean> {
  const listRes = await request<any[]>('/api/mgit/user/repositories', {
    method: 'GET',
    jwt,
  });
  if (!listRes.ok || !Array.isArray(listRes.data)) return false;
  return listRes.data.some((r: any) => r.id === repoId || r.name === repoId);
}

async function waitForRepoState(
  jwt: string,
  repoId: string,
  shouldExist: boolean,
  attempts = 6,
): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    const exists = await listContainsRepo(jwt, repoId);
    if (exists === shouldExist) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  const finalExists = await listContainsRepo(jwt, repoId);
  expect(finalExists).toBe(shouldExist);
}

describe('Repository Delete Endpoint', () => {
  let ownerJwt: string;
  let otherJwt: string;
  const repoId = uniqueRepoId('delete');

  beforeAll(async () => {
    ownerJwt = await authenticate(1, 'patient');
    otherJwt = await authenticate(2, 'patient');
    registerRepoForCleanup(repoId);

    // Create repo + first commit so DELETE exercises a real resource.
    const createRes = await request('/api/mgit/repos/create-bare', {
      method: 'POST',
      jwt: ownerJwt,
      body: { repoName: repoId },
    });
    expect(createRes.status).toBe(200);

    const { fs, dir } = await initLocalRepo();
    await createTestFile(
      fs,
      dir,
      'patient-info.json',
      makeEncryptedEnvelope('patient-info:Delete Test Patient'),
    );
    const pushResult = await pushRepo(repoId, fs, dir, ownerJwt);
    expect(pushResult.ok).toBe(true);

    await waitForRepoState(ownerJwt, repoId, true);
  });

  afterAll(() => {
    cleanupAllTestRepos();
  });

  it('should reject delete by non-owner', async () => {
    const res = await request(`/api/mgit/repos/${repoId}`, {
      method: 'DELETE',
      jwt: otherJwt,
    });
    expect(res.status).toBe(403);
    await waitForRepoState(ownerJwt, repoId, true);
  });

  it('should delete repo for owner and remove it from listing', async () => {
    const delRes = await request<{ status?: string; repoId?: string }>(
      `/api/mgit/repos/${repoId}`,
      {
        method: 'DELETE',
        jwt: ownerJwt,
      },
    );

    expect(delRes.status).toBe(200);
    expect(delRes.data?.status).toBe('OK');
    expect(delRes.data?.repoId).toBe(repoId);

    await waitForRepoState(ownerJwt, repoId, false);
  });

  it('should fail clone after deletion', async () => {
    try {
      await cloneRepo(repoId, ownerJwt);
      expect.fail('Clone should fail after repository deletion');
    } catch (err: any) {
      const msg = String(err?.message || err).toLowerCase();
      expect(
        msg.includes('404') ||
          msg.includes('403') ||
          msg.includes('not found') ||
          msg.includes('unauthorized') ||
          msg.includes('access'),
      ).toBe(true);
    }
  });
});
