import { config } from '../config.js';
import { extractPdfFormUnderstandingWithOpenAI, isOpenAiApiError } from '../providers/openaiPdfFormUnderstandingClient.js';
import {
  buildUnsupportedAutofillPayload,
  normalizePdfFormUnderstanding,
  PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
  PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
} from '../utils/pdfFormUnderstanding.js';
import {
  DEFAULT_MAX_INPUT_TOKENS,
  DEFAULT_PROMPT_PROFILE,
  PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA,
  PDF_FORM_UNDERSTANDING_SYSTEM_PROMPT,
  preparePdfFormUnderstandingRequest,
} from '../utils/pdfFormUnderstandingPrompt.js';

function buildPartialResponse(reason, metadata = {}) {
  return {
    extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
    extractorVersion: PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
    status: 'partial',
    structuredOutput: {
      form_understanding: buildUnsupportedAutofillPayload(),
      metadata: {
        reason,
        ...metadata,
      },
    },
  };
}

function classifyOpenAiFailure(error) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : 'Unknown OpenAI extraction error.';
  const status =
    (isOpenAiApiError(error) ? error.status : null) ??
    (Number.isFinite(error?.status) ? Number(error.status) : null);
  const lowerMessage = message.toLowerCase();

  if (status === 400 && lowerMessage.includes('invalid schema for response_format')) {
    return {
      error_category: 'schema_invalid',
      retryable: false,
      openai_status: status,
      error: message,
    };
  }

  if (status === 429 && lowerMessage.includes('request too large')) {
    return {
      error_category: 'request_too_large',
      retryable: false,
      openai_status: status,
      error: message,
    };
  }

  if (status === 429) {
    return {
      error_category: 'rate_limit',
      retryable: true,
      openai_status: status,
      error: message,
    };
  }

  if (lowerMessage.includes('abort') || lowerMessage.includes('timeout')) {
    return {
      error_category: 'timeout',
      retryable: true,
      openai_status: status,
      error: message,
    };
  }

  if (status != null && status >= 500) {
    return {
      error_category: 'upstream_error',
      retryable: true,
      openai_status: status,
      error: message,
    };
  }

  return {
    error_category: 'openai_request_failed',
    retryable: false,
    openai_status: status,
    error: message,
  };
}

export function preparePdfFormUnderstandingExtraction(options) {
  return preparePdfFormUnderstandingRequest({
    ...options,
    promptProfile: options.promptProfile || DEFAULT_PROMPT_PROFILE,
    maxInputTokens: options.maxInputTokens || DEFAULT_MAX_INPUT_TOKENS,
  });
}

export async function extractPdfFormUnderstanding({
  parsedPdf,
  hospitalSystemName,
  facilityName = null,
  formName,
  sourceUrl,
  promptProfile = DEFAULT_PROMPT_PROFILE,
  maxInputTokens = DEFAULT_MAX_INPUT_TOKENS,
  preparedRequest = null,
}) {
  if (!parsedPdf?.pages?.length) {
    return buildPartialResponse('missing_pdf_pages');
  }

  if (!config.openai.apiKey || !config.openai.pdfFormUnderstandingModel) {
    return buildPartialResponse('openai_not_configured');
  }

  const requestPlan =
    preparedRequest ||
    preparePdfFormUnderstandingExtraction({
      parsedPdf,
      hospitalSystemName,
      facilityName,
      formName,
      sourceUrl,
      promptProfile,
      maxInputTokens,
    });

  if (requestPlan.promptMetadata.prompt_over_budget) {
    return buildPartialResponse('prompt_budget_exceeded', requestPlan.promptMetadata);
  }

  try {
    const { output, responseId, usage } = await extractPdfFormUnderstandingWithOpenAI({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: config.openai.pdfFormUnderstandingModel,
      timeoutMs: config.openai.timeoutMs,
      systemPrompt: PDF_FORM_UNDERSTANDING_SYSTEM_PROMPT,
      userPrompt: requestPlan.userPrompt,
      schema: PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA,
    });

    const formUnderstanding = normalizePdfFormUnderstanding(output);

    return {
      extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
      extractorVersion: PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
      status: formUnderstanding.supported ? 'success' : 'partial',
      structuredOutput: {
        form_understanding: formUnderstanding,
        metadata: {
          ...requestPlan.promptMetadata,
          response_id: responseId,
          usage,
        },
      },
    };
  } catch (error) {
    const classified = classifyOpenAiFailure(error);
    return {
      extractorName: PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
      extractorVersion: PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
      status: 'failed',
      structuredOutput: {
        form_understanding: buildUnsupportedAutofillPayload(),
        metadata: {
          ...requestPlan.promptMetadata,
          reason: 'openai_request_failed',
          ...classified,
        },
      },
    };
  }
}
