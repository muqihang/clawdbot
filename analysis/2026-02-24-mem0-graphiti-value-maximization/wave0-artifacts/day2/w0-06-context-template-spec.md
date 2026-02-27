# W0-06 Context 模板草案（可执行 / 可验收 / 可回滚）

## 1) 元信息

- ArtifactID: `W0-06-CONTEXT-TEMPLATE-SPEC`
- Author: `子代理 #W0-06-Implementer（Wave0 Day2）`
- Created At (UTC): `2026-02-25T06:23:59Z`
- Created At (Local, UTC+08:00): `2026-02-25T14:23:59+08:00`
- Scope: 仅交付 W0-06「Context 模板草案」文档；不展开 Wave1~Wave5 实现细节，不修改业务代码。
- Dependencies:
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md`
  - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md`

元信息依据：

- W0 仅覆盖 Day0-Day3，且不展开 Wave1~5：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:5`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:6`
- W0-06 任务 owner / 依赖 / 产物路径：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:190`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:191`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:198`

## 2) 输入边界与统一约束

### 2.1 任务输入边界（W0-06）

- 输入样本：四桶样本 + 检索样本。
- 必须产出：三套模板（精确ID / 时序关系 / 决策依据）+ 评分 rubric + shadow 对比协议（不切主流量）。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:192`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:194`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:197`

### 2.2 四桶口径与低置信规则（统一）

- 四桶维度固定为：`精确ID / 决策原因 / 时序关系 / 项目上下文`。
- 任一桶在任一日 `sample_count < 30` 视为 `low_confidence`，不得用于 Gate 放行。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:195`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:82`

### 2.3 模板输入依赖（W0-03 / W0-04）

- ID 语义依赖 W0-03 三元主键：`oc_user_id / oc_thread_id / oc_message_id`。
- Message 语义依赖 W0-04 最小 envelope 字段：`role/name/created_at/metadata/ignore_roles`。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:62`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:64`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:47`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:52`

## 3) 模板 T1：精确ID（Exact-ID）

### 3.1 适用场景与触发条件

- 场景：问题目标可由稳定 ID 唯一定位（用户、线程、消息、实体别名映射到稳定 ID）。
- 触发条件（全满足）：
  1. 检索结果中出现 `oc_user_id` 或 `oc_thread_id` 或 `oc_message_id`。
  2. 至少 1 条候选证据满足 “ID 精确匹配或 alias 精确归一”。
  3. ID 冲突裁决后仅剩 1 个主候选。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:165`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:69`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:82`

### 3.2 输入契约（字段 / 必填 / 来源）

| 字段               | 必填/可选 | 来源                | 说明                                 |
| ------------------ | --------- | ------------------- | ------------------------------------ |
| `query_id`         | 必填      | 检索请求上下文      | 单次用户可见请求唯一键               |
| `query_text`       | 必填      | 用户输入            | 原始问题文本                         |
| `bucket`           | 必填      | 四桶标注器          | 固定为 `exact_id`                    |
| `retrieval_hits[]` | 必填      | 检索层样本          | TopK 命中片段（含 score/source）     |
| `oc_user_id`       | 可选      | W0-03 identity map  | 命中用户 ID 时填充                   |
| `oc_thread_id`     | 可选      | W0-03 identity map  | 命中线程 ID 时填充                   |
| `oc_message_id`    | 可选      | W0-03 identity map  | 命中消息 ID 时填充                   |
| `aliases[]`        | 可选      | 检索样本 / 标注样本 | ID 同义词                            |
| `message_envelope` | 可选      | W0-04 envelope      | 提供 role/name/created_at 等辅助约束 |

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:62`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:70`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:46`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:58`

### 3.3 输出契约（结构化字段）

| 字段               | 类型                                                        | 说明                     |
| ------------------ | ----------------------------------------------------------- | ------------------------ |
| `template_id`      | `"T1"`                                                      | 模板标识                 |
| `decision`         | `"answer" \| "degrade"`                                     | 是否正常输出             |
| `resolved_id`      | `string \| null`                                            | 最终主 ID                |
| `resolved_id_type` | `"oc_user_id" \| "oc_thread_id" \| "oc_message_id" \| null` | ID 类型                  |
| `answer_text`      | `string`                                                    | 面向用户输出             |
| `evidence[]`       | `Array<{source_id:string, snippet:string, score:number}>`   | 证据列表（按可信度降序） |
| `confidence`       | `number(0..1)`                                              | 模板置信度               |
| `degrade_reason`   | `string \| null`                                            | 兜底原因                 |
| `trim_report`      | `Array<string>`                                             | 裁剪动作记录             |
| `token_usage`      | `{input:number, output:number}`                             | token 实测值             |

### 3.4 Prompt 骨架（可执行模板）

```text
[System]
你是 OpenClaw Context Assembler 的 T1（Exact-ID）模板。
任务：基于稳定 ID 证据输出可审计 JSON，禁止输出 JSON 以外文本。
规则：
1) 仅在 ID 唯一可决议时输出 decision="answer"。
2) 若 ID 冲突或证据不足，输出 decision="degrade" 并填写 degrade_reason。
3) answer_text 必须引用 evidence 中至少 1 条 source_id。
4) confidence 取值范围 [0,1]。

