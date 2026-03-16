const HTML_WORKFLOW_PATTERNS = [
  /\bmedical[-\s]?records?\b/i,
  /\bhealth[-\s]?records?\b/i,
  /\bmedical[-\s]?information\b/i,
  /\brequest(?:ing)?\b/i,
  /\bauthori[sz](?:ation|e)\b/i,
  /\brelease[-\s]*(?:of|for)?[-\s]*information\b/i,
  /\broi\b/i,
  /\bautorizaci[oó]n\b/i,
  /\bdivulgaci[oó]n\b/i,
  /\binformaci[oó]n m[eé]dica\b/i,
  /\bregistros? m[eé]dicos?\b/i,
  /\bexpediente m[eé]dico\b/i,
  /\bhistorial m[eé]dico\b/i,
  /\bmychart\b/i,
  /\bmyhealthone\b/i,
  /\bhealthmark\b/i,
  /\bverisma\b/i,
  /\bpatient gateway\b/i,
  /\bmybilh chart\b/i,
  /\bmytuftsmed\b/i,
  /\bmybaystate\b/i,
  /\bmychildren'?s\b/i,
  /\bberkshire patient portal\b/i,
  /\bimaging\b/i,
  /\bradiology\b/i,
  /\bbilling\b/i,
  /\bamend(?:ment)?\b/i,
  /\bportal\b/i
];

const SOURCE_MEDICAL_RECORD_PATTERNS = [
  /\bmedical[-\s]?records?\b/i,
  /\bhealth[-\s]?records?\b/i,
  /\brelease[-\s]*(?:of|for)?[-\s]*information\b/i,
  /\bauthori[sz](?:ation|e)\b/i,
  /\brequest(?:ing)?\b.{0,40}\brecords?\b/i,
  /\broi\b/i,
  /\bmychart\b/i,
  /\bmyhealthone\b/i,
  /\bhealthmark\b/i,
  /\bverisma\b/i,
  /\bpatient gateway\b/i,
  /\bmybilh chart\b/i,
  /\bmytuftsmed\b/i,
  /\bmybaystate\b/i,
  /\bmychildren'?s\b/i,
  /\bberkshire patient portal\b/i
];

const MEDICAL_RECORDS_REQUEST_ACTION_PATTERNS = [
  /\bauthori[sz](?:ation|e)\b/i,
  /\brequest(?:ing)?\b/i,
  /\brelease\b/i,
  /\bdisclos(?:e|ure)\b/i,
  /\bobtain\b/i,
  /\baccess\b/i,
  /\bsolicitud\b/i,
  /\bsolicitar\b/i,
  /\bautorizaci[oó]n\b/i,
  /\bdivulgaci[oó]n\b/i,
  /\broi\b/i
];

const MEDICAL_RECORDS_REQUEST_SUBJECT_PATTERNS = [
  /\bmedical[-\s]?records?\b/i,
  /\bhealth[-\s]?records?\b/i,
  /\broi\b/i,
  /\bmedical[-\s]?information\b/i,
  /\bhealth[-\s]?information\b/i,
  /\bprotected health information\b/i,
  /\bphi\b/i,
  /\brelease[-\s]*(?:of|for)?[-\s]*information\b/i,
  /\bpatient[-\s]?record\b/i,
  /\binformaci[oó]n m[eé]dica\b/i,
  /\bregistros? m[eé]dicos?\b/i,
  /\bexpediente m[eé]dico\b/i,
  /\bhistorial m[eé]dico\b/i
];

const MEDICAL_RECORDS_PDF_STRONG_POSITIVE_PATTERNS = [
  /\bauthorization\s+(for|to)\s+(release|disclos(?:e|ure))\b[\s\S]{0,80}\b(medical|health)\s+(information|records?)\b/i,
  /\brequest\s+(for\s+)?(medical|health)\s+(information|records?)\b/i,
  /\brequest copies of (your )?(medical|health) records\b/i,
  /\brelease of information\b[\s\S]{0,80}\b(medical|health)\s+(information|records?)\b/i,
  /\bpatient request for health information\b/i,
  /\bautorizaci[oó]n\s+para\s+la\s+divulgaci[oó]n\s+de\s+informaci[oó]n\s+m[eé]dica\b/i,
  /\bsolicitud\s+de\s+(informaci[oó]n|registros?)\s+m[eé]dica\b/i
];

