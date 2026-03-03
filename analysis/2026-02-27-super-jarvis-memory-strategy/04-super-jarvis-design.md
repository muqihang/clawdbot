# "超级贾维斯"能力设计建议

> **版本**: V1.0  
> **日期**: 2026-03-02  
> **目标**: 让 OpenClaw 成为真正的长期协作助手

---

## 1. 用户画像与偏好记忆（可编辑、可纠错、可追溯）

### 1.1 核心设计原则

**透明性优先**：用户必须能够清楚地看到助手记住了什么  
**可控性优先**：用户必须能够编辑、删除任何记忆  
**可追溯性优先**：用户必须能够追溯记忆的来源

### 1.2 用户画像结构

```typescript
/**
 * 用户画像：结构化的用户信息
 */
interface UserProfile {
  userId: string;

  // 基础信息
  basics: {
    name?: string;
    role?: string; // "全栈工程师"
    timezone?: string;
    preferredLanguage?: string;
  };

  // 工作偏好
  workPreferences: {
    codingStyle?: string; // "函数式编程"
    frameworks?: string[]; // ["React", "Node.js"]
    tools?: string[]; // ["VSCode", "Git"]
    workingHours?: {
      start: string; // "09:00"
      end: string; // "18:00"
      timezone: string;
    };
  };

  // 沟通偏好
  communicationPreferences: {
    responseStyle?: string; // "简洁" | "详细"
    notificationChannels?: {
      urgent: string[]; // ["telegram"]
      normal: string[]; // ["discord", "email"]
    };
    doNotDisturb?: {
      enabled: boolean;
      schedule: Array<{
        day: string;
        start: string;
        end: string;
      }>;
    };
  };

  // 项目上下文
  activeProjects: string[]; // project_ids

  // 元信息
  metadata: {
    createdAt: string;
    updatedAt: string;
    lastReviewedAt?: string; // 用户最后一次查看画像的时间
  };
}
```

### 1.3 记忆编辑界面设计

#### Web UI 设计（参考）

```
┌─────────────────────────────────────────────────┐
│ 我的记忆管理                                     │
├─────────────────────────────────────────────────┤
│ 🔍 搜索记忆...                                   │
├─────────────────────────────────────────────────┤
│ 📋 用户画像                                      │
│   ├─ 基础信息                                    │
│   │   └─ 角色: 全栈工程师 [编辑]                │
│   ├─ 工作偏好                                    │
│   │   └─ 编程风格: 函数式编程 [编辑]            │
│   └─ 沟通偏好                                    │
│       └─ 响应风格: 简洁 [编辑]                  │
├─────────────────────────────────────────────────┤
│ 💭 记忆列表 (按时间倒序)                         │
│                                                  │
│ [2026-03-01] 用户偏好深色模式                    │
│   来源: Telegram 对话 #12345                     │
│   置信度: ⭐⭐⭐⭐⭐ (高)                          │
│   [查看详情] [编辑] [删除]                       │
│                                                  │
│ [2026-02-28] 用户正在开发认证系统                │
│   来源: Discord 对话 #67890                      │
│   置信度: ⭐⭐⭐⭐ (中高)                         │
│   关联项目: 认证系统项目                         │
│   [查看详情] [编辑] [删除]                       │
│                                                  │
│ [2026-02-25] 用户喜欢 React 框架                 │
│   来源: Slack 对话 #11111                        │
│   置信度: ⭐⭐⭐⭐⭐ (高)                          │
│   [查看详情] [编辑] [删除]                       │
└─────────────────────────────────────────────────┘
```

#### CLI 命令设计

```bash
# 查看所有记忆
openclaw memory list

# 搜索记忆
openclaw memory search "深色模式"

# 查看单条记忆详情
openclaw memory get <memory-id>

# 编辑记忆
openclaw memory edit <memory-id>

# 删除记忆
openclaw memory delete <memory-id>

# 查看用户画像
openclaw memory profile

# 编辑用户画像
openclaw memory profile edit
```

### 1.4 记忆追溯设计

每条记忆必须包含完整的溯源信息：

```typescript
interface MemoryAuditLog {
  memoryId: string;
  events: Array<{
    type: "created" | "updated" | "deleted" | "accessed";
    timestamp: string;
    source: {
      type: "conversation" | "user_edit" | "system_merge";
      conversationId?: string;
      channelType?: string; // "telegram" | "discord"
      messageId?: string;
    };
    changes?: {
      before: string;
      after: string;
    };
    reason?: string; // "用户纠正" | "自动去重"
  }>;
}
```

---

## 2. 项目/任务持续上下文（跨会话、跨渠道、跨设备）

### 2.1 项目实体建模

