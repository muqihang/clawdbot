# Sub2API Responses Full Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 OpenClaw 在调用 `sub2api/*` 的 GPT 系列模型时，能“完整吃满” OpenAI Responses 的能力红利：更低 token 成本、更高缓存命中、更稳定的多轮工具调用（含 WebSocket 模式），并且保持失败自动降级（不因某个能力不可用而整体不可用）。

**Architecture:** 双端改造（推荐）：OpenClaw 侧把 `sub2api` 视为“OpenAI Responses 兼容网关”，按能力开关启用 WebSocket、`store/context_management`、`prompt_cache_*` 等增强；sub2api 侧补齐 `/v1/responses` WebSocket 代理 + 放行关键参数（`prompt_cache_retention`、`max_output_tokens` 等）并做能力降级缓存，确保兼容多种上游账户类型。

**Tech Stack:** OpenClaw（TypeScript、Vitest、`@mariozechner/pi-ai`、`ws`）、sub2api（Go、Gin、gorilla/websocket、`net/http/httptest`）、OpenAI Responses API（HTTP SSE + WebSocket）。

---

## 0. 背景与现状（基于代码调查）

### OpenClaw 现状（关键点）

- `sub2api` 目前走的是 `api: "openai-responses"`（HTTP SSE），但 OpenClaw 的“Responses 优化能力”存在**强约束**：
  - WebSocket 仅在 `provider === "openai"` 时启用：`src/agents/pi-embedded-runner/run/attempt.ts:996`
  - `store=true` + `context_management`（服务端 compaction）只对 “直连 OpenAI / Azure” 的 provider+baseUrl 启用：`src/agents/pi-embedded-runner/extra-params.ts:16`、`src/agents/pi-embedded-runner/extra-params.ts:228`
  - OpenAI Responses WebSocket 连接目前只能设置 URL（用于测试），**不能加自定义 headers**（例如 `session_id`）：
    - 连接管理：`src/agents/openai-ws-connection.ts:382`
  - WebSocket `response.create` payload 目前默认不带 `prompt_cache_key/prompt_cache_retention`：`src/agents/openai-ws-stream.ts:593`
- 结论：即使 `sub2api` 支持 Responses 能力，OpenClaw 也会“因为 provider 不是 openai”而拿不到部分红利。

### sub2api 现状（关键点）

- sub2api 后端（Go/Gin）已经提供 HTTP 端点：
  - `POST /v1/responses`：`backend/internal/server/routes/gateway.go:38`
  - `POST /responses`（无 `/v1` 前缀别名）：`backend/internal/server/routes/gateway.go:55`
- sub2api 做了很多 Responses 兼容处理（这是好消息）：
  - 识别/使用 `prompt_cache_key` 参与 sticky session：`backend/internal/service/openai_gateway_service.go:239`
  - previous_response_id 能力探测 + 自动降级重试：`backend/internal/service/openai_gateway_service.go:1068`
  - 修正 `input[].content[].type: "text" -> "input_text"` 等：`backend/internal/service/openai_gateway_service.go:1038` 左右
- 但目前 sub2api 有几个“吃满红利的硬阻塞”：
  - **会删除 `prompt_cache_retention`**：`backend/internal/service/openai_gateway_service.go:1120`（并且单测明确要求删除：`backend/internal/service/openai_gateway_service_test.go:269`）
  - **会删除 `max_output_tokens`（对 OpenAI API key 账户）**：`backend/internal/service/openai_gateway_service.go:1088` 左右（注释认为不支持，但 Responses API 里这是核心控参）
  - 暂未看到 `/v1/responses` 的 WebSocket 升级路由（只有 admin ops websocket）：`backend/internal/handler/admin/ops_ws_handler.go`
- 结论：如果想“完全吃满”，sub2api 必须补齐 WebSocket，且不能无条件剥离关键 Responses 参数。

---

## 1. “完全吃满 Responses 红利”的可验收定义（对产品经理可解释）

把“红利”拆成 4 组能力，每组都有可观测验收点：

### A. WebSocket 模式（更低延迟、更省 token）

**我们要的效果：**

- 多轮工具调用时，不必每一轮都把整段历史重复发给模型（更省输入 token）。
- 首 token 更快（TTFT 下降）。

**验收方式：**

