/**
 * gode/flow/render.ts —— 渲染器的连接点 + c_ 参数主题 [定 11-09，用户：rgl 的 P_DEFAULTS 按面板文件夹拆成 c_ 主题，写进 flow]
 *
 *   pose（每帧，6 个数）+ here（4 Hz）+ clock（每帧）+ chunk_in / chunk_out / delta / light ──▶ 渲染器 ──▶ 画面
 *   lightning ──▶ 电光条（c_Bolt）；Clock.flash ──▶ 天空、环境光、雾一起闪（只有 flash 提亮，thunder 列只压暗）
 *   gg.render.fx ◀── fx 模块的粒子请求（fx.ts RenderFx）
 *
 * 渲染器要的其余信息一律自己经 gm 取（连接点规则 ②）：手持光 = Here.held → blk.tsv 的 emit 列；洞穴雾 = Here.sky / Here.blk；
 *   雨的遮挡 = gm.world.height（每列最高的挡雨格 → 高度图纹理）；默认天空 = defl/sky.json（SKY）。rgl 不认识任何文件名。
 * 本文件写新功能的参数（字面量 + 范围 + 标签，同一行）和每个文件夹的预设；rgl 现有约 100 个键只在 TOPICS 里分好主题，
 *   数值仍在 rgl/index.js:171 的 P_DEFAULTS，搬迁时照抄。
 * 验收 [定 11-09，用户]：「效果显著」靠每个文件夹的预设按钮人眼对比，不做自动扫参门槛。
 * 写法 [定 11-09，用户]：从 goodLiqPG 搬的代码（particles.js、itemrender.js）转成 rgl 的 Pass 写法（uniform 改 glsl 里的 ${} getter），
 *   算法与数值不改，头注释写出处。
 * 宿主 B 出处：rgl/index.js（P_DEFAULTS :171、面板文件夹 :177–187）· rgl/host-b.js glsEnv（weather / eyeSky / flying）。
 */
import type { num, PStr, Ref, MarkLayers, P1Tag } from './core.ts'
import type { Mod } from './index.ts'
import type { RenderFx } from './fx.ts'

/** 渲染器只发小地图的事件（s03 §3.4：marker_Any / hover_Any / near_Any / tap 在 Ev 里的写法）；画面本身不发 */
export interface Out {
  marker: { map: string; i: num; at: PStr; emoji: string; layer: string; how: 'tap' | 'hover' | 'leave' | 'near' } & P1Tag   // 点 / 悬停 / 离开 / 玩家走进 r 格内；map '' = M 键主小地图。模组按 emoji 过滤（s03 的 'marker_🏠' 写成 e.emoji === '🏠'）
  map_tap: { map: string; P: PStr } & P1Tag                // 点了地图空白处（P = 世界坐标）
}

/** gm.actOnMap [定 11-10，用户]：和 gm.act 对称的地图侧。标记表是世界里一份（gm.marks），地图只管自己的层开关（MarkLayers）与屏幕 ↔ 世界换算、点选；所以叫 act 而不只是 addMiniMap（s03 §3.4 改写）。
 *  默认指 M 键主小地图（id ''）；gm.actOnMap.of(id) 取别的（clawd 查看器、钻石箱检查点、世界面板的「添加 Seed 对比」，s08、IDEA-sys L47）。同 p1.now 的口径 */
export interface MapAct extends MarkLayers {
  readonly id: string
  readonly el: HTMLElement
  scr2xz(sx: num, sy: num): readonly [x: num, z: num] | null     // 屏幕点 → 世界 xz；点在地图元素外返回 null
  xz2scr(x: num, z: num): readonly [sx: num, sy: num] | null     // 世界 xz → 屏幕像素；在地图可视范围外返回 null（marker 绘制、点选都用）
  tap(sx: num, sy: num, how?: 'tap' | 'long'): void              // 点地图：命中标记发 marker，否则发 map_tap
  center(cx: num, cz: num): void                                 // 区块坐标
  zoom: Ref<num>; mode: Ref<string>                              // 1 / 2 / 4 / 8 格一像素；'top' | 'slice' | …（s03 §3.3）
}
export interface MapOpts { zoom?: num; mode?: string; size?: readonly [w: num, h: num] }
export interface Api {
  actOnMap: MapAct & {
    add(cx: num, cz: num, o?: MapOpts): MapAct                   // 原 gm.addMiniMap
    of(id: string): MapAct | null
    list(): readonly string[]
    remove(id: string): void
  }
}

