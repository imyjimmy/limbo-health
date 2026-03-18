import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { closePool, query, withTransaction } from './db.js';
import { config } from './config.js';
import { toRawStorageRelativePath } from './utils/rawStorage.js';

function usage() {
  console.log(
    [
      'Usage:',
      '  node src/cleanupStaleCrawlData.js           # dry run',
      '  node src/cleanupStaleCrawlData.js --apply   # delete superseded crawl artifacts'
    ].join('\n')
  );
}

async function listStaleSourceDocuments() {
  const result = await query(
    `with ranked as (
       select
         hospital_system_id,
         id,
         source_url,
         storage_path,
         fetched_at,
         row_number() over (
           partition by hospital_system_id, source_url
           order by fetched_at desc, created_at desc, id desc
         ) as rn
       from source_documents
     )
     select id, source_url, storage_path, fetched_at
     from ranked
     where rn > 1
     order by source_url asc, fetched_at desc`
  );

  return result.rows;
}

async function listReferencedRawFiles() {
  const result = await query(
    `select distinct storage_path
     from source_documents
     where storage_path is not null
       and storage_path <> ''`
  );

  return new Set(
    result.rows
      .map((row) => toRawStorageRelativePath(row.storage_path))
      .filter(Boolean)
  );
}

async function listStaleExtractionRuns() {
  const result = await query(
    `with ranked as (
       select
         id,
         source_document_id,
         extractor_name,
         created_at,
         row_number() over (
           partition by source_document_id, extractor_name
           order by created_at desc, id desc
         ) as rn
       from extraction_runs
     )
     select id, source_document_id, extractor_name, created_at
     from ranked
     where rn > 1
     order by source_document_id asc, created_at desc`
  );

  return result.rows;
}

async function walkRawFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.name === '.gitkeep' || entry.name === '.DS_Store') {
      continue;
    }

    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkRawFiles(fullPath)));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

async function listRawFilesOnDisk() {
  await fs.mkdir(config.rawStorageDir, { recursive: true });
  const files = await walkRawFiles(config.rawStorageDir);
  return files.sort();
}

async function deleteStaleSourceDocuments(ids) {
  if (ids.length === 0) return 0;

  const result = await withTransaction(async (client) => {
    const deleted = await client.query(
      `delete from source_documents
       where id = any($1::uuid[])
       returning id`,
      [ids]
    );

    return deleted.rowCount;
  });

  return result;
}

async function deleteStaleExtractionRuns(ids) {
  if (ids.length === 0) return 0;

  const result = await withTransaction(async (client) => {
    const deleted = await client.query(
      `delete from extraction_runs
       where id = any($1::uuid[])
       returning id`,
      [ids]
    );

    return deleted.rowCount;
  });

  return result;
}

async function deleteOrphanRawFiles(orphanFiles) {
  let deleted = 0;

  for (const orphanFile of orphanFiles) {
    await fs.unlink(orphanFile.filePath);
    deleted += 1;
  }

  return deleted;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    usage();
    return;
  }

  const apply = args.has('--apply');
  const staleDocuments = await listStaleSourceDocuments();
  const staleExtractionRuns = await listStaleExtractionRuns();
  const staleIds = staleDocuments.map((row) => row.id);
  const staleExtractionRunIds = staleExtractionRuns.map((row) => row.id);
  const staleFilePaths = new Set(
    staleDocuments
      .map((row) => toRawStorageRelativePath(row.storage_path))
      .filter(Boolean)
  );

  let deletedSourceDocuments = 0;
  let deletedExtractionRuns = 0;
  if (apply) {
    deletedSourceDocuments = await deleteStaleSourceDocuments(staleIds);
    deletedExtractionRuns = await deleteStaleExtractionRuns(staleExtractionRunIds);
  }

  const referencedFiles = await listReferencedRawFiles();
  const rawFilesOnDisk = await listRawFilesOnDisk();
  const orphanRawFiles = rawFilesOnDisk
    .map((filePath) => ({
      filePath,
      relativePath: toRawStorageRelativePath(filePath)
    }))
    .filter((entry) => entry.relativePath && !referencedFiles.has(entry.relativePath));

  let deletedRawFiles = 0;
  if (apply) {
    deletedRawFiles = await deleteOrphanRawFiles(orphanRawFiles);
  }

  const summary = {
    mode: apply ? 'apply' : 'dry_run',
    stale_source_documents: staleDocuments.length,
    stale_extraction_runs: staleExtractionRuns.length,
    stale_raw_files: orphanRawFiles.length,
    deleted_source_documents: deletedSourceDocuments,
    deleted_extraction_runs: deletedExtractionRuns,
    deleted_raw_files: deletedRawFiles,
    stale_source_urls_sample: staleDocuments.slice(0, 10).map((row) => row.source_url),
    stale_raw_files_sample: orphanRawFiles.slice(0, 10).map((entry) => entry.relativePath),
    affected_raw_files_sample: [...staleFilePaths].slice(0, 10)
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('Stale crawl cleanup failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
