// Cuevas del mundo normal como en Java 26.3 (portadas de worldgen/density_function/overworld/caves, del
// final_density del overworld, de Aquifer.NoiseBasedAquifer y de CaveWorldCarver/CanyonWorldCarver):
//
// - Cuevas de ruido: «queso» (cavernas enormes con cave_cheese y las capas de cave_layer), espaguetis 2D (túneles
//   anchos que siguen una altura) y 3D (los de las entradas, con su rareza), su rugosidad, los fideos (túneles
//   finos que se cruzan) y los pilares de las cavernas. Cerca de la superficie sólo abren las entradas. Se evalúan
//   en la misma rejilla de 4 × 8 × 4 bloques que Java y se interpolan.
// - Acuífero: cada celda de 16 × 12 × 16 tiene su centro al azar y su nivel de fluido (lleno hasta el del mar,
//   a medias con un nivel propio o seco, según el ruido de inundación y lo hondo que está), con lava en los
//   profundos (ruido de lava) y por debajo de y = −54; entre dos niveles distintos queda una barrera de roca.
// - Excavadores: cuevas de gusano (cave y cave_extra_underground: túneles que serpentean y se parten, con salas)
//   y barrancos (canyon), desde los chunks de hasta 8 de distancia; lo que excavan pasa también por el acuífero.
//
// La matemática y los parámetros son los de Java; lo distinto es el terreno (el nuestro) y el azar (a partir de
// la semilla del mundo), así que las cuevas son como las de Java aunque los mundos no sean los mismos. El
// «sloped_cheese» de Java (lo hondo que se está bajo el terreno) sale de la altura de nuestra superficie.
import { MIN_Y, MAX_Y, hash2, hash3 } from '../constants';
import { AIR, WATER, LAVA } from '../blocks';
import { NoiseRandom, normalNoise, type NoiseStack, type NormalNoiseParams } from './javaNoise';

/** Lo que el generador sabe de una columna: la superficie tras el terreno y la del terreno «preliminar». */
export interface CaveHost {
  /** y del bloque sólido más alto del terreno (sin cuevas). */
  topAt(x: number, z: number): number;
  /** Superficie preliminar (la altura base del terreno), para el acuífero. */
  preliminarySurface(x: number, z: number): number;
  /** Lo montañoso que es (0..1): hace de la erosión baja de Java para la exclusión del acuífero. */
  mountainAt(x: number, z: number): number;
}

// ------------------------------------------------------------------ ruidos (worldgen/noise de 26.3)

const P = (baseOctave: number, baseAmplitude = 0.955388882960065, octaveCount = 1, amplitudeModifiers?: number[]): NormalNoiseParams =>
  ({ baseOctave, baseAmplitude, octaveCount, ...(amplitudeModifiers ? { amplitudeModifiers } : {}) });

const NOISES = {
  cave_cheese: P(-8, 0.8361300524356068, 9, [0.5, 1, 2, 1, 2, 1, 0, 2, 0]),
  cave_entrance: P(-7, 0.8500634887071167, 3, [0.4, 0.5, 1]),
  cave_layer: P(-8),
  noodle: P(-8), noodle_thickness: P(-8), noodle_ridge_a: P(-7), noodle_ridge_b: P(-7),
  pillar: P(-7, 0.9494731054427981, 2), pillar_rareness: P(-8), pillar_thickness: P(-8),
  spaghetti_2d: P(-7), spaghetti_2d_elevation: P(-8), spaghetti_2d_modulator: P(-11), spaghetti_2d_thickness: P(-11),
  spaghetti_3d_1: P(-7), spaghetti_3d_2: P(-7), spaghetti_3d_rarity: P(-11), spaghetti_3d_thickness: P(-8),
  spaghetti_roughness: P(-5), spaghetti_roughness_modulator: P(-8),
  aquifer_barrier: P(-3), aquifer_fluid_level_floodedness: P(-7), aquifer_fluid_level_spread: P(-5), aquifer_lava: P(-1),
} as const;
type NoiseKey = keyof typeof NOISES;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (t: number, a: number, b: number) => a + t * (b - a);
/** gradient de las funciones de densidad: lineal y fijo fuera de [desde, hasta]. */
const gradient = (y: number, y0: number, v0: number, y1: number, v1: number) => v0 + (clamp(y, y0, y1) - y0) * ((v1 - v0) / (y1 - y0));
/** squeeze: x/2 − x³/24 tras acotar a [−1, 1]. */
const squeeze = (v: number) => {
  const x = clamp(v, -1, 1);
  return x / 2 - (x * x * x) / 24;
};

/** Rejilla de Java (NoiseChunk): celdas de 4 bloques en horizontal y 8 en vertical, desde y = −64. */
const CELL_XZ = 4;
const CELL_Y = 8;
/** Componentes que se interpolan por celda. */
const COMPONENTS = 8;
const [C_ENTR, C_CHEESE, C_SPAG, C_PILLAR, C_TOGGLE, C_THICK, C_RIDGE_A, C_RIDGE_B] = [0, 1, 2, 3, 4, 5, 6, 7];

/** Lo hondo que hay que estar bajo la superficie para el «sloped_cheese» de Java (≈ 4 × factor / 128 por bloque). */
const SLOPE_PER_BLOCK = 0.15;

