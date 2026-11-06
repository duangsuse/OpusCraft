// Tree features: ports of vanilla trunk placers (straight, fancy, giant, dark oak, forking, mega jungle, cherry)
// and foliage placers (blob, fancy, spruce, pine, mega pine, dark oak, acacia, bush, mega jungle, cherry).
// All functions take (ctx, rng, x, y, z) where (x, y, z) is the sapling position (block above the ground).
import { ID, mk } from '../blocks.js';

const LOG = {}, LEAVES = {};
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry']) { LOG[w] = ID[w + '_log']; LEAVES[w] = ID[w + '_leaves']; }
const AX_Y = 0, AX_X = 1, AX_Z = 2;
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // N S W E
const VINE_N = 1, VINE_S = 2, VINE_W = 4, VINE_E = 8;

// Leaves row in the vanilla FoliagePlacer style. skip(rng, ax, ly, az, range, large) gets absolute local coords.
function leavesRow(ctx, rng, cx, cy, cz, range, ly, large, skip, leaf) {
  const ext = large ? 1 : 0;
  for (let dx = -range; dx <= range + ext; dx++) {
    for (let dz = -range; dz <= range + ext; dz++) {
      const ax = large ? Math.min(Math.abs(dx), Math.abs(dx - 1)) : Math.abs(dx);
      const az = large ? Math.min(Math.abs(dz), Math.abs(dz - 1)) : Math.abs(dz);
      if (skip(rng, ax, ly, az, range, large)) continue;
      ctx.leaf(cx + dx, cy + ly, cz + dz, leaf);
    }
  }
}

const blobSkip = (rng, ax, ly, az, r) => ax === r && az === r && (rng.nextInt(2) === 0 || ly === 0);

function blobFoliage(ctx, rng, x, y, z, radius, height, offset, leaf, radiusOffset = 0) {
  for (let j = offset; j >= offset - height; j--) {
    const r = Math.max(radius + radiusOffset - 1 - Math.trunc(j / 2), 0);
    leavesRow(ctx, rng, x, y, z, r, j, false, blobSkip, leaf);
  }
}

const FS_OAK = [1, 0, 1], FS_SPRUCE = [2, 0, 2], FS_MEGA = [1, 1, 2], FS_WIDE = [1, 0, 2];
function trunk(ctx, x, y, z, h, log) { for (let i = 0; i < h; i++) ctx.log(x, y + i, z, mk(log, AX_Y)); }

// ---- straight trunk + blob foliage (oak, birch, jungle, swamp oak) ---------------------------------------
export function blobTree(ctx, rng, x, y, z, wood, base, randA, randB, radius = 2, fh = 3, opts = {}) {
  const h = base + rng.nextInt(randA + 1) + rng.nextInt(randB + 1);
  const fs = opts.fs || FS_OAK;
  if (!ctx.trunkFree(x, y, z, h + 1, 1, opts.water, fs[0], fs[1], fs[2])) return false;
  ctx.dirt(x, y - 1, z);
  trunk(ctx, x, y, z, h, LOG[wood]);
  blobFoliage(ctx, rng, x, y + h, z, radius, fh, 0, opts.leaves ?? LEAVES[wood]);
  if (opts.vines) { if (opts.trunkVines) trunkVines(ctx, rng, x, y, z, h, 1); leafVines(ctx, rng, x, y + h - fh - 1, z, radius + 1, y + h, 0.25); }
  return true;
}
export const oak = (ctx, rng, x, y, z) => blobTree(ctx, rng, x, y, z, 'oak', 4, 2, 0);
export const birch = (ctx, rng, x, y, z) => blobTree(ctx, rng, x, y, z, 'birch', 5, 2, 0);
export const superBirch = (ctx, rng, x, y, z) => blobTree(ctx, rng, x, y, z, 'birch', 5, 2, 6);
export const swampOak = (ctx, rng, x, y, z) => blobTree(ctx, rng, x, y, z, 'oak', 5, 3, 0, 3, 3, { vines: true, water: true });
export const jungleTree = (ctx, rng, x, y, z) => blobTree(ctx, rng, x, y, z, 'jungle', 4, 8, 0, 2, 3, { vines: true, trunkVines: true });

