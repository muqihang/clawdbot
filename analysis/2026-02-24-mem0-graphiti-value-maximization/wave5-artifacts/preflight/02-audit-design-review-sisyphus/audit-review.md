# OpenClaw Mem0 + Graphiti 升级方案设计审计（W0-W4）

## 0. 审计结论

### 最终判断

**结论：这套方案方向是对的，`W4` 结果也证明它已经能在当前口径下带来真实收益；但前半程的设计与排障方法存在明显缺陷，因此更准确的结论不是“设计完美”，而是“方向正确、收口成功、需要带着风险清单进入 W5”。**

我给出的最终判定是：

- **可以进入 `W5`，但需带着风险清单。**

原因很具体：

1. **收益已经被证明。** 最新 `Gate-4` 已经同时满足质量、速度、稳定性四条门禁：`top1_avg_delta_pp=74.8`、`fur_delta_pp=72.58`、`p95_increase_pct=13.7122`、`stability.pass=true`，见 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json:1`。
2. **角色分工在方向上是合理的。** 最初方案就把三层角色定义为“`Mem0` 做记忆提炼与治理，`Graphiti` 做关系与时序，本地索引做确定性与兜底”，见 `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md:1`。
3. **前半程确实走过弯路。** 典型问题包括：把远端错误吞成空结果、没有补齐 `Mem0` 搜索作用域字段、错误依赖不存在的本地嵌入端口、过度依赖 generic `/search` 而没有充分吃到 `Graphiti` 的图能力。这些不是小噪声，而是设计与实现共同暴露出的缺口。
4. **`W4` 的最终收口更多是“收回到合理区间”，还不是“长期架构已经优雅定型”。** 尤其是 `Graphiti` 仍主要被当成一个图味更强的远端检索器来用，而不是完整吃到官方建议的命名空间、重排器、焦点节点和图级范围控制能力。

所以，`W5` 可以开始，但不宜带着“已经彻底定型”的心态开始。

---

## 1. 审计方法与证据范围

本次审计同时看了三类证据：

1. **原始设计蓝图**
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.md`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/openclaw-mem0-graphiti-upgrade-v1.1.md`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave1-execution-task-packages.md`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-execution-task-packages.md`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-execution-task-packages.md`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-execution-task-packages.md`

2. **当前真实实现**
   - builtin local memory：`src/agents/tools/memory-tool.ts:35`、`src/memory/backend-config.ts:72`、`src/memory/hybrid.ts:33`
   - bridge：`extensions/memory-mem0-graphiti-bridge/src/router/read-router.ts:1`、`extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts:20`、`extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts:80`、`extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:1727`
   - memory stack：`scripts/memory-stack/start.sh:1`、`scripts/memory-stack/common.sh:220`、`docs/operations/memory-stack-selfhost.md:1`

3. **最终收口证据**
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json:1`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/gate4.go-no-go.summary.json:1`
   - `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/preflight/external-notes.md:1`

另外，本次审计**明确引入了外部资料**，不再只围着本地现象打转。外部资料见 `external-sources.md`。

---

## 2. 已确认事实

### 2.1 这套方案的总体方向没有错

最初设计文档对三层角色的定义是清楚的：

- `Mem0`：记忆提炼与治理
- `Graphiti`：关系与时序
- local：确定性兜底与精确保护

这不是后验解释，而是在方案总览里一开始就写明了，见 `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md:4` 和 `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md:52`。

这说明**架构方向本身并没有跑偏**。

### 2.2 builtin local 不是“弱兜底”，而是有真实检索能力的控制面

当前 builtin local 的默认后端就是 `builtin`，不是 `qmd`，见 `src/memory/backend-config.ts:72`。并且 builtin 本身支持：

- 关键词全文检索
- 向量检索
- 混合打分
- `MMR` 重排
- 时序衰减

对应实现见：

- FTS 构造：`src/memory/hybrid.ts:33`
- 混合合并：`src/memory/hybrid.ts:51`
- `MMR` 与时序衰减：`src/memory/hybrid.ts:133`
- manager 里的 hybrid / fts 路径：`src/memory/manager.ts:260`

所以 local 在这套体系里不应该被理解成“只有出错才用”，更准确的角色是：

- 精确与确定性保护层
- 本地语料控制面
- 成本与可控性兜底层

### 2.3 `Mem0` 的真实价值不是“另一个搜索引擎”，而是带作用域和治理语义的记忆层

当前 bridge 已经把 `user_id / agent_id / run_id` 作为搜索参数的一部分接入 `Mem0` 请求体，见 `extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts:20` 与 `extensions/memory-mem0-graphiti-bridge/src/client/mem0-client.ts:424`。

这和 `Mem0` 官方文档是对齐的：官方把这些字段定义成记忆作用域主键，而不是可有可无的辅助字段。也就是说，`Mem0` 更像“带范围约束的记忆治理层”，不是简单向量召回层。

### 2.4 `Graphiti` 的价值是真实存在的，但实现上还没完全吃满

当前方案里，`Graphiti` 已经为 `Gate-4` 提供了非常强的增益；最终 `variant` 在四桶上都是 `1.0` 命中，见 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave4-artifacts/day33/w4-r24-gate4-single-primary-maxfacts1/report/w4-gate4-delta.json:3`。

