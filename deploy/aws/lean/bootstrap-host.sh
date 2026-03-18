#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/aws/lean/.env.aws"
ENV_EXAMPLE="$ROOT_DIR/deploy/aws/lean/env.aws.example"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy $ENV_EXAMPLE first." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

required_vars=(
  LIMBO_DATA_DIR
  AWS_REGION
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Required variable $name is missing from $ENV_FILE." >&2
    exit 1
  fi
done

ensure_data_volume() {
  local root_source
  local root_parent
  local attempts=0
  local data_device=""

  root_source="$(findmnt -n -o SOURCE / || true)"
  root_parent="$(lsblk -no pkname "$root_source" 2>/dev/null || true)"

  while [[ -z "$data_device" && "$attempts" -lt 60 ]]; do
    data_device="$(
      lsblk -ndo NAME,TYPE | awk '$2 == "disk" { print $1 }' | grep -v "^${root_parent}$" | head -n 1 || true
    )"
    if [[ -z "$data_device" ]]; then
      attempts=$((attempts + 1))
      sleep 2
    fi
  done

  if [[ -z "$data_device" ]]; then
    echo "No attached data volume found for $LIMBO_DATA_DIR." >&2
    return
  fi

  local data_path="/dev/${data_device}"
  if ! sudo blkid "$data_path" >/dev/null 2>&1; then
    sudo mkfs -t xfs "$data_path"
  fi

  local uuid
  uuid="$(sudo blkid -s UUID -o value "$data_path")"
  if ! grep -q "$uuid" /etc/fstab; then
    echo "UUID=$uuid $LIMBO_DATA_DIR xfs defaults,nofail 0 2" | sudo tee -a /etc/fstab >/dev/null
  fi

  sudo mkdir -p "$LIMBO_DATA_DIR"
  sudo mount -a
}

ensure_data_volume

mkdir -p \
  "$LIMBO_DATA_DIR/mysql" \
  "$LIMBO_DATA_DIR/records-workflow-postgres" \
  "$LIMBO_DATA_DIR/repos" \
  "$LIMBO_DATA_DIR/users" \
  "$LIMBO_DATA_DIR/uploads" \
  "$LIMBO_DATA_DIR/records-raw" \
  "$LIMBO_DATA_DIR/caddy-data" \
  "$LIMBO_DATA_DIR/caddy-config" \
  "$LIMBO_DATA_DIR/backups"

sudo chown -R "$(id -u):$(id -g)" "$LIMBO_DATA_DIR"

if ! docker compose version >/dev/null 2>&1; then
  arch="$(uname -m)"
  case "$arch" in
    x86_64)
      compose_arch="x86_64"
      ;;
    aarch64|arm64)
      compose_arch="aarch64"
      ;;
    *)
      echo "Unsupported architecture for Docker Compose: $arch" >&2
      exit 1
      ;;
  esac

  sudo install -d /usr/local/lib/docker/cli-plugins
  sudo curl -SL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${compose_arch}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is missing." >&2
  exit 1
fi

if command -v amazon-cloudwatch-agent-ctl >/dev/null 2>&1; then
  sudo cp "$ROOT_DIR/deploy/aws/lean/cloudwatch-agent.json" /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
  sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
    -a fetch-config \
    -m ec2 \
    -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
    -s
fi

cat <<EOF
Host bootstrap complete.

Next steps:
1. Verify Docker is running.
2. Import MySQL and records-workflow Postgres data.
3. Sync repos, uploads, and records raw storage into $LIMBO_DATA_DIR.
4. Run ./deploy/aws/lean/deploy.sh
EOF
