# 参考架构草图（文字版）

> **版本**: V1.0  
> **日期**: 2026-03-02  
> **目标**: 提供"超级贾维斯"记忆系统的分层架构设计

---

## 1. 整体架构（五层模型）

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: 用户交互层 (User Interface Layer)                 │
│  - Web UI (记忆管理界面)                                     │
│  - CLI (openclaw memory 命令)                                │
│  - 多渠道接口 (Telegram/Discord/Slack/Signal/Web)           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 4: 智能决策层 (Intelligence Layer)                   │
│  - 主动提醒引擎 (Proactive Reminder Engine)                 │
│  - 时机感知引擎 (Timing Intelligence)                       │
│  - 冲突检测器 (Conflict Detector)                           │
│  - 可信度评分器 (Confidence Scorer)                         │
│  - 项目识别器 (Project Identifier)                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 3: 融合决策层 (Fusion & Routing Layer)               │
│  - 查询意图识别 (Query Intent Classifier)                   │
│  - 路由策略 (Routing Strategy: Local/Mem0/Graphiti)        │
│  - 候选合并与重排 (Candidate Fusion & Reranking)           │
│  - 上下文组装器 (Context Assembler)                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 2: 记忆存储层 (Memory Storage Layer)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Local Memory │  │   Mem0       │  │  Graphiti    │      │
│  │ (快速缓存)   │  │ (语义记忆)   │  │ (关系图谱)   │      │
│  │              │  │              │  │              │      │
│  │ - 精确ID查询 │  │ - 用户偏好   │  │ - 项目实体   │      │
│  │ - 会话缓存   │  │ - 事实记忆   │  │ - 任务关系   │    │
│  │ - 热点数据   │  │ - 决策历史   │  │ - 时序图谱   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Layer 1: 基础设施层 (Infrastructure Layer)                 │
│  - P3 Outbox (异步写入队列)                                 │
│  - Admission Control (写前准入控制)                         │
│  - Index Consistency Check (索引一致性检查)                 │
│  - Audit Log (审计日志)                                     │
│  - Monitoring & Alerting (监控与告警)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 核心组件详解

### 2.1 记忆治理中心 (Memory Governance Center)

```
Memory Governance Center
├── Memory Management API
│   ├── list()      - 列出所有记忆
│   ├── get()       - 获取单条记忆详情
│   ├── update()    - 编辑记忆内容
│   ├── delete()    - 删除记忆（软删除/硬删除）
│   └── freeze()    - 冻结记忆（暂时禁用）
│
├── Conflict Detector
│   ├── detect()    - 检测记忆冲突
│   ├── resolve()   - 自动消解冲突
│   └── askUser()   - 请求用户确认
│
├── Confidence Scorer
│   ├── score()     - 计算可信度评分
│   └── classify()  - 分级（high/medium/low）
│
└── Audit Logger
    ├── log()       - 记录操作日志
    └── query()     - 查询审计日志
```

### 2.2 项目上下文管理器 (Project Context Manager)

```
Project Context Manager
├── Project Entity Store
│   ├── create()    - 创建项目
│   ├── update()    - 更新项目信息
│   ├── get()       - 获取项目详情
│   └── list()      - 列出所有项目
│
├── Task Manager
│   ├── create()    - 创建任务
│   ├── update()    - 更新任务状态
│   ├── link()      - 关联记忆到任务
│   └── query()     - 查询任务
│
├── Cross-Channel Sync
│   ├── identify()  - 识别项目关联
│   ├── sync()      - 同步上下文
│   └── track()     - 追踪跨渠道活动
│
└── Context Assembler
    ├── assemble()  - 组装项目上下文
    └── inject()    - 注入到对话
```

### 2.3 主动提醒引擎 (Proactive Reminder Engine)

```
Proactive Reminder Engine
├── Reminder Generator
│   ├── scanTasks()         - 扫描待办任务
│   ├── detectInactivity()  - 检测项目不活跃
│   └── suggestFollowUp()   - 建议跟进
│
├── Timing Intelligence
│   ├── learnPattern()      - 学习用户活跃模式
│   ├── shouldSendNow()     - 判断发送时机
│   └── suggestTime()       - 建议发送时间
│
├── Interruption Control
│   ├── calculateCost()     - 计算打扰成本
│   ├── applyRateLimit()    - 应用频率限制
│   └── respectDND()        - 尊重勿扰时段
│
└── Channel Router
    ├── selectChannel()     - 选择最佳渠道
    └── fallback()          - 渠道降级
```

---

## 3. 数据流设计

### 3.1 写路径（Memory Write Path）

```
用户消息
    ↓
[1] Message Envelope
    ↓
[2] Sensitive Data Filter (敏感信息过滤)
    ↓
[3] Memory Extraction (记忆提取)
    ↓
[4] Confidence Scoring (可信度评分)
    ↓
[5] Conflict Detection (冲突检测)
    ↓
[6] Admission Control (准入控制)
    ↓
[7] P3 Outbox (异步队列)
    ↓
[8] Dual Write (Mem0 + Graphiti)
    ↓
[9] Index Consistency Check (一致性检查)
    ↓
[10] Audit Log (审计日志)
```

