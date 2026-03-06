# Palantir 的 “Ontology” 到底是什么？（原理 / 价值 / 开源情况 / Gotham vs Foundry / 对 OpenClaw 与二手车 Agent SaaS 的可复用点）

日期：2026-03-05  
面向：产品经理/架构负责人（尽量不讲玄学）  
结论先行：**Palantir 的 Ontology 不是哲学课的“本体论”，而是一个把组织的数据（nouns）和可执行操作（verbs）统一起来的“业务语义层 + 操作层 + 权限治理层”。**它的价值在于：让人和 AI 都能用同一套“对象/关系/动作”去读写业务世界，并且可控、可审计、可复用。

---

## 0) TL;DR（一页读完就能开会）

你可以把 Palantir Ontology 理解成：

- **一套统一的业务对象模型**：把分散的数据源（ERP/CRM/传感器/文档/地理信息……）映射成“对象（Object）+ 属性（Property）+ 关系（Link）”。
- **一套可控的业务动作模型**：把“能做什么事”也建模成“动作（Action）/函数（Function）”，并支持写回业务系统（不是只读 BI）。
- **一套贯穿对象与动作的安全治理**：对象、关系、动作都受到一致的权限控制与审计（所谓“military‑grade / multimodal security controls”在官方资料里常这样描述）。
- **一套让开发者/应用/Agent 很好用的接口层**：通过 Ontology SDK（OSDK）等方式，把 Ontology 暴露成强类型的 API（更像“业务对象 API”，而不是一堆表/接口的拼贴）。

对我们有什么启发（只说能落地的）：

- **对 OpenClaw（你正在做 mem0 + Graphiti）**：你已经有“写入治理（mem0）+ 时序图召回（Graphiti）+ 本地索引兜底”的骨架了；再往上加一层“个人/小公司 Ontology（对象+关系+动作）”，就能把记忆从“检索片段”升级成“可操作的数字孪生”，并天然适配 agent 的工具调用与审计。
- **对二手车 Agent SaaS**：你已经明确 **PG + 向量** 是确定的底座（结构化事实 + 语义检索）。图数据库/知识图谱要不要上，取决于它是否在“关系推理/反欺诈/多跳查询/可解释性”上带来质变。Palantir Ontology 的可复用点是：用“对象/关系/动作/证据指针/权限”把这些能力统一成一个语义层，让 UI 和 agent 都围绕对象页工作。

开源情况一句话：

- **Foundry / Gotham / Ontology 本身不是开源产品**（商业/政府平台）。
- 但 Palantir 确实开源了不少**SDK/工具链**（例如 `foundry-platform-python`、`gotham-platform-python` 等为 Apache 2.0 许可的客户端 SDK），可借鉴其 API 分层与“Ontology SDK vs Platform SDK”的边界设计。

---

## 1) 先把“Ontology”这个词翻译成人话

在学术/语义网里，“Ontology”经常指 **对世界概念的形式化描述（类/关系/约束）**。  
Palantir 用同一个词，但落点更工程化：

> 他们把 Ontology 当成组织的“数字孪生（digital twin）”：  
> **语义元素（semantic）：对象、属性、关系**
>
> - **动能元素（kinetic）：动作、函数、动态安全**  
>   让应用与自动化能在同一层上运行。  
>   （来源：Foundry Ontology overview 页面描述）

**你要抓住的不是“哲学”，而是三件事：**

1. **统一“名词”**：订单、客户、车辆、线索、检测报告……在所有系统里用一套统一对象表示。
2. **统一“动词”**：更新价格、发车、分配线索、触发复检、生成报价……也进入模型，变成可审计的动作。
3. **把权限/审计绑定到名词和动词上**：不是“应用层想怎么做就怎么做”，而是动作本身就带治理。

官方资料里经常用 **nouns + verbs** 的比喻：

- nouns：对象（制造工厂、产线、客户订单……）
- verbs：动作（更新采购单、改变分发策略、跑多步仿真……）

---

## 2) Ontology 的组成（面向 PM：哪些积木拼起来的）

下面这些术语在 Palantir 的资料里反复出现，你可以把它们当成“产品能力清单”：

### 2.1 对象（Objects）与对象类型（Object Types）

- **Object Type**：某类业务概念的定义（如 `Vehicle`、`Listing`、`Dealer`、`Lead`）。
- **Object**：某个具体实例（VIN=xxx 的那辆车、id=123 的那条线索）。

核心价值：应用不需要知道“数据来自哪张表/哪个系统”，只要知道“我要一个 Vehicle 对象”。

### 2.2 关系（Links）与关系类型（Link Types）

- 把对象连接起来形成可查询的关系网：
  - `Listing -> Vehicle`
  - `Lead -> Listing`
  - `Inspection -> Vehicle`
  - `Decision -> Project`（对个人/一人公司也一样成立）

注意：这不等于“你必须用图数据库”。  
关系可以由图存储支撑，也可以由 PG 外键/边表支撑。**关键是对上层暴露成一致的“Link”概念。**

### 2.3 属性（Properties）与函数（Functions）

属性分两类：

- **存量字段**：从数据源映射来的（里程、颜色、成交价）。
- **计算字段（函数/派生属性）**：从规则/模型/计算链得到的（价格建议、风险评分、Lead Score）。

这点对 agent 很关键：  
agent 不必“自己算一遍”，而是通过 Ontology 的函数拿到可解释、可追踪的结果。

