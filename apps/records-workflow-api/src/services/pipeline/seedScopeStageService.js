import fs from 'node:fs/promises';
import path from 'node:path';
import {
  completePipelineStageRun,
  insertPipelineStageRun,
} from '../../repositories/pipelineStageRepository.js';
import { ensureSeedScopeArtifactStateDir } from '../../utils/pipelineArtifactStorage.js';
import { resolvePipelineSystems } from './crawlStageCommon.js';

const SEED_SCOPE_STAGE_KEY = 'seed_scope_stage';
const SEED_SCOPE_STAGE_LABEL = 'Seed Scope Stage';

export async function runSeedScopeStage({
  systemName = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  state = null,
} = {}) {
  const { seeds, systems } = await resolvePipelineSystems({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state,
  });
  const firstSystem = systems[0] || null;
  const stageStatus = seeds.length === 0 ? 'no_seeds' : 'ok';
  const stageRun = await insertPipelineStageRun({
    stageKey: SEED_SCOPE_STAGE_KEY,
    stageLabel: SEED_SCOPE_STAGE_LABEL,
    state: firstSystem?.state || state || null,
    hospitalSystemId: firstSystem?.systemId || systemId || null,
    systemName: firstSystem?.systemName || systemName || null,
    status: stageStatus,
    inputSummary: {
      requested_state: state || null,
      facility_id: facilityId || null,
      hospital_system_ids: hospitalSystemIds || [],
      requested_seed_url: seedUrl || null,
    },
    outputSummary: {
      systems: systems.length,
      seed_urls: seeds.length,
      targeted_records_seeds: seeds.filter((seed) => /records_page/i.test(seed.seed_type || '')).length,
      approved_seed_urls: seeds.filter((seed) => Boolean(seed.approved_by_human)).length,
    },
  });

  const artifactDirectory = await ensureSeedScopeArtifactStateDir(firstSystem?.state || state || 'TX');
  const artifactPath = path.join(artifactDirectory, `${stageRun.id}.json`);
  await fs.writeFile(
    artifactPath,
    JSON.stringify(
      {
        stage_run_id: stageRun.id,
        state: firstSystem?.state || state || null,
        requested_scope: {
          system_name: systemName || null,
          system_id: systemId || null,
          facility_id: facilityId || null,
          seed_url: seedUrl || null,
          hospital_system_ids: hospitalSystemIds || [],
        },
        systems: systems.map((system) => ({
          system_id: system.systemId,
          system_name: system.systemName,
          state: system.state,
          seed_urls: system.seeds.map((seed) => ({
            id: seed.id,
            url: seed.url,
            seed_type: seed.seed_type,
            approved_by_human: Boolean(seed.approved_by_human),
            facility_id: seed.facility_id || null,
            facility_name: seed.facility_name || null,
          })),
        })),
      },
      null,
      2,
    ),
  );

  if (stageStatus !== 'running') {
    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: stageStatus,
      outputSummary: {
        systems: systems.length,
        seed_urls: seeds.length,
        artifact_path: artifactPath,
      },
    });
  }

  return {
    status: stageStatus === 'ok' ? 'ok' : 'no_seeds',
    stage_key: SEED_SCOPE_STAGE_KEY,
    stage_label: SEED_SCOPE_STAGE_LABEL,
    stage_status: stageStatus,
    stage_run_id: stageRun.id,
    systems: systems.length,
    crawled: 0,
    extracted: seeds.length,
    failed: 0,
    seed_urls: seeds.length,
    artifact_path: artifactPath,
    details: systems.flatMap((system) =>
      system.seeds.map((seed) => ({
        system_name: system.systemName,
        url: seed.url,
        seed_type: seed.seed_type,
        approved_by_human: Boolean(seed.approved_by_human),
        facility_name: seed.facility_name || null,
      })),
    ),
  };
}
