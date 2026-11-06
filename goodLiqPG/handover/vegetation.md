# 植被 · ID 集合 / 生成参数 / 网格与晃动曲线 / 视觉资源行号

> 覆盖草丛、蕨、单格花、高花（双格）、枯灌木、仙人掌、甘蔗、睡莲、海草、海带、藤蔓、蘑菇、粉色花簇、小麦、树苗、树叶，以及它们脚下的草方块。生成逻辑在 `src/world/gen/decorate.js`（与原版 placed feature 对齐的密度表 + 世界空间"虚拟斑块"），网格在 `src/world/mesher.js`，晃动在 `src/render/shaders/common.js:24–39`，纹理在 `src/textures/bt_*.js`。

## 0. ID 集合与材质

方块 ID 是 blocks.js 的注册顺序（当前 228 种），`value = type | meta << 12`。材质 id（`MAT`，blocks.js）决定着色器分支：

| MAT | 名 | 着色器里的含义 |
|---|---|---|
| 0 | DEFAULT | 普通表面：法线贴图、会被雨淋湿 |
| 1 | PLANT | 植被：法线偏向 +Y 0.8、包裹光照 + 背光透射、不淋湿、`wave()` 正常幅度 |
| 2 | LEAVES | 树叶 / 藤蔓：法线偏向 +Y 0.25，晃动幅度 ×0.6 并加竖直分量 |
| 3 | WATER | 水面着色（见 `waterface.md`） |
| 9 | PLANT_TOP | 预留，视为植被，目前没有方块使用 |
| 12 / 13 / 14 | SNOW / SAND / GRASS_BLOCK | 当前只作标记，着色与 DEFAULT 相同 |

| 集合 | ID | 模型 | MAT | tint | 晃动 | XZ 抖动 | 含水 |
|---|---|---|---|---|---|---|---|
| 草丛 | 97 short_grass | cross | 1 | grass | 顶 1.0 | ±0.25，且 Y 下沉 0–0.2 | – |
| | 98 tall_grass | double_plant | 1 | grass | 0 → 0.5 → 1.0 | ±0.25 | – |
| | 99 fern | cross | 1 | grass | 顶 1.0 | ±0.25，Y 下沉 0–0.2 | – |
| | 100 large_fern | double_plant | 1 | grass | 0 → 0.5 → 1.0 | ±0.25 | – |
| 单格花 | 101 dandelion、102 poppy、103 blue_orchid、104 allium、105 azure_bluet、106–109 四色郁金香、110 oxeye_daisy、111 cornflower、112 lily_of_the_valley | cross | 1 | – | 顶 1.0 | ±0.25 | – |
| 高花 | 113 sunflower、114 lilac、115 rose_bush、116 peony | double_plant | 1 | – | 0 → 0.5 → 1.0（向日葵**花盘不晃**） | ±0.25 | – |
| 旱生 | 117 dead_bush | cross | 1 | – | 顶 1.0 | 无 | – |
| | 118 cactus | cactus（三个盒子） | 0 | – | 不晃 | 无 | – |
| 水边 | 119 sugar_cane | cross | 0 | grass | **不晃** | 无 | – |
| 水生 | 124 lily_pad | 平面，离水面 1.5/16 | 1 | 0x208030 固定 | 不晃 | 无（贴图按 `hash3 & 3` 旋转） | – |
| | 126 seagrass | cross | 1 | – | 顶 1.0 | 无 | ✓ |
| | 127 tall_seagrass | double_plant | 1 | – | 0 → 0.5 → 1.0 | ±0.25 | ✓ |
| | 128 kelp（顶）、129 kelp_plant（茎） | cross | 1 | – | 每格各自顶 1.0 | 无 | ✓ |
| 攀附 | 125 vine | 贴面四边形 | 2 | foliage | 整片 1.0（×0.6 + 竖直） | – | – |
| 其他 | 130 brown_mushroom（亮度 1）、131 red_mushroom | cross | 0 | – | 不晃 | 无 | – |
| | 132 pink_petals | 平面 1.5/16 | 0 | – | 不晃 | 无（meta 朝向旋转贴图） | – |
| | 133 wheat | crop（# 字四片） | 1 | – | 顶 1.0 | 无 | – |
| 树苗 | 72 oak、76 spruce、80 birch、84 jungle、88 acacia、92 dark_oak、96 cherry | cross | 1 | – | 顶 1.0 | 无 | – |
| 树叶 | 71 / 75 / 79 / 83 / 87 / 91 / 95（同上顺序） | cube，cutout | 2 | foliage；云杉 0x619961、白桦 0x80a755 固定；樱花无 | **不晃** | – | – |
| 地面 | 11 grass_block（mat 14）、12 dirt、13 coarse_dirt、14 podzol、15 farmland、16 dirt_path、18 sand、19 red_sand | cube / farmland | – | 草方块顶面 + 侧边 overlay 用 grass | – | – | – |

