#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/aws/lean/.env.aws"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "BACKUP_S3_BUCKET is not set; skipping database backup." >&2
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

if docker ps --format '{{.Names}}' | grep -q '^limbo-aws-records-workflow-postgres$'; then
  docker exec -e PGPASSWORD="$RECORDS_WORKFLOW_DB_PASSWORD" limbo-aws-records-workflow-postgres sh -lc \
    "pg_dump -U \"$RECORDS_WORKFLOW_DB_USER\" \"$RECORDS_WORKFLOW_DB_NAME\"" \
    > "$workdir/shared-postgres-${timestamp}.sql"

  aws s3 cp \
    "$workdir/shared-postgres-${timestamp}.sql" \
    "s3://${BACKUP_S3_BUCKET}/database/shared-postgres/shared-postgres-${timestamp}.sql" \
    --region "$AWS_REGION"
fi

echo "Database backup uploaded for ${timestamp}."
