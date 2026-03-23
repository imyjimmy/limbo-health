import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { resolveFromServiceRoot } from '../config.js';
import {
  buildOfficialHospitalIdentities,
  normalizeHospitalName,
  scoreHospitalNameSimilarity
} from '../utils/hospitalRoster.js';
import { getStateName, normalizeStateCode } from '../utils/states.js';

export const DEFAULT_GENERATED_SEED_DIR = 'storage/generated-seeds';
export const DEFAULT_GENERATED_SEED_CONCURRENCY = 10;
const DEFAULT_FETCH_TIMEOUT_MS = 5000;
const MAX_OFFICIAL_CANDIDATE_FETCHES = 4;

const BLOCKED_RESULT_HOST_PATTERNS = [
  /cms\.gov$/i,
  /medicare\.gov$/i,
  /wikipedia\.org$/i,
  /facebook\.com$/i,
  /instagram\.com$/i,
  /youtube\.com$/i,
  /healthgrades\.com$/i,
  /webmd\.com$/i,
  /vitals\.com$/i,
  /countyoffice\.org$/i,
  /addisoncounty\.com$/i,
  /carelistings\.com$/i,
  /healthcare4ppl\.com$/i,
  /npino\.com$/i,
  /mapquest\.com$/i,
  /npiprofile\.com$/i,
  /ahd\.com$/i,
  /swellbox\.com$/i,
  /usnews\.com$/i,
  /plasmatx\.org$/i,
  /medicalrecords\.com$/i,
  /loc8nearme\.com$/i,
  /hospitalsandclinics\.net$/i,
  /medicarelist\.com$/i,
  /txcountyoffices\.org$/i,
  /search\.yahoo\.com$/i,
  /video\.search\.yahoo\.com$/i,
  /hospitalcaredata\.com$/i,
  /chamberofcommerce\.com$/i
];

const KNOWN_PORTAL_HOST_PATTERNS = [
  /mychart/i,
  /followmyhealth/i,
  /healow/i,
  /myhealthone/i,
  /athenahealth/i,
  /nextmd/i,
  /eclinical/i,
  /ecwcloud/i,
  /meditech/i,
  /oracle/i,
  /myadventisthealth/i,
  /iqhealth/i,
  /mycarecorner/i
];

const OFFICIAL_PAGE_KEYWORD_PATTERN =
  /\b(?:hospital|medical|health|clinic|campus|network|patient|physician|services)\b/i;

const WORKFLOW_PATH_PATTERN =
  /\b(?:medical[-\s]?records?|records[-\s]?request|request[-\s]?records|health[-\s]?information|release[-\s]?of[-\s]?information|authorization|roi|patient[-\s]?portal|mychart|portal)\b/i;
