# s05 · Ent / Mob 与 goodPG 移植

> 上游：IDEA「存档理解」BIME 段；goodPG `src/shared/mobs.ts`、`client/textures/mobTextures.ts`、`client/render/*Pose.ts / *Anim.ts`、`shared/sim/entities/*`；宿主 B `res_vam.js MOB_TYPES` + `mobsim.js Mobs`（`doc/mat/all.md` §3）。
> 渲染走 goodGL 原生 pass，见 s03 §4。

## 0. 已定 [11-08]

| # | 决定 |
|---|---|
| E-1 | 先移植宿主 B 的 7 种：pig cow sheep chicken zombie skeleton creeper。外观（模型 / 贴图 / 姿态）换成 goodPG 的，AI 沿用 mobsim 的 20 Hz 逻辑与 `c_MobAI`；其余 goodPG 族按「数据 + 姿态」分批加 |
| E-2 | goodPG 是 TS：写 `tools/vendor-pg.mjs`，用去类型工具把选定文件转成 `gode/vendor/pg/*.js`，`blocks / items` 常量打桩；不改源文件，可以重新同步 |
| E-3 | mob AI 与流体 tick 在 M1/M2 留在 main（20 Hz）；接口从一开始就用消息动词（`onHit / key`），以后搬进 sim worker 时调用方不用改 |

## 1. BIME 四要素（IDEA「存档理解」）[定 11-08：声明式表格，不用 `Mob.def(…)` 这类注册调用]

| 要素 | 是什么 | 标记 | 例子 |
|---|---|---|---|
| **B**lk | 方块。多个可以并联成右键可交互体 Bat（**不叫 Ent**） | `:名字` | `:oak_stairs{linkBlk @0,1; half bottom}` |
| **I**tem | 物品。**方块和 Mob 都可以带物品栏贴图直接当 Item 用**，所以 Item 表只列「纯物品」（材料、食物、工具、gm 值物品） | `:名字` | `:bow`、`:gm_xyz` |
| **M**ob | 有更多监听的 Ent：`on{…}`、`onDie`、`onTap`、大写属性 | `#名字` | `#zombie`、`#p1` |
| **E**nt | **能像磁悬浮那样转**的东西：`(t; mdlID, animID, turn%)` | `#mdlID.animID` | 矿车、船、抛射物、下落的块和薄片、告示、画框、区域效果（flutter 落叶区、firefly） |

### 1.1 复用关系

```
          ┌──────── 可交互（Name HP drops on onDie onTap）────────┐
          │                                                     │
   Blk ───┤ HP = hardness，.tool，.linkBlk                       │
          │                                       Ent（mdl anim turn aabb）
   Item ◀─┼── Blk / Mob 带 icon 即可当 Item                         │
          │                                                     │
   Mob ───┴──────────────────────────────── = Ent + 可交互 ───────┘
```

- **可交互**是 Blk 与 Mob 共用的一组字段：`Name HP drops on onDie onTap`（IDEA「ondie 那段【左右键覆盖】在 Blk 类上也支持，HP 就是 hardness」）。两张表用同样的字段名，引擎用同一段代码处理伤害、掉落、事件。
- **Mob = Ent + 可交互**：Mob 行用 `ent` 字段指向一个 Ent 行，继承它的模型 / 动画 / 碰撞盒；Ent 行本身没有 HP、不掉落。
- **Item 不重复定义 Blk 和 Mob**：`:oak_log` 拿在手里就是那个方块；`#zombie` 拿在手里就是刷怪蛋式的值物品（投掷 = 生成 Ent，落地 `.born()` 成 Mob）。Item 表只给它们补物品专属字段（堆叠、耐久、食物值）时才出现同名行。
- **大写属性可临时覆盖**：`Name HP SPD ATK` 等大写字段，运行时读的是 `x.HP_buf ?? 表.HP`。药水、模式、模组 `{set: {'mob.zombie.ATK_buf': 0}}` 写 `_buf`，到期删掉，不改表。小写字段是静态的。
- **无克隆则无新建**（IDEA 存档哲学）：变体一律写成「从某行克隆 + 差异」，`from` 字段指向原行。羊毛颜色、半砖、带名字的生物都是这样；存档 `BIME.tsv` 里的条目也是 `id → 原行{差异}`。

## 2. 表格形式（照 index.html 的声明表）

经常被模组改的子系统，**全部用 json / tsv 或声明式 js 表格列举**，不写注册函数调用。参照宿主 B：`BLOCK_DEFS`（`[名字, {…}]` 行）、`MOB_TYPES`（`{名字: {…}}`）、`FOODS`（定长元组）、`HURT`（元组末列是谓词函数）。

