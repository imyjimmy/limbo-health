import fs from 'node:fs/promises';

const LOCAL_DATABASE_URL = 'postgres://postgres:postgres@localhost:5433/records_workflow';
const DEFAULT_LOCAL_PORT = '3020';
const LOCAL_PYTHON_CANDIDATES = [
  '/opt/homebrew/Caskroom/miniconda/base/bin/python3',
  '/opt/homebrew/bin/python3',
];

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolvePreferredLocalPythonBin() {
  for (const candidate of LOCAL_PYTHON_CANDIDATES) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

export async function applyLocalRuntimeDefaults() {
  process.env.DATABASE_URL ||= LOCAL_DATABASE_URL;
  process.env.PORT ||= DEFAULT_LOCAL_PORT;
  process.env.RECORDS_FETCH_BACKEND ||= 'scrapling';

  if (!process.env.RECORDS_PYTHON_BIN) {
    const pythonBin = await resolvePreferredLocalPythonBin();
    if (pythonBin) {
      process.env.RECORDS_PYTHON_BIN = pythonBin;
    }
  }

  if (!process.env.RECORDS_FETCH_PYTHON_BIN && process.env.RECORDS_PYTHON_BIN) {
    process.env.RECORDS_FETCH_PYTHON_BIN = process.env.RECORDS_PYTHON_BIN;
  }
}
