import fs from 'node:fs/promises';
import { resolveSeedFilePath } from './seedService.js';
import { normalizeStateCode, isUsStateCode } from '../utils/states.js';
import { collapseWhitespace, uniqueBy } from '../utils/text.js';

function normalizeString(value) {
  return collapseWhitespace(typeof value === 'string' ? value : '');
}

function normalizeOptionalString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeSeedUrls(seedUrls = []) {
  return uniqueBy(
    (Array.isArray(seedUrls) ? seedUrls : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
    (value) => value.toLowerCase(),
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeFacilities(facilities = [], state) {
  return uniqueBy(
    (Array.isArray(facilities) ? facilities : [])
      .map((facility) => ({
        facility_name: normalizeString(facility?.facility_name),
        city: normalizeOptionalString(facility?.city),
        state: normalizeStateCode(facility?.state) || state,
        facility_type: normalizeOptionalString(facility?.facility_type),
        facility_page_url: normalizeOptionalString(facility?.facility_page_url),
        external_facility_id: normalizeOptionalString(facility?.external_facility_id),
      }))
      .filter((facility) => facility.facility_name),
    (facility) =>
      [
        facility.facility_name.toLowerCase(),
        (facility.city || '').toLowerCase(),
        facility.state,
      ].join('::'),
  ).sort((left, right) => {
    const leftKey = `${left.facility_name} ${left.city || ''}`;
    const rightKey = `${right.facility_name} ${right.city || ''}`;
    return leftKey.localeCompare(rightKey);
  });
}

function normalizeSeedSystem(system = {}, state) {
  const systemName = normalizeString(system?.system_name);
  if (!systemName) {
    throw new Error('Each seed system requires a system_name.');
  }

  return {
    system_name: systemName,
    state,
    domain: normalizeOptionalString(system?.domain),
    seed_urls: normalizeSeedUrls(system?.seed_urls),
    facilities: normalizeFacilities(system?.facilities, state),
  };
}

export function buildSeedEditorCounts(systems = []) {
  return {
    systems: systems.length,
    facilities: systems.reduce(
      (total, system) => total + (Array.isArray(system?.facilities) ? system.facilities.length : 0),
      0,
    ),
    seed_urls: systems.reduce(
      (total, system) => total + (Array.isArray(system?.seed_urls) ? system.seed_urls.length : 0),
      0,
    ),
  };
}

export function sanitizeSeedSystems(systems = [], state) {
  const normalizedState = normalizeStateCode(state);
  if (!isUsStateCode(normalizedState)) {
    throw new Error(`A valid US state code is required: ${state}`);
  }

  return uniqueBy(
    (Array.isArray(systems) ? systems : []).map((system) =>
      normalizeSeedSystem(system, normalizedState),
    ),
    (system) => system.system_name.toLowerCase(),
  ).sort((left, right) => left.system_name.localeCompare(right.system_name));
}

export function mergeSeedSystems(existingSystems = [], incomingSystems = [], state) {
  const normalizedState = normalizeStateCode(state);
  if (!isUsStateCode(normalizedState)) {
    throw new Error(`A valid US state code is required: ${state}`);
  }

  const merged = sanitizeSeedSystems(existingSystems, normalizedState);

  for (const incomingSystem of Array.isArray(incomingSystems) ? incomingSystems : []) {
    const normalizedIncoming = normalizeSeedSystem(incomingSystem, normalizedState);
    const matchIndex = merged.findIndex(
      (system) =>
        system.system_name.toLowerCase() === normalizedIncoming.system_name.toLowerCase() ||
        (system.domain &&
          normalizedIncoming.domain &&
          system.domain.toLowerCase() === normalizedIncoming.domain.toLowerCase()),
    );

    if (matchIndex === -1) {
      merged.push(normalizedIncoming);
      continue;
    }

    const existing = merged[matchIndex];
    merged[matchIndex] = normalizeSeedSystem(
      {
        ...existing,
        domain: existing.domain || normalizedIncoming.domain,
        seed_urls: [...(existing.seed_urls || []), ...(normalizedIncoming.seed_urls || [])],
        facilities: [...(existing.facilities || []), ...(normalizedIncoming.facilities || [])],
      },
      normalizedState,
    );
  }

  return sanitizeSeedSystems(merged, normalizedState);
}

export async function readStateSeedFile(state) {
  const normalizedState = normalizeStateCode(state);
  const seedFilePath = resolveSeedFilePath({ state: normalizedState });
  let raw = null;
  try {
    raw = await fs.readFile(seedFilePath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  if (raw == null) {
    return {
      state: normalizedState,
      seed_file_path: seedFilePath,
      systems: [],
      counts: buildSeedEditorCounts([]),
    };
  }

  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error(`Seed file for ${normalizedState} must contain a JSON array.`);
  }

  const systems = sanitizeSeedSystems(parsed, normalizedState);
  return {
    state: normalizedState,
    seed_file_path: seedFilePath,
    systems,
    counts: buildSeedEditorCounts(systems),
  };
}

export async function saveStateSeedFile({ state, systems }) {
  const normalizedState = normalizeStateCode(state);
  const sanitizedSystems = sanitizeSeedSystems(systems, normalizedState);
  const seedFilePath = resolveSeedFilePath({ state: normalizedState });

  await fs.writeFile(seedFilePath, `${JSON.stringify(sanitizedSystems, null, 2)}\n`, 'utf8');

  return {
    state: normalizedState,
    seed_file_path: seedFilePath,
    systems: sanitizedSystems,
    counts: buildSeedEditorCounts(sanitizedSystems),
  };
}

export async function mergeSystemsIntoStateSeedFile({ state, systems = [] }) {
  const snapshot = await readStateSeedFile(state);
  const mergedSystems = mergeSeedSystems(snapshot.systems, systems, snapshot.state);

  return saveStateSeedFile({
    state: snapshot.state,
    systems: mergedSystems,
  });
}

export async function upsertHumanApprovedSeedInFile({
  state,
  systemName,
  domain = null,
  seedUrls = [],
  facility = null,
}) {
  const snapshot = await readStateSeedFile(state);
  const normalizedSystemName = normalizeString(systemName);
  const normalizedSeedUrls = normalizeSeedUrls(seedUrls);

  if (!normalizedSystemName) {
    throw new Error('systemName is required to update the seed file.');
  }

  const systems = [...snapshot.systems];
  const matchIndex = systems.findIndex(
    (system) =>
      system.system_name.toLowerCase() === normalizedSystemName.toLowerCase() ||
      (domain && system.domain && system.domain.toLowerCase() === String(domain).toLowerCase()),
  );

  const nextFacility =
    facility && normalizeString(facility.facility_name)
      ? normalizeFacilities([facility], snapshot.state)[0]
      : null;

  if (matchIndex === -1) {
    systems.push(
      normalizeSeedSystem(
        {
          system_name: normalizedSystemName,
          state: snapshot.state,
          domain,
          seed_urls: normalizedSeedUrls,
          facilities: nextFacility ? [nextFacility] : [],
        },
        snapshot.state,
      ),
    );
  } else {
    const existing = systems[matchIndex];
    const facilities = nextFacility
      ? normalizeFacilities([...(existing.facilities || []), nextFacility], snapshot.state)
      : existing.facilities || [];
    systems[matchIndex] = normalizeSeedSystem(
      {
        ...existing,
        domain: normalizeOptionalString(domain) || existing.domain,
        seed_urls: [...(existing.seed_urls || []), ...normalizedSeedUrls],
        facilities,
      },
      snapshot.state,
    );
  }

  return saveStateSeedFile({
    state: snapshot.state,
    systems,
  });
}

export async function replaceSystemSeedUrlsInFile({
  state,
  systemName,
  domain = null,
  seedUrls = [],
}) {
  const snapshot = await readStateSeedFile(state);
  const normalizedSystemName = normalizeString(systemName);
  const normalizedSeedUrls = normalizeSeedUrls(seedUrls);

  if (!normalizedSystemName) {
    throw new Error('systemName is required to replace system seed URLs in the seed file.');
  }

  const systems = [...snapshot.systems];
  const matchIndex = systems.findIndex(
    (system) =>
      system.system_name.toLowerCase() === normalizedSystemName.toLowerCase() ||
      (domain && system.domain && system.domain.toLowerCase() === String(domain).toLowerCase()),
  );

  if (matchIndex === -1) {
    if (normalizedSeedUrls.length === 0) {
      return snapshot;
    }

    systems.push(
      normalizeSeedSystem(
        {
          system_name: normalizedSystemName,
          state: snapshot.state,
          domain,
          seed_urls: normalizedSeedUrls,
          facilities: [],
        },
        snapshot.state,
      ),
    );
  } else {
    systems[matchIndex] = normalizeSeedSystem(
      {
        ...systems[matchIndex],
        domain: normalizeOptionalString(domain) || systems[matchIndex].domain,
        seed_urls: normalizedSeedUrls,
      },
      snapshot.state,
    );
  }

  return saveStateSeedFile({
    state: snapshot.state,
    systems,
  });
}
