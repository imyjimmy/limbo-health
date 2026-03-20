import { MIN_AUTOFILL_CONFIDENCE } from './pdfFormUnderstanding.js';

export const DEFAULT_PROMPT_PROFILE = 'compact';
export const DEFAULT_MAX_INPUT_TOKENS = 12000;
export const DEFAULT_ESTIMATED_OUTPUT_TOKENS = 1200;

const ESTIMATED_CHARS_PER_TOKEN = 4;
const REGION_KEYWORDS = [
  'type of records',
  'records requested',
  'what kind of records',
  'purpose',
  'continued care',
  'released to',
  'release to',
  'release the following information',
  'record copy delivery',
  'delivery',
  'fax',
  'mail',
  'email',
  'provider',
  'clinic visits',
  'hospital visits',
  'patient designee',
  'health care entity',
  'insurance company',
  'attorney',
  'summary abstract',
  'clinic notes',
  'discharge summary',
  'history and physical',
  'operative reports',
  'progress notes',
  'radiology',
  'laboratory',
  'billing record',
  'complete chart',
  'immunization',
  'alcohol',
  'genetics',
  'hiv',
  'mental health',
  'date range',
  'from',
  'to',
  'other',
  'initial',
  'check all that apply',
  'circle one',
];

const BIO_WIDGET_PATTERNS = [
  /\bpatient name\b/,
  /\bdate of birth\b/,
  /\bdob\b/,
  /\bsocial security\b/,
  /\bssn\b/,
  /\blast 4\b/,
  /\bpatient street\b/,
  /\bpatient city\b/,
  /\bpatient zip\b/,
  /\bpatient telephone\b/,
  /\bpatient email\b/,
  /\bacct\b/,
  /\bmrn\b/,
];

const SIGNATURE_WIDGET_PATTERNS = [
  /\bsignature\b/,
  /\bprinted name of patient or legal representative\b/,
  /\brelationship to patient\b/,
  /\bauthority to act for patient\b/,
];

const QUESTION_WIDGET_PATTERNS = [
  /^patient$/,
  /^healthcareentity$/,
  /^insuranceco$/,
  /^attorney$/,
  /^continuedcare$/,
  /^personaluse$/,
  /^othercheck$/,
  /\bexpiration\b/,
  /\breleased to\b/,
  /\brelease to\b/,
  /\bindividual organization\b/,
  /\bcontinued care\b/,
  /\blegal\b/,
  /\binsurance\b/,
  /\bpersonal use\b/,
  /\bdelivery\b/,
  /\bfax\b/,
  /\bmail\b/,
  /\bmybswhealth\b/,
  /\bclinic visits\b/,
  /\bhospital visits\b/,
  /\bspecify provider\b/,
  /\btreatment date\b/,
  /\balcohol\b/,
  /\bgenetics\b/,
  /\bhiv\b/,
  /\bmental health\b/,
  /\bsummary\b/,
  /\bsummaryabstractonly\b/,
  /\bclinic notes\b/,
  /\bclinicnotes\b/,
  /\bconsultations\b/,
  /\blab\b/,
  /\blaboratory\b/,
  /\bradiology\b/,
  /\bdischarge summary\b/,
  /\bed\b/,
  /\bmedication\b/,
  /\bbilling record\b/,
  /\bhistory\b/,
  /\boperative\b/,
  /\bcomplete chart\b/,
  /\bimmunization\b/,
  /\bprogress notes\b/,
  /\brelease info\b/,
  /\bother\b/,
];

function matchesRegionKeyword(text) {
  return REGION_KEYWORDS.some((keyword) => {
    if (keyword.length <= 4) {
      return text === keyword;
    }
    return text.includes(keyword);
  });
}

