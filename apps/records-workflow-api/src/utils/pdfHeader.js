import { collapseWhitespace } from './text.js';

const PAGE_MARKER_PATTERN = /\bpage\s+\d+\s+of\s+\d+\b/gi;
const HEADER_FIELD_TAIL_PATTERN =
  /\b(?:mrn|mr#|name|dob|date of birth|birth date|patient name|patient dob)\b[:#]?\s*.*$/i;
const FIELD_ONLY_PATTERN =
  /^(?:mrn|mr#|name|dob|date of birth|birth date|patient name|patient dob)[:#]?\s*$/i;
const ADDRESS_PATTERN =
  /\b(?:po box|box|street|st\.?|avenue|ave\.?|road|rd\.?|drive|dr\.?|lane|ln\.?|boulevard|blvd\.?|highway|hwy\.?|suite|ste\.?)\b/i;
const CITY_STATE_ZIP_PATTERN =
  /\b[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z][A-Za-z'.-]+)*,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/;
const DOCUMENT_TITLE_PATTERN =
  /\b(?:authorization|request|records?|protected health information|proxy access|mychart|patient portal|consent|release)\b/i;
const FACILITY_PATTERN =
  /\b(?:hospital|medical center|regional hospital|community hospital|memorial hospital|rehabilitation hospital|rehabilitation center|health network|health center|physicians hospital|clinic|medical campus|campus)\b/i;

function approximateFontSize(item) {
  return Math.max(Math.abs(item?.transform?.[0] || 0), Math.abs(item?.transform?.[3] || 0), 0);
}

export function normalizePdfHeaderLineText(value) {
  return collapseWhitespace(
    (value || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
      .replace(PAGE_MARKER_PATTERN, ' ')
      .replace(/\s*[|•]+\s*/g, ' ')
      .replace(HEADER_FIELD_TAIL_PATTERN, ' ')
  );
}

export function isLikelyPdfHeaderAddressLine(value) {
  const text = normalizePdfHeaderLineText(value);
  return Boolean(CITY_STATE_ZIP_PATTERN.test(text) || (/\d/.test(text) && ADDRESS_PATTERN.test(text)));
}

export function isLikelyPdfHeaderFieldLine(value) {
  return FIELD_ONLY_PATTERN.test(normalizePdfHeaderLineText(value));
}

export function isLikelyPdfHeaderDocumentTitleLine(value) {
  const text = normalizePdfHeaderLineText(value);
  return Boolean(DOCUMENT_TITLE_PATTERN.test(text));
}

export function buildPdfHeaderLines({ items = [], pageHeight = 0, topRatio = 0.25 } = {}) {
  if (!Array.isArray(items) || items.length === 0 || !pageHeight) {
    return [];
  }

  const topBoundary = pageHeight * (1 - topRatio);
  const positionedItems = items
    .map((item) => ({
      text: item?.str || '',
      x: item?.transform?.[4] ?? 0,
      y: item?.transform?.[5] ?? 0,
      fontSize: approximateFontSize(item)
    }))
    .filter((item) => item.text.trim())
    .filter((item) => item.y >= topBoundary)
    .sort((left, right) => {
      if (Math.abs(right.y - left.y) > 1.5) return right.y - left.y;
      return left.x - right.x;
    });

  const groupedLines = [];

  for (const item of positionedItems) {
    let line = groupedLines.find((entry) => Math.abs(entry.y - item.y) <= 2.5);
    if (!line) {
      line = { y: item.y, items: [] };
      groupedLines.push(line);
    }
    line.items.push(item);
  }

  return groupedLines
    .map((line) => {
      const sortedItems = line.items.sort((left, right) => left.x - right.x);
      const rawText = sortedItems.map((item) => item.text).join('');
      const text = normalizePdfHeaderLineText(rawText);
      return {
        rawText,
        text,
        x: Math.min(...sortedItems.map((item) => item.x)),
        y: line.y,
        fontSize: Math.max(...sortedItems.map((item) => item.fontSize))
      };
    })
    .filter((line) => line.text)
    .sort((left, right) => {
      if (Math.abs(right.y - left.y) > 1.5) return right.y - left.y;
      return left.x - right.x;
    });
}

export function buildPdfHeaderText(headerLines = []) {
  return collapseWhitespace(
    headerLines
      .map((line) => line?.text || '')
      .filter(Boolean)
      .join(' ')
  );
}

function normalizeIdentity(value) {
  return normalizePdfHeaderLineText(value).toLowerCase();
}

function scoreFacilityCandidate(line, index, normalizedSystemName) {
  const text = line.text;
  const words = text.split(/\s+/).filter(Boolean);
  const hasFacilityPattern = FACILITY_PATTERN.test(text);

  if (!text || words.length < 2) return -Infinity;
  if (isLikelyPdfHeaderFieldLine(text)) return -Infinity;

  let score = 0;

  if (hasFacilityPattern) score += 40;
  if (words.length >= 2 && words.length <= 8) score += 12;
  if (index <= 2) score += 10 - index * 2;
  if (!/\d/.test(text)) score += 10;
  if (!hasFacilityPattern) score -= 20;

  if (isLikelyPdfHeaderAddressLine(text)) score -= 45;
  if (isLikelyPdfHeaderDocumentTitleLine(text)) score -= 35;
  if (/^for patients\b/i.test(text)) score -= 20;
  if (/^\d/.test(text)) score -= 20;

  if (normalizedSystemName && normalizeIdentity(text) === normalizedSystemName) {
    score -= 5;
  }

  return score;
}

export function inferFacilityNameFromHeaderLines({ systemName = '', headerLines = [] } = {}) {
  if (!Array.isArray(headerLines) || headerLines.length === 0) {
    return null;
  }

  const normalizedSystemName = normalizeIdentity(systemName);
  const scoredLines = headerLines
    .map((line) => ({
      ...line,
      text: normalizePdfHeaderLineText(line?.text || line?.rawText || '')
    }))
    .map((line, index) => ({
      ...line,
      score: scoreFacilityCandidate(line, index, normalizedSystemName)
    }))
    .filter((line) => Number.isFinite(line.score))
    .sort((left, right) => right.score - left.score || right.y - left.y);

  const primary = scoredLines[0];
  if (!primary || primary.score < 20) {
    return null;
  }

  let label = primary.text;
  const primaryIndex = headerLines.findIndex((line) => line.text === primary.text && line.y === primary.y);

  for (const line of headerLines.slice(primaryIndex + 1, primaryIndex + 3)) {
    if (!line?.text) continue;
    if (isLikelyPdfHeaderAddressLine(line.text)) continue;
    if (!/\bcampus\b/i.test(line.text)) continue;
    if (normalizeIdentity(label).includes(normalizeIdentity(line.text))) continue;
    label = collapseWhitespace(`${label} ${line.text}`);
    break;
  }

  return label;
}
