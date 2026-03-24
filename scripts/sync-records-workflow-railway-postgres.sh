#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_PATH="${1:-$ROOT_DIR/railway-export/records-workflow/records-workflow.dump}"
BACKUP_DIR="${RAILWAY_RECORDS_WORKFLOW_BACKUP_DIR:-$ROOT_DIR/railway-export/backups}"
LOCAL_DATABASE_URL="${LOCAL_RECORDS_WORKFLOW_DATABASE_URL:-postgres://postgres:postgres@localhost:5433/records_workflow}"
RAILWAY_DATABASE_URL="${RAILWAY_RECORDS_WORKFLOW_DATABASE_URL:-}"
RAILWAY_DATABASE_SERVICE="${RAILWAY_RECORDS_WORKFLOW_POSTGRES_SERVICE:-}"
POSTGRES_CLIENT_IMAGE="${POSTGRES_CLIENT_IMAGE:-postgres:18-alpine}"
SKIP_RAILWAY_BACKUP="${SKIP_RAILWAY_RECORDS_WORKFLOW_BACKUP:-0}"

railway_args=()
if [[ -n "${RAILWAY_PROJECT_ID:-}" ]]; then
  railway_args+=("--project" "$RAILWAY_PROJECT_ID")
fi
if [[ -n "${RAILWAY_ENVIRONMENT_ID:-}" ]]; then
  railway_args+=("--environment" "$RAILWAY_ENVIRONMENT_ID")
fi

