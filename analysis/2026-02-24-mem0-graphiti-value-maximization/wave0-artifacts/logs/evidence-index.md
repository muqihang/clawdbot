# Wave0 证据索引清单（唯一检索入口）

- 生效范围：`analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/`
- 唯一检索入口：仅本文件的 `Active Evidence` 段。
- 规则：每个 `ArtifactID` 必须且只能映射一个唯一路径；仅 `Active Evidence` 计入“当前可检索证据”。
- 规则：`Planned Artifacts` 为计划产物，不计入当前审计闭环。

## Active Evidence（当前已存在且可审计）

| ArtifactID                                      | 证据类型                                | 唯一文件路径                                                                                                             | 审计状态 |
| ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------- |
| `W0-01-EVIDENCE-INDEX`                          | 证据总索引                              | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/evidence-index.md`                            | active   |
| `W0-01-D0-DECISION`                             | 决策记录（闭环状态）                    | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-d0-decision-record.md`                  | active   |
| `W0-01-CONSENSUS-TIMER`                         | 计时日志                                | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-01-consensus-timer-log.md`                 | active   |
| `W0-01-SIGNOFF-AUDIT`                           | 签署审计结果                            | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-signoff-audit-2026-02-24.md`            | active   |
| `W0-01-NOGO-ROLLBACK`                           | No-Go 回滚日志                          | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/w0-01-no-go-rollback-2026-02-24.md`           | active   |
| `W0-02-BASELINE-FREEZE`                         | W0-02 基线冻结主文档                    | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-baseline-freeze.md`                     | active   |
| `W0-02-CONFIG-SNAPSHOT`                         | W0-02 配置快照（非敏感）                | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/config-snapshot.json`                         | active   |
| `W0-02-INDEX-CHECK`                             | W0-02 index-check 结果                  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/index-check.json`                             | active   |
| `W0-02-REPORT-JSON`                             | W0-02 report JSON                       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.json`                                  | active   |
| `W0-02-REPORT-TXT`                              | W0-02 report 文本摘要                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/report.txt`                                   | active   |
| `W0-02-COMMAND-STATUS`                          | W0-02 命令矩阵落盘                      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/w0-02-command-status.json`                    | active   |
| `W0-02-S5-RETRIEVAL-EVAL`                       | W0-02 S5 基线指标快照                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day0/s5-retrieval-eval.json`                       | active   |
| `W0-03-IDENTITY-MAP-SPEC`                       | W0-03 身份映射规范                      | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-03-identity-map-spec.md`                   | active   |
| `W0-04-MESSAGE-ENVELOPE-SPEC`                   | W0-04 Message Envelope 草案             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-04-message-envelope-spec.md`               | active   |
| `W0-DAY1-CLOSURE`                               | Day1 闭环状态文档                       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day1/w0-day1-closure.md`                           | active   |
| `W0-05-METRIC-DICTIONARY-V1`                    | W0-05 指标口径字典冻结 v1               | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/metric-dictionary-v1.md`                      | active   |
| `W0-05-REPORTING-FIELD-GAP-CLOSURE`             | W0-05 报表字段缺口闭环                  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/reporting-field-gap-closure.md`               | active   |
| `W0-06-CONTEXT-TEMPLATE-SPEC`                   | W0-06 Context 模板草案                  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06-context-template-spec.md`               | active   |
| `W0-06B-PATCH-MANIFEST`                         | W0-06B Patch Manifest                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-patch-manifest.md`                     | active   |
| `W0-06B-REBUILD-VERIFY-LOG`                     | W0-06B 重建验证日志                     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-rebuild-verify.log`                    | active   |
| `W0-06B-COMMAND-STATUS`                         | W0-06B 命令状态矩阵                     | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-06b-command-status.json`                   | active   |
| `W0-DAY2-CLOSURE`                               | Day2 闭环状态文档                       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day2/w0-day2-closure.md`                           | active   |
| `W0-07-SYNC-SMOKE-RUNBOOK`                      | Day3 smoke 固化 runbook（Fix1）         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-07-sync-smoke-runbook.md`                  | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2`                | Day3 smoke r2 执行记录                  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.md`                  | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2-STATUS`         | Day3 smoke r2 状态机                    | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25-r2.status.json`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2-S1`             | Day3 smoke r2 S1 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s1.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2-S2`             | Day3 smoke r2 S2 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s2.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2-S3`             | Day3 smoke r2 S3 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s3.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3`                | Day3 smoke r3 执行记录                  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-26-r3.md`                  | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-STATUS`         | Day3 smoke r3 状态机                    | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-26-r3.status.json`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S1`             | Day3 smoke r3 S1 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s1.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S2`             | Day3 smoke r3 S2 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s2.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S3`             | Day3 smoke r3 S3 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S3-REPORT-JSON` | Day3 smoke r3 S3 report JSON            | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3-report.json` | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S3-REPORT-TXT`  | Day3 smoke r3 S3 report 文本            | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s3-report.txt`  | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S4`             | Day3 smoke r3 S4 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s4.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S4-NODES`       | Day3 smoke r3 S4 nodes 证据             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s4-nodes.json`  | active   |
| `W0-07-SYNC-SMOKE-2026-02-26-R3-S5`             | Day3 smoke r3 S5 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-26-r3-s5.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2-S4`             | Day3 smoke r2 S4 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s4.log`         | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2-S4-NODES`       | Day3 smoke r2 S4 nodes 证据             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s4-nodes.json`  | active   |
| `W0-07-SYNC-SMOKE-2026-02-25-R2-S5`             | Day3 smoke r2 S5 日志                   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-r2-s5.log`         | active   |
| `W0-DAY3-CLOSURE`                               | Day3 闭环收口文档                       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/w0-day3-closure.md`                           | active   |
| `W0-08-W0-PREREQ-CLOSURE`                       | W0->W1 条件 1 前提纠偏闭环审计          | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-prereq-closure.md`                        | active   |
| `W0-08-FALLBACK-FAULT-INJECTION-PLAN`           | W0->W1 条件 3 fallback+故障注入冻结审计 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/fallback-spec-and-fault-injection-plan.md`   | active   |
| `W0-08-METRIC-DICTIONARY-V1-SIGNOFF-AUDIT`      | D0 条件 4 指标字典签字审计              | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/metric-dictionary-v1-signoff-audit.md`       | active   |
| `W0-01-A6-GATE-REVIEW`                          | A6 验收文档                             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-gate-review.md`                           | active   |
| `W0-MASTER-CLOSURE`                             | Wave0 总收口文档                        | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-master-closure.md`                        | active   |
| `W0-U1-UNBLOCK-RECORD`                          | U1 unblock record                       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/u1-unblock-record.md`                         | active   |
| `W0-U1-TSGO-PRE-LOG`                            | U1 tsgo pre log                         | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/u1-tsgo-pre.log`                         | active   |
| `W0-U1-TSGO-PASS-LOG`                           | U1 tsgo pass log                        | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/u1-tsgo-pass.log`                        | active   |
| `W0-U6-CONDITION2-CLOSURE`                      | W0->W1 条件2 三日窗闭环文档             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/w0-condition2-three-day-report-closure.md`   | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-24-JSON`       | 条件2 日窗报告 2026-02-24（JSON）       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.json`            | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-24-TXT`        | 条件2 日窗报告 2026-02-24（文本）       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.txt`             | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-24-CMD`        | 条件2 日窗报告 2026-02-24（命令日志）   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-24.cmd.log`         | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-25-JSON`       | 条件2 日窗报告 2026-02-25（JSON）       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.json`            | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-25-TXT`        | 条件2 日窗报告 2026-02-25（文本）       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.txt`             | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-25-CMD`        | 条件2 日窗报告 2026-02-25（命令日志）   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-25.cmd.log`         | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-26-JSON`       | 条件2 日窗报告 2026-02-26（JSON）       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.json`            | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-26-TXT`        | 条件2 日窗报告 2026-02-26（文本）       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.txt`             | active   |
| `W0-U6-CONDITION2-REPORT-2026-02-26-CMD`        | 条件2 日窗报告 2026-02-26（命令日志）   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/condition2/report-2026-02-26.cmd.log`         | active   |

