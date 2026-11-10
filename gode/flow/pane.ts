/**
 * gode/flow/pane.ts —— 面板：声明是纯数据，两个窗口是同一棵 Ref 树的视图 [定 11-09，用户：最终需求对齐，s09]
 *
 *   模块脚本 gg.pane(root, rows, opts)（纯数据）──▶ 登记处 ──┬─▶ 游戏窗口里的 Tweakpane（左上 / 右上 / 暂停菜单，各自的任务栏）
 *                                                            └─▶ BroadcastChannel('gode-pane') ──▶ 独立面板页 gode/panel.html（Tweakpane + 任务栏）
 *   面板里的改动 ──▶ Ref.set（同一条写路由，s16 §3）；按钮 ──▶ 虚拟键 / 命令（input.press，同页面的 data-act）
 *
 * 游戏窗口是唯一真相；独立窗口只持有 schema 与最新值的镜像，所以**面板行不能带函数**（旧 goal-panify 的 `(folder) => {…}` 取消）：
 * 行 = Ref 路径 / 路径对（vec2）/ 动作名 / 表路径，其余信息（标签、区间、枚举、fx）在 Ref 的 meta 里，声明处一次给全。
 * 面板页没有游戏代码、不开世界；它可以单独刷新（热重载面板不影响游戏），游戏刷新后它自动重连（s09 §10）。
 *
 * 出处：IDEA「三大件」L82–92（多 root、任务栏、BroadcastChannel、文件夹级预设、vec2、键区间可热编辑、pickLib、fps 差异、前 3 个下拉项转 <a>）；
 *   goal-pgviz §6（BroadcastChannel('pgviz') 的 ping / pong / hello 与 window.open 被拦时的回退链接，同源，file:// 不通）；s07 §5（iframe 经引擎转发，同一份白名单）。
 */
import type { num, Path, Action, Ref, Meta } from './core.ts'
import type { Mod } from './index.ts'

export interface Out {
  pane_win: { up: boolean }                       // 独立面板页连上 / 断开（hud 提示、「↗ 独立窗口」按钮的状态）
}

// ── 面板声明（纯数据）。gg.pane('渲染', rows, { home: 'game:tr' })
/** 归属窗口与停靠位置 [定 11-09]：游戏窗口 左上 / 右上 / 暂停菜单（IDEA L90），或独立面板页。root 同一时刻只在一处，home 持久化（gg_roots） */
export type Home = 'game:tl' | 'game:tr' | 'game:pause' | 'panel'
/** 本行对 Ref.meta 的覆盖。tabs = 枚举行的前 $Pane.tabs 项在文件夹标题行显示成链接，折叠着也能点（R7）；timeit = 布尔行切换后显示前后 fps 差（R6） */
/** 文件夹名约定 [定 11-09]：'🌫 雾与云隙光'，第一个 emoji 自动当图标（标签条窄时只显示它，悬停出名字；搜索忽略它；折叠记忆按去掉 emoji 的名字存，换 emoji 不丢状态）。id 缺省 = 去掉 emoji 的名字 */
export interface RowOpts { label?: string; tabs?: true; timeit?: string }
export type PaneRow =
  | readonly [path: Path, o?: RowOpts]                           // Ref 行：控件种类由 Ref 的值与 meta 定（数 → 滑块，布尔 → 勾选，枚举 → 下拉 / 链接，色 → 取色器，多行文本）
  | readonly [pair: readonly [Path, Path], o?: RowOpts]          // 两个相关键并成一个 vec2，±1 手调（R3）；标签由键名拼
  | { act: Action; label?: string }                              // 按钮 = 虚拟键或命令（'pause'、'/time 7'）；label 缺省取 ACTS 的标签
  | { pick: string; fields: readonly string[] }                  // pickLib（R5）：先划选表里的一行（可搜索），再改它的这几个字段；pick = 表名 'blk' / 'mob' / 'bursts'（= gm.tbl 的键，行路径是 blk.:sand.gravity）
  | readonly [folder: string, rows: readonly PaneRow[], o?: { open?: boolean; id?: string }]   // 文件夹，可嵌套；预设头部（＋保存 / －删除 / ⎘ 转 &json= / ✎ 落盘）由面板自动给，不写在 rows 里
