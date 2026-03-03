# 自建 Zep 级功能路线图（Self-Hosted Implementation Roadmap）

> **版本**: V1.0  
> **日期**: 2026-03-02  
> **战略**: 自主开发，Zep Cloud 作为参考标杆  
> **目标**: 在 Mem0 + Graphiti 自建方案中实现 Zep Cloud 级别的能力

---

## 0. 核心原则

1. **自主可控优先**：所有功能必须可自建实现，不依赖 Zep Cloud 托管服务
2. **Zep Cloud 是参考标杆**：学习其设计理念与 API 语义，但不直接采购
3. **开源优先**：优先使用 Apache-2.0 的 Graphiti 开源能力
4. **务实落地**：优先实现高价值、低复杂度的功能
5. **渐进式升级**：保持可回滚，每个阶段都有明确的验收标准

---

## 1. Zep Cloud 能力清单与自建可行性分析

### 1.1 核心差异化能力（Zep Cloud vs 开源 Graphiti）

基于 `zep-cloud-gap-copy-playbook.md` 和官方文档的分析：

| 能力分类           | Zep Cloud 提供                            | 开源 Graphiti 提供 | 自建可行性                   | 优先级 |
| ------------------ | ----------------------------------------- | ------------------ | ---------------------------- | ------ |
| **用户与线程管理** | ✅ 内置 Users/Threads/Messages API        | ❌ 需自建          | 🟢 高（可直接复刻 API 语义） | P0     |
| **上下文装配**     | ✅ `get_user_context` + Context Templates | ❌ 需自建          | 🟢 高（可复刻行为）          | P0     |
| **异步任务状态**   | ✅ Task Polling + Webhook 事件            | ❌ 需自建          | 🟢 高（可复用 P3 Outbox）    | P0     |
| **记忆治理 API**   | ✅ 编辑/删除/版本控制                     | ❌ 需自建          | 🟢 高（基于 Graphiti CRUD）  | P0     |
| **高级检索策略**   | ✅ Focal-node rerank + Search recipes     | ✅ 开源提供        | 🟢 极高（直接使用）          | P0     |
| **可观测性仪表盘** | ✅ Graph 可视化 + API 日志                | ❌ 需自建          | 🟡 中（需前端开发）          | P1     |
| **审计日志**       | ✅ 操作审计 + IP 追踪                     | ❌ 需自建          | 🟢 高（基于 SQLite）         | P1     |
| **多租户隔离**     | ✅ 账号级/项目级权限                      | ✅ `group_id` 隔离 | 🟢 高（扩展 group_id）       | P1     |
| **自动扩缩容**     | ✅ 托管服务特有                           | ❌ 不适用          | 🔴 低（运维层面）            | P2     |
| **SLA 保障**       | ✅ 99.9% 可用性承诺                       | ❌ 自行保障        | 🔴 低（运维层面）            | P2     |

---

## 2. 自建实现路线图（按优先级）

### 2.1 P0：核心平台能力（立刻做，W5 阶段）

#### P0-1：用户与线程语义层（User + Thread + Message）

**目标**：补齐 Graphiti 缺失的"产品平台层"，提供与 Zep Cloud 对等的用户/线程管理能力。

**技术实现**：

```typescript
/**
 * 用户实体：一等公民的用户建模
 */
interface User {
  id: string; // oc_user_id（OpenClaw 用户 ID）
  externalId?: string; // 外部系统 ID（如 Telegram user_id）
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * 线程实体：会话/对话的持久化单元
 */
interface Thread {
  id: string; // oc_thread_id
  userId: string; // 关联用户
  channelType: string; // telegram/discord/slack/signal/web
  channelId: string; // 渠道内的线程 ID
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}

/**
 * 消息实体：线程内的消息记录
 */
interface Message {
  id: string; // oc_message_id
  threadId: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string; // RFC3339 格式
}
```

**实现要点**：

1. **映射层**：在桥接层建立 `channel/user/thread → stable ids` 的映射
2. **隔离机制**：继续使用 Graphiti 的 `group_id` 做物理隔离，上层补线程语义
3. **向后兼容**：保留现有 `query/session` 路由逻辑，通过 feature flag 切换

**验收指标**：

- 跨会话上下文保持率 >= 80%
- 项目上下文桶 Top1 提升 >= 10pp
- 无现有功能回退

**工期**：5 天

---

#### P0-2：上下文装配层（Context Assembly）

