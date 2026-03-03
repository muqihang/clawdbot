# 优先级路线图（P0/P1/P2）

> **版本**: V1.0  
> **日期**: 2026-03-02  
> **执行原则**: 单变量迭代 + Shadow → Canary → Expand + 证据驱动

---

## P0：立刻做（阻断项，必须在 W5 完成）

### P0-1：记忆治理 API（Memory Management API）

**预期收益**：

- 用户可查看、编辑、删除记忆（可控性 +100%）
- 错误记忆可被纠正（记忆质量 +30%）
- 用户信任度提升（NPS +15 分）

**技术实现要点**：

```typescript
// 核心 API 设计
interface MemoryManagementAPI {
  // 查询用户的所有记忆
  listMemories(userId: string, filters?: MemoryFilters): Promise<Memory[]>;

  // 获取单条记忆详情（含溯源信息）
  getMemory(memoryId: string): Promise<MemoryDetail>;

  // 编辑记忆内容
  updateMemory(memoryId: string, updates: MemoryUpdate): Promise<Memory>;

  // 删除记忆（软删除 + 级联清理）
  deleteMemory(memoryId: string, cascade?: boolean): Promise<void>;

  // 记忆审计日志
  getMemoryAuditLog(memoryId: string): Promise<AuditLog[]>;
}

interface Memory {
  id: string;
  source: "mem0" | "graphiti" | "local";
  content: string;
  confidence: number; // 0-1，可信度评分
  createdAt: string;
  updatedAt: string;
  tags: string[]; // ['preference', 'fact', 'decision']
  visibility: "private" | "team" | "public";
}
```

**依赖条件**：

- Mem0/Graphiti 支持 PATCH/DELETE 操作（需验证 OpenAPI）
- P3 Outbox 支持"删除操作"的异步处理
- Local Memory 支持软删除标记

**风险**：

- Mem0/Graphiti 可能不支持编辑/删除（需 fallback 到"标记为无效"）
- 级联删除可能影响关联记忆（需用户确认）
- 删除操作的延迟（异步队列）可能导致用户困惑

**验收指标**：

- API 可用性：99.9%
- 删除操作延迟：p95 < 5 秒
- 用户纠错率：>= 5%（说明用户在使用该功能）
- 记忆质量提升：误召回率下降 >= 20%

**实施步骤**（5 天）：

1. Day1：设计 API schema + 验证 Mem0/Graphiti 能力
2. Day2：实现 list/get 接口（只读）
3. Day3：实现 update/delete 接口（写操作）
4. Day4：集成到 P3 Outbox + 添加审计日志
5. Day5：端到端测试 + 证据落盘

---

### P0-2：记忆可信度分级（Confidence Scoring）

**预期收益**：

- 区分"确定事实"与"推测性记忆"（精准度 +25%）
- 低置信度记忆不参与关键决策（错误率 -30%）
- 为记忆冲突消解提供依据

**技术实现要点**：

```typescript
interface ConfidenceScorer {
  // 计算记忆的可信度评分
  score(memory: MemoryCandidate): ConfidenceScore;
}

interface ConfidenceScore {
  value: number; // 0-1
  factors: {
    source_reliability: number; // 来源可靠性（用户明确陈述 vs 推测）
    consistency: number; // 与历史记忆的一致性
    recency: number; // 时间新鲜度
    evidence_strength: number; // 证据强度（多次确认 vs 单次提及）
  };
  threshold: "high" | "medium" | "low";
}

// 使用示例
if (memory.confidence < 0.7) {
  // 低置信度记忆：仅用于参考，不用于关键决策
  context.addReference(memory, { weight: 0.3 });
} else {
  // 高置信度记忆：可用于关键决策
  context.addFact(memory, { weight: 1.0 });
}
```

**依赖条件**：

- Admission Control 已启用（`admission_enabled=true`）
- 记忆写入时携带"来源信号"（用户明确陈述 vs 推测）

**风险**：

- 评分模型可能不准确（需持续迭代）
- 低置信度记忆被过度抑制（需平衡）

**验收指标**：

- 高置信度记忆的准确率：>= 95%
- 低置信度记忆的误召回率：<= 10%
- 用户纠错率（高置信度）：<= 2%

**实施步骤**（3 天）：

1. Day1：设计评分模型 + 定义因子权重
2. Day2：实现评分逻辑 + 集成到 Admission Control
3. Day3：离线评测 + 调优阈值

---

### P0-3：项目上下文层（Project Context Layer）

**预期收益**：

- 跨会话追踪项目进展（上下文连续性 +80%）
- 跨渠道保持上下文（用户体验 +50%）
- 支撑长期协作场景（任务完成率 +40%）

**技术实现要点**：

```typescript
// 项目实体建模
interface Project {
  id: string;
  name: string;
  description: string;
  participants: string[]; // user_ids
  channels: string[]; // telegram/discord/slack
  createdAt: string;
  updatedAt: string;
  status: "active" | "paused" | "completed";

  // 关联的记忆与任务
  memories: string[]; // memory_ids
  tasks: Task[];
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  assignee?: string;
  dueDate?: string;
  relatedMemories: string[];
}

// 检索时自动注入项目上下文
interface MemorySearchWithProject {
  query: string;
  projectId?: string; // 如果指定，优先返回该项目的记忆
  includeProjectContext: boolean; // 是否包含项目元信息
}
```

**依赖条件**：

- Graphiti 支持"项目实体"建模（需扩展 schema）
- 跨渠道的 user_id 映射机制（同一用户在不同渠道的身份关联）

**风险**：

