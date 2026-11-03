# 数据布局：不兼容总表 · 转换层 `remix/xlate.js` · 改高 256

> 行号按 2026-10-26 工作区核对（index.html 4048 行、gls.js 691 行、gen.js 290 行、goodGL.html 6431 行）。开工前 `rg` 复核，有漂移以代码为准。
> ⚠ = 必须经 xlate 转换或改宿主，不能直接互通。

## 1. 总表

| 项 | 宿主 B 现状 | 宿主 B 步骤 1 后 | `gen.js`（old） | goodGP（v1） | LiqPG（v2） | goodGL（渲染 + 地貌） |
|---|---|---|---|---|---|---|
| 模块形式 | `gg` 全局，defer 脚本 | 同左 + `pgen/*.js` ESM | IIFE 读 `gg`（`gen.js:1-5`） | 经典脚本，全局变量（`goodGP/index.html` 依次加载） | ESM，无 DOM（已逐个核对 gen 子树的 import） | 单文件；引擎在 `SHARED_SRC` 函数里（L13–1072，`toString()` 后塞进 Worker），GLSL 由 `GLSL` 对象**多次重赋值**拼成 |
| y 范围 | 0…127（`CHUNK_H` index.html:363） | **0…255** | 跟随 `CHUNK_H`，自己钳在 `CHUNK_H-6`（`gen.js:51`） | 0…255（`util.js:5`） | ⚠ **−64…319**（`constants.js:2-5`，`generator.js:13` 又写了一遍） | 0…255（L15） |
| 海平面 | 62（index.html:364） | **按世界：old/v1 62，v2 127**（§4） | 62 | 62 | ⚠ 63；`surface.js:118,136`、`decorate.js:346`、`carvers.js:175` 里还写死了 62/63/64（都是供体坐标，平移在生成之后做，不受影响） | ⚠ 63 |
| 方块下标 | `(x<<11)\|(z<<7)\|y`，**y 最快**（`bidx` index.html:371） | `(x<<12)\|(z<<8)\|y` | 同宿主；另有两处字面量（`gen.js:76,126`） | ⚠ `(y<<8)\|(z<<4)\|x`，**x 最快**（`world.js:31,70`） | ⚠ `((y+64)*16+z)*16+x`（`constants.js:15`），x 最快，带偏移 | ⚠ `(y<<8)\|(z<<4)\|x`（L1845）；网格器读 18³ 的 padded 数组（步长 x 1、z 18、y 324，`buildPadded` L2253–2273） |
| 列下标（2D） | ⚠ **`x*16+z`**（`height`、`biomes`，index.html:1067–1068；`gls.js:363,555` 用 `(x<<4)\|z`）；存盘时是 z,x 序（`bwebp.js:93-94`） | 同左 | 同宿主 | ⚠ `z*16+x`（`world.js:167`） | ⚠ `z*16+x` | ⚠ `z*16+x` |
| 方块 id | Uint8，按名字注册，**88 个**（`BLOCK_DEFS` 708–783，`define` 遇到 >255 抛错 616） | 同左，上限见 §5 | 宿主名 | ⚠ 固定稀疏 id，156 个，最大 168（`blocks.js:112-255`） | ⚠ Uint16，低 12 位是类型，**228 种**（`blocks.js:4-8,34-45`） | ⚠ 82 个（L112–193），按 id 查一组属性表（`RT/OCC/MAT/TEXF/…` L85–89） |
| meta | 独立 Uint8 | 同左 | 宿主语义 | 独立 Uint8；chest `face\|8`；草 meta 1 = 雪顶（与宿主相同） | ⚠ 打包在 bit 12–15；原木轴向 0y/1x/2z（`trees.js:8`），宿主原木没有轴向；双格植物上半 = 1；藤蔓位掩码 | 独立 Uint8；水 bit0-2 液位、bit3 下落，**与宿主相同**；火把 0–4 朝向；树叶 bit0 = 天然 |
| 光照 | 独立 `sky` / `blk` 两个 Uint8 数组（gls.js Lighting，增量 BFS） | 同左 | — | 打包 `sky<<4\|blk` | 网格化时在 Worker 里算 | ⚠ 打包 `(sky<<4)\|blk`（L1742、L1899） |
| 群系 | 每列 1 个 id，10 种，tint 取 `BIOMES[id].grassRGB`，**按列查表不插值 → 硬缝** | + 列级 `temp/hum`（步骤 5b） | 10 种 | ⚠ 12 种；每列 RGB tint `grass/foliage` 各 768 字节，**查的是 MC 资源里的 colormap 图**（`render.js:229-230`，版权问题） | ⚠ 48 种，由 4×4 气候格模糊放大选出（`generator.js:61-78,127-130`）；颜色 `biomes.js:117-128` | ⚠ 16 种；每列 RGB `tintG/tintF`（L422、L471–472） |
| 高度图 | ⚠ `Uint8Array`，存"最高非空 y + 1"，**到 256 会溢出成 0**（index.html:1067） | **Uint16** | 用 `c.recomputeHeights()` | 生成时不产出 | Int16 世界 y | `topY` Uint8 |
| 跨块写入 | `setBlockGen`：已生成的块直接写，未生成的进 `pendingFeatures`；soft 写入只覆盖空气 / 树叶（1195–1227） | soft 规则表化（§2） | 走 `setBlockGen` | ⚠ 不写邻块：`treesFor` 重算 3×3 邻块的树表，只写本块（`world.js:305-377`） | ⚠ 返回 `outside: Int32Array [x,y,z,v]*`，只落在空气或"可替换且非流体"的格子（`world.js:287-299`） | 装饰在主线程做，要求邻块已加载（L2204、L2230） |
| 入口 | `Terrain.generateChunk(c)` 直接改块（gen.js:70-112） | `pgen` 契约（gen.md §2） | 同左 | `World.generate(cx,cz)` → 新 `Chunk` | `new Generator(seed).generateChunk(cx,cz,u16)` → `{outside,biomes,heightmap}`；实例内有暂存区，不可重入 | `Generator.generate(cx,cz)` |
| 种子 | 字符串 `z1-xxxx`，`hashString` 加盐（gen.js:35-38） | 同左 | 同左 | 整数；`Noise` 与宿主**逐位相同**（非 0 整数种子），但 `hashStr`（FNV）不同 | `seedWords` + xoshiro128** | 整数，`Simplex` + `mulberry32` |
| 方块实体 | chest / spawner 走 `setTileGen` | 同左 | 有 | 地牢箱子没有战利品 | 无 | 箱子在村庄里 |
| 存盘 | bwebp v3，⚠ **头里没有高度字段**（`headOf` bwebp.js:57 只校验 v/order/cols） | 头加 `h`、`g`、`sea` | — | — | — | — |

