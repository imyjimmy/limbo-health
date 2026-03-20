import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const SCRAPLING_FETCHER_PATH = fileURLToPath(new URL('./scrapling_fetch.py', import.meta.url));
const MAX_FETCH_BUFFER_BYTES = 100 * 1024 * 1024;

function normalizeHeaders(headers = {}) {
  if (!headers) return {};

  if (typeof headers.entries === 'function') {
    return Object.fromEntries(
      Array.from(headers.entries()).map(([key, value]) => [key.toLowerCase(), String(value)])
    );
  }

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
}

async function fetchWithNode({ url, timeoutMs }) {
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

    return {
      status: response.status,
      finalUrl: response.url,
      headers: normalizeHeaders(response.headers),
      bodyBuffer: Buffer.from(await response.arrayBuffer())
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithScrapling({ url }) {
  const { stdout } = await execFile('python3', [SCRAPLING_FETCHER_PATH, url], {
    maxBuffer: MAX_FETCH_BUFFER_BYTES
  });
  const payload = JSON.parse(stdout || '{}');

  return {
    status: Number(payload.status || 0),
    finalUrl: payload.finalUrl || url,
    headers: normalizeHeaders(payload.headers || {}),
    bodyBuffer: Buffer.from(payload.bodyBase64 || '', 'base64')
  };
}

export async function fetchHttpDocument({ url, timeoutMs }) {
  const backend = (process.env.RECORDS_FETCH_BACKEND || 'scrapling').toLowerCase();

  if (backend === 'node') {
    return fetchWithNode({ url, timeoutMs });
  }

  return fetchWithScrapling({ url, timeoutMs });
}
