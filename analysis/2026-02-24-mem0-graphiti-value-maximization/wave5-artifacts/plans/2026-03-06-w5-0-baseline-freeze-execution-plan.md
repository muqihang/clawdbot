# W5-0 基线冻结与运行画像显式化执行计划

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** 在不改业务代码、不改运行配置的前提下，把 `day33` 获胜口径、本机当前真实状态、主路径术语、写链路正式状态和 `W5-A` 前置条件收成一套单点可审阅、单点可验收、单点可停的文档基线，作为 `W5` 后续阶段唯一有效起点。

**Architecture:** `W5-0` 不是功能开发，而是文档化收口。执行时只做三件事：第一，冻结 `day33` 的获胜证据和成功参数；第二，把当前真正支撑运行的环境约束、路由约束、脚本约束写成显式“运行画像”；第三，把最容易混淆的术语和写链路状态定成统一口径，并据此给出 `Go / No-Go`。推荐采用单一执行档案方案：未来 `W5-0` 实施时，核心产物集中在一份 `baseline-freeze-report` 中，避免口径再次散落。

**Tech Stack:** `OpenClaw builtin memory`、`qmd`、`memory-mem0-graphiti-bridge`、`Mem0`、`Graphiti`、`Qdrant`、`Neo4j Aura`、`DashScope text-embedding-v4@1536`、`memory_search` 回归脚本、`memory-stack` 启停脚本。

---

## 0. 范围、角色与硬边界

### 0.1 本计划只做什么

- 只规划 `W5-0`，不进入 `W5-A / W5-B / W5-C` 的实现细节。
- 只允许新增或修改计划与分析文档，不改业务代码，不改本机配置，不调参，不扩流。
- 只把事实写清，不把尚未验证的新设计混入基线。

### 0.2 本计划明确不做什么

- 不重构 `bridge`。
- 不调整 `read_mode / write_mode / cutover_percent`。
- 不改 `qmd`、`builtin`、`Mem0`、`Graphiti` 的实际连线方式。
- 不补跑新的质量实验来替代 `day33`。
- 不把“应该怎样”写成“当前已经如此”。

### 0.3 角色

- **执行者**：负责读取事实、撰写文档、整理差异、提出 `No-Go`。
- **评审者**：负责人工验收、确认主路径口径、决定是否允许进入 `W5-A`。

### 0.4 术语说明

- **运行画像**：指当前方案能够稳定运行所依赖的一组显式约束，包含后端选择、路由、写态、脚本内置修复、外部服务连接和环境要求。
- **正式基线**：指后续 `W5` 所有改动都必须回归对照的一组固定输入、固定参数、固定证据和固定术语，不等于“某台机器当前怎么配”。

## 1. 为什么 `W5-0` 必须先于后续阶段

1. `W4` 的获胜证据已经存在，但“获胜条件”还散在产物目录、脚本默认值、环境变量校验和人工经验里；如果不先冻结，后续阶段没有统一对照物。
2. 本机当前真实配置已经不是单纯“读链路获胜态”，而是“读主运行态 + 写半落地实验态”；如果不先显式记录，后续阶段极易把写链路实验结果误当读基线。
3. `W5` 总方案明确要求先做“基线冻结与运行画像显式化”，上位方案也要求“上一阶段基线冻结并过 Gate 后，下一阶段才可开始”；这里不是建议，而是节奏约束。
4. 审计报告已经点明三个进入 `W5` 前必须先处理的事：冻结 `day33`、把部署型补丁写成运行画像、把 `qmd` 从主路径叙事中降级；这三个都属于 `W5-0`，不是 `W5-A` 的附带工作。
5. 术语当前有天然歧义：`local` 是路由词，不总等于 `builtin`；`fallback` 是行为，不是层；`bridge` 是编排层，不是存储层；如果先动代码再补术语，只会放大返工。

## 2. 当前真实状态摘要

### 2.1 需要同时成立的两个现实

