# 火焰 / 熔岩 / 灯，以及有特殊光效的方块（铜、金属、玻璃、冰…）

> 光的三层：① 方块光等级（blocks.js 的 `light`，worker 里泛洪，写进顶点）；② 着色器里的自发光（高光贴图 A 通道 + 按材质的兜底规则）；③ 金属 / 光滑度 / F0（高光贴图 R、G 通道），决定高光和天空反射。原版模式只有 ①（光照图）以及对熔岩、火、传送门的全亮处理；光影模式三层都有。

## 0. 一页管线

```
纹理绘制 bt_*.js：每像素 c(颜色) h(高度) e(自发光) [sm 光滑度] [f0]      调色板写法 { ch: [hex, 高度, 自发光] }
blocktex.js add(name, img, { smooth, f0, emissive, frameTime })        → bt_core.finish（:183–200）合并为 Tex
atlas.js       albedo / normal(由 h 求) / specular RGBA = (smooth, f0, sss, emissive)，三个 2D 纹理数组
blocks.js      light（0–15）、mat（材质 id）、layer
light.js       每次网格化：48×48 区域方块光泛洪，每格衰减 max(1, 不透明度)
mesher.js      顶点：天空光 / 方块光 ×17，AO，mat
着色：
  原版  terrain.js:48   mat 4 熔岩 / 10 火 / 11 传送门 → 光照图强制为 1（全亮）；其余发光方块靠自身 15 级方块光
         renderer.js:117–143  LightTexture 移植：方块光暖色曲线 + 每 tick 随机闪烁 flicker
  光影  deferred.js:189–193  自发光；:160–187 漫反射 / 高光 / 金属 / 天空反射；方块光颜色 u_torchColor = (1.0, 0.52, 0.2)
```

## 1. 发光方块一览

| 方块（ID） | 光级 | 模型 / 层 | mat | 纹理与自发光来源 | 绘制函数 | 注册 blocktex.js | 定义 blocks.js | 网格 mesher.js |
|---|---|---|---|---|---|---|---|---|
| lava 30 | 15 | fluid / solid 层 | 4 LAVA | `lava_still` 32 帧 3 tick/帧、`lava_flow` 32 帧 2 tick/帧，emissive 标量 1 | bt_anim.js：调色板 `LAVA` :70、`LAVA_W` :71、`lavaE` :72，`lavaStill` :73–77，`lavaFlow` :78–88；公用 `loopNoise` :8–25、`quantFrames` :26–33 | :183–184 | :92 | `meshFluid` :267–334（进 OUT[0] 不透明层） |
| fire 178 | 15 | fire / cutout | 10 FIRE | `fire_0` 32 帧 1 tick/帧，emissive 1 | bt_anim.js：`FIRE` :99，`fire` :100–119 | :186 | :199 | :548–561 |
| torch 169 | 14 | torch / cutout | 5 EMISSIVE | `torch`：只有火焰 2×2 像素 e = 1 | bt_built.js `torch(red)` :398–406 | :168 | :190 | `meshTorch` :735–770 |
| redstone_torch 170 | 7 | torch / cutout | 5 | 同上，红色火焰 e = 1，杆顶两像素 e = 0.4；带 `power`（给铁轨供电） | 同上（`red = true`） | :169 | :191 | 同上 |
| lantern 168 | 15 | lantern / cutout | 5（提手用 7 METAL） | `lantern`：内芯调色板 Y / W 的 e = 1，O 的 e = 0.9，铁框 0 | bt_built.js `lantern` :374–396（调色板 :393） | :167 | :189 | `meshLantern` :772–791 |
| glowstone 166 | 15 | cube | 5 | 每像素 `e = 0.45 + 0.11·亮度档`（:333） | bt_built.js `glowstone` :323–336 | :165 | :187 | 整方块 |
| sea_lantern 167 | 15 | cube | 5 | 5 帧 5 tick/帧，emissive 标量 0.9 | bt_built.js `seaLanternFrames` :338–372 | :166 | :188 | 整方块 |
| jack_o_lantern 122 | 15 | cube（朝向） | 0 | 正面贴图：脸部调色板 `o` 的 e = 1，并按上下邻接做内渐变 | bt_plants.js `carvedPumpkin(lit)` :238–254 | :128 | :155 | 整方块；`FRONT_TEX` 按 meta 朝向 |
| lit_furnace 163 | 13 | cube（朝向） | 0 | `furnace_front_on`：火口调色板 f / y / Y / W 的 e = 0.8–1 | bt_built.js `furnaceFront(lit)` :266–289（调色板 :285） | :159 | :184 | 整方块 |
| nether_portal 177 | 11 | portal / translucent | 11 PORTAL | 32 帧，emissive 标量 0.8 | bt_anim.js：`PORTAL` :91、`PORTAL_W` :92，`netherPortal` :93–96 | :185 | :198 | :541–547（4/16 厚，按轴向） |
| brown_mushroom 130 | 1 | cross | 0 | 无自发光像素 | bt_plants.js `mushroom` :327–338 | :138 | :163 | cross |

