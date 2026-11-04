# goal-pgviz —— 地形生成查看器 `pgviz/index.html?g=mini`

> 状态（2026-11-04）：设计已定，未动代码。三个阶段，每阶段独立可用、独立验收。
> 归属：goal-remix 的生成器线（步骤 0 / 2 / 3 / 7 的一部分提前到这里做）。渲染线（`?r=gl`）不受影响。

## 0. 目标

一个全屏的地形生成查看器：独立标签页，右上角 ±X ±Y ±Z 六向 gizmo；实时看地表、洞窟、矿脉、植被、群系，调生成参数，并让**同浏览器里打开的游戏端**（`index.html`）重生成对应区块（玩家修改清空）。

- 数据在 pgviz 里自己生成（Worker 跑生成器），不读游戏世界。游戏端只收参数和重生成指令。
- 一条 URL 复现一个视图（remix README 约定 5）。
- 同一套模块服务 UI 和 node CLI，旧 CLI 接口继续可用。

## 1. 已拍板

| 事项 | 决定 |
|---|---|
| 位置与名字 | `./pgviz/index.html?g=mini`。`gen.js` 挪进 `pgviz/mini.js`，生成器名叫 `mini`（goal-remix 文档里的 `g=old` 就是它，P1 末尾全文改名；`v1 / v2` 不变） |
| genscope | 并入 pgviz（2D 热力图 = 一种图层；项树面板在生成器有 `explain` 时出现），不再单独做 `tools/genscope.html` |
| 世界边界 | genview 来自 goodLiqPG（y −64…319，u16 id，列优先布局），mini 是 y 0…127、u8。**UI 一律按生成器描述符里的边界走**（§3.1），ESM 化可以后做 |
| 层叠 | 只做**空气层叠**，不做 XRay（实体不半透明）。见 §5 |
| 图层 | 洞窟、矿脉、植被、群系等各自成层，可单独查看（图层列表，§5） |
| 参数不进存档 | 存档只存方块。参数是开发态：pgviz 持有、连接时推给游戏端；游戏端显示"参数偏离默认"，不写入存档（§7） |
| 转发 | `index.html?ui=pgviz&g=mini&seed=…` 在新标签页打开 pgviz，参数原样带过去（§6） |
| CLI | `goodLiqPG/tools/preview_world.mjs`（供体，不改）的参数继续可用；`tools.md` 规划的 `tools/genview.mjs` 参数全部支持。两者与 UI 共用 `pgviz/lib/` |

## 2. 现状（已核实）

- `gen.js` 是 classic script：`(() => { const {THREE, JSZip, AIR, B, CHUNK_H, CHUNK_W, DIRS, Noise, Rand, SEA_LEVEL, bidx, … } = gg; … Object.assign(gg, { BIOMES, …, Terrain }) })()`，生成时调 `gg.world.setBlockGen`（跨块写入进 `pendingFeatures`）。靠 `index.html:1038` 的 `<script defer src="gen.js">` 加载。
- `Noise / Rand / hashString`（`index.html:394–`）、`Blocks / B`（`:612`、`:692`）、`bidx = (x<<11)|(z<<7)|y`（`:371`）、`CHUNK_H = 128`（`:362`）、`World / Chunk`（`:1060`、`:1086`）都在 `index.html` 的内联 module 里，**不能直接 import**。pgviz 要在页外跑 mini，必须有一个 `gg` 子集的 shim。
- XRay 已有"在沙箱里重生成同 seed"（`index.html:1366`，`gen(c)`：先生成 3×3 再读中间），并注明**树叶的生成不幂等**（跨块溢出顺序相关）。这意味着 pgviz 与游戏端逐字节一致的比对要屏蔽树叶（§8 C2）。
- `index.html` 目前只读 `tex / xyzb / r` 三个 URL 参数，没有 `seed / g`（remix 步骤 0 未做）。
- `tools/asm.mjs` 里的 `gen.js` 是历史一次性拆分脚本（读 `/tmp/sec`），不用管。引用 `gen.js` 的文档：`doc/lib.md`、`doc/xyzb/chunks_dat.md`、`doc/mat/world-gen.md`、`goal-remix/{README,layout,gen}.md`，搬家时顺手改。

