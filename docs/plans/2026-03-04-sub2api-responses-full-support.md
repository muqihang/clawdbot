# Sub2API + OpenClaw Responses Full Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 OpenClaw 在调用 `sub2api/*` 的 GPT 系列模型时，完整吃到 OpenAI Responses 的核心红利：WebSocket 增量续写、更高缓存命中、更稳的长会话 compaction，以及对 `gpt-5.4 / 1M / service_tier` 的正式支持。

**Architecture:** 原始主线是双端改造；截至 `2026-03-06`，`sub2api` 侧基础能力已经补齐，当前执行范围聚焦 `OpenClaw`。本轮不靠“把 provider 改名成 `openai`”来绕过限制，而是把 `sub2api` 明确建模成“OpenAI Responses 兼容网关”，正式给它开 `WS / store / context_management / prompt_cache_key / service_tier` 能力。

**Tech Stack:** OpenClaw（TypeScript、Vitest、`@mariozechner/pi-ai`、`ws`）、sub2api（已完成配套升级，本轮只读参考）、OpenAI Responses API（HTTP SSE + WebSocket）。

---

## 0. 本次修订说明（2026-03-06）

这份文档是对原主线方案的**执行前修订版**，目的不是重写方向，而是把今天新增的真实约束补进去，避免执行代理按旧假设走偏。

### 已锁定的前提

- `sub2api` 侧已完成本轮基础升级：
  - HTTP 不再无条件删除 `previous_response_id`
  - HTTP 成功响应后可绑定 `resp_* -> account_id`
  - HTTP 调度支持 `previous_response_id` 粘连
  - APIKey OpenAI Platform 路径支持 `store=true` 强制 + capability-aware 降级
  - 全量 Go 测试已通过
- 因此，本轮执行代理**只改 `OpenClaw` 仓库**，不再动 `sub2api`。

### 今天新增、必须纳入方案的 3 个事实

- OpenAI 于 `2026-03-05` 发布了 `gpt-5.4`。
- OpenAI 官方模型页给出的 `gpt-5.4` 上下文窗口是 **1,050,000**，最大输出是 **128,000**。
- 用户当前本地 `Codex` 配置是：
  - `model = "gpt-5.4"`
  - `model_context_window = 1000000`
  - `model_auto_compact_token_limit = 900000`
  - `service_tier = "fast"`
  - `model_reasoning_effort = "xhigh"`

### 本轮对齐原则

- **模型基线对齐：** OpenClaw 测试与示例按 `sub2api/gpt-5.4` 执行。
- **上下文对齐：** 虽然 OpenAI 官方上限是 `1,050,000`，但本轮在 OpenClaw 配置与测试里按用户当前生产基线 `1,000,000` 对齐，避免一边写 105 万、一边线上实际只按 100 万运行。
- **压缩阈值对齐：** 显式使用 `responsesCompactThreshold: 900000`，不要沿用当前“按 contextWindow 的 70% 自动估算”默认值。
- **推理强度对齐：** 保持 `xhigh` 能力可用，不要在改造中打坏现有 reasoning 映射。
- **service tier 对齐：** OpenClaw 本轮要支持 `Responses API` 的 `service_tier` 透传；至于本地 `Codex` 的 `fast` 文本别名是否要兼容，必须先核实再决定，绝不猜测映射。

### 明确不采用的方案

- **不采用：把 `sub2api` provider 直接改名成 `openai`。**

原因：

- 这只能绕过一处 `provider === "openai"` 的判断，治标不治本。
- 现有 `store/context_management` 还会继续检查是不是“直连 OpenAI baseUrl”，自建网关地址仍然过不去。
- 现有 OpenAI WS 默认连接目标仍是官方地址，不会自动变成你的 `sub2api`。
- 会把“官方 OpenAI”与“自建网关”混成同一个 provider，后续认证、排错、统计都会更乱。

结论：本轮必须改代码，让 `sub2api` 作为**正式支持的 Responses 兼容网关**成立。

---

## 1. 当前代码现状（截至本次修订）

### OpenClaw 现状（本轮真正的阻塞点）

