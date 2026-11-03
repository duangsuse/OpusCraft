// Fase 8.2 (biomas del Nether): el terreno base del Nether, portado de la 26.3.
// - Densidad (noise_settings/nether.json): old_blended_noise con las rampas de abajo (sólido bajo y = −8,
//   de ahí a y = 24 se va mezclando) y de arriba (de y = 104 a 128 vuelve a sólido), por 0,64,
//   interpolada en celdas de 4×8×4 bloques. Lo sólido es rocanegra; el aire bajo y = 32, lava.
// - Biomas (MultiNoiseBiomeSourceParameterList, preset nether): temperatura y vegetación (dos NormalNoise
//   sin y: en la 26.3 los biomas del Nether son de columna) y el bioma más cercano de los cinco puntos:
//   desiertos (0, 0), valle de almas (0, −0,5), bosque carmesí (0,4, 0), bosque distorsionado (0, 0,5;
//   desfase 0,375) y deltas de basalto (−0,5, 0; desfase 0,175). El bioma de cada bloque sale del de las
//   cuatro esquinas de su celda de 4×4 con el «zoom» desplazado de BiomeManager (bordes irregulares).
// - Superficie (material_rule/nether.json): lecho de roca abajo y arriba, basalto, piedra negra y grava en
//   las deltas, arena y tierra de alma en el valle, necelio y bloques de verrugas en los bosques, arena de
//   alma y grava junto al mar de lava en los desiertos y lava en los «huecos» del suelo bajo y = 32, con la
//   profundidad de piedra (por encima y por debajo) y la de superficie de MaterialSystem.
import { hash2, hash3, hashToFloat } from '../constants';
import {
  AIR, BEDROCK, NETHERRACK, LAVA, SOUL_SAND, SOUL_SOIL, GRAVEL, BASALT, BLACKSTONE, CRIMSON_NYLIUM, WARPED_NYLIUM,
  NETHER_WART_BLOCK, WARPED_WART_BLOCK,
} from '../blocks';
import { BlendedNoise, NoiseRandom, normalNoise, type NoiseStack } from './javaNoise';
import { netherCaves, carveEllipsoid, type CarveEllipsoid } from './netherCarver';
import {
  BIOME_NETHER_WASTES, BIOME_SOUL_SAND_VALLEY, BIOME_CRIMSON_FOREST, BIOME_WARPED_FOREST, BIOME_BASALT_DELTAS,
} from './biomeIds';

/** Alto del Nether (de y = 0 a y = 127). */
export const NETHER_HEIGHT = 128;
/** Nivel del mar de lava: la lava llena el aire con y < NETHER_SEA_LEVEL. */
export const NETHER_SEA_LEVEL = 32;

/** Puntos de los biomas: [bioma, temperatura, vegetación, desfase]. */
const BIOME_POINTS: readonly (readonly [number, number, number, number])[] = [
  [BIOME_NETHER_WASTES, 0, 0, 0],
  [BIOME_SOUL_SAND_VALLEY, 0, -0.5, 0],
  [BIOME_CRIMSON_FOREST, 0.4, 0, 0],
  [BIOME_WARPED_FOREST, 0, 0.5, 0.375],
  [BIOME_BASALT_DELTAS, -0.5, 0, 0.175],
];

