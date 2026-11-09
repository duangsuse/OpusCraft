/**
 * gode/flow/weather.ts —— 时钟 + 天气 [定 11-09，用户：天气系统一个模块；时钟归它，因为天气由时间推]
 *
 *   frame ──▶ t += dt·20·speed（tpause 的「暂停时钟」= 0）──▶ Clock（每帧）──▶ render、audio、fx、sim、hud
 *   全局天气 = wxAt(t, seed)：纯函数 [定 11-09 Q-wx]。7 种天气（goodLiqPG），段与段之间按 NEXT 的转移概率跳，骰子 = hash(seed, 段号)
 *     —— 联机两端、读档之后都算出同一个天气（s11 B-5）。命令 / 模组 / 面板改天气 = 写覆盖 override {state, until}，只有覆盖需要存档
 *   参数行 = wxRow(t, seed)：上一段的 WEATHER 行按 STEP 匀速走向这一段的行，也是 t 的纯函数
 *   相机处 = 参数行 × PRECIP 表（群系 / 高度：沙漠不下、雪地下雪）+ 雪盖 cover ──▶ Clock
 *   落雷：thunder 列 > 0.5 时每 tick 1/lightningEvery ──▶ lightning {P} ──▶ render 画电光、audio 推迟雷声、sim 点火、p1 / ents 扣血
 *
 * 宿主 B 出处：Sky.update（gls.js:609：time += dt·20，DAY_LENGTH 24000）· Weather（gls.js:641：3 种、随机计时器）·
 *   gm.time（值物品 :2478，小时 7…24）· Player.handleKey 的 T / R 键（现在是命令，input.ts ACTS）。
 * goodLiqPG 出处：src/game/environment.js（WEATHER_TYPES / PRESETS / tick() 里的转移表与平滑步长 / set() 的段长）。
 * 与两者的差别：
 *   - 转移概率、段长、参数行照抄 goodLiqPG，只把 Math.random 换成 hash(seed, k)。goodLiqPG 的彩虹不收。
 *   - 宿主 B 把 Weather.storm 当闪光值传给 rgl，雷暴期间一直过曝（11-09 已在 rgl 修）。这里 thunder 列只压暗，Clock.flash 是单独的脉冲。
 *   - 天色、雾、云、星、雨雪、电光的绘制在宿主 B 是 Sky / Weather 自己画，gode 全归渲染器（render.ts）。
 */
import type { num, XYZ, Wx, WxRow, Clock, Ref } from './core.ts'
import type { Mod } from './index.ts'

export interface Out {
  clock: Clock                                            // 每帧
  hour: { hour: num; day: num }                           // 整点（给 BGM、模组：MC 的「天亮了」）
  weather_change: { from: Wx; to: Wx; by: 'auto' | 'cmd' | 'mod' | 'pane' }
  lightning: { P: XYZ }                                   // 落点 = 相机 lightningR 格内随机一列的地表（world.height）
}

export interface Api {
  weather: {
    time(hour?: num): num                                 // 读 / 设墙上时钟小时（gm_time 值物品、/time、模组 {time: 6}）
    speed(k?: num): num                                   // 时钟倍速（&tspeed=、tpause 的 1.0x）
    set(state: Wx, ticks?: num): void                     // 覆盖到 t + ticks（缺省 = 该天气的一个段长）；/weather rain 600、模组 {weather: 'rain'}
    next(): void                                          // 按 NEXT 跳到下一段（宿主 B R 键 = /weather next）
    clock: Ref<Clock>                                     // 最近一帧（= clock 事件的最新值）；页面绑定 'weather.clock.hour' 读它
    at(P: XYZ): { precip: Clock['precip']; rain: num; wind: num }   // 任意格（sim：雨灭火、耕地变湿、积雪；露天另看天光）
  }
}

// ── 时钟：t = 0 是第 1 天 06:00（MC / goodGL tick 0）。hour = ((t + 6000) mod 24000) / 1000
export const c_Time = { dayLen: 24000, tps: 20, speed: 1, hourMin: 7, hourMax: 24 /* gm_time 值物品的取值范围（宿主 B c_gm） */ }

// ── WEATHER：天气 → 参数行（defl/weather.tsv；goodLiqPG PRESETS 原值）。模组加一种天气 = 加一行，再在 NEXT 里给它出入口
export const WEATHER: Readonly<Record<Wx, WxRow>> = {
  clear:    { clouds: 0.32, rain: 0, thunder: 0, fog: 0,    wind: 0.25, cirrus: 0.5 },
  cloudy:   { clouds: 0.62, rain: 0, thunder: 0, fog: 0.05, wind: 0.45, cirrus: 0.7 },
  overcast: { clouds: 0.9,  rain: 0, thunder: 0, fog: 0.15, wind: 0.5,  cirrus: 0.2 },
  rain:     { clouds: 0.95, rain: 1, thunder: 0, fog: 0.3,  wind: 0.7,  cirrus: 0 },
  thunder:  { clouds: 1,    rain: 1, thunder: 1, fog: 0.35, wind: 1,    cirrus: 0 },
  fog:      { clouds: 0.5,  rain: 0, thunder: 0, fog: 1,    wind: 0.1,  cirrus: 0.2 },
  snow:     { clouds: 0.92, rain: 1, thunder: 0, fog: 0.45, wind: 0.6,  cirrus: 0 },
}
/** 每 tick 每列最多变多少（goodLiqPG：rain / thunder 0.01 → 5 s 下满；其余 0.002 → 云 25 s 铺满） */
export const STEP: Readonly<Record<keyof WxRow, num>> = { clouds: 0.002, rain: 0.01, thunder: 0.01, fog: 0.002, wind: 0.002, cirrus: 0.002 }
/** 转移：[下一段, 累计概率上限]，先命中先用（goodLiqPG tick() 里的表）。
 *  自动日程不会进 snow（同 goodLiqPG：只有命令能设）；平时下的是雨还是雪由 PRECIP 按群系定，snow 段 = 命令强制全地图下雪（none 的群系除外） */
