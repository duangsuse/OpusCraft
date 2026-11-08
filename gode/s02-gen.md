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
import '../../w/slicer.js';              // 引擎运行时：信封分派、xlate、光照、mesh、map 动词（s01 §3）
import { Generator } from '../../vendor/liq/generator.js';

export const meta = { id: 'liq', ver: 1, sea: 127, names: ['air', 'stone', …], biomes: […] };
let SEED, G, K;                          // 模块级全局，由 onkwarg 设置

export function onkwarg({ seed, kw }) {  // 初始化：直接设全局；再次收到 = 热重置
  SEED = seed; K = kw.gen;               // K = c_.Gen 的镜像（§2.1）
  G = new Generator(SEED, K);
  return { meta };                       // 运行时把返回值包成 {ready: {meta}}
}
export function gen({ cx, cz }, out) {}  // 写 out.{blocks, biomes, heights, temp?, hum?}，返回 { outside? }
export function set(kv) {}               // 面板 / 模组改了 c_.Gen.*（§2.1），更新 K；运行时随后通知 main 重生成
export function sample({ x, z }) {}      // → { h, biome, …气候字段 }
export function spawn() {}               // 出生点
export function tree({ x, y, z, bio }) {} // 树苗长大：返回要写的格 [x,y,z,v,soft]…（main 不再加载生成器代码）
export function explain({ x, y, z }) {}  // 可选，genscope（gen.md §2）
```

- **导出函数名就是动词名**：`slicer.js` 收到 `{gen: {...}, id}` 就调用模块导出的 `gen`，返回值包成同名应答（s01 §2 的 `for (k in msg)` 分派）。没导出的动词由运行时给默认实现或忽略。
- 光照、网格、地图这些**引擎动词**由 `slicer.js` 提供，生成器不用管；所以 s01 的「slicer 池 = 生成 + 光照 + 网格」照旧，池里每个 worker 都是同一个生成器脚本。
- 短名映射：`old / gp / liq` → `$baseUrl/defl/g/<名>.js`；其余 URL 原样当 Worker 入口。`Pusc.json` 的 `$slicer` 存同一个字符串。
- 生成器可以直接写规范布局；用自己的布局时声明 `meta.layout`（`'yzx16' | 'xzy8' | …`），由运行时的 `xlate` 转换。
- `outside`：`Int32Array`，每 5 个一组 `[x, y, z, v, soft]`（世界坐标），`soft` 规则号同 gen.md §2（1 = 只覆盖空气 / 树叶，2 = 覆盖空气或非流体可替换格）。
- 树苗生长原先是 main 直接调 `placeTree`（宿主 B mobsim.js:570）；现在改为发 `{tree}` 请求，异步返回写入列表，走 §3 的合并。

### 2.1 可调参数：湖泊与树 [定 11-08]

生成器参数统一放在 `c_.Gen`（s09），声明 `meta.fx = 'regen'`：改动后 main 重新生成视野内尚未被玩家改过的区块（被改过的列不重生成，避免冲掉建筑）。两个供体都**没有湖泊**，要新写；树的密度表已存在，提出来即可。

| 文件夹 | 参数 | 来源 / 说明 |
|---|---|---|
| 湖泊 | `lake.rate`（每区块概率）、`lake.r`（半径区间 vec2）、`lake.depth`、`lake.lavaBelow`（低于此 y 改为岩浆湖）、`lake.shore`（岸边沙 / 砂砾 / 草直入水）、`lake.ice`（冷群系结冰） | 新写，放在 `w/feat/lake.js`，三个生成器都 import；跨块部分走 `outside` |
| 树 | `tree.dens`（每群系密度表，`pickLib` 编辑）、`tree.mix`（树种权重）、`tree.h`（树高区间）、`tree.crown`（树冠半径）、`tree.big`（大树 / 巨型云杉概率） | gp：`world.js:314` 的 `dens` 表；liq：`decorate.js:142` 的 `[count, extraChance, extraCount, [[tree, chance]…], default]` 表。适配器把这两张表映射到同一组参数 |
| 地形 | 山高（gp `MOUNT_H`、liq 峰顶 < 250）、海岸 `BEACH_H / NO_BEACH_P / BEACH_DEPTH` | [承] gen.md §4 |

- 每个生成器在 `meta.knobs` 里声明自己支持哪些参数和区间，面板只显示它支持的。
- 这些参数随存档保存（`Pusc.json` 的 `c_.Gen`），因为它们和种子一起决定「生成器输出」，也就是 diff 的基准（s06 §4）。改参数等于换基准，所以已经存过的区块要在改之前先把当前内容固化成全量记录。

## 3. 跨块装饰 [定 11-08：outside 列表 + main 合并]

- main 收到 `gen` 应答后：先写入区块 → 应用挂起表里落在本块的条目 → 把 `outside` 中落在已加载块的直接写入（按 soft 规则），落在未加载块的进挂起表。语义照搬宿主 B `index.html:1195–1227`（gen.md 的 `pgen/pending.js`）。
- 挂起表随存档保存（s06），否则重进存档后邻块缺树冠。
- 确定性测试照 gen.md：按行优先生成 n×n，只哈希内圈 (n−2)²。

## 4. 三个适配器

| 短名 | 来源 | 原布局 | 转换 | 溢出 |
|---|---|---|---|---|
| `old` | 宿主 B `gen.js` | u8 + meta，XZY，H 128 | 转置为 YZX，y 原样（上半部空气） | `pendingFeatures` → outside |
| `gp` | goodGP `js/world.js`（vendor 化，gen.md §4） | u8 id + u8 meta，`(y<<8)\|(z<<4)\|x`，H 256 | **索引顺序与规范相同**，只需 `type = LUT[id] \| meta<<12` | 不外写（重算 3×3 树表），outside 为空 |
| `liq` | goodLiqPG `src/world/gen/generator.js` | u16 12+4，`(yi*16+z)*16+x`，y −64…320 | 编码相同，查 LUT；**y + 64，191 以上裁掉**（§5） | `generateChunk` 已返回 `outside` |

- `Generator` 实例不可重入（gen.md §5），每个 slicer 一个实例。
- 缺失方块先 SUB 到已有方块，按画面影响分批补（gen.md §5「4a / 4b」）。

## 5. liq 的高度映射 [定 11-08]

- `y_gode = y_liq + 64`：海平面 63 → 127，深板岩层完整保留，liq 的 y > 191 裁掉。
- 裁剪前用 knobs 把山高压到峰顶 < 250（留 5 格给树冠），适配器在 `generateChunk` 末尾统计被裁格数，genscope 显示，便于调参。
- 因此 `meta.sea` 是规范坐标下的值：`old/gp` 为 62，`liq` 为 127。生成器之间的海平面差异由各自 meta 声明，玩法代码只读 `meta.sea`。

## 6. 光照

slicer 在 `generateChunk` 之后算本块初始光照，随 `gen` 应答返回 `light: Uint8Array(65536)`（s01 §4）。
