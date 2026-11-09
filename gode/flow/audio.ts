/**
 * gode/flow/audio.ts —— 音效：BGM / 持续状态 / SFX 三层 [定 11-09，用户]
 *
 *   SFX    事件 ──SFX 表──▶ 声音键 ──SND 表──▶ 合成器 / 采样            （一次性）
 *   持续   Here + Clock + Body + Stat ──LOOPS 表（4 Hz 求音量）──▶ 循环音   （雨、水下、洞穴、岩浆、火、低血心跳…）
 *   BGM    screen + Here + Clock ──BGM 表──▶ 曲目，交叉淡入，曲间留白
 *   听者 = Pose（与渲染器同一份），水下时整条总线加低通。
 *
 * 宿主 B 出处：res_vam.js c_Audio :506、spatial :516（距离衰减 + 按 yaw 声像）、SOUND_MAT / SOUND_RULES（方块材质）、MOB_VOICE、SND :575。
 *   宿主 B 只有 SFX，全部是 WebAudio 现场合成（噪声 + 振荡器）；持续层与 BGM 都是 [新]。
 * 照 Luanti：方块的声音按「材质」给（node def 的 sounds = {footstep, dig, dug, place}）→ blk.tsv 的 sound 字段 = 材质名；
 *   gm.audio.play 返回句柄可淡出（sound_play / sound_fade / sound_stop）。照 MC：按类别分总线，各自音量。
 */
import type { num, XYZ, Blk, Mob, Here, Clock, Body, Stat, Screen } from './core.ts'
import type { Mod, Ev, EvName } from './index.ts'

export interface Out {}   // 纯接收端

export type Bus = 'music' | 'weather' | 'ambient' | 'blocks' | 'mobs' | 'players' | 'ui'
export type SndKey = string   // 'blk.stone.break'、'mob.zombie.say'、'amb.rain'：点分，第一段 = 类别

/** 声音定义：合成（宿主 B 两种原语）或采样（资源包 $links 里的 ogg / mp3），数组 = 同时播放 */
export type Synth =
  | { noise: num /* 时长 s */; f: num; q?: num; filter?: 'bandpass' | 'lowpass' | 'highpass'; vol?: num; fEnd?: num; delay?: num }
  | { tone: readonly [f0: num, f1: num]; dur: num; wave?: 'sine' | 'square' | 'sawtooth' | 'triangle'; vol?: num; lp?: num; delay?: num }
export type Sample = { url: string | readonly string[] /* 多个 = 随机选一（MC 的变体） */; vol?: num; pitch?: num | readonly [num, num] }
export type SoundSpec = Synth | Sample | readonly SoundSpec[]

export interface PlayOpt { at?: XYZ; vol?: num; pitch?: num; loop?: boolean; bus?: Bus; fadeIn?: num }
export interface SndHandle { set(o: { vol?: num; pitch?: num; at?: XYZ }): void; stop(fade?: num): void; readonly alive: boolean }

export interface Api {
  audio: {
    play(s: SndKey | SoundSpec, o?: PlayOpt): SndHandle
    bgm: { play(id?: string, fade?: num): void; stop(fade?: num): void; readonly now: string | null }
    loops(): Readonly<Record<string, num>>            // 各持续音的当前音量（F3、面板）
    stats(): { voices: num; loops: num; bgm: string | null }
  }
}

// ── MAT：材质 → [中心频率, Q, 滤波]（宿主 B SOUND_MAT）。blk.tsv 的 sound 字段取这些名字
export type Mat = 'stone' | 'wood' | 'grass' | 'gravel' | 'sand' | 'snow' | 'glass' | 'wool'
export const MAT: Readonly<Record<Mat, readonly [f: num, q: num, filter: 'bandpass' | 'lowpass' | 'highpass']>> = {
  stone: [1700, 1.4, 'bandpass'], wood: [850, 2.2, 'bandpass'], grass: [2600, 0.7, 'highpass'], gravel: [700, 0.9, 'lowpass'],
  sand: [3000, 0.6, 'highpass'], snow: [2000, 0.6, 'highpass'], glass: [3200, 3, 'bandpass'], wool: [500, 0.5, 'lowpass'],
}
/** 宿主 B 按名字 / 工具猜材质的规则（SOUND_RULES，先命中先用）。gode 不在运行时猜：s04 §6 的导出脚本用它给 blk.tsv 填 sound 字段 */
export const MAT_RULES: readonly (readonly [test: string, mat: Mat])[] = [
  ['name ~ glass|ice|glowstone', 'glass'], ['name ~ wool', 'wool'], ['name ~ snow', 'snow'], ['name ~ sand && tool = shovel', 'sand'],
  ['name ~ gravel|dirt|farmland|path', 'gravel'], ['tool = axe', 'wood'], ['tool = shears|shovel || model = cross|crop', 'grass'], ['*', 'stone'],
]

