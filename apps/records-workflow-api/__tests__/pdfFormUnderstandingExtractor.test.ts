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
      response_id: 'resp_123',
      usage: { total_tokens: 321 },
    });
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
});