## 2. `remix/xlate.js` 的形状

```js
// remix/xlate.js —— 供体 ⇄ 宿主的唯一转换层。只放表 + 通用函数；别处不写 if (donor === …) / if (host === …)。
export const LAYOUT = {             // idx(x, yi, z)：yi 是供体内部下标（0 起）
  host: { H: 256, idx: (x, y, z) => (x << 12) | (z << 8) | y, col: (x, z) => x * 16 + z },
  gp:   { H: 256, minY: 0,   idx: (x, y, z) => (y << 8) | (z << 4) | x,     col: (x, z) => z * 16 + x, dec: 'u8+meta' },
  liq:  { H: 384, minY: -64, idx: (x, y, z) => (y * 16 + z) * 16 + x,       col: (x, z) => z * 16 + x, dec: 'u16:t|m<<12' },
  gl:   { H: 256, minY: 0,   idx: (x, y, z) => (y << 8) | (z << 4) | x,     col: (x, z) => z * 16 + x, dec: 'u8+meta', light: 'sky<<4|blk' },
};
export const YMAP = { gp: { shift: 0 }, liq: { shift: +64 }, gl: { shift: 0 } };   // 宿主 y = 供体 y + shift，越界裁掉（§4）
export const WORLD = { old: { sea: 62 }, v1: { sea: 62 }, v2: { sea: 127 } };     // 存进存档头，宿主 SEA_LEVEL 由此而来
export const HOST = {             // 渲染侧（render.md §3）：rgl 只认 renderapi，宿主差异全在这里
  A: { H: 96,  sea: 40, ids: 'A', tint: 'const', weather: false },               // VoxelCraft.html；ids 按 B.* 名字（:659–661）
  B: { H: 256, sea: 'WORLD', ids: 'B', tint: 'biome', weather: true },           // index.html；sea 随世界（old/v1 62，v2 127）
};                                // 由 H / sea 推出 goodGL 帧对象里的绝对 y：cloudBase / cloudTop / caveY（render.md §3 海平面行）
export const META = { keep: m => m, zero: () => 0, top: m => m & 1 /* 双格植物上半 */ , … };  // 命名规则，表里只写名字
export const IDS = {               // [供体名, 宿主名 | '+'（步骤 4b 起新增宿主方块）, meta 规则]
  liq: [['stone', 'stone'], ['deepslate', 'stone'], ['tall_grass', 'short_grass', 'zero'], ['oak_log', 'oak_log', 'zero'], …],
  gp:  [['clay', 'gravel'], ['sugar_cane', 'air'], …],
};
export const GLID = {              // 渲染侧，方向相反：[宿主名, goodGL 名 | '+'（xlate 里追加 gl 行）, cls?]；'+' 行的 cls（0 不投影 / 1 软 / 2 锐）显式写，缺省按宿主 BlockDef 的 opaque / cutout 推（render.md §4.2）
  A: [['GRASS', 'grass_block'], ['WATER', 'water'], ['TALL_GRASS', 'short_grass'], ['TNT', '+'], ['GOLD_BLOCK', '+'], …],   // 26 行
  B: [['grass_block', 'grass_block'], ['water', 'water'], ['oak_door', 'hybrid' /* R6 混合路径 */], …],                   // 88 行
};
export const SOFT = [null, id => id === 0 || isLeaves(id), id => id === 0 || (DEF[id].replaceable && !DEF[id].fluid)];
export const BIOME = { liq: [['meadow', { grass: …, foliage: …, water: …, snow: 0, dry: 0 }], …], gp: […] };
export function remapChunk(donor, src, dst) {…}   // 一次遍历：解码 → 查 LUT → 平移 → 转置写宿主下标
export function padded(source, host, cx, cy, cz, out) {…} // 渲染侧（render.md §3）：ChunkData → goodGL 18³ padded（GLID LUT + 光照打包 + 转置）
export function frame(env, host, out) {…}          // 渲染侧：宿主 Env/Sky/Weather → goodGL 帧对象 F（render.md §4 R5）
```

