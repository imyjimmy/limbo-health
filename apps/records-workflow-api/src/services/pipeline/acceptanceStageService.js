import {
  completePipelineStageRun,
  getLatestPipelineStageRun,
  insertPipelineStageRun,
  listTriageDecisionsForStageRun,
} from '../../repositories/pipelineStageRepository.js';
import { promoteAcceptedFetchArtifact } from './crawlStageCommon.js';

const ACCEPTANCE_STAGE_KEY = 'acceptance_stage';
const ACCEPTANCE_STAGE_LABEL = 'Acceptance Stage';

function buildAcceptanceStageStatus({ acceptedDocuments, failedDocuments }) {
  if (acceptedDocuments === 0 && failedDocuments === 0) return 'no_documents';
  if (acceptedDocuments === 0 && failedDocuments > 0) return 'failed';
  if (failedDocuments > 0) return 'partial';
  return 'ok';
}

export async function runAcceptanceStage({
  systemId = null,
  systemName = null,
  triageStageRunId = null,
} = {}) {
  const triageStageRun =
    triageStageRunId
      ? { id: triageStageRunId }
      : await getLatestPipelineStageRun({
          systemId,
          stageKey: 'triage_stage',
        });

  if (!triageStageRun?.id) {
    return {
      status: 'no_documents',
      stage_key: ACCEPTANCE_STAGE_KEY,
      stage_label: ACCEPTANCE_STAGE_LABEL,
      stage_status: 'no_documents',
      stage_run_id: null,
      systems: systemId ? 1 : 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      accepted_documents: 0,
      source_documents_upserted: 0,
      details: [],
    };
  }

  const triageDecisions = await listTriageDecisionsForStageRun({
    stageRunId: triageStageRun.id,
  });
  const firstDecision = triageDecisions[0] || null;
  const stageRun = await insertPipelineStageRun({
    stageKey: ACCEPTANCE_STAGE_KEY,
    stageLabel: ACCEPTANCE_STAGE_LABEL,
    state: firstDecision?.system_state || null,
    hospitalSystemId: firstDecision?.hospital_system_id || systemId || null,
    systemName: firstDecision?.system_name || systemName || null,
    status: triageDecisions.length === 0 ? 'no_documents' : 'running',
    inputSummary: {
      triage_stage_run_id: triageStageRun.id,
      triage_decisions: triageDecisions.length,
    },
    outputSummary: {},
  });

  if (triageDecisions.length === 0) {
    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: 'no_documents',
      outputSummary: {
        triage_decisions: 0,
        accepted_documents: 0,
        source_documents_upserted: 0,
      },
    });

    return {
      status: 'no_documents',
      stage_key: ACCEPTANCE_STAGE_KEY,
      stage_label: ACCEPTANCE_STAGE_LABEL,
      stage_status: 'no_documents',
      stage_run_id: stageRun.id,
      systems: systemId ? 1 : 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      accepted_documents: 0,
      source_documents_upserted: 0,
      details: [],
    };
  }

  const details = [];
  let acceptedDocuments = 0;
  let sourceDocumentsUpserted = 0;
  let failedDocuments = 0;

  for (const triageDecision of triageDecisions) {
    if (triageDecision.decision !== 'accepted') {
      details.push({
        triage_decision_id: triageDecision.id,
        fetch_artifact_id: triageDecision.fetch_artifact_id,
        url: triageDecision.final_url,
        title: triageDecision.title || null,
        status: 'not_accepted',
        decision: triageDecision.decision,
      });
      continue;
    }

    acceptedDocuments += 1;

    try {
      const promoted = await promoteAcceptedFetchArtifact({
        fetchArtifact: triageDecision,
        triageDecision,
        acceptedStageRunId: stageRun.id,
      });

      sourceDocumentsUpserted += 1;
      details.push({
        triage_decision_id: triageDecision.id,
        fetch_artifact_id: triageDecision.fetch_artifact_id,
        source_document_id: promoted.sourceDocumentId,
        url: triageDecision.final_url,
        title: promoted.title || triageDecision.title || null,
        status: 'accepted',
        storage_path: promoted.storagePath || null,
      });
    } catch (error) {
      failedDocuments += 1;
      details.push({
        triage_decision_id: triageDecision.id,
        fetch_artifact_id: triageDecision.fetch_artifact_id,
        url: triageDecision.final_url,
        title: triageDecision.title || null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Acceptance stage failed.',
      });
    }
  }

  const stageStatus = buildAcceptanceStageStatus({
    acceptedDocuments,
    failedDocuments,
  });

  await completePipelineStageRun({
    stageRunId: stageRun.id,
    status: stageStatus,
    outputSummary: {
      triage_stage_run_id: triageStageRun.id,
      triage_decisions: triageDecisions.length,
      accepted_documents: acceptedDocuments,
      source_documents_upserted: sourceDocumentsUpserted,
      failed_documents: failedDocuments,
    },
    errorSummary:
      failedDocuments > 0
        ? {
            message: `${failedDocuments} accepted decisions failed to promote into source documents.`,
          }
        : null,
  });

  return {
    status: stageStatus === 'failed' ? 'failed' : 'ok',
    stage_key: ACCEPTANCE_STAGE_KEY,
    stage_label: ACCEPTANCE_STAGE_LABEL,
    stage_status: stageStatus,
    stage_run_id: stageRun.id,
    systems: firstDecision?.hospital_system_id ? 1 : systemId ? 1 : 0,
    crawled: triageDecisions.length,
    extracted: sourceDocumentsUpserted,
    failed: failedDocuments,
    accepted_documents: acceptedDocuments,
    source_documents_upserted: sourceDocumentsUpserted,
    details,
  };
}
