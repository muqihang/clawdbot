#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

need_cmd curl
need_cmd jq

ensure_dirs

MEM0_USER_ID="${MEM0_USER_ID:-openclaw-backfill}"
GRAPHITI_GROUP_PREFIX="${GRAPHITI_GROUP_PREFIX:-openclaw-backfill}"
GRAPHITI_GROUP_CANONICAL="${GRAPHITI_GROUP_PREFIX}-canonical"
GRAPHITI_GROUP_TOPICS="${GRAPHITI_GROUP_PREFIX}-topics"
GRAPHITI_GROUP_DAILY="${GRAPHITI_GROUP_PREFIX}-daily"

RUN_TS="$(date -u +%Y%m%dT%H%M%SZ)"
PROBE_JSONL="${RUN_ROOT}/verify-backfill-probes-${RUN_TS}.jsonl"
REPORT_JSON="${RUN_ROOT}/verify-backfill-report-${RUN_TS}.json"

RUN_ID_LIST_FILE="${RUN_ROOT}/verify-backfill-run-ids-${RUN_TS}.txt"
ls -1t "${RUN_ROOT}"/backfill-*.summary.json 2>/dev/null | head -n 30 | while read -r summary_file; do
  jq -r 'select(.mode=="apply") | .run_id // empty' "$summary_file"
done | awk 'NF' | awk '!seen[$0]++' >"$RUN_ID_LIST_FILE"

if [[ ! -s "$RUN_ID_LIST_FILE" ]]; then
  fail "no apply run_id found under ${RUN_ROOT}/backfill-*.summary.json"
fi

MEM0_RUN_IDS=()
while IFS= read -r run_id; do
  [[ -n "$run_id" ]] || continue
  MEM0_RUN_IDS+=("$run_id")
done <"$RUN_ID_LIST_FILE"

log "mem0 run_ids candidates=$(paste -sd, "$RUN_ID_LIST_FILE")"

PROBES=(
  "牧启航"
  "Telegram 优先"
  "Jarvis OS"
  "Mem0 Graphiti 记忆升级"
  "thinktank/topology"
)

log "mem0 user_id=${MEM0_USER_ID}"
log "graphiti groups=${GRAPHITI_GROUP_CANONICAL},${GRAPHITI_GROUP_TOPICS},${GRAPHITI_GROUP_DAILY}"

