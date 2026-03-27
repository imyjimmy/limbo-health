import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { normalizeStateCode } from '../utils/states.js';

function normalizeOptionalString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export function normalizeTargetedPageUrl(url) {
  const normalizedInput = normalizeOptionalString(url);
  if (!normalizedInput) return null;

  try {
    const parsed = new URL(normalizedInput);
    parsed.hash = '';
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString();
  } catch {
    return normalizedInput.replace(/#.*$/, '').replace(/\/+$/, '') || null;
  }
}

function blocklistDirectory() {
  return path.join(config.targetedPageStorageDir, 'blocklist');
}

function blocklistPathForState(state) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error(`A valid state code is required for the targeted page blocklist: ${state}`);
  }
  return path.join(blocklistDirectory(), `${normalizedState.toLowerCase()}.json`);
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeJsonFile(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeBlocklistEntries(entries = []) {
  const deduped = new Map();

  for (const entry of Array.isArray(entries) ? entries : []) {
    const state = normalizeStateCode(entry?.state);
    const hospitalSystemId = normalizeOptionalString(entry?.hospital_system_id);
    const normalizedUrl = normalizeTargetedPageUrl(entry?.url || entry?.normalized_url);
    if (!state || !hospitalSystemId || !normalizedUrl) {
      continue;
    }

    const key = `${state}:${hospitalSystemId}:${normalizedUrl}`;
    deduped.set(key, {
      state,
      hospital_system_id: hospitalSystemId,
      facility_id: normalizeOptionalString(entry?.facility_id),
      system_name: normalizeOptionalString(entry?.system_name),
      url: normalizeOptionalString(entry?.url) || normalizedUrl,
      normalized_url: normalizedUrl,
      blocked_at: normalizeOptionalString(entry?.blocked_at) || new Date().toISOString(),
    });
  }

  return Array.from(deduped.values()).sort((left, right) => {
    const leftKey = `${left.system_name || ''} ${left.normalized_url}`;
    const rightKey = `${right.system_name || ''} ${right.normalized_url}`;
    return leftKey.localeCompare(rightKey);
  });
}

export async function readTargetedPageBlocklist(state) {
  const filePath = blocklistPathForState(state);
  return normalizeBlocklistEntries(await readJsonFile(filePath));
}

export async function addTargetedPageToBlocklist({
  state,
  hospitalSystemId,
  facilityId = null,
  systemName = null,
  url,
}) {
  const normalizedState = normalizeStateCode(state);
  const normalizedUrl = normalizeTargetedPageUrl(url);
  const normalizedHospitalSystemId = normalizeOptionalString(hospitalSystemId);
  if (!normalizedState || !normalizedHospitalSystemId || !normalizedUrl) {
    throw new Error('State, hospital system id, and URL are required to block a targeted page.');
  }

  const filePath = blocklistPathForState(normalizedState);
  const nextEntries = normalizeBlocklistEntries([
    ...(await readJsonFile(filePath)),
    {
      state: normalizedState,
      hospital_system_id: normalizedHospitalSystemId,
      facility_id: facilityId,
      system_name: systemName,
      url,
      normalized_url: normalizedUrl,
      blocked_at: new Date().toISOString(),
    },
  ]);
  await writeJsonFile(filePath, nextEntries);
  return nextEntries;
}

export async function removeTargetedPagesFromBlocklist({
  state,
  hospitalSystemId,
  urls = [],
}) {
  const normalizedState = normalizeStateCode(state);
  const normalizedHospitalSystemId = normalizeOptionalString(hospitalSystemId);
  if (!normalizedState || !normalizedHospitalSystemId) {
    return [];
  }

  const normalizedUrls = new Set(
    (Array.isArray(urls) ? urls : [])
      .map((url) => normalizeTargetedPageUrl(url))
      .filter(Boolean),
  );
  if (normalizedUrls.size === 0) {
    return readTargetedPageBlocklist(normalizedState);
  }

  const filePath = blocklistPathForState(normalizedState);
  const filtered = normalizeBlocklistEntries(await readJsonFile(filePath)).filter(
    (entry) =>
      !(
        entry.hospital_system_id === normalizedHospitalSystemId &&
        normalizedUrls.has(entry.normalized_url)
      ),
  );
  await writeJsonFile(filePath, filtered);
  return filtered;
}

export async function getTargetedPageBlockedUrlSet({ state, hospitalSystemId }) {
  const normalizedState = normalizeStateCode(state);
  const normalizedHospitalSystemId = normalizeOptionalString(hospitalSystemId);
  if (!normalizedState || !normalizedHospitalSystemId) {
    return new Set();
  }

  const entries = await readTargetedPageBlocklist(normalizedState);
  return new Set(
    entries
      .filter((entry) => entry.hospital_system_id === normalizedHospitalSystemId)
      .map((entry) => entry.normalized_url)
      .filter(Boolean),
  );
}

export async function filterBlockedTargetedPageItems(
  items = [],
  {
    defaultState = null,
    getUrl = (item) => item?.url,
    getHospitalSystemId = (item) => item?.hospital_system_id || item?.hospitalSystemId,
    getState = (item) => item?.system_state || item?.state || defaultState,
  } = {},
) {
  const blocklists = new Map();
  const filtered = [];

  for (const item of Array.isArray(items) ? items : []) {
    const state = normalizeStateCode(getState(item));
    const hospitalSystemId = normalizeOptionalString(getHospitalSystemId(item));
    const normalizedUrl = normalizeTargetedPageUrl(getUrl(item));
    if (!state || !hospitalSystemId || !normalizedUrl) {
      filtered.push(item);
      continue;
    }

    if (!blocklists.has(state)) {
      blocklists.set(state, await readTargetedPageBlocklist(state));
    }

    const blockedEntries = blocklists.get(state);
    const isBlocked = blockedEntries.some(
      (entry) =>
        entry.hospital_system_id === hospitalSystemId && entry.normalized_url === normalizedUrl,
    );
    if (!isBlocked) {
      filtered.push(item);
    }
  }

  return filtered;
}
