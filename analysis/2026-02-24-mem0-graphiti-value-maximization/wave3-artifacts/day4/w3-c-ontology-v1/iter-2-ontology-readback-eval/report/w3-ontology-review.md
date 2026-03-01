# W3-C Iter-2 Review (Ontology Readback + Reporting)

## Single Variable Boundary

- This iteration only enables/disables `read.graphiti_ontology_readback` and audits the parse/report path.
- Query routing, ranking, recipe/focal/temporal logic remain unchanged.

## Key Metrics

- ontology_marker_presence_rate baseline=0 variant=0.3333
- ontology_parse_success_rate baseline=0 variant=1
- top1_hit_rate baseline=1 variant=1

## Notes

- baseline vs variant uses same dataset, same mock retrieval payload, same bounded/stability runs.
- Raw retrieval artifacts include request body and route/recipe/focal/temporal/ontology traces.
- Gate-3 decision remains out of scope for W3-C.
