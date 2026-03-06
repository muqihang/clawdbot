# W5-0 基线冻结与运行画像显式化报告

- 执行日期：2026-03-06
- 执行范围：只执行 `W5-0`，不进入 `W5-A/B/C/D/E`，不修改业务代码，不改写 `~/.openclaw/openclaw.json`
- 主结论：`day33` 的 `w4-r24-gate4-single-primary-maxfacts1` 必须冻结为 `W5` 唯一正式读基线；本机当前稳定运行画像已经显式记录，但它不是正式基线本身；进入 `W5-A` 仍需人工签字，因此当前阶段结论是“W5-0 文档交付完成，但对 W5-A 仍为 No-Go”。

## 1. 证据地图

### 1.1 执行依据

本次执行只以以下两份计划为直接执行依据：

1. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/plans/2026-03-05-wave5-mem0-graphiti-plan.md`
2. `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/plans/2026-03-06-w5-0-baseline-freeze-execution-plan.md`

`analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md` 只作为方向约束使用：它证明 `W5` 之后会走向 `Ontology-ready` 路线，但本次不执行其中后续 Phase 的任何实现任务。

### 1.2 正式基线来源池（只回答“day33 赢了什么”）

| 类别           | 唯一来源                                                                                                                                                  | 它证明什么                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基线配置       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/inputs/openclaw.config.json`            | `day33` 的正式输入配置：`memory.backend=builtin`、`memory` slot 由 `memory-mem0-graphiti-bridge` 接管、`read_mode=primary`、`cutover_percent=100`、`default=local`、`semantic=mem0`、`timeline=graphiti`、`fallback=local` |
| 基线指标       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json`             | `top1_avg_delta_pp=74.8`、`fur_delta_pp=72.58`、`p95_increase_pct=13.7122`、`stability.pass=true`                                                                                                                          |
| Gate 结果      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/gate4.go-no-go.summary.json`     | `go=true` 且三项硬门全部通过                                                                                                                                                                                               |
| 检索回归门     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/memory-search-regression/acceptance.md` | `memory_search regression acceptance = PASS`                                                                                                                                                                               |
| 隐式代码参数   | `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts`                                                                                    | Graphiti `/search` 默认带 `max_facts=1`，与 `maxfacts1` 命名一致                                                                                                                                                           |
| 连字符硬门脚本 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day11/w4-r1-memory-search-hyphen-fix/scripts/run-memory-search-regression.ts`       | `hyphen-01` / `hyphen-02` 是硬门；若 `L2 primary` 结果数为 0 就算 blocker                                                                                                                                                  |

### 1.3 当前现地来源池（只回答“本机今天真实怎么跑”）

| 类别                  | 唯一来源                                                           | 它证明什么                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 本机真实配置          | `~/.openclaw/openclaw.json`                                        | 当前真实现场：`memory.backend=qmd`、bridge 接管 `memory` slot、`read_mode=primary`、`write_mode=propose_only`、`cutover_percent=100`、`outbox.enabled=false`、`outbox.db_path` 已配置、`p3.auto_worker=true`、`p3.admission_enabled=true`、`p3.commit_canary_ratio=0.05` |
| 产品默认内存后端      | `src/memory/backend-config.ts`                                     | 若 `memory.backend !== qmd`，产品默认回落为 `builtin`；`qmd` 只是显式选中的另一条本地后端路径                                                                                                                                                                            |
| 本地 memory tool 行为 | `src/agents/tools/memory-tool.ts`                                  | `memory_search` 会按当前后端状态执行；当 backend 为 `qmd` 时，结果还会按 `qmd` 的注入字符上限裁剪                                                                                                                                                                        |
| bridge 接管关系       | `extensions/memory-mem0-graphiti-bridge/index.ts`                  | bridge 注入 `localTool`，并以 `memory_search` 名义对外承接主路径；写捕获由 `write_mode` 驱动，后台 worker 由 `p3.auto_worker && shouldCaptureWrites` 驱动                                                                                                                |
| 读路由事实            | `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts` | 主路径叙事里的 `default/semantic/timeline/fallback` 都是 bridge 显式路由字段，不是口头约定                                                                                                                                                                               |
| bridge 默认值         | `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`       | 产品默认是 `read_mode=local`、`write_mode=off`、`cutover_percent=0`、`outbox.enabled=false`、`p3.auto_worker=false`、`p3.admission_enabled=false`、`p3.commit_canary_ratio=0`                                                                                            |
| 当前写链路事实        | `extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts`          | 当前写链路并非空白：当 remote 双写成功后，会依据 admission/canary 条件决定 `committed`、`pending_review` 或 `proposed`                                                                                                                                                   |
| 运行脚本画像          | `scripts/memory-stack/common.sh`、`scripts/memory-stack/start.sh`  | 运行画像里的 embeddings、端口、Neo4j Aura 规整、禁止 `18082` 都藏在脚本层，而不是产品 UI 默认值                                                                                                                                                                          |