- OpenClaw 日志出现 `[ws-stream] connected`，并在第二轮开始出现 `incremental send (...) previous_response_id=...`（OpenClaw 侧）。
- sub2api 有 WebSocket `/v1/responses`，并能稳定把 OpenAI 的事件流原样透传给客户端（sub2api 侧）。

### B. Prompt 缓存（更高 cacheRead、更低 input token）

**我们要的效果：**

- system/developer 这类稳定前缀能被上游缓存，后续多轮会话 `cacheRead` 增加、input token 下降。

**验收方式：**

- 在 OpenClaw 使用统计里能看到 `cacheRead/cacheWrite` 有意义增长（或至少 upstream 返回的缓存 token 不再被吞掉）。
- sub2api 不再删除 `prompt_cache_retention`，并对“上游不支持”时自动降级重试（不影响可用性）。

### C. 服务器端 compaction（更稳定长会话）

**我们要的效果：**

- 长会话不会因为历史无限膨胀而爆 context；由 OpenAI 的 `context_management` 做 compaction（能省 token、也能减少错误）。

**验收方式：**

- 请求体里出现 `context_management: [{type:"compaction", compact_threshold: ...}]` 且 upstream 接受。
- OpenClaw 允许对 `sub2api/*` 显式开启 `responsesServerCompaction`。

### D. 参数/能力“对齐 OpenAI Responses”

**我们要的效果：**

- `max_output_tokens`、`reasoning`、`tool_choice`、`previous_response_id` 等关键字段不被网关/客户端误删。

**验收方式：**

- sub2api 的 HTTP & WS 路径都能透传这些字段；若某条上游线路不支持，sub2api 能降级并缓存能力（避免重复失败）。

---

## 2. 方案选型（2-3 个方案 + 推荐）

### 方案 A（推荐）：双端能力化支持（OpenClaw + sub2api）

**做法：**

- OpenClaw 增加“Responses 网关能力开关”，让 `sub2api` 也能启用 WS + compaction + prompt 缓存参数。
- sub2api 补齐 `/v1/responses` WebSocket，并把关键参数从“无条件删除”改成“能力探测后保留/降级”。

**优点：**

- 真实吃满：WS + compaction + prompt 缓存都可以落地。
- 风险可控：全部能力都做 fail-open（失败就退回 HTTP SSE）。

**缺点：**

- 需要改两边代码与测试，周期略长。

### 方案 B：只改 OpenClaw（不做 sub2api WS）

**优点：** 快；sub2api 不动。

**缺点：** “完全吃满”做不到（缺 WS 增量输入这块最大红利）。

### 方案 C：只改 sub2api（尽量模拟 OpenAI，OpenClaw 不动）

**优点：** OpenClaw 风险最小。

**缺点：** OpenClaw 侧仍然有硬编码限制（WS/compaction 只给 `openai/*`），最终还是吃不满。

**结论：选择方案 A。**

---

## 3. 实施总览（里程碑与交付物）

### Milestone 1（先拿到“可用+可观测”）：HTTP 参数对齐 + 能力降级

交付：

- sub2api：不再无条件删除 `prompt_cache_retention`、`max_output_tokens`；改为 capability-aware（失败再降级并缓存）。
- OpenClaw：允许 `sub2api/*` 显式开启 `responsesServerCompaction`（即使 baseUrl 不是 api.openai.com）。
- 文档：写清楚“怎么在 OpenClaw 配置 sub2api 启用这些能力”。

### Milestone 2（吃满最大红利）：WebSocket 端到端

交付：

- sub2api：新增 `GET /v1/responses`（以及可选 `GET /responses`）WebSocket 升级，代理到上游 OpenAI WebSocket。
- OpenClaw：当 provider 配置了 WS URL 时，`sub2api/*` 默认 transport=`auto`（WS-first, SSE fallback），并给 WS payload 注入 `prompt_cache_key`。

### Milestone 3（打磨）：回归测试 + 指标验证

交付：

- OpenClaw：新增 Vitest 覆盖（WS URL 推导、store/compaction 对自定义 provider 生效）。
- sub2api：新增 Go 测试（WS 代理握手、参数透传、降级逻辑）。

---

## 4. 详细实施计划（按 2-5 分钟小步，含测试与命令）

> 说明：这里按仓库拆分。执行时建议两个 repo 都用独立 worktree，避免互相污染。

### Task 1: OpenClaw - 为自定义 provider 增加 Responses WebSocket 配置入口

**Files:**

