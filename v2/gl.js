// v2/gl.js — v2 DDA 渲染器的模块化 / 拆 pass 版（goal-glmod；?r=v2/gl）。?r=v2 仍是单文件原版 v2.js
import { passKit, u, glsl } from './pass.js';
import * as G from './glsl/common.js';
import * as GC from './glsl/cloud.js';
import * as GT from './glsl/trace.js';
import * as GD from './glsl/dbg.js';
import * as GW from './glsl/water.js';
import * as GU from './glsl/uw.js';
import * as GS from './glsl/shade.js';
// 接口与 v1.js 相同：createRenderer(ctx) → { name, buildChunk, disposeChunk, update, render, stats }
// 进度：参数 P + 面板 DSL + Tweakpane；环形 3D 体素纹理 + 砖占用 + 列高；两级 DDA（不透明/镂空/花草/火把/水面）
//       ddaRT（绘制缓冲 × scale）与 sceneRT 深度合成；v1 同款四角平滑光照 + AO；太阳阴影射线
//       goalP3P4：uVox RGBA8UI（id / 光照 / meta / DF|flags）+ CPU 镜像、按区块切比雪夫距离场（Worker）、ChunkSource 事件 / Env 适配器

// ───────────────────────── 面板 DSL（handover §8） ─────────────────────────
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const R = (min, max, step = 0.01, log = false) => ({ min, max, step, log });
export const V2 = (label, rx, ry, fx) => ({ label, rx, ry, fx });
export const vec2 = (get, kx, ky) => ({ __vec2: true, get, kx, ky });
export const toN = (v, r) => clamp(r.log ? 2 * Math.log(v / r.min) / Math.log(r.max / r.min) - 1
                                         : 2 * (v - r.min) / (r.max - r.min) - 1, -1, 1);
export const fromN = (n, r) => {
  n = clamp(n, -1, 1);
  const v = r.log ? r.min * Math.pow(r.max / r.min, (n + 1) / 2) : r.min + (n + 1) / 2 * (r.max - r.min);
  return r.step ? +(Math.round(v / r.step) * r.step).toFixed(6) : v;
};
const fmt = v => Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

export function buildPane(pane, spec, apply, resetDefaults) {
  const refreshers = [];
  for (const [title, rows] of spec) {
    const f = pane.addFolder({ title, expanded: title === '性能' });
    for (const [key, tgt, o] of rows) {
      if (o.button) { f.addButton({ title: o.button }).on('click', () => { o.fn(); refresh(); }); continue; }   // 预设按钮（只写 P）
      if (tgt && tgt.__vec2) {
        const { get, kx, ky } = tgt, { rx, ry, label, fx } = o;
        const pt = { get x() { return toN(get()[kx], rx); }, set x(n) { get()[kx] = fromN(n, rx); },
                     get y() { return toN(get()[ky], ry); }, set y(n) { get()[ky] = fromN(n, ry); } };
        const b = f.addBinding({ v: pt }, 'v', { label, x: { min: -1, max: 1 }, y: { min: -1, max: 1, inverted: true },
                                                  picker: 'inline', expanded: false });   // 二维滑块默认折叠
        const relabel = () => { b.label = `${label} ${fmt(get()[kx])} / ${fmt(get()[ky])}`; };
        b.on('change', () => { relabel(); apply(kx, fx); apply(ky, fx); });
        relabel(); refreshers.push(relabel);
      } else if (o.presets) {                  // 预设下拉（选项会变：删掉重建在原位置）+ 保存 / 删除
        // 「＋ 保存为新预设…」「－ 删除当前预设」是下拉里的两个动作项：执行后重建下拉，选中项回到当前预设
        const st = { v: '' }; let b = null, busy = false;
        const mk = () => {
          const index = b ? f.children.indexOf(b) : undefined;
          if (b) b.dispose();
          busy = true; st.v = o.current(); busy = false;
          b = f.addBinding(st, 'v', { label: o.label, options: { ...o.list(), '＋ 保存为新预设…': '#save', '－ 删除当前预设': '#del' }, index });
          b.on('change', () => {
            if (busy) return;
            if (st.v === '#save') o.save(); else if (st.v === '#del') o.remove(); else if (st.v) { o.select(st.v); refresh(); }
            setTimeout(mk, 0);              // 动作项 / 列表变化后重建（不能在自身 change 回调里同步 dispose）
          });
        };
        mk(); refreshers.push(() => { if (st.v !== o.current()) mk(); });
      } else if (o.bool) {                     // 两档开关 → checkbox（P 里仍存 0/1）
        const pt = { get v() { return !!tgt()[key]; }, set v(b) { tgt()[key] = b ? 1 : 0; } };
        f.addBinding(pt, 'v', { label: o.label }).on('change', () => apply(key, o.fx));
      } else {
        const { label, min, max, step, fx, options } = o;
        f.addBinding(tgt(), key, options ? { label, options } : { label, min, max, step }).on('change', () => apply(key, fx));
      }
    }
  }
  const refresh = () => { pane.refresh(); refreshers.forEach(r => r()); };
  pane.addButton({ title: '重置默认' }).on('click', () => { resetDefaults(); refresh(); });
  return { refresh };
}

// ───────────────────────── 参数默认值（handover §8.4） ─────────────────────────
const P_VER = 3, P_KEY = 'vc.v2.params';
const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || /Mobi|Android/i.test(navigator.userAgent);
export const P_DEFAULTS = {"scale":0.7999999999999999,"steps":128,"shadowSteps":20,"shadowStrength":0.68,"shadowDist":6,"waterClarity":0.72,"reflStrength":0.36,"fogA1":1,"sun":0.33,"exposure":0.86,"sunAz":1.18,"sunEl":0.32,"aoStrength":0.59,"aoCurve":1.92,"waterA2":1,"waterA1":0.78,"waterD2":11,"waterD1":1.5,"waveStrength":0.06,"foamWidth":1.2,"waveNoise":0.08,"waveScale":1,"uwNear":7.1,"uwFar":50,"maxMP":7.6,"cloudThick":5,"cloudDensity":0.34,"cloudShade":0.28,"cloudLight":0.36,
  // 植被：摇动 / 树叶阴影 / 远处镂空 LOD（leafShadowDist ≥64、leafLodDist ≥160 视为 ∞）
  swayAmp: 0.04, swayFreq: 1.2, swayDist: 32, leafShadow: 0, leafShadowDist: 24, leafLodDist: 64, leafLodMs: 400,
  // 树叶：0 方块 / 1 卡片；内部剔除（LEAVES_INNER）
  leafStyle: 0, leafCardLayers: 2, leafOverhang: 0.25, leafHaloDist: 32, leafSeed: 0, leafCullInterior: 1, leafDensity: 1,
  // 水下看水面（v1 表现：半透明水贴图面）
  uwSurfaceAlpha: 0.67, uwRipple: 0.4, uwRippleFreq: .64, uwRippleMix: 0.5, uwPattern: 0.6, shoreWaveAmp: 0.12, shoreWaveSpeed: 1, uwTintMix: 0.5, uwShafts: 0.5,
  // 星空 / 云星搭配 / 云风格（0 体积 / 1 MC 方块 / 2 Bliss）
  starDensity: 67, starProb: 0.16, starGamma: 1.6, starTwinkle: 0.6, starMinElev: 0., cloudStarBlock: 1,
  cloudNightAlpha: 1., cloudStyle: 0, cloudAlpha: 0.2, skyDarkenNight: 0.12,
  // 水面风格（0 噪声 / 1 Reimagined / 2 Bliss，法线分支）+ 预设参数；shoreFade = 岸边软化（竖直水深格）
  waterStyle: 0, waterSpec: 20, waterSkyZen: 0, waterDeepSat: 0, shoreFade: 0.3,
  // Reimagined 水面（SurvivalCraft 式）：贴图坐标摆动 幅度(格)/速度，贴图明度 → 法线的强度
  waterTexWave: 0.06, waterTexSpeed: 1.2, waterTexNormal: 0.6,
  // 水下光束：图样尺度 / 最远采样距离(格) / 沿视线衰减 / 锐度指数 / 前向散射指数 / 方向（0 光照方向含面板偏移 ↔ 1 天上可见的太阳）
  // 水面折射：0 = 水下看到的太阳方向不折射（与透过水面看到的天空一致，光束汇聚在太阳上）↔ 1 = 物理折射（更靠天顶）
  uwShaftScale: 1, uwShaftLen: 24, uwShaftFall: 0.07, uwShaftSharp: 3, uwShaftPhase: 3, uwShaftVis: 1, uwShaftRefr: 0,
  // P2 距离场：0 = 强制退化（uBrick 路径，A/B 测步数用）/ 1 = 开
  df: 1,
  // Bliss 云（风格 2）独立 ¼×¼ 低分辨率 pass（§9.2-2）：0 = 每像素在 DDA 里追（旧）/ 1 = 低分辨率 pass + 双线性。
  // 默认关：本机（RPL-S 核显）两遍云 pass 只 1.6–2.0 ms，但同帧 DDA pass 计时 +7–13 ms（相邻 pass 的计时查询重叠，无法可靠归因），整帧合计变慢
  cloudLowRes: 0,
  // scale < 1 时按 DDA 像素覆盖的场景纹素最远深度裁剪射线（§4-5）：实体 / 近景多时省步数；空场景实测 +0.4–1.3 ms → 默认关
  sceneClip: 0,
  // glmod §-1.B 软阴影 pass（风格通道，默认关 = 旧硬阴影）：主 pass 不追阴影射线 → ¼/½ 分辨率阴影 pass + 深度感知模糊 + 合成
  //   softShStr = 阴影内直射项的衰减上限（smooth-gls ≤ 0.35；1 = 与硬阴影同强度）；softShBlur = 模糊半径(格)；softShCone = 太阳方向抖动锥(弧度)
  softShadow: 0, softShRes: 4, softShStr: 0.35, softShBlur: 1.5, softShCone: 0.06};
