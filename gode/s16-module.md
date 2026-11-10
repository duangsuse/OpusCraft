# s16 · 模块框架：登记处、脚本模块、虚拟键、页面绑定、管理面板（11-09）

> 缘起 [定 11-09，用户]：`flow/title.ts` 的 `STATES` 过度拆解（`spin`、`preview` 多余，有 imgui 味），要先想好游戏与 HTML 怎么交互；`MOVES` 不错，但要接上虚拟键系统；`mod` 描述符里的 `doc` 这些不该是元数据，该是运行时可编辑、可看到的值；`uses` 是不是 import？
> 结论：**缺一个框架**。模块化和交互能力绑在一起，没有管理工具的模块化无效。panify（`goal-panify/`、s09）是它「值」的那一半，本节补「模块」的那一半。
> 规格在 `gode/flow/kernel.ts`（框架）、`feel.ts`（拆出的手感模块）和各模块文件的修订；用户用表单四轮拍板（11-09）。

## 0. 已定

| # | 决定 | 出处 |
|---|---|---|
| K-1 | **基石 = 登记处 + 所有权**：模块是登记处里的一个单位；参数、表行、虚拟键、订阅、面板行、监听器都经它登记，带模块 id。可列出、可改值、可整体撤销 | 表单 1 |
| K-2 | **`uses` 改名 `depends`，并且有牙**（Luanti `mod.conf` 的 `depends`）：声明决定加载顺序（拓扑，循环报错）；模块拿到的 `gm` 是受限视图，只暴露声明过的命名空间，越权抛错并记录；停用被依赖的模块时连带停用并提示 | 表单 1 |
| K-3 | **`doc` 是运行时 Ref `mod.<id>.doc`**（任何路径都可以有 doc，存 `defl/doc.tsv`，面板里改、✎ 写回）；`emit / sub / c_ / tables / save` 由登记处**观察**，不再手写第二遍。`flow/*.ts` 退为设计期规格，`gd check mods` 比对「观察到的 ⊆ 规格」 | 表单 1 |
| K-4 | **页面是视图**：游戏暴露「值」和「动作」。枚举 → `<html data-*>`，连续量 → CSS 变量，文本 → `data-bind`，列表 → `<template data-each>`；点击 `data-act="…"` = 按一次虚拟键。页面（`defl/ui.html` + `ui.css`，模组可整体替换）决定每个状态下怎么显示。`STATES`、`ELEMS` 取消 | 表单 1 |
| K-5 | **虚拟键 = `ACTS` 表**（`KEYS` 升级）：`[动作, 键, 触屏手势, 方式, 何时有效, 标签]`。物理键、触屏、`data-act`、命令行、模组都只产生动作名，进同一个 `press(act)`。没有键位的行（continue / start / ask / respawn）也是合法虚拟键；`Action` 是开放集合，模组往 `acts.tsv` 追加行就多一个动作 | 表单 2 |
| K-6 | **`MOVES` 通用化**：`[Ref 路径, 从, 动作, 到]`，kernel 执行，改的是 Ref。screen、cam（F4 轮转）共用一个机制；模组追加行就能加新屏。`paused = screen ≠ 'game'` 派生；`preview` 归相机（订阅 `screen`） | 表单 2 |
| K-7 | **管理工具 = 面板「模组」root（`gg.pane`）+ `gg.mods`**，不另做页面 | 表单 2 |
| K-8 | **引擎核心不可停，默认模组可停、可被同 id 模组替换**。核心 = game world p1 interact ents save render pane slicer kernel input；默认模组 = audio fx sim weather title hud feel。每个可停用模块的 `Mod.off` 写明停用后消费者看到什么 | 表单 3 |
| K-9 | **模块写法 = 脚本 + 受限视图，不写 `export / const / class`**：`gg / gm / c_` 作为形参注入，赋值与对象字面量登记，位置决定种类（Pass DSL、`c_.X = {…}`、`gg.ev`、宿主 B `gm.on` 同一路） | 表单 4（用户澄清：项目对复用与声明式要求高，不要 JS 噪音） |
| K-10 | **元信息放 `defl/mod.tsv` 一张表**：`id file where depends on`。脚本里零声明；管理面板直接改「启用」列；模组同 id 行覆盖 | 表单 4 |
| K-11 | **模组 worker 同写法**：worker 里也是脚本，注入的 `gm` 是消息代理。协议（s07 §2 的信封）不变，`subs` 由 `gm.on` 的键自动生成，不再手写 `ready.meta.subs`。生成器 / 渲染器那类动词导出（`export function gen / mesh`，G-8）不变，它们是 Worker 的动词，不是模块 | 表单 4 |
| K-12 | **顺序：先在 `flow/` 写框架规格，再开工**（本节与 `kernel.ts` 即是第一步） | 表单 3 |
| K-13 | **热重载是设计目标**：tsv / json 外提的本意就是方便热重载；模块脚本也应能热替换（重新 eval 成本很低，F5 再快也要重生世界）。规格见 §13 | 用户 11-09 |
| K-14 | **开发服务器 `gode/tools/dev.js` 接管 :8765**（零依赖 Node，同端口，取代 `http-server -p 8765 -c 1`）：静态 + SSE 文件变更推送 + 白名单写回 + 目录清单 + perf-collect。没起服务器时页面静默回退 | 表单 5 |
| K-15 | **脚本热替换的私有状态：`down()` 返回交接对象，`up(prev)` 接收**（HMR dispose / accept 风格；没选 `gm.keep`） | 表单 5 |
| K-16 | **表热更新 = 就地 diff**：改了的行写 Ref，增删行发 `tbl_change`；模块读表必须经 `gm.tbl.<名字>`，不缓存副本 | 表单 5 |
| K-17 | **gd 配合**：新增 `gd mods`、`gd check mods`；shot / check 前的自动重载按 `HOT` 表：能热更新的（`defl/` 的脚本、表、ui）不整页重载，只有引擎核心 js 才整页 | 表单 5 |
| K-18 | **唤醒（`Mod.wake`）[11-10 用户]**：默认模组可声明一组事件（须在它的 `sub` 里）；它停用期间这些事件一发出，kernel 先重新启用它（`mod_change why = 'wake'`）再交给它。只用于明确的指令（模组命令 `{time}` / `{weather}` → weather）；被动消费（粒子、音效）不唤醒，消费者看 `off`。`{popup}` 归 kernel（核心，不可停） | hooks 对照 |

