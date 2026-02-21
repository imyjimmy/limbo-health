/**
 * tests/setup/gitHelpers.ts
 *
 * Wrappers around isomorphic-git for integration tests.
 * Uses LightningFS for in-memory filesystems — no disk writes.
 * Uses isomorphic-git's node http transport with JWT injection via headers.
 */
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import LightningFS from '@isomorphic-git/lightning-fs';
import { GATEWAY_URL } from './globalSetup';

let fsCounter = 0;

// ─── Filesystem ────────────────────────────────────────────────────

/** Create a fresh in-memory filesystem (each needs a unique name). */
export function createFS(): InstanceType<typeof LightningFS> {
  return new LightningFS(`testfs-${++fsCounter}-${Date.now()}`);
}

// ─── URL builder ───────────────────────────────────────────────────

function repoUrl(repoId: string): string {
  return `${GATEWAY_URL}/api/mgit/repos/${repoId}`;
}

// ─── Auth headers ──────────────────────────────────────────────────

function authHeaders(jwt: string): Record<string, string> {
  return jwt ? { Authorization: `Bearer ${jwt}` } : {};
}

// ─── Init ──────────────────────────────────────────────────────────

/**
 * Init a brand-new local repo in a fresh in-memory FS.
 * Returns { fs, dir } ready for createTestFile + push.
 */
export async function initLocalRepo(): Promise<{
  fs: InstanceType<typeof LightningFS>;
  dir: string;
}> {
  const fs = createFS();
  const dir = '/repo';

  await fs.promises.mkdir(dir);
  await git.init({ fs, dir, defaultBranch: 'main' });

  return { fs, dir };
}

// ─── Clone ─────────────────────────────────────────────────────────

/**
 * Clone a remote repo into a fresh in-memory FS.
 * Returns { fs, dir } so callers can read / modify / push.
 */
export async function cloneRepo(
  repoId: string,
  jwt: string,
): Promise<{ fs: InstanceType<typeof LightningFS>; dir: string }> {
  const fs = createFS();
  const dir = '/repo';

  await git.clone({
    fs,
    http,
    dir,
    url: repoUrl(repoId),
    singleBranch: true,
    depth: 50,
    headers: authHeaders(jwt),
  });

  return { fs, dir };
}

// ─── Push ──────────────────────────────────────────────────────────

/**
 * Push from an in-memory FS to the remote.
 */
export async function pushRepo(
  repoId: string,
  fs: InstanceType<typeof LightningFS>,
  dir: string,
  jwt: string,
) {
  return git.push({
    fs,
    http,
    dir,
    url: repoUrl(repoId),
    headers: authHeaders(jwt),
  });
}

// ─── Pull (fetch + fast-forward merge + checkout) ──────────────────

/**
 * Fetch from origin and fast-forward merge into the working tree.
 */
export async function pullRepo(
  repoId: string,
  fs: InstanceType<typeof LightningFS>,
  dir: string,
  jwt: string,
): Promise<void> {
  await git.fetch({
    fs,
    http,
    dir,
    url: repoUrl(repoId),
    singleBranch: true,
    headers: authHeaders(jwt),
  });

  await git.merge({
    fs,
    dir,
    ours: 'main',
    theirs: 'remotes/origin/main',
    fastForward: true,
    author: { name: 'Test', email: 'test@test.com' },
  });

  await git.checkout({ fs, dir, ref: 'main' });
}

// ─── File helpers ──────────────────────────────────────────────────

/**
 * Write a file, git add, git commit.
 * Creates parent directories as needed.
 */
export async function createTestFile(
  fs: InstanceType<typeof LightningFS>,
  dir: string,
  filepath: string,
  content: string,
  commitMessage?: string,
): Promise<string> {
  const fullPath = `${dir}/${filepath}`;

  // mkdir -p for parent dirs
  const parts = filepath.split('/');
  if (parts.length > 1) {
    let current = dir;
    for (let i = 0; i < parts.length - 1; i++) {
      current = `${current}/${parts[i]}`;
      try {
        await fs.promises.mkdir(current);
      } catch (e: any) {
        if (e.code !== 'EEXIST') throw e;
      }
    }
  }

  await fs.promises.writeFile(fullPath, content, 'utf8');
  await git.add({ fs, dir, filepath });

  return git.commit({
    fs,
    dir,
    message: commitMessage || `Add ${filepath}`,
    author: { name: 'Test User', email: 'test@limbo.health' },
  });
}

/** Read a file from the in-memory working tree. */
export async function readFile(
  fs: InstanceType<typeof LightningFS>,
  dir: string,
  filepath: string,
): Promise<string> {
  const data = await fs.promises.readFile(`${dir}/${filepath}`, {
    encoding: 'utf8',
  });
  return data as string;
}

/** Get the commit log. */
export async function getCommitLog(
  fs: InstanceType<typeof LightningFS>,
  dir: string,
  depth?: number,
): Promise<Array<{ oid: string; message: string }>> {
  const log = await git.log({ fs, dir, depth });
  return log.map((entry) => ({
    oid: entry.oid,
    message: entry.commit.message.trim(),
  }));
}

// ─── Unique IDs ────────────────────────────────────────────────────

/** Generate a collision-free repo ID for tests. */
export function uniqueRepoId(suite: string): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `test-${suite}-${ts}-${rand}`;
}