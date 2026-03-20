import fs from 'node:fs/promises';
import { reseedSystems } from './seedService.js';
import { buildGeneratedSeedFilePath, DEFAULT_GENERATED_SEED_DIR } from './generatedSeedService.js';
import { normalizeStateCode } from '../utils/states.js';

function confidenceRank(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function shouldImport(entry, minimumConfidence) {
  return confidenceRank(entry.discovery_confidence || 'low') >= confidenceRank(minimumConfidence);
}

export async function importGeneratedSeeds({
  state,
  minimumConfidence = 'high',
  seedFilePath = null,
  generatedSystems = null,
  dryRun = false
} = {}) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('state is required for generated seed import');
  }

  const filePath = generatedSystems
    ? null
    : seedFilePath || buildGeneratedSeedFilePath(normalizedState, DEFAULT_GENERATED_SEED_DIR);
  const loadedSystems = generatedSystems || JSON.parse(await fs.readFile(filePath, 'utf8'));
  const importableSystems = loadedSystems.filter((entry) => shouldImport(entry, minimumConfidence));

  const summary = {
    state: normalizedState,
    input_file_path: filePath,
    generated_system_count: loadedSystems.length,
    importable_system_count: importableSystems.length,
    minimum_confidence: minimumConfidence,
    imported: false,
    seed_summary: {
      systems: 0,
      facilities: 0,
      seeds: 0
    }
  };

  if (dryRun || importableSystems.length === 0) {
    return summary;
  }

  summary.seed_summary = await reseedSystems(importableSystems);
  summary.imported = true;
  return summary;
}
