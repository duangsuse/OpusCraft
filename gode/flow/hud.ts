/**
 * gode/flow/hud.ts —— HUD + 命令，一个默认模组 [定 11-09，用户]
 *
 *   Ref（p1.stat / inv.hot / weather.clock / world.here …）──BIND 表（kernel 绑定器）──▶ html[data-*] / CSS 变量 / data-bind ──▶ defl/ui.html + ui.css 画
 *     物品栏、血条、模式行、消息、准星、死亡屏、受伤红闪都是页面的事（ELEMS 那种「元素 × 数据来源 × 画什么」的表只是文档，已取消）[定 11-09，用户]；
 *     本模块只管页面算不出来的：F3 文字、消息队列、命令行、受伤脉冲、模组 HUD 元素。
 *   key(cmd) ──▶ 命令行 ──CMDS 表 + 补全──▶ 与模组 worker 同一组动词（gm.p1.tp / gm.weather.set / gm.inv.give / gm.pane.set …）──▶ cmd 事件
 *   模组 ──gm.hud.add / change / remove（照 Luanti hud_add）或 {hud:{url, rect}} iframe 叠层（s07 §5）──▶ 自定义 HUD 元素
 *
 * 命令就是「打字版的模组动词」：/tp /time /weather /give /spawn /set 与 s07 M-2 的白名单一一对应，权限也一样（tier ≤ 2 可写）；
 *   区别只在 cheat：命令是玩家行为，cheat 关闭后带 cheat 标记的命令不可用（s07 §6）。参数用口诀写：@x,z^y、@地名、#生物、:物品*数量、c_.路径。
 * 宿主 B 出处：HUD :2921（debugText :2927、message :2966、drawBars :2973、update :2991）· c_Dbg :2920 · Player.handleKey 的 T / R（改成命令行）。
 *   宿主 B 没有命令行，CMDS / 补全 / 地名 / 模组 HUD 都是 [新]（IDEA「/t命令 触发 @地名 #人或附近动物 补齐，或直输跳过去」）。
 */
import type { num, XYZ, PStr, PName, Blk, Mob, Ref, Pose, Here, Clock, Body } from './core.ts'
import type { Mod } from './index.ts'
import type { BindRow } from './kernel.ts'

export interface Out {
  cmd: { line: string; ok: boolean; out: string }        // 执行过的命令（给模组：审计、成就）
}

/** 模组 HUD 元素（照 Luanti hud_add 的类型；pos 是屏幕比例 0..1，原点左上） */
export type HudEl =
  | { type: 'text'; pos: readonly [num, num]; text: string; color?: string; align?: -1 | 0 | 1 }
  | { type: 'image'; pos: readonly [num, num]; src: string; scale?: num }
  | { type: 'bar'; pos: readonly [num, num]; icon: string; n: num; max: num }          // Luanti statbar
  | { type: 'waypoint'; at: XYZ | PStr | PName; text: string; color?: string }        // 世界里的标签；@地名 与小地图标记同源
  | { type: 'iframe'; url: string; rect: readonly [num, num, num, num] }              // s07 §5 HUD 叠层，默认鼠标穿透

export interface Api {
  hud: {
    msg(text: string, o?: { ms?: num; from?: string }): void   // 宿主 B HUD.message（最多 6 条、6 s）。模组 worker 用 {msg:'…'} [新动词]
    add(el: HudEl): num; change(id: num, patch: Partial<HudEl>): void; remove(id: num): void
    f3: Ref<boolean>                                           // F3 开着（'f3' 虚拟键翻转它；打开时同时 noclip + 飞行，宿主 B toggleDebug :2945）
    cmd: Ref<boolean>                                          // 命令行开着（'cmd' 虚拟键打开；开着时 input.focus 为 text）
    f3text: Ref<string>                                        // F3 文字（F3 表按 c_Hud.f3Hz 拼出，页面 data-bind="hud.f3text"）
    msgs: Ref<readonly { text: string; ms: num }[]>            // 消息队列（页面 <template data-each="hud.msgs">）
    hurt: Ref<boolean>                                         // 受伤脉冲：p1_hurt 时置真，c_Hud.flashMs 后复位；CSS 用 html[data-hurt] 画红闪
    run(line: string): Promise<{ ok: boolean; out: string }>  // ACTS 里写成 '/time 7' 的动作、帮助键点击都走这里
  }
  pts: Ref<Readonly<Record<string, PStr>>>                 // 地名表：&pts=name@x,z^y;home@…（s06 §8）、/pts、小地图标记都读写它
}

