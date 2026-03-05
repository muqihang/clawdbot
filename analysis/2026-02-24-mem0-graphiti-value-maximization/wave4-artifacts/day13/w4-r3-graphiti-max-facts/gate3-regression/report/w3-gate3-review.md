# W3-D Gate-3 Final Runner Notes

## Baseline vs Variant（冻结口径）
- baseline：recipe/focal/temporal 全关闭（sample_percent=0），ontology_readback 关闭。
- variant：recipe/focal/temporal 全开启（sample_percent=100），ontology_readback 关闭。

## 关键观测
- hit@1 baseline=0 / variant=1 / delta_pp=100
- hit@3 baseline=0 / variant=1 / delta_pp=100
- episodes coverage baseline=0 / variant=1
- nodes coverage baseline=0 / variant=1

## Mock Graphiti payload 设计（审计要点）
- baseline：facts-only，不产出 episodes/nodes（coverage baseline=0）。
- variant：主调用产出 episodes+nodes，并把 expected_id 放到 episodes top1（稳定提升 hit@1）。
- 每次 run 固定 deterministic payload（用于 stability unique-values=1 断言）。

## 证据说明
- bounded=5 + stability=10，sample+aliases 每次检索均落盘 search.raw + search.topk。
- search.raw 含 requestBody（含 focal_node_uuid + temporal_filters）、route/recipe/focal_node/temporal_filters trace。
- 本轮仅产出可复验对比证据，不作 Gate-3 最终 Go/No-Go 结论。
