import fs from 'node:fs/promises';
import path from 'node:path';
import { sha256 } from './hash.js';
import { buildMedicalRecordsPdfFilenameStem } from './pdfNaming.js';
import { deriveAutomaticPdfTitleOverride } from './pdfTitleOverrides.js';
import { ensureRawStorageStateDir } from './rawStorage.js';

const SAFE_FILENAME_BYTES = 240;

function ensureSafeFilename(candidatePath, context) {
  const candidateName = path.basename(candidatePath);
  if (Buffer.byteLength(candidateName, 'utf8') <= SAFE_FILENAME_BYTES) {
    return;
  }

  throw new Error(
    `Generated PDF filename is too long (${candidateName.length} chars) for ${context.url}.`
  );
}

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
  const buildStemFrom = ({ title: nextTitle, text: nextText, headerText: nextHeaderText, headerLines: nextHeaderLines }) =>
    buildMedicalRecordsPdfFilenameStem({
      systemName,
      facilityName,
      url,
      title: nextTitle,
      text: nextText,
      headerText: nextHeaderText,
      headerLines: nextHeaderLines
    });

  const baseStem = buildStemFrom({
    title,
    text,
    headerText,
    headerLines
  });
  const stateStorageDir = await ensureRawStorageStateDir(state);

  let safeBaseStem = baseStem;
  try {
    ensureSafeFilename(path.join(stateStorageDir, `${baseStem}.pdf`), { url });
  } catch {
    const automaticTitleOverride = deriveAutomaticPdfTitleOverride({
      title,
      headerText,
      headerLines,
      facilityName,
      systemName
    });

    if (automaticTitleOverride) {
      safeBaseStem = buildStemFrom({
        title: automaticTitleOverride,
        text: automaticTitleOverride,
        headerText: automaticTitleOverride,
        headerLines: []
      });
    }
  }

  ensureSafeFilename(path.join(stateStorageDir, `${safeBaseStem}.pdf`), { url });

  let sequence = 1;
  while (true) {
    const stem = sequence === 1 ? safeBaseStem : `${safeBaseStem}-${sequence}`;
    const candidatePath = path.join(stateStorageDir, `${stem}.pdf`);
    ensureSafeFilename(candidatePath, { url });

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