但当前实现层面，`Graphiti` 仍主要通过通用 `/search` 客户端接入，默认只传 `query + max_facts`，见 `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts:83`。这离官方文档里建议使用的：

- 命名空间 `group_id / group_ids`
- 焦点节点重排
- 图搜索范围控制
- 更丰富的 reranker

还有明显距离。

### 2.5 `W4` 最终是靠“结构性修正”过线，不只是碰巧

最后这次 `GO`，不是单一参数侥幸调出来的，而是几刀叠加：

1. 不再对每条查询都同时打两条远端，而是改成**单主远端 + 失败再补另一条**，见 `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:2502`。
2. `Graphiti` 默认 `max_facts` 从 `2` 收到 `1`，直接砍掉尾延迟，见 `extensions/memory-mem0-graphiti-bridge/src/client/graphiti-client.ts:90`。
3. `Neo4j Aura` 连接方式在本地做了稳定性规整，见 `scripts/memory-stack/common.sh:220`。
4. 远端错误、回退原因、路由、recipe、时序过滤、ontology 回读等诊断字段已经进入工具输出，见 `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:1727`。

因此，`W4` 过线不是运气，而是靠设计与实现同步修正后的结果。

---

## 3. 高置信推断

### 3.1 早期最大问题不是“方案方向错了”，而是“没有把外部契约当成设计约束”

从本地证据看，前期几个关键问题都不是“算法能力不够”，而是**上游契约没有被认真当约束**：

- `Mem0 search` 需要作用域标识，但最初没透传，导致 500 后又被吞成空结果。
- `Graphiti` 有分数缺失场景，最初没有统一补平，导致跨源不可比。
- 本地嵌入曾经错误指向无效端口，说明“向量链路”在设计阶段没有被明确冻结成硬约束。
- `Graphiti` 其实支持 `group_ids`、reranker、图级范围，但 bridge 长时间只按 generic `/search` 用。

这说明问题更接近：

- **契约建模不足**
- **外部最佳实践引入过晚**
- **前期排障过于依赖本地试错**

### 3.2 当前架构已经具备进入 `W5` 的基础，但还没有达到“长期稳态架构”

为什么说可以进 `W5`：

- 门禁通过了；
- 三层角色已经收敛；
- 评测体系已经足够硬；
- 收口证据可复算。

为什么说还不是长期稳态：

- 关键逻辑高度集中在 `memory-search-tool.ts`，单文件超过 `3000` 行，见 `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts` 的行数统计；
- `Graphiti` 的图能力只吃到了浅层；
- self-host stack 仍然重运维、重脚本、重外部状态；
- local fallback 这个名字容易误导，因为它在当前配置下并不是完全脱网的本地层。

### 3.3 `qmd` 暂时退出主线是合理决定

从本地实现和运行现象看，`qmd` 的 `query` 模式在 CPU 或本机压力下明显更容易拖慢，`src/memory/backend-config.ts:77` 甚至直接写了：`query` 模式在 CPU-only 系统上可能非常慢。

而 builtin local 已经有：

- 关键词检索
- 向量检索
- 混合重排
- 时序衰减

所以当前阶段把 local fallback 固定到 builtin，是一个合理的工程取舍，不是退步。