resolve_railway_url() {
  local service_name="$1"
  local variable_name="$2"
  local value

  if [[ ${#railway_args[@]} -gt 0 ]]; then
    value="$(
      railway run "${railway_args[@]}" \
        --service "$service_name" \
        --no-local \
        printenv "$variable_name" 2>/dev/null | tail -n 1
    )"
  else
    value="$(
      railway run \
        --service "$service_name" \
        --no-local \
        printenv "$variable_name" 2>/dev/null | tail -n 1
    )"
  fi

  if [[ "$value" =~ ^postgres(ql)?:// ]]; then
    printf '%s' "$value"
    return 0
  fi

  return 1
}

resolve_railway_database_url() {
  if [[ -n "$RAILWAY_DATABASE_URL" ]]; then
    printf '%s' "$RAILWAY_DATABASE_URL"
    return 0
  fi

  if ! command -v railway >/dev/null 2>&1; then
    echo "Railway CLI is required when RAILWAY_RECORDS_WORKFLOW_DATABASE_URL is not set." >&2
    exit 1
  fi

  local services_to_try=()
  if [[ -n "$RAILWAY_DATABASE_SERVICE" ]]; then
    services_to_try+=("$RAILWAY_DATABASE_SERVICE")
  else
    services_to_try+=("records-workflow-postgres" "Postgres")
  fi

  local service_name
  for service_name in "${services_to_try[@]}"; do
    if RAILWAY_DATABASE_URL="$(resolve_railway_url "$service_name" DATABASE_PUBLIC_URL)"; then
      RAILWAY_DATABASE_SERVICE="$service_name"
      printf '%s' "$RAILWAY_DATABASE_URL"
      return 0
    fi

    if RAILWAY_DATABASE_URL="$(resolve_railway_url "$service_name" DATABASE_URL)"; then
      RAILWAY_DATABASE_SERVICE="$service_name"
      printf '%s' "$RAILWAY_DATABASE_URL"
      return 0
    fi
  done

  echo "Unable to resolve Railway database URL. Tried services: ${services_to_try[*]}" >&2
  exit 1
}

backup_railway_database() {
  local backup_path="$BACKUP_DIR/railway-production-pre-sync-$(date +%Y%m%d%H%M%S).dump"
  local backup_file
  backup_file="$(basename "$backup_path")"

  mkdir -p "$BACKUP_DIR"

  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump \
      --format=custom \
      --no-owner \
      --no-privileges \
      --dbname="$RAILWAY_DATABASE_URL" \
      --file="$backup_path"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm \
      -e RAILWAY_DATABASE_URL="$RAILWAY_DATABASE_URL" \
      -e BACKUP_FILE="$backup_file" \
      -v "$BACKUP_DIR:/backups" \
      "$POSTGRES_CLIENT_IMAGE" \
      sh -lc 'pg_dump --format=custom --no-owner --no-privileges --dbname="$RAILWAY_DATABASE_URL" --file="/backups/$BACKUP_FILE"'
  else
    echo "pg_dump was not found and docker is unavailable." >&2
    exit 1
  fi

  printf '%s' "$backup_path"
}

verify_table_counts() {
  LOCAL_DATABASE_URL="$LOCAL_DATABASE_URL" \
  RAILWAY_DATABASE_URL="$RAILWAY_DATABASE_URL" \
  ROOT_DIR="$ROOT_DIR" \
  node <<'NODE'
const { Client } = require('pg');
const path = require('path');

function createClient(connectionString) {
  const isRailwayPublicProxy = /rlwy\.net|railway\.internal/.test(connectionString);
  return new Client({
    connectionString,
    ssl: isRailwayPublicProxy ? { rejectUnauthorized: false } : undefined,
  });
}

async function getTableCounts(client) {
  const { rows: tables } = await client.query(
    `select tablename
     from pg_tables
     where schemaname = 'public'
     order by tablename`
  );

  const counts = new Map();
  for (const { tablename } of tables) {
    const result = await client.query(`select count(*)::bigint as count from "${tablename}"`);
    counts.set(tablename, Number(result.rows[0].count));
  }

  return counts;
}

(async () => {
  const localClient = createClient(process.env.LOCAL_DATABASE_URL);
  const railwayClient = createClient(process.env.RAILWAY_DATABASE_URL);

  await localClient.connect();
  await railwayClient.connect();

  try {
    const [localCounts, railwayCounts] = await Promise.all([
      getTableCounts(localClient),
      getTableCounts(railwayClient),
    ]);

    const tableNames = Array.from(new Set([
      ...localCounts.keys(),
      ...railwayCounts.keys(),
    ])).sort();

    const mismatches = [];
    for (const tableName of tableNames) {
      const localCount = localCounts.has(tableName) ? localCounts.get(tableName) : null;
      const railwayCount = railwayCounts.has(tableName) ? railwayCounts.get(tableName) : null;

      if (localCount !== railwayCount) {
        mismatches.push({ tableName, localCount, railwayCount });
      }
    }

    if (mismatches.length > 0) {
      console.error('Railway row counts do not match local after sync.');
      for (const mismatch of mismatches) {
        console.error(`${mismatch.tableName}\tlocal=${mismatch.localCount}\trailway=${mismatch.railwayCount}`);
      }
      process.exit(1);
    }

    console.log(`Verified ${tableNames.length} public tables: Railway matches local row counts.`);
  } finally {
    await Promise.allSettled([localClient.end(), railwayClient.end()]);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
NODE
}

resolve_railway_database_url >/dev/null

if [[ "$SKIP_RAILWAY_BACKUP" != "1" ]]; then
  backup_path="$(backup_railway_database)"
  echo "Backed up Railway Postgres to $backup_path"
fi

"$ROOT_DIR/scripts/export-records-workflow-local-postgres.sh" "$DUMP_PATH"

RAILWAY_RECORDS_WORKFLOW_DATABASE_URL="$RAILWAY_DATABASE_URL" \
RAILWAY_RECORDS_WORKFLOW_POSTGRES_SERVICE="$RAILWAY_DATABASE_SERVICE" \
POSTGRES_CLIENT_IMAGE="$POSTGRES_CLIENT_IMAGE" \
"$ROOT_DIR/scripts/import-records-workflow-railway-postgres.sh" "$DUMP_PATH"

verify_table_counts

echo "Railway Postgres now reflects local records-workflow data."
