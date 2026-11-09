/* gode/viz/layers.js —— 图层（s13 V2）：叠在地图上的单选叠加层，只在俯视 / 仰视画（逐列的量，侧视没有意义）。
   · tree（树种）：每列最上面的实体若是树叶 / 树干，按种着色（species.js；各生成器通用）。数据 = Store 的 2D 列，3D 窗口和外圈都有，换块时逐块重画。
   · f:<字段>（场热力图）：生成器 sample() 返回的每个数值字段（大陆度、温度、高度估计……）。走 slicer 的 field 动词，
     每 TILE 格一块、每 STEP 格取一点（16×16 个点），只取视野内的块，按块缓存；色阶取已载入数据的 2%…98% 分位。
   以后加图层 = 在 list() 里多一项 + 在 colorChunk / colorTile 里多一个分支。 */
import { speciesTable } from './species.js';

export const TILE = 64, STEP = 4, TN = TILE / STEP;
const RAMP = [[0, [40, 60, 200]], [0.25, [40, 190, 220]], [0.5, [70, 200, 70]], [0.75, [240, 220, 50]], [1, [220, 40, 40]]];
export const ramp = (t) => {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  for (let i = 1; i < RAMP.length; i++) if (t <= RAMP[i][0]) { const [a, ca] = RAMP[i - 1], [b, cb] = RAMP[i], u = (t - a) / (b - a); return ca.map((v, k) => Math.round(v + (cb[k] - v) * u)); }
  return RAMP.at(-1)[1];
};
export const rampCss = () => `linear-gradient(90deg, ${RAMP.map(([t, c]) => `rgb(${c}) ${t * 100}%`).join(', ')})`;
const floorDiv = (a, b) => Math.floor(a / b);
const cnv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

export class Layers {
  constructor(canvas) { this.cv = canvas; this.id = 'none'; this.op = 0.75; this.fields = []; this.reset(null); }
  reset(meta) {   // 换生成器 / 种子 / 参数：全部丢掉
    this.meta = meta; this.sp = speciesTable(meta?.names); this.chunks = new Map(); this.tiles = new Map(); this.pend = new Set();
    this.vals = new Map(); this.rng = new Map(); this.rver = 0; this.gen = (this.gen ?? 0) + 1;
  }
  setFields(keys) { this.fields = keys; }
  list() { return [{ id: 'none', name: '无' }, ...this.fields.map(k => ({ id: 'f:' + k, name: k, kind: 'num' })), { id: 'tree', name: '树种', kind: 'cat' }]; }
  valid(id) { return this.list().some(l => l.id === id); }
  dropChunk(cx, cz) { this.chunks.delete(cx + ',' + cz); }

  // ---- 树种：每块一张 16×16 ----
  colorChunk(a) {
    const c = cnv(16, 16), g = c.getContext('2d'), im = g.createImageData(16, 16), { sp, kind, color } = this.sp;
    for (let i = 0; i < 256; i++) {
      const t = a[i * 4], s = sp[t];
      if (!s) { im.data[i * 4 + 3] = 110; continue; }   // 非树的列压暗，树更醒目
      const rgb = color[s], f = kind[t] === 2 ? 0.7 : 1;   // 树干比树叶深一点
      im.data[i * 4] = (rgb >> 16 & 255) * f; im.data[i * 4 + 1] = (rgb >> 8 & 255) * f; im.data[i * 4 + 2] = (rgb & 255) * f; im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0); return c;
  }
  speciesAt(store, x, z) {
    const a = store.cols.get((x >> 4) + ',' + (z >> 4)); if (!a) return null;
    const t = a[(((z & 15) << 4) | (x & 15)) * 4]; return this.sp.sp[t] ? { name: this.sp.list[this.sp.sp[t]], log: this.sp.kind[t] === 2 } : null;
  }

