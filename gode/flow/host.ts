/**
 * gode/flow/host.ts —— 边界模块：已有（game / world / p1）或排在后续里程碑（interact / ents / save …）。渲染器单独在 render.ts（参数多）。
 *   这里只写它们对外的连接点，好让 7 个模块的数据流闭合；内部逻辑以各自的节为准（s02 s04 s05 s06 s07）。
 *   这里的模块都是引擎核心（Mod.catalog = 'core'，不可停用，kernel.ts ④）；框架本身（模块加载、虚拟键转移、HTML 绑定、gg.mods）在 kernel.ts，面板（gm.pane、独立窗口）在 pane.ts。
 *   状态型事件在其持有者的命名空间里各有一个同名的「最新值」Ref（world.here、p1.stat、p1.bar.hot、weather.clock…）：事件是变化的推送，Ref 是页面绑定与 gm 读取用的。
 *   玩家相关事件的载荷带 p1.who（core.ts P1Tag，'' = 服主）；格子口径 grid / bag / bar / bins 见 core.ts Grid。
 */
import type { num, XYZ, PStr, PName, Blk, Item, Mob, Bime, Stack, Ref, Delta, Src, Here, Body, Stat, SaveEntry, StartArg, Grid, Who, P1Tag, MarkTable } from './core.ts'
import type { Mod } from './index.ts'

export interface Out {
  // ── game（main/boot.js 主循环）
  boot: { t: num }                                         // 页面打开，一次（kernel MOVES 的 'boot' 行：screen → title）
  frame: { dt: num }
  tick: { n: num }                                         // 20 Hz 固定步，一帧最多补 4 次（宿主 B Game.loop :3766）
  tick_end: { n: num }                                     // tick 的全部订阅者跑完之后（hooks 在这里应用命令队列；订阅 tick 的模块里产生的命令当 tick 就生效）
  game_load: { progress: num; what: 'gen' | 'save' }
  game_ready: { seed: string; g: string; fresh: boolean }  // fresh = 新世界（要找出生点）
  game_mode: { mode: string; cheat: boolean }              // G 键轮转、cheat（s07 §3）
  pause: { clock: boolean; mobs: boolean; sim: boolean }   // tpause 按钮组（s09 §5）：暂停时钟 / 生物 / 模拟；全 false = 正常
  // ── world（main/world.js）
  delta: Delta                                             // 同步、按 seq 有序（s14 §4）
  chunk_in: { cx: num; cz: num; from: 'gen' | 'load' }
  chunk_out: { cx: num; cz: num }
  here: Here                                               // 4 Hz，按 pose 采样
  biome: { key: string; id: num }                          // 相机处群系变了（宿主 B gm.on({biome}) :2516，rgl/biome-caustic.js 在用）
  // ── p1（main/phys.js；生存状态 M3）
  p1_move: Body & P1Tag                                            // 每帧
  p1_step: { P: XYZ; under: Blk } & P1Tag                          // 每走 stepLen 格一次（宿主 B Motion.update :1609，搬到 p1：生物以后也发同样的事件）
  p1_land: { P: XYZ; fall: num; under: Blk } & P1Tag               // 落地且 fall > 0.8（:1612）
  p1_fluid: { P: XYZ; feet: Blk | null; head: Blk | null; vy: num } & P1Tag   // 脚 / 头进出流体的那一帧（宿主 B LiquidFx.transition :1630）
  p1_stat: Stat & P1Tag                                            // 变了才发
  p1_hurt: { cause: string; amount: num; dir: num } & P1Tag        // dir = 来源相对朝向的左右（−1 / 1）
  p1_die: { cause: string } & P1Tag
  // ── interact（M3-7：挖 / 放 / 使用 / 物品栏）
  aim: { P: XYZ | null; face: num; blk: Blk | null; mob: Mob | null } & P1Tag   // 准星目标，变了才发（F3 的 XYZB / Mob 行）
  blk_hit: { P: XYZ; blk: Blk; face: num } & P1Tag                 // 挖的过程中每秒约 6 次（宿主 B :2063 dt·6）
  blk_break: { P: XYZ; blk: Blk; by: Mob; p1?: Who }                 // 被谁挖掉 / 炸掉；流体冲毁、火烧不走这里（sim.ts 另有事件）
  blk_place: { P: XYZ; blk: Blk; by: Mob; p1?: Who }
  item_use: { item: Item; P: XYZ | null } & P1Tag                  // 右键使用（gm 值物品、桶、打火石…）
  item_eat: { item: Item; done: boolean } & P1Tag                  // 进食中（done = false，约每 0.13 s）/ 吃完
  item_pickup: { item: Item; n: num } & P1Tag
  tool_break: { item: Item } & P1Tag
  bin: { P: XYZ; kind: string; open: boolean } & P1Tag     // 玩家打开 / 关上一个 bins 格子（箱子开盖声）。bag 本身的开关是 screen 'bag'
  bin_change: { P: XYZ; kind: string; i: num; stack: Stack | null; p1?: Who }   // bin 的某一格变了（i = −1：只有 meta 变，如熔炉进度，最多 4 Hz）。嵌进 grid UI 时页面读 bins.cur；这个事件给音效 / 模组（熔炼完成声）
  craft: { item: Item; n: num } & P1Tag
  bar: { hot: readonly (Stack | null)[]; sel: num } & P1Tag   // 热键栏（bag 的前 N 格）+ 选中，变了才发（p1 发；world 据此算 Here.held，只看服主）。原名 inv
  // ── ents（M3：生物 / 实体，s05）
  blk_touch: { P: XYZ; blk: Blk; mob: Mob; id: num; v: XYZ }   // 实体进入某格的那一刻（hooks 的 onEntityCollide；只在该格方块有这个钩子时才发，不是每 tick）
  mob_say: { mob: Mob; P: XYZ }                            // 闲叫（宿主 B mobsim.js:196，20 格内 1/300 每 tick）
  mob_hurt: { mob: Mob; P: XYZ; amount: num; p1?: Who }
  mob_die: { mob: Mob; P: XYZ; p1?: Who }
  tnt_fuse: { P: XYZ }
  explode: { P: XYZ; power: num }                          // 宿主 B Entities.explode
  // ── save（M2，s06）
  save_index: { list: readonly SaveEntry[] }               // 存档列表变了（标题屏刷新）
}