[Developer]
输出 JSON schema：
{
  "template_id":"T1",
  "decision":"answer|degrade",
  "resolved_id":"string|null",
  "resolved_id_type":"oc_user_id|oc_thread_id|oc_message_id|null",
  "answer_text":"string",
  "evidence":[{"source_id":"string","snippet":"string","score":0.0}],
  "confidence":0.0,
  "degrade_reason":"string|null",
  "trim_report":["string"],
  "token_usage":{"input":0,"output":0}
}

[User]
query_id={{query_id}}
query_text={{query_text}}
bucket={{bucket}}
identity_fields={{identity_fields_json}}
aliases={{aliases_json}}
message_envelope={{message_envelope_json}}
retrieval_hits={{retrieval_hits_json}}
```

### 3.5 失败兜底路径（degrade）

- D1: 未命中任何 `oc_*` 字段 -> 返回 `decision="degrade"`，并转“检索直出 baseline”。
- D2: 命中多个候选 ID 且冲突不可裁决 -> 仅返回候选列表，不生成强结论。
- D3: `confidence < 0.6` -> 不输出 ID 归因结论，降级到 baseline。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:195`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:200`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:82`

### 3.6 裁剪规则（优先级与截断顺序）

1. 保留唯一 ID 候选对应证据（最高优先级，不截断）。
2. 保留 `retrieval_hits` 中 score 前 5 的片段。
3. 保留 `aliases` 前 3 项。
4. 裁剪 `message_envelope.metadata` 到最多 20 键。
5. 仍超预算时，按证据 score 低到高逐条截断。

### 3.7 Token 预算（上限）

- 输入上限：`<= 1800` tokens
- 输出上限：`<= 420` tokens
- 强制降级：若预估输入超过上限，先执行 3.6 的 2->5 顺序；仍超限则直接 `decision="degrade"`。

## 4) 模板 T2：时序关系（Timeline）

### 4.1 适用场景与触发条件

- 场景：问题需要回答“先后关系 / 时间点 / 变更轨迹 / 阶段演进”。
- 触发条件（全满足）：
  1. query 命中时序触发词（如 `何时/之前/之后/先后/timeline`）。
  2. 检索样本中至少 2 条证据具备可排序时间锚点。
  3. `created_at` 可解析率 >= 80%。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:165`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:56`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:64`

### 4.2 输入契约（字段 / 必填 / 来源）

| 字段                          | 必填/可选 | 来源           | 说明                             |
| ----------------------------- | --------- | -------------- | -------------------------------- |
| `query_id`                    | 必填      | 检索请求上下文 | 请求唯一键                       |
| `query_text`                  | 必填      | 用户输入       | 问题文本                         |
| `bucket`                      | 必填      | 四桶标注器     | 固定为 `timeline`                |
| `retrieval_hits[]`            | 必填      | 检索层样本     | 需包含 `created_at` 或可推导时间 |
| `message_envelope.created_at` | 可选      | W0-04 envelope | 标准时间锚点                     |
| `message_envelope.role`       | 可选      | W0-04 envelope | 角色可帮助判定“谁在何时做了什么” |
| `timezone_hint`               | 可选      | 请求上下文     | 用户偏好时区                     |
| `max_events`                  | 可选      | 协议常量       | 默认 `6`                         |

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:47`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:56`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:58`

### 4.3 输出契约（结构化字段）

