import { collapseWhitespace, excerptForPattern, uniqueBy } from '../utils/text.js';

const PORTAL_SIGNATURES = [
  { name: 'MyChart', pattern: /\bmychart\b/i },
  { name: 'MyHealthONE', pattern: /\bmyhealthone\b/i },
  { name: 'HealthMark', pattern: /\bhealthmark\b/i },
  { name: 'Verisma', pattern: /\bverisma\b/i }
];

const FORM_PATTERNS = [/authorization for release/i, /authorization to disclose/i, /release of information/i, /\bROI\b/i];

const FORMAL_REQUEST_PATTERNS = [
  /complete copy/i,
  /formal copy/i,
  /authorization form/i,
  /request copies of (your )?medical records/i,
  /medical records department/i,
  /release of information/i
];

const METHOD_PATTERNS = {
  onlineRequest: [/online request/i, /submit.*online/i, /electronic request/i, /e[-\s]?request/i],
  email: [/\bemail\b/i],
  fax: [/\bfax\b/i],
  mail: [/\bmail\b/i, /mailing address/i],
  inPerson: [/in person/i, /walk in/i],
  phone: [/\bphone\b/i, /call\s+\d{3}/i]
};

const IMAGING_PATTERNS = [/imaging records/i, /radiology images?/i, /request imaging/i, /CD of images/i];
const BILLING_PATTERNS = [/billing records?/i, /billing statements?/i, /itemized bill/i];
const AMENDMENT_PATTERNS = [/amend(ment| your record)/i, /correct(ion)? of (your )?record/i];

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function detectPortal(text, links) {
  for (const signature of PORTAL_SIGNATURES) {
    if (!signature.pattern.test(text)) continue;

    const matchingLink = links.find(
      (link) =>
        signature.pattern.test(link.text || '') ||
        signature.pattern.test(link.href || '') ||
        /patient\-portal|portal/i.test(link.href || '')
    );

    return {
      name: signature.name,
      url: matchingLink?.href || null
    };
  }

  const genericPortalLink = links.find((link) => /portal/i.test(`${link.text} ${link.href}`));
  if (genericPortalLink) {
    return {
      name: collapseWhitespace(genericPortalLink.text) || 'Patient Portal',
      url: genericPortalLink.href
    };
  }

  return { name: null, url: null };
}

function classifyPortalScope(text, hasPortal) {
  if (!hasPortal) return 'none';

  if (/(full|complete)\s+(medical|health)?\s*records?.{0,30}(portal|mychart|myhealthone)/i.test(text)) {
    return 'full';
  }

  if (/most\s+records/i.test(text)) {
    return 'most_records';
  }

  if (/(portion|portions|partial|some)\s+of\s+(their|your)?\s*(medical|health)?\s*records/i.test(text)) {
    return 'partial';
  }

  if (/view\s+(your\s+)?records\s+(online|in|through|via)/i.test(text)) {
    return 'most_records';
  }

  return 'unclear';
}

function detectSupportsFormalCopyInPortal(text, portalName) {
  if (!portalName) return null;

  if (/(formal|complete)\s+copy.{0,80}(mychart|portal|myhealthone)/i.test(text)) {
    return true;
  }

  if (/request(ing)?\s+(your\s+)?record.{0,80}(mychart|portal)/i.test(text)) {
    return true;
  }

  if (/cannot be requested.{0,60}(mychart|portal)/i.test(text)) {
    return false;
  }

  return false;
}

function detectRequestMethods(text, portalDetected, supportsFormalCopyInPortal, links) {
  const linkText = links.map((link) => `${link.text} ${link.href}`).join(' ');
  const combined = `${text} ${linkText}`;

  const matches = (patterns) => hasAny(combined, patterns);

  const portalRequestAvailable =
    Boolean(portalDetected) && (supportsFormalCopyInPortal || /request.{0,40}(mychart|portal)/i.test(combined));

  return {
    onlineRequest: matches(METHOD_PATTERNS.onlineRequest) || links.some((link) => /request/i.test(link.text || '')),
    portal: portalRequestAvailable || /mychart|myhealthone|portal/i.test(combined),
    email: matches(METHOD_PATTERNS.email) || links.some((link) => (link.href || '').startsWith('mailto:')),
    fax: matches(METHOD_PATTERNS.fax),
    mail: matches(METHOD_PATTERNS.mail),
    inPerson: matches(METHOD_PATTERNS.inPerson),
    phone: matches(METHOD_PATTERNS.phone) || links.some((link) => (link.href || '').startsWith('tel:'))
  };
}

function inferWorkflowTypes(text) {
  const types = new Set();

  if (/medical records|health record|release of information|authorization/i.test(text)) {
    types.add('medical_records');
  }

  if (hasAny(text, IMAGING_PATTERNS)) {
    types.add('imaging');
  }

  if (hasAny(text, BILLING_PATTERNS)) {
    types.add('billing');
  }

  if (hasAny(text, AMENDMENT_PATTERNS)) {
    types.add('amendment');
  }

  if (types.size === 0) {
    types.add('other');
  }

  return Array.from(types);
}

function inferRequestScope({ workflowType, methods, formalRequestRequired }) {
  if (workflowType === 'imaging') return 'imaging_only';
  if (workflowType === 'billing') return 'billing_only';

  if (methods.portal && formalRequestRequired) return 'mixed';
  if (methods.portal && !formalRequestRequired) return 'portal_records';
  if (!methods.portal && formalRequestRequired) return 'complete_chart';
  return 'unclear';
}

