// Fase 8 (dimensiones) y 8.2 (biomas del Nether): generador del Nether. Como en Minecraft, ocupa de y = 0 a
// y = 127. El terreno, los biomas y la superficie están en netherTerrain.ts (portados de la 26.3) y la
// decoración (menas, manantiales, fuego, piedra luminosa, hongos gigantes, enredaderas, deltas, columnas y
// pilares de basalto…) en netherFeatures.ts.
//
// Como en Java, la decoración de un chunk puede pasar a sus vecinos (la región de 3×3): cada chunk se
// decora una vez, sobre los chunks base de alrededor, y lo que pone se guarda; un chunk es su base más lo
// que ponen en él las decoraciones de los nueve chunks de su alrededor, siempre en el mismo orden. Así dos
// chunks vecinos coinciden aunque se generen por separado (en el servidor y en cada hilo del cliente).
// Por debajo de y = 0 todo es lecho de roca (no se ve y así no hay caras que dibujar) y por encima, aire.
// Hereda de TerrainGenerator para que el resto del juego lo use igual (bioma, aparición…).
import { CHUNK_SIZE, CHUNK_VOLUME, MIN_Y, MAX_Y, blockIndex, hash2 } from '../constants';
import { AIR, BEDROCK, LAVA } from '../blocks';
import { TerrainGenerator, type ColumnInfo, type GenResult } from './terrain';
import { NetherTerrain, NETHER_HEIGHT, baseIndex } from './netherTerrain';
import { decorateNetherChunk, type FeatureLevel } from './netherFeatures';
import { NoiseRandom } from './javaNoise';
import { placeNetherStructures } from './netherStructures'; // Fase 8.4 (estructuras del Nether)

/** Nivel del mar de lava (la lava llena el aire con y ≤ LAVA_LEVEL). */
export const NETHER_LAVA_LEVEL = 31;
/** Techo de lecho de roca (la última fila; por encima, aire). */
export const NETHER_ROOF = 127;

/** Lo que pone la decoración de un chunk: x, y, z, id, … y los fluidos que deben correr: x, y, z, … */
interface Decoration {
  writes: Int32Array;
  ticks: Int32Array;
}

/** Caché LRU sencilla (un Map conserva el orden de inserción). */
class Lru<V> {
  private m = new Map<number, V>();
  constructor(private readonly max: number) {}
  get(k: number, make: () => V): V {
    let v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
      return v;
    }
    v = make();
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as number);
    return v;
  }
}

const chunkKey = (cx: number, cz: number) => (cx + 32768) * 65536 + (cz + 32768);

export class NetherGenerator extends TerrainGenerator {
  private readonly terrain: NetherTerrain;
  private readonly bases = new Lru<Uint16Array>(96);
  private readonly decorations = new Lru<Decoration>(48);

  constructor(seed: number) {
    super(seed);
    this.terrain = new NetherTerrain(seed);
  }

