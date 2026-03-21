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
  publishQuestionReview: vi.fn(),
  reextractQuestionReview: vi.fn(),
  saveQuestionReviewDraft: vi.fn(),
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

import { createApp } from '../src/server.js';
import { runCrawl } from '../src/services/crawlService.js';
import { importManualPdf } from '../src/services/manualImportService.js';
import {
  getSourceDocumentQuestionReview,
  publishQuestionReview,
} from '../src/services/questionReviewService.js';
import { reseedFromFile } from '../src/services/seedService.js';
import { saveStateSeedFile } from '../src/services/seedEditorService.js';
import {
  getNationalStateOverview,
  getStateSummary,
  listStateSystems,
} from '../src/services/stateSummaryService.js';

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
    vi.mocked(publishQuestionReview).mockResolvedValue({
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
    expect(publishQuestionReview).toHaveBeenCalledWith('doc-1', {
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
});
