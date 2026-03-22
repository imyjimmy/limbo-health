import { Router } from 'express';
import { getExtractionRunById } from '../repositories/workflowRepository.js';
import { runCrawl } from '../services/crawlService.js';
import {
  addManualApprovedUrl,
  importManualHtml,
  importManualPdf,
} from '../services/manualImportService.js';
import {
  getSourceDocumentQuestionReview,
  reextractQuestionReview,
  saveQuestionReviewDraft,
} from '../services/questionReviewService.js';
import { runReviewPublishStage } from '../services/pipeline/reviewPublishStageService.js';
import {
  acceptTriageDecision,
  rerunSourceDocumentParse,
  rerunSourceDocumentWorkflowExtraction,
  saveTriageOverride,
} from '../services/pipeline/humanRescueService.js';
import {
  getFetchArtifactDetail,
  getParsedArtifactDetail,
  getStageRunDetail,
  getTriageDecisionDetail,
  listStageRuns,
} from '../services/pipeline/pipelineInspectionService.js';
import {
  listPipelineRunHistory,
  runTrackedAcceptanceStage,
  runTrackedFetchStage,
  runTrackedFullStatePipelineBatch,
  runTrackedFullSystemPipeline,
  runTrackedParseStage,
  runTrackedQuestionExtractionStage,
  runTrackedSeedScopeStage,
  runTrackedSystemPipeline,
  runTrackedTriageStage,
  runTrackedWorkflowExtractionStage,
} from '../services/pipelineRunHistoryService.js';
import { getStateReviewQueue } from '../services/reviewQueueService.js';
import { saveStateSeedFile } from '../services/seedEditorService.js';
import { reseedFromFile } from '../services/seedService.js';
import { getHospitalSystemDetail } from '../services/systemDetailService.js';
import {
  getNationalStateOverview,
  getStateSummary,
  listStateSystems,
} from '../services/stateSummaryService.js';
import { runStateDataMaterializationStage } from '../services/stateDataMaterializationService.js';

export const internalRouter = Router();

function toErrorPayload(error, fallbackMessage) {
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage;

  if (/not found/i.test(message)) {
    return { status: 404, body: { error: message } };
  }

  if (/required|valid|provide|must|belongs to/i.test(message)) {
    return { status: 400, body: { error: message } };
  }

  return { status: 500, body: { error: fallbackMessage } };
}