## 1. 一个模块长什么样

`defl/fx.js`：粒子模块的一小段（下面这段脚本已用 `tsc` 的 `checkJs` 对着 `flow/` 的类型检查过，零报错；把命名空间、事件名、载荷字段写错都会报）：

```js
c_.Fx = { gravity: [0.8, 0, 2, '重力'], max: [600, 100, 2000, '粒子上限'] }   // 赋值 = 登记参数主题；[默认, 最小, 最大, 标签] 一行
gm.on({                                                                      // 对象字面量批量订阅，键 = 事件名
  blk_break(e) {
    gg.render.fx.burst({ at: e.P, n: 24, vel: [[-1, 1, -1], [1, 3, 1]], life: [0.4, 0.9], color: 'blk', of: e.blk, tex: true })
  },
  p1_land(e) { if (e.fall > 3) gm.world.get(e.P) },
  down() { },                                                                // 停用 / 重载时调用（可省；模块私有，不进 Ev）
})
```

没有 `export`、`const`、`class`、`import`，也没有 `ctx`。要在热替换时保住私有状态，用一对钩子交接（§13.2；同样用 `tsc` 的 `checkJs` 验过）：

```js
let cache = new Map()
gm.on({
  up(prev) { cache = prev?.cache ?? cache },    // 脚本顶层跑完后调用；prev = 上一个实例 down() 的返回值（首次加载是 undefined）
  down()   { return { cache } },                // 热替换 / 停用时调用；返回交接对象
  blk_break(e) { cache.set(e.P, e.blk) },
})
```

清单在 `defl/mod.tsv`：

```
# id    file      where  depends               on
fx      fx.js     main   render world pane     1
weather weather.js main  world pane            1
```

说明在 `defl/doc.tsv`（运行时是 Ref `mod.fx.doc`）：

```
mod.fx    触发与放置在 main；模拟与绘制在渲染器（RenderFx）
```