// ── SND：声音键 → 定义（defl/snd.json）。方块四种动作由 MAT 展开：blk.<mat>.step|hit|place|break（宿主 B sndBlock :560）
const blkSnd = (m: Mat) => {
  const [f, q, filter] = MAT[m]
  return {
    step:  { noise: 0.07, f: f * 0.8, q, filter, vol: 0.07 },
    hit:   { noise: 0.06, f, q, filter, vol: 0.12 },
    place: { noise: 0.1, f: f * 0.9, q, filter, vol: 0.3 },
    break: m === 'glass'
      ? [{ noise: 0.18, f, q, filter, vol: 0.38, fEnd: f * 0.6 }, { tone: [2400, 1400], dur: 0.25, wave: 'triangle', vol: 0.12 }, { tone: [3100, 1900], dur: 0.2, wave: 'triangle', vol: 0.1, delay: 0.04 }]
      : { noise: 0.18, f, q, filter, vol: 0.38, fEnd: f * 0.6 },
  } satisfies Record<string, SoundSpec>
}
export const SND: Readonly<Record<SndKey, SoundSpec>> = {
  ...Object.fromEntries((Object.keys(MAT) as Mat[]).flatMap(m => Object.entries(blkSnd(m)).map(([k, v]) => [`blk.${m}.${k}`, v]))),
  'p1.hurt':     [{ tone: [320, 140], dur: 0.2, wave: 'square', vol: 0.12, lp: 1500 }, { noise: 0.12, f: 500, vol: 0.2, filter: 'lowpass' }],
  'p1.eat':      [0, 1, 2].map(i => ({ noise: 0.07, f: 1100, vol: 0.22, q: 1, delay: i * 0.13 })),
  'p1.burp':     { tone: [200, 120], dur: 0.25, wave: 'sawtooth', vol: 0.08, lp: 600, delay: 0.45 },
  'p1.splash':   { noise: 0.45, f: 1200, vol: 0.35, filter: 'lowpass', q: 0.4 },
  'p1.sizzle':   { noise: 0.6, f: 4000, vol: 0.25, filter: 'highpass', q: 0.7 },
  'ui.pop':      { tone: [900, 1400], dur: 0.07, wave: 'sine', vol: 0.18 },      // 宿主 B 起始频率 700 + 随机 400
  'ui.click':    { tone: [950, 700], dur: 0.04, wave: 'square', vol: 0.05 },
  'ui.craft':    [{ noise: 0.08, f: 900, vol: 0.2, q: 2 }, { tone: [520, 780], dur: 0.08, wave: 'sine', vol: 0.1, delay: 0.05 }],
  'tool.break':  [{ tone: [1300, 380], dur: 0.22, wave: 'triangle', vol: 0.22 }, { noise: 0.15, f: 3000, vol: 0.2 }],
  'tnt.fuse':    { noise: 1.4, f: 5000, vol: 0.25, filter: 'highpass', q: 0.5 },
  'explode':     [{ noise: 1.6, f: 900, vol: 1.0, filter: 'lowpass', q: 0.6, fEnd: 60 }, { tone: [70, 28], dur: 1.2, wave: 'sine', vol: 0.8 }],
  'thunder':     [{ noise: 2.4, f: 600, vol: 0.9, filter: 'lowpass', q: 0.5, fEnd: 40 }],   // [新] 宿主 B 借用 explode
  'fluid.fizz':  { noise: 0.5, f: 3500, vol: 0.2, filter: 'highpass', q: 0.7 },          // [新] 岩浆遇水
  // mob.<type>.say / .hurt：由 MOB_VOICE 展开（hurt = 频率 ×1.4、时长 0.2）
  // amb.* / p1.burning / p1.heart / 曲目：默认包没有，资源包按同名键给 Sample；没有就不响
}
export const MOB_VOICE: Readonly<Record<string, readonly [f0: num, f1: num, wave: 'square' | 'sawtooth' | 'triangle', lp: num]>> = {
  pig: [430, 330, 'square', 1200], cow: [180, 120, 'sawtooth', 600], red_cow: [140, 80, 'sawtooth', 450], sheep: [520, 480, 'sawtooth', 1400],
  chicken: [1400, 1100, 'square', 2500], zombie: [105, 72, 'sawtooth', 500], skeleton: [900, 700, 'triangle', 2000], creeper: [300, 200, 'sawtooth', 800],
}

