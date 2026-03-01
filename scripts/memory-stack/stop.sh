#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

stop_from_pid_file "graphiti"
stop_from_pid_file "mem0"
stop_from_pid_file "embeddings"
kill_port_listener "$GRAPHITI_PORT"
kill_port_listener "$MEM0_PORT"
kill_port_listener "$LOCAL_EMBEDDING_PORT"

log "stopped graphiti + mem0 + embeddings (if running)"
