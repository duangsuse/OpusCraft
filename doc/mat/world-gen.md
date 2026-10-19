# 世界生成 · 噪声栈 / 生物群系交互 / 风格对照

> 来源：`gen.js`（`Terrain`、`BIOMES`，290 行）、`index.html`（`Noise.fbm2/ridge2` L487、`SEA_LEVEL=62` L364、`World.setBlockGen/applyPending` L1195）、`gls.js`（`tintFor` L288）、`mobsim.js`（刷怪/树苗）。
> 常量都是现场调参的候选，这里只写结构与相对关系。对照表部分凭对《生存战争》(Survivalcraft) 与 Luanti (Minetest) 公开资料的了解，细节以其源码为准。

## 0. 一页管线

```
sample(x,z)  ── 6 张 2D 噪声 ──▶ { h, biome, temp, hum, mountain }        （纯函数，列缓存）
      │
generateChunk(c)
  ├─ 256 列：按 biome 选 top/sub，bedrock 0..4 随机，stone 到 h-soil，水灌到 SEA_LEVEL
  │          沙漠/沙滩垫 sandstone；寒带 grass meta=1(雪顶)+snow 层；冷海面结 ice
  ├─ carveCaves      两张 3D 噪声 4 格晶格三线性插值：a²+b² < thresh 挖空；2D 峡谷掩码；y≤10 填岩浆
  ├─ placeVeins      随机游走矿脉（石变体 + 5 种矿 + 山区绿宝石）
  ├─ recomputeHeights → state = CH_GENERATED → applyPending（邻块早先溢出的树叶/结构）
  └─ decorateChunk   逐列掷一次 p：树 / 草 / 花 / 南瓜 / 仙人掌 / 枯灌木；4% 地牢、1.2% 废弃传送门
                     树与结构用 setBlockGen：越界部分进 pendingFeatures，等邻块生成时 applyPending
```

关键取舍：**高度是 2D 的**（没有 3D 密度场 → 没有悬崖倒挂 / 浮空），3D 噪声只用于洞穴；全部在主线程、无 Worker；群系与装饰**逐列**决定，没有群系过渡带。

## 1. 噪声栈（`Terrain.init`，每张独立 seed 盐）

| 噪声 | 频率 (格⁻¹) | 八度 | 作用 | 波长感 |
|---|---|---|---|---|
| `nCont` 大陆度 | 0.0012 | 4 | `landness = smoothstep(-0.25, 0.15)` 决定海 / 陆；基准高 36+12c（海）↔ 66+6c（陆） | ~800 格 |
| `nEro` 侵蚀 / 造山 | 0.003（偏移 +1000） | 3 | `mountain = smoothstep(0.15,0.65, ero) × smoothstep(0.05,0.3, cont)`：只在内陆造山 | ~330 格 |
| `nHill` 丘陵 | 0.012 | 4 | `h += hills × (5 + 10·mountain)`：平原 ±5，山区 ±15 | ~80 格 |
| `nRidge` 山脊 | 0.006 | 4 (ridged) | `h += ridge × 48 × mountain`：尖脊，只在 mountain>0 时采样 | ~170 格 |
| `nTemp` 温度 | 0.0017 | 3 | `[0,1]` 再减 `max(0, h−70) × 0.006`（**海拔递减率**：每 100 格 −0.6） | ~590 格 |
| `nHum` 湿度 | 0.0021 | 3 | `[0,1]` | ~480 格 |
| `nCaveA/B` 洞穴 | 0.022 水平 / 0.035 垂直 | 1 (3D) | 两场同时近零 → 隧道（Minetest 式 "双噪声交线"） | 隧道截面 ~3–5 格 |
| `nRavine` 峡谷 | 0.004 | 1 | `|rav| < ravWidth` 的细带，宽度由 `nDetail` 调制；`ravMask>0.45` 才出现 | 带宽 1–3 格、长数百格 |
| `nDetail` 细节 | 0.02–0.08 | 1 | 海底沙/砾、山顶石/草斑块、峡谷宽度与掩码 | ~15–50 格 |

高度最终 `clamp(4, CHUNK_H−6)` 取整。`SEA_LEVEL=62`，`CHUNK_H=128` → 海拔预算：海底 ~30，平原 62–72，山区 ≤122。

## 2. 群系（`BIOMES` 10 条 + `sample` 判定树）

