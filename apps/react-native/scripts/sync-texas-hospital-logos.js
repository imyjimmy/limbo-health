#!/usr/bin/env node

const fs = require('fs/promises');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const APP_ROOT = path.resolve(SCRIPT_DIR, '..');
const API_ROOT = path.resolve(APP_ROOT, '../records-workflow-api');
const STORAGE_INVENTORY_PATH = path.join(
  API_ROOT,
  'storage/system-logos/tx/inventory.json',
);
const LEGACY_SEED_METADATA_PATH = path.join(
  API_ROOT,
  'seeds/texas-systems-logos.json',
);
const OUTPUT_ASSET_DIR = path.join(APP_ROOT, 'assets/hospital-logos/tx');
const OUTPUT_CONSTANTS_PATH = path.join(APP_ROOT, 'constants/texasHospitalLogos.ts');
const NON_PRESENTABLE_LOGO_IDS = new Set([
  'ascension-seton-hays',
  'baptist-health-system-san-antonio',
  'chi-st-lukes-health',
  'childrens-health',
  'harris-health',
  'hca-gulf-coast-division-hca-houston-healthcare',
  'the-hospitals-of-providence',
  'university-health',
  'utmb-health',
]);
const NON_PRESENTABLE_SYSTEM_NAME_PATTERNS = [
  /\bcompany profile\b/i,
  /\bdata breach\b/i,
  /\bpatient portal\b/i,
  /\bultimate guide\b/i,
  /\.\.\./,
];

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupName(value) {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '') || null;
}

function isPlaceholderInventoryItem(item) {
  return (
    Number(item?.size_bytes || 0) < 200 ||
    String(item?.source_url || '').startsWith('data:image/')
  );
}

function convertBitmapToPng(sourcePath, destinationPath) {
  const result = spawnSync(
    'sips',
    ['-s', 'format', 'png', sourcePath, '--out', destinationPath],
    { encoding: 'utf8' },
  );

  if (result.status !== 0) {
    const stderr = normalizeWhitespace(result.stderr || result.stdout || 'Unknown sips error');
    throw new Error(`Failed to convert ${sourcePath} to PNG: ${stderr}`);
  }
}

async function copyAsset(sourcePath, destinationPath, extension) {
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });

  if (extension === '.svg' || extension === '.png') {
    await fs.copyFile(sourcePath, destinationPath);
    return;
  }

  convertBitmapToPng(sourcePath, destinationPath);
}

function buildDestinationFileName(systemName, extension, usedFileNames) {
  const normalizedExtension = extension === '.svg' ? '.svg' : '.png';
  const baseSlug = slugify(systemName) || 'hospital-logo';
  let candidate = `${baseSlug}${normalizedExtension}`;
  let suffix = 2;

  while (usedFileNames.has(candidate)) {
    candidate = `${baseSlug}-${suffix}${normalizedExtension}`;
    suffix += 1;
  }

  usedFileNames.add(candidate);
  return candidate;
}

