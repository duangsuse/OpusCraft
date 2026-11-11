/* gode/viz/cave.js —— 洞穴分析 Worker（厚度 + 连通 + 摔落高度），由 cavejob.js 起。图（T 键 thick / conn / drop 档的 3D 纹理）和 viz.cave() 的数字同源。
   输入：mask（Uint8，下标 (y * BZ + z) * BX + x）：0 实体 = 距离源；1 洞窟空气（地表以下、非实体、非水）；6 洞窟水（落点，摔下去不扣血）；2 其它非实体（天空 / 未载入，不是源也不算洞）。
   厚度 = 洞窟空气 / 水格中心到最近实体格中心的欧氏距离（3D EDT，Felzenszwalb 三轴分离；盒外不当实体，所以贴盒边的洞读数偏大）。
   脊 = 洞窟格里 26 邻域内没有更大距离的格（近似中轴）：r50 / r90 / thin 都按脊格统计，≈ 按洞的长度加权的管半径；thin = 脊格里 r ≤ 1.5 的占比。
   连通 = 洞窟格 6 邻域并查集：comp 个数、big = 最大连通域占洞窟格的比例、orph = 体积 < orphMax 的孤立域个数（盒截断的洞会被算成孤立）。
   minR > 0：先做形态学开运算再连通 —— 只保留「能装下半径 ≥ minR 的球」的部分（核心 = 距离 ≥ minR 的格，再向外膨胀 minR），比这细的通道从连通里剔除（G = 0，kept = 留下的比例）。
   摔落高度 fall = 该格正下方连续多少格洞窟空气才到实体（落在水上记 0 = 安全）。危险格 = fall ≥ dropN 且同高度 4 邻里有脚下是实体的洞窟格（站在边上一步就掉下去：井口 / 坑边 / 悬崖边）；
   drop.cols = 含危险格的 (x,z) 列数，shafts = 这些列 4 邻域连成的竖井个数，max = 危险格里最大的落差。 */
const INF = 1e7, BINS = 130;   // 距离直方图：下标 = round(r * 2)，最后一档收尾
const OPEN = new Uint8Array(8); OPEN[1] = OPEN[6] = 1;

function edt1(f, off, st, L, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < L; q++) {
    const fq = f[off + q * st] + q * q;
    let s;
    for (;;) { const p = v[k]; s = (fq - (f[off + p * st] + p * p)) / (2 * q - 2 * p); if (s <= z[k]) k--; else break; }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < L; q++) { while (z[k + 1] < q) k++; const p = v[k], t = q - p; d[q] = t * t + f[off + p * st]; }
  for (let q = 0; q < L; q++) f[off + q * st] = d[q];
}
function edt3(f, BX, BY, BZ) {
  const sy = BX * BZ, M = Math.max(BX, BY, BZ), d = new Float32Array(M), v = new Int32Array(M), z = new Float32Array(M + 1);
  for (let y = 0; y < BY; y++) for (let zz = 0; zz < BZ; zz++) edt1(f, y * sy + zz * BX, 1, BX, d, v, z);
  for (let y = 0; y < BY; y++) for (let x = 0; x < BX; x++) edt1(f, y * sy + x, BX, BZ, d, v, z);
  for (let zz = 0; zz < BZ; zz++) for (let x = 0; x < BX; x++) edt1(f, zz * BX + x, sy, BY, d, v, z);
}

