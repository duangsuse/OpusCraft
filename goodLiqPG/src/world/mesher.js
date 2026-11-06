// Chunk mesher (runs in workers). Builds a 48x48 region around the chunk, computes light, then emits quads with
// Minecraft-style smooth lighting + ambient occlusion for every block model.
import {
  BLOCKS, T_OPAQUE, T_FLUID, T_LIGHT, TYPE_MASK, META_SHIFT, MAT, L_SOLID, L_CUTOUT, L_TRANSLUCENT, HFACE, ID, connects,
} from './blocks.js';
import { RW, computeLight } from './light.js';
import { HEIGHT, SECTIONS, BIOME_OFF, HEIGHTMAP_OFF } from './constants.js';

const PLANE = RW * RW;
const RH = HEIGHT;
const R = new Uint16Array(PLANE * RH);
const SKY = new Uint8Array(PLANE * RH);
const BLK = new Uint8Array(PLANE * RH);
const BIO = new Uint8Array(PLANE);         // biome per region column

// ---- Texture lookup tables (filled by init) --------------------------------------------------------
const FACE_TEX = new Int16Array(4096 * 6).fill(0);
const FRONT_TEX = new Int16Array(4096).fill(-1);
const TOP_TEX = new Int16Array(4096).fill(-1);
let TEX = {};            // name -> layer
let OVERLAY_LAYER = 0;
let GRASS_COLORS = new Uint32Array(256).fill(0x91bd59), FOLIAGE_COLORS = new Uint32Array(256).fill(0x77ab2f), WATER_COLORS = new Uint32Array(256).fill(0x3f76e4);

export function initMesher(texLayers, biomeColors) {
  TEX = texLayers;
  const L = (n) => (n in TEX ? TEX[n] : (TEX.__missing ?? 0));
  for (const b of BLOCKS) {
    if (!b.texFaces) continue;
    for (let f = 0; f < 6; f++) FACE_TEX[b.id * 6 + f] = L(b.texFaces[f]);
    if (b.texFaces[6]) FRONT_TEX[b.id] = L(b.texFaces[6]);
    if (b.texTop) TOP_TEX[b.id] = L(b.texTop);
  }
  OVERLAY_LAYER = L('grass_block_side_overlay');
  if (biomeColors) {
    const fill = (arr, src, def) => { arr.fill(def); src.forEach((c, i) => { arr[i] = c; }); return arr; };
    fill(GRASS_COLORS, biomeColors.grass || [], 0x91bd59);
    fill(FOLIAGE_COLORS, biomeColors.foliage || [], 0x77ab2f);
    fill(WATER_COLORS, biomeColors.water || [], 0x3f76e4);
  }
}
const tl = (n) => (n in TEX ? TEX[n] : 0);

// ---- Output buffers -----------------------------------------------------------------------------------
// Vertex (24 bytes): i16 x,y,z (1/16 block), i16 texLayer | u16 u,v (1/4096) | i8 nx,ny,nz, u8 mat | u8 sky,blk,ao,flags | u8 r,g,b,sway
class VBuf {
  constructor() { this.alloc(1 << 14); }
  alloc(cap) {
    this.cap = cap; this.buf = new ArrayBuffer(cap * 24);
    this.s = new Int16Array(this.buf); this.us = new Uint16Array(this.buf); this.b = new Int8Array(this.buf); this.ub = new Uint8Array(this.buf);
  }
  reset() { this.n = 0; this.secStart = new Int32Array(SECTIONS + 1); this.curSec = 0; }
  grow() {
    const old = this.ub, n = this.n; this.alloc(this.cap * 2); this.ub.set(old.subarray(0, n * 24));
  }
}
const OUT = [new VBuf(), new VBuf(), new VBuf()];
const FLAG_OVERLAY = 1, FLAG_NOAO = 2, FLAG_BACK = 4;

// current emission state
let cx0 = 0, cz0 = 0; // region offset of center chunk (16,16)
let colGrass = new Uint32Array(256), colFoliage = new Uint32Array(256), colWater = new Uint32Array(256);

function vtx(o, x, y, z, u, v, layer, nx, ny, nz, mat, sky, blk, ao, flags, rgb, sway) {
  if (o.n >= o.cap) o.grow();
  const i = o.n++, s = i * 12, b = i * 24;
  o.s[s] = Math.round(x * 16); o.s[s + 1] = Math.round(y * 16); o.s[s + 2] = Math.round(z * 16); o.s[s + 3] = layer;
  o.us[s + 4] = Math.round(u * 4096) & 0xffff; o.us[s + 5] = Math.round(v * 4096) & 0xffff;
  o.b[b + 12] = nx; o.b[b + 13] = ny; o.b[b + 14] = nz; o.ub[b + 15] = mat;
  o.ub[b + 16] = sky; o.ub[b + 17] = blk; o.ub[b + 18] = ao; o.ub[b + 19] = flags;
  o.ub[b + 20] = (rgb >> 16) & 255; o.ub[b + 21] = (rgb >> 8) & 255; o.ub[b + 22] = rgb & 255; o.ub[b + 23] = sway;
}