/** 玩家句柄 [定 11-10，用户]：玩家相关的状态与动作都在 p1 下（物品栏 = p1.bar，原 inv）。gm.p1 默认指服主（who = ''）；
 *  联机时 gm.p1.now(who, p => …) 在指定玩家上操作，其余成员不变。单机只有 ''。页面绑定、命令行、hud 默认指服主 */
export interface P1 {
  readonly who: string                                     // '' = 服主
  tp(P: XYZ | PStr | PName): boolean; body(): Body; stat: Ref<Stat>; dead: Ref<boolean>; fly(on?: boolean): boolean; noclip(on?: boolean): boolean
  bag: Grid                                                // 背包：玩家的全部格子（give / take 从这里进出，先填 bar 再填其余）
  bar: { readonly n: num; hot: Ref<readonly (Stack | null)[]>; sel: Ref<num>; held(): Stack | null }   // 热键栏 = bag 的前 n 格（n = c_Build.barN，缺省 9）；hot 是 bag.slots 的前 n 项（派生）
}
/** 储物箱柜 / 工具（非玩家的 grid）：箱子的内容在 xyzb.tsv 的 tile 里（世界状态），熔炉 / 工作台等工具同口径。meta = 数字状态（熔炉的 burn / cook 进度），页面画进度条 */
export interface Bin extends Grid { readonly P: XYZ; readonly kind: string /* 'chest' | 'furnace' | 'bench' | 模组加的 */; meta: Ref<Readonly<Record<string, num>>> }
/** 页面看到的「当前打开的 bin」（gm.bins.cur，值不是 Ref 树）：嵌进 grid UI，样式排版自定。
 *  页面：<html data-bin="furnace">（kernel / hud BIND 'bins.cur.kind'）+ <template data-each="bins.cur.cells">，子元素 data-bind=".stack.name"、data-role 取 ".role"，CSS 按 [data-bin] × [data-role] 排版（grid-template-columns 取 --bin-cols）。
 *  要完全自绘就在 bin.tsv 的 ui 列给 iframe（s07 §5 方块绑定） */
export interface BinView { P: XYZ; kind: string; size: num; cols: num; cells: readonly { i: num; role: string; stack: Stack | null }[]; meta: Readonly<Record<string, num>> }
/** defl/bin.tsv：bins 的种类与格子布局（模组追加行 = 新增种类）。roles：'区间:角色' 空格分隔，角色是 in / out / fuel / store 或自定义（页面按 data-role 样式）；
 *  ui：空 = 嵌进引擎 grid UI；给 url = iframe 自绘（s07 §5）。宿主 B 的值（Furnace :2332；工作台 / 箱子格数是 [新]，示意） */
