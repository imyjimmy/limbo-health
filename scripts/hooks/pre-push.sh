#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

SKIP_FLAG="${SKIP_PREPUSH_TESTS:-}"
SKIP_CONFIG="$(git config --bool --get hooks.skipPrePushTests || true)"

if [[ "$SKIP_FLAG" == "1" || "$SKIP_FLAG" == "true" || "$SKIP_CONFIG" == "true" ]]; then
  echo "[pre-push] Skipping tests (SKIP_PREPUSH_TESTS=${SKIP_FLAG:-unset}, hooks.skipPrePushTests=${SKIP_CONFIG:-unset})"
  exit 0
fi

echo "[pre-push] Running push gate tests..."
npm run -s test:prepush

echo "[pre-push] OK"
