<!-- handover/renderer-refactor/s00-status.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§0 现状 · 接口约定 · v2.js 结构索引 · 初始基线**
> 状态：有效（§0.2 结构索引已按 goalP3P4 完成后的 2207 行版本更新）
> 何时读：任何阶段开工前先读 §0.1/§0.2；§0.3 已被 §6.2 取代
> 对应 goal-renderapi.ts：§0.1 ↔ goal-renderapi.ts §0（RendererCtx/Renderer）

## 0. 现状

| 文件 | 状态 |
|---|---|
| `VoxelCraft.html` | 宿主 A：世界/光照/实体/UI；`RCTX` 传给渲染器；`?r=v1`（默认）/ `?r=v2`；`RCTX.settings = settings`（L2346） |
| `v1.js` | 光栅化基线（逐面网格 + 顶点 AO + 四角平滑光照），完成，**画面基准** |
| `v2.js`（2207 行） | DDA 渲染器：M0–M2 + P0/P1 + 效果期（树叶 / 水面三风格 / 水下 / 云三风格 / 星空）+ **goalP3P4（宿主 A）**：测量补齐（DBG 4/6/7–9）、云门控、`Env` + 流体收口、`onChunkChanged(what)`/`rev`/`aux` + CPU 镜像、`uVox` RGBA8UI + `uInfo` 256×64、**P2 距离场**（按区块、无状态 Worker、编辑队列）、P3 部分项（阴影射线前移；§4-5 / §9.2-2 实现但默认关）。结果见 §6.4/§6.5；接口形态见 `goal-renderapi.ts`（已按实现补注 `[goalP3P4]`）。下一步：宿主 B 接入（`goalP4P5`）；性能主杠杆是寄存器压力（§8.7） |
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

（基于 goalP3P4 完成后的 2207 行版本；旧的 1752 行索引见 git `b6ac7fe`。`#if` 分支在 `post.defines` 里切，`syncDefines()` 从 `P` 推导）

