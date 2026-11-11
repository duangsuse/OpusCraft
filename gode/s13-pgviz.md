# s13 · pgviz：地形查看与交互调参（M0）

> 上游：`goal-pgviz.md`（全文；本节只写 gode 的差异）；s02 §2 生成器 Worker 契约、§2.1 `c_.Gen` knobs；s12 Agent 工具。
> UI 参考：`techstack/res/minecrafttools.wiki/*-L.webp`（seed map）、`techstack/res/craftplicator.com/*-L.webp`（mcweb）。
> 用途：**人和 Agent 都用它调地形参数**——人拖滑块看图；Agent 用 URL + `gd snap`（pgviz 不是宿主 B，`shot` 的机位不适用）闭环。

## 0. 调用（先看这个；11-10 全部实测）

静态服务在 `http://localhost:8765/`（`node gode/tools/dev.js` 或任意 `-c 1` 的服务器）。两条路等价：

```bash
# 人：浏览器直接开
http://localhost:8765/gode/viz/?g=gp&seed=20240607&pv=Y&p1=@0,0&zoom=2

# Agent：gd 守护进程（无头用 GD_HEADLESS=1）
gd up
gd go 'gode/viz/?g=gp&seed=20240607&pv=Y&p1=@0,0&zoom=2'
gd snap --tag viz-gp          # pgviz 用 snap（shot 是宿主 B 的机位截图）
```

最少三个参数：`g`（生成器）+ `seed` + `pv`（视角 / 切片）。`pv` 写法：

| `pv=` | 含义 |
|---|---|
| `Y` | 俯视地表 |
| `Y:80` | 俯视 + 切到 y=80（**Y 切片**；② 的滑块与 Shift+滚轮同步） |
| `-Y:80` | 仰视，切面在 y=80 |
| `south` `north` `east` `west` | 侧视；`:n` 是沿该轴切到 n（单位随轴换 x / z） |

其余常用键：`p1=@x,z[^y]` 视口中心、`zoom`（px/格）、`shade=block|biome|height`、`xray=N`（切片透视，见 §2.1）、`layer=`、`sel=x0,y0,z0,x1,y1,z1`、`kw=<点号键>:值,…`（例 `kw=river.width:0.02`）。


**群系图册**：`node gode/tools/biomeshots.mjs <gen> [<name>[&<urlparams>]]` —— 逐个群系拍一组
`top`（地表，关切片）/ `side`（南侧视）/ `slc`（**多层切片**）/ `mine`（俯视 + `shade=height`，洞窟 / 空气深度视图），
存 `gode/shots/<seed>/<gen>/{top,side,mine}/<群系名>.webp` 和 `<seed>/<gen>/slc/<群系名>/@<Y>.webp`（按 seed 分目录、不按日期；层高随群系变，所以 slc 按群系分目录、Y 在文件名里）；
同时写 `<gen>/biomes.tsv`（中心点 `x,z`、`hSample`/`hTop`/`block`、`sample` 的温度/湿度/山地/大陆度、`slcY`/`slc`/`slcAir`/`air`、`top`/`side`/`mine` 路径）。
`<name>` 省略或 `all` = 全部；`&` 后是附带 URL 参数（默认 `g=<gen>&seed=20240607&pv=Y&z=5&terr=1&tod=14.08`，后面的覆盖前面的）。两个**本地**参数（不进页面 URL）：`views=top,side,slc,mine` 只拍其中几项（调山体时 `views=side` 约 4 s/群系），`side=auto|north|south|east|west`——`auto` 用 `viz.silhouette()` 在四个方向里挑「起伏 relief + 0.05×悬挑列」最大的一侧，方向写进 `biomes.tsv` 的 `sideView` 列，`gd open` 会按它恢复视角。

**回到某张图**：`node gode/tools/gd.js open gode/shots/<seed>/<gen>/{top,side,mine}/<群系名>.webp`（或 `.../slc/<群系名>/@<Y>.webp`，或拼图 `.../slc/<群系名>_going_deeper.webp --nth N`，N 从 1 = 最高层，缺省 1）——
按 `<gen>/biomes.tsv` 首行的参数与那一行的 `x,z` 重新导航（`p1=@x,z`）+ 设 `view`/`mode`/`slice`/`shade`/`xray`，并恢复拍图时的 UI（左栏 `nosd`、隐藏 gizmo / 右上竖条 / toast，所以 canvas 尺寸与像素对应关系和截图一致）。输出：
`layers`（slc 的全部层路径，`*` 标当前打开的那层）、`probe`（中心点，含 `sample`）、`canvas`（尺寸 / 偏移 / dpr：`--px` 用图里的像素，换算 `canvas = px - rect.left/top`）、`state`（view/mode/slice/xray/shade/zoom）、
`depth`（slc/mine 默认带，`viz.depth` 的曲线）、可选 `point`（`--px X,Y` 读该像素下的块 + sample）、`sel`（`--px X,Y --sel` 顺手左键选中，之后 `viz.stats()` 就算这块）。
Agent 侧看「侧视像不像山」用两个新 API（不截图也能给数字）：
`viz.profile({axis:'x'|'z', at, from, to, n})` → 每列 `top / air / firstAir / have` + `relief / hollows`（竖直剖面）；
`viz.silhouette({view:'north'|'south'|'east'|'west', x, z, width, span, n})` → 正交侧视的天际线（沿视线方向取每列最高实体）+ `relief / hollows`（顶块下 4 格内有空气的悬挑列）。
之后照常 `gd eval` / `gd snap`；`gd open` 不会改图册文件。

**slc 层高**（11-10 起替掉固定 `Y=110` —— 山顶和海底切同一刀没意义）：

| `&slc=` | 层 |
|---|---|
| `auto`（默认） | 中心列**真地表** `min(hSample, hTop)` 的 **0.9 / 0.6 / 0.3 / 0.1**：深海海底 98 → 88/59/29/10，高山 200 → 180/120/60/20；同一比例跨群系同义 |
| `auto:N` | 均分 N 层（0.9→0.1，N ≤ 8） |
| `Y1,Y2,…` | 绝对高度（`&slc=110`、`&slc=110,64` 是旧用法 / 定点对比） |

- 层高按 `min(hSample, hTop)` 算（水域的 `hTop` 是水面 / 冰面，深海一律 126，直接用会切出一层水；取小的才是海底）、夹在 `0…meta.h-1` 并去重，所以低群系不会退化重复。
- `air` 列 = 每层以中心为原点、`33×33` 格（步长 8）采 `viz.airDist` 的「空气占比 / 平均空气格数 / 最大」——不开图也能读洞穴开敞度。
- 每层默认开 `xray=12`（11-10）：切片面往里 12 格做**前到后半透明合成**——实体按 0.26、水 0.14 的 alpha 叠（越近越实），地表以下的空气染成紫色薄雾。于是矿洞 / 空腔 / 矿脉在后面透出来，不再只是一张截面；`&xray=N` 改厚度（0…64，0 = 关）。
- `depth` 列 = 逐 Y 组成曲线（JSON：`bin` 格一档，`air`/`water`/`lava`/`ore` 千分比，围绕中心 17×17 列采样）。调 3D 洞穴先看这条线：想要 y=-40 附近 12% 空气，直接看那一档。
- `mine` 是现成的 `shade=height`（洞窟）视图：颜色 = 空气柱底的高度，矮洞压暗 —— 一张图看整列的空气深度。
- **grid**（跑完顺手，有 ffmpeg 才做）：`slc/<群系名>/` 的各层拼成 **`slc/<群系名>_going_deeper.webp`** —— 2 列行优先、Y 从高到低（= tsv `slcY` 顺序），每格缩到 640×360、四周 8 px 黑边，整张 1312×752；Agent 一次 Read 看完整列剖面。派生图不进 `biomes.tsv` / `index.tsv`，`GD_NOGRID=1` 关；`node gode/tools/biomeshots.mjs grid <gen>[&seed=…]` 可单独补（不连浏览器）。

中心点：`viz.jump('@0,0')` 起（11-10 起固定起点，重跑 / 换顺序都得到同一个中心）→ `bioSearch` 最近出现处 → ±256 格 `bfind`（步长 8）→ 优先陆地命中（`sample.h > meta.sea+1`，≥8 个且 ≥10% 时）取质心 → 最近命中点；最后复验 `sample.biome`。
顶栏 X/Z 两个输入框临时填 `@x,z` 和群系名（只改 value，不回车）；截图前隐藏 gizmo / 右上工具条 / toast，左栏 `nosd`。
gd 的 `--tag` 不支持路径（会 slug 成 `_`），所以工具按默认名截图后把文件搬到目标目录，并同步改 `shots/index.tsv` 该行的 `files`（同 tag 旧行清掉，免得 prune 删到当前文件）。

**`g` 不限于短名**：`mini/gp/liq/old/pg1/luan0/luanV/veg` 映射到 `defl/g/<名>.js`，其它值按 URL 解析（相对或绝对），所以新生成器**不改 viz 也能先看**：

```bash
gd go 'gode/viz/?g=../defl/g/v3.js&seed=20240607&pv=Y&p1=@0,0'
```

Agent 侧 API（`gd eval '<js>'`，异步的用 `await`；页面里也可直接调）：

| 调用 | 作用 |
|---|---|
| `await viz.ready()` | 3D 窗口 + 外圈 2D 全部到齐并画完；**生成器脚本 404 / 语法错时立刻抛错**（11-10 起，不再干等 40 s） |
| `viz.stats()` | 当前窗口：块数 / 在途 / ms·块 / 池 / 代 / `clipped` / `errors` |
| `viz.stats({sel:[x0,y0,z0,x1,y1,z1]})` | 区域统计（方块 / 群系 / 水 / 树 / 洞 / 噪声场）；`{base:true}` 钉基线、`{vs:'base'}` 对比；`{depth:true}` 额外回 `depth`（= `viz.depth`，取选区中心） |
| `viz.probe(x,y,z)` | 单格：原始 `v`、`type`、`meta`、`name`、群系、地表 y、`sample`（越界给 `-1`） |
| `viz.depth({x,z,n,step,bin})` | **逐 Y 组成曲线**（矿洞 / 切片用）：中心 `n×n` 列（默认 17、步长 16）按 `bin` 格（默认 4）分档，回 `air`/`water`/`lava`/`ore` 千分比数组 + `x0,z0,cols,H`；只算已载入的格（缺的不进分母）。`viz.stats({sel:…, depth:true})` 会把同一份曲线挂在区域统计的 `depth` 上 |
| `viz.at(px,py,{sample:true})` | 屏幕点（canvas CSS 像素，左上原点）→ 沿视线步进到第一个实体：世界点 `p`、方块名、群系、列 `h/surface`、`dist`、`hit/water`，可选按列取 `sample`；`viz.click(px,py,btn)` / `viz.hover(px,py)` 是它的输入路径（左键 = 选中） |
| `viz.params()` / `viz.tune({...})` / `viz.set(k,v)` | knobs 的 schema + 当前值 / 改一批并重算 / 改一个 UI 键（`slice`、`view`、`g`、`seed`…） |
| `viz.regen()` | 同参数重生成（改完生成器文件后） |
| `viz.airDist(a,b)`、`viz.layers()`、`viz.seam({at:[[cx,cz],…]})` | 视线空气距离 / 图层 / 接缝检查 |
| `viz.bioLocate(id)` / `viz.bioSearch(id)` / `viz.bfind({x0,z0,n,step,want})` | 群系 finder（§16）：窗口里定位 / 向窗口外扫描 / 直接问一个 512 格见方的块 |

**加一个生成器**要动这几处（按顺序）：

1. `gode/defl/g/<名>.js`（s02 §2 契约：`meta / onkwarg / gen / sample`，`serve(import.meta.url)` 收尾）
2. 想进下拉框：`gode/viz/index.html` 的 `<select id="gsel">` 加一项
3. 想用短名 `?g=<名>`：`gode/viz/app.js` 与 `gode/main/boot.js` 的 `genUrl` 白名单（否则就用 `?g=../defl/g/<名>.js`，两处都不用改）
4. 想进 `gd check --matrix all`：`gode/tools/gd.js` 的 `MATRIX_GENS`
5. 文档 / 基线：s02 §4 的表、本文件、`gode/tools/baseline.tsv` 第一列、`defl/c_.json` 的 `c_.Bench.poses['<seed>@<名>']`

> 打包型生成器（`veg`）：产物在 `vendor/v3/terrain.mjs`，由 `node gode/tools/build-v3.mjs` 生成，`--check` 比对；改了 goodPG 源码就重跑它，别手改产物。

## 0.1 已定 [11-09]

