import { MIN_AUTOFILL_CONFIDENCE } from './pdfFormUnderstanding.js';

export const DEFAULT_PROMPT_PROFILE = 'compact';
export const DEFAULT_MAX_INPUT_TOKENS = 20000;
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

const PAGE_LAYOUT_SIGNATURE_LINE_MIN_SIZE = 20;
const PAGE_LAYOUT_SIGNATURE_MIN_ITEMS = 5;
const PAGE_LAYOUT_DUPLICATE_THRESHOLD = 0.9;
const PAGE_LAYOUT_QUANTIZATION = 12;
const INFERRED_CHECKBOX_ROW_TOLERANCE = 4;
const INFERRED_CHECKBOX_SEGMENT_GAP = 28;
const INFERRED_CHECKBOX_MIN_REPEAT_BUCKETS = 2;
const INFERRED_CHECKBOX_BUCKET_STEP = 40;
const TEXT_ENTRY_ROW_TOLERANCE = 8;
const TEXT_ENTRY_LEFT_LABEL_MAX_DISTANCE = 220;
const TEXT_ENTRY_ABOVE_LABEL_MAX_DISTANCE = 42;
const TEXT_ENTRY_RIGHT_LABEL_MAX_DISTANCE = 220;
const TEXT_ENTRY_LABEL_MAX_WORDS = 8;
const TEXT_ENTRY_LABEL_MAX_CHARS = 120;
const UNDERSCORE_RUN_PATTERN = /_{3,}/g;
const UNDERSCORE_TEST_PATTERN = /_{3,}/;

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
  return null;
}