### 2.1 判定顺序（先到先得，**离散、无混合**）

```
h < SEA−12                    → Deep Ocean
h < SEA−1                     → Ocean
mountain > 0.45 && h > 74     → Mountains
h ≤ SEA+2 && cont < 0.3       → Beach
temp < 0.3                    → hum > 0.5 ? Taiga : Snowy Tundra
temp > 0.68 && hum < 0.42     → Desert
hum > 0.6                     → temp < 0.5 ? Birch Forest : Forest
else                          → Plains
```

注意：海 / 山 / 滩由**高度与地形量**决定，温湿度只在"普通陆地"里分四象限。海拔递减让高山自然变成 Taiga/Snowy 的混合（山区 h>92 强制雪）。

### 2.2 群系表（每条的"可调旋钮"）

| 群系 | 地表 top / sub | 树 p | 草 p | 花 p | 特有 | tint 差异 |
|---|---|---|---|---|---|---|
| Ocean / Deep Ocean | detail>0.1 ? gravel : sand，sub 2 格 | 0 | 0 | 0 | temp<0.25 海面结 ice | – |
| Plains | grass / dirt | 0.002 | 0.12 | 0.02 | pumpkin 0.0008 | 标准绿 |
| Forest | grass / dirt | 0.045 | 0.08 | 0.01 | 20% 桦树混生 | 偏鲜绿 |
| Birch Forest | grass / dirt | 0.04 | 0.08 | 0.02 | 全桦 | – |
| Taiga | grass / dirt | 0.04 | 0.06 | 0.002 | fern 40% 替代草；h>80 雪 | 偏灰绿 |
| Snowy Tundra | grass(meta1 雪顶) / dirt + snow 层 | 0.001 | 0.01 | 0 | 云杉；水色偏深 | 青灰 |
| Desert | sand / sand + 3 格 sandstone | 0 | 0 | 0 | cactus 0.008 (1–3 高)、dead_bush 0.01 | 枯黄 |
| Beach | sand / sand + sandstone | 0 | 0 | 0 | – | – |
| Mountains | h>82 或 detail>0.35 ? stone : grass | 0.004 | 0.03 | 0.003 | 绿宝石 5 次/块；h>92 雪；不作为出生点 | 灰绿 |

装饰在一列只掷一次 `p = r.next()`，按 `trees → grassP → flowerP → pumpkinP` 累积区间判定——所以**各概率之和 < 1**，且树优先。

### 2.3 群系与其他系统的交互（谁读 `c.biomes`）

| 消费者 | 用法 | 备注 |
|---|---|---|
| `generateChunk` | top/sub 材质、雪、冰、sandstone 垫层 | 逐列 |
| `decorateChunk` / `placeTree` | 树种（Taiga/Snowy→spruce，Birch→birch，Forest 20% birch，其余 oak）与密度 | 树形：云杉 6–9 高、1/2 交替半径锥形；橡/桦 4–7 高、顶部 3 层冠 |
| `placeVeins` | 区块内任一列是 Mountains → 绿宝石 | 唯一群系限定矿 |
| `gls.js tintFor` | grass / foliage / water 三种 tint 取群系 RGB；birch / spruce 固定色 | **按顶点所在列查，不插值** → 群系边界有硬色缝 |
| `mobsim` 树苗随机 tick | 树苗按木种反推群系常量传给 `placeTree` | 不读地图群系 |
| `mobsim` 动物刷新 | 只看脚下是否 grass_block | 与群系无关（沙漠无动物是副作用） |
| `findSpawn` | 排除 Mountains、要求 h > SEA+1 | 原点向外螺旋 600 格 |
| `Weather`（gls.js） | 雨 / 雪由全局天气决定 | 未按群系区分雨雪（STUB 候选） |

`sample` 算出的 `temp / hum / mountain` **只用于判定，不落盘**；区块只存 `biomes[256]` 一个 id。

## 3. 地下

### 3.1 洞穴（`carveCaves`）

- 晶格 5×33×5（4 格间距）采样两张 3D 噪声，逐格三线性插值 → 每块 825 次 `noise3` 而非 32768 次。
- 阈值 `y<20 ? 0.03 : 0.018`：深处隧道更粗；`y ≥ 6` 才挖；不挖 bedrock / 水；**正上方是水则跳过**（防海水灌洞）。
- `y ≤ 10` 的洞改成 lava（岩浆湖层），峡谷内不填。
- 峡谷：`ravMask > 0.45` 区域内，`|nRavine| < 0.012–0.036` 的细带，从地表挖到 `max(12, h−30−宽度×400)`；只在陆地（h > SEA）。

