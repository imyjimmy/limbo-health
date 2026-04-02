import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  insertPipelineStageRun,
  completePipelineStageRun,
  listLatestParsedArtifactsForSystem,
  insertExtractionRun,
  upsertPortalProfile,
  upsertWorkflowBundle,
  ensureWorkflowArtifactDir,
  loadParsedArtifactPayload,
  isOfficialDomain,
  extractWorkflowBundle,
} = vi.hoisted(() => ({
  insertPipelineStageRun: vi.fn(),
  completePipelineStageRun: vi.fn(),
  listLatestParsedArtifactsForSystem: vi.fn(),
  insertExtractionRun: vi.fn(),
  upsertPortalProfile: vi.fn(),
  upsertWorkflowBundle: vi.fn(),
  ensureWorkflowArtifactDir: vi.fn(),
  loadParsedArtifactPayload: vi.fn(),
  isOfficialDomain: vi.fn(),
  extractWorkflowBundle: vi.fn(),
}));

vi.mock('../src/repositories/pipelineStageRepository.js', () => ({
  insertPipelineStageRun,
  completePipelineStageRun,
  listLatestParsedArtifactsForSystem,
}));

vi.mock('../src/repositories/workflowRepository.js', () => ({
  insertExtractionRun,
  upsertPortalProfile,
  upsertWorkflowBundle,
}));

vi.mock('../src/utils/pipelineArtifactStorage.js', () => ({
  ensureWorkflowArtifactDir,
}));

vi.mock('../src/services/pipeline/parseStageService.js', () => ({
  loadParsedArtifactPayload,
}));

vi.mock('../src/crawler/linkExpander.js', () => ({
  isOfficialDomain,
}));

vi.mock('../src/extractors/workflowExtractor.js', () => ({
  extractWorkflowBundle,
}));

import { runWorkflowExtractionStage } from '../src/services/pipeline/workflowExtractionStageService.js';

describe('workflowExtractionStageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps PDF workflows keyed to the PDF source URL instead of the target page URL', async () => {
    const workflowArtifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-stage-'));

    listLatestParsedArtifactsForSystem.mockResolvedValue([
      {
        id: 'parsed-1',
        source_document_id: 'source-pdf-1',
        hospital_system_id: 'system-1',
        facility_id: null,
        source_url: 'https://hospital.example/forms/request-authorization.pdf',
        source_page_url: 'https://hospital.example/medical-records',
        source_type: 'pdf',
        title: 'Authorization to Release Information',
        content_hash: 'hash-1',
        fetched_at: '2026-04-01T00:00:00.000Z',
        parse_status: 'success',
        canonical_domain: 'hospital.example',
        system_state: 'TX',
        system_name: 'Example Health',
        storage_path: '/tmp/parsed-1.json',
      },
    ]);
    insertPipelineStageRun.mockResolvedValue({ id: 'stage-1' });
    completePipelineStageRun.mockResolvedValue(undefined);
    loadParsedArtifactPayload.mockResolvedValue({
      parsed_document: {
        sourceType: 'pdf',
        title: 'Authorization to Release Information',
        text: 'Email delivery is available.',
        links: [],
        contacts: [],
        paragraphs: [],
      },
    });
    extractWorkflowBundle.mockReturnValue({
      portal: null,
      workflows: [
        {
          workflowType: 'medical_records',
          requestScope: 'complete_chart',
          formalRequestRequired: true,
          onlineRequestAvailable: false,
          portalRequestAvailable: false,
          emailAvailable: true,
          faxAvailable: false,
          mailAvailable: false,
          inPersonAvailable: false,
          phoneAvailable: false,
          turnaroundNotes: null,
          feeNotes: null,
          specialInstructions: null,
          confidence: 'high',
          contacts: [],
          forms: [],
          instructions: [],
        },
      ],
      evidenceSnippets: [],
    });
    insertExtractionRun.mockResolvedValue('extraction-run-1');
    upsertPortalProfile.mockResolvedValue(undefined);
    upsertWorkflowBundle.mockResolvedValue(undefined);
    ensureWorkflowArtifactDir.mockResolvedValue(workflowArtifactDir);
    isOfficialDomain.mockReturnValue(true);

    await runWorkflowExtractionStage({ systemId: 'system-1' });

    expect(upsertWorkflowBundle).toHaveBeenCalledTimes(1);
    expect(upsertWorkflowBundle.mock.calls[0][0]).toMatchObject({
      officialPageUrl: 'https://hospital.example/forms/request-authorization.pdf',
    });
  });
});
