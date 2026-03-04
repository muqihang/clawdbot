#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

STACK_ROOT="${OPENCLAW_MEMORY_STACK_ROOT:-$HOME/chelingxi_workspace/.openclaw-memory-stack}"
SRC_ROOT="${STACK_ROOT}/src"
RUN_ROOT="${STACK_ROOT}/run"
LOG_ROOT="${STACK_ROOT}/logs"
PID_ROOT="${STACK_ROOT}/pids"
ENV_ROOT="${STACK_ROOT}/env"

GRAPHITI_SRC_DIR="${SRC_ROOT}/graphiti"
MEM0_SRC_DIR="${SRC_ROOT}/mem0"

GRAPHITI_SERVER_DIR="${GRAPHITI_SRC_DIR}/server"
MEM0_SERVER_DIR="${MEM0_SRC_DIR}/server"

GRAPHITI_PORT="${GRAPHITI_PORT:-8000}"
MEM0_PORT="${MEM0_PORT:-8766}"
LOCAL_EMBEDDING_HOST="${LOCAL_EMBEDDING_HOST:-127.0.0.1}"
LOCAL_EMBEDDING_PORT="${LOCAL_EMBEDDING_PORT:-18082}"
LOCAL_EMBEDDING_BASE_URL_DEFAULT="http://${LOCAL_EMBEDDING_HOST}:${LOCAL_EMBEDDING_PORT}/v1"
QDRANT_HOST="${QDRANT_HOST:-127.0.0.1}"
QDRANT_PORT="${QDRANT_PORT:-6333}"
QDRANT_COLLECTION_NAME="${QDRANT_COLLECTION_NAME:-openclaw_mem0}"

GRAPHITI_REPO="${GRAPHITI_REPO:-https://github.com/getzep/graphiti.git}"
GRAPHITI_REF="${GRAPHITI_REF:-510bd50d5408477bc172b63b5567b753b50b9d11}"
MEM0_REPO="${MEM0_REPO:-https://github.com/mem0ai/mem0.git}"
MEM0_REF="${MEM0_REF:-db15d5c6297ee2afaed2e91d86796a86f383949e}"

STACK_ENV_FILE="${STACK_ENV_FILE:-${ENV_ROOT}/memory-stack.env}"

CHELINGXI_ENV_PATH="${CHELINGXI_ENV_PATH:-$HOME/chelingxi_workspace/chelingxi-os/.env.local}"

log() {
  printf '[memory-stack] %s\n' "$*"
}

fail() {
  printf '[memory-stack] ERROR: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || fail "missing command: $cmd"
}

need_python313() {
  if command -v python3.13 >/dev/null 2>&1; then
    echo "python3.13"
    return
  fi
  fail "python3.13 is required"
}

ensure_dirs() {
  mkdir -p "$STACK_ROOT" "$SRC_ROOT" "$RUN_ROOT" "$LOG_ROOT" "$PID_ROOT" "$ENV_ROOT"
}

write_env_template_if_missing() {
  if [[ -f "$STACK_ENV_FILE" ]]; then
    return
  fi

  cat > "$STACK_ENV_FILE" <<'ENVEOF'
# LLM through sub2api responses endpoint
LLM_API_KEY=
LLM_BASE_URL=http://127.0.0.1:18081/v1
LLM_MODEL_NAME=gpt-5.3-codex

# Embedding through DashScope OpenAI-compatible endpoint
EMBEDDING_API_KEY=
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_MODEL_NAME=text-embedding-v4
EMBEDDING_DIM=1536

# Neo4j cloud
NEO4J_URI=
NEO4J_USERNAME=
NEO4J_PASSWORD=

# Optional routing and storage
QDRANT_HOST=127.0.0.1
QDRANT_PORT=6333
QDRANT_COLLECTION_NAME=openclaw_mem0

# Optional fast toggle
MEM0_USE_RESPONSES_API=1
ENVEOF

  chmod 600 "$STACK_ENV_FILE"
  log "created env template: $STACK_ENV_FILE"
}

import_defaults_from_chelingxi_env() {
  [[ -f "$CHELINGXI_ENV_PATH" ]] || return 0

  local dashscope=""
  local emb_dim=""
  local neo_uri=""
  local neo_user=""
  local neo_pass=""

  dashscope="$(awk -F= '/^DASHSCOPE_API_KEY=/{print $2}' "$CHELINGXI_ENV_PATH" | tail -n1 | tr -d '\r')"
  emb_dim="$(awk -F= '/^EMBEDDING_DIM=/{print $2}' "$CHELINGXI_ENV_PATH" | tail -n1 | tr -d '\r')"
  neo_uri="$(awk -F= '/^NEO4J_URI=/{print $2}' "$CHELINGXI_ENV_PATH" | tail -n1 | tr -d '\r')"
  neo_user="$(awk -F= '/^NEO4J_USERNAME=/{print $2}' "$CHELINGXI_ENV_PATH" | tail -n1 | tr -d '\r')"
  neo_pass="$(awk -F= '/^NEO4J_PASSWORD=/{print $2}' "$CHELINGXI_ENV_PATH" | tail -n1 | tr -d '\r')"

  [[ -n "$dashscope" ]] && update_env_kv "EMBEDDING_API_KEY" "$dashscope"
  [[ -n "$emb_dim" ]] && update_env_kv "EMBEDDING_DIM" "$emb_dim"
  [[ -n "$neo_uri" ]] && update_env_kv "NEO4J_URI" "$neo_uri"
  [[ -n "$neo_user" ]] && update_env_kv "NEO4J_USERNAME" "$neo_user"
  [[ -n "$neo_pass" ]] && update_env_kv "NEO4J_PASSWORD" "$neo_pass"
}

