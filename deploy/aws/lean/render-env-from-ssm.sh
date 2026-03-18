#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PREFIX="${1:-${SSM_PARAMETER_PATH_PREFIX:-/limbo-health/prod/lean}}"
OUTPUT_FILE="${2:-$ROOT_DIR/deploy/aws/lean/.env.aws}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

json="$(aws ssm get-parameters-by-path \
  --with-decryption \
  --recursive \
  --path "$PREFIX" \
  --output json)"

count="$(printf '%s' "$json" | jq '.Parameters | length')"
if [[ "$count" -eq 0 ]]; then
  echo "No SSM parameters found under $PREFIX." >&2
  exit 1
fi

printf '%s' "$json" | jq -r '
  .Parameters
  | sort_by(.Name)
  | .[]
  | "\(.Name | split("/") | last)=\(.Value)"
' > "$OUTPUT_FILE"

chmod 600 "$OUTPUT_FILE"

echo "$OUTPUT_FILE"
