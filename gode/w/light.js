/* gode/w/light.js —— 初始光照（s01 §4、s04 §4）：本块内的天空光 + 方块光，BFS 逐格 −max(1, opacity)。规范布局 YZX（idx = y<<8 | z<<4 | x）。
   块边界外一律不看（既不灌入也不外溢）：跨区块的接缝由 main 的增量 BFS 补（M1-8）。
   移植自宿主 B gls.js `Lighting.initChunk`（规则同：天光直下 15、水 / 叶额外衰减，向下的 15 不衰减；光源取表里的 emit）。
   纯函数，页面 / Worker / node 都能 import。tables = glTable() 的 { opaque, opac, emit }。 */
const H = 256, VOL = 65536;
const QN = 1 << 17, qs = new Int32Array(QN);   // 队列（环）：同一格可能多次入队，65536 格 × 少量重复足够

// 向 [x,y,z] 六邻扩散；返回 void。arr = sky 或 blk；skyMode 控制「向下的 15 不衰减」
function flood(arr, blocks, T, qh, qt, skyMode) {
  while (qh !== qt) {
    const i = qs[qh]; qh = (qh + 1) & (QN - 1);
    const l = arr[i]; if (l <= 1) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    for (let d = 0; d < 6; d++) {
      let j;
      switch (d) {
        case 0: if (x === 15) continue; j = i + 1; break;
        case 1: if (x === 0) continue; j = i - 1; break;
        case 2: if (y === H - 1) continue; j = i + 256; break;
        case 3: if (y === 0) continue; j = i - 256; break;
        case 4: if (z === 15) continue; j = i + 16; break;
        default: if (z === 0) continue; j = i - 16;
      }
      const t = blocks[j] & 0xfff;
      if (T.opaque[t]) continue;
      const op = T.opac[t], nl = (skyMode && d === 3 && l === 15) ? 15 - op : l - (op > 1 ? op : 1);
      if (nl <= 0 || arr[j] >= nl) continue;
      arr[j] = nl; qs[qt] = j; qt = (qt + 1) & (QN - 1);
    }
  }
}

/** → Uint8Array(65536)，sky << 4 | blk */
export function initLight(blocks, T) {
  const sky = new Uint8Array(VOL), blk = new Uint8Array(VOL);
  // 1. 每列天光直下
  for (let c = 0; c < 256; c++) {
    let l = 15;
    for (let y = H - 1; y >= 0; y--) {
      const t = blocks[(y << 8) | c] & 0xfff;
      if (T.opaque[t]) l = 0; else if (T.opac[t] && l > 0) l = Math.max(0, l - T.opac[t]);
      sky[(y << 8) | c] = l;
      if (l === 0) break;   // 其余已是 0
    }
  }
  // 2. 天光 BFS 的种子：和更暗的非不透明邻格相邻的亮格（块内四个水平邻）
  let qh = 0, qt = 0;
  for (let y = 0; y < H; y++) for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const i = (y << 8) | (z << 4) | x, l = sky[i];
    if (l <= 1) continue;
    if ((x > 0 && sky[i - 1] < l - 1) || (x < 15 && sky[i + 1] < l - 1) || (z > 0 && sky[i - 16] < l - 1) || (z < 15 && sky[i + 16] < l - 1)) { qs[qt] = i; qt = (qt + 1) & (QN - 1); }
  }
  flood(sky, blocks, T, qh, qt, true);
  // 3. 方块光
  qh = qt = 0;
  for (let i = 0; i < VOL; i++) { const e = T.emit[blocks[i] & 0xfff]; if (e) { blk[i] = e; qs[qt] = i; qt = (qt + 1) & (QN - 1); } }
  flood(blk, blocks, T, qh, qt, false);
  const out = new Uint8Array(VOL);
  for (let i = 0; i < VOL; i++) out[i] = (sky[i] << 4) | blk[i];
  return out;
}
