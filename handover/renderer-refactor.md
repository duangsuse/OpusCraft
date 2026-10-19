# VoxelCraft 渲染器交接 · v2 DDA 性能阶段

> 上一版（接口约定、old.htm 移植拆解、M0–M2 实施记录、面板 DSL 规范）已完成，全文见 git 历史：
> `git show 801c7e4:handover/renderer-refactor.md`。本版只保留**仍要用到的约定**，其余篇幅全部给性能。

## 0. 现状

| 文件 | 状态 |
|---|---|
| `VoxelCraft.html` | 宿主 A：世界/光照/实体/UI；`RCTX` 传给渲染器；`?r=v1`（默认）/ `?r=v2`；`RCTX.settings = settings`（L2346） |
| `v1.js` | 光栅化基线（逐面网格 + 顶点 AO + 四角平滑光照），完成，**画面基准** |
| `v2.js`（1752 行） | DDA 渲染器，M0–M2 + **P0（测量）+ P1（`ChunkSource`/`BlockTable`/段标记）** 完成（§6.1–6.3）。P1 之后（commit d32dad6 / b6ac7fe）按 `handover/finished/goals-trees.md` 加了一批**画面效果**：树叶（摇动 / 卡片叶簇 `LEAF_CARDS` / 内部剔除 id 255 / 外伸 halo id 192–254 / 阴影三档 / 距离 LOD）、水面三风格（`WATER_STYLE` 0 噪声 / 1 Reimagined / 2 Bliss：Seascape 高度场 + 真实反射射线 + 高光阴影射线）、岸边涌浪 + 岸壁水线、水下（吸收 / 焦散 / 光束 / 仰视波纹折射）、云三风格（`CLOUD_STYLE` 0 体积 2D-DDA / 1 MC 方块 / 2 Bliss 体积积云 3D 噪声）、程序化星空、滞后相机。**这些效果的开销尚未进基准**（§9）。优化仍停在 P1，下一步 P2 距离场（§3.4）；经验见 §8，接口预设计见 §10 |
| `index.html` + `gls.js` | 宿主 B（bridge-mind 精简版，three r170）：`CHUNK_H=128`，`Mesher.greedy` 贪心合并，增量光照（`Lighting`）。**v2 尚未接入**，是 `ChunkSource` 接口的第二个消费者 |
| `tools/verify-renderer.mjs` | 无头 Chromium 接口验证，v1/v2/bogus 三组 PASS（`node tools/verify-renderer.mjs`，需 `http://localhost:8765/`） |

### 0.1 仍然有效的接口约定（简）

```js
export function createRenderer(ctx) → { name, buildChunk(c), disposeChunk(c), update(dt), render(), stats() }
```
- `buildChunk` 可重入（编辑/邻居光照变化会反复调用）；`disposeChunk` 后 `c.mesh = c.waterMesh = null`。
- 区块只在 3×3 邻居都生成后才 build；`c.blocks / c.sky / c.blk` 索引 `(lx*16+lz)*CH + y`（index.html 的 `bidx` 同布局，CH=128）。
- 共享 GLSL：`voxLight(sky,blk)`、`matSample/matSampleLod(uv,layer,lod)`、`applyFog(c,z)`；共享 uniform 对象 `U`（含 `uSunDir`）。
- 主循环：`updateChunks(5ms)` → `updateSky → VR.update` → `clear; VR.render(); clearDepth; hudScene`。

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

## 1. 成本模型：一个 DDA 像素里钱花在哪

当前 `trace` 的每步成本（每个循环迭代）：

| 阶段 | 每步 fetch | 备注 |
|---|---|---|
| 砖级（空砖区） | 1×`brickAt`（R8UI）+ 换区块列时 1×`colMaxAt` | 每步前进 4 格；列高跳过处理天空/山脊 |
| 体素级（进入非空砖） | 1×`voxAt`（RG8UI）+ 命中非空时 1×`uInfo` | ≤10 步/砖；树冠/草地几乎每步都非空 |
| 命中着色 | `smoothLight` 9×(`voxAt`+`uInfo`) = **18 fetch** + 1 atlas | 固定一次；和 ~25 步的步进相比不可忽略（≈30–40% 的 fetch） |
| 阴影射线 | 又一次 `trace`（默认 20 步）| `sky<8` / 背光面跳过；仍是第二大项 |
| 体积云 | `cloudHit` **每像素都跑**，最多 96 次 2D 步 | 云 slab 裁剪后多数射线仍要走一段；未测 |
| 水面 | 2 次噪声采样 + 若干 sin | 只在水像素 |

现有的加速结构（都在 `uploadChunk` CPU 打包时顺手算，与 mesher 无关）：
**4³ 砖占用**（R8UI）、**区块列高 `maxY`**（`uCol`，附带槽位归属校验）、**全局 `uWorldMaxY`**（天空早退）、**雾距裁剪** `maxD = min(uFogFar, sceneZ)`。
没有的：16³ 区块级标记、占据位图、距离场、预打包 AO。

> 在动手加结构之前，**先把 §5 的测量工具做出来**（步数热力图 + 分 pass 计时）。
> 没有它们，下面每一项的收益都只是估算。

## 2. 目标架构：`ChunkSource` + mesher 副产品 + 距离场 Worker

### 2.1 `ChunkSource`（v2 唯一的世界入口，取代直接读 `ctx.chunks / c.blocks / c.sky / c.blk`）

```ts
interface ChunkSource {
  size: 16;                                  // 区块边长
  height: number;                            // 96 / 128 / 256，不能写死；要求 height % 16 == 0
  getChunk(cx, cz): {
    blocks: Uint8Array | Uint16Array;        // (lx*16+lz)*height + y
    light?: Uint8Array;                      // 同索引，sky<<4 | blk；缺省视为 sky=15, blk=0
    maxY?: number;                           // 可选：最高非空 y+1（index.html 的 Chunk.height 已有逐列版本）
    accel?: ChunkAccel;                      // 可选：mesher 顺手产出的加速结构（§3），没有则 v2 自己算
  } | null;                                  // null = 未加载/已卸载 → v2 清槽位
  onChunkChanged(cb: (cx, cz) => void);      // 生成完成、光照变化、编辑、卸载 都走它
  onBlockChanged?(cb: (x, y, z, oldId, newId) => void);   // 可选：有它才能走 §3.4 的「单格即时路径」
}
interface ChunkAccel {
  sectionFlags: Uint8Array;                  // height/16 项：0 空 1 混合 2 全不透明
  brick: Uint8Array;                         // 4×(height/4)×4，1 = 非空（RENDER!=0）
  bitmap?: Uint32Array;                      // 可选：16³ 占据位图，height/16 × 128 个 uint32（布局见 §3.2）
  faceAO?: Uint8Array;                       // 可选：§3.5
}
```

