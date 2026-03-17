import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from './db.js';
import { reseedFromFile } from './services/seedService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../db/schema.sql');

export async function applySchema() {
  const sql = await fs.readFile(schemaPath, 'utf8');
  await query(sql);
}

export async function getHospitalSystemCount() {
  const result = await query(
    `select count(*)::int as count
     from hospital_systems`
  );

  return Number.parseInt(String(result.rows[0]?.count ?? 0), 10);
}

export async function ensureDatabaseReady() {
  await applySchema();

  const hospitalSystemCount = await getHospitalSystemCount();
  if (hospitalSystemCount > 0) {
    return {
      didSeed: false,
      hospitalSystemCount,
      summary: null,
    };
  }

  const summary = await reseedFromFile();
  return {
    didSeed: true,
    hospitalSystemCount: summary.systems,
    summary,
  };
}