// ------------------------------------------------------------------ acuífero

/** Nivel del lago de lava global y del mar (NoiseBasedChunkGenerator.createFluidPicker). */
const LAVA_LEVEL = -54;
const SEA_LEVEL = 63;
/** DimensionType.WAY_BELOW_MIN_Y: sin fluido. */
const NO_FLUID = -2032;

interface FluidStatus {
  level: number;
  lava: boolean;
}
interface AquiferCell {
  gx: number;
  gy: number;
  gz: number;
  x: number;
  y: number;
  z: number;
  status: FluidStatus | null;
}
const GLOBAL_LAVA: FluidStatus = { level: LAVA_LEVEL, lava: true };
const GLOBAL_SEA: FluidStatus = { level: SEA_LEVEL, lava: false };
const globalFluid = (y: number): FluidStatus => (y < Math.min(LAVA_LEVEL, SEA_LEVEL) ? GLOBAL_LAVA : GLOBAL_SEA);
/** Bloque de un estado de fluido a la altura y (el fluido por debajo de su nivel, aire encima). */
const fluidAt = (s: FluidStatus, y: number): number => (y < s.level ? (s.lava ? LAVA : WATER) : AIR);
const similarity = (d1: number, d2: number) => 1 - (d2 - d1) / 25;
const SURFACE_OFFSETS: readonly [number, number][] = [
  [0, 0], [-2, -1], [-1, -1], [0, -1], [1, -1], [-3, 0], [-2, 0], [-1, 0], [1, 0], [-2, 1], [-1, 1], [0, 1], [1, 1],
];

// ------------------------------------------------------------------ excavadores (worldgen/carver de 26.3)

interface CaveCarverConfig {
  kind: 'cave';
  probability: number;
  yMin: number;
  yMax: number;
}
interface CanyonCarverConfig {
  kind: 'canyon';
  probability: number;
  yMin: number;
  yMax: number;
}
const CARVERS: readonly (CaveCarverConfig | CanyonCarverConfig)[] = [
  { kind: 'cave', probability: 0.15, yMin: MIN_Y + 8, yMax: 180 },
  { kind: 'cave', probability: 0.07, yMin: MIN_Y + 8, yMax: 47 },
  { kind: 'canyon', probability: 0.01, yMin: 10, yMax: 67 },
];
/** getRange de WorldCarver (4 chunks: la distancia de un túnel) y el alcance que se mira al generar (8). */
const CARVER_RANGE = 4;
const CARVE_SOURCES = 8;
const MAX_TUNNEL = 16 * (CARVER_RANGE * 2 - 1);
/** Los 7 bloques de arriba del mundo no se excavan. */
const CARVE_MAX_Y = MAX_Y - 1 - 7;

/** Elipsoide excavado. Cuevas: nada por debajo del suelo (yd ≤ floor). Barrancos: su anchura por altura. */
interface Ellipsoid {
  x: number;
  y: number;
  z: number;
  hr: number;
  vr: number;
  floor: number;
  widths: Float32Array | null;
}

/** Azar de Java para los excavadores: entero en [lo, hi], float y long (aquí, una semilla nueva). */
class CarverRandom {
  constructor(private r: NoiseRandom) {}
  float(): number {
    return this.r.nextFloat();
  }
  int(n: number): number {
    return n <= 0 ? 0 : this.r.nextInt(n);
  }
  between(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }
  uniform(lo: number, hi: number): number {
    return lo + this.r.nextFloat() * (hi - lo);
  }
  /** TrapezoidFloat de Java. */
  trapezoid(min: number, max: number, plateau: number): number {
    const range = max - min, d = (range - plateau) / 2, e = range - d;
    return min + this.r.nextFloat() * e + this.r.nextFloat() * d;
  }
  /** VeryBiasedToBottomInt (inner 1). */
  veryBiased(min: number, max: number): number {
    const a = this.between(min + 1, max + 1);
    const b = this.between(min, a - 1);
    return this.between(min, b - 1 + 1);
  }
  seed(): number {
    return (this.r.nextDouble() * 0x7fffffff) | 0;
  }
}

// ------------------------------------------------------------------ cuevas

export class OverworldCaves {
  private readonly n: Record<NoiseKey, NoiseStack>;
  /** Componentes interpoladas de cada esquina de la rejilla (clave: x, y, z de la esquina). */
  private corners = new Map<number, Float32Array>();
  /** Celdas del acuífero: su centro al azar y, cuando se pide, su fluido (clave numérica comprobada). */
  private aquiferCells = new Map<number, AquiferCell>();
  private surfaceCache = new Map<number, number>();
  private skipAboveCache = new Map<number, number>();
  private carverLists = new Map<string, Ellipsoid[]>();
  private carveMasks = new Map<number, Uint8Array>();

  constructor(private readonly seed: number, private readonly host: CaveHost) {
    const root = new NoiseRandom(seed ^ 0x0ca7e526);
    const n = {} as Record<NoiseKey, NoiseStack>;
    for (const k of Object.keys(NOISES) as NoiseKey[]) n[k] = normalNoise(NOISES[k], root.fork(k));
    this.n = n;
  }

  // ---------------------------------------------------------------- ruido de cuevas

