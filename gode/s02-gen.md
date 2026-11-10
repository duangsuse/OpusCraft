# s02 · 地形生成器接口（slicer）

> 上游：`goal-remix/gen.md` §2 的 pgen 契约（本节在它的基础上改为在 Worker 内运行、输出 gode 规范布局）；`doc/mat/world-gen.md`。
> 象征物是种子：生成器是 `(seed, cx, cz) → 区块` 的纯函数（跨块溢出另走 `outside`），存档只存 diff（s06）。

## 1. 规范区块布局 [定 11-08]

```js
idx  = (y << 8) | (z << 4) | x          // YZX，y 0..255；每个 16³ section 是连续 4096 格
v    = type & 0xfff | meta << 12         // Uint16Array(65536)
biomes  Uint8Array(256)                  // z*16+x
heights Int16Array(256)                  // 最高非空气格
temp/hum Uint8Array(256)?                // 可选，连续群系色（world-gen.md §5.1）
```

光照另存（`sky<<4|blk`），不进存档（s04 / s06）。

## 2. 生成器 = 一个 Worker 脚本 [定 11-08：不包 `create()`，Worker 隔离]

`?g=` / `$slicer` 指向的 URL **本身就是 Worker 入口**（`new Worker(url, {type: 'module'})`）。生成器是模组代码，与 main、与其它模组都隔离：崩溃、死循环、恶意代码都碰不到存档和页面。

```js
// defl/g/liq.js —— 整个文件就是 worker
import { serve } from '../../w/slicer.js';   // 引擎运行时：信封分派、xlate（M1 起再加光照、mesh、map 动词，s01 §3）
import { Generator } from '../../../goodLiqPG/src/world/gen/generator.js';   // ESM 供体直接 import（M1 vendor 化后改指 vendor/liq）

export const meta = { id: 'liq', ver: 1, sea: 127, h: 256, names: ['air', 'stone', …], biomes: […],
  colors: { biomes: [0x000070, …] },     // 可选：群系地图色（pgviz）；方块色由查看器按 names 查
  over: { 2: [/* soft 2 额外可覆盖的 type */] },   // outside 合并规则（下）
  layout: 'yzx16' };                     // 可选，非规范布局时运行时 xlate（mini = 'xzy8'）
let SEED, G, K;                          // 模块级全局，由 onkwarg 设置

export function onkwarg({ seed, kw }) {  // 初始化：直接设全局；再次收到 = 热重置
  SEED = seed; K = kw?.gen;              // K = c_.Gen 的镜像（§2.1）
  G = new Generator(SEED, K);
  return { meta };                       // 运行时把返回值包成 {ready: {meta}}
}
export function gen({ cx, cz }, out) {}  // 写 out.{blocks, biomes, heights, temp?, hum?}，返回 { outside?, clip? }
export function set(kv) {}               // 面板 / 模组改了 c_.Gen.*（§2.1），更新 K；运行时随后通知 main 重生成
export function sample({ x, z }) {}      // → { h, biome, …气候字段 }
export function spawn() {}               // 出生点
export function tree({ x, y, z, bio }) {} // 树苗长大：返回要写的格 [x,y,z,v,soft]…（main 不再加载生成器代码）
export function explain({ x, y, z }) {}  // 可选，genscope（gen.md §2）

serve(import.meta.url);                  // 末行：运行时再 import 自己一次（模块表里同一实例），拿到全部导出、装消息循环
```

