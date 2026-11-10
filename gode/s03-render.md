# s03 · 渲染器：rgl / lite / map

> 上游：`goal-renderapi.ts`（宿主契约 ChunkSource / BlockTable / Env / TextureSource）、`goal-remix/render.md`（rgl 管线）、`rgl/index.js:48 createRenderer`。
> 视觉目标图在 `reference-vision/`：`minimap.png`（地图）、`mobs1/2.png`（生物）、`tree-and-shadow.png`、`clouds1/2.png`、`cloud-match-sunDir.png`、`bliss-caustics.png`、`bliss-reflect.png`、`ice-alike-coloredglass.png`、`advanced-texturepack.png`。

## 0. 已定 [11-08]

| # | 决定 |
|---|---|
| R-1 | M1 宿主是新写的 `gode/index.html`；宿主 B（`index.html` + `gls.js`）留作回归基准，玩法表逐步搬过来 |
| R-2 | 三个渲染器：`?r=gl`（rgl，基准）、`?r=lite`（goodGL `renderVanilla`，无光影）、map（无头 / 地图，不占 `?r=`） |
| R-3 | lite 与 rgl 共用同一份网格输出、同一张贴图数组，只换 pass，**可以运行时热切换** |
| R-4 | map 由 slicer 的 `map` 动词出图块，main 拼到 2D canvas；画风照 `reference-vision/minimap.png`；API `gm.actOnMap.add(cx, cz, {zoom, mode, size})` + `gm.marks.live(layer, fn)` + marker 事件（§3.4） |
| R-5 | goodPG 生物走 **goodGL 原生 pass**（骨骼 shader 移植进 rgl pass kit），不走 three 盒子网格 + entComp |
| R-6 | 水面反射先用 SSR + 回落（天空 + 云）；体素 DDA 反射留作可选（§7） |

## 1. 渲染器模块（gode 版）[定 11-08：同 s02，`onkwarg` 设全局变量，不再 `createRenderer(ctx)` 返回对象]

```js
// defl/r/gl.js —— ?r= 的 URL（短名 gl / lite → $baseUrl/defl/r/<名>.js）。渲染器留在 main（共享 GL 上下文），以 ESM 动态 import
export const meta = { id: 'gl', needs: ['float-color'] };           // 不满足时宿主回落到 lite
let gl, canvas, pool, SRC, BT, ENV, TEX, ENTS, P;                   // 模块级全局

export function onkwarg({ seed, mode, kw, host }) {                // 初始化：直接设全局；再次收到 = 热重置（换资源包 / 换 scale 等重建）
  ({ gl, canvas, pool, source: SRC, blockTable: BT, env: ENV, textures: TEX, entities: ENTS } = host);
  P = gg.vars(kw.r);                                                // 本渲染器的面板参数（s09）
  return { meta };
}
export function update(dt) {}  export function render() {}  export function resize(w, h) {}
export function stats() {}     export function set(kv) {}  export function dispose() {}
```

- 与 s02 同一套约定：**`onkwarg` 永远用来设全局变量**，导出函数名就是动词名，宿主按名字调用。worker 里的模块经消息调用，main 上的模块（渲染器）直接调用，写法一样。
- `host` 是宿主交给渲染器的对象：`gl canvas`（宿主建好的 WebGL2 上下文；three 只画 HUD，或完全不用）、`pool`（slicer 池，渲染器发 `{mesh}` 拿网格，不自带 worker）、`source blockTable env textures`（goal-renderapi.ts 的四个适配器，§2）、`entities`（§4）。它是非序列化对象，所以只有 main 上的模块会收到，worker 收到的 `onkwarg` 里没有它。
- `buildChunk / disposeChunk` 退役：渲染器自己订阅 `source`。
- 热切换 gl ↔ lite：先调旧模块 `dispose()`，再 import 新模块发 `onkwarg`。每个模块各有自己的全局变量，互不干扰。
- 「createRenderer 进 Worker」在 gode 的含义 [定 11-08，按拓扑]：渲染器本身留在 main，**网格工作全部通过 `pool` 发到 slicer**。
- `vendor/gl/pool.js` 的 `mesh` 实现搬进 slicer（s01 §3）。main 用规范布局（YZX）直接拼 18³ padded，rgl 现有的 `xlate.padded` 里 XZY 的转置不再需要。

