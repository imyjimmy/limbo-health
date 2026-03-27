import { query, withTransaction } from '../db.js';
import { replaceSystemSeedUrlsInFile } from './seedEditorService.js';
import { addTargetedPageToBlocklist } from './targetedPageBlocklistService.js';

async function loadTargetedPage(seedUrlId, client = null) {
  const q = client || { query };
  const result = await q.query(
    `select
       su.id,
       su.hospital_system_id,
       su.facility_id,
       su.url,
       su.seed_type,
       su.active,
       su.approved_by_human,
       su.evidence_note,
       hs.system_name,
       hs.state,
       hs.canonical_domain
     from seed_urls su
     join hospital_systems hs on hs.id = su.hospital_system_id
     where su.id = $1
     limit 1`,
    [seedUrlId],
  );

  return result.rows[0] || null;
}

async function listActiveSystemLevelSeedUrls(hospitalSystemId, client = null) {
  const q = client || { query };
  const result = await q.query(
    `select url
     from seed_urls
     where hospital_system_id = $1
       and active = true
       and facility_id is null
     order by created_at asc`,
    [hospitalSystemId],
  );

  return result.rows.map((row) => row.url).filter(Boolean);
}

async function syncSystemLevelSeedFile(targetedPage, client = null) {
  if (!targetedPage?.hospital_system_id || targetedPage?.facility_id) {
    return null;
  }

  const activeSeedUrls = await listActiveSystemLevelSeedUrls(targetedPage.hospital_system_id, client);
  return replaceSystemSeedUrlsInFile({
    state: targetedPage.state,
    systemName: targetedPage.system_name,
    domain: targetedPage.canonical_domain || null,
    seedUrls: activeSeedUrls,
  });
}

export async function activateTargetedPage(seedUrlId) {
  const result = await withTransaction(async (client) => {
    const current = await loadTargetedPage(seedUrlId, client);
    if (!current) {
      throw new Error('Targeted page not found.');
    }

    const updateResult = await client.query(
      `update seed_urls
       set active = true,
           approved_by_human = true
       where id = $1
       returning id, active, approved_by_human`,
      [seedUrlId],
    );

    const updated = {
      ...current,
      ...updateResult.rows[0],
    };
    return {
      targeted_page: updated,
      sync_seed_file: !updated.facility_id,
    };
  });

  if (!result.sync_seed_file) {
    return {
      targeted_page: result.targeted_page,
      seed_file: null,
    };
  }

  const seedFile = await syncSystemLevelSeedFile(result.targeted_page);
  return {
    targeted_page: result.targeted_page,
    seed_file: seedFile
      ? {
          state: seedFile.state,
          seed_file_path: seedFile.seed_file_path,
          counts: seedFile.counts,
        }
      : null,
  };
}

export async function retireTargetedPage(seedUrlId) {
  const result = await withTransaction(async (client) => {
    const current = await loadTargetedPage(seedUrlId, client);
    if (!current) {
      throw new Error('Targeted page not found.');
    }

    const updateResult = await client.query(
      `update seed_urls
       set active = false
       where id = $1
       returning id, active, approved_by_human`,
      [seedUrlId],
    );

    const updated = {
      ...current,
      ...updateResult.rows[0],
    };
    return {
      targeted_page: updated,
      sync_seed_file: !updated.facility_id,
    };
  });

  if (!result.sync_seed_file) {
    return {
      targeted_page: result.targeted_page,
      seed_file: null,
    };
  }

  const seedFile = await syncSystemLevelSeedFile(result.targeted_page);
  return {
    targeted_page: result.targeted_page,
    seed_file: seedFile
      ? {
          state: seedFile.state,
          seed_file_path: seedFile.seed_file_path,
          counts: seedFile.counts,
        }
      : null,
  };
}

export async function deleteTargetedPage(seedUrlId) {
  const result = await withTransaction(async (client) => {
    const current = await loadTargetedPage(seedUrlId, client);
    if (!current) {
      throw new Error('Targeted page not found.');
    }

    await client.query(`delete from seed_urls where id = $1`, [seedUrlId]);
    return {
      deleted_targeted_page: current,
      sync_seed_file: !current.facility_id,
    };
  });

  await addTargetedPageToBlocklist({
    state: result.deleted_targeted_page.state,
    hospitalSystemId: result.deleted_targeted_page.hospital_system_id,
    facilityId: result.deleted_targeted_page.facility_id || null,
    systemName: result.deleted_targeted_page.system_name,
    url: result.deleted_targeted_page.url,
  });

  let seedFile = null;
  if (result.sync_seed_file) {
    seedFile = await syncSystemLevelSeedFile(result.deleted_targeted_page);
  }

  return {
    deleted_targeted_page: result.deleted_targeted_page,
    seed_file: seedFile
      ? {
          state: seedFile.state,
          seed_file_path: seedFile.seed_file_path,
          counts: seedFile.counts,
        }
      : null,
  };
}
