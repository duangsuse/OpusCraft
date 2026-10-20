<!-- handover/renderer-refactor/s11-hostB-bounds.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§11 特性边界对照：宿主 B 真正会喂给 v2 什么（依据 doc/）**
> 状态：有效；§11.1 存储决定是全局真值（含宿主 A）；§11.2 的 texel 分配与 BlockTable JS 形态已被 goal-renderapi.ts 决定覆盖（见文内 ⚠）
> 何时读：§11.1 任何阶段改 uVox/uInfo 前读；§11.2–11.4 只在 P4 读
> 对应 goal-renderapi.ts：§11.1 ↔ ts §4；§11.2 ↔ ts §2 MODEL_TO_KIND/UINFO/USHAPE；§11.4 = P4 细分

## 11. 特性边界对照：宿主 B 真正会喂给 v2 什么（依据 `doc/`）

> 来源：`doc/xyzb/meta.md`（体素/纹理布局，已评审）、`doc/xyzb/all.md`（`BLOCK_DEFS` ≈95 id、`model` 11 种、`MOB_TYPES`）、`doc/xyzb/chunks_dat.md`（存档只存 `b/m/bio`）、`doc/mat/game-spec.md`（模式开关、流体语义、`c_*` 约定）、`doc/mat/world-gen.md`（群系 tint、已确认的 temp/hum 决策）。
> 不读代码，只用这些文档里的**约定**定边界；行号/实现以文档为准。

### 11.1 存储决定对齐 `meta.md`（修正 §3.5 / §9.2-3 / §10.1）

> ⚠ **已决定**（goal-renderapi.ts §4 `UVOX`，以 meta.md 为准）：`uVox.A` 高 3 位 = `OPAQUE<<5 | LEAF<<6 | FLUID<<7`，**不是**下表写的「opaque / solid / leaf」——`solid` 只在 `uInfo` k0 查，`fluid` 位进 A 通道供 `trace` 走 `fluidTop` 且 DF 不计流体（TODO-2）。其余（RGBA8UI、A 低 5 位 DF、`uDist` 不单开、B = meta、`uInfo` 256×64、`uShape` 8×256）与下表一致。

| 项 | 本文档原方案 | `meta.md` 已评审布局 | 采用 |
|---|---|---|---|
| 体素纹理 `uVox` | RG8UI（id, light）→ §9.2-3 建议 RGB8UI 第三通道放 flags；§3.5 设想 A=DF | **RGBA8UI：R id、G light(sky<<4\|blk)、B meta、A dist\|flags** | 采用 `meta.md`。A 通道：低 5 位 = DF 值 `v`（0 未算、1 占据、…、17 = ≥16，§3.4 编码不变），高 3 位 = `opaque / solid / leaf`。**`uDist` 不再单开纹理**（§3.4 的 `stDist` staging 改为写 A 通道；Worker 回传整块 A 通道 Uint8Array，主线程合并进 RGBA staging 后 `copyTextureToTexture3D`）。`cellLO` 1 fetch（§9.2-3 的收益照拿）。宿主 A 无 meta → B 恒 0 |
| 方块语义表 `uInfo` | 256×2 RGBA8UI（§10.1） | **256×64 RGBA8UI：x = id，y = (meta&15)·4 + k**，k 0..3 四个 texel 为一个「状态」 | 采用 `meta.md`。shader **不解释 meta**，只用 `meta & 15` 选行（高 4 位保留，v2 不碰）。宿主 A 的 `BlockTable` 无 variants → 16 行复制同一状态，**着色器只有一条路径**。texel 分配见 11.2 |
| 形状表 `uShape` | 无 | **8×256 RGBA8UI：每 id·状态 ≤4 个 AABB，1/16 单位** | 新增（P4b）。它让 `box/layer/door/ladder/liquid` 都归入一种新 kind（11.2），不必为每个 `model` 写射线求交 |
| 砖 / 列 | `uBrick R8UI`、`uCol RGBA16UI` | 同 | 不变 |
| 索引 | `(lx*16+lz)*H + y`，H 16 倍数 ≤256 | 同；宿主 B H=128 | 不变 |
| 不做 | — | 调色板压缩、折射、多层 alpha | 与 §9.2-8 一致，不做 |

**tile 索引宽度**：宿主 B 是 2D 图集 + 可加载 MC 资源包，tile 数 ≈ 95 id × ≤6 面 + 动画帧，**会超过 255**。`uInfo` 的 tile 字段用两个字节（低/高）或整张表升为 RGBA16UI（128 KB，可忽略）。`meta.md` 写 RGBA8UI 时未考虑资源包，这里按 16 位预留。
> ⚠ TODO-3 已决定：**布局不变、整表升 RGBA16UI**（`UINFO.format`），不用「两个字节拼」的方案；宿主 A 不受影响。

