import http from 'node:http';
import type { AddressInfo } from 'node:net';
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
import { listHospitalSystems } from '../src/repositories/workflowRepository.js';

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

  it('returns a JSON tombstone for legacy /v1 routes', async () => {
    const response = await fetch(`${baseUrl}/v1/hospital-systems`);

    expect(response.status).toBe(410);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error: 'Records workflow routes moved to /api/records-workflow/*.',
    });
  });
});
