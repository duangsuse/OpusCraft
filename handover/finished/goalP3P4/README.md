# goalP3P4 —— 宿主 A 侧：补基准 → P3 开销削减 → `uVox` RGBA8UI + 接口收口 → P2 距离场

> 任务包。`doc/` 里是 `handover/renderer-refactor/` 的**快照**（只含本任务要读的章节；真值在原目录，若两处不一致以原目录为准）。
> 接口单一真值：`../goal-renderapi.ts`（不复制；其 §9 的 TODO-1…7 已拍板，按默认值执行）。
> 终点：v2 在宿主 A（`VoxelCraft.html?r=v2`）上达到 P2 + P3 验收，且接口形态与 `goal-renderapi.ts` §0–§7 一致 —— 这是 `goalP4P5`（宿主 B 接入）的入口条件。

## ★ 完成状态（2026-10-20）

| # | 步骤 | 结果 |
|---|---|---|
| 1 | 补基准 | ✔ DBG 6 / 云步 / `uw` / `--preset`；bench 可复现性修复；基准换成 `p1fx`（`p0` 早于效果期）；§6.4 |
| 2 | 云门控 | ✔ 逐位精确（0 px，含 bliss）；bliss canopy 25.3 → 15.4 ms |
| 3 | 字面量收口 + `Env` | ✔ 0 px；verify 静态检查 |
| 4 | `what` / `rev` / `aux` | ✔ 0 px；三路径 + 去重 + aux 进 verify；CPU 镜像同步落地 |
| 5 | `uVox` RGBA8UI + `uInfo` 256×64 | ✔ 0 px；fetch −5…−26/像素、28.4 MB；GPU 时间未降（寄存器压力，§8.7） |
| 6 | P2 距离场 | ✔ DF 开/关 0 px（预算放大）、不变量 / 放置移除进 verify；迭代 ÷1.41–1.68（未到 2×）；dda −7…−15%；按区块 DF（ts 已先改） |
| 7 | 其余 P3 | 阴影射线前移（门控会改画面，不做）；§4-5、§9.2-2 实现但默认关（理由见 §6.5）；**12 ms 未达成**（19.7 / 16.7 / 10.3 / 33.0） |
| 8 | 收尾 | ✔ §6.4/§6.5、§0.2 索引、§5.1、§8.7、ts `[goalP3P4]` 注；verify v1/v2/bogus PASS |

详见 `handover/renderer-refactor/s06-milestones.md` §6.4–§6.5（本目录 `doc/` 已同步）。回归命令改为 `node tools/bench-v2.mjs --views plain,canopy,cave,water,uw --cmp p1fx`。

## 0. 开工前必读（顺序）

1. `doc/s08-lessons.md` —— 方法论：没有数字不动结构；搭便车不开新纹理；一条 `trace` 分支靠标志；§8.6 对 P2+ 的直接要求。
2. `doc/s00-status.md` §0.1 接口约定、§0.2 v2.js 结构索引（行号基于 commit b6ac7fe，先 `git log --oneline -3 -- v2.js` 确认是否漂移）。
3. `../goal-renderapi.ts` 全文（388 行）。
4. `doc/s06-milestones.md` 的 ⚠ 顺序修正 + §6.2 基线表（`--cmp p0` 对它比）。
5. 其余章节按下表「步骤 → 读什么」按需读。

## 1. 步骤（严格按序；每步结束跑 `node tools/verify-renderer.mjs` 与 `node tools/bench-v2.mjs --cmp p0`）

