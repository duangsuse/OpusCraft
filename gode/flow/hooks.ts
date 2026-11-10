/**
 * gode/flow/hooks.ts —— 模组 API 总章：钩子何时触发、拿到什么、怎么写回 [议 11-10；来源 doc/IDEA-sys.md L99「理解体素世界」]
 *
 * 一页读懂：
 *   ① 钩子 = 事后回调 + 局部快照 + 命令入队。多数钩子拿到 BlockEvent：P、blk、六面邻块直接给（face6），更大范围 region(r) 惰性拷贝。
 *      模组与模拟同线程（main），所以快照是同步拷贝；SAB 只读快照只是补充（worker 里的模组、以后 sim 下沉 worker，§线程）。
 *   ② 写操作全部是命令（Cmd）：钩子里调 e.setBlock / spawn / schedule 只是入队，在 tick_end 事件（game 在 tick 的全部订阅者跑完后发）统一应用（setBlock → world.set(…, 'mod') → delta）。
 *      钩子读到的永远是本 tick 开头的世界；mod 写出的 delta 触发的 onFaceBlkChanged 等级联一律下一 tick，不递归。
 *      worker 模组的消息（s07 M-2：{give / tp / time / weather / spawn / popup / set}）与钩子是同一个 Cmd，走同一个队列。
 *      每个动词谁执行见 CMD_ROUTE：世界相关的 hooks 自己执行（依赖 world p1 ents pane）；落在可停模组的动词发成 hook_* 事件，由 owner 订阅，
 *      owner 停用时：time / weather 唤醒它（Mod.wake，kernel）[定 11-10，用户]；sched 丢弃（sim 停了世界就是静止的）；popup 的 owner 是 kernel，不可停。
 *   ③ 触发分五类（HOOKS 表）：即时（玩家 / 邻居变化，低频；另有同步的否决钩子 canPlace / canBreak）· 调度（schedule 之后才有 onSched）· 随机（只有 blk.tsv 声明 schedRandom 的方块）
 *      · 组件（实体不做逐实体回调，引擎每 tick 批量 fn(entities)）· 生成（phase 固定，纯函数 + 播了种子的 RNG）。
 *   ④ 钩子表是数据：defl/on.js（按 BIME 标记挂到 blk.tsv / mob.json 的同名行，s05 §2）、defl/comp.js（组件）；kernel 的表叠加规则照旧（s07 §4）。
 *      钩子抛错 / 超预算 / 命令被拒 → hook_err，该钩子本 tick 停用，不拖垮别的。
 *
 * 谁调谁（没有环）：hooks 自己订阅 delta（→ onFaceBlkChanged）、blk_place / blk_break（→ onPlace / onBreak）、blk_touch（→ onEntityCollide）；
 *   interact 调 gg.hooks.run('onTap')（要返回值，s07 M-4 只在 main）；sim 的调度表到期 / 随机抽样调 gg.hooks.run('onSched' | 'onRandom')；
 *   e.schedule() 入队后由 hooks 发 hook_sched，sim 订阅并写进调度表（hooks 不依赖 sim：sim 是可停模组，核心不能靠它）。
 *
 * 与已有设计的差别（待逐个子系统对照时确认）：
 *   - s05 §2 的 on.js 钩子签名 ontap(p1, P) / ondie(by) / onRandomTick(P, meta) 改成单参数 BlockEvent，名字改驼峰 [定 11-10，用户]
 *   - sim.ts 的 ABM 表并入 onRandom；defl 层的 AbmCtx 是 BlockView 读侧的超集，仍同 tick 立即写（TODO 2、3）
 *   - s02 的 gen 是整块一个函数，这里加 phase 钩子（TODO 5，s02 §7）
 * TODO(decide) 默认值已写明：
 *   1. [定 11-10，用户] 钩子命名：驼峰 onPlace / onTap / onSched / onDie …（IDEA-sys）取代 s05 的 ontap / ondie / onRandomTick；worker 消息 onhit / ondie 同改 onHit / onDie。
 *   2. [定 11-10，用户] 随机 tick 只剩一条路：行为 = on.js 的 onRandom；抽样参数是 blk.tsv 的列（schedRandom / minLight / grow / top，sim.ts RANDOM）。原 ABM 表取消，默认内容成了 defl/on.js（sim.ts ON_DEFAULT）。
 *   3. [定 11-10，用户同意默认] defl 层（默认模组）的 onRandom 由 sim 自己跑，拿 AbmCtx（BlockView 的超集），写入同 tick 立即生效（src 'sim'，引擎内部可信）；模组层经 gg.hooks.run、一律拿 BlockEvent、写入入队。
 *   4. [定 11-10，用户同意默认] 命令里 setBlock 到未加载区块：丢弃并 hook_err（不进挂起表）。
 *   5. [定 11-10，用户] 生成钩子登记 = mod.tsv 的 where = 'slicer'（脚本在每个 slicer worker 里跑，gm 是只含 on({ genChunk }) 的受限代理）；
 *      生成器在 meta.phases 声明自己已做的阶段（缺省 = 整块一体 = terrain carve surface decorate，不含 structure），模组钩子在该阶段之后追加（s02 §7）。
 *   6. [定 11-10，用户同意默认] worker 模组的 region(r)：有 SAB 时读共享只读视图，没有就抛 'no-region'（要大范围就写在 main 的 on.js 里）。
 *   联机 [定 11-10，用户同意]：钩子里的写操作只在权威端跑（net_state 的 role 为 'client' 时 on.js / comp.js 一律不跑），客户端只应用 Δ 日志；
 *      客户端的放置 / 破坏作为 op 发给权威，canPlace / canBreak 在权威端问，被否决回 ack { seq: null }（net.ts）。
 */
