# gode —— 体素游戏总体设计

> 来源：`doc/IDEA.md`（玩法 / 存档 / λ. 构想）、`doc/IDEA-sys.md`（外部依赖、面板体系、微体素、**L99 起的钩子模型**）、`doc/mat/*`（现行规则表）、`doc/xyzb/*`（体素与存档格式）、`goal-panify/`（面板化，**旧策划，面板需求以 IDEA L82–92 与 s09 §4 为准**）、`goal-remix/`（rgl 移植、生成器 remix）、`goal-renderapi.ts`（宿主契约）。
> 本目录 = 总设计文档（`sNN-*.md` 每节一个子系统）+ 接口声明（`flow/*.ts`）+ 已有代码（`main/ w/ pane/ tools/ defl/ vendor/ viz/`）。
> 约定：**[定]** = 用户已确认；**[议]** = 待问；**[承]** = 沿用已有文档的结论，括号给出处。
> **分工 [11-10]**：用户逐个子系统对照接口的理解；我据此重构 `flow/*.ts`（给 js 参考的声明）与 md 任务规划。**接口以 `flow/<模块>.ts` 为准，叙述与理由在对应的 sNN，进度在 §1 总表与 s10。**

## 0. 已定

| # | 决定 | 日期 |
|---|---|---|
| G-1 | 文档组织：本 README + `sNN-*.md` 每节一个子系统 | 11-08 |
| G-2 | `gode/` 先放文档，代码随后也进 `gode/` | 11-08 |
| G-3 | 渲染器 = **rgl**（基准，goodGL 管线）+ **新写的简版**。简版有两种：①无光影前向渲染（共用 rgl 的网格器和 Worker，给手机和低端机）②无头 / 地图渲染（M 键小地图的 Y 切片动画、存档截图、genview 俯视） | 11-08 |
| G-4 | Mob 与模型取自 goodPG（`src/shared/mobs.ts` 数据 + `mobTextures.ts` 程序贴图 + 姿态函数） | 11-08 |
| G-5 | 地形生成器有统一接口，goodGP / goodLiqPG 都可迁移进来，用 `?g=` 切换；生成器和 `createRenderer` 都要重构进 Worker，统一响应 `onkwarg` 初始化（IDEA §细则存档格式） | 11-08 |
| G-6 | M1 = 生成 + 渲染 Worker 跑通：两个生成器接口化并放进 Worker，`createRenderer` 接 `onkwarg`，`?g= / ?r=` 可切换，能走动，不含存档 | 11-08 |
| G-7 | 游戏本身是引擎，`$baseUrl/defl/` 只是默认模组（照 Luanti）；`$mode / $slicer` 可指向任意 Worker（s07） | 11-08 |
| G-8 | Worker 型模块（生成器、渲染器）共用一个约定：**`onkwarg` 只用来设模块全局变量**，导出函数名 = 动词名，不再有 `create()` / `createRenderer()` 工厂（s02 §2、s03 §1）。**[改 11-09]** 游戏模块与模组 worker 不再写 `export`：见 G-10、s16 | 11-08 |
| G-9 | 常被模组改的子系统（BIME、配方、伤害、模式…）一律用 json / tsv / 声明式 js 表格列举（照 index.html 的 `BLOCK_DEFS / MOB_TYPES / HURT`），不写 `X.def(…)` 注册调用；BIME 四要素按 IDEA 划分与复用（s05 §1–§2） | 11-08 |
| G-10 | **模块框架**（s16）：登记处 + 所有权；模块 = 脚本，`gg / gm / c_` 作为形参注入（受限视图），不写 `export / const / class`；元信息在 `defl/mod.tsv`；`depends` 决定加载顺序与可见的 gm 命名空间；`doc` 是运行时 Ref；页面是视图（`data-*` + CSS + `data-act`）；虚拟键表 `ACTS`；通用转移表 `MOVES`；面板「模组」root 管理；引擎核心不可停、默认模组可停；**热替换**（tsv 外提的本意，脚本可 eval 热换，私有状态 `down()` → `up(prev)` 交接）；开发服务器 `gode/tools/dev.js` 接管 :8765 | 11-09 |
| G-11 | **概览的组织**：①子系统清单（谁归哪层、哪条轴、哪个里程碑）**只有一个来源 = 各模块文件里的 `mod` 描述**（`flow/*.ts`，字段 `layer / axis / ms`），§1 总表由 `node gode/flow/graph.ts readme --write` 生成，不再手写；②按**三条升级轴 × 四层**看（§1）；③s10 的里程碑只是标签，任务按子系统看 | 11-10 |
| G-12 | **模组 API 总章 = `flow/hooks.ts`**（来源 IDEA-sys L99）[定 11-10，用户逐条对照]：钩子拿局部快照（`BlockEvent`），写操作全是命令（`Cmd`，`tick_end` 时应用，执行者见 `CMD_ROUTE`），触发分即时 / 调度 / 随机 / 组件批处理 / 生成 phase 五类，另有同步否决钩子 `canPlace / canBreak`；驼峰命名；联机只在权威端跑。细节见该文件头注释 | 11-10 |
| G-16 | **`Mod.catalog`**：取代 `core: boolean`——`'core'`（引擎核心，不可停）/ `'defl'`（默认模组，可停可换，必须写 `off`）；运行时 `ModInfo.catalog` 还可以是第三方模组包名。默认模组可声明 `wake`（停用期间这些事件一发出就重新启用，kernel K-18） | 11-10 |
| G-13 | **gg / gm / c_ 三个形参的分工 [定 11-10，用户]**：**gm** = 模组高频 API（世界读写、玩家、实体、动作、地图、表、特效、面板、订阅 `on`）；**gg** = 引擎装置与表现层（IO、音频、渲染器、相机、天气、标题 / HUD、模组管理，外加模块视图自带的登记工具 `ev / pane() / after / every / err`），只在 main，不进 worker 白名单；**c_** = 参数。具体：`p1` 下放全部玩家相关状态，`gm.p1` 默认指服主，`gm.p1.now(who, p => …)` 指定玩家（联机）；**玩家相关事件载荷都带 `ev.p1.who`**（`''` = 服主）；`gm.put('#zombie*10', at?)` 快速生成实体（取代 `ents.spawn`）；`gm.act` 收拢键鼠 / 触屏操作、`scr2xyz / xyz2scr`（无结果返回 null）与主视图的标记层开关；`gm.actOnMap` 是地图侧（原 `addMiniMap`，`scr2xz / xz2scr`、层开关）；**标记表世界里一份 `gm.marks`**（各视图只管层开关）；`gg.weather`；`gm.tbl / gm.fx / gm.pane`。`depends` 一个列表同时管两边 | 11-10 |
| G-14 | **格子口径 [定 11-10，用户]**：UI 统一叫 **grid**；玩家的 grid = **bag**（背包，`p1.bag`，虚拟键 `bag`）；bag 的前 N 格 = **bar**（热键栏，`p1.bar`）；储物箱柜 / 工具（箱子、熔炉、工作台）统一叫 **bins**（`gm.bins`）。原 `inv` 取消 | 11-10 |
| G-15 | **Where 拆细 [定 11-10，用户]**：`io` → **`dumper`**（存档唯一读写者，OPFS）+ **`net`**（联机传输）。联机 = **一个权威档，appendOnly Δ 日志 + 低频块 diff**，生成不进 net；新增 `flow/net.ts`（线上消息、事件、`gg.net`，只写协议、不排期）。bins 的页面口径：`gm.bins.cur` + `bin` / `bin_change` 事件 + `defl/bin.tsv`（种类、列数、格子 role、自绘 ui） | 11-10 |
| [承] | rgl + 宿主 B 是基准，宿主 A 退役，贴图用 labPBR，tint 走回调（`goal-renderapi.ts` D-8…D-11） | 11-05 |

