# 生成器：`?g=old|v1|v2` · pgen 契约 · 三个生成器 · v2 调参与 goodGL 地貌

> 数据布局与 ID 见 [layout.md](layout.md)；工具见 [tools.md](tools.md)。宿主 B 的现有生成文档：`../doc/mat/world-gen.md`（§2.3 群系消费者表、§4 跨块与确定性、§5.1 两条已确认事项）。

## 1. `?g=` 怎么装载（宿主 B）

现状：defer 脚本依次是 `res_vam.js, gen.js, gls.js, bwebp.js, mobsim.js`（index.html:1037–1041），然后是游戏模块 1042。**有三处在加载时把生成器拷进了局部常量**：`gls.js:5`（`BIOMES` 与 `BIO_DESERT/MOUNTAINS/SNOWY/TAIGA`）、`mobsim.js:6`（`Terrain`、`BIO_BIRCH/FOREST/TAIGA`）、index.html:1044。所以不能简单地晚一点再 `import` 一个新对象替换上去。

做法：**对象身份不变，内容原地替换。**

1. `gen.js` 的 defer 位换成 `pgen/slot.js`（经典脚本，约 10 行）：`gg.Terrain = {}`、`gg.BIOMES = []`，先占住引用。
2. `pgen/index.js` 导出 `use(g)`：`await import('./' + g + '.js')`，然后 `BIOMES.length = 0; BIOMES.push(...rows)`，`Object.assign(Terrain, impl)`（固定一组键，缺的填抛错桩），最后设置 `SEA_LEVEL = WORLD[g].sea`（layout.md §4）。
3. `Game.start`（3640–3666）在 `Terrain.init` 之前 `await pgen.use(g)`。g 的来源优先级：存档头 > URL `?g=` > 默认 `old`。标题预览世界用默认值。放在 `Game.start` 里做，不用顶层 await，所以 `load` 监听（3749–3755）没有错过事件的风险。
4. `BIO_*` 数字比较改为读群系表字段：`gls.js:665`（`!dry` 才下雨）、`gls.js:670`（`snow` 决定下雪）、`mobsim.js:570`（树苗按 `sapling` 字段找群系）。index.html:1044 里没用到的 `BIO_*` 直接删掉。
5. 存档：头部（`Save.head` 3069–3072）和列表项（`Save.touch` 3050–3053）加上 `g`、`sea`；`Game.start` 与 `Title.boot`（3383，xyzb）读回。X-ray 比对（1378、1399–1411）用的是当前 `Terrain`，而 `Terrain` 就是这个世界的生成器，不需要改。
6. 其余读 `BIOMES[b]` 的地方都是调用时现读（gls.js:292/363/480/555，index.html:2762/2802/2806/3017/3198/3246），原地替换后自动生效。

## 2. pgen 契约

```js
// pgen/<g>.js
export const meta = { id: 'v2', biomes: [{ name, grass, foliage, water, snow, dry, sapling, map /* genview 群系图颜色 */ }, …] };
export function create(seed /* 宿主字符串种子 */, W /* 宿主服务 */) {
  return {
    generateChunk(c),             // 契约同 gen.js:70-112：写 c.blocks/meta/biomes（宿主布局）→ recomputeHeights → c.state = W.CH_GENERATED
                                  //   → W.applyPending(c) → 装饰（跨块一律走 W.setBlockGen(x,y,z,id,meta,soft)）→ recomputeHeights
    sample(x, z),                 // → { h, biome, …生成器自己的气候字段 }；探针和 genscope 原样打印所有字段
    heightAt(x, z), findSpawn(),  // index.html:3655 / 3676
    placeTree(x, y, z, bio, rng), // mobsim.js:570 树苗生长（在活世界里写）
    explain(x, y, z),             // 可选：→ Term { name, v, op: '+'|'*'|'min'|'max'|'spline'|'lerp', kids, note }，genscope 项树
    fields,                       // 可选：[{ name, at(x, z, y?) }]，genscope 热力图
    knobs,                        // 可选：{ MOUNT_H: [45, 0, 120], … }，genscope 滑杆；改后重建
  };
}
// W：宿主里 = gg.world（index.html:1189-1227）；工具里 = pgen/miniworld.js。两边共用 pgen/pending.js（从 index.html:1195-1227 搬出来），挂起语义一字不差。
```

