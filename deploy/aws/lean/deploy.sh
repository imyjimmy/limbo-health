#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/aws/lean/.env.aws"
COMPOSE_FILE="$ROOT_DIR/deploy/aws/lean/docker-compose.ec2.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d --build

cat <<EOF
Lean AWS stack deployed.

Smoke checks:
- curl -I https://${PUBLIC_HOSTNAME:-limbo.health}
- curl https://${PUBLIC_HOSTNAME:-limbo.health}/api/records-workflow/hospital-systems
- curl https://${PUBLIC_HOSTNAME:-limbo.health}/api/auth/me
EOF
