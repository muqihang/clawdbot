# W0-03 身份映射规范（identity-map）

## 1) 执行元信息

- ArtifactID: `W0-03-IDENTITY-MAP-SPEC`
- Author: `子代理 #W0-03-Implementer / W0 Day1`
- Executed At (UTC): `2026-02-25T03:53:51Z`
- Executed At (Local): `2026-02-25T11:53:51+08:00`
- Timezone: `Asia/Shanghai (UTC+08:00, CST)`
- Scope: 仅产出 W0-03 规范文档；不改 `src/`、`extensions/`、`package.json`、锁文件。

证据：

- W0-03 任务定义与产物路径：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:137`
- W0-03 验收与回滚要求：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:148`
- W0-03 依赖 W0-02：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:140`

## 2) 渠道范围锁定（Gate 范围）

本规范的 Gate 范围严格锁定为 `CHAT_CHANNEL_ORDER` 全量 8 渠道（按代码顺序）：

1. `telegram`
2. `whatsapp`
3. `discord`
4. `irc`
5. `googlechat`
6. `slack`
7. `signal`
8. `imessage`

证据：

- `CHAT_CHANNEL_ORDER` 定义：`src/channels/registry.ts:7`
- 8 渠道条目：`src/channels/registry.ts:8`

## 3) 依赖基线与设计目标

### 3.1 W0-02 依赖基线（冻结态）

W0-03 的映射策略以 W0-02 冻结快照为前置基线，不改变当前写链路策略：

- `read_mode=primary`
- `write_mode=propose_only`
- `admission_enabled=true`
- `commit_canary_ratio=0.05`

证据：

- 基线冻结元信息与范围：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:11`
- 基线配置字段：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:31`

### 3.2 oc\_\* 映射目标（来自 V1 / V1.1）

本规范的目标是把 `oc_user_id / oc_thread_id / oc_message_id` 做成稳定、跨渠道可判定、冲突可裁决的统一语义层。

证据：

- Wave1 目标包含三元稳定映射：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:119`
- 最佳实践增补项要求三元映射：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md:173`
- V1.1 在 Wave0 中前置该映射项：`analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md:164`

## 4) 统一 ID 语义与格式规范

### 4.1 命名与版本

- `oc_user_id`：用户实体主键。
- `oc_thread_id`：会话/线程实体主键。
- `oc_message_id`：消息实体主键。

统一版本化格式：

- `channel` 固定枚举：`telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage`
- `oc_user_id` 可审计格式：`^ocu_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,127}$`
- `oc_thread_id` 可审计格式：`^oct_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$`
- `oc_message_id` 可审计格式：`^ocm_v1:(telegram|whatsapp|discord|irc|googlechat|slack|signal|imessage):[a-z0-9][a-z0-9:_\-.]{0,191}$`
- `oc_user_id` 样例：`ocu_v1:telegram:123456`、`ocu_v1:slack:u01aaa`
- `oc_thread_id` 样例：`oct_v1:discord:t999`、`oct_v1:googlechat:spaces_aaa_threads_bbb`
- `oc_message_id` 样例：`ocm_v1:slack:1719223910.123456`、`ocm_v1:imessage:987654321`

### 4.2 通用归一化规则（适用于三类 ID）

1. `channel` 必须来自 `CHAT_CHANNEL_ORDER`，且小写。
2. 源键做 `trim` 与空值剔除；不可解析则进入 fallback 规则。
3. 大小写不敏感来源（如 Slack/Discord/GoogleChat 用户前缀）按小写归一。
4. 复合键按确定顺序拼接，使用 `:` 分隔；禁止重排。
5. fallback 必须可复现（同输入同输出），优先使用结构化字段；若需正文参与，只能使用摘要哈希，不可存原文。

证据：

- 会话键构建已使用小写归一与 channel 命名空间：`src/routing/session-key.ts:158`
- 线程键构建采用标准化 threadId：`src/routing/session-key.ts:221`

### 4.3 `oc_user_id` 规范

- 生成输入：`channel` + 渠道不可变用户键（见第 5 章矩阵）。
- 归一化规则：
  - 手机号类统一到规范号码（如 Signal/iMessage/WhatsApp 可归一为 E.164）。
  - UUID/平台用户 ID 保留语义前缀（如 `uuid:`）。
  - 群聊中的 `sender display name` 仅作展示，不参与主键。
- 稳定性约束：
  - 显式优先“平台不可变 ID”而非昵称。
  - 跨渠道同值必须隔离（由 `channel` 命名空间保证）。
- 禁止项：
  - 禁止把用户名、群名、消息正文明文拼入 `oc_user_id`。
  - 禁止使用临时会话态字段（如随机 UUID、瞬时连接 ID）直接作为用户主键。

证据：

- Slack `SenderId` 使用 `message.user/bot_id`：`src/slack/monitor/message-handler/prepare.ts:112`
- Discord `SenderId` 使用不可变 `sender.id`：`src/discord/monitor/message-handler.process.ts:338`
- Signal 用户解析优先 `sourceNumber` 再 `sourceUuid`：`src/signal/identity.ts:30`
- iMessage sender 归一化：`src/imessage/targets.ts:33`

### 4.4 `oc_thread_id` 规范

- 生成输入：`channel` + 渠道线程键（群/私聊/频道/主题）。
- 归一化规则：
  - 线程存在父级关系时，保留父级映射（用于迁移裁决）。
  - 无原生 thread 的渠道以“会话容器键”代替（如 space/channel/group/chat）。
- 稳定性约束：
  - 同一线程内消息落同一 `oc_thread_id`。
  - 线程分叉（论坛 topic、Slack thread、Discord thread）必须可区分。
- 禁止项：
  - 禁止把消息正文作为 thread 主键原文输入。
  - 禁止将“是否提及机器人”这类策略态字段纳入 thread 主键。

证据：

- Telegram 线程规格（group/forum/dm）：`src/telegram/bot/helpers.ts:92`
- Slack thread 解析：`src/slack/threading.ts:12`
- Discord thread 会话键派生：`src/discord/monitor/message-handler.process.ts:280`
- 通用 thread session key 归一：`src/routing/session-key.ts:221`

### 4.5 `oc_message_id` 规范

- 生成输入：`channel` + 渠道消息唯一键。
- 归一化规则：
  - 能直接使用平台消息 ID 时，禁止改写语义。
  - 无平台消息 ID 时使用确定性 fallback（结构化键 + 哈希）。
- 稳定性约束：
  - 在同渠道同线程内必须可唯一定位。
  - 重放同一原始事件时应得到同一 `oc_message_id`（IRC 需补 deterministic fallback，见第 5 章）。
- 禁止项：
  - 禁止把正文明文写入 `oc_message_id`。
  - 禁止使用纯随机值作为跨重放主键。

证据：

- Telegram `MessageSid` 来源：`src/telegram/bot-message-context.ts:720`
- Slack `MessageSid=message.ts`：`src/slack/monitor/message-handler/prepare.ts:611`
- Google Chat `MessageSid=message.name`：`extensions/googlechat/src/monitor.ts:670`
- IRC 当前 `messageId` 为随机 UUID（需映射层裁决）：`extensions/irc/src/protocol.ts:167`

## 5) 分渠道映射矩阵（8/8）

| channel      | user source key                                                          | thread source key                                                    | message source key                                  | fallback key（缺字段时）                                         | collision risk                           |
| ------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------- |
| `telegram`   | `message.from.id`                                                        | `chat.id` + `message_thread_id`（forum/dm 线程）                     | `options.messageIdOverride` 或 `message.message_id` | `chat.id:message_thread_id:from.id:sha256(rawBody)`              | 中（群内昵称可重名，但 user id 稳定）    |
| `whatsapp`   | 群：`msg.key.participant`/`senderE164`；私聊：`msg.key.remoteJid`/`from` | `msg.key.remoteJid`（chat 容器）                                     | `msg.key.id`                                        | `contextInfo.stanzaId` 或 `remoteJid:senderJid:messageTimestamp` | 中（JID 迁移与群 participant 缺失场景）  |
| `discord`    | `sender.id`（PK 场景可为 memberId）                                      | `messageChannelId`（thread 时为 thread channel id）                  | `message.id`                                        | `channel_id:author.id:timestamp`                                 | 低（Snowflake 稳定，跨渠道仍需命名空间） |
| `irc`        | `senderNick!senderUser@senderHost`                                       | 群：`target`；私聊：`senderNick`                                     | `message.messageId`（当前为随机 UUID）              | `target:senderNick:timestamp:sha256(text)`（用于重放稳定化）     | 高（无原生 message id，nick 可变）       |
| `googlechat` | `message.sender.name`（回退 `event.user.name`）                          | `message.thread.name`（无则 `space.name`）                           | `message.name`                                      | `space.name:senderId:eventTime:sha256(rawBody)`                  | 中（`users/app` 与 bot 事件需过滤）      |
| `slack`      | `message.user`（bot 回退 `message.bot_id`）                              | 线程回复用 `thread_ts`，否则 `channel`                               | `message.ts`                                        | `message.event_ts`                                               | 低（`ts` 单 workspace 唯一性高）         |
| `signal`     | `envelope.sourceNumber`，缺失回退 `sourceUuid`                           | 群：`dataMessage.groupInfo.groupId`；私聊：`senderPeerId`            | `String(envelope.timestamp)`                        | `String(dataMessage.timestamp)`                                  | 中（uuid/phone 双形态）                  |
| `imessage`   | `message.sender`（经 `normalizeIMessageHandle`）                         | 群：`chat_id`（回退 `chat_guid/chat_identifier`）；私聊：sender 维度 | `String(message.id)`                                | `created_at:senderNormalized:chat_identifier`                    | 中（chat 标识多形态）                    |

证据（逐渠道）：

- Telegram：`src/telegram/bot-message-context.ts:167`, `src/telegram/bot-message-context.ts:209`, `src/telegram/bot-message-context.ts:720`, `src/telegram/bot/helpers.ts:92`
- WhatsApp：`src/web/inbound/monitor.ts:164`, `src/web/inbound/monitor.ts:165`, `src/web/inbound/monitor.ts:180`, `src/web/inbound/monitor.ts:198`, `src/web/inbound/types.ts:12`, `src/web/auto-reply/monitor/peer.ts:4`, `src/web/inbound/extract.ts:325`
- Discord：`src/discord/monitor/message-handler.preflight.ts:286`, `src/discord/monitor/message-handler.preflight.ts:294`, `src/discord/monitor/message-utils.ts:70`, `src/discord/monitor/message-handler.process.ts:280`, `src/discord/monitor/message-handler.process.ts:350`
- IRC：`extensions/irc/src/client.ts:362`, `extensions/irc/src/monitor.ts:91`, `extensions/irc/src/types.ts:79`, `extensions/irc/src/protocol.ts:167`, `extensions/irc/src/inbound.ts:247`
- Google Chat：`extensions/googlechat/src/monitor.ts:404`, `extensions/googlechat/src/monitor.ts:410`, `extensions/googlechat/src/monitor.ts:609`, `extensions/googlechat/src/monitor.ts:670`, `extensions/googlechat/src/monitor.ts:672`, `extensions/googlechat/src/types.ts:50`
- Slack：`src/slack/monitor/message-handler/prepare.ts:191`, `src/slack/monitor/message-handler/prepare.ts:203`, `src/slack/monitor/message-handler/prepare.ts:608`, `src/slack/monitor/message-handler/prepare.ts:611`, `src/slack/threading.ts:12`, `src/slack/types.ts:31`
- Signal：`src/signal/identity.ts:30`, `src/signal/identity.ts:68`, `src/signal/monitor/event-handler.ts:441`, `src/signal/monitor/event-handler.ts:531`, `src/signal/monitor/event-handler.ts:662`, `src/signal/monitor/event-handler.types.ts:8`
- iMessage：`src/imessage/monitor/types.ts:10`, `src/imessage/monitor/inbound-processing.ts:101`, `src/imessage/monitor/inbound-processing.ts:209`, `src/imessage/monitor/inbound-processing.ts:242`, `src/imessage/monitor/inbound-processing.ts:449`, `src/imessage/targets.ts:33`

## 6) 冲突裁决规则

### R1 重名冲突（同渠道或跨渠道 display name 相同）

- 判定条件：`SenderName/displayName` 相同，但平台不可变 ID 不同。
- 裁决：
  1. 以平台不可变 ID 生成 `oc_user_id`。
  2. `SenderName` 仅作为显示字段，不参与主键。
  3. 若历史记录曾以 display name 做键，标记 `legacy_name_key=true` 并建立别名映射，不覆盖新主键。
- 证据字段：`rule_id=R1`, `source_user_key`, `normalized_user_key`, `oc_user_id`, `legacy_name_key`。

证据：

- Slack SenderName/SenderId 分离：`src/slack/monitor/message-handler/prepare.ts:607`
- Discord SenderName/SenderId 分离：`src/discord/monitor/message-handler.process.ts:337`

### R2 跨渠道同 ID 冲突（例如 Telegram 与 Discord 都出现 `12345`）

- 判定条件：不同 `channel` 的源 ID 字符串相同。
- 裁决：
  1. 强制 channel 命名空间隔离（如 `ocu_v1:telegram:123456` 与 `ocu_v1:discord:123456`）。
  2. 禁止跨渠道直接合并主键；如需关联，只能通过显式 `identity_links` 进行受控链接。
  3. 链接建立后保留原始 `oc_user_id`，新增 `canonical_link_id`，不可反向覆盖。
- 证据字段：`rule_id=R2`, `channel_a`, `channel_b`, `raw_id`, `oc_user_id_a`, `oc_user_id_b`, `canonical_link_id?`。

证据：

- 会话键/路由显式 channel 命名空间：`src/routing/session-key.ts:158`
- `identityLinks` 受控链接入口：`src/routing/session-key.ts:163`

### R3 迁移会话冲突（sessionKey 单键历史 vs 新 thread 维度）

- 判定条件：同一 legacy `sessionKey` 在 thread 化后分裂为多个 thread 键，或不同消息被误归并到同一 session。
- 裁决：
  1. 以 `oc_thread_id` 为新主键；legacy `sessionKey` 转为兼容别名。
  2. 若存在父子线程关系，保留 `parent_session_key`（或父 thread）以保证可追溯。
  3. 回灌历史时采用“先线程、后父级”规则，禁止把子线程写回父线程主键。
- 证据字段：`rule_id=R3`, `legacy_session_key`, `oc_thread_id`, `parent_session_key`, `migration_epoch`。

证据：

- 通用 thread session key 规则：`src/routing/session-key.ts:221`
- Discord 父会话/线程字段落盘：`src/discord/monitor/message-handler.process.ts:354`
- Slack 线程字段落盘：`src/slack/monitor/message-handler/prepare.ts:614`

## 7) 冲突样例（脱敏）

### Case-1：跨渠道同 ID（R2）

- 输入样本（脱敏）：
  - 渠道 A：`telegram`, `message.from.id = 123456`
  - 渠道 B：`discord`, `author.id = 123456`
- 命中规则：`R2`
- 裁决结果：
  - `oc_user_id(telegram)=ocu_v1:telegram:123456`
  - `oc_user_id(discord)=ocu_v1:discord:123456`
  - 默认不合并；仅在显式 `identity_links` 下建立 `canonical_link_id`。
- 证据落盘字段：
  - `case_id=case-1`
  - `rule_id=R2`
  - `channels=[telegram,discord]`
  - `raw_id=123456`
  - `resolved_ids=[..., ...]`
  - `linked=false`

证据：`src/routing/session-key.ts:158`, `src/routing/session-key.ts:163`

### Case-2：同名不同人（R1）

- 输入样本（脱敏）：
  - 渠道：`slack`
  - `SenderName = "alex"`，但两条消息分别来自 `message.user=U01AAA` 与 `message.user=U09BBB`
- 命中规则：`R1`
- 裁决结果：
  - `oc_user_id#1=ocu_v1:slack:u01aaa`
  - `oc_user_id#2=ocu_v1:slack:u09bbb`
  - `display_name="alex"` 仅入 metadata，不用于主键。
