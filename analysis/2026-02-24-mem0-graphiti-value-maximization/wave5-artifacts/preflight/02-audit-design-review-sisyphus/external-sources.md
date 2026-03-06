# 外部资料清单

## 1. Graphiti 官方文档

### 1.1 Graph Namespacing

- 链接：`https://help.getzep.com/graphiti/core-concepts/graph-namespacing`
- 相关性：解释 `group_id / group_ids` 的官方定位。
- 关键启发：官方明确把命名空间写成性能优化手段之一，不只是多租户隔离手段。

### 1.2 Searching the Graph

- 链接：`https://help.getzep.com/graphiti/working-with-data/searching`
- 相关性：解释 `Graphiti` 官方推荐的搜索方式、混合检索、节点距离重排与 recipe。
- 关键启发：当前本地 bridge 只吃到了浅层 `/search` 能力，还没有真正使用官方推荐的图检索策略组合。

### 1.3 Search Graph API

- 链接：`https://help.getzep.com/sdk-reference/graph/search`
- 相关性：官方 API 说明了 `limit`、`scope`、`reranker`、`center_node_uuid` 等参数。
- 关键启发：当前 bridge 的 Graphiti 接入仍显著保守，能力利用率偏低。

## 2. Graphiti 官方仓库与社区问题

### 2.1 多 group_id 全文检索问题

- 链接：`https://github.com/getzep/graphiti/issues/1249`
- 相关性：直接关系到下一步 `group_ids` 限组优化能不能安全上线。
- 关键启发：如果不先验证或修复，这个坑会让“多组限搜”变成隐蔽质量风险。

### 2.2 Graphiti 源码搜索实现

- 本地 pinned ref：`510bd50d5408477bc172b63b5567b753b50b9d11`
- 相关文件：`graphiti_core/search/search_utils.py`
- 关键启发：本地 pinned 版本的实现方式与社区问题描述是对得上的，因此这个风险不是空穴来风。

## 3. Mem0 官方文档

### 3.1 Search Memories

- 链接：`https://docs.mem0.ai/api-reference/memory/search-memories`
- 相关性：官方定义了搜索的 filters 语义以及 `user_id / agent_id / run_id` 等字段的作用。
- 关键启发：bridge 里补这些字段不是“本地特判”，而是和官方设计一致。

### 3.2 Entity-Scoped Memory

- 链接：`https://docs.mem0.ai/platform/features/entity-scoped-memory`
- 相关性：解释为什么这些标识不是附件，而是记忆作用域主键。
- 关键启发：`Mem0` 更适合作为“治理与作用域层”，而不是简单第二检索器。

## 4. Neo4j 官方文档

### 4.1 Driver connect advanced

- 链接：`https://neo4j.com/docs/python-manual/current/connect-advanced/`
- 相关性：官方解释 `neo4j+s`、`bolt+s`、routing 和直连的差异。
- 关键启发：官方默认更偏向 `neo4j+s` / Aura 规范连接；我们当前的 `bolt+s` 更像本机稳定性修正，不应被误当成官方默认最佳实践。

## 5. Qdrant 官方文档

### 5.1 Database optimization / indexing

- 链接：`https://qdrant.tech/documentation/faq/database-optimization`
- 链接：`https://qdrant.tech/documentation/concepts/indexing`
- 相关性：过滤性能、payload index、向量检索延迟。
- 关键启发：过滤与向量索引应被一起设计；如果未来 `Mem0` 侧进一步加过滤，必须同步考虑 payload index，而不是只看召回逻辑。

## 6. 这些外部资料对当前方案的总体启发

1. 当前方案的总体方向没有违背官方最佳实践，但**Graphiti 能力利用率明显偏低**。
2. `Mem0` 的作用域字段是官方主路径，不是临时修补。
3. 下一步最值得做的性能优化是 `Graphiti` 限组搜索，但要避开社区已知坑。
4. 未来 `W5` 不应该只做“更多流量”，而应把 external contract、scope、limit、reranker、namespace 这些官方概念正式纳入设计骨架。
