/* gode/viz/cavejob.js —— 洞穴分析的主线程一侧：把 Store 里已载入的体素压成 mask（口径见 cave.js），交给 Worker，回来的结果给渲染（厚度纹理）和 viz.cave()（数字）。
   盒 = 以 (cx, cz) 为中心、半边 r 格（对齐到区块，并裁到 3D 窗口里）× 地表最高点以下；只含已载入的块。 */
import { key } from './store.js';

const TREE = /_(leaves|log|wood|stem)$|^(vine|cactus)$/;
let worker = null, seq = 0;
const pend = new Map();

function post(msg, transfer) {
  if (!worker) {
    worker = new Worker(new URL('./cave.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const p = pend.get(e.data.id); pend.delete(e.data.id); if (p) e.data.err ? p.rej(new Error(e.data.err)) : p.res(e.data); };
    worker.onerror = (e) => { for (const p of pend.values()) p.rej(new Error('cave worker: ' + (e.message || 'load error'))); pend.clear(); worker = null; };
  }
  return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); worker.postMessage({ id, ...msg }, transfer); });
}

export function buildMask(store, meta, cx, cz, r) {
  if (!store.w3) return null;
  const H = store.H, [wx, wz] = store.win, ccx = Math.floor(cx) >> 4, ccz = Math.floor(cz) >> 4, nr = Math.max(1, Math.ceil(r / 16));
  const ax = Math.max(ccx - nr, wx), bx = Math.min(ccx + nr - 1, wx + store.w3 - 1), az = Math.max(ccz - nr, wz), bz = Math.min(ccz + nr - 1, wz + store.w3 - 1);
  if (bx < ax || bz < az) return null;
  const recs = []; let maxH = -1;
  for (let j = az; j <= bz; j++) for (let i = ax; i <= bx; i++) {
    const rec = store.map.get(key(i, j)); if (!rec) continue;
    recs.push(rec); for (let c = 0; c < 256; c++) if (rec.heights[c] > maxH) maxH = rec.heights[c];
  }
  if (!recs.length) return null;
  const BX = (bx - ax + 1) * 16, BZ = (bz - az + 1) * 16, BY = Math.min(H, maxH + 2), sy = BX * BZ;
  const kind = new Uint8Array(4096);   // 0 非实体 1 实体 2 树（树当实体算距离源，但不算地面）3 水
  (meta.names ?? []).forEach((nm, i) => { if (i < 4096) kind[i] = store.cls[i] === 1 ? (TREE.test(nm) ? 2 : 1) : store.cls[i] === 2 ? 3 : 0; });
  const mask = new Uint8Array(sy * BY).fill(2);
  for (const rec of recs) {
    const ox = (rec.cx - ax) * 16, oz = (rec.cz - az) * 16, bl = rec.blocks;
    for (let zl = 0; zl < 16; zl++) for (let xl = 0; xl < 16; xl++) {
      const c = (zl << 4) | xl;
      let g = BY - 1; while (g >= 0 && kind[bl[(g << 8) | c] & 0xfff] !== 1) g--;   // 地面 = 最高的非树实体
      for (let y = 0, k = (oz + zl) * BX + ox + xl; y < BY; y++, k += sy) { const kd = kind[bl[(y << 8) | c] & 0xfff]; mask[k] = kd === 1 || kd === 2 ? 0 : y < g ? (kd === 3 ? 6 : 1) : 2; }
    }
  }
  return { mask, BX, BY, BZ, x0: ax * 16, z0: az * 16 };
}

// 分析一次；返回 null = 还没有可分析的块。结果里的 T 是 (y*BZ+z)*BX+x 的厚度字节（距离 × 8，0 = 不是洞窟空气）
export async function analyze(store, meta, cx, cz, r, { orphMax = 64, minR = 0, dropN = 4 } = {}) {
  const m = buildMask(store, meta, cx, cz, r); if (!m) return null;
  const { mask, ...box } = m, rev = store.rev, t0 = performance.now();
  const res = await post({ mask, ...box, orphMax, minR, dropN }, [mask.buffer]);
  return { ...res, ...box, rev, cx, cz, r, orphMax, minR, dropN, ms: Math.round(performance.now() - t0), msWorker: res.ms };
}

const pct = (h, q) => { let t = 0; for (const v of h) t += v; if (!t) return null; let a = 0; for (let b = 0; b < h.length; b++) { a += h[b]; if (a >= q * t) return b / 2; } return (h.length - 1) / 2; };
const r2 = (v) => v === null ? null : Math.round(v * 100) / 100;

// 盒内整体数字 + 某层（y ± band）的数字；层的 comp / big 按该层里出现的连通域数、属于盒内最大域的格占比
export function summarize(a, y, band = 2) {
  const { BINS, BY } = a, hist = new Int32Array(BINS), out = {
    box: [a.x0, a.z0, a.x0 + a.BX - 1, a.z0 + a.BZ - 1], ymax: BY - 1, ms: a.ms, open: a.open };
  for (let k = 0; k < BY; k++) for (let b = 0; b < BINS; b++) hist[b] += a.hy[k * BINS + b];
  let ridge = 0, thin = 0; hist.forEach((v, b) => { ridge += v; if (b <= 3) thin += v; });
  Object.assign(out, { r50: pct(hist, 0.5), r90: pct(hist, 0.9), rmax: ridge ? hist.findLastIndex(v => v) / 2 : null, thin: ridge ? r2(thin / ridge) : null,
    comp: a.comp, big: a.open ? r2(a.big / a.open) : null, orph: a.orph, orphMax: a.orphMax, minR: a.minR, kept: a.open ? r2(a.kept / a.open) : null,
    drop: { n: a.dropN, cols: a.dropCols, shafts: a.shafts, max: a.dropMax } });
  if (y != null && y >= 0 && y < BY) {
    const lo = Math.max(0, y - band), hi = Math.min(BY - 1, y + band), h = new Int32Array(BINS); let open = 0, big = 0, comps = 0, rd = 0, th = 0, dr = 0;
    for (let k = lo; k <= hi; k++) { open += a.layOpen[k]; big += a.layBig[k]; dr += a.layDrop[k]; comps = Math.max(comps, a.layComp[k]); for (let b = 0; b < BINS; b++) h[b] += a.hy[k * BINS + b]; }
    h.forEach((v, b) => { rd += v; if (b <= 3) th += v; });
    out.at = { y, band, open, r50: pct(h, 0.5), r90: pct(h, 0.9), thin: rd ? r2(th / rd) : null, comp: comps, big: open ? r2(big / open) : null, dropCells: dr };
  }
  return out;
}