- 证据落盘字段：
  - `case_id=case-2`
  - `rule_id=R1`
  - `display_name=alex`
  - `source_user_keys=[U01AAA,U09BBB]`
  - `resolved_oc_user_ids=[..., ...]`
  - `legacy_name_key=false`

证据：`src/slack/monitor/message-handler/prepare.ts:607`, `src/slack/monitor/message-handler/prepare.ts:608`

### Case-3：迁移会话冲突（R3）

- 输入样本（脱敏）：
  - 渠道：`discord`
  - legacy `sessionKey=agent:main:discord:channel:c123`
  - 迁移后出现 thread 消息：`messageChannelId=t999`，`threadParentId=c123`
- 命中规则：`R3`
- 裁决结果：
  - 主线程：`oc_thread_id_parent=oct_v1:discord:c123`
  - 子线程：`oc_thread_id_child=oct_v1:discord:t999`
  - 写入 `parent_session_key` 维护追溯链；旧 `sessionKey` 仅做 alias。
- 证据落盘字段：
  - `case_id=case-3`
  - `rule_id=R3`
  - `legacy_session_key`
  - `parent_thread_id`
  - `child_thread_id`
  - `parent_session_key`
  - `migration_epoch`

证据：`src/discord/monitor/message-handler.process.ts:280`, `src/discord/monitor/message-handler.process.ts:354`

