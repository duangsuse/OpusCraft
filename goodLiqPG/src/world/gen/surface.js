// Surface rules (port of the logic of vanilla SurfaceRuleData.overworld) + badlands bands / eroded badlands hoodoos.
import { ID } from '../blocks.js';
import { makeNoise } from './noise.js';
import { Rand, mix, posRandom, hashString } from './rng.js';
import { B } from './biomes.js';

const AIR = 0, STONE = ID.stone, DEEPSLATE = ID.deepslate, WATER = ID.water, LAVA = ID.lava;
const GRASS = ID.grass_block, DIRT = ID.dirt, SAND = ID.sand, GRAVEL = ID.gravel, SANDSTONE = ID.sandstone;
const SNOW_BLOCK = ID.snow_block, PACKED_ICE = ID.packed_ice, ICE = ID.ice, COARSE = ID.coarse_dirt, PODZOL = ID.podzol;
const CALCITE = ID.diorite;            // no calcite block in the registry -> closest light stone
const POWDER_SNOW = ID.snow_block;     // no powder snow block
const TC = ID.terracotta, ORANGE_TC = ID.orange_terracotta, WHITE_TC = ID.white_terracotta, RED_SAND = ID.red_sand;
const NONE = -100000;

function generateBands(rng) {
  const out = new Uint16Array(192).fill(TC);
  for (let i = 0; i < out.length; i++) {
    i += rng.nextInt(5) + 1;
    if (i < out.length) out[i] = ORANGE_TC;
  }
  const makeBands = (minSize, state) => {
    const n = rng.between(6, 15);
    for (let j = 0; j < n; j++) {
      const k = minSize + rng.nextInt(3);
      const l = rng.nextInt(out.length);
      for (let m = 0; l + m < out.length && m < k; m++) out[l + m] = state;
    }
  };
  makeBands(1, ID.yellow_terracotta);
  makeBands(2, ID.brown_terracotta);
  makeBands(1, ID.red_terracotta);
  const j = rng.between(9, 15);
  for (let k = 0, l = 0; k < j && l < out.length; l += rng.nextInt(16) + 4, k++) {
    out[l] = WHITE_TC;
    if (l - 1 > 0 && rng.nextBool()) out[l - 1] = ID.light_gray_terracotta;
    if (l + 1 < out.length && rng.nextBool()) out[l + 1] = ID.light_gray_terracotta;
  }
  return out;
}

const SANDY = new Uint8Array(64); for (const n of ['warm_ocean', 'beach', 'snowy_beach', 'desert']) SANDY[B[n]] = 1;
const BADLANDS = new Uint8Array(64); for (const n of ['badlands', 'eroded_badlands', 'wooded_badlands']) BADLANDS[B[n]] = 1;

export class SurfaceBuilder {
  constructor(seed) {
    this.seed = mix(seed, hashString('surface'));
    const n = (k) => makeNoise(seed, k);
    this.surface = n('surface'); this.secondary = n('surface_secondary'); this.clayBands = n('clay_bands_offset');
    this.bPillar = n('badlands_pillar'); this.bRoof = n('badlands_pillar_roof'); this.bSurface = n('badlands_surface');
    this.swamp = n('swamp'); this.calcite = n('calcite'); this.gravel = n('gravel'); this.powder = n('powder_snow');
    this.packedIce = n('packed_ice'); this.ice = n('ice');
    this.icebergPillar = n('iceberg_pillar'); this.icebergRoof = n('iceberg_pillar_roof'); this.icebergSurface = n('iceberg_surface');
    this.bands = generateBands(new Rand(mix(seed, hashString('clay_bands'))));
    // per-column scratch
    this.wx = 0; this.wz = 0; this.sn = 0; this.D = 0; this.steep = false; this.biome = 0;
  }

  band(y) {
    const i = Math.round(this.clayBands.sample(this.wx, 0, this.wz) * 4);
    return this.bands[((y + i) % 192 + 192) % 192];
  }

  // Eroded badlands hoodoos: raise terracotta spires (filled with stone; surface rules turn it into bands).
  erodedBadlands(blocks, base, top) {
    const wx = this.wx, wz = this.wz;
    const e = Math.min(Math.abs(this.bSurface.sample(wx, 0, wz) * 8.25), this.bPillar.sample(wx * 0.2, 0, wz * 0.2) * 15);
    if (e <= 0) return top;
    const g = Math.abs(this.bRoof.sample(wx * 0.75, 0, wz * 0.75) * 1.5);
    const h = 64 + Math.min(e * e * 2.5, Math.ceil(g * 50) + 24);
    const i = Math.floor(h);
    if (top > i) return top;
    for (let j = i; j >= -64; j--) {
      const v = blocks[base + (j + 64) * 256];
      if (v === STONE) break;
      if (v === WATER) return top;
    }
    let j = i;
    for (; j >= -64 && blocks[base + (j + 64) * 256] === AIR; j--) blocks[base + (j + 64) * 256] = STONE;
    return Math.max(top, i);
  }

