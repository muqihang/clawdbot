# 建议优先级

## P0：进入 W5 前必须明确

### P0-1：确认 W5 进入口径

- 结论：可以进入 W5，但必须把风险清单写进 W5 入口文档。
- 原因：W4 已 GO，但不代表架构已经彻底定型。

### P0-2：把 upstream 契约测试纳入常规回归

- 覆盖 `Mem0` 搜索字段、`Graphiti` 搜索响应字段、Neo4j 连接假设。
- 不允许再靠“现象排障”才发现契约变化。

### P0-3：冻结当前默认策略

- local fallback = builtin
- fusion 默认 = single-primary + fallback
- embeddings = DashScope `text-embedding-v4@1536`
- 禁止回退到 `18082`

## P1：W5 早期应解决

### P1-1：拆分 bridge 核心逻辑

- 把路由、远端执行、融合、观测拆开。
- 目的：降低 `memory-search-tool.ts` 的耦合和回归风险。

### P1-2：安全接入 `Graphiti group_ids`

- 先做单组限搜或先修多组缺陷。
- 目标：继续降低尾延迟，而不是继续压召回预算。

### P1-3：补齐图原生能力利用

- 把 `Graphiti` 从 generic `/search` 适配器升级成真正的图检索子系统。
- 重点：焦点节点、reranker、搜索范围控制。

### P1-4：增加 stack 指纹与环境自检

- 每次评测和上线前输出：upstream ref、env 摘要、端口、模型、向量维度、Neo4j URI scheme。
- 目标：减少“环境以为一样，其实不一样”。

## P2：可以延期

### P2-1：更丰富的 Graphiti 重排器实验

- 比如 cross-encoder / episode mentions / node distance 更精细化组合。

### P2-2：进一步优化 Qdrant 侧过滤与索引

- 特别是未来若 `Mem0` 过滤更复杂时，要同步验证 payload index。

### P2-3：重新评估 qmd 的长期位置

- 当前不建议放回主线，但未来若运行环境变化，可重新评估它是否有独立价值。