- Modify: `src/config/types.models.ts`
- Modify: `src/config/zod-schema.core.ts`
- Modify: `src/config/schema.help.ts`
- Modify: `src/config/schema.labels.ts`
- Test: `src/config/zod-schema*.test.ts`（选择已有覆盖 models.providers 的测试文件追加用例）

**Step 1: 写一个失败的 schema 测试（新增字段未被允许）**

在现有 schema 测试里构造：

```ts
const cfg = {
  models: {
    providers: {
      sub2api: {
        baseUrl: "http://gateway-host:18081/v1",
        api: "openai-responses",
        wsUrl: "ws://gateway-host:18081/v1/responses",
        models: [
          {
            id: "gpt-5.2",
            name: "gpt-5.2",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 200000,
            maxTokens: 32768,
          },
        ],
      },
    },
  },
};
```

预期：schema 校验失败（因为 `wsUrl` 目前不在 ModelProviderSchema）。

**Step 2: 修改 OpenClaw config 类型与 Zod schema**

在 `src/config/types.models.ts` 的 `ModelProviderConfig` 增加：

```ts
wsUrl?: string;
wsHeaders?: Record<string, string>;
```

并在 `src/config/zod-schema.core.ts` 的 `ModelProviderSchema` 增加：

```ts
wsUrl: z.string().min(1).optional(),
wsHeaders: z.record(z.string(), z.string()).optional(),
```

**Step 3: 更新 help/labels**

新增键：

- `models.providers.*.wsUrl`
- `models.providers.*.wsHeaders`

**Step 4: 跑 schema 测试确保通过**

Run: `pnpm test src/config/<相关测试>.test.ts`
Expected: PASS

---

### Task 2: OpenClaw - 让 sub2api 也能启用 Responses WebSocket streamFn

**Files:**

- Modify: `src/agents/pi-embedded-runner/run/attempt.ts`
- Modify: `src/agents/openai-ws-stream.ts`（可选：注入 prompt_cache_key）
- Test: `src/agents/pi-embedded-runner/run/attempt.test.ts`（或新增小型单测文件）

**Step 1: 写失败测试（sub2api 仍走 HTTP）**

测试目标：当 `models.providers.sub2api.wsUrl` 存在且模型 `api=openai-responses` 时，`attempt.ts` 应该选择 `createOpenAIWebSocketStreamFn(...)` 而不是纯 `streamSimple`。

**Step 2: 实现 provider-aware 选择逻辑**

在 `attempt.ts` 替换/扩展这段逻辑：

- 现状：仅 `params.provider === "openai"` 启用 WS（`src/agents/pi-embedded-runner/run/attempt.ts:996`）。
- 目标：当满足以下条件也启用 WS：
  - `params.model.api === "openai-responses"`
  - 且 provider config 存在 `wsUrl`（推荐）或可由 `baseUrl` 推导

伪代码：

```ts
const providerCfg = params.config?.models?.providers?.[params.provider];
const wsUrl = providerCfg?.wsUrl;
const wsHeaders = providerCfg?.wsHeaders;
const shouldUseResponsesWs =
  params.model.api === "openai-responses" && typeof wsUrl === "string" && wsUrl.trim();

if (shouldUseResponsesWs) {
  const apiKey = await params.authStorage.getApiKey(params.provider);
  activeSession.agent.streamFn = apiKey
    ? createOpenAIWebSocketStreamFn(apiKey, params.sessionId, {
        signal: runAbortController.signal,
        managerOptions: { url: wsUrl, headers: wsHeaders },
      })
    : streamSimple;
}
```

> 注意：这需要 Task 3 的 `headers` 支持（OpenAIWebSocketManagerOptions 扩展）。

**Step 3: 跑测试**

Run: `pnpm test src/agents/pi-embedded-runner/run/attempt.test.ts`

---

### Task 3: OpenClaw - OpenAIWebSocketManager 支持自定义 headers（让 sub2api 做 sticky session）

**Files:**

- Modify: `src/agents/openai-ws-connection.ts`
- Modify: `src/agents/openai-ws-stream.ts`（可选：把 `sessionId` 作为 header 或 metadata）
- Test: `src/agents/openai-ws-connection.test.ts`

**Step 1: 写失败测试（headers 不能透传）**

在现有测试里构造 managerOptions `{ url: "ws://localhost:9999/v1/responses", headers: { session_id: "sess_123" } }`，期望 WebSocket 构造参数里包含该 header。

