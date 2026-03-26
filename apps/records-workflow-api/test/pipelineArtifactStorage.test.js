import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveParsedArtifactPath,
  toParsedArtifactRelativePath,
} from '../src/utils/pipelineArtifactStorage.js';

test('resolveParsedArtifactPath remaps imported absolute parsed-artifact paths into the configured parsed directory', async () => {
  const parsedStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-workflow-parsed-'));
  const relativePath = path.join('tx', 'artifact.json');
  const parsedArtifactPath = path.join(parsedStorageDir, relativePath);
  const importedAbsolutePath =
    '/Users/imyjimmy/dev/pleb-emr/limbo-health/apps/records-workflow-api/storage/parsed/tx/artifact.json';

  await fs.mkdir(path.dirname(parsedArtifactPath), { recursive: true });
  await fs.writeFile(parsedArtifactPath, '{"ok":true}');

  try {
    assert.equal(toParsedArtifactRelativePath(importedAbsolutePath, parsedStorageDir), 'tx/artifact.json');
    assert.equal(resolveParsedArtifactPath(importedAbsolutePath, parsedStorageDir), parsedArtifactPath);
  } finally {
    await fs.rm(parsedStorageDir, { recursive: true, force: true });
  }
});

test('resolveParsedArtifactPath keeps relative parsed-artifact paths inside the configured parsed directory', async () => {
  const parsedStorageDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-workflow-parsed-'));

  try {
    assert.equal(
      resolveParsedArtifactPath('ma/example.json', parsedStorageDir),
      path.join(parsedStorageDir, 'ma/example.json'),
    );
  } finally {
    await fs.rm(parsedStorageDir, { recursive: true, force: true });
  }
});