### 1.4 审计与方向约束来源池（只回答“为什么 W5-0 必须先做”）

| 类别              | 唯一来源                                                                                                                               | 它证明什么                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 设计审计          | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/audit-review.md`           | 审计认可 `builtin local + bridge + mem0 + graphiti` 的分层方向，但要求先冻结 `day33`、再把运行补丁显式化          |
| 审计摘要          | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/audit-summary.json`        | `fix_before_w5` 明确要求：冻结 `day33`、把部署补丁改成运行画像、明确 `qmd` 当前不是推荐主路径                     |
| 审计建议排序      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/recommendations-ranked.md` | `W5` 要先处理基线、术语和运行补丁，再谈结构硬化                                                                   |
| V1.1 纠偏文档     | `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`                                          | 写链路主闸门必须认 `write_mode`，不能把 `outbox.enabled` 误写成主闸门；proposal / canary / manual commit 必须分账 |
| Super Jarvis 方向 | `analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md`                                                                              | `W5` 是后续 Ontology-ready 的第一执行阶段，因此必须先把正式基线与运行画像固定下来                                 |

### 1.5 关键纠偏：必须优先相信真实现场，而不是旧摘要

`W5-0` 计划摘要中曾把本机 `outbox` 概括为“只有 `db_path`，没有 `outbox.enabled`”。但 2026-03-06 本机 `~/.openclaw/openclaw.json` 的真实状态是：

- `outbox.enabled=false`
- `outbox.db_path=/Users/muqihang/.openclaw/memory-bridge-p3.sqlite`

因此本次冻结以 **真实配置文件** 为准，同时保留原计划里“`outbox.enabled` 不是写主闸门”的结论。

## 2. `day33` 正式基线清单

### 2.1 唯一正式基线目录

`W5` 唯一正式基线目录冻结为：

`analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1`

不得改写为其他 `dayXX`、其他 `rXX`、其他 `maxfactsN` 目录，也不得把当前本机 `qmd` 现状写成替代基线。

### 2.2 正式基线指标

| 指标                | 冻结值    | 说明                    |
| ------------------- | --------- | ----------------------- |
| `top1_avg_delta_pp` | `74.8`    | 质量主增益              |
| `fur_delta_pp`      | `72.58`   | FUR 代理提升            |
| `p95_increase_pct`  | `13.7122` | 长尾时延仍在门内        |
| `stability.pass`    | `true`    | 稳定性门通过            |
| Gate 总结           | `go=true` | `Go` 结果已形成单独产物 |

### 2.3 正式基线配置口径

| 维度                   | 冻结值                        |
| ---------------------- | ----------------------------- |
| `memory.backend`       | `builtin`                     |
| `plugins.slots.memory` | `memory-mem0-graphiti-bridge` |
| `read_mode`            | `primary`                     |
| `cutover_percent`      | `100`                         |
| `default_route`        | `local`                       |
| `semantic_route`       | `mem0`                        |
| `timeline_route`       | `graphiti`                    |
| `fallback_route`       | `local`                       |
| `mem0.base_url`        | `http://127.0.0.1:8766`       |
| `graphiti.base_url`    | `http://127.0.0.1:8000`       |

### 2.4 不可拆分的基线包

`day33` 正式基线不是一组可随意拆开的字段，而是以下四项必须同时成立的整包：

