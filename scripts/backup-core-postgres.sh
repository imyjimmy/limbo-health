#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.development"

if [[ -f "$ENV_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$ENV_FILE"
fi

CONTAINER_PREFIX="${CONTAINER_PREFIX:-limbo}"
BACKUP_PATH="${ROOT_DIR}/postgres-backups"
POSTGRES_CONTAINER="${CONTAINER_PREFIX}_records_workflow_postgres_1"
POSTGRES_USER="${RECORDS_WORKFLOW_DB_USER:-postgres}"
POSTGRES_DB="${RECORDS_WORKFLOW_DB_NAME:-records_workflow}"
POSTGRES_PASSWORD="${RECORDS_WORKFLOW_DB_PASSWORD:-postgres}"

echo "🔍 Checking if Postgres container exists: ${POSTGRES_CONTAINER}"
if docker ps -a --format "table {{.Names}}" | grep -q "^${POSTGRES_CONTAINER}$"; then
    echo "📦 Found Postgres container: ${POSTGRES_CONTAINER}"
    mkdir -p "${BACKUP_PATH}"

    timestamp=$(date +"%Y%m%d_%H%M%S")
    backup_file="${BACKUP_PATH}/limbo_shared_postgres_backup_${timestamp}.sql"
    latest_backup="${BACKUP_PATH}/shared_latest.sql"

    echo "💾 Creating Postgres backup..."
    if docker exec -e PGPASSWORD="${POSTGRES_PASSWORD}" "${POSTGRES_CONTAINER}" \
        pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" > "${backup_file}"; then
        echo "✅ Postgres backup created: ${backup_file}"
        cp "${backup_file}" "${latest_backup}"
        echo "📋 Latest backup updated: ${latest_backup}"
        gzip "${backup_file}"
        echo "🗜️ Backup compressed: ${backup_file}.gz"
    else
        echo "⚠️ Postgres backup failed, but continuing with shutdown..."
    fi
else
    echo "ℹ️ Postgres container not found, skipping backup"
fi
