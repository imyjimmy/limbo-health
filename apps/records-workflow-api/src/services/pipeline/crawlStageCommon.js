import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fetchAndParseDocument } from '../../crawler/fetcher.js';
import { expandCandidateLinks } from '../../crawler/linkExpander.js';
import { config } from '../../config.js';
import {
  insertCrawlFrontierItem,
  insertFetchArtifact,
  updateCrawlFrontierItem,
} from '../../repositories/pipelineStageRepository.js';
import {
  insertSourceDocument,
  listActiveSeeds,
  listKnownPdfSourcePages,
} from '../../repositories/workflowRepository.js';
import { withTransaction } from '../../db.js';
import { parseHtmlDocument } from '../../parsers/htmlParser.js';
import { parsePdfDocument } from '../../parsers/pdfParser.js';
import { assignPdfStoragePath } from '../../utils/pdfStorage.js';
import {
  ensureFetchArtifactDir,
} from '../../utils/pipelineArtifactStorage.js';
import {
  ensureSourceDocumentStateDir,
} from '../../utils/sourceDocumentStorage.js';
import { classifyMedicalRecordsRequestDocument } from '../../utils/urls.js';
import {
  filterBlockedTargetedPageItems,
  getTargetedPageBlockedUrlSet,
} from '../targetedPageBlocklistService.js';

export function normalizeForVisited(url) {
  try {
    const value = new URL(url);
    value.hash = '';
    value.pathname = value.pathname.replace(/\/+$/, '') || '/';
    return value.toString();
  } catch {
    return String(url || '').replace(/#.*$/, '').replace(/\/+$/, '') || url;
  }
}

export function derivePdfTitleFallback(sourceContext = null) {
  if (!sourceContext) return '';

  const candidates = [sourceContext.text, sourceContext.contextText, sourceContext.sourceTitle];
  for (const candidate of candidates) {
    const normalized = (candidate || '').trim();
    if (!normalized) continue;
    if (/^(request|download|form|click here)$/i.test(normalized)) continue;
    return normalized;
  }

  return '';
}

export function derivePdfTextFallback(sourceContext = null) {
  if (!sourceContext) return '';

  return [sourceContext.text, sourceContext.contextText, sourceContext.sourceTitle]
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .join(' ');
}

export function scoreSourceContext(sourceContext = null) {
  if (!sourceContext) return 0;

  return (
    (sourceContext.text || '').length +
    (sourceContext.contextText || '').length +
    (sourceContext.sourceTitle || '').length
  );
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildAcceptedHtmlFilename(fetchArtifact, parsedDocument) {
  const stem = slugify(
    [
      fetchArtifact?.facility_name,
      fetchArtifact?.system_name,
      parsedDocument?.title,
      fetchArtifact?.final_url ? path.basename(fetchArtifact.final_url).replace(/\.[a-z0-9]+$/i, '') : '',
      'page',
    ]
      .filter(Boolean)
      .join(' '),
  ) || `source-document-${String(fetchArtifact?.content_hash || '').slice(0, 12)}`;

  return `${stem}-${String(fetchArtifact?.content_hash || '').slice(0, 12)}.html`;
}

async function persistFetchArtifactBody({ state, fetchArtifactId, fetched, sourcePageUrl = null, sourceContext = null, depth = 0, crawlMode = 'general' }) {
  const artifactDir = await ensureFetchArtifactDir(state, fetchArtifactId);
  const extension =
    fetched.sourceType === 'pdf' ? 'pdf' : fetched.sourceType === 'html' ? 'html' : 'bin';
  const responsePath = path.join(artifactDir, `response.${extension}`);
  const metadataPath = path.join(artifactDir, 'metadata.json');

  await fs.writeFile(responsePath, fetched.bodyBuffer);
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        fetch_artifact_id: fetchArtifactId,
        requested_url: fetched.sourceUrl,
        final_url: fetched.finalUrl,
        source_page_url: sourcePageUrl,
        source_type: fetched.sourceType,
        content_hash: fetched.contentHash,
        response_bytes: fetched.responseBytes,
        fetch_backend: fetched.fetchBackend || null,
        fetched_at: fetched.fetchedAt,
        depth,
        crawl_mode: crawlMode,
        source_context: sourceContext || null,
      },
      null,
      2,
    ),
  );

  return responsePath;
}