| 文件 | 形式 | 内容 |
|---|---|---|
| `defl/blk.tsv` | pkv 行（s04 §6） | Blk 纯数据 |
| `defl/item.json` | `{":名字": {…}}` | 纯物品；Blk / Mob 的物品专属补充 |
| `defl/ent.json` | `{"#mdlID": {mdl, anims, aabb, gravity, life}}` | Ent |
| `defl/mob.json` | `{"#名字": {ent, Name, HP, SPD, ATK, drops, food, spawn}}` | Mob 数据，字段照 `MOB_TYPES` |
| `defl/on.js` | 声明式 js：`export default { ":torch": {…}, "#zombie": {…} }` | **行为**：按 BIME 标记挂到上面任意一张表的同名行上 |
| `defl/recipe.json` `smelt.json` `hurt.js` `mode.json` … | 同上 | s07 §1 的其余规则表；含谓词的（`HURT`）用 js |

```js
// defl/on.js —— 只放函数，数据留在 json / tsv；同一个键可以是 Blk、Item、Mob、Ent
export default {
  '#zombie': {
    on: {
      blk_Any:     P => {},          // 碰到方块（P 为格坐标）
      ent_arrow:   (e, hit) => {},   // 被某种 Ent 碰到
      item_carrot: stack => {},      // 被玩家拿着某物品右键 / 喂
    },
    onDie(e) {}, onTap(e) {},
  },
  ':torch':   { onTap(e) {} },                     // 返回空 → 走默认破坏（IDEA）；e 是 BlockEvent（flow/hooks.ts）
  ':wheat':   { onRandom(e) {} },                  // 要在 blk.tsv 里声明 schedRandom
};
```

- 数据与行为分文件，但**键相同**，加载时按键合并。这是 game-spec §9「按名字后挂钩子」的声明式写法：表保持纯数据，钩子也是一张表。
- 加载顺序 `defl → $links → $mode`，按键深合并，后加载的覆盖先加载的（s07 §4，Compose4Cascade）。模组只写差异行。
- 这些 js 表在 main 运行（s07 M-4：有返回值的钩子只在 main）。
- `on` 的键 = `类别_名字`（`blk / ent / item / marker …`），`Any` 通配。事件来源：物理（碰撞）、交互（右键 / 投掷）、s07 的消息（`onHit`）。
- 查询：`gm.act.scr2xyz(sx, sy)` → 准星下的 Blk / Ent / Mob。

## 3. Ent 运行时与存档

```js
ent = { id, P: [x, y, z], t /* turn，0deg = 东，顺时针 */, mdl, anim, v?, aabb, meta: {…} }
```

- 存档行 `mat.tsv`：`id  P  turn  #mdlID{k v}`，载入时 `.born()`（s06）。
- 碰撞盒用 AABB，照矿车（IDEA）。
- `mdl` 指向 s03 §4 的模型表；BBat 也能当模型（s08）。

## 4. 从 goodPG 拿什么

| 部分 | goodPG 位置 | 去向 | 改动 |
|---|---|---|---|
| 模型数据 | `shared/mobs.ts` `ModelPart` `MobDef` `MOBS` | `vendor/pg/mobs.js` | 无，`MobDef` 的 stats 字段由 vendor 工具导出成 `mob.json` 行（§2） |
| 程序贴图 | `client/textures/mobTextures.ts` `generateMobTexture(id, variant)` | slicer 的 `mobtex` 动词（s03 §4） | 去掉 DOM 依赖（只要 `Uint8Array`） |
| 姿态 | `client/render/{faunaPose, monsterAnim, …}.ts` | main，每帧算骨骼矩阵 | 纯函数，去类型即可 |
| 骨骼 shader | `client/render/shaders/mob.ts`（`MAX_BONES = 24`） | rgl pass kit 的 `fancy` 变体 | 重写 uniform 声明，用 `${}` 注入 |
| AI / 刷怪 | `shared/sim/entities/{mobBrain, spawner, pathfind, physics}.ts` | **暂不取**（E-1），以后分批加时再取，需要 `BlockGetter` 桩 | — |

## 5. 宿主 B 的 7 种映射

| 宿主 B | goodPG key | 宿主 B 保留 | 换掉 |
|---|---|---|---|
| pig cow sheep chicken | 同名 | `food` 阵营开关、`c_MobAI`、生成表（all.md §3.3）、羊毛 16 色权重 | `buildModel` 盒子拼装与 Perlin 皮肤 `c_MobSkin` |
| zombie skeleton creeper | 同名 | 追击 / 远程 / 膨胀爆炸逻辑、白天着火 | 同上 |

## 6. 待议

- 区域效果 Ent（flutter 落叶区、firefly）由谁画：rgl 已有 `flutter.js / firefly.js`，它们算 Ent（进 `mat.tsv`）还是渲染器的环境效果
- 玩家 `#p1` 的模型与皮肤链接（IDEA 基础信息「皮肤链接」）
