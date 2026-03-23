import fs from 'node:fs/promises';
import path from 'node:path';
import {
  completePipelineStageRun,
  getLatestPipelineStageRun,
  insertPipelineStageRun,
  insertTriageDecision,
  listFetchArtifactsForStageRun,
} from '../../repositories/pipelineStageRepository.js';
import { ensureTriageArtifactStateDir } from '../../utils/pipelineArtifactStorage.js';
import {
  buildTriageDecision,
  classifyFetchArtifact,
  loadFetchArtifactDocument,
} from './crawlStageCommon.js';

const TRIAGE_STAGE_KEY = 'triage_stage';
const TRIAGE_STAGE_LABEL = 'Document Triage Stage';

function buildTriageStageStatus({ examinedDocuments, failedDocuments }) {
  if (examinedDocuments === 0 && failedDocuments === 0) return 'no_documents';
  if (examinedDocuments === 0 && failedDocuments > 0) return 'failed';
  if (failedDocuments > 0) return 'partial';
  return 'ok';
}

export async function runTriageStage({
  systemId = null,
  systemName = null,
  fetchStageRunId = null,
} = {}) {
  const fetchStageRun =
    fetchStageRunId
      ? { id: fetchStageRunId }
      : await getLatestPipelineStageRun({
          systemId,
          stageKey: 'fetch_stage',
        });

  if (!fetchStageRun?.id) {
    return {
      status: 'no_documents',
      stage_key: TRIAGE_STAGE_KEY,
      stage_label: TRIAGE_STAGE_LABEL,
      stage_status: 'no_documents',
      stage_run_id: null,
      systems: systemId ? 1 : 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      examined_documents: 0,
      accepted_documents: 0,
      skipped_documents: 0,
      review_needed_documents: 0,
      details: [],
    };
  }

  const fetchArtifacts = await listFetchArtifactsForStageRun({
    stageRunId: fetchStageRun.id,
  });
  const firstArtifact = fetchArtifacts[0] || null;
  const stageRun = await insertPipelineStageRun({
    stageKey: TRIAGE_STAGE_KEY,
    stageLabel: TRIAGE_STAGE_LABEL,
    state: firstArtifact?.system_state || null,
    hospitalSystemId: firstArtifact?.hospital_system_id || systemId || null,
    systemName: firstArtifact?.system_name || systemName || null,
    status: fetchArtifacts.length === 0 ? 'no_documents' : 'running',
    inputSummary: {
      fetch_stage_run_id: fetchStageRun.id,
      fetch_artifacts: fetchArtifacts.length,
    },
    outputSummary: {},
  });

  if (fetchArtifacts.length === 0) {
    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: 'no_documents',
      outputSummary: {
        fetch_artifacts: 0,
        accepted_documents: 0,
        skipped_documents: 0,
        review_needed_documents: 0,
      },
    });

    return {
      status: 'no_documents',
      stage_key: TRIAGE_STAGE_KEY,
      stage_label: TRIAGE_STAGE_LABEL,
      stage_status: 'no_documents',
      stage_run_id: stageRun.id,
      systems: systemId ? 1 : 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      examined_documents: 0,
      accepted_documents: 0,
      skipped_documents: 0,
      review_needed_documents: 0,
      details: [],
    };
  }

  const details = [];
  let acceptedDocuments = 0;
  let skippedDocuments = 0;
  let reviewNeededDocuments = 0;
  let failedDocuments = 0;

  for (const fetchArtifact of fetchArtifacts) {
    const sourceContext = fetchArtifact.fetch_metadata?.source_context || null;
    try {
      let parsedDocument = null;
      if (fetchArtifact.source_type === 'pdf' || fetchArtifact.source_type === 'html') {
        ({ parsedDocument } = await loadFetchArtifactDocument(fetchArtifact));
      }

      const documentClassification = classifyFetchArtifact({
        fetchArtifact,
        parsedDocument,
        sourceContext,
      });
      const triageDecision = buildTriageDecision({
        fetched: {
          sourceType: fetchArtifact.source_type,
        },
        documentClassification,
      });

      const decisionRow = await insertTriageDecision({
        triageStageRunId: stageRun.id,
        fetchArtifactId: fetchArtifact.id,
        decision: triageDecision.decision,
        basis: triageDecision.basis,
        reasonCode: triageDecision.reasonCode,
        reasonDetail: triageDecision.reasonDetail,
        classifierName: triageDecision.classifierName,
        classifierVersion: triageDecision.classifierVersion,
        evidence: {
          source_context: sourceContext,
          source_page_url: fetchArtifact.source_page_url || null,
          parse_status: parsedDocument?.parseStatus || null,
          content_hash: fetchArtifact.content_hash,
          fetch_stage_run_id: fetchStageRun.id,
        },
      });
      const triageDir = await ensureTriageArtifactStateDir(fetchArtifact.system_state || 'TX');
      await fs.writeFile(
        path.join(triageDir, `${decisionRow.id}.json`),
        JSON.stringify(
          {
            triage_decision_id: decisionRow.id,
            triage_stage_run_id: stageRun.id,
            fetch_artifact_id: fetchArtifact.id,
            decision: decisionRow.decision,
            basis: decisionRow.basis,
            reason_code: decisionRow.reason_code,
            reason_detail: decisionRow.reason_detail,
            classifier_name: decisionRow.classifier_name,
            classifier_version: decisionRow.classifier_version,
            evidence: decisionRow.evidence,
            fetch_artifact: {
              final_url: fetchArtifact.final_url,
              source_page_url: fetchArtifact.source_page_url || null,
              source_type: fetchArtifact.source_type,
              title: fetchArtifact.title || null,
            },
          },
          null,
          2,
        ),
      );

      if (triageDecision.decision === 'accepted') {
        acceptedDocuments += 1;
      } else if (triageDecision.decision === 'needs_review') {
        reviewNeededDocuments += 1;
      } else {
        skippedDocuments += 1;
      }

      details.push({
        triage_decision_id: decisionRow.id,
        fetch_artifact_id: fetchArtifact.id,
        url: fetchArtifact.final_url,
        title: fetchArtifact.title || null,
        source_type: fetchArtifact.source_type,
        status: triageDecision.decision,
        reason_code: triageDecision.reasonCode,
        parse_status: parsedDocument?.parseStatus || null,
      });
    } catch (error) {
      failedDocuments += 1;
      reviewNeededDocuments += 1;

      const decisionRow = await insertTriageDecision({
        triageStageRunId: stageRun.id,
        fetchArtifactId: fetchArtifact.id,
        decision: 'needs_review',
        basis: 'triage_input_error',
        reasonCode: 'triage_input_error',
        reasonDetail: error instanceof Error ? error.message : 'Triage stage failed to inspect the fetched artifact.',
        classifierName: 'triage_input_guard',
        classifierVersion: 'v1',
        evidence: {
          source_context: sourceContext,
          source_page_url: fetchArtifact.source_page_url || null,
          fetch_stage_run_id: fetchStageRun.id,
        },
      });
      const triageDir = await ensureTriageArtifactStateDir(fetchArtifact.system_state || 'TX');
      await fs.writeFile(
        path.join(triageDir, `${decisionRow.id}.json`),
        JSON.stringify(
          {
            triage_decision_id: decisionRow.id,
            triage_stage_run_id: stageRun.id,
            fetch_artifact_id: fetchArtifact.id,
            decision: decisionRow.decision,
            basis: decisionRow.basis,
            reason_code: decisionRow.reason_code,
            reason_detail: decisionRow.reason_detail,
            classifier_name: decisionRow.classifier_name,
            classifier_version: decisionRow.classifier_version,
            evidence: decisionRow.evidence,
            fetch_artifact: {
              final_url: fetchArtifact.final_url,
              source_page_url: fetchArtifact.source_page_url || null,
              source_type: fetchArtifact.source_type,
              title: fetchArtifact.title || null,
            },
          },
          null,
          2,
        ),
      );

      details.push({
        triage_decision_id: decisionRow.id,
        fetch_artifact_id: fetchArtifact.id,
        url: fetchArtifact.final_url,
        title: fetchArtifact.title || null,
        source_type: fetchArtifact.source_type,
        status: 'needs_review',
        error: error instanceof Error ? error.message : 'Triage stage failed.',
      });
    }
  }

  const stageStatus = buildTriageStageStatus({
    examinedDocuments: fetchArtifacts.length,
    failedDocuments,
  });

  await completePipelineStageRun({
    stageRunId: stageRun.id,
    status: stageStatus,
    outputSummary: {
      fetch_stage_run_id: fetchStageRun.id,
      fetch_artifacts: fetchArtifacts.length,
      accepted_documents: acceptedDocuments,
      skipped_documents: skippedDocuments,
      review_needed_documents: reviewNeededDocuments,
      failed_documents: failedDocuments,
    },
    errorSummary:
      failedDocuments > 0
        ? {
            message: `${failedDocuments} fetched artifacts could not be triaged automatically.`,
          }
        : null,
  });

  return {
    status: stageStatus === 'failed' ? 'failed' : 'ok',
    stage_key: TRIAGE_STAGE_KEY,
    stage_label: TRIAGE_STAGE_LABEL,
    stage_status: stageStatus,
    stage_run_id: stageRun.id,
    systems: firstArtifact?.hospital_system_id ? 1 : systemId ? 1 : 0,
    crawled: fetchArtifacts.length,
    extracted: acceptedDocuments,
    failed: failedDocuments,
    examined_documents: fetchArtifacts.length,
    accepted_documents: acceptedDocuments,
    skipped_documents: skippedDocuments,
    review_needed_documents: reviewNeededDocuments,
    details,
  };
}
