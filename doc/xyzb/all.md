# 素材总表 · 方块 / 物品 / 生物 / 试玩条

> 来源：`index.html`（`BLOCK_DEFS` L708、`ITEM_DEFS` L851、配方表 L976、物品右键 L2255）、`res_vam.js`（`MOB_TYPES` L397、`c_MobSkin`、`SHEEP_COLOR_WEIGHTS`）、`mobsim.js`（`Mobs`、`c_MobAI`、`FLUID`、随机 tick）。
> 数值只写量级与相对关系，不求精确——都挂在 Tweakpane 上现场调（`c_*` 对象即调参入口）。
> 体素数据格式（id/meta 位域）见同目录 `meta.md`；游戏规则 / 调参表见 `handover/mat/game-spec.md`，这里只讲"有哪些东西、各自的特征"。

## 0. 三张表的关系

```
BLOCK_DEFS [name, props]  ─ Blocks.define ─▶ Blocks.byId[0..255]  ──▶ B.name → id
        │                                          │ !noItem 的方块自动成为同名 block item
ITEM_DEFS  [name, props]  ─ Items.define  ─▶ Items.byName          ──▶ 工具 / 食物 / 材料 / gm 值物品
        │                                          │ onUse 在 defineItemUses() 里后挂
配方表 SHAPED / SHAPELESS / SMELTING / FUELS ─▶ Recipes（匹配时支持镜像、'tag:planks' 组）
MOB_TYPES {type: props}   ─ Mobs.spawnMob ─▶ 盒子拼装模型 + Perlin 皮肤 + 20 Hz AI
```

块属性里**行为是钩子**（`onUse/onRandomTick/onNeighborChange/onPlace/onBreak/onEntityInside`），定义表只放数据，钩子由后面的系统（mobsim 随机 tick、Interaction 右键）按名字挂上。

## 1. 方块（`BLOCK_DEFS`，约 95 个 id）

### 1.1 属性字段一览（`Blocks.define` 默认值）

| 字段 | 含义 | 默认 |
|---|---|---|
| `model` | `cube` / `box` / `layer` / `cross` / `crop` / `torch` / `ladder` / `door` / `liquid` / `fire` / `none` | cube |
| `tex` | 字符串或 `{all, side, top, bottom, front, px…nz}`，`texFaces()` 展开成 6 面 | 同名 |
| `variants(meta)` / `facing` | 按 meta 换贴图（雪顶草方块、湿耕地、小麦阶段）/ meta 低 2 位存水平朝向 | – |
| `hardness` / `tool` / `tier` / `requiresTool` | 徒手秒数（-1 不可破坏、0 瞬破）/ 偏好工具 / 最低等级 / 不够等级不掉落 | 1 / – / 0 / false |
| `solid` / `opaque` / `transparent` / `opacity` / `cullSame` | 碰撞 / 挡光且遮邻面 / 透明渲染 / 非 opaque 时的衰减 / 同 id 相邻面剔除 | 由 model 推 |
| `light` | 发光 0..15 | 0 |
| `tint` | `grass` / `foliage` / `water` / `birch` / `spruce` / `{top: …}` | – |
| `drops` | undefined 自掉 / 字符串 / `fn(rand, meta, heldItem)` | 自掉 |
| `replaceable` / `needsSupport` / `gravity` / `liquid` / `climbable` / `flammable` / `damage` | 可被放置覆盖 / `below·wall·farmland·any` / 下落 / 流体 / 梯子 / 燃烧权重 / 接触伤害 | – |
| `interactive` / `tileEntity` | 右键打开 `crafting·furnace·chest·tnt` / 需要 tile 数据 | – |
| `box` | `[x0,y0,z0,x1,y1,z1]` 1/16 单位（box / layer） | – |
| `icon` / `itemTex` / `noItem` | 背包图标 `cube·flat` / 专用物品贴图 / 不生成物品 | – |

### 1.2 分组（按性质，不按 id 顺序）

| 组 | 成员 | 共同特征 |
|---|---|---|
| 石系 | stone(掉 cobblestone) · granite · diorite · andesite · cobblestone · mossy_cobblestone · stone_bricks · sandstone(三面) · netherrack · end_stone · bedrock(-1) · obsidian(50 s, tier 4) | pickaxe tier≥1、requiresTool |
| 土系 | grass_block(top/side/bottom + 雪顶 variant, 掉 dirt) · dirt · sand(gravity) · gravel(gravity, 10% 掉 flint) · farmland(box 15/16, 湿度 variant) · dirt_path(box 15/16) | shovel，hardness ~0.5 |
| 木系 ×3 (oak/birch/spruce) | `_log`(top+side) · `_planks` · `_leaves`(transparent, opacity 1, tint, shears 整取; 5% 树苗、oak 0.5% 苹果、2% 木棍) · `_sapling`(cross, needsSupport below) | axe；flammable 5/20/60/30 |
| 矿 ×6 | coal(掉 coal, tier1) · iron(tier2) · gold(tier3) · lapis(4–8 粒, tier2) · diamond(tier3) · emerald(tier3) | hardness 3，pickaxe |
| 矿块 ×6 | coal/iron/gold/diamond/lapis/emerald_block | 9 合 1 / 1 拆 9（`BLOCKS9`） |
| 功能块 | crafting_table(facing, front 面) · furnace / furnace_lit(tileEntity, lit 发光 13, 掉 furnace) · chest(box 14/16, tileEntity, 27 格) · bookshelf(掉 3 book) · tnt(hardness 0, 右键打火石点燃) · spawner(tileEntity, 不掉落) | – |
| 光源 | torch(14, needsSupport any) · glowstone(15, 掉 2–4 dust) · jack_o_lantern(15, facing) · lava(15) · fire(15) · furnace_lit(13) | – |
| 透明 | glass(不掉落) · ice(opacity 1, 不掉落, 光≥11 化水) · 各 leaves · chest/farmland/cactus 等非整格 `opaque:false, cullSame:false` | – |
| 流体 | water(opacity 2, tint water, replaceable, hardness 100, noItem) · lava(光 15, damage 4) | model liquid，meta = 流动等级 |
| 植被 cross | short_grass(12.5% 种子, shears 整取) · fern · dead_bush(0–2 木棍) · dandelion/poppy/cornflower/oxeye_daisy · 3 种 sapling | 非固体、needsSupport below、hardness 0 |
| 作物 | wheat(model crop, 8 阶段贴图, 需 farmland, 熟掉 wheat + 0–3 seeds) | 随机 tick 生长 |
| 其他形状 | snow(layer 2/16, 光≥12 融化) · snow_block · cactus(box 14/16, damage 1, 长到 3) · ladder(climbable, needsSupport wall) · oak_door(door, 上下两格, itemTex) · pumpkin | – |
| 羊毛 ×16 | `WOOL_COLORS` 16 色 `_wool` | shears, flammable 30 |

### 1.3 挖掘规则（`breakTime` / `canHarvest` / `blockDrops`）

- 徒手时间 = `hardness × 1.5`；对口工具除以 `speed`；剑砍 cross/crop ×1.5；剪刀剪树叶 ×15。
- `requiresTool` 且等级不够：时间 ×5 **且不掉落**。
- `hardness 0` 瞬破（0.05 s），`-1` 不可破坏。
