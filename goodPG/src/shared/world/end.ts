// Fase 8.6 (el End): generador del End. El terreno base y los biomas están en endTerrain.ts (portados de la 26.3);
// aquí, la decoración de cada chunk, como en Java:
// - islas pequeñas (end_island_decorated, en las islas pequeñas: una de cada 14 chunks, una o dos, entre y = 55 y
//   70): EndIslandFeature, un cono de piedra del End que se estrecha hacia abajo;
// - plantas de coro (chorus_plant, en las tierras altas: de 0 a 4 por chunk sobre la piedra del End):
//   ChorusFlowerBlock.generatePlant, tallos que suben y se ramifican hasta cuatro veces (a menos de 8 bloques del
//   pie) y acaban en flores muertas;
// - la plataforma de obsidiana (end_platform, 5 × 5 en y = 48 con aire encima) donde se llega al End.
// - en la isla central, los diez pilares de obsidiana y el podio del portal de salida, apagado (endIsland.ts);
// - en las tierras altas, alguna puerta del End de vuelta (end_gateway_return: una de cada 700 chunks, de 3 a 9
//   bloques sobre el suelo), que lleva a la plataforma de llegada.
// Como en el Nether, la decoración de un chunk puede pasar a sus vecinos: cada chunk se decora una vez sobre el
// terreno base y lo que pone se guarda; un chunk es su base más lo que ponen en él los nueve de alrededor.
import { CHUNK_SIZE, CHUNK_VOLUME, MIN_Y, MAX_Y, blockIndex, hash2 } from '../constants';
import { AIR, END_STONE, OBSIDIAN, CHORUS_PLANT, CHORUS_FLOWER, CHORUS_FLOWER_DEAD_AGE, FIRE } from '../blocks';
import { endSpikes, drawSpike, drawPodium, drawGateway } from './endIsland';
import { TerrainGenerator, type ColumnInfo, type GenResult } from './terrain';
import { EndTerrain, END_HEIGHT, endBaseIndex } from './endTerrain';
import { mulberry32 } from './noise';
import { BIOME_END_HIGHLANDS, BIOME_END_MIDLANDS, BIOME_SMALL_END_ISLANDS, BIOME_THE_END } from './biomeIds';
import { endCityPieces, endCityRegionChunk, endCityStartY, drawEndCity, cityBounds, END_CITY_GRID, type CityPiece, type CityBox, type Rot } from './endCity';
import { Canvas, type StructureChest, type StructureMob } from './structures';
import { MOB_SHULKER } from '../endMobs';
import { ENT_FRAME } from '../paintings';
import { ELYTRA } from '../items';

/** Donde se llega al End (encima de la plataforma de obsidiana). */
export const END_SPAWN: readonly [number, number, number] = [100, 49, 0];

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

/** Lo que se lee y escribe mientras se decora un chunk. */
interface Level {
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
}

const HORIZ: readonly (readonly [number, number])[] = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/** allNeighborsEmpty de ChorusFlowerBlock (los cuatro lados salvo `ignore`). */
function neighborsEmpty(l: Level, x: number, y: number, z: number, ignore: number): boolean {
  for (let d = 0; d < 4; d++) if (d !== ignore && l.get(x + HORIZ[d][0], y, z + HORIZ[d][1]) !== AIR) return false;
  return true;
}

/** ChorusFlowerBlock.growTreeRecursive. */
function growChorus(l: Level, r: () => number, x: number, y: number, z: number, sx: number, sz: number, spread: number, depth: number): void {
  let height = Math.floor(r() * 4) + 1;
  if (depth === 0) height++;
  for (let i = 0; i < height; i++) {
    if (!neighborsEmpty(l, x, y + i + 1, z, -1)) return;
    l.set(x, y + i + 1, z, CHORUS_PLANT);
  }
  let placed = false;
  if (depth < 4) {
    let stems = Math.floor(r() * 4);
    if (depth === 0) stems++;
    for (let i = 0; i < stems; i++) {
      const d = Math.floor(r() * 4);
      const tx = x + HORIZ[d][0], ty = y + height, tz = z + HORIZ[d][1];
      if (Math.abs(tx - sx) < spread && Math.abs(tz - sz) < spread && l.get(tx, ty, tz) === AIR && l.get(tx, ty - 1, tz) === AIR
        && neighborsEmpty(l, tx, ty, tz, d ^ 1)) {
        placed = true;
        l.set(tx, ty, tz, CHORUS_PLANT);
        growChorus(l, r, tx, ty, tz, sx, sz, spread, depth + 1);
      }
    }
  }
  if (!placed) l.set(x, y + height, z, CHORUS_FLOWER + CHORUS_FLOWER_DEAD_AGE);
}