- **方块表**单独一个适配对象 `BlockTable`：`kind[id]`（0 无 / 1 立方 / 2 花草 / 3 火把 / 4 水）、`opaque[id]`、`solid[id]`、`occupied[id]`（= 射线必须停下检查的：`kind != 0`）、`tileTop/Bot/Side[id]`。v2 用它生成 `uInfo`，Worker 用 `occupied` 算距离场。
- 两个宿主的适配器：
  - **VoxelCraft**：`getChunk` 直接返回 `{blocks: c.blocks, light: pack(c.sky, c.blk)}`；`onChunkChanged` 挂在 `meshChunk`（build 之后）和 `disposeChunk`；`onBlockChanged` 挂在 `setBlock`（L1308）。`accel` 由 v2 自己在打包时算（现状）。
  - **index.html**：`getChunk` 读 `gg.world` 的 `Chunk`（`state >= CH_LIT`），`maxY = max(c.height)`；`onChunkChanged` 挂 `Mesher.buildChunk`（L1332）和 `world.chunks.delete`（L1272）；`onBlockChanged` 挂 `Events.on('blockChanged')`。`accel` 由 `Mesher.fillPadded / greedy` 顺手产出（§3）。
    着色侧差异（2D tile 图集而非 `DataArrayTexture`、生物群系 tint、`model: box/layer/door/liquid`）**不在本阶段范围**，先只接几何 + 加速结构，用 VoxelCraft 的材质路径验证性能。
- v2 内部：`buildChunk(c)` → `source.onChunkChanged` 回调 → `uploadChunk(cx,cz)`；环形槽位/归属校验逻辑不变；`${CH}` 在 shader 里全部改成 `uH`/`#define H`（由 `source.height` 注入）。

### 2.2 mesher 副产品 → DDA 加速结构（对照现状）

| 副产品 | mesher 额外成本 | v2 现状 | 对 DDA 的收益（相对**现状**，非相对裸体素 DDA） |
|---|---|---|---|
| 区块级空/实标记（16³ 段） | ~0（quad 数==0 时判断全空/全实） | 无；只有列高 | 列高已经干掉了地表以上的空段；新增收益在**山体侧面、悬崖、洞穴**（列高很高但大半是空气）和地下全实段（进入即命中，不下探到体素级）。估 1.2–1.5× |
| 16³ 占据位图（512 B/区块段，R32UI） | +5% | 无；体素级直接读 RG8UI | 体素级每步 1 bit 代替 2 B，一个 texel 覆盖 2×4×4 格，**连续几步命中同一 texel 不用 fetch**；树冠/草地里 1.5–2× |
| 4³ 砖占用 | +2% | **已有** | — |
| Chebyshev 距离场（截断 16） | +50–100% mesher 时间 → 放 Worker | 无 | **单项最大**：开阔处一步跳 ≤16 格（砖级是 4 格），掠射角沿地表的射线从「每 4 格一次 fetch」变「每 d 格一次」。相对现状估 2–4× 步数下降；替代砖级循环 |
| 逐面 AO 四角打包 | +3%（greedy 合并前 `k1>>>16 & 255` 就是它） | 无；shader 9 邻域 | 只省掉 AO 的不透明判定，平滑光照仍要 9 个邻居的 sky/blk；存储是难点（§3.5）。估着色 10–20%，总帧 <5% |

## 3. 加速结构设计

### 3.1 区块段标记 + 列高（扩展现有 `uCol`）

- 新纹理 `uSect`：`R8UI` 3D，尺寸 `N × H/16 × N`；0 = 全空、1 = 混合、2 = 全不透明（`opaque[id]` 对全部 4096 格成立）。
- 生成：VoxelCraft 在 `uploadChunk` 的扫描里顺手统计；index.html 在 `Mesher.greedy` 结束后按「该段 quad 数 == 0 且首格为空/不透明」判断（mesher 已经知道每个面是否暴露）。
- shader：砖级循环前先检查 `uSect`；`0` → 用段 AABB 直接跳到段出口（同列高跳过的写法）；`2` → 以进入面为命中（`hc` = 入口格，`voxAt` 取 id 着色）；`1` → 现有砖级/体素级逻辑。
- 三级循环（段→砖→体素）会增加寄存器压力；**若 3.4 的距离场上线，段级空标记可以取消**（d=16 的跳跃覆盖了它），只留「全实 = 直接命中」。

### 3.2 16³ 占据位图（体素级步进的廉价替身）

- 布局：`R32UI` 3D，尺寸 `SX/2 × H/4 × SX/4`；texel `(x>>1, y>>2, z>>2)`，bit = `(x&1) | (y&3)<<1 | (z&3)<<3`。每 texel = 2×4×4 格。
- shader 体素级：`cur = texelFetch(uBits, tc)`；步进后若 `tc` 不变则直接查寄存器里的 `cur`，不 fetch。只有 bit=1 才去 `voxAt` 取 id/kind。
- 生成：mesher 扫描时 `bits[(y>>2)*... ] |= 1 << bit`（index.html 在 `fillPadded` 拷贝循环里顺手；VoxelCraft 在 `uploadChunk` 里）。每区块 `H/16 × 512 B`。
- 与 3.4 的关系：有距离场后，d≥2 的格子不需要位图；d∈{0,1} 的「表皮」里位图仍能省 fetch。两者不冲突，但**优先做距离场**；位图作为「距离场未就绪区块」和低端机（不想开 Worker）的退化路径。

### 3.3 4³ 砖（已有，不动）

仅一处改进：`uploadChunk` 的 `setColumn` 每次都 O(N²) 重算 `worldMaxY`，改为只在列高下降时重算（微小，但每次编辑都触发）。

### 3.4 Chebyshev 距离场（重点）

**定义与编码**：`d(p)` = 到最近「占据格」（`occupied[id]`，即 `kind != 0`，含水/花草/火把/树叶）的切比雪夫距离，截断 `T=16`。
纹理 `uDist`：`R8UI` 3D，与体素纹理同尺寸（`SX × H × SX`），值 `v = d + 1`（1 = 本格被占据，2 = 相邻，…，17 = ≥16），**`v = 0` 保留为「未计算」**。y 越界：`y<0` 视为占据、`y>=H` 视为 d=T。

**shader 用法**（替换砖级循环；列高跳过与 `uSect==2` 保留）：
```
loop:
  v = dist(cell)
  v == 0  → 退化：brickAt/位图 路径（现有代码）
  v == 1  → 占据：取 id/kind，走现有的「命中 / cutout / 花草 / 火把 / 水」判定；未命中则体素步进 1 格
  v == 2  → 体素步进 1 格（本格确定是空气，不取 id）
  v >= 3  → 跳跃：k = v-2；盒子 [cell-k, cell+k+1)（局部坐标），t = 盒子出口；cell = floor(ro + r*(t+ε))；nrm 按出口轴；重算 tM
```
每次跳跃 = 1 fetch + 一次 slab 求交（≈12 ALU），不比砖级一步贵。注意 `ε` 与现有 `cellAt(ro,r,t+1e-4,…)` 用同一套，避免掠射角下在盒子边界反复。

**生成（Worker，`v2-dist.worker.js`）**：
- 截断 L∞ 距离变换可分离、三遍：
  1. X 遍：对每条 (y,z) 行，前向/后向两次扫，得 `dx = min |x-x'|`（截断 T）。
  2. Y 遍：`dxy(x,y,z) = min_{|k|≤T} max(|k|, dx(x,y+k,z))`，k 从 0 向两侧扩，`|k| ≥ 当前最优` 即停。
  3. Z 遍：同上。