// ── BIND：HUD 的绑定行（defl/bind.tsv 的一部分，格式与规则见 kernel.ts BindRow）。页面怎么画、画在哪由 ui.html / ui.css 决定，下面只列「暴露什么值」。
//    元素（ui.html）：hotbar = <template data-each="inv.hot">，选中框用 --sel；心 / 饥饿 / 气泡 = 背景图 + --hp / --hunger / --air（7×6 像素字形，宿主 B drawBars :2973）；
//    water = html[data-fluid=":water"] 蓝色蒙层（rgl 自己有水下雾时 CSS 关掉）；death = html[data-dead] 死亡屏（重生按钮 = <b data-act="respawn">）；
//    cross = html[data-screen=game] 准星（mix-blend difference）；mode 行 = data-bind；f3 / cmd 开关 = html[data-f3] / html[data-cmd]。
export const BIND = [
  ['p1.stat.hp',          'var',  'hp'],
  ['p1.stat.maxHp',       'var',  'maxhp'],
  ['p1.stat.hunger',      'var',  'hunger'],
  ['p1.stat.air',         'var',  'air'],
  ['p1.stat.fire',        'var',  'fire'],       // > 0 且非创造：火焰蒙层（CSS 用 var 判）
  ['p1.dead',             'attr', 'dead'],
  ['inv.sel',             'var',  'sel'],
  ['world.here.fluid',    'attr', 'fluid'],
  ['weather.clock.hour',  'var',  'hour'],
  ['weather.clock.state', 'attr', 'wx'],
  ['weather.clock.precip','attr', 'precip'],
  ['hud.hurt',            'attr', 'hurt'],
  ['hud.f3',              'attr', 'f3'],
  ['hud.cmd',             'attr', 'cmd'],
] as const satisfies readonly BindRow[]

// ── F3：调试文字，与宿主 B debugText 逐行一致（s09 §7）。每行一个函数，参数里列出它用到的全部数据来源
export interface F3Src {
  seed: string; pose: Pose; body: Body; here: Here; clock: Clock; feet: { blk: Blk; meta: num; sky: num; light: num }
  aim: { P: XYZ | null; blk: Blk | null; mob: Mob | null; mobInfo?: string }
  gl: { calls: num; tris: num }; sim: { pending: num; parked: num }; chunks: { loaded: num; gen: num; meshed: num }
  n: { ents: num; mobs: num; fx: string }; fps: num; ms: num
}
const v3 = (x: num, y: num, z: num, d = 0) => `#(${x.toFixed(d)},${y.toFixed(d)},${z.toFixed(d)})`
const FACING = ['↑ N', '↖ NW', '← W', '↙ SW', '↓ S', '↘ SE', '→ E', '↗ NE']   // 宿主 B c_Dbg.facing
const fl = Math.floor
export const F3: readonly ((s: F3Src) => string)[] = [
  s => `${s.pose.x.toFixed(2)} ${s.pose.y.toFixed(2)} ${s.pose.z.toFixed(2)} ${s.pose.yaw.toFixed(3)} ${s.pose.pitch.toFixed(3)} ${s.pose.fov}`,   // Gizmo 行（s09 §6）：可复制，粘贴即传送
  s => `Seed ${s.seed}`, () => '',
  s => `Draw calls ${s.gl.calls} · Tris ${(s.gl.tris / 1000).toFixed(0)}k`,
  s => `Liq +${s.sim.pending} rm ${s.sim.parked} ${s.feet.blk === ':water' || s.feet.blk === ':lava' ? `${s.feet.blk.slice(1)} L${s.feet.meta}` : '—'}`,
  s => `Sun ${s.feet.sky} · torch ${s.feet.light}`, () => '',
  s => `Chunk (${fl(s.body.x) >> 4},${fl(s.body.z) >> 4})`,
  s => `Biome ${s.here.biome}`,
  s => `Day ${s.clock.day + 1}, ${String(fl(s.clock.hour)).padStart(2, '0')}:${String(fl(s.clock.hour % 1 * 60)).padStart(2, '0')} is ${s.clock.state}`, () => '',
  s => `Chunks ${s.chunks.loaded} · XZP ${s.chunks.gen} · X2V ${s.chunks.meshed}`,
  s => `Ents ${s.n.ents} · Mobs ${s.n.mobs} · Particles ${s.n.fx}`,     // fx = (burst+fire)+(firefly+flutter)
  s => s.aim.mob ? `Mob ${s.aim.mobInfo}` : 'Mob —',
  s => s.aim.P && s.aim.blk ? `XYZB ${s.aim.blk} ${v3(...s.aim.P)}` : 'XYZB —', () => '',
  s => `OpusCraft ${s.fps} fps · sim ${s.ms.toFixed(1)} ms`,
  s => `p1 ${v3(fl(s.body.x), fl(s.body.y), fl(s.body.z))}  ${FACING[((Math.round(s.body.yaw / (Math.PI / 4)) % 8) + 8) % 8]}`,
  s => v3(s.body.x, s.body.y, s.body.z, 2),
]