```typescript
/**
 * 项目实体：长期协作的核心单元
 */
interface Project {
  id: string;
  name: string;
  description: string;

  // 参与者
  participants: Array<{
    userId: string;
    role: "owner" | "collaborator" | "viewer";
    joinedAt: string;
  }>;

  // 跨渠道追踪
  channels: Array<{
    type: "telegram" | "discord" | "slack" | "web";
    channelId: string;
    threadId?: string;
  }>;

  // 项目状态
  status: "planning" | "active" | "paused" | "completed" | "archived";

  // 关联的记忆与任务
  memories: string[]; // memory_ids
  tasks: Task[];

  // 项目里程碑
  milestones: Array<{
    id: string;
    title: string;
    dueDate?: string;
    status: "pending" | "completed";
    completedAt?: string;
  }>;

  // 元信息
  metadata: {
    createdAt: string;
    updatedAt: string;
    lastActivityAt: string;
    tags: string[]; // ["backend", "authentication"]
  };
}

/**
 * 任务实体：项目的可执行单元
 */
interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;

  // 任务状态
  status: "todo" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";

  // 分配与时间
  assignee?: string; // userId
  dueDate?: string;
  estimatedHours?: number;

  // 依赖关系
  dependencies: string[]; // task_ids
  blockedBy?: string[]; // task_ids

  // 关联记忆
  relatedMemories: string[]; // memory_ids
  relatedConversations: Array<{
    channelType: string;
    conversationId: string;
    messageIds: string[];
  }>;

  // 元信息
  metadata: {
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
  };
}
```

### 2.2 跨会话上下文保持

**场景示例**：

```
[Telegram - 周一 10:00]
用户："帮我设计一个用户认证系统"
助手："好的，我们来讨论方案..."
[创建项目: "用户认证系统"]

[Discord - 周三 14:00]
用户："上次讨论的认证系统，我们选哪个方案？"
助手："根据周一在 Telegram 的讨论，我们倾向于方案 A（JWT + Refresh Token）..."
[自动关联到项目: "用户认证系统"]

[Web - 周五 16:00]
用户："认证系统的进度如何？"
助手："项目进展：
  ✅ 方案设计（周一完成）
  🔄 数据库设计（进行中）
  ⏳ API 实现（待开始）"
[从项目上下文中提取进度]
```

### 2.3 跨渠道同步机制

```typescript
/**
 * 跨渠道上下文同步器
 */
interface CrossChannelContextSync {
  /**
   * 识别当前对话是否关联到已有项目
   */
  identifyProject(params: {
    userId: string;
    channelType: string;
    message: string;
    conversationHistory: Message[];
  }): Promise<{
    projectId?: string;
    confidence: number;
    reason: string;
  }>;

  /**
   * 同步项目上下文到当前会话
   */
  syncProjectContext(params: {
    projectId: string;
    targetChannel: string;
    conversationId: string;
  }): Promise<void>;

  /**
   * 记录跨渠道活动
   */
  recordCrossChannelActivity(params: {
    projectId: string;
    fromChannel: string;
    toChannel: string;
    timestamp: string;
  }): Promise<void>;
}
```

---

## 3. 主动提醒与时机感知（不过度打扰）

### 3.1 主动提醒类型

```typescript
/**
 * 主动提醒类型
 */
type ReminderType =
  | "task_due" // 任务即将到期
  | "task_blocked" // 任务被阻塞
  | "project_inactive" // 项目长期无活动
  | "follow_up" // 需要跟进的对话
  | "context_relevant" // 上下文相关的建议
  | "milestone_approaching"; // 里程碑临近

interface ProactiveReminder {
  id: string;
  type: ReminderType;
  priority: "low" | "medium" | "high" | "urgent";

  // 提醒内容
  title: string;
  message: string;
  actionable: boolean; // 是否需要用户操作
  suggestedActions?: Array<{
    label: string;
    action: string;
  }>;

  // 关联实体
  relatedProject?: string;
  relatedTask?: string;
  relatedMemory?: string;

  // 时机控制
  timing: {
    scheduledAt: string;
    expiresAt?: string;
    canSnooze: boolean;
  };

  // 渠道路由
  channels: Array<{
    type: string;
    priority: number; // 1=首选，2=备选
  }>;
}
```

### 3.2 时机感知策略

```typescript
/**
 * 时机感知引擎
 */
interface TimingIntelligence {
  /**
   * 判断当前是否适合发送提醒
   */
  shouldSendNow(params: {
    userId: string;
    reminder: ProactiveReminder;
    currentTime: string;
  }): Promise<{
    shouldSend: boolean;
    reason: string;
    suggestedTime?: string; // 如果不适合，建议的时间
  }>;

  /**
   * 学习用户的活跃模式
   */
  learnUserPattern(params: {
    userId: string;
    activities: Array<{
      timestamp: string;
      channelType: string;
      activityType: "message" | "command" | "interaction";
    }>;
  }): Promise<UserActivityPattern>;
}

interface UserActivityPattern {
  userId: string;

  // 活跃时段
  activeHours: Array<{
    day: string; // "monday" | "tuesday" | ...
    start: string; // "09:00"
    end: string; // "18:00"
    confidence: number; // 0-1
  }>;

  // 渠道偏好
  channelPreferences: Array<{
    channelType: string;
    usageFrequency: number; // 每天平均使用次数
    preferredForUrgent: boolean;
  }>;

  // 响应模式
  responsePattern: {
    averageResponseTime: number; // 秒
    fastResponseHours: string[]; // ["09:00-12:00", "14:00-17:00"]
  };
}
```