### 2.4 动作（Actions）：把“能做什么”纳入模型

这通常是 Palantir Ontology 最“产品化”的点：不仅能看数据，还能把操作也建模进去，并写回业务系统。

在他们的架构中心介绍里，明确提到：

- 动作可以是简单事务，也可以是**跨工作流的多步编排**
- 动作必须是 **traceable / governed / executable at scale**（可追溯、受治理、可规模化执行）

对我们做 agent 的启示非常直接：

- LLM 最容易出事的是“想当然地执行写操作”。
- 把写操作收口为少量受控 Actions（带前置条件、权限、审计、幂等），可以显著降低风险。

### 2.5 安全与治理（Security/Governance）是“内建”而不是外挂

在官方资料里常见的表达是：

- 对象、关系、动作、函数等语义/动能原语（semantic & kinetic primitives）都在同一套安全控制里。
- 人与 AI agent 都可以“在 Ontology 上编排”，但要有足够的 guardrails 来维持信任。

这一点对二手车 SaaS 的多租户与对 OpenClaw 的“安全工具调用”都很关键。

### 2.6 开发体验：Ontology SDK（OSDK）与 Platform SDK 的分层

Palantir 的开源 SDK 文档里，把 SDK 分得很清楚：

- **Platform SDK（Foundry/Gotham）**：更偏“平台管理/资源管理/类型管理”的 API（例如对象类型、动作类型）。
- **Ontology SDK（OSDK）**：更偏“业务对象/关系/动作执行”的开发体验（例如查询对象、执行 Action）。

这其实是一种非常值得抄作业的**API 分层**：

- 平台层 API：管理 schema / 元数据 / 管理功能
- 业务层 API：面向业务对象与动作（让应用/agent 用）

---

## 3) 运行原理（不写代码，但讲清数据怎么变成可用的“对象世界”）

把 Palantir Ontology 的核心链路抽象成一个“可复用的架构模板”：

```text
各种数据源（ERP/CRM/表格/文档/传感器/第三方平台…）
        |
        v
数据接入与清洗（ETL/ELT/Streaming）  +  质量/血缘/版本
        |
        v
映射到 Ontology（对象/属性/关系/函数）
        |
        +--> 给人用：对象页、流程页、分析面板（围绕对象）
        |
        +--> 给程序用：OSDK/GraphQL/REST（强类型对象 API）
        |
        +--> 给 AI 用：检索对象/关系 + 执行动作（受控）
                     |
                     v
                 写回业务系统（动作执行） + 审计
```

**关键点：Ontology 是“应用与数据之间的中间层（语义层）”，不是某个单点数据库。**

这也是 Palantir 在 “Why create an Ontology?” 页面里强调的重点之一：

- Ontology 作为**决策的共享真相源（source of truth）**，不仅用于读数据，也用于写回、捕获决策。
- 相比仅靠数据湖/报表，Ontology 可以控制复杂度，减少“新项目重复造轮子”，把新信息持续纳入通用语言。

---

## 4) 价值到底在哪（拆成可量化/可验收的点）

把“价值”拆成你能写进 PRD/验收标准的句子：

### 4.1 对组织/业务方

- **统一口径**：跨系统、跨团队对同一个对象（车、线索、订单）有同一身份与字段解释。
- **降低沟通成本**：业务讨论围绕对象页和动作，而不是围绕“哪个系统/哪张表”。
- **决策沉淀**：把“为什么这么改价/为什么这么分配线索”变成可追踪记录（不仅是聊天记录）。

### 4.2 对工程/交付

- **减少集成重复**：不用每个应用都写一套数据拼接逻辑。
- **应用开发变快**：对象/关系/动作是可复用积木；新用例主要是“拼装与权限配置”。
- **治理内建**：权限与审计不再“后补”，降低合规与事故成本。

### 4.3 对 AI / Agent

如果你要让 agent 真正“能做事”，而不是只会“说”，Ontology 的价值尤其大：

- **更可靠的 grounding**：agent 的上下文来自“对象与关系”，而不是一堆松散文本片段。
- **更安全的执行**：agent 的写操作通过 Actions 收口，天然带 guardrails（幂等/审批/审计/权限）。
- **更强的可解释**：回答可以指向具体对象与字段（evidence pointers），而不是“我觉得是这样”。

---

## 5) 开源情况：哪些是开源的？哪些不是？

### 5.1 不开源的部分（结论明确）

- **Foundry / Gotham / Ontology 平台本身：不是开源产品。**  
  它们是商业/政府平台，核心能力（数据接入、权限、运行时、UI、优化器等）不以开源方式发布。

### 5.2 开源且“能直接借鉴”的部分（可落地）

Palantir 在 GitHub 上开源了不少 SDK/工具链。和本题最相关的是：

- `palantir/foundry-platform-python`：Foundry API 的 Python SDK（Apache 2.0），并在 README 中解释了 Platform SDK vs OSDK 的边界。  
  https://github.com/palantir/foundry-platform-python
- `palantir/gotham-platform-python`：Gotham API 的 Python SDK（Apache 2.0）。  
  https://github.com/palantir/gotham-platform-python
- `palantir` GitHub 组织：  
  https://github.com/palantir/

你能从这些开源仓里“抄”的不是 Foundry/Gotham 的实现，而是：

