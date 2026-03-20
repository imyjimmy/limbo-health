import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/repositories/workflowRepository.js', () => ({
  getEffectiveWorkflowForFacility: vi.fn(),
  getSourceDocumentById: vi.fn(),
  getSystemRequestPacket: vi.fn(),
  getSystemWorkflows: vi.fn(),
  listHospitalSystems: vi.fn(),
  searchFacilities: vi.fn(),
  getExtractionRunById: vi.fn(),
  upsertHospitalSystem: vi.fn(),
  upsertFacility: vi.fn(),
  upsertSeedUrl: vi.fn(),
  listActiveSeeds: vi.fn(),
  saveExtractionResult: vi.fn(),
}));

import { createApp } from '../src/server.js';
import {
  getSourceDocumentById,
  listHospitalSystems,
} from '../src/repositories/workflowRepository.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..');

describe('records-workflow public routes', () => {
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

  it('serves hospital systems from /api/records-workflow', async () => {
    vi.mocked(listHospitalSystems).mockResolvedValue([
      {
        id: 'system-1',
        system_name: 'Test Health',
        canonical_domain: 'test.example',
        state: 'TX',
      },
    ]);

    const response = await fetch(`${baseUrl}/api/records-workflow/hospital-systems`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      results: [
        {
          id: 'system-1',
          system_name: 'Test Health',
          canonical_domain: 'test.example',
          state: 'TX',
        },
      ],
    });
  });

  it.each([
    ['Multicare', 'MultiCare', 'multicare.org', 'WA'],
    ['Mass General Brigham', 'Mass General Brigham', 'massgeneralbrigham.org', 'MA'],
    ['Baylor Scott & White', 'Baylor Scott & White', 'bswhealth.com', 'TX'],
    ["St. David's", "St. David's HealthCare", 'stdavids.com', 'TX'],
  ])(
    'passes q through to hospital-system search for %s',
    async (searchTerm, systemName, canonicalDomain, state) => {
      vi.mocked(listHospitalSystems).mockResolvedValue([
        {
          id: `system-${searchTerm}`,
          system_name: systemName,
          canonical_domain: canonicalDomain,
          state,
        },
      ]);

      const response = await fetch(
        `${baseUrl}/api/records-workflow/hospital-systems?q=${encodeURIComponent(searchTerm)}`,
      );

      expect(response.status).toBe(200);
      expect(listHospitalSystems).toHaveBeenCalledWith(searchTerm);
      await expect(response.json()).resolves.toEqual({
        results: [
          {
            id: `system-${searchTerm}`,
            system_name: systemName,
            canonical_domain: canonicalDomain,
            state,
          },
        ],
      });
    },
  );

  it('returns a JSON tombstone for legacy /v1 routes', async () => {
    const response = await fetch(`${baseUrl}/v1/hospital-systems`);

    expect(response.status).toBe(410);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'Records workflow routes moved to /api/records-workflow/*.',
    });
  });

  it('serves source document content from a relative raw-storage path', async () => {
    const relativeStoragePath = 'test-public-routes-source.pdf';
    const absoluteStoragePath = path.join(serviceRoot, 'storage', 'raw', relativeStoragePath);

    await fs.writeFile(absoluteStoragePath, '%PDF-1.4 mocked source document');
    vi.mocked(getSourceDocumentById).mockResolvedValue({
      id: 'doc-1',
      source_url: 'https://multicare.org/forms/request.pdf',
      source_type: 'pdf',
      storage_path: relativeStoragePath,
      fetched_at: '2026-03-20T00:00:00.000Z',
    });

    try {
      const response = await fetch(`${baseUrl}/api/records-workflow/source-documents/doc-1/content`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/pdf');
      await expect(response.text()).resolves.toBe('%PDF-1.4 mocked source document');
    } finally {
      await fs.rm(absoluteStoragePath, { force: true });
    }
  });
});
