<!-- handover/renderer-refactor/s06-milestones.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§6 里程碑表 + P0/P1 实测结果**
> 状态：有效；P4 细分见 §11.4；P2 实际顺序见 §9.2 末尾（在 §9.2-3 之后）
> 何时读：每阶段开工/验收必读；基线表以 §6.2 为准，`--cmp p0` 对它比
> 对应 goal-renderapi.ts：—

## 6. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | §5 测量工具 | 四机位基线表（平均步数 / fetch / gpu ms）写入本节 |
| P1 | `ChunkSource` + `BlockTable` 适配（VoxelCraft），`H` 参数化；`uploadChunk` 产出 `sectionFlags`（§3.1） | verify 通过；画面与 P0 逐像素一致；步数在悬崖/洞穴机位下降 |
| P2 | 距离场 Worker + shader 跳跃 + 编辑安全路径（§3.4）；面板 `df` 开关 | DF 开/关画面 0 px 差异；四机位平均步数 ≥2× 下降；放置/移除下一帧可见无穿帮；主线程 `updateChunks` 耗时不升 |
| P3 | §4 的 1/2/3/5 | 核显 `scale 0.8` 四机位 ≤ 12 ms 整帧（目标 60 fps 留余量）|
| P4 | 位图（§3.2）作为退化路径 + index.html 适配器（几何 + 加速结构 + mesher 副产品）；拆为 P4a/b/c（§11.4），宿主 B 同步升级见 §12 | index.html `?r=v2` 能出图（材质先用占位）；`Mesher` 产出 accel 的额外耗时 ≤5%；§12.5 的验证世界里每种 `model` 都能被 v2 画出（允许 §11.3 列出的已知偏差） |
| P5 | AO 打包 / flags 入体素纹理（§3.5），按 P0 工具的数据决定 | 着色占比下降可量化 |

> ⚠ **顺序与范围修正**（依 §9.2 末尾、§10.5、goal-renderapi.ts）：
> - 实施顺序不是表序：**§9.2-7 测量补齐 → §9.2-1 云门控 → §10.5-1/2（Env、`what`/`rev`/`aux`）→ §9.2-3 `uVox` RGBA8UI → P2 DF → 其余 P3 项 → P4 → P5**。DF 写在 `uVox.A` 低 5 位，所以 RGBA8UI 必须先于 DF。
> - 「flags 入体素纹理」从 P5 前移到 RGBA8UI 那一步（A 通道高 3 位 opaque/leaf/fluid）；P5 只剩 `faceAO`。
> - P4 行的「位图（§3.2）作为退化路径」待定，默认不做（见 §3.2 ⚠）。
> - 任务包：`goalP3P4/`（P2 + P3 + 接口定稿，宿主 A）、`goalP4P5/`（P4a/b/c + §12 + P5，宿主 B）。

### 6.1 P0 实测基线（`node tools/bench-v2.mjs --save p0`）

环境：Intel RPL-S 核显，ANGLE/GL，无头 Chromium，1280×657，seed 20240607，rd 6，`scale 0.65`（DDA 832×427），`steps 128`，`shadowSteps 20`，`worldTime 0.12`（冻结），水波/云冻结。gpu 为 30 帧中位数（ms）。

| 机位 | gpu scene | gpu dda | gpu comp* | s+d+comp* | 主射线迭代 | 阴影迭代 | 耗尽 | fetch | 列跳/砖/体素 | 平滑光照占比 |
|---|---|---|---|---|---|---|---|---|---|---|
| plain `24.5,53,32.5` | 0.17 | 10.90 | 1.09 | 12.16 | 26.0 | 4.1 | 0.7% | 39.7 | 4.0/0.8/12.6 | 7.4% |
| canopy `51.5,53,20.5` | 0.19 | 7.79 | 1.08 | 9.06 | 13.1 | 4.3 | 0.0% | 37.4 | 0.7/0.3/6.5 | 14.3% |
| cave `-53.5,11,-71.5` | 0.17 | 5.59 | 1.00 | 6.76 | 11.9 | 0.0 | 0.0% | 33.6 | 0.0/2.1/5.4 | 22.2% |
| water `-17.5,42.4,-9.5` | 0.18 | 19.94 | 1.06 | 21.18 | 52.5 | 3.2 | 13.0% | 83.9 | 3.9/0.0/32.2 | 4.3% |

说明 / 发现：
- **comp\***：合成 pass 的独立计时（两帧之间画到同尺寸 RT）。帧内 comp 查询是当帧第一次写默认帧缓冲，会把等交换链/vsync 的时间也算进去（实测帧内 10–30 ms、与 DDA 成本无关），**不能作为合成本身的成本**，bench 表里另列「comp 帧内」只作参考。
- 列跳/砖/体素 = 主射线在三级上的平均步数；fetch 只计体素结构（`uVox/uBrick/uCol/uInfo`）与云纹理，不含图集/噪声采样。
- 平滑光照占比 = (dda − dda[DBG 3：本格光照、无 AO]) / dda。
- **水面是最大热点**：主射线 52 步、13% 像素耗尽预算，几乎全在体素级（32 步）—— 水体是「非空砖」，砖级跳不过去；远处平地视角的地平线水带同样是红色（见 `tools/out/bench/plain-iter.png`）。P2 的距离场/段跳要对水面单独看效果。
- 洞穴机位无光（全黑），只用于步数/着色统计；平滑光照占比在洞穴最高（22%）。
- 无头与有头（`--headed`）的 dda 数字同量级但有头更高、波动更大（桌面合成器共享 GPU）；对比请固定同一模式。

