# Natural Blocks（创造模式"天然方块"页）· 每个非矿石、非树方块的生成参数与视觉资源

> 范围：`items.js` 里 `category === 'natural'` 的方块共 97 个，去掉矿石（16）和树（原木 / 树叶 / 树苗 21）剩 60 个。其中 31 个植物在 `vegetation.md` 已经按"生成参数 + 资源行号"给过（§1 生成、§5 资源），本文只列指针，不重复；其余 29 个（石材 12、泥土 4、沙砾黏土 4、冰雪 4、下界 2、瓜果 3）在这里补全。分类正则见 items.js:94。

## 0. 地形生成里这些方块从哪来（一页管线）

```
generator.fill               generator.js:179–266   3D 密度 > 0 → stone；y < 8 渐变为 deepslate；y ≤ −60 渐变为 bedrock
                                                     大矿脉：铜脉（y 0–50）夹 granite，铁脉（y −60…−8）夹 tuff
                                                     海平面以下的空腔：y ≤ −55 灌 lava；其余按"含水层"规则灌水 / 留空 / 补石墙
surface.column               surface.js:110–166     按群系把地表 1 + D 层石头换成 grass / dirt / sand / gravel / snow_block / …
                                                     D = ⌊2.75·sn + 3 + 0.25·rand⌋（sn = 地表噪声），约 0–5
carvers.carve                carvers.js             峡谷 + 蠕虫洞（y ≤ −55 灌岩浆，水下按含水层）
ores.place                   ores.js:19–27          团块：dirt / gravel / granite / diorite / andesite / tuff（只替换天然石材）
decorator.decorate           decorate.js            水下沙 / 黏土 / 砂砾圆盘、冰刺、苔石巨砾、树（树下草变泥土）、植被、瓜果
generator.freeze             generator.js:285–305   冷处：水面源头 → ice；不透明顶 / 树叶顶 → 一层 snow
```

## 1. 石材类

| 方块（ID） | 生成参数 | 绘制函数（bt_terrain.js 除注明外） | 注册 blocktex.js | 定义 blocks.js |
|---|---|---|---|---|
| stone 1 | 密度场 `d > 0` 处的默认方块（generator.js:217–218）。地表规则返回 −1 时保留为裸石：stony_peaks 整片、jagged_peaks / snowy_slopes 陡坡、windswept_hills `sn > 1/8.25`、windswept_savanna `sn > 1.75/8.25`、windswept_gravelly_hills `1/8.25 < sn ≤ 2/8.25`（surface.js:168–213）。含水层隔墙也是石头（:255–258） | `stoneImg` :8–13，`speckled` :14–18 | :18–19 | :63 |
| granite 2 | 团块 size 64：y 64–128 均匀、每块 1 次、稀有度 1/6；y 0–60 均匀、每块 2 次（ores.js:21–22）。另：铜矿大矿脉的填充石（y 0–50，generator.js:223–237） | `granite` :19（基于 `speckled`） | :20 | :64 |
| polished_granite 3 | **不生成**（合成：4 花岗岩） | `polished` :28–40，`polished_granite` :41 | :21 | :65 |
| diorite 4 | 团块同花岗岩（ores.js:23–24）。另：stony_peaks 地表用它代替方解石，条件 `calcite` 噪声 ∈ [−0.0125, 0.0125]（surface.js:180） | `diorite` :20–24 | :22 | :66 |
| polished_diorite 5 | **不生成** | `polished_diorite` :42 | :23 | :67 |
| andesite 6 | 团块同花岗岩（ores.js:25–26） | `andesite` :25 | :24 | :68 |
| polished_andesite 7 | **不生成** | `polished_andesite` :43 | :25 | :69 |
| deepslate 8 | y ≤ 0 恒为深板岩；0 < y < 8 以概率 `(8 − y)/8` 渐变（generator.js:219–220，含水层隔墙同规则 :255）；矿石在深板岩里自动换成深板岩变种。带 `axis`（放置时按面旋转），生成时为竖直 | `deepslateImg` :67–78（侧）、`deepslateTop` :79–86（顶） | :26–28 | :70 |
| cobbled_deepslate 9 | **不生成**（挖深板岩掉落） | bt_built.js：`CDEEP_PTS` :28，`cobbledDeepslate` :29（共用 `cobbleBase` :10–26） | :147 | :71 |
| tuff 10 | 团块 size 64，y −64…0 均匀、每块 2 次（ores.js:27）；铁矿大矿脉的填充石（y −60…−8，generator.js:224–237） | `tuff` :87–98 | :29 | :72 |
| bedrock 17 | y = −64 恒为基岩；y = −63、−62、−61、−60 的概率依次 0.8、0.6、0.4、0.2（generator.js:221，与原版一致） | `bedrock` :210–214 | :32 | :79 |
| obsidian 28 | **不生成**。运行时岩浆源头遇水变黑曜石（world.js `fluidTick`） | `obsidian` :327–340 | :61 | :90 |

