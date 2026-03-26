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
    signature_areas: [],
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
            payload: {
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
              visibility_rule: null,
              previous_question_id: null,
              next_question_id: null,
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

  it('publishes explicit question flow metadata for legacy follow-up questions', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'system-1',
            system_name: 'Baylor Scott & White',
            canonical_domain: 'bswhealth.com',
            state: 'TX',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [buildMedicalWorkflowRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'Authorization',
            url: 'https://hospital.example/authorization.pdf',
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
            source_url: 'https://hospital.example/authorization.pdf',
            title: 'Authorization',
            storage_path: '/tmp/storage/raw/tx/authorization.pdf',
            fetched_at: '2026-03-20T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            source_document_id: 'doc-1',
            payload: {
              supported: true,
              mode: 'overlay',
              template_id: 'bswh-template',
              confidence: 0.94,
              questions: [
                {
                  id: 'purpose-of-use',
                  label: 'Select the purpose of the use and/or disclosure',
                  kind: 'multi_select',
                  required: true,
                  help_text: null,
                  confidence: 0.95,
                  bindings: [],
                  options: [
                    {
                      id: 'continued-care',
                      label: 'Continued Care',
                      confidence: 0.99,
                      bindings: [],
                    },
                    {
                      id: 'other',
                      label: 'Other',
                      confidence: 0.99,
                      bindings: [
                        {
                          type: 'field_checkbox',
                          field_name: 'fill_4',
                          checked: true,
                        },
                      ],
                    },
                  ],
                },
                {
                  id: 'purpose-other-details',
                  label: 'If other, specify the purpose of the use or disclosure',
                  kind: 'short_text',
                  required: false,
                  help_text: null,
                  confidence: 0.96,
                  bindings: [
                    {
                      type: 'field_text',
                      field_name: 'fill_4',
                    },
                  ],
                  options: [],
                },
                {
                  id: 'preferred-delivery-methods',
                  label: 'Select preferred method(s) for delivery of records',
                  kind: 'multi_select',
                  required: false,
                  help_text:
                    'Purpose of the use and/or disclosure: Continued Care Legal Insurance Personal Use Other',
                  confidence: 0.92,
                  bindings: [],
                  options: [
                    {
                      id: 'mail',
                      label: 'Mail',
                      confidence: 0.99,
                      bindings: [],
                    },
                  ],
                },
              ],
            },
          },
        ],
      });

    const packet = await getSystemRequestPacket('system-1');
    const questions = packet?.forms[0]?.autofill.questions || [];

    expect(questions.map((question) => ({
      id: question.id,
      visibility_rule: question.visibility_rule,
      previous_question_id: question.previous_question_id,
      next_question_id: question.next_question_id,
    }))).toEqual([
      {
        id: 'purpose-of-use',
        visibility_rule: null,
        previous_question_id: null,
        next_question_id: 'purpose-other-details',
      },
      {
        id: 'purpose-other-details',
        visibility_rule: {
          parent_question_id: 'purpose-of-use',
          parent_option_ids: ['other'],
        },
        previous_question_id: 'purpose-of-use',
        next_question_id: 'preferred-delivery-methods',
      },
      {
        id: 'preferred-delivery-methods',
        visibility_rule: null,
        previous_question_id: 'purpose-other-details',
        next_question_id: null,
      },
    ]);
  });

  it('preserves explicit schema-authored flow metadata without overwriting it', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'system-1',
            system_name: 'Baylor Scott & White',
            canonical_domain: 'bswhealth.com',
            state: 'TX',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [buildMedicalWorkflowRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'Authorization',
            url: 'https://hospital.example/authorization.pdf',
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
            source_url: 'https://hospital.example/authorization.pdf',
            title: 'Authorization',
            storage_path: '/tmp/storage/raw/tx/authorization.pdf',
            fetched_at: '2026-03-20T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            source_document_id: 'doc-1',
            payload: {
              supported: true,
              mode: 'overlay',
              template_id: 'bswh-template',
              confidence: 0.94,
              questions: [
                {
                  id: 'release-to',
                  label: 'Select who will receive the released information',
                  kind: 'multi_select',
                  required: true,
                  help_text: null,
                  confidence: 0.95,
                  previousQuestionId: null,
                  nextQuestionId: 'release-to-other-details',
                  bindings: [],
                  options: [
                    {
                      id: 'patient-designee',
                      label: 'Patient/Designee',
                      confidence: 0.99,
                      bindings: [],
                    },
                    {
                      id: 'other',
                      label: 'Other',
                      confidence: 0.99,
                      bindings: [],
                    },
                  ],
                },
                {
                  id: 'release-to-other-details',
                  label: 'If Other selected, specify Individual/Organization Name',
                  kind: 'short_text',
                  required: false,
                  help_text: null,
                  confidence: 0.96,
                  visibilityRule: {
                    parentQuestionId: 'release-to',
                    parentOptionIds: ['other'],
                  },
                  previousQuestionId: 'release-to',
                  nextQuestionId: 'delivery-methods',
                  bindings: [
                    {
                      type: 'field_text',
                      field_name: 'IndividualOrganization Name',
                    },
                  ],
                  options: [],
                },
                {
                  id: 'delivery-methods',
                  label: 'Select preferred method(s) for delivery of records',
                  kind: 'multi_select',
                  required: false,
                  help_text: null,
                  confidence: 0.92,
                  previousQuestionId: 'release-to',
                  nextQuestionId: null,
                  bindings: [],
                  options: [
                    {
                      id: 'mail',
                      label: 'Mail',
                      confidence: 0.99,
                      bindings: [],
                    },
                  ],
                },
              ],
            },
          },
        ],
      });

    const packet = await getSystemRequestPacket('system-1');
    const questions = packet?.forms[0]?.autofill.questions || [];

    expect(questions.map((question) => ({
      id: question.id,
      visibility_rule: question.visibility_rule,
      previous_question_id: question.previous_question_id,
      next_question_id: question.next_question_id,
    }))).toEqual([
      {
        id: 'release-to',
        visibility_rule: null,
        previous_question_id: null,
        next_question_id: 'release-to-other-details',
      },
      {
        id: 'release-to-other-details',
        visibility_rule: {
          parent_question_id: 'release-to',
          parent_option_ids: ['other'],
        },
        previous_question_id: 'release-to',
        next_question_id: 'delivery-methods',
      },
      {
        id: 'delivery-methods',
        visibility_rule: null,
        previous_question_id: 'release-to',
        next_question_id: null,
      },
    ]);
  });

  it('does not infer a visibility rule when the schema explicitly sets it to null', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'system-1',
            system_name: 'Baylor Scott & White',
            canonical_domain: 'bswhealth.com',
            state: 'TX',
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [buildMedicalWorkflowRow()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            name: 'Authorization',
            url: 'https://hospital.example/authorization.pdf',
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
            source_url: 'https://hospital.example/authorization.pdf',
            title: 'Authorization',
            storage_path: '/tmp/storage/raw/tx/authorization.pdf',
            fetched_at: '2026-03-20T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            source_document_id: 'doc-1',
            payload: {
              supported: true,
              mode: 'overlay',
              template_id: 'bswh-template',
              confidence: 0.94,
              questions: [
                {
                  id: 'release-to',
                  label: 'Select who will receive the released information',
                  kind: 'multi_select',
                  required: true,
                  help_text: null,
                  confidence: 0.95,
                  bindings: [],
                  options: [
                    {
                      id: 'patient-designee',
                      label: 'Patient/Designee',
                      confidence: 0.99,
                      bindings: [],
                    },
                    {
                      id: 'other',
                      label: 'Other',
                      confidence: 0.99,
                      bindings: [],
                    },
                  ],
                },
                {
                  id: 'mental-health-initials',
                  label: 'If applicable, enter patient initials for Mental Health information',
                  kind: 'short_text',
                  required: false,
                  help_text: null,
                  confidence: 0.96,
                  visibility_rule: null,
                  bindings: [
                    {
                      type: 'field_text',
                      field_name: 'Mental Health',
                    },
                  ],
                  options: [],
                },
              ],
            },
          },
        ],
      });

    const packet = await getSystemRequestPacket('system-1');
    const questions = packet?.forms[0]?.autofill.questions || [];

    expect(questions.map((question) => ({
      id: question.id,
      visibility_rule: question.visibility_rule,
    }))).toEqual([
      {
        id: 'release-to',
        visibility_rule: null,
      },
      {
        id: 'mental-health-initials',
        visibility_rule: null,
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
