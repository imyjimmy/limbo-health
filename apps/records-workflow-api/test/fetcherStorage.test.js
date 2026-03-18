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

  process.env.RAW_STORAGE_DIR = rawDir;

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
    await fs.rm(rawDir, { recursive: true, force: true });
  }
});
