# OpenClaw 超级贾维斯记忆系统升级落地方案

> **日期**: 2026-03-06
> **性质**: 设计计划文档（非执行）
> **输入来源**:
>
> - W4 审计报告: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/preflight/01-audit-design-review-main/`
> - Super Jarvis 策略文档 (12 份): `analysis/2026-02-27-super-jarvis-memory-strategy/`
> - Palantir Ontology 调研: `analysis/2026-03-05-palantir-ontology-deep-research.md`
> - W4 Gate-4 收口证据: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/`
>   **执行模式**: Solo + AI Agents 协作

---

## 目录

- [一、设计哲学](#一设计哲学)
- [二、现状评估](#二现状评估)
- [三、架构演进总览](#三架构演进总览)
- [四、Phase 1: 地基加固（第 1-2 周）](#四phase-1-地基加固第-1-2-周)
- [五、Phase 2: Ontology 治理层（第 3-5 周）](#五phase-2-ontology-治理层第-3-5-周)
- [六、Phase 3: 项目上下文 + 高级检索（第 6-8 周）](#六phase-3-项目上下文--高级检索第-6-8-周)
- [七、Phase 4: 主动智能 + 持续进化（第 9 周+）](#七phase-4-主动智能--持续进化第-9-周)
- [八、关键架构决策](#八关键架构决策)
- [九、风险与缓解](#九风险与缓解)
- [十、执行节奏与 Gate 验收](#十执行节奏与-gate-验收)
- [附录 A: 依赖关系图](#附录-a-依赖关系图)
- [附录 B: 文件路径规划](#附录-b-文件路径规划)

---

## 一、设计哲学

### 1.1 从"三路检索融合"到"个人 Ontology 基座"

当前 W4 已经证明 Local + Mem0 + Graphiti 三路融合方向正确。但三路目前仅被当成"三个搜索引擎"使用——缺少治理、缺少结构化语义、缺少操作闭环。

升级方向是：将 Palantir Ontology 的四维模型下沉到个人场景，把三路存储重新定位为 **Ontology 的三个投影**，而非三个独立的搜索引擎。

### 1.2 Palantir Ontology 四维模型的个人化映射

| Palantir 维度          | 个人场景映射                                                                            | OpenClaw 承载               |
| ---------------------- | --------------------------------------------------------------------------------------- | --------------------------- |
| **Data（语义层）**     | 你的世界由 Objects（项目/任务/联系人/决策/偏好）、Properties（属性）、Links（关系）构成 | PG 治理层 + 三路存储        |
| **Logic（推理层）**    | 记忆检索、置信度评分、冲突检测、查询路由                                                | Bridge 智能层               |
| **Action（动能层）**   | 记忆 CRUD、项目状态变更、主动提醒触发                                                   | Memory Management API + CLI |
| **Security（治理层）** | 审计日志、敏感数据过滤、权限边界                                                        | PG 审计 + Admission Control |

### 1.3 三路存储的重新定位

三路不是三个搜索引擎，而是同一个 Ontology 的三个投影面：

| 存储层               | Ontology 角色 | 承载内容                                 | 独特能力                            |
| -------------------- | ------------- | ---------------------------------------- | ----------------------------------- |
| **Local (SQLite)**   | 工作记忆      | 文件索引、精确匹配、立即可用的上下文     | 零延迟、零依赖、回退锚点            |
| **Mem0 (Qdrant)**    | 语义事实库    | 偏好、习惯、长期事实、user_id 作用域记忆 | 向量语义检索、去重合并、CRUD 抽象   |
| **Graphiti (Neo4j)** | 关系时序图    | 项目/任务/决策链、group_id 命名空间      | 时序推理、多跳关系、focal-node 重排 |

三路之上新增 **PostgreSQL 治理层**，作为 Ontology Object Registry——每条记忆的 canonical 身份、审计日志、关系（Links）、变更事件流都在这里。

---

## 二、现状评估

### 2.1 W4 已经证明的

| 维度     | W4 结论                                      | 证据                          |
| -------- | -------------------------------------------- | ----------------------------- |
| 方向正确 | builtin local + Mem0 + Graphiti 三层分工成立 | Gate-4 GO                     |
| 质量达标 | Top1 avg delta +74.8pp, FUR delta +72.58pp   | `w4-gate4-delta.json`         |
| 延迟过线 | p95 增幅 13.71% (阈值 15%)                   | `w4-gate4-delta.json`         |
| 稳定达标 | stability.pass = true                        | `gate4.go-no-go.summary.json` |

### 2.2 W4 审计发现的待解决问题

**设计缺陷（方向层面）：**

| 编号 | 问题                                                                                   | 影响                       |
| ---- | -------------------------------------------------------------------------------------- | -------------------------- |
| D1   | 跨源分数不可比融合——local/Mem0/Graphiti 三种不同量纲分数通过 weight 线性缩放后直接排序 | 融合排序质量不稳定         |
| D2   | 查询分类使用静态正则表达式                                                             | 泛化能力有限               |
| D3   | Neo4j Aura 连接使用 bolt+s 替代 neo4j+s                                                | 丧失集群故障转移能力       |
| D4   | 回退链是串行的                                                                         | worst case 延迟 = 三级之和 |
| D5   | bridge 层过于臃肿（memory-search-tool.ts 超 3000 行）                                  | 演进成本高                 |

**实现缺陷（执行层面）：**

| 编号 | 问题                                     | 影响                   |
| ---- | ---------------------------------------- | ---------------------- |
| I1   | site-package patching 适配 Graphiti/Mem0 | 每次更新需重新 patch   |
| I2   | 无 circuit breaker                       | 远程超时拖慢所有请求   |
| I3   | Graphiti retry 被禁用                    | 瞬时错误误判为永久失败 |
| I4   | 未使用 Graphiti group_ids                | 搜索空间未收窄         |

### 2.3 Super Jarvis 策略文档的核心诉求（12 份文档归纳）

| 优先级 | 核心缺口                                      | 对应文档                      |
| ------ | --------------------------------------------- | ----------------------------- |
| **P0** | 记忆治理 API 缺失（查看/编辑/删除/冻结/审计） | `02-gap-analysis.md` G-01     |
| **P0** | 记忆可信度分级缺失                            | `02-gap-analysis.md` G-02     |
| **P0** | 记忆冲突检测缺失                              | `02-gap-analysis.md` G-03     |
| **P0** | 项目/任务上下文层缺失                         | `02-gap-analysis.md` G-04     |
| **P1** | 高级检索策略（Graphiti focal-node/recipes）   | `03-priority-roadmap.md` P1-1 |
| **P1** | 主动提醒能力缺失                              | `02-gap-analysis.md` G-08     |
| **P1** | 记忆质量监控缺失                              | `03-priority-roadmap.md` P1-3 |
| **P2** | 多智能体协作记忆共享                          | `02-gap-analysis.md` G-13     |
| **P2** | 时机感知与用户模式学习                        | `02-gap-analysis.md` G-14     |

---

## 三、架构演进总览

### 3.1 目标架构（五层模型）

```
┌──────────────────────────────────────────────────────────────┐
│  Layer 5: 用户界面                                            │
│  CLI (openclaw memory ...) · Web UI · 多渠道 (TG/DC/Slack)    │
└──────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────┐
│  Layer 4: 智能层                                              │
│  查询路由 · RRF融合重排 · 置信度评分 · 冲突检测 · 主动提醒 · 项目识别  │
└──────────────────────────────────────────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────┐
│  Layer 3: Ontology 治理层 (PostgreSQL)                        │
│  Object Registry · Memory Events · Links · Audit Log          │
└──────────────────────────────────────────────────────────────┘
                              ↕
┌────────────────┬─────────────────┬───────────────────────────┐
│  Layer 2a:     │  Layer 2b:      │  Layer 2c:                │
│  Local Memory  │  Mem0 (Qdrant)  │  Graphiti (Neo4j)         │
│  工作记忆       │  语义事实库      │  关系时序图                │
│  SQLite vec    │  向量检索+CRUD   │  图遍历+时序+recipes       │
│  + FTS + MMR   │  + user_id scope │  + group_id namespace     │
└────────────────┴─────────────────┴───────────────────────────┘
                              ↕
┌──────────────────────────────────────────────────────────────┐
│  Layer 1: 基础设施                                            │
│  P3 Outbox · Admission Control · 监控告警 · 敏感数据过滤         │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 数据流设计

**写路径：**

```
用户消息 → 敏感数据过滤 → 记忆提取 → 置信度评分 → 冲突检测
    → Admission Control → P3 Outbox → 双写 (Mem0 + Graphiti)
    → PG 治理层注册 (memory_items + memory_events)
    → 审计日志
```

**读路径：**

```
查询 → 意图分类 (exact_id / temporal / semantic / project_context)
    → 路由决策 (ReadPlan)
    → 并行召回 (Local + Mem0/Graphiti based on intent)
    → RRF 融合排序
    → 置信度过滤
    → 上下文装配 (context_assemble template)
    → 返回结果 + 诊断 trace
```

---

## 四、Phase 1: 地基加固（第 1-2 周）

**目标**: 把 W4 "成功的试验台"整理成"干净的长期平台层"。不加新功能，只做结构性整理。

### 4.1 冻结 W4 day33 为 W5 基线

- 锁定 `wave4-artifacts/day33` 配置为 W5 回归基准
- 复制评测数据集为 `retrieval-w5-baseline.v1.snapshot.json`
- 后续所有改动必须通过此基线的回归测试

### 4.2 Bridge 层拆分

当前 `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts` 超过 3000 行，同时承担路由、融合、回退、诊断、上下文拼装等 6 个职责。这是 W4 审计报告指出的最大设计缺陷。

**拆分方案：**

| 模块             | 文件路径                       | 职责                                 | 状态         |
| ---------------- | ------------------------------ | ------------------------------------ | ------------ |
| 路由决策         | `router/read-router.ts`        | 查询分类 + 路由决策                  | 已存在       |
| 精确 key 检测    | `router/query-signature.ts`    | precision guard                      | 已存在       |
| 候选归一化       | `fusion/normalize.ts`          | 分数归一化 + 去重                    | 已存在       |
| **RRF 融合排序** | `fusion/rank.ts`               | **新建**，替代 weight-based 融合     | Phase 1 新增 |
| **回退链**       | `fallback/fallback-chain.ts`   | **新建**，回退逻辑 + circuit breaker | Phase 1 新增 |
| **上下文装配**   | `context/context-assembler.ts` | **新建**，上下文拼装模板             | Phase 1 新增 |
| 搜索工具         | `tools/memory-search-tool.ts`  | 瘦化为薄调度层，只做组装调用         | 大幅瘦身     |

**拆分原则：**

- 每个新模块独立可测
- memory-search-tool.ts 最终只做"接参数 → 调度各模块 → 拼结果"
- 所有现有 trace（routeTrace / fallbackTrace / guardTrace）保留

### 4.3 融合算法升级：weight-based → RRF

**问题**: 当前 local (SQLite cosine)、Mem0 (Qdrant score)、Graphiti (rank_score) 三种不同量纲的分数通过 weight 线性缩放后直接排序，这是设计层面的缺陷。

**方案**: 引入 Reciprocal Rank Fusion (RRF)，这是 Graphiti 官方自己使用的混合搜索融合策略。RRF 不依赖原始分数的量纲和分布，只依赖排名位置：

```typescript
/**
 * Reciprocal Rank Fusion
 * score(d) = sum(1 / (k + rank_i(d))) for each source ranking
 * k = 60 (standard constant to prevent high-ranked items from dominating)
 */
function reciprocalRankFusion(
  rankings: Array<{ source: BridgeRoute; results: RankedCandidate[] }>,
  k?: number,
): RankedCandidate[];
```

**保留**: 现有 FUSION_POLICY_PRESETS 中的 quota 机制（控制每个 source 的最大贡献数量），但 weight 机制由 RRF 替代。

### 4.4 Graphiti group_ids 接入

审计发现当前 Graphiti 搜索未使用 `group_ids` 参数，导致搜索空间未收窄。

**方案**: 在 `mem0-client.ts` 的 `toSearchBody` 中，当有明确的 project/user scope 时，传递 `group_ids` 参数约束 Graphiti 搜索范围。

**预期收益**: 官方文档明确 group_id 可缩小搜索范围并提升查询性能。

### 4.5 Neo4j 连接策略文档化

当前 `scripts/memory-stack/common.sh` 中的 `normalize_neo4j_uri()` 会将 Aura 的 `neo4j+s://` 自动改为 `bolt+s://`，这是为了压住路由解析抖动的本地兜底修复，但偏离了 Neo4j 官方对 Aura 的推荐方案。

**方案**:

1. 将此 workaround 文档化为显式部署策略（而非隐式脚本行为）
2. 记录 DNS routing table 刷新问题的现象和根因
3. 评估回归 `neo4j+s://` 的可行性
4. 如果短期无法回归，在文档中明确标注为"已知偏离"

**产出**: `docs/operations/neo4j-aura-connection-strategy.md`

### Phase 1 Gate: 回归测试通过

- W5 基线数据集回归通过（Top1 / FUR / p95 不劣于 W4 day33）
- memory-search-tool.ts 行数降至 < 500 行
- RRF 替代 weight-based 后质量不降
- 无新增 P0 bug

---

## 五、Phase 2: Ontology 治理层（第 3-5 周）

**目标**: 建立 PostgreSQL 治理层，让记忆从"黑盒存储"变成"可治理的 Ontology Objects"。对标 super-jarvis 文档的 P0 核心能力。

### 5.1 PostgreSQL 治理 Schema

参照 Palantir Ontology 的 Object/Property/Link 概念 + `11-memory-knowledge-management-research.md` 的表设计：

```sql
-- Object Registry: 每条记忆的 canonical 身份
CREATE TABLE memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id TEXT NOT NULL,                    -- oc_user_id
  source TEXT NOT NULL,                      -- 'local' | 'mem0' | 'graphiti'
  source_ref TEXT,                           -- 源系统中的 ID (mem0 memory id / graphiti entity id)
  object_type TEXT NOT NULL DEFAULT 'fact',  -- 'fact' | 'preference' | 'project' | 'task' | 'decision'
  content TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,               -- 0-1
  status TEXT DEFAULT 'active',              -- 'active' | 'frozen' | 'expired' | 'deleted'
  tags TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_items_owner ON memory_items(owner_id);
CREATE INDEX idx_memory_items_source ON memory_items(source);
CREATE INDEX idx_memory_items_type ON memory_items(object_type);
CREATE INDEX idx_memory_items_status ON memory_items(status);

-- 变更事件流 (Palantir: 所有变更可审计)
CREATE TABLE memory_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  action TEXT NOT NULL,          -- 'ADD' | 'UPDATE' | 'DELETE' | 'FREEZE' | 'UNFREEZE'
  actor TEXT NOT NULL,           -- 'system' | 'user' | 'agent:<agent_id>'
  changes JSONB,                -- { before: {...}, after: {...} }
  reason TEXT,                   -- 人类可读的变更原因
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_events_memory ON memory_events(memory_id);
CREATE INDEX idx_memory_events_action ON memory_events(action);

-- 关系 (Palantir: Link Types)
CREATE TABLE memory_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  to_id UUID NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
  link_type TEXT NOT NULL,       -- 'related_to' | 'caused_by' | 'part_of' | 'contradicts' | 'has_task'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_memory_links_from ON memory_links(from_id);
CREATE INDEX idx_memory_links_to ON memory_links(to_id);
CREATE INDEX idx_memory_links_type ON memory_links(link_type);
```

**设计决策**:

- PG 是治理层（事实源头），不做向量检索（向量留在 Qdrant）
- 每条记忆在三路存储中有实际数据，在 PG 中有 canonical 注册
- `source_ref` 字段建立 OpenClaw canonical ID → 源系统 ID 的映射
- 所有变更通过 `memory_events` 表记录，支持审计和回溯

### 5.2 Memory Management API

对应 super-jarvis `03-priority-roadmap.md` P0-1，参考 `04-super-jarvis-design.md` 的 schema。

**接口定义：**

```typescript
interface MemoryManagementAPI {
  /** 列出用户的所有记忆，支持过滤和分页 */
  listMemories(userId: string, filters?: MemoryFilters): Promise<MemoryListResult>;

  /** 获取单条记忆详情，含审计日志 */
  getMemory(memoryId: string): Promise<MemoryDetail>;

  /** 更新记忆内容/标签/置信度 */
  updateMemory(memoryId: string, updates: MemoryUpdate): Promise<Memory>;

  /** 删除记忆（支持 cascade 删除关联） */
  deleteMemory(memoryId: string, cascade?: boolean): Promise<void>;

  /** 冻结记忆（不再被自动更新，但仍可被检索） */
  freezeMemory(memoryId: string): Promise<void>;

  /** 解冻记忆 */
  unfreezeMemory(memoryId: string): Promise<void>;

  /** 获取记忆的审计日志 */
  getMemoryAuditLog(memoryId: string): Promise<AuditLogEntry[]>;
}

interface MemoryFilters {
  source?: "local" | "mem0" | "graphiti";
  objectType?: "fact" | "preference" | "project" | "task" | "decision";
  status?: "active" | "frozen" | "expired" | "deleted";
  confidenceMin?: number;
  confidenceMax?: number;
  tags?: string[];
  search?: string; // 全文搜索
  createdAfter?: string;
  createdBefore?: string;
  limit?: number;
  offset?: number;
}

interface Memory {
  id: string; // OpenClaw canonical ID
  source: string;
  sourceRef?: string;
  objectType: string;
  content: string;
  confidence: number;
  status: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}
```

**实现路径**: `extensions/memory-mem0-graphiti-bridge/src/governance/memory-api.ts`

**CRUD 联动**:

- `updateMemory` → 更新 PG → 如果 source=mem0，同步更新 Mem0 → 如果 source=graphiti，同步更新 Graphiti
- `deleteMemory` → 标记 PG status='deleted' → 同步删除 Mem0/Graphiti → 记录 DELETE 事件
- `freezeMemory` → 标记 PG status='frozen' → 记录 FREEZE 事件 → 写路径中 Admission Control 不再更新此条

### 5.3 置信度评分

对应 super-jarvis `03-priority-roadmap.md` P0-2。

**四因子模型：**

```typescript
interface ConfidenceScore {
  value: number; // 0-1, 四因子加权
  factors: {
    sourceReliability: number; // 来源可靠性 (user=1.0, agent=0.8, system=0.6)
    consistency: number; // 与已有记忆的一致性 (语义相似度检查)
    recency: number; // 时效性 (半衰期衰减)
    evidenceStrength: number; // 证据强度 (有明确上下文=1.0, 推断=0.5)
  };
  threshold: "high" | "medium" | "low";
}
```

**阈值与行为：**

| 置信度 | 阈值      | 行为                   |
| ------ | --------- | ---------------------- |
| 高     | >= 0.8    | 直接使用，注入 context |
| 中     | 0.5 - 0.8 | 标注"参考"，注入但降权 |
| 低     | < 0.5     | 仅展示，不注入 context |

**实现路径**: `extensions/memory-mem0-graphiti-bridge/src/governance/confidence-scorer.ts`

### 5.4 冲突检测

对应 super-jarvis `03-priority-roadmap.md` P0-4。依赖 P0-1（API）和 P0-2（置信度）。

**三种冲突类型：**

| 类型          | 说明                       | 处理策略                                                 |
| ------------- | -------------------------- | -------------------------------------------------------- |
| contradiction | 新记忆与已有记忆矛盾       | confidence > 0.8 → 询问用户; <= 0.8 → 选择更高置信度版本 |
| update        | 新记忆是已有记忆的更新版本 | 自动替换，记录 UPDATE 事件                               |
| duplicate     | 新记忆与已有记忆重复       | 自动去重，保留更完整的版本                               |

**检测方法：**

- 语义相似度（通过 embedding 余弦距离）
- 实体对比（提取关键实体后比较）
- 时间窗口（近期记忆优先检查冲突）

**实现路径**: `extensions/memory-mem0-graphiti-bridge/src/governance/conflict-detector.ts`

### 5.5 CLI 命令

对应 super-jarvis `04-super-jarvis-design.md` 的 CLI 设计：

```bash
# 记忆治理
openclaw memory list                      # 列出所有记忆
openclaw memory list --source mem0        # 按来源过滤
openclaw memory list --type preference    # 按类型过滤
openclaw memory search "深色模式"         # 语义搜索
openclaw memory get <memory-id>           # 查看详情 + 审计日志
openclaw memory edit <memory-id>          # 编辑内容/标签
openclaw memory delete <memory-id>        # 删除
openclaw memory freeze <memory-id>        # 冻结
openclaw memory unfreeze <memory-id>      # 解冻

# 用户画像
openclaw memory profile                   # 查看用户画像
openclaw memory profile edit              # 编辑画像

# 记忆统计
openclaw memory stats                     # 记忆数量/分布/质量统计
```

### Phase 2 Gate (Gate-P0)

| 指标           | 阈值                            |
| -------------- | ------------------------------- |
| API 可用性     | >= 99%                          |
| 删除操作 p95   | < 5s                            |
| 冲突检测准确率 | >= 80%                          |
| 冲突误报率     | <= 10%                          |
| 用户纠错率     | >= 5%（说明用户在使用治理功能） |
| 高置信度准确率 | >= 95%                          |
| NPS            | >= 8/10                         |
| P0 bug         | 0                               |

---

## 六、Phase 3: 项目上下文 + 高级检索（第 6-8 周）

**目标**: 让 OpenClaw 能跨会话、跨渠道保持项目上下文，让记忆检索从"有什么给什么"升级到"围绕项目聚焦给"。

### 6.1 Project/Task 实体建模

参照 Palantir 的 Object Type 概念 + super-jarvis `04-super-jarvis-design.md` 的设计：

```typescript
interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "completed";
  participants: Array<{ userId: string; role: "owner" | "collaborator" | "viewer" }>;
  channels: Array<{ type: string; channelId: string; threadId?: string }>;
  tasks: string[]; // Task IDs
  memories: string[]; // 关联的记忆 IDs
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "critical";
  assignee?: string;
  dueDate?: string;
  dependencies: string[]; // 依赖的 Task IDs
  relatedMemories: string[]; // 关联的记忆 IDs
  createdAt: string;
  updatedAt: string;
}
```

**存储策略**:

- Project/Task 作为 Graphiti Entity（利用 group_id 做项目级命名空间）
- 同时在 PG 治理层注册为 `memory_items`（object_type='project' / 'task'）
- 关系通过 `memory_links` 建模（`has_task` / `related_to` / `part_of`）

### 6.2 自动项目识别

从对话中自动识别当前关联的项目：

```typescript
interface CrossChannelContextSync {
  /** 从消息内容和渠道信息识别关联项目 */
  identifyProject(params: {
    message: string;
    channelType: string;
    channelId: string;
    threadId?: string;
  }): Promise<{ projectId?: string; confidence: number; reason: string }>;

  /** 将项目上下文注入到当前线程 */
  injectProjectContext(params: { projectId: string; threadId: string }): Promise<void>;

  /** 记录跨渠道活动 */
  recordCrossChannelActivity(params: {
    projectId: string;
    channelType: string;
    channelId: string;
    activity: string;
  }): Promise<void>;
}
```

**Phase 1 实现**: 基于关键词匹配和渠道/线程映射
**后续升级方向**: 基于 embedding 的项目识别

### 6.3 Graphiti 高级检索

对应 super-jarvis `03-priority-roadmap.md` P1-1。直接利用 Graphiti 的官方高级搜索能力：

```typescript
interface AdvancedSearchStrategy {
  /** focal-node rerank: 围绕指定实体重新聚焦结果 */
  focalNodeRerank(params: {
    query: string;
    focalNodeId: string;
    maxDistance: number;
  }): Promise<SearchResult[]>;

  /** search recipes: 使用 Graphiti 官方搜索策略 */
  searchRecipe(params: {
    recipe: "temporal_facts" | "entity_relationships" | "community_context";
    query: string;
    options?: Record<string, unknown>;
  }): Promise<SearchResult[]>;

  /** searchInGroup: 利用 group_id 约束搜索范围 */
  searchInGroup(params: { groupId: string; query: string }): Promise<SearchResult[]>;
}
```

**实现路径**: `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-advanced-search.ts`

### 6.4 上下文装配层

对应 super-jarvis `09-self-hosted-zep-features-roadmap.md` P0-2 的 Context Assembly 设计。

将记忆检索结果按模板组装为 LLM 可消费的上下文块：

```typescript
interface ContextAssembler {
  assemble(params: {
    threadId: string;
    query: string;
    template: "exact_id" | "decision_reason" | "temporal_relation" | "project_context";
  }): Promise<AssembledContext>;
}

interface AssembledContext {
  blocks: Array<{
    type: "user_profile" | "project_context" | "recent_messages" | "related_facts" | "timeline";
    content: string;
    source: "local" | "mem0" | "graphiti";
    confidence: number;
  }>;
  metadata: {
    retrievalLatencyMs: number;
    sourcesUsed: string[];
    totalTokens: number;
    template: string;
  };
}
```

**四种装配模板：**

| 模板                | 主力源          | 组装策略                                  |
| ------------------- | --------------- | ----------------------------------------- |
| `exact_id`          | Local           | 直出，不做融合                            |
| `decision_reason`   | Graphiti + Mem0 | Graphiti 因果链 + Mem0 事实补充           |
| `temporal_relation` | Graphiti        | Graphiti 时间线 + 相关事实                |
| `project_context`   | 三路融合        | 项目实体 + 任务状态 + 相关记忆 + 最近消息 |

### Phase 3 Gate (Gate-P1)

| 指标             | 阈值                    |
| ---------------- | ----------------------- |
| 项目上下文命中率 | >= 70%                  |
| 跨会话保持率     | >= 80%                  |
| 时序 Top1 提升   | >= 10pp vs Phase 1 基线 |
| 项目 FUR 提升    | >= 15pp                 |
| p95 增幅         | <= 10% vs Phase 1 基线  |

---

## 七、Phase 4: 主动智能 + 持续进化（第 9 周+）

**目标**: 从"被动响应记忆查询"进化到"主动提供智能支撑"

### 7.1 主动提醒引擎

对应 super-jarvis `04-super-jarvis-design.md` 的 Proactive Reminder 设计：

**提醒类型：**

| 类型             | 触发条件                 | 示例                                    |
| ---------------- | ------------------------ | --------------------------------------- |
| task_due         | 任务临近截止日期         | "chelingxi-os 的 v2.0 发布计划明天到期" |
| task_blocked     | 任务被阻塞超过阈值       | "API 重构任务已阻塞 3 天"               |
| project_inactive | 项目长期无活动           | "openclaw-web 项目已 2 周未更新"        |
| follow_up        | 对话中承诺的后续动作     | "上周你说要检查部署日志"                |
| context_relevant | 当前上下文相关的历史信息 | "你之前在这个项目上遇到过类似问题"      |

**打扰控制：**

```typescript
interface InterruptionLimits {
  maxRemindersPerHour: 3;
  maxRemindersPerDay: 10;
  minIntervalBetweenReminders: 300; // 秒
  doNotDisturbPeriods: Array<{ day: string; start: string; end: string }>;
}
```

### 7.2 记忆质量监控

周度指标追踪：

| 指标         | P0     | P1       | P2       |
| ------------ | ------ | -------- | -------- |
| 记忆命中率   | >= 70% | >= 80%   | >= 85%   |
| 误召回率     | <= 20% | <= 15%   | <= 10%   |
| 高置信度占比 | >= 60% | —        | —        |
| 低置信度占比 | <= 10% | —        | —        |
| 检索延迟 p95 | <= 2s  | <= 1.5s  | <= 1s    |
| 可用性       | >= 99% | >= 99.5% | >= 99.9% |

### 7.3 Admission Control 默认启用

当前 `admission_enabled=false` 是默认值。Phase 2 置信度评分就绪后，将默认值切为 `true`。

**准入规则：**

- `confidence < 0.5` → 拒绝写入
- 冲突检测为 `contradiction` 且无法自动消解 → 暂存待用户确认
- 敏感数据检测命中 → 拒绝或脱敏后写入

### 7.4 Ontology 持续演进方向

参照 Palantir Ontology 的 Object Type 概念 + `analysis/2026-03-05-palantir-ontology-deep-research.md` 第十一部分的个人 Ontology 设计：

| Object Type       | 对标 Palantir       | 存储层                       | Phase   |
| ----------------- | ------------------- | ---------------------------- | ------- |
| Person (联系人)   | Object Type         | Graphiti Entity + PG         | P2      |
| Project (项目)    | Object Type         | Graphiti Entity + PG         | Phase 3 |
| Task (任务)       | Object Type         | Graphiti Entity + PG         | Phase 3 |
| Decision (决策)   | Object Type + Links | Graphiti Entity + Links + PG | P2      |
| Preference (偏好) | Property            | Mem0 + PG                    | Phase 2 |
| Fact (事实)       | Property            | Mem0 + PG                    | Phase 2 |
| Document (文档)   | Object Type         | Local + PG                   | P2      |
| Channel (渠道)    | Object Type         | PG                           | Phase 3 |

长期目标：每新增一个 Object Type 都有 TypeScript Schema 定义并纳入版本管理（参照 Palantir 的 OSDK 强类型设计）。

---

## 八、关键架构决策

| 决策          | 选择                                            | 理由                                              | 替代方案与放弃原因                     |
| ------------- | ----------------------------------------------- | ------------------------------------------------- | -------------------------------------- |
| 向量存储      | 保持 Qdrant                                     | 性能好且已跑通，不换 pgvector                     | pgvector 性能不如 Qdrant，且迁移成本高 |
| 治理存储      | PostgreSQL                                      | 长期事实源头，Ontology Object Registry            | SQLite 不适合做多进程共享的事实源头    |
| 图存储        | Neo4j (Aura)                                    | Graphiti 后端，保持现有                           | FalkorDB 可做长期替代评估              |
| 本地存储      | SQLite                                          | 零依赖，快速，回退锚点                            | 不变                                   |
| 融合算法      | RRF                                             | 跨源分数无关，Graphiti 官方方案                   | weight-based 有跨源不可比缺陷          |
| Mem0 角色     | 保留                                            | 语义记忆 CRUD + 治理承载，后续治理 API 的实现载体 | 砍掉会堵死治理/profile 演进路线        |
| Graphiti 角色 | 保留                                            | 不可替代的时序/图能力 + 项目上下文承载            | 砍掉丧失时序推理能力                   |
| 上游依赖管理  | Phase 1 先保持 patching，P1 迁移到 fork/adapter | 短期 patching 可工作，长期需正式化                | —                                      |

---

## 九、风险与缓解

参照 super-jarvis `08-risk-mitigation.md`：

| ID  | 风险                   | 影响     | 概率   | 缓解措施                                                    |
| --- | ---------------------- | -------- | ------ | ----------------------------------------------------------- |
| R1  | 记忆污染与错误固化     | Critical | High   | Phase 2: Admission Control + 置信度 + 冲突检测 + 用户可编辑 |
| R2  | 跨会话上下文丢失       | Critical | High   | Phase 3: 项目上下文层 + 跨渠道同步                          |
| R3  | 延迟劣化               | High     | Medium | Phase 1: RRF + group_ids; Phase 4: Smart Caching            |
| R4  | Mem0/Graphiti 服务故障 | High     | Medium | 保持 Local fallback + Phase 1: circuit breaker              |
| R5  | PG 引入增加运维复杂度  | Medium   | Medium | 先用 SQLite 做 PG 表的原型验证，确认 schema 后再切 PG       |
| R6  | Solo 执行带宽不足      | High     | Medium | Phase 分阶段交付，每 phase 有明确 Gate，不跨 phase 并行     |
| R7  | Bridge 拆分引入回归    | Medium   | Medium | Phase 1 首先冻结基线，拆分后必须通过回归测试                |

---

## 十、执行节奏与 Gate 验收

### 10.1 总体节奏

| 阶段        | 时间      | 核心产出                                         | Gate         |
| ----------- | --------- | ------------------------------------------------ | ------------ |
| **Phase 1** | 第 1-2 周 | Bridge 拆分 + RRF + group_ids + 连接策略文档化   | 回归测试通过 |
| **Phase 2** | 第 3-5 周 | PG 治理层 + Memory API + CLI + 置信度 + 冲突检测 | Gate-P0      |
| **Phase 3** | 第 6-8 周 | 项目上下文 + 高级检索 + 上下文装配               | Gate-P1      |
| **Phase 4** | 第 9 周+  | 主动提醒 + 质量监控 + Ontology 演进              | 持续         |

### 10.2 每 Phase 的交付纪律

1. **Phase 开始前**: 冻结上一 Phase 的基线，确认 Gate 通过
2. **Phase 进行中**: 每个子任务有独立的验收标准
3. **Phase 结束时**: Gate 评审，所有指标达标后才进入下一 Phase
4. **回归保护**: 每次改动都要通过 W5 基线回归测试

### 10.3 Solo + AI Agents 执行策略

- AI Agents 负责：代码实现、测试编写、回归验证、文档生成
- 人类负责：方向决策、Gate 评审、用户体验验收、优先级调整
- 不跨 Phase 并行——每个 Phase 是一个完整的"证明有效 → 收口"循环

---

## 附录 A: 依赖关系图

```
Phase 1 (地基加固)
  ├── 1.1 冻结基线
  ├── 1.2 Bridge 拆分 ──────────────────────────────────────┐
  ├── 1.3 RRF 融合 ←── 依赖 1.2 (fusion/rank.ts)           │
  ├── 1.4 group_ids 接入                                    │
  └── 1.5 Neo4j 连接文档                                    │
                                                            │
Phase 2 (治理层) ←── 依赖 Phase 1 Gate 通过                   │
  ├── 2.1 PG Schema                                        │
  ├── 2.2 Memory API ←── 依赖 2.1                           │
  ├── 2.3 置信度评分                                         │
  ├── 2.4 冲突检测 ←── 依赖 2.2 + 2.3                       │
  └── 2.5 CLI 命令 ←── 依赖 2.2                             │
                                                            │
Phase 3 (项目上下文) ←── 依赖 Phase 2 Gate 通过               │
  ├── 3.1 Project/Task 实体 ←── 依赖 2.1 (PG schema)       │
  ├── 3.2 自动项目识别 ←── 依赖 3.1                          │
  ├── 3.3 高级检索 ←── 依赖 1.4 (group_ids)                 │
  └── 3.4 上下文装配 ←── 依赖 1.2 (context-assembler.ts) ───┘

Phase 4 (主动智能) ←── 依赖 Phase 3 Gate 通过
  ├── 4.1 主动提醒 ←── 依赖 3.1 (Project/Task)
  ├── 4.2 质量监控 ←── 依赖 2.3 (置信度)
  └── 4.3 Admission Control ←── 依赖 2.3 + 2.4
```

## 附录 B: 文件路径规划

### Bridge 扩展内的新增/改动文件

```
extensions/memory-mem0-graphiti-bridge/
├── src/
│   ├── router/
│   │   ├── read-router.ts          (已存在)
│   │   └── query-signature.ts      (已存在)
│   ├── fusion/
│   │   ├── normalize.ts            (已存在)
│   │   └── rank.ts                 (Phase 1 新建: RRF 融合)
│   ├── fallback/
│   │   └── fallback-chain.ts       (Phase 1 新建: 回退链 + circuit breaker)
│   ├── context/
│   │   └── context-assembler.ts    (Phase 1 新建: 上下文装配)
│   ├── governance/
│   │   ├── memory-api.ts           (Phase 2 新建: Memory Management API)
│   │   ├── confidence-scorer.ts    (Phase 2 新建: 置信度评分)
│   │   ├── conflict-detector.ts    (Phase 2 新建: 冲突检测)
│   │   └── pg-client.ts            (Phase 2 新建: PostgreSQL 客户端)
│   ├── project/
│   │   ├── project-manager.ts      (Phase 3 新建: 项目实体管理)
│   │   ├── task-manager.ts         (Phase 3 新建: 任务管理)
│   │   └── project-identifier.ts   (Phase 3 新建: 自动项目识别)
│   ├── client/
│   │   ├── mem0-client.ts          (已存在, Phase 1 改动: group_ids)
│   │   ├── graphiti-client.ts      (已存在)
│   │   └── graphiti-advanced-search.ts (Phase 3 新建: 高级检索)
│   ├── proactive/
│   │   ├── reminder-engine.ts      (Phase 4 新建: 主动提醒)
│   │   └── interruption-control.ts (Phase 4 新建: 打扰控制)
│   └── tools/
│       ├── memory-search-tool.ts   (Phase 1 大幅瘦身)
│       └── memory-get-tool.ts      (已存在)
```

### 其他位置的新增文件

```
# CLI 命令
src/commands/memory.ts              (Phase 2 新建: openclaw memory 子命令)

# 文档
docs/operations/neo4j-aura-connection-strategy.md    (Phase 1 新建)
docs/operations/memory-governance.md                 (Phase 2 新建)

# 数据库迁移
scripts/memory-stack/migrations/001-governance-schema.sql  (Phase 2 新建)

# 评测
analysis/2026-02-24-mem0-graphiti-value-maximization/wave5-artifacts/
    retrieval-w5-baseline.v1.snapshot.json            (Phase 1 新建)
```

---

> **本文档为设计计划方案，待确认后进入执行。**
> **执行时将逐 Phase 推进，每 Phase 有独立的 Gate 验收。**