export interface RootOpts { title?: string; home?: Home }

// ── 独立面板页的协议。BroadcastChannel(c_Pane.channel)，同源；消息带版本 v。面板页 → 游戏窗口 / 游戏窗口 → 面板页
export const V = 1
export type PanelMsg =
  | { t: 'hello'; v: num }                                       // 面板页上线：要 schema。channel 名 = c_Pane.channel + ':' + 配对码（见下）
  | { t: 'preset'; op: 'save' | 'overwrite' | 'rename' | 'apply' | 'copy' | 'write'; scope: string; name?: string; to?: string }   // R2：scope = root id 或 'root/文件夹 id'；写入只由游戏窗口做（单一写者）。save = 存成 #1 #2…（不问名字）；rename 的 to 为空 = 删除；apply 的 name 为空 = 回默认；copy 的文本经 GameMsg.copy 回来
  | { t: 'range'; path: Path; min: num; max: num }               // R4：行内改区间
  | { t: 'reset'; scope: string; path?: Path }                   // ↺：回到该范围「当前预设」（没选 = 默认）；path 给了只恢复这一项（scope 仍定基线）
  | { t: 'set'; path: Path; v: unknown; seq: num }               // 改值（滑块拖动按帧合并，每路径每帧至多一条）；走游戏窗口的 Ref.set，同一条路由
  | { t: 'act'; act: Action; edge?: 'down' | 'up' | 'tap' }
  | { t: 'home'; root: string; to: Home }                        // 「移到另一窗口」
  | { t: 'tbl'; name: string; q?: string; from?: num; n?: num }  // 懒取表行（pickLib 搜索 / 翻页；blk.tsv 这种大表不整张下发）
  | { t: 'bye' }                                                 // 面板页关闭
/** 配对码 [定 11-09，审出的漏洞]：同源 Worker 也能 new BroadcastChannel（实测），模组 worker 可以冒充面板页绕过 M-2 白名单。所以 channel 名带随机配对码：
 *  popOut() 生成，放进 URL 片段 panel.html#k=…（Worker 读不到）；手动打开面板页时让用户从游戏任务栏复制配对码粘贴。 */
export interface Schema {
  v: num
  roots: readonly { id: string; title: string; home: Home; rows: readonly PaneRow[] }[]
  meta: Readonly<Record<Path, Meta>>                             // 出现在 rows 里的每个路径
  vals: Readonly<Record<Path, unknown>>                          // 当前值
  def: Readonly<Record<Path, unknown>>                           // 默认值（画「已改动」标记、恢复默认、预设 diff 要用）
  pdata: Readonly<Record<string, Readonly<Record<string, Readonly<Record<Path, unknown>>>>>>   // scope → 预设名 → 路径值
  cur: Readonly<Record<string, string>>                          // scope → 当前预设（'' = 默认）。黄点 / ↺ / 预设头的 dirty 都以它为基线
  acts: Readonly<Record<Action, { label: string; keys: string }>>   // 按钮标签与键位提示
}
export type GameMsg =
  | { t: 'schema'; schema: Schema }                              // 回应 hello；游戏窗口启动完成 / 模块启停 / root 变了也主动发（面板页整张重画）
  | { t: 'changed'; from: 'game' | 'panel'; d: Readonly<Record<Path, unknown>> }   // 值变了，每帧至多一条；from = 谁改的（发起者不重复应用）
  | { t: 'tbl'; name: string; q?: string; from: num; cols: readonly { k: string; type: 'str' | 'num' | 'bool' | 'hex'; min?: num; max?: num; step?: num }[]; rows: readonly Record<string, unknown>[]; total: num }   // 行带 id 与各列值（mock 实测：按列类型出控件，比 string[][] 好用）
  | { t: 'perf'; path: Path; fps: num; gpu: num }                 // R6：timeit 行切换前后的 fps / gpu 中位数差（悬停显示）
  | { t: 'copy'; text: string }                                  // ⎘ 转 &json= 的文本；面板页在用户手势里写剪贴板
  | { t: 'beat'; n: num }                                        // 心跳，每 c_Pane.beatMs 一条：面板页 3 个周期没收到就变灰（游戏窗口被遮挡节流 / 卡死）
  | { t: 'gone' }                                                // 游戏窗口 pagehide（关闭 / 刷新）：面板页变灰，等下一个 schema
  | { t: 'toast'; msg: string; bad?: boolean }                   // 提示（写被拒：路径不存在 / 值类型不对；落盘结果；预设已保存）。取代原 err
  | { t: 'meta'; path: Path; meta: Meta }                        // 区间被改（R4）：面板页重画那一行
  | { t: 'presets'; scope: string; cur: string; data: Readonly<Record<string, Readonly<Record<Path, unknown>>>> }   // 某个范围的预设 / 当前预设变了
  | { t: 'tbl_change'; name: string; from: 'game' | 'panel' }    // 表行被改：打开着的 pickLib 重取当前页

