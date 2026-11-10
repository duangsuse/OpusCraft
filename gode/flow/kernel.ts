/**
 * gode/flow/kernel.ts —— 框架：模块怎么写、怎么登记、怎么停用、怎么管理 [定 11-09，用户；s16]
 *
 * 缘起：用户 11-09：「没有管理工具的模块化无效」；模块化与交互能力绑在一起。模块不是 TS 里的一份描述符，
 *   而是运行时登记处里能列出、能编辑、能撤销的东西。项目对复用和声明式要求高（Pass DSL + pane vars 就是这种工具）：
 *   模块写法不引入 export / const / class 这类 JS 噪音，靠 gg / gm 命名空间，位置决定种类。
 *
 * 一页读懂：
 *   ① 模块 = 一段脚本（defl/fx.js）。gg / gm / c_ 是形参，每个模块一份受限视图：
 *        c_.Fx = { gravity: [0.8, 0, 2, '重力'] }              赋值 = 登记参数主题（panify §1）；[默认, 最小, 最大, 标签] 一行
 *        gm.on({ blk_break(e) { … }, p1_land(e) { … } })      对象字面量批量订阅，同宿主 B gm.on / gg.ev，键 = 事件名
 *        gm.tbl.bursts                                         读 defl 表（行是 Ref，面板里可改）
 *      所有权是视图带来的：脚本里的登记自动记在这个模块名下，不需要 ctx。脚本顶层 = 启用时执行；要清理的写 gm.on({ down() { … } })。
 *   ② 元信息在 defl/mod.tsv 一张表：id、file、where、depends、on。脚本里零声明。
 *      depends = 加载顺序（拓扑，循环报错）+ 视图只暴露这些 gm 命名空间（Luanti mod.conf 的 depends）；越权访问抛错并记录（c_Mods.strict）。
 *   ③ 登记处记录一切：订阅、发出（实时计数）、实际用到的命名空间、c_ 主题、读过的表、虚拟键行、存档键。emit / sub / c_ 不用手写第二遍。
 *      flow/*.ts 是设计期规格（Ev / Gm / 行类型，tsc 检查照跑）；登记处观察到的必须 ⊆ 规格（gd check mods）。
 *      doc 不是元数据：它是 Ref mod.<id>.doc（任何路径都可以有 doc），初值来自 defl/doc.tsv，面板里改、✎ 写回。
 *   ④ 停用 = 撤销该模块名下的全部登记 + 调 down()。引擎核心（Mod.catalog = 'core'）不可停；默认模组可停，可被同 id 的模组替换（s07 §4 叠加）。
 *      停用时依赖它的模块一并停用并提示（mod_change why = 'depends'）。每个可停用模块的 Mod.off 写明「停了之后消费者看到什么」。
 *      唤醒 [定 11-10，用户]：默认模组可声明 Mod.wake（事件名列表，必须在它的 sub 里）。它停用期间这些事件一发出，kernel 先重新启用它（mod_change why = 'wake'）
 *      再把事件交给它。只用于「明确的指令」（模组命令 {time} / {weather}）；被动消费（粒子、音效）不唤醒，消费者看 off。
 *   ⑤' 热替换是设计目标 [定 11-09，用户]：tsv / json 外提的本意就是方便热重载，模块脚本也应能热替换（重新 eval 成本很低，F5 再快也要重生世界）。
 *      脚本热替换 = 新源码先编译（语法错 → 保留旧版）→ 旧 down() 的返回值作交接对象 → 撤销旧视图的全部登记 → 新脚本在新视图里 eval → up(prev)；
 *      新脚本抛错就回滚到上一个能跑的版本（重新 eval 旧源码，同样 up(prev)），err 记下、面板标红。全程同步一个 tick，不丢事件。
 *      表热更新 = 就地 diff：改了的行写 Ref（订阅者与面板自动收到），增删行发 tbl_change；所以模块读表必须经 gm.tbl.<名字> 取用，不在加载时缓存副本。
 *      文件变化由开发服务器（gode/tools/dev.js，取代 http-server -p 8765 -c 1）经 SSE 推给页面（DevEvent）；HOT 表决定每类文件怎么处置。没有开发服务器时静默回退。
 *   ⑤ 页面是视图：游戏暴露「值」（Ref → html[data-*] / CSS 变量 / data-bind）与「动作」（data-act = 虚拟键）。没有逐控件推属性的表（STATES / ELEMS 已取消）。
 *   ⑥ 管理工具 = 面板「模组」root（gg.pane）+ gg.mods：列表、启停、改 doc / 参数 / 表行、看订阅与实时发出计数、依赖图。
 *
 * 执行者：kernel（core，main）。它加载脚本、记账、执行 MOVES、跑 HTML 绑定器、提供 gg.mods / gm.tbl。
 * 私有状态交接 [定 11-09，用户：HMR dispose / accept 风格]：gm.on({ up(prev) {…}, down() { return {…} } })。up / down 是模块私有的伪事件（不进 Ev）：
 *   up(prev) 在脚本顶层执行完之后调用，prev = 上一个实例 down() 的返回值（热替换时；首次加载与停用后再启用都是 undefined）；
 *   down() 在热替换 / 停用时调用，返回交接对象（where: 'worker' 的模块要求可结构化克隆）。要跨重载的东西：参数值（$X）与 Ref 本来就保留，私有变量靠这一对钩子交接。
 * TODO(decide) 默认值已写明：
 *   · 停用被依赖的模块：默认连带停用并提示。备选拒绝停用。
 */