### 3.2 矿脉（`placeVeins`，随机游走，只替换 stone）

| 方块 | 次数/块 | 游走步数 | y 范围 |
|---|---|---|---|
| granite / diorite / andesite | 8 | 30 | 0–80 |
| dirt / gravel | 6 / 5 | 30 | 0–100 |
| coal | 18 | 14 | 4–120 |
| iron | 16 | 8 | 2–64 |
| gold | 2 | 8 | 2–32 |
| lapis | 1 | 6 | 4–30 |
| diamond | 1 | 7 | 2–16 |
| emerald | 5 单格 | – | 4–32，仅山区 |

每步沿 6 向随机走 1 格，30% 再水平多走 1 步 → 矿脉是细长串而非团块。

### 3.3 结构（`decorateChunk` 尾部，`chunkRand(cx,cz,'struct')`）

| 结构 | 概率/块 | 内容 | 战利品池 |
|---|---|---|---|
| 地牢 | 4% | 7×5×7 圆石房（底部 40% 苔石），中央 spawner（zombie 2/3、skeleton 1/3，cooldown 200），对角 chest | iron bread string gunpowder bone diamond apple coal iron_pickaxe bucket seeds，3–6 格 |
| 废弃传送门 | 1.2% | 4×5 黑曜石框（30% 缺块），周围撒 netherrack / lava，旁边 chest | flint_and_steel gold obsidian golden_pickaxe iron |
| STUB | – | 村庄 / 矿井 / 要塞 留钩子 | – |

tile 数据（chest 槽位 / spawner）只在落在本块时写（`setTileGen` 不跨块）。

## 4. 跨块与确定性

- 所有随机用 `chunkRand(cx, cz, salt)`：`'base' / 'ore' / 'deco' / 'struct'` 四条独立流，**同 seed 同块必同结果**，与生成顺序无关。
- `setBlockGen` 对尚未生成的邻块写入 `pendingFeatures[key]`，带 `soft` 位（树叶只覆盖空气 / 树叶，不覆盖树干与地形）；邻块 `generateChunk` 在 `decorateChunk` 之前 `applyPending`，所以邻块自己的装饰会覆盖溢出的树叶（可接受的偏差）。
- 若邻块已 `CH_LIT`，溢出写入走增量光照 + markDirty。

## 5. 风格对照：本项目 vs 《生存战争》 vs Luanti

| 维度 | 本项目 (`gen.js`) | Survivalcraft（2.x） | Luanti（mapgen v7 + biome API） |
|---|---|---|---|
| 高度来源 | 2D：大陆 + 侵蚀 + 丘陵 + ridged 山脊，线性叠加 | 2D 为主：大尺度"大陆/海洋"噪声 + 山脉带 + 多八度细节，整体更**平缓宽阔**、山是大块隆起而非尖脊 | v7：2D 基底 + **3D 噪声造山（`mgv7_np_mountain`）** → 有悬崖、拱、浮空岛（floatlands 可开）；v6 纯 2D |
| 地形尺度 | 大陆波长 ~800 格，山区 ≤122 高（受 CHUNK_H 128 限制） | 世界高 128（后期 256），海平面 64；大陆以千格计，岛屿多 | 高 ±31000，默认海平面 1，山可到数百格 |
| 群系分类 | 高度 / 地形量优先，温湿度四象限，**离散 10 种** | **温度 + 湿度两张连续场（0–15 量化）存进每列**，没有"群系 id"：草色、雪线、树种、沙漠化都是这两个值的连续函数 | biome API：每个群系一对 `(heat, humidity)` 点 + `y_min/y_max`，按**最近点**分类；可叠加垂直分层（海底 / 地表 / 地下 / 浮空各一套） |
| 过渡带 | 无（列级硬边、tint 硬缝） | 连续场天然平滑；雪盖 / 草色渐变 | 最近点分类也是硬边，但噪声抖动 + 装饰 fill_ratio 使边界杂糅；`biome_api` 没有 tint，靠换节点 |
| 地表层 | top / sub / soil 3–4 格 / stone；沙漠垫 sandstone | 多岩层：granite / basalt / limestone / sandstone **成带**（stratum）出现，矿石依附特定岩层 | `node_top / node_filler / node_stone / node_riverbed / node_dust`（雪尘）每群系一套；`ore` 类型 `scatter / sheet / blob / vein / stratum` |
| 洞穴 | 双 3D 噪声交线 + 2D 峡谷 + 岩浆层 | 随机游走"刷子"挖隧道 + 大洞室，分布受岩层影响；无峡谷 | v7：**同样是双 3D 噪声交线**（`cave1/cave2`，本项目做法的直接来源）+ 大洞室 `cavern`；valleys 多河谷 |
| 水体 | 海到 SEA_LEVEL，冷海结冰；无河流 | 海、湖、**河**（按地形低洼回填），海岸有渐深浅滩 | v7 `ridges` 噪声刻**河网**（river water 节点）；valleys 以湿度驱动河谷 |
| 植被 / 装饰 | 每列一次掷骰，按群系概率表 | 按温湿度连续插值密度；树 6 种以上、灌木、藤蔓 | `decoration` API：`simple`（单节点）/ `schematic`（.mts 树模型）+ `fill_ratio` / `noise_params`，群系白名单 |
| 结构 | 地牢、废弃传送门 | 无生成结构（出生点附近有少量） | 游戏/模组层面（dungeons mapgen flag 自带地牢） |
| 确定性 / 跨块 | `chunkRand` 盐 + `pendingFeatures` | 按区块生成，树在块边界被截断是其知名瑕疵 | mapchunk 80³ 一次生成 + `emerge` 队列，schematic 可跨块 |
| 多线程 | 主线程 | 后台线程 | C++ emerge 线程（可多条） |

