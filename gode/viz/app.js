/* gode/viz/app.js —— pgviz 装配（s13 §2、§2.1、§4 V1，V-8…V-12）：状态 / URL 同步、slicer 池流式（3D 窗口 + 外圈 2D）、
   相机（拖动平移、朝光标缩放、Shift+滚轮调切片）、右下 gizmo（点端点 150 ms 淡入切视角；悬停 = 沿视线轴快放 +N 层，
   悬停别的轴端点 = 沿该轴快放切面，左栏小图同步画那个方向的剖面）、③ 悬停的方块、④ 选区（3D 盒，跨视角保留，拖边改范围）、
   ↗ 进游戏（mini → 宿主 B ?seed=&p1=；其余 → gode ?g=&seed=&p1=&fly=1）、读数、状态行、window.viz。
   视角按「相机在哪一侧」命名：top = 在 +Y 往下看；south = 在 +Z 往北（−Z）看；east = 在 +X 往西看；bottom / north / west 反向。 */
import { Renderer, C2 } from './gl.js';
import { Store, key } from './store.js';
import { Pool } from './pool.js';
import { blockLUT, biomeLUT } from './palette.js';
import { regionStats, diffStats } from './stats.js';
import { Layers } from './layers.js';
import { seamCheck } from './seam.js';
import { resolveParams, diffFromDefault, parseKw, fmtKw, flatten } from '../w/params.js';

const $ = (id) => document.getElementById(id);
const VIEWS = {   // F 视线前向、R 屏幕右、D 屏幕下
  top:    { F: [0, -1, 0], R: [1, 0, 0], D: [0, 0, 1], ax: '+Y', name: '俯视' },
  bottom: { F: [0, 1, 0], R: [-1, 0, 0], D: [0, 0, 1], ax: '-Y', name: '仰视' },
  south:  { F: [0, 0, -1], R: [1, 0, 0], D: [0, -1, 0], ax: '+Z', name: '南侧视' },
  north:  { F: [0, 0, 1], R: [-1, 0, 0], D: [0, -1, 0], ax: '-Z', name: '北侧视' },
  east:   { F: [-1, 0, 0], R: [0, 0, -1], D: [0, -1, 0], ax: '+X', name: '东侧视' },
  west:   { F: [1, 0, 0], R: [0, 0, 1], D: [0, -1, 0], ax: '-X', name: '西侧视' },
};
const AX_VIEW = { '+Y': 'top', '-Y': 'bottom', '+Z': 'south', '-Z': 'north', '+X': 'east', '-X': 'west' };
const AXN = 'XYZ', MAX3 = 48, MIN3 = 12;
const axisOf = (v) => v[0] ? 0 : v[1] ? 1 : 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

// ---- 状态（全部进 URL） ----
const q = new URLSearchParams(location.search);
const num = (k, d) => { const v = q.get(k); return v === null || v === '' || isNaN(+v) ? d : +v; };
const parsePair = (s) => { if (!s) return null; const a = String(s).split(',').map(Number); return a.length === 2 && a.every(Number.isFinite) ? a.map(Math.round) : null; };
const parsePin = (s) => { if (!s) return null; let a = String(s).split(',').map(Number); if (!a.every(Number.isFinite)) return null; a = a.map(Math.round); return a.length === 3 ? [...a, ...a] : a.length === 6 ? normSel(a) : null; };
const parsePair3 = (s) => { if (!s) return null; const a = String(s).split(',').map(Number); return a.length === 3 && a.every(Number.isFinite) ? a.map(Math.round) : null; };
const parseSel = (s) => { if (!s) return null; const a = String(s).split(',').map(Number); return a.length === 6 && a.every(Number.isFinite) ? normSel(a) : null; };
function normSel(a) { return [Math.min(a[0], a[3]), Math.min(a[1], a[4]), Math.min(a[2], a[5]), Math.max(a[0], a[3]), Math.max(a[1], a[4]), Math.max(a[2], a[5])]; }
// URL 里的点 / 视图（同顶栏粘贴框的 @x,z[^y] 写法；坐标取绝对值，与 origin= 无关）：p1 = 视口中心 `@x,z`（侧视 + `^y` 屏幕中心高度）；pv = 视线轴 `[-]X|Y|Z[:切片]`（正号省略：+ 在 URL 里是空格；Y = 俯视地表，-Y:64 = 仰视切片 64）
const PN = '(-?\\d+(?:\\.\\d+)?)';
const parseP1 = (s) => { const m = new RegExp(`^\\s*@?\\s*${PN}\\s*,\\s*${PN}(?:\\s*\\^\\s*${PN})?(?:\\s*,\\s*${PN})?(?:\\s*,\\s*${PN})?\\s*$`).exec(s ?? ''); return m ? [Math.round(+m[1]), Math.round(+m[2]), m[3] === undefined ? undefined : Math.round(+m[3]), m[4] === undefined ? undefined : +m[4], m[5] === undefined ? undefined : +m[5]] : null; };   // 第 4 / 5 位 = yaw / pitch（游戏 p1 的写法，viz 只读不用）
const parsePv = (s) => { const m = /^\s*([+-]?)([XYZxyz])(?::\s*(-?\d+))?\s*$/.exec(s ?? ''); const v = m && AX_VIEW[(m[1] || '+') + m[2].toUpperCase()]; return v ? { view: v, slice: m[3] === undefined ? null : +m[3] } : null; };
const ptTxt = (o) => `${o.x},${o.z}${o.y !== undefined && o.y !== null ? ',' + o.y : ''}`;     // 存储 / URL：`x,z[,y]`；y 只在游戏里站在地下时记（boot.js C 键）
const atTxt = (o) => `@${o.x},${o.z}${o.y !== undefined && o.y !== null ? '^' + o.y : ''}`;   // 显示 / 复制：和点坐标同写法
const fmtPts = (a) => a.map(o => `${o.n}:${ptTxt(o)}`).join(';');
const cleanName = (n) => String(n).replace(/[;:,@\n]/g, '_').trim().slice(0, 24) || '_';
const samePt = (a, b) => a.x === b.x && a.z === b.z && (a.y ?? null) === (b.y ?? null);   // 原点身份 = x,z,(y)：地下原点不和同列的地表原点合并
const dedupeOrigins = (a) => { const seen = new Set(); return a.filter(o => { const k = ptTxt(o); if (seen.has(k)) return false; seen.add(k); return true; }); };   // 按坐标去重，保留第一项
const parseOrigins = (t) => dedupeOrigins(parseOriginsRaw(t));
const parseOriginsRaw = (t) => String(t || '').split(';').map(x => x.split(':')).filter(a => a.length >= 2).map(a => { const p = a[a.length - 1].split(',').map(Number); return p.length >= 2 && p.length <= 3 && p.every(Number.isFinite) ? { n: cleanName(a.slice(0, -1).join(':')), x: Math.round(p[0]), z: Math.round(p[1]), ...(p.length > 2 ? { y: Math.round(p[2]) } : {}) } : null; }).filter(Boolean);
let lsOrigins = []; try { const raw = localStorage.getItem('pgviz.origins'); lsOrigins = parseOrigins(raw); const clean = fmtPts(lsOrigins); if (raw !== null && raw !== clean) localStorage.setItem('pgviz.origins', clean); } catch {}   // 启动时顺手清掉 localStorage 里的重复项
// 空气距离：开关。开 = 水体风格灰渐变（近亮远暗）；格 > 22 px 时再叠黑色数字。旧 URL 的 air=num|gray|1 都读作开
function parseAir(v) { return v === true || v === 1 || ['1', 'true', 'num', 'gray'].includes(v); }
const PV = parsePv(q.get('pv')), P1 = parseP1(q.get('p1'));
const legacyXZ = !P1 && q.has('x');   // 旧 URL：x= z= 是世界坐标、zoom= 是缩放；新 URL：z= 是缩放（取整）
const zoomQ = (() => { const v = q.has('zoom') ? q.get('zoom') : legacyXZ ? null : q.get('z'); return v === null || v === '' || isNaN(+v) ? 2 : +v; })();
const S = {
  kw: parseKw(q.get('kw')),   // 生成器参数覆盖（点号键 → 数；s02 §2.1），只存偏离默认的
  g: q.get('g') || 'gp', seed: q.get('seed') ?? '20240607', view: PV?.view ?? (VIEWS[q.get('view')] ? q.get('view') : 'top'),   // 旧 view= x= z= y= slice= mode= 仍认
  x: P1 ? P1[0] : num('x', 0), y: P1?.[2] ?? num('y', null), z: P1 ? P1[1] : legacyXZ ? num('z', 0) : 0, zoom: zoomQ,
  slice: PV ? PV.slice : q.get('mode') === 'surface' ? null : num('slice', null),    // null = 地表（从最外层开始）
  fill: clamp(num('fill', 1), 0.2, 1), air: parseAir(q.get('air')), xray: clamp(Math.round(num('xray', 0)), 0, 64), layer: /^(none|tree|f:[\w.-]+)$/.test(q.get('layer') ?? '') ? q.get('layer') : 'none', lop: clamp(num('lop', 0.35), 0.1, 1),
  shade: ['block', 'biome', 'height'].includes(q.get('shade')) ? q.get('shade') : 'block', grid: q.get('grid') !== '0', sel: parseSel(q.get('sel')) ?? parsePin(q.get('pin')),   // 旧 pin= 3 / 6 元 → sel
  origin: parsePair(q.get('origin')) ?? [0, 0], origins: q.has('pts') || q.has('origins') ? parseOrigins(q.get('pts') ?? q.get('origins')) : lsOrigins,   // origins= 旧名
  hit: parsePair3(q.get('hit')), rate: clamp(num('rate', 7), 1, 60), minip: q.get('minip') === '1', otext: q.get('otext') !== '0', terr: parseTerr(q.get('terr')), lay: q.get('lay') === '1', bio: parseBio(q.get('bio')), bm: ['only', 'hl', 'un'].includes(q.get('bm')) ? q.get('bm') : 'hl', tod: parseTod(q.get('tod')), lcol: /^[0-9a-f]{6}$/i.test(q.get('lcol') ?? '') ? q.get('lcol').toLowerCase() : null, opath: q.get('opath') === '1', seld: clamp(num('seld', 16), 1, 256),
};

// 只有 g seed kw p1 pv shade layer z 随改动实时写进地址栏；其余（sel hit pts bio 与各开关 / 参数）location 里只有「加载时带的」或「最近一次复制 URL / gd 时」的快照
const snapVals = () => ({ sel: S.sel && [...S.sel], hit: S.hit && [...S.hit], pts: fmtPts(S.origins), bio: [...S.bio], origin: [...S.origin], fill: S.fill, rate: S.rate, minip: S.minip, otext: S.otext, grid: S.grid, terr: S.terr, lay: S.lay, bm: S.bm, tod: S.tod, lcol: S.lcol, opath: S.opath, air: S.air, xray: S.xray, lop: S.lop, seld: S.seld });
const snap = { ...snapVals(), pts: q.has('pts') || q.has('origins') ? fmtPts(S.origins) : '' };   // 启动时 pts 不取 localStorage 的

// ---- 错误收集（viz.errors()） ----
const errs = [];
const cerr = console.error.bind(console);
console.error = (...a) => { errs.push(a.map(String).join(' ')); cerr(...a); };
addEventListener('error', (e) => errs.push('uncaught: ' + (e.message || e.error)));
addEventListener('unhandledrejection', (e) => errs.push('rejection: ' + (e.reason?.message ?? e.reason)));

// ---- 运行时对象 ----
const cv = $('cv'), R = new Renderer(cv), LY = new Layers($('lay'));
let pool = null, poolUrl = '', meta = null, store = null, H = 256;
const busy = new Set();                // 在途：'g' + key（整块）/ 'c' + key（列）
let n3 = [], n2 = [], wc = null;       // 待生成（最近优先）、窗口中心区块
const dirty3 = new Set(), dirty2 = new Set();
const st = { t0: 0, t1: 0, got: 0, wms: 0, clip: 0, cols: 0, pn: 0 };   // got / wms 累计；t0 t1 pn = 当前这一轮加载（墙钟）
let waiters = [], fadeEnd = 0, booting = null, bootErr = null, frameReq = 0, gizHover = null, play = null;
const live = () => !!play && !play.frozen;   // 快放中（frozen = 其它轴的扫描线 / 剖面已停在某层，Esc 取消）
let hov = null;                        // 最近一次地图悬停：{ px, py, c, r, p }
let selAB = null;   // 矩形选区的两个角 { box, A, B }（box 必须还是 S.sel 本身才有效；⏎ 进游戏时俯视 B 点用）
let selA = null, edge = null, copied = '', pinV = null, pinK = '', pinPend = false;   // pinV / pinK：③ 近端格的 sample 缓存

const genUrl = (g) => /^(mini|gp|liq|old|pg1|luan0|luanV|veg)$/.test(g) ? new URL(`../defl/g/${g}.js`, import.meta.url).href : new URL(g, location.href).href;
const dpr = () => window.devicePixelRatio || 1;

// ---- 启动 / 重置：换生成器或种子 ----
async function boot() {
  bootErr = null;
  const url = genUrl(S.g);
  if (pool && poolUrl !== url) { pool.close(); pool = null; }
  if (!pool) { pool = new Pool(url); poolUrl = url; pool.onerr = (e) => { errs.push('slicer: ' + e.msg); cerr('[slicer]', e.msg, e.stack); status(); }; pool.pump = pump; }
  busy.clear(); n3 = []; n2 = []; dirty3.clear(); dirty2.clear(); wc = null;
  $('s1').textContent = `起池 ${pool.n} × ${S.g} …`;
  meta = await pool.init({ seed: S.seed, g: S.g, kw: S.kw });
  H = meta.h ?? 256;
  if (S.y === null) S.y = meta.sea ?? 64;   // 侧视的屏幕中心高度：默认海平面（liq 127）
  store = new Store(meta); LY.reset(meta);
  pool.call('sample', { x: 0, z: 0 }).then((s) => { LY.setFields(Object.keys(s ?? {}).filter(k => typeof s[k] === 'number' && k !== 'biome')); syncUI(); frame(); }).catch(() => {});
  S.zoom = clampZoom(S.zoom);
  R.alloc(Math.min(MAX3, Math.ceil(wantSizes()[0] / 8) * 8), H); R.clear2(); lutRGB = blockLUT(meta.names ?? []); pcache.clear(); pPend.clear(); R.palette(lutRGB, biomeLUT(meta)); biomeRGB = null;
  Object.assign(st, { t0: performance.now(), t1: 0, got: 0, wms: 0, clip: 0, cols: 0, pn: 0 });
  recenter(true); syncUI(); world(); draw();
}
const restart = () => (booting = boot().catch(e => { bootErr = e; errs.push('boot: ' + e.message); cerr(e); $('s1').innerHTML = `<span class="bad">启动失败：${e.message}</span>`; }));

// ---- 窗口大小（V-8）：3D 覆盖画布长边的 fill（≤ 48 区块），2D 铺满画布（≤ 80）；缩放下限 = 2D 刚好铺满 ----
const zmin = () => Math.max(cv.clientWidth, cv.clientHeight) / ((C2 - 2) * 16);
const clampZoom = (z) => clamp(z, zmin(), 64);
function wantSizes() {
  const span = Math.max(cv.clientWidth, cv.clientHeight) / S.zoom;
  const w3 = clamp(Math.ceil(S.fill * span / 16) + 1, MIN3, MAX3);
  return [w3, clamp(Math.ceil(span / 16) + 2, w3, C2)];
}
function focus() {   // 窗口中心（世界 x,z）：侧视切片时沿视线轴取切片位置
  const a = axisOf(VIEWS[S.view].F);
  if (S.slice !== null && a === 0) return [S.slice, S.z];
  if (S.slice !== null && a === 2) return [S.x, S.slice];
  return [S.x, S.z];
}
// ---- 玩家跟随：平滑居中（ease）----
let panRAF = 0;
function stopPan() { if (panRAF) cancelAnimationFrame(panRAF); panRAF = 0; }
/** 把视图中心平滑挪到 (x,z)：easeInOutCubic，一帧一次 changed()（和拖地图同一条路，chunk 边走边补） */
function panTo(x, z, ms = 360) {
  stopPan();
  const x0 = S.x, z0 = S.z, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms), e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
    S.x = x0 + (x - x0) * e; S.z = z0 + (z - z0) * e; changed();
    panRAF = k < 1 ? requestAnimationFrame(step) : 0;
  };
  panRAF = requestAnimationFrame(step);
}
/** 世界点是否还在「跟随范围」里：细节绘制那条 slider 单独读，离视口中心超过 slider × 半个屏幕才跟随（1 = 到边缘） */
function in2dView(px, pz) {
  if (!store) return true;
  const v = VIEWS[S.view], [fx, fz] = focus(), dx = px - fx, dz = pz - fz, f = S.fill;
  return Math.abs(dx * v.R[0] + dz * v.R[2]) <= f * cv.clientWidth / 2 / S.zoom && Math.abs(dx * v.D[0] + dz * v.D[2]) <= f * cv.clientHeight / 2 / S.zoom;
}
function recenter(force) {
  if (!store) return;
  const [fx, fz] = focus(), cx = Math.floor(fx / 16), cz = Math.floor(fz / 16);
  let [w3, w2] = wantSizes();
  if (!force && store.w3 && w3 < store.w3 && w3 > store.w3 * 0.7) w3 = store.w3;   // 缩小留滞回，免得滚轮来回丢块
  if (!force && store.w2 && w2 < store.w2 && w2 > store.w2 * 0.7) w2 = Math.max(w2, Math.min(store.w2, C2));
  w2 = Math.max(w2, w3);
  if (!force && wc && Math.abs(cx - wc[0]) < 3 && Math.abs(cz - wc[1]) < 3 && w3 === store.w3 && w2 === store.w2) return;
  wc = [cx, cz];
  if (w3 > R.W) {   // 3D 环长大：重分配，已载入的块全部重传
    R.alloc(Math.min(MAX3, Math.ceil(w3 / 8) * 8), H);
    for (const r of store.map.values()) dirty3.add(r);
  }
  const { drop3 } = store.center(cx, cz, w3, w2);
  for (const r of drop3) R.setSlot(((r.cx % R.W) + R.W) % R.W, ((r.cz % R.W) + R.W) % R.W, 0, 0, 0);
  for (const k of busy) { const [x, z] = k.slice(1).split(',').map(Number); if (k[0] === 'g' ? !store.inWin(x, z) : !store.inWin2(x, z)) busy.delete(k); }
  ({ n3, n2 } = store.missing(cx, cz, busy));
  if ((n3.length || n2.length) && st.t1) { st.t1 = 0; st.t0 = performance.now(); st.pn = 0; }
  pump();
}
function pump() {
  if (!pool || !store) return;
  const g = pool.gen;
  while (n3.length) {
    const [cx, cz] = n3[0], k = key(cx, cz);
    if (!store.inWin(cx, cz) || store.map.has(k) || busy.has('g' + k)) { n3.shift(); continue; }
    if (!pool.job('gen', { cx, cz }, (m) => got3(m, g), () => { busy.delete('g' + k); done(); })) return;
    busy.add('g' + k); n3.shift();
  }
  while (n2.length) {
    const [cx, cz] = n2[0], k = key(cx, cz);
    if (!store.inWin2(cx, cz) || store.inWin(cx, cz) || store.cols.has(k) || busy.has('c' + k)) { n2.shift(); continue; }
    if (!pool.job('col', { cx, cz, cls: store.cls }, (m) => got2(m, g), () => { busy.delete('c' + k); done(); })) return;
    busy.add('c' + k); n2.shift();
  }
}
function got3(m, g) {
  const k = key(m.cx, m.cz);
  busy.delete('g' + k);
  if (g !== pool.gen || !store.inWin(m.cx, m.cz)) return done();
  st.got++; st.pn++; st.wms += m.ms; st.clip += m.clip ?? 0;
  for (const r of store.put(m)) { dirty3.add(r); dirty2.add(key(r.cx, r.cz)); LY.dropChunk(r.cx, r.cz); }
  done();
}
function got2(m, g) {
  const k = key(m.cx, m.cz);
  busy.delete('c' + k);
  if (g === pool.gen && store.inWin2(m.cx, m.cz) && store.putCol(m)) { st.cols++; st.pn++; dirty2.add(k); LY.dropChunk(m.cx, m.cz); }
  done();
}
const idle = () => store && !n3.length && !n2.length && !busy.size;
function done() { if (idle() && !st.t1) { st.t1 = performance.now(); world(); } frame(); }

