# Ontology v1 (W3-C Iter-1) Frozen Facts

## Scope

- Version: `v1`
- Status: frozen for W3-C minimal closed loop
- Write path: Graphiti `/messages` content marker only (no request-body contract extension)
- Marker prefix: `OC_ONTOLOGY_V1:`

## Entity Types (minimum fields)

All entity types in v1 MUST carry the same minimum field set:

- `id`: stable identity string (within `group_id` scope)
- `name`: short label
- `summary`: concise semantic summary
- `source_ref`: upstream source reference (`agent_end:*` etc.)
- `created_at`: ISO-8601 timestamp
- `group_id`: Graphiti group boundary
- `session_key`: OpenClaw session boundary (same as group_id in Iter-1)

### 1) Decision

- Semantics: the chosen decision statement for the turn/event.
- Suggested identity key: `decision:{hash(group_id + candidate.memory_id + "decision")}`.

### 2) Project

- Semantics: project/system context that the decision belongs to.
- Source in Iter-1: tag prefix `project:`.

### 3) Reason

- Semantics: rationale/evidence points supporting the decision.
- Source in Iter-1: tag prefix `reason:` (multi-value).

### 4) RejectedOption

- Semantics: alternative options explicitly not chosen.
- Source in Iter-1: tag prefix `rejected:` (multi-value).

## Relation Semantics

v1 declares (at minimum) the following directed relations:

- `Decision->Project`
- `Decision->Reason`
- `Decision->RejectedOption`

In Iter-1 these relations are encoded in the marker JSON as auditable relation records.

## Dedup / Identity Rule (within same group_id)

- Dedup scope: same `group_id` only.
- Identity key strategy:
  - Decision: based on `group_id + candidate.memory_id + literal("decision")`.
  - Project: based on `group_id + project_name`.
  - Reason: based on `group_id + reason_text`.
  - RejectedOption: based on `group_id + rejected_option_text`.
- Cross-group dedup is explicitly out of scope for v1.

## Activation, Compatibility, Rollback

- Default OFF:
  - `p3.graphiti_ontology_v1.enabled = false`
  - `p3.graphiti_ontology_v1.sample_percent = 0`
- Activation guard (all required):
  1. flag enabled
  2. sample hit
  3. has tags
  4. decision-class candidate
  5. NOT in `precision_key_bucket` / `exact_id`
- Degrade reasons (auditable):
  - `flag_disabled`
  - `sample_percent_zero`
  - `sample_skipped`
  - `no_tags`
  - `non_decision_candidate`
  - `precision_key_bucket`
  - `ontology_empty`
- Rollback:
  - Set `enabled=false` (or `sample_percent=0`) to stop marker writes immediately.
  - Existing stored markers are inert historical records; no contract migration required.

## Contract Safety (Iter-1)

- Graphiti request body schema remains `group_id + messages`.
- Ontology payload is appended only inside `messages[*].content` as one parseable marker line.
- No additional top-level request fields are introduced in Iter-1.