| 字段             | 类型                                               | 说明               |
| ---------------- | -------------------------------------------------- | ------------------ |
| `template_id`    | `"T2"`                                             | 模板标识           |
| `decision`       | `"answer" \| "degrade"`                            | 是否正常输出       |
| `timeline[]`     | `Array<{ts:string,event:string,source_id:string}>` | 时间线事件（升序） |
| `answer_text`    | `string`                                           | 面向用户输出       |
| `coverage`       | `{events_used:number, events_total:number}`        | 时间证据覆盖       |
| `confidence`     | `number(0..1)`                                     | 模板置信度         |
| `degrade_reason` | `string \| null`                                   | 兜底原因           |
| `trim_report`    | `Array<string>`                                    | 裁剪动作记录       |
| `token_usage`    | `{input:number, output:number}`                    | token 实测值       |

### 4.4 Prompt 骨架（可执行模板）

```text
[System]
你是 OpenClaw Context Assembler 的 T2（Timeline）模板。
任务：把检索证据整理为“可排序时间线 + 简要结论”，输出 JSON。
约束：
1) timeline 事件按时间升序。
2) 每个事件必须带 source_id。
3) 若可解析时间锚点少于 2 条，必须 decision="degrade"。

[Developer]
输出 JSON schema：
{
  "template_id":"T2",
  "decision":"answer|degrade",
  "timeline":[{"ts":"RFC3339 string","event":"string","source_id":"string"}],
  "answer_text":"string",
  "coverage":{"events_used":0,"events_total":0},
  "confidence":0.0,
  "degrade_reason":"string|null",
  "trim_report":["string"],
  "token_usage":{"input":0,"output":0}
}

[User]
query_id={{query_id}}
query_text={{query_text}}
bucket={{bucket}}
timezone_hint={{timezone_hint}}
max_events={{max_events}}
message_envelope={{message_envelope_json}}
retrieval_hits={{retrieval_hits_json}}
```

### 4.5 失败兜底路径（degrade）

- D1: `created_at` 可解析率 < 80% -> 降级为 baseline，并返回“时间证据不足”。
- D2: 可排序事件 < 2 -> 不输出时序结论，只输出证据清单。
- D3: timeline 事件间冲突（同一实体互斥时间）-> 输出冲突警告并降级。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:195`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:56`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:217`

### 4.6 裁剪规则（优先级与截断顺序）

1. 保留每个候选实体的最早与最晚事件（骨架时间线）。
2. 保留证据 score 前 6 且含时间锚点的片段。
3. `message_envelope.metadata` 仅保留 `channel/turn_id/source_ref`。
4. 将长 `event` 文本截断到 80 字。
5. 仍超预算时，按“中间事件优先截断，首尾事件保留”。

### 4.7 Token 预算（上限）

- 输入上限：`<= 2200` tokens
- 输出上限：`<= 560` tokens
- 强制降级：预算溢出时，按 4.6 顺序裁剪；仍超限则只输出 2 事件骨架并 `decision="degrade"`。

## 5) 模板 T3：决策依据（Decision）

### 5.1 适用场景与触发条件

- 场景：问题需要“为什么做这个决策 / 决策依据是什么 / 取舍理由”。
- 触发条件（全满足）：
  1. query 命中决策触发词（`为什么/依据/取舍/方案/risk`）。
  2. 检索样本存在至少 2 类证据（事实 + 约束，或结论 + 风险）。
  3. 证据链可追溯到 source_id。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:165`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:169`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/reporting-field-gap-closure.md:14`

### 5.2 输入契约（字段 / 必填 / 来源）