| 行 | 内容 |
|---|---|
| 1–48 | 面板 DSL（`clamp/R/V2/vec2/toN/fromN/fmt/buildPane`） |
| 49–92 | `P_VER=3`、`P_DEFAULTS`（新增 `df` 距离场开关、`cloudLowRes`、`sceneClip`）、`WATER_PRESETS`/`CLOUD_PRESETS`（导出为 `VR.presets`）、`loadP/saveP` |
| 93–174 | `createRenderer(ctx)` 入口、`P/D/S` 三桶、`PANEL`（DBG 视图 0–6） |
| 175–190 | **世界入口**：`SRC/BT/ENV`（`ctx.env ‖ voxelCraftEnv`），`isFluidId`、`blockAt`（相机格判定只经 `ChunkSource`） |
| 191–211 | 环形状态 `ring`：`mir[]` CPU 镜像（goal-renderapi §5）、`rev`、`dfSeq/dfAck`、各路径计数（uploads / upMs / lightUploads / clears / dedup / dfSent / dfDone / dfDrop / dfMin / dfInval / edits）；`VB=4` |
| 212–258 | **方块状态表**：`defaultState` / `v2State`（树叶扩展 192..255）→ `uInfo` 256×64（ts `UINFO`）+ `VFLAG`（A 高 3 位）/ `VCLS`（DF 分类）/ `VKIND` |
| 259–292 | `rebuildRing`（`uVox` RGBA8UI、`uBrick`、`uCol` RGBA16UI）、`setColumn` |
| 293–337 | `leafPost`（内部树叶 → 255、halo；写 flags 与 DF 占据） |
| 338–413 | `pushVox`（镜像槽位 → `copyTextureToTexture3D`）、**`uploadChunk`**（单遍扫描：镜像 RGBA + 砖 + 列高 + 段 + DF 占据 / 旧 dist 保留与新占据检测；`aux.*` 有就用）、**`uploadLight`**（'light'：只改 G）、`clearChunk`、`reuploadAll` |
| 414–496 | **P2 距离场**：`dfUpdate`（编辑路径从镜像重算占据）/ `dfApply` / `dfFix`（新占据本区块 min 更新或整块退回未计算）/ `dfMerge` / `dfSend`（`{t:'occ'}` transfer）/ `dfReceive`（归属 + seq 校验）/ `dfStartWorker`（Blob Worker 跑 `dfTransform`）/ `dfPending` |
| 497–565 | **单格编辑队列**：`onBlockChanged` → `editQ`（ts `EDITQ` 打包）→ `flushEdits` → `editBox`（脏盒改镜像 + 只传脏盒）/ `rescanColumn` |
| 566–586 | **事件入口 `onChunkEvent(cx,cz,what)`**：'gone' / rev 去重 / 'light' / 'blocks'（新区块进环时重传 4 邻） |
| 587–653 | `apply(key,fx)`、`resetDefaults`、`setPreset`、**`syncDefines`**（DF / SCENE_CLIP / CLOUD_LR / LEAF_* / CLOUD_STYLE / WATER_STYLE，同步到云 pass 材质）、Tweakpane |
| 654–714 | `DDA_FS` 开头：测量宏（DBG 1/2/3/4/5/6/7–9、`CNT/TEXC/CLC`、`matSampleLod` 计数宏）、uniform 声明 |
| 715–720 | **流体收口**：`FLUID_TILE`、`isFluid(uvec4)`（A 通道 FLUID 位）、`fluidTop(lvl, above)`（TODO-4） |
| 711–866 | 云：`cloudDen/hgPh/cloudVol(…, tLim)`（风格 2）、`cloudHit(…, tLim)`（风格 0/1 2D DDA；入口 ≥ tLim 直接返回 = 云门控） |
| 867–933 | 数据访问：`voxAt`（uvec4）、`brickAt`、`colAt`、`vhm/infoOf`（hid = id \| meta<<8 选 uInfo 行；`META=0` 不读 B）、`cellLO`（1 fetch）、`smoothLight`（9 fetch） |
| 934–1050 | `crossHit`、`torchHit`、树叶（`lodK/lodDither/swayK/leafFace/leafCards`） |
| 1051–1292 | `cellIn`（入格：clamp(floor(ro + r·t))）、**`trace`**：平面时间现算；砖级（列跳 / SECT / DF 入口探测 → 逐格层 dfm / uBrick）；逐格层（dfm ∧ v==0 退化；camWater 出水点；k = v−2 ≥ 1 不看内容，否则命中分派：A 通道快速不透明 / 流体入水 / uInfo 通用分支）；**统一步进**（盒 [cell−k, cell+k+1) xz 裁到本区块的出口面，k = 0 即普通一步）；换区块 → 砖级 |
| 1293–1314 | `heat/dbgOut`（DBG 4 = DF 跳跃 / 退化计数） |
| 1315–1494 | `starAt`、水面辅助（`nB/shoreH/shoreDist/skyDir`、Seascape `seaH`）、水下（`uwRip/uwRipple/causAt/uwField/uwAbsorb/uwCaustic/uwShafts`）、`reflHit`、`reflScene` |
| 1495–1813 | **`main`**：`#if CLOUD_PASS` 低分辨率云 pass 入口；射线 / §4-5 保守深度裁剪（`SCENE_CLIP`）→ 主射线 → DBG 7–9 探针 → 水面 / 水下判定 → 水下波纹 → **云门控**（`tCl`；`CLOUD_LR` 时采样低分辨率结果）→ 天空分支 → 命中着色（平滑光照 / ndl / G → **阴影射线先发**，贴图 / AO 其后）→ 岸壁水线 → 水面分支 → 水下仰视分支 → 合成 |
| 1814–1894 | `waterNoiseTex`、`makeCloudNoise` |
| 1895–1940 | `uni`、`post`（`defines` 初值）、云 pass 材质 ×2、`renderClouds`（¼×¼） |
| 1941–1989 | `comp`、`makeRT/freeRT/ensureRT` |
| 1990–2023 | GPU 分 pass 计时（`scene / cloud / dda / comp`）、`setDebug` |
| 2024–2097 | **`render()`**：sceneRT → uniform 回填（`ENV.*`）→ 云 pass（CLOUD_LR）→ ddaRT → comp |
| 2098–2125 | 导出：…`resetLag`、`ring/reuploadAll/onChunkEvent/onBlockChanged/flushEdits`、`df { T, pending, cls, transform }`、`presets`、`env`；`update()` = rd 变化重建环 → `flushEdits` → `ENV.underwater` |
| 2126–2162 | **`dfTransform(occ, H, T)`**（模块级、自包含：截断切比雪夫三遍可分离变换） |
| 2163–2207 | **适配器**：`voxelCraftSource`（rev = build 计数、`emit(c, what)`）、`voxelCraftEnv`、`voxelCraftBlocks` |

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
