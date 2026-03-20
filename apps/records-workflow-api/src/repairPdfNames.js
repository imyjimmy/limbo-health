import fs from 'node:fs/promises';
import { closePool } from './db.js';
import {
  listPdfSourceDocumentsByState,
  updateSourceDocumentStoragePath
} from './repositories/workflowRepository.js';
import { parsePdfDocument } from './parsers/pdfParser.js';
import { assignPdfStoragePath } from './utils/pdfStorage.js';
import { resolveRawStoragePath } from './utils/rawStorage.js';
import { normalizeStateCode } from './utils/states.js';

function parseArgs(argv) {
  let state = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--state') {
      state = argv[index + 1] || null;
      index += 1;
    }
  }

  return { state: normalizeStateCode(state) };
}

async function main() {
  const { state } = parseArgs(process.argv.slice(2));
  if (!state) {
    throw new Error('state is required. Use --state <code>.');
  }

  const documents = await listPdfSourceDocumentsByState({ state });
  const renamed = [];
  const missing = [];
  const unchanged = [];
  const errors = [];

  for (const document of documents) {
    try {
      if (!document.storage_path) {
        missing.push({
          sourceDocumentId: document.id,
          sourceUrl: document.source_url,
          reason: 'missing_storage_path'
        });
        continue;
      }

      const currentStoragePath = resolveRawStoragePath(document.storage_path);
      const buffer = await fs.readFile(currentStoragePath);
      const parsed = await parsePdfDocument({ buffer });
      const nextStoragePath = await assignPdfStoragePath({
        currentStoragePath,
        contentHash: document.content_hash,
        state,
        systemName: document.system_name,
        facilityName: document.facility_name,
        url: document.source_url,
        title: parsed.title || document.title || '',
        text: parsed.text || '',
        headerText: parsed.headerText || '',
        headerLines: parsed.headerLines || []
      });

      if (nextStoragePath !== currentStoragePath || nextStoragePath !== document.storage_path) {
        await updateSourceDocumentStoragePath({
          sourceDocumentId: document.id,
          storagePath: nextStoragePath
        });
        renamed.push({
          sourceDocumentId: document.id,
          sourceUrl: document.source_url,
          from: document.storage_path,
          to: nextStoragePath
        });
      } else {
        unchanged.push({
          sourceDocumentId: document.id,
          sourceUrl: document.source_url,
          storagePath: document.storage_path
        });
      }
    } catch (error) {
      errors.push({
        sourceDocumentId: document.id,
        sourceUrl: document.source_url,
        storagePath: document.storage_path,
        error: error.message
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        state,
        total: documents.length,
        renamed: renamed.length,
        unchanged: unchanged.length,
        missing: missing.length,
        errors: errors.length,
        renamedDocuments: renamed,
        missingDocuments: missing,
        errorDocuments: errors
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
