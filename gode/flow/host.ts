/**
 * gode/flow/host.ts —— 边界模块：已有（game / world / p1）或排在后续里程碑（interact / ents / save …）。渲染器单独在 render.ts（参数多）。
 *   这里只写它们对外的连接点，好让 7 个模块的数据流闭合；内部逻辑以各自的节为准（s02 s04 s05 s06 s07）。
 *   这里的模块都是引擎核心（Mod.core，不可停用，kernel.ts ④）；框架本身（模块加载、虚拟键转移、HTML 绑定、gm.mods）在 kernel.ts，面板（gm.pane、独立窗口）在 pane.ts。
 *   状态型事件在其持有者的命名空间里各有一个同名的「最新值」Ref（world.here、p1.stat、inv.hot、weather.clock…）：事件是变化的推送，Ref 是页面绑定与 gm 读取用的。
 */
import type { num, XYZ, PStr, PName, Blk, Item, Mob, Stack, Ref, Delta, Src, Here, Body, Stat, SaveEntry, StartArg } from './core.ts'
import type { Mod } from './index.ts'

export interface Out {
  // ── game（main/boot.js 主循环）
  boot: { t: num }                                         // 页面打开，一次（kernel MOVES 的 'boot' 行：screen → title）
  frame: { dt: num }
  tick: { n: num }                                         // 20 Hz 固定步，一帧最多补 4 次（宿主 B Game.loop :3766）
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
  p1_move: Body                                            // 每帧
  p1_step: { P: XYZ; under: Blk }                          // 每走 stepLen 格一次（宿主 B Motion.update :1609，搬到 p1：生物以后也发同样的事件）
  p1_land: { P: XYZ; fall: num; under: Blk }               // 落地且 fall > 0.8（:1612）
  p1_fluid: { P: XYZ; feet: Blk | null; head: Blk | null; vy: num }   // 脚 / 头进出流体的那一帧（宿主 B LiquidFx.transition :1630）
  p1_stat: Stat                                            // 变了才发
  p1_hurt: { cause: string; amount: num; dir: num }        // dir = 来源相对朝向的左右（−1 / 1）
  p1_die: { cause: string }
  // ── interact（M3-7：挖 / 放 / 使用 / 物品栏）
  aim: { P: XYZ | null; face: num; blk: Blk | null; mob: Mob | null }   // 准星目标，变了才发（F3 的 XYZB / Mob 行）
  blk_hit: { P: XYZ; blk: Blk; face: num }                 // 挖的过程中每秒约 6 次（宿主 B :2063 dt·6）
  blk_break: { P: XYZ; blk: Blk; by: Mob }                 // 被谁挖掉 / 炸掉；流体冲毁、火烧不走这里（sim.ts 另有事件）
  blk_place: { P: XYZ; blk: Blk; by: Mob }
  item_use: { item: Item; P: XYZ | null }                  // 右键使用（gm 值物品、桶、打火石…）
  item_eat: { item: Item; done: boolean }                  // 进食中（done = false，约每 0.13 s）/ 吃完
  item_pickup: { item: Item; n: num }
  tool_break: { item: Item }
  craft: { item: Item; n: num }
  inv: { hot: readonly (Stack | null)[]; sel: num }        // 物品栏前 9 格 + 选中，变了才发
  // ── ents（M3：生物 / 实体，s05）
  mob_say: { mob: Mob; P: XYZ }                            // 闲叫（宿主 B mobsim.js:196，20 格内 1/300 每 tick）
  mob_hurt: { mob: Mob; P: XYZ; amount: num }
  mob_die: { mob: Mob; P: XYZ }
  tnt_fuse: { P: XYZ }
  explode: { P: XYZ; power: num }                          // 宿主 B Entities.explode
  // ── save（M2，s06）
  save_index: { list: readonly SaveEntry[] }               // 存档列表变了（标题屏刷新）
}

