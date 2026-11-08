# s13 · pgviz：地形查看与交互调参（M0）

> 上游：`goal-pgviz.md`（全文；本节只写 gode 的差异）；s02 §2 生成器 Worker 契约、§2.1 `c_.Gen` knobs；s12 Agent 工具。
> UI 参考：`techstack/res/minecrafttools.wiki/*-L.webp`（seed map）、`techstack/res/craftplicator.com/*-L.webp`（mcweb）。
> 用途：**人和 Agent 都用它调地形参数**——人拖滑块看图；Agent 用 URL + `gd shot` 闭环。

## 0. 已定 [11-09]

| # | 决定 |
|---|---|
| V-1 | pgviz 放进 **M0**，位置 `gode/viz/index.html`（`localhost:8765/gode/viz/?g=gp&seed=…`） |
| V-2 | **不再有 `GenDesc` / shim**：pgviz 直接起 s02 的生成器 Worker（同一个 `defl/g/<名>.js`），用 `onkwarg / gen / sample / explain` 和 `meta`（`sea names biomes knobs`）。游戏与 pgviz 跑的是**同一份代码**，goal-pgviz C2 / C7 的对拍与 shim 清单检查消失 |
| V-3 | 参数就是 `c_.Gen`（s02 §2.1），面板走 `gg.pane`（s09）；**覆盖 goal-pgviz「参数不进存档」**：gode 里 knobs 随存档（s02 §2.1，因为它们决定 diff 基准） |
| V-4 | 渲染沿用 goal-pgviz §3.2：R16UI 3D 纹理 + 轴向步进，六向正交，不走 rgl 管线；图层 / 空气层叠 / 切片照 §5 |
| V-5 | 游戏端联动走 BroadcastChannel；M0 时游戏端是**宿主 B**（`?pgviz` 钩子，goal-pgviz §6–§7），gode/index.html 起来后换成 `c_.Gen` 的 `fx:'regen'` 正常路由 |
| V-6 | **俯视 + 侧视**，由**右下角 gizmo** 切换（§2.1）；悬停 gizmo = 沿当前视线轴快放 +N 层；+N 输入下方是「显示空气距离」开关 [11-09] |

## 1. 相对 goal-pgviz 删掉 / 改掉的

| goal-pgviz | gode |
|---|---|
| `pgviz/mini.js` + `shim.js` + `prng.js` 抽取（P1 步 2–3、C1 C7 C8） | 删。`old` 生成器在 s02 §4 已是 Worker 适配器 |
| `GenDesc`（§3.1） | 生成器 `meta` + `sample`；`fields` 由 `sample({x,z})` 的返回键决定（高度、温度、湿度、大陆度…） |
| `liq.js` 适配器 | `defl/g/liq.js`（s02 §4，y + 64） |
| 体素窗口 u16 列优先 | 规范 u16 YZX（s02 §1），直接 `texSubImage3D` |
| 单 Worker 流式 | 用 slicer 池（s01），同一池大小规则 |
| Tweakpane 参数面板 | `gg.pane`：`c_.Gen.lake.it.rate` 等，`meta.knobs` 决定显示哪些行 |
| `localStorage['pgviz.knobs.mini']` | `gg_v` 层（s09 §1）；「固化」= `✎ 写为 js 默认` 写回 `defl/c_.json` |
| `tools/genview.mjs` CLI + `cpu-march.js` | **不做**。Agent 出图用 `gd shot`（s12）对 pgviz 页面截图；C6 GL/CPU 对拍随之删去 |

保留：图层模型与空气层叠（§5）、gizmo 与键盘（§4）、URL 同步、重生成协议（§7 的消息表）、C4 转置检查、C10 重生成检查。