### 3.4 下一轮真正值得做的不是再微调权重，而是把 `Graphiti` 用得更“像 Graphiti”

从官方资料看，`group_ids` 命名空间的官方定位之一就是“通过缩小搜索空间提升查询性能”。这和我们现在的尾延迟问题是直接相关的。

但社区近期又有一个现实问题：多 `group_id` 的全文检索存在“只实际使用最后一个组”的风险。这意味着下一步如果做 `group_ids` 优化，必须非常谨慎。

因此我判断：

- **下一步价值最高的优化，不是继续改 bucket 权重，而是上 `Graphiti` 限组搜索。**
- 但这个优化必须走“安全版”：先单组验证，或先修 `Graphiti` 那个多组问题。

---

## 4. 优点：哪些设计是做对了的

### 4.1 三层分工是正确的

这套方案最值得肯定的地方，就是没有试图让一个组件包打天下。

- builtin：确定性与控制
- `Mem0`：作用域化与治理
- `Graphiti`：关系与时序

这比“只押一个远端后端”更适合 `OpenClaw` 这种真实代理场景。

### 4.2 门禁式推进是正确的

`W0-W4` 文档里虽然有不少理想化成分，但“按波次推进、每波要有 Go/No-Go、无证据即不放行”这个制度设计是对的，见 `analysis/2026-02-24-mem0-graphiti-value-maximization/wave0-execution-task-packages.md:1` 与 `docs/plans/2026-03-02-wave4-gate4-final.md:1`。

这套门禁制度本身，是应该带进 `W5` 的。

### 4.3 观测性已经从“几乎没有”进化到了“可排障”

现在桥接层已经有：

- `route`
- `fallback`
- `recipe`
- `temporal_filters`
- `ontology_v1`
- `fusion_shadow`

这些都已经进入工具输出，见 `extensions/memory-mem0-graphiti-bridge/src/tools/memory-search-tool.ts:1741`。

这意味着系统从“错了只知道空”变成“错了知道是哪一路、为什么退回、用了什么策略”。这是非常关键的成熟化进展。

### 4.4 `W4` 最终的速度修正是有工程价值的

最终收口不是继续暴力并行两条远端，而是回到更合理的单主远端策略。这一点很重要，因为它说明方案没有被“指标焦虑”带偏到一个长期不可用的架构。

---

## 5. 缺陷：哪些地方有明显问题

## 5.1 设计缺陷

### 5.1.1 前期把“融合”想得太早、把“契约”想得太晚

最初文档很早就把目标写成“三路融合从单路切换升级为并行候选 + 约束重排”，见 `analysis/2026-02-24-mem0-graphiti-value-maximization/README.md:5`。

这个方向本身没错，但前期真正缺的其实是：

- `Mem0` 搜索契约
- `Graphiti` 搜索契约
- fallback 真正闭环
- 作用域字段
- typed error 与 trace

也就是说，前期有一点“先追融合效果，再补地基”的倾向。

### 5.1.2 `Graphiti` 被设计成了“图味道更强的搜索后端”，而不是“图检索子系统”

当前实现里，`Graphiti` 更多还是通用 `/search` 适配器，而不是完整图能力接入器。结果就是：

- 图检索有收益，但收益更多来自数据里确实有关系事实；
- 而不是因为我们完整用了 `Graphiti` 官方建议的命名空间、图重排、节点中心、范围控制。

这属于典型的“方向对，但吃得不够深”。

### 5.1.3 “local fallback” 的命名和实际能力边界不够清楚

当前 local 使用 builtin 没问题，但 builtin 在实际配置下依赖远端嵌入服务；所以它并不是传统意义上的“完全本地离线兜底”。

这不是实现 bug，而是设计表达不够清楚：

- 它是本地语料层；
- 但不是严格意义的离线层。

如果 `W5` 不明确这个边界，团队很容易对“fallback 能力”产生错误预期。

## 5.2 实现缺陷

### 5.2.1 bridge 核心逻辑过度集中

`memory-search-tool.ts` 超过 `3000` 行，已经同时承担：

- 路由
- 精确保护
- 远端检索
- 焦点节点
- 时序过滤
- ontology 回读
- 融合候选构建
- 重排
- 诊断输出

