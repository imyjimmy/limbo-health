import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sha256 } from '../utils/hash.js';
import { ensureRawStorageStateDir } from '../utils/rawStorage.js';
import { fetchHttpDocument } from './httpFetcher.js';
import { parseHtmlDocument } from '../parsers/htmlParser.js';
import { parsePdfDocument } from '../parsers/pdfParser.js';

export function detectSourceType(url, contentType) {
  const normalized = (contentType || '').toLowerCase();
  if (
    normalized.includes('html') ||
    normalized.includes('xml') ||
    normalized.startsWith('text/')
  ) {
    return 'html';
  }

  if (normalized.includes('pdf')) {
    return 'pdf';
  }

  if (/\.pdf($|\?)/i.test(url)) {
    return 'pdf';
  }

  return 'html';
}

export async function fetchAndParseDocument({
  url,
  timeoutMs = config.crawl.timeoutMs,
  state = null
}) {
  const response = await fetchHttpDocument({ url, timeoutMs });
  const finalUrl = response.finalUrl;
  const contentType = response.headers['content-type'] || '';
  const sourceType = detectSourceType(finalUrl, contentType);
  const bodyBuffer = response.bodyBuffer;
  const contentHash = sha256(bodyBuffer);

  let storagePath = null;
  if (state && sourceType === 'pdf') {
    const stateStorageDir = await ensureRawStorageStateDir(state);
    storagePath = path.join(stateStorageDir, `${contentHash}.pdf`);
    await fs.writeFile(storagePath, bodyBuffer);
  } else if (state && sourceType === 'html') {
    const stateStorageDir = await ensureRawStorageStateDir(state);
    const htmlStorageDir = path.join(stateStorageDir, 'crawl-html');
    storagePath = path.join(htmlStorageDir, `${contentHash}.html`);
    await fs.mkdir(htmlStorageDir, { recursive: true });
    await fs.writeFile(storagePath, bodyBuffer);
  }

  let parsed;
  if (sourceType === 'pdf') {
    parsed = await parsePdfDocument({ buffer: bodyBuffer, filePath: storagePath });
  } else {
    const html = bodyBuffer.toString('utf8');
    parsed = parseHtmlDocument({ html, url: finalUrl });
  }

  return {
    sourceUrl: url,
    finalUrl,
    sourceType,
    status: response.status,
    title: parsed.title || null,
    fetchedAt: new Date().toISOString(),
    contentHash,
    storagePath,
    extractedText: parsed.text || '',
    parserVersion: config.crawl.parserVersion,
    parsed
  };
}
