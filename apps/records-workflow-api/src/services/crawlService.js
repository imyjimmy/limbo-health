import fs from 'node:fs/promises';
import { fetchAndParseDocument } from '../crawler/fetcher.js';
import { expandCandidateLinks, isOfficialDomain } from '../crawler/linkExpander.js';
import { extractWorkflowBundle } from '../extractors/workflowExtractor.js';
import { config } from '../config.js';
import { listActiveSeeds, saveExtractionResult } from '../repositories/workflowRepository.js';
import { assignPdfStoragePath } from '../utils/pdfStorage.js';
import { isMedicalRecordsRequestDocument } from '../utils/urls.js';

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

export async function runCrawl({
  systemName = null,
  state = config.crawlState,
  maxDepth = config.crawl.maxDepth
} = {}) {
  const seeds = await listActiveSeeds({ systemName, state });
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
      facilityName: seed.facility_name || null
    }));

    while (queue.length > 0) {
      const item = queue.shift();
      const normalized = normalizeForVisited(item.url);
      if (visited.has(normalized)) continue;
      visited.add(normalized);

      try {
        const fetched = await fetchAndParseDocument({ url: item.url, state: system.state });
        crawled += 1;

        if (
          fetched.sourceType === 'pdf' &&
          !isMedicalRecordsRequestDocument({
            url: fetched.finalUrl,
            title: fetched.title,
            text: fetched.extractedText,
            links: fetched.parsed?.links || []
          })
        ) {
          await removeIfPresent(fetched.storagePath);
          details.push({
            system: system.systemName,
            state: system.state,
            url: fetched.finalUrl,
            skipped: 'non_medical_records_pdf'
          });
          continue;
        }

        let storagePath = fetched.storagePath;
        if (fetched.sourceType === 'pdf') {
          storagePath = await assignPdfStoragePath({
            currentStoragePath: fetched.storagePath,
            contentHash: fetched.contentHash,
            state: system.state,
            systemName: system.systemName,
            facilityName: item.facilityName,
            url: fetched.finalUrl,
            title: fetched.title,
            text: fetched.extractedText,
            headerText: fetched.parsed?.headerText || '',
            headerLines: fetched.parsed?.headerLines || []
          });
        }

        const bundle = extractWorkflowBundle(fetched.parsed, {
          isOfficialDomain: isOfficialDomain(fetched.finalUrl, system.canonicalDomain)
        });

        const status = bundle.workflows.length > 0 ? 'success' : 'partial';

        await saveExtractionResult({
          sourceDocument: {
            hospitalSystemId: system.systemId,
            facilityId: item.facilityId,
            sourceUrl: fetched.finalUrl,
            sourceType: fetched.sourceType,
            title: fetched.title,
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
              httpStatus: fetched.status
            }
          }
        });

        extracted += 1;

        if (fetched.sourceType === 'html' && item.depth < maxDepth) {
          const nextLinks = expandCandidateLinks({
            document: fetched.parsed,
            allowedDomain: system.canonicalDomain
          });

          for (const link of nextLinks) {
            const nextNormalized = normalizeForVisited(link);
            if (visited.has(nextNormalized)) continue;
            queue.push({
              url: link,
              depth: item.depth + 1,
              facilityId: item.facilityId,
              facilityName: item.facilityName
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
