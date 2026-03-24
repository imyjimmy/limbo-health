import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { normalizeStateCode } from './states.js';

const SOURCE_DOCUMENT_MARKER = '/storage/source-documents/';
const LEGACY_RAW_STORAGE_MARKER = '/storage/raw/';

function normalizePathString(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeStateSegment(state) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('A valid state code is required for source-document storage paths.');
  }

  return normalizedState.toLowerCase();
}

export function getSourceDocumentStateDir(
  state,
  sourceDocumentStorageDir = config.sourceDocumentStorageDir,
) {
  return path.join(sourceDocumentStorageDir, normalizeStateSegment(state));
}

export async function ensureSourceDocumentStateDir(
  state,
  sourceDocumentStorageDir = config.sourceDocumentStorageDir,
) {
  const directory = getSourceDocumentStateDir(state, sourceDocumentStorageDir);
  await fsp.mkdir(directory, { recursive: true });
  return directory;
}

export function toSourceDocumentRelativePath(
  filePath,
  {
    sourceDocumentStorageDir = config.sourceDocumentStorageDir,
    legacyRawStorageDir = config.rawStorageDir,
  } = {},
) {
  if (!filePath) return null;

  if (!path.isAbsolute(filePath)) {
    const normalizedRelative = normalizePathString(filePath).replace(/^\.?\//, '');
    return normalizedRelative || null;
  }

  const candidateRoots = [sourceDocumentStorageDir, legacyRawStorageDir].filter(Boolean);
  for (const root of candidateRoots) {
    const relativePath = path.relative(root, filePath);
    if (relativePath && relativePath !== '' && !relativePath.startsWith('..')) {
      return normalizePathString(relativePath);
    }
  }

  const normalizedPath = normalizePathString(filePath);
  for (const marker of [SOURCE_DOCUMENT_MARKER, LEGACY_RAW_STORAGE_MARKER]) {
    const markerIndex = normalizedPath.lastIndexOf(marker);
    if (markerIndex !== -1) {
      const extracted = normalizedPath.slice(markerIndex + marker.length);
      return extracted || null;
    }
  }

  return null;
}

export function resolveSourceDocumentPath(
  filePath,
  {
    sourceDocumentStorageDir = config.sourceDocumentStorageDir,
    legacyRawStorageDir = config.rawStorageDir,
  } = {},
) {
  if (!filePath) return filePath;
  if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
    return filePath;
  }

  const relativePath = toSourceDocumentRelativePath(filePath, {
    sourceDocumentStorageDir,
    legacyRawStorageDir,
  });
  if (!relativePath) {
    return filePath;
  }

  const sourceDocumentPath = path.join(sourceDocumentStorageDir, relativePath);
  if (fs.existsSync(sourceDocumentPath)) {
    return sourceDocumentPath;
  }

  const legacyRawPath = path.join(legacyRawStorageDir, relativePath);
  if (fs.existsSync(legacyRawPath)) {
    return legacyRawPath;
  }

  return sourceDocumentPath;
}