- 默认出生点：游戏宿主（`main/boot.js`）在没给 `p1=`（`@x,z[^y][,yaw]`，与宿主 B 同格式）时向池子发 `spawn`（2 s 超时；生成器没导出就回落 `(8,8)` 的柱高），所以 `spawn()` 一定要返回规范坐标 `[x, y, z]`。pgviz 不调它（不回游戏）。
- **导出函数名就是动词名**：`slicer.js` 收到 `{gen: {...}, id}` 就调用模块导出的 `gen`，返回值包成同名应答（s01 §2 的 `for (k in msg)` 分派）。没导出的动词由运行时给默认实现或忽略。[定 11-09，pgviz V1 实现]
  - **拿导出的办法**：生成器末行 `serve(import.meta.url)`。`slicer.js` 在被 import 时就装上 `onmessage` 并缓存早到的消息，`serve` 动态 `import()` 同一 URL 得到本模块命名空间（模块表去重，不会二次执行），然后按到达顺序串行处理。也接受 `serve({ meta, onkwarg, gen, … })` 显式传对象。在 node / 页面里 import 生成器（测试）时 `serve` 不装消息循环，导出照常可调。
  - `gen` 的 `out` 由运行时分配（规范 `Uint16Array(65536)` 等，见 §1）；生成器若用自己的布局，声明 `meta.layout` 并把 `out.blocks`（以及 `out.meta`、x 主序的 `out.biomes / heights`）换成原生数组，运行时 `xlate` 转成规范布局后再发。应答带 `ms`（worker 内耗时），各缓冲 transfer。
  - 引擎默认动词 `col({cx, cz, cls})`：整块生成后归约成列级地表 `Int16Array(1024)` = 每列 `[实体 type, 实体 y, 群系, 水深]`（`cls` = main 按方块名算的分类表，植物跳过、流体计水深），pgviz 外圈 2D 用（s13 V-8）。生成器可导出只算列噪声的 `col` 覆盖它。
  - 异常一律回 `{err: {msg, stack}, id}`；`onkwarg` 总回 `{ready: {meta}}`（`meta` 取返回值的 `meta`，没有就取模块导出的 `meta`）；无 `id` 的广播事件不应答。
- 光照、网格、地图这些**引擎动词**由 `slicer.js` 提供，生成器不用管；所以 s01 的「slicer 池 = 生成 + 光照 + 网格」照旧，池里每个 worker 都是同一个生成器脚本。
- 短名映射：`mini / gp / liq / old / pg1 / luan0 / luanV / veg` → `$baseUrl/defl/g/<名>.js`；其余 URL 原样当 Worker 入口。`Pusc.json` 的 `$slicer` 存同一个字符串。
- 生成器可以直接写规范布局；用自己的布局时声明 `meta.layout`（`'yzx16' | 'xzy8' | …`），由运行时的 `xlate` 转换。
- `outside`：`Int32Array`，每 5 个一组 `[x, y, z, v, soft]`（世界坐标），`soft` 规则号同 gen.md §2（1 = 只覆盖空气 / 树叶，2 = 覆盖空气或非流体可替换格）。规则落到具体 type 由生成器声明：`meta.over[soft]` = 除空气外还可覆盖的 type 列表（mini：三种树叶；liq：`T_REPLACEABLE && !T_FLUID`），soft 0 = 直写。main 不需要知道各生成器的方块属性。
- 树苗生长原先是 main 直接调 `placeTree`（宿主 B mobsim.js:570）；现在改为发 `{tree}` 请求，异步返回写入列表，走 §3 的合并。

### 2.1 可调参数：湖泊与树 [定 11-08]

生成器参数统一放在 `c_.Gen`（s09），声明 `meta.fx = 'regen'`：改动后 main 重新生成视野内尚未被玩家改过的区块（被改过的列不重生成，避免冲掉建筑）。两个供体都**没有湖泊**，要新写；树的密度表已存在，提出来即可。

| 文件夹 | 参数 | 来源 / 说明 |
|---|---|---|
| 湖泊 | `lake.rate`（每区块概率）、`lake.r`（半径区间 vec2）、`lake.depth`、`lake.lavaBelow`（低于此 y 改为岩浆湖）、`lake.shore`（岸边沙 / 砂砾 / 草直入水）、`lake.ice`（冷群系结冰） | 新写，放在 `w/feat/lake.js`，三个生成器都 import；跨块部分走 `outside` |
| 树 | `tree.dens`（每群系密度表，`pickLib` 编辑）、`tree.mix`（树种权重）、`tree.h`（树高区间）、`tree.crown`（树冠半径）、`tree.big`（大树 / 巨型云杉概率） | gp：`world.js:314` 的 `dens` 表；liq：`decorate.js:142` 的 `[count, extraChance, extraCount, [[tree, chance]…], default]` 表。适配器把这两张表映射到同一组参数 |
| 地形 | 山高（gp `MOUNT_H`、liq 峰顶 < 250）、海岸 `BEACH_H / NO_BEACH_P / BEACH_DEPTH` | [承] gen.md §4 |