### 3.2 读路径（Memory Read Path）

```
用户查询
    ↓
[1] Query Intent Classification (意图识别)
    ├─ exact_id        → Local Memory (精确ID查询)
    ├─ temporal        → Graphiti (时序关系查询)
    ├─ semantic        → Mem0 (语义查询)
    └─ project_context → Fusion (三路融合)
    ↓
[2] Parallel Retrieval (并行检索)
    ├─ Local Memory Client
    ├─ Mem0 Client
    └─ Graphiti Client
    ↓
[3] Candidate Normalization (候选归一化)
    ↓
[4] Confidence Filtering (可信度过滤)
    ↓
[5] Fusion & Reranking (融合重排)
    ↓
[6] Context Assembly (上下文组装)
    ↓
[7] Response Generation (响应生成)
```

---

## 4. 关键技术选型

### 4.1 记忆存储

| 层级         | 技术栈            | 用途                 | 备注     |
| ------------ | ----------------- | -------------------- | -------- |
| Local Memory | SQLite            | 快速缓存、精确ID查询 | 已有实现 |
| Mem0         | 自建/托管         | 语义记忆、用户偏好   | 已集成   |
| Graphiti     | 自建/Zep Cloud    | 关系图谱、时序记忆   | 已集成   |
| Audit Log    | SQLite/PostgreSQL | 审计日志             | 需新增   |

### 4.2 异步处理

| 组件               | 技术栈          | 用途         |
| ------------------ | --------------- | ------------ |
| P3 Outbox          | SQLite + Worker | 异步写入队列 |
| Reminder Scheduler | Cron/Bull       | 定时任务调度 |
| Background Jobs    | Worker Threads  | 后台任务处理 |

### 4.3 监控与可观测性

| 指标类型 | 工具             | 用途             |
| -------- | ---------------- | ---------------- |
| 性能监控 | 内置 Metrics     | 延迟、吞吐量     |
| 质量监控 | 自定义 Dashboard | 记忆质量、冲突率 |
| 成本监控 | API 调用统计     | 成本归因与优化   |
| 告警     | 阈值触发         | 异常检测         |

---

## 5. 扩展性设计

### 5.1 多后端支持

```typescript
/**
 * 记忆后端抽象接口
 */
interface MemoryBackend {
  name: string
  type: 'local' | 'mem0' | 'graphiti' | 'zep' | 'custom'

  // 基础操作
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>
  get(id: string): Promise<MemoryRecord | null>
  create(memory: MemoryInput): Promise<MemoryRecord>
  update(id: ses: MemoryUpdate): Promise<MemoryRecord>
  delete(id: string): Promise<void>

  // 健康检查
  healthCheck(): Promise<HealthStatus>
}
```

### 5.2 插件化架构

```
OpenClaw Core
    ↓
Memory Plugin System
    ├── memory-mem0-graphiti-bridge (已有)
    ├── memory-zep-cloud (计划)
    ├── memory-pinecone (未来)
    └── memory-custom (用户自定义)
```

---

## 6. 部署架构

### 6.1 单机部署（当前）

```
┌─────────────────────────────────────┐
│  OpenClaw Gateway                   │
│  ├── Local Memory (SQLite)         │
│  ├── P3 Outbox (SQLite)            │
│  └── Memory Bridge Extension       │
└─────────────────────────────────────┘
         ↓              ↓
    [Mem0 API]    [Graphiti API]
    (远程服务)    (远程服务)
```

### 6.2 分布式部署（未来）

```
┌─────────────────┐
│  Load Balancer  │
└─────────────────┘
         ↓
┌─────────────────────────────────────┐
│  OpenClaw Gateway Cluster           │
│  ├── Instance 1                     │
│  ├── Instance 2                     │
│  └── Instance N                     │
└─────────────────────────────────────┘
         ↓              ↓
┌─────────────┐  ┌─────────────┐
│ Shared DB   │  │ Redis Cache │
│ (PostgreSQL)│  │             │
└─────────────┘  └─────────────┘
         ↓              ↓
    [Mem0 API]    [Graphiti/Zep API]
```

---

## 7. 安全架构

### 7.1 数据隔离

```
User A's Memory
    ├── Private (只有 User A 可见)
    ├── Team (Team X 成员可见)
    └── Public (所有人可见)

User B's Memory
    ├── Private (只有 User B 可见)
    ├── Team (Team Y 成员可见)
    └── Public (所有人可见)
```

### 7.2 权限控制

```
Memory Access Control
    ├── Read Permission
    │   ├── Owner (创建者)
    │   ├── Team Members (团队成员)
    │   └── Public (公开)
    │
    ├── Write Permission
    │   ├── Owner (创建者)
    │   └── Authorized Users (授权用户)
    │
    └── Delete Permission
        └── Owner Only (仅创建者)
```

---

## 8. 总结：架构设计原则

1. **分层解耦**：每层职责清晰，便于独立演进
2. **可扩展性**：支持多后端、插件化
3. **可观测性**：全链路监控、审计日志
4. **安全性**：数据隔离、权限控制、敏感信息保护
5. **可靠性**：异步队列、降级策略、故障恢复
6. **性能优化**：多级缓存、并行检索、智能路由
