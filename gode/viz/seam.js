/* gode/viz/seam.js —— 区块接缝检查（preview_world.mjs seamCheck 的 pgviz 版，s02 §3 / s13）。
   用一个私有的单 Worker 池（不动页面主池），在几块样地上按两种到达顺序（正序 / 倒序，各自 onkwarg 重置一个全新生成器）逐块 gen →
   喂进一个全新的 Store（与页面同一份合并代码）。检查：
     raw     两种顺序下每块生成器原始输出（blocks / biomes / outside）逐位相等 —— 生成器无状态、与调用顺序无关
     merge   合并后的世界两种顺序逐格相等 —— 跨块写入（树冠）与到达顺序无关（同格树叶抢写由 Store 取较小值裁决）
     lost    每条落在已载入块里的 outside 要么写进去了、要么被同格别的写入覆盖、要么被 soft 规则合理跳过；否则算丢（树冠缺口）
     cross   跨块写入条数 > 0（样地里根本没有跨块树，检查就没有意义；用 at 换样地）
     c4      合并后每块 heights 与体素 top 一致
     border  块边界两侧地表（不算树 / 植物 / 水）高度差的均值 ≤ 块内相邻列的 1.5 倍 + 0.3（地形噪声 / 群系混合没有在块边界断开）
   meta.outside === false（goodGP：树靠邻块重算、不外写）时 cross / lost 不适用，只查 raw / merge / c4 / border。
   返回 { ok, msg, spots:[…], bad:[…] }；opts：at = [[cx,cz],…]（区块坐标；缺省 = 沿螺旋找 3 块林地，找不到退回原点附近），w = 样地边长（区块，默认 5）。 */
import { Pool } from './pool.js';
import { Store, key, top } from './store.js';

const FOREST = /forest|taiga|jungle|woods|savanna|swamp|dark/;   // 树密的群系：样地要有跨块树才有意义
const TREE = /_(leaves|log|wood|stem)$|^(vine|cactus)$/;

async function run(pool, kwarg, store, order, raw) {
  await pool.init(kwarg);   // 热重置：全新 Generator
  const outs = new Map();
  for (const [cx, cz] of order) {
    const g = await pool.call('gen', { cx, cz });
    raw.set(key(cx, cz), { blocks: g.blocks.slice(), biomes: g.biomes.slice(), outside: g.outside.slice() });
    outs.set(key(cx, cz), g.outside);
    store.put(g);
  }
  return outs;
}

const eqArr = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
function firstDiff(a, b) { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i; return -1; }

// 沿螺旋（间隔 14 块区块）按 sample 的群系挑 n 块林地样地（区块坐标）；不足用原点附近补
async function findSpots(pool, meta, w, n = 3) {
  const out = [], bn = meta.biomes ?? [], near = (cx, cz) => out.some(([x, z]) => Math.hypot(x - cx, z - cz) < 20);
  for (let ring = 0; ring < 8 && out.length < n; ring++) for (let i = -ring; i <= ring && out.length < n; i++) for (let j = -ring; j <= ring && out.length < n; j++) {
    if (Math.max(Math.abs(i), Math.abs(j)) !== ring) continue;
    const cx = i * 14, cz = j * 14, s = await pool.call('sample', { x: (cx + (w >> 1)) * 16, z: (cz + (w >> 1)) * 16 }).catch(() => null);
    const b = s?.biome, name = typeof b === 'string' ? b : bn[b];
    if (name && FOREST.test(String(name)) && !near(cx, cz)) out.push([cx, cz]);
  }
  for (const f of [[0, 0], [24, -17], [-40, 33]]) if (out.length < n) out.push(f);
  return out;
}