## 3. 架构

```
pgviz/
  index.html          页面（?g=mini&seed=…&view=top&x=…&z=…&layer=…）
  app.js              UI 装配：相机、gizmo、图层列表、面板、探针、URL 同步
  mini.js             原 gen.js，P1 内容不动（classic script，经 shim 加载）
  liq.js              goodLiqPG 适配器（读它的 ESM，不拷贝；vendor/liq 就绪后改指向）
  shim.js             给 mini.js 的 gg 子集（Noise/Rand/… + BoxWorld：chunks / setBlockGen / pendingFeatures）
  lib/                UI 与 CLI 共用，无 DOM 依赖
    desc.js           生成器描述符契约 + 注册表
    prng.js           Noise / Rand / hashString（从 index.html 抽出，index.html 也改为 import 它）
    volstore.js       体素窗口（环形寻址）、区块进出
    gen-worker.js     Worker 本体（浏览器 Web Worker / node worker_threads 同一份，环境差异一个适配层）
    classes.js        方块 id → 图层谓词（洞窟 / 矿 / 植被 / 水…）
    palette.js        方块色、群系色、深度 / 层数 colormap、图例数据（取自 preview_world 的表，记来源）
    cpu-march.js      射线步进的 CPU 参考实现（CLI 出图、GL 的对拍基准）
    stats.js hash.js  直方图 / 占比 / 区块哈希
  gl.js               WebGL2 渲染器（3D 纹理 + 轴向步进着色器）
tools/genview.mjs     CLI（§9）
tools/verify-pgviz.mjs  cdp 验证（§8）
```

### 3.1 生成器描述符 `GenDesc`

UI 只认描述符，别处不写 `if (g === 'mini')`。

```
{ id, name,
  y0, h, sea,                      // 世界 y 范围 [y0, y0+h)、海平面（用生成器原生坐标；UI 可切"显示为宿主 y"）
  chunk: 16,
  idBits: 8 | 16,
  blocks: { name(id), color(id), cls(id) },   // 名字、色、图层类别
  biomes: [{ name, color }],
  fields: [{ key, label, range, fn(x,z) }],   // 2D 标量（genscope 的热力图）：高度、温度、湿度、大陆度…
  knobs:  { key: { def, min, max, step, group, label } },
  genChunk(cx, cz) → { ids: Uint16Array[16*16*h], biome: Uint8Array[256], top: Uint16Array[256] },
  explain?(x, y, z) → Term }       // 可选：项树
```

- 规范体素布局取 liq 的原生布局 `idx = (y*16 + z)*16 + x`，mini 在 Worker 里一次性转置（`bidx` 是 `x<<11|z<<7|y`）。**转置是已知的坑**，gate 见 §8 C4。
- 体素统一存 `Uint16`（mini 的 u8 放大）。体素预算 ≈ 96 MB：`h × (2R)² × 2 B`，默认半径 `R_mini ≈ 256`、`R_liq ≈ 160`（描述符算，UI 显示）。纹理是 R16UI 3D，**环形寻址**：平移只上传新进入的区块，着色器里 `mod(pos, size)`。
- `top` = 该列最高的"地形"方块 y（不含树叶 / 原木 / 植物 / 流体），着色器用它判断"洞窟空气 = 空气且 y < top"。
- 窗口之外（缩得更远）退到列级 2D：`fields` 与群系（`desc.column(x,z)` 便宜）。这是 P2 的事。

### 3.2 渲染

不走 goodGL 管线。GL 一个全屏三角形，片元着色器沿视线轴对 3D 纹理 `texelFetch`：