import type { num, XYZ, Blk, Item, Mob, Stat, Src, Wx } from './core.ts'
import type { Mod, EvName } from './index.ts'
import type { Tick } from './sim.ts'

export interface Out {
  hook_err: { hook: string; mod: string; msg: string }            // 钩子抛错 / 超 c_Hooks.budgetMs / 命令被拒（hud 控制台、面板「模组」红点）
  hook_sched: { P: XYZ; delay: num; kind: Tick }                  // e.schedule 的命令应用时发出，sim 订阅写进调度表（sim 停用 = 丢弃）
  hook_time: { hour: num }                                        // {time} 命令：weather 订阅并设墙上时钟；weather 停用时被它的 Mod.wake 唤醒
  hook_weather: { state: Wx; ticks?: num }                        // {weather} 命令：同上
  hook_popup: { url: string; w: num; h: num }                     // {popup} 命令：kernel 订阅（核心，不可停），开弹框 iframe（s07 §5）
}

// ── 快照（只读；main 里是同步拷贝，worker 里是序列化子集）
export interface PlayerSnapshot { who: string /* '' = 服主，同 gm.p1.now */; P: XYZ; yaw: num; pitch: num; held: Item | null; stat: Stat; mode: string; sneaking: boolean }
/** 区块之外要更大范围时再取：半径 r 格的立方体（r ≤ c_Hooks.regionMax），读侧与 sim.ts 的 AbmCtx 同名 */
export interface Region {
  readonly origin: XYZ; readonly r: num; readonly kind: 'copy' | 'sab'
  get(P: XYZ): Blk; meta(P: XYZ): num; blkLight(P: XYZ): num; sky(P: XYZ): num; biome(P: XYZ): string
  solid(P: XYZ): boolean; near(r: num, ...b: readonly Blk[]): boolean
}
/** face6 的顺序与 host.ts aim.face 同（TODO：s04 钉死 0..5 的朝向） */
export type Face6 = readonly [Blk, Blk, Blk, Blk, Blk, Blk]
export interface BlockView {
  readonly P: XYZ; readonly blk: Blk; readonly meta: num
  readonly face6: Face6                                           // 直接给，不用再查
  rng(): num                                                      // 种子 = hash(seed, tick, P)：同一世界同一 tick 同一格永远同一序列（onRandom / onSched 的随机选择可复现）
  readonly p1?: PlayerSnapshot
  region(r: num): Region                                          // 惰性拷贝；hooks 在 c_Hooks.budgetMs 内每个钩子最多取 regionMax 次
}

