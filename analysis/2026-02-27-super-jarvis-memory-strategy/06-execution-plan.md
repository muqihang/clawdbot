# 30/60/90 天执行计划

> **版本**: V1.0  
> **日期**: 2026-03-02  
> **执行原则**: 渐进式升级 + 可回滚 + 证据驱动

---

## 第一个 30 天：P0 能力落地（W5 阶段）

### Week 1（Day 1-7）：记忆治理 API + 可信度评分

#### Day 1-2：设计与验证

- **任务**：
  - 设计 Memory Management API schema
  - 验证 Mem0/Graphiti 的编辑/删除能力（OpenAPI 测试）
  - 设计可信度评分模型（定义评分因子与权重）
- **交付物**：
  - `memory-management-api-spec.md`
  - `mem0-graphiti-edit-capability-report.md`
  - `confidence-scoring-model-v1.md`
- **验收**：团队评审通过

#### Day 3-5：实现核心功能

- **任务**：
  - 实现 Memory Management API（list/get/update/delete）
  - 实现 Confidence Scorer（评分逻辑）
  - 集成到 P3 Outbox（支持删除操作的异步处理）
- **交付物**：
  - `extensions/memory-mem0-graphiti-bridge/src/governance/memory-api.ts`
  - `extensions/memory-mem0-graphiti-bridge/src/governance/confidence-scorer.ts`
  - 单元测试（覆盖率 >= 80%）
- **验收**：所有测试通过

#### Day 6-7：集成与测试

- **任务**：
  - 添加 CLI 命令（`openclaw memory list/get/edit/delete`）
  - 端到端测试（创建 → 编辑 → 删除 → 验证）
  - 证据落盘（测试结果 + 性能数据）
- **交付物**：
  - CLI 命令实现
  - E2E 测试报告
  - 证据目录：`analysis/.../wave5-artifacts/week1/`
- **验收**：
  - API 可用性 >= 99%
  - 删除操作延迟 p95 < 5 秒

---

### Week 2（Day 8-14）：记忆冲突检测 + 项目上下文层（第一阶段）

#### Day 8-10：冲突检测

- **任务**：
  - 实现 Conflict Detector（基于语义相似度 + 实体对比）
  - 实现自动消解策略（replace/merge/ask_user）
  - 集成到 Admission Control（写前检测）
- **交付物**：
  - `extensions/memory-mem0-graphiti-bridge/src/governance/conflict-detector.ts`
  - 冲突检测测试集（至少 30 个样本）
- **验收**：
  - 冲突检测准确率 >= 80%
  - 误报率 <= 10%

#### Day 11-14：项目上下文层（基础版）

- **任务**：
  - 设计 Project Entity schema（Graphiti 扩展）
  - 实现项目创建/更新/查询 API
  - 实现"自动项目识别"原型（基于关键词匹配）
- **交付物**：
  - `extensions/memory-mem0-graphiti-bridge/src/project/project-manager.ts`
  - 项目识别测试集（至少 20 个样本）
- **验收**：
  - 项目识别准确率 >= 60%（基础版）
  - 项目 CRUD API 可用性 >= 99%

---

### Week 3-4（Day 15-30）：集成与优化

#### Day 15-20：跨会话上下文保持

- **任务**：
  - 实现跨会话的项目上下文注入
  - 实现跨渠道的项目关联（Telegram → Discord）
  - 优化项目识别算法（引入语义相似度）
- **交付物**：
  - 跨会话上下文测试报告
  - 项目识别准确率提升至 >= 70%

#### Day 21-25：用户试点

- **任务**：
  - 选择 10 名 Beta 用户进行试点
  - 收集用户反馈（记忆编辑体验、项目上下文准确性）
  - 修复 P0 级 bug
- **交付物**：
  - 用户反馈报告
  - Bug 修复清单

#### Day 26-30：Gate-P0 评审

- **任务**：
  - 准备 Gate-P0 评审材料
  - 运行完整的验收测试
  - 证据落盘（所有指标数据）
- **交付物**：
  - `analysis/.../wave5-artifacts/gate-p0-report.md`
  - 所有 P0 功能的验收证据
- **验收标准**：
  - 所有 P0 功能上线且通过验收指标
  - 用户试点反馈 NPS >= 8/10
  - 无 P0 级 bug

---

## 第二个 30 天（Day 31-60）：P1 能力落地（W6-W7 阶段）

### Week 5（Day 31-37）：高级检索策略实现

#### Day 31-33：Graphiti 高级检索接入

- **任务**：
  - 研究 Graphiti 开源的高级检索能力（Focal-node rerank、Search recipes）
  - 在 `graphiti-client.ts` 中添加参数支持
  - 实现 Group-based 检索（基于 `group_id` 的命名空间约束）
