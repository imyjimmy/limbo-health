import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { collapseWhitespace, uniqueBy } from '../utils/text.js';
import { buildPdfHeaderText, normalizePdfHeaderLineText } from '../utils/pdfHeader.js';
import { resolvePythonExecutable } from '../utils/pythonRuntime.js';

const URL_PATTERN = /https?:\/\/[^\s)\]]+/gi;
const PHONE_PATTERN =
  /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const execFile = promisify(execFileCallback);
const PDF_EXTRACTOR_PATH = fileURLToPath(new URL('./pdf_extract.py', import.meta.url));

function normalizeHeaderLines(rawHeaderLines = []) {
  return rawHeaderLines
    .map((line) => ({
      text: normalizePdfHeaderLineText(line?.text || ''),
      x: Number(line?.x || 0),
      y: Number(line?.y || 0),
      fontSize: Number(line?.fontSize || 0)
    }))
    .filter((line) => line.text);
}

function buildParseFailureResult(parseError = '') {
  return {
    sourceType: 'pdf',
    title: '',
    text: '',
    headerText: '',
    headerLines: [],
    pages: [],
    headings: [],
    paragraphs: [],
    links: [],
    contacts: [],
    parseStatus: 'failed',
    repairAttempted: false,
    repaired: false,
    parseError: collapseWhitespace(parseError || '')
  };
}

async function withTemporaryPdfPath(buffer, filePath) {
  if (filePath) {
    return { pdfPath: filePath, cleanup: async () => {} };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-pdf-'));
  const tempPdfPath = path.join(tempDir, 'document.pdf');
  await fs.writeFile(tempPdfPath, buffer);

  return {
    pdfPath: tempPdfPath,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

export async function parsePdfDocument({ buffer, filePath = null }) {
  const { pdfPath, cleanup } = await withTemporaryPdfPath(buffer, filePath);

  try {
    const pythonBin = resolvePythonExecutable({ overrideEnvVar: 'RECORDS_PDF_PYTHON_BIN' });
    const { stdout } = await execFile(pythonBin, [PDF_EXTRACTOR_PATH, pdfPath], {
      maxBuffer: 20 * 1024 * 1024
    });
    const parsed = JSON.parse(stdout || '{}');
    const rawText = parsed?.text || '';
    const text = rawText ? collapseWhitespace(rawText) : '';
    const headerLines = normalizeHeaderLines(parsed?.headerLines || []);
    const headerText = buildPdfHeaderText(headerLines);

    const links = uniqueBy(
      [
        ...((parsed?.links || []).map((url) => ({
          text: url,
          href: url
        })) || []),
        ...((rawText.match(URL_PATTERN) || []).map((url) => ({
          text: url,
          href: url
        })) || [])
      ],
      (link) => link.href
    );

    const contacts = [];

    for (const phone of rawText.match(PHONE_PATTERN) || []) {
      contacts.push({ type: 'phone', value: collapseWhitespace(phone) });
    }

    for (const email of rawText.match(EMAIL_PATTERN) || []) {
      contacts.push({ type: 'email', value: email.toLowerCase() });
    }

    return {
      sourceType: 'pdf',
      title: collapseWhitespace(parsed?.title || ''),
      text,
      headerText,
      headerLines,
      pages: Array.isArray(parsed?.pages) ? parsed.pages : [],
      headings: [],
      paragraphs: [],
      links,
      contacts: uniqueBy(contacts, (contact) => `${contact.type}:${contact.value}`),
      parseStatus: parsed?.parseStatus || (text ? 'success' : 'empty_text'),
      repairAttempted: Boolean(parsed?.repairAttempted),
      repaired: Boolean(parsed?.repaired),
      parseError: collapseWhitespace(parsed?.parseError || '')
    };
  } catch (error) {
    return buildParseFailureResult(error?.message || 'PDF parser invocation failed.');
  } finally {
    await cleanup();
  }
}