| # | 决定 |
|---|---|
| V-1 | pgviz 放进 **M0**，位置 `gode/viz/index.html`（`localhost:8765/gode/viz/?g=gp&seed=…`） |
| V-2 | **不再有 `GenDesc` / shim**：pgviz 直接起 s02 的生成器 Worker（同一个 `defl/g/<名>.js`），用 `onkwarg / gen / sample / explain` 和 `meta`（`sea names biomes knobs`）。游戏与 pgviz 跑的是**同一份代码**，goal-pgviz C2 / C7 的对拍与 shim 清单检查消失 |
| V-3 | 参数就是 `c_.Gen`（s02 §2.1），面板走 `gg.pane`（s09）；**覆盖 goal-pgviz「参数不进存档」**：gode 里 knobs 随存档（s02 §2.1，因为它们决定 diff 基准） |
| V-4 | 渲染沿用 goal-pgviz §3.2：R16UI 3D 纹理 + 轴向步进，六向正交，不走 rgl 管线；图层 / 空气层叠 / 切片照 §5 |
| V-5 | 游戏端联动走 BroadcastChannel；M0 时游戏端是**宿主 B**（`?pgviz` 钩子，goal-pgviz §6–§7），gode/index.html 起来后换成 `c_.Gen` 的 `fx:'regen'` 正常路由 |
| V-7 | `mini` 适配器 = **抽副本**：`gen.js` 的逻辑与它依赖的 `Noise / Rand / 方块表` 复制进 `gode/`，宿主 B 不动、只收 knobs；正确性靠 `genhash` 与宿主 B 基线对拍 [11-09，关闭 §5] |
| V-6 | **俯视 + 侧视**，由**右下角 gizmo** 切换（§2.1）；悬停 gizmo = 沿当前视线轴快放 +N 层；+N 输入下方是「显示空气距离」开关 [11-09] |
| V-8 | 视口：**3D 窗口**（整块体素，侧视 / 切片用）按缩放自动取大小，默认覆盖画布长边 **100%**（11-09 起；旧 90%）（② `3D 占比`，URL `fill=`），上限 **48** 区块；之外一圈**列级 2D 地表**（每列 type / y / 群系 / 水深 8 B，slicer 引擎动词 `col`），俯视铺满画布、上限 **80×80** 区块；缩放下限 = 2D 刚好铺满，不再出现「中间一块 + 斜纹」。侧视时外圈只画剖面轮廓 [11-09] |
| V-9 | ↗ 进游戏（落点：选区中心 > 悬停点 > 视图中心；y：侧视 = 选区中心 / 悬停块自己的 y，俯视 / 仰视 = 该列地表 / 水面 + 8；mini 仍是地表 +1）。**mini 保持宿主 B** `?seed=&p1=@x,z^y`（直接开一次性世界：不进标题、不暂停、创造飞行、不写存档槽 / `Save.last`、不自动存档；`&test=1` 时让给 gmtest-b）。**其余生成器走 gode**：`gode/index.html?g=&seed=&p1=@x,z^y[,yaw]&fly=1`（p1 与宿主 B 同一套写法；宿主对 p1 开局固定俯角 −20°，y = 地表 / 水面 + 8）。朝向：侧视 → 视线方向；俯视 / 仰视不给 yaw。`g=` 也接受 URL 生成器。检查 `viz-game` 验 URL 形状 + 侧视 yaw [11-09，11-10 全生成器接通] |
| V-10 | **悬停 = 左栏 ③**（方块名、坐标、群系、高度、sample 各字段），不再点击弹探针卡；**选区**（V-14 起改右键）：右键一下 / 两下，视线轴方向深度 `seld`，得一个 **3D 盒**；所有视角都画投影框，切片面穿过时高亮截面；换视角后拖框边改第三轴；⑤ 里 ⎘ 坐标 / ⎘ URL / ⎘ gd / 清除，URL `sel=x0,y0,z0,x1,y1,z1`，Esc 取消 [11-09] |
| V-11 | gizmo 快放时**左栏浮出小图**，画「同时含主视线轴与扫描轴的平面」的剖面（例：俯视悬停 X 端点 → 南侧视剖面），标出主视图切面（青）、扫描线（黄虚线，同步移动）、光标（品红）、选区（白） [11-09] |
| V-12 | 切片在**地表模式也可调**（= 把切片面以外削掉再看；拉回最外层 = 地表，URL 不带 `slice`）；**Shift+滚轮**调切片（Ctrl 一次 8 层）；快放时滑块与数值跟着动 [11-09] |
| V-13 | **悬停无采样**：③ 悬停块只放不需要 `sample` 的实时字段（方块名、坐标、群系、高度、空气距）；400 ms 防抖 / 按列缓存 / 悬停 sample 行**全部删除**。`sample` 只在「已选中」里显示：选区近端格变化时按需取一次（不防抖），③ 的「⎘ sample」复制一行 JSON `{"at":"@x,z^y","sample":{h,biome,temp,…}}`（Agent 好读，`at` 相对原点并带 origin 标记）[11-09] |
| V-14 | **选区与「已选中」合一**（只有 `S.sel`）：**左键 = 把选区设为点到位置所在的区块网格（16 对齐）**：俯视 = 该区块 16×16 整列（沿视线到底）；侧视 = 水平轴 16 对齐的区块宽 × 竖直轴 16 对齐的 section 高，沿视线轴仍是从命中点到窗口边。③「已选中」= 被点中的**那一格**（`S.hit`，URL `hit=`；选区被别的方式改过则取近端角）的信息（区块坐标、方块、群系、高度、sample）+ 选区范围；地图上该格用**反色标**（着色器 `uInv`：格 ≥ 8 px 整格反色，更小画 9 px 反色小方块），选区盒仍是白框。**右键保持方块精度**：两下定矩形，**第一下清空现有选区**并记待定角 A（黄虚线预览），**第二下 = A、B 成矩形**，深度 = **两角深度中点 ± seld/2**（② 可调）；右键拖 = 拉矩形；右键在已建立选区的框边上拖 = 改该轴；Esc：待定角 → 选区。URL 只有 `sel=`（`pin=` 只读兼容，`viz.pin` 是别名）。粘贴单点 `@x,z^y` = 左键点该格 [11-09] |
| V-15 | **顶栏 X、Z = 视口左上角**的世界坐标（相对当前原点，缺省 0,0），平移 / 缩放实时更新，输入框可改（= 把左上角移过去）；**去掉 Go to 与 ⎘ URL 钮**，换成「粘贴 @x,z」输入。**复制与粘贴同一套坐标系**：复制写相对原点的 `@x,z^y`（点，③ 已选中的 ⎘）/ `@x0,z0^y0 @x1,z1^y1`（盒两角，⑤ 的 ⎘ 坐标），原点非 0,0 时末尾带 `(origin ox,oz)`；粘贴按文本里的 origin 标记还原，没有标记按当前原点相对。粘贴结果：两角 → **原样恢复选区**并居中；单点带 `^y` → 选区设为该格在当前视角的整条（= 左键）并居中；无 y → 只居中；gd 复制出的 URL / 命令里的 `x= z= y=` 按绝对跳转。检查 `viz-paste`（checks.tsv）对左键整条 / 右键两下单格 / 矩形 × 原点 0,0 与非 0,0 做复制 → 清空 → 粘贴，比较 sel 完全相等。**⌖ 钮**：左键回当前原点；右键弹**原点列表**：＋添加（有选区取其最小角 x,z，否则视口中心，默认名 `O1…`，名字可直接改）、每项 ×删除、导出列表（每行 `名字 @x,z`，绝对坐标）、导入（读剪贴板；把多行文本粘贴进顶栏粘贴框也导入）、重置原点；**点项 = 设为当前原点并跳过去，悬停项 = 在左栏快放小图位置预览该点处的俯视图**（窗口外只有 2D 外圈或空白）。列表存 `localStorage['pgviz.origins']`（try/catch），URL `origins=名:x,z;…`（> 600 字符省略）；当前原点 URL `origin=x,z`。原点影响顶栏读数、读数条、③ 坐标（同时列绝对）、复制的坐标；状态行与 ① 标出偏移。内部状态 / sel / pin / gd URL 一律绝对 [11-09] |
| V-16 | **左栏**：右边缘拖动 resize（宽度进 `localStorage['pgviz.sw']`，try/catch），拖到 < 140 px 自动隐藏；**⫷ 钮只在左栏隐藏时显示**。「3D 占比」改名「**细节绘制**」移进 ① 世界（仍是 `fill=`）；**① 的折叠标题行 `#wsum` = `{生成器名} · 地表y {min…max} 群系 {n}`**（如 `mini · 地表y 62…118 群系 9`，窗口里的列统计），生成器路径 / 海平面等在 ① 展开后的下面几行 [11-09] |
| V-17 | **键盘**：`T` 循环着色（方块 → 群系 → 高度）；`V` 循环视角（俯视 → 南 → 东 → 北 → 西 → 仰视），`Shift+V` 反向；`F` 地图区全屏（Fullscreen API，失败则隐藏顶栏 / 左栏 / 状态行，再按退出；⤢ 钮同）。输入框 / 下拉聚焦时不触发；`7 / 1 / 3` 别名保留。② 里标签标 `视角 (V)` `着色 (T)`。**① 世界默认折叠**（`#wsum` 摘要行仍显示）。**状态行**单行不换行：每段 `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap` + `title` 悬停看全文；按优先级收缩（进度 / ms·块几乎不缩，`（worker）· 墙钟` 其次，`池 · 代 · 已复制 · 原点偏移` 最先缩成省略号），**「在途 n」永不缩、贴行末** [11-09] |

## 1. 相对 goal-pgviz 删掉 / 改掉的

| goal-pgviz | gode |
|---|---|
| `pgviz/mini.js` + `shim.js` + `prng.js` 抽取（P1 步 2–3、C1 C7 C8） | 删。`mini` 生成器在 s02 §4 已是 Worker 适配器 |
| `GenDesc`（§3.1） | 生成器 `meta` + `sample`；`fields` 由 `sample({x,z})` 的返回键决定（高度、温度、湿度、大陆度…） |
| `liq.js` 适配器 | `defl/g/liq.js`（s02 §4，y + 64） |
| 体素窗口 u16 列优先 | 规范 u16 YZX（s02 §1），直接 `texSubImage3D` |
| 单 Worker 流式 | 用 slicer 池（s01），同一池大小规则 |
| Tweakpane 参数面板 | `gg.pane`：`c_.Gen.lake.it.rate` 等，`meta.knobs` 决定显示哪些行 |
| `localStorage['pgviz.knobs.mini']` | `gg_v` 层（s09 §1）；「固化」= `✎ 写为 js 默认` 写回 `defl/c_.json` |
| `tools/genview.mjs` CLI + `cpu-march.js` | **不做**。Agent 出图用 `gd snap`（s12）对 pgviz 页面截图，群系图册用 `tools/biomeshots.mjs`（§0）；C6 GL/CPU 对拍随之删去 |

保留：图层模型与空气层叠（§5）、gizmo 与键盘（§4）、URL 同步、重生成协议（§7 的消息表）、C4 转置检查、C10 重生成检查。

## 2. 界面（参考两站，取长）