import_llm_key_from_graphiti_env() {
  local graphiti_env="${GRAPHITI_ENV_PATH:-/tmp/graphiti-official-YZMKGx/server/.env}"
  [[ -f "$graphiti_env" ]] || return 0

  local llm_key=""
  llm_key="$(awk -F= '/^LLM_API_KEY=/{print $2}' "$graphiti_env" | tail -n1 | tr -d '\r')"
  [[ -n "$llm_key" ]] && update_env_kv "LLM_API_KEY" "$llm_key"
}

update_env_kv() {
  local key="$1"
  local value="$2"

  if rg -q "^${key}=" "$STACK_ENV_FILE"; then
    LC_ALL=C LANG=C perl -0777 -pe "s#^${key}=.*#${key}=${value}#m" -i "$STACK_ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$STACK_ENV_FILE"
  fi
}

load_stack_env() {
  [[ -f "$STACK_ENV_FILE" ]] || fail "missing env file: $STACK_ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$STACK_ENV_FILE"
  set +a
}

validate_required_env() {
  local missing=()
  local required=(
    LLM_API_KEY
    LLM_BASE_URL
    LLM_MODEL_NAME
    EMBEDDING_API_KEY
    EMBEDDING_BASE_URL
    EMBEDDING_MODEL_NAME
    EMBEDDING_DIM
    NEO4J_URI
    NEO4J_USERNAME
    NEO4J_PASSWORD
  )

  local key
  for key in "${required[@]}"; do
    if [[ -z "${!key:-}" ]]; then
      missing+=("$key")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    fail "missing env values in ${STACK_ENV_FILE}: ${missing[*]}"
  fi
}

validate_embedding_policy() {
  if [[ "${EMBEDDING_BASE_URL}" == *"18082"* ]]; then
    fail "EMBEDDING_BASE_URL must not target port 18082: ${EMBEDDING_BASE_URL}. Port 18082 is forbidden for embedding endpoints."
  fi

  if [[ "${EMBEDDING_MODEL_NAME}" != "text-embedding-v4" ]]; then
    fail "EMBEDDING_MODEL_NAME must be text-embedding-v4, got: ${EMBEDDING_MODEL_NAME}"
  fi

  if [[ "${EMBEDDING_DIM}" != "1536" ]]; then
    fail "EMBEDDING_DIM must be 1536, got: ${EMBEDDING_DIM}"
  fi
}

clone_or_update_repo() {
  local repo="$1"
  local ref="$2"
  local dest="$3"

  if [[ ! -d "$dest/.git" ]]; then
    git clone "$repo" "$dest"
  fi

  git -C "$dest" fetch --all --tags
  git -C "$dest" checkout "$ref"
}

venv_python() {
  local dir="$1"
  local py
  py="$(need_python313)"

  if [[ ! -d "$dir/.venv" ]]; then
    "$py" -m venv "$dir/.venv"
  fi
}

run_in_venv() {
  local dir="$1"
  shift
  (
    cd "$dir"
    # shellcheck disable=SC1091
    source .venv/bin/activate
    "$@"
  )
}

pid_file_for() {
  local name="$1"
  printf '%s/%s.pid\n' "$PID_ROOT" "$name"
}

is_pid_alive() {
  local pid="$1"
  kill -0 "$pid" 2>/dev/null
}

stop_from_pid_file() {
  local name="$1"
  local pid_file
  pid_file="$(pid_file_for "$name")"
  [[ -f "$pid_file" ]] || return 0

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "$pid" ]] && is_pid_alive "$pid"; then
    kill "$pid" || true
    sleep 1
    if is_pid_alive "$pid"; then
      kill -9 "$pid" || true
    fi
  fi
  rm -f "$pid_file"
}


kill_port_listener() {
  local port="$1"
  local pids
  pids="$(lsof -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -z "$pids" ]] && return 0

  kill $pids 2>/dev/null || true
  sleep 1

  local remains
  remains="$(lsof -t -iTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$remains" ]]; then
    kill -9 $remains 2>/dev/null || true
  fi
}

wait_for_http() {
  local url="$1"
  local timeout_s="${2:-30}"
  local started
  started="$(date +%s)"

  while true; do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi

    if (( "$(date +%s)" - started >= timeout_s )); then
      return 1
    fi

    sleep 1
  done
}