## Planned Artifacts（未来任务产物，不计入当前可检索证据）

| ArtifactID                         | 计划产物                | 计划路径（唯一）                                                                                            | 当前状态 |
| ---------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- | -------- |
| `W0-01-S4-INDEX-CHECK-2026-02-24`  | S4 index-check 执行日志 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/s4-index-check-2026-02-24.json`  | planned  |
| `W0-01-S4-SEARCH-NODES-2026-02-24` | S4 nodes 证据日志       | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/logs/s4-search-nodes-2026-02-24.json` | planned  |
| `W0-01-A2-D0-SYNC-POLICY`          | A2 验收文档             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/gates/d0-sync-policy.md`              | planned  |
| `W0-01-A5-SYNC-SMOKE-2026-02-27`   | A5 验收文档             | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-27.md`        | planned  |

## Historical Evidence（历史留档，不计入当前可检索证据）

| ArtifactID                              | 历史产物               | 历史路径（唯一）                                                                                              | 当前状态   |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| `W0-07-SYNC-SMOKE-2026-02-25-R1`        | Day3 smoke r1 执行记录 | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25.md`          | historical |
| `W0-07-SYNC-SMOKE-2026-02-25-R1-STATUS` | Day3 smoke r1 状态机   | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/sync-smoke-2026-02-25.status.json` | historical |
| `W0-07-SYNC-SMOKE-2026-02-25-R1-S1`     | Day3 smoke r1 S1 日志  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s1.log` | historical |
| `W0-07-SYNC-SMOKE-2026-02-25-R1-S2`     | Day3 smoke r1 S2 日志  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s2.log` | historical |
| `W0-07-SYNC-SMOKE-2026-02-25-R1-S3`     | Day3 smoke r1 S3 日志  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s3.log` | historical |
| `W0-07-SYNC-SMOKE-2026-02-25-R1-S4`     | Day3 smoke r1 S4 日志  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s4.log` | historical |
| `W0-07-SYNC-SMOKE-2026-02-25-R1-S5`     | Day3 smoke r1 S5 日志  | `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-artifacts/day3/logs/sync-smoke-2026-02-25-s5.log` | historical |