// ---- vines -----------------------------------------------------------------------------------------------
function trunkVines(ctx, rng, x, y, z, h, size) {
  for (let i = 0; i < h; i++) for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) {
    const lx = x + a, lz = z + b, ly = y + i;
    if (rng.nextInt(3) > 0 && a === 0) ctx.vine(lx - 1, ly, lz, VINE_E);
    if (rng.nextInt(3) > 0 && a === size - 1) ctx.vine(lx + 1, ly, lz, VINE_W);
    if (rng.nextInt(3) > 0 && b === 0) ctx.vine(lx, ly, lz - 1, VINE_S);
    if (rng.nextInt(3) > 0 && b === size - 1) ctx.vine(lx, ly, lz + 1, VINE_N);
  }
}
// hanging vines from the outside of leaves in a box (approximation of LeaveVineDecorator)
function leafVines(ctx, rng, cx, y0, cz, r, y1, p) {
  for (let y = y0; y <= y1; y++) for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
    const x = cx + dx, z = cz + dz;
    if (!ctx.isLeaf(x, y, z)) continue;
    for (let d = 0; d < 4; d++) {
      if (rng.nextFloat() >= p) continue;
      const nx = x + DIRS[d][0], nz = z + DIRS[d][1];
      if (!ctx.isAir(nx, y, nz)) continue;
      const face = d === 0 ? VINE_S : d === 1 ? VINE_N : d === 2 ? VINE_E : VINE_W; // attached to the leaf behind it
      for (let k = 0; k < 4 && ctx.isAir(nx, y - k, nz); k++) ctx.vine(nx, y - k, nz, face);
    }
  }
}

// ---- fancy oak ---------------------------------------------------------------------------------------------
function treeShape(height, y) {
  if (y < height * 0.3) return -1;
  const f = height / 2, g = f - y;
  let h = Math.sqrt(f * f - g * g);
  if (g === 0) h = f; else if (Math.abs(g) >= f) return 0;
  return h * 0.5;
}
function limb(ctx, x0, y0, z0, x1, y1, z1, place, log) {
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  if (!place && dx === 0 && dy === 0 && dz === 0) return true;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
  const fx = dx / steps, fy = dy / steps, fz = dz / steps;
  for (let j = 0; j <= steps; j++) {
    const px = x0 + Math.floor(0.5 + j * fx), py = y0 + Math.floor(0.5 + j * fy), pz = z0 + Math.floor(0.5 + j * fz);
    if (place) {
      const ax = Math.abs(px - x0), az = Math.abs(pz - z0), m = Math.max(ax, az);
      const axis = m > 0 ? (ax === m ? AX_X : AX_Z) : AX_Y;
      ctx.log(px, py, pz, mk(log, axis));
    } else if (!ctx.treeSpace(px, py, pz)) return false;
  }
  return true;
}
export function fancyOak(ctx, rng, x, y, z, wood = 'oak') {
  const free = 3 + rng.nextInt(12);
  const j = free + 2;
  const k = Math.floor(j * 0.618);
  if (!ctx.trunkFree(x, y, z, k + 1, 1, false, 0, 0, 0)) return false;
  const log = LOG[wood], leaf = LEAVES[wood];
  ctx.dirt(x, y - 1, z);
  const l = Math.min(1, Math.floor(1.382 + Math.pow(j / 13, 2)));
  const m = y + k;
  const foliage = []; // [x, y, z, branchBaseY]
  let n = j - 5;
  foliage.push([x, y + n, z, m]);
  for (; n >= 0; n--) {
    const f = treeShape(j, n);
    if (f < 0) continue;
    for (let o = 0; o < l; o++) {
      const g = f * (rng.nextFloat() + 0.328);
      const h = rng.nextFloat() * 2 * Math.PI;
      const bx = x + Math.floor(g * Math.sin(h) + 0.5), by = y + n - 1, bz = z + Math.floor(g * Math.cos(h) + 0.5);
      if (limb(ctx, bx, by, bz, bx, by + 5, bz, false, log)) {
        const r = x - bx, s = z - bz;
        const t = by - Math.sqrt(r * r + s * s) * 0.381;
        const u = t > m ? m : Math.trunc(t);
        if (limb(ctx, x, u, z, bx, by, bz, false, log)) foliage.push([bx, by, bz, u]);
      }
    }
  }
  limb(ctx, x, y, z, x, y + k, z, true, log);
  for (const fc of foliage) {
    const base = fc[3];
    if (!(fc[0] === x && fc[1] === base && fc[2] === z) && base - y >= j * 0.2) limb(ctx, x, base, z, fc[0], fc[1], fc[2], true, log);
  }
  // foliage: FancyFoliagePlacer(radius 2, offset 4, height 4)
  const skip = (rng2, ax, ly, az, r) => (ax + 0.5) * (ax + 0.5) + (az + 0.5) * (az + 0.5) > r * r;
  for (const fc of foliage) {
    if (fc[3] - y < j * 0.2) continue;
    for (let i = 4; i >= 0; i--) {
      const r = 2 + (i !== 4 && i !== 0 ? 1 : 0);
      leavesRow(ctx, rng, fc[0], fc[1], fc[2], r, i, false, skip, leaf);
    }
  }
  return true;
}

