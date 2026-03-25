import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { normalizeStateCode } from './states.js';

function normalizePathString(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeStateSegment(state) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('A valid state code is required for pipeline artifact storage.');
  }

  return normalizedState.toLowerCase();
}

async function ensureStageStateDir(baseDir, state) {
  const directory = path.join(baseDir, normalizeStateSegment(state));
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function ensureParsedArtifactStateDir(state) {
  return ensureStageStateDir(config.parsedStorageDir, state);
}

export function toParsedArtifactRelativePath(
  filePath,
  parsedStorageDir = config.parsedStorageDir,
) {
  if (!filePath) return null;

  if (!path.isAbsolute(filePath)) {
    const normalizedRelative = normalizePathString(filePath).replace(/^\.?\//, '');
    return normalizedRelative || null;
  }

  if (parsedStorageDir) {
    const relativePath = path.relative(parsedStorageDir, filePath);
    if (relativePath && relativePath !== '' && !relativePath.startsWith('..')) {
      return normalizePathString(relativePath);
    }
  }

  const normalizedPath = normalizePathString(filePath);
  const marker = '/storage/parsed/';
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  const extracted = normalizedPath.slice(markerIndex + marker.length);
  return extracted || null;
}

export function resolveParsedArtifactPath(
  filePath,
  parsedStorageDir = config.parsedStorageDir,
) {
  if (!filePath) return filePath;
  if (path.isAbsolute(filePath) && filePath.startsWith(parsedStorageDir)) {
    return filePath;
  }

  const relativePath = toParsedArtifactRelativePath(filePath, parsedStorageDir);
  if (!relativePath) {
    return filePath;
  }

  return path.join(parsedStorageDir, relativePath);
}

export async function ensureDataIntakeArtifactStateDir(state) {
  return ensureStageStateDir(config.dataIntakeStorageDir, state);
}

export async function ensureSeedScopeArtifactStateDir(state) {
  return ensureStageStateDir(config.seedScopeStorageDir, state);
}

export async function ensureFetchArtifactDir(state, fetchArtifactId) {
  const stateDir = await ensureStageStateDir(config.fetchStorageDir, state);
  const directory = path.join(stateDir, String(fetchArtifactId || '').trim());
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function ensureWorkflowArtifactDir(state, sourceDocumentId) {
  const stateDir = await ensureStageStateDir(config.workflowStorageDir, state);
  const directory = path.join(stateDir, String(sourceDocumentId || '').trim());
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function ensureQuestionArtifactDir(state, sourceDocumentId) {
  const stateDir = await ensureStageStateDir(config.questionStorageDir, state);
  const directory = path.join(stateDir, String(sourceDocumentId || '').trim());
  await fs.mkdir(directory, { recursive: true });
  return directory;
}

export async function ensureTriageArtifactStateDir(state) {
  return ensureStageStateDir(config.triageStorageDir, state);
}

export async function ensurePublishedArtifactDir(state, sourceDocumentId) {
  const stateDir = await ensureStageStateDir(config.publishedStorageDir, state);
  const directory = path.join(stateDir, String(sourceDocumentId || '').trim());
  await fs.mkdir(directory, { recursive: true });
  return directory;
}