export interface GgApi {
  render: { stats(): Readonly<Record<string, num>>; shot(): Promise<Blob>; fx: RenderFx }
}

/** 一个可调参数：[默认, 最小, 最大, 面板标签]。范围按「滑到两端一眼看得出差别」定 */
type T = readonly [v: num, min: num, max: num, label: string]
type B = readonly [v: boolean, label: string]

// ── SKY：默认天空资产（defl/sky.json）[定 11-09，用户]。走资源包 / &pano= 同一条路径，层级最低：包里的 pano、&pano=、拖入的 .hdr 都盖过它
export const SKY = {
  pano: 'res/puresky2k.hdr',            // 白天全景；只有白天这张时亮度跟大气天顶走，夜里自然变暗
  pano_night: null,                     // 夜里用程序星空和月亮（不用 milky2k.hdr）
} as const

// ── $Sky：程序云关掉之前先用全景 [定 11-09，用户：现在的云不如全景]
export const c_Sky = {
  clouds: [false, '程序云（v2/gl 可调云移植前默认关；关时云影、光柱的云遮挡一起关）'] as B,
  overcastDim: [0.5, 0, 1, '阴天压暗全景（× clouds 列 − 晴天值）'] as T,   // [新] 全景里的云不会变多，多云 / 阴天只能靠压暗、去饱和表现
  overcastDesat: [0.7, 0, 1, '阴天去饱和'] as T,
  stormDim: [0.25, 0, 0.6, '雷暴再压暗（× thunder 列）'] as T,            // rgl/frame.js 现写死 0.25（11-09 修过曝时加的）
}
/** $Cloud：移植 v2/gl 可调云时启用（v2/gl.js:77 P_DEFAULTS、:112 CLOUD_PRESETS 原值）。云量取 Clock.clouds，风取 wind × windDir */
export const c_Cloud = {
  thick: [5, 1, 16, '厚度（格）'] as T, density: [0.34, 0.02, 1, '密度'] as T,
  shade: [0.28, 0, 1, '暗部'] as T, light: [0.36, 0, 1, '日照'] as T,
}

// ── $Shadow：草阴影追上 v2/gl [定 11-09，用户：草也接收阴影 + 加参数]。现状：草（v_flags 8192）不接收锐阴影图，飞行时整张不画
export const c_Shadow = {
  strength: [1, 0, 1, '阴影浓度（v2/gl 是 0.68）'] as T,
  grassRecv: [1, 0, 1, '草接收阴影（0 = 现状）'] as T,
  grassRoot: [0.5, 0, 1, '草丛根部压暗'] as T,
  sharpRes: [2048, 512, 4096, '花草锐阴影图分辨率'] as T,
}

// ── $Water：反射追上 v2/gl [定 11-09，用户：半分辨率平面反射 + SSR 兜底]。现状：只有 SSR，画面外的岸边树只能反射天空
export const c_Water = {
  planar: [true, '平面反射（按离眼最近的水面高度镜像再画一遍场景；其他高度的水仍用 SSR）'] as B,
  planarScale: [0.5, 0.25, 1, '平面反射分辨率'] as T,
  refl: [0.8, 0, 1, '反射强度（v2/gl 预设 0.36 / 0.6 / 0.8）'] as T,
  f0: [0.02, 0, 0.5, '菲涅尔 F0（正对水面时的反射率）'] as T,
  reflBlur: [0.3, 0, 2, '反射随波纹模糊'] as T,
}