- 6 向正交时视线轴对齐，逐层采样即可，**不需要 DDA**；hit 判定 = 当前可见图层的谓词（id → 图层位掩码的 LUT 纹理，图层开关是 uniform）。
- 只在状态变化时重绘（无动画循环）。1080p × 384 层 ≈ 8 亿次取样，单帧可接受；拖动时降到 1/2 分辨率。
- 任意角度（轨道旋转、透视）要 3D DDA，放在 P3 末尾，**可砍**：用户要的是六向 gizmo。

### 3.3 生成与流式

- P1 单 Worker，最近优先流式出区块，**区块"就绪"= 它的 3×3 邻居都生成过**（跨块树的溢出，同 XRay）。量出 ms/块写进本文件。
- 多 Worker 按瓦片（如 8×8 区块 + 1 圈 halo，halo 重复生成）并行，P3 看数据再定。remix README 对 v2 的态度一样：先在一个线程里跑，量出卡顿再说。

## 4. 交互

- **全屏 canvas**，叠加层：右上 gizmo、左上图层列表（P2）、右侧参数面板（P3，Tweakpane，importmap 与宿主一致）、底部坐标 / 区块 / 群系读数、左下比例尺。
- **Gizmo**：2D 画布，六个端点（X 红、Y 绿、Z 蓝，负向暗淡），当前轴高亮。点击端点 → 相机 150 ms 缓动对齐。键盘：`7 / 1 / 3` = 俯 / 前 / 右，`Ctrl` + 同键 = 反向（同 Blender 小键盘）。视线轴：Y 向是俯视 / 仰视，X / Z 向是侧视（剖面）。
- **相机**：拖动平移，滚轮朝光标缩放，`G` 切区块网格线，`F` 回到玩家位置（有连接时）。
- **探针**：悬停显示世界坐标、方块名、群系、生成器 `fields` 各项；点击锁定；锁定后 "在游戏里传送到这里"（有连接时）。
- **URL 同步**：`g seed view x z y zoom layer mode slice knob.K=V`，改动即写回地址栏（replaceState），复制 URL 即复现。

## 5. 图层与层叠

**统一模型**：一个图层 = `(谓词, 着色函数, 合成规则)`。着色器沿射线取"满足任一可见图层谓词"的前 K 个命中；K=1 且不透明是默认；K>1 用 alpha 叠加。

内置图层：

| 图层 | 谓词 / 数据 | 着色 |
|---|---|---|
| 地表 | 第一个非空气、非流体、非植被 | 方块色 / 群系色 / 高度 / 坡度（下拉） |
| 水体 | 流体 | 深度渐变 |
| 洞窟 | 空气且 `y < top(x,z)` | 空气深度（见下） |
| 矿脉 | 矿石 id；子项按矿种（煤 / 铁 / 金 / 钻石 / …）各自开关和颜色 | 矿色；其余全部不参与（"单独查看"= 谓词过滤，不是半透明） |
| 植被 | 树（原木 + 树叶）/ 草花 / 作物与仙人掌 | 方块色 / 树叶按高度 |
| 结构 | spawner / chest / obsidian 等 | 方块色 |
| 群系 | 列级字段（2D 纹理） | 叠在地表上（alpha）或单独成图；图例列出当前窗口里出现的群系和面积占比，点击 = 只看它 / 隐藏它 |
| 场（genscope） | `desc.fields[k]` | colormap + 等值线 + 图例；窗口外也能画 |

图层列表：每行 眼睛 / 独奏 / 不透明度 / 着色方式；拖动排序 = 合成顺序；独奏时其余全部不参与。

**空气层叠**（"z-index"），两种模式，都是只染空气腔、实体不透明化也不半透明：

- `count`：沿视线数"洞窟空气腔"的个数（最大连续空气段，厚度 ≥ `minThick`，默认 1，可调 1–4，避免悬垂下一格缝也算），离散色 0 / 1 / 2 / 3 / 4+，图例是色块带计数。
- `depth3`：取前 3 个空气腔，各自按"距视点的深度"过 colormap，alpha 逐层递减（默认 0.55 / 0.40 / 0.30，可调），按近到远合成。底图（地表）默认 α = 0，也就是"不 XRay"；可以拉起来垫底。图例：深度 colorbar（刻度单位是格，相对视点）+ 第 1 / 2 / 3 腔 alpha 色块。
- 另有**切片**：沿视线轴的 `[d0, d1]` 范围滑块；层叠不够看时用剖面。Y 向切片就是等高图。

