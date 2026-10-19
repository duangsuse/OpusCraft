# 体素数据规范 · id + meta（MC 1.12 风格）

> 适用：`v2.js`（DDA 渲染器）、宿主 A `VoxelCraft.html`、宿主 B `index.html + gls.js`。
> 目标：一个体素 = **`id`(8) + `meta`(8) + `light`(8)**，形状 / 贴图 / 语义全部查表；**渲染、碰撞、流体、光照共用同一张 `BlockTable`**。
> 不做区块级调色板压缩，不做折射，不做多层 alpha 混合。
> 主文档 `handover/renderer-refactor.md` 的 P2 以此为准；本文只写「数据长什么样、谁产出、谁消费、不变量是什么」。

## 0. 一页总览

```
CPU（宿主）                        CPU（v2 镜像，每槽位）                 GPU（v2）
blocks[i]  u8 id        ──┐
meta[i]    u8 meta      ──┼─ uploadChunk / 编辑队列 ─▶  mirror[s] RGBA8  ──▶  uVox  RGBA8UI 3D  (R id, G light, B meta, A dist|flags)
sky[i]/blk[i] u4+u4     ──┘                               dist 由 Worker 回填 A      uBrick R8UI 3D     (4³ 砖占用，DF 未就绪时的退化路径)
                                                                                   uCol   RGBA16UI 2D (列高 / 归属 / 段掩码，不变)
BlockTable.state(id, meta) ──────── 建表一次 ──────────────────────────────────▶  uInfo  RGBA8UI 2D  256 × 64  (状态表：id × 变体 × 4 texel)
BlockTable.shape 的 AABB 列表 ────── 建表一次 ─────────────────────────────────▶  uShape RGBA8UI 2D  8 × 256   (形状表：≤4 个 AABB，1/16 单位)
                      └──── 宿主碰撞 sweep 直接用同一组 AABB（不走 GPU）
```

索引约定不变：`i = (lx*16 + lz) * H + y`，`H` 为宿主高度（96 / 128），16 的倍数且 ≤ 256。

## 1. meta 位域（宿主语义，低 4 位兼容 MC 1.12；高 4 位本阶段保留）

`meta` 的解释**由 id 的形状类决定**，宿主在 `BlockTable.state(id, meta)` 里解码；v2 着色器**不直接解释 meta**，只用它选状态表的行（`meta & 15`）。因此宿主可以任意安排低 4 位，下面是推荐布局（和宿主 B 现有 `facing/door/variants` 一致）：

| 形状类 | bit 0 | bit 1 | bit 2 | bit 3 | 说明 |
|---|---|---|---|---|---|
| cube（普通） | – | – | – | – | meta 恒 0 |
| cube + axis（原木 / 石英柱） | axis lo | axis hi | – | – | `axis` 0 = y，1 = x，2 = z；贴图：轴向两端用 top，其余用 side 并转 90° |
| cube + facing（熔炉 / 南瓜） | facing lo | facing hi | – | – | `facing` 0 = +z 南，1 = −x 西，2 = −z 北，3 = +x 东（= 宿主 B `FACING_FACE`） |
| slab（半砖） | top | – | – | – | 0 下半 / 1 上半；双层半砖另立 id（它就是 cube） |
| stairs（台阶） | facing lo | facing hi | flip | – | `flip` 1 = 倒置；内外角由宿主放置/邻居更新时写入 bit 4–5（见 §1.1） |
| torch（火把） | f0 | f1 | f2 | – | 0 地面，1..4 = 贴墙，方向同 `facing+1` |
| ladder | facing lo | facing hi | – | – | 贴哪面墙 |
| door | upper | open | facing lo | facing hi | 与宿主 B `blockBoxes` 现状一致 |
| fluid（水 / 岩浆） | level b0 | level b1 | level b2 | falling | `level` 0 = 源/满，1..7 递减；`falling` 1 = 下落柱（整格） |
| layer（雪层） | h0 | h1 | h2 | – | 高度 `(h+1)/8` |
| crop / 植物阶段 | s0 | s1 | s2 | – | 贴图变体（`variants(meta)`） |
| cross（花草 / 水草 / 火） | – | – | – | – | meta 0；水草 = cross 且 `inFluid`（见 §3 texel 1） |

### 1.1 高 4 位（bit 4–7）

本阶段**保留**，两个预定用途、未落地前都写 0：
- bit 4–5：台阶内外角 `0 直 / 1 内角 / 2 外角`（宿主邻居更新写入，v2 按它选形状行）。
- bit 6–7：宿主自定（如作物含水、方块朝上/朝下的第三轴）。