  private sample(k: NoiseKey, x: number, y: number, z: number, xz: number, ys: number): number {
    return this.n[k].get(x * xz, y * ys, z * xz);
  }

  /** interval_select de los espaguetis: la función del tramo donde cae `input`. */
  private spaghetti3d(k: 'spaghetti_3d_1' | 'spaghetti_3d_2', rarity: number, x: number, y: number, z: number): number {
    if (rarity < -0.5) return this.sample(k, x, y, z, 4 / 3, 4 / 3) * 0.75;
    if (rarity < 0) return this.sample(k, x, y, z, 1, 1);
    if (rarity < 0.5) return this.sample(k, x, y, z, 2 / 3, 2 / 3) * 1.5;
    return this.sample(k, x, y, z, 0.5, 0.5) * 2;
  }

  /** Las ocho componentes de las cuevas en una esquina de la rejilla (antes de interpolar). */
  private cornerValues(x: number, y: number, z: number): Float32Array {
    const key = ((x >> 2) & 0x3ff) * 0x100000 + (((y - MIN_Y) >> 3) & 0x3ff) * 0x400 + ((z >> 2) & 0x3ff);
    const cached = this.corners.get(key);
    // La clave repite cada 4096 bloques: se comprueba que es la misma esquina.
    if (cached && cached[8] === x && cached[9] === y && cached[10] === z) return cached;
    if (this.corners.size > 60000) this.corners.clear(); // (lastCell guarda referencias: siguen valiendo)
    const v = new Float32Array(COMPONENTS + 3);
    v[8] = x; v[9] = y; v[10] = z;
    // Rugosidad de los espaguetis (spaghetti_roughness_function).
    const rough = (this.sample('spaghetti_roughness_modulator', x, y, z, 1, 1) * -0.05 - 0.05) *
      (Math.abs(this.sample('spaghetti_roughness', x, y, z, 1, 1)) - 0.4);
    // Entradas (overworld/caves/entrances).
    const rarity = this.sample('spaghetti_3d_rarity', x, y, z, 2, 1);
    const s3d = clamp(
      Math.max(Math.abs(this.spaghetti3d('spaghetti_3d_1', rarity, x, y, z)), Math.abs(this.spaghetti3d('spaghetti_3d_2', rarity, x, y, z))) +
        (this.sample('spaghetti_3d_thickness', x, y, z, 1, 1) * -0.011500001 - 0.0765),
      -1, 1,
    );
    v[C_ENTR] = Math.min(this.sample('cave_entrance', x, y, z, 0.75, 0.5) + 0.37 + gradient(y, -10, 0.3, 30, 0), rough + s3d);
    // Queso con sus capas (sin el término que depende del terreno).
    const layer = this.sample('cave_layer', x, y, z, 1, 8);
    v[C_CHEESE] = 4 * layer * layer + clamp(this.sample('cave_cheese', x, y, z, 1, 2 / 3) + 0.27, -1, 1);
    // Espaguetis 2D (overworld/caves/spaghetti_2d) con la rugosidad.
    const mod = this.sample('spaghetti_2d_modulator', x, y, z, 2, 1);
    const s2 = mod < -0.75 ? this.sample('spaghetti_2d', x, y, z, 2, 2) * 0.5
      : mod < -0.5 ? this.sample('spaghetti_2d', x, y, z, 4 / 3, 4 / 3) * 0.75
        : mod < 0.5 ? this.sample('spaghetti_2d', x, y, z, 1, 1)
          : mod < 0.75 ? this.sample('spaghetti_2d', x, y, z, 0.5, 0.5) * 2
            : this.sample('spaghetti_2d', x, y, z, 1 / 3, 1 / 3) * 3;
    const thick2d = this.sample('spaghetti_2d_thickness', x, y, z, 2, 1) * -0.34999996 - 0.95;
    const elev = Math.abs(this.sample('spaghetti_2d_elevation', x, 0, z, 1, 0) * 8 + gradient(y, -64, 8, 320, -40)) + thick2d;
    v[C_SPAG] = clamp(Math.max(Math.abs(s2) + thick2d * 0.083, elev * elev * elev), -1, 1) + rough;
    // Pilares.
    const pt = this.sample('pillar_thickness', x, y, z, 1, 1) * 0.55 + 0.55;
    v[C_PILLAR] = (this.sample('pillar', x, y, z, 25, 0.3) * 2 + (this.sample('pillar_rareness', x, y, z, 1, 1) * -1 - 1)) * pt * pt * pt;
    // Fideos (overworld/caves/noodle): sólo entre y = −60 y 320.
    const inRange = y >= -60 && y < 321;
    v[C_TOGGLE] = inRange ? this.sample('noodle', x, y, z, 1, 1) : -1;
    v[C_THICK] = inRange ? this.sample('noodle_thickness', x, y, z, 1, 1) * -0.025 - 0.075 : 0;
    v[C_RIDGE_A] = inRange ? this.sample('noodle_ridge_a', x, y, z, 8 / 3, 8 / 3) : 0;
    v[C_RIDGE_B] = inRange ? this.sample('noodle_ridge_b', x, y, z, 8 / 3, 8 / 3) : 0;
    this.corners.set(key, v);
    return v;
  }