## 1. 概览：三条升级轴 × 四层

gode 是对「doc 所示简版玩法 + rgl + 主屏幕 / 触屏 UI」的**功能模块与架构升级**。三条轴各自从哪里来、到哪里去：

| 轴 | 出发点 | gode 的目标形状 | 读哪里 |
|---|---|---|---|
| **玩法** | `doc/IDEA.md` + 宿主 B `index.html` 单文件玩法（`Game / World / Interaction / Mobs / Fluids …` 互相摸全局，s14 D-1…7） | 引擎核心（main）+ **一条写路径 Δ** + **钩子 / 组件 / 命令队列**（模组 API）+ `defl/` 默认模组表（`blk.tsv mob.json on.js comp.js …`）；存档 = 生成器 + Δ 重放 | s02 s04 s05 s06 s07 s14，`flow/host.ts hooks.ts sim.ts weather.ts` |
| **渲染与反馈** | rgl（goodGL 管线，基准）+ 宿主 B 的粒子 / 音效（`res_vam.js` 里混着贴图） | rgl + lite + map 三个渲染器模块（可换 `?r=`），只吃 Pose + Here + Clock + 区块事件；粒子、音效是引擎的事后事件订阅者（lite / gl 都能用） | s03 s11 s15，`flow/render.ts fx.ts audio.ts` |
| **UI** | 宿主 B 的 `Input / Touch / HelpKeys / Title / HUD` 与 tweakpane 面板 | 虚拟键 `ACTS` → 意图 `Intent`（触屏不再合成键盘事件）；页面 = Ref 的视图（`data-*` + `data-act`）；面板 = `gg.pane` 纯数据声明 + 独立窗口；命令行 = 打字版的模组动词 | s09 s16，`flow/input.ts feel.ts title.ts hud.ts pane.ts kernel.ts` |

