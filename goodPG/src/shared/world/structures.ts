// Estructuras de la fase 5: mazmorras, minas abandonadas, templos del desierto y de la jungla,
// naufragios, portales en ruinas, iglús y pozos del desierto.
//
// Como los árboles, cada estructura se decide de forma determinista (semilla + posición) y cada
// chunk dibuja sólo la parte que le toca: así cruzan bordes de chunk sin coordinarse. Las de
// superficie se reparten en una rejilla de regiones (como los "structure sets" de Minecraft: una
// candidata por región, que vale si el bioma y el terreno encajan); las minas nacen en un chunk al
// azar y se ramifican; las mazmorras se buscan dentro de cada chunk junto a una cueva.
import {
  AIR, WATER, COBBLESTONE, MOSSY_COBBLESTONE, SANDSTONE, OBSIDIAN, GOLD_BLOCK, SNOW_BLOCK, CRAFTING_TABLE, FURNACE,
  CHEST, TORCH, OAK_PLANKS, SPRUCE_PLANKS, SPRUCE_LOG, STONE_BRICKS, LADDER, FENCES, SLABS, BEDS, TRAPDOORS,
  COLORED_TERRACOTTA, MOB_SPAWNER, COBWEB, CHISELED_SANDSTONE, CUT_SANDSTONE, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS,
  NETHERRACK, CRYING_OBSIDIAN, BLOCK_OPAQUE, BLOCK_FLUID, isLeaves, isLog, stateOf,
} from '../blocks';
import { CHUNK_SIZE, SEA_LEVEL, MIN_Y, MAX_Y, blockIndex, hash2, hash3 } from '../constants';
import { mulberry32 } from './noise';
import type { TerrainGenerator, ColumnInfo } from './terrain';
import { iglooBrick } from './materialDecor'; // Fase 6.5 (materiales)
import {
  BIOME_DESERT, BIOME_JUNGLE, BIOME_SNOWY, BIOME_ICE_SPIKES, isOceanBiome, BIOME_BEACH, BIOME_FROZEN_OCEAN, baseBiome, BIOME_BADLANDS,
} from './biomeIds';
import { buildVillage, isVillageBiome, VILLAGE_RADIUS } from './villages';
import type { VillagerSpawn } from './villages'; // Fase 6 (aldeanos)
import { buildOutpost, outpostCandidate, OUTPOST_RADIUS, OUTPOST_VILLAGE_GAP } from './outposts'; // Fase 6 (asaltos)
import { buildAncientCity, ancientCitySite, ANCIENT_CITY_RADIUS } from './ancientCity'; // Fase 7.5 (abismo)
import { OCEAN_STRUCTURES, OCEAN_STRUCTURE_NAMES } from './oceanStructures'; // Fase 7.5 (océano)
// Fase 7.5 (fauna): cabañas de bruja y fósiles.
import { buildSwampHut, swampHutSite, SWAMP_HUT_RADIUS, SWAMP_HUT_SALT } from './swampHut';
import { buildFossil, fossilSite, FOSSIL_RADIUS } from './fossils';
import { isDeepDark } from './deepDark'; // el Deep Dark bloquea las minas (mineshaft_blocking)
import { buildMansion, mansionSite, MANSION_RADIUS } from './mansion'; // Fase 7.5 (mansión)
import { placeStrongholds, locateStronghold } from './stronghold'; // Fase 8.6 (el End)
import { mineshaftAt, mineshaftsNear, drawMineshaft, type MineSite, type MineDrawSite, type MineCart } from './mineshaft'; // minas de Java 26.3
import { ENT_CHEST_MINECART } from '../vehicles';

/** Cofre de una estructura: posición y tabla de botín (se llena en el servidor al generar el chunk). */
export interface StructureChest {
  x: number;
  y: number;
  z: number;
  table: string;
}

/** Fase 7.5 (océano, mansión): criatura que aparece con la estructura al generarse su chunk (se guarda y no desaparece). */
export interface StructureMob {
  type: number;
  x: number;
  y: number;
  z: number;
  /** Fase 7.5 (fauna): variante (la piel del gato negro de la cabaña de bruja). Fase 8.6: en un marco, el objeto. */
  variant?: number;
  /** Fase 8.6: hacia dónde mira (el marco con los élitros del barco del End). */
  facing?: number;
}

/** Lienzo de un chunk: escribe sólo dentro del chunk y anota los cofres. */
export class Canvas {
  constructor(
    readonly blocks: Uint16Array,
    readonly x0: number,
    readonly z0: number,
    readonly chests: StructureChest[],
    /** Fase 6 (aldeanos): aldeanos que aparecen con el chunk. */
    readonly villagers: VillagerSpawn[] = [],
    /** Fase 7.5 (océano): criaturas de estructura que aparecen con el chunk. */
    readonly mobs: StructureMob[] = [],
  ) {}

