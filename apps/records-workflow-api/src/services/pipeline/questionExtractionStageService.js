import fs from 'node:fs/promises';
import path from 'node:path';
import { extractPdfFormUnderstanding } from '../../extractors/pdfFormUnderstandingExtractor.js';
import {
  completePipelineStageRun,
  insertPipelineStageRun,
  listLatestParsedArtifactsForSystem,
} from '../../repositories/pipelineStageRepository.js';
import { persistQuestionExtractionResult } from '../questionReviewService.js';
import { ensureQuestionArtifactDir } from '../../utils/pipelineArtifactStorage.js';
import { loadParsedArtifactPayload } from './parseStageService.js';

const QUESTION_STAGE_KEY = 'question_extraction_stage';
const QUESTION_STAGE_LABEL = 'Question Extraction Stage';

function buildStageStatus({ totalDocuments, successfulDocuments, failedDocuments, partialDocuments }) {
  if (totalDocuments === 0) return 'no_documents';
  if (failedDocuments === 0 && partialDocuments === 0) return 'ok';
  if (successfulDocuments > 0 || partialDocuments > 0) return 'partial';
  return 'failed';
}

function countQuestions(payload) {
  return Array.isArray(payload?.questions) ? payload.questions.length : 0;
}

export async function runQuestionExtractionStage({
  systemId = null,
  sourceDocumentIds = [],
  replaceDraft = true,
} = {}) {
  const parsedArtifacts = await listLatestParsedArtifactsForSystem({
    systemId,
    sourceDocumentIds,
    sourceType: 'pdf',
  });

  const firstArtifact = parsedArtifacts[0] || null;
  const stageRun = await insertPipelineStageRun({
    stageKey: QUESTION_STAGE_KEY,
    stageLabel: QUESTION_STAGE_LABEL,
    state: firstArtifact?.system_state || null,
    hospitalSystemId: firstArtifact?.hospital_system_id || systemId || null,
    systemName: firstArtifact?.system_name || null,
    status: parsedArtifacts.length === 0 ? 'no_documents' : 'running',
    inputSummary: {
      parsed_artifacts: parsedArtifacts.length,
      source_type: 'pdf',
    },
  });

  if (parsedArtifacts.length === 0) {
    return {
      status: 'ok',
      stage_key: QUESTION_STAGE_KEY,
      stage_label: QUESTION_STAGE_LABEL,
      stage_status: 'no_documents',
      stage_run_id: stageRun?.id || null,
      systems: systemId ? 1 : 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      parsed_artifacts: 0,
      pdf_documents: 0,
      reextracted: 0,
      partial_documents: 0,
      details: [],
    };
  }

  const details = [];
  let successfulDocuments = 0;
  let partialDocuments = 0;
  let failedDocuments = 0;

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
      const extraction = await extractPdfFormUnderstanding({
        parsedPdf: artifactPayload?.parsed_document || null,
        hospitalSystemName: parsedArtifact.system_name,
        facilityName: parsedArtifact.facility_name || null,
        formName:
          parsedArtifact.title ||
          path.basename(parsedArtifact.source_url || 'authorization-form.pdf'),
        sourceUrl: parsedArtifact.source_url,
      });

      const structuredOutput = {
        ...(extraction?.structuredOutput || {}),
        metadata: {
          ...(extraction?.structuredOutput?.metadata || {}),
          sourceUrl: parsedArtifact.source_url,
          sourcePageUrl: parsedArtifact.source_page_url || null,
          sourceType: parsedArtifact.source_type,
          parsedArtifactId: parsedArtifact.id,
          parseStatus: parsedArtifact.parse_status,
          stageRunId: stageRun.id,
        },
      };

      const persisted = await persistQuestionExtractionResult(parsedArtifact.source_document_id, {
        extraction: {
          ...extraction,
          structuredOutput,
        },
        replaceDraft,
      });

      const artifactDir = await ensureQuestionArtifactDir(
        parsedArtifact.system_state,
        parsedArtifact.source_document_id,
      );
      const questionArtifactPath = path.join(artifactDir, `${persisted.extraction_run_id}.json`);
      await fs.writeFile(
        questionArtifactPath,
        JSON.stringify(
          {
            extraction_run_id: persisted.extraction_run_id,
            stage_run_id: stageRun.id,
            source_document_id: parsedArtifact.source_document_id,
            parsed_artifact_id: parsedArtifact.id,
            source_url: parsedArtifact.source_url,
            source_page_url: parsedArtifact.source_page_url || null,
            status: extraction.status,
            form_understanding: structuredOutput.form_understanding || null,
            metadata: structuredOutput.metadata || null,
          },
          null,
          2,
        ),
      );

      if (extraction.status === 'success') {
        successfulDocuments += 1;
      } else if (extraction.status === 'partial') {
        partialDocuments += 1;
      } else {
        failedDocuments += 1;
      }

      details.push({
        source_document_id: parsedArtifact.source_document_id,
        parsed_artifact_id: parsedArtifact.id,
        extraction_run_id: persisted.extraction_run_id,
        title: parsedArtifact.title || null,
        source_url: parsedArtifact.source_url,
        status: extraction.status,
        supported:
          typeof structuredOutput?.form_understanding?.supported === 'boolean'
            ? structuredOutput.form_understanding.supported
            : null,
        confidence: Number(structuredOutput?.form_understanding?.confidence || 0),
        question_count: countQuestions(structuredOutput?.form_understanding),
      });
    } catch (error) {
      failedDocuments += 1;
      details.push({
        source_document_id: parsedArtifact.source_document_id,
        parsed_artifact_id: parsedArtifact.id,
        title: parsedArtifact.title || null,
        source_url: parsedArtifact.source_url,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Question extraction stage failed.',
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
      reextracted: successfulDocuments + partialDocuments,
    },
    errorSummary:
      stageStatus === 'failed'
        ? {
            message: 'Question extraction failed for every targeted parsed PDF artifact.',
          }
        : null,
  });

  return {
    status: stageStatus === 'failed' ? 'failed' : 'ok',
    stage_key: QUESTION_STAGE_KEY,
    stage_label: QUESTION_STAGE_LABEL,
    stage_status: stageStatus,
    stage_run_id: stageRun.id,
    systems: 1,
    crawled: 0,
    extracted: successfulDocuments + partialDocuments,
    failed: failedDocuments,
    parsed_artifacts: parsedArtifacts.length,
    pdf_documents: parsedArtifacts.length,
    reextracted: successfulDocuments + partialDocuments,
    partial_documents: partialDocuments,
    details,
  };
}
