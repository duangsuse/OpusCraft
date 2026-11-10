/**
 * gode/flow/sim.ts —— 世界模拟：流体 · 火 · 光照 BFS · 下落方块 · 随机 tick [定 11-09，用户]
 *
 *   delta（src ≠ gen / load）──▶ 光照：增量 BFS（同步，当帧完成）──▶ light 事件 ──▶ render 重网格
 *                           └─▶ 排程：本格 + 6 邻（流体 / 下落 / 火）──▶ 调度表
 *   chunk_in ──▶ 光照接缝：与 4 邻的边界互相播种（s01 §4）；把存档里该区块的待办 tick 放回调度表
 *   tick（20 Hz）──▶ 跑到期的待办（流体有预算 + 远处停放）+ 随机 tick 的 onRandom（含积雪）──▶ gm.world.set(…, 'sim') ──▶ 又是 delta
 *   lightning ──▶ 落点点火（c_Fire.bolt）
 *
 * 位置 [定 11-09，s14 Q-2]：M1–M3 留 main；只经 delta / tick / gm 与外界相连，以后整体搬进 sim worker 时调用方不变。
 * 宿主 B 出处：Scheduler :525 · Lighting（gls.js:15，含 seedFromNeighbors / propagate / unpropagate / onBlockChanged）·
 *   Fluids / Fire / runScheduledTick / RandomTicks（mobsim.js:377–594）· blockChanged 订阅（mobsim.js:513）。
 * 与宿主 B 的差别：
 *   - 光照从 setBlock 里的直接调用改成订阅 delta；改 meta（门、液位）也走 delta，不再有 setMeta 旁路（s14 D-2）。
 *   - 随机 tick 的行为是 on.js 的 onRandom 钩子，抽样参数是 blk.tsv 的列（schedRandom 等）；11-09 曾改成 ABM 表（照 Luanti register_abm），[定 11-10，用户] 并回 onRandom，只剩这一条路（hooks.ts TODO 2）。
 *   - 调度器不再读 Game.camera：停放判断用订阅来的 pose（s14 D-5）。
 */
import type { num, XYZ, Blk } from './core.ts'
import type { Mod } from './index.ts'
import type { BlockView } from './hooks.ts'
import type { GgApi as WeatherApi } from './weather.ts'

export interface Out {
  light: { cx: num; cz: num; mask: num }                  // 光照变了的段（16 段位掩码）；render 按它重网格（ChunkSource 'light' 事件）
  fluid_harden: { P: XYZ; from: Blk; to: Blk }            // 岩浆遇水：黑曜石 / 圆石（粒子 + 嘶声）
  fluid_wash: { P: XYZ; blk: Blk }                        // 流体冲掉火把 / 作物 → ents 生成掉落物（宿主 B Fluids.wash）
  fire_burn: { P: XYZ; blk: Blk }                         // 可燃块被烧掉
  fire_out: { P: XYZ; why: 'rain' | 'age' | 'support' }
  blk_fall: { P: XYZ; blk: Blk }                          // 沙 / 砾石开始下落 → ents 生成下落方块实体
  grow: { P: XYZ; blk: Blk; stage: num }                  // 作物 / 树苗 / 仙人掌长了一级（给模组：KubeJS 的 randomTick 事件）
}

export interface Api {
  sim: { schedule(P: XYZ, delay: num, kind: Tick): void }  // 模组 / on.js 自己排 tick（Luanti 的 node timer）
}
export interface GgApi {
  sim: {
    relight(cx: num, cz: num): void                       // 整块重算（改了 emit / opacity 表之后）
    stats(): { pending: num; parked: num; lightQ: num; ms: num }   // F3「Liq +pending rm parked」
  }
}

export type Tick = 'fluid' | 'fall' | 'fire' | `on.${string}`   // on.<名字> = defl/on.js 里同名方块的 onSched 钩子（hooks.ts）

// ── 光照（s04 §4）：方块字段 emit / opacity / opaque 来自 blk.tsv
export const LIGHT = {
  levels: 15, torch: 14, furnace: 13,                     // IDEA
  decay: '每格 −1，再减 opacity（水 2、树叶 1）；不透明块挡光',
  skyDown: '天空光向下传且源为 15 时不衰减（只减 opacity）',
  mix: '天空光与方块光分开存，合成在 shader：sky·天色 + blk·暖色（加色，不取同一灰度）',
  seam: 'chunk_in 时与已加载的 4 邻互相播种边界格（宿主 B seedFromNeighbors），解决接缝暗缝（M1-8 验收）',
  where: '初始光照：slicer 生成时算（w/light.js，块外当黑）；增量与接缝：本模块（main）',
} as const
export const c_Light = { queue: 1 << 18, removeQ: 1 << 16, budgetMs: 4 /* 一帧最多花在接缝播种上的时间，余下下帧继续 */ }