## 8) 回滚方案（退回 sessionKey 单键策略）

### 8.1 回退动作

1. 停止写入 `oc_user_id/oc_thread_id/oc_message_id` 新字段，仅保留现有 `sessionKey` 语义。
2. 读取路径改为“sessionKey 单键优先”，忽略 oc\_\* 三元索引。
3. 保留迁移期冲突证据文件，避免二次迁移失真。

证据：

- W0-03 明确回滚目标：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:149`
- 现有 sessionKey 构造能力：`src/routing/session-key.ts:124`

### 8.2 影响面评估

- 查询召回：
  - 失去跨渠道统一 user/thread/message 主键，跨渠道合并召回能力下降。
- 线程隔离：
  - 仍保留 sessionKey 级隔离，但 thread 细粒度治理退化（依赖各渠道自身 thread 处理）。
- 审计可追溯：
  - 可追踪 session 级别轨迹；三元主键的冲突裁决链路不可直接查询。

证据：

- thread session key 与 parentSessionKey 机制：`src/routing/session-key.ts:221`
- Slack/Discord 线程上下文字段：`src/slack/monitor/message-handler/prepare.ts:614`, `src/discord/monitor/message-handler.process.ts:355`

### 8.3 恢复前置条件

1. W0-02 基线配置未漂移（至少核对 `read_mode/write_mode/admission_enabled/commit_canary_ratio`）。
2. 迁移证据完整：保留冲突样例与裁决日志（不可覆盖原文件）。
3. 可复跑抽样验证：8 渠道映射样本在“回退后/恢复前”均可重放并得到一致 session 归档。

证据：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md:31`