  // Frozen ocean icebergs (port of vanilla frozenOceanExtension).
  iceberg(blocks, base, top, seaLevel, minY) {
    const wx = this.wx, wz = this.wz;
    const e = Math.min(Math.abs(this.icebergSurface.sample(wx, 0, wz) * 8.25), this.icebergPillar.sample(wx * 1.28, 0, wz * 1.28) * 15);
    if (e <= 1.8) return top;
    const h = Math.abs(this.icebergRoof.sample(wx * 1.17, 0, wz * 1.17) * 1.5);
    let i = Math.min(e * e * 1.2, Math.ceil(h * 40) + 14);
    let j;
    if (i > 2) { j = seaLevel - i - 7; i += seaLevel; } else return top;
    const k = Math.floor(i);
    const jj = Math.floor(j);
    const snowMax = 2 + Math.floor(posRandom(this.seed, wx, 1, wz) * 4);
    const snowFrom = seaLevel + 18 + Math.floor(posRandom(this.seed, wx, 2, wz) * 10);
    let n = 0, newTop = top;
    for (let o = Math.max(top, k + 1); o >= minY; o--) {
      const idx = base + (o + 64) * 256;
      const v = blocks[idx];
      const r = posRandom(this.seed, wx, o + 1000, wz);
      if ((v === AIR && o < k && r > 0.01) || (v === WATER && o > jj && o < seaLevel && r > 0.15)) {
        if (n <= snowMax && o > snowFrom) { blocks[idx] = SNOW_BLOCK; n++; }
        else blocks[idx] = PACKED_ICE;
        if (o > newTop) newTop = o;
      }
    }
    return newTop;
  }

  // Apply surface rules to one column. prelim = approximate smooth surface height; top = highest non-air y.
  column(blocks, x, z, wx, wz, biome, prelim, top, steep) {
    const base = z * 16 + x;
    this.wx = wx; this.wz = wz; this.biome = biome; this.steep = steep;
    const sn = this.surface.sample(wx, 0, wz);
    this.sn = sn;
    const D = Math.floor(sn * 2.75 + 3 + posRandom(this.seed, wx, 0, wz) * 0.25);
    this.D = D;
    if (biome === B.eroded_badlands) top = this.erodedBadlands(blocks, base, top);
    else if (biome === B.frozen_ocean || biome === B.deep_frozen_ocean) top = this.iceberg(blocks, base, top, 63, Math.min(prelim, top) - 12);
    let bottom = Math.min(prelim, top) - 10 - D;
    if (BADLANDS[biome]) bottom = Math.min(bottom, 50);
    if (bottom < -60) bottom = -60;
    let wh = NONE, sd = 0;
    let sec = NaN;
    for (let y = top; y >= bottom; y--) {
      const i = base + (y + 64) * 256;
      const v = blocks[i];
      if (v === AIR) { sd = 0; wh = NONE; continue; }
      if (v === WATER || v === LAVA) { if (wh === NONE) wh = y + 1; sd = 0; continue; }
      sd++;
      if (v !== STONE && v !== DEEPSLATE) continue;
      const floor = sd === 1;
      const under = sd <= 1 + D;
      const dry = wh === NONE || y >= wh - 1;
      const shallow = wh === NONE || y + sd >= wh - 6 - D;
      let r = -1;
      if (floor && biome === B.swamp && y === 62 && this.swamp.sample(wx, 0, wz) >= 0) r = WATER;
      else if (floor && biome === B.wooded_badlands && y >= 97 + 2 * D) {
        r = (sn >= -0.909 && sn <= -0.5454) || (sn >= -0.1818 && sn <= 0.1818) || (sn >= 0.5454 && sn <= 0.909) ? COARSE : (y >= wh ? GRASS : DIRT);
      } else if (BADLANDS[biome]) {
        if (floor) {
          if (y >= 256) r = ORANGE_TC;
          else if (y + sd >= 74 + D) r = (sn >= -0.909 && sn <= -0.5454) || (sn >= -0.1818 && sn <= 0.1818) || (sn >= 0.5454 && sn <= 0.909) ? TC : this.band(y);
          else if (dry) r = RED_SAND;
          else if (D > 0) r = ORANGE_TC;
          else if (shallow) r = WHITE_TC;
          else r = GRAVEL;
        } else if (y + sd >= 63 - D) {
          r = (y >= 63 && !(y + sd >= 74 + D)) ? ORANGE_TC : this.band(y);
        } else if (under && shallow) r = WHITE_TC;
      } else if (floor && dry) {
        r = this.top(biome, y, wh);
      } else if (shallow && under) {
        r = this.under(biome, y, wh);
      } else if (shallow && SANDY[biome]) {
        if (sec !== sec) sec = (this.secondary.sample(wx, 0, wz) + 1) * 0.5;
        if (biome === B.desert ? sd <= 1 + D + sec * 30 : sd <= 1 + D + sec * 6) r = SANDSTONE;
      } else if (floor) {
        if (biome === B.frozen_peaks || biome === B.jagged_peaks) r = -1;
        else if (biome === B.warm_ocean || biome === B.lukewarm_ocean || biome === B.deep_lukewarm_ocean) r = SAND;
        else r = GRAVEL;
      }
      if (r >= 0) blocks[i] = r;
    }
    return top;
  }

