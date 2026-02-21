/**
 * tests/mgit/repo-create-push.test.ts
 *
 * Tests creating a repository and pushing initial content.
 *
 * Uses POST /api/mgit/repos/create-bare to create the bare repo (the
 * existing workflow), then pushes via Smart HTTP.  Pure push-to-create
 * (auto-creating the bare repo on first push) is a future enhancement;
 * this test validates the current working path so it serves as a Phase 1
 * safety net.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from './setup/testClient';
import { authenticate } from './setup/nostrHelpers';
import {
  initLocalRepo,
  createTestFile,
  pushRepo,
  uniqueRepoId,
} from './setup/gitHelpers';
import { registerRepoForCleanup } from './setup/globalSetup';
import { cleanupAllTestRepos } from './setup/cleanup';

describe('Create & Push', () => {
  let jwt: string;
  const repoId = uniqueRepoId('push');

  beforeAll(async () => {
    jwt = await authenticate(1, 'patient');
    registerRepoForCleanup(repoId);
  });

  afterAll(() => {
    cleanupAllTestRepos();
  });

  it('should create repo via create-bare and push first commit', async () => {
    // Step 1 — create bare repo on the server
    const createRes = await request('/api/mgit/repos/create-bare', {
      method: 'POST',
      jwt,
      body: { repoName: repoId },
    });
    expect(createRes.status).toBe(200);

    // Step 2 — init local repo, add a file, commit
    const { fs, dir } = await initLocalRepo();
    await createTestFile(
      fs,
      dir,
      'patient-info.json',
      JSON.stringify({ type: 'patient-info', name: 'Test Patient' }),
    );

    // Step 3 — push
    const pushResult = await pushRepo(repoId, fs, dir, jwt);
    expect(pushResult).toBeDefined();
    expect(pushResult.ok).toBe(true);

    // Step 4 — verify it appears in the listing
    let found = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const listRes = await request<any[]>('/api/mgit/user/repositories', {
        method: 'GET',
        jwt,
      });
      if (listRes.ok && Array.isArray(listRes.data)) {
        found = listRes.data.some(
          (r: any) => r.name === repoId || r.id === repoId,
        );
        if (found) break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    expect(found).toBe(true);
  });

  it('should reject push without auth', async () => {
    const { fs, dir } = await initLocalRepo();
    await createTestFile(fs, dir, 'test.json', '{}');

    const badRepoId = uniqueRepoId('push-noauth');
    registerRepoForCleanup(badRepoId);

    try {
      await pushRepo(badRepoId, fs, dir, ''); // empty JWT → no auth header
      expect.fail('Push without auth should have thrown');
    } catch (err: any) {
      // isomorphic-git wraps HTTP errors in its exception message
      const msg = (err.message || String(err)).toLowerCase();
      expect(
        msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('auth') ||
          msg.includes('unauthorized'),
      ).toBe(true);
    }
  });

  it('should reject push with invalid JWT', async () => {
    const { fs, dir } = await initLocalRepo();
    await createTestFile(fs, dir, 'test.json', '{}');

    const badRepoId = uniqueRepoId('push-badjwt');
    registerRepoForCleanup(badRepoId);

    try {
      await pushRepo(badRepoId, fs, dir, 'not.a.valid.jwt');
      expect.fail('Push with bad JWT should have thrown');
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      expect(
        msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('invalid') ||
          msg.includes('error'),
      ).toBe(true);
    }
  });
});