## 2. 泥土类

| 方块（ID） | 生成参数 | 绘制函数 | 注册 | 定义 |
|---|---|---|---|---|
| grass_block 11 | 地表首层且露天（`y ≥ 水面`）的默认方块（surface.js `top` 默认分支 :188）。按群系的例外：windswept_hills `sn ≤ 1/8.25`；windswept_savanna `sn ≤ −0.5/8.25`；windswept_gravelly_hills `−1/8.25 < sn ≤ 1/8.25`；两种原始针叶林 `sn ≤ −0.95/8.25`；wooded_badlands 高处（y ≥ 97 + 2D）不在粗泥条带时。树干正下方的草会变泥土（decorate.js `Ctx.dirt` :95）。运行时会蔓延（`vegetation.md` §1.9） | bt_terrain.js：`GRASS_FRINGE` :128，`GRASS_GRAYS` :132，`grassTop` :133–137，`grassOverlay` :138–151，`withFringe` :152–161，`fringe` :162–170，`grassSnow` :171–173；侧面底图 `dirtImg` :101–113 | :37–40 | :73 |
| dirt 12 | 草下 `1 + D` 层（`under` 默认分支 :212）；浅水底（水下 6 + D 以内）的首层也是泥土，再由圆盘改成沙 / 黏土 / 砂砾；团块 size 33，y 0–160 均匀、每块 7 次（ores.js:19）；树下草变泥土 | `dirtImg` :101–113 | :35–36 | :74 |
| coarse_dirt 13 | 原始针叶林 `sn > 1.75/8.25`；windswept_savanna `−0.5/8.25 < sn ≤ 1.75/8.25`；wooded_badlands y ≥ 97 + 2D 且 sn 落在 [−0.909, −0.545]、[−0.182, 0.182]、[0.545, 0.909] 三条带（surface.js:137–139, 184, 186） | `coarseDirt` :114–126 | :41 | :75 |
| podzol 14 | 原始针叶林 `−0.95/8.25 < sn ≤ 1.75/8.25`（surface.js:186）；巨型云杉 / 松树周围：以树干为中心 6×6（dx、dz ∈ −2…3）、`|dx − 0.5| + |dz − 0.5| ≤ 4`、每格 4/5 概率，在 y + 2 … y − 3 里找第一个地面方块换成灰化土（trees.js:180–188，由 `megaSpruce` :204 调用） | `podzolTop` :174–178，`podzolSide` :179–181（`PODZOL_FRINGE` :130） | :42–43 | :76 |

## 3. 沙、砂砾、黏土