**Step 2: 扩展类型并实现**

在 `OpenAIWebSocketManagerOptions` 增加：

```ts
headers?: Record<string, string>;
```

在 `_openConnection()` 里把 headers 合并：

```ts
headers: {
  Authorization: `Bearer ${this.apiKey}`,
  "OpenAI-Beta": "responses-websocket=v1",
  ...this.extraHeaders,
},
```

**Step 3: 跑测试**

Run: `pnpm test src/agents/openai-ws-connection.test.ts`

---

### Task 4: OpenClaw - 允许 sub2api 显式开启 store + context_management compaction

**Files:**

- Modify: `src/agents/pi-embedded-runner/extra-params.ts`
- Test: `src/agents/pi-embedded-runner-extraparams.test.ts`
- Docs (后续任务): `docs/providers/openai.md`（补充“自定义网关如何开”）

**Step 1: 写失败测试（sub2api 配置 responsesServerCompaction 仍不注入）**

新增用例：

- provider=`sub2api`
- model.api=`openai-responses`
- baseUrl=`http://gateway-host:18081/v1`
- cfg 中设置 `agents.defaults.models["sub2api/gpt-5.2"].params.responsesServerCompaction=true`
  预期：payload 被注入 `context_management`（目前会失败，因为 `shouldForceResponsesStore` 直接返回 false）。

**Step 2: 修改逻辑**

把 `shouldEnableOpenAIResponsesServerCompaction()` 调整为：

- `responsesServerCompaction === true` 时允许直接启用（不强依赖 `shouldForceResponsesStore()`），并在该分支下同时强制 `store=true`（除非 `compat.supportsStore=false`）。

并新增一个“安全护栏”：只有当 provider config 明确声明“允许 Responses 增强”时才启用（例如 `models.providers.*.wsUrl` 存在，或新增 `models.providers.*.responsesGateway=true`）。

**Step 3: 跑单测**

Run: `pnpm test src/agents/pi-embedded-runner-extraparams.test.ts`

---

### Task 5: OpenClaw - WebSocket payload 注入 prompt_cache_key（让 sub2api 能用同一会话路由同一上游账号）

**Files:**

- Modify: `src/agents/openai-ws-stream.ts`
- Test: `src/agents/openai-ws-stream.test.ts`（如无则新增）

**Step 1: 写失败测试（payload 缺 prompt_cache_key）**

捕获 `options.onPayload` 的 payload，期望包含 `prompt_cache_key`。

**Step 2: 实现**

在 payload 构建时加：

```ts
const sessionId =
  typeof (options as any)?.sessionId === "string" ? (options as any).sessionId : undefined;
if (sessionId) payload.prompt_cache_key = sessionId;
```

> 这不会影响 OpenAI 官方（字段属于 Responses 参数集合），但如果担心风险，可只在 `providerCfg.wsUrl` 存在时开启。

---

### Task 6: sub2api - HTTP 路径放行 prompt_cache_retention 与 max_output_tokens（并做能力降级缓存）

**Files (sub2api repo):**

- Modify: `backend/internal/service/openai_gateway_service.go`
- Modify: `backend/internal/service/openai_gateway_service_test.go`

**Step 1: 写失败测试（期望保留字段，但现在会被删除）**

在 `TestOpenAIGatewayService_Forward_KeepPreviousResponseIDForOpenAI` 的基础上，调整期望：

- `prompt_cache_retention` 应当被转发（至少对 PlatformOpenAI + APIKey 的 upstream）
- `max_output_tokens` 应当被保留（Responses API 参数）

**Step 2: 实现 capability-aware**

建议实现策略（与 previous_response_id 同风格）：

- 默认保留 `prompt_cache_retention`、`max_output_tokens`。
- 如果上游返回 `unsupported parameter` / `unknown parameter`（匹配字段名），则：
  - 记录 `accountID+model` 的能力缓存为“不支持该字段”
  - 删除字段后重试一次

**Step 3: 跑 Go 测试**

Run: `cd backend && go test ./...`

---

### Task 7: sub2api - 增加 `/v1/responses` WebSocket 代理（上游 OpenAI WebSocket）

**Files (sub2api repo):**