- WebSocket Responses 优化只在 `provider === "openai"` 时启用：`src/agents/pi-embedded-runner/run/attempt.ts:996`
- `store=true` 和 `context_management` 只对“直连 OpenAI / Azure”的 provider + baseUrl 启用：`src/agents/pi-embedded-runner/extra-params.ts:211`
- OpenAI Responses WebSocket 连接当前只能改 URL，不能透传自定义 headers：`src/agents/openai-ws-connection.ts:251`、`src/agents/openai-ws-connection.ts:382`
- WebSocket payload 目前默认写 `store: false`，后续是否改成 `true` 依赖上面的 provider/baseUrl 判断：`src/agents/openai-ws-stream.ts:592`、`src/agents/pi-embedded-runner/extra-params.ts:963`
- `previous_response_id` 的增量续写能力当前只出现在 WS 路径，没有看到 OpenClaw 自己给 HTTP 路径补这一层状态管理
- `openai-codex` 相关默认模型与前向兼容仍停留在 `gpt-5.3-codex`：
  - `src/commands/openai-codex-model-default.ts:4`
  - `src/agents/model-forward-compat.ts:7`
  - `src/agents/model-catalog.ts:36`
- 仓库里没有发现 `service_tier` 透传逻辑

### sub2api 现状（本轮作为只读依赖）

- 已具备：
  - HTTP 保留 `previous_response_id`
  - `resp_* -> account_id` 绑定
  - HTTP 基于 `previous_response_id` 的账号粘连
  - `store=true` 强制 + capability-aware 降级
  - `prompt_cache_retention` / `max_output_tokens` / `store` 字段级 capability cache
- 这意味着：只要 OpenClaw 把 `Responses` 关键字段和 WS 路径打开，`sub2api` 这一端已经准备好接住。

---

## 2. 本轮验收定义（给产品经理看的版本）

### A. `sub2api` 被正式当成 Responses 网关支持

**效果：**

- 不需要把 provider 伪装成 `openai`
- OpenClaw 直接对 `sub2api` 开启 Responses 增强能力

**验收：**

- 自定义 provider 可配置 `wsUrl` / `wsHeaders`
- 当 provider 明确声明为 Responses 网关时，可启用 WS、`store`、`context_management`

### B. WebSocket 增量续写真的打通

**效果：**

- 多轮工具调用时，第二轮开始可以只发增量，而不是整段历史重发

**验收：**

- OpenClaw 日志出现 `[ws-stream] connected`
- 第二轮开始出现 `previous_response_id=...`
- 自定义 `sub2api` provider 走的是配置的 WS 地址，而不是官方默认地址

### C. 缓存与长会话红利真的打开

**效果：**

- `prompt_cache_key` 能稳定传到 `sub2api`
- `store=true` 和 `context_management` 真正对自定义 Responses 网关生效
- 长会话 compaction 阈值与现有生产参数一致

**验收：**

- WS payload 带 `prompt_cache_key`
- 对 `sub2api/gpt-5.4` 请求能看到 `store=true`
- `context_management` 中 `compact_threshold` 为 `900000`

### D. `gpt-5.4 / 1M / xhigh` 正式支持

**效果：**

- `sub2api/gpt-5.4` 成为 OpenClaw 里的正式一等模型，不靠临时字符串蒙混
- 1M 上下文与 `xhigh` 推理不会在改造中被打坏

**验收：**

- 测试夹具与示例配置使用 `sub2api/gpt-5.4`
- `contextWindow: 1000000`
- `responsesCompactThreshold: 900000`
- 现有 `xhigh` 路径测试仍通过

### E. `service_tier` 有正式方案

**效果：**

- OpenClaw 能透传官方 `service_tier`
- 如果要兼容本地 `Codex` 的 `fast` 文本别名，必须是“核实后再兼容”，不能猜

**验收：**

- OpenClaw 配置层或 model params 层支持 `serviceTier` / `service_tier`
- 请求体里透传官方接受的 `service_tier`
- 若实现 `fast` 别名，则必须有“来源已核实”的测试与说明；若未核实，则明确不做别名映射但保留官方字段支持

---

## 3. 方案选型（修订版）

### 方案 A（推荐）：正式支持“Responses 兼容网关”