// ── 命令：写操作的唯一形式（队列、worker 消息、gm.test 都用它）
export type Cmd =
  | { setBlock: { P: XYZ; blk: Blk } }                            // blk 可带状态 ':wheat{age 7}'，meta 不再单独写（Delta.v 里 type | meta<<12）
  | { spawn: { mob: Mob; P: XYZ; meta?: Readonly<Record<string, unknown>> } }
  | { sched: { P: XYZ; delay: num; kind: Tick } }
  | { ent: { id: num; v?: XYZ; hp?: num; meta?: Readonly<Record<string, unknown>> } }   // 组件写回实体（EntView 是快照，不能直接改）
  | { give: { item: Item; n: num; who?: string } } | { tp: { to: XYZ | `@${string}`; who?: string } } | { time: num } | { weather: Wx }   // who 缺省 = ''（服主，p1.now 同口径）
  | { popup: { url: string; w: num; h: num } } | { set: Readonly<Record<string, unknown>> }   // 后两项与 s07 M-2 同：popup 与 gm.pane 路径写入
export interface Writer {
  setBlock(P: XYZ, blk: Blk): void
  spawn(mob: Mob, P: XYZ, meta?: Readonly<Record<string, unknown>>): void
  schedule(P: XYZ, delayTicks: num, kind?: Tick): void           // kind 缺省 = 'on.<本方块名>'，到期调 onSched
  cmd(c: Cmd): void                                               // 其余命令
}
export interface BlockEvent extends BlockView, Writer {}

/** 每个命令动词谁执行 [定 11-10，用户：time / weather 停用就唤醒，popup 不可停]。键与 Cmd 的动词一一对应（tsc 检查），hooks 在 tick_end 按入队顺序执行 */
type Verbs<C> = C extends unknown ? keyof C & string : never
export const CMD_ROUTE = {
  setBlock: 'hooks → gm.world.set(…, src)',
  spawn:    'hooks → gm.put',
  ent:      'hooks → gm.ents.set',
  give:     'hooks → gm.p1.now(who).bag.give',
  tp:       'hooks → gm.p1.now(who).tp',
  set:      'hooks → gm.pane.set（白名单，s07 M-2）',
  sched:    'hook_sched → sim（sim 停用 = 丢弃）',
  time:     'hook_time → weather（停用则唤醒，Mod.wake）',
  weather:  'hook_weather → weather（停用则唤醒，Mod.wake）',
  popup:    'hook_popup → kernel（核心，不可停）',
} as const satisfies Record<Verbs<Cmd>, string>

// ── ① ② ③ 方块钩子（defl/on.js 里挂在 blk.tsv 同名行上；返回值只有 onTap 有）
export interface BlockHooks {
  onPlace?(e: BlockEvent & { by: Mob; face: num }): void
  onBreak?(e: BlockEvent & { by: Mob }): void
  onTap?(e: BlockEvent & { by: Mob; face: num }): boolean | void  // 返回真 = 已处理，不再走默认破坏（IDEA：返回空才走破坏）
  canPlace?(e: BlockEvent & { by: Mob; face: num; placing: Blk }): boolean | void   // 否决钩子 [定 11-10，用户]：返回 === false 就阻止，interact 在写 delta 之前问。P = 要放的格，placing = 要放的方块
  canBreak?(e: BlockEvent & { by: Mob; face: num }): boolean | void  // 同上；挂在 ':*' 行上的对所有方块生效（保护区），先问方块自己的行再问 ':*'，任一 false 即否决
  onFaceBlkChanged?(e: BlockEvent & { face: num; was: Blk }): void
  onEntityCollide?(e: BlockEvent & { mob: Mob; id: num; v: XYZ }): void
  onSched?(e: BlockEvent & { kind: Tick }): void
  onRandom?(e: BlockEvent): void                                  // 只有 blk.tsv 里 schedRandom 为真的方块才会被抽到
}
export type HookName = keyof BlockHooks
/** run 的第三个参数：该钩子的事件参数里 BlockEvent 之外的部分（by、face、placing、kind …），由调用方给；P 处的 BlockEvent 由 hooks 构造 */
export type Extra<H extends HookName> = Omit<Parameters<NonNullable<BlockHooks[H]>>[0], keyof BlockEvent>
/** defl/on.js 的形状：键 = BIME 标记（':torch' '#zombie'），值 = 钩子（s05 §2；生物 / 实体的 on { blk_Any … } 与 onDie 留给 ents 对照时定）。
 *  特殊键 ':*' = 对任何方块生效（Luanti 的 is_protected / register_on_placenode）。是否有 onEntityCollide / onRandom 由 blk.tsv 的 touch / schedRandom 列声明（ents、sim 直接读表，不依赖 hooks） */