- 区块 C 的 DF 需要邻居：X 遍覆盖 `x,z ∈ [-16,32)` 全高，Y 遍覆盖 `x∈[0,16), z∈[-16,32)`，Z 遍只算 C。
  估算 H=96：≈ 0.2M×2 + 74K×≤32 + 24K×≤32 ≈ 3–4M 简单操作，**JS 里 3–6 ms/区块**，放 Worker 不占主线程。
- Worker 持有全部已加载区块的 `occupied` 位镜像（`Uint8Array(16·H·16)`，或直接用 §3.2 的位图，省 8× 内存）。
- 邻居尚未加载 → 视为空气算一遍（结果偏大 = **不安全**吗？否：邻居不存在时 v2 环形纹理里它也不存在，射线不会进入；邻居到达后会触发邻居的 DF 计算，**同时要把已算过的 8 个邻居标脏重算**，否则边界 16 格内的 d 会偏大 → 穿帮）。

**协议**：
```
主线程                                   Worker
init {height, occupied: Uint8Array(256)}  ─▶
load {cx,cz, blocks}  （blocks 是 copy，   ─▶  存镜像；算本块 DF；把 8 个邻居入队重算
      不要 transfer 掉 c.blocks！）
                                          ◀─ dist {cx,cz, buf: Uint8Array(16·H·16)}（transfer，H=96 时 24 KB）
                                             主线程：槽位归属仍是本块 → copyTextureToTexture3D 进 uDist
unload {cx,cz}                            ─▶  删镜像（不重算邻居：它们边界处 d 偏小，安全）
edit {x,y,z,occ}                          ─▶  更新镜像；局部重算（见下）并返回受影响区块（≤9 个）的 dist
```
- Worker 队列：**edit 优先于 load**；同一区块多次入队去重；`dist` 回来时若槽位已被别的区块占用则丢弃。
- 主线程上传：`stDist`（`Data3DTexture 16×H×16`）复用现有 `copyTextureToTexture3D` 路径；区块卸载时 `uDist` 槽位不用清（列高 0 就不会进）；**区块重新上传（光照变化）不要清 DF**（DF 只依赖 occupancy，光照变化不影响）。

**编辑路径（安全性是关键）**：
- DF **偏小永远安全**（少跳几步），**偏大就穿帮**（射线跳过新放的方块）。
- 放置（空→占据）：只需 `d_new = min(d_old, cheb(cell, p))`，对 `(2T+1)³ = 36K` 格做一遍 min，**不需要邻居信息**。推荐主线程保留一份 DF CPU 镜像（24 KB/区块，300 区块 ≈ 7 MB），放置时**主线程同步**做这个 min 并立即上传受影响区块（≤9 块 × 24 KB），零延迟且安全；再把 edit 通知 Worker 同步镜像即可，不必等它返回。
- 移除（占据→空）：主线程把该格 `v` 写成 **1**（当作仍占据 → shader 取 id 发现是空气 → 步进 1 格，安全且立即可见）；Worker 异步做局部精确重算（只重算 `cheb ≤ T` 的 36K 格，X/Y/Z 三遍限定在 `(2T+1)³` 盒子及其 ±T 的输入范围，≈ 3–5 ms），回来后覆盖。
- 若不想在主线程存镜像：退而求其次是放置时同步把 **`(2T+1)³` 全写 1**（安全但损失那片的跳跃，直到 Worker 回包覆盖），仍比等 Worker 好。

**退化**：`v == 0`（Worker 未回）→ 现有砖级/位图路径，不卡画面。距离场默认开，面板加 `df` 开关（0 = 强制退化，用于 A/B 测步数）。

**内存**（`N=2rd+5`，`SX=16N`；单位 MB）：

| rd | N / SX | 体素 RG8UI H=96 / 128 | DF R8UI H=96 / 128 | 位图 R32UI H=96 | 砖 R8UI |
|---|---|---|---|---|---|
| 6 | 17 / 272 | 14.2 / 18.9 | 7.1 / 9.5 | 0.9 | 0.2 |
| 8 | 21 / 336 | 21.7 / 28.9 | 10.8 / 14.5 | 1.4 | 0.3 |
| 12 | 29 / 464 | 41.3 / 55.1 | 20.7 / 27.6 | 2.6 | 0.7 |

**备选（若 Worker 成本/内存不可接受）**：砖级距离场 —— 在 4³ 砖占用上算 DF（1 B/砖，尺寸是体素 DF 的 1/64，H=96 rd=8 仅 170 KB，算一块 <0.1 ms 可放主线程），一次跳 ≤16 砖 = 64 格；进入非空砖后按现有体素级走。开阔处收益与体素 DF 相当，**表皮内（掠射角沿地表）不如体素 DF**。先做体素 DF，用 §5 的热力图比较后再决定是否保留两者。

### 3.5 逐面 AO 四角打包（最后做，先测再做）

- 来源：index.html `Mesher.greedy` 里 `k1` 的 bit 16–23 就是 4 角 AO（2 bit × 4），在合并前按 `(axis, side, s, i, j)` 写出即可；VoxelCraft 没有 mesher，要在 `uploadChunk` 里补一遍 6 面邻域扫描（+ 不止 3%）。
- 存储难点：3D 纹理里「每面 1 B」= 6 B/格。可利用「相邻两格之间的那个边界面，最多只有一侧暴露」压成 **每格 3 B（RGB8UI：x/y/z 三个负向边界）**；rd=8 H=96 仍要 32 MB。
- 它只省 `smoothLight` 里的 9 次 `uInfo`（不透明判定），sky/blk 的 9 次 `voxAt` 仍在。更划算的替代：**把 `opaque/solid/kind` 位塞进体素纹理**（RG8UI → RGBA8UI：R=id，G=sky<<4|blk，B=flags，A=DF！），`cellLO` 从 2 fetch 变 1 fetch，体素级步进也不再查 `uInfo`，而且 DF 和体素合并成一次 fetch。代价：体素纹理 ×2（rd=8 H=96 → 43 MB，DF 纹理省掉 11 MB，净 +11 MB），DF 上传要改成写 A 通道（`copyTextureToTexture3D` 无法只写一个通道 → 主线程持有 RGBA 打包镜像或由 Worker 直接回传整块 RGBA 98 KB）。
- 决策依据：§5 工具里加 `uDebug=3`（跳过 smoothLight，用本格光照）量出着色占比；**>20% 才值得动存储**。

### 3.6 整合后的 `trace` 结构

```
clip to ring AABB / maxD；天空早退 (uWorldMaxY)
loop (≤512, 预算 uSteps):
  换区块列 → colMaxAt；cell.y ≥ cmax → 跳列出口/降到 y=cmax（现有）
  [可选] uSect==2 → 命中入口格
  v = dist(cell)
    v==0 → 砖级一步（现有 brickAt；非空砖则体素级，现有）
    v>=3 → 盒跳跃
    v<=2 → 体素级一步；v==1 时取 id/kind 判命中（现有 cutout/花草/火把/水逻辑不变）
预算耗尽 → kind=4 全雾（现有）
```
阴影射线复用同一循环（`shadow=true`：不记录水、不做 cutout 采样、`nAlpha` 上限 2）。

