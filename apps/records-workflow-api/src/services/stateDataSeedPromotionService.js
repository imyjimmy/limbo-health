import { reseedFromFile } from './seedService.js';
import {
  mergeSystemsIntoStateSeedFile,
} from './seedEditorService.js';
import { getStageRunDetail } from './pipeline/pipelineInspectionService.js';
import {
  STATE_DATA_MATERIALIZATION_STAGE_KEY,
} from './stateDataMaterializationService.js';
import { normalizeStateCode } from '../utils/states.js';

function normalizeString(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeRequestedSystemNames(systemNames = []) {
  const values = Array.isArray(systemNames) ? systemNames : [systemNames];
  return Array.from(
    new Set(
      values
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  );
}

export async function promoteGeneratedSeedsFromStateDataStage({
  stageRunId,
  systemNames = [],
  reseedDb = true,
} = {}) {
  const normalizedStageRunId = normalizeString(stageRunId);
  if (!normalizedStageRunId) {
    throw new Error('stageRunId is required to promote generated seed candidates.');
  }

  const detail = await getStageRunDetail(normalizedStageRunId);
  if (!detail) {
    throw new Error('Pipeline stage run not found.');
  }

  if (detail.stage_key !== STATE_DATA_MATERIALIZATION_STAGE_KEY) {
    throw new Error('Only Data Intake stage runs can promote generated seed candidates.');
  }

  const normalizedState = normalizeStateCode(detail.state);
  if (!normalizedState) {
    throw new Error('A valid state code is required for generated seed promotion.');
  }

  const generatedEntries = Array.isArray(detail.data_materialization?.generated_summary?.entries)
    ? detail.data_materialization.generated_summary.entries
    : [];
  if (generatedEntries.length === 0) {
    throw new Error('No generated seed candidates were found for this data-intake run.');
  }

  const requestedSystemNames = normalizeRequestedSystemNames(systemNames);
  const requestedSystemNameSet = new Set(requestedSystemNames.map((value) => value.toLowerCase()));
  const selectedEntries =
    requestedSystemNameSet.size === 0
      ? generatedEntries
      : generatedEntries.filter((entry) =>
          requestedSystemNameSet.has(normalizeString(entry?.system_name).toLowerCase()),
        );

  if (selectedEntries.length === 0) {
    throw new Error('None of the requested generated seed candidates were found for this data-intake run.');
  }

  const savedSeedFile = await mergeSystemsIntoStateSeedFile({
    state: normalizedState,
    systems: selectedEntries,
  });
  const reseedSummary = reseedDb ? await reseedFromFile({ state: normalizedState }) : null;

  return {
    status: 'ok',
    stage_run_id: normalizedStageRunId,
    stage_key: STATE_DATA_MATERIALIZATION_STAGE_KEY,
    state: normalizedState,
    promoted_systems: selectedEntries.length,
    requested_system_names: requestedSystemNames,
    canonical_seed_file: savedSeedFile,
    reseed_summary: reseedSummary,
  };
}
