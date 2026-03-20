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

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeFieldName(value) {
  return normalizeString(value).toLowerCase();
}

function buildRawShortTextQuestion({
  id,
  label,
  fieldName,
  required = false,
  helpText = null,
  confidence = 0.97,
}) {
  return {
    id,
    label,
    kind: 'short_text',
    required,
    help_text: helpText,
    confidence,
    bindings: [
      {
        type: 'field_text',
        field_name: fieldName,
      },
    ],
    options: [],
  };
}

function buildRawMultiSelectQuestion({
  id,
  label,
  options,
  required = false,
  helpText = null,
  confidence = 0.97,
}) {
  return {
    id,
    label,
    kind: 'multi_select',
    required,
    help_text: helpText,
    confidence,
    bindings: options.map((option) => ({
      type: 'field_checkbox',
      field_name: option.fieldName,
      checked: true,
    })),
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      confidence,
      bindings: [
        {
          type: 'field_checkbox',
          field_name: option.fieldName,
          checked: true,
        },
      ],
    })),
  };
}

function getBindingFieldNames(question) {
  return [
    ...(Array.isArray(question?.bindings) ? question.bindings : []),
    ...(Array.isArray(question?.options)
      ? question.options.flatMap((option) => option.bindings || [])
      : []),
  ]
    .filter((binding) => binding?.type === 'field_text' || binding?.type === 'field_checkbox')
    .map((binding) => normalizeFieldName(binding.field_name))
    .filter(Boolean);
}

function buildFieldQuestionDefinition(fieldName, fieldLabel = '', confidence = 0.97) {
  const normalizedFieldName = normalizeFieldName(fieldName);

  const excludedPatterns = [
    /^patient name$/,
    /^last 4 of social security number$/,
    /^dob$/,
    /^acct$/,
    /^mrn$/,
    /^patient street address$/,
    /^patient city state$/,
    /^patient zip$/,
    /^patient telephone number$/,
    /^patient email$/,
    /^printed name of patient or legal representative$/,
    /^relationship to patient$/,
    /^representatives authority to act for patient$/,
    /^date$/,
  ];

  if (excludedPatterns.some((pattern) => pattern.test(normalizedFieldName))) {
    return null;
  }

  const directMatches = [
    {
      pattern: /^specify provider fill$/,
      question: {
        id: 'specify_provider_details',
        label: 'If selected, specify provider or location',
      },
    },
    {
      pattern: /^delivery other fill$/,
      question: {
        id: 'delivery_other_details',
        label: 'If other, specify delivery details',
      },
    },
    {
      pattern: /^release other fill$/,
      question: {
        id: 'release_other_details',
        label: 'If other, specify what information to release',
      },
    },
    {
      pattern: /^fill_4$/,
      question: {
        id: 'purpose_other_details',
        label: 'If other, specify the purpose of the use or disclosure',
      },
    },
    {
      pattern: /^treatment date from$/,
      question: {
        id: 'treatment_date_from',
        label: 'Treatment date from',
        helpText: 'Enter as MM/DD/YYYY if known.',
      },
    },
    {
      pattern: /^treatment date to$/,
      question: {
        id: 'treatment_date_to',
        label: 'Treatment date to',
        helpText: 'Enter as MM/DD/YYYY if known.',
      },
    },
    {
      pattern: /^alcohol\/drug$/,
      question: {
        id: 'alcohol_drug_initials',
        label: 'If applicable, enter patient initials for Alcohol/Drug information',
      },
    },
    {
      pattern: /^genetics$/,
      question: {
        id: 'genetics_initials',
        label: 'If applicable, enter patient initials for Genetics information',
      },
    },
    {
      pattern: /^hiv$/,
      question: {
        id: 'hiv_initials',
        label: 'If applicable, enter patient initials for HIV/AIDS information',
      },
    },
    {
      pattern: /^mental health$/,
      question: {
        id: 'mental_health_initials',
        label: 'If applicable, enter patient initials for Mental Health information',
      },
    },
    {
      pattern: /^expiration dateevent$/,
      question: {
        id: 'expiration_date_or_event',
        label: 'Enter the expiration date or event for this authorization',
      },
    },
  ];

  for (const match of directMatches) {
    if (match.pattern.test(normalizedFieldName)) {
      return {
        ...match.question,
        fieldName,
        required: false,
        confidence,
      };
    }
  }

  return null;
}

