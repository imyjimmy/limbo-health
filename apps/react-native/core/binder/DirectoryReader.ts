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

  const items: DirItem[] = [];

  for (const name of names) {
    // Skip hidden files and git internals
    if (name.startsWith('.')) continue;
    // Skip .enc sidecar files -- they're referenced by their parent .json
    if (name.endsWith('.enc')) continue;
    // Skip patient-info.json -- shown separately in the binder detail header
    if (name === 'patient-info.json' && normalizedDir === '/') continue;

    const childPath = normalizedDir === '/'
      ? '/' + name
      : normalizedDir + '/' + name;

    const stat = await fs.promises.stat(childPath);

    if (stat.isDirectory()) {
      // Skip empty directories (e.g. left behind after git rm)
      const children = await fs.promises.readdir(childPath);
      const hasVisibleChildren = children.some((c: string) => !c.startsWith('.'));
      if (!hasVisibleChildren) continue;

      const relativePath = childPath.startsWith('/')
        ? childPath.slice(1)
        : childPath;

      // Try to read .meta.json for display metadata (icon, color, displayName)
      let meta: FolderMeta | undefined;
      if (children.includes('.meta.json')) {
        try {
          meta = await io.readJSON<FolderMeta>(childPath + '/.meta.json');
        } catch {
          // .meta.json missing or corrupt — use defaults
        }
      }

      items.push({
        kind: 'folder',
        name,
        relativePath,
        meta,
      });
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
      items.push({
        kind: 'entry',
        name,
        relativePath,
        preview,
      });
    }
    // Any other file types are silently ignored
  }

  // Sort: folders first (alphabetical), then entries (newest first by filename which is date-prefixed)
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
    if (a.kind === 'folder' && b.kind === 'folder') {
      return a.name.localeCompare(b.name);
    }
    // Entries: reverse alphabetical puts newest dates first (YYYY-MM-DD prefix)
    return b.name.localeCompare(a.name);
  });

  return items;
}
