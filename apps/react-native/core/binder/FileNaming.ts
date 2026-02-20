// core/binder/FileNaming.ts
// Generates date-based file paths for medical documents and sidecars.
// Convention: YYYY-MM-DD-descriptive-name.json / .enc

import RNFS from 'react-native-fs';

const BINDERS_ROOT = RNFS.DocumentDirectoryPath;

function datePrefix(date?: Date): string {
  const d = date ?? new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Generate a document path like 'conditions/back-acne/2026-02-13-photo.json'.
 * Handles same-day collisions by appending a counter.
 */
export async function generateDocPath(
  repoDir: string,
  category: string,
  slug: string,
  date?: Date,
): Promise<string> {
  const prefix = datePrefix(date);
  const base = `${category}/${prefix}-${slug}`;
  const fullBase = `${BINDERS_ROOT}/${repoDir}/${base}`;

  // Check for collisions
  if (!(await RNFS.exists(`${fullBase}.json`))) {
    return `${base}.json`;
  }

  let counter = 2;
  while (await RNFS.exists(`${fullBase}-${counter}.json`)) {
    counter++;
  }
  return `${base}-${counter}.json`;
}

/**
 * Derive the sidecar .enc path from a document path.
 * Without format: 'conditions/.../photo.json' → 'conditions/.../photo.enc'
 * With format:    'conditions/.../photo.json' + 'jpg' → 'conditions/.../photo.jpg.enc'
 *                 'recordings/.../recording.json' + 'm4a' → 'recordings/.../recording.m4a.enc'
 */
export function sidecarPathFrom(docPath: string, format?: string): string {
  const base = docPath.replace(/\.json$/, '');
  return format ? `${base}.${format}.enc` : `${base}.enc`;
}

/**
 * Convert a human-readable title to a filesystem-safe slug.
 * 'Lower Back Pain' -> 'lower-back-pain'
 */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'untitled';
}

/**
 * Generate a condition subfolder path.
 * 'back-acne' → 'conditions/back-acne'
 */
export function conditionFolder(conditionSlug: string): string {
  return `conditions/${conditionSlug}`;
}