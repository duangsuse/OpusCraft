# 半砖 / 玻璃板·铁栏杆 / 地毯 / 铁轨：状态、放置合并、连接与网格技巧

> 这几类都是"非整块"模型：`opaque: false`，进不了整方块快速路径，走网格器的 `box()` / `quad()` 通用路径。方块值 `type | meta << 12`。下文的 ID 是当前注册顺序（blocks.js:206–224 由 `SHAPED` 表批量生成）。

## 0. 公共机制

| 机制 | 说明 | 位置 |
|---|---|---|
| 非整块的代价 | `opaque = false` ⇒ ① 相邻方块贴着它的面**不剔除**；② 它**不投 AO**；③ 本身 `lightOpacity = 0`，**完全透光** | blocks.js:213–220（`common`） |
| `box(x0,y0,z0,x1,y1,z1, texs, opt)` | 单位 1/16 格。某个面恰好落在方块边界上、且邻格是不透明整块时才剔除；`skipFaces` 位掩码可手动跳过；`uv` 可逐面覆盖；默认 uv 由坐标投影（与原版 element 自动 uv 相同） | mesher.js:206–219 |
| 平滑光照 | `face()` 光照模式 0：贴边界的面采样**邻格**的 4 个角光照 / AO，内部的面（如下半砖顶面 y = 8）采样**本格**同层的邻居，再按顶点实际位置双线性插值。所以下半砖顶面靠墙那侧也会变暗，和原版一致 | mesher.js:119–191 |
| 碰撞 / 选择框 | `collisionBoxes(v, get, x, y, z)` / `selectionBoxes(...)`，相连形状需要 `get` 查邻居 | blocks.js:270–380 |

## 1. 半砖（slab）

| ID | 方块 |
|---|---|
| 183 / 186 / 189 / 192 / 195 / 198 / 201 | oak / spruce / birch / jungle / acacia / dark_oak / cherry_slab |
| 204 / 206 / 208 / 210 / 212 / 214 / 216 | cobblestone / stone_brick / mossy_cobblestone / stone / sandstone / brick / polished_andesite_slab |
| 218 / 220 / 222 / 224 | cut_copper / oxidized_cut_copper / cobbled_deepslate / smooth_stone_slab |

| 项 | 规则 | 位置 |
|---|---|---|
| meta | 0 = 下半，1 = 上半，2 = 双层 | – |
| 放置 | 点底面 → 上半；点顶面 → 下半；点侧面 → 击中点 `fy > 0.5` 则上半，否则下半 | interaction.js:410 |
| **合并成双层** | ① 对着已有同种半砖：下半砖点**顶面**、或上半砖点**底面** → 原地变 meta 2；② 目标放置格里已经是同种、且不是双层的半砖 → 变 meta 2（从侧面补上另一半）。两条都在通用"能否替换"检查之前，所以不会被当成占位而拒绝 | interaction.js:391–399 |
| 贴图 | 用基础方块的贴图；砂岩半砖顶 / 底用 `sandstone_top` / `sandstone_bottom`；平滑石半砖侧面用专门的 `smooth_stone_slab_side`（bt_terrain.js `smoothStoneSlabSide` :55–64，blocktex.js:31） | blocks.js:217、:221 |
| 网格 | 一个盒子：`y ∈ [0, 8]`（下）/ `[8, 16]`（上）/ `[0, 16]`（双层）；solid 层，材质沿用基础方块（铜半砖仍是金属） | mesher.js:449–454 |
| 碰撞 | 下 `[0, 0.5]`，上 `[0.5, 1]`，双层整格；选择框同碰撞 | blocks.js:276 |
| 掉落 | 双层掉 2 个 | items.js:149 |
| 支撑 | 实心的上半 / 双层半砖可以支撑火把、铁轨、门等（`belowSolid` 判定接受 meta ≠ 0 的半砖） | world.js `canSurvive` |