1. `single-primary`：读主链路由 bridge 主承接，而不是 `shadow` 或局部切流。
2. `Graphiti max_facts=1`：这是代码里的隐式成功条件，必须提升为正式基线参数。
3. `memory_search` 连字符硬门 `PASS`：`hyphen-01` 与 `hyphen-02` 结果不得为空。
4. `builtin + bridge + mem0 + graphiti`：这是 `day33` 的正式主路径叙事。

### 2.5 `day33` 明确定义了什么、没有定义什么

**它定义了：**

- `W5` 唯一正式读基线；
- 唯一正式质量口径；
- 唯一正式主路径路由分工；
- 唯一正式隐式参数（`max_facts=1`）；
- 唯一正式检索回归门（连字符硬门 `PASS`）。

**它没有定义：**

- 当前本机 `qmd` 现地状态；
- 当前写链路 operating model；
- proposal / canary / manual commit 的正式治理语义；
- 后续 `W5-A/B/C/D/E` 的实现方案。

### 2.6 基线禁止变动项

进入 `W5-A` 之前，以下项目不得被重新命名、隐式替换或口头改写：

1. 正式基线目录必须仍是 `day33/w4-r24-gate4-single-primary-maxfacts1`。
2. 正式质量口径必须仍是 `74.8 / 72.58 / 13.7122 / stability.pass=true`。
3. 正式主路径必须仍是 `builtin + bridge + mem0 + graphiti`。
4. `Graphiti max_facts=1` 必须继续视为正式基线参数，而不是“只是现在的代码默认值”。
5. `memory_search` 连字符硬门必须继续视为硬门，而不是“可选回归项”。
6. 不得把当前本机 `qmd` 现状提升为 `W5` 正式主线。
7. 不得把 `day33` 读基线偷换成“当前写链路已经正式上线”。

## 3. 当前运行画像

### 3.1 `day33` 画像 vs 本机当前画像

| 项目                     | `day33` 正式基线                  | 2026-03-06 本机真实现场            | 判断                                                 |
| ------------------------ | --------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| 本地后端                 | `builtin`                         | `qmd`                              | **不同**；`qmd` 只能记为现地画像，不能升格为正式基线 |
| `memory` slot            | `memory-mem0-graphiti-bridge`     | `memory-mem0-graphiti-bridge`      | 一致                                                 |
| 读链路模式               | `read_mode=primary`               | `read_mode=primary`                | 一致                                                 |
| 读切流                   | `cutover_percent=100`             | `cutover_percent=100`              | 一致                                                 |
| 路由分工                 | `local / mem0 / graphiti / local` | `local / mem0 / graphiti / local`  | 一致                                                 |
| Mem0 地址                | `http://127.0.0.1:8766`           | `http://127.0.0.1:8766`            | 一致                                                 |
| Graphiti 地址            | `http://127.0.0.1:8000`           | `http://127.0.0.1:8000`            | 一致                                                 |
| 写模式                   | 未冻结为正式口径                  | `write_mode=propose_only`          | **新增现地事实**                                     |
| `outbox`                 | 不在正式基线中                    | `enabled=false` + `db_path` 已配置 | **新增现地事实**                                     |
| `p3.auto_worker`         | 不在正式基线中                    | `true`                             | **新增现地事实**                                     |
| `p3.admission_enabled`   | 不在正式基线中                    | `true`                             | **新增现地事实**                                     |
| `p3.commit_canary_ratio` | 不在正式基线中                    | `0.05`                             | **新增现地事实**                                     |

### 3.2 产品默认 vs 当前运行画像