## 4. 与加速结构无关、但应一起做的开销削减

| # | 项 | 做法 | 预期 |
|---|---|---|---|
| 1 | 阴影射线默认 20 步 | 先测关闭/开启差值；保留时：只对 `n.y>0` 顶面 + `G>0.3` 发射；或棋盘格半数像素发射、comp 时 2×2 取邻 | 核显上可能是 20–30% 的帧 |
| 2 | `cloudHit` 每像素执行 | 射线不可能到云 slab（`r.y<=0 && ro.y<y0`，或 slab 入口 `t` 已超过命中 `tHit`）时跳过；**先 trace 再算云**，把 `tHit*cosF` 作为云的 `tX` 上限 | 地面像素省 ≤96 次 2D 步 |
| 3 | `cellLO` 两次依赖 fetch | §3.5 的 flags 入体素纹理，或至少把 `opaque` 塞进 `uInfo` 之外的更小纹理 | 着色 fetch 18 → 9 |
| 4 | `voxAt/brickAt` 的取模 | `uOrgSlot*16 + o` 预合并为一个 uniform 偏移；`% uSX` 在 `SX` 为 2 的幂时换 `&`（N=2rd+5 不是 2 的幂 → 可把 SX 向上取到 2 的幂，多占内存换 ALU；核显上 ALU 不是瓶颈，**低优先**） | 小 |
| 5 | `scale<1` 时不做场景深度裁剪（`uClipScene=0`） | 对 `tDepth` 做 2×2 **max**（最远）采样作为保守裁剪，仍安全 | 实体/近景多时省步数 |
| 6 | sceneRT 全分辨率 + comp 全屏 pass | 不可省（深度合成需要），但 comp 可与 HUD 深度写合并……留着 | — |
| 7 | 预算耗尽像素 | 热力图里若成片 kind=4，说明结构没起作用，而不是 `steps` 太小 | 诊断用 |

## 5. 测量工具（P0，先做）

1. **分 pass GPU 计时**：现在只有一个查询包整帧；改为 `scene / dda / comp` 三个顺序查询（`qWait` 改数组），`stats()` 显示 `gpu s/d/c`。
2. **步数热力图**（已实现为编译期宏 `DBG`/`DBGRAW`，`VR.setDebug(view, raw)`；`DBG=0` 与生产着色器完全相同；`4`=dist 留到 P2）：`1` = 主射线迭代次数 / `uSteps` 映射成热力色，`2` = 总 fetch 次数（循环内计数），`3` = 跳过 `smoothLight`（本格光照），`4` = 显示 `dist` 值，`5` = 显示命中层级（段/砖/DF 跳/体素）。面板加「调试视图」下拉。
3. **固定机位基准**：`tools/bench-v2.mjs`（参考 `diag-water.mjs` 的写法）：同一种子、固定 4 个机位（平地远眺 / 树冠仰视掠射 / 洞穴 / 水面），每机位读 30 帧 `stats()` 的 `gpu` 与热力图平均步数（`readPixels` 求均值），输出表格。每个优化前后都跑它，**数字写进本文档 §6**。
4. 验证脚本增项：`VR.source` 存在且 `height` 与宿主一致；DF 开关切换后画面逐像素一致（DF 只应影响步数，不应影响画面——这是最好的正确性测试）；放置方块后下一帧无穿帮（放一个 1 格厚的墙，背后贴天空色，`readPixels` 检查）。

## 6. 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| P0 | §5 测量工具 | 四机位基线表（平均步数 / fetch / gpu ms）写入本节 |
| P1 | `ChunkSource` + `BlockTable` 适配（VoxelCraft），`H` 参数化；`uploadChunk` 产出 `sectionFlags`（§3.1） | verify 通过；画面与 P0 逐像素一致；步数在悬崖/洞穴机位下降 |
| P2 | 距离场 Worker + shader 跳跃 + 编辑安全路径（§3.4）；面板 `df` 开关 | DF 开/关画面 0 px 差异；四机位平均步数 ≥2× 下降；放置/移除下一帧可见无穿帮；主线程 `updateChunks` 耗时不升 |
| P3 | §4 的 1/2/3/5 | 核显 `scale 0.8` 四机位 ≤ 12 ms 整帧（目标 60 fps 留余量）|
| P4 | 位图（§3.2）作为退化路径 + index.html 适配器（几何 + 加速结构 + mesher 副产品） | index.html `?r=v2` 能出图（材质先用占位）；`Mesher` 产出 accel 的额外耗时 ≤5% |
| P5 | AO 打包 / flags 入体素纹理（§3.5），按 P0 工具的数据决定 | 着色占比下降可量化 |

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

## 7. 风险与注意

- `postMessage` **transfer 会把 `c.blocks` 从主线程拿走**，必须 `slice()` 或 structured clone；回传的 `dist` buffer 可以 transfer。
- Worker 积压时（快速移动大量加载）编辑必须插队；主线程的放置 min-更新不依赖 Worker，所以画面不会穿帮，只是跳跃暂时偏保守。
- DF 的不变量：**纹理里的 d 永远 ≤ 真实 d**。任何改 occupancy 的路径（生成、编辑、卸载邻居后再加载）都要对照检查；违反的症状是「掠射角下方块背面透出天空/雾的细条」。
- 区块光照变化（火把）会反复 `buildChunk` → 不要让它触发 DF 重算，也不要清 `uDist` 槽位。
- `copyTextureToTexture3D` 在 r160 对 RG8UI/R8UI 可用；R32UI（位图）需验证 `RedIntegerFormat + UnsignedIntType`，不行则裸 GL `texSubImage3D` + `resetState()`。
- 三级/多路径循环会抬高寄存器占用，核显 occupancy 下降可能吃掉收益——每加一级都用 P0 工具测，不要凭估算叠加。
- 环形 N 与 `uSect/uDist/uBits` 的槽位寻址必须与 `uVox` 同一套 `wrap`；`rebuildRing` 时一起重建、`reuploadAll` 时一起重传（DF 需向 Worker 请求 `resend-all`，或主线程镜像直接重传）。

## 8. 结构经验（P0–P1 落地后沉淀，后续阶段照此执行）

> 依据：`v2.js` 当前 936 行（P0 测量 + P1 适配层/段标记），`tools/bench-v2.mjs --cmp p0` 四机位 0 px。
> 下面每条都对应一处已经写出来并验证过的代码，不是设想。

### 8.1 流程：没有数字不动结构