- 宿主侧只认宿主布局：供体的输出经 `xlate.remapChunk` 转换后再写进 `c`。
- `soft` 是规则编号（layout.md §2 的 `SOFT` 表），挂起时一起存下来。规则 1 = 现状（空气或树叶），规则 2 = LiqPG（空气，或可替换且非流体）。
- 确定性：生成顺序会影响结果（邻块装饰会覆盖先溢出过来的树叶，world-gen.md §4 认可这个偏差）。所以哈希一律**按行优先顺序生成 n×n 块，只比内圈 (n−2)²**。

## 3. `old.js`（步骤 2）

1. **先存基线**：在宿主里加 `gg.genHash(n)`。照 X-ray 沙盒（1399–1411）的做法，换上空的 `world.chunks / pendingFeatures`，按行优先生成，对内圈块的 `blocks + meta + biomes` 求 FNV 哈希。改造前用 CDP 跑一次（`tools/cdp.mjs`），存到 `tools/out/gen/old-128.hash`。
2. 把 `Noise / Rand / hashString / smoothstep / lerp / clamp` 从 index.html 核心模块（约 394–520；`Noise.fbm2/ridge2` 在 487 附近）搬到 `pgen/noise.js`。index.html 改成 import，仍然挂到 `gg` 上给其他脚本用。
3. `gen.js` → `pgen/old.js`：凡是 `gg.X` 都改成从参数或 import 取。`BIOMES` 行补上 `snow / dry / sapling` 字段。`gen.js:51` 的钳位固定为 122（layout.md §3）。`gen.js:76,126` 的字面量改用 `bidx`。
4. 验收：`gg.genHash(32)` 和 `genview --g old --hash 32` 都等于基线。

## 4. v1 = goodGP + gen.js 群系（步骤 5）

