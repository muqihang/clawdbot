# `Palantir Ontology` 调研文档审查报告与修订清单

> 审查对象：`analysis/2026-03-05-palantir-ontology-deep-research.md`
>
> 审查日期：`2026-03-06`
>
> 审查范围：
>
> 1. 第一轮：原文主体（前 12 部分与附录索引）
> 2. 第二轮：新增的第十三部分“持续迭代打磨机制”

---

## 0. 总体结论

- 这份文档 **不是“严重幻觉文”**，大量核心概念、官方术语、案例数字都能从一手资料或高可信资料中核到。
- 但它 **还不能直接作为产品设计的事实底稿**。主要问题不是“胡编乱造”，而是把 **官方事实**、**社区解读**、**作者归纳**、**产品建议** 混写在一起，且不少句子写得过满。
- 建议将本文档降级为：**研究草稿 / 设计启发材料**，在完成本报告里的修订后，再作为内部参考文档流转。

### 当前可用性评级

- **评级：`B-`**
- **可用于**：启发产品方向、帮助理解 `Ontology` / `OAG` / `AIP` 的大体结构
- **不建议直接用于**：定义系统边界、直接产出产品路线图、作为架构评审底稿

### 最需要先修的共性问题

- 把作者归纳写成官方结论
- 把工程推断写成产品事实
- 绝对化措辞过多，例如“所有”“完全相同”“最强”
- 参考索引存在 `...` 截断链接，不可复核

---

## 1. 第一轮审查结论（原始主体）

### 1.1 第一轮总体判断

- 文档对 `Palantir Ontology` 的核心原语理解 **整体方向正确**。
- `Objects / Properties / Links / Actions / Shared Properties / Interfaces / OAG` 这些基础层内容，多数都能在官方文档中找到对应。
- 真正的问题集中在：
  - `Action` / `Function` 边界写得过满
  - `AIP` 路线图被写成官方标准分层
  - 行业对比表过度绝对化
  - `Microsoft Fabric IQ` 部分混入了未证实的术语
  - 参考链接不可复核

### 1.2 第一轮确认基本靠谱的内容