  private scratch = new Float64Array(COMPONENTS);

  /** Interpola las componentes de las ocho esquinas de una celda en `out` (el mismo orden de lerps siempre). */
  private interpolate(
    c000: Float32Array, c100: Float32Array, c010: Float32Array, c110: Float32Array,
    c001: Float32Array, c101: Float32Array, c011: Float32Array, c111: Float32Array,
    fx: number, fy: number, fz: number, out: Float64Array,
  ): void {
    for (let k = 0; k < COMPONENTS; k++) {
      out[k] = lerp(fz,
        lerp(fy, lerp(fx, c000[k], c100[k]), lerp(fx, c010[k], c110[k])),
        lerp(fy, lerp(fx, c001[k], c101[k]), lerp(fx, c011[k], c111[k])));
    }
  }

  /** Densidad final de Java en un bloque (positiva: roca; negativa: hueco), con la superficie de su columna. */
  density(x: number, y: number, z: number, top: number): number {
    const gx = Math.floor(x / CELL_XZ) * CELL_XZ, gz = Math.floor(z / CELL_XZ) * CELL_XZ;
    const gy = MIN_Y + Math.floor((y - MIN_Y) / CELL_Y) * CELL_Y;
    // Las consultas seguidas suelen caer en la misma celda: se guardan sus ocho esquinas.
    const cell = this.lastCell;
    if (cell.x !== gx || cell.y !== gy || cell.z !== gz) {
      cell.x = gx; cell.y = gy; cell.z = gz;
      const c = cell.c;
      c[0] = this.cornerValues(gx, gy, gz); c[1] = this.cornerValues(gx + CELL_XZ, gy, gz);
      c[2] = this.cornerValues(gx, gy + CELL_Y, gz); c[3] = this.cornerValues(gx + CELL_XZ, gy + CELL_Y, gz);
      c[4] = this.cornerValues(gx, gy, gz + CELL_XZ); c[5] = this.cornerValues(gx + CELL_XZ, gy, gz + CELL_XZ);
      c[6] = this.cornerValues(gx, gy + CELL_Y, gz + CELL_XZ); c[7] = this.cornerValues(gx + CELL_XZ, gy + CELL_Y, gz + CELL_XZ);
    }
    const c = cell.c;
    this.interpolate(c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[7], (x - gx) / CELL_XZ, (y - gy) / CELL_Y, (z - gz) / CELL_XZ, this.scratch);
    return this.combine(y, top, this.scratch);
  }

  private lastCell = { x: NaN, y: NaN, z: NaN, c: new Array<Float32Array>(8) };

  /** El final_density del overworld con las componentes ya interpoladas. */
  private combine(y: number, top: number, v: Float64Array): number {
    // La superficie del terreno está por encima del bloque más alto (top + 1): ese bloque ya está un poco dentro.
    const sloped = SLOPE_PER_BLOCK * (top + 1 - y);
    const entr = v[C_ENTR];
    let caves: number;
    if (sloped < 1.5625) caves = Math.min(sloped, 5 * entr);
    else {
      const cheese = v[C_CHEESE] + clamp(1.5 - 0.64 * sloped, 0, 0.5);
      const pillar = v[C_PILLAR];
      caves = Math.max(Math.min(Math.min(cheese, entr), v[C_SPAG]), pillar < 0.03 ? -1e6 : pillar);
    }
    const inner = lerp(gradient(y, -64, 0, -40, 1), 0.1171875, lerp(gradient(y, 240, 1, 256, 0), -0.078125, caves));
    const noodle = v[C_TOGGLE] < 0 ? 64 : v[C_THICK] + 1.5 * Math.max(Math.abs(v[C_RIDGE_A]), Math.abs(v[C_RIDGE_B]));
    return Math.min(squeeze(0.64 * inner), noodle);
  }