## 2. 界面（参考两站，取长）

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [seed 20240607][Go]  [g: gp ▾]  地表│切片│层叠  [X][Z][Go to]  [⎘ URL][↗ 进游戏]│  顶栏
├──────────────┬────────────────────────────────────────────────────┬───┤
│ ① 世界    –  │                                                    │ ＋ │
│  种子评分/统计│                                                    │ － │
│ ② 视图    –  │                 地图（六向正交）                     │ ◎ │ 回玩家
│  模式 地表 ▾  │                                                    │ ⌖ │ 回原点
│  切片 Y ▬●▬  │                                                    │ 📏 │ 量距
│  +N 层 [16]  │                                                    │   │
│  ☑ 空气距离   │                   ┌──────────────┐                 │   │
│ ③ 图层    –  │                   │ 洞窟 · -12 腔2 │ ← 点击卡片      │ ⬇ │ 导出 PNG
│ [群系][洞窟]  │                   │ ⎘ @x,z^y  传送 │                 │ ⤢ │ 全屏
│ [矿 ▸][植被]  │                   └──────────────┘                 │   │
│ [水][结构]    │                                                    │   │
│ ④ 参数 c_.Gen│                                                    │   │
│  湖泊 / 树 /  │                                         ┌────────┐ │   │
│  地形 …      │                                         │  ●Y    │ │   │
│ ⑤ 选区    –  │                                         │○-X┼ ●X │ │   │ ← gizmo（右下角）
│  X from‥to   │ X -1588 · Z 1470 · Chunk -100,91 · y 64 │●Z  ○-Y │ │   │
├──────────────┴────────────────────────────────────────────────────┴───┤
│ 生成 312/625 块 · 4.1 ms/块 · 参数 ≠ 默认 (#3fa2)                      状态行 │
└───────────────────────────────────────────────────────────────────────────┘
```

| 取自 | 元素 | 在 pgviz 里 |
|---|---|---|
| minecrafttools 顶栏 | seed + Go、版本下拉、Overworld/Nether/End 分段按钮、X/Z + Go to、Share | seed + Go、**生成器下拉**（old/gp/liq/URL）、**模式分段按钮**（地表 / 切片 / 层叠）、X/Z 跳转、⎘ 复制 URL、↗ 进游戏（打开 `gode/index.html?g=&seed=&p1=@x,z^y`） |
| minecrafttools 左栏 Features | 图标 chip 网格、All / None | **图层 chip**：点 = 开关，长按 / 右键 = 独奏，矿 / 植被 chip 带 ▸ 展开子项；All / None |
| minecrafttools Highlight biome / Grid 下拉 | — | 群系高亮下拉、网格下拉（无 / 区块 / region 32×32） |
| minecrafttools 右侧竖排工具钮 | ＋ － 定位 准星 尺子 下载 全屏 | 同；**gizmo 固定在地图右下角**（§2.1） |
| minecrafttools 点击弹卡 | 名称、坐标、Copy XZ、Copy /tp、Marker、Completed | **探针卡**：方块名、群系、`sample` 各字段、所在图层；⎘ `@x,z^y`、在游戏里传送、加 marker（s03 §3.4 同一 marker 格式） |
| minecrafttools 左下读数 | X · Z / Chunk · Region · Biome | 同，加 y 与当前切片 |
| craftplicator 左栏 | ①②③ 编号可折叠段、Mode 下拉（Surface / Slice at Y）、Slice 滑块 | ①–⑤ 编号段；切片滑块（Y 切片 = 等高图） |
| craftplicator Selection | Shift 拖框、X/Z from‥to、Vertical extent | ⑤ 选区：Shift 拖框 → 坐标框 + y 范围；动作：**只重生成这块**（预览）、在游戏里重生成、导出 `XZ1` 文本（s06 §5，给 Agent / clawd） |
| craftplicator Walk through it + 小地图 | 进 3D 第一人称，右下角小地图，M 回地图 | ↗ 进游戏（M0 宿主 B，M1 起 gode）；不在 pgviz 里做 3D |
| craftplicator 底部状态行 | 「World loaded」 | 生成进度、ms/块、参数哈希 |

- 左栏宽 300 px，可折叠（minecrafttools 的 ⫷ 钮）；窄屏变底部抽屉（同 s09 §6.2）。
- 字体 / 配色：深色、等宽数字；chip 用群系 / 图层色做左侧色块。和游戏 HUD 不共用样式（pgviz 是工具）。

### 2.1 视角、gizmo 快放、空气距离 [定 11-09]

**视角**：俯视（−Y）与四个侧视（±X ±Z，即剖面）是主视角；仰视（+Y）保留但不常用。**右下角 gizmo** 是唯一的切换入口（键盘 `7 / 1 / 3` 与 `Ctrl` 反向照 goal-pgviz §4 作为别名）：

```
            ┌──────────┐
            │    ●Y    │   点端点 = 对齐到该轴（150 ms 缓动）
            │ ○-X ┼ ●X │   当前轴高亮；负向暗淡
            │ ●Z  ○-Y  │   悬停 = 快放（下）
            └──────────┘
```

- 侧视时「切片」就是沿该轴的深度：`slice` 的单位随视线轴换成 x 或 z（顶栏读数与 ② 的滑块标签一起换），URL 里仍是 `view=… slice=…`。

**悬停快放**：② 视图段里有一个 **`+N 层`** 数字输入（默认 16，1…64）。鼠标停在 gizmo 上时，地图沿**当前视线轴**从当前切片向里逐层播放到 `slice + N`，再回到起点循环（约 12 层/秒，可在 `+N` 行悬停滚轮调速）；移开鼠标立即回到原切片。

- 目的：让人感受洞穴、山体、建筑**朝哪个方向走**——俯视时看到洞往下拐，侧视时看到山脊往里延伸。
- 停在 gizmo 的某个**端点**上时，按那个轴快放（不切换视角），可以在俯视下快速瞥一眼侧向的走势；点击才真正切换。
- 快放期间只改 uniform（切片深度），不重新生成；帧率跟着 GL，不触发生成器。

**显示空气距离**：`+N 层` 输入**下方**的开关。打开后在每个可见格上画一个数字：

| 值 | 含义 | 画法 |
|---|---|---|
| `-` | 当前切片面上就是实体（距离 0） | 画 `-` |
| `1`…`9` | 沿视线轴从切片面往里，还要穿过这么多格空气才碰到实体 | 画数字 |
| ≥ 10 | 太远 | 不画 |

- 「实体」= 当前可见图层谓词命中的格（goal-pgviz §5 的图层模型），所以只开「洞窟」时数的是到洞壁的距离，只开「植被」时数的是到树的距离。
- 数字在片元着色器里用 3×5 位图字体按格画，字号随缩放：一格 < 8 px 时整体不画（读数仍在探针卡里）。
- 和快放配合：快放时数字逐层变小，到 `-` 时那一格正好被切到。
- Agent 用法：`gd eval 'viz.airDist(x, z)'` 拿同一个数，不必读图上的字。

## 3. 调参闭环

**人**：④ 拖 `c_.Gen.*` → 防抖 200 ms → 只重算当前窗口（代际 id 取消过期任务，旧图保留到新图到达，goal-pgviz P3-2）→ 满意后 ↗ 进游戏 / 选区「在游戏里重生成」。

**Agent**（s12）：

```
gd go 'gode/viz/?g=gp&seed=20240607&view=top&layer=cave&mode=count&x=0&z=0&zoom=2'
gd set c_.Gen.lake.rate=0.08 c_.Gen.tree.dens.forest=6
gd shot --tag lake --vs -1          # 前后对照，进 gode/shots/
gd eval 'viz.stats()'               # 直方图 / 占比（goal-pgviz P2-6）：湖面积、树密度、洞穴空气按 y
```

- `viz.stats()` 返回数字，Agent 先看数字是否接近目标分布，再看图——比只看图便宜。
- URL 含全部视图状态和非默认 knobs（`&json=`，s09 §1），一条链接复现。

## 4. 阶段（替换 goal-pgviz §10）

| 段 | 内容 | 验收 |
|---|---|---|
| V1 | 生成器 Worker 起池（slicer 的 `gen` 动词 + `old / gp / liq` 适配器，从 M1-3/4 提前）；3D 纹理 + 地表图层 + **右下 gizmo 俯视 / 侧视** + 探针卡 + URL 同步；顶栏与 ① ②；**+N 快放与空气距离**（§2.1） | 三个生成器都能看俯视图，y 刻度按 `meta`；C4 转置检查 0 差异 |
| V2 | 图层 chip、群系、空气层叠 `count / depth3`、切片、`sample` 场热力图、统计 | goal-pgviz P2 验收 |
| V3 | `gg.pane` 参数段（M1-2 提前）、湖泊 `w/feat/lake.js`、树参数映射；宿主 B 联动重生成；⑤ 选区 | goal-pgviz P3 验收 + C10 |

## 5. 待议

- 宿主 B 的 `old` 生成器是 H 128 / XZY：V1 起是否就让宿主 B 用 `defl/g/old.js` Worker 生成（这样「宿主 B 重生成」与 pgviz 同源），还是宿主 B 保持原样只收 knobs
