# W5-0 写链路正式状态

## 1. 正式命名

当前写链路的正式命名是：

> **提案优先 + admission 评估 + canary commit 的半落地实验态**

## 2. 核心状态位

| 字段                     | 当前值         | 结论                                     |
| ------------------------ | -------------- | ---------------------------------------- |
| `write_mode`             | `propose_only` | 写链路不是 `off`                         |
| `p3.auto_worker`         | `true`         | 后台 worker 自动跑                       |
| `p3.admission_enabled`   | `true`         | commit 会经过 admission 评估             |
| `p3.commit_canary_ratio` | `0.05`         | 当前是 5% canary commit，不是全量 commit |
| `outbox.enabled`         | `false`        | 不是写主闸门                             |
| `outbox.db_path`         | 已配置         | P3 状态机有真实存储落点                  |

## 3. 为什么它不是空白

### 已发生事实

1. 只要 `write_mode !== off`，bridge 就会进入写捕获状态。
2. 只要 `p3.auto_worker && shouldCaptureWrites`，后台 worker 就会自动运行。
3. worker 会尝试对 Mem0 与 Graphiti 执行远端写入。
4. 双写成功后，会根据 admission 条件与 canary 结果决定 proposal 的后续状态。
5. 通过 `commitCandidate()` 的候选会进入 canonical facts，并把 proposal 状态更新为 `committed`；低置信冲突会变成 `pending_review`；未通过 admission 的候选会保留为 `proposed`。

## 4. 为什么它也不是全量 canonical commit

1. 当前 `write_mode=propose_only`，不是 `propose_commit`。
2. 当前 `commit_canary_ratio=0.05`，commit 只发生在 canary 抽样子集。
3. proposal / canary / manual commit 的长期 operating model 还没有正式冻结。
4. 分账报表、回滚 drill、人工治理界面还未被提升成正式治理对象。

## 5. 当前 operating model

1. 自动捕获写事件。
2. 自动运行后台 worker。
3. 自动执行远端双写（Mem0 + Graphiti）。
4. 自动执行 admission 评估。
5. 在 `propose_only` 下，仅对命中 canary 且满足 admission 条件的候选执行 commit。
6. 对未通过条件的候选保留 proposal/pending_review 状态，等待治理。

## 6. 两个必须纠偏的结论

- `propose_only` **不等于** 零 commit。
- `outbox.enabled` **不是** 写主闸门。

## 7. 风险清单

1. 当前写态已经存在真实副作用，但治理语义还没完全收口。
2. 如果不显式分账，`proposal`、`canary commit`、`manual commit` 很容易被混写。
3. 如果把 `outbox.enabled` 当主闸门，操作与周报都会误导。
4. 如果把当前状态写成“完全上线”，会掩盖 `W5-B` 仍要做的工作。

## 8. 进入 `W5-A` 前必须保留的写语义

1. `write_mode` 仍是总开关。
2. `p3.auto_worker` 仍决定自动 worker 是否运行。
3. `p3.admission_enabled` 仍决定 commit 是否进入 admission 评估。
4. `p3.commit_canary_ratio` 仍决定 `propose_only` 下的 canary commit 规模。
5. `proposal` / `pending_review` / `committed` 三类状态语义必须继续保留。
