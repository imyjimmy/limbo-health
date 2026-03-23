import { config } from '../../config.js';
import { resolvePipelineSystems } from './crawlStageCommon.js';
import { runSeedScopeStage } from './seedScopeStageService.js';
import { runFetchStage } from './fetchStageService.js';
import { runTriageStage } from './triageStageService.js';
import { runAcceptanceStage } from './acceptanceStageService.js';
import { runParseStage } from './parseStageService.js';
import { runWorkflowExtractionStage } from './workflowExtractionStageService.js';
import { runQuestionExtractionStage } from './questionExtractionStageService.js';

function buildNoDocumentsStageSummary(stageKey, stageLabel) {
  return {
    status: 'no_documents',
    stage_key: stageKey,
    stage_label: stageLabel,
    stage_status: 'no_documents',
    stage_run_id: null,
    systems: 0,
    crawled: 0,
    extracted: 0,
    failed: 0,
    details: [],
  };
}

function pickOverallStatus(stages = []) {
  if (stages.some((stage) => stage?.status === 'failed' || stage?.stage_status === 'failed')) {
    return 'failed';
  }

  if (stages.every((stage) => stage?.stage_status === 'no_documents')) {
    return 'no_documents';
  }

  if (stages.some((stage) => stage?.stage_status === 'partial')) {
    return 'partial';
  }

  return 'ok';
}

export async function runFullPipelineForSystems({
  systemName = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  state = config.crawlState,
  maxDepth = config.crawl.maxDepth,
  includeQuestionStage = true,
} = {}) {
  const seedStage = await runSeedScopeStage({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state,
  });

  const { systems } = await resolvePipelineSystems({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state,
  });

  if (!systems.length) {
    return {
      status: 'no_seeds',
      systems: 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      details: [],
      seed_stage: seedStage,
      system_runs: [],
    };
  }

  const systemRuns = [];
  let crawled = 0;
  let extracted = 0;
  let failed = 0;
  let detailRows = [];

  for (const system of systems) {
    const fetchStage = await runFetchStage({
      systemId: system.systemId,
      state: system.state,
      maxDepth,
    });
    const triageStage = await runTriageStage({
      systemId: system.systemId,
      fetchStageRunId: fetchStage.stage_run_id,
    });
    const acceptanceStage = await runAcceptanceStage({
      systemId: system.systemId,
      triageStageRunId: triageStage.stage_run_id,
    });

    const acceptedSourceDocumentIds = (acceptanceStage.details || [])
      .filter((detail) => detail.status === 'accepted' && detail.source_document_id)
      .map((detail) => detail.source_document_id);

    const parseStage =
      acceptedSourceDocumentIds.length > 0
        ? await runParseStage({
            systemId: system.systemId,
            sourceDocumentIds: acceptedSourceDocumentIds,
          })
        : buildNoDocumentsStageSummary('parse_stage', 'Parse Stage');

    const workflowStage =
      acceptedSourceDocumentIds.length > 0
        ? await runWorkflowExtractionStage({
            systemId: system.systemId,
            sourceDocumentIds: acceptedSourceDocumentIds,
          })
        : buildNoDocumentsStageSummary('workflow_extraction_stage', 'Workflow Extraction Stage');

    const questionStage =
      includeQuestionStage && acceptedSourceDocumentIds.length > 0
        ? await runQuestionExtractionStage({
            systemId: system.systemId,
            sourceDocumentIds: acceptedSourceDocumentIds,
          })
        : buildNoDocumentsStageSummary('question_extraction_stage', 'Question Extraction Stage');

    const stageSet = [fetchStage, triageStage, acceptanceStage, parseStage, workflowStage, questionStage];
    systemRuns.push({
      hospital_system_id: system.systemId,
      system_name: system.systemName,
      state: system.state,
      stages: {
        seed_stage: seedStage,
        fetch_stage: fetchStage,
        triage_stage: triageStage,
        acceptance_stage: acceptanceStage,
        parse_stage: parseStage,
        workflow_stage: workflowStage,
        question_stage: questionStage,
      },
      status: pickOverallStatus(stageSet),
    });

    crawled += Number(fetchStage.fetched_documents || fetchStage.crawled || 0);
    extracted += Number(acceptanceStage.source_documents_upserted || acceptanceStage.extracted || 0);
    failed +=
      Number(fetchStage.failed || 0) +
      Number(triageStage.failed || 0) +
      Number(acceptanceStage.failed || 0) +
      Number(parseStage.failed || 0) +
      Number(workflowStage.failed || 0) +
      Number(questionStage.failed || 0);

    detailRows = detailRows.concat(
      (fetchStage.details || []).map((detail) => ({
        system: system.systemName,
        state: system.state,
        stage: 'fetch',
        ...detail,
      })),
    );
  }

  return {
    status: systemRuns.some((run) => run.status === 'failed') ? 'failed' : 'ok',
    systems: systems.length,
    crawled,
    extracted,
    failed,
    details: detailRows,
    seed_stage: seedStage,
    system_runs: systemRuns,
  };
}
