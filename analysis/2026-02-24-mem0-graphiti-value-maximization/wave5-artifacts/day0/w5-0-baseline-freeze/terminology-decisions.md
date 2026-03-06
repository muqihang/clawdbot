# W5-0 术语决策

## 1. 主结论

`W5-0` 后，`builtin / qmd / local / fallback / bridge / proposal / canary commit / manual commit` 必须一词一义，禁止再混层使用。

## 2. 术语表

| 术语            | 正式定义                                                         | `day33` 中的含义           | 本机当前中的含义                     | 允许用法                              | 禁止用法                                 |
| --------------- | ---------------------------------------------------------------- | -------------------------- | ------------------------------------ | ------------------------------------- | ---------------------------------------- |
| `builtin`       | OpenClaw 默认本地 memory backend                                 | `local` 实际落到 `builtin` | 不是当前本机本地后端                 | 用于 `day33` 正式主路径               | 不能等同于 bridge                        |
| `qmd`           | 显式启用的本地 memory backend                                    | 不属于 `day33` 正式基线    | 本机当前 `local` 实际落点            | 仅描述本机现地画像                    | 不能写成 `W5` 正式主线                   |
| `local`         | bridge 的本地路由标签                                            | `builtin`                  | `qmd`                                | 只能在说明“bridge 路由指向何处”时使用 | 不能脱离上下文直接替代后端名             |
| `fallback`      | bridge 的回退行为描述                                            | 回退到 `local`             | 回退到 `local`，即当前回退到 `qmd`   | 用于描述“主路由失效后的行为”          | 不能替代“基础记忆层”概念                 |
| `bridge`        | 占据 `memory` slot 的编排层                                      | 读主链路承接层             | 读主链路承接层 + 写态挂钩层          | 用于描述主入口与策略层                | 不能当成某个单一远端服务                 |
| `proposal`      | 已捕获、已进入 P3 状态机，但尚未 canonical committed 的候选写入  | 非 `day33` 正式口径        | 当前写链路真实存在                   | 用于描述提案状态                      | 不能写成“已经 commit”                    |
| `canary commit` | `propose_only` 下通过 admission 且命中 canary 比例的 commit 路径 | 非 `day33` 正式口径        | 当前本机写链路真实存在               | 用于描述 5% 试点 commit               | 不能写成“全量 canonical commit”          |
| `manual commit` | 显式 `propose_commit` / 人工放权 commit 路径                     | 非 `day33` 正式口径        | 当前默认未开启，但必须和 canary 分账 | 用于未来明确区分显式 commit 类型      | 不能用来描述当前 `propose_only + canary` |

## 3. 主路径叙事冻结

- 正式基线：`builtin + bridge + mem0 + graphiti`
- 本机现地：`qmd + bridge + mem0 + graphiti`
- 当前 `qmd` 地位：**现地画像，不是正式主线**

## 4. 必须禁止的混写

1. 把 `local` 固定写成 `builtin`。
2. 把 `local` 固定写成 `qmd`。
3. 把 `fallback` 当成“基础记忆层”的正式术语。
4. 把 `proposal` 写成“零 commit”。
5. 把 `canary commit` 写成“全量 canonical commit”。
6. 把当前本机 `qmd` 写成 `W5` 正式推荐主线。
