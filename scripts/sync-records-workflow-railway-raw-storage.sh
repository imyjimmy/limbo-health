#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_RAW_DIR="${1:-$ROOT_DIR/apps/records-workflow-api/storage/raw}"
RAILWAY_API_SERVICE="${RAILWAY_RECORDS_WORKFLOW_API_SERVICE:-records-workflow-api}"
REMOTE_RAW_DIR="${RAILWAY_RECORDS_WORKFLOW_REMOTE_RAW_DIR:-/app/storage/raw}"

railway_args=()
if [[ -n "${RAILWAY_PROJECT_ID:-}" ]]; then
  railway_args+=("--project" "$RAILWAY_PROJECT_ID")
fi
if [[ -n "${RAILWAY_ENVIRONMENT_ID:-}" ]]; then
  railway_args+=("--environment" "$RAILWAY_ENVIRONMENT_ID")
fi

if [[ ! -d "$LOCAL_RAW_DIR" ]]; then
  echo "Local raw storage directory not found: $LOCAL_RAW_DIR" >&2
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI is required to sync raw storage." >&2
  exit 1
fi

tar -C "$LOCAL_RAW_DIR" -cf - . | railway ssh "${railway_args[@]}" \
  --service "$RAILWAY_API_SERVICE" \
  "mkdir -p '$REMOTE_RAW_DIR' && tar -xf - -C '$REMOTE_RAW_DIR'"

echo "Synced $LOCAL_RAW_DIR to Railway service $RAILWAY_API_SERVICE:$REMOTE_RAW_DIR"