| 步骤 | 工具 / 代码 | 经验 |
|---|---|---|
| ① 先量触发率 | CPU 全环统计（P1 对 137 区块数全空/全实段） | **结构的收益上限 = 触发率**。段标记在 VoxelCraft 地形上 0 触发，shader 分支却常驻 +0.3–0.5 ms。以后任何新层级（DF、位图）先在 `uploadChunk` 里统计「射线会走到这个分支的比例」，再决定写 shader |
| ② 编译期开关 | `post.defines: { DBG, DBGRAW, SECT }` | A/B 必须用 `#if`，不用 uniform 分支：`DBG=0` 与生产着色器**逐字节相同**，测出来的差值才可信；uniform 分支本身就是被测对象的一部分 |
| ③ 正确性 = 0 px | `--save/--cmp` 读 ddaRT 原始像素 | 加速结构只许改步数不许改画面。0 px 是最强也最便宜的正确性测试，比目测/截图对比可靠得多；每阶段都对 `p0` 比，不对上一阶段比（避免误差累积） |
| ④ 分 pass 计时 | `gpuPass(i)` 三查询一组 + `qPool` 复用 + disjoint 丢弃 | 帧内第一次写默认帧缓冲的查询会吃掉 vsync 等待 → comp 的帧内数字不可信，要单独在两帧间测。**先搞清楚计时器量的是什么，再看数字** |
| ⑤ 热力图原始编码 | `DBGRAW=1`：RG = 16 位计数、B = 阴影迭代 | 热力色给人看，原始计数给脚本算均值；两套输出共用一个 `dbgOut()`，`gl_FragDepth=0` 让合成时盖住一切 |
| ⑥ 结果写回文档 | §6.1–6.3 表格 | 每阶段固定四列：实现要点 / 结果表 / **未达成项及原因** / 对后续阶段的影响。P1 的「未达成」直接改写了 P2 的优先级 |

### 8.2 数据通路：搭便车，不开新纹理

- **新信息优先塞进已有的 fetch**：段掩码没有单开 `uSect`，而是把 `uCol` 从 R16UI 扩成 RGBA16UI（r 列高、g 归属、b 空段、a 实段），换列那一次 `colAt` 顺带拿到，**零额外 fetch**。同理 `uInfo.r` 用位域打包 `kind|opaque<<4|solid<<5|cullSelf<<6`。原则：核显上 fetch 数 > ALU 数 > 纹理字节数。
- **每个纹理的「无效」要有一个在带内的编码**：列高 `r=0` = 整列空、DF `v=0` = 未计算、`owner[s]=null`。卸载区块只写列高 0，不清 24 KB 体素——「清」是 O(体积)，「标无效」是 O(1)。
- **环形槽位 + 带内归属校验**：`uCol.g` 存区块坐标低 8 位，shader 里 `colAt` 自查 `(ch+uOrgLow)%256`，槽位被别的区块复用时自动视为空。所有新结构（DF/位图）**必须和 `uVox` 用同一套 `wrap`/槽位**，并在 `rebuildRing` 里一起重建。
- **增量维护全局量**：`worldMaxY` 只在最高列下降时 O(N²) 重算（`setColumn`）。任何「全局 max/min」都按这个模式写，不要每次编辑都扫。
- **上传暂存区复用**：`stVox/stBrick` 两个固定 16×H×16 的 `Data3DTexture` 做 staging，`copyTextureToTexture3D` 拷进环形大纹理；大纹理 `image.data=null` 只留 GPU 副本。新结构照抄（`stDist`）。

### 8.3 适配层：v2 只认接口，不认宿主

- `ctx.source || voxelCraftSource(ctx)`、`ctx.blockTable || voxelCraftBlocks(ctx)`：**默认适配器放在 v2.js 文件尾部**，宿主零改动即可运行；第二宿主（index.html）只需提供自己的两个对象。
- `getChunk` 允许返回 `sky+blk` 或打包 `light`：**接口宽松、实现只走一条路径**（`uploadChunk` 里一个三元）。不要为了接口纯净强迫宿主多做一次打包拷贝。
- 事件源放在适配器里（`built/disposed`），v2 的 `buildChunk/disposeChunk` 只是转发。中途创建渲染器时适配器接管已 `meshed` 的区块（构造函数里扫一遍 `ctx.chunks`）。
- 键用 `"cx,cz"` 字符串，**不复用宿主的 `ck`**——宿主的键格式是宿主的事。
- shader 常量用模板注入（`#define H ${H}`、`${BT.waterId}u`、`${BT.tileSide[BT.waterId]}.0`）而不是 uniform：编译期折叠；但注入点要少、集中（目前 4 处），`${CH}/${B.*}` 这类宿主符号已全部去掉。

### 8.4 shader：一条 `trace`，分支靠标志

- 主射线和阴影射线共用 `trace(..., bool shadow, ...)`：`shadow` 为常量折叠时几乎零开销，且 cutout/花草/火把/水的命中逻辑只维护一份。代价是寄存器压力（out 参数 8 个）——**加 DF 跳跃时若 occupancy 掉，先考虑把阴影射线拆成精简版，而不是砍功能**。
- 层级切换用 `fine` 标志 + `continue`，不嵌套循环：砖级→体素级（`fine=true; cell=clamp(...)`）、体素级离开砖→砖级（`fine=false`）。三级（段/DF）照此加标志，**不要加内层 for**。
- 掠射角稳定性三件套（已踩过坑，新跳跃代码必须沿用）：
  1. 跨越维度的坐标**直接整数赋值**（`cell.x = st.x>0 ? (ch.x+1)*4 : ch.x*4-1`），不用 `floor(ro+r*(t+ε))` 推——ε 推不过 4 的倍数平面会原地打转到预算耗尽（横线伪影）。
  2. `r` 分量为 0 钳到 `±1e-6`，否则 `0*inf=NaN`（整列穿透天空的细线）。
  3. 负数取模先加正偏移（`+uSX*4`、`+uN*64`、`+4096`），GLSL 负数 `%` 未定义。
- 预算耗尽不返回「未命中」而是 `kind=4` 全雾：**失败模式选择视觉上最不显眼的那个**（远景雾色而不是天空透出）。
- `home` 格排除、`nAlpha≤8`、`prevId` 同种相邻不重复 alpha 测试：这些上限都是防病态输入的护栏，新路径（DF `v==1` 分支）要保留。

### 8.5 面板 DSL：三类状态源，副作用走标签

- 参数分三桶：`P`（持久化 `vc.v2.params`，带 `P_VER`）、`D`（调试状态，**不持久化**：view/raw/冻结时间）、`S`（宿主 `settings`，如 `rd`，改动要回写宿主 UI）。面板行用 getter（`Pr/Dr/S`）指向桶，DSL 不关心来源。
- `apply(key, fx)` 的 `fx` 标签路由副作用：`rt` 重建 RT、`tex` 同步宿主视距滑块、`sh` 阴影、`dbg` 重编译着色器、默认只存盘（300 ms 去抖）。新参数先想清楚归哪个 fx，不要在 `render()` 里 diff。
- `vec2(...)` 把两个标量归一化到 [-1,1] 二维滑块、`R(min,max,step,log)` 描述范围：**一行一个参数对**，面板高度可控。调试下拉用 `options`。
- 面板与 bench 共用一套入口：`VR.setDebug / VR.D.time / VR.D.cloudX / VR.perf.gpuLast` 都是为无头脚本准备的，面板只是它们的 UI。

