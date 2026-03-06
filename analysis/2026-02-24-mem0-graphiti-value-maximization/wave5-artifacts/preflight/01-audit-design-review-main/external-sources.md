# 外部资料与启发

## 1. Graphiti 官方文档：命名空间

- 来源：`https://help.getzep.com/graphiti/core-concepts/graph-namespacing`
- 相关性：直接回答 `group_id / group_ids` 在 `Graphiti` 里的官方定位。
- 关键事实：官方把它定义为命名空间，并明确写出“通过限制搜索空间提升查询性能”。
- 对当前方案的意义：当前 bridge 还没用这条能力，所以 `Graphiti` 还有正式的性能优化空间。

## 2. Graphiti 官方文档：搜索

- 来源：`https://help.getzep.com/graphiti/working-with-data/searching`
- 相关性：直接对应我们当前的图检索与重排设计。
- 关键事实：官方默认搜索是“语义相似度 + BM25”的混合搜索，并支持焦点节点重排、低层 `SearchConfig` 与多种重排策略。
- 对当前方案的意义：当前 bridge 按时间关系走 `Graphiti` 的方向是合理的，但还没有完全吃到官方搜索能力的全部价值。

## 3. Graphiti 社区问题：多组全文检索缺陷风险

- 来源：`https://github.com/getzep/graphiti/issues/1249`
- 相关性：如果后续要用 `group_ids` 做限组提速，这个问题会直接影响设计。
- 关键事实：社区已经报告多 `group_id` 下全文检索存在只实际使用最后一个组的风险。
- 对当前方案的意义：后续不能直接乐观上“多组限搜”，要先单组验证，或先修该缺陷。

## 4. Mem0 官方文档：搜索接口

- 来源：`https://docs.mem0.ai/api-reference/memory/search-memories`
- 相关性：直接对应我们补的 `user_id / agent_id / run_id` 搜索作用域。
- 关键事实：官方把这些字段视作可过滤搜索维度，搜索还支持更复杂的过滤表达。
- 对当前方案的意义：我们把作用域字段补齐是正确方向，而且 `Mem0` 更适合做“作用域化事实记忆”，而不是时序图检索。

## 5. Mem0 官方文档：实体作用域记忆

- 来源：`https://docs.mem0.ai/platform/features/entity-scoped-memory`
- 相关性：解释 `user_id / agent_id / app_id / run_id` 的真实设计意图。
- 关键事实：官方明确把 `run_id` 当成短期会话或流程隔离键，把 `user_id`、`agent_id` 当成更长期的作用域。
- 对当前方案的意义：`Mem0` 的核心价值是带作用域的长期事实层，而不是替代本地层或图层。

## 6. Neo4j 官方驱动文档：连接方案

- 来源：`https://neo4j.com/docs/python-manual/current/connect-advanced/`
- 相关性：直接对应我们在 `Aura` 连接上遇到的 `routing` 与直连问题。
- 关键事实：官方把 `neo4j+s` 视为 `Aura` 默认常见方案；如果想连接到指定机器，应使用 `bolt` / `bolt+s` / `bolt+ssc`。
- 对当前方案的意义：当前脚本里把 `Aura` 地址自动规整成 `bolt+s` 更像本地稳定性兜底，不应长期作为“隐式默认”。

## 7. Qdrant 官方文档：索引与过滤

- 来源：`https://qdrant.tech/documentation/concepts/indexing/`
- 相关性：对应 `Mem0` 走 `Qdrant` 时的过滤与延迟问题。
- 关键事实：官方明确指出，向量索引只能加速相似检索，payload 索引才能加速过滤；过滤搜索想快，必须有对应 payload 索引。
- 对当前方案的意义：`Mem0` 这一路的性能评价不能只看向量模型，还要看过滤字段是否真正被索引。

## 8. Qdrant 官方文档：搜索与库优化

- 来源：
  - `https://qdrant.tech/documentation/concepts/search/`
  - `https://qdrant.tech/documentation/faq/database-optimization/`
- 相关性：对应长尾延迟与过滤搜索表现。
- 关键事实：
  - 严格过滤场景下可考虑更适合过滤的搜索算法；
  - 没有对应 payload 索引时，过滤会明显拖慢请求；
  - 磁盘与 `limit/offset` 等参数也会影响延迟。
- 对当前方案的意义：`Mem0` 路径的优化空间不只是模型，还包括底层过滤与查询参数治理。
