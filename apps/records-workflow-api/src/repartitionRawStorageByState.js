import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { closePool, query } from './db.js';
import { sha256 } from './utils/hash.js';
import {
  getRawStorageStateDir,
  rawStorageStateSegment,
  replaceRawStorageRelativePath,
  resolveRawStoragePath,
  toRawStorageRelativePath
} from './utils/rawStorage.js';

function usage() {
  console.log(
    [
      'Usage:',
      '  node src/repartitionRawStorageByState.js           # dry run',
      '  node src/repartitionRawStorageByState.js --apply   # move raw files into state subdirectories'
    ].join('\n')
  );
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function filesMatch(filePathA, filePathB) {
  const [bufferA, bufferB] = await Promise.all([fs.readFile(filePathA), fs.readFile(filePathB)]);
  return sha256(bufferA) === sha256(bufferB);
}

function summarizePath(filePath) {
  return toRawStorageRelativePath(filePath) || filePath;
}

async function listPartitionCandidates() {
  const result = await query(
    `select distinct
       hs.state,
       sd.storage_path
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     where sd.source_type = 'pdf'
       and sd.storage_path is not null
       and sd.storage_path <> ''
     order by hs.state asc, sd.storage_path asc`
  );

  return result.rows;
}

async function listCrossStateStoragePathConflicts() {
  const result = await query(
    `select
       sd.storage_path,
       array_agg(distinct hs.state order by hs.state) as states
     from source_documents sd
     join hospital_systems hs on hs.id = sd.hospital_system_id
     where sd.source_type = 'pdf'
       and sd.storage_path is not null
       and sd.storage_path <> ''
     group by sd.storage_path
     having count(distinct hs.state) > 1`
  );

  return result.rows;
}

async function updateStoragePath({ state, fromPath, toPath }) {
  const result = await query(
    `update source_documents sd
     set storage_path = $1
     from hospital_systems hs
     where sd.hospital_system_id = hs.id
       and hs.state = $2
       and sd.storage_path = $3`,
    [toPath, state, fromPath]
  );

  return result.rowCount;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    usage();
    return;
  }

  const apply = args.has('--apply');
  const crossStateConflicts = await listCrossStateStoragePathConflicts();
  if (crossStateConflicts.length > 0) {
    throw new Error(
      `Found storage paths shared across states: ${crossStateConflicts
        .map((row) => `${row.storage_path} (${row.states.join(', ')})`)
        .join('; ')}`
    );
  }

  const candidates = await listPartitionCandidates();
  let movedFiles = 0;
  let updatedSourceDocuments = 0;
  let alreadyPartitioned = 0;
  let missingOnDisk = 0;
  const samples = [];

  for (const candidate of candidates) {
    const originalStoragePath = candidate.storage_path;
    const currentPath = resolveRawStoragePath(originalStoragePath);
    const targetDirectory = getRawStorageStateDir(candidate.state);
    const targetPath = path.join(targetDirectory, path.basename(currentPath));
    const targetRelativePath = `${rawStorageStateSegment(candidate.state)}/${path.basename(currentPath)}`;
    const targetStoragePath = replaceRawStorageRelativePath(originalStoragePath, targetRelativePath);

    if (originalStoragePath === targetStoragePath && currentPath === targetPath) {
      alreadyPartitioned += 1;
      continue;
    }

    const currentExists = await fileExists(currentPath);
    const targetExists = await fileExists(targetPath);

    if (!currentExists && !targetExists) {
      missingOnDisk += 1;
      continue;
    }

    if (apply) {
      await fs.mkdir(targetDirectory, { recursive: true });
    }

    if (currentExists && !targetExists) {
      if (apply) {
        await fs.rename(currentPath, targetPath);
      }
      movedFiles += 1;
    } else if (currentExists && targetExists) {
      if (!(await filesMatch(currentPath, targetPath))) {
        throw new Error(`Refusing to overwrite existing file with different contents: ${targetPath}`);
      }

      if (apply) {
        await fs.unlink(currentPath);
      }
    }

    if (originalStoragePath !== targetStoragePath) {
      if (apply) {
        updatedSourceDocuments += await updateStoragePath({
          state: candidate.state,
          fromPath: originalStoragePath,
          toPath: targetStoragePath
        });
      }

      if (samples.length < 10) {
        samples.push({
          state: candidate.state,
          from: summarizePath(originalStoragePath),
          to: summarizePath(targetStoragePath)
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry_run',
        candidates: candidates.length,
        moved_files: movedFiles,
        updated_source_documents: updatedSourceDocuments,
        already_partitioned: alreadyPartitioned,
        missing_on_disk: missingOnDisk,
        changes_sample: samples
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error('Raw storage repartition failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