技巧与注意：
- 双层半砖仍是 `opaque: false`：贴着它的邻面全部照画、也不投 AO，看起来比整块略"亮"，还多了无用的面。若要和整块一致，可以在网格器里把 meta 2 的半砖当作 `T_OPAQUE` 查表（需要把不透明判定改成"类型 + meta"）。
- 合成：3 个基础方块 → 6 个半砖（recipes.js）。

## 2. 玻璃板 / 铁栏杆（pane）

| ID | 方块 | 层 / 材质 | 贴图 |
|---|---|---|---|
| 143 | glass_pane | cutout / mat 6 GLASS | 正面 `glass`，顶底和侧边窄条 `glass_pane_top`（bt_built.js `glassPaneTop` :127–131） |
| 180 | iron_bars | cutout / mat 7 METAL | 全部面用 `iron_bars`（bt_built.js `ironBars` :466–474） |

**连接判定** `connects(b, v)`（blocks.js:326–333）：

```
邻居是空气                     → 不连
邻居模型与自己相同              → 连（pane 连 pane：玻璃板与铁栏杆互连；fence 连 fence，木 / 非木那个条件实际是 `|| true`，恒成立）
其余：邻居是不透明整方块        → 连
```

所以玻璃板**不会连到玻璃方块**（玻璃是 cutout、`opaque = false`），也不连栅栏和墙。

**网格**（mesher.js:716–733，`meshConnected` 的 pane 分支）：

| 情况 | 几何 |
|---|---|
| 四面都不连 | 两片满宽的薄板交叉成"十"字（x = 7–9 全长 + z = 7–9 全长） |
| 有连接 | 中心 2×2 柱（x, z ∈ 7–9）＋ 每个连接方向一条 2 px 厚的臂（例如北臂 z ∈ 0–7）；柱子朝已连接方向的侧面跳过（`-1`）以免重叠 |
| uv | 臂的侧面按实际覆盖范围取对应 7 px 宽的贴图条（北臂 `[9, 0, 16, 16]` / `[0, 0, 7, 16]`），拼起来与整片玻璃的边框对齐 |
| 剔除 | 一律 `cull: false`（细板的面不能按邻格剔除） |

碰撞：中心柱 + 已连接方向的臂，半宽 1/16（2 px），高 1（blocks.js:306–323；栅栏和墙同一段代码，栅栏半宽 2/16、高 1.5，墙半宽 4/16）。合成：6 玻璃 → 16 玻璃板，6 铁锭 → 16 铁栏杆。

## 3. 地毯（carpet）

| ID | 方块 | 贴图 |
|---|---|---|
| 226 | white_carpet | `white_wool` |
| 227 | red_carpet | `red_wool` |

| 项 | 规则 | 位置 |
|---|---|---|
| 网格 | solid 层，一个 16×1×16 的盒子；底面贴着下方不透明块时剔除；顶面是内部面，按本格同层邻居取光照和 AO | mesher.js:499–502 |
| 碰撞 / 选择 | 高 1/16 | blocks.js:288 |
| 支撑 | 下方不是空气即可（可以放在栅栏、玻璃上） | world.js:501 |
| 合成 | 2 羊毛 → 3 地毯 | recipes.js |

羊毛贴图来自 bt_built.js `woolField` :135–144、`wool` :145–156、`WOOL_COLORS` :157–160。只注册了白、红两种地毯；其余颜色只要在 blocks.js:223–224 旁边照样 `def` 一行即可。

## 4. 铁轨（rail / powered_rail）

| ID | 方块 | 贴图 |
|---|---|---|
| 172 | rail | `rail`（直）/ `rail_corner`（弯） |
| 173 | powered_rail | `powered_rail` / `powered_rail_on` |

### 4.1 meta（与原版 RailShape 顺序一致）

| meta | 形状 | meta | 形状 |
|---|---|---|---|
| 0 | 南北直 | 5 | 向南上坡 |
| 1 | 东西直 | 6 | 弯：南–东 |
| 2 | 向东上坡 | 7 | 弯：南–西 |
| 3 | 向西上坡 | 8 | 弯：北–西 |
| 4 | 向北上坡 | 9 | 弯：北–东 |

