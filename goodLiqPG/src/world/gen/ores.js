// Ore & stone-blob features with vanilla 1.18+ height distributions (OreFeature port).
// Blobs from the 3x3 chunk neighbourhood are replayed so that every chunk places exactly its own part.
import { ID } from '../blocks.js';
import { Rand, mix, posRandom } from './rng.js';
import { B } from './biomes.js';

const STONE_T = new Uint8Array(4096), DEEP_T = new Uint8Array(4096), NATURAL = new Uint8Array(4096);
for (const n of ['stone', 'granite', 'diorite', 'andesite']) { STONE_T[ID[n]] = 1; NATURAL[ID[n]] = 1; }
for (const n of ['deepslate', 'tuff']) { DEEP_T[ID[n]] = 1; NATURAL[ID[n]] = 1; }

const MOUNTAIN = new Uint8Array(64);
for (const n of ['windswept_hills', 'windswept_gravelly_hills', 'windswept_forest', 'meadow', 'cherry_grove', 'grove', 'snowy_slopes',
  'frozen_peaks', 'jagged_peaks', 'stony_peaks']) MOUNTAIN[B[n]] = 1;
const BADLANDS = new Uint8Array(64);
for (const n of ['badlands', 'eroded_badlands', 'wooded_badlands']) BADLANDS[B[n]] = 1;

// kind: 0 = ore (stone/deepslate variants), 1 = blob replacing any natural stone
// dist: 'u' uniform [a, b] | 't' triangle [a, b]
const O = (stone, deep, size, count, dist, a, b, discard = 0, extra = {}) => ({ stone: ID[stone], deep: deep ? ID[deep] : ID[stone], size, count, dist, a, b, discard, kind: deep ? 0 : 1, ...extra });
const ORES = [
  O('dirt', null, 33, 7, 'u', 0, 160),
  O('gravel', null, 33, 14, 'u', -64, 320),
  O('granite', null, 64, 1, 'u', 64, 128, 0, { rarity: 6 }),
  O('granite', null, 64, 2, 'u', 0, 60),
  O('diorite', null, 64, 1, 'u', 64, 128, 0, { rarity: 6 }),
  O('diorite', null, 64, 2, 'u', 0, 60),
  O('andesite', null, 64, 1, 'u', 64, 128, 0, { rarity: 6 }),
  O('andesite', null, 64, 2, 'u', 0, 60),
  O('tuff', null, 64, 2, 'u', -64, 0),
  O('coal_ore', 'deepslate_coal_ore', 17, 30, 'u', 136, 320),
  O('coal_ore', 'deepslate_coal_ore', 17, 20, 't', 0, 192, 0.5),
  O('iron_ore', 'deepslate_iron_ore', 9, 90, 't', 80, 384),
  O('iron_ore', 'deepslate_iron_ore', 9, 10, 't', -24, 56),
  O('iron_ore', 'deepslate_iron_ore', 4, 10, 'u', -64, 72),
  O('gold_ore', 'deepslate_gold_ore', 9, 4, 't', -64, 32, 0.5),
  O('gold_ore', 'deepslate_gold_ore', 9, 1, 'u', -64, -48, 0.5, { countRand: true }),
  O('gold_ore', 'deepslate_gold_ore', 9, 50, 'u', 32, 256, 0, { biome: BADLANDS }),
  O('redstone_ore', 'deepslate_redstone_ore', 8, 4, 'u', -64, 15),
  O('redstone_ore', 'deepslate_redstone_ore', 8, 8, 't', -96, -32),
  O('diamond_ore', 'deepslate_diamond_ore', 4, 7, 't', -144, 16, 0.5),
  O('diamond_ore', 'deepslate_diamond_ore', 12, 1, 't', -144, 16, 0.7, { rarity: 9 }),
  O('diamond_ore', 'deepslate_diamond_ore', 8, 4, 't', -144, 16, 1.0),
  O('lapis_ore', 'deepslate_lapis_ore', 7, 2, 't', -32, 32),
  O('lapis_ore', 'deepslate_lapis_ore', 7, 4, 'u', -64, 64, 1.0),
  O('copper_ore', 'deepslate_copper_ore', 10, 16, 't', -16, 112),
  O('emerald_ore', 'deepslate_emerald_ore', 3, 100, 't', -16, 480, 0, { biome: MOUNTAIN }),
];

export class Ores {
  constructor(seed) {
    this.seed = seed;
    this.rng = new Rand(0);
    this.mark = new Int32Array(16 * 16 * 384);
    this.blobId = 0;
    this.sph = new Float64Array(64 * 4);
    this.nbBiome = new Uint8Array(9);
  }

