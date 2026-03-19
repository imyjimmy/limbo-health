import pdfParse from 'pdf-parse';
import { collapseWhitespace, uniqueBy } from '../utils/text.js';
import { buildPdfHeaderLines, buildPdfHeaderText } from '../utils/pdfHeader.js';

const URL_PATTERN = /https?:\/\/[^\s)\]]+/gi;
const PHONE_PATTERN =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export async function parsePdfDocument({ buffer }) {
  let renderedPageCount = 0;
  let headerLines = [];

  const parsed = await pdfParse(buffer, {
    pagerender: (pageData) =>
      pageData
        .getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false
        })
        .then((textContent) => {
          renderedPageCount += 1;

          if (renderedPageCount === 1) {
            const viewport = pageData.getViewport(1.0);
            headerLines = buildPdfHeaderLines({
              items: textContent.items,
              pageHeight: viewport.height
            });
          }

          let lastY;
          let text = '';

          for (const item of textContent.items) {
            if (lastY == item.transform[5] || !lastY) {
              text += item.str;
            } else {
              text += `\n${item.str}`;
            }
            lastY = item.transform[5];
          }

          return text;
        })
  });
  const text = parsed?.text ? collapseWhitespace(parsed.text) : '';
  const headerText = buildPdfHeaderText(headerLines);

  const links = (parsed?.text?.match(URL_PATTERN) || []).map((url) => ({
    text: url,
    href: url
  }));

  const contacts = [];

  for (const phone of parsed?.text?.match(PHONE_PATTERN) || []) {
    contacts.push({ type: 'phone', value: collapseWhitespace(phone) });
  }

  for (const email of parsed?.text?.match(EMAIL_PATTERN) || []) {
    contacts.push({ type: 'email', value: email.toLowerCase() });
  }

  return {
    sourceType: 'pdf',
    title: collapseWhitespace(parsed?.info?.Title || ''),
    text,
    headerText,
    headerLines,
    headings: [],
    paragraphs: [],
    links,
    contacts: uniqueBy(contacts, (contact) => `${contact.type}:${contact.value}`)
  };
}