**做法：**

- 保留 `sub2api` 独立 provider
- 给 provider 加 `wsUrl` / `wsHeaders` / 网关能力开关
- 放宽 `WS / store / context_management / prompt_cache_key` 的启用条件
- 补 `gpt-5.4 / 1M / service_tier` 支持

**优点：**

- 结构正确，可长期维护
- 不污染官方 OpenAI provider
- 与 `sub2api` 当前能力完全对齐

**缺点：**

- 需要改到配置、流式链路、extra params、测试四块

### 方案 B：把 `sub2api` 配成 `openai`

**优点：**

- 看起来改动少

**缺点：**

- 只能绕过一部分判断
- 不能解决自定义 WS 地址与自定义 headers
- 不能解决自定义网关地址下的 `store/context_management` 条件判断
- 后续配置和排错更混乱

### 方案 C：只补 `gpt-5.4` 文本配置，不动 Responses 网关能力

**优点：**

- 工程量最小

**缺点：**

- 用户最在意的 `WS / previous_response_id / 缓存 / compaction` 仍然吃不满

**结论：选择方案 A。**

---

## 4. 当前执行范围（锁定）

### 在 scope 内

- 只改 `OpenClaw`
- 只做与 `sub2api` Responses 网关接入有关的增强
- 纳入 `gpt-5.4 / 1M / xhigh / service_tier`
- 补相关测试与必要文档说明

### 不在 scope 内

- 不再改 `sub2api`
- 不把全局默认模型强制切到 `gpt-5.4`（这是产品默认值决策，不是这轮必要条件）
- 不猜测 `fast` 到官方 `service_tier` 的映射；只有在本地 `Codex CLI 0.111.0` 或官方文档里核实后才可实现别名

---

## 5. 详细实施计划（OpenClaw only）

> 执行代理必须按 TDD 做：先写失败测试，再做最小实现，再跑对应测试，再扩展到下一步。

### Task 1: 为自定义 provider 增加 Responses 网关配置入口

**Files:**

- Modify: `src/config/types.models.ts`
- Modify: `src/config/zod-schema.core.ts`
- Modify: `src/config/schema.help.ts`
- Modify: `src/config/schema.labels.ts`
- Test: 现有覆盖 `models.providers` 的 schema 测试文件

**Step 1: 写失败测试**

构造一个 `sub2api` provider：

```ts
{
  models: {
    providers: {
      sub2api: {
        baseUrl: "http://127.0.0.1:18081/v1",
        api: "openai-responses",
        wsUrl: "ws://127.0.0.1:18081/v1/responses",
        wsHeaders: { session_id: "sess_test" },
        responsesGateway: true,
        models: [
          {
            id: "gpt-5.4",
            name: "GPT-5.4",
            reasoning: true,
            contextWindow: 1000000,
            maxTokens: 128000,
            input: ["text", "image"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          },
        ],
      },
    },
  },
}
```

预期：当前 schema 失败。

**Step 2: 加配置字段**

新增：

```ts
wsUrl?: string;
wsHeaders?: Record<string, string>;
responsesGateway?: boolean;
```

**Step 3: 更新 schema / help / labels**

补齐：

- `models.providers.*.wsUrl`
- `models.providers.*.wsHeaders`
- `models.providers.*.responsesGateway`

**Step 4: 跑测试**

Run: `pnpm test <schema-related-test-file>`
Expected: PASS

---

### Task 2: 让自定义 Responses 网关也能启用 WebSocket streamFn

**Files:**

- Modify: `src/agents/pi-embedded-runner/run/attempt.ts`
- Test: `src/agents/pi-embedded-runner/run/attempt.test.ts`

**Step 1: 写失败测试**

场景：

- provider=`sub2api`
- model.api=`openai-responses`
- provider config 含 `wsUrl`

预期：不应继续走纯 `streamSimple`，而应选择 `createOpenAIWebSocketStreamFn(...)`。

**Step 2: 实现**

把“仅 `provider === "openai"` 才启用 WS”的逻辑，改成“满足以下条件即可启用”：

- `model.api === "openai-responses"`
- provider config 明确声明 `responsesGateway: true`，或至少存在 `wsUrl`