const MEDICAL_RECORDS_PDF_LINK_NEGATIVE_PATTERNS = [
  /\badvance directives?\b/i,
  /\bamend(?:ment)?\b/i,
  /\bcorrect(?:ion|ive)?\b/i,
  /\bfinancial\b/i,
  /\bpayment assistance\b/i,
  /\bprice transparency\b/i,
  /\bestimates?\b/i,
  /\bbilling\b/i,
  /\binsurance\b/i,
  /\bmarketplace\b/i,
  /\bpublic reporting\b/i,
  /\bquality performance\b/i,
  /\baco\b/i,
  /\bgood faith estimate\b/i,
  /\bno[-\s]?surprises?\b/i,
  /\bbirth certificate\b/i,
  /\bimaging\b/i,
  /\bradiology\b/i,
  /\bpharmacy\b/i,
  /\bpastoral\b/i,
  /\bmembership\b/i,
  /\bprivacy practices\b/i,
  /\bnotice of privacy\b/i
];

const MEDICAL_RECORDS_DOCUMENT_NEGATIVE_PATTERNS = [
  /\badvance directives?\b/i,
  /\bamend(?:ment)?\b/i,
  /\bcorrect(?:ion|ive)?\b/i,
  /\bfinancial\b/i,
  /\bpayment assistance\b/i,
  /\bprice transparency\b/i,
  /\bestimates?\b/i,
  /\binsurance marketplace\b/i,
  /\bpublic reporting\b/i,
  /\bquality performance\b/i,
  /\baco\b/i,
  /\bgood faith estimate\b/i,
  /\bno[-\s]?surprises?\b/i,
  /\bbirth certificate\b/i,
  /\bimaging\b/i,
  /\bradiology\b/i,
  /\bbilling\b/i,
  /\bpharmacy\b/i,
  /\bpastoral\b/i,
  /\bmembership\b/i,
  /\bprivacy practices\b/i,
  /\bnotice of privacy\b/i,
  /\baccounting[-_\s]+of[-_\s]+disclosure\b/i
];

function looksLikePdf(url) {
  return /\.pdf($|\?)/i.test(url);
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasMedicalRecordsRequestSignal(text) {
  if (matchesAny(text, MEDICAL_RECORDS_PDF_STRONG_POSITIVE_PATTERNS)) {
    return true;
  }

  return (
    matchesAny(text, MEDICAL_RECORDS_REQUEST_ACTION_PATTERNS) &&
    matchesAny(text, MEDICAL_RECORDS_REQUEST_SUBJECT_PATTERNS)
  );
}

export function isLikelyMedicalRecordsPdfLink({
  href,
  text = '',
  sourceTitle = '',
  sourceText = ''
}) {
  const normalized = normalizeUrl(href);
  if (!normalized || !looksLikePdf(normalized)) return false;

  const haystack = `${normalized} ${text}`;
  if (matchesAny(haystack, MEDICAL_RECORDS_PDF_LINK_NEGATIVE_PATTERNS)) {
    return false;
  }

  const sourceHaystack = `${sourceTitle} ${sourceText}`;
  if (sourceHaystack && !matchesAny(sourceHaystack, SOURCE_MEDICAL_RECORD_PATTERNS)) {
    return false;
  }

  return hasMedicalRecordsRequestSignal(haystack);
}

export function isMedicalRecordsRequestDocument({
  url = '',
  title = '',
  text = '',
  links = []
}) {
  const linkHaystack = links.map((link) => `${link.text || ''} ${link.href || ''}`).join(' ');
  const titleUrlHaystack = `${url} ${title}`;
  const haystack = `${titleUrlHaystack} ${text} ${linkHaystack}`;

  if (matchesAny(titleUrlHaystack, MEDICAL_RECORDS_DOCUMENT_NEGATIVE_PATTERNS)) {
    return false;
  }

  return hasMedicalRecordsRequestSignal(haystack);
}

export function normalizeUrl(rawUrl, baseUrl) {
  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

export function hostFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isLikelyWorkflowLink({
  href,
  text = '',
  allowedDomain,
  approvedExternal = [],
  sourceTitle = '',
  sourceText = ''
}) {
  const normalized = normalizeUrl(href);
  if (!normalized) return false;

  const host = hostFromUrl(normalized);
  const sameDomain = host === allowedDomain || host.endsWith(`.${allowedDomain}`);
  const externalAllowed = approvedExternal.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );

  if (!sameDomain && !externalAllowed) return false;

  const haystack = `${normalized} ${text}`;
  if (looksLikePdf(normalized)) {
    return isLikelyMedicalRecordsPdfLink({
      href: normalized,
      text,
      sourceTitle,
      sourceText
    });
  }

  return matchesAny(haystack, HTML_WORKFLOW_PATTERNS);
}