| 项目              | `day33` 获胜口径                                                        | 本机当前真实状态                                                                                             | `W5-0` 要处理的意义                            |
| ----------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 本地后端          | `memory.backend=builtin`                                                | `memory.backend=qmd`                                                                                         | 必须明确“正式基线”和“本机现地画像”不是一回事   |
| `memory` slot     | `memory-mem0-graphiti-bridge`                                           | `memory-mem0-graphiti-bridge`                                                                                | 说明主入口仍由 `bridge` 接管                   |
| 读链路            | `read_mode=primary`、`cutover_percent=100`                              | `read_mode=primary`、`cutover_percent=100`                                                                   | 说明读已是主运行态，不再是影子态               |
| 路由分工          | `default=local`、`semantic=mem0`、`timeline=graphiti`、`fallback=local` | 同上                                                                                                         | 说明主路径是“本地锚点 + 双远端分工 + 本地回退” |
| 写链路            | `day33` 证据未把它写成正式口径                                          | `write_mode=propose_only`、`p3.auto_worker=true`、`p3.admission_enabled=true`、`p3.commit_canary_ratio=0.05` | 必须正式写明：当前不是空白，也不是全量 commit  |
| `outbox`          | `day33` 未作为主闸门记录                                                | 本机只有 `outbox.db_path`，没有 `outbox.enabled`                                                             | 必须正式记录：`outbox` 不是写主闸门            |
| Graphiti 查询预算 | 产物名已包含 `maxfacts1`                                                | 代码默认 `max_facts=1`                                                                                       | 必须把隐式代码默认值提升成正式基线参数         |
| 检索回归门        | `memory_search regression acceptance = PASS`                            | 同一回归门仍是唯一明确证据                                                                                   | 必须把“连字符硬门”写回正式基线                 |
| 嵌入画像          | `DashScope text-embedding-v4@1536`                                      | 本机脚本仍强制 `text-embedding-v4` 和 `1536`                                                                 | 必须把脚本里的环境约束显式化                   |
| `Neo4j Aura` 连接 | 获胜依赖本地规整补丁                                                    | 本机脚本把 `neo4j+s://` 规整为 `bolt+s://`                                                                   | 必须把“脚本补丁”改写成“运行画像中的已知偏离”   |

### 2.2 当前读链路为什么已经算主运行态

- `bridge` 通过 `plugins.slots.memory` 接管 `memory_search` 与 `memory_get`，不是旁路工具。
- `resolveReadPlan()` 在 `read_mode=primary` 且 `cutover_percent=100` 时，会把 `userRoute` 直接定到远端候选路由；搜索工具随后用 `readPlan.userRoute` 作为实际响应路由。
- 当前路由分工不是“全远端”，而是：默认走 `local` 语义锚点，语义查询优先 `mem0`，时序查询优先 `graphiti`，异常时允许回落到 `local`。
- 结论：`W5` 不需要再讨论“要不要启用读链路”，而是要把当前读主路径的口径冻结下来。

### 2.3 当前写链路为什么不是空白，而是半落地实验态

- `index.ts` 中只要 `write_mode != off` 就会捕获写事件；只要 `p3.auto_worker=true` 且有写，就会启动后台 `worker`。
- `worker.ts` 中当 `admission_enabled=true` 时，即使 `write_mode=propose_only`，也会进入 commit 评估；若双写成功、索引检查通过、非敏感且 canary 命中，就会产生 canonical commit。
- 这说明当前状态不是“只收 proposal 不动 commit”，而是“提案优先 + admission 评估 + canary commit”的半落地实验态。
- `outbox.enabled` 虽然有配置位，但当前主执行流并不以它作为捕获或执行主闸门；真正驱动写行为的是 `write_mode`、`auto_worker`、`admission_enabled` 和 `commit_canary_ratio`。

### 2.4 当前哪些内容属于运行画像

本次 `W5-0` 必须显式化的运行画像，至少包含下面九类：

1. `memory` slot 归属和本地后端选择。
2. 读链路路由表：`default / semantic / timeline / fallback`。
3. 写链路状态：捕获、后台执行、admission、canary、人工提交路径。
4. `Mem0 / Graphiti / Qdrant / Neo4j` 的本地连接方式与端口。
5. 嵌入服务画像：`DashScope text-embedding-v4@1536`。
6. 明确禁止的端口条件：`EMBEDDING_BASE_URL` 不能指向 `18082`。
7. `Neo4j Aura` 的 `bolt+s` 规整策略。
8. `Graphiti max_facts=1` 这一代码级默认值。
9. `memory_search` 连字符回归门及其 PASS 证据位置。

### 2.5 当前最容易被误解的口径

- 把 `local` 误写成 `builtin`：这只对 `day33` 成立，对本机当前配置不成立。
- 把 `fallback` 误写成“本地层本身”：`fallback` 是回退行为，不是存储层定义。
- 把 `qmd` 当作当前 `W5` 主线的一部分：本机配置里它存在，但审计和 `W5` 总方案都要求把它从主路径叙事中降级。
- 把 `outbox.enabled` 当成写链路主开关：历史纠偏文档与当前代码都不支持这个说法。
- 把 `propose_only` 写成“零 commit”：当前代码与本机配置都不支持这个说法。

