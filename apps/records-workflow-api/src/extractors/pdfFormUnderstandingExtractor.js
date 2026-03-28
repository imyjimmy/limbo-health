import { config } from '../config.js';
import { extractPdfFormUnderstandingWithOpenAI, isOpenAiApiError } from '../providers/openaiPdfFormUnderstandingClient.js';
import {
  buildUnsupportedAutofillPayload,
  normalizePdfFormUnderstanding,
  PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME,
  PDF_FORM_UNDERSTANDING_EXTRACTOR_VERSION,
} from '../utils/pdfFormUnderstanding.js';
import {
  collectFlatTextEntryCandidates,
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
const CONTACT_FOLLOW_UP_FIELD_PATTERN =
  /\bindividual\/organization\b|\btelephone\b|\bstreet\b|\bcity\b|\bstate\b|\bzip\b|\bfax\b|\bemail\b/i;
const FOLLOW_UP_PARENT_MAX_DISTANCE = 84;
const TEXT_FIELD_TYPE_PATTERN = /^text$/i;
const DIRECT_DEFINITION_FOLLOW_UP_IDS = new Set([
  'specify_provider_details',
  'delivery_other_details',
  'release_other_details',
  'purpose_other_details',
]);
const FLAT_TEXT_ENTRY_EXCLUDE_PATTERNS = [
  /^patient name$/,
  /^age$/,
  /^dob$/,
  /^sex$/,
  /^medical record$/,
  /^information account #$/,
  /^name of patient$/,
  /^address$/,
  /^date of birth$/,
  /^ss#$/,
  /^phone$/,
  /^date$/,
  /^time$/,
  /^date time$/,
  /^representative \(when applicable\)$/,
  /^applicable\) date$/,
  /^physician orders$/,
  /\bsignature\b/,
  /\bprinted name\b/,
  /\bmedical record\b/,
];
const FLAT_TEXT_ENTRY_INCLUDE_PATTERN =
  /\bauthorize\b|\brelease\b|\breleased\b|\brecipient\b|\bpurpose\b|\btreatment\b|\bperiod of service\b|\bprovider\b|\blocation\b|\bphysician\b|\bfacility\b|\bindividual\b|\bother\b|\bspecify\b|\brelationship\b|\bdeceased\b|\badministrator\b|\bexecutor\b|\bnext of kin\b|\bexpiration\b|\bevent\b/i;
const FLAT_TEXT_ENTRY_MAX_RECOVERED_QUESTIONS = 8;
const IMPLICIT_OTHER_FOLLOW_UP_LABEL_PATTERN =
  /\bif\b.*\bother\b.*\b(specify|specified|checked|details?|below|above)\b/i;
