import {
  hostFromUrl,
  isLikelyDirectRecordsPageLink,
  isLikelyWorkflowLink,
} from '../utils/urls.js';

const APPROVED_EXTERNAL_DOMAINS = [
  'healthmark-group.com',
  'myhealthone.com',
  'mychart.com',
  'verisma.com',
  'docusign.net',
  'hcahealthcare.com',
  'hcadam.com',
  'swellbox.com'
];

export function expandCandidateLinks({ document, allowedDomain, mode = 'general' }) {
  if (!document || !Array.isArray(document.links)) return [];

  const linkMatcher =
    mode === 'records_page' ? isLikelyDirectRecordsPageLink : isLikelyWorkflowLink;

  return document.links
    .filter((link) =>
      linkMatcher({
        href: link.href,
        text: link.text,
        contextText: link.contextText || '',
        allowedDomain,
        approvedExternal: APPROVED_EXTERNAL_DOMAINS,
        sourceTitle: document.title || '',
        sourceText: document.text || ''
      })
    )
    .map((link) => ({
      url: link.href,
      text: link.text || '',
      contextText: link.contextText || '',
      sourceUrl: document.url || '',
      sourceTitle: document.title || '',
      sourceText: document.text || ''
    }))
    .filter((link) => Boolean(link.url));
}

export function isOfficialDomain(url, canonicalDomain) {
  const host = hostFromUrl(url);
  return host === canonicalDomain || host.endsWith(`.${canonicalDomain}`);
}
