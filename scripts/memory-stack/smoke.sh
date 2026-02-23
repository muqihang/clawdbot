#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

need_cmd jq

GROUP="smoke-g-$(date +%s)"
USER_ID="smoke-u-$(date +%s)"
RUN_ID="smoke-r-$(date +%s)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

curl -fsS -X POST "http://127.0.0.1:${GRAPHITI_PORT}/messages" \
  -H 'content-type: application/json' \
  -d "{\"group_id\":\"${GROUP}\",\"messages\":[{\"content\":\"我偏好text-embedding-v4。\",\"role_type\":\"user\",\"role\":\"user\",\"timestamp\":\"${TS}\"}]}" >/dev/null

sleep 35
EP_COUNT="$(curl -fsS "http://127.0.0.1:${GRAPHITI_PORT}/episodes/${GROUP}?last_n=10" | jq 'length')"
FACT_COUNT="$(curl -fsS -X POST "http://127.0.0.1:${GRAPHITI_PORT}/search" -H 'content-type: application/json' -d "{\"group_ids\":[\"${GROUP}\"],\"query\":\"向量模型偏好\",\"max_facts\":3}" | jq '.facts | length')"

ADD_RESP="$(curl -fsS -X POST "http://127.0.0.1:${MEM0_PORT}/memories" -H 'content-type: application/json' -d "{\"messages\":[{\"role\":\"user\",\"content\":\"我偏好阿里云text-embedding-v4\"}],\"user_id\":\"${USER_ID}\",\"run_id\":\"${RUN_ID}\",\"metadata\":{\"source\":\"smoke\"}}")"
MEM_COUNT="$(echo "$ADD_RESP" | jq '.results | length')"
SEARCH_COUNT="$(curl -fsS -X POST "http://127.0.0.1:${MEM0_PORT}/search" -H 'content-type: application/json' -d "{\"query\":\"向量模型偏好\",\"user_id\":\"${USER_ID}\",\"run_id\":\"${RUN_ID}\"}" | jq '.results | length')"

printf 'graphiti episodes=%s facts=%s\n' "$EP_COUNT" "$FACT_COUNT"
printf 'mem0 add_results=%s search_results=%s\n' "$MEM_COUNT" "$SEARCH_COUNT"

if [[ "$EP_COUNT" -lt 1 || "$FACT_COUNT" -lt 1 || "$MEM_COUNT" -lt 1 || "$SEARCH_COUNT" -lt 1 ]]; then
  fail "smoke failed"
fi

log "smoke passed"