export interface Api {
  game: {
    start(a: StartArg): Promise<void>; pause(): void; resume(): void
    mode: Ref<string>                                      // 读 / 切模式（G 键、/mode、模组 set）；kernel BIND → html[data-mode]
    // paused = title.screen ≠ 'game'（派生，不另存）；tpause 另管时钟 / 生物 / 模拟
    tpause(f: Partial<Out['pause']>): void
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
  p1: { tp(P: XYZ | PStr | PName): boolean; body(): Body; stat: Ref<Stat>; dead: Ref<boolean>; fly(on?: boolean): boolean; noclip(on?: boolean): boolean }
  inv: { give(s: Stack | Item | `${Item}*${num}`): num; take(s: Stack | Item | `${Item}*${num}`): num; held(): Stack | null; hot: Ref<readonly (Stack | null)[]>; sel: Ref<num> }
  ents: {
    spawn(m: Mob, P: XYZ | PStr): boolean
    item(P: XYZ, s: Stack, vel?: XYZ): void                // 掉落物
    fall(P: XYZ, blk: Blk): void                           // 下落方块实体 [新]（宿主 B 是瞬移，mobsim.js:498）
    near(r: num): readonly { mob: Mob; P: XYZ }[]          // 命令补全 '#…'、小地图标记
  }
  save: {
    list(): readonly SaveEntry[]; cover(seed: string): Promise<string | null>
    put(file: Blob): Promise<SaveEntry>; remove(seed: string): Promise<void>; export(seed?: string): Promise<Blob>
  }
  slicer: { tree(P: XYZ, kind: string): Promise<readonly (readonly [XYZ, Blk])[]> }   // s01 可选动词：树苗长成树
}

export const mods = {
  game: {
    id: 'game', where: 'main', core: true, doc: 'main/boot.js；s07 §3 模式与 cheat',
    emit: { boot: 'edge', frame: 'frame', tick: 'tick', game_load: 'edge', game_ready: 'edge', game_mode: 'edge', pause: 'edge' },
    sub: ['key', 'screen'], depends: ['pane'], tables: ['mode.json'], c_: ['$Game'], save: ['mode', 'cheat'],
  },
  world: {
    id: 'world', where: 'main', core: true, doc: 'main/world.js；s02 §3、s14 §4',
    emit: { delta: 'sync', chunk_in: 'edge', chunk_out: 'edge', here: '4Hz', biome: 'edge' },
    sub: ['pose', 'p1_move', 'tbl_change'], depends: ['slicer', 'inv'], tables: ['blk.tsv'], c_: ['$R'], save: ['xzp', 'pile'],   // inv.held → Here.held
  },
  p1: {
    id: 'p1', where: 'main', core: true, doc: 'main/phys.js；生存状态 M3；落雷 3 格内按 hurt.js 的 lightning 行扣血（MC 5）',
    emit: { p1_move: 'frame', p1_step: 'edge', p1_land: 'edge', p1_fluid: 'edge', p1_stat: 'edge', p1_hurt: 'edge', p1_die: 'edge' },
    sub: ['intent', 'tick', 'game_mode', 'pause', 'lightning', 'key'], depends: ['world', 'pane'], tables: ['hurt.js'], c_: ['$Motion'], save: ['p1'],
  },
  interact: {
    id: 'interact', where: 'main', core: true, doc: 'M3-7；宿主 B Interaction :1933、Inventory :2297',
    emit: { aim: 'edge', blk_hit: '6Hz', blk_break: 'edge', blk_place: 'edge', item_use: 'edge', item_eat: 'edge', item_pickup: 'edge', tool_break: 'edge', craft: 'edge', inv: 'edge' },
    sub: ['intent', 'p1_move'], depends: ['world', 'ents'], tables: ['item.json', 'recipe.json', 'on.js'], c_: ['$Build'], save: ['inv'],
  },
  ents: {
    id: 'ents', where: 'main', core: true, doc: 'M3；s05；宿主 B mobsim.js Mobs、Entities :2775',
    emit: { mob_say: 'edge', mob_hurt: 'edge', mob_die: 'edge', tnt_fuse: 'edge', explode: 'edge' },
    sub: ['tick', 'pause', 'fluid_wash', 'blk_fall', 'lightning'], depends: ['world', 'fx'], tables: ['mob.json', 'ent.json', 'on.js', 'hurt.js'], c_: ['$MobAI'], save: ['mat'],
  },
  save: {
    id: 'save', where: 'io', core: true, doc: 'M2；s06；宿主 B Save :3021',
    emit: { save_index: 'edge' },
    sub: ['delta', 'game_ready', 'screen'], depends: ['render', 'pane'], tables: [], c_: ['$Save'], save: [],
  },
  slicer: { id: 'slicer', where: 'slicer', core: true, doc: 's01 / s02：w/slicer.js', emit: {}, sub: [], depends: [], tables: ['g/*.js'], c_: [], save: [] },
} as const satisfies Record<string, Mod>