  /** Fase 7.5 (océano, mansión): criatura de la estructura en (x, y, z) (la anota el chunk que la contiene). */
  mob(type: number, x: number, y: number, z: number, variant?: number): void {
    if (this.inside(Math.floor(x), Math.floor(y), Math.floor(z))) this.mobs.push(variant === undefined ? { type, x, y, z } : { type, x, y, z, variant });
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= this.x0 && x < this.x0 + CHUNK_SIZE && z >= this.z0 && z < this.z0 + CHUNK_SIZE && y > MIN_Y + 4 && y < MAX_Y;
  }

  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.blocks[blockIndex(x - this.x0, y, z - this.z0)] : -1;
  }

  set(x: number, y: number, z: number, id: number): void {
    if (this.inside(x, y, z)) this.blocks[blockIndex(x - this.x0, y, z - this.z0)] = id;
  }

  /** Hueco: aire (o agua, bajo el nivel del mar si `wet`). */
  clear(x: number, y: number, z: number, wet = false): void {
    this.set(x, y, z, wet && y < SEA_LEVEL ? WATER : AIR);
  }

  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number | ((x: number, y: number, z: number) => number)): void {
    for (let y = y0; y <= y1; y++) {
      for (let z = z0; z <= z1; z++) {
        for (let x = x0; x <= x1; x++) this.set(x, y, z, typeof id === 'number' ? id : id(x, y, z));
      }
    }
  }

  /** Fase 6 (aldeanos): aldeano que aparecerá al generarse este chunk por primera vez. */
  villager(v: VillagerSpawn): void {
    this.villagers.push(v);
  }

  chest(x: number, y: number, z: number, facing: number, table: string): void {
    if (!this.inside(x, y, z)) return;
    this.set(x, y, z, CHEST + facing);
    this.chests.push({ x, y, z, table });
  }

  /** Cimientos: rellena hacia abajo con `id` hasta dar con suelo firme (máximo 14 bloques). */
  foundation(x: number, y: number, z: number, id: number): void {
    for (let yy = y; yy > y - 14; yy--) {
      const b = this.get(x, yy, z);
      if (b < 0) return;
      if (b !== AIR && BLOCK_OPAQUE[b] && !isLeaves(b) && !isLog(b)) return;
      this.set(x, yy, z, id);
    }
  }

  /** Despeja árboles, plantas y tierra por encima de una huella (hasta `h` bloques). */
  clearAbove(x: number, y: number, z: number, h: number): void {
    for (let yy = y; yy < y + h; yy++) {
      const b = this.get(x, yy, z);
      if (b > 0 && !BLOCK_FLUID[b]) this.set(x, yy, z, AIR);
    }
  }
}

// ------------------------------------------------------------------ tipos de estructura

export interface Start {
  key: string;
  x: number;
  y: number;
  z: number;
  rng: number;
  /** Caja que ocupa (para saber qué chunks toca). */
  box: [number, number, number, number];
}

export interface GridType {
  key: string;
  spacing: number;
  separation: number;
  salt: number;
  /** Radio de la caja alrededor del origen (bloques). */
  radius: number;
  /** ¿Vale la candidata? Devuelve la altura del origen o null. */
  site(gen: TerrainGenerator, x: number, z: number, info: ColumnInfo): number | null;
  build(c: Canvas, s: Start, gen: TerrainGenerator): void;
}

const tmp: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

/** Altura del terreno (bloque más alto) y pendiente máxima en una cruz de radio r. */
function flatness(gen: TerrainGenerator, x: number, z: number, r: number): [number, number] {
  let lo = 1e9, hi = -1e9;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const h = gen.surfaceAt(x + dx, z + dz, gen.columnInfo(x + dx, z + dz, tmp));
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
  }
  return [gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp)), hi - lo];
}