import type { num, Ref, Action } from './core.ts'
import type { Mod, Gm, Gg, EvName, Where } from './index.ts'
import type { PaneRow, RootOpts } from './pane.ts'

export interface Out {
  mod_change: { id: string; on: boolean; why: 'load' | 'user' | 'depends' | 'error' | 'reload' | 'wake' }   // 启用 / 停用 / 热替换了一个模块（hud 提示、面板刷新）
  tbl_change: { name: string; added: readonly string[]; removed: readonly string[] }            // 表热更新时有行增删（改行本身走 Ref，不发这个）。自己建了派生索引的模块订阅它
}

// ── 脚本拿到的三个形参（每模块一份视图；登记自动记在该模块名下，停用时一起撤销）
/** gg 里每个模块都有的登记工具（不是命名空间，不进 depends）；命名空间部分见 index.ts 的 Gg */
export interface GgTools {
  ev(target: EventTarget, h: Record<string, (e: Event) => void>): EventTarget            // 宿主 B gg.ev；停用时摘掉
  pane(root: string, rows: readonly PaneRow[], o?: RootOpts): void                       // 面板声明，纯数据（pane.ts）；停用时移除该 root
  after(ms: num, f: () => void): () => void                                              // 计时器也要走视图，停用时才清得掉（脚本里别直接用 setTimeout）
  every(ms: num, f: () => void): () => void
  err(msg: string): void
}
export type C_ = Record<string, Record<string, unknown>>                                 // c_.Fx = {…}：赋值即登记
/** defl/*.js 的脚本环境。tsc checkJs 时由下面的 declare global 给类型，脚本开头不用写任何东西 */
export interface Globals { gg: Gg; gm: Gm; c_: C_ }
declare global { const gg: Gg; const gm: Gm; const c_: C_ }

// ── defl/mod.tsv：模块清单。一行一个；模组同 id 的行覆盖默认行。catalog 'core' 的模块不在表里（引擎启动时直接加载）
export type ModRow = readonly [id: string, file: string, where: 'main' | 'worker' | 'slicer', depends: string, on: 0 | 1]   // slicer：脚本在每个 slicer worker 里跑，gm 是只含 on({ genChunk }) 的受限代理（hooks.ts ⑤）

