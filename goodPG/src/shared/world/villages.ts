// Aldeas (fase 6): un pozo en la plaza, cuatro calles que salen de ella, casas a los lados con la
// puerta hacia la calle, huertos con agua en medio, farolas y algún cofre. El estilo depende del
// bioma (roble y roca en la llanura, arenisca en el desierto, acacia en la sabana, abeto en la taiga).
//
// El trazado se decide una sola vez por aldea (semilla + origen) y se guarda en caché; cada chunk
// dibuja sólo lo que le cae dentro. Las casas y huertos usan la altura del terreno base en su centro
// (igual para todos los chunks); las calles buscan el suelo de cada columna en el propio chunk.
import {
  AIR, WATER, DIRT, COBBLESTONE, SANDSTONE, CUT_SANDSTONE, CHISELED_SANDSTONE, OAK_PLANKS, OAK_LOG, SPRUCE_PLANKS,
  SPRUCE_LOG, ACACIA_PLANKS, ACACIA_LOG, SNOW_BLOCK, GLASS_PANE, DOORS, STAIRS, SLABS, FENCES, TORCH, WALL_TORCH, BEDS,
  CRAFTING_TABLE, FURNACE, HAY_BALE, FARMLAND, WHEAT_CROP, CARROTS, POTATOES, COLORED_TERRACOTTA, BLOCK_OPAQUE,
  BLOCK_FLUID, isLeaves, isLog, stateOf,
} from '../blocks';
import { DIRT_PATH } from '../blocks'; // Fase 6.5 (materiales)
import {
  COMPOSTER, SMOKER, BLAST_FURNACE, STONECUTTER, LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE,
  SMITHING_TABLE, CAULDRON,
} from '../blocks'; // Fase 6 (aldeanos)
import { SEA_LEVEL } from '../constants';
import { mulberry32 } from './noise';
import type { TerrainGenerator, ColumnInfo } from './terrain';
import {
  BIOME_PLAINS, BIOME_MEADOW, BIOME_DESERT, BIOME_SAVANNA, BIOME_TAIGA, BIOME_SNOWY, baseBiome,
  BIOME_SUNFLOWER_PLAINS, BIOME_SAVANNA_PLATEAU, BIOME_SNOWY_PLAINS,
} from './biomeIds';

/** Lo que usa la aldea del lienzo del chunk (la clase Canvas de structures.ts). */
export interface VillageCanvas {
  readonly x0: number;
  readonly z0: number;
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
  chest(x: number, y: number, z: number, facing: number, table: string): void;
  foundation(x: number, y: number, z: number, id: number): void;
  clearAbove(x: number, y: number, z: number, h: number): void;
  /** Fase 6 (aldeanos): anota un aldeano que aparecerá al generarse el chunk. */
  villager?(v: VillagerSpawn): void;
}

/** Fase 6 (aldeanos): aldeano de una aldea recién generada (pies, casa y punto de reunión). */
export interface VillagerSpawn {
  x: number;
  y: number;
  z: number;
  home: [number, number, number] | null;
  meet: [number, number, number];
}

/** Origen de la aldea (el pozo). */
export interface VillageStart {
  x: number;
  y: number;
  z: number;
  rng: number;
}

/** Radio máximo que ocupa una aldea alrededor del pozo (bloques). */
export const VILLAGE_RADIUS = 38;

const VILLAGE_BIOMES = new Set([
  BIOME_PLAINS, BIOME_MEADOW, BIOME_DESERT, BIOME_SAVANNA, BIOME_TAIGA, BIOME_SNOWY,
  BIOME_SUNFLOWER_PLAINS, BIOME_SAVANNA_PLATEAU, BIOME_SNOWY_PLAINS, // Fase 7.6
]);
/** ¿Puede haber una aldea en este bioma? */
export const isVillageBiome = (b: number): boolean => VILLAGE_BIOMES.has(b);

const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];

// ------------------------------------------------------------------ estilos