v2 **不**把自己的派生信息（树叶 INNER / halo）放进 meta：它们继续用 id 192–255（`LEAF_OK` 约束不变），原因是 halo 需要 6 bit 方向掩码，4 bit 放不下，而且派生信息不该回写宿主数组。

## 2. GPU 通道格式

### 2.1 `uVox` · RGBA8UI 3D · `SX × H × SX`（环形，`SX = (2rd+5)·16`）

```
 R  ┌7───────────────0┐  id          方块 id（宿主 blocks；192..255 为 v2 派生 id，仅 LEAF_OK 时出现）
 G  ┌7───4┐┌3───────0┐  sky | blk    光照两个 nibble（宿主 sky/blk；缺省 0xF0）
 B  ┌7───────────────0┐  meta        宿主 meta 原样（宿主 A 恒 0）
 A  ┌7┐┌6┐┌5┐┌4─────0┐
    │f││l││o││ dist  │
    └─┘└─┘└─┘└──────┘
       bit 0–4  dist   切比雪夫距离场 v：0 = 未计算；1 = 本格占据；v≥2 → 最近占据格距离 d = v−1；上限 v = T+1（T = 16，可到 30）
       bit 5    o      opaque（来自状态表，冗余拷贝：smoothLight / 砖内判定省一次 uInfo）
       bit 6    l      leaf  （树叶位，同 uInfo texel0.r bit7 冗余拷贝：阴影档 / LOD 分支不查表）
       bit 7    f      fluid （流体位：DF 的 occupancy **不含**流体；trace 用它走 fluidTop 相交）
```

- **DF 占据定义**：`occupied(id, meta) = kind ≠ 0 ∧ !fluid`。流体不算占据 → 水体内部 d 很大，射线一跳穿过水体（配合 §4.3 入水截断）。
- **不变量**：`dist ≤ 真实距离`（偏小安全、偏大穿帮）；`o/l/f` 三位与 `uInfo` 对应行一致（verify 抽样比对）。
- 编辑时 A 通道的 `dist` 由 CPU 镜像维护（§4），flags 三位由 `state()` 查表写入。
- 退化：`dist == 0` 的格子走 `uBrick` 砖级（现状代码）。`uBrick` 保留不删。

### 2.2 `uInfo` · RGBA8UI 2D · `256 × 64` ——「状态表」（palette）

行号 `row = (meta & 15) * 4 + k`，`k ∈ 0..3`；列 = id。宿主没有 meta 的 id，16 个变体行内容相同（v2 建表时复制）。

```
k = 0  r  ┌7┐┌6┐┌5┐┌4┐┌3───0┐   leaf | cullSelf | solid | opaque | kind
          └─┘└─┘└─┘└─┘└─────┘   kind: 0 无 1 立方 2 cross 3 torch 4 fluid 5 halo(内部) 6 卡片(内部) 7 shape(AABB 列表)
       g  tileTop      b  tileBot      a  tileSide            （图集层号；现状）

k = 1  r  shape        形状表行号（§2.3）；kind ≠ 7 时 0
       g  ┌7───5┐┌4┐┌3─2┐┌1─0┐  – | flip | axis | facing      朝向：着色器把 canonical AABB / UV 按 facing 绕 y 转 90°·facing，flip 翻转 y，axis 决定 top/side 贴图分配
          └─────┘└─┘└───┘└───┘
       b  ┌7┐┌6┐┌5┐┌4┐┌3───0┐  sway | occupied | translucent | fluid | emissive
          └─┘└─┘└─┘└─┘└─────┘   emissive 0..15 自发光（岩浆/萤石/火把；替代「blk 即发光」近似）；translucent 1 = 走透射色累乘（玻璃）
                                 occupied = DF 占据位（= kind≠0 ∧ !fluid，给 Worker/编辑路径用，着色器不读）；sway = 摇动（树叶/高草）
       a  tileFront    第 4 张贴图（facing 类方块的正面；无则 = tileSide）

k = 2  rgb transmit    透射色 ×255（translucent 时命中后 `transmit *= rgb`；普通方块 255,255,255）
       a   tint        生物群系染色组：0 无 1 grass 2 foliage 3 water 4 birch 5 spruce …（宿主 B `tint`；宿主 A 全 0）

k = 3  保留（全 0）     预留：流体参数（粘度/颜色组）、发光色、硬度等渲染无关项不要放进来
```