const GRID: GridType[] = [
  {
    key: 'desert_pyramid', spacing: 32, separation: 8, salt: 14357617, radius: 11,
    site: (gen, x, z, inf) => {
      if (inf.biome !== BIOME_DESERT) return null;
      const [h, slope] = flatness(gen, x, z, 9);
      return slope <= 6 && h >= SEA_LEVEL ? h : null;
    },
    build: buildDesertPyramid,
  },
  {
    key: 'jungle_temple', spacing: 32, separation: 8, salt: 14357619, radius: 9,
    site: (gen, x, z, inf) => {
      if (baseBiome(inf.biome) !== BIOME_JUNGLE) return null;
      const [h, slope] = flatness(gen, x, z, 6);
      return slope <= 6 && h >= SEA_LEVEL ? h : null;
    },
    build: buildJungleTemple,
  },
  {
    key: 'shipwreck', spacing: 24, separation: 4, salt: 165745295, radius: 11,
    site: (gen, x, z, inf) => {
      if (!(isOceanBiome(inf.biome) && inf.biome !== BIOME_FROZEN_OCEAN) && baseBiome(inf.biome) !== BIOME_BEACH) return null;
      const h = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp));
      return h < SEA_LEVEL - 4 ? h : null;
    },
    build: buildShipwreck,
  },
  {
    key: 'ruined_portal', spacing: 40, separation: 15, salt: 34222645, radius: 7,
    site: (gen, x, z, inf) => {
      if (isOceanBiome(inf.biome)) return null;
      const [h, slope] = flatness(gen, x, z, 4);
      return slope <= 5 && h >= SEA_LEVEL ? h : null;
    },
    build: buildRuinedPortal,
  },
  {
    key: 'igloo', spacing: 32, separation: 8, salt: 14357618, radius: 5,
    site: (gen, x, z, inf) => {
      if (baseBiome(inf.biome) !== BIOME_SNOWY && inf.biome !== BIOME_ICE_SPIKES) return null;
      const [h, slope] = flatness(gen, x, z, 4);
      return slope <= 3 && h >= SEA_LEVEL ? h : null;
    },
    build: buildIgloo,
  },
  {
    key: 'desert_well', spacing: 20, separation: 6, salt: 40013, radius: 3,
    site: (gen, x, z, inf) => {
      if (inf.biome !== BIOME_DESERT) return null;
      const [h, slope] = flatness(gen, x, z, 2);
      return slope <= 2 && h >= SEA_LEVEL ? h : null;
    },
    build: buildDesertWell,
  },
  {
    key: 'village', spacing: 34, separation: 8, salt: 10387312, radius: VILLAGE_RADIUS,
    site: (gen, x, z, inf) => {
      if (!isVillageBiome(inf.biome)) return null;
      const [h, slope] = flatness(gen, x, z, 14);
      return slope <= 6 && h >= SEA_LEVEL + 1 ? h : null;
    },
    build: buildVillage,
  },
  // Fase 6 (asaltos): puestos de saqueadores, nunca cerca de una aldea.
  {
    key: 'pillager_outpost', spacing: 32, separation: 8, salt: 165745296, radius: OUTPOST_RADIUS,
    site: (gen, x, z, inf) => {
      if (!outpostCandidate(inf.biome, x, z, gen.seed)) return null;
      const [h, slope] = flatness(gen, x, z, 7);
      if (slope > 4 || h < SEA_LEVEL + 1) return null;
      const v = locateStructure(gen, 'village', x, z, 1);
      return v && Math.hypot(v[0] - x, v[2] - z) < OUTPOST_VILLAGE_GAP ? null : h;
    },
    build: buildOutpost,
  },
  // Fase 7.5 (abismo): ciudades antiguas, en el Deep Dark (regiones de 24 chunks, como en Minecraft).
  { key: 'ancient_city', spacing: 24, separation: 8, salt: 20083232, radius: ANCIENT_CITY_RADIUS, site: (gen, x, z) => ancientCitySite(gen, x, z), build: buildAncientCity },
  ...OCEAN_STRUCTURES, // Fase 7.5 (océano): monumentos, ruinas oceánicas y tesoros enterrados
  // Fase 7.5 (fauna): cabañas de bruja en los pantanos y fósiles enterrados (desiertos y pantanos).
  {
    key: 'swamp_hut', spacing: 32, separation: 8, salt: SWAMP_HUT_SALT, radius: SWAMP_HUT_RADIUS,
    site: (gen, x, z, inf) => swampHutSite(inf.biome, gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp))),
    build: buildSwampHut,
  },
  {
    key: 'fossil', spacing: 6, separation: 2, salt: 14357921, radius: FOSSIL_RADIUS,
    site: (gen, x, z, inf) => fossilSite(gen, x, z, inf.biome, gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp))),
    build: (c, s, gen) => buildFossil(c, s, gen.seed),
  },
  // Fase 7.5 (mansión): la mansión del bosque, sólo en el bosque oscuro y muy rara (como en Minecraft).
  {
    key: 'mansion', spacing: 80, separation: 20, salt: 10387319, radius: MANSION_RADIUS,
    site: (gen, x, z, inf) => mansionSite(gen, x, z, inf),
    build: buildMansion,
  },
];

/** Nombres en español de las estructuras (y las claves que acepta /localizar). */
export const STRUCTURE_NAMES: Readonly<Record<string, string>> = {
  desert_pyramid: 'Templo del desierto', jungle_temple: 'Templo de la jungla', shipwreck: 'Naufragio',
  ruined_portal: 'Portal en ruinas', igloo: 'Iglú', desert_well: 'Pozo del desierto', mineshaft: 'Mina abandonada',
  village: 'Aldea', pillager_outpost: 'Puesto de saqueadores',
  ancient_city: 'Ciudad antigua', // Fase 7.5 (abismo)
  ...OCEAN_STRUCTURE_NAMES, // Fase 7.5 (océano)
  swamp_hut: 'Cabaña de bruja', fossil: 'Fósil', // Fase 7.5 (fauna)
  mansion: 'Mansión del bosque', // Fase 7.5 (mansión)
  stronghold: 'Fortaleza', // Fase 8.6 (el End)
};

const startCache = new Map<string, Start | null>();

