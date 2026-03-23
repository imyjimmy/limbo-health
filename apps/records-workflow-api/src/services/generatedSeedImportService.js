import fs from 'node:fs/promises';
import { mergeSystemsIntoStateSeedFile, readStateSeedFile } from './seedEditorService.js';
import { reseedFromFile } from './seedService.js';
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
  const currentSeedFile = await readStateSeedFile(normalizedState);

  const summary = {
    state: normalizedState,
    input_file_path: filePath,
    generated_system_count: loadedSystems.length,
    importable_system_count: importableSystems.length,
    minimum_confidence: minimumConfidence,
    imported: false,
    canonical_seed_file_path: currentSeedFile.seed_file_path,
    canonical_seed_file_systems_before: currentSeedFile.counts?.systems || 0,
    canonical_seed_file_systems_after: currentSeedFile.counts?.systems || 0,
    promoted_system_count: 0,
    seed_summary: {
      systems: 0,
      facilities: 0,
      seeds: 0
    }
  };

  if (dryRun || importableSystems.length === 0) {
    return summary;
  }

  const savedSeedFile = await mergeSystemsIntoStateSeedFile({
    state: normalizedState,
    systems: importableSystems,
  });
  summary.seed_summary = await reseedFromFile({ state: normalizedState });
  summary.canonical_seed_file_systems_after = savedSeedFile.counts?.systems || 0;
  summary.promoted_system_count = importableSystems.length;
  summary.imported = true;
  return summary;
}