export const PDF_FORM_PROMPT_PROFILES = {
  expanded: {
    maxPages: 4,
    maxWidgets: 56,
    maxCheckboxCandidates: 40,
    maxLineCandidates: 28,
    maxKeywordAnchors: 16,
    maxLabelSnippets: 36,
    maxSnippetChars: 260,
    anchorPadX: 80,
    anchorPadY: 30,
    minLineWidth: 18,
    includeTextExcerpt: true,
    maxTextChars: 2200,
    maxHeaderChars: 400,
  },
  compact: {
    maxPages: 3,
    maxWidgets: 32,
    maxCheckboxCandidates: 24,
    maxLineCandidates: 20,
    maxKeywordAnchors: 12,
    maxLabelSnippets: 20,
    maxSnippetChars: 180,
    anchorPadX: 72,
    anchorPadY: 28,
    minLineWidth: 20,
    includeTextExcerpt: false,
    maxTextChars: 0,
    maxHeaderChars: 320,
  },
  minimal: {
    maxPages: 2,
    maxWidgets: 20,
    maxCheckboxCandidates: 16,
    maxLineCandidates: 12,
    maxKeywordAnchors: 8,
    maxLabelSnippets: 12,
    maxSnippetChars: 140,
    anchorPadX: 64,
    anchorPadY: 24,
    minLineWidth: 24,
    includeTextExcerpt: false,
    maxTextChars: 0,
    maxHeaderChars: 240,
  },
};

const PROMPT_PROFILE_FALLBACKS = {
  expanded: ['expanded', 'compact', 'minimal'],
  compact: ['compact', 'minimal'],
  minimal: ['minimal'],
};

