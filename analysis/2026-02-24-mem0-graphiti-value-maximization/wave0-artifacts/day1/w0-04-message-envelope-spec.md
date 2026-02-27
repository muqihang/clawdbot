# W0-04 Message Envelope 草案（可执行 / 可验收 / 可回滚）

## 1) 执行元信息

- ArtifactID: `W0-04-MESSAGE-ENVELOPE-SPEC`
- Author: `子代理 #W0-04-Implementer（Wave0 Day1）`
- Workspace: `/Users/muqihang/chelingxi_workspace/clawdbot`
- Executed At (UTC): `2026-02-25T03:48:21Z`
- Executed At (Local): `2026-02-25T11:48:21+08:00`
- Timezone: `Asia/Shanghai (UTC+08:00, CST)`
- Scope: 仅产出 W0-04 Message Envelope 草案；不展开 W1~W5 实现，不修改业务代码。

## 2) 输入基线与硬边界

- W0-04 的目标、最小字段与回滚要求已在任务包中固定：冻结 `role/name/created_at/metadata/ignore_roles`，兼容旧 payload，支持默认关闭与回滚。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:152`, `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:159`, `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:160`, `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:161`, `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:166`）
- V1.1 已把 W0-04 验收口径写明为“字段最小集冻结 + 兼容现有 payload + 新字段全可选”。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:180`）
- Zep 对照项明确了本轮需要补齐的 message governance 语义：`ignore_roles`、`metadata`、`created_at`，并建议把 outbox payload 扩展为 message envelope。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:72`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:73`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:74`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:79`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:80`）

## 3) 现状盘点（as-is）

### 3.1 当前 outbox payload 字段（candidate + metadata）

- P3 类型定义中，`P3CandidatePayload` 只有两层：`candidate`（必填）+ `metadata`（可选），其中 `metadata` 当前子字段为 `userText/assistantText/tags/indexCheckOk`。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:13`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:14`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:15`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:16`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:17`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:18`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:19`）
- 在线捕获入队时，实际写入 payload 也仅包含 `candidate` 与 `metadata.userText/assistantText/indexCheckOk`。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:182`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:189`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:190`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:191`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:192`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:193`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:194`）
- outbox 持久化层按 `payload_json` 原样入库，不对 payload 做字段裁剪。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:360`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:382`）

### 3.2 mem0 写入消息体字段（as-is）

- mem0 请求体固定写两条 `messages`：`role=user|assistant` + `content`，并携带 `user_id/agent_id/run_id/metadata`。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:125`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:126`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:128`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:132`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:136`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:137`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:138`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:139`）
- mem0 元信息已带事件上下文字段（`event_id/session_key/model/write_mode/source_ref/source_tier/candidate_memory_id/fact_key`），说明 envelope 增强可以走“新增可选字段”而非改旧契约。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:141`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:142`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:143`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:144`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:145`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:146`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:147`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:148`）

### 3.3 graphiti 写入消息体字段（as-is）

- graphiti 请求体使用 `group_id + messages[]`，单条消息含 `content/role_type/role/timestamp`。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:172`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:173`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:174`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:177`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:178`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:179`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:183`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:184`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:185`）
- 当前 graphiti `timestamp` 来自 candidate 的 `event_time/ingest_time`，而不是 outbox 行级 `created_at`。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:179`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:185`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:110`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:111`）

### 3.4 outbox 事件 `created_at` 来源（as-is）

