/* gode/viz/store.js —— pgviz 主线程的区块表（CPU 侧）：3D 窗口（整块体素，≤ 48²）+ 外圈 2D（列级地表，≤ 80²，s13 V-8）、
   跨块溢出合并（s02 §3）、CPU 步进（悬停 / 空气距离 / C4）。
   溢出不用挂起表：每块保留自己的 outside，块到达时 ① 把它的 outside 写进已载入的邻块 ② 把已载入邻块 outside 里落在本块的写进来。
   与「先到先写」等价（唯一例外：两棵树冠在同一邻块同一格抢写树叶，取较小的值，使结果与到达顺序无关），且窗口移动丢块再回来时邻块的树冠不会丢。soft 规则：0 = 直写；k ≥ 1 = 只覆盖空气或 meta.over[k] 里的 type。
   2D 列：Int16×4 = [实体 type, 实体 y, 群系, 水深]（w/slicer.js colReduce）；3D 块的列在主线程由体素算（含溢出），外圈的由 worker 的 col 动词给。 */
import { cls } from './palette.js';
import { colReduce } from '../w/slicer.js';

export const key = (cx, cz) => cx + ',' + cz;

export class Store {
  constructor(meta) {
    this.meta = meta; this.H = meta.h ?? 256;
    this.map = new Map();                    // 3D：key → { cx, cz, blocks, biomes, heights, outside }
    this.cols = new Map();                   // 2D：key → Int16Array(1024)
    this.w3 = 0; this.win = [0, 0];          // 3D 窗口边长（区块）与最小区块
    this.w2 = 0; this.win2 = [0, 0];
    this.over = {};
    for (const k in meta.over ?? {}) { const s = this.over[k] = new Uint8Array(4096); for (const t of meta.over[k]) s[t] = 1; }
    this.leaf = new Uint8Array(4096); (meta.names ?? []).forEach((n, i) => { if (i < 4096 && /_leaves$/.test(n)) this.leaf[i] = 1; });
    this.cls = new Uint8Array(4096); (meta.names ?? []).forEach((n, i) => { if (i < 4096) this.cls[i] = cls(n); });
    this.c4pre = 0;                          // 到达时（合并前）生成器 heights 与体素 top 的差异累计
  }
  inWin(cx, cz) { const [x0, z0] = this.win; return cx >= x0 && cz >= z0 && cx < x0 + this.w3 && cz < z0 + this.w3; }
  inWin2(cx, cz) { const [x0, z0] = this.win2; return cx >= x0 && cz >= z0 && cx < x0 + this.w2 && cz < z0 + this.w2; }
  // 以区块 (ccx, ccz) 为中心定两个窗口；返回丢掉的 3D 块与 2D 列的 key
  center(ccx, ccz, w3, w2) {
    this.w3 = w3; this.w2 = w2;
    this.win = [ccx - (w3 >> 1), ccz - (w3 >> 1)]; this.win2 = [ccx - (w2 >> 1), ccz - (w2 >> 1)];
    const drop3 = [], drop2 = [];
    for (const [k, r] of this.map) if (!this.inWin(r.cx, r.cz)) { drop3.push(r); this.map.delete(k); }
    for (const k of this.cols.keys()) { const [x, z] = k.split(',').map(Number); if (!this.inWin2(x, z)) { drop2.push(k); this.cols.delete(k); } }
    return { drop3, drop2 };
  }
  // 待生成：3D 窗口缺整块的、外圈缺列的；各自最近优先
  missing(ccx, ccz, busy) {
    const d = (a) => Math.hypot(a[0] - ccx, a[1] - ccz);
    const n3 = [], n2 = [], [x0, z0] = this.win2;
    for (let cz = z0; cz < z0 + this.w2; cz++) for (let cx = x0; cx < x0 + this.w2; cx++) {
      const k = key(cx, cz);
      if (this.inWin(cx, cz)) { if (!this.map.has(k) && !busy.has('g' + k)) n3.push([cx, cz]); }
      else if (!this.cols.has(k) && !busy.has('c' + k)) n2.push([cx, cz]);
    }
    return { n3: n3.sort((a, b) => d(a) - d(b)), n2: n2.sort((a, b) => d(a) - d(b)) };
  }
  // 收一块；返回被改动的块（含自己），供重新上传（体素 + 列）
  put(g) {
    const rec = { cx: g.cx, cz: g.cz, blocks: g.blocks, biomes: g.biomes, heights: g.heights, outside: g.outside, ms: g.ms, wrote: new Set() };
    for (let c = 0; c < 256; c++) if (top(rec.blocks, c, this.H) !== rec.heights[c]) this.c4pre++;
    this.map.set(key(rec.cx, rec.cz), rec);
    const touched = new Set([rec]);
    if (rec.outside.length) for (const t of this.apply(rec.outside, null)) touched.add(t);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.map.get(key(rec.cx + dx, rec.cz + dz));
      if (n?.outside.length) this.apply(n.outside, rec);
    }
    for (const r of touched) this.cols.set(key(r.cx, r.cz), colReduce(r.blocks, r.biomes, this.cls, this.cols.get(key(r.cx, r.cz))));
    return touched;
  }
  putCol(m) { const k = key(m.cx, m.cz); if (this.map.has(k)) return false; this.cols.set(k, m.col); return true; }
  // 写 outside；only = 只写进这一块（null = 所有已载入块）
  apply(o, only) {
    const touched = new Set();
    for (let i = 0; i < o.length; i += 5) {
      const x = o[i], y = o[i + 1], z = o[i + 2], v = o[i + 3], soft = o[i + 4];
      if (y < 0 || y >= this.H) continue;
      const r = only ?? this.map.get(key(x >> 4, z >> 4));
      if (!r || (x >> 4) !== r.cx || (z >> 4) !== r.cz) continue;
      const c = (z & 15) * 16 + (x & 15), j = (y << 8) | c, cur = r.blocks[j];
      if (soft && cur && !this.over[soft]?.[cur & 0xfff]) {
        // 两棵树冠（outside）抢同一格：先到先得会让结果取决于到达顺序，改取较小的值（只在本格已被 outside 写过时；块自己的树叶仍然优先）
        if (!(r.wrote?.has(j) && this.leaf[cur & 0xfff] && this.leaf[v & 0xfff] && v < cur)) continue;
      }
      if (soft && v) r.wrote?.add(j);
      r.blocks[j] = v; touched.add(r);
      if (v && y > r.heights[c]) r.heights[c] = y;
      else if (!v && y === r.heights[c]) r.heights[c] = top(r.blocks, c, this.H);
    }
    return touched;
  }
  get(x, y, z) {
    if (y < 0 || y >= this.H) return 0;
    const r = this.map.get(key(x >> 4, z >> 4));
    return r ? r.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)] : -1;
  }
  // 列信息：3D 块给 heights（最高非空气）+ 地表；外圈只有地表 → { h, biome, type, y, wd, d2 }
  col(x, z) {
    const k = key(x >> 4, z >> 4), c = ((z & 15) << 4) | (x & 15), a = this.cols.get(k), r = this.map.get(k);
    if (!a && !r) return null;
    return { h: r ? r.heights[c] : (a ? a[c * 4 + 1] + a[c * 4 + 3] : -1), biome: r ? r.biomes[c] : a[c * 4 + 2], type: a?.[c * 4], y: a?.[c * 4 + 1], wd: a?.[c * 4 + 3], d2: !r };
  }
  // 与着色器同一规则的 CPU 步进：从 p 沿 f（单位轴向量）走到 end（含）→ { hit:[x,y,z]|null, v, dist, wd, water:[…]|null }
  march(p, f, end) {
    const a = f[0] ? 0 : f[1] ? 1 : 2, dir = f[a], c = p.slice();
    let dist = 0, wd = 0, water = null, known = false;
    for (; (end - c[a]) * dir >= 0; c[a] += dir) {
      const v = this.get(c[0], c[1], c[2]);
      if (v < 0) { if (a === 1 || known) break; dist++; continue; }
      known = true;
      if (v) { const k = this.cls[v & 0xfff]; if (k === 1) return { hit: c.slice(), v, dist, wd, water, known }; if (k === 2) { if (!wd) water = c.slice(); wd++; } }
      if (!wd) dist++;
    }
    return { hit: null, v: 0, dist, wd, water, known };
  }
  // C4：体素里读出的 top 与 heights（生成器给、合并时维护）逐格比；加上到达时的累计
  c4() {
    let d = 0;
    for (const r of this.map.values()) for (let c = 0; c < 256; c++) if (top(r.blocks, c, this.H) !== r.heights[c]) d++;
    return d + this.c4pre;
  }
}

export function top(b, c, H = 256) { let y = H - 1; while (y >= 0 && !b[(y << 8) | c]) y--; return y; }