**目标**：复刻 Zep Cloud 的 `get_user_context` + Context Templates 能力。

**技术实现**：

```typescript
/**
 * 上下文装配器：从多源检索结果生成结构化上下文
 */
interface ContextAssembler {
  /**
   * 装配上下文（三模板）
   */
  assemble(params: {
    threadId: string;
    query: string;
    template: "exact_id" | "decision_reason" | "temporal_relation";
  }): Promise<AssembledContext>;
}

interface AssembledContext {
  // 结构化上下文块
  blocks: Array<{
    type: "user_profile" | "project_context" | "recent_messages" | "related_facts";
    content: string;
    source: "local" | "mem0" | "graphiti";
    confidence: number;
  }>;

  // 元信息
  metadata: {
    retrievalLatency: number;
    sourcesUsed: string[];
    totalTokens: number;
  };
}
```

**三大模板设计**：

1. **精确 ID 模板**（Exact ID Template）

   ```
   用户画像：
   - 角色：全栈工程师
   - 偏好：深色模式、函数式编程

   当前项目：认证系统
   - 状态：设计阶段
   - 最后讨论：2026-03-01
   ```

2. **决策原因模板**（Decision Reason Template）

   ```
   决策历史：
   - 选择方案 A（JWT + Refresh Token）
   - 原因：安全性高、易于扩展
   - 时间：2026-02-28
   - 参与者：用户、助手
   ```

3. **时序关系模板**（Temporal Relation Template）
   ```
   时间线：
   - 2026-02-25：讨论认证方案
   - 2026-02-28：选定方案 A
   - 2026-03-01：开始数据库设计
   ```

**实现要点**：

1. **检索种子**：使用当前线程最近消息作为检索种子
2. **跨线程检索**：返回跨该用户所有线程的相关上下文
3. **延迟目标**：P95 < 500ms（初期），优化到 < 200ms（P1 阶段）

**验收指标**：

- FUR（First Usable Rate）提升 >= 10pp
- 首条可用率提升 >= 15%
- p95 延迟 <= 500ms

**工期**：7 天

---

#### P0-3：异步任务状态管理（Task & Webhook）

**目标**：让写入的"可读时机"与"失败原因"可见，解决"写了但何时可读、失败在哪里"的盲区。

**技术实现**：

```typescript
/**
 * 任务状态：异步操作的生命周期管理
 */
interface Task {
  id: string;
  type: "memory_write" | "episode_ingest" | "graph_update";
  status: "pending" | "processing" | "completed" | "failed";
  progress: number; // 0-100
  result?: unknown;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * Webhook 事件：异步通知机制
 */
interface WebhookEvent {
  id: string;
  type: "episode.processed" | "ingest.batch.completed" | "memory.updated";
  payload: unknown;
  signature: string; // HMAC 签名
  timestamp: string;
  retryCount: number;
}
```

**实现要点**：

1. **复用 P3 Outbox**：扩展现有 Outbox 状态机，补 task/webhook 适配器
2. **轮询接口**：`task.get(taskId)` 返回任务状态
3. **事件总线**：内部事件总线（不对外），支持 webhook 消费
4. **去重与重试**：基于 `event_id` 去重，15 秒内 ack 建议

**验收指标**：

- Pending 老化下降 >= 50%
- 失败定位时间缩短 >= 70%
- 写入可观测性覆盖率 = 100%

**工期**：5 天

---

#### P0-4：记忆治理 API（Memory Management API）

**目标**：提供用户可控的记忆管理能力（查看、编辑、删除、冻结）。

**技术实现**：

```typescript
/**
 * 记忆治理 API
 */
interface MemoryGovernanceAPI {
  // 查询记忆
  listMemories(userId: string, filters?: MemoryFilters): Promise<Memory[]>;
  getMemory(memoryId: string): Promise<MemoryDetail>;

  // 编辑记忆
  updateMemory(memoryId: string, updates: MemoryUpdate): Promise<Memory>;

  // 删除记忆（软删除 + 级联清理）
  deleteMemory(memoryId: string, cascade?: boolean): Promise<void>;

  // 冻结记忆（暂时禁用）
  freezeMemory(memoryId: string): Promise<void>;
  unfreezeMemory(memoryId: string): Promise<void>;

  // 审计日志
  getMemoryAuditLog(memoryId: string): Promise<AuditLog[]>;
}
```

**实现要点**：

