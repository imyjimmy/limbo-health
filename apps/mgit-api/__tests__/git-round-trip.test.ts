/**
 * tests/mgit/git-round-trip.test.ts
 *
 * The critical regression test.
 * Exercises the full git lifecycle through the Smart HTTP protocol:
 *
 *   create-bare → push (3 files) → clone → verify
 *   → modify 1 file + add 1 file → push → clone again → verify
 *   → check commit log
 *
 * If any auth middleware change breaks the git transport, this test catches it.
 */
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
  getCommitLog,
  uniqueRepoId,
  makeEncryptedEnvelope,
} from './setup/gitHelpers';
import { registerRepoForCleanup } from './setup/globalSetup';
import { cleanupAllTestRepos } from './setup/cleanup';

describe('Git Round-Trip Lifecycle', () => {
  let jwt: string;
  const repoId = uniqueRepoId('roundtrip');

  // Canned test data
  const visitData = makeEncryptedEnvelope('visit:2025-01-15:Dr. Test');
  const labData = makeEncryptedEnvelope('lab:2025-01-15:CBC:normal');
  const patientInfo = makeEncryptedEnvelope('patient-info:Test Patient:1990-01-01');

  beforeAll(async () => {
    jwt = await authenticate(1, 'patient');
    registerRepoForCleanup(repoId);

    // Create the bare repo on the server
    const createRes = await request('/api/mgit/repos/create-bare', {
      method: 'POST',
      jwt,
      body: { repoName: repoId },
    });
    expect(createRes.status).toBe(200);
  });

  afterAll(() => {
    cleanupAllTestRepos();
  });

  it('should complete full git lifecycle', async () => {
    // ── 1. Init local repo, add 3 files in different folders ───────

    const { fs: originFs, dir: originDir } = await initLocalRepo();

    await createTestFile(
      originFs, originDir,
      'visits/2025-01-15-checkup.json',
      visitData,
      'Add visit record',
    );
    await createTestFile(
      originFs, originDir,
      'labs/2025-01-15-cbc.json',
      labData,
      'Add lab result',
    );
    await createTestFile(
      originFs, originDir,
      'patient-info.json',
      patientInfo,
      'Add patient info',
    );

    // ── 2. Push ────────────────────────────────────────────────────

    const push1 = await pushRepo(repoId, originFs, originDir, jwt);
    expect(push1).toBeDefined();
    expect(push1.ok).toBe(true);

    // ── 3. Clone into a fresh FS ───────────────────────────────────

    const { fs: cloneFs, dir: cloneDir } = await cloneRepo(repoId, jwt);

    // ── 4. Assert all 3 files present with correct content ─────────

    expect(await readFile(cloneFs, cloneDir, 'visits/2025-01-15-checkup.json')).toBe(visitData);
    expect(await readFile(cloneFs, cloneDir, 'labs/2025-01-15-cbc.json')).toBe(labData);
    expect(await readFile(cloneFs, cloneDir, 'patient-info.json')).toBe(patientInfo);

    // ── 5. Modify one file ─────────────────────────────────────────

    const updatedPatientInfo = makeEncryptedEnvelope(
      'patient-info:Test Patient:1990-01-01:555-0123',
    );

    await cloneFs.promises.writeFile(
      `${cloneDir}/patient-info.json`,
      updatedPatientInfo,
      'utf8'
    );
    await git.add({ fs: cloneFs, dir: cloneDir, filepath: 'patient-info.json' });
    await git.commit({
      fs: cloneFs,
      dir: cloneDir,
      message: makeEncryptedEnvelope('Update patient info with phone'),
      author: { name: 'Test User', email: 'test@limbo.health' },
    });

    // ── 6. Add a fourth file ───────────────────────────────────────

    const imagingData = makeEncryptedEnvelope('imaging:2025-01-16:X-ray:chest');

    await createTestFile(
      cloneFs, cloneDir,
      'imaging/2025-01-16-chest-xray.json',
      imagingData,
      'Add chest X-ray report',
    );

    // ── 7. Push changes ────────────────────────────────────────────

    const push2 = await pushRepo(repoId, cloneFs, cloneDir, jwt);
    expect(push2).toBeDefined();
    expect(push2.ok).toBe(true);

    // ── 8. Clone again to verify everything persisted ──────────────

    const { fs: verifyFs, dir: verifyDir } = await cloneRepo(repoId, jwt);

    // Modified file
    expect(await readFile(verifyFs, verifyDir, 'patient-info.json')).toBe(updatedPatientInfo);

    // New file
    expect(await readFile(verifyFs, verifyDir, 'imaging/2025-01-16-chest-xray.json')).toBe(imagingData);

    // Original files unchanged
    expect(await readFile(verifyFs, verifyDir, 'visits/2025-01-15-checkup.json')).toBe(visitData);
    expect(await readFile(verifyFs, verifyDir, 'labs/2025-01-15-cbc.json')).toBe(labData);

    // ── 9. Commit log ──────────────────────────────────────────────

    const log = await getCommitLog(verifyFs, verifyDir);

    // 5 commits: visit, lab, patient-info, update patient-info, imaging
    expect(log).toHaveLength(5);

    // Most recent first; commit messages must remain encrypted envelopes at rest.
    expect(log[0].message).toMatch(/^A[A-Za-z0-9+/=]{47,}$/);
    expect(log[log.length - 1].message).toMatch(/^A[A-Za-z0-9+/=]{47,}$/);
  });
});
