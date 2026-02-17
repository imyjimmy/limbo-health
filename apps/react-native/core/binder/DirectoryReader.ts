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
    stat(path: string): Promise<{ isDirectory(): boolean }>;
  };
}

// --- Types ---

export interface FolderMeta {
  displayName?: string;
  icon?: string;
  color?: string;
}

export interface DirFolder {
  kind: 'folder';
  name: string;
  /** Path relative to repo root, e.g. 'conditions/back-acne' */
  relativePath: string;
  meta?: FolderMeta;
  /** Number of visible children (excludes .meta.json, dotfiles, .enc sidecars) */
  childCount: number;
}

export interface DirEntry {
  kind: 'entry';
  name: string;
  /** Path relative to repo root, e.g. 'visits/2026-02-12-follow-up.json' */
  relativePath: string;
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

        const childCount = children.filter(
          (c: string) => !c.startsWith('.') && !c.endsWith('.enc'),
        ).length;

        let meta: FolderMeta | undefined;
        if (children.includes('.meta.json')) {
          try {
            meta = await io.readJSON<FolderMeta>(childPath + '/.meta.json');
          } catch {
            // .meta.json missing or corrupt — use defaults
          }
        }

        return { kind: 'folder', name, relativePath, meta, childCount };
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
        return { kind: 'entry', name, relativePath, preview };
      }

      return null;
    }),
  );

  const items = results.filter((r): r is DirItem => r !== null);

  // Sort: folders first (alphabetical), then entries (oldest first / newest at bottom)
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    // Both folders or both entries: alphabetical (for date-prefixed entries = chronological)
    return a.name.localeCompare(b.name);
  });

  return items;
}