// ---- Face tables ------------------------------------------------------------------------------------
const FDIR = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]];
const FOFF = [-PLANE, PLANE, -RW, RW, -1, 1];
// vertex corner selectors (0 = min, 1 = max) per face, CCW from outside
const FV = [
  [[0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[1, 1, 0], [1, 0, 0], [0, 0, 0], [0, 1, 0]],
  [[0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 1, 1]],
  [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
  [[1, 1, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0]],
];
// tangent axes per face (indices into xyz) for light interpolation
const T1 = [0, 0, 0, 0, 2, 2], T2 = [2, 2, 1, 1, 1, 1];
const T1OFF = [1, 1, 1, 1, RW, RW], T2OFF = [RW, RW, PLANE, PLANE, PLANE, PLANE];
const NRM = [[0, -127, 0], [0, 127, 0], [0, 0, -127], [0, 0, 127], [-127, 0, 0], [127, 0, 0]];

// corner light results
const cS = new Float32Array(4), cB = new Float32Array(4), cA = new Float32Array(4);
const AO_SHADE = 0.2;
function cornerLight(n, f) {
  // n = region index of the cell in front of the face. corners ordered (-,-),(-,+),(+,-),(+,+) along (t1,t2)
  const o1 = T1OFF[f], o2 = T2OFF[f];
  const sN = SKY[n], bN = BLK[n];
  let k = 0;
  for (let s1 = -1; s1 <= 1; s1 += 2) for (let s2 = -1; s2 <= 1; s2 += 2) {
    const i1 = n + s1 * o1, i2 = n + s2 * o2, ic = i1 + s2 * o2;
    const op1 = T_OPAQUE[R[i1] & TYPE_MASK], op2 = T_OPAQUE[R[i2] & TYPE_MASK];
    const opc = (op1 && op2) ? 1 : T_OPAQUE[R[ic] & TYPE_MASK];
    cA[k] = (1 + (op1 ? AO_SHADE : 1) + (op2 ? AO_SHADE : 1) + (opc ? AO_SHADE : 1)) * 0.25;
    let s1v = op1 ? 0 : SKY[i1], b1v = op1 ? 0 : BLK[i1];
    let s2v = op2 ? 0 : SKY[i2], b2v = op2 ? 0 : BLK[i2];
    let scv = (op1 && op2) ? 0 : (opc ? 0 : SKY[ic]), bcv = (op1 && op2) ? 0 : (opc ? 0 : BLK[ic]);
    if (s1v === 0 && b1v === 0) { s1v = sN; b1v = bN; }
    if (s2v === 0 && b2v === 0) { s2v = sN; b2v = bN; }
    if (scv === 0 && bcv === 0) { scv = sN; bcv = bN; }
    cS[k] = (sN + s1v + s2v + scv) * 0.25;
    cB[k] = (bN + b1v + b2v + bcv) * 0.25;
    k++;
  }
}

// emit a face of a box. box coords in block units (0..1) relative to cell; (rx,ry,rz) region coords of the cell.
// uvr: [u0,v0,u1,v1] in pixels or null (auto); rot: 0..3 uv rotation; light: 0 smooth, 1 flat(own cell), 2 flat(neighbor)
const vx = new Float32Array(4), vy = new Float32Array(4), vz = new Float32Array(4), vu = new Float32Array(4), vv = new Float32Array(4);
const vS = new Float32Array(4), vB = new Float32Array(4), vA = new Float32Array(4);
function face(o, ri, rx, ry, rz, f, x0, y0, z0, x1, y1, z1, layer, uvr, rot, rgb, flags, mat, lightMode, sway, twoSided) {
  const fv = FV[f];
  const bx = [x0, x1], by = [y0, y1], bz = [z0, z1];
  for (let k = 0; k < 4; k++) {
    const c = fv[k];
    vx[k] = bx[c[0]]; vy[k] = by[c[1]]; vz[k] = bz[c[2]];
  }
  // UVs
  if (uvr) {
    const cu = [uvr[0], uvr[0], uvr[2], uvr[2]], cv = [uvr[1], uvr[3], uvr[3], uvr[1]];
    for (let k = 0; k < 4; k++) { const j = (k + rot) & 3; vu[k] = cu[j] / 16; vv[k] = cv[j] / 16; }
  } else {
    for (let k = 0; k < 4; k++) {
      let u, v;
      switch (f) {
        case 0: u = vx[k]; v = 1 - vz[k]; break;
        case 1: u = vx[k]; v = vz[k]; break;
        case 2: u = 1 - vx[k]; v = 1 - vy[k]; break;
        case 3: u = vx[k]; v = 1 - vy[k]; break;
        case 4: u = vz[k]; v = 1 - vy[k]; break;
        default: u = 1 - vz[k]; v = 1 - vy[k]; break;
      }
      vu[k] = u; vv[k] = v;
    }
    if (rot) {
      const tu = vu.slice(), tv = vv.slice();
      for (let k = 0; k < 4; k++) { const j = (k + rot) & 3; vu[k] = tu[j]; vv[k] = tv[j]; }
    }
  }
  // Lighting
  if (lightMode === 0) {
    const d = FDIR[f];
    const onBoundary = (f === 0 && y0 <= 0) || (f === 1 && y1 >= 1) || (f === 2 && z0 <= 0) || (f === 3 && z1 >= 1) || (f === 4 && x0 <= 0) || (f === 5 && x1 >= 1);
    const n = onBoundary ? ri + FOFF[f] : ri;
    cornerLight(n, f);
    const t1 = T1[f], t2 = T2[f];
    for (let k = 0; k < 4; k++) {
      const p = [vx[k], vy[k], vz[k]];
      const a = p[t1], b = p[t2];
      const w00 = (1 - a) * (1 - b), w01 = (1 - a) * b, w10 = a * (1 - b), w11 = a * b;
      vS[k] = cS[0] * w00 + cS[1] * w01 + cS[2] * w10 + cS[3] * w11;
      vB[k] = cB[0] * w00 + cB[1] * w01 + cB[2] * w10 + cB[3] * w11;
      vA[k] = cA[0] * w00 + cA[1] * w01 + cA[2] * w10 + cA[3] * w11;
    }
    void d;
  } else {
    const n = lightMode === 2 ? ri + FOFF[f] : ri;
    let s = SKY[n], b = BLK[n];
    if (lightMode === 1) { // own cell; also consider cell above for things like plants under nothing
      const up = ri + PLANE;
      if (SKY[up] > s) s = SKY[up];
      if (BLK[up] > b) b = BLK[up];
    }
    for (let k = 0; k < 4; k++) { vS[k] = s; vB[k] = b; vA[k] = 1; }
  }
  const nr = NRM[f];
  const px = rx - 16, py = ry, pz = rz - 16;
  // flip quad diagonal for smoother AO interpolation
  const flip = (vA[0] + vA[2]) * 2 + (vS[0] + vS[2] + vB[0] + vB[2]) / 15 < (vA[1] + vA[3]) * 2 + (vS[1] + vS[3] + vB[1] + vB[3]) / 15 - 1e-4;
  for (let q = 0; q < 4; q++) {
    const k = flip ? (q + 1) & 3 : q;
    vtx(o, px + vx[k], py + vy[k], pz + vz[k], vu[k], vv[k], layer, nr[0], nr[1], nr[2], mat,
      Math.round(vS[k] * 17), Math.round(vB[k] * 17), Math.round(vA[k] * 255), flags, rgb, sway ? sway[k] : 0);
  }
  if (twoSided) {
    for (let q = 3; q >= 0; q--) {
      const k = flip ? (q + 1) & 3 : q;
      vtx(o, px + vx[k], py + vy[k], pz + vz[k], vu[k], vv[k], layer, -nr[0], -nr[1], -nr[2], mat,
        Math.round(vS[k] * 17), Math.round(vB[k] * 17), Math.round(vA[k] * 255), flags | FLAG_BACK, rgb, sway ? sway[k] : 0);
    }
  }
}

// Generic arbitrary quad (for rotated/diagonal geometry). pts: 4 [x,y,z] in block units (cell-relative), uvs: 4 [u,v] in 0..1
function quad(o, ri, rx, ry, rz, pts, uvs, layer, normal, rgb, flags, mat, sways, twoSided, lightCell) {
  const li = lightCell !== undefined ? lightCell : ri;
  let s = SKY[li], b = BLK[li];
  const up = li + PLANE;
  if (SKY[up] > s && T_OPAQUE[R[li] & TYPE_MASK] === 0) s = Math.max(s, SKY[up] - 1);
  if (BLK[up] > b) b = Math.max(b, BLK[up] - 1);
  const px = rx - 16, py = ry, pz = rz - 16;
  const S = Math.round(s * 17), B = Math.round(b * 17);
  for (let k = 0; k < 4; k++) vtx(o, px + pts[k][0], py + pts[k][1], pz + pts[k][2], uvs[k][0], uvs[k][1], layer, normal[0], normal[1], normal[2], mat, S, B, 255, flags | FLAG_NOAO, rgb, sways ? sways[k] : 0);
  if (twoSided) for (let k = 3; k >= 0; k--) vtx(o, px + pts[k][0], py + pts[k][1], pz + pts[k][2], uvs[k][0], uvs[k][1], layer, -normal[0], -normal[1], -normal[2], mat, S, B, 255, flags | FLAG_NOAO | FLAG_BACK, rgb, sways ? sways[k] : 0);
}

// Emits a box with per-face textures. texs: array(6) of layers (-1 to skip). cull: skip boundary faces touching opaque blocks.
function box(o, ri, rx, ry, rz, x0, y0, z0, x1, y1, z1, texs, opt) {
  const a0 = x0 / 16, b0 = y0 / 16, c0 = z0 / 16, a1 = x1 / 16, b1 = y1 / 16, c1 = z1 / 16;
  for (let f = 0; f < 6; f++) {
    const layer = texs[f];
    if (layer < 0) continue;
    const onB = (f === 0 && b0 <= 0) || (f === 1 && b1 >= 1) || (f === 2 && c0 <= 0) || (f === 3 && c1 >= 1) || (f === 4 && a0 <= 0) || (f === 5 && a1 >= 1);
    if (opt.cull !== false && onB && T_OPAQUE[R[ri + FOFF[f]] & TYPE_MASK]) continue;
    if (opt.skipFaces && (opt.skipFaces >> f) & 1) continue;
    const uvr = opt.uv ? opt.uv[f] : null;
    const tint = opt.tintMask === undefined ? (opt.rgb !== undefined ? opt.rgb : 0xffffff) : ((opt.tintMask >> f) & 1 ? opt.rgb : 0xffffff);
    face(o, ri, rx, ry, rz, f, a0, b0, c0, a1, b1, c1, layer, uvr, opt.rot ? opt.rot[f] : 0, tint, opt.flags || 0, opt.mat || 0, opt.flat ? 1 : 0, null, false);
  }
}

// rotate point about y axis by quarter turns around block center
function rotY(p, q) {
  let [x, y, z] = p;
  for (let i = 0; i < q; i++) { const nx = 1 - z, nz = x; x = nx; z = nz; }
  return [x, y, z];
}

function hash3(x, y, z) {
  let h = (x * 3129871) ^ (z * 116129781) ^ y;
  h = h * h * 42317861 + h * 11;
  return (h >> 16) & 0xffff; // 0..65535
}

// ---- Fluids ------------------------------------------------------------------------------------------
function fluidType(v) { return T_FLUID[v & TYPE_MASK]; }
function ownHeight(v) {
  const b = BLOCKS[v & TYPE_MASK];
  if (b.waterlogged) return 8 / 9;
  const m = v >>> META_SHIFT;
  if (m & 8) return 8 / 9;
  const lvl = m & 7;
  return (8 - lvl) / 9;
}
function fluidHeightAt(i, ft) {
  const v = R[i];
  if (fluidType(v) === ft) {
    if (fluidType(R[i + PLANE]) === ft) return 1;
    return ownHeight(v);
  }
  const t = v & TYPE_MASK;
  return BLOCKS[t].solid && T_OPAQUE[t] ? -1 : 0;
}
function addW(acc, h) {
  if (h >= 0.8) { acc[0] += h * 10; acc[1] += 10; } else if (h >= 0) { acc[0] += h; acc[1] += 1; }
}
function avgHeight(i, ft, h, h1, h2, diag) {
  if (h2 >= 1 || h1 >= 1) return 1;
  const acc = [0, 0];
  if (h2 > 0 || h1 > 0) {
    const f = fluidHeightAt(diag, ft);
    if (f >= 1) return 1;
    addW(acc, f);
  }
  addW(acc, h); addW(acc, h2); addW(acc, h1);
  return acc[1] ? acc[0] / acc[1] : h;
}

function meshFluid(ri, rx, ry, rz, v, ft) {
  const isWater = ft === 1;
  const o = isWater ? OUT[2] : OUT[0];
  const mat = isWater ? MAT.WATER : MAT.LAVA;
  const col = isWater ? colWater[(rz - 16) * 16 + (rx - 16)] : 0xffffff;
  const still = isWater ? tl('water_still') : tl('lava_still');
  const flow = isWater ? tl('water_flow') : tl('lava_flow');
  const above = R[ri + PLANE];
  let hNW, hNE, hSW, hSE;
  const h = fluidHeightAt(ri, ft);
  if (h >= 1) { hNW = hNE = hSW = hSE = 1; } else {
    const hN = fluidHeightAt(ri - RW, ft), hS = fluidHeightAt(ri + RW, ft), hE = fluidHeightAt(ri + 1, ft), hW = fluidHeightAt(ri - 1, ft);
    hNE = avgHeight(ri, ft, h, hN, hE, ri - RW + 1);
    hNW = avgHeight(ri, ft, h, hN, hW, ri - RW - 1);
    hSE = avgHeight(ri, ft, h, hS, hE, ri + RW + 1);
    hSW = avgHeight(ri, ft, h, hS, hW, ri + RW - 1);
  }
  const px = rx - 16, py = ry, pz = rz - 16;
  const lightAt = (i) => [SKY[i], BLK[i]];
  const emitQ = (pts, uvs, nrm, li, back) => {
    let [s, b] = lightAt(li);
    const [s2, b2] = lightAt(ri);
    s = Math.max(s, s2); b = Math.max(b, b2);
    const S = Math.round(s * 17), B = Math.round(b * 17);
    const order = back ? [3, 2, 1, 0] : [0, 1, 2, 3];
    for (const k of order) vtx(o, px + pts[k][0], py + pts[k][1], pz + pts[k][2], uvs[k][0], uvs[k][1], uvs[k][2], back ? -nrm[0] : nrm[0], back ? -nrm[1] : nrm[1], back ? -nrm[2] : nrm[2], mat, S, B, 255, FLAG_NOAO | (back ? FLAG_BACK : 0), col, 0);
  };
  const e = 0.001;
  // top
  if (fluidType(above) !== ft) {
    const fx = (hNW + hSW) - (hNE + hSE), fz = (hNW + hNE) - (hSW + hSE);
    let layer = still, uvs;
    if (Math.abs(fx) > 1e-3 || Math.abs(fz) > 1e-3) {
      layer = flow;
      const ang = Math.atan2(fz, fx) - Math.PI / 2;
      const s = Math.sin(ang) * 0.5, c = Math.cos(ang) * 0.5;
      const uv = (du, dv) => [1 + 0.5 + du * c - dv * s, 1 + 0.5 + du * s + dv * c, layer];
      uvs = [uv(-1, -1), uv(-1, 1), uv(1, 1), uv(1, -1)];
    } else {
      uvs = [[0, 0, layer], [0, 1, layer], [1, 1, layer], [1, 0, layer]];
    }
    const pts = [[0, hNW - e, 0], [0, hSW - e, 1], [1, hSE - e, 1], [1, hNE - e, 0]];
    emitQ(pts, uvs, [0, 127, 0], ri + PLANE, false);
    // underside of the surface (seen from below)
    emitQ(pts, uvs, [0, 127, 0], ri, true);
  }
  // bottom
  const below = R[ri - PLANE];
  if (fluidType(below) !== ft && !T_OPAQUE[below & TYPE_MASK]) {
    emitQ([[0, e, 1], [0, e, 0], [1, e, 0], [1, e, 1]], [[0, 1, still], [0, 0, still], [1, 0, still], [1, 1, still]], [0, -127, 0], ri - PLANE, false);
  }
  // sides
  const sides = [
    [2, -RW, [[1, hNE, 0], [1, 0, 0], [0, 0, 0], [0, hNW, 0]], [0, 0, -127]],
    [3, RW, [[0, hSW, 1], [0, 0, 1], [1, 0, 1], [1, hSE, 1]], [0, 0, 127]],
    [4, -1, [[0, hNW, 0], [0, 0, 0], [0, 0, 1], [0, hSW, 1]], [-127, 0, 0]],
    [5, 1, [[1, hSE, 1], [1, 0, 1], [1, 0, 0], [1, hNE, 0]], [127, 0, 0]],
  ];
  for (const [f, off, pts, nrm] of sides) {
    const nv = R[ri + off];
    if (fluidType(nv) === ft || T_OPAQUE[nv & TYPE_MASK]) continue;
    const p2 = pts.map(p => [p[0] + (f === 4 ? e : f === 5 ? -e : 0), p[1], p[2] + (f === 2 ? e : f === 3 ? -e : 0)]);
    const uvs = [[0, (1 - pts[0][1]) * 0.5, flow], [0, 0.5, flow], [0.5, 0.5, flow], [0.5, (1 - pts[3][1]) * 0.5, flow]];
    emitQ(p2, uvs, nrm, ri + off, false);
    if (isWater) emitQ(p2, uvs, nrm, ri + off, true);
  }
  void f0;
}
const f0 = 0;

// ---- Main mesh routine ---------------------------------------------------------------------------------
// chunks: Map key -> {blocks:Uint16Array, biomes:Uint8Array, heightmap:Int16Array}
export function meshChunk(cx, cz, getChunk) {
  setOrigin(cx, cz);
  // 1. Build region
  let maxYi = 0;
  const hm = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ch = getChunk(cx + dx, cz + dz);
    hm.push(ch);
    if (ch) for (let i = 0; i < 256; i++) if (ch.heightmap[i] > maxYi) maxYi = ch.heightmap[i];
  }
  maxYi = Math.min(RH - 3, maxYi + 1);
  const rows = maxYi + 2;
  R.fill(0, 0, (rows + 1) * PLANE);
  let k = 0;
  for (let dz = 0; dz < 3; dz++) for (let dx = 0; dx < 3; dx++) {
    const ch = hm[k++];
    const ox = dx * 16, oz = dz * 16;
    if (!ch) continue;
    const src = ch.blocks;
    for (let y = 0; y <= rows; y++) for (let z = 0; z < 16; z++) {
      let s = (y * 16 + z) * 16, d = (y * RW + oz + z) * RW + ox;
      for (let x = 0; x < 16; x++) R[d++] = src[s++];
    }
    const bio = ch.biomes;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) BIO[(oz + z) * RW + ox + x] = bio[z * 16 + x];
  }
  // 2. Light
  computeLight(R, SKY, BLK, RH, maxYi);

  // 3. Biome tint blend (5x5) for the center chunk columns
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    let gr = 0, gg = 0, gb = 0, fr = 0, fg = 0, fb = 0, wr = 0, wg = 0, wb = 0, n = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const bi = BIO[(16 + z + dz) * RW + 16 + x + dx];
      const g = GRASS_COLORS[bi], f = FOLIAGE_COLORS[bi], w = WATER_COLORS[bi];
      gr += g >> 16 & 255; gg += g >> 8 & 255; gb += g & 255;
      fr += f >> 16 & 255; fg += f >> 8 & 255; fb += f & 255;
      wr += w >> 16 & 255; wg += w >> 8 & 255; wb += w & 255; n++;
    }
    const c = z * 16 + x;
    colGrass[c] = ((gr / n) << 16) | ((gg / n) << 8) | (gb / n);
    colFoliage[c] = ((fr / n) << 16) | ((fg / n) << 8) | (fb / n);
    colWater[c] = ((wr / n) << 16) | ((wg / n) << 8) | (wb / n);
  }

  // 4. Mesh center chunk
  for (const o of OUT) o.reset();
  const center = hm[4];
  let cMax = 0;
  for (let i = 0; i < 256; i++) if (center.heightmap[i] > cMax) cMax = center.heightmap[i];
  cMax = Math.min(cMax + 1, RH - 2);
  for (let y = 1; y <= cMax; y++) {
    const sec = y >> 4;
    for (const o of OUT) while (o.curSec < sec) { o.curSec++; o.secStart[o.curSec] = o.n; }
    for (let z = 16; z < 32; z++) {
      let ri = (y * RW + z) * RW + 16;
      for (let x = 16; x < 32; x++, ri++) {
        const v = R[ri];
        if (v === 0) continue;
        meshBlock(ri, x, y, z, v);
      }
    }
  }
  for (const o of OUT) while (o.curSec < SECTIONS) { o.curSec++; o.secStart[o.curSec] = o.n; }

  // 5. Pack output
  const total = OUT[0].n + OUT[1].n + OUT[2].n;
  const data = new ArrayBuffer(total * 24);
  const u8 = new Uint8Array(data);
  let off = 0;
  const layers = [];
  for (const o of OUT) {
    u8.set(o.ub.subarray(0, o.n * 24), off * 24);
    layers.push({ start: off, count: o.n, sec: Array.from(o.secStart, s => s + off) });
    off += o.n;
  }
  // center chunk light (sky<<4 | block), chunk-local layout
  const light = new Uint8Array(16 * 16 * RH);
  for (let y = 0; y < RH; y++) for (let z = 0; z < 16; z++) {
    const s = (y * RW + 16 + z) * RW + 16, d = (y * 16 + z) * 16;
    for (let x = 0; x < 16; x++) light[d + x] = (SKY[s + x] << 4) | BLK[s + x];
  }
  return { data, layers, light, vertexCount: total };
}

