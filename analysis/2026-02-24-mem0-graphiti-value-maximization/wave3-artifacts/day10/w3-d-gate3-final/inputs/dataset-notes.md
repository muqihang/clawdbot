# W3-A Temporal Dataset Notes

- dataset_path: `inputs/retrieval-temporal-dataset.v1.json`
- sample_size: `34` (>=30)
- bucket: all samples are fixed to `temporal_relation`
- source_dataset: `analysis/2026-02-24-mem0-graphiti-value-maximization/wave2-artifacts/day23/w2-gate2-final-verify/inputs/retrieval-dataset.v2.json`

## 来源与构造

- 基于 Wave2 Gate-2 final verify 的 `retrieval-dataset.v2.json` 生成（保持 `expected_ids` 一致）。
- 为 W3-A 仅注入“时间关系表达”查询模板，不引入 W3-B 的 focal-node / temporal filters 变量。
- 构造脚本：

```bash
node --import tsx analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/scripts/build-temporal-dataset.ts
```

## 去重规则（冻结口径对齐）

1. `expected_id` 全局去重（不重复计分）。
2. `query` 去重（`trim + lower` 后不重复）。
3. alias 允许多条，但不改变 sample 主键。

## 覆盖面 checklist（冻结口径 6.1）

来自 `inputs/retrieval-temporal-dataset.verify.log`：

- before/after: `17`
- precedes/follows: `9`
- milestone timeline (Day N / 阶段 / 里程碑): `8`
- causal-ish temporal (导致/触发/之后): `8`

query 形态覆盖：

- 短 query（<=12 词或短中文句）：`34`
- 带专有名词（OpenClaw/Graphiti/Mem0 等）：`13`
- 带时间锚（timeline / Day N / 日期）：`9`

## Ground truth 核验方法

- 本数据集 `expected_ids` 继承自 Wave2 Day23 final verify 数据集。
- Wave2 Day23 的 `dataset-notes.md` 已冻结为 “GET `/entity-edge/{uuid}` 核验每个 expected_id”。
- W3-A 复用该已核验 ID 集合，并执行传递性核验（目标 ID 必须全部属于 Wave2 已核验 ID 集）。

核验命令：

```bash
node --import tsx analysis/2026-02-24-mem0-graphiti-value-maximization/wave3-artifacts/day2/w3-a-recipe-routing/scripts/verify-temporal-dataset-ground-truth.ts
```

核验输出：

- `inputs/retrieval-temporal-dataset.verify.log` (`passed: true`)
