// Surface decoration: trees (per-biome counts like vanilla placed features), vegetation, water plants, disks,
// ice spikes, boulders. Trees start inside the chunk; leaves/branches that leave the chunk go to `outside`.
// Small vegetation uses world-space "virtual patches" (hash grid), so it is seamless and order-independent.
import { ID, mk, T_REPLACEABLE, T_FLUID, T_SOLID, TYPE_MASK } from '../blocks.js';
import { Rand, mix, fmix32, posRandom, hashString } from './rng.js';
import { makeNoise } from './noise.js';
import { B, BIOMES, IS_OCEAN, IS_RIVER } from './biomes.js';
import * as T from './trees.js';

const AIR = 0, WATER = ID.water, GRASS = ID.grass_block, DIRT = ID.dirt, SAND = ID.sand;
const LEAF_SET = new Uint8Array(4096);
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry']) LEAF_SET[ID[w + '_leaves']] = 1;
const GROUND = new Uint8Array(4096);
for (const n of ['grass_block', 'dirt', 'podzol', 'coarse_dirt']) GROUND[ID[n]] = 1;
const PLANT_GROUND = new Uint8Array(4096);
for (const n of ['grass_block', 'dirt', 'podzol', 'coarse_dirt']) PLANT_GROUND[ID[n]] = 1;
const LOG_SET = new Uint8Array(4096);
for (const w of ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'cherry']) LOG_SET[ID[w + '_log']] = 1;