`node gode/flow/graph.ts tsv` 与 `graph.ts doc` 直接从规格生成这两张表的初值：规格先于数据。

## 2. 登记处与所有权

**三个形参的分工 [定 11-10，用户]**：`gm` = 模组高频 API（`world p1 ents put act pts hooks.cmd sim.schedule game.mode tbl fx pane`，加订阅 `gm.on`），worker 里的模组只有它（经 s07 M-2 白名单代理成消息）；`gg` = 引擎装置（`audio render cam feel weather title hud save slicer mods dev input`、`game.start/pause/…`、`hooks.run`、`sim.relight`）加上面的登记工具，只在 main；`c_` = 参数。`depends` 一个列表同时限制两边，同名命名空间（`game / hooks / sim`）两边各有一部分。`gm.pane`（运行时读写）与 `gg.pane(root, rows)`（声明）是两回事，后者留在 gg。

**视图带来所有权**：kernel 执行脚本时把 `gg / gm / c_` 换成这个模块的视图，视图上的每个登记点都记在模块名下。不需要全局「当前模块」，所以脚本跑完之后（事件回调里再登记）也不会丢主人。

| 登记点 | 登记什么 | 停用时 |
|---|---|---|
| `c_.X = {…}` | 参数主题 | 面板文件夹移除；值（`gg_v`、存档层）保留，下次启用还在 |
| `gm.on({…})` | 订阅（键 = 事件名） | 取消 |
| `gg.ev(el, {…})` | DOM 监听 | 摘掉 |
| `gg.pane(root, rows)` | 面板 root | 移除 |
| `gg.after / every` | 计时器 | 清掉（脚本里别直接用 `setTimeout`） |
| `gm.tbl.<名字>` | 读过的表（记录，不撤销：表属于数据层） | — |
| 模组带来的 tsv 行（`acts / moves / bind / mod`） | 本层的行 | 整层移除（s07 §4 叠加的逆） |
| 发出事件 | 每个事件的次数（实时计数，窗口 `$Mods.counterMs`） | — |

**depends 的牙**：视图是 `Proxy`，只有声明过的命名空间存在。越权访问（`$Mods.strict` = 真）抛错并记进 `ModInfo.seen.used`；关掉 strict 则只记录。加载顺序 = depends 的拓扑序，同层按 `mod.tsv` 行序；循环依赖在加载时报错并停用环里的模块。

**脚本出错**：记进 `ModInfo.err`，不拖垮别的模块（`mod_change why = 'error'`）。首次加载失败 = 该模块被停用；**热替换失败 = 留在上一个能跑的版本**（§13.2）。

**观察 vs 规格**：`flow/*.ts` 的 `Mod`（`emit / sub / depends / tables / c_ / save`）是设计期规格，`tsc` 检查它们的闭合性；运行时登记处观察到的订阅、发出、用到的命名空间必须是规格的子集，`gd check mods` 断言这一点（本文落地时补）。

## 3. 路径空间

一个 Ref 树，一条写路由（面板、命令 `/set`、模组 `{set}`、MOVES、绑定器同一条，s09 P-2）：

| 根 | 内容 | 例 |
|---|---|---|
| `$`（JS 里 `c_`） | 参数主题（tunable；与默认值不同的才进 `gg_v`）。记法 [定 11-09，用户]：标记语言里（pkv、tsv 的列、命令行、`Mod.c_` 的登记、`{set}` 的路径）写 `$Fx`，JS 里是 `c_.Fx`，两者等价 | `$Fx.gravity` |
| `blk mob p1` | 表行（s09 §3） | `blk.:sand.gravity` |
| `tbl` | defl 表的行（面板 `pickLib` 可搜索编辑） | `tbl.bursts.blk_break.n` |
| `mod` | 模块自己 | `mod.fx.on`、`mod.fx.doc` |
| `act` | 虚拟键行（可重绑） | `act.pause.keys` |
| gm 的 Ref 型成员 | 运行时状态，不进 `gg_v` | `title.screen`、`cam.mode`、`p1.stat`、`world.here`、`weather.clock`、`p1.bar.hot` |

