// Fase 8.2 (biomas del Nether): los ruidos del generador de Java 26.3, portados de su código (paquete
// levelgen/synth): el Perlin de gradientes (GradientNoise/PerlinNoise), el Perlin «emborronado» en vertical
// del terreno antiguo (SmearedPerlinNoise), las pilas de octavas (NoiseStack), el ruido normalizado de los
// biomas y la superficie (NormalNoise, con su normalización a una desviación de 1/3 de la amplitud) y el
// ruido mezclado del terreno del Nether (BlendedNoise). La matemática es la de Java; lo único distinto es el
// generador de números al azar que reparte las permutaciones (el nuestro, a partir de la semilla del mundo),
// así que la forma y la escala del terreno son las de Java aunque los mundos no sean los mismos.

/** Generador de números al azar para crear los ruidos (mulberry32; la misma semilla da siempre lo mismo). */
export class NoiseRandom {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0;
  }
  private next32(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  nextDouble(): number {
    return (this.next32() * 2097152 + (this.next32() >>> 11)) / 9007199254740992;
  }
  nextFloat(): number {
    return (this.next32() >>> 8) / 16777216;
  }
  /** Entero en [0, n). */
  nextInt(n: number): number {
    return Math.floor(this.nextDouble() * n);
  }
  /** Otro generador independiente derivado de éste y de una etiqueta. */
  fork(tag: string): NoiseRandom {
    let h = this.next32() ^ 0x9e3779b9;
    for (let i = 0; i < tag.length; i++) h = Math.imul(h ^ tag.charCodeAt(i), 0x01000193);
    return new NoiseRandom(h);
  }
}

// Gradientes de GradientNoise (los 12 de las aristas del cubo y 4 repetidos).
const GX = Int8Array.from([1, -1, 1, -1, 1, -1, 1, -1, 0, 0, 0, 0, 1, 0, -1, 0]);
const GY = Int8Array.from([1, 1, -1, -1, 0, 0, 0, 0, 1, -1, 1, -1, 1, -1, 1, -1]);
const GZ = Int8Array.from([0, 0, 0, 0, 1, 1, -1, -1, 1, 1, -1, -1, 0, 1, 0, -1]);

const HALF_ROUND_OFF = 16777215.999999998;
/** wrap de GradientNoise: devuelve las coordenadas muy grandes a un rango donde no se pierde precisión. */
function wrap(x: number): number {
  return x >= -HALF_ROUND_OFF && x < HALF_ROUND_OFF ? x : x - Math.floor(x / 33554432 + 0.5) * 33554432;
}
const smoothstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, x0: number, x1: number) => x0 + a * (x1 - x0);

export interface Noise3 {
  get(x: number, y: number, z: number): number;
}

/** PerlinNoise de Java: Perlin mejorado con desplazamiento y permutación propios. */
export class PerlinNoise implements Noise3 {
  protected readonly perms = new Uint8Array(512);
  protected readonly ox: number;
  protected readonly oy: number;
  protected readonly oz: number;

  constructor(random: NoiseRandom) {
    this.ox = random.nextDouble() * 256;
    this.oy = random.nextDouble() * 256;
    this.oz = random.nextDouble() * 256;
    const p = this.perms;
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 0; i < 256; i++) {
      const o = random.nextInt(256 - i);
      const t = p[i];
      p[i] = p[o + i];
      p[o + i] = t;
    }
    for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  }

  protected permute(x: number): number {
    return this.perms[x & 255];
  }

  get(x0: number, y0: number, z0: number): number {
    const x = wrap(x0) + this.ox, y = wrap(y0) + this.oy, z = wrap(z0) + this.oz;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const ry = y - fy;
    return this.sampleAndLerp(fx, fy, fz, x - fx, ry, z - fz, ry);
  }

  protected sampleAndLerp(x: number, y: number, z: number, rx: number, ry: number, rz: number, origRy: number): number {
    const p = this.perms;
    const x0 = p[x & 255], x1 = p[(x + 1) & 255];
    const xy00 = p[(x0 + y) & 255], xy01 = p[(x0 + y + 1) & 255];
    const xy10 = p[(x1 + y) & 255], xy11 = p[(x1 + y + 1) & 255];
    let k = p[(xy00 + z) & 255] & 15;
    const d000 = GX[k] * rx + GY[k] * ry + GZ[k] * rz;
    k = p[(xy10 + z) & 255] & 15;
    const d100 = GX[k] * (rx - 1) + GY[k] * ry + GZ[k] * rz;
    k = p[(xy01 + z) & 255] & 15;
    const d010 = GX[k] * rx + GY[k] * (ry - 1) + GZ[k] * rz;
    k = p[(xy11 + z) & 255] & 15;
    const d110 = GX[k] * (rx - 1) + GY[k] * (ry - 1) + GZ[k] * rz;
    k = p[(xy00 + z + 1) & 255] & 15;
    const d001 = GX[k] * rx + GY[k] * ry + GZ[k] * (rz - 1);
    k = p[(xy10 + z + 1) & 255] & 15;
    const d101 = GX[k] * (rx - 1) + GY[k] * ry + GZ[k] * (rz - 1);
    k = p[(xy01 + z + 1) & 255] & 15;
    const d011 = GX[k] * rx + GY[k] * (ry - 1) + GZ[k] * (rz - 1);
    k = p[(xy11 + z + 1) & 255] & 15;
    const d111 = GX[k] * (rx - 1) + GY[k] * (ry - 1) + GZ[k] * (rz - 1);
    const ax = smoothstep(rx), ay = smoothstep(origRy), az = smoothstep(rz);
    return lerp(az, lerp(ay, lerp(ax, d000, d100), lerp(ax, d010, d110)), lerp(ay, lerp(ax, d001, d101), lerp(ax, d011, d111)));
  }
}