- `analysis/2026-03-05-palantir-ontology-deep-research.md:31`
  - 把 `Ontology` 解释为组织的数字孪生、语义化对象世界，这和官方 `Core concepts` 基本一致。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:156`
  - `Interfaces` 与 `Shared Properties` 不是幻觉，官方有明确支持。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:195`
  - `Action Type` 官方定义、`writeback dataset`、跨应用复用同一动作逻辑，这些都能核到。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:163`
  - 属性类型表大体可靠，尤其是 `Vector`、`Array`、`Struct`、`Media Reference`、`Time Series`、`Attachment`、`Geopoint`、`Geoshape`、`Marking`、`Cipher`。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:339`
  - OAG 相比 RAG 的增强方向、结构化对象检索、确定性逻辑调用、受控动作闭环，整体方向基本成立。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:466`
  - `General Mills` 与 `QMOS` 的部分案例数字可由官方 PDF 支撑。

### 1.3 第一轮必须修正的问题摘要

- `analysis/2026-03-05-palantir-ontology-deep-research.md:232`
  - “所有对 Ontology 的写操作都通过 Actions 完成”过于绝对。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:233`
  - “同一个 Action 在各界面行为完全相同”过度表述。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:238`
  - `Functions` 只写成 `TypeScript` 已不准确，官方还支持 `Python`。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:365`
  - “用户能看到 LLM 每一步推理”证据不足。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:410`
  - 把 `AIP` 简化成“叠加在 Ontology 上的 AI 层”过窄。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:414`
  - “五级自动化阶梯”不能写成官方分层。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:598`
  - KG / Semantic Layer / Ontology 的对比表写得太绝对。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:619`
  - `Microsoft Fabric IQ` 的 `Semantic Contracts` 不是我能在微软官方材料里确认的正式术语。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1158`
  - 多条链接被 `...` 截断，不可复核。

### 1.4 第一轮逐段修订清单

#### 1) `analysis/2026-03-05-palantir-ontology-deep-research.md:176`

- **原句**
  - 属性支持“必填”、“仅编辑可见”、“条件格式”等 UI 元数据
- **问题**
  - `required`、`edit-only` 有官方概念；`conditional formatting` 更接近展示层能力，不宜和属性定义本身并列。
- **建议改写**
  - 属性可携带部分元数据与约束，例如 `required`、`edit-only`、共享属性元数据等；展示层还可以基于属性配置格式化与界面表现，但这属于应用层能力，不宜与属性定义本身混写。

#### 2) `analysis/2026-03-05-palantir-ontology-deep-research.md:191`

- **原句**
  - Ontology 使用自己的索引和存储引擎（Object Storage V2）……这意味着你不需要图数据库……`PG + 边表 + 好的索引就够了`
- **问题**
  - 前半句是可接受概括；后半句是工程推断，不是官方结论。
- **建议改写**
  - 从公开资料看，Ontology 的关系能力并不要求依赖传统图数据库产品形态，而是由对象后端、索引与查询架构共同支撑。若做自研，可参考“关系表/边表 + 索引 + 对象抽象层”的思路，但这属于本文的工程推断，不是 Palantir 官方结论。

#### 3) `analysis/2026-03-05-palantir-ontology-deep-research.md:232`

- **原句**
  - 所有对 Ontology 的写操作都通过 Actions 完成
- **问题**
  - 过于绝对。官方 `Functions` 也支持 `Ontology edits`。
- **建议改写**
  - 面向终端用户的受控写入通常通过 `Action Types` 暴露；同时，`Functions` 也具备定义 `Ontology edits` 的能力，并可作为动作逻辑或其他流程的一部分参与对象状态变更。

#### 4) `analysis/2026-03-05-palantir-ontology-deep-research.md:233`

- **原句**
  - 同一个 Action 在 Object Views、Workshop、Agent、OSDK 中行为完全相同
- **问题**
  - “完全相同”太满。
- **建议改写**
  - 同一 `Action Type` 的核心逻辑、校验与写回语义可以在多类面向用户的应用中复用，从而降低跨应用实现不一致的风险；但具体交互形态与体验仍会因应用载体而不同。

#### 5) `analysis/2026-03-05-palantir-ontology-deep-research.md:238`

- **原句**
  - Functions …… 用 TypeScript 编写
- **问题**
  - 已过时，官方当前支持 `TypeScript` 和 `Python`。
- **建议改写**
  - `Functions` 是运行在 Foundry 内部、与 Ontology 深度集成的服务端逻辑单元，当前官方支持 `TypeScript` 和 `Python`。

#### 6) `analysis/2026-03-05-palantir-ontology-deep-research.md:365`

- **原句**
  - Chain of Thought 可视化：用户能看到 LLM 的每一步推理，包括调用了哪些函数
- **问题**
  - “完整可见 CoT”证据不够硬。
- **建议改写**
  - 在 AIP Logic 与部分 agent 工作流中，用户可以查看调试信息、工具调用轨迹、输入输出与评估结果；但不宜泛化为“平台默认公开 LLM 的完整内部推理过程”。

#### 7) `analysis/2026-03-05-palantir-ontology-deep-research.md:410`

- **原句**
  - AIP 不是独立产品，而是叠加在 Ontology 之上的 AI 层
- **问题**
  - 过窄，会误导产品边界理解。
- **建议改写**
  - 更准确地说，AIP 是 Palantir 平台中连接 AI、组织数据与业务运营的一组能力集合。它强依赖 Ontology 提供业务上下文与受控操作接口，但并不只是一层“盖在 Ontology 上”的简单封装。

#### 8) `analysis/2026-03-05-palantir-ontology-deep-research.md:412`

- **原句**
  - “AIP doesn't replace Foundry. It sits on top of it. ...”
- **问题**
  - 我没有在官方文档中稳定核到这句原话。
- **建议改写**
  - 删除直接引语，改为作者转述：
  - “从官方材料看，AIP 不是替代 Foundry，而是在其数据、治理、Ontology 与开发工具链基础上增加 AI 工作流、Agent 与评估能力。”

#### 9) `analysis/2026-03-05-palantir-ontology-deep-research.md:414` 到 `analysis/2026-03-05-palantir-ontology-deep-research.md:424`

- **原句**
  - 五级自动化阶梯（Tier 1 到 Tier 5）
- **问题**
  - 没有核到这是官方正式框架。
- **建议改写**
  - 把小节标题改为：
  - `### 6.2 一个可借鉴的 AIP 产品成熟度框架（作者归纳）`
  - 在表格前明确写：
  - “下面的五级框架是本文基于官方产品形态做的归纳，不代表 Palantir 官方标准分级。”