- 状态型事件在持有者的命名空间里各有一个同名的「最新值」Ref：事件是变化的推送，Ref 是页面绑定和 `gm` 读取用的。
- `index.ts` 的 `RefPath` 从 `Gm` 里推出所有 Ref 型成员，`MOVES` 与 `BIND` 的路径用它做类型检查。
- `Ref` 带 `key / owner / meta`（`label doc range fx options`），`doc` 与 `options`（枚举取值顺序）是这次加的。
- 取值优先级沿用 s09 §1：声明字面量 < `defl/c_.json` < 模组层 < 存档 < `gg_v` < `&json=`。`mod.<id>.on` 也走这条（存档层 = `Pusc.json` 的 `mods`，同一个世界总用同一组模组）。

## 4. 虚拟键

```
物理键 ─┐
触屏手势 ┼─▶ ACTS 表 ─▶ press(act) ─┬─▶ Intent.hold / press（p1、interact）
data-act ┤                         └─▶ key 事件 ─▶ kernel MOVES、命令行、音频解锁、模组 worker {key}
命令行 ──┤
模组 ────┘
```

- `ACTS` 每行一个动作；`how` = `hold`（按住有意义）/ `press` / `dbl`（双击）/ `long`（长按）；`when` 是生效的屏幕名（空格分隔，`*` = 任何）。
- 帮助键（宿主 B `HelpKeys`：点帮助文字里的 `<b>` 模拟按键）变成 `<b data-act="pause">Esc</b>`，不再解析键名。
- 屏幕按钮（⛏ ▣ Ⅱ 🏃）是 `ui.html` 里的 `<b data-btn="⛏">`；点 / 长按 / 双击的手势查 `ACTS` 触屏列（⛏.long 等）。这样键位设置界面一处看全。
- 命令行 `/time 7` 本身是一个动作，键位表第一列可以直接写它（Q-cmd）。
- 键位设置界面、帮助键提示、触屏按钮标签都从 `ACTS` 生成，不再各自抄一份。

## 5. MOVES：Ref × 动作 → Ref

```
['title.screen', 'game',    'pause',      'paused']
['title.screen', 'loading', 'game_ready', 'game']      // 事件也能当「动作」
['cam.mode',     '*',       'cam',        '<next>']    // F4 轮转：按 meta.options 的顺序
['cam.mode',     '*',       'camHome',    'fp']        // 长按 F4
```

- kernel 订阅 `key`（全部虚拟键边沿）和表里出现的事件名；当前值 = 从（或 `*`）且动作匹配 → 写 Ref。同一 (Ref, 动作) 多行：从上到下第一个匹配。
- 写的是 Ref，副作用由 Ref 的 owner 响应：title 发 `screen` 事件，input 换相机。MOVES 不认识屏幕，也不认识相机。
- 动作名必须在 `ACTS` 里，否则是事件名，且要列进 `kernel.sub`（`index.ts` 检查 ⑦）。
- 模组加新屏（背包 / 地图 / clawd）：往 `moves.tsv` 追加几行，页面加几条 `html[data-screen=…]` 的 CSS。
- 暂未收进来：G 键切模式。cheat 关闭后 G 键失效的条件（s07 §3）行表达不了，留在 game 代码里。

## 6. 游戏与 HTML 怎么交互

用户 11-09：先想好游戏与 html 怎么交互，不要 imgui 味。原则：**页面自己决定怎么画，游戏只暴露值和动作。**

| 方向 | 机制 | 例 |
|---|---|---|
| 值 → 页面（枚举） | `BIND` 行 `attr`：`<html data-NAME>`（布尔：真 = 存在，值 `1`） | `data-screen`、`data-cam`、`data-fluid`、`data-dead` |
| 值 → 页面（数） | `BIND` 行 `var`：`<html style="--NAME">` | `--hp`、`--hunger`、`--hour`、`--sel` |
| 值 → 页面（文本、列表） | 元素 `data-bind="路径"`；`<template data-each="路径">` 每项克隆一份，子元素 `data-bind=".字段"` | 物品栏、F3、消息 |
| 页面 → 游戏 | 元素 `data-act="动作"`（点击 = `press`，按住型按下 / 松开各一次）；`data-btn="⛏"` | 继续、开始、Esc 帮助键、屏幕按钮 |