1. **基于 Graphiti CRUD**：利用 Graphiti 的 entity/edge 操作
2. **软删除标记**：添加 `deleted_at` 字段，检索时过滤
3. **级联删除**：删除实体时同步删除关联边
4. **审计日志**：记录所有操作到 SQLite

**验收指标**：

- API 可用性 >= 99.9%
- 删除操作延迟 p95 < 5 秒
- 用户纠错率 >= 5%

**工期**：5 天

---

### 2.2 P1：增强体验与稳定性（W6-W7 阶段）

#### P1-1：高级检索策略（Graphiti Advanced Search）

**目标**：利用 Graphiti 开源的高级检索能力（Focal-node rerank、Search recipes）。

**技术实现**：

```typescript
/**
 * 高级检索策略
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
    options?: Record<string, unknown>;
  }): Promise<SearchResult[]>;

  // Group-based 检索：基于 group_id 的命名空间约束
  searchInGroup(params: { groupId: string; query: string }): Promise<SearchResult[]>;
}
```

**实现要点**：

1. **直接使用开源能力**：Graphiti 已提供 focal-node rerank 和 search recipes
2. **参数层扩展**：在 `graphiti-client.ts` 中添加参数支持
3. **灰度验证**：先在时序桶与项目上下文桶验证收益

**验收指标**：

- 时序关系桶 Top1 提升 >= 10pp
- 项目上下文桶 FUR 提升 >= 15pp

**工期**：5 天

---

#### P1-2：可观测性仪表盘（Observability Dashboard）

**目标**：提供 Web UI 用于可视化记忆图谱、查看 API 日志、监控质量指标。

**技术实现**：

```typescript
/**
 * 仪表盘功能模块
 */
interface ObservabilityDashboard {
  // 图谱可视化
  visualizeGraph(params: {
    userId: string;
    timeRange?: [string, string];
  }): Promise<GraphVisualization>;

  // API 日志查询
  queryApiLogs(params: {
    startTime: string;
    endTime: string;
    filters?: LogFilters;
  }): Promise<ApiLog[]>;

  // 质量监控
  getQualityMetrics(params: { timeRange: [string, string] }): Promise<QualityMetrics>;
}
```

**实现要点**：

1. **前端技术栈**：React + D3.js（图谱可视化）
2. **后端 API**：基于现有 `server/` 目录扩展
3. **数据源**：从 Graphiti + SQLite 审计日志聚合

**验收指标**：

- 图谱可视化延迟 < 2 秒
- API 日志查询支持 >= 7 天历史
- 质量监控覆盖所有核心指标

**工期**：10 天

---

#### P1-3：审计日志与访问控制（Audit Log + Access Control）

**目标**：记录所有操作的审计日志，支持细粒度的访问权限控制。

**技术实现**：

```typescript
/**
 * 审计日志
 */
interface AuditLog {
  id: string;
  userId: string;
  action: "create" | "read" | "update" | "delete";
  resourceType: "memory" | "user" | "thread" | "message";
  resourceId: string;
  changes?: {
    before: unknown;
    after: unknown;
  };
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
}

/**
 * 访问控制
 */
interface AccessControl {
  // 检查权限
  checkPermission(params: {
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
  }): Promise<boolean>;

  // 授予权限
  grantPermission(params: { userId: string; permissions: Permission[] }): Promise<void>;
}
```

**实现要点**：

1. **存储**：SQLite 存储审计日志（轻量级、易于查询）
2. **权限模型**：基于 RBAC（Role-Based Access Control）
3. **隐私保护**：敏感字段脱敏（如密码、API Key）

**验收指标**：

- 审计日志覆盖率 = 100%
- 权限检查延迟 < 10ms
- 日志保留期 >= 90 天

**工期**：7 天

---

### 2.3 P2：长期竞争力（W8+ 阶段）

#### P2-1：多智能体协作记忆共享

**目标**：支持多个助手共享记忆，实现团队级协作。

**技术实现**：

- 基于 Graphiti 的 `group_id` 实现团队级隔离
- 引入"共享记忆"标签（`visibility: 'team'`）
- 实现跨助手的记忆同步机制

**工期**：10 天

---

#### P2-2：时机感知与用户模式学习

**目标**：学习用户的工作模式，在合适时机主动提醒。

**技术实现**：

- 基于历史活动数据学习用户活跃时段
- 实现"打扰成本"计算模型
- 支持跨渠道的智能路由