// ---- Per-block meshing ------------------------------------------------------------------------------
const SIDE_ROT_X = [1, 1, 1, 1, 0, 0]; // uv rotation for x-axis logs
const SIDE_ROT_Z = [0, 0, 0, 0, 1, 1]; // for z-axis logs (east/west faces rotated)
function meshBlock(ri, rx, ry, rz, v) {
  const t = v & TYPE_MASK, m = v >>> META_SHIFT, b = BLOCKS[t];
  const col = (rz - 16) * 16 + (rx - 16);
  const model = b.model;
  if (b.waterlogged) meshFluid(ri, rx, ry, rz, v, 1);
  switch (model) {
    case 'cube': return meshCube(ri, rx, ry, rz, t, m, b, col);
    case 'fluid': return meshFluid(ri, rx, ry, rz, v, T_FLUID[t]);
    case 'cross': return meshCross(ri, rx, ry, rz, t, m, b, col, b.texFaces[0] ? FACE_TEX[t * 6] : 0);
    case 'double_plant': {
      const upper = m & 1;
      const layer = upper ? TOP_TEX[t] : FACE_TEX[t * 6];
      meshCross(ri, rx, ry, rz, t, m, b, col, layer, upper ? [128, 255] : [0, 128]);
      if (upper && b.sunflower) {
        const front = tl('sunflower_front'), back = tl('sunflower_back');
        const E = [[0.62, 0.98, 1], [0.5, 0.18, 1], [0.5, 0.18, 0], [0.62, 0.98, 0]];
        quad(OUT[1], ri, rx, ry, rz, E, [[0, 0], [0, 1], [1, 1], [1, 0]], front, [124, 20, 0], 0xffffff, 0, MAT.PLANT, null, false);
        const W = [[0.615, 0.98, 0], [0.495, 0.18, 0], [0.495, 0.18, 1], [0.615, 0.98, 1]];
        quad(OUT[1], ri, rx, ry, rz, W, [[1, 0], [1, 1], [0, 1], [0, 0]], back, [-124, -20, 0], 0xffffff, 0, MAT.PLANT, null, false);
      }
      return;
    }
    case 'slab': {
      const bt = b.base !== undefined ? b.base : t;
      const tx = b.texFaces ? [0, 1, 2, 3, 4, 5].map(f => FACE_TEX[t * 6 + f]) : [0, 1, 2, 3, 4, 5].map(f => FACE_TEX[bt * 6 + f]);
      const y0 = m === 1 ? 8 : 0, y1 = m === 0 ? 8 : 16;
      return box(OUT[0], ri, rx, ry, rz, 0, y0, 0, 16, y1, 16, tx, { mat: b.mat });
    }
    case 'stairs': return meshStairs(ri, rx, ry, rz, t, m, b);
    case 'fence': case 'pane': case 'wall': return meshConnected(ri, rx, ry, rz, t, m, b);
    case 'torch': return meshTorch(ri, rx, ry, rz, t, m, b);
    case 'lantern': return meshLantern(ri, rx, ry, rz, t, m, b);
    case 'ladder': {
      const f = m & 3; // facing: ladder plane on the opposite side
      const L = FACE_TEX[t * 6];
      const pts = rotFacing([[0, 1, 15.2 / 16], [0, 0, 15.2 / 16], [1, 0, 15.2 / 16], [1, 1, 15.2 / 16]], f);
      const n = facingNormal(f);
      quad(OUT[1], ri, rx, ry, rz, pts, [[1, 0], [1, 1], [0, 1], [0, 0]], L, n, 0xffffff, 0, 0, null, true);
      return;
    }
    case 'rail': return meshRail(ri, rx, ry, rz, t, m, b);
    case 'door': return meshDoor(ri, rx, ry, rz, t, m, b);
    case 'trapdoor': {
      const L = FACE_TEX[t * 6];
      const f = m & 3, open = m & 4, top = m & 8;
      const tx = [L, L, L, L, L, L];
      if (!open) return box(OUT[1], ri, rx, ry, rz, 0, top ? 13 : 0, 0, 16, top ? 16 : 3, 16, tx, { cull: false });
      const bxs = [[0, 0, 13, 16, 16, 16], [0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 0, 3, 16, 16]][f];
      return box(OUT[1], ri, rx, ry, rz, ...bxs, tx, { cull: false });
    }
    case 'layer': {
      const h = ((m & 7) + 1) * 2;
      const L = FACE_TEX[t * 6];
      return box(OUT[0], ri, rx, ry, rz, 0, 0, 0, 16, h, 16, [L, L, L, L, L, L], { mat: b.mat, skipFaces: 0 });
    }
    case 'farmland': {
      const tx = [0, 1, 2, 3, 4, 5].map(f => FACE_TEX[t * 6 + f]);
      if (t === ID.farmland && (m & 7) >= 7) tx[1] = tl('farmland_moist');
      return box(OUT[0], ri, rx, ry, rz, 0, 0, 0, 16, 15, 16, tx, {});
    }
    case 'cactus': {
      const T = FACE_TEX[t * 6 + 1], B = FACE_TEX[t * 6], S = FACE_TEX[t * 6 + 2];
      box(OUT[1], ri, rx, ry, rz, 0, 0, 0, 16, 16, 16, [B, T, -1, -1, -1, -1], {});
      box(OUT[1], ri, rx, ry, rz, 0, 0, 1, 16, 16, 15, [-1, -1, S, S, -1, -1], { cull: false });
      box(OUT[1], ri, rx, ry, rz, 1, 0, 0, 15, 16, 16, [-1, -1, -1, -1, S, S], { cull: false });
      return;
    }
    case 'chest': {
      const tx = [0, 1, 2, 3, 4, 5].map(f => FACE_TEX[t * 6 + f]);
      tx[HFACE[m & 3]] = FRONT_TEX[t];
      return box(OUT[0], ri, rx, ry, rz, 1, 0, 1, 15, 14, 15, tx, {});
    }
    case 'carpet': {
      const L = FACE_TEX[t * 6];
      return box(OUT[0], ri, rx, ry, rz, 0, 0, 0, 16, 1, 16, [L, L, L, L, L, L], {});
    }
    case 'lily_pad': {
      const L = FACE_TEX[t * 6];
      const r = hash3(rx + cx0, ry, rz + cz0) & 3;
      const y = 1.5 / 16;
      const uvs = [[0, 0], [0, 1], [1, 1], [1, 0]];
      const ruv = uvs.map((_, i) => uvs[(i + r) & 3]);
      quad(OUT[1], ri, rx, ry, rz, [[0, y, 0], [0, y, 1], [1, y, 1], [1, y, 0]], ruv, L, [0, 127, 0], 0x208030, 0, MAT.PLANT, null, true);
      return;
    }
    case 'vine': {
      const L = FACE_TEX[t * 6], c = colFoliage[col];
      const d = 0.8 / 16;
      const sw = [255, 255, 255, 255];
      if (m & 1) quad(OUT[1], ri, rx, ry, rz, [[1, 1, d], [1, 0, d], [0, 0, d], [0, 1, d]], [[0, 0], [0, 1], [1, 1], [1, 0]], L, [0, 0, 127], c, 0, MAT.LEAVES, sw, true);
      if (m & 2) quad(OUT[1], ri, rx, ry, rz, [[0, 1, 1 - d], [0, 0, 1 - d], [1, 0, 1 - d], [1, 1, 1 - d]], [[0, 0], [0, 1], [1, 1], [1, 0]], L, [0, 0, -127], c, 0, MAT.LEAVES, sw, true);
      if (m & 4) quad(OUT[1], ri, rx, ry, rz, [[d, 1, 0], [d, 0, 0], [d, 0, 1], [d, 1, 1]], [[0, 0], [0, 1], [1, 1], [1, 0]], L, [127, 0, 0], c, 0, MAT.LEAVES, sw, true);
      if (m & 8) quad(OUT[1], ri, rx, ry, rz, [[1 - d, 1, 1], [1 - d, 0, 1], [1 - d, 0, 0], [1 - d, 1, 0]], [[0, 0], [0, 1], [1, 1], [1, 0]], L, [-127, 0, 0], c, 0, MAT.LEAVES, sw, true);
      return;
    }
    case 'crop': {
      const L = tl('wheat_stage' + Math.min(7, m & 7));
      const sw = [0, 255, 255, 0];
      for (const p of [4 / 16, 12 / 16]) {
        quad(OUT[1], ri, rx, ry, rz, [[p, 1 - 1 / 16, 0], [p, -1 / 16, 0], [p, -1 / 16, 1], [p, 1 - 1 / 16, 1]], [[0, 0], [0, 1], [1, 1], [1, 0]], L, [0, 127, 0], 0xffffff, 0, MAT.PLANT, [255, 0, 0, 255], true);
        quad(OUT[1], ri, rx, ry, rz, [[0, 1 - 1 / 16, p], [0, -1 / 16, p], [1, -1 / 16, p], [1, 1 - 1 / 16, p]], [[0, 0], [0, 1], [1, 1], [1, 0]], L, [0, 127, 0], 0xffffff, 0, MAT.PLANT, [255, 0, 0, 255], true);
      }
      void sw;
      return;
    }
    case 'petals': {
      const L = FACE_TEX[t * 6];
      const r = (m >> 2) & 3;
      const y = 1.5 / 16;
      const uvs = [[0, 0], [0, 1], [1, 1], [1, 0]];
      const ruv = uvs.map((_, i) => uvs[(i + r) & 3]);
      quad(OUT[1], ri, rx, ry, rz, [[0, y, 0], [0, y, 1], [1, y, 1], [1, y, 0]], ruv, L, [0, 127, 0], 0xffffff, 0, MAT.PLANT, null, false);
      return;
    }
    case 'portal': {
      const L = FACE_TEX[t * 6];
      const tx = [-1, -1, L, L, L, L];
      if ((m & 1) === 0) { tx[4] = tx[5] = -1; box(OUT[2], ri, rx, ry, rz, 0, 0, 6, 16, 16, 10, tx, { mat: MAT.PORTAL, flat: true, cull: false }); }
      else { tx[2] = tx[3] = -1; box(OUT[2], ri, rx, ry, rz, 6, 0, 0, 10, 16, 16, tx, { mat: MAT.PORTAL, flat: true, cull: false }); }
      return;
    }
    case 'fire': {
      const L = FACE_TEX[t * 6];
      const sw = [0, 0, 0, 0];
      const d = 0.15;
      quad(OUT[1], ri, rx, ry, rz, [[0, 1.4, d], [0, 0, 0], [1, 0, 0], [1, 1.4, d]], [[1, 0], [1, 1], [0, 1], [0, 0]], L, [0, 127, 0], 0xffffff, 0, MAT.FIRE, sw, true);
      quad(OUT[1], ri, rx, ry, rz, [[1, 1.4, 1 - d], [1, 0, 1], [0, 0, 1], [0, 1.4, 1 - d]], [[1, 0], [1, 1], [0, 1], [0, 0]], L, [0, 127, 0], 0xffffff, 0, MAT.FIRE, sw, true);
      quad(OUT[1], ri, rx, ry, rz, [[d, 1.4, 1], [0, 0, 1], [0, 0, 0], [d, 1.4, 0]], [[1, 0], [1, 1], [0, 1], [0, 0]], L, [0, 127, 0], 0xffffff, 0, MAT.FIRE, sw, true);
      quad(OUT[1], ri, rx, ry, rz, [[1 - d, 1.4, 0], [1, 0, 0], [1, 0, 1], [1 - d, 1.4, 1]], [[1, 0], [1, 1], [0, 1], [0, 0]], L, [0, 127, 0], 0xffffff, 0, MAT.FIRE, sw, true);
      return;
    }
    default: return;
  }
}