```html
<!-- defl/ui.html（节选） -->
<section id=menu> <button data-act="continue">继续</button> <input id=seed> <button data-act="start">开始</button> </section>
<div id=bars><i style="--n: var(--hp)"></i></div>
<template data-each="p1.bar.hot"><b data-bind=".name"></b></template>
<style>
html[data-screen=game]    #menu   { display: none }
html[data-screen=loading] #spin   { display: block }
html[data-screen=paused]  #hotbar { opacity: .5 }
html[data-mode=creative]  #bars   { display: none }
html[data-hurt]           body::after { content: ''; background: #f004 }
</style>
```

- `STATES` 的列怎么处置：`menu / spin / hotbar` 是 CSS 选择器；`preview` 是相机订阅 `screen`（`$Cam.previewFov`）；`paused` 是 `screen ≠ 'game'`。五列表整张取消。
- `ELEMS`（HUD 元素 × 数据来源 × 画什么）取消：它只是文档。hud 模块只留页面算不出来的东西：F3 文字、消息队列、命令行、受伤脉冲、模组 HUD。
- 绑定器是 kernel 的一部分，约 40 行，订阅 `Ref`；`bind.tsv` 的行由各模块文件写自己的那份（kernel 写 screen / cam / mode，hud 写血条等）。
- 页面文件跟模组走同一套叠加（s07 §4）：模组可以整体换 `ui.html + ui.css`。

## 7. 管理面板：「模组」root

在 `gg.pane` 里，taskbar 多一个「模组」root（默认归属 `game:pause`，也可移到独立面板页，s09 §6），不另做页面。**面板行是纯数据（s09 §9）**：每个模块一个文件夹，行是 `mod.<id>.on`、`mod.<id>.doc`（多行文本）与 `mod.<id>.*` 的只读 Ref，重载 / 停用是按钮动作（命令 `/mods …` 随管理面板一起加）；预设、✎ 写回沿用 s09。

```
模组
 ├ 搜索（全局路径：c_.* / tbl.* / mod.* / act.*，与 taskbar 搜索同一个）
 ├ 引擎（核心，上锁，只看）
 ├ <id>   [☑ 启用]  [↻ 重载]  状态 ok / err
 │   ├ 说明          doc（多行，可改，✎ 写回 defl/doc.tsv）
 │   ├ 停用后        off（只读）
 │   ├ 依赖          声明的 depends / 实际用到的命名空间（越权标红）
 │   ├ 参数          该模块登记的 c_ 文件夹（行类型同 panify，预设按钮）
 │   ├ 表            读过的表（pickLib 可搜索，行可改，✎ 写回对应层）
 │   ├ 键位          它登记的 ACTS 行（键 / 触屏 / 方式，可重绑）
 │   ├ 订阅          事件名
 │   └ 发出          事件名 · 频率 · 最近 1 s 次数
 └ 依赖图          mermaid（graph.ts mermaid 的运行时版），点节点跳到该模块
```

`gg.mods` 是同一份数据的 API：`list() get(id) on(id, bool) reload(id) sync() graph()`，`gm.tbl.<名字>` 取表，`gg.dev` 是开发服务器的页面端（面板 ✎ 写回走 `gg.dev.write`，§13.4）。命令行 `/mods off fx` 之类等管理面板就绪后再加。

## 8. 核心与可停用

| 核心（不可停，引擎启动时直接加载） | 默认模组（`mod.tsv` 里的行，可停、可被同 id 模组替换） | 停用后 `Mod.off` |
|---|---|---|
| game world p1 interact ents save render pane slicer kernel input | **feel** | Pose 只有眼位与朝向，没有晃动 / 下沉 / FOV 变化 / 抖动 |
| | **audio** | 无声 |
| | **fx** | 没有粒子，其余不受影响 |
| | **sim** | 世界静止：流体、火、下落方块、积雪、随机 tick、光照增量都不动 |
| | **weather** | `Clock` 的天气列恒为 clear 行，时间由 game 内置钟推进 |
| | **title** | 启动直接进游戏，没有标题 / 暂停屏，Esc 不暂停 |
| | **hud** | 没有 F3、消息、命令行；本模块的 BIND 行一并撤销，血条等页面元素失去数据 |