// ---- spruce / pine ---------------------------------------------------------------------------------------
const spruceSkip = (rng, ax, ly, az, r) => ax === r && az === r && r > 0;
export function spruce(ctx, rng, x, y, z) {
  const h = 5 + rng.nextInt(3) + rng.nextInt(2);
  const trunkH = rng.between(1, 2);
  const fh = Math.max(4, h - trunkH);
  const radius = rng.between(2, 3);
  if (!ctx.trunkFree(x, y, z, h, 1, false, 2, 0, 2)) return false;
  ctx.dirt(x, y - 1, z);
  trunk(ctx, x, y, z, h, LOG.spruce);
  const offset = rng.between(0, 2);
  let i = rng.nextInt(2), jj = 1, k = 0;
  const top = y + h;
  for (let l = offset; l >= -fh; l--) {
    leavesRow(ctx, rng, x, top, z, i, l, false, spruceSkip, LEAVES.spruce);
    if (i >= jj) { i = k; k = 1; jj = Math.min(jj + 1, radius); } else i++;
  }
  return true;
}
export function pine(ctx, rng, x, y, z) {
  const h = 6 + rng.nextInt(5);
  const fh = rng.between(3, 4);
  const radius = 1 + rng.nextInt(2);
  if (!ctx.trunkFree(x, y, z, h, 1, false, 2, 0, 2)) return false;
  ctx.dirt(x, y - 1, z);
  trunk(ctx, x, y, z, h, LOG.spruce);
  const offset = 1, top = y + h;
  let i = 0;
  for (let j = offset; j >= offset - fh; j--) {
    leavesRow(ctx, rng, x, top, z, i, j, false, spruceSkip, LEAVES.spruce);
    if (i >= 1 && j === offset - fh + 1) i--; else if (i < radius) i++;
  }
  return true;
}
function podzolAround(ctx, rng, x, y, z) {
  for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 3; dz++) {
    const cxx = Math.abs(dx - 0.5), czz = Math.abs(dz - 0.5);
    if (cxx + czz > 4 || rng.nextInt(5) === 0) continue;
    for (let dy = 2; dy >= -3; dy--) {
      if (ctx.groundAt(x + dx, y + dy, z + dz)) { ctx.setGround(x + dx, y + dy, z + dz, ID.podzol); break; }
    }
  }
}
export function megaSpruce(ctx, rng, x, y, z, isPine) {
  const h = 13 + rng.nextInt(3) + rng.nextInt(15);
  const fh = isPine ? rng.between(3, 7) : rng.between(13, 17);
  if (!ctx.trunkFree(x, y, z, h, 2, false, 1, 1, 2)) return false;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { ctx.dirt(x + a, y - 1, z + b); trunk(ctx, x + a, y, z + b, h, LOG.spruce); }
  const top = y + h;
  let prev = 0;
  const skip = (r2, ax, ly, az, r) => ax + az >= 7 || ax * ax + az * az > r * r;
  for (let j = top - fh; j <= top; j++) {
    const k = top - j;
    const l = Math.floor(k / fh * 3.5);
    const m = (k > 0 && l === prev && (j & 1) === 0) ? l + 1 : l;
    leavesRow(ctx, rng, x, j, z, m, 0, true, skip, LEAVES.spruce);
    prev = l;
  }
  podzolAround(ctx, rng, x, y - 1, z);
  return true;
}