#### 10) `analysis/2026-03-05-palantir-ontology-deep-research.md:598` 到 `analysis/2026-03-05-palantir-ontology-deep-research.md:601`

- **原句**
  - KG 通常只读、无操作能力；Semantic Layer 只读；Ontology AI 适配性“最强”
- **问题**
  - 这不是稳定事实，而是作者对比判断。
- **建议改写**
  - 将该表整体改标为“本文比较框架”，删除“最强”“否”这类绝对化结论，改成“更偏重什么能力”。

#### 11) `analysis/2026-03-05-palantir-ontology-deep-research.md:617` 到 `analysis/2026-03-05-palantir-ontology-deep-research.md:621`

- **原句**
  - Microsoft Fabric IQ 的“语义合约”方法
- **问题**
  - `Semantic Contracts` 不是我能在微软官方材料里确认的正式术语。
- **建议改写**
  - 将标题改为：
  - `### 9.3 Microsoft Fabric IQ 的语义层路线（行业观察）`
  - 正文改写为对微软官方 `Fabric IQ` / `Foundry IQ` 资料的中性概述。

#### 12) `analysis/2026-03-05-palantir-ontology-deep-research.md:1158` 到 `analysis/2026-03-05-palantir-ontology-deep-research.md:1160`

- **原句**
  - 三条案例 PDF 链接都被 `...` 截断
- **问题**
  - 严重影响可复核性。
- **建议改写**
  - 用完整 URL 替换。
  - `General Mills`：
    - `https://www.palantir.com/assets/xrfr7uokpv1b/1aLBn65y83vdytjpXJKZcO/16989b788b34cb677f6d763d56a72349/Building_an_Intelligent_AI-Driven_Supply_Chain_at_General_Mills_-_AIPCon_March_-24_Impact_Study.pdf`
  - `QMOS`：
    - `https://www.palantir.com/assets/xrfr7uokpv1b/6ITiZpsrLgJZrdyceZeUO6/c15cd7b89a872f17c147fa70e953971c/Whitepaper_-_End_to_End_Quality_Management_with_Palantir_QMOS.pdf`
  - `CPM`：建议重新核源后补完整链接，不建议保留省略版。

---

## 2. 第二轮审查结论（仅第十三部分）

> 本轮只审查：`analysis/2026-03-05-palantir-ontology-deep-research.md:1127` 到 `analysis/2026-03-05-palantir-ontology-deep-research.md:1415`
>
> 不包含后续新增的 `附录A：Microsoft Fabric IQ 交叉借鉴` 详细审查。

### 2.1 第二轮总体判断

- 第十三部分整体上 **不是“幻觉堆砌”**，它更像一份 **产品/平台演进方法论章节**。
- 这部分最大的质量问题，不是“有没有引用对”，而是：
  - 把 **Palantir 历史经验** 和 **作者自己的 SaaS 方法论** 混写成了同一种语气
  - 夹杂了若干 **未经证实的历史时间线** 和 **未经证实的主观判断**
  - 结构上也有一个明显问题：开头说是四项壁垒，正文实际展开成了“连接器、性能、治理、模板”四个引擎，**没有对应“部署运维”这一项**

### 2.2 第二轮可确认属实或基本成立的部分

