# 指标口径字典 v1 签字审计（Gate D0 条件 4）

## 1) 元信息

- ArtifactID: `W0-08-METRIC-DICTIONARY-V1-SIGNOFF-AUDIT`
- checker: `子代理 #W0-U5-Implementer`
- checked_at_utc: `2026-02-26T05:42:35Z`
- checked_at_utc8: `2026-02-26T13:42:35+08:00`
- timezone: `UTC / Asia/Shanghai (UTC+08:00)`
- scope: 仅用于 Gate D0 条件 4「指标口径字典 v1 冻结并签字」的可复核审计；不改变 Gate 最终结论。

## 2) 判定规则（机械）

| rule_id | 判定规则                     | 通过阈值                                                                                                                        | 失败阈值                   |
| ------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| S1      | 字典文件存在且可读           | `metric-dictionary-v1.md` 可读取                                                                                                | 文件不存在或不可读         |
| S2      | 字典文件必须存在签字记录     | 命中 `签字/签署/signoff/signed_by/signature` 之一，且非占位符                                                                   | 无命中或仅占位符           |
| S3      | 签字必须满足角色与时间可复核 | 至少包含 `Quality` 与 `Jarvis` 两角色签字 + 时间戳                                                                              | 任一角色缺失或时间字段缺失 |
| S4      | 结论公式固定可复算           | `derived_status = pass_signed if (S1==pass and S2==pass and S3==pass) else fail_not_signed`，且 `derived_status` 与记录结论一致 | 公式无法计算或结果不一致   |

## 3) 核查结果（本次）

| check_id | check_cmd_or_rule                          | observed                                                                  | evidence_pathline                                                                                                                                                                                                                                                                                                                                                                                                                  | result    |
| -------- | ------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1       | 文件存在性检查                             | 目标文件存在且可读                                                        | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:1`                                                                                                                                                                                                                                                                                                                              | `pass`    |
| S2       | `rg -n "签字                               | 签署                                                                      | signoff                                                                                                                                                                                                                                                                                                                                                                                                                            | signed_by | signature" .../metric-dictionary-v1.md` | 命中签字区块与签字文本（`rg_exit=0`） | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:137`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:143`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:151` | `pass` |
| S3       | 角色签字（Quality + Jarvis）与时间字段检查 | 已存在 Quality 与 Jarvis 双角色签字，且每条签字都含 UTC 与 UTC+08:00 时间 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:142`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:145`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:150`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md:153` | `pass`    |
| S4       | 结论公式复算一致性                         | 按公式复算 `derived_status=pass_signed`，与记录结论一致                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/metric-dictionary-v1-signoff-audit.md:19`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/metric-dictionary-v1-signoff-audit.md:34`; `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/metric-dictionary-v1-signoff-audit.md:35`                                                                | `pass`    |

## 4) 结论字段（可复算）

- passed_checks: `4`
- total_checks: `4`
- formula: `derived_status = pass_signed if (S1==pass and S2==pass and S3==pass) else fail_not_signed`
- metric_dictionary_signoff_status: `pass_signed`
- gate_d0_condition_4_result: `pass`
- note: 指标口径字典 v1 已完成双角色签字（Quality + Jarvis），结论可复算且可审计。
