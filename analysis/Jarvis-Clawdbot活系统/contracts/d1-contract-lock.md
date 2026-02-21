# D1 Contract Lock

- generated_at: 2026-02-18T00:00:00.000Z
- batch: Batch-2（T00-04 / T00-05 / T00-06）
- lock_rule: `lock_ready=true && unresolved=0`
- gate_note: 未通过锁定检查时禁止进入 Batch-3

## Inputs

- diff_json: `analysis/Jarvis-Clawdbot活系统/contracts/d1-contract-diff.json`
- diff_markdown: `analysis/Jarvis-Clawdbot活系统/contracts/d1-contract-diff.md`
- flags_contract: `analysis/Jarvis-Clawdbot活系统/contracts/flags-contract-v1.json`

## Sign-off

- 主审：signed
- DB：signed
- API：signed
- 插件：signed

## Lock Checklist

- `d1-contract-diff.json` 可解析且包含 `unresolved_without_owner`
- `d1-contract-diff.md` 覆盖 diff item ID
- `flags-contract-v1.json` 包含 15 个 canonical flags 且默认值匹配
- 签名区完整（主审/DB/API/插件）
