import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseHtmlDocument } from '../../parsers/htmlParser.js';
import { parsePdfDocument } from '../../parsers/pdfParser.js';
import { withTransaction } from '../../db.js';
import {
  completePipelineStageRun,
  insertParsedArtifact,
  insertPipelineStageRun,
  linkParsedArtifactToSourceDocument,
  listStageSourceDocuments,
} from '../../repositories/pipelineStageRepository.js';
import {
  ensureParsedArtifactStateDir,
  resolveParsedArtifactPath,
} from '../../utils/pipelineArtifactStorage.js';
import { resolveSourceDocumentPath } from '../../utils/sourceDocumentStorage.js';

const PARSE_STAGE_KEY = 'parse_stage';
const PARSE_STAGE_LABEL = 'Parse Stage';

function summarizeParsedDocument(parsedDocument) {
  const pages = Array.isArray(parsedDocument?.pages) ? parsedDocument.pages : [];
  return {
    page_count: pages.length,
    heading_count: Array.isArray(parsedDocument?.headings) ? parsedDocument.headings.length : 0,
    paragraph_count: Array.isArray(parsedDocument?.paragraphs) ? parsedDocument.paragraphs.length : 0,
    link_count: Array.isArray(parsedDocument?.links) ? parsedDocument.links.length : 0,
    contact_count: Array.isArray(parsedDocument?.contacts) ? parsedDocument.contacts.length : 0,
    widget_count: pages.reduce(
      (total, page) => total + (Array.isArray(page?.widgets) ? page.widgets.length : 0),
      0,
    ),
    parse_error: parsedDocument?.parseError || null,
  };
}

function parserNameForSourceType(sourceType) {
  return sourceType === 'pdf' ? 'pdf_parser' : 'html_parser';
}

function buildFailedParsedDocument(parseError) {
  return {
    sourceType: 'unknown',
    title: '',
    text: '',
    headerText: '',
    headerLines: [],
    pages: [],
    headings: [],
    paragraphs: [],
    links: [],
    contacts: [],
    parseStatus: 'failed',
    parseError: String(parseError || 'Parse stage failed.'),
  };
}

async function loadSourceDocumentForParse(sourceDocument) {
  if (sourceDocument.source_type === 'pdf') {
    if (!sourceDocument.storage_path) {
      throw new Error('Stored PDF path is missing.');
    }

    const resolvedPath = resolveSourceDocumentPath(sourceDocument.storage_path);
    const buffer = await fs.readFile(resolvedPath);
    const parsedDocument = await parsePdfDocument({
      buffer,
      filePath: resolvedPath,
    });

    return {
      parsedDocument,
      storageSourcePath: resolvedPath,
    };
  }

  if (!sourceDocument.storage_path) {
    throw new Error('Stored HTML snapshot is missing.');
  }

  const resolvedPath = resolveSourceDocumentPath(sourceDocument.storage_path);
  const html = await fs.readFile(resolvedPath, 'utf8');
  const parsedDocument = parseHtmlDocument({
    html,
    url: sourceDocument.source_url,
  });

  return {
    parsedDocument,
    storageSourcePath: resolvedPath,
  };
}

function buildParseStageStatus({ totalDocuments, parsedDocuments, failedDocuments }) {
  if (totalDocuments === 0) return 'no_documents';
  if (failedDocuments === 0) return 'ok';
  if (parsedDocuments > 0) return 'partial';
  return 'failed';
}

export async function loadParsedArtifactPayload(storagePath) {
  const resolvedPath = resolveParsedArtifactPath(storagePath);
  const fileContents = await fs.readFile(resolvedPath, 'utf8');
  return JSON.parse(fileContents);
}