- `analysis/2026-03-05-palantir-ontology-deep-research.md:1136`
  - `Palantir` 成立于 `2003` 年，并且最初确实为美国情报社区构建软件，用于反恐调查与行动支持；这点可由官方 `10-K` 确认。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1233`
  - `Palantir` / `Foundry` 的确长期宣传自己有 `200+ out-of-the-box connectors`，这一点有官方官网与官方博客支持。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1283`
  - `Ontology volume`、`Ontology indexing compute`、`Ontology query compute` 这些能力或计量入口在官方文档中都存在。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1377`
  - `Palantir` 的确公开写过内部使用 `Foundry` 管理自身运营，把它作为内部 operating system 使用；这点有官方博客支持。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1415`
  - `Fabric IQ` 于 `Ignite 2025` 官宣、以 preview 形态起步，这个时间判断基本成立。

### 2.3 第二轮必须修正的问题摘要

- `analysis/2026-03-05-palantir-ontology-deep-research.md:1129`
  - “4 项工程壁垒”列的是 `连接器生态、引擎优化、治理体系、部署运维`，但后文实际展开成了 `连接器、性能、治理、模板`，结构前后不一致。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1136` 到 `analysis/2026-03-05-palantir-ontology-deep-research.md:1141`
  - Palantir 的成长时间线写得太细，但没有一手来源支撑；尤其 `2020-2023 AIP 叠加` 明显偏早，官方正式 AIP 公开发布节点在 `2023`。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1138`
  - “第一批客户：空客、默克”这种点名式说法证据不足，而且时间点也不够严谨；官方材料更多能支持“后来进入商业市场”，不适合这样写死。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1233`
  - “这条规则……就是 Palantir 200+ connectors 积累的核心纪律”没有证据，是作者推断。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1344`
  - “这是 Palantir 最想做但在商业上受限的事情”是强主观判断，缺证。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1377`
  - “Dogfooding 不是可选项，而是最低保障”是价值判断，不应写成事实。
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1415`
  - “Palantir 用了 20 年走完”“飞轮逻辑完全一致”都属于作者概括，不宜冒充事实判断。

### 2.4 第二轮逐段修订清单

#### 13-A) `analysis/2026-03-05-palantir-ontology-deep-research.md:1129`

- **原句**
  - Palantir 的 4 项工程壁垒（连接器生态、引擎优化、治理体系、部署运维）……
- **问题**
  - 后文四个引擎并未展开“部署运维”，而是换成了“Ontology 模板沉淀”。结构不一致。
- **建议改写二选一**
  - **方案 A**：保留“部署运维”，新增一节对应引擎
  - **方案 B**：把开头四项改成与正文一致：`连接器积累、性能优化、治理增长、模板沉淀`
- **推荐方案**
  - 选 **方案 B**，因为当前正文已经围绕这四个引擎展开。

#### 13-B) `analysis/2026-03-05-palantir-ontology-deep-research.md:1136` 到 `analysis/2026-03-05-palantir-ontology-deep-research.md:1141`

- **原句**
  - 2003-2008 CIA 反恐情报分析；2008-2013 军事/执法；2013-2016 商业版；2020-2023 AIP 叠加；2023-2026 决策操作系统
- **问题**
  - 时间线分段过细，但缺少官方一手来源；`AIP` 写到 `2020-2023` 明显偏早。
- **建议改写**
  - `Palantir` 的公开发展轨迹可更谨慎地概括为：
  - `2003 年成立后，先服务于美国情报与国防场景；随后逐步进入更广泛的政府与商业领域；Foundry 在商业客户中的应用不断扩展，而 AIP 则于 2023 年正式公开推出并与 Ontology 深度结合。`
- **说明**
  - 如果无法给每个时间段补官方出处，就不要写成这么细的编年史。

#### 13-C) `analysis/2026-03-05-palantir-ontology-deep-research.md:1138`

- **原句**
  - 第一批客户：空客、默克
- **问题**
  - 证据不足，且“第一批客户”这种说法容易被质疑。
