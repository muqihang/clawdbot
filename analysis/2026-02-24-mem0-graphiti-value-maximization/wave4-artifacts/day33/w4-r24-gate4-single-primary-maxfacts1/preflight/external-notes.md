# 外部资料速记

- Graphiti namespacing：`group_id` / `group_ids` 的官方定位就是命名空间，并明确提到可通过缩小搜索空间提升查询性能。
- Graphiti searching：官方支持混合搜索、焦点节点重排、不同重排器。
- Graphiti 社区问题 `#1249`：多 `group_id` 的全文检索存在只实际使用最后一个组的缺陷风险。
- Mem0 搜索文档：`user_id` / `agent_id` / `run_id` 是搜索作用域关键字段，过滤是官方推荐做法。

## 直接含义

1. 我们给 bridge 补 `mem0` 标识字段是正路。
2. `group_ids` 是 Graphiti 官方支持且可能提速的手段。
3. 但基于 `#1249`，下一步不能直接乐观上“多组限搜”，要么先单组验证，要么先修该缺陷。
