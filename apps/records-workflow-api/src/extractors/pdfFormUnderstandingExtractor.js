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

const CHECKBOX_FIELD_TYPE_PATTERN = /checkbox/i;
const CHECKBOX_GROUP_MIN_SIZE = 3;
const CHECKBOX_WIDGET_ROW_TOLERANCE = 4;
const CHECKBOX_CLUSTER_ROW_GAP = 20;
const CHECKBOX_LABEL_WORD_TOLERANCE = 5;
const CHECKBOX_HEADING_LINE_TOLERANCE = 4;
const CHECKBOX_HEADING_MAX_DISTANCE = 80;

function slugifyQuestionId(value) {
  return normalizeFieldName(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanizeFieldName(value) {
  const trimmed = normalizeString(value);
  if (!trimmed) return '';

  const collapsed = trimmed.replace(/[_-]+/g, ' ');
  if (/^[A-Z0-9\s/&().:-]+$/.test(collapsed)) {
    return collapsed;
  }

  return collapsed.replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeRenderableWord(value) {
  return normalizeString(value).replace(/[^\p{L}\p{N}&/().,:-]+/gu, ' ').trim();
}

function isCheckboxWidget(widget) {
  return CHECKBOX_FIELD_TYPE_PATTERN.test(normalizeFieldName(widget?.fieldType));
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

function buildWordLines(words = []) {
  const rows = [];
  const sortedWords = [...words]
    .map((word) => ({
      ...word,
      renderedText: normalizeRenderableWord(word?.text || ''),
    }))
    .filter((word) => word.renderedText)
    .sort((left, right) => right.y - left.y || left.x - right.x);

  for (const word of sortedWords) {
    let matchedRow = null;

    for (const row of rows) {
      if (Math.abs(row.y - word.y) <= CHECKBOX_HEADING_LINE_TOLERANCE) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      matchedRow = {
        y: word.y,
        words: [],
      };
      rows.push(matchedRow);
    }

    matchedRow.words.push(word);
  }

  return rows
    .map((row) => {
      const words = row.words.sort((left, right) => left.x - right.x);
      return {
        y: row.y,
        x1: Math.min(...words.map((word) => Number(word.x || 0))),
        x2: Math.max(...words.map((word) => Number(word.x || 0) + Number(word.width || 0))),
        text: words.map((word) => word.renderedText).join(' ').replace(/\s+/g, ' ').trim(),
        words,
      };
    })
    .filter((row) => row.text);
}

function buildInlineHeadingText(words, minX) {
  return words
    .filter((word) => Number(word.x || 0) + Number(word.width || 0) <= minX - 4)
    .map((word) => normalizeRenderableWord(word.text || ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildCheckboxClusters(page) {
  const wordLines = buildWordLines(page?.words || []);
  const rows = [];

  for (const widget of page?.widgets || []) {
    if (!isCheckboxWidget(widget) || !normalizeFieldName(widget?.fieldName)) {
      continue;
    }

    let matchedRow = null;
    for (const row of rows) {
      if (Math.abs(row.y - Number(widget.y || 0)) <= CHECKBOX_WIDGET_ROW_TOLERANCE) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      matchedRow = {
        y: Number(widget.y || 0),
        widgets: [],
      };
      rows.push(matchedRow);
    }

    matchedRow.widgets.push(widget);
  }

  const sortedRows = rows
    .map((row) => {
      const widgets = row.widgets.sort((left, right) => left.x - right.x);
      const minX = Math.min(...widgets.map((widget) => Number(widget.x || 0)));
      const lineWords =
        wordLines.find((line) => Math.abs(Number(line.y || 0) - row.y) <= CHECKBOX_LABEL_WORD_TOLERANCE)
          ?.words || [];

      return {
        ...row,
        widgets,
        inlineHeadingText: buildInlineHeadingText(lineWords, minX),
      };
    })
    .sort((left, right) => right.y - left.y);

  const clusters = [];
  let currentCluster = [];
  let previousRow = null;

  for (const row of sortedRows) {
    const startsNewCluster =
      !previousRow ||
      previousRow.y - row.y > CHECKBOX_CLUSTER_ROW_GAP ||
      Boolean(row.inlineHeadingText);

    if (startsNewCluster) {
      if (currentCluster.length >= CHECKBOX_GROUP_MIN_SIZE) {
        clusters.push(currentCluster);
      }
      currentCluster = [...row.widgets];
    } else {
      currentCluster.push(...row.widgets);
    }

    previousRow = row;
  }

  if (currentCluster.length >= CHECKBOX_GROUP_MIN_SIZE) {
    clusters.push(currentCluster);
  }

  return clusters;
}

function buildCheckboxFieldNameSet(cluster) {
  return new Set(
    cluster.map((widget) => normalizeFieldName(widget?.fieldName)).filter(Boolean),
  );
}

function normalizeCheckboxOptionLabel(label, fieldName) {
  const normalizedLabel = normalizeString(label)
    .replace(/^\(+|\)+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^other:?$/i.test(normalizedLabel)) {
    return 'Other (please specify)';
  }

  return normalizedLabel || humanizeFieldName(fieldName);
}

function cleanCheckboxPromptLabel(label) {
  return normalizeString(label)
    .replace(/\s*:\s*from\s+to(?=\s*\(select all that apply\):?$)/i, '')
    .replace(/\s+from\s+to(?=\s*\(select all that apply\):?$)/i, '')
    .replace(/\s*:\s*from\s+to\s*$/i, '')
    .replace(/\s+from\s+to\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeCheckboxLabel(value) {
  return normalizeFieldName(value)
    .split(/[^a-z0-9]+/g)
    .filter(Boolean);
}

function buildCheckboxOptionFallbackLabel(widget) {
  return normalizeCheckboxOptionLabel(
    normalizeString(widget?.fieldLabel) || humanizeFieldName(widget?.fieldName),
    widget?.fieldName,
  );
}

function shouldPreferFallbackCheckboxLabel(derivedLabel, fallbackLabel) {
  const normalizedDerived = normalizeString(derivedLabel);
  const normalizedFallback = normalizeString(fallbackLabel);
  if (!normalizedFallback) return false;
  if (!normalizedDerived) return true;
  if (normalizeFieldName(normalizedDerived) === normalizeFieldName(normalizedFallback)) {
    return false;
  }

  const derivedTokens = tokenizeCheckboxLabel(normalizedDerived);
  const fallbackTokens = tokenizeCheckboxLabel(normalizedFallback);
  if (derivedTokens.length === 0) return true;
  if (fallbackTokens.length <= derivedTokens.length) return false;

  const fallbackTokenSet = new Set(fallbackTokens);
  return derivedTokens.every((token) => fallbackTokenSet.has(token));
}

function resolveCheckboxOptionLabel(derivedLabel, widget) {
  const fallbackLabel = buildCheckboxOptionFallbackLabel(widget);
  if (shouldPreferFallbackCheckboxLabel(derivedLabel, fallbackLabel)) {
    return fallbackLabel;
  }

  return normalizeCheckboxOptionLabel(derivedLabel, widget?.fieldName) || fallbackLabel;
}

function buildClusterOption(widget, rowWidgets, page) {
  const sortedRowWidgets = [...rowWidgets].sort((left, right) => left.x - right.x);
  const widgetIndex = sortedRowWidgets.findIndex((candidate) => candidate === widget);
  const nextWidget = widgetIndex >= 0 ? sortedRowWidgets[widgetIndex + 1] || null : null;
  const labelWords = (page?.words || [])
    .filter((word) => Math.abs(Number(word.y || 0) - Number(widget.y || 0)) <= CHECKBOX_LABEL_WORD_TOLERANCE)
    .filter((word) => Number(word.x || 0) >= Number(widget.x || 0) + Math.max(Number(widget.width || 0) - 3, 4))
    .filter((word) => !nextWidget || Number(word.x || 0) < Number(nextWidget.x || 0) - 4)
    .sort((left, right) => left.x - right.x);

  const derivedLabel = labelWords.map((word) => normalizeRenderableWord(word.text || '')).filter(Boolean).join(' ');
  const label = resolveCheckboxOptionLabel(derivedLabel, widget);

  if (!label) return null;

  return {
    id: slugifyQuestionId(widget?.fieldName) || slugifyQuestionId(label),
    label,
    fieldName: widget.fieldName,
  };
}

function buildCheckboxClusterPrompt(cluster, page) {
  const minX = Math.min(...cluster.map((widget) => Number(widget.x || 0)));
  const maxX = Math.max(...cluster.map((widget) => Number(widget.x || 0) + Number(widget.width || 0)));
  const maxY = Math.max(...cluster.map((widget) => Number(widget.y || 0)));
  const lines = buildWordLines(page?.words || []);
  const inlineHeading = buildInlineHeadingText(
    lines.find((line) => Math.abs(Number(line.y || 0) - maxY) <= CHECKBOX_LABEL_WORD_TOLERANCE)
      ?.words || [],
    minX,
  );

  if (inlineHeading) {
    const cleanedInlineHeading = cleanCheckboxPromptLabel(inlineHeading);
    return {
      label: /\b(select|apply|choose|check)\b/i.test(cleanedInlineHeading)
        ? cleanedInlineHeading
        : `${cleanedInlineHeading.replace(/:\s*$/, '')} (select all that apply):`,
      helpText: null,
    };
  }

  const candidates = lines
    .filter((line) => line.y > maxY + 4 && line.y <= maxY + CHECKBOX_HEADING_MAX_DISTANCE)
    .filter((line) => line.x2 >= minX - 24 && line.x1 <= maxX + 220)
    .map((line) => {
      const text = normalizeString(line.text);
      let score = /:/.test(text) ? 2 : 0;
      if (/\b(select|apply|choose|release|records?|information|facilit|disclosure|purpose|delivery)\b/i.test(text)) {
        score += 3;
      }
      if (/\bfollowing\b/i.test(text)) {
        score += 2;
      }
      if (/\bif applicable\b/i.test(text)) {
        score -= 2;
      }
      if (/\binitials?\b/i.test(text) || /_{3,}/.test(text)) {
        score -= 4;
      }
      return {
        ...line,
        score,
      };
    })
    .sort((left, right) => right.score - left.score || left.y - right.y);

  const primary = candidates[0]?.text ? normalizeString(candidates[0].text) : '';
  const secondary = candidates[1]?.text ? normalizeString(candidates[1].text) : null;

  let label = primary;
  if (!label) {
    label = 'Select all that apply:';
  } else if (!/\b(select|apply|choose|check)\b/i.test(label)) {
    label = `${label.replace(/:\s*$/, '')} (select all that apply):`;
  }
  label = cleanCheckboxPromptLabel(label);

  return {
    label,
    helpText: secondary && secondary !== primary ? secondary : null,
  };
}

function buildCheckboxClusterQuestion(cluster, page) {
  const rows = [];
  const sortedCluster = [...cluster].sort((left, right) => right.y - left.y || left.x - right.x);

  for (const widget of sortedCluster) {
    let matchedRow = null;

    for (const row of rows) {
      if (Math.abs(row.y - Number(widget.y || 0)) <= CHECKBOX_WIDGET_ROW_TOLERANCE) {
        matchedRow = row;
        break;
      }
    }

    if (!matchedRow) {
      matchedRow = {
        y: Number(widget.y || 0),
        widgets: [],
      };
      rows.push(matchedRow);
    }

    matchedRow.widgets.push(widget);
  }

  const options = rows
    .sort((left, right) => right.y - left.y)
    .flatMap((row) => row.widgets.sort((left, right) => left.x - right.x))
    .map((widget) => buildClusterOption(widget, rows.find((row) => row.widgets.includes(widget))?.widgets || [], page))
    .filter(Boolean);

  if (options.length < CHECKBOX_GROUP_MIN_SIZE) {
    return null;
  }

  const { label, helpText } = buildCheckboxClusterPrompt(cluster, page);
  const questionIdSeed = [
    label,
    ...options.slice(0, 3).map((option) => option.fieldName),
  ]
    .filter(Boolean)
    .join(' ');

  return buildRawMultiSelectQuestion({
    id:
      slugifyQuestionId(questionIdSeed) ||
      `checkbox-cluster-page-${Number(page?.pageIndex || 0)}`,
    label,
    required: false,
    helpText,
    confidence: 0.97,
    options,
  });
}

function buildQuestionOptionFieldNameMap(question) {
  const optionFieldNames = new Map();
  for (const option of question?.options || []) {
    const fieldName = normalizeFieldName(option?.bindings?.[0]?.field_name);
    if (fieldName) {
      optionFieldNames.set(fieldName, option);
    }
  }
  return optionFieldNames;
}

function mergeCheckboxClusterIntoQuestion(question, cluster, page) {
  const synthesizedQuestion = buildCheckboxClusterQuestion(cluster, page);
  if (!synthesizedQuestion) return question;

  const existingOptionFieldNames = buildQuestionOptionFieldNameMap(question);
  const coveredClusterFieldCount = (synthesizedQuestion.options || []).filter((option) =>
    existingOptionFieldNames.has(normalizeFieldName(option?.bindings?.[0]?.field_name)),
  ).length;
  const mergedOptions = [];
  const seenFieldNames = new Set();

  for (const option of synthesizedQuestion.options || []) {
    const fieldName = normalizeFieldName(option?.bindings?.[0]?.field_name);
    if (!fieldName || seenFieldNames.has(fieldName)) continue;
    seenFieldNames.add(fieldName);

    const existingOption = existingOptionFieldNames.get(fieldName);
    mergedOptions.push(
      existingOption
        ? {
            ...existingOption,
            label: normalizeString(existingOption.label) || option.label,
            bindings:
              Array.isArray(existingOption.bindings) && existingOption.bindings.length > 0
                ? existingOption.bindings
                : option.bindings,
          }
        : option,
    );
  }

  for (const option of question?.options || []) {
    const fieldName = normalizeFieldName(option?.bindings?.[0]?.field_name);
    if (!fieldName || seenFieldNames.has(fieldName)) continue;
    seenFieldNames.add(fieldName);
    mergedOptions.push(option);
  }

  return {
    ...question,
    kind: 'multi_select',
    label:
      coveredClusterFieldCount < (synthesizedQuestion.options || []).length
        ? synthesizedQuestion.label
        : normalizeString(question?.label) || synthesizedQuestion.label,
    help_text:
      coveredClusterFieldCount < (synthesizedQuestion.options || []).length
        ? synthesizedQuestion.help_text || null
        : normalizeString(question?.help_text || '') || synthesizedQuestion.help_text || null,
    confidence: question?.confidence || synthesizedQuestion.confidence || 0.97,
    bindings: mergedOptions.flatMap((option) => option.bindings || []),
    options: mergedOptions,
  };
}

function findBestMatchingCheckboxQuestionIndex(questions, clusterFieldNames) {
  let bestIndex = -1;
  let bestOverlap = 0;

  questions.forEach((question, index) => {
    const overlap = getBindingFieldNames(question).filter((fieldName) =>
      clusterFieldNames.has(fieldName),
    ).length;

    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestIndex = index;
    }
  });

  return bestIndex;
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

  for (const page of parsedPdf?.pages || []) {
    for (const cluster of buildCheckboxClusters(page)) {
      const clusterFieldNames = buildCheckboxFieldNameSet(cluster);
      const matchingQuestionIndex = findBestMatchingCheckboxQuestionIndex(
        questions,
        clusterFieldNames,
      );

      if (matchingQuestionIndex >= 0) {
        questions[matchingQuestionIndex] = mergeCheckboxClusterIntoQuestion(
          questions[matchingQuestionIndex],
          cluster,
          page,
        );
        for (const fieldName of getBindingFieldNames(questions[matchingQuestionIndex])) {
          existingFieldNames.add(fieldName);
        }
        continue;
      }

      const synthesizedQuestion = buildCheckboxClusterQuestion(cluster, page);
      if (!synthesizedQuestion) continue;
      questions.push(synthesizedQuestion);
      for (const fieldName of getBindingFieldNames(synthesizedQuestion)) {
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