并把 `wsUrl / wsHeaders` 传给 `managerOptions`。

**Step 3: 跑测试**

Run: `pnpm test src/agents/pi-embedded-runner/run/attempt.test.ts`
Expected: PASS

---

### Task 3: OpenAIWebSocketManager 支持自定义 headers

**Files:**

- Modify: `src/agents/openai-ws-connection.ts`
- Test: `src/agents/openai-ws-connection.test.ts`

**Step 1: 写失败测试**

给 `managerOptions` 传：

```ts
{
  url: "ws://127.0.0.1:18081/v1/responses",
  headers: { session_id: "sess_123", conversation_id: "conv_123" },
}
```

预期：WebSocket 构造参数包含这些 header。

**Step 2: 实现**

- 在 `OpenAIWebSocketManagerOptions` 增加 `headers?: Record<string, string>`
- `_openConnection()` 中合并：

```ts
headers: {
  Authorization: `Bearer ${this.apiKey}`,
  "OpenAI-Beta": "responses-websocket=v1",
  ...extraHeaders,
}
```

**Step 3: 跑测试**

Run: `pnpm test src/agents/openai-ws-connection.test.ts`
Expected: PASS

---

### Task 4: 允许自定义 Responses 网关显式开启 `store=true` 与 `context_management`

**Files:**

- Modify: `src/agents/pi-embedded-runner/extra-params.ts`
- Test: `src/agents/pi-embedded-runner-extraparams.test.ts`

**Step 1: 写失败测试**

新增场景：

- provider=`sub2api`
- model.api=`openai-responses`
- provider config：`responsesGateway: true`
- model params：

```ts
{
  responsesServerCompaction: true,
  responsesCompactThreshold: 900000,
}
```

预期：payload 被注入：

```ts
store: true,
context_management: [{ type: "compaction", compact_threshold: 900000 }]
```

**Step 2: 实现**

- 不再把“直连 OpenAI baseUrl”作为唯一放行条件
- 当 provider 明确声明 `responsesGateway: true` 时，也允许启用这套增强
- 继续尊重 `compat.supportsStore === false` 这个安全护栏

**Step 3: 跑测试**

Run: `pnpm test src/agents/pi-embedded-runner-extraparams.test.ts`
Expected: PASS

---

### Task 5: WebSocket payload 注入 `prompt_cache_key`

**Files:**

- Modify: `src/agents/openai-ws-stream.ts`
- Test: `src/agents/openai-ws-stream.test.ts`

**Step 1: 写失败测试**

捕获 `options.onPayload` 的 WS payload。

预期：对于 `sub2api` Responses 网关场景，payload 包含：

```ts
prompt_cache_key: sessionId;
```

**Step 2: 实现**

- 优先复用当前 `sessionId`
- 仅在 Responses 网关场景下注入，避免扩大影响面

**Step 3: 跑测试**

Run: `pnpm test src/agents/openai-ws-stream.test.ts`
Expected: PASS

---

### Task 6: 补 `gpt-5.4 / 1M / xhigh` 的正式支持

**Files:**

- Modify: `src/agents/model-forward-compat.ts`
- Modify: `src/agents/model-catalog.ts`
- Modify: `src/agents/pi-embedded-runner/model.test-harness.ts`
- Modify: 与 `openai-codex` 相关的测试夹具文件
- Optional: `src/commands/openai-codex-model-default.ts`（只有在明确要升级默认模型时才改；本轮默认不动）

**Step 1: 写失败测试**

至少覆盖：

- `sub2api/gpt-5.4` 可被识别/解析
- `contextWindow: 1000000`
- `maxTokens: 128000`
- `reasoning: true`
- `xhigh` 路径不被打坏

**Step 2: 实现**

- 补 `gpt-5.4` 前向兼容或测试夹具支持
- 测试和示例统一使用 `1000000` 与 `900000`
- 不要在本轮顺手把全局默认模型强切到 `gpt-5.4`，除非用户再次明确要求

**Step 3: 跑测试**

Run: `pnpm test <gpt-5.4-related-test-files>`
Expected: PASS

---