function analyze(mask, BX, BY, BZ, orphMax, minR, dropN) {
  const t0 = performance.now(), n = BX * BY * BZ, sy = BX * BZ;
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = mask[i] === 0 ? 0 : INF;
  edt3(f, BX, BY, BZ);

  // 纹理 RGB8（下标与 mask 同序，3 字节交错）：R = 距离 × 8（≥ 8；0 = 不是洞窟格），G = 连通域名次（1 = 最大域；255 = 孤立小洞；0 = 被 minR 剔除的细通道），B = 摔落高度（封顶 255）
  const T = new Uint8Array(n * 3), hy = new Int32Array(BY * BINS), layOpen = new Int32Array(BY), layDrop = new Int32Array(BY);
  let open = 0;
  for (let y = 0; y < BY; y++) for (let zz = 0; zz < BZ; zz++) for (let x = 0; x < BX; x++) {
    const i = y * sy + zz * BX + x;
    if (!OPEN[mask[i]]) continue;
    open++; layOpen[y]++;
    const r = Math.sqrt(f[i]), b = Math.round(r * 8); T[3 * i] = b > 255 ? 255 : b < 8 ? 8 : b;
    const e = f[i];
    let ridge = true;
    for (let dy = -1; dy <= 1 && ridge; dy++) { const yy = y + dy; if (yy < 0 || yy >= BY) continue;
      for (let dz = -1; dz <= 1 && ridge; dz++) { const zq = zz + dz; if (zq < 0 || zq >= BZ) continue;
        for (let dx = -1; dx <= 1; dx++) { const xq = x + dx; if (xq < 0 || xq >= BX) continue; if (f[yy * sy + zq * BX + xq] > e) { ridge = false; break; } } } }
    if (ridge) { const h = Math.round(r * 2); hy[y * BINS + (h >= BINS ? BINS - 1 : h)]++; }
  }

  // 摔落高度：每列从下往上数连续洞窟空气；实体 / 水 / 非洞格打断（水 = 安全落点）。危险格 = fall ≥ dropN，且同一高度的 4 邻里有「站得住」的洞窟格（脚下是实体）——
  // 即站在边上一步就掉下去的坑 / 井口 / 悬崖边；大厅半空里的格、井壁里侧的格不算。B 字节 = min(fall, 127) | 128（危险）
  const dropCol = new Uint8Array(BX * BZ); let dropMax = 0, dropCols = 0;
  for (let zz = 0; zz < BZ; zz++) for (let x = 0; x < BX; x++) {
    let run = 0, safe = false;
    for (let y = 0; y < BY; y++) {
      const i = y * sy + zz * BX + x, m = mask[i];
      if (m === 1) { const fl = safe ? 0 : run; T[3 * i + 2] = fl > 255 ? 255 : fl; run++; }
      else if (m === 6) { run = 0; safe = true; }
      else { run = 0; safe = false; }
    }
  }
  const stand = (i) => mask[i] === 1 && i >= sy && mask[i - sy] === 0;
  for (let zz = 0; zz < BZ; zz++) for (let x = 0; x < BX; x++) {
    let hit = false;
    for (let y = 0; y < BY; y++) {
      const i = y * sy + zz * BX + x;
      if (mask[i] !== 1) continue;
      const fl = T[3 * i + 2];
      if (fl >= dropN && ((x > 0 && stand(i - 1)) || (x < BX - 1 && stand(i + 1)) || (zz > 0 && stand(i - BX)) || (zz < BZ - 1 && stand(i + BX)))) {
        hit = true; layDrop[y]++; if (fl > dropMax) dropMax = fl; T[3 * i + 2] = (fl > 127 ? 127 : fl) | 128;
      } else if (fl > 127) T[3 * i + 2] = 127;
    }
    if (hit) { dropCol[zz * BX + x] = 1; dropCols++; }
  }
  let shafts = 0;   // 竖井 = 含危险格的列按 4 邻域连成的块（flood fill，栈复用 Int32Array）
  { const seen = new Uint8Array(BX * BZ), st = new Int32Array(BX * BZ);
    for (let s0 = 0; s0 < BX * BZ; s0++) {
      if (!dropCol[s0] || seen[s0]) continue;
      shafts++; let sp = 0; st[sp++] = s0; seen[s0] = 1;
      while (sp) { const c = st[--sp], x = c % BX, zz = (c / BX) | 0;
        if (x > 0 && dropCol[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; st[sp++] = c - 1; }
        if (x < BX - 1 && dropCol[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; st[sp++] = c + 1; }
        if (zz > 0 && dropCol[c - BX] && !seen[c - BX]) { seen[c - BX] = 1; st[sp++] = c - BX; }
        if (zz < BZ - 1 && dropCol[c + BX] && !seen[c + BX]) { seen[c + BX] = 1; st[sp++] = c + BX; } } } }

  // minR：开运算。核心 = 距离² ≥ minR² 的洞窟格；到核心的距离² > minR² 的洞窟格 = 太细，mask 改 7（不参与连通）。f 在这之后只用一次，原地覆盖
  if (minR > 0) {
    const m2 = minR * minR;
    for (let i = 0; i < n; i++) f[i] = OPEN[mask[i]] && f[i] >= m2 ? 0 : INF;
    edt3(f, BX, BY, BZ);
    for (let i = 0; i < n; i++) if (OPEN[mask[i]] && f[i] > m2) mask[i] = 7;
  }

  // 连通：f 的内存在这之后不再用，复用为标签
  const lab = new Int32Array(f.buffer), par = new Int32Array(open + 2); let nl = 0;
  const find = (a) => { while (par[a] !== a) a = par[a] = par[par[a]]; return a; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } };
  for (let y = 0; y < BY; y++) for (let zz = 0; zz < BZ; zz++) for (let x = 0; x < BX; x++) {
    const i = y * sy + zz * BX + x;
    if (!OPEN[mask[i]]) { lab[i] = 0; continue; }
    let l = 0;
    if (x > 0 && lab[i - 1]) l = lab[i - 1];
    if (zz > 0 && lab[i - BX]) { const m = lab[i - BX]; if (l) uni(l, m); else l = m; }
    if (y > 0 && lab[i - sy]) { const m = lab[i - sy]; if (l) uni(l, m); else l = m; }
    if (!l) { l = ++nl; par[l] = l; }
    lab[i] = l;
  }
  const vol = new Int32Array(nl + 1); let kept = 0;
  for (let i = 0; i < n; i++) if (lab[i]) { const r = find(lab[i]); lab[i] = r; vol[r]++; kept++; }
  let comp = 0, big = 0, bigRoot = 0, orph = 0;
  for (let l = 1; l <= nl; l++) if (vol[l]) { comp++; if (vol[l] > big) { big = vol[l]; bigRoot = l; } if (vol[l] < orphMax) orph++; }
  const roots = []; for (let l = 1; l <= nl; l++) if (vol[l]) roots.push(l);
  roots.sort((a, b) => vol[b] - vol[a]);
  const rank = new Uint8Array(nl + 1); roots.forEach((l, k) => { rank[l] = k > 0 && vol[l] < orphMax ? 255 : Math.min(254, k + 1); });
  const layComp = new Int32Array(BY), layBig = new Int32Array(BY), seen = new Int32Array(nl + 1);
  for (let y = 0; y < BY; y++) for (let k = y * sy, e = k + sy; k < e; k++) {
    const l = lab[k]; if (!l) continue;
    T[3 * k + 1] = rank[l];
    if (seen[l] !== y + 1) { seen[l] = y + 1; layComp[y]++; }
    if (l === bigRoot) layBig[y]++;
  }
  return { T, hy, layOpen, layComp, layBig, layDrop, open, kept, comp, big, orph, dropCols, shafts, dropMax, ms: Math.round(performance.now() - t0) };
}

self.onmessage = (e) => {
  const { id, mask, BX, BY, BZ, orphMax, minR, dropN } = e.data;
  try {
    const r = analyze(mask, BX, BY, BZ, orphMax ?? 64, minR ?? 0, dropN ?? 4);
    self.postMessage({ id, ...r, BINS }, [r.T.buffer, r.hy.buffer, r.layOpen.buffer, r.layComp.buffer, r.layBig.buffer, r.layDrop.buffer]);
  } catch (err) { self.postMessage({ id, err: String(err?.stack ?? err) }); }
};