  place(gen, cx, cz, blocks) {
    const rng = this.rng;
    let maxY = -64;
    for (let i = 0; i < 256; i++) if (gen.topAll[i] > maxY) maxY = gen.topAll[i];
    // biome of each neighbour chunk's centre (for biome-filtered ores)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      this.nbBiome[(dz + 1) * 3 + dx + 1] = gen.quartBiome((cx + dx) * 4 + 2, (cz + dz) * 4 + 2);
    }
    const x0 = cx * 16, z0 = cz * 16;
    for (let f = 0; f < ORES.length; f++) {
      const o = ORES[f];
      const bound = o.size / 8 + o.size / 16 + 3;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (o.biome && !o.biome[this.nbBiome[(dz + 1) * 3 + dx + 1]]) continue;
        const sx = cx + dx, sz = cz + dz;
        const base = mix(mix(mix(this.seed, sx), sz), f);
        let count = o.count;
        rng.setSeed(base);
        if (o.rarity && rng.nextInt(o.rarity) !== 0) continue;
        if (o.countRand) count = rng.nextInt(2);
        for (let a = 0; a < count; a++) {
          rng.setSeed(mix(base, a + 1));
          const x = sx * 16 + rng.nextInt(16), z = sz * 16 + rng.nextInt(16);
          const y = o.dist === 'u' ? rng.between(o.a, o.b - 1) : rng.triangleInt(o.a, o.b);
          if (y < -64 || y >= 320) continue;
          if (x + bound < x0 || x - bound > x0 + 15 || z + bound < z0 || z - bound > z0 + 15) continue;
          if (y - bound > maxY) continue;
          this.blob(rng, o, x, y, z, blocks, x0, z0, base + a);
        }
      }
    }
  }

  blob(rng, o, x, y, z, blocks, x0, z0, hseed) {
    const size = o.size, sph = this.sph;
    const f = rng.nextFloat() * Math.PI;
    const g = size / 8;
    const d = x + Math.sin(f) * g, e = x - Math.sin(f) * g;
    const h = z + Math.cos(f) * g, j = z - Math.cos(f) * g;
    const l = y + rng.nextInt(3) - 2, m = y + rng.nextInt(3) - 2;
    for (let p = 0; p < size; p++) {
      const t = p / size;
      const cx = d + t * (e - d), cy = l + t * (m - l), cz = h + t * (j - h);
      const tt = rng.nextDouble() * size / 16;
      const u = ((Math.sin(Math.PI * t) + 1) * tt + 1) / 2;
      sph[p * 4] = cx; sph[p * 4 + 1] = cy; sph[p * 4 + 2] = cz; sph[p * 4 + 3] = u;
    }
    for (let p = 0; p < size - 1; p++) {
      if (sph[p * 4 + 3] <= 0) continue;
      for (let v = p + 1; v < size; v++) {
        if (sph[v * 4 + 3] <= 0) continue;
        const a = sph[p * 4] - sph[v * 4], b = sph[p * 4 + 1] - sph[v * 4 + 1], c = sph[p * 4 + 2] - sph[v * 4 + 2], dd = sph[p * 4 + 3] - sph[v * 4 + 3];
        if (dd * dd > a * a + b * b + c * c) { if (dd > 0) sph[v * 4 + 3] = -1; else sph[p * 4 + 3] = -1; }
      }
    }
    const id = ++this.blobId, mark = this.mark;
    const stoneB = o.stone, deepB = o.deep, kind = o.kind, discard = o.discard;
    for (let p = 0; p < size; p++) {
      const u = sph[p * 4 + 3];
      if (u <= 0) continue;
      const cx = sph[p * 4], cy = sph[p * 4 + 1], cz = sph[p * 4 + 2];
      const xa = Math.max(Math.floor(cx - u), x0), xb = Math.min(Math.floor(cx + u), x0 + 15);
      const za = Math.max(Math.floor(cz - u), z0), zb = Math.min(Math.floor(cz + u), z0 + 15);
      const ya = Math.max(Math.floor(cy - u), -64), yb = Math.min(Math.floor(cy + u), 319);
      if (xa > xb || za > zb || ya > yb) continue;
      const iu = 1 / u;
      for (let bx = xa; bx <= xb; bx++) {
        const ddx = (bx + 0.5 - cx) * iu, dx2 = ddx * ddx;
        if (dx2 >= 1) continue;
        for (let by = ya; by <= yb; by++) {
          const ddy = (by + 0.5 - cy) * iu, dxy = dx2 + ddy * ddy;
          if (dxy >= 1) continue;
          for (let bz = za; bz <= zb; bz++) {
            const ddz = (bz + 0.5 - cz) * iu;
            if (dxy + ddz * ddz >= 1) continue;
            const lx = bx - x0, lz = bz - z0;
            const i = ((by + 64) * 16 + lz) * 16 + lx;
            if (mark[i] === id) continue;
            mark[i] = id;
            const cur = blocks[i];
            let nb;
            if (kind === 1) { if (!NATURAL[cur]) continue; nb = stoneB; }
            else if (STONE_T[cur]) nb = stoneB;
            else if (DEEP_T[cur]) nb = deepB;
            else continue;
            if (discard > 0 && (discard >= 1 || posRandom(hseed, bx, by, bz) < discard) && this.exposed(blocks, lx, by, lz, i)) continue;
            blocks[i] = nb;
          }
        }
      }
    }
  }

  exposed(blocks, lx, y, lz, i) {
    if (lx > 0 && blocks[i - 1] === 0) return true;
    if (lx < 15 && blocks[i + 1] === 0) return true;
    if (lz > 0 && blocks[i - 16] === 0) return true;
    if (lz < 15 && blocks[i + 16] === 0) return true;
    if (y > -64 && blocks[i - 256] === 0) return true;
    if (y < 319 && blocks[i + 256] === 0) return true;
    return false;
  }
}
