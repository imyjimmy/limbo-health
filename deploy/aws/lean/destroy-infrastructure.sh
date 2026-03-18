#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DATA_STACK_DIR="$ROOT_DIR/infra/aws/lean/data/terraform"
APP_STACK_DIR="$ROOT_DIR/infra/aws/lean/terraform"
SSM_PREFIX="${SSM_PARAMETER_PATH_PREFIX:-/limbo-health/prod/lean}"
SOURCE_BUNDLE_PREFIX="${SOURCE_BUNDLE_PREFIX:-artifacts/source}"
TERRAFORM_IMAGE="${TERRAFORM_IMAGE:-hashicorp/terraform:1.8.5}"

terraform_in_docker() {
  local workdir="$1"
  shift
  docker run --rm \
    -e AWS_PROFILE="${AWS_PROFILE:-}" \
    -e AWS_REGION="${AWS_REGION:-us-east-1}" \
    -v "$HOME/.aws:/root/.aws:ro" \
    -v "$workdir:/work" \
    -w /work \
    "$TERRAFORM_IMAGE" "$@"
}

terraform_in_docker "$DATA_STACK_DIR" init >/dev/null
backup_bucket_name="$(terraform_in_docker "$DATA_STACK_DIR" output -raw backup_bucket_name)"
data_volume_id="$(terraform_in_docker "$DATA_STACK_DIR" output -raw data_volume_id)"

terraform_in_docker "$APP_STACK_DIR" init >/dev/null
terraform_in_docker "$APP_STACK_DIR" destroy -auto-approve \
  -var "backup_bucket_name=$backup_bucket_name" \
  -var "data_volume_id=$data_volume_id" \
  -var "ssm_parameter_path_prefix=$SSM_PREFIX"

aws s3 rm "s3://$backup_bucket_name/$SOURCE_BUNDLE_PREFIX" --recursive >/dev/null 2>&1 || true

parameter_names=()
while IFS= read -r parameter_name; do
  [[ -n "$parameter_name" ]] || continue
  parameter_names+=("$parameter_name")
done < <(
  aws ssm get-parameters-by-path \
    --path "$SSM_PREFIX" \
    --recursive \
    --output json |
    jq -r '.Parameters[].Name'
)

if ((${#parameter_names[@]} > 0)); then
  for ((i = 0; i < ${#parameter_names[@]}; i += 10)); do
    batch=("${parameter_names[@]:i:10}")
    aws ssm delete-parameters --names "${batch[@]}" >/dev/null
  done
fi