// ---- feature placement context -------------------------------------------------------------------------------
class Ctx {
  constructor() { this.blocks = null; this.x0 = 0; this.z0 = 0; this.out = new Map(); }
  reset(blocks, x0, z0) { this.blocks = blocks; this.x0 = x0; this.z0 = z0; this.out.clear(); }
  idx(x, y, z) {
    const lx = x - this.x0, lz = z - this.z0;
    if ((lx | lz) & ~15 || y < -64 || y > 319) return -1;
    return ((y + 64) * 16 + lz) * 16 + lx;
  }
  get(x, y, z) { const i = this.idx(x, y, z); return i < 0 ? -1 : this.blocks[i]; }
  inChunk(x, z) { return !(((x - this.x0) | (z - this.z0)) & ~15); }
  push(x, y, z, v, override) {
    if (y < -64 || y > 319) return;
    const k = ((x - this.x0 + 64) * 256 + (z - this.z0 + 64)) * 512 + (y + 64);
    if (!override && this.out.has(k)) return;
    this.out.set(k, v);
  }
  free(v) { const t = v & TYPE_MASK; return v === 0 || (T_REPLACEABLE[t] && !T_FLUID[t]); }
  log(x, y, z, v) {
    const i = this.idx(x, y, z);
    if (i < 0) { if (!this.inChunk(x, z)) { this.push(x, y, z, v, true); return true; } return false; }
    const c = this.blocks[i], t = c & TYPE_MASK;
    if (this.free(c) || LEAF_SET[t] || t === WATER || t === ID.vine) { this.blocks[i] = v; return true; }
    return false;
  }
  leaf(x, y, z, v) {
    const i = this.idx(x, y, z);
    if (i < 0) { if (!this.inChunk(x, z)) { this.push(x, y, z, v, false); return true; } return false; }
    if (this.free(this.blocks[i])) { this.blocks[i] = v; return true; }
    return false;
  }
  vine(x, y, z, meta) {
    const i = this.idx(x, y, z);
    if (i < 0) { if (!this.inChunk(x, z)) this.push(x, y, z, mk(ID.vine, meta), false); return; }
    if (this.blocks[i] === 0) this.blocks[i] = mk(ID.vine, meta);
  }
  isLeaf(x, y, z) { const v = this.get(x, y, z); return v > 0 && LEAF_SET[v & TYPE_MASK] === 1; }
  isAir(x, y, z) { const v = this.get(x, y, z); return v === 0; }
  treeSpace(x, y, z) {
    const v = this.get(x, y, z);
    if (v === -1) return this.inChunk(x, z) ? false : true;
    return this.free(v) || LEAF_SET[v & TYPE_MASK] === 1;
  }
  // Trunk cells must be inside the chunk and free; plus vanilla's feature-size clearance:
  // within radius (i < limit ? lowR : upR) around the trunk, no solid blocks / logs up to the tree height.
  trunkFree(x, y, z, h, size, water, limit = 1, lowR = 0, upR = 1) {
    for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) {
      if (!this.inChunk(x + a, z + b)) return false;
      for (let i = 0; i < h; i++) {
        const v = this.get(x + a, y + i, z + b);
        if (v === -1) return false;
        const t = v & TYPE_MASK;
        if (!(this.free(v) || LEAF_SET[t] || (water && t === WATER && i < 3))) return false;
      }
    }
    for (let i = 1; i <= h; i++) {
      const r = i < limit ? lowR : upR;
      if (r === 0) continue;
      for (let dx = -r; dx <= r + size - 1; dx++) for (let dz = -r; dz <= r + size - 1; dz++) {
        const v = this.get(x + dx, y + i, z + dz);
        if (v <= 0) continue;           // air or outside the chunk
        const t = v & TYPE_MASK;
        if (this.free(v) || LEAF_SET[t] || t === ID.vine || (water && t === WATER)) continue;
        return false;
      }
    }
    return true;
  }
  groundAt(x, y, z) { const v = this.get(x, y, z); return v > 0 && GROUND[v & TYPE_MASK] === 1; }
  setGround(x, y, z, v) {
    const i = this.idx(x, y, z); if (i < 0) return;
    this.blocks[i] = v;
    const a = i + 256; // remove plants above podzol etc. stay as is
    if (a < this.blocks.length && this.blocks[a] === ID.snow) this.blocks[a] = 0;
  }
  dirt(x, y, z) { const i = this.idx(x, y, z); if (i >= 0 && (this.blocks[i] === GRASS || this.blocks[i] === ID.snow_block)) this.blocks[i] = DIRT; }
  setInChunk(x, y, z, v) { const i = this.idx(x, y, z); if (i >= 0) this.blocks[i] = v; }
  spike(x, y, z) {
    const i = this.idx(x, y, z);
    if (i < 0) { if (!this.inChunk(x, z)) this.push(x, y, z, ID.packed_ice, true); return; }
    const t = this.blocks[i] & TYPE_MASK;
    if (this.free(this.blocks[i]) || t === DIRT || t === GRASS || t === ID.snow_block || t === ID.ice) this.blocks[i] = ID.packed_ice;
  }
  spikeDown(x, y, z) {
    const i = this.idx(x, y, z);
    if (i < 0) return false;
    const t = this.blocks[i] & TYPE_MASK;
    if (this.free(this.blocks[i]) || t === DIRT || t === GRASS || t === ID.snow_block || t === ID.ice || t === ID.packed_ice) { this.blocks[i] = ID.packed_ice; return true; }
    return false;
  }
  // snow layers on top of spilled leaves where it is freezing (the target chunk's freeze pass ran already)
  snowSpill(gen) {
    const tops = new Map();
    for (const [k, v] of this.out) {
      if (!LEAF_SET[v & TYPE_MASK]) continue;
      const col = Math.floor(k / 512), y = (k % 512) - 64;
      const t = tops.get(col);
      if (t === undefined || y > t) tops.set(col, y);
    }
    for (const [col, y] of tops) {
      const z = (col % 256) - 64 + this.z0, x = Math.floor(col / 256) - 64 + this.x0;
      const above = col * 512 + (y + 1 + 64);
      if (this.out.has(above)) continue;
      // biome of the nearest in-chunk column
      const lx = Math.min(15, Math.max(0, x - this.x0)), lz = Math.min(15, Math.max(0, z - this.z0));
      const b = gen.biomeCol[lz * 16 + lx];
      if (BIOMES[b].temperature >= 0.15 && y < 80) continue;
      if (gen.temperatureAt(b, x, y + 1, z) < 0.15) this.out.set(above, ID.snow);
    }
  }
  flush(outArr) {
    for (const [k, v] of this.out) {
      const y = (k % 512) - 64, r = Math.floor(k / 512);
      const z = (r % 256) - 64 + this.z0, x = Math.floor(r / 256) - 64 + this.x0;
      outArr.push(x, y, z, v);
    }
  }
}