export type BinRow = readonly [kind: string, size: num, cols: num, roles: string, ui: string, label: string]
export const BINS = [
  ['chest',   27, 9, '0-26:store',          '', '箱子'],
  ['furnace',  3, 3, '0:in 1:fuel 2:out',   '', '熔炉'],
  ['bench',   10, 3, '0-8:in 9:out',        '', '工作台'],
] as const satisfies readonly BinRow[]
/** gm = 模组高频 API（世界读写、玩家、实体、动作、表、特效、面板）；引擎装置在 GgApi（index.ts 的 Gg）[定 11-10，用户] */
export interface Api {
  game: {
    mode: Ref<string>                                      // 读 / 切模式（G 键、/mode、模组 set）；kernel BIND → html[data-mode]
    readonly seed: string; readonly g: string
  }
  world: {
    get(P: XYZ | PStr): Blk
    here: Ref<Here>                                        // 最近一次 here 采样（kernel BIND → html[data-fluid]）
    set(P: XYZ | PStr, blk: Blk, src?: Src): boolean       // 唯一写入口（s14 §4）：发 delta，光照 / 网格 / 模拟 / pile 都从 delta 来
    at(P: XYZ): { blk: Blk; meta: num; sky: num; light: num; biome: string }
    near(P: XYZ, r: num, blk: Blk, flowing?: boolean): num // 半径 r 内某种方块的格数（音效持续层、粒子）
    height(x: num, z: num): num
    loaded(P: XYZ): boolean
  }
  p1: P1 & {
    now<R>(who: string, f: (p: P1) => R): R | null         // 在指定玩家上操作；who 不在线 = 返回 null（f 不调用）。now('', f) = 服主
    list(): readonly string[]                              // 在线玩家（服主是 ''）
  }
  ents: {
    near(r: num): readonly { mob: Mob; P: XYZ }[]          // 命令补全 '#…'、小地图标记
    set(id: num, patch: { v?: XYZ; st?: string /* pkv 状态补丁 '{hp 8; …}' */ }): boolean   // 写实体（组件的 {ent} 命令落到这里）；id 不在 = false
  }
  /** 快速生成实体 [定 11-10，用户]（取代 ents.spawn / ents.item / ents.fall）：put('#zombie')、put('#zombie*10', '@12,5^64')；任何 Bime 值都行 ——
   *  put(':stone*3') = 掉落物，put(':sand{…}', P) = 下落方块（落地后同值回到网格，状态不丢）。born 的实体与网格对齐，不带 Foot。
   *  缺省位置 = 服主准星格上方（没有目标就是脚前 2 格）；o.line = 一排、每只间隔几格（/arena zombie 10，IDEA-sys L38）；返回成功生成的实体 id。同 Cmd 的 spawn × n */
  put(what: Bime | `${Bime}*${num}`, at?: XYZ | PStr | PName, o?: { line?: num }): readonly num[]
  bins: {
    at(P: XYZ): Bin | null                                 // 该格是储物 / 工具方块时给它的 grid，否则 null
    open(P: XYZ, who?: string): boolean                    // 为玩家（缺省服主）打开界面（screen → 'bin'）；发 bin 事件
    cur: Ref<BinView | null>                               // 服主当前打开的 bin（页面绑定用；null = 没开）
  }
  marks: MarkTable                                         // 世界标记表（一份，存档）；主视图的层开关在 marks.view，小地图的在 gm.actOnMap
}
export interface GgApi {
  game: { start(a: StartArg): Promise<void>; pause(): void; resume(): void; tpause(f: Partial<Out['pause']>): void }   // paused = title.screen ≠ 'game'（派生，不另存）；tpause 另管时钟 / 生物 / 模拟
  save: {
    list(): readonly SaveEntry[]; cover(seed: string): Promise<string | null>
    put(file: Blob): Promise<SaveEntry>; remove(seed: string): Promise<void>; export(seed?: string): Promise<Blob>
  }
  slicer: { tree(P: XYZ, kind: string): Promise<readonly (readonly [XYZ, Blk])[]> }   // s01 可选动词：树苗长成树
}

/** worker 的 RPC 动词（s01 §2 信封：单键动词 + id）。服务者在 Mod.serves 里声明，调用者在 Mod.calls 里声明；index.ts 检查「每个被调用的动词有且仅有一个服务者」。
 *  slicer 池的动词：gen / tree 由生成器脚本提供，mesh / bake 由运行时提供（mesh.ts 的 Rpc）[定 11-10，用户：mesher 是 slicer 池的第二个动词] */
export interface SlicerRpc {
  gen(a: { cx: num; cz: num }): Promise<{ cx: num; cz: num; blocks: ArrayBuffer; biomes: ArrayBuffer; heights: ArrayBuffer; light: ArrayBuffer; outside: ArrayBuffer; ms: num }>
  tree(a: { P: XYZ; kind: string }): Promise<readonly (readonly [XYZ, Blk])[]>
}
/** dumper 的动词（s06 §4.3：OPFS 唯一读写者）。slicer 的结果不经过它；main 落盘时 transfer 过去 */
export interface DumperRpc {
  read(a: { cx: num; cz: num }): Promise<{ xzp: ArrayBuffer } | null>
  write(a: { cx: num; cz: num; xzp: ArrayBuffer }): Promise<void>
  flush(a: {}): Promise<void>
}

