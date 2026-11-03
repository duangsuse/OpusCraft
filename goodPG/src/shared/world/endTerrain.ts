// Fase 8.6 (el End): el terreno base del End, portado de la 26.3.
// - Densidad (noise_settings/end.json): 0,64 × lerp(y de 4 a 32: −0,234375 → dentro) de lerp(y de 56 a 312: dentro
//   → −23,4375) de «sloped_cheese» = islas + old_blended_noise (escalas 0,25 y 0,25, factores 80 y 160,
//   emborronado 4), interpolada en celdas de 8×4×8 bloques. Lo sólido es piedra del End; lo demás, el vacío.
// - Islas (end/islands): el máximo de la isla central (clamp(100 − distancia al centro, −100, 80) − 8) / 128 y de
//   las islas exteriores (EndIslandDensityFunction): en celdas de 8 bloques, los trozos de 2×2 celdas a más de
//   64 trozos del centro en los que el SimplexNoise baja de −0,9 levantan una isla de tamaño 9..21.
// - Biomas (TheEndBiomeSource): a menos de 64 chunks del centro, «El End»; fuera, según el valor de las islas en el
//   centro del chunk: > 0,25 tierras altas, ≥ −0,0625 tierras medias, < −0,21875 islas pequeñas y si no páramos.
import { END_STONE } from '../blocks';
import { BlendedNoise, NoiseRandom, SimplexNoise } from './javaNoise';
import { BIOME_THE_END, BIOME_END_HIGHLANDS, BIOME_END_MIDLANDS, BIOME_SMALL_END_ISLANDS, BIOME_END_BARRENS } from './biomeIds';

