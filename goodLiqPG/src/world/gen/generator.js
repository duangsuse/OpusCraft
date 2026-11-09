// World generator entry point: vanilla 1.18+-style multi-noise overworld.
//   new Generator(seed).generateChunk(cx, cz, blocks) -> { outside, biomes, heightmap }
import { ID, T_SOLID, T_REPLACEABLE, T_FLUID, T_OPAQUE, TYPE_MASK } from '../blocks.js';
import { seedWords, mix, fmix32, posRandom, hashString } from './rng.js';
import { makeNoise } from './noise.js';
import { TerrainNoise, GEN_PARAMS, NY, VEIN_K, CL_N, CL_OFF, CL_FAC, CL_JAG, CL_BIOME } from './terrain.js';
import { BIOMES as BIOME_LIST, B, IS_OCEAN, IS_RIVER, BIOME_COLORS } from './biomes.js';
import { SurfaceBuilder } from './surface.js';
import { Carvers } from './carvers.js';
import { Ores } from './ores.js';
import { Decorator } from './decorate.js';

export const MIN_Y = -64, HEIGHT = 384, SEA_LEVEL = 63;
export const BIOMES = BIOME_LIST;
export { GEN_PARAMS };
export { BIOME_COLORS, B as BIOME_IDS };

const AIR = 0, STONE = ID.stone, DEEPSLATE = ID.deepslate, BEDROCK = ID.bedrock, WATER = ID.water, LAVA = ID.lava;
const LAVA_LEVEL = -55;

const fiddle = (h) => ((h & 1023) / 1024 - 0.5) * 0.9;

export class Generator {
  constructor(seed) {
    const [lo, hi] = seedWords(seed);
    this.seed = seed;
    this.s = mix(mix(0x5eed1234, lo), hi);           // 32-bit master seed
    this.tn = new TerrainNoise(mix(this.s, 1));
    this.P = this.tn.P;                              // 共享：setParams 写这里，tn / carvers / ores / decorator 都读
    this.surface = new SurfaceBuilder(mix(this.s, 2));
    this.carvers = new Carvers(mix(this.s, 3));
    this.ores = new Ores(mix(this.s, 4));
    this.decorator = new Decorator(mix(this.s, 5), this);
    this.tempVar = makeNoise(mix(this.s, 6), 'temperature_variation');
    this.frozenNoise = makeNoise(mix(this.s, 6), 'frozen_temperature');
    this.biomeInfo = makeNoise(mix(this.s, 6), 'biome_info');
    this.zoomSeed = mix(this.s, hashString('biome_zoom'));
    this.dsSeed = mix(this.s, hashString('deepslate'));
    this.brSeed = mix(this.s, hashString('bedrock'));
    // scratch buffers
    this.clim = new Float64Array(49 * CL_N);
    this.prelimG = new Float64Array(49);   // smooth surface estimate at quart points -1..5
    this.wetS = new Uint8Array(256);       // smooth 'under the sea' flag (aquifer-like flooding)
    this.barrier = new Uint8Array(256);    // wet/dry boundary columns: keep stone in caves below sea level
    this.densF = new Float64Array(25 * NY);
    this.densT = new Float64Array(25 * NY);
    this.prelimC = new Float64Array(25);
    this.veinT = new Float64Array(25 * VEIN_K); this.veinR = new Float64Array(25 * VEIN_K);
    this.colVT = new Float64Array(VEIN_K); this.colVR = new Float64Array(VEIN_K);
    this.veinSeed = mix(this.s, hashString('veins'));
    this.colF = new Float64Array(NY);
    this.colT = new Float64Array(NY);
    this.biomeCol = new Uint8Array(256);
    this.topAll = new Int16Array(256);     // highest non-air block (incl. fluids)
    this.topSolid = new Int16Array(256);   // highest solid terrain block
    this.prelim = new Int16Array(256);
    this.wet = new Uint8Array(256);
    this._tmpBlocks = null;
    this._clim1 = new Float64Array(CL_N);
  }

  setParams(o) { Object.assign(this.P, o); }

  // ---- biome lookup ------------------------------------------------------------------------------------
  quartBiome(qx, qz) {
    this.tn.climate(qx * 4, qz * 4, this._clim1, 0, false);
    return this._clim1[CL_BIOME];
  }

