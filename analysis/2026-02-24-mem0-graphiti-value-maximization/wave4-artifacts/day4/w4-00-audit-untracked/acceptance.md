# W4-00 Acceptance: 审计式收口未跟踪文件（ignore 策略）

## 目标

将与 WaveGate 无关、且不应纳入当前审计链路的本地草稿/资料文件进行“可审计收口”：

- **不删除/不移动** 任何文件；
- 仅通过 `.gitignore` 做 **最小范围** 的 ignore，让工作树保持可审计的 clean 状态；
- 明确保留 Wave 证据目录 `analysis/2026-02-24-mem0-graphiti-value-maximization/**` 的可追溯性（不做宽泛 ignore）。

## changed_files

- `.gitignore`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day4/w4-00-audit-untracked/acceptance.md`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day4/w4-00-audit-untracked/untracked.before.txt`
- `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day4/w4-00-audit-untracked/untracked.after-ignore.txt`

## acceptance_check

- before：
  - 见 `untracked.before.txt`（`git ls-files --others --exclude-standard` 抽样快照）
- after：
  - 见 `untracked.after-ignore.txt`（应为空；表示未跟踪噪声已被 ignore，不再污染 `git status`）
- 核心约束：
  - ignore 规则仅覆盖明确列出的本地草稿路径与单个根目录文件，不包含任何 Wave\* evidence 根目录的宽泛通配。

## unresolved

- None