## 9) 验收矩阵（A1-A6）

| ID  | owner                 | 检查步骤                                         | 通过标准                                                                         | 失败标准                      | 证据路径                                                                                                                                                                                                                                                                                                                          |
| --- | --------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Eng-Routing           | 对照 `CHAT_CHANNEL_ORDER` 检查矩阵渠道行数与名称 | 精确覆盖 8/8：telegram/whatsapp/discord/irc/googlechat/slack/signal/imessage     | 少任一渠道或出现额外渠道      | `src/channels/registry.ts:7`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md`                                                                                                                                                                                              |
| A2  | Eng-Routing           | 审阅三类 ID 规范段落                             | `oc_user_id/oc_thread_id/oc_message_id` 均包含：生成输入、归一化、稳定性、禁止项 | 任一 ID 缺任一子项            | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:88`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:108`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:127` |
| A3  | Eng-Routing + Quality | 审阅“分渠道映射矩阵”列完整性                     | 每行包含 6 列：channel/user/thread/message/fallback/risk                         | 任一行缺列或字段不可执行      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md`; `extensions/googlechat/src/monitor.ts:609`; `extensions/irc/src/monitor.ts:91`                                                                                                                                            |
| A4  | Quality               | 复核冲突治理章节与样例                           | 至少 3 条规则覆盖重名/跨渠道同 ID/迁移冲突，且样例 >=2（本规范给出 3）           | 规则不全或样例不足            | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:145`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md`                                                                                                                               |
| A5  | Eng-Routing + Ops     | 按回滚章节走读回退动作与影响面                   | 明确“回退 sessionKey 单键策略 + 三类影响 + 恢复前置条件”                         | 缺任一子项或无法执行          | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:149`; `src/routing/session-key.ts:124`                                                                                                                                                                                                     |
| A6  | Eng-Governance        | 核对非范围声明                                   | 明确“扩展渠道仅模板原则，不纳入 W0-03 Gate”                                      | 将扩展渠道实现细节纳入本 Gate | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:319`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md:331`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:148`               |

## 10) 非范围声明（W0-03 Gate 边界）

本次 W0-03 Gate 仅覆盖 `CHAT_CHANNEL_ORDER` 的 8 个内置渠道；扩展渠道（plugins/extensions）不纳入本轮 Gate 验收。

扩展渠道仅给“映射模板原则”，不展开实现细节：

1. 必须保留 `channel` 命名空间前缀。
2. 必须优先使用平台不可变用户键。
3. 缺失 message/thread 键时必须使用确定性 fallback（可哈希，不可明文正文）。
4. 必须提供冲突裁决与回滚可追溯字段。

证据：

- W0-03 Gate 仅要求覆盖内置渠道：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:148`
- 内置渠道集合定义：`src/channels/registry.ts:7`

## 11) Fix1 自检结果

placeholder_scan: pass
a2_evidence_pathline: pass
a6_evidence_pathline: pass
