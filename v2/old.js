// v2.js — DDA 渲染器（移植自 old.htm 的后处理 DDA + Tweakpane 面板）
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
  sceneClip: 0};
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
  const D = { view: 0, raw: 0, time: null, cloudX: null, hostStars: 0, ref: 0 };   // hostStars=1：保留宿主星星（p0 对比用）
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
    if (uni) { uni.uVox.value = ring.vox; uni.uBrick.value = ring.brick; uni.uCol.value = ring.col; }
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
  let uni = null;
  rebuildRing();

  // ── 参数生效 ──
  let saveT = 0, leafT = 0, post = null;
  const cloudMats = [];                                  // CLOUD_LR 低分辨率云 pass（同一份 DDA_FS，CLOUD_PASS = 1 / 2）
  function apply(key, fx) {
    if (fx === 'dbg') { setDebug(D.view, D.raw); return; }
    if (fx === 'def' || fx === 'leaf') syncDefines();
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
  // 风格开关 → 编译期宏（关闭时不进着色器，不增加常驻分支）
  function syncDefines() {
    if (!post) return;
    const want = { LEAF_CARDS: LEAF_OK && P.leafStyle === 1 ? 1 : 0, CLOUD_STYLE: P.cloudStyle | 0, WATER_STYLE: P.waterStyle | 0,
                   // 树叶阴影档 / 距离渐变：编译期（距离取 max 视为 ∞ → 整段代码不进着色器）
                   DF: P.df ? 1 : 0, SCENE_CLIP: P.sceneClip ? 1 : 0, CLOUD_LR: (P.cloudStyle | 0) === 2 && P.cloudLowRes ? 1 : 0, LEAF_SH: P.leafShadow | 0, LEAF_SH_LOD: (P.leafShadow | 0) === 0 && P.leafShadowDist < 64 ? 1 : 0, LEAF_LOD: P.leafLodDist < 160 ? 1 : 0 };
    if (want.CLOUD_STYLE === 2 && !uni.uCloudNoise.value) uni.uCloudNoise.value = makeCloudNoise();   // 体积云噪声：首次启用时生成
    let ch = false;
    for (const k in want) if (post.defines[k] !== want[k]) { post.defines[k] = want[k]; ch = true; }
    if (ch) { post.needsUpdate = true; for (const m of cloudMats) { Object.assign(m.defines, post.defines, { CLOUD_PASS: m.defines.CLOUD_PASS }); m.needsUpdate = true; } }
  }

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
  const DDA_FS = /* glsl */`
  precision highp float; precision highp int;
  precision highp usampler3D; precision highp usampler2D;
  ${GLSL.light}
  ${GLSL.mat}
  ${GLSL.fog}
  #define H ${H}
  // ── 测量（handover §5 / §9.2-7）：DBG 1 主射线迭代 / 2 fetch 计数 / 3 跳过 smoothLight / 5 层级（列+段跳/砖/体素，A = 云步数）
  //    6 texture() 采样计数（图集 / 水面噪声 / 云 3D 噪声；不含每像素固定的 tScene/tDepth）；DBGRAW=1 输出原始计数 ──
  //    4 DF：R = 盒跳跃次数（k ≥ 1 的步），G = 砖级入口 v == 0 → 退化 uBrick 的次数，B = 逐格层遇到本区块 DF 未回包（v == 0）的次数
  #define DBG_HEAT (DBG == 1 || DBG == 2 || DBG == 4 || DBG == 5 || DBG == 6)
  int gFetch = 0, gIt = 0, gSIt = 0, gLvC = 0, gLvB = 0, gLvV = 0, gTex = 0, gCl = 0, gLvD = 0, gDf0 = 0, gDf2 = 0;
  #if DBG_HEAT
  #define CNT(n) gFetch += n
  #define TEXC(n) gTex += n
  #define CLC() gCl++
  #define matSampleLod(uv, l, d) (gTex++, matSampleLod(uv, l, d))
  #else
  #define CNT(n)
  #define TEXC(n)
  #define CLC()
  #endif
  uniform usampler3D uVox, uBrick;
  uniform usampler2D uCol, uInfo;
  uniform sampler2D tScene, tDepth;
  uniform vec2 uSceneSize, uClipFoot;  // sceneRT 尺寸 / 每个 DDA 像素覆盖的场景像素数（§4-5 保守深度裁剪）
  uniform sampler2D tCloud, tCloudT;   // CLOUD_LR：低分辨率云 pass 的结果（RGBA = 颜色 + alpha，双线性）/（R = tc，< 0 无云，最近点）
  uniform int uSX, uN, uSteps;
  uniform ivec2 uOrgSlot, uOrgLow;
  uniform vec3 uLo, uHi, uRo;
  uniform float uWorldMaxY, uNear, uFar, uTexelAngle, uFogA1, uClipScene, uAoStrength, uAoCurve, uExposure, uTime;
  uniform vec4 uWater0, uWater1;   // (透亮, 反射, 波纹, 泡沫宽) / (浅不透明, 深不透明, 浅深度, 深深度)
  uniform vec2 uWOff;              // 局部坐标 → 世界 xz（波纹相位连续）
  uniform sampler2D uWaterNoise;   // 可平铺噪声法线（RG = 斜率）
  uniform vec2 uWave1;             // (噪声强度, 噪声频率)
  uniform vec3 uSunDir;
  uniform vec3 uSunVis;            // 宿主天空里太阳的真实方向（无面板偏移）
  uniform sampler2D uCloudTex;
  uniform vec3 uCloudColor;
  uniform vec4 uCloud;             // (offset.x, offset.y, 底面高度, 厚度)
  uniform vec3 uCloud2;            // (密度 /格, 背光暗部, 日照)
  uniform vec4 uLeaf0;             // (主射线镂空 LOD 距离, 精确阴影距离, 阴影档 0 精确/1 实心/2 无, 外伸距离)
  uniform vec4 uLeaf1;             // (卡片外伸, alpha 阈值, 层数, 种子)
  uniform vec3 uSway;              // (幅度, 频率, 距离)
  uniform vec4 uStar0;             // (密度, 概率, gamma, 闪烁)
  uniform vec4 uStar1;             // (最低仰角, 云遮星, 夜云 alpha 倍率, 夜空压暗)
  uniform float uStarOn, uCloudAlpha;
  uniform float uUwAlpha;          // 水下仰视：水面不透明度（v1 表现）
  uniform vec3 uWater2;            // (高光指数, 天顶反射权重, 深水饱和)
  uniform vec3 uSkyTop;            // 宿主天空球天顶色
  uniform vec2 uShore;             // 岸边波纹：(起伏高度/格, 速度)
  uniform float uShoreFade;        // 岸边软化：竖直水深 < 该值时水面渐隐
  uniform vec3 uRoLag;             // 指数滞后的相机（局部坐标）：树叶精度切换渐变
  uniform float uFluidTop0;        // fluidTop 微调：meta 0 → 1 + uFluidTop0 = 0.875（v1 lowerTop，宿主 A 0 px 硬要求）
  uniform vec3 uSkyHor;            // 宿主天空球地平线色（反射用）
  uniform vec2 uUw2;               // 水下仰视波纹：(0 经典 ↔ 1 水底式, 图样亮度)
  uniform vec4 uUw;                // 水下：(仰视波纹强度, 波纹频率, 水体吸收, 光束强度)
  uniform vec4 uShaft0;            // 水下光束：(图样尺度, 最远距离, 衰减, 锐度)
  uniform vec3 uShaft1;            // 水下光束：(前向散射指数, 方向 光照↔可见太阳, 水面折射量)
  uniform vec3 uWTex;              // Reimagined 水面：(贴图摆动幅度, 速度, 法线强度)
  #if CLOUD_STYLE == 2
  precision highp sampler3D;
  uniform sampler3D uCloudNoise;   // 64³ 可平铺：R = Perlin-Worley 低频形状，G = Worley 高频侵蚀
  #endif
  // 流体（§10.2 / goal-renderapi TODO-4）：判定走 uVox.A 的 FLUID 位（不再注入 waterId）；lvl = meta&15（0 满/源，1–7 MC 等级，8 下落柱）
  // above = 上方同为流体 → 满格；否则水面下沉
  #define FLUID_TILE ${BT.tileSide[BT.waterId]}.0
  #if REF_MODE
  #define REFL_STEPS 576
  #else
  #define REFL_STEPS 64
  #endif
  bool isFluid(uvec4 v) { return (v.a & 128u) != 0u; }    // uVox.A FLUID 位（由 BlockState.fluid 打包）
  float fluidTop(uint lvl, bool above) { return above ? 1.0 : 1.0 - float(lvl) / 9.0 + uFluidTop0; }
  uint hashU(ivec3 c, uint s) {
    uint h = uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ uint(c.z) * 83492791u ^ s * 2654435761u;
    h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15; return h;
  }
  // 体积云：云纹理每个 texel = 12×12 格，挤出成厚度 uCloud.w 的盒子；在云层 slab 内做 2D 网格 DDA
  // 沿射线累积云内路径长度 → Beer-Lambert 不透明度（边角薄、横穿厚）；入射面按朝向/太阳着色，越厚核心越暗
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }   // 交错梯度噪声（步进抖动）
  #if CLOUD_STYLE == 2
  // ── 光影式体积积云（思路同 iq "Clouds" / Horizon Zero Dawn / Hillaire 2016）──
  // 云层 slab [y0, y0 + 厚度·4]；密度 = 低频 Perlin-Worley 覆盖 remap × 高度剖面（平底、圆顶）− 高频 Worley 侵蚀
  // 主射线抖动步进 + 朝光源 3 步次级步进（Beer × powder），双瓣 HG 相位给银边，能量守恒积分
  float cloudDen(vec3 p, float hN, bool detail) {
    float cov = min(0.22 + 0.635 * uCloud2.x, 0.85);                          // 面板系数对齐体积/MC：密度 0.34 ≈ 覆盖 0.44
    vec3 q = p * (1.0 / 384.0);
    float base = texture(uCloudNoise, q).r; TEXC(1);
    float prof = smoothstep(0.0, 0.08, hN) * smoothstep(1.0, 0.45, hN);              // 底平、顶部收窄
    float d = clamp((base * mix(1.0, prof, 0.85) - (1.0 - cov)) / cov, 0.0, 1.0);
    d *= smoothstep(0.0, 0.06, hN) * smoothstep(1.0, 0.85, hN);
    if (detail && d > 0.0) {
      TEXC(1);
      float hi = texture(uCloudNoise, p * (1.0 / 72.0) + vec3(uTime * 0.004, -uTime * 0.002, 0.0)).g;
      d = clamp((d - hi * mix(0.32, 0.12, hN)) / (1.0 - hi * 0.3), 0.0, 1.0);    // 底部侵蚀更多（蓬松下缘）
    }
    return d;
  }
  float hgPh(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
  // tLim：云层入口超过它就不追（调用方保证 tc ≥ tLim 的云不会被画出，见 main 的云门控）
  bool cloudVol(vec3 ro, vec3 r, int nS, int nL, float tLim, out float tc, out vec4 cc) {
    tc = -1.0; cc = vec4(0.0);
    ro.xz += uWOff + uCloud.xy;
    float y0 = uCloud.z, T = uCloud.w * 9.6, y1 = y0 + T;                // 厚度 5 → 48 格（与体积/MC 同参数观感一致）
    // 行星曲率：点的「等效高度」= y + 水平距²/(2R) → 远处云层压向地平线（光影包的做法），否则平板云在约 3° 仰角处截断
    const float RC = 1.0 / (2.0 * 4500.0);
    float hl = max(length(r.xz), 1e-4), ka = hl * hl * RC;
    // y(t) = ro.y + r.y·t + ka·t² 单调（t > 顶点）；求与 y0 / y1 的正根
    float c0 = ro.y - y0, c1 = ro.y - y1;
    if (c1 >= 0.0 && r.y >= 0.0) return false;                        // 在云层上方且向上
    float tE = 0.0, tX;
    if (c0 < 0.0) tE = -2.0 * c0 / max(r.y + sqrt(r.y * r.y - 4.0 * ka * c0), 1e-6);   // 数值稳定的正根
    tX = c1 < 0.0 ? -2.0 * c1 / max(r.y + sqrt(r.y * r.y - 4.0 * ka * c1), 1e-6) : 2400.0 / hl;
    tX = min(tX, 2400.0 / hl);                                         // 水平距离上限
    if (tE >= tX || tE >= tLim) return false;
    float dt = max((tX - tE) / float(nS), 1.2);
    float t = tE + dt * ign(gl_FragCoord.xy);
    // 光源用宿主可见的太阳/月亮方向（东升西落于 x-y 平面，z 略偏 0.2），不含面板「光向量偏移」——银边/高亮点与天上的日月对齐
    bool day = uSunVis.y > -0.05;
    vec3 Ld = day ? uSunVis : -uSunVis;                                 // 夜间用月光（宿主月亮 = 太阳对向）
    float dayF = smoothstep(-0.05, 0.12, uSunVis.y);
    vec3 sunC = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.96, 0.9), smoothstep(0.02, 0.35, uSunVis.y));
    vec3 lightC = mix(vec3(0.10, 0.13, 0.20), sunC * (1.0 + 1.83 * uCloud2.z), dayF);   // 日照 0.36 → ×1.66
    vec3 amb = mix(vec3(0.75), mix(uSkyTop, uSkyHor, 0.5), dayF) * uCloudColor * 0.9;   // 天空光（宿主云色已含昼夜；夜间不再乘暗天色）
    float cth = dot(r, Ld);
    float ph = mix(hgPh(cth, 0.65), hgPh(cth, -0.25), 0.35) * 12.566 * 0.5 + 0.25;
    const float SIG = 0.22;
    float Tr = 1.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < 64; i++) {
      if (i >= nS || t >= tX || Tr < 0.03) break;
      CLC();
      vec3 p = ro + r * t; float hN = (p.y + ka * t * t - y0) / T;
      float den = cloudDen(p, hN, true);
      if (den > 0.003) {
        if (tc < 0.0) tc = t;
        float od = 0.0, ls = 2.5;
        for (int j = 0; j < 4; j++) {
          if (j >= nL) break;
          vec3 lp = p + Ld * ls; vec2 lq = lp.xz - ro.xz; float lh = (lp.y + dot(lq, lq) * RC - y0) / T;
          od += cloudDen(lp, lh, false) * ls * (j == 0 ? 1.0 : 0.6); ls *= 2.6;
        }
        od *= SIG;
        float beer = exp(-od) + 0.25 * exp(-od * 0.25);                // 多次散射近似：加一条弱衰减的尾巴
        float powder = 1.0 - 0.7 * exp(-den * 6.0);
        vec3 S = lightC * beer * powder * ph + amb * mix(0.5 - 0.5 * uCloud2.y, 1.0, hN * hN);   // 暗部 0.28 → 底部 0.36
        float st = den * SIG, e = exp(-st * dt);
        acc += Tr * S * (1.0 - e);
        Tr *= e;
        t += dt;
      } else t += dt * 1.6;                                            // 空区大步
    }
    if (tc < 0.0) return false;
    float hd = length(r.xz) * tc;
    float a = (1.0 - Tr) * (1.0 - smoothstep(1400.0, 2400.0, hd));
    acc = mix(acc, uSkyHor * (1.0 - Tr), smoothstep(200.0, 2000.0, hd) * 0.7);   // 空气透视：远处云融进地平线色
    a *= mix(1.0, min(uStar1.z, 1.6), 1.0 - dayF) * 0.98;
    cc = vec4(acc / max(1.0 - Tr, 1e-3), clamp(a, 0.0, 1.0));
    return cc.a > 0.01;
  }
  #endif
  bool cloudHit(vec3 ro, vec3 r, float tLim, out float tc, out vec4 cc) {
    #if CLOUD_STYLE == 2
    return cloudVol(ro, r, 44, 3, tLim, tc, cc);
    #endif
    ro.xz += uWOff + uCloud.xy;
    float y0 = uCloud.z, y1 = uCloud.z + uCloud.w;
    float ta = (y0 - ro.y) / r.y, tb = (y1 - ro.y) / r.y;
    float tE = max(min(ta, tb), 0.0), tX = max(ta, tb);
    bool inside = ro.y >= y0 && ro.y <= y1;
    if (inside) tX = r.y > 0.0 ? tb : ta; else if (tX < 0.0) return false;
    tX = min(tX, 600.0);
    if (tE >= tX || tE >= tLim) return false;
    const float SZ = 768.0 / 64.0;
    vec2 p = (ro.xz + r.xz * tE) / SZ, d = r.xz / SZ;
    ivec2 cell = ivec2(floor(p)), st = ivec2(sign(d));
    vec2 inv = 1.0 / mix(d, vec2(1e-6), vec2(lessThan(abs(d), vec2(1e-6))));
    vec2 tM = tE + (vec2(cell + max(st, ivec2(0))) - p) * inv, tD = abs(inv);
    float t = tE, od = 0.0; int face = inside ? 4 : (r.y > 0.0 ? 3 : 2), f0 = -1;   // 2 顶 3 底 0 x侧 1 z侧 4 相机在云内
    tc = -1.0;
    for (int i = 0; i < 96; i++) {
      if (t >= tX) break;
      CNT(1); CLC();
      float tn = min(min(tM.x, tM.y), tX);
      if (texelFetch(uCloudTex, ((cell % 64) + 64) % 64, 0).a > 0.5) {
        if (f0 < 0) { tc = t; f0 = face; }
        #if CLOUD_STYLE == 1
        break;                                        // MC 方块云：首个入射面即结果
        #else
        od += tn - t;
        if (od * uCloud2.x > 4.0) break;              // 已基本不透明
        #endif
      }
      if (tM.x < tM.y) { t = tM.x; cell.x += st.x; tM.x += tD.x; face = 0; }
      else             { t = tM.y; cell.y += st.y; tM.y += tD.y; face = 1; }
    }
    if (f0 < 0) return false;
    float dayF = smoothstep(-0.05, 0.12, uSunVis.y), hd = length(r.xz * tc);   // 云一律对齐宿主可见日月
    float nightA = mix(uStar1.z, 1.0, dayF);         // 夜间云更实（按住星星）
    #if CLOUD_STYLE == 1
    float baseM = f0 == 2 ? 1.0 : f0 == 3 ? 0.75 : f0 == 4 ? 0.92 : 0.85;   // 顶亮、底暗、侧中等
    cc = vec4(uCloudColor * baseM, min(uCloudAlpha * nightA, 1.0) * (1.0 - smoothstep(250.0, 480.0, hd)));
    return cc.a > 0.01;
    #endif
    vec3 nF = f0 == 2 ? vec3(0.0, 1.0, 0.0) : f0 == 3 ? vec3(0.0, -1.0, 0.0) : f0 == 0 ? vec3(-sign(r.x), 0.0, 0.0)
            : f0 == 1 ? vec3(0.0, 0.0, -sign(r.z)) : -r;
    float base = f0 == 2 ? 1.0 : f0 == 3 ? 0.8 : f0 == 0 ? 0.92 : f0 == 1 ? 0.87 : 0.92;   // 底面比天空亮（白云）
    float faceSh = 1.0 - (1.0 - base) * (0.6 + 0.8 * uCloud2.y);
    float core = 1.0 - 0.3 * uCloud2.y * (1.0 - exp(-od / max(uCloud.w, 1.0)));
    float lit = 1.0 + uCloud2.z * (max(dot(nF, uSunVis), 0.0) - 0.2) * dayF;
    cc = vec4(uCloudColor * faceSh * core * lit, min((1.0 - exp(-od * uCloud2.x)) * nightA, 1.0) * (1.0 - smoothstep(250.0, 480.0, hd)));
    return cc.a > 0.01;
  }
  uniform int uShadowSteps;
  uniform float uShadowStrength, uShadowDist, uSun;
  uniform mat4 uInvProj, uCamWorld;
  varying vec2 vUv;


  // 局部坐标（相对玩家所在区块原点）→ 环形纹素；被除数先加正偏移，避免负数取模（GLSL 未定义）
  // r = id，g = sky<<4|blk，b = meta，a = dist(低 5 位) | OPAQUE<<5 | LEAF<<6 | FLUID<<7
  uvec4 voxAt(ivec3 c) {
    int o = uSX * 4; CNT(1);
    return texelFetch(uVox, ivec3((c.x + uOrgSlot.x * 16 + o) % uSX, c.y, (c.z + uOrgSlot.y * 16 + o) % uSX), 0);
  }
  uint brickAt(ivec3 b) {
    int S4 = uSX / 4, o = uSX * 4; CNT(1);
    return texelFetch(uBrick, ivec3((b.x + uOrgSlot.x * 4 + o) % S4, b.y, (b.z + uOrgSlot.y * 4 + o) % S4), 0).r;
  }
  // 区块列：x = 列高 maxY+1，y = 全空段掩码，z = 全不透明段掩码；槽位归属（区块坐标低 8 位）不符 → 视为空
  uvec3 colAt(ivec2 ch) {
    CNT(1);
    uvec4 c = texelFetch(uCol, (ch + uOrgSlot + uN * 64) % uN, 0);
    ivec2 lo = (ch + uOrgLow + 4096) % 256;
    return (c.r == 0u || c.g != uint(lo.x | (lo.y << 8))) ? uvec3(0u) : c.rba;
  }
  // 方块状态 k0（hm = id | (meta&15)<<8，trace 的 hid 也按此打包）
  #if META
  uint vhm(uvec4 v) { return v.r | ((v.b & 15u) << 8u); }
  #define VMETA(v) ((v).b & 15u)
  #else
  uint vhm(uvec4 v) { return v.r; }                     // 无 meta 宿主（A）：不读 B 通道（Intel 采样按通道掩码返回，少读一个通道实测 −0.4 ms）
  #define VMETA(v) 0u
  #endif
  uvec4 infoOf(uint hm) { CNT(1); return texelFetch(uInfo, ivec2(int(hm & 255u), int((hm >> 8u) & 15u) * 4), 0); }
  // 邻域查询（越界：y<0 视为不透明，y>=H 视为满天空光的空气）
  void cellLO(ivec3 c, out float o, out float s, out float b) {
    if (c.y < 0) { o = 1.0; s = 0.0; b = 0.0; return; }
    if (c.y >= H) { o = 0.0; s = 15.0; b = 0.0; return; }
    uvec4 v = voxAt(c);                                 // 1 fetch：不透明位在 A 通道
    o = (v.a & 32u) != 0u ? 1.0 : 0.0; s = float(v.g >> 4u); b = float(v.g & 15u);
  }
  // v1 emitCube 同款：面前方体素 fc 的 3×3 邻域 → 四角平滑光照 + AO 等级，再按面内坐标 f 双线性
  // t1/t2 = 面内两条世界轴；f = 沿 t1/t2 的格内坐标（0..1）。返回 vec3(sky, blk, ao01)
  vec3 smoothLight(ivec3 fc, ivec3 t1, ivec3 t2, vec2 f) {
    float o[9], s[9], b[9];
    for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
      int k = j * 3 + i; cellLO(fc + t1 * (i - 1) + t2 * (j - 1), o[k], s[k], b[k]);
    }
    vec3 cr[4];
    for (int q = 0; q < 4; q++) {
      int a = (q & 1) * 2, c = (q >> 1) * 2;          // 角点在 3×3 中的列/行（0 或 2）
      int k1 = 3 + a, k2 = c * 3 + 1, k3 = c * 3 + a; // 侧 1（沿 t1）、侧 2（沿 t2）、对角
      float ss = s[4], bb = b[4], n = 1.0;
      if (o[k1] < 0.5) { ss += s[k1]; bb += b[k1]; n += 1.0; }
      if (o[k2] < 0.5) { ss += s[k2]; bb += b[k2]; n += 1.0; }
      if (o[k3] < 0.5 && !(o[k1] > 0.5 && o[k2] > 0.5)) { ss += s[k3]; bb += b[k3]; n += 1.0; }
      float lvl = (o[k1] > 0.5 && o[k2] > 0.5) ? 0.0 : 3.0 - o[k1] - o[k2] - o[k3];
      cr[q] = vec3(ss / n, bb / n, lvl / 3.0);
    }
    return mix(mix(cr[0], cr[1], f.x), mix(cr[2], cr[3], f.x), f.y);
  }
  ivec3 cellAt(vec3 ro, vec3 r, float t, float sz) { return ivec3(floor((ro + r * t) / sz)); }

  // 方块面贴图坐标（与 FACES/UVS 的朝向一致）；f = 格内坐标
  vec2 faceUV(ivec3 n, vec3 f, uvec4 inf, out float layer, out float shade) {
    if (n.x > 0) { layer = float(inf.a); shade = 0.6; return vec2(1.0 - f.z, f.y); }
    if (n.x < 0) { layer = float(inf.a); shade = 0.6; return vec2(f.z, f.y); }
    if (n.y > 0) { layer = float(inf.g); shade = 1.0; return vec2(f.x, 1.0 - f.z); }
    if (n.y < 0) { layer = float(inf.b); shade = 0.5; return vec2(f.x, f.z); }
    if (n.z > 0) { layer = float(inf.a); shade = 0.8; return vec2(f.x, f.y); }
    layer = float(inf.a); shade = 0.8; return vec2(1.0 - f.x, f.y);
  }
  float lodAt(float t) { return log2(max(t * uTexelAngle * 16.0, 1e-3)); }
  bool solidAt(ivec3 c) { return c.y >= 0 && c.y < H && (infoOf(vhm(voxAt(c))).r & 32u) != 0u; }

  // 花草：格内两条对角竖直平面（v1 emitCross：x=z 与 x+z=1，水平范围 0.15..0.85）
  // sw = 摇动剪切量（高草；底部固定、顶部偏移 sw·(1, 0.6)，同树叶）；线性剪切不改变射线参数 t
  bool crossHit(vec3 o, vec3 d, float t0, float t1, float layer, float sw, inout float tH, inout vec2 uvH) {
    if (sw != 0.0) { vec2 sv = sw * vec2(1.0, 0.6); o.xz -= sv * o.y; d.xz -= sv * d.y; }
    float ta = -(o.x - o.z) / (d.x - d.z), tb = (1.0 - o.x - o.z) / (d.x + d.z);
    for (int k = 0; k < 2; k++) {
      float tt = (k == 0) == (ta < tb) ? ta : tb;
      if (tt < t0 || tt > t1) continue;
      vec3 p = o + d * tt;
      if (p.x < 0.15 || p.x > 0.85 || p.y < 0.0 || p.y > 1.0) continue;
      vec2 uv = vec2((p.x - 0.15) / 0.7, p.y);
      if (matSampleLod(uv, layer, lodAt(tt)).a >= 0.5) { tH = tt; uvH = uv; return true; }
    }
    return false;
  }
  // 火把：2×10×2 texel 小盒子；贴墙时按 v1 emitTorch 的剪切变换倾斜（在剪切空间里做 slab 求交）
  bool torchHit(ivec3 cell, vec3 o, vec3 d, float t0, float t1, float layer, inout float tH, inout vec2 uvH) {
    int wx = 0, wz = 0;
    if (!solidAt(cell - ivec3(0, 1, 0))) {
      if (solidAt(cell + ivec3(1, 0, 0))) wx = 1; else if (solidAt(cell - ivec3(1, 0, 0))) wx = -1;
      else if (solidAt(cell + ivec3(0, 0, 1))) wz = 1; else if (solidAt(cell - ivec3(0, 0, 1))) wz = -1;
    }
    if (wx != 0 || wz != 0) {
      o.y -= 0.2;
      vec2 w = vec2(wx, wz);
      o.xz -= w * (0.35 - 0.45 * o.y); d.xz += w * 0.45 * d.y;
    }
    vec3 inv = 1.0 / d, lo = vec3(7.0, 0.0, 7.0) / 16.0, hi = vec3(9.0, 10.0, 9.0) / 16.0;
    vec3 a = (lo - o) * inv, b = (hi - o) * inv, tn = min(a, b), tf = max(a, b);
    float te = max(max(tn.x, tn.y), tn.z), tx = min(min(tf.x, tf.y), tf.z);
    if (te > tx || tx < t0 || te > t1) return false;
    float tt = max(te, t0);
    vec3 p = o + d * tt;
    vec2 uv = (tn.y == te && te >= t0) ? vec2(p.x * 16.0, p.z * 16.0 + 1.0) / 16.0
            : (tn.x == te ? vec2(p.z, p.y) : vec2(p.x, p.y));
    if (matSampleLod(uv, layer, lodAt(tt)).a < 0.5) return false;
    tH = tt; uvH = uv; return true;
  }

  // ── 树叶（goals §1/§2）──
  bool gLeafSolid = false;             // LEAF_SH == 0 时：本次阴影射线的受光面是树叶 → 树叶按实心
  // 距离一律按「格中心到相机」量化：整块树叶一起切换精度/摇动幅度，不会出现一个球面扫过所有树
  float cellD(ivec3 c) { return length(vec3(c) + 0.5 - uRo); }
  ivec3 gShHome = ivec3(-1 << 20);     // 阴影射线跳过的起点格（卡片命中点在树叶格内）
  bool gCrossRecv = false;             // 本次阴影射线的受光面是高草：高草不互相投影（同树叶：自身只有投到地面的拖影；花照常受影）
  uint lhash(ivec3 c) { return hashU(c + ivec3(int(uWOff.x), 0, int(uWOff.y)), uint(uLeaf1.w)); }
  // 精度切换渐变（leafLodMs）：宿主维护一个指数滞后的相机 uRoLag（τ = leafLodMs）。
  // 格中心对「当前」和「滞后」相机的距离在阈值 L 两侧 → 该格正在切换；进度 = 滞后相机走到阈值球面还差多少
  // （匀速移动时滞后距离 = v·τ → 每格切换历时 ≈ τ，与速度无关）。返回「实心度」0..1
  float lodK(ivec3 c, float L) {
    if (L > 1e29) return 0.0;
    vec3 cc = vec3(c) + 0.5;
    float dn = length(cc - uRo) - L, dl = length(cc - uRoLag) - L;
    if ((dn > 0.0) == (dl > 0.0)) return dn > 0.0 ? 1.0 : 0.0;
    float p = dn / (dn - dl);                         // 0 = 刚跨过（仍是旧状态）→ 1 = 完成
    return dn > 0.0 ? p : 1.0 - p;
  }
  // 溶解拖尾：入射面上按 16² texel 的世界哈希逐像素切换（和贴图像素对齐，像是叶子逐片填满/长出孔洞）
  float lodDither(ivec3 c, ivec3 nrm, vec3 f) {
    vec2 p = nrm.x != 0 ? f.zy : nrm.y != 0 ? f.xz : f.xy;
    ivec2 tx = ivec2(clamp(floor(p * 16.0), 0.0, 15.0));
    int fid = nrm.x != 0 ? 0 : nrm.y != 0 ? 1 : 2;
    ivec3 w = c + ivec3(int(uWOff.x), 0, int(uWOff.y));
    return float(hashU(ivec3(w.x * 16 + tx.x, w.y * 16 + tx.y, w.z * 3 + fid), 4241u) & 1023u) / 1023.0;
  }
  bool lodSolid(ivec3 c, float L, ivec3 nrm, vec3 f) {
    float k = lodK(c, L);
    return k >= 1.0 || (k > 0.0 && lodDither(c, nrm, f) < k);
  }
  // 摇动：按世界格哈希错相的正弦剪切量；距离 [0.7, 1]·swayDist 内淡出，之外为 0（阴影射线不摇）
  float swayK(ivec3 c) {
    float dc = cellD(c);
    if (uSway.x <= 0.0 || dc >= uSway.z) return 0.0;
    vec2 w = vec2(c.xz) + uWOff;
    return uSway.x * clamp((uSway.z - dc) / (0.3 * uSway.z), 0.0, 1.0)
         * sin(uTime * uSway.y + float(lhash(c) & 1023u) / 1023.0 * 6.2832 + (w.x + w.y) * 0.3);
  }
  vec3 swayF(ivec3 c, vec3 f) { f.xz += swayK(c) * vec2(1.0, 0.6) * f.y; return f; }
  bool leafFace(ivec3 c, vec3 o, vec3 r, float t, ivec3 nrm, uvec4 inf) {   // 主射线：入射面 alpha（带摇动）
    float ly, sh; vec2 uv = faceUV(nrm, swayF(c, clamp(o + r * t, 0.0, 1.0)), inf, ly, sh);
    return matSampleLod(uv, ly, lodAt(t)).a >= 0.5;
  }
  #if LEAF_CARDS
  // 叶簇卡片：格内 2 张对角竖卡 + 2 张斜卡（层数≥2），按格哈希旋转/翻转/法向偏移；边长 +外伸 可伸出格外
  // lc = 树叶格，o = ro - lc，[t0,t1] = 射线在当前所在格内的区间；tH 保留最近命中
  bool leafCards(ivec3 lc, vec3 o, vec3 d, float t0, float t1, float sw, inout float tH, inout vec2 uvH) {
    uint h = lhash(lc);
    vec3 q = o - 0.5, e = d;
    vec2 sv = sw * vec2(1.0, 0.6);
    q.xz -= sv * (q.y + 0.5); e.xz -= sv * e.y;      // 摇动剪切（底部固定）
    if ((h & 1u) != 0u) { q.xz = vec2(-q.z, q.x); e.xz = vec2(-e.z, e.x); }
    if ((h & 2u) != 0u) { q.xz = -q.xz; e.xz = -e.xz; }
    bool flip = (h & 4u) != 0u;
    float off = float((h >> 3) & 255u) / 255.0 * 0.2 - 0.1, ov = uLeaf1.x;
    int np = uLeaf1.z >= 1.5 ? 4 : 2;
    bool got = false;
    for (int k = 0; k < 4; k++) {
      if (k >= np) break;
      vec3 n, ua, va; float hu;
      if (k == 0)      { n = vec3(0.7071, 0.0, -0.7071); ua = vec3(0.7071, 0.0, 0.7071);  va = vec3(0.0, 1.0, 0.0); hu = 0.7071; }
      else if (k == 1) { n = vec3(0.7071, 0.0, 0.7071);  ua = vec3(0.7071, 0.0, -0.7071); va = vec3(0.0, 1.0, 0.0); hu = 0.7071; }
      else if (k == 2) { n = vec3(-0.3304, 0.9439, 0.0); ua = vec3(0.9439, 0.3304, 0.0);  va = vec3(0.0, 0.0, 1.0); hu = 0.53; }
      else             { n = vec3(0.0, 0.9439, 0.3304);  ua = vec3(0.0, -0.3304, 0.9439); va = vec3(1.0, 0.0, 0.0); hu = 0.53; }
      float dn = dot(n, e); if (abs(dn) < 1e-5) continue;
      float tt = (off - dot(n, q)) / dn;
      if (tt < t0 || tt > t1 || tt >= tH) continue;
      vec3 p = q + e * tt;
      float eu = hu + ov, ev = 0.5 + ov, u = dot(p, ua), v = dot(p, va);
      if (abs(u) > eu || abs(v) > ev) continue;
      vec2 uv = vec2(u / eu, v / ev) * 0.5 + 0.5; if (flip) uv.x = 1.0 - uv.x;
      if (matSampleLod(uv, ${LEAF_CARD_LAYER}.0, lodAt(tt)).a >= uLeaf1.y) { tH = tt; uvH = uv; got = true; }
    }
    return got;
  }
  #endif


  // 入格（逐格进砖 / DF 入口探测 / DF 盒跳跃落点共用）：t 时刻、刚跨过 a 轴的面（a = −1：未跨面）后，在盒 [lo, hi) 里所在的格。
  // 生产：clamp(floor(ro + r·t))——跨越轴由 clamp 落到盒内第一格；其余轴只在浮点舍入级（~1e-6）的平局上与逐格步进分歧
  //   （逐格层连续走过砖界、砖级在砖界重新入格，两边在平局上可能选不同的邻格：同样安全，DF 开/关会差个别像素）。
  // REF_MODE（参考模式，setRef）：每轴取最近格面 k，用与步进完全相同的式子算平面时间 P = (k − ro)·inv：P < t（或 P == t 且该轴
  //   优先于 a；平局优先级 z > y > x = 步进分支的 < 比较）→ 已跨过 → 进入 k 那一侧的格。逐位等于逐格步进 → DF 开/关 0 px；
  //   代价约 5%（默认预设）/ 10%（bliss），所以只在逐像素对比时编进去。
  // 旧写法 floor(ro + r·(t + 1e-4)) 在两个面相距 < 1e-4 时会跳过一格（报砖入口的 t / 法线：草地上的黑点）
  ivec3 cellIn(vec3 ro, vec3 r, vec3 inv, ivec3 st, float t, int a, ivec3 lo, ivec3 hi) {
    #if REF_MODE
    vec3 k = floor(ro + r * t + 0.5), P = (k - ro) * inv;
    vec3 cr = step(0.5, vec3(lessThan(P, vec3(t))) + vec3(equal(P, vec3(t))) * vec3(greaterThan(ivec3(0, 1, 2), ivec3(a))));
    vec3 neg = vec3(lessThan(st, ivec3(0)));
    return clamp(ivec3(k - mix(1.0 - neg, neg, cr)), lo, hi - 1);   // 跨过：st>0 → k，st<0 → k−1；未跨过：st>0 → k−1，st<0 → k
    #else
    return clamp(ivec3(floor(ro + r * t)), lo, hi - 1);
    #endif
  }

  int nAx(ivec3 n) { return n.x != 0 ? 0 : n.y != 0 ? 1 : 2; }

  // 两级 DDA（4³ 砖 → 体素）。kind：0 = 方块面（含镂空方块），2 = 花草，3 = 火把，6 = 树叶卡片
  bool trace(vec3 ro, vec3 r, float maxD, int maxSteps, bool shadow,
             out float tHit, out ivec3 hc, out ivec3 nrm, out uint hid, out int kind, out vec3 uvl,
             out float tw, out ivec3 wn) {
    // 分量为 0 时 inv=inf、sign=0，起点恰在格边界会得到 0*inf=NaN（整列/整行穿到天空的细线）→ 钳到 ±1e-7
    vec3 inv = 1.0 / r;
    ivec3 st = ivec3(sign(r)), up = max(st, ivec3(0));
    vec3 t1, t2, tn, tf;
    t1 = (uLo - ro) * inv; t2 = (uHi - ro) * inv; tn = min(t1, t2); tf = max(t1, t2);
    float tE = max(max(tn.x, tn.y), tn.z), tX = min(min(min(tf.x, tf.y), tf.z), maxD);
    nrm = ivec3(0, 1, 0); kind = 0; uvl = vec3(0.0); hid = 0u; tHit = 0.0; hc = ivec3(0); tw = -1.0; wn = ivec3(0, 1, 0);
    if (tE > 0.0) nrm = tn.x == tE ? ivec3(-st.x, 0, 0) : tn.y == tE ? ivec3(0, -st.y, 0) : ivec3(0, 0, -st.z);
    float t = max(tE, 0.0);
    if (t >= tX || (r.y >= 0.0 && ro.y >= uWorldMaxY)) return false;   // 环外 / 天空早退
    ivec3 home = shadow ? gShHome : ivec3(floor(ro));
    // 平面时间一律现算 (平面 − ro)·inv（不累加、不跨迭代保存 tM）：任何路径（逐格 / 砖级 / DF 盒跳跃）到达同一平面的 t 逐位相同，
    // 循环携带的寄存器也少 3 个（tools/shader-stats.mjs：本着色器是 SIMD8 且有 spill，循环状态每多一个寄存器都直接变慢）
    bool fine = false, dfm = false;                     // dfm：逐格层位于 DF 已算的区块（步进 = 盒跳跃，k = 0 即普通一步，不再按砖分段）
    ivec3 bc = ivec3(0), cell = cellAt(ro, r, t + 1e-4, 4.0);
    ivec2 curCh = ivec2(-1 << 20); int cmax = 0; uint sEmpty = 0u, sFull = 0u;
    uint prevId = 0u; int nAlpha = 0;
    // 相机在水中：不画水面（由水下雾表现）；tw 改为记录出水点（水中路径长度，用于仰视透光窗）
    bool camWater = !shadow && home.y >= 0 && home.y < H && isFluid(voxAt(home));
    bool exh = false;
    for (int i = 0; i < 576; i++) {
      if (t >= tX) break;
      if (i >= maxSteps) { exh = true; break; }
      #if DBG_HEAT
      if (shadow) gSIt++; else gIt++;
      #endif
      if (!fine) {
        ivec2 ch = ivec2(floor(vec2(cell.xz) / 4.0));
        if (ch != curCh) { curCh = ch; uvec3 cc = colAt(ch); cmax = int(cc.x); sEmpty = cc.y; sFull = cc.z; }
        if (cell.y * 4 >= cmax) {
          if (camWater && tw < 0.0) { tw = t; wn = nrm; }               // 相机在水中：记录出水点
          // 整段高于本区块列高：直接跳到列出口，或下降到 y = 列高 的平面
          vec2 tc = (vec2((ch + up.xz) * 16) - ro.xz) * inv.xz;
          float tCol = min(tc.x, tc.y), tY = (r.y < 0.0 && cmax > 0) ? (float(cmax) - ro.y) * inv.y : 1e30;
          // 跨越的那一维直接按整数给出（掠射时 t+ε 推不过平面：cmax 为 4 的倍数会原地打转直到耗尽 → 横线）
          if (tY < tCol) {
            t = max(t, tY); nrm = ivec3(0, 1, 0);
            cell = cellAt(ro, r, t, 4.0); cell.y = (cmax - 1) / 4;
          } else {
            t = max(t, tCol); cell = cellAt(ro, r, t, 4.0);
            if (tc.x < tc.y) { nrm = ivec3(-st.x, 0, 0); cell.x = st.x > 0 ? (ch.x + 1) * 4 : ch.x * 4 - 1; }
            else             { nrm = ivec3(0, 0, -st.z); cell.z = st.z > 0 ? (ch.y + 1) * 4 : ch.y * 4 - 1; }
          }
          prevId = 0u;
          #if DBG_HEAT
          if (!shadow) gLvC++;
          #endif
          continue;
        }
        // 区块段标记（handover §3.1；此处 cell.y*4 < cmax ≤ H，段号 < 16）
        #if SECT
        uint sb = cell.y >= 0 ? 1u << uint(cell.y >> 2) : 0u;
        if ((sEmpty & sb) != 0u) {                         // 全空段：直接跳到段 AABB 出口（同列高跳过的写法）
          if (camWater && tw < 0.0) { tw = t; wn = nrm; }
          int sy = cell.y >> 2;
          vec3 tb = (vec3(ivec3(ch.x, sy, ch.y) + up) * 16.0 - ro) * inv;
          cell = cellAt(ro, r, max(t, min(min(tb.x, tb.y), tb.z)), 4.0);
          if (tb.x < tb.y && tb.x < tb.z) { t = max(t, tb.x); nrm = ivec3(-st.x, 0, 0); cell.x = st.x > 0 ? (ch.x + 1) * 4 : ch.x * 4 - 1; }
          else if (tb.y < tb.z)           { t = max(t, tb.y); nrm = ivec3(0, -st.y, 0); cell.y = st.y > 0 ? (sy + 1) * 4 : sy * 4 - 1; }
          else                            { t = max(t, tb.z); nrm = ivec3(0, 0, -st.z); cell.z = st.z > 0 ? (ch.y + 1) * 4 : ch.y * 4 - 1; }
          prevId = 0u;
          #if DBG_HEAT
          if (!shadow) gLvC++;
          #endif
          continue;
        }
        if ((sFull & sb) != 0u) {                          // 全不透明段：入口格必然命中（除非相机就在这格里）
          ivec3 fc = clamp(cellAt(ro, r, t + 1e-4, 1.0), cell * 4, cell * 4 + 3);
          if (fc != home) {
            if (camWater && tw < 0.0) { tw = t; wn = nrm; }
            tHit = t; hc = fc; hid = vhm(voxAt(fc)); return true;
          }
        }
        #endif
        ivec3 vc = cellIn(ro, r, inv, st, t, i == 0 && tE <= 0.0 ? -1 : nAx(nrm), cell * 4, cell * 4 + 4);   // 进砖时的入口格（起点在环内 = 未跨面）
        #if DF
        // 入口格的 v ≠ 0 → 本区块 DF 已算（或本格占据）→ 逐格层，之后整块区块内不再回砖级
        if (cell.y >= 0 && (voxAt(vc).a & 31u) != 0u) { fine = true; dfm = true; cell = vc; continue; }
        #if DBG_HEAT
        if (!shadow && cell.y >= 0) gDf0++;
        #endif
        #endif
        if (cell.y >= 0 && brickAt(cell) != 0u) {          // 非空砖 → 逐格 DDA（限定在砖内）
          fine = true; dfm = false; bc = cell; cell = vc;
          continue;
        }
        prevId = 0u;
        if (camWater && tw < 0.0) { tw = t; wn = nrm; }
        #if DBG_HEAT
        if (!shadow) gLvB++;
        #endif
        vec3 tb = (vec3((cell + up) * 4) - ro) * inv;
        if (tb.x < tb.y && tb.x < tb.z) { t = tb.x; cell.x += st.x; nrm = ivec3(-st.x, 0, 0); }
        else if (tb.y < tb.z)           { t = tb.y; cell.y += st.y; nrm = ivec3(0, -st.y, 0); }
        else                            { t = tb.z; cell.z += st.z; nrm = ivec3(0, 0, -st.z); }
      } else {
        if (!dfm && ivec3(floor(vec3(cell) / 4.0)) != bc) {   // 离开砖 → 回到砖级
          fine = false; cell = ivec3(floor(vec3(cell) / 4.0));   // 精确：刚跨出的格所在砖
          continue;
        }
        uvec4 vx = voxAt(cell);
        uint id = vx.r, hm = vhm(vx), v = vx.a & 31u;
        #if DF
        if (dfm && v == 0u) {                               // 区块 DF 尚未回包（只有占据格 = 1）→ 退回砖内逐格
          dfm = false; bc = ivec3(floor(vec3(cell) / 4.0));
          #if DBG_HEAT
          if (!shadow) gDf2++;
          #endif
        }
        #endif
        if (camWater && tw < 0.0 && !isFluid(vx)) {         // 出水点；向上穿出顶面时水面按 fluidTop 下沉（v1 lowerTop 1/8）
          tw = t; wn = nrm;                                  // （逐格层才下沉；DF 逐格层里本格所在砖为空时 = 原砖级记录，不下沉）
          if (nrm.y < 0 && (!dfm || brickAt(ivec3(floor(vec3(cell) / 4.0))) != 0u)) tw = max(t - (1.0 - fluidTop(0u, false)) / r.y, 0.0);
        }
        vec3 tc = (vec3(cell + up) - ro) * inv;             // 本格出口面
        int k = 0;
        #if DF
        if (dfm && v >= 3u) k = int(v) - 2;                 // 本格非 DF 占据且 d ≥ 2：盒内全空，不看内容
        else
        #endif
        if (id != 0u) {
          float tN = min(min(tc.x, tc.y), tc.z);
          vec3 o = ro - vec3(cell);
          // 不透明非树叶（A：OPAQUE 且非 LEAF）→ 直接命中，不查 uInfo（树叶阴影「无」时内部树叶 255 例外，走下面的通用分支）
          #if LEAF_SH == 2
          if ((vx.a & 96u) == 32u && cell != home && !(shadow && ${LEAF_OK ? 'id == 255u' : 'false'})) { tHit = t; hc = cell; hid = hm; return true; }
          #else
          if ((vx.a & 96u) == 32u && cell != home) { tHit = t; hc = cell; hid = hm; return true; }
          #endif
          if (isFluid(vx)) {
            if (!shadow && tw < 0.0 && !camWater) {                          // 流体：只记录首次入水点，射线继续穿过
              // 上方不是同种流体 → 水面下沉到 fluidTop（同 v1 lowerTop 7/8）：入射点高于水面时改求与水面平面的交点
              float top = fluidTop(VMETA(vx), cell.y + 1 < H && isFluid(voxAt(cell + ivec3(0, 1, 0))));
              float y0 = o.y + r.y * t;
              if (top >= 1.0 || y0 <= top) { tw = t; wn = nrm; }
              else if (r.y < 0.0) { float tp = (top - o.y) / r.y; if (tp <= tN) { tw = tp; wn = ivec3(0, 1, 0); } }
            }
          } else {
          uvec4 inf = infoOf(hm);
          uint rk = inf.r & 15u;
          if ((inf.r & 128u) != 0u) {                                       // 树叶（LEAVES_INNER 走下面的不透明分支）
            if (cell != home) {
              if (shadow) {                                                  // 阴影（不摇）：LEAF_SH 编译期三档
                #if LEAF_SH == 0
                bool h = gLeafSolid;                                         // 树叶受光面：树叶之间按实心
                #if LEAF_SH_LOD
                h = h || lodSolid(cell, uLeaf0.y, nrm, clamp(o + r * t, 0.0, 1.0));   // 远处叶块整格投实心影（带渐变）
                #endif
                h = h || ++nAlpha > 8;
                if (!h) { float ly, sh; vec2 uv = faceUV(nrm, clamp(o + r * t, 0.0, 1.0), inf, ly, sh); h = matSampleLod(uv, ly, lodAt(t)).a >= 0.5; }
                if (h) { tHit = t; hc = cell; hid = hm; return true; }
                #elif LEAF_SH == 1
                tHit = t; hc = cell; hid = hm; return true;                  // 实心：直接命中
                #endif
                                                                             // LEAF_SH == 2：穿过
              }
              #if LEAF_LOD
              else if (lodSolid(cell, uLeaf0.x, nrm, clamp(o + r * t, 0.0, 1.0)) || ++nAlpha > 8) {   // 远处 LOD：实心（带渐变）
              #else
              else if (++nAlpha > 8) {
              #endif
                tHit = t; hc = cell; hid = hm; return true;
              } else {
                #if LEAF_CARDS
                if (uLeaf1.z >= 2.5 && leafFace(cell, o, r, t, nrm, inf)) { tHit = t; hc = cell; hid = hm; return true; }
                float tt = 1e30; vec2 uv = vec2(0.0);
                if (leafCards(cell, o, r, t, tN, swayK(cell), tt, uv)) {
                  tHit = tt; hc = cell; hid = hm; kind = 6; uvl = vec3(uv, ${LEAF_CARD_LAYER}.0); return true;
                }
                #else
                if (leafFace(cell, o, r, t, nrm, inf)) { tHit = t; hc = cell; hid = hm; return true; }
                #endif
              }
            }
          } else {
            #if LEAF_SH == 2
            if (cell != home && (inf.r & 16u) != 0u && !(shadow && ${LEAF_OK ? 'id == 255u' : 'false'})) {   // 不透明方块（树叶阴影「无」时内部树叶也不挡）
            #else
            if (cell != home && (inf.r & 16u) != 0u) {                     // 不透明方块
            #endif
              tHit = t; hc = cell; hid = hm; return true;
            }
            if (cell != home && rk == 1u && !((inf.r & 64u) != 0u && prevId == id)) {   // 镂空方块（玻璃等）：入射面 alpha 测试
              float ly, sh; vec2 uv = faceUV(nrm, clamp(o + r * t, 0.0, 1.0), inf, ly, sh);
              if (++nAlpha > 8 || matSampleLod(uv, ly, lodAt(t)).a >= 0.5) { tHit = t; hc = cell; hid = hm; return true; }
            }
            #if LEAF_CARDS
            if (rk == 5u && !shadow && cellD(cell) < uLeaf0.w && ++nAlpha <= 8) {     // 外伸格：测相邻树叶格（≤ 3 个）伸进来的卡片
              uint m = id - 191u; float tt = 1e30; vec2 uv = vec2(0.0); ivec3 lb = ivec3(0); bool fd = false; int nt = 0;
              for (int k = 0; k < 6; k++) {
                if ((m & (1u << uint(k))) == 0u) continue;
                if (++nt > 3) break;
                ivec3 lc = cell + ivec3(k == 0 ? 1 : k == 1 ? -1 : 0, k == 2 ? 1 : k == 3 ? -1 : 0, k == 4 ? 1 : k == 5 ? -1 : 0);
                if (leafCards(lc, ro - vec3(lc), r, t, tN, swayK(lc), tt, uv)) { lb = lc; fd = true; }
              }
              if (fd) { tHit = tt; hc = lb; hid = ${LV != null ? LV : 0}u; kind = 6; uvl = vec3(uv, ${LEAF_CARD_LAYER}.0); return true; }
            }
            #endif
          }
          if ((rk == 2u || rk == 3u) && !(shadow && gCrossRecv && id == ${BT.tallGrassId != null ? BT.tallGrassId : 256}u)) {   // 花草 / 火把（高草受光面的阴影射线穿过高草）
            float tt = 0.0; vec2 uv = vec2(0.0);
            bool h = ++nAlpha > 8 ? false : rk == 2u ? crossHit(o, r, t, tN, float(inf.a), !shadow && id == ${BT.tallGrassId != null ? BT.tallGrassId : 256}u ? swayK(cell) : 0.0, tt, uv)
                                                     : torchHit(cell, o, r, t, tN, float(inf.a), tt, uv);
            if (h) { tHit = tt; hc = cell; hid = hm; kind = int(rk); uvl = vec3(uv, float(inf.a)); return true; }
          }
          }
        }
        prevId = id;
        #if DBG_HEAT
        if (!shadow) { if (k > 0) gLvD++; else gLvV++; }
        #endif
        // 步进：盒 [cell−k, cell+k+1)（xz 裁到本区块）的出口面；k = 0 即逐格一步。出口轴按平局优先级 z > y > x（= < 比较）
        ivec3 lo = cell, hi = cell + 1;
        vec3 tb = tc;
        #if DF
        ivec2 c0 = cell.xz & ~15;                           // 本区块原点（补码按位与 = 向 −∞ 取整到 16 的倍数）
        if (k > 0) { lo = cell - k; hi = cell + k + 1; lo.xz = max(lo.xz, c0); hi.xz = min(hi.xz, c0 + 16); tb = (vec3(lo + (hi - lo) * up) - ro) * inv; }
        #endif
        int a = tb.x < tb.y && tb.x < tb.z ? 0 : tb.y < tb.z ? 1 : 2;
        t = a == 0 ? tb.x : a == 1 ? tb.y : tb.z;
        #if DF
        if (k > 0) cell = cellIn(ro, r, inv, st, t, a, lo, hi);   // 非出口轴的落点（出口轴下面直接给整数）
        #endif
        if (a == 0)      { cell.x = st.x > 0 ? hi.x : lo.x - 1; nrm = ivec3(-st.x, 0, 0); }
        else if (a == 1) { cell.y = st.y > 0 ? hi.y : lo.y - 1; nrm = ivec3(0, -st.y, 0); }
        else             { cell.z = st.z > 0 ? hi.z : lo.z - 1; nrm = ivec3(0, 0, -st.z); }
        #if DF
        if (dfm && (cell.xz & ~15) != c0) { fine = false; cell = ivec3(floor(vec3(cell) / 4.0)); }   // 进入别的区块 → 砖级做列校验
        #endif
      }
    }
    // 迭代预算耗尽：按「全雾的远景」处理，避免掠射角下整片天空从山体/树冠里透出来
    if (exh && !shadow) { tHit = min(t, tX); hc = ivec3(0); hid = 0u; kind = 4; nrm = ivec3(0, 1, 0); return true; }
    return false;
  }

  #if DBG_HEAT
  vec3 heat(float x) { x = clamp(x, 0.0, 1.0); return clamp(vec3(1.5) - abs(4.0 * x - vec3(3.0, 2.0, 1.0)), 0.0, 1.0); }
  // 覆写输出：热力色（或 DBGRAW 原始计数：RG = 16 位计数，B = 阴影迭代），深度 0 → 合成时盖住一切
  void dbgOut() {
    int v = DBG == 1 ? gIt : DBG == 6 ? gTex : gFetch;
    #if DBGRAW
    if (DBG == 5) gl_FragColor = vec4(min(ivec4(gLvC, gLvB, gLvV, gCl), 255)) / 255.0;
    else if (DBG == 4) gl_FragColor = vec4(vec3(min(ivec3(gLvD, gDf0, gDf2), 255)) / 255.0, 1.0);
    else gl_FragColor = vec4(float(v & 255) / 255.0, float(min(v >> 8, 255)) / 255.0, float(min(gSIt, 255)) / 255.0, 1.0);
    #else
    if (DBG == 5) gl_FragColor = vec4(sqrt(vec3(gLvC, gLvB, gLvV) / vec3(8.0, 32.0, 64.0)), 1.0);
    else if (DBG == 4) gl_FragColor = vec4(sqrt(vec3(gLvD, gDf0, gDf2) / 16.0), 1.0);
    else gl_FragColor = vec4(heat(DBG == 1 ? float(v) / float(uSteps) : DBG == 6 ? float(v) / 64.0 : float(v) / 256.0), 1.0);
    #endif
    gl_FragDepth = 0.0;
  }
  #define RET { dbgOut(); return; }
  #else
  #define RET return
  #endif

  // 程序化星星：立方体贴图方向分格，每格按概率放一颗约 1 像素的星（亮度 pow 分布 + 闪烁 + 地平线淡出）
  vec3 starAt(vec3 r) {
    if (r.y < uStar1.x) return vec3(0.0);
    vec3 a = abs(r); vec2 uv; int fid;
    if (a.x >= a.y && a.x >= a.z) { uv = r.yz / a.x; fid = r.x > 0.0 ? 0 : 1; }
    else if (a.y >= a.z)          { uv = r.xz / a.y; fid = r.y > 0.0 ? 2 : 3; }
    else                          { uv = r.xy / a.z; fid = r.z > 0.0 ? 4 : 5; }
    vec2 q = (uv * 0.5 + 0.5) * uStar0.x, c = floor(q);
    uint h = hashU(ivec3(ivec2(c), fid), 977u);
    float h0 = float(h & 65535u) / 65535.0;
    if (h0 >= uStar0.y) return vec3(0.0);
    uint h2 = hashU(ivec3(ivec2(c), fid), 1913u);
    vec2 ctr = 0.2 + 0.6 * vec2(float(h2 & 255u), float((h2 >> 8) & 255u)) / 255.0;
    float px = max(uTexelAngle * uStar0.x * 0.5, 1e-4);   // 一个像素在 q 单位下的大小
    float k = 1.0 - smoothstep(0.3 * px, 1.3 * px, length(q - c - ctr));
    if (k <= 0.0) return vec3(0.0);
    float br = pow(float((h2 >> 16) & 1023u) / 1023.0, uStar0.z) * 1.6;
    br *= 1.0 - uStar0.w * (0.5 + 0.5 * sin(uTime * 2.3 + h0 * 997.0));
    vec3 tint = mix(vec3(1.0, 0.88, 0.78), vec3(0.8, 0.9, 1.0), float((h2 >> 26) & 63u) / 63.0);
    return tint * br * k * smoothstep(uStar1.x, uStar1.x + 0.25, r.y);
  }

  // ── 水面辅助 ──
  float nB(vec2 uv) { TEXC(1); return texture2D(uWaterNoise, uv).b * 1.417; }      // 可平铺噪声高度 ≈ 0..1
  // 岸边波纹（替代泡沫）：平行于岸线、向岸推进的涌浪。d = 到岸距离（格），返回起伏 0..1（× uShore.x = 格）
  // 相位沿岸线由噪声打乱 → 拍岸时刻不同步；d = 0 处即岸壁上水线的升降
  float shoreH(vec2 q, float d) {
    float R = uWater0.w;
    if (R <= 0.0 || d >= R) return 0.0;
    float ph = d * 3.6 + uTime * 1.7 * uShore.y + nB(q * 0.17 + uTime * vec2(0.006, 0.004)) * 7.0;
    float s = 0.5 + 0.5 * sin(ph);
    return s * s * (1.0 - smoothstep(0.25 * R, R, d));
  }
  // 到岸距离（水平，格）：水面层 5×5 邻格里最近的非水非空方块的 AABB 距离（MC 水至少 0.875 深，竖直水深分不出岸边）
  // dir = 离岸方向（距离场梯度，单位向量；无岸 = 0）
  float shoreDist(vec3 wp, float R, out vec2 dir) {
    ivec3 c = ivec3(floor(wp - vec3(0.0, 0.01, 0.0)));
    vec2 f = wp.xz - vec2(c.xz);
    float d = 9.0; dir = vec2(0.0);
    for (int dz = -2; dz <= 2; dz++) for (int dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dz == 0) continue;
      vec2 lo = vec2(float(dx), float(dz));
      float dd = length(f - clamp(f, lo, lo + 1.0));
      if (dd >= min(d, R)) continue;
      uvec4 v = voxAt(c + ivec3(dx, 0, dz)); uint id = v.r;
      if (id != 0u && !isFluid(v)) { d = dd; dir = (f - clamp(f, lo, lo + 1.0)) / max(dd, 1e-4); }
    }
    return d;
  }
  vec3 skyDir(vec3 d) { float h = clamp(d.y * 1.5 + 0.04, 0.0, 1.0); return mix(uSkyHor, uSkyTop, sqrt(h)); }   // 同宿主天空球
  #if WATER_STYLE == 2
  // 光影式水面：Seascape（TDM）式尖峰波高度场（双向对撞 + 噪声域扭曲 + 旋转倍频）→ 差分法线；
  // 反射射线在体素世界里真实追踪（地形/树/体积云/天空），透射按波长吸收 + 内散射，水底焦散，太阳高光带阴影射线
  float seaOct(vec2 uv, float ch) {
    uv += nB(uv * 0.11) * 2.0 - 1.0;
    vec2 wv = 1.0 - abs(sin(uv)), swv = abs(cos(uv));
    wv = mix(wv, swv, wv);
    return pow(1.0 - pow(wv.x * wv.y, 0.65), ch);
  }
  float seaH(vec2 p, int oct) {
    float fq = 0.42 * uWave1.y, amp = 1.0, ch = 4.0, h = 0.0, tt = uTime * 0.9;
    vec2 uv = p * vec2(0.75, 1.0);
    const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) {
      if (i >= oct) break;
      h += (seaOct((uv + tt) * fq, ch) + seaOct((uv - tt) * fq, ch)) * amp;
      uv = M * uv; amp *= 0.22; ch = mix(ch, 1.0, 0.2);
    }
    return h;
  }
  #endif
  // 水下仰视波纹（改编自 Shadertoy「water ripple」：7 向余弦叠加 → cos(相位)，有限差分得折射偏移 + 高光）
  float uwRip(vec2 c, float t) {
    const float DT = 6.2831853 / 7.0;
    float a = 0.0;
    for (int i = 0; i < 8; i++) {
      float th = DT * float(i), cs = cos(th), sn = sin(th);
      vec2 q = c + vec2(cs * t * 0.2 + t * 0.3, -(sn * t * 0.2 - t * 0.3));
      a += cos((q.x * cs - q.y * sn) * 6.0) * 2.4;
    }
    return cos(a);
  }
  // 返回 (dx, dy, 亮度系数)：dx/dy 量级同原 shader（±0.016 屏幕 uv）；面板 0.5/1 = 原着色器 0.14/2.15
  vec3 uwRipple(vec2 wxz, float k) {
    vec2 c = wxz * 0.04 * uUw.y * 2.15; float t = uTime * 1.3;
    float c0 = uwRip(c, t);
    float dx = 0.5 * (c0 - uwRip(c + vec2(21.33, 0.0), t)) / 60.0;
    float dy = 0.5 * (c0 - uwRip(c + vec2(0.0, 10.95), t)) / 60.0;
    float al = 1.0 + dx * dy * 700.0;
    float ddx = dx - 0.012, ddy = dy - 0.012;
    if (ddx > 0.0 && ddy > 0.0) al = pow(al, ddx * ddy * 200000.0);
    return vec3(dx, dy, mix(1.0, al, k));
  }
  // ── 水下（相机在水中）的低成本光效 ──
  // 焦散图样：两层反向漂移噪声之差 → 亮脊（同水上看水底）
  float causAt(vec2 fp) {
    float c1 = nB(fp * 0.31 + uTime * vec2(0.031, 0.017)), c2 = nB(fp * 0.43 - uTime * vec2(0.022, -0.027));
    return pow(clamp(1.0 - abs(c1 - c2) * 3.0, 0.0, 1.0), 6.0);
  }
  // 水面波纹场（与 causAt 同频率/漂移）：返回 (高度梯度 xz, 亮脊图样)
  vec3 uwField(vec2 fp) {
    vec2 A = uTime * vec2(0.031, 0.017), B = uTime * vec2(0.022, -0.027);
    float c1 = nB(fp * 0.31 + A), c2 = nB(fp * 0.43 - B), e = 0.15;
    float hx = nB((fp + vec2(e, 0.0)) * 0.31 + A) + nB((fp + vec2(e, 0.0)) * 0.43 - B);
    float hz = nB((fp + vec2(0.0, e)) * 0.31 + A) + nB((fp + vec2(0.0, e)) * 0.43 - B);
    float h0 = c1 + c2;
    return vec3((hx - h0) / e, (hz - h0) / e, pow(clamp(1.0 - abs(c1 - c2) * 3.0, 0.0, 1.0), 6.0));
  }
  // 水下的太阳：光照方向（含面板方位 / 仰角偏移）与天上可见太阳按 uShaft1.y 混合 —— 光束、焦散、斯涅尔窗光斑共用，方向一致
  vec3 uwL() { return normalize(mix(uSunDir, uSunVis, uShaft1.y)); }
  vec3 uwSunC() { return mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.95, 0.85), smoothstep(0.02, 0.35, uwL().y)); }
  // 水中阳光传播方向（向下）。透过水面看天空时本渲染器不做折射（水下仰视只做波纹偏移），所以默认也不折射，
  // 光束 / 斯涅尔窗光斑才会汇聚在看到的太阳上；uShaft1.z → 1 混到物理折射方向（更陡，太阳显得更高）
  vec3 uwLs() { vec3 L = uwL(); return normalize(mix(-L, refract(-L, vec3(0.0, 1.0, 0.0), 0.752), uShaft1.z)); }
  // 水体颜色吸收：按水体本身的颜色（= 宿主水下雾色 cWater×昼夜）逐通道 Beer 衰减 + 向水色内散射
  vec3 uwAbsorb(vec3 c, float d) {
    vec3 wc = uFogColor / max(max(uFogColor.r, uFogColor.g), max(uFogColor.b, 1e-3));
    vec3 Tr = exp(-uUw.z * 0.3 * (1.05 - wc) * d);
    return c * Tr + uFogColor * (1.0 - Tr);
  }
  // 水下物体表面焦散：从所在水格向上找水面（≤ 8 格），按水深衰减；投影沿折射阳光方向
  float uwCaustic(vec3 p, ivec3 c) {
    if (c.y < 0 || c.y >= H || !isFluid(voxAt(c))) return 0.0;
    int k = 1;
    for (; k < 8; k++) { ivec3 q = c + ivec3(0, k, 0); if (q.y >= H || !isFluid(voxAt(q))) break; }
    if (k >= 8) return 0.0;
    float dz = max(float(c.y + k) - (1.0 - fluidTop(0u, false)) - p.y, 0.0);
    vec3 Ls = uwLs();
    vec2 fp = p.xz + uWOff - Ls.xz / min(Ls.y, -0.2) * dz;
    return causAt(fp) * exp(-dz * 0.15);
  }
  // 水中光束（god rays）：沿视线 6 个抖动采样点，把焦散噪声沿折射阳光方向投到 y=0 平面 → 与太阳方向一致的光柱；前向散射加权
  // 图样沿折射阳光 Ls 方向不变（投到 y = 0 平面取噪声）→ 光柱方向 = 水中阳光方向；强度随太阳高度（水面入射越斜越弱），
  // 颜色 = 阳光色 × 水色（光柱在水里本来就带水色），前向散射按 uShaft1.x 收紧到太阳方向
  vec3 uwShafts(vec3 ro, vec3 r, float tMax, float skyK) {
    vec3 L = uwL();
    float dayF = smoothstep(-0.05, 0.12, L.y);
    if (uUw.w <= 0.0 || dayF <= 0.0 || skyK <= 0.0) return vec3(0.0);
    vec3 Ls = uwLs();
    vec2 sl = Ls.xz / min(Ls.y, -0.2);
    float tm = min(tMax, uShaft0.y), dt = tm / 6.0, t = dt * ign(gl_FragCoord.xy), a = 0.0;
    for (int i = 0; i < 6; i++) {
      vec3 p = ro + r * t;
      vec2 q = (p.xz + uWOff - sl * p.y) * uShaft0.x;
      float n1 = nB(q * 0.09 + uTime * vec2(0.012, 0.007)), n2 = nB(q * 0.13 - uTime * vec2(0.009, -0.011));
      a += pow(clamp(1.0 - abs(n1 - n2) * 2.2, 0.0, 1.0), uShaft0.w) * exp(-t * uShaft0.z);
      t += dt;
    }
    float ph = 0.3 + 1.7 * pow(max(dot(r, -Ls), 0.0), uShaft1.x);
    vec3 wc = uFogColor / max(max(uFogColor.r, uFogColor.g), max(uFogColor.b, 1e-3));
    return uwSunC() * mix(vec3(1.0), wc, 0.5) * (a / 6.0) * ph * uUw.w * 0.5 * dayF * (0.4 + 0.6 * L.y) * skyK * uExposure * min(tm / 8.0, 1.0);
  }
  // 反射：追踪命中 → 简化着色（体素光 + 朝阳面，无 AO/阴影）；未命中 → 天空渐变 + 云（低采样）
  bool reflHit(vec3 p, vec3 d, float tMax, float t0, out vec3 col) {
    float th; ivec3 hc, n; uint id; int kind; vec3 uvl; float tw_; ivec3 wn_;
    col = vec3(0.0);
    if (tMax > 0.0 && trace(p, d, tMax, REFL_STEPS, false, th, hc, n, id, kind, uvl, tw_, wn_) && kind != 4) {
      uvec4 inf = infoOf(id);
      vec2 uv; float layer, shade; ivec3 lc;
      if (kind == 0) { uv = faceUV(n, clamp(p + d * th - vec3(hc), 0.0, 1.0), inf, layer, shade); lc = hc + n; }
      else { uv = uvl.xy; layer = uvl.z; shade = 1.0; lc = hc; }
      lc.y = clamp(lc.y, 0, H - 1);
      uvec4 g = voxAt(lc);
      float sky = float(g.g >> 4u), dayF = smoothstep(-0.05, 0.12, uSunDir.y);
      float ndl = kind == 0 ? max(dot(vec3(n), uSunDir), 0.0) : 0.5 * max(uSunDir.y, 0.0);
      vec3 lv = max(uSkyTint * bright(max(sky - uSkyDarken, 0.0)) * (1.0 + uSun * ndl * dayF * clamp((sky - 7.0) / 8.0, 0.0, 1.0)),
                    vec3(1.0, 0.86, 0.66) * bright(float(g.g & 15u)));
      vec3 c = matSampleLod(uv, layer, lodAt(t0 + th)).rgb * lv * shade * uExposure;
      col = applyFog(c, t0 + th);
      return true;
    }
    return false;
  }
  #if WATER_STYLE == 2
  // Bliss 水反射（仅 WATER_STYLE 2 编译）
  vec3 reflScene(vec3 p, vec3 d, float tMax, float t0, float skyK) {
    vec3 hc_;
    if (reflHit(p, d, tMax, t0, hc_)) return hc_;
    vec3 s = skyDir(d) * mix(0.25, 1.0, skyK);
    float tc; vec4 cc;
    #if CLOUD_STYLE == 2
    if (skyK > 0.5 && cloudVol(p, d, 14, 1, 1e30, tc, cc)) s = mix(s, cc.rgb, cc.a);
    #else
    if (skyK > 0.5 && cloudHit(p, d, 1e30, tc, cc)) s = mix(s, cc.rgb, cc.a);
    #endif
    return s;
  }
  #endif

  void main() {
    #if CLOUD_PASS
    { // 低分辨率云 pass（§9.2-2）：同一份着色器源码，只追体积云。1 → 颜色 + alpha；2 → tc（与可见表面的比较留给主 pass）
      vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec3 r = normalize(mat3(uCamWorld) * normalize(vp.xyz / vp.w));
      r = mix(r, vec3(1e-6), vec3(lessThan(abs(r), vec3(1e-6))));
      float tc; vec4 cc; bool hc = cloudVol(uRo, r, 44, 3, 1e30, tc, cc);
      gl_FragColor = CLOUD_PASS == 1 ? (hc ? cc : vec4(0.0)) : vec4(hc ? tc : -1.0, 0.0, 0.0, 1.0);
    }
    #else
    vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 vd = normalize(vp.xyz / vp.w);
    float cosF = -vd.z;
    vec3 r = normalize(mat3(uCamWorld) * vd);
    r = mix(r, vec3(1e-6), vec3(lessThan(abs(r), vec3(1e-6))));
    float d = texture2D(tDepth, vUv).r;
    vec4 sc = texture2D(tScene, vUv);
    float sceneZ = d >= 1.0 ? 1e9 : 2.0 * uNear * uFar / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
    // 雾远端之外与天空无差 → 射线裁到雾距。场景深度裁剪：DDA 与 sceneRT 一一对应（scale = 1）直接用本像素深度；
    // 0.5 ≤ scale < 1（§4-5）：本 DDA 像素覆盖的场景纹素（每轴 ≤ 3 个）取最远深度 → 保守，只裁掉被实体整格挡住的部分
    float zClip = uClipScene > 0.5 ? sceneZ : 1e9;
    #if SCENE_CLIP
    if (uClipScene > 1.5) {
      vec2 c = vUv * uSceneSize, hf = 0.5 * uClipFoot;
      ivec2 a = max(ivec2(floor(c - hf)), ivec2(0)), b = min(ivec2(ceil(c + hf)) - 1, ivec2(uSceneSize) - 1);
      float dm = 0.0;
      for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) if (a.x + i <= b.x && a.y + j <= b.y) dm = max(dm, texelFetch(tDepth, a + ivec2(i, j), 0).r);
      zClip = dm >= 1.0 ? 1e9 : 2.0 * uNear * uFar / (uFar + uNear - (dm * 2.0 - 1.0) * (uFar - uNear));
    }
    #endif
    float zLim = min(zClip, uFogA1 >= 0.999 ? uFogFar : 1e9);
    float tHit; ivec3 hc, n; uint id; int kind; vec3 uvl; float tw; ivec3 wn;
    // ×1.03：给雾远端留一点余量，否则正好落在 far 面上的几何会被 tX 裁掉（边缘一圈漏空）
    bool hit = trace(uRo, r, zLim * 1.03 / cosF, uSteps, false, tHit, hc, n, id, kind, uvl, tw, wn);
    bool camW = uRo.y >= 0.0 && uRo.y < float(H) && isFluid(voxAt(ivec3(floor(uRo))));
    #if DBG >= 7
    // 探针（bench --probe）：7 = tHit / 8 = tw 的 float 位模式（RGBA 小端字节），9 = 命中格低 8 位 xyz + (kind | hit<<3 | 法线轴<<4)
    { uint u = DBG == 7 ? floatBitsToUint(hit ? tHit : -1.0) : floatBitsToUint(tw);
      gl_FragColor = DBG == 9 ? vec4(uvec4(uvec3(hc & 255), uint(kind) | (hit ? 8u : 0u) | uint(n.x != 0 ? 16 : n.y != 0 ? 32 : 48))) / 255.0
                              : vec4(uvec4(u, u >> 8, u >> 16, u >> 24) & 255u) / 255.0;
      gl_FragDepth = 0.0; return; }
    #endif
    bool water = !camW && tw >= 0.0 && (!hit || tw < tHit);
    bool uwSurf = camW && tw >= 0.0 && (!hit || tw < tHit);   // 水下仰视：水面 = 半透明贴图面（同 v1）
    // 水下仰视波纹 = 水面图样 + 对水上内容的折射扭曲，两者出自同一个波纹场（图样与扭曲同步移动，不再分层「打鼓」）
    //   经典：Shadertoy 7 向余弦（高光 → 图样，差分 → 扭曲）；水底式：与水底焦散同源的噪声（亮脊 → 图样，高度梯度 → 扭曲）
    //   uUw2.x 混合两者；uUw2.y 图样亮度。图样只叠在水面层上，不再调制水上内容的整体亮度
    //   去突兀：远处/掠射水面、屏幕边缘逐渐减弱
    float uwK = uUw.x * 0.28;                                  // 波纹强度（面板→着色器）
    vec3 rc = r; vec2 uwOff = vec2(0.0); float uwPat = 0.0;
    if (uwSurf && uwK > 0.0) {
      vec3 wp0 = uRo + r * tw; vec2 wq0 = wp0.xz + uWOff;
      vec2 se = min(vUv, 1.0 - vUv);
      float fade = exp(-tw * 0.035) * smoothstep(0.04, 0.3, abs(r.y)) * smoothstep(0.0, 0.06, min(se.x, se.y));
      float mN = uUw2.x, mS = 1.0 - mN;
      if (mS > 0.0) {
        vec3 uwR = uwRipple(wq0, uwK);
        uwOff += uwR.xy * 3.0 * uwK * mS;
        uwPat += clamp((uwR.z - 1.0) / max(uwK, 1e-3) * 0.25, 0.0, 1.0) * mS;
      }
      if (mN > 0.0 && wn.y != 0) {
        vec3 fl = uwField(wq0 * (uUw.y / 0.64));
        uwOff -= fl.xy * 0.045 * uUw.x * mN;
        uwPat += fl.z * mN;
      }
      uwOff *= fade; uwPat *= fade;
      rc = normalize(r + vec3(uwOff.x, 0.0, uwOff.y));
    }
    float camSky = 15.0;                                       // 相机所在水格的天空光（水下光效按它衰减：洞穴/深处无光束）
    if (camW) camSky = float(voxAt(ivec3(floor(uRo))).g >> 4u);
    // 云门控（§9.2-1 / §4-2）：云只在 tc < 可见表面距离时被合成（水下仰视 behind / 天空 / 地形前），而 tc ≥ 云层入口 →
    // 入口在可见表面之后就不追云。相机在水中且看不到水面：云不参与。上行射线预算耗尽（kind 4）仍要画云（见末尾）
    float tCl = 1e30;
    if (camW) tCl = uwSurf ? 1e30 : -1.0;
    else if ((hit || water) && !(hit && kind == 4 && r.y > 0.0)) tCl = water ? tw : tHit;
    #if CLOUD_LR
    // 低分辨率云：水下仰视的折射方向按屏幕偏移近似（同 skyB）；入口门控等价于 tc < tCl（tc ≥ 云层入口）
    vec2 uvC = uwSurf ? clamp(vUv + uwOff * (2.0 / 3.0), 0.0, 1.0) : vUv;
    vec4 cc = texture2D(tCloud, uvC); float tc = texture2D(tCloudT, uvC).r;
    bool cloud = tCl > 0.0 && tc >= 0.0 && cc.a > 0.01 && tc < tCl;
    #else
    float tc = -1.0; vec4 cc = vec4(0.0); bool cloud = tCl > 0.0 && cloudHit(uRo, rc, tCl, tc, cc);
    #endif
    if (!hit && !water && !uwSurf) {
      if (camW) {                                              // 水下且出不了水（深水/洞穴/水下平视）：水体雾色
        float zf = uFogFar;
        gl_FragColor = vec4(uFogColor + uwShafts(uRo, r, 24.0, camSky / 15.0), 1.0);
        gl_FragDepth = uFar * (zf - uNear) / (zf * (uFar - uNear));
        RET;
      }
      float dayN = 1.0 - smoothstep(-0.05, 0.12, uSunDir.y);
      if (d >= 1.0 && dayN > 0.0) {                            // 夜空：压暗 + 程序化星星（云遮星）
        vec3 skyc = sc.rgb * (1.0 - uStar1.w * dayN);
        float ca = cloud ? cc.a : 0.0;
        if (cloud) skyc = mix(skyc, cc.rgb, cc.a);
        if (uStarOn > 0.5) skyc += starAt(r) * dayN * (1.0 - ca * uStar1.y);
        float zc = min(tc * cosF, uFar * 0.999);
        gl_FragColor = vec4(skyc, 1.0);
        gl_FragDepth = cloud ? uFar * (zc - uNear) / (zc * (uFar - uNear)) : 0.99999;
        RET;
      }
      if (cloud && tc * cosF < sceneZ) {                         // 天空前的云
        float zc = min(tc * cosF, uFar * 0.999);
        gl_FragColor = vec4(mix(sc.rgb, cc.rgb, cc.a), 1.0); gl_FragDepth = uFar * (zc - uNear) / (zc * (uFar - uNear));
        RET;
      } else { gl_FragColor = vec4(sc.rgb, 0.0); gl_FragDepth = 1.0; }
      RET;
    }
    vec3 col = sc.rgb; float z = sceneZ;
    if (hit && kind == 4) {                                    // 预算耗尽：视作全雾远景
      z = tHit * cosF; col = uFogColor;
    } else if (hit) {
      // 寄存器压力（tools/shader-stats.mjs）：阴影射线是第二份内联 trace，先只算它要的（光照 / ndl / G / 树叶位）就发射，
      // 贴图坐标 / 图块 / AO 等阴影之后再算（纯重排，结果逐位不变）
      vec3 f = clamp(uRo + r * tHit - vec3(hc), 0.0, 1.0);
      vec3 L;
      if (kind == 0) {
        ivec3 t1, t2; vec2 fl;                                // 平滑光照用的面内轴与格内坐标
        if (n.x != 0)      { t1 = ivec3(0, 0, 1); t2 = ivec3(0, 1, 0); fl = f.zy; }
        else if (n.y != 0) { t1 = ivec3(1, 0, 0); t2 = ivec3(0, 0, 1); fl = f.xz; }
        else               { t1 = ivec3(1, 0, 0); t2 = ivec3(0, 1, 0); fl = f.xy; }
        #if DBG == 3
        { float o_, s_, b_; cellLO(hc + n, o_, s_, b_); L = vec3(s_, b_, 1.0); }   // 测着色占比：本格光照、无 AO
        #else
        L = smoothLight(hc + n, t1, t2, fl);
        #endif
      } else {                                                // 树叶卡片：命中点所在格光照；花草 / 火把：本格光照（同 v1）
        ivec3 lp = kind == 6 ? ivec3(floor(uRo + r * (tHit - 1e-3))) : hc; lp.y = clamp(lp.y, 0, H - 1);
        uvec4 g = voxAt(lp); L = vec3(float(g.g >> 4u), float(g.g & 15u), 1.0);
      }
      // 太阳：朝阳面 + 阴影射线。sky 光 <8（洞穴/室内）不发射；shadowSteps=0 且 sun=0 时与 v1 等价
      vec3 nW = kind == 0 ? vec3(n) : vec3(0.0, 1.0, 0.0);
      float dayF = smoothstep(-0.05, 0.12, uSunDir.y), G = dayF * clamp((L.x - 7.0) / 8.0, 0.0, 1.0);
      float ndl = kind == 0 ? max(dot(nW, uSunDir), 0.0) : 0.8 * max(uSunDir.y, 0.0);
      float sh = 1.0;
      if (uShadowSteps > 0 && ndl > 0.0 && G > 0.0) {
        float st; ivec3 sc_, sn_; uint si_; int sk_; vec3 su_; float stw_; ivec3 swn_;
        vec3 p0 = uRo + r * tHit + (kind == 0 ? nW * 2e-3 : uSunDir * 0.02);
        // 树叶受光面：树叶之间只做「实心」级统一处理（不做 alpha / 距离渐变）；精确档只用于投到地面等非树叶表面的整体拖影
        #if LEAF_SH == 0
        gLeafSolid = kind == 6 || (kind == 0 && (infoOf(id).r & 128u) != 0u);
        #endif
        if (kind == 6) gShHome = ivec3(floor(p0));
        gCrossRecv = kind == 2 && (id & 255u) == ${BT.tallGrassId != null ? BT.tallGrassId : 256}u;
        if (trace(p0, uSunDir, uShadowDist, uShadowSteps, true, st, sc_, sn_, si_, sk_, su_, stw_, swn_)) sh = 0.0;
      }
      uvec4 inf = infoOf(id);                                 // id = trace 的 hid（id | meta<<8）
      vec2 uv; float layer, shade, ao = 1.0;
      if (kind == 0) {
        uv = faceUV(n, (inf.r & 128u) != 0u ? swayF(hc, f) : f, inf, layer, shade);   // 树叶：贴图随摇动剪切
        // AO：old.htm 公式 mix(1-强度, 1, ao^曲线)；强度 0.58 / 曲线 1 ≈ v1 的 AO_CURVE
        ao = mix(1.0 - uAoStrength, 1.0, pow(clamp(L.z, 0.0, 1.0), uAoCurve));
      } else if (kind == 6) {                                 // 树叶卡片：逐簇明度抖动
        uv = uvl.xy; layer = uvl.z;
        shade = 235.0 / 255.0 * mix(0.85, 1.1, float((lhash(hc) >> 11) & 255u) / 255.0);
      } else { uv = uvl.xy; layer = uvl.z; shade = kind == 2 ? 235.0 / 255.0 : 1.0; }
      float occl = uShadowSteps > 0 ? 1.0 - sh * smoothstep(0.0, 0.25, ndl) : 0.0;
      float sunK = 1.0 + uSun * ndl * sh * G - uShadowStrength * 0.5 * occl * G;
      vec3 lv = max(uSkyTint * bright(max(L.x - uSkyDarken, 0.0)) * sunK, vec3(1.0, 0.86, 0.66) * bright(L.y));
      col = matSampleLod(uv, layer, lodAt(tHit)).rgb * lv * shade * ao * uExposure;
      if (camW) {                                              // 相机在水中：水下表面焦散
        ivec3 wc_ = kind == 0 ? hc + n : hc;
        col *= 1.0 + uwCaustic(uRo + r * tHit, wc_) * 1.4 * dayF * clamp((L.x - 7.0) / 8.0, 0.0, 1.0);
      }
      z = tHit * cosF;
      // 岸壁水线（纵向的岸边波纹）：紧邻水面格的侧面上，水线随涌浪升降（shoreH 在 d = 0 处），水线以下盖半透明水色，上方留湿痕变暗
      if (!camW && !water && kind == 0 && n.y == 0 && uWater0.w > 0.0 && uShore.x > 0.0 && tHit < 96.0) {
        ivec3 wc = hc + n;
        if (wc.y >= 0 && wc.y < H - 1 && isFluid(voxAt(wc)) && !isFluid(voxAt(wc + ivec3(0, 1, 0)))) {
          vec3 p = uRo + r * tHit;
          float dy = p.y - (float(wc.y) + fluidTop(0u, false)), top = uShore.x * 1.6;
          if (dy > -0.02 && dy < top) {
            float hh = shoreH(p.xz + uWOff, 0.0) * uShore.x;
            float aw = 0.02 + tHit * 0.002;                      // 水线抗锯齿
            float band = 1.0 - smoothstep(hh - aw, hh + aw, dy);
            uvec4 g = voxAt(wc);
            vec3 wl = voxLight(float(g.g >> 4u), float(g.g & 15u)) * uExposure;
            col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, top, dy));                 // 湿痕
            vec3 wv = mix(col * vec3(0.55, 0.8, 0.85), vec3(0.12, 0.38, 0.55) * wl, 0.45);
            wv += wl * 0.35 * (1.0 - smoothstep(0.0, aw * 3.0, abs(dy - hh)));   // 水线处的细亮边（水面弯月面反光）
            col = mix(col, wv, band * 0.85);
          }
        }
      }
    }
    if (water) {                                              // 水面（old.htm：波纹法线 + 菲涅尔 + 透射 + 高光 + 岸边波纹）
      vec3 wp = uRo + r * tw, wq = wp + vec3(uWOff.x, 0.0, uWOff.y);
      float depth = hit ? tHit - tw : 60.0;
      float vd = depth * max(-r.y, 0.15);                      // 竖直水深近似 → 岸边泡沫 / 软化
      vec3 wN = vec3(wn);
      // 岸边波纹：到岸距离 + 离岸方向 → 涌浪起伏 sh0 与其沿离岸方向的斜率 sg（法线倾斜）
      float sd = 9.0, sh0 = 0.0, sg = 0.0; vec2 sdir = vec2(0.0);
      if (hit && wn.y > 0 && tw < 96.0 && uWater0.w > 0.0 && uShore.x > 0.0) {
        sd = shoreDist(wp, min(uWater0.w, 2.0), sdir);
        sh0 = shoreH(wq.xz, sd);
        sg = (shoreH(wq.xz, sd + 0.05) - shoreH(wq.xz, max(sd - 0.05, 0.0))) / 0.1;
      }
      // 噪声法线：两层不同尺度/流向的可平铺噪声叠加（打破纯正弦的机械感）
      vec2 nq = wq.xz * (0.06 * uWave1.y), nq2 = wq.xz * (0.15 * uWave1.y);
      #if WATER_STYLE == 1
      vec2 ns = vec2(0.0);                                     // Reimagined：法线来自贴图（见下）
      #else
      TEXC(2);
      vec2 ns = (texture2D(uWaterNoise, nq + uTime * vec2(0.013, 0.007)).rg * 2.0 - 1.0)
              + (texture2D(uWaterNoise, nq2 - uTime * vec2(0.009, -0.012)).rg * 2.0 - 1.0) * 0.6;
      #endif
      ivec3 ac0 = ivec3(floor(wp + vec3(wn) * 0.01));          // 水面外侧那格的光照（夜晚/洞穴变暗）
      float sky = 15.0, blk = 0.0;
      if (ac0.y >= 0 && ac0.y < H) { uvec4 g = voxAt(ac0); sky = float(g.g >> 4u); blk = float(g.g & 15u); }
      vec3 lit = voxLight(sky, blk) * uExposure;
      float dayF = smoothstep(-0.05, 0.12, uSunDir.y), skyK = sky / 15.0;
      vec3 shallow = vec3(0.45, 0.85, 0.80), deep = mix(vec3(0.05, 0.30, 0.60), vec3(0.04, 0.22, 0.55), uWater2.z);
      vec3 wcol; float a;
      #if WATER_STYLE == 2
      if (wn.y > 0) {                                          // 尖峰波高度场 → 差分法线（远处降八度 + 压平，抗闪烁）
        int oct = tw < 40.0 ? 4 : 3;
        float eps = 0.03 + tw * 0.002;
        float h0 = seaH(wq.xz, oct), hx = seaH(wq.xz + vec2(eps, 0.0), oct), hz = seaH(wq.xz + vec2(0.0, eps), oct);
        float A = uWater0.z * 1.6 * (1.0 - smoothstep(32.0, 120.0, tw));
        wN = normalize(vec3(-(hx - h0) / eps * A - ns.x * uWave1.x * 2.0, 1.0, -(hz - h0) / eps * A - ns.y * uWave1.x * 2.0));
      }
      wN = normalize(wN - vec3(sdir.x, 0.0, sdir.y) * sg * uShore.x * 1.5);
      float cv = max(dot(-r, wN), 0.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
      vec3 rr = reflect(r, wN);
      if (wn.y > 0 && rr.y < 0.03) rr = normalize(vec3(rr.x, 0.03, rr.z));
      vec3 refl = reflScene(wp + vec3(wn) * 0.03, rr, tw < 96.0 ? 64.0 : 0.0, tw, skyK);
      // 透射：按波长吸收（红最快）+ 水体内散射；水底焦散（两层反向漂移噪声的差 → 亮脊）
      vec3 ext = vec3(0.45, 0.085, 0.055) * mix(3.0, 0.35, clamp(uWater0.x, 0.0, 1.0));
      vec3 Tr = exp(-ext * depth);
      vec3 flo = col;
      if (hit) {
        vec2 fp = (uRo + r * tHit).xz + uWOff;
        float c1 = nB(fp * 0.31 + uTime * vec2(0.031, 0.017)), c2 = nB(fp * 0.43 - uTime * vec2(0.022, -0.027));
        float caus = pow(clamp(1.0 - abs(c1 - c2) * 3.0, 0.0, 1.0), 6.0);
        flo *= 1.0 + caus * 1.4 * dayF * skyK * exp(-depth * 0.12);
      }
      vec3 seen = flo * Tr + deep * lit * 0.55 * (1.0 - Tr);
      seen += vec3(0.08, 0.45, 0.38) * lit * pow(clamp(dot(r, uSunDir) * 0.5 + 0.5, 0.0, 1.0), 4.0) * (1.0 - wN.y) * 6.0 * dayF;   // 浪尖透光
      vec3 sunC = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.95, 0.85), smoothstep(0.02, 0.35, uSunDir.y));
      float spec = pow(max(dot(rr, uSunDir), 0.0), uWater2.x) * uWater2.x * 0.03 * dayF * skyK;
      if (spec > 0.01 && uShadowSteps > 0) {                   // 高光阴影：树/山挡住的水面没有太阳倒影
        float st; ivec3 sc_, sn_; uint si_; int sk_; vec3 su_; float stw_; ivec3 swn_;
        #if LEAF_SH == 0
        gLeafSolid = false;                                    // 水面高光：非树叶受光面
        #endif
        gCrossRecv = false;
        if (trace(wp + vec3(0.0, 0.05, 0.0), uSunDir, max(uShadowDist, 16.0), uShadowSteps, true, st, sc_, sn_, si_, sk_, su_, stw_, swn_)) spec = 0.0;
      }
      wcol = mix(seen, refl, clamp(fres * (0.4 + uWater0.y), 0.0, 1.0)) + sunC * min(spec, 8.0);
      a = 1.0;
      #else
      #if WATER_STYLE == 1
      // Reimagined（SurvivalCraft 式）：不是噪声法线，而是贴图本身在动 —— 贴图坐标做连续的双向正弦摆动（同树叶摇动的剪切思路），
      // 法线取摆动后贴图明度的逐 texel 梯度 → 波纹跟着贴图图案走；菲涅尔 / 反射（面板「透亮/反射」）/ 高光都吃这个法线
      vec2 tuv = wq.xz + uTime * vec2(0.02, 0.01)
               + uWTex.x * vec2(sin(uTime * uWTex.y + (wq.x + wq.z) * 0.9), cos(uTime * uWTex.y * 0.83 + (wq.x - wq.z) * 1.1));
      float tl = lodAt(tw);
      vec3 tex = matSampleLod(fract(tuv), FLUID_TILE, tl).rgb;
      if (wn.y > 0) {
        const float E = 1.0 / 16.0;
        float l0 = dot(tex, vec3(0.333));
        float lx = dot(matSampleLod(fract(tuv + vec2(E, 0.0)), FLUID_TILE, tl).rgb, vec3(0.333));
        float lz = dot(matSampleLod(fract(tuv + vec2(0.0, E)), FLUID_TILE, tl).rgb, vec3(0.333));
        float k = uWTex.z * 8.0 * (1.0 - smoothstep(24.0, 96.0, tw));   // 远处压平（抗闪烁）
        wN = normalize(vec3(-(lx - l0) * k, 1.0, -(lz - l0) * k));
      }
      #else
      if (wn.y > 0) {
        float w1 = sin(wq.x * 0.9 + uTime * 1.2) + 0.5 * sin(wq.z * 1.7 - uTime * 0.8 + wq.x * 0.4);
        float w2 = sin(wq.z * 0.8 - uTime * 1.0) + 0.5 * sin((wq.x + wq.z) * 1.3 + uTime * 1.5);
        wN = normalize(vec3(-(w1 * uWater0.z + ns.x * uWave1.x * 4.0), 1.0, -(w2 * uWater0.z + ns.y * uWave1.x * 4.0)));
      }
      #endif
      wN = normalize(wN - vec3(sdir.x, 0.0, sdir.y) * sg * uShore.x * 1.5);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-r, wN), 0.0), 5.0);
      #if WATER_STYLE != 1
      vec3 tex = matSampleLod(fract(wq.xz), FLUID_TILE, lodAt(tw)).rgb;
      #endif
      float trans = exp(-depth * mix(1.5, 0.06, clamp(uWater0.x, 0.0, 1.0)));
      vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.10)) * (0.7 + 0.6 * dot(tex, vec3(0.333))) * lit;
      vec3 seen = mix(body, col * mix(vec3(1.0), shallow * 1.15, 0.5), trans);
      float caus = 0.5 + 0.5 * sin(wq.x * 2.3 + uTime * 0.7 + ns.x * 2.5) * sin(wq.z * 2.1 - uTime * 0.6 + ns.y * 2.5);
      seen += caus * caus * 0.10 * trans * lit;
      vec3 skyC = mix(mix(uFogColor, uSkyTop, uWater2.y), vec3(1.0), 0.35 * dayF) * mix(0.3, 1.0, skyK);   // 反射：雾色 → 天顶色
      float spec = pow(max(dot(wN, normalize(-r + uSunDir)), 0.0), uWater2.x) * dayF * skyK;
      wcol = mix(seen, skyC, fres * uWater0.y) + spec * 0.6;
      a = clamp(mix(uWater1.x, uWater1.y, smoothstep(uWater1.z, uWater1.w, depth)) + fres * uWater0.y * 0.5, 0.0, 1.0);
      #endif
      if (hit && wn.y > 0) {
        wcol += lit * sh0 * 0.12 * (1.0 - smoothstep(0.0, 1.0, sd));           // 浪峰略亮（水体增厚），不再画白色泡沫
        if (uShoreFade > 0.0) a *= smoothstep(0.0, uShoreFade, vd + sh0 * uShore.x * 2.0);   // 岸边软化：边缘随涌浪进退
      }
      col = mix(col, wcol, a);
      z = tw * cosF;
    }
    if (uwSurf) {                                             // 水下仰视：水面 = 半透明水贴图（同 v1 waterMat），再按水中路径加水下雾
      vec3 behind = hit ? col : (cloud ? mix(sc.rgb, cc.rgb, cc.a) : sc.rgb);
      if (uwK > 0.0) {                                      // 波纹：沿折射方向重新追踪水上（简化着色），未命中 → 偏移采样天空
        vec3 p0 = uRo + r * tw + rc * 0.03, hb;
        vec3 skyB = texture2D(tScene, clamp(vUv + uwOff * (2.0 / 3.0), 0.0, 1.0)).rgb;   // 屏幕偏移 = 折射偏移 × 2/3（同原版比例）
        behind = reflHit(p0, rc, 96.0, tw, hb) ? hb : (cloud ? mix(skyB, cc.rgb, cc.a) : skyB);
      }
      {                                                       // 斯涅尔窗里的太阳：沿折射阳光反方向的光斑
        vec3 Ls = uwLs();
        float gl = pow(max(dot(r, -Ls), 0.0), 180.0) * 3.0 + pow(max(dot(r, -Ls), 0.0), 12.0) * 0.25;
        behind += uwSunC() * gl * smoothstep(-0.05, 0.12, uwL().y) * (camSky / 15.0) * uExposure;
      }
      vec3 wp = uRo + r * tw, wq = wp + vec3(uWOff.x, 0.0, uWOff.y);
      ivec3 ac = ivec3(floor(wp + r * 0.01)); ac.y = clamp(ac.y, 0, H - 1);   // 出水点外侧那格的光照（同 v1 水面顶点光）
      uvec4 g = voxAt(ac);
      vec2 suv = (wn.y != 0 ? wq.xz : wn.x != 0 ? wq.zy : wq.xy) + vec2(1.0, 0.5) * uTime / 12.0 + uwOff * 4.0;   // 水面贴图随波纹场轻微扭动
      vec4 st = matSampleLod(fract(suv), FLUID_TILE, lodAt(tw));
      float shd = wn.y != 0 ? 1.0 : wn.x != 0 ? 0.6 : 0.8;
      vec3 surf = st.rgb * voxLight(float(g.g >> 4u), float(g.g & 15u)) * shd * uExposure;
      vec3 o = mix(behind, surf, clamp(st.a * uUwAlpha / 0.667, 0.0, 1.0));
      o += voxLight(float(g.g >> 4u), float(g.g & 15u)) * uExposure * uwPat * uUw2.y * 0.6;   // 水面波纹图样（同水底焦散的亮网）
      o = uwAbsorb(o, tw);                                    // 水体本身的颜色（替代旧的屏幕滤镜色）
      o = mix(o, uFogColor, smoothstep(uFogNear, uFogFar, tw) * uFogA1);
      o += uwShafts(uRo, r, tw, camSky / 15.0);
      float zw = max(tw * cosF, uNear * 1.01);
      gl_FragColor = vec4(o, 1.0);
      gl_FragDepth = uFar * (zw - uNear) / (zw * (uFar - uNear));
      RET;
    }
    if (camW && hit && kind != 4) col = uwAbsorb(col, tHit);
    col = mix(col, applyFog(col, z), uFogA1);
    if (camW && hit) col += uwShafts(uRo, r, tHit, camSky / 15.0);
    if (cloud && !camW && tc * cosF < z) { col = mix(col, cc.rgb, cc.a); z = tc * cosF; }   // 地形在云后（高处俯视）
    else if (cloud && !camW && kind == 4 && r.y > 0.0) col = mix(col, cc.rgb, cc.a);       // 上行射线预算耗尽（=远景雾）：云仍画在其上，否则地平线上方出现无云带
    gl_FragColor = vec4(col, 1.0);
    gl_FragDepth = uFar * (z - uNear) / (z * (uFar - uNear));
    RET;
    #endif
  }`;
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
  uni = {
    ...U, uVox: { value: ring.vox }, uBrick: { value: ring.brick }, uCol: { value: ring.col }, uInfo: { value: infoTex },
    tScene: { value: null }, tDepth: { value: null }, uSX: { value: 0 }, uN: { value: 0 }, uSteps: { value: 128 },
    uOrgSlot: { value: [0, 0] }, uOrgLow: { value: [0, 0] }, uLo: { value: new THREE.Vector3() }, uHi: { value: new THREE.Vector3() },
    uRo: { value: new THREE.Vector3() }, uWorldMaxY: { value: 0 }, uNear: { value: 0.05 }, uFar: { value: 1200 },
    uTexelAngle: { value: 0.001 }, uFogA1: { value: 1 }, uClipScene: { value: 1 },
    uAoStrength: { value: 0.6 }, uAoCurve: { value: 1 }, uExposure: { value: 1 }, uTime: { value: 0 },
    uWater0: { value: new THREE.Vector4() }, uWater1: { value: new THREE.Vector4() }, uWOff: { value: new THREE.Vector2() },
    uWaterNoise: { value: waterNoiseTex }, uWave1: { value: new THREE.Vector2(0.05, 1) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunVis: { value: new THREE.Vector3(0, 1, 0) }, uShadowSteps: { value: 0 }, uShadowStrength: { value: 0 },
    uShadowDist: { value: 24 }, uSun: { value: 0 },
    uFluidTop0: { value: -0.125 }, uShaft0: { value: new THREE.Vector4() }, uShaft1: { value: new THREE.Vector3() }, uWTex: { value: new THREE.Vector3() }, uSceneSize: { value: new THREE.Vector2() }, uClipFoot: { value: new THREE.Vector2(1, 1) }, tCloud: { value: null }, tCloudT: { value: null },
    uCloudTex: { value: ENV.cloud ? ENV.cloud.tex : null }, uCloudColor: { value: new THREE.Color(1, 1, 1) },
    uLeaf0: { value: new THREE.Vector4() }, uLeaf1: { value: new THREE.Vector4() }, uSway: { value: new THREE.Vector3() },
    uStar0: { value: new THREE.Vector4() }, uStar1: { value: new THREE.Vector4() }, uStarOn: { value: 1 }, uCloudAlpha: { value: 0.85 },
    uUwAlpha: { value: 0.67 }, uUw2: { value: new THREE.Vector2(0.4, 0.6) }, uUw: { value: new THREE.Vector4(0.5, 1, 0.3, 0) }, uShoreFade: { value: 0.3 }, uShore: { value: new THREE.Vector2(0.12, 1) }, uRoLag: { value: new THREE.Vector3() }, uSkyHor: { value: new THREE.Color(0.7, 0.8, 1) }, uCloudNoise: { value: null }, uWater2: { value: new THREE.Vector3(20, 0, 0) }, uSkyTop: { value: new THREE.Color(0.4, 0.6, 1) },
    uCloud: { value: new THREE.Vector4(0, 0, H + 36, 4) }, uCloud2: { value: new THREE.Vector3(0.3, 0.35, 0.35) }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
  };
  post = new THREE.ShaderMaterial({
    uniforms: uni, fragmentShader: DDA_FS, defines: { DBG: 0, DBGRAW: 0, REF_MODE: 0, SECT: 0, DF: 0, SCENE_CLIP: 0, CLOUD_LR: 0, CLOUD_PASS: 0, META: BT.state ? 1 : 0, LEAF_CARDS: 0, CLOUD_STYLE: 0, WATER_STYLE: 0, LEAF_SH: 0, LEAF_SH_LOD: 0, LEAF_LOD: 0 },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,   // depthTest:false 会连深度写入一起关掉
  });
  for (const pass of [1, 2]) cloudMats.push(new THREE.ShaderMaterial({ uniforms: uni, fragmentShader: DDA_FS, vertexShader: post.vertexShader,
    defines: { ...post.defines, CLOUD_PASS: pass }, depthTest: false, depthWrite: false }));
  syncDefines();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); quad.frustumCulled = false;
  const cloudQuad = new THREE.Mesh(quad.geometry, cloudMats[0]); cloudQuad.frustumCulled = false;
  const cloudScene = new THREE.Scene(); cloudScene.add(cloudQuad);
  let cloudRT = null, cloudTRT = null;
  function renderClouds() {                              // ¼×¼ DDA 分辨率：颜色（双线性）+ tc（最近点）
    const w = Math.max(1, Math.ceil(ddaRT.width / 4)), h = Math.max(1, Math.ceil(ddaRT.height / 4));
    if (!cloudRT || cloudRT.width !== w || cloudRT.height !== h) {
      if (cloudRT) { cloudRT.dispose(); cloudTRT.dispose(); }
      cloudRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      cloudTRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      uni.tCloud.value = cloudRT.texture; uni.tCloudT.value = cloudTRT.texture;
    }
    for (const [m, rt] of [[cloudMats[0], cloudRT], [cloudMats[1], cloudTRT]]) {
      cloudQuad.material = m; renderer.setRenderTarget(rt); renderer.render(cloudScene, postCam);
    }
  }
  const postScene = new THREE.Scene(); postScene.add(quad);
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ③ 合成：DDA 结果（ddaRT，分辨率 = 绘制缓冲 × scale）与 sceneRT 逐像素比深度，写屏幕颜色 + gl_FragDepth
  const comp = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tDepth: { value: null }, tDda: { value: null }, tDdaDepth: { value: null } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`precision highp float;
      uniform sampler2D tScene, tDepth, tDda, tDdaDepth; varying vec2 vUv;
      void main() {
        float ds = texture2D(tDepth, vUv).r, dv = texture2D(tDdaDepth, vUv).r;
        if (dv < ds) { gl_FragColor = vec4(texture2D(tDda, vUv).rgb, 1.0); gl_FragDepth = dv; }
        else { gl_FragColor = texture2D(tScene, vUv); gl_FragDepth = ds; }
      }`,
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
  });
  const compQuad = new THREE.Mesh(quad.geometry, comp); compQuad.frustumCulled = false;
  const compScene = new THREE.Scene(); compScene.add(compQuad);

  let sceneRT = null, ddaRT = null;
  const dbSize = new THREE.Vector2();
  function makeRT(w, h, filter) {
    const dt = new THREE.DepthTexture(w, h); dt.type = THREE.UnsignedIntType;
    return new THREE.WebGLRenderTarget(w, h, { minFilter: filter, magFilter: filter, depthBuffer: true, depthTexture: dt });
  }
  function freeRT(rt) { if (rt) { rt.depthTexture.dispose(); rt.dispose(); } }
  function ensureRT() {
    renderer.getDrawingBufferSize(dbSize);
    const w = Math.max(1, dbSize.x | 0), h = Math.max(1, dbSize.y | 0);
    if (!sceneRT || sceneRT.width !== w || sceneRT.height !== h) {
      freeRT(sceneRT); sceneRT = makeRT(w, h, THREE.NearestFilter);
      uni.tScene.value = comp.uniforms.tScene.value = sceneRT.texture;
      uni.tDepth.value = comp.uniforms.tDepth.value = sceneRT.depthTexture;
    }
    // 大窗口：按像素上限自动降 DDA 内部分辨率（用户滑的 scale 只是上限，不被覆写）
    let s = clamp(P.scale, 0.1, 2);
    const maxPx = Math.max(0.05, P.maxMP) * 1e6, capS = Math.sqrt(maxPx / (w * h));
    if (capS < s) s = capS;
    ddaScale = s;
    const lw = Math.max(1, Math.round(w * s)), lh = Math.max(1, Math.round(h * s));
    if (!ddaRT || ddaRT.width !== lw || ddaRT.height !== lh) {
      freeRT(ddaRT); ddaRT = makeRT(lw, lh, lw === w && lh === h ? THREE.NearestFilter : THREE.LinearFilter);
      comp.uniforms.tDda.value = ddaRT.texture; comp.uniforms.tDdaDepth.value = ddaRT.depthTexture;
    }
  }

  let ddaMs = 0, ddaScale = 0.65;
  let lagW = null, lagT = 0; const lagPrev = new THREE.Vector3();

  // ── GPU 分 pass 计时（EXT_disjoint_timer_query_webgl2；不可用则静默跳过）──
  // scene / dda / comp 三个顺序查询为一组；同一时刻只挂一组在途，结果可用后取回
  const glc = renderer.getContext();
  const qExt = glc && glc.getExtension ? glc.getExtension('EXT_disjoint_timer_query_webgl2') : null;
  const PASSES = ['scene', 'cloud', 'dda', 'comp'];      // cloud = CLOUD_LR 低分辨率云 pass（不开时为空区间）
  const qPool = []; let qSet = null, qCur = null, qIdx = -1;
  const gpu = { scene: 0, cloud: 0, dda: 0, comp: 0, total: 0 };      // EMA（显示用）
  const gpuLast = { scene: 0, cloud: 0, dda: 0, comp: 0, total: 0, frame: 0 };   // 最近一组原始值（bench 用）
  let gpuFrames = 0;
  function gpuPass(i) {                                      // 结束上一个 pass 的查询，开始第 i 个
    if (!qExt) return;
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
    gpuLast.total = tot; gpuLast.frame = ++gpuFrames; gpu.total = gpu.scene + gpu.cloud + gpu.dda + gpu.comp;
  }

  // ── 调试视图：切 DBG 宏（重新编译 post 着色器；DBG=0 时与生产着色器完全相同） ──
  function setRef(on) {                                  // 见 D.ref
    D.ref = on ? 1 : 0;
    if (post.defines.REF_MODE !== D.ref) { post.defines.REF_MODE = D.ref; post.needsUpdate = true; }
  }
  function setDebug(view = 0, raw = 0) {
    D.view = view | 0; D.raw = raw ? 1 : 0;
    if (post.defines.DBG !== D.view || post.defines.DBGRAW !== D.raw) {
      post.defines.DBG = D.view; post.defines.DBGRAW = D.raw; post.needsUpdate = true;
    }
    if (paneUI) paneUI.refresh();
  }

  function render() {
    const t0 = performance.now();
    gpuPoll();
    qCur = qExt && !qSet ? [] : null;
    ensureRT();
    gpuPass(0);
    // ① 整个 scene（天空、实体、粒子、选择框…）→ sceneRT
    const prev = renderer.getRenderTarget();
    if (ENV.hide && !D.hostStars) ENV.hide('stars', true);       // 星星改由 DDA 天空分支程序化绘制
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
    // ② DDA：局部坐标（玩家区块原点）避免远处 float 精度问题
    const pcx = Math.floor(camera.position.x / CS), pcz = Math.floor(camera.position.z / CS), h = ring.rd + 2;
    uni.uRo.value.set(camera.position.x - pcx * CS, camera.position.y, camera.position.z - pcz * CS);
    {   // 滞后相机（世界坐标指数平滑，τ = leafLodMs）：树叶精度切换渐变；传送/单帧大跳 → 直接对齐
      const now = performance.now(), cp = camera.position, dtMs = lagT ? Math.min(now - lagT, 250) : 0;
      if (!lagW || P.leafLodMs <= 0 || lagPrev.distanceToSquared(cp) > 256) lagW = cp.clone();
      else lagW.lerp(cp, 1 - Math.exp(-dtMs / P.leafLodMs));
      lagT = now; lagPrev.copy(cp);
      uni.uRoLag.value.set(lagW.x - pcx * CS, lagW.y, lagW.z - pcz * CS);
    }
    uni.uLo.value.set(-h * CS, 0, -h * CS); uni.uHi.value.set((h + 1) * CS, H, (h + 1) * CS);
    uni.uOrgSlot.value = [wrap(pcx, ring.N), wrap(pcz, ring.N)]; uni.uOrgLow.value = [wrap(pcx, 256), wrap(pcz, 256)];
    uni.uSX.value = ring.SX; uni.uN.value = ring.N; uni.uWorldMaxY.value = ring.worldMaxY;
    uni.uSteps.value = D.ref ? 576 : Math.round(P.steps); uni.uFogA1.value = P.fogA1;
    uni.uAoStrength.value = P.aoStrength; uni.uAoCurve.value = P.aoCurve; uni.uExposure.value = P.exposure;
    uni.uTime.value = D.time != null ? D.time : ENV.time; uni.uWOff.value.set(pcx * CS, pcz * CS);
    uni.uWater0.value.set(P.waterClarity, P.reflStrength, P.waveStrength, P.foamWidth);
    uni.uShore.value.set(P.shoreWaveAmp, P.shoreWaveSpeed);
    uni.uWater1.value.set(P.waterA1, P.waterA2, Math.min(P.waterD1, P.waterD2 - 0.01), P.waterD2);
    uni.uWave1.value.set(P.waveNoise, P.waveScale);
    const sd = ENV.sunDir;            // 宿主太阳方向 + 面板方位/仰角偏移
    const az = Math.atan2(sd.x, sd.z) + P.sunAz, el = clamp(Math.asin(clamp(sd.y, -1, 1)) + P.sunEl, -1.5, 1.5);
    uni.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    uni.uSunVis.value.copy(ENV.sunVis).normalize();
    uni.uShadowSteps.value = D.ref && P.shadowSteps > 0 ? 576 : Math.round(P.shadowSteps); uni.uShadowStrength.value = P.shadowStrength;
    uni.uShadowDist.value = P.shadowDist; uni.uSun.value = P.sun;
    uni.uLeaf0.value.set(P.leafLodDist >= 160 ? 1e30 : P.leafLodDist, P.leafShadowDist >= 64 ? 1e30 : P.leafShadowDist, P.leafShadow, P.leafHaloDist);
    uni.uLeaf1.value.set(P.leafOverhang, clamp(1.5 - P.leafDensity, 0.03, 1), P.leafCardLayers, P.leafSeed);
    uni.uSway.value.set(P.swayAmp, P.swayFreq, P.swayDist);
    uni.uStar0.value.set(P.starDensity, P.starProb, P.starGamma, P.starTwinkle);
    uni.uStar1.value.set(P.starMinElev, P.cloudStarBlock, P.cloudNightAlpha, P.skyDarkenNight);
    uni.uStarOn.value = D.hostStars ? 0 : 1; uni.uCloudAlpha.value = P.cloudAlpha;
    uni.uUwAlpha.value = P.uwSurfaceAlpha; uni.uUw.value.set(P.uwRipple, P.uwRippleFreq, P.uwTintMix, P.uwShafts); uni.uUw2.value.set(P.uwRippleMix, P.uwPattern);
    uni.uShaft0.value.set(P.uwShaftScale, P.uwShaftLen, P.uwShaftFall, P.uwShaftSharp); uni.uShaft1.value.set(P.uwShaftPhase, P.uwShaftVis, P.uwShaftRefr);
    uni.uWTex.value.set(P.waterTexWave, P.waterTexSpeed, P.waterTexNormal);
    uni.uShoreFade.value = P.shoreFade; uni.uWater2.value.set(P.waterSpec, P.waterSkyZen, P.waterDeepSat);
    uni.uSkyTop.value.copy(ENV.skyTop); uni.uSkyHor.value.copy(ENV.skyHor);
    const cl = ENV.cloud;
    if (cl) {
      uni.uCloudTex.value = cl.tex; uni.uCloudColor.value.copy(cl.color);
      uni.uCloud.value.set(D.cloudX != null ? D.cloudX : cl.offset.x, cl.offset.y, cl.y, P.cloudThick);
      uni.uCloud2.value.set(P.cloudDensity, P.cloudShade, P.cloudLight);
      if (ENV.hide) ENV.hide('clouds', true);   // 平面云由 DDA 体积云代替
    }
    uni.uNear.value = camera.near; uni.uFar.value = camera.far;
    uni.uInvProj.value.copy(camera.projectionMatrixInverse); uni.uCamWorld.value.copy(camera.matrixWorld);
    uni.uTexelAngle.value = 2 * Math.tan(camera.fov * Math.PI / 360) / ddaRT.height;
    {   // 场景深度裁剪：1 = 一一对应；2 = 0.5 ≤ scale < 1 时按覆盖纹素取最远深度（§4-5）；0 = 更低分辨率不裁（每轴 > 3 纹素）
      const fx = sceneRT.width / ddaRT.width, fy = sceneRT.height / ddaRT.height;
      uni.uClipScene.value = fx === 1 && fy === 1 ? 1 : P.sceneClip && fx <= 2 && fy <= 2 ? 2 : 0;
      uni.uSceneSize.value.set(sceneRT.width, sceneRT.height); uni.uClipFoot.value.set(fx, fy);
    }
    gpuPass(1);
    if (post.defines.CLOUD_LR) renderClouds();
    gpuPass(2);
    renderer.setRenderTarget(ddaRT); renderer.clear(); renderer.render(postScene, postCam);
    renderer.setRenderTarget(prev);
    gpuPass(3);
    renderer.render(compScene, postCam);
    gpuPass(-1);
    if (qCur) { qSet = qCur; qCur = null; }
    ddaMs = ddaMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  return {
    name: 'v2', P, P_DEFAULTS, panelSpec: PANEL, toN, fromN, paneReady, togglePanel, panelVisible,
    get pane() { return pane; }, refreshPane: () => paneUI && paneUI.refresh(),
    resetLag: () => { lagW = null; },   // bench：机位切换后滞后相机直接对齐（否则树叶 LOD 渐变取决于帧时序）
    ring, reuploadAll, onChunkEvent, onBlockChanged, flushEdits, post, comp, D,
    df: { T: DF_T, pending: dfPending, cls: (id, m = 0) => VCLS[((m & 15) << 8) | id], transform: dfTransform }, setDebug, setRef, apply, presets: { cloud: CLOUD_PRESETS, water: WATER_PRESETS },   // apply(key,fx)：bench --set 覆盖参数后走同一条副作用路由（def/leaf 宏重编译）
    get perf() { return { gpu: { ...gpu }, gpuLast: { ...gpuLast }, hasTimer: !!qExt, cpuMs: ddaMs, scale: ddaScale,
                          ddaW: ddaRT ? ddaRT.width : 0, ddaH: ddaRT ? ddaRT.height : 0 }; }, get sceneRT() { return sceneRT; }, get ddaRT() { return ddaRT; },
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