  override columnInfo(x: number, z: number, out: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 }): ColumnInfo {
    out.height = NETHER_LAVA_LEVEL + 1;
    out.amp = 0;
    out.temp = 2; // no hay nieve ni hielo
    out.humid = 0;
    out.mount = 0;
    out.cont = 0;
    out.biome = this.terrain.biomeAt(x, z);
    return out;
  }

  override biomeAt(x: number, z: number): number {
    return this.terrain.biomeAt(x, z);
  }

  override caveBiomeAt(x: number, z: number): number {
    void x;
    void z;
    return 0;
  }

  override surfaceAt(x: number, z: number): number {
    return this.floorAt(x, z);
  }

  /** Chunk base (terreno y superficie, sin decorar). */
  private base(cx: number, cz: number): Uint16Array {
    return this.bases.get(chunkKey(cx, cz), () => this.terrain.baseChunk(cx, cz));
  }

  /** Bloque base en (x, y, z) (-1 fuera del alto del Nether). */
  baseBlockAt(x: number, y: number, z: number): number {
    return this.baseAt(x, y, z);
  }

  /** ¿Es firme por arriba este bloque del terreno base? (todo lo que no es aire ni lava). */
  isSturdyBase(id: number): boolean {
    return id > 0 && id !== LAVA;
  }

  private baseAt(x: number, y: number, z: number): number {
    if (y < 0 || y >= NETHER_HEIGHT) return -1;
    return this.base(x >> 4, z >> 4)[baseIndex(x & 15, y, z & 15)];
  }

  /** Decora el chunk (ocx, ocz) sobre la base de alrededor y guarda lo que pone. */
  private decoration(ocx: number, ocz: number): Decoration {
    return this.decorations.get(chunkKey(ocx, ocz), () => {
      // Región de 3×3 chunks: sus bases, lo que se escribe encima (-1: nada) y el bioma de cada columna.
      const x0 = (ocx - 1) * 16, z0 = (ocz - 1) * 16;
      const bases: Uint16Array[] = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) bases.push(this.base(ocx - 1 + i, ocz - 1 + j));
      const written = new Int32Array(48 * NETHER_HEIGHT * 48).fill(-1);
      const biomes = new Int16Array(48 * 48).fill(-1);
      const ticks: number[] = [];
      const cell = (rx: number, y: number, rz: number) => (y * 48 + rz) * 48 + rx;
      const level: FeatureLevel = {
        get: (x, y, z) => {
          const rx = x - x0, rz = z - z0;
          if (y < 0 || y >= NETHER_HEIGHT) return -1;
          if (rx < 0 || rx >= 48 || rz < 0 || rz >= 48) return this.baseAt(x, y, z);
          const w = written[cell(rx, y, rz)];
          return w >= 0 ? w : bases[(rz >> 4) * 3 + (rx >> 4)][baseIndex(rx & 15, y, rz & 15)];
        },
        set: (x, y, z, id) => {
          const rx = x - x0, rz = z - z0;
          if (rx >= 0 && rx < 48 && rz >= 0 && rz < 48 && y >= 0 && y < NETHER_HEIGHT) written[cell(rx, y, rz)] = id;
        },
        biome: (x, z) => {
          const rx = x - x0, rz = z - z0;
          if (rx < 0 || rx >= 48 || rz < 0 || rz >= 48) return this.terrain.biomeAt(x, z);
          const k = rz * 48 + rx;
          if (biomes[k] < 0) biomes[k] = this.terrain.biomeAt(x, z);
          return biomes[k];
        },
        fluidTick: (x, y, z) => {
          if (x >= x0 && x < x0 + 48 && z >= z0 && z < z0 + 48) ticks.push(x, y, z);
        },
      };
      decorateNetherChunk(level, ocx, ocz, (step, index) => new NoiseRandom(hash2(ocx * 31 + step, ocz * 17 + index * 131, this.seed ^ 0xdec0)));
      const out: number[] = [];
      for (let k = 0; k < written.length; k++) {
        if (written[k] < 0) continue;
        const rx = k % 48, rz = Math.floor(k / 48) % 48, y = Math.floor(k / 2304);
        out.push(x0 + rx, y, z0 + rz, written[k]);
      }
      return { writes: Int32Array.from(out), ticks: Int32Array.from(ticks) };
    });
  }

  /** Primer suelo firme con dos de aire encima por encima de la lava, o -1 (en el terreno base). */
  private floorAt(x: number, z: number): number {
    for (let y = NETHER_LAVA_LEVEL + 1; y < NETHER_ROOF - 6; y++) {
      const b = this.baseAt(x, y, z);
      if (b !== AIR && b !== LAVA && this.baseAt(x, y + 1, z) === AIR && this.baseAt(x, y + 2, z) === AIR) return y;
    }
    return -1;
  }

  override findSpawn(): { x: number; y: number; z: number } {
    for (let r = 0; r < 2000; r += 8) {
      const steps = Math.max(1, Math.floor((r * 2 * Math.PI) / 8));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
        const y = this.floorAt(x, z);
        if (y > NETHER_LAVA_LEVEL && y < 100) return { x: x + 0.5, y: y + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: 64, z: 0.5 };
  }

  override generate(cx: number, cz: number): GenResult {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const base = this.base(cx, cz);
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        for (let y = MIN_Y; y < 0; y++) blocks[blockIndex(lx, y, lz)] = BEDROCK;
        for (let y = 0; y < NETHER_HEIGHT; y++) blocks[blockIndex(lx, y, lz)] = base[baseIndex(lx, y, lz)];
      }
    }
    // Lo que ponen en este chunk las decoraciones de los nueve de alrededor (siempre en este orden).
    const fluidTicks: number[] = [];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const d = this.decoration(cx + dx, cz + dz);
        const w = d.writes;
        for (let i = 0; i < w.length; i += 4) {
          const lx = w[i] - x0, lz = w[i + 2] - z0;
          if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) blocks[blockIndex(lx, w[i + 1], lz)] = w[i + 3];
        }
        const t = d.ticks;
        for (let i = 0; i < t.length; i += 3) {
          const lx = t[i] - x0, lz = t[i + 2] - z0;
          if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) fluidTicks.push(t[i], t[i + 1], t[i + 2]);
        }
      }
    }
    // Fase 8.4: las estructuras del Nether (fortalezas…) encima de la decoración.
    const chests: GenResult['chests'] = [], mobs: GenResult['mobs'] = [];
    placeNetherStructures(this, blocks, cx, cz, chests, mobs, fluidTicks);
    // Alturas (el bloque más alto que no es aire).
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        let y = MAX_Y - 1;
        while (y > MIN_Y && blocks[blockIndex(lx, y, lz)] === AIR) y--;
        heights[lz * 16 + lx] = y;
      }
    }
    // Sin hierba: el tinte es un pardo cualquiera (temperatura alta en A).
    const tint = new Uint8Array(64);
    for (let i = 0; i < 16; i++) tint.set([110, 90, 60, 255], i * 4);
    return { blocks, tint, heights, chests, villagers: [], mobs, fluidTicks };
  }
}