**内存上限（RGBA8UI，H=128，N=2rd+5）**：rd 6 → 37.9 MB，rd 8 → 57.8 MB，rd 10 → 81.9 MB，rd 12 → 110 MB，rd 16 → 179 MB。
宿主 B 的标题预览用 `previewRd 16`（`c_Title`）、游戏内视距可到 16：**v2 在宿主 B 里把 `rd` 钳到 ≤10**（面板 `S.rd` 回写宿主时取 min），标题预览/屏保仍走 gls 网格路径，不接 v2。这是硬约束，不是优化项。

### 11.2 `model` → v2 `kind` 的映射（覆盖 `all.md` 全部 11 种）

`kind` 枚举扩成：0 无 / 1 立方 / 2 交叉面 / 3 火把 / 4 流体 / **7 AABB 盒集合（新）**；5、6 仍为 v2 内部 halo/卡片保留。

| `model` | kind | 几何来源 | 备注 / 已知偏差 |
|---|---|---|---|
| `cube` | 1 | 整格 | 现状；`tex.{all,side,top,bottom,front,px…nz}` 六面 tile 全部进 `uInfo`，`front` 由状态行按 `facing` 展开成 px/nx/pz/nz（JS 侧展开，shader 只认 6 面） |
| `cross` | 2 | 两条对角面 | 现状 `crossHit`；高草摇动已有，花 / 枯灌木 / 树苗同路径 |
| `crop` | 2 | ~~4 片平面 `x,z = 4/16, 12/16`~~ ⚠ TODO-5 已决定：**按 cross 画，不做四片变体**（P4a/b 允许偏差） | ~~`crossHit` 加一个「平行四片」变体（状态 texel 里 1 bit）~~；小麦 8 个生长阶段 = 8 个状态行，各自 tile |
| `torch` | 3 | 现状 | 壁挂火把的 `facing` 来自状态行（倾斜偏移写进 `uShape` 的 1 个 AABB 或直接按 facing 查表） |
| `box` | 7 | `uShape` ≤4 AABB | 半砖 / 台阶 / 箱子 / 仙人掌（内缩 1/16）/ 工作台等；射线对 ≤4 个 AABB 做 slab 求交取最近，法线按命中面；各面 tile 同立方 |
| `layer` | 7 | 1 个 AABB，高度 = (meta+1)·2/16 | 雪层 8 档 = 8 个状态行 |
| `ladder` | 7 | 1 个薄 AABB（厚 1/16，贴 facing 面） | alpha 镂空面 |
| `door` | 7 | 1 个 3/16 厚 AABB，位置由 facing + open 位决定 | 上下半各一 id/状态，各自 tile；镂空 alpha 走现有 cutout 路径 |
| `liquid` | 4 | ~~格内高度来自状态行（`uShape` 的 1 个 AABB 高度）~~ ⚠ TODO-4 已决定：**公式** `fluidTop = above ? 1 : 1 − (meta&15)/9 + uFluidTop0`，`uFluidTop0` 取使 meta 0 → 0.875（= 现状 7/8，0 px 硬要求）；`uShape` 不参与流体 | ~~meta 0 源 → 14/16；1–7 → `round((8−lvl)/9·16)/16`；≥8 下落柱 → 16/16。`fluidTop()`（§10.2）改为查表，不再解释 meta。~~ 下落柱（≥8）仍 → 1.0。岩浆 = `kind 4 + emissive`，不走反射。**偏差**：gls 网格把流动水面做成随邻格插值的斜面，v2 是逐格阶梯；实心水模式（`solidWater` 的 `ghostAlpha 0.4`）v2 不表达 |
| `fire` | 2 | 交叉面 + 贴墙面 | `emissive` 自发光；meta 是年龄，不影响外观 → 16 行同状态 |
| `none` | 0 | 空气 | — |

> ⚠ **以下两段已被 goal-renderapi.ts 覆盖**（与 meta.md 冲突）：
> - texel 分配以 ts `UINFO` 为准：k0 = `{r: kind|opaque<<4|solid<<5|cullSelf<<6|leaf<<7, g: tileTop, b: tileBot, a: tileSide}`（**与现状 uInfo 第 0 行逐位兼容**）；k1 = `{r: shape 行号, g: facing|axis<<2|flip<<4, b: emissive(0–3)|fluid<<4|translucent<<5|occupied<<6|sway<<7, a: tileFront}`；k2 = `{rgb: transmit×255, a: tint 组}`；k3 保留（faceAO）。没有 crop4 位（TODO-5）。
> - `BlockTable` JS 形态以 TODO-7 为准：**不加 `variants`/`shape` 大数组**，在 §10.1 已确认字段之上只加方法 `state?(id, meta): BlockState` 与 `boxes?(id, meta)`；宿主 A 不实现 → `defaultState()` 16 行复制同一状态。形状真值在共享模块 `shapes.js`（ts `USHAPE` 注释）。