- **建议改写**
  - `商业客户后来逐步扩展到制造、航空、医药等行业，例如 Airbus、Merck 等案例体现了 Foundry 在复杂商业场景中的应用。`

#### 13-D) `analysis/2026-03-05-palantir-ontology-deep-research.md:1233`

- **原句**
  - 这条规则看似简单，但就是 Palantir 200+ connectors 积累的核心纪律。
- **问题**
  - `200+ connectors` 可核实；“核心纪律”不可核实。
- **建议改写**
  - `Palantir 官方长期强调其拥有 200+ 现成连接器；对自研产品而言，把连接逻辑收口到统一接口，是一种可借鉴的工程纪律，但这属于本文的方法论归纳。`

#### 13-E) `analysis/2026-03-05-palantir-ontology-deep-research.md:1283`

- **原句**
  - Ontology 文档里明确有 `Ontology volume`、`Ontology indexing compute`、`Ontology query compute` 三个成本维度的管理界面。
- **问题**
  - “三个成本维度存在”是对的；“管理界面”这个词最好更谨慎。
- **建议改写**
  - `Palantir 官方文档中明确存在对 Ontology volume、Ontology indexing compute、Ontology query compute 的度量与使用说明。即使自研系统 Day 1 没有完整管理界面，也应从 Day 1 开始采集这些核心指标。`

#### 13-F) `analysis/2026-03-05-palantir-ontology-deep-research.md:1344`

- **原句**
  - 这是最强的飞轮——也是 Palantir 最想做但在商业上受限的事情。
- **问题**
  - 后半句没有证据，是主观推断。
- **建议改写**
  - `对 SaaS 而言，行业模板沉淀可能是最强的复利飞轮之一。与定制化项目相比，SaaS 更容易把脱敏后的共性建模经验回流成模板资产。`

#### 13-G) `analysis/2026-03-05-palantir-ontology-deep-research.md:1377`

- **原句**
  - Palantir 内部也用自己的 Foundry 来管理运营——Dogfooding 不是可选项，而是产品质量的最低保障。
- **问题**
  - 前半句可证，后半句是价值判断。
- **建议改写**
  - `Palantir 公开写过内部使用 Foundry 管理自身运营。对自研产品而言，dogfooding 是一种高价值的质量保障机制，但这属于本文的产品方法论主张。`

#### 13-H) `analysis/2026-03-05-palantir-ontology-deep-research.md:1415`

- **原句**
  - Palantir 用了 20 年走完……Fabric IQ 正在用现有生态加速追赶……飞轮逻辑完全一致。
- **问题**
  - “20 年”只是粗略说法；“完全一致”属于作者判断。
- **建议改写**
  - `Palantir 的平台演进经历了二十余年的持续建设；Fabric IQ 则是在 2025 年 Ignite 官宣后，以 preview 形态起步。两者都体现了“从具体业务问题中持续沉淀平台能力”的思路，但实现路径和生态条件并不相同。`

### 2.5 第二轮额外建议

- 第十三部分更适合整体改标为：
  - `方法论章节`
  - `作者归纳`
  - `面向自研 SaaS 的工程演进建议`
- 不建议继续用“Palantir 自身验证了这条路”这种强背书语气，除非每个关键句后面都补官方出处。
- 第十三部分里的代码接口、阶段路线图、治理分层、中间件栈，本质上都更像 **设计建议**，这没问题，但需要明确标注它们不是 Palantir 官方设计复述。

---

## 3. 建议修订优先级

### P0：必须先修