async function persistParsedArtifactPayload(artifactPayload, client = null) {
  await fs.mkdir(path.dirname(artifactPayload.storage_path), { recursive: true });
  await fs.writeFile(artifactPayload.storage_path, JSON.stringify(artifactPayload, null, 2));

  const q = client || null;
  const parsedArtifact = await insertParsedArtifact(
    {
      id: artifactPayload.id,
      parseStageRunId: artifactPayload.parse_stage_run_id,
      fetchArtifactId: artifactPayload.fetch_artifact_id || null,
      sourceDocumentId: artifactPayload.source_document_id,
      sourceType: artifactPayload.source_type,
      parserName: artifactPayload.parser_name,
      parserVersion: artifactPayload.parser_version,
      parseStatus: artifactPayload.parse_status,
      storagePath: artifactPayload.storage_path,
      extractedText: artifactPayload.parsed_document?.text || '',
      summary: artifactPayload.summary,
    },
    q,
  );

  await linkParsedArtifactToSourceDocument(
    {
      sourceDocumentId: artifactPayload.source_document_id,
      parsedArtifactId: artifactPayload.id,
      extractedText: artifactPayload.parsed_document?.text || '',
      parserVersion: artifactPayload.parser_version,
    },
    q,
  );

  return parsedArtifact;
}

function buildParsedArtifactPayload({
  artifactId,
  parseStageRunId,
  sourceDocument,
  parsedDocument,
  storageSourcePath = null,
}) {
  const stateDirPromise = ensureParsedArtifactStateDir(sourceDocument.system_state);
  return stateDirPromise.then((stateDir) => {
    const artifactPath = path.join(stateDir, `${artifactId}.json`);
    const parseStatus = String(parsedDocument?.parseStatus || (parsedDocument?.text ? 'success' : 'failed'));
    const summary = summarizeParsedDocument(parsedDocument);

    return {
      id: artifactId,
      parse_stage_run_id: parseStageRunId,
      fetch_artifact_id: sourceDocument.fetch_artifact_id || null,
      source_document_id: sourceDocument.id,
      source_type: sourceDocument.source_type,
      parser_name: parserNameForSourceType(sourceDocument.source_type),
      parser_version: sourceDocument.parser_version || 'v1',
      parse_status: parseStatus,
      storage_path: artifactPath,
      created_at: new Date().toISOString(),
      source_document: {
        id: sourceDocument.id,
        source_url: sourceDocument.source_url,
        source_page_url: sourceDocument.source_page_url || null,
        title: sourceDocument.title || null,
        hospital_system_id: sourceDocument.hospital_system_id,
        facility_id: sourceDocument.facility_id || null,
        content_hash: sourceDocument.content_hash || null,
        fetched_at: sourceDocument.fetched_at,
        storage_path: sourceDocument.storage_path || null,
        storage_source_path: storageSourcePath,
      },
      summary,
      parsed_document: parsedDocument,
    };
  });
}

export async function createParsedArtifactForSourceDocument(
  {
    parseStageRunId,
    sourceDocument,
  },
  client = null,
) {
  const { parsedDocument, storageSourcePath } = await loadSourceDocumentForParse(sourceDocument);
  const artifactId = randomUUID();
  const artifactPayload = await buildParsedArtifactPayload({
    artifactId,
    parseStageRunId,
    sourceDocument,
    parsedDocument,
    storageSourcePath,
  });
  const parsedArtifact = await persistParsedArtifactPayload(artifactPayload, client);

  return {
    parsedArtifact,
    parsedDocument,
    artifactPayload,
  };
}

export async function createFailedParsedArtifactForSourceDocument(
  {
    parseStageRunId,
    sourceDocument,
    parseError,
  },
  client = null,
) {
  const artifactId = randomUUID();
  const artifactPayload = await buildParsedArtifactPayload({
    artifactId,
    parseStageRunId,
    sourceDocument,
    parsedDocument: buildFailedParsedDocument(parseError),
    storageSourcePath: null,
  });
  const parsedArtifact = await persistParsedArtifactPayload(artifactPayload, client);

  return {
    parsedArtifact,
    artifactPayload,
  };
}

