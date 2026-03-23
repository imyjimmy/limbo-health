import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import * as cheerio from 'cheerio';
import { config, resolveFromServiceRoot } from '../config.js';
import {
  completePipelineStageRun,
  getLatestPipelineStageRun,
  insertPipelineStageRun,
} from '../repositories/pipelineStageRepository.js';
import { parsePdfDocument } from '../parsers/pdfParser.js';
import { requestStructuredOutputWithOpenAI } from '../providers/openaiPdfFormUnderstandingClient.js';
import {
  mergeSeedSystems,
  mergeSystemsIntoStateSeedFile,
  readStateSeedFile,
} from './seedEditorService.js';
import { generateStateSeedCandidates } from './generatedSeedService.js';
import { reseedFromFile } from './seedService.js';
import { normalizeHospitalName } from '../utils/hospitalRoster.js';
import { collapseWhitespace, uniqueBy } from '../utils/text.js';
import { ensureDataIntakeArtifactStateDir } from '../utils/pipelineArtifactStorage.js';
import { getStateName, normalizeStateCode, US_STATE_NAMES } from '../utils/states.js';

const execFile = promisify(execFileCallback);

export const STATE_DATA_MATERIALIZATION_STAGE_KEY = 'state_data_materialization_stage';
export const STATE_DATA_MATERIALIZATION_STAGE_LABEL = 'Data Intake Stage';

const DATA_ROOT_RELATIVE = 'data';
const DATA_SOURCE_CACHE_TTL_MS = 60_000;
const MAX_FILE_TEXT_CHARS = 16_000;
const MAX_FILE_LINES = 280;
const DATA_EXTRACTION_CONCURRENCY = 3;
const ZIP_MAX_BUFFER_BYTES = 24 * 1024 * 1024;
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt',
  '.text',
  '.md',
  '.html',
  '.htm',
  '.csv',
  '.tsv',
  '.json',
]);
const SPREADSHEET_EXTENSIONS = new Set(['.xlsx']);
const PDF_EXTENSIONS = new Set(['.pdf']);
const EXCLUDED_DIRECTORY_NAMES = new Set(['generated-seeds', 'national-roster']);
const EXCLUDED_NAME_PATTERNS = [
  /\bhospital association\b/i,
  /\bhealthcare association\b/i,
  /\bhospital council\b/i,
  /\bdepartment of health\b/i,
  /\bpublic health\b/i,
  /\bdirectory\b/i,
  /\bmember hospitals?\b/i,
  /\bmember directory\b/i,
];

const STATE_DATA_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['source_kind', 'hospital_identities'],
  properties: {
    source_kind: {
      type: 'string',
      enum: ['roster', 'directory', 'hospital_page', 'workflow_page', 'other'],
    },
    hospital_identities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['facility_name', 'city', 'confidence', 'evidence_excerpt'],
        properties: {
          facility_name: {
            type: 'string',
          },
          city: {
            type: 'string',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
          },
          evidence_excerpt: {
            type: 'string',
          },
        },
      },
    },
  },
};

let cachedDataSourceIndex = null;
let cachedDataSourceIndexAt = 0;

function normalizeString(value) {
  return collapseWhitespace(typeof value === 'string' ? value : '');
}

function toInt(value) {
  return Number.parseInt(String(value ?? 0), 10) || 0;
}

function dataRootPath() {
  return resolveFromServiceRoot(DATA_ROOT_RELATIVE, DATA_ROOT_RELATIVE);
}

function dataIntakeModel() {
  return config.openai.seedMaterializationModel || '';
}

function looksLikeStatePrefixedName(name, state) {
  return new RegExp(`^${state}(?:[^a-z0-9]|$)`, 'i').test(String(name || ''));
}

function shouldSkipDirectory(name) {
  return EXCLUDED_DIRECTORY_NAMES.has(String(name || '').toLowerCase());
}