// ── $Fog：体积光与雾的联动 [定 11-09，用户：火把与洞穴、天气参数、闪电；不跟昼夜]
export const c_Fog = {
  cave: [1, 0, 3, '洞穴雾（眼处天光越低越浓，Here.sky）'] as T,       // [定 11-09，用户：用眼处天光判断在地下] 探矿的雾感
  caveDist: [24, 8, 96, '洞穴能见度（格）'] as T,
  caveWarm: [1, 0, 2, '火把附近的雾染暖色（Here.blk）'] as T,         // rgl caveHaze 已有，默认值偏弱；搬迁时并进来
  weather: [1, 0, 2, '天气 fog / rain 列 → 雾密度、光柱减弱'] as T,
  bolt: [1, 0, 2, '闪电照亮雾和雨幕'] as T,
}

// ── $Precip：雨雪 [定 11-09，用户：rgl GPU 雨丝 + 水面涟漪]。替换宿主 B 的 1400 个纯色点（gls.js:641）
export const c_Precip = {
  density: [1, 0, 2, '雨量（× rain 列）'] as T,
  len: [0.6, 0.1, 2, '雨丝长度（格，按落速拉长）'] as T,
  slant: [1, 0, 2, '风吹倾斜（× wind 列）'] as T,
  alpha: [0.35, 0, 1, '雨丝不透明度'] as T,
  ripple: [1, 0, 2, '落在水面：一圈圈涟漪（接 rgl/ripple.js）'] as T,
  crown: [1, 0, 2, '落在地上：小水花'] as T,
  snowSize: [1, 0.3, 3, '雪花大小（有大小差）'] as T,
  snowDrift: [1, 0, 3, '雪花漂移（× wind 列）'] as T,
  cover: [1, 0, 1, '雪盖（露天顶面渐白，× Clock.cover）'] as T,
}

// ── $Bolt：闪电 [定 11-09，用户：电光条 + 闪光 + 延迟雷声 + 点火 + 伤害]。点火在 sim，伤害在 p1 / ents，雷声在 audio
export const c_Bolt = {
  life: [0.2, 0.05, 1, '电光持续（s）'] as T,
  strikes: [3, 1, 6, '闪几下'] as T,
  branch: [0.35, 0, 1, '分叉概率'] as T,
  width: [0.3, 0.05, 1.5, '主干宽（格）'] as T,
  glow: [1, 0, 3, '电光亮度'] as T,
  flash: [0.6, 0, 1.5, '天空 / 环境光闪光强度（× Clock.flash）'] as T,   // rgl 现写死 0.6（goodGL 原值）
}

// ── $HeldLight：手持光 [定 11-09，用户：着色器点光源，只给玩家]。照 Iris HELD_LIGHT：不投影，不动光照网格、不进存档
export const c_HeldLight = {
  on: [true, '手持光'] as B,
  gain: [1, 0, 2, '亮度（× 手持物 emit / 15）'] as T,
  radius: [1, 0.5, 2, '半径倍率（emit 14 ≈ 14 格）'] as T,
  flicker: [1, 0, 2, '火把闪烁'] as T,
  fade: [0.15, 0, 1, '换手渐变（s）'] as T,
}

// ── $Items：掉落物 [定 11-09，用户：复用 goodLiqPG 的挤出网格]。itemrender.js：物品贴图挤出 1 像素厚、方块缩成小立方；手持物品同一套
export const c_Items = {
  thick: [1 / 16, 0, 0.25, '物品挤出厚度（格）'] as T,
  scale: [0.25, 0.1, 0.5, '大小（格）'] as T,
  bob: [0.1, 0, 0.3, '上下浮动（格）'] as T,
  spin: [1, 0, 3, '自转速度'] as T,
  copies: [2, 17, 33, 49] as const,     // 堆叠数到这些值时画 2 / 3 / 4 / 5 份（MC）
}

