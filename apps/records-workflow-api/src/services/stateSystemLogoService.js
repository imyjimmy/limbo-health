import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { resolveFromServiceRoot } from '../config.js';
import { readStateSeedFile } from './seedEditorService.js';
import { normalizeStateCode } from '../utils/states.js';

const DEFAULT_LOGO_STORAGE_ROOT = 'storage/system-logos';
const DEFAULT_LOGO_FETCH_CONCURRENCY = 4;
const PAGE_FETCH_TIMEOUT_MS = 15_000;
const ASSET_FETCH_TIMEOUT_MS = 20_000;
const LOGO_FETCH_USER_AGENT =
  'Mozilla/5.0 (compatible; LimboHealthLogoFetch/1.0; +https://limbo.health)';

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeStateOrThrow(state) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('A valid state code is required for logo fetching.');
  }

  return normalizedState;
}

function buildTimestampStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function buildStateLogoStorageRoot(state) {
  return resolveFromServiceRoot(
    `${DEFAULT_LOGO_STORAGE_ROOT}/${normalizeStateOrThrow(state).toLowerCase()}`,
    `${DEFAULT_LOGO_STORAGE_ROOT}/${normalizeStateOrThrow(state).toLowerCase()}`,
  );
}

export function buildDefaultStateLogoFetchReportPath(state, date = new Date()) {
  const normalizedState = normalizeStateOrThrow(state).toLowerCase();
  return resolveFromServiceRoot(
    `${DEFAULT_LOGO_STORAGE_ROOT}/${normalizedState}/runs/${buildTimestampStamp(date)}.json`,
    `${DEFAULT_LOGO_STORAGE_ROOT}/${normalizedState}/runs/${buildTimestampStamp(date)}.json`,
  );
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

function decodeHtmlEntities(value) {
  return normalizeWhitespace(
    String(value || '')
      .replace(/&amp;/g, '&')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  );
}

function extractCanonicalDomain(value) {
  if (!value) return null;

  try {
    return new URL(value).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return String(value || '').replace(/^www\./i, '').toLowerCase() || null;
  }
}

function extractDomainTail(value) {
  const hostname = extractCanonicalDomain(value);
  if (!hostname) return null;

  const parts = hostname.split('.').filter(Boolean);
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

function isLikelySvgUrl(value) {
  return /^data:image\/svg\+xml/i.test(value) || /\.svg(?:$|[?#])/i.test(value);
}

function isLikelySmallIcon(url, attrText) {
  const haystack = `${url} ${attrText}`.toLowerCase();
  return (
    /(^|[\s/_-])(icon|icons|favicon|apple-touch|mask-icon|sprite)([\s/_-]|$)/.test(haystack) &&
    !/\blogo\b/.test(haystack)
  );
}

function isNegativeDecorativeAsset(url, attrText) {
  const haystack = `${url} ${attrText}`.toLowerCase();
  return /\b(facebook|twitter|linkedin|youtube|instagram|printer|search|menu|close|badge|award|accredit|newsweek|magnet|placeholder|hero|event|map)\b/.test(
    haystack,
  );
}

function parseDimension(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function scoreLogoCandidate(candidate, system) {
  const url = String(candidate.url || '');
  const attrText = decodeHtmlEntities(candidate.attr_text || '');
  const lowerUrl = url.toLowerCase();
  const lowerAttrs = attrText.toLowerCase();
  const systemDomain = extractCanonicalDomain(system.domain);
  const pageTail = extractDomainTail(candidate.page_url);
  const assetTail = extractDomainTail(candidate.url);
  const systemTail = extractDomainTail(system.domain);

  let score = 0;

  if (/^data:image\/svg\+xml/i.test(url)) score += 140;
  else if (isLikelySvgUrl(url)) score += 110;
  else if (/\.(png|webp|jpg|jpeg|gif|ico)(?:$|[?#])/i.test(lowerUrl)) score += 25;

  if (candidate.kind === 'jsonld') score += 30;
  if (candidate.kind === 'img') score += 12;
  if (candidate.kind === 'meta') score += 8;
  if (candidate.kind === 'link') score -= 10;

  if (/\blogo\b/.test(lowerUrl)) score += 35;
  if (/\b(wordmark|brand|logotype|site-logo|site_logo)\b/.test(lowerUrl)) score += 25;
  if (/\blogo\b/.test(lowerAttrs)) score += 35;
  if (/\b(wordmark|brand|logotype|site logo|home logo|site-logo)\b/.test(lowerAttrs)) score += 25;
  if (/\b(header|masthead|navbar|site-header)\b/.test(lowerAttrs)) score += 10;

  if (systemDomain && extractCanonicalDomain(candidate.page_url) === systemDomain) score += 15;
  if (systemTail && assetTail && assetTail === systemTail) score += 15;
  if (pageTail && assetTail && pageTail === assetTail) score += 10;

  if (isLikelySmallIcon(lowerUrl, lowerAttrs)) score -= 50;
  if (isNegativeDecorativeAsset(lowerUrl, lowerAttrs)) score -= 45;

  const width = parseDimension(candidate.width);
  const height = parseDimension(candidate.height);
  const minDimension = width && height ? Math.min(width, height) : width || height || null;
  if (minDimension && minDimension < 48) score -= 25;
  if (minDimension && minDimension >= 96) score += 10;

  return score;
}

function buildPageCandidates(system) {
  const systemDomain = normalizeWhitespace(system.domain);
  const homepage = systemDomain ? `https://${systemDomain}` : null;

  return unique([...(system.seed_urls || []), homepage]);
}

function safeUrl(value, base = null) {
  if (!value) return null;

  try {
    return new URL(value, base || undefined).toString();
  } catch {
    return null;
  }
}

function extractSrcSetCandidates(rawValue, baseUrl) {
  return unique(
    String(rawValue || '')
      .split(',')
      .map((entry) => entry.trim().split(/\s+/)[0])
      .map((value) => safeUrl(value, baseUrl)),
  );
}

function collectJsonLdLogoCandidates($, pageUrl) {
  const candidates = [];

  $('script[type="application/ld+json"]').each((_, element) => {
    const raw = $(element).text();
    if (!normalizeWhitespace(raw)) return;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;

      const logoValue = current.logo;
      if (typeof logoValue === 'string') {
        const resolved = safeUrl(logoValue, pageUrl);
        if (resolved) {
          candidates.push({
            kind: 'jsonld',
            url: resolved,
            page_url: pageUrl,
            attr_text: [current['@type'], current.name, current.alternateName, 'jsonld logo']
              .filter(Boolean)
              .join(' '),
            width: null,
            height: null,
          });
        }
      } else if (logoValue && typeof logoValue === 'object') {
        const resolved = safeUrl(logoValue.url || logoValue.contentUrl || logoValue['@id'], pageUrl);
        if (resolved) {
          candidates.push({
            kind: 'jsonld',
            url: resolved,
            page_url: pageUrl,
            attr_text: [current['@type'], current.name, current.alternateName, 'jsonld logo']
              .filter(Boolean)
              .join(' '),
            width: logoValue.width || null,
            height: logoValue.height || null,
          });
        }
      }

      for (const value of Object.values(current)) {
        if (Array.isArray(value)) {
          queue.push(...value);
        } else if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }
  });

  return candidates;
}

function collectLogoCandidatesFromHtml({ html, pageUrl, system }) {
  const $ = cheerio.load(html);
  const candidates = [];

  $('img, source').each((_, element) => {
    const attribs = element.attribs || {};
    const urls = unique([
      safeUrl(attribs.src, pageUrl),
      safeUrl(attribs['data-src'], pageUrl),
      safeUrl(attribs['data-lazy-src'], pageUrl),
      ...extractSrcSetCandidates(attribs.srcset, pageUrl),
      ...extractSrcSetCandidates(attribs['data-srcset'], pageUrl),
    ]);

    const attrText = [
      attribs.alt,
      attribs.class,
      attribs.id,
      attribs['aria-label'],
      attribs.title,
    ]
      .filter(Boolean)
      .join(' ');

    for (const url of urls) {
      candidates.push({
        kind: element.tagName === 'source' ? 'source' : 'img',
        url,
        page_url: pageUrl,
        attr_text: attrText,
        width: attribs.width || null,
        height: attribs.height || null,
      });
    }
  });

  $(
    'meta[property="og:image"], meta[name="og:image"], meta[property="twitter:image"], meta[name="twitter:image"], meta[property="og:logo"], meta[name="og:logo"]',
  ).each((_, element) => {
    const content = safeUrl($(element).attr('content'), pageUrl);
    if (!content) return;

    candidates.push({
      kind: 'meta',
      url: content,
      page_url: pageUrl,
      attr_text: [$(element).attr('property'), $(element).attr('name'), 'meta image']
        .filter(Boolean)
        .join(' '),
      width: null,
      height: null,
    });
  });

  $('link').each((_, element) => {
    const rel = normalizeWhitespace($(element).attr('rel'));
    const href = safeUrl($(element).attr('href'), pageUrl);
    if (!href) return;
    if (!/(icon|logo|mask-icon)/i.test(rel)) return;

    candidates.push({
      kind: 'link',
      url: href,
      page_url: pageUrl,
      attr_text: rel,
      width: null,
      height: null,
    });
  });

  candidates.push(...collectJsonLdLogoCandidates($, pageUrl));

  return unique(
    candidates.map((candidate) => JSON.stringify(candidate)),
  ).map((value) => JSON.parse(value)).map((candidate) => ({
    ...candidate,
    score: scoreLogoCandidate(candidate, system),
  }));
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchLogoPage(fetchImpl, url) {
  const response = await fetchWithTimeout(
    fetchImpl,
    url,
    {
      redirect: 'follow',
      headers: {
        'user-agent': LOGO_FETCH_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    },
    PAGE_FETCH_TIMEOUT_MS,
  );

  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    final_url: response.url || url,
    content_type: contentType,
    html: /html|xml/i.test(contentType) || /<html|<svg/i.test(bodyText) ? bodyText : '',
  };
}

function decodeDataUri(dataUri) {
  const match = String(dataUri || '').match(/^data:([^;,]+)?((?:;[^,]+)*?),(.*)$/i);
  if (!match) {
    throw new Error('Unsupported data URI.');
  }

  const contentType = match[1] || 'text/plain';
  const parameters = match[2] || '';
  const payload = match[3] || '';
  const isBase64 = /;base64/i.test(parameters);
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return {
    buffer,
    contentType,
    finalUrl: dataUri,
    status: 200,
  };
}

function looksLikeSvgBuffer(buffer) {
  const text = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8');
  return /<svg[\s>]/i.test(text);
}

function inferAssetExtension({ contentType, url, buffer }) {
  const normalizedType = String(contentType || '').toLowerCase();
  const normalizedUrl = String(url || '').toLowerCase();

  if (normalizedType.includes('svg') || isLikelySvgUrl(normalizedUrl) || looksLikeSvgBuffer(buffer)) {
    return { extension: 'svg', format: 'svg', contentType: 'image/svg+xml' };
  }

  if (normalizedType.includes('png') || buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: 'png', format: 'bitmap', contentType: 'image/png' };
  }

  if (normalizedType.includes('webp') || buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    return { extension: 'webp', format: 'bitmap', contentType: 'image/webp' };
  }

  if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) {
    return { extension: 'jpg', format: 'bitmap', contentType: 'image/jpeg' };
  }

  if (normalizedType.includes('gif')) {
    return { extension: 'gif', format: 'bitmap', contentType: 'image/gif' };
  }

  if (normalizedType.includes('icon') || normalizedType.includes('ico') || /\.ico(?:$|[?#])/i.test(normalizedUrl)) {
    return { extension: 'ico', format: 'bitmap', contentType: 'image/x-icon' };
  }

  return { extension: 'bin', format: 'bitmap', contentType: normalizedType || 'application/octet-stream' };
}

async function fetchLogoAsset(fetchImpl, candidate) {
  if (/^data:/i.test(candidate.url || '')) {
    return decodeDataUri(candidate.url);
  }

  const response = await fetchWithTimeout(
    fetchImpl,
    candidate.url,
    {
      redirect: 'follow',
      headers: {
        'user-agent': LOGO_FETCH_USER_AGENT,
        accept: 'image/svg+xml,image/*;q=0.9,*/*;q=0.8',
      },
    },
    ASSET_FETCH_TIMEOUT_MS,
  );

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    buffer,
    contentType: response.headers.get('content-type') || '',
    finalUrl: response.url || candidate.url,
    status: response.status,
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function fetchSystemLogo({ system, assetDir, fetchImpl }) {
  const pageUrls = buildPageCandidates(system);
  const pageResults = [];
  const candidates = [];

  for (const pageUrl of pageUrls) {
    try {
      const page = await fetchLogoPage(fetchImpl, pageUrl);
      pageResults.push({
        requested_url: pageUrl,
        final_url: page.final_url,
        status: page.status,
        content_type: page.content_type,
      });

      if (!page.ok || !page.html) {
        continue;
      }

      candidates.push(...collectLogoCandidatesFromHtml({ html: page.html, pageUrl: page.final_url, system }));
    } catch (error) {
      pageResults.push({
        requested_url: pageUrl,
        final_url: null,
        status: 'failed',
        error: error.message,
      });
    }
  }

  const rankedCandidates = [...candidates]
    .sort((left, right) => right.score - left.score || left.url.localeCompare(right.url))
    .slice(0, 20);
  const selectedCandidate = rankedCandidates.find((candidate) => candidate.score >= 30) || null;

  if (!selectedCandidate) {
    return {
      system_name: system.system_name,
      domain: system.domain || null,
      status: rankedCandidates.length > 0 ? 'no_confident_candidate' : 'no_candidate',
      page_results: pageResults,
      candidate_count: rankedCandidates.length,
      top_candidates: rankedCandidates.slice(0, 5),
      selected_candidate: null,
      asset_path: null,
      format: null,
      content_type: null,
      size_bytes: null,
      fetched_url: null,
      source_page_url: null,
    };
  }

  try {
    const asset = await fetchLogoAsset(fetchImpl, selectedCandidate);
    if (!asset.buffer || asset.buffer.length === 0 || Number(asset.status) >= 400) {
      throw new Error(`Asset fetch failed with status ${asset.status}.`);
    }

    const inferred = inferAssetExtension({
      contentType: asset.contentType,
      url: asset.finalUrl,
      buffer: asset.buffer,
    });
    const fileName = `${slugify(system.system_name)}.${inferred.extension}`;
    const filePath = path.join(assetDir, fileName);

    await fs.mkdir(assetDir, { recursive: true });
    await fs.writeFile(filePath, asset.buffer);

    return {
      system_name: system.system_name,
      domain: system.domain || null,
      status: 'fetched',
      page_results: pageResults,
      candidate_count: rankedCandidates.length,
      top_candidates: rankedCandidates.slice(0, 5),
      selected_candidate: selectedCandidate,
      asset_path: filePath,
      format: inferred.format,
      content_type: inferred.contentType,
      size_bytes: asset.buffer.length,
      fetched_url: asset.finalUrl,
      source_page_url: selectedCandidate.page_url,
    };
  } catch (error) {
    return {
      system_name: system.system_name,
      domain: system.domain || null,
      status: 'asset_fetch_failed',
      error: error.message,
      page_results: pageResults,
      candidate_count: rankedCandidates.length,
      top_candidates: rankedCandidates.slice(0, 5),
      selected_candidate: selectedCandidate,
      asset_path: null,
      format: null,
      content_type: null,
      size_bytes: null,
      fetched_url: null,
      source_page_url: selectedCandidate.page_url,
    };
  }
}

export async function fetchStateSeedSystemLogos({
  state,
  systems = null,
  outputPath = null,
  latestAlias = true,
  fetchImpl = fetch,
  concurrency = DEFAULT_LOGO_FETCH_CONCURRENCY,
} = {}) {
  const normalizedState = normalizeStateOrThrow(state);
  const snapshot = systems
    ? { state: normalizedState, systems }
    : await readStateSeedFile(normalizedState);
  const storageRoot = buildStateLogoStorageRoot(normalizedState);
  const assetDir = path.join(storageRoot, 'assets');
  const reportPath = outputPath
    ? resolveFromServiceRoot(outputPath, outputPath)
    : buildDefaultStateLogoFetchReportPath(normalizedState);

  const results = await mapWithConcurrency(snapshot.systems, concurrency, (system) =>
    fetchSystemLogo({ system, assetDir, fetchImpl }),
  );

  const summary = {
    generated_at: new Date().toISOString(),
    state: normalizedState,
    system_count: snapshot.systems.length,
    fetched_count: results.filter((result) => result.status === 'fetched').length,
    svg_count: results.filter((result) => result.status === 'fetched' && result.format === 'svg').length,
    bitmap_count: results.filter((result) => result.status === 'fetched' && result.format === 'bitmap').length,
    failed_count: results.filter((result) => result.status !== 'fetched').length,
    asset_dir: assetDir,
    results,
  };

  await writeJson(reportPath, summary);
  if (latestAlias) {
    await writeJson(path.join(storageRoot, 'latest.json'), summary);
  }

  return {
    summary,
    reportPath,
    assetDir,
  };
}