```
┌───────────────────────────────────────────────────────────────────────────┐
│ [⫷ 仅左栏隐藏时][seed][Go] [g ▾] 地表│切片│层叠  ⌜X [x] Z [z] [粘贴 @x,z]  [↗ 进游戏]│  顶栏
├──────────────┬────────────────────────────────────────────────────┬───┤
│ ① 世界    –  │ ← 第一行 v1 · 地表y a…b  群系 n；细节绘制滑块                                                    │ ＋ │
│  种子评分/统计│                                                    │ － │
│ ② 视图    –  │                 地图（六向正交）                     │ ◎ │ 回玩家
│  模式 地表 ▾  │                                                    │ ⌖ │ 回原点
│  切片 Y ▬●▬  │                                                    │ 📏 │ 量距
│  +N 层 [16]  │                                                    │   │
│  ☑ 空气距离   │ 选区深度 / 选区宽×高                   ┌──────────────┐                 │   │
│ ③ 方块 悬停 / 已选中（整条）│                   │ 洞窟 · -12 腔2 │ ← 点击卡片      │ ⬇ │ 导出 PNG
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
| minecrafttools 顶栏 | seed + Go、版本下拉、Overworld/Nether/End 分段按钮、X/Z + Go to、Share | seed + Go、**生成器下拉**（mini/gp/liq/URL）、**模式分段按钮**（地表 / 切片 / 层叠）、X/Z 跳转、⎘ 复制 URL、↗ 进游戏（mini → 宿主 B `index.html?seed=&p1=@x,z^y`；其余 → `gode/index.html?g=&seed=&p1=@x,z^y[,yaw]&fly=1`） |
| minecrafttools 左栏 Features | 图标 chip 网格、All / None | **图层 chip**：点 = 开关，长按 / 右键 = 独奏，矿 / 植被 chip 带 ▸ 展开子项；All / None |
| minecrafttools Highlight biome / Grid 下拉 | — | 群系高亮下拉、网格下拉（无 / 区块 / region 32×32） |
| minecrafttools 右侧竖排工具钮 | ＋ － 定位 准星 尺子 下载 全屏 | 同；**gizmo 固定在地图右下角**（§2.1） |
| minecrafttools 点击弹卡 | 名称、坐标、Copy XZ、Copy /tp、Marker、Completed | **探针卡**：方块名、群系、`sample` 各字段、所在图层；⎘ `@x,z^y`、在游戏里传送、加 marker（s03 §3.4 同一 marker 格式） |
| minecrafttools 左下读数 | X · Z / Chunk · Region · Biome | 同，加 y 与当前切片 |
| craftplicator 左栏 | ①②③ 编号可折叠段、Mode 下拉（Surface / Slice at Y）、Slice 滑块 | ①–⑤ 编号段；切片滑块（Y 切片 = 等高图） |
| craftplicator Selection | Shift 拖框、X/Z from‥to、Vertical extent | ⑤ 选区：Shift 拖框 → 坐标框 + y 范围；动作：**只重生成这块**（预览）、在游戏里重生成、导出 `XZ1` 文本（s06 §5，给 Agent / clawd） |
| craftplicator Walk through it + 小地图 | 进 3D 第一人称，右下角小地图，M 回地图 | ↗ 进游戏（M0 宿主 B，M1 起 gode）；不在 pgviz 里做 3D |
| craftplicator 底部状态行 | 「World loaded」 | 生成进度、ms/块、参数哈希 |

- 左栏默认 300 px，右边缘可拖（< 140 px 自动隐藏，⫷ 钮仅隐藏时出现，V-16）；窄屏变底部抽屉（同 s09 §6.2）。
- 上图是 V1 草图：图层 / ④ 参数段未做，实际 ③ 现为悬停 / 已选中方块，⑤ 选区，顶栏无 Go to / ⎘ URL（V-15）。
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

- 侧视时「切片」就是沿该轴的深度：`slice` 的单位随视线轴换成 x 或 z（顶栏读数与 ② 的滑块标签一起换），URL 里是 `pv=`（见 §17；旧 `view= slice=` 仍可读）。

**悬停快放**：② 视图段里「选区深度」下面有一个 **快放速度** 数字框（层/秒，默认 7，1…60，滚轮在这一行上可调）。鼠标停在 gizmo 上时，地图沿**当前视线轴**从当前切片向里逐层播放，层数 **N = 当前选区沿该轴的深度**（没有选区则用 `seld`），再回到起点循环 [11-09 改：原先有独立的 N 框与 `n=`，已去掉]；移开鼠标立即回到原切片。

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

**切片透视 `xray=N`**（URL / `viz.set('xray', 12)`，默认 0）：从切面往里数 N 格做前到后合成，实体 0.26、水 0.14，`y` 低于第一格实体的空气再叠 0.10 的紫雾；洞 = 紫色薄雾、矿脉与岩浆会在后层透出来。第 `i` 格实体的权重是 `(1-alpha)^i`，所以近层仍是主体，只是不再「一截面挡死」。

## 3. 调参闭环

**人**：④ 拖 `c_.Gen.*` → 防抖 200 ms → 只重算当前窗口（代际 id 取消过期任务，旧图保留到新图到达，goal-pgviz P3-2）→ 满意后 ↗ 进游戏 / 选区「在游戏里重生成」。

**Agent**（s12）：

```
gd go 'gode/viz/?g=gp&seed=20240607&pv=Y&p1=@0,0&zoom=2'
gd eval 'viz.params()'                                         # 这个生成器有哪些参数：键 / 默认 / 区间 / 说明 / 当前值
gd eval 'viz.stats({sel:[-64,0,-64,63,255,63]})'               # 人框的区间（粘贴来的 sel）：方块 / 群系 / 水 / 树 / 洞 / 噪声场的数字
gd eval 'viz.tune({"tree.dens":3,"terrain.shift":-6},{sel:[-64,0,-64,63,255,63]})'   # 改参数 → 重算窗口 → 同选区统计 + vs.delta（与上次的差）
gd set c_.Gen.cave.rate=0.5                                    # 单个参数；`gd set kw=null` 全部回默认；未知键直接报错并列出可用键
gd snap --tag tuned                                            # 前后对照：两次 snap，看 gode/shots/ 里的两张（snap 没有 --vs）
```

- `viz.stats()` 无参 = 状态（块数 / 在途 / ms 每块）；`viz.stats({sel})` = 区域统计，Agent 先看数字是否接近目标分布，再看图。选项：`sel`（缺省 = 页面上的选区）、`go`（盒心不在 3D 窗口时把视图挪过去；显式传 `sel` 时默认开）、`noise`（噪声场 min / mean / max，默认开；`noiseN` = 网格边长，6）、`fresh`（不与上次比）、`base`（把这次钉成基线）、`vs:'base'`（与基线比而不是上一次）。
- 差值 `vs = { against, kw, delta }`：delta 只含变了的数字叶子（now − prev），同一个盒 + 生成器 + 种子才比。
- URL 含全部视图状态和非默认 knobs（`&kw=tree.dens:2,cave.rate:0.5`，点号键:值，逗号分隔），一条链接复现；人在页面里的「⎘ gd」「⎘ URL」会带上它。

## 4. 阶段（替换 goal-pgviz §10）

| 段 | 内容 | 验收 |
|---|---|---|
| V1 | 生成器 Worker 起池（slicer 的 `gen` 动词 + `mini / gp / liq` 适配器，从 M1-3/4 提前）；3D 纹理 + 地表图层 + **右下 gizmo 俯视 / 侧视** + 探针卡 + URL 同步；顶栏与 ① ②；**+N 快放与空气距离**（§2.1） | 三个生成器都能看俯视图，y 刻度按 `meta`；C4 转置检查 0 差异 |
| V2 | 图层 chip、群系、空气层叠 `count / depth3`、切片、`sample` 场热力图、统计 | goal-pgviz P2 验收 |
| V3 | `gg.pane` 参数段（M1-2 提前）、湖泊 `w/feat/lake.js`、树参数映射；宿主 B 联动重生成；⑤ 选区 | goal-pgviz P3 验收 + C10 |

## 5. 待议

（无；原「宿主 B 是否改用 mini.js Worker」已由 V-7 关闭）

## 6. V1 实现记录 [11-09]

| 文件 | 内容 |
|---|---|
| `w/slicer.js` | 引擎运行时：单键信封分派 + id、`{ready:{meta}}`、`{err}`、`xlate`（`xzy8 → yzx16`）、`serve(import.meta.url)`（s02 §2）；引擎默认动词 `col`（整块生成后 `colReduce` 成列级地表，生成器可导出更便宜的 `col` 覆盖） |
| `defl/g/mini.js` + `vendor/mini/{prng,blocks,terrain}.js` | 宿主 B `gen.js` 抽副本（V-7）；`terrain.js` 是 sed 机械替换的逐行副本 |
| `defl/g/gp.js` + `vendor/gp/load.js` | goodGP 供体原文 fetch 后拼成函数执行（零改动） |
| `defl/g/liq.js` | 直接 import goodLiqPG ESM；y + 64，裁 256 以上（`clip` 计数进状态行） |
| `viz/index.html app.js gl.js store.js pool.js palette.js` | 页面、装配 / 交互、着色器、CPU 区块表（3D + 2D）与溢出合并、slicer 池、按名字着色 |
| `index.html`（宿主 B） | `Title.urlStart()` + `Title.boot` 首行一处调用、`Save.save / saveSync` 的 oneshot 守卫（V-9），共 +16 / −2 行 |

- **视角命名**按「相机在哪一侧」：`top`（在 +Y 往下看）`bottom` `south`（在 +Z 往 −Z 看，屏幕右 = +X）`north` `east`（在 +X 往 −X 看）`west`；gizmo 端点 ±X ±Y ±Z 一一对应。键盘 `7 / 1 / 3` = top / south / east，`Ctrl` 或 `Alt` 反向（浏览器常吃掉 Ctrl+数字）。
- **切片**：`slice` 缺省 = 最外层（俯视 y = h−1、侧视 = 3D 窗口边），即「地表」；顶栏「地表 / 切片」只是把切片拉回最外层 / 放到海平面（俯视）或屏幕中心（侧视），高亮由 `slice` 是否缺省决定。URL：`g seed view x y z zoom slice fill n air shade grid sel`。
- **窗口（V-8）**：3D 边长 = ⌈fill × 画布长边 / zoom / 16⌉ + 1，夹在 12…48；纹理环容量按 8 的倍数只增不减（48 时 (768, 768, 256) R16UI ≈ 300 MB 显存，CPU 侧同量）；2D = 铺满画布 + 2，≤ 80，固定 80² 环（1280² RGBA16I ≈ 13 MB）。中心偏离 ≥ 3 区块或尺寸变化才挪窗，缩小留 30% 滞回。先生成 3D（最近优先），再补外圈列。3D 块的列由主线程从体素算（含邻块溢出），外圈列由 worker `col` 给；俯视 3D → 2D 用同一套光照（西 / 北邻列更高压暗），接缝看不出；切片面在地表以下时外圈压暗示意「这里没有切面数据」。
- **溢出合并**不用挂起表：每块保留自己的 outside，块到达时与已载入邻块双向应用（s02 §3 语义，窗口来回移动不丢树冠）。
- **快放**：悬停 gizmo 空白处或视线轴端点 = 沿视线轴 `slice → slice + N` 循环（只改 uniform，滑块跟着动）；悬停**其它轴**端点 = 沿该轴从屏幕中心推进一个切面，越过的部分压暗、切面画黄线，左栏浮出小图（V-11）。小图用同一个 GL 上下文先画进主画布左下角再 `drawImage` 拷走，之后主图覆盖；小图浮层只改 opacity（改布局会让浏览器补发鼠标事件、打断悬停）。
- **选区（V-10）**：着色器 `uSel / uSelMin / uSelMax` 画投影框（拉框预览为黄虚线）；拖框边：指针在边 6 px 内按下即拖该轴的 min / max（光标变 ↔ / ↕），y 夹在 0…h−1。
- **空气距离**：着色器与 `store.march` 同一规则（实体 = 分类 1，流体也算碰到；植物当空气），`viz.airDist(a, b)` 的 `(a, b)` 是屏幕平面坐标（俯视 = x, z；侧视 = 水平坐标, y）。
- `window.viz`：`ready stats c4 airDist probe regen set errors sel pin hover click jump gameUrl copied state chunk layers layerAt`；`set` 支持 `g seed view x y z zoom mode slice fill air shade grid sel origin pin(=sel) seld rate layer lop`，未知键抛错。`viz.click(px, py, btn)` 无真实输入时模拟左 / 右键（左键 = 选区设为整条）（CSS 像素，地图左上为原点）；`viz.jump(text)` = 粘贴框的解析。URL 另有 `origin origins seld`（`pin=` 只读兼容）；`viz.origins() / addOrigin / importOrigins` 管原点列表。

| 生成器 | ms/块（worker 内） | 墙钟 ms/块（8 worker，默认缩放 29² + 外圈 33²） | 最小缩放 48² + 80² | C4 |
|---|---|---|---|---|
| mini | 1.9–2.4 | 0.6–0.9 | — | 0 |
| gp | 2.0–3.0 | 0.6–0.7 | — | 0 |
| liq | 6.7–8.9 | 0.8–1.2 | 2304 块 + 6400 列，ready 后 JS 堆 ≈ 1 GB | 0 |

**mini 与宿主 B 对拍**（V-7；宿主 B 页面里按行优先在沙箱 box 生成 8×8，取内圈 6×6 = 36 块；pgviz 同种子窗口覆盖同区域，逐格比 id + meta）：seed `20240607` @(−4,−4)：36/36 块逐字节相等；@(6,2)：35/36，差 1 格（树叶，邻块溢出到达顺序不同，C2 口径屏蔽后 36/36）；seed `hello` @(−20,10)：36/36。方块名字表与宿主 `gg.Blocks.byId` 相等（C8）。

**回归 [11-09]**：`gd check c4 errors` 在 mini / gp / liq 三个生成器上都过；宿主 B `index.html?r=gl&seed=20240607&rd=6` 上 `errors seam xz-roundtrip r-switch` 过，`genhash` FAIL——撤掉 V-9 的改动后同样 FAIL（哈希每次不同），是既有问题，不是本轮引入。

**V-13…17 实现记录 [11-09]**：全在 `viz/{index.html,app.js}`，检查在 `tools/checks.tsv` 的 `viz-paste`。左栏宽度用 CSS 变量 `--sw`（`#rsz` 是 7 px 拖动条；拖过界时恢复拖前宽度再隐藏）；顶栏读数 = `planeAt(0,0)` 取整，聚焦中的输入框不被覆盖；侧视时视线轴那一维读数是视图中心 / 切片位置。③ 已选中的近端格画在 `#rul` 覆盖层（橙框 + 十字，一格 < 8 px 画圈）；换视角后「近端格」按当前视线方向重取，代表格会变（俯视建的柱子在南侧视下是最底层）。回归：mini / gp / liq `gd check c4 errors viz-paste` 全过；宿主 B `gd check all` 5/5 过。CDP 真实输入验证过左右键、按键、左栏拖动、F 全屏、原点菜单悬停预览。