// 水面预设按钮：只写 P（法线分支由 waterStyle → WATER_STYLE 宏切换）
const WATER_PRESETS = {
  noise: { waterStyle: 0, reflStrength: 0.36, waterClarity: 0.72, foamWidth: 1.2, waveNoise: 0.08, waveStrength: 0.06, waterSpec: 20,  waterSkyZen: 0, waterDeepSat: 0, shoreFade: 0.3 },
  mc:    { waterStyle: 1, reflStrength: 0.6,  waterClarity: 0.85, foamWidth: 1.2, waveNoise: 0,    waveStrength: 0.06, waterSpec: 64,  waterSkyZen: 1, waterDeepSat: 1, shoreFade: 0.4,
           waterTexWave: 0.06, waterTexSpeed: 1.2, waterTexNormal: 0.6 },
  bliss: { waterStyle: 2, reflStrength: 0.8,  waterClarity: 0.92, foamWidth: 1.2, waveNoise: 0.03, waveStrength: 0.05, waterSpec: 180, waterSkyZen: 1, waterDeepSat: 1, shoreFade: 0.6 },
};
// 云预设按钮：风格 + 适合该风格的厚度/密度/明暗
const CLOUD_PRESETS = {
  vol:   { cloudStyle: 0, cloudThick: 5,  cloudDensity: 0.34, cloudShade: 0.28, cloudLight: 0.36 },
  mc:    { cloudStyle: 1, cloudThick: 4,  cloudAlpha: 0.85 },
  bliss: { cloudStyle: 2, cloudThick: 5,  cloudDensity: 0.34, cloudShade: 0.28, cloudLight: 0.36 },
};   // maxMP = DDA 像素上限（百万），大窗口自动降内部分辨率
function loadP() {
  const P = { ...P_DEFAULTS };
  try {
    const s = JSON.parse(localStorage.getItem(P_KEY) || 'null');
    if (s && s.ver === P_VER) for (const k in P_DEFAULTS) if (typeof s[k] === typeof P_DEFAULTS[k] && (typeof s[k] !== 'number' || isFinite(s[k]))) P[k] = s[k];
  } catch (e) {}
  return P;
}
function saveP(P) { try { localStorage.setItem(P_KEY, JSON.stringify({ ver: P_VER, ...P })); } catch (e) {} }
// 命名预设（面板「预设」下拉）：localStorage vc.v2.presets = { 名字: P 快照 }；P_KEY 仍是「上次」自动保存
const PS_KEY = 'vc.v2.presets';
function loadPresets() { try { const o = JSON.parse(localStorage.getItem(PS_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function savePresets(o) { try { localStorage.setItem(PS_KEY, JSON.stringify(o)); } catch (e) {} }
// 只认 P_DEFAULTS 里有、且类型相同的键（快照 / &json= 都走它）；对象按键递归（deep 赋值）
function assignTyped(dst, src) {
  for (const k in src) {
    const v = src[k], d = dst[k];
    if (d && typeof d === 'object' && v && typeof v === 'object' && !Array.isArray(v)) assignTyped(d, v);
    else if (k in dst && typeof v === typeof d && (typeof v !== 'number' || isFinite(v))) dst[k] = v;
  }
  return dst;
}
// URL 里的 &json=（或 #json=）：URL 编码的 JSON。顶层 P 键直接赋；{"P":{…},"D":{…}} 分桶 deep 赋值；{"preset":"名字"} 先套命名预设
function urlJson() {
  if (typeof location === 'undefined') return null;
  const m = (location.search + '&' + location.hash.replace(/^#/, '')).match(/[?&]json=([^&]*)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(m[1])); } catch (e) { console.warn('[v2] &json= 解析失败', e); return null; }
}

export function createRenderer(ctx) {
  const P = loadP();
  // 调试/测量状态（不持久化）：view = DBG 宏（handover §5.2），raw = 原始计数编码（bench 用），time/cloudX = 冻结动画
  const D = { view: 0, raw: 0, time: null, cloudX: null, hostStars: 0, ref: 0, noTimer: 0 };   // noTimer=1：不发计时查询（bench 测墙钟吞吐时；查询本身会串行化 pass）   // hostStars=1：保留宿主星星（p0 对比用）
  // ref=1（setRef）参考模式：主射线 / 阴影 / 反射折射步数预算全部 576 + 精确入格（编译期 REF_MODE）——只给「DF 开/关 0 px」这类逐像素对比用
  const S = () => ctx.settings, Pr = () => P, Dr = () => D;
  const BUILTIN = { '@default': P_DEFAULTS, '@vol': { ...P_DEFAULTS, ...CLOUD_PRESETS.vol, ...WATER_PRESETS.noise },
                    '@mc': { ...P_DEFAULTS, ...CLOUD_PRESETS.mc, ...WATER_PRESETS.mc }, '@bliss': { ...P_DEFAULTS, ...CLOUD_PRESETS.bliss, ...WATER_PRESETS.bliss } };
  let curPreset = '';
  const presetSnap = name => BUILTIN[name] || loadPresets()[name];
  {   // &json= 覆盖（在树叶状态 / 着色器宏推导之前）
    const j = urlJson();
    if (j && typeof j === 'object') {
      if (typeof j.preset === 'string' && presetSnap(j.preset)) { assignTyped(P, presetSnap(j.preset)); curPreset = j.preset; }
      const top = { ...j }; delete top.P; delete top.D; delete top.preset;
      assignTyped(P, top); if (j.P) assignTyped(P, j.P); if (j.D) assignTyped(D, j.D);
    }
  }
  const PRESET_ROW = { presets: true, label: '预设',
    list: () => { const o = { '— 上次 —': '', '默认': '@default', '体积云 + 噪声水': '@vol', 'MC + Reimagined': '@mc', 'Bliss': '@bliss' };
                  for (const k of Object.keys(loadPresets())) o[k] = k; return o; },
    current: () => curPreset,
    select: name => { const sn = presetSnap(name); if (!sn) return; Object.assign(P, P_DEFAULTS); assignTyped(P, sn); curPreset = name; applyAll(); },
    save: () => { const n = typeof prompt === 'function' ? prompt('预设名', curPreset && !curPreset.startsWith('@') ? curPreset : '') : null;
                  if (!n || n.startsWith('@')) return false; const o = loadPresets(); o[n] = { ...P }; savePresets(o); curPreset = n; return true; },
    remove: () => { if (!curPreset || curPreset.startsWith('@')) return false; const o = loadPresets(); delete o[curPreset]; savePresets(o); curPreset = ''; return true; } };
  const DBG_VIEWS = { '正常': 0, '主射线迭代': 1, 'fetch 次数': 2, '跳过平滑光照': 3, 'DF 跳跃/退化': 4, '层级 列/砖/体素': 5, 'texture() 采样': 6 };
  const PANEL = [
    ['性能', [
      ['rd',          S,  { label: '视距(区块)', ...R(2, 16, 1), fx: 'tex' }],
      ['scale',       Pr, { label: 'DDA 分辨率', ...R(0.25, 2.5, 0.05), fx: 'rt' }],
      ['maxMP',       Pr, { label: '像素上限(百万)', ...R(0.2, 8, 0.1), fx: 'rt' }],
      ['sceneClip',   Pr, { label: '低分辨率深度裁剪', bool: true, fx: 'def' }],
      ['steps',       Pr, { label: '渲染迭代', ...R(32, 576, 8) }],
      ['shadowSteps', Pr, { label: '阴影迭代', ...R(0, 64, 4), fx: 'sh' }],
      ['df',          Pr, { label: '距离场跳跃', bool: true, fx: 'def' }],
      ['v', vec2(Pr, 'shadowStrength', 'shadowDist'), V2('阴影 强度/距离', R(0, 1), R(4, 96, 1, true))],
      ['fogA1',       Pr, { label: '雾强度', ...R(0, 1) }],
      ['view',        Dr, { label: '调试视图', options: DBG_VIEWS, fx: 'dbg' }],
      ['preset',      null, PRESET_ROW],
    ]],
    ['光影', [
      ['sun',         Pr, { label: '日照倍率', ...R(0, 1) }],
      ['exposure',    Pr, { label: '曝光度', ...R(0.2, 3, 0.01) }],
      ['v', vec2(Pr, 'sunAz', 'sunEl'),           V2('光向量 方位/仰角偏移', R(-3.14, 3.14, 0.01), R(-1, 1, 0.01))],
      ['v', vec2(Pr, 'aoStrength', 'aoCurve'),    V2('AO 强度/曲线', R(0, 1), R(0.5, 3, 0.01, true))],
      ['softShadow',  Pr, { label: '软阴影 pass', bool: true, fx: 'def' }],
      ['softShRes',   Pr, { label: '软阴影分辨率', options: { '全': 1, '½': 2, '¼': 4 } }],
      ['v', vec2(Pr, 'softShStr', 'softShBlur'),  V2('软阴影 强度/模糊(格)', R(0, 1), R(0, 4, 0.05))],
      ['softShCone',  Pr, { label: '软阴影 抖动锥', ...R(0, 0.3, 0.005) }],
    ]],
    ['植被', [
      ['v', vec2(Pr, 'swayAmp', 'swayFreq'),      V2('摇动 幅度/频率', R(0, 0.15, 0.005), R(0.3, 3, 0.05))],
      ['swayDist',    Pr, { label: '摇动距离(格)', ...R(8, 96, 1) }],
      ['leafShadow',  Pr, { label: '树叶阴影', options: { '精确': 0, '实心': 1, '无': 2 }, fx: 'def' }],
      ['v', vec2(Pr, 'leafShadowDist', 'leafLodDist'), V2('精确阴影/镂空距离 (max=∞)', R(4, 64, 1, true), R(16, 160, 1, true), 'def')],
      ['leafLodMs',   Pr, { label: '精度切换渐变 ms', ...R(0, 2000, 10) }],
    ]],
    ['树叶', [
      ['leafStyle',   Pr, { label: '卡片样式', bool: true, fx: 'leaf' }],
      ['leafCardLayers', Pr, { label: '卡片层数', ...R(1, 3, 1) }],
      ['v', vec2(Pr, 'leafOverhang', 'leafHaloDist'), V2('外伸/外伸距离', R(0, 0.5, 0.01), R(8, 96, 1, true), 'leaf')],
      ['leafSeed',    Pr, { label: '位置种子', ...R(0, 255, 1) }],
      ['leafCullInterior', Pr, { label: '内部剔除', bool: true, fx: 'leaf' }],
      ['leafDensity', Pr, { label: '卡片密度', ...R(0.5, 1.5, 0.01) }],
    ]],
    ['云', [
      ['cloudStyle',  Pr, { label: '风格', options: { '体积': 0, 'MC 方块': 1, 'Bliss': 2 }, fx: 'def' }],
      ['cloudLowRes', Pr, { label: 'Bliss 低分辨率', bool: true, fx: 'def' }],
      ['v', vec2(Pr, 'cloudThick', 'cloudDensity'), V2('厚度/密度', R(1, 16, 0.5), R(0.02, 1, 0.01, true))],
      ['v', vec2(Pr, 'cloudShade', 'cloudLight'),   V2('暗部/日照', R(0, 1), R(0, 1))],
      ['v', vec2(Pr, 'cloudAlpha', 'cloudNightAlpha'), V2('alpha(MC)/夜间倍率', R(0, 1), R(0.5, 2))],
      ['', null, { button: '云：体积', fn: () => setPreset(CLOUD_PRESETS.vol) }],
      ['', null, { button: '云：MC 方块', fn: () => setPreset(CLOUD_PRESETS.mc) }],
      ['', null, { button: '云：Bliss', fn: () => setPreset(CLOUD_PRESETS.bliss) }],
    ]],
    ['水体', [
      ['waterStyle',  Pr, { label: '风格', options: { '噪声': 0, 'Reimagined': 1, 'Bliss': 2 }, fx: 'def' }],
      ['v', vec2(Pr, 'waterClarity', 'reflStrength'), V2('透亮/反射',   R(0, 1), R(0, 1))],
      ['v', vec2(Pr, 'waterTexWave', 'waterTexSpeed'), V2('Reimagined 贴图波动 幅度/速度', R(0, 0.25, 0.005), R(0, 4, 0.05))],
      ['waterTexNormal', Pr, { label: 'Reimagined 贴图法线', ...R(0, 2, 0.01) }],
      ['v', vec2(Pr, 'waterA2', 'waterA1'),       V2('不透明 深/浅', R(0, 1), R(0, 1))],
      ['v', vec2(Pr, 'waterD2', 'waterD1'),       V2('水深过渡 深/浅(格)', R(1, 24, 0.5, true), R(0, 8, 0.25))],
      ['v', vec2(Pr, 'waveStrength', 'waveNoise'), V2('波浪 正弦/噪声', R(0, 0.2, 0.005), R(0, 0.4, 0.005))],
      ['waveScale',   Pr, { label: '噪声频率', ...R(0.2, 4, 0.05) }],
      ['v', vec2(Pr, 'waterSpec', 'waterSkyZen'), V2('高光指数/天顶反射', R(8, 256, 1, true), R(0, 1))],
      ['waterDeepSat', Pr, { label: '深水饱和', ...R(0, 1) }],
      ['', null, { button: '水面：噪声', fn: () => setPreset(WATER_PRESETS.noise) }],
      ['', null, { button: '水面：Reimagined', fn: () => setPreset(WATER_PRESETS.mc) }],
      ['', null, { button: '水面：Bliss', fn: () => setPreset(WATER_PRESETS.bliss) }],
    ]],
    ['岸边/水下', [
      ['v', vec2(Pr, 'foamWidth', 'shoreFade'),   V2('岸边 波纹范围/软化(格)', R(0, 1.5, 0.05), R(0, 1.5, 0.05))],
      ['v', vec2(Pr, 'shoreWaveAmp', 'shoreWaveSpeed'), V2('岸边波纹 起伏(格)/速度', R(0, 0.3, 0.01), R(0, 3, 0.05))],
      ['uwSurfaceAlpha', Pr, { label: '水下看水面不透明', ...R(0, 1) }],
      ['v', vec2(Pr, 'uwRipple', 'uwRippleFreq'), V2('水下仰视 波纹/频率', R(0, 1), R(0.5, 1.5, 0.01))],
      ['v', vec2(Pr, 'uwRippleMix', 'uwPattern'), V2('波纹 经典↔水底式/图样亮度', R(0, 1), R(0, 1.5))],
      ['uwTintMix',   Pr, { label: '水下 水色吸收', ...R(0, 1) }],
      ['v', vec2(Pr, 'uwNear', 'uwFar'),          V2('水下雾 近/远', R(0.2, 8, 0.1), R(6, 96, 1))],
    ]],
    ['水下光束', [
      ['v', vec2(Pr, 'uwShafts', 'uwShaftScale'), V2('强度/图样尺度', R(0, 1.5), R(0.25, 4, 0.01, true))],
      ['v', vec2(Pr, 'uwShaftLen', 'uwShaftFall'), V2('长度(格)/衰减', R(4, 64, 1), R(0, 0.3, 0.005))],
      ['v', vec2(Pr, 'uwShaftSharp', 'uwShaftPhase'), V2('锐度/前向散射', R(1, 8, 0.1), R(0, 12, 0.1))],
      ['uwShaftVis',  Pr, { label: '方向 光照↔可见太阳', ...R(0, 1) }],
      ['uwShaftRefr', Pr, { label: '水面折射', ...R(0, 1) }],
    ]],
    ['天空', [
      ['v', vec2(Pr, 'starDensity', 'starProb'),  V2('星 密度/概率', R(24, 96, 1), R(0.02, 0.2, 0.005))],
      ['v', vec2(Pr, 'starGamma', 'starTwinkle'), V2('星 gamma/闪烁', R(1, 4, 0.05), R(0, 1))],
      ['v', vec2(Pr, 'starMinElev', 'cloudStarBlock'), V2('星 最低仰角/云遮星', R(0, 0.4), R(0, 1))],
      ['skyDarkenNight', Pr, { label: '夜空压暗', ...R(0, 1) }],
      ['hostStars',   Dr, { label: '宿主星星(对照)', bool: true }],
    ]],
  ];


  // ───────────────── 世界入口：ChunkSource + BlockTable（handover §2.1） ─────────────────
  // 宿主可在 ctx.source / ctx.blockTable 里给自己的适配器；缺省用 VoxelCraft 适配器（读 ctx.chunks 的 c.blocks/sky/blk）
  const { THREE, renderer } = ctx;
  const SRC = ctx.source || voxelCraftSource(ctx), BT = ctx.blockTable || voxelCraftBlocks(ctx), ENV = ctx.env || voxelCraftEnv(ctx);
  const CS = 16, H = SRC.height;
  if (SRC.size !== CS || H % 16 || H > 256) throw new Error(`[v2] ChunkSource 不支持：size ${SRC.size} height ${H}（要求 16 / 16 的倍数且 ≤256）`);
  const BY = H / 4, NS = H / 16;                        // 每列砖层数 / 区块段数（≤16，段掩码 16 位）
  const ckey = (cx, cz) => cx + ',' + cz;
  // 流体判定（§10.2）：JS 侧 BT.fluid[id] || id === waterId；GLSL 侧 isFluid() 读 uVox.A 的 FLUID 位（由 BlockState.fluid 打包）
  const isFluidId = id => id === BT.waterId || !!(BT.fluid && BT.fluid[id]);
  const blockAt = (x, y, z) => {                       // 只经 ChunkSource 读世界（不用宿主 getBlock）
    if (y < 0 || y >= H) return 0;
    const b = SRC.getBlocks ? SRC.getBlocks(x >> 4, z >> 4) : (SRC.getChunk(x >> 4, z >> 4) || {}).blocks;
    return b ? b[((x & 15) * CS + (z & 15)) * H + y] : 0;
  };

  // ───────────────── 环形体素纹理 + 4³ 砖占用 + 区块列（列高 + 段标记，handover §3.1/§3.3） ─────────────────
  // mir[s] = 槽位 s 的 CPU 镜像（goal-renderapi §5 Mirror；布局同 uVox 一个区块：((lz*H + y)*16 + lx)*VB），GPU 内容的真值，按需分配
  // rev[s] = 上次上传的 ChunkData.rev（-1 = 无）；uploads / lightUploads / clears / dedup = 各事件路径计数（verify / bench 用）
  // upMs = 'blocks' 整块上传的主线程 CPU 累计（tools/upload-cost.mjs）；dfSent/dfDone/dfDrop/dfMin/dfInval/edits = 距离场与编辑队列计数
  const VB = 4;                                          // 每体素字节数：uVox RGBA8UI = id / sky<<4|blk / meta / dist|flags（goal-renderapi §4 UVOX）
  const ring = { rd: 0, N: 0, SX: 0, vox: null, brick: null, col: null, colData: null, owner: [], maxY: null, worldMaxY: 0,
                 mir: [], rev: null, dfSeq: null, dfAck: null, uploads: 0, upMs: 0, lightUploads: 0, clears: 0, dedup: 0,
                 dfSent: 0, dfDone: 0, dfDrop: 0, dfMin: 0, dfInval: 0, edits: 0 };
  const stVox = new THREE.Data3DTexture(new Uint8Array(CS * H * CS * VB), CS, H, CS);   // 上传源（image.data 指向镜像槽位；不绑定到着色器）
  const stBrick = new THREE.Data3DTexture(new Uint8Array(4 * BY * 4), 4, BY, 4);
  const boxV = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CS - 1, H - 1, CS - 1));
  const boxB = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(3, BY - 1, 3));
  const dstPos = new THREE.Vector3();
  const wrap = (a, m) => ((a % m) + m) % m;
  function intTex3D(w, h, d, fmt, ifmt, bpp) {
    const t = new THREE.Data3DTexture(new Uint8Array(w * h * d * bpp), w, h, d);
    Object.assign(t, { format: fmt, type: THREE.UnsignedByteType, internalFormat: ifmt, minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter, generateMipmaps: false, unpackAlignment: 1, flipY: false });
    t.needsUpdate = true; renderer.initTexture(t); t.image.data = null;   // 只在 GPU 上保留
    return t;
  }
  // ── 方块状态表（goal-renderapi §2 BlockState / §4 UINFO）：uInfo 256 × 64，列 id，行 (meta&15)*4 + k ──
  //   k0 r = kind | opaque<<4 | solid<<5 | cullSelf<<6 | leaf<<7，g/b/a = tileTop/Bot/Side（与旧 256×1 表逐位相同）
  //   k1 r = shape，g = facing | axis<<2 | flip<<4，b = emissive | fluid<<4 | translucent<<5 | occupied<<6 | sway<<7，a = tileFront
  //   k2 rgb = transmit，a = tint；k3 保留 0
  // 宿主给 BT.state(id, meta) 就用它；否则 defaultState() 由数组视图拼出，16 个 meta 行复制同一状态（宿主 A）
  // 树叶扩展（goals §1/§2）：k0 bit7 = 树叶；id 192..254 = 卡片外伸（halo，kind 5，id-191 = 6 方向掩码，指向树叶格）；
  // id 255 = LEAVES_INNER（六面都是树叶的树叶格，按不透明处理）。仅当宿主方块 id 都 < 192 时启用
  const LV = BT.leavesId, LEAF_OK = LV != null && !Array.prototype.some.call(BT.kind.slice(192), k => k);
  if (LV != null && !LEAF_OK) console.warn('[v2] 方块 id 占用了 192..255：树叶卡片/内部剔除不可用');
  function defaultState(id) {
    const kind = BT.kind[id], fluid = kind === 4 || isFluidId(id) ? 1 : 0;
    return { kind, opaque: BT.opaque[id] ? 1 : 0, solid: BT.solid[id] ? 1 : 0, cullSelf: BT.cullSelf && BT.cullSelf[id] ? 1 : 0, leaf: id === LV ? 1 : 0,
             sway: 0, occupied: kind && !fluid ? 1 : 0, fluid, translucent: 0, emissive: BT.emissive ? BT.emissive[id] : 0,
             shape: 0, facing: 0, axis: 0, flip: 0, tiles: [BT.tileTop[id], BT.tileBot[id], BT.tileSide[id], BT.tileSide[id]],
             transmit: [255, 255, 255], tint: BT.tint ? BT.tint[id] : 0 };
  }
  function v2State(id, m) {                              // 宿主状态 + v2 保留 id（树叶扩展）
    if (LEAF_OK && id >= 192) {
      const st = defaultState(LV);
      if (id === 255) return { ...st, kind: 1, opaque: 1, cullSelf: 0, leaf: 0 };   // LEAVES_INNER 不带树叶位：不参与树叶的 alpha / LOD / 摇动 / 阴影档
      return { ...defaultState(0), kind: 5, occupied: 1, tiles: [0, 0, 0, 0] };
    }
    const st = BT.state ? BT.state(id, m) : defaultState(id);
    return LEAF_OK || !st.leaf ? st : { ...st, leaf: 0 };
  }
  const infoData = new Uint8Array(256 * 64 * 4);
  const VFLAG = new Uint8Array(16 * 256);                // (meta&15)<<8 | id → uVox.A 高 3 位：OPAQUE<<5 | LEAF<<6 | FLUID<<7
  const VCLS = new Uint8Array(16 * 256);                 // (meta&15)<<8 | id → DF 分类：0 空 / 1 占据（state.occupied）/ 2 流体
  const VKIND = new Uint8Array(16 * 256);                // (meta&15)<<8 | id → kind（含 v2 保留 id；编辑后从镜像重算砖 / 列高）
  for (let m = 0; m < 16; m++) for (let id = 0; id < 256; id++) {
    const st = m && !BT.state ? null : v2State(id, m);
    if (!st) {                                           // 无 meta 宿主：复制第 0 行
      for (let k = 0; k < 4; k++) infoData.copyWithin(((m * 4 + k) * 256 + id) * 4, (k * 256 + id) * 4, (k * 256 + id) * 4 + 4);
      VFLAG[(m << 8) | id] = VFLAG[id]; VCLS[(m << 8) | id] = VCLS[id]; VKIND[(m << 8) | id] = VKIND[id]; continue;
    }
    const T = st.tiles, o = id * 4, row = m * 4 * 256 * 4;
    infoData.set([st.kind | st.opaque << 4 | st.solid << 5 | st.cullSelf << 6 | st.leaf << 7, T[0], T[1], T[2]], row + o);
    infoData.set([st.shape, st.facing | st.axis << 2 | st.flip << 4, (st.emissive & 15) | st.fluid << 4 | st.translucent << 5 | st.occupied << 6 | st.sway << 7, T[3]], row + 1024 + o);
    infoData.set([st.transmit[0], st.transmit[1], st.transmit[2], st.tint], row + 2048 + o);
    VFLAG[(m << 8) | id] = st.opaque << 5 | st.leaf << 6 | st.fluid << 7;
    VCLS[(m << 8) | id] = st.occupied ? 1 : st.fluid ? 2 : 0; VKIND[(m << 8) | id] = st.kind;
  }
  const LEAF_CARD_LAYER = BT.tileCard != null ? BT.tileCard : (LV != null ? BT.tileSide[LV] : 0);
  const infoTex = new THREE.DataTexture(infoData, 256, 64, THREE.RGBAIntegerFormat, THREE.UnsignedByteType);
  Object.assign(infoTex, { internalFormat: 'RGBA8UI', minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, unpackAlignment: 1 });
  infoTex.needsUpdate = true;

  function rebuildRing() {
    for (const k of ['vox', 'brick', 'col']) if (ring[k]) ring[k].dispose();
    const rd = ctx.settings ? ctx.settings.rd : 6, N = 2 * rd + 5, SX = N * CS;
    Object.assign(ring, { rd, N, SX, owner: new Array(N * N).fill(null), maxY: new Uint16Array(N * N), worldMaxY: 0,
                          mir: new Array(N * N).fill(null), rev: new Int32Array(N * N).fill(-1), dfSeq: new Int32Array(N * N), dfAck: new Int32Array(N * N) });
    ring.vox = intTex3D(SX, H, SX, THREE.RGBAIntegerFormat, 'RGBA8UI', VB);
    ring.brick = intTex3D(N * 4, BY, N * 4, THREE.RedIntegerFormat, 'R8UI', 1);
    // 区块列 RGBA16UI：r = maxY+1（0 = 空/无效），g = 区块坐标低 8 位 x | z<<8（槽位归属校验），
    //                 b = 全空段掩码，a = 全不透明段掩码（bit k = 第 k 个 16 格段）
    ring.colData = new Uint16Array(N * N * 4);
    ring.col = new THREE.DataTexture(ring.colData, N, N, THREE.RGBAIntegerFormat, THREE.UnsignedShortType);
    Object.assign(ring.col, { internalFormat: 'RGBA16UI', minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, unpackAlignment: 1 });
    ring.col.needsUpdate = true;
  }
  function setColumn(s, cx, cz, maxY, emptyM, fullM) {
    const old = ring.maxY[s];
    ring.maxY[s] = maxY;
    ring.colData.set([maxY, wrap(cx, 256) | (wrap(cz, 256) << 8), emptyM, fullM], s * 4);
    ring.col.needsUpdate = true;
    if (maxY >= ring.worldMaxY) ring.worldMaxY = maxY;
    else if (old >= ring.worldMaxY) {                   // 只有最高列下降时才 O(N²) 重算
      let m = 0; for (let i = 0; i < ring.maxY.length; i++) if (ring.maxY[i] > m) m = ring.maxY[i];
      ring.worldMaxY = m;
    }
  }
  const secNE = new Uint16Array(NS), secOp = new Uint16Array(NS);
  // 树叶后处理状态（只在 cull/halo 开关翻转时整环重传）
  const leafIdx = new Int32Array(CS * CS * H), haloM = new Uint8Array(CS * CS * H);
  const leafWant = () => ({ cull: LEAF_OK && P.leafCullInterior ? 1 : 0, halo: LEAF_OK && P.leafStyle === 1 && P.leafOverhang > 0 ? 1 : 0 });
  let leafState = leafWant();
  const blocksOf = (cx, cz) => SRC.getBlocks ? SRC.getBlocks(cx, cz) : (SRC.getChunk(cx, cz) || {}).blocks;
  const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];
  // 6 方向：0 +x 1 -x 2 +y 3 -y 4 +z 5 -z。内部树叶 → id 255；树叶旁的空气格 → halo id（含邻区块边界树叶）
  function leafPost(cx, cz, b, nl, vd, bd, maxY, keep) {
    const { cull, halo } = leafState;
    const nb = [blocksOf(cx + 1, cz), blocksOf(cx - 1, cz), blocksOf(cx, cz + 1), blocksOf(cx, cz - 1)];
    const at = (lx, y, lz) => {                         // 越界 y / 邻区块未生成 → -1（保守：视为暴露）
      if (y < 0 || y >= H) return -1;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS) {
        const n = lx >= CS ? nb[0] : lx < 0 ? nb[1] : lz >= CS ? nb[2] : nb[3];
        return n ? n[(((lx + CS) % CS) * CS + ((lz + CS) % CS)) * H + y] : -1;
      }
      return b[(lx * CS + lz) * H + y];
    };
    const vo = (lx, y, lz) => (lz * H * CS + lx) * VB + y * CS * VB;
    if (halo) haloM.fill(0);
    for (let k = 0; k < nl; k++) {
      const i = leafIdx[k], y = i % H, c = (i - y) / H, lx = (c / CS) | 0, lz = c % CS;
      let inner = true;
      for (let d = 0; d < 6; d++) {
        const x2 = lx + DX[d], y2 = y + DY[d], z2 = lz + DZ[d], n = at(x2, y2, z2);
        if (n !== LV) inner = false;
        if (halo && n === 0 && x2 >= 0 && x2 < CS && z2 >= 0 && z2 < CS) haloM[(x2 * CS + z2) * H + y2] |= 1 << (d ^ 1);
      }
      if (inner && cull) { const q = vo(lx, y, lz); vd[q] = 255; vd[q + 3] = (vd[q + 3] & 31) | VFLAG[255]; secOp[y >> 4]++; }
    }
    if (halo) {
      const BIT = [0, 1, 4, 5];                         // nb 顺序 +x -x +z -z → 从本区块 halo 指向邻块树叶的方向位
      for (let d = 0; d < 4; d++) {
        const n = nb[d]; if (!n) continue;
        for (let j = 0; j < CS; j++) {
          const ox = d === 0 ? CS - 1 : d === 1 ? 0 : j, oz = d === 2 ? CS - 1 : d === 3 ? 0 : j;
          const nx = d === 0 ? 0 : d === 1 ? CS - 1 : j, nz = d === 2 ? 0 : d === 3 ? CS - 1 : j;
          const bo = (ox * CS + oz) * H, no = (nx * CS + nz) * H;
          for (let y = 0; y < H; y++) if (n[no + y] === LV && b[bo + y] === 0) haloM[bo + y] |= 1 << BIT[d];
        }
      }
      for (let i = 0; i < haloM.length; i++) {
        const m = haloM[i]; if (!m) continue;
        const y = i % H, c = (i - y) / H, lx = (c / CS) | 0, lz = c % CS;
        const q = vo(lx, y, lz), d0 = vd[q + 3] & 31; if (keep && d0 > 1) dfNew.push(lx, y, lz);
        vd[q] = 191 + m; vd[q + 3] = 1 | VFLAG[191 + m]; dfOcc[i] = 1; bd[(lz >> 2) * BY * 4 + (lx >> 2) + (y >> 2) * 4] = 1;
        if (y >= maxY) maxY = y + 1;
        secNE[y >> 4]++;
      }
    }
    return maxY;
  }
  const mirOf = s => ring.mir[s] || (ring.mir[s] = new Uint8Array(CS * H * CS * VB));
  function pushVox(s) {                                  // 镜像槽位 → uVox（整块）
    const N = ring.N; stVox.image.data = ring.mir[s];
    renderer.copyTextureToTexture3D(boxV, dstPos.set((s % N) * CS, 0, ((s / N) | 0) * CS), stVox, ring.vox);
  }
  // 'blocks'：整块重扫（镜像 + 砖 + 列高 + 段 + 树叶后处理）。aux（§10.1）每项单独可缺省：有就用，没有就在这遍扫描里算
  function uploadChunk(cx, cz, ch = SRC.getChunk(cx, cz)) {
    if (!ch) { clearChunk(cx, cz); return; }
    const tU = performance.now();
    const N = ring.N, sx = wrap(cx, N), sz = wrap(cz, N), s = sz * N + sx, keep = ring.owner[s] === ckey(cx, cz) && !!ring.mir[s];
    const b = ch.blocks, me = ch.meta, lt = ch.light, sk = ch.sky, bl = ch.blk, vd = mirOf(s), bd = stBrick.image.data, aux = ch.aux || {};
    const KIND = BT.kind, OPQ = BT.opaque;
    const auxB = aux.brick, auxY = aux.maxY !== undefined, auxS = aux.sectEmpty !== undefined && aux.sectFull !== undefined;
    if (auxB) bd.set(auxB); else bd.fill(0);
    secNE.fill(0); secOp.fill(0);
    let maxY = auxY ? aux.maxY : 0, nl = 0;
    dfNew.length = 0;
    const LF = leafState.cull || leafState.halo ? LV : -1, scanB = !auxB, scanY = !auxY, scanS = !auxS;
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const base = (lx * CS + lz) * H, bxz = (lz >> 2) * BY * 4 + (lx >> 2);
      let o = (lz * H * CS + lx) * VB;
      for (let y = 0; y < H; y++, o += CS * VB) {
        const i = base + y, id = b[i], m = me ? me[i] : 0, cl = VCLS[((m & 15) << 8) | id];
        // DF 占据（同 dfUpdate 的定义）：流体表皮的 6 邻直接查宿主数组（halo / 内部树叶都不是流体，不影响）
        const occ = cl === 1 || (cl === 2 && (y === 0 || y === H - 1 || lx === 0 || lx === CS - 1 || lz === 0 || lz === CS - 1 ||
          VCLS[me ? ((me[i + 1] & 15) << 8) | b[i + 1] : b[i + 1]] !== 2 || VCLS[me ? ((me[i - 1] & 15) << 8) | b[i - 1] : b[i - 1]] !== 2 ||
          VCLS[me ? ((me[i + H] & 15) << 8) | b[i + H] : b[i + H]] !== 2 || VCLS[me ? ((me[i - H] & 15) << 8) | b[i - H] : b[i - H]] !== 2 ||
          VCLS[me ? ((me[i + SXH] & 15) << 8) | b[i + SXH] : b[i + SXH]] !== 2 || VCLS[me ? ((me[i - SXH] & 15) << 8) | b[i - SXH] : b[i - SXH]] !== 2)) ? 1 : 0;
        dfOcc[i] = occ;
        // dist：新槽位 = 占据 1 / 其余 0（未计算）；同一区块重传 = 保留旧值，新占据格（旧值 ≥2）写 1 并记下做 min 更新
        let d = occ;
        if (keep) { d = vd[o + 3] & 31; if (occ && d !== 1) { if (d > 1) dfNew.push(lx, y, lz); d = 1; } }
        vd[o] = id; vd[o + 1] = lt ? lt[i] : sk ? (sk[i] << 4) | bl[i] : 0xF0;
        vd[o + 2] = m; vd[o + 3] = VFLAG[((m & 15) << 8) | id] | d;
        if (id && KIND[id]) {
          if (scanB) bd[bxz + (y >> 2) * 4] = 1;
          if (scanY && y >= maxY) maxY = y + 1;
          if (scanS) { secNE[y >> 4]++; if (OPQ[id]) secOp[y >> 4]++; }
          if (id === LF) leafIdx[nl++] = base + y;
        }
      }
    }
    if (nl) maxY = leafPost(cx, cz, b, nl, vd, bd, maxY, keep);
    let emptyM = 0, fullM = 0;
    if (auxS) {                                          // 宿主段掩码 + 树叶后处理的增量：halo 让段非空；内部树叶不补「全实」（偏保守）
      emptyM = aux.sectEmpty; fullM = aux.sectFull;
      for (let k = 0; k < NS; k++) if (secNE[k]) emptyM &= ~(1 << k);
    } else for (let k = 0; k < NS; k++) { if (!secNE[k]) emptyM |= 1 << k; if (secOp[k] === 4096) fullM |= 1 << k; }
    if (aux.dist) dfMerge(vd, aux.dist); else if (dfNew.length) dfFix(vd);
    ring.upMs += performance.now() - tU;                 // 主线程 CPU 部分（扫描 / 树叶后处理 / DF）；GL 上传与 Worker 拷贝不计
    pushVox(s);
    renderer.copyTextureToTexture3D(boxB, dstPos.set(sx * 4, 0, sz * 4), stBrick, ring.brick);
    ring.owner[s] = ckey(cx, cz); ring.rev[s] = ch.rev !== undefined ? ch.rev : -1;
    setColumn(s, cx, cz, maxY, emptyM, fullM);
    if (!aux.dist) dfSend(s, cx, cz); else ring.dfSeq[s] = ring.dfAck[s] = ++dfSeqN;   // 宿主给了 dist：作废在途的 Worker 结果
    ring.uploads++;
  }
  // 'light'：只改镜像 G 通道 + 整块上传；不碰砖 / 列高 / 段 / 树叶后处理（goal-renderapi §6.4）
  function uploadLight(s, ch) {
    const vd = ring.mir[s], lt = ch.light, sk = ch.sky, bl = ch.blk;
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const base = (lx * CS + lz) * H;
      let o = (lz * H * CS + lx) * VB + 1;
      for (let y = 0; y < H; y++, o += CS * VB) vd[o] = lt ? lt[base + y] : sk ? (sk[base + y] << 4) | bl[base + y] : 0xF0;
    }
    pushVox(s);
    ring.rev[s] = ch.rev !== undefined ? ch.rev : -1;
    ring.lightUploads++;
  }
  function clearChunk(cx, cz) {
    const N = ring.N, sx = wrap(cx, N), sz = wrap(cz, N), s = sz * N + sx;
    if (ring.owner[s] !== ckey(cx, cz)) return;         // 槽位已被别的区块占用：不动
    ring.owner[s] = null; ring.rev[s] = -1; ring.clears++;
    setColumn(s, cx, cz, 0, 0, 0);                      // 列高 0 = 整列视为空，体素数据无需清零
  }
  function reuploadAll() { SRC.forEachChunk(uploadChunk); }
  // ───────────────── P2 距离场（§3.4；goal-renderapi §4 UVOX.A / §5）─────────────────
  // A 低 5 位 v：0 = 未计算（着色器走 uBrick）/ 1 = DF 占据 / v ≥ 2 → d = v−1 = 到本区块最近 DF 占据格的切比雪夫距离（截断 T）。
  // DF 占据 = state.occupied（kind≠0 ∧ 非流体，含 v2 的 halo / 内部树叶）∪ 流体表皮（6 邻里有非流体格；越界 y 与跨区块邻格一律按非流体）。
  // 表皮让首次入水 / 出水格永远逐格走到，内部流体照样跳。只按本区块计算 → 着色器把跳跃盒裁到当前区块 xz 范围，跨区块无依赖。
  // 安全不变量：v−1 ≤ 真实距离（偏小只少跳几步，偏大会穿帮）。新占据格写 1 并对本区块做 min 更新；变空的格保留 1，等 Worker 回包
  const DF_T = 16, dfOcc = new Uint8Array(CS * H * CS);  // 本区块 DF 占据（索引同 blocks：(lx*16+lz)*H + y）
  let dfSeqN = 0, dfWorker = null;
  const MZ = H * CS * VB, MY = CS * VB, SXH = CS * H;    // 镜像步长：+z / +y（+x = VB）；宿主数组 +x 步长
  const mo = (lx, y, lz) => ((lz * H + y) * CS + lx) * VB;
  const dfNew = [];
  function dfUpdate(vd, keep) {                         // 从镜像重算整块 DF 占据（编辑路径），再 dfApply
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) for (let y = 0; y < H; y++) {
      const o = mo(lx, y, lz), c = VCLS[((vd[o + 2] & 15) << 8) | vd[o]];
      let occ = c === 1;
      if (c === 2) occ = y === 0 || y === H - 1 || lx === 0 || lx === CS - 1 || lz === 0 || lz === CS - 1 ||
        VCLS[((vd[o + 2 + VB] & 15) << 8) | vd[o + VB]] !== 2 || VCLS[((vd[o + 2 - VB] & 15) << 8) | vd[o - VB]] !== 2 ||
        VCLS[((vd[o + 2 + MY] & 15) << 8) | vd[o + MY]] !== 2 || VCLS[((vd[o + 2 - MY] & 15) << 8) | vd[o - MY]] !== 2 ||
        VCLS[((vd[o + 2 + MZ] & 15) << 8) | vd[o + MZ]] !== 2 || VCLS[((vd[o + 2 - MZ] & 15) << 8) | vd[o - MZ]] !== 2;
      dfOcc[(lx * CS + lz) * H + y] = occ ? 1 : 0;
    }
    dfApply(vd, keep);
  }
  // dfOcc → dist：占据格 1（旧值 ≥2 记为新占据，做 min 更新）；!keep → 非占据格清 0（未计算）
  function dfApply(vd, keep) {
    dfNew.length = 0;
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const base = (lx * CS + lz) * H;
      for (let y = 0, o = mo(lx, 0, lz) + 3; y < H; y++, o += MY) {
        const d = vd[o] & 31;
        if (dfOcc[base + y]) { if (d !== 1) { if (keep && d > 1) dfNew.push(lx, y, lz); vd[o] = (vd[o] & 0xe0) | 1; } }
        else if (!keep && d) vd[o] &= 0xe0;
      }
    }
    if (dfNew.length) dfFix(vd);
  }
  function dfFix(vd) {                                   // 新占据格（dfNew）：太多 → 整块退回未计算；否则本区块 min 更新
    if (dfNew.length > 3 * 24) {                         // 新占据格太多：整块退回「未计算」（只留占据 = 1），等 Worker
      for (let o = 3; o < vd.length; o += VB) if ((vd[o] & 31) !== 1) vd[o] &= 0xe0;
      ring.dfInval++; return;
    }
    for (let n = 0; n < dfNew.length; n += 3) {          // 放置：本区块内 d = min(d, cheb + 1)（同步，不等 Worker）
      const px = dfNew[n], py = dfNew[n + 1], pz = dfNew[n + 2];
      for (let lz = 0; lz < CS; lz++) for (let y = Math.max(0, py - DF_T); y <= Math.min(H - 1, py + DF_T); y++) {
        const dzy = Math.max(Math.abs(lz - pz), Math.abs(y - py));
        for (let lx = 0; lx < CS; lx++) {
          const o = mo(lx, y, lz) + 3, d = vd[o] & 31, c = Math.max(dzy, Math.abs(lx - px)) + 1;
          if (d > c) vd[o] = (vd[o] & 0xe0) | c;
        }
      }
    }
    ring.dfMin += dfNew.length / 3;
  }
  function dfMerge(vd, a) {                              // a：索引同 blocks，值 = v（低 5 位）
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const base = (lx * CS + lz) * H;
      for (let y = 0, o = mo(lx, 0, lz) + 3; y < H; y++, o += MY) vd[o] = (vd[o] & 0xe0) | (a[base + y] & 31);
    }
  }
  function dfSend(s, cx, cz) {
    const seq = ring.dfSeq[s] = ++dfSeqN;
    if (!dfWorker) dfWorker = dfStartWorker();
    if (dfWorker) { const occ = dfOcc.slice(); dfWorker.postMessage({ t: 'occ', cx, cz, seq, occ }, [occ.buffer]); ring.dfSent++; }
    else dfReceive({ cx, cz, seq, a: dfTransform(dfOcc, H, DF_T) });   // 无 Worker：主线程同步算
  }
  function dfReceive(m) {
    const N = ring.N, s = wrap(m.cz, N) * N + wrap(m.cx, N);
    if (ring.owner[s] !== ckey(m.cx, m.cz) || ring.dfSeq[s] !== m.seq) { ring.dfDrop++; return; }   // 槽位换主 / 已有更新的请求
    dfMerge(ring.mir[s], m.a); pushVox(s); ring.dfAck[s] = m.seq; ring.dfDone++;
  }
  function dfStartWorker() {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return null;
    try {
      const src = `const dfTransform = ${dfTransform.toString()};
        onmessage = e => { const m = e.data, a = dfTransform(m.occ, ${H}, ${DF_T}); postMessage({ t: 'dist', cx: m.cx, cz: m.cz, seq: m.seq, a }, [a.buffer]); };`;
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = e => dfReceive(e.data);
      w.onerror = e => { console.warn('[v2] DF Worker 出错，改主线程计算', e); dfWorker = false; };
      return w;
    } catch (e) { console.warn('[v2] DF Worker 不可用，改主线程计算', e); return null; }
  }
  // 在途（已发出、结果未合并）的槽位数：verify / bench 等它归零再测
  const dfPending = () => { let n = 0; for (let s = 0; s < ring.owner.length; s++) if (ring.owner[s] && ring.dfSeq[s] !== ring.dfAck[s]) n++; return n; };

  // ── 单格编辑队列（goal-renderapi §6.5 EDITQ）：SRC.onBlockChanged → 入队，update() 开头 flushEdits ──
  // 宿主 A 适配器不提供 onBlockChanged（宿主 setBlock 后自己会 buildChunk → 'blocks'，整块路径同样保持 DF 安全）
  const EQ_MAX = 4096, editQ = new Int32Array(EQ_MAX), eqOver = new Set();
  let eqLen = 0;
  function onBlockChanged(x, y, z) {
    if (y < 0 || y >= H) return;
    const N = ring.N, cx = Math.floor(x / CS), cz = Math.floor(z / CS), s = wrap(cz, N) * N + wrap(cx, N);
    if (ring.owner[s] !== ckey(cx, cz)) return;          // 不在环里：之后整块进环时自然是新的
    if (eqLen === EQ_MAX) { eqOver.add(s); return; }     // 溢出：该槽位本帧整块重传
    editQ[eqLen++] = (s << 16) | (((x & 15) * CS + (z & 15)) << 8) | y;
  }
  function flushEdits() {
    if (!eqLen && !eqOver.size) return;
    const boxes = new Map();                             // 槽位 → 脏盒 [x0,y0,z0,x1,y1,z1]（null = 整块）
    for (let i = 0; i < eqLen; i++) {
      const e = editQ[i], s = e >>> 16, lx = (e >> 12) & 15, lz = (e >> 8) & 15, y = e & 255, b = boxes.get(s);
      if (!b) boxes.set(s, [lx, y, lz, lx, y, lz]);
      else { b[0] = Math.min(b[0], lx); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], lz); b[3] = Math.max(b[3], lx); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], lz); }
    }
    for (const s of eqOver) boxes.set(s, null);
    eqLen = 0; eqOver.clear();
    for (const [s, b] of boxes) {
      const key = ring.owner[s]; if (!key) continue;
      const [cx, cz] = key.split(',').map(Number), ch = SRC.getChunk(cx, cz);
      if (!ch) { clearChunk(cx, cz); continue; }
      if (!b || leafState.cull || leafState.halo) { uploadChunk(cx, cz, ch); continue; }   // 树叶后处理依赖邻格：整块
      editBox(s, cx, cz, ch, b);
    }
  }
  // 盒内逐格改镜像（dist 保留）→ 整块重算 DF 占据（新占据 min 更新）→ 砖 / 列高 / 段从镜像重算 → 只传脏盒（有 min 更新则整块）→ Worker
  const boxE = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
  function editBox(s, cx, cz, ch, b) {
    const vd = ring.mir[s], bk = ch.blocks, me = ch.meta, lt = ch.light, sk = ch.sky, bl = ch.blk;
    for (let lx = b[0]; lx <= b[3]; lx++) for (let lz = b[2]; lz <= b[5]; lz++) for (let y = b[1]; y <= b[4]; y++) {
      const i = (lx * CS + lz) * H + y, o = mo(lx, y, lz), id = bk[i], m = me ? me[i] : 0;
      vd[o] = id; vd[o + 1] = lt ? lt[i] : sk ? (sk[i] << 4) | bl[i] : 0xF0; vd[o + 2] = m;
      vd[o + 3] = VFLAG[((m & 15) << 8) | id] | (vd[o + 3] & 31);
    }
    dfUpdate(vd, true);
    rescanColumn(s, cx, cz, vd);
    const N = ring.N;
    if (dfNew.length || (b[3] - b[0] + 3) * (b[4] - b[1] + 3) * (b[5] - b[2] + 3) * 2 > CS * H * CS) pushVox(s);
    else {                                               // 脏盒外扩 1（流体表皮随 6 邻变化）
      boxE.min.set(Math.max(0, b[0] - 1), Math.max(0, b[1] - 1), Math.max(0, b[2] - 1));
      boxE.max.set(Math.min(CS - 1, b[3] + 1), Math.min(H - 1, b[4] + 1), Math.min(CS - 1, b[5] + 1));
      stVox.image.data = vd;
      renderer.copyTextureToTexture3D(boxE, dstPos.set((s % N) * CS + boxE.min.x, boxE.min.y, ((s / N) | 0) * CS + boxE.min.z), stVox, ring.vox);
    }
    ring.rev[s] = ch.rev !== undefined ? ch.rev : -1; ring.edits++;
    dfSend(s, cx, cz);
  }
  function rescanColumn(s, cx, cz, vd) {                 // 砖 / 列高 / 段掩码：从镜像重算（与 uploadChunk 无 aux 时同一定义）
    const bd = stBrick.image.data, N = ring.N;
    bd.fill(0); secNE.fill(0); secOp.fill(0);
    let maxY = 0;
    for (let lz = 0; lz < CS; lz++) for (let y = 0; y < H; y++) for (let lx = 0, o = mo(0, y, lz); lx < CS; lx++, o += VB) {
      const id = vd[o];
      if (id && VKIND[((vd[o + 2] & 15) << 8) | id]) {
        bd[(lz >> 2) * BY * 4 + (lx >> 2) + (y >> 2) * 4] = 1; if (y >= maxY) maxY = y + 1;
        secNE[y >> 4]++; if (vd[o + 3] & 32) secOp[y >> 4]++;
      }
    }
    let emptyM = 0, fullM = 0;
    for (let k = 0; k < NS; k++) { if (!secNE[k]) emptyM |= 1 << k; if (secOp[k] === 4096) fullM |= 1 << k; }
    renderer.copyTextureToTexture3D(boxB, dstPos.set((s % N) * 4, 0, ((s / N) | 0) * 4), stBrick, ring.brick);
    setColumn(s, cx, cz, maxY, emptyM, fullM);
  }
  if (SRC.onBlockChanged) SRC.onBlockChanged(onBlockChanged);

  // 事件入口（goal-renderapi §6.2）：'gone' / getChunk 为 null → 清槽位；同 rev 且已在槽位 → 跳过；'light' → G 通道快路径。
  // 树叶后处理读邻区块：新区块首次进环时，重传已在环里的 4 邻（边界内部剔除 / 外伸格才完整）
  function onChunkEvent(cx, cz, what = 'blocks') {
    const N = ring.N, s = wrap(cz, N) * N + wrap(cx, N), k = ckey(cx, cz);
    const ch = what === 'gone' ? null : SRC.getChunk(cx, cz);
    if (!ch) { clearChunk(cx, cz); return; }
    const isNew = ring.owner[s] !== k;
    if (!isNew && ch.rev !== undefined && ch.rev === ring.rev[s]) { ring.dedup++; return; }
    if (what === 'light' && !isNew) { uploadLight(s, ch); return; }
    uploadChunk(cx, cz, ch);
    if (isNew && (leafState.cull || leafState.halo) && ring.owner[s] === k)
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (ring.owner[wrap(cz + dz, N) * N + wrap(cx + dx, N)] === ckey(cx + dx, cz + dz)) uploadChunk(cx + dx, cz + dz);
  }
  SRC.onChunkChanged(onChunkEvent);
  rebuildRing();

  // ── 参数生效 ──
  let saveT = 0, leafT = 0;
  function apply(key, fx) {
    if (fx === 'dbg') { setDebug(D.view, D.raw); return; }
    if (fx === 'leaf') {           // 内部剔除 / halo 开关翻转 → 整环重传（拖动中去抖）
      const w = leafWant();
      if (w.cull !== leafState.cull || w.halo !== leafState.halo) {
        leafState = w; clearTimeout(leafT); leafT = setTimeout(reuploadAll, 150);
      }
    }
    if (key === 'scale') {         // 用户拉高 scale：像素上限跟着抬，否则 maxMP 会把它静默截住（1280×657 时 0.7MP ≈ ×0.91）
      renderer.getDrawingBufferSize(dbSize);
      const need = Math.ceil(P.scale * P.scale * dbSize.x * dbSize.y / 1e5) / 10;
      if (need > P.maxMP) { P.maxMP = Math.min(8, need); if (paneUI) paneUI.refresh(); }
    }
    if (fx === 'rt') ensureRT();
    if (fx === 'tex') {          // 同步主菜单视距滑块（其 input 处理器负责写 settings + localStorage）
      const el = document.getElementById('rd');
      if (el) { el.value = ctx.settings.rd; el.dispatchEvent(new Event('input')); }
    }
    clearTimeout(saveT); saveT = setTimeout(() => saveP(P), 300);
  }
  function applyAll() {             // P 整体换过（重置 / 选预设）：所有副作用各走一遍
    for (const k in P_DEFAULTS) apply(k, 'u');
    apply('scale', 'rt'); apply('shadowSteps', 'sh'); apply('leafStyle', 'leaf'); apply('leafShadow', 'def');
  }
  function resetDefaults() { Object.assign(P, P_DEFAULTS); curPreset = '@default'; saveP(P); applyAll(); }
  function setPreset(pr) {         // 预设按钮：只写 P
    Object.assign(P, pr);
    for (const k in pr) apply(k, 'u');
    apply('waterStyle', 'def');     // 风格宏（云/水）
  }
  // 编译期宏（glmod §1.1b-2）：kit.update() 每帧求值一次，所有 pass 同值；派生宏写在这里、不写在 GLSL 里
  //   风格开关关闭时整段不进着色器（不增加常驻分支）；树叶阴影距离取 max 视为 ∞
  const DEFS = {
    DBG: () => D.view, DBGRAW: () => D.raw, REF_MODE: () => D.ref, SECT: () => 0, META: () => BT.state ? 1 : 0,
    LEAF_CARDS: () => LEAF_OK && P.leafStyle === 1, CLOUD_STYLE: () => P.cloudStyle | 0, WATER_STYLE: () => P.waterStyle | 0,
    DF: () => !!P.df, SHADOW_PASS: () => !!P.softShadow, SCENE_CLIP: () => !!P.sceneClip, CLOUD_LR: () => (P.cloudStyle | 0) === 2 && !!P.cloudLowRes,
    LEAF_SH: () => P.leafShadow | 0, LEAF_SH_LOD: () => (P.leafShadow | 0) === 0 && P.leafShadowDist < 64, LEAF_LOD: () => P.leafLodDist < 160,
  };
  const kit = passKit(THREE, { defs: DEFS, ext: ctx.U });

  // ── Tweakpane（CDN 动态加载；失败只告警，不影响渲染） ──
  let pane = null, paneUI = null, paneHidden = false;
  const paneReady = import('https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.js').then(({ Pane }) => {
    pane = new Pane({ title: 'v2 DDA', expanded: false });
    const host = pane.element.parentElement || pane.element;
    Object.assign(host.style, { zIndex: 1000, width: '280px' });
    host.style.display = paneHidden ? 'none' : '';
    // 面板内的键盘输入不传给游戏（F4 例外）
    host.addEventListener('keydown', e => { if (e.code !== 'F4') e.stopPropagation(); });
    paneUI = buildPane(pane, PANEL, apply, resetDefaults);
    return pane;
  }).catch(e => { console.warn('[v2] Tweakpane 加载失败，面板不可用', e); return null; });

  function panelVisible() { return !!pane && !paneHidden; }
  function togglePanel(show) {
    paneHidden = show === undefined ? !paneHidden : !show;
    if (!pane) return;
    const host = pane.element.parentElement || pane.element;
    host.style.display = paneHidden ? 'none' : '';
    if (!paneHidden) { pane.expanded = true; if (document.pointerLockElement) document.exitPointerLock(); }
  }

  // ───────────────────────── DDA 全屏 pass（handover §7.2 / §7.3） ─────────────────────────
  const { scene, camera, U, GLSL } = ctx;
  // uniform 的值在 GLSL 声明处绑定（glmod §1.1，v2/pass.js）；这里是复用的对象与本帧派生量（render() 开头更新 F）
  const F = { pcx: 0, pcz: 0 };
  const V3 = () => new THREE.Vector3(), V4 = () => new THREE.Vector4(), V2_ = () => new THREE.Vector2();
  const vRo = V3(), vRoLag = V3(), vLo = V3(), vHi = V3(), aSlot = [0, 0], aLow = [0, 0], vWOff = V2_(), vW0 = V4(), vW1 = V4(), vWave = V2_(),
        vSun = V3(), vSunVis = V3(), vScSize = V2_(), vClipFoot = V2_(), vShaft0 = V4(), vShaft1 = V3(), vWTex = V3(), vGeoShift = V3(),
        vCloud = new THREE.Vector4(0, 0, H + 36, 4), vCloud2 = V3(), vCloudColor = new THREE.Color(1, 1, 1), vLeaf0 = V4(), vLeaf1 = V4(), vSway = V3(),
        vStar0 = V4(), vStar1 = V4(), vUw = V4(), vUw2 = V2_(), vShore = V2_(), vWater2 = V3(), vSkyTop = new THREE.Color(), vSkyHor = new THREE.Color();
  let cloudNoise = null;
  const texelAngle = () => 2 * Math.tan(camera.fov * Math.PI / 360) / ddaRT.height;
  const clipFoot = () => vClipFoot.set(sceneRT.width / ddaRT.width, sceneRT.height / ddaRT.height);
  const gRo = u('uRo', () => vRo.set(camera.position.x - F.pcx * CS, camera.position.y, camera.position.z - F.pcz * CS));
  const gSun = u('uSunDir', () => {      // 宿主太阳方向 + 面板方位/仰角偏移
    const sd = ENV.sunDir, az = Math.atan2(sd.x, sd.z) + P.sunAz, el = clamp(Math.asin(clamp(sd.y, -1, 1)) + P.sunEl, -1.5, 1.5);
    return vSun.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  });
  const cl_ = () => ENV.cloud;
  // uniform 声明（getter 依赖本文件的状态）留在这里；GLSL 逻辑在 v2/glsl/*.js，按原顺序拼接（glmod 步骤 2，与切分前文本相同）
  const U_MAIN = glsl`  uniform usampler3D ${u('uVox', () => ring.vox)}, ${u('uBrick', () => ring.brick)};
  uniform usampler2D ${u('uCol', () => ring.col)}, ${u('uInfo', () => infoTex)};
  uniform sampler2D ${u('tScene', () => sceneRT.texture)}, ${u('tDepth', () => sceneRT.depthTexture)};
  // sceneRT 尺寸 / 每个 DDA 像素覆盖的场景像素数（§4-5 保守深度裁剪）
  uniform vec2 ${u('uSceneSize', () => vScSize.set(sceneRT.width, sceneRT.height))}, ${u('uClipFoot', clipFoot)};
  // CLOUD_LR：低分辨率云 pass 的结果（RGBA = 颜色 + alpha，双线性）/（R = tc，< 0 无云，最近点）
  uniform sampler2D ${u('tCloud', () => cloudRT && cloudRT.texture)}, ${u('tCloudT', () => cloudTRT && cloudTRT.texture)};
  uniform int ${u('uSX', () => ring.SX)}, ${u('uN', () => ring.N)}, ${u('uSteps', () => D.ref ? 576 : Math.round(P.steps))};
  uniform ivec2 ${u('uOrgSlot', () => (aSlot[0] = wrap(F.pcx, ring.N), aSlot[1] = wrap(F.pcz, ring.N), aSlot))}, ${u('uOrgLow', () => (aLow[0] = wrap(F.pcx, 256), aLow[1] = wrap(F.pcz, 256), aLow))};
  uniform vec3 ${u('uLo', () => vLo.set(-(ring.rd + 2) * CS, 0, -(ring.rd + 2) * CS))}, ${u('uHi', () => vHi.set((ring.rd + 3) * CS, H, (ring.rd + 3) * CS))}, ${gRo};
  uniform float ${u('uWorldMaxY', () => ring.worldMaxY)}, ${u('uNear', () => camera.near)}, ${u('uFar', () => camera.far)}, ${u('uTexelAngle', texelAngle)}, ${_ => P.fogA1},
    ${u('uClipScene', () => { const f = clipFoot(); return f.x === 1 && f.y === 1 ? 1 : P.sceneClip && f.x <= 2 && f.y <= 2 ? 2 : 0; })},
    ${_ => P.aoStrength}, ${_ => P.aoCurve}, ${_ => P.exposure}, ${u('uTime', () => D.time != null ? D.time : ENV.time)};
  uniform vec4 ${u('uWater0', () => vW0.set(P.waterClarity, P.reflStrength, P.waveStrength, P.foamWidth))},   // (透亮, 反射, 波纹, 泡沫宽)
    ${u('uWater1', () => vW1.set(P.waterA1, P.waterA2, Math.min(P.waterD1, P.waterD2 - 0.01), P.waterD2))};   // (浅不透明, 深不透明, 浅深度, 深深度)
  uniform vec2 ${u('uWOff', () => vWOff.set(F.pcx * CS, F.pcz * CS))};   // 局部坐标 → 世界 xz（波纹相位连续）
  uniform sampler2D ${u('uWaterNoise', () => waterNoiseTex)};   // 可平铺噪声法线（RG = 斜率）
  uniform vec2 ${u('uWave1', () => vWave.set(P.waveNoise, P.waveScale))};   // (噪声强度, 噪声频率)
  uniform vec3 ${gSun};
  uniform vec3 ${u('uSunVis', () => vSunVis.copy(ENV.sunVis).normalize())};   // 宿主天空里太阳的真实方向（无面板偏移）
  uniform sampler2D ${u('uCloudTex', () => cl_() ? cl_().tex : null)};
  uniform vec3 ${u('uCloudColor', () => cl_() ? vCloudColor.copy(cl_().color) : vCloudColor)};
  uniform vec4 ${u('uCloud', () => { const c = cl_(); return c ? vCloud.set(D.cloudX != null ? D.cloudX : c.offset.x, c.offset.y, c.y, P.cloudThick) : vCloud; })};   // (offset.x, offset.y, 底面高度, 厚度)
  uniform vec3 ${u('uCloud2', () => cl_() ? vCloud2.set(P.cloudDensity, P.cloudShade, P.cloudLight) : vCloud2)};   // (密度 /格, 背光暗部, 日照)
  // (主射线镂空 LOD 距离, 精确阴影距离, 阴影档 0 精确/1 实心/2 无, 外伸距离)
  uniform vec4 ${u('uLeaf0', () => vLeaf0.set(P.leafLodDist >= 160 ? 1e30 : P.leafLodDist, P.leafShadowDist >= 64 ? 1e30 : P.leafShadowDist, P.leafShadow, P.leafHaloDist))};
  uniform vec4 ${u('uLeaf1', () => vLeaf1.set(P.leafOverhang, clamp(1.5 - P.leafDensity, 0.03, 1), P.leafCardLayers, P.leafSeed))};   // (卡片外伸, alpha 阈值, 层数, 种子)
  uniform vec3 ${u('uSway', () => vSway.set(P.swayAmp, P.swayFreq, P.swayDist))};   // (幅度, 频率, 距离)
  uniform vec4 ${u('uStar0', () => vStar0.set(P.starDensity, P.starProb, P.starGamma, P.starTwinkle))};   // (密度, 概率, gamma, 闪烁)
  uniform vec4 ${u('uStar1', () => vStar1.set(P.starMinElev, P.cloudStarBlock, P.cloudNightAlpha, P.skyDarkenNight))};   // (最低仰角, 云遮星, 夜云 alpha 倍率, 夜空压暗)
  uniform float ${u('uStarOn', () => D.hostStars ? 0 : 1)}, ${_ => P.cloudAlpha};
  uniform float ${_ => P.uwSurfaceAlpha};   // 水下仰视：水面不透明度（v1 表现）
  uniform vec3 ${u('uWater2', () => vWater2.set(P.waterSpec, P.waterSkyZen, P.waterDeepSat))};   // (高光指数, 天顶反射权重, 深水饱和)
  uniform vec3 ${u('uSkyTop', () => vSkyTop.copy(ENV.skyTop))};   // 宿主天空球天顶色
  uniform vec2 ${u('uShore', () => vShore.set(P.shoreWaveAmp, P.shoreWaveSpeed))};   // 岸边波纹：(起伏高度/格, 速度)
  uniform float ${_ => P.shoreFade};   // 岸边软化：竖直水深 < 该值时水面渐隐
  uniform vec3 ${u('uRoLag', () => vRoLag)};   // 指数滞后的相机（局部坐标，render() 里更新）：树叶精度切换渐变
  uniform float ${u('uFluidTop0', () => -0.125)};   // fluidTop 微调：meta 0 → 1 + uFluidTop0 = 0.875（v1 lowerTop，宿主 A 0 px 硬要求）
  uniform vec3 ${u('uSkyHor', () => vSkyHor.copy(ENV.skyHor))};   // 宿主天空球地平线色（反射用）
  uniform vec2 ${u('uUw2', () => vUw2.set(P.uwRippleMix, P.uwPattern))};   // 水下仰视波纹：(0 经典 ↔ 1 水底式, 图样亮度)
  uniform vec4 ${u('uUw', () => vUw.set(P.uwRipple, P.uwRippleFreq, P.uwTintMix, P.uwShafts))};   // 水下：(仰视波纹强度, 波纹频率, 水体吸收, 光束强度)
  uniform vec4 ${u('uShaft0', () => vShaft0.set(P.uwShaftScale, P.uwShaftLen, P.uwShaftFall, P.uwShaftSharp))};   // 水下光束：(图样尺度, 最远距离, 衰减, 锐度)
  uniform vec3 ${u('uShaft1', () => vShaft1.set(P.uwShaftPhase, P.uwShaftVis, P.uwShaftRefr))};   // 水下光束：(前向散射指数, 方向 光照↔可见太阳, 水面折射量)
  uniform vec3 ${u('uWTex', () => vWTex.set(P.waterTexWave, P.waterTexSpeed, P.waterTexNormal))};   // Reimagined 水面：(贴图摆动幅度, 速度, 法线强度)
  #if CLOUD_STYLE == 2
  precision highp sampler3D;
  uniform sampler3D ${u('uCloudNoise', () => P.cloudStyle === 2 ? (cloudNoise = cloudNoise || makeCloudNoise()) : cloudNoise)};   // 64³ 可平铺：R = Perlin-Worley 低频形状，G = Worley 高频侵蚀
  #endif
`;
  const U_PASS = glsl`  uniform int ${u('uShadowSteps', () => D.ref && P.shadowSteps > 0 ? 576 : Math.round(P.shadowSteps))};
  uniform float ${_ => P.shadowStrength}, ${_ => P.shadowDist}, ${u('uSun', () => P.sun)};
  uniform mat4 ${u('uInvProj', () => camera.projectionMatrixInverse)}, ${u('uCamWorld', () => camera.matrixWorld)};
  varying vec2 vUv;
  // glmod §-1.B 软阴影 spike（SHADOW_PASS）：主 pass 不追阴影射线，MRT 输出 底色（阴影内）/ 直射增量 / 命中点；
  //   SH_PASS = 低分辨率阴影 pass（同一份源码，同 CLOUD_PASS 做法）：读 tGeo 的命中点 → trace → (可见度, 距离)
  #if SHADOW_PASS && !CLOUD_PASS && !SH_PASS
  layout(location = 1) out vec4 oDirect;                     // 直射增量（阴影外 − 阴影内，已乘后续水 / 雾 / 云的透过率）
  layout(location = 2) out vec4 oGeo;                        // xyz = 阴影射线起点；w = 标志（< 0：不需要阴影）
  #endif
  uniform sampler2D ${u('tGeo', () => ddaOut ? ddaRT.texture[2] : null)};
  uniform float ${u('uShF', () => shF())}, ${_ => P.softShCone};
  uniform vec3 ${u('uGeoShift', () => vGeoShift.subVectors(prevOrg, curOrg))};   // 上一帧局部坐标 → 本帧（玩家跨区块时原点移动）
`;
  const K = { BT, LEAF_OK, LEAF_CARD_LAYER, LV, H, GLSL };
  const DDA_FS = glsl`
${G.head(K)}${U_MAIN}${G.util(K)}${GC.vol(K)}${U_PASS}${G.data(K)}${GT.trace(K)}${GD.dbg(K)}${GC.star(K)}${GW.fn(K)}${GU.uw(K)}${GW.refl(K)}${GS.main(K)}`;
  // 水面噪声法线贴图（可平铺 128²：RG = 斜率，B = 高度）：4 层值噪声 → bump
  const waterNoiseTex = (() => {
    const N = 128, H = new Float32Array(N * N);
    const hash = (x, y, s) => {
      let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1274126177);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const sm = t => t * t * (3 - 2 * t);
    const vn = (x, y, per, s) => {                     // 格点周期 = per → 采样范围 0..per 时无缝平铺
      const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
      const x0 = ((xi % per) + per) % per, y0 = ((yi % per) + per) % per, x1 = (x0 + 1) % per, y1 = (y0 + 1) % per;
      const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), e = hash(x1, y1, s);
      return (a + (b - a) * fx) * (1 - fy) + (c + (e - c) * fx) * fy;
    };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0, amp = 1, per = 4;
      for (let o = 0; o < 4; o++) { v += amp * vn(x / N * per, y / N * per, per, o * 31 + 7); amp *= 0.55; per *= 2; }
      H[y * N + x] = v;
    }
    const data = new Uint8Array(N * N * 4), K = 1.4;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const gx = (H[y * N + (x + 1) % N] - H[y * N + (x - 1 + N) % N]) * 0.5 * K;
      const gy = (H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x]) * 0.5 * K;
      const o = (y * N + x) * 4;
      data[o] = clamp(Math.round((0.5 - gx) * 255), 0, 255);
      data[o + 1] = clamp(Math.round((0.5 - gy) * 255), 0, 255);
      data[o + 2] = clamp(Math.round(H[y * N + x] * 90), 0, 255);
      data[o + 3] = 255;
    }
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    Object.assign(t, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    t.needsUpdate = true;
    return t;
  })();
  // 体积云 3D 噪声（64³ RG8，三轴可平铺）：R = Perlin-Worley（值噪声 fbm 按反 Worley remap → 蓬松团块），G = 3 倍频 Worley fbm
  function makeCloudNoise() {
    const N = 64, n3 = N * N * N;
    const hash = (x, y, z, s) => {
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + Math.imul(s, 1274126177);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const sm = t => t * t * (3 - 2 * t), wr = (a, p) => ((a % p) + p) % p;
    const vnoise = (x, y, z, p, s) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
      let v = 0;
      for (let c = 0; c < 8; c++) {
        const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
        v += hash(wr(xi + dx, p), wr(yi + dy, p), wr(zi + dz, p), s) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      }
      return v;
    };
    const worley = (x, y, z, p, s) => {   // 反 F1（1 = 特征点上）
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      let d = 9;
      for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = xi + i, cy = yi + j, cz = zi + k, a = wr(cx, p), b = wr(cy, p), c = wr(cz, p);
        const px = cx + hash(a, b, c, s) - x, py = cy + hash(a, b, c, s + 1) - y, pz = cz + hash(a, b, c, s + 2) - z;
        d = Math.min(d, px * px + py * py + pz * pz);
      }
      return 1 - Math.min(Math.sqrt(d), 1);
    };
    const R = new Float32Array(n3), G = new Float32Array(n3);
    for (let z = 0, o = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++, o++) {
      const u = x / N, v = y / N, w = z / N;
      let pn = 0, amp = 1, tot = 0;
      for (let k = 0, p = 4; k < 4; k++, p *= 2) { pn += amp * vnoise(u * p, v * p, w * p, p, 11 + k); tot += amp; amp *= 0.5; }
      pn /= tot;
      const wl = worley(u * 4, v * 4, w * 4, 4, 101) * 0.625 + worley(u * 8, v * 8, w * 8, 8, 131) * 0.25 + worley(u * 16, v * 16, w * 16, 16, 161) * 0.125;
      R[o] = (pn - (wl - 1)) / (2 - wl);
      G[o] = worley(u * 6, v * 6, w * 6, 6, 201) * 0.625 + worley(u * 12, v * 12, w * 12, 12, 231) * 0.25 + worley(u * 24, v * 24, w * 24, 24, 261) * 0.125;
    }
    const norm = A => { let lo = 1e9, hi = -1e9; for (const a of A) { lo = Math.min(lo, a); hi = Math.max(hi, a); } return a => (a - lo) / Math.max(hi - lo, 1e-6); };
    const nR = norm(R), nG = norm(G), data = new Uint8Array(n3 * 2);
    for (let i = 0; i < n3; i++) { data[i * 2] = Math.round(nR(R[i]) * 255); data[i * 2 + 1] = Math.round(nG(G[i]) * 255); }
    const t = new THREE.Data3DTexture(data, N, N, N);
    Object.assign(t, { format: THREE.RGFormat, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
                       wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, wrapR: THREE.RepeatWrapping, generateMipmaps: false, unpackAlignment: 1 });
    t.needsUpdate = true;
    return t;
  }
  // 同一份 DDA_FS 的四个变体（uniform 共享，静态宏不同）：主 pass / CLOUD_LR 低分辨率云（1 颜色、2 tc）/ 软阴影 S
  const ddaPass = kit.Pass({ defines: { CLOUD_PASS: 0, SH_PASS: 0 },
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth })`${DDA_FS}`;   // depthTest:false 会连深度写入一起关掉
  const cloudPasses = [1, 2].map(c => ddaPass.variant({ defines: { CLOUD_PASS: c, SH_PASS: 0 }, depthTest: false, depthWrite: false }));
  const shPass = ddaPass.variant({ defines: { CLOUD_PASS: 0, SH_PASS: 1 }, depthTest: false, depthWrite: false });
  let cloudRT = null, cloudTRT = null;
  function renderClouds() {                              // ¼×¼ DDA 分辨率：颜色（双线性）+ tc（最近点）
    const w = Math.max(1, Math.ceil(ddaRT.width / 4)), h = Math.max(1, Math.ceil(ddaRT.height / 4));
    if (!cloudRT || cloudRT.width !== w || cloudRT.height !== h) {
      if (cloudRT) { cloudRT.dispose(); cloudTRT.dispose(); }
      cloudRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      cloudTRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    }
    cloudPasses[0].run(renderer, cloudRT); cloudPasses[1].run(renderer, cloudTRT);
  }

  // ③ 合成：DDA 结果（ddaRT，分辨率 = 绘制缓冲 × scale）与 sceneRT 逐像素比深度，写屏幕颜色 + gl_FragDepth
  //   SHADOW_PASS（glmod §-1.B 的 pass C）：DDA 颜色 = 底色 + 直射增量 × mix(1, 可见度, 强度)
  // 软阴影可见度：本像素命中点（tGeo，当前帧）投到「上一帧」屏幕 → 上一帧几何算出的低分辨率阴影（tSh）按深度加权双线性取样
  //   （阴影 pass 放在 DDA 之前跑上一帧的几何：本机 DDA 之后每多一个 RT pass 整帧 +5 ms，之前则几乎免费，见 §-1.B 记录）
  let ddaOut = null, shRT = null, shRT2 = null, geoOk = false, softStr = 0;
  const prevVP = new THREE.Matrix4(), mPrevVP = new THREE.Matrix4(), prevOrg = new THREE.Vector3(), curOrg = new THREE.Vector3(), mT = new THREE.Matrix4();
  const gDda = u('tDda', () => ddaOut ? ddaRT.texture[0] : ddaRT.texture), gDir = u('tDir', () => ddaOut ? ddaRT.texture[1] : null);
  const SOFT_VIS = glsl`
      uniform sampler2D ${u('tGeo', () => ddaOut ? ddaRT.texture[2] : null)}, ${u('tSh', () => shRT && shRT.texture)};
      uniform float ${u('uStr', () => softStr)}; uniform vec3 ${u('uRoC', () => vRo)}; uniform mat4 ${u('uPrevVP', () => mPrevVP)};
      float softVis(ivec2 p) {
        vec4 g = texelFetch(tGeo, p, 0);
        if (g.w < 0.0 || uStr <= 0.0) return 1.0;
        vec4 cl = uPrevVP * vec4(g.xyz, 1.0);
        if (cl.w <= 0.0) return 1.0;
        ivec2 ss = textureSize(tSh, 0);
        vec2 sc = (cl.xy / cl.w * 0.5 + 0.5) * vec2(ss) - 0.5; ivec2 s0 = ivec2(floor(sc)); vec2 fr = sc - vec2(s0);
        float t0 = distance(g.xyz, uRoC), ws = 0.0, vs = 0.0, wb = 0.0, vb = 1.0;
        for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
          vec2 q = texelFetch(tSh, clamp(s0 + ivec2(i, j), ivec2(0), ss - 1), 0).rg;
          if (q.y < 0.0) continue;
          float dw = max(0.0, 1.0 - abs(q.y - t0) / (0.06 * t0 + 0.5));
          float w = (i == 0 ? 1.0 - fr.x : fr.x) * (j == 0 ? 1.0 - fr.y : fr.y) * dw;
          ws += w; vs += w * q.x;
          if (dw > wb) { wb = dw; vb = q.x; }
        }
        return mix(1.0, ws > 1e-5 ? vs / ws : vb, uStr);
      }`;
  const compPass = kit.Pass({ depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth })`precision highp float;
      uniform sampler2D ${u('tScene', () => sceneRT.texture)}, ${u('tDepth', () => sceneRT.depthTexture)}, ${gDda}, ${u('tDdaDepth', () => ddaRT.depthTexture)};
      varying vec2 vUv;
      #if SHADOW_PASS
      uniform sampler2D ${gDir};${SOFT_VIS}
      #endif
      void main() {
        float ds = texture2D(tDepth, vUv).r, dv = texture2D(tDdaDepth, vUv).r;
        #if SHADOW_PASS
        if (dv < ds) { gl_FragColor = vec4(texture2D(tDda, vUv).rgb + texture2D(tDir, vUv).rgb * softVis(ivec2(vUv * vec2(textureSize(tGeo, 0)))), 1.0); gl_FragDepth = dv; }
        #else
        if (dv < ds) { gl_FragColor = vec4(texture2D(tDda, vUv).rgb, 1.0); gl_FragDepth = dv; }
        #endif
        else { gl_FragColor = texture2D(tScene, vUv); gl_FragDepth = ds; }
      }`;
  const comp = compPass.mat;

  // ── glmod §-1.B 软阴影：shPass（SH_PASS，低分辨率，读上一帧 tGeo）→ 可分离深度感知模糊 ×2 → compPass 里合成 ──
  // 模糊：7 抽头，步长按深度换算成世界尺度（±3 步 ≈ ±uR 格，步长钳 1–4 纹素）；深度差大的样本不参与；无效纹素（距离 < 0）由邻居补洞
  let blurSrc = null; const blurDir = new THREE.Vector2();
  const shBlur = kit.Pass()`precision highp float;
      uniform sampler2D ${u('tIn', () => blurSrc)}; uniform vec2 ${u('uDir', () => blurDir)};
      uniform float ${u('uR', () => P.softShBlur)}, ${u('uPx', () => texelAngle() * shF())};
      void main() {
        ivec2 p = ivec2(gl_FragCoord.xy), sz = textureSize(tIn, 0);
        vec2 c = texelFetch(tIn, p, 0).rg;
        if (uR <= 0.0) { gl_FragColor = vec4(c, 0.0, 1.0); return; }
        float t0 = c.y, stp = t0 > 0.0 ? clamp(uR / (t0 * uPx * 3.0), 1.0, 4.0) : 1.0, ws = 0.0, vs = 0.0, ts = 0.0;
        for (int i = -3; i <= 3; i++) {
          vec2 q = texelFetch(tIn, clamp(p + ivec2(round(float(i) * stp * uDir)), ivec2(0), sz - 1), 0).rg;
          if (q.y < 0.0) continue;
          float w = exp(-float(i * i) / 4.5);
          if (t0 > 0.0) w *= max(0.0, 1.0 - abs(q.y - t0) / (0.06 * t0 + 0.5));
          ws += w; vs += w * q.x; ts += w * q.y;
        }
        gl_FragColor = ws > 1e-4 ? vec4(vs / ws, t0 > 0.0 ? t0 : ts / ws, 0.0, 1.0) : vec4(c, 0.0, 1.0);
      }`;
  // 读回用（bench / verify 读 VR.ddaRT）：同一合成公式写到 DDA 分辨率的 ddaOut，只在被读时画
  const shComp = kit.Pass()`precision highp float;
      uniform sampler2D ${gDda}, ${gDir};${SOFT_VIS}
      void main() {
        ivec2 p = ivec2(gl_FragCoord.xy);
        vec4 b = texelFetch(tDda, p, 0);
        gl_FragColor = vec4(b.rgb + texelFetch(tDir, p, 0).rgb * softVis(p), b.a);
      }`;
  function renderSoftShadow() {    // DDA 之前：上一帧几何 → 本帧阴影
    shPass.run(renderer, shRT);
    blurSrc = shRT.texture; blurDir.set(1, 0); shBlur.run(renderer, shRT2);
    blurSrc = shRT2.texture; blurDir.set(0, 1); shBlur.run(renderer, shRT);
  }
  function resolveSoft() {          // 读回：合成到 ddaOut
    const prev = renderer.getRenderTarget();
    shComp.run(renderer, ddaOut); renderer.setRenderTarget(prev);
    return ddaOut;
  }
  const shF = () => [1, 2, 4].includes(P.softShRes | 0) ? P.softShRes | 0 : 4;

  let sceneRT = null, ddaRT = null;
  const dbSize = new THREE.Vector2();
  function makeRT(w, h, filter) {
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    return new THREE.WebGLRenderTarget(w, h, { minFilter: filter, magFilter: filter, depthBuffer: true, depthTexture: dt });
  }
  function freeRT(rt) { if (rt) { if (rt.depthTexture) rt.depthTexture.dispose(); rt.dispose(); } }
  function makeMRT(w, h, filter) {     // SHADOW_PASS：0 = 底色（阴影内）RGBA8 / 1 = 直射增量 RGBA8 / 2 = 阴影射线起点 + 标志 RGBA32F（最近点）
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    const rt = new THREE.WebGLMultipleRenderTargets(w, h, 3, { minFilter: filter, magFilter: filter, depthBuffer: true, depthTexture: dt });
    Object.assign(rt.texture[2], { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    return rt;
  }
  function ensureRT() {
    renderer.getDrawingBufferSize(dbSize);
    const w = Math.max(1, dbSize.x | 0), h = Math.max(1, dbSize.y | 0);
    if (!sceneRT || sceneRT.width !== w || sceneRT.height !== h) {
      freeRT(sceneRT); sceneRT = makeRT(w, h, THREE.NearestFilter);
    }
    // 大窗口：按像素上限自动降 DDA 内部分辨率（用户滑的 scale 只是上限，不被覆写）
    let s = clamp(P.scale, 0.1, 2);
    const maxPx = Math.max(0.05, P.maxMP) * 1e6, capS = Math.sqrt(maxPx / (w * h));
    if (capS < s) s = capS;
    ddaScale = s;
    const lw = Math.max(1, Math.round(w * s)), lh = Math.max(1, Math.round(h * s));
    const split = !!kit.defVal.SHADOW_PASS;
    if (!ddaRT || ddaRT.width !== lw || ddaRT.height !== lh || !!ddaRT.isWebGLMultipleRenderTargets !== split) {
      const filt = lw === w && lh === h ? THREE.NearestFilter : THREE.LinearFilter;
      freeRT(ddaRT); freeRT(ddaOut); ddaOut = null;
      if (split) {
        ddaRT = makeMRT(lw, lh, filt);
        ddaOut = new THREE.WebGLRenderTarget(lw, lh, { minFilter: filt, magFilter: filt, depthBuffer: false });
      } else ddaRT = makeRT(lw, lh, filt);
      geoOk = false;
    }
    if (split) {
      const f = shF(), sw = Math.ceil(lw / f), sh = Math.ceil(lh / f);
      if (!shRT || shRT.width !== sw || shRT.height !== sh) {
        freeRT(shRT); freeRT(shRT2);
        const o = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
        shRT = new THREE.WebGLRenderTarget(sw, sh, o); shRT2 = new THREE.WebGLRenderTarget(sw, sh, o);
      }
    }
  }

  let ddaMs = 0, ddaScale = 0.65;
  let lagW = null, lagT = 0; const lagPrev = new THREE.Vector3();

  // ── GPU 分 pass 计时（EXT_disjoint_timer_query_webgl2；不可用则静默跳过）──
  // scene / dda / comp 三个顺序查询为一组；同一时刻只挂一组在途，结果可用后取回
  const glc = renderer.getContext();
  const qExt = glc && glc.getExtension ? glc.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const PASSES = ['scene', 'cloud', 'dda', 'comp', 'shadow'];   // cloud = CLOUD_LR 低分辨率云 pass、shadow = 软阴影 pass + 模糊 + 合成（不开时为空区间）
  const qPool = []; let qSet = null, qCur = null, qIdx = -1;
  const gpu = { scene: 0, cloud: 0, dda: 0, comp: 0, shadow: 0, total: 0 };      // EMA（显示用）
  const gpuLast = { scene: 0, cloud: 0, dda: 0, comp: 0, shadow: 0, total: 0, frame: 0 };   // 最近一组原始值（bench 用）
  let gpuFrames = 0;
  function gpuPass(i) {                                      // 结束上一个 pass 的查询，开始第 i 个
    if (!qExt || D.noTimer) return;
    if (qIdx >= 0) { glc.endQuery(qExt.TIME_ELAPSED_EXT); qIdx = -1; }
    if (i < 0 || !qCur) return;
    const q = qPool.pop() || glc.createQuery();
    qCur[i] = q; qIdx = i;
    glc.beginQuery(qExt.TIME_ELAPSED_EXT, q);
  }
  function gpuPoll() {
    if (!qExt || !qSet) return;
    if (!qSet.every(q => glc.getQueryParameter(q, glc.QUERY_RESULT_AVAILABLE))) return;
    const disjoint = glc.getParameter(qExt.GPU_DISJOINT_EXT);
    const ms = qSet.map(q => (glc.getQueryParameter(q, glc.QUERY_RESULT) || 0) / 1e6);
    qPool.push(...qSet); qSet = null;
    if (disjoint) return;
    let tot = 0;
    PASSES.forEach((k, i) => { gpuLast[k] = ms[i]; tot += ms[i]; gpu[k] = gpuFrames ? gpu[k] * 0.85 + ms[i] * 0.15 : ms[i]; });
    gpuLast.total = tot; gpuLast.frame = ++gpuFrames; gpu.total = gpu.scene + gpu.cloud + gpu.dda + gpu.comp + gpu.shadow;
  }

  // ── 调试视图：切 DBG 宏（重新编译 post 着色器；DBG=0 时与生产着色器完全相同） ──
  function setRef(on) { D.ref = on ? 1 : 0; }               // 见 D.ref（REF_MODE 宏由 DEFS 每帧同步）
  function setDebug(view = 0, raw = 0) {
    D.view = view | 0; D.raw = raw ? 1 : 0;
    if (paneUI) paneUI.refresh();
  }

  function render() {
    const t0 = performance.now();
    gpuPoll();
    qCur = qExt && !qSet ? [] : null;
    kit.update();                   // 本帧宏值（所有 pass 同值）
    ensureRT();
    gpuPass(0);
    // ① 整个 scene（天空、实体、粒子、选择框…）→ sceneRT
    const prev = renderer.getRenderTarget();
    if (ENV.hide && !D.hostStars) ENV.hide('stars', true);       // 星星改由 DDA 天空分支程序化绘制
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
    // ② DDA：局部坐标（玩家区块原点）避免远处 float 精度问题；uniform 由各 pass 的 getter 在 run() 时回填
    F.pcx = Math.floor(camera.position.x / CS); F.pcz = Math.floor(camera.position.z / CS);
    {   // 滞后相机（世界坐标指数平滑，τ = leafLodMs）：树叶精度切换渐变；传送/单帧大跳 → 直接对齐
      const now = performance.now(), cp = camera.position, dtMs = lagT ? Math.min(now - lagT, 250) : 0;
      if (!lagW || P.leafLodMs <= 0 || lagPrev.distanceToSquared(cp) > 256) lagW = cp.clone();
      else lagW.lerp(cp, 1 - Math.exp(-dtMs / P.leafLodMs));
      lagT = now; lagPrev.copy(cp);
      vRoLag.set(lagW.x - F.pcx * CS, lagW.y, lagW.z - F.pcz * CS);
    }
    if (ENV.cloud && ENV.hide) ENV.hide('clouds', true);   // 平面云由 DDA 体积云代替
    gpuPass(1);
    if (kit.defVal.CLOUD_LR) renderClouds();
    gpuPass(4);
    curOrg.set(F.pcx * CS, 0, F.pcz * CS);
    if (ddaOut && geoOk) {          // 软阴影：上一帧几何（DDA 之前，见 SOFT_VIS 注释）；合成时把本帧命中点投到上一帧屏幕
      renderSoftShadow();
      softStr = P.softShStr; mPrevVP.multiplyMatrices(prevVP, mT.makeTranslation(curOrg.x, curOrg.y, curOrg.z));
    } else softStr = 0;
    gpuPass(2);
    ddaPass.run(renderer, ddaRT, true);
    if (ddaOut) { prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); prevOrg.copy(curOrg); geoOk = true; }
    gpuPass(3);
    compPass.run(renderer, prev);
    gpuPass(-1);
    if (qCur) { qSet = qCur; qCur = null; }
    ddaMs = ddaMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  return {
    name: 'v2/gl', P, P_DEFAULTS, panelSpec: PANEL, toN, fromN, paneReady, togglePanel, panelVisible,
    get pane() { return pane; }, refreshPane: () => paneUI && paneUI.refresh(),
    resetLag: () => { lagW = null; },   // bench：机位切换后滞后相机直接对齐（否则树叶 LOD 渐变取决于帧时序）
    ring, reuploadAll, onChunkEvent, onBlockChanged, flushEdits, post: ddaPass.mat, comp, D,
    df: { T: DF_T, pending: dfPending, cls: (id, m = 0) => VCLS[((m & 15) << 8) | id], transform: dfTransform }, setDebug, setRef, apply, presets: { cloud: CLOUD_PRESETS, water: WATER_PRESETS },   // apply(key,fx)：bench --set 覆盖参数后走同一条副作用路由（def/leaf 宏重编译）
    get perf() { return { gpu: { ...gpu }, gpuLast: { ...gpuLast }, hasTimer: !!qExt, cpuMs: ddaMs, scale: ddaScale,
                          ddaW: ddaRT ? ddaRT.width : 0, ddaH: ddaRT ? ddaRT.height : 0 }; }, get sceneRT() { return sceneRT; }, get ddaRT() { return ddaOut ? resolveSoft() : ddaRT; },
    source: SRC, blockTable: BT, env: ENV,
    // VoxelCraft 适配器：宿主的 build/dispose 就是 onChunkChanged 的事件源（其它宿主由自己的适配器发事件，这两个可为空操作）
    buildChunk: c => { c.mesh = c.waterMesh = null; if (SRC.built) SRC.built(c); },
    disposeChunk: c => { if (SRC.disposed) SRC.disposed(c); c.mesh = c.waterMesh = null; },
    update: dt => {
      if (ctx.settings && ctx.settings.rd !== ring.rd) { rebuildRing(); reuploadAll(); }
      flushEdits();
      // 相机在流体中 → 通知宿主（§10.3 Env.underwater）；fog = 面板的水下雾近/远建议值，写不写 U 由宿主决定
      const cp = camera.position, uw = isFluidId(blockAt(Math.floor(cp.x), Math.floor(cp.y), Math.floor(cp.z)));
      if (ENV.underwater) ENV.underwater(uw, { near: Math.min(P.uwNear, P.uwFar - 0.5), far: Math.max(P.uwNear + 0.5, P.uwFar) });
    },
    render,
    stats: () => `DDA ${ddaRT ? ddaRT.width + 'x' + ddaRT.height : '-'} (×${ddaScale.toFixed(2)}) steps ${Math.round(P.steps)} ring ${ring.N}² up ${ring.uploads} ${ddaMs.toFixed(1)}ms` +
      (qExt ? ` gpu s/d/c ${gpu.scene.toFixed(1)}/${gpu.dda.toFixed(1)}/${gpu.comp.toFixed(1)}` + (gpu.cloud > 0.05 ? ` 云 ${gpu.cloud.toFixed(1)}` : '') + ` = ${gpu.total.toFixed(1)}ms` : '') +
      (D.view ? ` [dbg ${D.view}]` : ''),
  };
}

// 截断切比雪夫距离变换（§3.4）：occ 索引 (lx*16+lz)*H + y，1 = 占据；返回 v = min(d, T) + 1（1 = 占据）。
// y < 0 视为占据（d ≤ y+1），区块外与 y ≥ H 视为空：只对本区块成立 → 着色器把跳跃盒裁到本区块 xz。
// 可分离三遍 min-max：X 行内最近占据 → Y 列 min_k max(|k|, dx) → Z 同理。自包含（toString 后进 Worker）
export function dfTransform(occ, H, T) {
  const N = 256 * H, A = new Uint8Array(N), B = new Uint8Array(N), out = new Uint8Array(N), SX = 16 * H;
  for (let lz = 0; lz < 16; lz++) for (let y = 0; y < H; y++) {
    const r0 = lz * H + y;
    let last = -100;
    for (let lx = 0; lx < 16; lx++) { const i = r0 + lx * SX; if (occ[i]) last = lx; A[i] = Math.min(T, lx - last); }
    last = 100;
    for (let lx = 15; lx >= 0; lx--) { const i = r0 + lx * SX; if (occ[i]) last = lx; const d = last - lx; if (d < A[i]) A[i] = d; }
  }
  for (let c = 0; c < 256; c++) {
    const b0 = c * H;
    for (let y = 0; y < H; y++) {
      let best = Math.min(A[b0 + y], y + 1);
      for (let k = 1; k < best; k++) {
        if (y - k >= 0) { const v = Math.max(k, A[b0 + y - k]); if (v < best) best = v; }
        if (y + k < H) { const v = Math.max(k, A[b0 + y + k]); if (v < best) best = v; }
      }
      B[b0 + y] = best;
    }
  }
  for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) for (let y = 0; y < H; y++) {
    const i = (lx * 16 + lz) * H + y;
    let best = B[i];
    for (let k = 1; k < best; k++) {
      if (lz - k >= 0) { const v = Math.max(k, B[i - k * H]); if (v < best) best = v; }
      if (lz + k < 16) { const v = Math.max(k, B[i + k * H]); if (v < best) best = v; }
    }
    out[i] = best + 1;
  }
  return out;
}

