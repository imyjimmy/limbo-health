import { collapseWhitespace } from './text.js';
import { inferFacilityNameFromDocument } from './facilityAliases.js';

const GENERIC_TITLE_PATTERNS = [
  /^patient identification$/i,
  /^microsoft word\b/i,
  /^\d+$/,
  /^untitled$/i
];

const MACHINE_TITLE_PATTERNS = [
  /\bdraft\b/i,
  /\bword\b/i,
  /\bversion\b/i,
  /\brev\b/i,
  /\bfinal\b/i,
  /\buse\b/i,
  /\bform\b/i,
  /\d{2,}/
];

const DESCRIPTIVE_TITLE_PATTERNS = [
  /\bauthori[sz](?:ation|e)\b/i,
  /\brequest\b/i,
  /\brelease\b/i,
  /\bdisclos(?:e|ure)\b/i,
  /\bmedical\b/i,
  /\bhealth\b/i,
  /\bprotected health information\b/i,
  /\bphi\b/i,
  /\bautorizaci[oó]n\b/i,
  /\bautoriza[cç][aã]o\b/i
];

const PHRASE_PATTERNS = [
  /\b(patient request for health information)/i,
  /\b(patient request to have medical records transferred)/i,
  /\b(patient right to access request for medical records)/i,
  /\b(request for health information)/i,
  /\b(request for medical records)/i,
  /\b(authorization for release of medical information(?:\s*\([^)]*\))?)/i,
  /\b(authorization for release of patient information(?:\s*\([^)]*\))?)/i,
  /\b(authorization for the disclosure of protected health information(?:\s*\([^)]*\))?)/i,
  /\b(authorization for use and disclosure of health information(?:\s*\([^)]*\))?)/i,
  /\b(authorization to disclose protected health information(?:\s*\([^)]*\))?)/i,
  /\b(authorization for use and disclosure of protected health information(?:\s*\([^)]*\))?)/i,
  /\b(autorizaci[oó]n para la divulgaci[oó]n de informaci[oó]n m[eé]dica)/i,
  /\b(autorizaci[oó]n para el uso y divulgaci[oó]n de informaci[oó]n de salud protegida)/i,
  /\b(autorizaci[oó]n para divulgar informaci[oó]n de salud protegida)/i,
  /\b(autoriza[cç][aã]o para divulga[cç][aã]o de informa[cç][oõ]es(?: de sa[úu]de)?(?: protegidas? ou privilegiadas?)?)/i,
  /\b(autoriza[cç][aã]o para o uso e divulga[cç][aã]o de informa[cç][oõ]es de sa[úu]de protegidas?)/i,
  /\b(hipaa authorization(?:\s+for[^.:]{0,140})?)[:.]?/i,
  /\b(authorization(?:\s+(?:for|to))?[^.:]{0,140}\b(?:medical|health|patient|protected)\b[^.:]{0,100}\b(?:information|records?|phi)\b)\b/i,
  /\b(autorizaci[oó]n[^.:]{0,140}\b(?:informaci[oó]n|registros?)\b[^.:]{0,100}\b(?:m[eé]dica|de salud)\b)\b/i,
  /\b(autoriza[cç][aã]o[^.:]{0,160}\b(?:informa[cç][oõ]es|registros?)\b[^.:]{0,120}\b(?:m[eé]dicas?|de sa[úu]de)\b)\b/i
];

