import fs from 'node:fs/promises';
import path from 'node:path';
import { extractWorkflowBundle } from '../../extractors/workflowExtractor.js';
import {
  completePipelineStageRun,
  insertPipelineStageRun,
  listLatestParsedArtifactsForSystem,
} from '../../repositories/pipelineStageRepository.js';
import {
  insertExtractionRun,
  upsertPortalProfile,
  upsertWorkflowBundle,
} from '../../repositories/workflowRepository.js';
import { ensureWorkflowArtifactDir } from '../../utils/pipelineArtifactStorage.js';
import { isOfficialDomain } from '../../crawler/linkExpander.js';
import { loadParsedArtifactPayload } from './parseStageService.js';

const WORKFLOW_STAGE_KEY = 'workflow_extraction_stage';
const WORKFLOW_STAGE_LABEL = 'Workflow Extraction Stage';

function resolveWorkflowOfficialPageUrl(parsedArtifact) {
  if (parsedArtifact?.source_type === 'pdf') {
    return parsedArtifact.source_url;
  }

  return parsedArtifact?.source_page_url || parsedArtifact?.source_url || null;
}

function buildStageStatus({ totalDocuments, successfulDocuments, failedDocuments, partialDocuments }) {
  if (totalDocuments === 0) return 'no_documents';
  if (failedDocuments === 0 && partialDocuments === 0) return 'ok';
  if (successfulDocuments > 0 || partialDocuments > 0) return 'partial';
  return 'failed';
}