  zoomPick(wx, wz, getQ) {
    const ix = wx - 2, iz = wz - 2;
    const qx = ix >> 2, qz = iz >> 2;
    const fx = (ix & 3) / 4, fz = (iz & 3) / 4;
    let best = 1e9, ba = 0, bb = 0;
    for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
      const h = fmix32(mix(mix(this.zoomSeed, qx + a), qz + b));
      const dx = fx - a + fiddle(h), dz = fz - b + fiddle(h >>> 12);
      const d = dx * dx + dz * dz;
      if (d < best) { best = d; ba = a; bb = b; }
    }
    return getQ(qx + ba, qz + bb);
  }

  biomeAt(wx, wy, wz) {
    return this.zoomPick(Math.floor(wx), Math.floor(wz), (qx, qz) => this.quartBiome(qx, qz));
  }

  // Temperature at a position (vanilla height adjustment above y=80 and frozen-ocean modifier).
  temperatureAt(biome, wx, y, wz) {
    const bi = BIOMES[biome];
    let t = bi.temperature;
    if (bi.frozen) {
      const d = this.frozenNoise.sample(wx * 0.05, 0, wz * 0.05) * 7;
      const e = this.biomeInfo.sample(wx * 0.2, 0, wz * 0.2);
      if (d + e < 0.3 && this.biomeInfo.sample(wx * 0.09, 0, wz * 0.09) < 0.8) t = 0.2;
    }
    if (y > 80) t -= (this.tempVar.sample(wx / 8, 0, wz / 8) * 8 + y - 80) * 0.05 / 40;
    return t;
  }

  // ---- chunk generation --------------------------------------------------------------------------------
  generateChunk(cx, cz, blocks) {
    blocks.fill(0);
    const tn = this.tn, clim = this.clim, densF = this.densF, densT = this.densT;
    const x0 = cx * 16, z0 = cz * 16, qx0 = cx * 4 - 1, qz0 = cz * 4 - 1;

    // 1. climate at quart points (7x7: the chunk's corners plus a 1-quart margin for biome zoom / aquifer edges)
    const prelimG = this.prelimG;
    for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) {
      const o = (j * 7 + i) * CL_N, x = (qx0 + i) * 4, z = (qz0 + j) * 4;
      tn.climate(x, z, clim, o, true);
      const jag = tn.jagTerm(x, z, clim[o + CL_JAG]);
      clim[o + CL_JAG] = jag;
      prelimG[j * 7 + i] = -64 + 128 * (1.5 + clim[o + CL_OFF] + jag);
    }
    // 2. density at cell corners (5x5 columns x 49 heights)
    for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) {
      const o = ((j + 1) * 7 + (i + 1)) * CL_N;
      const x = x0 + i * 4, z = z0 + j * 4;
      this.prelimC[j * 5 + i] = prelimG[(j + 1) * 7 + i + 1];
      tn.column(x, z, clim[o + CL_OFF], clim[o + CL_FAC], clim[o + CL_JAG], densF, densT, (j * 5 + i) * NY);
      tn.veinColumn(x, z, this.veinT, this.veinR, (j * 5 + i) * VEIN_K);
    }
    // smooth aquifer flags: wet where the smooth surface is below sea level; barrier near the wet/dry boundary
    const wetAt = (lx, lz) => this.prelimAt(lx, lz) < SEA_LEVEL - 1.5 ? 1 : 0;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const w = wetAt(x, z);
      this.wetS[z * 16 + x] = w;
      this.barrier[z * 16 + x] = (wetAt(x - 3, z) !== w || wetAt(x + 3, z) !== w || wetAt(x, z - 3) !== w || wetAt(x, z + 3) !== w) ? 1 : 0;
    }
    // 3. per-column biomes (fuzzy zoom of quart biomes)
    const biomeCol = this.biomeCol;
    const getQ = (qx, qz) => clim[((qz - qz0) * 7 + (qx - qx0)) * CL_N + CL_BIOME];
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) biomeCol[z * 16 + x] = this.zoomPick(x0 + x, z0 + z, getQ);

    // 4. interpolate density and fill blocks
    this.fill(blocks, x0, z0);

    // 5. surface rules
    const topAll = this.topAll, topSolid = this.topSolid, prelim = this.prelim;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = z * 16 + x;
      const zN = Math.max(z - 1, 0), zS = Math.min(z + 1, 15), xW = Math.max(x - 1, 0), xE = Math.min(x + 1, 15);
      const steep = topAll[zS * 16 + x] >= topAll[zN * 16 + x] + 4 || topAll[z * 16 + xW] >= topAll[z * 16 + xE] + 4;
      const t = this.surface.column(blocks, x, z, x0 + x, z0 + z, biomeCol[c], prelim[c], topAll[c], steep);
      if (t > topAll[c]) topAll[c] = t;
    }

    const outside = [];
    // 6. carvers (ravines + worm caves), 7. ores, 8. decoration
    this.carvers.carve(this, cx, cz, blocks);
    this.ores.place(this, cx, cz, blocks);
    this.recomputeHeights(blocks);
    this.decorator.decorate(cx, cz, blocks, outside);
    // 9. freeze top layer (ice + snow)
    this.freeze(blocks, x0, z0);

    const heightmap = new Int16Array(256);
    for (let c = 0; c < 256; c++) {
      let y = 319;
      while (y >= -64 && blocks[c + (y + 64) * 256] === 0) y--;
      heightmap[c] = y;
    }
    return { outside: Int32Array.from(outside), biomes: Uint8Array.from(biomeCol), heightmap };
  }

  // bilinear smooth surface at chunk-local block coords (valid for -4..20)
  prelimAt(lx, lz) {
    const gx = (lx + 4) / 4, gz = (lz + 4) / 4;
    const i = Math.min(5, Math.max(0, Math.floor(gx))), j = Math.min(5, Math.max(0, Math.floor(gz)));
    const fx = gx - i, fz = gz - j, g = this.prelimG;
    const a = g[j * 7 + i], b = g[j * 7 + i + 1], c = g[j * 7 + i + 7], d = g[j * 7 + i + 8];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  // fluid for carved/cave air below sea level: 0 air, 1 water, 2 keep solid (barrier)
  caveFluid(c) {
    if (this.wet[c]) return 1;
    if (this.barrier[c]) return 2;
    return this.wetS[c] ? 1 : 0;
  }

  fill(blocks, x0, z0) {
    const densF = this.densF, densT = this.densT, colF = this.colF, colT = this.colT, pc = this.prelimC;
    const topAll = this.topAll, topSolid = this.topSolid, prelim = this.prelim, wetA = this.wet;
    const dsSeed = this.dsSeed, brSeed = this.brSeed;
    for (let z = 0; z < 16; z++) {
      const cj = z >> 2, fz = (z & 3) * 0.25;
      for (let x = 0; x < 16; x++) {
        const ci = x >> 2, fx = (x & 3) * 0.25;
        const c00 = (cj * 5 + ci) * NY, c10 = c00 + NY, c01 = c00 + 5 * NY, c11 = c01 + NY;
        const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
        let maxK = -1;
        for (let k = 0; k < NY; k++) {
          const f = densF[c00 + k] * w00 + densF[c10 + k] * w10 + densF[c01 + k] * w01 + densF[c11 + k] * w11;
          colF[k] = f;
          colT[k] = densT[c00 + k] * w00 + densT[c10 + k] * w10 + densT[c01 + k] * w01 + densT[c11 + k] * w11;
          if (f > 0) maxK = k;
        }
        const vT = this.veinT, vR = this.veinR, colVT = this.colVT, colVR = this.colVR;
        const v00 = (cj * 5 + ci) * VEIN_K, v10 = v00 + VEIN_K, v01 = v00 + 5 * VEIN_K, v11 = v01 + VEIN_K;
        for (let k = 0; k < VEIN_K; k++) {
          colVT[k] = vT[v00 + k] * w00 + vT[v10 + k] * w10 + vT[v01 + k] * w01 + vT[v11 + k] * w11;
          colVR[k] = vR[v00 + k] * w00 + vR[v10 + k] * w10 + vR[v01 + k] * w01 + vR[v11 + k] * w11;
        }
        const pi = (cj * 5 + ci);
        prelim[z * 16 + x] = Math.floor(pc[pi] * w00 + pc[pi + 1] * w10 + pc[pi + 5] * w01 + pc[pi + 6] * w11);
        const base = z * 16 + x, wx = x0 + x, wz = z0 + z;
        let top = -65, solidTop = -65, wet = 0;
        const barrierC = this.barrier[base], wetSC = this.wetS[base];
        const kStart = Math.max(maxK, 15); // corner 15 -> y=56; need water fill up to sea level
        for (let k = Math.min(kStart, NY - 2); k >= 0; k--) {
          const a = colF[k], b = colF[k + 1], ta = colT[k], tb = colT[k + 1];
          const yb = -64 + k * 8;
          if (a <= 0 && b <= 0 && yb >= SEA_LEVEL) continue;
          const da = (b - a) * 0.125, dta = (tb - ta) * 0.125;
          for (let dy = 7; dy >= 0; dy--) {
            const y = yb + dy;
            const d = a + da * dy;
            const idx = base + (y + 64) * 256;
            if (d > 0) {
              let v = STONE;
              if (y < 8) {
                if (y <= 0 || posRandom(dsSeed, wx, y, wz) < (8 - y) * 0.125) v = DEEPSLATE;
                if (y <= -60 && (y === -64 || posRandom(brSeed, wx, y, wz) < (-59 - y) * 0.2)) v = BEDROCK;
              }
              if (y >= -60 && y <= 50 && v !== BEDROCK) {
                const vt = colVT[k] + (colVT[k + 1] - colVT[k]) * dy * 0.125;
                const copper = vt > 0, e = vt > 0 ? vt : -vt;
                const vmax = copper ? 50 : -8, vmin = copper ? 0 : -60;
                if (y >= vmin && y <= vmax) {
                  const l = Math.min(vmax - y, y - vmin);
                  const f = l >= 20 ? 0 : -0.2 + l * 0.01;
                  if (e + f >= 0.4) {
                    const r1 = posRandom(this.veinSeed, wx, y, wz);
                    if (r1 <= 0.7 && colVR[k] + (colVR[k + 1] - colVR[k]) * dy * 0.125 < 0) {
                      const g = e <= 0.4 ? 0.1 : e >= 0.6 ? 0.3 : 0.1 + (e - 0.4);
                      const r2 = posRandom(this.veinSeed ^ 0x5bd1e995, wx, y, wz);
                      if (r2 < g && this.tn.veinGap.sample(wx, y, wz) > -0.3) v = copper ? (v === DEEPSLATE ? ID.deepslate_copper_ore : ID.copper_ore) : ID.deepslate_iron_ore;
                      else v = copper ? ID.granite : ID.tuff;
                    }
                  }
                }
              }
              blocks[idx] = v;
              if (top < y) top = y;
              if (solidTop < y) solidTop = y;
            } else if (y < SEA_LEVEL) {
              const t = ta + dta * dy;
              if (t <= 0 && y > LAVA_LEVEL) {
                blocks[idx] = WATER;
                if (top < y) { top = y; wet = 1; }
              } else {
                // cave air below sea level: aquifer-like fill
                if (y <= LAVA_LEVEL) blocks[idx] = LAVA;
                else if (wet) blocks[idx] = WATER;
                else if (barrierC) {
                  let v = STONE;
                  if (y < 8 && (y <= 0 || posRandom(dsSeed, wx, y, wz) < (8 - y) * 0.125)) v = DEEPSLATE;
                  blocks[idx] = v;
                } else if (wetSC) blocks[idx] = WATER;
                if (top < y && blocks[idx] !== 0) { top = y; if (blocks[idx] !== WATER) solidTop = y; }
              }
            }
          }
        }
        topAll[base] = top; topSolid[base] = solidTop; wetA[base] = wet;
      }
    }
  }

  recomputeHeights(blocks) {
    const topAll = this.topAll, topSolid = this.topSolid;
    for (let c = 0; c < 256; c++) {
      let y = Math.max(topAll[c] + 8, 64);
      if (y > 319) y = 319;
      while (y >= -64 && blocks[c + (y + 64) * 256] === 0) y--;
      topAll[c] = y;
      let s = y;
      while (s >= -64) {
        const t = blocks[c + (s + 64) * 256] & TYPE_MASK;
        if (T_SOLID[t] && !T_FLUID[t]) break;
        s--;
      }
      topSolid[c] = s;
    }
  }

  freeze(blocks, x0, z0) {
    const biomeCol = this.biomeCol;
    for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
      const c = z * 16 + x;
      const b = biomeCol[c];
      const bi = BIOMES[b];
      let y = 319;
      while (y >= -64 && blocks[c + (y + 64) * 256] === 0) y--;
      if (y < -64 || y >= 319) continue;
      if (bi.temperature >= 0.15 && y <= 80) continue;
      const temp = this.temperatureAt(b, x0 + x, y + 1, z0 + z);
      if (temp >= 0.15) continue;
      const idx = c + (y + 64) * 256;
      const v = blocks[idx], t = v & TYPE_MASK;
      if (t === WATER) { if ((v >>> 12) === 0) blocks[idx] = ID.ice; continue; }
      if (t === ID.ice || t === ID.packed_ice || t === LAVA || t === ID.snow) continue;
      if (T_OPAQUE[t] || t === ID.oak_leaves || t === ID.spruce_leaves || t === ID.birch_leaves || t === ID.dark_oak_leaves ||
        t === ID.jungle_leaves || t === ID.acacia_leaves || t === ID.cherry_leaves) {
        blocks[idx + 256] = ID.snow;
      }
    }
  }

  // ---- spawn search ------------------------------------------------------------------------------------
  findSpawn() {
    if (this._spawn) return this._spawn.slice();
    if (!this._tmpBlocks) this._tmpBlocks = new Uint16Array(16 * 16 * HEIGHT);
    const buf = this._tmpBlocks;
    const good = (t) => t === ID.grass_block || t === ID.sand || t === ID.snow_block || t === ID.podzol || t === ID.coarse_dirt || t === ID.dirt || t === ID.red_sand;
    const at = (c, y) => buf[c + (y + 64) * 256] & TYPE_MASK;
    let fallback = null, fbd = 1e18;
    // spiral over chunks near the origin; prefer dry, flat-ish land a little above sea level
    for (let r = 0; r <= 24; r++) {
      let best = null, bd = 1e18;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const qb = this.biomeAt(dx * 16 + 8, 64, dz * 16 + 8);
        if (IS_OCEAN[qb] || IS_RIVER[qb]) continue;
        this.generateChunk(dx, dz, buf);
        for (let z = 2; z < 14; z++) for (let x = 2; x < 14; x++) {
          const c = z * 16 + x;
          if (IS_OCEAN[this.biomeCol[c]] || IS_RIVER[this.biomeCol[c]]) continue;
          let y = 318;
          while (y >= -64 && buf[c + (y + 64) * 256] === 0) y--;
          let t = at(c, y);
          if (T_REPLACEABLE[t] && !T_FLUID[t]) { y--; t = at(c, y); }
          if (!good(t) || y < SEA_LEVEL) continue;
          const a1 = at(c, y + 1), a2 = at(c, y + 2);
          if (T_SOLID[a1] || T_SOLID[a2] || T_FLUID[a1] || T_FLUID[a2]) continue;
          const wx = dx * 16 + x, wz = dz * 16 + z;
          const d = wx * wx + wz * wz;
          if (d < fbd) { fbd = d; fallback = [wx + 0.5, y + 1, wz + 0.5]; }
          // quality: not next to water, not on a slope, a few blocks above sea level, open sky
          if (y < SEA_LEVEL + 2) continue;
          let ok = true;
          for (let oz = -2; oz <= 2 && ok; oz++) for (let ox = -2; ox <= 2; ox++) {
            const cc = (z + oz) * 16 + x + ox;
            let yy = y + 3;
            while (yy > y - 4 && buf[cc + (yy + 64) * 256] === 0) yy--;
            const tt = at(cc, yy);
            if (T_FLUID[tt] || Math.abs(yy - y) > 1 && !T_REPLACEABLE[tt]) { ok = false; break; }
          }
          if (!ok) continue;
          let sky = true;
          for (let yy = y + 3; yy < y + 24 && yy < 319; yy++) if (buf[c + (yy + 64) * 256] !== 0) { sky = false; break; }
          if (!sky) continue;
          if (d < bd) { bd = d; best = [wx + 0.5, y + 1, wz + 0.5]; }
        }
      }
      if (best) { this._spawn = best; return best.slice(); }
    }
    this._spawn = fallback || [0.5, 100, 0.5];
    return this._spawn.slice();
  }
}