| 字段                        | 必填/可选 | 来源              | 说明                        |
| --------------------------- | --------- | ----------------- | --------------------------- |
| `query_id`                  | 必填      | 检索请求上下文    | 请求唯一键                  |
| `query_text`                | 必填      | 用户输入          | 问题文本                    |
| `bucket`                    | 必填      | 四桶标注器        | 固定为 `decision_reason`    |
| `retrieval_hits[]`          | 必填      | 检索层样本        | 证据片段（含 source/score） |
| `constraints[]`             | 可选      | 指标字典/策略文档 | 阈值、红线、回滚约束        |
| `message_envelope.metadata` | 可选      | W0-04 envelope    | 决策上下文补充              |
| `risk_flags[]`              | 可选      | 评测/审计侧       | 风险提示                    |

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:58`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:86`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:102`

### 5.3 输出契约（结构化字段）

| 字段                   | 类型                                            | 说明         |
| ---------------------- | ----------------------------------------------- | ------------ |
| `template_id`          | `"T3"`                                          | 模板标识     |
| `decision`             | `"answer" \| "degrade"`                         | 是否正常输出 |
| `claim`                | `string`                                        | 核心结论     |
| `rationale[]`          | `Array<{point:string, source_id:string}>`       | 依据列表     |
| `counter_evidence[]`   | `Array<{point:string, source_id:string}>`       | 反证或风险   |
| `final_recommendation` | `"keep" \| "revise" \| "rollback" \| "unknown"` | 决策建议     |
| `confidence`           | `number(0..1)`                                  | 模板置信度   |
| `degrade_reason`       | `string \| null`                                | 兜底原因     |
| `trim_report`          | `Array<string>`                                 | 裁剪动作记录 |
| `token_usage`          | `{input:number, output:number}`                 | token 实测值 |

### 5.4 Prompt 骨架（可执行模板）

```text
[System]
你是 OpenClaw Context Assembler 的 T3（Decision）模板。
任务：从证据中提炼“结论 + 依据 + 风险”，输出 JSON。
约束：
1) claim 只能由 evidence 推导，禁止无证据扩展。
2) rationale 至少 2 条，且必须携带 source_id。
3) 若反证强于正证，final_recommendation 只能是 revise 或 rollback。

[Developer]
输出 JSON schema：
{
  "template_id":"T3",
  "decision":"answer|degrade",
  "claim":"string",
  "rationale":[{"point":"string","source_id":"string"}],
  "counter_evidence":[{"point":"string","source_id":"string"}],
  "final_recommendation":"keep|revise|rollback|unknown",
  "confidence":0.0,
  "degrade_reason":"string|null",
  "trim_report":["string"],
  "token_usage":{"input":0,"output":0}
}

[User]
query_id={{query_id}}
query_text={{query_text}}
bucket={{bucket}}
constraints={{constraints_json}}
risk_flags={{risk_flags_json}}
message_envelope={{message_envelope_json}}
retrieval_hits={{retrieval_hits_json}}
```

### 5.5 失败兜底路径（degrade）

- D1: 证据无法形成“结论-依据”闭环（rationale < 2）-> `decision="degrade"`。
- D2: 缺少可审计 `source_id` -> 禁止输出决策建议，降级 baseline。
- D3: 风险冲突未解（counter_evidence 强冲突）-> 仅输出“需人工复核”，不输出 keep 结论。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:195`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:81`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:86`

### 5.6 裁剪规则（优先级与截断顺序）

1. 保留“结论直接支撑证据”前 3 条。
2. 保留反证前 2 条（用于噪声控制与风险提示）。
3. `constraints` 仅保留触发阈值与红线字段。
4. 对 `rationale.point` 超长文本截断到 120 字。
5. 仍超预算时，先截断 `counter_evidence`，后截断低分 `rationale`。

### 5.7 Token 预算（上限）

- 输入上限：`<= 2400` tokens
- 输出上限：`<= 680` tokens
- 强制降级：若超过预算且裁剪后仍超限，则输出 `final_recommendation="unknown"` 且 `decision="degrade"`。

## 6) 评分 Rubric（可执行）

### 6.1 评分维度、定义与权重

| 维度          | 定义                                           | 评分档位（1-5）                                                                | 权重   |
| ------------- | ---------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| 可解释性（E） | 输出结论是否有可追溯证据链；是否可被审计复现   | 5=结论与证据完全一一映射；4=关键结论可追溯；3=部分可追溯；2=映射弱；1=不可追溯 | `0.40` |
| 可用性（U）   | 输出是否可直接用于回答或运营判读；格式是否稳定 | 5=可直接使用且无需人工补写；4=少量修订可用；3=需中度修订；2=需重写；1=不可用   | `0.35` |
| 噪声率（N）   | 无关/误导信息占比（越低越好，按反向评分）      | 5=噪声率<=5%；4=(5%,10%]；3=(10%,15%]；2=(15%,20%]；1=>20%                     | `0.25` |

Rubric 依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:196`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:79`

