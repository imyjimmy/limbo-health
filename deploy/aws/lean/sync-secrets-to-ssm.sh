#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/deploy/aws/lean/.env.aws}"
PREFIX="${2:-/limbo-health/prod/lean}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file $ENV_FILE." >&2
  exit 1
fi

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "$line" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  key="${line%%=*}"
  value="${line#*=}"

  if [[ -z "$key" ]]; then
    continue
  fi

  if [[ -n "$value" ]]; then
    aws ssm put-parameter \
      --name "$PREFIX/$key" \
      --type SecureString \
      --overwrite \
      --value "$value" \
      >/dev/null
  else
    aws ssm delete-parameter --name "$PREFIX/$key" >/dev/null 2>&1 || true
  fi
done < "$ENV_FILE"

echo "$PREFIX"