- API 的分层方式（平台 API vs 业务对象 API）
- 权限/鉴权方式在 SDK 里的表达（token、生产禁用 user token 等）
- 版本化策略（API versioning）
- 以及“如何把 Ontology 作为一等公民暴露给开发者”

### 5.3 我们“借鉴/抄作业”的边界（务实提醒）

- **可以借鉴概念/抽象/交互范式**（对象页、动作、证据指针、权限内建）。
- **不要试图复制其闭源实现**（这既不现实也有法律风险）。
- “抄作业”更正确的方式：用开源组件 + 自己的领域模型实现一个“我们自己的 Ontology layer”。

---

## 6) Gotham vs Foundry：原理是否一致？是否开源？

把问题拆开回答：

### 6.1 “原理是否一致？”

一致的部分（可理解为“同一方法论/同一抽象”）：

- 都在解决：**把现实世界映射成对象/关系/动作**，并在其上构建应用与自动化。
- 都强调：权限、审计、写回（不仅只读分析）。

差异的部分（可理解为“产品形态与领域能力不同”）：

- **Foundry**：更偏企业运营与数据/应用交付平台（供应链、制造、金融、运营等）。
- **Gotham**：更偏国防/情报/任务场景（地理时空、目标/态势、任务应用等），并在 SDK 文档里明确提到 Gaia、Target Workbench、geotemporal data 等 Gotham 领域对象。

从 Palantir 的 SDK 公开描述里也能看到这种分工：

- Gotham Platform SDK：面向 Gotham apps 和数据（Gaia、Target Workbench、地理时空数据）。
- Foundry Platform SDK：面向 Foundry 平台资源与服务（包含一些 Ontology 的“类型/资源层”端点）。
- Ontology SDK（OSDK）：面向“对象/关系/动作”的应用开发体验（更适合真正用 Ontology 的应用/agent）。

### 6.2 “是否开源？”

- **Gotham / Foundry 平台：不是开源。**
- **Gotham/Foundry 的部分 SDK：是开源（Apache 2.0）**，但它们是“调用平台 API 的客户端库”，不是平台实现。

---

## 7) 第二轮增补：Palantir / Foundry / AIP / Ontology 的能力清单（尽量拉平、可抄作业）

> 你这轮追问的核心其实是：  
> **“我能不能把 Palantir 的这套方法论当成 reference architecture，把它的能力树拆开来抄？”**  
> 这部分就是按这个目标写的。
>
> 说明（很重要）：
>
> - 我只能基于 **公开资料**（官方 docs 导航树 + 开源 SDK 的模块分组 + 少量官方博客/公告）做能力盘点。
> - Palantir 的商业交付里，能力可用性可能会“因客户/版本/权限”有差异（他们在 AIP 文档里也明确提示 feature availability 会变）。
> - 但对你要做的事（借鉴框架设计/产品形态/能力模块化），这份清单已经足够当“抄作业蓝图”。

### 7.1 先给你一个“能抄的分层图”（Palantir 全家桶怎么拼）

从公开资料看，Palantir 这套东西可以拆成 5 层（你可以直接映射到自己产品）：

1. **数据接入与处理（Foundry Data Integration）**  
   把外部系统的数据可靠地接进来、变换、增量/流式处理、质量监控。

2. **语义与操作（Ontology）**  
   把数据映射成对象/关系/动作/函数，并内建权限、审计、回滚等治理能力。

3. **应用构建（Workshop / Object Explorer / Object Views / Vertex 等）**  
   让业务人员围绕对象页、对象集、图关系去工作（不是围绕表和报表）。

4. **AI 能力（AIP）**  
   把 LLM 变成可上线的 workflow/agent/function，并嵌入安全与审计框架里。

5. **交付与运维（Apollo + 平台运维域）**  
   解决多环境部署、发布、回滚、任务场景交付（公开材料里常这么描述）。

你可以把它翻译成你的“通用架构模板”：

```text
外部数据源 -> (接入/清洗/质量) -> 语义对象世界 -> (对象页/应用/图探索) -> (人+AI) -> Actions 写回 + 审计
```

### 7.2 Foundry（数据与开发底座）能力清单：能抄的“数据工厂 + 研发环境”模块

这一部分你不必完全复制，但它解释了为什么 Ontology 能长期活：因为底层的数据接入与变换是工业化的。

#### 7.2.1 数据接入（Sync / Connectors）

- **Sync**：把外部系统数据同步进平台（有 batch、streaming、CDC、media 等不同形态）
- **Connector**：对接外部数据源的预置集成（数据库、云存储、API、企业系统等）
- **调度/触发**：同步可以按计划或手动触发（面向生产管道必须具备）

#### 7.2.2 数据处理（Pipeline Builder / Transforms / 增量 / 流式）

- **Pipeline Builder**（点选式管道构建）典型能力：
  - 点选式构建 pipelines
  - 健康检查与数据质量监控
  - schema safety（类型/结构安全）
  - LLM 辅助生成复杂变换（公开资料里明确提到）
  - 支持 media 与地理空间数据处理
- **Transforms（变换）**：用 Python/SQL/Java 等编写生产级处理逻辑
  - 支持单机引擎（Pandas/Polars/DuckDB）与分布式 Spark
  - 支持 incremental computation（只算增量）
- **Processing modes**（跑法）：
  - Batch（全量重算）
  - Incremental（只处理变化数据）
  - Streaming（低延迟，公开资料里提到 Flink）