四层（从下往上依赖）：**框架**（模块怎么写、登记、停用、热替换）→ **引擎核心**（不可停：世界、玩家、交互、实体、钩子、存档、输入）→ **默认模组**（可停可换，必须写 `off` = 停用后消费者看到什么：sim、天气、feel、fx、audio、title、hud）→ **渲染器**（核心，但实现可换）。

下面两张表**由 `node gode/flow/graph.ts readme --write` 生成**（别手改）。里程碑一栏：`M1 ✅` = 做完；`M3-7` = s10 的第 3 阶段第 7 项；`未排期` = s10 里没有（逐个子系统对照时定）。事件矩阵看 `node gode/flow/graph.ts`，流程图看 `… mermaid`。

<!-- gen:mods -->
| 层 ＼ 轴 | 玩法 | 渲染与反馈 | UI（主屏幕 · 触屏 · 面板 · 命令） |
|---|---|---|---|
| 框架 | — | — | kernel（未排期）<br>pane（M1-2） |
| 引擎核心（不可停） | game（M1 ✅）<br>world（M1 ✅）<br>p1（M1 ✅）<br>interact（M3-7）<br>ents（M3-6）<br>save（M2）<br>slicer（M1 ✅）<br>hooks（M3-7）<br>net（未排期） | — | input（M1-9） |
| 默认模组（可停可换） | sim（M1-8）<br>weather（M1-9） | audio（未排期）<br>fx（未排期） | feel（M1-9）<br>title（未排期）<br>hud（M1-9） |
| 渲染器（可换 `?r=`） | — | render（M1-6） | — |