### 8.6 对 P2+ 的直接要求

1. DF 上线前先在 `uploadChunk` 里统计四机位视线上 `v≥3` 的格子占比（CPU 版 DF 即可），写进 §6.4 再写 shader。
2. `#if DF` 编译期开关 + 面板 `df` 下拉（0 退化 / 1 开），`--cmp p0` 必须 0 px。
3. `uDist` 走 `stDist` staging + 同一套 `wrap`；`clearChunk` 不清它；光照重传不触发 Worker。
4. 新增 DBG 视图 `4 = dist 值`、`5` 增加 DF 跳跃计数（`gLvD`）。
5. 如果 DF 让洞穴/水面机位的 occupancy 下降（gpu 不随步数线性降），回到 8.4 第一条。

## 9. P1 之后的开销预估与优化建议（效果期新增代码，**未进基准**）

§6.3 的数字是 P1 时测的（默认参数：`cloudStyle 0 / waterStyle 0 / leafStyle 0 / shadowSteps 20 / shadowDist 6`）。
之后加进来的效果全部在 `main` 和 `trace` 的分支里，有的是编译期开关（预设里的 bliss/mc 才编进去），有的是**每像素无条件执行**。
下面按代码逐项数 fetch/采样次数得出估算，**先按 §9.3 测过再动**（§8.1）。

### 9.1 每像素成本账（以「fetch 或纹理采样次数」计；`CNT` 只覆盖 texelFetch，`texture()` 类采样目前不计入 DBG 2）

| 项 | 触发条件 | 估算 / 像素 | 备注 |
|---|---|---|---|
| 主射线 `trace` | 全部 | plain 26 迭代 ≈ 30 fetch；water 52 迭代 ≈ 60 fetch（§6.3 实测） | 体素级步数占 ~50%（12.6/26），列跳/砖步便宜 → DF（P2）仍是正解 |
| 命中着色 `smoothLight` | 全部命中像素 | **18 fetch** 固定 + 1 atlas | 两级 fetch（voxAt + infoR）只为取 opaque 位 |
| 阴影射线 | 命中 ∧ ndl>0 ∧ sky≥8 | `shadowDist 6` → ≤ ~10 迭代 ≈ 12 fetch | 已经很便宜；别再碰 |
| **`cloudHit` 风格 0/1** | **每像素无条件**（L1211，含近处地面命中的像素） | 水平射线 ≤ 600/12 = 50 步 × 1 fetch；俯视射线 slab 外早退 | 在 plain 这种平视机位，地面像素也在白付这 20–50 fetch |
| **`cloudVol` 风格 2** | 同上，无条件 | 44 步 × (1–2 次 3D `texture`) + 稠密点 ×3 次朝光采样 ≈ **60–150 次 3D 采样** | 是全部项里最重的单项；三线性 3D 采样比 texelFetch 贵 |
| 水面 风格 0/1 | 水像素 | `shoreDist` **≤24 voxAt** + 2 噪声 + 几个 sin | 岸边判定占大头 |
| 水面 风格 2 | 水像素 | 上项 + `seaH`×3×(4 倍频×2) = **24 次 `nB`** + `reflScene` **64 步 trace**（+`cloudVol(14,1)`）+ **高光阴影 20 步 trace** + 焦散 2 `nB` | 一个水像素 ≈ 3 个 plain 像素；P1 时 water 机位就已是 29 ms |
| 水下（camW） | 全部像素 | `uwShafts` 6×2 `nB`；命中像素再 `uwCaustic` ≤8 voxAt；仰视水面像素 `reflHit` **96 步** 折射重追踪 | 水下仰视 ≈ 2 条主射线 |
| 树叶卡片 `LEAF_CARDS` | 树冠像素 | 每个树叶格 ≤4 平面 × 1 atlas；halo 格 ≤3 邻 × 4 = **12 atlas**；`nAlpha≤8` 格 → 最坏 **~100 次 atlas 采样** | 只在 `leafStyle 1`；canopy 机位需单测 |
| 星星 | 夜间天空像素 | 2 hash + 若干 ALU | 可忽略 |

**预估 top3（默认预设）**：① 主射线体素级步数（P2 DF 的目标）；② 命中着色固定 18 fetch + atlas；③ 无条件 `cloudHit`（平视时地面像素白付 20–50 fetch）。
**预估 top3（bliss 预设）**：① `cloudVol` 每像素 60–150 次 3D 采样；② 水像素三条射线（主 52 + 反射 64 + 高光阴影 20）；③ 同上①主射线。

### 9.2 建议（按「收益 / 改动量」排序；每条都给出该用哪个数字验证）

1. **云的门控**（改动最小，先做）：`cloudHit` 之前先算 slab 入口 `tE`（风格 0/1 两次除法；风格 2 已有 `tE` 公式），
   `if (hit && kind != 4 && tHit < tE && !camW) → 不调云`。相机在云层下方时，所有命中地面/树/水面的像素都省掉云。
   验证：`--views plain,canopy` 的 `gpu dda` 与 DBG 2 平均 fetch；`--cmp` 应 0 px（云在地形之后本来就被盖掉）。
   例外要保留：`kind==4` 上行射线仍要画云（L1433 那条注释的 bug）。
2. **云独立低分辨率 pass**（风格 2 必做）：云只依赖方向 + 深度，不依赖体素；单开 `cloudRT`（¼×¼，RGBA = 颜色 + alpha，第二目标或打包 `tc`），
   `main` 里改为采样 `cloudRT` 并用 `tc` 与 `z` 比较。预估 `cloudVol` 成本 ÷16。再进一步：云每 2–4 帧更新一次 + 按 `uCloud.xy` 偏移重投影（云移动慢）。
   验证：`--set cloudStyle=2` 的 `gpu dda` 前后对比；画面允许云边缘有差异（`--cmp` 对云像素不要求 0）。
3. **`uVox` 升为 RGB8UI，第三通道放逐体素标志**（b = opaque|solid<<1|leaf<<2|fluidLevel<<4…，`uploadChunk` 打包时查 `BT` 一次写入）：
   `cellLO` 1 fetch 代替 2 → `smoothLight` 18→9；`trace` 体素级「是否不透明」判断不再查 `uInfo`（仅命中后取 tile 时查一次）。
   代价：环纹理 +50%（rd 6：19 MB → 28 MB）。与 §8.2「搭便车」一致：扩宽已有纹理，不开新采样器。
   验证：DBG 2 平均 fetch 应下降 ≥ 9 + 体素步数×(非空占比)；`--cmp p0` 0 px。
   **这条也是 §10 流体接口的落点**（流体等级/标志有地方放）。
4. **水面二次射线降档**：`reflScene` 的 64 步 trace 只走到砖级（`fine` 永不开启，命中砖即取砖内任意格着色；远处反射本来就模糊）+ 反射距离按 `tw` 缩放（`tw>32` 时 ≤16 步）；
   高光阴影射线只在 `spec > 0.1`（而非 0.01）时发射。`shoreDist` 的 5×5 换成 `uploadChunk` 时按水面层预算的岸距 nibble（放进上条的第三通道高 4 位）→ 0 fetch。
   验证：`--views water --set waterStyle=2`。
