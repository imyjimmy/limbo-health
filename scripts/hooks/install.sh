#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

git config core.hooksPath .githooks

chmod +x .githooks/pre-commit .githooks/pre-push
chmod +x scripts/hooks/pre-commit.sh scripts/hooks/pre-push.sh scripts/hooks/install.sh

echo "Installed git hooks with core.hooksPath=.githooks"
echo "Current hooksPath: $(git config --get core.hooksPath)"