像素一致性：`--save NAME` 存每机位 ddaRT 原始像素到 `tools/out/ref/NAME/`，`--cmp NAME` 逐像素比较（同机重复运行 0 px 差异）。P1「画面与 P0 逐像素一致」即 `node tools/bench-v2.mjs --cmp p0` 四机位全 0 px。

### 6.2 P0 基线（新默认参数，commit 036294b）

036294b 改了 `P_DEFAULTS`（`scale 0.8` → DDA 1024×526，`shadowDist 6` 等），之后所有阶段都以这张表为准；`tools/out/ref/p0/` 已按它重新生成。其余环境同 §6.1。

| 机位 | gpu dda | s+d+comp* | 主射线迭代 | 阴影迭代 | 耗尽 | fetch | 列跳/砖/体素 |
|---|---|---|---|---|---|---|---|
| plain | 16.16 | 17.38 | 26.0 | 4.1 | 0.7% | 40.6 | 4.0/0.8/12.6 |
| canopy | 11.70 | 13.02 | 13.1 | 4.3 | 0.0% | 38.6 | 0.7/0.3/6.5 |
| cave | 8.74 | 9.94 | 11.9 | 0.0 | 0.0% | 34.8 | 0.0/2.1/5.4 |
| water | 29.72 | 31.01 | 52.5 | 3.2 | 13.0% | 84.8 | 3.9/0.0/32.1 |

P3 目标（`scale 0.8` 四机位 ≤ 12 ms 整帧）相对这张表：plain 需 1.45×、water 需 2.6×。

### 6.3 P1 结果：`ChunkSource` + `BlockTable` + 段标记

实现（v2.js）：
- `ctx.source || voxelCraftSource(ctx)`、`ctx.blockTable || voxelCraftBlocks(ctx)`；v2 不再读 `ctx.chunks / c.blocks / RENDER…`。导出 `VR.source / VR.blockTable`。
- 相对 §2.1 的接口补充：`getChunk` 可返回 `light`（打包）**或** `sky`+`blk`（VoxelCraft 用后者，省一次打包拷贝），都缺省 = sky 15 / blk 0；新增 `forEachChunk(fn(cx,cz))`（`rebuildRing` 后整环重传要用）；VoxelCraft 适配器的事件源是 `buildChunk/disposeChunk`（`built/disposed`）。
- `BlockTable` 补充 `cullSelf[id]`（同种相邻不画内面，原来写死 `B.GLASS`）和 `waterId`；`uInfo.r` bit 6 = cullSelf。
- `H = source.height`（16 的倍数，≤256），shader 里 `#define H`；`${CH}/${B.*}` 全部去掉。
- 段标记**没有**单开 `uSect` 纹理，而是并进列纹理：`uCol` 改为 `RGBA16UI`（r = maxY+1，g = 区块坐标低 8 位 x | z<<8，b = 全空段掩码，a = 全不透明段掩码），换列时那一次 fetch 顺带拿到，零额外 fetch；同时 r 放得下 H=256。
- §3.3 的 `worldMaxY` 只在最高列下降时 O(N²) 重算。
- 槽位归属键改为 `"cx,cz"`（与宿主 `ck` 无关）；verify 跟着改，并新增「`VR.source.height` 与宿主一致」「列高/段掩码与区块数据逐块一致」两项。

结果（`--cmp p0`）：**四机位 0 px**；verify 全部通过。

| 机位 | gpu dda | s+d+comp* | 主射线迭代 | 列跳/砖/体素 | vs p0 |
|---|---|---|---|---|---|
| plain | 16.05 | 17.29 | 26.0 | 4.0/0.8/12.6 | 0 px |
| canopy | 11.48 | 12.72 | 13.1 | 0.7/0.3/6.5 | 0 px |
| cave | 8.60 | 9.81 | 11.9 | 0.0/2.1/5.4 | 0 px |
| water | 29.38 | 30.62 | 52.5 | 3.9/0.0/32.1 | 0 px |

**「步数在悬崖/洞穴机位下降」未达成，原因是数据而不是实现**：VoxelCraft 的地形里 16³ 段标记基本不会被置位（rd 6 全环 137 区块统计）：
- 列高以下的全空段 = 0 个（洞穴/悬挑从不会掏空整个 16³ 段；地表以上的空段已被列高跳过覆盖）。
- 全不透明段 = 0 个：地下段平均 92–95% 不透明、最高 4090/4096，但洞穴/矿洞的零星空格总会破坏「全实」。
- 因此 shader 段分支（`#if SECT`）从不触发，却让每帧慢约 2–3%（A/B 两轮：SECT=1 平均 +0.3–0.5 ms）→ **默认 `SECT: 0`**（`post.defines`），数据照常产出，留给 index.html（CHUNK_H=128、高空/地下大片整段）或 P2 用。
- 结论：洞穴/悬崖的步数只能靠 P2 的距离场降；§3.1 末尾「DF 上线后段级空标记可取消」在 VoxelCraft 上提前成立。SECT=1 路径目前**没有被画面验证过**（不触发），启用前需要构造整段全空/全实的测试世界。