function meshCube(ri, rx, ry, rz, t, m, b, col) {
  const layerIdx = b.layer;
  const o = OUT[layerIdx];
  const cullMode = b.cull;
  const isGrass = t === ID.grass_block;
  let snowy = false;
  if (isGrass) { const at = R[ri + PLANE] & TYPE_MASK; snowy = at === ID.snow || at === ID.snow_block; }
  const tint = b.tint;
  let rgb = 0xffffff;
  if (tint === 'grass') rgb = colGrass[col];
  else if (tint === 'foliage') rgb = colFoliage[col];
  else if (tint === 'spruce') rgb = 0x619961;
  else if (tint === 'birch') rgb = 0x80a755;
  const mat = b.mat;
  for (let f = 0; f < 6; f++) {
    const nv = R[ri + FOFF[f]];
    const nt = nv & TYPE_MASK;
    if (T_OPAQUE[nt]) continue;
    if (cullMode === 'self' && nt === t) continue;
    let layer = FACE_TEX[t * 6 + f];
    let rot = 0, flags = 0, frgb = rgb;
    if (b.axis && m) {
      // logs/pillars lying on their side
      if (m === 1) { // x axis
        if (f === 4 || f === 5) layer = FACE_TEX[t * 6 + 1];
        else { layer = FACE_TEX[t * 6 + 2]; rot = SIDE_ROT_X[f]; }
      } else if (m === 2) { // z axis
        if (f === 2 || f === 3) layer = FACE_TEX[t * 6 + 1];
        else { layer = FACE_TEX[t * 6 + 2]; rot = SIDE_ROT_Z[f] || (f < 2 ? 0 : 0); }
      }
    }
    if (b.facing && FRONT_TEX[t] >= 0 && f === HFACE[m & 3]) layer = FRONT_TEX[t];
    if (isGrass) {
      if (f === 1) { frgb = rgb; }
      else if (f === 0) { frgb = 0xffffff; }
      else if (snowy) { layer = tl('grass_block_snow'); frgb = 0xffffff; }
      else { flags = FLAG_OVERLAY; frgb = rgb; }
    }
    face(o, ri, rx, ry, rz, f, 0, 0, 0, 1, 1, 1, layer, null, rot, frgb, flags, mat, 0, null, false);
  }
}