- 建表入口：`BlockTable.state(id, meta) → { kind, opaque, solid, cullSelf, leaf, sway, occupied, fluid, translucent, emissive, shape, facing, axis, flip, tiles:[top,bot,side,front], transmit:[r,g,b], tint }`。v2 对 `id ∈ 0..255, m ∈ 0..15` 各调一次写入 4 texel；**着色器只认表，不认宿主**。
- 现状兼容：现有 `uInfo 256×1` 就是 `k=0` 行；宿主 A 的 `voxelCraftBlocks` 补一个 `state()` 默认实现（由 `kind/opaque/solid/cullSelf/tile*` 拼出来，形状 0）。
- **共用一张表**：宿主 A/B 的 `BlockTable` 对象就是宿主自己的方块定义的视图，不是复制品；宿主改表 → v2 `rebuildInfo()` 重传 64 KB。

### 2.3 `uShape` · RGBA8UI 2D · `8 × 256` ——「形状表」（AABB 列表，1/16 单位，canonical 朝向）

行 = shape id（0 保留 = 满格），每行 4 个 AABB：

```
texel 2k   : (x0, y0, z0, n)    n = 该形状的 AABB 个数（1..4），只在 k=0 有效
texel 2k+1 : (x1, y1, z1, uvMode)  uvMode 0 = 面贴图按世界投影（台阶/半砖）；1 = 按 AABB 自身展开（火把/门）
```

canonical 朝向约定：`facing 0`（+z 南），`flip 0`（正置）。着色器 `boxesHit(shape, orient, o, r)`：先把射线变换到 canonical 空间（绕 y 转 −facing·90°、flip 则 `y → 1−y`），逐 AABB slab 求交取最近，法线再变换回来。成本 ≈ `crossHit` × n。

预置形状（宿主 B 当前 model 全部覆盖，台阶/半砖/原木是新增）：

| shape | 名称 | AABB（1/16） | 用于 |
|---|---|---|---|
| 0 | cube | 满格 | kind 1 不查此表 |
| 1 | slab | `[0,0,0,16,8,16]` | 半砖（上半 = flip） |
| 2 | stairs | `[0,0,0,16,8,16]` + `[0,8,8,16,16,16]` | 台阶（内外角 → 3/4，bit 4–5 落地时补） |
| 5 | torch_floor | `[7,0,7,9,10,9]` | 火把地面 |
| 6 | torch_wall | `[7,3,13,9,13,16]` | 火把贴墙（facing 转） |
| 7 | door | `[0,0,13,16,16,16]` | 门（open 由 `state()` 折算进 facing） |
| 8 | ladder | `[0,0,15,16,16,16]` | 梯子 |
| 9..16 | layer_1..8 | `[0,0,0,16,2h,16]` | 雪层 |
| 17+ | box_* | 宿主 `def.box` | 宿主 B `model: 'box'` 的各方块，建表时按出现顺序分配 |

**碰撞共用**：`BlockTable.boxes(id, meta, out: Float32Array(24)) → n` 返回**已按 facing/flip 变换到格内坐标**的 AABB；宿主 B 的 `blockBoxes(def, meta)` 改为调它（或它调 `blockBoxes` —— 二选一，但只能有一处真值）。`solid` 决定是否参与碰撞，`boxes` 决定撞哪里；flu​id / cross / crop 返回 0 个盒子。建议把形状表 + `rotateBox(box, facing, flip)` 放进一个 ≤100 行的共享模块 `shapes.js`，宿主 B 与 v2 适配器都 import 它，避免 JS 与 GLSL 两边的旋转约定漂移。

### 2.4 `uCol` RGBA16UI / `uBrick` R8UI

不变（r 列高+1，g 归属，b 空段掩码，a 实段掩码）。砖占用按 `kind ≠ 0`（含流体）算——它是 DF 未就绪时的退化路径，必须保守。

## 3. 着色器侧分派（`trace` 体素级，命中非空格后）

```
a = vox.a
if (a & 0x80)            → fluid：fluidTop(cell, id, meta, aboveIsSameFluid) 求格内水面高度；记录 tw / 出水点（现状 ±1/8 逻辑收口到这个函数）
else kind = info0.r & 15
  1 cube                 → 入射面；opaque ? 命中 : cutout alpha 测试（现状）；translucent 时 transmit *= info2.rgb 并继续
  2 cross / 3 torch      → 现状 crossHit / torchHit（torch 后续可并入 shape 5/6）
  7 shape                → boxesHit(info1.r, info1.g, …)；命中面 uv 按 uvMode；光照用本格 smoothLight（同 cube）
  5 / 6                  → v2 内部（halo / 卡片），不变
```

