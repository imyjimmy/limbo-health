#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/aws/lean/.env.aws"
COMPOSE_FILE="$ROOT_DIR/deploy/aws/lean/docker-compose.ec2.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Required variable $name is missing." >&2
    exit 1
  fi
}

require_var RECORDS_WORKFLOW_DB_NAME
require_var RECORDS_WORKFLOW_DB_USER
require_var RECORDS_WORKFLOW_DB_PASSWORD

if [[ -z "${SOURCE_MYSQL_URL:-}" ]]; then
  require_var SOURCE_MYSQL_HOST
  require_var SOURCE_MYSQL_PORT
  require_var SOURCE_MYSQL_DATABASE
  require_var SOURCE_MYSQL_USER
  require_var SOURCE_MYSQL_PASSWORD
fi

auth_container_id="$(
  docker compose \
    --env-file "$ENV_FILE" \
    -f "$COMPOSE_FILE" \
    ps -q auth-api
)"

if [[ -z "$auth_container_id" ]]; then
  echo "auth-api container is not running. Deploy the AWS stack first." >&2
  exit 1
fi

target_database_url="postgres://${RECORDS_WORKFLOW_DB_USER}:${RECORDS_WORKFLOW_DB_PASSWORD}@records-workflow-postgres:5432/${RECORDS_WORKFLOW_DB_NAME}"

docker run --rm \
  --network "container:${auth_container_id}" \
  -v "$ROOT_DIR:/workspace" \
  -w /workspace \
  -e DATABASE_URL="$target_database_url" \
  -e SOURCE_MYSQL_URL="${SOURCE_MYSQL_URL:-}" \
  -e SOURCE_MYSQL_HOST="${SOURCE_MYSQL_HOST:-}" \
  -e SOURCE_MYSQL_PORT="${SOURCE_MYSQL_PORT:-}" \
  -e SOURCE_MYSQL_DATABASE="${SOURCE_MYSQL_DATABASE:-}" \
  -e SOURCE_MYSQL_USER="${SOURCE_MYSQL_USER:-}" \
  -e SOURCE_MYSQL_PASSWORD="${SOURCE_MYSQL_PASSWORD:-}" \
  node:20 \
  sh -lc 'npm ci --ignore-scripts && node scripts/migrate-core-mysql-to-postgres.mjs'