function buildLogoId(systemName, usedIds) {
  const baseId = slugify(systemName) || 'hospital-logo';
  let candidate = baseId;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function escapeForTs(value) {
  return JSON.stringify(String(value));
}

function isPresentableOutputEntry(entry) {
  if (NON_PRESENTABLE_LOGO_IDS.has(entry.id)) {
    return false;
  }

  return !NON_PRESENTABLE_SYSTEM_NAME_PATTERNS.some((pattern) =>
    pattern.test(entry.systemName),
  );
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function buildLegacyEntries(seedItems) {
  return seedItems
    .filter((item) => item?.system_name && item?.logo?.file)
    .map((item) => ({
      source: 'legacy',
      systemName: normalizeWhitespace(item.system_name),
      domain: normalizeDomain(item.domain),
      sourcePath: path.join(API_ROOT, item.logo.file.replace(/^apps\/records-workflow-api\//, '')),
      placeholder: false,
    }));
}

function buildStorageEntries(inventoryItems) {
  return inventoryItems
    .filter((item) => item?.system_name && item?.asset_path)
    .map((item) => ({
      source: 'storage',
      systemName: normalizeWhitespace(item.system_name),
      domain: normalizeDomain(item.domain),
      sourcePath: path.join(API_ROOT, item.asset_path.replace(/^storage\//, 'storage/')),
      placeholder: isPlaceholderInventoryItem(item),
    }));
}

function generateConstantsFile(entries) {
  const presentableIds = entries
    .filter((entry) => isPresentableOutputEntry(entry))
    .map((entry) => entry.id);
  const entryBlocks = entries.map((entry) => {
    const domainLine = entry.domain
      ? `    domain: ${escapeForTs(entry.domain)},\n`
      : '    domain: null,\n';

    return [
      '  {',
      `    id: ${escapeForTs(entry.id)},`,
      `    systemName: ${escapeForTs(entry.systemName)},`,
      domainLine.trimEnd(),
      `    asset: require('../assets/hospital-logos/tx/${entry.outputFileName}'),`,
      `    format: ${escapeForTs(entry.format)},`,
      '  },',
    ].join('\n');
  });

  return `import type { ImageSourcePropType } from 'react-native';

export type HospitalLogoFormat = 'svg' | 'bitmap';

export interface TexasHospitalLogo {
  id: string;
  systemName: string;
  domain: string | null;
  asset: ImageSourcePropType;
  format: HospitalLogoFormat;
}

// Generated by scripts/sync-texas-hospital-logos.js.
// Source inputs:
// - apps/records-workflow-api/seeds/texas-systems-logos.json
// - apps/records-workflow-api/storage/system-logos/tx/inventory.json
export const TEXAS_HOSPITAL_LOGOS: TexasHospitalLogo[] = [
${entryBlocks.join('\n')}
];

const PRESENTABLE_TEXAS_HOSPITAL_LOGO_IDS = new Set<string>([
${presentableIds.map((id) => `  ${escapeForTs(id)},`).join('\n')}
]);

export const PRESENTABLE_TEXAS_HOSPITAL_LOGOS: TexasHospitalLogo[] =
  TEXAS_HOSPITAL_LOGOS.filter((logo) => PRESENTABLE_TEXAS_HOSPITAL_LOGO_IDS.has(logo.id));
`;
}

async function main() {
  const [legacySeedItems, storageInventory] = await Promise.all([
    readJson(LEGACY_SEED_METADATA_PATH),
    readJson(STORAGE_INVENTORY_PATH),
  ]);

  const legacyEntries = buildLegacyEntries(legacySeedItems);
  const storageEntries = buildStorageEntries(storageInventory.items || []);
  const legacyByName = new Map(
    legacyEntries.map((entry) => [normalizeLookupName(entry.systemName), entry]),
  );

  const selectedEntries = [...legacyEntries];
  const skippedStorageEntries = [];

  for (const storageEntry of storageEntries) {
    const normalizedName = normalizeLookupName(storageEntry.systemName);
    if (legacyByName.has(normalizedName)) {
      continue;
    }

    if (storageEntry.placeholder) {
      skippedStorageEntries.push(storageEntry.systemName);
      continue;
    }

    selectedEntries.push(storageEntry);
  }

  await fs.rm(OUTPUT_ASSET_DIR, { recursive: true, force: true });
  await fs.mkdir(OUTPUT_ASSET_DIR, { recursive: true });

  const usedFileNames = new Set();
  const usedIds = new Set();
  const outputEntries = [];
  let convertedCount = 0;

  for (const entry of selectedEntries) {
    const sourceExtension = path.extname(entry.sourcePath).toLowerCase();
    const outputFileName = buildDestinationFileName(
      entry.systemName,
      sourceExtension,
      usedFileNames,
    );
    const destinationPath = path.join(OUTPUT_ASSET_DIR, outputFileName);
    await copyAsset(entry.sourcePath, destinationPath, sourceExtension);

    if (sourceExtension !== '.svg' && sourceExtension !== '.png') {
      convertedCount += 1;
    }

    outputEntries.push({
      id: buildLogoId(entry.systemName, usedIds),
      systemName: entry.systemName,
      domain: entry.domain,
      format: outputFileName.endsWith('.svg') ? 'svg' : 'bitmap',
      outputFileName,
    });
  }

  const constantsFileContent = generateConstantsFile(outputEntries);
  await fs.writeFile(OUTPUT_CONSTANTS_PATH, constantsFileContent, 'utf8');

  console.log(
    [
      `Synced ${outputEntries.length} Texas hospital logos into ${path.relative(APP_ROOT, OUTPUT_ASSET_DIR)}.`,
      `Legacy preserved: ${legacyEntries.length}.`,
      `Added from storage: ${outputEntries.length - legacyEntries.length}.`,
      `Converted to PNG: ${convertedCount}.`,
      `Skipped placeholder storage assets: ${skippedStorageEntries.length}.`,
      skippedStorageEntries.length > 0
        ? `Skipped: ${skippedStorageEntries.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
