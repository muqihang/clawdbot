# OpenClaw 与 ZeroClaw 调研报告（2026-03-03）

> 目的：你计划基于开源项目改造做商业项目，所以本报告重点回答三件事：  
> 1）OpenClaw 的代码质量到底怎么样（不是“听说”）；  
> 2）ZeroClaw 与 OpenClaw 在功能、价值、代码质量上有什么差；  
> 3）如果要做商业改造，分别有什么“坑”和“省事”的地方。

---

## 结论先行（给决策用）

### 一句话结论

- **OpenClaw**：不是“纯屎山”。它有比较硬的工程门禁（类型检查、格式化、静态检查、测试、覆盖率阈值、自动化流水线会跑多项检查），但因为功能面非常大（多通道 + 网关 + 插件 + 控制界面 + 多端），你会遇到“理解成本高、改动牵一发动全身”的现实问题。
- **ZeroClaw**：主打 Rust 单二进制、低内存、强门禁的工程化项目（自动化流水线的检查项非常多，包含格式化、Rust 静态检查、可复现构建、供应链与安全扫描等）。但它 **非常新**，并且存在“同名仓库/域名冒充”风险；功能覆盖是否能替代 OpenClaw，要以你实际需要的通道与能力清单来核对。

### 按场景推荐（更实用）

1. **你要的是“尽快上线 + 多消息通道 + 现成生态（插件/文档/上手工具）”**  
   优先选 **OpenClaw**。做法是：先裁剪功能面（只保留你要的通道/能力），再把你裁剪后的那部分加上更强的回归测试与发布流程。

2. **你要的是“低资源环境/边缘设备/极快冷启动/单二进制部署”**  
   优先考虑 **ZeroClaw**。但要先做两件事：  
   （a）确认它是否已有你必须的通道集成；  
   （b）用你自己的业务负载做基准测试（不要只信项目说明文件里的对比表）。

3. **你要做“多租户 SaaS（多个互不信任用户共享一套服务）”**  
   两者都不能直接拿来就当“多租户安全边界”。尤其是 OpenClaw 的安全模型明确偏向“单用户/可信操作者”。你大概率需要重做：认证、授权、隔离、审计与执行权限模型。

---

## 我是怎么调查的（避免主观）

为了避免“看两眼就下结论”，我把证据分为两类：

### A. 代码与工程门禁（能在仓库里直接看到）

- OpenClaw：读取 `openclaw/openclaw` 的 `main` 分支内容（本地用 `git show upstream/main:...` 观察；其中 `upstream` 是 git 远端名），重点看 `tsconfig.json`、自动化流水线配置、静态检查/格式化配置、测试框架与覆盖率阈值。
- ZeroClaw：读取 `zeroclaw-labs/zeroclaw` 的 `main` 分支内容（用 GitHub API 与 Raw 文件查看），重点看 `Cargo.toml`、自动化流水线文件数量与内容、质量门禁脚本与测试说明。

### B. 社区与生态信号（能反映“维护强度/回归风险”）

- GitHub API：星标、分叉、活跃时间、开放问题数量（注意：API 的 `open_issues_count` 通常包含合并请求）。
- 问题单与讨论：挑具体例子看“问题类型”和“处理方式”（例如被标记 `stale`、关闭原因等）。
- 官方文档：测试与自动化流水线（CI）指南是否清晰、是否能指导贡献者按同一套路做事。

> 注：你的当前工作目录是一个分叉仓库（`muqihang/clawdbot`），与上游仓库差异非常大（包含大量额外文件与分析产物）。因此本报告评价 **OpenClaw 项目本身时，以 `openclaw/openclaw` 为准**，避免把分叉仓库的问题误算到上游项目。
>
> 额外提醒：在你这个分叉仓库里，`analysis/` 下的脚本文件会参与静态检查，可能导致你本地运行 `pnpm lint` 直接失败；但上游 `openclaw/openclaw` 并不存在这些目录，所以不应把这类失败当成上游项目“代码质量差”的证据。

---

## OpenClaw：代码质量到底怎么样？

### 1) 项目定位与范围（决定了“看起来是不是屎山”）

OpenClaw 的定位不是“一个小工具”，而是一个覆盖面极广的个人助理系统：  
多消息通道（WhatsApp、Telegram、Slack、Discord 等）、网关与控制界面、插件体系、以及 macOS/iOS/Android 等端的配套代码。

当一个项目的目标是“全家桶”，代码一定会大、模块一定会多，这会让第一次阅读的人天然觉得“复杂”。复杂不等于屎山，但复杂会提高你做商业改造的成本。

### 2) 能直接证明“工程质量不差”的证据

下面这些不是“主观感觉”，而是仓库里能看到的硬证据：

#### 2.1 类型约束很硬（降低低级错误）