meta 约定（blocks.js 与生成器一致）：双格植物上半 `meta & 1`；藤蔓 `1 = 北、2 = 南、4 = 西、8 = 东`（贴附在本格的哪一面）；pink_petals `amount (0–3) | facing << 2`；wheat `age 0–7`；甘蔗 / 仙人掌 meta 是 0–15 的生长计数器，不影响外观。

## 1. 生成参数（decorate.js）

### 1.1 每列顺序（`vegetation`，:328–402）

```
r, r2 = posRandom(sPlant, wx, 1|2, wz)              每列两个独立 [0,1) 随机数（与生成顺序无关）
水下（topAll > topSolid） → waterPlants（§1.7），本列结束
上方非空气 → 结束
① 甘蔗（§1.5）                     命中即结束
② 沙 / 红沙 / 陶瓦地面 → dryPlants（§1.6），结束
③ 地面不是 grass/dirt/podzol/coarse_dirt → 结束
④ 南瓜：草方块、非沙漠、0.1 < 温度 < 1.5，patch(S64, p0.04, R5, 盐31)，r < v·0.35
   丛林 / 稀疏丛林西瓜：patch(48, 0.15, 5, 32)，r < v·0.4
⑤ 蘑菇：dark_forest 0.012 / mushroom_fields 0.06 / 两种原始针叶林、swamp、taiga 0.006，判 r2；褐 60% 红 40%
⑥ 花（§1.4），返回负 id 表示双格
⑦ 草与蕨（§1.3）
```

**虚拟斑块** `patch(wx, wz, S, p, R, salt, Rvar)`（:212–228）：把世界切成边长 S 的格子，每格以概率 p 放一个随机中心，半径 `R·(1 ± Rvar)`；返回邻近 3×3 格里最大的 `1 − d/r`（0…1，中心最高）。放置条件一律写成 `r < 斑块值 × 系数`，所以斑块中心最密、边缘渐稀，而且跨区块无缝。

### 1.2 草的地面条件

`PLANT_GROUND = {grass_block, dirt, podzol, coarse_dirt}`（:15–16）；树要求 `GROUND`（同一集合）或林地雪坡上的 snow_block。

### 1.3 草与蕨密度（`GRASSD`，:167–189）

元组 `[short_grass, tall_grass, fern, large_fern, 成丛高草]`，再乘调制 `m = max(0, 0.6 + 1.3·patchNoise(wx, wz))`。判定顺序是 tall_grass → large_fern → fern → short_grass，累加区间，比较 r2。