function gridStart(gen: TerrainGenerator, t: GridType, rx: number, rz: number): Start | null {
  const key = `${gen.seed}:${t.key}:${rx},${rz}`;
  const cached = startCache.get(key);
  if (cached !== undefined) return cached;
  if (startCache.size > 4000) startCache.clear();
  const h = hash2(rx, rz, gen.seed ^ t.salt);
  const range = t.spacing - t.separation;
  const cx = rx * t.spacing + (h % range), cz = rz * t.spacing + ((h >>> 12) % range);
  const x = cx * 16 + 8, z = cz * 16 + 8;
  const inf = gen.columnInfo(x, z, { ...tmp });
  const y = t.site(gen, x, z, inf);
  const s: Start | null = y === null ? null : {
    key: t.key, x, y, z, rng: hash2(cx, cz, gen.seed ^ (t.salt * 7)),
    box: [x - t.radius, z - t.radius, x + t.radius, z + t.radius],
  };
  startCache.set(key, s);
  return s;
}

// ------------------------------------------------------------------ colocación en un chunk

/** Dibuja en el chunk (cx, cz) todas las estructuras que lo tocan y devuelve sus cofres. */
export function placeStructures(
  gen: TerrainGenerator, blocks: Uint16Array, cx: number, cz: number, tops: Int16Array,
  villagers: VillagerSpawn[] = [], // Fase 6 (aldeanos)
  mobs: StructureMob[] = [], // Fase 7.5 (océano)
  ticks: number[] = [], // Fase 8.6: los fluidos que ponen (la fuente y la lava de las fortalezas)
): StructureChest[] {
  const chests: StructureChest[] = [];
  const x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
  const c = new Canvas(blocks, x0, z0, chests, villagers, mobs);
  placeDungeon(gen, c, cx, cz, tops);
  // Minas abandonadas (MineshaftPieces de Java 26.3), con sus vagonetas con cofre.
  const carts: MineCart[] = [];
  const draw = mineDrawSite(gen, c);
  for (const m of mineshaftsNear(mineSite(gen), cx, cz)) drawMineshaft(c, m, draw, carts);
  for (const k of carts) mobs.push({ type: ENT_CHEST_MINECART, x: k.x, y: k.y, z: k.z });
  void tops;
  for (const t of GRID) {
    const r0 = Math.floor((x0 - t.radius) / 16 / t.spacing), r1 = Math.floor((x0 + 15 + t.radius) / 16 / t.spacing);
    const q0 = Math.floor((z0 - t.radius) / 16 / t.spacing), q1 = Math.floor((z0 + 15 + t.radius) / 16 / t.spacing);
    for (let rz = q0; rz <= q1; rz++) {
      for (let rx = r0; rx <= r1; rx++) {
        const s = gridStart(gen, t, rx, rz);
        if (!s || s.box[2] < x0 || s.box[0] > x0 + 15 || s.box[3] < z0 || s.box[1] > z0 + 15) continue;
        t.build(c, s, gen);
      }
    }
  }
  placeStrongholds(gen, c, ticks); // Fase 8.6 (el End)
  return chests;
}

/** Fase 7.5 (mansión): origen de la estructura `key` de la región que contiene (x, z), si la hay. */
export function structureStartAt(gen: TerrainGenerator, key: string, x: number, z: number): Start | null {
  const t = GRID.find((g) => g.key === key);
  return t ? gridStart(gen, t, Math.floor(Math.floor(x / 16) / t.spacing), Math.floor(Math.floor(z / 16) / t.spacing)) : null;
}

/**
 * Fase 7.5 (mansión): regiones en las que buscan /localizar y los mapas de explorador, como en Minecraft
 * (findNearestMapStructure con radio 100 en regiones de la rejilla de cada estructura). Se deja de buscar
 * en cuanto ninguna región más lejana puede estar más cerca, así que suele costar pocos milisegundos; sin
 * ninguna en todo el radio (el peor caso) son ~40 000 columnas, unos 100–150 ms.
 */
export const LOCATE_REGIONS = 100;

/** Estructura más cercana de un tipo a (x, z): [x, y, z] o null (busca hasta `maxRegions` regiones). */
export function locateStructure(
  gen: TerrainGenerator, key: string, x: number, z: number, maxRegions = 12, accept?: (x: number, z: number) => boolean,
): [number, number, number] | null {
  if (key === 'stronghold') return locateStronghold(gen, x, z); // Fase 8.6
  if (key === 'mineshaft') {
    const cx = Math.floor(x / 16), cz = Math.floor(z / 16);
    let best: [number, number, number] | null = null, bd = Infinity;
    const site = mineSite(gen);
    for (let r = 0; r <= 60 && !best; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const m = mineshaftAt(site, cx + dx, cz + dz);
          if (!m) continue;
          const d = Math.hypot(m.x - x, m.z - z);
          if (d < bd) { bd = d; best = [m.x, m.y, m.z]; }
        }
      }
    }
    return best;
  }
  const t = GRID.find((g) => g.key === key);
  if (!t) return null;
  const rx0 = Math.floor(x / 16 / t.spacing), rz0 = Math.floor(z / 16 / t.spacing);
  let best: [number, number, number] | null = null, bd = Infinity;
  for (let r = 0; r <= maxRegions; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const s = gridStart(gen, t, rx0 + dx, rz0 + dz);
        if (!s || (accept && !accept(s.x, s.z))) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = [s.x, s.y, s.z]; }
      }
    }
    // Una región más allá de la mejor ya no puede estar más cerca.
    if (best && (r + 1) * t.spacing * 16 > bd + t.spacing * 16) break;
  }
  return best;
}