// ---- per-biome tree configuration (vanilla placed-feature counts) ---------------------------------------
const megaSpruce = (c, r, x, y, z) => T.megaSpruce(c, r, x, y, z, false);
const megaPine = (c, r, x, y, z) => T.megaSpruce(c, r, x, y, z, true);
// [count, extraChance, extraCount, [[tree, chance], ...], default]
const TREES = [];
const setTrees = (names, cfg) => { for (const n of names) TREES[B[n]] = cfg; };
setTrees(['plains', 'sunflower_plains'], [0, 0.05, 1, [[T.fancyOak, 0.33333334]], T.oak]);
setTrees(['forest'], [10, 0.1, 1, [[T.birch, 0.2], [T.fancyOak, 0.1]], T.oak]);
setTrees(['flower_forest'], [6, 0.1, 1, [[T.birch, 0.2], [T.fancyOak, 0.1]], T.oak]);
setTrees(['birch_forest'], [10, 0.1, 1, [], T.birch]);
setTrees(['old_growth_birch_forest'], [10, 0.1, 1, [], T.superBirch]);
setTrees(['dark_forest'], [16, 0, 0, [[T.darkOak, 0.6666667], [T.birch, 0.2], [T.fancyOak, 0.1]], T.oak]);
setTrees(['taiga', 'snowy_taiga'], [10, 0.1, 1, [[T.pine, 0.33333334]], T.spruce]);
setTrees(['old_growth_pine_taiga'], [10, 0.1, 1, [[megaSpruce, 0.025641026], [megaPine, 0.30769232], [T.pine, 0.33333334]], T.spruce]);
setTrees(['old_growth_spruce_taiga'], [10, 0.1, 1, [[megaSpruce, 0.33333334], [T.pine, 0.33333334]], T.spruce]);
setTrees(['snowy_plains'], [0, 0.1, 1, [], T.spruce]);
setTrees(['jungle'], [50, 0.1, 1, [[T.fancyOak, 0.1], [T.jungleBush, 0.5], [T.megaJungle, 0.33333334]], T.jungleTree]);
setTrees(['sparse_jungle'], [2, 0.1, 1, [[T.fancyOak, 0.1], [T.jungleBush, 0.5]], T.jungleTree]);
setTrees(['savanna', 'savanna_plateau'], [1, 0.1, 2, [[T.acacia, 0.8]], T.oak]);
setTrees(['windswept_savanna'], [2, 0.1, 2, [[T.acacia, 0.8]], T.oak]);
setTrees(['windswept_hills', 'windswept_gravelly_hills'], [0, 0.1, 1, [[T.spruce, 0.666], [T.fancyOak, 0.1]], T.oak]);
setTrees(['windswept_forest'], [3, 0.1, 1, [[T.spruce, 0.666], [T.fancyOak, 0.1]], T.oak]);
setTrees(['meadow'], [0, 0.03, 1, [[T.fancyOak, 0.5]], T.superBirch]);
setTrees(['cherry_grove'], [10, 0.1, 1, [], T.cherry]);
setTrees(['grove'], [10, 0.1, 1, [[T.pine, 0.33333334]], T.spruce]);
setTrees(['swamp'], [2, 0.1, 1, [], T.swampOak]);
setTrees(['wooded_badlands'], [5, 0.1, 1, [], T.oak]);

// ---- vegetation density per biome: [shortGrass, tallGrass, fern, largeFern] ------------------------------
const GRASSD = [];
const setGrass = (names, v) => { for (const n of names) GRASSD[B[n]] = v; };
setGrass(['plains', 'sunflower_plains'], [0.38, 0.004, 0, 0, 1]);
setGrass(['forest', 'birch_forest', 'old_growth_birch_forest'], [0.07, 0.004, 0, 0]);
setGrass(['flower_forest'], [0.05, 0.004, 0, 0]);
setGrass(['dark_forest'], [0.065, 0.004, 0, 0]);
setGrass(['taiga'], [0.04, 0, 0.15, 0.015]);
setGrass(['snowy_taiga'], [0.01, 0, 0.05, 0.005]);
setGrass(['old_growth_pine_taiga', 'old_growth_spruce_taiga'], [0.04, 0, 0.16, 0.04]);
setGrass(['snowy_plains', 'ice_spikes'], [0.01, 0, 0, 0]);
setGrass(['jungle'], [0.45, 0, 0.15, 0.01]);
setGrass(['sparse_jungle'], [0.4, 0, 0.13, 0.01]);
setGrass(['savanna', 'savanna_plateau'], [0.6, 0.02, 0, 0, 1]);
setGrass(['windswept_savanna'], [0.35, 0.02, 0, 0, 1]);
setGrass(['windswept_hills', 'windswept_forest'], [0.15, 0.003, 0, 0]);
setGrass(['windswept_gravelly_hills'], [0.08, 0, 0, 0]);
setGrass(['meadow'], [0.3, 0.17, 0, 0]);
setGrass(['cherry_grove'], [0.25, 0.015, 0, 0, 1]);
setGrass(['swamp'], [0.15, 0, 0, 0]);
setGrass(['wooded_badlands'], [0.06, 0, 0, 0]);
setGrass(['river', 'frozen_river'], [0.05, 0, 0, 0]);
setGrass(['badlands', 'eroded_badlands'], [0.02, 0, 0, 0]);

