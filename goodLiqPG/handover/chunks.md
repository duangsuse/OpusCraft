# 地形区块 · 生成 API / Worker 调度 / 渐显

> 行号对应提交 `d36037f` 之后的工作区（含 SAB 回退与水面开关两处改动）。常量是当前实现值，不是推荐值；"已知问题"一节列的都是读码确认过的事实，没有修。

## 0. 一页管线

```
World.update(px, pz)                                   world.js:178   每帧调用（Game.frame → world.update）
  ├─ 中心区块变了（或 R 变了）→ 重排 _wanted：半径 genR = R+1 的圆内全部块，按 d² 升序（由内向外）
  ├─ 同时卸载 d > genR+2（= R+3）且 state==2 且不在 meshing 的块
  │       modified → storage.saveChunk ；HAS_SAB → 广播 unregister ；renderer.removeChunk
  ├─ 在途配额 maxInflight = workers × 2；workers = clamp(hardwareConcurrency − 2, 2, 8)   world.js:49, 203
  ├─ ① 优先重建：c.priority && meshedVersion ≠ version && 3×3 都 state==2 → dispatchMesh
  └─ ② 遍历 _wanted：没有 → new Chunk → loadOrGenerate（存档命中则读盘，否则发 'gen'）
                      已就绪 且 d ≤ R+0.5 且 版本落后 且 3×3 就绪 → dispatchMesh
Worker 'gen'    generator.generateChunk(cx, cz, blocks) → 写 biomes → 按列重算 heightmap（内部下标）
                → { outside: Int32Array[x,y,z,v]*, buffer?（无 SAB 时转移回主线程） }
World.onGenerated  world.js:259   outside 按目标块分组：目标已 state==2 → applyFeatureBlocks + version++
                                   否则挂到 pending[目标]；再把挂在本块上的 pending 全部落地 → finishChunk
finishChunk     world.js:301   state=2，version++，已网格化过的 8 邻块 version++（让边界 AO/光照/树叶重建）
Worker 'mesh'   建 48×48×H 区域 → computeLight（天空光 + 方块光）→ 网格化中心块 → { data, layers, light }
World.onMeshed  world.js:333   c.light = 中心块光照（实体取光用）；meshedVersion = msg.version；renderer.uploadChunk
```

关键取舍：

- **网格化前必须 3×3 全部生成**（`neighborsReady`，world.js:227）。所以生成半径比渲染半径大 1：最外一圈只生成不网格化，专门给内圈提供树叶溢出、AO 和光照邻居。
- **光照不落盘、不增量**：每次网格化都在 48×48 区域里从零泛洪一次（light.js）。光最远走 15 格，中心块到区域边至少 16 格，所以对中心块是精确的。代价是改一个方块要重建 3×3 九块的网格；好处是没有跨块光照状态，也不存在光照和方块不同步的问题。
- **版本号代替锁**：`version` 每次编辑或邻块落地就加 1，网格结果带回派发时的 `version`；不一致就在下一帧重派。主线程编辑和 worker 读同一块 SAB 时的竞态，都靠这一点收敛。

## 1. 数据布局（constants.js / world.js:11–32）

| 项 | 值 | 备注 |
|---|---|---|
| 世界高度 | `MIN_Y = -64`，`HEIGHT = 384`，`MAX_Y = 320`（开区间），`SEA_LEVEL = 63` | 与 1.18+ 一致 |
| 区块缓冲 | `CHUNK_BYTES = 16·16·384·2 + 256 + 512` | blocks `Uint16[98304]` ‖ biomes `Uint8[256]` ‖ heightmap `Int16[256]` |
| 方块值 | `type \| meta << 12`（`typeOf` / `metaOf` / `mk`，blocks.js:5–10） | 12 位类型 + 4 位状态 |
| 下标 | `cidx(x, yi, z) = (yi·16 + z)·16 + x`，`yi = y − MIN_Y` | **y 主序**：截取 `[0, rows·256)` 就是从底到某高度的连续前缀，无 SAB 回退靠这一点 |
| heightmap | 内部下标（`yi`），列内最高非空气；`-1` 表示空列 | worker 生成后重算（worker.js:53–59）；生成器自己返回的是世界 y，**引擎不用** |
| Chunk 字段 | `state` 0 新建 / 1 生成或读盘中 / 2 就绪；`version` / `meshedVersion`；`meshing`；`priority`；`modified`；`fromSave`；`light`；`mesh` | `fromSave` 的块不再接收邻块溢出（防止玩家砍掉的树叶被重放） |
| 存储 | `HAS_SAB = typeof SharedArrayBuffer==='function' && crossOriginIsolated`（world.js:9） | 用 `node server.mjs` 启动时会发 COOP/COEP 头，走 SAB；`http-server` / `python -m http.server` 自动回退为普通 ArrayBuffer |

## 2. 生成器 API（src/world/gen/generator.js）