/** ChorusFlowerBlock.generatePlant: el pie en (x, y, z) y el resto del árbol (hasta `spread` de él). */
export function generateChorusPlant(l: Level, r: () => number, x: number, y: number, z: number, spread = 8): void {
  l.set(x, y, z, CHORUS_PLANT);
  growChorus(l, r, x, y, z, x, z, spread, 0);
}

/** EndIslandFeature: un cono de piedra del End bajo (x, y, z). */
function endIsland(l: Level, r: () => number, x: number, y: number, z: number): void {
  let size = Math.floor(r() * 3) + 4;
  for (let dy = 0; size > 0.5; dy--) {
    for (let dx = Math.floor(-size); dx <= Math.ceil(size); dx++) {
      for (let dz = Math.floor(-size); dz <= Math.ceil(size); dz++) {
        if (dx * dx + dz * dz <= (size + 1) * (size + 1)) l.set(x + dx, y + dy, z + dz, END_STONE);
      }
    }
    size -= Math.floor(r() * 2) + 0.5;
  }
}

/** Una ciudad del End: su arranque, sus piezas y lo que ocupan. */
export interface EndCity {
  x: number;
  y: number;
  z: number;
  pieces: CityPiece[];
  box: CityBox;
}

/** Lo más que se aleja una ciudad de su arranque (de sobra: las más grandes no pasan de unos 120 bloques). */
const CITY_REACH = 160;

function inBox(b: CityBox, x: number, y: number, z: number, pad: number): boolean {
  return x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
}

export class EndGenerator extends TerrainGenerator {
  readonly terrain: EndTerrain;
  private readonly bases = new Lru<Uint16Array>(96);
  private readonly decorations = new Lru<Int32Array>(64);
  private readonly cities = new Lru<EndCity | null>(64);

  constructor(seed: number) {
    super(seed);
    this.terrain = new EndTerrain(seed);
  }