// ------------------------------------------------------------------ mazmorras

/** Una mazmorra en algunos chunks: sala de roca con musgo junto a una cueva, generador y cofres. */
function placeDungeon(gen: TerrainGenerator, c: Canvas, cx: number, cz: number, tops: Int16Array): void {
  const h = hash2(cx, cz, gen.seed ^ 0xd06e0);
  if (h % 4 !== 0) return;
  const rnd = mulberry32(h);
  for (let attempt = 0; attempt < 16; attempt++) {
    // Se parte del suelo de una cueva y la sala se coloca pegada a ella (la cueva queda en una pared).
    const lx = 4 + Math.floor(rnd() * 8), lz = 4 + Math.floor(rnd() * 8);
    const top = Math.min(tops[lz * 16 + lx] - 10, 60);
    const floors: number[] = [];
    for (let y = MIN_Y + 8; y < top; y++) {
      if (c.get(c.x0 + lx, y, c.z0 + lz) === AIR && BLOCK_OPAQUE[Math.max(0, c.get(c.x0 + lx, y - 1, c.z0 + lz))]) floors.push(y);
    }
    if (floors.length === 0) continue;
    const y = floors[Math.floor(rnd() * floors.length)];
    const rx = 2 + Math.floor(rnd() * 2), rz = 2 + Math.floor(rnd() * 2);
    const d = Math.floor(rnd() * 4);
    const ax = c.x0 + lx + [0, rx + 1, 0, -rx - 1][d], az = c.z0 + lz + [-rz - 1, 0, rz + 1, 0][d];
    // Dentro del chunk, sin fluidos, suelo y techo casi macizos y alguna abertura a la cueva.
    let ok = ax - rx - 1 >= c.x0 && ax + rx + 1 < c.x0 + 16 && az - rz - 1 >= c.z0 && az + rz + 1 < c.z0 + 16;
    let openings = 0, solid = 0, cells = 0;
    for (let dz = -rz - 1; dz <= rz + 1 && ok; dz++) {
      for (let dx = -rx - 1; dx <= rx + 1 && ok; dx++) {
        const f = c.get(ax + dx, y - 1, az + dz), t = c.get(ax + dx, y + 3, az + dz);
        if (f < 0 || t < 0) ok = false;
        cells += 2;
        if (BLOCK_OPAQUE[Math.max(0, f)]) solid++;
        if (BLOCK_OPAQUE[Math.max(0, t)]) solid++;
        for (let dy = -1; dy < 4; dy++) {
          const b = c.get(ax + dx, y + dy, az + dz);
          if (b > 0 && BLOCK_FLUID[b]) ok = false;
        }
        const wall = Math.abs(dx) === rx + 1 || Math.abs(dz) === rz + 1;
        if (wall && c.get(ax + dx, y, az + dz) === AIR && c.get(ax + dx, y + 1, az + dz) === AIR) openings++;
      }
    }
    if (!ok || solid < cells * 0.8 || openings < 1 || openings > 8) continue;
    for (let dz = -rz - 1; dz <= rz + 1; dz++) {
      for (let dx = -rx - 1; dx <= rx + 1; dx++) {
        const wall = Math.abs(dx) === rx + 1 || Math.abs(dz) === rz + 1;
        const k = hash3(ax + dx, y, az + dz, gen.seed ^ 0x3055);
        c.set(ax + dx, y - 1, az + dz, k % 4 === 0 ? COBBLESTONE : MOSSY_COBBLESTONE);
        c.set(ax + dx, y + 3, az + dz, COBBLESTONE);
        for (let dy = 0; dy < 3; dy++) {
          if (!wall) c.set(ax + dx, y + dy, az + dz, AIR);
          else if (c.get(ax + dx, y + dy, az + dz) !== AIR) c.set(ax + dx, y + dy, az + dz, (k >>> dy) % 3 === 0 ? MOSSY_COBBLESTONE : COBBLESTONE);
        }
      }
    }
    c.set(ax, y, az, MOB_SPAWNER);
    // Uno o dos cofres contra las paredes, mirando hacia dentro.
    const n = 1 + (h >>> 8) % 2;
    for (let i = 0; i < n; i++) {
      const side = (h >>> (10 + i * 3)) % 4;
      const along = Math.floor(rnd() * 3) - 1;
      const [px, pz, f] = side === 0 ? [ax + along, az - rz, 2] : side === 1 ? [ax + rx, az + along, 3] : side === 2 ? [ax + along, az + rz, 0] : [ax - rx, az + along, 1];
      if (px === ax && pz === az) continue;
      c.chest(px, y, pz, f, 'dungeon');
    }
    return;
  }
}

// ------------------------------------------------------------------ minas abandonadas (mineshaft.ts)