- **交付物**：
  - `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-advanced-search.ts`
  - 单元测试（覆盖率 >= 80%）

#### Day 34-37：灰度验证与优化

- **任务**：
  - 在时序桶与项目上下文桶灰度验证
  - 收集性能数据（延迟、命中率、用户满意度）
  - 优化检索策略参数
- **交付物**：
  - `analysis/.../wave6-artifacts/advanced-search-validation-report.md`
  - 性能优化建议

---

### Week 6（Day 38-44）：主动提醒原型

#### Day 38-40：提醒引擎基础

- **任务**：
  - 实现 Reminder Generator（扫描待办任务、检测项目不活跃）
  - 实现 Timing Intelligence（学习用户活跃模式）
- **交付物**：
  - `extensions/memory-mem0-graphiti-bridge/src/proactive/reminder-engine.ts`

#### Day 41-44：打扰控制与渠道路由

- **任务**：
  - 实现 Interruption Control（打扰成本计算、频率限制）
  - 实现 Channel Router（智能选择渠道）
  - 用户试点（5 名用户）
- **交付物**：
  - 主动提醒测试报告
  - 用户反馈（打扰率、有用性）

---

### Week 7-8（Day 45-60）：记忆质量监控 + 优化

#### Day 45-50：监控仪表盘

- **任务**：
  - 实现记忆质量监控（低质量记忆告警）
  - 实现成本监控（API 调用成本归因）
  - 实现性能监控（延迟、吞吐量）
- **交付物**：
  - 监控仪表盘（Web UI）
  - 告警规则配置

#### Day 51-60：性能优化 + Gate-P1 评审

- **任务**：
  - 优化三路融合检索（Smart Caching、Adaptive Routing）
  - 优化记忆写入（批量写入、压缩）
  - Gate-P1 评审
- **交付物**：
  - 性能优化报告
  - `analysis/.../wave7-artifacts/gate-p1-report.md`

---

## 第三个 30 天（Day 61-90）：P2 探索 + 稳定性强化

### Week 9-10（Day 61-74）：多智能体协作记忆共享（原型）

#### 目标

- 探索多个助手共享记忆的可行性
- 设计团队记忆隔离与共享机制

#### 交付物

- 多智能体协作原型
- 技术可行性报告

---

### Week 11（Day 75-81）：时机感知与用户模式学习（增强版）

#### 目标

- 增强 Timing Intelligence（更精准的时机预测）
- 学习用户的工作模式（深度工作时段、休息时段）

#### 交付物

- 时机感知增强版
- 用户模式学习报告

---

### Week 12-13（Day 82-90）：稳定性强化 + 总结

#### Day 82-85：稳定性测试

- **任务**：
  - 压力测试（高并发、大数据量）
  - 故障注入测试（Mem0/Graphiti 故障、网络抖动）
  - 回滚演练（验证可回滚性）

#### Day 86-90：总结与规划

- **任务**：
  - 编写 90 天总结报告
  - 规划下一阶段（P2 完整实施）
  - 团队复盘会议

---

## 关键里程碑

| 里程碑              | 时间   | 交付物                      | 验收标准       |
| ------------------- | ------ | --------------------------- | -------------- |
| **M1: P0 能力上线** | Day 30 | 记忆治理 API + 项目上下文层 | Gate-P0 通过   |
| **M2: P1 能力上线** | Day 60 | Zep 试点 + 主动提醒 + 监控  | Gate-P1 通过   |
| **M3: P2 原型验证** | Day 90 | 多智能体协作 + 时机感知增强 | 技术可行性确认 |

---

## 风险与缓解

### 风险 #1：P0 能力延期

- **缓解**：Week 1-2 并行实施，压缩工期
- **应急**：优先保证记忆治理 API，项目上下文层可延后

### 风险 #2：Zep Cloud 成本超预算

- **缓解**：A/B 测试期间严格控制流量（10%）
- **应急**：提前终止试点，回退到自建方案

### 风险 #3：用户反馈不佳

- **缓解**：每周收集反馈，快速迭代
- **应急**：回滚到上一个稳定版本

---

## 资源需求

### 工程师

- **后端工程师**：2 人（全职）
- **前端工程师**：1 人（兼职，Week 7-8）
- **测试工程师**：1 人（兼职，Week 3-4, Week 8）

### 基础设施

- **Zep Cloud 试用账号**：1 个（Day 31 申请）
- **监控工具**：内置（无额外成本）
- **测试环境**：复用现有环境

---

## 总结

**30 天**：P0 能力落地，用户可控记忆  
**60 天**：P1 能力落地，主动提醒 + 监控  
**90 天**：P2 原型验证，多智能体协作

每个阶段都有明确的验收标准与可回滚机制，确保稳步推进。