#### 7.2.3 版本与协作（Branching + Review）

- **Branch（分支）**：不仅代码能分支，pipeline/dataset/Ontology/应用也能分支并行开发，再合并回主线。  
  这点很值得抄：**“语义世界”必须像代码一样有并行协作与发布流程。**

#### 7.2.4 数据质量与健康（Expectations / Health Checks）

- **Data Expectations**：数据质量断言（可阻断构建）
- **Health Checks**：对 freshness/quality/管道异常做监控与告警

> 对二手车业务这块非常实用：  
> 例如“VIN 不能为空”“里程必须非负”“检测报告必须在 48h 内写入”“渠道上架状态必须可追踪”等，都可以变成质量门禁。

#### 7.2.5 研发与运行环境（Developer Console / Workspaces / Compute modules）

从公开文档目录看，Palantir 把“开发环境”也系统化了：

- **Developer Console**：创建/管理应用（OAuth client、权限、scopes、metrics 等）
- **Compute modules**：容器化执行、弹性扩缩、执行模式、调试、历史、用量与定价视角
- **Developer workspaces / VS Code workspaces**：托管研发环境（包括 JupyterLab、RStudio 等方向）

### 7.3 Ontology（语义 + 动作 + 治理）能力清单：这是你最该抄的“框架内核”

这一部分我按“可被产品/工程复用”的方式重新组织。

#### 7.3.1 Ontology 的生命周期与变更管理（像代码一样发布）

公开文档里，Ontology 有非常完整的“变更治理面”：

- Ontology 的分支、提案评审、测试、迁移、共享（shared ontologies）
- Ontology Manager：保存变更、恢复/回滚、导出/导入、清理、用量查看
- 权限模型迁移（从 legacy 到 project-based permissions 的路径）

你抄作业时要抓住一个产品原则：

> **语义层 = 业务世界的操作系统内核，必须支持：变更流程 + 回滚 + 成本/用量。**

#### 7.3.2 建模积木（Objects / Links / Properties / Interfaces / Types）

Ontology 的“对象世界”不是一个 schema 表，它更像一套可演进的类型系统：

- **Object Types**：对象类型定义（主键、标题字段、背后映射的数据源等）
- **Link Types**：关系类型定义（基数、连接键、是否允许编辑等）
- **Properties**：属性体系（required/edit-only/控制字段、格式化、条件格式等）
- **Value Types**：值类型（版本、权限、约束、渲染提示、状态体系）
- **Structs**：结构体类型（自动映射、共享字段、主字段）
- **Shared properties**：共享字段（避免重复定义）
- **Interfaces**：抽象类型（让多个对象实现同一个接口，便于多态 workflows）

这对二手车很有用：  
比如 `Vehicle`、`Truck`、`EV` 都实现 `VehicleBase` 接口；或者 `Lead`、`CustomerSupportTicket` 都实现 `ConversationThread` 接口。

#### 7.3.3 对象世界的“可用性工程”：索引与成本

公开文档里明确存在：

- Ontology volume（规模/用量）
- Ontology indexing compute（索引算力）
- Ontology query compute（查询算力）

抄作业含义：

> 你做自己的 Ontology layer 时，也要把“索引/查询成本”当作产品一部分，  
> 否则对象/关系越建越多，最后要么慢、要么贵、要么不可控。

#### 7.3.4 Actions（动作）：写操作的“受控入口”

Ontology 的动作体系之所以值得抄，是因为它把“写操作”产品化成可治理事务：

- Action types：参数（默认值、下拉过滤、性能/安全注意事项）、规则、提交条件、接口/结构体上的动作、function-backed actions
- Side effects：通知、webhooks
- 配置与体验：表单区块、媒体/附件上传、inline edits
- 治理与可观测：权限、监控、撤销/回滚、metrics、action log

你可以把它直接翻译成你自己的“Agent 写操作守门员”：

> **Agent 永远不直接写 PG/外部系统；只允许提交 Action proposals；人审或策略审批后再执行。**

#### 7.3.5 Functions（函数）：把业务逻辑与“对 Ontology 的读写”一等化

在公开文档里，Functions 是 server-side 逻辑体系，并且一等支持：

- 查询 object sets、遍历 links、做聚合/计算
- 进行 Ontology edits（创建/更新/删除对象、加/删 links）
- 调用外部 API
- 版本化、发布、权限、遥测、性能优化、用户可见错误
- 单元测试（stub objects、mock users/groups、验证 edits）

#### 7.3.6 围绕对象世界的业务应用（让业务人员真正用起来）

Ontology 的“应用侧”公开能力非常多，核心可以归为三类：

- **Object Explorer**：搜索/过滤/对比 object sets、SQL 分析、pivot linked objects、保存列表、Apply Actions
- **Object Views**：对象页（tabs/sidebar/profiles/widgets/layout），支持评论与 Marketplace
- **Vertex（图探索）**：探索对象关系、图模板、从其他应用生成图、用 Functions 生成/派生属性、嵌入到 Workshop、事件与时间序列、timeline 过滤等

> 注意：Palantir 的“图”不是单点，而是嵌入到对象世界与动作治理里的。  
> 这也是你评估“要不要上图数据库”时最关键的参照系。

### 7.4 AIP（AI Platform）能力清单：把 LLM 变成可上线的生产系统

官方文档对 AIP 的定位很清楚：它连接 AI 与“你的数据与 operations”，并内建安全、审计与资源管理。