### 6.2 总分公式

- 记 `E/U/N` 为 1~5 分：
  - `total_score = 20 * (0.40 * E + 0.35 * U + 0.25 * N)`
- `total_score` 范围：`20..100`

### 6.3 Pass/Fail 阈值与 low_confidence 处理

- Pass（模板通过）：
  - `total_score >= 80`
  - 且 `E >= 4`
  - 且 `U >= 4`
  - 且 `noise_rate <= 10%`
  - 且该桶 `low_confidence=0`
- Fail（模板不通过）：
  - 任一条件触发：`total_score < 70` 或 `E <= 2` 或 `U <= 2` 或 `noise_rate > 20%`
- Watch（观察态，不做晋级/淘汰结论）：
  - `70 <= total_score < 80`，或 `sample_count < 30`（`low_confidence=1`）

低置信处理红线：当 `sample_count < 30`，结果仅作观察，禁止用于 Gate 放行或模板晋级。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:82`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:83`

## 7) Shadow 对比协议（不切主流量）

### 7.1 样本选择策略（四桶覆盖）

- 桶定义固定：`exact_id / decision_reason / timeline / project_context`。
- 日窗采样目标：每桶 `>= 30` 条（满足非 low_confidence 最小样本）。
- 样本构成：
  - 70% 来自近 24 小时真实检索请求。
  - 30% 来自固定回归样本池（防止热门 query 偏置）。
- 模板映射：
  - `exact_id -> T1`
  - `timeline -> T2`
  - `decision_reason -> T3`
  - `project_context -> baseline 对照桶（不强制路由模板，仅用于噪声与误路由监控）`

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:195`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:192`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:82`

### 7.2 执行频率与窗口

- 执行频率：每日 `3` 次（`00:00/08:00/16:00 UTC`）。
- 统计窗口：
  - 主窗口：自然日（UTC）。
  - 决策窗口：连续 `7` 日滚动窗口。
- 对比对象：`baseline（检索直出）` vs `template（T1/T2/T3）`。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:194`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:72`

### 7.3 记录字段（可审计）

| 字段             | 必填 | 说明                     |
| ---------------- | ---- | ------------------------ |
| `shadow_run_id`  | 是   | 单次 shadow 批次标识     |
| `run_ts_utc`     | 是   | 执行时间（UTC）          |
| `query_id`       | 是   | 请求唯一键               |
| `bucket`         | 是   | 四桶标签                 |
| `route_mode`     | 是   | `baseline` 或 `template` |
| `template_id`    | 是   | `T1/T2/T3/none`          |
| `prompt_version` | 是   | 模板版本号               |
| `prompt_sha256`  | 是   | Prompt 骨架 hash         |
| `input_sha256`   | 是   | 输入载荷 hash            |
| `output_sha256`  | 是   | 输出载荷 hash            |
| `token_input`    | 是   | 输入 token               |
| `token_output`   | 是   | 输出 token               |
| `degrade_flag`   | 是   | 是否走兜底               |
| `degrade_reason` | 否   | 兜底原因                 |
| `trim_report`    | 否   | 裁剪动作                 |
| `rubric_E/U/N`   | 是   | 三维评分                 |
| `total_score`    | 是   | 总分                     |
| `low_confidence` | 是   | 低置信标记               |
| `reviewer`       | 是   | 评分人                   |

### 7.4 对比口径（baseline vs template）

- 主对比指标：
  1. `total_score`（Rubric 总分）
  2. `noise_rate`（噪声率）
  3. `degrade_rate`
  4. 输出可用率（`U>=4` 占比）
- 辅助对比：
  - `Top1/FUR/CFP` 代理趋势（只用于趋势，不替代正式 Gate 字段）

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/reporting-field-gap-closure.md:16`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/reporting-field-gap-closure.md:18`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/reporting-field-gap-closure.md:19`

### 7.5 结论规则（保留 / 淘汰）

- 保留模板（Keep）：
  - 连续 `3` 个日窗满足 Pass 条件；
  - 且 `degrade_rate <= 15%`；
  - 且无“字段缺失/不可审计”问题。
- 淘汰模板（Drop）：
  - 任意连续 `2` 个日窗满足 Fail 条件；或
  - 任一日出现 `noise_rate > 25%`；或
  - 任一日出现不可审计输出（缺 `source_id` / hash 缺失）。