| 方块（ID） | 生成参数 | 绘制函数 | 注册 | 定义 |
|---|---|---|---|---|
| sand 18 | beach、snowy_beach、desert、warm_ocean 的地表与 `1 + D` 下层（surface.js:183, 209）；沙下面再按 `secondary` 噪声垫砂岩（沙漠最多 30 层，:156）；warm / lukewarm 海洋的深水底（:159）；水下沙圆盘 `patch(S10, p0.5, R4·wob, 盐12, Rvar0.5)`（decorate.js:317）。`gravity: true` | `sandImg` :217–221，`SAND_PAL` :222，`sand` :224 | :48 | :80 |
| red_sand 19 | 恶地：露天地表且 `y + sd < 74 + D` 时（surface.js:143）。`gravity: true` | `RED_SAND_PAL` :223，`redSand` :225 | :49 | :81 |
| gravel 20 | 非暖海、河流等的深水底首层（不浅、非沙质，surface.js:160）；恶地深水底（:146）；stony_shore 地表 `gravel` 噪声 ∈ [−0.05, 0.05]；windswept_gravelly_hills `sn > 2/8.25` 或 `sn ≤ −1/8.25`；团块 size 33，y −64…320 均匀、每块 14 次（ores.js:20）；水下砂砾圆盘 `patch(16, 0.5, 3.5·wob, 13, 0.43)`（decorate.js:318）。`gravity: true` | `gravel` :227–250 | :50 | :82 |
| clay 21 | 只在水下圆盘：`patch(16, 0.4, 2.5·wob, 11, 0.2)`，`wob = 0.8 + 0.4·posRandom`，替换水底最上 2 格的泥土 / 草（decorate.js:304–326）；沼泽只出黏土圆盘；水深 1–20 才判，frozen_peaks 不判 | `clay` :251–255 | :51 | :83 |

三种水下圆盘按 黏土 → 沙 → 砂砾 的顺序判，先中先得；只替换泥土 / 草（黏土还能替换黏土），所以不会改动深水底的砂砾层。

## 4. 冰雪

| 方块（ID） | 生成参数 | 绘制函数 | 注册 | 定义 |
|---|---|---|---|---|
| snow_block 24 | 地表：frozen_peaks 默认、snowy_slopes / jagged_peaks 非陡坡、grove、ice_spikes（surface.js:171–179, 187）；下层：frozen_peaks / snowy_slopes / grove 在水面以上（grove 用它代替细雪，:201, 203, 205）；冰山上部：从 `海平面 + 18 + rand·10` 起，最多 `2 + rand·4` 格（surface.js:83–108） | `snow` :301–305（与雪层共用） | :58 | :86 |
| snow 25（雪层） | `freeze`：列顶方块在 `temperatureAt(y + 1) < 0.15`（群系温度 < 0.15，或海拔递减后过冷）时，若列顶是不透明方块或树叶 → 上方放 1 层（generator.js:285–305）；溢出到邻块的树叶顶上也会补雪（decorate.js `Ctx.snowSpill` :111–129，调用 :300）；运行时降雪（`weather.md` §3.2） | 同上 `snow` | 同上 | :87；网格 mesher.js:477–481（高 `(meta + 1)·2` px） |
| ice 26 | `freeze`：冷处列顶的源头水 → 冰；frozen_peaks 地表 `ice` 噪声 ∈ [0, 0.025]、下层 ∈ [−0.0625, 0.025]（surface.js:174, 200） | `iceStreaks` :306–311，`ice` :312–319 | :59 | :88 |
| packed_ice 27 | frozen_peaks：陡坡、或 `packedIce` 噪声 ∈ [0, 0.2]（地表，surface.js:172–173）/ [−0.5, 0.2]（下层，:198–199）；冰山主体（冻结海洋，`iceberg` 噪声柱高 `min(1.2e², ⌈40h⌉ + 14)`，surface.js:83–108）；冰刺（ice_spikes 群系每块尝试 3 次，需落在雪块上，decorate.js:245–251，调用 :250；形状 trees.js `iceSpike` :423–453：高 7–10，j = ⌊i/4⌋ + rand(0..1)，j > 1 时 1/60 概率抬高 10–39 格成为巨刺） | `packedIce` :320–326 | :60 | :89 |

