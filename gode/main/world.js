/* gode/main/world.js —— 权威世界镜像（s01 §1、s02 §3）：main 持有区块 Map，slicer 池只生成 / 出网格。
   区块 = { cx, cz, blocks: Uint16(YZX 65536), light: Uint8(sky<<4|blk), biomes, heights, rev }；type = v & 0xfff，meta = v >> 12（s02 §1）。
   流式加载：以玩家为中心、按距离从近到远向池要 gen（带 light），超出 rd + 2 的卸载。
   跨块装饰：gen 应答的 outside（[x,y,z,v,soft]…）→ 落在已加载块的直接写（按 soft 规则），落在未加载块的进挂起表，块到达时先应用挂起表（s02 §3，语义同宿主 B applyPending）。
   事件：onChunk(cb(cx, cz, 'blocks' | 'gone'))；'blocks' = 新到 / 被改（渲染器按段哈希去重，没变的段不重做）。
   TODO(M1-8)：改块与 outside 合并之后的增量光照、跨块光照接缝；现在块内光照是 slicer 的初始光照，块边界外不看。 */
export const H = 256;
export const key = (cx, cz) => cx + ',' + cz;

export class World {
  constructor(pool, meta, tbl) {
    this.pool = pool; this.meta = meta; this.tbl = tbl;
    this.chunks = new Map(); this.pending = new Map(); this.inflight = new Set(); this.cbs = [];
    this.REV = 0; this.order = []; this.center = null; this.rd = 8;
    this.over = Object.fromEntries(Object.entries(meta.over ?? {}).map(([k, a]) => [k, new Set(a)]));   // soft 规则 → 除空气外可覆盖的 type（s02 §2）
    this.n = { gen: 0, genMs: 0, lightMs: 0, outside: 0, parked: 0, merged: 0, errs: 0 };
    this.errs = [];
  }
  onChunk(cb) { this.cbs.push(cb); }
  emit(cx, cz, what) { for (const f of this.cbs) f(cx, cz, what); }

  chunk(cx, cz) { return this.chunks.get(key(cx, cz)); }
  /** 世界坐标 → u16（type | meta<<12）；未加载 / y 越界 = 0 */
  get(x, y, z) {
    if (y < 0 || y >= H) return 0;
    const c = this.chunks.get(key(x >> 4, z >> 4));
    return c ? c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0;
  }
  getBlock(x, y, z) { return this.get(x, y, z) & 0xfff; }
  loaded(x, z) { return this.chunks.has(key(x >> 4, z >> 4)); }
  /** 光照 sky<<4|blk；未加载 = 满天光；y < 0 = 0（同宿主 B） */
  lightAt(x, y, z) {
    if (y < 0) return 0; if (y >= H) return 0xf0;
    const c = this.chunks.get(key(x >> 4, z >> 4));
    return c ? c.light[(y << 8) | ((z & 15) << 4) | (x & 15)] : 0xf0;
  }
  /** 改一格（权威写入口）：返回是否真的变了。光照增量留给 M1-8。 */
  set(x, y, z, v) {
    if (y < 0 || y >= H) return false;
    const c = this.chunks.get(key(x >> 4, z >> 4)); if (!c) return false;
    const i = (y << 8) | ((z & 15) << 4) | (x & 15);
    if (c.blocks[i] === v) return false;
    const old = c.blocks[i]; c.blocks[i] = v; c.rev = ++this.REV;
    const col = ((z & 15) << 4) | (x & 15);
    if (v && y > c.heights[col]) c.heights[col] = y; else if (!v && y === c.heights[col]) { let h = y - 1; while (h >= 0 && !c.blocks[(h << 8) | col]) h--; c.heights[col] = h; }
    this.emit(c.cx, c.cz, 'blocks');
    for (const f of this.blockCbs ?? []) f(x, y, z, { oldId: old & 0xfff, id: v & 0xfff, oldMeta: old >> 12, meta: v >> 12 });
    return true;
  }
  onBlock(cb) { (this.blockCbs ??= []).push(cb); }