const F = (n) => ID[n];
const PLAINS_HIGH = [F('poppy'), F('azure_bluet'), F('oxeye_daisy'), F('cornflower')];
const TULIPS = [F('orange_tulip'), F('red_tulip'), F('pink_tulip'), F('white_tulip')];
const FLOWER_FOREST_LIST = [F('dandelion'), F('poppy'), F('allium'), F('azure_bluet'), F('red_tulip'), F('orange_tulip'), F('white_tulip'), F('pink_tulip'), F('oxeye_daisy'), F('cornflower'), F('lily_of_the_valley')];
const MEADOW_LIST = [-1, F('allium'), F('poppy'), F('azure_bluet'), F('dandelion'), F('cornflower'), F('oxeye_daisy'), F('short_grass')];
const TALL_FLOWERS = [F('lilac'), F('rose_bush'), F('peony')];

export class Decorator {
  constructor(seed, gen) {
    this.seed = seed; this.gen = gen;
    this.ctx = new Ctx();
    this.rng = new Rand(0);
    this.patchNoise = makeNoise(seed, 'patch');
    this.flowerNoise = makeNoise(mix(seed, 7), 'flower_type');
    this.kelpNoise = makeNoise(seed, 'kelp');
    this.sPlant = mix(seed, hashString('plants'));
    this.sPatch = mix(seed, hashString('patches'));
  }