### Task 7: 给 OpenClaw 增加 `service_tier` 支持（含对 `fast` 的审慎处理）

**Files:**

- Modify: `src/config/types.models.ts` 或 model params 相关类型
- Modify: `src/config/zod-schema.core.ts`
- Modify: `src/agents/pi-embedded-runner/extra-params.ts`
- Test: 相关 schema / extra params 测试文件

**Step 1: 先做事实核验测试准备**

先在本地核实两件事：

- OpenAI 官方 `Responses API` 接受哪些 `service_tier` 值
- 本机 `Codex CLI 0.111.0` 的 `service_tier = "fast"` 到底是不是某个官方值的别名

如果第二点无法高置信核实，**只做官方字段透传，不做 `fast` 别名映射**。

**Step 2: 写失败测试**

至少覆盖：

- `serviceTier: "priority"`（或其他已核实官方值）可进入 payload
- 无效值会被拒绝或忽略
- 如果实现了 `fast` 别名，则要有“`fast` -> 官方值”的明确测试

**Step 3: 实现**

推荐规则：

- 配置层允许 `serviceTier`（首选）与 `service_tier`（兼容）
- 请求层统一发 `service_tier`
- `fast` 只有在“本地 Codex 或官方文档可证明”的前提下才兼容；否则不实现别名

**Step 4: 跑测试**

Run: `pnpm test <service-tier-related-tests>`
Expected: PASS

---

### Task 8: 回归验证与交付说明

**Files:**

- Optional docs touch if needed
- No scope creep

**Step 1: 跑定向测试**

至少跑：

- `pnpm test <schema tests>`
- `pnpm test src/agents/pi-embedded-runner/run/attempt.test.ts`
- `pnpm test src/agents/openai-ws-connection.test.ts`
- `pnpm test src/agents/openai-ws-stream.test.ts`
- `pnpm test src/agents/pi-embedded-runner-extraparams.test.ts`

**Step 2: 再跑静态检查（范围可控时）**

Run: `pnpm tsgo`

如改动范围可控，再考虑：

Run: `pnpm test`

**Step 3: 交付报告必须逐条回答**

- `sub2api` 自定义 provider 是否无需伪装成 `openai`
- WS 是否走了自定义 `wsUrl`
- `wsHeaders` 是否生效
- `store/context_management` 是否对 `sub2api` 生效
- `prompt_cache_key` 是否进入 WS payload
- `sub2api/gpt-5.4` / `1,000,000` / `900,000` 是否已纳入测试与示例
- `service_tier` 是否已支持
- `fast` 别名是否已实现；如果没有，原因是不是“缺乏高置信映射依据”

---

## 6. 风险清单与防回归策略

- **风险 1：** 把自定义网关能力开得太宽，误伤其他 OpenAI-like provider
  - **策略：** 只对明确声明 `responsesGateway: true` 或显式配置 `wsUrl` 的 provider 放行
- **风险 2：** 为了兼容 `fast` 猜测错误映射
  - **策略：** 只有在本地 `Codex CLI 0.111.0` 或官方文档里核实后才做别名；否则只支持官方 `service_tier`
- **风险 3：** 1M 上下文导致 compaction 提前或过晚
  - **策略：** 本轮不要继续用自动 70% 推断；显式用 `900000`
- **风险 4：** 顺手改了全局默认模型，引发非目标用户变化
  - **策略：** 本轮默认不改 `openai-codex` 全局默认模型

---

## 7. 执行前不再需要额外确认

本轮执行边界已经锁定：

- 只改 `OpenClaw`
- 主线方案采用“正式支持 `sub2api` Responses 网关”
- 纳入 `gpt-5.4 / 1M / xhigh / service_tier`
- 不走“把 provider 改名成 `openai`”的临时绕路方案

执行代理可以直接开工。

---

## 8. 外部参考（本次修订用）

- OpenAI `gpt-5.4` 发布说明：<https://openai.com/index/introducing-gpt-5-4/>
- OpenAI `gpt-5.4` 模型页：<https://platform.openai.com/docs/models/gpt-5-4>
- OpenAI `Responses API` `service_tier` 参考：<https://platform.openai.com/docs/api-reference/responses/create>
