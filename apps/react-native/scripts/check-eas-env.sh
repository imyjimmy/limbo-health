#!/bin/bash
# scripts/check-eas-env.sh
# Compares local .env keys against EAS environment variables.
# Run before `eas build` to catch missing variables.
#
# Usage: ./scripts/check-eas-env.sh [environment]
#   environment: production (default), development, preview

set -euo pipefail

ENV="${1:-production}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

# Extract key names from local .env (skip comments and blank lines)
LOCAL_KEYS=$(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | cut -d= -f1 | sort)

# Extract key names from EAS environment
EAS_KEYS=$(eas env:list --environment "$ENV" --non-interactive 2>/dev/null \
  | grep '=' | cut -d= -f1 | sort)

MISSING=()
for key in $LOCAL_KEYS; do
  if ! echo "$EAS_KEYS" | grep -qx "$key"; then
    MISSING+=("$key")
  fi
done

if [ ${#MISSING[@]} -eq 0 ]; then
  echo "All .env keys are present in EAS '$ENV' environment."
  exit 0
else
  echo "MISSING from EAS '$ENV' environment:"
  for key in "${MISSING[@]}"; do
    echo "  - $key"
  done
  echo ""
  echo "Add them with:"
  for key in "${MISSING[@]}"; do
    echo "  eas env:create --name $key --value \"<value>\" --environment $ENV --visibility plaintext"
  done
  exit 1
fi
