// __tests__/helpers/mockFS.ts
// In-memory FS mocks for EncryptedIO and DirectoryReader tests.

import type { EncryptedFS } from '../../core/binder/EncryptedIO';
import type { DirFS } from '../../core/binder/DirectoryReader';

/**
 * In-memory EncryptedFS mock. Stores data as string or Uint8Array in a Map.
 */
export function createMockEncryptedFS(): EncryptedFS & { store: Map<string, string | Uint8Array> } {
  const store = new Map<string, string | Uint8Array>();
  return {
    store,
    promises: {
      readFile: async (path: string, options?: { encoding?: string }) => {
        const data = store.get(path);
        if (data === undefined) throw new Error(`ENOENT: no such file: ${path}`);
        if (options?.encoding === 'utf8' && data instanceof Uint8Array) {
          return new TextDecoder().decode(data);
        }
        return data;
      },
      writeFile: async (path: string, data: string | Uint8Array) => {
        store.set(path, data);
      },
    },
  };
}

/**
 * In-memory DirFS mock for DirectoryReader tests.
 * Takes a tree description: { '/conditions': 'dir', '/conditions/back-acne': 'dir', ... }
 */
export function createMockDirFS(tree: Record<string, 'dir' | 'file'>): DirFS {
  return {
    promises: {
      readdir: async (path: string) => {
        const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
        const prefix = normalized + '/';
        const children = new Set<string>();
        for (const p of Object.keys(tree)) {
          if (p.startsWith(prefix)) {
            const rest = p.slice(prefix.length);
            const name = rest.split('/')[0];
            if (name) children.add(name);
          }
        }
        if (children.size === 0 && !tree[normalized]) {
          throw new Error(`ENOENT: no such directory: ${path}`);
        }
        return [...children];
      },
      stat: async (path: string) => {
        const normalized = path.endsWith('/') ? path.slice(0, -1) : path;
        const entry = tree[normalized];
        if (!entry) throw new Error(`ENOENT: no such path: ${path}`);
        return {
          isDirectory: () => entry === 'dir',
        };
      },
    },
  };
}