```js
import { Generator, BIOMES, BIOME_COLORS, BIOME_IDS, MIN_Y, HEIGHT, SEA_LEVEL } from './gen/generator.js';
const g = new Generator(seed);                 // seed：number（≤2^53）/ 负数 / BigInt / string
const r = g.generateChunk(cx, cz, blocks);     // blocks: Uint16Array(98304)，调用前须全 0
// r = { outside: Int32Array [wx,wy,wz,value, ...],  biomes: Uint8Array(256) (z*16+x),  heightmap: Int16Array(256) 世界 y }
g.biomeAt(wx, wy, wz);                         // 与 r.biomes 逐列一致（生成 agent 实测 0 处不一致）
g.temperatureAt(biomeId, wx, y, wz);           // 带海拔递减，决定冻结 / 雪
g.findSpawn();                                 // [x, y, z]：脚底坐标，干燥陆地，原点附近
```

| 契约 | 内容 |
|---|---|
| 确定性 | 每块的随机流只由 `seed + cx + cz + 盐` 派生；生成顺序不影响结果（`tools/preview_world.mjs` 的 seam 检查：正序 / 逆序 0 差异） |
| 跨块 | 矿、洞、雕刻器、团块在**每个块里各自按邻块重算**，只放落在本块的部分；`outside` 只装树叶、枝干、藤蔓、叶顶积雪，离块边 ≤ 8 格 |
| 合并规则 | `applyFeatureBlocks`（world.js:287）只写入**空气或"可替换且非流体"**的格子：溢出的树叶不会覆盖地形、水或别的树干 |
| 性能 | Node 单线程平均 2.7 ms / 块（p95 3.3，max 7.2，丛林 / 山区 4–6 ms）；浏览器 6 个 worker 并发、含争用时 F3 显示 gen ≈ 9 ms、mesh ≈ 13 ms |
| 生成管线 | `fill`（3D 密度 4×8×4 插值 + 噪声洞穴）→ `surface.column`（地表规则，陡坡判定 `Δtop ≥ 4`）→ `carvers.carve`（峡谷 + 蠕虫洞）→ `ores.place` → `recomputeHeights` → `decorator.decorate`（树 / 植被 / 水生，见 `vegetation.md`）→ `freeze`（顶层结冰、积雪）（generator.js:133–153） |

## 3. Worker 协议（worker.js:31–90）

| 消息 | 方向 | 字段 | 说明 |
|---|---|---|---|
| `init` | → | `texLayers, biomeColors, seed` | 初始化网格器（纹理层号、群系三色表），动态 `import('./gen/generator.js')`，失败退到 `stubgen.js` |
| `ready` | ← | – | 所有 worker 回 `ready` 后 `world.ready()` 才 resolve |
| `register` / `unregister` | → | `key, sab` | **仅 SAB 模式**：每个新块广播给全部 worker，网格化时直接读邻块 |
| `gen` | ↔ | `cx, cz, sab?` → `outside, buffer?, ms` | 无 SAB：worker 自己 `new ArrayBuffer(CHUNK_BYTES)`，生成完随结果**转移**回主线程，主线程 `c.adopt(buffer)` |
| `mesh` | ↔ | `cx, cz, version, chunks?` → `data, layers, light, ms` | 无 SAB：主线程随消息发 3×3 邻块副本，每块只发 `rows = min(384, top+4)` 行前缀（world.js:316–330），网格器读越界部分得到 `undefined → 0` 即空气 |
| `biomeAt` / `spawn` | ↔ | `x,y,z` / – | 通用 `request()`（Promise + id），取出生点 / 群系 |

派发：`pickWorker()` 选 `busy` 最小的 worker；`busy` 在 postMessage 时 +1，回包时 −1。

## 4. 网格输出与绘制

顶点 24 字节（mesher.js:44）：

| 偏移 | 类型 | 含义 |
|---|---|---|
| 0 | `i16 ×3` | 位置，单位 1/16 格；x、z 相对块原点，y 为内部高度 ×16 |
| 6 | `i16` | 纹理数组层号 |
| 8 | `u16 ×2` | uv，单位 1/4096（允许 >1，REPEAT 寻址；流水 uv 靠这个） |
| 12 | `i8 ×3` + `u8` | 法线 ×127；材质 id（`MAT`，见 `vegetation.md` §0） |
| 16 | `u8 ×4` | 天空光 ×17、方块光 ×17、AO ×255、flags（1 = 草侧 overlay，2 = 无 AO，4 = 背面副本） |
| 20 | `u8 ×4` | tint RGB（群系色，5×5 均值），sway 权重（晃动，0–255） |

- 三层输出：`layers[0]` solid、`[1]` cutout、`[2]` translucent。每层 `{ start, count, sec[25] }`，`sec` 是 24 个 16 格高分段的顶点起点（mesher.js:389–402 记录，:412 打包）。
- 绘制：所有区块共用一个四边形索引缓冲（`0,1,2, 2,3,0` 重复，renderer.js `ensureIndices`）。`collect`（renderer.js:157）先做整列视锥剔除，再逐段剔除，**把相邻可见段合并成一次 draw**；不透明层由近到远排序（早 Z），半透明层由远到近。
- 每次 draw 只改一个 uniform `u_chunkOff = 块原点 − 相机位置`：相机相对坐标，远离原点也没有浮点抖动。