function scoreSeedPriority(seed = null) {
  if (!seed) return 0;

  let score = 0;
  if (seed.seed_type === 'known_pdf_source_page') score += 40;
  if (/records_page/i.test(seed.seed_type || '')) score += 20;
  if (seed.approved_by_human) score += 10;
  return score;
}

function dedupeSeeds(seeds = []) {
  const deduped = new Map();

  for (const seed of seeds) {
    const key = `${seed?.hospital_system_id || ''}:${normalizeForVisited(seed?.url || '')}`;
    const existing = deduped.get(key);
    if (!existing || scoreSeedPriority(seed) > scoreSeedPriority(existing)) {
      deduped.set(key, seed);
    }
  }

  return Array.from(deduped.values());
}

export function isPinnedRecordsSeed(seed = null) {
  return (
    Boolean(seed?.approved_by_human) ||
    /records_page/i.test(seed?.seed_type || '') ||
    seed?.seed_type === 'known_pdf_source_page'
  );
}

export function hasTargetedRecordsSeed(seed = null) {
  return Boolean(seed?.approved_by_human) || /records_page/i.test(seed?.seed_type || '');
}

export function isFocusedSystemSeed(seed = null) {
  return hasTargetedRecordsSeed(seed) || seed?.seed_type === 'known_pdf_source_page';
}

function selectEffectiveSystemSeeds(seeds = []) {
  const focusedSeeds = seeds.filter((seed) => isFocusedSystemSeed(seed));
  if (focusedSeeds.length > 0) {
    return focusedSeeds;
  }

  return seeds;
}

export function buildFetchStageStatus({ fetchedDocuments, failedDocuments }) {
  if (fetchedDocuments === 0 && failedDocuments > 0) return 'failed';
  if (failedDocuments > 0) return 'partial';
  return 'ok';
}

export function buildTriageDecision({ fetched, documentClassification }) {
  if (fetched.sourceType !== 'pdf') {
    return {
      decision: 'accepted',
      basis: 'html',
      reasonCode: null,
      reasonDetail: null,
      classifierName: 'source_type_auto_accept',
      classifierVersion: 'v1',
    };
  }

  if (documentClassification.accepted) {
    return {
      decision: 'accepted',
      basis: documentClassification.basis || null,
      reasonCode: null,
      reasonDetail: null,
      classifierName: 'medical_records_request_document_classifier',
      classifierVersion: 'v1',
    };
  }

  return {
    decision: 'skipped',
    basis: documentClassification.basis || null,
    reasonCode: 'non_medical_records_pdf',
    reasonDetail: 'Classifier rejected the PDF as not being a medical-records-request document.',
    classifierName: 'medical_records_request_document_classifier',
    classifierVersion: 'v1',
  };
}