## 5. 下界方块

| 方块（ID） | 生成参数 | 绘制函数 | 注册 | 定义 |
|---|---|---|---|---|
| netherrack 175 | **不生成**（没有实现下界维度） | `netherrack` :354–358 | :65 | :196 |
| soul_sand 176 | **不生成**；放置后减速 `speedFactor 0.4` | `soulSand` :359–368 | :66 | :197 |

## 6. 瓜果

| 方块（ID） | 生成参数 | 绘制函数（bt_plants.js） | 注册 | 定义 |
|---|---|---|---|---|
| pumpkin 120 | 草方块上、非沙漠、0.1 < 群系温度 < 1.5：`patch(64, 0.04, 5, 31)`，`r < v·0.35`（decorate.js:365–367，见 `vegetation.md` §1.1 ④） | `PUMP` :218，`pumpkinSide` :219–227，`pumpkinTop` :228–237 | :125–126 | :153 |
| carved_pumpkin 121 | **不生成**（运行时用剪刀剪南瓜，interaction.js `useItemOn`）；带朝向，正面贴图按 meta | `carvedPumpkin(false)` :238–254 | :127 | :154 |
| melon 123 | jungle / sparse_jungle 草方块上：`patch(48, 0.15, 5, 32)`，`r < v·0.4`（decorate.js:368–370） | `MEL` :255，`melonSide` :256–261，`melonTop` :262–271 | :129–130 | :156 |

南瓜灯（jack_o_lantern 122）不在天然页，见 `lights.md`。

## 7. 植物（已在 vegetation.md 给出）

| 方块（ID） | 生成参数 | 视觉资源 |
|---|---|---|
| short_grass 97、tall_grass 98、fern 99、large_fern 100 | `vegetation.md` §1.3（`GRASSD` 表 + 成丛高草） | §5 表"草丛 / 高草 / 蕨 / 大蕨" |
| 单格花 101–112 | §1.4（按群系） | §5"单格花" |
| sunflower 113、lilac 114、rose_bush 115、peony 116 | §1.4（向日葵平原 / 森林类高花） | §5"高花""向日葵" |
| dead_bush 117、cactus 118 | §1.6 | §5"枯灌木""仙人掌" |
| sugar_cane 119 | §1.5 | §5"甘蔗" |
| lily_pad 124 | §1.7 | §5"睡莲" |
| vine 125 | §1.8（随沼泽橡树、丛林木） | §5"藤蔓" |
| seagrass 126、tall_seagrass 127、kelp 128 | §1.7 | §5"海草""海带" |
| brown_mushroom 130、red_mushroom 131 | §1.1 ⑤（地表）+ decorate.js 洞穴地面每块 6 次尝试（:287–299） | §5"蘑菇" |
| pink_petals 132 | §1.4（樱花林） | §5"粉色花簇" |

## 8. 核对结果

- 60 个方块全部列出：**52 个由世界生成器放置**（参数见上表和 `vegetation.md`），**8 个不生成**：polished_granite、polished_diorite、polished_andesite、cobbled_deepslate、obsidian、netherrack、soul_sand、carved_pumpkin。它们只能靠合成、挖掘掉落或运行时转化（岩浆遇水变黑曜石、剪刀剪南瓜）得到。
- 29 个非植物方块都给了绘制函数、注册行和定义行；除雪层外都走整方块网格（mesher.js `meshCube` :562–601）。
- 生成器里还有 3 个"代用"：方解石 → diorite（stony_peaks 地表）、细雪 → snow_block（grove）、菌丝 → grass（蘑菇岛）。前两个见 surface.js:10–11；mushroom_fields 群系的地表走 `top` 默认分支（surface.js:188），所以是草方块而不是菌丝。