**小图（第三版，定稿）[11-09]**：用户原意——**俯视时挂左栏顶部；其他视角（侧视 / 仰视）挂地图左上角；可 resize；只有一个实例**。结构：`#minid`（`position:fixed`，只改 opacity 与类名 `side` / `inmap`，不动其它布局，所以不会因布局变化打断 gizmo 悬停）里一个 `#mini` canvas + 一行说明 + 一个拖动手柄 `#mrz`。`showMini()` 每次出现时幂等地决定挂载：俯视且左栏可见 → `side`（宽随栏，`top` = ① 标题行下沿，只读 `#wsum` 所在 `summary` 的 rect）；否则 → `inmap`（左上角 `left = 左栏宽 + 8, top = 46`，左栏隐藏 / 全屏退化时贴 8 px；不挡右侧工具钮和左下读数条；`pointer-events` 只在手柄上）。手柄：`side` 拖下沿改高，`inmap` 拖右下角改宽高；大小存 `localStorage['pgviz.mini']`（`{mh, mw, mh2}`，try/catch）。快放 / 悬停会随鼠标离开消失，所以**打开原点菜单（⌖ 右键）时小图保持显示**，那时可拖。
**两个旧 bug 的根因**：(a) 俯视时小图越来越靠下——`showMini` 用 `document.querySelector('#side summary')` 取 ① 标题下沿，而 `#minid` 当时是 `#side` 的第一个 `<details>`，取到的是它**自己的** summary，每调用一次 `top` 就累加一个标题高；现在 `#minid` 不在 `#side` 里，且只读 `#wsum`。(b) 其他视角里它在 canvas 左上角——不是挂载，而是旧版 `previewOrigin` 借主 GL 上下文先画进主画布左下角却没重画主图留下的残影；预览现在**不碰 GL**。
**原点预览黑屏的根因**：预览点常在 3D 窗口 / 2D 外圈**之外**，store 里没有那里的列，GL 画出来就是 `uHas` 全无的黑；再加上借主画布（快放同款）渲染，时序一错就黑 / 残留。**现状**：`previewOrigin` 用 **CPU** 按列数据画（`paintPreview`：块色表 + 水深混蓝 + 西 / 北邻高差明暗，3 px/格）；`store.cols` 有就用，缺的块按需向 worker 要 `col` 放进预览专用缓存 `pcache`（≤ 900 块，换生成器时清），数据没到之前该块画暗色棋盘 + 「加载中…」，到齐再重画；每次悬停带令牌 `pTok`，旧请求回来只在仍是最新悬停时才重画，连续快速切换稳定。`viz.previewReady()` 等块到齐并返回 `{ok, missing}`。压力检查 `viz-preview`（checks.tsv，host=viz）：4 个原点（含 6000,−4000 与 40000,25000 这种窗口外的）× 3 轮快速悬停，再逐个等到齐后读回小图像素，非黑 ≥ 30%。

**V-13…17 追加回归 [11-09]**：mini / gp / liq 的 `gd check c4 errors viz-paste` 与宿主 B `gd check all` 全过；CDP 真实输入验证：左键区块选区 + 反色标、右键第一下清选区 + 黄虚线预览、第二下建矩形、「⎘ sample」JSON、原点菜单悬停预览（canvas 上无残留）、拖小图下沿。

**底栏根因与后续修正 [11-09]**：真正的根因不是文字太长，而是 `.app` 的 grid 列写成 `var(--sw) 1fr`（= `minmax(auto, 1fr)`）：`#st` 里 `nowrap` 的各段把「地图列」的最小内容宽撑大，整张 grid 比视口宽，右边（含「在途」）被 `body{overflow:hidden}` 切掉——只在内容较长 / 窗口较窄的真实窗口里出现，之前 1280 下模拟看不出。现在所有列都写 `minmax(0, 1fr)`（含 `.nosd` / `.zen` / 窄屏媒体查询），`#st` 固定 24 px 单行、`min-width:0`。验证：`#app` 宽 1100 / 900 / 700 / 560 下 `在途` 右沿始终在行内（`Browser.setWindowBounds` 在 gd 的浏览器里不改 `innerWidth`，所以用 `#app` 宽度模拟）。
**③ 已选中**：新增「⎘ 点」（与「⎘ sample」并排）复制被点中格 `S.hit` 的 `@x,z^y`（相对原点，原点非 0,0 带 `(origin x,z)`），粘贴 = 左键点该格；`viz-paste` 加一项「⎘ 点 → 清空 → 粘贴 → sel 与 hit 相等」。**原点列表去重**：按 `x,z` 去重（同坐标保留第一项、同名不同坐标保留）——＋添加遇到同坐标不再加、高亮已有项；导入跳过同坐标；URL `origins=` 与 localStorage 读取时去重，启动时把 localStorage 里的重复项写回清掉。**提示文字**改成「左键选区块 / 右键两下定矩形…」「（左键点选一个区块）」。**小图遮挡取舍**：俯视挂左栏时仍是浮层（改成流式会让左栏布局随悬停起伏，正是之前「越挪越下」类 bug 的温床），默认高度 178 → 120 px 以少盖 ②，想看大的可拖下沿（存 localStorage）。

**快放与小图后续 [11-09]**：① ②「+N 层/秒」一行 = `+ [N] 层 / [速度] 秒`：N（1…64，默认 16，`n=`）与速度（层/秒 1…60，默认 12，`rate=`）两个数字框，滚轮在这一行上仍可调速度并同步框，静态文字「12 层/秒」去掉。② 「区块网格」下新增「**小图持久化**」（`minip=1`）：打开后小图常驻（位置规则不变：俯视 = 左栏顶部，其他视角 = 地图左上角，可 resize）；没有快放 / 预览时显示沿主视线轴的「另一视角」静态剖面（俯视 → 南侧剖面，侧视 → 俯视图），平面过**选区中心**（无选区则视口中心），画选区盒；快放 / 原点预览期间照常覆盖，结束后回到常驻内容；关闭时只在悬停 / 预览时出现。
③ **快放「关于选区」**（我的理解与取舍）：悬停**其他轴**锚点时，有选区则 ① 小图剖面平面过选区中心、画选区盒；② 扫描线 / 变暗线**从选区在该轴朝向悬停端点一侧的近端边起**，向里走满 N 层（**不限于选区范围，超出继续走 N 层**——固定长度比「走到选区尽头就停」更容易读，用户也可调 N）；没有选区时仍从光标 / 视口中心。**沿视线轴的快放**（悬停空白处 / 视线轴端点）不随选区变，仍是「当前切片 → +N」。
④ **悬停 gizmo 空白处点击**：正在沿视线轴快放时，把切片设为**快放终点**（`当前切片 ± N`，按悬停方向，夹到合法范围；回到最外层则等于地表），随后在 gizmo 旁闪 1.4 s 提示「切片 Y → 239」；下次悬停从更深处继续。点端点仍是切视角；没在快放时点空白无事。

## 7. 调参闭环最小集 + 空气距离 select [11-09]

**参数机制（s02 §2.1 `meta.knobs`）**：每个生成器在 `meta` 里声明一张**扁平表** `knobs = [{ k, def, min, max, note }]`（键是点号路径），`onkwarg({ seed, kw })` 里 `w/params.js` 的 `resolveParams` 校验（未知键 / 非数字抛错并列出可用键，越界夹到区间）后交给供体 `setParams`。**默认值一律是原行为（乘子 1、偏移 0）**，已核实：三个生成器各 7×7 区块（seed 20240607）改前 / 改后哈希逐位相等。供体改动：

| 供体 | 改动 | 参数 |
|---|---|---|
| `vendor/mini/terrain.js`（宿主 B gen.js 的副本） | `PARAMS` + `Terrain.P / setParams` | `terrain.contScale shift hillAmp mountAmp`、`cave.rate`、`ore.mul`、`tree.dens`、`plant.dens` |
| `goodGP/js/world.js` | `GEN_PARAMS` + `World.P / setParams`，`vendor/gp/load.js` 多导出 `GEN_PARAMS` | 同上，另有 `river.width`（9 个） |
| `goodLiqPG/src/world/gen/*` | `terrain.js` 的 `GEN_PARAMS`；`TerrainNoise.P` 由 `Generator` 共享，`carvers / ores / decorate` 读 `gen.P` | `terrain.contScale shift mountAmp factor`、`cave.rate`（蠕虫洞 + 峡谷）、`cave.cheese`（芝士洞偏置）、`ore.mul`、`tree.dens` |

- 同名同义：`terrain.shift`（格）、`cave.rate`、`ore.mul`、`tree.dens`、`terrain.contScale`（> 1 = 更大）在三个生成器里意思一样；liq 的 `contScale` 缩放整套气候噪声（群系也跟着变大），`mountAmp` 乘的是 jaggedness（只在高处有感），`terrain.factor` 是实验性的（扫描里影响很小）。
- 全部参数各扫过一遍（改一个，看树 / 水 / 地面高 / 洞 / 矿 / 植物的变化）：都有响应，除了 liq 在海洋选区里 `mountAmp / tree.dens` 自然没有变化，换陆地种子（seed 1）后都有。
- **没有**湖泊（s02 §2.1 的 `lake.*` 仍待新写）；`plant.dens` liq 没有。
- 页面：`S.kw` 进 URL `kw=`，`viz.set('kw', {...} | 'a:1,b:2' | null)` / `viz.set('c_.Gen.<路径>', v)`（`gd set c_.Gen.cave.rate=0.5` 即可）改参数并重启池（热重置，不重建 worker，窗口重算 0.6–1.2 ms/块 × 窗口）。`viz.params()`、`viz.tune(change, opts)`、`viz.stats({sel,…})` 见 §3。

**区域统计口径**（`viz/stats.js`，粗，供调参用）：地面 = 每列从最高实体往下找第一格非树叶 / 树干的实体（跳过冠下空气）；`cave.airBelowGround` = 地面以下的空气格（按 16 格一档给 y 分布）；`water.lake*` = 水面（地表实体 y + 水深）高于海平面的列，也就是高地水体；`trees` = 每个树种的树干方块按 26 邻域连成块，一块一棵树（2×2 粗干、斜枝都算一棵；树干紧贴的两棵会并成一棵，很少见），给 `count / per1kCols / leafCells` 和 `bySpecies.<种>.{count, per1kCols, meanHeight, leafCells}`（口径版本 `STATS_VER` = 2；旧的 `trunkBases` 已去掉）。只有 2D 外圈列的部分没有体素，只进群系 / 地面 / 水的统计（`columns.only2d` 写明）。大选区会慢（盒 128×256×128 ≈ 20–40 ms）。

**空气距离（已改为开关，见 §10；以下是 select 版的旧记录）**：`#airsel` = 无 / 数字 / 水体风格（灰渐变），URL `air=off|num|gray`（旧 `air=1` = 数字），`viz.set('air', 'gray')`。数字照旧（格 ≥ 8 px，< 10）；水体风格不受缩放限制：`g = mix(0.92, 0.10, 1 − exp(−d/14))`，与底下明暗稍混（近亮远暗，思路同「水越深越暗」）。

**检查**：`viz-kw`（未知键抛错、URL 往返、`ore.mul=3` 后矿数翻倍以上且 `vs.delta.ores` 存在、复原后与基线相等、无参 `stats()` 仍是状态、覆盖 = 全部列）、`viz-air`（三态的状态 / select / URL 一致）。mini / gp / liq 下 `errors c4 viz-paste viz-kw viz-air` 全过。