// ---- 视线轴范围与切片（V-12：地表模式也可调；null = 最外层） ----
let stTop = { k: '', v: -1 };
function surfTop() {   // 3D 窗口里所有列 heights 的最大值（按 store.rev 缓存）
  const k = store.rev + ':' + store.map.size;
  if (stTop.k !== k) { let m = -1; for (const r of store.map.values()) { const hs = r.heights; for (let c = 0; c < 256; c++) if (hs[c] > m) m = hs[c]; } stTop = { k, v: m }; }
  return stTop.v < 0 ? H - 1 : stTop.v;
}
function range() {
  const v = VIEWS[S.view], a = axisOf(v.F), dir = v.F[a];
  let lo, hi;
  if (a === 1) { lo = 0; hi = H - 1; } else { const w0 = store.win[a === 0 ? 0 : 1] * 16; lo = w0; hi = w0 + store.w3 * 16 - 1; }
  const outer = a === 1 && dir < 0 ? surfTop() : dir < 0 ? hi : lo, end = dir < 0 ? lo : hi;   // 俯视的「地表」= 切片 Y 取已载入块里地表最高点（不是窗口顶 H-1）
  let start = S.slice === null ? outer : clamp(S.slice, lo, hi);
  if (live() && play.axis === a && play.src === 'key' && S.sel && S.slice !== null) {   // 切片正好在选区远端（E 之后的长条）：从近端扫起，扫过整条
    const near = dir < 0 ? S.sel[a + 3] : S.sel[a], far = dir < 0 ? S.sel[a] : S.sel[a + 3];
    if (start === far && near !== far) start = clamp(near, lo, hi);
  }
  const base = start;
  if (live() && play.axis === a) start = clamp(start + dir * play.off, lo, hi);
  return { a, dir, start, base, end, lo, hi, outer };
}
const center3 = () => [S.x, S.y, S.z];
const mode = () => S.slice === null ? 'surface' : 'slice';
function setSlice(v) { const rg = range(); v = clamp(Math.round(v), rg.lo, rg.hi); S.slice = v === rg.outer ? null : v; changed(); }

function frame() { if (!frameReq) frameReq = requestAnimationFrame(() => { frameReq = 0; draw(); }); }
function viewParams(v, o) {
  const p = { F: v.F, R: v.R, D: v.D, shade: ['block', 'biome', 'height'].indexOf(S.shade), terr: S.terr, bmode: S.bio.length ? { only: 1, hl: 2, un: 3 }[S.bm] : 0, light: lightRGB(), sun: sunDir(), win: store.win, wa: store.w3, win2: store.win2, wa2: store.w2, sea: meta.sea ?? 62 };
  if (S.sel) p.inv = [...nearCell(S.sel), 1];
  const box = selA && hov ? [2, boxFrom(selA, hov.p)] : S.sel ? [1, S.sel] : null;
  if (box) Object.assign(p, { sel: box[0], selMin: box[1].slice(0, 3), selMax: box[1].slice(3) });
  return Object.assign(p, o);
}
function draw() {
  if (!store) return;
  readout();
  let n = 0;
  for (const r of dirty3) { if (store.map.get(key(r.cx, r.cz)) === r) R.upload(r); dirty3.delete(r); if (++n >= 48) break; }
  n = 0;
  for (const k of dirty2) { const c = store.cols.get(k); if (c) { const [x, z] = k.split(',').map(Number); R.uploadCol(x, z, c); } dirty2.delete(k); if (++n >= 600) break; }
  const k = dpr(), w = Math.round(cv.clientWidth * k), h = Math.round(cv.clientHeight * k);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const mp = !previewing && miniPlay(); if (mp) mini(mp);
  const v = VIEWS[S.view], rg = range();
  const clip = play && play.axis !== rg.a ? [play.axis, -play.sign, clipVal(), 1] : [0, 0, 0, 0];   // 压暗的是「已扫过」的那一侧（扫描方向的背后），所以符号取反
  const mk = hov?.r?.hit ?? hov?.r?.water;
  const e = R.draw(viewParams(v, { res: [w, h], center: center3(), zoom: S.zoom * k, start: rg.start, end: rg.end, air: S.air ? 1 : 0, xray: S.xray | 0, grid: S.grid, clip, mark: mk ? [...mk, 1] : [0, 0, 0, 0] }));
  if (e) errs.push(e);
  layerDraw(rg);
  ruler(); originMarks(); p1Mark(); bioTick(); sliceUI(rg); tlUI();
  if (dirty3.size || dirty2.size) frame();
  status();
  if (idle() && !dirty3.size && !dirty2.size && waiters.length) { const ws = waiters; waiters = []; ws.forEach(f => f()); }
}
// 图层叠加（layers.js）：只在俯视 / 仰视画；世界 x / z → 屏幕 px 复用 toScreen（含仰视的翻转）
function layerDraw(rg) {
  LY.id = S.layer; LY.op = S.lop;
  const a = planeAt(0, 0), b = planeAt(cv.clientWidth, cv.clientHeight);
  LY.draw({ store, pool, W: cv.clientWidth, H: cv.clientHeight, sx: (x) => toScreen(0, x, true), sz: (z) => toScreen(2, z, false), zoom: S.zoom,
    rect: [Math.floor(Math.min(a[0], b[0])), Math.floor(Math.min(a[2], b[2])), Math.ceil(Math.max(a[0], b[0])), Math.ceil(Math.max(a[2], b[2]))], on: rg.a === 1, onGot: () => { frame(); layerUI(); } });
}
const layerOn = () => S.layer !== 'none' && axisOf(VIEWS[S.view].F) === 1;
function layerUI() {   // ② 图层：chip 单选 + 不透明度 + 图例
  LY.id = S.layer; const box = $('lchips'), ls = LY.list(), sig = ls.map(l => l.id).join(',') + '|' + S.layer;
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig; box.innerHTML = '';
    for (const l of ls) { const b = document.createElement('button'); b.textContent = l.name; b.dataset.l = l.id; b.className = 'chip' + (l.id === S.layer ? ' on' : ''); b.title = l.id === 'none' ? '不叠加' : l.kind === 'cat' ? '按树种给树冠 / 树干着色' : `生成器 sample 的字段「${l.name}」热力图`; box.appendChild(b); }
  }
  $('lopr').value = S.lop; $('lopv').textContent = Math.round(S.lop * 100) + '%';
  $('lleg').innerHTML = (S.layer !== 'none' && axisOf(VIEWS[S.view].F) !== 1 ? '<span class="dim">（只在俯视 / 仰视画）</span>' : '') + LY.legend(store);
}
function setLayer(id) { if (id !== 'none' && !LY.valid(id) && LY.fields.length) throw new Error('layer ∈ ' + LY.list().map(l => l.id).join(' ')); S.layer = id; changed(); }
// 有选区时，小图 / 扫描线都「关于选区」：剖面过选区中心；扫描线从选区在悬停轴上的近端（朝向悬停端点的那一侧）起，向里走 N 层（不限于选区范围，超出继续走满 N 层）；没有选区时用视口中心
const focusPt = () => S.sel ? [(S.sel[0] + S.sel[3] + 1) / 2, (S.sel[1] + S.sel[4] + 1) / 2, (S.sel[2] + S.sel[5] + 1) / 2] : center3();
// 扫描线位置：悬停 +X 端点 = 向 +X 扫（俯视：X+ 向右、Z+ 向下，−端点反向，其它视角同理）；从选区在该轴上背向悬停端点的那条边起（没有选区 = 视口中心），每层走一格
const clipVal = (pl = play) => (S.sel ? (pl.sign > 0 ? S.sel[pl.axis] : S.sel[pl.axis + 3]) : Math.round(center3()[pl.axis])) + pl.sign * pl.off;
// 小图用的「播放态」：快放中 = play；小图常驻（minip）且没在快放 = 沿主视线轴的静态剖面（无扫描线）
const miniPlay = () => play ?? (S.minip && store ? { axis: axisOf(VIEWS[S.view].F), sign: -VIEWS[S.view].F[axisOf(VIEWS[S.view].F)], off: 0 } : null);

// ---- 快放小图（V-11）：画「另一个方向」的剖面，标主视图切面 / 扫描线 / 光标 / 选区 ----
function miniSpec(pl) {
  const a = axisOf(VIEWS[S.view].F), s = pl.axis;
  const t = s !== a ? 3 - a - s : (a === 1 ? 2 : 1);           // 小图视线轴：同时含主视线轴与扫描轴的平面的法向
  const view = t === 1 ? 'top' : t === 0 ? 'east' : 'south', v = VIEWS[view];
  const span = store.w3 * 16, cw = $('mini').clientWidth || 278, ch = $('mini').clientHeight || 178;
  const zoom = t === 1 ? Math.min(cw, ch) / span : cw / span;   // 侧视小图：宽度铺满 3D 窗口，竖直以中心列地表为中心
  const c = focusPt(); if (t !== 1) c[1] = clamp(S.sel ? c[1] : mapY() + 8, ch / 2 / zoom, H - ch / 2 / zoom);
  let start, end;
  if (t === 1) { start = H - 1; end = 0; }
  else { const w0 = store.win[t === 0 ? 0 : 1] * 16, lo = w0, hi = w0 + span - 1; start = clamp(Math.round(c[t]), lo, hi); end = v.F[t] < 0 ? lo : hi; }
  return { a, s, t, view, v, zoom, c, start, end, cw, ch };
}
function mini(pl) {
  const m = miniSpec(pl), k = dpr();
  const g = blitMini((mw, mh) => viewParams(m.v, { inv: [0, 0, 0, 0], vp: [0, 0], res: [mw, mh], center: m.c, zoom: m.zoom * k, start: m.start, end: m.end, air: 0, grid: false, clip: [0, 0, 0, 0], mark: [0, 0, 0, 0] }), m.cw, m.ch);
  const X = (w, ax) => m.cw / 2 + (w - m.c[ax]) * m.v.R[ax] * m.zoom, Y = (w, ax) => m.ch / 2 + (w - m.c[ax]) * m.v.D[ax] * m.zoom;
  const ra = axisOf(m.v.R), da = axisOf(m.v.D);
  const line = (ax, w, col, dash) => {   // 轴 ax 上 w 处的线（ax 必是小图的屏幕轴之一）
    g.strokeStyle = col; g.lineWidth = 1.5; g.setLineDash(dash ?? []); g.beginPath();
    if (ax === ra) { const x = clamp(X(w, ax), 1, m.cw - 1); g.moveTo(x, 0); g.lineTo(x, m.ch); } else { const y = clamp(Y(w, ax), 1, m.ch - 1); g.moveTo(0, y); g.lineTo(m.cw, y); }   // 出界的线贴边画
    g.stroke(); g.setLineDash([]);
  };
  const rg = range();
  line(m.a, rg.start + 0.5, '#4de3ff');                                           // 主视图当前切面（含快放偏移）
  if (m.s !== m.a) line(m.s, clipVal(pl), '#ffd84a', [4, 3]);                       // 扫描线
  if (S.sel) { const b = S.sel; g.strokeStyle = '#fff'; g.lineWidth = 1; const x0 = X(b[ra], ra), x1 = X(b[ra + 3] + 1, ra), y0 = Y(b[da], da), y1 = Y(b[da + 3] + 1, da); g.strokeRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); }
  const hp = hov?.p;
  if (hp) { const x = X(hp[ra] + 0.5, ra), y = Y(hp[da] + 0.5, da); g.strokeStyle = '#ff4fd8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.moveTo(x, y - 5); g.lineTo(x, y + 5); g.stroke(); }
  $('minik').innerHTML = `${m.v.name}${m.t === 1 ? '（地表）' : ` 剖面 @ ${AXN[m.t]} = ${m.start}`}\n<span style="color:#4de3ff">━</span> 主视图切面 ${AXN[m.a]} ${rg.start}` +
    (m.s !== m.a ? `   <span style="color:#ffd84a">┅</span> 扫描 ${AXN[m.s]} ${clipVal(pl)}` : '') + `\n<span style="color:#ff4fd8">+</span> 光标   <span style="color:#fff">□</span> 选区`;
}