export async function seamCheck({ url, kwarg, meta, at, w = 5 }) {
  const pool = new Pool(url, 1), spots = [], bad = [], noOut = meta.outside === false;
  const names = meta.names ?? [], at12 = (v) => names[v & 0xfff] ?? '#' + (v & 0xfff);
  const treeId = new Uint8Array(4096); names.forEach((n, i) => { if (i < 4096 && TREE.test(n)) treeId[i] = 1; });
  try {
    if (!at) { await pool.init(kwarg); at = await findSpots(pool, meta, w); }
    for (const [sx, sz] of at) {
      const cells = [];
      for (let z = 0; z < w; z++) for (let x = 0; x < w; x++) cells.push([sx + x, sz + z]);
      const mk = () => { const s = new Store(meta); s.w3 = w; s.win = [sx, sz]; return s; };
      const A = mk(), B = mk(), rawA = new Map(), rawB = new Map();
      const oA = await run(pool, kwarg, A, cells, rawA);
      const oB = await run(pool, kwarg, B, [...cells].reverse(), rawB);
      const r = { at: `@${sx * 16},${sz * 16}`, w, rawDiff: 0, outDiff: 0, mergeDiff: 0, cross: 0, writes: 0, lost: 0, c4: 0 };
      const tag = (m) => bad.push(`${r.at} ${m}`);

      for (const [k, a] of rawA) {   // raw
        const b = rawB.get(k);
        const i = firstDiff(a.blocks, b.blocks);
        if (i >= 0) { r.rawDiff++; tag(`raw ${k} 首个差异 y${i >> 8} c${i & 255}：${at12(a.blocks[i])} ≠ ${at12(b.blocks[i])}`); }
        if (!eqArr(a.biomes, b.biomes)) { r.rawDiff++; tag(`raw ${k} 群系不同`); }
        if (!eqArr(a.outside, b.outside)) { r.outDiff++; tag(`outside ${k} 条数 ${a.outside.length / 5} vs ${b.outside.length / 5}`); }
      }
      for (const [k, a] of A.map) {   // merge
        const b = B.map.get(k), i = firstDiff(a.blocks, b.blocks);
        if (i < 0) continue;
        r.mergeDiff++;
        for (let j = i; j < a.blocks.length; j++) if (a.blocks[j] !== b.blocks[j]) {   // 差异格按「类型对」归类：leaves↔leaves 是两棵树的树冠在同一格抢写
          r.cells = (r.cells ?? 0) + 1; const kd = at12(a.blocks[j]).replace(/^[a-z_]*?(leaves|log)$/, '*$1') + '≠' + at12(b.blocks[j]).replace(/^[a-z_]*?(leaves|log)$/, '*$1');
          (r.kinds ??= {})[kd] = (r.kinds[kd] ?? 0) + 1;
        }
        r.first ??= `merge ${k} 首个差异 y${i >> 8} c${i & 255}：${at12(a.blocks[i])} ≠ ${at12(b.blocks[i])}`;
      }

      // lost / cross：以正序世界为准
      const writers = new Map(), cellKey = (x, y, z) => x + ',' + y + ',' + z;
      for (const o of oA.values()) for (let i = 0; i < o.length; i += 5) {
        const k = cellKey(o[i], o[i + 1], o[i + 2]); let s = writers.get(k); if (!s) writers.set(k, s = new Set()); s.add(o[i + 3]);
      }
      if (!noOut) for (const [src, o] of oA) for (let i = 0; i < o.length; i += 5) {
        const x = o[i], y = o[i + 1], z = o[i + 2], v = o[i + 3], soft = o[i + 4], tk = key(x >> 4, z >> 4);
        if (!A.map.has(tk) || y < 0 || y >= A.H) continue;
        r.writes++; if (tk !== src) r.cross++;
        const fin = A.get(x, y, z);
        if (fin === v || writers.get(cellKey(x, y, z)).has(fin)) continue;
        if (soft) { const rw = rawA.get(tk).blocks[(y << 8) | ((z & 15) << 4) | (x & 15)]; if (rw && !A.over[soft]?.[rw & 0xfff]) continue; }
        r.lost++; if (r.lost <= 3) tag(`lost ${src}→${tk} @${x},${z}^${y} 应为 ${at12(v)} 实为 ${at12(fin)}`);
      }

      r.c4 = A.c4() + B.c4() - A.c4pre - B.c4pre;   // 只看合并之后（到达时的差异另算）

      // border：块边界与块内相邻列的地表高度差
      const surf = (cx, cz, lx, lz) => {
        const rec = A.map.get(key(cx, cz)), c = lz * 16 + lx;
        for (let y = rec.heights[c]; y >= 0; y--) { const v = rec.blocks[(y << 8) | c]; if (v && A.cls[v & 0xfff] === 1 && !treeId[v & 0xfff]) return y; }
        return 0;
      };
      let bj = 0, ij = 0, n = 0;
      for (let cz = sz; cz < sz + w; cz++) for (let cx = sx; cx < sx + w; cx++) for (let t = 0; t < 16; t++) {
        if (cx + 1 < sx + w) { bj += Math.abs(surf(cx, cz, 15, t) - surf(cx + 1, cz, 0, t)); ij += Math.abs(surf(cx, cz, 7, t) - surf(cx, cz, 8, t)); n++; }
        if (cz + 1 < sz + w) { bj += Math.abs(surf(cx, cz, t, 15) - surf(cx, cz + 1, t, 0)); ij += Math.abs(surf(cx, cz, t, 7) - surf(cx, cz, t, 8)); n++; }
      }
      r.border = +(bj / n).toFixed(3); r.inner = +(ij / n).toFixed(3);
      if (r.cells) { tag(r.first); tag(`merge 共 ${r.cells} 格不同：${Object.entries(r.kinds).map(([k, n]) => k + '×' + n).join(' ')}`); }
      if (r.border > r.inner * 1.5 + 0.3) tag(`border 边界高差 ${r.border} > 块内 ${r.inner}×1.5+0.3`);
      if (r.c4) tag(`c4 合并后 heights 与体素 top 差 ${r.c4} 格`);
      spots.push(r);
    }
    const cross = spots.reduce((a, r) => a + r.cross, 0);
    if (!cross && !noOut) bad.push('cross 所有样地都没有跨块写入（没有树落在块边界），换 at');
    return { ok: !bad.length, bad: bad.slice(0, 8), spots, cross,
      msg: bad.length ? bad.slice(0, 4).join(' | ') : `${spots.length} 样地 × ${w}²：两种到达顺序下 raw 逐位相等、merge 逐格相等；${noOut ? '生成器不外写（cross / lost 不适用）' : `跨块写入 ${cross} 条（共 ${spots.reduce((a, r) => a + r.writes, 0)}）无丢失`}；边界高差 ${spots.map(r => r.border + '/' + r.inner).join(' ')}（边界/块内）` };
  } finally { pool.close(); }
}
