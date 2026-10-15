/* gen.js — shares window.gg (see index.html) */
(() => {
'use strict';
const { THREE, JSZip } = gg;
const { AIR, B, CHUNK_H, CHUNK_W, DIRS, Noise, Rand, SEA_LEVEL, bidx, clamp, floor, hashString, hexToRgb, isLeaves, lerp, smoothstep } = gg;

/* ============================================================================
   7. TERRAIN GENERATION
   ----------------------------------------------------------------------------
   Column noise (continentalness, erosion/mountains, temperature, humidity)
   drives height + biome. Caves come from two 3D noise fields sampled on a
   coarse lattice and trilinearly interpolated (fast). Ores/stone variants use
   random-walk veins. Trees and structures use setBlockGen so they can spill
   across chunk borders.
   ========================================================================== */
const BIOMES = [
  { name: 'Ocean',        grass: '#8eb971', foliage: '#71a74d', water: '#3f76e4', trees: 0,     grassP: 0,    flowerP: 0 },
  { name: 'Plains',       grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4', trees: 0.002, grassP: 0.12, flowerP: 0.02, pumpkinP: 0.0008 },
  { name: 'Forest',       grass: '#79c05a', foliage: '#59ae30', water: '#3f76e4', trees: 0.045, grassP: 0.08, flowerP: 0.01 },
  { name: 'Desert',       grass: '#bfb755', foliage: '#aea42a', water: '#3f76e4', trees: 0,     grassP: 0,    flowerP: 0, deadBushP: 0.01, cactusP: 0.008 },
  { name: 'Mountains',    grass: '#8ab689', foliage: '#6da36b', water: '#3f76e4', trees: 0.004, grassP: 0.03, flowerP: 0.003 },
  { name: 'Snowy Tundra', grass: '#80b497', foliage: '#60a17b', water: '#3d57d6', trees: 0.001, grassP: 0.01, flowerP: 0 },
  { name: 'Taiga',        grass: '#86b783', foliage: '#68a464', water: '#3f76e4', trees: 0.04,  grassP: 0.06, flowerP: 0.002, fernP: 0.05 },
  { name: 'Beach',        grass: '#91bd59', foliage: '#77ab2f', water: '#3f76e4', trees: 0,     grassP: 0,    flowerP: 0 },
  { name: 'Birch Forest', grass: '#88bb67', foliage: '#6ba941', water: '#3f76e4', trees: 0.04,  grassP: 0.08, flowerP: 0.02 },
  { name: 'Deep Ocean',   grass: '#8eb971', foliage: '#71a74d', water: '#3f76e4', trees: 0,     grassP: 0,    flowerP: 0 }
];
const BIO_OCEAN = 0, BIO_PLAINS = 1, BIO_FOREST = 2, BIO_DESERT = 3, BIO_MOUNTAINS = 4, BIO_SNOWY = 5, BIO_TAIGA = 6, BIO_BEACH = 7, BIO_BIRCH = 8, BIO_DEEP_OCEAN = 9;
for (const b of BIOMES) { b.grassRGB = hexToRgb(b.grass); b.foliageRGB = hexToRgb(b.foliage); b.waterRGB = hexToRgb(b.water); }

const Terrain = {
  seed: 0,
  init(seed) {
    this.seed = seed;
    this.nCont = new Noise(seed + ':cont'); this.nEro = new Noise(seed + ':ero'); this.nHill = new Noise(seed + ':hill');
    this.nRidge = new Noise(seed + ':ridge'); this.nTemp = new Noise(seed + ':temp'); this.nHum = new Noise(seed + ':hum');
    this.nCaveA = new Noise(seed + ':caveA'); this.nCaveB = new Noise(seed + ':caveB'); this.nRavine = new Noise(seed + ':ravine');
    this.nDetail = new Noise(seed + ':detail');
    this.colCache = new Map();
  },
  // Column sample: height of the top solid block (y) and biome id.
  sample(x, z) {
    const cont = this.nCont.fbm2(x * 0.0012, z * 0.0012, 4);
    const ero = this.nEro.fbm2((x + 1000) * 0.003, (z + 1000) * 0.003, 3);
    const hills = this.nHill.fbm2(x * 0.012, z * 0.012, 4);
    const landness = smoothstep(-0.25, 0.15, cont);
    const mountain = smoothstep(0.15, 0.65, ero) * smoothstep(0.05, 0.3, cont);
    const ridge = mountain > 0 ? this.nRidge.ridge2(x * 0.006, z * 0.006, 4) : 0;
    const base = lerp(36 + cont * 12, 66 + cont * 6, landness);
    let h = base + hills * (5 + 10 * mountain) + ridge * 48 * mountain;
    h = floor(clamp(h, 4, CHUNK_H - 6));
    let temp = (this.nTemp.fbm2((x + 5000) * 0.0017, z * 0.0017, 3) + 1) * 0.5 - Math.max(0, h - 70) * 0.006;
    const hum = (this.nHum.fbm2(x * 0.0021, (z + 5000) * 0.0021, 3) + 1) * 0.5;
    let biome;
    if (h < SEA_LEVEL - 12) biome = BIO_DEEP_OCEAN;
    else if (h < SEA_LEVEL - 1) biome = BIO_OCEAN;
    else if (mountain > 0.45 && h > 74) biome = BIO_MOUNTAINS;
    else if (h <= SEA_LEVEL + 2 && cont < 0.3) biome = BIO_BEACH;
    else if (temp < 0.3) biome = hum > 0.5 ? BIO_TAIGA : BIO_SNOWY;
    else if (temp > 0.68 && hum < 0.42) biome = BIO_DESERT;
    else if (hum > 0.6) biome = temp < 0.5 ? BIO_BIRCH : BIO_FOREST;
    else biome = BIO_PLAINS;
    return { h, biome, temp, hum, mountain };
  },
  heightAt(x, z) { return this.sample(x, z).h; },
  biomeAt(x, z) { return this.sample(x, z).biome; },
  chunkRand(cx, cz, salt = '') { return new Rand(hashString(this.seed + ':' + cx + ':' + cz + ':' + salt)); },

  // ---- Base terrain ----
  generateChunk(c) {
    const bl = c.blocks, meta = c.meta, ox = c.cx * CHUNK_W, oz = c.cz * CHUNK_W;
    const cols = new Array(256);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) { const s = this.sample(ox + x, oz + z); cols[x * 16 + z] = s; c.biomes[x * 16 + z] = s.biome; }
    const r = this.chunkRand(c.cx, c.cz, 'base');
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const s = cols[x * 16 + z], h = s.h, bio = s.biome, base = (x << 11) | (z << 7);
      const soil = 3 + r.int(2);
      let top, sub, subDepth = soil;
      switch (bio) {
        case BIO_DESERT: top = B.sand; sub = B.sand; break;
        case BIO_BEACH: top = B.sand; sub = B.sand; break;
        case BIO_OCEAN: case BIO_DEEP_OCEAN: top = (this.nDetail.noise2((ox + x) * 0.05, (oz + z) * 0.05) > 0.1) ? B.gravel : B.sand; sub = top; subDepth = 2; break;
        case BIO_MOUNTAINS: top = (h > 82 || this.nDetail.noise2((ox + x) * 0.08, (oz + z) * 0.08) > 0.35) ? B.stone : B.grass_block; sub = top === B.stone ? B.stone : B.dirt; break;
        case BIO_SNOWY: top = B.grass_block; sub = B.dirt; break;
        default: top = B.grass_block; sub = B.dirt;
      }
      for (let y = 0; y <= h && y < CHUNK_H; y++) {
        let id;
        if (y === 0 || (y < 5 && r.next() < (5 - y) * 0.2)) id = B.bedrock;
        else if (y < h - subDepth) id = B.stone;
        else if (y < h) id = sub;
        else id = top;
        bl[base | y] = id;
      }
      // Water above the surface up to sea level
      for (let y = h + 1; y <= SEA_LEVEL; y++) bl[base | y] = B.water;
      // Desert/beach: sandstone under the sand so it does not float over caves
      if ((bio === BIO_DESERT || bio === BIO_BEACH) && h - subDepth - 3 > 0) for (let y = h - subDepth - 3; y < h - subDepth; y++) if (bl[base | y] === B.stone) bl[base | y] = B.sandstone;
      // Snow cover and frozen water
      if ((bio === BIO_SNOWY || (bio === BIO_MOUNTAINS && h > 92) || (bio === BIO_TAIGA && h > 80)) && h > SEA_LEVEL) {
        if (bl[base | h] === B.grass_block) meta[base | h] = 1;
        bl[base | (h + 1)] = B.snow;
      }
      if (s.temp < 0.25 && h < SEA_LEVEL) bl[base | SEA_LEVEL] = B.ice; // frozen cold seas
    }
    this.carveCaves(c, cols);
    this.placeVeins(c);
    c.recomputeHeights();
    c.state = gg.CH_GENERATED;
    gg.world.applyPending(c);
    this.decorateChunk(c, cols);
  },

  // ---- Caves: two 3D noise fields (tunnels where both are near zero) + 2D ravines ----
  carveCaves(c, cols) {
    const bl = c.blocks, ox = c.cx * CHUNK_W, oz = c.cz * CHUNK_W;
    const LX = 5, LY = CHUNK_H / 4 + 1, LZ = 5; // lattice (4-block spacing)
    const A = new Float32Array(LX * LY * LZ), Bf = new Float32Array(LX * LY * LZ);
    for (let i = 0; i < LX; i++) for (let j = 0; j < LY; j++) for (let k = 0; k < LZ; k++) {
      const wx = ox + i * 4, wy = j * 4, wz = oz + k * 4, idx = (i * LY + j) * LZ + k;
      A[idx] = this.nCaveA.noise3(wx * 0.022, wy * 0.035, wz * 0.022);
      Bf[idx] = this.nCaveB.noise3(wx * 0.022, wy * 0.035, wz * 0.022);
    }
    const lat = (arr, i, j, k) => arr[(i * LY + j) * LZ + k];
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const h = cols[x * 16 + z].h, base = (x << 11) | (z << 7);
      const rav = this.nRavine.noise2((ox + x) * 0.004, (oz + z) * 0.004);
      const ravWidth = 0.012 + 0.012 * (this.nDetail.noise2((ox + x) * 0.02, (oz + z) * 0.02) + 1);
      const ravMask = this.nDetail.noise2((ox + x) * 0.0016 + 300, (oz + z) * 0.0016 - 300);
      const inRavine = ravMask > 0.45 && Math.abs(rav) < ravWidth && h > SEA_LEVEL;
      const ravBottom = Math.max(12, h - 30 - floor(ravWidth * 400));
      const i0 = x >> 2, fx = (x & 3) / 4, k0 = z >> 2, fz = (z & 3) / 4;
      for (let y = 6; y <= h; y++) {
        const id = bl[base | y];
        if (id === B.bedrock || id === B.water) continue;
        let carve = false;
        if (inRavine && y >= ravBottom) carve = true;
        else {
          const j0 = y >> 2, fy = (y & 3) / 4;
          // trilinear interpolation of both fields
          let a = 0, b = 0;
          for (let di = 0; di < 2; di++) for (let dj = 0; dj < 2; dj++) for (let dk = 0; dk < 2; dk++) {
            const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy) * (dk ? fz : 1 - fz);
            a += w * lat(A, i0 + di, j0 + dj, k0 + dk); b += w * lat(Bf, i0 + di, j0 + dj, k0 + dk);
          }
          const thresh = y < 20 ? 0.03 : 0.018;
          carve = (a * a + b * b) < thresh;
        }
        if (!carve) continue;
        // Never open a cave directly under water (keeps oceans from draining into caves)
        if (bl[base | (y + 1)] === B.water) continue;
        bl[base | y] = (y <= 10 && !inRavine) ? B.lava : AIR;
      }
    }
  },

  // ---- Ore veins and stone-variant blobs (random walk) ----
  placeVeins(c) {
    const r = this.chunkRand(c.cx, c.cz, 'ore');
    const bl = c.blocks;
    const vein = (id, size, x, y, z) => {
      for (let n = 0; n < size; n++) {
        if (x >= 0 && x < 16 && z >= 0 && z < 16 && y > 0 && y < CHUNK_H - 1) { const i = bidx(x, y, z); if (bl[i] === B.stone) bl[i] = id; }
        const d = r.int(6); x += DIRS[d][0]; y += DIRS[d][1]; z += DIRS[d][2];
        if (r.chance(0.3)) { const d2 = r.int(6); x += DIRS[d2][0]; z += DIRS[d2][2]; }
      }
    };
    const table = [
      [B.granite, 8, 30, 0, 80], [B.diorite, 8, 30, 0, 80], [B.andesite, 8, 30, 0, 80], [B.dirt, 6, 30, 0, 100], [B.gravel, 5, 30, 0, 100],
      [B.coal_ore, 18, 14, 4, 120], [B.iron_ore, 16, 8, 2, 64], [B.gold_ore, 2, 8, 2, 32],
      [B.lapis_ore, 1, 6, 4, 30], [B.diamond_ore, 1, 7, 2, 16]
    ];
    for (const [id, attempts, size, y0, y1] of table) for (let a = 0; a < attempts; a++) vein(id, size, r.int(16), y0 + r.int(y1 - y0), r.int(16));
    // Emeralds only in mountains
    let mountains = false; for (let i = 0; i < 256; i++) if (c.biomes[i] === BIO_MOUNTAINS) { mountains = true; break; }
    if (mountains) for (let a = 0; a < 5; a++) { const i = bidx(r.int(16), 4 + r.int(28), r.int(16)); if (bl[i] === B.stone) bl[i] = B.emerald_ore; }
  },

  // ---- Decoration: trees, plants, structures ----
  decorateChunk(c, cols) {
    const r = this.chunkRand(c.cx, c.cz, 'deco');
    const ox = c.cx * CHUNK_W, oz = c.cz * CHUNK_W, bl = c.blocks;
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) {
      const s = cols[x * 16 + z], bio = BIOMES[s.biome], h = s.h, wx = ox + x, wz = oz + z;
      const top = bl[bidx(x, h, z)], above = bl[bidx(x, h + 1, z)];
      if (h <= SEA_LEVEL || above !== AIR) continue;
      if (top === B.grass_block) {
        const p = r.next();
        if (p < bio.trees) { this.placeTree(wx, h + 1, wz, s.biome, r); continue; }
        if (p < bio.trees + bio.grassP) { bl[bidx(x, h + 1, z)] = (bio.fernP && r.chance(0.4)) ? B.fern : B.short_grass; continue; }
        if (p < bio.trees + bio.grassP + bio.flowerP) { bl[bidx(x, h + 1, z)] = r.pick([B.dandelion, B.poppy, B.cornflower, B.oxeye_daisy]); continue; }
        if (bio.pumpkinP && p < bio.trees + bio.grassP + bio.flowerP + bio.pumpkinP) { bl[bidx(x, h + 1, z)] = B.pumpkin; continue; }
      } else if (top === B.sand && s.biome === BIO_DESERT) {
        const p = r.next();
        if (p < bio.cactusP) { const ch = 1 + r.int(3); for (let k = 1; k <= ch; k++) bl[bidx(x, h + k, z)] = B.cactus; }
        else if (p < bio.cactusP + bio.deadBushP) bl[bidx(x, h + 1, z)] = B.dead_bush;
      }
    }
    // Structures
    const sr = this.chunkRand(c.cx, c.cz, 'struct');
    if (sr.chance(0.04)) this.placeDungeon(c, sr);
    if (sr.chance(0.012)) this.placeRuinedPortal(c, cols, sr);
    // STUB: villages, mineshafts and strongholds would hook in here (placeVillage / placeMineshaft).
    c.recomputeHeights();
  },
  placeTree(x, y, z, biome, r) {
    const kind = biome === BIO_TAIGA || biome === BIO_SNOWY ? 'spruce' : biome === BIO_BIRCH ? 'birch' : (biome === BIO_FOREST && r.chance(0.2)) ? 'birch' : 'oak';
    const log = B[kind + '_log'], leaf = B[kind + '_leaves'];
    const onlyAir = (id) => id === AIR || isLeaves(id);
    if (kind === 'spruce') {
      const height = 6 + r.int(4);
      for (let i = 0; i < height; i++) gg.world.setBlockGen(x, y + i, z, log);
      let rad = 1;
      for (let ly = y + height; ly >= y + 2; ly--) {
        const rr = (ly === y + height) ? 0 : rad;
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (dx === 0 && dz === 0 && ly < y + height) continue;
          if (rr === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          gg.world.setBlockGen(x + dx, ly, z + dz, leaf, 0, onlyAir);
        }
        rad = rad === 1 ? 2 : 1;
      }
      gg.world.setBlockGen(x, y + height, z, leaf, 0, onlyAir);
    } else {
      const height = (kind === 'birch' ? 5 : 4) + r.int(3);
      for (let i = 0; i < height; i++) gg.world.setBlockGen(x, y + i, z, log);
      for (let ly = y + height - 3; ly <= y + height; ly++) {
        const rr = ly >= y + height - 1 ? 1 : 2;
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (rr === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && r.chance(0.5)) continue;
          if (rr === 1 && ly === y + height && Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
          gg.world.setBlockGen(x + dx, ly, z + dz, leaf, 0, onlyAir);
        }
      }
      gg.world.setBlockGen(x, y + height, z, leaf, 0, onlyAir);
    }
  },
  // Cobblestone dungeon room with a spawner and a loot chest
  placeDungeon(c, r) {
    const lx = 3 + r.int(10), lz = 3 + r.int(10), y = 8 + r.int(32);
    const ox = c.cx * 16 + lx, oz = c.cz * 16 + lz;
    if (y + 6 >= c.height[lx * 16 + lz]) return; // must be underground
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = 0; dy < 5; dy++) {
      const wall = Math.abs(dx) === 3 || Math.abs(dz) === 3 || dy === 0 || dy === 4;
      const id = wall ? (dy === 0 && r.chance(0.4) ? B.mossy_cobblestone : B.cobblestone) : AIR;
      gg.world.setBlockGen(ox + dx, y + dy, oz + dz, id);
    }
    gg.world.setBlockGen(ox, y + 1, oz, B.spawner);
    gg.world.setTileGen(ox, y + 1, oz, { type: 'spawner', mob: r.pick(['zombie', 'skeleton', 'zombie']), cooldown: 200 });
    const cx2 = ox + (r.chance(0.5) ? 2 : -2), cz2 = oz + (r.chance(0.5) ? 2 : -2);
    gg.world.setBlockGen(cx2, y + 1, cz2, B.chest, r.int(4));
    if ((cx2 >> 4) === c.cx && (cz2 >> 4) === c.cz) gg.world.setTileGen(cx2, y + 1, cz2, { type: 'chest', slots: this.lootChest(r, 'dungeon') });
  },
  placeRuinedPortal(c, cols, r) {
    const lx = 4 + r.int(8), lz = 4 + r.int(8), s = cols[lx * 16 + lz];
    if (s.h <= SEA_LEVEL + 1) return;
    const ox = c.cx * 16 + lx, oz = c.cz * 16 + lz, y = s.h + 1;
    for (let dx = -1; dx <= 2; dx++) for (let dy = 0; dy < 5; dy++) {
      const frame = dx === -1 || dx === 2 || dy === 0 || dy === 4;
      if (!frame) continue;
      if (r.chance(0.3)) continue; // ruined: missing blocks
      gg.world.setBlockGen(ox + dx, y + dy, oz, B.obsidian);
    }
    for (let dx = -3; dx <= 4; dx++) for (let dz = -2; dz <= 2; dz++) if (r.chance(0.3)) gg.world.setBlockGen(ox + dx, this.heightAt(ox + dx, oz + dz), oz + dz, r.chance(0.7) ? B.netherrack : B.lava);
    gg.world.setBlockGen(ox + 3, y, oz + 1, B.chest, 0);
    if (((ox + 3) >> 4) === c.cx && ((oz + 1) >> 4) === c.cz) gg.world.setTileGen(ox + 3, y, oz + 1, { type: 'chest', slots: this.lootChest(r, 'portal') });
    // STUB: Nether portal activation (flint & steel on the frame) needs the Nether dimension.
  },
  lootChest(r, kind) {
    const slots = new Array(27).fill(null);
    const pool = kind === 'portal'
      ? [['flint_and_steel', 1, 1], ['gold_ingot', 1, 4], ['obsidian', 1, 2], ['golden_pickaxe', 1, 1], ['iron_ingot', 1, 3]]
      : [['iron_ingot', 1, 4], ['bread', 1, 2], ['string', 1, 4], ['gunpowder', 1, 4], ['bone', 1, 4], ['diamond', 1, 1], ['apple', 1, 2], ['coal', 2, 6], ['iron_pickaxe', 1, 1], ['bucket', 1, 1], ['wheat_seeds', 2, 4]];
    const n = 3 + r.int(4);
    for (let i = 0; i < n; i++) { const [item, a, b] = r.pick(pool); slots[r.int(27)] = { name: item, count: r.irange(a, b) }; }
    return slots;
  },
  // Find a dry spawn column near the origin
  findSpawn() {
    for (let radius = 0; radius < 600; radius += 8) for (let a = 0; a < 16; a++) {
      const x = floor(Math.cos(a) * radius), z = floor(Math.sin(a) * radius);
      const s = this.sample(x, z);
      if (s.h > SEA_LEVEL + 1 && s.biome !== BIO_MOUNTAINS) return [x + 0.5, s.h + 2, z + 0.5];
    }
    return [0.5, 80, 0.5];
  }
};
Object.assign(gg, { BIOMES, BIO_OCEAN, BIO_PLAINS, BIO_FOREST, BIO_DESERT, BIO_MOUNTAINS, BIO_SNOWY, BIO_TAIGA, BIO_BEACH, BIO_BIRCH, BIO_DEEP_OCEAN, Terrain });

})();
