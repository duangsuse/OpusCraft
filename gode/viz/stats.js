/* gode/viz/stats.js —— 选区 / 区域统计（s13 §3 的 viz.stats({sel})）：给 Agent 看数字再看图，也是调参前后对比的基础。
   数据来自 Store：3D 窗口里的区块按体素统计，只有 2D 外圈列的部分按列统计（没有体素的项只算有体素的列，coverage 里写清楚）。
   纯函数，不碰 DOM；noise 项要的 sample 由调用方传（走 slicer 池）。
   口径（粗，供调参用，不是精确的游戏内统计）：
     ground = 每列从最高实体往下跳过树叶 / 树干后的第一格（地面高度）；cave.air = 地面以下、非水的空气格；
     water.lake = 水面（地表实体 y + 水深）高于海平面的列，即高地水体；trees = 每个树种的树干方块按 26 邻域连成块，一块 = 一棵树（2×2 粗干和斜枝算一棵；树干紧贴的两棵会并成一棵，很少见）。 */
import { key } from './store.js';
import { speciesTable } from './species.js';

export const STATS_VER = 2;   // 口径版本：改了统计口径就加一（gd 的偏差基线按它判断「口径变了」，不当成生成器偏差）

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const sortTop = (o, n) => Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n));
const BIN = 8;

export async function regionStats(store, meta, box, opts = {}) {
  const t0 = performance.now(), H = store.H, names = meta.names ?? [], sea = meta.sea ?? 64;
  const [x0, y0, z0, x1, y1, z1] = box, ya = Math.max(0, y0), yb = Math.min(H - 1, y1);
  const sp = speciesTable(names), flag = new Uint8Array(4096);   // 1 树叶 2 树干 4 矿
  names.forEach((n, i) => { if (i >= 4096) return;
    if (/leaves/.test(n)) flag[i] |= 1;
    if (/(^|_)(log|wood|stem)$/.test(n)) flag[i] |= 2;
    if (/(^|_)ore(_|$)/.test(n)) flag[i] |= 4; });

  const cnt = new Float64Array(4096), caveY = new Map(), biomeN = new Map(), groundN = new Map(), hist = new Map(), missing = new Set();
  const logs = [], leafN = new Float64Array(sp.list.length);   // logs = [x, y, z, 种] 平铺
  let ncol = 0, nvox = 0, hMin = 1e9, hMax = -1e9, hSum = 0, hN = 0, cave = 0;
  let wCols = 0, wSum = 0, lake = 0;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const k = key(x >> 4, z >> 4), r = store.map.get(k), a = store.cols.get(k), c = ((z & 15) << 4) | (x & 15);
    if (!r && !a) { missing.add(k); continue; }
    ncol++;
    const bio = r ? r.biomes[c] : a[c * 4 + 2], ay = a ? a[c * 4 + 1] : -1, wd = a ? a[c * 4 + 3] : 0;
    biomeN.set(bio, (biomeN.get(bio) ?? 0) + 1);
    let g = ay, gt = a ? a[c * 4] : 0;
    if (r) {
      nvox++;
      const b = r.blocks;
      g = ay; while (g >= 0) { const v = b[(g << 8) | c] & 0xfff; if (store.cls[v] === 1 && !(flag[v] & 3)) break; g--; }     // 地面：往下找第一格不是树叶 / 树干的实体（跳过冠下空气）
      gt = g >= 0 ? b[(g << 8) | c] & 0xfff : 0;
      for (let y = ya; y <= yb; y++) {
        const v = b[(y << 8) | c] & 0xfff;
        cnt[v]++;
        const f = flag[v];
        if (f & 2) logs.push(x, y, z, sp.sp[v]); else if (f & 1) leafN[sp.sp[v]]++;
        if (v === 0 && y < g && y > 0) { cave++; const bk = y >> 4; caveY.set(bk, (caveY.get(bk) ?? 0) + 1); }
      }
    }
    if (g >= 0) { hMin = Math.min(hMin, g); hMax = Math.max(hMax, g); hSum += g; hN++; const hb = Math.floor(g / BIN) * BIN; hist.set(hb, (hist.get(hb) ?? 0) + 1); }
    const gn = names[gt] ?? '#' + gt; groundN.set(gn, (groundN.get(gn) ?? 0) + 1);
    if (wd > 0) { wCols++; wSum += wd; if (ay + wd > sea) lake++; }
  }

  const byName = {}; let total = 0, air = 0;
  for (let t = 0; t < 4096; t++) if (cnt[t]) { total += cnt[t]; if (t === 0) air = cnt[t]; else byName[names[t] ?? '#' + t] = cnt[t]; }
  const ores = {}; for (const [n, v] of Object.entries(byName)) { const t = names.indexOf(n); if (t >= 0 && flag[t] & 4) ores[n] = v; }
  const share = (m, nameOf, n = 12) => sortTop(Object.fromEntries([...m].map(([k, v]) => [nameOf(k), r4(v / ncol)])), n);
  const out = {
    box, size: [x1 - x0 + 1, yb - ya + 1, z1 - z0 + 1],
    columns: { total: (x1 - x0 + 1) * (z1 - z0 + 1), have: ncol, voxel: nvox, only2d: ncol - nvox, missingChunks: missing.size },
    blocks: sortTop(byName, 48), air: { cells: air, share: total ? r4(air / total) : null }, ores: sortTop(ores, 12),
    cave: { airBelowGround: cave, perColumn: nvox ? r4(cave / nvox) : null, byY16: Object.fromEntries([...caveY].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k * 16, v])) },
    ground: { h: hN ? { min: hMin, mean: r4(hSum / hN), max: hMax, hist: Object.fromEntries([...hist].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, v])) } : null,
      top: sortTop(Object.fromEntries([...groundN].map(([k, v]) => [k, r4(v / ncol)])), 8) },
    biomes: share(biomeN, (b) => meta.biomes?.[b] ?? '#' + b),
    water: { cols: wCols, share: ncol ? r4(wCols / ncol) : null, meanDepth: wCols ? r4(wSum / wCols) : null, lakeCols: lake, lakeShare: ncol ? r4(lake / ncol) : null },
    trees: treeStats(logs, leafN, sp, nvox, box),
  };
  if (missing.size) out.missing = [...missing].slice(0, 6);
  if (opts.sample && opts.noise !== false) {   // 噪声场：在盒内取 N×N 点，每个数值字段给 min / mean / max
    const N = opts.noiseN ?? 6, acc = {};
    const pts = []; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) pts.push([Math.round(x0 + (x1 - x0) * (i + 0.5) / N), Math.round(z0 + (z1 - z0) * (j + 0.5) / N)]);
    for (const s of await Promise.all(pts.map(([x, z]) => opts.sample(x, z).catch(() => null))))
      for (const k in s ?? {}) if (typeof s[k] === 'number' && k !== 'biome') { const o = acc[k] ??= { min: 1e9, max: -1e9, sum: 0, n: 0 }; o.min = Math.min(o.min, s[k]); o.max = Math.max(o.max, s[k]); o.sum += s[k]; o.n++; }
    out.noise = Object.fromEntries(Object.entries(acc).map(([k, o]) => [k, { min: r4(o.min), mean: r4(o.sum / o.n), max: r4(o.max) }]));
  }
  out.ms = Math.round(performance.now() - t0);
  return out;
}

