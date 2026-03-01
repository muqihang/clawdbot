# W3-B Iter-2 Gate-3 Review

## 单变量
- 仅验证 graphiti_temporal_filters（recipe routing + focal-node 固定开启）。

## 关键观测
- hit@1 baseline=0.0588 / variant=0.2941 / delta_pp=23.53
- hit@3 baseline=1 / variant=1 / delta_pp=0
- episodes coverage baseline=1 / variant=1
- nodes coverage baseline=0.9412 / variant=0.9412

## 证据说明
- bounded=5 + stability=10，sample+aliases 每次检索均落盘 search.raw + search.topk。
- search.raw 含 requestBody（含 focal_node_uuid + temporal_filters）、route/recipe/focal_node/temporal_filters trace。
- 本轮仅产出可复验对比证据，不作 Gate-3 最终 Go/No-Go 结论。