  // outside 一条：返回被写的区块（没写 / 进挂起表 = null）
  put(x, y, z, v, soft) {
    if (y < 0 || y >= H) return null;
    const cx = x >> 4, cz = z >> 4, c = this.chunks.get(key(cx, cz));
    if (!c) { const k = key(cx, cz); let a = this.pending.get(k); if (!a) this.pending.set(k, a = []); a.push(x, y, z, v, soft); this.n.parked++; return null; }
    const i = (y << 8) | ((z & 15) << 4) | (x & 15), old = c.blocks[i] & 0xfff;
    if (soft && old !== 0 && !this.over[soft]?.has(old)) return null;
    if (c.blocks[i] === v) return null;
    c.blocks[i] = v; const col = ((z & 15) << 4) | (x & 15);
    if ((v & 0xfff) && y > c.heights[col]) c.heights[col] = y;
    this.n.merged++; return c;
  }

  // 一个 gen 应答 → 入 Map、合并挂起表和 outside、通知
  accept(r) {
    const k = key(r.cx, r.cz);
    this.inflight.delete(k);
    const c = { cx: r.cx, cz: r.cz, blocks: r.blocks, light: r.light, biomes: r.biomes, heights: r.heights, rev: ++this.REV };
    this.n.gen++; this.n.genMs += r.ms; this.n.lightMs += r.lms ?? 0;
    const touched = new Map();
    const mine = this.pending.get(k);
    if (mine) {   // 先写进来再登记：挂起条目落在本块，不会再进挂起表
      this.pending.delete(k);
      this.chunks.set(k, c);
      for (let i = 0; i < mine.length; i += 5) this.put(mine[i], mine[i + 1], mine[i + 2], mine[i + 3], mine[i + 4]);
    } else this.chunks.set(k, c);
    const o = r.outside;
    for (let i = 0; i < o.length; i += 5) {
      this.n.outside++;
      const t = this.put(o[i], o[i + 1], o[i + 2], o[i + 3], o[i + 4]);
      if (t && t !== c) touched.set(key(t.cx, t.cz), t);
    }
    for (const t of touched.values()) { t.rev = ++this.REV; this.emit(t.cx, t.cz, 'blocks'); }
    this.emit(c.cx, c.cz, 'blocks');
  }

  /** 每帧 / 池空闲时：按距离向池要缺的区块；卸载远处的。px, pz = 玩家世界坐标 */
  update(px, pz, rd) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    if (!this.center || this.center[0] !== pcx || this.center[1] !== pcz || this.rd !== rd) {
      this.center = [pcx, pcz]; this.rd = rd;
      const o = [], R2 = (rd + 0.5) ** 2;
      for (let dz = -rd; dz <= rd; dz++) for (let dx = -rd; dx <= rd; dx++) { const d = dx * dx + dz * dz; if (d <= R2) o.push([d, pcx + dx, pcz + dz]); }
      o.sort((a, b) => a[0] - b[0]); this.order = o;
      const keep = (rd + 2.5) ** 2;
      for (const [k, c] of this.chunks) if ((c.cx - pcx) ** 2 + (c.cz - pcz) ** 2 > keep) { this.chunks.delete(k); this.emit(c.cx, c.cz, 'gone'); }
    }
    this.pump();
  }
  pump() {
    for (const [, cx, cz] of this.order) {
      const k = key(cx, cz);
      if (this.chunks.has(k) || this.inflight.has(k)) continue;
      const ok = this.pool.job('gen', { cx, cz, light: true },
        r => this.accept(r),
        () => { this.inflight.delete(k); this.n.errs++; });
      if (!ok) return;
      this.inflight.add(k);
    }
  }
  /** 视距内是否都到齐（settle 判据） */
  settled() { return this.inflight.size === 0 && this.order.every(([, cx, cz]) => this.chunks.has(key(cx, cz))); }

  // 重置（换种子 / 生成器热重置）：丢掉所有区块，通知渲染器
  reset() {
    for (const c of [...this.chunks.values()]) this.emit(c.cx, c.cz, 'gone');
    this.chunks.clear(); this.pending.clear(); this.inflight.clear(); this.center = null;
  }
}