- 每个生成器在 `meta.knobs` 里声明自己支持哪些参数和区间，面板只显示它支持的。**[已实现 11-09，s13 §7]** `knobs` 是扁平表 `[{ k: 'cave.rate', def, min, max, note }]`，`onkwarg({ seed, kw })` 经 `w/params.js` 校验；目前有 `terrain.* cave.* ore.mul tree.dens plant.dens river.width`，湖泊和树种 / 树高等细项仍待做。
- 这些参数随存档保存（`Pusc.json` 的 `c_.Gen`），因为它们和种子一起决定「生成器输出」，也就是 diff 的基准（s06 §4）。改参数等于换基准，所以已经存过的区块要在改之前先把当前内容固化成全量记录。

## 3. 跨块装饰 [定 11-08：outside 列表 + main 合并]

- main 收到 `gen` 应答后：先写入区块 → 应用挂起表里落在本块的条目 → 把 `outside` 中落在已加载块的直接写入（按 soft 规则），落在未加载块的进挂起表。语义照搬宿主 B `index.html:1195–1227`（gen.md 的 `pgen/pending.js`）。
- 挂起表随存档保存（s06），否则重进存档后邻块缺树冠。
- 确定性测试照 gen.md：按行优先生成 n×n，只哈希内圈 (n−2)²。

## 4. 生成器适配器

| 短名 | 来源 | 原布局 | 转换 | 溢出 |
|---|---|---|---|---|
| `mini` | 宿主 B `gen.js` 的抽副本（`vendor/mini/{prng,blocks,terrain}.js`，s13 V-7） | u8 + meta，XZY，H 128 | `meta.layout = 'xzy8'`，运行时转置为 YZX，y 原样（上半部空气） | `setBlockGen` 块外写入 → outside（soft 1） |
| `gp` | goodGP `js/world.js`（`vendor/gp/load.js` 运行时 fetch 供体 util / blocks / world 原文拼成函数执行，零改动；只补 `ASSETS.tiles` 与色图两个桩） | u8 id + u8 meta，`(y<<8)\|(z<<4)\|x`，H 256 | **索引顺序与规范相同**，只需 `type = LUT[id] \| meta<<12` | 不外写（重算 3×3 树表），outside 为空 |
| `liq` | goodLiqPG `src/world/gen/generator.js` | u16 12+4，`(yi*16+z)*16+x`，y −64…320 | 编码相同，查 LUT；**y + 64，191 以上裁掉**（§5） | `generateChunk` 已返回 `outside` |
| `old` | 仓库根 `VoxelCraft.html` 的地形生成抽副本（`vendor/old/voxelcraft.js`，s13 §13） | u8 id，`(x*16+z)*96+y`，H 96，海 40，无 meta | 适配器直接写规范 YZX u16（不走 xlate），y 原样 | 无（树全在块内，`meta.outside = false`） |
| `pg1` | goodPG1.html 的 `WorldGen`（`vendor/pg1/load.js` 运行时切出单文件 `<script>` 执行，零改动；供体自己的 Worker 路径就是 `self.IS_WORKER=true` + 整段脚本，goodPG1.html:3350） | u16，`(y<<8)\|(z<<4)\|x`，H 192，海 63，id 453 / meta ≤ 5 | 索引顺序与规范相同，`v = id \| meta<<12`；heights 按规范从方块重算（供体 hmap 跳过 filter=0 的植物） | 无（结构 / 特征走 Writer 逐块裁剪，`meta.outside = false`） |
| `luan0` | Luanti mapgen v7 的**列式独立重写**（`vendor/luanti/{noise,pcg,biome,mapgen,v7}.js`，装配 `defl/g/lt/`，s13 §14） | 无（逐点算，直接写规范 YZX u16） | 原生 y −64…191 ↔ 规范 0…255（+64，同 liq），海 1 ↔ 65 | 无（`meta.outside = false`；树冠按相邻 mapchunk 的装饰结果直接写进本块，s13 §14.1；矿 / 地牢 / 随机游走洞未做） |
| `luanV` | 同上，`vendor/luanti/valleys.js` | 同上 | 同上 | 同上 |
| `veg` | goodPG（VoxelCraft v3）`src/shared/world/terrain.ts`，`vendor/v3/terrain.mjs`（97 模块打包，`tools/build-v3.mjs` 生成，勿手改） | u16 状态 id（6 244 个，带朝向 / 水位），`(yi<<8)\|(z<<4)\|x`，y −64…319 | 状态 id 按去 `_<n>` 的名字压成规范 type（1 132 个，`meta=0`）；**y + 64，> 255 裁掉**（同 liq，带 `clip`） | 无（树 / 结构按全局网格算、写回时裁到本块，`meta.outside = false`；箱内容 / 村民 / 结构刷怪无通道，V1 丢弃） |

