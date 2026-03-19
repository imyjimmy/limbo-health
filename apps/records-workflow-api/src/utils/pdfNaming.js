import { collapseWhitespace } from './text.js';
import { inferFacilityNameFromDocument } from './facilityAliases.js';
import {
  buildPdfHeaderText,
  isLikelyPdfHeaderAddressLine,
  isLikelyPdfHeaderFieldLine
} from './pdfHeader.js';

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
  /\bproxy\b/i,
  /\bmychart\b/i,
  /\bportal\b/i,
  /\bconsent\b/i,
  /\bautorizaci[oó]n\b/i,
  /\bautoriza[cç][aã]o\b/i
];

const PHRASE_PATTERNS = [
  /\b((?:for patients [^.:]{0,50}\s+)?my\s*chart proxy access(?:\s+request(?:\s*(?:and|&)\s*authorization form)?)?(?:\s+authorization form)?)/i,
  /\b((?:proxy access request(?:\s*(?:and|&)\s*authorization form)?)|(?:request(?:\s*(?:and|&)\s*authorization form)? for proxy access))/i,
  /\b(consent for patient portal access)\b/i,
  /\b(patient request for health information)/i,
  /\b(patient request for access to designated record set)/i,
  /\b(patient request to amend a designated record set)/i,
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
      .replace(/\bmy\s+chart\b/gi, 'MyChart')
      .replace(/\bolder\b/gi, 'older')
      .replace(/\byears?\s*old\b/gi, 'years old')
      .replace(/[“”"]/g, '')
  );
}

function isLikelyHeaderTitleStarter(line) {
  return (
    /^for patients\b/i.test(line) ||
    /\b(?:authori[sz](?:ation|e)|request|medical records|my\s*chart|proxy access|portal|consent|autorizaci[oó]n|autoriza[cç][aã]o)\b/i.test(
      line
    )
  );
}

function isLikelyHeaderTitleContinuation(line) {
  if (!line) return false;
  if (/^requirements?$/i.test(line)) return false;
  if (/^by signing this form\b/i.test(line)) return false;
  if (/^i understand\b/i.test(line)) return false;
  if (/^page\b/i.test(line)) return false;
  return isLikelyHeaderTitleStarter(line);
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

export function detectDocumentLanguageCode({ url = '', title = '', headerText = '', text = '' }) {
  const priorityHaystack = collapseWhitespace(`${url} ${title} ${headerText}`).toLowerCase();
  const bodyHaystack = text.toLowerCase();

  const detectExplicitLanguageCode = (haystack) => {
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

    return null;
  };

  const priorityLanguageCode = detectExplicitLanguageCode(priorityHaystack);
  if (priorityLanguageCode) {
    return priorityLanguageCode;
  }

  if (/[a-zà-ÿ]/i.test(priorityHaystack)) {
    return 'EN';
  }

  return detectExplicitLanguageCode(bodyHaystack) || 'EN';
}

function buildHeaderPhraseSource(headerLines = [], headerText = '') {
  const normalizedLines = headerLines
    .map((line) => ({
      text: collapseWhitespace(line?.text || ''),
      fontSize: Number(line?.fontSize || 0)
    }))
    .filter((line) => line.text)
    .filter((line) => !isLikelyPdfHeaderFieldLine(line.text))
    .filter((line) => !isLikelyPdfHeaderAddressLine(line.text));

  if (normalizedLines.length > 0) {
    const headerTitleStart = normalizedLines.findIndex((line) => isLikelyHeaderTitleStarter(line.text));
    if (headerTitleStart >= 0) {
      const titleLines = [];

      for (const line of normalizedLines.slice(headerTitleStart, headerTitleStart + 4)) {
        if (titleLines.length === 0) {
          titleLines.push(line);
          continue;
        }

        const previous = titleLines[titleLines.length - 1];
        const keepsTitleBlock =
          isLikelyHeaderTitleContinuation(line.text) &&
          (!previous.fontSize ||
            !line.fontSize ||
            line.fontSize >= previous.fontSize * 0.8 ||
            /^for patients\b/i.test(previous.text));

        if (!keepsTitleBlock) {
          break;
        }

        titleLines.push(line);
      }

      return cleanPhraseSource(titleLines.map((line) => line.text).join(' '));
    }
  }

  if (!Array.isArray(headerLines) || headerLines.length === 0) {
    return cleanPhraseSource(headerText);
  }

  return '';
}

function extractPhraseFromUrl(url = '') {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    const pathname = decodeURIComponent(parsedUrl.pathname || '');
    const basename = pathname.split('/').filter(Boolean).pop() || '';
    const candidate = sanitizePhrase(
      cleanPhraseSource(
        basename
          .replace(/\.[a-z0-9]+$/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\b\d{4,}\b/g, ' ')
      )
    );

    if (!candidate) return null;

    const phrase = extractPhraseFromSource(candidate);
    if (phrase) {
      return phrase;
    }

    if (!isMachineTitle(candidate) && isDescriptivePhrase(candidate)) {
      return candidate;
    }
  } catch {
    return null;
  }

  return null;
}

export function extractDescriptivePdfPhrase({
  url = '',
  title = '',
  text = '',
  headerText = '',
  headerLines = []
}) {
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

  const cleanedHeaderText = buildHeaderPhraseSource(headerLines, headerText);
  const headerPhrase = extractPhraseFromSource(cleanedHeaderText);
  if (headerPhrase) {
    return headerPhrase;
  }

  const headerSentence = sanitizePhrase(cleanedHeaderText.split(/[.:]/, 1)[0] || '');
  if (isDescriptivePhrase(headerSentence)) {
    return headerSentence;
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

  const urlPhrase = extractPhraseFromUrl(url);
  if (urlPhrase) {
    return urlPhrase;
  }

  return null;
}

export function buildMedicalRecordsPdfFilenameStem({
  systemName,
  facilityName,
  url,
  title,
  text,
  headerText = '',
  headerLines = []
}) {
  const normalizedHeaderText = buildPdfHeaderText(headerLines) || headerText;
  const label =
    facilityName ||
    inferFacilityNameFromDocument({ systemName, url, title, headerLines }) ||
    systemName;
  const facilitySlug = slugifyLabel(label);
  const languageCode = detectDocumentLanguageCode({
    url,
    title,
    headerText: normalizedHeaderText,
    text
  });
  const phrase =
    extractDescriptivePdfPhrase({
      url,
      title,
      text,
      headerText: normalizedHeaderText,
      headerLines
    }) ||
    'medical-records-request';
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