const GENERIC_HOSPITAL_TOKENS = new Set([
  'and',
  'campus',
  'care',
  'center',
  'centers',
  'childrens',
  'clinic',
  'community',
  'health',
  'healthcare',
  'hospital',
  'hospitals',
  'medical',
  'memorial',
  'mount',
  'network',
  'regional',
  'saint',
  'system',
  'university'
]);

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildSearchSafeHospitalName(value) {
  return normalizeWhitespace(value)
    .replace(/[’']/g, '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/[^\p{L}\p{N}\s&]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

function decodeDuckDuckGoResultUrl(value) {
  if (!value) return null;

  try {
    const resolvedValue = value.startsWith('//') ? `https:${value}` : value;
    const parsed = new URL(resolvedValue);
    if (!/duckduckgo\.com$/i.test(parsed.hostname)) {
      return resolvedValue;
    }

    const redirected = parsed.searchParams.get('uddg');
    return redirected ? decodeURIComponent(redirected) : resolvedValue;
  } catch {
    return value;
  }
}

function extractCanonicalDomain(value) {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return String(value || '').replace(/^www\./i, '').toLowerCase() || null;
  }
}

function extractDomainTokens(hostname) {
  const withoutTld = String(hostname || '')
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.(com|org|net|edu|gov|health|care|hospital|io|co|us)$/i, '')
    .replace(/[^a-z0-9]+/g, ' ');

  return normalizeHospitalName(withoutTld)
    .split(' ')
    .filter(Boolean);
}

function isBlockedSearchHost(hostname) {
  return BLOCKED_RESULT_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isKnownPortalHost(hostname) {
  return KNOWN_PORTAL_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

function isLikelyWorkflowHref(value) {
  return WORKFLOW_PATH_PATTERN.test(String(value || ''));
}

function tokenizeIdentity(value) {
  return normalizeHospitalName(value)
    .split(' ')
    .filter(Boolean);
}

function specificHospitalTokens(value) {
  const tokens = tokenizeIdentity(value).filter((token) => !GENERIC_HOSPITAL_TOKENS.has(token));
  return tokens.length > 0 ? tokens : tokenizeIdentity(value);
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

function dedupeSearchResults(results = []) {
  const deduped = new Map();

  for (const result of results) {
    const key = result?.url || `${result?.title || ''}::${result?.snippet || ''}`;
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, result);
      continue;
    }

    const currentSignal = (result?.snippet || '').length + (result?.title || '').length;
    const existingSignal = (existing?.snippet || '').length + (existing?.title || '').length;
    if (currentSignal > existingSignal) {
      deduped.set(key, result);
    }
  }

  return Array.from(deduped.values());
}

function scoreSearchResultAsOfficial(officialHospital, result) {
  if (!result?.url) return -Infinity;

  const hostname = extractCanonicalDomain(result.url);
  if (!hostname || isBlockedSearchHost(hostname)) {
    return -Infinity;
  }

  const normalizedTitle = normalizeHospitalName(result.title);
  const normalizedSnippet = normalizeHospitalName(result.snippet);
  const urlText = normalizeHospitalName(result.url);
  const hospitalTokens = specificHospitalTokens(officialHospital.facility_name);
  const cityToken = officialHospital.city ? normalizeHospitalName(officialHospital.city) : '';
  const stateToken = officialHospital.state ? normalizeHospitalName(officialHospital.state_name || officialHospital.state) : '';
  const exactHospitalName = normalizeHospitalName(officialHospital.facility_name);
  const combinedText = `${normalizedTitle} ${normalizedSnippet} ${urlText}`;
  const exactMention = combinedText.includes(exactHospitalName);
  const hasMedicalContext =
    OFFICIAL_PAGE_KEYWORD_PATTERN.test(result.title) ||
    OFFICIAL_PAGE_KEYWORD_PATTERN.test(result.snippet) ||
    OFFICIAL_PAGE_KEYWORD_PATTERN.test(result.url) ||
    isKnownPortalHost(hostname) ||
    isLikelyWorkflowHref(result.title) ||
    isLikelyWorkflowHref(result.snippet) ||
    isLikelyWorkflowHref(result.url);

  let score = 0;
  let hospitalTokenMatches = 0;

  for (const token of hospitalTokens) {
    if (normalizedTitle.includes(token)) {
      score += 5;
      hospitalTokenMatches += 1;
    }
    if (normalizedSnippet.includes(token)) {
      score += 3;
      hospitalTokenMatches += 1;
    }
    if (urlText.includes(token)) {
      score += 2;
      hospitalTokenMatches += 1;
    }
  }

  if (hospitalTokenMatches === 0) {
    return -Infinity;
  }

  if (!exactMention && !hasMedicalContext) {
    return -Infinity;
  }

  if (exactMention) {
    score += 18;
  }

  if (normalizedTitle.includes(exactHospitalName)) {
    score += 8;
  }

  if (cityToken && (normalizedTitle.includes(cityToken) || normalizedSnippet.includes(cityToken))) {
    score += 4;
  }

  if (stateToken && normalizedSnippet.includes(stateToken)) {
    score += 1;
  }

  if (/hospital|medical|health|clinic|center|network|system|care/i.test(result.title)) {
    score += 4;
  }

  if (isLikelyWorkflowHref(result.title) || isLikelyWorkflowHref(result.snippet) || isLikelyWorkflowHref(result.url)) {
    score += 8;
  }

  if (/\.pdf(?:$|\?)/i.test(result.url)) {
    score -= 3;
  }

  return score;
}

export function classifyGeneratedSeedConfidence({
  officialUrl = null,
  workflowSeedUrls = [],
  portalSeedUrls = [],
  discoveredFacilities = 1
} = {}) {
  if (officialUrl && workflowSeedUrls.length > 0 && discoveredFacilities >= 1) {
    return 'high';
  }

  if (officialUrl && (portalSeedUrls.length > 0 || workflowSeedUrls.length > 0)) {
    return 'medium';
  }

  return 'low';
}

function confidenceRank(value) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

function minConfidence(values) {
  const ordered = [...values].sort((left, right) => confidenceRank(left) - confidenceRank(right));
  return ordered[0] || 'low';
}

function inferBrandName({ title, officialHospitalName, canonicalDomain }) {
  const titleParts = String(title || '')
    .split(/\s+[|\-–:]\s+/)
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  const preferred = titleParts.find((part) => /\b(?:health|hospital|medical|clinic|network|system|care)\b/i.test(part));
  if (preferred) {
    return preferred;
  }

  if (officialHospitalName) {
    return officialHospitalName;
  }

  return canonicalDomain;
}

export function buildGeneratedSeedFilePath(state, baseDir = DEFAULT_GENERATED_SEED_DIR) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('A valid state code is required for generated seed files.');
  }

  return resolveFromServiceRoot(`${baseDir}/${normalizedState.toLowerCase()}-systems.generated.json`, `${baseDir}/${normalizedState.toLowerCase()}-systems.generated.json`);
}