`input` 拆成两个：核心 `input`（虚拟键 → Intent，眼位 + 相机模式 → Pose）和可停用的 `feel`（晃动 / 下沉 / FOV / 下压 / 抖动，只输出 6 个差量 `Feel`）。`feel` 的差量晚一帧（≤ 16 ms）到 `input`，换来 `input` 不依赖它。

## 9. 对已有文档的改动（11-09 之后还有：参数记法 `$Fx`、pkv 的偏移 / 体积盒 / 命名空间、CAMS 只留三个，见 core.ts、s09 §8）

| 文档 | 改动 |
|---|---|
| README | G-8 加注：模块脚本无 `export`（生成器 / 渲染器 Worker 的动词导出不变）；新增 G-10；节索引加 s16 |
| s07 §2 | 模组 worker 同写法（K-11）：`export function onkwarg / key / onhit` 改为 `gm.on({ key(k){}, onHit(h){} })`；协议信封不变，`subs` 自动生成 |
| s09 | Ref 带 owner 模块与 `meta.doc`；新增路径根 `mod / tbl / act`；§6 布局加「模组」root |
| s14 §8 | 模块描述符字段改名（`uses → depends`，`defl → tables`），加 `core / off`；`STATES / ELEMS` 取消，`KEYS → ACTS`，`MOVES` 通用化；`input` 拆出 `feel` |
| `goal-panify/README.md` | 顶部加一行指向本节：Ref 的 owner、doc，「模组」root；`perf-collect.mjs` 并入 `gode/tools/dev.js`（§13.4） |
| s09 | **11-09 整篇重写**：最终需求（IDEA L82–92 + 独立窗口）、取消的旧需求、面板声明纯数据、停靠与任务栏、独立面板页协议；`✎` 经开发服务器 `PUT /__dev/write` 写 `defl/c_.json` |
| s12 | `gd mods`、`gd check mods`；自动重载按 `HOT` 表（§13.5）；`iso-*` 是 gd 的框景名，不是游戏相机 |
| `flow/` | 新增 `kernel.ts`、`feel.ts`；改 `core index host input title hud weather audio fx sim render graph` |

## 10. 检查（`tsc -p gode/flow`）

新增三条（共九条，见 `index.ts` 头注释），都用故意弄断的副本验证过会报错：

| # | 断言 |
|---|---|
| ⑦ | MOVES 行：动作名在 `ACTS` 里，否则是事件名；事件名列在 `kernel.sub`；Ref 路径是 `Gm` 里的 Ref 型成员 |
| ⑧ | BIND 行：路径头部是 Ref 型成员或 `c_` 参数 |
| ⑨ | 非核心模块必须写 `off`；核心模块不可停（`Mod` 的类型约束） |

另外：模块脚本在 `kernel.ts` 的 `declare global { const gg / gm / c_ }` 下可以直接 `checkJs`（上面 §1 的示例即是）。

## 11. 开工顺序（工程，未排期）

0. ~~**`gode/tools/dev.js`**（§13.4）~~ **已写，已接 `gd up`**（11-09；用户已把常驻的 `http-server` 换成它）。
1. **panify 1–3**：`c_` 命名空间 + `gg.vars`（Ref 加 `owner / meta.doc / options`，以 `rgl/vars.js` 为底）+ `gg.pane` + 四层优先级。M1-2 本来就要做。
2. **kernel**：登记处 + 视图（`Proxy`）+ `mod.tsv` 加载与拓扑序 + `gg.mods / gm.tbl / gg.dev` + 启停 / 热替换（§13）。把 `boot.js` 里已有的东西按「核心 / 默认模组」拆开，先拆 weather（s15 §4 第一步也在它）。
3. **虚拟键 + MOVES + 绑定器**：`ACTS`、`press`、MOVES 执行器、HTML 绑定器；用标题屏做第一个页面（`data-screen` + `data-act`）。
4. **「模组」root**：列表、启停、doc / 参数 / 表行编辑、实时计数、依赖图。
5. **`gd mods` 与 `gd check mods`**（§13.5）：登记处观察 ⊆ 规格；热替换不泄漏、语法错回滚、表就地 diff。

