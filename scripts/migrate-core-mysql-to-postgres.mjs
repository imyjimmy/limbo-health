#!/usr/bin/env node

import mysql from 'mysql2/promise';
import pg from 'pg';
import { applyCoreSchema } from '../packages/core-db/bootstrap.mjs';
import { resolveCoreDatabaseUrl } from '../packages/core-db/config.mjs';

const { Client } = pg;

const CORE_TABLES = [
  'roles',
  'users',
  'oauth_connections',
  'user_settings',
  'repositories',
  'repository_access',
  'scan_sessions',
  'provider_profiles',
  'service_categories',
  'services',
  'services_providers',
  'appointments',
  'blocked_periods',
  'invoices',
  'secretaries_providers',
  'consents',
  'settings',
  'webhooks',
  'migrations',
];

const IMPORT_ORDER = [
  'roles',
  'users',
  'oauth_connections',
  'user_settings',
  'repositories',
  'repository_access',
  'scan_sessions',
  'provider_profiles',
  'service_categories',
  'services',
  'services_providers',
  'appointments',
  'blocked_periods',
  'invoices',
  'secretaries_providers',
  'consents',
  'settings',
  'webhooks',
  'migrations',
];

const IDENTITY_TABLES = [
  'roles',
  'users',
  'oauth_connections',
  'repository_access',
  'scan_sessions',
  'service_categories',
  'services',
  'appointments',
  'blocked_periods',
  'invoices',
  'consents',
  'settings',
  'webhooks',
];

const BOOLEAN_COLUMNS = new Set([
  'roles.is_admin',
  'users.is_private',
  'user_settings.notifications',
  'user_settings.google_sync',
  'user_settings.caldav_sync',
  'scan_sessions.is_revoked',
  'services.is_private',
  'appointments.is_unavailability',
  'webhooks.is_ssl_verified',
]);

const JSON_COLUMNS = new Set([
  'provider_profiles.languages',
  'provider_profiles.board_certifications',
  'provider_profiles.working_plan',
]);

const DATEISH_COLUMNS = new Set([
  'roles.create_datetime',
  'roles.update_datetime',
  'users.create_datetime',
  'users.update_datetime',
  'oauth_connections.token_expires_at',
  'oauth_connections.created_at',
  'oauth_connections.updated_at',
  'repositories.created_at',
  'repositories.updated_at',
  'repository_access.created_at',
  'scan_sessions.created_at',
  'scan_sessions.expires_at',
  'provider_profiles.license_issued_date',
  'provider_profiles.license_expiration_date',
  'provider_profiles.registration_date',
  'provider_profiles.created_at',
  'provider_profiles.updated_at',
  'service_categories.create_datetime',
  'service_categories.update_datetime',
  'services.create_datetime',
  'services.update_datetime',
  'appointments.create_datetime',
  'appointments.update_datetime',
  'appointments.book_datetime',
  'appointments.start_datetime',
  'appointments.end_datetime',
  'blocked_periods.create_datetime',
  'blocked_periods.update_datetime',
  'blocked_periods.start_datetime',
  'blocked_periods.end_datetime',
  'invoices.created_at',
  'invoices.paid_at',
  'consents.create_datetime',
  'consents.update_datetime',
  'consents.created',
  'consents.modified',
  'settings.create_datetime',
  'settings.update_datetime',
  'webhooks.create_datetime',
  'webhooks.update_datetime',
]);

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function resolveSourceMySqlConfig(env = process.env) {
  if (env.SOURCE_MYSQL_URL) {
    const url = new URL(env.SOURCE_MYSQL_URL);
    return {
      host: url.hostname,
      port: Number.parseInt(url.port || '3306', 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    };
  }

  const host = env.SOURCE_MYSQL_HOST;
  const user = env.SOURCE_MYSQL_USER;
  const database = env.SOURCE_MYSQL_DATABASE;

  if (!host || !user || !database) {
    throw new Error(
      'Missing source MySQL config. Set SOURCE_MYSQL_URL or SOURCE_MYSQL_HOST, SOURCE_MYSQL_USER, and SOURCE_MYSQL_DATABASE.',
    );
  }

  return {
    host,
    port: Number.parseInt(env.SOURCE_MYSQL_PORT || '3306', 10),
    user,
    password: env.SOURCE_MYSQL_PASSWORD || '',
    database,
  };
}

function normalizeBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (Buffer.isBuffer(value)) return value[0] !== 0;

  const lowered = String(value).trim().toLowerCase();
  if (lowered === '') return null;
  if (['1', 'true', 't', 'yes', 'y'].includes(lowered)) return true;
  if (['0', 'false', 'f', 'no', 'n'].includes(lowered)) return false;

  throw new Error(`Unable to normalize boolean value: ${value}`);
}

function normalizeJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;

  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function normalizeDateish(table, column, value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;

  const stringValue = String(value);
  if (stringValue.startsWith('0000-00-00')) {
    return null;
  }

  return value;
}

