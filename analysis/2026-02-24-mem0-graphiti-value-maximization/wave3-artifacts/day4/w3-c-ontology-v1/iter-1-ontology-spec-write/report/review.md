# W3-C Iter-1 Review (Ontology Spec + Write Signal)

## Single Variable Boundary

- This iteration only delivers ontology v1 frozen facts + write-side auditable marker signal.
- No readback parsing, ranking change, or Gate-3 decision logic is introduced.

## What Was Verified

- `p3.graphiti_ontology_v1` default is OFF (`enabled=false`, `sample_percent=0`).
- With flag OFF, Graphiti `/messages` body shape remains unchanged.
- With flag ON and decision tags present, one-line marker is appended in `messages.content`.
- With `precision_key_bucket`/`exact_id`, ontology signal degrades and marker is not appended.

## Contract + Rollback

- Contract preserved: write request remains `group_id + messages`.
- Rollback path: set `p3.graphiti_ontology_v1.enabled=false` (or `sample_percent=0`).

## Out of Scope

- Readback parsing and evaluation reports are deferred to Iter-2.