function normalizePromptProfile(value) {
  if (value === 'expanded' || value === 'compact' || value === 'minimal') {
    return value;
  }
  return DEFAULT_PROMPT_PROFILE;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function compactWhitespace(value) {
  return normalizeString(value).replace(/\s+/g, ' ').trim();
}

function truncate(value, maxChars) {
  const normalized = compactWhitespace(value);
  if (!normalized || !Number.isFinite(maxChars) || maxChars <= 0) {
    return '';
  }

  return normalized.length <= maxChars ? normalized : `${normalized.slice(0, maxChars - 1)}...`;
}

function normalizeWidgetText(widget) {
  return compactWhitespace(`${widget?.fieldName || ''} ${widget?.fieldLabel || ''}`).toLowerCase();
}

function sortWords(words) {
  return [...words].sort((left, right) => {
    const yDelta = Number(left.y || 0) - Number(right.y || 0);
    if (Math.abs(yDelta) > 4) return yDelta;
    return Number(left.x || 0) - Number(right.x || 0);
  });
}

function sortByVisualOrder(items) {
  return [...items].sort((left, right) => {
    const yDelta = Number(right?.y || 0) - Number(left?.y || 0);
    if (Math.abs(yDelta) > 4) return yDelta;
    return Number(left?.x || 0) - Number(right?.x || 0);
  });
}

function matchesAnyPattern(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function toRect(item, padX, padY) {
  const x = Number(item?.x || 0);
  const y = Number(item?.y || 0);
  const width = Number(item?.width || item?.size || 0);
  const height = Number(item?.height || item?.size || 0);

  return {
    left: x - padX,
    top: y - padY,
    right: x + width + padX,
    bottom: y + height + padY,
  };
}

function intersectsWord(word, rect) {
  const x = Number(word?.x || 0);
  const y = Number(word?.y || 0);
  const width = Number(word?.width || 0);
  const height = Number(word?.height || 0);
  const left = x;
  const top = y;
  const right = x + width;
  const bottom = y + height;

  return !(right < rect.left || left > rect.right || bottom < rect.top || top > rect.bottom);
}

function findKeywordAnchors(words, limit) {
  const anchors = [];

  for (const word of words || []) {
    const text = compactWhitespace(word?.text || '').toLowerCase();
    if (!text) continue;

    if (!matchesRegionKeyword(text)) {
      continue;
    }

    anchors.push({
      x: Number(word.x || 0),
      y: Number(word.y || 0),
      width: Number(word.width || 0),
      height: Number(word.height || 0),
      source: 'keyword',
    });

    if (anchors.length >= limit) break;
  }

  return anchors;
}

function buildSnippet(words, maxChars) {
  const text = truncate(
    sortWords(words)
      .map((word) => compactWhitespace(word?.text || ''))
      .filter(Boolean)
      .join(' '),
    maxChars,
  );

  if (!text) return null;

  const xs = words.map((word) => Number(word.x || 0));
  const ys = words.map((word) => Number(word.y || 0));
  return {
    text,
    x: Math.min(...xs),
    y: Math.min(...ys),
  };
}

function countNearbyKeywordWords(page, item, profile) {
  const rect = toRect(item, Math.max(profile.anchorPadX - 12, 24), Math.max(profile.anchorPadY - 8, 16));
  let count = 0;

  for (const word of page.words || []) {
    if (!intersectsWord(word, rect)) continue;

    const text = compactWhitespace(word?.text || '').toLowerCase();
    if (text && matchesRegionKeyword(text)) {
      count += 1;
    }
  }

  return count;
}

function buildNearbyText(page, item, profile, maxChars = 180) {
  const rect = toRect(item, Math.max(profile.anchorPadX, 72), Math.max(profile.anchorPadY, 20));
  const nearbyWords = sortWords((page.words || []).filter((word) => intersectsWord(word, rect)));

  return truncate(
    nearbyWords
      .map((word) => compactWhitespace(word?.text || ''))
      .filter(Boolean)
      .join(' '),
    maxChars,
  ).toLowerCase();
}

function buildLabelSnippets(page, anchors, profile) {
  const snippets = [];
  const seenText = new Set();

  for (const anchor of anchors) {
    const rect = toRect(anchor, profile.anchorPadX, profile.anchorPadY);
    const nearbyWords = (page.words || []).filter((word) => intersectsWord(word, rect));
    if (!nearbyWords.length) continue;

    const snippet = buildSnippet(nearbyWords, profile.maxSnippetChars);
    if (!snippet || !snippet.text || seenText.has(snippet.text)) {
      continue;
    }

    seenText.add(snippet.text);
    snippets.push(snippet);

    if (snippets.length >= profile.maxLabelSnippets) {
      break;
    }
  }

  return snippets;
}

function toWidgetPayload(widget) {
  return {
    field_name: normalizeString(widget?.fieldName) || null,
    field_label: normalizeString(widget?.fieldLabel) || null,
    field_type: normalizeString(widget?.fieldType) || null,
    choice_values: Array.isArray(widget?.choiceValues)
      ? widget.choiceValues.map((value) => normalizeString(value)).filter(Boolean)
      : [],
    x: Number(widget?.x || 0),
    y: Number(widget?.y || 0),
    width: Number(widget?.width || 0),
    height: Number(widget?.height || 0),
  };
}

function toCandidatePayload(candidate) {
  return {
    x: Number(candidate?.x || 0),
    y: Number(candidate?.y || 0),
    width: Number(candidate?.width || candidate?.size || 0),
    height: Number(candidate?.height || candidate?.size || 0),
    shape: normalizeString(candidate?.shape) || null,
  };
}

function scoreWidget(page, widget) {
  const widgetType = normalizeString(widget?.fieldType).toLowerCase();
  const normalizedText = normalizeWidgetText(widget);
  const nearbyText = buildNearbyText(page, widget, {
    anchorPadX: 72,
    anchorPadY: 24,
  });
  const semanticText = compactWhitespace(`${nearbyText} ${normalizedText}`).toLowerCase();
  const pageHeight = Math.max(Number(page?.height || 0), 1);
  const relativeHeight = 1 - Number(widget?.y || 0) / pageHeight;
  const keywordHits = countNearbyKeywordWords(page, widget, {
    anchorPadX: 64,
    anchorPadY: 24,
  });

  let score = 0;

  if (widgetType === 'button') {
    return -500;
  }

  if (widgetType === 'signature') {
    return -250;
  }

  if (widgetType === 'checkbox' || widgetType === 'radio') {
    score += 80;
  } else if (widgetType === 'text' || widgetType === 'choice') {
    score += 20;
  }

  if (matchesAnyPattern(semanticText, QUESTION_WIDGET_PATTERNS)) {
    score += 60;
  }

  if (matchesAnyPattern(normalizedText, QUESTION_WIDGET_PATTERNS)) {
    score += 10;
  }

  if (matchesAnyPattern(semanticText, BIO_WIDGET_PATTERNS)) {
    score -= 45;
  }

  if (matchesAnyPattern(normalizedText, BIO_WIDGET_PATTERNS)) {
    score -= 10;
  }

  if (matchesAnyPattern(semanticText, SIGNATURE_WIDGET_PATTERNS)) {
    score -= 120;
  }

  if (matchesAnyPattern(normalizedText, SIGNATURE_WIDGET_PATTERNS)) {
    score -= 20;
  }

  score += keywordHits * 24;
  score += Math.round(relativeHeight * 25);
  return score;
}

function scoreCandidate(page, candidate, profile) {
  const pageHeight = Math.max(Number(page?.height || 0), 1);
  const relativeHeight = 1 - Number(candidate?.y || 0) / pageHeight;
  const keywordHits = countNearbyKeywordWords(page, candidate, profile);
  const width = Number(candidate?.width || candidate?.size || 0);

  return keywordHits * 30 + Math.round(relativeHeight * 18) + Math.min(Math.round(width / 24), 8);
}

function getVerticalBandKey(page, item) {
  const pageHeight = Math.max(Number(page?.height || 0), 1);
  const normalizedY = Number(item?.y || 0) / pageHeight;

  if (normalizedY >= 0.72) return 'top';
  if (normalizedY >= 0.52) return 'upper';
  if (normalizedY >= 0.32) return 'middle';
  return 'lower';
}

function isCheckboxWidget(widget) {
  return normalizeString(widget?.fieldType).toLowerCase() === 'checkbox';
}

function buildCheckboxRows(entries) {
  const rows = [];

  for (const entry of sortByVisualOrder(entries.map((candidate) => candidate.widget)).map((widget) =>
    entries.find((entry) => entry.widget === widget),
  )) {
    if (!entry) continue;

    const y = Number(entry.widget?.y || 0);
    const existingRow = rows.find((row) => Math.abs(row.anchorY - y) <= 14);

    if (existingRow) {
      existingRow.entries.push(entry);
      continue;
    }

    rows.push({
      anchorY: y,
      entries: [entry],
    });
  }

  for (const row of rows) {
    row.entries.sort((left, right) => Number(left.widget?.x || 0) - Number(right.widget?.x || 0));
  }

  return rows;
}

function selectWidgets(page, profile) {
  const entries = [...(page.widgets || [])]
    .map((widget, index) => ({
      widget,
      index,
      score: scoreWidget(page, widget),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    });

  const groupedEntries = new Map();
  for (const entry of entries) {
    const bandKey = getVerticalBandKey(page, entry.widget);
    const bandEntries = groupedEntries.get(bandKey) || [];
    bandEntries.push(entry);
    groupedEntries.set(bandKey, bandEntries);
  }

  const activeBandKeys = ['top', 'upper', 'middle', 'lower'].filter((bandKey) =>
    groupedEntries.has(bandKey),
  );
  const guaranteedPerBand = Math.max(
    1,
    Math.ceil(profile.maxWidgets / Math.max(activeBandKeys.length, 1) / 2),
  );
  const selectedEntries = [];
  const selectedIndexes = new Set();

  for (const bandKey of activeBandKeys) {
    const bandEntries = groupedEntries.get(bandKey) || [];
    for (const entry of bandEntries.slice(0, guaranteedPerBand)) {
      if (selectedIndexes.has(entry.index)) continue;
      selectedEntries.push(entry);
      selectedIndexes.add(entry.index);
    }
  }

  const checkboxRows = buildCheckboxRows(entries.filter((entry) => isCheckboxWidget(entry.widget)));

  for (const row of checkboxRows) {
    if (!row.entries.some((entry) => selectedIndexes.has(entry.index))) {
      continue;
    }

    for (const entry of row.entries) {
      if (selectedEntries.length >= profile.maxWidgets) break;
      if (selectedIndexes.has(entry.index)) continue;
      selectedEntries.push(entry);
      selectedIndexes.add(entry.index);
    }
  }

  for (const entry of entries) {
    if (selectedEntries.length >= profile.maxWidgets) break;
    if (selectedIndexes.has(entry.index)) continue;
    selectedEntries.push(entry);
    selectedIndexes.add(entry.index);
  }

  return sortByVisualOrder(selectedEntries.map((entry) => entry.widget));
}

function selectCandidates(page, candidates, limit, profile) {
  return sortByVisualOrder(
    [...(candidates || [])]
      .map((candidate, index) => ({
        candidate,
        index,
        score: scoreCandidate(page, candidate, profile),
      }))
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return left.index - right.index;
      })
      .slice(0, limit)
      .map((entry) => entry.candidate),
  );
}

function scorePage(page) {
  const words = Array.isArray(page?.words) ? page.words : [];
  const widgets = Array.isArray(page?.widgets) ? page.widgets : [];
  const checkboxCandidates = Array.isArray(page?.checkboxCandidates) ? page.checkboxCandidates : [];
  const lineCandidates = Array.isArray(page?.lineCandidates) ? page.lineCandidates : [];

  let keywordHits = 0;
  for (const word of words) {
    const text = compactWhitespace(word?.text || '').toLowerCase();
    if (!text) continue;
    if (matchesRegionKeyword(text)) {
      keywordHits += 1;
    }
  }

  return (
    widgets.length * 5 +
    checkboxCandidates.length * 3 +
    lineCandidates.length * 1.5 +
    keywordHits * 4
  );
}

function buildPagePayload(page, profile) {
  const widgets = selectWidgets(page, profile);
  const checkboxCandidates = selectCandidates(
    page,
    page.checkboxCandidates || [],
    profile.maxCheckboxCandidates,
    profile,
  );
  const lineCandidates = selectCandidates(
    page,
    (page.lineCandidates || [])
    .filter((candidate) => Number(candidate?.width || 0) >= profile.minLineWidth)
    .slice(0, Math.max(profile.maxLineCandidates * 2, profile.maxLineCandidates)),
    profile.maxLineCandidates,
    profile,
  );
  const keywordAnchors = findKeywordAnchors(page.words || [], profile.maxKeywordAnchors);
  const anchors = [...widgets, ...checkboxCandidates, ...lineCandidates, ...keywordAnchors];

  return {
    pageIndex: Number(page.pageIndex || 0),
    width: Number(page.width || 0),
    height: Number(page.height || 0),
    widgets: widgets.map(toWidgetPayload),
    checkboxCandidates: checkboxCandidates.map(toCandidatePayload),
    lineCandidates: lineCandidates.map(toCandidatePayload),
    labelSnippets: buildLabelSnippets(page, anchors, profile),
  };
}

function buildPdfPayload(parsedPdf, profileName) {
  const profile = PDF_FORM_PROMPT_PROFILES[profileName];
  const scoredPages = [...(parsedPdf.pages || [])]
    .map((page) => ({ page, score: scorePage(page) }))
    .sort((left, right) => right.score - left.score);

  const selectedPages = scoredPages
    .filter((entry) => entry.score > 0)
    .slice(0, profile.maxPages)
    .map((entry) => buildPagePayload(entry.page, profile));

  const fallbackPages =
    selectedPages.length > 0
      ? selectedPages
      : (parsedPdf.pages || []).slice(0, Math.min(profile.maxPages, 1)).map((page) => ({
          pageIndex: Number(page.pageIndex || 0),
          width: Number(page.width || 0),
          height: Number(page.height || 0),
          widgets: [],
          checkboxCandidates: [],
          lineCandidates: [],
          labelSnippets: [],
        }));

  const pdfPayload = {
    title: normalizeString(parsedPdf.title) || '',
    headerText: truncate(parsedPdf.headerText || '', profile.maxHeaderChars),
    totalPages: Array.isArray(parsedPdf.pages) ? parsedPdf.pages.length : 0,
    pages: fallbackPages,
  };

  if (profile.includeTextExcerpt) {
    pdfPayload.textExcerpt = truncate(parsedPdf.text || '', profile.maxTextChars);
  }

  return pdfPayload;
}

function buildUserPrompt({
  parsedPdf,
  hospitalSystemName,
  facilityName,
  formName,
  sourceUrl,
  profileName,
}) {
  return JSON.stringify(
    {
      task: 'Extract only additional, user-answerable questions from fillable regions of this medical-records request PDF.',
      rules: [
        'Only return questions that the user must answer beyond already-collected bio fields.',
        'Exclude name, date of birth, mailing address, signatures, photo-ID upload, and pure instructions.',
        'Supported question kinds: single_select, multi_select, short_text.',
        'Do not merge separate answer slots into one short_text question. If the PDF has separate boxes for from/to dates, provider details, or separate initials for sensitive categories, return one question per field.',
        'When a text field is a follow-up to an "Other" or "Specify ..." option, return it as its own optional short_text question with a label that makes that dependency explicit.',
        'Use descriptive field names like Alcohol/Drug, Genetics, HIV, Mental Health, or Specify provider when nearby printed labels are sparse.',
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
        promptProfile: profileName,
      },
      pdf: buildPdfPayload(parsedPdf, profileName),
    },
    null,
    2,
  );
}

const BINDING_SCHEMA = {
  anyOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['field_text'] },
        field_name: { type: 'string' },
      },
      required: ['type', 'field_name'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['field_checkbox'] },
        field_name: { type: 'string' },
        checked: { type: 'boolean' },
      },
      required: ['type', 'field_name', 'checked'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['field_radio'] },
        field_name: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['type', 'field_name', 'value'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['overlay_text'] },
        page_index: { type: 'integer' },
        x: { type: 'number' },
        y: { type: 'number' },
        max_width: { type: ['number', 'null'] },
        font_size: { type: ['number', 'null'] },
      },
      required: ['type', 'page_index', 'x', 'y', 'max_width', 'font_size'],
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['overlay_mark'] },
        page_index: { type: 'integer' },
        x: { type: 'number' },
        y: { type: 'number' },
        mark: { type: 'string', enum: ['x', 'check'] },
        size: { type: ['number', 'null'] },
      },
      required: ['type', 'page_index', 'x', 'y', 'mark', 'size'],
    },
  ],
};

const OPTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: ['string', 'null'] },
    label: { type: 'string' },
    confidence: { type: 'number' },
    bindings: {
      type: 'array',
      items: BINDING_SCHEMA,
    },
  },
  required: ['id', 'label', 'confidence', 'bindings'],
};

const QUESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: ['string', 'null'] },
    label: { type: 'string' },
    kind: { type: 'string', enum: ['single_select', 'multi_select', 'short_text'] },
    required: { type: 'boolean' },
    help_text: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    bindings: {
      type: 'array',
      items: BINDING_SCHEMA,
    },
    options: {
      type: 'array',
      items: OPTION_SCHEMA,
    },
  },
  required: ['id', 'label', 'kind', 'required', 'help_text', 'confidence', 'bindings', 'options'],
};

export const PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mode: { type: 'string', enum: ['acroform', 'overlay'] },
    template_id: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    questions: {
      type: 'array',
      items: QUESTION_SCHEMA,
    },
  },
  required: ['mode', 'template_id', 'confidence', 'questions'],
};

export const PDF_FORM_UNDERSTANDING_SYSTEM_PROMPT = [
  'You extract interactive questions from hospital medical-record request PDFs.',
  'Work only from the grounded PDF layout data provided.',
  'Return only additional user-input questions that should become workflow steps in a mobile app.',
  'Do not include basic bio fields, signatures, dates to sign, instructions, or photo-ID requirements.',
  'Every returned option or short-text question must include precise bindings that let the app write the answer back into the same PDF.',
  'If confidence is below threshold, omit the question entirely instead of guessing.',
].join(' ');

