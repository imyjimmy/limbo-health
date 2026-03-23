import {
  completePipelineStageRun,
  getTriageDecisionById,
  insertPipelineStageRun,
  insertTriageOverride,
} from '../../repositories/pipelineStageRepository.js';
import { query } from '../../db.js';
import { runParseStage } from './parseStageService.js';
import { runWorkflowExtractionStage } from './workflowExtractionStageService.js';
import { promoteAcceptedFetchArtifact } from './crawlStageCommon.js';

async function loadSourceDocumentContext(sourceDocumentId) {
  const result = await query(
    `select
       sd.id,
       sd.hospital_system_id,
       hs.system_name,
       hs.state as system_state
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     where sd.id = $1
     limit 1`,
    [sourceDocumentId],
  );

  return result.rows[0] || null;
}

export async function saveTriageOverride(
  triageDecisionId,
  {
    overrideDecision,
    notes = null,
    createdBy = 'operator-console',
  } = {},
) {
  const triageDecision = await getTriageDecisionById(triageDecisionId);
  if (!triageDecision) {
    throw new Error('Triage decision not found.');
  }

  const override = await insertTriageOverride({
    triageDecisionId,
    overrideDecision,
    notes,
    createdBy,
  });

  return {
    triage_decision_id: triageDecisionId,
    original_decision: triageDecision.decision,
    override,
  };
}

export async function acceptTriageDecision(
  triageDecisionId,
  {
    notes = null,
    createdBy = 'operator-console',
  } = {},
) {
  const triageDecision = await getTriageDecisionById(triageDecisionId);
  if (!triageDecision) {
    throw new Error('Triage decision not found.');
  }

  const override = await insertTriageOverride({
    triageDecisionId,
    overrideDecision: 'accepted',
    notes,
    createdBy,
  });

  const stageRun = await insertPipelineStageRun({
    stageKey: 'acceptance_stage',
    stageLabel: 'Acceptance Stage',
    state: triageDecision.system_state,
    hospitalSystemId: triageDecision.hospital_system_id,
    systemName: triageDecision.system_name,
    status: 'running',
    inputSummary: {
      triage_decision_id: triageDecisionId,
      rescue: true,
    },
  });

  try {
    const promoted = await promoteAcceptedFetchArtifact({
      fetchArtifact: triageDecision,
      triageDecision: {
        ...triageDecision,
        decision: 'accepted',
      },
      acceptedStageRunId: stageRun.id,
    });

    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: 'ok',
      outputSummary: {
        accepted_documents: 1,
        source_documents_upserted: 1,
        triage_decision_id: triageDecisionId,
        source_document_id: promoted.sourceDocumentId,
        rescue: true,
      },
    });

    return {
      triage_decision_id: triageDecisionId,
      original_decision: triageDecision.decision,
      override,
      stage_run_id: stageRun.id,
      source_document_id: promoted.sourceDocumentId,
      storage_path: promoted.storagePath,
    };
  } catch (error) {
    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: 'failed',
      outputSummary: {
        accepted_documents: 0,
        source_documents_upserted: 0,
        triage_decision_id: triageDecisionId,
        rescue: true,
      },
      errorSummary: {
        message: error instanceof Error ? error.message : 'Acceptance rescue failed.',
      },
    });
    throw error;
  }
}

export async function rerunSourceDocumentParse(sourceDocumentId) {
  const sourceDocument = await loadSourceDocumentContext(sourceDocumentId);
  if (!sourceDocument) {
    throw new Error('Source document not found.');
  }

  return runParseStage({
    systemId: sourceDocument.hospital_system_id,
    sourceDocumentIds: [sourceDocumentId],
  });
}

export async function rerunSourceDocumentWorkflowExtraction(sourceDocumentId) {
  const sourceDocument = await loadSourceDocumentContext(sourceDocumentId);
  if (!sourceDocument) {
    throw new Error('Source document not found.');
  }

  return runWorkflowExtractionStage({
    systemId: sourceDocument.hospital_system_id,
    sourceDocumentIds: [sourceDocumentId],
  });
}