- `IDS` 在 import 时编译成 `Uint16Array(4096)` 的 LUT（供体 id → 宿主 id），再加一张 meta 规则下标表；`remapChunk` 每格只做一次查表。
- 每个供体一组行，新增供体就加一组行；`remapChunk / padded` 的循环对所有供体共用。
- `SOFT` 规则编号写进 `pendingFeatures` 的第 6 列（现在只存 0/1，规则在挂起路径上丢了：立即写入走调用方传的谓词，挂起写入走写死的"空气或树叶"，index.html:1201 对 1221）。规则 1 等价于现在 gen.js 的 `onlyAir`，所以 old 不变；LiqPG 的 `outside` 用规则 2。

## 3. 改高 256（步骤 1）

**做法：先收口，后改数。** 第一步把所有字面量移位都换成 `bidx` / 新增的 `bdec(i) → [x,y,z]` / `CHUNK_H`，`?g=old` 的哈希保持 0 差异（仍然是 128）；第二步只改 `CHUNK_H = 256` 和几个派生常量。

| 文件 | 写死的布局（要先收口） | 由 `CHUNK_H` 派生（自动跟上，逐个过一遍） | 其他 |
|---|---|---|---|
| index.html | 1079 `updateHeight`；1416 X-ray 比对 `i>>11, (i>>7)&15, i&127`；2398 熔炉方块实体解码（3 处） | 定义 362–363、`bidx` 371；边界检查 1078、1110、1116、1122、1127、1140、1196；X-ray 1457；物理 1472、1511–1512；建造 / 放置 1934、2073、2168；射线 2019；BBat 2451、2480 | ⚠ 1067 `height` 改 Uint16；`posKey`（390）已允许 y<256 |
| gls.js | Lighting 40、52、57（邻格偏移 ±2048 / ±128）、65、82；网格器 275（6 行） | Lighting 42、53、66、83、98、119；网格器 161 `PY`、237、270、272、277、278、341、543 | 556 用 `c.height` 当循环上界（受溢出影响）；队列容量 `QCAP 1<<18`、移除队列 `1<<16`（17–23）按体积翻倍复核 |
| gen.js | 76、126 | 51、87、117（洞穴晶格 `LY`）、163 | y 魔数（49、52、57、83、100、131、133、146、152、169–171、176、240、285）**不动**：old 的地形本来就在 128 以内 |
| mobsim.js | 168 刷怪笼方块实体解码 | 536 随机刻 `rng.int(CHUNK_H)` | ⚠ 高度翻倍后每列随机刻密度减半 → 改成在 `0…height[col]+1` 内取 y，或者按段跳过全空段 |
| bwebp.js | 62 `yzx()`；69、85 打包 / 解包下标 | 68、82、117 | ⚠ 头加 `h`；读到 `h=128` 的旧档时按列补零到 256；同时加 `g`、`sea` |
| v2.js、v2/gl.js | 无 | `H = SRC.height`，校验 `H%16==0 && H<=256`（v2.js:252-254，gl.js:267-269） | 256 能装下，但 uVox 环 `N=2rd+5`：rd 10 时显存约 164 MB，CPU 镜像也差不多 → 通知 goalP4P5 的 P4a：rd 上限或按 `maxY` 只传有内容的段 |