| 群系 | short | tall | fern | large_fern | 成丛高草 |
|---|---|---|---|---|---|
| plains、sunflower_plains | 0.38 | 0.004 | 0 | 0 | ✓ |
| forest、birch_forest、old_growth_birch_forest | 0.07 | 0.004 | 0 | 0 | – |
| flower_forest | 0.05 | 0.004 | 0 | 0 | – |
| dark_forest | 0.065 | 0.004 | 0 | 0 | – |
| taiga | 0.04 | 0 | 0.15 | 0.015 | – |
| snowy_taiga | 0.01 | 0 | 0.05 | 0.005 | – |
| old_growth_pine/spruce_taiga | 0.04 | 0 | 0.16 | 0.04 | – |
| snowy_plains、ice_spikes | 0.01 | 0 | 0 | 0 | – |
| jungle / sparse_jungle | 0.45 / 0.40 | 0 | 0.15 / 0.13 | 0.01 | – |
| savanna、savanna_plateau | 0.6 | 0.02 | 0 | 0 | ✓ |
| windswept_savanna | 0.35 | 0.02 | 0 | 0 | ✓ |
| windswept_hills、windswept_forest | 0.15 | 0.003 | 0 | 0 | – |
| windswept_gravelly_hills | 0.08 | 0 | 0 | 0 | – |
| meadow | 0.3 | 0.17 | 0 | 0 | – |
| cherry_grove | 0.25 | 0.015 | 0 | 0 | ✓ |
| swamp | 0.15 | 0 | 0 | 0 | – |
| wooded_badlands | 0.06 | 0 | 0 | 0 | – |
| river、frozen_river | 0.05 | 0 | 0 | 0 | – |
| badlands、eroded_badlands | 0.02 | 0 | 0 | 0 | – |

成丛高草（第 5 位为 1 的群系）：先判 `patch(40, 0.3, 6, 盐61)`，`r < v·0.45` 直接放 tall_grass。这是原版 `patch_tall_grass` 那种稀疏但很密的一簇簇。双格植物要求上面第二格也是空气。

### 1.4 花（`flower`，:414–475）

| 群系 | 规则 |
|---|---|
| sunflower_plains | 先 `patch(20, 0.6, 7, 41)`，`r < v·0.7` → 向日葵（双格） |
| plains、sunflower_plains | `patch(40, 0.2, 6, 42)`，`r < v·0.5`；`flowerNoise(0.3·xz) < −0.55` → 郁金香四色之一；否则 `r2 < 0.333` → 虞美人 / 蓝花美耳草 / 滨菊 / 矢车菊；其余蒲公英 |
| flower_forest | `p = 0.16·max(0, 0.6 + 1.5·patchNoise)`，按 `flowerNoise(0.35·xz)` 在 11 种花里取下标，再加 `(r2 − 0.5)·1.5` 抖动 ⇒ 成片同色、交界处混色 |
| forest、两种白桦林、dark_forest | `patch(40, 0.18, 5, 43)`，`r < v·0.35`；非白桦林且斑块哈希 `&3 == 0` → 高花（丁香 / 玫瑰丛 / 牡丹）；forest 且 `&7 == 1` → 铃兰；其余蒲公英、虞美人各半 |
| meadow | `p = 0.16·max(0, 0.5 + 1.4·patchNoise)`；`div = 1 + ⌊(flowerNoise(0.05) + 1)·1.5⌋`；按 `flowerNoise(0.4·xz, y = 7)` 在 `[高草, 绒球葱, 虞美人, 蓝花美耳草, 蒲公英, 矢车菊, 滨菊, 草丛]` 里取 |
| cherry_grove | `patch(14, 0.85, 7, 44)`，`r < v·0.8` → pink_petals，数量 `⌊r2·4⌋`，朝向 `⌊posRandom(…,3,…)·4⌋` |
| swamp | `patch(32, 0.3, 5, 45)`，`r < v·0.3` → 兰花 |
| 针叶林类、热带草原、丛林、风袭类、河流、雪原 | `patch(48, 0.12, 5, 46)`，`r < v·0.3` → 蒲公英 60% / 虞美人 |

### 1.5 甘蔗（:345–354）

- 条件：地面 ∈ PLANT_GROUND ∪ {sand, red_sand}；非 frozen_river；群系温度 ≥ 0.15；`62 ≤ y ≤ 64`；`nextToWater`（四邻同高度有水）。
- 概率：`p = 0.3`（沙漠、沼泽）或 0.16；`r < p · patch(12, 0.7, 7, 21) · 2`。
- 高度：`2 + ⌊r2²·3⌋` ∈ {2, 3, 4}，r2 平方让 2 格最常见。
- ⚠ `nextToWater`（:404–412）只看**本区块内**的四邻：块边一列旁边的水若在邻块，就判定为不临水，所以块边上永远长不出甘蔗。

### 1.6 旱生（`dryPlants`，:477–495）

