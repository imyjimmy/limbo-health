#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "sync-records-workflow-railway-raw-storage.sh is now a backward-compatible alias for accepted-form sync." >&2

"$ROOT_DIR/scripts/sync-records-workflow-railway-accepted-forms.sh" "$@"
