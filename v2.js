// v2.js — DDA 渲染器（移植自 old.htm 的后处理 DDA + Tweakpane 面板）
// 接口与 v1.js 相同：createRenderer(ctx) → { name, buildChunk, disposeChunk, update, render, stats }
// 进度：参数 P + 面板 DSL + Tweakpane；环形 3D 体素纹理 + 砖占用 + 列高；两级 DDA（不透明/镂空/花草/火把/水面）
//       ddaRT（绘制缓冲 × scale）与 sceneRT 深度合成；v1 同款四角平滑光照 + AO；太阳阴影射线

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
                                                  picker: 'inline', expanded: true });
        const relabel = () => { b.label = `${label} ${fmt(get()[kx])} / ${fmt(get()[ky])}`; };
        b.on('change', () => { relabel(); apply(kx, fx); apply(ky, fx); });
        relabel(); refreshers.push(relabel);
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
  uwSurfaceAlpha: 0.67, uwRipple: 0.4, uwRippleFreq: .64, uwTint: '#7fd8e6', uwTintMix: 0.3,
  // 星空 / 云星搭配 / 云风格（0 体积 / 1 MC 方块 / 2 Bliss）
  starDensity: 67, starProb: 0.16, starGamma: 1.6, starTwinkle: 0.6, starMinElev: 0., cloudStarBlock: 1,
  cloudNightAlpha: 1., cloudStyle: 0, cloudAlpha: 0.2, skyDarkenNight: 0.12,
  // 水面风格（0 噪声 / 1 Reimagined / 2 Bliss，法线分支）+ 预设参数；shoreFade = 岸边软化（竖直水深格）
  waterStyle: 0, waterSpec: 20, waterSkyZen: 0, waterDeepSat: 0, shoreFade: 0.3};