/** 每个文件夹的预设（面板头部的按钮；人眼对比用）。只写与默认不同的键 */
export const PRESETS = {
  Shadow: { '现状': { grassRecv: 0, grassRoot: 0 }, 'v2/gl': { strength: 0.68 }, '浓': { strength: 1, grassRoot: 1, sharpRes: 4096 } },
  Water:  { '只 SSR': { planar: false }, 'v2/gl': { refl: 0.36, f0: 0.02 }, '镜面': { refl: 1, f0: 0.1, reflBlur: 0 } },
  Fog:    { '关': { cave: 0, caveWarm: 0, weather: 0, bolt: 0 }, '探矿': { cave: 2, caveDist: 16, caveWarm: 1.5 } },
  Precip: { '毛毛雨': { density: 0.4, len: 0.3, alpha: 0.2 }, '暴雨': { density: 2, len: 1.2, slant: 1.5, crown: 2 }, '暴风雪': { snowSize: 1.5, snowDrift: 3 } },
  Sky:    { '全景': {}, '阴沉': { overcastDim: 0.8, overcastDesat: 1, stormDim: 0.5 } },
  Bolt:   { '细': { width: 0.12, branch: 0.6 }, '粗': { width: 0.8, glow: 2, strikes: 4 } },
} as const

/** rgl 现有参数 → c_ 主题（数值见 rgl/index.js:171）。粒子相关的键已在 fx.ts c_Fx */
export const TOPICS = {
  '$Sky':   ['clouds', 'panoExp', 'panoNightExp', 'panoClamp', 'panoRot', 'sunSize', 'moonSize'],
  '$Shadow': ['shadowQ', 'sharpDist', 'sharpSoft', 'sharpFly', 'blobShadow'],
  '$Water': ['waterStyle', 'ssrSteps', 'waterCaustic', 'waterClarity', 'waveStrength', 'waveNoise', 'waveScale', 'waterTexWave', 'waterTexSpeed', 'waterTexNormal',
               'waterDeepSat', 'waterD2', 'foamWidth', 'foamThick', 'foamColor', 'shoreFade', 'shoreWaveAmp', 'shoreWaveSpeed', 'ripple', 'rippleSurge', 'rippleDelay', 'fallOpacity'],
  '$Under': ['uwCaustic', 'uwShafts', 'uwDensity', 'uwWindow'],
  '$Fog':   ['volumetric', 'volCloud', 'caveHaze', 'fog', 'mist', 'heatHaze'],
  '$Leaf':  ['leafPbr', 'leafNormal', 'leafRough', 'leafSpec', 'leafEnv', 'leafTrans', 'leafRim', 'leafPom', 'leafGlow'],
  '$Gl':    ['rd', 'waving', 'gamma', 'pbr', 'pom', 'pomSmooth', 'pomShadow', 'rainPom', 'taa', 'flare', 'flareIdle', 'lightDither', 'lavaSpeed', 'flickAmp', 'flickSpeed'],
  '$Pack':  ['pgKeep', 'texMax', 'packPom', 'packNrmY', 'emissive'],
  '$Ent':   ['entScene', 'entExposure'],
  '$Load':  ['meshJobs', 'meshBudget', 'appearRise', 'fadeSec', 'appearSec', 'appearNear'],
} as const

export const mod = {
  id: 'render', where: 'render', catalog: 'core', layer: 'render', axis: 'look', ms: 'M1-6', doc: 's03、s15；rgl / lite。只吃 Pose + Here + Clock + 区块事件，其余经 gm 取',
  emit: { marker: 'edge', map_tap: 'edge' },
  sub: ['pose', 'here', 'clock', 'delta', 'chunk_in', 'chunk_out', 'light', 'screen', 'lightning', 'tbl_change'],
  depends: ['world', 'marks', 'pane'],       // marks：画标记；world.height：雨的遮挡；world.at：洞穴雾的取样兜底
  tables: ['sky.json', 'blk.tsv'],          // blk.tsv：emit 列（手持光）、fx 列（发射点，见 fx.ts）
  c_: ['$Gl', '$Sky', '$Cloud', '$Shadow', '$Water', '$Under', '$Fog', '$Precip', '$Bolt', '$HeldLight', '$Items', '$Leaf', '$Pack', '$Ent', '$Load'],
  save: [],
} as const satisfies Mod
