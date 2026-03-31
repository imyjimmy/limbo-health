#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
BUCKET="${1:?Usage: $0 <bucket> [key-prefix]}"
KEY_PREFIX="${2:-artifacts/source}"

tmpdir="$(mktemp -d /tmp/limbo-source.XXXXXX)"
manifest="$tmpdir/manifest.txt"
archive="$tmpdir/limbo-health-source.tar.gz"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

cd "$ROOT_DIR"

git ls-files -z --cached --modified | perl -0ne '
  for (split /\0/) {
    next if $_ eq q{};
    next if /^\.env(?:\..*)?$/;
    next if m{^apps/records-workflow-api/storage/};
    next if m{^apps/scheduler-api/uploads/};
    next if m{^users/};
    next if m{^apps/mgit-api/users/};
    next if m{^apps/react-native/ios/build-release-device/};
    next if m{^infra/aws/lean/terraform/terraform\.tfvars$};
    next if m{^infra/aws/lean/terraform/\.terraform/};
    next if m{^infra/aws/lean/data/terraform/terraform\.tfvars$};
    next if m{^infra/aws/lean/data/terraform/\.terraform/};
    next if /\.log$/;
    print "$_\0";
  }
' > "$manifest"

COPYFILE_DISABLE=1 tar -czf "$archive" --null -T "$manifest"

short_sha="$(git rev-parse --short HEAD)"
timestamp="$(date +%Y%m%d%H%M%S)"
key="$KEY_PREFIX/$timestamp-$short_sha.tar.gz"

aws s3 cp "$archive" "s3://$BUCKET/$key" >/dev/null

echo "$key"