洞窟判定的已知局限：拱 / 石林这类悬空地形的下方空气会被算成洞窟（`y < top`）。genscope 的 remix 步骤 6 之后再看要不要换定义。

## 6. 游戏端转发与连接

- `index.html` 在启动最早处读 `ui=pgviz`：
  1. 通过 `BroadcastChannel('pgviz')` 发 `ping`，等 250 ms；有 `pong` = pgviz 已打开 → 只在游戏里提示"pgviz 已连接"，不重复开。
  2. 否则 `window.open('pgviz/index.html?' + 其余参数, '_blank')`。**弹窗拦截**：页面加载时没有用户手势，多半被拦；`open` 返回 `null` 时在页面角落显示一个一键链接"在新标签页打开 pgviz"。游戏标签页继续正常运行（它就是重生成的目标）。
- `ui=pgviz` 同时打开游戏端的 `?pgviz` 钩子（P3 的重生成与参数应用）；正常路径不带它。
- 依赖：`index.html` 要读 `seed / g`（remix 步骤 0 的子集；`g` 目前只认 `mini`，其他值 `console.warn` 后退回 `mini`）。接入点是 `Title.boot` / `Game.start(seed)`，**P1 先查清**。
- 前提：同源（`http://localhost:8765`）。`file://` 下 `BroadcastChannel` 不通，页面检测到时提示。

## 7. 参数、重生成与存档（P3）

### 参数

- `mini.js` 里的字面量按"地表 / 洞窟 / 矿 / 植被"四组改成 `KNOBS` 表（默认值不变，哈希 0 差异，§8 C1），描述符的 `knobs` 由它导出，面板按表生成。`Terrain.init` 里有 `colCache`：**改参数后必须清它**，否则重生成读到旧列。
- **不进存档**：pgviz 把当前参数存在 `localStorage['pgviz.knobs.mini']`，连接时推给游戏端；游戏端 HUD 显示"参数 ≠ 默认（哈希 xxxx）"，存档照旧只有方块。游戏重新载入、pgviz 没连时回到默认值 → 旧区块和新区块在接缝处有落差，**这是预期**，文档里写明。
- 参数确认后"固化"：pgviz 导出 `knobs.json` 和一段可粘贴的 `KNOBS` 默认值补丁，手工并进 `mini.js`。

### 重生成协议（`BroadcastChannel('pgviz')`，带 `v` 版本号）

| 方向 | 消息 | 内容 |
|---|---|---|
| 游戏 → pgviz | `hello` | seed、g、参数哈希、玩家位置、已加载区块范围 |
| 游戏 → pgviz | `pos` | 玩家位置 / 朝向，约 10 Hz（图上画标记） |
| 游戏 → pgviz | `edits` | 有玩家修改的区块清单（`c.modified`）：pgviz 在图上标出"重生成会清掉这些" |
| pgviz → 游戏 | `knobs` | 参数 patch + 哈希 |
| pgviz → 游戏 | `regen` | 范围：`view` / `around N` / 框选；`clearEdits` |
| pgviz → 游戏 | `tp` | 传送 |
| 游戏 → pgviz | `regen-done` | 区块数、耗时、被清掉的修改数 |

### 游戏端重生成（沿用 XRay 的做法，XRay 已经证明"生成 3×3 再读中间"）

