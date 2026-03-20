import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { closePool, query } from './db.js';
import { config } from './config.js';
import { toRawStorageRelativePath } from './utils/rawStorage.js';
import { getCliIntegerOptionValue, getCliOptionValue } from './utils/cliArgs.js';
import { PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME } from './utils/pdfFormUnderstanding.js';

function usage() {
  console.log(
    [
      'Usage:',
      '  node src/auditPdfFormUnderstanding.js [--state TX] [--limit 25] [--output path.json]',
      '',
      'Audits the latest pdf_form_understanding_openai run for each tracked cached PDF.',
    ].join('\n'),
  );
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(fullPath);
      continue;
    }

    if (/\.pdf$/i.test(entry.name)) {
      yield fullPath;
    }
  }
}

function normalizeBindingFamily(type) {
  if (type === 'field_text' || type === 'field_checkbox' || type === 'field_radio') {
    return 'acroform';
  }

  if (type === 'overlay_text' || type === 'overlay_mark') {
    return 'overlay';
  }

  return null;
}

function validateFormUnderstandingBindings(formUnderstanding) {
  const issues = [];
  const mode = formUnderstanding?.mode || null;
  const questions = Array.isArray(formUnderstanding?.questions) ? formUnderstanding.questions : [];

  for (const question of questions) {
    if (question.kind === 'short_text') {
      if (!Array.isArray(question.bindings) || question.bindings.length === 0) {
        issues.push(`question:${question.id}:missing_bindings`);
        continue;
      }

      for (const binding of question.bindings) {
        if (normalizeBindingFamily(binding?.type) !== mode) {
          issues.push(`question:${question.id}:binding_family_mismatch`);
        }
      }
      continue;
    }

    for (const option of Array.isArray(question.options) ? question.options : []) {
      if (!Array.isArray(option.bindings) || option.bindings.length === 0) {
        issues.push(`question:${question.id}:option:${option.id}:missing_bindings`);
        continue;
      }

      for (const binding of option.bindings) {
        if (normalizeBindingFamily(binding?.type) !== mode) {
          issues.push(`question:${question.id}:option:${option.id}:binding_family_mismatch`);
        }
      }
    }
  }

  return Array.from(new Set(issues));
}

async function listRawPdfPaths({ state = null }) {
  const rootDir = state
    ? path.join(config.rawStorageDir, String(state).trim().toLowerCase())
    : config.rawStorageDir;

  const relativePaths = [];

  try {
    for await (const fullPath of walk(rootDir)) {
      const relativePath = toRawStorageRelativePath(fullPath, config.rawStorageDir);
      if (relativePath) {
        relativePaths.push(relativePath);
      }
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  return relativePaths.sort();
}

async function listTrackedPdfDocuments({ state = null }) {
  const params = [PDF_FORM_UNDERSTANDING_EXTRACTOR_NAME];
  let stateClause = '';

  if (state) {
    params.push(String(state).trim().toUpperCase());
    stateClause = `and hs.state = $${params.length}`;
  }

  const result = await query(
    `select
       sd.id as source_document_id,
       hs.state,
       hs.system_name,
       f.facility_name,
       sd.source_url,
       sd.title,
       sd.storage_path,
       latest.id as extraction_run_id,
       latest.status as extraction_status,
       latest.structured_output
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     left join facilities f on f.id = sd.facility_id
     left join lateral (
       select er.id, er.status, er.structured_output
       from extraction_runs er
       where er.source_document_id = sd.id
         and er.extractor_name = $1
       order by er.created_at desc
       limit 1
     ) latest on true
     where sd.source_type = 'pdf'
       and sd.storage_path is not null
       and sd.storage_path <> ''
       ${stateClause}
     order by hs.state asc, hs.system_name asc, sd.created_at asc`,
    params,
  );

  return result.rows.map((row) => ({
    ...row,
    relative_storage_path: toRawStorageRelativePath(row.storage_path, config.rawStorageDir) || row.storage_path,
  }));
}

function summarizeRecords(records, limit) {
  return records.slice(0, limit).map((record) => ({
    state: record.state,
    system_name: record.system_name,
    facility_name: record.facility_name || null,
    source_document_id: record.source_document_id,
    source_url: record.source_url,
    title: record.title,
    storage_path: record.relative_storage_path,
    extraction_run_id: record.extraction_run_id || null,
    extraction_status: record.extraction_status || null,
    reason: record.reason || null,
    issue_count: record.issues?.length || 0,
    issues: record.issues || [],
    question_count: record.question_count ?? null,
  }));
}

async function auditPdfFormUnderstanding({ state = null, limit = 25 }) {
  const trackedDocuments = await listTrackedPdfDocuments({ state });
  const rawPdfPaths = await listRawPdfPaths({ state });
  const trackedPathSet = new Set(
    trackedDocuments.map((document) => document.relative_storage_path).filter(Boolean),
  );
  const orphanedRawPdfPaths = rawPdfPaths.filter((relativePath) => !trackedPathSet.has(relativePath));

  const supported = [];
  const noQuestions = [];
  const invalidBindings = [];
  const noRun = [];

  for (const document of trackedDocuments) {
    if (!document.extraction_run_id) {
      noRun.push({
        ...document,
        reason: 'no_pdf_form_understanding_run',
        question_count: 0,
      });
      continue;
    }

    const structuredOutput = document.structured_output || {};
    const formUnderstanding = structuredOutput.form_understanding || null;
    const questions = Array.isArray(formUnderstanding?.questions) ? formUnderstanding.questions : [];
    const issues = validateFormUnderstandingBindings(formUnderstanding);
    const reason = structuredOutput.metadata?.reason || null;

    if (issues.length > 0) {
      invalidBindings.push({
        ...document,
        reason: reason || 'invalid_or_missing_bindings',
        question_count: questions.length,
        issues,
      });
      continue;
    }

    if (formUnderstanding?.supported === true && questions.length > 0) {
      supported.push({
        ...document,
        reason: null,
        question_count: questions.length,
      });
      continue;
    }

    noQuestions.push({
      ...document,
      reason: reason || 'no_questions',
      question_count: questions.length,
      issues,
    });
  }

  return {
    requested_state: state || null,
    generated_at: new Date().toISOString(),
    raw_storage_pdf_count: rawPdfPaths.length,
    tracked_pdf_source_documents: trackedDocuments.length,
    orphaned_raw_pdf_count: orphanedRawPdfPaths.length,
    counts: {
      supported_true: supported.length,
      no_questions: noQuestions.length,
      invalid_or_missing_bindings: invalidBindings.length,
      no_extraction_run: noRun.length,
    },
    supported_true: summarizeRecords(supported, limit),
    no_questions: summarizeRecords(noQuestions, limit),
    invalid_or_missing_bindings: summarizeRecords(invalidBindings, limit),
    no_extraction_run: summarizeRecords(noRun, limit),
    orphaned_raw_pdfs: orphanedRawPdfPaths.slice(0, limit),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    usage();
    return;
  }

  const summary = await auditPdfFormUnderstanding({
    state: getCliOptionValue(args, 'state'),
    limit: getCliIntegerOptionValue(args, 'limit') ?? 25,
  });

  const outputPath = getCliOptionValue(args, 'output');
  if (outputPath) {
    const resolvedOutputPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);
    await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await fs.writeFile(resolvedOutputPath, `${JSON.stringify(summary, null, 2)}\n`);
  }

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('PDF form-understanding audit failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool().catch(() => {});
  });
