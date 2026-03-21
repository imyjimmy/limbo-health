import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { normalizeStateCode } from './states.js';

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
