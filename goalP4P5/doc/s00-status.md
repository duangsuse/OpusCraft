<!-- handover/renderer-refactor/s00-status.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§0 现状 · 接口约定 · v2.js 结构索引 · 初始基线**
> 状态：有效（结构索引基于 commit b6ac7fe 的 1752 行版本）
> 何时读：任何阶段开工前先读 §0.1/§0.2；§0.3 已被 §6.2 取代
> 对应 goal-renderapi.ts：§0.1 ↔ goal-renderapi.ts §0（RendererCtx/Renderer）

## 0. 现状

| 文件 | 状态 |
|---|---|
| `VoxelCraft.html` | 宿主 A：世界/光照/实体/UI；`RCTX` 传给渲染器；`?r=v1`（默认）/ `?r=v2`；`RCTX.settings = settings`（L2346） |
| `v1.js` | 光栅化基线（逐面网格 + 顶点 AO + 四角平滑光照），完成，**画面基准** |
| `v2.js`（1752 行） | DDA 渲染器，M0–M2 + **P0（测量）+ P1（`ChunkSource`/`BlockTable`/段标记）** 完成（§6.1–6.3）。P1 之后（commit d32dad6 / b6ac7fe）按 `handover/finished/goals-trees.md` 加了一批**画面效果**：树叶（摇动 / 卡片叶簇 `LEAF_CARDS` / 内部剔除 id 255 / 外伸 halo id 192–254 / 阴影三档 / 距离 LOD）、水面三风格（`WATER_STYLE` 0 噪声 / 1 Reimagined / 2 Bliss：Seascape 高度场 + 真实反射射线 + 高光阴影射线）、岸边涌浪 + 岸壁水线、水下（吸收 / 焦散 / 光束 / 仰视波纹折射）、云三风格（`CLOUD_STYLE` 0 体积 2D-DDA / 1 MC 方块 / 2 Bliss 体积积云 3D 噪声）、程序化星空、滞后相机。**这些效果的开销尚未进基准**（§9）。优化仍停在 P1，下一步 P2 距离场（§3.4）；经验见 §8，接口预设计见 §10 |
| `index.html` + `gls.js` | 宿主 B（bridge-mind 精简版，three r170）：`CHUNK_H=128`，`Mesher.greedy` 贪心合并，增量光照（`Lighting`）。**v2 尚未接入**，是 `ChunkSource` 接口的第二个消费者；特性边界与对接约束见 §11，宿主侧同步升级见 §12 |
| `tools/verify-renderer.mjs` | 无头 Chromium 接口验证，v1/v2/bogus 三组 PASS（`node tools/verify-renderer.mjs`，需 `http://localhost:8765/`） |

### 0.1 仍然有效的接口约定（简）

```js
export function createRenderer(ctx) → { name, buildChunk(c), disposeChunk(c), update(dt), render(), stats() }
```
- `buildChunk` 可重入（编辑/邻居光照变化会反复调用）；`disposeChunk` 后 `c.mesh = c.waterMesh = null`。
- 区块只在 3×3 邻居都生成后才 build；`c.blocks / c.sky / c.blk` 索引 `(lx*16+lz)*CH + y`（index.html 的 `bidx` 同布局，CH=128）。
- 共享 GLSL：`voxLight(sky,blk)`、`matSample/matSampleLod(uv,layer,lod)`、`applyFog(c,z)`；共享 uniform 对象 `U`（含 `uSunDir`）。
- 主循环：`updateChunks(5ms)` → `updateSky → VR.update` → `clear; VR.render(); clearDepth; hudScene`。

**文中的ts代码块和interface为用户已经确认的版本**

### 0.2 v2.js 结构索引

（基于 1752 行版本，commit b6ac7fe；`#if` 分支在 `post.defines` 里切，`syncDefines()` L368 从 `P` 推导）

