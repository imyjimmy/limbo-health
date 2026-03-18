import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.resolve(__dirname, '../db/schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
const testDatabaseUrl = process.env.RECORDS_WORKFLOW_TEST_DATABASE_URL || null;

test('schema allows shared URLs across state-scoped systems', { skip: !testDatabaseUrl }, async () => {
  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';

  const databaseName = `records_workflow_test_${Date.now().toString(36)}`;
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
        ['Regional Health', 'regional-health.example', 'TX']
      )
    ).rows[0].id;

    const maSystem = (
      await client.query(
        `insert into hospital_systems (system_name, canonical_domain, state)
         values ($1, $2, $3)
         returning id`,
        ['Regional Health', 'regional-health.example', 'MA']
      )
    ).rows[0].id;

    await assert.rejects(
      client.query(
        `insert into hospital_systems (system_name, canonical_domain, state)
         values ($1, $2, $3)`,
        ['Regional Health', 'regional-health.example', 'TX']
      )
    );

    await client.query(
      `insert into seed_urls (hospital_system_id, facility_id, url, seed_type, active)
       values ($1, null, $2, 'system_records_page', true)`,
      [txSystem, 'https://shared.example/medical-records']
    );
    await client.query(
      `insert into seed_urls (hospital_system_id, facility_id, url, seed_type, active)
       values ($1, null, $2, 'system_records_page', true)`,
      [maSystem, 'https://shared.example/medical-records']
    );

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
       values ($1, null, $2, 'html', $3, now(), 200, $4, $5, $6, 'v1')`,
      [
        txSystem,
        'https://shared.example/medical-records',
        'Shared Medical Records',
        'shared-hash',
        '/tmp/shared-tx.html',
        'Medical records request.'
      ]
    );
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
       values ($1, null, $2, 'html', $3, now(), 200, $4, $5, $6, 'v1')`,
      [
        maSystem,
        'https://shared.example/medical-records',
        'Shared Medical Records',
        'shared-hash',
        '/tmp/shared-ma.html',
        'Medical records request.'
      ]
    );

    const seedCount = await client.query(`select count(*)::int as count from seed_urls`);
    const sourceDocumentCount = await client.query(
      `select count(*)::int as count from source_documents`
    );

    assert.equal(seedCount.rows[0].count, 2);
    assert.equal(sourceDocumentCount.rows[0].count, 2);
  } finally {
    if (client) {
      await client.end();
    }

    await adminClient.query(
      `select pg_terminate_backend(pid)
       from pg_stat_activity
       where datname = $1
         and pid <> pg_backend_pid()`,
      [databaseName]
    );
    await adminClient.query(`drop database if exists ${databaseName}`);
    await adminClient.end();
  }
});
