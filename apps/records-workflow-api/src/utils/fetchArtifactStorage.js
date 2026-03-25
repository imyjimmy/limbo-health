import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const TARGETED_PAGES_MARKER = '/storage/targeted-pages/';
const FETCH_MARKER = '/storage/fetch/';

function normalizePathString(value) {
  return String(value || '').replace(/\\/g, '/');
}

export function toFetchArtifactRelativePath(
  filePath,
  fetchStorageDir = config.fetchStorageDir,
) {
  if (!filePath) return null;

  if (!path.isAbsolute(filePath)) {
    const normalizedRelative = normalizePathString(filePath).replace(/^\.?\//, '');
    return normalizedRelative || null;
  }

  if (fetchStorageDir) {
    const relativePath = path.relative(fetchStorageDir, filePath);
    if (relativePath && relativePath !== '' && !relativePath.startsWith('..')) {
      return normalizePathString(relativePath);
    }
  }

  const normalizedPath = normalizePathString(filePath);
  for (const marker of [TARGETED_PAGES_MARKER, FETCH_MARKER]) {
    const markerIndex = normalizedPath.lastIndexOf(marker);
    if (markerIndex !== -1) {
      const extracted = normalizedPath.slice(markerIndex + marker.length);
      return extracted || null;
    }
  }

  return null;
}

export function resolveFetchArtifactPath(
  filePath,
  fetchStorageDir = config.fetchStorageDir,
) {
  if (!filePath) return filePath;
  if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
    return filePath;
  }

  const relativePath = toFetchArtifactRelativePath(filePath, fetchStorageDir);
  if (!relativePath) {
    return filePath;
  }

  return path.join(fetchStorageDir, relativePath);
}