export interface Api {
  pane: {
    get(p: Path): unknown
    set(p: Path, v: unknown): unknown                            // 模组经白名单只能写参数与表行（s07 M-2，s09 §12）
    ref<T>(p: Path): Ref<T>
    on(p: Path, h: (v: unknown, old: unknown) => void): () => void
    open(root: string, on?: boolean): void                       // 在它归属的窗口里显隐
    home(root: string, to?: Home): Home                          // 读 / 改归属
    up: Ref<boolean>                                             // 独立面板页是否连着（kernel BIND → html[data-panel]）
    popOut(): boolean                                            // 「↗ 独立窗口」：window.open(panelUrl + '#k=配对码', 'gode-panel', 'popup,width=…')：popup 特性避免开成标签页把游戏页挂后台、命名目标避免重复窗口；被拦返回 false，页面角落给回退链接（pgviz 同款）
    search(q: string): readonly SearchHit[]                      // 全局搜索（§6.3）：参数（标签 / 路径 / doc）、表行、模块；忽略 emoji
  }
}

/** 搜索命中：点它 = 切到所在 root 的标签、展开文件夹、滚到并高亮那一行；表行 / 模块命中同理（表行经 tbl 懒取） */
export interface SearchHit { kind: 'ref' | 'tbl' | 'mod'; path: Path; label: string; root: string; folder?: string }

export const c_Pane = {
  searchKey: 'Tab',            // 面板窗口里聚焦🔍标签；游戏窗口里 Tab 留给游戏，用 searchKeyGame
  searchKeyGame: 'Ctrl+Space',
  channel: 'gode-pane', panelUrl: 'gode/panel.html',
  batchMs: 16,                  // changed / set 的合并窗口（一帧）
  beatMs: 1000,                 // 游戏窗口心跳间隔
  tabs: 3,                      // R7：枚举行的前几项转链接
  dockW: 280,                   // 游戏窗口里 root 的宽度
  fpsSettleMs: 2000, fpsSampleMs: 1000,   // R6：切换后等 2 s 稳定，前后各取 1 s 的 fps / gpu 中位数
}

export const mod = {
  id: 'pane', where: 'main', catalog: 'core', layer: 'kernel', axis: 'ui', ms: 'M1-2',
  doc: 'c_ / Ref 的面板：声明是纯数据；游戏窗口里的 root（左上 / 右上 / 暂停菜单）+ 独立面板页（BroadcastChannel）；两个窗口各一条任务栏',
  emit: { pane_win: 'edge' },
  sub: ['screen', 'key'],            // screen：暂停菜单里的 root 只在暂停屏显示；key：quick（` 键）开关快调 root
  depends: [],
  tables: ['c_.json'], c_: ['$Pane'], save: ['c_'],
} as const satisfies Mod