## 3. `W5-0` 正式交付物

### 3.1 推荐主交付物

未来执行 `W5-0` 时，主交付物统一收在以下目录：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/day0/w5-0-baseline-freeze/baseline-freeze-report.md`

这份单一执行档案必须包含五个固定章节：

1. `day33` 正式基线清单
2. 本机当前运行画像清单
3. 术语与主路径字典
4. 写链路正式状态记录
5. `W5-0` Gate 评审结果

### 3.2 可选辅助产物

仅当主交付物篇幅过大时，才允许增加以下文件：

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/day0/w5-0-baseline-freeze/inputs-summary.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/day0/w5-0-baseline-freeze/changed_files.txt`

禁止为“看起来完整”而拆分无必要的文档。

## 4. 执行任务拆分

### Task 1：锁定输入集并建立证据地图

**执行者：** `W5-0` 执行者  
**评审者：** 人类维护者

**必读文件：**

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/plans/2026-03-05-wave5-mem0-graphiti-plan.md`
- `analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/gate4.go-no-go.summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/memory-search-regression/acceptance.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/audit-review.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/audit-summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/recommendations-ranked.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`
- `~/.openclaw/openclaw.json`

**建议核对命令：**

```bash
jq '.' analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json
jq '.' analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/gate4.go-no-go.summary.json
jq -r 'paths(scalars) as $p | [($p|join(".")), (getpath($p)|tojson)] | @tsv' ~/.openclaw/openclaw.json | rg 'memory|plugins\.entries\.memory-mem0-graphiti-bridge|read_mode|write_mode|cutover_percent|outbox|p3|backend'
```

**执行步骤：**

1. 建立“来源清单”，列出后续所有事实的唯一来源文件。
2. 在主交付物中新增“证据地图”附录，按“方案、审计、收口证据、本机配置、代码事实、脚本事实”六类归档。
3. 单独列出“`day33` 获胜口径”和“本机当前状态”两个来源池，禁止混写。

**输出物：**

- `baseline-freeze-report.md` 中的“证据地图”章节。

**验收方式：**

- 任一结论都能追到唯一文件来源。
- 评审者能在五分钟内看懂“哪些是正式基线来源，哪些只是本机现地来源”。

**失败停点：**

- 如果某个关键结论找不到源码、配置或产物支撑，立刻 `Stop`，不得进入后续任务。

### Task 2：冻结 `day33` 正式基线

**执行者：** `W5-0` 执行者  
**评审者：** 人类维护者

**必读文件：**

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/inputs/openclaw.config.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/gate4.go-no-go.summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/memory-search-regression/acceptance.md`
- `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day11/w4-r1-memory-search-hyphen-fix/scripts/run-memory-search-regression.ts`

**建议核对命令：**

```bash
jq '{memory:.memory,plugins:.plugins}' analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/inputs/openclaw.config.json
rg -n 'max_facts' extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts
rg -n 'hyphen-01|hyphen-02|hard gate violated' analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day11/w4-r1-memory-search-hyphen-fix/scripts/run-memory-search-regression.ts
```

**执行步骤：**

1. 在主交付物中建立“正式基线清单”，先固定唯一产物目录：`day33/w4-r24-gate4-single-primary-maxfacts1`。
2. 记录 `Go` 指标：`top1_avg_delta_pp=74.8`、`fur_delta_pp=72.58`、`p95_increase_pct=13.7122`、`stability.pass=true`。
3. 记录获胜配置字段：`memory.backend=builtin`、`plugins.slots.memory=memory-mem0-graphiti-bridge`、`read_mode=primary`、`cutover_percent=100`、`default_route=local`、`semantic_route=mem0`、`timeline_route=graphiti`、`fallback_route=local`。
4. 把 `single-primary`、`Graphiti max_facts=1`、`memory_search` 连字符硬门一起写成“不可拆分的基线包”。
5. 明确写一句：`day33` 正式基线只定义读链路获胜口径，不自动代表当前写链路状态。

**输出物：**

- `baseline-freeze-report.md` 中的“`day33` 正式基线清单”章节。

**验收方式：**

- 基线清单必须同时包含：产物目录、指标阈值、配置字段、隐式代码参数、回归门。
- 评审者能直接回答“`day33` 到底冻结了什么”。

**失败停点：**

