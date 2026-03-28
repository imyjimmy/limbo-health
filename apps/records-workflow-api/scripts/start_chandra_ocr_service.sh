#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
VENV_DIR="${CHANDRA_OCR_VENV_DIR:-$ROOT_DIR/tmp/chandra-ocr-venv}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"
python -m pip install --upgrade pip
python -m pip install "chandra-ocr[hf]" PyMuPDF

export TORCH_DEVICE="${TORCH_DEVICE:-mps}"
export CHANDRA_OCR_MAX_OUTPUT_TOKENS="${CHANDRA_OCR_MAX_OUTPUT_TOKENS:-3072}"
exec python "$ROOT_DIR/apps/records-workflow-api/src/parsers/chandra_ocr_service.py"