5. **水下光束 / 仰视折射**：`uwShafts` 改为 ¼ 分辨率 pass（同云的思路，可合并进同一个低分辨率 RT 的另一通道）；仰视折射 `reflHit` 96 步 → 砖级 32 步。
   验证：需要新增 `underwater` 机位（bench 的 `VIEWS` 目前没有）。
6. **树叶卡片**：卡片与 halo 各自独立预算（卡片 `nAlpha` 上限 4、halo 邻格 ≤2），`leafCards` 里 4 张卡先做 AABB 粗判再采 atlas。
   验证：`--views canopy --set leafStyle=1`，看 `gpu dda` 与「着色占比」。
7. **测量工具补齐**（做 1–6 前）：`CNT` 覆盖 `texture()` 采样（`nB/matSampleLod/cloudDen` 各加一个 `gTex` 计数器，DBG 6 = 采样热力图）；
   bench 加 `underwater` 机位与 `--set` 的预设快捷（`--preset bliss`）；`DBG 5` 增加「云步数」通道。
8. **不建议**：粗分辨率深度预 pass（8×8 tile 最小 t 起步）——plain 机位列跳+砖步只占 26 中的 4.8，省不出多少；时域/棋盘格上采样——收益 ~2× 但引入历史缓冲与鬼影，留到 DF 之后再评估。

顺序建议：7 → 1 → 3 → P2 DF（§3.4）→ 2 → 4/5/6。1 和 3 对默认预设有效且不改画面；2/4/5/6 只对对应预设/场景有效。

### 9.3 进基准前要补的数字

```
node tools/bench-v2.mjs --save p1fx                                   # 当前默认预设的画面基准（替代 p0：p0 是加效果前的）
node tools/bench-v2.mjs --set cloudStyle=2 --views plain,canopy        # 云风格 2 的增量
node tools/bench-v2.mjs --set waterStyle=2 --views water               # 水风格 2 的增量
node tools/bench-v2.mjs --set leafStyle=1 --views canopy               # 树叶卡片的增量
node tools/bench-v2.mjs --set shadowSteps=0 --views plain              # 阴影射线占比（应 < 10%）
```
把结果写成 §6.4（与 §6.3 同表头），再决定 §9.2 的顺序是否调整。

## 10. 接口预设计：体素 / 流体 / 光照管线（面向 Mesher 副产品与宿主 B）

目标：v2 继续当「完整光影 shader」长，但它对世界的全部认知只经过三个输入面：**`ChunkSource`（体素 + 副产品）、`BlockTable`（方块语义）、`Env`（环境/光照）**。
宿主 A/B 各写一个适配器；`index.html` 的 `Mesher.greedy` 与增量 `Lighting` 是这些接口的天然生产者。
原则沿用 §8.3：v2 只认接口，不认宿主；接口字段全部**可缺省**，缺省时 v2 自己算（现状）。

### 10.1 体素管线：`ChunkSource` v2（在 §2.1/§6.3 基础上扩展）

```ts
interface ChunkSource {
  size: 16; height: number;                       // height = 16 的倍数，≤256（index.html 128）
  getChunk(cx, cz): null | {
    blocks: Uint8Array;                            // (lx*16+lz)*H + y
    light?: Uint8Array;  sky?: Uint8Array; blk?: Uint8Array;   // 二选一；都缺省 = sky15/blk0
    rev?: number;                                  // 单调递增版本号：uploadChunk 用它去重（同 rev 不重传）
    aux?: ChunkAux;                                // Mesher/光照副产品，缺省 v2 在 uploadChunk 里自算
  };
  getBlocks(cx, cz): Uint8Array | undefined;       // leafPost 读邻块；可缺省（退化为 getChunk().blocks）
  forEachChunk(fn(cx, cz)): void;
  onChunkChanged(cb(cx, cz, what: 'blocks' | 'light' | 'gone')): void;   // 新增 what
}
interface ChunkAux {                               // 全部可选；每一项都是 mesher 扫描时「顺手」产出的
  maxY?: number;                                   // 列高 +1（0 = 空）
  sectEmpty?: number; sectFull?: number;           // 16 位段掩码（§3.1）
  brick?: Uint8Array;                              // 4×(H/4)×4 占用（§3.3 布局同 stBrick）
  dist?: Uint8Array;                               // P2 Chebyshev 距离场（§3.4），≤ 真实距离
  faceAO?: Uint8Array;                             // §3.5 逐面 AO 四角（最后做）
  fluid?: Uint8Array;                              // §10.2：逐体素流体等级 nibble（稀疏：只给有流体的区块）
  shoreD?: Uint8Array;                             // 水面层岸距 nibble（§9.2 第 4 条）
}
```
- **`what` 粒度是关键**：`'light'` 只重传 `uVox` 的 G 通道（CPU 侧跳过 `leafPost`/砖/列高/DF 扫描；GPU 侧仍是整块 `copyTextureToTexture3D`，可接受），`'gone'` = `clearChunk`。
  现状 `SRC.onChunkChanged((cx,cz))` 等价于全部 `'blocks'`；VoxelCraft 适配器把 `buildChunk` 映射成 `'blocks'`（它分不出光照变化，先这样）。
- **`aux` 的来源**：`Mesher.greedy` 无论如何要扫全区块，`maxY/sectEmpty/sectFull/brick` 是零成本副产品；`dist` 由 §3.4 的 Worker 产出后挂到同一对象。
  `uploadChunk` 的规则：**有 `aux.x` 就用，没有就算**；`aux` 的每项单独可缺省。这样宿主 B 先接空 `aux` 也能跑，再逐项把 mesher 的产出挂上来。
- **不变量**（写进 verify）：`aux.maxY ≥ 实际最高非空 y+1`、`sectEmpty` 置位段确实全空、`dist ≤ 真实`；违反 = 画面漏空（§7）。
- 宿主 B 适配器草案（对照 `voxelCraftSource` 1728–1744 行）：`live` 表由 `index.html` 的区块 Map 代替；事件源 = mesher 任务完成回调（`'blocks'`）与 `Lighting` 的脏区块回调（`'light'`）；`getBlocks` 直接返回 `chunk.blocks`。
  需要宿主 B 暴露：区块 Map、mesher 完成钩子、光照完成钩子、`CHUNK_H`。预计 ≤ 40 行。

**`BlockTable` v2**：
```ts
interface BlockTable {
  kind: Uint8Array;        // 0 无 / 1 立方 / 2 花草 / 3 火把 / 4 流体；5 halo、6 卡片 由 v2 内部保留，宿主勿用
  opaque, solid, occupied, cullSelf: Uint8Array; tileTop, tileBot, tileSide: Uint8Array;
  waterId: number; leavesId?: number; tallGrassId?: number; tileCard?: number;
  // 预留（§10.2/10.3）：
  fluid?: Uint8Array;      // 1 = 可分级流体（水/岩浆）；kind 4 ∧ fluid 0 = 满格静水（现状）
  emissive?: Uint8Array;   // 自发光 0..15（火把/岩浆/萤石），替代「blk 光照即发光」的近似
  tint?: Uint8Array;       // 生物群系染色组（草/叶）：0 无；v2 用 uInfo 第二行放 RGB
  idReserve?: boolean;     // 默认 true：id 192..255 归 v2（树叶 halo/INNER）；宿主占用时设 false → LEAF_OK 关闭
}
```
`uInfo` 升为 256×2：第 0 行同现状（r 位：0–3 kind、4 opaque、5 solid、6 cullSelf、7 leaf），第 1 行 r = fluid|emissive<<1、gba = tint RGB。着色器里 `texelFetch(uInfo, ivec2(id, 1))` 只在需要时取。