function splitCompositeShortTextQuestions(questions) {
  return questions.flatMap((question) => {
    if (question?.kind !== 'short_text') {
      return [question];
    }

    const fieldTextBindings = (Array.isArray(question.bindings) ? question.bindings : []).filter(
      (binding) => binding?.type === 'field_text' && normalizeFieldName(binding.field_name),
    );

    if (fieldTextBindings.length <= 1) {
      return [question];
    }

    const splitQuestions = fieldTextBindings
      .map((binding) =>
        buildFieldQuestionDefinition(
          binding.field_name,
          question.help_text || question.label || '',
          question.confidence || 0.97,
        ),
      )
      .filter(Boolean)
      .map((definition) =>
        buildRawShortTextQuestion({
          id: definition.id,
          label: definition.label,
          fieldName: definition.fieldName,
          required: question.required && fieldTextBindings.length === 1,
          helpText: definition.helpText || null,
          confidence: definition.confidence || question.confidence || 0.97,
        }),
      );

    return splitQuestions.length === fieldTextBindings.length ? splitQuestions : [question];
  });
}

function addMissingWidgetQuestions(output, parsedPdf) {
  const existingFieldNames = new Set(
    (Array.isArray(output?.questions) ? output.questions : []).flatMap((question) =>
      getBindingFieldNames(question),
    ),
  );
  const questions = [...(Array.isArray(output?.questions) ? output.questions : [])];

  const facilityFieldNames = ['clinic visits', 'hospital visits', 'specify provider'];
  const hasFacilitiesQuestion = facilityFieldNames.every((fieldName) => existingFieldNames.has(fieldName));

  if (!hasFacilitiesQuestion) {
    const facilityWidgets = [];
    for (const page of parsedPdf?.pages || []) {
      for (const widget of page.widgets || []) {
        const normalizedFieldName = normalizeFieldName(widget?.fieldName);
        if (!facilityFieldNames.includes(normalizedFieldName)) continue;
        facilityWidgets.push(widget);
      }
    }

    if (facilityWidgets.length === facilityFieldNames.length) {
      questions.push(
        buildRawMultiSelectQuestion({
          id: 'facilities_records_to_release',
          label: 'Information to be released from these BSWH facilities',
          required: true,
          helpText: 'Select all that apply.',
          confidence: 0.97,
          options: [
            {
              id: 'clinic_visits',
              label: 'Clinic visits',
              fieldName: 'Clinic visits',
            },
            {
              id: 'hospital_visits',
              label: 'Hospital visits',
              fieldName: 'Hospital visits',
            },
            {
              id: 'specify_provider',
              label: 'Specify provider or location',
              fieldName: 'specify provider',
            },
          ],
        }),
      );

      for (const fieldName of facilityFieldNames) {
        existingFieldNames.add(fieldName);
      }
    }
  }

  for (const page of parsedPdf?.pages || []) {
    for (const widget of page.widgets || []) {
      if (normalizeFieldName(widget?.fieldType) !== 'text') continue;

      const fieldName = normalizeString(widget?.fieldName);
      const normalizedFieldName = normalizeFieldName(fieldName);
      if (!fieldName || existingFieldNames.has(normalizedFieldName)) continue;

      const definition = buildFieldQuestionDefinition(fieldName, widget?.fieldLabel || '');
      if (!definition) continue;

      questions.push(
        buildRawShortTextQuestion({
          id: definition.id,
          label: definition.label,
          fieldName,
          required: definition.required,
          helpText: definition.helpText || null,
          confidence: definition.confidence,
        }),
      );
      existingFieldNames.add(normalizedFieldName);
    }
  }

  return {
    ...output,
    questions,
  };
}

function enrichRawPdfFormUnderstandingOutput(output, parsedPdf) {
  const rawQuestions = Array.isArray(output?.questions) ? output.questions : [];
  const splitQuestions = splitCompositeShortTextQuestions(rawQuestions);
  return addMissingWidgetQuestions(
    {
      ...output,
      questions: splitQuestions,
    },
    parsedPdf,
  );
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

    const enrichedOutput = enrichRawPdfFormUnderstandingOutput(output, parsedPdf);
    const formUnderstanding = normalizePdfFormUnderstanding(enrichedOutput);

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
