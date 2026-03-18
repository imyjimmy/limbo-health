#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

"$ROOT_DIR/deploy/aws/lean/backup-databases-to-s3.sh"
"$ROOT_DIR/deploy/aws/lean/backup-storage-to-s3.sh"

