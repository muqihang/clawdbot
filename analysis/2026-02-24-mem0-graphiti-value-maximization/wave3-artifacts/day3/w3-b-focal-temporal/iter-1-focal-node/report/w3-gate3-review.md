# W3-B Iter-1 Gate-3 Review

## 单变量
- 仅验证 graphiti_focal_node（recipe routing 固定开启，temporal filters 关闭）。

## 关键观测
- hit@1 baseline=0.0588 / variant=1 / delta_pp=94.12
- hit@3 baseline=1 / variant=1 / delta_pp=0
- episodes coverage baseline=1 / variant=1
- nodes coverage baseline=0 / variant=0.9412

## 证据说明
- bounded=5 + stability=10，sample+aliases 每次检索均落盘 search.raw + search.topk。
- search.raw 含 requestBody（含 focal_node_uuid）、route/recipe/focal_node trace，便于审计。
- 本轮仅产出可复验对比证据，不作 Gate-3 最终 Go/No-Go 结论。