/** Índice de un bloque en un chunk base (16 × 16 × 128). */
export const baseIndex = (lx: number, y: number, lz: number) => (y << 8) | (lz << 4) | lx;
export const BASE_VOLUME = 16 * 16 * NETHER_HEIGHT;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export class NetherTerrain {
  private readonly terrain: BlendedNoise;
  private readonly temperature: NoiseStack;
  private readonly vegetation: NoiseStack;
  private readonly surfaceNoise: NoiseStack;
  private readonly patch: NoiseStack;
  private readonly stateSelector: NoiseStack;
  private readonly netherrackNoise: NoiseStack;
  private readonly wartNoise: NoiseStack;
  private readonly soulSandLayer: NoiseStack;
  private readonly gravelLayer: NoiseStack;
  private readonly quartCache = new Map<number, number>();
  private readonly caveCache = new Map<number, CarveEllipsoid[]>();

  constructor(readonly seed: number) {
    const r = new NoiseRandom((seed ^ 0x6e7e4) | 0);
    this.terrain = new BlendedNoise(r.fork('terrain'), 0.25, 0.375, 80, 60, 8);
    // Parámetros de data/minecraft/worldgen/noise (26.3).
    this.temperature = normalNoise({ baseOctave: -7, baseAmplitude: 0.9494731054427981, octaveCount: 2 }, r.fork('nether/temperature'));
    this.vegetation = normalNoise({ baseOctave: -7, baseAmplitude: 0.9494731054427981, octaveCount: 2 }, r.fork('nether/vegetation'));
    this.surfaceNoise = normalNoise({ baseOctave: -6, baseAmplitude: 0.9381732587751008, octaveCount: 3 }, r.fork('surface'));
    this.patch = normalNoise({
      baseOctave: -5, baseAmplitude: 1.637127519350388, octaveCount: 6, amplitudeModifiers: [1, 0, 0, 0, 0, 0.013333333333333334],
    }, r.fork('patch'));
    this.stateSelector = normalNoise({ baseOctave: -4, baseAmplitude: 0.955388882960065, octaveCount: 1 }, r.fork('nether_state_selector'));
    this.netherrackNoise = normalNoise({
      baseOctave: -3, baseAmplitude: 1.4659491761370222, octaveCount: 4, amplitudeModifiers: [1, 0, 0, 0.35],
    }, r.fork('netherrack'));
    this.wartNoise = normalNoise({
      baseOctave: -3, baseAmplitude: 1.3827102115748344, octaveCount: 4, amplitudeModifiers: [1, 0, 0, 0.9],
    }, r.fork('nether_wart'));
    const layerMods = [1, 1, 1, 1, 0, 0, 0, 0, 0.013333333333333334];
    this.soulSandLayer = normalNoise({ baseOctave: -8, baseAmplitude: 1.0569606747151457, octaveCount: 9, amplitudeModifiers: layerMods }, r.fork('soul_sand_layer'));
    this.gravelLayer = normalNoise({ baseOctave: -8, baseAmplitude: 1.0569606747151457, octaveCount: 9, amplitudeModifiers: layerMods }, r.fork('gravel_layer'));
  }

  // ------------------------------------------------------------------ biomas

  /** Bioma de la celda de 4×4 (qx, qz): el punto más cercano en (temperatura, vegetación) más su desfase. */
  biomeQuart(qx: number, qz: number): number {
    const k = (qx & 0xffff) * 65536 + (qz & 0xffff);
    const c = this.quartCache.get(k);
    if (c !== undefined) return c;
    // El ruido «noise» con escala xz 0,25 se evalúa en el bloque de la celda (4·q): en la coordenada q.
    const t = this.temperature.get(qx, 0, qz), v = this.vegetation.get(qx, 0, qz);
    let best = BIOME_NETHER_WASTES, bestD = Infinity;
    for (const [b, bt, bv, off] of BIOME_POINTS) {
      const d = (t - bt) ** 2 + (v - bv) ** 2 + off * off;
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    if (this.quartCache.size > 65536) this.quartCache.clear();
    this.quartCache.set(k, best);
    return best;
  }

  /**
   * Bioma del bloque (x, z): el de la esquina más cercana de su celda con la distancia desplazada al azar
   * (getFiddledDistance de BiomeManager), así que los bordes no siguen la rejilla de 4×4.
   */
  biomeAt(x: number, z: number): number {
    const ax = x - 2, az = z - 2;
    const px = ax >> 2, pz = az >> 2;
    const fx = (ax & 3) / 4, fz = (az & 3) / 4;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < 4; i++) {
      const cx = px + (i >> 1), cz = pz + (i & 1);
      const dx = fx - (i >> 1), dz = fz - (i & 1);
      const h = hash2(cx, cz, this.seed ^ 0x3b1f2);
      const jx = (((h & 1023) / 1024) - 0.5) * 0.9, jz = ((((h >>> 10) & 1023) / 1024) - 0.5) * 0.9;
      const d = (dx + jx) ** 2 + (dz + jz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return this.biomeQuart(px + (best >> 1), pz + (best & 1));
  }

  // ------------------------------------------------------------------ densidad

  /** Densidad sin interpolar en un bloque (antes de la compresión final, que no cambia el signo). */
  private density(x: number, y: number, z: number): number {
    // Desde y = 128 la rampa de arriba ya no mira el ruido.
    const base = y >= 128 ? 0 : this.terrain.get(x, y, z);
    const top = 0.9375 + clamp01((128 - y) / 24) * (base - 0.9375);
    return 0.64 * (2.5 + clamp01((y + 8) / 32) * (top - 2.5));
  }

  /** Rocanegra, lava y aire del chunk (cx, cz), interpolando la densidad en celdas de 4×8×4. */
  private fill(cx: number, cz: number, out: Uint16Array): void {
    const x0 = cx * 16, z0 = cz * 16;
    // Esquinas de las celdas: 5 × 17 × 5.
    const corner = new Float64Array(5 * 17 * 5);
    for (let i = 0; i < 5; i++) {
      for (let k = 0; k < 5; k++) {
        for (let j = 0; j < 17; j++) corner[(i * 5 + k) * 17 + j] = this.density(x0 + i * 4, j * 8, z0 + k * 4);
      }
    }
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 4; k++) {
        for (let j = 0; j < 16; j++) {
          const c = (a: number, b: number, d: number) => corner[((i + a) * 5 + (k + d)) * 17 + j + b];
          const c000 = c(0, 0, 0), c100 = c(1, 0, 0), c010 = c(0, 1, 0), c110 = c(1, 1, 0);
          const c001 = c(0, 0, 1), c101 = c(1, 0, 1), c011 = c(0, 1, 1), c111 = c(1, 1, 1);
          for (let dy = 0; dy < 8; dy++) {
            const ty = dy / 8, y = j * 8 + dy;
            for (let dz = 0; dz < 4; dz++) {
              const tz = dz / 4;
              for (let dx = 0; dx < 4; dx++) {
                const tx = dx / 4;
                const a0 = c000 + tx * (c100 - c000), a1 = c010 + tx * (c110 - c010);
                const b0 = c001 + tx * (c101 - c001), b1 = c011 + tx * (c111 - c011);
                const lo = a0 + ty * (a1 - a0), hi = b0 + ty * (b1 - b0);
                const d = lo + tz * (hi - lo);
                out[baseIndex(i * 4 + dx, y, k * 4 + dz)] = d > 0 ? NETHERRACK : y < NETHER_SEA_LEVEL ? LAVA : AIR;
              }
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ superficie

  /** Profundidad de superficie (getSurfaceDepth de MaterialSystem). */
  private surfaceDepth(x: number, z: number): number {
    return Math.trunc(this.surfaceNoise.get(x, 0, z) * 2.75 + 3 + hashToFloat(hash2(x, z, this.seed ^ 0x5d7)) * 0.25);
  }

  /** Reglas de superficie del Nether sobre la columna ya rellena (buildSurface de MaterialSystem). */
  private surface(cx: number, cz: number, out: Uint16Array): void {
    const x0 = cx * 16, z0 = cz * 16;
    const isStone = (id: number) => id !== AIR && id !== LAVA;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const x = x0 + lx, z = z0 + lz;
        const biome = this.biomeAt(x, z);
        const sd = this.surfaceDepth(x, z);
        const hole = sd <= 0;
        // Ruidos de la columna (sólo los que puede usar su bioma).
        let patch = 0, selector = 0, rack = 0, wart = 0, soul = 0, gravel = 0;
        if (biome === BIOME_BASALT_DELTAS || biome === BIOME_SOUL_SAND_VALLEY) {
          patch = this.patch.get(x, 0, z);
          selector = this.stateSelector.get(x, 0, z);
        } else if (biome === BIOME_WARPED_FOREST || biome === BIOME_CRIMSON_FOREST) {
          rack = this.netherrackNoise.get(x, 0, z);
          wart = this.wartNoise.get(x, 0, z);
        } else {
          soul = this.soulSandLayer.get(x, 0, z);
          gravel = this.gravelLayer.get(x, 0, z);
        }
        let top = NETHER_HEIGHT - 1;
        while (top > 0 && out[baseIndex(lx, top, lz)] === AIR) top--;
        let stoneAbove = 0;
        let nextCeiling = Infinity;
        for (let y = top; y >= 0; y--) {
          const old = out[baseIndex(lx, y, lz)];
          if (old === AIR) {
            stoneAbove = 0;
            continue;
          }
          if (old === LAVA) continue;
          if (nextCeiling >= y) {
            nextCeiling = -Infinity;
            for (let ly = y - 1; ly >= -1; ly--) {
              if (ly < 0 || !isStone(out[baseIndex(lx, ly, lz)])) {
                nextCeiling = ly + 1;
                break;
              }
            }
          }
          stoneAbove++;
          const stoneBelow = y - nextCeiling + 1;
          const onFloor = stoneAbove <= 1;
          const underFloor = stoneAbove <= 1 + sd;
          const underCeiling = stoneBelow <= 1 + sd;
          const yd = y + stoneAbove;
          let id = -1;
          // Lecho de roca: abajo, seguro en y = 0 y cada vez menos hasta y = 5; arriba, de y = 122 a 127.
          if (y <= 0 || (y < 5 && hashToFloat(hash3(x, y, z, this.seed ^ 0xbed0)) < 1 - y / 5)) id = BEDROCK;
          else if (y >= 127 || (y > 122 && !(hashToFloat(hash3(x, y, z, this.seed ^ 0xbed1)) < (127 - y) / 5))) id = BEDROCK;
          else if (y >= 122) id = NETHERRACK;
          else if (biome === BIOME_BASALT_DELTAS && (underCeiling || underFloor)) {
            if (underCeiling) id = BASALT;
            else id = patch >= -0.012 && yd >= 30 && yd < 35 ? GRAVEL : selector >= 0 ? BASALT : BLACKSTONE;
          } else if (biome === BIOME_SOUL_SAND_VALLEY && (underCeiling || underFloor)) {
            if (underCeiling) id = selector >= 0 ? SOUL_SAND : SOUL_SOIL;
            else id = patch >= -0.012 && yd >= 30 && yd < 35 ? GRAVEL : selector >= 0 ? SOUL_SAND : SOUL_SOIL;
          }
          if (id < 0 && onFloor) {
            if (y < NETHER_SEA_LEVEL && hole) id = LAVA;
            else if ((biome === BIOME_WARPED_FOREST || biome === BIOME_CRIMSON_FOREST) && !(rack >= 0.54) && y >= 31) {
              const warped = biome === BIOME_WARPED_FOREST;
              id = wart >= 1.17 ? (warped ? WARPED_WART_BLOCK : NETHER_WART_BLOCK) : warped ? WARPED_NYLIUM : CRIMSON_NYLIUM;
            }
          }
          if (id < 0 && biome === BIOME_NETHER_WASTES) {
            if (underFloor && soul >= -0.012) id = !hole && yd >= 30 && yd < 35 ? SOUL_SAND : NETHERRACK;
            else if (onFloor && y >= 31 && yd < 35 && gravel >= -0.012 && (y >= 32 || !hole)) id = GRAVEL;
          }
          if (id >= 0 && id !== old) out[baseIndex(lx, y, lz)] = id;
        }
      }
    }
  }

  /** Túneles que salen de cada chunk (se reutilizan: cada uno llega a los chunks de hasta 8 de distancia). */
  private caves(sx: number, sz: number): CarveEllipsoid[] {
    const k = (sx & 0xffff) * 65536 + (sz & 0xffff);
    let c = this.caveCache.get(k);
    if (!c) {
      if (this.caveCache.size > 4096) this.caveCache.clear();
      c = netherCaves(this.seed, sx, sz);
      this.caveCache.set(k, c);
    }
    return c;
  }

  /** Excava las cuevas de los chunks de hasta 8 de distancia (después de la superficie, como en Java). */
  private carve(cx: number, cz: number, out: Uint16Array): void {
    const set = (lx: number, y: number, lz: number) => {
      const i = baseIndex(lx, y, lz);
      if (out[i] !== BEDROCK) out[i] = y < NETHER_SEA_LEVEL ? LAVA : AIR;
    };
    for (let dz = -8; dz <= 8; dz++) {
      for (let dx = -8; dx <= 8; dx++) {
        for (const e of this.caves(cx + dx, cz + dz)) carveEllipsoid(e, cx, cz, 1, 120, set);
      }
    }
  }

  /** Chunk base (sin decoración): densidad, lava, superficie y cuevas. */
  baseChunk(cx: number, cz: number): Uint16Array {
    const out = new Uint16Array(BASE_VOLUME);
    this.fill(cx, cz, out);
    this.surface(cx, cz, out);
    this.carve(cx, cz, out);
    return out;
  }
}