  /**
   * Cuevas de un chunk recién generado: las de ruido y las de los excavadores, con lo que pone el acuífero (aire,
   * agua o lava). `tops`: la superficie de cada columna; `maxTop`, la más alta. Si se excava bajo la hierba, la
   * tierra que queda al descubierto se vuelve hierba (como applyCarvingMask).
   */
  carveChunk(cx: number, cz: number, blocks: Uint16Array, tops: Int16Array, maxTop: number, grass: number, mycelium: number, dirt: number, uncarvable: (id: number) => boolean): void {
    const x0 = cx * 16, z0 = cz * 16;
    const yTop = Math.min(maxTop, CARVE_MAX_Y);
    const ny = Math.floor((yTop - MIN_Y) / CELL_Y) + 2;
    const grid: Float32Array[] = new Array(25 * ny);
    for (let gy = 0; gy < ny; gy++) {
      for (let gz = 0; gz < 5; gz++) {
        for (let gx = 0; gx < 5; gx++) grid[(gy * 5 + gz) * 5 + gx] = this.cornerValues(x0 + gx * CELL_XZ, MIN_Y + gy * CELL_Y, z0 + gz * CELL_XZ);
      }
    }
    const mask = this.carveMask(cx, cz);
    const v = this.scratch;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        const top = tops[lz * 16 + lx];
        const gx = lx >> 2, gz = lz >> 2, fx = (lx & 3) / CELL_XZ, fz = (lz & 3) / CELL_XZ;
        let hasGrass = false;
        for (let y = Math.min(top, yTop); y > MIN_Y; y--) {
          const i = ((y - MIN_Y) << 8) | (lz << 4) | lx;
          const b = blocks[i];
          if (b === AIR || uncarvable(b)) continue;
          const gy = (y - MIN_Y) >> 3;
          const b0 = (gy * 5 + gz) * 5 + gx, b1 = b0 + 25;
          this.interpolate(grid[b0], grid[b0 + 1], grid[b1], grid[b1 + 1], grid[b0 + 5], grid[b0 + 6], grid[b1 + 5], grid[b1 + 6],
            fx, ((y - MIN_Y) & 7) / CELL_Y, fz, v);
          const d = this.combine(y, top, v);
          const sub = d <= 0 ? this.substance(x0 + lx, y, z0 + lz, d) : mask[i] ? this.substance(x0 + lx, y, z0 + lz, 0) : -1;
          if (sub < 0) continue;
          if (b === grass || b === mycelium) hasGrass = true;
          blocks[i] = sub;
          if (hasGrass && sub === AIR && y - 1 > MIN_Y && blocks[i - 256] === dirt) blocks[i - 256] = grass;
        }
      }
    }
  }

  // ---------------------------------------------------------------- acuífero

  private surfaceLevel(x: number, z: number): number {
    const qx = x & ~3, qz = z & ~3;
    const key = (qx & 0xffff) * 0x10000 + (qz & 0xffff);
    let v = this.surfaceCache.get(key);
    if (v === undefined) {
      if (this.surfaceCache.size > 40000) this.surfaceCache.clear();
      v = Math.floor(this.host.preliminarySurface(qx, qz));
      this.surfaceCache.set(key, v);
    }
    return v;
  }

  /** skipSamplingAboveY del acuífero del chunk (cx, cz): por encima, sólo el fluido global. */
  private skipAbove(cx: number, cz: number): number {
    const key = (cx & 0xffff) * 0x10000 + (cz & 0xffff);
    let v = this.skipAboveCache.get(key);
    if (v !== undefined) return v;
    if (this.skipAboveCache.size > 4000) this.skipAboveCache.clear();
    const minGX = (cx * 16 - 5) >> 4, maxGX = ((cx * 16 + 15 - 5) >> 4) + 1;
    const minGZ = (cz * 16 - 5) >> 4, maxGZ = ((cz * 16 + 15 - 5) >> 4) + 1;
    let maxS = -1e9;
    for (let x = (minGX << 4) & ~3; x <= (maxGX << 4) + 9; x += 4) {
      for (let z = (minGZ << 4) & ~3; z <= (maxGZ << 4) + 9; z += 4) maxS = Math.max(maxS, this.surfaceLevel(x, z));
    }
    const gridY = Math.floor((maxS + 8 + 12) / 12) + 1;
    v = gridY * 12 + 11 - 1;
    this.skipAboveCache.set(key, v);
    return v;
  }

  private aquiferCell(gx: number, gy: number, gz: number): AquiferCell {
    const key = ((gx & 0x7ff) * 0x800 + (gz & 0x7ff)) * 0x100 + (gy & 0xff);
    let c = this.aquiferCells.get(key);
    // La clave se repite cada 32 768 bloques: se comprueba que es la misma celda.
    if (c && c.gx === gx && c.gy === gy && c.gz === gz) return c;
    if (this.aquiferCells.size > 40000) this.aquiferCells.clear();
    const r = new NoiseRandom(hash3(gx, gy, gz, this.seed ^ 0xa9f1e5));
    c = { gx, gy, gz, x: (gx << 4) + r.nextInt(10), y: gy * 12 + r.nextInt(9), z: (gz << 4) + r.nextInt(10), status: null };
    this.aquiferCells.set(key, c);
    return c;
  }

  private statusOf(c: AquiferCell): FluidStatus {
    return (c.status ??= this.computeFluid(c.x, c.y, c.z));
  }

  private computeFluid(x: number, y: number, z: number): FluidStatus {
    const global = globalFluid(y);
    let lowest = Number.MAX_SAFE_INTEGER;
    const top = y + 12, bottom = y - 12;
    let centerUnder = false;
    for (const [ox, oz] of SURFACE_OFFSETS) {
      const sx = x + ox * 16, sz = z + oz * 16;
      const surface = this.surfaceLevel(sx, sz);
      const adjusted = surface + 8;
      const start = ox === 0 && oz === 0;
      if (start && bottom > adjusted) return global;
      const pokes = top > adjusted;
      if (pokes || start) {
        const atSurface = globalFluid(adjusted);
        if (fluidAt(atSurface, adjusted) !== AIR) {
          if (start) centerUnder = true;
          if (pokes) return atSurface;
        }
      }
      lowest = Math.min(lowest, surface);
    }
    const level = this.fluidSurfaceLevel(x, y, z, global, lowest, centerUnder);
    return { level, lava: this.fluidIsLava(x, y, z, global, level) };
  }

  private fluidSurfaceLevel(x: number, y: number, z: number, global: FluidStatus, lowest: number, centerUnder: boolean): number {
    let partial: number, full: number;
    // exclusion: min(−0,225 − erosión, max(depth − 0,9, 0)) > 0: muy hondo bajo las montañas no hay lagos.
    const depth = (this.surfaceLevel(x, z) - y) / 128;
    if (this.host.mountainAt(x, z) > 0.6 && depth > 0.9) {
      partial = full = -1;
    } else {
      const below = lowest + 8 - y;
      const factor = centerUnder ? clamp(1 - below / 64, 0, 1) : 0;
      const flood = clamp(this.sample('aquifer_fluid_level_floodedness', x, y, z, 1, 0.67), -1, 1);
      const fullThreshold = lerp(1 - factor, -0.3, 0.8);
      const partialThreshold = lerp(1 - factor, -0.8, 0.4);
      partial = flood - partialThreshold;
      full = flood - fullThreshold;
    }
    if (full > 0) return global.level;
    if (partial > 0) {
      const cx = Math.floor(x / 16), cy = Math.floor(y / 40), cz = Math.floor(z / 16);
      const spread = this.sample('aquifer_fluid_level_spread', cx, cy, cz, 1, 0.7142857142857143) * 10;
      return Math.min(lowest, cy * 40 + 20 + Math.floor(spread / 3) * 3);
    }
    return NO_FLUID;
  }

  private fluidIsLava(x: number, y: number, z: number, global: FluidStatus, level: number): boolean {
    if (level <= -10 && level !== NO_FLUID && !global.lava) {
      const v = this.sample('aquifer_lava', Math.floor(x / 64), Math.floor(y / 40), Math.floor(z / 64), 1, 1);
      if (Math.abs(v) > 0.3) return true;
    }
    return global.lava;
  }

  private pressure(x: number, y: number, z: number, barrier: { v: number }, a: FluidStatus, b: FluidStatus): number {
    const ta = fluidAt(a, y), tb = fluidAt(b, y);
    if ((ta === LAVA && tb === WATER) || (ta === WATER && tb === LAVA)) return 2;
    const diff = Math.abs(a.level - b.level);
    if (diff === 0) return 0;
    const avg = 0.5 * (a.level + b.level);
    const above = y + 0.5 - avg;
    const toMiddle = diff / 2 - Math.abs(above);
    let g: number;
    if (above > 0) g = toMiddle > 0 ? toMiddle / 1.5 : toMiddle / 2.5;
    else {
      const c = 3 + toMiddle;
      g = c > 0 ? c / 3 : c / 10;
    }
    let noise = 0;
    if (g >= -2 && g <= 2) {
      if (Number.isNaN(barrier.v)) barrier.v = this.sample('aquifer_barrier', x, y, z, 1, 0.5);
      noise = barrier.v;
    }
    return 2 * (noise + g);
  }

  /**
   * computeSubstance del acuífero: qué queda en un hueco (densidad ≤ 0): aire, agua o lava; o −1 si ahí va una
   * barrera de roca (se deja el bloque que había).
   */
  substance(x: number, y: number, z: number, density: number): number {
    if (density > 0) return -1;
    const global = globalFluid(y);
    if (y > this.skipAbove(Math.floor(x / 16), Math.floor(z / 16))) return fluidAt(global, y);
    if (fluidAt(global, y) === LAVA) return LAVA;
    const ax = (x - 5) >> 4, ay = Math.floor((y + 1) / 12), az = (z - 5) >> 4;
    // Los cuatro centros más cercanos de las 12 celdas de alrededor (a igual distancia, el último gana, como Java).
    let d1 = Infinity, d2 = Infinity, d3 = Infinity, d4 = Infinity;
    let c1!: AquiferCell, c2!: AquiferCell, c3!: AquiferCell, c4!: AquiferCell;
    for (let dx = 0; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = 0; dz <= 1; dz++) {
          const c = this.aquiferCell(ax + dx, ay + dy, az + dz);
          const ex = c.x - x, ey = c.y - y, ez = c.z - z;
          const d = ex * ex + ey * ey + ez * ez;
          if (d1 >= d) { c4 = c3; c3 = c2; c2 = c1; c1 = c; d4 = d3; d3 = d2; d2 = d1; d1 = d; }
          else if (d2 >= d) { c4 = c3; c3 = c2; c2 = c; d4 = d3; d3 = d2; d2 = d; }
          else if (d3 >= d) { c4 = c3; c3 = c; d4 = d3; d3 = d; }
          else if (d4 >= d) { c4 = c; d4 = d; }
        }
      }
    }
    void c4;
    void d4;
    const s1 = this.statusOf(c1);
    const sim12 = similarity(d1, d2);
    const fluid = fluidAt(s1, y);
    if (sim12 <= 0) return fluid;
    if (fluid === WATER && fluidAt(globalFluid(y - 1), y - 1) === LAVA) return fluid;
    const barrier = this.barrierCell;
    barrier.v = NaN;
    const s2 = this.statusOf(c2);
    if (density + sim12 * this.pressure(x, y, z, barrier, s1, s2) > 0) return -1;
    const s3 = this.statusOf(c3);
    const sim13 = similarity(d1, d3);
    if (sim13 > 0 && density + sim12 * sim13 * this.pressure(x, y, z, barrier, s1, s3) > 0) return -1;
    const sim23 = similarity(d2, d3);
    if (sim23 > 0 && density + sim12 * sim23 * this.pressure(x, y, z, barrier, s2, s3) > 0) return -1;
    return fluid;
  }

  private barrierCell = { v: NaN };

  // ---------------------------------------------------------------- excavadores

  /** Elipsoides que excava el excavador `index` desde el chunk (sx, sz) (vacío si no empieza ahí). */
  private carverFrom(index: number, sx: number, sz: number): Ellipsoid[] {
    const key = `${index},${sx},${sz}`;
    let list = this.carverLists.get(key);
    if (list) return list;
    if (this.carverLists.size > 20000) this.carverLists.clear();
    list = [];
    const cfg = CARVERS[index];
    const r = new CarverRandom(new NoiseRandom(hash3(sx, index, sz, this.seed ^ 0x5ca4e)));
    if (r.float() <= cfg.probability) {
      if (cfg.kind === 'cave') this.caveCarver(r, cfg, sx, sz, list);
      else this.canyonCarver(r, cfg, sx, sz, list);
    }
    this.carverLists.set(key, list);
    return list;
  }

  /** CaveWorldCarver.carve con la configuración de cave / cave_extra_underground. */
  private caveCarver(r: CarverRandom, cfg: CaveCarverConfig, sx: number, sz: number, out: Ellipsoid[]): void {
    const count = r.veryBiased(0, 14);
    for (let cave = 0; cave < count; cave++) {
      const x = sx * 16 + r.int(16);
      const y = r.between(cfg.yMin, cfg.yMax);
      const z = sz * 16 + r.int(16);
      const hMul = r.uniform(0.7, 1.4);
      const vMul = r.uniform(0.8, 1.3);
      const floor = r.uniform(-1, -0.4);
      let tunnels = 1;
      if (r.int(4) === 0) {
        const yScale = r.uniform(0.1, 0.9);
        const thickness = 1 + r.float() * 6;
        const hr = 1.5 + thickness;
        out.push({ x: x + 1, y, z, hr, vr: hr * yScale, floor, widths: null });
        tunnels += r.int(4);
      }
      for (let i = 0; i < tunnels; i++) {
        const yaw = r.float() * Math.PI * 2;
        const pitch = (r.float() - 0.5) / 4;
        let thickness = r.trapezoid(0, 3, 1);
        // weird_thickness_bias: de vez en cuando, un túnel mucho más ancho.
        if (r.int(10) === 0) thickness *= r.float() * r.float() * 3 + 1;
        const dist = MAX_TUNNEL - r.int(MAX_TUNNEL / 4);
        this.caveTunnel(out, r.seed(), x, y, z, hMul, vMul, thickness, yaw, pitch, 0, dist, 1, floor);
      }
    }
  }

  private caveTunnel(
    out: Ellipsoid[], tseed: number, x: number, y: number, z: number, hMul: number, vMul: number, thickness: number,
    yaw: number, pitch: number, step: number, dist: number, yScale: number, floor: number,
  ): void {
    const r = new CarverRandom(new NoiseRandom(tseed));
    const split = r.int(dist >> 1) + (dist >> 2);
    const steep = r.int(6) === 0;
    let yRota = 0, xRota = 0;
    for (let s = step; s < dist; s++) {
      const hr = 1.5 + Math.sin((Math.PI * s) / dist) * thickness;
      const vr = hr * yScale;
      const cosX = Math.cos(pitch);
      x += Math.cos(yaw) * cosX;
      y += Math.sin(pitch);
      z += Math.sin(yaw) * cosX;
      pitch *= steep ? 0.92 : 0.7;
      pitch += xRota * 0.1;
      yaw += yRota * 0.1;
      xRota *= 0.9;
      yRota *= 0.75;
      xRota += (r.float() - r.float()) * r.float() * 2;
      yRota += (r.float() - r.float()) * r.float() * 4;
      if (s === split && thickness > 1) {
        this.caveTunnel(out, r.seed(), x, y, z, hMul, vMul, r.float() * 0.5 + 0.5, yaw - Math.PI / 2, pitch / 3, s, dist, 1, floor);
        this.caveTunnel(out, r.seed(), x, y, z, hMul, vMul, r.float() * 0.5 + 0.5, yaw + Math.PI / 2, pitch / 3, s, dist, 1, floor);
        return;
      }
      if (r.int(4) !== 0) out.push({ x, y, z, hr: hr * hMul, vr: vr * vMul, floor, widths: null });
    }
  }

  /** CanyonWorldCarver.carve con la configuración de canyon. */
  private canyonCarver(r: CarverRandom, cfg: CanyonCarverConfig, sx: number, sz: number, out: Ellipsoid[]): void {
    const x = sx * 16 + r.int(16);
    const y = r.between(cfg.yMin, cfg.yMax);
    const z = sz * 16 + r.int(16);
    let yaw = r.float() * Math.PI * 2;
    let pitch = r.uniform(-0.125, 0.125);
    const yScale = 3;
    const thickness = r.trapezoid(0, 6, 2);
    const dist = Math.floor(MAX_TUNNEL * r.uniform(0.75, 1));
    const t = new CarverRandom(new NoiseRandom(r.seed()));
    // Anchura por altura (width_smoothness 3): cambia de vez en cuando al subir.
    const widths = new Float32Array(MAX_Y - MIN_Y);
    let w = 1;
    for (let i = 0; i < widths.length; i++) {
      if (i === 0 || t.int(3) === 0) w = 1 + t.float() * t.float();
      widths[i] = w * w;
    }
    let yRota = 0, xRota = 0;
    let px = x, py = y, pz = z;
    for (let s = 0; s < dist; s++) {
      let hr = 1.5 + Math.sin((s * Math.PI) / dist) * thickness;
      let vr = hr * yScale;
      hr *= t.uniform(0.75, 1);
      vr = vr * (0.75 + t.float() * 0.25); // vertical_radius_default_factor 1, center 0
      const xc = Math.cos(pitch), xs = Math.sin(pitch);
      px += Math.cos(yaw) * xc;
      py += xs;
      pz += Math.sin(yaw) * xc;
      pitch *= 0.7;
      pitch += xRota * 0.05;
      yaw += yRota * 0.05;
      xRota *= 0.8;
      yRota *= 0.5;
      xRota += (t.float() - t.float()) * t.float() * 2;
      yRota += (t.float() - t.float()) * t.float() * 4;
      if (t.int(4) !== 0) out.push({ x: px, y: py, z: pz, hr, vr, floor: -2, widths });
    }
  }

  /** Máscara de lo que excavan los excavadores en el chunk (cx, cz): un byte por bloque (1 = excavado). */
  carveMask(cx: number, cz: number): Uint8Array {
    const key = (cx & 0xffff) * 0x10000 + (cz & 0xffff);
    let mask = this.carveMasks.get(key);
    if (mask) return mask;
    if (this.carveMasks.size > 48) this.carveMasks.clear();
    mask = new Uint8Array(16 * 16 * (MAX_Y - MIN_Y));
    const x0 = cx * 16, z0 = cz * 16;
    for (let dz = -CARVE_SOURCES; dz <= CARVE_SOURCES; dz++) {
      for (let dx = -CARVE_SOURCES; dx <= CARVE_SOURCES; dx++) {
        for (let i = 0; i < CARVERS.length; i++) {
          for (const e of this.carverFrom(i, cx + dx, cz + dz)) this.rasterize(e, x0, z0, mask);
        }
      }
    }
    this.carveMasks.set(key, mask);
    return mask;
  }

  /** carveEllipsoid de WorldCarver sobre el chunk que empieza en (x0, z0). */
  private rasterize(e: Ellipsoid, x0: number, z0: number, mask: Uint8Array): void {
    const maxDelta = 16 + e.hr * 2;
    if (Math.abs(e.x - (x0 + 8)) > maxDelta || Math.abs(e.z - (z0 + 8)) > maxDelta) return;
    const minX = Math.max(Math.floor(e.x - e.hr) - x0 - 1, 0), maxX = Math.min(Math.floor(e.x + e.hr) - x0, 15);
    const minZ = Math.max(Math.floor(e.z - e.hr) - z0 - 1, 0), maxZ = Math.min(Math.floor(e.z + e.hr) - z0, 15);
    const minY = Math.max(Math.floor(e.y - e.vr) - 1, MIN_Y + 1), maxY = Math.min(Math.floor(e.y + e.vr) + 1, CARVE_MAX_Y);
    for (let lx = minX; lx <= maxX; lx++) {
      const xd = (x0 + lx + 0.5 - e.x) / e.hr;
      for (let lz = minZ; lz <= maxZ; lz++) {
        const zd = (z0 + lz + 0.5 - e.z) / e.hr;
        const h2 = xd * xd + zd * zd;
        if (h2 >= 1) continue;
        for (let y = maxY; y > minY; y--) {
          const yd = (y - 0.5 - e.y) / e.vr;
          if (e.widths) {
            if (h2 * e.widths[y - MIN_Y - 1] + (yd * yd) / 6 >= 1) continue;
          } else if (yd <= e.floor || h2 + yd * yd >= 1) continue;
          mask[((y - MIN_Y) << 8) | (lz << 4) | lx] = 1;
        }
      }
    }
  }

  // ---------------------------------------------------------------- consultas sueltas

  /**
   * Qué deja la generación de cuevas en un bloque de roca del terreno (fuera del chunk que se genera): el id
   * (aire, agua o lava) o −1 si sigue siendo roca.
   */
  substanceAt(x: number, y: number, z: number): number {
    const top = this.host.topAt(x, z);
    if (y > top) return -1;
    const d = this.density(x, y, z, top);
    if (d <= 0) return this.substance(x, y, z, d);
    const mask = this.carveMask(Math.floor(x / 16), Math.floor(z / 16));
    if (y > MIN_Y && y <= CARVE_MAX_Y && mask[((y - MIN_Y) << 8) | ((z & 15) << 4) | (x & 15)]) return this.substance(x, y, z, 0);
    return -1;
  }

  /** ¿Abren las cuevas de ruido un hueco en (x, y, z)? (sin mirar el acuífero ni los excavadores). */
  noiseCaveAt(x: number, y: number, z: number): boolean {
    return this.density(x, y, z, this.host.topAt(x, z)) <= 0;
  }
}

export { hash2 };
