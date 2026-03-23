import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, 'schema.postgres.sql');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRows(queryResult) {
  if (Array.isArray(queryResult)) {
    return Array.isArray(queryResult[0]) ? queryResult[0] : [];
  }
  if (Array.isArray(queryResult?.rows)) {
    return queryResult.rows;
  }
  return [];
}

export async function waitForDatabase(queryable, { retries = 30, delayMs = 1000 } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await queryable.query('select 1 as ready');
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      console.warn(
        `Core DB not ready yet (attempt ${attempt}/${retries}): ${error.message}`,
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

export async function applyCoreSchema(queryable) {
  const sql = await fs.readFile(schemaPath, 'utf8');
  await queryable.query(sql);
}

export async function getCoreSummary(queryable) {
  const [usersResult, repositoriesResult, appointmentsResult] = await Promise.all([
    queryable.query('select count(*)::int as count from users'),
    queryable.query('select count(*)::int as count from repositories'),
    queryable.query('select count(*)::int as count from appointments'),
  ]);

  return {
    users: extractRows(usersResult)[0]?.count ?? 0,
    repositories: extractRows(repositoriesResult)[0]?.count ?? 0,
    appointments: extractRows(appointmentsResult)[0]?.count ?? 0,
  };
}

export async function ensureCoreDatabaseReady(queryable, options = {}) {
  await waitForDatabase(queryable, options);
  await applyCoreSchema(queryable);
  return getCoreSummary(queryable);
}
