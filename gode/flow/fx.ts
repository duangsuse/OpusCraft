/**
 * gode/flow/fx.ts —— 粒子：挖方块碎屑（burst）· fire · firefly · flutter [定 11-09，用户：先收现有的四种]
 *
 *   事件 ──BURSTS 表──▶ render.fx.burst（一次性碎屑 / 溅起 / 烟）
 *   区块内容 ──blk.tsv 的 fx 字段 + EMIT 表──▶ render.fx.fire / drops（火把 / 火 / 岩浆 / 瀑布：按区块扫、按 delta 失效）
 *   Pose + Here + Clock ──AMBIENT 表──▶ render.fx.flutter（落叶、气泡、水下微粒…，发射区跟着相机）
 *   模组 / 实体 ──gm.fire / gm.firefly / gm.flutter──▶ 锚在实体或世界点上的光效（API 照 rgl 现有的，不改名）
 *
 * 分工：本模块在 main，只决定「什么时候、在哪、放什么」；模拟与绘制在渲染器（RenderFx，rgl 已有 fire.js / firefly.js / flutter.js）。
 *   lite 渲染器只需实现 burst，caps 里其余为 false 时本模块不发对应请求。
 * 宿主 B 出处：Particles :2731（CPU 点精灵 4000 个，重力 + 撞实心块停）；rgl/fire.js（BlockTable kind / emissive 判定发射点）、rgl/ambient.js、rgl/waterfall.js。
 *   gode 把 rgl 里「哪些方块冒火」的判定（kind 3 火把；kind 4 且发光 = 岩浆；kind 2 且发光 ≥ 8 = 火）改成 blk.tsv 的显式 fx 字段。
 * [定 11-09，用户] 挖方块碎屑照 goodLiqPG（src/render/particles.js destroy / crack / spawn）：每粒取方块贴图的 1/4 小块（Burst.tex），
 *   4×4×4 网格发射，按所在格光照着色、撞方块。搬进 rgl 时转成 Pass 写法（uniform 改 ${} getter），数值一字不改。
 * 风 [定 11-09]：落叶、烟、火星、碎屑的水平速度加 Clock.wind × windDir × c_Fx.windDrift —— 渲染器自己读 Clock，本模块只调 AMBIENT 的 rate。
 */
import type { num, XYZ, RGB, Blk, Item, Here, Clock, Pose } from './core.ts'
import type { Mod, Ev, EvName } from './index.ts'

export interface Out {}   // 纯接收端

/** 一次性粒子（照 Luanti add_particlespawner 的字段，去掉持续时间）。color 'blk' / 'item' = 取 of 的贴图均色 × 群系色（宿主 B blockBreak :2747） */
export interface Burst {
  at: XYZ; n: num
  box?: XYZ                                     // 发射盒：从 at 起的尺寸，缺省 [0.5, 0.5, 0.5] 居中
  vel: readonly [min: XYZ, max: XYZ]
  life: readonly [min: num, max: num]
  color: RGB | 'blk' | 'item'; of?: Blk | Item
  jitter?: readonly [num, num]                  // 每粒亮度倍率区间
  grav?: num; size?: num; collide?: boolean     // 缺省 c_Fx.gravity、0.14、true
  tex?: true                                    // 每粒贴 of 的贴图里随机 1/4 × 1/4 的一块（goodLiqPG TerrainParticle），不再是均色点
  grid?: num                                    // 在发射盒里按 grid³ 网格均匀放，初速从盒心往外（goodLiqPG destroy 是 4）；缺省 = 随机放
  face?: num                                    // 只从这一面贴着发（goodLiqPG crack：挖的过程中的碎屑），0..5 = −y +y −z +z −x +x
}
/** 锚点：gode 按实体 id（mat.tsv 的 id）或世界点，不传对象（连接点规则 ①）。rgl 现在收 { mob } / { ent } 对象，适配器里换 */
export type Anchor = { mob: num } | { ent: num } | { at: XYZ }
export interface FxHandle<O> { set(o: Partial<O>): void; remove(o?: { fade?: boolean; kill?: boolean }): void; readonly alive: boolean }
export interface FireOpt { type: 'torch' | 'fire' | 'lava'; anchor: Anchor; offset?: XYZ; scale?: num; tongues?: num; sparks?: num; heat?: num; life?: num; fadeIn?: num; fadeOut?: num; onLost?: 'fade' | 'remove' | 'stay' }
export interface FireflyOpt { shader: string; anchor: Anchor; offset?: XYZ; axis?: XYZ; size?: num | readonly [num, num]; color?: RGB | num; pixel?: num; fps?: num; hard?: boolean; life?: num; fadeIn?: num; fadeOut?: num; onLost?: 'fade' | 'remove' | 'stay' }
export interface FlutterOpt {
  preset?: 'leaf' | 'bubble' | 'mote' | 'flake'
  region: readonly [x0: num, y0: num, z0: num, x1: num, y1: num, z1: num]
  emit?: (cell: XYZ) => null | { at?: XYZ; color?: RGB; vel?: XYZ }   // 候选格 → 拒绝 / 改落点、颜色、初速
  rate: num; size?: readonly [num, num]; fall?: num; sway?: num; tilt?: num
  medium?: 'air' | 'water' | 'any'; onLiquid?: 'float' | 'kill' | 'pass'   // 静态：建后不可改（rgl/flutter.js 头注释）
}