- 如果 `single-primary`、`max_facts=1` 或连字符硬门任一项无法落到明确证据，立刻 `Stop`。

### Task 3：显式记录当前运行画像

**执行者：** `W5-0` 执行者  
**评审者：** 人类维护者

**必读文件：**

- `~/.openclaw/openclaw.json`
- `src/memory/backend-config.ts`
- `src/agents/tools/memory-tool.ts`
- `extensions/memory-mem0-graphiti-bridge/index.ts`
- `extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts`
- `scripts/memory-stack/common.sh`
- `scripts/memory-stack/start.sh`

**建议核对命令：**

```bash
jq '{memory:.memory,plugins:.plugins,agents:.agents.defaults.memorySearch}' ~/.openclaw/openclaw.json
rg -n 'backend !== "qmd"|return \{ backend: "builtin" \}|backend: "qmd"' src/memory/backend-config.ts
rg -n 'read_mode|cutoverPercent|userRoute|candidateRoute|fallbackRoute' extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts
rg -n 'EMBEDDING_BASE_URL|EMBEDDING_MODEL_NAME|EMBEDDING_DIM|18082|neo4j\+s|bolt\+s' scripts/memory-stack/common.sh
```

**执行步骤：**

1. 在主交付物中拆开两个小节：`day33` 画像、`本机当前画像`，禁止合并。
2. 记录本机当前配置事实：`memory.backend=qmd`、`bridge` 已接管 `memory` slot、`read_mode=primary`、`write_mode=propose_only`、`cutover_percent=100`、`p3.auto_worker=true`、`p3.admission_enabled=true`、`p3.commit_canary_ratio=0.05`。
3. 解释 `local` 在本机当前画像中实际指向什么：`bridge` 内部包裹的本地工具会读取 `memory.backend`，因此本机当前 `local` 不是 `builtin`，而是 `qmd`。
4. 把脚本中的运行条件显式写出来：`DashScope text-embedding-v4@1536`、`EMBEDDING_BASE_URL` 禁止 `18082`、`Neo4j Aura` 规整到 `bolt+s`、`Mem0` 本地 `8766`、`Graphiti` 本地 `8000`、`Qdrant` 本地 `6333`。
5. 单列“隐藏成功条件”表，把当前仍埋在脚本或代码中的条件逐条提升为显式约束。

**输出物：**

- `baseline-freeze-report.md` 中的“当前运行画像”章节。

**验收方式：**

- 评审者能清楚区分：什么是正式基线画像，什么是本机当前实验画像。
- 评审者能直接指出哪一条是“脚本补丁”，哪一条是“正式产品默认值”，哪一条只是本机状态。

**失败停点：**

- 如果文档仍然无法回答“当前稳定运行靠的到底是哪几条硬约束”，立刻 `Stop`。

### Task 4：统一术语与主路径叙事

**执行者：** `W5-0` 执行者  
**评审者：** 人类维护者

**必读文件：**

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/plans/2026-03-05-wave5-mem0-graphiti-plan.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/recommendations-ranked.md`
- `src/memory/backend-config.ts`
- `src/agents/tools/memory-tool.ts`
- `extensions/memory-mem0-graphiti-bridge/index.ts`

**执行步骤：**

1. 在主交付物中建立“术语与主路径字典”表。
2. 对每个词给出唯一、可落到代码或配置的定义：`builtin`、`qmd`、`local`、`fallback`、`bridge`、`Mem0`、`Graphiti`。
3. 给每个术语补一条“允许用法”和一条“禁止用法”。
4. 固定主路径叙事：
   - `day33` 正式基线叙事是 `builtin + bridge + mem0 + graphiti`；
   - 本机当前画像叙事是 `qmd + bridge + mem0 + graphiti`；
   - `qmd` 当前不属于 `W5` 推荐主线，只属于必须被显式记录的本机现状。
5. 单独写一句：`fallback` 只能描述行为，不能替代“基础记忆层”的概念。

**输出物：**

- `baseline-freeze-report.md` 中的“术语与主路径字典”章节。

**验收方式：**

- 评审者能不看代码，直接回答“`local` 在 `day33` 和本机当前配置里分别指什么”。
- 文档中不再出现“`qmd` 是否属于 `W5` 主路径”的双重口径。

**失败停点：**

- 如果任何一个术语仍然同时指代两种不同层级，立刻 `Stop`。

### Task 5：正式记录当前写链路状态

**执行者：** `W5-0` 执行者  
**评审者：** 人类维护者

**必读文件：**

- `~/.openclaw/openclaw.json`
- `extensions/memory-mem0-graphiti-bridge/index.ts`
- `extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts`
- `extensions/memory-mem0-graphiti-bridge/src/config/flags.ts`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`

