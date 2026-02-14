// core/git/fsAdapter.ts
// Bridges react-native-fs to isomorphic-git's expected fs interface.
// Each binder gets its own adapter instance rooted at its repo directory.
//
// Core layer exception: this file imports react-native-fs directly
// because it IS the platform bridge. No other core/ file should import RNFS.

import RNFS from 'react-native-fs';
import { encode as b64encode, decode as b64decode } from '../crypto/base64';

const BASE_PATH = RNFS.DocumentDirectoryPath;

/**
 * Create an fs adapter rooted at a specific binder directory.
 * All paths isomorphic-git passes are resolved relative to this root.
 *
 * @param repoDir - Binder directory name (e.g., 'binders/my-binder-id')
 */
export const createFSAdapter = (repoDir: string) => {
  const resolve = (filepath: string): string => {
    if (filepath.startsWith('/')) {
      return `${BASE_PATH}/${repoDir}${filepath}`;
    }
    return `${BASE_PATH}/${repoDir}/${filepath}`;
  };

  return {
    promises: {
      readFile: async (
        path: string,
        options?: { encoding?: string },
      ): Promise<string | Uint8Array> => {
        const fullPath = resolve(path);
        if (options?.encoding === 'utf8') {
          return await RNFS.readFile(fullPath, 'utf8');
        }
        // Binary read: RNFS gives us base64, decode to Uint8Array
        const base64 = await RNFS.readFile(fullPath, 'base64');
        return b64decode(base64);
      },

      writeFile: async (
        path: string,
        data: string | Uint8Array,
        options?: { encoding?: string },
      ): Promise<void> => {
        const fullPath = resolve(path);

        // Ensure parent directory exists
        const parentDir = fullPath.substring(0, fullPath.lastIndexOf('/'));
        const parentExists = await RNFS.exists(parentDir);
        if (!parentExists) {
          await RNFS.mkdir(parentDir);
        }

        if (typeof data === 'string') {
          await RNFS.writeFile(fullPath, data, 'utf8');
        } else {
          // Uint8Array → base64 → write
          const base64 = b64encode(data);
          await RNFS.writeFile(fullPath, base64, 'base64');
        }
      },

      mkdir: async (
        path: string,
        _options?: { recursive?: boolean },
      ): Promise<void> => {
        const fullPath = resolve(path);
        const exists = await RNFS.exists(fullPath);
        if (!exists) {
          await RNFS.mkdir(fullPath);
        }
      },

      readdir: async (path: string): Promise<string[]> => {
        const fullPath = resolve(path);
        const items = await RNFS.readDir(fullPath);
        return items.map((item) => item.name);
      },

      stat: async (path: string) => {
        const fullPath = resolve(path);
        const result = await RNFS.stat(fullPath);
        return {
          type: result.isDirectory() ? 'dir' : 'file',
          mode: 0o777,
          size: Number(result.size),
          ino: 0,
          mtimeMs: new Date(result.mtime).getTime(),
          ctimeMs: new Date(result.ctime || result.mtime).getTime(),
          uid: 1,
          gid: 1,
          dev: 1,
          isFile: () => !result.isDirectory(),
          isDirectory: () => result.isDirectory(),
          isSymbolicLink: () => false,
        };
      },

      lstat: async (path: string) => {
        const fullPath = resolve(path);
        const result = await RNFS.stat(fullPath);
        return {
          type: result.isDirectory() ? 'dir' : 'file',
          mode: 0o777,
          size: Number(result.size),
          ino: 0,
          mtimeMs: new Date(result.mtime).getTime(),
          ctimeMs: new Date(result.ctime || result.mtime).getTime(),
          uid: 1,
          gid: 1,
          dev: 1,
          isFile: () => !result.isDirectory(),
          isDirectory: () => result.isDirectory(),
          isSymbolicLink: () => false,
        };
      },

      unlink: async (path: string): Promise<void> => {
        const fullPath = resolve(path);
        await RNFS.unlink(fullPath);
      },

      rmdir: async (path: string): Promise<void> => {
        const fullPath = resolve(path);
        await RNFS.unlink(fullPath);
      },

      symlink: async (_target: string, _path: string): Promise<void> => {
        throw new Error('symlink not supported');
      },

      readlink: async (_path: string): Promise<string> => {
        throw new Error('readlink not supported');
      },
    },
  };
};