| # | 步骤 | 读什么 | 验收 |
|---|---|---|---|
| 1 | **补基准**：§9.3 的 5 条 bench 命令 + §9.2-7 测量补齐（`CNT` 覆盖 `texture()`；加水下机位 `uw`；`--preset`） | `doc/s09-fx-costs.md` §9.1/§9.3、`doc/s05-tools.md` | 结果写成 `handover/renderer-refactor/s06-milestones.md` §6.4（同 §6.3 表头）；据此确认/调整后续顺序 |
| 2 | **云门控**（§9.2-1 = §4-2）：先 trace 再云，`tHit` 作云上限；`r.y<=0 && ro.y<y0` 直接跳 | `doc/s09-fx-costs.md` §9.2-1、`doc/s04-misc-cuts.md` #2 | `--cmp` 0 px；DBG 2 fetch 下降 |
| 3 | **字面量收口 + `Env`**（§10.5-1）：`isFluid()/fluidTop()` 收口全部 `${BT.waterId}u`；`Env` 轮询对象 + `voxelCraftEnv(ctx)`；`update()` 不再直接读 `ctx.skyMat/cloudMat/clouds/stars/getBlock/#water` | `doc/s10-interfaces.md` §10.2/§10.3、ts §3 `Env`、ts §7 适配器 | `--cmp` 0 px；verify 加 grep 检查「v2 不直接读上述 ctx 字段」 |
| 4 | **`onChunkChanged(what)` + `rev` + `aux` 可选字段**（§10.5-2）：`'light'` 只重传 G 通道；VoxelCraft 适配器全传 `'blocks'` | `doc/s10-interfaces.md` §10.1（已确认 ts 块）、ts §1 | verify：`what` 三种路径各走一次；`rev` 同值不重传 |
| 5 | **`uVox` → RGBA8UI + CPU 镜像 + `uInfo` 256×64**（§9.2-3 / §10.5-3）：R id、G light、B meta（宿主 A 恒 0）、A = dist(低 5 位，先全 0)｜`OPAQUE<<5｜LEAF<<6｜FLUID<<7`；`cellLO` 1 fetch；`BlockTable.state()` 缺省 → `defaultState()` 16 行复制；`uInfo` 格式先 RGBA8UI（TODO-3 只在宿主 B 资源包时升 16UI） | `doc/s09-fx-costs.md` §9.2-3、`doc/s03-accel.md` §3.5 ⚠、ts §2 `BlockState/UINFO`、ts §4 `UVOX`、ts §5 `Mirror`、ts §6.3 `uploadChunk` | `--cmp p0` 0 px；DBG 2 平均 fetch 下降 ≥ 9 + 体素步数×非空占比；rd 6 环纹理 ≈ 28 MB（ts §4 内存表） |
| 6 | **P2 距离场**（§3.4 全文）：Worker（ts §5 协议）、`stDist`→写 A 低 5 位、shader 跳跃（§3.6 / ts §6.8）、编辑队列 `EDITQ` + `flushEdits`（ts §6.5）、面板 `df` 开关、DBG 4/5 | `doc/s03-accel.md` §3.3/§3.4/§3.6、`doc/s07-risks.md`、`doc/s01-cost-model.md`、ts §5/§6.5–6.8 | §6 表 P2 行：DF 开/关 0 px；四机位平均步数 ≥2×↓；放置/移除下一帧无穿帮（1 格厚墙贴天空 `readPixels`）；主线程 `updateChunks` 不升。**occupied 不含流体**（TODO-2），`uBrick` 仍含 |
| 7 | **其余 P3 项**：§4-1 阴影射线（先测 `shadowSteps=0` 差值再决定门控方式）、§4-5 `scale<1` 时深度 2×2 max 裁剪；§9.2-2 云独立低分辨率 pass 仅当 `cloudStyle=2` 增量 > 20% | `doc/s04-misc-cuts.md`、`doc/s09-fx-costs.md` §9.2 | §6 表 P3 行：核显 `scale 0.8` 四机位整帧 ≤ 12 ms |
| 8 | **收尾**：§6 加 P2/P3 结果表；§0.2 结构索引按新行号更新；`goal-renderapi.ts` 若与实现有出入，**先改 ts 再改代码**，不得静默偏离 | — | verify v1/v2/bogus PASS；交接文档更新 |

## 2. 本包不做

- 宿主 B（`index.html`/`gls.js`）的任何改动、`glsSource/glsBlocks/glsEnv`、`uShape`/kind 7、`uBio`、§12 —— 全部在 `goalP4P5`。
- §3.2 占据位图 `uBits`：默认不做（ts 未收录）；只有 P2 热力图证明 `v==0` 区域长期存在才重开。
- §3.5 `faceAO`：P5。
- 分级流体 `fluidTop` 的 meta≠0 分支：公式先写进 shader（TODO-4），宿主 A 永远走 meta 0 → 0.875，不另做验证。

## 3. 硬约束

- 画面回归：每步 `node tools/bench-v2.mjs --cmp p0` 必须 0 px（云像素除外，仅第 2/7 步允许云边缘差异）。
- 接口：`[confirmed §x]` 标注的字段**不改名**；只加可选字段/方法。
- 数据通路：不开新采样器（§8.2）；DF 进 `uVox.A`，不单开 `uDist`。
- 安全退化：A 低 5 位 `v==0` = 未计算 → 走 `uBrick`；新占据格写 `1`；`dist ≤ 真实距离` 写进 verify。
- 不读 `doc/xyzb/*`、`doc/mat/*`、`gls.js`、`index.html`（本包不需要）。

## 4. 验证命令

```
node tools/verify-renderer.mjs                 # 需 http://localhost:8765/ ；v1 / v2 / bogus 三组 PASS
node tools/bench-v2.mjs --cmp p0               # 逐像素回归
node tools/bench-v2.mjs --save p2 / --save p3  # 阶段基线，写回 s06
```