| 字段                     | 产品默认   | 本机当前值     | 类型                           |
| ------------------------ | ---------- | -------------- | ------------------------------ |
| `memory.backend`         | `builtin`  | `qmd`          | 本机运行画像覆盖               |
| `read_mode`              | `local`    | `primary`      | 本机运行画像覆盖               |
| `write_mode`             | `off`      | `propose_only` | 本机运行画像覆盖               |
| `cutover_percent`        | `0`        | `100`          | 本机运行画像覆盖               |
| `default_route`          | `local`    | `local`        | 与默认一致                     |
| `semantic_route`         | `mem0`     | `mem0`         | 与默认一致                     |
| `timeline_route`         | `graphiti` | `graphiti`     | 与默认一致                     |
| `fallback_route`         | `local`    | `local`        | 与默认一致                     |
| `outbox.enabled`         | `false`    | `false`        | 与默认一致，但不是写主闸门     |
| `p3.auto_worker`         | `false`    | `true`         | 本机运行画像覆盖               |
| `p3.admission_enabled`   | `false`    | `true`         | 本机运行画像覆盖               |
| `p3.commit_canary_ratio` | `0`        | `0.05`         | 本机运行画像覆盖               |
| Graphiti `max_facts`     | `1`        | `1`            | 代码默认，同时已冻结为基线参数 |

### 3.3 `local` 在两个画像中的实际含义

`local` 不是一个独立实现名，而是 bridge 里的一个**路由标签**。它实际落到什么后端，由 bridge 注入的 `localTool` 与 `memory.backend` 共同决定：

- `day33` 中：`local = builtin`
- 本机当前画像中：`local = qmd`

因此：

- `day33` 的正式叙事必须写成 `builtin + bridge + mem0 + graphiti`
- 本机当前画像必须写成 `qmd + bridge + mem0 + graphiti`
- 不能把 `local` 直接写成“永远等于 builtin”，也不能直接写成“永远等于 qmd”

### 3.4 隐藏成功条件（已提升为显式运行画像）

| 条件                      | 当前真实状态                                                                            | 分类                    |
| ------------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| embeddings provider/model | `openai` 协议 + `text-embedding-v4`                                                     | 运行画像                |
| embeddings 维度           | `1536`                                                                                  | 运行画像                |
| embeddings base URL       | `https://dashscope.aliyuncs.com/compatible-mode/v1`                                     | 运行画像                |
| 禁止链路                  | `EMBEDDING_BASE_URL` 禁止指向 `18082`                                                   | 脚本硬约束              |
| Graphiti 服务地址         | `127.0.0.1:8000`                                                                        | 运行画像                |
| Mem0 服务地址             | `127.0.0.1:8766`                                                                        | 运行画像                |
| Qdrant 服务地址           | `127.0.0.1:6333`                                                                        | 运行画像                |
| Neo4j Aura 连接策略       | Aura 风格 `neo4j+s://` 会在脚本里规整为 `bolt+s://`（或相应 `bolt+ssc://` / `bolt://`） | 已知偏离/脚本补丁       |
| Graphiti 查询预算         | 默认 `max_facts=1`                                                                      | 代码默认 + 正式基线参数 |

### 3.5 当前运行画像中的三类事实

**产品默认：**

- `memory.backend` 默认是 `builtin`
- bridge 默认 `read_mode=local`、`write_mode=off`、`cutover_percent=0`
- 默认路由是 `local / mem0 / graphiti / local`
- `outbox.enabled=false`
- `p3.auto_worker=false`、`p3.admission_enabled=false`、`p3.commit_canary_ratio=0`

**本机运行画像：**

- `memory.backend=qmd`
- `read_mode=primary`
- `write_mode=propose_only`
- `cutover_percent=100`
- `p3.auto_worker=true`
- `p3.admission_enabled=true`
- `p3.commit_canary_ratio=0.05`

**脚本补丁 / 已知偏离：**

- `EMBEDDING_BASE_URL` 禁止走 `18082`
- Aura 风格 `neo4j+s://` 被规整到 `bolt+s://`

## 4. 术语与主路径字典

