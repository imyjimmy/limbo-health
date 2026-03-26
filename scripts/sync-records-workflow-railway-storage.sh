#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_STORAGE_ROOT="${1:-$ROOT_DIR/apps/records-workflow-api/storage}"
RAILWAY_API_SERVICE="${RAILWAY_RECORDS_WORKFLOW_API_SERVICE:-records-workflow-api}"
REMOTE_STORAGE_ROOT="${RAILWAY_RECORDS_WORKFLOW_REMOTE_STORAGE_ROOT:-/app/storage}"
REMOTE_ACCEPTED_FORMS_DIR="${RAILWAY_RECORDS_WORKFLOW_REMOTE_ACCEPTED_FORMS_DIR:-$REMOTE_STORAGE_ROOT/accepted-forms}"
LEGACY_REMOTE_RAW_DIR="${RAILWAY_RECORDS_WORKFLOW_REMOTE_RAW_DIR:-$REMOTE_STORAGE_ROOT/raw}"
LEGACY_REMOTE_SOURCE_DOCUMENT_DIR="${RAILWAY_RECORDS_WORKFLOW_REMOTE_SOURCE_DOCUMENT_DIR:-$REMOTE_STORAGE_ROOT/source-documents}"
STORAGE_SUBDIRS_RAW="${RAILWAY_RECORDS_WORKFLOW_STORAGE_SUBDIRS:-}"
STORAGE_PATHS_RAW="${RAILWAY_RECORDS_WORKFLOW_STORAGE_PATHS:-}"
BOOTSTRAP_STORAGE_DIR_NAME="${RAILWAY_RECORDS_WORKFLOW_BOOTSTRAP_STORAGE_DIR_NAME:-railway-bootstrap-storage}"
RAILWAY_WAKE_URL="${RAILWAY_RECORDS_WORKFLOW_WAKE_URL:-https://limbo.health/api/records-workflow/hospital-systems}"

railway_args=()
if [[ -n "${RAILWAY_PROJECT_ID:-}" ]]; then
  railway_args+=("--project" "$RAILWAY_PROJECT_ID")
fi
if [[ -n "${RAILWAY_ENVIRONMENT_ID:-}" ]]; then
  railway_args+=("--environment" "$RAILWAY_ENVIRONMENT_ID")
fi

if [[ ! -d "$LOCAL_STORAGE_ROOT" ]]; then
  echo "Local records-workflow storage root not found: $LOCAL_STORAGE_ROOT" >&2
  exit 1
fi

if ! command -v railway >/dev/null 2>&1; then
  echo "Railway CLI is required to sync records-workflow storage." >&2
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "rsync is required to stage the Railway deploy payload." >&2
  exit 1
fi