// ---- dark oak --------------------------------------------------------------------------------------------
export function darkOak(ctx, rng, x, y, z) {
  const h = 6 + rng.nextInt(3) + rng.nextInt(2);
  if (!ctx.trunkFree(x, y, z, h, 2, false, 1, 0, 1)) return false;
  // all four ground blocks must be valid
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (!ctx.groundAt(x + a, y - 1, z + b)) return false;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) ctx.dirt(x + a, y - 1, z + b);
  const dir = DIRS[rng.nextInt(4)];
  const i = h - rng.nextInt(4);
  let j = 2 - rng.nextInt(3);
  let n = x, o = z;
  const p = y + h - 1;
  for (let q = 0; q < h; q++) {
    if (q >= i && j > 0) { n += dir[0]; o += dir[1]; j--; }
    const r = y + q;
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) ctx.log(n + a, r, o + b, mk(LOG.dark_oak, AX_Y));
  }
  const atts = [[n, p, o, true]];
  for (let q = -1; q <= 2; q++) for (let r = -1; r <= 2; r++) {
    if ((q < 0 || q > 1 || r < 0 || r > 1) && rng.nextInt(3) <= 0) {
      const s = rng.nextInt(3) + 2;
      for (let t = 0; t < s; t++) ctx.log(x + q, p - t - 1, z + r, mk(LOG.dark_oak, AX_Y));
      atts.push([n + q, p, o + r, false]);
    }
  }
  const leaf = LEAVES.dark_oak;
  for (const [ax, ay, az, big] of atts) {
    const skip = (r2, lx, ly, lz, range, large) => {
      if (ly === -1 && !large) return lx === range && lz === range;
      if (ly === 1) return lx + lz > range * 2 - 2;
      return false;
    };
    // signed skip for the large crown's corners on layer 0
    const skipBig = (r2, lx, ly, lz, range, large) => skip(r2, lx, ly, lz, range, large);
    if (big) {
      leavesRow(ctx, rng, ax, ay, az, 2, -1, true, skipBig, leaf);
      leavesRowDarkTop(ctx, ax, ay, az, 3, leaf);
      leavesRow(ctx, rng, ax, ay, az, 2, 1, true, skipBig, leaf);
      if (rng.nextBool()) leavesRow(ctx, rng, ax, ay, az, 0, 2, true, skipBig, leaf);
    } else {
      leavesRow(ctx, rng, ax, ay, az, 2, -1, false, skip, leaf);
      leavesRow(ctx, rng, ax, ay, az, 1, 0, false, skip, leaf);
    }
  }
  return true;
}
// layer 0 of the big dark oak crown: radius 3 (2x2 centred) without the four outer corners
function leavesRowDarkTop(ctx, cx, cy, cz, range, leaf) {
  for (let dx = -range; dx <= range + 1; dx++) for (let dz = -range; dz <= range + 1; dz++) {
    const ex = dx === -range || dx === range + 1, ez = dz === -range || dz === range + 1;
    if (ex && ez) continue;
    ctx.leaf(cx + dx, cy, cz + dz, leaf);
  }
}