- outbox store 初始化时将 `now` 设为 `options.now ?? Date.now`，属于系统时钟来源。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:308`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:309`）
- `enqueue` 里用 `timestamp = now()` 再转 `iso = new Date(timestamp).toISOString()`，并把该 `iso` 写入 `created_at/updated_at`。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:348`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:349`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:350`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:369`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:370`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:386`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:387`）

## 4) 最小字段集冻结（W0-04）

### 4.1 冻结范围

- 冻结对象：在保留现有 `payload.candidate` 与 `payload.metadata` 的前提下，新增可选容器 `payload.message_envelope`。
- 容器内最小字段集固定为：`role/name/created_at/metadata/ignore_roles`。
- 该冻结与 W0-04 任务包要求一致，且遵守“新增可选、旧字段直通”。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:159`, `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:160`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:180`）

### 4.2 字段定义（逐字段）

| 字段           | 类型                                                 | 必填/可选 | 默认值                                                            | 来源                                                        | 校验规则                                                                   |
| -------------- | ---------------------------------------------------- | --------- | ----------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `role`         | `"user" \| "assistant" \| "system" \| "tool"`        | 可选      | 缺省时不改变现有写入行为（仍沿用 mem0/graphiti 现有固定角色映射） | 在线捕获原消息角色（`message.role`）                        | 必须属于枚举；入库前统一小写；非法值丢弃并记 `contract` 类错误计数         |
| `name`         | `string`                                             | 可选      | `null`（缺省）                                                    | 优先取身份映射规范产物；未提供时可回退 `session_key` 派生值 | 长度 `1..128`；允许字符 `[a-zA-Z0-9._:-]`；不通过则置空                    |
| `created_at`   | `RFC3339 UTC string`                                 | 可选      | 缺省回退 `candidate.event_time`                                   | 优先取 envelope 显式时间；否则沿用 candidate 时间           | 必须能被 `Date.parse` 解析且带时区；不可晚于当前时间 `+5m`；异常则回退默认 |
| `metadata`     | `Record<string, unknown>`                            | 可选      | `{}`                                                              | 业务侧消息元信息（渠道、turn_id、source_ref 等）            | 必须为 JSON object（非数组）；序列化后建议 `<= 8KB`；超限按策略裁剪        |
| `ignore_roles` | `Array<"user" \| "assistant" \| "system" \| "tool">` | 可选      | `[]`                                                              | 由灰度配置与路由策略共同决定                                | 数组元素去重；仅允许枚举值；长度上限 `4`；非法元素删除并计数               |

字段来源依据：

- `role` 来源于在线捕获的原始消息角色。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:59`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:61`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:62`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:64`）
- `name` 可回退 `session_key` 派生，因为 outbox 事件已稳定包含 `session_key`。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:26`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:357`, `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:379`）
- `created_at` 可回退 `candidate.event_time`，该字段在候选生成阶段已写入。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:95`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:110`）
- `ignore_roles` 为本轮对齐 Zep 消息治理必选字段之一。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:72`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:80`）

## 5) 兼容策略（可落地）

### 5.1 兼容原则

- 原则 C1：新增字段全可选，不引入强制迁移。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:160`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:180`）
- 原则 C2：旧 payload 直通可运行，`candidate + metadata` 契约不变。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:13`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:14`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:15`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:96`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:100`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:104`）
- 原则 C3：写链路主闸门仍是 `write_mode`，不让 envelope 字段改变闸门语义。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:110`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:118`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:120`）

### 5.2 升级/降级行为矩阵（>=3 场景）

| 场景                          | Producer                                       | Consumer                                   | 预期行为                                                      | 升级/降级结论                                      |
| ----------------------------- | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- | -------------------------------------------------- |
| S1: 全量 legacy               | 只产出 `candidate + metadata`                  | legacy reader/writer                       | 100% 维持现状                                                 | 基线场景；可直接运行                               |
| S2: 新 producer + 旧 consumer | 产出 `candidate + metadata + message_envelope` | 只读取 legacy 字段                         | 旧 consumer 忽略 envelope，继续按 legacy 字段写 mem0/graphiti | 可先升 producer；降级只需停 producer envelope 输出 |
| S3: 旧 producer + 新 consumer | 只产出 legacy payload                          | 新 consumer 支持 envelope 但读取不到该字段 | consumer 回退默认值（不变更原有写行为）                       | 可先升 consumer；降级可直接关闭 envelope 解析      |
| S4: 双新（灰度）              | 产出 envelope（全可选）                        | 新 consumer                                | 仅在 flag 开启时读取 envelope；关闭时行为与 S1 相同           | 升级可灰度，降级可秒级关 flag                      |

## 6) 灰度开关与默认关闭策略

### 6.1 开关定义（默认 off）

- `p3.message_envelope.enabled`：`false`（默认关闭）。
- `p3.message_envelope.shadow_only`：`true`（默认仅 shadow，不影响远端写入主契约）。
- `p3.message_envelope.ignore_roles`：默认 `[]`。

默认关闭依据：