| 模块 | 目录 | 层 | 轴 | 位置 | 里程碑 | 说明 |
|---|---|---|---|---|---|---|
| game | core | core | play | main | M1 ✅ | main/boot.js；s07 §3 模式与 cheat |
| world | core | core | play | main | M1 ✅ | main/world.js；s02 §3、s14 §4 |
| p1 | core | core | play | main | M1 ✅ | main/phys.js；生存状态 M3；落雷 3 格内按 hurt.js 的 lightning 行扣血（MC 5） |
| interact | core | core | play | main | M3-7 | M3-7；宿主 B Interaction :1933、Inventory :2297 |
| ents | core | core | play | main | M3-6 | M3；s05；宿主 B mobsim.js Mobs、Entities :2775 |
| save | core | core | play | dumper | M2 | M2；s06；宿主 B Save :3021 |
| slicer | core | core | play | slicer | M1 ✅ | s01 / s02：w/slicer.js |
| kernel | core | kernel | ui | main | 未排期 | 框架：加载 mod.tsv 里的脚本（受限 gg / gm / c_ 视图）、登记处、热替换、通用 MOVES、HTML 绑定（data-*）、管理 API gg.mods / gm.tbl / gg.dev |
| pane | core | kernel | ui | main | M1-2 | c_ / Ref 的面板：声明是纯数据；游戏窗口里的 root（左上 / 右上 / 暂停菜单）+ 独立面板页（BroadcastChannel）；两个窗口各一条任务栏 |
| render | core | render | look | render | M1-6 | s03、s15；rgl / lite。只吃 Pose + Here + Clock + 区块事件，其余经 gm 取 |
| hooks | core | core | play | main | M3-7 | defl/on.js 钩子与 comp.js 组件的调度者：delta / blk_* → BlockEvent（局部快照）；写操作入队，tick 末尾应用；组件每 tick 批量跑 |
| net | core | core | play | net | 未排期 | s06 §7、s11 §2：一个权威档，appendOnly Δ 日志 + 低频块 diff；单机 = 本地回环；只写协议，不排期 |
| input | core | core | ui | main | M1-9 | 虚拟键（ACTS）→ Intent / key；Body + feel + 相机模式 → Pose |
| feel | defl | defl | ui | main | M1-9 | 相机手感：Body + 事件 → 6 个差量（晃动 / 落地下沉 / FOV / 受伤下压 / 抖动） |
| audio | defl | defl | look | main | 未排期 | WebAudio；首个按键 / 触摸解锁（宿主 B audioInit） |
| fx | defl | defl | look | main | 未排期 | 触发与放置在 main；模拟与绘制在渲染器（RenderFx） |
| sim | defl | defl | play | main | M1-8 | 20 Hz；光照增量当帧完成，其余按调度表；接口不依赖 main（以后可进 sim worker） |
| weather | defl | defl | play | main | M1-9 | 时钟 + 天气；全局天气与参数行都是 (t, seed) 的纯函数 |
| title | defl | defl | ui | main | 未排期 | 标题屏 / 暂停屏 / 加载条；画面（screen）的唯一持有者。显示全在 ui.html / ui.css |
| hud | defl | defl | ui | main | M1-9 | F3 文字、消息队列、命令行（命令 = 打字版的模组动词）、模组 HUD 元素；画面全在 ui.html / ui.css |

**未排期**（s10 里没有）：kernel net audio fx title
<!-- /gen:mods -->

### 1.1 flow 里还没有的（概览缺口）

| 缺口 | 出处 | 说明 |
|---|---|---|
| BBat / λ. / clawd / 钻石箱 | s08，M4 | 没有 `flow/*.ts`。依赖钩子模型与 `ents`，等它们对照完再写 |
| 微体素物件 / 生物编辑器（调色板 + 材质、图层、`.vox`、Fork this、damageStates） | IDEA-sys L72–97 | 与 BBat 同一族（多图层可旋转实体），**数据类型必须统一**（放置态 / 物品态 / 自由态不得各一种）。建议并进 s08 一节，再决定要不要独立模块 |
| pgviz / Agent 工具 / 检查 | s12 s13，M0 | 是工具，不是游戏模块，不进 Mod 表；`gd check` 的检查清单挂 `tools/checks.tsv` |
| 资源 tsv 面板体系化（引用计数式反向索引、多选交集字段、只读矩阵区） | IDEA-sys L31–41 | 属 `pane` + `kernel` 的表视图，先在 pane 对照时提 |

### 1.2 概览阶段发现的待决（不是 bug，是设计内的矛盾）

