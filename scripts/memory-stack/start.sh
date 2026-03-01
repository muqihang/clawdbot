#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

need_cmd curl
need_cmd jq
need_cmd python3

ensure_dirs
load_stack_env
validate_required_env

if ! curl -fsS "http://${QDRANT_HOST}:${QDRANT_PORT}/healthz" >/dev/null 2>&1; then
  fail "qdrant not healthy at http://${QDRANT_HOST}:${QDRANT_PORT}/healthz"
fi

stop_from_pid_file "graphiti"
stop_from_pid_file "mem0"
stop_from_pid_file "embeddings"

if [[ "${EMBEDDING_BASE_URL}" == "${LOCAL_EMBEDDING_BASE_URL_DEFAULT}" ]]; then
  kill_port_listener "$LOCAL_EMBEDDING_PORT"

  EMBEDDINGS_LOG="${LOG_ROOT}/embeddings.log"
  nohup python3 "${SCRIPT_DIR}/local-embeddings-server.py" >"$EMBEDDINGS_LOG" 2>&1 &
  echo $! >"$(pid_file_for embeddings)"

  wait_for_http "http://127.0.0.1:${LOCAL_EMBEDDING_PORT}/healthz" 20 || fail "local embeddings server did not start"
fi

GRAPHITI_LOG="${LOG_ROOT}/graphiti.log"
MEM0_LOG="${LOG_ROOT}/mem0.log"

(
  cd "$GRAPHITI_SERVER_DIR"
  export NEO4J_URI
  export NEO4J_USERNAME
  export NEO4J_PASSWORD
  export LLM_API_KEY
  export LLM_BASE_URL
  export LLM_MODEL_NAME
  export MODEL_NAME="$LLM_MODEL_NAME"
  export EMBEDDING_API_KEY
  export EMBEDDING_BASE_URL
  export EMBEDDING_MODEL_NAME
  export EMBEDDING_DIM
  nohup "$GRAPHITI_SERVER_DIR/.venv/bin/uvicorn" graph_service.main:app --host 127.0.0.1 --port "$GRAPHITI_PORT" >"$GRAPHITI_LOG" 2>&1 &
  echo $! >"$(pid_file_for graphiti)"
)

(
  cd "$MEM0_SERVER_DIR"
  export OPENAI_API_KEY="$LLM_API_KEY"
  export OPENAI_BASE_URL="$LLM_BASE_URL"
  export MEM0_LLM_MODEL="$LLM_MODEL_NAME"
  export EMBEDDING_API_KEY
  export EMBEDDING_BASE_URL
  export MEM0_EMBED_MODEL="$EMBEDDING_MODEL_NAME"
  export EMBEDDING_DIM
  export QDRANT_HOST
  export QDRANT_PORT
  export QDRANT_COLLECTION_NAME
  export MEM0_USE_RESPONSES_API="${MEM0_USE_RESPONSES_API:-1}"
  export HISTORY_DB_PATH="${RUN_ROOT}/mem0-history.db"
  nohup "$MEM0_SERVER_DIR/.venv/bin/uvicorn" main:app --host 127.0.0.1 --port "$MEM0_PORT" >"$MEM0_LOG" 2>&1 &
  echo $! >"$(pid_file_for mem0)"
)

wait_for_http "http://127.0.0.1:${GRAPHITI_PORT}/healthcheck" 120 || fail "graphiti did not become healthy"
wait_for_http "http://127.0.0.1:${MEM0_PORT}/docs" 120 || fail "mem0 server did not start"

CONFIG_PAYLOAD="${RUN_ROOT}/mem0-config.json"
cat > "$CONFIG_PAYLOAD" <<JSON
{
  "version": "v1.1",
  "vector_store": {
    "provider": "qdrant",
    "config": {
      "host": "${QDRANT_HOST}",
      "port": ${QDRANT_PORT},
      "collection_name": "${QDRANT_COLLECTION_NAME}"
    }
  },
  "llm": {
    "provider": "openai",
    "config": {
      "model": "${LLM_MODEL_NAME}",
      "temperature": 0.2,
      "max_tokens": 1200,
      "api_key": "${LLM_API_KEY}",
      "openai_base_url": "${LLM_BASE_URL}"
    }
  },
  "embedder": {
    "provider": "openai",
    "config": {
      "model": "${EMBEDDING_MODEL_NAME}",
      "api_key": "${EMBEDDING_API_KEY}",
      "openai_base_url": "${EMBEDDING_BASE_URL}",
      "embedding_dims": ${EMBEDDING_DIM}
    }
  },
  "history_db_path": "${RUN_ROOT}/mem0-history.db"
}
JSON

curl -fsS -X POST "http://127.0.0.1:${MEM0_PORT}/configure" \
  -H 'content-type: application/json' \
  --data-binary "@${CONFIG_PAYLOAD}" >/dev/null

log "started graphiti + mem0"
"${SCRIPT_DIR}/status.sh"