  // max over nearby virtual patch centres of (1 - d/r); cells of size S, probability p (per cell), radius
  // r = R * (1 +- Rvar) chosen per centre. The winning centre's hash is left in this.lastHash.
  patch(wx, wz, S, p, R, salt, Rvar = 0) {
    const cx = Math.floor(wx / S), cz = Math.floor(wz / S);
    let best = 0;
    const thr = p * 4294967296;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const h = fmix32(mix(mix(this.sPatch ^ salt, cx + dx), cz + dz));
      if (h >= thr) continue;
      const h2 = fmix32(h + 1);
      const px = (cx + dx) * S + (h2 & 0xffff) / 65536 * S, pz = (cz + dz) * S + (h2 >>> 16) / 65536 * S;
      const ddx = wx + 0.5 - px, ddz = wz + 0.5 - pz;
      const d = Math.sqrt(ddx * ddx + ddz * ddz);
      const r = Rvar ? R * (1 + Rvar * ((fmix32(h + 2) & 0xffff) / 32768 - 1)) : R;
      const v = 1 - d / r;
      if (v > best) { best = v; this.lastHash = h2; }
    }
    return best;
  }

  decorate(cx, cz, blocks, outside) {
    const gen = this.gen, ctx = this.ctx, rng = this.rng;
    const x0 = cx * 16, z0 = cz * 16;
    ctx.reset(blocks, x0, z0);
    const biomeCol = gen.biomeCol, topSolid = gen.topSolid, topAll = gen.topAll;
    const present = new Set();
    for (let i = 0; i < 256; i++) present.add(biomeCol[i]);
    const biomes = [...present].sort((a, b) => a - b);

    // underwater disks (sand / clay / gravel)
    this.disks(blocks, x0, z0);

    // ice spikes, boulders
    for (const b of biomes) {
      rng.setSeed(mix(mix(mix(this.seed, cx), cz), 1000 + b));
      if (b === B.ice_spikes) {
        for (let n = 0; n < 3; n++) {
          const x = rng.nextInt(16), z = rng.nextInt(16), c = z * 16 + x;
          if (biomeCol[c] !== b || topAll[c] !== topSolid[c]) continue;
          if (blocks[c + (topSolid[c] + 64) * 256] !== ID.snow_block) continue;
          T.iceSpike(ctx, rng, x0 + x, topSolid[c] + 1, z0 + z);
        }
      } else if (b === B.old_growth_pine_taiga || b === B.old_growth_spruce_taiga) {
        for (let n = 0; n < 2; n++) {
          const x = 2 + rng.nextInt(12), z = 2 + rng.nextInt(12), c = z * 16 + x;
          if (biomeCol[c] !== b || topAll[c] !== topSolid[c] || rng.nextInt(3) !== 0) continue;
          T.mossyBoulder(ctx, rng, x0 + x, topSolid[c] + 1, z0 + z);
        }
      }
    }

    // trees
    for (const b of biomes) {
      const cfg = TREES[b];
      if (!cfg) continue;
      rng.setSeed(mix(mix(mix(this.seed, cx), cz), b));
      let count = cfg[0];
      if (rng.nextFloat() < cfg[1]) count += cfg[2];
      for (let n = 0; n < count; n++) {
        const x = rng.nextInt(16), z = rng.nextInt(16);
        const c = z * 16 + x;
        // choose the tree type up front (keeps RNG streams stable)
        let tree = cfg[4];
        for (const [t, ch] of cfg[3]) if (rng.nextFloat() < ch) { tree = t; break; }
        if (biomeCol[c] !== b) continue;
        const y = topSolid[c];
        const water = topAll[c] - y;
        if (water > (b === B.swamp ? 2 : 0)) continue;
        const g = blocks[c + (y + 64) * 256] & TYPE_MASK;
        if (!(GROUND[g] || (g === ID.snow_block && (b === B.grove || b === B.snowy_slopes)))) continue;
        if (blocks[c + (y + 65) * 256] !== 0 && !(water > 0) && !T_REPLACEABLE[blocks[c + (y + 65) * 256] & TYPE_MASK]) continue;
        tree(ctx, rng, x0 + x, y + 1, z0 + z);
      }
    }

    // per-column vegetation
    this.vegetation(blocks, x0, z0);
    // mushrooms on dark cave floors
    rng.setSeed(mix(mix(mix(this.seed, cx), cz), 2001));
    for (let n = 0; n < 6; n++) {
      const x = rng.nextInt(16), z = rng.nextInt(16), c = z * 16 + x;
      let y = -50 + rng.nextInt(Math.max(1, topSolid[c] - 12 + 50));
      const kind = rng.nextFloat() < 0.6 ? ID.brown_mushroom : ID.red_mushroom;
      if (rng.nextFloat() > 0.45) continue;
      let i = c + (y + 64) * 256;
      if (blocks[i] !== 0) continue;
      while (y > -60 && blocks[i - 256] === 0) { y--; i -= 256; }
      const fl = blocks[i - 256];
      if (fl === ID.stone || fl === ID.deepslate || fl === ID.dirt || fl === ID.gravel || fl === ID.granite || fl === ID.andesite || fl === ID.diorite || fl === ID.tuff) blocks[i] = kind;
    }
    ctx.snowSpill(gen);
    ctx.flush(outside);
  }

  disks(blocks, x0, z0) {
    const gen = this.gen, biomeCol = gen.biomeCol, topSolid = gen.topSolid, topAll = gen.topAll;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = z * 16 + x;
      const y = topSolid[c];
      if (topAll[c] <= y || topAll[c] - y > 20) continue;   // only underwater floors
      const b = biomeCol[c];
      if (b === B.frozen_peaks) continue;
      const wx = x0 + x, wz = z0 + z;
      let blk = -1;
      const wob = 0.8 + 0.4 * posRandom(this.sPlant, wx >> 1, 9, wz >> 1);
      if (this.patch(wx, wz, 16, 0.4, 2.5 * wob, 11, 0.2) > 0) blk = ID.clay;
      else if (b === B.swamp) continue;
      else if (this.patch(wx, wz, 10, 0.5, 4 * wob, 12, 0.5) > 0) blk = SAND;
      else if (this.patch(wx, wz, 16, 0.5, 3.5 * wob, 13, 0.43) > 0) blk = ID.gravel;
      if (blk < 0) continue;
      for (let d = 0; d < 2; d++) {
        const i = c + (y - d + 64) * 256;
        const t = blocks[i];
        if (t === DIRT || t === GRASS || (blk === ID.clay && t === ID.clay)) blocks[i] = blk;
      }
    }
  }

  vegetation(blocks, x0, z0) {
    const gen = this.gen, biomeCol = gen.biomeCol, topSolid = gen.topSolid, topAll = gen.topAll;
    const sP = this.sPlant;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = z * 16 + x;
      const b = biomeCol[c];
      const wx = x0 + x, wz = z0 + z;
      const y = topSolid[c];
      if (y < -60 || y > 316) continue;
      const gi = c + (y + 64) * 256;
      const ground = blocks[gi] & TYPE_MASK;
      const water = topAll[c] - y;
      const r = posRandom(sP, wx, 1, wz), r2 = posRandom(sP, wx, 2, wz);
      if (water > 0) { this.waterPlants(blocks, c, b, wx, wz, y, water, r, r2); continue; }
      const above = blocks[gi + 256];
      if (above !== 0) continue;
      const up1 = gi + 256, up2 = gi + 512;
      // sugar cane next to water
      if ((PLANT_GROUND[ground] || ground === SAND || ground === ID.red_sand) && b !== B.frozen_river && BIOMES[b].temperature >= 0.15 && y >= 62 && y <= 64) {
        if (this.nextToWater(blocks, x, z, y)) {
          const p = b === B.desert || b === B.swamp ? 0.3 : 0.16;
          if (r < p * this.patch(wx, wz, 12, 0.7, 7, 21) * 2) {
            const h = 2 + Math.floor(r2 * r2 * 3);
            for (let k = 1; k <= h; k++) { if (blocks[gi + k * 256] !== 0) break; blocks[gi + k * 256] = ID.sugar_cane; }
            continue;
          }
        }
      }
      if (ground === SAND || ground === ID.red_sand || ground === ID.terracotta || (ground >= ID.white_terracotta && ground <= ID.light_gray_terracotta)) {
        this.dryPlants(blocks, c, b, x, z, y, gi, ground, r, r2);
        continue;
      }
      if (!PLANT_GROUND[ground]) {
        if (ground === ID.snow_block && b === B.grove && r < 0.0) blocks[up1] = ID.fern;
        continue;
      }
      // pumpkins (rare clusters)
      if (ground === GRASS && b !== B.desert && BIOMES[b].temperature > 0.1 && BIOMES[b].temperature < 1.5) {
        const pp = this.patch(wx, wz, 64, 0.04, 5, 31);
        if (pp > 0 && r < pp * 0.35) { blocks[up1] = ID.pumpkin; continue; }
        if ((b === B.jungle || b === B.sparse_jungle)) {
          const mp = this.patch(wx, wz, 48, 0.15, 5, 32);
          if (mp > 0 && r < mp * 0.4) { blocks[up1] = ID.melon; continue; }
        }
      }
      // mushrooms
      if (b === B.dark_forest || b === B.old_growth_pine_taiga || b === B.old_growth_spruce_taiga || b === B.swamp || b === B.taiga || b === B.mushroom_fields) {
        const mp = b === B.mushroom_fields ? 0.06 : b === B.dark_forest ? 0.012 : 0.006;
        if (r2 < mp) { blocks[up1] = r < 0.6 ? ID.brown_mushroom : ID.red_mushroom; continue; }
      }
      // flowers
      const fl = this.flower(b, wx, wz, r, r2);
      if (fl !== 0) {
        if (fl > 0) blocks[up1] = fl;
        else if (blocks[up2] === 0) { blocks[up1] = -fl; blocks[up2] = mk(-fl, 1); }
        continue;
      }
      // grass / ferns
      const gd = GRASSD[b];
      if (!gd) continue;
      const nz = this.patchNoise.sample(wx, 0, wz);
      const m = Math.max(0, 0.6 + nz * 1.3);
      let acc = 0;
      const rr = r2;
      // clustered tall grass patches (vanilla patch_tall_grass*: rare, dense clumps)
      if (gd[4]) {
        const tp = this.patch(wx, wz, 40, 0.3, 6, 61);
        if (tp > 0 && r < tp * 0.45) { if (blocks[up2] === 0) { blocks[up1] = ID.tall_grass; blocks[up2] = mk(ID.tall_grass, 1); } continue; }
      }
      if (rr < (acc += gd[1] * m)) { if (blocks[up2] === 0) { blocks[up1] = ID.tall_grass; blocks[up2] = mk(ID.tall_grass, 1); } continue; }
      if (rr < (acc += gd[3] * m)) { if (blocks[up2] === 0) { blocks[up1] = ID.large_fern; blocks[up2] = mk(ID.large_fern, 1); } continue; }
      if (rr < (acc += gd[2] * m)) { blocks[up1] = ID.fern; continue; }
      if (rr < (acc += gd[0] * m)) { blocks[up1] = ID.short_grass; continue; }
    }
  }

  nextToWater(blocks, x, z, y) {
    const base = (y + 64) * 256;
    if (x > 0 && (blocks[base + z * 16 + x - 1] & TYPE_MASK) === WATER) return true;
    if (x < 15 && (blocks[base + z * 16 + x + 1] & TYPE_MASK) === WATER) return true;
    if (z > 0 && (blocks[base + (z - 1) * 16 + x] & TYPE_MASK) === WATER) return true;
    if (z < 15 && (blocks[base + (z + 1) * 16 + x] & TYPE_MASK) === WATER) return true;
    return false;
  }

  // returns 0 (none), block id (single), or -id (double plant)
  flower(b, wx, wz, r, r2) {
    switch (b) {
      case B.plains: case B.sunflower_plains: {
        if (b === B.sunflower_plains) {
          const sp = this.patch(wx, wz, 20, 0.6, 7, 41);
          if (sp > 0 && r < sp * 0.7) return -ID.sunflower;
        }
        const p = this.patch(wx, wz, 40, 0.2, 6, 42);
        if (p <= 0 || r >= p * 0.5) return 0;
        const n = this.flowerNoise.sample(wx * 0.3, 0, wz * 0.3);
        if (n < -0.55) return TULIPS[Math.floor(r2 * 4)];
        if (r2 < 0.333) return PLAINS_HIGH[Math.floor(r2 * 3 * 4) & 3];
        return ID.dandelion;
      }
      case B.flower_forest: {
        const p = 0.16 * Math.max(0, 0.6 + this.patchNoise.sample(wx, 0, wz) * 1.5);
        if (r >= p) return 0;
        const n = (this.flowerNoise.sample(wx * 0.35, 0, wz * 0.35) + 1) * 0.5;
        const i = Math.max(0, Math.min(FLOWER_FOREST_LIST.length - 1, Math.floor(n * FLOWER_FOREST_LIST.length + (r2 - 0.5) * 1.5)));
        return FLOWER_FOREST_LIST[i];
      }
      case B.forest: case B.birch_forest: case B.old_growth_birch_forest: case B.dark_forest: {
        const p = this.patch(wx, wz, 40, 0.18, 5, 43);
        if (p > 0 && r < p * 0.35) {
          const ph = this.lastHash >>> 20;
          if (b !== B.birch_forest && b !== B.old_growth_birch_forest && (ph & 3) === 0) return -TALL_FLOWERS[Math.floor(r2 * 3)];
          if (b === B.forest && (ph & 7) === 1) return ID.lily_of_the_valley;
          return r2 < 0.5 ? ID.dandelion : ID.poppy;
        }
        return 0;
      }
      case B.meadow: {
        const p = 0.16 * Math.max(0, 0.5 + this.patchNoise.sample(wx, 0, wz) * 1.4);
        if (r >= p) return 0;
        const div = 1 + Math.floor((this.flowerNoise.sample(wx * 0.05, 0, wz * 0.05) + 1) * 1.5);
        const n = (this.flowerNoise.sample(wx * 0.4, 7, wz * 0.4) + 1) * 0.5;
        let i = Math.floor(n * MEADOW_LIST.length + (r2 - 0.5) * div) % MEADOW_LIST.length;
        if (i < 0) i += MEADOW_LIST.length;
        const v = MEADOW_LIST[i];
        return v === -1 ? -ID.tall_grass : v;
      }
      case B.cherry_grove: {
        const p = this.patch(wx, wz, 14, 0.85, 7, 44);
        if (p > 0 && r < p * 0.8) {
          const amount = Math.floor(r2 * 4), facing = Math.floor(posRandom(this.sPlant, wx, 3, wz) * 4);
          return mk(ID.pink_petals, amount | (facing << 2));
        }
        return 0;
      }
      case B.swamp: {
        const p = this.patch(wx, wz, 32, 0.3, 5, 45);
        return p > 0 && r < p * 0.3 ? ID.blue_orchid : 0;
      }
      case B.taiga: case B.snowy_taiga: case B.old_growth_pine_taiga: case B.old_growth_spruce_taiga: case B.savanna: case B.savanna_plateau:
      case B.jungle: case B.sparse_jungle: case B.windswept_hills: case B.windswept_forest: case B.river: case B.snowy_plains: {
        const p = this.patch(wx, wz, 48, 0.12, 5, 46);
        if (p > 0 && r < p * 0.3) return r2 < 0.6 ? ID.dandelion : ID.poppy;
        return 0;
      }
      default: return 0;
    }
  }

  dryPlants(blocks, c, b, x, z, y, gi, ground, r, r2) {
    const up1 = gi + 256;
    if (b === B.desert || IS_BADLANDS_DRY[b]) {
      const cactusP = b === B.desert ? 0.006 : 0.002;
      if (r < cactusP && (ground === SAND || ground === ID.red_sand) && x > 0 && x < 15 && z > 0 && z < 15) {
        const h = 1 + Math.floor(r2 * r2 * 3);
        for (let k = 1; k <= h; k++) {
          const i = gi + k * 256;
          if (blocks[i] !== 0 || blocks[i - 1] !== 0 || blocks[i + 1] !== 0 || blocks[i - 16] !== 0 || blocks[i + 16] !== 0) break;
          blocks[i] = ID.cactus;
        }
        return;
      }
      const deadP = b === B.desert ? 0.004 : 0.02;
      if (r2 < deadP) blocks[up1] = ID.dead_bush;
    } else if (b === B.beach || b === B.snowy_beach) {
      // nothing
    }
  }

  waterPlants(blocks, c, b, wx, wz, y, water, r, r2) {
    const surf = y + water; // top water block
    const fi = c + (y + 64) * 256;
    const floor = blocks[fi] & TYPE_MASK;
    if (b === B.swamp) {
      if (water <= 3 && blocks[c + (surf + 65) * 256] === 0) {
        const p = this.patch(wx, wz, 16, 0.6, 6, 51);
        if (p > 0 && r2 < p * 0.35) { blocks[c + (surf + 65) * 256] = ID.lily_pad; }
      }
    }
    if (!T_SOLID[floor] || floor === ID.ice) return;
    const ocean = IS_OCEAN[b] === 1;
    const frozen = b === B.frozen_ocean || b === B.deep_frozen_ocean || b === B.frozen_river;
    // kelp in cold / normal / lukewarm oceans
    if (ocean && !frozen && b !== B.warm_ocean && water >= 4) {
      const kn = this.kelpNoise.sample(wx, 0, wz);
      if (kn > 0.1 && r < (kn - 0.1) * 0.6) {
        const h = 1 + Math.floor(r2 * 10);
        let k = 1;
        for (; k <= h && y + k < surf; k++) blocks[fi + k * 256] = ID.kelp_plant;
        blocks[fi + k * 256] = ID.kelp;
        return;
      }
    }
    if (frozen && b !== B.frozen_river) return;
    let sp = 0;
    if (ocean) sp = b === B.warm_ocean || b === B.lukewarm_ocean || b === B.deep_lukewarm_ocean ? 0.31 : b === B.cold_ocean || b === B.deep_cold_ocean ? 0.14 : 0.19;
    else if (IS_RIVER[b]) sp = 0.19;
    else if (b === B.swamp) sp = 0.25;
    else sp = 0.1;
    if (r < sp) {
      const tallP = BIOMES[b].deep ? 0.8 : ocean ? 0.3 : 0.4;
      if (water >= 2 && r2 < tallP) { blocks[fi + 256] = ID.tall_seagrass; blocks[fi + 512] = mk(ID.tall_seagrass, 1); }
      else blocks[fi + 256] = ID.seagrass;
    }
  }
}
const IS_BADLANDS_DRY = new Uint8Array(64); for (const n of ['badlands', 'eroded_badlands', 'wooded_badlands']) IS_BADLANDS_DRY[B[n]] = 1;
