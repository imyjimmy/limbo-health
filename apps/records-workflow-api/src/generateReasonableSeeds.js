import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import * as cheerio from 'cheerio';
import { closePool } from './db.js';
import { resolveFromServiceRoot } from './config.js';
import { searchWeb } from './services/generatedSeedService.js';
import { buildStateSeedRelativePath } from './services/seedService.js';
import { getCliOptionValue } from './utils/cliArgs.js';
import { getStateName, listRolloutStateCodes, normalizeStateCode } from './utils/states.js';

const BLOCKED_HOST_PATTERNS = [
  /facebook\.com$/i,
  /instagram\.com$/i,
  /linkedin\.com$/i,
  /youtube\.com$/i,
  /x\.com$/i,
  /twitter\.com$/i,
  /wikipedia\.org$/i,
  /healthgrades\.com$/i,
  /webmd\.com$/i,
  /vitals\.com$/i,
  /healthcare4ppl\.com$/i,
  /medicalrecords\.com$/i,
  /mapquest\.com$/i,
  /officialmediaguide\.com$/i,
  /chamberofcommerce\.com$/i,
  /hospitalcaredata\.com$/i,
  /medicarelist\.com$/i,
  /usnews\.com$/i,
  /association-insight\.com$/i,
  /dnb\.com$/i,
  /southfloridahospitalnews\.com$/i,
  /floridahospitalassociation-digital\.com$/i,
  /cbsnews\.com$/i,
  /journalrecord\.com$/i,
  /newsline\.com$/i,
  /public\.org$/i,
  /mirror\.org$/i,
  /herald\.com$/i,
  /bizjournals\.com$/i,
  /beckershospitalreview\.com$/i,
  /vimeo\.com$/i,
  /tiktok\.com$/i,
  /indeed\.com$/i,
  /powerbi\.com$/i,
  /zoom\.us$/i,
  /goo\.gl$/i,
  /legalclarity\.org$/i,
  /recordinglaw\.com$/i,
  /justia\.com$/i,
  /britannica\.com$/i,
  /worldatlas\.com$/i,
  /yahoo\.com$/i,
  /stack(over)?flow\.com$/i,
  /validate\.perfdrive\.com$/i,
  /myflorida\.com$/i,
  /eforms\.com$/i
];

const HOSPITAL_NAME_PATTERN =
  /\b(?:hospital|health|healthcare|medical|clinic|memorial|regional|center|centre|rehabilitation|behavioral|childrens|children's|care|system|network|campus|cancer)\b/i;
const WORKFLOW_PATTERN =
  /\b(?:medical[-\s]?records?|records?[-\s]request|request[-\s]medical[-\s]records?|release[-\s]of[-\s]information|health[-\s]information|roi|authorization|patient[-\s]?portal|mychart)\b/i;
const NON_PROVIDER_NAME_PATTERN =
  /\b(?:hospital association|healthcare association|hospital council|member hospitals?|member directory|hospital directory|department of health|public health|health information management association|medical staff services|society of|conference|annual report|report shows|dashboard|task force|marketplace|scholarship|resource center|workforce resource|careers?\b|news\b|article\b|price transparency|quality measures|medical board|privacy manual|hipaa form|code regs?|regulations?)\b/i;
const ARTICLE_HEADLINE_PATTERN =
  /\b(?:announce(?:s|d)?|launch(?:es|ed)?|earn(?:s|ed)?|awarded?|receiv(?:e|es|ed)|fear|shows?|showed|report(?:ed)?|retired|appointed|attended|partner(?:s|ed)?|hosts?|opens?|strengthens?|introducing|performs?|made up of family|to end)\b/i;
const ALLOWED_PROVIDER_NAME_PATTERN =
  /\b(?:health alliance|rehabilitation institute|behavioral health hospital|children'?s health|university health|health system|health network)\b/i;
const GENERIC_WORKFLOW_TITLE_PATTERN =
  /^(?:medical records?|request medical records?|records? requests?|release of information|health information|patient portal|mychart|obtaining medical records|access your medical record|medical record availability|medical records access|medical record information|request my medical records|request your medical records|for patients|patients? (?:&|and) visitors?)$/i;
const MAX_FETCHED_CANDIDATES = 12;
const MAX_SEEDS_PER_STATE = 12;

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCanonicalDomain(value) {
  if (!value) return null;

  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
}

function isBlockedHost(hostname) {
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function looksHospitalLike(value) {
  return HOSPITAL_NAME_PATTERN.test(normalizeWhitespace(value));
}

function looksLikeWorkflowSurface(value) {
  return WORKFLOW_PATTERN.test(normalizeWhitespace(value));
}

function cleanSystemName(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/\s+\|\s+.+$/g, '')
      .replace(/\s+[-–—]\s+.+$/g, '')
      .replace(/\bvisit website\b/gi, '')
      .replace(/\bwebsite\b/gi, '')
  );
}

function isPlausibleSystemName(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized)) return false;
  if (normalized.length > 140) return false;
  if (/\bthis article\b/i.test(normalized)) return false;
  return true;
}