## 2. gode 适配器

| 适配器 | gode 实现 | 相对宿主 B（`rgl/host-b.js`）的变化 |
|---|---|---|
| `source` | `getChunk(cx,cz) → { blocks: Uint16(YZX), light, biomes, temp?, hum?, rev }`，事件 `'blocks' / 'light' / 'gone'`，`onBlockChanged(x,y,z,{id,meta,oldId,oldMeta})` | id + meta 合成一个 u16；索引 YZX；`H = 256` |
| `blockTable` | 由 s04 的方块表生成：gode id 按**名字**查 rgl 的 glid（启动和 BIME.tsv 新增条目时重建 LUT） | 不再需要 `SUBST`，缺名的块用「未知方块」贴图 |
| `env` | 时间 / 天气 / 水下来自 s07 的世界状态 | 同 `goal-renderapi.ts` §Env |
| `textures` | labPBR 资源包 + procgen 兜底（[承] D-9） | 不变 |

## 3. map：小地图 / 俯视 / 截图

### 3.1 slicer 动词

```js
{ map: { cx, cz, y0, y1, mode }, id }   // y1 = 切片顶；mode: 'top' | 'slice' | 'biome' | 'height'
→ { map: { cx, cz, rgba: Uint8Array(16*16*4), y0, y1 }, id }
```

- 区块数据在 main：请求时把该列（YZX 的 `[y0..y1]` 段，和北侧一行邻居的高度，用来做明暗）transfer 过去。这与 mesh 请求同一条路径。
- Node 下的 genview 直接 import 同一个 `map.js`，不经 Worker。

### 3.2 画风（照 `minimap.png`）

| 元素 | 规则 |
|---|---|
| 方块色 | 每个方块一个 `mapColor`（s04 方块表字段），草 / 叶乘群系 tint |
| 明暗 | MC 地图式：与北侧格比高度，高 → 亮、低 → 暗、相等 → 原色，所以等高线会呈现浅色描边；水按深度分三档、不画明暗 |
| 树冠 | 树叶格额外加 2×2 抖动的亮点，呈现 `minimap.png` 那种"颗粒状"树冠 |
| 边框 | 羊皮纸 9-slice 边框 + 内阴影（CSS，不进 canvas） |
| 玩家 | 白色三角形，随 yaw 旋转；中心十字线 |
| 手持 | 地图物品拿在手里时，第一人称手上画缩略版（rgl 手部 pass 贴 2D canvas 纹理） |

### 3.3 Y 切片动画（M 键，IDEA「自带 Y-slice 动画循环播放」）

- `mode: 'slice'`：从 `y1 = 地表` 逐层下扫到 `y0`，每层只画 `y ≤ y1` 的最高非空气格。main 按帧请求（预取 ±4 层），循环播放；滚轮暂停并手动拨层。
- 多级缩放：1 / 2 / 4 / 8 格一像素，缩小时 slicer 先按块降采样再返回。

### 3.4 `gm.actOnMap` 与世界标记表 `gm.marks` [定 11-10：原 `gm.addMiniMap`；标记表世界里**一份**，各视图只管层开关]

```js
// 世界标记表（world 持有，存档）：所有视图画同一份
gm.marks.list()                    // 读：当前标记列表
gm.marks.list([[[x, z], '🏠'], ['@12,-40', '⛏'], ['@home', '🛏']])   // 写：整表替换
gm.marks.list(old => [...old, ['@p1', '📍']])                       // 写：函数式更新
gm.marks.add('@12,-40', '⛏', { layer: 'ore' })  gm.marks.remove('@12,-40')   // 单点增删；opts = { r, label, color, layer }
gm.marks.live('mobs', () => gm.ents.near(64).map(m => [m.P, '🐷']))   // 动态标记，每次重绘求值；不存档；返回取消函数，模组停用时自动撤销

// 地图侧（规格在 flow/render.ts MapAct）：只管自己的层开关、换算、点选
gm.actOnMap                        // 默认 = M 键主小地图（id ''）；gm.actOnMap.of(id) 取别的，list() 列出
const mm = gm.actOnMap.add(cx, cz, { zoom, mode, size })   // cx, cz = 区块坐标（地图中心）；返回 MapAct，mm.id / mm.el
mm.layer('ore', false)  mm.layers()                         // 这张地图关掉 'ore' 层 / 读各层可见性（没出现的层 = 开）
mm.scr2xz(sx, sy)  mm.xz2scr(x, z)                          // 屏幕 ↔ 世界 xz；在地图外返回 null
mm.tap(sx, sy)  mm.center(cx, cz)  mm.zoom(4)  mm.mode('slice')  gm.actOnMap.remove(mm.id)
gm.on({
  marker(e) {},                    // e = { map, i, at, emoji, layer, how: 'tap' | 'hover' | 'leave' | 'near', p1 }；按 e.emoji / e.layer 过滤（原 'marker_🏠' 写法取消）
  map_tap(e) {},                   // 点了地图空白处，e.P = '@x,z^y' 世界坐标
})
```