/** SmearedPerlinNoise de Java: el Perlin del terreno antiguo, con la y «emborronada» en escalones. */
export class SmearedPerlinNoise extends PerlinNoise {
  constructor(random: NoiseRandom, private readonly fudgeYScale: number) {
    super(random);
  }

  override get(x0: number, y0: number, z0: number): number {
    const x = wrap(x0) + this.ox, y = wrap(y0) + this.oy, z = wrap(z0) + this.oz;
    const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
    const ry = y - fy;
    const limit = y0 >= 0 && y0 < ry ? y0 : ry;
    const fudge = Math.floor(limit / this.fudgeYScale + 1e-7) * this.fudgeYScale;
    return this.sampleAndLerp(fx, fy, fz, x - fx, ry - fudge, z - fz, ry);
  }
}

interface Layer {
  noise: Noise3;
  frequency: number;
  amplitude: number;
}

/** NoiseStack de Java: suma de capas (cada una con su frecuencia y su amplitud). */
export class NoiseStack implements Noise3 {
  constructor(private readonly layers: readonly Layer[]) {}
  get(x: number, y: number, z: number): number {
    let v = 0;
    for (const l of this.layers) v += l.amplitude * l.noise.get(x * l.frequency, y * l.frequency, z * l.frequency);
    return v;
  }
}

/** Parámetros de un NormalNoise (los de los JSON de data/minecraft/worldgen/noise). */
export interface NormalNoiseParams {
  baseOctave: number;
  baseAmplitude: number;
  octaveCount: number;
  /** Multiplicador de cada octava (vacío: todas 1; las de 0 no existen). */
  amplitudeModifiers?: readonly number[];
}

/** Desviación típica de una capa de Perlin (PerlinNoise.STANDARD_DEVIATION). */
const PERLIN_DEVIATION = 0.2702247831245211;
const INPUT_FACTOR = 1.0181268882175227;

/**
 * NormalNoise de Java (normalización ENABLED): octavas de frecuencia doble y amplitud mitad, dos Perlin por
 * octava (el segundo a 1,0181268882175227 veces la frecuencia) y un factor que deja la desviación típica en
 * un tercio de la suma de amplitudes.
 */
export function normalNoise(p: NormalNoiseParams, random: NoiseRandom): NoiseStack {
  const n = p.octaveCount;
  const mods = p.amplitudeModifiers ?? [];
  let frequency = Math.pow(2, p.baseOctave);
  let amplitude = p.baseAmplitude * (Math.pow(0.5, -(n - 1)) / (Math.pow(0.5, -n) - 1));
  const octaves: { frequency: number; amplitude: number }[] = [];
  for (let i = 0; i < n; i++) {
    const m = mods.length ? mods[i] : 1;
    if (m !== 0) octaves.push({ frequency, amplitude: amplitude * m });
    frequency *= 2;
    amplitude *= 0.5;
  }
  const target = octaves.reduce((a, o) => a + Math.abs(o.amplitude), 0);
  const dev = Math.sqrt(octaves.reduce((a, o) => a + (PERLIN_DEVIATION * Math.abs(o.amplitude)) ** 2, 0));
  const factor = dev === 0 ? 0 : target / 3 / (dev * Math.SQRT2);
  const first = random.fork('first'), second = random.fork('second');
  const layers: Layer[] = [];
  for (const o of octaves) {
    const v = factor * o.amplitude;
    layers.push({ noise: new PerlinNoise(first.fork(`octave_${o.frequency}`)), frequency: o.frequency, amplitude: v });
    layers.push({ noise: new PerlinNoise(second.fork(`octave_${o.frequency}`)), frequency: o.frequency * INPUT_FACTOR, amplitude: v });
  }
  return new NoiseStack(layers);
}

