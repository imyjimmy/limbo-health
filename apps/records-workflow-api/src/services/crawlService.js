import { randomUUID } from 'node:crypto';
import { fetchAndParseDocument } from '../crawler/fetcher.js';
import { expandCandidateLinks } from '../crawler/linkExpander.js';
import { config } from '../config.js';
import { completePipelineStageRun, insertFetchArtifact, insertPipelineStageRun, insertTriageDecision } from '../repositories/pipelineStageRepository.js';
import { withTransaction } from '../db.js';
import {
  insertSourceDocument,
  listActiveSeeds,
  listKnownPdfSourcePages,
} from '../repositories/workflowRepository.js';
import { assignPdfStoragePath } from '../utils/pdfStorage.js';
import { classifyMedicalRecordsRequestDocument } from '../utils/urls.js';

function normalizeForVisited(url) {
  try {
    const value = new URL(url);
    value.hash = '';
    return value.toString();
  } catch {
    return url;
  }
}

function derivePdfTitleFallback(sourceContext = null) {
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

function derivePdfTextFallback(sourceContext = null) {
  if (!sourceContext) return '';

  return [sourceContext.text, sourceContext.contextText, sourceContext.sourceTitle]
    .map((value) => (value || '').trim())
    .filter(Boolean)
    .join(' ');
}

function scoreSourceContext(sourceContext = null) {
  if (!sourceContext) return 0;

  return (
    (sourceContext.text || '').length +
    (sourceContext.contextText || '').length +
    (sourceContext.sourceTitle || '').length
  );
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

function isPinnedRecordsSeed(seed = null) {
  return (
    Boolean(seed?.approved_by_human) ||
    /records_page/i.test(seed?.seed_type || '') ||
    seed?.seed_type === 'known_pdf_source_page'
  );
}

function buildFetchStageStatus({ fetchedDocuments, failedDocuments }) {
  if (fetchedDocuments === 0 && failedDocuments > 0) return 'failed';
  if (failedDocuments > 0) return 'partial';
  return 'ok';
}

function buildTriageDecision({ fetched, documentClassification }) {
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

export async function runCrawl({
  systemName = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  state = config.crawlState,
  maxDepth = config.crawl.maxDepth
} = {}) {
  const activeSeeds = await listActiveSeeds({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state
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
  const seeds = dedupeSeeds([...knownPdfSourcePageSeeds, ...activeSeeds]);
  if (seeds.length === 0) {
    return {
      status: 'no_seeds',
      crawled: 0,
      extracted: 0,
      failed: 0,
      systems: 0,
      details: []
    };
  }

  const perSystem = new Map();
  for (const seed of seeds) {
    if (!perSystem.has(seed.hospital_system_id)) {
      perSystem.set(seed.hospital_system_id, {
        systemId: seed.hospital_system_id,
        systemName: seed.system_name,
        canonicalDomain: seed.canonical_domain,
        state: seed.system_state,
        seeds: []
      });
    }
    perSystem.get(seed.hospital_system_id).seeds.push(seed);
  }

  let crawled = 0;
  let extracted = 0;
  let failed = 0;
  const details = [];

  for (const system of perSystem.values()) {
    const fetchStageRun = await insertPipelineStageRun({
      stageKey: 'fetch_stage',
      stageLabel: 'Fetch Stage',
      state: system.state,
      hospitalSystemId: system.systemId,
      systemName: system.systemName,
      status: 'running',
      inputSummary: {
        seed_urls: system.seeds.length,
        max_depth: maxDepth,
      },
    });
    const triageStageRun = await insertPipelineStageRun({
      stageKey: 'triage_stage',
      stageLabel: 'Document Triage Stage',
      state: system.state,
      hospitalSystemId: system.systemId,
      systemName: system.systemName,
      status: 'running',
      inputSummary: {
        seed_urls: system.seeds.length,
      },
    });
    const visited = new Set();
    const queue = system.seeds.map((seed) => ({
      url: seed.url,
      depth: 0,
      facilityId: seed.facility_id || null,
      facilityName: seed.facility_name || null,
      sourceContext: null,
      crawlMode: isPinnedRecordsSeed(seed) ? 'records_page' : 'general',
      }));
    let systemFetched = 0;
    let systemFetchFailed = 0;
    let systemAccepted = 0;
    let systemSkipped = 0;

    while (queue.length > 0) {
      const item = queue.shift();
      const normalized = normalizeForVisited(item.url);
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      try {
        const fetched = await fetchAndParseDocument({ url: item.url, state: system.state });
        crawled += 1;
        systemFetched += 1;
        const documentClassification =
          fetched.sourceType === 'pdf'
            ? classifyMedicalRecordsRequestDocument({
                url: fetched.finalUrl,
                title: fetched.title,
                text: fetched.extractedText,
                links: fetched.parsed?.links || [],
                sourceUrl: item.sourceContext?.sourceUrl || '',
                sourceTitle: item.sourceContext?.sourceTitle || '',
                sourceText: item.sourceContext?.sourceText || '',
                sourceLinkText: item.sourceContext?.text || '',
                sourceLinkContext: item.sourceContext?.contextText || ''
              })
            : { accepted: true, basis: 'html' };
        const triageDecision = buildTriageDecision({
          fetched,
          documentClassification,
        });

        let storagePath = fetched.storagePath;
        if (fetched.sourceType === 'pdf' && triageDecision.decision === 'accepted') {
          const fallbackTitle = derivePdfTitleFallback(item.sourceContext);
          const fallbackText = derivePdfTextFallback(item.sourceContext);
          storagePath = await assignPdfStoragePath({
            currentStoragePath: fetched.storagePath,
            contentHash: fetched.contentHash,
            state: system.state,
            systemName: system.systemName,
            facilityName: item.facilityName,
            url: fetched.finalUrl,
            title: fetched.title || fallbackTitle,
            text: fetched.extractedText || fallbackText,
            headerText: fetched.parsed?.headerText || fallbackTitle || '',
            headerLines: fetched.parsed?.headerLines || []
          });
        }

        const sourcePageUrl =
          fetched.sourceType === 'html'
            ? fetched.finalUrl
            : item.sourceContext?.sourceUrl || null;
        const discoveredFromUrl = item.sourceContext?.sourceUrl || sourcePageUrl || null;
        const fetchArtifactId = randomUUID();
        const triageDecisionId = randomUUID();

        await withTransaction(async (client) => {
          await insertFetchArtifact(
            {
              id: fetchArtifactId,
              fetchStageRunId: fetchStageRun.id,
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
            },
            client,
          );

          await insertTriageDecision(
            {
              id: triageDecisionId,
              triageStageRunId: triageStageRun.id,
              fetchArtifactId,
              decision: triageDecision.decision,
              basis: triageDecision.basis,
              reasonCode: triageDecision.reasonCode,
              reasonDetail: triageDecision.reasonDetail,
              classifierName: triageDecision.classifierName,
              classifierVersion: triageDecision.classifierVersion,
              evidence: {
                source_context: item.sourceContext || null,
                source_page_url: sourcePageUrl,
                discovered_from_url: discoveredFromUrl,
                pdf_parse_status: fetched.parsed?.parseStatus || null,
                content_hash: fetched.contentHash,
                crawl_mode: item.crawlMode,
                depth: item.depth,
              },
            },
            client,
          );

          if (triageDecision.decision === 'accepted') {
            await insertSourceDocument(
              {
                hospitalSystemId: system.systemId,
                facilityId: item.facilityId,
                sourceUrl: fetched.finalUrl,
                sourcePageUrl,
                discoveredFromUrl,
                fetchArtifactId,
                triageDecisionId,
                sourceType: fetched.sourceType,
                title: fetched.title || derivePdfTitleFallback(item.sourceContext) || null,
                fetchedAt: fetched.fetchedAt,
                httpStatus: fetched.status,
                contentHash: fetched.contentHash,
                storagePath,
                extractedText: fetched.extractedText,
                parserVersion: fetched.parserVersion,
              },
              client,
            );
          }
        });

        if (triageDecision.decision !== 'accepted') {
          systemSkipped += 1;
          details.push({
            system: system.systemName,
            state: system.state,
            url: fetched.finalUrl,
            fetch_artifact_id: fetchArtifactId,
            triage_decision_id: triageDecisionId,
            skipped: triageDecision.reasonCode || 'triage_rejected',
            pdfParseStatus: fetched.parsed?.parseStatus || null,
          });
          continue;
        }

        extracted += 1;
        systemAccepted += 1;

        if (fetched.sourceType === 'html' && item.depth < maxDepth && item.crawlMode !== 'terminal') {
          const expansionMode = item.crawlMode === 'records_page' ? 'records_page' : 'general';
          const nextLinks = expandCandidateLinks({
            document: fetched.parsed,
            allowedDomain: system.canonicalDomain,
            mode: expansionMode,
          });

          for (const link of nextLinks) {
            const nextNormalized = normalizeForVisited(link.url);
            const existingQueuedItem = queue.find(
              (queuedItem) => normalizeForVisited(queuedItem.url) === nextNormalized
            );

            if (existingQueuedItem) {
              if (scoreSourceContext(link) > scoreSourceContext(existingQueuedItem.sourceContext)) {
                existingQueuedItem.sourceContext = link;
              }
              continue;
            }

            if (visited.has(nextNormalized)) continue;
            queue.push({
              url: link.url,
              depth: item.depth + 1,
              facilityId: item.facilityId,
              facilityName: item.facilityName,
              sourceContext: link,
              crawlMode: expansionMode === 'records_page' ? 'terminal' : 'general',
            });
          }
        }
      } catch (error) {
        failed += 1;
        systemFetchFailed += 1;
        details.push({
          system: system.systemName,
          state: system.state,
          url: item.url,
          error: error.message
        });
      }
    }

    await completePipelineStageRun({
      stageRunId: fetchStageRun.id,
      status: buildFetchStageStatus({
        fetchedDocuments: systemFetched,
        failedDocuments: systemFetchFailed,
      }),
      outputSummary: {
        fetched_documents: systemFetched,
        failed_documents: systemFetchFailed,
        accepted_documents: systemAccepted,
        skipped_documents: systemSkipped,
      },
      errorSummary:
        systemFetchFailed > 0
          ? {
              message: `${systemFetchFailed} fetches failed during crawl.`,
            }
          : null,
    });

    await completePipelineStageRun({
      stageRunId: triageStageRun.id,
      status: 'ok',
      outputSummary: {
        fetched_documents: systemFetched,
        accepted_documents: systemAccepted,
        skipped_documents: systemSkipped,
      },
    });
  }

  return {
    status: 'ok',
    systems: perSystem.size,
    crawled,
    extracted,
    failed,
    details
  };
}