const CROSS_SWAY_TOP = [255, 0, 0, 255];
function meshCross(ri, rx, ry, rz, t, m, b, col, layer, swayRange) {
  let ox = 0, oz = 0, oy = 0;
  if (b.offset || t === ID.short_grass || t === ID.fern || b.name.endsWith('_tulip') || t === ID.tall_grass || t === ID.large_fern || b.model === 'double_plant') {
    const h = hash3(rx + cx0, 0, rz + cz0);
    ox = ((h & 15) / 15 - 0.5) * 0.5; oz = (((h >> 4) & 15) / 15 - 0.5) * 0.5;
    if (t === ID.short_grass || t === ID.fern) oy = -(((h >> 8) & 15) / 15) * 0.2;
  }
  if (b.model === 'double_plant' && (m & 1)) {
    // keep upper half aligned with the lower half's offset
    const h = hash3(rx + cx0, 0, rz + cz0);
    ox = ((h & 15) / 15 - 0.5) * 0.5; oz = (((h >> 4) & 15) / 15 - 0.5) * 0.5;
  }
  let rgb = 0xffffff;
  if (b.tint === 'grass') rgb = colGrass[col]; else if (b.tint === 'foliage') rgb = colFoliage[col];
  const mat = b.mat;
  const d = 0.05;
  let sw = CROSS_SWAY_TOP;
  if (swayRange) sw = [swayRange[1], swayRange[0], swayRange[0], swayRange[1]];
  if (mat !== MAT.PLANT) sw = null;
  const y0 = oy, y1 = 1 + oy;
  const P1 = [[d + ox, y1, d + oz], [d + ox, y0, d + oz], [1 - d + ox, y0, 1 - d + oz], [1 - d + ox, y1, 1 - d + oz]];
  const P2 = [[d + ox, y1, 1 - d + oz], [d + ox, y0, 1 - d + oz], [1 - d + ox, y0, d + oz], [1 - d + ox, y1, d + oz]];
  const uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
  quad(OUT[1], ri, rx, ry, rz, P1, uv, layer, [0, 127, 0], rgb, 0, mat, sw, true);
  quad(OUT[1], ri, rx, ry, rz, P2, uv, layer, [0, 127, 0], rgb, 0, mat, sw, true);
}

