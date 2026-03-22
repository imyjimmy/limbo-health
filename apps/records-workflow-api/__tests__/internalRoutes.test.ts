import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/repositories/workflowRepository.js', () => ({
  getEffectiveWorkflowForFacility: vi.fn(),
  getFacilityById: vi.fn(),
  getHospitalSystemById: vi.fn(),
  getSourceDocumentById: vi.fn(),
  getSystemRequestPacket: vi.fn(),
  getSystemWorkflows: vi.fn(),
  listHospitalSystems: vi.fn(),
  searchFacilities: vi.fn(),
  getExtractionRunById: vi.fn(),
  insertExtractionRun: vi.fn(),
  upsertHospitalSystem: vi.fn(),
  upsertFacility: vi.fn(),
  upsertSeedUrl: vi.fn(),
  listActiveSeeds: vi.fn(),
  saveExtractionResult: vi.fn(),
}));

vi.mock('../src/services/stateSummaryService.js', () => ({
  getNationalStateOverview: vi.fn(),
  getStateSummary: vi.fn(),
  listStateSystems: vi.fn(),
}));

vi.mock('../src/services/reviewQueueService.js', () => ({
  getStateReviewQueue: vi.fn(),
}));

vi.mock('../src/services/systemDetailService.js', () => ({
  getHospitalSystemDetail: vi.fn(),
}));

vi.mock('../src/services/manualImportService.js', () => ({
  addManualApprovedUrl: vi.fn(),
  importManualHtml: vi.fn(),
  importManualPdf: vi.fn(),
}));

vi.mock('../src/services/questionReviewService.js', () => ({
  getSourceDocumentQuestionReview: vi.fn(),
  reextractQuestionReview: vi.fn(),
  saveQuestionReviewDraft: vi.fn(),
}));

vi.mock('../src/services/pipeline/reviewPublishStageService.js', () => ({
  runReviewPublishStage: vi.fn(),
}));

vi.mock('../src/services/pipeline/humanRescueService.js', () => ({
  acceptTriageDecision: vi.fn(),
  rerunSourceDocumentParse: vi.fn(),
  rerunSourceDocumentWorkflowExtraction: vi.fn(),
  saveTriageOverride: vi.fn(),
}));

vi.mock('../src/services/pipelineRunHistoryService.js', () => ({
  listPipelineRunHistory: vi.fn(),
  runTrackedAcceptanceStage: vi.fn(),
  runTrackedFetchStage: vi.fn(),
  runTrackedFullStatePipelineBatch: vi.fn(),
  runTrackedFullSystemPipeline: vi.fn(),
  runTrackedParseStage: vi.fn(),
  runTrackedQuestionExtractionStage: vi.fn(),
  runTrackedSeedScopeStage: vi.fn(),
  runTrackedSystemPipeline: vi.fn(),
  runTrackedTriageStage: vi.fn(),
  runTrackedWorkflowExtractionStage: vi.fn(),
}));

vi.mock('../src/services/pipeline/pipelineInspectionService.js', () => ({
  getFetchArtifactDetail: vi.fn(),
  getParsedArtifactDetail: vi.fn(),
  getStageRunDetail: vi.fn(),
  getTriageDecisionDetail: vi.fn(),
  listStageRuns: vi.fn(),
}));

vi.mock('../src/services/seedService.js', () => ({
  reseedFromFile: vi.fn(),
  resolveSeedFilePath: vi.fn(),
}));

vi.mock('../src/services/crawlService.js', () => ({
  runCrawl: vi.fn(),
}));

vi.mock('../src/services/seedEditorService.js', () => ({
  saveStateSeedFile: vi.fn(),
}));

vi.mock('../src/services/stateDataMaterializationService.js', () => ({
  runStateDataMaterializationStage: vi.fn(),
}));

