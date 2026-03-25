import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { normalizeStateCode } from './states.js';

const ACCEPTED_FORMS_MARKER = '/storage/accepted-forms/';
const SOURCE_DOCUMENTS_MARKER = '/storage/source-documents/';
const RAW_STORAGE_MARKER = '/storage/raw/';
const STORAGE_MARKERS = [ACCEPTED_FORMS_MARKER, SOURCE_DOCUMENTS_MARKER, RAW_STORAGE_MARKER];

function normalizePathString(value) {
  return String(value || '').replace(/\\/g, '/');
}

export function rawStorageStateSegment(state) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('A valid state code is required for accepted-form storage paths.');
  }

  return normalizedState.toLowerCase();
}

export function getRawStorageStateDir(state, rawStorageDir = config.rawStorageDir) {
  return path.join(rawStorageDir, rawStorageStateSegment(state));
}

export async function ensureRawStorageStateDir(state, rawStorageDir = config.rawStorageDir) {
  const directory = getRawStorageStateDir(state, rawStorageDir);
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export function toRawStorageRelativePath(filePath, rawStorageDir = config.rawStorageDir) {
  if (!filePath) return null;

  if (!path.isAbsolute(filePath)) {
    const normalizedRelative = normalizePathString(filePath).replace(/^\.?\//, '');
    return normalizedRelative || null;
  }

  const relativePath = path.relative(rawStorageDir, filePath);
  if (relativePath && relativePath !== '' && !relativePath.startsWith('..')) {
    return normalizePathString(relativePath);
  }

  const normalizedPath = normalizePathString(filePath);
  for (const marker of STORAGE_MARKERS) {
    const markerIndex = normalizedPath.lastIndexOf(marker);
    if (markerIndex !== -1) {
      const extracted = normalizedPath.slice(markerIndex + marker.length);
      return extracted || null;
    }
  }

  return null;
}

export function resolveRawStoragePath(filePath, rawStorageDir = config.rawStorageDir) {
  const relativePath = toRawStorageRelativePath(filePath, rawStorageDir);
  if (!relativePath) {
    return filePath;
  }

  return path.join(rawStorageDir, relativePath);
}

export function replaceRawStorageRelativePath(storedPath, nextRelativePath, rawStorageDir = config.rawStorageDir) {
  const normalizedNextRelativePath = normalizePathString(nextRelativePath).replace(/^\.?\//, '');
  if (!normalizedNextRelativePath) {
    throw new Error('A next relative raw-storage path is required.');
  }

  if (!storedPath || !path.isAbsolute(storedPath)) {
    return normalizedNextRelativePath;
  }

  const normalizedStoredPath = normalizePathString(storedPath);
  for (const marker of STORAGE_MARKERS) {
    const markerIndex = normalizedStoredPath.lastIndexOf(marker);
    if (markerIndex !== -1) {
      return `${normalizedStoredPath.slice(0, markerIndex + marker.length)}${normalizedNextRelativePath}`;
    }
  }

  return path.join(rawStorageDir, normalizedNextRelativePath);
}