### 10.2 流体管线

现状：流体 = `id == waterId` 的满格体素；水面检测在 `trace` 里（`tw/wn`，上方非水则顶面下沉 1/8）；水下 = 相机格是水；风格差异只在 `main` 的着色分支。
宿主 B 若有流动水位（MC 式 0–7 级）或岩浆，现状表达不了。预设计的分层：

| 层 | 接口 | 生产者 | 消费者 |
|---|---|---|---|
| 数据 | 逐体素 **流体等级 nibble**：放 `uVox` 第三通道高 4 位（§9.2 第 3 条）；0 = 满/源，1–7 = MC 等级，8 = 下落柱；来源 `aux.fluid` 或由 `blocks` + `BT.fluid` 推算 | `uploadChunk` | `trace`、水面着色 |
| 几何 | GLSL `float fluidTop(ivec3 c, uint id, uint lvl, bool above)`：返回格内水面高度（现状 = above ? 1 : 0.875；分级时 = 1 − lvl/9），`trace` 的「入水点 / 出水点」与岸壁水线统一走它 | v2 | `trace` L797/L870/L925、`main` L1287 |
| 判定 | GLSL `bool isFluid(uint id)`（现状 `id == waterId`，升级后查 `uInfo` 第 1 行）；JS 侧 `BT.fluid[id] \|\| id === BT.waterId` | v2 | 全部 `${BT.waterId}u` 字面量（目前 ≈12 处）收口到这两个函数 |
| 着色 | `WATER_STYLE` 分支不变；岩浆 = 另一个 `kind 4` 子类型，按 `emissive` 走自发光路径，不走反射/透射 | v2 | `main` 水面分支 |
| 宿主耦合 | `update()` 里的 `#water` DOM 遮罩隐藏、`U.uFogNear/uFogFar` 改写 → 收口为 **`Env.underwater(flag)`** 回调（§10.3）；`ctx.getBlock` 只用于相机格判定，改为 `SRC.getChunk` 查 | 适配器 | v2 |

分级流体先**不**实现，只把字面量收口 + 第三通道位置预留；等宿主 B 真有分级水位再填 `fluidTop`。

### 10.3 光照管线：`Env` + 光照数据契约

**光照数据**（体素侧）：与现状一致——每体素 sky/blk 两个 nibble 由宿主算，v2 在着色器里做四角平滑 + AO + 太阳项。
宿主 B 的增量 `Lighting` 产出同一形状（`light` 打包或 `sky+blk`），通过 `onChunkChanged('light')` 走快路径。
P2 之后若接 §3.5 `faceAO`，仍由 mesher 产出（它已经为 v1 风格网格算过顶点 AO）。

**`Env`（环境输入）**：现状 `render()` 直接读 `ctx.U.uSunDir`、`ctx.skyMat.uniforms.uTop/uHorizon`、`ctx.cloudMat.uniforms.uTex/uColor/uOffset`、`ctx.clouds.position.y/visible`、`ctx.stars.visible`、`ctx.U.uFogNear/uFogFar/uFogColor`、`document#water`——这些是对宿主 A 的全部隐式耦合（§0.2 L1632–1723）。预设计为一个每帧轮询的对象：
```ts
interface Env {
  sunDir: Vector3; sunVis: Vector3;              // 光照方向（含面板偏移前的原值）/ 可见日月方向
  skyTop: Color; skyHor: Color;                  // 天空球渐变（反射、云的环境光、星空背景）
  fogColor: Color; fogNear: number; fogFar: number;
  cloud?: { tex: Texture; color: Color; offset: Vector2; y: number };   // 2D 云图（风格 0/1）；无则只有风格 2 可用
  time: number;
  underwater?(flag: boolean): void;             // v2 通知宿主：相机在水中（宿主 B 自己决定要不要雾/遮罩）
  hide?(what: 'clouds' | 'stars', flag: boolean): void;   // v2 接管了这些天空元素，请宿主别画
}
createRenderer(ctx)  // ctx.env ?? voxelCraftEnv(ctx)
```
宿主 A 的 `voxelCraftEnv` 就是把上面那堆 `ctx.*` 读取搬进去（≈30 行，放在 v2.js 尾部与另外两个适配器并列）；宿主 B 的 `glsEnv` 从它自己的天空/雾状态构造。
共享 GLSL（`voxLight/matSample/applyFog`）与共享 uniform `U` 的约定不变（§0.1），但 v2 对 `U` 的**写入**只剩 `uFogNear/uFogFar`，并通过 `env.underwater` 改为宿主自己写。

### 10.4 Mesher 侧的对接点（宿主 B）

`Mesher.greedy(chunk)` 一次扫描里顺手产出 `ChunkAux`：
- 扫描逐列时记录 `maxY`、每 16 段的非空/不透明计数（→ `sectEmpty/sectFull`，与 `uploadChunk` L296–309 同一算法，可直接复制）；
- 逐 4³ 砖置位 `brick`（greedy 的 mask 循环已经按层遍历，加一个 `bd[...] = 1`）；
- 需要 DF 时把「边界体素」列表一并给 Worker（§3.4），Worker 回传 `dist` 后再发一次 `onChunkChanged('blocks')`（或新增 `'aux'`，uploadChunk 只重传 `uDist`）。
mesher 若在 Worker 里跑：`aux` 的各 buffer 走 transfer（§7：`blocks` 本身不要 transfer）。

两个宿主共用同一份 `aux` 产出：宿主 B 的光栅化网格与 v2 DDA 并存时（`?r=` 切换），体素/副产品只算一次。

### 10.5 落地顺序

1. 字面量收口（`isFluid/fluidTop`、`Env` 轮询对象 + `voxelCraftEnv`），`--cmp` 0 px；verify 加「v2 不再直接读 `ctx.skyMat/cloudMat/clouds/stars/getBlock`」检查（grep 即可）。
2. `onChunkChanged(what)` + `rev` 去重 + `aux` 可选字段（先只接 `maxY/sectEmpty/sectFull/brick`），VoxelCraft 适配器全传 `'blocks'`。
3. `uVox` RGB8UI 第三通道（§9.2 第 3 条），同时预留流体/岸距位。
4. 宿主 B 适配器三件套（`glsSource/glsBlocks/glsEnv`），`index.html?r=v2` 跑通；bench 加 `--url` 指向 index.html 的机位集。
5. 之后 P2 DF 的 `aux.dist` 直接落在同一条通路上。