export type OnTable = Readonly<Record<string, BlockHooks>>

/** 触发表：谁在什么时候调。by = 触发它的事件（hooks 自己订阅），'call' = 对方同步调 gg.hooks.run（要返回值或带抽样结果）。
 *  index.ts 检查 by 的事件都在 hooks.sub 里、键与 BlockHooks 一致 */
export const HOOKS = {
  onPlace:          { by: 'blk_place',  freq: 'edge',   ret: 'void' },
  onBreak:          { by: 'blk_break',  freq: 'edge',   ret: 'void' },
  onTap:            { by: 'call',       freq: 'edge',   ret: 'boolean' },   // interact 在破坏之前同步调
  canPlace:         { by: 'call',       freq: 'edge',   ret: 'boolean' },   // interact 在写 delta 之前同步问；=== false 否决
  canBreak:         { by: 'call',       freq: 'edge',   ret: 'boolean' },
  onFaceBlkChanged: { by: 'delta',      freq: 'sync',   ret: 'void' },      // 每个 delta 扇出 6 邻，只发给有这个钩子的方块；src 'gen' / 'load' 不触发
  onEntityCollide:  { by: 'blk_touch',  freq: 'edge',   ret: 'void' },      // 实体进入该格那一刻（ents 发）
  onSched:          { by: 'call',       freq: 'tick',   ret: 'void' },      // sim 的调度表到期时调
  onRandom:         { by: 'call',       freq: 'tick',   ret: 'void' },      // sim 按 c_RandomTick 抽样调
} as const satisfies Record<HookName, { by: EvName | 'call'; freq: string; ret: 'void' | 'boolean' }>

// ── ④ 组件：实体不做逐实体回调（IDEA-sys）。mob.json 的 comp 列写组件名，引擎每 tick 批量调一次 run(entities)
export interface EntView { readonly id: num; readonly mob: Mob; readonly P: XYZ; readonly v: XYZ; readonly hp: num; readonly meta: Readonly<Record<string, unknown>> }
export interface CompCtx extends Writer {
  readonly tick: num; readonly p1: PlayerSnapshot
  rng(): num; blk(P: XYZ): Blk; solid(P: XYZ): boolean; region(r: num, c: XYZ): Region
}
/** every：每 N tick 跑一次（默认 1）；near：只含离 p1 这么近的实体（默认 c_Hooks.compNear，远处实体不模拟） */
export interface Component { every?: num; near?: num; run(es: readonly EntView[], c: CompCtx): void }
export const COMP: Readonly<Record<string, Component>> = {
  'ai:wander':  { every: 10, run(es, c) { for (const e of es) if (c.rng() < 0.3) c.cmd({ ent: { id: e.id, v: [c.rng() - 0.5, 0, c.rng() - 0.5] } }) } },   // 宿主 B mobsim.js 闲逛段
  'ai:hostile': { run(es, c) { for (const e of es) { const [px, , pz] = c.p1.P, [x, , z] = e.P; c.cmd({ ent: { id: e.id, v: [Math.sign(px - x) * 0.1, 0, Math.sign(pz - z) * 0.1] } }) } } },   // 示意：追击段照宿主 B Mobs.update，ATK / SPD 读 e.meta
}