**还没做**：`viz.stats` 的「只重算选区」——现在改参数重算的是整个窗口（够快）；人那边没有参数面板（V3 的 gg.pane），人只能通过 URL / 粘贴拿到 Agent 调好的 `kw`。（树已按种统计，见 §9。）

## 8. 快捷键与 Agent 通道 [11-09]

| 键 | 作用 |
|---|---|
| `E` | 循环 `#modes`（地表 ↔ 切片；V2 的层叠启用后自动入环），toast 提示当前模式 |
| `R` | 空气距离开 / 关（见 §10） |
| `C` | 原点菜单「＋添加」：选区最小角 / 无选区时视口中心；同坐标已有则只提示，不重复添加 |
| `⏎` | ↗ 进游戏（所有生成器：mini → 宿主 B，其余 → gode；见 V-9）；`preventDefault`，焦点在某个按钮上时也不会去触发那个按钮 |
| `Ctrl+⏎` | 一键提交给 Agent（= 「→ Agent」按钮） |

焦点在 `input / select / textarea` 里时全部不触发（顶栏种子框的 ⏎ 仍是 Go）。

**Agent 通道**（s12 §10）：任何 ⎘ 复制（点 / sample / 坐标 / URL / gd / 导出列表）除了写剪贴板，还会 `gdSend` 一条 `copy:<kind>` 给挂在页面上的 Agent；「→ Agent」（顶栏、⑤ 选区行、原点菜单、Ctrl+⏎）发 `submit` = 选区 + 点列表 + 选中的点 + 选区统计。没有 gd 挂着（普通浏览器）时按钮隐藏，复制行为不变。检查 `viz-keys`、`viz-agent`。

**选区深度规则 [11-09]**：左键 / 右键选区的深度轴按视角分两种——**俯视（−Y）一律选到基岩层**（左键：命中格 → y 0；右键两下：两角中较高者 → y 0）；**其他视角按 `seld`**（左键：从命中格沿视线往里数 `seld` 层，不出窗口；右键：两角深度中点 ± `seld`/2）。快放层数 = 当前选区的深度，所以俯视选区快放会一路播到基岩。检查 `viz-seldepth`。

## 9. 图层与树种 [11-09，V2 的一部分]

**图层**（`viz/layers.js`，② 视图里「图层 (L)」）：叠在地图上的**单选**叠加层，chip 选，`L` 循环，滑条调不透明度（默认 35%），URL `layer=none|tree|f:<字段>`、`lop=`。只在俯视 / 仰视画（逐列的量），侧视时图例注明「只在俯视 / 仰视画」。悬停时 ③ 多一行「图层 …」。`viz.layers()` 列出，`viz.layerAt(x, z)` 取某列的值，`viz.set('layer', 'tree')`。PNG 导出带叠加层。

| 图层 | 数据 | 画法 |
|---|---|---|
| `tree` 树种 | Store 的 2D 列里「地表实体」是树叶 / 树干的列（3D 窗口与外圈都有）；种 = 方块名 `<种>_leaves / _log / _wood / _stem` 的前缀（`species.js`，三个生成器通用） | 每种一个醒目色（oak 绿、spruce 青、birch 黄、jungle 荧光绿、acacia 橙、dark_oak 紫、cherry 粉），树干比树叶深；**非树的列压暗**，树才醒目 |
| `f:<k>` 场热力图 | 生成器 `sample()` 返回的每个数值字段（`biome` 除外；mini：h temp hum mountain；gp：+ humid cont mount river；liq：hEst temp humid cont ero weird pv）。slicer 新增**引擎默认动词 `field`**（`{x0, z0, n, step}` → 每字段一个 Float32Array），不用生成器改一行 | 64 格一块、每 4 格取一点（16×16），只取视野内 ±1 块、最近优先、最多 10 个在途；每块一张 16×16 色阶图放大（不平滑，所以是 4 格的色块）；色阶 = 已载入数据的 2%…98% 分位（范围变了 > 3% 才重染），蓝 → 青 → 绿 → 黄 → 红 |

换生成器 / 种子 / 参数（`kw`）时图层缓存全部重置（`LY.reset`），改参数后热力图自然跟着变——**调参时可以直接看「这个旋钮动了哪个场」**。以后加图层 = `list()` 里多一项 + `colorChunk / colorTile` 里多一个分支（species.js 的「名字表 → 类别表 → 着色」就是预备好的套路）。

**树的统计**（`stats.trees`）：见 §7 口径。`viz.stats({sel})` 现在回 `trees.bySpecies`，`vs.delta` 也会带出每个树种的变化（`tune({'tree.dens': 1.5})` 后能看到 oak / birch 各自多了多少）。

**检查**：`viz-layers`（图层列表、树种图例、场的值与色条、侧视不抛错、未知图层抛错）、`viz-trees`（种合计一致、平均高 ≥ 1）、`viz-seldepth`。mini / gp / liq 下 `gd check all --matrix all` 共 33 项全过，宿主 B `check all` 5/5。

## 10. 左栏与 Numpad 操控 [11-09 二]

- **空气距离 = 复选框**（「区块网格」下方，`R` 切换，URL `air=1`；旧 `air=num|gray|1` 都读作开）。开 = 水体风格灰渐变（近亮远暗，任何缩放都能看）；**格 > 22 px 时在灰渐变上再叠黑色数字**（0 显示为短横，≥ 10 不写）。着色器 `uAir` 只剩 0 / 1。
- **「深度 · 快放」一行**：`[选区深度] 格 · [快放速度] 层/秒`，速度框上滚轮可调。
- **gizmo 悬停 = Numpad 帮助**（浮在 gizmo 上方）+ 端点高亮；点端点切视角照旧。**悬停其它轴端点 = 沿该轴快放切面**（扫描线 + 左栏小图画剖面，移开回原状；这条先取消又加回了）；悬停视线轴端点 / 空白处不快放（沿视线轴快放由 Numpad 9 按住）。快放带来源标记 `play.src`（`hover` / `key`），松开 9 只停 `key` 的，移开 gizmo 只停 `hover` 的，互不打断。
- **Numpad 操控**（Digit 行同号也生效，Ctrl / Alt / Meta 不触发）：

| 键 | 作用 |
|---|---|
| `7 / 1 / 3` | 俯视 / 南 / 东（Ctrl 或 Alt = 仰 / 北 / 西），同前 |
| `4 / 6 / 8 / 2` | 沿屏幕 左 / 右 / 上 / 下 **翻整整一页**（位移 = 视口宽 / 高 ÷ 缩放，前后两页无重叠；侧视的 y 夹在 0…H−1；按住连翻） |
| `5` | 图层暂时切成「无」，再按一次复原（记住切走前的图层） |
| `9` | 按下 = 沿视线轴快放（层数 = 选区深度，速度见左栏）；松开 / 窗口失焦 = 回到原切片 |

检查：`viz-air`（复选框 / 状态 / URL / 旧值兼容）、`viz-keys`（R 开关）、`viz-numpad`（翻页位移精确、侧视、5、9、悬停其它轴端点快放 / 视线轴不快放 / 9 与悬停互不打断、giz 帮助显隐）。

**修订 [11-09 四]**
- **帮助只在俯视、非全屏时弹**（`helpOn()`：`view === 'top'` 且无 `fullscreenElement`、非 zen 退化全屏）；悬停中换视角也会跟着显隐。
- **快放停下 = 停在那一层**（原先移开 / 松开都回原状）：沿视线轴的快放（Numpad 9）松开时 `setSlice` 到当前层（toast「切片 Y → v」）；悬停其它轴端点的快放（扫描线 / 左栏小图剖面）移开时**固定在当时的层**（`play.frozen`：主视图的扫描线和小图剖面保持，gizmo 上标「固定」，toast 提示 Esc 取消），再悬停另一个端点会替换，`Esc` 取消（优先于清选区），换到以它为视线轴的视角时自动清掉。窗口失焦只停实时快放，不动已固定的。
- **gizmo 高亮整根轴**：当前视角的端点白实线环，**同一根轴的另一端**（Y ↔ −Y 等）虚线环。
- **全屏时小图可用**：真全屏只显示 `#map` 的子树，原来 `#minid`（小图）和 `#ctx`（原点菜单）在 `#map` 外所以消失；现在挪进 `#map`，全屏（和 zen 退化）时小图挂地图左上角，进出全屏后 `relayout` 里按 `showMini` 重新换挂位。真全屏需要用户手势，gd 里只测了 zen 退化路径（同一段挂位代码）。
- `viz-numpad` 相应扩充（9 松开切片真的停在 < 255 的层、悬停移开小图保持 + Esc 取消、帮助在俯视 / 全屏 / 非俯视下的显隐、小图与原点菜单在 `#map` 内）。
- **再修订**：悬停 gizmo **照常快放**（帮助浮层和快放同时出现、互不冲突）：悬停视线轴端点 / 空白 = 沿视线轴快放，悬停其它轴端点 = 沿该轴快放切面；Numpad 9 按住 = 同一件事的键盘版。目标在 gizmo 内换来换去时直接替换（途中不提交），**移出 gizmo 才算「停下」**：视线轴 → 切片设到当前层，其它轴 → 剖面固定。（上一版把视线轴 / 空白的悬停快放误取消了。）

**修订 [11-09 五]**
- **gizmo 右键 = 切换方向**：右键视线轴的端点或空白 → 当前视角翻到反向（俯视 ↔ 仰视、南 ↔ 北、东 ↔ 西，Y ↔ −Y）；右键其它轴的端点 → 去那根轴的另一端（+X → −X）。
- **悬停快放的扫描方向按世界坐标**：悬停 +X 端点 = 向 +X 扫，俯视里就是**向右**；+Z = **向下**；−端点反向，其它视角同理（侧视里 +Y 向上）。扫描线从选区在该轴上**背向**悬停端点的那条边起（没有选区 = 视口中心），每层一格，压暗的是已扫过的一侧（扫描方向的背后）。原先是从朝向端点的一侧往里扫，方向正好反了。沿视线轴的快放不变（总是往深处）。
- **Shift+滚轮取反**：滚轮向上 = 往深处（切片沿视线前进），向下 = 回到外层；Ctrl 仍是一次 8 层。
- 检查：`viz-numpad` 加了右键翻向、Shift+滚轮方向、四个端点的扫描方向。

## 11. 区块接缝检查 `viz-seam` [11-09]

`viz/seam.js`（`viz.seam({at, w})`，检查行 `viz-seam`，host = viz）：preview_world.mjs `seamCheck` 的 pgviz 版，**同一份 Store 合并代码**，三个生成器通用。私有单 Worker 池（不动页面主池），样地 = 沿螺旋（间隔 14 区块）按 `sample` 群系挑的 3 块 5×5 林地（`FOREST` 正则；找不到退回原点附近，`at` 可指定），每块样地按**正序、倒序**各 `onkwarg` 重置一个全新生成器、逐块 `gen` → 喂进全新 Store。

| 项 | 判定 |
|---|---|
| raw | 两种顺序下每块 blocks / biomes / outside 逐位相等（生成器无状态、与调用顺序无关） |
| merge | 合并后世界逐格相等，差异按「类型对」归类 |
| lost | 每条落在已载入块里的 outside：已写入 / 被同格别的写入覆盖 / 被 soft 规则合理跳过，否则算丢（树冠缺口） |
| cross | 跨块写入条数 > 0（样地没有跨块树则检查无意义，失败）；`meta.outside === false`（goodGP：树靠邻块重算、不外写，已在 `defl/g/gp.js` 声明）时 cross / lost 不适用 |
| c4 | 合并之后每块 `heights` 与体素 top 一致 |
| border | 块边界两侧地表（不算树 / 植物 / 水）高差均值 ≤ 块内相邻列的 1.5 倍 + 0.3 |

**结果**（seed 20240607）：mini 662 条跨块写入、gp 不外写、liq 1223 条，lost 均为 0，raw 逐位相等，边界高差与块内同量级。**已修**：最初 liq 有 3 格 `leaves↔leaves` 不同——两棵树的树冠落在同一邻块的同一格，soft 规则「先到先得」使结果取决于到达顺序（供体 `applyFeatureBlocks` 同款语义）。现在 `Store.apply` 在「该格已被 outside 写过、旧新都是树叶」时取较小的值（块自己生成的树叶仍然优先、不受影响），结果与顺序无关，检查全绿。**这是对供体语义的刻意偏离**：M1 的 outside 合并（s02 §3）要照此实现。

变异验证：把 `Store.apply` 的跨块写入丢掉 90%，`lost` 立即报出（`acacia_leaves` 应为、实为 air），还原后恢复。耗时 mini 0.3 s / gp 0.3 s / liq 0.7 s。