## 12. 默认值已写明、仍可改的小项（`TODO(decide)`）

| 项 | 默认 | 备选 |
|---|---|---|
| 停用被依赖的模块 | 连带停用并提示 | 拒绝停用 |
| 屏幕按钮的手势（⛏.long 等） | 放 `ACTS` 触屏列 | HTML 属性 `data-act-long` |
| `feel` 差量晚一帧 | 接受 | 让 input 在 feel 之后合成（则 feel 不可停） |

## 13. 热重载与开发服务器 [定 11-09，用户]

> 用户 11-09：tsv 的外提本质上是为了方便热重载，模块也应该能热替换（即便 F5 很快，JS 里重新 eval 成本也很低）。`:8765` 现在只是 `http-server -p 8765 -c 1`，有 `gd.js` 之后不该再是单纯的静态页。
> 好处不只是省一次刷新：整页重载会重生世界（出生区块 + 网格），热替换不会，Agent 改完模块就能在同一个世界里 `gd shot`。

### 13.1 哪类文件怎么处置（`kernel.ts` 的 `HOT` 表，第一个匹配的生效）

| 路径 | 动作 | 做什么 |
|---|---|---|
| `gode/defl/g/**` | `slicer` | 生成器脚本：`world.reset` + 池重启（`gode.restart`，世界重生；gd 的 genhash 检查走这条） |
| `gode/defl/ui.html`、`ui.css` | `ui` | 换 DOM 子树 / 样式表，重跑绑定器；世界、模块都不动 |
| `gode/defl/*.js` | `module` | 模块脚本热替换（§13.2） |
| `gode/defl/*.tsv`、`gode/defl/*.json` | `table` | 就地 diff（§13.3）。`mod.tsv` 也是表：增删行 = 加载 / 卸载模块，`depends` 变了 = 重排并重载，`on` 变了 = 启停 |
| `gode/{index.html,main,w,vendor,viz}`、`rgl/ vendor/ index.html` 与仓库根的 `*.js`（宿主 B） | `page` | 引擎核心，只能整页重载 |

路径与 `DevEvent.path` 一样相对仓库根（= `:8765` 的根），所以带 `gode/` 前缀；不在表里的（文档、`tools/`、`flow/`、`shots/`）不触发任何动作。

### 13.2 脚本热替换

1. 读新源码并编译；**语法错 → 什么都不动**，`err` 记下，面板标红。
2. 调旧实例的 `down()`，拿到交接对象（`where: 'worker'` 的模块要求可结构化克隆）。
3. 撤销旧视图名下的全部登记（订阅、监听器、计时器、面板 root、本层表行）。参数值（`$X`）与 Ref 本来就保留。
4. 新脚本在新视图里 eval；顶层跑完后调 `up(prev)`。
5. **新脚本抛错 → 回滚**：先撤销新视图已登记的东西，重新 eval 旧源码并 `up(prev)`（同一个交接对象），`ModInfo.err` 记下。模块始终留在最后一个能跑的版本。

整个过程同步完成（worker 模块是终止 + 重启），一个 tick 内没有事件会漏给「半个」模块。`mod_change` 的 `why = 'reload'` 通知 hud 与面板。

### 13.3 表就地 diff

- 解析新文件，与当前行比对：**改了的行写它的 Ref**（订阅者和面板自动收到，值与来源层不变）；**增删行发 `tbl_change { name, added, removed }`**。行 Ref 不会换掉，面板里展开着的行不会塌。
- 所以模块**读表必须每次经 `gm.tbl.<名字>`**，不在加载时拷贝一份；自己建了派生索引的模块（world 的方块表、render 的 `blk.tsv` emit 列）订阅 `tbl_change`。
- 面板里改表行与编辑器里改 tsv 走同一条路：面板改了经 `gg.dev.write` 写回文件，文件事件回来时比对发现已经是最新，不再重复通知。

### 13.4 开发服务器 `gode/tools/dev.js`（已写，`node --test gode/tools/test-dev.mjs` 10 项）