- `tsconfig.json`：`"strict": true`（严格类型检查）。
- `oxlint` 规则：明确把 `typescript/no-explicit-any` 设为 `error`（禁止随意 `any`）。

这类约束的现实意义是：  
你要改动一个核心数据结构时，编译器会立刻把受影响的调用点指出来，不太容易“改坏了还不自知”。

#### 2.2 CI 门禁覆盖面大（不是只跑一跑单测）

OpenClaw 的自动化流水线（CI，见 `openclaw/openclaw`）包含：

- 变更范围检测：纯文档改动会跳过重任务，减少流水线噪声；但基础质量门禁仍会跑。
- `pnpm check`：类型检查 + 静态检查 + 格式检查（并且还有多条额外临时规则，用来卡住特定高风险模式）。
- 测试：至少有 Node.js 测试与 Bun（另一套 JavaScript 运行时）测试通道（矩阵任务），并且会在需要时先构建 `dist` 产物。
- 发布内容校验：主分支推送会跑 `pnpm release:check`，验证发布包内容。

这说明它不是“随便能合进去代码”的状态，工程门禁是体系化的。

#### 2.3 测试体系与覆盖率阈值是明确的

OpenClaw 的测试文档把测试分为多套（单元/集成、端到端、真实环境），并提供了“日常跑哪些命令”的建议：  
`pnpm lint && pnpm build && pnpm test && pnpm test:e2e`（这是官方文档中的推荐组合之一）。

同时，测试配置中有覆盖率阈值（例如行/函数/分支/语句都有最低比例），这属于比较“认真”而不是“有个 test 文件就算完事”的做法。

#### 2.4 TODO/FIXME/HACK 数量很低（至少在核心目录里）

在上游仓库的 `src/` 与 `extensions/` 中，`TODO`、`FIXME`、`HACK` 这类标记数量很少（个位数级别）。  
这通常意味着：  
他们更倾向于“要么修掉，要么删掉”，而不是长期靠注释掩盖问题。

### 3) 能直接证明“你会踩坑”的证据（不是泛泛而谈）

OpenClaw 的主要风险不是“完全没人管”，而是：

#### 3.1 规模太大：改一个点可能触发多处回归

从仓库首页的项目说明可以看出，它支持大量通道与平台。现实结果就是：

- 一个公共模块（比如配置、权限、消息路由）一旦改动，需要同时考虑多个通道；
- 你做商业裁剪时，必须决定“哪些通道永远不支持”，否则你会被“兼容全部通道”的复杂度拖慢。

#### 3.2 仍然会出现稳定性/回归类问题（社区反馈可验证）

例子（都能在 GitHub 上查到）：

- 问题 #10864：报告“孤儿进程累积导致内存压力”（标注 bug，后续关闭并带 `stale`）。  
  链接：https://github.com/openclaw/openclaw/issues/10864
- 问题 #10867：报告 `session_status` 的思考等级显示不一致（标注 bug，后续关闭并带 `stale`）。  
  链接：https://github.com/openclaw/openclaw/issues/10867
- 讨论 #32815：用户反馈升级到 `v2026.3.2` 后没有读写执行权限（Q&A 分类，2026-03-03 当天创建与更新）。  
  链接：https://github.com/openclaw/openclaw/discussions/32815

这些例子说明：  
即使工程门禁很硬，真实用户环境仍可能出现回归，且并非每个问题都会被当成“必须立刻修”的发布阻断。

#### 3.3 安全模型偏向“单用户/可信操作者”（对商业形态影响大）

OpenClaw 的安全策略文档明确说明：  
它不把“同一个网关里多个互不信任的人”当成主要威胁模型；通过认证的调用方被视为可信操作者。  
如果你的商业产品要做多租户隔离，这一条会直接影响你的架构方向（你需要补上隔离层，而不是指望项目原生满足）。

链接：https://github.com/openclaw/openclaw/blob/main/SECURITY.md

### 4) 我对 OpenClaw 代码质量的判断（具体而不是一句话）

我把“代码质量”拆成 4 个你最关心的落地指标：

1. **合并前是否会被强制拦住明显问题**：是。类型检查、静态检查、格式化、测试、覆盖率、发布校验都有门禁。
2. **是否有明确的工程规范（别人能按同一套路贡献）**：是。贡献文档和测试文档都很具体。
3. **是否仍然会出现回归/稳定性问题**：会。大型项目不可避免，且有具体问题单/讨论例子。
4. **你做商业改造的可控性**：中等偏难。不是因为“代码烂”，而是因为“范围太广 + 集成太多”。

### OpenClaw 关键证据链接（方便你自己核对）