#### 7.4.1 AIP 的核心产品（你可以当作“AI 产品模块清单”）

- **AIP Assist**：平台内上下文感知助手（不同应用上下文下回答不同），支持 suggested actions
- **AIP Logic**：无代码/低代码的 LLM 函数构建器（提示词、自动化、与 Ontology 数据集成、metrics、branching）
- **AIP Agent Studio**：构建可交互 agents（能用 Ontology 数据与工具完成任务，甚至编辑 Ontology 数据）
- **AIP Evals**：评估与回归（测试用例、评估标准、对比模型、观察方差、系统性迭代）
- **AIP Threads**：拖文档即可做临时分析/任务（面向非技术用户）
- **AIP Model Catalog / Document Intelligence**：在 features 页能看到的能力入口（用于模型选择与文档智能方向）
- **Palantir MCP**：让外部 AI IDE/agents 接入 Foundry/Ontology（query data、读文档、理解工具）

#### 7.4.2 AIP 的工程化与治理能力（决定能不能“上线”）

从文档目录能看到的能力域包括：

- AIP security / ethics & governance（安全与伦理治理）
- AIP observability（可观测）
- compute usage / capacity management（算力用量与容量管理）
- supported LLMs / use registered LLM / provider compatible APIs / bring your own model（模型生态与接入方式）
- prompt engineering best practices、function interface quickstart（开发最佳实践与接口约束）

### 7.5 Developer toolchain（OSDK + MCP + Dev Console）：把能力开放给外部生态

Palantir 的 “Dev toolchain” 目录非常关键，它揭示了他们如何把 Ontology 变成开发者可消费的东西：

- **OSDK（Ontology SDK）**：TypeScript/Python/Java + 生成其他语言 + 订阅 Ontology 变更（含 WebSocket）
- **Ontology MCP / Palantir MCP**：把 Foundry/Ontology 暴露给外部 AI 系统（IDE/agent）
- **Developer Console**：OAuth、权限、scopes、metrics、bootstrap 各语言应用、托管应用、离线能力（embedded ontology）等
- **Workspaces & VS Code extension**：把开发体验产品化（Active Preview、Debug transforms、Build transforms 等）

### 7.6 从开源 SDK 反推的“能力域列表”（这部分最像“能力清单”）

Palantir 开源的 TypeScript Foundry SDK（`foundry-platform-typescript`）把 API 划分为一组能力域包。包名基本就是能力模块：

- 平台与治理：`foundry.admin`、`foundry.operations`、`foundry.audit`、`foundry.datahealth`
- 数据与接入：`foundry.connectivity`、`foundry.datasets`、`foundry.streams`、`foundry.filesystem`、`foundry.sqlqueries`
- 语义与动作：`foundry.ontologies`、`foundry.functions`
- AI 相关：`foundry.aipagents`、`foundry.languagemodels`
- 垂直能力/多模态：`foundry.geo`、`foundry.geojson`、`foundry.mediasets`
- 应用与交付：`foundry.widgets`、`foundry.notepad`、`foundry.orchestration`、`foundry.checkpoints`、`foundry.publicapis`、`foundry.thirdpartyapplications`、`foundry.pack`
- 基础：`foundry.core`

同时，TypeScript Ontology SDK（`osdk-ts`）提供：

- `@osdk/client` / `@osdk/api`：客户端与 API 类型
- `@osdk/oauth`：认证（OAuth）
- `@osdk/foundry-sdk-generator`：生成工具链（从 Developer Console 生成 ontology-specific SDK 的配套组件）

> 你要抄作业，可以把这份“能力域包列表”当成你自己产品未来模块化 API 的命名与分层参考。

### 7.7 对我们来说，最值得优先抄的 8 件事（按收益排序）

如果你希望“套方法论而不是抄 UI”，建议优先抄这些：

1. **对象页是中心**（Object Views / Object Explorer 的产品形态）
2. **写操作收口到 Actions**（参数/规则/权限/审计/回滚/副作用）
3. **Functions 一等化**（读 + 算 + 写回 edits）
4. **语义层有变更管理**（分支、评审、测试、发布、回滚）
5. **成本/用量可视化**（索引/查询 compute，防止系统越用越贵）
6. **AI 不是外挂**（AIP 嵌入安全/审计/资源管理）
7. **Evals 作为上线门禁**（把评估变成产品内建能力）
8. **OSDK + MCP**（把语义世界开放给外部生态/IDE/agent）

---

## 8) 对 OpenClaw（mem0 + Graphiti）我们能怎么复用？

你现有的目标（来自你的落地方案）是：

- mem0：写入治理（抽取/去重/沉淀）
- Graphiti：时序关系图召回
- OpenClaw 本地索引：默认与兜底

这套已经很接近 Palantir Ontology 的一个核心切面：**把“上下文”从文本升级成结构化对象与关系**。  
但要更像 Ontology，还差一个关键层：**动作（verbs）与治理绑定。**

### 8.1 把 OpenClaw 的记忆层升级成“个人/一人公司 Ontology”

建议你把“记忆升级”分成两层：

1. **存储/检索层**（你已经在做）

- 本地索引（快速兜底）
- mem0（写入治理）
- Graphiti（时序关系）

2. **语义/操作层（Ontology layer）**（建议补上）