import { createApp } from '../src/server.js';
import { runCrawl } from '../src/services/crawlService.js';
import { importManualPdf } from '../src/services/manualImportService.js';
import {
  getSourceDocumentQuestionReview,
} from '../src/services/questionReviewService.js';
import { runReviewPublishStage } from '../src/services/pipeline/reviewPublishStageService.js';
import { reseedFromFile } from '../src/services/seedService.js';
import { saveStateSeedFile } from '../src/services/seedEditorService.js';
import { runStateDataMaterializationStage } from '../src/services/stateDataMaterializationService.js';
import {
  getNationalStateOverview,
  getStateSummary,
  listStateSystems,
} from '../src/services/stateSummaryService.js';
import {
  getFetchArtifactDetail,
  getStageRunDetail,
  listStageRuns,
} from '../src/services/pipeline/pipelineInspectionService.js';
import {
  acceptTriageDecision,
  rerunSourceDocumentParse,
  rerunSourceDocumentWorkflowExtraction,
  saveTriageOverride,
} from '../src/services/pipeline/humanRescueService.js';
import {
  runTrackedFetchStage,
  runTrackedFullStatePipelineBatch,
  runTrackedParseStage,
  runTrackedSeedScopeStage,
  runTrackedWorkflowExtractionStage,
} from '../src/services/pipelineRunHistoryService.js';