### 1.1 着色规则

| 情形 | 原版模式 | 光影模式（deferred.js:189–193） |
|---|---|---|
| mat 4 熔岩 | 光照图强制 1（terrain.js:48） | `em = max(em, 1)`，`color += albedo·em·6` |
| mat 10 火 / 11 传送门 | 同上 | `em = 1`，`color += albedo·8`（传送门走半透明 pass，water.js:130：`lit = alb·6`） |
| mat 5 EMISSIVE | 正常光照图（本格 15 级方块光） | 用贴图 e；e = 0 时按亮度兜底 `smoothstep(0.55, 0.9, luma(albedo))` |
| 其他 mat、但贴图有 e（南瓜灯、亮熔炉） | 正常光照图 | 贴图 e × 8 |

光影模式的自发光乘的是线性 albedo（`srgbToLinear`），然后进泛光（`u_bloomStrength = 0.055 + 0.02·rain`）和自动曝光。所以夜里灯笼、南瓜灯周围会自然起光晕；白天曝光高，光晕就弱。

### 1.2 方块光的颜色与衰减

- 泛洪（light.js:64–88，`flood` / `spread`）：从 `T_LIGHT[type]` 起，每格减 `max(1, lightOpacity)`；不透明方块（`lightOpacity = 15`）挡光。**半砖、楼梯、地毯的 `lightOpacity = 0`，完全透光**（原版半砖会按形状挡光）。
- 光影模式：`torch = u_torchColor · (bl⁴·3.2 + bl^1.8·0.12) · mix(1, ao², 0.6)`，bl = 方块光 / 15（deferred.js:180）。四次方项让光圈边缘落得很快，1.8 次方的小项保留远处的暖色余光。**所有光源同色**，红石火把也是暖橙色光，只是等级低。
- 原版模式：光照图 16×16 按 1.20 的 `LightTexture.updateLightTexture` 计算（renderer.js:117–143）：方块光的 R、G、B 分别是 `f9`、`f9·((0.6f9 + 0.4)·0.6 + 0.4)`、`f9·(0.6f9² + 0.4)`，呈暖色；`flicker` 每 tick 做一次随机游走 `±rand·rand·0.1`，再乘 0.9（game.js:138–139），整张图跟着轻微闪动。

### 1.3 粒子与玩法

| 方块 | 粒子 | 玩法 |
|---|---|---|
| lit_furnace | 每 tick 10% 概率在前方冒烟和火苗（gameplay.js:68–73） | 燃烧时与 furnace 互换方块，光级 13 |
| fire | 无 | 随机 tick：30% 熄灭，否则以 20% 概率点燃六邻的可燃方块；下雨露天熄灭（gameplay.js:157–165）；需要下方实心或地狱岩（world.js `canSurvive`）；踩入着火 |
| lava | 无（`particles.js` 里有 `'lava'` 类型但没有调用） | 流体 tick 30，每格降 2，坡度搜索 2；源头遇水 → 黑曜石，流动遇水 → 圆石，水流到熔岩上 → 石头（world.js `fluidTick` / `spreadFluid`）；物品掉进去烧毁 |
| torch / redstone_torch | **无火焰和烟雾粒子**（原版有） | meta 0 立在地上，1–4 贴墙朝北 / 南 / 西 / 东；贴墙时模型绕底部倾斜 22.5° 并移向墙面（mesher.js:740–758） |
| lantern | 无 | 从底面放置时 meta 1（悬挂），模型上移 1/16，提手拉长到顶（mesher.js:772–791） |
| TNT 实体 | 引信燃烧时每 tick 冒烟（entity/items.js:119），闪白用 `u_colorMul = 2.2`（worldentities.js） | 爆炸算法见 interaction.js `explode` |

## 2. 特殊光效（材质）方块

规则（deferred.js:160–187）：

```
metal   = f0 > 0.9                       ⇒ F0 = albedo，漫反射 kd = 0，环境反射权重 1.0
非金属  F0 = max(0.02, f0)，kd = 1 − F·0.5，环境反射权重 0.6
smoothness > 0.3 或金属 ⇒ 加天空 LUT 反射 × smoothstep(0.7, 1, skyL)（只在露天）× smoothstep(0.3, 1, s) × ao²
太阳高光：GGX，roughness = 1 − smoothness（下限 0.03），α = roughness²
```

材质值全部来自 blocktex.js 的注册参数（逐像素的 sm / f0 优先）。表里"金属"指 f0 = 1。