const EXCLUDED_AUTOFILL_FIELD_PATTERNS = [
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

function isExcludedAutofillFieldName(fieldName) {
  const normalizedFieldName = normalizeFieldName(fieldName);
  return EXCLUDED_AUTOFILL_FIELD_PATTERNS.some((pattern) => pattern.test(normalizedFieldName));
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

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanupFlatTextEntryLabel(label) {
  let normalized = normalizeString(label)
    .replace(/\|/g, ' ')
    .replace(/^[0-9]+\s+/, '')
    .replace(/^[Oo]\s+(?=[A-Z])/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const trailingWordMatch = normalized.match(/^(.*?)(?::)?\s+([A-Za-z#/-]+)$/);
  if (trailingWordMatch) {
    const prefix = normalizeString(trailingWordMatch[1]);
    const trailingWord = normalizeString(trailingWordMatch[2]);
    if (
      prefix &&
      trailingWord &&
      new RegExp(`\\b${escapeRegex(trailingWord)}\\b`, 'i').test(prefix)
    ) {
      normalized = prefix;
    }
  }

  return normalized.replace(/\s+/g, ' ').trim();
}

function canonicalizeFlatTextEntryLabel(label) {
  const cleaned = cleanupFlatTextEntryLabel(label);
  const normalized = normalizeFieldName(cleaned);
  if (!normalized) {
    return '';
  }

  if (/\bi hereby authorize\b/.test(normalized)) {
    return 'Provider or facility authorized to release information';
  }

  if (/\bperiod of service\b|\bmonth\b|\byear of treatment\b|\btreatment\b/.test(normalized)) {
    return 'Treatment period or month / year of treatment';
  }

  if (/\brelease to\b/.test(normalized)) {
    return 'Recipient of released information';
  }

  if (/\bother\b.*\bspecify\b/.test(normalized) && /\bphysician orders\b/.test(normalized)) {
    return 'If Physician Orders selected, specify details';
  }

  if (/\bother\b.*\bspecify\b/.test(normalized)) {
    return 'If Other selected, specify details';
  }

  if (/\brelationship\b|\bdeceased\b|\badministrator\b|\bexecutor\b|\bnext of kin\b/.test(normalized)) {
    return 'Relationship to the deceased';
  }

  return cleaned;
}

function shouldRecoverFlatTextEntryLabel(label) {
  const canonicalLabel = canonicalizeFlatTextEntryLabel(label);
  const normalized = normalizeFieldName(canonicalLabel);
  if (!normalized) {
    return false;
  }

  if (FLAT_TEXT_ENTRY_EXCLUDE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  if (!FLAT_TEXT_ENTRY_INCLUDE_PATTERN.test(canonicalLabel)) {
    return false;
  }

  if (/^recipient of released information$/.test(normalized)) {
    return true;
  }

  if (/^provider or facility authorized to release information$/.test(normalized)) {
    return true;
  }

  if (/^treatment period or month \/ year of treatment$/.test(normalized)) {
    return true;
  }

  return true;
}

function buildOverlayShortTextQuestion({
  id,
  label,
  pageIndex,
  x,
  y,
  width,
  height,
  confidence = 0.9,
  visibilityRule = null,
}) {
  return {
    id,
    label,
    kind: 'short_text',
    required: false,
    help_text: null,
    confidence,
    bindings: [
      {
        type: 'overlay_text',
        page_index: pageIndex,
        x,
        y,
        max_width: Number(Math.max(width || 24, 24).toFixed(2)),
        font_size: Number(Math.max((height || 18) / 1.8, 12).toFixed(2)),
      },
    ],
    options: [],
    ...(visibilityRule ? { visibility_rule: visibilityRule } : {}),
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
        binding?.type === 'field_checkbox' || binding?.type === 'overlay_mark',
    ),
    parsedPages,
  );
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

  const leftRowWords = (page?.words || [])
    .filter((word) => Math.abs(Number(word.y || 0) - Number(widget?.y || 0)) <= CHECKBOX_LABEL_WORD_TOLERANCE)
    .filter((word) => {
      const wordRight = Number(word.x || 0) + Number(word.width || 0);
      const widgetX = Number(widget?.x || 0);
      return wordRight <= widgetX - 4 && widgetX - wordRight <= 96;
    })
    .sort((left, right) => left.x - right.x);
  const leftRowLabel = buildPrintedLabel(leftRowWords);
  if (leftRowLabel) {
    return leftRowLabel;
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

function isFollowUpTriggerOption(option) {
  const signal = normalizeFieldName(
    [option?.label, option?.id, getOptionBindingFieldName(option)].filter(Boolean).join(' '),
  );
  return FOLLOW_UP_OPTION_PATTERN.test(signal);
}

function buildPageCheckboxQuestionEntries(questions, page) {
  const widgetByFieldName = new Map(
    (page?.widgets || [])
      .map((widget) => [normalizeFieldName(widget?.fieldName), widget])
      .filter(([fieldName]) => fieldName),
  );

  return questions
    .map((question, questionIndex) => {
      const optionEntries = (question?.options || [])
        .map((option) => {
          const fieldName = getOptionBindingFieldName(option, [page]);
          const widget = fieldName ? widgetByFieldName.get(fieldName) || null : null;
          if (!fieldName || !widget) return null;
          return {
            option,
            widget,
            fieldName,
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
  const pageQuestionEntries = buildPageCheckboxQuestionEntries(questions, page);
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

function buildStandaloneShortTextQuestion(widget, page) {
  const fieldName = normalizeString(widget?.fieldName);
  if (!fieldName) return null;

  const printedLabel = buildTextWidgetPrintedLabel(widget, page);
  const fieldLabel = normalizeString(widget?.fieldLabel);
  const label = printedLabel || fieldLabel || humanizeFieldName(fieldName);
  if (!label) return null;

  return buildRawShortTextQuestion({
    id: slugifyQuestionId(fieldName),
    label,
    fieldName,
    required: false,
    helpText: null,
    confidence: 0.95,
    visibilityRule: null,
  });
}

function shouldTreatTextWidgetAsFollowUp(widget, page, parentContext) {
  if (!parentContext?.parentQuestionId || !parentContext?.parentOptionId) {
    return false;
  }

  const signal = normalizeFieldName(
    [
      widget?.fieldName,
      widget?.fieldLabel,
      buildTextWidgetPrintedLabel(widget, page),
    ]
      .filter(Boolean)
      .join(' '),
  );

  if (!signal) {
    return false;
  }

  if (FOLLOW_UP_OPTION_PATTERN.test(signal)) {
    return true;
  }

  return (
    /\bother\b/i.test(parentContext?.parentOptionLabel || '') &&
    CONTACT_FOLLOW_UP_FIELD_PATTERN.test(signal)
  );
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

  if (definition?.id && !DIRECT_DEFINITION_FOLLOW_UP_IDS.has(definition.id)) {
    return false;
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
  const printedLabel = buildTextWidgetPrintedLabel(widget, page);
  const definition = buildFieldQuestionDefinition(
    fieldName,
    printedLabel || widget?.fieldLabel || '',
  );

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
    const triggeredQuestion = shouldTreatTextWidgetAsFollowUp(widget, page, parentContext)
      ? buildTriggeredShortTextQuestion(widget, page, parentContext)
      : null;
    question = triggeredQuestion?.question || buildStandaloneShortTextQuestion(widget, page);
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

function getQuestionPrimaryBindingPosition(question) {
  const bindings = [
    ...(Array.isArray(question?.bindings) ? question.bindings : []),
    ...(Array.isArray(question?.options)
      ? question.options.flatMap((option) => (Array.isArray(option?.bindings) ? option.bindings : []))
      : []),
  ];
  const binding =
    bindings.find((candidate) => Number.isFinite(candidate?.page_index)) || bindings[0] || null;
  if (!binding) {
    return {
      pageIndex: null,
      y: null,
      x: null,
    };
  }

  return {
    pageIndex: Number.isFinite(binding?.page_index) ? Number(binding.page_index) : null,
    y: Number.isFinite(binding?.y) ? Number(binding.y) : null,
    x: Number.isFinite(binding?.x) ? Number(binding.x) : null,
  };
}

function isImplicitOtherFollowUpQuestion(question) {
  if (question?.kind !== 'short_text') {
    return false;
  }
  if (question?.visibility_rule?.parent_question_id) {
    return false;
  }

  const signal = [question?.label, question?.id, question?.help_text].filter(Boolean).join(' ');
  return IMPLICIT_OTHER_FOLLOW_UP_LABEL_PATTERN.test(signal);
}

function findImplicitOtherParentQuestion(questions, childIndex) {
  const childQuestion = questions[childIndex];
  const childPosition = getQuestionPrimaryBindingPosition(childQuestion);
  let bestParent = null;
  let bestScore = -Infinity;

  for (let index = childIndex - 1; index >= 0; index -= 1) {
    const candidate = questions[index];
    if (!candidate || !['multi_select', 'single_select'].includes(candidate.kind)) {
      continue;
    }

    const otherOption = (Array.isArray(candidate.options) ? candidate.options : []).find((option) =>
      /\bother\b/i.test(`${option?.label || ''} ${option?.id || ''}`),
    );
    if (!otherOption?.id) {
      continue;
    }

    const candidatePosition = getQuestionPrimaryBindingPosition(candidate);
    let score = 1000 - (childIndex - index);

    if (
      childPosition.pageIndex != null &&
      candidatePosition.pageIndex != null &&
      childPosition.pageIndex !== candidatePosition.pageIndex
    ) {
      score -= 500;
    }

    if (childPosition.y != null && candidatePosition.y != null) {
      score -= Math.abs(childPosition.y - candidatePosition.y) / 10;
    }

    if (score > bestScore) {
      bestScore = score;
      bestParent = {
        parentQuestionId: candidate.id,
        parentOptionId: otherOption.id,
      };
    }
  }

  return bestParent;
}

function attachImplicitOtherFollowUps(output) {
  const questions = Array.isArray(output?.questions) ? output.questions : [];
  if (questions.length === 0) {
    return output;
  }

  return {
    ...output,
    questions: questions.map((question, index) => {
      if (!isImplicitOtherFollowUpQuestion(question)) {
        return question;
      }

      const parent = findImplicitOtherParentQuestion(questions, index);
      if (!parent?.parentQuestionId || !parent?.parentOptionId) {
        return question;
      }

      return {
        ...question,
        visibility_rule: {
          parent_question_id: parent.parentQuestionId,
          parent_option_ids: [parent.parentOptionId],
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

  return {
    ...question,
    id: nextQuestionId,
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

function isSingletonCheckboxQuestion(question) {
  if (question?.kind !== 'single_select') {
    return false;
  }
  if (question?.visibility_rule?.parent_question_id) {
    return false;
  }

  const options = Array.isArray(question?.options) ? question.options : [];
  if (options.length !== 1) {
    return false;
  }

  return Boolean(getOptionBindingFieldName(options[0]));
}

function hasDependentQuestions(questionId, questions = []) {
  const normalizedQuestionId = slugifyQuestionId(questionId || '');
  if (!normalizedQuestionId) {
    return false;
  }

  return questions.some((question) => {
    const parentQuestionId = slugifyQuestionId(question?.visibility_rule?.parent_question_id || '');
    return parentQuestionId === normalizedQuestionId;
  });
}

function absorbSingletonCheckboxQuestions(output, parsedPdf) {
  const sourceQuestions = Array.isArray(output?.questions) ? output.questions : [];
  if (sourceQuestions.length === 0) {
    return output;
  }

  const questions = [...sourceQuestions];
  const absorbedQuestionIndexes = new Set();
  const parentRemap = new Map();

  for (const page of parsedPdf?.pages || []) {
    const pageEntries = buildPageCheckboxQuestionEntries(questions, page)
      .filter((entry) => entry?.question?.kind === 'multi_select');
    const widgetsByFieldName = new Map(
      (page?.widgets || [])
        .map((widget) => [normalizeFieldName(widget?.fieldName), widget])
        .filter(([fieldName]) => fieldName),
    );

    questions.forEach((question, index) => {
      if (absorbedQuestionIndexes.has(index) || !isSingletonCheckboxQuestion(question)) {
        return;
      }
      if (hasDependentQuestions(question?.id, questions)) {
        return;
      }

      const option = question.options[0];
      const fieldName = getOptionBindingFieldName(option, [page]);
      const singletonWidget = fieldName ? widgetsByFieldName.get(fieldName) || null : null;
      if (!fieldName || !singletonWidget) {
        return;
      }

      let bestEntry = null;
      let bestScore = -Infinity;

      for (const entry of pageEntries) {
        const existingOptionsByField = buildQuestionOptionFieldNameMap(entry.question, [page]);
        if (existingOptionsByField.has(fieldName)) {
          continue;
        }

        const singletonY = Number(singletonWidget.y || 0);
        const topY = Number(entry.topY || 0);
        const bottomY = Number(entry.bottomY || 0);
        const withinBand = singletonY <= topY + CHECKBOX_WIDGET_ROW_TOLERANCE &&
          singletonY >= bottomY - CHECKBOX_WIDGET_ROW_TOLERANCE;
        const verticalDistance =
          singletonY > topY
            ? singletonY - topY
            : singletonY < bottomY
              ? bottomY - singletonY
              : 0;
        const score = (withinBand ? 200 : 0) - verticalDistance;

        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
        }
      }

      if (!bestEntry || bestScore < -24) {
        return;
      }

      const parentQuestion = questions[bestEntry.questionIndex];
      const existingOptionsByField = buildQuestionOptionFieldNameMap(parentQuestion, [page]);
      let mergedParentQuestion = parentQuestion;

      if (!existingOptionsByField.has(fieldName)) {
        mergedParentQuestion = {
          ...mergedParentQuestion,
          bindings: [...(mergedParentQuestion.bindings || []), ...(option.bindings || [])],
          options: [...(mergedParentQuestion.options || []), option],
        };
      }

      questions[bestEntry.questionIndex] = mergedParentQuestion;
      absorbedQuestionIndexes.add(index);
      parentRemap.set(question.id, {
        parentQuestionId: mergedParentQuestion.id,
        parentOptionId: option.id,
      });
    });
  }

  const nextQuestions = questions
    .filter((_question, index) => !absorbedQuestionIndexes.has(index))
    .map((question) => {
      const currentVisibilityRule = question?.visibility_rule || null;
      if (!currentVisibilityRule?.parent_question_id) {
        return question;
      }

      const remappedParent = parentRemap.get(currentVisibilityRule.parent_question_id);
      if (!remappedParent?.parentQuestionId) {
        return question;
      }

      const existingOptionIds = Array.isArray(currentVisibilityRule.parent_option_ids)
        ? currentVisibilityRule.parent_option_ids.filter(Boolean)
        : [];
      const nextOptionIds =
        existingOptionIds.length === 0 ||
        existingOptionIds.includes(currentVisibilityRule.parent_question_id)
          ? [remappedParent.parentOptionId]
          : existingOptionIds;

      return {
        ...question,
        visibility_rule: {
          ...currentVisibilityRule,
          parent_question_id: remappedParent.parentQuestionId,
          parent_option_ids: nextOptionIds,
        },
      };
    });

  return {
    ...output,
    questions: nextQuestions,
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

function isProviderLocationSignal(value) {
  return /\bprovider\b|\blocation\b/.test(
    normalizeFieldName(normalizeString(value)),
  );
}

function remapSplitQuestionVisibility(question, originalQuestion, splitQuestions, page) {
  const currentVisibilityRule = question?.visibility_rule || null;
  const questionSignal = [question?.label, question?.id, question?.help_text].filter(Boolean).join(' ');

  if (
    currentVisibilityRule?.parent_question_id &&
    normalizeString(currentVisibilityRule.parent_question_id) === normalizeString(originalQuestion?.id)
  ) {
    const parentOptionIds = Array.isArray(currentVisibilityRule.parent_option_ids)
      ? currentVisibilityRule.parent_option_ids.filter(Boolean)
      : [];
    const matchedParent = splitQuestions.find((candidate) =>
      (candidate.options || []).some((option) => parentOptionIds.includes(option?.id)),
    );
    if (matchedParent) {
      return {
        ...question,
        visibility_rule: {
          ...currentVisibilityRule,
          parent_question_id: matchedParent.id,
        },
      };
    }
  }

  if (!currentVisibilityRule?.parent_question_id && isProviderLocationSignal(questionSignal)) {
    const matchedParent = splitQuestions.find((candidate) =>
      (candidate.options || []).some((option) =>
        isProviderLocationSignal([option?.label, option?.id].filter(Boolean).join(' ')),
      ),
    );
    if (matchedParent) {
      const matchedOption = (matchedParent.options || []).find((option) =>
        isProviderLocationSignal([option?.label, option?.id].filter(Boolean).join(' ')),
      );
      return {
        ...question,
        visibility_rule: matchedOption?.id
          ? {
              parent_question_id: matchedParent.id,
              parent_option_ids: [matchedOption.id],
            }
          : {
              parent_question_id: matchedParent.id,
              parent_option_ids: [],
            },
      };
    }
  }

  return question;
}

function splitMergedCheckboxClusterQuestions(output, parsedPdf) {
  const sourceQuestions = Array.isArray(output?.questions) ? output.questions : [];
  if (sourceQuestions.length === 0) {
    return output;
  }

  let questions = [...sourceQuestions];

  for (const page of parsedPdf?.pages || []) {
    const clusterEntries = buildCheckboxClusters(page)
      .map((cluster) => {
        const synthesizedQuestion = buildCheckboxClusterQuestion(cluster, page);
        if (!synthesizedQuestion) {
          return null;
        }

        return {
          cluster,
          synthesizedQuestion,
          fieldNames: buildCheckboxFieldNameSet(cluster),
          topY: Math.max(...cluster.map((widget) => Number(widget.y || 0))),
        };
      })
      .filter(Boolean);

    if (clusterEntries.length < 2) {
      continue;
    }

    const matchedClustersByQuestionIndex = new Map();
    for (const entry of clusterEntries) {
      const matchedQuestionIndex = findBestMatchingCheckboxQuestionIndex(
        questions,
        entry.fieldNames,
        [page],
      );
      if (matchedQuestionIndex < 0) {
        continue;
      }

      const matchedQuestion = questions[matchedQuestionIndex];
      if (matchedQuestion?.kind !== 'multi_select') {
        continue;
      }

      const questionFieldNames = new Set(getBindingFieldNames(matchedQuestion, [page]));
      const overlapCount = Array.from(entry.fieldNames).filter((fieldName) =>
        questionFieldNames.has(fieldName),
      ).length;
      if (overlapCount < Math.min(entry.fieldNames.size, CHECKBOX_GROUP_MIN_SIZE)) {
        continue;
      }

      const existingEntries = matchedClustersByQuestionIndex.get(matchedQuestionIndex) || [];
      existingEntries.push(entry);
      matchedClustersByQuestionIndex.set(matchedQuestionIndex, existingEntries);
    }

    if (matchedClustersByQuestionIndex.size === 0) {
      continue;
    }

    const nextQuestions = [];
    questions.forEach((question, questionIndex) => {
      const matchedEntries = matchedClustersByQuestionIndex.get(questionIndex) || [];
      if (matchedEntries.length < 2 || question?.kind !== 'multi_select') {
        nextQuestions.push(question);
        return;
      }

      const splitQuestions = matchedEntries
        .sort((left, right) => right.topY - left.topY)
        .map((entry) => {
          const options = (question.options || []).filter((option) =>
            entry.fieldNames.has(getOptionBindingFieldName(option, [page])),
          );
          if (options.length < CHECKBOX_GROUP_MIN_SIZE) {
            return null;
          }

          return {
            ...question,
            id: entry.synthesizedQuestion.id,
            label: entry.synthesizedQuestion.label,
            help_text:
              normalizeString(entry.synthesizedQuestion.help_text || '') ||
              normalizeString(question?.help_text || '') ||
              null,
            bindings: options.flatMap((option) => option.bindings || []),
            options,
          };
        })
        .filter(Boolean);

      if (splitQuestions.length < 2) {
        nextQuestions.push(question);
        return;
      }

      nextQuestions.push(...splitQuestions);
    });

    questions = nextQuestions.map((question) => {
      for (const [questionIndex, matchedEntries] of matchedClustersByQuestionIndex.entries()) {
        if (matchedEntries.length < 2) {
          continue;
        }

        const originalQuestion = sourceQuestions[questionIndex];
        if (!originalQuestion) {
          continue;
        }

        const splitQuestions = nextQuestions.filter((candidate) =>
          matchedEntries.some((entry) => candidate?.id === entry.synthesizedQuestion.id),
        );
        if (splitQuestions.length < 2) {
          continue;
        }

        const remappedQuestion = remapSplitQuestionVisibility(
          question,
          originalQuestion,
          splitQuestions,
          page,
        );
        if (remappedQuestion !== question) {
          return remappedQuestion;
        }
      }

      return question;
    });
  }

  return {
    ...output,
    questions,
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
  const normalizedFieldLabel = normalizeFieldName(fieldLabel);
  const fieldSignal = `${normalizedFieldName} ${normalizedFieldLabel}`.trim();

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

  if (/^pt initials(?:_\d+)?$/.test(normalizedFieldName) || /^pt initials(?:_\d+)?$/.test(normalizedFieldLabel)) {
    const sensitiveLabelMatches = [
      {
        pattern: /\balcohol\b|\bdrug\b/,
        id: 'alcohol_drug_initials',
        question: 'If applicable, enter patient initials for Alcohol/Drug information',
      },
      {
        pattern: /\bgenetic/,
        id: 'genetics_initials',
        question: 'If applicable, enter patient initials for Genetics information',
      },
      {
        pattern: /\bhiv\b|\baids\b/,
        id: 'hiv_initials',
        question: 'If applicable, enter patient initials for HIV/AIDS information',
      },
      {
        pattern: /\bmental\b|\bpsychiatric\b/,
        id: 'mental_health_initials',
        question: 'If applicable, enter patient initials for Mental Health information',
      },
    ];

    const sensitiveMatch = sensitiveLabelMatches.find(({ pattern }) => pattern.test(fieldSignal));
    if (sensitiveMatch) {
      return {
        id: sensitiveMatch.id,
        label: sensitiveMatch.question,
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
    const textWidgets = [...(page.widgets || [])]
      .filter((widget) => isTextWidget(widget))
      .sort((left, right) => Number(right.y || 0) - Number(left.y || 0) || Number(left.x || 0) - Number(right.x || 0));

    for (const widget of textWidgets) {
      const fieldName = normalizeString(widget?.fieldName);
      const normalizedFieldName = normalizeFieldName(fieldName);
      if (!fieldName || existingFieldNames.has(normalizedFieldName)) continue;
      if (isExcludedAutofillFieldName(normalizedFieldName)) continue;

      const definition = buildFieldQuestionDefinition(fieldName, widget?.fieldLabel || '');
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

function isFlatOverlayPdf(parsedPdf) {
  const pages = Array.isArray(parsedPdf?.pages) ? parsedPdf.pages : [];
  const widgetCount = pages.reduce(
    (count, page) => count + (Array.isArray(page?.widgets) ? page.widgets.length : 0),
    0,
  );
  return widgetCount === 0;
}

function buildOverlayQuestionMatchKey(question) {
  return normalizeFieldName(
    canonicalizeFlatTextEntryLabel(question?.label || question?.help_text || ''),
  );
}

function isOverlayBindingNearCandidate(binding, candidate) {
  if (binding?.type !== 'overlay_text') {
    return false;
  }

  const candidatePageIndex = Number(candidate?.pageIndex);
  const bindingPageIndex = Number(binding?.page_index);
  if (!Number.isFinite(candidatePageIndex) || !Number.isFinite(bindingPageIndex)) {
    return false;
  }
  if (candidatePageIndex != bindingPageIndex) {
    return false;
  }

  const xDelta = Math.abs(Number(binding?.x || 0) - Number(candidate?.x || 0));
  const yDelta = Math.abs(Number(binding?.y || 0) - Number(candidate?.y || 0));
  return xDelta <= 24 && yDelta <= 18;
}

function questionAlreadyCoversFlatTextEntry(question, candidate, canonicalLabel) {
  const normalizedLabel = normalizeFieldName(canonicalLabel);
  if (!normalizedLabel) {
    return false;
  }

  if (buildOverlayQuestionMatchKey(question) === normalizedLabel) {
    return true;
  }

  const bindings = [
    ...(Array.isArray(question?.bindings) ? question.bindings : []),
    ...(Array.isArray(question?.options)
      ? question.options.flatMap((option) => (Array.isArray(option?.bindings) ? option.bindings : []))
      : []),
  ];

  return bindings.some((binding) => isOverlayBindingNearCandidate(binding, candidate));
}

function ensureUniqueQuestionId(baseId, questions) {
  const normalizedBaseId = slugifyQuestionId(baseId) || 'overlay-question';
  const existingIds = new Set((questions || []).map((question) => normalizeString(question?.id)).filter(Boolean));
  if (!existingIds.has(normalizedBaseId)) {
    return normalizedBaseId;
  }

  let suffix = 2;
  while (existingIds.has(`${normalizedBaseId}-${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBaseId}-${suffix}`;
}

function insertQuestionByVisualPosition(questions, question) {
  const questionPosition = getQuestionPrimaryBindingPosition(question);
  if (questionPosition.pageIndex == null || questionPosition.y == null) {
    questions.push(question);
    return questions;
  }

  const insertionIndex = questions.findIndex((candidate) => {
    const candidatePosition = getQuestionPrimaryBindingPosition(candidate);
    if (candidatePosition.pageIndex == null || candidatePosition.y == null) {
      return false;
    }
    if (candidatePosition.pageIndex !== questionPosition.pageIndex) {
      return candidatePosition.pageIndex > questionPosition.pageIndex;
    }
    if (Math.abs(candidatePosition.y - questionPosition.y) > 8) {
      return candidatePosition.y < questionPosition.y;
    }
    return (candidatePosition.x ?? 0) > (questionPosition.x ?? 0);
  });

  if (insertionIndex < 0) {
    questions.push(question);
    return questions;
  }

  questions.splice(insertionIndex, 0, question);
  return questions;
}

function addRecoveredFlatTextEntryQuestions(output, parsedPdf, promptProfile = undefined) {
  if (!isFlatOverlayPdf(parsedPdf)) {
    return output;
  }

  const sourceQuestions = Array.isArray(output?.questions) ? output.questions : [];
  const { candidates } = collectFlatTextEntryCandidates(parsedPdf, promptProfile);
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return output;
  }

  const nextQuestions = [...sourceQuestions];
  let recoveredCount = 0;

  for (const candidate of candidates) {
    if (recoveredCount >= FLAT_TEXT_ENTRY_MAX_RECOVERED_QUESTIONS) {
      break;
    }

    const canonicalLabel = canonicalizeFlatTextEntryLabel(candidate?.label || '');
    if (!shouldRecoverFlatTextEntryLabel(canonicalLabel)) {
      continue;
    }

    if (nextQuestions.some((question) => questionAlreadyCoversFlatTextEntry(question, candidate, canonicalLabel))) {
      continue;
    }

    const question = buildOverlayShortTextQuestion({
      id: ensureUniqueQuestionId(canonicalLabel, nextQuestions),
      label: canonicalLabel,
      pageIndex: Number(candidate?.pageIndex || 0),
      x: Number(candidate?.x || 0),
      y: Number(candidate?.y || 0),
      width: Number(candidate?.width || 0),
      height: Number(candidate?.height || 0),
      confidence: 0.9,
    });
    insertQuestionByVisualPosition(nextQuestions, question);
    recoveredCount += 1;
  }

  return {
    ...output,
    questions: nextQuestions,
  };
}

export function repairPdfFormUnderstandingOutput(output, parsedPdf, options = {}) {
  const rawQuestions = Array.isArray(output?.questions) ? output.questions : [];
  const splitQuestions = splitCompositeShortTextQuestions(rawQuestions);
  const widgetCompletedOutput = addMissingWidgetQuestions(
    {
      ...output,
      questions: splitQuestions,
    },
    parsedPdf,
  );
  const flatRecoveredOutput = addRecoveredFlatTextEntryQuestions(
    widgetCompletedOutput,
    parsedPdf,
    options?.promptProfile,
  );
  const checkboxReconciledOutput = reconcileCheckboxQuestionIds(flatRecoveredOutput, parsedPdf);
  const clusterSplitOutput = splitMergedCheckboxClusterQuestions(
    checkboxReconciledOutput,
    parsedPdf,
  );
  const checkboxAbsorbedOutput = absorbSingletonCheckboxQuestions(clusterSplitOutput, parsedPdf);
  const followUpReconciledOutput = attachImplicitOtherFollowUps(checkboxAbsorbedOutput);

  return reconcileTextWidgetQuestions(followUpReconciledOutput, parsedPdf);
}

export function preparePdfFormUnderstandingExtraction(options) {
  return preparePdfFormUnderstandingRequest({
    ...options,
    promptProfile: options.promptProfile,
    maxInputTokens: options.maxInputTokens || DEFAULT_MAX_INPUT_TOKENS,
  });
}

export async function extractPdfFormUnderstanding({
  parsedPdf,
  hospitalSystemName,
  facilityName = null,
  formName,
  sourceUrl,
  promptProfile = undefined,
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

    const enrichedOutput = repairPdfFormUnderstandingOutput(output, parsedPdf, {
      promptProfile: requestPlan.promptMetadata.prompt_profile,
    });
    const normalizedOutput = normalizePdfFormUnderstanding(enrichedOutput);
    const formUnderstanding = normalizePdfFormUnderstanding(
      repairPdfFormUnderstandingOutput(normalizedOutput, parsedPdf, {
        promptProfile: requestPlan.promptMetadata.prompt_profile,
      }),
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