**建议核对命令：**

```bash
rg -n 'write_mode !== "off"|auto_worker' extensions/memory-mem0-graphiti-bridge/index.ts
rg -n 'requiresCommitEvaluation|blockedByCanary|admissionReasons|commitCandidate' extensions/memory-mem0-graphiti-bridge/src/p3/worker.ts
rg -n 'propose_only|outbox.enabled|write_mode' analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md
```

**执行步骤：**

1. 把当前写链路正式命名为：**提案优先 + admission 评估 + canary commit 的半落地实验态**。
2. 用表格记录五个核心状态位：`write_mode`、`auto_worker`、`admission_enabled`、`commit_canary_ratio`、`outbox.db_path`。
3. 明确写出两个纠偏结论：
   - `propose_only` 不等于零 commit；
   - `outbox.enabled` 不是写主闸门。
4. 把当前写链路中已经存在但尚未正式治理的部分列为“已发生事实”，例如：自动捕获、后台写 worker、admission 条件、canary 筛选、proposal 状态回写。
5. 把当前仍未正式完成的部分列为“留给 `W5-B` 的工作”，例如：长期 operating model、正式分账指标、回滚策略、人工治理界面。

**输出物：**

- `baseline-freeze-report.md` 中的“写链路正式状态记录”章节。

**验收方式：**

- 评审者能直接回答：当前写链路是“关着的、半开实验态、还是正式生产态”。
- 文档明确说明：为什么 `W5-B` 必须在 `W5-0` 之后，而不能替代 `W5-0`。

**失败停点：**

- 如果写链路仍被描述成“还没做”或“已经完全上线”，立刻 `Stop`。

### Task 6：定义 `W5-0` Gate、`Go / No-Go` 与 `Stop point`

**执行者：** `W5-0` 执行者  
**评审者：** 人类维护者

**必读文件：**

- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/plans/2026-03-05-wave5-mem0-graphiti-plan.md`
- `analysis/2026-03-06-super-jarvis-memory-upgrade-plan.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/audit-summary.json`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/recommendations-ranked.md`

**执行步骤：**

1. 在主交付物中建立 `Gate / Go-No-Go` 表，只允许写可核对、可签字的条件。
2. 明确 `Go` 条件必须同时满足：
   - `day33` 正式基线清单完整；
   - 本机当前运行画像完整；
   - 术语字典无冲突；
   - 写链路状态记录完整；
   - `W5-A` 前置物已列清。
3. 明确 `No-Go` 条件：只要还有“正式基线 vs 本机现状”混写、隐藏条件未显式化、术语仍双义、写态仍误报，就不能放行。
4. 明确 `Stop point`：`W5-0` 文档交付后，必须先人工验收，再决定是否进入 `W5-A`；默认不跨阶段并行。
5. 单列 `W5-A` 依赖清单，禁止把 `W5-A` 的实现任务提前写进 `W5-0`。

**输出物：**

- `baseline-freeze-report.md` 中的 `Gate / Go-No-Go` 和 `W5-A` 前置清单章节。

**验收方式：**

- 评审者可以只看 Gate 页，就决定“现在能不能开始 `W5-A`”。

**失败停点：**

- 如果 Gate 仍然依赖口头解释或临场经验，立刻 `Stop`。

## 5. `W5-0` 完成后，什么算正式基线

只有下面这组内容一起成立，才算 `W5` 的正式基线：

1. 唯一正式证据目录：`day33/w4-r24-gate4-single-primary-maxfacts1`。
2. 唯一正式质量口径：`top1_avg_delta_pp=74.8`、`fur_delta_pp=72.58`、`p95_increase_pct=13.7122`、`stability.pass=true`。
3. 唯一正式读链路配置口径：`builtin + bridge + mem0 + graphiti`，其中 `read_mode=primary`、`cutover_percent=100`、`default=local`、`semantic=mem0`、`timeline=graphiti`、`fallback=local`。
4. 唯一正式隐式参数口径：`Graphiti max_facts=1`。
5. 唯一正式检索回归口径：`memory_search` 连字符硬门 `PASS`。
6. 唯一正式运行画像文档：`baseline-freeze-report.md` 中已通过评审的“运行画像”章节。
7. 唯一正式术语口径：`baseline-freeze-report.md` 中已通过评审的“术语与主路径字典”章节。
8. 唯一正式写链路状态口径：`baseline-freeze-report.md` 中已通过评审的“写链路正式状态记录”章节。