export function estimateTokenCount(value) {
  const chars = typeof value === 'string' ? value.length : JSON.stringify(value || {}).length;
  return Math.max(1, Math.ceil(chars / ESTIMATED_CHARS_PER_TOKEN));
}

export function estimateRequestInputTokens({ systemPrompt, userPrompt, schema }) {
  const promptChars =
    String(systemPrompt || '').length +
    String(userPrompt || '').length +
    JSON.stringify(schema || {}).length +
    256;
  return {
    estimated_input_chars: promptChars,
    estimated_input_tokens: Math.max(1, Math.ceil(promptChars / ESTIMATED_CHARS_PER_TOKEN)),
  };
}

export function preparePdfFormUnderstandingRequest({
  parsedPdf,
  hospitalSystemName,
  facilityName = null,
  formName,
  sourceUrl,
  promptProfile = DEFAULT_PROMPT_PROFILE,
  maxInputTokens = DEFAULT_MAX_INPUT_TOKENS,
}) {
  const requestedProfile = normalizePromptProfile(promptProfile);
  const fallbackProfiles = PROMPT_PROFILE_FALLBACKS[requestedProfile] || [DEFAULT_PROMPT_PROFILE];
  const validMaxInputTokens =
    Number.isFinite(maxInputTokens) && maxInputTokens > 0
      ? Math.floor(maxInputTokens)
      : DEFAULT_MAX_INPUT_TOKENS;
  let selectedProfile = fallbackProfiles[fallbackProfiles.length - 1];
  let selectedPrompt = '';
  let selectedEstimate = {
    estimated_input_chars: 0,
    estimated_input_tokens: 0,
  };

  for (const profileName of fallbackProfiles) {
    const userPrompt = buildUserPrompt({
      parsedPdf,
      hospitalSystemName,
      facilityName,
      formName,
      sourceUrl,
      profileName,
    });
    const estimate = estimateRequestInputTokens({
      systemPrompt: PDF_FORM_UNDERSTANDING_SYSTEM_PROMPT,
      userPrompt,
      schema: PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA,
    });

    selectedProfile = profileName;
    selectedPrompt = userPrompt;
    selectedEstimate = estimate;

    if (estimate.estimated_input_tokens <= validMaxInputTokens) {
      break;
    }
  }

  const parsedPrompt = JSON.parse(selectedPrompt);
  return {
    systemPrompt: PDF_FORM_UNDERSTANDING_SYSTEM_PROMPT,
    userPrompt: selectedPrompt,
    schema: PDF_FORM_UNDERSTANDING_RESPONSE_SCHEMA,
    promptMetadata: {
      prompt_profile_requested: requestedProfile,
      prompt_profile: selectedProfile,
      prompt_profile_fallbacks: fallbackProfiles,
      prompt_page_indexes: parsedPrompt?.pdf?.pages?.map((page) => page.pageIndex) || [],
      selected_page_count: parsedPrompt?.pdf?.pages?.length || 0,
      total_page_count: parsedPdf?.pages?.length || 0,
      max_input_tokens: validMaxInputTokens,
      prompt_over_budget: selectedEstimate.estimated_input_tokens > validMaxInputTokens,
      ...selectedEstimate,
    },
  };
}
