import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchAndParseDocument } from '../crawler/fetcher.js';
import { expandCandidateLinks, isOfficialDomain } from '../crawler/linkExpander.js';
import { extractWorkflowBundle } from '../extractors/workflowExtractor.js';
import { config } from '../config.js';
import { listActiveSeeds, saveExtractionResult } from '../repositories/workflowRepository.js';
import { sha256 } from '../utils/hash.js';
import { buildMedicalRecordsPdfFilenameStems } from '../utils/pdfNaming.js';
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileMatchesHash(filePath, expectedHash) {
  if (!(await fileExists(filePath))) return false;
  const buffer = await fs.readFile(filePath);
  return sha256(buffer) === expectedHash;
}

async function finalizePdfStoragePath({
  tempStoragePath,
  contentHash,
  systemName,
  facilityName,
  url,
  title,
  text
}) {
  const candidateStems = buildMedicalRecordsPdfFilenameStems({
    systemName,
    facilityName,
    url,
    title,
    text
  });

  for (const stem of candidateStems) {
    const candidatePath = path.join(config.rawStorageDir, `${stem}.pdf`);

    if (candidatePath === tempStoragePath) {
      return candidatePath;
    }

    if (!(await fileExists(candidatePath))) {
      await fs.rename(tempStoragePath, candidatePath);
      return candidatePath;
    }

    if (await fileMatchesHash(candidatePath, contentHash)) {
      await removeIfPresent(tempStoragePath);
      return candidatePath;
    }
  }

  return tempStoragePath;
}

export async function runCrawl({ systemName = null, maxDepth = config.crawl.maxDepth } = {}) {
  const seeds = await listActiveSeeds({ systemName });
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
        const fetched = await fetchAndParseDocument({ url: item.url });
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
            url: fetched.finalUrl,
            skipped: 'non_medical_records_pdf'
          });
          continue;
        }

        let storagePath = fetched.storagePath;
        if (fetched.sourceType === 'pdf') {
          storagePath = await finalizePdfStoragePath({
            tempStoragePath: fetched.storagePath,
            contentHash: fetched.contentHash,
            systemName: system.systemName,
            facilityName: item.facilityName,
            url: fetched.finalUrl,
            title: fetched.title,
            text: fetched.extractedText
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