export async function resolvePipelineSystems({
  systemName = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  state = config.crawlState,
} = {}) {
  const activeSeeds = await listActiveSeeds({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state,
  });
  const knownPdfSourcePageSeeds =
    seedUrl
      ? []
      : await listKnownPdfSourcePages({
          systemName,
          systemId,
          facilityId,
          hospitalSystemIds,
          state,
        });
  const filteredActiveSeeds = await filterBlockedTargetedPageItems(activeSeeds, {
    defaultState: state,
  });
  const filteredKnownPdfSourcePageSeeds = await filterBlockedTargetedPageItems(
    knownPdfSourcePageSeeds,
    {
      defaultState: state,
    },
  );
  const systemsWithTargetedSeeds = new Set(
    filteredActiveSeeds
      .filter((seed) => hasTargetedRecordsSeed(seed))
      .map((seed) => seed.hospital_system_id)
      .filter(Boolean),
  );
  const effectiveKnownPdfSourcePageSeeds = filteredKnownPdfSourcePageSeeds.filter(
    (seed) => !systemsWithTargetedSeeds.has(seed.hospital_system_id),
  );
  const seeds = dedupeSeeds([...effectiveKnownPdfSourcePageSeeds, ...filteredActiveSeeds]);

  const perSystem = new Map();
  for (const seed of seeds) {
    if (!perSystem.has(seed.hospital_system_id)) {
      perSystem.set(seed.hospital_system_id, {
        systemId: seed.hospital_system_id,
        systemName: seed.system_name,
        canonicalDomain: seed.canonical_domain,
        state: seed.system_state,
        seeds: [],
      });
    }
    perSystem.get(seed.hospital_system_id).seeds.push(seed);
  }

  for (const system of perSystem.values()) {
    system.seeds = selectEffectiveSystemSeeds(system.seeds);
  }

  return {
    seeds,
    systems: Array.from(perSystem.values()),
  };
}