function looksLikeArticleHeadline(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 10 && ARTICLE_HEADLINE_PATTERN.test(normalized)) return true;
  if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(normalized)) {
    return true;
  }
  if (/\b20\d{2}\b/.test(normalized) && wordCount >= 8) return true;

  return false;
}

function isSeedableProviderName(value) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) return false;
  if (!isPlausibleSystemName(normalized)) return false;
  if (looksLikeArticleHeadline(normalized)) return false;
  if (isGenericWorkflowTitle(normalized)) return false;
  if (NON_PROVIDER_NAME_PATTERN.test(normalized) && !ALLOWED_PROVIDER_NAME_PATTERN.test(normalized)) {
    return false;
  }
  if (
    looksLikeWorkflowSurface(normalized) &&
    !/\b(?:hospital|medical center|health system|healthcare|clinic|memorial|regional|rehabilitation|behavioral|children'?s|campus|cancer|university health|health network|health alliance)\b/i.test(
      normalized
    )
  ) {
    return false;
  }

  return looksHospitalLike(normalized) || ALLOWED_PROVIDER_NAME_PATTERN.test(normalized);
}

function parseStateListOption(rawValue) {
  if (!rawValue) return null;

  return rawValue
    .split(',')
    .map((value) => normalizeStateCode(value))
    .filter(Boolean);
}

function parsePositiveIntegerOption(rawValue, fallback) {
  if (!rawValue) return fallback;

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function mapWithConcurrency(items, limit, iteratee) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker)).then(() => results);
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildSearchQueries(stateName) {
  const quoted = stateName.includes(' ') ? `"${stateName}"` : stateName;

  return [
    `${quoted} hospital medical records`,
    `${quoted} medical records hospital`,
    `${quoted} request medical records hospital`,
    `${quoted} hospital release of information`
  ];
}

function scoreWorkflowResult(result) {
  const hostname = extractCanonicalDomain(result.url);
  if (!hostname || isBlockedHost(hostname)) {
    return -Infinity;
  }

  const title = normalizeWhitespace(result.title);
  const snippet = normalizeWhitespace(result.snippet);
  const url = normalizeWhitespace(result.url);
  const text = `${title} ${snippet} ${url}`;

  if (!looksHospitalLike(text)) return -Infinity;
  if (!looksLikeWorkflowSurface(text)) return -Infinity;
  if (looksLikeArticleHeadline(title)) return -Infinity;
  if (NON_PROVIDER_NAME_PATTERN.test(text) && !ALLOWED_PROVIDER_NAME_PATTERN.test(text)) {
    return -Infinity;
  }

  let score = 0;
  if (looksLikeWorkflowSurface(title)) score += 25;
  if (looksLikeWorkflowSurface(url)) score += 18;
  if (looksHospitalLike(title)) score += 15;
  if (/patient[-\s]?portal|mychart/i.test(text)) score += 8;
  if (/\.org$/i.test(hostname) || /\.edu$/i.test(hostname)) score += 4;
  if (/for-patients|patients|visitors/i.test(url)) score += 6;
  if (/medical[-\s]?records|release[-\s]?of[-\s]?information|authorization/i.test(url)) score += 10;

  return score;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const finalUrl = response.url || url;
  const contentType = response.headers.get('content-type') || '';
  const html = /html/i.test(contentType) ? await response.text() : '';

  return {
    finalUrl,
    html
  };
}

