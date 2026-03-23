import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { parseHtmlDocument } from '../parsers/htmlParser.js';
import { parsePdfDocument } from '../parsers/pdfParser.js';
import { withTransaction } from '../db.js';
import { extractPdfFormUnderstanding } from '../extractors/pdfFormUnderstandingExtractor.js';
import { extractWorkflowBundle } from '../extractors/workflowExtractor.js';
import {
  getFacilityById,
  getHospitalSystemById,
  insertExtractionRun,
  saveExtractionResult,
  upsertHospitalSystem,
  upsertSeedUrl,
} from '../repositories/workflowRepository.js';
import { ensureSourceDocumentStateDir, resolveSourceDocumentPath } from '../utils/sourceDocumentStorage.js';
import { sha256 } from '../utils/hash.js';
import { assignPdfStoragePath } from '../utils/pdfStorage.js';
import { collapseWhitespace } from '../utils/text.js';
import { normalizeStateCode } from '../utils/states.js';
import { runCrawl } from './crawlService.js';
import { upsertHumanApprovedSeedInFile } from './seedEditorService.js';

function normalizeString(value) {
  return collapseWhitespace(typeof value === 'string' ? value : '');
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function inferSeedType(url) {
  if (/mychart|myhealthone|mybilh|mytuftsmed|mybaystate|mychildren|portal|gateway/i.test(url)) {
    return 'portal_page';
  }
  if (/(^|[^a-z])(forms?|authorization|release|roi|pdf)([^a-z]|$)/i.test(url)) return 'forms_page';
  if (/(^|[^a-z])(locations?|facility|medical-records)([^a-z]|$)/i.test(url)) return 'facility_records_page';
  if (/directory/i.test(url)) return 'directory_page';
  return 'system_records_page';
}

function buildManualSourceUrl({ sourceType, contentHash, fileName, sourceUrl }) {
  const explicit = normalizeOptionalString(sourceUrl);
  if (explicit) return explicit;

  const suffix = slugify(fileName || '') || contentHash.slice(0, 12);
  return `manual://${sourceType}/${suffix}-${contentHash.slice(0, 12)}`;
}

function buildImportNotes(notes, localFilePath) {
  return [normalizeOptionalString(notes), localFilePath ? `Imported from ${localFilePath}` : null]
    .filter(Boolean)
    .join(' | ') || null;
}

async function resolveSystemContext({ hospitalSystemId, facilityId = null, state = null }) {
  const system = await getHospitalSystemById(hospitalSystemId);
  if (!system) {
    throw new Error('Hospital system not found.');
  }

  const facility = facilityId ? await getFacilityById(facilityId) : null;
  if (facilityId && !facility) {
    throw new Error('Facility not found.');
  }

  if (facility && facility.hospital_system_id !== system.id) {
    throw new Error('Facility does not belong to the selected hospital system.');
  }

  const resolvedState = normalizeStateCode(state) || system.state;
  if (resolvedState !== system.state) {
    throw new Error(`Hospital system ${system.system_name} belongs to ${system.state}, not ${resolvedState}.`);
  }

  return {
    system,
    facility,
    state: resolvedState,
  };
}

async function resolveSystemContextForManualUrl({
  hospitalSystemId = null,
  systemName = null,
  domain = null,
  facilityId = null,
  state = null,
}) {
  if (hospitalSystemId) {
    return resolveSystemContext({ hospitalSystemId, facilityId, state });
  }

  const normalizedSystemName = normalizeOptionalString(systemName);
  const normalizedState = normalizeStateCode(state);
  if (!normalizedSystemName || !normalizedState) {
    throw new Error('Hospital system id or state/system name is required.');
  }

  if (facilityId) {
    throw new Error('Facility-specific manual URLs require a hospital system id.');
  }

  const system = await upsertHospitalSystem({
    systemName: normalizedSystemName,
    domain: normalizeOptionalString(domain),
    state: normalizedState,
  });

  return {
    system,
    facility: null,
    state: normalizedState,
  };
}

async function readTextImportInput({ localFilePath = null, html = null, fileBase64 = null }) {
  if (normalizeOptionalString(html)) {
    return {
      text: html,
      localFilePath: null,
      fileName: null,
    };
  }

  if (normalizeOptionalString(localFilePath)) {
    const resolved = path.resolve(localFilePath);
    return {
      text: await fs.readFile(resolved, 'utf8'),
      localFilePath: resolved,
      fileName: path.basename(resolved),
    };
  }

  if (normalizeOptionalString(fileBase64)) {
    const text = Buffer.from(fileBase64, 'base64').toString('utf8');
    return {
      text,
      localFilePath: null,
      fileName: null,
    };
  }

  throw new Error('Provide html, localFilePath, or fileBase64 for manual HTML import.');
}

async function readBinaryImportInput({ localFilePath = null, fileBase64 = null }) {
  if (normalizeOptionalString(localFilePath)) {
    const resolved = path.resolve(localFilePath);
    return {
      buffer: await fs.readFile(resolved),
      localFilePath: resolved,
      fileName: path.basename(resolved),
    };
  }

  if (normalizeOptionalString(fileBase64)) {
    return {
      buffer: Buffer.from(fileBase64, 'base64'),
      localFilePath: null,
      fileName: null,
    };
  }

  throw new Error('Provide localFilePath or fileBase64 for manual PDF import.');
}

async function writeManualHtmlSnapshot({ state, contentHash, title, html }) {
  const stateDir = await ensureSourceDocumentStateDir(state);
  const snapshotDir = path.join(stateDir, 'manual-html');
  const fileStem = slugify(title || '') || contentHash.slice(0, 16);
  const filePath = path.join(snapshotDir, `${fileStem}-${contentHash.slice(0, 12)}.html`);
  await fs.mkdir(snapshotDir, { recursive: true });
  await fs.writeFile(filePath, html, 'utf8');
  return filePath;
}

function buildManualWorkflowBundle(document) {
  const hasSignal = Boolean(
    normalizeString(document?.title) ||
      normalizeString(document?.text) ||
      (Array.isArray(document?.links) && document.links.length > 0) ||
      (Array.isArray(document?.contacts) && document.contacts.length > 0),
  );

  if (!hasSignal) {
    return {
      portal: null,
      workflows: [],
      evidenceSnippets: [],
    };
  }

  return extractWorkflowBundle(document, { isOfficialDomain: true });
}

function buildPdfFallbackTitle(parsedPdf, titleOverride, fileName) {
  return normalizeOptionalString(titleOverride) || normalizeOptionalString(parsedPdf?.title) || fileName || 'Authorization Form';
}

function buildPdfFallbackText(parsedPdf, title, notes) {
  return (
    normalizeOptionalString(parsedPdf?.text) ||
    [normalizeOptionalString(title), normalizeOptionalString(parsedPdf?.headerText), normalizeOptionalString(notes)]
      .filter(Boolean)
      .join(' ')
  );
}

async function maybeInsertPdfFormUnderstanding({
  sourceDocumentId,
  parsedPdf,
  hospitalSystemName,
  facilityName,
  formName,
  sourceUrl,
}) {
  if (!Array.isArray(parsedPdf?.pages) || parsedPdf.pages.length === 0) {
    return null;
  }

  const extraction = await extractPdfFormUnderstanding({
    parsedPdf,
    hospitalSystemName,
    facilityName,
    formName,
    sourceUrl,
  });

  const extractionRunId = await insertExtractionRun({
    sourceDocumentId,
    extractorName: extraction.extractorName,
    extractorVersion: extraction.extractorVersion,
    status: extraction.status,
    structuredOutput: extraction.structuredOutput,
  });

  return {
    id: extractionRunId,
    status: extraction.status,
    structured_output: extraction.structuredOutput,
  };
}

export async function addManualApprovedUrl({
  hospitalSystemId,
  systemName = null,
  domain = null,
  facilityId = null,
  officialPageUrl,
  directPdfUrl = null,
  notes = null,
  updateSeedFile = true,
  crawlNow = false,
  state = null,
}) {
  const context = await resolveSystemContextForManualUrl({
    hospitalSystemId,
    systemName,
    domain,
    facilityId,
    state,
  });
  const { system, facility } = context;
  const approvedUrls = [normalizeOptionalString(officialPageUrl), normalizeOptionalString(directPdfUrl)].filter(Boolean);

  if (approvedUrls.length === 0) {
    throw new Error('At least one approved URL is required.');
  }

  const seedIds = [];
  await withTransaction(async (client) => {
    for (const url of approvedUrls) {
      seedIds.push(
        await upsertSeedUrl(
          {
            hospitalSystemId: system.id,
            facilityId: facility?.id || null,
            url,
            seedType: inferSeedType(url),
            active: true,
            approvedByHuman: true,
            evidenceNote: normalizeOptionalString(notes),
          },
          client,
        ),
      );
    }
  });

  let seedFile = null;
  if (updateSeedFile) {
    seedFile = await upsertHumanApprovedSeedInFile({
      state: context.state,
      systemName: system.system_name,
      domain: system.canonical_domain,
      seedUrls: approvedUrls,
      facility: facility
        ? {
            facility_name: facility.facility_name,
            city: facility.city,
            state: facility.state,
          }
        : null,
    });
  }

  const crawlSummary = crawlNow
    ? await runCrawl({
        state: context.state,
        systemId: system.id,
      })
    : null;

  return {
    status: 'ok',
    state: context.state,
    hospital_system_id: system.id,
    facility_id: facility?.id || null,
    seed_ids: seedIds,
    approved_urls: approvedUrls,
    seed_file: seedFile,
    crawl_summary: crawlSummary,
  };
}

export async function importManualHtml({
  state = null,
  hospitalSystemId,
  facilityId = null,
  sourceUrl = null,
  titleOverride = null,
  notes = null,
  localFilePath = null,
  html = null,
  fileBase64 = null,
}) {
  const context = await resolveSystemContext({ hospitalSystemId, facilityId, state });
  const input = await readTextImportInput({ localFilePath, html, fileBase64 });
  const contentHash = sha256(input.text);
  const manualSourceUrl = buildManualSourceUrl({
    sourceType: 'html',
    contentHash,
    fileName: input.fileName,
    sourceUrl,
  });
  const parsed = parseHtmlDocument({ html: input.text, url: manualSourceUrl });
  const title = normalizeOptionalString(titleOverride) || normalizeOptionalString(parsed.title) || input.fileName || context.system.system_name;
  const storagePath = await writeManualHtmlSnapshot({
    state: context.state,
    contentHash,
    title,
    html: input.text,
  });
  const bundle = buildManualWorkflowBundle(parsed);

  const sourceDocumentId = await saveExtractionResult({
    sourceDocument: {
      hospitalSystemId: context.system.id,
      facilityId: context.facility?.id || null,
      sourceUrl: manualSourceUrl,
      sourcePageUrl: manualSourceUrl,
      sourceType: 'html',
      title,
      fetchedAt: new Date().toISOString(),
      httpStatus: 200,
      contentHash,
      storagePath,
      extractedText: parsed.text || '',
      parserVersion: config.crawl.parserVersion,
      importMode: 'manual_html',
      importNotes: buildImportNotes(notes, input.localFilePath),
    },
    status: bundle.workflows.length > 0 ? 'success' : 'partial',
    portal: bundle.portal,
    workflows: bundle.workflows,
    structuredOutput: {
      portal: bundle.portal,
      workflows: bundle.workflows,
      evidenceSnippets: bundle.evidenceSnippets,
      metadata: {
        sourceUrl: manualSourceUrl,
        sourcePageUrl: manualSourceUrl,
        sourceType: 'html',
        httpStatus: 200,
        documentClassificationBasis: 'human_confirmed',
        importMode: 'manual_html',
        localFilePath: input.localFilePath,
        notes: normalizeOptionalString(notes),
      },
    },
  });

  return {
    status: 'ok',
    source_document_id: sourceDocumentId,
    content_url: `/api/records-workflow/source-documents/${sourceDocumentId}/content`,
    workflow_count: bundle.workflows.length,
    title,
  };
}

export async function importManualPdf({
  state = null,
  hospitalSystemId,
  facilityId = null,
  sourceUrl = null,
  titleOverride = null,
  notes = null,
  localFilePath = null,
  fileBase64 = null,
}) {
  const context = await resolveSystemContext({ hospitalSystemId, facilityId, state });
  const input = await readBinaryImportInput({ localFilePath, fileBase64 });
  const contentHash = sha256(input.buffer);
  const stateDir = await ensureSourceDocumentStateDir(context.state);
  const tempStoragePath = path.join(stateDir, `${contentHash}.pdf`);
  await fs.writeFile(tempStoragePath, input.buffer);

  const manualSourceUrl = buildManualSourceUrl({
    sourceType: 'pdf',
    contentHash,
    fileName: input.fileName,
    sourceUrl,
  });
  const parsed = await parsePdfDocument({
    buffer: input.buffer,
    filePath: tempStoragePath,
  });
  const title = buildPdfFallbackTitle(parsed, titleOverride, input.fileName);
  const finalStoragePath = await assignPdfStoragePath({
    currentStoragePath: resolveSourceDocumentPath(tempStoragePath),
    contentHash,
    state: context.state,
    systemName: context.system.system_name,
    facilityName: context.facility?.facility_name || null,
    url: manualSourceUrl,
    title,
    text: buildPdfFallbackText(parsed, title, notes),
    headerText: normalizeOptionalString(parsed.headerText) || title,
    headerLines: Array.isArray(parsed.headerLines) ? parsed.headerLines : [],
  });
  const bundle = buildManualWorkflowBundle(parsed);

  const sourceDocumentId = await saveExtractionResult({
    sourceDocument: {
      hospitalSystemId: context.system.id,
      facilityId: context.facility?.id || null,
      sourceUrl: manualSourceUrl,
      sourceType: 'pdf',
      title,
      fetchedAt: new Date().toISOString(),
      httpStatus: 200,
      contentHash,
      storagePath: finalStoragePath,
      extractedText: parsed.text || '',
      parserVersion: config.crawl.parserVersion,
      importMode: 'manual_pdf',
      importNotes: buildImportNotes(notes, input.localFilePath),
    },
    status: bundle.workflows.length > 0 ? 'success' : 'partial',
    portal: bundle.portal,
    workflows: bundle.workflows,
    structuredOutput: {
      portal: bundle.portal,
      workflows: bundle.workflows,
      evidenceSnippets: bundle.evidenceSnippets,
      metadata: {
        sourceUrl: manualSourceUrl,
        sourceType: 'pdf',
        httpStatus: 200,
        documentClassificationBasis: 'human_confirmed',
        pdfParseStatus: parsed.parseStatus || null,
        pdfParseError: parsed.parseError || null,
        pdfRepairAttempted: Boolean(parsed.repairAttempted),
        pdfRepaired: Boolean(parsed.repaired),
        importMode: 'manual_pdf',
        localFilePath: input.localFilePath,
        notes: normalizeOptionalString(notes),
      },
    },
  });

  const formUnderstandingRun = await maybeInsertPdfFormUnderstanding({
    sourceDocumentId,
    parsedPdf: parsed,
    hospitalSystemName: context.system.system_name,
    facilityName: context.facility?.facility_name || null,
    formName: title,
    sourceUrl: manualSourceUrl,
  });

  return {
    status: 'ok',
    source_document_id: sourceDocumentId,
    content_url: `/api/records-workflow/source-documents/${sourceDocumentId}/content`,
    storage_path: finalStoragePath,
    workflow_count: bundle.workflows.length,
    parse_status: parsed.parseStatus || null,
    form_understanding_status: formUnderstandingRun?.status || null,
    title,
  };
}