- 主视图（第一人称画面）同理：`gm.marks.view.layer(name, on?)` 管主视图叠层的层开关，hud 叠层用 `gm.act.xyz2scr` 画同一份 `gm.marks`。
- `gm.pts` 的地名自动出现在内置层 `'pts'`，不用手写。
- `marks.list` 与 s09 的 Ref 同形：**一个函数既读又写**（`list()` 读，`list(v)` 写），因此它也能直接挂进面板、被 `&json=` 写、被 `{set}` 消息写。
- 每个标记是 `[坐标, emoji, opts?]`：坐标是世界格 `[x, z]` 或口诀字符串 `'@x,z' / '@地名' / '@p1'`；`opts = { r, label, color, layer }`（r = 玩家走近几格发 `near`）。
- 事件是 Ev 里的 `marker` / `map_tap`（载荷带 `p1.who`），模组 worker 按 s07 §2 订阅，所以 iframe 和模组都能接到标记点击。
- 一个页面可以有多个小地图（例如 clawd 的查看器、钻石箱里的检查点，s08），共用同一份图块缓存（键 `cx,cz,mode,y1,zoom`，区块 `rev` 变化时失效）。
- 地图物品 [定 11-08]：物品只存 `{cx, cz, zoom, mode}`，拿在手里时实时取图块；存档时另存一张 webp 缩略图进 `pic/`（标题屏和分享用）。没加载过的区块画成空白羊皮纸，依据是区块加载记录（s06）。

## 4. 实体：原生 goodGL pass [定 11-08]

- **数据**：goodPG `src/shared/mobs.ts` 的 `ModelPart`（name、parent、pivot、from、size、uv、rot、grow，像素单位，面向 −Z）和 `MobDef` 原样复制成纯数据模块；程序贴图 `client/textures/mobTextures.ts` 搬进 slicer（`{mobtex:{id, variant}}` 动词，返回 RGBA 图集），alpha 128–250 表示自发光，这一约定保留。
- **网格**：每种生物一份静态盒子网格（每个 part 一根骨骼），启动时由 slicer 生成，transfer 回 main 上传一次。
- **pass**：goodPG `client/render/shaders/mob.ts` 的骨骼 shader（`MAX_BONES = 24`）移植进 rgl pass kit，写成 `fancy` 的一个变体：同样输出 MRT（sceneC + gbuf），因此能吃到 PCSS 阴影、SSR、TAA、bloom。阴影图里也画一遍（花草锐图那一张，±64）。
- **姿态**：goodPG 各族姿态函数（`monsterAnim / faunaPose / …`）大多是纯函数（part → 旋转），搬进 main，每帧算骨骼矩阵 → uniform 数组。实例多时改成纹理（每实例一行）。
- `ctx.entities = { list(): [{ mdl, x, y, z, yaw, pose: Float32Array, light, hurt }] }`：渲染器每帧拉一次，与 IDEA 的 `mat.tsv`（id、P、turn、#mdlID）字段对应（s05）。
- rgl 现有的 `entity.js`（`createEntityLight / createBlobShadows / entComp`）在 gode 里只保留给掉落物 / 方块实体等 three 过渡物体，逐步也换成原生 pass。

## 5. 视距与内存

- [承] 宿主 B 上 rd 封顶 10（s11）；gode 的 u16 区块是 128 KiB / 列，rd 12 时约 625 列 ≈ 80 MiB 权威数据 + 光照 40 MiB。M1 先按 rd 10，实测后再调。