  // ---- 场热力图：按块取数 ----
  ensureTiles(pool, rect, onGot) {   // rect = [x0, z0, x1, z1] 世界坐标；缺的块发 field 请求（最多 10 个在途）
    const k = this.id.slice(2); if (!k || !pool) return;
    const t0x = floorDiv(rect[0], TILE) - 1, t1x = floorDiv(rect[2], TILE) + 1, t0z = floorDiv(rect[1], TILE) - 1, t1z = floorDiv(rect[3], TILE) + 1;
    const need = []; for (let tz = t0z; tz <= t1z; tz++) for (let tx = t0x; tx <= t1x; tx++) { const kk = tx + ',' + tz; if (!this.tiles.has(kk) && !this.pend.has(kk)) need.push([tx, tz]); }
    const cx = (rect[0] + rect[2]) / 2 / TILE, cz = (rect[1] + rect[3]) / 2 / TILE;
    need.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
    const gen = this.gen;
    for (const [tx, tz] of need) {
      if (this.pend.size >= 10) break;
      const kk = tx + ',' + tz; this.pend.add(kk);
      pool.call('field', { x0: tx * TILE, z0: tz * TILE, n: TN, step: STEP }).then((r) => {
        if (gen !== this.gen) return;
        this.pend.delete(kk); this.tiles.set(kk, { r, cv: null, ver: -1, key: null });
        for (const f in r.data) this.feed(f, r.data[f]);
        onGot();
      }, () => { if (gen === this.gen) this.pend.delete(kk); });
    }
  }
  feed(f, arr) {   // 攒一份样本算分位范围
    const v = this.vals.get(f) ?? [], step = Math.max(1, arr.length >> 5);
    for (let i = 0; i < arr.length; i += step) v.push(arr[i]);
    this.vals.set(f, v);
    const s = Float32Array.from(v).sort(), lo = s[Math.floor(s.length * 0.02)], hi = s[Math.min(s.length - 1, Math.floor(s.length * 0.98))], old = this.rng.get(f);
    if (!old || Math.abs(lo - old[0]) + Math.abs(hi - old[1]) > (old[1] - old[0]) * 0.03 + 1e-9) { this.rng.set(f, [lo, hi]); this.rver++; }
  }
  range(f) { return this.rng.get(f) ?? null; }
  colorTile(tile, f) {
    const arr = tile.r.data[f], [lo, hi] = this.range(f) ?? [0, 1], span = hi - lo || 1;
    const c = tile.cv ?? (tile.cv = cnv(TN, TN)), g = c.getContext('2d'), im = g.createImageData(TN, TN);
    for (let i = 0; i < TN * TN; i++) { const [r, gg, b] = ramp((arr[i] - lo) / span); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
    g.putImageData(im, 0, 0); tile.ver = this.rver; tile.key = f;
  }
  fieldAt(x, z) {
    const f = this.id.slice(2), tile = this.tiles.get(floorDiv(x, TILE) + ',' + floorDiv(z, TILE)), arr = tile?.r.data[f]; if (!arr) return null;
    const i = Math.min(TN - 1, Math.floor((x - tile.r.x0) / STEP)), j = Math.min(TN - 1, Math.floor((z - tile.r.z0) / STEP));
    return arr[j * TN + i];
  }

  // ---- 画：W/H = 画布 CSS 尺寸；sx / sz = 世界 x / z → 屏幕 px（带翻转）；rect = 视野的世界范围 ----
  draw({ store, pool, W, H, sx, sz, zoom, rect, on, onGot }) {
    const k = devicePixelRatio || 1, c = this.cv;
    if (c.width !== Math.round(W * k) || c.height !== Math.round(H * k)) { c.width = Math.round(W * k); c.height = Math.round(H * k); }
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, W, H);
    if (!on || this.id === 'none' || !store) return;
    g.imageSmoothingEnabled = false; g.globalAlpha = this.op;
    const blit = (img, x0, z0, size) => {   // 世界方块 [x0, x0+size) × [z0, z0+size)
      const a = sx(x0), b = sx(x0 + size), d = sz(z0), e = sz(z0 + size);
      const l = Math.round(Math.min(a, b)), t = Math.round(Math.min(d, e));   // 取整对齐：块与块之间不叠、不留缝（半透明叠两层会出格线）
      g.drawImage(img, l, t, Math.round(Math.max(a, b)) - l, Math.round(Math.max(d, e)) - t);
    };
    if (this.id === 'tree') {
      for (let cz = floorDiv(rect[1], 16); cz <= floorDiv(rect[3], 16); cz++) for (let cx = floorDiv(rect[0], 16); cx <= floorDiv(rect[2], 16); cx++) {
        const kk = cx + ',' + cz, a = store.cols.get(kk); if (!a) continue;
        let img = this.chunks.get(kk); if (!img) this.chunks.set(kk, img = this.colorChunk(a));
        blit(img, cx * 16, cz * 16, 16);
      }
    } else {
      const f = this.id.slice(2);
      this.ensureTiles(pool, rect, onGot);
      for (const tile of this.tiles.values()) {
        const { x0, z0 } = tile.r;
        if (x0 + TILE < rect[0] || x0 > rect[2] || z0 + TILE < rect[1] || z0 > rect[3] || !tile.r.data[f]) continue;
        if (tile.ver !== this.rver || tile.key !== f) this.colorTile(tile, f);
        blit(tile.cv, x0 - STEP / 2, z0 - STEP / 2, TILE);
      }
    }
    g.globalAlpha = 1;
  }

  // ---- 图例 ----
  legend(store) {
    if (this.id === 'tree') {
      const { list, color } = this.sp;
      return list.slice(1).map((n, i) => `<span class="sw"><i style="background:#${color[i + 1].toString(16).padStart(6, '0')}"></i>${n}</span>`).join('') || '（这个生成器没有树）';
    }
    if (this.id.startsWith('f:')) {
      const r = this.range(this.id.slice(2)); const fmt = (v) => +v.toFixed(3);
      return r ? `<div class="bar" style="background:${rampCss()}"></div><div class="lr"><span>${fmt(r[0])}</span><span title="色阶取已载入数据的 2%…98% 分位">${this.id.slice(2)}</span><span>${fmt(r[1])}</span></div>` : '加载中…';
    }
    return '';
  }
  valueAt(store, x, z) {
    if (this.id === 'tree') { const s = this.speciesAt(store, x, z); return s ? `${s.name}${s.log ? '（树干）' : ''}` : '—'; }
    if (this.id.startsWith('f:')) { const v = this.fieldAt(x, z); return v === null ? '…' : +v.toFixed(4); }
    return null;
  }
}
