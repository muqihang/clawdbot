# W1-R1 Retrieval Path Fix Receipt (Day11)

- owner: `A (Implementer)`
- scope: `W1-R1 最小修复（仅修“假失败路径”）`
- execution_date_utc: `2026-02-27`

## root_cause_evidence

- 已确认根因：`retrieval-eval` 的显式相对路径通过 `resolveCliPath` 走 `workspaceDir`，当 `workspaceDir != cwd` 时会把 `--dataset`/`--out` 误解析到工作区根，而不是执行目录。
- 已有现场证据（任务输入确认）：
  - `pnpm openclaw memory-bridge-p3 retrieval-eval --dataset .openclaw/...` 在当前环境误解析到 `/Users/muqihang/clawd/.openclaw/...` 并报 `ENOENT`。
- 本次 TDD 红灯复现证据（新增用例首次运行，exit code=`1`）：
  - `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts` 中 retrieval-eval 用例失败，错误为：
  - `ENOENT: no such file or directory, open '/var/folders/.../openclaw-p3-workspace-.../analysis/day11/retrieval-dataset.json'`
  - 该失败路径落在临时 `workspaceDir`，与预期 `cwd` 不一致，复现了“假失败路径”。

## implementation

- 仅改动 `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts`：
  - `retrieval-eval` 命令中 `--dataset` 与 `--out` 解析，从 `resolveCliPath` 改为 `resolveReportOutputPath`。
  - 解析语义与 HF4 `report` 保持一致：
    - 未传值：仍按 `workspaceDir + defaultRelativePath`。
    - 传显式相对路径：按 `process.cwd()` 解析。
    - 传绝对路径：保持原样。
- 增加最小测试：`extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts`
  - 新增用例覆盖 `workspaceDir != cwd` 时 `retrieval-eval --dataset/--out` 显式相对路径按 `cwd` 落盘并成功执行。

## test_commands

- red (TDD):
  - command: `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts`
  - exit_code: `1`
  - summary: `2 tests | 1 failed`（retrieval-eval 路径解析失败，ENOENT 指向 workspaceDir）

- green:
  - command: `pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts`
  - exit_code: `0`
  - summary: `1 file passed; 2 tests passed; 0 failed`

- self_check_round_2:
  - command: `rg -n "command(\"retrieval-eval\"|datasetPath = resolveReportOutputPath|outputPath = resolveReportOutputPath" extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts && pnpm vitest run --config vitest.extensions.config.ts extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts`
  - exit_code: `0`
  - summary: `retrieval-eval 位点已切换到 resolveReportOutputPath；测试再次全绿`

## command_compatibility

- 本批未执行 `pnpm openclaw ...` 运行链路命令，因此无 `node openclaw.mjs ...` fallback 触发项。
- primary/fallback exit code: `N/A`。

## acceptance

- changed_files: [
  `extensions/memory-mem0-graphiti-bridge/src/p3/manual-cli.ts`,
  `extensions/memory-mem0-graphiti-bridge/src/__tests__/p3-manual-cli-path-resolution.test.ts`,
  `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-artifacts/day11/w1-r1-retrieval-path-fix-receipt.md`
  ]
- acceptance_check: `pass`
  - `AC-R1-1`: `PASS` — `retrieval-eval` 显式相对 `--dataset/--out` 与 `report` 一致按 `cwd` 解析。
  - `AC-R1-2`: `PASS` — `workspaceDir != cwd` 场景新增测试覆盖并通过。
  - `AC-R1-3`: `PASS` — 仅做 W1-R1 假失败路径修复，未触碰 W1-A~W1-D 业务逻辑、Gate-1 公式与服务运维脚本。
- unresolved: [
  `scripts/memory-stack/status.sh` 显示 graphiti/mem0 down（FUR=0 的运行时前提之一），本批按范围保留未处理。`
  ]