// 树：树干方块 26 邻域并查集 → 每块一棵树；按种给棵数 / 每千列 / 平均高（树干 y 跨度 + 1）/ 树叶格数
function treeStats(logs, leafN, sp, nvox, box) {
  const n = logs.length >> 2, par = new Int32Array(n).map((_, i) => i), at = new Map();
  const find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const W = box[3] - box[0] + 3, D = box[5] - box[2] + 3, id = (x, y, z) => ((y + 1) * D + (z - box[2] + 1)) * W + (x - box[0] + 1);
  for (let i = 0; i < n; i++) at.set(id(logs[i * 4], logs[i * 4 + 1], logs[i * 4 + 2]), i);
  for (let i = 0; i < n; i++) {
    const x = logs[i * 4], y = logs[i * 4 + 1], z = logs[i * 4 + 2], s = logs[i * 4 + 3];
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy && !dz) continue;
      const j = at.get(id(x + dx, y + dy, z + dz));
      if (j !== undefined && logs[j * 4 + 3] === s) { const a = find(i), b = find(j); if (a !== b) par[a] = b; }
    }
  }
  const comp = new Map();   // 根 → { s, lo, hi }
  for (let i = 0; i < n; i++) {
    const r = find(i), y = logs[i * 4 + 1], c = comp.get(r);
    if (c) { if (y < c.lo) c.lo = y; if (y > c.hi) c.hi = y; } else comp.set(r, { s: logs[i * 4 + 3], lo: y, hi: y });
  }
  const per = {};
  for (const c of comp.values()) { const o = per[sp.list[c.s]] ??= { count: 0, hSum: 0 }; o.count++; o.hSum += c.hi - c.lo + 1; }
  const bySpecies = {}; let count = 0, leaves = 0;
  for (let k = 1; k < sp.list.length; k++) {
    const o = per[sp.list[k]]; if (!o && !leafN[k]) continue;
    bySpecies[sp.list[k]] = { count: o?.count ?? 0, per1kCols: nvox && o ? r4(o.count * 1000 / nvox) : 0, meanHeight: o ? r4(o.hSum / o.count) : null, leafCells: leafN[k] };
    count += o?.count ?? 0; leaves += leafN[k];
  }
  return { count, per1kCols: nvox ? r4(count * 1000 / nvox) : null, leafCells: leaves, bySpecies };
}

// 两次统计的差：数字叶子取 now − prev，只留变了的；对象递归（缺项当 0）。block / biome / hist 这类按名字的表也适用
export function diffStats(prev, now) {
  const d = (a, b) => {
    if (typeof b === 'number' || typeof a === 'number') { const v = (b ?? 0) - (a ?? 0); return Number.isFinite(v) && v !== 0 ? r4(v) : undefined; }
    if (b && typeof b === 'object' || a && typeof a === 'object') {
      const o = {}; for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) { const v = d(a?.[k], b?.[k]); if (v !== undefined) o[k] = v; }
      return Object.keys(o).length ? o : undefined;
    }
  };
  const o = {}; for (const k of ['columns', 'blocks', 'air', 'ores', 'cave', 'ground', 'biomes', 'water', 'trees', 'noise']) { const v = d(prev?.[k], now?.[k]); if (v !== undefined) o[k] = v; }
  return o;
}