| 植物 | 群系 | 概率 | 其他条件 |
|---|---|---|---|
| 仙人掌 | desert 0.006，三种恶地 0.002（判 r） | 高 `1 + ⌊r2²·3⌋` ∈ {1, 2, 3} | 地面 sand / red_sand；`1 ≤ x, z ≤ 14`（不贴块边）；每一格四邻都必须是空气，否则截断 |
| 枯灌木 | desert 0.004，恶地 0.02（判 r2） | – | 本列没放仙人掌时才判；沙滩类群系什么都不放 |

### 1.7 水生（`waterPlants`，:497–533）

| 植物 | 条件 | 参数 |
|---|---|---|
| 睡莲 | swamp，水深 ≤ 3，水面上方为空 | `patch(16, 0.6, 6, 51)`，`r2 < v·0.35` |
| 海带 | 海洋（非冻结、非 warm），水深 ≥ 4，底部实心且非冰 | `kelpNoise > 0.1` 且 `r < (kn − 0.1)·0.6`；高 `1 + ⌊r2·10⌋` 段茎（到水面截止），最上一格 kelp |
| 海草 | 判 r：暖 / 温海 0.31，冷海 0.14，其他海 0.19，河流 0.19，沼泽 0.25，其余 0.1 | 水深 ≥ 2 且 `r2 < tallP` → 高海草；`tallP` = 深海 0.8，海洋 0.3，其余 0.4 |

冻结海洋（frozen_ocean、deep_frozen_ocean）直接返回，**什么都不长**；frozen_river 不长海带，但照常按河流概率 0.19 长海草；warm_ocean 不长海带。

### 1.8 藤蔓（trees.js:38–78）

只在两种树上生成（`opts.vines`）：

- `swampOak`：橡木，基高 5 + rand(0..3)，叶冠半径 3；
- `jungleTree`：丛林木，基高 4 + rand(0..8)，另加树干藤蔓。

| 函数 | 规则 |
|---|---|
| `leafVines(…, p = 0.25)` | 叶冠包围盒内每片叶子的四个水平侧面，各以 0.25 概率在外侧空气格挂藤，向下延伸到遇到非空气或满 4 格；meta 指向背后的叶子 |
| `trunkVines` | 丛林木树干每格每个侧面以 2/3 概率挂一格（`rng.nextInt(3) > 0`） |

`Ctx.vine`（decorate.js:51–55）只写入空气；越出本块的藤蔓进入 `outside`（不覆盖已有方块）。

### 1.9 运行时生长（gameplay.js）

| 方块 | 规则 | 位置 |
|---|---|---|
| grass_block | 上方不透明 → 变 dirt；上方光照 ≥ 9 时尝试 4 次，向 (±1, −3…+1, ±1) 范围内上方不透明度为 0、不是流体、天空光 ≥ 4 的 dirt 蔓延 | :122–132 |
| sugar_cane / cactus | 上方为空且自身柱高 < 3：meta 计数到 15 时往上长一格，否则 meta+1（随机 tick：每段每 tick 3 个随机格） | :149–156 |
| wheat | 未成熟且光照 ≥ 9：耕地湿润 `1/(⌊25/4⌋+1)`，干燥 `1/(⌊25/2⌋+1)` 的概率 +1 龄 | :141–148 |
| 树苗 | 光照 ≥ 9，1/7 概率：阶段 0 → 1，阶段 1 → `growTree`（简化树形） | :171–176 |
| 树叶 | 非持久且 6 格内无原木 → 自然破坏并掉落 | :177–181 |
| 骨粉 | 草方块上撒 64 次随机游走：85% short_grass、8% dandelion、7% poppy；草丛 → 高草；树苗 45% 直接长成 | :241–258 |

## 2. 网格几何（mesher.js）