## 12. `old` 改名 `mini` [11-09]

生成器 `old`（宿主 B `gen.js` 的抽副本）改名 **`mini`**：`defl/g/old.js → mini.js`、`vendor/old → vendor/mini`、`meta.id`、`viz/{app.js,index.html}`、`gd` 的 `--matrix` / 基线、`gmtest-b` 的 `gen`、`c_.Bench.poses['20240607@mini']`、`tools/baseline.tsv` 第一列、本目录文档；数值一律不动。历史文字里的「old」同步改成了 mini。**随后 `old` 这个名字让给了 VoxelCraft 生成器（§13），`?g=old` 不再是 mini 的别名**；`shots/index.tsv` 里的旧 `g=old` URL 因此会指向 VoxelCraft 地形。

## 13. `old` = VoxelCraft 生成器 [11-09]

`?g=old`：仓库根 `VoxelCraft.html` 的地形生成抽副本，用来给 pgviz 多一个**风格迥异、无外写、无群系**的小生成器（Simplex 2D 高度 + 山脊遮罩、双噪声蠕虫洞 + 大洞、随机游走矿脉、树按噪声密度、H 96、海 40）。

| 文件 | 内容 |
|---|---|
| `vendor/old/voxelcraft.js` | 逐行照搬（源行：常量 300–302、小工具 316–334、Simplex+fbm 339–402、B 表 659–661、生成 1096–1190）。改动只有：加 export、去掉 `Chunk / chunks / edits`、地表选择抽成 `surface()`（逐块与 `sample` 共用，并多回一个 biome）、`treeDens()` 抽出、knobs（`P`，默认值使输出逐位相同） |
| `defl/g/old.js` | 适配器：原生 `(x*16+z)*96+y` u8 → 规范 YZX u16（y 原样，96 以上空气）；`meta.outside = false`（树只种在 x,z ∈ 2..13，树冠半径 2，全在块内）；`sample` → `h slope biome`；`spawn` 螺旋找 h > 41 的陆地 |

- **群系**：VoxelCraft 没有，`surface()` 按地表分类 `ocean / beach / plains / forest（树密度 > 0.02）/ stony_peaks（坡度 ≥ 4）/ snowy_slopes（雪线）`，只给 pgviz 着色与统计，不是原版内容。
- **knobs**（8 个，同 §7 的命名）：`terrain.contScale shift hillAmp mountAmp`、`cave.rate`、`ore.mul`、`tree.dens`、`plant.dens`。
- **对拍**：原文件 1096–1190（加 `Chunk / chunks / edits` 桩）与 `vendor/old` 在默认参数下，4 个种子 × 12×12 = 576 块 **0 格差异**（含 36 833 格树叶）。
- **检查**：`gd check all --matrix old` 13 项全过（`viz-kw` 矿 ×3：3691 → 11433；`viz-trees` 只有 oak；`viz-layers` 2 个场 + 树种）。`gd --matrix all` 现在是 4 个生成器（`mini gp liq old`）；**基线 `baseline.tsv` 还没有 old 的行**（`BASE_GENS` 没改，等人决定要不要 `gd baseline accept`）。
- 没有湖泊：VoxelCraft 的水只有海平面以下，`water.lake*` 恒为 0。

## 14. Luanti 系生成器 `luan0` / `luanV` [11-09]

**11-10 改名**：`v7` → `luan0`、`valleys` → `luanV`（Generator 短名与 Worker 文件名；`vendor/luanti/` 的模块名与对拍工具的 `--mg` 仍是 Luanti 的 mapgen 名 `v7` / `valleys`）。

**定位**：给 pgviz 多两个**噪声结构完全不同**的生成器（luan0：3D 山地 + 山脊河 + 噪声交线洞；luanV：河谷剖面 + 河流 + 随河流 / 海拔改热度湿度），并且有**真实参考**可以对拍，所以调参 / 重构时不必靠截图主观比。

**做法**（用户 11-09 定）：Luanti 的 C++ 只当参考（浅克隆到 `/tmp/luanti-src`），JS 是**独立重写**，不逐行翻译；移植**模块化、可拆**——算法只在 `vendor/luanti/`（见该目录 `NOTICE.md` 的许可证边界），gode 一侧只有薄适配；**群系仍是声明式**（`defl/g/lt/biomes.tsv`，gode 自己的 12 个群系，字段语义取自 Luanti，不是 Minetest Game 的 default 群系）。

| 文件 | 内容 |
|---|---|
| `vendor/luanti/noise.js pcg.js` | 值噪声（整数哈希、缓和曲线、2D 缓和 / 3D 只在 eased 缓和的既有不对称、absvalue、点采样 `fractal2d/3d`、噪声区间 `bounds`）、PCG32（BigInt，只走稀疏路径） |
| `vendor/luanti/biome.js` | 热度 / 湿度最近点 + 垂直范围 + 垂直渗透 + 过渡点；`parseTsv`；`BiomeSet` |
| `vendor/luanti/mapgen.js` | 列式收尾：群系顶 / 填充 / 水 / 河床 → 噪声交线洞 → 洞穴 → 尘。**按参考的 80 格块（原点偏移 −32）分段**，段内状态重置，所以「地表落在块底时填充层被截断」这类参考的竖直接缝行为保留 |
| `vendor/luanti/v7.js valleys.js` | 地形（默认噪声 / spflags 同参考）；knobs：`terrain.shift contScale mountAmp river.width cave.rate`（luan0）、`terrain.shift contScale valley.depth river.size river.depth cave.rate`（luanV） |
| `defl/g/lt/core.js adapter.js biomes.tsv decorations.json schematics.json` | 装配（种子 = 参考的 `read_seed`：整数 / 十六进制 / MurmurHash64A）、slicer 适配、群系 / 装饰 / schematic 声明；`defl/g/luan0.js luanV.js` 是 Worker 入口 |
| `vendor/luanti/deco.js` | 装饰（simple / schematic）与 schematic 的 ASCII 层声明，见 §14.1 |
| `tools/luanti/run.mjs cmp.mjs parity.mjs ref-game/` | **对拍**（`--mg` 用 Luanti 的 `v7` / `valleys`，`cmp.mjs` 自动映射到 luan0 / luanV）：`run.mjs` 在 `/tmp/gode-lt/` 拼一个最小游戏（节点 + 同一张群系表，装饰 / 矿 / 地牢 / 光照 / 液体流动全关），起 `luanti --server` 导出某区域的真实节点；`cmp.mjs` 与 JS 逐格比；`parity.mjs` 一组回归（6 组种子 / 区域，约 20 s） |

**对拍结果**（96×96 区域 × y −64…191，≈ 235 万格）：节点一致率 **99.992–100%**，群系列 100%，热度 / 湿度最大差 ≤ 1.2e-4（参考是 f32，这里 f64）。验收口径 ≥ 99.9% 且群系列全对（`parity.mjs` 的判据）。残留差异都在 **y = −33 / 47 一线（块边界）** 和 **阈值附近的 f32 翻转**。过程中靠对拍抓到的几个点：浮点 → u16 的填充深度截断；液体流动污染参考（关掉 `liquid_update`）；luanV 的海拔 / 河流修正按**块内最高石面**算（所以是 per-chunk 的）；被裁掉的山顶不能当空气落尘。

**性能**：见 §14.1（列级噪声缓存后，不带装饰 luan0 ≈ 8 ms/块、luanV ≈ 7，带装饰 10–30）。luan0 山地 / luanV 的 3D 噪声另用「噪声区间能判出符号就跳过」，结果与不跳过完全相同。

### 14.1 装饰（树 / schematic）与 VoxeLibre 的思路 [11-09]

**装饰**（用户 11-09：「做树和 schematic 就行」）：`vendor/luanti/deco.js` 重写了 `simple` / `schematic` 两种装饰，沿参考的 **mapchunk（80³，原点偏移 −32）** 放置——每个块按注册顺序逐个 `placeDeco`（块种子 + i，PCG 种子 = blockseed + i + 53）、`sidelen` 分格、`noise` / `fill_ratio` 定数量、高度图 + biomemap + `place_on` + `spawn_by` 判定、schematic 居中 / 旋转 / 强制放置 / 只放进空气。**内容全是声明式**：`defl/g/lt/decorations.json`（7 条：橡树 / 桦树 / 云杉 / 丛林树 / 金合欢，按群系）、`defl/g/lt/schematics.json`（ASCII 层：`legend` 映射字符 → 节点，`.` = ignore，层从下往上、每层 z 行 × x 列）。

| 要点 | 说明 |
|---|---|
| 放置位置 | 请求一个 16×16 列时，把「vm 区域（块 ± 16）覆盖到这些列」的相邻块的装饰结果（带缓存）写进来；所以树冠跨块**不需要 outside** |
| 生成顺序 | 参考的 `emerge_area` 是 z 最外、y、x 最内，所以块按 (kz, ky, kx) 字典序「先后生成」；**先生成的相邻块的树叶对后生成的块可见**（叶子可行走 → 高度图抬高 → 树冠下 `place_on` 判定失败 → 不再种树，RNG 序列随之改变）。不模拟这条，密林里整块的树位置都对不上 |
| 递推深度 | 前驱自己也依赖它的前驱，会连成一条无限链，所以只递推 `deco.depth` 层（knob，默认 2，0–3）：0 = 各块独立（约 99.67%）、2 ≈ 99.96%、3 ≈ 99.986%（对拍区域内），越大越慢 |
| 参考的怪处 | ① 装饰噪声用的 `mapseed` 在参考里恒为 0（没有任何地方给它赋值），所以装饰噪声只受 `np.seed` 影响、不随世界种子变——我们照做；② schematic 的概率用全局 `myrand`（不可复现），这里用位置哈希，对拍用的 schematic 概率恒 255 |
| 没模拟 | 先到的树冠写进「还没生成的块」时会顶替地形（只做了写入侧，没做树冠下的群系 / 洞穴处理）；`all_floors` / `all_ceilings` / `liquid_surface` 报错不支持 |
| 尘 | `dustTopNodes` 挪到装饰之后（雪落在叶子上）；列顶必须是空气才落尘 |
| knobs | `tree.dens`（装饰密度乘子，同名同义于其它生成器）、`deco.depth` |

**列级噪声缓存**：`col3d`（`noise.js`）沿一列只缓存相邻两层格点，y 连续变化时几乎不再算哈希，**逐位等于** `fractal3d`（`selftest.mjs` 对拍，升 / 降 / 乱序 × 3 种 flags）。地形、山脊河、噪声洞、洞穴都用它：luan0 ≈ 24 → 8 ms/块；带装饰（depth 2）luan0 ≈ 10（普通）–30（密林）ms/块、luanV ≈ 10–24。pgviz 外圈 2D 的 `col` 动词覆盖成 `depth 0`（`adapter.js`），不然 6400 列会慢到 `viz-preview` 超时。

**对拍**：参考服务器多 emerge 一圈（`gode_emerge_pad` 96），不然边缘的树冠缺一块；`cmp.mjs` 把「参考没生成过的块」从前驱里剔除（`bounds`）。12 组（luan0 / luanV × 种子 / 区域，含 3 万树格的密林、洞穴与气候参数变体）节点一致率 **99.93–100%**，树格总数基本相等（密林 31962 vs 31870）。`tools/luanti/parity.mjs` 一把跑完约 45 s。

**VoxeLibre 的思路（只参考，不用代码；VL 是 GPLv3）**：VL 的地形不是它自己的——luan0 / luanV（Luanti 的 v7 / valleys）的地形、河、洞都是引擎的 C++，VL（`mcl_mapgen_core`）只调参数、注册群系 / 装饰 / 结构：打开 caverns 且 `cavern_threshold = 0.20`、关地牢、不允许 v6；`minetest.conf` 里 `mgvalleys_spflags = noaltitude_chill,noaltitude_dry,nohumid_rivers,vary_river_depth`（它的群系自带雪版，海拔降温 / 降湿会重复；`humid_rivers` 会让蘑菇岛老出现在河边）。借过来的是**参数思路**，做成 knobs：`cavern.threshold`（luan0 默认 0.7、luanV 0.6）、`cavern.limit`（默认 −256，在窗口外；调到 −30…100 才看得见大洞）、valleys 的 `climate.altChill / altDry / humidRivers`、`river.varyDepth`。VL 式预设 = `kw=cavern.threshold:0.2,cavern.limit:-30,climate.altChill:0,climate.altDry:0,climate.humidRivers:0`；这些 knobs 在对拍里验证过（`parity.mjs` 最后两组，99.992%）。

### 14.2 测试开销（11-10 实测）

