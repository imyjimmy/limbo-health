import RNFS from 'react-native-fs';

const basePath = RNFS.DocumentDirectoryPath;

const resolvePath = (filepath: string) => {
  // isomorphic-git passes paths like '/visits/file.json'
  // We need to prepend the RN document directory
  if (filepath.startsWith('/')) {
    return `${basePath}${filepath}`;
  }
  return `${basePath}/${filepath}`;
};

export const createFSAdapter = (repoDir: string) => {
  const resolve = (filepath: string) => {
    if (filepath.startsWith('/')) {
      return `${basePath}/${repoDir}${filepath}`;
    }
    return `${basePath}/${repoDir}/${filepath}`;
  };

  return {
    promises: {
      readFile: async (path: string, options?: { encoding?: string }) => {
        const fullPath = resolve(path);
        if (options?.encoding === 'utf8') {
          return await RNFS.readFile(fullPath, 'utf8');
        }
        // isomorphic-git often needs binary as Uint8Array
        const base64 = await RNFS.readFile(fullPath, 'base64');
        const binary = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        return binary;
      },

      writeFile: async (path: string, data: string | Uint8Array, options?: { encoding?: string }) => {
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
          let binary = '';
          for (let i = 0; i < data.length; i++) {
            binary += String.fromCharCode(data[i]);
          }
          const base64 = btoa(binary);
          await RNFS.writeFile(fullPath, base64, 'base64');
        }
      },

      mkdir: async (path: string, options?: { recursive?: boolean }) => {
        const fullPath = resolve(path);
        const exists = await RNFS.exists(fullPath);
        if (!exists) {
          await RNFS.mkdir(fullPath);
        }
      },

      readdir: async (path: string) => {
        const fullPath = resolve(path);
        const items = await RNFS.readDir(fullPath);
        return items.map(item => item.name);
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
        // Same as stat for our purposes (no symlink support)
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

      unlink: async (path: string) => {
        const fullPath = resolve(path);
        await RNFS.unlink(fullPath);
      },

      rmdir: async (path: string) => {
        const fullPath = resolve(path);
        await RNFS.unlink(fullPath);
      },

      symlink: async (_target: string, _path: string) => {
        // No-op, isomorphic-git doesn't need this for basic operations
        throw new Error('symlink not supported');
      },

      readlink: async (_path: string) => {
        throw new Error('readlink not supported');
      },
    },
  };
};