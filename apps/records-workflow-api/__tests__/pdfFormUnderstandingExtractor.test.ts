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