function supportedByExtension(extension) {
  return (
    TEXT_FILE_EXTENSIONS.has(extension) ||
    SPREADSHEET_EXTENSIONS.has(extension) ||
    PDF_EXTENSIONS.has(extension)
  );
}

function fileKindFromExtension(extension) {
  if (TEXT_FILE_EXTENSIONS.has(extension)) return 'text';
  if (SPREADSHEET_EXTENSIONS.has(extension)) return 'spreadsheet';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  return 'other';
}

function trimLines(text, maxLines = MAX_FILE_LINES, maxChars = MAX_FILE_TEXT_CHARS) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  let joined = lines.join('\n');
  if (joined.length > maxChars) {
    joined = `${joined.slice(0, maxChars).trim()}\n[truncated]`;
  }

  return joined;
}

function pickTextPreview(text, maxChars = 220) {
  const normalized = normalizeString(text);
  if (!normalized) return null;
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars).trim()}...`;
}

function buildDataSourceCounts(files = []) {
  const supportedFiles = files.filter((file) => file.supported);
  return {
    matched_files: files.length,
    supported_files: supportedFiles.length,
    unsupported_files: files.length - supportedFiles.length,
  };
}

function mapLatestStageRun(stageRun) {
  if (!stageRun) return null;
  return {
    id: stageRun.id,
    stage_key: stageRun.stage_key,
    stage_label: stageRun.stage_label,
    state: stageRun.state,
    status: stageRun.status,
    input_summary: stageRun.input_summary || {},
    output_summary: stageRun.output_summary || {},
    error_summary: stageRun.error_summary || null,
    created_at: stageRun.created_at,
    completed_at: stageRun.completed_at,
  };
}

async function mapWithConcurrency(items, limit, iteratee) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function walkDataSources(directoryPath, state, accumulator, matchedByAncestor = false) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const sortedEntries = [...entries].sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    if (entry.name.startsWith('.')) continue;

    const absolutePath = path.join(directoryPath, entry.name);
    const prefixMatch = looksLikeStatePrefixedName(entry.name, state);
    const shouldIncludeChildren = matchedByAncestor || prefixMatch;

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        continue;
      }

      await walkDataSources(absolutePath, state, accumulator, shouldIncludeChildren);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!shouldIncludeChildren) {
      continue;
    }

    const stats = await fs.stat(absolutePath);
    const extension = path.extname(entry.name).toLowerCase();
    accumulator.push({
      absolute_path: absolutePath,
      relative_path: path.relative(dataRootPath(), absolutePath),
      file_name: entry.name,
      extension,
      kind: fileKindFromExtension(extension),
      supported: supportedByExtension(extension),
      matched_by: prefixMatch ? 'file_prefix' : 'ancestor_prefix',
      size_bytes: stats.size,
      modified_at: stats.mtime.toISOString(),
    });
  }
}

async function buildStateDataSourceIndex() {
  const rootPath = dataRootPath();
  try {
    await fs.access(rootPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { rootPath, byState: new Map() };
    }
    throw error;
  }

  const byState = new Map();
  const stateCodes = Object.keys(US_STATE_NAMES);

  for (const state of stateCodes) {
    const stateEntries = [];
    try {
      await walkDataSources(rootPath, state, stateEntries);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        byState.set(state, []);
        continue;
      }
      throw error;
    }
    byState.set(state, stateEntries);
  }

  return { rootPath, byState };
}

async function loadStateDataSourceIndex({ forceRefresh = false } = {}) {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedDataSourceIndex &&
    now - cachedDataSourceIndexAt < DATA_SOURCE_CACHE_TTL_MS
  ) {
    return cachedDataSourceIndex;
  }

  cachedDataSourceIndex = await buildStateDataSourceIndex();
  cachedDataSourceIndexAt = now;
  return cachedDataSourceIndex;
}

function renderHtmlText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript').remove();

  const lines = uniqueBy(
    $('title, h1, h2, h3, h4, li, td, th, p, a')
      .map((_, element) => normalizeString($(element).text()))
      .get()
      .filter((line) => line && line.length >= 3),
    (line) => line.toLowerCase(),
  );

  return trimLines(lines.join('\n'));
}

async function readZipEntry(filePath, entryPath) {
  const { stdout } = await execFile('unzip', ['-p', filePath, entryPath], {
    encoding: 'utf8',
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout;
}

async function listZipEntries(filePath) {
  const { stdout } = await execFile('unzip', ['-Z1', filePath], {
    encoding: 'utf8',
    maxBuffer: ZIP_MAX_BUFFER_BYTES,
  });
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseSharedStrings(xml) {
  if (!xml) return [];
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('sst > si')
    .map((_, element) => normalizeString($(element).text()))
    .get();
}

function parseWorkbookSheetNames(workbookXml, relationshipsXml) {
  if (!workbookXml || !relationshipsXml) {
    return new Map();
  }

  const workbook = cheerio.load(workbookXml, { xmlMode: true });
  const relationships = cheerio.load(relationshipsXml, { xmlMode: true });
  const targetsByRelationshipId = new Map();

  relationships('Relationship').each((_, relationship) => {
    const id = relationships(relationship).attr('Id');
    const target = relationships(relationship).attr('Target');
    if (!id || !target) return;

    const normalizedTarget = target.replace(/^\/+/, '').replace(/^xl\//, '');
    targetsByRelationshipId.set(id, normalizedTarget);
  });

  const sheetNames = new Map();
  workbook('sheet').each((_, sheet) => {
    const id = workbook(sheet).attr('r:id');
    const name = workbook(sheet).attr('name') || null;
    const target = id ? targetsByRelationshipId.get(id) : null;
    if (!target) return;
    sheetNames.set(`xl/${target}`, name || path.basename(target));
  });

  return sheetNames;
}

function spreadsheetCellText(cell, sharedStrings, $) {
  const type = $(cell).attr('t') || '';
  if (type === 'inlineStr') {
    return normalizeString($(cell).find('is t').text());
  }

  const rawValue = normalizeString($(cell).find('v').text());
  if (!rawValue) return '';

  if (type === 's') {
    return normalizeString(sharedStrings[toInt(rawValue)] || '');
  }

  if (type === 'b') {
    return rawValue === '1' ? 'true' : 'false';
  }

  return rawValue;
}

async function readSpreadsheetText(filePath) {
  const entries = await listZipEntries(filePath);
  const sharedStrings = entries.includes('xl/sharedStrings.xml')
    ? parseSharedStrings(await readZipEntry(filePath, 'xl/sharedStrings.xml'))
    : [];
  const sheetNames = parseWorkbookSheetNames(
    entries.includes('xl/workbook.xml') ? await readZipEntry(filePath, 'xl/workbook.xml') : '',
    entries.includes('xl/_rels/workbook.xml.rels')
      ? await readZipEntry(filePath, 'xl/_rels/workbook.xml.rels')
      : '',
  );

  const sheetEntries = entries.filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(entry)).slice(0, 8);
  const lines = [];

  for (const entry of sheetEntries) {
    const xml = await readZipEntry(filePath, entry);
    const $ = cheerio.load(xml, { xmlMode: true });
    const sheetName = sheetNames.get(entry) || path.basename(entry, path.extname(entry));
    lines.push(`Sheet: ${sheetName}`);

    $('sheetData row')
      .slice(0, 160)
      .each((_, row) => {
        const rowValues = $('c', row)
          .map((__, cell) => spreadsheetCellText(cell, sharedStrings, $))
          .get()
          .map((value) => normalizeString(value))
          .filter(Boolean);

        if (rowValues.length > 0) {
          lines.push(rowValues.join('\t'));
        }
      });
  }

  return trimLines(lines.join('\n'));
}

async function readDataSourceText(file) {
  if (TEXT_FILE_EXTENSIONS.has(file.extension)) {
    const raw = await fs.readFile(file.absolute_path, 'utf8');
    const rendered =
      file.extension === '.html' || file.extension === '.htm' ? renderHtmlText(raw) : trimLines(raw);
    return {
      text: rendered,
      source_type: file.extension.replace(/^\./, '') || 'text',
      parse_status: rendered ? 'success' : 'empty',
    };
  }

  if (SPREADSHEET_EXTENSIONS.has(file.extension)) {
    const rendered = await readSpreadsheetText(file.absolute_path);
    return {
      text: rendered,
      source_type: 'xlsx',
      parse_status: rendered ? 'success' : 'empty',
    };
  }

  if (PDF_EXTENSIONS.has(file.extension)) {
    const parsed = await parsePdfDocument({ filePath: file.absolute_path });
    const rendered = trimLines(parsed.text || parsed.headerText || '');
    return {
      text: rendered,
      source_type: 'pdf',
      parse_status: parsed.parseStatus || (rendered ? 'success' : 'empty'),
    };
  }

  return {
    text: '',
    source_type: file.kind || 'other',
    parse_status: 'unsupported',
  };
}

function extractedHospitalIdentityPrompt({ state, file, fileText }) {
  const stateName = getStateName(state) || state;
  return [
    `Target state: ${state} (${stateName})`,
    `File: ${file.relative_path}`,
    `Kind: ${file.kind}`,
    '',
    'Extract only real provider organizations or facilities that appear to be hospitals, medical centers, health systems, clinics, rehabilitation hospitals, or behavioral hospitals in the target state.',
    'Do not invent names or URLs.',
    'Do not return associations, agencies, member directories, article headlines, or generic navigation labels.',
    'If the file is about a single hospital system page, return that hospital/system if it is clearly in scope.',
    'Leave city empty when the file does not make it explicit.',
    '',
    fileText,
  ].join('\n');
}

function looksLikeProviderName(value) {
  const normalized = normalizeString(value);
  if (!normalized) return false;
  if (normalized.length < 3) return false;
  if (/^https?:\/\//i.test(normalized)) return false;
  if (EXCLUDED_NAME_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return /\b(?:hospital|health|healthcare|medical|clinic|center|centre|rehabilitation|behavioral|children|system|network|campus)\b/i.test(
    normalized,
  );
}

async function extractHospitalIdentitiesFromFile({ state, file }) {
  try {
    if (!file.supported) {
      return {
        ...file,
        status: 'unsupported',
        source_type: file.kind || 'other',
        parse_status: 'unsupported',
        extracted_hospitals: [],
        extracted_hospital_count: 0,
        prompt_preview: null,
        notes: 'Unsupported file type for automated state intake.',
      };
    }

    const { text, source_type, parse_status } = await readDataSourceText(file);
    if (!normalizeString(text)) {
      return {
        ...file,
        status: 'empty',
        source_type,
        parse_status,
        extracted_hospitals: [],
        extracted_hospital_count: 0,
        prompt_preview: null,
        notes: 'No usable text could be extracted from this data file.',
      };
    }

    const promptText = extractedHospitalIdentityPrompt({
      state,
      file,
      fileText: text,
    });

    const response = await requestStructuredOutputWithOpenAI({
      apiKey: config.openai.apiKey,
      baseUrl: config.openai.baseUrl,
      model: dataIntakeModel(),
      systemPrompt:
        'You extract hospital/provider identities from messy state-specific source files used to seed a medical-records workflow crawler. Return only identities explicitly supported by the file. Never invent provider names, cities, domains, or seed URLs.',
      userPrompt: promptText,
      schema: STATE_DATA_EXTRACTION_SCHEMA,
      schemaName: 'state_data_hospital_identities',
      timeoutMs: config.openai.timeoutMs,
    });

    const extractedHospitals = uniqueBy(
      (Array.isArray(response.output?.hospital_identities) ? response.output.hospital_identities : [])
        .map((entry) => ({
          facility_name: normalizeString(entry?.facility_name),
          city: normalizeString(entry?.city) || null,
          confidence: normalizeString(entry?.confidence).toLowerCase() || 'low',
          evidence_excerpt: normalizeString(entry?.evidence_excerpt) || null,
        }))
        .filter((entry) => looksLikeProviderName(entry.facility_name)),
      (entry) =>
        `${normalizeHospitalName(entry.facility_name)}::${normalizeHospitalName(entry.city || '')}`,
    );

    return {
      ...file,
      status: extractedHospitals.length > 0 ? 'ok' : 'no_targets',
      source_type,
      parse_status,
      source_kind: response.output?.source_kind || 'other',
      extracted_hospitals: extractedHospitals,
      extracted_hospital_count: extractedHospitals.length,
      prompt_preview: pickTextPreview(text),
      openai_response_id: response.responseId || null,
      openai_usage: response.usage || null,
      notes:
        extractedHospitals.length > 0
          ? null
          : 'The file was readable, but no provider identities were extracted with enough confidence.',
    };
  } catch (error) {
    return {
      ...file,
      status: 'failed',
      source_type: file.kind || 'other',
      parse_status: 'failed',
      extracted_hospitals: [],
      extracted_hospital_count: 0,
      prompt_preview: null,
      notes: error instanceof Error ? error.message : 'Failed to process this data file.',
    };
  }
}

function mergeExtractedHospitalIdentities(fileResults = [], state) {
  const aggregated = new Map();

  for (const result of fileResults) {
    for (const hospital of result.extracted_hospitals || []) {
      if (hospital.confidence === 'low') continue;

      const key = `${normalizeHospitalName(hospital.facility_name)}::${normalizeHospitalName(
        hospital.city || '',
      )}`;
      const existing = aggregated.get(key);
      const evidence = {
        relative_path: result.relative_path,
        confidence: hospital.confidence,
        evidence_excerpt: hospital.evidence_excerpt || null,
      };

      if (!existing) {
        aggregated.set(key, {
          facility_name: hospital.facility_name,
          city: hospital.city || null,
          state,
          evidence: [evidence],
        });
        continue;
      }

      existing.evidence.push(evidence);
    }
  }

  return Array.from(aggregated.values())
    .map((entry, index) => ({
      facility_name: entry.facility_name,
      city: entry.city,
      state,
      state_name: getStateName(state),
      normalized_facility_name: normalizeHospitalName(entry.facility_name),
      normalized_city: normalizeHospitalName(entry.city || ''),
      provider_numbers: entry.evidence.map(
        (evidence, evidenceIndex) => `data:${state}:${index}:${evidenceIndex}`,
      ),
      provider_row_count: entry.evidence.length,
      subtype_labels: [],
      evidence: entry.evidence,
    }))
    .sort((left, right) => {
      return (
        left.facility_name.localeCompare(right.facility_name) ||
        (left.city || '').localeCompare(right.city || '')
      );
    });
}

function buildStageStatus(summary) {
  if (
    summary.file_results.some((result) => result.status === 'failed') &&
    summary.generated_summary.generated_systems === 0
  ) {
    return 'failed';
  }
  if (summary.counts.matched_files === 0) return 'no_targets';
  if (summary.extracted_hospital_identities.length === 0) return 'no_targets';
  if (summary.generated_summary.generated_systems === 0) return 'no_targets';

  const hadPartialSignals =
    summary.counts.unsupported_files > 0 ||
    summary.file_results.some((result) => ['empty', 'unsupported', 'no_targets'].includes(result.status)) ||
    summary.generated_summary.generated_systems < summary.extracted_hospital_identities.length;

  return hadPartialSignals ? 'partial' : 'ok';
}

export async function listStateDataSources(state, { forceRefresh = false } = {}) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error(`A valid US state code is required: ${state}`);
  }

  const index = await loadStateDataSourceIndex({ forceRefresh });
  return [...(index.byState.get(normalizedState) || [])];
}

export async function getStateDataSourceCounts(state, { forceRefresh = false } = {}) {
  const files = await listStateDataSources(state, { forceRefresh });
  return buildDataSourceCounts(files);
}

export async function getStateDataPipelineSummary(state, { forceRefresh = false } = {}) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error(`A valid US state code is required: ${state}`);
  }

  const [matchingFiles, latestRun] = await Promise.all([
    listStateDataSources(normalizedState, { forceRefresh }),
    getLatestPipelineStageRun({
      state: normalizedState,
      stageKey: STATE_DATA_MATERIALIZATION_STAGE_KEY,
    }),
  ]);

  return {
    state: normalizedState,
    data_root_path: dataRootPath(),
    matching_files: matchingFiles,
    counts: buildDataSourceCounts(matchingFiles),
    latest_run: mapLatestStageRun(latestRun),
  };
}

export async function materializeStateSeedsFromData({
  state,
  reseedDb = false,
  promoteToSeedFile = false,
  dryRun = false,
  fetchImpl = fetch,
  searchFn = undefined,
} = {}) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('state is required for state data materialization.');
  }

  const matchingFiles = await listStateDataSources(normalizedState);
  const counts = buildDataSourceCounts(matchingFiles);
  if (counts.supported_files > 0 && !config.openai.apiKey) {
    throw new Error('OPENAI_API_KEY is required for state data materialization.');
  }

  if (counts.supported_files > 0 && !dataIntakeModel()) {
    throw new Error(
      'OPENAI_SEED_MATERIALIZATION_MODEL or OPENAI_PDF_FORM_MODEL is required for state data materialization.',
    );
  }

  const fileResults = await mapWithConcurrency(
    matchingFiles,
    DATA_EXTRACTION_CONCURRENCY,
    async (file) => extractHospitalIdentitiesFromFile({ state: normalizedState, file }),
  );

  const extractedHospitalIdentities = mergeExtractedHospitalIdentities(fileResults, normalizedState);
  const generatedSummary =
    extractedHospitalIdentities.length > 0
      ? await generateStateSeedCandidates({
          state: normalizedState,
          officialHospitals: extractedHospitalIdentities,
          dryRun,
          fetchImpl,
          ...(searchFn ? { searchFn } : {}),
        })
      : {
          state: normalizedState,
          official_hospital_identities: 0,
          generated_systems: 0,
          confidence_summary: { high: 0, medium: 0, low: 0 },
          output_path: null,
          dry_run: dryRun,
          entries: [],
        };

  const existingSnapshot = await readStateSeedFile(normalizedState);
  const shouldPersistSeedFile = promoteToSeedFile && generatedSummary.generated_systems > 0;
  const mergedPreviewSystems = shouldPersistSeedFile
    ? mergeSeedSystems(existingSnapshot.systems, generatedSummary.entries || [], normalizedState)
    : existingSnapshot.systems;

  const savedSeedFile = !shouldPersistSeedFile
    ? existingSnapshot
    : dryRun
    ? {
        state: normalizedState,
        seed_file_path: existingSnapshot.seed_file_path,
        systems: mergedPreviewSystems,
        counts: {
          systems: mergedPreviewSystems.length,
          facilities: mergedPreviewSystems.reduce(
            (total, system) => total + (Array.isArray(system.facilities) ? system.facilities.length : 0),
            0,
          ),
          seed_urls: mergedPreviewSystems.reduce(
            (total, system) => total + (Array.isArray(system.seed_urls) ? system.seed_urls.length : 0),
            0,
          ),
        },
      }
    : await mergeSystemsIntoStateSeedFile({
        state: normalizedState,
        systems: generatedSummary.entries || [],
      });

  const reseedSummary =
    !dryRun && shouldPersistSeedFile && reseedDb
      ? await reseedFromFile({ state: normalizedState })
      : null;

  return {
    state: normalizedState,
    state_name: getStateName(normalizedState),
    data_root_path: dataRootPath(),
    matching_files: matchingFiles,
    counts,
    file_results: fileResults,
    extracted_hospital_identities: extractedHospitalIdentities,
    generated_summary: generatedSummary,
    seed_file: savedSeedFile,
    seed_file_updated: shouldPersistSeedFile && !dryRun,
    promoted_systems: shouldPersistSeedFile ? generatedSummary.generated_systems : 0,
    reseed_summary: reseedSummary,
    reseed_db: shouldPersistSeedFile && reseedDb,
    promote_to_seed_file: promoteToSeedFile,
    dry_run: dryRun,
  };
}

export async function runStateDataMaterializationStage({
  state,
  reseedDb = false,
  promoteToSeedFile = false,
  dryRun = false,
  fetchImpl = fetch,
  searchFn = undefined,
} = {}) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('state is required for state data materialization.');
  }

  const matchingFiles = await listStateDataSources(normalizedState);
  const counts = buildDataSourceCounts(matchingFiles);
  const stageRun = await insertPipelineStageRun({
    stageKey: STATE_DATA_MATERIALIZATION_STAGE_KEY,
    stageLabel: STATE_DATA_MATERIALIZATION_STAGE_LABEL,
    state: normalizedState,
    status: 'running',
    inputSummary: {
      matched_files: counts.matched_files,
      supported_files: counts.supported_files,
      unsupported_files: counts.unsupported_files,
      reseed_db: promoteToSeedFile && reseedDb,
      promote_to_seed_file: promoteToSeedFile,
      dry_run: dryRun,
    },
    outputSummary: {},
  });

  try {
    const summary = await materializeStateSeedsFromData({
      state: normalizedState,
      reseedDb,
      promoteToSeedFile,
      dryRun,
      fetchImpl,
      ...(searchFn ? { searchFn } : {}),
    });
    const stageStatus = buildStageStatus(summary);
    const artifactDirectory = await ensureDataIntakeArtifactStateDir(normalizedState);
    const artifactPath = path.join(artifactDirectory, `${stageRun.id}.json`);

    if (!dryRun) {
      await fs.writeFile(`${artifactPath}`, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    }

    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: stageStatus,
      outputSummary: {
        matched_files: summary.counts.matched_files,
        supported_files: summary.counts.supported_files,
        unsupported_files: summary.counts.unsupported_files,
        extracted_hospital_identities: summary.extracted_hospital_identities.length,
        generated_systems: summary.generated_summary.generated_systems,
        generated_output_path: summary.generated_summary.output_path || null,
        canonical_seeded_systems: summary.seed_file.counts?.systems || 0,
        promoted_generated_systems: summary.promoted_systems || 0,
        reseeded_db_systems: summary.reseed_summary?.systems || 0,
        seed_file_path: summary.seed_file.seed_file_path,
        artifact_path: dryRun ? null : artifactPath,
      },
      errorSummary: null,
    });

    return {
      status: stageStatus === 'failed' ? 'failed' : stageStatus === 'no_targets' ? 'no_targets' : 'ok',
      stage_key: STATE_DATA_MATERIALIZATION_STAGE_KEY,
      stage_label: STATE_DATA_MATERIALIZATION_STAGE_LABEL,
      stage_status: stageStatus,
      stage_run_id: stageRun.id,
      state: normalizedState,
      matching_files: summary.counts.matched_files,
      extracted_hospital_identities: summary.extracted_hospital_identities.length,
      generated_systems: summary.generated_summary.generated_systems,
      generated_output_path: summary.generated_summary.output_path || null,
      canonical_seeded_systems: summary.seed_file.counts?.systems || 0,
      promoted_systems: summary.promoted_systems || 0,
      reseeded_db_systems: summary.reseed_summary?.systems || 0,
      artifact_path: dryRun ? null : artifactPath,
      summary,
    };
  } catch (error) {
    await completePipelineStageRun({
      stageRunId: stageRun.id,
      status: 'failed',
      outputSummary: {
        matched_files: counts.matched_files,
        supported_files: counts.supported_files,
        unsupported_files: counts.unsupported_files,
      },
      errorSummary: {
        message: error instanceof Error ? error.message : 'State data materialization failed.',
      },
    });
    throw error;
  }
}