export async function searchDuckDuckGo(query, fetchImpl = fetch) {
  const response = await fetchWithTimeout(fetchImpl, `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Search request failed for "${query}" with status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const results = [];

  $('.result').each((_, element) => {
    const link = $(element).find('.result__title a').first();
    const rawUrl = link.attr('href');
    const decodedUrl = decodeDuckDuckGoResultUrl(rawUrl);

    if (!decodedUrl) {
      return;
    }

    results.push({
      title: normalizeWhitespace(link.text()),
      url: decodedUrl,
      snippet: normalizeWhitespace($(element).find('.result__snippet').first().text())
    });
  });

  return results;
}

function decodeBingResultUrl(value) {
  if (!value) return null;

  try {
    const parsed = new URL(value, 'https://www.bing.com');
    if (!/bing\.com$/i.test(parsed.hostname)) {
      return parsed.toString();
    }

    const encoded = parsed.searchParams.get('u');
    if (!encoded) {
      return parsed.toString();
    }

    const trimmed = encoded.startsWith('a1') ? encoded.slice(2) : encoded;
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return decoded || parsed.toString();
  } catch {
    return value;
  }
}

function decodeYahooResultUrl(value) {
  if (!value) return null;

  try {
    const parsed = new URL(value, 'https://search.yahoo.com');
    if (!/yahoo\.com$/i.test(parsed.hostname)) {
      return parsed.toString();
    }

    const match = parsed.toString().match(/\/RU=([^/]+)\/RK=/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }

    return parsed.toString();
  } catch {
    return value;
  }
}

export async function searchBing(query, fetchImpl = fetch) {
  const response = await fetchWithTimeout(fetchImpl, `https://www.bing.com/search?q=${encodeURIComponent(query)}`, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Bing search request failed for "${query}" with status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const results = [];

  $('li.b_algo').each((_, element) => {
    const link = $(element).find('h2 a').first();
    const decodedUrl = decodeBingResultUrl(link.attr('href'));
    if (!decodedUrl) {
      return;
    }

    results.push({
      title: normalizeWhitespace(link.text()),
      url: decodedUrl,
      snippet: normalizeWhitespace($(element).find('.b_caption p').first().text())
    });
  });

  return results;
}

export async function searchYahoo(query, fetchImpl = fetch) {
  const response = await fetchWithTimeout(fetchImpl, `https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo search request failed for "${query}" with status ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const results = [];

  $('h3 a').each((_, element) => {
    const decodedUrl = decodeYahooResultUrl($(element).attr('href'));
    if (!decodedUrl) {
      return;
    }

    const card = $(element).closest('li, div');
    const snippet = normalizeWhitespace(card.find('p, .compText, .lh-16').first().text());

    results.push({
      title: normalizeWhitespace($(element).text()),
      url: decodedUrl,
      snippet
    });
  });

  return dedupeSearchResults(results);
}

export async function searchWeb(query, fetchImpl = fetch) {
  const combinedResults = [];

  try {
    combinedResults.push(...(await searchDuckDuckGo(query, fetchImpl)));
  } catch {
    // continue to fallback sources below
  }

  if (combinedResults.length < 5) {
    try {
      combinedResults.push(...(await searchYahoo(query, fetchImpl)));
    } catch {
      // continue to fallback sources below
    }
  }

  if (combinedResults.length < 5) {
    try {
      combinedResults.push(...(await searchBing(query, fetchImpl)));
    } catch {
      // return what we have below
    }
  }

  return dedupeSearchResults(combinedResults);
}

async function fetchHtmlPage(url, fetchImpl = fetch) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow'
  });

  const contentType = response.headers.get('content-type') || '';
  const finalUrl = response.url || url;

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  if (!/html/i.test(contentType)) {
    return {
      finalUrl,
      contentType,
      html: ''
    };
  }

  return {
    finalUrl,
    contentType,
    html: await response.text()
  };
}

function pageLooksOfficialForHospital({ title, html, url, officialHospital }) {
  const $ = cheerio.load(html || '');
  const headings = $('h1, h2')
    .slice(0, 6)
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter(Boolean);
  const bodyText = normalizeHospitalName(normalizeWhitespace($('body').text()).slice(0, 6000));
  const signalTexts = [title, ...headings, url].map((value) => normalizeWhitespace(value)).filter(Boolean);
  const normalizedSignals = signalTexts.map((value) => normalizeHospitalName(value));
  const combinedSignals = normalizedSignals.join(' ');
  const hospitalName = normalizeHospitalName(officialHospital.facility_name);
  const tokens = specificHospitalTokens(officialHospital.facility_name);
  const cityText = normalizeHospitalName(officialHospital.city || '');
  let tokenMatches = 0;

  for (const token of tokens) {
    if (combinedSignals.includes(token) || bodyText.includes(token)) {
      tokenMatches += 1;
    }
  }

  const keywordPresent =
    signalTexts.some((value) => OFFICIAL_PAGE_KEYWORD_PATTERN.test(value)) ||
    OFFICIAL_PAGE_KEYWORD_PATTERN.test(bodyText);

  const exactMention = normalizedSignals.some((value) => value.includes(hospitalName)) || bodyText.includes(hospitalName);
  const bestSignalSimilarity = Math.max(
    0,
    ...signalTexts.map((value) => scoreHospitalNameSimilarity(officialHospital.facility_name, value))
  );
  const cityPresent = cityText ? combinedSignals.includes(cityText) || bodyText.includes(cityText) : false;
  const requiredTokenMatches = Math.min(tokens.length, 2);

  return (
    exactMention ||
    bestSignalSimilarity >= 0.9 ||
    (tokenMatches >= requiredTokenMatches && keywordPresent && (cityPresent || bestSignalSimilarity >= 0.75))
  );
}

function canUseSearchResultAsOfficialFallback({ officialHospital, candidate, hostname }) {
  if (!candidate?.url || !hostname || isBlockedSearchHost(hostname)) {
    return false;
  }

  if ((candidate.score || 0) < 30) {
    return false;
  }

  const exactHospitalName = normalizeHospitalName(officialHospital.facility_name);
  const cityText = normalizeHospitalName(officialHospital.city || '');
  const combinedText = normalizeHospitalName(`${candidate.title || ''} ${candidate.snippet || ''} ${candidate.url || ''}`);
  const exactMention = combinedText.includes(exactHospitalName);
  const closeTitleMatch = scoreHospitalNameSimilarity(officialHospital.facility_name, candidate.title || '') >= 0.9;
  const cityMention = cityText ? combinedText.includes(cityText) : false;
  const workflowContext =
    isLikelyWorkflowHref(candidate.title) ||
    isLikelyWorkflowHref(candidate.snippet) ||
    isLikelyWorkflowHref(candidate.url);

  return exactMention || (closeTitleMatch && (workflowContext || cityMention));
}

function candidateDomainLooksOfficialForHospital({ hostname, officialHospital, pageDiscovery }) {
  if (!hostname) {
    return false;
  }

  if (isKnownPortalHost(hostname)) {
    return true;
  }

  const domainTokens = new Set(extractDomainTokens(hostname));
  const hospitalTokens = specificHospitalTokens(officialHospital.facility_name);
  const overlapCount = hospitalTokens.filter((token) => domainTokens.has(token)).length;
  const sameDomainWorkflowEvidence = (pageDiscovery?.seedLinks || []).some((link) => link.sameDomain);

  return overlapCount > 0 || sameDomainWorkflowEvidence;
}

function normalizeCandidateLink(baseUrl, href) {
  if (!href) return null;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractSeedLinksFromHtml({ html, pageUrl, canonicalDomain }) {
  const $ = cheerio.load(html);
  const seedLinks = [];
  const evidenceUrls = new Set([pageUrl]);
  const title = normalizeWhitespace($('title').first().text());

  $('a[href]').each((_, element) => {
    const href = normalizeCandidateLink(pageUrl, $(element).attr('href'));
    if (!href) {
      return;
    }

    const hostname = extractCanonicalDomain(href);
    if (!hostname) {
      return;
    }

    const text = normalizeWhitespace($(element).text());
    const label = `${text} ${href}`;
    const sameDomain = hostname === canonicalDomain;
    const portalLink = isKnownPortalHost(hostname) || /portal|mychart/i.test(label);
    const workflowLink = isLikelyWorkflowHref(label);

    if (!sameDomain && !portalLink) {
      return;
    }

    if (!workflowLink && !portalLink) {
      return;
    }

    evidenceUrls.add(href);
    seedLinks.push({
      url: href,
      kind: portalLink ? 'portal' : 'workflow',
      sameDomain,
      label: text
    });
  });

  return {
    title,
    seedLinks,
    evidenceUrls: Array.from(evidenceUrls)
  };
}

export async function discoverHospitalSeedCandidate(
  officialHospital,
  {
    fetchImpl = fetch,
    searchFn = searchWeb
  } = {}
) {
  const stateName = getStateName(officialHospital.state) || officialHospital.state;
  const hospitalSearchName = buildSearchSafeHospitalName(officialHospital.facility_name);
  const quotedHospitalSearchName = `"${hospitalSearchName}"`;
  const cityText = buildSearchSafeHospitalName(officialHospital.city || stateName);
  const queryVariants = [
    `${quotedHospitalSearchName} ${cityText} ${officialHospital.state} medical records`,
    `${quotedHospitalSearchName} ${cityText} ${officialHospital.state} hospital`,
    `${quotedHospitalSearchName} ${cityText} ${stateName} patient portal`
  ];

  const searchResults = await Promise.all(
    queryVariants.map(async (query) => {
      try {
        return await searchFn(query, fetchImpl);
      } catch {
        return [];
      }
    })
  );

  const scoredCandidates = dedupeSearchResults(searchResults.flat())
    .map((result) => ({
      ...result,
      score: scoreSearchResultAsOfficial(officialHospital, result)
    }))
    .filter((result) => Number.isFinite(result.score))
    .sort((left, right) => right.score - left.score);

  let officialResult = null;
  let canonicalDomain = null;
  let pageDiscovery = {
    title: officialHospital.facility_name,
    seedLinks: [],
    evidenceUrls: []
  };

  for (const candidate of scoredCandidates.slice(0, MAX_OFFICIAL_CANDIDATE_FETCHES)) {
    const candidateDomain = extractCanonicalDomain(candidate.url);
    if (!candidateDomain) {
      continue;
    }

    try {
      const fetched = await fetchHtmlPage(candidate.url, fetchImpl);
      const candidatePageDiscovery = extractSeedLinksFromHtml({
        html: fetched.html,
        pageUrl: fetched.finalUrl,
        canonicalDomain: candidateDomain
      });
      if (
        !candidateDomainLooksOfficialForHospital({
          hostname: candidateDomain,
          officialHospital,
          pageDiscovery: candidatePageDiscovery
        })
      ) {
        if (
          canUseSearchResultAsOfficialFallback({
            officialHospital,
            candidate,
            hostname: candidateDomain
          })
        ) {
          officialResult = candidate;
          canonicalDomain = candidateDomain;
          pageDiscovery = {
            title: candidate.title,
            seedLinks: [],
            evidenceUrls: [candidate.url]
          };
          break;
        }
        continue;
      }
      if (
        !pageLooksOfficialForHospital({
          title: candidatePageDiscovery.title,
          html: fetched.html,
          url: fetched.finalUrl,
          officialHospital
        })
      ) {
        if (
          canUseSearchResultAsOfficialFallback({
            officialHospital,
            candidate,
            hostname: candidateDomain
          })
        ) {
          officialResult = candidate;
          canonicalDomain = candidateDomain;
          pageDiscovery = {
            title: candidate.title,
            seedLinks: [],
            evidenceUrls: [candidate.url]
          };
          break;
        }
        continue;
      }

      officialResult = {
        ...candidate,
        url: fetched.finalUrl
      };
      canonicalDomain = candidateDomain;
      pageDiscovery = candidatePageDiscovery;
      break;
    } catch {
      if (
        canUseSearchResultAsOfficialFallback({
          officialHospital,
          candidate,
          hostname: candidateDomain
        })
      ) {
        officialResult = candidate;
        canonicalDomain = candidateDomain;
        pageDiscovery = {
          title: candidate.title,
          seedLinks: [],
          evidenceUrls: [candidate.url]
        };
        break;
      }
      continue;
    }
  }

  const officialUrl = officialResult?.url || null;

  const workflowSeedUrls = new Set();
  const portalSeedUrls = new Set();
  const evidenceUrls = new Set(pageDiscovery.evidenceUrls || []);

  if (officialUrl && isLikelyWorkflowHref(officialUrl)) {
    workflowSeedUrls.add(officialUrl);
    evidenceUrls.add(officialUrl);
  }

  for (const link of pageDiscovery.seedLinks || []) {
    if (link.kind === 'portal') {
      portalSeedUrls.add(link.url);
    }
    if (link.kind === 'workflow') {
      workflowSeedUrls.add(link.url);
    }
  }

  if (officialUrl && workflowSeedUrls.size === 0 && portalSeedUrls.size === 0) {
    workflowSeedUrls.add(officialUrl);
  }

  const confidence = classifyGeneratedSeedConfidence({
    officialUrl,
    workflowSeedUrls: Array.from(workflowSeedUrls),
    portalSeedUrls: Array.from(portalSeedUrls),
    discoveredFacilities: 1
  });

  return {
    state: officialHospital.state,
    official_hospital_name: officialHospital.facility_name,
    official_city: officialHospital.city,
    official_provider_numbers: officialHospital.provider_numbers,
    canonical_domain: canonicalDomain,
    system_name_candidate: inferBrandName({
      title: pageDiscovery.title,
      officialHospitalName: officialHospital.facility_name,
      canonicalDomain
    }),
    official_url: officialUrl,
    workflow_seed_urls: Array.from(workflowSeedUrls),
    portal_seed_urls: Array.from(portalSeedUrls),
    seed_urls: Array.from(new Set([...workflowSeedUrls, ...portalSeedUrls])),
    discovery_confidence: confidence,
    evidence_urls: Array.from(evidenceUrls).slice(0, 12),
    search_result_sample: scoredCandidates.slice(0, 5).map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      score: Number(result.score.toFixed(2))
    }))
  };
}

export function groupGeneratedSeedCandidates(discoveries = []) {
  const groups = new Map();

  for (const discovery of discoveries) {
    const key = `${discovery.state}::${discovery.canonical_domain || normalizeHospitalName(discovery.official_hospital_name)}`;
    const existing = groups.get(key) || [];
    existing.push(discovery);
    groups.set(key, existing);
  }

  return Array.from(groups.values()).map((group) => {
    const lead = group[0];
    const discoveryConfidence = minConfidence(group.map((item) => item.discovery_confidence));
    const seedUrls = Array.from(new Set(group.flatMap((item) => item.seed_urls))).slice(0, 8);
    const evidenceUrls = Array.from(new Set(group.flatMap((item) => item.evidence_urls))).slice(0, 16);
    const generationErrors = group.map((item) => item.generation_error).filter(Boolean);
    const systemName =
      (group.length > 1 && lead.system_name_candidate) || lead.system_name_candidate || lead.official_hospital_name;

    const entry = {
      system_name: systemName,
      state: lead.state,
      domain: lead.canonical_domain,
      seed_urls: seedUrls,
      discovery_confidence: discoveryConfidence,
      evidence_urls: evidenceUrls,
      generation_errors: generationErrors,
      facilities: group.map((item) => ({
        facility_name: item.official_hospital_name,
        city: item.official_city,
        state: item.state,
        official_hospital_name: item.official_hospital_name,
        official_city: item.official_city
      }))
    };

    if (group.length === 1) {
      entry.official_hospital_name = lead.official_hospital_name;
      entry.official_city = lead.official_city;
    } else {
      entry.official_hospital_count = group.length;
    }

    return entry;
  });
}

export async function generateStateSeedCandidates(
  {
    state,
    roster,
    officialHospitals = null,
    outputPath = null,
    dryRun = false,
    fetchImpl = fetch,
    searchFn = searchWeb,
    concurrency = DEFAULT_GENERATED_SEED_CONCURRENCY
  } = {}
) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('state is required for generated seed candidates');
  }

  const stateHospitals =
    officialHospitals || buildOfficialHospitalIdentities(roster.hospitals_by_state[normalizedState] || []);
  const discoveries = await mapWithConcurrency(stateHospitals, concurrency, (hospital) =>
    discoverHospitalSeedCandidate(
      {
        ...hospital,
        state: normalizedState,
        state_name: getStateName(normalizedState)
      },
      { fetchImpl, searchFn }
    ).catch((error) => ({
      state: normalizedState,
      official_hospital_name: hospital.facility_name,
      official_city: hospital.city,
      official_provider_numbers: hospital.provider_numbers,
      canonical_domain: null,
      system_name_candidate: hospital.facility_name,
      official_url: null,
      workflow_seed_urls: [],
      portal_seed_urls: [],
      seed_urls: [],
      discovery_confidence: 'low',
      evidence_urls: [],
      generation_error: error.message
    }))
  );

  const entries = groupGeneratedSeedCandidates(discoveries);
  const resolvedOutputPath = buildGeneratedSeedFilePath(normalizedState, outputPath || DEFAULT_GENERATED_SEED_DIR);

  if (!dryRun) {
    await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
    await fs.writeFile(resolvedOutputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  }

  const confidenceSummary = {
    high: entries.filter((entry) => entry.discovery_confidence === 'high').length,
    medium: entries.filter((entry) => entry.discovery_confidence === 'medium').length,
    low: entries.filter((entry) => entry.discovery_confidence === 'low').length
  };

  return {
    state: normalizedState,
    official_hospital_identities: stateHospitals.length,
    generated_systems: entries.length,
    confidence_summary: confidenceSummary,
    output_path: resolvedOutputPath,
    dry_run: dryRun,
    entries
  };
}