// ── 运行时视图：管理面板与 gg.mods 看到的东西。Ref 的路径是 mod.<id>.on / mod.<id>.doc，改它们与改参数同一条路由
export interface ModInfo {
  id: string; file: string; where: Where
  catalog: 'core' | 'defl' | (string & {})    // 出自哪个目录：引擎核心 / 默认模组 / 第三方模组包名（Mod.catalog 的运行时形式）
  on: Ref<boolean>                            // 启用开关；catalog 为 'core' 的恒 true，写 false 抛错
  doc: Ref<string>                            // 说明（运行时可编辑；初值 defl/doc.tsv 的 mod.<id> 行）
  off: string                                 // 停用后消费者看到什么（来自 Mod.off）
  depends: readonly string[]                  // mod.tsv 的声明
  seen: {                                     // 观察到的，不手写
    sub: readonly EvName[]
    emit: Readonly<Partial<Record<EvName, num>>>   // 名字 → 最近 c_Mods.counterMs 内的次数（面板实时计数）
    used: readonly string[]                   // 实际用到的 gm 命名空间（⊆ depends 才合规）
    c_: readonly string[]; tables: readonly string[]; acts: readonly string[]; save: readonly string[]
  }
  err: string | null                          // 脚本加载 / down 抛的错。首次加载失败 = 该模块被停用；热替换失败 = 留在上一版（不拖垮别的）
}
/** defl 表的运行时视图（s07 §4 叠加后的结果）：行是 Ref 子树，面板 pickLib 可搜索编辑，✎ 写回对应层 */
export interface Table {
  readonly name: string; readonly rows: ReadonlyMap<string, Readonly<Record<string, Ref<unknown>>>>; readonly layers: readonly string[]
  reload(): Promise<void>                       // 重读各层文件并就地 diff（开发服务器推送时 kernel 自己调；没有服务器时 gd 按 mtime 调）
}

/** gm 里只有表：模组每次读表都经 gm.tbl.<名字>（热更新是就地 diff，不缓存） */
export interface Api {
  tbl: Readonly<Record<string, Table>>                         // gm.tbl.bursts：按文件名（不含扩展名）取。读表必须每次经它取（热更新是就地 diff，缓存的副本会过期）
}
/** gg：模组管理与开发服务器 */
export interface GgApi {
  popup: { open(o: { url: string; w: num; h: num }): void; close(): void }   // 弹框 iframe（s07 §5：独占输入、sandbox allow-scripts）；hook_popup 事件走它。kernel 是核心，所以弹框不可停
  mods: {
    list(): readonly ModInfo[]
    get(id: string): ModInfo
    on(id: string, on: boolean): Promise<readonly string[]>   // 启停；返回连带停用的 id；catalog 'core' 的抛错
    reload(id: string): Promise<{ ok: boolean; err?: string }>  // 热替换（⑤'）：ok = 新版在跑；false = 回滚到上一版。参数值（gg_v / 存档层）保留
    sync(): Promise<void>                                      // 等已收到的文件事件全部处理完（gd 在 shot / check 前调用，保证截到的是改完之后的样子）
    graph(): readonly { id: string; sub: readonly EvName[]; emit: readonly EvName[]; depends: readonly string[] }[]
  }
  dev: {                                                       // 开发服务器的页面端（没有服务器时 up 恒为 false，write 抛错、ls 返回 []）
    up: Ref<boolean>                                           // SSE 已连上（html[data-dev]：页面可以显示「热重载已连接」）
    write(path: string, text: string): Promise<void>           // PUT /__dev/write：面板 ✎ 写回 doc.tsv / c_.json / 表行（path = 'gode/defl/doc.tsv'）。带 If-Match，别人（编辑器）先改过就 409，页面先热更新再重试
    ls(dir: string): Promise<readonly string[]>                // GET /__dev/ls：模组目录清单（dir = 'gode/defl'；目录名带 /）
  }
}