/** 渲染器提供的绘制接口（gm.render.fx）。rgl 全有；lite 至少 burst */
export interface RenderFx {
  caps: { fire: boolean; firefly: boolean; flutter: boolean }
  burst(b: Burst): void
  drops(at: XYZ, open: readonly XYZ[], n: num): void           // 瀑布水滴：从下落水柱格往外 / 往下，落水面时溅起（rgl/waterfall.js）
  fire: { add(o: FireOpt): FxHandle<FireOpt>; blocks(cx: num, cz: num, list: readonly (readonly [XYZ, 'torch' | 'fire' | 'lava'])[]): void }
  firefly: { add(o: FireflyOpt): FxHandle<FireflyOpt> }
  flutter: { add(o: FlutterOpt): FxHandle<FlutterOpt> & { burst(n: num): void } }
  stats(): { burst: num; fire: num; firefly: num; flutter: num }
}

export interface Api {
  fx: { burst(b: Burst): void; stats(): ReturnType<RenderFx['stats']> }
  fire: { add: RenderFx['fire']['add'] }        // gm.fire.add / gm.firefly.add / gm.flutter.add：名字同宿主 B（:2514）
  firefly: { add: RenderFx['firefly']['add'] }
  flutter: { add: RenderFx['flutter']['add'] }
}

// ── BURSTS：事件 → 一次性粒子（defl/fx.js；函数在最后一列）。数量 × c_Fx.breakMul
const add = (P: XYZ, d: XYZ): XYZ => [P[0] + d[0], P[1] + d[1], P[2] + d[2]]
// goodLiqPG 的速度单位是格 / tick，这里换成格 / s；原式见 particles.js:85 terrain()（速度 0.06…0.18 格 / tick 朝外 + 0.1 向上，寿命 4…40 tick）
const shard = (at: XYZ, of: Blk, more: Partial<Burst>): Burst => ({ at, n: 1, color: 'blk', of, tex: true, vel: [[-2, 0, -2], [2, 4, 2]], life: [0.2, 2], size: 0.075, jitter: [0.6, 0.6], ...more })
const puff = (at: XYZ, n: num, color: RGB, s: num): Burst => ({ at, n, color, vel: [[-s, 0, -s], [s, s, s]], life: [0.4, 1.0], jitter: [0.8, 1.2] })   // 宿主 B Particles.burst
declare const eye: Pose                         // 最近一帧 pose（本模块订阅 pose 时更新；嘴前碎屑用）
export const BURSTS = {   // 一个事件一行；键必须在 mod.sub 里（index.ts 检查 ⑥）
  blk_break:    e => shard(e.P, e.blk, { box: [1, 1, 1], grid: 4, n: 64 }),                     // goodLiqPG destroy（宿主 B :2075 是 14 个均色点）
  blk_hit:      e => shard(e.P, e.blk, { face: e.face, vel: [[-0.4, 0, -0.4], [0.4, 0.8, 0.4]], size: 0.045 }),   // goodLiqPG crack（宿主 B :2063）
  p1_fluid:     e => e.feet === ':water' && e.vy < -4 ? { at: add(e.P, [0, 0.5, 0]), box: [1, 0, 1], n: 12, color: [0.2, 0.35, 0.9], of: ':water', tex: true, vel: [[-1, 2, -1], [1, 6, 1]], life: [0.4, 2], grav: 12, size: 0.04 } : null,   // goodLiqPG spawn('splash')（宿主 B :1632）
  fluid_harden: e => puff(add(e.P, [0.5, 1, 0.5]), 10, [0.4, 0.4, 0.4], 2),                    // mobsim.js:396
  explode:      e => [puff(e.P, 80, [1, 0.8, 0.4], 6), puff(e.P, 60, [0.4, 0.4, 0.4], 3)],    // Entities.explode
  mob_die:      e => puff(add(e.P, [0, 0.9, 0]), 12, [0.6, 0.6, 0.6], 2),                      // mobsim.js:337
  item_eat:     e => e.done ? null : { ...puff([eye.x - Math.sin(eye.yaw) * 0.3, eye.y - 0.2, eye.z - Math.cos(eye.yaw) * 0.3], 2, [1, 1, 1], 2), color: 'item', of: e.item },   // :2033 嘴前碎屑
} as const satisfies { readonly [E in EvName]?: (e: Ev[E]) => Burst | readonly Burst[] | null }

