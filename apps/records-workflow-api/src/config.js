import dotenv from 'dotenv';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizeStateCode } from './utils/states.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(serviceRoot, '..', '..');

function loadRecordsWorkflowEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const envCandidates = [
    path.join(serviceRoot, `.env.${nodeEnv}.local`),
    path.join(serviceRoot, '.env.local'),
    path.join(serviceRoot, `.env.${nodeEnv}`),
    path.join(serviceRoot, '.env'),
    path.join(workspaceRoot, `.env.${nodeEnv}.local`),
    path.join(workspaceRoot, '.env.local'),
    path.join(workspaceRoot, `.env.${nodeEnv}`),
    path.join(workspaceRoot, '.env'),
  ];

  for (const envPath of envCandidates) {
    dotenv.config({
      path: envPath,
      override: false,
    });
  }
}

loadRecordsWorkflowEnv();

export function resolveFromServiceRoot(value, fallback) {
  const candidate = value || fallback;
  if (path.isAbsolute(candidate)) return candidate;
  return path.resolve(serviceRoot, candidate);
}

const targetedPageStorageDir = resolveFromServiceRoot(
  process.env.TARGETED_PAGES_STORAGE_DIR || process.env.FETCH_STORAGE_DIR,
  'storage/targeted-pages',
);
const capturedFormStorageDir = resolveFromServiceRoot(
  process.env.CAPTURED_FORMS_STORAGE_DIR,
  'storage/captured-forms',
);
const acceptedFormStorageDir = resolveFromServiceRoot(
  process.env.ACCEPTED_FORMS_STORAGE_DIR ||
    process.env.SOURCE_DOCUMENT_STORAGE_DIR ||
    process.env.RAW_STORAGE_DIR,
  'storage/accepted-forms',
);
const hospitalSubmissionRequirementsStorageDir = resolveFromServiceRoot(
  process.env.HOSPITAL_SUBMISSION_REQUIREMENTS_STORAGE_DIR || process.env.WORKFLOW_STORAGE_DIR,
  'storage/hospital-submission-requirements',
);
const questionMappingStorageDir = resolveFromServiceRoot(
  process.env.QUESTION_MAPPING_STORAGE_DIR || process.env.QUESTION_STORAGE_DIR,
  'storage/question-mappings',
);
const publishedTemplateStorageDir = resolveFromServiceRoot(
  process.env.PUBLISHED_TEMPLATE_STORAGE_DIR || process.env.PUBLISHED_STORAGE_DIR,
  'storage/published-templates',
);
const internalSeedScopeStorageDir = resolveFromServiceRoot(
  process.env.SEED_SCOPE_STORAGE_DIR,
  'storage/internal/seed-scopes',
);
const internalTriageStorageDir = resolveFromServiceRoot(
  process.env.TRIAGE_STORAGE_DIR,
  'storage/internal/triage-decisions',
);

export const config = {
  port: Number.parseInt(process.env.PORT || '3020', 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/records_workflow',
  targetedPageStorageDir,
  capturedFormStorageDir,
  acceptedFormStorageDir,
  hospitalSubmissionRequirementsStorageDir,
  questionMappingStorageDir,
  publishedTemplateStorageDir,
  legacySourceDocumentStorageDir: resolveFromServiceRoot(
    process.env.LEGACY_SOURCE_DOCUMENT_STORAGE_DIR || process.env.SOURCE_DOCUMENT_STORAGE_DIR,
    'storage/source-documents',
  ),
  legacyRawStorageDir: resolveFromServiceRoot(
    process.env.LEGACY_RAW_STORAGE_DIR || process.env.RAW_STORAGE_DIR,
    'storage/raw',
  ),
  dataIntakeStorageDir: resolveFromServiceRoot(
    process.env.DATA_INTAKE_STORAGE_DIR,
    'storage/data-intake',
  ),
  rawStorageDir: acceptedFormStorageDir,
  sourceDocumentStorageDir: acceptedFormStorageDir,
  seedScopeStorageDir: internalSeedScopeStorageDir,
  fetchStorageDir: targetedPageStorageDir,
  parsedStorageDir: resolveFromServiceRoot(process.env.PARSED_STORAGE_DIR, 'storage/parsed'),
  workflowStorageDir: hospitalSubmissionRequirementsStorageDir,
  questionStorageDir: questionMappingStorageDir,
  triageStorageDir: internalTriageStorageDir,
  publishedStorageDir: publishedTemplateStorageDir,
  seedFile: resolveFromServiceRoot(process.env.SEED_FILE, 'seeds/texas-systems.json'),
  crawlState: normalizeStateCode(process.env.CRAWL_STATE),
  crawl: {
    maxDepth: Number.parseInt(process.env.CRAWL_MAX_DEPTH || '2', 10),
    timeoutMs: Number.parseInt(process.env.CRAWL_TIMEOUT_MS || '25000', 10),
    parserVersion: 'v1'
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1',
    pdfFormUnderstandingModel: process.env.OPENAI_PDF_FORM_MODEL || '',
    seedMaterializationModel:
      process.env.OPENAI_SEED_MATERIALIZATION_MODEL ||
      process.env.OPENAI_PDF_FORM_MODEL ||
      '',
    timeoutMs: Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '30000', 10),
  }
};
