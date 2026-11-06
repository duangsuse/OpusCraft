// Sky + block light flood fill over a 48x48 region (3x3 chunks). The center chunk's light is exact because light
// travels at most 15 blocks, so the 16-block margin captures every source that can reach it.
import { T_OPACITY, T_LIGHT } from './blocks.js';

export const RW = 48;

let queue = new Int32Array(1 << 21);
const QMASK = (1 << 21) - 1;

// R: Uint16Array region blocks, layout ((y*RW)+z)*RW+x. sky/blk: Uint8Array outputs. RH: region height. maxYi: highest y with any block.
export function computeLight(R, sky, blk, RH, maxYi) {
  const plane = RW * RW;
  const top = Math.min(RH - 1, maxYi + 1);
  sky.fill(0, 0, (top + 1) * plane);
  if (top + 1 < RH) sky.fill(15, (top + 1) * plane, RH * plane);
  blk.fill(0);

  const hFull = new Int16Array(plane);   // highest y index whose sky light is < 15 (or -1)
  const hZero = new Int16Array(plane);   // highest y index whose sky light is 0 (or -1)
  for (let c = 0; c < plane; c++) {
    let L = 15, full = -1, zero = -1;
    for (let y = top; y >= 0; y--) {
      const i = y * plane + c;
      const op = T_OPACITY[R[i] & 0xfff];
      if (op) {
        L = op >= 15 ? 0 : (L > op ? L - op : 0);
        if (full < 0) full = y;
        if (L === 0) { zero = y; break; }
      }
      sky[i] = L;
    }
    hFull[c] = full; hZero[c] = zero;
  }

  // Seed BFS with sky cells that can spread sideways
  let qh = 0, qt = 0;
  for (let z = 1; z < RW - 1; z++) for (let x = 1; x < RW - 1; x++) {
    const c = z * RW + x;
    let yMax = Math.max(hFull[c - 1], hFull[c + 1], hFull[c - RW], hFull[c + RW]);
    if (yMax > hFull[c]) yMax = Math.max(yMax, hFull[c]);
    yMax = Math.min(yMax, top);
    const yMin = hZero[c] + 1;
    for (let y = yMin; y <= yMax; y++) {
      const i = y * plane + c;
      const L = sky[i];
      if (L < 2) continue;
      if (sky[i - 1] < L - 1 || sky[i + 1] < L - 1 || sky[i - RW] < L - 1 || sky[i + RW] < L - 1) {
        queue[qt] = i; qt = (qt + 1) & QMASK;
      }
    }
  }
  qh = flood(R, sky, qh, qt, RH);

  // Block light
  qh = 0; qt = 0;
  const lim = (top + 1) * plane;
  for (let i = 0; i < lim; i++) {
    const e = T_LIGHT[R[i] & 0xfff];
    if (e) { blk[i] = e; queue[qt] = i; qt = (qt + 1) & QMASK; }
  }
  flood(R, blk, qh, qt, RH);
}

function flood(R, L, qh, qt, RH) {
  const plane = RW * RW;
  while (qh !== qt) {
    const i = queue[qh]; qh = (qh + 1) & QMASK;
    const l = L[i];
    if (l <= 1) continue;
    const x = i % RW, z = ((i / RW) | 0) % RW, y = (i / plane) | 0;
    // 6 neighbors
    if (x > 0) qt = spread(R, L, i - 1, l, qt);
    if (x < RW - 1) qt = spread(R, L, i + 1, l, qt);
    if (z > 0) qt = spread(R, L, i - RW, l, qt);
    if (z < RW - 1) qt = spread(R, L, i + RW, l, qt);
    if (y > 0) qt = spread(R, L, i - plane, l, qt);
    if (y < RH - 1) qt = spread(R, L, i + plane, l, qt);
  }
  return qh;
}

function spread(R, L, j, l, qt) {
  const op = T_OPACITY[R[j] & 0xfff];
  if (op >= 15) return qt;
  const nl = l - (op > 1 ? op : 1);
  if (nl > L[j]) { L[j] = nl; queue[qt] = j; qt = (qt + 1) & QMASK; }
  return qt;
}