internalRouter.get('/states/overview', async (req, res) => {
  try {
    const forceRefresh = req.query?.force === '1' || req.query?.force === 'true';
    const overview = await getNationalStateOverview({ forceRefresh });
    return res.json(overview);
  } catch (error) {
    console.error('Failed to load national state overview:', error);
    const response = toErrorPayload(error, 'Failed to load national state overview.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/states/:state/summary', async (req, res) => {
  try {
    const summary = await getStateSummary(req.params.state);
    return res.json(summary);
  } catch (error) {
    console.error('Failed to load state summary:', error);
    const response = toErrorPayload(error, 'Failed to load state summary.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/states/:state/systems', async (req, res) => {
  try {
    const systems = await listStateSystems(req.params.state);
    return res.json(systems);
  } catch (error) {
    console.error('Failed to load state systems:', error);
    const response = toErrorPayload(error, 'Failed to load state systems.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/states/:state/review-queue', async (req, res) => {
  try {
    const reviewQueue = await getStateReviewQueue(req.params.state);
    return res.json(reviewQueue);
  } catch (error) {
    console.error('Failed to load review queue:', error);
    const response = toErrorPayload(error, 'Failed to load review queue.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/states/:state/data-intake', async (req, res) => {
  try {
    const result = await runStateDataMaterializationStage({
      state: req.params.state,
      reseedDb: req.body?.reseed_db !== false && req.body?.reseedDb !== false,
    });
    return res.json(result);
  } catch (error) {
    console.error('Failed to materialize state seeds from data:', error);
    const response = toErrorPayload(error, 'Failed to materialize state seeds from data.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/states/:state/pipeline/full', async (req, res) => {
  try {
    const summary = await runTrackedFullStatePipelineBatch({
      state: req.params.state,
      hospitalSystemIds: req.body?.hospital_system_ids || req.body?.hospitalSystemIds || [],
      maxDepth: Number.isInteger(req.body?.max_depth)
        ? req.body.max_depth
        : Number.isInteger(req.body?.maxDepth)
          ? req.body.maxDepth
          : undefined,
      replaceDraft:
        req.body?.replace_draft !== false && req.body?.replaceDraft !== false,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Full state pipeline failed:', error);
    const response = toErrorPayload(error, 'Full state pipeline failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/hospital-systems/:id', async (req, res) => {
  try {
    const detail = await getHospitalSystemDetail(req.params.id);
    if (!detail) {
      return res.status(404).json({ error: 'Hospital system not found.' });
    }
    return res.json(detail);
  } catch (error) {
    console.error('Failed to load hospital-system detail:', error);
    return res.status(500).json({ error: 'Failed to load hospital-system detail.' });
  }
});

internalRouter.get('/pipeline-runs', async (req, res) => {
  try {
    const history = await listPipelineRunHistory({
      state: req.query?.state || null,
      systemId: req.query?.system_id || req.query?.systemId || null,
      limit: req.query?.limit || null,
    });
    return res.json(history);
  } catch (error) {
    console.error('Failed to load pipeline run history:', error);
    const response = toErrorPayload(error, 'Failed to load pipeline run history.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/pipeline/stage-runs', async (req, res) => {
  try {
    const runs = await listStageRuns({
      systemId: req.query?.system_id || req.query?.systemId || null,
      stageKey: req.query?.stage_key || req.query?.stageKey || null,
      limit: req.query?.limit || null,
    });
    return res.json(runs);
  } catch (error) {
    console.error('Failed to load pipeline stage runs:', error);
    const response = toErrorPayload(error, 'Failed to load pipeline stage runs.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/pipeline/stage-runs/:id', async (req, res) => {
  try {
    const stageRun = await getStageRunDetail(req.params.id);
    if (!stageRun) {
      return res.status(404).json({ error: 'Pipeline stage run not found.' });
    }
    return res.json(stageRun);
  } catch (error) {
    console.error('Failed to load pipeline stage run detail:', error);
    const response = toErrorPayload(error, 'Failed to load pipeline stage run detail.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/fetch-artifacts/:id', async (req, res) => {
  try {
    const artifact = await getFetchArtifactDetail(req.params.id);
    if (!artifact) {
      return res.status(404).json({ error: 'Fetch artifact not found.' });
    }
    return res.json(artifact);
  } catch (error) {
    console.error('Failed to load fetch artifact:', error);
    const response = toErrorPayload(error, 'Failed to load fetch artifact.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/triage-decisions/:id', async (req, res) => {
  try {
    const decision = await getTriageDecisionDetail(req.params.id);
    if (!decision) {
      return res.status(404).json({ error: 'Triage decision not found.' });
    }
    return res.json(decision);
  } catch (error) {
    console.error('Failed to load triage decision:', error);
    const response = toErrorPayload(error, 'Failed to load triage decision.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/triage-decisions/:id/override', async (req, res) => {
  try {
    const result = await saveTriageOverride(req.params.id, {
      overrideDecision: req.body?.override_decision || req.body?.overrideDecision,
      notes: req.body?.notes || null,
      createdBy: req.body?.created_by || req.body?.createdBy || 'operator-console',
    });
    return res.json(result);
  } catch (error) {
    console.error('Failed to save triage override:', error);
    const response = toErrorPayload(error, 'Failed to save triage override.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/triage-decisions/:id/accept', async (req, res) => {
  try {
    const result = await acceptTriageDecision(req.params.id, {
      notes: req.body?.notes || null,
      createdBy: req.body?.created_by || req.body?.createdBy || 'operator-console',
    });
    return res.json(result);
  } catch (error) {
    console.error('Failed to accept triage decision:', error);
    const response = toErrorPayload(error, 'Failed to accept triage decision.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/parsed-artifacts/:id', async (req, res) => {
  try {
    const artifact = await getParsedArtifactDetail(req.params.id);
    if (!artifact) {
      return res.status(404).json({ error: 'Parsed artifact not found.' });
    }
    return res.json(artifact);
  } catch (error) {
    console.error('Failed to load parsed artifact:', error);
    const response = toErrorPayload(error, 'Failed to load parsed artifact.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/seeds/save', async (req, res) => {
  try {
    const state = req.body?.state;
    const systems = req.body?.systems;
    const shouldReseed = req.body?.reseed_db === true || req.body?.reseedDb === true;
    const saved = await saveStateSeedFile({ state, systems });
    const reseedSummary = shouldReseed ? await reseedFromFile({ state }) : null;
    return res.json({
      status: 'ok',
      saved,
      reseed_summary: reseedSummary,
    });
  } catch (error) {
    console.error('Failed to save seed file:', error);
    const response = toErrorPayload(error, 'Failed to save seed file.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/manual-url', async (req, res) => {
  try {
    const result = await addManualApprovedUrl({
      hospitalSystemId: req.body?.hospital_system_id || req.body?.hospitalSystemId,
      systemName: req.body?.system_name || req.body?.systemName || null,
      domain: req.body?.domain || null,
      state: req.body?.state || null,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      officialPageUrl: req.body?.official_page_url || req.body?.officialPageUrl,
      directPdfUrl: req.body?.direct_pdf_url || req.body?.directPdfUrl || null,
      notes: req.body?.notes || null,
      updateSeedFile:
        req.body?.update_seed_file !== false && req.body?.updateSeedFile !== false,
      crawlNow: req.body?.crawl_now === true || req.body?.crawlNow === true,
    });
    return res.json(result);
  } catch (error) {
    console.error('Failed to add manual URL:', error);
    const response = toErrorPayload(error, 'Failed to add manual URL.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/manual-import/html', async (req, res) => {
  try {
    const result = await importManualHtml({
      state: req.body?.state || null,
      hospitalSystemId: req.body?.hospital_system_id || req.body?.hospitalSystemId,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      sourceUrl: req.body?.source_url || req.body?.sourceUrl || null,
      titleOverride: req.body?.title_override || req.body?.titleOverride || null,
      notes: req.body?.notes || null,
      localFilePath: req.body?.local_file_path || req.body?.localFilePath || null,
      html: req.body?.html || null,
      fileBase64: req.body?.file_base64 || req.body?.fileBase64 || null,
    });
    return res.json(result);
  } catch (error) {
    console.error('Failed to import manual HTML:', error);
    const response = toErrorPayload(error, 'Failed to import manual HTML.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/manual-import/pdf', async (req, res) => {
  try {
    const result = await importManualPdf({
      state: req.body?.state || null,
      hospitalSystemId: req.body?.hospital_system_id || req.body?.hospitalSystemId,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      sourceUrl: req.body?.source_url || req.body?.sourceUrl || null,
      titleOverride: req.body?.title_override || req.body?.titleOverride || null,
      notes: req.body?.notes || null,
      localFilePath: req.body?.local_file_path || req.body?.localFilePath || null,
      fileBase64: req.body?.file_base64 || req.body?.fileBase64 || null,
    });
    return res.json(result);
  } catch (error) {
    console.error('Failed to import manual PDF:', error);
    const response = toErrorPayload(error, 'Failed to import manual PDF.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/crawl/run', async (req, res) => {
  try {
    const summary = await runCrawl({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      seedUrl: req.body?.seed_url || req.body?.seedUrl || null,
      maxDepth: Number.isInteger(req.body?.max_depth)
        ? req.body.max_depth
        : Number.isInteger(req.body?.maxDepth)
          ? req.body.maxDepth
          : undefined,
    });

    return res.json(summary);
  } catch (error) {
    console.error('Crawl run failed:', error);
    return res.status(500).json({ error: 'Crawl run failed.' });
  }
});

internalRouter.post('/crawl/system', async (req, res) => {
  try {
    const summary = await runTrackedSystemPipeline({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      seedUrl: req.body?.seed_url || req.body?.seedUrl || null,
      maxDepth: Number.isInteger(req.body?.max_depth)
        ? req.body.max_depth
        : Number.isInteger(req.body?.maxDepth)
          ? req.body.maxDepth
          : undefined,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Targeted crawl failed:', error);
    return res.status(500).json({ error: 'Targeted crawl failed.' });
  }
});

internalRouter.post('/pipeline/system/full', async (req, res) => {
  try {
    const summary = await runTrackedFullSystemPipeline({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      seedUrl: req.body?.seed_url || req.body?.seedUrl || null,
      maxDepth: Number.isInteger(req.body?.max_depth)
        ? req.body.max_depth
        : Number.isInteger(req.body?.maxDepth)
          ? req.body.maxDepth
          : undefined,
      replaceDraft:
        req.body?.replace_draft !== false && req.body?.replaceDraft !== false,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Full pipeline failed:', error);
    const response = toErrorPayload(error, 'Full pipeline failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/pipeline/system/seed-scope', async (req, res) => {
  try {
    const summary = await runTrackedSeedScopeStage({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      seedUrl: req.body?.seed_url || req.body?.seedUrl || null,
      hospitalSystemIds: req.body?.hospital_system_ids || req.body?.hospitalSystemIds || [],
    });
    return res.json(summary);
  } catch (error) {
    console.error('Seed scope stage failed:', error);
    const response = toErrorPayload(error, 'Seed scope stage failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/pipeline/system/fetch', async (req, res) => {
  try {
    const summary = await runTrackedFetchStage({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      facilityId: req.body?.facility_id || req.body?.facilityId || null,
      seedUrl: req.body?.seed_url || req.body?.seedUrl || null,
      hospitalSystemIds: req.body?.hospital_system_ids || req.body?.hospitalSystemIds || [],
      maxDepth: Number.isInteger(req.body?.max_depth)
        ? req.body.max_depth
        : Number.isInteger(req.body?.maxDepth)
          ? req.body.maxDepth
          : undefined,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Fetch stage failed:', error);
    const response = toErrorPayload(error, 'Fetch stage failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/pipeline/system/triage', async (req, res) => {
  try {
    const summary = await runTrackedTriageStage({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      fetchStageRunId: req.body?.fetch_stage_run_id || req.body?.fetchStageRunId || null,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Triage stage failed:', error);
    const response = toErrorPayload(error, 'Triage stage failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/pipeline/system/accept', async (req, res) => {
  try {
    const summary = await runTrackedAcceptanceStage({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      triageStageRunId: req.body?.triage_stage_run_id || req.body?.triageStageRunId || null,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Acceptance stage failed:', error);
    const response = toErrorPayload(error, 'Acceptance stage failed.');
    return res.status(response.status).json(response.body);
  }
});

async function handleQuestionStage(req, res) {
  try {
    const summary = await runTrackedQuestionExtractionStage({
      state: req.body?.state || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      replaceDraft:
        req.body?.replace_draft !== false && req.body?.replaceDraft !== false,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Question extraction stage failed:', error);
    const response = toErrorPayload(error, 'Question extraction stage failed.');
    return res.status(response.status).json(response.body);
  }
}

internalRouter.post('/pipeline/system/question-extraction', handleQuestionStage);
internalRouter.post('/pipeline/system/questions', handleQuestionStage);

internalRouter.post('/pipeline/system/parse', async (req, res) => {
  try {
    const summary = await runTrackedParseStage({
      state: req.body?.state || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      sourceType: req.body?.source_type || req.body?.sourceType || null,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Parse stage failed:', error);
    const response = toErrorPayload(error, 'Parse stage failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/pipeline/system/workflows', async (req, res) => {
  try {
    const summary = await runTrackedWorkflowExtractionStage({
      state: req.body?.state || null,
      systemId: req.body?.system_id || req.body?.systemId || null,
      systemName: req.body?.system_name || req.body?.systemName || null,
      sourceType: req.body?.source_type || req.body?.sourceType || null,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Workflow extraction stage failed:', error);
    const response = toErrorPayload(error, 'Workflow extraction stage failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/crawl/zero-pdf-systems', async (req, res) => {
  try {
    const state = req.body?.state;
    const stateSystems = await listStateSystems(state);
    const hospitalSystemIds = stateSystems.systems
      .filter((system) => system.zero_pdf && system.hospital_system_id)
      .map((system) => system.hospital_system_id);

    if (hospitalSystemIds.length === 0) {
      return res.json({
        status: 'no_targets',
        systems: 0,
        crawled: 0,
        extracted: 0,
        failed: 0,
        details: [],
      });
    }

    const summary = await runCrawl({
      state,
      hospitalSystemIds,
    });
    return res.json(summary);
  } catch (error) {
    console.error('Zero-PDF crawl failed:', error);
    const response = toErrorPayload(error, 'Zero-PDF crawl failed.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/crawl/reseed', async (req, res) => {
  try {
    const summary = await reseedFromFile({
      state: req.body?.state || null,
      seedFilePath: req.body?.seed_file || req.body?.seedFile || null,
    });
    return res.json({ status: 'ok', summary });
  } catch (error) {
    console.error('Reseed failed:', error);
    return res.status(500).json({ error: 'Reseed failed.' });
  }
});

internalRouter.get('/source-documents/:id/question-review', async (req, res) => {
  try {
    const review = await getSourceDocumentQuestionReview(req.params.id);
    return res.json(review);
  } catch (error) {
    console.error('Failed to load question review:', error);
    const response = toErrorPayload(error, 'Failed to load question review.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/source-documents/:id/question-review/reextract', async (req, res) => {
  try {
    const review = await reextractQuestionReview(req.params.id, {
      replaceDraft:
        req.body?.replace_draft !== false && req.body?.replaceDraft !== false,
    });
    return res.json(review);
  } catch (error) {
    console.error('Failed to reextract question review:', error);
    const response = toErrorPayload(error, 'Failed to reextract question review.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/source-documents/:id/reparse', async (req, res) => {
  try {
    const summary = await rerunSourceDocumentParse(req.params.id);
    return res.json(summary);
  } catch (error) {
    console.error('Failed to reparse source document:', error);
    const response = toErrorPayload(error, 'Failed to reparse source document.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/source-documents/:id/reextract-workflow', async (req, res) => {
  try {
    const summary = await rerunSourceDocumentWorkflowExtraction(req.params.id);
    return res.json(summary);
  } catch (error) {
    console.error('Failed to rerun workflow extraction:', error);
    const response = toErrorPayload(error, 'Failed to rerun workflow extraction.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/source-documents/:id/question-review/draft', async (req, res) => {
  try {
    const review = await saveQuestionReviewDraft(req.params.id, {
      payload: req.body?.payload,
      reviewNotes: req.body?.review_notes || req.body?.reviewNotes || null,
      markUnsupported:
        req.body?.mark_unsupported === true || req.body?.markUnsupported === true,
    });
    return res.json(review);
  } catch (error) {
    console.error('Failed to save question-review draft:', error);
    const response = toErrorPayload(error, 'Failed to save question-review draft.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.post('/source-documents/:id/question-review/publish', async (req, res) => {
  try {
    const review = await runReviewPublishStage(req.params.id, {
      payload: req.body?.payload || null,
      reviewNotes: req.body?.review_notes || req.body?.reviewNotes || null,
    });
    return res.json(review);
  } catch (error) {
    console.error('Failed to publish question review:', error);
    const response = toErrorPayload(error, 'Failed to publish question review.');
    return res.status(response.status).json(response.body);
  }
});

internalRouter.get('/extraction-runs/:id', async (req, res) => {
  try {
    const run = await getExtractionRunById(req.params.id);
    if (!run) {
      return res.status(404).json({ error: 'Extraction run not found.' });
    }

    return res.json({ run });
  } catch (error) {
    console.error('Failed to load extraction run:', error);
    return res.status(500).json({ error: 'Failed to load extraction run.' });
  }
});
