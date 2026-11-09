/* gode/vendor/old/voxelcraft.js —— VoxelCraft.html（仓库根）的地形生成，抽副本：Simplex / fbm / 高度函数 / 逐块生成 / 树 的逻辑逐行照搬
   （源行：常量 300–302、小工具 316–334、Simplex+fbm 339–402、B 表 659–661、生成 1096–1190）。
   改动只有：加 export；去掉 Chunk / chunks / edits（只写调用者给的 blocks）；地表选择抽成 surface()（逐块与 sample 共用，并多回一个 biome）；
   knobs（P，默认值使输出与原版逐位相同：乘子 1、偏移 0）；种子由调用者传入。
   原生布局：u8 id，(x*16+z)*CH + y，CH = 96，海平面 40，无 meta、无群系（biome 是适配器按地表加的）、无跨块写入（树只种在 x,z ∈ 2..13，树冠半径 2，全在块内）。 */
export const CS = 16;              // chunk width (x/z)
export const CH = 96;              // world height
export const SEA = 40;             // sea level
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashInts(a, b, c) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

const GRAD3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
class Simplex {
  constructor(seed) {
    const rng = mulberry32(seed), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    this.perm = new Uint8Array(512); this.pm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { this.perm[i] = p[i & 255]; this.pm[i] = this.perm[i] % 12; }
  }
  n2(xin, yin) {
    const perm = this.perm, pm = this.pm, G = GRAD3;
    const F2 = 0.3660254037844386, G2 = 0.21132486540518713;
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = pm[ii + perm[jj]] * 3; t0 *= t0; n += t0 * t0 * (G[g] * x0 + G[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n += t1 * t1 * (G[g] * x1 + G[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = pm[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n += t2 * t2 * (G[g] * x2 + G[g + 1] * y2); }
    return 70 * n;
  }
  n3(xin, yin, zin) {
    const perm = this.perm, pm = this.pm, G = GRAD3;
    const F3 = 1 / 3, G3 = 1 / 6;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) { const g = pm[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n += t0 * t0 * (G[g] * x0 + G[g + 1] * y0 + G[g + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) { const g = pm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n += t1 * t1 * (G[g] * x1 + G[g + 1] * y1 + G[g + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) { const g = pm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n += t2 * t2 * (G[g] * x2 + G[g + 1] * y2 + G[g + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) { const g = pm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n += t3 * t3 * (G[g] * x3 + G[g + 1] * y3 + G[g + 2] * z3); }
    return 32 * n;
  }
}
function fbm(n, x, z, oct) {
  let s = 0, a = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += n.n2(x * f, z * f) * a; norm += a; a *= 0.5; f *= 2; }
  return s / norm;
}

export const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, LOG: 5, LEAVES: 6, PLANKS: 7, SAND: 8, WATER: 9,
  COAL_ORE: 10, IRON_ORE: 11, GOLD_ORE: 12, DIAMOND_ORE: 13, BEDROCK: 14, GLASS: 15, TABLE: 16, FURNACE: 17,
  TORCH: 18, TALL_GRASS: 19, POPPY: 20, DANDELION: 21, SNOW: 22, STONE_BRICKS: 23, TNT: 24, GOLD_BLOCK: 25 };

let SEED = 0, nT, nD, nC1, nC2, nM;
// knobs（s02 §2.1 / s13 §7）：默认值使输出与原版逐位相同
export const PARAMS = [
  { k: 'terrain.contScale', def: 1, min: 0.25, max: 4, note: '大陆与山地遮罩尺度（> 1 = 更大）' },
  { k: 'terrain.shift', def: 0, min: -30, max: 30, note: '整体抬升 / 下沉（格）' },
  { k: 'terrain.hillAmp', def: 1, min: 0, max: 3, note: '丘陵振幅乘子' },
  { k: 'terrain.mountAmp', def: 1, min: 0, max: 3, note: '山脊 / 山地振幅乘子' },
  { k: 'cave.rate', def: 1, min: 0, max: 3, note: '洞穴（蠕虫隧道 + 大洞）占比乘子，0 = 无洞' },
  { k: 'ore.mul', def: 1, min: 0, max: 5, note: '矿脉数乘子' },
  { k: 'tree.dens', def: 1, min: 0, max: 4, note: '树密度乘子' },
  { k: 'plant.dens', def: 1, min: 0, max: 4, note: '草 / 花密度乘子' },
];
export const P = Object.fromEntries(PARAMS.map(p => [p.k, p.def]));
export const setParams = (flat) => Object.assign(P, flat);
export function initNoise(seed) { SEED = seed; nT = new Simplex(seed); nD = new Simplex(seed + 1); nC1 = new Simplex(seed + 2); nC2 = new Simplex(seed + 3); nM = new Simplex(seed + 4); }
export function heightAt(wx, wz) {
  const cont = fbm(nT, wx * (0.0028 / P['terrain.contScale']), wz * (0.0028 / P['terrain.contScale']), 4);
  const hills = fbm(nD, wx * 0.011, wz * 0.011, 4);
  const mmask = smoothstep(0.05, 0.4, fbm(nM, wx * (0.0022 / P['terrain.contScale']) + 91.7, wz * (0.0022 / P['terrain.contScale']) - 37.1, 3));
  const ridge = 1 - Math.abs(nD.n2(wx * 0.007 + 300.5, wz * 0.007 - 120.2));
  let h = 43 + P['terrain.shift'] + cont * 16 + hills * 6 * P['terrain.hillAmp'] * (0.6 + mmask) + mmask * (ridge * ridge * 26 + 4) * P['terrain.mountAmp'];
  if (h > 64) h = 64 + (h - 64) * 0.6;
  return clamp(Math.floor(h), 4, CH - 20);
}
// 树密度（原 generateChunk 里的表达式，逐块种树与 surface 的 forest 判定共用）
const treeDens = (wx, wz) => 0.003 + 0.05 * clamp(fbm(nM, wx * 0.01 + 200, wz * 0.01 - 300, 2) * 1.8 + 0.15, 0, 1);
// 地表选择（原 generateChunk 内逐行搬出）+ biome（VoxelCraft 没有群系，这里按地表分类，只给 pgviz 着色 / 统计）
export const BIOMES = ['ocean', 'beach', 'plains', 'forest', 'stony_peaks', 'snowy_slopes'];
export function surface(h, slope, wx, wz) {
  const snowLine = 67 + Math.floor(nM.n2(wx * 0.05, wz * 0.05) * 3);
  let top = B.GRASS, filler = B.DIRT, depth = 3, biome = treeDens(wx, wz) > 0.02 ? 3 : 2;
  if (h >= snowLine) { top = B.SNOW; filler = B.STONE; depth = 1; biome = 5; }
  else if (slope >= 4 && h > SEA + 5) { top = B.STONE; filler = B.STONE; biome = 4; }
  else if (h <= SEA + 1) { top = B.SAND; filler = B.SAND; depth = 4; biome = h < SEA ? 0 : 1; }
  return { top, filler, depth, biome };
}
const hmap = new Int16Array(18 * 18);
// blocks：Uint8Array(16*16*CH)，(x*16+z)*CH+y；biomes：Uint8Array(256)，x*16+z
export function generateChunk(cx, cz, blocks, biomes) {
  const ox = cx * CS, oz = cz * CS;
  for (let x = -1; x <= CS; x++) for (let z = -1; z <= CS; z++) hmap[(x + 1) * 18 + z + 1] = heightAt(ox + x, oz + z);
  const rng = mulberry32(hashInts(cx, cz, SEED));
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const wx = ox + x, wz = oz + z, h = hmap[(x + 1) * 18 + z + 1];
    const slope = Math.max(Math.abs(hmap[(x + 2) * 18 + z + 1] - hmap[x * 18 + z + 1]), Math.abs(hmap[(x + 1) * 18 + z + 2] - hmap[(x + 1) * 18 + z]));
    const base = (x * CS + z) * CH;
    const { top, filler, depth, biome } = surface(h, slope, wx, wz);
    biomes[x * CS + z] = biome;
    blocks[base] = B.BEDROCK;
    for (let y = 1; y <= h; y++) {
      let id = y === h ? top : y > h - 1 - depth ? filler : B.STONE;
      if (y <= 2 && rng() < (y === 1 ? 0.6 : 0.3)) id = B.BEDROCK;
      blocks[base + y] = id;
    }
    for (let y = h + 1; y <= SEA; y++) blocks[base + y] = B.WATER;
    // caves: noodle tunnels + occasional caverns
    const caveTop = h <= SEA + 2 ? h - 5 : h, cavern = P['cave.rate'] === 1 ? 0.64 : P['cave.rate'] <= 0 ? 9 : 1 - 0.36 / P['cave.rate'];
    const fx = wx * 0.045, fz = wz * 0.045;
    for (let y = 3; y <= caveTop; y++) {
      const fy = y * 0.075;
      const a = nC1.n3(fx, fy, fz), b = nC2.n3(fx, fy + 17.3, fz);
      let carve = a * a + b * b < 0.0045 * P['cave.rate'];
      if (!carve && y < h - 8) carve = nC2.n3(wx * 0.022 + 50, y * 0.045, wz * 0.022 - 50) > cavern;
      if (carve && blocks[base + y] !== B.BEDROCK) blocks[base + y] = B.AIR;
    }
  }
  // ores
  const vein = (id, count, minY, maxY, size) => {
    for (let i = 0; i < count; i++) {
      let x = rng() * 16 | 0, y = minY + (rng() * (maxY - minY) | 0), z = rng() * 16 | 0;
      for (let k = 0; k < size; k++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CH) { const idx = (x * CS + z) * CH + y; if (blocks[idx] === B.STONE) blocks[idx] = id; }
        const d = rng() * 6 | 0;
        if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++; else if (d === 3) y--; else if (d === 4) z++; else z--;
      }
    }
  };
  const om = P['ore.mul'];
  vein(B.COAL_ORE, Math.round(18 * om), 5, 76, 9); vein(B.IRON_ORE, Math.round(12 * om), 4, 56, 6); vein(B.GOLD_ORE, Math.round(3 * om), 4, 30, 5); vein(B.DIAMOND_ORE, Math.round(2 * om), 4, 16, 4);
  // trees
  const trees = [];
  for (let x = 2; x < 14; x++) for (let z = 2; z < 14; z++) {
    const h = hmap[(x + 1) * 18 + z + 1], base = (x * CS + z) * CH;
    if (blocks[base + h] !== B.GRASS || blocks[base + h + 1] !== B.AIR) continue;
    const dens = treeDens(ox + x, oz + z) * P['tree.dens'];
    if (rng() > dens) continue;
    if (trees.some(t => Math.abs(t[0] - x) < 3 && Math.abs(t[1] - z) < 3)) continue;
    trees.push([x, z]); placeTree(blocks, x, h + 1, z, rng);
  }
  // plants
  for (let x = 0; x < CS; x++) for (let z = 0; z < CS; z++) {
    const h = hmap[(x + 1) * 18 + z + 1], base = (x * CS + z) * CH;
    if (blocks[base + h] !== B.GRASS || blocks[base + h + 1] !== B.AIR) continue;
    const r = rng() / P['plant.dens'];
    if (r < 0.1) blocks[base + h + 1] = B.TALL_GRASS;
    else if (r < 0.107) blocks[base + h + 1] = B.POPPY;
    else if (r < 0.114) blocks[base + h + 1] = B.DANDELION;
  }
}
function placeTree(blocks, x, y, z, rng) {
  const th = 4 + (rng() * 3 | 0);
  const set = (bx, by, bz, id, force) => {
    if (bx < 0 || bx >= 16 || bz < 0 || bz >= 16 || by <= 0 || by >= CH - 1) return;
    const i = (bx * CS + bz) * CH + by; if (force || blocks[i] === B.AIR) blocks[i] = id;
  };
  for (let ly = th - 3; ly <= th; ly++) {
    const r = ly >= th - 1 ? 1 : 2;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (ly === th || rng() < 0.45)) continue;
      set(x + dx, y + ly, z + dz, B.LEAVES);
    }
  }
  for (let i = 0; i < th; i++) set(x, y + i, z, B.LOG, true);
  blocks[(x * CS + z) * CH + y - 1] = B.DIRT;
}
