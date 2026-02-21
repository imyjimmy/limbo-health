#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "[pre-commit] Running fast staged checks..."

# Built-in git whitespace/conflict-marker checks on staged changes.
git diff --cached --check

STAGED_FILES="$(git diff --cached --name-only --diff-filter=ACMR)"
if [[ -z "$STAGED_FILES" ]]; then
  echo "[pre-commit] No staged files."
  exit 0
fi

# Optional lint pass if a lint script exists and JS/TS files are staged.
if printf '%s\n' "$STAGED_FILES" | grep -Eq '\.(js|jsx|ts|tsx)$'; then
  if npm run --silent 2>/dev/null | grep -Eq '^  lint$'; then
    echo "[pre-commit] Running lint..."
    npm run -s lint
  else
    echo "[pre-commit] No root lint script found; skipping lint."
  fi
fi

echo "[pre-commit] OK"