| 行 | 内容 |
|---|---|
| 1–48 | 面板 DSL（`clamp/R/V2/vec2/toN/fromN/fmt/buildPane`，handover 历史 §8） |
| 49–85 | `P_VER=3`、`P_DEFAULTS`（含植被 / 水下 / 星空 / 云 / 水面风格参数）、`WATER_PRESETS`（noise/mc/bliss）、`CLOUD_PRESETS`（vol/mc/bliss）、`loadP/saveP` |
| 86–164 | `createRenderer(ctx)` 入口、`P/D/S` 三桶、`PANEL` 声明（L92） |
| 165–207 | **世界入口**：`SRC = ctx.source ‖ voxelCraftSource`、`BT = ctx.blockTable ‖ voxelCraftBlocks`，`H = SRC.height`；`uInfo` 打包（r = kind‖opaque<<4‖solid<<5‖cullSelf<<6‖leaf<<7，gba = tile）；树叶扩展 id 192–254 halo / 255 LEAVES_INNER（仅 `LEAF_OK`：宿主 id 全 <192）；`intTex3D` |
| 208–240 | `rebuildRing`（N=2rd+5；`uVox` RG8UI、`uBrick` R8UI、`uCol` RGBA16UI = maxY+1 / 归属键 / 空段掩码 / 实段掩码）、`setColumn`（`worldMaxY` 仅最高列下降时重算） |
| 241–284 | `leafPost`：读 4 邻区块 `getBlocks`，内部树叶 → 255、树叶旁空气 → halo id（6 方向掩码）；只在 cull/halo 开关翻转时整环重传 |
| 285–332 | `uploadChunk`（CPU 单遍扫描：体素 + 砖 + 列高 + 段计数 + 树叶索引 → `copyTextureToTexture3D`）、`clearChunk`、`reuploadAll`、`SRC.onChunkChanged`（新区块进环且树叶后处理开启时重传 4 邻） |
| 334–400 | `apply(key,fx)`（fx：rt/tex/sh/dbg/默认存盘）、`resetDefaults`、`setPreset`、**`syncDefines`**（LEAF_CARDS/CLOUD_STYLE/WATER_STYLE/LEAF_SH/LEAF_SH_LOD/LEAF_LOD）、Tweakpane 动态加载、F4 |
| 401–460 | `DDA_FS` 开头：`#define H`、测量宏（`DBG` 1/2/3/5、`DBGRAW`、`DBG_HEAT`、`CNT`、计数器 `gFetch/gIt/gSIt/gLvC/gLvB/gLvV`）、uniform 声明、注入 `GLSL.light/mat/fog`、`hashU/ign` |
| 461–537 | `#if CLOUD_STYLE==2`：`cloudDen`（64³ Perlin-Worley 3D 噪声 ×2 采样）、`hgPh`、**`cloudVol(nS,nL)`**（抖动步进 ≤64，朝光 ≤4 步，行星曲率） |
| 538–592 | `cloudHit`：风格 2 转 `cloudVol(44,3)`；风格 0/1 用宿主 64² 云图做 2D DDA（≤96 步，每步 1 fetch） |
| 597–652 | 数据访问：`voxAt`（环形取模）、`brickAt`、`colAt`（归属校验）、`infoR`、`cellLO`、**`smoothLight`**（9×(voxAt+infoR)=18 fetch）、`cellAt/faceUV/lodAt/solidAt` |
| 653–692 | `crossHit`（花草，含高草摇动剪切）、`torchHit` |
| 693–768 | **树叶**：`cellD/lhash/lodK/lodDither/lodSolid`（距离 LOD 抖动实心化）、`swayK/swayF`（摇动）、`leafFace`（入射面 alpha）、`#if LEAF_CARDS` `leafCards`（格内 2–4 张卡片，按哈希旋转/翻转/偏移，可外伸） |
| 770–963 | **`trace(ro,r,maxD,maxSteps,shadow,…)`**：环 AABB 裁剪 + 天空早退（L781）；砖级循环：换区块列取 `colAt`、列高跳过（L797）、`#if SECT` 段跳/段实（L818）、进砖（L838）；体素级：出砖回砖级、出水点记录、`uInfo` fetch、树叶分支（阴影三档 / LOD / 卡片 / halo 外伸 ≤3 邻）、不透明 / 镂空 alpha（`nAlpha≤8`）、水入水点（lowerTop 1/8）、花草/火把；预算耗尽 → `kind=4` 全雾 |
| 965–983 | `#if DBG_HEAT` `heat/dbgOut`（热力图 / `DBGRAW` 原始计数），`RET` 宏 |
| 985–1005 | `starAt`：立方体贴图分格程序化星星（闪烁、地平线淡出） |
| 1006–1033 | 水面辅助：`nB`（噪声高度）、`shoreH`（岸边涌浪相位）、**`shoreDist`**（水面层 5×5 邻格 ≤24 次 `voxAt`）、`skyDir` |
| 1034–1054 | `#if WATER_STYLE==2` `seaOct/seaH`（Seascape 尖峰波，≤4 倍频 × 2 方向，每倍频 1 次 `nB`） |
| 1055–1076 | 水下仰视波纹：`uwRip`（7 向余弦 ×8）、`uwRipple`（3 次 `uwRip` 差分） |
| 1077–1128 | 水下光效：`causAt/uwField`（焦散场）、`uwSunC/uwLs`（折射阳光）、`uwAbsorb`（Beer 吸收）、`uwCaustic`（向上找水面 ≤8 `voxAt`）、`uwShafts`（6 采样 × 2 `nB` 光束） |
| 1129–1163 | `reflHit`（反射：`trace(…,64 步)` + 简化着色，无 AO/阴影）、`#if WATER_STYLE==2` `reflScene`（未命中 → 天空 + `cloudVol(14,1)`/`cloudHit`） |
| 1165–1438 | **`main`**：射线/深度/雾距裁剪 → `trace`（L1180）→ `camW/water/uwSurf` 判定 → 仰视波纹折射方向 `rc`（L1193）→ **`cloudHit` 每像素无条件调用（L1211）** → 天空分支（水下雾 / 夜空星星 / 云）→ 命中着色（L1232：`smoothLight`+AO、树叶卡片/花草本格光、**阴影射线 `trace(uSunDir, uShadowSteps)`** L1266、水下焦散、岸壁水线 L1287）→ **水面分支**（L1307：`shoreDist`、噪声法线、风格 2：`seaH`×3 + `reflScene` + 焦散 + **高光阴影射线** L1361；风格 0/1：正弦法线 + 贴图 + 天空色反射）→ **水下仰视分支**（L1392：`reflHit(rc, 96 步)` 折射重追踪、斯涅尔窗、水面贴图、吸收、光束）→ 雾 / 光束 / 云合成 → `gl_FragDepth` |
| 1440–1474 | `waterNoiseTex`（128² 可平铺值噪声 bump，RG 斜率 B 高度） |
| 1475–1520 | `makeCloudNoise`（64³ RG8：Perlin-Worley + Worley fbm，首次 `CLOUD_STYLE=2` 时生成） |
| 1521–1547 | `uni`（≈60 个 uniform）、`post`（`defines` 初值全 0，`AlwaysDepth` + 写深度）、全屏 quad |
| 1549–1562 | `comp`：ddaRT 与 sceneRT 逐像素比深度 |
| 1564–1589 | `makeRT/freeRT/ensureRT`（`scale` + `maxMP` 像素上限 → `ddaScale`） |
| 1591–1621 | 分 pass GPU 计时：`gpuPass(i)/gpuPoll`（scene/dda/comp 三查询一组，`gpu` EMA + `gpuLast` 原始值） |
| 1623–1630 | `setDebug(view,raw)`（改 `DBG/DBGRAW` 重编译） |
| 1632–1696 | **`render()`**：sceneRT（隐藏宿主星星）→ 局部坐标 / 滞后相机 `uRoLag` → 全部 uniform 回填（含从 `ctx.U.uSunDir`、`ctx.skyMat`、`ctx.cloudMat`、`ctx.clouds` 读宿主状态，隐藏宿主平面云）→ ddaRT → comp |
| 1698–1723 | 导出：`name/P/P_DEFAULTS/panelSpec/paneReady/togglePanel/ring/reuploadAll/post/comp/D/setDebug/perf/sceneRT/ddaRT/source/blockTable/buildChunk/disposeChunk/update/render/stats`。`update` 里隐藏宿主 `#water` 遮罩、`rd` 变化重建环、相机在水中时改写 `U.uFogNear/uFogFar` |
| 1725–1752 | **VoxelCraft 适配器**：`voxelCraftSource(ctx)`（`size/height/getBlocks/getChunk/forEachChunk/onChunkChanged/built/disposed`）、`voxelCraftBlocks(ctx)`（`kind/opaque/solid/occupied/cullSelf/tile*/waterId/leavesId/tallGrassId/tileCard`） |

### 0.3 已测得的基线（Intel RPL-S 核显，ANGLE/GL，1280×657，rd=6，整帧 GPU 含 scene pass）

| 设置 | 整帧 GPU |
|---|---|
| scale 0.65 + 阴影 20 步（**当前默认**） | 8.7 ms（60 fps 勉强） |
| scale 0.5 | 6.1 ms |
| scale 0.4 | 4.4 ms |
| scale 1.0 | 13.8 ms（54 fps） |
| 2560×1400 无像素上限 → 1.5 MP | 48 ms（`maxMP=0.7` 后降到 ×0.58） |

结论：核显上 **每 DDA 像素约 12–16 ns**，要在 scale≥0.8 跑 60 fps 需要把每像素成本砍 2–3×。
`steps` 本身不是瓶颈（64..384 画面逐像素零差异，见历史 §7.7），**平均步数与每步 fetch 数**才是。
