// core/scan/StagingRepo.ts
// Takes a staging directory of re-encrypted files, initializes a git repo,
// commits everything, and pushes to limbo.health as a disposable staging repo.
// Records the snapshot commit hash for later diffing.

import { GitEngine } from '../git/GitEngine';
import type { AuthConfig } from '../git/httpTransport';

// --- Types ---

export interface StagingPushResult {
  repoId: string;
  snapshotOid: string;  // commit hash of the initial push — the boundary marker
}

// --- StagingRepo ---

/**
 * Initialize, commit, and push a staging repo.
 *
 * @param stagingRepoDir - The repoDir for the staging copy (e.g. 'staging/scan-abc123')
 * @param auth - JWT auth config for the patient
 * @returns The staging repo ID and snapshot commit OID
 */
export async function pushStagingRepo(
  stagingRepoDir: string,
  auth: AuthConfig,
): Promise<StagingPushResult> {
  // Extract the repo ID from the dir path: 'staging/scan-abc123' → 'scan-abc123'
  const parts = stagingRepoDir.split('/');
  const repoId = parts[parts.length - 1];

  // Initialize git repo in staging directory
  await GitEngine.initBinder(stagingRepoDir);

  // Stage all files
  await GitEngine.addAll(stagingRepoDir);

  // Commit with a generic message (no PHI in commit messages)
  const snapshotOid = await GitEngine.commitEntry(
    stagingRepoDir,
    [], // addAll already staged everything
    'Shared medical records',
  );

  // Push to server — relies on push-to-create
  await GitEngine.push(stagingRepoDir, repoId, auth);

  return { repoId, snapshotOid };
}