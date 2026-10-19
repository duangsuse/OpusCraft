# VoxelCraft 渲染器交接 · v2 DDA 性能阶段

> 上一版（接口约定、old.htm 移植拆解、M0–M2 实施记录、面板 DSL 规范）已完成，全文见 git 历史：
> `git show 801c7e4:handover/renderer-refactor.md`。本版只保留**仍要用到的约定**，其余篇幅全部给性能。

## 0. 现状

| 文件 | 状态 |
|---|---|
| `VoxelCraft.html` | 宿主 A：世界/光照/实体/UI；`RCTX` 传给渲染器；`?r=v1`（默认）/ `?r=v2`；`RCTX.settings = settings`（L2346） |
| `v1.js` | 光栅化基线（逐面网格 + 顶点 AO + 四角平滑光照），完成，**画面基准** |
| `v2.js`（936 行） | DDA 渲染器，M0–M2 + **P0（测量）+ P1（`ChunkSource`/`BlockTable`/段标记）** 完成（§6.1–6.3）。功能齐全，`--cmp p0` 0 px。**问题只剩帧率**；下一步 P2 距离场（§3.4），经验见 §8 |
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

| 行 | 内容 |
|---|---|
| 1–60 | 面板 DSL（`R/V2/vec2/toN/fromN/buildPane`）、`P_DEFAULTS`、localStorage `vc.v2.params` |
| 62–98 | `createRenderer` 入口、`PANEL` 声明 |
| 99–162 | **数据通路**：`rebuildRing`（N=2rd+5 环形槽位）、`uploadChunk`（CPU 打包 RG8UI 体素 + R8UI 4³ 砖 + 列高 `uCol`）、`clearChunk`、`reuploadAll`。上传走 `renderer.copyTextureToTexture3D`（r160 对 RG8UI/R8UI 已验证可用） |
| 165–204 | `apply(key,fx)`、Tweakpane 加载、F4 开关 |
| 206–553 | `DDA_FS`：`cloudHit`（体积云 2D DDA）、`voxAt/brickAt/colMaxAt`、`smoothLight`（9 邻域四角平滑光 + AO）、`crossHit/torchHit`、**`trace`（L356，两级 DDA：4³ 砖 → 体素，含列高跳过、天空早退、cutout/水/预算耗尽 kind=4）**、`main`（L447：场景深度裁剪、着色、阴影射线、水面、雾、云） |
| 555–588 | 水面噪声法线贴图 |
| 589–650 | uniforms、`post`（写 `gl_FragDepth`）、`comp`（低分辨率合成）、`ensureRT`（`scale` + `maxMP` 上限） |
| 652–673 | `EXT_disjoint_timer_query_webgl2`（目前只有**一个**查询包住整帧） |
| 675–715 | `render()`：sceneRT → ddaRT → comp；局部坐标（玩家区块原点）|
| 717–735 | 导出：`P/ring/post/comp/reuploadAll/togglePanel/stats` |

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