// ── 调度（宿主 B Scheduler）：流体每 tick 有预算，按到玩家距离排序；海平面以下、视野外的流体格停放，每 parkEvery tick 再看一次
export const c_Sched = { fluidBudget: 320, parkEvery: 10, parkMargin: 2, underSeaFovOnly: true }

// ── 流体（defl/fluid.json；宿主 B FLUID :377 + 注释里的规则）
//    meta 0 = 源，1…7 = 流动（7 最薄），≥ 8 = 下落水柱（s04 §2）；强度 = 源 / 下落 8，流动 8 − meta；每格衰减 drop
export const FLUID: Readonly<Record<Blk, { delay: num; drop: num; seek: num; renew: boolean }>> = {
  ':water': { delay: 5,  drop: 1, seek: 0, renew: true },   // renew：两侧有 ≥ 2 个源且下面实心 / 是源 → 变源（无限水）
  ':lava':  { delay: 25, drop: 2, seek: 0, renew: false },
}
export const FLOW_RULES = [
  '能往下流就只往下流（悬空的源要有 ≥ 3 个源邻居才同时横流）',
  '落地后：源总是横流；流动格只在下面不是「坑」（同种流体 / 可流入）时横流',
  'seek > 0：只朝最近的落差方向流（MC 坡度搜索，水 4 / 岩浆 2）；0 = 向所有空侧流',
  '可冲毁 = 非实心、非流体、且 replaceable 或 needsSupport → fluid_wash（雪层除外不掉落）',
] as const
/** 硬化：[碰到它的, 被碰的格, 被碰的是源吗, 变成]，先命中先用。「碰到」= 流入该格，或该格自己 tick 时四周 + 上方有它
 *  （宿主 B Fluids.interact 与 tick 开头的 hardenDirs）。每次硬化发 fluid_harden */
export const HARDEN: readonly (readonly [by: Blk, cell: Blk, source: boolean | '*', to: Blk])[] = [
  [':water', ':lava',  true,  ':obsidian'],
  [':water', ':lava',  false, ':cobblestone'],
  [':lava',  ':water', '*',   ':cobblestone'],
]

// ── 火（blk.tsv 字段 flammable / burnTo；宿主 B Fire :472）
export const c_Fire = {
  delay: [10, 30] as const,             // 下次 tick（tick）
  maxAge: [15, 25] as const,            // 年龄（meta）超过就灭
  burnChance: 300,                      // 每 tick 每个可燃邻居被烧的概率 = flammable / 300；烧后 50% 变火 50% 变空气
  spreadChance: 0.25,                   // 附近（±1, −1…+2）随机一格：是空气且挨着可燃物 → 点着
  rainOut: true,                        // 下雨且露天（天光 15）就灭 —— 读 gg.weather.at
  bolt: { ignite: true, spread: 4 },    // [定 11-09，用户：雷击点火 + 伤害] 落点上方点火，再在 ±1 格里随机点 spread 次（MC）；伤害在 p1 / ents（hurt.js 'lightning' 行）
}

// ── 下落方块（blk.tsv 字段 gravity）：下面不实心就落；下面是非流体的非空气块 → 先挖掉（宿主 B 掉落为物品）
export const c_Fall = { delay: 2 }