function detectForms(links) {
  const forms = links
    .filter((link) => {
      const haystack = `${link.text} ${link.href}`;
      const likelyForm =
        /form|authorization|release|disclose|roi/i.test(haystack) ||
        /\.(pdf|docx?|html)$/i.test(link.href || '') ||
        /docusign/i.test(haystack);
      return likelyForm;
    })
    .map((link) => {
      let format = 'other';
      if (/\.pdf($|\?)/i.test(link.href || '')) format = 'pdf';
      else if (/\.docx?($|\?)/i.test(link.href || '')) format = 'doc';
      else if (/docusign/i.test(`${link.text} ${link.href}`)) format = 'docusign';
      else if (/\.html?($|\?)/i.test(link.href || '')) format = 'html';

      return {
        name: collapseWhitespace(link.text) || 'Authorization Form',
        url: link.href,
        format,
        requiredForRequest: FORM_PATTERNS.some((pattern) => pattern.test(link.text || ''))
      };
    });

  return uniqueBy(forms, (form) => form.url);
}

function normalizeContacts(existingContacts, links, portal) {
  const contacts = [...existingContacts];

  for (const link of links) {
    if ((link.href || '').startsWith('mailto:')) {
      contacts.push({
        type: 'email',
        label: link.text || null,
        value: link.href.replace(/^mailto:/i, '')
      });
    } else if ((link.href || '').startsWith('tel:')) {
      contacts.push({
        type: 'phone',
        label: link.text || null,
        value: link.href.replace(/^tel:/i, '')
      });
    } else if (/online request|request online|submit request/i.test(link.text || '')) {
      contacts.push({
        type: 'online_request_url',
        label: link.text || 'Online Request',
        value: link.href
      });
    }
  }

  if (portal?.url) {
    contacts.push({
      type: 'portal_url',
      label: portal.name || 'Patient Portal',
      value: portal.url
    });
  }

  return uniqueBy(
    contacts
      .filter((contact) => contact?.value)
      .map((contact) => ({
        type: contact.type,
        label: contact.label || null,
        value: collapseWhitespace(contact.value)
      })),
    (contact) => `${contact.type}:${contact.value}`
  );
}

function pickNotes(text) {
  const turnaround = excerptForPattern(
    text,
    /(turnaround|within\s+\d+\s+(business\s+)?days?|processing\s+time)/i
  );
  const fee = excerptForPattern(text, /(fee|charge|cost)/i);

  const specialMatches = [
    excerptForPattern(text, /radiology images cannot be requested/i),
    excerptForPattern(text, /imaging (may|must).{0,50}separate/i),
    excerptForPattern(text, /some records may only be available through (the )?medical records office/i)
  ].filter(Boolean);

  return {
    turnaround,
    fee,
    specialInstructions: specialMatches.join(' | ') || null
  };
}

function computeConfidence({ methods, forms, formalRequestRequired, isOfficialDomain, portalScope }) {
  const methodCount = Object.values(methods).filter(Boolean).length;

  if (isOfficialDomain && (methodCount >= 2 || forms.length > 0)) return 'high';
  if (isOfficialDomain && (formalRequestRequired || portalScope !== 'none')) return 'medium';
  return 'low';
}

function evidenceSnippets(text) {
  const patterns = [
    /request copies of (your )?medical records/i,
    /authorization for release/i,
    /authorization to disclose/i,
    /formal copy of health record/i,
    /mychart/i,
    /myhealthone/i,
    /healthmark/i,
    /verisma/i,
    /radiology images cannot be requested/i,
    /fax/i,
    /mailing address/i,
    /email/i
  ];

  return patterns
    .map((pattern) => excerptForPattern(text, pattern))
    .filter(Boolean)
    .slice(0, 12);
}

export function extractWorkflowBundle(document, context) {
  const text = collapseWhitespace(`${document.title || ''} ${document.text || ''}`);

  const portalDetected = detectPortal(text, document.links || []);
  const portalScope = classifyPortalScope(text, Boolean(portalDetected.name || portalDetected.url));
  const supportsFormalCopyRequestInPortal = detectSupportsFormalCopyInPortal(text, portalDetected.name);

  const formalRequestRequired = hasAny(text, FORMAL_REQUEST_PATTERNS);
  const methods = detectRequestMethods(
    text,
    Boolean(portalDetected.name || portalDetected.url),
    supportsFormalCopyRequestInPortal,
    document.links || []
  );

  const forms = detectForms(document.links || []);
  const contacts = normalizeContacts(document.contacts || [], document.links || [], portalDetected);

  const types = inferWorkflowTypes(text);
  const notes = pickNotes(text);

  const confidence = computeConfidence({
    methods,
    forms,
    formalRequestRequired,
    isOfficialDomain: context.isOfficialDomain,
    portalScope
  });

  const workflows = types.map((workflowType) => ({
    workflowType,
    requestScope: inferRequestScope({ workflowType, methods, formalRequestRequired }),
    formalRequestRequired,
    onlineRequestAvailable: methods.onlineRequest,
    portalRequestAvailable: methods.portal,
    emailAvailable: methods.email,
    faxAvailable: methods.fax,
    mailAvailable: methods.mail,
    inPersonAvailable: methods.inPerson,
    phoneAvailable: methods.phone,
    turnaroundNotes: notes.turnaround,
    feeNotes: notes.fee,
    specialInstructions: notes.specialInstructions,
    contacts,
    forms,
    evidenceSnippets: evidenceSnippets(text),
    confidence
  }));

  return {
    portal: {
      portalName: portalDetected.name,
      portalUrl: portalDetected.url,
      portalScope,
      supportsFormalCopyRequestInPortal
    },
    workflows,
    confidence,
    evidenceSnippets: evidenceSnippets(text)
  };
}
