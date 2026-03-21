import {
  completePipelineStageRun,
  insertPipelineStageRun,
} from '../../repositories/pipelineStageRepository.js';
import {
  buildFetchStageStatus,
  resolvePipelineSystems,
  runFetchStageForSystem,
} from './crawlStageCommon.js';

const FETCH_STAGE_KEY = 'fetch_stage';
const FETCH_STAGE_LABEL = 'Fetch Stage';

export async function runFetchStage({
  systemName = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  state = null,
  maxDepth = undefined,
} = {}) {
  const { seeds, systems } = await resolvePipelineSystems({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state,
  });

  if (seeds.length === 0) {
    return {
      status: 'no_seeds',
      stage_key: FETCH_STAGE_KEY,
      stage_label: FETCH_STAGE_LABEL,
      stage_status: 'no_seeds',
      stage_run_id: null,
      systems: 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      fetched_documents: 0,
      details: [],
    };
  }

  let crawled = 0;
  let failed = 0;
  const details = [];
  let latestStageRunId = null;

  for (const system of systems) {
    const stageRun = await insertPipelineStageRun({
      stageKey: FETCH_STAGE_KEY,
      stageLabel: FETCH_STAGE_LABEL,
      state: system.state,
      hospitalSystemId: system.systemId,
      systemName: system.systemName,
      status: 'running',
      inputSummary: {
        seed_urls: system.seeds.length,
        max_depth: maxDepth,
      },
      outputSummary: {},
    });
    latestStageRunId = stageRun.id;

    const systemSummary = await runFetchStageForSystem({
      system,
      fetchStageRunId: stageRun.id,
      maxDepth,
    });

    crawled += systemSummary.fetchedDocuments;
    failed += systemSummary.failedDocuments;
    details.push(
      ...systemSummary.details.map((detail) => ({
        system: system.systemName,
        state: system.state,
        ...detail,
      })),
    );

    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: buildFetchStageStatus({
        fetchedDocuments: systemSummary.fetchedDocuments,
        failedDocuments: systemSummary.failedDocuments,
      }),
      outputSummary: {
        fetched_documents: systemSummary.fetchedDocuments,
        failed_documents: systemSummary.failedDocuments,
      },
      errorSummary:
        systemSummary.failedDocuments > 0
          ? {
              message: `${systemSummary.failedDocuments} fetches failed during the latest fetch stage run.`,
            }
          : null,
    });
  }

  return {
    status: failed > 0 && crawled === 0 ? 'failed' : 'ok',
    stage_key: FETCH_STAGE_KEY,
    stage_label: FETCH_STAGE_LABEL,
    stage_status: buildFetchStageStatus({
      fetchedDocuments: crawled,
      failedDocuments: failed,
    }),
    stage_run_id: latestStageRunId,
    systems: systems.length,
    crawled,
    extracted: crawled,
    failed,
    fetched_documents: crawled,
    details,
  };
}
