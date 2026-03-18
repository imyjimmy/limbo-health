import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { sha256 } from '../utils/hash.js';
import { parseHtmlDocument } from '../parsers/htmlParser.js';
import { parsePdfDocument } from '../parsers/pdfParser.js';

function detectSourceType(url, contentType) {
  const normalized = (contentType || '').toLowerCase();
  if (normalized.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
    return 'pdf';
  }
  return 'html';
}

export async function fetchAndParseDocument({ url, timeoutMs = config.crawl.timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'limbo-health-records-crawler/1.0 (+https://github.com/limbo-health/records-workflow-api)'
      }
    });

    const finalUrl = response.url;
    const contentType = response.headers.get('content-type') || '';
    const sourceType = detectSourceType(finalUrl, contentType);
    const bodyBuffer = Buffer.from(await response.arrayBuffer());
    const contentHash = sha256(bodyBuffer);

    let storagePath = null;
    if (sourceType === 'pdf') {
      await fs.mkdir(config.rawStorageDir, { recursive: true });
      storagePath = path.join(config.rawStorageDir, `${contentHash}.pdf`);
      await fs.writeFile(storagePath, bodyBuffer);
    }

    let parsed;
    if (sourceType === 'pdf') {
      parsed = await parsePdfDocument({ buffer: bodyBuffer });
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
  } finally {
    clearTimeout(timeout);
  }
}
