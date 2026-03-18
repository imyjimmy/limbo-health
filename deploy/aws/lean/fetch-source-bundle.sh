#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -lt 2 ]]; then
  echo "Usage: $0 <bucket> <key> [destination]" >&2
  exit 1
fi

BUCKET="$1"
KEY="$2"
DESTINATION="${3:-/opt/limbo-health}"
TMP_ARCHIVE="$(mktemp /tmp/limbo-source.XXXXXX.tar.gz)"

mkdir -p "$DESTINATION"
find "$DESTINATION" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

aws s3 cp "s3://$BUCKET/$KEY" "$TMP_ARCHIVE"
tar -xzf "$TMP_ARCHIVE" -C "$DESTINATION"
find "$DESTINATION" -name '._*' -delete
rm -f "$TMP_ARCHIVE"

chown -R ec2-user:ec2-user "$DESTINATION"

echo "$DESTINATION"