| 模型 | 实现 | 行号 |
|---|---|---|
| cross | 两片对角面，从 (0.05, 0.05) 到 (0.95, 0.95)（等价原版 0.8/16 内缩 + rescale）；每片正反各一 → 共 4 个四边形；法线写 +Y（植被不受面朝向影响，原版 `shade:false` 的效果） | :604–630 |
| 抖动 | `hash3(世界x, 0, 世界z)`：x、z 各取 4 位 → `(h/15 − 0.5)·0.5`，即 ±0.25 格；草丛 / 蕨再取 4 位，Y 下沉 0–0.2 格。双格植物上半用同一个哈希，保证与下半对齐 | :606–616，hash3 :227–231 |
| double_plant | 下半用底部贴图、上半用 `texTop`；晃动权重下半 (0, 128)、上半 (128, 255)，接缝处连续 | :436–448 |
| 向日葵花盘 | 上半额外两个四边形（正面朝东，`sunflower_front` / `sunflower_back`），x 从 0.5 斜到 0.62，倾角约 8°；**sway = null** | :440–446 |
| cactus | 顶 / 底面整格；南北面 z 内缩 1/16、东西面 x 内缩 1/16，各自整张贴图；不剔除侧面 | :487–493 |
| vine | 按 meta 位在对应面内侧 0.8/16 处各放一片双面四边形，四个顶点 sway 全是 255 | :512–521 |
| lily_pad | y = 1.5/16 双面平面，uv 按 `hash3 & 3` 旋转 | :503–511 |
| crop | x = 4/16、12/16 和 z = 4/16、12/16 四片，下沉 1/16，`wheat_stage{age}` | :522–531 |
| petals | y = 1.5/16 单面平面，按 facing 旋转 | :532–540 |
| 含水植物 | 先按满格源头水调用 `meshFluid`，再画植物本身（:431） | :431 |

光照：十字类走 `quad()`（:193–203），取本格光照，与上方格比较（天空光取上方 −1、方块光取上方 −1 的较大值），**不做 AO**（flags 带 NOAO）。树叶走整方块路径，有 AO、按面剔除，但**叶与叶之间不剔除**（原版 fancy 叶）。

## 3. 晃动曲线（common.js:24–39）

```glsl
vec3 wave(vec3 worldPos, float mat, float sway){        // sway = 顶点 a_color.a（0…1）
  if (sway <= 0.0) return vec3(0.0);
  vec3 p = mod(worldPos, 1024.0);                       // 晃动前的顶点世界坐标
  float strength = (0.04 + 0.08 * u_wind) * sway;       // u_wind = 天气 wind（weather.md §2.4）
  if (mat == LEAVES) strength *= 0.6;
  off.x = sin(1.7t + 0.6px + 0.3pz)·0.6 + sin(2.9t + 1.3pz)·0.4;
  off.z = sin(1.4t + 0.6pz + 0.4px)·0.6 + cos(3.1t + 1.1px)·0.4;
  off.y = (mat == LEAVES) ? sin(2.0t + px + pz)·0.3 : 0.0;
  return off * strength;
}
```

| 量 | 值 |
|---|---|
| 时间周期 | x：3.70 s + 2.17 s；z：4.49 s + 2.03 s；藤蔓竖直 3.14 s（t = 游戏运行秒数，暂停时停） |
| 空间波长 | 主项 ≈ 10.5 格（0.6/格），次项 4.8 格（1.3/格）、5.7 格（1.1/格）⇒ 相邻植株相位接近，形成成片的"风浪" |
| 单轴峰值 | `|off.x|, |off.z| ≤ 1.0` ⇒ 顶点最大水平位移 ≈ 1.41·strength，典型 0.6·strength |
| 作用位置 | 原版地形 VS（terrain.js:21）、阴影 VS（:78）、光影 G-buffer VS（:166）⇒ **影子跟着植物一起晃** |

晃动强度随天气（sway = 1 的顶点）：

| 天气 | wind | 草 / 花顶端 | 藤蔓（×0.6） | 1 格高草叶的倾角 |
|---|---|---|---|---|
| fog | 0.10 | 0.048 | 0.029 | ≈ 2.7° |
| clear | 0.25 | 0.060 | 0.036 | ≈ 3.4° |
| cloudy | 0.45 | 0.076 | 0.046 | ≈ 4.3° |
| overcast | 0.50 | 0.080 | 0.048 | ≈ 4.6° |
| snow | 0.60 | 0.088 | 0.053 | ≈ 5.0° |
| rain | 0.70 | 0.096 | 0.058 | ≈ 5.5° |
| thunder | 1.00 | 0.120 | 0.072 | ≈ 6.8° |

