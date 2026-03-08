import { hostFromUrl, isLikelyWorkflowLink } from '../utils/urls.js';

const APPROVED_EXTERNAL_DOMAINS = [
  'healthmark-group.com',
  'myhealthone.com',
  'mychart.com',
  'verisma.com',
  'docusign.net',
  'hcahealthcare.com'
];

export function expandCandidateLinks({ document, allowedDomain }) {
  if (!document || !Array.isArray(document.links)) return [];

  return document.links
    .filter((link) =>
      isLikelyWorkflowLink({
        href: link.href,
        text: link.text,
        allowedDomain,
        approvedExternal: APPROVED_EXTERNAL_DOMAINS
      })
    )
    .map((link) => link.href)
    .filter(Boolean);
}

export function isOfficialDomain(url, canonicalDomain) {
  const host = hostFromUrl(url);
  return host === canonicalDomain || host.endsWith(`.${canonicalDomain}`);
}
