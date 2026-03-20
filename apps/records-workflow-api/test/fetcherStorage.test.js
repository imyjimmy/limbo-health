import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

function importFresh(relativePath) {
  const baseUrl = new URL(relativePath, import.meta.url).href;
  return import(`${baseUrl}?t=${Date.now()}-${Math.random()}`);
}

test('fetchAndParseDocument does not write html files to raw storage', async () => {
  const rawDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-workflow-html-'));
  const originalRawStorageDir = process.env.RAW_STORAGE_DIR;
  const originalFetchBackend = process.env.RECORDS_FETCH_BACKEND;

  process.env.RAW_STORAGE_DIR = rawDir;
  process.env.RECORDS_FETCH_BACKEND = 'node';

  const html = '<html><head><title>Medical Records</title></head><body><a href="/forms/auth.pdf">Authorization form</a></body></html>';

  test.mock.method(global, 'fetch', async () => ({
    url: 'https://example.org/medical-records',
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null;
      }
    },
    arrayBuffer: async () => Buffer.from(html, 'utf8')
  }));

  try {
    const { fetchAndParseDocument } = await importFresh('../src/crawler/fetcher.js');
    const result = await fetchAndParseDocument({ url: 'https://example.org/medical-records' });

    assert.equal(result.sourceType, 'html');
    assert.equal(result.storagePath, null);
    assert.equal(result.title, 'Medical Records');

    const entries = await fs.readdir(rawDir);
    assert.deepEqual(entries, []);
  } finally {
    test.mock.restoreAll();
    if (originalRawStorageDir == null) {
      delete process.env.RAW_STORAGE_DIR;
    } else {
      process.env.RAW_STORAGE_DIR = originalRawStorageDir;
    }
    if (originalFetchBackend == null) {
      delete process.env.RECORDS_FETCH_BACKEND;
    } else {
      process.env.RECORDS_FETCH_BACKEND = originalFetchBackend;
    }
    await fs.rm(rawDir, { recursive: true, force: true });
  }
});

test('fetchAndParseDocument writes pdf files into a state subdirectory', async () => {
  const rawDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-workflow-pdf-'));
  const originalRawStorageDir = process.env.RAW_STORAGE_DIR;
  const originalFetchBackend = process.env.RECORDS_FETCH_BACKEND;

  process.env.RAW_STORAGE_DIR = rawDir;
  process.env.RECORDS_FETCH_BACKEND = 'node';

  test.mock.method(global, 'fetch', async () => ({
    url: 'https://example.org/forms/request.pdf',
    status: 200,
    headers: {
      get(name) {
        return name.toLowerCase() === 'content-type' ? 'application/pdf' : null;
      }
    },
    arrayBuffer: async () => Buffer.from('%PDF-1.4 mock pdf body', 'utf8')
  }));

  test.mock.module('../src/parsers/pdfParser.js', {
    namedExports: {
      parsePdfDocument: async () => ({
        title: 'Authorization Form',
        text: 'Authorization for release of information',
        links: []
      })
    }
  });

  try {
    const { fetchAndParseDocument } = await importFresh('../src/crawler/fetcher.js');
    const result = await fetchAndParseDocument({ url: 'https://example.org/forms/request.pdf', state: 'MA' });

    assert.equal(result.sourceType, 'pdf');
    assert.equal(path.basename(path.dirname(result.storagePath)), 'ma');
    assert.match(path.basename(result.storagePath), /\.pdf$/);

    const stored = await fs.readFile(result.storagePath, 'utf8');
    assert.equal(stored, '%PDF-1.4 mock pdf body');
  } finally {
    test.mock.restoreAll();
    test.mock.reset();
    if (originalRawStorageDir == null) {
      delete process.env.RAW_STORAGE_DIR;
    } else {
      process.env.RAW_STORAGE_DIR = originalRawStorageDir;
    }
    if (originalFetchBackend == null) {
      delete process.env.RECORDS_FETCH_BACKEND;
    } else {
      process.env.RECORDS_FETCH_BACKEND = originalFetchBackend;
    }
    await fs.rm(rawDir, { recursive: true, force: true });
  }
});