动力铁轨只用 0–5（不能转弯），`meta & 8` = 已充能。

### 4.2 放置与连接（interaction.js:446, 483, 493–523）

1. 放置时先按玩家朝向给初值：面向南北 → 0，东西 → 1（:446）。
2. `finishPlace` 之后调用 `railUpdate(x, y, z, placed = true)`（:483）。
3. `railUpdate` 收集四个水平方向的相邻铁轨：同高度 → 普通连接；**高一格 → 记为上坡连接（`up`）**；低一格 → 普通连接（由那一格的铁轨负责上坡）。
4. 定形：

```
只有南北向邻居（N/S）           → N 上坡 ? 4 : S 上坡 ? 5 : 0
只有东西向邻居（E/W）           → E 上坡 ? 2 : W 上坡 ? 3 : 1
南北两头都有，且东西不全有       → 0          （三通优先保持南北直）
东西两头都有，且南北不全有       → 1
可转弯（普通铁轨）且 ≥2 个邻居   → S+E 6 ／ S+W 7 ／ N+W 8 ／ N+E 9（按此优先级）
一个邻居都没有                   → 保持原 meta
```

5. `placed = true` 时，再对四个方向、上下各一层（3×4 个格）里的铁轨各调用一次 `railUpdate(…, false)`，让旧铁轨转过来接新铁轨；不再递归。
6. 之后任何相邻方块变化都会经 `world.neighborChanged` 安排 1 tick 后的计划 tick（world.js:457），再调用 `game.railUpdate`（world.js:552）重新定形。

与原版的差别：原版会检查邻轨是否还有空余的连接位（已经接满两头的不再接新轨），这里不检查。所以在一条已经成形的直轨旁边放新轨，旧轨可能被"拐"过来。

### 4.3 充能传播（interaction.js:524–538）

`railPowered(x, y, z, depth, seen)`：六邻里有 `power: true` 的方块（redstone_block 60、redstone_torch 170）即充能；否则沿相邻（同层及上下一层）的动力铁轨递归，深度 ≤ 8（原版也是 8 格）。每次 `railUpdate` 都会重算并写 `meta | 8`。

### 4.4 网格（mesher.js:801–826）

| 形状 | 几何 |
|---|---|
| 直轨 0 / 1 | y = 1/16 平面，双面；东西向把 uv 旋转一档 |
| 弯轨 6–9 | 换 `rail_corner`，按 `{6: 0, 7: 1, 8: 2, 9: 3}` 旋转 uv（贴图本身画的是南–东弯） |
| 上坡 2–5 | 高的一侧两个顶点 y + 1，形成斜面；东西向的上坡同样旋转 uv |
| 充能 | 动力铁轨 `meta & 8` 时换 `powered_rail_on` |
| 层 / 材质 | cutout；mat 7 METAL（只是标记，见 `lights.md` §2） |

贴图：bt_built.js `TIE` :409（枕木调色板）、`railBase` :410–419、`rail` :420、`poweredRail` :421、`railCorner` :422–438；注册 blocktex.js:170–173。

碰撞：无（`solid: false`）。选择框高 2/16，上坡 8/16（blocks.js:354）。需要下方是实心整块或实心半砖 / 上半楼梯（world.js:493）。

### 4.5 矿车：⚠ 未实现

`useItemOn` 对着铁轨用矿车时调用 `this.placeMinecart?.(…)`（interaction.js:367），但 `placeMinecart` 没有定义，**生存模式下矿车物品照样被扣掉，却不会生成实体**。船同理：`this.spawnBoat?.(…)`（:381）未定义，也会扣物品。实体模型（`MODELS.minecart` / `MODELS.boat`，src/entity/models.js）和贴图已经就绪，缺的是实体类（沿铁轨的运动、乘坐、`riderPos`、`onRiderRotate`）和这两个钩子；`Player` 已有 `vehicle` / `ridingTick` 接口（entity/player.js）。
