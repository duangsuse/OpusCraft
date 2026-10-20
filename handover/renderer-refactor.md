# VoxelCraft 渲染器交接 · v2 DDA 性能阶段 —— 索引

> 本文件只是索引。正文按 `## N.` 章节拆成 `handover/renderer-refactor/sNN-*.md`，每个文件头部有「状态 / 何时读 / 对应 goal-renderapi.ts」，**原文未改，只加 ⚠ 标注**（被取代或已拍板之处）。
> 拆分前的整篇见 git：`git show HEAD:handover/renderer-refactor.md`；更早一版（M0–M2 实施记录、面板 DSL 规范）见 `git show 801c7e4:handover/renderer-refactor.md`。
> 接口的**整理后单一真值**是 `./goal-renderapi.ts`（§9「用户已经确认」= TODO-1…7 的默认值已拍板）。与正文冲突时：goal-renderapi.ts > §11 > §10 > §2/§3。

## 现状一句话

`v2.js`（2207 行）完成 M0–M2 + P0 + P1 + 效果期 + **goalP3P4（宿主 A：测量补齐 → 云门控 → `Env`/流体收口 → `what`/`rev`/`aux` + CPU 镜像 → `uVox` RGBA8UI → P2 距离场 → P3 部分项）**，结果见 §6.4/§6.5；宿主 B（`index.html`+`gls.js`）尚未接入，下一步是 `goalP4P5`。P3 的 12 ms 目标未达成，主因是着色器寄存器压力（§8.7，`tools/shader-stats.mjs`）。

## 章节文件

| 文件 | 内容 | 状态 | 何时读 |
|---|---|---|---|
| [s00-status.md](renderer-refactor/s00-status.md) | §0 现状 · §0.1 接口约定 · §0.2 v2.js 结构索引（行号）· §0.3 初始基线 | 有效（§0.3 被 §6.2 取代） | 任何阶段开工前读 §0.1/§0.2 |
| [s01-cost-model.md](renderer-refactor/s01-cost-model.md) | §1 一个 DDA 像素的成本模型 | 有效 | P2/P3 优化前 |
| [s02-arch-v1.md](renderer-refactor/s02-arch-v1.md) | §2 第一版目标架构（`ChunkSource` v1 / mesher 副产品收益表） | **历史**（§2.1 被 §10.1 取代；§2.2 仍有效） | 只在 P4c 读 §2.2 |
| [s03-accel.md](renderer-refactor/s03-accel.md) | §3 加速结构：3.1 段标记 · 3.2 位图 · 3.3 砖 · **3.4 距离场** · 3.5 faceAO · 3.6 整合后的 trace | 部分被取代（见文内 ⚠：3.2 待定默认不做；3.4 占据不含流体、存 uVox.A；3.5 flags 已前移） | P2 必读 3.4/3.6；P5 读 3.5 |
| [s04-misc-cuts.md](renderer-refactor/s04-misc-cuts.md) | §4 与加速结构无关的开销削减（= P3 内容） | 有效 | P3 |
| [s05-tools.md](renderer-refactor/s05-tools.md) | §5 测量工具（DBG 模式、bench、verify）· 5.1 goalP3P4 新增（DBG 4/6/7–9、shader-stats、refdiff、upload-cost） | 已落地 | 每阶段验收 |
| [s06-milestones.md](renderer-refactor/s06-milestones.md) | §6 里程碑表 · 6.1/6.2 P0 基线 · 6.3 P1 结果 · **6.4 效果期基准 `p1fx` · 6.5 P2/P3 结果** | 有效 | 每阶段开工/验收；之后 `--cmp p1fx` |
| [s07-risks.md](renderer-refactor/s07-risks.md) | §7 风险（DF 漏空 / Worker transfer / texSubImage3D） | 有效 | P2 |
| [s08-lessons.md](renderer-refactor/s08-lessons.md) | §8 结构经验 + 8.6 对 P2+ 的直接要求 + **8.7 P2–P3 沉淀（寄存器压力）** | 有效（方法论） | 每阶段开工前 |
| [s09-fx-costs.md](renderer-refactor/s09-fx-costs.md) | §9 效果期开销账 · **9.2 建议排序 + 实施顺序** · 9.3 进基准前要补的数字 | 有效 | P3 必读；开工第一步 = 9.3 |
| [s10-interfaces.md](renderer-refactor/s10-interfaces.md) | §10 接口预设计：10.1 `ChunkSource v2`/`BlockTable v2`（**已确认 ts 块**）· 10.2 流体 · 10.3 `Env` · 10.4 mesher 对接 · 10.5 落地顺序 | 有效（存储细节见文内 ⚠） | 改接口前 |
| [s11-hostB-bounds.md](renderer-refactor/s11-hostB-bounds.md) | §11 宿主 B 特性边界：11.1 存储决定 · 11.2 model→kind · 11.3 不负责项 · 11.4 P4a/b/c | 有效（11.1 A 通道位、11.2 texel/BlockTable 形态被 ts 覆盖，见 ⚠） | 11.1 改 uVox/uInfo 前；其余 P4 |
| [s12-hostB-upgrade.md](renderer-refactor/s12-hostB-upgrade.md) | §12 宿主 B 同步升级：热切换 / 冻结 / 机位 / `c_Veg` / 验证世界 | 有效 | P4a 之前做 12.1–12.3 |

## 已拍板事项（来自 goal-renderapi.ts §9，已回标到各章节 ⚠）

| # | 决定 | 影响的章节 |
|---|---|---|
| TODO-1 | `ChunkSource.rev` 可选 | §10.1 |
| TODO-2 | DF `occupied = kind≠0 ∧ !fluid`（不含流体）；`uBrick` 仍含流体 | §3.4、§2.1 |
| TODO-3 | `uInfo` 布局不变、整表升 RGBA16UI | §11.1 |
| TODO-4 | `fluidTop = above ? 1 : 1 − level/9 + uFluidTop0`，meta 0 → 0.875 | §10.2、§11.2 |
| TODO-5 | `crop` 按 cross 画，不做四片变体 | §11.2 |
| TODO-6 | 验证世界 = `test/bw_models.webp` | §12.5 |
| TODO-7 | `BlockTable` 只加 `state()/boxes()` 方法，不加 `variants/shape` 数组 | §10.1、§11.2、§11.4 |
| — | `uVox.A` 高 3 位 = `OPAQUE/LEAF/FLUID`（无 solid）；`uInfo` texel 分配以 ts `UINFO` 为准 | §3.5、§9.2-3、§11.1、§11.2 |
| — | 位图 `uBits`（§3.2）未进 ts，默认不做 | §3.2、§6 P4 行、§7 |

## 任务包

- `./goalP3P4/`：宿主 A 侧 —— 补基准、P3 开销削减、`uVox` RGBA8UI + 接口收口、P2 距离场；终点 = 宿主 B 可以接入（P4 入口）。
- `./goalP4P5/`：宿主 B 接入 P4a/b/c + §12 同步升级 + P5 faceAO 决策。

## 验证入口

测试工具与体素游戏测试参数（机位、冻结、基准、REF_MODE）汇总见 [handover/tools.md](tools.md)。


`node tools/verify-renderer.mjs`（需 `http://localhost:8765/`，v1/v2/bogus 三组 PASS）；`node tools/bench-v2.mjs --views plain,canopy,cave,water,uw --cmp p1fx`（回归；`p0` 早于效果期，已不可比）；`node tools/shader-stats.mjs`（SIMD 宽度 / spill）。
