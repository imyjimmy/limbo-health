// core/binder/BinderCache.ts
// Two-tier session-scoped cache for binder data.
// Tier 1: directory listings (DirItem[])
// Tier 2: individual decrypted plaintext (parsed JSON objects)
//
// Both are module-level Maps shared across all BinderService/EncryptedIO instances.

import type { DirItem } from './DirectoryReader';

// --- Tier 1: Directory Cache ---

const dirCache = new Map<string, DirItem[]>();

export function dirGet(key: string): DirItem[] | undefined {
  return dirCache.get(key);
}

export function dirSet(key: string, items: DirItem[]): void {
  dirCache.set(key, items);
}

export function dirEvict(key: string): void {
  dirCache.delete(key);
}

export function dirEvictPrefix(prefix: string): void {
  for (const key of dirCache.keys()) {
    if (key.startsWith(prefix)) {
      dirCache.delete(key);
    }
  }
}

export function dirSize(): number {
  return dirCache.size;
}

// --- Tier 2: Plaintext Cache ---

const ptCache = new Map<string, unknown>();

export function ptGet(key: string): unknown | undefined {
  return ptCache.get(key);
}

export function ptSet(key: string, value: unknown): void {
  ptCache.set(key, value);
}

export function ptEvict(key: string): void {
  ptCache.delete(key);
}

export function ptEvictPrefix(prefix: string): void {
  for (const key of ptCache.keys()) {
    if (key.startsWith(prefix)) {
      ptCache.delete(key);
    }
  }
}

export function ptSize(): number {
  return ptCache.size;
}

// --- Shared ---

export function clearAll(): void {
  dirCache.clear();
  ptCache.clear();
}
