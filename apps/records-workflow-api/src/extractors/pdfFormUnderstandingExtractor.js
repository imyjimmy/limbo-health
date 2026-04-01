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
const FOLLOW_UP_OPTION_PATTERN = /\bother\b|\bspecify\b|\bprovider\b|\blocation\b|\bdescribe\b|\bdetail\b/i;
const FOLLOW_UP_PARENT_MAX_DISTANCE = 84;
const TEXT_FIELD_TYPE_PATTERN = /^text$/i;
const RADIO_FIELD_TYPE_PATTERN = /radio/i;
const DELIVERY_OPTION_HINT_PATTERN =
  /\b(paper copy|electronic media|encrypted email|unencrypted email|email|mail|fax|pickup|pick up|portal)\b/i;
const RECORD_SELECTION_OPTION_HINT_PATTERN =
  /\b(all pertinent records|consultation|medication list|discharge|operative report|labor and delivery|er report|pathology report|specialty test|ekg report|problem list|physician orders|history and physical|radiology report|progress notes|clinical|laboratory|billing|complete chart|immunization)\b/i;
const RECIPIENT_OPTION_HINT_PATTERN =
  /\b(patient\/designee|health care entity|insurance company|attorney|individual\/organization|individualorganization|recipient|other \(please specify\))\b/i;
const PURPOSE_OPTION_HINT_PATTERN =
  /\b(continuing care|legal|insurance|personal use|at the request of the individual|other \(please specify\)|other 3rd party recipient)\b/i;
const RECIPIENT_CONTEXT_FIELD_PATTERN =
  /\b(recipient|released to|individualorganization|individual\/organization|email for releases to email|fax number)\b/i;
const PATIENT_CONTEXT_FIELD_PATTERN =
  /\b(patient|dob|date of birth|birth|ssn|social security|mrn|acct)\b/i;
const EXCLUDED_AUTOFILL_FIELD_PATTERNS = [
  /^patient name$/,
  /^patient(?:[\s_-]+)first(?:[\s_-]+)name$/,
  /^patient(?:[\s_-]+)last(?:[\s_-]+)name$/,
  /^first(?:[\s_-]+)name$/,
  /^last(?:[\s_-]+)name$/,
  /^full(?:[\s_-]+)name$/,
  /^middle(?:[\s_-]+)initial$/,
  /^date(?:[\s_-]+)of(?:[\s_-]+)birth$/,
  /^birth(?:[\s_-]+)date$/,
  /^last 4 of social security number$/,
  /^social(?:[\s_-]+)security(?:[\s_-]+)number$/,
  /^ssn$/,
  /^dob$/,
  /^acct$/,
  /^mrn$/,
  /^patient(?:[\s_-]+)address$/,
  /^patient street address$/,
  /^patient city state$/,
  /^patient zip$/,
  /^patient(?:[\s_-]+)city$/,
  /^patient(?:[\s_-]+)state$/,
  /^patient(?:[\s_-]+)postal(?:[\s_-]+)code$/,
  /^patient(?:[\s_-]+)phone$/,
  /^patient(?:[\s_-]+)telephone$/,
  /^patient telephone number$/,
  /^patient email$/,
  /^nombre(?:[\s_-]+)del(?:[\s_-]+)paciente$/,
  /^fecha(?:[\s_-]+)de(?:[\s_-]+)nacimiento$/,
  /^telefono(?:[\s_-]+)del(?:[\s_-]+)paciente$/,
  /^correo(?:[\s_-]+)electronico(?:[\s_-]+)del(?:[\s_-]+)paciente$/,
  /^ultimos?(?:[\s_-]+)4(?:[\s_-]+)digitos/,
  /^printed name of patient or legal representative$/,
  /^relationship to patient$/,
  /^representatives authority to act for patient$/,
  /^facility names? and addresses$/,
  /^date$/,
];
const EXCLUDED_AUTOFILL_QUESTION_LABEL_PATTERNS = [
  /^name:?$/i,
  /^first name:?$/i,
  /^last name:?$/i,
  /^birth:?$/i,
  /^date of birth:?$/i,
  /^birth date:?$/i,
  /^dob:?$/i,
  /^facility name\(s\) and addresses:?$/i,
];
const EXCLUDED_AUTOFILL_QUESTION_SIGNAL_PATTERNS = [
  /\bfinancial remuneration\b/i,
];

