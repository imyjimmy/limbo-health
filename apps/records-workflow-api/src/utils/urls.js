const KEYWORD_PATTERN =
  /(medical-records|medical records|request|authorization|release-of-information|\broi\b|mychart|myhealthone|healthmark|verisma|forms?|pdf|imaging|radiology|billing|amend)/i;

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

export function isLikelyWorkflowLink({ href, text = '', allowedDomain, approvedExternal = [] }) {
  const normalized = normalizeUrl(href);
  if (!normalized) return false;

  const host = hostFromUrl(normalized);
  const sameDomain = host === allowedDomain || host.endsWith(`.${allowedDomain}`);
  const externalAllowed = approvedExternal.some(
    (domain) => host === domain || host.endsWith(`.${domain}`)
  );

  if (!sameDomain && !externalAllowed) return false;

  const haystack = `${normalized} ${text}`;
  return KEYWORD_PATTERN.test(haystack);
}