天气切换时 wind 每 tick 变化 0.002，从晴到雷暴约 19 秒，所以风是慢慢起来的。

每顶点权重（沿高度的"曲线"，由网格器写入）：

| 植物 | 底 | 中（格界） | 顶 | 结果 |
|---|---|---|---|---|
| 单格十字（草、花、枯灌木、海草、树苗） | 0 | – | 1.0 | 以底为轴摆动 |
| 双格（高草、大蕨、高花、高海草） | 0 | 0.502 | 1.0 | 两格连成一根，弯曲连续 |
| 海带 / 海带茎 | 每格 0 | – | 每格 1.0 | ⚠ 每格各自以自己底部为轴，整株呈锯齿状而不是一根柔软的带子 |
| 小麦 | 0 | – | 1.0 | 同单格 |
| 藤蔓 | 1.0 | 1.0 | 1.0 | 整片平移 + 竖直起伏 |
| 树叶方块、甘蔗、仙人掌、蘑菇、睡莲、粉色花簇 | 0 | 0 | 0 | 静止 |
| 向日葵花盘 | 0 | 0 | 0 | ⚠ 茎在晃、花盘不动，风大时（0.12 格）能看出分离 |

## 4. 着色（光影模式，deferred.js）

| 项 | 值 | 位置 |
|---|---|---|
| 植被判定 | `mat ∈ {1, 2, 9}` | :60, :137 |
| 法线 | 不用法线贴图；几何法线向 +Y 弯：PLANT 0.8、LEAVES 0.25 | :66–73 |
| 漫反射 | 包裹 `clamp((N·L + 0.5)/1.5)·0.85` + 背光 `pow(max(−V·L, 0), 4)·0.8·max(sss, 0.5)` | :169–172 |
| 阴影偏移 | 植被用 +Y 做法线偏移；植被正反面都查阴影 | :156 |
| 雨 | 植被不淋湿（`wet = 0`） | :142 |
| 材质参数 | blocktex.js 注册时的 `smooth` / `sss`：草丛蕨 0.25 / 0.75，花与高花 0.3 / 0.7，树叶 0.3 / 0.85，树苗 0.25 / 0.75，枯灌木 0.15 / 0.5，仙人掌 0.35 / 0.3，甘蔗 0.35 / 0.6，睡莲 0.5 / 0.6，藤蔓 0.3 / 0.8，蘑菇 0.3–0.4 / 0.4 | blocktex.js:94–142 |

注意：仙人掌、甘蔗、蘑菇是 mat 0，`sss` 写进了高光贴图但光照不会读；它们会被淋湿，且因为十字面法线朝上，还会出水洼高光（`weather.md` §3.1）。

tint：网格器对中心块每列取 5×5 范围的群系草色 / 叶色 / 水色平均（mesher.js:368–383），写到顶点色里；云杉 / 白桦叶用固定色（:573–574）；睡莲固定 0x208030（:509；物品图标用 0x71c35c）。

## 5. 视觉资源行号

纹理是 16×16 程序绘制。灰度、需要 tint 的：草方块顶面、侧边 overlay、草丛、高草、蕨、大蕨、甘蔗、藤蔓、睡莲、橡 / 丛林 / 金合欢 / 深色橡 / 云杉 / 白桦叶。