interface Style {
  planks: number;
  log: number;
  base: number;
  path: number;
  stairs: number;
  slab: number;
  door: number;
  fence: number;
  /** Tejado plano (desierto) en vez de a dos aguas. */
  flat: boolean;
  /** Bloque de la cumbrera (nieve en la taiga nevada). */
  ridge: number;
  accent: number;
  bed: number;
}

/** Clase de aldea de un bioma (la que decide su estilo): desert, savanna, taiga, snowy o plains. */
export function villageKind(biome: number): string {
  switch (baseBiome(biome)) {
    case BIOME_DESERT: return 'desert';
    case BIOME_SAVANNA: return 'savanna';
    case BIOME_TAIGA: return 'taiga';
    case BIOME_SNOWY: return 'snowy';
    default: return 'plains';
  }
}

function styleFor(biome: number): Style {
  const wood = (planks: number, log: number, key: string, bed: string, ridge = 0): Style => ({
    // Fase 6.5 (materiales): calles de camino de tierra (antes, grava).
    planks, log, base: COBBLESTONE, path: DIRT_PATH, stairs: STAIRS[key], slab: SLABS[key], door: DOORS[key],
    fence: FENCES[key], flat: false, ridge: ridge || planks, accent: log, bed: BEDS[bed],
  });
  switch (baseBiome(biome)) {
    case BIOME_DESERT:
      return {
        planks: SANDSTONE, log: CUT_SANDSTONE, base: SANDSTONE, path: SANDSTONE, stairs: STAIRS.sandstone,
        slab: SLABS.sandstone, door: DOORS.oak, fence: FENCES.oak, flat: true, ridge: CHISELED_SANDSTONE,
        accent: COLORED_TERRACOTTA.orange, bed: BEDS.yellow,
      };
    case BIOME_SAVANNA: {
      const s = wood(ACACIA_PLANKS, ACACIA_LOG, 'acacia', 'orange');
      s.accent = COLORED_TERRACOTTA.orange;
      return s;
    }
    case BIOME_TAIGA:
      return wood(SPRUCE_PLANKS, SPRUCE_LOG, 'spruce', 'blue');
    case BIOME_SNOWY:
      return wood(SPRUCE_PLANKS, SPRUCE_LOG, 'spruce', 'white', SNOW_BLOCK);
    default:
      return wood(OAK_PLANKS, OAK_LOG, 'oak', 'red');
  }
}

// ------------------------------------------------------------------ trazado

interface Rect { x0: number; z0: number; x1: number; z1: number }

interface Piece {
  kind: 'house' | 'farm';
  x: number;
  z: number;
  y: number;
  /** Hacia dónde mira la puerta (0 norte, 1 este, 2 sur, 3 oeste). */
  dir: number;
  /** Medio ancho (a lo largo de la calle) y media profundidad. */
  w: number;
  d: number;
  chest: boolean;
  seed: number;
  box: Rect;
}

interface Road { dir: number; len: number; box: Rect }

interface Layout {
  style: Style;
  roads: Road[];
  pieces: Piece[];
  lamps: [number, number][];
}

const ROAD_HALF = 1;
const layoutCache = new Map<string, Layout>();
const tmp: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

const overlaps = (a: Rect, b: Rect) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.z0 <= b.z1 && a.z1 >= b.z0;

/** Caja en el mundo de una pieza centrada en (x, z) mirando a `dir` (medio ancho w, media profundidad d). */
function pieceBox(x: number, z: number, dir: number, w: number, d: number, pad: number): Rect {
  const along = dir === 0 || dir === 2; // la anchura va a lo largo de x
  const hx = (along ? w : d) + pad, hz = (along ? d : w) + pad;
  return { x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz };
}