export async function runParseStage({
  systemId = null,
  sourceDocumentIds = [],
  sourceType = null,
} = {}) {
  const sourceDocuments = await listStageSourceDocuments({
    systemId,
    sourceDocumentIds,
    sourceType,
  });

  const firstDocument = sourceDocuments[0] || null;
  const stageRun = await insertPipelineStageRun({
    stageKey: PARSE_STAGE_KEY,
    stageLabel: PARSE_STAGE_LABEL,
    state: firstDocument?.system_state || null,
    hospitalSystemId: firstDocument?.hospital_system_id || systemId || null,
    systemName: firstDocument?.system_name || null,
    status: sourceDocuments.length === 0 ? 'no_documents' : 'running',
    inputSummary: {
      source_documents: sourceDocuments.length,
      source_type: sourceType || null,
    },
    outputSummary: {},
  });

  if (sourceDocuments.length === 0) {
    return {
      status: 'ok',
      stage_key: PARSE_STAGE_KEY,
      stage_label: PARSE_STAGE_LABEL,
      stage_status: 'no_documents',
      stage_run_id: stageRun?.id || null,
      systems: systemId ? 1 : 0,
      crawled: 0,
      extracted: 0,
      failed: 0,
      source_documents: 0,
      parsed_documents: 0,
      parse_failures: 0,
      details: [],
    };
  }

  const details = [];
  let parsedDocuments = 0;
  let parseFailures = 0;

  for (const sourceDocument of sourceDocuments) {
    try {
      const { parsedArtifact, artifactPayload } = await withTransaction(async (client) =>
        createParsedArtifactForSourceDocument(
          {
            parseStageRunId: stageRun.id,
            sourceDocument,
          },
          client,
        ),
      );

      const parseStatus = artifactPayload.parse_status;
      if (parseStatus === 'success') {
        parsedDocuments += 1;
      } else {
        parseFailures += 1;
      }

      details.push({
        source_document_id: sourceDocument.id,
        parsed_artifact_id: parsedArtifact?.id || artifactPayload.id,
        title: sourceDocument.title || null,
        source_url: sourceDocument.source_url,
        status: parseStatus,
        storage_path: parsedArtifact?.storage_path || artifactPayload.storage_path || null,
      });
    } catch (error) {
      const parseError = error instanceof Error ? error.message : 'Parse stage failed.';
      parseFailures += 1;

      try {
        const { parsedArtifact, artifactPayload } = await withTransaction(async (client) =>
          createFailedParsedArtifactForSourceDocument(
            {
              parseStageRunId: stageRun.id,
              sourceDocument,
              parseError,
            },
            client,
          ),
        );

        details.push({
          source_document_id: sourceDocument.id,
          parsed_artifact_id: parsedArtifact?.id || artifactPayload.id,
          title: sourceDocument.title || null,
          source_url: sourceDocument.source_url,
          status: 'failed',
          error: parseError,
          storage_path: parsedArtifact?.storage_path || artifactPayload.storage_path || null,
        });
      } catch (persistenceError) {
        details.push({
          source_document_id: sourceDocument.id,
          title: sourceDocument.title || null,
          source_url: sourceDocument.source_url,
          status: 'failed',
          error: parseError,
          persistence_error:
            persistenceError instanceof Error
              ? persistenceError.message
              : 'Failed to persist parse-stage failure artifact.',
        });
      }
    }
  }

  const stageStatus = buildParseStageStatus({
    totalDocuments: sourceDocuments.length,
    parsedDocuments,
    failedDocuments: parseFailures,
  });
  await completePipelineStageRun({
    stageRunId: stageRun.id,
    status: stageStatus,
    outputSummary: {
      source_documents: sourceDocuments.length,
      parsed_documents: parsedDocuments,
      parse_failures: parseFailures,
    },
    errorSummary:
      stageStatus === 'failed'
        ? {
            message: 'Parse stage failed for every targeted source document.',
          }
        : null,
  });

  return {
    status: stageStatus === 'failed' ? 'failed' : 'ok',
    stage_key: PARSE_STAGE_KEY,
    stage_label: PARSE_STAGE_LABEL,
    stage_status: stageStatus,
    stage_run_id: stageRun.id,
    systems: 1,
    crawled: 0,
    extracted: parsedDocuments,
    failed: parseFailures,
    source_documents: sourceDocuments.length,
    parsed_documents: parsedDocuments,
    parse_failures: parseFailures,
    details,
  };
}