// ---- acacia ----------------------------------------------------------------------------------------------
export function acacia(ctx, rng, x, y, z) {
  const h = 5 + rng.nextInt(3) + rng.nextInt(3);
  if (!ctx.trunkFree(x, y, z, Math.min(h, 4), 1, false, 1, 0, 2)) return false;
  ctx.dirt(x, y - 1, z);
  const log = LOG.acacia, leaf = LEAVES.acacia;
  const atts = [];
  const dir = rng.nextInt(4);
  const i = h - rng.nextInt(4) - 1;
  let j = 3 - rng.nextInt(3);
  let k = x, l = z, top = -1;
  for (let n = 0; n < h; n++) {
    const o = y + n;
    if (n >= i && j > 0) { k += DIRS[dir][0]; l += DIRS[dir][1]; j--; }
    if (ctx.log(k, o, l, mk(log, AX_Y))) top = o + 1;
  }
  if (top >= 0) atts.push([k, top, l, 1]);
  k = x; l = z;
  const dir2 = rng.nextInt(4);
  if (dir2 !== dir) {
    const nx = i - rng.nextInt(2) - 1;
    let o = 1 + rng.nextInt(3);
    top = -1;
    for (let p = nx; p < h && o > 0; o--) {
      if (p >= 1) {
        const q = y + p;
        k += DIRS[dir2][0]; l += DIRS[dir2][1];
        if (ctx.log(k, q, l, mk(log, AX_Y))) top = q + 1;
      }
      p++;
    }
    if (top >= 0) atts.push([k, top, l, 0]);
  }
  const skip = (r2, ax, ly, az, r) => ly === 0 ? ((ax > 1 || az > 1) && ax !== 0 && az !== 0) : (ax === r && az === r && r > 0);
  for (const [ax, ay, az, ro] of atts) {
    leavesRow(ctx, rng, ax, ay, az, 2 + ro, -1, false, skip, leaf);
    leavesRow(ctx, rng, ax, ay, az, 1, 0, false, skip, leaf);
    leavesRow(ctx, rng, ax, ay, az, 2 + ro - 1, 0, false, skip, leaf);
  }
  return true;
}

// ---- jungle ----------------------------------------------------------------------------------------------
export function jungleBush(ctx, rng, x, y, z) {
  if (!ctx.trunkFree(x, y, z, 1, 1, false, 0, 0, 0)) return false;
  ctx.dirt(x, y - 1, z);
  ctx.log(x, y, z, mk(LOG.jungle, AX_Y));
  const skip = (r2, ax, ly, az, r) => ax === r && az === r && r2.nextInt(2) === 0;
  for (let i = 1; i >= -1; i--) leavesRow(ctx, rng, x, y + 1, z, 2 - 1 - i, i, false, skip, LEAVES.oak);
  return true;
}
export function megaJungle(ctx, rng, x, y, z) {
  const h = 10 + rng.nextInt(3) + rng.nextInt(20);
  if (!ctx.trunkFree(x, y, z, h, 2, false, 1, 1, 2)) return false;
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { ctx.dirt(x + a, y - 1, z + b); trunk(ctx, x + a, y, z + b, h, LOG.jungle); }
  const atts = [[x, y + h, z, 0, true]];
  for (let i = h - 2 - rng.nextInt(4); i > h / 2; i -= 2 + rng.nextInt(4)) {
    const f = rng.nextFloat() * Math.PI * 2;
    let j = 0, k = 0;
    for (let l = 0; l < 5; l++) {
      j = Math.trunc(1.5 + Math.cos(f) * l);
      k = Math.trunc(1.5 + Math.sin(f) * l);
      const ax = Math.abs(Math.cos(f)) > Math.abs(Math.sin(f)) ? AX_X : AX_Z;
      ctx.log(x + j, y + i - 3 + (l >> 1), z + k, mk(LOG.jungle, ax));
    }
    atts.push([x + j, y + i, z + k, -2, false]);
  }
  const skip = (r2, ax, ly, az, r) => ax + az >= 7 || ax * ax + az * az > r * r;
  for (const [ax, ay, az, ro, big] of atts) {
    const n = big ? 2 : 1 + rng.nextInt(2);
    for (let j = 0; j >= -n; j--) leavesRow(ctx, rng, ax, ay, az, 2 + ro + 1 - j, j, big, skip, LEAVES.jungle);
  }
  trunkVines(ctx, rng, x, y, z, h, 2);
  leafVines(ctx, rng, x, y + h - 3, z, 5, y + h, 0.25);
  return true;
}

