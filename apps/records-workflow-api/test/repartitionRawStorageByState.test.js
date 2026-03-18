import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { promisify } from 'node:util';
import { execFile as execFileCallback } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const execFile = promisify(execFileCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceRoot = path.resolve(__dirname, '..');
const schemaPath = path.resolve(serviceRoot, 'db/schema.sql');
const scriptPath = path.resolve(serviceRoot, 'src/repartitionRawStorageByState.js');
const testDatabaseUrl = process.env.RECORDS_WORKFLOW_TEST_DATABASE_URL || null;

test('repartitionRawStorageByState moves raw PDFs into state subdirectories and updates DB paths', { skip: !testDatabaseUrl }, async () => {
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const tempRawDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-workflow-partition-'));

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';

  const databaseName = `records_workflow_partition_${Date.now().toString(36)}`;
  const targetUrl = new URL(testDatabaseUrl);
  targetUrl.pathname = `/${databaseName}`;

  const adminClient = new Client({ connectionString: adminUrl.toString() });
  let client = null;

  await adminClient.connect();

  try {
    await adminClient.query(`create database ${databaseName}`);

    client = new Client({ connectionString: targetUrl.toString() });
    await client.connect();
    await client.query(schemaSql);

    const txSystem = (
      await client.query(
        `insert into hospital_systems (system_name, canonical_domain, state)
         values ($1, $2, $3)
         returning id`,
        ['Texas Health', 'texas.example', 'TX']
      )
    ).rows[0].id;

    const maSystem = (
      await client.query(
        `insert into hospital_systems (system_name, canonical_domain, state)
         values ($1, $2, $3)
         returning id`,
        ['Mass General Brigham', 'massgeneralbrigham.org', 'MA']
      )
    ).rows[0].id;

    const txRawPath = path.join(tempRawDir, 'tx-form.pdf');
    const maRawPath = path.join(tempRawDir, 'ma-form.pdf');
    await fs.writeFile(txRawPath, 'texas-pdf');
    await fs.writeFile(maRawPath, 'massachusetts-pdf');

    await client.query(
      `insert into source_documents (
         hospital_system_id,
         facility_id,
         source_url,
         source_type,
         title,
         fetched_at,
         http_status,
         content_hash,
         storage_path,
         extracted_text,
         parser_version
       )
       values
         ($1, null, $2, 'pdf', 'TX PDF', now(), 200, 'tx-hash', $3, 'TX form', 'v1'),
         ($4, null, $5, 'pdf', 'MA PDF', now(), 200, 'ma-hash', $6, 'MA form', 'v1')`,
      [
        txSystem,
        'https://texas.example/form.pdf',
        txRawPath,
        maSystem,
        'https://massgeneralbrigham.org/form.pdf',
        maRawPath
      ]
    );

    const { stdout } = await execFile('node', [scriptPath, '--apply'], {
      cwd: serviceRoot,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl.toString(),
        RAW_STORAGE_DIR: tempRawDir
      }
    });

    const summary = JSON.parse(stdout.trim());
    assert.equal(summary.mode, 'apply');
    assert.equal(summary.moved_files, 2);
    assert.equal(summary.updated_source_documents, 2);

    const txPartitionedPath = path.join(tempRawDir, 'tx', 'tx-form.pdf');
    const maPartitionedPath = path.join(tempRawDir, 'ma', 'ma-form.pdf');

    await assert.rejects(fs.access(txRawPath));
    await assert.rejects(fs.access(maRawPath));
    await fs.access(txPartitionedPath);
    await fs.access(maPartitionedPath);

    const storagePaths = await client.query(
      `select hs.state, sd.storage_path
       from source_documents sd
       join hospital_systems hs on hs.id = sd.hospital_system_id
       order by hs.state asc`
    );

    assert.deepEqual(storagePaths.rows, [
      { state: 'MA', storage_path: maPartitionedPath },
      { state: 'TX', storage_path: txPartitionedPath }
    ]);
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }

    await adminClient.query(`drop database if exists ${databaseName} with (force)`);
    await adminClient.end();
    await fs.rm(tempRawDir, { recursive: true, force: true });
  }
});