1. **核心依赖了可停模块**：`ents`（核心）`depends: fx`（默认模组）。kernel ④ 规定「停用时依赖它的模块一并停用」而「核心不可停」，两条撞车。hooks 的做法 [11-10]：落在可停模组的命令发成 `hook_*` 事件，由 owner 订阅；owner 若声明 `Mod.wake`（weather：time / weather 命令）停用时被唤醒，popup 归不可停的 kernel。**ents → fx 仍待定**：fx 已订阅 `mob_die / explode`，ents 的 `depends: fx` 可能多余，等 ents 对照时删。
2. ~~随机 tick 有两套写法~~ [定 11-10]：只剩一条路——行为是 `on.js` 的 `onRandom`，抽样参数是 `blk.tsv` 的列（`schedRandom / minLight / grow / top`，`sim.ts RANDOM`），原 ABM 表并入 `ON_DEFAULT`。
3. ~~on.js 的钩子签名~~ [定 11-10]：单参数 `BlockEvent`、驼峰命名（`onTap / onDie / onRandom`）；新增同步否决钩子 `canPlace / canBreak`（`:*` 行对所有方块生效）。

## 2. 节索引

| 节 | 文件 | 内容 | 状态 |
|---|---|---|---|
| s01 | `s01-arch.md` | 线程 / Worker 拓扑，`onkwarg` 与消息协议 | 初稿，已定 |
| s02 | `s02-gen.md` | 地形生成器接口（goodGP / goodLiqPG / gen.js）；生成 phase 钩子见 `flow/hooks.ts` | 初稿，已定 |
| s03 | `s03-render.md` | rgl / lite / map 模块约定、minimap API 与 marker 事件、原生实体 pass | 初稿，已定 |
| s04 | `s04-blocks.md` | id 1–14、meta、linkBlk 状态、光照、方块能力 | 初稿，有待议 |
| s05 | `s05-mob-ent.md` | goodPG mob / 模型移植，Ent / Mob 事件模型（on.js 签名以 `flow/hooks.ts` 为准） | 初稿，有待议 |
| s06 | `s06-save.md` | webp+zip、Pusc.json、XZP zstd、OPFS、文本体素、pile | 初稿，有待议 |
| s07 | `s07-play.md` | 引擎 / 默认模组划分、模组 worker 协议、cheat、iframe UI | 初稿，已定 |
| s08 | `s08-claw.md` | λ. 栏目答 / clawd / BBat / 钻石箱，零点同步 | 初稿，有待议 |
| s09 | `s09-panify.md` | 面板最终需求（IDEA L82–92 + 独立窗口）、取消的旧需求、`c_` / `gg.pane` 纯数据声明、停靠与任务栏、独立面板页协议、常调参数、F3 调试、F4 相机；规格在 `flow/pane.ts` | 初稿，已定（P-0…10，11-09 对齐） |
| s10 | `s10-milestones.md` | M1 生成渲染 → M2 存档 → M3 模组生物 → M4 λ.；§5 待排期 | 初稿 |
| s11 | `s11-borrow.md` | 借鉴 goodPG：顶点格式、layerProps、存档健壮性、Durable Object 联机协议 | 初稿，已定 |
| s12 | `s12-agent-tools.md` | Agent 工具：`gd` 守护进程、实时截图目录、`gm.test` 钩子、机位导入、检查清单 | 初稿，已定 |
| s13 | `s13-pgviz.md` | pgviz 地形查看 / 调参（M0）：直接用生成器 Worker，参考 seed map 与 mcweb 的 UI | 初稿 |
| s14 | `s14-dataflow.md` | 四类状态、宿主 B 数据流现状与耦合点、宿主 B → flow 模块对照、一条写路径 / Δ 总线、状态注册表、存档与数据流检查；§8 = `gode/flow/*.ts` 声明式数据流 | 初稿，已定（Q-1…5、Q-roll/ortho/cmd/wx 11-09 拍板） |
| s15 | `s15-look.md` | 画面反馈：云 → 全景、草阴影、水面反射、手持光、掉落物厚度、破坏粒子、洞穴雾、雷暴 / 闪电 / 大风 / 积雪 / 雨雪；渲染参数拆成 `c_` 主题（`flow/render.ts`） | 初稿，已定；雷暴过曝与默认全景已修 |
| s16 | `s16-module.md` | 模块框架：登记处与所有权、脚本模块写法、`mod.tsv`、虚拟键 `ACTS`、通用 `MOVES`、页面绑定、「模组」管理面板、核心 / 默认模组划分、热重载与开发服务器；规格在 `flow/kernel.ts` | 初稿，已定（K-1…17，11-09 表单五轮） |