这不是简单的“文件大”，而是**未来每次改一个点都容易破另一个点**。

### 5.2.2 upstream 变化防御不够系统化

这次暴露的问题里，有很大一部分其实都属于“上游变化没有及时显式暴露”：

- `Mem0` 的搜索作用域字段
- `Graphiti` 的得分字段缺失
- `Graphiti` 的全文检索分组问题
- `Aura` 路由层实际表现和本机链路的偏差

说明当前方案缺少一层“上游契约监控与兼容回归”。

### 5.2.3 运维模型仍然偏重

当前 self-host stack 虽然 runbook 完整，但仍然依赖：

- repo 外部运行目录
- pinned refs
- patch
- bootstrap
- 外部 env
- 临时日志与进程管理

这套东西可用，但不轻。对后续 `W5` 扩流来说，这是稳定性和可维护性的一个持续风险源。

---

## 6. 面向 W5 的明确回答（10 问）

### 1. 当前 `OpenClaw builtin + Mem0 + Graphiti` 三层体系是否是合理方向？

是，方向合理，而且比“只押一个后端”更适合代理记忆系统。

### 2. local fallback 现在的定位是否正确？

大体正确，但应改口径：它不是“纯离线兜底”，而是“本地语料控制面 + 确定性保护层 + 兜底层”。

### 3. `Mem0` 在方案中的真实价值是什么？

真实价值是：**作用域化记忆治理 + 提炼后的语义召回**，而不是单纯第二套向量搜索。

### 4. `Graphiti` 在方案中的真实价值是什么？

真实价值是：**关系、时序、图结构邻近性**。当前已经证明有价值，但还没完全吃满官方能力。

### 5. 当前三路融合与重排设计是否优秀，还是只是勉强可用？

目前更准确的评价是：**已经从勉强可用进化到有效可用，但还谈不上优秀。**

### 6. 当前方案中最大的设计缺陷是什么？

最大设计缺陷是：**前期过早追求融合效果，晚了才把 upstream 契约、作用域、fallback 闭环当成硬约束。**

### 7. 当前方案中最大的实现缺陷是什么？

最大实现缺陷是：**bridge 核心逻辑过度集中，且长期把 upstream 异常当空结果吞掉，导致问题可见性和可维护性都变差。**

### 8. 当前方案中最值得继续保留的 3 个点是什么？

1. 三层分工思想
2. Gate 与证据驱动流程
3. builtin local 作为确定性控制面

### 9. 当前方案中进入 `W5` 前最该修的 3 个点是什么？

1. 拆解 bridge 核心逻辑，降低耦合
2. 建立 upstream 契约回归与兼容 smoke
3. 规划并安全接入 `Graphiti group_ids` 限组搜索

### 10. 你的最终结论是？

**可以进入 `W5`，但需带着风险清单。**

---

## 7. 进入 W5 的建议口径

### 可以直接带入 W5 的内容

- `W4` 最终收口结果
- single-primary fusion 方案
- builtin local 作为默认 fallback
- `Mem0` 作用域字段要求
- `Graphiti` 关系/时序价值定位
- 现有 Gate 评测框架

### 必须带着风险说明进入 W5 的内容

- `Graphiti` 还未充分使用官方图能力
- `Graphiti group_ids` 优化存在社区已知坑
- self-host stack 运维成本仍高
- bridge 核心文件过大，后续改造风险高

### 不建议继续沿用的思路

- 无条件并行双远端召回
- 遇到 upstream 变化时先靠本地试错再查官方资料
- 把 local fallback 误当成纯离线层

---

## 8. 最后的润色意见

如果从“你没有想到的，我来帮你润色”这个角度说，我最想补的不是某一处算法，而是三句话：

1. **这套方案最成功的地方，不是把 `Mem0 + Graphiti` 接进来了，而是最终把三层各自的职责逼清楚了。**
2. **这套方案最大的问题，不是能力不够，而是前期没有把外部契约和官方最佳实践当成设计输入。**
3. **这套方案现在已经足够进入 `W5`，但 `W5` 不该只做扩流，而应该开始做“架构去偶然化”。**

所谓“去偶然化”，就是把这次 `W4` 成功里那些靠排障、补洞、经验收敛出来的东西，正式变成稳定的设计资产。
