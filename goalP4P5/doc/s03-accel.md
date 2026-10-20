<!-- handover/renderer-refactor/s03-accel.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§3 加速结构设计：段标记 / 位图 / 砖 / 距离场 / faceAO / 整合后的 trace**
> 状态：部分被取代：§3.1 已落地（P1，SECT 默认关）；§3.2 待定；§3.4 存储位置改为 uVox.A（§11.1）；§3.5 的 flags 部分已决定前移
> 何时读：P2 DF 必读 §3.4/§3.6；P5 读 §3.5
> 对应 goal-renderapi.ts：§3.4 ↔ goal-renderapi.ts §4 UVOX.A / §5 Worker / §6.5–6.8

## 3. 加速结构设计

### 3.1 区块段标记 + 列高（扩展现有 `uCol`）

- 新纹理 `uSect`：`R8UI` 3D，尺寸 `N × H/16 × N`；0 = 全空、1 = 混合、2 = 全不透明（`opaque[id]` 对全部 4096 格成立）。
- 生成：VoxelCraft 在 `uploadChunk` 的扫描里顺手统计；index.html 在 `Mesher.greedy` 结束后按「该段 quad 数 == 0 且首格为空/不透明」判断（mesher 已经知道每个面是否暴露）。
- shader：砖级循环前先检查 `uSect`；`0` → 用段 AABB 直接跳到段出口（同列高跳过的写法）；`2` → 以进入面为命中（`hc` = 入口格，`voxAt` 取 id 着色）；`1` → 现有砖级/体素级逻辑。
- 三级循环（段→砖→体素）会增加寄存器压力；**若 3.4 的距离场上线，段级空标记可以取消**（d=16 的跳跃覆盖了它），只留「全实 = 直接命中」。

### 3.2 16³ 占据位图（体素级步进的廉价替身）

> ⚠ **待定**：`goal-renderapi.ts` 未收录 `uBits`（§4 GPU 布局只有 uVox/uInfo/uShape/uCol/uBrick/uBio）。默认**不做**：DF 未就绪（`v==0`）的退化路径 = 现有 `uBrick`。§6 表 P4 行的「位图作为退化路径」与 §7 的 R32UI 风险项随之作废，除非 P2 热力图证明 `v==0` 区域长期存在。

- 布局：`R32UI` 3D，尺寸 `SX/2 × H/4 × SX/4`；texel `(x>>1, y>>2, z>>2)`，bit = `(x&1) | (y&3)<<1 | (z&3)<<3`。每 texel = 2×4×4 格。
- shader 体素级：`cur = texelFetch(uBits, tc)`；步进后若 `tc` 不变则直接查寄存器里的 `cur`，不 fetch。只有 bit=1 才去 `voxAt` 取 id/kind。
- 生成：mesher 扫描时 `bits[(y>>2)*... ] |= 1 << bit`（index.html 在 `fillPadded` 拷贝循环里顺手；VoxelCraft 在 `uploadChunk` 里）。每区块 `H/16 × 512 B`。
- 与 3.4 的关系：有距离场后，d≥2 的格子不需要位图；d∈{0,1} 的「表皮」里位图仍能省 fetch。两者不冲突，但**优先做距离场**；位图作为「距离场未就绪区块」和低端机（不想开 Worker）的退化路径。

### 3.3 4³ 砖（已有，不动）

仅一处改进：`uploadChunk` 的 `setColumn` 每次都 O(N²) 重算 `worldMaxY`，改为只在列高下降时重算（微小，但每次编辑都触发）。

### 3.4 Chebyshev 距离场（重点）

> ⚠ **已决定**（goal-renderapi.ts TODO-2）：DF 的 `occupied` = `kind ≠ 0 ∧ !fluid`，**不含流体**；流体靠 `uVox.A` 的 `FLUID` 位 + 首次入水 `maxD = min(maxD, tw + uWaterVis)` 截断。`uBrick` 砖占用仍按 `kind ≠ 0` 含流体（退化路径必须保守）。下文「含水」读作「不含水」。

**定义与编码**：`d(p)` = 到最近「占据格」（`occupied[id]`，即 `kind != 0`，含水/花草/火把/树叶）的切比雪夫距离，截断 `T=16`。
纹理 `uDist`（**§11.1 修正：不单开纹理，放 `uVox` RGBA8UI 的 A 通道低 5 位**，下文的 `uDist`/`stDist` 读作「A 通道」）：值 `v = d + 1`（1 = 本格被占据，2 = 相邻，…，17 = ≥16），**`v = 0` 保留为「未计算」**。y 越界：`y<0` 视为占据、`y>=H` 视为 d=T。

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

> ⚠ **已决定并前移**：本节「把 opaque/solid/kind 位塞进体素纹理」的替代方案已采纳为 `uVox` RGBA8UI（goal-renderapi.ts §4 `UVOX`：R id、G light、B meta、A = dist 低 5 位 | `OPAQUE<<5 | LEAF<<6 | FLUID<<7`；**solid 不进 A 通道**），与 P2 DF 同一次改动落地（§9.2-3）。P5 只剩 `faceAO` 一项，仍按「着色占比 >20% 才做」决策。

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