export const mods = {
  game: {
    id: 'game', where: 'main', catalog: 'core', layer: 'core', axis: 'play', ms: 'M1 ✅', doc: 'main/boot.js；s07 §3 模式与 cheat',
    emit: { boot: 'edge', frame: 'frame', tick: 'tick', tick_end: 'tick', game_load: 'edge', game_ready: 'edge', game_mode: 'edge', pause: 'edge' },
    sub: ['key', 'screen'], depends: ['pane'], tables: ['mode.json'], c_: ['$Game'], save: ['mode', 'cheat'],
  },
  world: {
    id: 'world', where: 'main', catalog: 'core', layer: 'core', axis: 'play', ms: 'M1 ✅', doc: 'main/world.js；s02 §3、s14 §4',
    emit: { delta: 'sync', chunk_in: 'edge', chunk_out: 'edge', here: '4Hz', biome: 'edge' },
    sub: ['pose', 'p1_move', 'tbl_change', 'bar'], depends: ['slicer'], tables: ['blk.tsv'], c_: ['$R'], save: ['xzp', 'pile', 'marks'], calls: ['gen', 'read', 'write', 'flush'],   // bar 事件 → Here.held（不依赖 p1：p1 依赖 world，会成环）
  },
  p1: {
    id: 'p1', where: 'main', catalog: 'core', layer: 'core', axis: 'play', ms: 'M1 ✅', doc: 'main/phys.js；生存状态 M3；落雷 3 格内按 hurt.js 的 lightning 行扣血（MC 5）',
    emit: { p1_move: 'frame', p1_step: 'edge', p1_land: 'edge', p1_fluid: 'edge', p1_stat: 'edge', p1_hurt: 'edge', p1_die: 'edge', bar: 'edge' },
    sub: ['intent', 'tick', 'game_mode', 'pause', 'lightning', 'key'], depends: ['world', 'render', 'pane'], tables: ['hurt.js'], c_: ['$Motion'], save: ['p1', 'bar'],   // bar = p1.bar 的格子（物品栏状态属玩家；interact 管合成 / 熔炉的界面逻辑）
  },
  interact: {
    id: 'interact', where: 'main', catalog: 'core', layer: 'core', axis: 'play', ms: 'M3-7', doc: 'M3-7；宿主 B Interaction :1933、Inventory :2297',
    emit: { aim: 'edge', blk_hit: '6Hz', blk_break: 'edge', blk_place: 'edge', item_use: 'edge', item_eat: 'edge', item_pickup: 'edge', tool_break: 'edge', craft: 'edge', bin: 'edge', bin_change: 'edge' },
    sub: ['intent', 'p1_move'], depends: ['world', 'p1', 'ents', 'hooks'], tables: ['item.json', 'recipe.json', 'bin.tsv'], c_: ['$Build'], save: [],
  },
  ents: {
    id: 'ents', where: 'main', catalog: 'core', layer: 'core', axis: 'play', ms: 'M3-6', doc: 'M3；s05；宿主 B mobsim.js Mobs、Entities :2775',
    emit: { blk_touch: 'edge', mob_say: 'edge', mob_hurt: 'edge', mob_die: 'edge', tnt_fuse: 'edge', explode: 'edge' },
    sub: ['tick', 'pause', 'fluid_wash', 'blk_fall', 'lightning'], depends: ['world', 'fx', 'render'], tables: ['mob.json', 'ent.json', 'on.js', 'hurt.js', 'blk.tsv'], c_: ['$MobAI'], save: ['mat'],
  },
  save: {
    id: 'save', where: 'dumper', catalog: 'core', layer: 'core', axis: 'play', ms: 'M2', doc: 'M2；s06；宿主 B Save :3021',
    emit: { save_index: 'edge' }, serves: ['read', 'write', 'flush'],
    sub: ['delta', 'game_ready', 'screen'], depends: ['render', 'pane'], tables: [], c_: ['$Save'], save: [],
  },
  slicer: { id: 'slicer', where: 'slicer', catalog: 'core', layer: 'core', axis: 'play', ms: 'M1 ✅', doc: 's01 / s02：w/slicer.js', emit: {}, sub: [], depends: [], tables: ['g/*.js'], c_: [], save: [], serves: ['gen', 'tree', 'mesh', 'bake'] },
} as const satisfies Record<string, Mod>
