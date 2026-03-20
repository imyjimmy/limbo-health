import { load } from 'cheerio';
import { collapseWhitespace, uniqueBy } from '../utils/text.js';
import { normalizeUrl } from '../utils/urls.js';

const PHONE_PATTERN =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const ADDRESS_PATTERN =
  /\b\d{1,6}\s+[A-Za-z0-9.#\-\s]+\b(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Drive|Dr\.?|Lane|Ln\.?|Boulevard|Blvd\.?|Way|Court|Ct\.?|Suite|Ste\.?)/i;

function extractContactCandidates(text, links) {
  const contacts = [];

  const phones = text.match(PHONE_PATTERN) || [];
  for (const phone of phones) {
    contacts.push({ type: 'phone', value: collapseWhitespace(phone) });
  }

  const emails = text.match(EMAIL_PATTERN) || [];
  for (const email of emails) {
    contacts.push({ type: 'email', value: email.toLowerCase() });
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const [index, line] of lines.entries()) {
    if (!ADDRESS_PATTERN.test(line)) continue;
    const maybeCityState = lines[index + 1] || '';
    const combined = collapseWhitespace(`${line} ${maybeCityState}`);
    contacts.push({ type: 'mailing_address', value: combined });
  }

  for (const link of links) {
    if (link.href?.startsWith('tel:')) {
      contacts.push({ type: 'phone', value: link.href.replace(/^tel:/i, '').trim() });
    }
    if (link.href?.startsWith('mailto:')) {
      contacts.push({ type: 'email', value: link.href.replace(/^mailto:/i, '').trim().toLowerCase() });
    }
  }

  return uniqueBy(contacts, (contact) => `${contact.type}:${contact.value}`);
}

function collectLinkContext($, node) {
  const linkText = collapseWhitespace($(node).text());
  const contextParts = [];
  let current = $(node);

  for (let depth = 0; depth < 4; depth += 1) {
    const parent = current.parent();
    if (!parent.length || parent.is('body') || parent.is('html')) {
      break;
    }

    const nearbyParts = [];

    const siblingText = (elements) =>
      elements
        .toArray()
        .map((element) => collapseWhitespace($(element).text()))
        .filter(Boolean);

    nearbyParts.push(...siblingText(parent.prevAll().slice(0, 2)));
    nearbyParts.push(...siblingText(parent.nextAll().slice(0, 1)));

    const parentClone = parent.clone();
    parentClone.find('a').remove();
    const parentText = collapseWhitespace(parentClone.text());
    if (parentText) {
      nearbyParts.push(parentText);
    }

    const sanitized = uniqueBy(
      nearbyParts
        .map((text) => text.replace(/\s+/g, ' ').trim())
        .filter((text) => text && text !== linkText && text.length > 2 && text.length <= 280),
      (text) => text.toLowerCase()
    );

    if (sanitized.length > 0) {
      contextParts.push(...sanitized);

      if (contextParts.join(' ').length >= 40) {
        break;
      }
    }

    current = parent;
  }

  return uniqueBy(contextParts, (text) => text.toLowerCase()).join(' ').slice(0, 400);
}

export function parseHtmlDocument({ html, url }) {
  const $ = load(html);

  $('script, style, noscript, svg').remove();

  const title = collapseWhitespace($('title').first().text());

  const headings = $('h1, h2, h3')
    .toArray()
    .map((node) => collapseWhitespace($(node).text()))
    .filter(Boolean);

  const paragraphs = $('p, li')
    .toArray()
    .map((node) => collapseWhitespace($(node).text()))
    .filter(Boolean);

  const links = $('a[href]')
    .toArray()
    .map((node) => {
      const href = $(node).attr('href');
      return {
        text: collapseWhitespace($(node).text()),
        href: normalizeUrl(href, url),
        contextText: collectLinkContext($, node)
      };
    })
    .filter((link) => Boolean(link.href));

  const bodyTextRaw = $('body').text() || '';
  const bodyText = collapseWhitespace(bodyTextRaw);

  const contacts = extractContactCandidates(bodyTextRaw, links);

  return {
    sourceType: 'html',
    url,
    title,
    text: bodyText,
    headings,
    paragraphs,
    links,
    contacts
  };
}