| 术语            | 唯一定义                                                                                                               | 允许用法                                                  | 禁止用法                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `builtin`       | OpenClaw 默认本地 memory backend；当 `memory.backend !== qmd` 时，后端解析结果就是 `builtin`                           | 用来描述 `day33` 正式基线里的本地基础层                   | 不能把它当成 bridge 的同义词                                            |
| `qmd`           | 通过 `memory.backend=qmd` 显式启用的另一条本地 memory backend                                                          | 只能描述本机当前画像中的现地本地层                        | 不能写成 `W5` 正式推荐主线                                              |
| `local`         | bridge 路由标签，实际后端取决于被注入的 `localTool` 和当前 `memory.backend`                                            | 用来描述 bridge 路由选择中的本地分支                      | 不能脱离上下文直接等同于 `builtin` 或 `qmd`                             |
| `fallback`      | bridge 在主路由不可用/不满足时使用的回退行为描述词                                                                     | 只能描述“回退行为”                                        | 不能替代“基础记忆层”的概念                                              |
| `bridge`        | 占据 `memory` slot 的编排层，负责 local/Mem0/Graphiti 的主路径承接、诊断与写链路挂钩                                   | 用来描述主路径入口和策略层                                | 不能把它描述成某个单一后端                                              |
| `proposal`      | 已被 bridge 捕获并进入 P3 状态机、但尚未成为 canonical committed 状态的写入候选                                        | 用来描述当前写链路中的提案状态                            | 不能把 `proposal` 直接写成“已经 canonical commit”                       |
| `canary commit` | 在 `write_mode=propose_only` 下，经 admission 通过且命中 `commit_canary_ratio` 后进入 `commitCandidate` 的 commit 路径 | 用来描述当前本机写链路的 commit 试点                      | 不能写成“全量 commit”                                                   |
| `manual commit` | 保留给显式 `propose_commit` / 明确人工放权路径的 commit 语义；它不是当前默认运行态                                     | 用来描述未来需要与 `canary commit` 分账的显式 commit 类别 | 不能把当前 `propose_only + admission + canary` 现状叫作 `manual commit` |
| `Mem0`          | 远端语义检索/写入服务，当前画像地址为 `127.0.0.1:8766`                                                                 | 用来描述 `semantic_route` 的远端分工                      | 不能替代本地基础层                                                      |
| `Graphiti`      | 远端时序/图谱检索与写入服务，当前画像地址为 `127.0.0.1:8000`                                                           | 用来描述 `timeline_route` 的远端分工                      | 不能单独代表整个 bridge 系统                                            |

### 4.1 主路径叙事（正式版）

- `day33` 正式基线叙事：`builtin + bridge + mem0 + graphiti`
- 本机当前画像叙事：`qmd + bridge + mem0 + graphiti`
- `qmd` 当前地位：**必须被记录的现地状态，不属于 `W5` 推荐主线**

## 5. 写链路正式状态记录

### 5.1 正式命名

当前写链路的正式命名为：

> **提案优先 + admission 评估 + canary commit 的半落地实验态**

### 5.2 五个核心状态位

| 字段                     | 当前值                                              | 作用                                        |
| ------------------------ | --------------------------------------------------- | ------------------------------------------- |
| `write_mode`             | `propose_only`                                      | 决定是否捕获写事件；当前不是 `off`          |
| `p3.auto_worker`         | `true`                                              | 决定后台 worker 是否自动跑                  |
| `p3.admission_enabled`   | `true`                                              | 决定是否对 commit 进行 admission 评估       |
| `p3.commit_canary_ratio` | `0.05`                                              | 在 `propose_only` 下决定 canary commit 比例 |
| `outbox.db_path`         | `/Users/muqihang/.openclaw/memory-bridge-p3.sqlite` | P3 状态机数据落点                           |

### 5.3 为什么它不是空白

以下事实同时成立，所以当前写链路不能再描述成“还没做”：

1. `write_mode !== off` 时 bridge 就会捕获写事件。
2. `p3.auto_worker && shouldCaptureWrites` 时后台 worker 会自动运行。
3. worker 已有真实 admission 评估逻辑：检查 dual-write、index check、敏感性拦截与 canary。
4. 若 admission 通过，会调用 `commitCandidate()`，把 candidate 进入 canonical facts / proposal state 的 `committed` 或 `pending_review` 路径。
5. 若 admission 未通过，会把 proposal 状态回写为 `proposed` 并附带 `reviewReason`。

### 5.4 为什么它也不是“全量 canonical commit”

以下事实同时成立，所以当前写链路也不能被描述成“已经全量正式上线”：

