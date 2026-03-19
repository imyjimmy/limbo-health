import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './hash.js';
import { buildMedicalRecordsPdfFilenameStem } from './pdfNaming.js';
import { ensureRawStorageStateDir } from './rawStorage.js';

async function removeIfPresent(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileMatchesHash(filePath, expectedHash) {
  if (!(await fileExists(filePath))) return false;
  const buffer = await fs.readFile(filePath);
  return sha256(buffer) === expectedHash;
}

export async function assignPdfStoragePath({
  currentStoragePath,
  contentHash,
  state,
  systemName,
  facilityName,
  url,
  title,
  text,
  headerText = '',
  headerLines = []
}) {
  const baseStem = buildMedicalRecordsPdfFilenameStem({
    systemName,
    facilityName,
    url,
    title,
    text,
    headerText,
    headerLines
  });
  const stateStorageDir = await ensureRawStorageStateDir(state);

  let sequence = 1;
  while (true) {
    const stem = sequence === 1 ? baseStem : `${baseStem}-${sequence}`;
    const candidatePath = path.join(stateStorageDir, `${stem}.pdf`);

    if (candidatePath === currentStoragePath) {
      return candidatePath;
    }

    if (!(await fileExists(candidatePath))) {
      await fs.rename(currentStoragePath, candidatePath);
      return candidatePath;
    }

    if (await fileMatchesHash(candidatePath, contentHash)) {
      await removeIfPresent(currentStoragePath);
      return candidatePath;
    }

    sequence += 1;
  }
}
