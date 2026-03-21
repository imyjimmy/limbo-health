import 'dotenv/config';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { normalizeStateCode } from './utils/states.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..');

export function resolveFromServiceRoot(value, fallback) {
  const candidate = value || fallback;
  if (path.isAbsolute(candidate)) return candidate;
  return path.resolve(serviceRoot, candidate);
}

export const config = {
  port: Number.parseInt(process.env.PORT || '3020', 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://postgres:postgres@localhost:5432/records_workflow',
  rawStorageDir: resolveFromServiceRoot(process.env.RAW_STORAGE_DIR, 'storage/raw'),
  parsedStorageDir: resolveFromServiceRoot(process.env.PARSED_STORAGE_DIR, 'storage/parsed'),
  workflowStorageDir: resolveFromServiceRoot(process.env.WORKFLOW_STORAGE_DIR, 'storage/workflows'),
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
    timeoutMs: Number.parseInt(process.env.OPENAI_TIMEOUT_MS || '30000', 10),
  }
};