  override columnInfo(x: number, z: number, out: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 }): ColumnInfo {
    out.height = this.surfaceAt(x, z);
    out.amp = 0;
    out.temp = 0.5;
    out.humid = 0.5;
    out.mount = 0;
    out.cont = 0;
    out.biome = this.terrain.biomeAt(x, z);
    return out;
  }

  override biomeAt(x: number, z: number): number {
    return this.terrain.biomeAt(x, z);
  }

  override caveBiomeAt(): number {
    return 0;
  }

  /** Bloque más alto del terreno base en (x, z) (−1 si es vacío). */
  override surfaceAt(x: number, z: number): number {
    for (let y = END_HEIGHT - 1; y >= 0; y--) if (this.baseAt(x, y, z) !== AIR) return y;
    return -1;
  }

  private base(cx: number, cz: number): Uint16Array {
    return this.bases.get(chunkKey(cx, cz), () => this.terrain.baseChunk(cx, cz));
  }

  /** Bloque del terreno base (aire fuera del alto del End). */
  baseAt(x: number, y: number, z: number): number {
    if (y < 0 || y >= END_HEIGHT) return AIR;
    return this.base(x >> 4, z >> 4)[endBaseIndex(x & 15, y, z & 15)];
  }

  override findSpawn(): { x: number; y: number; z: number } {
    return { x: END_SPAWN[0] + 0.5, y: END_SPAWN[1], z: END_SPAWN[2] + 0.5 };
  }

  /**
   * La ciudad del End de la región (rx, rz), si la hay (EndCityStructure.findGenerationPoint): en el bloque 7,7 de su
   * chunk, en las tierras altas o medias, girada al azar, a la menor altura de las esquinas hacia donde mira (≥ 60).
   */
  cityInRegion(rx: number, rz: number): EndCity | null {
    return this.cities.get(chunkKey(rx, rz), () => {
      const [cx, cz] = endCityRegionChunk(this.seed, rx, rz);
      const x = cx * 16 + 7, z = cz * 16 + 7;
      const biome = this.terrain.biomeAt(x, z);
      if (biome !== BIOME_END_HIGHLANDS && biome !== BIOME_END_MIDLANDS) return null;
      const h = hash2(cx, cz, this.seed ^ 0x3c17e);
      const rot = (h & 3) as Rot;
      const y = endCityStartY((sx, sz) => this.surfaceAt(sx, sz), x, z, rot);
      if (y < 60) return null;
      const pieces = endCityPieces(h >>> 2, x, y, z, rot);
      return { x, y, z, pieces, box: cityBounds(pieces) };
    });
  }

  /** Las ciudades que tocan el cuadrado de bloques [x0, x1] × [z0, z1]. */
  citiesNear(x0: number, z0: number, x1: number, z1: number): EndCity[] {
    const span = END_CITY_GRID.spacing * 16, reach = CITY_REACH;
    const out: EndCity[] = [];
    for (let rz = Math.floor((z0 - reach) / span); rz <= Math.floor((z1 + reach) / span); rz++) {
      for (let rx = Math.floor((x0 - reach) / span); rx <= Math.floor((x1 + reach) / span); rx++) {
        const c = this.cityInRegion(rx, rz);
        if (c && c.box.x0 <= x1 && c.box.x1 >= x0 && c.box.z0 <= z1 && c.box.z1 >= z0) out.push(c);
      }
    }
    return out;
  }

  /** /localizar ciudad del End: la de la región más cercana (en anillos de regiones). */
  locateCity(x: number, z: number, maxRegions = 12): [number, number, number] | null {
    const span = END_CITY_GRID.spacing * 16;
    const rx0 = Math.floor(x / span), rz0 = Math.floor(z / span);
    let best = null as EndCity | null, bd = Infinity;
    for (let r = 0; r <= maxRegions; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const c = this.cityInRegion(rx0 + dx, rz0 + dz);
          if (!c) continue;
          const d = Math.hypot(c.x - x, c.z - z);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
      }
      // Un anillo más allá del primero con ciudad ya no puede traer una más cercana.
      if (best && bd < r * span) break;
    }
    return best ? [best.x, best.y, best.z] : null;
  }

  /** Decora el chunk (ocx, ocz) sobre el terreno base: lo que pone (x, y, z, id, …). */
  private decoration(ocx: number, ocz: number): Int32Array {
    return this.decorations.get(chunkKey(ocx, ocz), () => {
      const written = new Map<number, number>();
      const x0 = ocx * 16, z0 = ocz * 16;
      // Clave relativa al chunk (lo que pone una decoración no se aleja más de 64 bloques de su chunk).
      const key = (x: number, y: number, z: number) => ((x - x0 + 64) * 256 + (z - z0 + 64)) * 256 + y;
      const l: Level = {
        get: (x, y, z) => written.get(key(x, y, z)) ?? this.baseAt(x, y, z),
        set: (x, y, z, id) => {
          if (y >= 0 && y < 256) written.set(key(x, y, z), id);
        },
      };
      const rand = (step: number) => mulberry32(hash2(ocx * 31 + step, ocz * 17 + step * 131, this.seed ^ 0xe4d0));
      // Paso 0: islas pequeñas.
      {
        const r = rand(0);
        if (Math.floor(r() * 14) === 0) {
          const n = r() < 0.75 ? 1 : 2;
          for (let i = 0; i < n; i++) {
            const x = x0 + Math.floor(r() * 16), z = z0 + Math.floor(r() * 16), y = 55 + Math.floor(r() * 16);
            if (this.terrain.biomeAt(x, z) === BIOME_SMALL_END_ISLANDS) endIsland(l, r, x, y, z);
          }
        }
      }
      // Paso 4 (superficie): los pilares de la isla central (cada uno, en el chunk de su centro) y el podio.
      for (const sp of endSpikes(this.seed)) if (sp.x >> 4 === ocx && sp.z >> 4 === ocz) drawSpike(l, sp, FIRE);
      if (ocx === 0 && ocz === 0) drawPodium(l, 0, this.surfaceAt(0, 0), 0, false);
      // Paso 4: la puerta de vuelta de las tierras altas.
      {
        const r = rand(4);
        if (Math.floor(r() * 700) === 0) {
          const x = x0 + Math.floor(r() * 16), z = z0 + Math.floor(r() * 16);
          const top = this.surfaceAt(x, z);
          if (top > 0 && this.terrain.biomeAt(x, z) === BIOME_END_HIGHLANDS) drawGateway(l, x, top + 3 + Math.floor(r() * 7), z);
        }
      }
      // Paso 9: plantas de coro en las tierras altas (no dentro de una ciudad, que se pone antes, en el paso 4).
      {
        const r = rand(9);
        const cities = this.citiesNear(x0 - 8, z0 - 8, x0 + 23, z0 + 23);
        const inCity = (x: number, y: number, z: number) => cities.some((c) => inBox(c.box, x, y, z, 8));
        const n = Math.floor(r() * 5);
        for (let i = 0; i < n; i++) {
          const x = x0 + Math.floor(r() * 16), z = z0 + Math.floor(r() * 16);
          let y = END_HEIGHT;
          while (y > 0 && l.get(x, y - 1, z) === AIR) y--;
          if (y <= 0 || this.terrain.biomeAt(x, z) !== BIOME_END_HIGHLANDS) continue;
          if (l.get(x, y, z) === AIR && l.get(x, y - 1, z) === END_STONE && !inCity(x, y, z)) generateChorusPlant(l, r, x, y, z, 8);
        }
      }
      // Paso 10: la plataforma de obsidiana donde se llega (en su chunk).
      if (ocx === END_SPAWN[0] >> 4 && ocz === END_SPAWN[2] >> 4 && this.terrain.biomeAt(END_SPAWN[0], END_SPAWN[2]) === BIOME_THE_END) {
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = -1; dy <= 2; dy++) l.set(END_SPAWN[0] + dx, END_SPAWN[1] + dy, END_SPAWN[2] + dz, dy === -1 ? OBSIDIAN : AIR);
          }
        }
      }
      const out = new Int32Array(written.size * 4);
      let i = 0;
      for (const [k, id] of written) {
        const y = k % 256, xz = Math.floor(k / 256);
        out[i++] = Math.floor(xz / 256) - 64 + x0;
        out[i++] = y;
        out[i++] = (xz % 256) - 64 + z0;
        out[i++] = id;
      }
      return out;
    });
  }

  override generate(cx: number, cz: number): GenResult {
    const blocks = new Uint16Array(CHUNK_VOLUME);
    const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const base = this.base(cx, cz);
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        for (let y = 0; y < END_HEIGHT; y++) {
          const b = base[endBaseIndex(lx, y, lz)];
          if (b !== AIR) blocks[blockIndex(lx, y, lz)] = b;
        }
      }
    }
    const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const w = this.decoration(cx + dx, cz + dz);
        for (let i = 0; i < w.length; i += 4) {
          const lx = w[i] - x0, lz = w[i + 2] - z0;
          if (lx >= 0 && lx < 16 && lz >= 0 && lz < 16) blocks[blockIndex(lx, w[i + 1], lz)] = w[i + 3];
        }
      }
    }
    // Las ciudades del End (con sus cofres, sus centinelas shulker y, en el barco, el marco con los élitros).
    const chests: StructureChest[] = [], mobs: StructureMob[] = [];
    const c = new Canvas(blocks, x0, z0, chests, [], mobs);
    for (const city of this.citiesNear(x0, z0, x0 + 15, z0 + 15)) {
      drawEndCity(c, city.pieces, {
        chest: () => {},
        sentry: (x, y, z) => c.mob(MOB_SHULKER, x + 0.5, y, z + 0.5),
        elytra: (x, y, z, facing) => {
          if (c.inside(x, y, z)) mobs.push({ type: ENT_FRAME, x, y, z, variant: ELYTRA, facing });
        },
      });
    }
    for (let lz = 0; lz < 16; lz++) {
      for (let lx = 0; lx < 16; lx++) {
        let y = MAX_Y - 1;
        while (y > MIN_Y && blocks[blockIndex(lx, y, lz)] === AIR) y--;
        heights[lz * 16 + lx] = y;
      }
    }
    const tint = new Uint8Array(64);
    for (let i = 0; i < 16; i++) tint.set([140, 150, 100, 128], i * 4);
    return { blocks, tint, heights, chests, villagers: [], mobs };
  }
}