// ---- 时间 / 光色覆盖（reference-vision/ui/time-and-biome-picker.png 的圆环拨盘）：ring 上顶 = 正午、底 = 子夜、两侧 = 日出 / 日落 ----
// tod = 小时（0…24，null = 不覆盖）；lcol = 光色 #rrggbb（null = 随时间）。二者只乘到地图着色上，并带着太阳方向进 2.5D 地形
function parseTerr(v) { return v === true ? 1 : v === false || v == null || v === '' ? 0 : [0, 1, 2].includes(+v) ? +v : 0; }
function parseTod(v) { if (v == null || v === '' || Number.isNaN(+v)) return null; return ((+v % 24) + 24) % 24; }
const SKY = [[0, [0.04, 0.04, 0.13]], [4, [0.1, 0.1, 0.23]], [5.5, [0.42, 0.23, 0.35]], [6.5, [0.88, 0.45, 0.24]], [8, [0.56, 0.71, 0.94]], [12, [0.48, 0.65, 1]], [16, [0.56, 0.71, 0.94]], [17.5, [0.88, 0.45, 0.24]], [18.5, [0.42, 0.23, 0.35]], [20, [0.1, 0.1, 0.23]], [24, [0.04, 0.04, 0.13]]];
const SUNC = [[0, [0.28, 0.32, 0.55]], [5, [0.4, 0.4, 0.65]], [6.5, [1, 0.62, 0.38]], [8, [1, 0.92, 0.8]], [12, [1, 1, 1]], [16, [1, 0.96, 0.88]], [17.5, [1, 0.65, 0.4]], [19, [0.45, 0.42, 0.65]], [21, [0.28, 0.32, 0.55]], [24, [0.28, 0.32, 0.55]]];
function ramp(tab, t) { for (let i = 1; i < tab.length; i++) if (t <= tab[i][0]) { const [t0, a] = tab[i - 1], [t1, b] = tab[i], k = (t - t0) / (t1 - t0); return a.map((v, j) => v + (b[j] - v) * k); } return tab[tab.length - 1][1]; }
const hex2 = (c) => '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
const lightRGB = () => S.lcol ? [1, 3, 5].map(i => parseInt(S.lcol.slice(i - 1, i + 1), 16) / 255) : S.tod !== null ? ramp(SUNC, S.tod) : undefined;
function sunDir() {   // 东（6 时）→ 头顶（12 时）→ 西（18 时）；夜里照月亮的轨迹；z 固定偏北，让光仍从屏幕上方来
  if (S.tod === null) return undefined;
  const t = S.tod, a = t >= 6 && t <= 18 ? (t - 6) / 12 * Math.PI : ((t < 6 ? t + 24 : t) - 18) / 12 * Math.PI, v = [Math.cos(a), 0.25 + 0.75 * Math.abs(Math.sin(a)), -0.5], n = Math.hypot(...v);
  return v.map(x => x / n);
}
const todText = (t) => { const m = Math.round(t * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const dialCol = () => hex2(S.lcol ? lightRGB() : S.tod !== null ? ramp(SUNC, S.tod) : [1, 1, 1]);
const dialOpen = () => $('dial').style.display === 'block';
function toggleDial(on = !dialOpen()) { $('dial').style.display = on ? 'block' : 'none'; $('dbtn').classList.toggle('on', on); if (on) dialUI(); }
function dialUI() {   // 圆环 + 手柄 + 中心时间；也刷新 ② 里的摘要
  const st = S.tod === null && !S.lcol ? '默认' : (S.tod !== null ? todText(S.tod) : '随时间') + (S.lcol ? ' · #' + S.lcol : '');
  $('dst').textContent = st; $('dtime').textContent = S.tod !== null ? todText(S.tod) : '默认'; $('dcol').value = dialCol();
  if (!dialOpen()) return;
  const c = $('dring'), k = dpr(), N = 240, px = Math.round(N * k); if (c.width !== px || c.height !== px) c.width = c.height = px;   // 宽高都要比：默认 300×150 在 dpr 1.25 时宽恰好相等，高留在 150 被拉伸
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, N, N);
  const gr = g.createConicGradient(Math.PI / 2, N / 2, N / 2); for (const [t, col] of SKY) gr.addColorStop(t / 24, hex2(col));
  g.lineWidth = 36; g.strokeStyle = gr; g.beginPath(); g.arc(N / 2, N / 2, 98, 0, 7); g.stroke();
  if (S.tod !== null) { const th = S.tod / 24 * 2 * Math.PI, x = N / 2 - Math.sin(th) * 98, y = N / 2 + Math.cos(th) * 98; g.beginPath(); g.arc(x, y, 10, 0, 7); g.fillStyle = dialCol(); g.fill(); g.lineWidth = 3; g.strokeStyle = '#fff'; g.stroke(); g.lineWidth = 1; g.strokeStyle = '#000a'; g.stroke(); }
}
{
  const ring = $('dring'); let drag = false;
  const at = (e) => { const r = ring.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return [Math.hypot(x, y) / (r.width / 240), Math.atan2(-x, y)]; };   // atan2(−x, y)：底 = 0、顺时针（经左侧）增大 → 与 θ = t/24·2π 同向
  const setT = (e) => { const [, th] = at(e); S.tod = Math.round(((th / (2 * Math.PI) * 24 + 24) % 24) * 12) / 12; changed(); };   // 5 分钟一格
  ring.addEventListener('pointerdown', (e) => { const [d] = at(e); if (d < 78 || d > 122) return; e.preventDefault(); drag = true; ring.setPointerCapture(e.pointerId); setT(e); });
  ring.addEventListener('pointermove', (e) => { if (drag) setT(e); });
  ring.addEventListener('pointerup', () => { drag = false; });
  $('dbtn').onclick = () => toggleDial();
  $('dbrush').onclick = () => $('dcol').click();
  $('dcol').oninput = () => { S.lcol = $('dcol').value.slice(1).toLowerCase(); changed(); };
  $('dundo').onclick = () => { S.tod = null; S.lcol = null; changed(); };
}
// ---- 群系 finder（Cubiomes Viewer 式）：选中集 S.bio（群系 id 数组）+ 模式 S.bm（只显示 / 高亮显示 / 取消高亮）；着色器按 2D 列的群系 id 查 256×1 掩码 ----
// 网格（参考 time-and-biome-picker.png）：左键 = 单选（再点唯一选中的 = 清空），右键 = 多选开关，「Erase」= 清空
function parseBio(v) { return [...new Set(String(v ?? '').split(',').filter(x => x !== '' && !Number.isNaN(+x)).map(Number).filter(i => i >= 0 && i < 256))].sort((a, b) => a - b); }
let bioN = -1, bioT = 0, bioMaskSig = '', bioCnt = null;
function bioTick() { if (S.lay && store && store.cols.size !== bioN) { bioN = store.cols.size; clearTimeout(bioT); bioT = setTimeout(() => { bioCount(); bioUI(); }, 300); } }
function bioCount() { const n = new Map(); let tot = 0; if (store) for (const a of store.cols.values()) for (let c = 0; c < 256; c++) { const b = a[c * 4 + 2]; n.set(b, (n.get(b) ?? 0) + 1); tot++; } bioCnt = { n, tot }; }
const bioName = (n, i) => n ?? '#' + i;
function bioUI() {
  if (!meta || !R.tBsel) return;
  const sig = S.bio.join(','); if (sig !== bioMaskSig) { bioMaskSig = sig; R.bmask(S.bio); }
  if (!S.lay) return;
  const names = meta.biomes ?? [], box = $('bgrid'), bsig = meta.id + '|' + names.length;
  if (box.dataset.sig !== bsig) {
    box.dataset.sig = bsig; const lut = biomeLUT(meta), esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    box.innerHTML = '<div class="bc erase" title="清空选择；右键点群系格 = 多选开关"><i></i><span>清空/右多选</span></div>' + names.map((n, i) => n == null ? '' :
      `<div class="bc" data-b="${i}" title="${esc(n)}"><i style="background:rgb(${lut[i * 4]},${lut[i * 4 + 1]},${lut[i * 4 + 2]})"></i><span>${esc(String(n).replace(/^minecraft:/, '').replace(/_/g, ' '))}</span><em></em></div>`).join('');
    bioCnt = null;
  }
  if (!bioCnt && store) bioCount();
  let part = 0;
  for (const el of box.children) {
    if (el.dataset.b === undefined) continue;
    const b = +el.dataset.b, k = bioCnt?.n.get(b) ?? 0, pct = bioCnt?.tot ? 100 * k / bioCnt.tot : 0, on = S.bio.includes(b);
    el.classList.toggle('on', on); el.classList.toggle('z', !k); el.querySelector('em').textContent = k ? (pct >= 0.1 ? pct.toFixed(pct < 10 ? 1 : 0) : '<0.1') + '%' : '';
    if (on) part += pct;
  }
  $('bsum').textContent = S.bio.length ? `${S.bio.length} 个 · 窗口内 ${part.toFixed(1)}%` : '';
}
{
  const pick = (e) => e.target.closest('.bc');
  $('bgrid').addEventListener('click', (e) => { const c = pick(e); if (!c) return; if (c.dataset.b === undefined) S.bio = []; else { const b = +c.dataset.b, clear = S.bio.length === 1 && S.bio[0] === b; S.bio = clear ? [] : [b]; if (!clear && bioLocate(b) === null) bioSearch(b); } changed(); });
  $('bgrid').addEventListener('contextmenu', (e) => { e.preventDefault(); const c = pick(e); if (!c || c.dataset.b === undefined) return; const b = +c.dataset.b; S.bio = S.bio.includes(b) ? S.bio.filter(x => x !== b) : [...S.bio, b].sort((x, y) => x - y); changed(); });
  $('bmode').onchange = () => { S.bm = $('bmode').value; changed(); };
}
// 单选一个群系时：屏幕里没有它就把视口中心挪到离中心最近的那一格（只查已载入的 2D 列；窗口里也没有 = 提示）
function bioLocate(b) {
  if (!store) return false;
  const top = axisOf(VIEWS[S.view].F) === 1, a = planeAt(0, 0), e = planeAt(cv.clientWidth, cv.clientHeight), x0 = Math.min(a[0], e[0]), x1 = Math.max(a[0], e[0]), z0 = Math.min(a[2], e[2]), z1 = Math.max(a[2], e[2]), side = VIEWS[S.view].R[0] !== 0 ? 0 : 2;
  let best = null, bd = Infinity;
  for (const [k, arr] of store.cols) {
    const [cx, cz] = k.split(',').map(Number);
    for (let c = 0; c < 256; c++) {
      if (arr[c * 4 + 2] !== b) continue;
      const x = cx * 16 + (c & 15), z = cz * 16 + (c >> 4);
      if (top ? x + 1 > x0 && x < x1 && z + 1 > z0 && z < z1 : side === 0 ? x + 1 > x0 && x < x1 : z + 1 > z0 && z < z1) return false;   // 屏幕里已经有
      const d = (x + 0.5 - S.x) ** 2 + (z + 0.5 - S.z) ** 2; if (d < bd) { bd = d; best = [x, z]; }
    }
  }
  const nm = (meta.biomes?.[b] ?? '#' + b).replace(/^minecraft:/, '');
  if (!best) return null;   // 已载入范围里没有：交给 bioSearch
  S.x = best[0] + 0.5; S.z = best[1] + 0.5; toast(`定位到最近的 ${nm} @${best[0]},${best[1]}`); return true;
}
// 已载入范围里没有：沿方块环向外扫生成器（`bfind` 动词，每块 32×32 个点、步长 16 格 = 512 格见方），多 worker 并行，按环从近到远，第一个有命中的环里取离中心最近的点。
// 每搜 3 秒停下问一次「继续找？」（[继续] / [停止] / Esc），不会无限转；最远 48 环（约 2.4 万格）
let bs = null, bsTok = 0;
const BS = { T: 32, STEP: 16, RMAX: 48, SLICE: 3000 };
function bioStop() { bsTok++; if (bs?.ask) bs.ask(false); bs = null; $('bfind').classList.remove('on'); }
function bsUI(html, btns) {
  const el = $('bfind'); el.innerHTML = `<span>${html}</span>` + btns.map(([id, t]) => `<button data-a="${id}">${t}</button>`).join(''); el.classList.add('on');
  el.onclick = (e) => { const a = e.target.dataset?.a; if (a === 'go') bs?.ask?.(true); else if (a === 'stop') bioStop(); };
}
async function bioSearch(b) {
  bioStop(); if (!pool || !meta) return null;
  const tok = ++bsTok, TILE = BS.T * BS.STEP, want = { id: b, name: meta.biomes?.[b] }, nm = String(want.name ?? '#' + b).replace(/^minecraft:/, '');
  const tx0 = Math.floor(S.x / TILE), tz0 = Math.floor(S.z / TILE), t0 = performance.now(), me = bs = { b, ask: null };
  let slice0 = t0, spent = 0, tiles = 0, ring = 0, found = null;
  const alive = () => tok === bsTok && S.bio.length === 1 && S.bio[0] === b;
  const ringTiles = (r) => { const o = []; if (!r) return [[0, 0]]; for (let d = -r; d <= r; d++) o.push([d, -r], [d, r]); for (let d = -r + 1; d < r; d++) o.push([-r, d], [r, d]); return o; };
  for (; ring <= BS.RMAX && alive() && !found; ring++) {
    const list = ringTiles(ring), hits = [];
    for (let i = 0; i < list.length && alive(); i += pool.n) {
      const batch = list.slice(i, i + pool.n);
      const rs = await Promise.all(batch.map(([dx, dz], k) => pool.call('bfind', { x0: (tx0 + dx) * TILE, z0: (tz0 + dz) * TILE, n: BS.T, step: BS.STEP, want }, k).catch(() => null)));
      for (const r of rs) if (r) for (let j = 0; j < r.hits.length; j += 2) hits.push([r.hits[j], r.hits[j + 1]]);
      tiles += batch.length;
      if (alive()) bsUI(`正在找 <b>${nm}</b> … 半径 ${(ring + 1) * TILE / 2 | 0} 格 · ${((performance.now() - slice0 + spent) / 1000).toFixed(1)} s`, [['stop', '停止 (Esc)']]);
      if (alive() && !hits.length && performance.now() - slice0 >= BS.SLICE) {   // 3 秒到：问一次
        spent += performance.now() - slice0;
        bsUI(`已找 ${(spent / 1000).toFixed(0)} s（半径约 ${(ring + 1) * TILE / 2 | 0} 格，${tiles * BS.T * BS.T} 个采样点）仍未找到 <b>${nm}</b>。继续找？`, [['go', '继续'], ['stop', '停止']]);
        const go = await new Promise(r => { me.ask = r; });
        me.ask = null; slice0 = performance.now();
        if (!go || !alive()) { bioStop(); toast(`已停止，没找到 ${nm}`); return null; }
      }
    }
    if (hits.length && alive()) { let bd = Infinity; for (const [x, z] of hits) { const d = (x - S.x) ** 2 + (z - S.z) ** 2; if (d < bd) { bd = d; found = [x, z]; } } }
  }
  if (tok !== bsTok) return null;
  bioStop();
  if (!found) { toast(`半径 ${BS.RMAX * TILE / 2} 格内没找到 ${nm}`); return null; }
  S.x = found[0] + 0.5; S.z = found[1] + 0.5; changed();
  toast(`找到 ${nm} @${found[0]},${found[1]}（距原中心 ${Math.round(Math.hypot(found[0] - tx0 * TILE, found[1] - tz0 * TILE))} 格，用时 ${((performance.now() - t0) / 1000).toFixed(1)} s）`, 3000);
  return found;
}
// 世界格 (x, z) 的中心 → 地图 CSS px [px, py]；只在俯视 / 仰视有意义，其他视角或落在地图外返回 null
function xz2scr(x, z) {
  if (!store || axisOf(VIEWS[S.view].F) !== 1) return null;
  const px = toScreen(0, x + 0.5, true), py = toScreen(2, z + 0.5, false);
  return px < 0 || py < 0 || px > cv.clientWidth || py > cv.clientHeight ? null : [px, py];
}
// 原点叠加（画在 #rul 上，ruler() 已清过）：路径 = 按列表顺序连黄色虚线；文字 = 原点名放在格上
const pathLen = () => { let d = 0; for (let i = 1; i < S.origins.length; i++) d += Math.hypot(S.origins[i].x - S.origins[i - 1].x, S.origins[i].z - S.origins[i - 1].z); return Math.round(d); };
function originMarks() {
  if (!S.otext && !S.opath || !store || axisOf(VIEWS[S.view].F) !== 1) return;
  const c = $('rul'), g = c.getContext('2d'), os = S.origins;
  if (S.opath && os.length > 1) {   // 线段两端有一端在屏内才画（不用 xz2scr 的 null：线段可以穿过屏幕）
    const P = (o) => [toScreen(0, o.x + 0.5, true), toScreen(2, o.z + 0.5, false)];
    g.save(); g.strokeStyle = '#ffd84a'; g.lineWidth = 2; g.setLineDash([8, 5]); g.beginPath();
    os.forEach((o, i) => { const [x, y] = P(o); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.restore();
  }
  if (S.opath) { g.fillStyle = '#ffd84a'; for (const o of os) { const q = xz2scr(o.x, o.z); if (q) { g.beginPath(); g.arc(q[0], q[1], 3, 0, 7); g.fill(); } } }
  if (S.otext) {
    g.save(); g.font = '12px ui-monospace, monospace'; g.textBaseline = 'bottom'; g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = '#000c'; g.fillStyle = '#fff';
    for (const o of os) { const q = xz2scr(o.x, o.z); if (!q) continue; g.strokeText(o.n, q[0] + 5, q[1] - 3); g.fillText(o.n, q[0] + 5, q[1] - 3); g.fillRect(q[0] - 1.5, q[1] - 1.5, 3, 3); }
    g.restore();
  }
}

// 游戏玩家 P1 标记（连着游戏时画；任意视角）：圆点 + "P1" + 朝向短线（水平朝向投到屏幕上）
function p1Mark() {
  if (!store || !gameLive() || !peer.p1 || peer.g !== S.g || String(peer.seed) !== String(S.seed)) return;
  const [wx, wz, wy, yaw] = peer.p1, v = VIEWS[S.view], c = center3(), w = [wx + 0.5, wy + 1, wz + 0.5];
  const sc = (q, d) => (d === 0 ? cv.clientWidth : cv.clientHeight) / 2 + [0, 1, 2].reduce((a, i) => a + (q[i] - c[i]) * (d === 0 ? v.R[i] : v.D[i]), 0) * S.zoom;
  const x = sc(w, 0), y = sc(w, 1), g = $('rul').getContext('2d');
  const fx = -Math.sin(yaw ?? 0), fz = -Math.cos(yaw ?? 0), ex = (fx * v.R[0] + fz * v.R[2]) * 14, ey = (fx * v.D[0] + fz * v.D[2]) * 14;
  g.save(); g.lineWidth = 3; g.lineJoin = 'round'; g.font = 'bold 12px ui-monospace, monospace'; g.textBaseline = 'bottom';
  g.strokeStyle = '#000c'; g.fillStyle = '#ff3a6e'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.stroke(); g.fill();
  if (yaw !== undefined) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + ex, y + ey); g.strokeStyle = '#000c'; g.lineWidth = 4; g.stroke(); g.strokeStyle = '#ff3a6e'; g.lineWidth = 2; g.stroke(); }
  g.lineWidth = 3; g.strokeStyle = '#000c'; g.fillStyle = '#fff'; g.strokeText('P1', x + 7, y - 4); g.fillText('P1', x + 7, y - 4);
  if (peer.xhair) {   // 准星落点（旧 hit）：青色十字 + 到 P1 的细线
    const q = [peer.xhair[0] + 0.5, peer.xhair[1] + 0.5, peer.xhair[2] + 0.5], hx = sc(q, 0), hy = sc(q, 1);
    g.strokeStyle = '#4ae0ff88'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = '#000c'; g.lineWidth = 4; g.beginPath(); g.moveTo(hx - 5, hy); g.lineTo(hx + 5, hy); g.moveTo(hx, hy - 5); g.lineTo(hx, hy + 5); g.stroke();
    g.strokeStyle = '#4ae0ff'; g.lineWidth = 2; g.stroke();
  }
  g.restore();
}

// ---- y 刻度（侧视，左缘）：按 meta.h / meta.sea，liq 另标原生 y ----
function ruler() {
  const c = $('rul'), w = c.clientWidth, h = c.clientHeight, k = dpr();
  if (c.width !== Math.round(w * k) || c.height !== Math.round(h * k)) { c.width = Math.round(w * k); c.height = Math.round(h * k); }
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, w, h);
  if (axisOf(VIEWS[S.view].F) === 1) return;
  const sy = (y) => h / 2 - (y + 0.5 - S.y) * S.zoom, step = S.zoom >= 6 ? 8 : S.zoom >= 2 ? 16 : 32;
  g.font = '11px ui-monospace, monospace'; g.textBaseline = 'middle';
  g.fillStyle = '#000a'; g.fillRect(0, Math.max(0, sy(H - 1) - 8), meta.y0 !== undefined ? 76 : 40, Math.min(h, sy(0) + 8) - Math.max(0, sy(H - 1) - 8));
  for (let y = 0; y < H; y += step) { const p = sy(y); if (p < -10 || p > h + 10) continue; g.fillStyle = '#9aa'; g.fillRect(0, p, 5, 1); g.fillText(String(y).padStart(3) + (meta.y0 !== undefined ? ` (${y + meta.y0})` : ''), 7, p); }
  const p = sy(meta.sea ?? 62); g.fillStyle = '#5aa0ff'; g.fillRect(0, p, w, 1); g.fillText('海 ' + meta.sea, (meta.y0 !== undefined ? 80 : 44), p - 7);
}