// ── SFX：事件 → [播放, 总线]（defl/sfx.js；一个事件一行，函数返回 null = 不响）。键必须是 mod.sub 里的事件（index.ts 检查 ⑥）
declare function mat(b: Blk): Mat                     // 读 blk.tsv 的 sound 字段（引擎提供）
const mob = (m: Mob) => m.slice(1)
export type Play = { snd: SndKey; at?: XYZ; vol?: num; pitch?: num } | null
export const SFX = {
  blk_hit:      [e => ({ snd: `blk.${mat(e.blk)}.hit`, at: e.P }), 'blocks'],
  blk_break:    [e => ({ snd: `blk.${mat(e.blk)}.break`, at: e.P }), 'blocks'],
  blk_place:    [e => ({ snd: `blk.${mat(e.blk)}.place`, at: e.P }), 'blocks'],
  p1_step:      [e => ({ snd: `blk.${mat(e.under)}.step`, at: e.P }), 'players'],
  p1_land:      [e => ({ snd: `blk.${mat(e.under)}.step`, at: e.P, vol: Math.min(2, 1 + e.fall / 8) }), 'players'],
  p1_fluid:     [e => e.feet === ':water' && e.vy < -4 ? { snd: 'p1.splash' } : e.feet === ':lava' ? { snd: 'p1.sizzle' } : null, 'players'],   // 宿主 B 出水（head 变 null）也响 splash
  p1_hurt:      [() => ({ snd: 'p1.hurt' }), 'players'],
  item_eat:     [e => ({ snd: e.done ? 'p1.burp' : 'p1.eat' }), 'players'],
  item_pickup:  [() => ({ snd: 'ui.pop' }), 'players'],
  item_use:     [e => e.item.startsWith(':gm_') ? { snd: 'ui.pop' } : null, 'ui'],     // gm 值物品（宿主 B gm.use :2531）
  tool_break:   [() => ({ snd: 'tool.break' }), 'players'],
  craft:        [() => ({ snd: 'ui.craft' }), 'ui'],
  mob_say:      [e => ({ snd: `mob.${mob(e.mob)}.say`, at: e.P }), 'mobs'],
  mob_hurt:     [e => ({ snd: `mob.${mob(e.mob)}.hurt`, at: e.P }), 'mobs'],
  tnt_fuse:     [e => ({ snd: 'tnt.fuse', at: e.P }), 'blocks'],
  explode:      [e => ({ snd: 'explode', at: e.P }), 'blocks'],
  lightning:    [e => ({ snd: 'thunder', at: e.P }), 'weather'],       // [新] 引擎按距离推迟 d / 340 s
  fluid_harden: [e => ({ snd: 'fluid.fizz', at: e.P }), 'blocks'],
} as const satisfies { readonly [E in EvName]?: readonly [play: (e: Ev[E]) => Play, bus: Bus] }