function slugifyQuestionId(value) {
  return normalizeFieldName(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function humanizeFieldName(value) {
  const trimmed = normalizeString(value);
  if (!trimmed) return '';

  const collapsed = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
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

function isTextWidget(widget) {
  return TEXT_FIELD_TYPE_PATTERN.test(normalizeFieldName(widget?.fieldType));
}

function isRadioWidget(widget) {
  return RADIO_FIELD_TYPE_PATTERN.test(normalizeFieldName(widget?.fieldType));
}

function isExcludedAutofillFieldName(fieldName) {
  const normalizedFieldName = normalizeFieldName(fieldName);
  return EXCLUDED_AUTOFILL_FIELD_PATTERNS.some((pattern) => pattern.test(normalizedFieldName));
}

function isExcludedAutofillQuestion(question, parsedPages = []) {
  const label = normalizeString(question?.label);
  if (EXCLUDED_AUTOFILL_QUESTION_LABEL_PATTERNS.some((pattern) => pattern.test(label))) {
    return true;
  }

  const bindingFieldNames = getBindingFieldNames(question, parsedPages);
  if (bindingFieldNames.some((fieldName) => isExcludedAutofillFieldName(fieldName))) {
    return true;
  }

  const questionSignal = normalizeFieldName(
    [label, question?.help_text || question?.helpText || '', ...bindingFieldNames]
      .filter(Boolean)
      .join(' '),
  );
  return EXCLUDED_AUTOFILL_QUESTION_SIGNAL_PATTERNS.some((pattern) => pattern.test(questionSignal));
}

function filterExcludedAutofillQuestions(output, parsedPdf) {
  const parsedPages = parsedPdf?.pages || [];
  return {
    ...output,
    questions: (Array.isArray(output?.questions) ? output.questions : []).filter(
      (question) => !isExcludedAutofillQuestion(question, parsedPages),
    ),
  };
}

function findQuestionVisibilityRuleByOptionPattern(
  questions = [],
  {
    questionPattern = null,
    optionPattern,
  },
) {
  for (const question of questions) {
    if (!question || question.kind === 'short_text') continue;

    const questionSignal = normalizeFieldName(
      [question?.id, question?.label, question?.help_text].filter(Boolean).join(' '),
    );
    if (questionPattern && !questionPattern.test(questionSignal)) {
      continue;
    }

    const matchingOptionIds = (Array.isArray(question?.options) ? question.options : [])
      .filter((option) =>
        optionPattern.test(
          normalizeFieldName(
            [option?.id, option?.label, getOptionBindingFieldName(option)].filter(Boolean).join(' '),
          ),
        ),
      )
      .map((option) => option.id)
      .filter(Boolean);

    if (matchingOptionIds.length === 0) {
      continue;
    }

    return {
      parent_question_id: question.id,
      parent_option_ids: Array.from(new Set(matchingOptionIds)),
    };
  }

  return null;
}

function applyQuestionVisibilityHeuristics(output, parsedPdf) {
  const questions = Array.isArray(output?.questions) ? output.questions : [];
  if (questions.length === 0) {
    return output;
  }

  const purposeOtherThirdPartyRule = findQuestionVisibilityRuleByOptionPattern(questions, {
    questionPattern: /\bpurpose\b.*\bdisclosure\b/i,
    optionPattern: /\bother 3rd party recipient\b/i,
  });
  const deliveryEmailRule = findQuestionVisibilityRuleByOptionPattern(questions, {
    questionPattern: /\b(receive your records|delivery)\b/i,
    optionPattern: /\b(encrypted email|unencrypted email)\b/i,
  });

  return {
    ...output,
    questions: questions.map((question) => {
      if (!question) return question;

      const hasExplicitVisibilityRule =
        question?.visibility_rule && typeof question.visibility_rule === 'object';
      const questionSignal = normalizeFieldName(
        [
          question?.id,
          question?.label,
          question?.help_text,
          ...getBindingFieldNames(question, parsedPdf?.pages || []),
        ]
          .filter(Boolean)
          .join(' '),
      );

      if (/\b(direct address|national provider identifier|npi)\b/i.test(questionSignal)) {
        return hasExplicitVisibilityRule
          ? {
              ...question,
              visibility_rule: null,
            }
          : question;
      }

      if (hasExplicitVisibilityRule) {
        return question;
      }

      if (deliveryEmailRule && /\bemail address for delivery\b/i.test(questionSignal)) {
        return {
          ...question,
          visibility_rule: deliveryEmailRule,
        };
      }

      if (
        purposeOtherThirdPartyRule &&
        (
          /^recipient\b/i.test(String(question?.label || '').trim()) ||
          /\bif other 3rd party recipient selected\b/i.test(questionSignal)
        )
      ) {
        return {
          ...question,
          visibility_rule: purposeOtherThirdPartyRule,
        };
      }

      return question;
    }),
  };
}

function findParsedPageForBinding(binding, parsedPages = []) {
  const pageIndex = Number(binding?.page_index);
  if (!Number.isInteger(pageIndex)) return null;

  return (
    parsedPages.find(
      (page) => Number(page?.pageIndex ?? page?.page_index ?? -1) === pageIndex,
    ) || null
  );
}

function scoreBindingWidgetMatch(binding, widget) {
  const bindingType = normalizeFieldName(binding?.type);
  const x = Number(binding?.x);
  const y = Number(binding?.y);
  const widgetX = Number(widget?.x || 0);
  const widgetY = Number(widget?.y || 0);
  const widgetWidth = Number(widget?.width || 0);
  const widgetHeight = Number(widget?.height || 0);

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  if (bindingType === 'overlay_mark') {
    if (!isCheckboxWidget(widget)) return null;
    if (
      x < widgetX - 6 ||
      x > widgetX + widgetWidth + 12 ||
      y < widgetY - 6 ||
      y > widgetY + widgetHeight + 12
    ) {
      return null;
    }
  } else if (bindingType === 'overlay_text') {
    if (!isTextWidget(widget)) return null;
    if (
      x < widgetX - 8 ||
      x > widgetX + widgetWidth + 12 ||
      y < widgetY - 14 ||
      y > widgetY + widgetHeight + 14
    ) {
      return null;
    }
  } else {
    return null;
  }

  const widgetAnchorX = bindingType === 'overlay_mark' ? widgetX + widgetWidth / 2 : widgetX;
  const widgetAnchorY = bindingType === 'overlay_mark' ? widgetY + widgetHeight / 2 : widgetY;
  return Math.abs(x - widgetAnchorX) + Math.abs(y - widgetAnchorY);
}

function resolveBindingFieldName(binding, parsedPages = []) {
  const directFieldName = normalizeFieldName(binding?.field_name);
  if (directFieldName) {
    return directFieldName;
  }

  const page = findParsedPageForBinding(binding, parsedPages);
  if (!page) {
    return '';
  }

  const bestMatch = (page.widgets || [])
    .map((widget) => ({
      widget,
      score: scoreBindingWidgetMatch(binding, widget),
    }))
    .filter((entry) => entry.score != null)
    .sort((left, right) => left.score - right.score)[0];

  return normalizeFieldName(bestMatch?.widget?.fieldName);
}

function buildRawShortTextQuestion({
  id,
  label,
  fieldName,
  required = false,
  helpText = null,
  confidence = 0.97,
  visibilityRule = null,
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
    ...(visibilityRule ? { visibility_rule: visibilityRule } : {}),
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

function buildRawSingleSelectQuestion({
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
    kind: 'single_select',
    required,
    help_text: helpText,
    confidence,
    bindings: [],
    options: options.map((option) => ({
      id: option.id,
      label: option.label,
      confidence,
      bindings: option.bindings,
    })),
  };
}

function getBindingFieldNames(question, parsedPages = []) {
  return [
    ...(Array.isArray(question?.bindings) ? question.bindings : []),
    ...(Array.isArray(question?.options)
      ? question.options.flatMap((option) => option.bindings || [])
      : []),
  ]
    .filter((binding) =>
      binding?.type === 'field_text' ||
      binding?.type === 'field_checkbox' ||
      binding?.type === 'field_radio' ||
      binding?.type === 'overlay_text' ||
      binding?.type === 'overlay_mark',
    )
    .map((binding) => resolveBindingFieldName(binding, parsedPages))
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
  let normalizedLabel = normalizeString(label).replace(/\s+/g, ' ').trim();
  if (/^\(.+\)$/.test(normalizedLabel)) {
    normalizedLabel = normalizedLabel.slice(1, -1).trim();
  }

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

function cleanRadioQuestionLabel(label) {
  return normalizeString(label)
    .replace(/^section\s+[a-z]:\s*/i, '')
    .replace(/\s*:\s*$/i, '')
    .trim();
}

function cleanRadioOptionLabel(label) {
  const normalized = normalizeString(label).replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (/^yes\b/i.test(normalized)) return 'Yes';
  if (/^no\b/i.test(normalized)) return 'No';
  return normalized
    .replace(/\s*;\s*or\s*$/i, '')
    .replace(/\s*:\s*$/i, '')
    .trim();
}

function buildRadioOption(widget, page, optionIndex) {
  const sameRowWords = (page?.words || [])
    .filter((word) => Math.abs(Number(word.y || 0) - Number(widget?.y || 0)) <= CHECKBOX_LABEL_WORD_TOLERANCE)
    .filter((word) => Number(word.x || 0) >= Number(widget?.x || 0) + Math.max(Number(widget?.width || 0) - 3, 4))
    .sort((left, right) => left.x - right.x);
  const label = cleanRadioOptionLabel(
    sameRowWords
      .map((word) => normalizeRenderableWord(word.text || ''))
      .filter(Boolean)
      .join(' '),
  );
  if (!label) {
    return null;
  }

  return {
    id: slugifyQuestionId(label) || `radio-option-${optionIndex + 1}`,
    label,
    bindings: [
      {
        type: 'overlay_mark',
        page_index: Number(page?.pageIndex || 0),
        x: Number(widget?.x || 0) + Number(widget?.width || 0) / 2,
        y: Number(widget?.y || 0) + Number(widget?.height || 0) / 2,
        mark: 'x',
        size: Math.max(Number(widget?.width || 0), Number(widget?.height || 0), 10),
      },
    ],
  };
}

function buildRadioGroupQuestion(fieldName, widgets, page) {
  const sortedWidgets = [...widgets].sort(
    (left, right) =>
      Number(right.y || 0) - Number(left.y || 0) || Number(left.x || 0) - Number(right.x || 0),
  );
  const questionLabel = cleanRadioQuestionLabel(
    sortedWidgets[0]?.fieldLabel || humanizeFieldName(fieldName),
  );
  const options = sortedWidgets
    .map((widget, index) => buildRadioOption(widget, page, index))
    .filter(Boolean);
  const uniqueOptions = [];
  const seenOptionIds = new Set();

  for (const option of options) {
    if (!option?.id || seenOptionIds.has(option.id)) continue;
    seenOptionIds.add(option.id);
    uniqueOptions.push(option);
  }

  if (!questionLabel || uniqueOptions.length < 2) {
    return null;
  }

  return buildRawSingleSelectQuestion({
    id: slugifyQuestionId(questionLabel) || slugifyQuestionId(fieldName),
    label: questionLabel,
    required: false,
    helpText: null,
    confidence: 0.96,
    options: uniqueOptions,
  });
}

function buildQuestionOptionFieldNameMap(question, parsedPages = []) {
  const optionFieldNames = new Map();
  for (const option of question?.options || []) {
    const fieldName = resolveBindingFieldName(option?.bindings?.[0], parsedPages);
    if (fieldName) {
      optionFieldNames.set(fieldName, option);
    }
  }
  return optionFieldNames;
}

function getOptionBindingFieldName(option, parsedPages = []) {
  return resolveBindingFieldName(
    option?.bindings?.find(
      (binding) =>
        binding?.type === 'field_checkbox' ||
        binding?.type === 'field_radio' ||
        binding?.type === 'overlay_mark',
    ),
    parsedPages,
  );
}

function isGenericBinaryOptionLabel(label) {
  return /^(yes|no)$/i.test(normalizeString(label));
}

function shouldPreferSynthesizedCheckboxOptionLabel(existingOption, synthesizedOption, parsedPages = []) {
  const existingLabel = normalizeString(existingOption?.label);
  const synthesizedLabel = normalizeString(synthesizedOption?.label);
  if (!synthesizedLabel) return false;
  if (!existingLabel) return true;
  if (isGenericBinaryOptionLabel(existingLabel) && !isGenericBinaryOptionLabel(synthesizedLabel)) {
    return true;
  }

  const existingFieldName = getOptionBindingFieldName(existingOption, parsedPages);
  if (
    existingFieldName &&
    normalizeFieldName(existingLabel) === normalizeFieldName(existingFieldName) &&
    normalizeFieldName(synthesizedLabel) !== normalizeFieldName(existingFieldName)
  ) {
    return true;
  }

  return false;
}

function buildCheckboxOptionSignal(option, parsedPages = []) {
  return normalizeFieldName(
    [
      option?.label,
      option?.id,
      getOptionBindingFieldName(option, parsedPages),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function countMatchingCheckboxOptions(options, parsedPages = [], pattern) {
  return (Array.isArray(options) ? options : []).reduce(
    (count, option) => count + (pattern.test(buildCheckboxOptionSignal(option, parsedPages)) ? 1 : 0),
    0,
  );
}

function getCanonicalCheckboxQuestionPresentation(question, synthesizedQuestion, parsedPages = []) {
  const options =
    (Array.isArray(synthesizedQuestion?.options) && synthesizedQuestion.options.length > 0
      ? synthesizedQuestion.options
      : Array.isArray(question?.options)
        ? question.options
        : []) || [];
  if (options.length === 0) {
    return null;
  }

  const preservedHelpText =
    normalizeString(question?.help_text || '') ||
    normalizeString(synthesizedQuestion?.help_text || '') ||
    'Select all that apply.';

  if (countMatchingCheckboxOptions(options, parsedPages, DELIVERY_OPTION_HINT_PATTERN) >= 2) {
    return {
      label: 'How would you like to receive your records?',
      helpText: preservedHelpText || null,
    };
  }

  if (countMatchingCheckboxOptions(options, parsedPages, RECORD_SELECTION_OPTION_HINT_PATTERN) >= 4) {
    return {
      label: 'Select which parts of your record to release',
      helpText: preservedHelpText || null,
    };
  }

  if (countMatchingCheckboxOptions(options, parsedPages, RECIPIENT_OPTION_HINT_PATTERN) >= 2) {
    return {
      label: 'Who should receive the released information?',
      helpText: preservedHelpText || null,
    };
  }

  if (countMatchingCheckboxOptions(options, parsedPages, PURPOSE_OPTION_HINT_PATTERN) >= 2) {
    return {
      label: 'What is the purpose of the disclosure?',
      helpText: preservedHelpText || null,
    };
  }

  return null;
}

function buildTextWidgetPrintedLabel(widget, page) {
  const minX = Number(widget?.x || 0) - 1;
  const maxX = Number(widget?.x || 0) + Number(widget?.width || 0) + 1;
  const candidateWords = (page?.words || []).filter((word) => {
    const wordX = Number(word.x || 0);
    const wordRight = wordX + Number(word.width || 0);
    return wordRight >= minX && wordX <= maxX;
  });
  const buildPrintedLabel = (words) =>
    words
      .map((word) => normalizeRenderableWord(word.text || ''))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

  const sameRowWords = candidateWords
    .filter((word) => Math.abs(Number(word.y || 0) - Number(widget?.y || 0)) <= CHECKBOX_LABEL_WORD_TOLERANCE)
    .sort((left, right) => left.x - right.x);
  const sameRowLabel = buildPrintedLabel(sameRowWords);
  if (sameRowLabel) {
    return sameRowLabel;
  }

  const aboveRowWords = candidateWords
    .filter((word) => {
      const y = Number(word.y || 0);
      const widgetY = Number(widget?.y || 0);
      return y > widgetY && y - widgetY <= 24;
    })
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const nearestAboveY = aboveRowWords[0]?.y ?? null;
  const nearestAboveLabel =
    nearestAboveY == null
      ? ''
      : buildPrintedLabel(
          aboveRowWords.filter(
            (word) => Math.abs(Number(word.y || 0) - Number(nearestAboveY || 0)) <= CHECKBOX_LABEL_WORD_TOLERANCE,
          ),
        );

  return nearestAboveLabel || humanizeFieldName(widget?.fieldName);
}

function scoreNearbyWidgetContext(originWidget, candidateWidget, pageWidth = 0) {
  const originCenterX = Number(originWidget?.x || 0) + Number(originWidget?.width || 0) / 2;
  const candidateCenterX =
    Number(candidateWidget?.x || 0) + Number(candidateWidget?.width || 0) / 2;
  const dx = Math.abs(originCenterX - candidateCenterX);
  const dy = Math.abs(Number(originWidget?.y || 0) - Number(candidateWidget?.y || 0));
  if (dy > 72 || dx > 280) {
    return 0;
  }

  const pageMidX = Number(pageWidth || 0) / 2;
  if (pageMidX > 0) {
    const originOnRight = originCenterX >= pageMidX;
    const candidateOnRight = candidateCenterX >= pageMidX;
    if (originOnRight !== candidateOnRight && dx > 120) {
      return 0;
    }
  }

  return 1 / (1 + dx / 120 + dy / 18);
}

function inferTextWidgetContext(widget, page) {
  let recipientScore = 0;
  let patientScore = 0;

  for (const candidate of page?.widgets || []) {
    if (!candidate || candidate === widget) continue;
    const signal = normalizeFieldName(
      [candidate?.fieldName, candidate?.fieldLabel].filter(Boolean).join(' '),
    );
    if (!signal) continue;

    const score = scoreNearbyWidgetContext(widget, candidate, Number(page?.width || 0));
    if (score <= 0) continue;

    if (RECIPIENT_CONTEXT_FIELD_PATTERN.test(signal)) {
      recipientScore += score;
    }
    if (PATIENT_CONTEXT_FIELD_PATTERN.test(signal)) {
      patientScore += score;
    }
  }

  if (recipientScore >= 0.5 && recipientScore > patientScore) {
    return 'recipient';
  }
  if (patientScore >= 0.5 && patientScore > recipientScore) {
    return 'patient';
  }

  return null;
}

function buildContextualFieldQuestionDefinition(widget, page, confidence = 0.97) {
  const normalizedFieldName = normalizeFieldName(widget?.fieldName);
  if (!normalizedFieldName) {
    return null;
  }

  const context = inferTextWidgetContext(widget, page);
  if (context !== 'recipient') {
    return null;
  }

  if (/^city$/.test(normalizedFieldName)) {
    return {
      id: 'recipient_city',
      label: 'Recipient city',
      required: false,
      confidence,
      attachParentContext: false,
      fieldName: normalizeString(widget?.fieldName),
      helpText: null,
    };
  }

  if (/^zip$|^zip code$|^zipcode$|^codigo postal$/.test(normalizedFieldName)) {
    return {
      id: 'recipient_zip',
      label: 'Recipient ZIP code',
      required: false,
      confidence,
      attachParentContext: false,
      fieldName: normalizeString(widget?.fieldName),
      helpText: null,
    };
  }

  return null;
}

function isFollowUpTriggerOption(option) {
  const signal = normalizeFieldName(
    [option?.label, option?.id, getOptionBindingFieldName(option)].filter(Boolean).join(' '),
  );
  return FOLLOW_UP_OPTION_PATTERN.test(signal);
}

function findQuestionOptionWidget(option, page) {
  const optionBindings = Array.isArray(option?.bindings) ? option.bindings : [];
  const directBinding = optionBindings.find(
    (binding) =>
      binding?.type === 'field_checkbox' ||
      binding?.type === 'field_radio' ||
      binding?.type === 'overlay_mark',
  );
  const fieldName = getOptionBindingFieldName(option, [page]);
  if (fieldName && directBinding?.type !== 'overlay_mark') {
    const directWidget =
      (page?.widgets || []).find(
        (widget) => normalizeFieldName(widget?.fieldName) === fieldName,
      ) || null;
    if (directWidget) {
      return directWidget;
    }
  }

  const scoredMatches = (page?.widgets || [])
    .map((widget) => ({
      widget,
      score: optionBindings.reduce((bestScore, binding) => {
        const score = scoreBindingWidgetMatch(binding, widget);
        if (score == null) return bestScore;
        return bestScore == null ? score : Math.min(bestScore, score);
      }, null),
    }))
    .filter((entry) => entry.score != null)
    .sort((left, right) => left.score - right.score);

  return scoredMatches[0]?.widget || null;
}

function buildPageSelectableQuestionEntries(questions, page) {

  return questions
    .map((question, questionIndex) => {
      const optionEntries = (question?.options || [])
        .map((option) => {
          const fieldName = getOptionBindingFieldName(option, [page]);
          const widget = findQuestionOptionWidget(option, page);
          if (!widget) return null;
          return {
            option,
            widget,
            fieldName: fieldName || normalizeFieldName(widget?.fieldName),
          };
        })
        .filter(Boolean);

      if (optionEntries.length === 0) {
        return null;
      }

      return {
        question,
        questionIndex,
        optionEntries,
        topY: Math.max(...optionEntries.map((entry) => Number(entry.widget.y || 0))),
        bottomY: Math.min(...optionEntries.map((entry) => Number(entry.widget.y || 0))),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.topY - left.topY || left.questionIndex - right.questionIndex);
}

function selectFollowUpTriggerOption(widget, optionEntries, page) {
  if (optionEntries.length === 1) {
    return optionEntries[0];
  }

  const widgetLabelTokens = new Set(
    tokenizeCheckboxLabel(
      [
        buildTextWidgetPrintedLabel(widget, page),
        widget?.fieldLabel,
        widget?.fieldName,
      ]
        .filter(Boolean)
        .join(' '),
    ).filter((token) => token !== 'fill'),
  );
  const widgetCenterX = Number(widget?.x || 0) + Number(widget?.width || 0) / 2;
  let bestEntry = null;
  let bestScore = -Infinity;

  for (const entry of optionEntries) {
    const optionSignal = [
      entry.option?.label,
      entry.option?.id,
      entry.fieldName,
    ]
      .filter(Boolean)
      .join(' ');
    const optionTokens = tokenizeCheckboxLabel(optionSignal);
    const overlapScore = optionTokens.reduce(
      (score, token) => score + (widgetLabelTokens.has(token) ? 4 : 0),
      0,
    );
    const optionCenterX =
      Number(entry.widget?.x || 0) + Number(entry.widget?.width || 0) / 2;
    const distancePenalty = Math.abs(widgetCenterX - optionCenterX) / 50;
    const specificityBonus = /\bother\b/i.test(optionSignal) ? 3 : 0;
    const score = overlapScore + specificityBonus - distancePenalty;
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }

  return bestEntry;
}

function findFollowUpParentForTextWidget(widget, questions, page) {
  const pageQuestionEntries = buildPageSelectableQuestionEntries(questions, page);
  const widgetY = Number(widget?.y || 0);
  let bestMatch = null;
  let bestScore = -Infinity;

  for (let index = 0; index < pageQuestionEntries.length; index += 1) {
    const entry = pageQuestionEntries[index];
    const nextLowerQuestionTopY =
      index < pageQuestionEntries.length - 1
        ? pageQuestionEntries[index + 1].topY
        : Number.NEGATIVE_INFINITY;
    const verticalDistance = entry.bottomY - widgetY;
    if (verticalDistance < -CHECKBOX_LABEL_WORD_TOLERANCE || verticalDistance > FOLLOW_UP_PARENT_MAX_DISTANCE) {
      continue;
    }
    if (widgetY <= nextLowerQuestionTopY + CHECKBOX_WIDGET_ROW_TOLERANCE) {
      continue;
    }

    const triggerOptions = entry.optionEntries.filter(({ option }) => isFollowUpTriggerOption(option));
    if (triggerOptions.length === 0) {
      continue;
    }

    const selectedOption = selectFollowUpTriggerOption(widget, triggerOptions, page);
    if (!selectedOption) {
      continue;
    }

    const score = 200 - verticalDistance;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        parentQuestionId: entry.question.id,
        parentOptionId: selectedOption.option?.id || null,
        parentOptionLabel: normalizeString(selectedOption.option?.label) || humanizeFieldName(selectedOption.fieldName),
      };
    }
  }

  return bestMatch;
}

function buildTriggeredShortTextQuestion(widget, page, parentContext) {
  if (!parentContext?.parentQuestionId) return null;

  const fieldName = normalizeString(widget?.fieldName);
  if (!fieldName) return null;

  const fieldLabel = buildTextWidgetPrintedLabel(widget, page);
  const triggerLabel = normalizeString(parentContext.parentOptionLabel);
  const labelPrefix = /\bother\b/i.test(triggerLabel)
    ? 'If Other selected, specify'
    : `If ${triggerLabel.replace(/\s*:\s*$/, '')} selected, specify`;

  return {
    parentQuestionId: parentContext.parentQuestionId,
    question: buildRawShortTextQuestion({
      id: `${parentContext.parentQuestionId}_${slugifyQuestionId(fieldName || fieldLabel)}`,
      label: `${labelPrefix} ${fieldLabel.replace(/\s*:\s*$/, '')}`.replace(/\s+/g, ' ').trim(),
      fieldName,
      required: false,
      helpText: null,
      confidence: 0.96,
      visibilityRule: parentContext.parentOptionId
        ? {
            parent_question_id: parentContext.parentQuestionId,
            parent_option_ids: [parentContext.parentOptionId],
          }
        : null,
    }),
    sortY: Number(widget?.y || 0),
    sortX: Number(widget?.x || 0),
  };
}

function getPrimaryShortTextFieldName(question, parsedPages = []) {
  if (question?.kind !== 'short_text') return '';
  const binding = (Array.isArray(question?.bindings) ? question.bindings : []).find(
    (candidate) => candidate?.type === 'field_text' || candidate?.type === 'overlay_text',
  );
  return resolveBindingFieldName(binding, parsedPages);
}

function buildVisibilityRuleFromParentContext(parentContext) {
  if (!parentContext?.parentQuestionId || !parentContext?.parentOptionId) {
    return null;
  }

  return {
    parent_question_id: parentContext.parentQuestionId,
    parent_option_ids: [parentContext.parentOptionId],
  };
}

function shouldAttachParentContextToDirectDefinition(fieldName, definition, widget, parentContext) {
  if (!parentContext?.parentQuestionId || !parentContext?.parentOptionId) {
    return false;
  }

  if (typeof definition?.attachParentContext === 'boolean') {
    return definition.attachParentContext;
  }

  const followUpSignal = normalizeFieldName(
    [
      fieldName,
      definition?.id,
      definition?.label,
      widget?.fieldLabel,
    ]
      .filter(Boolean)
      .join(' '),
  );

  return FOLLOW_UP_OPTION_PATTERN.test(followUpSignal);
}

function buildCanonicalTextWidgetQuestionEntry(widget, questions, page) {
  const fieldName = normalizeString(widget?.fieldName);
  const normalizedFieldName = normalizeFieldName(fieldName);
  if (!fieldName || !normalizedFieldName) return null;
  if (isExcludedAutofillFieldName(normalizedFieldName)) return null;

  const parentContext = findFollowUpParentForTextWidget(widget, questions, page);
  const definition =
    buildFieldQuestionDefinition(fieldName, widget?.fieldLabel || '') ||
    buildContextualFieldQuestionDefinition(widget, page);

  let question = null;
  if (definition) {
    question = buildRawShortTextQuestion({
      id: definition.id,
      label: definition.label,
      fieldName,
      required: definition.required,
      helpText: definition.helpText || null,
      confidence: definition.confidence,
      visibilityRule: shouldAttachParentContextToDirectDefinition(
        fieldName,
        definition,
        widget,
        parentContext,
      )
        ? buildVisibilityRuleFromParentContext(parentContext)
        : null,
    });
  } else {
    const triggeredQuestion = buildTriggeredShortTextQuestion(widget, page, parentContext);
    question = triggeredQuestion?.question || null;
  }

  if (!question) return null;

  return {
    fieldName: normalizedFieldName,
    question,
    parentQuestionId: question.visibility_rule?.parent_question_id || null,
    sortY: Number(widget?.y || 0),
    sortX: Number(widget?.x || 0),
  };
}

function mergeCanonicalShortTextQuestion(existingQuestion, canonicalQuestion) {
  return {
    ...(existingQuestion || {}),
    ...canonicalQuestion,
    required: Boolean(existingQuestion?.required || canonicalQuestion?.required),
    help_text:
      normalizeString(canonicalQuestion?.help_text || '') ||
      normalizeString(existingQuestion?.help_text || '') ||
      null,
    confidence: Math.max(
      Number(existingQuestion?.confidence || 0),
      Number(canonicalQuestion?.confidence || 0),
      0,
    ),
    bindings:
      Array.isArray(canonicalQuestion?.bindings) && canonicalQuestion.bindings.length > 0
        ? canonicalQuestion.bindings
        : Array.isArray(existingQuestion?.bindings)
          ? existingQuestion.bindings
          : [],
    options: [],
    visibility_rule: canonicalQuestion?.visibility_rule || existingQuestion?.visibility_rule || null,
  };
}

function buildCanonicalTextWidgetQuestionMap(questions, parsedPdf) {
  const canonicalQuestions = new Map();

  for (const page of parsedPdf?.pages || []) {
    const textWidgets = [...(page.widgets || [])]
      .filter((widget) => isTextWidget(widget))
      .sort(
        (left, right) =>
          Number(right.y || 0) - Number(left.y || 0) || Number(left.x || 0) - Number(right.x || 0),
      );

    for (const widget of textWidgets) {
      const entry = buildCanonicalTextWidgetQuestionEntry(widget, questions, page);
      if (!entry) continue;
      canonicalQuestions.set(entry.fieldName, entry);
    }
  }

  return canonicalQuestions;
}

function queueDependentQuestion(bucketMap, question, sortY = 0, sortX = 0, fallbackIndex = 0) {
  const parentQuestionId = normalizeString(question?.visibility_rule?.parent_question_id);
  if (!parentQuestionId) {
    return false;
  }

  const pending = bucketMap.get(parentQuestionId) || [];
  pending.push({
    question,
    sortY: Number(sortY || 0),
    sortX: Number(sortX || 0),
    fallbackIndex,
  });
  bucketMap.set(parentQuestionId, pending);
  return true;
}

function reconcileTextWidgetQuestions(output, parsedPdf) {
  const parsedPages = parsedPdf?.pages || [];
  const sourceQuestions = Array.isArray(output?.questions) ? output.questions : [];
  const canonicalQuestions = buildCanonicalTextWidgetQuestionMap(sourceQuestions, parsedPdf);
  const usedCanonicalFields = new Set();
  const seenStandaloneFieldNames = new Set();
  const baseQuestions = [];
  const pendingByParentQuestionId = new Map();

  sourceQuestions.forEach((question, index) => {
    if (question?.kind !== 'short_text') {
      baseQuestions.push(question);
      return;
    }

    const fieldName = getPrimaryShortTextFieldName(question, parsedPages);
    if (!fieldName) {
      if (!queueDependentQuestion(pendingByParentQuestionId, question, 0, 0, index)) {
        baseQuestions.push(question);
      }
      return;
    }

    const canonicalEntry = canonicalQuestions.get(fieldName);
    if (canonicalEntry) {
      if (usedCanonicalFields.has(fieldName)) {
        return;
      }

      usedCanonicalFields.add(fieldName);
      const mergedQuestion = mergeCanonicalShortTextQuestion(question, canonicalEntry.question);
      if (
        !queueDependentQuestion(
          pendingByParentQuestionId,
          mergedQuestion,
          canonicalEntry.sortY,
          canonicalEntry.sortX,
          index,
        )
      ) {
        baseQuestions.push(mergedQuestion);
      }
      return;
    }

    if (seenStandaloneFieldNames.has(fieldName)) {
      return;
    }

    seenStandaloneFieldNames.add(fieldName);
    if (!queueDependentQuestion(pendingByParentQuestionId, question, 0, 0, index)) {
      baseQuestions.push(question);
    }
  });

  for (const [fieldName, canonicalEntry] of canonicalQuestions.entries()) {
    if (usedCanonicalFields.has(fieldName)) continue;
    usedCanonicalFields.add(fieldName);
    if (
      !queueDependentQuestion(
        pendingByParentQuestionId,
        canonicalEntry.question,
        canonicalEntry.sortY,
        canonicalEntry.sortX,
        Number.MAX_SAFE_INTEGER,
      )
    ) {
      baseQuestions.push(canonicalEntry.question);
    }
  }

  const orderedQuestions = [];
  const emittedParents = new Set();

  for (const question of baseQuestions) {
    orderedQuestions.push(question);
    emittedParents.add(question.id);
    const pending = pendingByParentQuestionId.get(question.id) || [];
    if (pending.length === 0) continue;
    pending
      .sort(
        (left, right) =>
          Number(right.sortY || 0) - Number(left.sortY || 0) ||
          Number(left.sortX || 0) - Number(right.sortX || 0) ||
          Number(left.fallbackIndex || 0) - Number(right.fallbackIndex || 0),
      )
      .forEach((entry) => orderedQuestions.push(entry.question));
    pendingByParentQuestionId.delete(question.id);
  }

  const remainingPending = Array.from(pendingByParentQuestionId.values())
    .flat()
    .sort(
      (left, right) =>
        Number(right.sortY || 0) - Number(left.sortY || 0) ||
        Number(left.sortX || 0) - Number(right.sortX || 0) ||
        Number(left.fallbackIndex || 0) - Number(right.fallbackIndex || 0),
    )
    .filter((entry) => !emittedParents.has(entry.question?.id));

  return {
    ...output,
    questions: [
      ...orderedQuestions,
      ...remainingPending.map((entry) => entry.question),
    ],
  };
}

function buildSelectQuestionOptionEntries(question, parsedPages = []) {
  return (Array.isArray(question?.options) ? question.options : [])
    .map((option) => ({
      option,
      fieldName: getOptionBindingFieldName(option, parsedPages),
    }))
    .filter((entry) => entry.fieldName);
}

function collapseRedundantSelectQuestions(output, parsedPdf) {
  const questions = Array.isArray(output?.questions) ? output.questions : [];
  const parsedPages = parsedPdf?.pages || [];
  const selectEntries = questions
    .map((question, index) => ({
      question,
      index,
      optionEntries: buildSelectQuestionOptionEntries(question, parsedPages),
    }))
    .filter((entry) => entry.optionEntries.length > 0);

  const redundantQuestionRemaps = new Map();

  for (const candidate of selectEntries) {
    if (normalizeString(candidate.question?.visibility_rule?.parent_question_id)) {
      continue;
    }
    if (candidate.optionEntries.length !== 1) {
      continue;
    }

    const candidateFieldName = candidate.optionEntries[0].fieldName;
    let bestParent = null;

    for (const parent of selectEntries) {
      if (parent.index === candidate.index) continue;
      if (parent.optionEntries.length <= candidate.optionEntries.length) continue;

      const matchingParentOption = parent.optionEntries.find(
        (entry) => entry.fieldName === candidateFieldName,
      );
      if (!matchingParentOption) continue;

      const score = parent.optionEntries.length * 10 - Math.abs(parent.index - candidate.index);
      if (!bestParent || score > bestParent.score) {
        bestParent = {
          score,
          parentQuestionId: parent.question.id,
          parentOptionId: matchingParentOption.option.id,
        };
      }
    }

    if (!bestParent?.parentQuestionId || !bestParent?.parentOptionId) {
      continue;
    }

    redundantQuestionRemaps.set(slugifyQuestionId(candidate.question?.id || ''), {
      parentQuestionId: bestParent.parentQuestionId,
      parentOptionId: bestParent.parentOptionId,
    });
  }

  if (redundantQuestionRemaps.size === 0) {
    return output;
  }

  return {
    ...output,
    questions: questions
      .filter((question) => !redundantQuestionRemaps.has(slugifyQuestionId(question?.id || '')))
      .map((question) => {
        const currentVisibilityRule = question?.visibility_rule || null;
        const remappedParent = currentVisibilityRule?.parent_question_id
          ? redundantQuestionRemaps.get(slugifyQuestionId(currentVisibilityRule.parent_question_id))
          : null;
        if (!remappedParent) {
          return question;
        }

        return {
          ...question,
          visibility_rule: {
            ...currentVisibilityRule,
            parent_question_id: remappedParent.parentQuestionId,
            parent_option_ids: [remappedParent.parentOptionId],
          },
        };
      }),
  };
}

function mergeCheckboxClusterIntoQuestion(question, cluster, page) {
  const synthesizedQuestion = buildCheckboxClusterQuestion(cluster, page);
  if (!synthesizedQuestion) return question;

  const existingOptionFieldNames = buildQuestionOptionFieldNameMap(question, [page]);
  const coveredClusterFieldCount = (synthesizedQuestion.options || []).filter((option) =>
    existingOptionFieldNames.has(resolveBindingFieldName(option?.bindings?.[0], [page])),
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
            label: shouldPreferSynthesizedCheckboxOptionLabel(existingOption, option, [page])
              ? option.label
              : normalizeString(existingOption.label) || option.label,
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

  const normalizedQuestionId = slugifyQuestionId(question?.id || '');
  const mergedOptionIds = mergedOptions
    .map((option) => slugifyQuestionId(option?.id || ''))
    .filter(Boolean);
  const questionIdLooksLikeOption =
    Boolean(normalizedQuestionId) && mergedOptionIds.includes(normalizedQuestionId);
  const nextQuestionId =
    questionIdLooksLikeOption || !normalizedQuestionId
      ? synthesizedQuestion.id
      : question.id;
  const canonicalPresentation = getCanonicalCheckboxQuestionPresentation(
    question,
    synthesizedQuestion,
    [page],
  );

  return {
    ...question,
    id: nextQuestionId,
    kind: 'multi_select',
    label:
      canonicalPresentation?.label ||
      (coveredClusterFieldCount < (synthesizedQuestion.options || []).length
        ? synthesizedQuestion.label
        : normalizeString(question?.label) || synthesizedQuestion.label),
    help_text:
      canonicalPresentation?.helpText ||
      (coveredClusterFieldCount < (synthesizedQuestion.options || []).length
        ? synthesizedQuestion.help_text || null
        : normalizeString(question?.help_text || '') || synthesizedQuestion.help_text || null),
    confidence: question?.confidence || synthesizedQuestion.confidence || 0.97,
    bindings: mergedOptions.flatMap((option) => option.bindings || []),
    options: mergedOptions,
  };
}

function shouldCanonicalizeCheckboxQuestionId(question, synthesizedQuestion, parsedPages = []) {
  const normalizedQuestionId = slugifyQuestionId(question?.id || '');
  if (!normalizedQuestionId) {
    return true;
  }

  const optionSignals = new Set();
  const collectSignal = (value) => {
    const normalized = slugifyQuestionId(value || '');
    if (normalized) {
      optionSignals.add(normalized);
    }
  };

  for (const option of question?.options || []) {
    collectSignal(option?.id);
    collectSignal(option?.label);
    collectSignal(getOptionBindingFieldName(option, parsedPages));
    for (const binding of option?.bindings || []) {
      collectSignal(binding?.field_name);
    }
  }

  for (const option of synthesizedQuestion?.options || []) {
    collectSignal(option?.id);
    collectSignal(option?.label);
    collectSignal(option?.fieldName);
  }

  return optionSignals.has(normalizedQuestionId);
}

function reconcileCheckboxQuestionIds(output, parsedPdf) {
  const sourceQuestions = Array.isArray(output?.questions) ? output.questions : [];
  if (sourceQuestions.length === 0) {
    return output;
  }

  const remappedQuestionIds = new Map();

  for (const page of parsedPdf?.pages || []) {
    for (const cluster of buildCheckboxClusters(page)) {
      const clusterFieldNames = buildCheckboxFieldNameSet(cluster);
      const matchingQuestionIndex = findBestMatchingCheckboxQuestionIndex(
        sourceQuestions,
        clusterFieldNames,
        [page],
      );
      if (matchingQuestionIndex < 0) {
        continue;
      }

      const question = sourceQuestions[matchingQuestionIndex];
      const synthesizedQuestion = buildCheckboxClusterQuestion(cluster, page);
      if (!synthesizedQuestion) {
        continue;
      }

      if (!shouldCanonicalizeCheckboxQuestionId(question, synthesizedQuestion, [page])) {
        continue;
      }

      const currentQuestionId = slugifyQuestionId(question?.id || '');
      const nextQuestionId = slugifyQuestionId(synthesizedQuestion.id || '');
      if (!currentQuestionId || !nextQuestionId || currentQuestionId === nextQuestionId) {
        continue;
      }

      remappedQuestionIds.set(currentQuestionId, nextQuestionId);
    }
  }

  if (remappedQuestionIds.size === 0) {
    return output;
  }

  return {
    ...output,
    questions: sourceQuestions.map((question) => {
      const nextQuestionId = remappedQuestionIds.get(slugifyQuestionId(question?.id || '')) || null;
      const currentVisibilityRule = question?.visibility_rule || null;
      const nextParentQuestionId = currentVisibilityRule?.parent_question_id
        ? remappedQuestionIds.get(slugifyQuestionId(currentVisibilityRule.parent_question_id)) ||
          currentVisibilityRule.parent_question_id
        : null;

      return {
        ...question,
        ...(nextQuestionId ? { id: nextQuestionId } : {}),
        ...(currentVisibilityRule
          ? {
              visibility_rule: {
                ...currentVisibilityRule,
                ...(nextParentQuestionId ? { parent_question_id: nextParentQuestionId } : {}),
              },
            }
          : {}),
      };
    }),
  };
}

function findBestMatchingCheckboxQuestionIndex(questions, clusterFieldNames, parsedPages = []) {
  let bestIndex = -1;
  let bestOverlap = 0;

  questions.forEach((question, index) => {
    const overlap = getBindingFieldNames(question, parsedPages).filter((fieldName) =>
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

  if (isExcludedAutofillFieldName(normalizedFieldName)) {
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
      pattern: /^other records other specify$/,
      question: {
        id: 'release_other_details',
        label: 'If Other selected, specify which other records to release',
        attachParentContext: true,
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
    {
      pattern: /^recipients? name$/,
      question: {
        id: 'recipient_name',
        label: 'Recipient name',
        attachParentContext: false,
      },
    },
    {
      pattern: /^recipient address$/,
      question: {
        id: 'recipient_address',
        label: 'Recipient address',
        attachParentContext: false,
      },
    },
    {
      pattern: /^recipients? phone$/,
      question: {
        id: 'recipient_phone',
        label: 'Recipient phone number',
        attachParentContext: false,
      },
    },
    {
      pattern: /^recipients? fax$/,
      question: {
        id: 'recipient_fax',
        label: 'Recipient fax number',
        attachParentContext: false,
      },
    },
    {
      pattern: /^email for releases to email$/,
      question: {
        id: 'delivery_email_address',
        label: 'Email address for delivery',
        attachParentContext: true,
      },
    },
    {
      pattern: /^request dates of service$/,
      question: {
        id: 'request_dates_of_service',
        label: 'Request dates of service',
        attachParentContext: false,
      },
    },
    {
      pattern: /^facility names and addresses$/,
      question: {
        id: 'facility_names_and_addresses',
        label: 'Facility name(s) and addresses',
        attachParentContext: false,
      },
    },
    {
      pattern: /^purpose of disclosure other 3rd party recipient please specify purpose$/,
      question: {
        id: 'purpose_other_3rd_party_details',
        label: 'If Other 3rd party recipient selected, specify purpose',
        attachParentContext: true,
      },
    },
    {
      pattern: /^expiration date$/,
      question: {
        id: 'expiration_date',
        label: 'Expiration date',
        attachParentContext: false,
      },
    },
    {
      pattern: /^expiration event$/,
      question: {
        id: 'expiration_event',
        label: 'Expiration event',
        attachParentContext: false,
      },
    },
    {
      pattern: /^direct address or national provider identifier$/,
      question: {
        id: 'uscdi_direct_address_or_npi',
        label: 'Direct address or National Provider Identifier',
        helpText: 'Only needed for USCDI release requests.',
        attachParentContext: false,
      },
    },
    {
      pattern:
        /^all types of information found in the records selected above will be provided specify any information you want to exclude$/,
      question: {
        id: 'exclude_information_details',
        label: 'Specify any information you want to exclude',
        attachParentContext: false,
      },
    },
    {
      pattern:
        /^will the provider receive financial remuneration in exchange for using or disclosing this information if yes describe$/,
      question: {
        id: 'financial_remuneration_details',
        label: 'If yes, describe the financial remuneration',
        attachParentContext: false,
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
      getBindingFieldNames(question, parsedPdf?.pages || []),
    ),
  );
  const questions = [...(Array.isArray(output?.questions) ? output.questions : [])];
  const triggeredInsertions = new Map();

  for (const page of parsedPdf?.pages || []) {
    for (const cluster of buildCheckboxClusters(page)) {
      const clusterFieldNames = buildCheckboxFieldNameSet(cluster);
      const matchingQuestionIndex = findBestMatchingCheckboxQuestionIndex(
        questions,
        clusterFieldNames,
        [page],
      );

      if (matchingQuestionIndex >= 0) {
        questions[matchingQuestionIndex] = mergeCheckboxClusterIntoQuestion(
          questions[matchingQuestionIndex],
          cluster,
          page,
        );
        for (const fieldName of getBindingFieldNames(questions[matchingQuestionIndex], [page])) {
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
    const radioGroups = new Map();
    for (const widget of page?.widgets || []) {
      if (!isRadioWidget(widget) || !normalizeFieldName(widget?.fieldName)) continue;
      const groupKey = normalizeFieldName(widget.fieldName);
      const group = radioGroups.get(groupKey) || [];
      group.push(widget);
      radioGroups.set(groupKey, group);
    }

    for (const [fieldName, groupWidgets] of radioGroups.entries()) {
      if (groupWidgets.length < 2) continue;
      const synthesizedQuestion = buildRadioGroupQuestion(fieldName, groupWidgets, page);
      if (!synthesizedQuestion) continue;

      const alreadyPresent = questions.some(
        (question) =>
          normalizeFieldName(question?.label) === normalizeFieldName(synthesizedQuestion.label),
      );
      if (alreadyPresent) {
        continue;
      }

      questions.push(synthesizedQuestion);
    }
  }

  for (const page of parsedPdf?.pages || []) {
    const textWidgets = [...(page.widgets || [])]
      .filter((widget) => isTextWidget(widget))
      .sort((left, right) => Number(right.y || 0) - Number(left.y || 0) || Number(left.x || 0) - Number(right.x || 0));

    for (const widget of textWidgets) {
      const fieldName = normalizeString(widget?.fieldName);
      const normalizedFieldName = normalizeFieldName(fieldName);
      if (!fieldName || existingFieldNames.has(normalizedFieldName)) continue;
      if (isExcludedAutofillFieldName(normalizedFieldName)) continue;

      const definition =
        buildFieldQuestionDefinition(fieldName, widget?.fieldLabel || '') ||
        buildContextualFieldQuestionDefinition(widget, page);
      if (definition) {
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
        continue;
      }

      const parentContext = findFollowUpParentForTextWidget(widget, questions, page);
      if (!parentContext) continue;

      const triggeredQuestion = buildTriggeredShortTextQuestion(widget, page, parentContext);
      if (!triggeredQuestion) continue;

      const pending = triggeredInsertions.get(triggeredQuestion.parentQuestionId) || [];
      pending.push(triggeredQuestion);
      triggeredInsertions.set(triggeredQuestion.parentQuestionId, pending);
      existingFieldNames.add(normalizedFieldName);
    }
  }

  const orderedQuestions = questions.flatMap((question) => {
    const pending = triggeredInsertions.get(question.id) || [];
    const orderedPending = pending
      .sort((left, right) => right.sortY - left.sortY || left.sortX - right.sortX)
      .map((entry) => entry.question);
    return [question, ...orderedPending];
  });

  return {
    ...output,
    questions: orderedQuestions,
  };
}

export function repairPdfFormUnderstandingOutput(output, parsedPdf) {
  const rawQuestions = Array.isArray(output?.questions) ? output.questions : [];
  const splitQuestions = splitCompositeShortTextQuestions(rawQuestions);
  const widgetCompletedOutput = addMissingWidgetQuestions(
    {
      ...output,
      questions: splitQuestions,
    },
    parsedPdf,
  );
  const checkboxReconciledOutput = reconcileCheckboxQuestionIds(widgetCompletedOutput, parsedPdf);
  const textReconciledOutput = reconcileTextWidgetQuestions(checkboxReconciledOutput, parsedPdf);
  const collapsedOutput = collapseRedundantSelectQuestions(textReconciledOutput, parsedPdf);
  const visibilityHeuristicOutput = applyQuestionVisibilityHeuristics(collapsedOutput, parsedPdf);
  return filterExcludedAutofillQuestions(visibilityHeuristicOutput, parsedPdf);
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

    const enrichedOutput = repairPdfFormUnderstandingOutput(output, parsedPdf);
    const normalizedOutput = normalizePdfFormUnderstanding(enrichedOutput);
    const formUnderstanding = normalizePdfFormUnderstanding(
      repairPdfFormUnderstandingOutput(normalizedOutput, parsedPdf),
    );

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
