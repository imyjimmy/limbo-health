#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_PATH="${1:-$ROOT_DIR/railway-export/records-workflow/records-workflow.dump}"
LOCAL_DATABASE_URL="${LOCAL_RECORDS_WORKFLOW_DATABASE_URL:-postgres://postgres:postgres@localhost:5433/records_workflow}"
LOCAL_POSTGRES_CONTAINER="${LOCAL_RECORDS_WORKFLOW_POSTGRES_CONTAINER:-limbo_records_workflow_postgres_1}"
LOCAL_DB_USER="${LOCAL_RECORDS_WORKFLOW_DB_USER:-postgres}"
LOCAL_DB_NAME="${LOCAL_RECORDS_WORKFLOW_DB_NAME:-records_workflow}"

mkdir -p "$(dirname "$OUTPUT_PATH")"

if command -v pg_dump >/dev/null 2>&1; then
  pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --dbname="$LOCAL_DATABASE_URL" \
    --file="$OUTPUT_PATH"
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "pg_dump was not found and docker is unavailable." >&2
    exit 1
  fi

  docker exec "$LOCAL_POSTGRES_CONTAINER" pg_dump \
    -U "$LOCAL_DB_USER" \
    -d "$LOCAL_DB_NAME" \
    --format=custom \
    --no-owner \
    --no-privileges >"$OUTPUT_PATH"
fi

echo "Wrote records workflow dump to $OUTPUT_PATH"
