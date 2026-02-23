import git from 'isomorphic-git';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { request } from './setup/testClient';
import { authenticate } from './setup/nostrHelpers';
import {
  initLocalRepo,
  createTestFile,
  pushRepo,
  cloneRepo,
  readFile,
  uniqueRepoId,
  makeEncryptedEnvelope,
} from './setup/gitHelpers';
import { registerRepoForCleanup } from './setup/globalSetup';
import { cleanupAllTestRepos } from './setup/cleanup';

describe('Encrypted Push Policy', () => {
  let jwt: string;
  const rejectRepoId = uniqueRepoId('policy-reject');
  const acceptRepoId = uniqueRepoId('policy-accept');

  beforeAll(async () => {
    jwt = await authenticate(1, 'patient');
    registerRepoForCleanup(rejectRepoId);
    registerRepoForCleanup(acceptRepoId);

    const createReject = await request('/api/mgit/repos/create-bare', {
      method: 'POST',
      jwt,
      body: { repoName: rejectRepoId },
    });
    expect(createReject.status).toBe(200);

    const createAccept = await request('/api/mgit/repos/create-bare', {
      method: 'POST',
      jwt,
      body: { repoName: acceptRepoId },
    });
    expect(createAccept.status).toBe(200);
  });

  afterAll(() => {
    cleanupAllTestRepos();
  });

  it('rejects plaintext commit payloads', async () => {
    const { fs, dir } = await initLocalRepo();
    await fs.promises.writeFile(
      `${dir}/patient-info.json`,
      JSON.stringify({ type: 'patient-info', name: 'Plaintext User' }),
      'utf8',
    );
    await git.add({ fs, dir, filepath: 'patient-info.json' });
    await git.commit({
      fs,
      dir,
      message: 'Plaintext commit message',
      author: { name: 'Plain User', email: 'plain@example.com' },
    });

    try {
      await pushRepo(rejectRepoId, fs, dir, jwt);
      expect.fail('Plaintext push should be rejected by pre-receive policy');
    } catch (err: any) {
      const msg = String(err?.message || err).toLowerCase();
      expect(
        msg.includes('mgit_policy_reject') ||
          msg.includes('pre-receive') ||
          msg.includes('hook declined') ||
          msg.includes('rejected'),
      ).toBe(true);
    }
  });

  it('accepts encrypted-envelope payloads', async () => {
    const expected = makeEncryptedEnvelope('policy:test:encrypted-payload');
    const { fs, dir } = await initLocalRepo();
    await createTestFile(fs, dir, 'patient-info.json', expected, 'policy commit');

    const push = await pushRepo(acceptRepoId, fs, dir, jwt);
    expect(push.ok).toBe(true);

    const { fs: cloneFs, dir: cloneDir } = await cloneRepo(acceptRepoId, jwt);
    const content = await readFile(cloneFs, cloneDir, 'patient-info.json');
    expect(content).toBe(expected);
  });
});
