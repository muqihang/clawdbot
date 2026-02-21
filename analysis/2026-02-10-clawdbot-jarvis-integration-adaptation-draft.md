# Clawdbot - Jarvis KB 适配设计草案（仅设计，不实施）

## 1. 设计目标与非目标

### 1.1 目标

1. 在不改动 Clawdbot 业务行为的前提下，给出可执行的 Jarvis KB 接入方案。
2. 将 Jarvis KB 14 工具映射到 Clawdbot 能力面，明确 1:1 / 1:N / 缺口。
3. 设计“双记忆系统”冲突规避：避免重复写入、版本冲突、不可审计写入。
4. 给出两阶段方案：MVP（低风险）-> 增强版（治理增强）。

### 1.2 非目标

- 不在本轮实现任何运行时代码。
- 不新增/修改 Gateway 协议或插件代码。
- 不引入生产发布流程变更。

## 2. 现状约束（设计输入）

- Clawdbot 记忆目前是 memory slot 互斥机制（`memory-core` vs `memory-lancedb`），且默认 `memory-core`（CODE-065~073）。
- Clawdbot 长期记忆不存在统一 revision/supersede contract（CMD-31, CODE-052）。
- Jarvis KB 14 工具已具备标准 envelope（`schema_version/request_id/degraded_reasons/knowledge_cut`）（CODE-097~116）。
- Clawdbot 具备“超级入口 + 插件扩展点”（`runMessageAction`、gateway methods、plugin registry）（CODE-079/080/084）。

## 3. 能力映射矩阵（Jarvis 14 工具）

| Jarvis 工具           | Clawdbot 现状能力                             | 映射类型 | 适配设计建议                                                                 | 风险等级 |
| --------------------- | --------------------------------------------- | -------- | ---------------------------------------------------------------------------- | -------- |
| `kb_search`           | `memory_search` + 内部 hybrid 检索            | 1:N      | 适配器优先调用 Jarvis `kb_search`，Clawdbot `memory_search` 仅做本地降级兜底 | 中       |
| `kb_get_chunk`        | `memory_get`（单文件/行范围）                 | 1:N      | 统一转换为 `get_chunk(path, line-range)` 抽象；保持 citation                 | 低       |
| `kb_get_chunks`       | 无原生批量 get；可循环 `memory_get`           | 1:N      | 适配层做批量 fan-out + 聚合                                                  | 中       |
| `kb_discovery`        | 无原生 recommend graph 能力                   | 缺口     | 直连 Jarvis，Clawdbot 不模拟                                                 | 中       |
| `kb_symbol_lookup_pg` | 无 symbol 索引服务                            | 缺口     | 仅 Jarvis 提供；Clawdbot 不做伪等价                                          | 中       |
| `kb_impact_report_pg` | 无 PG 影响分析器                              | 缺口     | 仅 Jarvis 提供；Clawdbot 只做结果展示                                        | 中       |
| `kb_graph_neighbors`  | 无图谱邻居检索                                | 缺口     | 仅 Jarvis 提供；必要时加缓存                                                 | 中       |
| `kb_health`           | Clawdbot 有 health/gateway status             | 1:N      | 健康检查拆成 `jarvis_kb.health + openclaw.health` 双探针                     | 低       |
| `kb_capabilities`     | Clawdbot 可列工具/方法                        | 1:N      | 统一能力探针，返回 Jarvis+Clawdbot 合并能力面                                | 低       |
| `kb_store_artifact`   | Clawdbot 无统一 artifact 存储                 | 缺口     | 由 Jarvis 做 SoR；Clawdbot 仅保留引用 ID                                     | 中       |
| `kb_get_artifact`     | Clawdbot 无 artifact API                      | 缺口     | 直连 Jarvis 并透传 envelope                                                  | 低       |
| `kb_feedback`         | Clawdbot 无 KB 反馈管道                       | 缺口     | 由 Jarvis 接收；Clawdbot 仅转发上下文                                        | 低       |
| `kb_memory_propose`   | Clawdbot 有 memory_store（lancedb）但非双阶段 | 1:N/缺口 | 长期记忆改走 propose（不直接 commit）                                        | 高       |
| `kb_memory_commit`    | Clawdbot 无 evidence+confirm 写盘门禁         | 缺口     | 由 Jarvis commit 执行，Clawdbot 禁止并行长期写                               | 高       |

## 4. 推荐集成边界（SoR vs RAG）

## 4.1 角色划分

- **SoR（System of Record）**：Jarvis KB
  - 原因：已具备 envelope、memory 写门禁、artifact/feedback 合约（CODE-099/100/113/114/116）。
- **检索增强层（runtime RAG）**：Clawdbot
  - 原因：与会话执行链深度耦合，擅长就地注入上下文（CODE-010~016, CODE-035~048）。

## 4.2 边界规则

1. 短期会话状态：始终留在 Clawdbot（session/transcript）。
2. 长期记忆写入：默认只走 Jarvis propose/commit。
3. Clawdbot builtin/qmd memory：仅作为读取缓存或降级路径，不作为主写路径。

## 5. 双记忆冲突规避策略（核心）

## 5.1 写入策略（DualMemoryWritePolicy）