零依赖 Node（同 `gd.js` 的风格），同端口、同 `-c 1` 语义，取代 `http-server -p 8765 -c 1`。用法：停掉 http-server，`node gode/tools/dev.js`（`-h` 看全部参数；`-p` 换端口、`-q` 静默、`-v` 每个请求一行）。`gd up` 发现 `:8765`（`GD_BASE`）不通且指向本机时会自动拉起它，作为独立进程，`gd down` 不停它（s12 §2）。

| 端点 | 作用 |
|---|---|
| `GET /*` | 静态，`Cache-Control: max-age=1`。仍绑 `0.0.0.0`（手机测触屏要走局域网，局域网上的页面也能收到热更新） |
| `GET /__dev/events` | SSE。默认事件是一个 `DevEvent { path, kind, t }`；命名事件 `hello`（每次连上）与 `reset`（服务器重启或掉线太久，页面把已加载的文件全部重新检查一遍）。`id = <epoch>:<seq>`，断线重连时浏览器自动带 `Last-Event-ID`，服务器从 200 条环形缓冲里补发。每个目录一个 `fs.watch`（自己遍历，排除点开头的段、`node_modules`、`gode/shots/`、`tools/out/`、编辑器临时文件），同一路径 200 ms 内的多次写合并；靠「已知文件集」判断 kind，所以「写临时文件再 rename」的原子保存报 `change` 而不是 `add`；15 s 心跳 |
| `PUT /__dev/write?path=` | 面板 ✎ 写回。**只收本机**（源地址 127.0.0.1 且 `Host` 是 localhost，后者挡 DNS rebinding）；只写 `gode/defl/` 下的 `.tsv` `.json`（拒绝 `..`、点段与符号链接，`.json` 必须能解析，必须是 UTF-8，最大 4 MB）；原子写。改已有文件带 `If-Match`（读到时的 ETag = 大小 + mtime），新建带 `If-None-Match: *`；别处先改过 → 409 并给当前 ETag，页面先热更新再让用户重试；两个头都没有 → 428；`?force=1` 跳过 |
| `GET /__dev/ls?dir=` | 只列 `gode/defl/` 与其子目录（模组目录清单，目录名带 `/`） |
| `GET /__dev/info` | `{ name: 'gode-dev', … }`：gd 用它区分「这是 dev.js」还是「端口上是别的静态服务」 |
| `POST /t`、`GET /agg` | 性能投送与聚合：goal-panify §4 里计划但还没写的 `perf-collect.mjs` 并进来，一个进程。`/t` 收 JSON / JSONL 追加到 `gode/shots/perf-collect.jsonl`；`/agg` 按 `path` 聚合 `{ n, topic, from, to, fps, gpu, t }`，`fps` / `gpu` 取各记录的中位数。**假设**：记录里的 `fps` / `gpu` 就是 panify §4 说的「前后各 1 s 中位数之差」；timeit 写出来时若口径不同，在这里改 |

没起开发服务器时页面一切照常，只是 `gg.dev.up` 恒为假：没有热重载、没有写回。脚本源码不能经 `PUT` 写回（脚本在编辑器里改）。

### 13.5 gd 的配合

- **新增 `gd mods`**：`list`（id · 状态 · 启用 · 订阅数 · 最近 1 s 发出）、`on <id>` / `off <id>`、`reload <id>`、`graph`；都走 `gg.mods`。
- **新增 `gd check mods`**（进 `checks.tsv`）：① 登记处观察到的订阅、发出、用到的命名空间 ⊆ 规格（`flow/*.ts`）；② 每个模块 `reload` 三次后 `seen` 与监听器数不变（热替换不泄漏）；③ 故意给一个语法错的脚本 → 旧版还在跑；④ 改一行表 → 只有那个 Ref 通知，`tbl_change` 不发。
- **自动重载改按 `HOT` 表**（s12 §自动重载）：shot / check 前，`defl/` 的脚本、表、ui 变了不整页重载，只调 `gg.mods.sync()` 等热更新落定；`slicer` 类走 `gode.restart`；只有 `page` 类（`main/ rgl/ w/ vendor/ index.html`）才整页重载。`dev.up` 为假（没起服务器）时，gd 按 mtime 自己调 `gg.mods.reload` / `Table.reload`。`gd reload` 保留为强制整页。
- `gd.js` 自身改了仍要 `down / up`（不变）。
