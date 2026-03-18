import fs from 'node:fs/promises';
import { query, withTransaction } from '../db.js';
import { resolveRawStoragePath } from '../utils/rawStorage.js';
import { normalizeStateCode } from '../utils/states.js';

async function deleteFileIfPresent(filePath) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }

    return false;
  }
}

async function listStoragePathsForState(state) {
  const result = await query(
    `select distinct sd.storage_path
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     where hs.state = $1
       and sd.storage_path is not null
       and sd.storage_path <> ''`,
    [state]
  );

  return result.rows.map((row) => row.storage_path).filter(Boolean);
}

async function listReferencedStoragePaths(storagePaths) {
  if (storagePaths.length === 0) {
    return new Set();
  }

  const result = await query(
    `select distinct storage_path
     from source_documents
     where storage_path = any($1::text[])`,
    [storagePaths]
  );

  return new Set(result.rows.map((row) => row.storage_path).filter(Boolean));
}

export async function resetCrawlState({ state = null, includeDerived = false } = {}) {
  const normalizedState = normalizeStateCode(state);
  if (!normalizedState) {
    throw new Error('resetCrawlState requires an explicit --state value.');
  }

  if (!includeDerived) {
    throw new Error('resetCrawlState currently requires --include-derived.');
  }

  const candidateStoragePaths = await listStoragePathsForState(normalizedState);

  const deleted = await withTransaction(async (client) => {
    const deletedPortalProfiles = await client.query(
      `delete from portal_profiles pp
       using hospital_systems hs
       where pp.hospital_system_id = hs.id
         and hs.state = $1
       returning pp.id`,
      [normalizedState]
    );

    const deletedRecordsWorkflows = await client.query(
      `delete from records_workflows rw
       using hospital_systems hs
       where rw.hospital_system_id = hs.id
         and hs.state = $1
       returning rw.id`,
      [normalizedState]
    );

    const deletedSourceDocuments = await client.query(
      `delete from source_documents sd
       using hospital_systems hs
       where sd.hospital_system_id = hs.id
         and hs.state = $1
       returning sd.id`,
      [normalizedState]
    );

    return {
      deletedPortalProfiles: deletedPortalProfiles.rowCount,
      deletedRecordsWorkflows: deletedRecordsWorkflows.rowCount,
      deletedSourceDocuments: deletedSourceDocuments.rowCount
    };
  });

  const stillReferencedPaths = await listReferencedStoragePaths(candidateStoragePaths);
  let deletedRawFiles = 0;

  for (const storagePath of candidateStoragePaths) {
    if (!storagePath || stillReferencedPaths.has(storagePath)) continue;
    if (await deleteFileIfPresent(resolveRawStoragePath(storagePath))) {
      deletedRawFiles += 1;
    }
  }

  return {
    state: normalizedState,
    deleted_portal_profiles: deleted.deletedPortalProfiles,
    deleted_records_workflows: deleted.deletedRecordsWorkflows,
    deleted_source_documents: deleted.deletedSourceDocuments,
    deleted_raw_files: deletedRawFiles
  };
}
