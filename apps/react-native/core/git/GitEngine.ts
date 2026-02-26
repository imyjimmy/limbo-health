// core/git/GitEngine.ts
// Wraps isomorphic-git with Limbo-specific operations.
// No other code in the app calls isomorphic-git directly.

import git, { type MergeDriverCallback } from 'isomorphic-git';
import { createFSAdapter } from './fsAdapter';
import { createHttpTransport, AuthConfig } from './httpTransport';
import { gitRepoUrl } from '../../constants/api';

// --- Types ---

export interface CommitInfo {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
}

export interface PullOptions {
  fastForwardOnly?: boolean;
  mergeDriver?: MergeDriverCallback;
}

// --- Author ---

export interface GitAuthor {
  name: string;
  email: string;
}

const DEFAULT_AUTHOR: GitAuthor = { name: 'Limbo Health', email: 'app@limbo.health' };

// --- GitEngine ---

export class GitEngine {
  /**
   * Initialize a new binder as a git repo with an initial empty commit.
   */
  static async initBinder(repoDir: string, author?: GitAuthor): Promise<void> {
    const fs = createFSAdapter(repoDir);
    const dir = '/';

    await git.init({ fs, dir, defaultBranch: 'main' });

    // Initial empty commit so the repo has a HEAD
    await git.commit({
      fs,
      dir,
      message: 'Initialize binder',
      author: author || DEFAULT_AUTHOR,
    });
  }

  /**
   * Register the "origin" remote so pull/fetch can resolve refspecs.
   */
  static async addRemote(repoDir: string, repoId: string): Promise<void> {
    const fs = createFSAdapter(repoDir);
    await git.addRemote({
      fs,
      dir: '/',
      remote: 'origin',
      url: gitRepoUrl(repoId),
    });
  }

  /**
   * Clone a repository from limbo.health into a local binder directory.
   */
  static async cloneRepo(
    repoDir: string,
    repoId: string,
    auth: AuthConfig,
  ): Promise<void> {
    const fs = createFSAdapter(repoDir);
    const http = createHttpTransport(auth);

    await git.clone({
      fs,
      http,
      dir: '/',
      url: gitRepoUrl(repoId),
      singleBranch: true,
      depth: 1,
    });
  }

  /**
   * Pull latest changes from the remote.
   */
  static async pull(
    repoDir: string,
    repoId: string,
    auth: AuthConfig,
    author?: GitAuthor,
    options?: PullOptions,
  ): Promise<void> {
    const fs = createFSAdapter(repoDir);
    const http = createHttpTransport(auth);
    const commitAuthor = author || DEFAULT_AUTHOR;

    // isomorphic-git `pull` currently does not expose `mergeDriver`,
    // so use fetch+merge+checkout when a custom merge driver is needed.
    if (options?.mergeDriver) {
      const branch = await git.currentBranch({ fs, dir: '/' });
      if (!branch) {
        throw new Error('Cannot pull with merge driver: HEAD is detached.');
      }

      const { fetchHead, fetchHeadDescription } = await git.fetch({
        fs,
        http,
        dir: '/',
        url: gitRepoUrl(repoId),
        ref: branch,
        singleBranch: true,
      });

      if (!fetchHead) return;

      await git.merge({
        fs,
        dir: '/',
        ours: branch,
        theirs: fetchHead,
        message: `Merge ${fetchHeadDescription ?? fetchHead}`,
        author: commitAuthor,
        fastForwardOnly: options.fastForwardOnly ?? false,
        mergeDriver: options.mergeDriver,
      });

      await git.checkout({
        fs,
        dir: '/',
        ref: branch,
        noCheckout: false,
      });
      return;
    }

    await git.pull({
      fs,
      http,
      dir: '/',
      url: gitRepoUrl(repoId),
      singleBranch: true,
      author: commitAuthor,
      fastForwardOnly: options?.fastForwardOnly,
    });
  }