- `analysis/2026-03-05-palantir-ontology-deep-research.md:232`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:238`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:410`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:414`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:598`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:619`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1129`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1136`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1233`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1344`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1415`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1158`

### P1：建议优化

- `analysis/2026-03-05-palantir-ontology-deep-research.md:176`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:191`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:233`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:365`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1283`
- `analysis/2026-03-05-palantir-ontology-deep-research.md:1377`

---

## 4. 建议交给修订代理的执行原则

- 每一段都显式标注其性质：`官方事实` / `官方案例` / `作者归纳` / `产品建议`
- 所有“官方原话”必须可追溯到一手链接；找不到原话就改成转述
- 所有带“所有”“完全”“最强”“一定”“唯一”这类绝对化措辞的句子，逐条降级
- 所有时间线如果没有一手来源，统一改成宽口径描述
- 所有附录 URL 必须替换成完整可点击链接

---

## 5. 主要核验来源

### Palantir 官方文档

- [Core concepts](https://palantir.com/docs/foundry/ontology/core-concepts/)
- [Properties overview](https://palantir.com/docs/foundry/object-link-types/properties-overview/)
- [Link types overview](https://palantir.com/docs/foundry/object-link-types/link-types-overview/)
- [Action types overview](https://palantir.com/docs/foundry/action-types/overview/)
- [Functions overview](https://palantir.com/docs/foundry/functions/overview/)
- [Object backend architecture](https://palantir.com/docs/foundry/object-backend/overview/)
- [Ontology augmented generation](https://palantir.com/docs/foundry/ontology/ontology-augmented-generation/)
- [AIP overview](https://palantir.com/docs/foundry/aip/overview/)
- [AIP Agent Studio overview](https://palantir.com/docs/foundry/agent-studio/overview/)
- [AIP Threads overview](https://www.palantir.com/docs/foundry/threads/overview/)
- [AIP Evals overview](https://palantir.com/docs/foundry/aip-evals/overview/)
- [AIP Assist overview](https://palantir.com/docs/foundry/assist/overview/)
- [Automate overview](https://palantir.com/docs/foundry/automate/overview/)
- [Ontology SDK overview](https://palantir.com/docs/foundry/ontology-sdk/overview/)
- [Ontology volume usage](https://palantir.com/docs/foundry/ontologies/volume-usage/)
- [Ontology query compute](https://palantir.com/docs/foundry/ontologies/query-compute-usage/)
- [Indexing overview](https://palantir.com/docs/foundry/object-indexing/overview/)

### Palantir 官方博客 / 官方案例 / 投资者资料

- [How Palantir Foundry Fuels Your Data Platform](https://blog.palantir.com/how-palantir-foundry-fuels-your-data-platform-c65c15c30e70)
- [Understanding ROI with Palantir Foundry](https://blog.palantir.com/understanding-roi-with-palantir-foundry-51cc53d77511)
- [2025 FY 10-K](https://investors.palantir.com/files/2025%20FY%20PLTR%2010-K.pdf)
- [2021 Annual Report / 10-K](https://investors.palantir.com/files/2021%20Annual%20Report%20on%20Form%2010-K.pdf)
- [General Mills impact study PDF](https://www.palantir.com/assets/xrfr7uokpv1b/1aLBn65y83vdytjpXJKZcO/16989b788b34cb677f6d763d56a72349/Building_an_Intelligent_AI-Driven_Supply_Chain_at_General_Mills_-_AIPCon_March_-24_Impact_Study.pdf)
- [QMOS whitepaper PDF](https://www.palantir.com/assets/xrfr7uokpv1b/6ITiZpsrLgJZrdyceZeUO6/c15cd7b89a872f17c147fa70e953971c/Whitepaper_-_End_to_End_Quality_Management_with_Palantir_QMOS.pdf)

### Microsoft 官方资料

- [What is Foundry IQ?](https://learn.microsoft.com/en-us/azure/foundry/agents/concepts/what-is-foundry-iq)
- [Introducing Microsoft Fabric IQ](https://blog.fabric.microsoft.com/en-US/blog/from-data-platform-to-intelligence-platform-introducing-microsoft-fabric-iq/)
- [Fabric IQ: The Semantic Foundation for Enterprise AI](https://blog.fabric.microsoft.com/en-US/blog/introducing-fabric-iq-the-semantic-foundation-for-enterprise-ai/)

---

## 6. 给修订代理的一句话指令

- **请不要把这篇文档当“事实复述”来润色，而要按“研究草稿提纯成可信内部参考文档”的思路修订：先修事实边界，再修语气，再补完整引用。**