const mineSites = new WeakMap<TerrainGenerator, MineSite>();

/** Lo que las minas necesitan saber del mundo para colocarse. */
function mineSite(gen: TerrainGenerator): MineSite {
  let s = mineSites.get(gen);
  if (!s) {
    const inf: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };
    s = {
      seed: gen.seed,
      isBadlands: (x, z) => baseBiome(gen.biomeAt(x, z)) === BIOME_BADLANDS,
      isDeepDark: (x, y, z) => isDeepDark(gen, x, y, z),
      surface: (x, z) => gen.surfaceAt(x, z, gen.columnInfo(x, z, inf)),
    };
    mineSites.set(gen, s);
  }
  return s;
}

/** Lo que el dibujo de una mina necesita del chunk: la superficie sin agua de cada columna y el agua de fuera. */
function mineDrawSite(gen: TerrainGenerator, c: Canvas): MineDrawSite {
  const floor = new Int16Array(256).fill(-32768);
  return {
    floorTop: (x, z) => {
      const i = (z - c.z0) * 16 + (x - c.x0);
      if (i < 0 || i >= 256) return MIN_Y;
      if (floor[i] === -32768) {
        let y = MAX_Y - 1;
        for (; y > MIN_Y; y--) {
          const b = c.blocks[blockIndex(x - c.x0, y, z - c.z0)];
          if (b !== AIR && !BLOCK_FLUID[b]) break;
        }
        floor[i] = y;
      }
      return floor[i];
    },
    fluidOutside: (x, y, z) => gen.generatedWaterAt(x, y, z),
    isDeepDark: (x, y, z) => isDeepDark(gen, x, y, z),
  };
}

// ------------------------------------------------------------------ templo del desierto

function buildDesertPyramid(c: Canvas, s: Start): void {
  const { x: ox, y: oy, z: oz } = s;
  const R = 10;
  for (let dz = -R; dz <= R; dz++) {
    for (let dx = -R; dx <= R; dx++) {
      c.foundation(ox + dx, oy - 1, oz + dz, SANDSTONE);
      c.clearAbove(ox + dx, oy, oz + dz, 16);
    }
  }
  for (let k = 0; k <= 10; k++) {
    const r = R - k;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const edge = Math.max(Math.abs(dx), Math.abs(dz)) === r;
        let id = SANDSTONE;
        if (k === 0) {
          // Suelo con un rombo de terracota en el centro.
          const d = Math.abs(dx) + Math.abs(dz);
          id = d <= 2 ? (d === 0 ? AIR : COLORED_TERRACOTTA.orange) : d === 3 ? COLORED_TERRACOTTA.white : SANDSTONE;
        } else if (!edge && k <= 6) id = AIR;
        else if (edge && k === 3) id = CUT_SANDSTONE;
        else if (edge && k === 2 && (dx + dz) % 4 === 0) id = CHISELED_SANDSTONE;
        c.set(ox + dx, oy + k, oz + dz, id);
      }
    }
  }
  // Entrada al sur.
  for (let dz = R - 4; dz <= R; dz++) for (let dx = -1; dx <= 1; dx++) for (let dy = 1; dy <= 3; dy++) c.set(ox + dx, oy + dy, oz + dz, AIR);
  // Cámara del tesoro bajo el suelo: se baja por el hueco del centro.
  const cy = oy - 12;
  c.fill(ox - 5, cy - 1, oz - 5, ox + 5, cy + 4, oz + 5, (x, y, z) => {
    const wall = Math.abs(x - ox) === 5 || Math.abs(z - oz) === 5 || y === cy - 1 || y === cy + 4;
    if (!wall) return AIR;
    return y === cy + 1 && (x + z) % 3 === 0 ? CHISELED_SANDSTONE : CUT_SANDSTONE;
  });
  for (let y = cy + 4; y < oy; y++) c.set(ox, y, oz, AIR);
  c.set(ox, cy - 1, oz, COLORED_TERRACOTTA.orange);
  c.chest(ox, cy, oz - 4, 2, 'desert_pyramid');
  c.chest(ox + 4, cy, oz, 3, 'desert_pyramid');
  c.chest(ox, cy, oz + 4, 0, 'desert_pyramid');
  c.chest(ox - 4, cy, oz, 1, 'desert_pyramid');
}

// ------------------------------------------------------------------ templo de la jungla

