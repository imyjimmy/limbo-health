#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const appJsonPath = path.resolve(__dirname, '..', 'app.json');
const xcodeProjectPath = path.resolve(
  __dirname,
  '..',
  'ios',
  'LimboHealth.xcodeproj',
  'project.pbxproj',
);
const dryRun = process.argv.includes('--dry-run');
const partArg = process.argv.find((arg) => arg.startsWith('--part='));
const part = partArg ? partArg.slice('--part='.length) : 'patch';

function parseSemver(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function updateXcodeMarketingVersion(nextVersion) {
  if (!fs.existsSync(xcodeProjectPath)) {
    return false;
  }

  const raw = fs.readFileSync(xcodeProjectPath, 'utf8');
  const updated = raw.replace(
    /MARKETING_VERSION = \d+\.\d+\.\d+;/g,
    `MARKETING_VERSION = ${nextVersion};`,
  );

  if (!dryRun && updated !== raw) {
    fs.writeFileSync(xcodeProjectPath, updated);
  }

  return updated !== raw;
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
  let next;

  if (part === 'minor') {
    next = `${current.major}.${current.minor + 1}.0`;
  } else if (part === 'patch') {
    next = `${current.major}.${current.minor}.${current.patch + 1}`;
  } else {
    throw new Error(`Unsupported part "${part}". Use --part=patch or --part=minor`);
  }

  if (!dryRun) {
    appConfig.expo.version = next;
    fs.writeFileSync(appJsonPath, `${JSON.stringify(appConfig, null, 2)}\n`);
  }

  const updatedXcodeProject = updateXcodeMarketingVersion(next);

  const mode = dryRun ? 'Dry run' : 'Updated';
  console.log(`${mode} expo.version (${part}): ${currentVersion} -> ${next}`);
  if (updatedXcodeProject) {
    console.log(`${mode} Xcode MARKETING_VERSION: ${currentVersion} -> ${next}`);
  }
}

main();