// ───────────────── VoxelCraft 适配器（handover §2.1） ─────────────────
// ChunkSource：getChunk 返回 {blocks, sky, blk}（light 缺省时用 sky/blk 两个数组，省一次打包拷贝）；
// 额外约定 forEachChunk(fn(cx,cz))：rebuildRing 后整环重传用。事件源 = 宿主调用 renderer.buildChunk/disposeChunk
// 宿主 A 分不出光照变化：buildChunk 一律映射为 'blocks'，disposeChunk 为 'gone'；rev = 全局 build 计数（每次 build 递增）
// emit(c, what)：rev 递增后发事件（verify 用它走 'light' 路径）
export function voxelCraftSource(ctx) {
  const live = new Map(), revs = new Map(), cbs = [], key = (cx, cz) => cx + ',' + cz;
  let REV = 0;
  const emit = (c, what = 'blocks') => { if (what !== 'gone') revs.set(key(c.cx, c.cz), ++REV); for (const f of cbs) f(c.cx, c.cz, what); };
  if (ctx.chunks) for (const c of ctx.chunks.values()) if (c.meshed) { live.set(key(c.cx, c.cz), c); revs.set(key(c.cx, c.cz), ++REV); }   // 中途创建：接管已建区块
  return {
    size: ctx.CS, height: ctx.CH,
    getBlocks(cx, cz) { const c = live.get(key(cx, cz)); return c && c.blocks; },   // 树叶后处理读邻区块
    getChunk(cx, cz) {
      const k = key(cx, cz), c = live.get(k);
      return c && c.blocks && c.sky && c.blk ? { blocks: c.blocks, sky: c.sky, blk: c.blk, rev: revs.get(k) } : null;
    },
    forEachChunk(fn) { for (const c of [...live.values()]) fn(c.cx, c.cz); },
    onChunkChanged(cb) { cbs.push(cb); },
    emit,
    built(c) { live.set(key(c.cx, c.cz), c); emit(c, 'blocks'); },
    disposed(c) { const k = key(c.cx, c.cz); if (live.get(k) === c) { live.delete(k); revs.delete(k); emit(c, 'gone'); } },
  };
}
// Env（§10.3）：v2 对宿主天空 / 雾 / 云 / 星星 / 水下遮罩的全部读写都经这里（每帧轮询 getter）
export function voxelCraftEnv(ctx) {
  const { U, skyMat, cloudMat, clouds, stars } = ctx;
  return {
    get sunDir() { return U.uSunDir.value; }, get sunVis() { return U.uSunDir.value; },   // 宿主光照方向 = 可见日月方向
    get skyTop() { return skyMat.uniforms.uTop.value; }, get skyHor() { return skyMat.uniforms.uHorizon.value; },
    get fogColor() { return U.uFogColor.value; }, get fogNear() { return U.uFogNear.value; }, get fogFar() { return U.uFogFar.value; },
    cloud: cloudMat ? { get tex() { return cloudMat.uniforms.uTex.value; }, get color() { return cloudMat.uniforms.uColor.value; },
                        get offset() { return cloudMat.uniforms.uOffset.value; }, get y() { return clouds.position.y; } } : undefined,
    get time() { return (performance.now() / 1000) % 3600; },
    // 宿主的水下 CSS 蓝色遮罩由着色器内的水体吸收代替（每帧隐藏）；水下雾按 v2 面板建议值写进共享 U（主程序是近 0.5 / 远 18，很浑）
    underwater(flag, fog) {
      if (typeof document !== 'undefined') { const wEl = document.getElementById('water'); if (wEl && wEl.style.display !== 'none') wEl.style.display = 'none'; }
      if (flag && fog) { U.uFogNear.value = fog.near; U.uFogFar.value = fog.far; }
    },
    hide(what, flag) { const o = what === 'clouds' ? clouds : what === 'stars' ? stars : null; if (o && flag) o.visible = false; },
  };
}
// BlockTable：kind 0 无 / 1 立方 / 2 花草 / 3 火把 / 4 水（= VoxelCraft 的 RENDER）；cullSelf = 同种相邻不画内面（玻璃）
export function voxelCraftBlocks(ctx) {
  const { B, RENDER, OPAQUE, SOLID, T_TOP, T_BOT, T_SIDE } = ctx;
  const cullSelf = new Uint8Array(256); cullSelf[B.GLASS] = 1;
  const occupied = new Uint8Array(256); for (let i = 1; i < 256; i++) occupied[i] = RENDER[i] ? 1 : 0;
  return { kind: RENDER, opaque: OPAQUE, solid: SOLID, occupied, cullSelf, tileTop: T_TOP, tileBot: T_BOT, tileSide: T_SIDE, waterId: B.WATER,
           leavesId: B.LEAVES, tallGrassId: B.TALL_GRASS, tileCard: ctx.TEX ? ctx.TEX.leaves_card : undefined };
}