function buildJungleTemple(c: Canvas, s: Start, gen: TerrainGenerator): void {
  const { x: ox, y: oy, z: oz } = s;
  const W = 6, L = 7, H = 9;
  const rock = (x: number, y: number, z: number) => {
    const k = hash3(x, y, z, gen.seed ^ 0x7e3);
    return k % 5 < 2 ? MOSSY_COBBLESTONE : k % 7 === 0 ? MOSSY_STONE_BRICKS : k % 11 === 0 ? CRACKED_STONE_BRICKS : COBBLESTONE;
  };
  for (let dz = -L; dz <= L; dz++) {
    for (let dx = -W; dx <= W; dx++) {
      c.foundation(ox + dx, oy - 1, oz + dz, COBBLESTONE);
      c.clearAbove(ox + dx, oy, oz + dz, H + 6);
    }
  }
  for (let y = oy; y <= oy + H; y++) {
    const inset = y > oy + 5 ? y - oy - 5 : 0;
    for (let dz = -L + inset; dz <= L - inset; dz++) {
      for (let dx = -W + inset; dx <= W - inset; dx++) {
        const edge = Math.abs(dx) === W - inset || Math.abs(dz) === L - inset;
        const floor = y === oy || y === oy + 4;
        const x = ox + dx, z = oz + dz;
        if (edge || floor || y === oy + H) c.set(x, y, z, rock(x, y, z));
        else c.set(x, y, z, AIR);
      }
    }
  }
  // Puerta al norte y ventanas.
  for (let dy = 1; dy <= 3; dy++) for (let dx = -1; dx <= 1; dx++) c.set(ox + dx, oy + dy, oz - L, AIR);
  for (const dz of [-3, 3]) for (const dx of [-W, W]) c.set(ox + dx, oy + 2, oz + dz, AIR);
  // Sótano con dos cofres; se baja por una escalera de mano pegada a la pared sur.
  const by = oy - 5;
  c.fill(ox - 4, by - 1, oz - 3, ox + 4, oy - 1, oz + 3, (x, y, z) => {
    const wall = Math.abs(x - ox) === 4 || Math.abs(z - oz) === 3 || y === by - 1 || y === oy - 1;
    return wall ? rock(x, y, z) : AIR;
  });
  // La escalera se apoya en la pared sur del sótano y, arriba, en el suelo del templo.
  for (let y = by; y <= oy; y++) c.set(ox, y, oz + 2, stateOf(LADDER, { facing: 0 }));
  c.chest(ox - 3, by, oz, 1, 'jungle_temple');
  c.chest(ox + 3, by, oz - 2, 3, 'jungle_temple');
  c.set(ox + 3, by + 2, oz + 2, TORCH);
}

// ------------------------------------------------------------------ naufragio

function buildShipwreck(c: Canvas, s: Start): void {
  const { x: ox, z: oz } = s;
  const oy = s.y; // casco medio enterrado en el fondo
  const along = s.rng % 2 === 0; // eslora a lo largo de x o de z
  const wood = s.rng % 3 === 0 ? SPRUCE_PLANKS : OAK_PLANKS;
  const P = (u: number, v: number): [number, number] => (along ? [ox + u, oz + v] : [ox + v, oz + u]);
  const half = 9;
  for (let u = -half; u <= half; u++) {
    // Casco estrecho hacia proa y popa.
    const w = Math.abs(u) > half - 3 ? 1 : 2;
    for (let v = -w - 1; v <= w + 1; v++) {
      const [x, z] = P(u, v);
      for (let dy = 0; dy <= 4; dy++) {
        const side = Math.abs(v) === w + 1 || Math.abs(u) === half;
        const bottom = dy === 0;
        const deck = dy === 3 && (u < -3 || u > 3);
        const broken = hash3(x, oy + dy, z, s.rng) % 7 === 0;
        if ((side && dy <= 3) || bottom || deck) c.set(x, oy + dy, z, broken ? (oy + dy < SEA_LEVEL ? WATER : AIR) : wood);
        else c.clear(x, oy + dy, z, true);
      }
    }
  }
  // Mástil partido.
  const [mx, mz] = P(-1, 0);
  for (let dy = 1; dy <= 7; dy++) c.set(mx, oy + dy, mz, SPRUCE_LOG);
  // Cofres: provisiones en popa y tesoro en proa.
  const [sx, sz] = P(-half + 3, 0);
  const [tx, tz] = P(half - 3, 0);
  c.chest(sx, oy + 1, sz, along ? 1 : 2, 'shipwreck_supply');
  c.chest(tx, oy + 1, tz, along ? 3 : 0, 'shipwreck_treasure');
  // Fase 7.5 (océano): el cofre de los mapas, junto al mástil (siempre con un mapa del tesoro).
  const [mcx, mcz] = P(1, 1);
  c.chest(mcx, oy + 1, mcz, along ? 2 : 1, 'shipwreck_map');
}

// ------------------------------------------------------------------ portal en ruinas