| 子项 | 做法 | 依据 |
|---|---|---|
| vendor | `vendor/gp/`：`util.js`、`blocks.js`、`world.js` 原样复制；由 vendor 工具生成 `gp.js`（拼接后追加 `export { World, … }`），并补全局桩 `ASSETS`（`blocks.js:5-9` 的 `T()` 要读它）、`SH_LIQUID` | agent 核对过：Node 下只要这三个桩就能跑 `World.generate` |
| 等价性 | 不加任何覆写时，vendor 版和 goodGP 页面里的 `world.generate(cx,cz)` 同种子、抽 4 块，逐字节相等 | 确认这些桩没有改变输出 |
| 种子 | 宿主字符串种子 → `hashString` 得到整数。goodGP 的 `Noise` 与宿主逐位相同，但 `hashStr`（FNV）不同，要跟着 vendor | `util.js:40-113` |
| 山高 | `world.js:106` 的 `mount * pk**2 * 45` 改成 `this.MOUNT_H`（`// remix:` 一词补丁），默认 45；升 256 后在 genscope 里试 70–95 | README §1：现状最高约 135 |
| 群系判定 | `class V1 extends World` 覆写 `biomeOf`（`world.js:120-133`）。并入 gen.js 的海拔降温（`temp -= max(0, h-70)·k`，gen.js:52）：雪线随温度连续变化，取代 `h > 118` 这类硬阈值 | gen.js 评价"平原、沙滩较自然" |
| 平原 / 沙漠 | **后处理，不复制供体方法**：remap 之后在宿主布局里补 gen.js 的规则：沙漠的砂岩垫层（gen.js:98）、海底沙 / 砂砾噪声（gen.js:82）。装饰概率改成按群系查表（`V1_DECO`：平原取 gen.js 的 `grassP .12 / flowerP .02 / pumpkinP .0008 / trees .002`）；只有 goodGP 的 `decorate`（`world.js:370-427`）不得不改时才在子类里覆写 | — |
| **海岸** | 用户（10-26）：gen.js 的沙滩太薄（每段海岸都有、只高出海面 0–2 格的一层），但它**近海约 10 格的落差更合理**；要一个参数调「海边没有沙滩」的概率。实测见下表。做法全在子类里，供体不改：① **离岸坡度**：`column()` 包一层，`h < SEA` 时按 `SHELF` 样条表把 goodGP 的浅水大陆架（world.js:99–101，cont −0.18…−0.06 → 55…62）压陡，目标是离岸 32 格水深中位数接近 gen.js 的 9；② **沙滩**：`biomeOf` 覆写里的沙滩条件改成 `h ≤ SEA + BEACH_H`，并由一张低频噪声按 `NO_BEACH_P` 切掉一部分海岸（这些地方草地 / 石头直接入水，水下铺砂砾）；③ **沙层厚度** `BEACH_DEPTH`（后处理，砂岩垫层照 gen.js:98）。四个都进 `knobs` | `genview --coast`（就是下表的统计）：`NO_BEACH_P` 的实测值与设定值差 < 3 个百分点；离岸 32 格水深中位数 ≥ 8 → 人在 genscope 里并排看 old / v1 同一段海岸，调 `BEACH_H / BEACH_DEPTH` |
| 草色 | goodGP 用的 `grassMap/foliageMap` 来自 MC 资源 colormap 图（`render.js:229-230`，**版权问题**）。改为注入用 LiqPG `grassColormap/foliageColormap`（`biomes.js:24-36`，三角插值公式）生成的 256×256 表，goodGP 的 `tintFor`（`world.js:134-139`）原样不动 | 不碰资源文件 |
| 渐变（5b） | 宿主区块加列级 `temp/hum`（Uint8 各 256，`goal-renderapi.ts` 的 `HostChunk.temp/hum` 已经预留）；`gls.js tintFor`（288）有这两项时按 colormap(temp, hum) 取色；存档加列 | world-gen.md §5.1 第 1 条（已确认）；消除群系硬缝 |
| 树 | goodGP 不往邻块写，而是重算 3×3 邻块的树表（`treesFor` `world.js:305-335`），**保持原样**，v1 没有 outside。mobsim 的树苗要 `placeTree`：如果 goodGP 的 `placeTree`（337–368）是通过传入的 `set` 写方块，就包一层 `W.setBlockGen`；不是的话，v1 的 `placeTree` 退回 old 的实现 | 开工时看 :372–377 |
| ID | 15 个缺名，见 layout.md §5 | — |

## 5. v2 = LiqPG（步骤 4）