内存：每块 4 个数组 × 32 KB = 128 KB → 256 KB。标题预览 `previewRd 16`（3134/3489）约 1369 块 ≈ 350 MB → 预览视距降到 10，或者把 `sky/blk` 合成一个打包数组（每块省 64 KB）。

验收：
- 旧 128 档读入后，y<128 逐格相等，y≥128 全是空气、天空光 15。
- `?g=old` 在 256 下的哈希 = 128 下的哈希（只算 y<128）。⚠ 前提是 `gen.js:51` 的钳位 `CHUNK_H - 6` 先固定成 122：gen.js 理论峰值约 135，现在靠这条钳位截平，改成 250 后那些列会变高。洞穴晶格 `LY` 虽然跟着变，但晶格点坐标不变、只挖 `y ≤ h`，不影响结果。
- 记录每块"生成 + 光照"耗时、常驻内存，前后各一次，写进本节。

## 4. y 平移与海平面（步骤 4 前定稿，数字见 README §1）

| 方案 | LiqPG → 宿主 | 损失 | 海平面 | 判断 |
|---|---|---|---|---|
| **A. +64（已拍板，用户 10-26）** | −64…191 → 0…255 | 无：实测 y≥192 没有实心方块；LiqPG 的基岩正好落在宿主 y=0 | v2 世界 127 | 洞窟全保留；地表以上还有 128 格（实测最高 181 → 245） |
| B. +32 | −32…223 → 0…255 | y<−32 的洞穴空气（10–13%）、深板岩底层、y<−32 的钻石 | 95 | 折中，没有必要 |
| C. −1 | 1…256 → 0…255 | **y<0 的洞穴空气 38–41%**，深板岩整层 | 62（与其他世界一致） | 丢掉 LiqPG 最好的部分，不取 |

方案 A 的代价是**海平面按世界区分**：`SEA_LEVEL` 从 `const` 改成启动时由 `WORLD[g].sea` 赋值（宿主只有 4 处使用：567 流体停放、1133 未加载块的 `getHeight` 兜底、3353 屏保、3676 `settleSpawn`），并写进存档头。v1 / old 不受影响。goodGL 的地貌特征按宿主坐标移植（gen.md §6），不涉及平移。

## 5. 方块 id

| 来源 | 宿主没有的名字 | 处理 |
|---|---|---|
| goodGP（生成时用到的） | 15 个：clay、sugar_cane、deepslate、4 种 deepslate 矿、redstone_ore、2 种蘑菇、azure_bluet、allium、blue_orchid、red_tulip、lily_of_the_valley | 步骤 5 先 SUB，后 ADD |
| LiqPG（生成时用到约 100 个名字） | 57 个：deepslate、tuff、coarse_dirt、podzol、red_sand、clay、packed_ice；terracotta ×7；copper_ore、redstone_ore、8 种 deepslate 矿；jungle / acacia / dark_oak / cherry 的原木和树叶（8）；tall_grass、large_fern、9 种花、sunflower、lilac、rose_bush、peony；sugar_cane、melon、lily_pad、vine、seagrass、tall_seagrass、kelp、kelp_plant、2 种蘑菇、pink_petals。另外 LiqPG 已自行把 calcite→diorite、powder_snow→snow_block（`surface.js:10-11`） | 步骤 4a：SUB 到已有宿主方块，先跑通；4b：分批 ADD |
| 铜块（metal.md） | 8 个：copper_block、exposed / weathered / oxidized_copper、4 种 cut_copper | 步骤 10，ADD |

- 上限：88 + 57 + 8（goodGP 的 15 个和 LiqPG 大部分重叠）≈ 155。⚠ **v2 渲染器保留 id 192…255**（`goal-renderapi.ts` `idReserve`，用于树叶派生 id），宿主 id 要保持 < 192，否则 v2 侧要设 `idReserve:false`、关掉 `LEAF_OK`。
- ADD 的贴图：优先用 LiqPG 的程序化绘制函数（`src/textures/bt_*.js`，没有资源版权问题）；资源包里有同名贴图时会自动覆盖。
- ⚠ 新方块的 model 只能用宿主已有的（cube / cross / …）。kelp、vine、双格植物（上下两半）先用 cross 或 SUB，LiqPG 的形状等以后再说（README §4）。
- 渲染侧的 id 表（宿主 id → goodGL id）另见 render.md §3。