- 统一对象类型：`Person/Project/Task/Decision/Artifact/...`
- 统一关系类型：`works_on/depends_on/decided_by/...`
- 统一动作：`create_task/update_task/log_decision/link_artifact/...`
- 统一审计：每个动作都落日志、可回放、可撤销（尽量）

### 8.2 “Ontology Augmented Generation” 在 OpenClaw 的落地版本（简化但有效）

一个非常实用的 agent 回答模板：

1. **先查对象**：问题涉及谁/什么项目/什么任务？先从图里把相关对象与近邻关系拉出来。
2. **再回答**：回答时引用对象属性（不是引用一堆片段）。
3. **最后给动作**：给出 1~3 个下一步动作（并明确是否需要人类确认）。

这比“RAG 拼片段”更稳定，因为：

- 对象是稳定 ID（不会因为文件路径变化而漂移）
- 关系让你更容易追溯“为什么这个上下文相关”

### 8.3 最小对象模型（建议从 10 个对象类型起步）

面向“超级个体一人公司”场景，一个够用的 Ontology MVP：

- `Person`：联系人（客户/合作方/朋友/供应商）
- `Org`：组织（公司/团队）
- `Project`：项目（可交付的工作单元）
- `Task`：任务（可执行的下一步）
- `Decision`：关键决策（带日期/理由/影响面）
- `Artifact`：产物（文档/代码/合同/报价单）
- `Meeting`：会议/通话（摘要+结论+动作）
- `Lead`：线索（对 SaaS 的销售也能复用）
- `Risk`：风险（风险类型/概率/影响/缓解动作）
- `Metric`：指标（北极星/周指标）

### 8.4 动作（Actions）怎么设计才“能控、可审计”

不要把 Actions 设计成“万能执行器”。建议遵循：

- **少而精**：每个动作可解释、可审计。
- **输入强约束**：参数必须结构化（Zod/JSON schema）。
- **幂等**：同一动作重复调用不会造成灾难（尤其是写外部系统）。
- **审批边界**：高风险动作（发邮件/改价格/发车/提交合同）默认需要人类确认。

这套范式可以直接对齐你已有的“写入治理”和“fallback”思想。

---

## 9) 对二手车 Agent SaaS：我们能怎么复用？（PG + 向量确定，图/规则按收益选）

这一节我会刻意**不被旧 ADR 约束**，用“二手车真实工作流”重新组织一套可落地的 Ontology 方法论落地版。

如果你只想记住一句话：

> **二手车业务的 AI 不是“会聊天”就行，而是必须在一个“对象世界 + 受控动作 + 证据与审计”的框架里运行。**  
> PG 管事实、向量管语义、（可选）图管关系推理，最后通过 Actions 把写操作收口。

### 9.1 先把二手车业务“建成对象世界”（Nouns）

建议从 8~12 个对象类型起步（足够支撑对象页 + agent + 权限/审计）：

- `vehicle`：车辆（VIN/车架号、里程、上牌、配置、车况、整备状态）
- `listing`：上架（渠道、价格、状态、文案、曝光、下架原因）
- `dealer` / `store`：车商主体与门店（多租户、多门店、人员）
- `customer`：客户（手机/微信、画像、合并策略、隐私标记）
- `lead`：线索（来源、阶段、意向、负责人、下一步）
- `conversation`：沟通记录（电话录音转写、微信聊天摘要、跟进备注）
- `inspection_report`：检测/整备报告（结构化结论 + 附件）
- `media_asset`：图片/视频/证件材料（OCR、合规标注、去重）
- `price_event`：价格变更事件（时间序列，解释与回溯用）
- `channel`：渠道（懂车帝/抖音/瓜子/自有小程序/微信群等）

如果你要做更“经营系统”的闭环，再加 2~4 个对象：

- `transaction`：成交/合同（关键字段与附件）
- `finance_application`：金融分期/保险（状态机）
- `after_sales_case`：售后纠纷/退换（风控与口碑）
- `risk_case`：风控案件（串联可疑车辆/客户/门店）

### 9.2 关系（Links）怎么建：别一上来就图数据库，但要把“边”产品化

最低成本但高收益的做法：

- 在 PG 里把关系当一等数据：外键 + 边表（`edges` / join table）
- 关系允许带“边属性”（Palantir 里有类似 object-backed links 的概念）：  
  例如 `lead -> listing` 这条边可以带上 “来源渠道/首次触达时间/最后跟进时间/跟进状态”。

二手车常见关键关系（你可以直接照抄）：

- `listing -> vehicle`（一辆车可能多次上架/多渠道上架）
- `lead -> listing`、`lead -> customer`（线索与客户绑定）
- `conversation -> lead`（每次沟通属于哪个线索）
- `inspection_report -> vehicle`（检测报告属于哪辆车）
- `media_asset -> vehicle`、`media_asset -> listing`（素材与车辆/上架关联）
- `price_event -> listing`（价格变更属于哪个上架）
- `transaction -> vehicle`、`transaction -> customer`（成交闭环）

### 9.3 动作（Actions）怎么做：把“写操作”全部收口（否则 agent 迟早出事故）

建议你把系统的所有写操作，按“动作目录（Action Catalog）”收口。下面是一个二手车 MVP 级别的动作目录示例：

**库存与车况**

- `request_inspection(vehicle_id, vendor, reason)`（发起检测/复检）
- `update_vehicle_status(vehicle_id, status, reason)`（到店/整备中/可售/已售/退车）

**上架与内容**

