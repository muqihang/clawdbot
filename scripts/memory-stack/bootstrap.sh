#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

need_cmd git
need_cmd curl
need_cmd rg
need_cmd perl
need_cmd jq

ensure_dirs
write_env_template_if_missing
import_defaults_from_chelingxi_env
import_llm_key_from_graphiti_env
import_defaults_from_repo_dotenv

log "stack root: ${STACK_ROOT}"
log "graphiti ref: ${GRAPHITI_REF}"
log "mem0 ref: ${MEM0_REF}"

clone_or_update_repo "${GRAPHITI_REPO}" "${GRAPHITI_REF}" "${GRAPHITI_SRC_DIR}"
clone_or_update_repo "${MEM0_REPO}" "${MEM0_REF}" "${MEM0_SRC_DIR}"

if ! git -C "${GRAPHITI_SRC_DIR}" apply --check "${SCRIPT_DIR}/patches/graphiti-source.patch" >/dev/null 2>&1; then
  log "graphiti patch already applied or diverged; continuing"
else
  git -C "${GRAPHITI_SRC_DIR}" apply "${SCRIPT_DIR}/patches/graphiti-source.patch"
fi

if ! git -C "${MEM0_SRC_DIR}" apply --check "${SCRIPT_DIR}/patches/mem0-server-main.patch" >/dev/null 2>&1; then
  log "mem0 server patch already applied or diverged; continuing"
else
  git -C "${MEM0_SRC_DIR}" apply "${SCRIPT_DIR}/patches/mem0-server-main.patch"
fi

# verify graphiti source patch markers
rg -q "llm_api_key" "${GRAPHITI_SERVER_DIR}/graph_service/config.py" || fail "graphiti config patch missing"
rg -q "shutdown_graphiti" "${GRAPHITI_SERVER_DIR}/graph_service/main.py" || fail "graphiti lifespan patch missing"
rg -q "_shared_client" "${GRAPHITI_SERVER_DIR}/graph_service/zep_graphiti.py" || fail "graphiti singleton patch missing"

# verify mem0 source patch markers
rg -q "QDRANT_COLLECTION_NAME" "${MEM0_SERVER_DIR}/main.py" || fail "mem0 main patch missing"
rg -q "waiting for /configure" "${MEM0_SERVER_DIR}/main.py" || fail "mem0 fallback bootstrap patch missing"

venv_python "${GRAPHITI_SERVER_DIR}"
venv_python "${MEM0_SERVER_DIR}"

run_in_venv "${GRAPHITI_SERVER_DIR}" pip install --upgrade pip
run_in_venv "${GRAPHITI_SERVER_DIR}" pip install -e .
run_in_venv "${GRAPHITI_SERVER_DIR}" python "${SCRIPT_DIR}/patch-graphiti-sitepkg.py" "${GRAPHITI_SERVER_DIR}/.venv/lib/python3.13/site-packages"

run_in_venv "${MEM0_SERVER_DIR}" pip install --upgrade pip
run_in_venv "${MEM0_SERVER_DIR}" pip install -r requirements.txt
run_in_venv "${MEM0_SERVER_DIR}" python "${SCRIPT_DIR}/patch-mem0-sitepkg.py" "${MEM0_SERVER_DIR}/.venv/lib/python3.13/site-packages"

log "bootstrap complete"
log "env file: ${STACK_ENV_FILE}"
