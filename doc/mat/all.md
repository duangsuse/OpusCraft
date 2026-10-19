## [1. 方块世界](../xyzb/all.md)

为了支持流体、火把等特殊模块，方块也可能有meta属性

## 2. 物品（`ITEM_DEFS`）

### 2.1 类型

| type | 来源 | 说明 |
|---|---|---|
| block | 所有 `!noItem` 方块自动生成 | `creativeTab: blocks` |
| material | `MATERIALS` 22 种：stick coal charcoal iron/gold_ingot diamond emerald lapis glowstone_dust gunpowder flint string feather leather bone book wheat wheat_seeds paper sugar；snowball/egg 叠 16 | 雪球/鸡蛋**不可投掷**（STUB） |
| food | `FOODS [name, hunger, saturation]` 13 种：apple bread 猪牛鸡羊生/熟 rotten_flesh carrot melon_slice | 熟肉 hunger 6–8，生肉 2–3 |
| tool / weapon | 5 材质 × 5 种（pickaxe axe shovel hoe sword）+ shears、flint_and_steel、bucket(叠 16)、water/lava_bucket、bow、arrow、`air`（橡皮擦） | stack 1 |
| gm | gm_time / gm_xyz / gm_mob / gm_bbat | 值物品：`stack.v` 携带捕获值，右键使用（见 game-spec） |

### 2.2 工具等级（`TOOL_TIERS` / `TOOL_DAMAGE`）

| 材质 | level | speed | durability | 剑伤 | 斧伤 |
|---|---|---|---|---|---|
| wooden | 1 | 2 | 59 | 4 | 7 |
| stone | 2 | 4 | 131 | 5 | 9 |
| iron | 3 | 6 | 250 | 6 | 9 |
| golden | 1 | 12 | 32 | 4 | 7 |
| diamond | 4 | 8 | 1561 | 7 | 9 |

镐 2–5、铲 2.5–5.5、锄恒 1。shears speed 15、耐久 238；bow 耐久 384；flint_and_steel 64。

### 2.3 右键行为（`defineItemUses`）

| 物品 | 行为 |
|---|---|
| bucket | 对准**源**流体（meta 0）→ 取走，变 water/lava_bucket |
| water/lava_bucket | 放到目标格（若不可替换则放到相邻面），非创造变回 bucket |
| `*_hoe` | grass/dirt/dirt_path 且上方空、非底面 → farmland |
| `*_shovel` | grass_block 顶面 → dirt_path |
| wheat_seeds | farmland 上方空 → wheat(meta 0) |
| flint_and_steel | 固体方块相邻空格 → fire；对 tnt 右键 → 点燃实体 |
| bow | 消耗 1 arrow，`spawnArrow` 速度 30，冷却 0.8 s |
| air | 擦除目标格（bedrock 除外），并作为 Build 线/面的端点 |

### 2.4 配方（规模感）

- `SHAPED` ≈ 25 条模板 + 25 条工具（`TOOL_MATS × TOOL_SHAPES`）+ 6 条矿块；`SHAPELESS`：原木→4 板、打火石、苔石、矿块拆 9。
- `SMELTING`：铁/金矿、沙→玻璃、圆石→石、原木→木炭、4 种肉、netherrack→stone。
- `FUELS`：coal/charcoal 80 s、coal_block 800、lava_bucket 1000（留 bucket）、木制品 15、木棍/树苗 5。
- 匹配：包围盒等大 + 支持镜像；配料写法 `'name' | ['a','b'] | 'tag:planks'`（`Tags`: planks logs wool saplings coals）。

## 3. 生物（`MOB_TYPES` + `Mobs`）

### 3.1 七种生物

| type | 尺寸 w×h | HP | speed | `food`（唯一行为开关） | 掉落 | 特有 |
|---|---|---|---|---|---|---|
| pig | 0.45×0.9 | 10 | 1.6 | carrot | porkchop 1–3 | 短腿 6/16 |
| cow | 0.45×1.4 | 10 | 1.5 | wheat | beef 1–3, leather 0–2 | 角 |
| sheep | 0.45×1.3 | 8 | 1.5 | wheat | mutton 1–2 (+1 羊毛) | 16 色按 `SHEEP_COLOR_WEIGHTS`（白 81%）；剪毛 1–3，吃草 60–120 s 长回 |
| chicken | 0.2×0.7 | 4 | 1.7 | wheat_seeds | chicken 1, feather 0–2 | 翅膀用 arms 槽 |
| zombie | 0.3×1.95 | 20 | 2.4 | darkness | rotten_flesh 0–2 | 近战 damage 3，平举手臂 |
| skeleton | 0.3×1.99 | 20 | 2.6 | darkness | bone / arrow 0–2 | `ranged`：16 格内有视线每 2 s 射箭 |
| creeper | 0.3×1.7 | 20 | 2.6 | gunpowder | gunpowder 0–2 | 3 格内点火 1.5 s（30 tick）膨胀后爆炸 power 3；>6 格取消 |

