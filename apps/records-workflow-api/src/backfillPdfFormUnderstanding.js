import fs from 'node:fs/promises';
import process from 'node:process';
import { closePool, query } from './db.js';
import { config } from './config.js';
import { parsePdfDocument } from './parsers/pdfParser.js';
import { extractPdfFormUnderstanding } from './extractors/pdfFormUnderstandingExtractor.js';
import { insertExtractionRun } from './repositories/workflowRepository.js';
import { resolveRawStoragePath } from './utils/rawStorage.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME } from './utils/pdfFormUnderstanding.js';

function usage() {
  console.log(
    [
      'Usage:',
      '  node src/backfillPdfFormUnderstanding.js [--state TX] [--limit 50] [--force]',
      '',
      'Backfills pdf_form_understanding_openai extraction runs for tracked cached PDFs.',
      'Requires OPENAI_API_KEY and OPENAI_PDF_FORM_MODEL to be set.',
    ].join('\n'),
  );
}

function ensureOpenAiConfigured() {
  if (!config.openai.apiKey || !config.openai.pdfFormUnderstandingModel) {
    throw new Error(
      'OpenAI PDF understanding is not configured. Set OPENAI_API_KEY and OPENAI_PDF_FORM_MODEL before backfilling.',
    );
  }
}

async function listTrackedPdfDocuments({ state = null, limit = null, force = false }) {
  const params = [PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME];
  const where = [
    `sd.source_type = 'pdf'`,
    `sd.storage_path is not null`,
    `sd.storage_path <> ''`,
  ];

  if (state) {
    params.push(String(state).trim().toUpperCase());
    where.push(`hs.state = $${params.length}`);
  }

  if (!force) {
    where.push(`latest.id is null`);
  }

  let limitClause = '';
  if (Number.isInteger(limit) && limit > 0) {
    params.push(limit);
    limitClause = `limit $${params.length}`;
  }

  const result = await query(
    `select
       sd.id,
       sd.source_url,
       sd.title,
       sd.storage_path,
       hs.system_name,
       hs.state,
       f.facility_name,
       latest.id as latest_run_id,
       latest.status as latest_run_status
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     left join lateral (
       select er.id, er.status
       from extraction_runs er
       where er.source_document_id = sd.id
         and er.extractor_name = $1
       order by er.created_at desc
       limit 1
     ) latest on true
     where ${where.join(' and ')}
     order by hs.state asc, hs.system_name asc, sd.created_at asc
     ${limitClause}`,
    params,
  );

  return result.rows;
}

async function backfillPdfFormUnderstanding({ state = null, limit = null, force = false }) {
  ensureOpenAiConfigured();

  const documents = await listTrackedPdfDocuments({ state, limit, force });
  const summary = {
    requested_state: state || null,
    force,
    limit: limit ?? null,
    candidates: documents.length,
    inserted_runs: 0,
    success: 0,
    partial: 0,
    failed: 0,
    skipped_missing_file: 0,
    failures: [],
  };

  for (const document of documents) {
    const resolvedPath = resolveRawStoragePath(document.storage_path);

    try {
      const buffer = await fs.readFile(resolvedPath);
      const parsedPdf = await parsePdfDocument({ buffer, filePath: resolvedPath });
      const extraction = await extractPdfFormUnderstanding({
        parsedPdf,
        hospitalSystemName: document.system_name,
        facilityName: document.facility_name || null,
        formName: document.title || 'Authorization Form',
        sourceUrl: document.source_url,
      });

      await insertExtractionRun({
        sourceDocumentId: document.id,
        extractorName: extraction.extractorName,
        extractorVersion: extraction.extractorVersion,
        status: extraction.status,
        structuredOutput: extraction.structuredOutput,
      });

      summary.inserted_runs += 1;
      summary[extraction.status] += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown backfill error.';
      if (/ENOENT/i.test(message)) {
        summary.skipped_missing_file += 1;
      } else {
        summary.failed += 1;
      }
      summary.failures.push({
        source_document_id: document.id,
        state: document.state,
        system_name: document.system_name,
        storage_path: document.storage_path,
        error: message,
      });
    }
  }

  return summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const summary = await backfillPdfFormUnderstanding({
    state: getCliOptionValue(args, 'state'),
    limit: getCliIntegerOptionValue(args, 'limit'),
    force: args.includes('--force'),
  });

  console.log('PDF form-understanding backfill finished:', JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('PDF form-understanding backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
