# 战略文档修订摘要

> **修订日期**: 2026-03-02  
> **修订原因**: 明确自主开发战略，将 Zep Cloud 从"采购选项"改为"参考标杆"  
> **修订范围**: 4 份核心文档 + 1 份新增文档

---

## 修订概览

### 核心战略调整

**修订前**：

- 推荐在 P1 阶段引入 Zep Cloud 作为托管选项
- 通过 A/B 测试对比 Zep Cloud vs 自建方案
- 混合架构：核心用户用 Zep Cloud，长尾用户用自建

**修订后**：

- **自主开发优先**：所有功能必须可自建实现
- **Zep Cloud 作为参考标杆**：学习其设计理念与 API 语义
- **开源优先**：优先使用 Apache-2.0 的 Graphiti 开源能力
- **渐进式升级**：P0（平台能力）→ P1（体验优化）→ P2（竞争壁垒）

---

## 修订文档清单

### 1. 新增文档

#### `09-self-hosted-zep-features-roadmap.md`（新增）

**内容**：

- Zep Cloud 能力清单与自建可行性分析
- 自建实现路线图（P0/P1/P2）
- 社区生态高级玩法（CrewAI、LangGraph、LiveKit、Autogen、Graphiti MCP）
- 30 天快速落地计划（Week 1-4）
- 成本与资源评估

**核心亮点**：

- 明确区分"可自建实现"与"托管服务特有"的能力
- 提供详细的技术实现方案（API 设计、数据模型）
- 给出具体的工期与验收指标

---

### 2. 修订文档

#### `00-executive-summary.md`（执行摘要）

**修订内容**：

- **第 3 条结论**：从"托管方案（Zep Cloud）的核心价值被低估"改为"Zep Cloud 的核心能力可自建实现"
- **删除**："建议在 P1 阶段引入 Zep Cloud 作为 Graphiti 的托管选项"
- **新增**："战略: 自主开发，Zep Cloud 作为参考标杆"

**修订前**：

```
### 3. **托管方案（Zep Cloud）的核心价值被低估**
Zep Cloud 提供的不仅是"托管 Graphiti"，更重要的是：
- **开箱即用的记忆治理 API**（编辑、删除、版本控制）
- **企业级可观测性**（记忆质量监控、异常检测）
- **多租户隔离与权限管理**（个人/团队/渠道级）
- **成本可控的弹性扩展**（避免自建运维负担）

**建议**: 在 P1 阶段引入 Zep Cloud 作为 Graphiti 的托管选项，与自建方案并行，通过 A/B 测试验证 ROI。
```

**修订后**：

```
### 3. **Zep Cloud 的核心能力可自建实现**
Zep Cloud 提供的高级能力，我们可以在自建方案中逐步实现：
- **记忆治理 API**（编辑、删除、版本控制）→ 基于 Graphiti CRUD 操作自建
- **可观测性**（记忆质量监控、异常检测）→ 自建监控仪表盘
- **多租户隔离与权限管理**（个人/团队/渠道级）→ 扩展 Graphiti 的 `group_id` 机制
- **高级检索策略**（Focal-node rerank、Search recipes）→ 直接使用开源 Graphiti 能力

**战略**: 自主开发，Zep Cloud 作为参考标杆。优先实现高价值、低复杂度的功能（P0），逐步补齐平台能力（P1/P2）。
```

---

#### `01-capability-landscape.md`（能力全景梳理）

**修订内容**：

- **第 3 章标题**：从"Zep Cloud：托管方案的额外价值"改为"Zep Cloud：自建实现的参考标杆"
- **3.1 节**：从"超越自建的核心优势"改为"Zep Cloud 的核心能力（作为自建目标）"
- **新增**：每项能力标注"自建方案"与"实现难度"
- **3.2 节**：对比表新增"自主可控"维度，强调自建方案的优势
- **3.3 节**：从"推荐策略（并行试点/混合架构）"改为"自建实现策略（短期/中期/长期）"

**修订前**：

```
### 3.1 超越自建的核心优势

#### 开箱即用的记忆治理
- **记忆编辑 API**：修改、删除、版本控制
- ****：追溯记忆的形成与变更历史
...

### 3.3 推荐策略

#### 短期（P0-P1）
- **并行试点**：Zep Cloud 与自建 Graphiti 同时运行
- **A/B 测试**：对比两者的性能、成本、用户体验
```

**修订后**：

```
### 3.1 Zep Cloud 的核心能力（作为自建目标）

#### 记忆治理能力（可自建实现）
- **记忆编辑 API**：修改、删除、版本控制
  - 自建方案：基于 Graphiti 的 entity/edge CRUD 操作
  - 实现难度：🟢 低（P0 优先级）
...

### 3.3 自建实现策略

#### 短期（P0）
- **核心平台能力**：用户/线程管理 + 上下文装配 + 记忆治理 API
- **参考 Zep API 语义**：复刻其 API 设计，但自主实现
- **利用开源 Graphiti**：直接使用 Apache-2.0 的高级检索能力
```

---

#### `03-priority-roadmap.md`（优先级路线图）

**修订内容**：

- **P1-1 节**：从"Zep Cloud 集成试点"改为"高级检索策略（Graphiti Advanced Search）"
- **删除**：A/B 测试、ROI 分析、混合架构等内容
- **新增**：详细的技术实现方案（TypeScript 接口定义）
- **新增**：实施策略、依赖条件、风险、验收指标

**修订前**：

```
### P1-1：Zep Cloud 集成试点

**预期收益**：
- 对比自建 Graphiti 的性能与成本
- 验证托管方案的记忆治理能力
- 为长期战略决策提供数据

**实施策略**：
- 选择 10% 用户作为 Zep Cloud 试点
- A/B 测试：Zep vs 自建 Graphiti
- 对比指标：延迟、成本、记忆质量、用户满意度

**工期**：10 天
```