export const NEXT: Readonly<Record<Wx, readonly (readonly [Wx, num])[]>> = {
  clear:    [['cloudy', 0.45], ['fog', 0.6], ['overcast', 0.85], ['clear', 1]],
  cloudy:   [['clear', 0.35], ['overcast', 0.7], ['rain', 1]],
  overcast: [['rain', 0.5], ['cloudy', 0.75], ['thunder', 1]],
  rain:     [['thunder', 0.25], ['cloudy', 0.75], ['overcast', 1]],
  thunder:  [['rain', 0.6], ['cloudy', 1]],
  fog:      [['clear', 0.6], ['cloudy', 1]],
  snow:     [['cloudy', 1]],
}

export const c_Weather = {
  auto: true,                                             // false = 永远停在当前段（面板开关；goodLiqPG cycle）
  first: 6000,                                            // 开局先晴这么久
  clearLen: [12000, 72000] as const, otherLen: [6000, 18000] as const,   // 段长（tick；goodLiqPG set()）
  lightningEvery: 300, lightningR: 60, flashDecay: 3,     // 宿主 B：thunder > 0.5 时每 tick 1/300；flash 每秒衰减 3
  windTurn: 0.5,                                          // [新] 每换一段风向最多转多少（弧度）
  cover: [0.0005, 0.002] as const,                        // [新] 雪盖每 tick 涨 / 化多少（下雪约 100 s 盖满，停了约 25 s 化完）；只是画面，不存档
}

declare function hash(seed: string, k: num): num          // 0..1；同 slicer 的种子散列
const pick = (from: Wx, r: num): Wx => (NEXT[from].find(([, p]) => r < p) ?? NEXT[from][NEXT[from].length - 1])[0]
/** 时刻 t 所在的段。纯函数；实现时按段缓存，不必每帧从 0 扫 */
export function segAt(t: num, seed: string): { k: num; start: num; wx: Wx; prev: Wx; windDir: num } {
  let k = 0, start = 0, len = c_Weather.first, wx: Wx = 'clear', prev: Wx = 'clear', windDir = hash(seed, 2e6) * 2 * Math.PI
  while (start + len <= t) {
    start += len; prev = wx; wx = pick(wx, hash(seed, ++k))
    const [a, b] = wx === 'clear' ? c_Weather.clearLen : c_Weather.otherLen
    len = a + Math.floor(hash(seed, k + 1e6) * (b - a))
    windDir += (hash(seed, k + 2e6) - 0.5) * 2 * c_Weather.windTurn
  }
  return { k, start, wx, prev, windDir }
}
export const wxAt = (t: num, seed: string): Wx => segAt(t, seed).wx
/** 参数行：上一段的行按 STEP 匀速走向这一段的行。段长 ≥ 6000 tick，远长于最慢的过渡（1 / 0.002 = 500 tick），所以只看相邻两段 */
export function wxRow(t: num, seed: string): WxRow {
  const s = segAt(t, seed), a = WEATHER[s.prev], b = WEATHER[s.wx], dt = t - s.start, o = { ...b }
  for (const key of Object.keys(b) as (keyof WxRow)[]) {
    const d = b[key] - a[key], go = STEP[key] * dt
    o[key] = Math.abs(d) <= go ? b[key] : a[key] + Math.sign(d) * go
  }
  return o
}

// ── PRECIP：相机 / 任意格下的是什么（defl/biome.tsv 的 precip 列；按生成器 meta.biomes 的名字匹配，先命中先用）
export const PRECIP: readonly (readonly [biome: RegExp, precip: Clock['precip'], snowAbove?: num])[] = [
  [/desert|savanna|badlands|mesa/i, 'none'],               // 宿主 B canRain = 非沙漠
  [/snowy|frozen|ice|tundra/i, 'snow'],
  [/mountain|peak/i, 'rain', 90],                          // 宿主 B：山地 y > 90 下雪
  [/taiga/i, 'rain', 80],                                  //         针叶林 y > 80 下雪
  [/./, 'rain'],
]

export const mod = {
  id: 'weather', where: 'main',
  off: 'Clock 的天气列恒为 clear 行（无雨、雪、雷、风、闪电、雪盖），时间由 game 内置钟（$Time）照常推进',
  doc: '时钟 + 天气；全局天气与参数行都是 (t, seed) 的纯函数',
  emit: { clock: 'frame', hour: 'edge', weather_change: 'edge', lightning: 'edge' },
  sub: ['frame', 'tick', 'here', 'pause'],               // frame 推时钟、tick 掷闪电与涨落雪盖、here 取群系 / 高度、pause 停钟
  depends: ['world', 'pane'],                                // world.height：闪电落点
  tables: ['weather.tsv', 'biome.tsv'], c_: ['$Time', '$Weather'],
  save: ['time', 'weather'],                              // time = {t, speed} → Pusc.json 基础信息；weather = override（没有就不写）
} as const satisfies Mod