1. 目标集合 `T` = 范围 ⊕ 1 圈。**扩一圈**是因为邻块的树 / 结构会溢出进来；只清范围会把边上的树削断。
2. 对 `T` 内每个区块：`state = CH_EMPTY`、清 `blocks / meta / height`、去掉 `modified` 标记、删 `stored` 里同 key 的存档项、删 `world.pendingFeatures` 里对应项。
3. 按环序重新 `Terrain.generateChunk`；之后光照（`CH_LIT`）与网格化沿用 `ChunkManager` 正常流程，标脏。
4. 范围默认是"当前加载的全部区块"；框选是选项，UI 提示**框边会有接缝**（全局参数改动不是局部的）。
5. 有玩家修改时先弹确认，显示将清掉的格数（`edits` 消息里的计数）。
6. **待查**：箱子 / 刷怪笼等方块实体的存放位置；区块里的实体 / 生物是否要清；`stored` 里 `T` 外但在范围内的未加载区块（同样要删）。

## 8. 验证（与 goal-remix 同样的 0 px / 哈希口径）

| 编号 | 内容 | 门槛 |
|---|---|---|
| C1 | `gen.js → pgviz/mini.js` 搬家、`Noise / Rand` 抽成 `prng.js`、`KNOBS` 化：游戏端同 seed 的 32×32 区块逐块哈希 | 搬家前先存基线（`tools/hash-world.mjs` 经 cdp 在宿主里取）；之后 0 差异 |
| C2 | pgviz（shim）生成 vs 游戏端生成，同 seed 同区域逐块哈希 | **屏蔽树叶**（XRay 的备注：树叶生成不幂等）后 0 差异；叶 / 原木差异格数单独报告 |
| C3 | CLI `--hash` 与 UI 里的区块哈希叠加层一致 | 逐块相等 |
| C4 | 转置检查：mini 的列高度图（`Terrain.heightAt`）与体素里读出的 `top` 逐格相等 | 0 差异（抓 x / z 转置） |
| C5 | `?g=liq` 能载入，y 范围 / 刻度 / 切片滑块按 −64…319 走 | 目测 + 断言 |
| C6 | CPU 参考实现与 GL 对拍：同相机、同图层，cdp 读回 | ≤ 1 LSB（P1 只对表面视图，P2 起含层叠） |
| C7 | shim 的 `gg` 成员清单：用 `Proxy` 包 `gg` 跑一遍 mini，记录实际读到的成员，和 shim 比 | 缺一项即失败；shim 不得有多余的宿主行为 |
| C8 | 宿主方块 id 表：`tools/dump-ids.mjs` 经 cdp 导出 `gg.B` → `pgviz/lib/block-ids.json`；`check.mjs --pgviz` 比对现场 `gg.B` | 相等；`palette` 里未着色的方块数 = 0（同 bench 的"unmapped = 0"） |
| C9 | 转发：`?ui=pgviz`：无 pgviz → 开新标签 / 回退成链接；有 pgviz → 不重复开 | cdp 双页 |
| C10 | 重生成：游戏端手工改一格 → `regen` → 该格复原；`T` 外的区块逐字节不变；树不被削断 | 自动 |

`tools/check.mjs --pgviz` 把 C1 / C7 / C8 / C4 放进快速门；C6 / C9 / C10 放 `verify-pgviz.mjs`。这些脚本都要 `killStray()`。

## 9. CLI

- `tools/genview.mjs`：`--g mini|liq`（后续 `v1 / v2`）、`--seed`、`--size`、`--cx --cz`、`--hash N`、`--hist`、`--stats`、`--at x,z[,y]`、`--knob K=V`，加上 `--view top|bottom|north|south|east|west`、`--layer …`、`--mode stack|depth3`（用 `lib/cpu-march.js` 出 PNG，参数同 UI 的 URL）。
- 兼容 `preview_world.mjs` 的参数：`--seed --size --cx --cz --workers --skip-map --bench`，别名映射到上面，输出同样的 `/tmp/world_top.png` 等文件名。`preview_world.mjs` 本身是供体，**不改**；`lib/palette.js` 的色表从它复制并标注来源。
- 目标（非硬门槛）：`genview --g liq` 的俯视图与 `preview_world` 的 `world_top.png` 同参数下逐像素相等；不等就把差异登记成文，不强求。
- Worker：`lib/gen-worker.js` 一份，浏览器用 `Worker`，node 用 `worker_threads`。

