#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BSWH_ACCEPTED_FORM_PATHS=(
  "accepted-forms/tx/baylor-scott-and-white-health-authorization-of-release-of-information-from-bswh-EN.pdf"
  "accepted-forms/tx/baylor-scott-and-white-health-authorization-for-release-of-information-to-bswh-EN.pdf"
  "accepted-forms/tx/baylor-scott-and-white-health-authorization-for-release-of-information-to-bswh-ES.pdf"
  "accepted-forms/tx/baylor-scott-and-white-health-autorizacion-para-la-divulgacion-de-informacion-medica-ES.pdf"
)

BSWH_PARSED_PATHS=(
  "parsed/tx/0b925fd8-53cc-4a23-87ec-1f3bcc8dc83b.json"
  "parsed/tx/e8758401-6ffb-448a-8a8c-f45593655653.json"
  "parsed/tx/c480aaf2-e9b5-4a41-8a7e-a833d35a7f08.json"
  "parsed/tx/f877f526-4a08-4862-bb75-5a32c23100c1.json"
)

BSWH_QUESTION_MAPPING_PATHS=(
  "question-mappings/tx/46b41eda-c55d-4217-853a-bb70220602ab"
  "question-mappings/tx/6da8fce8-095a-46b4-ad0a-c6b02025ff55"
  "question-mappings/tx/88e55acf-1b2f-48d1-8cff-af5272aeae4f"
  "question-mappings/tx/9663b285-a44e-41be-ada5-0323fe551e2b"
)

join_paths() {
  local joined=""
  local item
  for item in "$@"; do
    if [[ -n "$joined" ]]; then
      joined+=" "
    fi
    joined+="$item"
  done
  printf '%s' "$joined"
}

RAILWAY_RECORDS_WORKFLOW_STORAGE_PATHS="$(join_paths "${BSWH_ACCEPTED_FORM_PATHS[@]}")" \
  "$ROOT_DIR/scripts/sync-records-workflow-railway-storage.sh"

RAILWAY_RECORDS_WORKFLOW_STORAGE_PATHS="$(join_paths "${BSWH_PARSED_PATHS[@]}")" \
  "$ROOT_DIR/scripts/sync-records-workflow-railway-storage.sh"

RAILWAY_RECORDS_WORKFLOW_STORAGE_PATHS="$(join_paths "${BSWH_QUESTION_MAPPING_PATHS[@]}")" \
  "$ROOT_DIR/scripts/sync-records-workflow-railway-storage.sh"

echo "Railway now reflects local BSWH accepted forms, parsed artifacts, and question mappings."