| 项 | luan0 | luanV |
|---|---|---|
| 单块生成（带装饰 `deco.depth 2`，Node 直接调 `createGen`） | **14.4 ms/块** | **8.7 ms/块** |
| 建表（群系 + 装饰 + schematic） | 5 ms | 1 ms |
| 单进程常驻（100 块后 rss / heapUsed） | 228 MB / 70 MB | 324 MB / 130 MB |

- 量法：`createGen(mg, 20240607, {biomesText, decoText})` 后连算 100 块 × 256 列 `finalColumn`（`/tmp` 一次性脚本，未进仓库）。
- **浏览器侧才是大头**：pgviz 一屏 289 块、8 个 worker + Chrome，`gd check --matrix luan0,luanV` 一次峰值 ≈ **5.2 GiB**。
- 同一条命令这次两次都没跑完：第一次 284 s 后 `Runtime.evaluate 超时`，重试 94 s `socket hang up`（守护进程随之退出）；**页面本身 ready 正常**（默认 URL 下 luan0 / luanV 都在 5 s 内 ok），失败在检查流程里，原因没定位。所以 luan 系和 `veg` 一样**不进 `--matrix all`**。
- 要验挑一样就够：`node gode/tools/luanti/cmp.mjs --mg v7 --seed 42`（纯 Node，无 Chrome，235 万格 **0.9 s**、内存 < 0.5 GiB；11-10 重命名后实测 99.9996%）、`node gode/tools/luanti/parity.mjs`（6 组 ≈ 45 s）、`gd check errors --matrix luan0`（只开一个生成器，内存减半）、或小窗口 `?g=luan0&p1=@0,0&z=5` + `gd snap`。

**没做**（不在列式管线里，依赖整块 + 区块种子）：随机游走洞、地牢、悬岛（v7 `floatlands`）、矿。`ore.mul` 没有，`viz-kw` 在没有 `ore.mul` 时用 `terrain.shift`。pgviz `gd check all --matrix all`（6 个生成器）全过。**基线 `baseline.tsv` 没加 luan0 / luanV / old**（`BASE_GENS` 没改，等人决定）。

## 15. 原点叠加：文字 + 路径 [11-09]

- `xz2scr(x, z)`（`viz.xz2scr`）：世界格中心 → 地图 CSS px `[px, py]`；屏幕外或非俯视 / 仰视返回 `null`。叠加画在 `#rul` 上（`originMarks()`，每帧 `ruler()` 清屏后画）。
- ② 视图「小图持久化」下新增「原点文字」复选框（11-09 起默认开，URL `otext=0` 关）：原点名写在格上。
- 原点菜单（⌖ 右键）里「重置原点」换成「路径显示(距离:N格子)」切换（URL `opath=1`）：按列表顺序连黄色虚线，N = 折线欧氏长度取整（`viz.pathLen()`）。原点偏移仍可用 `viz.set('origin', null)` / URL 复位。
- 检查 `viz-omarks`。
- 11-09 追加：区块网格 / 空气距离 / 小图持久化 / 原点文字 + 「地形着色」select 都放进 ① 世界文件夹里（该文件夹默认折叠）。
- 「地形着色」`terr=0|1|2`（着色器 `uTerr`，只管俯视地表）：**默认** = 台阶式（西 / 北邻列更高 → 压暗）；**2.5D 地形** = 邻列高度差算法线的山体阴影（水面按水面高、切片面以下压平，光从 `uSun` 来）；**平滑光照** = MC 式每格四角 AO（被更高邻格遮挡 0…3 级）在格内双线性插值。旧 `terr=1` 仍读作 2.5D。
- **时间 · 光色拨盘**（② 视图里的「☀ 拨盘 (D)」按钮，快捷键 D；参考 `reference-vision/ui/time-and-biome-picker.png`）：圆环 = 一天（顶正午、底子夜、两侧日出 / 日落，拖动 5 分钟一格），中心时间，下半圆 🖌 = 自选光色（覆盖）/ ↶ = 复原。`tod=小时`、`lcol=rrggbb` 进 URL，`viz.set('tod'|'lcol', …)`；光色乘到整张地图着色上，太阳方向随时间转（东→头顶→西，夜里走月亮轨迹），默认（都为空）与原来完全一致。检查 `viz-dial`。
- 11-09 追加（二）：V 键 = giz 空白处右键（沿视线轴翻到反向：俯视 ↔ 仰视、南 ↔ 北…，不再循环六个视角）；原点默认名 `O1…` → `C1…`；拨盘 canvas 宽高要分别比较（默认 300×150，dpr 1.25 时宽相等、高没更新会被拉伸），中心圆撑满到圆环内缘。

## 16. 图层覆盖 + 群系 finder [11-09]

- **顶栏 `#modes` 里「图层」= 独立开关**（`layb`，URL `lay=1`，`viz.set('lay', true)`），不带 `data-m`，所以 **E 只在地表 / 切片间切**；「层叠」占位钮保持禁用（空气层叠以后做成「层叠」文件夹，不进 E 循环）。开了以后左栏 = ① 世界 → 群系 → ③ 方块 → ⑤ 选区，**没有 ② 视图**（关掉图层开关才有；视角 / 着色 / 拨盘等要等分进新文件夹）。
- **群系文件夹**：`模式` select（只显示 / 高亮显示 / 取消高亮，`bm=only|hl|un`）+ **群系网格**（参考 `reference-vision/ui/time-and-biome-picker.png`：圆色块 + 名 + 窗口内面积占比）。**左键 = 单选**（再点唯一选中的 = 清空）、**右键 = 多选开关**、「清空」= Erase；窗口里没有的群系变灰。选中集 `S.bio`（群系 id 数组，URL `bio=3,5`，`viz.set('bio', [3,5])`），没选 = 不起作用。
- **着色器**（`uBMode` + 256×1 R8 掩码 `uBsel`，纹理单元 6）：按 2D 列的群系 id 查掩码。**只显示 = 渲染时剪枝**：射线遇到未选中群系的列直接当空气跳过（俯视整条射线一步退出；侧视 / 切片沿线跳过，所以剖面里也只剩选中群系的体积）；高亮 = 选中加亮、其余变暗；取消高亮 = 选中压暗。只显示 / 高亮会给选中群系朝外的边画 1.3 px 亮线（缩放 ≥ 1.5、俯视 / 仰视）。
- **单选定位**：左键单选的群系在屏幕里没有（俯视按 x/z 矩形；侧视按水平轴）→ 视口中心挪到已载入列里离中心最近的那一格并 toast；已载入范围里也没有 → **`bioSearch`**：沿 512 格见方的方块环向外扫生成器（slicer 引擎动词 `bfind`：每块 32×32 点、步长 16 格，回 `sample().biome` 命中的点；多 worker 并行，按环从近到远，第一个有命中的环里取离中心最近的点，最远 48 环 ≈ 2.4 万格）。**每搜 3 秒停下问「继续找？」**（底部浮条 [继续] / [停止]，Esc 也停；换选中群系也会取消）。mini 全程约 2 秒扫完 48 环，liq 约 3 秒到 5900 格。`viz.bioLocate(id)` / `viz.bioSearch(id)`。
- **Agent 调用（11-10 实测，`?g=veg`）**：`gd eval 'viz.set("bio","19"); viz.set("bm","only"); await viz.bioSearch(19)'` → 视图跳到命中点并 toast；`viz.bioLocate(id)` 只查已载入的列（`false` = 屏幕里已有，`true` = 挪过去了，`null` = 没载入、交给 `bioSearch`）。`bfind` 走 `sample({x,z}).biome`，所以生成器只要 `sample` 的 `biome` 与 `meta.biomes` 下标一致就能用（veg 的 `sample` 用 `columnInfo`：群系精确，`h` 是平滑高度不是密度面）。veg 实测：单块 512×512 / 1 024 采样点约 **1 ms**；蘑菇岛、冰刺之地、红树林沼泽都在第 0–1 环 **12–17 ms** 命中；找一个主世界不存在的群系（末地）走满 48 环 + 一次「继续找」提示，**3.5 s** 返回 `null`，无报错。网格第一格叫「清空/右多选」，模式的 hint 在 select 上。换生成器时选中集清空。
- 还没做：窗口内「找」（连通块按面积列出、点一下跳过去、＋原点）；结构、层叠文件夹。
- 检查 `viz-biome`（6 个生成器的矩阵都过；`veg` 也过，11-10）。

- **自动矩阵口径 [11-09 定]**：`gd check --matrix all` = mini / gp / liq / old，**luan0 / luanV 不参与自动测试**（慢，且有 `tools/luanti/parity.mjs` 对拍）；要跑显式 `--matrix luan0,luanV`。`pg1` 同样不进默认矩阵（8.8 ms/块，8 池），显式 `--matrix pg1` 全过（11-10）。

## 17. 默认值 / URL 约定 / 布局收尾 [11-09]

- **默认**：生成器 `gp`、区块网格开、原点文字开、细节绘制 100%。URL 只写偏离默认的：`grid=0`、`otext=0`、`fill=0.7`；旧 `grid=1 otext=1` 仍读作开。
- **URL 状态**（`urlParams`）：
  - `p1=@x,z`（视口中心；侧视多一个 `^y` = 屏幕中心高度）。写法同顶栏粘贴框，但**坐标取绝对值**（与 `origin=` 无关）；粘贴含 `p1=` 的 URL 会跳到那点。
  - `pv=[-]X|Y|Z[:切片]`：视线轴 + 可选切片。`Y` = 俯视地表，`Z:70` = 南侧视切片 70，`-Y:123` = 仰视切片 123。**正号省略**（`+` 在 URL 里是空格；`+Y` 读作 `Y`）。映射 `+Y 俯 / -Y 仰 / +Z 南 / -Z 北 / +X 东 / -X 西`（与 `VIEWS[…].ax` 同）。
  - `shade=`（方块色 / 群系色 / 高度）、`layer=`（图层）、`terr= tod= lcol= bio= bm= lay= …` 不变。
  - `pts=名:x,z;名:x,z`（原 `origins=`，旧名仍读）、`sel=x0,y0,z0,x1,y1,z1`、`hit=x,y,z`。
  - 旧 `x= z= y= view= slice= mode=` 仍可读（`gd`、旧检查、旧链接）；有 `p1` / `pv` 时以新的为准。
- **`pts` / `sel` / `hit` 不随改动写进地址栏**：`location` 里只有「加载时带的」或「最近一次复制时的」快照（`snap`）。**复制 URL / 复制 gd**（`shareQs()`）才把当前值写进快照和地址栏；→ Agent 的 `ctx.href` 用当前值（不动地址栏）。之后再改，地址栏保持快照。
- **布局**：顶栏「图层」→「地理🌍」（`#layb`，覆盖模式的开关）；「图层不透明度」滑块从 ② 视图挪到 ① 世界、细节绘制下面（图层 chip 仍在 ②）；③ 方块的「选区范围」行删了（选区尺寸在 ⑤ 选区里仍有）。
- 检查 `viz-url`（默认 / 布局 / `pv p1` 往返 / `pts sel` 只在复制时进地址栏 / 粘贴 `p1`）；`--matrix all` 全过。

### 17.1 追加 [11-09]

- **左下角读数 `#read`** 只剩 `Y {切片高}`；有选区再加 ` sel @x,z^y`（近端格，相对原点，同 ⎘ 点；轴名随视线轴：`Z 70`）。不再随悬停变，选区 / 切片一改就更新。⑤ 选区里的「尺寸」行删了。
- **URL 实时 / 快照分组**：实时写进地址栏的只有 `g seed kw p1 pv shade layer z`；**其余**（`sel hit pts bio origin` 和 `fill rate minip otext grid terr lay bm tod lcol opath air lop seld`）都是快照，复制 URL / gd 时才更新（`snapVals()`）。`⎘ URL` / `⎘ gd` 现在无选区也可点。`kw` 与 `g seed` 一样当作世界身份，保持实时（不然地址栏和世界对不上）。
- **`zoom` 改名 `z`**，取整（`z=3`）。旧 URL（有 `x=` 且没有 `p1`）里的 `z=` 仍读作世界 z、`zoom=` 仍读作缩放。
- **③ 已选中不再闪**：点选新格时，新 sample 到之前沿用旧 sample 的内容（几十毫秒），不再先塌成「…」一行再长高；等待期间「⎘ sample」禁用、→ Agent 不带 sample。
- **图层 L**：顺序 无 → 各 sample 场 → **树种（最后）**；L 默认**从后往前**（无 → 树种 → … → 第一个场 → 无），Shift+L 反向。
- **默认值**：图层不透明度 35%、快放 7 层/秒（URL 只在偏离时写 `lop= rate=`）。
- 检查 `viz-url` 扩展（默认值、图层顺序、读数、分组、`z`）；`viz-air / dial / biome` 读 URL 前先点 ⎘ URL；`viz-omarks` 收尾恢复 `otext` 开。`--matrix all` 全过。