// ── EMIT：方块常驻发射器。blk.tsv 写 `:torch{fx torch}`，这里是 fx 名 → 发射规则。按区块扫描并缓存，delta / chunk_in / chunk_out 使缓存失效（rgl fire.js 现有做法）
export interface EmitRow { kind: 'fire' | 'drops'; when?: string; type?: 'torch' | 'fire' | 'lava'; rate?: num }
export const EMIT: Readonly<Record<string, EmitRow>> = {
  torch: { kind: 'fire', type: 'torch' },
  fire:  { kind: 'fire', type: 'fire' },
  lava:  { kind: 'fire', type: 'lava', when: '上方是空气' },                 // 只在表面冒火星
  fall:  { kind: 'drops', when: 'meta ≥ 8（下落水柱）且一侧有空气', rate: 1 },   // 瀑布（rgl/waterfall.js：每 0.5 s 扫玩家附近，密度 c_Fx.fallDrops）
}

// ── AMBIENT：跟着相机的体积发射区（defl/ambient.js；rgl/ambient.js 的三个发射器）。每帧求 region 与 rate
export interface AmbCtx { pose: Pose; here: Here; clock: Clock }
export type AmbRow = readonly [id: string, opt: Omit<FlutterOpt, 'region' | 'rate'>, region: (c: AmbCtx) => FlutterOpt['region'], rate: (c: AmbCtx) => num]
const around = (c: AmbCtx, r: num, y0: num, y1: num) => [c.pose.x - r, c.pose.y + y0, c.pose.z - r, c.pose.x + r, c.pose.y + y1, c.pose.z + r] as const
const wet = (c: AmbCtx) => c.here.fluid === ':water'
export const AMBIENT: readonly AmbRow[] = [
  ['leaf',   { preset: 'leaf' },   c => around(c, 12, -4, 6), c => wet(c) ? 0 : 6 * (1 + c_Fx.windLeaf * c.clock.wind)],   // emit：树叶格且下方是空气 → 从底面落，颜色 = 叶群系色（混 leafColor、转色 leafAutumn）；大风落得多
  ['bubble', { preset: 'bubble' }, c => around(c, 0.15, -0.3, 0), c => wet(c) ? 2.4 : 0], // 嘴前（眼下 0.15）；rate 取 flutter.js 预设
  ['mote',   { preset: 'mote' },   c => around(c, 6, -2, 2), c => wet(c) ? 25 : 0],
]   // 雨雪不在这里：降水由渲染器按 Clock 画（render.ts c_Precip，一次实例绘制），雨点打水面的涟漪、地上的水花也在渲染器里

export const c_Fx = {
  gravity: 18, breakMul: 1, max: 4000,          // 宿主 B c_Particles、Particles.MAX
  fireFx: 1, ambientFx: 1, fallDrops: 1,        // rgl P 里的同名键搬到这里（面板「光与粒子」文件夹，s09 §5）
  leafRate: 1, leafSize: 1, leafFall: 1, leafSway: 1, leafMix: 0, leafColor: 0x5a8f2a, leafAutumn: 0.22, leafAutumnColor: 0xd9962a,
  bubbleRate: 1, moteRate: 1,
  bubbleHi: 0.3, bubbleAlpha: 0.45, bubbleRim: 0.5, firefly: true,   // rgl P 里余下的粒子外观键（render.ts TOPICS 不再列）
  windDrift: 1.5,                               // [新] 风力 1 时粒子的水平漂移（格 / s）
  windLeaf: 2,                                  // [新] 风力 1 时落叶率 × (1 + 本值)
}

export const mod = {
  id: 'fx', where: 'main',
  off: '没有粒子（挖方块碎屑、萤火虫、落叶、火星、水花），其余不受影响',
  doc: '触发与放置在 main；模拟与绘制在渲染器（RenderFx）',
  emit: {},
  sub: ['pose', 'here', 'clock', 'chunk_in', 'chunk_out', 'delta',                       // 发射区、常驻发射器缓存
    'blk_break', 'blk_hit', 'p1_fluid', 'fluid_harden', 'explode', 'mob_die', 'item_eat'],   // = BURSTS 表第一列
  depends: ['render', 'world', 'pane'],
  tables: ['fx.js', 'ambient.js'], c_: ['$Fx'], save: [],
} as const satisfies Mod