export function slugifyLabel(value) {
  return (value || 'medical-center')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function cleanPhraseSource(value) {
  return collapseWhitespace(
    (value || '')
      .replace(/\bMicrosoft Word\s*-\s*/gi, '')
      .replace(/\bFILLABLESP\b/gi, '')
      .replace(/\bFILLABLE\b/gi, '')
      .replace(/\bScan doc type:\s*/gi, ' ')
      .replace(/\bAUTHORI\s+ZATION\b/gi, 'AUTHORIZATION')
      .replace(/\bheal\s+th\b/gi, 'health')
      .replace(/\bmedi\s+cal\b/gi, 'medical')
      .replace(/\bdisclo\s*sure\b/gi, 'disclosure')
      .replace(/\binfo\s*rma(?:tion)?\b(?![A-Za-zÀ-ÿ])/gi, 'information')
      .replace(/[“”"]/g, '')
  );
}

function sanitizePhrase(value) {
  const normalized = collapseWhitespace(
    (value || '')
      .replace(/^[^A-Za-zÀ-ÿ]+/, '')
      .replace(/\s*\((english|spanish|espa[nñ]ol|portuguese|portugu[eê]s)\)\s*/gi, ' ')
      .replace(/(^|[\s-])(english|spanish|espa[nñ]ol|portuguese|portugu[eê]s)(?=$|[\s-])/gi, '$1')
      .replace(/[-\s]+(english|spanish|espa[nñ]ol|portuguese|portugu[eê]s)$/gi, '')
      .replace(/\s+Page\s+\d+\s+of\s+\d+/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  const words = normalized.split(/\s+/);

  return words
    .map((word, index) => {
      if (/^[A-Z0-9]{2,5}$/.test(word)) return word;
      if (!/[A-Za-zÀ-ÿ]/.test(word)) return word;
      const lower = word.toLowerCase();
      if (
        index > 0 &&
        index < words.length - 1 &&
        /^(for|and|of|to|the|or|de|la|el|y|para|e|do|da|dos|das)$/.test(lower)
      ) {
        return lower;
      }
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

function hasEnoughWords(value) {
  return value.split(/\s+/).filter(Boolean).length >= 3;
}

function isGenericTitle(value) {
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(value));
}

function isMachineTitle(value) {
  return MACHINE_TITLE_PATTERNS.some((pattern) => pattern.test(value));
}

function isDescriptivePhrase(value) {
  if (!value) return false;
  if (!/[A-Za-zÀ-ÿ]/.test(value)) return false;
  if (!hasEnoughWords(value)) return false;

  return DESCRIPTIVE_TITLE_PATTERNS.some((pattern) => pattern.test(value));
}

function extractPhraseFromSource(value) {
  for (const pattern of PHRASE_PATTERNS) {
    const match = pattern.exec(value);
    const phrase = sanitizePhrase(match?.[1] || '');
    if (isDescriptivePhrase(phrase)) {
      return phrase;
    }
  }

  return null;
}

export function detectDocumentLanguageCode({ url = '', title = '', text = '' }) {
  const haystack = `${url} ${title} ${text}`.toLowerCase();

  if (
    /\bportuguese\b/.test(haystack) ||
    /\bportugu[eê]s\b/.test(haystack) ||
    /\bautoriza[cç][aã]o\b/.test(haystack) ||
    /\bdivulga[cç][aã]o\b/.test(haystack) ||
    /\binforma[cç][oõ]es(?:\s+m[eé]dicas?)?\b/.test(haystack) ||
    /\bsa[úu]de\b/.test(haystack)
  ) {
    return 'PT';
  }

  if (
    /\bspanish\b/.test(haystack) ||
    /\bespanol\b/.test(haystack) ||
    /\bespa[nñ]ol\b/.test(haystack) ||
    /\bautorizaci[oó]n\b/.test(haystack) ||
    /\bdivulgaci[oó]n\b/.test(haystack) ||
    /\binformaci[oó]n m[eé]dica\b/.test(haystack) ||
    /\bregistros? m[eé]dicos?\b/.test(haystack)
  ) {
    return 'ES';
  }

  return 'EN';
}

export function extractDescriptivePdfPhrase({ title = '', text = '' }) {
  const cleanedTitle = sanitizePhrase(cleanPhraseSource(title));
  if (cleanedTitle && !isGenericTitle(cleanedTitle)) {
    const titlePhrase = extractPhraseFromSource(cleanedTitle);
    if (titlePhrase) {
      return titlePhrase;
    }

    if (!isMachineTitle(cleanedTitle) && isDescriptivePhrase(cleanedTitle)) {
      return cleanedTitle;
    }
  }

  const cleanedText = cleanPhraseSource(text);
  const textPhrase = extractPhraseFromSource(cleanedText);
  if (textPhrase) {
    return textPhrase;
  }

  const firstSentence = sanitizePhrase(cleanedText.split(/[.:]/, 1)[0] || '');
  if (isDescriptivePhrase(firstSentence)) {
    return firstSentence;
  }

  return null;
}

export function buildMedicalRecordsPdfFilenameStem({
  systemName,
  facilityName,
  url,
  title,
  text
}) {
  const label = facilityName || inferFacilityNameFromDocument({ systemName, url, title }) || systemName;
  const facilitySlug = slugifyLabel(label);
  const languageCode = detectDocumentLanguageCode({ url, title, text });
  const phrase = extractDescriptivePdfPhrase({ title, text }) || 'medical-records-request';
  const phraseSlug = slugifyLabel(phrase);
  return `${facilitySlug}-${phraseSlug}-${languageCode}`;
}

export function buildMedicalRecordsPdfFilenameStems(args, { limit = 6 } = {}) {
  const baseStem = buildMedicalRecordsPdfFilenameStem(args);
  const candidateStems = [baseStem];

  let sequence = 2;
  while (candidateStems.length < Math.max(1, limit)) {
    candidateStems.push(`${baseStem}-${sequence}`);
    sequence += 1;
  }

  return candidateStems;
}