### 17.2 追加 [11-09]

- **文件夹编号**：⑤ 选区 → ④ 选区；群系前加 `②`（所以普通模式下 ② 视图 与 ② 群系 同号；覆盖模式下是 ① 世界 / ② 群系 / ③ 方块 / ④ 选区）。
- **悬停面板**：去掉「绝对」「区块」行（已选中面板仍有）；头两行（方块名、`@x,z^y`）用该列群系色、15 px（太暗的群系色往白提亮到亮度 ≥ 130，`biomeCss`），已选中面板同样。
- **高度行**：`高度  最高 h`，仅当 h ≠ 地表时再加 `地表 y`；**水深并进空气距行**（`空气距  n   水深 w`；没有空气距——已选中 / 外圈——时单独一行 `水深  w`）。
- **「地表」模式**：
  - 俯视：切片 Y = 已载入 3D 块里**地表最高点**（`surfTop()`，按 `store.rev` 缓存），不再是窗口顶 H-1；读数 / 滑块都显示它，滚轮从它往下退；仰视不变。
  - 其他视角：见 §17.3（E 切换时选区变成两个截面之间的长条）。
- 检查：`viz-seldepth`（俯视地表读数 0 < Y < 255）、`viz-numpad` 的 Shift+滚轮改成相对地表最高点。

### 17.3 E 切换时选区变成「两截面之间的长条」[11-09]

- 例：`pv=Z:124`（南视、切片 124），小图是俯视、蓝线 = 切面。按 **E** 回到地表（切面挪到最外层）：选区沿视线轴变成 `124 … 新截面` 一长条（`bridgeSel`；其余两轴保持原选区，没有选区时取屏幕中心所在区块的那一列），toast 提示「选区 = 两个截面之间 N 层（9 扫过）」。再按 E（地表 → 切片）同样，长条 = 最外层 … 新切片。点顶栏「地表 / 切片」按钮效果相同。
- **按 9**：快放层数 = 选区深度 = 长条长度，正好从一个截面扫到另一个。切片落在长条**远端**时（地表 → 切片那种），9 改从长条**近端**扫起，扫过整条；松开仍停在当前层。
- 俯视不动（俯视的选区约定是到基岩）。
- 新截面的坐标要等窗口重新居中后才对（侧视切片时窗口中心随切片挪），所以是先 `changed()` 再算长条。
- 撤回了 §17.2 里「地表模式左 / 右键选区向近端扩」的做法（我误解了「进入之前—当前截面」）。
- 左下角读数在快放中也实时更新（`draw()` 里调 `readout()`）。检查 `viz-bridge`（含 9 扫过的读数落在长条内、反向切换、俯视不动）。

### 17.4 `shade=height` 改成「洞窟」着色 [11-09]

- 原来的高度色带没了（URL 值仍叫 `height`，② 视图「着色」里改叫「洞窟（地下）」）。效果 = noclip 钻进地下往外看：**岩石与地表全部剔除（像背面剔除）**，只剩洞窟空气围出来的墙面 / 地板；没有洞窟的射线是暗底（外圈 2D 也是暗底）。
- 着色器（`uShade == 2`，gl.js 步进循环里）：沿视线逐格走，**洞窟空气** = 非实体格 + 低于该列最高实体（`col2.y`）+ **头顶先碰到的实体是岩石而不是树类**（`underRock`：往上最多数 48 格；树冠下的空气先碰到树叶 → 不算洞窟）。进过洞窟空气后碰到的**第一个实体**就是墙面（俯视 = 洞底、侧视 = 切面后方的洞壁）；其余（天空空气、岩石、地表）都 `continue` 跳过。
- 光：墙面色 = 方块色 × 原有邻格遮挡；再按洞窟空气走过的格数（`dist`）做深度雾（越深越暗、偏蓝黑，手电筒式）。空气距离复选框此时数的也是洞窟空气格数。
- 树类标记：`palette.js` LUT 的 alpha 最低位 = 树类（`_leaves/_log/_wood/_stem`、vine、cactus；`cls × 64` 的低位本来空着，`clsOf` 不受影响）。
- 俯视的「地表」切片 Y = 地表最高点，洞窟俯视从它往下剔。2.5D 地形 / 平滑光照在洞窟模式下不生效（那是地表高度的阴影）。
- 检查 `viz-cave`（俯视地表剔除后暗占比上升、侧视非全黑、不报错）；`--matrix all` 全过。

### 17.5 洞窟着色的俯视改成「玩家站在洞底看到的」[11-09]

- 俯视时每列只看**最上面一层洞**的洞底，原来全是方块灰，不同深度的洞底叠在一起分不开。现在 `caveFloor()`（gl.js）：
  - **颜色 = 洞底高度**（`caveRamp`：深处紫蓝 → 浅处黄，跨度 0 … 海平面+24），② 视图「着色」下面有色带图例（`#cleg`，只在洞窟着色时显示）；
  - **每 4 格一档明暗**（`mod(y, 8) < 4`）：相邻不同高度的洞底像等高线一样分得开；
  - **头顶净空**：往上数空气格（≤ 24），矮洞 / 爬行通道压暗、大洞厅亮；
  - **贴墙 / 落差压暗**：洞底上一层四邻有实体（贴墙）、洞底同层四邻是空气（落差边）都按格压暗，洞的轮廓和台阶边缘更清楚；
  - 岩浆 / 水等饱和色方块保持本色（按饱和度从高度色渐变到方块色），危险区一眼可见。
- 侧视仍是切面后方洞壁 + 深度雾。检查 `viz-cave` / `--matrix all` 全过。

### 17.6 [11-09]

- **左栏错位修复**：洞窟图例原来是「空 `<label>` + 隐藏的 div」，非洞窟着色时 div 不占格、空 label 却占一格，把后面所有 label / 控件的列挤错位。现在 `#cleg` 是 `.full` 单元素，隐藏时整块不占格。**规则：`.sec` 网格里不要放会被 `display:none` 的半对元素**。
- 群系模式默认「高亮显示」（`bm` 默认 `hl`；URL 只在非 `hl` 时写 `bm=`）。
- 顶栏 `#gx #gz` 宽度 78 → 39 px。

### 17.7 [11-09]

- 左下角读数的选区部分改成**选区尺寸**：`Y 127 ⤧ +@16,16^120`（x 格数, z 格数 ^ y 格数；`+` = 尺寸而不是坐标，俯视整块选区常是 16,16^…）。原来误做成近端格的坐标 `sel @x,z^y`。


## 18. `pg1` = goodPG1 生成器移植 [11-10]

- **来源与做法（11-10 原为零改动；11-11 起改为副本）**：`goodPG1.html` 是单文件经典脚本，供体自己的 Worker 路径就是「整段 `<script>` + `self.IS_WORKER=true`」执行（goodPG1.html:3350）。`tools/build-pg1.mjs` 把 §1 核心工具 + §2 注册表 + §4 世界生成切到 `vendor/pg1/gen.js`（切出时 1676 行，跳过纹理 / 渲染 / 玩法 / UI / 存档），`vendor/pg1/load.js` 用 `new Function` 执行后返回 `WorldGen / Chunk / BLOCKS / BIOMES / …`。**副本可手改**（SURV 调优都在这里）；donor 原文不动，`build-pg1.mjs --check` 用 `gen.donor.sha` 比对 donor 是否变了，要重写副本必须 `--force`（会覆盖手改）。
- **坐标 / 布局**：`(y<<8)|(z<<4)|x` 与规范相同，`WH = 192`、海 63；id 453 个（< 4096）、meta ≤ 5 → `v = id | meta<<12`，不需要 `xlate`。`heights` 按规范从方块重算（供体 `hmap` 跳过 `filter = 0` 的植物，口径不同）。
- **封闭性**：树 / 结构 / 特征 / 入口隧道全走 `Writer`（goodPG1.html:2206），越界写入直接丢；`meta.outside = false`，`viz-seam` 的 cross / lost 不适用。
- **`col` 覆盖**：外圈 2D 用 `column()` 只算列噪声（`h`、群系、`sea - h` 水深、近似地表方块 `bio.top / bio.under`）；整块生成要 8.8 ms，6400 块会超时（同 §14 的做法）。
- **SURV 调优（11-11）**：副本里加了参数表 `GEN_PARAMS`（`terrain.mount / terrain.hills / terrain.mountPct / cave.rate / cave.entrance / tree.dens / ore.mul`）与 `setGenParams`；`defl/g/pg1.js` 的 `meta.knobs` 引用它，`viz.tune` / `?kw=` 可用。`colInfo(x,z)` 把列气候与三档权重（`temp / hum / cont / ero / mfac / mntW / hillW`）给 `sample`，噪声热力图不再只有 `h / biome`。
  - **高山造型（自然公园）**：`terrain.spike` 给山脊加低频尖峰（`ridge2 /90` 四次方 ×10×mntW），`terrain.canyon` 沿 `nR /320` 的等值带做平滑 V 形下切（最深 34×mntW，谷底不低于 `SEA+2`），`mountain.hollow` 用 `nCv1.fbm3 /110,/60` 在山体内部挖大洞厅（`y<h-1`，不在地表留坑；洞厅切开陡壁时成为拱 / 侧窗）。`column()` 把 `mntW` 量化进 bit16–23，`genOverworld` 的 padded `MW` 用它决定哪里挖。实测空腔：snowy_slopes 14.4%（hollow 0）→19.1%（0.7），stony_peaks 11.1%→14.1%。
  - **海岸**：`terrain.coast`（0–1，默认 0.8）按「基础高度离海平面 ≤10 格」压 `contH` 的 base（海侧深度 ×0.35、陆侧高差 ×0.45，丘陵再乘 (1−0.6·coast)），压的是 base 而不是最终 h，避免 cont 抖动压出坑。实测：beach 占比 8.5%→10.9%、近岸 8 格高差 ≥5 的列 28.6%→26.1%、海洋占比 29.1%→27.7%。
  - **地形**：低频山脉因子（`nMisc.fbm2 /900`）分三档，默认 `terrain.mountPct=0.13`（SurvivalCraft 口径）：山心 ≈ `mfac>0.69`、丘陵 0.51–0.63，实测 **66.7 / 20.2 / 13.1 %**（平原 / 丘陵 / 山脉，q 口径 4225 列）；山脉 +130×`ridge^1.7`，丘陵 ±(5+16)`hills`。
  - **树**：`treeP`（逐列概率）换成 `treeD`（每块期望树数，4×4 格至多一棵），森林 4 / 深林 4.5 / 丛林 4 / 针叶 3.2（供体森林原为 ~18 棵/块）；`treeBlocked()` 再按 SurvivalCraft 的「树周围 4 格无阻挡」做格子键去重（半径 4，Chebyshev），实测森林 2.4–3 棵/块、平原 0.4。
  - **洞穴**：`cave.rate` 默认 1.5（体积与连通度）；`entrances()` 在 64×64 格上取候选（`cave.entrance` 1.5 ≈ 82% 的格子有入口），挖 2×2 盘旋阶梯井 + 井底 52 步主巷道（每 12 步一条支巷），跨块一致（Writer 只留本块）。`entranceSite(gx,gz)` 单独暴露给出生点评分用。
  - **出生点**：`spawn()` 按 SurvivalCraft `ScoreSpawnPosition` 口径打分 —— 温带（`temp` 归一 0.45–0.65）、湿度 0.15–0.55、海拔 ≤ `SEA+12`、坡度 ≤ 5、距原点 ≤ 400、非山（`mntW ≤ 0.9`）、非水；640 格内 16 格步长螺旋搜索。附近 160 格内有洞穴入口（`entranceSite()`）加 0.6、320 格内加 0.3；若 160 格内的最佳点比分差 < 1.2 则优先它。`treeNear(x,z,2)` 排除树干/树冠，3×3 高差 >1 扣分（避免贴墙）。返回值扩展成 5 元 `[x,y,z,yaw,pitch]`，yaw 取 8 向里「远处更低 + 近处不挡视线」的一侧。当前 seed 出生 `(243.5,76,121.5)`，3×3 高度 75–76，最近入口 39 格，yaw 135°。
- **实测（seed 20240607）**：pgviz 8 池约 `10–13 ms/块`（SURV 版；Node 单线程 5.9 ms），`gd check --matrix pg1` 27 条全过；`gd reload` 前后同区域方块计数逐项相等；`gode/index.html?g=pg1&seed=20240607` 能开局。
