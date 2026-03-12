import pdfParse from 'pdf-parse';
import { collapseWhitespace, uniqueBy } from '../utils/text.js';

const URL_PATTERN = /https?:\/\/[^\s)\]]+/gi;
const PHONE_PATTERN =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export async function parsePdfDocument({ buffer }) {
  const parsed = await pdfParse(buffer);
  const text = parsed?.text ? collapseWhitespace(parsed.text) : '';

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
    headings: [],
    paragraphs: [],
    links,
    contacts: uniqueBy(contacts, (contact) => `${contact.type}:${contact.value}`)
  };
}
