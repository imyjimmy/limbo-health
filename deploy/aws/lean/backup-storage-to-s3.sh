#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ENV_FILE="$ROOT_DIR/deploy/aws/lean/.env.aws"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [[ -z "${BACKUP_S3_BUCKET:-}" ]]; then
  echo "BACKUP_S3_BUCKET is not set; skipping storage backup." >&2
  exit 0
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

tar -C "$LIMBO_DATA_DIR" -czf "$workdir/repos-${timestamp}.tar.gz" repos
tar -C "$LIMBO_DATA_DIR" -czf "$workdir/users-${timestamp}.tar.gz" users
tar -C "$LIMBO_DATA_DIR" -czf "$workdir/uploads-${timestamp}.tar.gz" uploads
tar -C "$LIMBO_DATA_DIR" -czf "$workdir/records-raw-${timestamp}.tar.gz" records-raw

aws s3 cp "$workdir/repos-${timestamp}.tar.gz" "s3://${BACKUP_S3_BUCKET}/storage/repos/repos-${timestamp}.tar.gz" --region "$AWS_REGION"
aws s3 cp "$workdir/users-${timestamp}.tar.gz" "s3://${BACKUP_S3_BUCKET}/storage/users/users-${timestamp}.tar.gz" --region "$AWS_REGION"
aws s3 cp "$workdir/uploads-${timestamp}.tar.gz" "s3://${BACKUP_S3_BUCKET}/storage/uploads/uploads-${timestamp}.tar.gz" --region "$AWS_REGION"
aws s3 cp "$workdir/records-raw-${timestamp}.tar.gz" "s3://${BACKUP_S3_BUCKET}/storage/records-raw/records-raw-${timestamp}.tar.gz" --region "$AWS_REGION"

echo "Filesystem backups uploaded for ${timestamp}."