/** Alto del terreno del End (de y = 0 a y = 127; por encima y por debajo, vacío). */
export const END_HEIGHT = 128;
export const endBaseIndex = (lx: number, y: number, lz: number) => (y << 8) | (lz << 4) | lx;
export const END_BASE_VOLUME = 16 * 16 * END_HEIGHT;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class EndTerrain {
  private readonly base3d: BlendedNoise;
  private readonly islandNoise: SimplexNoise;
  private readonly heightCache = new Map<number, number>();
  private readonly biomeCache = new Map<number, number>();

  constructor(readonly seed: number) {
    const r = new NoiseRandom((seed ^ 0xe7d5a) | 0);
    this.base3d = new BlendedNoise(r.fork('end/terrain'), 0.25, 0.25, 80, 160, 4);
    this.islandNoise = new SimplexNoise(r.fork('end/islands'));
  }

  /** EndIslandDensityFunction.getHeightValue en la celda de 8 bloques (x, z). */
  private heightValue(x: number, z: number): number {
    const k = (x & 0xffff) * 65536 + (z & 0xffff);
    const hit = this.heightCache.get(k);
    if (hit !== undefined) return hit;
    const chunkX = Math.trunc(x / 2), chunkZ = Math.trunc(z / 2);
    const subX = x % 2, subZ = z % 2;
    let value = clamp(100 - Math.sqrt(x * x + z * z) * 8, -100, 80);
    for (let xo = -12; xo <= 12; xo++) {
      for (let zo = -12; zo <= 12; zo++) {
        const tx = chunkX + xo, tz = chunkZ + zo;
        if (tx * tx + tz * tz <= 4096 || this.islandNoise.getValue(tx, tz) >= -0.9) continue;
        const size = ((Math.abs(tx) * 3439 + Math.abs(tz) * 147) % 13) + 9;
        const xd = subX - xo * 2, zd = subZ - zo * 2;
        value = Math.max(value, clamp(100 - Math.sqrt(xd * xd + zd * zd) * size, -100, 80));
      }
    }
    if (this.heightCache.size > 65536) this.heightCache.clear();
    this.heightCache.set(k, value);
    return value;
  }

  /** end/islands en el bloque (x, z) (sin y: la isla central se mide en y = 0). */
  islands(x: number, z: number): number {
    const main = (clamp(100 - Math.sqrt(x * x + z * z), -100, 80) - 8) * 0.0078125;
    const outer = (this.heightValue(Math.trunc(x / 8), Math.trunc(z / 8)) - 8) / 128;
    return Math.max(main, outer);
  }

  /** Bioma del chunk que contiene (x, z) (en el End el bioma es de chunk). */
  biomeAt(x: number, z: number): number {
    const cx = x >> 4, cz = z >> 4;
    if (cx * cx + cz * cz <= 4096) return BIOME_THE_END;
    const k = (cx & 0xffff) * 65536 + (cz & 0xffff);
    const hit = this.biomeCache.get(k);
    if (hit !== undefined) return hit;
    const h = this.islands(cx * 16 + 8, cz * 16 + 8);
    const b = h > 0.25 ? BIOME_END_HIGHLANDS : h >= -0.0625 ? BIOME_END_MIDLANDS : h < -0.21875 ? BIOME_SMALL_END_ISLANDS : BIOME_END_BARRENS;
    if (this.biomeCache.size > 16384) this.biomeCache.clear();
    this.biomeCache.set(k, b);
    return b;
  }

  /** Densidad sin interpolar (sin la compresión final, que no cambia el signo). */
  private density(x: number, y: number, z: number, islands: number): number {
    const cheese = islands + this.base3d.get(x, y, z);
    const top = -23.4375 + clamp(1 - (y - 56) / 256, 0, 1) * (cheese + 23.4375);
    return 0.64 * (-0.234375 + clamp((y - 4) / 28, 0, 1) * (top + 0.234375));
  }

  /** Piedra del End y vacío del chunk (cx, cz), interpolando en celdas de 8×4×8. */
  baseChunk(cx: number, cz: number): Uint16Array {
    const out = new Uint16Array(END_BASE_VOLUME);
    const x0 = cx * 16, z0 = cz * 16;
    const NY = END_HEIGHT / 4 + 1;
    // Esquinas: 3 × 33 × 3.
    const corner = new Float64Array(3 * NY * 3);
    let any = false;
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        const isl = this.islands(x0 + i * 8, z0 + k * 8);
        // En el vacío (lejos de toda isla las islas valen su mínimo, −0,84375) la densidad nunca llega a ser positiva:
        // no hace falta el ruido 3D.
        const far = isl < -0.8;
        for (let j = 0; j < NY; j++) {
          const d = far ? -1 : this.density(x0 + i * 8, j * 4, z0 + k * 8, isl);
          corner[(i * 3 + k) * NY + j] = d;
          if (d > 0) any = true;
        }
      }
    }
    if (!any) return out;
    for (let i = 0; i < 2; i++) {
      for (let k = 0; k < 2; k++) {
        for (let j = 0; j < NY - 1; j++) {
          const c = (a: number, b: number, d: number) => corner[((i + a) * 3 + (k + d)) * NY + j + b];
          const c000 = c(0, 0, 0), c100 = c(1, 0, 0), c010 = c(0, 1, 0), c110 = c(1, 1, 0);
          const c001 = c(0, 0, 1), c101 = c(1, 0, 1), c011 = c(0, 1, 1), c111 = c(1, 1, 1);
          if (Math.max(c000, c100, c010, c110, c001, c101, c011, c111) <= 0) continue;
          for (let dy = 0; dy < 4; dy++) {
            const ty = dy / 4, y = j * 4 + dy;
            for (let dz = 0; dz < 8; dz++) {
              const tz = dz / 8;
              for (let dx = 0; dx < 8; dx++) {
                const tx = dx / 8;
                const a0 = c000 + tx * (c100 - c000), a1 = c010 + tx * (c110 - c010);
                const b0 = c001 + tx * (c101 - c001), b1 = c011 + tx * (c111 - c011);
                const lo = a0 + ty * (a1 - a0), hi = b0 + ty * (b1 - b0);
                if (lo + tz * (hi - lo) > 0) out[endBaseIndex(i * 8 + dx, y, k * 8 + dz)] = END_STONE;
              }
            }
          }
        }
      }
    }
    return out;
  }
}

