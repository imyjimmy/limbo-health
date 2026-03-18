import fs from 'node:fs/promises';
import { config, resolveFromServiceRoot } from '../config.js';
import { withTransaction } from '../db.js';
import {
  upsertFacility,
  upsertHospitalSystem,
  upsertSeedUrl
} from '../repositories/workflowRepository.js';
import { normalizeStateCode } from '../utils/states.js';

export const STATE_SEED_FILES = {
  TX: 'seeds/texas-systems.json',
  MA: 'seeds/massachusetts-systems.json',
  NH: 'seeds/new-hampshire-systems.json',
  RI: 'seeds/rhode-island-systems.json',
  DE: 'seeds/delaware-systems.json',
  VT: 'seeds/vermont-systems.json'
};

function inferSeedType(url) {
  if (/mychart|myhealthone|mybilh|mytuftsmed|mybaystate|mychildren|portal|gateway/i.test(url)) {
    return 'portal_page';
  }
  if (/forms?|authorization|release|roi/i.test(url)) return 'forms_page';
  if (/locations|facility|medical-records/i.test(url)) return 'facility_records_page';
  if (/directory/i.test(url)) return 'directory_page';
  return 'system_records_page';
}

function normalizeSeedOptions(input) {
  if (typeof input === 'string') {
    return {
      seedFilePath: input,
      state: null
    };
  }

  return {
    seedFilePath: input?.seedFilePath || null,
    state: normalizeStateCode(input?.state)
  };
}

export function resolveSeedFilePath(input = {}) {
  const { seedFilePath, state } = normalizeSeedOptions(input);

  if (seedFilePath) {
    return resolveFromServiceRoot(seedFilePath, seedFilePath);
  }

  if (state) {
    const mapped = STATE_SEED_FILES[state];
    if (!mapped) {
      throw new Error(`No seed file configured for state: ${state}`);
    }
    return resolveFromServiceRoot(mapped, mapped);
  }

  return config.seedFile;
}

async function readSeedFile(input = {}) {
  const seedFilePath = resolveSeedFilePath(input);
  const raw = await fs.readFile(seedFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('Seed file must contain a JSON array.');
  }
  return parsed;
}

export async function reseedFromFile(input = {}) {
  const systems = await readSeedFile(input);

  const summary = {
    systems: 0,
    facilities: 0,
    seeds: 0
  };

  for (const system of systems) {
    await withTransaction(async (client) => {
      const upserted = await upsertHospitalSystem(
        {
          systemName: system.system_name,
          domain: system.domain,
          state: normalizeStateCode(system.state) || 'TX'
        },
        client
      );

      summary.systems += 1;

      const facilityMap = new Map();
      for (const facility of system.facilities || []) {
        const facilityId = await upsertFacility(
          {
            hospitalSystemId: upserted.id,
            facilityName: facility.facility_name,
            city: facility.city || null,
            state: normalizeStateCode(facility.state) || 'TX',
            facilityType: facility.facility_type || null,
            facilityPageUrl: facility.facility_page_url || null,
            externalFacilityId: facility.external_facility_id || null
          },
          client
        );

        summary.facilities += 1;
        facilityMap.set(facility.facility_name, facilityId);
      }

      if (facilityMap.size === 0) {
        const defaultFacilityId = await upsertFacility(
          {
            hospitalSystemId: upserted.id,
            facilityName: system.system_name,
            city: null,
            state: normalizeStateCode(system.state) || 'TX',
            facilityType: 'system_default',
            facilityPageUrl: null,
            externalFacilityId: null
          },
          client
        );
        summary.facilities += 1;
        facilityMap.set(system.system_name, defaultFacilityId);
      }

      for (const url of system.seed_urls || []) {
        const isFacilitySeed = /\/locations\//i.test(url);
        let facilityId = null;

        if (isFacilitySeed && facilityMap.size > 0) {
          const first = Array.from(facilityMap.values())[0];
          facilityId = first;
        }

        await upsertSeedUrl(
          {
            hospitalSystemId: upserted.id,
            facilityId,
            url,
            seedType: inferSeedType(url),
            active: true
          },
          client
        );

        summary.seeds += 1;
      }
    });
  }

  return summary;
}