function isStairs(v) { return BLOCKS[v & TYPE_MASK].model === 'stairs'; }
// facing index: 0 N, 1 S, 2 W, 3 E. direction vectors
const HDX = [0, 0, -1, 1], HDZ = [-1, 1, 0, 0];
const CCW = [2, 3, 1, 0]; // counter-clockwise (viewed from above) of N is W, S->E, W->S, E->N
function stairShape(ri, m) {
  const f = m & 3, half = m & 4;
  const back = R[ri + HDX[f] + HDZ[f] * RW];
  if (isStairs(back) && ((back >>> META_SHIFT) & 4) === half) {
    const d1 = (back >>> META_SHIFT) & 3;
    if ((d1 < 2) !== (f < 2) && canTake(ri, m, d1 ^ 1)) return d1 === CCW[f] ? 'outer_left' : 'outer_right';
  }
  const front = R[ri - HDX[f] - HDZ[f] * RW];
  if (isStairs(front) && ((front >>> META_SHIFT) & 4) === half) {
    const d2 = (front >>> META_SHIFT) & 3;
    if ((d2 < 2) !== (f < 2) && canTake(ri, m, d2)) return d2 === CCW[f] ? 'inner_left' : 'inner_right';
  }
  return 'straight';
}
function canTake(ri, m, dir) {
  const n = R[ri + HDX[dir] + HDZ[dir] * RW];
  if (!isStairs(n)) return true;
  const nm = n >>> META_SHIFT;
  return (nm & 3) !== (m & 3) || (nm & 4) !== (m & 4);
}
function meshStairs(ri, rx, ry, rz, t, m, b) {
  const tx = [0, 1, 2, 3, 4, 5].map(f => FACE_TEX[t * 6 + f]);
  const top = m & 4, f = m & 3;
  const opt = { mat: b.mat };
  // base slab
  if (top) box(OUT[0], ri, rx, ry, rz, 0, 8, 0, 16, 16, 16, tx, opt); else box(OUT[0], ri, rx, ry, rz, 0, 0, 0, 16, 8, 16, tx, opt);
  const y0 = top ? 0 : 8, y1 = top ? 8 : 16;
  const shape = stairShape(ri, m);
  // quadrants in xz: [x0,z0] of 8x8 cells. define facing-local quadrant set then map
  // facing direction quadrants: "back" row is toward facing.
  const quads = new Set();
  const backRow = { 0: [[0, 0], [8, 0]], 1: [[0, 8], [8, 8]], 2: [[0, 0], [0, 8]], 3: [[8, 0], [8, 8]] }[f];
  const leftOf = (d) => CCW[d]; // direction to the left when facing d
  const quadAt = (d1, d2) => { // quadrant at corner of directions d1 and d2
    const x = (HDX[d1] + HDX[d2]) > 0 ? 8 : 0, z = (HDZ[d1] + HDZ[d2]) > 0 ? 8 : 0; return [x, z];
  };
  if (shape === 'straight') backRow.forEach(q => quads.add(q.join()));
  else if (shape === 'outer_left') quads.add(quadAt(f, leftOf(f)).join());
  else if (shape === 'outer_right') quads.add(quadAt(f, leftOf(f) ^ 1).join());
  else {
    backRow.forEach(q => quads.add(q.join()));
    const side = shape === 'inner_left' ? leftOf(f) : leftOf(f) ^ 1;
    quads.add(quadAt(f ^ 1, side).join());
  }
  // merge pairs into boxes
  const has = (x, z) => quads.has(x + ',' + z);
  const done = new Set();
  for (const k of quads) {
    if (done.has(k)) continue;
    const [x, z] = k.split(',').map(Number);
    if (x === 0 && has(8, z) && !done.has('8,' + z)) { box(OUT[0], ri, rx, ry, rz, 0, y0, z, 16, y1, z + 8, tx, opt); done.add(k); done.add('8,' + z); continue; }
    if (z === 0 && has(x, 8) && !done.has(x + ',8') && !(has(x ^ 8, 0) )) { box(OUT[0], ri, rx, ry, rz, x, y0, 0, x + 8, y1, 16, tx, opt); done.add(k); done.add(x + ',8'); continue; }
    box(OUT[0], ri, rx, ry, rz, x, y0, z, x + 8, y1, z + 8, tx, opt); done.add(k);
  }
}