## 10. 三个阶段

### P1 —— 骨架与数据通路：能看见地表，六向可切

| # | 事项 |
|---|---|
| 1 | **前置基线**：`tools/hash-world.mjs`（cdp 取宿主 32×32 区块哈希），存 `tools/out/ref/pgviz-c1.json`（C1 基线，搬家前） |
| 2 | **搬家**：`gen.js → pgviz/mini.js`，`index.html:1038` 改路径；`Noise / Rand / hashString / clamp / lerp / smoothstep` 抽成 `pgviz/lib/prng.js`，`index.html` 内联 module 改为 import；改文档引用（§2 清单）；C1 验收 |
| 3 | **shim + 描述符**：Proxy 测成员清单（C7）→ `shim.js`（含 BoxWorld）；`block-ids.json`（C8）；`desc.js` + mini 描述符；C2 / C4 验收 |
| 4 | **liq 适配器**：`pgviz/liq.js` 直接读 `goodLiqPG/src/world/gen/*`；`?g=liq` 能载入，边界按描述符走（C5）。这一步的意义是**尽早验证"边界不同"的抽象**，而不是为了 liq 本身 |
| 5 | **Worker 流式生成 + 体素窗口**（单 Worker，最近优先，3×3 就绪，环形寻址）；量 ms/块、内存，写回本文件 |
| 6 | **GL 渲染 + 相机**：R16UI 3D 纹理，6 向正交的"第一个非空气"（地表图层，方块色 / 群系色 / 高度三种着色），平移 / 缩放；`cpu-march.js` 的表面版 + C6 |
| 7 | **gizmo + 键盘 + 探针 + URL 同步** |
| 8 | **转发**：`index.html` 读 `ui / seed / g`（先查 `Title.boot` / `Game.start`），`BroadcastChannel` 的 `ping / pong / hello / pos`（只读，没有 regen），弹窗被拦时的回退链接；C9 |
| 9 | **CLI 第一版**：`genview.mjs` 的 `--g --seed --size --cx --cz --hash --at --view top`，`preview_world` 参数别名；C3 |
| 10 | **文档同步**：goal-remix 里 `g=old → g=mini`，`tools.md` 把 genscope 条目指向本文件，README §3 步骤 3 / 7 加一句 |

验收：`?g=mini&seed=20240607` 看到俯视地图，gizmo 六向可切（侧视是剖面）；`?g=liq` 能载入且 y 刻度正确；`?ui=pgviz` 能转发；`check.mjs --pgviz` 通过；人确认"这张图和游戏里看到的是同一个世界"。

### P2 —— 图层与层叠：洞窟、矿脉、植被、群系各自可查，空气层叠可看

| # | 事项 |
|---|---|
| 1 | **图层模型**：谓词 LUT 纹理、`classes.js`（id → 位掩码）、着色器改成"前 K 个命中"；`cpu-march.js` 同步 |
| 2 | **图层列表 UI**：眼睛 / 独奏 / 不透明度 / 着色方式 / 拖动排序；矿脉与植被的子项 |
| 3 | **群系图层**：列级 2D 纹理、叠加 / 单独、图例（出现的群系 + 面积占比 + 点击独奏） |
| 4 | **空气层叠**：`count` 与 `depth3` 两种模式，图例（离散色块 / 深度 colorbar），`minThick` 与 alpha 参数；切片滑块 |
| 5 | **场（genscope 并入）**：`desc.fields` 热力图 + 等值线；窗口之外的列级显示；`explain` 项树面板（生成器有就出，mini 先没有） |
| 6 | **直方图与统计面板**：地表 y、洞穴空气按 y、各矿按 y；与 `genview --hist / --stats` 同源（`stats.js`）。目标分布线（例如 README §1 的数字）可叠加，用于"改参数 → 对照目标" |
| 7 | **CLI 第二版**：`--layer --mode --hist --stats --knob`（`knob` 在 P3 前只是参数透传，mini 还没有 `KNOBS`） |
| 8 | **对拍**：C6 扩展到全部图层与层叠模式 |