// 水面预设按钮：只写 P（法线分支由 waterStyle → WATER_STYLE 宏切换）
const WATER_PRESETS = {
  noise: { waterStyle: 0, reflStrength: 0.36, waterClarity: 0.72, foamWidth: 1.2, waveNoise: 0.08, waveStrength: 0.06, waterSpec: 20,  waterSkyZen: 0, waterDeepSat: 0, shoreFade: 0.3 },
  mc:    { waterStyle: 1, reflStrength: 0.6,  waterClarity: 0.85, foamWidth: 1.2, waveNoise: 0,    waveStrength: 0.06, waterSpec: 64,  waterSkyZen: 1, waterDeepSat: 1, shoreFade: 0.4 },
  bliss: { waterStyle: 2, reflStrength: 0.8,  waterClarity: 0.92, foamWidth: 0,   waveNoise: 0.03, waveStrength: 0.05, waterSpec: 180, waterSkyZen: 1, waterDeepSat: 1, shoreFade: 0.6 },
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

export function createRenderer(ctx) {
  const P = loadP();
  // 调试/测量状态（不持久化）：view = DBG 宏（handover §5.2），raw = 原始计数编码（bench 用），time/cloudX = 冻结动画
  const D = { view: 0, raw: 0, time: null, cloudX: null, hostStars: 0 };   // hostStars=1：保留宿主星星（p0 对比用）
  const S = () => ctx.settings, Pr = () => P, Dr = () => D;
  const DBG_VIEWS = { '正常': 0, '主射线迭代': 1, 'fetch 次数': 2, '跳过平滑光照': 3, '层级 列/砖/体素': 5 };
  const PANEL = [
    ['性能', [
      ['rd',          S,  { label: '视距(区块)', ...R(2, 16, 1), fx: 'tex' }],
      ['scale',       Pr, { label: 'DDA 分辨率', ...R(0.25, 2.5, 0.05), fx: 'rt' }],
      ['maxMP',       Pr, { label: '像素上限(百万)', ...R(0.2, 8, 0.1), fx: 'rt' }],
      ['steps',       Pr, { label: '渲染迭代', ...R(32, 576, 8) }],
      ['shadowSteps', Pr, { label: '阴影迭代', ...R(0, 64, 4), fx: 'sh' }],
      ['v', vec2(Pr, 'shadowStrength', 'shadowDist'), V2('阴影 强度/距离', R(0, 1), R(4, 96, 1, true))],
      ['fogA1',       Pr, { label: '雾强度', ...R(0, 1) }],
      ['view',        Dr, { label: '调试视图', options: DBG_VIEWS, fx: 'dbg' }],
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
      ['leafShadow',  Pr, { label: '树叶阴影', options: { '精确': 0, '实心': 1, '无': 2 }, fx: 'sh' }],
      ['v', vec2(Pr, 'leafShadowDist', 'leafLodDist'), V2('精确阴影/镂空距离 (max=∞)', R(4, 64, 1, true), R(16, 160, 1, true))],
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
      ['v', vec2(Pr, 'cloudThick', 'cloudDensity'), V2('厚度/密度', R(1, 16, 0.5), R(0.02, 1, 0.01, true))],
      ['v', vec2(Pr, 'cloudShade', 'cloudLight'),   V2('暗部/日照', R(0, 1), R(0, 1))],
      ['v', vec2(Pr, 'cloudAlpha', 'cloudNightAlpha'), V2('alpha(MC)/夜间倍率', R(0, 1), R(0.5, 2))],
      ['', null, { button: '云：体积', fn: () => setPreset(CLOUD_PRESETS.vol) }],
      ['', null, { button: '云：MC 方块', fn: () => setPreset(CLOUD_PRESETS.mc) }],
      ['', null, { button: '云：Bliss', fn: () => setPreset(CLOUD_PRESETS.bliss) }],
    ]],
    ['水', [
      ['waterStyle',  Pr, { label: '风格', options: { '噪声': 0, 'Reimagined': 1, 'Bliss': 2 }, fx: 'def' }],
      ['v', vec2(Pr, 'waterClarity', 'reflStrength'), V2('透亮/反射',   R(0, 1), R(0, 1))],
      ['v', vec2(Pr, 'waterA2', 'waterA1'),       V2('不透明 深/浅', R(0, 1), R(0, 1))],
      ['v', vec2(Pr, 'waterD2', 'waterD1'),       V2('水深过渡 深/浅(格)', R(1, 24, 0.5, true), R(0, 8, 0.25))],
      ['v', vec2(Pr, 'waveStrength', 'waveNoise'), V2('波浪 正弦/噪声', R(0, 0.2, 0.005), R(0, 0.4, 0.005))],
      ['waveScale',   Pr, { label: '噪声频率', ...R(0.2, 4, 0.05) }],
      ['v', vec2(Pr, 'foamWidth', 'shoreFade'),   V2('岸边 泡沫/软化(格)', R(0, 1.5, 0.05), R(0, 1.5, 0.05))],
      ['v', vec2(Pr, 'waterSpec', 'waterSkyZen'), V2('高光指数/天顶反射', R(8, 256, 1, true), R(0, 1))],
      ['waterDeepSat', Pr, { label: '深水饱和', ...R(0, 1) }],
      ['uwSurfaceAlpha', Pr, { label: '水下看水面不透明', ...R(0, 1) }],
      ['v', vec2(Pr, 'uwRipple', 'uwRippleFreq'), V2('水下仰视 波纹/频率', R(0, 1), R(0.5, 1.5, 0.01))],
      ['uwTint',      Pr, { label: '水下仰视 滤镜色' }],
      ['uwTintMix',   Pr, { label: '滤镜强度', ...R(0, 1) }],
      ['v', vec2(Pr, 'uwNear', 'uwFar'),          V2('水下雾 近/远', R(0.2, 8, 0.1), R(6, 96, 1))],
      ['', null, { button: '水面：噪声', fn: () => setPreset(WATER_PRESETS.noise) }],
      ['', null, { button: '水面：Reimagined', fn: () => setPreset(WATER_PRESETS.mc) }],
      ['', null, { button: '水面：Bliss', fn: () => setPreset(WATER_PRESETS.bliss) }],
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
  const SRC = ctx.source || voxelCraftSource(ctx), BT = ctx.blockTable || voxelCraftBlocks(ctx);
  const CS = 16, H = SRC.height;
  if (SRC.size !== CS || H % 16 || H > 256) throw new Error(`[v2] ChunkSource 不支持：size ${SRC.size} height ${H}（要求 16 / 16 的倍数且 ≤256）`);
  const BY = H / 4, NS = H / 16;                        // 每列砖层数 / 区块段数（≤16，段掩码 16 位）
  const ckey = (cx, cz) => cx + ',' + cz;

  // ───────────────── 环形体素纹理 + 4³ 砖占用 + 区块列（列高 + 段标记，handover §3.1/§3.3） ─────────────────
  const ring = { rd: 0, N: 0, SX: 0, vox: null, brick: null, col: null, colData: null, owner: [], maxY: null, worldMaxY: 0, uploads: 0 };
  const stVox = new THREE.Data3DTexture(new Uint8Array(CS * H * CS * 2), CS, H, CS);   // 上传暂存（不绑定到着色器）
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
  // 方块表：r = kind | opaque<<4 | solid<<5 | cullSelf<<6，g/b/a = tileTop/Bot/Side
  const infoData = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++)
    infoData.set([BT.kind[i] | (BT.opaque[i] << 4) | (BT.solid[i] << 5) | ((BT.cullSelf ? BT.cullSelf[i] : 0) << 6), BT.tileTop[i], BT.tileBot[i], BT.tileSide[i]], i * 4);
  // 树叶扩展（goals §1/§2）：r bit7 = 树叶；id 192..254 = 卡片外伸（halo，kind 5，id-191 = 6 方向掩码，指向树叶格）；
  // id 255 = LEAVES_INNER（六面都是树叶的树叶格，按不透明处理）。仅当宿主方块 id 都 < 192 时启用
  const LV = BT.leavesId, LEAF_OK = LV != null && !Array.prototype.some.call(BT.kind.slice(192), k => k);
  if (LV != null && !LEAF_OK) console.warn('[v2] 方块 id 占用了 192..255：树叶卡片/内部剔除不可用');
  if (LEAF_OK) {
    infoData[LV * 4] |= 128;
    for (let i = 192; i < 255; i++) infoData.set([5, 0, 0, 0], i * 4);
    infoData.set([1 | 16 | (BT.solid[LV] << 5) | 128, BT.tileTop[LV], BT.tileBot[LV], BT.tileSide[LV]], 255 * 4);
  }
  const LEAF_CARD_LAYER = BT.tileCard != null ? BT.tileCard : (LV != null ? BT.tileSide[LV] : 0);
  const infoTex = new THREE.DataTexture(infoData, 256, 1, THREE.RGBAIntegerFormat, THREE.UnsignedByteType);
  Object.assign(infoTex, { internalFormat: 'RGBA8UI', minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, unpackAlignment: 1 });
  infoTex.needsUpdate = true;

  function rebuildRing() {
    for (const k of ['vox', 'brick', 'col']) if (ring[k]) ring[k].dispose();
    const rd = ctx.settings ? ctx.settings.rd : 6, N = 2 * rd + 5, SX = N * CS;
    Object.assign(ring, { rd, N, SX, owner: new Array(N * N).fill(null), maxY: new Uint16Array(N * N), worldMaxY: 0 });
    ring.vox = intTex3D(SX, H, SX, THREE.RGIntegerFormat, 'RG8UI', 2);
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
  function leafPost(cx, cz, b, nl, vd, bd, maxY) {
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
    const vo = (lx, y, lz) => (lz * H * CS + lx) * 2 + y * CS * 2;
    if (halo) haloM.fill(0);
    for (let k = 0; k < nl; k++) {
      const i = leafIdx[k], y = i % H, c = (i - y) / H, lx = (c / CS) | 0, lz = c % CS;
      let inner = true;
      for (let d = 0; d < 6; d++) {
        const x2 = lx + DX[d], y2 = y + DY[d], z2 = lz + DZ[d], n = at(x2, y2, z2);
        if (n !== LV) inner = false;
        if (halo && n === 0 && x2 >= 0 && x2 < CS && z2 >= 0 && z2 < CS) haloM[(x2 * CS + z2) * H + y2] |= 1 << (d ^ 1);
      }
      if (inner && cull) { vd[vo(lx, y, lz)] = 255; secOp[y >> 4]++; }
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
        vd[vo(lx, y, lz)] = 191 + m; bd[(lz >> 2) * BY * 4 + (lx >> 2) + (y >> 2) * 4] = 1;
        if (y >= maxY) maxY = y + 1;
        secNE[y >> 4]++;
      }
    }
    return maxY;
  }
  function uploadChunk(cx, cz) {
    const ch = SRC.getChunk(cx, cz);
    if (!ch) { clearChunk(cx, cz); return; }
    const N = ring.N, sx = wrap(cx, N), sz = wrap(cz, N), s = sz * N + sx;
    const b = ch.blocks, lt = ch.light, sk = ch.sky, bl = ch.blk, vd = stVox.image.data, bd = stBrick.image.data;
    const KIND = BT.kind, OPQ = BT.opaque;
    bd.fill(0); secNE.fill(0); secOp.fill(0);
    let maxY = 0, nl = 0;
    const LF = leafState.cull || leafState.halo ? LV : -1;
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const base = (lx * CS + lz) * H, bxz = (lz >> 2) * BY * 4 + (lx >> 2);
      let o = (lz * H * CS + lx) * 2;
      for (let y = 0; y < H; y++, o += CS * 2) {
        const id = b[base + y];
        vd[o] = id; vd[o + 1] = lt ? lt[base + y] : sk ? (sk[base + y] << 4) | bl[base + y] : 0xF0;
        if (id && KIND[id]) {
          bd[bxz + (y >> 2) * 4] = 1; if (y >= maxY) maxY = y + 1;
          secNE[y >> 4]++; if (OPQ[id]) secOp[y >> 4]++;
          if (id === LF) leafIdx[nl++] = base + y;
        }
      }
    }
    if (nl) maxY = leafPost(cx, cz, b, nl, vd, bd, maxY);
    let emptyM = 0, fullM = 0;
    for (let k = 0; k < NS; k++) { if (!secNE[k]) emptyM |= 1 << k; if (secOp[k] === 4096) fullM |= 1 << k; }
    renderer.copyTextureToTexture3D(boxV, dstPos.set(sx * CS, 0, sz * CS), stVox, ring.vox);
    renderer.copyTextureToTexture3D(boxB, dstPos.set(sx * 4, 0, sz * 4), stBrick, ring.brick);
    ring.owner[s] = ckey(cx, cz);
    setColumn(s, cx, cz, maxY, emptyM, fullM);
    ring.uploads++;
  }
  function clearChunk(cx, cz) {
    const N = ring.N, sx = wrap(cx, N), sz = wrap(cz, N), s = sz * N + sx;
    if (ring.owner[s] !== ckey(cx, cz)) return;         // 槽位已被别的区块占用：不动
    ring.owner[s] = null;
    setColumn(s, cx, cz, 0, 0, 0);                      // 列高 0 = 整列视为空，体素数据无需清零
  }
  function reuploadAll() { SRC.forEachChunk(uploadChunk); }
  // 树叶后处理读邻区块：新区块首次进环时，重传已在环里的 4 邻（边界内部剔除 / 外伸格才完整）
  SRC.onChunkChanged((cx, cz) => {
    const N = ring.N, isNew = ring.owner[wrap(cz, N) * N + wrap(cx, N)] !== ckey(cx, cz);
    uploadChunk(cx, cz);
    if (isNew && (leafState.cull || leafState.halo) && ring.owner[wrap(cz, N) * N + wrap(cx, N)] === ckey(cx, cz))
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        if (ring.owner[wrap(cz + dz, N) * N + wrap(cx + dx, N)] === ckey(cx + dx, cz + dz)) uploadChunk(cx + dx, cz + dz);
  });
  let uni = null;
  rebuildRing();

  // ── 参数生效 ──
  let saveT = 0, leafT = 0, post = null;
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
  function resetDefaults() {
    Object.assign(P, P_DEFAULTS); saveP(P);
    for (const k in P_DEFAULTS) apply(k, 'u');
    apply('scale', 'rt'); apply('shadowSteps', 'sh'); apply('leafStyle', 'leaf');
  }
  function setPreset(pr) {         // 预设按钮：只写 P
    Object.assign(P, pr);
    for (const k in pr) apply(k, 'u');
    apply('waterStyle', 'def');     // 风格宏（云/水）
  }
  // 风格开关 → 编译期宏（关闭时不进着色器，不增加常驻分支）
  function syncDefines() {
    if (!post) return;
    const want = { LEAF_CARDS: LEAF_OK && P.leafStyle === 1 ? 1 : 0, CLOUD_STYLE: P.cloudStyle | 0, WATER_STYLE: P.waterStyle | 0 };
    if (want.CLOUD_STYLE === 2 && !uni.uCloudNoise.value) uni.uCloudNoise.value = makeCloudNoise();   // 体积云噪声：首次启用时生成
    let ch = false;
    for (const k in want) if (post.defines[k] !== want[k]) { post.defines[k] = want[k]; ch = true; }
    if (ch) post.needsUpdate = true;
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
  // ── 测量（handover §5）：DBG 1 主射线迭代 / 2 fetch 计数 / 3 跳过 smoothLight / 5 层级（列+段跳/砖/体素）；DBGRAW=1 输出原始计数 ──
  #define DBG_HEAT (DBG == 1 || DBG == 2 || DBG == 5)
  int gFetch = 0, gIt = 0, gSIt = 0, gLvC = 0, gLvB = 0, gLvV = 0;
  #if DBG_HEAT
  #define CNT(n) gFetch += n
  #else
  #define CNT(n)
  #endif
  uniform usampler3D uVox, uBrick;
  uniform usampler2D uCol, uInfo;
  uniform sampler2D tScene, tDepth;
  uniform int uSX, uN, uSteps;
  uniform ivec2 uOrgSlot, uOrgLow;
  uniform vec3 uLo, uHi, uRo;
  uniform float uWorldMaxY, uNear, uFar, uTexelAngle, uFogA1, uClipScene, uAoStrength, uAoCurve, uExposure, uTime;
  uniform vec4 uWater0, uWater1;   // (透亮, 反射, 波纹, 泡沫宽) / (浅不透明, 深不透明, 浅深度, 深深度)
  uniform vec2 uWOff;              // 局部坐标 → 世界 xz（波纹相位连续）
  uniform sampler2D uWaterNoise;   // 可平铺噪声法线（RG = 斜率）
  uniform vec2 uWave1;             // (噪声强度, 噪声频率)
  uniform vec3 uSunDir;
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
  uniform float uShoreFade;        // 岸边软化：竖直水深 < 该值时水面渐隐
  uniform vec3 uRoLag;             // 指数滞后的相机（局部坐标）：树叶精度切换渐变
  uniform vec3 uSkyHor;            // 宿主天空球地平线色（反射用）
  uniform vec4 uUw;                // 水下仰视：(波纹强度, 波纹频率, 滤镜强度, -)
  uniform vec3 uUwTint;            // 水下仰视：滤镜色
  #if CLOUD_STYLE == 2
  precision highp sampler3D;
  uniform sampler3D uCloudNoise;   // 64³ 可平铺：R = Perlin-Worley 低频形状，G = Worley 高频侵蚀
  #endif
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
    float base = texture(uCloudNoise, q).r;
    float prof = smoothstep(0.0, 0.08, hN) * smoothstep(1.0, 0.45, hN);              // 底平、顶部收窄
    float d = clamp((base * mix(1.0, prof, 0.85) - (1.0 - cov)) / cov, 0.0, 1.0);
    d *= smoothstep(0.0, 0.06, hN) * smoothstep(1.0, 0.85, hN);
    if (detail && d > 0.0) {
      float hi = texture(uCloudNoise, p * (1.0 / 72.0) + vec3(uTime * 0.004, -uTime * 0.002, 0.0)).g;
      d = clamp((d - hi * mix(0.32, 0.12, hN)) / (1.0 - hi * 0.3), 0.0, 1.0);    // 底部侵蚀更多（蓬松下缘）
    }
    return d;
  }
  float hgPh(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
  bool cloudVol(vec3 ro, vec3 r, int nS, int nL, out float tc, out vec4 cc) {
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
    if (tE >= tX) return false;
    float dt = max((tX - tE) / float(nS), 1.2);
    float t = tE + dt * ign(gl_FragCoord.xy);
    bool day = uSunDir.y > -0.05;
    vec3 Ld = day ? uSunDir : -uSunDir;                                 // 夜间用月光（对向）
    float dayF = smoothstep(-0.05, 0.12, uSunDir.y);
    vec3 sunC = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.96, 0.9), smoothstep(0.02, 0.35, uSunDir.y));
    vec3 lightC = mix(vec3(0.10, 0.13, 0.20), sunC * (1.0 + 1.83 * uCloud2.z), dayF);   // 日照 0.36 → ×1.66
    vec3 amb = mix(vec3(0.75), mix(uSkyTop, uSkyHor, 0.5), dayF) * uCloudColor * 0.9;   // 天空光（宿主云色已含昼夜；夜间不再乘暗天色）
    float cth = dot(r, Ld);
    float ph = mix(hgPh(cth, 0.65), hgPh(cth, -0.25), 0.35) * 12.566 * 0.5 + 0.25;
    const float SIG = 0.22;
    float Tr = 1.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < 64; i++) {
      if (i >= nS || t >= tX || Tr < 0.03) break;
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
  bool cloudHit(vec3 ro, vec3 r, out float tc, out vec4 cc) {
    #if CLOUD_STYLE == 2
    return cloudVol(ro, r, 44, 3, tc, cc);
    #endif
    ro.xz += uWOff + uCloud.xy;
    float y0 = uCloud.z, y1 = uCloud.z + uCloud.w;
    float ta = (y0 - ro.y) / r.y, tb = (y1 - ro.y) / r.y;
    float tE = max(min(ta, tb), 0.0), tX = max(ta, tb);
    bool inside = ro.y >= y0 && ro.y <= y1;
    if (inside) tX = r.y > 0.0 ? tb : ta; else if (tX < 0.0) return false;
    tX = min(tX, 600.0);
    if (tE >= tX) return false;
    const float SZ = 768.0 / 64.0;
    vec2 p = (ro.xz + r.xz * tE) / SZ, d = r.xz / SZ;
    ivec2 cell = ivec2(floor(p)), st = ivec2(sign(d));
    vec2 inv = 1.0 / mix(d, vec2(1e-6), vec2(lessThan(abs(d), vec2(1e-6))));
    vec2 tM = tE + (vec2(cell + max(st, ivec2(0))) - p) * inv, tD = abs(inv);
    float t = tE, od = 0.0; int face = inside ? 4 : (r.y > 0.0 ? 3 : 2), f0 = -1;   // 2 顶 3 底 0 x侧 1 z侧 4 相机在云内
    tc = -1.0;
    for (int i = 0; i < 96; i++) {
      if (t >= tX) break;
      CNT(1);
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
    float dayF = smoothstep(-0.05, 0.12, uSunDir.y), hd = length(r.xz * tc);
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
    float lit = 1.0 + uCloud2.z * (max(dot(nF, uSunDir), 0.0) - 0.2) * dayF;
    cc = vec4(uCloudColor * faceSh * core * lit, min((1.0 - exp(-od * uCloud2.x)) * nightA, 1.0) * (1.0 - smoothstep(250.0, 480.0, hd)));
    return cc.a > 0.01;
  }
  uniform int uShadowSteps;
  uniform float uShadowStrength, uShadowDist, uSun;
  uniform mat4 uInvProj, uCamWorld;
  varying vec2 vUv;


  // 局部坐标（相对玩家所在区块原点）→ 环形纹素；被除数先加正偏移，避免负数取模（GLSL 未定义）
  uvec2 voxAt(ivec3 c) {
    int o = uSX * 4; CNT(1);
    return texelFetch(uVox, ivec3((c.x + uOrgSlot.x * 16 + o) % uSX, c.y, (c.z + uOrgSlot.y * 16 + o) % uSX), 0).rg;
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
  uint infoR(uint id) { CNT(1); return texelFetch(uInfo, ivec2(int(id), 0), 0).r; }
  // 邻域查询（越界：y<0 视为不透明，y>=H 视为满天空光的空气）
  void cellLO(ivec3 c, out float o, out float s, out float b) {
    if (c.y < 0) { o = 1.0; s = 0.0; b = 0.0; return; }
    if (c.y >= H) { o = 0.0; s = 15.0; b = 0.0; return; }
    uvec2 v = voxAt(c);
    o = (infoR(v.r) & 16u) != 0u ? 1.0 : 0.0; s = float(v.g >> 4u); b = float(v.g & 15u);
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
  bool solidAt(ivec3 c) { return c.y >= 0 && c.y < H && (infoR(voxAt(c).r) & 32u) != 0u; }

  // 花草：格内两条对角竖直平面（v1 emitCross：x=z 与 x+z=1，水平范围 0.15..0.85）
  bool crossHit(vec3 o, vec3 d, float t0, float t1, float layer, inout float tH, inout vec2 uvH) {
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
  int gLeafSh = 0;                     // 阴影射线的树叶档 0 精确 / 1 实心 / 2 无
  // 距离一律按「格中心到相机」量化：整块树叶一起切换精度/摇动幅度，不会出现一个球面扫过所有树
  float cellD(ivec3 c) { return length(vec3(c) + 0.5 - uRo); }
  ivec3 gShHome = ivec3(-1 << 20);     // 阴影射线跳过的起点格（卡片命中点在树叶格内）
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
    vec3 tD4 = abs(inv) * 4.0, tD1 = abs(inv), tM;
    bool fine = false;
    ivec3 bc, cell = cellAt(ro, r, t + 1e-4, 4.0);
    tM = (vec3((cell + up) * 4) - ro) * inv;
    ivec2 curCh = ivec2(-1 << 20); int cmax = 0; uint sEmpty = 0u, sFull = 0u;
    uint prevId = 0u; int nAlpha = 0;
    // 相机在水中：不画水面（由水下雾表现）；tw 改为记录出水点（水中路径长度，用于仰视透光窗）
    bool camWater = !shadow && home.y >= 0 && home.y < H && voxAt(home).r == ${BT.waterId}u;
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
          tM = (vec3((cell + up) * 4) - ro) * inv;
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
          tM = (vec3((cell + up) * 4) - ro) * inv;
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
            tHit = t; hc = fc; hid = voxAt(fc).r; return true;
          }
        }
        #endif
        if (cell.y >= 0 && brickAt(cell) != 0u) {          // 非空砖 → 逐格 DDA（限定在砖内）
          fine = true; bc = cell;
          cell = clamp(cellAt(ro, r, t + 1e-4, 1.0), bc * 4, bc * 4 + 3);
          tM = (vec3(cell + up) - ro) * inv;
          continue;
        }
        prevId = 0u;
        if (camWater && tw < 0.0) { tw = t; wn = nrm; }
        #if DBG_HEAT
        if (!shadow) gLvB++;
        #endif
        if (tM.x < tM.y && tM.x < tM.z) { t = tM.x; cell.x += st.x; tM.x += tD4.x; nrm = ivec3(-st.x, 0, 0); }
        else if (tM.y < tM.z)           { t = tM.y; cell.y += st.y; tM.y += tD4.y; nrm = ivec3(0, -st.y, 0); }
        else                            { t = tM.z; cell.z += st.z; tM.z += tD4.z; nrm = ivec3(0, 0, -st.z); }
      } else {
        if (ivec3(floor(vec3(cell) / 4.0)) != bc) {         // 离开砖 → 回到砖级
          fine = false; cell = ivec3(floor(vec3(cell) / 4.0)); tM = (vec3((cell + up) * 4) - ro) * inv;   // 精确：刚跨出的格所在砖
          continue;
        }
        uint id = voxAt(cell).r;
        if (camWater && tw < 0.0 && id != ${BT.waterId}u) {        // 出水点；向上穿出顶面时按 v1 lowerTop 下沉 1/8
          tw = t; wn = nrm;
          if (nrm.y < 0) tw = max(t - 0.125 / r.y, 0.0);
        }
        if (id != 0u) {
          uvec4 inf = texelFetch(uInfo, ivec2(int(id), 0), 0); CNT(1);
          uint rk = inf.r & 15u;
          float tN = min(min(tM.x, tM.y), tM.z);
          vec3 o = ro - vec3(cell);
          if ((inf.r & 128u) != 0u) {                                       // 树叶（含 LEAVES_INNER）
            if (cell != home) {
              bool opq = (inf.r & 16u) != 0u;
              if (shadow) {                                                  // 阴影：精确 / 实心 / 无（不摇）
                if (gLeafSh != 2) {
                  bool h = gLeafSh == 1 || opq || (gLeafSh == 0 && lodSolid(cell, uLeaf0.y, nrm, clamp(o + r * t, 0.0, 1.0))) || ++nAlpha > 8;   // 远处叶块整格投实心影（带渐变）
                  if (!h) { float ly, sh; vec2 uv = faceUV(nrm, clamp(o + r * t, 0.0, 1.0), inf, ly, sh); h = matSampleLod(uv, ly, lodAt(t)).a >= 0.5; }
                  if (h) { tHit = t; hc = cell; hid = id; return true; }
                }
              } else if (opq || lodSolid(cell, uLeaf0.x, nrm, clamp(o + r * t, 0.0, 1.0)) || ++nAlpha > 8) {   // 内部 / 远处 LOD：实心（带渐变）
                tHit = t; hc = cell; hid = id; return true;
              } else {
                #if LEAF_CARDS
                if (uLeaf1.z >= 2.5 && leafFace(cell, o, r, t, nrm, inf)) { tHit = t; hc = cell; hid = id; return true; }
                float tt = 1e30; vec2 uv = vec2(0.0);
                if (leafCards(cell, o, r, t, tN, swayK(cell), tt, uv)) {
                  tHit = tt; hc = cell; hid = id; kind = 6; uvl = vec3(uv, ${LEAF_CARD_LAYER}.0); return true;
                }
                #else
                if (leafFace(cell, o, r, t, nrm, inf)) { tHit = t; hc = cell; hid = id; return true; }
                #endif
              }
            }
          } else {
            if (cell != home && (inf.r & 16u) != 0u) {                     // 不透明方块
              tHit = t; hc = cell; hid = id; return true;
            }
            if (cell != home && rk == 1u && !((inf.r & 64u) != 0u && prevId == id)) {   // 镂空方块（玻璃等）：入射面 alpha 测试
              float ly, sh; vec2 uv = faceUV(nrm, clamp(o + r * t, 0.0, 1.0), inf, ly, sh);
              if (++nAlpha > 8 || matSampleLod(uv, ly, lodAt(t)).a >= 0.5) { tHit = t; hc = cell; hid = id; return true; }
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
          if (rk == 4u && !shadow && tw < 0.0 && !camWater) {             // 水：只记录首次入水点，射线继续穿过
            // 上方不是水 → 水面下沉 1/8（同 v1 lowerTop）：入射点高于 7/8 时改求与 y=7/8 平面的交点
            bool lowered = cell.y + 1 >= H || voxAt(cell + ivec3(0, 1, 0)).r != ${BT.waterId}u;
            float y0 = o.y + r.y * t;
            if (!lowered || y0 <= 0.875) { tw = t; wn = nrm; }
            else if (r.y < 0.0) { float tp = (0.875 - o.y) / r.y; if (tp <= tN) { tw = tp; wn = ivec3(0, 1, 0); } }
          }
          if (rk == 2u || rk == 3u) {                                        // 花草 / 火把
            float tt = 0.0; vec2 uv = vec2(0.0);
            bool h = ++nAlpha > 8 ? false : rk == 2u ? crossHit(o, r, t, tN, float(inf.a), tt, uv)
                                                     : torchHit(cell, o, r, t, tN, float(inf.a), tt, uv);
            if (h) { tHit = tt; hc = cell; hid = id; kind = int(rk); uvl = vec3(uv, float(inf.a)); return true; }
          }
        }
        prevId = id;
        #if DBG_HEAT
        if (!shadow) gLvV++;
        #endif
        if (tM.x < tM.y && tM.x < tM.z) { t = tM.x; cell.x += st.x; tM.x += tD1.x; nrm = ivec3(-st.x, 0, 0); }
        else if (tM.y < tM.z)           { t = tM.y; cell.y += st.y; tM.y += tD1.y; nrm = ivec3(0, -st.y, 0); }
        else                            { t = tM.z; cell.z += st.z; tM.z += tD1.z; nrm = ivec3(0, 0, -st.z); }
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
    int v = DBG == 1 ? gIt : gFetch;
    #if DBGRAW
    if (DBG == 5) gl_FragColor = vec4(vec3(min(ivec3(gLvC, gLvB, gLvV), 255)) / 255.0, 1.0);
    else gl_FragColor = vec4(float(v & 255) / 255.0, float(min(v >> 8, 255)) / 255.0, float(min(gSIt, 255)) / 255.0, 1.0);
    #else
    if (DBG == 5) gl_FragColor = vec4(sqrt(vec3(gLvC, gLvB, gLvV) / vec3(8.0, 32.0, 64.0)), 1.0);
    else gl_FragColor = vec4(heat(DBG == 1 ? float(v) / float(uSteps) : float(v) / 256.0), 1.0);
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
  float nB(vec2 uv) { return texture2D(uWaterNoise, uv).b * 1.417; }      // 可平铺噪声高度 ≈ 0..1
  float cut(float th, float x, float aa) { return aa > 0.0 ? smoothstep(th - aa, th + aa, x) : step(th, x); }
  // 岸边泡沫（仿 Complementary Reimagined）：按竖直水深 e = vd/宽 对两层反向漂移的噪声做阈值。
  // 贴岸实心带（边界被噪声撕碎）+ 外侧零碎泡沫斑 + 向外漂散、被噪声打断的浪线；无正弦。
  // Reimagined 风格吸附到方块 16² 像素格、硬边；其它风格软边
  float foamMask(vec2 q, float vd) {
    float w = uWater0.w;
    if (w <= 0.0) return 0.0;
    float e = vd / w;
    if (e >= 1.0) return 0.0;
    #if WATER_STYLE == 1
    q = (floor(q * 16.0) + 0.5) / 16.0; float aa = 0.0;
    #else
    float aa = 0.05;
    #endif
    float n1 = nB(q * 0.23 + uTime * vec2(0.011, 0.006));
    float n2 = nB(q * 0.61 - uTime * vec2(0.008, -0.013));
    float n = n1 * 0.6 + n2 * 0.4;
    float core  = 1.0 - cut(0.15 + 0.35 * n, e, aa);
    float spots = cut(0.5 + 0.45 * e, n2, aa) * 0.7;
    float ring  = cut(0.86, fract(e * 1.4 - uTime * 0.2 + n1 * 0.7), aa * 0.5) * cut(0.42, n2, aa) * (1.0 - e) * 0.65;
    return max(core, max(spots, ring)) * (1.0 - smoothstep(0.7, 1.0, e));
  }
  // 到岸距离（水平，格）：水面层 5×5 邻格里最近的非水非空方块的 AABB 距离（MC 水至少 0.875 深，竖直水深分不出岸边）
  float shoreDist(vec3 wp, float R) {
    ivec3 c = ivec3(floor(wp - vec3(0.0, 0.01, 0.0)));
    vec2 f = wp.xz - vec2(c.xz);
    float d = 9.0;
    for (int dz = -2; dz <= 2; dz++) for (int dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dz == 0) continue;
      vec2 lo = vec2(float(dx), float(dz));
      float dd = length(f - clamp(f, lo, lo + 1.0));
      if (dd >= min(d, R)) continue;
      uint id = voxAt(c + ivec3(dx, 0, dz)).r;
      if (id != 0u && id != ${BT.waterId}u) d = dd;
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
  // 返回 (dx, dy, 亮度系数)：dx/dy 量级同原 shader（±0.016 屏幕 uv）
  vec3 uwRipple(vec2 wxz) {
    vec2 c = wxz * 0.04 * uUw.y; float t = uTime * 1.3;
    float c0 = uwRip(c, t);
    float dx = 0.5 * (c0 - uwRip(c + vec2(21.33, 0.0), t)) / 60.0;
    float dy = 0.5 * (c0 - uwRip(c + vec2(0.0, 10.95), t)) / 60.0;
    float al = 1.0 + dx * dy * 700.0;
    float ddx = dx - 0.012, ddy = dy - 0.012;
    if (ddx > 0.0 && ddy > 0.0) al = pow(al, ddx * ddy * 200000.0);
    return vec3(dx, dy, mix(1.0, al, uUw.x));
  }
  // 反射：追踪命中 → 简化着色（体素光 + 朝阳面，无 AO/阴影）；未命中 → 天空渐变 + 云（低采样）
  bool reflHit(vec3 p, vec3 d, float tMax, float t0, out vec3 col) {
    float th; ivec3 hc, n; uint id; int kind; vec3 uvl; float tw_; ivec3 wn_;
    col = vec3(0.0);
    if (tMax > 0.0 && trace(p, d, tMax, 64, false, th, hc, n, id, kind, uvl, tw_, wn_) && kind != 4) {
      uvec4 inf = texelFetch(uInfo, ivec2(int(id), 0), 0);
      vec2 uv; float layer, shade; ivec3 lc;
      if (kind == 0) { uv = faceUV(n, clamp(p + d * th - vec3(hc), 0.0, 1.0), inf, layer, shade); lc = hc + n; }
      else { uv = uvl.xy; layer = uvl.z; shade = 1.0; lc = hc; }
      lc.y = clamp(lc.y, 0, H - 1);
      uvec2 g = voxAt(lc);
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
  vec3 reflScene(vec3 p, vec3 d, float tMax, float t0, float skyK) {
    vec3 hc_;
    if (reflHit(p, d, tMax, t0, hc_)) return hc_;
    vec3 s = skyDir(d) * mix(0.25, 1.0, skyK);
    float tc; vec4 cc;
    #if CLOUD_STYLE == 2
    if (skyK > 0.5 && cloudVol(p, d, 14, 1, tc, cc)) s = mix(s, cc.rgb, cc.a);
    #else
    if (skyK > 0.5 && cloudHit(p, d, tc, cc)) s = mix(s, cc.rgb, cc.a);
    #endif
    return s;
  }

  void main() {
    vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 vd = normalize(vp.xyz / vp.w);
    float cosF = -vd.z;
    vec3 r = normalize(mat3(uCamWorld) * vd);
    r = mix(r, vec3(1e-6), vec3(lessThan(abs(r), vec3(1e-6))));
    float d = texture2D(tDepth, vUv).r;
    vec4 sc = texture2D(tScene, vUv);
    float sceneZ = d >= 1.0 ? 1e9 : 2.0 * uNear * uFar / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
    // 雾远端之外与天空无差 → 射线裁到雾距；场景深度裁剪仅在 DDA 与 sceneRT 像素一一对应时（scale=1）安全
    float zLim = min(uClipScene > 0.5 ? sceneZ : 1e9, uFogA1 >= 0.999 ? uFogFar : 1e9);
    float tHit; ivec3 hc, n; uint id; int kind; vec3 uvl; float tw; ivec3 wn;
    // ×1.03：给雾远端留一点余量，否则正好落在 far 面上的几何会被 tX 裁掉（边缘一圈漏空）
    bool hit = trace(uRo, r, zLim * 1.03 / cosF, uSteps, false, tHit, hc, n, id, kind, uvl, tw, wn);
    bool camW = uRo.y >= 0.0 && uRo.y < float(H) && voxAt(ivec3(floor(uRo))).r == ${BT.waterId}u;
    bool water = !camW && tw >= 0.0 && (!hit || tw < tHit);
    bool uwSurf = camW && tw >= 0.0 && (!hit || tw < tHit);   // 水下仰视：水面 = 半透明贴图面（同 v1）
    vec3 uwR = vec3(0.0, 0.0, 1.0), rc = r;                     // 水下仰视波纹：折射偏移（云/天空/水上地形一起扭）
    if (uwSurf && uUw.x > 0.0) { vec3 wp0 = uRo + r * tw; uwR = uwRipple(wp0.xz + uWOff); rc = normalize(r + vec3(uwR.x, 0.0, uwR.y) * 3.0 * uUw.x); }
    float tc; vec4 cc; bool cloud = cloudHit(uRo, rc, tc, cc);
    if (!hit && !water && !uwSurf) {
      if (camW) {                                              // 水下且出不了水（深水/洞穴/水下平视）：水体雾色
        float zf = uFogFar;
        gl_FragColor = vec4(uFogColor, 1.0);
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
      vec3 f = clamp(uRo + r * tHit - vec3(hc), 0.0, 1.0);
      uvec4 inf = texelFetch(uInfo, ivec2(int(id), 0), 0); CNT(1);
      vec2 uv; float layer, shade, ao = 1.0; vec3 L;
      if (kind == 0) {
        uv = faceUV(n, (inf.r & 128u) != 0u ? swayF(hc, f) : f, inf, layer, shade);   // 树叶：贴图随摇动剪切
        ivec3 t1, t2; vec2 fl;                                // 平滑光照用的面内轴与格内坐标
        if (n.x != 0)      { t1 = ivec3(0, 0, 1); t2 = ivec3(0, 1, 0); fl = f.zy; }
        else if (n.y != 0) { t1 = ivec3(1, 0, 0); t2 = ivec3(0, 0, 1); fl = f.xz; }
        else               { t1 = ivec3(1, 0, 0); t2 = ivec3(0, 1, 0); fl = f.xy; }
        #if DBG == 3
        { float o_, s_, b_; cellLO(hc + n, o_, s_, b_); L = vec3(s_, b_, 1.0); }   // 测着色占比：本格光照、无 AO
        #else
        L = smoothLight(hc + n, t1, t2, fl);
        #endif
        // AO：old.htm 公式 mix(1-强度, 1, ao^曲线)；强度 0.58 / 曲线 1 ≈ v1 的 AO_CURVE
        ao = mix(1.0 - uAoStrength, 1.0, pow(clamp(L.z, 0.0, 1.0), uAoCurve));
      } else if (kind == 6) {                                 // 树叶卡片：命中点所在格光照 + 逐簇明度抖动
        uv = uvl.xy; layer = uvl.z;
        shade = 235.0 / 255.0 * mix(0.85, 1.1, float((lhash(hc) >> 11) & 255u) / 255.0);
        ivec3 lp = ivec3(floor(uRo + r * (tHit - 1e-3))); lp.y = clamp(lp.y, 0, H - 1);
        uvec2 g = voxAt(lp); L = vec3(float(g.g >> 4u), float(g.g & 15u), 1.0);
      } else {                                                // 花草 / 火把：本格光照（同 v1）
        uv = uvl.xy; layer = uvl.z; shade = kind == 2 ? 235.0 / 255.0 : 1.0;
        uvec2 g = voxAt(hc); L = vec3(float(g.g >> 4u), float(g.g & 15u), 1.0);
      }
      // 太阳：朝阳面 + 阴影射线。sky 光 <8（洞穴/室内）不发射；shadowSteps=0 且 sun=0 时与 v1 等价
      vec3 nW = kind == 0 ? vec3(n) : vec3(0.0, 1.0, 0.0);
      float dayF = smoothstep(-0.05, 0.12, uSunDir.y), G = dayF * clamp((L.x - 7.0) / 8.0, 0.0, 1.0);
      float ndl = kind == 0 ? max(dot(nW, uSunDir), 0.0) : 0.8 * max(uSunDir.y, 0.0);
      float sh = 1.0;
      if (uShadowSteps > 0 && ndl > 0.0 && G > 0.0) {
        float st; ivec3 sc_, sn_; uint si_; int sk_; vec3 su_; float stw_; ivec3 swn_;
        vec3 p0 = uRo + r * tHit + (kind == 0 ? nW * 2e-3 : uSunDir * 0.02);
        gLeafSh = int(uLeaf0.z);
        if (kind == 6) gShHome = ivec3(floor(p0));
        if (trace(p0, uSunDir, uShadowDist, uShadowSteps, true, st, sc_, sn_, si_, sk_, su_, stw_, swn_)) sh = 0.0;
      }
      float occl = uShadowSteps > 0 ? 1.0 - sh * smoothstep(0.0, 0.25, ndl) : 0.0;
      float sunK = 1.0 + uSun * ndl * sh * G - uShadowStrength * 0.5 * occl * G;
      vec3 lv = max(uSkyTint * bright(max(L.x - uSkyDarken, 0.0)) * sunK, vec3(1.0, 0.86, 0.66) * bright(L.y));
      col = matSampleLod(uv, layer, lodAt(tHit)).rgb * lv * shade * ao * uExposure;
      z = tHit * cosF;
    }
    if (water) {                                              // 水面（old.htm：波纹法线 + 菲涅尔 + 透射 + 高光 + 岸边泡沫）
      vec3 wp = uRo + r * tw, wq = wp + vec3(uWOff.x, 0.0, uWOff.y);
      float depth = hit ? tHit - tw : 60.0;
      float vd = depth * max(-r.y, 0.15);                      // 竖直水深近似 → 岸边泡沫 / 软化
      vec3 wN = vec3(wn);
      // 噪声法线：两层不同尺度/流向的可平铺噪声叠加（打破纯正弦的机械感）
      vec2 nq = wq.xz * (0.06 * uWave1.y), nq2 = wq.xz * (0.15 * uWave1.y);
      #if WATER_STYLE == 1
      vec2 ns = vec2(0.0);                                     // Reimagined：只用正弦法线 + 流动贴图
      #else
      vec2 ns = (texture2D(uWaterNoise, nq + uTime * vec2(0.013, 0.007)).rg * 2.0 - 1.0)
              + (texture2D(uWaterNoise, nq2 - uTime * vec2(0.009, -0.012)).rg * 2.0 - 1.0) * 0.6;
      #endif
      ivec3 ac0 = ivec3(floor(wp + vec3(wn) * 0.01));          // 水面外侧那格的光照（夜晚/洞穴变暗）
      float sky = 15.0, blk = 0.0;
      if (ac0.y >= 0 && ac0.y < H) { uvec2 g = voxAt(ac0); sky = float(g.g >> 4u); blk = float(g.g & 15u); }
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
        gLeafSh = int(uLeaf0.z);
        if (trace(wp + vec3(0.0, 0.05, 0.0), uSunDir, max(uShadowDist, 16.0), uShadowSteps, true, st, sc_, sn_, si_, sk_, su_, stw_, swn_)) spec = 0.0;
      }
      wcol = mix(seen, refl, clamp(fres * (0.4 + uWater0.y), 0.0, 1.0)) + sunC * min(spec, 8.0);
      a = 1.0;
      #else
      if (wn.y > 0) {
        float w1 = sin(wq.x * 0.9 + uTime * 1.2) + 0.5 * sin(wq.z * 1.7 - uTime * 0.8 + wq.x * 0.4);
        float w2 = sin(wq.z * 0.8 - uTime * 1.0) + 0.5 * sin((wq.x + wq.z) * 1.3 + uTime * 1.5);
        wN = normalize(vec3(-(w1 * uWater0.z + ns.x * uWave1.x * 4.0), 1.0, -(w2 * uWater0.z + ns.y * uWave1.x * 4.0)));
      }
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-r, wN), 0.0), 5.0);
      #if WATER_STYLE == 1
      vec3 tex = matSampleLod(fract(wq.xz + uTime * vec2(0.02, 0.01)), ${BT.tileSide[BT.waterId]}.0, lodAt(tw)).rgb;
      #else
      vec3 tex = matSampleLod(fract(wq.xz * vec2(1.0, 1.0)) , ${BT.tileSide[BT.waterId]}.0, lodAt(tw)).rgb;
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
        float fm = tw < 96.0 && uWater0.w > 0.0 ? foamMask(wq.xz, shoreDist(wp, min(uWater0.w, 2.0))) : 0.0;   // 岸边泡沫（到岸距离 × 噪声阈值，非正弦）
        wcol = mix(wcol, vec3(0.95) * lit, fm * 0.85);
        if (uShoreFade > 0.0) a *= mix(smoothstep(0.0, uShoreFade, vd), 1.0, fm * 0.85);   // 岸边软化（泡沫处保留）
      }
      col = mix(col, wcol, a);
      z = tw * cosF;
    }
    if (uwSurf) {                                             // 水下仰视：水面 = 半透明水贴图（同 v1 waterMat），再按水中路径加水下雾
      vec3 behind = hit ? col : (cloud ? mix(sc.rgb, cc.rgb, cc.a) : sc.rgb);
      if (uUw.x > 0.0) {                                      // 波纹：沿折射方向重新追踪水上（简化着色），未命中 → 偏移采样天空
        vec3 p0 = uRo + r * tw + rc * 0.03, hb;
        vec3 skyB = texture2D(tScene, clamp(vUv + uwR.xy * 2.0 * uUw.x, 0.0, 1.0)).rgb;
        behind = reflHit(p0, rc, 96.0, tw, hb) ? hb : (cloud ? mix(skyB, cc.rgb, cc.a) : skyB);
        behind *= uwR.z;
      }
      behind *= mix(vec3(1.0), uUwTint, uUw.z);              // 水下仰视滤镜
      vec3 wp = uRo + r * tw, wq = wp + vec3(uWOff.x, 0.0, uWOff.y);
      ivec3 ac = ivec3(floor(wp + r * 0.01)); ac.y = clamp(ac.y, 0, H - 1);   // 出水点外侧那格的光照（同 v1 水面顶点光）
      uvec2 g = voxAt(ac);
      vec2 suv = (wn.y != 0 ? wq.xz : wn.x != 0 ? wq.zy : wq.xy) + vec2(1.0, 0.5) * uTime / 12.0;
      vec4 st = matSampleLod(fract(suv), ${BT.tileSide[BT.waterId]}.0, lodAt(tw));
      float shd = wn.y != 0 ? 1.0 : wn.x != 0 ? 0.6 : 0.8;
      vec3 surf = st.rgb * voxLight(float(g.g >> 4u), float(g.g & 15u)) * shd * uExposure;
      vec3 o = mix(behind, surf, clamp(st.a * uUwAlpha / 0.667, 0.0, 1.0));
      o = mix(o, uFogColor, smoothstep(uFogNear, uFogFar, tw) * uFogA1);
      float zw = max(tw * cosF, uNear * 1.01);
      gl_FragColor = vec4(o, 1.0);
      gl_FragDepth = uFar * (zw - uNear) / (zw * (uFar - uNear));
      RET;
    }
    col = mix(col, applyFog(col, z), uFogA1);
    if (cloud && !camW && tc * cosF < z) { col = mix(col, cc.rgb, cc.a); z = tc * cosF; }   // 地形在云后（高处俯视）
    else if (cloud && !camW && kind == 4 && r.y > 0.0) col = mix(col, cc.rgb, cc.a);       // 上行射线预算耗尽（=远景雾）：云仍画在其上，否则地平线上方出现无云带
    gl_FragColor = vec4(col, 1.0);
    gl_FragDepth = uFar * (z - uNear) / (z * (uFar - uNear));
    RET;
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
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uShadowSteps: { value: 0 }, uShadowStrength: { value: 0 },
    uShadowDist: { value: 24 }, uSun: { value: 0 },
    uCloudTex: { value: ctx.cloudMat ? ctx.cloudMat.uniforms.uTex.value : null }, uCloudColor: { value: new THREE.Color(1, 1, 1) },
    uLeaf0: { value: new THREE.Vector4() }, uLeaf1: { value: new THREE.Vector4() }, uSway: { value: new THREE.Vector3() },
    uStar0: { value: new THREE.Vector4() }, uStar1: { value: new THREE.Vector4() }, uStarOn: { value: 1 }, uCloudAlpha: { value: 0.85 },
    uUwAlpha: { value: 0.67 }, uUw: { value: new THREE.Vector4(0.5, 1, 0.3, 0) }, uUwTint: { value: new THREE.Color(0.5, 0.85, 0.9) }, uShoreFade: { value: 0.3 }, uRoLag: { value: new THREE.Vector3() }, uSkyHor: { value: new THREE.Color(0.7, 0.8, 1) }, uCloudNoise: { value: null }, uWater2: { value: new THREE.Vector3(20, 0, 0) }, uSkyTop: { value: new THREE.Color(0.4, 0.6, 1) },
    uCloud: { value: new THREE.Vector4(0, 0, H + 36, 4) }, uCloud2: { value: new THREE.Vector3(0.3, 0.35, 0.35) }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
  };
  post = new THREE.ShaderMaterial({
    uniforms: uni, fragmentShader: DDA_FS, defines: { DBG: 0, DBGRAW: 0, SECT: 0, LEAF_CARDS: 0, CLOUD_STYLE: 0, WATER_STYLE: 0 },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,   // depthTest:false 会连深度写入一起关掉
  });
  syncDefines();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); quad.frustumCulled = false;
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
  const PASSES = ['scene', 'dda', 'comp'];
  const qPool = []; let qSet = null, qCur = null, qIdx = -1;
  const gpu = { scene: 0, dda: 0, comp: 0, total: 0 };      // EMA（显示用）
  const gpuLast = { scene: 0, dda: 0, comp: 0, total: 0, frame: 0 };   // 最近一组原始值（bench 用）
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
    gpuLast.total = tot; gpuLast.frame = ++gpuFrames; gpu.total = gpu.scene + gpu.dda + gpu.comp;
  }

  // ── 调试视图：切 DBG 宏（重新编译 post 着色器；DBG=0 时与生产着色器完全相同） ──
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
    if (ctx.stars && !D.hostStars) ctx.stars.visible = false;   // 星星改由 DDA 天空分支程序化绘制
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
    uni.uSteps.value = Math.round(P.steps); uni.uFogA1.value = P.fogA1;
    uni.uAoStrength.value = P.aoStrength; uni.uAoCurve.value = P.aoCurve; uni.uExposure.value = P.exposure;
    uni.uTime.value = D.time != null ? D.time : (performance.now() / 1000) % 3600; uni.uWOff.value.set(pcx * CS, pcz * CS);
    uni.uWater0.value.set(P.waterClarity, P.reflStrength, P.waveStrength, P.foamWidth);
    uni.uWater1.value.set(P.waterA1, P.waterA2, Math.min(P.waterD1, P.waterD2 - 0.01), P.waterD2);
    uni.uWave1.value.set(P.waveNoise, P.waveScale);
    const sd = ctx.U.uSunDir.value;   // 主程序太阳方向 + 面板方位/仰角偏移
    const az = Math.atan2(sd.x, sd.z) + P.sunAz, el = clamp(Math.asin(clamp(sd.y, -1, 1)) + P.sunEl, -1.5, 1.5);
    uni.uSunDir.value.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    uni.uShadowSteps.value = Math.round(P.shadowSteps); uni.uShadowStrength.value = P.shadowStrength;
    uni.uShadowDist.value = P.shadowDist; uni.uSun.value = P.sun;
    uni.uLeaf0.value.set(P.leafLodDist >= 160 ? 1e30 : P.leafLodDist, P.leafShadowDist >= 64 ? 1e30 : P.leafShadowDist, P.leafShadow, P.leafHaloDist);
    uni.uLeaf1.value.set(P.leafOverhang, clamp(1.5 - P.leafDensity, 0.03, 1), P.leafCardLayers, P.leafSeed);
    uni.uSway.value.set(P.swayAmp, P.swayFreq, P.swayDist);
    uni.uStar0.value.set(P.starDensity, P.starProb, P.starGamma, P.starTwinkle);
    uni.uStar1.value.set(P.starMinElev, P.cloudStarBlock, P.cloudNightAlpha, P.skyDarkenNight);
    uni.uStarOn.value = D.hostStars ? 0 : 1; uni.uCloudAlpha.value = P.cloudAlpha;
    uni.uUwAlpha.value = P.uwSurfaceAlpha; uni.uUw.value.set(P.uwRipple * 0.28, P.uwRippleFreq * 2.15, P.uwTintMix, 0);   // 面板 0.5/1 = 着色器 0.14/2.15；频率 ±50% uni.uUwTint.value.set(P.uwTint); uni.uShoreFade.value = P.shoreFade; uni.uWater2.value.set(P.waterSpec, P.waterSkyZen, P.waterDeepSat);
    if (ctx.skyMat) { uni.uSkyTop.value.copy(ctx.skyMat.uniforms.uTop.value); uni.uSkyHor.value.copy(ctx.skyMat.uniforms.uHorizon.value); }
    if (ctx.cloudMat) {
      const cu = ctx.cloudMat.uniforms; uni.uCloudColor.value.copy(cu.uColor.value);
      uni.uCloud.value.set(D.cloudX != null ? D.cloudX : cu.uOffset.value.x, cu.uOffset.value.y, ctx.clouds.position.y, P.cloudThick);
      uni.uCloud2.value.set(P.cloudDensity, P.cloudShade, P.cloudLight);
      ctx.clouds.visible = false;   // 平面云由 DDA 体积云代替
    }
    uni.uNear.value = camera.near; uni.uFar.value = camera.far;
    uni.uInvProj.value.copy(camera.projectionMatrixInverse); uni.uCamWorld.value.copy(camera.matrixWorld);
    uni.uTexelAngle.value = 2 * Math.tan(camera.fov * Math.PI / 360) / ddaRT.height;
    uni.uClipScene.value = ddaRT.width === sceneRT.width && ddaRT.height === sceneRT.height ? 1 : 0;
    gpuPass(1);
    renderer.setRenderTarget(ddaRT); renderer.clear(); renderer.render(postScene, postCam);
    renderer.setRenderTarget(prev);
    gpuPass(2);
    renderer.render(compScene, postCam);
    gpuPass(-1);
    if (qCur) { qSet = qCur; qCur = null; }
    ddaMs = ddaMs * 0.9 + (performance.now() - t0) * 0.1;
  }

  return {
    name: 'v2', P, P_DEFAULTS, panelSpec: PANEL, toN, fromN, paneReady, togglePanel, panelVisible,
    get pane() { return pane; }, refreshPane: () => paneUI && paneUI.refresh(),
    ring, reuploadAll, post, comp, D, setDebug,
    get perf() { return { gpu: { ...gpu }, gpuLast: { ...gpuLast }, hasTimer: !!qExt, cpuMs: ddaMs, scale: ddaScale,
                          ddaW: ddaRT ? ddaRT.width : 0, ddaH: ddaRT ? ddaRT.height : 0 }; }, get sceneRT() { return sceneRT; }, get ddaRT() { return ddaRT; },
    source: SRC, blockTable: BT,
    // VoxelCraft 适配器：宿主的 build/dispose 就是 onChunkChanged 的事件源（其它宿主由自己的适配器发事件，这两个可为空操作）
    buildChunk: c => { c.mesh = c.waterMesh = null; if (SRC.built) SRC.built(c); },
    disposeChunk: c => { if (SRC.disposed) SRC.disposed(c); c.mesh = c.waterMesh = null; },
    update: dt => {
      if (ctx.settings && ctx.settings.rd !== ring.rd) { rebuildRing(); reuploadAll(); }
      // 水下雾：主程序用的是近 0.5 / 远 18（很浑），面板可调（雾颜色仍随昼夜/水体取主程序的）
      const cp = camera.position;
      if (ctx.getBlock(Math.floor(cp.x), Math.floor(cp.y), Math.floor(cp.z)) === BT.waterId) {
        U.uFogNear.value = Math.min(P.uwNear, P.uwFar - 0.5); U.uFogFar.value = Math.max(P.uwNear + 0.5, P.uwFar);
      }
    },
    render,
    stats: () => `DDA ${ddaRT ? ddaRT.width + 'x' + ddaRT.height : '-'} (×${ddaScale.toFixed(2)}) steps ${Math.round(P.steps)} ring ${ring.N}² up ${ring.uploads} ${ddaMs.toFixed(1)}ms` +
      (qExt ? ` gpu s/d/c ${gpu.scene.toFixed(1)}/${gpu.dda.toFixed(1)}/${gpu.comp.toFixed(1)} = ${gpu.total.toFixed(1)}ms` : '') +
      (D.view ? ` [dbg ${D.view}]` : ''),
  };
}

// ───────────────── VoxelCraft 适配器（handover §2.1） ─────────────────
// ChunkSource：getChunk 返回 {blocks, sky, blk}（light 缺省时用 sky/blk 两个数组，省一次打包拷贝）；
// 额外约定 forEachChunk(fn(cx,cz))：rebuildRing 后整环重传用。事件源 = 宿主调用 renderer.buildChunk/disposeChunk
export function voxelCraftSource(ctx) {
  const live = new Map(), cbs = [], key = (cx, cz) => cx + ',' + cz;
  const emit = c => { for (const f of cbs) f(c.cx, c.cz); };
  if (ctx.chunks) for (const c of ctx.chunks.values()) if (c.meshed) live.set(key(c.cx, c.cz), c);   // 中途创建：接管已建区块
  return {
    size: ctx.CS, height: ctx.CH,
    getBlocks(cx, cz) { const c = live.get(key(cx, cz)); return c && c.blocks; },   // 树叶后处理读邻区块
    getChunk(cx, cz) {
      const c = live.get(key(cx, cz));
      return c && c.blocks && c.sky && c.blk ? { blocks: c.blocks, sky: c.sky, blk: c.blk } : null;
    },
    forEachChunk(fn) { for (const c of [...live.values()]) fn(c.cx, c.cz); },
    onChunkChanged(cb) { cbs.push(cb); },
    built(c) { live.set(key(c.cx, c.cz), c); emit(c); },
    disposed(c) { const k = key(c.cx, c.cz); if (live.get(k) === c) { live.delete(k); emit(c); } },
  };
}
// BlockTable：kind 0 无 / 1 立方 / 2 花草 / 3 火把 / 4 水（= VoxelCraft 的 RENDER）；cullSelf = 同种相邻不画内面（玻璃）
export function voxelCraftBlocks(ctx) {
  const { B, RENDER, OPAQUE, SOLID, T_TOP, T_BOT, T_SIDE } = ctx;
  const cullSelf = new Uint8Array(256); cullSelf[B.GLASS] = 1;
  const occupied = new Uint8Array(256); for (let i = 1; i < 256; i++) occupied[i] = RENDER[i] ? 1 : 0;
  return { kind: RENDER, opaque: OPAQUE, solid: SOLID, occupied, cullSelf, tileTop: T_TOP, tileBot: T_BOT, tileSide: T_SIDE, waterId: B.WATER,
           leavesId: B.LEAVES, tileCard: ctx.TEX ? ctx.TEX.leaves_card : undefined };
}