function villageLayout(gen: TerrainGenerator, s: VillageStart): Layout {
  const key = `${gen.seed}:${s.x},${s.z}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;
  if (layoutCache.size > 200) layoutCache.clear();
  const rnd = mulberry32(s.rng);
  const style = styleFor(gen.columnInfo(s.x, s.z, tmp).biome);
  const taken: Rect[] = [{ x0: s.x - 4, z0: s.z - 4, x1: s.x + 4, z1: s.z + 4 }]; // plaza
  const roads: Road[] = [];
  for (let dir = 0; dir < 4; dir++) {
    const len = 18 + Math.floor(rnd() * 12);
    const ex = s.x + DX[dir] * len, ez = s.z + DZ[dir] * len;
    const box: Rect = {
      x0: Math.min(s.x, ex) - ROAD_HALF, z0: Math.min(s.z, ez) - ROAD_HALF,
      x1: Math.max(s.x, ex) + ROAD_HALF, z1: Math.max(s.z, ez) + ROAD_HALF,
    };
    roads.push({ dir, len, box });
    taken.push(box);
  }
  // Huecos a los lados de las calles, barajados.
  const slots: [number, number, number][] = [];
  for (const r of roads) for (let a = 7; a <= r.len - 2; a += 3) for (const side of [1, -1]) slots.push([r.dir, a, side]);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const pieces: Piece[] = [];
  const wantFarms = 1 + Math.floor(rnd() * 2), wantHouses = 4 + Math.floor(rnd() * 5);
  let farms = 0, houses = 0, chests = 1 + Math.floor(rnd() * 2);
  const tryPlace = (kind: 'house' | 'farm', w: number, d: number): boolean => {
    for (let k = 0; k < slots.length; k++) {
      const [rd, a, side] = slots[k];
      // La puerta mira a la calle: hacia el lado contrario al que queda la casa.
      const sideDir = (rd + (side > 0 ? 1 : 3)) & 3;
      const dir = (sideDir + 2) & 3;
      const off = ROAD_HALF + 2 + d;
      const x = s.x + DX[rd] * a + DX[sideDir] * off, z = s.z + DZ[rd] * a + DZ[sideDir] * off;
      const box = pieceBox(x, z, dir, w, d, 1);
      if (Math.max(Math.abs(box.x0 - s.x), Math.abs(box.x1 - s.x), Math.abs(box.z0 - s.z), Math.abs(box.z1 - s.z)) > VILLAGE_RADIUS) continue;
      if (taken.some((t) => overlaps(t, box))) continue;
      const y = gen.surfaceAt(x, z, gen.columnInfo(x, z, tmp));
      if (y < SEA_LEVEL || Math.abs(y - s.y) > 7) {
        slots.splice(k--, 1);
        continue;
      }
      slots.splice(k, 1);
      taken.push(box);
      const chest = kind === 'house' && chests > 0;
      if (chest) chests--;
      pieces.push({ kind, x, z, y, dir, w, d, chest, seed: Math.floor(rnd() * 2 ** 31), box: pieceBox(x, z, dir, w, d, 0) });
      return true;
    }
    return false;
  };
  while (farms < wantFarms && tryPlace('farm', 4, 3)) farms++;
  while (houses < wantHouses) {
    const big = rnd() < 0.4;
    if (!tryPlace('house', big ? 3 : 2, big ? 3 : 2)) break;
    houses++;
  }
  // Farolas: esquinas de la plaza y final de cada calle.
  const lamps: [number, number][] = [[s.x - 3, s.z - 3], [s.x + 3, s.z - 3], [s.x - 3, s.z + 3], [s.x + 3, s.z + 3]];
  for (const r of roads) {
    const sd = (r.dir + 1) & 3;
    for (let a = 12; a <= r.len; a += 12) {
      const lx = s.x + DX[r.dir] * a + DX[sd] * (ROAD_HALF + 1), lz = s.z + DZ[r.dir] * a + DZ[sd] * (ROAD_HALF + 1);
      if (!pieces.some((p) => overlaps(p.box, { x0: lx - 1, z0: lz - 1, x1: lx + 1, z1: lz + 1 }))) lamps.push([lx, lz]);
    }
  }
  const layout: Layout = { style, roads, pieces, lamps };
  layoutCache.set(key, layout);
  return layout;
}

// ------------------------------------------------------------------ dibujo

/** Altura del suelo de una columna del chunk cerca de `y` (o null si no hay). Deja el agua como suelo. */
function groundAt(c: VillageCanvas, x: number, z: number, y: number): number | null {
  for (let yy = y + 16; yy >= y - 16; yy--) {
    const b = c.get(x, yy, z);
    if (b < 0) return null;
    if (b === AIR || isLeaves(b) || isLog(b)) continue;
    if (BLOCK_FLUID[b] || BLOCK_OPAQUE[b]) return yy;
  }
  return null;
}

function inChunk(c: VillageCanvas, r: Rect): boolean {
  return r.x1 >= c.x0 && r.x0 <= c.x0 + 15 && r.z1 >= c.z0 && r.z0 <= c.z0 + 15;
}

/** Suelo de camino en (x, z): sobre el agua, tablones. */
function pathCell(c: VillageCanvas, x: number, z: number, y: number, id: number, bridge: number): void {
  if (x < c.x0 || x > c.x0 + 15 || z < c.z0 || z > c.z0 + 15) return;
  const g = groundAt(c, x, z, y);
  if (g === null) return;
  const b = c.get(x, g, z);
  c.set(x, g, z, BLOCK_FLUID[b] ? bridge : id);
  c.clearAbove(x, g + 1, z, 3);
}

export function buildVillage(c: VillageCanvas, s: VillageStart, gen: TerrainGenerator): void {
  const L = villageLayout(gen, s);
  const st = L.style;
  // Calles y plaza.
  for (const r of L.roads) {
    if (!inChunk(c, r.box)) continue;
    for (let z = Math.max(r.box.z0, c.z0); z <= Math.min(r.box.z1, c.z0 + 15); z++) {
      for (let x = Math.max(r.box.x0, c.x0); x <= Math.min(r.box.x1, c.x0 + 15); x++) pathCell(c, x, z, s.y, st.path, st.planks);
    }
  }
  if (inChunk(c, { x0: s.x - 4, z0: s.z - 4, x1: s.x + 4, z1: s.z + 4 })) {
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) pathCell(c, s.x + dx, s.z + dz, s.y, st.path, st.planks);
    buildWell(c, s, st);
  }
  // Fase 6 (aldeanos): el chunk del pozo trae a los aldeanos (3–6, en el borde del pozo).
  if (c.villager && s.x >= c.x0 && s.x <= c.x0 + 15 && s.z >= c.z0 && s.z <= c.z0 + 15) placeVillagers(c, s, L);
  for (const p of L.pieces) {
    if (!inChunk(c, { x0: p.box.x0 - 1, z0: p.box.z0 - 1, x1: p.box.x1 + 1, z1: p.box.z1 + 1 })) continue;
    if (p.kind === 'house') buildHouse(c, p, st);
    else buildFarm(c, p, st);
  }
  for (const [x, z] of L.lamps) {
    if (x < c.x0 || x > c.x0 + 15 || z < c.z0 || z > c.z0 + 15) continue;
    const g = groundAt(c, x, z, s.y);
    if (g === null || BLOCK_FLUID[c.get(x, g, z)]) continue;
    c.set(x, g + 1, z, st.base);
    c.set(x, g + 2, z, st.fence);
    c.set(x, g + 3, z, TORCH);
  }
}

// ------------------------------------------------------------------ Fase 6 (aldeanos)

/** Bloques de trabajo que pueden aparecer dentro de las casas. */
const HOUSE_WORKSTATIONS = [
  COMPOSTER, SMOKER, BLAST_FURNACE, STONECUTTER, LECTERN, CARTOGRAPHY_TABLE, FLETCHING_TABLE, BARREL, LOOM, GRINDSTONE,
  SMITHING_TABLE, CAULDRON,
];

/**
 * Aldeanos de la aldea: de pie sobre el borde del pozo, cada uno con su casa (duermen en el centro de
 * la casa, a la altura del suelo).
 */
function placeVillagers(c: VillageCanvas, s: VillageStart, L: Layout): void {
  const rnd = mulberry32(s.rng ^ 0x5eed);
  const n = 3 + Math.floor(rnd() * 4);
  const homes = L.pieces.filter((p) => p.kind === 'house').map((p): [number, number, number] => [p.x, p.y + 1, p.z]);
  const ring: [number, number][] = [];
  for (let k = -2; k <= 2; k++) ring.push([k, -2], [k, 2], [-2, k], [2, k]);
  const spots = [...new Map(ring.map((r) => [r.join(','), r])).values()];
  for (let i = 0; i < n && spots.length > 0; i++) {
    const [dx, dz] = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
    c.villager!({
      x: s.x + dx, y: s.y + 1, z: s.z + dz, home: homes.length ? homes[i % homes.length] : null, meet: [s.x, s.y + 1, s.z],
    });
  }
}

function buildWell(c: VillageCanvas, s: VillageStart, st: Style): void {
  const { x: ox, y: oy, z: oz } = s;
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const x = ox + dx, z = oz + dz;
      c.foundation(x, oy - 1, z, st.base);
      c.set(x, oy, z, st.base);
      c.clearAbove(x, oy + 1, z, 5);
      const ring = Math.max(Math.abs(dx), Math.abs(dz)) <= 1;
      if (!ring) continue;
      if (dx === 0 && dz === 0) {
        for (let y = oy - 3; y <= oy; y++) c.set(x, y, z, WATER);
        c.set(x, oy - 4, z, st.base);
      } else {
        c.set(x, oy + 1, z, st.base);
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1) {
          c.set(x, oy + 2, z, st.fence);
          c.set(x, oy + 3, z, st.fence);
        }
      }
    }
  }
  // Agua también en la cruz central para que el pozo tenga 3x3 por dentro.
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    c.set(ox + dx, oy, oz + dz, WATER);
    c.set(ox + dx, oy - 1, oz + dz, st.base);
  }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) c.set(ox + dx, oy + 4, oz + dz, stateOf(st.slab, { type: 0 }));
  c.set(ox, oy + 4, oz, st.base);
}

/** Pasa de coordenadas locales (u a la derecha de la puerta, v hacia la puerta) al mundo. */
function toWorld(p: Piece, u: number, v: number): [number, number] {
  const r = (p.dir + 1) & 3;
  return [p.x + DX[r] * u + DX[p.dir] * v, p.z + DZ[r] * u + DZ[p.dir] * v];
}

function buildHouse(c: VillageCanvas, p: Piece, st: Style): void {
  const { w: W, d: D, y: hy, dir } = p;
  const back = (dir + 2) & 3;
  const set = (u: number, v: number, y: number, id: number) => {
    const [x, z] = toWorld(p, u, v);
    c.set(x, y, z, id);
  };
  // Cimientos, suelo y hueco.
  for (let v = -D - 1; v <= D + 1; v++) {
    for (let u = -W - 1; u <= W + 1; u++) {
      const [x, z] = toWorld(p, u, v);
      c.clearAbove(x, hy + 1, z, D + 8);
      if (Math.abs(u) > W || Math.abs(v) > D) continue;
      c.foundation(x, hy - 1, z, st.base);
      c.set(x, hy, z, Math.abs(u) === W || Math.abs(v) === D ? st.base : st.planks);
    }
  }
  // Paredes: troncos en las esquinas, tablones (o arenisca) y una viga arriba.
  const top = hy + 4;
  for (let y = hy + 1; y <= top; y++) {
    for (let v = -D; v <= D; v++) {
      for (let u = -W; u <= W; u++) {
        const edgeU = Math.abs(u) === W, edgeV = Math.abs(v) === D;
        if (!edgeU && !edgeV) continue;
        const corner = edgeU && edgeV;
        set(u, v, y, corner ? st.log : y === top ? (st.flat ? st.accent : st.log) : st.planks);
      }
    }
  }
  // Ventanas.
  set(-W, 0, hy + 2, GLASS_PANE);
  set(W, 0, hy + 2, GLASS_PANE);
  set(0, -D, hy + 2, GLASS_PANE);
  if (W >= 3) {
    set(-2, D, hy + 2, GLASS_PANE);
    set(2, D, hy + 2, GLASS_PANE);
  }
  // Tejado.
  if (st.flat) {
    for (let v = -D; v <= D; v++) for (let u = -W; u <= W; u++) set(u, v, top + 1, Math.abs(u) === W || Math.abs(v) === D ? stateOf(st.slab, { type: 0 }) : st.planks);
    set(0, 0, top + 1, st.ridge);
  } else {
    for (let k = 0; k <= D + 1; k++) {
      const y = top + k, row = D + 1 - k;
      for (let u = -W - 1; u <= W + 1; u++) {
        if (row === 0) {
          set(u, 0, y, st.ridge === st.planks ? stateOf(st.slab, { type: 0 }) : st.ridge);
          continue;
        }
        // Las escaleras suben hacia la cumbrera.
        set(u, row, y, stateOf(st.stairs, { facing: back, half: 0 }));
        set(u, -row, y, stateOf(st.stairs, { facing: dir, half: 0 }));
      }
      // Hastiales.
      if (k >= 1) for (let v = -row + 1; v <= row - 1; v++) for (const u of [-W, W]) set(u, v, y, st.planks);
    }
  }
  // Puerta y escalón hasta la calle.
  const facing = back;
  set(0, D, hy + 1, stateOf(st.door, { facing, half: 0, open: 0, hinge: 0 }));
  set(0, D, hy + 2, stateOf(st.door, { facing, half: 1, open: 0, hinge: 0 }));
  const [sx, sz] = toWorld(p, 0, D + 1);
  c.foundation(sx, hy - 1, sz, st.base);
  c.set(sx, hy, sz, st.path);
  // Antorchas: a un lado de la puerta por fuera y en la pared del fondo por dentro.
  set(1, D + 1, hy + 3, stateOf(WALL_TORCH, { facing: dir }));
  set(0, -D + 1, hy + 3, stateOf(WALL_TORCH, { facing: dir }));
  // Muebles: cama contra el fondo, mesa de trabajo, horno o fardo, y quizá el cofre.
  set(-W + 1, -D + 1, hy + 1, stateOf(st.bed, { facing: back, part: 1 }));
  set(-W + 1, -D + 2, hy + 1, stateOf(st.bed, { facing: back, part: 0 }));
  set(W - 1, -D + 1, hy + 1, p.seed % 2 ? CRAFTING_TABLE : FURNACE + dir);
  if (p.chest) {
    const [x, z] = toWorld(p, W - 1, D - 1 > -D + 1 ? 0 : -D + 1);
    c.chest(x, hy + 1, z, (dir + 3) & 3, 'village');
  } else if (W >= 3) set(W - 1, 0, hy + 1, HAY_BALE);
  // Fase 6 (aldeanos): bloque de trabajo junto a la puerta en dos de cada tres casas.
  if (p.seed % 3 !== 0) set(-W + 1, D - 1, hy + 1, HOUSE_WORKSTATIONS[(p.seed >>> 5) % HOUSE_WORKSTATIONS.length]);
}

function buildFarm(c: VillageCanvas, p: Piece, st: Style): void {
  const { w: W, d: D, y: fy } = p;
  const crops = [WHEAT_CROP, CARROTS, POTATOES];
  const left = crops[p.seed % 3], right = crops[(p.seed >>> 4) % 3];
  for (let v = -D; v <= D; v++) {
    for (let u = -W; u <= W; u++) {
      const [x, z] = toWorld(p, u, v);
      c.foundation(x, fy - 1, z, DIRT);
      c.clearAbove(x, fy + 1, z, 6);
      const border = Math.abs(u) === W || Math.abs(v) === D;
      if (border) {
        c.set(x, fy, z, st.log);
        continue;
      }
      if (u === 0) {
        c.set(x, fy, z, WATER);
        c.set(x, fy - 1, z, DIRT);
        continue;
      }
      c.set(x, fy, z, stateOf(FARMLAND, { moist: 1 }));
      const age = 2 + ((p.seed >>> ((u + W) * 3 + v + D)) % 6);
      c.set(x, fy + 1, z, stateOf(u < 0 ? left : right, { age }));
    }
  }
}