- W0-04 明确要求“定义灰度开关与默认关闭策略”。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:161`）
- V1.1 指出 filters/criteria 需“默认关闭、shadow 开启条件明确”。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:170`）
- Day0 基线处于保守写态（`write_mode=propose_only`，`outbox.enabled=false`），符合默认 off 策略。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:32`, `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:35`）

### 6.2 开启条件 / 回退条件

- 开启条件 E1：连续 2 个日窗 `outbox_failed=0` 且 `outbox_dead=0`。
- 开启条件 E2：仅 shadow 开启，不改主写契约。
- 回退条件 R1：连续 2 个日窗出现 `outbox_failed > 0` 或 `outbox_dead > 0`。
- 回退条件 R2：出现 envelope 相关 `contract` 错误桶持续增长。

条件依据：

- 稳态与回退阈值来自 V1.1 策略定义。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:35`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:36`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:42`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:49`）
- 错误桶口径来自 P3 错误分桶定义。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:9`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:196`, `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:197`）

### 6.3 风险边界与监控点

- 风险边界 BND-1：不得改变 `write_mode` 主闸门语义。
- 风险边界 BND-2：不得改写 legacy `candidate + metadata` 字段。
- 风险边界 BND-3：不得把 outbox 行级 `created_at` 与候选事件时间混用。
- 监控点 M1：`outbox.failed/dead`（日窗）。
- 监控点 M2：`contract` 错误桶占比。
- 监控点 M3：proposal/pending_review 老化趋势。

监控口径来源：

- outbox 状态指标与分账口径来自现有类型与策略文档。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:5`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:73`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:77`, `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:78`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:49`）

## 7) 示例与映射

### 7.1 legacy payload 示例（当前可运行）

```json
{
  "candidate": {
    "memory_id": "7a2c4d8e1f0ab123",
    "fact_key": "prefs.editor",
    "fact_value": "neovim",
    "ttl_class": "online_incremental",
    "confidence": 0.92,
    "status": "active",
    "source_event_id": "agent_end:sess-001:18:9ac38f1b",
    "detail_path": "memory/online/2026-02-25.md",
    "trigger_keywords": [],
    "active_context": true,
    "event_time": "2026-02-25T03:40:12.100Z",
    "ingest_time": "2026-02-25T03:40:12.100Z"
  },
  "metadata": {
    "userText": "my editor is neovim",
    "assistantText": "Noted, you use neovim.",
    "indexCheckOk": true
  }
}
```

示例依据：`candidate + metadata` 为当前入队真实结构。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:13`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:189`, `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:191`）

### 7.2 envelope payload 示例（新增可选字段）

```json
{
  "candidate": {
    "memory_id": "7a2c4d8e1f0ab123",
    "fact_key": "prefs.editor",
    "fact_value": "neovim",
    "ttl_class": "online_incremental",
    "confidence": 0.92,
    "status": "active",
    "source_event_id": "agent_end:sess-001:18:9ac38f1b",
    "detail_path": "memory/online/2026-02-25.md",
    "trigger_keywords": [],
    "active_context": true,
    "event_time": "2026-02-25T03:40:12.100Z",
    "ingest_time": "2026-02-25T03:40:12.100Z"
  },
  "metadata": {
    "userText": "my editor is neovim",
    "assistantText": "Noted, you use neovim.",
    "indexCheckOk": true
  },
  "message_envelope": {
    "role": "user",
    "name": "telegram:user:123456",
    "created_at": "2026-02-25T03:40:12.100Z",
    "metadata": {
      "channel": "telegram",
      "turn_id": "18",
      "source_ref": "agent_end:sess-001:18:9ac38f1b"
    },
    "ignore_roles": ["assistant"]
  }
}
```

示例依据：`ignore_roles/metadata/created_at` 为对齐 Zep 消息治理的目标字段集。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:72`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:73`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:74`, `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:79`）

### 7.3 legacy -> envelope 映射说明

| legacy 字段               | envelope 字段                   | 映射规则                                     |
| ------------------------- | ------------------------------- | -------------------------------------------- |
| `candidate.event_time`    | `message_envelope.created_at`   | envelope 未显式提供时，默认回退该值          |
| `session_key`（事件维度） | `message_envelope.name`         | 优先身份映射；缺省可用 `session_key` 派生名  |
| `metadata.userText`       | `message_envelope.role`         | 默认推导为 `user`；若显式 role 存在则覆盖    |
| 无                        | `message_envelope.ignore_roles` | legacy 无该语义，默认 `[]`                   |
| `metadata.*`              | `message_envelope.metadata`     | 允许复制必要键到 envelope；legacy 仍保留原位 |