// ---- 状态行与 ① ----
function status() {   // 单行；各段 title = 完整文本（被省略号截断时悬停可看）
  if (!store) return;
  const wall = st.t1 && st.pn ? (st.t1 - st.t0) / st.pn : 0;
  $('s1').innerHTML = `3D <b>${store.map.size}/${store.w3 ** 2}</b> 块 · 2D <b>${store.cols.size}/${store.w2 ** 2}</b>`;
  $('s2').innerHTML = st.got ? `<b>${(st.wms / st.got).toFixed(1)}</b> ms/块` : '';
  $('s3').textContent = `池 ${pool?.n ?? 0} · 代 ${pool?.gen ?? 0}` + (st.clip ? ` · 裁剪 ${st.clip} 格` : '') + (hasOrigin() ? ` · 原点偏移 ${S.origin.join(',')}` : '') + (copied ? ` · 已复制 ${copied.slice(0, 48)}` : '');
  $('s5').textContent = busy.size ? `在途 ${busy.size}` : '';
  $('s4').innerHTML = errs.length ? `<span class="bad">错误 ${errs.length}</span>` : '';
  for (const id of ['s1', 's2', 's2b', 's3', 's4', 's5']) $(id).title = $(id).textContent;
}
function world() {
  if (!meta) return;
  const bh = new Map(), bset = new Set(); let cols = 0, hs = 0, hmin = 1e9, hmax = -1e9;
  for (const a of store.cols.values()) for (let c = 0; c < 256; c++) { const b = a[c * 4 + 2], h = a[c * 4 + 1] + a[c * 4 + 3]; bh.set(b, (bh.get(b) ?? 0) + 1); bset.add(b); cols++; hs += h; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  const top = [...bh].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([b, n]) => `  ${(100 * n / cols).toFixed(1).padStart(5)}%  ${meta.biomes?.[b] ?? b}`).join('\n');
  $('wsum').textContent = `${meta.id} · 地表y ${cols ? hmin + '…' + hmax : '—'} 群系 ${bset.size}`;
  $('w1').innerHTML = hasOrigin() ? `原点偏移 <b>${S.origin.join(', ')}</b>（x, z；URL origin=）` : '';
  $('wkv').textContent = `生成器  ${meta.id} v${meta.ver}  ${poolUrl.replace(location.origin, '')}\n海平面  ${meta.sea}   高 ${H}${meta.layout ? '   布局 ' + meta.layout : ''}${meta.y0 !== undefined ? '   原生 y0 ' + meta.y0 : ''}\n方块名  ${meta.names?.filter(Boolean).length}   群系 ${meta.biomes?.length}\n3D 窗口 ${store.w3}² 块 @ ${store.win.join(',')}\n2D 外圈 ${store.w2}² 块 @ ${store.win2.join(',')}\n` +
    (cols ? `均高 ${(hs / cols).toFixed(1)}\n群系占比（2D 范围）\n${top}` : '');
}

// ---- UI 同步 ----
function syncUI() {
  $('seed').value = S.seed; $('gsel').value = /^(mini|gp|liq|old|pg1|luan0|luanV|veg)$/.test(S.g) ? S.g : ''; $('vsel').value = S.view; $('shsel').value = S.shade; $('cleg').style.display = S.shade === 'height' ? '' : 'none';
  $('rate').value = S.rate; $('minipc').checked = S.minip; $('otextc').checked = S.otext; $('terrsel').value = S.terr; dialUI(); $('side').classList.toggle('lay', S.lay); $('layb').classList.toggle('on', S.lay); $('bmode').value = S.bm; bioUI(); $('airc').checked = S.air; $('gridc').checked = S.grid;
  $('seld').value = S.seld; layerUI();
  $('fillr').value = S.fill; $('fillv').textContent = Math.round(S.fill * 100) + '%';
  $('zv').textContent = `${+S.zoom.toFixed(3)} px/格` + (S.air && S.zoom <= 22 ? '（> 22 才叠数字）' : '');
  const gb = $('game');
  gb.classList.remove('off'); gb.style.opacity = '';
  gb.title = S.g === 'mini'
    ? '在宿主 B 打开同种子世界，落在选区中心 / 悬停点 / 视图中心（创造飞行，一次性世界、不写存档）'
    : '在 gode 打开同种子 / 同生成器的世界，落在选区中心 / 悬停点 / 视图中心（飞行；侧视时朝向同视线）';
  if (store) sliceUI(range());
  $('sub').style.display = hasAgent() ? '' : 'none';
  selUI(); pinPanel(); readout(); url(); gizmo();
  if (store) { if (S.minip) { showMini(); if (!previewing && !play) frame(); } else if (!previewing && !play) $('minid').classList.remove('on'); }
}
function sliceUI(rg) {
  for (const b of $('modes').querySelectorAll('[data-m]')) b.classList.toggle('on', b.dataset.m === mode());
  const s = $('slr'); s.min = rg.lo; s.max = rg.hi; s.value = rg.start;
  $('sllab').textContent = '切片 ' + AXN[rg.a];
  $('slv').textContent = rg.start + (live() && play.axis === rg.a ? '▸' : '');
}
const sgn = (ax) => ax[0] === '+' ? ax.slice(1) : ax;
function urlParams(o = {}, live = false) {   // live = true：快照那组也取当前值（复制 / → Agent）
  const V = VIEWS[S.view], L = live ? snapVals() : snap;
  const p = new URLSearchParams({ g: S.g, seed: S.seed, pv: sgn(V.ax) + (S.slice !== null ? ':' + S.slice : ''), p1: `@${Math.round(S.x)},${Math.round(S.z)}` + (axisOf(V.F) !== 1 ? '^' + Math.round(S.y ?? 64) : ''), z: Math.round(S.zoom) });
  if (S.shade !== 'block') p.set('shade', S.shade); if (S.layer !== 'none') p.set('layer', S.layer);
  if (Object.keys(S.kw).length) p.set('kw', fmtKw(S.kw));
  if (L.fill !== 1) p.set('fill', L.fill); if (L.rate !== 7) p.set('rate', L.rate); if (L.minip) p.set('minip', 1); if (!L.otext) p.set('otext', 0); if (L.terr) p.set('terr', L.terr); if (L.lay) p.set('lay', 1); if (L.bio.length) p.set('bio', L.bio.join(',')); if (L.bm !== 'hl') p.set('bm', L.bm); if (L.tod !== null) p.set('tod', +L.tod.toFixed(2)); if (L.lcol) p.set('lcol', L.lcol); if (L.opath) p.set('opath', 1); if (L.air) p.set('air', 1); if (L.xray) p.set('xray', L.xray); if (L.lop !== 0.35) p.set('lop', L.lop);
  if (!L.grid) p.set('grid', 0); if (L.sel) p.set('sel', L.sel.join(','));
  if (L.origin[0] || L.origin[1]) p.set('origin', L.origin.join(',')); if (L.hit && L.sel && inBox(L.hit, L.sel)) p.set('hit', L.hit.join(','));
  if (L.pts && L.pts.length < 600) p.set('pts', L.pts);
  if (L.seld !== 16) p.set('seld', L.seld);
  for (const k in o) p.set(k, o[k]);
  return p;
}
let urlT = 0;
const qs = (p) => p.toString().replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%3B/g, ';').replace(/%40/g, '@').replace(/%5E/g, '^');   // 逗号 / 冒号 / @ ^ 不转义，URL 好读
function url() { clearTimeout(urlT); urlT = setTimeout(() => history.replaceState(null, '', '?' + qs(urlParams())), 100); }
function changed() { syncUI(); recenter(); frame(); }

// ---- 视角切换（150 ms 淡出旧图） ----
function setView(v) {
  if (!VIEWS[v] || v === S.view) return;
  if (play?.frozen && play.axis === axisOf(VIEWS[v].F)) stopPlay();   // 固定的剖面轴成了视线轴：没意义了
  const f = $('fade'); f.width = cv.width; f.height = cv.height;
  f.getContext('2d').drawImage(cv, 0, 0); f.style.transition = 'none'; f.style.opacity = 1;
  requestAnimationFrame(() => { f.style.transition = ''; f.style.opacity = 0; });
  fadeEnd = performance.now() + 200;
  const a0 = axisOf(VIEWS[S.view].F), a1 = axisOf(VIEWS[v].F);
  if (a0 === 1 && a1 !== 1) S.y = Math.round(mapY());                 // 俯视 → 侧视：屏幕中心放在中心列的地表附近
  if (a0 !== a1 && S.slice !== null) S.slice = Math.round(a1 === 1 ? S.y : a1 === 0 ? S.x : S.z);   // 切片换轴：过屏幕中心
  S.view = v;
  changed();
}
function mapY() { if (!store) return 64; const c = store.col(Math.floor(S.x), Math.floor(S.z)); return c ? Math.max(c.y + c.wd, meta.sea) : meta?.sea ?? 64; }

// ---- 屏幕 ↔ 世界 ----
function planeAt(px, py) {   // CSS 像素 → 世界点（视线轴分量 = 中心）
  const v = VIEWS[S.view], sx = (px - cv.clientWidth / 2) / S.zoom, sy = (py - cv.clientHeight / 2) / S.zoom, c = center3();
  return [0, 1, 2].map(i => c[i] + v.R[i] * sx + v.D[i] * sy);
}
const toScreen = (ax, w, isR) => { const v = VIEWS[S.view], c = center3(); return (isR ? cv.clientWidth : cv.clientHeight) / 2 + (w - c[ax]) * (isR ? v.R[ax] : v.D[ax]) * S.zoom; };
// 光标下：平面格、步进结果、代表点 p（3D 命中 / 水面 / 外圈地表 / 平面格）
function pick(px, py) {
  const rg = range(), w = planeAt(px, py), c = w.map(Math.floor); c[rg.a] = rg.start;
  const r = store.march(c, VIEWS[S.view].F, rg.end);
  let p = r.hit ?? r.water, d2 = null;
  if (!p && !r.known) { const col = store.col(c[0], c[2]); if (col && col.d2) { d2 = col; if (rg.a === 1) p = [c[0], Math.max(col.y, 0), c[2]]; } }
  return { px, py, c, r, d2, p: p ?? c.slice() };
}

// ---- 原点（V-15）：顶栏 X,Z、③ 坐标、复制出的 @x,z^y 默认相对原点；URL origin= 与内部状态都是绝对坐标 ----
const hasOrigin = () => S.origin[0] !== 0 || S.origin[1] !== 0;
const rel = (x, z) => [x - S.origin[0], z - S.origin[1]];
const atRel = (x, y, z) => { const [a, b] = rel(x, z); return `@${a},${b}^${y}`; };
const atAbs = (x, y, z) => `@${x},${z}^${y}`;

// ---- ③ 悬停 / 已选中的方块（V-10、V-13）：悬停全实时、无 sample；已选中按需取一次近端格的 sample（不防抖） ----
let biomeRGB = null;
function biomeCss(id) {   // 群系色（太暗的往白提亮，深色背景上看得清）
  biomeRGB ??= biomeLUT(meta); let [r, g, b] = [0, 1, 2].map(k => biomeRGB[id * 4 + k]); const lum = .299 * r + .587 * g + .114 * b;
  if (lum < 130) { const t = (130 - lum) / (255 - lum); [r, g, b] = [r, g, b].map(v => Math.round(v + (255 - v) * t)); }
  return `rgb(${r},${g},${b})`;
}
function blockInfo(p, r, d2, smp, hover) {   // hover = 悬停面板：不要绝对 / 区块行
  const [x, y, z] = p, col = store.col(x, z), v = d2 ? (d2.type || 0) : store.get(x, y, z);
  const nm = (t) => meta.names?.[t & 0xfff] ?? '#' + (t & 0xfff);
  const name = d2 ? (d2.type ? nm(d2.type) : d2.wd ? 'water' : '空气') : v < 0 ? '(未生成)' : !r ? (v > 0 ? nm(v) : '空气') : r.hit ? nm(v) : r.water ? nm(store.get(...p)) : '空气';
  const air = r && !d2 && r.known, wd = air ? r.wd : col?.wd;
  const head = `<b>${name}</b>${v > 0 && v >> 12 ? ' :' + (v >> 12) : ''}${d2 ? '   （外圈 2D：只有地表）' : ''}\n${atRel(x, y, z)}${meta.y0 !== undefined ? `   (liq y ${y + meta.y0})` : ''}`;
  const lines = [`<span class="bh" style="color:${col ? biomeCss(col.biome) : 'inherit'}">${head}</span>`,
    hasOrigin() && !hover ? `绝对    ${atAbs(x, y, z)}` : '',
    hover ? '' : `区块    ${x >> 4},${z >> 4}`,
    col ? `群系    ${meta.biomes?.[col.biome] ?? col.biome}` : '群系    —',
    col ? `高度    最高 ${col.h}${col.h !== col.y ? `  地表 ${col.y}` : ''}` : '',
    air || wd ? [air ? `空气距  ${r.hit || r.wd ? r.dist : '—'}` : '水深    ' + wd, air && wd ? `水深 ${wd}` : ''].filter(Boolean).join('   ') : ''];
  if (smp === undefined) return lines.filter(Boolean).join('\n');   // 悬停块不显示 sample
  const s = smp ? Object.entries(smp).map(([kk, vv]) => `  ${kk.padEnd(9)}${kk === 'biome' ? `${vv} ${meta.biomes?.[vv] ?? ''}` : vv}`).join('\n') : '  …';
  return lines.filter(Boolean).join('\n') + '\nsample\n' + s;
}
function hoverPanel() {   // 悬停：只放不需要采样的实时字段
  if (!hov || !store) return;
  $('hkv').innerHTML = blockInfo(hov.p, hov.r, hov.d2, undefined, true) + (layerOn() ? `\n图层    ${S.layer === 'tree' ? '树种' : S.layer.slice(2)}  ${LY.valueAt(store, hov.p[0], hov.p[2])}` : '');
}
let pinHtml = '';
function pinPanel() {   // ③ 已选中 = 当前选区的近端格
  if (!store) return;
  if (!S.sel) { $('pkv').textContent = '（左键点选一个区块）'; pinK = ''; pinHtml = ''; $('psamp').disabled = true; $('ppt').disabled = true; return; }
  const b = S.sel, p = nearCell(b), k = p[0] + ',' + p[2], col = store.col(p[0], p[2]), d2 = store.get(...p) < 0 && col && col.d2 ? col : null;
  if (k !== pinK && pool) { pinK = k; pinPend = true; pool.call('sample', { x: p[0], z: p[2] }).then(s => { if (pinK === k) { pinV = s; pinPend = false; pinPanel(); } }).catch(() => {}); }
  $('psamp').disabled = !pinV || pinPend; $('ppt').disabled = false;
  const html = blockInfo(p, null, d2, pinV);   // 新 sample 到之前沿用旧的（几十毫秒）：版面高度不跳，不闪
  if (html !== pinHtml) { pinHtml = html; $('pkv').innerHTML = html; }
}
// 左键 = 把选区设为：点到的格沿视线轴从命中点一直到窗口尽头的整条（俯视 = 从表面到底）；近端格（命中点）= ③ 已选中的代表格
function pinBox(p) {   // 以区块网格为单位：俯视 = 该区块 16×16 整列（沿视线到底）；侧视 = 16 对齐的区块宽 × 16 对齐的 section 高（沿视线到窗口边）
  const rg = range(), a = rg.a, v = VIEWS[S.view], b = [...p, ...p];
  for (const ax of [axisOf(v.R), axisOf(v.D)]) { const lo = Math.floor(p[ax] / 16) * 16; b[ax] = lo; b[ax + 3] = lo + 15; if (ax === 1) { b[1] = clamp(b[1], 0, H - 1); b[4] = clamp(b[4], 0, H - 1); } }
  if (S.view === 'top') b[1] = 0;   // 只有俯视：从命中点一路选到基岩层；其他视角沿视线只取 seld 层（从命中点往里数，不出窗口）
  else if (rg.dir < 0) b[a] = Math.max(rg.end, p[a] - S.seld + 1); else b[a + 3] = Math.min(rg.end, p[a] + S.seld - 1);
  return normSel(b);
}
const pinTop = (b) => { const a = axisOf(VIEWS[S.view].F), p = [b[0], b[1], b[2]]; if (VIEWS[S.view].F[a] < 0) p[a] = b[a + 3]; return p; };   // 近端格（随当前视角的视线方向）
const inBox = (p, b) => p && [0, 1, 2].every(i => p[i] >= b[i] && p[i] <= b[i + 3]);
const nearCell = (b) => inBox(S.hit, b) ? S.hit : pinTop(b);   // 反色标 / ③ 代表格：左键点中的那一格（选区被别的方式改过则取近端角）
function setSelCol(b, hit) { S.hit = hit ?? null; S.sel = b ? normSel((b.length === 3 ? [...b, ...b] : b).map(Math.round)) : null; selA = null; changed(); }
function readout() {   // 左下角：切片轴 + 切片位置，有选区再加 ⤧ +@宽,深^高（选区尺寸：x 格数, z 格数 ^ y 格数；俯视整块选区常是 16,16^…）
  if (!store) return;
  const rg = range(), b = S.sel, t = `${AXN[rg.a]} ${rg.start}` + (b ? ` ⤧ +@${b[3] - b[0] + 1},${b[5] - b[2] + 1}^${b[4] - b[1] + 1}` : '');
  if ($('read').textContent !== t) $('read').textContent = t;
}