- Modify: `backend/internal/server/routes/gateway.go`
- Add: `backend/internal/handler/openai_gateway_ws_handler.go`
- Add: `backend/internal/service/openai_responses_ws_proxy.go`
- Test: `backend/internal/handler/openai_gateway_ws_handler_test.go`

**Step 1: 路由接入（先能 upgrade）**

在 `routes/gateway.go` 增加：

- `gateway.GET("/responses", h.OpenAIGateway.ResponsesWebSocket)`
- 以及可选别名 `r.GET("/responses", ...)`

**Step 2: Handler 实现（最小可用：鉴权 + 升级 + 逐帧转发）**

伪代码：

```go
conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
// 1) 从 Gin context 取 sub2api API key subject（沿用 middleware）
// 2) 选择 upstream OpenAI account（可复用 SelectAccountWithLoadAwareness）
// 3) dial 上游 wss://api.openai.com/v1/responses，带 Authorization + OpenAI-Beta header
// 4) 双向 pump：client->upstream / upstream->client
```

**Step 3: 支持 sticky session（关键）**

优先级建议：

1. 优先读 client WebSocket handshake header：`session_id` / `conversation_id`（由 OpenClaw wsHeaders 注入）
2. fallback：从首条 `response.create` payload 里读 `prompt_cache_key`

**Step 4: 测试**

- 用 `httptest.NewServer` 起一个假的 upstream WS 服务器（回显 JSON 事件）
- 子测试覆盖：
  - upgrade 成功
  - client 发 `response.create`，upstream 收到同样 payload（含 `prompt_cache_key`）
  - upstream 发 `response.completed`，client 能收到

Run: `cd backend && go test ./...`

---

### Task 8: 文档与验收脚本（OpenClaw + sub2api）

**Files:**

- Modify: `docs/providers/openai.md`（新增 “OpenAI-compatible Responses gateways (sub2api)” 章节）
- Add: `docs/plans/2026-03-04-sub2api-responses-full-support.md`（本文件已完成）
- Optional: sub2api `README_CN.md`（更新“已实现 store 强制/WS 支持”的真实情况）

**内容要点：**

- OpenClaw 配置示例（不写真实 host/keys）：

```json5
{
  models: {
    providers: {
      sub2api: {
        baseUrl: "http://gateway-host:18081/v1",
        wsUrl: "ws://gateway-host:18081/v1/responses",
        wsHeaders: { session_id: "{sessionId}" }, // 具体占位符策略由实现决定
        api: "openai-responses",
        auth: "api-key",
        apiKey: "${SUB2API_API_KEY}",
        models: [
          {
            id: "gpt-5.3-codex",
            name: "gpt-5.3-codex",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 250000,
            maxTokens: 32768,
          },
        ],
      },
    },
  },
  agents: {
    defaults: {
      model: { primary: "sub2api/gpt-5.3-codex" },
      models: {
        "sub2api/gpt-5.3-codex": {
          params: {
            transport: "auto",
            responsesServerCompaction: true,
            cacheRetention: "long",
          },
        },
      },
    },
  },
}
```

> 注：`cacheRetention` 目前 OpenClaw 只对 Anthropic 生效；本计划会在实现时扩展到 openai-responses 或改用 `prompt_cache_retention` 直接注入。

---

## 5. 风险清单与防回归策略

- WS 风险：sub2api WS 若实现不完整，会导致工具调用循环中断。
  - 策略：OpenClaw 默认 `transport:"auto"`，失败自动回退 HTTP SSE；强制 `transport:"websocket"` 才报错。
- 字段支持不一致：某些上游账号/线路可能不支持 `prompt_cache_retention` / `context_management`。
  - 策略：sub2api 做 capability cache + 自动降级重试（和 previous_response_id 一样）。
- 计费/合规：`store=true` 会改变上游行为（可能增加存储/审计面）。
  - 策略：默认只在显式配置 `responsesServerCompaction:true` 时启用；并提供 `supportsStore:false` 覆盖。

---

## 6. 执行前需要你确认的 1 个选择（只问一个，避免来回）

你希望 **WebSocket 代理** 在 sub2api 侧采用哪种模式？

1. **直通代理（推荐）**：sub2api 作为 WS 反向代理，把客户端事件转发到上游 OpenAI WS，再把上游事件原样转回客户端。
2. **本地模拟**：sub2api 自己实现 Responses WS 事件机（不依赖上游 WS）。

我建议选 1（直通代理），实现成本最低、协议风险最小。
