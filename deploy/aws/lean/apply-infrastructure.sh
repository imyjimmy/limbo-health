#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DATA_STACK_DIR="$ROOT_DIR/infra/aws/lean/data/terraform"
APP_STACK_DIR="$ROOT_DIR/infra/aws/lean/terraform"
ENV_FILE="$ROOT_DIR/deploy/aws/lean/.env.aws"
SSM_PREFIX="${SSM_PARAMETER_PATH_PREFIX:-/limbo-health/prod/lean}"
SOURCE_BUNDLE_PREFIX="${SOURCE_BUNDLE_PREFIX:-artifacts/source}"
TERRAFORM_IMAGE="${TERRAFORM_IMAGE:-hashicorp/terraform:1.8.5}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE." >&2
  exit 1
fi

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
terraform_in_docker "$DATA_STACK_DIR" apply -auto-approve >/dev/null

backup_bucket_name="$(terraform_in_docker "$DATA_STACK_DIR" output -raw backup_bucket_name)"
data_volume_id="$(terraform_in_docker "$DATA_STACK_DIR" output -raw data_volume_id)"

"$ROOT_DIR/deploy/aws/lean/sync-secrets-to-ssm.sh" "$ENV_FILE" "$SSM_PREFIX" >/dev/null
source_bundle_key="$("$ROOT_DIR/deploy/aws/lean/publish-source-bundle.sh" "$backup_bucket_name" "$SOURCE_BUNDLE_PREFIX")"

terraform_in_docker "$APP_STACK_DIR" init >/dev/null
terraform_in_docker "$APP_STACK_DIR" apply -auto-approve \
  -var "backup_bucket_name=$backup_bucket_name" \
  -var "data_volume_id=$data_volume_id" \
  -var "ssm_parameter_path_prefix=$SSM_PREFIX" \
  >/dev/null

instance_id="$(terraform_in_docker "$APP_STACK_DIR" output -raw instance_id)"

remote_commands_json="$(jq -nc --arg bucket "$backup_bucket_name" --arg key "$source_bundle_key" --arg prefix "$SSM_PREFIX" '{
  commands: [
    "set -e",
    "cd /opt/limbo-health",
    ("./deploy/aws/lean/fetch-source-bundle.sh " + ($bucket|@sh) + " " + ($key|@sh) + " /opt/limbo-health"),
    ("SSM_PARAMETER_PATH_PREFIX=" + ($prefix|@sh) + " ./deploy/aws/lean/render-env-from-ssm.sh"),
    "./deploy/aws/lean/bootstrap-host.sh",
    "./deploy/aws/lean/deploy.sh"
  ]
}')"

command_id="$(aws ssm send-command \
  --instance-ids "$instance_id" \
  --document-name AWS-RunShellScript \
  --parameters "$remote_commands_json" \
  --query 'Command.CommandId' \
  --output text)"

echo "$command_id"