// ---- ④ 选区（V-10、V-14）：右键一下 = 该格 × seld 深度；再右键一下把另一角并进来成矩形（深度居中于两角）；拖框边改 ----
function boxFrom(A, B) {
  const a = axisOf(VIEWS[S.view].F), b = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let lo = Math.min(A[i], B[i]), hi = Math.max(A[i], B[i]);
    if (i === a) {
      if (S.view === 'top') { lo = 0; hi = Math.max(A[i], B[i]); }   // 俯视：从两角里较高的表面一路到基岩层
      else { lo = Math.floor((A[i] + B[i]) / 2) - Math.floor(S.seld / 2); hi = lo + S.seld - 1; }   // 其他视角：深度 = 两角深度中点 ± seld/2（长度恒为 seld）
    }
    if (i === 1) { lo = clamp(lo, 0, H - 1); hi = clamp(hi, 0, H - 1); }
    b[i] = lo; b[i + 3] = hi;
  }
  return b;
}
function rightClick(p) {   // 第一下：清空现有选区并记待定角 A（只画预览）；第二下：A、B 成矩形（深度 = 两角中点 ± seld/2）
  if (selA) { S.sel = boxFrom(selA, p); selAB = { box: S.sel, A: selA, B: p }; selA = null; } else { S.sel = null; selA = p; }
  changed();
}
function edgeAt(px, py) {   // 光标附近的选区边 → { ax, hi }（hi = 是盒的 max 边）
  if (!S.sel) return null;
  const v = VIEWS[S.view], ra = axisOf(v.R), da = axisOf(v.D), b = S.sel;
  const xs = [toScreen(ra, b[ra], true), toScreen(ra, b[ra + 3] + 1, true)], ys = [toScreen(da, b[da], false), toScreen(da, b[da + 3] + 1, false)];
  const inY = py > Math.min(...ys) - 6 && py < Math.max(...ys) + 6, inX = px > Math.min(...xs) - 6 && px < Math.max(...xs) + 6;
  for (let i = 0; i < 2; i++) if (inY && Math.abs(px - xs[i]) < 6) return { ax: ra, hi: i === 1, cur: 'ew-resize' };
  for (let i = 0; i < 2; i++) if (inX && Math.abs(py - ys[i]) < 6) return { ax: da, hi: i === 1, cur: 'ns-resize' };
  return null;
}
const selRel = (b) => `${atRel(b[0], b[1], b[2])} ${atRel(b[3], b[4], b[5])}`;
const selAbs = (b) => `${atAbs(b[0], b[1], b[2])} ${atAbs(b[3], b[4], b[5])}`;
const originTag = () => hasOrigin() ? ` (origin ${S.origin.join(',')})` : '';   // 复制 / 粘贴同一套坐标系：相对原点；原点非 0,0 时末尾带标记，粘贴按标记还原
const selAt = (b) => selRel(b) + originTag();
function selUI() {
  const b = S.sel;
  $('skv').innerHTML = selA ? `角 A ${atRel(...selA)} —— 右键再点一下定角 B（Esc 取消；现有选区已清空）`
    : b ? `<b>${selRel(b)}</b>${hasOrigin() ? `\n绝对  ${selAbs(b)}` : ''}\n右键拖框边改范围；换视角补第三轴；Esc 清除`
    : '左键选区块；右键两下定矩形（俯视选到基岩，其他视角深度见 ②）；右键拖框边改范围；Esc 取消';
  for (const id of ['scp', 'sclr']) $(id).disabled = !b && !(selA && id === 'sclr');   // ⎘ URL / ⎘ gd 一直可用（pts、bio 等也在里面）
}
// 复制 URL / gd 时：先把 pts / sel / hit 快照成当前值并写进地址栏，再给出带它们的查询串
function shareQs() { Object.assign(snap, snapVals()); const s = qs(urlParams()); clearTimeout(urlT); history.replaceState(null, '', '?' + s); return s; }
const vizUrl = () => location.origin + location.pathname + '?' + shareQs();
// ---- 页面 → Agent（s12 §10）：gd 守护进程经 CDP 给页面装了 window.gdSend；没有它（普通浏览器）一切照旧 ----
const hasAgent = () => typeof window.gdSend === 'function';
const ctxOf = () => ({ g: S.g, seed: S.seed, view: S.view, x: Math.round(S.x), z: Math.round(S.z), zoom: +S.zoom.toFixed(3), slice: S.slice, kw: { ...S.kw }, origin: S.origin, href: location.pathname.replace(/^\//, '') + '?' + qs(urlParams({}, true)) });
function toAgent(kind, data = {}) {
  if (!hasAgent() || window.gdQuiet) return false;   // gdQuiet：gd check 期间，测试里点的复制不算用户的
  try { window.gdSend(JSON.stringify({ kind, ...data, ctx: ctxOf() })); return true; } catch (e) { cerr(e); return false; }
}
window.gdAck = (seq, listening, pending, kind) => toast((String(kind).startsWith('copy') ? '已复制 · ' : '') + `已通知 Agent #${seq}` + (listening ? '' : '（Agent 暂未在听，留在收件箱）'), 2600);
// 一键提交：选区 + 点列表 + 悬停 / 选中的点 + 选区统计（Agent 马上有数字可看）
async function buildSubmit(note) {
  const b = { note, sel: S.sel, selAt: S.sel ? selAt(S.sel) : undefined, hit: S.hit, origins: S.origins.map(o => ({ ...o })), originsText: S.origins.map(o => `${o.n} ${atTxt(o)}`).join('\n'), sample: pinPend ? undefined : pinV ?? undefined };
  if (S.sel && store) { try { b.stats = await regionStats(store, meta, S.sel, { sample: (x, z) => pool.call('sample', { x, z }) }); } catch (e) { b.statsErr = e.message; } }
  return b;
}
async function submitClick() {
  if (!hasAgent()) { toast('没有 Agent 挂在这个页面上（用 gd go 打开才有）'); return; }
  if (!S.sel && !S.origins.length && !S.hit) { toast('没有可提交的内容：先选区 / 点选 / 加原点'); return; }
  if (!toAgent('submit', await buildSubmit())) toast('提交失败');
}
function copy(t, kind = 'text') {
  copied = t; navigator.clipboard?.writeText(t).catch(() => {}); status();
  if (!toAgent('copy:' + kind, { text: t })) toast('已复制');
}
$('ppt').onclick = () => { if (!S.sel) return; const p = nearCell(S.sel); copy(atRel(p[0], p[1], p[2]) + originTag(), 'point'); };
$('psamp').onclick = () => { if (!S.sel || !pinV || pinPend) return; const p = nearCell(S.sel); copy(JSON.stringify({ at: atRel(p[0], p[1], p[2]) + originTag(), sample: pinV }), 'sample'); };
$('scp').onclick = () => S.sel && copy(selAt(S.sel), 'sel');
$('ssub').onclick = submitClick;
$('sub').onclick = submitClick;
$('surl').onclick = () => copy(vizUrl(), 'url');
$('sgd').onclick = () => copy(`node gode/tools/gd.js go '${location.pathname.replace(/^\//, '')}?${shareQs()}'`, 'gd');
$('sclr').onclick = () => { selA = null; S.sel = null; changed(); };

// ---- 相机：拖动平移、朝光标缩放、Shift+滚轮调切片 ----
let drag = null;
const local = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
cv.addEventListener('contextmenu', (e) => e.preventDefault());
cv.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 && e.button !== 2) return;
  stopPan();
  const [px, py] = local(e);
  edge = e.button === 2 ? edgeAt(px, py) : null;   // 选区边只能右键拖
  drag = { x: e.clientX, y: e.clientY, cx: S.x, cy: S.y, cz: S.z, moved: false, btn: e.button, p0: e.button === 2 && store && !edge ? pick(px, py).p : null };
  cv.setPointerCapture(e.pointerId);
  hideCtx();
});
cv.addEventListener('pointermove', (e) => {
  const [px, py] = local(e);
  if (drag) {
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (drag.moved && edge) {   // 右键拖选区边
      const w = planeAt(px, py)[edge.ax], b = S.sel.slice();
      if (edge.hi) b[edge.ax + 3] = Math.round(w) - 1; else b[edge.ax] = Math.round(w);
      if (edge.ax === 1) { b[1] = clamp(b[1], 0, H - 1); b[4] = clamp(b[4], 0, H - 1); }
      S.sel = normSel(b); changed();
    } else if (drag.moved && drag.btn === 0) { const v = VIEWS[S.view]; S.x = drag.cx - (v.R[0] * dx + v.D[0] * dy) / S.zoom; S.y = drag.cy - (v.R[1] * dx + v.D[1] * dy) / S.zoom; S.z = drag.cz - (v.R[2] * dx + v.D[2] * dy) / S.zoom; changed(); }
  } else cv.style.cursor = edgeAt(px, py)?.cur ?? '';
  if (store) { hov = pick(px, py); readout(); hoverPanel(); if (selA || play || S.zoom >= 4 || (drag?.btn === 2 && drag.moved)) frame(); }   // 悬停格框只在 ≥ 4 px/格时画
});
cv.addEventListener('pointerleave', () => { if (!drag) cv.style.cursor = ''; });
cv.addEventListener('pointerup', (e) => {
  const [px, py] = local(e);
  if (drag && store && !edge) {
    if (drag.btn === 0 && !drag.moved) { const p = pick(px, py).p; setSelCol(pinBox(p), p); }   // 左键点击 = 选区设为点到位置所在的区块网格（沿视线轴整条）
    else if (drag.btn === 2 && drag.moved && drag.p0) { const pB = pick(px, py).p; S.sel = boxFrom(drag.p0, pB); selAB = { box: S.sel, A: drag.p0, B: pB }; selA = null; changed(); }   // 右键拖 = 直接拉矩形
    else if (drag.btn === 2 && !drag.moved) {                                        // 右键点击：一下 = 该格 × seld 深度（同时成为角 A），再一下 = 并进角 B
      const p = pick(px, py).p;
      rightClick(p);
    }
  }
  drag = null; edge = null;
});
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  stopPan();
  const [px, py] = local(e);
  if (e.shiftKey) {   // Shift+滚轮：切片沿视线方向进 / 退（Ctrl 一次 8 层）
    const d = -Math.sign(e.deltaY || e.deltaX), rg = range();   // 滚轮向上 = 往深处（方向已取反）
    if (d) setSlice((S.slice ?? rg.outer) + d * rg.dir * (e.ctrlKey ? 8 : 1));
  } else {
    const before = planeAt(px, py);
    S.zoom = clampZoom(S.zoom * Math.pow(2, -e.deltaY / 300));
    const after = planeAt(px, py);
    S.x += before[0] - after[0]; S.y += before[1] - after[1]; S.z += before[2] - after[2];
    changed();
  }
  if (store) { hov = pick(px, py); readout(); hoverPanel(); }
}, { passive: false });
const zoomBy = (f) => { stopPan(); S.zoom = clampZoom(S.zoom * f); changed(); };
$('zin').onclick = () => zoomBy(2); $('zout').onclick = () => zoomBy(0.5);
$('home').onclick = () => { stopPan(); S.x = S.origin[0]; S.z = S.origin[1]; changed(); };
function hideCtx() { $('ctx').style.display = 'none'; endPreview(); }
const originsStr = () => fmtPts(S.origins);
function saveOrigins() { try { localStorage.setItem('pgviz.origins', originsStr()); } catch {} url(); renderCtx(); if (store) frame(); }
function renderCtx() {
  const c = $('ctx'), esc = (t) => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  c.innerHTML = (S.origins.length ? S.origins.map((o, i) => `<div class="oi" data-i="${i}"><input value="${esc(o.n)}" spellcheck="false"><span class="oc">${atTxt(o)}</span><span class="ox" title="删除">×</span></div>`).join('') : '<div class="hdr">（空）</div>') +
    '<div class="bar"><button id="oadd" title="选区最小角；无选区时视口中心（快捷键 C）">＋添加 (C)</button><button id="oexp">导出列表</button>' + (hasAgent() ? '<button id="osub" title="点列表 + 选区 → Agent（Ctrl+⏎）">→ Agent</button>' : '') + '<button id="oimp" title="读剪贴板；也可把多行文本粘贴到顶栏的粘贴框">导入</button><button id="ors" class="' + (S.opath ? 'on' : '') + '" title="按列表顺序把原点连成黄色虚线（俯视 / 仰视）；括号里是折线总长（格，欧氏）">路径显示(距离:' + pathLen() + '格子)</button></div>';
  c.querySelectorAll('.oi').forEach(el => {
    const o = S.origins[+el.dataset.i];
    el.onmouseenter = () => previewOrigin(o);
    el.querySelector('input').onchange = (e) => { o.n = cleanName(e.target.value); saveOrigins(); };
    el.querySelector('input').onkeydown = (e) => e.stopPropagation();
    // 点坐标 = viz 跳到该原点（顺手把 hit 设在该列的地表 / 记下的 y）；游戏在线且同生成器 / 种子时一起传送过去（落点同 ⏎ 的 gamePose，有 y 用 y）
    el.querySelector('.oc').onclick = () => {
      endPreview(); setOrigin([o.x, o.z]); S.x = o.x + 0.5; S.z = o.z + 0.5;
      const c = store?.col(o.x, o.z), y = o.y ?? (c && c.y >= 0 ? c.y : Math.round(S.y ?? meta.sea ?? 64));
      setSelCol([o.x, y, o.z], [o.x, y, o.z]); hideCtx();
      if (!peerOk()) return;
      const g = gamePose(); bc.postMessage({ from: 'viz', tp: { x: g.x, y: o.y ?? g.y, z: g.z, yaw: g.yaw, pitch: g.pitch } });
      toast(`游戏跳到原点 ${o.n} ${atTxt(o)}`);
    };
    el.querySelector('.ox').onclick = () => { S.origins.splice(+el.dataset.i, 1); endPreview(); saveOrigins(); };
  });
  $('oadd').onclick = () => addOrigin();
  $('oexp').onclick = () => copy(S.origins.map(o => `${o.n} ${atTxt(o)}`).join('\n'), 'origins');
  if ($('osub')) $('osub').onclick = submitClick;
  $('oimp').onclick = async () => { try { importOrigins(await navigator.clipboard.readText()); } catch (e) { cerr(e); } };
  $('ors').onclick = () => { S.opath = !S.opath; changed(); renderCtx(); };
}
function addOrigin(x, z, name) {
  if (x === undefined) [x, z] = S.sel ? [S.sel[0], S.sel[2]] : [Math.floor(S.x), Math.floor(S.z)];
  x = Math.round(x); z = Math.round(z);
  const dup = S.origins.findIndex(o => samePt(o, { x, z }));
  if (dup >= 0) { renderCtx(); const el = $('ctx').querySelector(`.oi[data-i="${dup}"]`); if (el) { el.style.outline = '2px solid #ffa63a'; setTimeout(() => (el.style.outline = ''), 1500); } return dup; }   // 同坐标已有：不重复添加，高亮已有项
  let i = 1; while (S.origins.some(o => o.n === 'C' + i)) i++;
  S.origins.push({ n: name ? cleanName(name) : 'C' + i, x, z }); saveOrigins(); return S.origins.length - 1;
}
function importOrigins(text) {   // 每行 `名字 @x,z[^y]`（名字可省；y = 地下原点，兼容导出格式）；同坐标跳过；同名不同坐标覆盖该名
  let n = 0;
  for (const ln of String(text).split(/\r?\n/)) {
    const m = ln.match(/^\s*(.*?)\s*@\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*\^\s*(-?\d+(?:\.\d+)?))?/); if (!m) continue;
    const o = { n: m[1] ? cleanName(m[1]) : 'C' + (S.origins.length + 1), x: Math.round(+m[2]), z: Math.round(+m[3]), ...(m[4] !== undefined ? { y: Math.round(+m[4]) } : {}) };
    if (S.origins.some(e => samePt(e, o))) continue;
    const k = S.origins.findIndex(e => e.n === o.n);
    if (k >= 0) S.origins[k] = o; else S.origins.push(o); n++;
  }
  S.origins = dedupeOrigins(S.origins);
  if (n) saveOrigins(); return n;
}
// ---- 小图：只有一个实例 #minid / #mini（俯视挂左栏顶部，其他视角挂地图左上角；见 index.html 的 CSS） ----
// 快放（另一视角剖面）用 GL：blitMini 借主 GL 上下文先把小图画进主画布左下角再 drawImage 拷进 #mini，调用方（draw()）紧接着重画主图。
// 原点预览**不碰 GL**：用 CPU 按列数据画（store.cols 里有就用，没有就按需向 worker 要 `col`，到之前画「加载中」占位而不是黑屏）。
function blitMini(params, w, h) {
  const mc = $('mini'), k = dpr(), mw = Math.round(w * k), mh = Math.round(h * k);
  if (mc.width !== mw || mc.height !== mh) { mc.width = mw; mc.height = mh; }
  R.draw(params(mw, mh, k));
  const g = mc.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cv, 0, cv.height - mh, mw, mh, 0, 0, mw, mh); g.setTransform(k, 0, 0, k, 0, 0);
  return g;
}
let previewing = false, lastPrev = null, pTok = 0, lutRGB = null;
const pcache = new Map(), pPend = new Set();   // 预览专用的列缓存（窗口外的块）、在途的块
function pcol(cx, cz) { const k = key(cx, cz); return store.cols.get(k) ?? pcache.get(k); }
function paintPreview(o) {
  const mc = $('mini'), k = dpr(), cw = mc.clientWidth || 278, ch = mc.clientHeight || 178, mw = Math.round(cw * k), mh = Math.round(ch * k), Z = 3;
  if (mc.width !== mw || mc.height !== mh) { mc.width = mw; mc.height = mh; }
  const bw = Math.ceil(cw / Z) + 2, bh = Math.ceil(ch / Z) + 2, x0 = Math.floor(o.x + 0.5 - cw / 2 / Z), z0 = Math.floor(o.z + 0.5 - ch / 2 / Z);
  const img = new ImageData(bw, bh), d = img.data, miss = [];
  for (let cz = z0 >> 4; cz <= (z0 + bh) >> 4; cz++) for (let cx = x0 >> 4; cx <= (x0 + bw) >> 4; cx++) if (!pcol(cx, cz)) miss.push([cx, cz]);
  const at = (x, z) => { const a = pcol(x >> 4, z >> 4); return a ? ((z & 15) << 4) | (x & 15) : -1; };
  for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
    const x = x0 + i, z = z0 + j, a = pcol(x >> 4, z >> 4), p = (j * bw + i) * 4;
    if (!a) { const c = ((i >> 2) + (j >> 2)) & 1 ? 44 : 38; d[p] = c; d[p + 1] = c + 4; d[p + 2] = c + 10; d[p + 3] = 255; continue; }
    const c = ((z & 15) << 4) | (x & 15), t = a[c * 4], y = a[c * 4 + 1], wd = a[c * 4 + 3];
    let r = 12, g = 12, b = 14;
    if (t) { r = lutRGB[(t & 0xfff) * 4]; g = lutRGB[(t & 0xfff) * 4 + 1]; b = lutRGB[(t & 0xfff) * 4 + 2]; }
    if (wd) { const f = Math.exp(-wd / 14); r = 63 * (1 - f) + r * f * 0.8; g = 118 * (1 - f) + g * f * 0.8; b = 228 * (1 - f) + b * f * 0.8; }
    else if (t) {   // 西 / 北邻列更高压暗、更低提亮（与着色器同向）
      const w = at(x - 1, z), n = at(x, z - 1), yw = w < 0 ? y : pcol((x - 1) >> 4, z >> 4)[w * 4 + 1], yn = n < 0 ? y : pcol(x >> 4, (z - 1) >> 4)[n * 4 + 1];
      const s = 1 - 0.12 * ((yw > y) + (yn > y)) + 0.08 * ((yw < y) + (yn < y)); r *= s; g *= s; b *= s;
    }
    d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
  }
  const t = document.createElement('canvas'); t.width = bw; t.height = bh; t.getContext('2d').putImageData(img, 0, 0);
  const g = mc.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false; g.fillStyle = '#000'; g.fillRect(0, 0, cw, ch);
  g.drawImage(t, (x0 - (o.x + 0.5 - cw / 2 / Z)) * Z, (z0 - (o.z + 0.5 - ch / 2 / Z)) * Z, bw * Z, bh * Z);
  g.strokeStyle = '#ff4fd8'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cw / 2 - 8, ch / 2); g.lineTo(cw / 2 + 8, ch / 2); g.moveTo(cw / 2, ch / 2 - 8); g.lineTo(cw / 2, ch / 2 + 8); g.stroke();
  if (miss.length) { g.fillStyle = '#000a'; g.fillRect(cw / 2 - 40, 6, 80, 20); g.fillStyle = '#9ab'; g.font = '12px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('加载中…', cw / 2, 20); g.textAlign = 'start'; }
  return miss;
}
function previewOrigin(o) {
  if (!store || live()) return;
  lastPrev = o; previewing = true; const tok = ++pTok, p0 = pool, g0 = pool.gen;
  $('minik').textContent = `原点预览 ${o.n} ${atTxt(o)}（俯视）`; showMini();
  const miss = paintPreview(o);
  if (pcache.size > 900) pcache.clear();
  const order = (a, b) => Math.hypot(a[0] * 16 + 8 - o.x, a[1] * 16 + 8 - o.z) - Math.hypot(b[0] * 16 + 8 - o.x, b[1] * 16 + 8 - o.z);
  for (const [cx, cz] of miss.sort(order)) {
    const k = key(cx, cz); if (pPend.has(k)) continue; pPend.add(k);
    p0.call('col', { cx, cz, cls: store.cls }).then(m => { if (pool === p0 && pool.gen === g0) pcache.set(k, m.col); }).catch(() => {}).finally(() => {
      pPend.delete(k); if (pool === p0 && tok === pTok && previewing && lastPrev) paintPreview(lastPrev);   // 只重画最新的一次悬停
    });
  }
}
// 小图浮层：俯视（且左栏可见）挂左栏顶部、贴在 ① 标题行下方；其他视角 / 左栏隐藏挂地图左上角。幂等：只设类和一个固定的 top
function showMini() {
  const m = $('minid'), ap = $('app'), side = S.view === 'top' && !ap.classList.contains('nosd') && !ap.classList.contains('zen') && !document.fullscreenElement;
  m.classList.toggle('side', side); m.classList.toggle('inmap', !side);
  if (side) m.style.setProperty('--mtop', Math.max(38, Math.round($('wsum').closest('summary').getBoundingClientRect().bottom)) + 'px');
  m.classList.add('on');
}
function endPreview() { if (!previewing) return; previewing = false; pTok++; if (!S.minip && !play) $('minid').classList.remove('on'); else { showMini(); frame(); } }
// 小图大小可拖（侧栏模式只改高，地图模式宽高），存 localStorage
let msz = { mh: 120, mw: 300, mh2: 200 }; try { Object.assign(msz, JSON.parse(localStorage.getItem('pgviz.mini') || '{}')); } catch {}
const applyMsz = () => { const st = document.documentElement.style; st.setProperty('--mh', clamp(msz.mh, 60, 600) + 'px'); st.setProperty('--mw', clamp(msz.mw, 120, 900) + 'px'); st.setProperty('--mh2', clamp(msz.mh2, 60, 700) + 'px'); };
applyMsz();
{ const z = $('mrz'); let d = null;
  z.addEventListener('pointerdown', (e) => { e.preventDefault(); z.setPointerCapture(e.pointerId); z.classList.add('on'); d = { x: e.clientX, y: e.clientY, w: $('mini').clientWidth, h: $('mini').clientHeight, side: $('minid').classList.contains('side') }; });
  z.addEventListener('pointermove', (e) => { if (!d) return; const h = Math.round(d.h + e.clientY - d.y);
    if (d.side) msz.mh = h; else { msz.mh2 = h; msz.mw = Math.round(d.w + e.clientX - d.x); }
    applyMsz(); if (previewing && lastPrev) paintPreview(lastPrev); if (play) draw(); });
  z.addEventListener('pointerup', () => { d = null; z.classList.remove('on'); try { localStorage.setItem('pgviz.mini', JSON.stringify(msz)); } catch {} }); }