function resolvePromptProfile(value, parsedPdf) {
  const explicitProfile = normalizePromptProfile(value);
  if (explicitProfile) {
    return explicitProfile;
  }

  const pages = Array.isArray(parsedPdf?.pages) ? parsedPdf.pages : [];
  const totalWidgets = pages.reduce(
    (count, page) => count + (Array.isArray(page?.widgets) ? page.widgets.length : 0),
    0,
  );
  const totalCheckboxCandidates = pages.reduce(
    (count, page) =>
      count + (Array.isArray(page?.checkboxCandidates) ? page.checkboxCandidates.length : 0),
    0,
  );
  const totalLineCandidates = pages.reduce(
    (count, page) => count + (Array.isArray(page?.lineCandidates) ? page.lineCandidates.length : 0),
    0,
  );

  const flatPdf = totalWidgets === 0;
  const multiPage = pages.length >= 2;
  const geometryRich = totalCheckboxCandidates >= 12 || totalLineCandidates >= 24;

  if (flatPdf && (multiPage || geometryRich)) {
    return 'expanded';
  }

  return DEFAULT_PROMPT_PROFILE;
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function compactWhitespace(value) {
  return normalizeString(value).replace(/\s+/g, ' ').trim();
}

function collapseAdjacentDuplicateWords(value) {
  const tokens = compactWhitespace(value).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return '';
  }

  const collapsed = [];
  for (const token of tokens) {
    const previousToken = collapsed.at(-1) || null;
    if (previousToken && previousToken.toLowerCase() === token.toLowerCase()) {
      continue;
    }
    collapsed.push(token);
  }

  return collapsed.join(' ').trim();
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

function groupWordsIntoRows(words = [], tolerance = INFERRED_CHECKBOX_ROW_TOLERANCE) {
  const rows = [];

  for (const word of sortByVisualOrder(words)) {
    const y = Number(word?.y || 0);
    let matchedRow = rows.find((row) => Math.abs(row.anchorY - y) <= tolerance);
    if (!matchedRow) {
      matchedRow = {
        anchorY: y,
        words: [],
      };
      rows.push(matchedRow);
    }
    matchedRow.words.push(word);
  }

  rows.forEach((row) => row.words.sort((left, right) => Number(left?.x || 0) - Number(right?.x || 0)));
  return rows.sort((left, right) => Number(right.anchorY || 0) - Number(left.anchorY || 0));
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

function buildTextEntryLabelFromWords(words = [], direction = 'tail') {
  const normalizedWords = Array.isArray(words) ? words : [];
  const slice =
    direction === 'head'
      ? normalizedWords.slice(0, TEXT_ENTRY_LABEL_MAX_WORDS)
      : normalizedWords.slice(-TEXT_ENTRY_LABEL_MAX_WORDS);
  const selected = slice
    .map((word) => compactWhitespace(word?.text || ''))
    .filter(Boolean);

  return truncate(collapseAdjacentDuplicateWords(selected.join(' ')), TEXT_ENTRY_LABEL_MAX_CHARS);
}

function isGenericTextEntryLabel(label) {
  const normalized = compactWhitespace(label).toLowerCase();
  if (!normalized) return false;

  return (
    /\bauthorize\b/.test(normalized) ||
    /\brelease to\b/.test(normalized) ||
    /\bother\b/.test(normalized) ||
    /^(?:date|phone|applicable|representative)$/i.test(normalized) ||
    /\bperiod of service\b/.test(normalized)
  );
}

function mergeTextEntryLabels(leftLabel, rightLabel) {
  const combined = collapseAdjacentDuplicateWords(
    compactWhitespace([leftLabel, rightLabel].filter(Boolean).join(' ')),
  );
  return isPlausibleTextEntryLabel(combined) ? combined : leftLabel || rightLabel || '';
}

function isPlausibleTextEntryLabel(label) {
  const normalized = compactWhitespace(label);
  if (!normalized) return false;
  if (normalized.length < 2) return false;
  if (!/[A-Za-z]/.test(normalized)) return false;
  if (/^[_\-. ]+$/.test(normalized)) return false;
  if (/^(?:the|and|or|of|for|to|by|is|are)$/i.test(normalized)) return false;
  if (/^(?:important|written consent|federal regulations)$/i.test(normalized)) return false;
  return true;
}

function buildTextEntryCandidateLabel(page, candidate) {
  const x = Number(candidate?.x || 0);
  const y = Number(candidate?.y || 0);
  const width = Number(candidate?.width || 0);
  const words = Array.isArray(page?.words) ? page.words : [];

  const sameRowLeftWords = words
    .filter((word) => Math.abs(Number(word?.y || 0) - y) <= TEXT_ENTRY_ROW_TOLERANCE)
    .filter((word) => {
      const wordRight = Number(word?.x || 0) + Number(word?.width || 0);
      return wordRight <= x - 4 && x - wordRight <= TEXT_ENTRY_LEFT_LABEL_MAX_DISTANCE;
    })
    .sort((left, right) => Number(left?.x || 0) - Number(right?.x || 0));
  const sameRowLabel = buildTextEntryLabelFromWords(sameRowLeftWords, 'tail');
  const sameRowRightWords = words
    .filter((word) => Math.abs(Number(word?.y || 0) - y) <= TEXT_ENTRY_ROW_TOLERANCE)
    .filter((word) => {
      const wordX = Number(word?.x || 0);
      return wordX >= x + width + 4 && wordX - (x + width) <= TEXT_ENTRY_RIGHT_LABEL_MAX_DISTANCE;
    })
    .sort((left, right) => Number(left?.x || 0) - Number(right?.x || 0));
  const sameRowRightLabel = buildTextEntryLabelFromWords(sameRowRightWords, 'head');
  if (isPlausibleTextEntryLabel(sameRowLabel)) {
    if (isGenericTextEntryLabel(sameRowLabel) && isPlausibleTextEntryLabel(sameRowRightLabel)) {
      return mergeTextEntryLabels(sameRowLabel, sameRowRightLabel);
    }
    return sameRowLabel;
  }

  const aboveWords = words
    .filter((word) => {
      const wordY = Number(word?.y || 0);
      return wordY > y && wordY - y <= TEXT_ENTRY_ABOVE_LABEL_MAX_DISTANCE;
    })
    .filter((word) => {
      const wordX = Number(word?.x || 0);
      const wordRight = wordX + Number(word?.width || 0);
      return wordRight >= x - 12 && wordX <= x + width + 12;
    })
    .sort((left, right) => {
      const yDelta = Number(left?.y || 0) - Number(right?.y || 0);
      if (Math.abs(yDelta) > 4) return yDelta;
      return Number(left?.x || 0) - Number(right?.x || 0);
    });
  const aboveLabel = buildTextEntryLabelFromWords(aboveWords);
  if (isPlausibleTextEntryLabel(aboveLabel)) {
    return aboveLabel;
  }

  return '';
}

function buildUnderscoreSegmentLabel(page, word, segmentX, segmentWidth, baseLabel) {
  const normalizedBase = compactWhitespace(baseLabel).replace(/[:._-]+$/g, '').trim();
  const sameRowLeftWords = (page?.words || [])
    .filter((candidate) => candidate !== word)
    .filter((candidate) => !UNDERSCORE_TEST_PATTERN.test(normalizeString(candidate?.text || '')))
    .filter((candidate) => Math.abs(Number(candidate?.y || 0) - Number(word?.y || 0)) <= TEXT_ENTRY_ROW_TOLERANCE)
    .filter((candidate) => {
      const candidateRight = Number(candidate?.x || 0) + Number(candidate?.width || 0);
      return candidateRight <= segmentX - 4 && segmentX - candidateRight <= 120;
    })
    .sort((left, right) => Number(left?.x || 0) - Number(right?.x || 0));

  const sameRowRightWords = (page?.words || [])
    .filter((candidate) => candidate !== word)
    .filter((candidate) => !UNDERSCORE_TEST_PATTERN.test(normalizeString(candidate?.text || '')))
    .filter((candidate) => Math.abs(Number(candidate?.y || 0) - Number(word?.y || 0)) <= TEXT_ENTRY_ROW_TOLERANCE)
    .filter((candidate) => {
      const candidateX = Number(candidate?.x || 0);
      return candidateX >= segmentX + segmentWidth + 4 &&
        candidateX - (segmentX + segmentWidth) <= TEXT_ENTRY_RIGHT_LABEL_MAX_DISTANCE;
    })
    .sort((left, right) => Number(left?.x || 0) - Number(right?.x || 0));

  const leftLabel = buildTextEntryLabelFromWords(sameRowLeftWords, 'tail');
  const rightLabel = buildTextEntryLabelFromWords(sameRowRightWords, 'head');
  const combined = collapseAdjacentDuplicateWords(
    compactWhitespace([leftLabel, normalizedBase].filter(Boolean).join(' ')),
  );
  if (isPlausibleTextEntryLabel(combined)) {
    if (isGenericTextEntryLabel(combined) && isPlausibleTextEntryLabel(rightLabel)) {
      return mergeTextEntryLabels(combined, rightLabel);
    }
    return combined;
  }

  if (isPlausibleTextEntryLabel(normalizedBase)) {
    return isPlausibleTextEntryLabel(rightLabel) && isGenericTextEntryLabel(normalizedBase)
      ? mergeTextEntryLabels(normalizedBase, rightLabel)
      : normalizedBase;
  }

  return isPlausibleTextEntryLabel(rightLabel) ? rightLabel : normalizedBase;
}

function buildUnderscoreTextEntryCandidates(page) {
  const candidates = [];

  for (const word of sortByVisualOrder(page?.words || [])) {
    const text = normalizeString(word?.text || '');
    if (!UNDERSCORE_RUN_PATTERN.test(text)) {
      UNDERSCORE_RUN_PATTERN.lastIndex = 0;
      continue;
    }

    const charWidth = Number(word?.width || 0) / Math.max(text.length, 1);
    let segmentStart = 0;
    UNDERSCORE_RUN_PATTERN.lastIndex = 0;
    let match;
    while ((match = UNDERSCORE_RUN_PATTERN.exec(text))) {
      const underscoreStart = match.index;
      const underscoreLength = match[0].length;
      const baseLabel = text.slice(segmentStart, underscoreStart);
      const x = Number(word?.x || 0) + underscoreStart * charWidth;
      const width = Math.max(underscoreLength * charWidth, 18);
      const label = buildUnderscoreSegmentLabel(page, word, x, width, baseLabel);

      if (isPlausibleTextEntryLabel(label)) {
        candidates.push({
          label,
          x,
          y: Number(word?.y || 0),
          width,
          height: Number(word?.height || 0),
          source: 'underscore_word',
        });
      }

      segmentStart = underscoreStart + underscoreLength;
    }

    UNDERSCORE_RUN_PATTERN.lastIndex = 0;
  }

  return candidates;
}

function buildTextEntryCandidates(page, profile) {
  const lineCandidates = Array.isArray(page?.lineCandidates) ? page.lineCandidates : [];
  const explicitTextEntryCandidates = Array.isArray(page?.textEntryCandidates)
    ? page.textEntryCandidates
    : [];
  const underscoreCandidates = buildUnderscoreTextEntryCandidates(page);
  const selected = [];
  const seen = new Set();

  for (const candidate of explicitTextEntryCandidates) {
    const label = compactWhitespace(candidate?.label || '');
    if (!isPlausibleTextEntryLabel(label)) {
      continue;
    }
    const key = `${label.toLowerCase()}|${Math.round(Number(candidate?.x || 0))}|${Math.round(
      Number(candidate?.y || 0),
    )}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push({
      label,
      x: Number(candidate?.x || 0),
      y: Number(candidate?.y || 0),
      width: Number(candidate?.width || 0),
      height: Number(candidate?.height || 0),
      source: normalizeString(candidate?.source) || 'explicit_text_entry',
    });
  }

  for (const candidate of underscoreCandidates) {
    const key = `${candidate.label.toLowerCase()}|${Math.round(candidate.x)}|${Math.round(candidate.y)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    selected.push(candidate);
  }

  for (const candidate of sortByVisualOrder(lineCandidates)) {
    const orientation = normalizeString(candidate?.orientation).toLowerCase();
    const width = Number(candidate?.width || 0);
    const height = Number(candidate?.height || 0);
    if (orientation !== 'horizontal') continue;
    if (width < Math.max(profile.minLineWidth, 36)) continue;
    if (height > 8) continue;

    const label = buildTextEntryCandidateLabel(page, candidate);
    if (!isPlausibleTextEntryLabel(label)) {
      continue;
    }

    const key = `${label.toLowerCase()}|${Math.round(Number(candidate?.x || 0))}|${Math.round(
      Number(candidate?.y || 0),
    )}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    selected.push({
      label,
      x: Number(candidate?.x || 0),
      y: Number(candidate?.y || 0),
      width,
      height,
      source: normalizeString(candidate?.shape) || 'line',
    });

    if (selected.length >= Math.max(profile.maxLineCandidates, 20)) {
      break;
    }
  }

  return selected.slice(0, Math.max(profile.maxLineCandidates, 20));
}

function toOcrBlockPayload(block) {
  return {
    label: normalizeString(block?.label) || null,
    text: truncate(normalizeString(block?.text) || '', 280),
    x: Number(block?.x || 0),
    y: Number(block?.y || 0),
    width: Number(block?.width || 0),
    height: Number(block?.height || 0),
  };
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

function splitRowIntoSegments(words = []) {
  const segments = [];

  for (const word of words) {
    const currentX = Number(word?.x || 0);
    const previousWord = segments[segments.length - 1]?.words?.at(-1) || null;
    const previousRight = previousWord
      ? Number(previousWord.x || 0) + Number(previousWord.width || 0)
      : null;
    const gap = previousRight == null ? 0 : currentX - previousRight;

    if (!segments.length || gap > INFERRED_CHECKBOX_SEGMENT_GAP) {
      segments.push({
        words: [word],
      });
      continue;
    }

    segments[segments.length - 1].words.push(word);
  }

  return segments
    .map((segment) => {
      const normalizedWords = segment.words.filter(Boolean);
      if (!normalizedWords.length) {
        return null;
      }

      const text = normalizedWords
        .map((word) => compactWhitespace(word?.text || ''))
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text) {
        return null;
      }

      const xs = normalizedWords.map((word) => Number(word?.x || 0));
      return {
        text,
        words: normalizedWords,
        x: Math.min(...xs),
        y: Math.max(...normalizedWords.map((word) => Number(word?.y || 0))),
      };
    })
    .filter(Boolean);
}

function isLikelyCheckboxSegment(segment) {
  const text = compactWhitespace(segment?.text || '');
  if (!text) return false;

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 1 || wordCount > 8) return false;
  if (text.length > 88) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^[_\s./-]+$/.test(text)) return false;
  if (/^(?:i\s|the\s|this\s|and\s|or\s|by\s|of\s|for\s)/i.test(text)) return false;
  if (
    /^(?:important|signature|relationship|regulations|written consent|patient name|date of birth|release to|release of|i hereby authorize|this information)/i.test(
      text,
    )
  ) {
    return false;
  }
  if (text.includes('—')) return false;

  const firstLetterMatch = text.match(/[A-Za-z]/);
  if (!firstLetterMatch) return false;
  if (firstLetterMatch[0] !== firstLetterMatch[0].toUpperCase()) return false;

  return true;
}

function inferCheckboxCandidatesFromWords(page, limit) {
  const rowSegments = groupWordsIntoRows(page?.words || [])
    .flatMap((row) =>
      splitRowIntoSegments(row.words).map((segment) => ({
        ...segment,
        bucket: Math.round(Number(segment.x || 0) / INFERRED_CHECKBOX_BUCKET_STEP),
      })),
    )
    .filter(isLikelyCheckboxSegment);

  if (rowSegments.length === 0) {
    return [];
  }

  const bucketCounts = new Map();
  for (const segment of rowSegments) {
    bucketCounts.set(segment.bucket, (bucketCounts.get(segment.bucket) || 0) + 1);
  }

  const repeatedBuckets = new Set(
    Array.from(bucketCounts.entries())
      .filter(([, count]) => count >= INFERRED_CHECKBOX_MIN_REPEAT_BUCKETS)
      .map(([bucket]) => bucket),
  );
  if (repeatedBuckets.size === 0) {
    return [];
  }

  return rowSegments
    .filter((segment) => repeatedBuckets.has(segment.bucket))
    .map((segment) => ({
      x: Math.max(Number(segment.x || 0) - 12, 0),
      y: Number(segment.y || 0),
      width: 12,
      height: 12,
      shape: 'checkbox_inferred',
    }))
    .slice(0, limit);
}

function quantizeLayoutValue(value, step = PAGE_LAYOUT_QUANTIZATION) {
  return Math.round(Number(value || 0) / Math.max(step, 1));
}

function buildLineSignature(page) {
  const signature = new Set();

  for (const candidate of page?.lineCandidates || []) {
    const width = Number(candidate?.width || 0);
    const height = Number(candidate?.height || 0);
    if (width < PAGE_LAYOUT_SIGNATURE_LINE_MIN_SIZE && height < PAGE_LAYOUT_SIGNATURE_LINE_MIN_SIZE) {
      continue;
    }

    signature.add(
      [
        normalizeString(candidate?.shape || 'line') || 'line',
        normalizeString(candidate?.orientation || '') || 'none',
        quantizeLayoutValue(candidate?.x),
        quantizeLayoutValue(candidate?.y),
        quantizeLayoutValue(width),
        quantizeLayoutValue(height),
      ].join(':'),
    );
  }

  return signature;
}

function computeSignatureOverlap(leftSignature, rightSignature) {
  if (!leftSignature?.size || !rightSignature?.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSignature) {
    if (rightSignature.has(token)) {
      intersection += 1;
    }
  }

  return intersection / Math.max(1, Math.min(leftSignature.size, rightSignature.size));
}

function areStructurallyDuplicatePages(leftPage, rightPage) {
  if (!leftPage || !rightPage) {
    return false;
  }

  if (
    Math.abs(Number(leftPage?.width || 0) - Number(rightPage?.width || 0)) > 2 ||
    Math.abs(Number(leftPage?.height || 0) - Number(rightPage?.height || 0)) > 2
  ) {
    return false;
  }

  const leftSignature = buildLineSignature(leftPage);
  const rightSignature = buildLineSignature(rightPage);
  if (
    leftSignature.size < PAGE_LAYOUT_SIGNATURE_MIN_ITEMS ||
    rightSignature.size < PAGE_LAYOUT_SIGNATURE_MIN_ITEMS
  ) {
    return false;
  }

  return computeSignatureOverlap(leftSignature, rightSignature) >= PAGE_LAYOUT_DUPLICATE_THRESHOLD;
}

function buildCandidateMergeKey(candidate) {
  return [
    normalizeString(candidate?.shape || '') || 'candidate',
    normalizeString(candidate?.orientation || '') || 'none',
    quantizeLayoutValue(candidate?.x),
    quantizeLayoutValue(candidate?.y),
    quantizeLayoutValue(candidate?.width || candidate?.size || 0),
    quantizeLayoutValue(candidate?.height || candidate?.size || 0),
  ].join(':');
}

function mergeCandidateLists(primaryCandidates = [], secondaryCandidates = []) {
  const merged = [...primaryCandidates];
  const seen = new Set(primaryCandidates.map((candidate) => buildCandidateMergeKey(candidate)));

  for (const candidate of secondaryCandidates || []) {
    const key = buildCandidateMergeKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(candidate);
  }

  return merged;
}

function buildRepresentativePages(parsedPdf) {
  const pages = Array.isArray(parsedPdf?.pages) ? parsedPdf.pages : [];
  const clusters = [];

  for (const page of pages) {
    const matchingCluster = clusters.find((cluster) =>
      areStructurallyDuplicatePages(cluster.representative, page),
    );
    if (matchingCluster) {
      matchingCluster.duplicates.push(page);
      continue;
    }

    clusters.push({
      representative: page,
      duplicates: [],
    });
  }

  return clusters.map(({ representative, duplicates }) => ({
    ...representative,
    lineCandidates: duplicates.reduce(
      (candidates, page) => mergeCandidateLists(candidates, page?.lineCandidates || []),
      Array.isArray(representative?.lineCandidates) ? representative.lineCandidates : [],
    ),
    checkboxCandidates: duplicates.reduce(
      (candidates, page) => mergeCandidateLists(candidates, page?.checkboxCandidates || []),
      Array.isArray(representative?.checkboxCandidates) ? representative.checkboxCandidates : [],
    ),
  }));
}

function scorePage(page) {
  const words = Array.isArray(page?.words) ? page.words : [];
  const widgets = Array.isArray(page?.widgets) ? page.widgets : [];
  const checkboxCandidates = Array.isArray(page?.checkboxCandidates) ? page.checkboxCandidates : [];
  const lineCandidates = Array.isArray(page?.lineCandidates) ? page.lineCandidates : [];
  const ocrBlocks = Array.isArray(page?.ocrBlocks) ? page.ocrBlocks : [];

  let keywordHits = 0;
  for (const word of words) {
    const text = compactWhitespace(word?.text || '').toLowerCase();
    if (!text) continue;
    if (matchesRegionKeyword(text)) {
      keywordHits += 1;
    }
  }

  for (const block of ocrBlocks) {
    const text = compactWhitespace(block?.text || '').toLowerCase();
    if (!text) continue;
    if (matchesRegionKeyword(text)) {
      keywordHits += 2;
    }
  }

  return (
    widgets.length * 5 +
    checkboxCandidates.length * 3 +
    lineCandidates.length * 1.5 +
    ocrBlocks.length * 2 +
    keywordHits * 4
  );
}

function buildPagePayload(page, profile) {
  const widgets = selectWidgets(page, profile);
  const synthesizedCheckboxCandidates =
    widgets.length === 0 && (page?.checkboxCandidates || []).length < 8
      ? inferCheckboxCandidatesFromWords(page, Math.max(profile.maxCheckboxCandidates * 2, 24))
      : [];
  const checkboxCandidates = selectCandidates(
    page,
    mergeCandidateLists(page.checkboxCandidates || [], synthesizedCheckboxCandidates),
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
  const textEntryCandidates = buildTextEntryCandidates(page, profile);
  const keywordAnchors = findKeywordAnchors(page.words || [], profile.maxKeywordAnchors);
  const anchors = [...widgets, ...checkboxCandidates, ...lineCandidates, ...keywordAnchors];
  const ocrBlocks = sortByVisualOrder(page?.ocrBlocks || [])
    .slice(0, Math.max(profile.maxKeywordAnchors, 8))
    .map(toOcrBlockPayload);

  return {
    pageIndex: Number(page.pageIndex || 0),
    width: Number(page.width || 0),
    height: Number(page.height || 0),
    ocrEngine: normalizeString(page?.ocrEngine) || null,
    widgets: widgets.map(toWidgetPayload),
    checkboxCandidates: checkboxCandidates.map(toCandidatePayload),
    lineCandidates: lineCandidates.map(toCandidatePayload),
    textEntryCandidates,
    ocrBlocks,
    labelSnippets: buildLabelSnippets(page, anchors, profile),
  };
}

function buildPdfPayload(parsedPdf, profileName) {
  const profile = PDF_FORM_PROMPT_PROFILES[profileName];
  const representativePages = buildRepresentativePages(parsedPdf);
  const scoredPages = representativePages
    .map((page) => ({ page, score: scorePage(page) }))
    .sort((left, right) => right.score - left.score);

  const selectedPages = scoredPages
    .filter((entry) => entry.score > 0)
    .slice(0, profile.maxPages)
    .map((entry) => buildPagePayload(entry.page, profile));

  const fallbackPages =
    selectedPages.length > 0
      ? selectedPages
      : representativePages.slice(0, Math.min(profile.maxPages, 1)).map((page) => ({
          pageIndex: Number(page.pageIndex || 0),
          width: Number(page.width || 0),
          height: Number(page.height || 0),
          widgets: [],
          checkboxCandidates: [],
          lineCandidates: [],
          ocrBlocks: [],
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

export function collectFlatTextEntryCandidates(parsedPdf, promptProfile = undefined) {
  const profileName = resolvePromptProfile(promptProfile, parsedPdf);
  const pdfPayload = buildPdfPayload(parsedPdf, profileName);
  return {
    profileName,
    candidates: (Array.isArray(pdfPayload?.pages) ? pdfPayload.pages : []).flatMap((page) =>
      (Array.isArray(page?.textEntryCandidates) ? page.textEntryCandidates : []).map((candidate) => ({
        ...candidate,
        pageIndex: Number(page.pageIndex || 0),
      })),
    ),
  };
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
        'Drawn checkbox rectangles in checkboxCandidates count as real fillable controls, even when the PDF has no AcroForm widgets.',
        'If several checkboxCandidates appear under one heading or checklist section, prefer one multi_select question with one option per checkbox label instead of separate yes/no questions.',
        'Do not merge different checkbox sections together just because they appear on the same page; each distinct heading or checklist section should become its own question.',
        'Use textEntryCandidates as likely standalone fill-in fields. If several separate lines are present for names, dates, addresses, provider details, or purpose, return separate short_text questions for them.',
        'Use ocrBlocks as additional layout/text context for flat PDFs when native widgets are missing. They describe nearby form sections and labels extracted by OCR.',
        'Use descriptive field names like Alcohol/Drug, Genetics, HIV, Mental Health, or Specify provider when nearby printed labels are sparse.',
        'Use exact AcroForm field names when widgets exist.',
        'For flat PDFs, use overlay bindings with explicit page_index, x, and y coordinates in PDF coordinate space.',
        'If multiple pages are translated or layout-duplicate copies of the same form, extract one canonical set of questions instead of duplicating the translated copy.',
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
  promptProfile = undefined,
  maxInputTokens = DEFAULT_MAX_INPUT_TOKENS,
}) {
  const requestedProfile = resolvePromptProfile(promptProfile, parsedPdf);
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
