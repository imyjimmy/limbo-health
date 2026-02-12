/**
 * tests/mgit/repo-clone-pull.test.ts
 *
 * Tests clone and pull operations via Smart HTTP git protocol.
 * Repo is set up in beforeAll using create-bare + push.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { authenticate } from '../setup/nostrHelpers';
import { request } from '../setup/testClient';
import {
  initLocalRepo,
  createTestFile,
  pushRepo,
  cloneRepo,
  readFile,
  uniqueRepoId,
} from '../setup/gitHelpers';
import { registerRepoForCleanup } from '../setup/globalSetup';
import { cleanupAllTestRepos } from '../setup/cleanup';

describe('Clone & Pull', () => {
  let jwt: string;
  let jwt2: string;
  const repoId = uniqueRepoId('clone');
  const FILE_CONTENT = JSON.stringify({ type: 'test', data: 'initial' });

  beforeAll(async () => {
    jwt = await authenticate(1, 'patient');
    jwt2 = await authenticate(2, 'patient');
    registerRepoForCleanup(repoId);

    // Create and populate the repo
    await request('/api/mgit/repos/create-bare', {
      method: 'POST',
      jwt,
      body: { repoName: repoId },
    });

    const { fs, dir } = await initLocalRepo();
    await createTestFile(fs, dir, 'patient-info.json', FILE_CONTENT);
    await pushRepo(repoId, fs, dir, jwt);
  });

  afterAll(() => {
    cleanupAllTestRepos();
  });

  // ─── Clone ───────────────────────────────────────────────────────

  it('should clone existing repo', async () => {
    const { fs, dir } = await cloneRepo(repoId, jwt);
    const content = await readFile(fs, dir, 'patient-info.json');
    expect(content).toBe(FILE_CONTENT);
  });

  it('should reject clone without auth', async () => {
    try {
      await cloneRepo(repoId, '');
      expect.fail('Clone without auth should have thrown');
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      expect(
        msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('auth') ||
          msg.includes('unauthorized'),
      ).toBe(true);
    }
  });

  it('should reject clone by different user', async () => {
    try {
      // User 2 has no access to User 1's repo
      await cloneRepo(repoId, jwt2);
      expect.fail('Clone by different user should have thrown');
    } catch (err: any) {
      const msg = (err.message || String(err)).toLowerCase();
      // Server may return 403 (forbidden) or 404 (repo hidden from outsider)
      expect(
        msg.includes('401') ||
          msg.includes('403') ||
          msg.includes('404') ||
          msg.includes('not found') ||
          msg.includes('access denied'),
      ).toBe(true);
    }
  });

  // ─── Pull ────────────────────────────────────────────────────────

  it('should pull new commits after a second push', async () => {
    // Push a second file
    const { fs: pushFs, dir: pushDir } = await cloneRepo(repoId, jwt);
    const secondContent = JSON.stringify({ type: 'lab', test: 'CBC' });
    await createTestFile(pushFs, pushDir, 'labs/blood-test.json', secondContent);
    await pushRepo(repoId, pushFs, pushDir, jwt);

    // Clone fresh and verify both files exist
    const { fs: freshFs, dir: freshDir } = await cloneRepo(repoId, jwt);

    const original = await readFile(freshFs, freshDir, 'patient-info.json');
    expect(original).toBe(FILE_CONTENT);

    const added = await readFile(freshFs, freshDir, 'labs/blood-test.json');
    expect(added).toBe(secondContent);
  });
});