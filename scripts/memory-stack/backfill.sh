#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

need_cmd curl

ensure_dirs

MODE=""
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      MODE="dry-run"
      ;;
    --apply)
      MODE="apply"
      ;;
  esac
done

if [[ -z "$MODE" ]]; then
  fail "must provide either --dry-run or --apply"
fi

if [[ "$MODE" == "apply" ]]; then
  curl -fsS "http://127.0.0.1:${GRAPHITI_PORT}/healthcheck" >/dev/null || fail "graphiti not healthy"
  curl -fsS "http://127.0.0.1:${MEM0_PORT}/docs" >/dev/null || fail "mem0 not healthy"
fi

PYTHON_BIN="$(need_python313)"

"${PYTHON_BIN}" "${SCRIPT_DIR}/backfill.py" \
  --mem0-url "http://127.0.0.1:${MEM0_PORT}" \
  --graphiti-url "http://127.0.0.1:${GRAPHITI_PORT}" \
  --state-file "${RUN_ROOT}/backfill-state.json" \
  --summary-dir "${RUN_ROOT}" \
  "$@"
