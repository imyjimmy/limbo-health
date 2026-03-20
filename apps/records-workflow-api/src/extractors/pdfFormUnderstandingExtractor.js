import { config } from '../config.js';
import { extractPdfFormUnderstandingWithOpenAI } from '../providers/openaiPdfFormUnderstandingClient.js';
import {
  buildUnsupportedAutofillPayload,
  MIN_AUTOFILL_CONFIDENCE,
  normalizePdfFormUnderstanding,
  PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
  PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
} from '../utils/pdfFormUnderstanding.js';

const PDF_FORM_UNDERSTANDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['acroform', 'overlay'] },
    template_id: { type: 'string' },
    confidence: { type: 'number' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          kind: { type: 'string', enum: ['single_select', 'multi_select', 'short_text'] },
          required: { type: 'boolean' },
          help_text: { type: 'string' },
          confidence: { type: 'number' },
          bindings: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: {
                  type: 'string',
                  enum: [
                    'field_text',
                    'field_checkbox',
                    'field_radio',
                    'overlay_text',
                    'overlay_mark',
                  ],
                },
                field_name: { type: 'string' },
                checked: { type: 'boolean' },
                value: { type: 'string' },
                page_index: { type: 'integer' },
                x: { type: 'number' },
                y: { type: 'number' },
                max_width: { type: 'number' },
                font_size: { type: 'number' },
                mark: { type: 'string', enum: ['x', 'check'] },
                size: { type: 'number' },
              },
              required: ['type'],
            },
          },
          options: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                confidence: { type: 'number' },
                bindings: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      type: {
                        type: 'string',
                        enum: [
                          'field_text',
                          'field_checkbox',
                          'field_radio',
                          'overlay_text',
                          'overlay_mark',
                        ],
                      },
                      field_name: { type: 'string' },
                      checked: { type: 'boolean' },
                      value: { type: 'string' },
                      page_index: { type: 'integer' },
                      x: { type: 'number' },
                      y: { type: 'number' },
                      max_width: { type: 'number' },
                      font_size: { type: 'number' },
                      mark: { type: 'string', enum: ['x', 'check'] },
                      size: { type: 'number' },
                    },
                    required: ['type'],
                  },
                },
              },
              required: ['label', 'confidence', 'bindings'],
            },
          },
        },
        required: ['label', 'kind', 'required', 'confidence', 'bindings', 'options'],
      },
    },
  },
  required: ['mode', 'confidence', 'questions'],
};

function trimPage(page) {
  return {
    pageIndex: page.pageIndex,
    width: page.width,
    height: page.height,
    words: (page.words || []).slice(0, 320),
    widgets: (page.widgets || []).slice(0, 120),
    lineCandidates: (page.lineCandidates || []).slice(0, 160),
    checkboxCandidates: (page.checkboxCandidates || []).slice(0, 160),
  };
}

function buildUserPrompt({ parsedPdf, hospitalSystemName, facilityName, formName, sourceUrl }) {
  const pages = (parsedPdf.pages || []).slice(0, 4).map(trimPage);

  return JSON.stringify(
    {
      task: 'Extract only additional, user-answerable questions from this medical-records request PDF.',
      rules: [
        'Only return questions that the user must answer beyond already-collected bio fields.',
        'Exclude name, date of birth, mailing address, signatures, photo-ID upload, and pure instructions.',
        'Supported question kinds: single_select, multi_select, short_text.',
        'Use exact AcroForm field names when widgets exist.',
        'For flat PDFs, use overlay bindings with explicit page_index, x, and y coordinates in PDF coordinate space.',
        `Only include questions and bindings you judge at or above confidence ${MIN_AUTOFILL_CONFIDENCE}.`,
        'If there are no high-confidence additional questions, return an empty questions array.',
      ],
      context: {
        hospitalSystemName,
        facilityName,
        formName,
        sourceUrl,
      },
      pdf: {
        title: parsedPdf.title || '',
        headerText: parsedPdf.headerText || '',
        text: parsedPdf.text || '',
        pages,
      },
    },
    null,
    2,
  );
}

const SYSTEM_PROMPT = [
  'You extract interactive questions from hospital medical-record request PDFs.',
  'Work only from the grounded PDF layout data provided.',
  'Return only additional user-input questions that should become workflow steps in a mobile app.',
  'Do not include basic bio fields, signatures, dates to sign, instructions, or photo-ID requirements.',
  'Every returned option or short-text question must include precise bindings that let the app write the answer back into the same PDF.',
  'If confidence is below threshold, omit the question entirely instead of guessing.',
].join(' ');

export async function extractPdfFormUnderstanding({
  parsedPdf,
  hospitalSystemName,
  facilityName = null,
  formName,
  sourceUrl,
}) {
  if (!parsedPdf?.pages?.length) {
    return {
      extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
      extractorVersion: PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
      status: 'partial',
      structuredOutput: {
        form_understanding: buildUnsupportedAutofillPayload(),
        metadata: {
          reason: 'missing_pdf_pages',
        },
      },
    };
  }

  if (!config.openai.apiKey || !config.openai.pdfFormUnderstandingModel) {
    return {
      extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
      extractorVersion: PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
      status: 'partial',
      structuredOutput: {
        form_understanding: buildUnsupportedAutofillPayload(),
        metadata: {
          reason: 'openai_not_configured',
        },
      },
    };
  }

  try {
    const { output, responseId, usage } = await extractPdfFormUnderstandingWithOpenAI({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: config.openai.pdfFormUnderstandingModel,
      timeoutMs: config.openai.timeoutMs,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt({
        parsedPdf,
        hospitalSystemName,
        facilityName,
        formName,
        sourceUrl,
      }),
      schema: PDF_FORM_UNDERSTANDING_SCHEMA,
    });

    const formUnderstanding = normalizePdfFormUnderstanding(output);

    return {
      extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
      extractorVersion: PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
      status: formUnderstanding.supported ? 'success' : 'partial',
      structuredOutput: {
        form_understanding: formUnderstanding,
        metadata: {
          response_id: responseId,
          usage,
        },
      },
    };
  } catch (error) {
    return {
      extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
      extractorVersion: PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
      status: 'failed',
      structuredOutput: {
        form_understanding: buildUnsupportedAutofillPayload(),
        metadata: {
          reason: 'openai_request_failed',
          error: error instanceof Error ? error.message : 'Unknown OpenAI extraction error.',
        },
      },
    };
  }
}