- `generate_listing_copy(listing_id, tone, constraints)`（生成文案；不直接发布）
- `publish_listing(listing_id, channel, options)` / `unpublish_listing(...)`
- `update_listing_media(listing_id, media_asset_ids)`（选图、首图策略）

**定价与策略**

- `propose_price_change(listing_id, new_price, rationale)`（生成“改价提案”）
- `apply_price_change(listing_id, new_price, approved_by, reason)`（执行改价；默认人审）

**线索与跟进**

- `assign_lead(lead_id, user_id)`
- `schedule_test_drive(lead_id, time, location)`
- `send_customer_message(lead_id, template_id, variables)`（默认人审后发送）
- `log_follow_up(lead_id, note, next_step)`（把跟进变成结构化沉淀）

每个 Action 都必须具备 5 件事（强烈建议写入 PRD 作为“系统质量门禁”）：

1. 参数 schema（结构化）
2. 权限（谁能做）
3. 审计日志（谁在何时用什么理由做了什么）
4. 幂等/回滚策略（至少可追溯与可补救）
5. 副作用（通知/webhook/对账）明确化

### 9.4 查询与推荐流水线：PG + 向量 +（可选 KB/图）+ 证据化输出

你可以把“给建议”的能力做成一条稳定流水线（避免 agent 直接凭感觉瞎编）：

```text
Step-1: PG 硬过滤（事实约束/租户隔离/权限/状态机）
Step-2: 向量召回（文本/图片/文档/对话：相似车源、相似话术、相似客户）
Step-3:（可选）规则/KB 重排（合规、风控、解释口径）
Step-4:（可选）图推理增强（多跳关系、网络风险、路径解释）
Step-5: 输出建议 + evidence pointers（指向对象字段/事件/边）
Step-6: 输出 Action proposals（默认人审）
```

强制工程约束（非常值得抄 Palantir）：

- `evidence_pointers`：每条建议都必须能指到“对象字段/事件/关系路径”
- `degraded_reason`：任何降级都必须可解释（例如 `vector_unavailable`、`graph_projection_stale`）
- `audit_log`：每个 action、每次“自动建议”都要留痕（方便复盘与迭代）

### 9.5 图数据库/知识图谱要不要上？一个不玄学的决策框架

结论先说：

- **如果你只是做“车辆-上架-线索”的一跳 join + 推荐排序**，PG + 向量通常够用。
- **如果你要做“风控网络/关系推理/多跳解释/跨门店跨渠道的实体解析”**，图会带来质变。

#### 9.5.1 什么时候图会带来“质变收益”（值得上）

满足任意一条，图就值得进入你的候选清单：

1. **反欺诈/风控是核心竞争力**  
   例如：同 VIN 在不同门店/渠道反复出现；同一客户/号码关联多个异常交易；疑似车源套利网络。

2. **你经常需要多跳查询并把“路径”作为解释的一部分**  
   例如：`Lead -> Customer -> Conversation -> 其他 Lead -> 其他 Listing -> 其他 Dealer`，并要输出“为什么判定为高风险/高价值”。

3. **你需要“关系可解释”而不仅是“相似召回”**  
   向量告诉你“像”，图告诉你“怎么连起来、哪条边导致相关”。

4. **你要把关系探索产品化给业务人员用**  
   类似 Palantir Vertex：不是为了工程师，而是为了业务在对象网络中探索。

#### 9.5.2 什么时候图“收益不够”（先别上）

如果 80% 的需求都能被：

- PG 结构化过滤 + 聚合报表
- 一跳/两跳 join
- 向量语义检索（文案/聊天/检测报告）

解决，那图数据库很容易变成“额外运维与一致性负担”，对 MVP 不划算。

#### 9.5.3 低风险路线：先做图投影，再决定要不要图主存

建议路线（可随时回滚）：

1. **阶段 A（默认）**：PG 做事实主存；关系用外键/边表；向量做语义
2. **阶段 B（图投影）**：把关键实体与关键边投影到图引擎（Graphiti/Neo4j/其他），只用于查询增强与解释
3. **阶段 C（质变验证）**：用真实指标验证图的收益（坏账率、成交转化率、人效、合规事故率），再决定是否加深图能力

### 9.6 二手车行业场景例子（把 Ontology 方法论翻译成“一个真实可用功能”）

下面用一个车商的高频场景，按“对象/关系/动作/证据/权限”的方式走一遍。

#### 场景：一辆车 7 天没出线索，老板问“是不是价格不对？怎么改才更快卖？”

**用户一句话需求**：  
“这辆车 7 天没线索，建议怎么处理？要不要降价？降多少？改完要怎么发车/怎么跟进？”

##### 1) 系统先定位相关对象（nouns）

- `Vehicle#V123`：车辆（车况、里程、整备、成本底线）
- `Listing#L888`：上架（当前价、渠道状态、曝光/点击、文案、图片）
- `PriceEvent#...`：价格历史
- `MediaAsset#...`：素材质量（是否合规、是否清晰、首图策略）
- `InspectionReport#...`：检测结论（可用于解释“值不值这个价”）
- `Lead`：最近 7 天为 0（也要能表达为事实）

##### 2) 系统拉出关键关系（links）

- `Listing#L888 -> Vehicle#V123`
- `Listing#L888 -> PriceEvent#...`
- `Listing#L888 -> MediaAsset#...`
- `InspectionReport#... -> Vehicle#V123`