// ── LOOPS：持续状态（defl/loop.js）。每 0.25 s 对每行求目标音量，按 fade 秒平滑；音量 > 0 才占一个声部
export interface LoopCtx { here: Here; clock: Clock; body: Body; stat: Stat; near(b: Blk, r: num, flowing?: boolean): num }
export type LoopRow = readonly [id: string, snd: SndKey, vol: (c: LoopCtx) => num, fade: num, bus: Bus]
const cl = (v: num) => Math.max(0, Math.min(1, v))
export const LOOPS: readonly LoopRow[] = [
  ['rain',       'amb.rain',       c => c.clock.precip === 'rain' ? c.clock.rain * (0.3 + 0.7 * c.here.sky / 15) : 0, 2,   'weather'],   // 屋里小声
  ['wind',       'amb.wind',       c => c.body.flying ? cl(Math.hypot(c.body.vx, c.body.vz) / 20) : c.here.P[1] > 110 && c.here.sky === 15 ? 0.3 : 0, 1, 'ambient'],
  ['underwater', 'amb.underwater', c => c.here.fluid === ':water' ? 1 : 0,                                               0.3, 'ambient'],
  ['cave',       'amb.cave',       c => c.here.depth > 8 && c.here.sky < 4 ? 1 : 0,                                     3,   'ambient'],
  ['lava',       'amb.lava',       c => cl(c.near(':lava', 8) / 6),                                                     1,   'blocks'],
  ['fire',       'amb.fire',       c => cl(c.near(':fire', 6) / 3),                                                     0.5, 'blocks'],
  ['stream',     'amb.stream',     c => cl(c.near(':water', 6, true) / 30),                                             1,   'blocks'],    // 只数流动格
  ['burning',    'p1.burning',     c => c.stat.fire > 0 ? 1 : 0,                                                        0.2, 'players'],
  ['heart',      'p1.heart',       c => c.stat.hp <= 4 && !c.body.dead ? 1 : 0,                                         0.5, 'players'],
]

// ── BGM：曲目表（defl/bgm.js）。当前曲放完后留白 gap 秒，再从「when 为真」的行里按 weight 抽；when 变假时淡出
export interface BgmCtx { screen: Screen; here: Here; clock: Clock; mode: string }
export type BgmRow = readonly [id: string, url: string, when: (c: BgmCtx) => boolean, weight: num]
const night = (c: BgmCtx) => c.clock.hour < 6 || c.clock.hour >= 19
export const BGM: readonly BgmRow[] = [
  ['menu',     'music/menu*.ogg',  c => c.screen === 'title',                                         1],
  ['day',      'music/day*.ogg',   c => c.screen === 'game' && !night(c) && c.here.depth <= 8,          1],
  ['night',    'music/night*.ogg', c => c.screen === 'game' && night(c) && c.here.depth <= 8,           1],
  ['cave',     'music/cave*.ogg',  c => c.screen === 'game' && c.here.depth > 16,                       1],
  ['water',    'music/water*.ogg', c => c.here.fluid === ':water',                                      2],
  ['creative', 'music/build*.ogg', c => c.screen === 'game' && c.mode.startsWith('creative'),           0.5],
]   // url 相对资源包（$links，s06）；默认包没有曲目 → 不放（宿主 B 也没有 BGM）

export const c_Audio = {
  volume: 0.55, range: 28,                      // 宿主 B：总音量、听觉半径（音量 = 1 − d / range，声像 = 左右分量 × 0.7）
  bus: { music: 0.5, weather: 0.8, ambient: 0.7, blocks: 1, mobs: 1, players: 1, ui: 0.6 } satisfies Record<Bus, num>,
  underwaterLP: 900,                            // [新] 水下低通 Hz
  loopHz: 4, maxVoices: 32,
  bgmGap: [300, 900] as const, bgmFade: 4,      // [新] 曲间留白（s）、淡入淡出（s）
  duckPaused: 0.4,                              // [新] 暂停屏时 SFX / 持续层压到 40%
}

export const mod = {
  id: 'audio', where: 'main',
  off: '无声：没有音效、持续层与 BGM',
  doc: 'WebAudio；首个按键 / 触摸解锁（宿主 B audioInit）',
  emit: {},
  sub: ['pose', 'here', 'clock', 'p1_move', 'p1_stat', 'key', 'screen', 'game_mode',     // 听者、持续层、BGM、解锁
    'blk_hit', 'blk_break', 'blk_place', 'p1_step', 'p1_land', 'p1_fluid', 'p1_hurt', 'item_eat', 'item_pickup', 'item_use',   // = SFX 表第一列
    'tool_break', 'craft', 'mob_say', 'mob_hurt', 'tnt_fuse', 'explode', 'lightning', 'fluid_harden'],
  depends: ['world', 'pane'],                      // world.near：持续层；pane：$Audio
  tables: ['snd.json', 'sfx.js', 'loop.js', 'bgm.js'], c_: ['$Audio'], save: [],
} as const satisfies Mod