### 3.3 打扰控制机制

```typescript
/**
 * 打扰控制策略
 */
interface InterruptionControl {
  /**
   * 计算打扰成本
   */
  calculateInterruptionCost(params: {
    userId: string;
    reminder: ProactiveReminder;
    currentContext: {
      isInConversation: boolean;
      lastActivityTime: string;
      currentChannel: string;
    };
  }): Promise<{
    cost: number; // 0-1，越高越不适合打扰
    factors: {
      timing: number; // 时间因素
      frequency: number; // 频率因素（最近已发送多少提醒）
      priority: number; // 优先级因素
      context: number; // 上下文因素（用户是否忙碌）
    };
  }>;

  /**
   * 应用打扰限制
   */
  applyRateLimit(params: { userId: string; channelType: string }): Promise<{
    allowed: boolean;
    reason: string;
    nextAllowedTime?: string;
  }>;
}

/**
 * 打扰限制配置
 */
interface InterruptionLimits {
  // 每小时最多提醒次数
  maxRemindersPerHour: number;

  // 每天最多提醒次数
  maxRemindersPerDay: number;

  // 两次提醒的最小间隔（秒）
  minIntervalBetweenReminders: number;

  // 勿扰时段
  doNotDisturbPeriods: Array<{
    day: string;
    start: string;
    end: string;
  }>;
}
```

---

## 4. 记忆可信度分级与冲突消解

### 4.1 可信度评分模型

```typescript
/**
 * 记忆可信度评分器
 */
interface MemoryConfidenceScorer {
  score(memory: MemoryCandidate): ConfidenceScore;
}

interface ConfidenceScore {
  value: number; // 0-1

  // 评分因子
  factors: {
    // 来源可靠性（0-1）
    sourceReliability: {
      score: number;
      reason: string;
      // 用户明确陈述 > 用户确认 > 推测
    };

    // 一致性（0-1）
    consistency: {
      score: number;
      reason: string;
      // 与历史记忆的一致性
    };

    // 新鲜度（0-1）
    recency: {
      score: number;
      reason: string;
      // 时间衰减：越新越可信
    };

    // 证据强度（0-1）
    evidenceStrength: {
      score: number;
      reason: string;
      // 多次确认 > 单次提及
    };
  };

  // 分级
  threshold: "high" | "medium" | "low";
}
```

---

## 5. 人类可控的记忆治理

### 5.1 记忆治理操作

- **查看**：列出所有记忆、搜索记忆、查看详情
- **编辑**：修改记忆内容、更新置信度、添加标签
- **删除**：软删除（标记为无效）、硬删除（级联清理）
- **冻结**：暂时禁用某条记忆（不参与检索）
- **过期策略**：设置记忆的有效期

### 5.2 记忆过期策略

```typescript
interface MemoryExpirationPolicy {
  // 自动过期规则
  autoExpiration: {
    enabled: boolean;
    rules: Array<{
      memoryType: string; // "preference" | "fact" | "decision"
      maxAge: number; // 天数
      action: "archive" | "delete" | "review";
    }>;
  };

  // 用户自定义过期
  customExpiration: {
    memoryId: string;
    expiresAt: string;
    action: "archive" | "delete" | "notify_user";
  };
}
```

---

## 6. 安全隔离与权限边界

### 6.1 记忆访问权限

```typescript
interface MemoryAccessControl {
  memoryId: string;

  // 可见性
  visibility: "private" | "team" | "public";

  // 访问控制列表
  acl: Array<{
    userId: string;
    permissions: Array<"read" | "write" | "delete">;
  }>;

  // 渠道隔离
  channelIsolation: {
    enabled: boolean;
    allowedChannels: string[]; // 只在这些渠道中可见
  };
}
```

### 6.2 敏感信息保护

```typescript
/**
 * 敏感信息检测器
 */
interface SensitiveDataDetector {
  detect(text: string): SensitiveDataMatch[];
}

interface SensitiveDataMatch {
  type: "password" | "api_key" | "email" | "phone" | "credit_card" | "ssn";
  value: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}

/**
 * 敏感信息处理策略
 */
interface SensitiveDataPolicy {
  // 检测到敏感信息时的动作
  action: "block" | "redact" | "warn";

  // 编辑策略
  redactionStrategy: "mask" | "remove" | "replace";

  // 审计
  auditSensitiveAccess: boolean;
}
```

---

## 7. 总结：六大核心能力

1. **用户画像与偏好记忆**：透明、可控、可追溯
2. **项目/任务持续上下文**：跨会话、跨渠道、跨设备
3. **主动提醒与时机感知**：智能、不打扰
4. **记忆可信度分级**：区分确定与推测
5. **记忆治理**：查看、编辑、删除、冻结、过期
6. **安全隔离**：权限控制、敏感信息保护