function showCtx() {   // ⌖ 右键 / Numpad 5：拉开原点菜单（顺手预览当前原点）
  const c = $('ctx'), b = $('home').getBoundingClientRect();
  renderCtx(); previewOrigin({ n: '当前原点', x: S.origin[0], z: S.origin[1] }); c.style.display = 'block'; c.style.left = Math.max(4, b.left - c.offsetWidth - 6) + 'px'; c.style.top = b.top + 'px';
}
$('home').addEventListener('contextmenu', (e) => { e.preventDefault(); showCtx(); });
addEventListener('pointerdown', (e) => { if (!e.target.closest?.('#ctx, #mrz')) hideCtx(); }, true);
function setOrigin(o) { S.origin = o.map(Math.round); changed(); world(); }
$('png').onclick = () => { draw(); const a = document.createElement('a'); a.download = `pgviz-${S.g}-${S.seed}-${S.view}.png`; const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height; const g = o.getContext('2d'); g.drawImage(cv, 0, 0); if (layerOn()) g.drawImage($('lay'), 0, 0, o.width, o.height); a.href = o.toDataURL('image/png'); a.click(); };
let zen = false;   // 全屏退化模式：Fullscreen API 失败时隐藏顶栏 / 左栏 / 状态行
const relayout = () => setTimeout(() => { S.zoom = clampZoom(S.zoom); recenter(); if ($('minid').classList.contains('on')) showMini(); frame(); });   // 进 / 出全屏后小图换挂位（左栏顶部 ↔ 地图左上角）
async function toggleFull() {
  if (document.fullscreenElement) return document.exitFullscreen();
  if (zen) { zen = false; $('app').classList.remove('zen'); return relayout(); }
  try { if (!$('map').requestFullscreen) throw 0; await $('map').requestFullscreen(); }
  catch { zen = true; $('app').classList.add('zen'); relayout(); }
}
$('full').onclick = toggleFull;
document.addEventListener('fullscreenchange', relayout);
addEventListener('resize', () => { S.zoom = clampZoom(S.zoom); recenter(); frame(); });

// ---- gizmo（右下） ----
const GZ = { '+Y': [60, 16], '-Y': [92, 96], '+X': [104, 60], '-X': [16, 60], '+Z': [28, 96], '-Z': [92, 24] };
const GCOL = { X: '#e5534b', Y: '#57ab5a', Z: '#539bf5' };
const giz = $('giz'), gx = giz.getContext('2d');
function gizmo() {
  const k = 2; gx.setTransform(k, 0, 0, k, 0, 0); gx.clearRect(0, 0, 120, 120);
  const cur = VIEWS[S.view].ax;
  for (const [ax, [x, y]] of Object.entries(GZ)) {
    const pos = ax[0] === '+', c = GCOL[ax[1]];
    if (pos) { gx.strokeStyle = c; gx.lineWidth = 2; gx.beginPath(); gx.moveTo(60, 60); gx.lineTo(x, y); gx.stroke(); }
    gx.beginPath(); gx.arc(x, y, 10, 0, 7);
    gx.fillStyle = pos ? c : '#0008'; gx.fill(); gx.lineWidth = 2; gx.strokeStyle = pos ? c : c + '99'; gx.stroke();
    if (ax === cur) { gx.lineWidth = 2; gx.strokeStyle = '#fff'; gx.beginPath(); gx.arc(x, y, 13, 0, 7); gx.stroke(); }
    else if (ax[1] === cur[1]) { gx.lineWidth = 1.5; gx.strokeStyle = '#fffa'; gx.setLineDash([3, 2]); gx.beginPath(); gx.arc(x, y, 13, 0, 7); gx.stroke(); gx.setLineDash([]); }   // 同一根轴的另一端：虚线环
    if (gizHover === ax) { gx.fillStyle = '#fff3'; gx.beginPath(); gx.arc(x, y, 10, 0, 7); gx.fill(); }
    gx.fillStyle = pos ? '#000' : c; gx.font = 'bold 9px ui-monospace, monospace'; gx.textAlign = 'center'; gx.textBaseline = 'middle';
    gx.fillText(pos ? ax[1] : '-' + ax[1], x, y + 0.5);
  }
  if (play) { gx.fillStyle = '#fd5'; gx.font = '10px ui-monospace, monospace'; gx.textAlign = 'left'; gx.fillText(`${AXN[play.axis]} +${play.off}/${playN(play.axis)}${play.frozen ? ' 固定' : ''}`, 4, 112); }
}
function gizHit(e) {
  const b = giz.getBoundingClientRect(), x = (e.clientX - b.left) * 120 / b.width, y = (e.clientY - b.top) * 120 / b.height;
  let best = null, bd = 14;
  for (const [ax, [px, py]] of Object.entries(GZ)) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = ax; } }
  return best;
}
const playN = (ax) => Math.max(1, S.sel ? S.sel[ax + 3] - S.sel[ax] + 1 : S.seld);   // 快放层数 = 当前选区沿该轴的深度；没有选区时用 seld
function startPlay(ax, src = 'hover') {   // src：hover = 悬停 gizmo 其它轴端点（沿该轴快放切面）；key = Numpad 9（沿视线轴）
  const v = VIEWS[S.view], a = axisOf(v.F);
  const axis = ax ? AXN.indexOf(ax[1]) : a;
  const sign = ax ? (ax[0] === '+' ? 1 : -1) : -v.F[a];
  if (live() && play.axis === axis && play.sign === sign) return;
  if (play) cancelAnimationFrame(play.raf);
  play = { axis, sign, off: 0, t0: performance.now(), src };
  giz.classList.add('play'); showMini();
  const tick = () => {
    if (!play || play.frozen) return;
    const off = Math.floor((performance.now() - play.t0) / 1000 * S.rate) % (playN(play.axis) + 1);
    if (off !== play.off) { play.off = off; draw(); gizmo(); }
    play.raf = requestAnimationFrame(tick);
  };
  play.raf = requestAnimationFrame(tick); draw(); gizmo();
}
// how：'commit' = 沿视线轴的快放停下时把切片设在此层；'freeze' = 其它轴的扫描线 / 剖面停在此层（Esc 取消）；缺省 = 回原状（已固定的也清掉）
function stopPlay(how) {
  if (!play) return;
  cancelAnimationFrame(play.raf);
  const rg = range(), was = play;
  if (how === 'commit' && !was.frozen && was.axis === rg.a) { const v = rg.start; play = null; setSlice(v); toast(`切片 ${AXN[rg.a]} → ${v}`); }
  else if (how === 'freeze' && !was.frozen && was.axis !== rg.a) { play.frozen = true; toast(`${AXN[was.axis]} 剖面停在 ${clipVal(was)}（Esc 取消）`); }
  else play = null;
  giz.classList.remove('play'); if (!play && !S.minip && !previewing) $('minid').classList.remove('on'); draw(); gizmo();
}
giz.addEventListener('pointermove', (e) => {   // 悬停：高亮端点 + Numpad 帮助（俯视），同时快放（和帮助不冲突）：其它轴端点 = 沿该轴快放切面（小图画剖面），视线轴端点 / 空白 = 沿视线轴快放
  const ax = gizHit(e), a = axisOf(VIEWS[S.view].F);
  gizHover = ax;
  startPlay(ax && AXN.indexOf(ax[1]) !== a ? ax : null);   // 目标换了就直接替换（途中不提交），只有移出 gizmo 才算「停下」
  $('gzhelp').style.display = helpOn() ? 'block' : 'none';
  gizmo();
});
const helpOn = () => S.view === 'top' && !document.fullscreenElement && !$('app').classList.contains('zen');   // Numpad 帮助：只在俯视、非全屏时弹
giz.addEventListener('pointerenter', () => { $('gzhelp').style.display = helpOn() ? 'block' : 'none'; });
giz.addEventListener('pointerleave', () => { gizHover = null; $('gzhelp').style.display = 'none'; if (live() && play.src === 'hover') stopPlay(play.axis === range().a ? 'commit' : 'freeze'); gizmo(); });   // 停下 = 停在那层：视线轴设切片、其它轴固定剖面
// 右键 = 切换方向（+Y ↔ −Y，俯视 ↔ 仰视，以此类推）：右键视线轴的端点或空白 = 当前视角翻到反向；右键其它轴的端点 = 去那根轴的另一端（+X → −X）
function flipView() { const cur = VIEWS[S.view].ax, to = (cur[0] === '+' ? '-' : '+') + cur[1]; stopPlay(); setView(AX_VIEW[to]); toast('视角：' + VIEWS[AX_VIEW[to]].name); }
giz.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const cur = VIEWS[S.view].ax, hit = gizHit(e), ax = hit && hit[1] !== cur[1] ? hit : cur, to = (ax[0] === '+' ? '-' : '+') + ax[1];   // 视线轴的端点 / 空白 = 翻转当前视角；其它轴的端点 = 去它的另一端
  stopPlay(); setView(AX_VIEW[to]); toast('视角：' + VIEWS[AX_VIEW[to]].name);
});
giz.addEventListener('click', (e) => {
  const ax = gizHit(e);
  if (ax) { stopPlay(); setView(AX_VIEW[ax]); return; }
  // 空白处：正在沿视线轴快放 → 把切片设为快放终点（当前切片 + N 层，按悬停方向，夹到范围），下次悬停从更深处继续
  if (live() && play.axis === range().a) { const rg = range(), v = clamp(rg.base + rg.dir * playN(rg.a), rg.lo, rg.hi); stopPlay(); setSlice(v); toast(`切片 ${AXN[rg.a]} → ${v}`); }
});
let toastT = 0;
function toast(t, ms = 1400) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => (el.style.opacity = 0), ms); }

// ---- 键盘：7 / 1 / 3，Ctrl（或 Alt：浏览器常吃掉 Ctrl+数字）反向；G 网格；Esc 选区 ----
// 4 6：左右翻一屏（视口宽，前后两页无重叠）；2 8：翻「深度」（选区深度 input）格；侧视里 2 / 8 挪切面（沿视线轴前后）
function pageBy(sr, sd) {
  stopPan();
  const v = VIEWS[S.view], side = v.F[1] === 0, dx = sr * cv.clientWidth / S.zoom, dy = sd * S.seld;
  // 侧视看的就是切面：只挪深度中心（S.x / S.z）画面一点不动，得挪切面本身（8 往画面里推、2 往观察者退，y 不变）；
  // 中心跟着切面走，切回俯视还在同一个位置
  if (side && !sr) {
    const rg = range(), c = clamp(Math.round((S.slice ?? rg.outer) - sd * rg.dir * S.seld), rg.lo, rg.hi);
    if (rg.a === 0) S.x = c; else if (rg.a === 2) S.z = c;
    setSlice(c);
    toast(`切片 ${AXN[rg.a]} ${c}`, 900);
    return;
  }
  // 4 / 6 = 屏幕左右；2 / 8 = 屏幕上下（俯视 / 仰视）
  const ax = v.R.map((t) => t * dx), ay = (side ? v.F.map((t) => -t * dy) : v.D.map((t) => t * dy));
  S.x += ax[0] + ay[0]; S.y += ax[1] + ay[1]; S.z += ax[2] + ay[2];
  if (v.R[1] || v.D[1]) S.y = clamp(S.y, 0, H - 1);
  changed();
}
// Del：图层暂时切成「无」，再按一次复原
let layerStash = null;
function layerPeek() {
  if (S.layer !== 'none') { layerStash = S.layer; S.layer = 'none'; changed(); toast('图层：暂时关（Del 复原）'); }
  else if (layerStash) { S.layer = layerStash; layerStash = null; changed(); toast('图层：已复原'); }
}
const SHADES = ['block', 'biome', 'height'];
addEventListener('keydown', (e) => {
  if (e.target.matches?.('input, select, textarea')) return;
  if (e.key === 'Enter' && !e.altKey && !e.metaKey) {   // ⏎ = 进游戏；Ctrl+⏎ = 一键提交给 Agent（preventDefault：焦点在按钮上时不再触发该按钮）
    e.preventDefault(); if (e.repeat) return;
    if (e.ctrlKey) submitClick(); else enterGame(false);   // ⏎：有选中点 / 选区 = 游戏跳到那儿；游戏在线且没有 = 游戏相机改为望向脚下；游戏不在线 = 开新标签页
    return;
  }
  if (e.key === 'Escape') { if (bs) { bioStop(); return; } if (play?.frozen) { stopPlay(); toast('剖面已取消'); return; } if (selA) selA = null; else S.sel = null; changed(); return; }
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.code === 'KeyK' && !e.repeat) { toggleDial(); return; }
    if (e.code === 'NumpadDecimal' && !e.repeat) { e.preventDefault(); layerPeek(); return; }   // 小键盘 Del = 图层暂时关 / 复原（原 5 键）
    if ((e.code === 'Numpad5' || e.code === 'Digit5') && !e.repeat) { e.preventDefault(); $('ctx').style.display === 'block' ? hideCtx() : showCtx(); return; }   // 5 = 快速拉开原点菜单
    if (e.code === 'KeyT') { S.shade = SHADES[(SHADES.indexOf(S.shade) + 1) % 3]; changed(); return; }
    if (e.code === 'KeyV') { flipView(); return; }   // 和 giz 右键同效：沿视线轴翻到反向（俯视 ↔ 仰视…）
    if (e.code === 'KeyF') { e.preventDefault(); toggleFull(); return; }
    if (e.repeat) { if (['KeyE', 'KeyR', 'KeyC', 'KeyL'].includes(e.code)) return; }
    else if (e.code === 'KeyL') { const ls = LY.list(), i = ls.findIndex(l => l.id === S.layer), n = ls[(i + (e.shiftKey ? 1 : ls.length - 1)) % ls.length]; setLayer(n.id); toast('图层：' + n.name + (S.layer !== 'none' && axisOf(VIEWS[S.view].F) !== 1 ? '（只在俯视 / 仰视画）' : '')); return; }
    else if (e.code === 'KeyE') { const bs = [...$('modes').querySelectorAll('[data-m]')].filter(b => !b.disabled), i = bs.findIndex(b => b.dataset.m === mode()); bs[(i + 1) % bs.length].click(); toast('模式：' + bs[(i + 1) % bs.length].textContent + (bridged ? `；选区 = 两个截面之间 ${bridged} 层（9 扫过）` : ''), bridged ? 2600 : 1400); return; }   // 地表 ↔ 切片（层叠 V2 起加入循环）
    else if (e.code === 'KeyR') { S.air = !S.air; changed(); toast('空气距离：' + (S.air ? '开' : '关')); return; }
    else if (e.code === 'KeyC') { const n = S.origins.length, i = addOrigin(), o = S.origins[i]; toast((S.origins.length > n ? '已添加原点 ' : '已有原点 ') + `${o.n} @${o.x},${o.z}`); return; }
  }
  const d = e.code.replace(/^(Digit|Numpad)/, ''), rev = e.ctrlKey || e.altKey;
  const v = { 7: rev ? 'bottom' : 'top', 1: rev ? 'north' : 'south', 3: rev ? 'west' : 'east' }[d];
  if (v) { e.preventDefault(); setView(v); return; }
  if (!e.ctrlKey && !e.altKey && !e.metaKey && store) {   // Numpad 操控（giz 悬停有帮助）：4 6 8 2 翻页、5 图层暂时关 / 恢复、9 按住快放
    const pg = { 4: [-1, 0], 6: [1, 0], 8: [0, -1], 2: [0, 1] }[d];
    if (pg) { e.preventDefault(); pageBy(pg[0], pg[1]); return; }
    if (d === '0') { e.preventDefault(); if (!e.repeat) enterGame(true); return; }   // 0 = 带当前 pv 截面进游戏（游戏里 0 再往前推 16 格）
    if (d === '9') { e.preventDefault(); if (!e.repeat) startPlay(null, 'key'); return; }
  }
  if (e.key === 'g' || e.key === 'G') { S.grid = !S.grid; changed(); }
  else if (e.key === '+' || e.key === '=') zoomBy(2); else if (e.key === '-') zoomBy(0.5);
});
addEventListener('keyup', (e) => { if (/^(Digit|Numpad)9$/.test(e.code) && live() && play.src === 'key') stopPlay('commit'); });   // 9 松开：快放停在当前层（切片设到那一层）
addEventListener('blur', () => { if (live()) stopPlay(); });

