import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config.js', () => ({
  config: {
    openai: {
      apiKey: 'test-key',
      baseUrl: 'https://api.openai.com/v1',
      pdfFormUnderstandingModel: 'gpt-test',
      timeoutMs: 30000,
    },
  },
}));

vi.mock('../src/providers/openaiPdfFormUnderstandingClient.js', () => ({
  extractPdfFormUnderstandingWithOpenAI: vi.fn(),
  isOpenAiApiError: (error) => error?.name === 'OpenAiApiError',
}));

import { extractPdfFormUnderstanding } from '../src/extractors/pdfFormUnderstandingExtractor.js';
import { extractPdfFormUnderstandingWithOpenAI } from '../src/providers/openaiPdfFormUnderstandingClient.js';

describe('pdfFormUnderstandingExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes supported questions from the OpenAI response', async () => {
    vi.mocked(extractPdfFormUnderstandingWithOpenAI).mockResolvedValue({
      responseId: 'resp_123',
      usage: { total_tokens: 321 },
      output: {
        mode: 'overlay',
        template_id: 'multicare-release-template',
        confidence: 0.92,
        questions: [
          {
            id: 'record_types',
            label: 'What kind of records do you want?',
            kind: 'multi_select',
            required: true,
            help_text: 'Select all that apply.',
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
              {
                id: 'radiology',
                label: 'Radiology',
                confidence: 0.88,
                bindings: [
                  {
                    type: 'overlay_mark',
                    page_index: 0,
                    x: 118,
                    y: 400,
                    mark: 'x',
                    size: 12,
                  },
                ],
              },
              {
                id: 'unsupported',
                label: 'Unsupported low confidence option',
                confidence: 0.5,
                bindings: [
                  {
                    type: 'overlay_mark',
                    page_index: 0,
                    x: 118,
                    y: 380,
                    mark: 'x',
                    size: 12,
                  },
                ],
              },
            ],
          },
          {
            id: 'nickname',
            label: 'Nickname',
            kind: 'unsupported_kind',
            required: false,
            help_text: null,
            confidence: 0.99,
            bindings: [],
            options: [],
          },
        ],
      },
    });

    const result = await extractPdfFormUnderstanding({
      parsedPdf: {
        title: 'Authorization to Release Health Care Information',
        text: 'What kind of records do you want? X-rays Radiology',
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: [{ text: 'X-rays', x: 100, y: 420, width: 30, height: 12 }],
            widgets: [],
            lineCandidates: [],
            checkboxCandidates: [{ x: 118, y: 420, width: 12, height: 12 }],
          },
        ],
      },
      hospitalSystemName: 'MultiCare',
      facilityName: null,
      formName: 'Authorization to Release Health Care Information',
      sourceUrl: 'https://multicare.org/forms/release.pdf',
    });

    expect(result.status).toBe('success');
    expect(result.structuredOutput.metadata).toMatchObject({
      prompt_profile: 'compact',
      prompt_profile_requested: 'compact',
      prompt_over_budget: false,
      response_id: 'resp_123',
      usage: { total_tokens: 321 },
    });
    expect(result.structuredOutput.metadata.estimated_input_tokens).toBeGreaterThan(0);
    expect(result.structuredOutput.form_understanding).toEqual({
      supported: true,
      mode: 'overlay',
      template_id: 'multicare-release-template',
      confidence: 0.92,
      questions: [
        {
          id: 'record-types',
          label: 'What kind of records do you want?',
          kind: 'multi_select',
          required: true,
          help_text: 'Select all that apply.',
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
            {
              id: 'radiology',
              label: 'Radiology',
              confidence: 0.88,
              bindings: [
                {
                  type: 'overlay_mark',
                  page_index: 0,
                  x: 118,
                  y: 400,
                  mark: 'x',
                  size: 12,
                },
              ],
            },
          ],
        },
      ],
    });
    expect(vi.mocked(extractPdfFormUnderstandingWithOpenAI)).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.not.stringContaining('"textExcerpt":'),
        schema: expect.objectContaining({
          required: ['mode', 'template_id', 'confidence', 'questions'],
        }),
      }),
    );
  });

  it('returns an unsupported payload when the parsed PDF has no page model', async () => {
    const result = await extractPdfFormUnderstanding({
      parsedPdf: {
        title: 'Empty',
        text: '',
        headerText: '',
        pages: [],
      },
      hospitalSystemName: 'Example Health',
      facilityName: null,
      formName: 'Example Form',
      sourceUrl: 'https://example.org/form.pdf',
    });

    expect(extractPdfFormUnderstandingWithOpenAI).not.toHaveBeenCalled();
    expect(result.status).toBe('partial');
    expect(result.structuredOutput).toEqual({
      form_understanding: {
        supported: false,
        mode: null,
        template_id: null,
        confidence: null,
        questions: [],
      },
      metadata: {
        reason: 'missing_pdf_pages',
      },
    });
  });

  it('splits grouped BSWH text fields and recovers missing widget-backed follow-ups', async () => {
    vi.mocked(extractPdfFormUnderstandingWithOpenAI).mockResolvedValue({
      responseId: 'resp_bswh',
      usage: { total_tokens: 654 },
      output: {
        mode: 'acroform',
        template_id: null,
        confidence: 0.97,
        questions: [
          {
            id: 'treatment_dates',
            label: 'Please specify treatment date range (if applicable)',
            kind: 'short_text',
            required: false,
            help_text: 'Enter from and to dates for records to be released.',
            confidence: 0.95,
            bindings: [
              {
                type: 'field_text',
                field_name: 'treatment date from',
              },
              {
                type: 'field_text',
                field_name: 'treatment date to',
              },
            ],
            options: [],
          },
          {
            id: 'special_categories',
            label: 'If applicable, specify below if releasing Genetics or HIV/AIDS info',
            kind: 'short_text',
            required: false,
            help_text: 'Fill in only if releasing these sensitive categories.',
            confidence: 0.92,
            bindings: [
              {
                type: 'field_text',
                field_name: 'Genetics',
              },
              {
                type: 'field_text',
                field_name: 'HIV',
              },
            ],
            options: [],
          },
        ],
      },
    });

    const result = await extractPdfFormUnderstanding({
      parsedPdf: {
        title: 'Authorization for Release of Medical Information',
        text: '',
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: [],
            widgets: [
              { fieldName: 'Clinic visits', fieldType: 'CheckBox', x: 298, y: 352, width: 10, height: 10 },
              { fieldName: 'Hospital visits', fieldType: 'CheckBox', x: 360, y: 352, width: 10, height: 10 },
              { fieldName: 'specify provider', fieldType: 'CheckBox', x: 433, y: 353, width: 10, height: 10 },
              { fieldName: 'Specify provider fill', fieldType: 'Text', x: 443, y: 352, width: 151, height: 11 },
              { fieldName: 'Alcohol/Drug', fieldType: 'Text', x: 224, y: 316, width: 37, height: 16 },
              { fieldName: 'Genetics', fieldType: 'Text', x: 325, y: 316, width: 37, height: 16 },
              { fieldName: 'HIV', fieldType: 'Text', x: 409, y: 316, width: 37, height: 16 },
              { fieldName: 'Mental Health', fieldType: 'Text', x: 496, y: 316, width: 37, height: 16 },
              { fieldName: 'summaryabstractonly', fieldType: 'CheckBox', x: 16, y: 260, width: 10, height: 10 },
              { fieldName: 'clinicnotes', fieldType: 'CheckBox', x: 16, y: 242, width: 10, height: 10 },
              { fieldName: 'consultations', fieldType: 'CheckBox', x: 194, y: 242, width: 10, height: 10 },
              { fieldName: 'lab', fieldType: 'CheckBox', x: 358, y: 242, width: 10, height: 10 },
              { fieldName: 'radioloy images', fieldType: 'CheckBox', x: 523, y: 242, width: 10, height: 10 },
              { fieldName: 'ED', fieldType: 'CheckBox', x: 16, y: 224, width: 10, height: 10 },
              { fieldName: 'discharge summary', fieldType: 'CheckBox', x: 194, y: 224, width: 10, height: 10 },
              { fieldName: 'medication', fieldType: 'CheckBox', x: 358, y: 224, width: 10, height: 10 },
              { fieldName: 'radiology reports', fieldType: 'CheckBox', x: 523, y: 224, width: 10, height: 10 },
              { fieldName: 'billing record', fieldType: 'CheckBox', x: 16, y: 206, width: 10, height: 10 },
              { fieldName: 'history', fieldType: 'CheckBox', x: 194, y: 206, width: 10, height: 10 },
              { fieldName: 'operative report', fieldType: 'CheckBox', x: 358, y: 206, width: 10, height: 10 },
              { fieldName: 'complete chart', fieldType: 'CheckBox', x: 16, y: 188, width: 10, height: 10 },
              { fieldName: 'immunization', fieldType: 'CheckBox', x: 194, y: 188, width: 10, height: 10 },
              { fieldName: 'progress notes', fieldType: 'CheckBox', x: 358, y: 188, width: 10, height: 10 },
              { fieldName: 'Release info - other', fieldType: 'CheckBox', x: 16, y: 170, width: 10, height: 10 },
              { fieldName: 'release other fill', fieldType: 'Text', x: 65, y: 170, width: 420, height: 11 },
            ],
            lineCandidates: [],
            checkboxCandidates: [],
          },
        ],
      },
      hospitalSystemName: 'Baylor Scott & White Health',
      facilityName: null,
      formName: 'Authorization for Release of Medical Information',
      sourceUrl: 'https://example.org/bswh.pdf',
      promptProfile: 'expanded',
      maxInputTokens: 20000,
    });

    expect(result.status).toBe('success');

    const questions = result.structuredOutput.form_understanding.questions;
    const labels = questions.map((question) => question.label);

    expect(labels).toContain('If selected, specify provider or location');
    expect(labels).toContain('Treatment date from');
    expect(labels).toContain('Treatment date to');
    expect(labels).toContain('If applicable, enter patient initials for Alcohol/Drug information');
    expect(labels).toContain('If applicable, enter patient initials for Genetics information');
    expect(labels).toContain('If applicable, enter patient initials for HIV/AIDS information');
    expect(labels).toContain('If applicable, enter patient initials for Mental Health information');
    expect(labels).toContain('If other, specify what information to release');
    expect(labels).not.toContain('Please specify treatment date range (if applicable)');
    expect(labels).not.toContain(
      'If applicable, specify below if releasing Genetics or HIV/AIDS info',
    );

    const facilitiesQuestion = questions.find((question) =>
      question.options?.some((option) =>
        option.bindings?.some((binding) => binding.field_name === 'Clinic visits'),
      ),
    );
    expect(
      facilitiesQuestion?.options?.map((option) => option.bindings?.[0]?.field_name),
    ).toEqual(
      expect.arrayContaining(['Clinic visits', 'Hospital visits', 'specify provider']),
    );

    const detailedRecordsQuestion = questions.find((question) =>
      question.options?.some(
        (option) =>
          option.bindings?.some((binding) => binding.field_name === 'summaryabstractonly'),
      ),
    );
    expect(
      detailedRecordsQuestion?.options?.map((option) => option.bindings?.[0]?.field_name),
    ).toEqual(
      expect.arrayContaining([
        'summaryabstractonly',
        'clinicnotes',
        'consultations',
        'lab',
        'radioloy images',
        'ED',
        'discharge summary',
        'medication',
        'radiology reports',
        'billing record',
        'history',
        'operative report',
        'complete chart',
        'immunization',
        'progress notes',
        'Release info - other',
      ]),
    );
  });

  it('returns a partial payload instead of calling OpenAI when the prompt stays over budget', async () => {
    const result = await extractPdfFormUnderstanding({
      parsedPdf: {
        title: 'Huge Form',
        text: 'A'.repeat(50_000),
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: Array.from({ length: 300 }, (_, index) => ({
              text: `word-${index}`,
              x: 10 + index,
              y: 100,
              width: 20,
              height: 10,
            })),
            widgets: Array.from({ length: 60 }, (_, index) => ({
              fieldName: `Field${index}`,
              fieldType: 'text',
              x: 20 + index,
              y: 200,
              width: 120,
              height: 20,
            })),
            lineCandidates: Array.from({ length: 80 }, (_, index) => ({
              x: 20 + index,
              y: 240,
              width: 100,
              height: 2,
            })),
            checkboxCandidates: Array.from({ length: 80 }, (_, index) => ({
              x: 20 + index,
              y: 260,
              width: 12,
              height: 12,
            })),
          },
          {
            pageIndex: 1,
            width: 612,
            height: 792,
            words: Array.from({ length: 300 }, (_, index) => ({
              text: `word-b-${index}`,
              x: 10 + index,
              y: 100,
              width: 20,
              height: 10,
            })),
            widgets: [],
            lineCandidates: Array.from({ length: 80 }, (_, index) => ({
              x: 20 + index,
              y: 240,
              width: 100,
              height: 2,
            })),
            checkboxCandidates: Array.from({ length: 80 }, (_, index) => ({
              x: 20 + index,
              y: 260,
              width: 12,
              height: 12,
            })),
          },
        ],
      },
      hospitalSystemName: 'Example Health',
      facilityName: null,
      formName: 'Huge Form',
      sourceUrl: 'https://example.org/huge.pdf',
      promptProfile: 'expanded',
      maxInputTokens: 5,
    });

    expect(extractPdfFormUnderstandingWithOpenAI).not.toHaveBeenCalled();
    expect(result.status).toBe('partial');
    expect(result.structuredOutput.metadata).toMatchObject({
      reason: 'prompt_budget_exceeded',
      prompt_profile_requested: 'expanded',
      prompt_profile: 'minimal',
      prompt_over_budget: true,
    });
  });

  it('classifies schema-invalid OpenAI errors as non-retryable failures', async () => {
    vi.mocked(extractPdfFormUnderstandingWithOpenAI).mockRejectedValue({
      name: 'OpenAiApiError',
      status: 400,
      message:
        "OpenAI request failed with status 400: Invalid schema for response_format 'pdf_form_understanding'.",
    });

    const result = await extractPdfFormUnderstanding({
      parsedPdf: {
        title: 'Authorization',
        text: 'What kind of records do you want?',
        headerText: 'Authorization',
        pages: [
          {
            pageIndex: 0,
            width: 612,
            height: 792,
            words: [{ text: 'records', x: 100, y: 420, width: 30, height: 12 }],
            widgets: [],
            lineCandidates: [],
            checkboxCandidates: [{ x: 118, y: 420, width: 12, height: 12 }],
          },
        ],
      },
      hospitalSystemName: 'MultiCare',
      facilityName: null,
      formName: 'Authorization',
      sourceUrl: 'https://example.org/form.pdf',
    });

    expect(result.status).toBe('failed');
    expect(result.structuredOutput.metadata).toMatchObject({
      reason: 'openai_request_failed',
      error_category: 'schema_invalid',
      retryable: false,
      openai_status: 400,
    });
  });
});
