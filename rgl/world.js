// 区块记录 + 脏段调度 + Worker 网格化 + 上传（goodGL World.collectMeshJobs L2274 的宿主版）
//   宿主 A 只会发「某区块 blocks 变了 / 没了」（voxelCraftSource 把 buildChunk 一律映射成 'blocks'），所以
//   - 新区块：自己和 8 个邻居的段都要重网格化（AO / 平滑光照读邻格）；重建：自己 + 4 个边邻居
//   - 一个区块的 3×3 邻居都有了才网格化（同 goodGL 的 neighborsAtLeast），否则初始加载每块要被重做好几遍
import { WorkerPool } from '../vendor/gl/pool.js';
import { padded, sectionHasBlocks } from './xlate.js';
import { flagTable } from './blockclass.js';

const ST_LIT = 3;                          // R.cull 只看 state >= ST_LIT
const key = (cx, cz) => cx + ',' + cz;

// 宿主 A 没有群系：整块用平原的草 / 叶色（MC 平原 0x91bd59 / 0x77ab2f）。tint 数组是 256 列 × RGB，goodGL 的 meshSection 按列取
export function createWorld(R, source, lut, { seed = 1, grass = [0x91, 0xbd, 0x59], foliage = [0x77, 0xab, 0x2f] } = {}) {
  const H = source.height, NS = H >> 4;
  const pool = new WorkerPool(seed);
  const tG = new Uint8Array(768), tF = new Uint8Array(768);
  for (let c = 0; c < 256; c++) for (let k = 0; k < 3; k++) { tG[c * 3 + k] = grass[k]; tF[c * 3 + k] = foliage[k]; }   // render.md §3 的 tint 行：宿主 A = 常量
  const CLS = flagTable();                    // meshSection 的 CLS：草 = 不接收锐阴影（blockclass.js）
  const recs = new Map(); let inflight = 0, meshMs = 0, meshN = 0, quads = 0;

  const rec = (cx, cz) => {
    let r = recs.get(key(cx, cz));
    if (!r) { r = { cx, cz, state: ST_LIT, secCount: new Uint8Array(16), sections: Array.from({ length: 16 }, () => ({ dirty: false, pending: false, ver: 0, opaque: null, trans: null, meshed: false })) }; recs.set(key(cx, cz), r); }
    return r;
  };
  const markAll = (r) => { for (let s = 0; s < NS; s++) { const sec = r.sections[s]; if (r.secCount[s]) sec.dirty = true; else if (sec.meshed) { R.uploadSection(r, s, { opaque: null, on: 0, trans: null, tn: 0, plant: null, pn: 0 }); sec.meshed = false; sec.dirty = false; } } };
  const NB8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]], NB4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const markNeighbors = (cx, cz, list) => { for (const [dx, dz] of list) { const r = recs.get(key(cx + dx, cz + dz)); if (r) markAll(r); } };

  // 宿主事件：blocks = 建好 / 重建；gone = 卸载
  source.onChunkChanged((cx, cz, what) => {
    if (what === 'gone') {
      const r = recs.get(key(cx, cz)); if (r) { R.freeChunk(r); recs.delete(key(cx, cz)); }
      markNeighbors(cx, cz, NB8); return;
    }
    const fresh = !recs.has(key(cx, cz)), r = rec(cx, cz), ch = source.getChunk(cx, cz);
    if (!ch) return;
    for (let s = 0; s < NS; s++) r.secCount[s] = sectionHasBlocks(ch.blocks, H, s) ? 1 : 0;
    markAll(r); markNeighbors(cx, cz, fresh ? NB8 : NB4);
  });
  // 接管已经存在的区块（渲染器中途创建 / 热切换）
  source.forEachChunk((cx, cz) => { const ch = source.getChunk(cx, cz); if (!ch) return; const r = rec(cx, cz); for (let s = 0; s < NS; s++) r.secCount[s] = sectionHasBlocks(ch.blocks, H, s) ? 1 : 0; markAll(r); });

  const ready = (r) => { for (const [dx, dz] of NB8) if (!recs.has(key(r.cx + dx, r.cz + dz))) return false; return true; };

  /** 每帧：从离相机最近的区块开始提交脏段（最多 maxJobs 个），Worker 回包后上传 */
  function pump(px, py, pz, rd, maxJobs) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4, lim = (rd + 0.5) ** 2, ps = Math.floor(py) >> 4;
    const todo = [];
    for (const r of recs.values()) {
      const d2 = (r.cx - pcx) ** 2 + (r.cz - pcz) ** 2; if (d2 > lim) continue;
      let any = false; for (let s = 0; s < NS; s++) if (r.sections[s].dirty && !r.sections[s].pending) { any = true; break; }
      if (any) todo.push([d2, r]);
    }
    todo.sort((a, b) => a[0] - b[0]);
    let jobs = 0;
    for (const [, r] of todo) {
      if (jobs >= maxJobs) break;
      if (!ready(r)) continue;
      const order = []; for (let s = 0; s < NS; s++) order.push(s); order.sort((a, b) => Math.abs(a - ps) - Math.abs(b - ps));
      for (const s of order) {
        const sec = r.sections[s]; if (!sec.dirty || sec.pending) continue;
        sec.dirty = false;
        if (!r.secCount[s]) { R.uploadSection(r, s, { opaque: null, on: 0, trans: null, tn: 0, plant: null, pn: 0 }); sec.meshed = false; continue; }
        const { pb, pm, pl } = padded(source, lut, H, r.cx, r.cz, s);
        sec.pending = true; const ver = ++sec.ver, t0 = performance.now(); inflight++;
        pool.submit({ type: 'mesh', pb, pm, pl, tg: tG, tf: tF, cls: CLS, wx: r.cx * 16, wy: s * 16, wz: r.cz * 16 }, [pb.buffer, pm.buffer, pl.buffer], (res) => {
          inflight--; sec.pending = false; meshMs += performance.now() - t0; meshN++;
          if (ver !== sec.ver || recs.get(key(r.cx, r.cz)) !== r) return;       // 过期结果（段又脏了 / 区块没了）
          quads += ((res.on || 0) + (res.tn || 0) + (res.pn || 0)) >> 2; R.uploadSection(r, s, res);
        });
        if (++jobs >= maxJobs) break;
      }
    }
    if (pool.local) pool.pumpLocal(6);
    return jobs;
  }
  // 未完成的工作：在途 + 已经可以提交的脏段（bench 的 settle 等它归零；卡在环边缘、邻居永远不全的区块不算）
  function pending() {
    let n = inflight;
    for (const r of recs.values()) { if (!ready(r)) continue; for (let s = 0; s < NS; s++) { const sec = r.sections[s]; if (sec.dirty || sec.pending) n++; } }
    return n;
  }
  const stat = () => ({ chunks: recs.size, inflight, meshN, meshMsAvg: meshN ? meshMs / meshN : 0, quads, mode: pool.mode });
  return { chunk: (cx, cz) => recs.get(key(cx, cz)), pump, pending, stat, pool, recs };
}
