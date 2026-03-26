#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

RAILWAY_RECORDS_WORKFLOW_STORAGE_SUBDIRS="parsed" \
  "$ROOT_DIR/scripts/sync-records-workflow-railway-storage.sh" "$@"