验收：每个图层单独打开画面符合预期（矿脉只剩矿点、植被只剩树草、群系图例面积加起来 100%）；`count` 图里已知多层洞窟的位置层数 > 1；C6 通过；人用它回答"洞窟为什么这么稀 / 这个群系哪来的"。

### P3 —— 实时联动：改参数，游戏里重生成

| # | 事项 |
|---|---|
| 1 | **`KNOBS` 化 mini**：地表 / 洞窟 / 矿 / 植被四组，默认值不变（C1 0 差异）；改参数清 `colCache` |
| 2 | **参数面板**：由描述符 `knobs` 生成（Tweakpane），防抖；改动后只重算当前窗口，**旧结果保留到新结果到达**，用代际 id 取消过期任务；`localStorage` 持久化；导出 `knobs.json` / 默认值补丁 |
| 3 | **协议补全**：`knobs / regen / tp / edits / regen-done`；游戏端 `?pgviz` 钩子（开发态，正常路径没有） |
| 4 | **游戏端重生成**（§7）：⊕1 圈、清存档项与 `pendingFeatures`、重光照 / 重网格；`edits` 在 pgviz 里标出；确认弹窗；先查清 §7 的待查三项；C10 |
| 5 | **游戏端提示**：HUD "参数 ≠ 默认（哈希）"，存档不记录 |
| 6 | **多 Worker**（只有在 P1 量出的 ms/块让改参数的反馈 > 约 1 s 时才做）：瓦片 + halo |
| 7 | **分阶段缓存**（同上条件）：基础地形 → 洞窟 → 矿 → 装饰，只改矿参数只重跑矿阶段。要求生成器暴露阶段边界；与 gen.md 的 `off` 钩子 / `explain` 一起设计 |
| 8 | **可选，可砍**：轨道旋转与透视（3D DDA，拖动时降分辨率） |

验收：改一个洞窟参数 → pgviz 里洞窟图层即时变化 → 点"重生成" → 游戏里同区域洞窟变了、手放的方块没了（确认弹窗给了数字）、`T` 外逐字节不变（C10）；人确认"调参 → 看图 → 进游戏看"这条链顺手。

## 11. 不做

- 与 goodGL 管线共用渲染代码（pgviz 是调试工具，要轻）。
- 参数写入存档、参数的迁移机制。
- XRay 式的实体半透明层叠（只做空气腔）。
- mini 的 ESM 化（shim 加载够用；goal-remix 步骤 2 做 pgen 时顺带）。
- 洞窟的更细分类（洞窟 / 裂谷 / 溶洞）：生成后无法可靠反推，需要生成器自己打标，等 v2 的 `explain`。
- 多人 / 跨机器连接（`BroadcastChannel` 只有同浏览器、同源）。

## 12. 风险与待查

| 项 | 说明 |
|---|---|
| 弹窗拦截 | `window.open` 无用户手势多半被拦，已有回退链接（§6） |
| `seed / g` 入口 | 宿主现在没有；`Title.boot` 的存档槽逻辑可能和"一次性世界"冲突，P1 第 8 项先查 |
| 树叶不幂等 | pgviz 与游戏端的树叶 / 原木字节不保证相同；§8 C2 屏蔽，viewer 里的树是"典型"而非"逐格精确" |
| 内存 | R16UI 3D 纹理 ~96 MB；低显存设备要调小半径（描述符 + URL `r=`） |
| 方块实体 / 生物 | 重生成时的处理（§7 待查） |
| 参数偏离造成的接缝 | 预期，已在 §7 说明 |
| `MAX_3D_TEXTURE_SIZE` | 一般 ≥ 2048，够；P1 第 6 项启动时检测并报错 |