// ---- ↗ 进游戏（V-9）：mini = 宿主 B ?seed=&p1=@x,z^y（不变）；其余 = gode ?g=&seed=&p1=@x,z^y[,yaw]&fly=1（与 index 同一套写法） ----
// 落点：选区中心 > 悬停点 > 视图中心。y：侧视 = 那个点自己的 y（看哪一层就落到哪一层）；俯视 / 仰视 = 该列地表（或水面）+ 8。
// 朝向：侧视 → 视线方向（F）；俯视 / 仰视不给 yaw。
// pitch = −20° 由 gode 宿主对 p1 开局统一设（p1 与 index 一样没有 pitch 字段）。
function gamePose() {   // 落点 { x, y, z, yaw|null, top }：gameUrl（新标签页）与广播传送共用
  const side = VIEWS[S.view].F[1] === 0;
  let x, z, yPt = side ? Math.round(S.y ?? meta.sea ?? 62) : null;   // 侧视：屏幕点的世界 y（选区 / 悬停优先）
  if (S.hit) { [x, yPt, z] = S.hit; }   // 点中的那一格最准（选区中心会因取整偏掉半格）
  else if (S.sel) { x = Math.floor((S.sel[0] + S.sel[3]) / 2); z = Math.floor((S.sel[2] + S.sel[5]) / 2); if (side) yPt = Math.round((S.sel[1] + S.sel[4]) / 2); }
  else if (hov) { [x, yPt, z] = hov.p; if (side) yPt = Math.round(yPt); }
  else { x = Math.floor(S.x); z = Math.floor(S.z); }
  const c = store?.col(x, z), top = c && c.y >= 0 ? Math.max(c.y + c.wd, c.y) : null;
  let y = side ? clamp(yPt - 1, 0, H - 1) : (top ?? S.slice ?? (meta.sea ?? 62)) + 8;   // 侧视：脚在 hit 下 1 格 → 眼睛（+1.62）约在 hit 方块中心，和屏幕中心对上
  const v = VIEWS[S.view], vert = v.F[1] !== 0;
  let yaw = vert ? null : Math.atan2(-v.F[0], -v.F[2]), pitch = vert ? undefined : 0;   // 侧视：朝视线方向水平看
  const ab = vert && S.sel && selAB && selAB.box === S.sel ? selAB : null;
  if (ab) {   // 俯视 / 仰视 + 矩形选区 A→B：站在 A 点地表 +8 格，朝向 B，向下看 20°（和不带选区的俯视落点同高）
    const [ax, ay, az] = ab.A, dx = ab.B[0] - ax, dz = ab.B[2] - az;
    x = Math.floor(ax); z = Math.floor(az); y = clamp(Math.round(ay) + 8, 0, H - 1);
    yaw = Math.hypot(dx, dz) > 0.01 ? Math.atan2(-dx, -dz) : null; pitch = -Math.PI / 9;
  }
  return { x, y, z, yaw, pitch, top };
}
const pvStr = () => sgn(VIEWS[S.view].ax) + (S.slice !== null ? ':' + S.slice : '');
function gameUrl(g = S.g, withPv = true) {
  const { x, y, z, yaw, pitch, top } = gamePose();
  if (g === 'mini') return new URL(`../../index.html?seed=${encodeURIComponent(S.seed)}&p1=@${x},${z}${top === null ? '' : '^' + (top + 1)}`, location.href).href;   // mini 保持原来的 y = 地表 + 1
  return new URL(`../index.html?g=${encodeURIComponent(g)}&seed=${encodeURIComponent(S.seed)}&p1=@${x},${z}^${y}${yaw === null ? '' : ',' + +yaw.toFixed(4) + (pitch === undefined || pitch === 0 ? '' : ',' + +pitch.toFixed(4))}${withPv ? '&pv=' + pvStr() : ''}${S.tod !== null ? '&hour=' + +S.tod.toFixed(2) : ''}&fly=1`, location.href).href;   // 拨盘时间随 p1 一起带进游戏（boot.js 读 hour）
}
// 游戏标签页在线（3.5 s 内收到过它的广播）→ ↗ / ⏎ / 0 = 直接传送过去（落点同 gameUrl，并带上 pv），否则开新标签页
const gameLive = () => peer && performance.now() - peerAt < 3500;
// ⏎ 与 0 共用：⏎ = 只关于点位（落点 / 朝向）；0 = 点位 + 当前 pv 截面。游戏在线 → 广播传送，否则开新标签页（URL 同样只在 0 时带 pv）
const peerOk = () => gameLive() && peer.g === S.g && String(peer.seed) === String(S.seed);
function enterGame(withPv) {
  if (S.g === 'mini' || !peerOk()) {
    if (S.terr !== 1) { S.terr = 1; changed(); }   // 打开游戏 tab：着色调成 2.5D（已经 1 就不重复切）
    window.open(gameUrl(S.g, withPv), '_blank'); return;
  }
  if (!withPv) {   // ⏎：① 游戏有 xhair 且 viz 的 p1（视口中心）正好在 hit 上 → 游戏跳到 xhair；② 否则有 hit / 选区 → 跳到 hit；③ 都没有 → 游戏相机望向脚下
    const same = S.hit && Math.floor(S.x) === S.hit[0] && Math.floor(S.z) === S.hit[2];
    if (peer.xhair && same) { const [x, y, z] = peer.xhair; bc.postMessage({ from: 'viz', tp: { x, y: y + 1, z } }); toast(`游戏跳到准星 @${x},${z}^${y + 1}`); return; }
    if (!peer.xhair && !S.sel) { bc.postMessage({ from: 'viz', tp: { look: 'feet' } }); toast('游戏相机：望向脚下'); return; }
  }
  const { x, y, z, yaw, pitch } = gamePose(); bc.postMessage({ from: 'viz', tp: { x, y, z, yaw, pitch }, pv: withPv ? pvStr() : null }); toast(`传送游戏 @${x},${z}^${y}${withPv ? ' ' + pvStr() : ''}`);
}
$('game').onclick = () => enterGame(false);

