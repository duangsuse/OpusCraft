/**
 * gode/flow/title.ts —— 标题屏 UI，一个默认模组 [定 11-09，用户；屏保不做]
 *
 *   虚拟键 pause / continue / start / ask 与 boot / game_ready ──MOVES 表（kernel 执行）──▶ Ref title.screen ──▶ screen 事件
 *       ──▶ input（焦点、标题屏预览视角）、audio（BGM、压低）、render、save（暂停时截封面）
 *   页面：<html data-screen="title|paused|ask|loading|game">（kernel BIND）。菜单显示 / 转圈 / 物品栏半透明 / 准星隐藏全由 defl/ui.css 的
 *     html[data-screen=…] 选择器决定，不再有 STATES 那样「状态 × 控件属性」的逐列表 [定 11-09，用户：过度拆解、imgui 味]。游戏只剩一条语义：paused = screen ≠ 'game'。
 *   页面按钮 <button data-act="start"> ──▶ 虚拟键 ──▶ MOVES；输入框 / 列表点选 ──▶ gg.game.start / resume、gg.save.put / remove / export、gm.p1.bar.give（试玩物品）
 *
 * 画面（IDEA「有趣的优化」+ 存档段）：
 *   - 主界面横排两个按钮，各带一个输入框：左 = seed / 联机码，右 = 粘贴 webp 存档，进去就开。
 *   - 存档列表：每行 = 名字、模式、游戏内天数、大小、日期；悬停全屏看封面（pic/），可多选两张对比，可多张一起复制去发帖。
 *   - Pusc.json 有 author 时，删除键换成 info 键（作者链接、说明、标签，s06）。
 *   - Esc 暂停屏底部一排试玩物品（水桶、打火石、TNT、弓…），点一下拿到手（tryItems）。暂停屏按 tpause 半透明（s09 §6.1）。
 * 宿主 B 出处：Title :3349（set / boot / urlStart / open / render / peek / pick / newWorld / importFile）· c_TitleStates :3115 · c_Title :3123 · 1scr :272。
 */
import type { Item, Screen, SaveEntry, StartArg, Ref } from './core.ts'
import type { Mod } from './index.ts'
import type { MoveRow } from './kernel.ts'

export interface Out {
  screen: { s: Screen; was: Screen }
}

export interface GgApi {
  title: {
    screen: Ref<Screen>                                   // 唯一持有者；MOVES 改它，改了发 screen 事件。paused = screen ≠ 'game'
    open(s?: 'title' | 'paused' | 'ask'): void
    start(a: StartArg): Promise<void>                     // = 左边输入框 / 粘贴 / 列表点选 / &start=（转给 gg.game.start）
    ask(): Promise<StartArg | null>                       // 'ask'：等用户给一个存档（宿主 B promptXYZB）
  }
}

/** screen 的转移行（defl/moves.tsv 的一部分，kernel 执行）。[Ref, 从, 动作, 到]：动作 = 虚拟键（input.ts ACTS）或事件（boot / game_ready）。
 *  模组加一个新屏（背包 / 地图 / clawd）= 往 moves.tsv 追加几行，页面加几条 html[data-screen=…] 的 CSS。 */
export const MOVES = [
  ['title.screen', '*',       'boot',       'title'],      // 页面打开：最近的世界在后面加载（不显示转圈）
  ['title.screen', 'game',    'pause',      'paused'],
  ['title.screen', 'paused',  'pause',      'game'],       // 再按 Esc 继续（宿主 B Title.enter）
  ['title.screen', 'title',   'continue',   'game'],
  ['title.screen', '*',       'start',      'loading'],    // 左 / 右输入框、列表点选
  ['title.screen', 'loading', 'game_ready', 'game'],
  ['title.screen', 'title',   'ask',        'ask'],
  ['title.screen', 'paused',  'ask',        'ask'],
  ['title.screen', 'ask',     'pause',      'paused'],
] as const satisfies readonly MoveRow[]

export const c_Title = {
  peekDelay: 90, peekFit: { aspect: 0.15, scale: [0.4, 2.5] }, previewRd: 16, minRows: 4, lookSpeed: 1.9, drift: 0.04,   // 宿主 B 现值
  dateFmt: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  tryItems: [[':water_bucket', ':lava_bucket'], [':torch', ':glass'], [':crafting_table', ':furnace', ':chest'], [':tnt', ':flint_and_steel', ':bow'], [':diamond_hoe', ':wheat_seeds', ':ladder', ':oak_door']] as readonly (readonly Item[])[],
  compare: 2,                                             // [新] 多选对比的张数
}
/** 列表一行显示什么（宿主 B Title.row）：名字 · 模式 · 年龄（天 + 时）· KB · 日期；有 author 时末尾是 info 键 */
export const ROW = ['name', 'mode', 'age', 'kb', 't'] as const satisfies readonly (keyof SaveEntry | 'age')[]
/** 标语（i18n 文本池 t.splash，宿主 B res_vam SPLASHES；模组可追加） */
export const SPLASH = ['Now with creepers!', 'Happy farming!', '100% procedural cave!', 'Water flows down now!', 'Punch zombies!', 'Not affiliated with Mojang!', 'Lava is hot!'] as const

export const mod = {
  id: 'title', where: 'main', catalog: 'defl', axis: 'ui', ms: '未排期',
  doc: '标题屏 / 暂停屏 / 加载条；画面（screen）的唯一持有者。显示全在 ui.html / ui.css',
  off: '启动直接进游戏（screen = game），没有标题屏与暂停屏；Esc 不再暂停',
  emit: { screen: 'edge' },
  sub: ['game_load', 'game_ready', 'save_index'],        // key 由 kernel 的 MOVES 吃，title 不再订阅
  depends: ['game', 'save', 'p1', 'pane'],            // pane：暂停时展开渲染 / 玩法 root（s09 §6）；按钮点击声由 audio 订阅 key 出（SFX 表）
  tables: ['i18n.json'], c_: ['$Title'], save: [],   // 存档列表归 save 模块（M2）
} as const satisfies Mod