  // floor block (dry)
  top(b, y, wh) {
    const wx = this.wx, wz = this.wz, sn = this.sn;
    switch (b) {
      case B.frozen_peaks: {
        if (this.steep) return PACKED_ICE;
        const pi = this.packedIce.sample(wx, 0, wz); if (pi >= 0 && pi <= 0.2) return PACKED_ICE;
        const ic = this.ice.sample(wx, 0, wz); if (ic >= 0 && ic <= 0.025) return ICE;
        return SNOW_BLOCK;
      }
      case B.snowy_slopes: if (this.steep) return -1; return SNOW_BLOCK;
      case B.jagged_peaks: if (this.steep) return -1; return SNOW_BLOCK;
      case B.grove: return SNOW_BLOCK;
      case B.stony_peaks: { const c = this.calcite.sample(wx, 0, wz); return (c >= -0.0125 && c <= 0.0125) ? CALCITE : -1; }
      case B.stony_shore: { const g = this.gravel.sample(wx, 0, wz); return (g >= -0.05 && g <= 0.05) ? GRAVEL : -1; }
      case B.windswept_hills: return sn > 1 / 8.25 ? -1 : GRASS;
      case B.warm_ocean: case B.beach: case B.snowy_beach: case B.desert: return SAND;
      case B.windswept_savanna: return sn > 1.75 / 8.25 ? -1 : sn > -0.5 / 8.25 ? COARSE : GRASS;
      case B.windswept_gravelly_hills: return sn > 2 / 8.25 ? GRAVEL : sn > 1 / 8.25 ? -1 : sn > -1 / 8.25 ? GRASS : GRAVEL;
      case B.old_growth_pine_taiga: case B.old_growth_spruce_taiga: return sn > 1.75 / 8.25 ? COARSE : sn > -0.95 / 8.25 ? PODZOL : GRASS;
      case B.ice_spikes: return SNOW_BLOCK;
      default: return (wh === NONE || y >= wh) ? GRASS : DIRT;
    }
  }

  // under-floor blocks (also shallow underwater floors)
  under(b, y, wh) {
    const wx = this.wx, wz = this.wz, sn = this.sn;
    const above = wh === NONE || y >= wh;
    switch (b) {
      case B.frozen_peaks: {
        if (this.steep) return PACKED_ICE;
        const pi = this.packedIce.sample(wx, 0, wz); if (pi >= -0.5 && pi <= 0.2) return PACKED_ICE;
        const ic = this.ice.sample(wx, 0, wz); if (ic >= -0.0625 && ic <= 0.025) return ICE;
        return above ? SNOW_BLOCK : -1;
      }
      case B.snowy_slopes: if (this.steep) return -1; return above ? SNOW_BLOCK : DIRT;
      case B.jagged_peaks: return -1;
      case B.grove: return above ? POWDER_SNOW : DIRT;
      case B.stony_peaks: return -1;
      case B.stony_shore: { const g = this.gravel.sample(wx, 0, wz); return (g >= -0.05 && g <= 0.05) ? GRAVEL : -1; }
      case B.windswept_hills: return sn > 1 / 8.25 ? -1 : DIRT;
      case B.warm_ocean: case B.beach: case B.snowy_beach: case B.desert: return SAND;
      case B.windswept_savanna: return sn > 1.75 / 8.25 ? -1 : DIRT;
      case B.windswept_gravelly_hills: return sn > 2 / 8.25 ? GRAVEL : sn > 1 / 8.25 ? -1 : sn > -1 / 8.25 ? DIRT : GRAVEL;
      default: return DIRT;
    }
  }
}