| 资源 | 纹理名 | 绘制函数（文件:行） | 注册（blocktex.js） | 方块定义（blocks.js） | 网格（mesher.js） |
|---|---|---|---|---|---|
| 叶片笔刷 | – | `blade` bt_plants.js:13–20；灰阶 `TUFT_G` :21 | – | – | – |
| 草丛 | short_grass | `shortGrass` bt_plants.js:22–27 | :111 | :140 | cross :604–630 |
| 高草 | tall_grass_top / _bottom | `tallGrass(top)` bt_plants.js:28–38 | :112–113 | :141 | double :436–448 |
| 蕨 | fern | `frond` :40–55，`FERN_G` :56，`fern` :57–61 | :114 | :142 | cross |
| 大蕨 | large_fern_top / _bottom | `largeFern` bt_plants.js:62–67 | :115–116 | :143 | double |
| 单格花 | dandelion 等 12 种 | `FLOWERS` bt_plants.js:72–113（蒲公英 73、虞美人 78、兰花 83、绒球葱 88、蓝花美耳草 93、滨菊 98、矢车菊 103、铃兰 108 各约 5 行）；`tulip` :114–120，四色 :121–124；花茎调色板 `STEM` :70 | :117 | :144–145 | cross |
| 高花 | lilac / rose_bush / peony _top / _bottom | 叶调色板 `LEAF` :127，`BUSH_BOTTOM` :128–132，`bushBottom` :133，`bushTop` :134，`DOUBLE` :135–154（丁香顶 136、玫瑰丛顶 141、牡丹顶 147） | :119 | :147–149 | double |
| 向日葵 | sunflower_front / back / top / bottom | `sunflower(part)` bt_plants.js:155–176 | :118 | :146 | double + 花盘 :440–446 |
| 枯灌木 | dead_bush | `deadBush` bt_plants.js:179–185 | :120 | :150 | cross |
| 仙人掌 | cactus_top / side / bottom | 调色板 `CAC` :186，`cactusSide` :187–195，`cactusTop(bottom)` :196–205 | :121–123 | :151 | :487–493 |
| 甘蔗 | sugar_cane | `sugarCane` bt_plants.js:206–217 | :124 | :152 | cross |
| 睡莲 | lily_pad | `lilyPad` bt_plants.js:272–283 | :131 | :157 | :503–511 |
| 藤蔓 | vine | `line` :284–289，`vine` :290–304 | :132 | :158 | :512–521 |
| 海草 | seagrass、tall_seagrass_top / _bottom | 调色板 `SEA` :305，`seagrass(kind)` :306–313 | :133–135 | :159–160 | cross / double |
| 海带 | kelp、kelp_plant | `kelp(plant)` bt_plants.js:314–326 | :136–137 | :161–162 | cross |
| 蘑菇 | brown / red_mushroom | `mushroom(red)` bt_plants.js:327–338 | :138–139 | :163–164 | cross |
| 粉色花簇 | pink_petals（_stem 未使用） | `pinkPetals(stem)` bt_plants.js:339–350 | :140–141 | :165 | :532–540 |
| 小麦 | wheat_stage0–7 | `wheat(stage)` bt_plants.js:353–378 | :142 | :166 | :522–531 |
| 草方块 | grass_block_top / _side / _side_overlay / _snow | `GRASS_FRINGE` bt_terrain.js:128（雪 :129、灰化土 :130）、`GRASS_GRAYS` :132、`grassTop` :133–137、`grassOverlay` :138–151、`withFringe` :152–161、`fringe` :162–170、`grassSnow` :171–173；泥土 `dirtImg` :101–113 | :37–40 | :73 | cube :562–601（overlay / 积雪侧面 :567–598） |
| 树叶 | `{wood}_leaves` | `LEAF_SHAPES` bt_wood.js:105、`LEAF_CFG`（每种叶的灰阶、叶片数、镂空率）:113–121、`BIG_LEAF` :122、`leaves(w)` :123–145 | :94 | :132–135 | cube |
| 树苗 | `{wood}_sapling` | `SAP`（7 种像素图 + 调色板）bt_wood.js:148–296，`sapling` :297 | :95 | :136 | cross |

## 6. 已知问题（读码确认，未修）

- 海带每格独立摆动（§3），整株看起来是折线。
- 向日葵花盘不随茎晃动（§3）。
- 甘蔗 mat 0：不晃、会出水洼高光（§4）。
- 块边一列不长甘蔗（§1.5）。
- 树叶方块不晃，只有藤蔓在动；树冠在大风天显得过于静止。改法：在 `meshCube` 里给 LEAVES 的顶点写 sway（例如上沿 0.3、下沿 0.15），`wave()` 已经有 LEAVES 分支（×0.6 + 竖直分量），不用改着色器。
- 玩家放置的树叶不是持久的（meta 0），离开原木会腐烂。