1. 当前 `write_mode=propose_only`，不是 `propose_commit`。
2. `commit_canary_ratio=0.05` 说明 commit 只做 5% canary，不是全量放开。
3. 写链路正式分账、长期 operating model、回滚 drill、人工治理界面，都还没有被提升成 `W5` 主线治理对象。
4. proposal / canary / manual commit 三类语义仍需要在 `W5-B` 被正式收口。

### 5.5 当前真实 operating model

当前 operating model 不是“只提案、不 commit”，也不是“所有候选都自动 canonical commit”，而是：

1. bridge 先自动捕获写事件；
2. P3 worker 自动对 Mem0 与 Graphiti 执行远端写入；
3. 双写成功后进入 commit 评估；
4. `admission_enabled=true` 时，会基于 dual-write / index_check / non-sensitive / canary 共同判定；
5. 命中 canary 且 admission 通过时，进入 `commitCandidate()`；
6. 否则 proposal 状态会保留为 `proposed` 或 `pending_review`，等待后续治理。

### 5.6 当前风险

1. 写态已经存在，但分账、观测、回滚和人工治理还没有完全成型。
2. `propose_only` 很容易被误读成“零 commit”；这是错误的。
3. `outbox.enabled` 很容易被误读成“写主闸门”；这也是错误的。
4. 当前本机 `local=qmd`，如果不显式记录，后续很容易把 `day33` 的 `builtin` 基线与现地画像混写。

### 5.7 进入 `W5-A` 前必须保留的写语义

即使 `W5-A` 只做 bridge 结构硬化，也必须保留以下写语义，不得在重构中偷偷改掉：

1. `write_mode` 仍是写链路主闸门。
2. `propose_only` 不等于零 commit。
3. `outbox.enabled` 不是写主闸门。
4. admission 评估仍必须存在。
5. canary 筛选仍必须存在。
6. proposal / committed / pending_review 的状态语义必须保留。
7. `W5-A` 不能自行重定义 proposal / canary / manual commit 的口径。

## 6. `W5-0` Gate / Go-No-Go

### 6.1 `Go` 条件核对表

| 条件                      | 当前状态   | 说明                                                                                       |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `day33` 正式基线清单完整  | 已满足     | 已冻结目录、指标、配置、隐式参数、回归门                                                   |
| 当前运行画像完整          | 已满足     | 已分离记录 `day33` 与本机当前画像                                                          |
| 术语字典无冲突            | 已满足     | `builtin / qmd / local / fallback / bridge / proposal / canary / manual commit` 已分开定义 |
| 写链路状态记录完整        | 已满足     | 已明确命名为“半落地实验态”                                                                 |
| `W5-A` 前置物已列清       | 已满足     | 见本节 6.3                                                                                 |
| 人工签字确认可进入 `W5-A` | **未满足** | `W5-0` 计划要求人工验收后方可放行                                                          |

### 6.2 当前 `Go / No-Go` 结论

- **对 `W5-0` 文档交付本身：完成，可进入人工验收。**
- **对是否进入 `W5-A`：No-Go。**

原因不是文档缺失，而是 `W5-0` 计划本身把“人工验收签字”定义成放行条件。当前这一步尚未发生，因此只能停在 `W5-0`。

### 6.3 `W5-A` 必须消费的前置输出

`W5-A` 只能消费以下五类已经通过评审的结果，不得自行改口径：

1. `day33` 正式基线清单；
2. 当前运行画像清单；
3. 术语与主路径字典；
4. 写链路正式状态记录；
5. `Gate / Go-No-Go` 结果页。

## 7. Stop point

本次执行的停点已经明确：

1. `W5-0` 文档与证据产物已完成；
2. 默认停在人工验收之前；
3. 不进入 `W5-A`；
4. 不实现 bridge 硬化、不调整写链路治理、不做 Ontology 基础层实现、不做评测升级。

## 8. 配套产物

本报告的结构化配套文件如下：

- `inputs-summary.md`
- `runtime-profile.json`
- `day33-baseline-freeze.json`
- `terminology-decisions.md`
- `write-path-status.md`
- `gate-w5-0-summary.json`
- `acceptance.md`
- `changed_files.txt`
