import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSourceDocumentPath, toSourceDocumentRelativePath } from '../src/utils/sourceDocumentStorage.js';

test('resolveSourceDocumentPath remaps imported absolute raw-storage paths into the configured accepted-forms directory', async () => {
  const sourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-source-docs-'),
  );
  const legacySourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-legacy-source-docs-'),
  );
  const legacyRawStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-raw-storage-'),
  );
  const relativePath = path.join('tx', 'baylor.pdf');
  const migratedAcceptedFormPath = path.join(sourceDocumentStorageDir, relativePath);
  const importedAbsolutePath =
    '/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/storage/raw/tx/baylor.pdf';

  await fs.mkdir(path.dirname(migratedAcceptedFormPath), { recursive: true });
  await fs.writeFile(migratedAcceptedFormPath, '%PDF-1.4 migrated accepted form');

  try {
    assert.equal(
      toSourceDocumentRelativePath(importedAbsolutePath, {
        sourceDocumentStorageDir,
        legacySourceDocumentStorageDir,
        legacyRawStorageDir,
      }),
      'tx/baylor.pdf',
    );

    assert.equal(
      resolveSourceDocumentPath(importedAbsolutePath, {
        sourceDocumentStorageDir,
        legacySourceDocumentStorageDir,
        legacyRawStorageDir,
      }),
      migratedAcceptedFormPath,
    );
  } finally {
    await fs.rm(sourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacySourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacyRawStorageDir, { recursive: true, force: true });
  }
});

test('resolveSourceDocumentPath remaps imported accepted-form paths into the configured accepted-form directory', async () => {
  const sourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-source-docs-'),
  );
  const legacySourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-legacy-source-docs-'),
  );
  const legacyRawStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-raw-storage-'),
  );
  const relativePath = path.join('ma', 'cambridge.pdf');
  const storedSourceDocumentPath = path.join(sourceDocumentStorageDir, relativePath);
  const importedAbsolutePath =
    '/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/storage/accepted-forms/ma/cambridge.pdf';

  await fs.mkdir(path.dirname(storedSourceDocumentPath), { recursive: true });
  await fs.writeFile(storedSourceDocumentPath, '%PDF-1.4 source document');

  try {
    assert.equal(
      resolveSourceDocumentPath(importedAbsolutePath, {
        sourceDocumentStorageDir,
        legacySourceDocumentStorageDir,
        legacyRawStorageDir,
      }),
      storedSourceDocumentPath,
    );
  } finally {
    await fs.rm(sourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacySourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacyRawStorageDir, { recursive: true, force: true });
  }
});

test('resolveSourceDocumentPath still resolves legacy source-document paths during the transition', async () => {
  const sourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-source-docs-'),
  );
  const legacySourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-legacy-source-docs-'),
  );
  const legacyRawStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-raw-storage-'),
  );
  const relativePath = path.join('ma', 'cambridge.pdf');
  const storedSourceDocumentPath = path.join(sourceDocumentStorageDir, relativePath);
  const importedAbsolutePath =
    '/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/storage/source-documents/ma/cambridge.pdf';

  await fs.mkdir(path.dirname(storedSourceDocumentPath), { recursive: true });
  await fs.writeFile(storedSourceDocumentPath, '%PDF-1.4 source document');

  try {
    assert.equal(
      resolveSourceDocumentPath(importedAbsolutePath, {
        sourceDocumentStorageDir,
        legacySourceDocumentStorageDir,
        legacyRawStorageDir,
      }),
      storedSourceDocumentPath,
    );
  } finally {
    await fs.rm(sourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacySourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacyRawStorageDir, { recursive: true, force: true });
  }
});

test('resolveSourceDocumentPath keeps an absolute path when it exists locally', async () => {
  const sourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-source-docs-'),
  );
  const legacySourceDocumentStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-legacy-source-docs-'),
  );
  const legacyRawStorageDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'records-workflow-raw-storage-'),
  );
  const existingAbsolutePath = path.join(sourceDocumentStorageDir, 'tx', 'existing.pdf');

  await fs.mkdir(path.dirname(existingAbsolutePath), { recursive: true });
  await fs.writeFile(existingAbsolutePath, '%PDF-1.4 local source document');

  try {
    assert.equal(
      resolveSourceDocumentPath(existingAbsolutePath, {
        sourceDocumentStorageDir,
        legacySourceDocumentStorageDir,
        legacyRawStorageDir,
      }),
      existingAbsolutePath,
    );
  } finally {
    await fs.rm(sourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacySourceDocumentStorageDir, { recursive: true, force: true });
    await fs.rm(legacyRawStorageDir, { recursive: true, force: true });
  }
});
