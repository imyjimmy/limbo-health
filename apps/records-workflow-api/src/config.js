import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..');

function resolveFromServiceRoot(value, fallback) {
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
  seedFile: resolveFromServiceRoot(process.env.SEED_FILE, 'seeds/texas-systems.json'),
  crawl: {
    maxDepth: Number.parseInt(process.env.CRAWL_MAX_DEPTH || '2', 10),
    timeoutMs: Number.parseInt(process.env.CRAWL_TIMEOUT_MS || '25000', 10),
    parserVersion: 'v1'
  }
};