/** createFbm de BlendedNoise: octavas desde `firstOctave` hasta 0 de Perlin emborronado. */
function blendedFbm(random: NoiseRandom, firstOctave: number, smearScaleY: number, valueFactor0: number): NoiseStack {
  const octaves = -firstOctave + 1;
  let factor = 1;
  let valueFactor = valueFactor0 / (Math.pow(2, octaves) - 1);
  const layers: Layer[] = [];
  for (let i = octaves - 1; i >= 0; i--) {
    layers.push({ noise: new SmearedPerlinNoise(random, smearScaleY * factor), frequency: factor, amplitude: valueFactor });
    factor /= 2;
    valueFactor *= 2;
  }
  return new NoiseStack(layers);
}

/**
 * BlendedNoise de Java (old_blended_noise): dos ruidos límite y uno principal que decide cuánto de cada uno
 * se toma. Con los parámetros del Nether: escala xz 0,25, y 0,375, factores 80 y 60, emborronado 8.
 */
export class BlendedNoise {
  private readonly minLimit: NoiseStack;
  private readonly maxLimit: NoiseStack;
  private readonly main: NoiseStack;
  private readonly xzMul: number;
  private readonly yMul: number;
  private readonly xzFactor: number;
  private readonly yFactor: number;

  constructor(random: NoiseRandom, xzScale: number, yScale: number, xzFactor: number, yFactor: number, smear: number) {
    this.xzMul = 684.412 * xzScale;
    this.yMul = 684.412 * yScale;
    this.xzFactor = xzFactor;
    this.yFactor = yFactor;
    const limitSmear = this.yMul * smear;
    this.minLimit = blendedFbm(random, -15, limitSmear, 0.99998474);
    this.maxLimit = blendedFbm(random, -15, limitSmear, 0.99998474);
    this.main = blendedFbm(random, -7, limitSmear / yFactor, 12.75);
  }

  get(x: number, y: number, z: number): number {
    const choice = Math.min(1, Math.max(0, this.main.get((x * this.xzMul) / this.xzFactor, (y * this.yMul) / this.yFactor, (z * this.xzMul) / this.xzFactor) + 0.5));
    const X = x * this.xzMul, Y = y * this.yMul, Z = z * this.xzMul;
    if (choice <= 0) return this.minLimit.get(X, Y, Z);
    if (choice >= 1) return this.maxLimit.get(X, Y, Z);
    return lerp(choice, this.minLimit.get(X, Y, Z), this.maxLimit.get(X, Y, Z));
  }
}

/**
 * Fase 8.6 (el End): SimplexNoise de Java en 2D (el de las islas exteriores del End, EndIslandDensityFunction):
 * una permutación al azar y los gradientes de las aristas del cubo; getValue(x, y) sin desplazamiento.
 */
export class SimplexNoise {
  private readonly p = new Int32Array(512);
  constructor(random: NoiseRandom) {
    random.nextDouble();
    random.nextDouble();
    random.nextDouble();
    for (let i = 0; i < 256; i++) this.p[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = random.nextInt(256 - i);
      const t = this.p[i];
      this.p[i] = this.p[j + i];
      this.p[j + i] = t;
    }
  }
  private perm(x: number): number {
    return this.p[x & 255];
  }
  private corner(g: number, x: number, y: number): number {
    let t = 0.5 - x * x - y * y;
    if (t < 0) return 0;
    t *= t;
    return t * t * (GX[g] * x + GY[g] * y);
  }
  getValue(x: number, y: number): number {
    const s = (x + y) * SIMPLEX_F2;
    const i = Math.floor(x + s), j = Math.floor(y + s);
    const t = (i + j) * SIMPLEX_G2;
    const x0 = x - (i - t), y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + SIMPLEX_G2, y1 = y0 - j1 + SIMPLEX_G2;
    const x2 = x0 - 1 + 2 * SIMPLEX_G2, y2 = y0 - 1 + 2 * SIMPLEX_G2;
    const ii = i & 255, jj = j & 255;
    const g0 = this.perm(ii + this.perm(jj)) % 12;
    const g1 = this.perm(ii + i1 + this.perm(jj + j1)) % 12;
    const g2 = this.perm(ii + 1 + this.perm(jj + 1)) % 12;
    return 70 * (this.corner(g0, x0, y0) + this.corner(g1, x1, y1) + this.corner(g2, x2, y2));
  }
}
const SIMPLEX_F2 = 0.5 * (Math.sqrt(3) - 1);
const SIMPLEX_G2 = (3 - Math.sqrt(3)) / 6;