function meshConnected(ri, rx, ry, rz, t, m, b) {
  const L = FACE_TEX[t * 6 + 2];
  const tx = [0, 1, 2, 3, 4, 5].map(f => FACE_TEX[t * 6 + f]);
  const cN = connects(b, R[ri - RW]), cS = connects(b, R[ri + RW]), cW = connects(b, R[ri - 1]), cE = connects(b, R[ri + 1]);
  if (b.model === 'fence') {
    const o = { cull: false, mat: b.mat };
    box(OUT[0], ri, rx, ry, rz, 6, 0, 6, 10, 16, 10, tx, o);
    for (const [y0, y1] of [[12, 15], [6, 9]]) {
      if (cN) box(OUT[0], ri, rx, ry, rz, 7, y0, 0, 9, y1, 6, tx, o);
      if (cS) box(OUT[0], ri, rx, ry, rz, 7, y0, 10, 9, y1, 16, tx, o);
      if (cW) box(OUT[0], ri, rx, ry, rz, 0, y0, 7, 6, y1, 9, tx, o);
      if (cE) box(OUT[0], ri, rx, ry, rz, 10, y0, 7, 16, y1, 9, tx, o);
    }
  } else if (b.model === 'wall') {
    const o = { cull: false };
    const tall = (R[ri + PLANE] & TYPE_MASK) !== 0;
    const straight = ((cN && cS && !cW && !cE) || (cW && cE && !cN && !cS));
    if (!straight || tall) box(OUT[0], ri, rx, ry, rz, 4, 0, 4, 12, 16, 12, tx, o);
    const h = tall ? 16 : 14;
    if (cN) box(OUT[0], ri, rx, ry, rz, 5, 0, 0, 11, h, straight && !tall ? 16 : 4, tx, o);
    if (cS && !(straight && !tall && cN)) box(OUT[0], ri, rx, ry, rz, 5, 0, 12, 11, h, 16, tx, o);
    if (cW) box(OUT[0], ri, rx, ry, rz, 0, 0, 5, straight && !tall ? 16 : 4, h, 11, tx, o);
    if (cE && !(straight && !tall && cW)) box(OUT[0], ri, rx, ry, rz, 12, 0, 5, 16, h, 11, tx, o);
  } else {
    // glass pane / iron bars: thin 2px panes
    const top = b.bars ? L : FACE_TEX[t * 6 + 1];
    const o = { cull: false, mat: b.mat };
    const any = cN || cS || cW || cE;
    const side = top;
    if (!any) {
      box(OUT[1], ri, rx, ry, rz, 7, 0, 0, 9, 16, 16, [top, top, side, side, L, L], o);
      box(OUT[1], ri, rx, ry, rz, 0, 0, 7, 16, 16, 9, [top, top, L, L, side, side], o);
      return;
    }
    box(OUT[1], ri, rx, ry, rz, 7, 0, 7, 9, 16, 9, [top, top, cN ? -1 : side, cS ? -1 : side, cW ? -1 : side, cE ? -1 : side], o);
    if (cN) box(OUT[1], ri, rx, ry, rz, 7, 0, 0, 9, 16, 7, [top, top, side, -1, L, L], { ...o, uv: [null, null, null, null, [9, 0, 16, 16], [0, 0, 7, 16]] });
    if (cS) box(OUT[1], ri, rx, ry, rz, 7, 0, 9, 9, 16, 16, [top, top, -1, side, L, L], { ...o, uv: [null, null, null, null, [0, 0, 7, 16].map((v, i) => i % 2 ? v : v + 9), [0, 0, 7, 16]] });
    if (cW) box(OUT[1], ri, rx, ry, rz, 0, 0, 7, 7, 16, 9, [top, top, L, L, side, -1], o);
    if (cE) box(OUT[1], ri, rx, ry, rz, 9, 0, 7, 16, 16, 9, [top, top, L, L, -1, side], o);
  }
}

// torch: standing (meta 0) or wall-mounted facing (meta 1..4 = N,S,W,E away from wall)
function meshTorch(ri, rx, ry, rz, t, m, b) {
  const L = FACE_TEX[t * 6];
  const o = OUT[1];
  // vanilla torch element: from (7,0,7) to (9,10,9); side uv (7,6)-(9,16), top uv (7,6)-(9,8)
  let pts = (p) => p;
  if (m > 0) {
    const f = m - 1; // facing away from wall
    // tilt 22.5 deg away from wall around the bottom, then move toward the wall
    const ang = 22.5 * Math.PI / 180;
    const dx = HDX[f], dz = HDZ[f];
    pts = (p) => {
      // local coords centered at (0.5, 0, 0.5)
      let x = p[0] - 0.5, y = p[1], z = p[2] - 0.5;
      // rotate so that top leans toward facing direction
      const s = Math.sin(ang), c = Math.cos(ang);
      const along = x * dx + z * dz;
      const na = along * c + y * s, ny = -along * s + y * c;
      x += (na - along) * dx; z += (na - along) * dz; y = ny;
      // shift toward wall and up
      x -= dx * 0.5; z -= dz * 0.5;
      y += 3.5 / 16;
      return [x + 0.5 + dx * (0.5 - 8 / 16 + 1 / 16 * 0), y, z + 0.5 + dz * 0];
    };
    void f;
  }
  const x0 = 7 / 16, x1 = 9 / 16, y1 = 10 / 16;
  const fl = 0;
  const S = (a) => a.map(pts);
  const uvS = [[7 / 16, 6 / 16], [7 / 16, 1], [9 / 16, 1], [9 / 16, 6 / 16]];
  quad(o, ri, rx, ry, rz, S([[x1, y1, x0], [x1, 0, x0], [x0, 0, x0], [x0, y1, x0]]), uvS, L, [0, 0, -127], 0xffffff, fl, b.mat, null, false);
  quad(o, ri, rx, ry, rz, S([[x0, y1, x1], [x0, 0, x1], [x1, 0, x1], [x1, y1, x1]]), uvS, L, [0, 0, 127], 0xffffff, fl, b.mat, null, false);
  quad(o, ri, rx, ry, rz, S([[x0, y1, x0], [x0, 0, x0], [x0, 0, x1], [x0, y1, x1]]), uvS, L, [-127, 0, 0], 0xffffff, fl, b.mat, null, false);
  quad(o, ri, rx, ry, rz, S([[x1, y1, x1], [x1, 0, x1], [x1, 0, x0], [x1, y1, x0]]), uvS, L, [127, 0, 0], 0xffffff, fl, b.mat, null, false);
  quad(o, ri, rx, ry, rz, S([[x0, y1, x0], [x0, y1, x1], [x1, y1, x1], [x1, y1, x0]]), [[7 / 16, 6 / 16], [7 / 16, 8 / 16], [9 / 16, 8 / 16], [9 / 16, 6 / 16]], L, [0, 127, 0], 0xffffff, fl, b.mat, null, false);
  quad(o, ri, rx, ry, rz, S([[x0, 0, x1], [x0, 0, x0], [x1, 0, x0], [x1, 0, x1]]), [[7 / 16, 13 / 16], [7 / 16, 15 / 16], [9 / 16, 15 / 16], [9 / 16, 13 / 16]], L, [0, -127, 0], 0xffffff, fl, b.mat, null, false);
}