`isMonster = food ∈ {darkness, gunpowder}`，其余是动物。**只有一个开关字段 `food` 决定阵营**：
- 动物：受伤逃跑 4 s（×1.5 速）；玩家手持其 `food` 且 <8 格 → 跟随到臂长；闲置时 6 格内看向玩家。
- 怪物：<24 格且玩家非创造 → 追击；白天（dayFactor>0.6）头顶天光 15 且不在水里 → 着火（每秒 1 伤）。

### 3.2 外观（`buildModel` / `c_MobSkin`）

- 全部是 `THREE.BoxGeometry` 拼装，单位 1/16 格，`pivotTop` 腿 / 手臂摆动；脸是 8×8 `Pix` 画的眼睛嘴巴贴在 −Z 面。
- 皮肤 = 可平铺 Perlin 噪声乘法场（`amp` 暗度、`cells` 格数、`oct` 八度、`grain` 抖动、`levels` 量化）；creeper 高对比 5 级量化、cow 3 级斑块。
- 血条 Sprite 受伤后显示 3 s。

### 3.3 生成与消失（`spawnTick`，每 tick）

| 类别 | 触发 | 条件 | 上限 |
|---|---|---|---|
| 动物 | 每 4 tick 随机挑一个已建网格、未 `spawnedPassive` 的区块，30% 概率 | 落点下方是 grass_block；`rng.pick([pig,cow,sheep,chicken,sheep,cow])` 2–4 只 | 14 |
| 怪物 | 非 peaceful、每 2 tick，玩家 ±48 格随机点（一半在地表、一半地下 5..surface） | 距离 24–70、光照 <8、脚下非液体 | 26 |
| 刷怪笼 | 区块 tile `spawner`，16 格内 | 周围 ±4 随机 4 次 | – |
| 消失 | >110 格；怪物 >40 格每 tick 1/1200 | – | – |

### 3.4 移动（`c_MobAI`，Tweakpane 候选）

`maxDrop 3`（不跳的悬崖高度）· `steerTries 8 / steerCd 10`（转向重规划，不每 tick 翻转）· `shoreScan 8`（水中找最近岸）· `float 0.55 / buoy 14 / buoyDamp 5`（阻尼弹簧浮水）· `climbVy 5.5`（水边爬出）· `yawEase 0.35`（朝向平滑）。状态机：`idle ↔ wander`，被覆盖为 `chase / flee / follow`。

## 4. 试玩条（`c_Title.tryItems`）

帮助卡上的 "Give a try" 分组，创造模式点一下塞进手持槽并恢复游戏：

```
[water_bucket, lava_bucket] · [torch, glass] · [crafting_table, furnace, chest] · [tnt, flint_and_steel, bow] · [diamond_hoe, wheat_seeds, ladder, oak_door]
```

五组正好覆盖：流体 → 光/透明 → 容器与 UI → 爆炸/火/远程 → 耕种与非整格方块。可作为**回归清单**：每组都走一遍就把 §1–§3 的主要行为路径跑完了。

## 5. 可调参数索引（本文件涉及的 `c_*`）

| 对象 | 位置 | 管什么 |
|---|---|---|
| `c_MobAI` | mobsim.js L12 | 生物移动 / 浮水 / 转向 |
| `c_MobSkin` | res_vam.js | 每种生物的噪声皮肤 |
| `FLUID` / `c_Flow` | mobsim.js L377 | 水 delay 5 / 岩浆 25，drop 1 / 2，`seek` 坡度搜索半径（0 = 四向全铺） |
| `MOB_TYPES` | res_vam.js L397 | 尺寸 / HP / 速度 / 食物 / 掉落 |
| `TOOL_TIERS` / `TOOL_DAMAGE` | index.html L820 | 工具数值 |
| `FOODS` | index.html L845 | 饥饿 / 饱和 |
