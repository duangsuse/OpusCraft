# s04 · 体素：id、状态、流体、光照、方块能力

> 上游：IDEA「体素关键」各条；`doc/xyzb/meta.md`（MC 1.12 风格 id + meta、GPU 布局）；`doc/xyzb/all.md`（宿主 B `BLOCK_DEFS` ~95 个）；`doc/mat/game-spec.md` §4 流体。
> 存储布局见 s02 §1：`u16 = type(12) | meta(4)<<12`，YZX，H 256。

## 1. id 分配 [定 11-08]

| id | 名字 | 归并（IDEA） |
|---|---|---|
| 0 | **保留**：存档 diff 中表示「等于生成器输出」，运行时区块里不出现 | — |
| 1 2 3 | air water lava | — |
| 4 5 6 7 | grass dirt stone slate | 岩 = 板岩 |
| 8 9 | sand gravel | 沙 = 沙、沙砾 |
| 10 11 12 | snow ice glass | 雪 = 雪、冰、玻璃 |
| 13 14 | leaves plant | 植 = 草丛 |
| 15 … 0x7fff | 按名字首次使用时分配，写进存档 `BIME.tsv` | — |
| 0x8000 \| n | 存档现场局部 id（IDEA 存档格式，区别于生成器字典） | — |

- 12 位 type 只能装下 0…4095。0x8000 \| n 是**存档文件里**的编码（u16 全宽），载入时映射回运行时 type。运行时 type 用完 4096 时报错，不静默截断。
- 生成器、渲染器、存档之间**都按名字对接**：生成器 `meta.names` → LUT（s02 §2）；rgl 按名字查 glid（s03 §2）；未知名字 → 「未知方块」（不可破坏，IDEA）。
- 默认命名空间写作 `:oak_stairs`。

## 2. meta 的 4 位

只放**高频变化**的值，避免每次变化都改 xyzb.tsv：

| 类别 | meta 含义 |
|---|---|
| 流体 | 液位：0 = 源头，1…7 逐渐变薄（7 最薄），≥ 8 = 下落水柱（IDEA「>8」与宿主 B「meta 8 = 下落」在 4 位里统一为 8…15，低 3 位可留给下落前的液位） |
| 作物 / 树苗 | 生长阶段（`:wheat{age 7}` 的 age） |
| 火 | 年龄 |
| 铜 | 氧化阶段（IDEA「植物与铜有生长有氧化」） |
| 雪层 / 半砖类 | 层数 / 上下半 |

GL 流向不存，由邻格液位实时推（IDEA「流体有 液位 \| GL 流向 \| 是否源头」：源头 = meta 0，流向交给 shader / mesher 求梯度）。

## 3. 复杂状态 = `xyzb.tsv` + `linkBlk` [定 11-08]

- 朝向、half、shape、waterlogged 等**不占 id 也不占 meta**，写在 `xyzb.tsv` 的该格条目里，照 IDEA 的写法：
  `:oak_stairs{linkBlk @0,1; half bottom; shape straight; NOT waterlogged}`
- **朝向就是依存方向**：`linkBlk` 指向它依附的格（相对偏移 `@dx,dz^dy`）。火把、告示、床、家具、门都用同一个字段；依附格被破坏 → 本格掉落（依存块规则，§5）。
- main 维护每个区块的稀疏状态表 `Map<idx, stateId>` 和一个全局状态调色板（相同 `{k v}` 组合只存一份）。网格请求附带范围内的稀疏表（s03 §6）。
- 默认状态（例如楼梯放置时朝南）不写条目：没有条目 = 默认值。

## 4. 光照

| 规则 | 值（IDEA） |
|---|---|
| 等级 | 1…15；熔炉 13，火把 14 |
| 衰减 | 每格 −1，再减 `opacity`：水 2、树叶 1，实心方块挡光 |
| 合成 | 天空光与方块光**取最大值**；方块光是暖色**加色**（shader 里 `sky·skyCol + blk·warmCol`，而不是同一个灰度） |
| sunDir | 天空光强度随太阳方向（`Env.sun`）在 shader 中调制，不重算 BFS |
| 位置 | 初始光照由 slicer 算（s01 §4），main 做增量 BFS，**跨区块边界**的传播在 main |
| 存档 | 不存，载入后由 slicer 重算；IDEA 提到的「FoV 以内的光照放在 xyzb.tsv 尾部」作为首帧加速的可选缓存（s06） |

## 5. 方块能力（声明字段）

照 game-spec §9「布尔开关而非枚举」：每条能力是一个独立字段，系统各取所需。

| 分组 | 字段 | 说明（IDEA） |
|---|---|---|
| 形状 | `model`: cube / cross / slab / stairs / pane / … | 交叉片、半方（半砖）、栏杆 |
| 贴图 | `cutout` `alpha` `translucent` | 镂空贴图、RGBA 贴图、透光度 |
| PBR | 资源包 `_n` `_s`（labPBR） | 自发光 \| 视差坑洼（法线 + 高度）\| 光滑度 \| 镜面度 |
| 光 | `emit` `opacity` | §4 |
| 碰撞 | `noCollide` `boxes` | 无碰撞；AABB 列表同时给碰撞与渲染（meta.md uShape） |
| 依存 | `needsSupport` `linkBlk` 默认方向 | 依存空气即「朝向」 |
| 物理 | `gravity` `washable` `replaceable` | 下落、可冲毁 = 直接替换 |
| 放置 | `placeRule` | 禁放规则（例如火把不能放在玻璃上） |
| 并联 | `multi` | 邻接并联块：多格依存、多格变形、内部剔面（cull），右键可交互体 = Bat |
| 生长 | `grow` `oxidize` | 随机 tick 推进 meta |
| 燃烧 | `flammable` `burnTo` `emitWhenBurning` | 木头燃烧 + 发光 |
| 地图 | `mapColor` | s03 §3.2 |
| tint | `tint`: grass / foliage / water | 群系色回调（[承] D-10） |

## 6. 方块表的书写 [定 11-08：pkv 文本 + JS 钩子]

- 数据在 `gode/defl/blk.tsv`，pkv 语法，一行一个方块。面板 `pickLib`（s09）与 agent 直接编辑，`✎` 落盘。
- 行为钩子写在 `defl/on.js` 的同名键下（s05 §2），表本身保持纯数据。
- 前 14 行固定为 §1 的预分配顺序，加载时校验。

```
:torch{emit 14; model cross; noCollide; needsSupport; linkBlk @0,0^-1; mapColor #fc0}
:oak_log{flammable 5; burnTo :fire; tool axe; HP 2}
:sand{gravity; mapColor #dcd3a0}
```

- 宿主 B 的 `BLOCK_DEFS`（~95 个）由一次性脚本导出成 `blk.tsv`；字段名不同处在脚本里改名。

## 7. 待议

- 并联块（Bat）的连通判定与 BBat 的关系（s08）
