#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const appJsonPath = path.resolve(__dirname, '..', 'app.json');
const dryRun = process.argv.includes('--dry-run');

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function main() {
  if (!fs.existsSync(appJsonPath)) {
    throw new Error(`app.json not found at ${appJsonPath}`);
  }

  const raw = fs.readFileSync(appJsonPath, 'utf8');
  const appConfig = JSON.parse(raw);

  if (!appConfig.expo || typeof appConfig.expo.version !== 'string') {
    throw new Error('expo.version is missing from app.json');
  }

  const current = parseSemver(appConfig.expo.version);
  if (!current) {
    throw new Error(
      `expo.version must be strict semver x.y.z, got "${appConfig.expo.version}"`,
    );
  }

  const currentVersion = appConfig.expo.version;
  const next = `${current.major}.${current.minor}.${current.patch + 1}`;

  if (!dryRun) {
    appConfig.expo.version = next;
    fs.writeFileSync(appJsonPath, `${JSON.stringify(appConfig, null, 2)}\n`);
  }

  const mode = dryRun ? 'Dry run' : 'Updated';
  console.log(`${mode} expo.version: ${currentVersion} -> ${next}`);
}

main();