// ---- cherry (1.20) ---------------------------------------------------------------------------------------
export function cherry(ctx, rng, x, y, z) {
  const free = 7 + rng.nextInt(2);
  if (!ctx.trunkFree(x, y, z, free, 1, false, 1, 0, 2)) return false;
  ctx.dirt(x, y - 1, z);
  const log = LOG.cherry, leaf = LEAVES.cherry;
  const i = Math.max(0, free - 1 + rng.between(-4, -3));
  let j = Math.max(0, free - 1 + rng.between(-4, -4));
  if (j >= i) j++;
  const r3 = rng.nextInt(3);
  const k = r3 + 1;                 // branch count 1..3
  const three = k === 3, twoPlus = k >= 2;
  const l = three ? free : twoPlus ? Math.max(i, j) + 1 : i + 1;
  for (let m = 0; m < l; m++) ctx.log(x, y + m, z, mk(log, AX_Y));
  const atts = [];
  if (three) atts.push([x, y + l, z]);
  const d = rng.nextInt(4);
  const branch = (dd, start, below) => {
    const axis = dd >= 2 ? AX_X : AX_Z;
    let px = x, py = y + start, pz = z;
    const endY = free - 1 + rng.between(-1, 0);
    const bl = below || endY < start;
    const len = rng.between(2, 4) + (bl ? 1 : 0);
    const tx = x + DIRS[dd][0] * len, ty = y + endY, tz = z + DIRS[dd][1] * len;
    const kk = bl ? 2 : 1;
    for (let q = 0; q < kk; q++) { px += DIRS[dd][0]; pz += DIRS[dd][1]; ctx.log(px, py, pz, mk(log, axis)); }
    const up = ty > py ? 1 : -1;
    for (let guard = 0; guard < 32; guard++) {
      const dist = Math.abs(tx - px) + Math.abs(ty - py) + Math.abs(tz - pz);
      if (dist === 0) return [tx, ty + 1, tz];
      const f = Math.abs(ty - py) / dist;
      const vert = rng.nextFloat() < f;
      if (vert) py += up; else { px += DIRS[dd][0]; pz += DIRS[dd][1]; }
      ctx.log(px, py, pz, mk(log, vert ? AX_Y : axis));
    }
    return [px, py + 1, pz];
  };
  atts.push(branch(d, i, i < l - 1));
  if (twoPlus) atts.push(branch(d ^ 1, j, j < l - 1));
  // CherryFoliagePlacer(radius 4, offset 0, height 5)
  const skip = (r2, lx, ly, lz, range) => {
    if (ly === -1 && (lx === range || lz === range) && r2.nextFloat() < 0.25) return true;
    const corner = lx === range && lz === range;
    if (range > 2) return corner || (lx + lz > range * 2 - 2 && r2.nextFloat() < 0.5);
    return corner && r2.nextFloat() < 0.5;
  };
  for (const [ax, ay, az] of atts) {
    const r = 3;
    leavesRow(ctx, rng, ax, ay, az, r - 2, 2, false, skip, leaf);
    leavesRow(ctx, rng, ax, ay, az, r - 1, 1, false, skip, leaf);
    leavesRow(ctx, rng, ax, ay, az, r, 0, false, skip, leaf);
    hangingRow(ctx, rng, ax, ay, az, r, -1, skip, leaf);
    hangingRow(ctx, rng, ax, ay, az, r - 1, -2, skip, leaf);
  }
  return true;
}
function hangingRow(ctx, rng, cx, cy, cz, range, ly, skip, leaf) {
  leavesRow(ctx, rng, cx, cy, cz, range, ly, false, skip, leaf);
  const y = cy + ly - 1;
  for (let dx = -range; dx <= range; dx++) for (let dz = -range; dz <= range; dz++) {
    if (Math.abs(dx) !== range && Math.abs(dz) !== range) continue;
    if (!ctx.isLeaf(cx + dx, y + 1, cz + dz)) continue;
    if (Math.abs(dx) + Math.abs(dz) >= 7) continue;
    if (rng.nextFloat() < 0.16666667 && ctx.leaf(cx + dx, y, cz + dz, leaf)) {
      if (rng.nextFloat() < 0.33333334) ctx.leaf(cx + dx, y - 1, cz + dz, leaf);
    }
  }
}