// ── 随机 tick 并入 onRandom [定 11-10，用户：只剩一条路；原 ABM 表（11-09）取消]
//    抽样参数是 blk.tsv 的列（方块表保持纯数据），行为是 on.js 的 onRandom 钩子（hooks.ts）。每 tick 在玩家周围 radius 个区块里，每段随机取 perSection 格（c_RandomTick）：
//      schedRandom  抽到之后真正执行的概率（0 / 缺省 = 不抽；原 ABM 的 chance）  minLight  抽到时上方光照不足就跳过
//      grow         改了格子就发 grow 事件（给模组：KubeJS 的 randomTick）        top  按列取：每区块每 tick 一列，给的是该列露天最高的格（MC 的降水高度）
//    defl 层（默认模组）的 onRandom 由 sim 自己跑（它有 AbmCtx 的辅助函数），拿 AbmCtx（BlockView 的超集），写入同 tick 立即生效（src 'sim'，hooks TODO 3）；
//    模组层的由 sim 调 gg.hooks.run('onRandom') 跑，拿 BlockEvent、写入入队。同一方块两层都有时先默认层、后模组层。
export interface AbmCtx extends BlockView {
  metaAt(P: XYZ): num; get(P: XYZ): Blk; set(P: XYZ, b: Blk): void; setMeta(P: XYZ, m: num): void   // set 一律带 src 'sim'，立即生效
  lightAbove(P: XYZ): num               // max(方块光, 天光 × 昼夜系数)（宿主 B RandomTicks.lightAbove）
  blkLight(P: XYZ): num
  solid(P: XYZ): boolean                // blk.tsv solid 列
  wx: WeatherApi['weather']['at']       // = gg.weather.at：这一格下的是什么、多大
  near(r: num, ...b: readonly Blk[]): boolean
  byFlammable(P: XYZ): boolean          // 6 邻有 flammable 方块（宿主 B Fire.flammableNeighbor）
  dig(P: XYZ): void                    // 挖掉并按 blk.tsv drops 掉落（同 fluid_wash 的路径）
  tree(kind: string): void              // gg.slicer.tree → 逐格 set（树苗长成树）
}
/** blk.tsv 的随机 tick 列（宿主 B RandomTicks 的值；schedRandom = 原 ABM 的 chance） */
export interface RandomCol { schedRandom: num; minLight?: num; grow?: true; top?: true }
const saplings = [':oak_sapling', ':birch_sapling', ':spruce_sapling'] as const
const leaves = [':oak_leaves', ':birch_leaves', ':spruce_leaves'] as const
export const RANDOM: Readonly<Record<Blk, RandomCol>> = {
  ':grass_block': { schedRandom: 1 }, ':farmland': { schedRandom: 1 },
  ':wheat': { schedRandom: 1, minLight: 9, grow: true },
  ':oak_sapling': { schedRandom: 0.15, minLight: 9, grow: true }, ':birch_sapling': { schedRandom: 0.15, minLight: 9, grow: true }, ':spruce_sapling': { schedRandom: 0.15, minLight: 9, grow: true },
  ':oak_leaves': { schedRandom: 0.3 }, ':birch_leaves': { schedRandom: 0.3 }, ':spruce_leaves': { schedRandom: 0.3 },
  ':lava': { schedRandom: 0.1 }, ':cactus': { schedRandom: 0.05, grow: true },
  ':air': { schedRandom: 1, top: true }, ':snow': { schedRandom: 1, top: true },   // 积雪：按列取露天最高格；雪层融化也在这里判定（原来雪层另按任意位置抽，现在只在被按列抽到时）
  ':ice': { schedRandom: 1 },
}
const at = (P: XYZ, dx: num, dy: num, dz: num): XYZ => [P[0] + dx, P[1] + dy, P[2] + dz]
const ri = (c: AbmCtx, a: num, b: num) => a + Math.floor(c.rng() * (b - a + 1))
type Rand = { onRandom(c: AbmCtx): void }
const sapling: Rand = { onRandom(c) { c.set(c.P, ':air'); c.tree(c.blk.replace(/^:|_sapling$/g, '')) } }                                   // 树苗：光照 ≥ 9，15% 长成树
const leaf: Rand = { onRandom(c) { if (!c.near(4, ':oak_log', ':birch_log', ':spruce_log')) c.dig(c.P) } }                                   // 树叶：4 格内没有原木 → 30% 凋落
/** defl/on.js 的默认内容（只含 onRandom；键 = RANDOM 里的方块）。注释是原 ABM 行的说明 */
export const ON_DEFAULT: Readonly<Record<Blk, Rand>> = {
  ':grass_block': { onRandom(c) {   // 草方块：被盖住变土；亮处向周围土蔓延
    const up = c.get(at(c.P, 0, 1, 0)); if (up !== ':air' && up !== ':short_grass') { c.set(c.P, ':dirt'); return }   // 宿主 B：上方不透明或流体（这里简写）
    if (c.lightAbove(c.P) < 9) return
    for (let i = 0; i < 4; i++) { const n = at(c.P, ri(c, -1, 1), ri(c, -3, 1), ri(c, -1, 1)); if (c.get(n) === ':dirt' && c.lightAbove(n) >= 4) c.set(n, ':grass_block') }
  } },
  ':farmland': { onRandom(c) {      // 耕地：4 格内有水则湿（meta 7），否则逐级变干；干透且上面没作物 → 土
    if (c.near(4, ':water')) { if (c.meta !== 7) c.setMeta(c.P, 7) } else if (c.meta > 0) c.setMeta(c.P, c.meta - 1); else if (c.get(at(c.P, 0, 1, 0)) !== ':wheat') c.set(c.P, ':dirt')
  } },
  ':wheat': { onRandom(c) {         // 小麦：光照 ≥ 9 时长一级，湿地 30% / 干地 12%
    if (c.meta < 7 && c.rng() < (c.metaAt(at(c.P, 0, -1, 0)) > 0 ? 0.3 : 0.12)) c.setMeta(c.P, c.meta + 1)
  } },
  ...Object.fromEntries(saplings.map(k => [k, sapling])), ...Object.fromEntries(leaves.map(k => [k, leaf])),
  ':lava': { onRandom(c) { const n = at(c.P, ri(c, -1, 1), ri(c, 0, 1), ri(c, -1, 1)); if (c.get(n) === ':air' && c.byFlammable(n)) c.set(n, ':fire') } },   // 岩浆：10% 点着附近挨着可燃物的空气
  ':cactus': { onRandom(c) {        // 仙人掌：上方空气且不足 3 高 → 5% 长高
    let h = 1; while (c.get(at(c.P, 0, -h, 0)) === ':cactus') h++
    if (h < 3 && c.get(at(c.P, 0, 1, 0)) === ':air') c.set(at(c.P, 0, 1, 0), ':cactus')
  } },
  ':air': { onRandom(c) {           // 积雪：该格在下雪 → 下面实心就放一层雪 [定 11-09，用户：着色器雪盖 + 真实雪层]
    const w = c.wx(c.P); if (w.precip !== 'snow' || w.rain < c_Snow.minRain || c.rng() > c_Snow.chance) return
    if (c.solid(at(c.P, 0, -1, 0))) c.set(c.P, ':snow')
  } },
  ':snow': { onRandom(c) {          // 雪层：方块光 ≥ 12 融化；在下雪就加一层（meta = 层数 − 1，到 c_Snow.max 为止）
    if (c.blkLight(c.P) >= 12) { c.set(c.P, ':air'); return }
    const w = c.wx(c.P); if (w.precip !== 'snow' || w.rain < c_Snow.minRain || c.rng() > c_Snow.chance) return
    if (c.meta < c_Snow.max - 1) c.setMeta(c.P, c.meta + 1)
  } },
  ':ice': { onRandom(c) { if (c.blkLight(c.P) >= 11) c.set(c.P, ':water') } },   // 冰：方块光 ≥ 11 化成水
}
export const c_RandomTick = { radius: 4, perSection: 3 }   // 宿主 B 是每区块 24 格（H 128）；gode H 256 = 16 段，按 MC 每段 3 格
/** 积雪（MC 一次下雪最多堆到 1 层；这里允许慢慢堆高）。雪层走 delta，所以进 pile 存档；范围限于 c_RandomTick.radius，存档不会无限涨 */
export const c_Snow = { chance: 0.25, minRain: 0.2, max: 3 }