## 5. 编辑与重建（world.js:131–176）

`setBlock(x, y, z, v, flags = 3)`：flags 1 = 通知邻居（流体、重力、支撑、铁轨的计划 tick），2 = 重建网格。

- `markDirtyAround`：3×3 九块 `version++`；中心块标 `priority`。邻块只有在编辑格**贴着它的边界**时才标 `priority`，其余邻块正常排队（光照最多跨 15 格，但贴边的 AO 和面剔除必须立刻更新）。
- heightmap 同步维护：放块时抬高，挖掉最高块时向下扫到下一个非空气。
- 流体 tick（水 5、岩浆 30）、掉落方块、支撑检查都由 `scheduled` Map 驱动，每 tick 最多处理约 2000 个（world.js:520–534）。

## 6. 渐显（fade-in）

**现状：没有逐块的透明度渐显。** `uploadChunk` 在第一次创建 VAO 时记录了 `m.born = performance.now()`（renderer.js:96），但没有任何地方读取它。实际起到"渐显"作用的是下面几层：

| 机制 | 位置 | 参数 | 效果 |
|---|---|---|---|
| 由内向外加载 | world.js:186–192 | `_wanted` 按 d² 排序，配额 `workers×2` | 新块总在已有地形外圈出现，视觉上是一圈圈向外长 |
| 原版线性雾 | environment.js:182；terrain.js:28, 50 | `fogStart = 16R − clamp(16R/10, 4, 64)`，`fogEnd = 16R`；距离取圆柱距离 `max(|xz|, |y|)`；`smoothstep(start, end, d)` | 边缘块融进雾色（与 1.18+ `FogShape.CYLINDER` 一致） |
| 光影边界雾 | post.js:312–319（composite） | `smoothstep(0.78·16R, 0.98·16R, |xz|)`，混向 `skyCol·cloud.T + cloud.S` | 混向的是"天空 + 云"而不是单色，所以远处地形消失处还能看到云层延续 |
| 空气透视 | post.js:313–316；pipeline.js:345 | `dens = u_aerial · exp(−max(h−63, 0)/120)`，`u_aerial = 0.0011 + fog·0.004 + rain·0.003`，`1 − exp(−d·dens)` | 远景越远越接近天空色，能掩盖加载边缘 |
| 出生等待 | game.js:73–90 | 半径 `min(4, R)` 内全部网格化后才进入世界，超时 30 s | 进入时近处不会有洞 |

**建议的逐块渐显做法（未实现）**：

```glsl
// G-buffer / 原版地形 FS 内（drawList 已经逐 draw 设 u_chunkOff，同处多设一个 u_age 即可）
uniform float u_age;                                  // (now - m.born) / 400ms，>=1 时等于没有渐显
if (u_age < 1.0 && ign(gl_FragCoord.xy + u_frame * 5.588) > u_age) discard;
```

- 用**抖动丢弃**而不是 alpha 混合：延迟管线、阴影图、TAA 都不用改；TAA 会把抖动积分成平滑的淡入。
- `m` 只在第一次上传时创建，之后重建复用同一个对象，`born` 不变，所以**编辑触发的重建不会再闪一次**——这正是想要的。
- 阴影 pass 要么不渐显，要么用同一个 `u_age`。只在主视图渐显会出现"块还没显出来，影子已经落地"。
- 备选：顶点下沉 `rel.y -= (1 − u_age)² · 8`（地形从下方升起），比较有游戏感，但和阴影图不一致更明显。

## 7. 已知问题（读码确认，未修）

- `update(px, pz, frameBudgetMs = 4)` 的 `frameBudgetMs` 没被使用，每帧最多派发 `maxInflight` 个任务，不按时间预算。
- 无 SAB 回退下，每个 mesh 任务最多复制 9 × rows × 512 B（平原约 1.4 MB），CPU 开销比 SAB 模式高。
- 玩家放置的树叶 meta 也是 0（非持久），远离原木会被随机 tick 当成自然树叶腐烂。
- 卸载只看 `state==2 && !meshing`；正在生成（state 1）的块离开范围时不会取消，生成结果回来后照常落地，下一帧再被卸载。

## 8. 可调旋钮

| 位置 | 字段 | 现值 |
|---|---|---|
| world.js:49 | worker 数 | `clamp(hc − 2, 2, 8)` |
| world.js:181, 194 | 生成 / 卸载半径 | `R+1` / `R+3` |
| world.js:203 | 在途上限 | `workers × 2` |
| game.js:75 | 出生等待半径 | `min(4, R)` |
| light.js:5 | 光照区域宽 | `RW = 48`（3×3 块） |
| post.js:318 | 边界雾 | `0.78 → 0.98` × 渲染距离 |
| pipeline.js:345 | 空气透视 | `0.0011 + fog·0.004 + rain·0.003` |
