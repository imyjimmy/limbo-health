// core/binder/DirectoryReader.ts
// Reads a directory within a binder repo and classifies its contents.
// Uses the fsAdapter for filesystem access and EncryptedIO for metadata decryption.
//
// This is the core logic behind the DirectoryList component.
// It does NOT import React -- pure business logic.

import type { EncryptedIO } from './EncryptedIO';
import { extractEntryPreview, type EntryPreview } from './DocumentModel';

// --- FS interface needed by DirectoryReader ---
// Matches the subset of createFSAdapter's return type that we use.

export interface DirFS {
  promises: {
    readdir(path: string): Promise<string[]>;
    stat(path: string): Promise<{ isDirectory(): boolean; mtimeMs?: number }>;
  };
}

// --- Types ---

export interface FolderMeta {
  displayName?: string;
  icon?: string;
  color?: string;
  displayOrder?: number;
}

const LEGACY_ROOT_FOLDER_DISPLAY_ORDER: Record<string, number> = {
  'my-info': 0,
  conditions: 1,
  medications: 2,
  visits: 3,
  procedures: 4,
  'labs-imaging': 5,
};

export interface DirFolder {
  kind: 'folder';
  name: string;
  /** Path relative to repo root, e.g. 'conditions/back-acne' */
  relativePath: string;
  meta?: FolderMeta;
  /** Explicit display order from parent directory metadata */
  displayOrder?: number;
  /** Filesystem mtime (ms) — used for creation-order sorting */
  mtime?: number;
}

export interface DirEntry {
  kind: 'entry';
  name: string;
  /** Path relative to repo root, e.g. 'visits/2026-02-12-follow-up.json' */
  relativePath: string;
  /** Explicit display order from parent directory metadata */
  displayOrder?: number;
  preview: EntryPreview | null; // null if decryption failed
}

export type DirItem = DirFolder | DirEntry;

// --- Reader ---

/**
 * Read a directory inside the binder and return classified, sorted items.
 *
 * @param dirPath - Path relative to repo root. '/' for root, 'conditions/' for conditions folder.
 * @param fs - Filesystem adapter (from createFSAdapter)
 * @param io - EncryptedIO instance (for decrypting .json metadata)
 */
export async function readDirectory(
  dirPath: string,
  fs: DirFS,
  io: EncryptedIO,
): Promise<DirItem[]> {
  const normalizedDir = dirPath.startsWith('/') ? dirPath : '/' + dirPath;
  const isRoot = normalizedDir === '/';

  let names: string[];
  try {
    names = await fs.promises.readdir(normalizedDir);
  } catch {
    // Directory doesn't exist yet (e.g., empty category folder) — return empty list
    return [];
  }

  // Filter out names we can skip before any I/O
  const candidates = names.filter((name) => {
    if (name.startsWith('.')) return false;
    if (name.endsWith('.enc')) return false;
    if (name === 'patient-info.json' && normalizedDir === '/') return false;
    return true;
  });

  // Process all children in parallel
  const results = await Promise.all(
    candidates.map(async (name): Promise<DirItem | null> => {
      const childPath = normalizedDir === '/'
        ? '/' + name
        : normalizedDir + '/' + name;

      const stat = await fs.promises.stat(childPath);

      if (stat.isDirectory()) {
        const children = await fs.promises.readdir(childPath);
        const hasVisibleChildren = children.some(
          (c: string) => !c.startsWith('.') || c === '.meta.json',
        );
        if (!hasVisibleChildren) return null;

        const relativePath = childPath.startsWith('/')
          ? childPath.slice(1)
          : childPath;

        let meta: FolderMeta | undefined;
        if (children.includes('.meta.json')) {
          try {
            meta = await io.readJSON<FolderMeta>(childPath + '/.meta.json');
          } catch {
            // .meta.json missing or corrupt — use defaults
          }
        }

        // Use .meta.json mtime as folder creation proxy
        let mtime = stat.mtimeMs ?? 0;
        if (children.includes('.meta.json')) {
          try {
            const metaStat = await fs.promises.stat(childPath + '/.meta.json');
            mtime = metaStat.mtimeMs ?? mtime;
          } catch { /* use dir mtime */ }
        }

        return {
          kind: 'folder',
          name,
          relativePath,
          meta,
          displayOrder:
            typeof meta?.displayOrder === 'number' && Number.isFinite(meta.displayOrder)
              ? meta.displayOrder
              : (isRoot ? LEGACY_ROOT_FOLDER_DISPLAY_ORDER[name] : undefined),
          mtime,
        };
      } else if (name.endsWith('.json')) {
        const relativePath = childPath.startsWith('/')
          ? childPath.slice(1)
          : childPath;
        let preview: EntryPreview | null = null;
        try {
          const doc = await io.readDocument(childPath);
          preview = extractEntryPreview(relativePath, doc);
        } catch (err) {
          console.warn(`Failed to decrypt metadata for ${relativePath}:`, err);
        }
        return {
          kind: 'entry',
          name,
          relativePath,
          displayOrder:
            typeof preview?.displayOrder === 'number' && Number.isFinite(preview.displayOrder)
              ? preview.displayOrder
              : undefined,
          preview,
        };
      }

      return null;
    }),
  );

  const items = results.filter((r): r is DirItem => r !== null);

  // Sort by explicit display order first. Fallback keeps legacy behavior.
  items.sort((a, b) => {
    const aOrder = a.displayOrder ?? Number.POSITIVE_INFINITY;
    const bOrder = b.displayOrder ?? Number.POSITIVE_INFINITY;
    if (aOrder !== bOrder) return aOrder - bOrder;
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    if (a.kind === 'folder' && b.kind === 'folder') {
      return (a.mtime ?? 0) - (b.mtime ?? 0);
    }
    return a.name.localeCompare(b.name);
  });

  return items;
}