export const mod = {
  id: 'sim', where: 'main', catalog: 'defl', axis: 'play', ms: 'M1-8',
  off: '世界静止：流体、火、下落方块、积雪、随机 tick、光照增量都不动（初始光照仍由 slicer 给）',
  doc: '20 Hz；光照增量当帧完成，其余按调度表；接口不依赖 main（以后可进 sim worker）',
  emit: { light: 'edge', fluid_harden: 'edge', fluid_wash: 'edge', fire_burn: 'edge', fire_out: 'edge', blk_fall: 'edge', grow: 'edge' },
  sub: ['delta', 'chunk_in', 'chunk_out', 'tick', 'clock', 'pose', 'pause', 'lightning', 'hook_sched'],   // hook_sched：模组钩子的 e.schedule（hooks.ts）；clock：昼夜系数；pose：停放判断；pause：tpause 的「暂停模拟」；lightning：点火
  depends: ['world', 'slicer', 'weather', 'hooks', 'pane'],  // weather.at：雨灭火、积雪；hooks.run：到期的 onSched、抽样到的 onRandom
  tables: ['fluid.json', 'on.js', 'blk.tsv'], c_: ['$Light', '$Sched', '$Fire', '$Fall', '$RandomTick', '$Snow'],
  save: ['pending'],                    // 待办 tick → pending.tsv（s06 M2-3）：'@x,z^y  fluid 3'；光照不存（s04 §4）
} as const satisfies Mod
