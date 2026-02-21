/**
 * tests/setup/cleanup.ts
 *
 * Delete test-created repos after a suite finishes.
 * Tries docker exec into the mgit-api container first,
 * falls back to direct filesystem if PRIVATE_REPOS_PATH is a bind-mount.
 */
import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { createdRepoIds } from './globalSetup';

const MGIT_CONTAINER = process.env.MGIT_CONTAINER || 'limbo-mgit-api-1';

function isSafeTestRepo(repoId: string): boolean {
  return repoId.startsWith('test-') || repoId.startsWith('scan-test-') || repoId.startsWith('scan-lifecycle-');
}

/** Delete the bare git directory from the mgit-api container. */
function deleteRepoFiles(repoId: string): void {
  if (!isSafeTestRepo(repoId)) {
    console.warn(`  ⚠ Refusing to delete "${repoId}" — not a test repo`);
    return;
  }

  // Try docker exec
  try {
    execSync(`docker exec ${MGIT_CONTAINER} rm -rf /app/private_repos/${repoId}`, {
      stdio: 'pipe',
      timeout: 5000,
    });
    console.log(`  🗑  Deleted repo files: ${repoId}`);
    return;
  } catch {
    /* fall through */
  }

  // Try direct filesystem
  const localPath = process.env.PRIVATE_REPOS_PATH;
  if (localPath) {
    const full = `${localPath}/${repoId}`;
    if (existsSync(full)) {
      rmSync(full, { recursive: true, force: true });
      console.log(`  🗑  Deleted repo files (local): ${repoId}`);
      return;
    }
  }

  console.log(`  ⚠ Could not delete "${repoId}" — may need manual cleanup`);
}

/** Delete the auth-persistence entry (SQLite inside the container). */
function deleteRepoAuth(repoId: string): void {
  if (!isSafeTestRepo(repoId)) return;

  try {
    const sql = `DELETE FROM repository_access WHERE repository_id='${repoId}'; DELETE FROM repositories WHERE id='${repoId}';`;
    execSync(`docker exec ${MGIT_CONTAINER} sqlite3 /app/data/auth.db "${sql}"`, {
      stdio: 'pipe',
      timeout: 5000,
    });
    console.log(`  🗑  Deleted auth config: ${repoId}`);
  } catch {
    // sqlite3 may not be in the container image — not critical
  }
}

/** Clean up every repo registered during this test run. */
export function cleanupAllTestRepos(): void {
  if (createdRepoIds.length === 0) return;
  console.log(`\n  🧹 Cleaning up ${createdRepoIds.length} test repo(s)…`);
  for (const id of createdRepoIds) {
    deleteRepoFiles(id);
    deleteRepoAuth(id);
  }
}