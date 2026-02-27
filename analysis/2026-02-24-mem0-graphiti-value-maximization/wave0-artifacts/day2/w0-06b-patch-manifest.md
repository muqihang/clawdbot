# W0-06B Patch Manifest（Graphiti 运行态补丁固化）

## 元信息

- author: Codex 子代理 `#W0-06B-Implementer-Fix1`
- timestamp (UTC+08:00): `2026-02-25 13:51:39 +0800`
- update_round: `Fix2`
- update_author: Codex 子代理 `#W0-06B-Implementer-Fix2`
- update_timestamp (UTC+08:00): `2026-02-25 14:36:30 +0800`
- scope: `W0-06B` 仅覆盖运行态补丁盘点与重建验证证据；不修改业务代码（`src/`、`extensions/`、`package.json`、lockfile 均未触碰）

## Patch 清单（来源与作用域）

| 名称                                                  | 类型          | 目标文件/目录                                                                                                           | 作用                                                                                                                            | 验证方式                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/memory-stack/patches/graphiti-source.patch`  | source patch  | Graphiti 源码：`server/graph_service/config.py`、`server/graph_service/main.py`、`server/graph_service/zep_graphiti.py` | 固化 Graphiti 运行态兼容项：拆分 LLM/Embedding 配置、引入共享 client 生命周期（含 `shutdown_graphiti`）                         | 1) `bootstrap.sh` 应用 patch（`scripts/memory-stack/bootstrap.sh:26`、`scripts/memory-stack/bootstrap.sh:29`） 2) marker 校验（`scripts/memory-stack/bootstrap.sh:39`、`scripts/memory-stack/bootstrap.sh:40`、`scripts/memory-stack/bootstrap.sh:41`） |
| `scripts/memory-stack/patches/mem0-server-main.patch` | source patch  | Mem0 源码：`server/main.py`                                                                                             | 固化 Mem0 默认配置到 Qdrant/OpenAI 兼容路由，且默认实例初始化失败时进入 `/configure` 等待态                                     | 1) `bootstrap.sh` 应用 patch（`scripts/memory-stack/bootstrap.sh:32`、`scripts/memory-stack/bootstrap.sh:35`） 2) marker 校验（`scripts/memory-stack/bootstrap.sh:44`、`scripts/memory-stack/bootstrap.sh:45`）                                         |
| `scripts/memory-stack/patch-graphiti-sitepkg.py`      | sitepkg patch | Graphiti venv site-packages：`graphiti_core/llm_client/openai_client.py`                                                | 注入 strict JSON schema 构造、补 `json` keyword 提示，并关闭 reasoning/verbosity kwargs 透传以提升 OpenAI-compatible 网关兼容性 | 1) `bootstrap.sh` 调用（`scripts/memory-stack/bootstrap.sh:52`） 2) 补丁脚本内 marker 自检（`scripts/memory-stack/patch-graphiti-sitepkg.py:199`）                                                                                                      |
| `scripts/memory-stack/patch-mem0-sitepkg.py`          | sitepkg patch | Mem0 venv site-packages：`mem0/llms/openai.py`                                                                          | 增加 `MEM0_USE_RESPONSES_API` 开关与 Responses API 路径，保留回退 chat.completions 路径                                         | 1) `bootstrap.sh` 调用（`scripts/memory-stack/bootstrap.sh:56`） 2) 补丁脚本内 marker 自检（`scripts/memory-stack/patch-mem0-sitepkg.py:84`）                                                                                                           |

补充：本仓库根目录 `patches/` 当前仅含 `.gitkeep`，W0-06B 实际生效 patch 来源为 `scripts/memory-stack/patches/*.patch`。

## Rebuild 结果摘要（Fix1）

- 结论：**FAIL（干净重建链路未闭环）**。
- 本轮复跑环境（独立可写 root + 独立端口）：
  - `OPENCLAW_MEMORY_STACK_ROOT=/tmp/openclaw-memory-stack-w06b-fix1-20260225-134758`
  - `GRAPHITI_PORT=18080`
  - `MEM0_PORT=18766`
- 命令链结果：
  - `bootstrap.sh`：exit `0`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:330`）
  - `start.sh`：exit `1`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:343`）
  - `smoke.sh`：exit `7`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:356`）
  - `status.sh`：exit `0`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:370`）
- blocker（据实）：
  - blocker_type: `runtime-patch-syntax-error`
  - 阻断步骤：`scripts/memory-stack/start.sh`（Graphiti 未转为健康态，`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:338`）
  - 根因证据：Graphiti 进程启动时报 `SyntaxError: unterminated string literal`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:453`）
- 通过判据核对：
  - `graphiti episodes>=1 facts>=1`：**未满足**（`smoke.sh` 连接 18080 失败，`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:351`）
  - `mem0 add_results>=1 search_results>=1`：**未满足**（同上，`smoke.sh` 提前失败）
  - `status health=ok`：**部分满足**（Mem0 为 `health=ok`，Graphiti 为 `health=down`；`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:364`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:365`）
- 判定说明：**“重建后自动生效”结论 = fail**。

## Rebuild 结果摘要（Fix2）

- 结论：**PASS（干净重建链路闭环）**。
- 最小修复点（仅 infra 脚本）：
  - `scripts/memory-stack/patch-graphiti-sitepkg.py` 将 `ensure_helper_block` 从字符串 replacement 改为函数 replacement（`re.subn(..., helper_replacement, ...)`），避免 regex replacement 层解释 `\n` 导致注入后字符串断裂。
- 本轮复跑环境（独立可写 root + 独立端口）：
  - `OPENCLAW_MEMORY_STACK_ROOT=/tmp/openclaw-memory-stack-w06b-fix2-20260225-141717`
  - `GRAPHITI_PORT=18082`
  - `MEM0_PORT=18768`
- start 前前置检查（必做）：
  - `python3.13 -m py_compile` patched `openai_client.py`：pass（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:482`）
  - 关键行含字面量 `\n`（非断行字符串）：pass（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:484`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:485`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:486`）
- 命令链结果：
  - `bootstrap.sh`：exit `0`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:473`）
  - `start.sh`：exit `0`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:506`）
  - `smoke.sh`：exit `0`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:521`）
  - `status.sh`：exit `0`（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:535`）
- 判据核对：
  - `graphiti episodes>=1 facts>=1`：满足（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:514`）
  - `mem0 add_results>=1 search_results>=1`：满足（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:515`）
  - `status health=ok`（graphiti + mem0）：满足（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:529`、`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:530`）
- closure_check（Fix2 最终判定）：
  - `py_compile_openai_client_pass = pass`
  - `clean_rebuild_chain_complete = pass`
  - `rebuild_auto_effective_claim = pass`

> 注：本文件中的 Fix1 失败信息保留为历史记录；当前任务判定以 Fix2 结果为准。

## 失败步骤与补救建议（不改代码）

1. 失败步骤：`start.sh`（exit `1`）
   - 错误摘要：Graphiti 进程未进入健康态（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:338`）。
2. 失败步骤：`smoke.sh`（exit `7`）
   - 错误摘要：Graphiti 端口 `18080` 连接失败（`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:351`）。
3. 下一步建议（不改业务代码）：
   - 建议 A：先对比 `patch-graphiti-sitepkg.py` 预期产物与本轮实际生成的 `openai_client.py`（日志已给出 `SyntaxError` 位置），确认 patch 产物是否被截断。
   - 建议 B：修复 patch 生成逻辑后，用**新的** `/tmp/openclaw-memory-stack-w06b-fix1-<timestamp>` 复跑 `bootstrap -> start -> smoke -> status`，继续保留同格式审计日志。
   - 建议 C：若需临时验证 Mem0 路径，可单独保留本轮 `mem0 health=ok` 证据，但不得据此宣称整链路通过。

## 回滚方案

1. 恢复上一版 patch 清单（`scripts/memory-stack/patches/*.patch` + `scripts/memory-stack/patch-*-sitepkg.py`）。
2. 使用同一环境变量模板重新执行 `scripts/memory-stack/bootstrap.sh`，确保 source/sitepkg patch 与上版一致。
3. 再执行 `scripts/memory-stack/start.sh`、`scripts/memory-stack/smoke.sh`、`scripts/memory-stack/status.sh`，并将新日志归档到 `wave0-artifacts/day2/`。

最终判定以 Fix2 为准，Fix1 仅历史留档，不参与当前 Gate 判定。

## Fix2 最终验收矩阵（P1-P6，authoritative）

| ID  | owner           | 步骤                              | pass/fail | 证据路径                                                                                                  |
| --- | --------------- | --------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| P1  | Ops + Eng-Infra | 盘点 source patch 来源与作用域    | pass      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-patch-manifest.md:11`   |
| P2  | Ops + Eng-Infra | 盘点 sitepkg patch 来源与作用域   | pass      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-patch-manifest.md:13`   |
| P3  | Ops             | 执行 `bootstrap.sh` 并记录退出码  | pass      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:473` |
| P4  | Ops             | 执行 `start.sh` 并记录退出码      | pass      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:506` |
| P5  | Ops + QA        | smoke 输出 Graphiti+Mem0 关键计数 | pass      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:521` |
| P6  | Ops + QA        | status 显示健康探针可用           | pass      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log:535` |