##### 3) agent 的建议必须走“证据化流水线”（PG + 向量 + 可选规则/图）

1. **PG 硬查询**：上架天数、曝光/点击漏斗、当前价、最低毛利线、渠道在架状态。
2. **向量召回**：同城/同车系/同价位的高转化车源文案与首图特征；相似客户的成交话术。
3. **规则/约束**（可选）：毛利不得低于阈值；证照不全不得发车；某渠道改价频率限制。
4. **输出建议 + evidence pointers**：
   - “当前价高于同城对标均值 3.5%”（证据：对标车 object set 统计）
   - “曝光高但点击低，首图吸引力不足”（证据：渠道漏斗字段 + 图片质量评估）
   - “检测报告里有可用于提升信任的要点但没体现在文案里”（证据：inspection_report 结构化结论）

##### 4) 写操作必须收口到 Actions（默认人审）

agent 不直接改价/发车，而是给出可审计的 action proposals：

- `propose_price_change(L888, 109800, rationale="同城对标+曝光点击漏斗")`
- `generate_listing_copy(L888, tone="稳重可信", constraints=["不夸大车况","引用检测结论"])`
- （人审后）`apply_price_change(L888, 109800, approved_by="老板", reason="提升转化")`
- （合规校验通过后）`publish_listing(L888, channel="懂车帝")`

系统自动沉淀：

- action log（谁在何时用什么理由做了什么）
- 价格变化与线索变化的对比（便于复盘：这次改价到底有没有用）
- 降级原因（如果向量/图不可用，必须提示 “本次建议基于结构化数据，未使用语义召回”）

---

## 10) 典型踩坑（我们要提前规避）

### 10.1 Ontology 最容易“做大做虚”

常见失败模式：

- 试图一次性建全域模型 → 进度爆炸
- 模型太学术，不服务工作流 → 没人用

规避方法：

- 从 6~10 个对象类型起步
- 先把“对象页 + 3 个高频动作”跑通
- 每次新增对象/动作都要绑定一个真实 workflow（否则不要加）

### 10.2 Agent 写操作风险：必须动作收口 + 默认人审

二手车场景里，高风险动作包括：

- 改价、发车/下架、线索分配、合同/金融相关提交

默认策略建议：

- **建议可以自动生成，但执行必须人审（至少 MVP）**
- 有了足够审计与回滚机制后再逐步放权

### 10.3 “对象身份（ID）一致性”是地基

无论是 OpenClaw 还是二手车：

- 你必须解决对象的“唯一身份”与“合并策略”（同一车辆不同渠道 ID、同一客户多手机号）。
- 这是 Ontology 的地基工程，优先级高于 UI 花活。

---

## 11) 参考资料（优先官方/一手资料）

Palantir 官方文档（Ontology / Foundry / AIP）：

- Ontology overview（digital twin、semantic/kinetic）：https://www.palantir.com/docs/foundry/ontology/overview/
- Why create an Ontology?（source of truth、write-back、控制复杂度）：https://www.palantir.com/docs/foundry/ontology/why-ontology/
- Ontology core concepts：https://www.palantir.com/docs/foundry/ontology/core-concepts/
- Ontology augmented generation（OAG，semantic search workflows）：https://www.palantir.com/docs/foundry/ontology/ontology-augmented-generation/
- Ontology Manager（Ontology 变更管理与用量视角入口）：https://palantir.com/docs/foundry/ontology-manager/overview/
- Object Views（对象页配置体系入口）：https://palantir.com/docs/foundry/object-views/overview/
- Developer toolchain（OSDK/MCP/Dev Console/Workspaces 入口）：https://www.palantir.com/docs/foundry/dev-toolchain/overview/
- AIP overview：https://www.palantir.com/docs/foundry/aip/overview/
- AIP features（Assist/Logic/Agent Studio/Evals/Threads/MCP）：https://palantir.com/docs/foundry/aip/aip-features/
- Foundry platform summary for LLMs（术语表 + 平台能力概览）：https://www.palantir.com/docs/foundry/getting-started/foundry-platform-summary-llm

Palantir 平台/营销页（更偏“产品叙事”但有 nouns/verbs 说法）：

- Palantir Ontology（统一数据/逻辑/动作/安全的叙事）：https://www.palantir.com/platforms/ontology

Palantir 开源 SDK（能直接看到分层设计）：

- Foundry Platform SDK (Python, Apache-2.0)：https://github.com/palantir/foundry-platform-python
- Gotham Platform SDK (Python, Apache-2.0)：https://github.com/palantir/gotham-platform-python
- Foundry Platform SDK (TypeScript, Apache-2.0 packages)：https://github.com/palantir/foundry-platform-typescript
- TypeScript Ontology SDK (OSDK, Apache-2.0 packages)：https://github.com/palantir/osdk-ts
- Palantir GitHub org：https://github.com/palantir/

我们自己的现有约束（对齐用，避免与既有决策冲突）：

- OpenClaw 记忆升级落地方案（Mem0 + Graphiti，自部署版）：`chelingxi_workspace/clawdbot/analysis/2026-02-22-openclaw-mem0-graphiti-selfhost-plan/README.md`
- 二手车最小域模型（历史 ADR，可能过时，仅作参考）：`chelingxi_workspace/chelingxi-agent-saas/docs/architecture/ADR-003-used-car-domain-and-rag-model.md`