- 保守原则（No Cutover）：
  - Wave0 内即使模板满足 Keep，也只保留为“候选模板”，不切主流量。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:197`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:166`

## 8) 回滚方案（关闭 assembler，保持检索直出）

### 8.1 回滚触发条件

- R1: 任一模板连续 2 个日窗 Fail。
- R2: 任一模板日窗 `noise_rate > 25%`。
- R3: 审计字段缺失（`prompt_sha256/input_sha256/output_sha256` 任一缺失）。
- R4: 运维手动触发紧急回退。

### 8.2 执行动作

1. 关闭 assembler（实验配置层）：`context_assembler.enabled=false`。
2. 维持检索直出：`route_mode=baseline`，停止模板注入。
3. 保持 envelope 风险最小化：`p3.message_envelope.enabled=false`，`p3.message_envelope.shadow_only=true`。
4. 运行一次回滚后报表采样并归档（命令含 node 兜底）：

```bash
pnpm openclaw memory-bridge-p3 report --run-date "$(date -u +%F)" --report-json /tmp/w0-06-rollback-report.json --report-text /tmp/w0-06-rollback-report.txt
```

若 `pnpm openclaw` 不可用：

```bash
node openclaw.mjs memory-bridge-p3 report --run-date "$(date -u +%F)" --report-json /tmp/w0-06-rollback-report.json --report-text /tmp/w0-06-rollback-report.txt
```

命令兜底依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:39`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:43`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/reporting-field-gap-closure.md:57`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/reporting-field-gap-closure.md:63`

### 8.3 完成判据

- RC1: 回滚后新增记录全部 `route_mode=baseline` 且 `template_id=none`。
- RC2: 回滚后采样报表可生成，且审计字段完整。
- RC3: 连续 2 个执行窗无模板输出 contract 错误。

依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:200`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:206`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:217`

## 9) 验收矩阵（C1-C6）

| 验收ID                      | Owner                      | 检查步骤                                                                                                         | 通过标准                       | 失败标准                           | 证据路径（path:line）                                                                                                                                                                                                                                                                                               |
| --------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 元信息完整性             | Prompt/Agent Eng           | 检查本文件是否包含 author、UTC 与 UTC+08 时间戳、scope、依赖 W0-03/W0-04                                         | 四项齐全且依赖路径可解析       | 任一缺失或依赖路径错误             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:191`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:1`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md:1` |
| C2 三模板完整性             | Prompt/Agent Eng + Quality | 核查 T1/T2/T3 每套均有：场景触发、输入契约、输出契约、Prompt 骨架                                                | 三模板均完整，且字段可执行     | 任一模板缺任一子项                 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:194`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:165`                                                                                                                      |
| C3 兜底/裁剪/token 预算完备 | Prompt/Agent Eng           | 核查每模板均包含 degrade 路径、裁剪顺序、输入/输出 token 上限                                                    | 三模板全部具备三要素           | 任一模板缺失任一要素               | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:195`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:199`                                                                                                                            |
| C4 Rubric 可执行性          | Quality                    | 核查维度（可解释性/可用性/噪声率）、评分档位、权重、总分公式、Pass/Fail、low_confidence 规则                     | 六项均存在且可计算             | 任一维度缺失或无公式阈值           | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:196`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:196`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:82`              |
| C5 Shadow 协议合规性        | Quality + Ops              | 核查四桶覆盖、执行频率/窗口、审计字段、baseline vs template 对比、保留/淘汰规则、No Cutover 声明                 | 六项均定义，且明确“不切主流量” | 任一关键项缺失或出现切流表述       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:197`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:195`; `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:166`                   |
| C6 回滚可执行性             | Ops + Prompt/Agent Eng     | 核查是否包含“关闭 assembler、保持检索直出、触发条件、执行动作、完成判据”；并检查 openclaw 命令是否给出 node 兜底 | 回滚四要素齐全，命令双口径齐全 | 缺任一回滚要素，或命令无 node 兜底 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:200`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:39`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:43`                                 |

## 10) 结论

该草案已在 W0-06 范围内交付三模板、Rubric、Shadow 协议与回滚/验收闭环，满足“可执行、可验收、可回滚”，且未展开 Wave1~Wave5 实现细节。

结论依据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:6`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:199`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:200`