// ---- other features ----------------------------------------------------------------------------------------
// Mossy boulder (forest_rock): a few overlapping spheres of mossy cobblestone
export function mossyBoulder(ctx, rng, x, y, z) {
  for (let n = 0; n < 3; n++) {
    const a = rng.nextInt(2), b = rng.nextInt(2), c = rng.nextInt(2);
    const f = (a + b + c) * 0.333 + 0.5;
    for (let dx = -a; dx <= a; dx++) for (let dy = -b; dy <= b; dy++) for (let dz = -c; dz <= c; dz++) {
      if (dx * dx + dy * dy + dz * dz <= f * f) ctx.setInChunk(x + dx, y + dy, z + dz, ID.mossy_cobblestone);
    }
    x += -1 + rng.nextInt(2); z += -1 + rng.nextInt(2); y -= rng.nextInt(2);
  }
}

// Ice spike (vanilla IceSpikeFeature, simplified): packed ice cone, rarely a huge one
export function iceSpike(ctx, rng, x, y, z) {
  y += rng.nextInt(4);
  const i = rng.nextInt(4) + 7;
  const j = Math.trunc(i / 4) + rng.nextInt(2);
  if (j > 1 && rng.nextInt(60) === 0) y += 10 + rng.nextInt(30);
  for (let k = 0; k < i; k++) {
    const f = (1 - k / i) * j;
    const l = Math.ceil(f);
    for (let m = -l; m <= l; m++) {
      const g = Math.abs(m) - 0.25;
      for (let n = -l; n <= l; n++) {
        const h = Math.abs(n) - 0.25;
        if ((m === 0 && n === 0 || !(g * g + h * h > f * f)) && (m !== -l && m !== l && n !== -l && n !== l || !(rng.nextFloat() > 0.75))) {
          ctx.spike(x + m, y + k, z + n);
          if (k !== 0 && l > 1) ctx.spike(x + m, y - k, z + n);
        }
      }
    }
  }
  let k = j - 1;
  if (k < 0) k = 0; else if (k > 1) k = 1;
  for (let l = -k; l <= k; l++) for (let m = -k; m <= k; m++) {
    let yy = y - 1, n = 50;
    if (Math.abs(l) === 1 && Math.abs(m) === 1) n = rng.nextInt(5);
    while (yy > 50 && n > 0) {
      if (!ctx.spikeDown(x + l, yy, z + m)) break;
      yy--; n--;
    }
  }
  return true;
}