describe('records-workflow internal routes', () => {
  let server: http.Server;
  let baseUrl = '';

  beforeAll(async () => {
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves national state overview for the map dashboard', async () => {
    vi.mocked(getNationalStateOverview).mockResolvedValue({
      generated_at: '2026-03-20T12:00:00.000Z',
      states: [
        {
          state: 'WA',
          state_name: 'Washington',
          counts: { approved_templates: 8 },
          health: { key: 'healthy', label: 'Healthy' },
        },
      ],
      totals: {
        rollout_states: 50,
        healthy_states: 1,
      },
    } as never);

    const response = await fetch(`${baseUrl}/internal/states/overview?force=true`);

    expect(response.status).toBe(200);
    expect(getNationalStateOverview).toHaveBeenCalledWith({ forceRefresh: true });
    await expect(response.json()).resolves.toEqual({
      generated_at: '2026-03-20T12:00:00.000Z',
      states: [
        {
          state: 'WA',
          state_name: 'Washington',
          counts: { approved_templates: 8 },
          health: { key: 'healthy', label: 'Healthy' },
        },
      ],
      totals: {
        rollout_states: 50,
        healthy_states: 1,
      },
    });
  });

  it('serves state summary for the operator dashboard', async () => {
    vi.mocked(getStateSummary).mockResolvedValue({
      state: 'WA',
      seed_file_path: '/tmp/washington-systems.json',
      counts: {
        seeded_systems: 2,
      },
      systems: [],
    } as never);

    const response = await fetch(`${baseUrl}/internal/states/WA/summary`);

    expect(response.status).toBe(200);
    expect(getStateSummary).toHaveBeenCalledWith('WA');
    await expect(response.json()).resolves.toEqual({
      state: 'WA',
      seed_file_path: '/tmp/washington-systems.json',
      counts: {
        seeded_systems: 2,
      },
      systems: [],
    });
  });

  it('runs the full state pipeline batch for a state route', async () => {
    vi.mocked(runTrackedFullStatePipelineBatch).mockResolvedValue({
      stage_key: 'full_state_pipeline',
      stage_label: 'Full State Pipeline Batch',
      status: 'partial',
      state: 'NH',
      targeted_systems: 2,
      completed_systems: 2,
      ok_systems: 1,
      warning_systems: 1,
      failed_systems: 0,
      system_runs: [],
    } as never);

    const response = await fetch(`${baseUrl}/internal/states/NH/pipeline/full`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_draft: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(runTrackedFullStatePipelineBatch).toHaveBeenCalledWith({
      state: 'NH',
      hospitalSystemIds: [],
      maxDepth: undefined,
      replaceDraft: true,
    });
    await expect(response.json()).resolves.toEqual({
      stage_key: 'full_state_pipeline',
      stage_label: 'Full State Pipeline Batch',
      status: 'partial',
      state: 'NH',
      targeted_systems: 2,
      completed_systems: 2,
      ok_systems: 1,
      warning_systems: 1,
      failed_systems: 0,
      system_runs: [],
    });
  });

  it('saves edited seed JSON and optionally reseeds the DB', async () => {
    vi.mocked(saveStateSeedFile).mockResolvedValue({
      state: 'WA',
      seed_file_path: '/tmp/washington-systems.json',
      counts: { systems: 1 },
      systems: [],
    } as never);
    vi.mocked(reseedFromFile).mockResolvedValue({
      systems: 1,
      facilities: 1,
      seeds: 2,
    } as never);

    const response = await fetch(`${baseUrl}/internal/seeds/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'WA',
        systems: [{ system_name: 'MultiCare', state: 'WA', seed_urls: [] }],
        reseed_db: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(saveStateSeedFile).toHaveBeenCalledWith({
      state: 'WA',
      systems: [{ system_name: 'MultiCare', state: 'WA', seed_urls: [] }],
    });
    expect(reseedFromFile).toHaveBeenCalledWith({ state: 'WA' });
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      reseed_summary: {
        systems: 1,
        facilities: 1,
        seeds: 2,
      },
    });
  });

  it('routes manual PDF imports through the manual-import service', async () => {
    vi.mocked(importManualPdf).mockResolvedValue({
      status: 'ok',
      source_document_id: 'doc-1',
      content_url: '/api/records-workflow/source-documents/doc-1/content',
    } as never);

    const response = await fetch(`${baseUrl}/internal/manual-import/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'WA',
        hospital_system_id: 'system-1',
        source_url: 'https://example.org/forms/release.pdf',
        notes: 'Human-confirmed import',
      }),
    });

    expect(response.status).toBe(200);
    expect(importManualPdf).toHaveBeenCalledWith({
      state: 'WA',
      hospitalSystemId: 'system-1',
      facilityId: null,
      sourceUrl: 'https://example.org/forms/release.pdf',
      titleOverride: null,
      notes: 'Human-confirmed import',
      localFilePath: null,
      fileBase64: null,
    });
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      source_document_id: 'doc-1',
      content_url: '/api/records-workflow/source-documents/doc-1/content',
    });
  });

  it('publishes question-review drafts for a source document', async () => {
    vi.mocked(runReviewPublishStage).mockResolvedValue({
      source_document: { id: 'doc-1' },
      published_version: { id: 'version-1', version_no: 1 },
    } as never);

    const response = await fetch(
      `${baseUrl}/internal/source-documents/doc-1/question-review/publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: { supported: false },
          review_notes: 'Reviewed and intentionally unsupported.',
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(runReviewPublishStage).toHaveBeenCalledWith('doc-1', {
      payload: { supported: false },
      reviewNotes: 'Reviewed and intentionally unsupported.',
    });
    await expect(response.json()).resolves.toEqual({
      source_document: { id: 'doc-1' },
      published_version: { id: 'version-1', version_no: 1 },
    });
  });

  it('targets zero-pdf systems when requested', async () => {
    vi.mocked(listStateSystems).mockResolvedValue({
      state: 'WA',
      seed_file_path: '/tmp/washington-systems.json',
      systems: [
        {
          hospital_system_id: 'system-1',
          system_name: 'MultiCare',
          zero_pdf: true,
        },
        {
          hospital_system_id: 'system-2',
          system_name: 'UW Medicine',
          zero_pdf: false,
        },
      ],
    } as never);
    vi.mocked(runCrawl).mockResolvedValue({
      status: 'ok',
      systems: 1,
      crawled: 3,
      extracted: 2,
      failed: 0,
      details: [],
    } as never);

    const response = await fetch(`${baseUrl}/internal/crawl/zero-pdf-systems`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'WA' }),
    });

    expect(response.status).toBe(200);
    expect(runCrawl).toHaveBeenCalledWith({
      state: 'WA',
      hospitalSystemIds: ['system-1'],
    });
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      systems: 1,
      extracted: 2,
    });
  });

  it('runs the seed scope stage for one hospital system', async () => {
    vi.mocked(runTrackedSeedScopeStage).mockResolvedValue({
      status: 'ok',
      stage_key: 'seed_scope_stage',
      seed_urls: 2,
      systems: 1,
    } as never);

    const response = await fetch(`${baseUrl}/internal/pipeline/system/seed-scope`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'TX',
        system_id: 'system-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(runTrackedSeedScopeStage).toHaveBeenCalledWith({
      state: 'TX',
      systemName: null,
      systemId: 'system-1',
      facilityId: null,
      seedUrl: null,
      hospitalSystemIds: [],
    });
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      stage_key: 'seed_scope_stage',
      seed_urls: 2,
    });
  });

  it('runs the state data-intake stage for one state', async () => {
    vi.mocked(runStateDataMaterializationStage).mockResolvedValue({
      status: 'ok',
      stage_key: 'state_data_materialization_stage',
      state: 'NH',
      matching_files: 3,
      generated_systems: 2,
    } as never);

    const response = await fetch(`${baseUrl}/internal/states/NH/data-intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reseed_db: true,
      }),
    });

    expect(response.status).toBe(200);
    expect(runStateDataMaterializationStage).toHaveBeenCalledWith({
      state: 'NH',
      reseedDb: true,
    });
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      stage_key: 'state_data_materialization_stage',
      state: 'NH',
      matching_files: 3,
      generated_systems: 2,
    });
  });

  it('runs the fetch stage for one hospital system', async () => {
    vi.mocked(runTrackedFetchStage).mockResolvedValue({
      status: 'ok',
      stage_key: 'fetch_stage',
      fetched_documents: 8,
      failed: 0,
    } as never);

    const response = await fetch(`${baseUrl}/internal/pipeline/system/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'TX',
        system_id: 'system-1',
        max_depth: 1,
      }),
    });

    expect(response.status).toBe(200);
    expect(runTrackedFetchStage).toHaveBeenCalledWith({
      state: 'TX',
      systemName: null,
      systemId: 'system-1',
      facilityId: null,
      seedUrl: null,
      hospitalSystemIds: [],
      maxDepth: 1,
    });
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      stage_key: 'fetch_stage',
      fetched_documents: 8,
    });
  });

  it('runs the parse stage for one hospital system', async () => {
    vi.mocked(runTrackedParseStage).mockResolvedValue({
      status: 'ok',
      stage_key: 'parse_stage',
      parsed_documents: 3,
      failed: 1,
    } as never);

    const response = await fetch(`${baseUrl}/internal/pipeline/system/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'TX',
        system_id: 'system-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(runTrackedParseStage).toHaveBeenCalledWith({
      state: 'TX',
      systemId: 'system-1',
      systemName: null,
      sourceType: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      stage_key: 'parse_stage',
      parsed_documents: 3,
      failed: 1,
    });
  });

  it('runs the workflow extraction stage for one hospital system', async () => {
    vi.mocked(runTrackedWorkflowExtractionStage).mockResolvedValue({
      status: 'ok',
      stage_key: 'workflow_extraction_stage',
      workflow_rows: 6,
      partial_documents: 1,
    } as never);

    const response = await fetch(`${baseUrl}/internal/pipeline/system/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'TX',
        system_id: 'system-1',
      }),
    });

    expect(response.status).toBe(200);
    expect(runTrackedWorkflowExtractionStage).toHaveBeenCalledWith({
      state: 'TX',
      systemId: 'system-1',
      systemName: null,
      sourceType: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      status: 'ok',
      stage_key: 'workflow_extraction_stage',
      workflow_rows: 6,
      partial_documents: 1,
    });
  });

  it('lists pipeline stage runs for the selected hospital system', async () => {
    vi.mocked(listStageRuns).mockResolvedValue({
      hospital_system_id: 'system-1',
      stage_key: null,
      runs: [
        {
          id: 'run-1',
          stage_key: 'fetch_stage',
          status: 'ok',
        },
      ],
    } as never);

    const response = await fetch(`${baseUrl}/internal/pipeline/stage-runs?system_id=system-1&limit=40`);

    expect(response.status).toBe(200);
    expect(listStageRuns).toHaveBeenCalledWith({
      systemId: 'system-1',
      stageKey: null,
      limit: '40',
    });
    await expect(response.json()).resolves.toMatchObject({
      hospital_system_id: 'system-1',
      runs: [{ id: 'run-1', stage_key: 'fetch_stage', status: 'ok' }],
    });
  });

  it('returns stage run detail for the pipeline inspector', async () => {
    vi.mocked(getStageRunDetail).mockResolvedValue({
      id: 'run-1',
      stage_key: 'fetch_stage',
      status: 'ok',
      fetch_artifacts: [
        {
          id: 'artifact-1',
          final_url: 'https://example.org/records',
        },
      ],
    } as never);

    const response = await fetch(`${baseUrl}/internal/pipeline/stage-runs/run-1`);

    expect(response.status).toBe(200);
    expect(getStageRunDetail).toHaveBeenCalledWith('run-1');
    await expect(response.json()).resolves.toMatchObject({
      id: 'run-1',
      stage_key: 'fetch_stage',
      fetch_artifacts: [
        {
          id: 'artifact-1',
          final_url: 'https://example.org/records',
        },
      ],
    });
  });

  it('returns fetch artifact detail for pipeline inspection', async () => {
    vi.mocked(getFetchArtifactDetail).mockResolvedValue({
      id: 'artifact-1',
      final_url: 'https://example.org/roi.pdf',
      latest_triage_decision: { decision: 'accepted' },
    } as never);

    const response = await fetch(`${baseUrl}/internal/fetch-artifacts/artifact-1`);

    expect(response.status).toBe(200);
    expect(getFetchArtifactDetail).toHaveBeenCalledWith('artifact-1');
    await expect(response.json()).resolves.toMatchObject({
      id: 'artifact-1',
      final_url: 'https://example.org/roi.pdf',
      latest_triage_decision: { decision: 'accepted' },
    });
  });

  it('saves triage overrides', async () => {
    vi.mocked(saveTriageOverride).mockResolvedValue({
      triage_decision_id: 'triage-1',
      original_decision: 'skipped',
      override: { override_decision: 'accepted' },
    } as never);

    const response = await fetch(`${baseUrl}/internal/triage-decisions/triage-1/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        override_decision: 'accepted',
        notes: 'human rescue',
      }),
    });

    expect(response.status).toBe(200);
    expect(saveTriageOverride).toHaveBeenCalledWith('triage-1', {
      overrideDecision: 'accepted',
      notes: 'human rescue',
      createdBy: 'operator-console',
    });
  });

  it('accepts a triage decision into source documents', async () => {
    vi.mocked(acceptTriageDecision).mockResolvedValue({
      triage_decision_id: 'triage-1',
      source_document_id: 'doc-1',
    } as never);

    const response = await fetch(`${baseUrl}/internal/triage-decisions/triage-1/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: 'accept it',
      }),
    });

    expect(response.status).toBe(200);
    expect(acceptTriageDecision).toHaveBeenCalledWith('triage-1', {
      notes: 'accept it',
      createdBy: 'operator-console',
    });
  });

  it('reruns parse for one source document', async () => {
    vi.mocked(rerunSourceDocumentParse).mockResolvedValue({
      stage_key: 'parse_stage',
      stage_status: 'ok',
    } as never);

    const response = await fetch(`${baseUrl}/internal/source-documents/doc-1/reparse`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(rerunSourceDocumentParse).toHaveBeenCalledWith('doc-1');
  });

  it('reruns workflow extraction for one source document', async () => {
    vi.mocked(rerunSourceDocumentWorkflowExtraction).mockResolvedValue({
      stage_key: 'workflow_extraction_stage',
      stage_status: 'ok',
    } as never);

    const response = await fetch(`${baseUrl}/internal/source-documents/doc-1/reextract-workflow`, {
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(rerunSourceDocumentWorkflowExtraction).toHaveBeenCalledWith('doc-1');
  });
});