**工期**：10 天

---

#### P2-3：高级图策略（社区发现/影响分析）

**目标**：利用 Graphiti 的高级图算法能力。

**技术实现**：

- 社区发现：识别紧密关联的实体群组
- 影响分析：分析某个实体的影响范围
- 路径查询：查找实体间的关系路径

**工期**：7 天

---

## 3. 社区生态高级玩法（可借鉴）

基于 `zep-cloud-gap-copy-playbook.md` 和 Graphiti 生态调研：

### 3.1 CrewAI 外部记忆自动读写

- **玩法**：任务开始自动检索、任务结束自动写回
- **借鉴**：把 OpenClaw 的 tool 执行结果纳入统一 memory sink

### 3.2 LangGraph 记忆模式

- **玩法**：线程状态 + 外部长期记忆分层，避免 state 无限膨胀
- **借鉴**：把"近 4-6 轮短上下文"与"长期图谱上下文"分层

### 3.3 LiveKit 房间隔离模式

- **玩法**：按 room/thread 做记忆隔离
- **借鉴**：OpenClaw 多渠道统一映射到 thread namespace

### 3.4 Autogen 图记忆注入

- **玩法**：按 facts_limit/entity_limit 控制注入预算
- **借鉴**：把 token 预算从"检索条数"改成"事实/实体预算"

### 3.5 Graphiti MCP Sidecar

- **玩法**：先旁路协处理，不直接替换主链路
- **借鉴**：当前最适合 shadow/sidecar 方式做验证

---

## 4. 实施顺序（30 天快速落地）

### Week 1：补平台语义（Day 1-7）

1. 定义 OpenClaw 的 `user/thread/message` 映射规范
2. 给 outbox event 增加消息语义字段（只写 shadow）
3. 扩展 shadow 指标结构

**为什么现在做**：先把"数据面"补齐，后续所有重排与模板才有稳定输入。

### Week 2：上下文装配（Day 8-14）

1. 在桥接层加 `context_assemble`（三模板）
2. 采用"最近消息 + 多源检索 + 模板拼装"的最小实现
3. 与当前直出结果并行 shadow，对比首条可用率

**为什么现在做**：这是最直接提升"回答可用性"的层。

### Week 3：异步状态管理（Day 15-21）

1. 提供 task polling 视图（绑定 outbox event）
2. 新增 webhook consumer（先内部事件总线，不对外）
3. 建立去重（event id）与重试策略

**为什么现在做**：解决"写了但何时可读、失败在哪里"的盲区。

### Week 4：高级检索实现（Day 22-30）

1. 引入 focal-node rerank 与 namespace 约束
2. 把 Graphiti search recipes 作为可选策略
3. 灰度验证时序桶与项目上下文桶收益

**为什么现在做**：平台层补齐后，Graphiti 高阶能力才会真实转化为收益。

---

## 5. 成本与资源评估

### 5.1 开发资源

- **后端工程师**：2 人（全职）
- **前端工程师**：1 人（兼职，P1 阶段）
- **测试工程师**：1 人（兼职）

### 5.2 基础设施成本

- **Neo4j/FalkorDB**：自建（Docker 部署）
- **SQLite**：审计日志存储（无额外成本）
- **OpenAI API**：LLM 推理与 embedding（按实际使用量计费）

### 5.3 运维成本

- **监控**：内置（无额外成本）
- **备份**：定期备份 Neo4j/SQLite 数据
- **扩容**：根据用户增长手动扩容

---

## 6. 风险与缓解

### 风险 #1：开发周期延期

- **缓解**：Week 1-2 并行实施，压缩工期
- **应急**：优先保证 P0 能力，P1/P2 可延后

### 风险 #2：性能不达标

- **缓解**：每个阶段都有性能验收指标
- **应急**：引入缓存层（Redis）优化延迟

### 风险 #3：Graphiti 能力不足

- **缓解**：深度研究 Graphiti 源码，必要时贡献 PR
- **应急**：Fork Graphiti 并自行扩展

---

## 7. 总结

**核心策略**：自主开发 + 参考 Zep Cloud + 利用开源 Graphiti  
**实施路径**：P0（平台能力）→ P1（体验优化）→ P2（竞争壁垒）  
**关键里程碑**：30 天完成 P0，60 天完成 P1，90 天完成 P2  
**成功标准**：所有功能可自建实现，不依赖 Zep Cloud 托管服务