export async function runWorkflowExtractionStage({
  systemId = null,
  sourceDocumentIds = [],
  sourceType = null,
} = {}) {
  const parsedArtifacts = await listLatestParsedArtifactsForSystem({
    systemId,
    sourceDocumentIds,
    sourceType,
  });

  const firstArtifact = parsedArtifacts[0] || null;
  const stageRun = await insertPipelineStageRun({
    stageKey: WORKFLOW_STAGE_KEY,
    stageLabel: WORKFLOW_STAGE_LABEL,
    state: firstArtifact?.system_state || null,
    hospitalSystemId: firstArtifact?.hospital_system_id || systemId || null,
    systemName: firstArtifact?.system_name || null,
    status: parsedArtifacts.length === 0 ? 'no_documents' : 'running',
    inputSummary: {
      parsed_artifacts: parsedArtifacts.length,
      source_type: sourceType || null,
    },
  });

  if (parsedArtifacts.length === 0) {
    return {
      status: 'ok',
      stage_key: WORKFLOW_STAGE_KEY,
      stage_label: WORKFLOW_STAGE_LABEL,
      stage_status: 'no_documents',
      stage_run_id: stageRun?.id || null,
      systems: systemId ? 1 : 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      parsed_artifacts: 0,
      workflow_rows: 0,
      partial_documents: 0,
      details: [],
    };
  }

  const details = [];
  let successfulDocuments = 0;
  let failedDocuments = 0;
  let partialDocuments = 0;
  let workflowRows = 0;

  for (const parsedArtifact of parsedArtifacts) {
    if (parsedArtifact.parse_status !== 'success') {
      failedDocuments += 1;
      details.push({
        source_document_id: parsedArtifact.source_document_id,
        parsed_artifact_id: parsedArtifact.id,
        title: parsedArtifact.title || null,
        source_url: parsedArtifact.source_url,
        status: 'parse_failure',
        parse_status: parsedArtifact.parse_status,
      });
      continue;
    }

    try {
      const artifactPayload = await loadParsedArtifactPayload(parsedArtifact.storage_path);
      const parsedDocument = artifactPayload?.parsed_document || null;
      const bundle = extractWorkflowBundle(parsedDocument, {
        isOfficialDomain: isOfficialDomain(
          parsedArtifact.source_url,
          parsedArtifact.canonical_domain,
        ),
      });
      const extractionStatus = bundle.workflows.length > 0 ? 'success' : 'partial';
      const structuredOutput = {
        portal: bundle.portal,
        workflows: bundle.workflows,
        evidenceSnippets: bundle.evidenceSnippets,
        metadata: {
          sourceUrl: parsedArtifact.source_url,
          sourcePageUrl: parsedArtifact.source_page_url || null,
          sourceType: parsedArtifact.source_type,
          parsedArtifactId: parsedArtifact.id,
          parseStatus: parsedArtifact.parse_status,
          stageRunId: stageRun.id,
        },
      };

      const extractionRunId = await insertExtractionRun({
        sourceDocumentId: parsedArtifact.source_document_id,
        extractorName: 'workflow_extractor',
        extractorVersion: 'v1',
        status: extractionStatus,
        structuredOutput,
      });

      if (bundle.portal) {
        await upsertPortalProfile({
          hospitalSystemId: parsedArtifact.hospital_system_id,
          facilityId: parsedArtifact.facility_id || null,
          portalName: bundle.portal.portalName,
          portalUrl: bundle.portal.portalUrl,
          portalScope: bundle.portal.portalScope,
          supportsFormalCopyRequestInPortal: bundle.portal.supportsFormalCopyRequestInPortal,
          notes: bundle.portal.notes || null,
        });
      }

      await upsertWorkflowBundle({
        hospitalSystemId: parsedArtifact.hospital_system_id,
        facilityId: parsedArtifact.facility_id || null,
        officialPageUrl: resolveWorkflowOfficialPageUrl(parsedArtifact),
        contentHash: parsedArtifact.content_hash,
        verifiedAt: parsedArtifact.fetched_at,
        workflows: bundle.workflows,
      });

      const workflowDir = await ensureWorkflowArtifactDir(
        parsedArtifact.system_state,
        parsedArtifact.source_document_id,
      );
      const workflowArtifactPath = path.join(workflowDir, `${extractionRunId}.json`);
      await fs.writeFile(
        workflowArtifactPath,
        JSON.stringify(
          {
            extraction_run_id: extractionRunId,
            stage_run_id: stageRun.id,
            source_document_id: parsedArtifact.source_document_id,
            parsed_artifact_id: parsedArtifact.id,
            source_url: parsedArtifact.source_url,
            source_page_url: parsedArtifact.source_page_url || null,
            status: extractionStatus,
            portal: bundle.portal,
            workflows: bundle.workflows,
            evidence_snippets: bundle.evidenceSnippets,
            metadata: structuredOutput.metadata,
          },
          null,
          2,
        ),
      );

      workflowRows += bundle.workflows.length;
      if (extractionStatus === 'success') {
        successfulDocuments += 1;
      } else {
        partialDocuments += 1;
      }

      details.push({
        source_document_id: parsedArtifact.source_document_id,
        parsed_artifact_id: parsedArtifact.id,
        extraction_run_id: extractionRunId,
        title: parsedArtifact.title || null,
        source_url: parsedArtifact.source_url,
        status: extractionStatus,
        workflow_count: bundle.workflows.length,
      });
    } catch (error) {
      failedDocuments += 1;
      details.push({
        source_document_id: parsedArtifact.source_document_id,
        parsed_artifact_id: parsedArtifact.id,
        title: parsedArtifact.title || null,
        source_url: parsedArtifact.source_url,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Workflow extraction stage failed.',
      });
    }
  }

  const stageStatus = buildStageStatus({
    totalDocuments: parsedArtifacts.length,
    successfulDocuments,
    failedDocuments,
    partialDocuments,
  });
  await completePipelineStageRun({
    stageRunId: stageRun.id,
    status: stageStatus,
    outputSummary: {
      parsed_artifacts: parsedArtifacts.length,
      successful_documents: successfulDocuments,
      partial_documents: partialDocuments,
      failed_documents: failedDocuments,
      workflow_rows: workflowRows,
    },
    errorSummary:
      stageStatus === 'failed'
        ? {
            message: 'Workflow extraction failed for every targeted parsed artifact.',
          }
        : null,
  });

  return {
    status: stageStatus === 'failed' ? 'failed' : 'ok',
    stage_key: WORKFLOW_STAGE_KEY,
    stage_label: WORKFLOW_STAGE_LABEL,
    stage_status: stageStatus,
    stage_run_id: stageRun.id,
    systems: 1,
    crawled: 0,
    extracted: successfulDocuments,
    failed: failedDocuments,
    parsed_artifacts: parsedArtifacts.length,
    workflow_rows: workflowRows,
    partial_documents: partialDocuments,
    details,
  };
}
