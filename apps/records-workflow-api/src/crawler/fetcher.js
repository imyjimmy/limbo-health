import { config } from '../config.js';
import { sha256 } from '../utils/hash.js';
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

  let parsed;
  if (sourceType === 'pdf') {
    parsed = await parsePdfDocument({ buffer: bodyBuffer, filePath: null });
  } else {
    const html = bodyBuffer.toString('utf8');
    parsed = parseHtmlDocument({ html, url: finalUrl });
  }

  return {
    sourceUrl: url,
    finalUrl,
    sourceType,
    status: response.status,
    headers: response.headers || {},
    contentType,
    responseBytes: bodyBuffer.length,
    fetchBackend: response.backend || null,
    title: parsed.title || null,
    fetchedAt: new Date().toISOString(),
    contentHash,
    bodyBuffer,
    extractedText: parsed.text || '',
    parserVersion: config.crawl.parserVersion,
    parsed
  };
}