for probe in "${PROBES[@]}"; do
  mem0_count=0
  mem0_hit_run_id=""
  mem0_top_id=""
  for mem0_run_id in "${MEM0_RUN_IDS[@]}"; do
    mem0_payload="$(jq -nc --arg query "$probe" --arg user_id "$MEM0_USER_ID" --arg run_id "$mem0_run_id" '{query:$query,user_id:$user_id,run_id:$run_id}')"
    mem0_response="$(curl -fsS -X POST "http://127.0.0.1:${MEM0_PORT}/search" -H 'content-type: application/json' -d "$mem0_payload" 2>/dev/null || echo '{"results":[]}')"
    this_count="$(echo "$mem0_response" | jq '(.results // []) | length' 2>/dev/null || echo 0)"
    if [[ "$this_count" -gt "$mem0_count" ]]; then
      mem0_count="$this_count"
      mem0_hit_run_id="$mem0_run_id"
      mem0_top_id="$(echo "$mem0_response" | jq -r '(.results // [])[0].id // ""' 2>/dev/null || true)"
    fi
  done

  graphiti_payload="$(jq -nc \
    --arg query "$probe" \
    --arg g1 "$GRAPHITI_GROUP_CANONICAL" \
    --arg g2 "$GRAPHITI_GROUP_TOPICS" \
    --arg g3 "$GRAPHITI_GROUP_DAILY" \
    '{group_ids:[$g1,$g2,$g3],query:$query,max_facts:10}')"
  graphiti_response="$(curl -fsS -X POST "http://127.0.0.1:${GRAPHITI_PORT}/search" -H 'content-type: application/json' -d "$graphiti_payload" 2>/dev/null || echo '{}')"
  graphiti_facts_count="$(echo "$graphiti_response" | jq '(.facts // []) | length' 2>/dev/null || echo 0)"
  graphiti_search_episodes_count="$(echo "$graphiti_response" | jq '(.episodes // []) | length' 2>/dev/null || echo 0)"
  graphiti_nodes_count="$(echo "$graphiti_response" | jq '(.nodes // []) | length' 2>/dev/null || echo 0)"

  episodes_match_count=0
  for group_id in "$GRAPHITI_GROUP_CANONICAL" "$GRAPHITI_GROUP_TOPICS" "$GRAPHITI_GROUP_DAILY"; do
    episodes_response="$(curl -fsS "http://127.0.0.1:${GRAPHITI_PORT}/episodes/${group_id}?last_n=500" 2>/dev/null || echo '[]')"
    group_match="$(echo "$episodes_response" | jq --arg query "$probe" '[.[] | ((.content // .message // .summary // "") | tostring) | select(test($query; "i"))] | length' 2>/dev/null || echo 0)"
    episodes_match_count=$((episodes_match_count + group_match))
  done

  graphiti_nonzero=0
  if [[ "$graphiti_facts_count" -gt 0 || "$graphiti_search_episodes_count" -gt 0 || "$graphiti_nodes_count" -gt 0 || "$episodes_match_count" -gt 0 ]]; then
    graphiti_nonzero=1
  fi

  printf 'probe=%s | mem0=%s (run_id=%s top_id=%s) | graphiti_facts=%s graphiti_search_episodes=%s graphiti_nodes=%s graphiti_episode_matches=%s\n' \
    "$probe" "$mem0_count" "${mem0_hit_run_id:-none}" "${mem0_top_id:-none}" "$graphiti_facts_count" "$graphiti_search_episodes_count" "$graphiti_nodes_count" "$episodes_match_count"

  jq -nc \
    --arg probe "$probe" \
    --argjson mem0_count "$mem0_count" \
    --arg mem0_hit_run_id "$mem0_hit_run_id" \
    --arg mem0_top_id "$mem0_top_id" \
    --argjson graphiti_facts_count "$graphiti_facts_count" \
    --argjson graphiti_search_episodes_count "$graphiti_search_episodes_count" \
    --argjson graphiti_nodes_count "$graphiti_nodes_count" \
    --argjson graphiti_episode_matches "$episodes_match_count" \
    --argjson graphiti_nonzero "$graphiti_nonzero" \
    '{
      probe:$probe,
      mem0_count:$mem0_count,
      mem0_hit_run_id:$mem0_hit_run_id,
      mem0_top_id:$mem0_top_id,
      graphiti_facts_count:$graphiti_facts_count,
      graphiti_search_episodes_count:$graphiti_search_episodes_count,
      graphiti_nodes_count:$graphiti_nodes_count,
      graphiti_episode_matches:$graphiti_episode_matches,
      graphiti_nonzero:($graphiti_nonzero==1)
    }' >>"$PROBE_JSONL"
done

mem0_hits="$(jq -s '[.[] | select(.mem0_count > 0)] | length' "$PROBE_JSONL")"
graphiti_hits="$(jq -s '[.[] | select(.graphiti_nonzero == true)] | length' "$PROBE_JSONL")"

pass=true
if [[ "$mem0_hits" -lt 3 ]]; then
  pass=false
fi
if [[ "$graphiti_hits" -lt 3 ]]; then
  pass=false
fi

jq -n \
  --arg generated_at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg mem0_user_id "$MEM0_USER_ID" \
  --arg graphiti_group_prefix "$GRAPHITI_GROUP_PREFIX" \
  --argjson mem0_hits "$mem0_hits" \
  --argjson graphiti_hits "$graphiti_hits" \
  --argjson pass "$( [[ "$pass" == true ]] && echo 1 || echo 0 )" \
  --slurpfile probes "$PROBE_JSONL" \
  '{
    generated_at:$generated_at,
    mem0_user_id:$mem0_user_id,
    graphiti_group_prefix:$graphiti_group_prefix,
    pass_criteria:{
      mem0_at_least_three_of_five:true,
      graphiti_at_least_three_of_five:true
    },
    results:{
      mem0_hits:$mem0_hits,
      graphiti_hits:$graphiti_hits,
      pass:($pass==1)
    },
    probes:$probes
  }' >"$REPORT_JSON"

cat "$REPORT_JSON"

if [[ "$pass" != true ]]; then
  fail "verification failed: mem0_hits=${mem0_hits}, graphiti_hits=${graphiti_hits}"
fi

log "verification passed: mem0_hits=${mem0_hits}, graphiti_hits=${graphiti_hits}"