  /**
   * Push local commits to the remote. Supports push-to-create.
   */
  static async push(
    repoDir: string,
    repoId: string,
    auth: AuthConfig,
  ): Promise<void> {
    const fs = createFSAdapter(repoDir);
    const http = createHttpTransport(auth);

    await git.push({
      fs,
      http,
      dir: '/',
      url: gitRepoUrl(repoId),
    });
  }

  /**
   * Stage files and create a commit. Returns the commit OID.
   */
  static async commitEntry(
    repoDir: string,
    filePaths: string[],
    message: string,
    author?: GitAuthor,
  ): Promise<string> {
    const fs = createFSAdapter(repoDir);
    const dir = '/';

    for (const filepath of filePaths) {
      // isomorphic-git expects paths relative to dir, no leading slash
      const relative = filepath.startsWith('/') ? filepath.slice(1) : filepath;
      await git.add({ fs, dir, filepath: relative });
    }

    const oid = await git.commit({
      fs,
      dir,
      message,
      author: author || DEFAULT_AUTHOR,
    });

    return oid;
  }

  /**
   * Get commit history.
   */
  static async log(
    repoDir: string,
    depth?: number,
  ): Promise<CommitInfo[]> {
    const fs = createFSAdapter(repoDir);

    const commits = await git.log({
      fs,
      dir: '/',
      depth: depth ?? 50,
    });

    return commits.map((entry) => ({
      oid: entry.oid,
      message: entry.commit.message,
      author: {
        name: entry.commit.author.name,
        email: entry.commit.author.email,
        timestamp: entry.commit.author.timestamp,
      },
    }));
  }

  /**
   * List all tracked files in the working tree.
   * Returns paths relative to repo root (e.g., 'conditions/back-acne/photo.json').
   */
  static async listFiles(repoDir: string): Promise<string[]> {
    const fs = createFSAdapter(repoDir);

    return await git.listFiles({
      fs,
      dir: '/',
      ref: 'HEAD',
    });
  }

  /**
   * List tracked files under a given path prefix.
   * E.g., listFilesUnder(repoDir, 'conditions/back-acne') returns all files in that subtree.
   */
  static async listFilesUnder(repoDir: string, prefix: string): Promise<string[]> {
    const all = await GitEngine.listFiles(repoDir);
    const normalized = prefix.endsWith('/') ? prefix : prefix + '/';
    return all.filter((f) => f.startsWith(normalized));
  }

  /**
   * Remove files from git index and working tree, then commit.
   * Counterpart to commitEntry — stages removals instead of additions.
   */
  static async removeFiles(
    repoDir: string,
    filePaths: string[],
    message: string,
    author?: GitAuthor,
  ): Promise<string> {
    const fs = createFSAdapter(repoDir);
    const dir = '/';

    for (const filepath of filePaths) {
      const relative = filepath.startsWith('/') ? filepath.slice(1) : filepath;
      await git.remove({ fs, dir, filepath: relative });
      // Also delete from working tree
      try {
        await fs.promises.unlink('/' + relative);
      } catch {
        // File may already be gone from disk
      }
    }

    const oid = await git.commit({
      fs,
      dir,
      message,
      author: author || DEFAULT_AUTHOR,
    });

    return oid;
  }

  /**
   * Stage all files in the working tree (like `git add .`).
   * Useful for the staging repo in the scan flow.
   */
  static async addAll(repoDir: string): Promise<void> {
    const fs = createFSAdapter(repoDir);
    const dir = '/';

    const files = await fs.promises.readdir(dir);
    const addRecursive = async (basePath: string) => {
      const entries = await fs.promises.readdir(basePath);
      for (const entry of entries) {
        const entryPath = basePath === '/' ? `/${entry}` : `${basePath}/${entry}`;
        const stat = await fs.promises.stat(entryPath);
        if (stat.isDirectory()) {
          if (entry === '.git') continue; // skip .git
          await addRecursive(entryPath);
        } else {
          const relative = entryPath.startsWith('/') ? entryPath.slice(1) : entryPath;
          await git.add({ fs, dir, filepath: relative });
        }
      }
    };

    await addRecursive('/');
  }
}