## 3. 逐个子系统对照的顺序 [议]

每个子系统对照的材料 = `flow/<模块>.ts` + 对应 sNN；你确认的是**连接点**（`Out` 事件载荷、`Api` 命名空间、`tables`、`c_`、`save` 键）而不是实现。建议先近世界、后近人，因为钩子模型会牵动前面几个：

| 序 | 子系统 | 材料 | 要你确认的接口点（我已知的疑问） |
|---|---|---|---|
| 1 | hooks（模组 API 总章） | `flow/hooks.ts`、IDEA-sys L99 | **已全部定**（11-10）：tick_end、canPlace / canBreak、驼峰、命令路由与 wake、随机 tick 并入 onRandom、生成钩子 `where = 'slicer'`、联机只在权威端跑 |
| 2 | world + slicer（Δ、生成 phase） | `host.ts`、s02、s14 §4 | phase 钩子登记方式（hooks TODO 5）；`Delta.st` |
| 3 | sim | `sim.ts`、s04 §4 | `RANDOM` 列与 `ON_DEFAULT`（原 ABM）；`:snow` 融化现在只在按列抽到时判定 |
| 4 | ents + interact | `host.ts`、s05 | on.js 签名（§1.2-3）；组件 `comp` 列；§1.2-1 的依赖矛盾 |
| 5 | p1 + input + feel | `host.ts input.ts feel.ts` | Intent / ACTS / 触屏手势列 |
| 6 | render + fx + audio + weather | `render.ts fx.ts audio.ts weather.ts`、s03 s15 | Pose / Here / Clock 的信息量；fx / audio 为何仍「未排期」 |
| 7 | kernel + pane + title + hud | `kernel.ts pane.ts title.ts hud.ts`、s09 s16 | MOVES / BIND；kernel「未排期」 |
| 8 | save | `host.ts`、s06 | 状态注册表键；pile |
| 9 | BBat / 微体素 / λ. | s08、IDEA-sys L72–97 | 先决定是否新增 flow 模块（§1.1） |

## 4. 现状速查（读码，11-08）

| 来源 | 区块 / 高度 | 方块编码 | 索引 | Worker | 备注 |
|---|---|---|---|---|---|
| 宿主 B `gen.js` | 16², H 128，海 62 | u8 id + u8 meta | `x<<11\|z<<7\|y`（XZY） | 无，主线程 | 10 群系，`pendingFeatures` 跨块 |
| goodGP `js/world.js` | 16², H 256，海 62 | u8 id + meta + light（sky<<4\|blk） | `(y<<8)\|(z<<4)\|x` | 无 | `World.generate(cx,cz)` :153；12 群系；树靠重算 3×3 邻块（不外写） |
| goodLiqPG `src/world` | 16², y −64…320（H 384），海 63 | u16 = 12 位 type + 4 位 meta | `(yi*16+z)*16+x` | 有：池 2–8 个，SAB 或 transfer | 协议 `init/register/gen/mesh/biomeAt/spawn`；`generateChunk` 返回 `{biomes, outside}`；流体在主线程 |
| goodPG `src` | y −64…320 | u16 | `((y−MIN)<<8)\|(z<<4)\|x` | 有：`worldWorker.ts` `init/gen/mesh/spawn/error`；单机服务器也在 Worker | mob 数据纯表，AI 在服务端 20 Hz |
| rgl | 读宿主 `ChunkSource`，`(lx*16+lz)*H+y` | 经 `idLUT` 转 goodGL id | 18³ padded | `vendor/gl/pool.js`：`init{seed} / gen / mesh` | `createRenderer(ctx)` rgl/index.js:48 |
| IDEA 存档 | 最高 256 | 现场 id `0x8000\|自增` | YZX + RLE + 调色板 | Gen ×N → IO ×1 transfer | `onkwarg` 只在 IDEA:127 出现，未实现 |
