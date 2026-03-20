import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchHospitalSystems,
  fetchRecordsRequestPacket,
} from '../core/recordsWorkflow/api';

describe('records workflow API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['MultiCare', 'https://limbo.health/api/records-workflow/hospital-systems?q=MultiCare'],
    ['multi care', 'https://limbo.health/api/records-workflow/hospital-systems?q=multi+care'],
    ['multicare', 'https://limbo.health/api/records-workflow/hospital-systems?q=multicare'],
    ['  multi   care  ', 'https://limbo.health/api/records-workflow/hospital-systems?q=multi+care'],
    [
      'Mass General Brigham',
      'https://limbo.health/api/records-workflow/hospital-systems?q=Mass+General+Brigham',
    ],
    [
      'Baylor Scott & White',
      'https://limbo.health/api/records-workflow/hospital-systems?q=Baylor+Scott+%26+White',
    ],
    [
      "St. David's",
      'https://limbo.health/api/records-workflow/hospital-systems?q=St.+David%27s',
    ],
  ])('requests hospital systems from /api/records-workflow for %s', async (searchTerm, expectedUrl) => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchHospitalSystems(searchTerm)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(expectedUrl);
  });

  it('maps cached document URLs onto the API host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          hospital_system: {
            id: 'system-1',
            name: 'Test Health',
            domain: 'test.example',
            state: 'TX',
          },
          portal: {
            name: null,
            url: null,
            scope: 'none',
            supports_formal_copy_request_in_portal: false,
          },
          medical_workflow: null,
          recommended_paths: [],
          special_cases: [],
          contacts: [],
          forms: [
            {
              name: 'Authorization',
              url: 'https://hospital.example/form.pdf',
              format: 'pdf',
              cached_source_document_id: 'doc-1',
              cached_content_url: '/api/records-workflow/source-documents/doc-1/content',
            },
          ],
          instructions: [],
          requires_photo_id: false,
          sources: [],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    vi.stubGlobal('fetch', fetchMock);

    const packet = await fetchRecordsRequestPacket('system-1');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://limbo.health/api/records-workflow/hospital-systems/system-1/records-request-packet',
    );
    expect(packet.forms[0]?.cachedContentUrl).toBe(
      'https://limbo.health/api/records-workflow/source-documents/doc-1/content',
    );
  });

  it('throws a clear error when the endpoint returns HTML instead of JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!doctype html><html></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    let error: unknown;
    try {
      await fetchHospitalSystems();
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('text/html');
    expect((error as Error).message).toContain('/api/records-workflow');
  });
});