| 方块（ID） | smooth | f0 | 效果 | 绘制函数 | 注册 blocktex.js |
|---|---|---|---|---|---|
| copper_block 61 / cut_copper 65 | 0.72 | 1（金属） | 铜色金属高光，反射天空 | bt_built.js：调色板 `COPPER` :217–222，`copperBlock(kind)` :223–233，`cutCopper(kind)` :234–242（8×8 切缝，亮边 ×1.14、暗边 ×0.72） | :82–87 |
| exposed_copper 62 / exposed_cut_copper 66 | 0.60 | 1（金属） | 同上，偏暗 | 同上 | 同上 |
| weathered_copper 63 / weathered_cut_copper 67 | 0.40 | 0.5 | ⚠ 不是金属，却是 F0 = 0.5 的电介质，掠射角反射很强，偏"漆面" | 同上 | 同上 |
| oxidized_copper 64 / oxidized_cut_copper 68 | 0.25 | 0.06 | 基本是哑光的铜绿 | 同上 | 同上 |
| iron_block 55 | 0.70 | 1 | 金属 | `ironBlock` :175–180（公用 `bevelBlock` :163–174） | :76 |
| gold_block 56 | 0.78 | 1 | 金属 | `goldBlock` :181–185 | :77 |
| diamond_block 57 | 0.85 | 0.17 | 光滑宝石 | `diamondBlock` :186–192 | :78 |
| emerald_block 58 | 0.82 | 0.15 | 光滑宝石 | `emeraldBlock` :193–198 | :79 |
| lapis_block 59 / redstone_block 60 | 0.55 / 0.50 | 0.06 | 半光滑 | `lapisBlock` :199–204、`redstoneBlock` :205–210 | :80–81 |
| 铁 / 金 / 铜矿石的矿粒 | 贴图 | 1（只在矿粒像素） | 石头里的矿点会反光 | bt_terrain.js `ORE_F0` :401，`oreImg` :402–421 | :67–74 |
| glass 142 / glass_pane 143 | 0.95 | 0.04 | cutout 层，透明像素直接丢弃；只有边框像素反射（不是真正的玻璃折射） | bt_built.js `glass` :114–126、`glassPaneTop` :127–131 | :153–154 |
| ice 26 | 0.90 | 0.02 | 半透明 pass：贴图 alpha 混合、轻微折射 `N.xz·0.01`、天空反射 ×F×0.5（water.js:121–139） | bt_terrain.js `iceStreaks` :306–311、`ice` :312–319 | :59 |
| packed_ice 27 | 0.75 | 0.02 | 不透明、光滑 | `packedIce` :320–326 | :60 |
| obsidian 28 | 0.75 | 0.05 | 黑色光滑，能看到天空反射 | `obsidian` :327–340 | :61 |
| polished_granite / diorite / andesite 3 / 5 / 7 | 0.58–0.62 | 0.05 | 磨光石材的柔和高光 | `polished` :28–40，:41–43 | :21–25 |
| water 29 | 0.95 | 0.02 | 独立水面着色（`waterface.md`） | bt_anim.js `waterStill` / `waterFlow` :58–67 | :181–182 |
| iron_bars 180、rail 172 / powered_rail 173、lantern 168 提手 | 0.45 / 0.3 / 0.5 | 0.04 | mat 7 METAL 只是标记，**光影里不会因此变成金属**（判定看 f0） | `ironBars` :466–474；铁轨 :409–438；`lantern` :374–396 | :176、:170–173、:167 |

方块 ID 对照：61–68 依次为 copper_block、exposed_copper、weathered_copper、oxidized_copper、cut_copper、exposed_cut_copper、weathered_cut_copper、oxidized_cut_copper；54–60 依次为 coal_block（smooth 0.35，非金属）、iron、gold、diamond、emerald、lapis、redstone 块。另有 cut_copper_slab / stairs 与 oxidized_cut_copper_slab / stairs（`shapes.md`），沿用对应铜块贴图和材质。可用 `node -e "import('./src/world/blocks.js').then(m=>console.log(m.ID.copper_block))"` 复核。

## 3. 已知问题（读码确认，未修）

- 方块光单一暖色：红石火把、传送门、海晶灯发出的都是同一种橙色光，没有彩色方块光。
- 火把、熔岩没有原版的火焰 / 烟雾 / 熔岩迸溅粒子。
- weathered 铜 f0 = 0.5 不是金属，观感与 exposed 铜（金属）断层明显。
- 半砖、楼梯不挡光（`lightOpacity = 0`）。
- MAT.METAL（7）、MAT.GLASS（6）、MAT.ICE（8）只是标记，延迟光照不按它们分支；效果完全由高光贴图决定。
- 原版模式下 mat 5 的方块（萤石、海晶灯、灯笼、火把）没有全亮，只靠自身 15 级方块光，在白天看起来和普通方块一样亮——这与原版一致。
