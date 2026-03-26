#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"$ROOT_DIR/scripts/sync-records-workflow-railway-postgres.sh"
"$ROOT_DIR/scripts/sync-records-workflow-railway-storage.sh"

echo "Railway now mirrors local records-workflow Postgres and storage artifacts."
