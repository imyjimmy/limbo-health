import { collapseWhitespace } from './text.js';

const TITLE_BREAK_PATTERNS = [
  /\bplease use this form\b/i,
  /\bthis form may also be used\b/i,
  /\bthis form\b/i,
  /\bby signing this form\b/i,
  /\bplease allow\b/i,
  /\bplease\b/i,
  /\bparticipates in\b/i,
  /\ballows\b/i,
  /\bthat allows\b/i,
  /\bis required to\b/i,
  /\blocated at\b/i,
  /\bfor immediate download\b/i,
  /\bsee page\b/i,
  /\bi request\b/i
];

function stripLeadingDocumentCodes(value = '') {
  return value
    .replace(/^(?:[A-Z]{1,5}\d[\w.-]*|\d[\dA-Z.-]{2,})\s+/g, '')
    .replace(/^(?:Form|Document)\s*[:#-]?\s*[A-Z0-9.-]+\s+/gi, '');
}

function stripLeadingEntityLabels(value = '', labels = []) {
  let nextValue = value;

  for (const label of labels.filter(Boolean)) {
    const normalizedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nextValue = nextValue.replace(new RegExp(`^${normalizedLabel}\\s+`, 'i'), '');
  }

  return nextValue;
}

function trimAtExplanationBoundary(value = '') {
  const normalized = collapseWhitespace(value);

  for (const pattern of TITLE_BREAK_PATTERNS) {
    const match = pattern.exec(normalized);
    if (!match || match.index <= 0) continue;

    const prefix = normalized.slice(0, match.index).trim();
    if (prefix.split(/\s+/).length >= 3) {
      return prefix;
    }
  }

  return normalized;
}

function cleanupAutomaticTitle(value = '', labels = []) {
  if (!value) return '';

  let nextValue = collapseWhitespace(value);
  nextValue = stripLeadingDocumentCodes(nextValue);
  nextValue = stripLeadingEntityLabels(nextValue, labels);
  nextValue = trimAtExplanationBoundary(nextValue);
  nextValue = nextValue.replace(/\s+/g, ' ').trim();
  nextValue = nextValue.replace(/[,:;.\-–—\s]+$/g, '').trim();

  return nextValue;
}

function scoreAutomaticTitle(value = '') {
  if (!value) return -1;

  const words = value.split(/\s+/).filter(Boolean).length;
  if (words < 3) return -1;

  let score = 0;
  if (words >= 4 && words <= 12) score += 4;
  if (value.length <= 96) score += 4;
  if (/\b(authori[sz](?:ation|e)|request|release|disclos(?:e|ure)|protected health information|medical record|medical records|health information|opt[- ]out|privacy|amend(?:ment)?|proxy|mychart|machine-readable|care everywhere)\b/i.test(value)) {
    score += 6;
  }
  if (/\b(participates in|allows|please|this form|by signing)\b/i.test(value)) {
    score -= 5;
  }

  return score;
}

export function deriveAutomaticPdfTitleOverride({
  title = '',
  headerText = '',
  headerLines = [],
  facilityName = '',
  systemName = ''
} = {}) {
  const labels = [facilityName, systemName];
  const candidates = [];

  const addCandidate = (value) => {
    const cleaned = cleanupAutomaticTitle(value, labels);
    if (!cleaned) return;
    if (candidates.includes(cleaned)) return;
    candidates.push(cleaned);
  };

  addCandidate(title);

  for (const line of (headerLines || []).slice(0, 3)) {
    addCandidate(line?.text || '');
  }

  addCandidate(headerText);

  const sorted = candidates
    .map((value) => ({ value, score: scoreAutomaticTitle(value) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.value.length - right.value.length;
    });

  return sorted[0]?.value || null;
}