function normalizeCandidateLink(baseUrl, href) {
  if (!href) return null;

  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function splitTitleParts(value) {
  return normalizeWhitespace(value)
    .split(/\s+[|:·]\s+|\s+[-–—]\s+/)
    .map((part) => cleanSystemName(part))
    .filter(Boolean);
}

function isGenericWorkflowTitle(value) {
  return GENERIC_WORKFLOW_TITLE_PATTERN.test(normalizeWhitespace(value));
}

function titleCaseDomain(hostname) {
  return String(hostname || '')
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|edu|gov|health|care|hospital|us)$/i, '')
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function deriveSystemName({ result, pageTitle = '', heading = '', hostname = '' }) {
  const candidates = [
    ...splitTitleParts(pageTitle),
    ...splitTitleParts(heading),
    ...splitTitleParts(result?.title || '')
  ];

  for (const candidate of candidates) {
    if (isGenericWorkflowTitle(candidate)) continue;
    if (!isSeedableProviderName(candidate)) continue;
    if (looksLikeWorkflowSurface(candidate) && !looksHospitalLike(candidate)) continue;
    return candidate;
  }

  const fallback = titleCaseDomain(hostname);
  return isSeedableProviderName(fallback) ? fallback : null;
}

function extractSeedLinksFromHtml({ html, pageUrl, canonicalDomain }) {
  const $ = cheerio.load(html);
  const evidenceUrls = new Set([pageUrl]);
  const seedLinks = new Set([pageUrl]);
  const title = normalizeWhitespace($('title').first().text());
  const heading = normalizeWhitespace($('h1').first().text() || $('h2').first().text());

  $('a[href]').each((_, element) => {
    const href = normalizeCandidateLink(pageUrl, $(element).attr('href'));
    const text = normalizeWhitespace($(element).text() || $(element).attr('title') || '');
    const hostname = extractCanonicalDomain(href);
    const label = normalizeWhitespace(`${text} ${href || ''}`);

    if (!href || !hostname) return;
    if (isBlockedHost(hostname)) return;
    if (hostname !== canonicalDomain && !/portal|mychart/i.test(label)) return;
    if (!looksLikeWorkflowSurface(label)) return;

    evidenceUrls.add(href);
    seedLinks.add(href);
  });

  return {
    title,
    heading,
    seedUrls: Array.from(seedLinks),
    evidenceUrls: Array.from(evidenceUrls)
  };
}

function buildSeedEntry({ state, systemName, domain, seedUrls }) {
  if (!domain || isBlockedHost(domain)) return null;
  if (!isSeedableProviderName(systemName)) return null;

  const normalizedSeedUrls = Array.from(new Set((seedUrls || []).filter(Boolean)));
  if (normalizedSeedUrls.length === 0) return null;

  return {
    system_name: cleanSystemName(systemName),
    state,
    domain,
    seed_urls: normalizedSeedUrls
  };
}