// ---- 顶栏 / 左栏 ----
$('go').onclick = () => { S.seed = $('seed').value.trim() || '0'; restart(); };
$('seed').onkeydown = (e) => { if (e.key === 'Enter') $('go').click(); };
$('gsel').onchange = () => { S.g = $('gsel').value; S.y = null; S.bio = []; restart(); };
$('layb').onclick = () => { S.lay = !S.lay; changed(); };
// 地表 ↔ 切片（E）：切面挪走时，选区沿视线轴变成「挪动之前的截面 … 现在的截面」一长条（没有选区就用屏幕中心所在区块的那一列），按 9 就能把两个截面扫接上；俯视不动（俯视选区约定是到基岩）
let bridged = 0;
function bridgeSel(p0) {
  const rg = range(), a = rg.a;
  bridged = 0;
  if (S.view === 'top' || p0 === rg.base) return;
  const b = S.sel ? [...S.sel] : pinBox([Math.floor(S.x), Math.round(S.y ?? meta.sea), Math.floor(S.z)]);
  b[a] = Math.min(p0, rg.base); b[a + 3] = Math.max(p0, rg.base);
  if (a === 1) { b[1] = clamp(b[1], 0, H - 1); b[4] = clamp(b[4], 0, H - 1); }
  selA = null; S.sel = normSel(b); bridged = b[a + 3] - b[a] + 1;
}
for (const b of $('modes').querySelectorAll('[data-m]')) b.onclick = () => {
  if (b.disabled) return;
  const was = mode(), p0 = store ? range().base : 0;
  if (b.dataset.m === 'surface') S.slice = null;
  else { const a = axisOf(VIEWS[S.view].F); S.slice = Math.round(a === 1 ? (hov?.r.hit ? hov.p[1] : meta.sea) : a === 0 ? S.x : S.z); }
  bridged = 0; changed();   // 先 changed()：侧视切片时窗口中心随切片挪，新截面的坐标要等窗口重新居中后才对
  if (store && mode() !== was) { bridgeSel(p0); if (bridged) changed(); }
};
// 顶栏 X、Z = 视口左上角的世界坐标（相对原点），实时；改了 = 把左上角移到那里
function tlUI() {
  const w = planeAt(0, 0), ae = document.activeElement;
  if (ae !== $('gx')) $('gx').value = Math.floor(w[0]) - S.origin[0];
  if (ae !== $('gz')) $('gz').value = Math.floor(w[2]) - S.origin[1];
}
$('gx').onchange = () => { stopPan(); const v = +$('gx').value; if ($('gx').value !== '' && isFinite(v)) { S.x += v + S.origin[0] - Math.floor(planeAt(0, 0)[0]); changed(); } tlUI(); };
$('gz').onchange = () => { stopPan(); const v = +$('gz').value; if ($('gz').value !== '' && isFinite(v)) { S.z += v + S.origin[1] - Math.floor(planeAt(0, 0)[2]); changed(); } tlUI(); };
// 粘贴：与复制同一套坐标系。`@x,z^y`（1 个点 = 钉住并居中；`@x,z` 无 y = 只居中）、`@x0,z0^y0 @x1,z1^y1`（两角 = 恢复选区并居中）。
// 坐标相对原点；文本里带 `(origin ox,oz)` 就按它还原（= 复制时的原点）。也认 gd 复制出的 URL / 命令里的 x= z= y=（绝对）。返回 false 或 { kind }
function jumpTo(text) {
  const t = String(text), N = '(-?\\d+(?:\\.\\d+)?)', om = t.match(new RegExp(`\\(\\s*origin\\s*${N}\\s*,\\s*${N}\\s*\\)`));
  const O = om ? [+om[1], +om[2]] : S.origin;
  const u1 = t.match(/[?&]p1=([^&\s']+)/);   // 粘贴的 pgviz URL：p1=@x,z[^y]（绝对坐标）
  if (u1) { let P = null; try { P = parseP1(decodeURIComponent(u1[1])); } catch {} if (P) { S.x = P[0] + 0.5; S.z = P[1] + 0.5; if (P[2] !== undefined) S.y = P[2]; changed(); return { kind: 'jump' }; } }
  const pts = [...t.replace(/\(\s*origin[^)]*\)/, '').matchAll(new RegExp(`@\\s*${N}\\s*,\\s*${N}(?:\\s*\\^\\s*${N})?`, 'g'))]
    .map(m => [Math.round(+m[1] + O[0]), m[3] === undefined ? undefined : Math.round(+m[3]), Math.round(+m[2] + O[1])]);
  if (!pts.length) {
    const g = (k) => { const r = t.match(new RegExp(`[?&]${k}=${N}`)); return r ? +r[1] : undefined; };
    const x = g('x'), z = g('z'), y = g('y'); if (x === undefined || z === undefined) return false;
    S.x = x + 0.5; S.z = z + 0.5; if (y !== undefined) S.y = y; changed(); return { kind: 'jump' };
  }
  if (pts.length >= 2 && pts[0][1] !== undefined && pts[1][1] !== undefined) {   // 两角 → 选区（原样恢复，不再套深度规则）
    const b = normSel([...pts[0], ...pts[1]]); selA = null; S.sel = b;
    S.x = (b[0] + b[3] + 1) / 2; S.z = (b[2] + b[5] + 1) / 2; S.y = (b[1] + b[4] + 1) / 2; changed(); return { kind: 'sel', sel: b };
  }
  const [x, y, z] = pts[0]; S.x = x + 0.5; S.z = z + 0.5; if (y !== undefined) S.y = y + 0.5; changed();
  if (y !== undefined) { setSelCol(pinBox([x, y, z]), [x, y, z]); return { kind: 'sel', sel: S.sel }; }
  return { kind: 'jump' };
}
const pasteGo = (t) => { stopPan(); const ok = String(t).trim().split(/\r?\n/).length > 1 ? importOrigins(t) > 0 : jumpTo(t); $('paste').value = ''; $('paste').style.borderColor = ok ? '' : 'var(--bad)'; if (!ok) setTimeout(() => ($('paste').style.borderColor = ''), 1200); return ok; };
$('paste').addEventListener('paste', (e) => { e.preventDefault(); pasteGo(e.clipboardData.getData('text')); });
$('paste').addEventListener('keydown', (e) => { if (e.key === 'Enter') pasteGo($('paste').value); });
// 左栏：右边缘拖动 resize（偏好进 localStorage），< 140 px 自动隐藏；⫷ 只在隐藏时显示，点它展开
const SW_MIN = 140; let sw = 300;
try { sw = clamp(+localStorage.getItem('pgviz.sw') || 300, SW_MIN, 720); } catch {}
$('app').style.setProperty('--sw', sw + 'px');
const showSide = () => { $('app').classList.remove('nosd'); relayout(); };
const hideSide = () => { $('app').classList.add('nosd'); relayout(); };
let sw0 = sw;
$('rsz').addEventListener('pointerdown', (e) => { e.preventDefault(); sw0 = sw; $('rsz').setPointerCapture(e.pointerId); $('rsz').classList.add('on'); $('rsz')._d = true; });
$('rsz').addEventListener('pointermove', (e) => {
  if (!$('rsz')._d) return;
  const w = e.clientX - $('app').getBoundingClientRect().left;
  if (w < SW_MIN) { $('rsz')._d = false; $('rsz').classList.remove('on'); sw = sw0; $('app').style.setProperty('--sw', sw + 'px'); hideSide(); return; }
  sw = clamp(Math.round(w), SW_MIN, 720); $('app').style.setProperty('--sw', sw + 'px'); recenter(); frame();
});
$('rsz').addEventListener('pointerup', () => { if (!$('rsz')._d) return; $('rsz')._d = false; $('rsz').classList.remove('on'); try { localStorage.setItem('pgviz.sw', sw); } catch {} relayout(); });
$('sdbtn').onclick = () => { $('app').classList.remove('nonav'); showSide(); };   // ⫷：顶栏 + 左栏一起恢复
// 顶栏最右 ✕：收起顶栏（顶栏里只留 ⫷），左栏一起收起；#sdbtn / ⫷ 一起恢复
const nonav = (on) => { $('app').classList.toggle('nonav', on); if (on) $('app').classList.add('nosd'); relayout(); };
$('navx').onclick = () => nonav(true);
$('vsel').onchange = () => setView($('vsel').value);
$('shsel').onchange = () => { S.shade = $('shsel').value; changed(); };
$('slr').oninput = () => setSlice(+$('slr').value);
$('fillr').oninput = () => { S.fill = +$('fillr').value; changed(); };
for (const [id, k, lo, hi] of [['seld', 'seld', 1, 256]]) $(id).onchange = () => { S[k] = clamp(Math.round(+$(id).value) || 16, lo, hi); changed(); };
$('rate').onchange = () => { S.rate = clamp(Math.round(+$('rate').value) || 7, 1, 60); changed(); };
$('nrow').addEventListener('wheel', (e) => { e.preventDefault(); S.rate = clamp(S.rate + (e.deltaY < 0 ? 1 : -1), 1, 60); changed(); }, { passive: false });
$('minipc').onchange = () => { S.minip = $('minipc').checked; changed(); };
$('otextc').onchange = () => { S.otext = $('otextc').checked; changed(); };
$('terrsel').onchange = () => { S.terr = +$('terrsel').value; changed(); };
$('airc').onchange = () => { S.air = $('airc').checked; changed(); };
$('lchips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setLayer(b.dataset.l); });
$('lopr').oninput = () => { S.lop = clamp(+$('lopr').value, 0.1, 1); changed(); };
$('gridc').onchange = () => { S.grid = $('gridc').checked; changed(); };
setInterval(() => { if (store && (busy.size || dirty3.size)) world(); }, 1000);
// 与游戏标签页互通点位（BroadcastChannel 'gode-sync'，每秒一次；main/boot.js 同名频道）：发视口中心 p1；
// 收游戏的 p1 / xhair / pv 存进 peer（viz.peer()）；hit 只是 viz 自己的局部状态，不进消息
const bc = new BroadcastChannel('gode-sync'); let peer = null, peerAt = 0, wasIn2d = null;
bc.onmessage = (e) => {
  const m = e.data; if (m?.from !== 'game') return;
  if (m.origins) { try { S.origins = parseOrigins(localStorage.getItem('pgviz.origins')); } catch {} renderCtx(); url(); if (store) frame(); toast('游戏里新增了原点'); return; }   // 游戏的 C：重读本地存储
  const wasLive = gameLive();
  peer = m; peerAt = performance.now(); if (store) frame();   // 重画 P1 标记
  // 刚连上（之前不在线）：拨盘时间对齐游戏时钟（5 分钟一格）；之后由拨盘驱动游戏（见每秒发的 tod）
  if (!wasLive && typeof m.hour === 'number' && (S.tod === null || Math.abs(S.tod - m.hour) > 1 / 60)) { S.tod = Math.round(m.hour * 12) / 12; dialUI(); changed(); }
  // 玩家出了跟随范围（细节绘制 slider × 半屏；1 = 到边缘）：平滑居中。失焦时实时跟；刚连上（wasIn2d === null）先同步一次
  let in2d = in2dView(m.p1[0], m.p1[1]);
  if (!in2d && peerOk() && (wasIn2d === null || (wasIn2d === true && !document.hasFocus()))) { panTo(m.p1[0] + 0.5, m.p1[1] + 0.5); toast('玩家不在视野里：视图居中'); in2d = true; }
  wasIn2d = in2d;
};
const hitToCenter = () => { if (!S.hit || !store) return; S.x = S.hit[0] + 0.5; S.z = S.hit[2] + 0.5; if (VIEWS[S.view].F[1] === 0) S.y = S.hit[1]; changed(); };
// 切回页面 / 标签页恢复：先把 hit 同步到玩家（否则「聚焦 hit」和「跟随玩家」会来回跳），玩家不在范围内再平滑居中过去
const syncPlayer = () => {
  if (!peer?.p1 || !peerOk()) return false;
  const [px, pz, py] = peer.p1;
  S.hit = [px, py ?? 64, pz];
  if (in2dView(px, pz)) { changed(); return true; }
  panTo(px + 0.5, pz + 0.5); wasIn2d = true; toast('玩家不在视野里：视图居中');
  return true;
};
addEventListener('focus', () => { if (!syncPlayer()) hitToCenter(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && !syncPlayer()) hitToCenter(); });   // 标签页恢复聚焦
setInterval(() => bc.postMessage({ from: 'viz', g: S.g, seed: S.seed, p1: [Math.round(S.x), Math.round(S.z), Math.round(S.y ?? meta?.sea ?? 64)], tod: S.tod }), 1000);   // tod 随 p1 一起发：游戏按「值变了才应用」设时钟（tspeed 仍可自己走）

// ---- 生成器参数 / 区域统计（s13 §3 调参闭环） ----
function setKw(k, v) {
  if (!meta) throw new Error('viz.set kw: 还没启动完（先 await viz.ready()）');
  let next;
  if (k === 'kw' || k === 'c_.Gen') next = v === null || v === '' ? {} : typeof v === 'string' ? parseKw(v) : flatten(v);
  else next = { ...S.kw, [k.replace(/^(c_\.Gen|kw)\./, '')]: v };
  const nk = diffFromDefault(meta.knobs, resolveParams(meta.knobs, next));   // 未知键 / 非数字在这里抛
  if (fmtKw(nk) === fmtKw(S.kw)) return;
  S.kw = nk; restart();
}
const lastStats = new Map();   // 'box|g|seed' → { res, kw }：上一次；base：钉住的基线
async function regionCall(o) {
  await window.viz.ready();
  const box = o.sel ? (typeof o.sel === 'string' ? parseSel(o.sel) : normSel(o.sel.map(Number))) : S.sel;
  if (!box) throw new Error('viz.stats: 没有选区（传 {sel:[x0,y0,z0,x1,y1,z1]}，或先在地图上选区）');
  const mx = Math.round((box[0] + box[3]) / 2), mz = Math.round((box[2] + box[5]) / 2);
  // 显式传 sel 且盒心不在 3D 窗口里 → 把视图挪过去（go:false 关掉；go:true 强制）。没有体素就没有统计
  if (o.go ?? (!!o.sel && !store.inWin(mx >> 4, mz >> 4))) { S.x = mx; S.z = mz; changed(); await window.viz.ready(); }
  const res = await regionStats(store, meta, box, { noise: o.noise, noiseN: o.noiseN, sample: (x, z) => pool.call('sample', { x, z }) });
  Object.assign(res, { g: S.g, seed: S.seed, kw: { ...S.kw } });
  if (o.depth) res.depth = await window.viz.depth({ x: mx, z: mz, ...(o.depth === true ? {} : o.depth) });   // 逐 Y 组成（矿洞）：跟选区一起回
  const k = box.join(',') + '|' + S.g + '|' + S.seed, prev = lastStats.get(k);
  const ref = o.vs === 'base' ? prev?.base : prev?.last;
  if (ref && !o.fresh) res.vs = { against: o.vs === 'base' ? 'base' : 'prev', kw: ref.kw, delta: diffStats(ref.res, res) };
  lastStats.set(k, { last: { res, kw: { ...S.kw } }, base: o.base ? { res, kw: { ...S.kw } } : prev?.base });
  return res;
}

// ---- window.viz：给 Agent / gd ----
const KEYS = { layer: String, lop: Number, g: String, seed: String, view: String, x: Number, y: Number, z: Number, zoom: Number, mode: String, n: Number, rate: Number, minip: Boolean, lay: Boolean, bio: parseBio, bm: (v) => { if (!['only', 'hl', 'un'].includes(v)) throw new Error('bm ∈ only hl un'); return v; }, terr: parseTerr, tod: (v) => parseTod(v), lcol: (v) => /^#?[0-9a-f]{6}$/i.test(v ?? '') ? String(v).replace('#', '').toLowerCase() : null, otext: Boolean, opath: Boolean, air: parseAir, xray: (v) => clamp(Math.round(+v || 0), 0, 64), shade: String, grid: Boolean, fill: Number,
  slice: (v) => v === null || v === '' ? null : Number(v), sel: (v) => v === null || v === '' ? null : Array.isArray(v) ? normSel(v.map(Number)) : parseSel(v),
  origin: (v) => v === null || v === '' ? [0, 0] : Array.isArray(v) ? v.map(Number).map(Math.round) : parsePair(v) ?? [0, 0], pin: (v) => v === null || v === '' ? null : Array.isArray(v) ? parsePin(v.join(',')) : parsePin(v), seld: Number };   // pin = sel 的别名
window.viz = {
  // 当前 3D 窗口与外圈 2D 全部到达、上传并画完后 resolve
  async ready() {
    await booting;
    if (bootErr) throw bootErr;   // 池加载失败（生成器脚本 404 / 语法错）：立刻失败，不要干等 40 s
    if (!(idle() && !dirty3.size && !dirty2.size)) await new Promise(r => { waiters.push(r); frame(); });
    draw(); const w = fadeEnd - performance.now(); if (w > 0) await new Promise(r => setTimeout(r, w));   // 等视角切换的淡出结束
    return true;
  },
  stats(o) {   // 无参 = 状态；带参 = 区域统计（调参闭环，见 stats.js）
    if (o !== undefined) return regionCall(o);
    const n = st.got, rg = store ? range() : null;
    return { g: S.g, seed: S.seed, meta: meta && { id: meta.id, ver: meta.ver, sea: meta.sea, h: H, layout: meta.layout ?? 'yzx16' }, view: S.view, mode: mode(), start: rg?.start,
      w3: store?.w3, w2: store?.w2, ring3: R.W, chunks: store?.map.size ?? 0, want: (store?.w3 ?? 0) ** 2, cols: store?.cols.size ?? 0, wantCols: (store?.w2 ?? 0) ** 2,
      inflight: busy.size, queued: n3.length + n2.length, workers: pool?.n, gen: pool?.gen,
      msPerChunk: n ? +(st.wms / n).toFixed(2) : null, wallMsPerChunk: st.t1 && st.pn ? +((st.t1 - st.t0) / st.pn).toFixed(3) : null, colsGot: st.cols, clipped: st.clip, sel: S.sel, kw: { ...S.kw }, errors: errs.length };
  },
  c4: () => store.c4(),
  // 区块接缝检查（seam.js）：私有单 Worker 池，不动页面主池；opts { at:[[cx,cz],…], w }
  async seam(o = {}) { await booting; return seamCheck({ url: poolUrl, kwarg: { seed: S.seed, g: S.g, kw: S.kw }, meta, ...o }); },
  // 屏幕平面坐标（俯视 = 世界 x,z；侧视 = 水平坐标, y）上，从当前切片沿视线轴到第一个实体要穿过的空气格数；0 = 切面上就是实体；null = 没碰到
  airDist(a, b) {
    const v = VIEWS[S.view], rg = range(), c = [0, 0, 0], ra = axisOf(v.R), da = axisOf(v.D);
    c[ra] = Math.floor(a); c[da] = Math.floor(b); c[rg.a] = rg.start;
    const r = store.march(c, v.F, rg.end); return r.hit || r.wd ? r.dist : null;
  },
  // 逐 Y 组成（矿洞 / 切片）：以 (x,z) 为中心 n×n 列、步长 step 格，bin 格一档 → 各组分千分比。
  // 只读已加载的块（缺的格不计入分母）；air = 空气，water/lava/ore 按名字归类。
  depth(o = {}) {
    if (!store) throw new Error('viz.depth: 还没有体素（先 await viz.ready()）');
    const n = clamp(Math.round(o.n ?? 17), 1, 129), step = Math.max(1, Math.round(o.step ?? 16)), bin = clamp(Math.round(o.bin ?? 4), 1, 64);
    const x0 = Math.floor(o.x ?? S.x) - ((n - 1) >> 1) * step, z0 = Math.floor(o.z ?? S.z) - ((n - 1) >> 1) * step;
    const nb = Math.ceil(H / bin), kind = new Uint8Array(4096);
    (meta?.names ?? []).forEach((nm, i) => { if (i < 4096) kind[i] = nm === 'air' ? 1 : /water/.test(nm) ? 2 : /lava|magma/.test(nm) ? 3 : /(^|_)ore(_|$)|ancient_debris/.test(nm) ? 4 : 0; });
    const cnt = [null, new Float64Array(nb), new Float64Array(nb), new Float64Array(nb), new Float64Array(nb)], tot = new Float64Array(nb);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      for (let y = 0; y < H; y++) {
        const v = store.get(x, y, z); if (v < 0) continue;
        const b = (y / bin) | 0; tot[b]++;
        const k = v ? kind[v & 0xfff] : 1;
        if (k) cnt[k][b]++;
      }
    }
    const perm = a => [...a].map((v, i) => tot[i] ? Math.round(1000 * v / tot[i]) : 0);
    return { x0, z0, n, step, bin, cols: n * n, H, air: perm(cnt[1]), water: perm(cnt[2]), lava: perm(cnt[3]), ore: perm(cnt[4]) };
  },
  // 屏幕点 → 世界点（canvas CSS 像素，左上为原点）：沿视线轴步进到第一个实体，读它是什么 / 哪列 / 群系；sample 可选（按列取群系噪声）
  async at(px, py, o = {}) {
    if (!store) throw new Error('viz.at: 还没有体素（先 await viz.ready()）');
    const h = pick(px, py), p = h.p, v = store.get(...p), col = store.col(p[0], p[2]);
    const r = { px, py, p, hit: !!h.r.hit, water: !!h.r.water, dist: h.r.dist,
      name: v < 0 ? '(未生成)' : v ? meta.names?.[v & 0xfff] ?? '#' + (v & 0xfff) : '空气',
      biome: col ? meta.biomes?.[col.biome] ?? col.biome : null, col: col ? { h: col.h, y: col.y, wd: col.wd } : null,
      d2: !!h.d2, at: atRel(p[0], p[1], p[2]) };
    if (o.sample) r.sample = await pool.call('sample', { x: p[0], z: p[2] }).catch(e => ({ err: e.message }));
    return r;
  },
  async probe(x, y, z) {
    [x, y, z] = [x, y, z].map(Math.floor);
    const v = store.get(x, y, z), col = store.col(x, z);
    return { x, y, z, v, type: v < 0 ? null : v & 0xfff, meta: v < 0 ? null : v >> 12, name: v < 0 ? '(未生成)' : meta.names?.[v & 0xfff] ?? '#' + (v & 0xfff),
      biome: col ? meta.biomes?.[col.biome] ?? col.biome : null, h: col?.h ?? null, surface: col?.y ?? null, at: `@${x},${z}^${y}`,
      ...(meta.y0 !== undefined && { yNative: y + meta.y0 }), sample: await pool.call('sample', { x, z }).catch(e => ({ err: e.message })) };
  },
  regen() { restart(); return this.ready(); },
  // 图层：列表 / 某列的值（树种名或场值，场值取最近的采样点，块没到返回 null）
  layers: () => LY.list(), layerAt: (x, z) => LY.valueAt(store, Math.floor(x), Math.floor(z)),
  // 生成器参数（s02 §2.1）：schema + 当前值。set('kw', {...}) / set('c_.Gen.cave.rate', 0.5) 改参数并重算窗口（未知键抛错）
  params() {
    const eff = resolveParams(meta?.knobs, S.kw, false);
    return { g: S.g, seed: S.seed, kw: { ...S.kw }, list: (meta?.knobs ?? []).map(p => ({ ...p, value: eff[p.k] })) };
  },
  // 改一批参数（增量合并到当前 kw，null = 回默认）→ 等重算 → 返回区域统计（带与上次的差）
  async tune(change, o = {}) { await booting; setKw('kw', { ...S.kw, ...flatten(change) }); return regionCall(o); },
  set(k, v) {
    if (k === 'kw' || /^(c_\.Gen|kw)(\.|$)/.test(k)) { setKw(k, v); return; }
    if (!(k in KEYS)) throw new Error('viz.set: 未知键 ' + k + '（支持 ' + Object.keys(KEYS).join(' ') + '）');
    v = KEYS[k](v);
    if (k === 'view') { if (!VIEWS[v]) throw new Error('view ∈ ' + Object.keys(VIEWS)); setView(v); return; }
    if (k === 'mode') { if (!['surface', 'slice'].includes(v)) throw new Error('mode ∈ surface slice（stack 是 V2）'); $('modes').querySelector(`[data-m="${v}"]`).click(); return; }
    if (k === 'layer') { setLayer(v === null || v === '' ? 'none' : v); return; } if (k === 'lop') v = clamp(v, 0.1, 1);
    if (k === 'zoom') v = clampZoom(v); if (k === 'fill') v = clamp(v, 0.2, 1);
    if (k === 'seld') v = clamp(Math.round(v), 1, 256); if (k === 'rate') v = clamp(Math.round(v), 1, 60);
    if (k === 'pin') k = 'sel'; if (k === 'sel') { selA = null; S.hit = null; }
    if (k === 'origin') { setOrigin(v); return; }
    S[k] = v;
    if (k === 'g' || k === 'seed') { if (k === 'g') S.y = null; restart(); return; }
    changed();
  },
  get sel() { return S.sel; },
  get pin() { return S.sel; },   // 别名
  jump: jumpTo,
  previewOrigin, endPreview,
  // 预览读回：等所有缺的块到齐；返回 { ok, missing }；压力检查用
  async previewReady() { for (let i = 0; i < 400; i++) { if (!pPend.size && lastPrev && !paintPreview(lastPrev).length) return { ok: true, missing: 0 }; await new Promise(r => setTimeout(r, 15)); } return { ok: false, missing: pPend.size }; },
  origins: () => S.origins.map(o => ({ ...o })), addOrigin, importOrigins, xz2scr, pathLen, bioLocate: (b) => { const r = bioLocate(b); changed(); return r; }, bioSearch, bioStop, bsCfg: BS, bfind: (a) => pool.call('bfind', a),
  click(px, py, btn = 0) {   // 无真实输入时的模拟：CSS 像素，btn 0 = 左键（钉住）/ 2 = 右键（选区）
    hov = pick(px, py); const p = hov.p;
    if (btn === 0) setSelCol(pinBox(p), p); else rightClick(p);
    return { p };
  },
  hover(px, py) { hov = pick(px, py); readout(); hoverPanel(); frame(); return { p: hov.p, d2: !!hov.d2 }; },   // 模拟悬停（CSS 像素，地图左上为原点）
  /** 侧视投影轮廓（正交视角的天际线）：沿视线轴取每列最高实体与「顶块下方是空气」的中空列。
      { view:'south'|'north'|'east'|'west', x, z, width=128, span=64, n=97 }
      → { min, max, relief, hollows, points:[{t,top,hollow,have}] }（hollows = 有悬挑/拱洞的射线数） */
  silhouette(o = {}) {
    const v = ['north', 'south', 'east', 'west'].includes(o.view) ? o.view : 'south';
    const cx = Math.round(o.x ?? S.x), cz = Math.round(o.z ?? S.z);
    const span = Math.round(o.span ?? 64), width = Math.round(o.width ?? 128), n = Math.max(8, Math.min(256, o.n ?? 97));
    const horizX = v === 'south' || v === 'north', c = horizX ? cx : cz, from = c - (width >> 1), to = c + (width >> 1);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = Math.round(from + (to - from) * i / (n - 1));
      let top = -1, hollow = 0, have = true;
      for (let s = -span; s <= span; s += 2) {
        const x = horizX ? t : cx + s, z = horizX ? cz + s : t;
        let y = -1;
        for (let yy = H - 1; yy >= 0; yy--) { const vv = store.get(x, yy, z); if (vv < 0) { have = false; break; } if (vv > 0) { y = yy; break; } }
        if (y > top) top = y;
        if (have && y > 0) {   // 悬挑 / 拱：顶块下 6 格内有空气
          for (let k = 1; k <= 4; k++) if (store.get(x, y - k, z) === 0) { hollow++; break; }
        }
      }
      pts.push({ t, top, hollow, have });
    }
    const tops = pts.filter(p => p.have && p.top >= 0).map(p => p.top);
    return { view: v, x: cx, z: cz, width, span, min: tops.length ? Math.min(...tops) : -1, max: tops.length ? Math.max(...tops) : -1,
      relief: tops.length ? Math.max(...tops) - Math.min(...tops) : -1, hollows: pts.reduce((a, p) => a + p.hollow, 0), points: pts };
  },
  /** 竖直剖面：沿 x 或 z 线取每列「最高实体 / 下方空气格 / 是否中空」，给 Agent 读天际线与拱洞。
      { axis:'x'|'z', at, from, to, n } → { min, max, relief, hollows, points:[{t,top,air,firstAir,have}] } */
  profile(o = {}) {
    const axis = o.axis === 'z' ? 'z' : 'x', at = Math.round(o.at ?? 0);
    const from = Math.round(o.from ?? -64), to = Math.round(o.to ?? 64), n = Math.max(2, Math.min(512, o.n ?? 129));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = Math.round(from + (to - from) * i / (n - 1));
      const x = axis === 'x' ? t : at, z = axis === 'z' ? t : at;
      let top = -1, have = true;
      for (let y = H - 1; y >= 0; y--) { const v = store.get(x, y, z); if (v < 0) { have = false; break; } if (v > 0) { top = y; break; } }
      let air = 0, firstAir = -1;
      if (have) for (let y = Math.max(0, top - 1); y >= 0; y--) if (store.get(x, y, z) === 0) { air++; if (firstAir < 0) firstAir = y; }
      pts.push({ t, top, air, firstAir, have });
    }
    const tops = pts.filter(p => p.have && p.top >= 0).map(p => p.top);
    const min = tops.length ? Math.min(...tops) : -1, max = tops.length ? Math.max(...tops) : -1;
    return { axis, at, from, to, n, min, max, relief: max - min, hollows: pts.filter(p => p.have && p.air > 0).length, points: pts };
  },
  gameUrl,
  peer: () => peer,   // 游戏标签页最近一次广播的 { p1:[x,z,y,yaw], xhair（准星落点）, pv }
  copied: () => copied,
  // 一键提交（同 → Agent 按钮 / Ctrl+⏎）：{ dry:true } 只返回要发的内容；否则发出去并返回 { sent }
  async submit(o = {}) { const b = await buildSubmit(o.note); return o.dry ? b : { sent: toAgent('submit', b) }; },
  errors() { return errs.splice(0); },
  state: () => ({ ...S }),
  // 对拍用：一块的规范体素（base64）
  chunk(cx, cz) { const r = store.map.get(key(cx, cz)); if (!r) return null; const u8 = new Uint8Array(r.blocks.buffer); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); },
};

restart();
