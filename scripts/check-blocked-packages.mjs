#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const ignoredDirs = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  'coverage',
  'test-results',
  'tmp',
]);

const trackedFileNames = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

const blockedAxiosVersions = new Set(['1.14.1', '0.30.4']);
const findings = new Set();

function recordFinding(relPath, detail) {
  findings.add(`${relPath}: ${detail}`);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkDependencySpec(name, spec, relPath, fieldPath) {
  if (typeof spec !== 'string') {
    return;
  }

  if (name === 'plain-crypto-js') {
    recordFinding(relPath, `${fieldPath} references plain-crypto-js (${spec})`);
    return;
  }

  if (name === 'axios') {
    for (const version of blockedAxiosVersions) {
      if (spec.includes(version)) {
        recordFinding(relPath, `${fieldPath} resolves blocked axios version ${version} (${spec})`);
      }
    }
  }
}

function scanJson(value, relPath, fieldPath = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanJson(entry, relPath, `${fieldPath}[${index}]`));
    return;
  }

  if (!isObject(value)) {
    return;
  }

  if (typeof value.name === 'string') {
    if (value.name === 'plain-crypto-js') {
      const version = typeof value.version === 'string' ? value.version : 'unknown';
      recordFinding(relPath, `${fieldPath}.name resolves plain-crypto-js@${version}`);
    }

    if (value.name === 'axios' && typeof value.version === 'string' && blockedAxiosVersions.has(value.version)) {
      recordFinding(relPath, `${fieldPath}.name resolves blocked axios@${value.version}`);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
        'peerDependencies',
        'overrides',
        'resolutions',
      ].includes(key) &&
      isObject(child)
    ) {
      for (const [dependencyName, dependencySpec] of Object.entries(child)) {
        checkDependencySpec(dependencyName, dependencySpec, relPath, `${fieldPath}.${key}.${dependencyName}`);
      }
    }

    scanJson(child, relPath, `${fieldPath}.${key}`);
  }
}

function scanText(content, relPath) {
  const patterns = [
    [/axios@1\\.14\\.1\\b/g, 'blocked axios@1.14.1 reference'],
    [/axios@0\\.30\\.4\\b/g, 'blocked axios@0.30.4 reference'],
    [/axios-1\\.14\\.1\\.tgz\\b/g, 'blocked axios-1.14.1 tarball reference'],
    [/axios-0\\.30\\.4\\.tgz\\b/g, 'blocked axios-0.30.4 tarball reference'],
    [/plain-crypto-js\\b/g, 'plain-crypto-js reference'],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(content)) {
      recordFinding(relPath, label);
    }
  }
}

async function collectTrackedFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...(await collectTrackedFiles(path.join(dir, entry.name))));
      }
      continue;
    }

    if (trackedFileNames.has(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }

  return files;
}

const trackedFiles = await collectTrackedFiles(repoRoot);

for (const filePath of trackedFiles) {
  const relPath = path.relative(repoRoot, filePath);
  const content = await fs.readFile(filePath, 'utf8');

  if (filePath.endsWith('.json')) {
    const parsed = JSON.parse(content);
    scanJson(parsed, relPath);
    continue;
  }

  scanText(content, relPath);
}

if (findings.size > 0) {
  console.error('Blocked package references detected:');
  for (const finding of [...findings].sort()) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('No blocked package references found.');
