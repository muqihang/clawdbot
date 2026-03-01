#!/usr/bin/env bash
set -euo pipefail

OUTDIR="$1"
TS="$2"

GROUP="diag-g-${TS}"
TS_ISO="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "group=${GROUP}"

curl -fsS -X POST "http://127.0.0.1:8000/messages" \
  -H 'content-type: application/json' \
  -d "{\"group_id\":\"${GROUP}\",\"messages\":[{\"content\":\"我偏好text-embedding-v4。\",\"role_type\":\"user\",\"role\":\"user\",\"timestamp\":\"${TS_ISO}\"}]}" \
  >"${OUTDIR}/graphiti.messages.${TS}.json"

echo "messages_posted"

sleep 90

curl -fsS "http://127.0.0.1:8000/episodes/${GROUP}?last_n=10" \
  >"${OUTDIR}/graphiti.episodes.${TS}.json"
EP_COUNT="$(jq 'length' "${OUTDIR}/graphiti.episodes.${TS}.json")"

curl -fsS -X POST "http://127.0.0.1:8000/search" \
  -H 'content-type: application/json' \
  -d "{\"group_ids\":[\"${GROUP}\"],\"query\":\"向量模型偏好\",\"max_facts\":3}" \
  >"${OUTDIR}/graphiti.search.${TS}.json"
FACT_COUNT="$(jq '.facts | length' "${OUTDIR}/graphiti.search.${TS}.json")"

echo "episodes=${EP_COUNT} facts=${FACT_COUNT}"