function meshLantern(ri, rx, ry, rz, t, m, b) {
  const L = FACE_TEX[t * 6];
  const o = OUT[1];
  const hang = m & 1;
  const yo = hang ? 1 : 0;
  const mat = b.mat;
  // body 6x7x6 and cap 4x2x4 (vanilla template_lantern)
  const sideUV = [0, 2, 6, 9], topUV = [0, 9, 6, 15];
  box(o, ri, rx, ry, rz, 5, 0 + yo, 5, 11, 7 + yo, 11, [L, L, L, L, L, L], { cull: false, mat, uv: [topUV, topUV, sideUV, sideUV, sideUV, sideUV] });
  const capS = [1, 0, 5, 2], capT = [1, 10, 5, 14];
  box(o, ri, rx, ry, rz, 6, 7 + yo, 6, 10, 9 + yo, 10, [L, L, L, L, L, L], { cull: false, mat, uv: [capT, capT, capS, capS, capS, capS] });
  // handle: two crossed planes rotated 45 degrees
  const c = 0.5, r = 1.5 / 16 * Math.SQRT1_2 * 1.0;
  const hy0 = (9 + yo) / 16, hy1 = (hang ? 16 : 11) / 16;
  const huv = hang ? [[14 / 16, 1 / 16], [14 / 16, 5 / 16], [11 / 16, 5 / 16], [11 / 16, 1 / 16]] : [[14 / 16, 1 / 16], [14 / 16, 3 / 16], [11 / 16, 3 / 16], [11 / 16, 1 / 16]];
  const d = 1.5 / 16 * Math.SQRT1_2;
  quad(o, ri, rx, ry, rz, [[c - d, hy1, c - d], [c - d, hy0, c - d], [c + d, hy0, c + d], [c + d, hy1, c + d]], huv, L, [0, 0, 127], 0xffffff, 0, MAT.METAL, null, true);
  quad(o, ri, rx, ry, rz, [[c - d, hy1, c + d], [c - d, hy0, c + d], [c + d, hy0, c - d], [c + d, hy1, c - d]], huv, L, [127, 0, 0], 0xffffff, 0, MAT.METAL, null, true);
  void r;
}

function rotFacing(pts, f) {
  // pts defined for facing north (0); rotate to f around y
  const q = [0, 2, 3, 1][f];
  return pts.map(p => rotY(p, q));
}
function facingNormal(f) { return [[0, 0, -127], [0, 0, 127], [-127, 0, 0], [127, 0, 0]][f]; }

// rail shapes: 0 NS, 1 EW, 2 asc E, 3 asc W, 4 asc N, 5 asc S, 6 SE, 7 SW, 8 NW, 9 NE
function meshRail(ri, rx, ry, rz, t, m, b) {
  const shape = b.poweredRail ? (m & 7) : m;
  const powered = b.poweredRail && (m & 8);
  let L = FACE_TEX[t * 6];
  if (powered) L = tl('powered_rail_on');
  const o = OUT[1];
  const y = 1 / 16;
  let uv = [[0, 0], [0, 1], [1, 1], [1, 0]];
  let pts;
  if (shape >= 6) {
    L = tl('rail_corner');
    // corner texture connects south and east in vanilla (shape south_east)
    const q = { 6: 0, 7: 1, 8: 2, 9: 3 }[shape];
    pts = [[0, y, 0], [0, y, 1], [1, y, 1], [1, y, 0]];
    uv = uv.map((_, i) => uv[(i + 4 - q) & 3]);
  } else if (shape === 0) pts = [[0, y, 0], [0, y, 1], [1, y, 1], [1, y, 0]];
  else if (shape === 1) { pts = [[0, y, 0], [0, y, 1], [1, y, 1], [1, y, 0]]; uv = [uv[1], uv[2], uv[3], uv[0]]; }
  else {
    // ascending: high side gets +1
    const hi = { 2: 'E', 3: 'W', 4: 'N', 5: 'S' }[shape];
    const h = (x, z) => y + ((hi === 'E' && x) || (hi === 'W' && !x) || (hi === 'N' && !z) || (hi === 'S' && z) ? 1 : 0);
    pts = [[0, h(0, 0), 0], [0, h(0, 1), 1], [1, h(1, 1), 1], [1, h(1, 0), 0]];
    if (hi === 'E' || hi === 'W') uv = [uv[1], uv[2], uv[3], uv[0]];
  }
  quad(o, ri, rx, ry, rz, pts, uv, L, [0, 127, 0], 0xffffff, 0, MAT.METAL, null, true);
}

function meshDoor(ri, rx, ry, rz, t, m, b) {
  const upper = m & 8, open = m & 4, f = m & 3;
  const L = upper ? TOP_TEX[t] : FACE_TEX[t * 6];
  // closed door: thin slab on the side opposite to facing (facing = direction player looked when placing)
  const ff = open ? [3, 2, 0, 1][f] : f;
  const bx = [[0, 0, 13, 16, 16, 16], [0, 0, 0, 16, 16, 3], [13, 0, 0, 16, 16, 16], [0, 0, 0, 3, 16, 16]][ff];
  const edge = [0, 0, 3, 16];
  const tx = [L, L, L, L, L, L];
  const uvs = [edge, edge, null, null, null, null];
  if (ff < 2) { uvs[4] = [0, 0, 3, 16]; uvs[5] = [0, 0, 3, 16]; } else { uvs[2] = [0, 0, 3, 16]; uvs[3] = [0, 0, 3, 16]; }
  box(OUT[1], ri, rx, ry, rz, ...bx, tx, { cull: false, uv: uvs });
}

void L_SOLID; void L_CUTOUT; void L_TRANSLUCENT; void T_LIGHT; void BIOME_OFF; void HEIGHTMAP_OFF;

// Mesh one block in isolation (fully lit) — used for inventory icons, held blocks and falling blocks.
// Returns {data: ArrayBuffer of vertices (positions relative to the block's min corner in 1/16 units), count}
let singleInit = false;
export function meshSingle(v, opts = {}) {
  const X = 24, Y = 200, Z = 24;
  const ri = (Y * RW + Z) * RW + X;
  if (!singleInit) { R.fill(0); singleInit = true; }
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
    const i = ri + dy * PLANE + dz * RW + dx;
    R[i] = 0; SKY[i] = 15; BLK[i] = 0;
  }
  R[ri] = v;
  const b = BLOCKS[v & TYPE_MASK];
  if (b.model === 'double_plant' || b.model === 'door') R[ri + PLANE] = v | (8 << META_SHIFT) | (b.model === 'double_plant' ? (1 << META_SHIFT) : 0);
  for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
    const g = opts.grass ?? 0x91bd59, f = opts.foliage ?? 0x77ab2f, w = opts.water ?? 0x3f76e4;
    colGrass[z * 16 + x] = g; colFoliage[z * 16 + x] = f; colWater[z * 16 + x] = w;
  }
  for (const o of OUT) o.reset();
  setOrigin(0, 0);
  // meshBlock expects center-chunk coords (16..31); shift so block lands at local (8, 8)
  meshBlock(ri, X, Y, Z, v);
  if (b.model === 'double_plant' && opts.both) meshBlock(ri + PLANE, X, Y + 1, Z, R[ri + PLANE]);
  const parts = OUT.map(o => o.ub.slice(0, o.n * 24));
  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  // rebase positions: x,z were (X-16)*16 = 128, y = Y*16
  const s = new Int16Array(out.buffer);
  for (let i = 0; i < total / 24; i++) { s[i * 12] -= (X - 16) * 16; s[i * 12 + 1] -= Y * 16; s[i * 12 + 2] -= (Z - 16) * 16; }
  R[ri] = 0; R[ri + PLANE] = 0;
  return { data: out.buffer, count: total / 24, layers: OUT.map(o => o.n) };
}
export function setOrigin(cx, cz) { cx0 = cx * 16 - 16; cz0 = cz * 16 - 16; }