- `clawdbot_sor`：仅限离线应急，平时禁用。
- `jarvis_sor`（推荐默认）：长期记忆写入只走 Jarvis。
- `split_sor`：仅在明确场景开启，必须配置幂等键与回写规则。

## 5.2 幂等与去重

- 每次写入请求必须带：
  - `idempotency_key`（建议：`sha256(sessionKey + normalized_content + source_ts)`）
  - `source`（`clawdbot`/`jarvis`）
  - `request_id`（对齐 Jarvis envelope）
- 先 propose，再 commit；commit 前再次比对相似度与内容 hash。

## 5.3 版本冲突与 supersede

- 由于 Clawdbot 内建 memory 缺少 revision/supersede（CMD-31），建议把版本语义放在 Jarvis：
  - `supersedes`：旧条目 ID
  - `confidence`
  - `ttl`
  - `audit_ref`
- Clawdbot 仅保存引用，不维护长期版本树。

## 5.4 EvidenceEnvelope（建议标准）

统一响应/写入回执结构（设计稿）：

```ts
interface EvidenceEnvelope {
  request_id: string;
  source: "clawdbot" | "jarvis";
  schema_version: string;
  degraded_reasons?: string[];
  knowledge_cut?: {
    cut_id: string;
    max_observed_at?: string;
    staleness: "fresh" | "unknown" | "likely_stale";
  };
  audit?: {
    idempotency_key?: string;
    supersedes?: string[];
    confidence?: number;
    ttl?: string;
    trace?: string;
  };
}
```

## 6. 推荐调用收敛（超级入口设计）

在 Clawdbot 侧新增（设计层）3 个超级入口：

1. `jarvis_kb.query`
   - 统一承接：`kb_search/get_chunk/get_chunks/discovery/graph/symbol/impact`
2. `jarvis_kb.artifact`
   - 统一承接：`kb_store_artifact/get_artifact/feedback`
3. `jarvis_kb.memory`
   - 统一承接：`kb_memory_propose/commit`

这样做的原因：

- 对 Clawdbot 调用端稳定（少接口，低耦合）
- 对 Jarvis 端可演进（内部路由 14 工具）
- 可复用现有 Gateway/Plugin 扩展机制（CODE-079/084）

## 7. 两阶段实施建议（MVP -> 增强版）

## 7.1 阶段一：MVP（低风险，可回滚）

目标：只打通读取与受控写入，不改现有主链逻辑。

- 范围：
  - 接入 `kb_search/get_chunk/get_chunks/health/capabilities`
  - 长期写入仅 `kb_memory_propose`（默认不自动 commit）
- 策略：
  - Clawdbot 保持现有 session/transcript
  - 长期记忆 commit 需要显式确认
- 回滚：
  - 一键关闭 Jarvis adapter，退回 Clawdbot 本地 memory read path

验收标准：

1. 读请求成功率 >= 99%
2. 无重复长期写入（幂等校验通过）
3. 关键响应包含 `request_id` + `schema_version`

## 7.2 阶段二：增强版（治理与可观测）

目标：纳入 artifact/feedback、完整审计、降级治理。

- 范围：
  - 开启 `artifact`/`feedback` 全链路
  - memory propose->commit 自动化（需策略门禁）
  - 接入 `degraded_reasons` 观测与告警
- 治理：
  - 增加 `knowledge_cut` 监控
  - 增加冲突分流策略（supersede + confidence）

验收标准：

1. 关键调用可追踪（request_id 串联）
2. 发生降级时可定位根因（degraded_reasons）
3. 长期记忆写入可审计（audit_ref + idempotency_key）

## 8. 风险与缓解

| 风险       | 表现                                | 缓解                                        |
| ---------- | ----------------------------------- | ------------------------------------------- |
| 双写冲突   | 同一知识在 Clawdbot/Jarvis 重复写入 | 强制 `jarvis_sor` + 幂等键 + propose/commit |
| 语义漂移   | 检索结果与会话上下文不一致          | 请求附 `knowledge_cut`，必要时回退本地检索  |
| 延迟上升   | 串行调用 14 工具导致响应慢          | 超级入口聚合 + 并发 fan-out + budget 限流   |
| 降级不可见 | 失败后仅返回空结果                  | 强制 envelope 透出 `degraded_reasons`       |
| 文档漂移   | 旧分析结论误导实施                  | 以本报告证据索引为实施基线                  |

## 9. 进入实施前必须满足的前置条件

1. 确认 SoR：默认 `jarvis_sor`。
2. 确认 envelope 标准：request_id/schema_version/degraded_reasons/knowledge_cut。
3. 确认写策略：`kb_memory_propose` 是否自动进入 commit。
4. 明确离线策略：Jarvis 不可用时是否允许临时本地长期写入。
5. 建立回滚开关：可在运行时关闭 Jarvis adapter。

## 10. 结论

- Clawdbot 已具备接入 Jarvis KB 的结构条件（入口、扩展、降级、会话链路完整）。
- 关键挑战不在“能不能调通”，而在“长期记忆 SoR 与冲突治理”。
- 推荐先走 MVP（读优先 + propose 受控写），再逐步启用 commit 自动化与治理增强。