~~状态 texel 分配（`uInfo` 一行 4 texel，RGBA16UI）：k0 = `kind | opaque<<4 | solid<<5 | cullSelf<<6 | leaf<<7 | sway<<8 | crop4<<9`，g = `uShape` 行号，b = `emissive(4) | fluid(1) | tintGroup(3)`，a 保留；k1 = tile px/nx/pz/nz；k2 = tile py/ny、alpha 阈值、`cullSelf` 对象 id；k3 保留（§3.5 若做 faceAO 用）。~~
~~`BlockTable` JS 接口：在 §10.1 之上加 `variants: 1 | 16`，所有数组长度 `256 × variants`，索引 `id*variants + (meta & 15)`；新增 `shape: Uint8Array(256×16×16)`（每状态 4 AABB × 6 字节 + 2 填充）。宿主 A 适配器 `variants = 1`，不改现有字段名。~~

### 11.3 v2 不负责、由宿主 B 自己画或明确不支持的（HITL 时按「预期差异」对待）

| 项 | 处理 |
|---|---|
| 生物 / 掉落物 / 箭 / TNT / 粒子 / 雨雪（`MOB_TYPES`、`Entities`、`Weather`） | 宿主 B 照常用 three 画进 `sceneRT`，`comp` 按深度合成（宿主 A 已如此）。前提：**宿主 B 的区块网格要能单独隐藏**（一个 `chunkGroup`），其余场景对象保留 |
| `XRay` 的 ghost / red 通道（`pg/pr`）、`solidWater` 的半透明流入格 | 不支持。`XRay` 开启或 `modeDef.solidWater` 为真时宿主 B **自动切回 gls 网格**（§12.1 的热切换），v2 不加分支 |
| 群系 tint（`tintFor` 按列查群系 RGB，硬缝） | v2 需要逐**方块列**数据：新增 `uBio` 2D 纹理 `SX×SX`，RG8（归一化，LINEAR）= 量化 temp/hum（`world-gen.md` §5.1 已确认决策），配 3 张 64² 色图（草 / 叶 / 水）。宿主 B 过渡期只有 `biomes[256]` 时，适配器把群系 id 映射成该群系的 (temp,hum) 代表点，**v2 与 gls 先同样硬缝**（0 px 可比），等 gls 的 `tintFor` 也改成查同一色图后双方同步变平滑 |
| 资源包动画帧（水 / 岩浆 / 火） | P4 先取第 0 帧；以后 `uInfo` tile 加帧数、uniform 帧偏移 |
| 红石 / 熔炉 / 箱子内容 等 tile 实体 | 外观只是 `box/cube` 的状态行，无渲染器工作 |
| 存档 `ids:[name…]` 重映射（`chunks_dat.md` D2） | 读档时宿主已把 id 重映射成运行期 id，v2 只在 `BlockTable` 变化（加载资源包 / 改方块表）时重建 `uInfo/uShape` 并 `reuploadAll`，不感知存档格式 |
| 存档封面 `Save.capture()` 读 GL 画布 | 必须在 `comp` 之后读；v2 接入时把 capture 挂到主循环末尾而不是 `requestAnimationFrame` 任意位置 |
| 气候 / 群系决定雨雪、`c_Gen` 面板 | 生成侧事项，不在本文 |

### 11.4 P4 细分（替代 §6 表里的一行）

| 子阶段 | 内容 | 验收 |
|---|---|---|
| P4a 几何占位 | `glsSource/glsBlocks/glsEnv` 三件套（§10.5-4）；`variants=16` 但所有非 `cube/cross/torch/liquid` 的 model 先按 kind 1 整格画；tint 用群系代表点；tile 走宿主 B 图集转成的 `DataArrayTexture`（16×16 tile 逐层拷贝，资源包加载后重建；这样 `matSample` GLSL 原样复用，不处理 2D 图集渗色） | `index.html?r=v2` 出图；`rd` 钳 ≤10；`verify` 新增「~~`variants/shape` 长度~~ ⚠ TODO-7：`state(id, meta)` 对 256×16 全部可调用且返回字段齐全、`uInfo` 256×64 / `uShape` 8×256 尺寸一致」 |
| P4b 状态表 + `uShape` | kind 7、crop 四片、liquid 查表高度、door/ladder/layer/box 状态行 | §12.5 验证世界里 11 种 model 全部可见，形状与 gls 网格在**静止、冻结环境**下目测一致；`cube/cross/torch/liquid(meta 0)` 与 P4a 0 px |
| P4c mesher 副产品 + 光照快路径 | `aux.maxY/sectEmpty/sectFull/brick` 来自 `Mesher.greedy`；`onChunkChanged('light')` 来自增量 `Lighting`；`uBio` + 色图 | `Mesher` 额外耗时 ≤5%；火把放置只走 light 路径（CPU 侧无 `leafPost`/砖扫描） |

宿主 B 的 `CHUNK_H=128` 与「高空整段全空 / 地下整段全实」比宿主 A 多，P1 关掉的 `SECT` 在 P4a 时**先统计触发率再决定开不开**（§8.1 ①）。