// ── CMDS：命令表（defl/cmd.js；模组 tsv / {reg:{cmd}} 可追加，s07 §4）。参数类型名见 ARG
export type Arg = 'P' | 'mob' | 'item' | 'hour' | 'wx' | 'ticks' | 'path' | 'json' | 'mode' | 'cam' | 'name' | 'cmd'
export interface Cmd { args: readonly `${Arg}${'' | '?'}`[]; cheat: boolean; desc: string; run: string }   // run = 调用的 gm 动词（模组 worker 发的同名消息）
export const CMDS: Readonly<Record<string, Cmd>> = {
  tp:      { args: ['P'],               cheat: true,  desc: '传送到坐标 / 地名 / 生物',            run: 'gm.p1.tp' },
  time:    { args: ['hour'],            cheat: true,  desc: '设时钟小时（同 gm_time 值物品，宿主 B :2478）', run: 'gm.weather.time' },
  weather: { args: ['wx', 'ticks?'],    cheat: true,  desc: 'clear / rain / thunder / next',       run: 'gm.weather.set' },
  give:    { args: ['item'],            cheat: true,  desc: '给物品：:torch*16',                   run: 'gm.inv.give' },
  spawn:   { args: ['mob', 'P?'],       cheat: true,  desc: '生成生物，缺省在准星处',               run: 'gm.ents.spawn' },
  set:     { args: ['path', 'json'],    cheat: true,  desc: '写面板路径（tier ≤ 2）：/set $Motion.flySpeed 20', run: 'gm.pane.set' },
  fly:     { args: [],                  cheat: true,  desc: '飞行开关',                            run: 'gm.p1.fly' },
  noclip:  { args: [],                  cheat: true,  desc: '穿墙开关',                            run: 'gm.p1.noclip' },
  mode:    { args: ['mode?'],           cheat: true,  desc: '读 / 切模式（= G 键）',                run: 'gm.game.mode' },
  cam:     { args: ['cam'],             cheat: false, desc: 'F4 相机：fp orbit back', run: 'gm.cam.mode' },
  pts:     { args: ['name?', 'P?'],     cheat: false, desc: '列出地名 / 把当前位置记成 @name',       run: 'gm.pts' },
  seed:    { args: [],                  cheat: false, desc: '显示种子',                            run: 'gm.game.seed' },
  help:    { args: ['cmd?'],            cheat: false, desc: '列出命令 / 某条命令的参数',            run: 'gm.hud.msg' },
}
/** 补全：按前缀找候选（IDEA「@地名 #人或附近动物 补齐，或直输跳过去」） */
export const COMPLETE: Readonly<Record<string, string>> = {
  '@':   '地名表 gm.pts() + @p1 + 准星格的 @x,z^y',
  '#':   '附近生物 gm.ents.near(32)（近的在前）+ mob.json 的名字',
  ':':   '方块 / 物品名（blk.tsv、item.json、存档 BIME.tsv）',
  '$':   '参数路径 $Topic.key（gm.pane，tier ≤ 2 的才列）',
  '/':   'CMDS 的键 + 模组注册的命令',
}
export const c_Hud = { msgMax: 6, msgMs: 6000, nameMs: 1500, flashMs: 200, barsHz: 10, f3Hz: 2, history: 50 }

export const mod = {
  id: 'hud', where: 'main',
  doc: 'F3 文字、消息队列、命令行（命令 = 打字版的模组动词）、模组 HUD 元素；画面全在 ui.html / ui.css',
  off: '没有 F3、消息、命令行（/ 与 Enter 无效）和模组 HUD；本模块的 BIND 行一并撤销，血条等页面元素失去数据',
  emit: { cmd: 'edge' },
  sub: ['p1_move', 'p1_hurt', 'aim', 'here', 'clock', 'pose', 'key', 'game_ready', 'weather_change'],   // key：f3 / cmd；其余拼 F3 文字与消息
  depends: ['game', 'p1', 'inv', 'ents', 'weather', 'pane', 'world', 'render', 'sim', 'fx', 'input', 'cam'],
  tables: ['cmd.js', 'i18n.json'], c_: ['$Hud'],
  save: ['pts'],                                         // 地名表 → Pusc.json（&pts= 同格式）；命令历史走 gg_v
} as const satisfies Mod