- 仓库主页：https://github.com/openclaw/openclaw
- 类型检查严格模式（`"strict": true`）：https://github.com/openclaw/openclaw/blob/main/tsconfig.json
- 静态检查规则（包含禁止 `any` 等）：https://github.com/openclaw/openclaw/blob/main/.oxlintrc.json
- 自动化流水线配置（CI 会跑哪些任务）：https://github.com/openclaw/openclaw/blob/main/.github/workflows/ci.yml
- 测试文档（怎么跑、有哪些测试套件）：https://docs.openclaw.ai/help/testing
- CI 文档（流水线说明）：https://docs.openclaw.ai/ci
- 安全策略与威胁模型说明：https://github.com/openclaw/openclaw/blob/main/SECURITY.md
- 贡献指南（要求跑哪些检查）：https://github.com/openclaw/openclaw/blob/main/CONTRIBUTING.md

---

## ZeroClaw：与 OpenClaw 有什么差？代码质量如何？

### 1) 先解决一个关键问题：你说的“zeroclaw”到底是哪一个？

ZeroClaw 这个名字在 2026 年初出现了“同名仓库/域名冲突”：

- `zeroclaw-labs/zeroclaw` 的项目说明文件明确声明：他们**不隶属于** `openagen/zeroclaw`，并指控 `zeroclaw.org`、`zeroclaw.net` 指向冒充的分叉仓库。
- 这意味着：你做商业项目时，必须把“供应链可信度”当成第一优先级（否则你可能从冒充仓库下载二进制）。

因此，本报告把 **`zeroclaw-labs/zeroclaw` 作为主要研究对象**。

链接：https://github.com/zeroclaw-labs/zeroclaw

### 2) 项目定位：更像“运行时/框架”，不是 OpenClaw 的全家桶复制

ZeroClaw 的宣传核心是：

- Rust 单二进制（更像“运行时”）
- 低内存、快启动
- Rust 里的 trait（类似“接口”）驱动的可插拔架构（提供商/通道/工具/记忆/隧道等）
- 安全默认（配对、沙箱、显式允许列表、工作区范围）

它更像“把 AI 助手需要的基础设施做成一个轻量运行时”，而不是把 OpenClaw 的所有通道与多端应用完整复刻。

### 3) 能直接证明“工程质量很硬”的证据

#### 3.1 CI 工作流非常多，且不是摆设

通过 GitHub API 能看到它的 `.github/workflows/` 里有大量流水线文件，例如：

- `ci-run.yml`：包含格式化、Clippy、严格增量门禁（`strict delta gate`）、`cargo check`、测试，并带“二次重跑判断是否为偶发失败”的逻辑（`flake detection`）。
- 还有可复现构建、供应链溯源、安全审计、模糊测试（fuzz）、端到端测试（e2e）等工作流文件。

这类 CI 体系对代码质量的意义是：  
不是靠“写代码的人自觉”，而是靠流水线把低质量变更拦在合并前。

#### 3.2 许可证对商业使用友好

- `Cargo.toml` 标注 `MIT OR Apache-2.0`。  
  GitHub API 识别为 Apache-2.0（通常表示仓库里有标准许可证文件）。

对商业项目来说，这类许可证一般比较宽松（但你仍需要做依赖许可证扫描，这是商业合规的常规动作）。

### 4) 你需要谨慎看待的点（同样给出可验证理由）

#### 4.1 它非常新：创建时间是 2026-02-13

GitHub API 显示它创建于 2026-02-13，并在 2026-03-03 仍在高频推送代码。  
这意味着：

- 迭代可能很快（好处：修得快；坏处：接口可能变、兼容性风险高）
- 文档与稳定性可能跟不上（尤其是当你要做商业二次开发）

#### 4.2 性能数据多数来自项目自述，需要你自己复测

项目说明文件中有“ZeroClaw vs OpenClaw”的对比表，包含内存与启动时间等数据，并给了测试说明。  
但这仍属于“项目自己提供的基准”。你做商业项目需要对自己的真实工作负载（通道数量、消息频率、工具调用、记忆规模）做基准测试，避免被宣传数据带偏。

### ZeroClaw 关键证据链接（方便你自己核对）

- 仓库主页：https://github.com/zeroclaw-labs/zeroclaw
- 项目说明文件（含“冒充警告”、功能与基准表）：https://github.com/zeroclaw-labs/zeroclaw/blob/main/README.md
- 工作区与许可证声明（`MIT OR Apache-2.0`）：https://github.com/zeroclaw-labs/zeroclaw/blob/main/Cargo.toml
- 安卓设备运行（Termux 与预编译二进制）：https://github.com/zeroclaw-labs/zeroclaw/blob/main/docs/android-setup.md
- 安卓原生客户端（Kotlin/Compose + Rust 内核）：https://github.com/zeroclaw-labs/zeroclaw/blob/main/clients/android/README.md
- 自动化流水线示例（`ci-run.yml`）：https://github.com/zeroclaw-labs/zeroclaw/blob/main/.github/workflows/ci-run.yml
- 流水线文件清单（GitHub API）：https://api.github.com/repos/zeroclaw-labs/zeroclaw/contents/.github/workflows
- 测试说明（如何跑测试）：https://github.com/zeroclaw-labs/zeroclaw/blob/main/RUN_TESTS.md

