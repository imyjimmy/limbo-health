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
const scriptPath = path.resolve(serviceRoot, 'src/resetCrawlState.js');
const testDatabaseUrl = process.env.RECORDS_WORKFLOW_TEST_DATABASE_URL || null;

async function createTempFile(rootDir, name, contents) {
  const filePath = path.join(rootDir, name);
  await fs.writeFile(filePath, contents);
  return filePath;
}

test('reset:crawl-state deletes Massachusetts crawl artifacts and preserves Texas data', { skip: !testDatabaseUrl }, async () => {
  const schemaSql = await fs.readFile(schemaPath, 'utf8');
  const tempRawDir = await fs.mkdtemp(path.join(os.tmpdir(), 'records-workflow-reset-'));

  const adminUrl = new URL(testDatabaseUrl);
  adminUrl.pathname = '/postgres';

  const databaseName = `records_workflow_reset_${Date.now().toString(36)}`;
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

    const txFacility = (
      await client.query(
        `insert into facilities (hospital_system_id, facility_name, city, state)
         values ($1, $2, $3, $4)
         returning id`,
        [txSystem, 'Texas General Hospital', 'Dallas', 'TX']
      )
    ).rows[0].id;

    const maFacility = (
      await client.query(
        `insert into facilities (hospital_system_id, facility_name, city, state)
         values ($1, $2, $3, $4)
         returning id`,
        [maSystem, 'Salem Hospital', 'Salem', 'MA']
      )
    ).rows[0].id;

    await client.query(
      `insert into seed_urls (hospital_system_id, facility_id, url, seed_type, active)
       values ($1, $2, $3, 'system_records_page', true),
              ($4, $5, $6, 'system_records_page', true)`,
      [
        txSystem,
        txFacility,
        'https://texas.example/medical-records',
        maSystem,
        maFacility,
        'https://massgeneralbrigham.org/en/patient-care/patient-visitor-information/medical-records'
      ]
    );

    await client.query(
      `insert into portal_profiles (
         hospital_system_id,
         facility_id,
         portal_name,
         portal_url,
         portal_scope,
         supports_formal_copy_request_in_portal
       )
       values
         ($1, $2, 'Texas Portal', 'https://texas.example/portal', 'partial', false),
         ($3, $4, 'MGB Portal', 'https://massgeneralbrigham.org/patient-gateway', 'partial', false)`,
      [txSystem, txFacility, maSystem, maFacility]
    );

    const txWorkflow = (
      await client.query(
        `insert into records_workflows (
           hospital_system_id,
           facility_id,
           workflow_type,
           official_page_url,
           request_scope,
           formal_request_required,
           online_request_available,
           portal_request_available,
           email_available,
           fax_available,
           mail_available,
           in_person_available,
           phone_available,
           turnaround_notes,
           fee_notes,
           special_instructions,
           confidence,
           last_verified_at,
           content_hash
         )
         values (
           $1, $2, 'medical_records', $3, 'complete_chart', true, false, false, false, true, true, false, false,
           null, null, null, 'high', now(), 'tx-workflow'
         )
         returning id`,
        [txSystem, txFacility, 'https://texas.example/medical-records']
      )
    ).rows[0].id;

    const maWorkflow = (
      await client.query(
        `insert into records_workflows (
           hospital_system_id,
           facility_id,
           workflow_type,
           official_page_url,
           request_scope,
           formal_request_required,
           online_request_available,
           portal_request_available,
           email_available,
           fax_available,
           mail_available,
           in_person_available,
           phone_available,
           turnaround_notes,
           fee_notes,
           special_instructions,
           confidence,
           last_verified_at,
           content_hash
         )
         values (
           $1, $2, 'medical_records', $3, 'complete_chart', true, false, false, false, true, true, false, false,
           null, null, null, 'high', now(), 'ma-workflow'
         )
         returning id`,
        [
          maSystem,
          maFacility,
          'https://massgeneralbrigham.org/en/patient-care/patient-visitor-information/medical-records'
        ]
      )
    ).rows[0].id;

    await client.query(
      `insert into workflow_contacts (records_workflow_id, contact_type, value)
       values ($1, 'phone', '111-111-1111'),
              ($2, 'phone', '222-222-2222')`,
      [txWorkflow, maWorkflow]
    );

    await client.query(
      `insert into workflow_forms (records_workflow_id, form_name, form_url, form_format, language)
       values
         ($1, 'TX Form', 'https://texas.example/form.pdf', 'pdf', 'EN'),
         ($2, 'MA Form', 'https://massgeneralbrigham.org/content/dam/mgb-global/en/patient-care/patient-and-visitor-information/medical-records/documents/sh/medical-records-release-slm-portuguese.pdf', 'pdf', 'PT')`,
      [txWorkflow, maWorkflow]
    );

    await client.query(
      `insert into workflow_instructions (records_workflow_id, instruction_kind, sequence_no, details)
       values
         ($1, 'step', 1, 'Texas instruction'),
         ($2, 'step', 1, 'Massachusetts instruction')`,
      [txWorkflow, maWorkflow]
    );

    const txRawPath = await createTempFile(tempRawDir, 'tx-form.pdf', 'tx');
    const maRawPath = await createTempFile(tempRawDir, 'ma-form.pdf', 'ma');
    const maHtmlPath = await createTempFile(tempRawDir, 'ma-page.html', '<html>ma</html>');

    const txSourceDocument = (
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
         values ($1, $2, $3, 'pdf', 'TX PDF', now(), 200, 'tx-hash', $4, 'TX records request', 'v1')
         returning id`,
        [txSystem, txFacility, 'https://texas.example/form.pdf', txRawPath]
      )
    ).rows[0].id;

    const maPdfSourceDocument = (
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
         values ($1, $2, $3, 'pdf', 'MA PDF', now(), 200, 'ma-pdf-hash', $4, 'MA records request', 'v1')
         returning id`,
        [
          maSystem,
          maFacility,
          'https://massgeneralbrigham.org/content/dam/mgb-global/en/patient-care/patient-visitor-information/medical-records/documents/sh/medical-records-release-slm-portuguese.pdf',
          maRawPath
        ]
      )
    ).rows[0].id;

    const maHtmlSourceDocument = (
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
         values ($1, $2, $3, 'html', 'MA HTML', now(), 200, 'ma-html-hash', $4, 'MA html records page', 'v1')
         returning id`,
        [
          maSystem,
          maFacility,
          'https://massgeneralbrigham.org/en/patient-care/patient-visitor-information/medical-records',
          maHtmlPath
        ]
      )
    ).rows[0].id;

    await client.query(
      `insert into extraction_runs (source_document_id, extractor_name, extractor_version, status, structured_output)
       values
         ($1, 'workflow_extractor', 'v1', 'success', '{}'::jsonb),
         ($2, 'workflow_extractor', 'v1', 'success', '{}'::jsonb),
         ($3, 'workflow_extractor', 'v1', 'partial', '{}'::jsonb)`,
      [txSourceDocument, maPdfSourceDocument, maHtmlSourceDocument]
    );

    await execFile('node', [scriptPath, '--state', 'MA', '--include-derived'], {
      cwd: serviceRoot,
      env: {
        ...process.env,
        DATABASE_URL: targetUrl.toString()
      }
    });

    const hospitalSystemsCount = await client.query(`select count(*)::int as count from hospital_systems`);
    const facilitiesCount = await client.query(`select count(*)::int as count from facilities`);
    const seedUrlsCount = await client.query(`select count(*)::int as count from seed_urls`);
    const portalProfiles = await client.query(`select count(*)::int as count from portal_profiles`);
    const recordsWorkflows = await client.query(`select count(*)::int as count from records_workflows`);
    const workflowContacts = await client.query(`select count(*)::int as count from workflow_contacts`);
    const workflowForms = await client.query(`select count(*)::int as count from workflow_forms`);
    const workflowInstructions = await client.query(`select count(*)::int as count from workflow_instructions`);
    const sourceDocuments = await client.query(`select count(*)::int as count from source_documents`);
    const extractionRuns = await client.query(`select count(*)::int as count from extraction_runs`);

    assert.equal(hospitalSystemsCount.rows[0].count, 2);
    assert.equal(facilitiesCount.rows[0].count, 2);
    assert.equal(seedUrlsCount.rows[0].count, 2);
    assert.equal(portalProfiles.rows[0].count, 1);
    assert.equal(recordsWorkflows.rows[0].count, 1);
    assert.equal(workflowContacts.rows[0].count, 1);
    assert.equal(workflowForms.rows[0].count, 1);
    assert.equal(workflowInstructions.rows[0].count, 1);
    assert.equal(sourceDocuments.rows[0].count, 1);
    assert.equal(extractionRuns.rows[0].count, 1);

    await fs.access(txRawPath);
    await assert.rejects(fs.access(maRawPath));
    await assert.rejects(fs.access(maHtmlPath));
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
    await fs.rm(tempRawDir, { recursive: true, force: true });
  }
});