### 5.1 值得借的三件事（按改动量排序）

1. **把 `temp / hum` 量化存进区块**（u4+u4 或各一 u8，与 §2.3 "只存 biome id" 相对）→ `tintFor` 改成按 (temp, hum) 查一张 2D 色图并在 mesher/v2 里做双线性 → 草色 / 水色渐变、雪线连续，消除硬缝；判定树保持不变。这正是 Survivalcraft 与 MC 原版 grass colormap 的做法，也契合 `xyzb/meta.md` 的"查表而非扩 id"原则。
2. **Luanti 式 `(heat, humidity, y)` 最近点分类 + 每群系一套 `top/filler/stone/dust`**：把 §2.1 的 if 链换成一张表，可以在 Tweakpane 里加减群系而不改代码；高海拔 / 海底群系用 `y_min/y_max` 自然表达（替代 `h > 92` 等魔数）。
3. **3D 密度造山（仅山区、仅 y>74）**：在 `mountain > 0.45` 的列上叠一张低频 3D 噪声做"挖空"（像 v7 mountain 的反向），得到悬崖与洞口而不改变整体 2D 结构；成本只在山区列。DDA 渲染器天然支持悬垂，不需要网格侧改动。

反向的提醒：Survivalcraft 的河流 / 多岩层和 Luanti 的 floatlands 都会把生成从 "2D 高度 + 后处理" 变成"3D 字段求解"，对 `CHUNK_H=128`、主线程 6 ms 预算来说都偏贵，暂不建议。

## 6. Tweakpane 候选（`Terrain` 目前没有 `c_*`，建议抽出）

| 建议名 | 字段 | 现值 |
|---|---|---|
| `c_Gen.scale` | cont / ero / hill / ridge / temp / hum 频率 | 0.0012 / 0.003 / 0.012 / 0.006 / 0.0017 / 0.0021 |
| `c_Gen.height` | 海基 36+12c、陆基 66+6c、丘陵 5+10m、脊 48 | – |
| `c_Gen.biome` | 山阈 0.45 / 74、滩 SEA+2 & cont<0.3、寒 0.3、热 0.68 & 干 0.42、湿 0.6、递减 0.006 | – |
| `c_Gen.cave` | 频率 0.022/0.035、阈值 0.03/0.018、lava y≤10、峡谷 mask 0.45 | – |
| `c_Gen.struct` | 地牢 0.04、传送门 0.012 | – |
| `BIOMES[i].*` | trees / grassP / flowerP / 特有 p、三色 tint | 见 §2.2 |

抽出后 `init(seed)` 可按参数重建噪声、`colCache.clear()` 即可实时预览（Title 预览模式 `previewRd 16` 正好用来看大尺度变化）。
