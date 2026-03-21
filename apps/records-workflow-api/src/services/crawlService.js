import fs from 'node:fs/promises';
import { fetchAndParseDocument } from '../crawler/fetcher.js';
import { expandCandidateLinks, isOfficialDomain } from '../crawler/linkExpander.js';
import { extractPdfFormUnderstanding } from '../extractors/pdfFormUnderstandingExtractor.js';
import { extractWorkflowBundle } from '../extractors/workflowExtractor.js';
import { config } from '../config.js';
import {
  insertExtractionRun,
  listActiveSeeds,
  saveExtractionResult,
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

async function removeIfPresent(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
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

export async function runCrawl({
  systemName = null,
  systemId = null,
  facilityId = null,
  seedUrl = null,
  hospitalSystemIds = [],
  state = config.crawlState,
  maxDepth = config.crawl.maxDepth
} = {}) {
  const seeds = await listActiveSeeds({
    systemName,
    systemId,
    facilityId,
    seedUrl,
    hospitalSystemIds,
    state
  });
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
    const visited = new Set();
    const queue = system.seeds.map((seed) => ({
      url: seed.url,
      depth: 0,
      facilityId: seed.facility_id || null,
      facilityName: seed.facility_name || null,
      sourceContext: null
    }));

    while (queue.length > 0) {
      const item = queue.shift();
      const normalized = normalizeForVisited(item.url);
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      try {
        const fetched = await fetchAndParseDocument({ url: item.url, state: system.state });
        crawled += 1;
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

        if (
          fetched.sourceType === 'pdf' &&
          !documentClassification.accepted
        ) {
          await removeIfPresent(fetched.storagePath);
          details.push({
            system: system.systemName,
            state: system.state,
            url: fetched.finalUrl,
            skipped: 'non_medical_records_pdf',
            pdfParseStatus: fetched.parsed?.parseStatus || null
          });
          continue;
        }

        let storagePath = fetched.storagePath;
        if (fetched.sourceType === 'pdf') {
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

        const bundle = extractWorkflowBundle(fetched.parsed, {
          isOfficialDomain: isOfficialDomain(fetched.finalUrl, system.canonicalDomain)
        });

        const status = bundle.workflows.length > 0 ? 'success' : 'partial';

        const sourceDocumentId = await saveExtractionResult({
          sourceDocument: {
            hospitalSystemId: system.systemId,
            facilityId: item.facilityId,
            sourceUrl: fetched.finalUrl,
            sourceType: fetched.sourceType,
            title: fetched.title || derivePdfTitleFallback(item.sourceContext) || null,
            fetchedAt: fetched.fetchedAt,
            httpStatus: fetched.status,
            contentHash: fetched.contentHash,
            storagePath,
            extractedText: fetched.extractedText,
            parserVersion: fetched.parserVersion
          },
          status,
          portal: bundle.portal,
          workflows: bundle.workflows,
          structuredOutput: {
            portal: bundle.portal,
            workflows: bundle.workflows,
            evidenceSnippets: bundle.evidenceSnippets,
            metadata: {
              sourceUrl: fetched.finalUrl,
              sourceType: fetched.sourceType,
              httpStatus: fetched.status,
              documentClassificationBasis: documentClassification.basis,
              pdfParseStatus: fetched.parsed?.parseStatus || null,
              pdfParseError: fetched.parsed?.parseError || null,
              pdfRepairAttempted: Boolean(fetched.parsed?.repairAttempted),
              pdfRepaired: Boolean(fetched.parsed?.repaired),
              sourceContext: item.sourceContext || null
            }
          }
        });

        if (fetched.sourceType === 'pdf') {
          const formUnderstandingExtraction = await extractPdfFormUnderstanding({
            parsedPdf: fetched.parsed,
            hospitalSystemName: system.systemName,
            facilityName: item.facilityName,
            formName: fetched.title || derivePdfTitleFallback(item.sourceContext) || 'Authorization Form',
            sourceUrl: fetched.finalUrl,
          });

          await insertExtractionRun({
            sourceDocumentId,
            extractorName: formUnderstandingExtraction.extractorName,
            extractorVersion: formUnderstandingExtraction.extractorVersion,
            status: formUnderstandingExtraction.status,
            structuredOutput: formUnderstandingExtraction.structuredOutput,
          });
        }

        extracted += 1;

        if (fetched.sourceType === 'html' && item.depth < maxDepth) {
          const nextLinks = expandCandidateLinks({
            document: fetched.parsed,
            allowedDomain: system.canonicalDomain
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
              sourceContext: link
            });
          }
        }
      } catch (error) {
        failed += 1;
        details.push({
          system: system.systemName,
          state: system.state,
          url: item.url,
          error: error.message
        });
      }
    }
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