export async function runFetchStageForSystem({
  system,
  fetchStageRunId,
  maxDepth = config.crawl.maxDepth,
} = {}) {
  const blockedUrlSet = await getTargetedPageBlockedUrlSet({
    state: system?.state,
    hospitalSystemId: system?.systemId,
  });
  const visited = new Set();
  const queue = [];
  const details = [];
  let fetchedDocuments = 0;
  let failedDocuments = 0;

  for (const seed of system?.seeds || []) {
    if (blockedUrlSet.has(normalizeForVisited(seed.url))) {
      continue;
    }
    const frontierItem = await insertCrawlFrontierItem({
      fetchStageRunId,
      hospitalSystemId: system.systemId,
      facilityId: seed.facility_id || null,
      seedUrlId: seed.id || null,
      originalUrl: seed.url,
      normalizedUrl: normalizeForVisited(seed.url),
      depth: 0,
      queueStatus: 'queued',
      sourceContext: null,
    });

    queue.push({
      url: seed.url,
      depth: 0,
      facilityId: seed.facility_id || null,
      facilityName: seed.facility_name || null,
      seedUrlId: seed.id || null,
      sourceContext: null,
      crawlMode: isPinnedRecordsSeed(seed) ? 'records_page' : 'general',
      frontierItemId: frontierItem.id,
    });
  }

  while (queue.length > 0) {
    const item = queue.shift();
    const normalized = normalizeForVisited(item.url);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      const fetched = await fetchAndParseDocument({ url: item.url, state: system.state });
      fetchedDocuments += 1;

      const sourcePageUrl =
        fetched.sourceType === 'html'
          ? fetched.finalUrl
          : item.sourceContext?.sourceUrl || null;
      const fetchArtifactId = randomUUID();
      const storagePath = await persistFetchArtifactBody({
        state: system.state,
        fetchArtifactId,
        fetched,
        sourcePageUrl,
        sourceContext: item.sourceContext,
        depth: item.depth,
        crawlMode: item.crawlMode,
      });

      await updateCrawlFrontierItem({
        id: item.frontierItemId,
        finalUrl: fetched.finalUrl,
        queueStatus: 'fetched',
        sourceContext: item.sourceContext || null,
        lastError: '',
      });

      const fetchArtifact = await insertFetchArtifact({
        id: fetchArtifactId,
        crawlFrontierItemId: item.frontierItemId,
        fetchStageRunId,
        hospitalSystemId: system.systemId,
        facilityId: item.facilityId,
        requestedUrl: item.url,
        finalUrl: fetched.finalUrl,
        sourcePageUrl,
        httpStatus: fetched.status,
        contentType: fetched.contentType,
        sourceType:
          fetched.sourceType === 'html' || fetched.sourceType === 'pdf'
            ? fetched.sourceType
            : 'other',
        title: fetched.title || derivePdfTitleFallback(item.sourceContext) || null,
        contentHash: fetched.contentHash,
        responseBytes: fetched.responseBytes || null,
        fetchBackend: fetched.fetchBackend || null,
        storagePath,
        headers: fetched.headers || {},
        fetchMetadata: {
          depth: item.depth,
          crawl_mode: item.crawlMode,
          source_context: item.sourceContext || null,
        },
        fetchedAt: fetched.fetchedAt,
      });

      details.push({
        frontier_item_id: item.frontierItemId,
        fetch_artifact_id: fetchArtifact.id,
        url: fetched.finalUrl,
        status: 'fetched',
        source_type: fetched.sourceType,
        depth: item.depth,
        crawl_mode: item.crawlMode,
      });

      if (fetched.sourceType === 'html' && item.depth < maxDepth && item.crawlMode !== 'terminal') {
        const expansionMode = item.crawlMode === 'records_page' ? 'records_page' : 'general';
        const nextLinks = expandCandidateLinks({
          document: fetched.parsed,
          allowedDomain: system.canonicalDomain,
          mode: expansionMode,
        });

        for (const link of nextLinks) {
          const nextNormalized = normalizeForVisited(link.url);
          if (blockedUrlSet.has(nextNormalized)) continue;
          const existingQueuedItem = queue.find(
            (queuedItem) => normalizeForVisited(queuedItem.url) === nextNormalized,
          );

          if (existingQueuedItem) {
            if (scoreSourceContext(link) > scoreSourceContext(existingQueuedItem.sourceContext)) {
              existingQueuedItem.sourceContext = link;
              await updateCrawlFrontierItem({
                id: existingQueuedItem.frontierItemId,
                sourceContext: link,
              });
            }
            continue;
          }

          if (visited.has(nextNormalized)) continue;
          const frontierItem = await insertCrawlFrontierItem({
            fetchStageRunId,
            hospitalSystemId: system.systemId,
            facilityId: item.facilityId,
            discoveredFromItemId: item.frontierItemId,
            originalUrl: link.url,
            normalizedUrl: nextNormalized,
            depth: item.depth + 1,
            queueStatus: 'queued',
            sourceContext: link,
          });
          queue.push({
            url: link.url,
            depth: item.depth + 1,
            facilityId: item.facilityId,
            facilityName: item.facilityName,
            sourceContext: link,
            crawlMode: expansionMode === 'records_page' ? 'terminal' : 'general',
            frontierItemId: frontierItem.id,
          });
        }
      }
    } catch (error) {
      failedDocuments += 1;
      await updateCrawlFrontierItem({
        id: item.frontierItemId,
        queueStatus: 'failed',
        sourceContext: item.sourceContext || null,
        lastError: error instanceof Error ? error.message : 'Fetch stage failed.',
      });
      details.push({
        frontier_item_id: item.frontierItemId,
        url: item.url,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Fetch stage failed.',
        depth: item.depth,
        crawl_mode: item.crawlMode,
      });
    }
  }

  return {
    fetchedDocuments,
    failedDocuments,
    details,
  };
}

export async function loadFetchArtifactDocument(fetchArtifact) {
  const resolvedPath = fetchArtifact.storage_path;

  if (fetchArtifact.source_type === 'pdf') {
    const buffer = await fs.readFile(resolvedPath);
    const parsedDocument = await parsePdfDocument({
      buffer,
      filePath: resolvedPath,
    });

    return {
      parsedDocument,
      resolvedPath,
      rawContent: buffer,
    };
  }

  const html = await fs.readFile(resolvedPath, 'utf8');
  const parsedDocument = parseHtmlDocument({
    html,
    url: fetchArtifact.final_url || fetchArtifact.requested_url,
  });

  return {
    parsedDocument,
    resolvedPath,
    rawContent: html,
  };
}