## 8) 回滚方案

### 8.1 回滚动作

1. 关闭 `p3.message_envelope.enabled`，保留 legacy `candidate + metadata` 产出。
2. 保持 `write_mode` 语义不变，不将 `outbox.enabled` 当作主闸门。
3. 清空 `p3.message_envelope.ignore_roles`（设为 `[]`），避免策略残留影响后续写入。

动作依据：

- W0-04 回滚口径是“仅保留旧 payload 契约，不启用扩展字段”。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:166`）
- `write_mode` 是主闸门，`outbox.enabled` 不是。（证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:110`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:118`）

### 8.2 恢复完成客观标准

- RC-1：新入队事件 payload 中不再出现 `message_envelope` 键，且仍包含 `candidate`（必填）与可选 `metadata`。
- RC-2：连续 2 个日窗 `outbox_failed=0` 且 `outbox_dead=0`。
- RC-3：`contract` 错误桶占比回落到回滚前基线或更低。

判定依据：

- legacy 契约结构与 outbox 稳态阈值均有现成口径。（证据：`extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:13`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:35`, `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:49`）

## 9) 验收矩阵（B1-B6）

| 验收项              | Owner                     | 检查步骤                                                                                                                           | 通过标准                                           | 失败标准                                   | 证据路径                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 字段冻结完整性   | Eng-Governance            | 核对本文件第 4 节字段表是否覆盖 `role/name/created_at/metadata/ignore_roles` 且逐字段含“类型、必填/可选、默认值、来源、校验规则”。 | 五字段齐全且 5 列属性齐全。                        | 任一字段缺失或任一字段属性不完整。         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:159`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:164`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:180`                                                                                                              |
| B2 现状盘点准确性   | P3-Owner                  | 对照第 3 节与代码：核验 outbox payload、mem0 body、graphiti body、outbox `created_at` 来源四类结论。                               | 四类结论均可回溯到代码 `path:line`。               | 任一结论无法在代码定位。                   | `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:13`; `extensions/memory-mem0-graphiti-bridge/src/p3/online-capture.ts:189`; `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:125`; `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:172`; `extensions/memory-mem0-graphiti-bridge/src/p3/outbox-store.ts:349`                                                      |
| B3 兼容矩阵可落地性 | Eng-Governance + P3-Owner | 审核第 5.2 表：至少包含 3 个升级/降级场景，并明确“旧 payload 直通”和“新字段可选”。                                                 | 场景数 >= 3，且 S1~S4 逻辑闭环无冲突。             | 场景不足或缺“可选/直通”约束。              | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:160`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:180`; `extensions/memory-mem0-graphiti-bridge/src/p3/remote-writer.ts:96`                                                                                                                                      |
| B4 灰度策略有效性   | Ops + Quality             | 审核第 6 节：确认默认 off、开启条件、回退条件、监控点均已定义并可执行。                                                            | 默认 off 明确；开启/回退条件均量化；监控点可观测。 | 缺默认 off，或条件不可量化，或监控点缺失。 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:161`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:35`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:49`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:35` |
| B5 示例与映射可用性 | Eng-Governance            | 审核第 7 节：存在 legacy/envelope 两组示例，并有逐字段映射说明。                                                                   | 两组 JSON 示例完整且映射表 >= 4 行。               | 示例不足两组或无映射说明。                 | `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:72`; `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md:79`; `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:13`                                                                                                                                                          |
| B6 回滚可执行性     | Ops + P3-Owner            | 按第 8 节核查：有回滚动作、恢复标准、客观指标（RC-1~RC-3）。                                                                       | 回滚动作 >= 3，恢复标准 >= 3 且含客观阈值。        | 只有口号式回滚，无客观判定。               | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:166`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:49`; `extensions/memory-mem0-graphiti-bridge/src/p3/types.ts:13`                                                                                                                                               |

---

结论：本草案满足 W0-04 的“可执行、可验收、可回滚”要求，并严格限制在 Wave0 Day1 范围，不引入 W1~W5 实现细节。
