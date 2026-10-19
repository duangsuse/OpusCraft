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
      if (tgt && tgt.__vec2) {
        const { get, kx, ky } = tgt, { rx, ry, label, fx } = o;
        const pt = { get x() { return toN(get()[kx], rx); }, set x(n) { get()[kx] = fromN(n, rx); },
                     get y() { return toN(get()[ky], ry); }, set y(n) { get()[ky] = fromN(n, ry); } };
        const b = f.addBinding({ v: pt }, 'v', { label, x: { min: -1, max: 1 }, y: { min: -1, max: 1, inverted: true },
                                                  picker: 'inline', expanded: true });
        const relabel = () => { b.label = `${label} ${fmt(get()[kx])} / ${fmt(get()[ky])}`; };
        b.on('change', () => { relabel(); apply(kx, fx); apply(ky, fx); });
        relabel(); refreshers.push(relabel);
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
export const P_DEFAULTS = {"scale":0.7999999999999999,"steps":128,"shadowSteps":20,"shadowStrength":0.68,"shadowDist":6,"waterClarity":0.72,"reflStrength":0.36,"fogA1":1,"sun":0.33,"exposure":0.86,"sunAz":1.18,"sunEl":0.32,"aoStrength":0.59,"aoCurve":1.92,"waterA2":1,"waterA1":0.78,"waterD2":11,"waterD1":1.5,"waveStrength":0.06,"foamWidth":1.2,"waveNoise":0.08,"waveScale":1,"uwNear":7.1,"uwFar":50,"maxMP":7.6,"cloudThick":5,"cloudDensity":0.34,"cloudShade":0.28,"cloudLight":0.36,"uwWindow":0.75};   // maxMP = DDA 像素上限（百万），大窗口自动降内部分辨率
function loadP() {
  const P = { ...P_DEFAULTS };
  try {
    const s = JSON.parse(localStorage.getItem(P_KEY) || 'null');
    if (s && s.ver === P_VER) for (const k in P_DEFAULTS) if (typeof s[k] === 'number' && isFinite(s[k])) P[k] = s[k];
  } catch (e) {}
  return P;
}
function saveP(P) { try { localStorage.setItem(P_KEY, JSON.stringify({ ver: P_VER, ...P })); } catch (e) {} }

export function createRenderer(ctx) {
  const P = loadP();
  // 调试/测量状态（不持久化）：view = DBG 宏（handover §5.2），raw = 原始计数编码（bench 用），time/cloudX = 冻结动画
  const D = { view: 0, raw: 0, time: null, cloudX: null };
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
      ['v', vec2(Pr, 'waterClarity', 'reflStrength'), V2('水 透亮/反射',   R(0, 1), R(0, 1))],
      ['fogA1',       Pr, { label: '雾强度', ...R(0, 1) }],
      ['view',        Dr, { label: '调试视图', options: DBG_VIEWS, fx: 'dbg' }],
    ]],
    ['光影', [
      ['sun',         Pr, { label: '日照倍率', ...R(0, 1) }],
      ['exposure',    Pr, { label: '曝光度', ...R(0.2, 3, 0.01) }],
      ['v', vec2(Pr, 'sunAz', 'sunEl'),           V2('光向量 方位/仰角偏移', R(-3.14, 3.14, 0.01), R(-1, 1, 0.01))],
      ['v', vec2(Pr, 'aoStrength', 'aoCurve'),    V2('AO 强度/曲线', R(0, 1), R(0.5, 3, 0.01, true))],
      ['v', vec2(Pr, 'waterA2', 'waterA1'),       V2('水体不透明 深/浅', R(0, 1), R(0, 1))],
      ['v', vec2(Pr, 'waterD2', 'waterD1'),       V2('水深过渡 深/浅(格)', R(1, 24, 0.5, true), R(0, 8, 0.25))],
      ['v', vec2(Pr, 'waveStrength', 'foamWidth'),V2('水面 正弦/泡沫', R(0, 0.2, 0.005), R(0, 1.5, 0.05))],
      ['v', vec2(Pr, 'waveNoise', 'waveScale'),  V2('水面 噪声/频率', R(0, 0.4, 0.005), R(0.2, 4, 0.05))],
    ]],
    ['水下', [
      ['v', vec2(Pr, 'uwNear', 'uwFar'),          V2('雾 近/远',       R(0.2, 8, 0.1), R(6, 96, 1))],
      ['uwWindow',    Pr, { label: '水面透光窗', ...R(0, 1) }],
      ['v', vec2(Pr, 'cloudThick', 'cloudDensity'), V2('云 厚度/密度', R(1, 16, 0.5), R(0.02, 1, 0.01, true))],
      ['v', vec2(Pr, 'cloudShade', 'cloudLight'),   V2('云 背光暗部/日照', R(0, 1), R(0, 1))],
    ]],
  ];


  // ───────────────── 环形体素纹理 + 4³ 砖占用 + 区块列高（handover §5.2 / §7.1） ─────────────────
  const { THREE, renderer, CS, CH, B, RENDER, OPAQUE, SOLID, T_TOP, T_BOT, T_SIDE, ck } = ctx;
  const BY = CH / 4;                                    // 每列砖层数（24）
  const ring = { rd: 0, N: 0, SX: 0, vox: null, brick: null, col: null, colData: null, owner: [], maxY: null, worldMaxY: 0, uploads: 0 };
  const stVox = new THREE.Data3DTexture(new Uint8Array(CS * CH * CS * 2), CS, CH, CS);   // 上传暂存（不绑定到着色器）
  const stBrick = new THREE.Data3DTexture(new Uint8Array(4 * BY * 4), 4, BY, 4);
  const boxV = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(CS - 1, CH - 1, CS - 1));
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
  // 方块表：r = RENDER | OPAQUE<<4 | SOLID<<5，g/b/a = T_TOP/T_BOT/T_SIDE
  const infoData = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) infoData.set([RENDER[i] | (OPAQUE[i] << 4) | (SOLID[i] << 5), T_TOP[i], T_BOT[i], T_SIDE[i]], i * 4);
  const infoTex = new THREE.DataTexture(infoData, 256, 1, THREE.RGBAIntegerFormat, THREE.UnsignedByteType);
  Object.assign(infoTex, { internalFormat: 'RGBA8UI', minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, unpackAlignment: 1 });
  infoTex.needsUpdate = true;

  function rebuildRing() {
    for (const k of ['vox', 'brick', 'col']) if (ring[k]) ring[k].dispose();
    const rd = ctx.settings ? ctx.settings.rd : 6, N = 2 * rd + 5, SX = N * CS;
    Object.assign(ring, { rd, N, SX, owner: new Array(N * N).fill(null), maxY: new Uint8Array(N * N), worldMaxY: 0 });
    ring.vox = intTex3D(SX, CH, SX, THREE.RGIntegerFormat, 'RG8UI', 2);
    ring.brick = intTex3D(N * 4, BY, N * 4, THREE.RedIntegerFormat, 'R8UI', 1);
    ring.colData = new Uint8Array(N * N * 4);           // r = maxY+1（0=空/无效），g/b = 区块坐标低 8 位（槽位归属校验）
    ring.col = new THREE.DataTexture(ring.colData, N, N, THREE.RGBAIntegerFormat, THREE.UnsignedByteType);
    Object.assign(ring.col, { internalFormat: 'RGBA8UI', minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, unpackAlignment: 1 });
    ring.col.needsUpdate = true;
    if (uni) { uni.uVox.value = ring.vox; uni.uBrick.value = ring.brick; uni.uCol.value = ring.col; }
  }
  function setColumn(s, cx, cz, maxY) {
    ring.maxY[s] = maxY;
    ring.colData.set([maxY, wrap(cx, 256), wrap(cz, 256), 0], s * 4);
    ring.col.needsUpdate = true;
    let m = 0; for (let i = 0; i < ring.maxY.length; i++) if (ring.maxY[i] > m) m = ring.maxY[i];
    ring.worldMaxY = m;
  }
  function uploadChunk(c) {
    if (!c.blocks || !c.sky || !c.blk) return;
    const N = ring.N, sx = wrap(c.cx, N), sz = wrap(c.cz, N), s = sz * N + sx;
    const b = c.blocks, sk = c.sky, bl = c.blk, vd = stVox.image.data, bd = stBrick.image.data;
    bd.fill(0);
    let maxY = 0;
    for (let lx = 0; lx < CS; lx++) for (let lz = 0; lz < CS; lz++) {
      const base = (lx * CS + lz) * CH, bxz = (lz >> 2) * BY * 4 + (lx >> 2);
      let o = (lz * CH * CS + lx) * 2;
      for (let y = 0; y < CH; y++, o += CS * 2) {
        const id = b[base + y];
        vd[o] = id; vd[o + 1] = (sk[base + y] << 4) | bl[base + y];
        if (id && RENDER[id]) { bd[bxz + (y >> 2) * 4] = 1; if (y >= maxY) maxY = y + 1; }
      }
    }
    renderer.copyTextureToTexture3D(boxV, dstPos.set(sx * CS, 0, sz * CS), stVox, ring.vox);
    renderer.copyTextureToTexture3D(boxB, dstPos.set(sx * 4, 0, sz * 4), stBrick, ring.brick);
    ring.owner[s] = ck(c.cx, c.cz);
    setColumn(s, c.cx, c.cz, maxY);
    ring.uploads++;
  }
  function clearChunk(c) {
    const N = ring.N, sx = wrap(c.cx, N), sz = wrap(c.cz, N), s = sz * N + sx;
    if (ring.owner[s] !== ck(c.cx, c.cz)) return;      // 槽位已被别的区块占用：不动
    ring.owner[s] = null;
    setColumn(s, c.cx, c.cz, 0);                        // 列高 0 = 整列视为空，体素数据无需清零
  }
  function reuploadAll() { for (const c of ctx.chunks.values()) if (c.meshed) uploadChunk(c); }
  let uni = null;
  rebuildRing();

  // ── 参数生效 ──
  let saveT = 0;
  function apply(key, fx) {
    if (fx === 'dbg') { setDebug(D.view, D.raw); return; }
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
    apply('scale', 'rt'); apply('shadowSteps', 'sh');
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
  // ── 测量（handover §5）：DBG 1 主射线迭代 / 2 fetch 计数 / 3 跳过 smoothLight / 5 层级；DBGRAW=1 输出原始计数 ──
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
  uniform float uUwWindow;         // 水下仰视：水面透光窗强度
  // 体积云：云纹理每个 texel = 12×12 格，挤出成厚度 uCloud.w 的盒子；在云层 slab 内做 2D 网格 DDA
  // 沿射线累积云内路径长度 → Beer-Lambert 不透明度（边角薄、横穿厚）；入射面按朝向/太阳着色，越厚核心越暗
  bool cloudHit(vec3 ro, vec3 r, out float tc, out vec4 cc) {
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
        od += tn - t;
        if (od * uCloud2.x > 4.0) break;              // 已基本不透明
      }
      if (tM.x < tM.y) { t = tM.x; cell.x += st.x; tM.x += tD.x; face = 0; }
      else             { t = tM.y; cell.y += st.y; tM.y += tD.y; face = 1; }
    }
    if (f0 < 0) return false;
    vec3 nF = f0 == 2 ? vec3(0.0, 1.0, 0.0) : f0 == 3 ? vec3(0.0, -1.0, 0.0) : f0 == 0 ? vec3(-sign(r.x), 0.0, 0.0)
            : f0 == 1 ? vec3(0.0, 0.0, -sign(r.z)) : -r;
    float base = f0 == 2 ? 1.0 : f0 == 3 ? 0.8 : f0 == 0 ? 0.92 : f0 == 1 ? 0.87 : 0.92;   // 底面比天空亮（白云）
    float faceSh = 1.0 - (1.0 - base) * (0.6 + 0.8 * uCloud2.y);
    float core = 1.0 - 0.3 * uCloud2.y * (1.0 - exp(-od / max(uCloud.w, 1.0)));
    float dayF = smoothstep(-0.05, 0.12, uSunDir.y);
    float lit = 1.0 + uCloud2.z * (max(dot(nF, uSunDir), 0.0) - 0.2) * dayF;
    float hd = length(r.xz * tc);
    cc = vec4(uCloudColor * faceSh * core * lit, (1.0 - exp(-od * uCloud2.x)) * (1.0 - smoothstep(250.0, 480.0, hd)));
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
  // 区块列高 maxY+1；槽位归属（区块坐标低 8 位）不符 → 视为空
  int colMaxAt(ivec2 ch) {
    CNT(1);
    uvec4 c = texelFetch(uCol, (ch + uOrgSlot + uN * 64) % uN, 0);
    ivec2 lo = (ch + uOrgLow + 4096) % 256;
    return (c.r == 0u || int(c.g) != lo.x || int(c.b) != lo.y) ? 0 : int(c.r);
  }
  uint infoR(uint id) { CNT(1); return texelFetch(uInfo, ivec2(int(id), 0), 0).r; }
  // 邻域查询（越界：y<0 视为不透明，y>=CH 视为满天空光的空气）
  void cellLO(ivec3 c, out float o, out float s, out float b) {
    if (c.y < 0) { o = 1.0; s = 0.0; b = 0.0; return; }
    if (c.y >= ${CH}) { o = 0.0; s = 15.0; b = 0.0; return; }
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
  bool solidAt(ivec3 c) { return c.y >= 0 && c.y < ${CH} && (infoR(voxAt(c).r) & 32u) != 0u; }

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

  // 两级 DDA（4³ 砖 → 体素）。kind：0 = 方块面（含镂空方块），2 = 花草，3 = 火把
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
    ivec3 home = shadow ? ivec3(-1 << 20) : ivec3(floor(ro));
    vec3 tD4 = abs(inv) * 4.0, tD1 = abs(inv), tM;
    bool fine = false;
    ivec3 bc, cell = cellAt(ro, r, t + 1e-4, 4.0);
    tM = (vec3((cell + up) * 4) - ro) * inv;
    ivec2 curCh = ivec2(-1 << 20); int cmax = 0;
    uint prevId = 0u; int nAlpha = 0;
    // 相机在水中：不画水面（由水下雾表现）；tw 改为记录出水点（水中路径长度，用于仰视透光窗）
    bool camWater = !shadow && home.y >= 0 && home.y < ${CH} && voxAt(home).r == ${B.WATER}u;
    bool exh = false;
    for (int i = 0; i < 576; i++) {
      if (t >= tX) break;
      if (i >= maxSteps) { exh = true; break; }
      #if DBG_HEAT
      if (shadow) gSIt++; else gIt++;
      #endif
      if (!fine) {
        ivec2 ch = ivec2(floor(vec2(cell.xz) / 4.0));
        if (ch != curCh) { curCh = ch; cmax = colMaxAt(ch); }
        if (cell.y * 4 >= cmax) {
          if (camWater && tw < 0.0) tw = t;               // 相机在水中：记录出水点
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
        if (cell.y >= 0 && brickAt(cell) != 0u) {          // 非空砖 → 逐格 DDA（限定在砖内）
          fine = true; bc = cell;
          cell = clamp(cellAt(ro, r, t + 1e-4, 1.0), bc * 4, bc * 4 + 3);
          tM = (vec3(cell + up) - ro) * inv;
          continue;
        }
        prevId = 0u;
        if (camWater && tw < 0.0) tw = t;
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
        if (camWater && tw < 0.0 && id != ${B.WATER}u) tw = t;
        if (id != 0u) {
          uvec4 inf = texelFetch(uInfo, ivec2(int(id), 0), 0); CNT(1);
          uint rk = inf.r & 15u;
          float tN = min(min(tM.x, tM.y), tM.z);
          vec3 o = ro - vec3(cell);
          if (cell != home && (inf.r & 16u) != 0u) {                       // 不透明方块
            tHit = t; hc = cell; hid = id; return true;
          }
          if (cell != home && rk == 1u && !(id == ${B.GLASS}u && prevId == id)) {   // 镂空方块（树叶/玻璃）：入射面 alpha 测试
            float ly, sh; vec2 uv = faceUV(nrm, clamp(o + r * t, 0.0, 1.0), inf, ly, sh);
            if (++nAlpha > 8 || matSampleLod(uv, ly, lodAt(t)).a >= 0.5) { tHit = t; hc = cell; hid = id; return true; }
          }
          if (rk == 4u && !shadow && tw < 0.0 && !camWater) {             // 水：只记录首次入水点，射线继续穿过
            // 上方不是水 → 水面下沉 1/8（同 v1 lowerTop）：入射点高于 7/8 时改求与 y=7/8 平面的交点
            bool lowered = cell.y + 1 >= ${CH} || voxAt(cell + ivec3(0, 1, 0)).r != ${B.WATER}u;
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
    bool camW = uRo.y >= 0.0 && uRo.y < ${CH}.0 && voxAt(ivec3(floor(uRo))).r == ${B.WATER}u;
    bool water = !camW && tw >= 0.0 && (!hit || tw < tHit);
    float tc; vec4 cc; bool cloud = cloudHit(uRo, r, tc, cc);
    if (!hit && !water) {
      if (camW) {
        // 水下仰视：只有 Snell 窗口（临界角 ≈48.6° → r.y > 0.66）能看到水面外的天空/云，
        // 透过的光带水色、按水中路径长度加雾；窗口外是全反射 → 水体雾色。出不了水（深水/洞穴）也是雾色
        vec3 o = uFogColor;
        if (tw >= 0.0 && r.y > 0.0) {
          vec3 skyc = cloud ? mix(sc.rgb, cc.rgb, cc.a) : sc.rgb;
          vec3 tint = mix(vec3(1.0), uFogColor / max(max(uFogColor.r, uFogColor.g), max(uFogColor.b, 1e-3)), 0.4);
          float win = smoothstep(0.6, 0.72, r.y) * uUwWindow;
          o = mix(skyc * tint * 1.1, uFogColor, max(smoothstep(uFogNear, uFogFar, tw), 1.0 - win));
        }
        float zf = uFogFar;
        gl_FragColor = vec4(o, 1.0);
        gl_FragDepth = uFar * (zf - uNear) / (zf * (uFar - uNear));
        RET;
      }
      if (cloud && tc * cosF < sceneZ) {                         // 天空前的云
        float zc = tc * cosF;
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
        uv = faceUV(n, f, inf, layer, shade);
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
      vec3 wN = vec3(wn);
      // 噪声法线：两层不同尺度/流向的可平铺噪声叠加（打破纯正弦的机械感）
      vec2 nq = wq.xz * (0.06 * uWave1.y), nq2 = wq.xz * (0.15 * uWave1.y);
      vec2 ns = (texture2D(uWaterNoise, nq + uTime * vec2(0.013, 0.007)).rg * 2.0 - 1.0)
              + (texture2D(uWaterNoise, nq2 - uTime * vec2(0.009, -0.012)).rg * 2.0 - 1.0) * 0.6;
      if (wn.y > 0) {
        float w1 = sin(wq.x * 0.9 + uTime * 1.2) + 0.5 * sin(wq.z * 1.7 - uTime * 0.8 + wq.x * 0.4);
        float w2 = sin(wq.z * 0.8 - uTime * 1.0) + 0.5 * sin((wq.x + wq.z) * 1.3 + uTime * 1.5);
        wN = normalize(vec3(-(w1 * uWater0.z + ns.x * uWave1.x * 4.0), 1.0, -(w2 * uWater0.z + ns.y * uWave1.x * 4.0)));
      }
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-r, wN), 0.0), 5.0);
      ivec3 ac = ivec3(floor(wp + wN * 0.01));                 // 水面外侧那格的光照（夜晚/洞穴变暗）
      float sky = 15.0, blk = 0.0;
      if (ac.y >= 0 && ac.y < ${CH}) { uvec2 g = voxAt(ac); sky = float(g.g >> 4u); blk = float(g.g & 15u); }
      vec3 lit = voxLight(sky, blk) * uExposure;
      vec3 tex = matSampleLod(fract(wq.xz * vec2(1.0, 1.0)) , ${T_SIDE[B.WATER]}.0, lodAt(tw)).rgb;
      vec3 shallow = vec3(0.45, 0.85, 0.80), deep = vec3(0.05, 0.30, 0.60);
      float trans = exp(-depth * mix(1.5, 0.06, clamp(uWater0.x, 0.0, 1.0)));
      vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.10)) * (0.7 + 0.6 * dot(tex, vec3(0.333))) * lit;
      vec3 seen = mix(body, col * mix(vec3(1.0), shallow * 1.15, 0.5), trans);
      float caus = 0.5 + 0.5 * sin(wq.x * 2.3 + uTime * 0.7 + ns.x * 2.5) * sin(wq.z * 2.1 - uTime * 0.6 + ns.y * 2.5);
      seen += caus * caus * 0.10 * trans * lit;
      float dayF = smoothstep(-0.05, 0.12, uSunDir.y), skyK = sky / 15.0;
      vec3 skyC = mix(uFogColor, vec3(1.0), 0.35 * dayF) * mix(0.3, 1.0, skyK);
      float spec = pow(max(dot(wN, normalize(-r + uSunDir)), 0.0), 20.0) * dayF * skyK;
      vec3 wcol = mix(seen, skyC, fres * uWater0.y) + spec * 0.6;
      float vd = depth * max(-r.y, 0.15);                      // 竖直水深近似 → 岸边泡沫
      if (hit && vd < uWater0.w) {
        float k = 1.0 - vd / uWater0.w, fn = 0.5 + 0.5 * sin(wq.x * 6.0 + uTime * 2.0 + sin(wq.z * 4.0) + ns.x * 3.0);
        wcol = mix(wcol, vec3(0.96) * lit, k * k * fn * 0.8);
      }
      float a = clamp(mix(uWater1.x, uWater1.y, smoothstep(uWater1.z, uWater1.w, depth)) + fres * uWater0.y * 0.5, 0.0, 1.0);
      col = mix(col, wcol, a);
      z = tw * cosF;
    }
    col = mix(col, applyFog(col, z), uFogA1);
    if (cloud && !camW && tc * cosF < z) { col = mix(col, cc.rgb, cc.a); z = tc * cosF; }   // 地形在云后（高处俯视）
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
    uCloud: { value: new THREE.Vector4(0, 0, CH + 36, 4) }, uCloud2: { value: new THREE.Vector3(0.3, 0.35, 0.35) }, uUwWindow: { value: 0.75 }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
  };
  const post = new THREE.ShaderMaterial({
    uniforms: uni, fragmentShader: DDA_FS, defines: { DBG: 0, DBGRAW: 0 },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,   // depthTest:false 会连深度写入一起关掉
  });
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
    renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
    // ② DDA：局部坐标（玩家区块原点）避免远处 float 精度问题
    const pcx = Math.floor(camera.position.x / CS), pcz = Math.floor(camera.position.z / CS), h = ring.rd + 2;
    uni.uRo.value.set(camera.position.x - pcx * CS, camera.position.y, camera.position.z - pcz * CS);
    uni.uLo.value.set(-h * CS, 0, -h * CS); uni.uHi.value.set((h + 1) * CS, CH, (h + 1) * CS);
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
    uni.uShadowDist.value = P.shadowDist; uni.uSun.value = P.sun; uni.uUwWindow.value = P.uwWindow;
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
    buildChunk: c => { c.mesh = c.waterMesh = null; uploadChunk(c); },
    disposeChunk: c => { clearChunk(c); c.mesh = c.waterMesh = null; },
    update: dt => {
      if (ctx.settings && ctx.settings.rd !== ring.rd) { rebuildRing(); reuploadAll(); }
      // 水下雾：主程序用的是近 0.5 / 远 18（很浑），面板可调（雾颜色仍随昼夜/水体取主程序的）
      const cp = camera.position;
      if (ctx.getBlock(Math.floor(cp.x), Math.floor(cp.y), Math.floor(cp.z)) === B.WATER) {
        U.uFogNear.value = Math.min(P.uwNear, P.uwFar - 0.5); U.uFogFar.value = Math.max(P.uwNear + 0.5, P.uwFar);
      }
    },
    render,
    stats: () => `DDA ${ddaRT ? ddaRT.width + 'x' + ddaRT.height : '-'} (×${ddaScale.toFixed(2)}) steps ${Math.round(P.steps)} ring ${ring.N}² up ${ring.uploads} ${ddaMs.toFixed(1)}ms` +
      (qExt ? ` gpu s/d/c ${gpu.scene.toFixed(1)}/${gpu.dda.toFixed(1)}/${gpu.comp.toFixed(1)} = ${gpu.total.toFixed(1)}ms` : '') +
      (D.view ? ` [dbg ${D.view}]` : ''),
  };
}