## 6. 方块状态进网格

朝向、半砖等状态不在 u16 里，而是由 `xyzb.tsv` 的 `linkBlk` 等字段决定（s04 §3）。mesh 请求除 padded 体素外，还要带上 18³ 范围内**有状态格**的稀疏表 `states: [[idx, stateId], …]`；`stateId` 指向 main 维护的状态调色板（同一状态组合只存一份），slicer 按它选模型和旋转。

## 7. 参考图达成度 [11-08 核对]

`reference-vision/` 每张图都能在仓库里找到出处。按「当前方案能否直接达到」分三档：

| 图 | 出处 | rgl 现状 | 达成方式 | 难度 |
|---|---|---|---|---|
| `tree-and-shadow` | 樱花 / 白桦树形 `vendor/gl/shared.js:179,548`；PCSS `rgl/long/fancy.js:82`，花草锐图 :331 | 已有 | 生成器换 gp 即可（s02） | 易 |
| `bliss-caustics` | v2 `glsl/uw.js:54` → 已移植 `water/glsl.js:23` `causticSeen`，`rgl/biome-caustic.js` | 已有 | 无 | 易 |
| `advanced-texturepack` | `rgl/texpack.js`（labPBR `_n/_s`、spec.A 自发光、POM） | 已有 | 仓库里没有带 `_n/_s` 的包，需要一个测试包 | 易 |
| `ice-alike-coloredglass` | 冰：`rgl/long/water.js:306`（mat 3） | 冰已有；**彩色玻璃没有**（`shared.js:113` 玻璃是 cutout） | 新增 `:stained_glass` 走冰的半透明分支，按 meta 染色（s04 §5 能力字段 `tint`） | 中 |
| `mobs1 / mobs2` | goodPG `MobRenderer.ts:59`、`shaders/mob.ts`、`mobTextures.ts`、`monsterAnim / faunaPose` | 无 | s03 §4 / s05 已排（M3） | 中 |
| `minimap` | goodPG `game/maps.ts:46` `MapImage`（CPU 2D canvas，`setMapPalette`） | 无 | s03 §3 已排（M4）；可直接搬 `MapImage` 的调色板与等高线规则 | 中 |
| `clouds1 / clouds2` | v2 `glsl/cloud.js:4-83`（Bliss：64³ Perlin-Worley `sampler3D`、Beer + powder、HG） | **无**：rgl 是 goodGL 2D 云图（`rgl/long/sky.js:188`） | 把 v2 体积云移植成 rgl 的一个 pass（半分辨率 + IGN 抖动 + TAA，同体积光）；「云」文件夹第一行切 2D / Bliss | 中 |
| `cloud-match-sunDir` | v2 `cloud.js:118`（云照宿主可见日月） | 无 | 随上一条；sunDir 统一由 `c_.Sun` 给（s09 §5） | 中 |
| `bliss-reflect` | v2 `glsl/shade.js:387` `reflHit`：**体素 DDA**（`usampler3D uVox`，64–96 步），能反射屏幕外的树、水下全反射 | 只有 SSR（`rgl/long/water.js:145`），水里**没有云**（`water.js:282` 只反 `skyBase`） | 见下 | **难** |

**`bliss-reflect` 的两条路**（R-6 [定 11-08]：**先走 1**，2 作为以后的「水」文件夹选项）：

1. **SSR + 回落**：SSR 失败时回落到 `skyBase + 云`（云移植后顺带能进水面反射），水下全反射用 SSR 反着打 + 水底焦散色兜底。成本低，屏幕外的树反射不出来。
2. **体素 DDA 反射**：main 维护玩家周围 64³–128³ 的 `R8UI` 体素纹理（只存不透明 / 叶 / 水三类），slicer 出网格时顺带出该块的 bit 位，main 按块 `texSubImage3D`。反射光线先走 SSR，失败后走 DDA。能达到原图，代价是每帧多一次 3D 纹理采样循环 + 约 2 MiB 显存 + 改块时的上传。

其余八张图在当前方案（rgl 为基准 + goodPG 生物 / 地图 + v2 体积云移植）下都能达到；新增工作量集中在**体积云移植**和**彩色玻璃**两项。