function buildRuinedPortal(c: Canvas, s: Start, gen: TerrainGenerator): void {
  const { x: ox, y: oy, z: oz } = s;
  // Mancha de rocanegra alrededor.
  for (let dz = -5; dz <= 5; dz++) {
    for (let dx = -5; dx <= 5; dx++) {
      const k = hash3(ox + dx, oy, oz + dz, gen.seed ^ 0x9a7);
      if (dx * dx + dz * dz > 25 - (k % 6)) continue;
      c.set(ox + dx, oy, oz + dz, k % 5 === 0 ? MOSSY_STONE_BRICKS : k % 3 === 0 ? STONE_BRICKS : NETHERRACK);
      c.clearAbove(ox + dx, oy + 1, oz + dz, 6);
    }
  }
  // Marco del portal (4 de ancho por 5 de alto) con piezas caídas.
  const alongX = s.rng % 2 === 0;
  for (let u = -2; u <= 1; u++) {
    for (let dy = 1; dy <= 5; dy++) {
      const frame = u === -2 || u === 1 || dy === 1 || dy === 5;
      if (!frame) continue;
      const x = alongX ? ox + u : ox, z = alongX ? oz : oz + u;
      const k = hash3(x, oy + dy, z, s.rng);
      if (k % 4 === 0) continue; // falta
      c.set(x, oy + dy, z, k % 5 === 0 ? CRYING_OBSIDIAN : OBSIDIAN);
    }
  }
  const gx = alongX ? ox + 3 : ox + 2, gz = alongX ? oz + 2 : oz + 3;
  c.set(gx, oy + 1, gz, GOLD_BLOCK);
  c.chest(alongX ? ox - 3 : ox - 2, oy + 1, alongX ? oz + 1 : oz - 3, 2, 'ruined_portal');
}

// ------------------------------------------------------------------ iglú

function buildIgloo(c: Canvas, s: Start): void {
  const { x: ox, y: oy, z: oz } = s;
  for (let dz = -4; dz <= 4; dz++) {
    for (let dx = -4; dx <= 4; dx++) {
      if (dx * dx + dz * dz > 18) continue;
      c.foundation(ox + dx, oy, oz + dz, SNOW_BLOCK);
      c.set(ox + dx, oy, oz + dz, SNOW_BLOCK);
      c.clearAbove(ox + dx, oy + 1, oz + dz, 6);
    }
  }
  // Cúpula de nieve.
  for (let dy = 1; dy <= 4; dy++) {
    for (let dz = -4; dz <= 4; dz++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx, (dy - 0.5) * 1.25, dz);
        if (d <= 3.9) c.set(ox + dx, oy + dy, oz + dz, d > 2.9 ? SNOW_BLOCK : AIR);
      }
    }
  }
  // Puerta al sur, cama, mesa, horno y una antorcha.
  for (let dz = 3; dz <= 4; dz++) for (let dy = 1; dy <= 2; dy++) c.set(ox, oy + dy, oz + dz, AIR);
  c.set(ox - 1, oy + 1, oz - 2, stateOf(BEDS.white, { facing: 0, part: 0 }));
  c.set(ox - 1, oy + 1, oz - 3, stateOf(BEDS.white, { facing: 0, part: 1 }));
  c.set(ox + 2, oy + 1, oz - 1, CRAFTING_TABLE);
  c.set(ox + 2, oy + 1, oz, FURNACE + 3);
  c.set(ox + 1, oy + 1, oz - 2, TORCH);
  // La mitad tienen sótano: trampilla, escalera de mano y una sala de piedra con un cofre.
  if (s.rng % 2 === 0) {
    const by = oy - 8;
    c.set(ox + 1, oy, oz + 1, stateOf(TRAPDOORS.spruce, { facing: 0, half: 1, open: 0 }));
    // Escalera apoyada en la cara sur del hueco (la tierra y, abajo, la pared de la sala).
    for (let y = by + 1; y < oy; y++) c.set(ox + 1, y, oz + 1, stateOf(LADDER, { facing: 0 }));
    c.fill(ox - 2, by, oz - 3, ox + 3, by + 4, oz + 2, (x, y, z) => {
      const wall = x === ox - 2 || x === ox + 3 || z === oz - 3 || z === oz + 2 || y === by || y === by + 4;
      if (x === ox + 1 && z === oz + 1 && y > by) return stateOf(LADDER, { facing: 0 });
      return wall ? iglooBrick(x, y, z, s.rng) : AIR; // Fase 6.5 (materiales): musgosos, agrietados e infestados
    });
    c.chest(ox - 1, by + 1, oz - 2, 2, 'igloo');
    c.set(ox + 2, by + 3, oz - 2, TORCH);
  }
}

// ------------------------------------------------------------------ pozo del desierto

function buildDesertWell(c: Canvas, s: Start): void {
  const { x: ox, y: oy, z: oz } = s;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      c.foundation(ox + dx, oy - 1, oz + dz, SANDSTONE);
      c.set(ox + dx, oy, oz + dz, SANDSTONE);
      c.clearAbove(ox + dx, oy + 1, oz + dz, 5);
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) === 1;
      if (ring) c.set(ox + dx, oy + 1, oz + dz, Math.abs(dx) + Math.abs(dz) === 2 ? SANDSTONE : stateOf(SLABS.sandstone, { type: 0 }));
    }
  }
  c.set(ox, oy, oz, WATER);
  c.set(ox, oy - 1, oz, WATER);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    c.set(ox + dx, oy + 2, oz + dz, SANDSTONE);
    c.set(ox + dx, oy + 3, oz + dz, SANDSTONE);
  }
  c.fill(ox - 1, oy + 4, oz - 1, ox + 1, oy + 4, oz + 1, stateOf(SLABS.sandstone, { type: 0 }));
  c.set(ox, oy + 4, oz, SANDSTONE);
}

