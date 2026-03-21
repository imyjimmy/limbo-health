import fs from 'node:fs/promises';
import path from 'node:path';
import { query } from '../../db.js';
import {
  completePipelineStageRun,
  insertPipelineStageRun,
} from '../../repositories/pipelineStageRepository.js';
import { ensurePublishedArtifactDir } from '../../utils/pipelineArtifactStorage.js';
import { publishQuestionReview } from '../questionReviewService.js';

const REVIEW_PUBLISH_STAGE_KEY = 'review_publish_stage';
const REVIEW_PUBLISH_STAGE_LABEL = 'Review Publish Stage';

async function loadSourceDocumentContext(sourceDocumentId) {
  const result = await query(
    `select
       sd.id,
       sd.hospital_system_id,
       sd.source_url,
       sd.source_page_url,
       sd.source_type,
       sd.title,
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

export async function runReviewPublishStage(
  sourceDocumentId,
  {
    payload = null,
    reviewNotes = null,
  } = {},
) {
  const sourceDocument = await loadSourceDocumentContext(sourceDocumentId);
  if (!sourceDocument) {
    throw new Error('Source document not found.');
  }

  const stageRun = await insertPipelineStageRun({
    stageKey: REVIEW_PUBLISH_STAGE_KEY,
    stageLabel: REVIEW_PUBLISH_STAGE_LABEL,
    state: sourceDocument.system_state,
    hospitalSystemId: sourceDocument.hospital_system_id,
    systemName: sourceDocument.system_name,
    status: 'running',
    inputSummary: {
      source_document_id: sourceDocument.id,
      source_type: sourceDocument.source_type,
    },
  });

  try {
    const review = await publishQuestionReview(sourceDocumentId, {
      payload,
      reviewNotes,
    });

    const versionNo = Number(review?.published_version?.version_no || 0);
    const publishedDir = await ensurePublishedArtifactDir(
      sourceDocument.system_state,
      sourceDocument.id,
    );
    const artifactPath = path.join(publishedDir, `v${versionNo}.json`);
    await fs.writeFile(
      artifactPath,
      JSON.stringify(
        {
          stage_run_id: stageRun.id,
          source_document_id: sourceDocument.id,
          hospital_system_id: sourceDocument.hospital_system_id,
          source_url: sourceDocument.source_url,
          source_page_url: sourceDocument.source_page_url || null,
          version: review?.published_version || null,
          draft: review?.draft || null,
        },
        null,
        2,
      ),
    );

    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: 'ok',
      outputSummary: {
        published_versions: 1,
        version_no: versionNo,
        artifact_path: artifactPath,
      },
    });

    return {
      ...review,
      stage_key: REVIEW_PUBLISH_STAGE_KEY,
      stage_label: REVIEW_PUBLISH_STAGE_LABEL,
      stage_status: 'ok',
      stage_run_id: stageRun.id,
      artifact_path: artifactPath,
    };
  } catch (error) {
    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: 'failed',
      outputSummary: {
        published_versions: 0,
      },
      errorSummary: {
        message: error instanceof Error ? error.message : 'Review publish stage failed.',
      },
    });
    throw error;
  }
}