| 子项 | 做法 |
|---|---|
| vendor | `vendor/liq/`：从 `src/world/gen/generator.js` 出发，沿 import 图把用到的文件全部复制（gen/*、`world/blocks.js`、`constants.js`）。vendor 工具顺带检查依赖图里没有 `document / window / navigator` |
| 每块 | `gen.generateChunk(cx, cz, scratchU16)` → `xlate.remapChunk('liq', scratch, c)`（u16 解码、ID 查表、+64、轴序转置）→ 群系 `z*16+x` 转成 `x*16+z`，再加上宿主群系表里的起始下标 → `outside` 的每条 `[x,y,z,v]` 转成 `W.setBlockGen(x, y+64, z, LUT[v&0xfff], META[v>>12], 2)` |
| 实例 | `Generator` 内部有暂存区，不可重入（`generator.js:98-161`）。宿主里只用一个实例；以后放进 Worker 时每个 Worker 一个 |
| 速度 | 实测 2.8 ms/块，先在主线程跑 |
| `sample` | `gen.tn.climate(x, z)` 返回按 `CL_T…CL_BIOME` 下标排列的数组（`terrain.js:20`），转成具名字段 `{ temp, humid, cont, ero, weird, pv, off, fac, jag, biome }` |
| `explain` | `pgen/v2/explain.js`：照 `TerrainNoise.column`（`terrain.js:68-91`）对单个 y 重算各项，见下表。真实方块来自 8 个角点插值（`generator.js:183-215`），所以项树要列出 8 个角点各自的值和插值权重，最后给出填充判定（`:217-259`）。`slide`（`:170`）是模块私有函数：打一个 `// remix: export` 补丁，不要在 explain 里重写一份 |
| ID | 57 个缺名：4a 先全部 SUB（例如 deepslate→stone、tuff→andesite、podzol / coarse_dirt→dirt、red_sand→sand、jungle / acacia / dark_oak / cherry→oak / birch / spruce、花→四种已有的花、水生植物 / 藤蔓 / 蘑菇→air），让 `?g=v2` 先跑起来；4b 按画面影响分批 ADD：deepslate 和它的矿 → tuff / terracotta（恶地）→ 四种木头 → 双格花与水生植物 |
| 群系 | 48 行追加到宿主表，颜色来自 `biomes.js:117-128`；`snow` 取名字里带 frozen / snowy / ice 的，`dry` 取 desert / badlands |

`explain` 的项（`terrain.js` 行号）：

| # | 项 | 公式 / 位置 |
|---|---|---|
| 1 | 气候输入 | `off = −0.50375 + spline`（L53）、`fac`（L54）、`jag = jagTerm`（L62–66） |
| 2 | 深度梯度 | `depth = 1.5 − 3(y+64)/384 + off`（L73）；`t = (depth + jag)·fac`（L74）；`sc0 = 4·(t>0 ? t : t/4)`（L75） |
| 3 | 3D 基底噪声 | `+ base3d`，在 `sc0 < −1.1` 或 `> 3.5` 时跳过（L76–79，`noise.js:101-130`）；`terr = slide(sc, y)`（L81）；`sc ≤ 0` 时直接返回 `terr` |
| 4 | 入口洞 | `0 < sc < 1.5625` 时 `min(sc, 5·entrances)`（L85；`entrances` L107–119） |
| 5 | 地下 | `underground`（L133–154）：`4·layer² + clamp(0.27 + cheese) + clamp(1.5 − 0.64·sc, 0, .5)` → 与 entrances 取 min → 与 `spaghetti2d + roughness` 取 min（L121–131、L102–105）→ 洞值 < 0.03 时与 pillars 取 max |
| 6 | 收尾 | 再过一次 `slide`（L87）→ `noodleMin`（L88，L157–166） |

项树的每个 `min / max` 节点都要标出**哪一支胜出**。genscope 的"胜出项"热力图就靠这个标记（tools.md §3）。

## 6. v2 调参 + goodGL 地貌（步骤 6）

**先诊断，再改。** 每一条都先在 genscope 里定位到具体是哪一项，把截图和项树贴进本节，再动手。

goodGL 的平原不取（用户 10-26 试过，不好用）；goodGL 的**草甸**作为 v2 平原的补充（用户 10-26：梯度较大，与 v2 不冲突），见表最后一行。

| 问题 | 诊断（genscope） | 候选改法 |
|---|---|---|
| meadow 大型山出现得太频繁 | 在 meadow 区域看 `off / fac / jag` 的热力图：山是被样条抬升（off）撑起来的，还是被锯齿项（jag）撑起来的 | 改样条表（`spline.js:96/121/135`），或者降低 `PLATEAU / PLATEAU_V` 表里 meadow 的占比（`biomes.js:159-169`）。只改数据表 |
| plains 上出现超大镂空 | plains 区切片，用"胜出项"着色：空腔是 `cheese`（L133–154）造成的，还是 `entrances`（L107–119）造成的；再看顶盖有多厚 | `// remix:` 补丁：在低 PV 区域按"距 `prelimG` 估算地表的深度"压低 cheese 或 entrances（`generator.js:103-111` 已经算出 `prelimG`），系数做成 knob |
| 石林 / 拱（goodGL） | — | 移植成 `pgen/feat/spires.js`，约 40 行，**属于特征移植，不算 vendor**；注释里标明 goodGL 原行号：`cellPt` L334、石柱 L342–350、拱 L351–359、调用点 L466。在 remap 之后、宿主布局下运行，地表高度取宿主 heightmap。权重 `sw` 换成一张自己的低频噪声（goodGL 的 `sw` 依赖它自己的 column），只在白名单群系（plains、meadow、savanna）生效。尺寸缩小：石柱高 `14 + 26·sw`，拱半径 9–18 → 6–11；y 上限 252 → `H−4`。按 goodGL 原逻辑，每一列只写自己，块边界安全（开工时再核对一遍石柱分支）。条纹 `y%9<2` 用 andesite / granite。"少量"的标准：`genview --stats` 统计特征列占陆地列的比例，由人定（参考 1–2%） |
| 草甸（goodGL）：平原的补充 | — | goodGL 的草甸是山脚的大坡（`biomeOf` L322：`mw > 0.2`），形状来自丘陵项 `fbm2(x/160, 4)·(5 + 16·hilly)·(1 − 0.6·mw) + noise2(x/37)·1.6`（L278–279）。移植成 `pgen/feat/meadow.js`，只输出一个 2D 高度增量 Δh(x, z)。**叠进 LiqPG 的办法**：`depth = 1.5 − (y+64)/128 + off`（terrain.js L73），地表在 `depth + jag ≈ −base3d/(4·fac)` 处，与 off 线性相关，所以 `off += Δh / 128` 恰好把地表抬高 Δh 格，3D 噪声、洞穴都跟着走。补丁是 terrain.js L53 一处 `// remix:` 钩子 `+ this.extraOff(x, z)`（默认返回 0）。**遮罩只能用连续量**：`smoothstep` 过的 ero / pv / weird × 一张自己的低频噪声（波长约 600），不能用离散的群系 id，否则群系边界上会出现 Δh 高的台阶。knob：`MEADOW_AMP`（默认 21 = 5 + 16）、`MEADOW_P`（平原面积里被补成草甸坡的比例）。植被先用 LiqPG 平原自己的；要 goodGL 草甸的花（30%）和稀疏桦树 / 大橡树（`decorateChunk` L647、L673）再改装饰表。`explain` 加一项 `extraOff` | genscope 的 `extraOff` 热力图只在平原一带非零、边界连续；`genview --hist` 地表 y 的 99% 分位不明显上升 → 人在 genscope 里看坡度 |

## 7. 文件

```
pgen/slot.js        经典脚本：占位 gg.Terrain / gg.BIOMES（§1）
pgen/index.js       use(g)：原地替换；WORLD 表从 xlate 取
pgen/noise.js       从 index.html 搬出：Noise / Rand / hashString / 数学小函数
pgen/pending.js     从 index.html:1195-1227 搬出：setBlockGen / applyPending / SOFT 规则（宿主和工具共用）
pgen/miniworld.js   工具用的 W：区块 Map + pending.js
pgen/old.js         gen.js 的 ESM 版
pgen/v1.js          goodGP 包装 + 子类 + 后处理 + colormap 注入
pgen/v2.js          LiqPG 包装；pgen/v2/explain.js
pgen/feat/spires.js 石林 / 拱（自 goodGL 移植）
pgen/mapcolors.js   COL / BIOME_MAP_COL / topColor / blend / scale（自 preview_world.mjs:11-83，改成按宿主名字索引）
remix/xlate.js      唯一转换层（layout.md §2）
vendor/{gp,liq,gl}/ 供体原样副本；vendor/VENDOR、vendor/PATCHES.md
```
