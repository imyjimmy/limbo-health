#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DUMP_PATH="${1:-$ROOT_DIR/railway-export/records-workflow/records-workflow.dump}"
RAILWAY_DATABASE_URL="${RAILWAY_RECORDS_WORKFLOW_DATABASE_URL:-}"
RAILWAY_DATABASE_SERVICE="${RAILWAY_RECORDS_WORKFLOW_POSTGRES_SERVICE:-records-workflow-postgres}"

railway_args=()
if [[ -n "${RAILWAY_PROJECT_ID:-}" ]]; then
  railway_args+=("--project" "$RAILWAY_PROJECT_ID")
fi
if [[ -n "${RAILWAY_ENVIRONMENT_ID:-}" ]]; then
  railway_args+=("--environment" "$RAILWAY_ENVIRONMENT_ID")
fi

if [[ ! -f "$DUMP_PATH" ]]; then
  echo "Dump file not found: $DUMP_PATH" >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "pg_restore is required to import the dump." >&2
  exit 1
fi

if [[ -z "$RAILWAY_DATABASE_URL" ]]; then
  if ! command -v railway >/dev/null 2>&1; then
    echo "Railway CLI is required when RAILWAY_RECORDS_WORKFLOW_DATABASE_URL is not set." >&2
    exit 1
  fi

  RAILWAY_DATABASE_URL="$(
    railway run "${railway_args[@]}" \
      --service "$RAILWAY_DATABASE_SERVICE" \
      --no-local \
      printenv DATABASE_URL | tail -n 1
  )"
fi

if [[ -z "$RAILWAY_DATABASE_URL" ]]; then
  echo "Unable to resolve Railway DATABASE_URL for $RAILWAY_DATABASE_SERVICE." >&2
  exit 1
fi

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$RAILWAY_DATABASE_URL" \
  "$DUMP_PATH"

echo "Imported records workflow dump into Railway Postgres."