**修订后**：

````
### P1-1：高级检索策略（Graphiti Advanced Search）

**预期收益**：
- 利用 Graphiti 开源的高级检索能力
- 时序关系桶 Top1 提升 >= 10pp
- 项目上下文桶 FUR 提升 >= 15pp

**技术实现要点**：
```typescript
interface AdvancedSearchStrategy {
  focalNodeRerank(...): Promise<SearchResult[]>
  searchRecipe(...): Promise<SearchResult[]>
  searchInGroup(...): Promise<SearchResult[]>
}
````

**实施策略**：

- 直接使用 Graphiti 开源能力（Apache-2.0）
- 在 `graphiti-client.ts` 中添加参数支持
- 灰度验证时序桶与项目上下文桶收益

**工期**：5 天

```

---

#### `06-execution-plan.md`（30/60/90 天执行计划）

**修订内容**：
- **Week 5（Day 31-37）**：从"Zep Cloud 集成试点"改为"高级检索策略实现"
- **删除**：申请 Zep Cloud 试用账号、A/B 测试、ROI 分析
- **新增**：Graphiti 高级检索接入、灰度验证与优化

**修订前**：
```

### Week 5（Day 31-37）：Zep Cloud 集成试点

#### Day 31-33：Zep Cloud 接入

- 申请 Zep Cloud 试用账号
- 实现 Zep Client（基于 Zep OpenAPI）
- 配置 A/B 测试（10% 用户走 Zep，90% 走自建 Graphiti）

#### Day 34-37：A/B 测试与数据收集

- 运行 A/B 测试（至少 7 天）
- 收集对比数据（延迟、成本、记忆质量、用户满意度）
- 分析 ROI

```

**修订后**：
```

### Week 5（Day 31-37）：高级检索策略实现

##3：Graphiti 高级检索接入

- 研究 Graphiti 开源的高级检索能力（Focal-node rerank、Search recipes）
- 在 `graphiti-client.ts` 中添加参数支持
- 实现 Group-based 检索（基于 `group_id` 的命名空间约束）

#### Day 34-37：灰度验证与优化

- 在时序桶与项目上下文桶灰度验证
- 收集性能数据（延迟、命中率、用户满意度）
- 优化检索策略参数

```

---

## 未修订文档（无需修改）

以下文档不涉及 Zep Cloud 推荐，保持原样：

- `02-gap-analysis.md`（关键缺口分析）
- `04-super-jarvis-design.md`（超级贾维斯能力设计）
- `05-reference-architecture.md`（参考架构草图）
- `07-metrics-and-evaluation.md`（关键指标与评估方法）
- `08-risk-mitigation.md`（风险清单与缓解策略）

---

## 核心变化总结

### 战略层面
1. **从"采购评估"到"自主开发"**：不再考虑 Zep Cloud 作为采购选项
2. **从"A/B 测试"到"参考学习"**：学习 Zep Cloud 的设计理念，但自主实现
3. **从"混合架构"到"全自建"**：所有能力都在自建方案中实现

### 技术层面
1. **明确自建路径**：每项 Zep Cloud 能力都有对应的自建方案
2. **利用开源优势**：优先使用 Graphiti 的 Apache-2.0 开源能力
3. **渐进式实施**：P0（核心平台）→ P1（增强体验）→ P2（竞争壁垒）

### 执行层面
1. **工期优化**：P1-1 从 10 天缩短到 5 天（不需要 A/B 测试）
2. **资源聚焦**：不需要申请 Zep Cloud 试用账号、配置 A/B 测试
3. **风险降低**：避免供应商锁定、成本超预算等风险

---

## 下一步行动

### 立即行动（本周内）
1. **阅读新增文档**：`09-self-hosted-zep-features-roadmap.md`
2. **确认战略方向**：与团队讨论自主开发战略
3. **启动 P0 设计**：开始设计用户/线程管理 + 记忆治理 API

### 短期行动（2 周内）
1. **完成 W4 Gate-4 评审**：确保三路融合检索达标
2. **启动 W5 规划**：基于修订后的战略制定 W5 详细任务包
3. **研究 Graphiti 高级能力**：深入学习 Focal-node rerank、Search recipes

### 中期行动（1 个月内）
1. **P0 能力上线**：用户/线程管理 + 上下文装配 + 记忆治理 API
2. **用户反馈收集**：通过 Beta 用户测试自建能力的体验
3. **性能优化**：基于实际使用数据优化检索策略

---

## 附录：关键参考资料

### 已有分析文档
- `analysis/2026-02-24-mem0-graphiti-value-maximization/zep-cloud-gap-copy-playbook.md`
  - Zep Cloud 与 Graphiti 的差异分析
  - 可抄实现的能力清单
  - 30 天"抄玩法 + 抄实现"执行顺序

### Graphiti 官方资源
- GitHub: https://github.com/getzep/graphiti
- 文档: https://help.getzep.com/graphiti
- 开源协议: Apache-2.0

### 社区生态参考
- CrewAI 外部记忆自动读写
- LangGraph 记忆模式（线程状态 + 外部长期记忆分层）
- LiveKit 房间隔离模式
- Autogen 图记忆注入（facts_limit/entity_limit 控制）
- Graphiti MCP Sidecar（旁路协处理）

---

**文档维护者**: OpenClaw 记忆系统架构团队
**最后更新**: 2026-03-02
**反馈渠道**: 请在 GitHub Issue 或内部 Slack 频道提出问题与建议

```