---

## 功能与价值对比（对商业改造最关键的一页）

| 维度            | OpenClaw                                              | ZeroClaw                                                                  | 对商业项目的实际影响                                                  |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 主要语言/运行时 | TypeScript + Node                                     | Rust 单二进制                                                             | 运维与性能模型完全不同；Node 更容易扩展生态，Rust 更容易做资源可控    |
| 功能覆盖面      | 多通道 + 网关 + UI + 多端应用                         | 更偏运行时/框架，强调可插拔                                               | OpenClaw 更“现成”，ZeroClaw 更“可控但需要补齐”                        |
| 工程门禁        | `pnpm check` + 多条静态检查门禁 + 多套测试 + 发布校验 | 大量自动化流水线任务（格式化/Clippy/严格增量/可复现构建/安全审计/测试等） | 两者都重视工程；ZeroClaw 的门禁更“安全与供应链导向”                   |
| 稳定性信号      | 问题单/讨论规模大；有回归与性能类问题示例             | 项目新，历史样本少；但门禁强                                              | OpenClaw 的风险更像“复杂导致回归”，ZeroClaw 更像“新项目不确定性”      |
| 安全模型        | 明确偏单用户/可信操作者                               | 宣称安全默认（沙箱/允许列表/工作区范围）                                  | 如果你做多租户，两者都需加隔离；ZeroClaw 可能更适合当底座，但仍需验证 |
| 生态与维护      | 星标/分叉巨大，问题单与合并请求量大                   | 体量小很多，但增长快；且有冒充风险                                        | OpenClaw 更像大生态；ZeroClaw 需要你非常谨慎选择“官方来源”            |

---

## 给你做商业改造的落地建议（可执行清单）

### 如果你选 OpenClaw（更快落地）

1. **先写“必须功能清单”**：你到底要哪些通道、哪些工具、是否要多端应用。
2. **先裁剪，再改造**：把不需要的通道/插件/端先关掉或隔离到单独包，否则你会在回归里溺水。
3. **把你改动的那条链路补上回归测试**：尤其是配置、鉴权、消息路由、工具执行、数据存储这 5 类。
4. **重新审视安全模型**：如果你是多用户产品，不要把 sessionKey/标签当授权边界；要做真正的用户隔离与权限系统。
5. **设定你的发布节奏**：OpenClaw 上游更新很快，你需要决定“跟随主线”还是“冻结版本做长期维护”。

### 如果你选 ZeroClaw（更可控的底座）

1. **先确认“官方仓库 + 官方发布渠道”**：只信 `zeroclaw-labs/zeroclaw` 与它标注的官方账号/网站。
2. **先做功能核对表**：把你需要的通道与能力逐条对照（没有就要自己做）。
3. **先跑一轮最小可行基准**：同一台机器、同一组消息与工具调用，测内存/延迟/吞吐。
4. **用 CI/可复现构建做供应链防护**：商业项目最怕“拿到的是被篡改的二进制/依赖”。
5. **预留接口变动成本**：新项目迭代快，建议在你自己的代码里用适配层包一层，减少未来升级痛苦。

---

## 附录：关键数据快照（2026-03-03）

### OpenClaw（GitHub API）

- 仓库：`openclaw/openclaw`
- 星标：253,382
- 分叉：48,649
- `open_issues_count`：9,875（注意：通常包含合并请求）
- 创建时间：2025-11-24
- 最近推送：2026-03-03
- 许可证：MIT

### ZeroClaw（GitHub API）

- 仓库：`zeroclaw-labs/zeroclaw`
- 星标：21,609
- 分叉：2,850
- `open_issues_count`：191（注意：通常包含合并请求）
- 创建时间：2026-02-13
- 最近推送：2026-03-03
- 许可证：GitHub 识别为 Apache-2.0（项目也声明 MIT OR Apache-2.0）

### 参考链接（建议只把这些当“可信入口”）

- OpenClaw 仓库：https://github.com/openclaw/openclaw
- OpenClaw 测试文档：https://docs.openclaw.ai/help/testing
- OpenClaw CI 文档：https://docs.openclaw.ai/ci
- OpenClaw 贡献指南：https://github.com/openclaw/openclaw/blob/main/CONTRIBUTING.md
- ZeroClaw 仓库：https://github.com/zeroclaw-labs/zeroclaw
- ZeroClaw CI 工作流目录（通过 API 查看）：https://api.github.com/repos/zeroclaw-labs/zeroclaw/contents/.github/workflows