export function classifyFetchArtifact({ fetchArtifact, parsedDocument, sourceContext = null }) {
  if (fetchArtifact.source_type !== 'pdf') {
    return {
      accepted: true,
      basis: 'html',
    };
  }

  return classifyMedicalRecordsRequestDocument({
    url: fetchArtifact.final_url,
    title: fetchArtifact.title,
    text: parsedDocument?.text || '',
    links: parsedDocument?.links || [],
    sourceUrl: sourceContext?.sourceUrl || '',
    sourceTitle: sourceContext?.sourceTitle || '',
    sourceText: sourceContext?.sourceText || '',
    sourceLinkText: sourceContext?.text || '',
    sourceLinkContext: sourceContext?.contextText || '',
  });
}

export async function promoteAcceptedFetchArtifact({
  fetchArtifact,
  triageDecision,
  acceptedStageRunId = null,
} = {}) {
  const effectiveFetchArtifactId = fetchArtifact?.fetch_artifact_id || fetchArtifact?.id || null;
  const sourceContext = fetchArtifact.fetch_metadata?.source_context || null;
  let parsedDocument = null;
  let storagePath = fetchArtifact.storage_path;
  let title = fetchArtifact.title || derivePdfTitleFallback(sourceContext) || null;
  let extractedText = '';

  if (fetchArtifact.source_type === 'pdf') {
    const { parsedDocument: nextParsedDocument } = await loadFetchArtifactDocument(fetchArtifact);
    parsedDocument = nextParsedDocument;
    extractedText = parsedDocument?.text || '';
    storagePath = await assignPdfStoragePath({
      currentStoragePath: fetchArtifact.storage_path,
      contentHash: fetchArtifact.content_hash,
      state: fetchArtifact.system_state,
      systemName: fetchArtifact.system_name,
      facilityName: fetchArtifact.facility_name,
      url: fetchArtifact.final_url,
      title,
      text: extractedText || derivePdfTextFallback(sourceContext),
      headerText: parsedDocument?.headerText || title || '',
      headerLines: parsedDocument?.headerLines || [],
    });
  } else if (fetchArtifact.source_type === 'html') {
    const { parsedDocument: nextParsedDocument } = await loadFetchArtifactDocument(fetchArtifact);
    parsedDocument = nextParsedDocument;
    title = title || parsedDocument?.title || null;
    extractedText = parsedDocument?.text || '';
    const sourceDocumentStateDir = await ensureSourceDocumentStateDir(fetchArtifact.system_state);
    storagePath = path.join(
      sourceDocumentStateDir,
      buildAcceptedHtmlFilename(fetchArtifact, parsedDocument),
    );
    await fs.copyFile(fetchArtifact.storage_path, storagePath);
  }

  const sourcePageUrl =
    fetchArtifact.source_type === 'html'
      ? fetchArtifact.final_url || fetchArtifact.requested_url
      : fetchArtifact.source_page_url || sourceContext?.sourceUrl || null;
  const discoveredFromUrl = sourceContext?.sourceUrl || sourcePageUrl || null;

  const sourceDocumentId = await withTransaction(async (client) =>
    insertSourceDocument(
      {
        hospitalSystemId: fetchArtifact.hospital_system_id,
        facilityId: fetchArtifact.facility_id || null,
        sourceUrl: fetchArtifact.final_url,
        sourcePageUrl,
        discoveredFromUrl,
        acceptedStageRunId,
        fetchArtifactId: effectiveFetchArtifactId,
        triageDecisionId: triageDecision.id,
        sourceType: fetchArtifact.source_type,
        title,
        fetchedAt: fetchArtifact.fetched_at,
        httpStatus: fetchArtifact.http_status,
        contentHash: fetchArtifact.content_hash,
        storagePath,
        extractedText,
        parserVersion: config.crawl.parserVersion,
      },
      client,
    ),
  );

  if (fetchArtifact.crawl_frontier_item_id) {
    await updateCrawlFrontierItem({
      id: fetchArtifact.crawl_frontier_item_id,
      queueStatus: 'accepted',
    });
  }

  return {
    sourceDocumentId,
    storagePath,
    title,
    extractedText,
  };
}