- `fluidTop(level, falling, above)`：`above` 同流体 → 1.0；`falling` → 1.0；否则 `1 − level/9`（level 0 → 8/9 ≈ 现状的 7/8，可用 `uFluidTop0` 微调回 0.875 保持 0 px）。
- 贴图朝向：`axis` 类在 `faceUV` 里换 top/side 并旋 UV；`facing` 类把 `tileFront` 贴到 `facing` 对应面。
- 自发光：`emissive > 0` 的命中 → `light = max(light, emissive/15)` 且不接收阴影射线（岩浆/火把/萤石）。
- 所有新分派放在 `#if SHAPES` 内；宿主 A 不开 → 着色器逐字节同现状，`--cmp` 必须 0 px。

## 4. 更新通路：谁改数据、v2 怎么知道

### 4.1 `ChunkSource` v3

```ts
interface ChunkSource {
  size: 16; height: number;
  getChunk(cx, cz): null | {
    blocks: Uint8Array; meta?: Uint8Array;                   // meta 缺省 = 全 0
    light?: Uint8Array; sky?: Uint8Array; blk?: Uint8Array;  // 二选一；都缺省 = 0xF0
    rev: number;                                             // 单调递增；v2 同 rev 不重传
    aux?: { maxY?, sectEmpty?, sectFull?, brick?, dist? };   // mesher/Worker 副产品，逐项可缺省，缺省 v2 自算
  };
  getBlocks(cx, cz)?; forEachChunk(fn);
  onChunkChanged(cb: (cx, cz, what: 'blocks' | 'light' | 'gone') => void);
  onBlockChanged?(cb: (x, y, z) => void);                    // 单格编辑/流体 tick；有它才走 §4.2 队列，没有则退化为 'blocks'
}
```

| 事件 | 产生者 | v2 动作 |
|---|---|---|
| `'blocks'` | 区块生成完成、mesher 完成、大范围改动（爆炸/结构生成） | 整块重扫：镜像重建 + `copyTextureToTexture3D` + 砖/列高/段 + 向 Worker 发 `load`（DF 全算）|
| `'light'` | 宿主光照 BFS 收敛（宿主**每帧去抖**，每区块最多一次） | 只更新镜像 G 通道 + 整块重传；**不**碰砖/列高/DF/树叶后处理，不发 Worker |
| `'gone'` | 卸载 | `clearChunk`（列高 0）+ Worker `unload`；镜像槽位释放 |
| `onBlockChanged` | 玩家放置/破坏、流体 tick、作物生长、门开关 | 进 §4.2 队列 |

**宿主侧系统的边界**（v2 不参与，也不替代）：
- **光照传播**：宿主的 BFS（宿主 B 已有增量 `Lighting`；宿主 A 现状全块重算）写 `sky/blk`，完成后发 `'light'`。v2 只做四角平滑 + AO + 太阳项；`emissive` 只是着色加亮，**不是**光源——光源仍由宿主通过 `blk` 传播。
- **流体更新**：宿主 tick 改 `blocks/meta`（level），每格发 `onBlockChanged`；流体不占据 DF，所以这类编辑**不触发 DF 更新**（队列按 `occupied` 前后值判断）。
- **碰撞**：方块碰撞 = `BlockTable.solid` + `BlockTable.boxes`（§2.3），和渲染同源；实体–实体 / 实体–方块候选用宿主自己的 xyz 网格 hash，v2 不感知实体（实体经 `sceneRT` 深度合成）。

### 4.2 编辑队列（连续 Int32Array，每帧 flush 一次）

```
editQ: Int32Array(QMAX)  条目 = slot << 16 | (lx*16 + lz) << 8 | y        （slot < N² ≤ 841 → 10 bit；区块内索引 16 bit）
qLen: number             溢出（qLen == QMAX）→ 该帧降级：涉及的 slot 全部走 'blocks' 整块重传
```

flush（在 `update()` 开头，`updateChunks` 之后）：
1. 按 slot 分组，合并出每槽位一个**脏包围盒**（`lo/hi` 三轴）。
2. 对包围盒内每格：从宿主 `getChunk` 读 `id/meta/light` → `state()` → 写镜像 RGBA（A 的 dist 位**保留**镜像原值，只改 flags 三位）。
3. **DF 放置路径**（某格 `occupied` 由 0 → 1）：对以该格为中心的 `(2T+1)³` 盒子（跨槽位，只处理已加载且归属正确的槽位）做 `dist = min(dist, cheb+1)`，被改动的区域并入对应槽位的脏包围盒。主线程同步完成、不等 Worker；36K 格 ≈ 0.1–0.3 ms。
4. **DF 移除路径**（1 → 0）：该格 `dist` 写 1（仍当占据 → 着色器取 id 发现空 → 步进 1 格，安全）；向 Worker 发 `edit`，回包后覆盖盒子内 dist 并再次标脏。
5. 每槽位一次 `texSubImage3D`（脏包围盒，从镜像切出连续块；用裸 GL + `resetState()`，或包围盒 ≥ 半块时直接整块 `copyTextureToTexture3D`）；同时更新砖 / 列高 / 段掩码（增量：只重算包围盒触及的砖和列）。
6. 把本帧编辑批量发给 Worker（`edit[]` 一条消息），Worker 更新 occupancy 镜像。