注意：本机当前 `qmd` 配置本身不自动进入“正式基线”，它只能作为“现地画像中的已知差异”被记录。

## 6. `W5-0` Gate 定义

### 6.1 `Go` 条件

- `day33` 基线证据、指标和配置已完整冻结。
- `Graphiti max_facts=1`、连字符硬门、嵌入画像、`Neo4j Aura` 规整策略都已从代码或脚本层提升为文档化约束。
- 本机当前配置的真实状态已完整记录，且与正式基线的差异已单列说明。
- `local / fallback / builtin / qmd / bridge` 已形成无冲突字典。
- 当前写链路被正式命名为“半落地实验态”，且驱动字段、非驱动字段、后续归属阶段都已写清。
- 评审者已人工签字确认：`W5-A` 可以拿这份基线做唯一前置输入。

### 6.2 `No-Go` 条件

- 仍然有人需要靠口头解释才能说清主路径。
- 仍然把本机 `qmd` 现状写成 `W5` 正式主线。
- 仍然把 `outbox.enabled` 写成写主闸门。
- 仍然把 `propose_only` 写成零 commit。
- 仍然无法区分“正式基线”和“本机实验画像”。

## 7. `Stop point`

`W5-0` 的默认停点只有一个：

> 主交付物完成，人工验收完成，`Go / No-Go` 已签字，才允许进入 `W5-A`。

在此之前，默认动作是：

- 停在文档收口；
- 不做 `bridge` 硬化；
- 不做写链路正式化；
- 不做评测升级；
- 不做 `Ontology` 基础层实现。

## 8. `W5-A` 的明确前置输出

`W5-A` 开始前，必须已经拿到以下五项输出：

1. 通过评审的 `day33` 正式基线清单。
2. 通过评审的当前运行画像清单。
3. 通过评审的术语与主路径字典。
4. 通过评审的写链路正式状态记录。
5. 通过评审的 `Gate / Go-No-Go` 结果页。

`W5-A` 只能消费这些输出，不能自行回头重定义基线、术语或写态。

## 9. 十个必答问题对照

| 必答问题                                             | 本计划中的回答方式                                        | 对应任务                               | 最终落点                |
| ---------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | ----------------------- |
| 为什么 `W5-0` 必须先于 `W5-A/B/C/...`                | 先冻结对照物，再进入后续阶段                              | `Task 1`、`Task 6`                     | “为什么先做这个” + Gate |
| `day33` 里到底有哪些内容必须冻结                     | 指标、配置、`single-primary`、`max_facts=1`、连字符硬门   | `Task 2`                               | “正式基线清单”          |
| 哪些成功条件还散在脚本、环境、经验里                 | 嵌入画像、`18082` 禁止、`bolt+s` 规整、写链路真实驱动字段 | `Task 3`、`Task 5`                     | “运行画像”              |
| 当前运行画像到底包括什么                             | 后端、路由、写态、服务端口、脚本规整、回归门              | `Task 3`                               | “运行画像”              |
| `local / fallback / builtin / qmd / bridge` 怎么统一 | 用术语字典单独固定定义和禁用用法                          | `Task 4`                               | “术语与主路径字典”      |
| 当前写链路真实状态如何正式记录                       | 定义为半落地实验态，不再写成空白或正式上线                | `Task 5`                               | “写链路正式状态记录”    |
| `W5-0` 完成后什么算正式基线                          | 用八条固定条件定义                                        | `Task 2`、`Task 3`、`Task 4`、`Task 5` | “正式基线定义”          |
| `W5-0` 的 Gate 怎么定义                              | `Go / No-Go` 表 + 人工验收                                | `Task 6`                               | “Gate”                  |
| 如果 `W5-0` 没完成，为什么不能进入后续阶段           | 没有统一对照物，后续全会混口径                            | `Task 6`                               | “Stop point”            |
| `W5-0` 交付后，对 `W5-A` 有哪些前置输出              | 五项通过评审的前置文档                                    | `Task 6`                               | “`W5-A` 前置输出”       |

## 10. 一句话执行原则

`W5-0` 的目标不是“再证明一次方案能跑”，而是把已经跑赢的读基线、已经发生的写实验态、以及真正支撑运行的隐藏条件，收成后续所有阶段都不允许再偷换的正式起点。