- `pg1` 没有参数表（供体的 `wtype` 固定 `default`，没有 `terrain.*` / `cave.*` 一类乘子），`meta.knobs = []`；pgviz ④ 参数段为空，`viz.tune` 对它只会报未知键（检查 `viz-kw` 对无参数生成器只验这一条）。
- V1 里 type 就是各生成器自己的 id（gp 0–168、liq 0–227、mini 0–87、old 0–25、pg1 0–452、veg 0–1131），名字表在 `meta.names[type]`，pgviz 按名字着色 / 分类；统一 id LUT 等 s04 定表后再加。veg 的 12 位是硬上限：v3 的 6 244 个状态必须合并（s13 §0 的清单第 1 条）。
- `Generator` 实例不可重入（gen.md §5），每个 slicer 一个实例。
- 缺失方块先 SUB 到已有方块，按画面影响分批补（gen.md §5「4a / 4b」）。

## 5. liq 的高度映射 [定 11-08]

- `y_gode = y_liq + 64`：海平面 63 → 127，深板岩层完整保留，liq 的 y > 191 裁掉。
- 裁剪前用 knobs 把山高压到峰顶 < 250（留 5 格给树冠），适配器在 `generateChunk` 末尾统计被裁格数，genscope 显示，便于调参。
- 因此 `meta.sea` 是规范坐标下的值：`mini/gp` 为 62，`liq` 为 127。生成器之间的海平面差异由各自 meta 声明，玩法代码只读 `meta.sea`。

## 6. 光照

slicer 在 `generateChunk` 之后算本块初始光照，随 `gen` 应答返回 `light: Uint8Array(65536)`（s01 §4）。

## 7. 生成 phase 钩子 [定 11-10，用户；规格在 `flow/hooks.ts` ⑤]

- phase 固定：`terrain → carve → surface → decorate → structure`。生成钩子是纯函数 `genChunk(phase, buf, ctx)`：`ctx.rng()` 的种子是 hash(seed, cx, cz, phase)，同块同阶段永远同一序列；`ctx.v(':stone')` 把名字转成规范 u16（模组不写生成器的私有 id）；返回值可带 `outside`（§3 的跨块写，`structure` 阶段主要靠它）。
- **登记**：`defl/mod.tsv` 的 `where = 'slicer'`。脚本在每个 slicer worker 里执行，`gm` 是只含 `gm.on({ genChunk })` 的受限代理（不能碰世界、存档）。
- **生成器声明自己做了哪些阶段**：`meta.phases`，缺省 = 整块一体 = `terrain carve surface decorate`（不含 `structure`）。模组钩子在对应阶段**之后**追加；`gp / liq / mini` 等供体是整块一个函数，所以目前只有「整块之后」这一个插入点，`structure` 先可用，其余阶段等生成器拆分后才有细插入点。