// ── 开发服务器协议 [定 11-09，用户：:8765 不再单纯是静态页]。gode/tools/dev.js（零依赖 Node，同端口，取代 http-server -p 8765 -c 1；gd up 发现端口不通就拉起它）
//    已写（gode/tools/dev.js，测试 gode/tools/test-dev.mjs）。路径一律相对仓库根（= :8765 的根），所以 gode 的文件是 'gode/defl/fx.js'；页面在 /gode/ 下，kernel 自己补前缀
//    GET /*                静态，Cache-Control: max-age=1（同 -c 1）；仍绑 0.0.0.0（手机测触屏要走局域网）；带点的路径段一律 404
//    GET /__dev/events     SSE：默认事件 = 一个 DevEvent；另有 hello（每次连上）与 reset（服务器重启 / 掉线太久：页面把已加载的文件全部重新检查一遍）；
//                          id = <epoch>:<seq>，断线重连带 Last-Event-ID 补发；每个目录一个 fs.watch，去抖 200 ms；15 s 心跳
//    PUT /__dev/write      只收本机（127.0.0.1 且 Host 是 localhost）；只写 gode/defl/ 下的 .tsv .json（拒绝 .. 、点段与符号链接，.json 要能解析）；
//                          If-Match = 读到时的 ETag（改已有文件）/ If-None-Match: *（新建），别处先改过 → 409，两个头都没有 → 428
//    GET /__dev/ls?dir=    只列 gode/defl/ 与其子目录
//    GET /__dev/info       { name: 'gode-dev', … }：gd 区分「这是 dev.js」还是「端口上是别的静态服务」
//    POST /t  GET /agg     性能投送与聚合（goal-panify §4 的 perf-collect 并进来，一个进程）
export interface DevEvent { path: string; kind: 'change' | 'add' | 'unlink'; t: num }   // path 相对仓库根

// ── HOT：文件 → 热更新动作（没有 hot.tsv，这是引擎常量）。路径同 DevEvent（相对仓库根），从上到下第一个匹配；不在表里的（文档、tools/、flow/、shots/）不触发任何动作
//    module：mod.tsv 里的脚本 → 热替换（⑤'）；table：就地 diff；ui：换 ui.html 的 DOM 子树 / ui.css 的样式表并重跑绑定器；
//    slicer：生成器脚本 → world.reset + 池重启（gode.restart，世界重生；gd 的 genhash 检查走这条）；page：引擎核心 js → 只能整页重载
export type HotAction = 'module' | 'table' | 'ui' | 'slicer' | 'page'
export const HOT = [
  ['gode/defl/g/**',    'slicer'],
  ['gode/defl/ui.html', 'ui'], ['gode/defl/ui.css', 'ui'],
  ['gode/defl/*.js',    'module'],
  ['gode/defl/*.tsv',   'table'], ['gode/defl/*.json', 'table'],     // mod.tsv 也是表：行增删 = 加载 / 卸载模块，depends 变了 = 重排并重载，on 变了 = 启停
  ['gode/index.html', 'page'], ['gode/main/**', 'page'], ['gode/w/**', 'page'], ['gode/vendor/**', 'page'], ['gode/viz/**', 'page'],
  ['rgl/**', 'page'], ['vendor/**', 'page'], ['index.html', 'page'], ['*.js', 'page'],                       // 后两项 = 宿主 B（仓库根的 gls.js gen.js mobsim.js res_vam.js bwebp.js …）
] as const satisfies readonly (readonly [glob: string, act: HotAction])[]

// ── MOVES：通用转移表（defl/moves.tsv；各模块文件里写自己 Ref 的那几行）[定 11-09，用户：Ref × 动作 → Ref]
//    [Ref 路径, 从, 动作, 到]。kernel 订阅 key（虚拟键边沿）与表里出现的事件名：Ref 当前值 = 从（或 '*'）且动作匹配 → ref(到)。
//    改写的是 Ref，副作用由 Ref 的 owner 响应（title 发 screen 事件、input 换相机）。同一 (Ref, 动作) 多行：从上到下第一个匹配。
//    到：字面值，或 '<next>' / '<prev>' = 按 Ref 的 meta.options 顺序循环（布尔 = 翻转）。
//    动作名必须在 ACTS 里，否则是事件名（Ev）；事件名要列进 kernel.sub（index.ts 检查）。
export type MoveRow = readonly [ref: string, from: string, on: Action, to: string]