function normalizeValue(table, column, value) {
  if (value === undefined) return null;

  const key = `${table}.${column}`;

  if (BOOLEAN_COLUMNS.has(key)) {
    return normalizeBoolean(value);
  }

  if (JSON_COLUMNS.has(key)) {
    return normalizeJson(value);
  }

  if (DATEISH_COLUMNS.has(key)) {
    return normalizeDateish(table, column, value);
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return value;
}

function buildInsertStatement(table, columns, rowCount) {
  const placeholders = [];
  let parameterIndex = 1;

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowPlaceholders = [];
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
      rowPlaceholders.push(`$${parameterIndex}`);
      parameterIndex += 1;
    }
    placeholders.push(`(${rowPlaceholders.join(', ')})`);
  }

  return `insert into ${quoteIdent(table)} (${columns.map(quoteIdent).join(', ')}) values ${placeholders.join(', ')}`;
}

async function getTableColumns(mysqlPool, table) {
  const [columns] = await mysqlPool.query(`SHOW COLUMNS FROM \`${table}\``);
  return columns.map((column) => column.Field);
}

async function fetchTableRows(mysqlPool, table) {
  const [rows] = await mysqlPool.query(`SELECT * FROM \`${table}\``);
  return rows;
}

async function insertBatch(pgClient, table, columns, rows) {
  if (rows.length === 0) return;

  const sql = buildInsertStatement(table, columns, rows.length);
  const values = [];

  for (const row of rows) {
    for (const column of columns) {
      values.push(row[column]);
    }
  }

  await pgClient.query(sql, values);
}

async function importTable(mysqlPool, pgClient, table, batchSize = 250) {
  const columns = await getTableColumns(mysqlPool, table);
  const sourceRows = await fetchTableRows(mysqlPool, table);
  const normalizedRows = sourceRows.map((sourceRow) => {
    const normalizedRow = {};
    for (const column of columns) {
      normalizedRow[column] = normalizeValue(table, column, sourceRow[column]);
    }
    return normalizedRow;
  });

  for (let start = 0; start < normalizedRows.length; start += batchSize) {
    const batch = normalizedRows.slice(start, start + batchSize);
    await insertBatch(pgClient, table, columns, batch);
  }

  return normalizedRows.length;
}

async function resetIdentitySequence(pgClient, table) {
  const result = await pgClient.query(`select coalesce(max(id), 0) as max_id from ${quoteIdent(table)}`);
  const maxId = Number(result.rows[0]?.max_id || 0);

  if (maxId > 0) {
    await pgClient.query(`select setval(pg_get_serial_sequence('${table}', 'id'), ${maxId}, true)`);
    return;
  }

  await pgClient.query(`select setval(pg_get_serial_sequence('${table}', 'id'), 1, false)`);
}

async function verifyCounts(mysqlPool, pgClient) {
  const mismatches = [];

  for (const table of CORE_TABLES) {
    const [sourceResult] = await mysqlPool.query(`select count(*) as count from \`${table}\``);
    const targetResult = await pgClient.query(`select count(*)::int as count from ${quoteIdent(table)}`);
    const sourceCount = Number(sourceResult[0]?.count || 0);
    const targetCount = Number(targetResult.rows[0]?.count || 0);

    if (sourceCount !== targetCount) {
      mismatches.push({ table, sourceCount, targetCount });
    }
  }

  if (mismatches.length > 0) {
    const details = mismatches
      .map(({ table, sourceCount, targetCount }) => `${table}: mysql=${sourceCount}, postgres=${targetCount}`)
      .join('; ');
    throw new Error(`Row count verification failed: ${details}`);
  }
}

async function main() {
  const sourceConfig = resolveSourceMySqlConfig();
  const targetConnectionString = resolveCoreDatabaseUrl();

  console.log('Starting core DB migration...');
  console.log(`Source MySQL: ${sourceConfig.host}:${sourceConfig.port}/${sourceConfig.database}`);
  console.log(`Target Postgres: ${new URL(targetConnectionString).host}${new URL(targetConnectionString).pathname}`);

  const mysqlPool = mysql.createPool({
    ...sourceConfig,
    waitForConnections: true,
    connectionLimit: 5,
    charset: 'utf8mb4',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });

  const pgClient = new Client({
    connectionString: targetConnectionString,
  });

  const importedCounts = {};

  try {
    await pgClient.connect();
    await applyCoreSchema(pgClient);

    await pgClient.query('begin');
    await pgClient.query(
      `truncate table ${CORE_TABLES.map(quoteIdent).join(', ')} restart identity cascade`,
    );

    for (const table of IMPORT_ORDER) {
      const count = await importTable(mysqlPool, pgClient, table);
      importedCounts[table] = count;
      console.log(`Imported ${count} rows into ${table}`);
    }

    for (const table of IDENTITY_TABLES) {
      await resetIdentitySequence(pgClient, table);
    }

    await verifyCounts(mysqlPool, pgClient);
    await pgClient.query('commit');

    console.log('Core DB migration complete.');
    console.table(importedCounts);
  } catch (error) {
    try {
      await pgClient.query('rollback');
    } catch {
      // Ignore rollback failures after a failed transaction.
    }
    throw error;
  } finally {
    await Promise.allSettled([mysqlPool.end(), pgClient.end()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