Worker 协议、队列优先级（edit > load）、回包归属校验、`unload` 不重算邻居：沿用主文档 §3.4，唯一变化是回包写入**镜像 A 通道低 5 位**再上传，而不是独立 `uDist` 纹理。

### 4.3 流体可见距离截断（与数据格式配套，P2 一起做）

主射线首次入水（`tw` 记录后）：`maxD = min(maxD, tw + uWaterVis)`，`uWaterVis` 由水体清澈度推出（吸收到 <2% 的距离，默认 ≈ 24 格；`camW` 时相机本身在水里，用 `uwFar`）。超出即按「水体全吸收」着色，与现状吸收后的颜色相同 → 对 `--cmp` 允许的差异只在远处水底像素（亮度 <2%）。这是 water 机位 52 步里那 32 步体素级步进的直接解。

## 5. CPU 镜像

```
mirror: Uint8Array(N² · 16·H·16 · 4)      每槽位 RGBA 交错，布局与 stVox 相同（z 主序：(lz*H*16 + lx)*4 + y*16*4）
rd 6 / H 96:  289 槽 × 96 KB ≈ 27 MB；rd 8 / H 128: 441 × 128 KB ≈ 55 MB    （含未占用槽位；可按需分配 ArrayBuffer 到 ≈ 实际加载数）
```
- 镜像是 **GPU 内容的真值**：所有上传都从镜像切出，Worker 回包先合并进镜像再上传；`reuploadAll` = 遍历镜像整块传，不再回宿主重扫。
- `'blocks'` 事件重建该槽位镜像时保留 `dist`（occupancy 没变就不必清；若变了 Worker 会回包覆盖；期间偏大风险由「重建时对 occupied 新增格写 1」规避）。
- verify 新增：随机抽 64 格，`mirror` 与 `getChunk` 的 id/meta/light 一致、flags 与 `uInfo` 一致、`dist ≤ CPU 暴力算的距离`。

## 6. 适配器要改什么

| | 宿主 A `voxelCraftBlocks/Source` | 宿主 B `glsBlocks/glsSource`（新） |
|---|---|---|
| `state(id, meta)` | 由 `RENDER/OPAQUE/SOLID/T_*` 拼，形状 0，忽略 meta；`EMIT` → emissive | 由 `Blocks.byId[id]` + `tilesFor(def, meta)` + `blockBoxes(def, meta)` 拼；`model` → kind/shape；`tint` → 组号；`light` → emissive；`transparent && cube` → translucent |
| `boxes(id, meta)` | `solid ? 满格 : 0` | = `blockBoxes` 真值搬进 `shapes.js`，`Physics.sweep` 改调它 |
| `getChunk().meta` | 不给（缺省 0） | `c.meta` |
| `rev` | `buildChunk` 计数 | mesher 完成计数 |
| 事件 | `buildChunk → 'blocks'`，`disposeChunk → 'gone'`；`setBlock → onBlockChanged` | mesher 完成 → `'blocks'`；`Lighting` 收敛 → `'light'`；`world.chunks.delete → 'gone'`；`Events 'blockChanged' → onBlockChanged` |

## 7. 验收

1. 宿主 A：`SHAPES=0`、meta 全 0、DF 关 → `node tools/bench-v2.mjs --cmp p1fx` 四机位 **0 px**（格式升级不改画面）。
2. 宿主 A + DF 开 → 0 px（DF 只改步数）；放置/破坏下一帧无穿帮（verify 的墙测试）。
3. 宿主 B `index.html?r=v2`：半砖 / 台阶 / 原木 / 火把 / 门 / 梯子 / 雪层 / 水位 各一截图进 `tools/out/shapes/`；玩家站在半砖上高度 = 0.5（碰撞与渲染同源的直接验证）。
4. 编辑队列：连续放置 200 格（脚本）后 `updateChunks + flush` 主线程耗时 ≤ 现状整块重传路径；DF 不变量抽检通过。