- 项目识别可能不准确（需用户手动确认）
- 跨渠道同步延迟（需异步机制）

**验收指标**：

- 项目上下文命中率：>= 70%（用户查询时能正确关联到项目）
- 跨会话上下文保持率：>= 80%
- 用户满意度（长期任务）：NPS +20 分

**实施步骤**（7 天）：

1. Day1-2：设计项目实体 schema + Graphiti 集成
2. Day3-4：实现项目创建/更新/查询 API
3. Day5：实现"自动项目识别"逻辑（基于对话内容）
4. Day6：集成到记忆检索路径
5. Day7：端到端测试 + 用户试点

---

### P0-4：记忆冲突检测（Conflict Detection）

**预期收益**：

- 自动识别矛盾记忆（冲突检测率 >= 80%）
- 提示用户确认（用户纠错率 +15%）
- 避免错误记忆固化（记忆质量 +25%）

**技术实现要点**：

```typescript
interface ConflictDetector {
  // 检测新记忆与历史记忆的冲突
  detect(newMemory: MemoryCandidate, existingMemories: Memory[]): Conflict[];
}

interface Conflict {
  type: "contradiction" | "update" | "duplicate";
  newMemory: MemoryCandidate;
  conflictingMemory: Memory;
  confidence: number; // 冲突置信度
  resolution: ConflictResolution;
}

interface ConflictResolution {
  strategy: "replace" | "merge" | "keep_both" | "ask_user";
  reason: string;
}

// 使用示例
const conflicts = detector.detect(newMemory, existingMemories);
if (conflicts.length > 0) {
  for (const conflict of conflicts) {
    if (conflict.confidence > 0.8) {
      // 高置信度冲突：询问用户
      await askUserToResolve(conflict);
    } else {
      // 低置信度冲突：自动合并
      await autoResolve(conflict);
    }
  }
}
```

**依赖条件**：

- 记忆可信度评分（P0-2）已实现
- 记忆治理 API（P0-1）已实现（用于更新/删除）

**风险**：

- 冲突检测可能误报（需调优阈值）
- 用户频繁被打断确认（需平衡自动化与人工介入）

**验收指标**：

- 冲突检测准确率：>= 80%
- 误报率：<= 10%
- 用户确认率：>= 60%（说明用户认可冲突提示）

**实施步骤**（5 天）：

1. Day1：设计冲突检测规则（基于语义相似度 + 实体对比）
2. Day2：实现冲突检测逻辑
3. Day3：实现自动消解策略（replace/merge）
4. Day4：集成到 Admission Control（写前检测）
5. Day5：用户交互设计 + 端到端测试

---

## P0 总结

**总工期**：20 天（并行实施可压缩到 15 天）  
**关键里程碑**：

- Day 5：记忆治理 API 上线
- Day 8：记忆可信度分级上线
- Day 15：项目上下文层上线
- Day 20：记忆冲突检测上线

**Gate-P0 评审标准**：

- 所有 P0 功能上线且通过验收指标
- 用户试点反馈 NPS >= 8/10
- 无 P0 级 bug（阻断用户使用）
- 证据落盘完整（所有实验可复现）

---

## P1：下一阶段（增强体验与稳定性，W6-W7）

### P1-1：高级检索策略（Graphiti Advanced Search）

**预期收益**：

- 利用 Graphiti 开源的高级检索能力
- 时序关系桶 Top1 提升 >= 10pp
- 项目上下文桶 FUR 提升 >= 15pp

**技术实现要点**：

```typescript
/**
 * 高级检索策略（基于开源 Graphiti）
 */
interface AdvancedSearchStrategy {
  // Focal-node 重排：以特定节点为中心重排结果
  focalNodeRerank(params: {
    query: string;
    focalNodeId: string;
    maxDistance: number;
  }): Promise<SearchResult[]>;

  // Search recipes：预定义的检索模式
  searchRecipe(params: {
    recipe: "temporal_facts" | "entity_relationships" | "community_context";
    query: string;
  }): Promise<SearchResult[]>;

  // Group-based 检索：基于 group_id 的命名空间约束
  searchInGroup(params: { groupId: string; query: string }): Promise<SearchResult[]>;
}
```

**实施策略**：

- 直接使用 Graphiti 开源能力（Apache-2.0）
- 在 `graphiti-client.ts` 中添加参数支持
- 灰度验证时序桶与项目上下文桶收益

**依赖条件**：

- Graphiti 已集成（W4 完成）
- 项目上下文层已实现（P0-3）

**风险**：

- Graphiti 高级能力可能需要额外配置
- 性能优化可能需要多次迭代

**验收指标**：

- 时序关系桶 Top1 提升 >= 10pp
- 项目上下文桶 FUR 提升 >= 15pp
- p95 延迟增幅 <= 10%

**工期**：5 天

---

### P1-2：主动提醒原型（Proactive Reminders）

**预期收益**：

- 在合适时机提醒用户（用户价值 +30%）
- 不过度打扰（打扰率 <= 5%）

**技术要点**：

- 基于 Graphiti 时序图谱识别"待办任务"
- 学习用户的活跃时段（避免深夜提醒）
- 跨渠道智能路由（紧急 → Telegram，非紧急 → Email）

**工期**：7 天

---

### P1-3：记忆质量监控仪表盘

**预期收益**：

- 实时监控记忆质量（低质量记忆告警）
- 成本归因与优化（API 调用成本可控）

**工期**：5 天

---

## P2：中长期（竞争壁垒，W8+）

### P2-1：多智能体协作记忆共享

### P2-2：时机感知与用户模式学习

### P2-3：高级图策略（社区发现/影计见后续文档）
