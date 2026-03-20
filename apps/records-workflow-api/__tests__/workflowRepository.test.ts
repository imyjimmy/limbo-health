import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { getSystemRequestPacket } from '../src/repositories/workflowRepository.js';
import { query } from '../src/db.js';

function buildMedicalWorkflowRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'workflow-1',
    hospital_system_id: 'system-1',
    facility_id: null,
    workflow_type: 'medical_records',
    official_page_url: 'https://hospital.example/medical-records',
    request_scope: 'complete_chart',
    formal_request_required: true,
    online_request_available: false,
    portal_request_available: false,
    email_available: true,
    fax_available: true,
    mail_available: true,
    in_person_available: false,
    phone_available: false,
    last_verified_at: '2026-03-20T00:00:00.000Z',
    ...overrides,
  };
}

function buildUnsupportedAutofill() {
  return {
    supported: false,
    mode: null,
    template_id: null,
    confidence: null,
    questions: [],
  };
}

describe('workflowRepository request packet PDF hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hydrates a workflow form from a cached PDF when the titles match but the URLs do not', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'system-1',
            system_name: 'MultiCare',
            canonical_domain: 'multicare.org',
            state: 'WA',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [buildMedicalWorkflowRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'Authorization to Release Health Care Information',
            url: 'https://www.multicare.org/patient-resources/release-of-information/',
            format: 'pdf',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            facility_id: null,
            source_url: 'https://cdn.multicare.org/forms/multicare-roi.pdf',
            title: 'Authorization to Release Health Care Information',
            storage_path: '/tmp/storage/raw/wa/multicare-authorization-to-release-health-care-information-EN.pdf',
            fetched_at: '2026-03-20T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            source_document_id: 'doc-1',
            status: 'success',
            structured_output: {
              form_understanding: {
                supported: true,
                mode: 'overlay',
                template_id: 'multicare-release-template',
                confidence: 0.91,
                questions: [
                  {
                    id: 'record-types',
                    label: 'What kind of records do you want?',
                    kind: 'multi_select',
                    required: true,
                    help_text: null,
                    confidence: 0.9,
                    bindings: [],
                    options: [
                      {
                        id: 'xrays',
                        label: 'X-rays',
                        confidence: 0.94,
                        bindings: [
                          {
                            type: 'overlay_mark',
                            page_index: 0,
                            x: 118,
                            y: 420,
                            mark: 'x',
                            size: 12,
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      });

    const packet = await getSystemRequestPacket('system-1');

    expect(packet?.forms).toEqual([
      {
        name: 'Authorization to Release Health Care Information',
        url: 'https://www.multicare.org/patient-resources/release-of-information/',
        format: 'pdf',
        cached_source_document_id: 'doc-1',
        cached_content_url: '/api/records-workflow/source-documents/doc-1/content',
        autofill: {
          supported: true,
          mode: 'overlay',
          template_id: 'multicare-release-template',
          confidence: 0.91,
          questions: [
            {
              id: 'record-types',
              label: 'What kind of records do you want?',
              kind: 'multi_select',
              required: true,
              help_text: null,
              confidence: 0.9,
              bindings: [],
              options: [
                {
                  id: 'xrays',
                  label: 'X-rays',
                  confidence: 0.94,
                  bindings: [
                    {
                      type: 'overlay_mark',
                      page_index: 0,
                      x: 118,
                      y: 420,
                      mark: 'x',
                      size: 12,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ]);
  });

  it('adds cached PDFs to the packet even when no workflow forms were extracted', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'system-1',
            system_name: 'MultiCare',
            canonical_domain: 'multicare.org',
            state: 'WA',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [buildMedicalWorkflowRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'doc-1',
            facility_id: null,
            source_url: 'https://cdn.multicare.org/forms/multicare-roi-en.pdf',
            title: 'Authorization to Release Health Care Information',
            storage_path: '/tmp/storage/raw/wa/multicare-authorization-to-release-health-care-information-EN.pdf',
            fetched_at: '2026-03-20T00:00:00.000Z',
          },
          {
            id: 'doc-2',
            facility_id: null,
            source_url: 'https://cdn.multicare.org/forms/multicare-roi-sp.pdf',
            title: 'Authorization to Release Health Care Information (Spanish)',
            storage_path: '/tmp/storage/raw/wa/multicare-authorization-to-release-health-care-information-SP.pdf',
            fetched_at: '2026-03-19T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const packet = await getSystemRequestPacket('system-1');

    expect(packet?.forms).toEqual([
      {
        name: 'Authorization to Release Health Care Information',
        url: 'https://cdn.multicare.org/forms/multicare-roi-en.pdf',
        format: 'pdf',
        cached_source_document_id: 'doc-1',
        cached_content_url: '/api/records-workflow/source-documents/doc-1/content',
        autofill: buildUnsupportedAutofill(),
      },
      {
        name: 'Authorization to Release Health Care Information (Spanish)',
        url: 'https://cdn.multicare.org/forms/multicare-roi-sp.pdf',
        format: 'pdf',
        cached_source_document_id: 'doc-2',
        cached_content_url: '/api/records-workflow/source-documents/doc-2/content',
        autofill: buildUnsupportedAutofill(),
      },
    ]);
  });
});