function mergeSeedEntries(entries = []) {
  const grouped = new Map();

  for (const entry of entries) {
    if (!entry?.system_name || !entry?.domain) continue;

    const key = entry.domain;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        system_name: entry.system_name,
        state: entry.state,
        domain: entry.domain,
        seed_urls: [...entry.seed_urls]
      });
      continue;
    }

    existing.seed_urls = Array.from(new Set([...existing.seed_urls, ...entry.seed_urls]));
    if (entry.system_name.length > existing.system_name.length) {
      existing.system_name = entry.system_name;
    }
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      ...entry,
      seed_urls: entry.seed_urls.slice(0, 6)
    }))
    .sort((left, right) => left.system_name.localeCompare(right.system_name))
    .slice(0, MAX_SEEDS_PER_STATE);
}

async function discoverStateSeedEntries(state) {
  const stateName = getStateName(state);
  const queries = buildSearchQueries(stateName);
  const results = [];

  for (const query of queries) {
    const searchResults = await searchWeb(query);
    for (const result of searchResults) {
      const score = scoreWorkflowResult(result);
      if (!Number.isFinite(score)) continue;
      results.push({ ...result, score });
    }
  }

  const deduped = new Map();
  for (const result of results.sort((left, right) => right.score - left.score)) {
    const hostname = extractCanonicalDomain(result.url);
    if (!hostname || deduped.has(result.url)) continue;
    deduped.set(result.url, result);
  }

  const entries = [];
  const sourcePages = [];

  for (const candidate of Array.from(deduped.values()).slice(0, MAX_FETCHED_CANDIDATES)) {
    const hostname = extractCanonicalDomain(candidate.url);
    if (!hostname) continue;

    try {
      const fetched = await fetchHtml(candidate.url);
      const finalDomain = extractCanonicalDomain(fetched.finalUrl) || hostname;
      const discovery = extractSeedLinksFromHtml({
        html: fetched.html,
        pageUrl: fetched.finalUrl,
        canonicalDomain: finalDomain
      });
      const systemName = deriveSystemName({
        result: candidate,
        pageTitle: discovery.title,
        heading: discovery.heading,
        hostname: finalDomain
      });
      const entry = buildSeedEntry({
        state,
        systemName,
        domain: finalDomain,
        seedUrls: discovery.seedUrls
      });

      sourcePages.push({
        title: candidate.title,
        url: candidate.url,
        final_url: fetched.finalUrl,
        extracted_seed_count: entry ? entry.seed_urls.length : 0
      });

      if (entry) {
        entries.push(entry);
      }
    } catch (error) {
      sourcePages.push({
        title: candidate.title,
        url: candidate.url,
        error: error.message
      });
    }
  }

  return {
    entries: mergeSeedEntries(entries),
    sourcePages
  };
}

async function generateStateSeedFile(state, { overwrite = false } = {}) {
  const relativePath = buildStateSeedRelativePath(state);
  const outputPath = resolveFromServiceRoot(relativePath, relativePath);

  if (!overwrite && (await fileExists(outputPath))) {
    return {
      state,
      output_path: outputPath,
      skipped: true,
      reason: 'already_exists',
      seed_count: null,
      source_pages: []
    };
  }

  const { entries, sourcePages } = await discoverStateSeedEntries(state);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  return {
    state,
    output_path: outputPath,
    skipped: false,
    seed_count: entries.length,
    source_pages: sourcePages
  };
}

async function main() {
  const requestedStates = parseStateListOption(getCliOptionValue(process.argv.slice(2), 'states'));
  const overwrite = process.argv.includes('--overwrite');
  const concurrency = parsePositiveIntegerOption(
    getCliOptionValue(process.argv.slice(2), 'concurrency'),
    4
  );
  const targetStates = requestedStates || listRolloutStateCodes();
  const summaries = await mapWithConcurrency(targetStates, concurrency, async (state, index) => {
    console.error(`[generateReasonableSeeds] ${index + 1}/${targetStates.length} ${state}`);
    return generateStateSeedFile(state, { overwrite });
  });

  console.log(JSON.stringify({ overwrite, concurrency, states: targetStates, summaries }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