// ── BIND：HTML 绑定表（defl/bind.tsv；各模块文件里写自己的行）。页面（defl/ui.html + ui.css，模组可整体替换）自己决定每个状态下怎么显示。
//    绑定器约 40 行，订阅 Ref：
//      BIND 行   attr → <html data-NAME="值">（布尔：真 = 属性存在、值 "1"；假 / null / '' = 移除）；var → <html style="--NAME: 数值">
//      元素属性  data-bind="路径"            文本（meter / progress / input 写 .value）
//               <template data-each="路径">   数组 Ref：每项克隆一份，子元素 data-bind=".字段" 取该项字段
//               data-act="动作"              点击 = input.press；按住型动作按下 / 松开各发一次
//               data-btn="⛏"                屏幕按钮：点 / 长按 / 双击的手势查 ACTS 的触屏列（⛏.long 等）
//      路径 = Ref 路径，后面可接 .字段 钻进对象值：'p1.stat.hp'、'weather.clock.hour'、'world.here.fluid'
//    TODO(decide) 屏幕按钮的手势（⛏.long 之类）默认放 ACTS 触屏列（键位设置界面一处看全）；备选写成 HTML 属性 data-act-long。
export type BindRow = readonly [path: string, as: 'attr' | 'var', name: string]
/** kernel 自己的绑定行：画面、相机、模式三个枚举。HUD 的行在 hud.ts */
export const BIND = [
  ['title.screen', 'attr', 'screen'],     // CSS：html[data-screen=game] #menu { display: none } …
  ['cam.mode',     'attr', 'cam'],
  ['game.mode',    'attr', 'mode'],       // 创造模式不画血条：html[data-mode=creative] #bars { display: none }
  ['dev.up',       'attr', 'dev'],        // 热重载已连接
  ['pane.up',      'attr', 'panel'],      // 独立面板页已连接（「↗ 独立窗口」按钮据此隐藏）
] as const satisfies readonly BindRow[]

export const c_Mods = {
  strict: true,         // 越权访问 gm 命名空间（不在 depends 里）：true = 抛错并记录；false = 只记录
  counterMs: 1000,      // 面板上「发出次数」的统计窗口
  reloadDebounce: 200,  // 热重载：文件变化后等多久再重读（编辑器保存常是多次写）
  dev: true,            // 连开发服务器（SSE）；没有就静默回退，不报错
}

export const mod = {
  id: 'kernel', where: 'main', catalog: 'core', layer: 'kernel', axis: 'ui', ms: '未排期',
  doc: '框架：加载 mod.tsv 里的脚本（受限 gg / gm / c_ 视图）、登记处、热替换、通用 MOVES、HTML 绑定（data-*）、管理 API gg.mods / gm.tbl / gg.dev',
  emit: { mod_change: 'edge', tbl_change: 'edge' },
  sub: ['key', 'boot', 'game_ready', 'hook_popup'],              // MOVES 用到的：key = 全部虚拟键；boot / game_ready 是表里出现的事件名（index.ts 检查两者一致）；hook_popup：模组的 {popup} 命令，弹框 iframe 归 kernel（核心，不可停，s07 §5）
  depends: ['input', 'pane'],                      // input.press：data-act 点击
  tables: ['mod.tsv', 'moves.tsv', 'bind.tsv', 'doc.tsv'], c_: ['$Mods'],
  save: ['mods'],                                  // 各模组启用开关的覆盖：按存档记（同一个世界总用同一组模组，Luanti world.mt 的 load_mod_*）
} as const satisfies Mod