railway_up() {
  if [[ ${#railway_args[@]} -gt 0 ]]; then
    railway up "${railway_args[@]}" "$@"
  else
    railway up "$@"
  fi
}

wake_railway_service() {
  if [[ -z "$RAILWAY_WAKE_URL" ]]; then
    return 0
  fi

  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 20 "$RAILWAY_WAKE_URL" >/dev/null 2>&1 || true
  fi
}

railway_ssh() {
  local output_file
  local exit_code=0
  local attempt
  output_file="$(mktemp "${TMPDIR:-/tmp}/railway-ssh.XXXXXX")"

  for attempt in 1 2 3 4 5 6 7 8; do
    set +e
    if [[ ${#railway_args[@]} -gt 0 ]]; then
      railway ssh "${railway_args[@]}" "$@" >"$output_file" 2>&1
    else
      railway ssh "$@" >"$output_file" 2>&1
    fi
    exit_code=$?
    set -e

    if [[ "$exit_code" -eq 0 ]]; then
      cat "$output_file"
      rm -f "$output_file"
      return 0
    fi

    if [[ "$attempt" -lt 8 ]]; then
      wake_railway_service
      sleep 5
    fi
  done

  cat "$output_file" >&2
  rm -f "$output_file"
  return "$exit_code"
}

has_subdir() {
  local needle="$1"
  shift
  local subdir
  for subdir in "$@"; do
    if [[ "$subdir" == "$needle" ]]; then
      return 0
    fi
  done
  return 1
}

default_storage_subdirs=(
  targeted-pages
  captured-forms
  accepted-forms
  parsed
  hospital-submission-requirements
  question-mappings
  published-templates
  data-intake
  internal
)

STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/records-workflow-railway-storage.XXXXXX")"
cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGING_DIR/apps"
rsync -a \
  --exclude '.DS_Store' \
  --exclude 'node_modules/' \
  --exclude 'infra/' \
  --exclude 'logs/' \
  --exclude 'storage/' \
  "$ROOT_DIR/apps/records-workflow-api/" \
  "$STAGING_DIR/apps/records-workflow-api/"

mkdir -p "$STAGING_DIR/apps/records-workflow-api/storage"
mkdir -p "$STAGING_DIR/apps/records-workflow-api/$BOOTSTRAP_STORAGE_DIR_NAME"

selected_subdirs=()
if [[ -n "$STORAGE_SUBDIRS_RAW" ]]; then
  normalized_subdirs="${STORAGE_SUBDIRS_RAW//,/ }"
  # shellcheck disable=SC2206
  selected_subdirs=($normalized_subdirs)
fi

selected_paths=()
if [[ -n "$STORAGE_PATHS_RAW" ]]; then
  normalized_paths="${STORAGE_PATHS_RAW//,/ }"
  # shellcheck disable=SC2206
  selected_paths=($normalized_paths)
fi

paths_to_stage=()
if [[ ${#selected_paths[@]} -gt 0 ]]; then
  paths_to_stage=("${selected_paths[@]}")
elif [[ ${#selected_subdirs[@]} -gt 0 ]]; then
  paths_to_stage=("${selected_subdirs[@]}")
else
  paths_to_stage=("${default_storage_subdirs[@]}")
fi

missing_paths=()
for relative_path in "${paths_to_stage[@]}"; do
  if [[ -e "$LOCAL_STORAGE_ROOT/$relative_path" || -L "$LOCAL_STORAGE_ROOT/$relative_path" ]]; then
    destination_parent="$STAGING_DIR/apps/records-workflow-api/$BOOTSTRAP_STORAGE_DIR_NAME"
    relative_parent="$(dirname "$relative_path")"
    if [[ "$relative_parent" != "." ]]; then
      destination_parent="$destination_parent/$relative_parent"
      mkdir -p "$destination_parent"
    fi
    rsync -a --exclude '.DS_Store' "$LOCAL_STORAGE_ROOT/$relative_path" "$destination_parent/"
  else
    missing_paths+=("$relative_path")
  fi
done

if [[ ${#missing_paths[@]} -gt 0 ]]; then
  echo "Requested storage paths were not found: ${missing_paths[*]}" >&2
  exit 1
fi

set +e
railway_up \
  --service "$RAILWAY_API_SERVICE" \
  --no-gitignore \
  --path-as-root \
  --message "sync records-workflow storage" \
  "$STAGING_DIR"
railway_up_status=$?
set -e

if [[ "$railway_up_status" -ne 0 ]]; then
  echo "railway up exited with status $railway_up_status; continuing to runtime mirror and verification." >&2
fi

should_mirror_accepted_forms=0
if [[ ${#selected_paths[@]} -gt 0 ]]; then
  relative_path=""
  for relative_path in "${selected_paths[@]}"; do
    if [[ "$relative_path" == "accepted-forms" || "$relative_path" == accepted-forms/* ]]; then
      should_mirror_accepted_forms=1
      break
    fi
  done
elif [[ ${#selected_subdirs[@]} -eq 0 ]]; then
  should_mirror_accepted_forms=1
elif has_subdir "accepted-forms" "${selected_subdirs[@]}"; then
  should_mirror_accepted_forms=1
fi

selected_subdirs_for_remote=""
if [[ ${#selected_subdirs[@]} -gt 0 ]]; then
  selected_subdirs_for_remote="${selected_subdirs[*]}"
fi

selected_paths_for_remote=""
if [[ ${#selected_paths[@]} -gt 0 ]]; then
  selected_paths_for_remote="${selected_paths[*]}"
fi

read -r -d '' mirror_runtime_command <<EOF || true
set -eu
bootstrap_root='/app/$BOOTSTRAP_STORAGE_DIR_NAME'
runtime_root='$REMOTE_STORAGE_ROOT'
selected_subdirs='$selected_subdirs_for_remote'
selected_paths='$selected_paths_for_remote'
should_mirror_accepted_forms='$should_mirror_accepted_forms'
accepted_dir='$REMOTE_ACCEPTED_FORMS_DIR'
legacy_raw_dir='$LEGACY_REMOTE_RAW_DIR'
legacy_source_dir='$LEGACY_REMOTE_SOURCE_DOCUMENT_DIR'

realpath_or_blank() {
  if [ -e "\$1" ]; then
    (cd "\$1" 2>/dev/null && pwd -P) || true
  else
    true
  fi
}

mirror_path() {
  src="\$1"
  dest="\$2"
  src_real="\$(realpath_or_blank "\$src")"
  dest_real="\$(realpath_or_blank "\$dest")"

  if [ -z "\$src_real" ]; then
    return 0
  fi

  if [ -n "\$dest_real" ] && [ "\$src_real" = "\$dest_real" ]; then
    return 0
  fi

  if [ -d "\$src" ]; then
    mkdir -p "\$dest"
    find "\$dest" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
    cp -R "\$src"/. "\$dest"/
  else
    mkdir -p "\$(dirname "\$dest")"
    rm -f "\$dest"
    cp "\$src" "\$dest"
  fi
}

if [ -n "\$selected_paths" ]; then
  for rel_path in \$selected_paths; do
    mirror_path "\$bootstrap_root/\$rel_path" "\$runtime_root/\$rel_path"
  done
elif [ -n "\$selected_subdirs" ]; then
  for subdir in \$selected_subdirs; do
    mirror_path "\$bootstrap_root/\$subdir" "\$runtime_root/\$subdir"
  done
else
  mirror_path "\$bootstrap_root" "\$runtime_root"
fi

if [ "\$should_mirror_accepted_forms" = "1" ]; then
  if [ -n "\$selected_paths" ]; then
    for rel_path in \$selected_paths; do
      case "\$rel_path" in
        accepted-forms)
          mirror_path "\$bootstrap_root/\$rel_path" "\$legacy_raw_dir"
          mirror_path "\$bootstrap_root/\$rel_path" "\$legacy_source_dir"
          ;;
        accepted-forms/*)
          suffix="\${rel_path#accepted-forms}"
          mirror_path "\$bootstrap_root/\$rel_path" "\$legacy_raw_dir\$suffix"
          mirror_path "\$bootstrap_root/\$rel_path" "\$legacy_source_dir\$suffix"
          ;;
      esac
    done
  else
    mirror_path "\$accepted_dir" "\$legacy_raw_dir"
    mirror_path "\$accepted_dir" "\$legacy_source_dir"
  fi
fi
EOF

railway_ssh \
  --service "$RAILWAY_API_SERVICE" \
  "$mirror_runtime_command"

verification_subdirs=()
if [[ ${#selected_paths[@]} -gt 0 ]]; then
  verification_subdirs=("${selected_paths[@]}")
elif [[ ${#selected_subdirs[@]} -eq 0 ]]; then
  verification_subdirs=("${default_storage_subdirs[@]}")
else
  verification_subdirs=("${selected_subdirs[@]}")
fi

verified_any=0
for subdir in "${verification_subdirs[@]}"; do
  sample_relative_path="$(
    cd "$LOCAL_STORAGE_ROOT"
    find "$subdir" -type f ! -name '.DS_Store' ! -name '.gitkeep' 2>/dev/null | sed 's#^\./##' | sort | sed -n '1p'
  )"

  if [[ -z "$sample_relative_path" ]]; then
    continue
  fi

  railway_ssh \
    --service "$RAILWAY_API_SERVICE" \
    "test -f '$REMOTE_STORAGE_ROOT/$sample_relative_path'"

  if [[ "$subdir" == "accepted-forms" && "$should_mirror_accepted_forms" == "1" ]]; then
    railway_ssh \
      --service "$RAILWAY_API_SERVICE" \
      "test -f '$LEGACY_REMOTE_RAW_DIR/${sample_relative_path#accepted-forms/}'"
  elif [[ "$subdir" == accepted-forms/* && "$should_mirror_accepted_forms" == "1" ]]; then
    railway_ssh \
      --service "$RAILWAY_API_SERVICE" \
      "test -f '$LEGACY_REMOTE_RAW_DIR/${sample_relative_path#accepted-forms/}'"
  fi

  verified_any=1
done

if [[ "$verified_any" != "1" ]]; then
  echo "No storage files were available for verification under $LOCAL_STORAGE_ROOT." >&2
  exit 1
fi

if [[ ${#selected_subdirs[@]} -eq 0 ]]; then
  echo "Railway records-workflow storage now reflects local storage artifacts."
else
  echo "Railway records-workflow storage now reflects: ${selected_subdirs[*]}"
fi