// ── ⑤ 世界生成：纯函数 + 播了种子的 RNG（IDEA-sys L121）。phase 固定，跨块写走 outside（s02 §3）
export type GenPhase = 'terrain' | 'carve' | 'surface' | 'decorate' | 'structure'
export const GEN_PHASES: readonly GenPhase[] = ['terrain', 'carve', 'surface', 'decorate', 'structure']
/** 规范区块缓冲（s02 §1）：blocks 是 u16 YZX */
export interface ChunkBuf { blocks: Uint16Array; biomes: Uint8Array; heights: Int16Array }
export interface GenCtx {
  readonly seed: string; readonly cx: num; readonly cz: num; readonly phase: GenPhase; readonly sea: num
  rng(): num                                                       // 种子 = hash(seed, cx, cz, phase)：同块同阶段永远同一序列
  v(blk: Blk): num                                                 // 名字 → 规范 u16（运行时 LUT，不认识 = 0 + hook_err），模组不写生成器的私有 id
  biome(x: num, z: num): string; height(x: num, z: num): num       // 当前缓冲里的值（terrain 之前没有）
}
/** 返回 outside（Int32Array，每 5 个一组 [x, y, z, v, soft]，s02 §3）：structure 阶段是它的主要用途 */
export type GenHook = (phase: GenPhase, buf: ChunkBuf, c: GenCtx) => { outside?: Int32Array } | void
/** 生成器 meta 里的 phases：它自己已经做了哪些阶段（缺省 = terrain carve surface decorate）；模组的 genChunk 在对应阶段之后追加 */
export interface GenMetaPhases { phases?: readonly GenPhase[] }

// ── 线程（IDEA-sys L101）：main 的钩子拿同步快照；where: 'worker' 的模组拿序列化子集（P / blk / face6 / p1），region(r) 见 TODO 6；
//    where: 'slicer' 的模组只有 genChunk。SAB 只读快照是补充，协议不依赖它（s01：不强制 COOP / COEP）。
export const c_Hooks = {
  budgetMs: 2,          // 一个 tick 里全部钩子的预算；超了该钩子停用到下一 tick
  maxCmds: 4096,        // 一个 tick 的命令上限，超出丢弃并 hook_err
  regionMax: 8,         // region(r) 的 r 上限
  compNear: 48,         // 组件默认只看离 p1 这么近的实体
}

export interface Api {
  hooks: {
    cmd(c: Cmd | readonly Cmd[], src?: Src): void                  // 入队；worker 模组的消息进来也是它（src 缺省 'mod'）
  }
}
export interface GgApi {
  hooks: {
    run<H extends HookName>(hook: H, P: XYZ, extra: Extra<H>): boolean | undefined   // 同步调该格方块（及 ':*'）的钩子；返回钩子的返回值（没有钩子 / 返回空 = undefined）：onTap 真 = 已处理，can* === false = 否决。用于 interact / sim
    flush(): num                                                    // 应用队列，返回条数。引擎在 tick 末尾自己调；gm.test 要确定性时手动调
    stats(): { queued: num; applied: num; ms: num; slow: readonly string[] }   // F3 / 面板「模组」：慢钩子名单
  }
}

export const mod = {
  id: 'hooks', where: 'main', catalog: 'core', layer: 'core', axis: 'play', ms: 'M3-7',
  doc: 'defl/on.js 钩子与 comp.js 组件的调度者：delta / blk_* → BlockEvent（局部快照）；写操作入队，tick 末尾应用；组件每 tick 批量跑',
  emit: { hook_err: 'edge', hook_sched: 'edge', hook_time: 'edge', hook_weather: 'edge', hook_popup: 'edge' },
  sub: ['delta', 'tick', 'tick_end', 'net_state', 'pause', 'blk_place', 'blk_break', 'blk_touch', 'tbl_change'],   // tick：跑组件；tick_end：flush 命令队列（不靠订阅顺序）；net_state：role = 'client' 时钩子不跑（联机，权威端才跑）
  depends: ['world', 'p1', 'ents', 'pane'],
  tables: ['on.js', 'comp.js', 'blk.tsv'], c_: ['$Hooks'], save: [],
} as const satisfies Mod
