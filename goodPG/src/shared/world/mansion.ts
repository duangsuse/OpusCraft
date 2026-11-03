// Fase 7.5 (mansión): la mansión del bosque, en los bosques oscuros y muy rara (como en Minecraft:
// una candidata cada 80 chunks). Tres plantas de roble oscuro sobre cimientos de roca, con tejados a
// cuatro aguas, pasillos alfombrados y habitaciones muy distintas; vindicadores y evocadores dentro
// (no desaparecen) y alays presos en las celdas.
//
// Como en Minecraft, la mansión sale de una rejilla de celdas (7×7 de 8 bloques): cada planta marca
// qué celdas ocupa, cuáles son pasillo y cómo se agrupan las demás en habitaciones de 1×1, 1×2 y 2×2.
// La planta baja tiene un anillo de pasillos (una almohadilla, #) con el vestíbulo hacia la entrada;
// la primera, el mismo anillo sobre una huella algo menor; el ático, una cruz. Las escaleras son una
// celda con un tramo recto que sube a un pasillo de la planta de arriba. Las habitaciones sin pasillo al
// lado quedan tapiadas: son las habitaciones secretas. El trazado se decide una vez por mansión
// (semilla y origen, en caché) y cada chunk dibuja lo que le cae dentro.
import {
  AIR, COBBLESTONE, MOSSY_COBBLESTONE, BIRCH_PLANKS, BIRCH_LOG, DARK_OAK_LOG, DARK_OAK_PLANKS, DARK_OAK_LEAVES, GLASS_PANE,
  BOOKSHELF, CHEST, COBWEB, OBSIDIAN, DIAMOND_BLOCK, GRASS, PUMPKIN, JACK_O_LANTERN, CAKE, HAY_BALE, CRAFTING_TABLE,
  POPPY, DANDELION, CORNFLOWER, FLOWERS, STAIRS, SLABS, FENCES, BEDS, CARPETS, WOOL, LANTERN, IRON_BARS, LECTERN,
  CARTOGRAPHY_TABLE, BARREL, DIRT, BLOCK_OPAQUE, stateOf, potWith, isLeaves, isLog,
} from '../blocks';
import { SEA_LEVEL } from '../constants';
import { MOB_VINDICATOR, MOB_EVOKER } from '../illagers';
import { MOB_ALLAY } from '../allay';
import { mulberry32 } from './noise';
import { BIOME_DARK_FOREST } from './biomeIds';
import type { TerrainGenerator, ColumnInfo } from './terrain';
import type { Start } from './structures';

/** Celdas por lado, bloques por celda (las paredes van en las líneas que las separan) y alto de planta. */
const G = 7;
const CELL = 8;
export const MANSION_FLOOR_H = 7;
const FH = MANSION_FLOOR_H;
const FLOORS = 3;
/** Lado de la mansión en bloques. */
const N = G * CELL + 1;
/** Radio que ocupa alrededor del origen (con los aleros y el porche). */
export const MANSION_RADIUS = Math.ceil(N / 2) + 3;
/** Tabla de botín de sus cofres. */
export const MANSION_LOOT = 'woodland_mansion';

const OUT = -1;
const CORR = -2;
const FREE = -3;
const DX = [0, 1, 0, -1];
const DZ = [-1, 0, 1, 0];

export type RoomType =
  | 'stairs' | 'secret' | 'jail' | 'bedroom_small' | 'flower' | 'office' | 'checker' | 'pumpkin' | 'storage'
  | 'birch_pillar' | 'cobweb' | 'bedroom' | 'library' | 'wool_x' | 'dining_small' | 'fake_portal' | 'dining'
  | 'conference' | 'map_room' | 'chess' | 'garden' | 'statue' | 'attic_storage';

/** Tipo de hueco en una pared: nada, puerta abierta, barrotes (celdas) o la entrada. */
const EDGE_OPEN = 1, EDGE_BARS = 2, EDGE_ENTRANCE = 3;

export interface MansionRoom {
  floor: number;
  /** Celda de arriba a la izquierda y tamaño en celdas. */
  i: number;
  j: number;
  w: number;
  h: number;
  type: RoomType;
  /** Puerta: celda de la habitación y lado (0 norte, 1 este, 2 sur, 3 oeste) que da al pasillo. */
  door: { i: number; j: number; dir: number } | null;
  seed: number;
  /** Criaturas que aparecen dentro. */
  mobs: number[];
}

export interface MansionLayout {
  /** Esquina noroeste y altura del suelo de la planta baja. */
  x0: number;
  z0: number;
  y: number;
  /** Por planta, G×G celdas: OUT, CORR o índice de la habitación. */
  cells: Int16Array[];
  rooms: MansionRoom[];
  /** Escaleras: celda, planta de abajo y lado por el que se entra (suben hacia el contrario). */
  stairs: { floor: number; i: number; j: number; dir: number }[];
  entrance: { i: number; j: number; dir: number };
  /** Huecos en las paredes por planta: verticales (G+1)×G e horizontales G×(G+1). */
  vEdges: Uint8Array[];
  hEdges: Uint8Array[];
  /** Por columna (N×N): planta más alta que la cubre (−1 fuera), altura del tejado y hacia dónde sube. */
  topF: Int8Array;
  roof: Int8Array;
  roofDir: Int8Array;
  /** Patio alrededor de la huella de la planta baja ((N + 2·YARD)² columnas). */
  yard: Uint8Array;
}

/** Ancho del patio que rodea la mansión. */
const YARD = 3;
const NY = N + 2 * YARD;

// ------------------------------------------------------------------ emplazamiento

const tmp: ColumnInfo = { height: 0, amp: 0, temp: 0, humid: 0, mount: 0, cont: 0, biome: 0 };

/**
 * ¿Vale el candidato? En el bosque oscuro y en tierra firme; devuelve la altura del suelo (la mediana
 * de la huella: lo que sobra se desmonta y lo que falta se rellena con roca).
 */
export function mansionSite(gen: TerrainGenerator, x: number, z: number, inf: ColumnInfo): number | null {
  if (inf.biome !== BIOME_DARK_FOREST) return null;
  const hs: number[] = [];
  const r = (N - 1) / 2 - 2;
  for (const dz of [-r, 0, r]) for (const dx of [-r, 0, r]) hs.push(gen.surfaceAt(x + dx, z + dz, gen.columnInfo(x + dx, z + dz, tmp)));
  hs.sort((a, b) => a - b);
  return hs[0] >= SEA_LEVEL && hs[8] - hs[0] <= 16 ? Math.max(SEA_LEVEL + 1, hs[4]) : null;
}

// ------------------------------------------------------------------ trazado

const cache = new Map<string, MansionLayout>();

/** Trazado de la mansión de un origen (siempre el mismo para la misma semilla). */
export function mansionLayout(s: Start): MansionLayout {
  const key = `${s.rng}:${s.x},${s.y},${s.z}`;
  let L = cache.get(key);
  if (L) return L;
  if (cache.size > 16) cache.clear();
  L = generateLayout(s);
  cache.set(key, L);
  return L;
}

const idx = (i: number, j: number) => j * G + i;

function generateLayout(s: Start): MansionLayout {
  const rnd = mulberry32(s.rng ^ 0x3a5e7);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  // Huellas: la planta baja entera salvo algunas esquinas; la primera, algo menos; el ático, en medio.
  const F = [new Uint8Array(G * G).fill(1), new Uint8Array(G * G), new Uint8Array(G * G)];
  const corners = [[0, 0], [5, 0], [0, 5], [5, 5]];
  for (const [ci, cj] of corners) {
    const r = rnd();
    if (r < 0.25) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) F[0][idx(ci + di, cj + dj)] = 0;
    else if (r < 0.55) F[0][idx(ci + (ci ? 1 : 0), cj + (cj ? 1 : 0))] = 0;
  }
  const e = Math.floor(rnd() * 4);
  const ENTRY: [number, number][][] = [[[3, 0], [3, 1]], [[6, 3], [5, 3]], [[3, 6], [3, 5]], [[0, 3], [1, 3]]];
  const entryCells = ENTRY[e];
  F[1].set(F[0]);
  for (const [ci, cj] of corners) {
    const full = [0, 1].every((dj) => [0, 1].every((di) => F[0][idx(ci + di, cj + dj)]));
    if (full && rnd() < 0.35) for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) F[1][idx(ci + di, cj + dj)] = 0;
  }
  if (rnd() < 0.5) for (const [i, j] of entryCells) F[1][idx(i, j)] = 0;
  const [ri0, ri1, rj0, rj1] = pick([[1, 5, 1, 5], [2, 4, 1, 5], [1, 5, 2, 4]] as const);
  for (let j = rj0; j <= rj1; j++) for (let i = ri0; i <= ri1; i++) F[2][idx(i, j)] = F[1][idx(i, j)];

  // Pasillos: el anillo en las dos primeras plantas (y el vestíbulo), la cruz en el ático.
  const cells = F.map((f, fl) => {
    const a = new Int16Array(G * G);
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const corr = fl < 2 ? i === 2 || i === 4 || j === 2 || j === 4 : i === 3 || j === 3;
        a[idx(i, j)] = !f[idx(i, j)] ? OUT : corr ? CORR : FREE;
      }
    }
    return a;
  });
  for (const [i, j] of entryCells) cells[0][idx(i, j)] = CORR;

  // Escaleras: de la planta baja a la primera en una celda del borde que toca el anillo; de la primera
  // al ático, en la celda central. La celda de arriba pasa a ser pasillo (el rellano).
  const rooms: MansionRoom[] = [];
  const stairs: MansionLayout['stairs'] = [];
  const addStairs = (fl: number, i: number, j: number, dir: number) => {
    stairs.push({ floor: fl, i, j, dir });
    cells[fl][idx(i, j)] = rooms.length;
    cells[fl + 1][idx(i, j)] = CORR;
    rooms.push({ floor: fl, i, j, w: 1, h: 1, type: 'stairs', door: { i, j, dir }, seed: Math.floor(rnd() * 2 ** 31), mobs: [] });
  };
  const edgeStairs: [number, number, number][] = [[3, 1, 2], [5, 3, 3], [3, 5, 0], [1, 3, 1]];
  const lower = edgeStairs.filter(([i, j]) => cells[0][idx(i, j)] === FREE && cells[1][idx(i, j)] === FREE);
  if (lower.length) addStairs(0, ...pick(lower));
  if (cells[1][idx(3, 3)] === FREE && cells[2][idx(3, 3)] !== OUT) addStairs(1, 3, 3, Math.floor(rnd() * 4));

  // Habitaciones: se agrupan las celdas libres en 2×2, 1×2 o 1×1.
  for (let fl = 0; fl < FLOORS; fl++) {
    const a = cells[fl];
    const free = (i: number, j: number) => i >= 0 && j >= 0 && i < G && j < G && a[idx(i, j)] === FREE;
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        if (!free(i, j)) continue;
        const shapes: [number, number][] = [];
        const r = rnd();
        if (r < 0.4) shapes.push([2, 2]);
        if (r < 0.85) shapes.push(...(rnd() < 0.5 ? [[2, 1], [1, 2]] : [[1, 2], [2, 1]]) as [number, number][]);
        shapes.push([1, 1]);
        const [w, h] = shapes.find(([w, h]) => {
          for (let dj = 0; dj < h; dj++) for (let di = 0; di < w; di++) if (!free(i + di, j + dj)) return false;
          return true;
        })!;
        for (let dj = 0; dj < h; dj++) for (let di = 0; di < w; di++) a[idx(i + di, j + dj)] = rooms.length;
        rooms.push({ floor: fl, i, j, w, h, type: 'secret', door: null, seed: Math.floor(rnd() * 2 ** 31), mobs: [] });
      }
    }
  }

  // Puertas: un lado al azar de los que dan a un pasillo (sin ninguno, la habitación queda secreta).
  for (const room of rooms) {
    if (room.type === 'stairs') continue;
    const opts: { i: number; j: number; dir: number }[] = [];
    for (let dj = 0; dj < room.h; dj++) {
      for (let di = 0; di < room.w; di++) {
        for (let d = 0; d < 4; d++) {
          const ni = room.i + di + DX[d], nj = room.j + dj + DZ[d];
          if (ni >= 0 && nj >= 0 && ni < G && nj < G && cells[room.floor][idx(ni, nj)] === CORR) opts.push({ i: room.i + di, j: room.j + dj, dir: d });
        }
      }
    }
    if (opts.length) room.door = pick(opts);
  }

  assignRooms(rooms, rnd);
  const entrance = { i: entryCells[0][0], j: entryCells[0][1], dir: e };
  const L: MansionLayout = {
    x0: s.x - (N - 1) / 2, z0: s.z - (N - 1) / 2, y: s.y, cells, rooms, stairs, entrance,
    vEdges: cells.map(() => new Uint8Array((G + 1) * G)), hEdges: cells.map(() => new Uint8Array(G * (G + 1))),
    topF: new Int8Array(N * N), roof: new Int8Array(N * N), roofDir: new Int8Array(N * N), yard: new Uint8Array(NY * NY),
  };
  for (const room of rooms) if (room.door) setEdge(L, room.floor, room.door.i, room.door.j, room.door.dir, room.type === 'jail' ? EDGE_BARS : EDGE_OPEN);
  setEdge(L, 0, entrance.i, entrance.j, entrance.dir, EDGE_ENTRANCE);
  computeRoofs(L);
  for (let z = 0; z < NY; z++) {
    for (let x = 0; x < NY; x++) {
      let near = false;
      for (let dz = -YARD; dz <= YARD && !near; dz++) {
        for (let dx = -YARD; dx <= YARD && !near; dx++) {
          const lx = x - YARD + dx, lz = z - YARD + dz;
          near = lx >= 0 && lz >= 0 && lx < N && lz < N && L.topF[lz * N + lx] >= 0;
        }
      }
      L.yard[z * NY + x] = near ? 1 : 0;
    }
  }
  return L;
}

/** Marca el hueco de la pared entre la celda (i, j) y su vecina hacia `dir`. */
function setEdge(L: MansionLayout, fl: number, i: number, j: number, dir: number, kind: number): void {
  if (dir === 0) L.hEdges[fl][j * G + i] = kind;
  else if (dir === 2) L.hEdges[fl][(j + 1) * G + i] = kind;
  else if (dir === 3) L.vEdges[fl][j * (G + 1) + i] = kind;
  else L.vEdges[fl][j * (G + 1) + i + 1] = kind;
}

const TYPES_1: RoomType[] = ['bedroom_small', 'flower', 'office', 'checker', 'pumpkin', 'storage', 'birch_pillar', 'cobweb'];
const TYPES_2: RoomType[] = ['bedroom', 'library', 'wool_x', 'dining_small', 'bedroom', 'library'];
const TYPES_4: RoomType[] = ['dining', 'conference', 'map_room', 'chess', 'garden', 'statue'];
const ATTIC_1: RoomType[] = ['attic_storage', 'bedroom_small', 'cobweb', 'flower', 'storage'];
const ATTIC_2: RoomType[] = ['attic_storage', 'bedroom', 'library'];
const ATTIC_4: RoomType[] = ['statue', 'attic_storage', 'conference'];

/** Tipo de cada habitación y quién vive en ella. */
function assignRooms(rooms: MansionRoom[], rnd: () => number): void {
  const shuffled = <T>(a: readonly T[]): T[] => {
    const out = [...a];
    for (let k = out.length - 1; k > 0; k--) {
      const m = Math.floor(rnd() * (k + 1));
      [out[k], out[m]] = [out[m], out[k]];
    }
    return out;
  };
  const open = rooms.filter((r) => r.type !== 'stairs' && r.door);
  // Las celdas (con alays) y el falso portal del End no faltan nunca si hay sitio.
  const small = shuffled(open.filter((r) => r.w * r.h === 1 && r.floor < 2));
  for (let k = 0; k < Math.min(small.length, 1 + (rnd() < 0.5 ? 1 : 0)); k++) small[k].type = 'jail';
  const long = shuffled(open.filter((r) => r.w * r.h === 2)).sort((a, b) => b.floor - a.floor);
  if (long.length) long[0].type = 'fake_portal';
  const big0 = open.find((r) => r.w * r.h === 4 && r.floor === 0);
  if (big0) big0.type = 'dining';
  const bags = new Map<string, RoomType[]>();
  const next = (list: RoomType[], key: string): RoomType => {
    let bag = bags.get(key);
    if (!bag || bag.length === 0) bags.set(key, (bag = shuffled(list)));
    return bag.pop()!;
  };
  for (const r of rooms) {
    if (r.type !== 'secret' || !r.door) continue;
    const size = r.w * r.h;
    const attic = r.floor === 2;
    if (size === 1) r.type = next(attic ? ATTIC_1 : TYPES_1, `1${attic}`);
    else if (size === 2) r.type = next(attic ? ATTIC_2 : TYPES_2, `2${attic}`);
    else r.type = next(attic ? ATTIC_4 : TYPES_4, `4${attic}`);
  }
  // Habitantes: vindicadores casi por todas partes y evocadores en las salas grandes; alays en las celdas.
  let evokers = 0;
  for (const r of rooms) {
    const size = r.w * r.h;
    if (r.type === 'jail') {
      r.mobs.push(MOB_ALLAY);
      if (rnd() < 0.5) r.mobs.push(MOB_ALLAY);
    } else if (r.type === 'stairs' || r.type === 'secret') continue;
    else if (size === 4) {
      if (rnd() < 0.5) {
        r.mobs.push(MOB_EVOKER);
        evokers++;
      }
      r.mobs.push(MOB_VINDICATOR);
      if (rnd() < 0.5) r.mobs.push(MOB_VINDICATOR);
    } else if (rnd() < (size === 2 ? 0.6 : 0.3)) r.mobs.push(MOB_VINDICATOR);
  }
  // Al menos dos evocadores, en las salas más grandes que no tengan ya uno.
  const halls = rooms.filter((q) => q.door && q.type !== 'jail' && q.type !== 'stairs' && !q.mobs.includes(MOB_EVOKER))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  for (let k = 0; evokers < 2 && k < halls.length; k++, evokers++) halls[k].mobs.unshift(MOB_EVOKER);
}

// ------------------------------------------------------------------ tejados

/** ¿Cubre la planta `fl` la columna (lx, lz)? (Una celda ocupa también las líneas de sus paredes.) */
function covers(L: MansionLayout, fl: number, lx: number, lz: number): boolean {
  const is = lx % CELL === 0 ? [lx / CELL - 1, lx / CELL] : [Math.floor(lx / CELL)];
  const js = lz % CELL === 0 ? [lz / CELL - 1, lz / CELL] : [Math.floor(lz / CELL)];
  for (const j of js) for (const i of is) if (i >= 0 && j >= 0 && i < G && j < G && L.cells[fl][idx(i, j)] !== OUT) return true;
  return false;
}

/** Distancia de Chebyshev de cada columna a la más cercana en la que `src` es cierto (fuera cuenta si `outside`). */
function chebyshev(src: (i: number) => boolean, outside: boolean): Int16Array {
  const INF = 999;
  const d = new Int16Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = src(k) ? 0 : INF;
  const at = (x: number, z: number) => (x < 0 || z < 0 || x >= N || z >= N ? (outside ? 0 : INF) : d[z * N + x]);
  for (let z = 0; z < N; z++) {
    for (let x = 0; x < N; x++) {
      const k = z * N + x;
      d[k] = Math.min(d[k], at(x - 1, z) + 1, at(x, z - 1) + 1, at(x - 1, z - 1) + 1, at(x + 1, z - 1) + 1);
    }
  }
  for (let z = N - 1; z >= 0; z--) {
    for (let x = N - 1; x >= 0; x--) {
      const k = z * N + x;
      d[k] = Math.min(d[k], at(x + 1, z) + 1, at(x, z + 1) + 1, at(x + 1, z + 1) + 1, at(x - 1, z + 1) + 1);
    }
  }
  return d;
}

/**
 * Tejado a cuatro aguas sobre la parte de cada planta que no tiene otra encima: sube un bloque por
 * cada bloque hacia dentro (hasta 4) y baja otra vez junto a las paredes de la planta de arriba para no
 * tapar sus ventanas.
 */
function computeRoofs(L: MansionLayout): void {
  const inF = [0, 1, 2].map((fl) => {
    const m = new Uint8Array(N * N);
    for (let lz = 0; lz < N; lz++) for (let lx = 0; lx < N; lx++) m[lz * N + lx] = covers(L, fl, lx, lz) ? 1 : 0;
    return m;
  });
  L.topF.fill(-1);
  for (let k = 0; k < N * N; k++) for (let fl = 0; fl < FLOORS; fl++) if (inF[fl][k]) L.topF[k] = fl;
  const inside = inF.map((m) => chebyshev((k) => !m[k], true));
  const near = inF.map((m) => chebyshev((k) => m[k] === 1, false));
  for (let k = 0; k < N * N; k++) {
    const fl = L.topF[k];
    if (fl < 0) continue;
    const lim = fl + 1 < FLOORS ? Math.max(0, near[fl + 1][k] - 2) : 99;
    L.roof[k] = Math.min(inside[fl][k], 4, lim);
  }
  for (let lz = 0; lz < N; lz++) {
    for (let lx = 0; lx < N; lx++) {
      const k = lz * N + lx;
      L.roofDir[k] = -1;
      const fl = L.topF[k];
      if (fl < 0) continue;
      let best = L.roof[k];
      for (let d = 0; d < 4; d++) {
        const x = lx + DX[d], z = lz + DZ[d];
        if (x < 0 || z < 0 || x >= N || z >= N) continue;
        const q = z * N + x;
        if (L.topF[q] === fl && L.roof[q] > best) {
          best = L.roof[q];
          L.roofDir[k] = d;
        }
      }
    }
  }
}

// ------------------------------------------------------------------ dibujo

/** Lo que usa la mansión del lienzo del chunk (la clase Canvas de structures.ts). */
export interface MansionCanvas {
  readonly x0: number;
  readonly z0: number;
  get(x: number, y: number, z: number): number;
  set(x: number, y: number, z: number, id: number): void;
  chest(x: number, y: number, z: number, facing: number, table: string): void;
  foundation(x: number, y: number, z: number, id: number): void;
  clearAbove(x: number, y: number, z: number, h: number): void;
  mob(type: number, x: number, y: number, z: number): void;
}

const cellAt = (L: MansionLayout, fl: number, i: number, j: number): number =>
  i < 0 || j < 0 || i >= G || j >= G ? OUT : L.cells[fl][idx(i, j)];

/** ¿Hay pared entre dos celdas? (Nada entre dos pasillos, ni dentro de una habitación, ni fuera de todo.) */
const wallBetween = (a: number, b: number): boolean => (a !== OUT || b !== OUT) && !(a === b && a !== OUT) && !(a === CORR && b === CORR);

const stairsOf = (m: string, facing: number, half = 0) => stateOf(STAIRS[m], { facing, half });

export function buildMansion(c: MansionCanvas, s: Start): void {
  const L = mansionLayout(s);
  const X0 = Math.max(c.x0, L.x0 - YARD), X1 = Math.min(c.x0 + 15, L.x0 + N - 1 + YARD);
  const Z0 = Math.max(c.z0, L.z0 - YARD), Z1 = Math.min(c.z0 + 15, L.z0 + N - 1 + YARD);
  if (X0 > X1 || Z0 > Z1) return;
  const y = L.y;
  // Terreno: se despeja lo que hay encima de la huella (colinas y árboles) y se rellena debajo; alrededor,
  // un patio de hierba al nivel del suelo para que las ventanas de abajo no queden enterradas.
  for (let z = Z0; z <= Z1; z++) {
    for (let x = X0; x <= X1; x++) {
      const lx = x - L.x0, lz = z - L.z0;
      const k = lz * N + lx;
      if (lx >= 0 && lz >= 0 && lx < N && lz < N && L.topF[k] >= 0) {
        c.clearAbove(x, y + 1, z, FLOORS * FH + 12);
        c.foundation(x, y - 1, z, COBBLESTONE);
      } else if (L.yard[(lz + YARD) * NY + lx + YARD]) {
        c.clearAbove(x, y + 1, z, FLOORS * FH + 6);
        const b = c.get(x, y, z);
        if (b >= 0 && (b === AIR || !BLOCK_OPAQUE[b] || isLeaves(b) || isLog(b))) {
          c.foundation(x, y, z, DIRT);
          c.set(x, y, z, GRASS);
        }
      }
    }
  }
  for (let fl = 0; fl < FLOORS; fl++) {
    for (let z = Z0; z <= Z1; z++) for (let x = X0; x <= X1; x++) drawColumn(c, L, fl, x, z);
  }
  drawRoofs(c, L, X0, X1, Z0, Z1);
  drawEntrance(c, L);
  for (const room of L.rooms) {
    const x0 = L.x0 + room.i * CELL, z0 = L.z0 + room.j * CELL;
    if (x0 > c.x0 + 15 || z0 > c.z0 + 15 || x0 + room.w * CELL < c.x0 || z0 + room.h * CELL < c.z0) continue;
    furnish(new RoomDraw(c, L, room));
  }
  for (const st of L.stairs) drawStairs(c, L, st);
}

/** Una columna de una planta: suelo, pared (con ventanas y puertas) o hueco, y la alfombra de los pasillos. */
function drawColumn(c: MansionCanvas, L: MansionLayout, fl: number, x: number, z: number): void {
  const lx = x - L.x0, lz = z - L.z0;
  if (lx < 0 || lz < 0 || lx >= N || lz >= N || L.topF[lz * N + lx] < fl) return;
  const yf = L.y + fl * FH;
  const onX = lx % CELL === 0, onZ = lz % CELL === 0;
  const i = Math.floor(lx / CELL), j = Math.floor(lz / CELL);
  let wall = false, exterior = false, post = false, edge = 0, off = 0, corridor = false;
  if (onX && onZ) {
    const a = cellAt(L, fl, i - 1, j - 1), b = cellAt(L, fl, i, j - 1), cc = cellAt(L, fl, i - 1, j), d = cellAt(L, fl, i, j);
    post = wallBetween(a, b) || wallBetween(cc, d) || wallBetween(a, cc) || wallBetween(b, d);
    exterior = [a, b, cc, d].includes(OUT);
    corridor = a === CORR && b === CORR && cc === CORR && d === CORR;
  } else if (onX) {
    const a = cellAt(L, fl, i - 1, j), b = cellAt(L, fl, i, j);
    wall = wallBetween(a, b);
    exterior = a === OUT || b === OUT;
    edge = L.vEdges[fl][j * (G + 1) + i];
    off = lz - j * CELL;
    corridor = a === CORR && b === CORR;
  } else if (onZ) {
    const a = cellAt(L, fl, i, j - 1), b = cellAt(L, fl, i, j);
    wall = wallBetween(a, b);
    exterior = a === OUT || b === OUT;
    edge = L.hEdges[fl][j * G + i];
    off = lx - i * CELL;
    corridor = a === CORR && b === CORR;
  } else corridor = cellAt(L, fl, i, j) === CORR;
  // Suelo (en la planta baja, la roca asoma por fuera; en las de arriba, una franja de abedul).
  c.set(x, yf, z, exterior ? (fl === 0 ? COBBLESTONE : BIRCH_PLANKS) : DARK_OAK_PLANKS);
  for (let dy = 1; dy < FH; dy++) {
    let id = AIR;
    if (post) id = DARK_OAK_LOG;
    else if (wall) {
      id = exterior ? (fl === 0 && dy === 1 ? COBBLESTONE : DARK_OAK_PLANKS) : dy === 1 || dy === FH - 1 ? DARK_OAK_PLANKS : BIRCH_PLANKS;
      if (edge === EDGE_OPEN && off >= 3 && off <= 5 && dy <= 3) id = AIR;
      else if (edge === EDGE_ENTRANCE && off >= 3 && off <= 5 && dy <= 4) id = AIR;
      else if (edge === EDGE_BARS && dy <= 4) id = IRON_BARS;
      else if (exterior && !edge && (off === 2 || off === 3 || off === 5 || off === 6) && dy >= 2 && dy <= 4) id = GLASS_PANE;
    }
    c.set(x, yf + dy, z, id);
  }
  if (corridor) {
    // Pasillo: alfombra gris con un farol colgado en el centro de cada celda.
    c.set(x, yf + 1, z, CARPETS.gray);
    if (lx % CELL === 4 && lz % CELL === 4) c.set(x, yf + FH - 1, z, stateOf(LANTERN, { hanging: 1 }));
  }
}

function drawRoofs(c: MansionCanvas, L: MansionLayout, X0: number, X1: number, Z0: number, Z1: number): void {
  for (let z = Z0; z <= Z1; z++) {
    for (let x = X0; x <= X1; x++) {
      const lx = x - L.x0, lz = z - L.z0;
      const k = lz * N + lx;
      const inside = lx >= 0 && lz >= 0 && lx < N && lz < N;
      const fl = inside ? L.topF[k] : -1;
      if (fl >= 0) {
        const yr = L.y + (fl + 1) * FH;
        c.set(x, yr, z, DARK_OAK_PLANKS);
        const p = L.roof[k];
        if (p > 0) c.set(x, yr + p, z, L.roofDir[k] >= 0 ? stairsOf('dark_oak', L.roofDir[k]) : DARK_OAK_PLANKS);
      }
      // Alero: una escalera por fuera de la pared, al nivel del techo de la planta que acaba ahí.
      let eave = -1, eaveDir = 0;
      for (let d = 0; d < 4; d++) {
        const nx = lx + DX[d], nz = lz + DZ[d];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const nf = L.topF[nz * N + nx];
        if (nf > fl && nf > eave) {
          eave = nf;
          eaveDir = d;
        }
      }
      if (eave >= 0 && (fl < 0 || !coversAt(L, eave, lx, lz))) c.set(x, L.y + (eave + 1) * FH, z, stairsOf('dark_oak', eaveDir));
    }
  }
}

const coversAt = (L: MansionLayout, fl: number, lx: number, lz: number) => lx >= 0 && lz >= 0 && lx < N && lz < N && covers(L, fl, lx, lz);

/** Porche de la entrada: plataforma de roca, dos postes y un tejadillo de losas. */
function drawEntrance(c: MansionCanvas, L: MansionLayout): void {
  const { i, j, dir } = L.entrance;
  const out = dir, r = (dir + 1) & 3;
  // Punto medio de la pared exterior de la celda de la entrada.
  const cx = L.x0 + i * CELL + 4 + DX[out] * 4, cz = L.z0 + j * CELL + 4 + DZ[out] * 4;
  const at = (u: number, v: number): [number, number] => [cx + DX[r] * u + DX[out] * v, cz + DZ[r] * u + DZ[out] * v];
  for (let v = 1; v <= 3; v++) {
    for (let u = -3; u <= 3; u++) {
      const [x, z] = at(u, v);
      c.clearAbove(x, L.y + 1, z, 8);
      c.foundation(x, L.y - 1, z, COBBLESTONE);
      c.set(x, L.y, z, Math.abs(u) === 3 || v === 3 ? COBBLESTONE : MOSSY_COBBLESTONE);
      if ((u === -3 || u === 3) && v === 3) for (let dy = 1; dy <= 4; dy++) c.set(x, L.y + dy, z, DARK_OAK_LOG);
      c.set(x, L.y + 5, z, stateOf(SLABS.dark_oak, { type: 0 }));
    }
  }
  for (const u of [-2, 2]) {
    const [x, z] = at(u, 1);
    c.set(x, L.y + 4, z, stateOf(LANTERN, { hanging: 1 }));
  }
}

/** Tramo recto de escalera: sube hacia el lado contrario de la puerta y sale a un pasillo de arriba. */
function drawStairs(c: MansionCanvas, L: MansionLayout, st: MansionLayout['stairs'][number]): void {
  const room = L.rooms.find((r) => r.type === 'stairs' && r.floor === st.floor && r.i === st.i && r.j === st.j);
  if (!room) return;
  const rd = new RoomDraw(c, L, room);
  const up = rd.face(0);
  for (let v = 0; v < 7; v++) {
    for (let u = 2; u <= 4; u++) {
      for (let dy = 1; dy <= v; dy++) rd.set(u, v, dy, DARK_OAK_PLANKS);
      rd.set(u, v, v + 1, stairsOf('dark_oak', up));
      // Hueco en el suelo de arriba para la cabeza (y su alfombra).
      if (v >= 1 && v <= 5) rd.set(u, v, FH, AIR);
      if (v >= 1) rd.set(u, v, FH + 1, AIR);
    }
  }
  // Barandilla arriba alrededor del hueco (abierta por donde se llega).
  for (let v = 0; v <= 5; v++) for (const u of [1, 5]) rd.set(u, v, FH + 1, FENCES.dark_oak);
  for (let u = 2; u <= 4; u++) rd.set(u, 0, FH + 1, FENCES.dark_oak);
  rd.lantern(0, 6);
}

// ------------------------------------------------------------------ habitaciones

/**
 * Dibujo de una habitación en coordenadas propias: u a lo ancho (de izquierda a derecha mirando desde
 * la puerta) y v hacia dentro (0 junto a la pared de la puerta); dy es la altura sobre el suelo.
 */
class RoomDraw {
  readonly y: number;
  readonly W: number;
  readonly D: number;
  /** Centro de la puerta en u. */
  readonly doorU: number;
  readonly rnd: () => number;
  private ox: number;
  private oz: number;
  private a: number;
  private r: number;

  constructor(readonly c: MansionCanvas, readonly L: MansionLayout, readonly room: MansionRoom) {
    this.y = L.y + room.floor * FH;
    this.rnd = mulberry32(room.seed);
    const d = room.door?.dir ?? 2;
    this.a = (d + 2) & 3;
    this.r = (this.a + 1) & 3;
    const x0 = L.x0 + room.i * CELL + 1, x1 = L.x0 + (room.i + room.w) * CELL - 1;
    const z0 = L.z0 + room.j * CELL + 1, z1 = L.z0 + (room.j + room.h) * CELL - 1;
    const ax = DX[this.a], az = DZ[this.a], rx = DX[this.r], rz = DZ[this.r];
    this.ox = ax ? (ax > 0 ? x0 : x1) : rx > 0 ? x0 : x1;
    this.oz = az ? (az > 0 ? z0 : z1) : rz > 0 ? z0 : z1;
    this.W = rx ? x1 - x0 + 1 : z1 - z0 + 1;
    this.D = ax ? x1 - x0 + 1 : z1 - z0 + 1;
    if (room.door) {
      const dx = L.x0 + room.door.i * CELL + 4, dz = L.z0 + room.door.j * CELL + 4;
      this.doorU = (dx - this.ox) * rx + (dz - this.oz) * rz;
    } else this.doorU = this.W >> 1;
  }

  at(u: number, v: number): [number, number] {
    return [this.ox + DX[this.r] * u + DX[this.a] * v, this.oz + DZ[this.r] * u + DZ[this.a] * v];
  }

  /** Orientación en el mundo de una dirección local: 0 hacia dentro, 1 derecha, 2 hacia la puerta, 3 izquierda. */
  face(local: number): number {
    return (this.a + local) & 3;
  }

  set(u: number, v: number, dy: number, id: number): void {
    if (id < 0) return;
    const [x, z] = this.at(u, v);
    this.c.set(x, this.y + dy, z, id);
  }

  fill(u0: number, v0: number, u1: number, v1: number, dy: number, id: number | ((u: number, v: number) => number)): void {
    for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) this.set(u, v, dy, typeof id === 'number' ? id : id(u, v));
  }

  chest(u: number, v: number, local: number, chance = 1): void {
    if (this.rnd() >= chance) return;
    const [x, z] = this.at(u, v);
    this.c.chest(x, this.y + 1, z, this.face(local), MANSION_LOOT);
  }

  /** ¿Delante de la puerta? (se deja libre para entrar y para que aparezcan sus habitantes). */
  front(u: number, v: number): boolean {
    return v <= 1 && Math.abs(u - this.doorU) <= 1 && !!this.room.door;
  }

  lantern(u: number, v: number): void {
    this.set(u, v, FH - 1, stateOf(LANTERN, { hanging: 1 }));
  }

  /** Recorre el borde interior (pegado a las paredes), sin la zona de la puerta. */
  perimeter(fn: (u: number, v: number, toWall: number) => void): void {
    for (let u = 0; u < this.W; u++) {
      if (!this.front(u, 0)) fn(u, 0, 2);
      fn(u, this.D - 1, 0);
    }
    for (let v = 1; v < this.D - 1; v++) {
      fn(0, v, 3);
      fn(this.W - 1, v, 1);
    }
  }

  pot(): number {
    const plants = [POPPY, DANDELION, CORNFLOWER, FLOWERS.allium, FLOWERS.blue_orchid, FLOWERS.white_tulip, FLOWERS.oxeye_daisy];
    return potWith(plants[Math.floor(this.rnd() * plants.length)]) || potWith(POPPY);
  }
}

const FURNISH: Partial<Record<RoomType, (r: RoomDraw) => void>> = {
  jail, secret, bedroom_small: bedroomSmall, flower, office, checker, pumpkin, storage, birch_pillar: birchPillar, cobweb,
  bedroom, library, wool_x: woolX, dining_small: diningSmall, fake_portal: fakePortal, dining, conference, map_room: mapRoom,
  chess, garden, statue, attic_storage: atticStorage,
};

function furnish(r: RoomDraw): void {
  FURNISH[r.room.type]?.(r);
  // Habitantes: delante de la puerta, por dentro (los alays, en el centro de la celda).
  const room = r.room;
  room.mobs.forEach((type, k) => {
    const flying = type === MOB_ALLAY;
    const u = flying ? r.W >> 1 : Math.max(0, Math.min(r.W - 1, r.doorU - 1 + (k % 3)));
    const v = flying ? r.D >> 1 : 1;
    const [x, z] = r.at(u, v);
    if (x < r.c.x0 || x > r.c.x0 + 15 || z < r.c.z0 || z > r.c.z0 + 15) return;
    r.c.mob(type, x + 0.5, r.y + (flying ? 2 : 1), z + 0.5);
  });
}

/** Celda: suelo de roca, barrotes en la pared del pasillo (los pone la pared), telarañas y paja. */
function jail(r: RoomDraw): void {
  r.fill(0, 0, r.W - 1, r.D - 1, 0, () => (r.rnd() < 0.4 ? MOSSY_COBBLESTONE : COBBLESTONE));
  r.set(0, r.D - 1, FH - 1, COBWEB);
  r.set(r.W - 1, r.D - 1, FH - 1, COBWEB);
  r.set(r.W - 1, r.D - 2, FH - 1, COBWEB);
  r.set(0, r.D - 1, 1, HAY_BALE);
  r.set(1, r.D - 1, 1, CARPETS.brown);
}

/** Habitación secreta, tapiada: cofres, telarañas y, a veces, un bloque de diamante encerrado en obsidiana. */
function secret(r: RoomDraw): void {
  const cu = r.W >> 1, cv = r.D >> 1;
  r.chest(cu - 1, r.D - 1, 2);
  r.chest(cu + 1, r.D - 1, 2);
  if (r.W * r.D > 60 && r.rnd() < 0.6) {
    for (let dy = 1; dy <= 3; dy++) for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) r.set(cu + du, cv + dv, dy, OBSIDIAN);
    r.set(cu, cv, 2, DIAMOND_BLOCK);
  }
  for (let k = 0; k < 6; k++) r.set(Math.floor(r.rnd() * r.W), Math.floor(r.rnd() * r.D), FH - 1 - Math.floor(r.rnd() * 2), COBWEB);
  r.lantern(cu, cv);
}

function bedroomSmall(r: RoomDraw): void {
  const bed = BEDS[['red', 'blue', 'light_gray', 'brown'][Math.floor(r.rnd() * 4)]] ?? BEDS.red;
  const bu = r.doorU > r.W / 2 ? 1 : r.W - 2;
  r.fill(1, 2, r.W - 2, r.D - 2, 1, CARPETS.white);
  r.set(bu, r.D - 1, 1, stateOf(bed, { facing: r.face(0), part: 1 }));
  r.set(bu, r.D - 2, 1, stateOf(bed, { facing: r.face(0), part: 0 }));
  const side = bu === 1 ? 0 : r.W - 1;
  r.set(side, r.D - 1, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.set(side, r.D - 1, 2, r.pot());
  r.chest(side, r.D - 3, bu === 1 ? 1 : 3, 0.4);
  r.lantern(r.W >> 1, r.D >> 1);
}

function flower(r: RoomDraw): void {
  const cu = r.W >> 1, cv = r.D >> 1;
  for (let dy = 1; dy <= 2; dy++) r.set(cu, cv, dy, DARK_OAK_LOG);
  for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) if (du || dv) r.set(cu + du, cv + dv, 3, DARK_OAK_LEAVES);
  r.set(cu, cv, 3, DARK_OAK_LEAVES);
  r.perimeter((u, v) => {
    if ((u + v) % 2 === 0) return;
    r.set(u, v, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    r.set(u, v, 2, r.pot());
  });
  r.lantern(cu, 1);
}

function office(r: RoomDraw): void {
  const cu = r.W >> 1;
  // Estanterías en la pared del fondo, escritorio con silla y atril.
  for (let u = 0; u < r.W; u++) for (let dy = 1; dy <= 3; dy++) r.set(u, r.D - 1, dy, BOOKSHELF);
  for (let u = cu - 1; u <= cu + 1; u++) r.set(u, r.D - 3, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.set(cu, r.D - 4, 1, stateOf(STAIRS.dark_oak, { facing: r.face(2), half: 0 }));
  r.set(cu - 1, r.D - 3, 2, stateOf(LANTERN, { hanging: 0 }));
  r.set(0, 2, 1, LECTERN);
  r.chest(r.W - 1, 2, 3, 0.5);
}

function checker(r: RoomDraw): void {
  r.fill(0, 0, r.W - 1, r.D - 1, 0, (u, v) => ((u + v) % 2 ? WOOL.black : WOOL.white));
  const cu = r.W >> 1, cv = r.D >> 1;
  r.set(cu, cv, 1, FENCES.dark_oak);
  r.set(cu, cv, 2, CARPETS.white);
  r.lantern(cu, cv);
}

function pumpkin(r: RoomDraw): void {
  const cu = r.W >> 1, cv = r.D >> 1;
  for (let dy = 1; dy <= FH - 1; dy++) r.set(cu, cv, dy, DARK_OAK_LOG);
  for (let du = -2; du <= 2; du++) {
    for (let dv = -2; dv <= 2; dv++) {
      if (Math.max(Math.abs(du), Math.abs(dv)) !== 2 || r.front(cu + du, cv + dv)) continue;
      const toCenter = Math.abs(du) > Math.abs(dv) ? (du > 0 ? 3 : 1) : dv > 0 ? 2 : 0;
      r.set(cu + du, cv + dv, 1, r.rnd() < 0.5 ? PUMPKIN : stateOf(JACK_O_LANTERN, { facing: r.face(toCenter) }));
    }
  }
}

function storage(r: RoomDraw): void {
  r.perimeter((u, v) => {
    if (r.rnd() < 0.45) r.set(u, v, 1, r.rnd() < 0.5 ? BARREL : HAY_BALE);
    else if (r.rnd() < 0.25) r.set(u, v, 1, CRAFTING_TABLE);
  });
  r.chest(1, r.D - 1, 2, 0.8);
  r.chest(r.W - 2, r.D - 1, 2, 0.5);
  r.lantern(r.W >> 1, r.D >> 1);
}

function birchPillar(r: RoomDraw): void {
  for (const u of [1, r.W - 2]) {
    for (const v of [2, r.D - 2]) {
      for (let dy = 1; dy < FH; dy++) r.set(u, v, dy, BIRCH_LOG);
      r.set(u, v - 1, 3, stateOf(LANTERN, { hanging: 0 }));
    }
  }
  r.fill(2, 3, r.W - 3, r.D - 3, 1, CARPETS.light_gray);
}

function cobweb(r: RoomDraw): void {
  for (let k = 0; k < 10; k++) {
    const u = Math.floor(r.rnd() * r.W), v = Math.floor(r.rnd() * r.D);
    if (!r.front(u, v)) r.set(u, v, 1 + Math.floor(r.rnd() * (FH - 1)), COBWEB);
  }
  r.chest(r.W >> 1, r.D - 1, 2, 0.7);
}

function bedroom(r: RoomDraw): void {
  const bed = BEDS[['red', 'white', 'blue', 'light_gray'][Math.floor(r.rnd() * 4)]] ?? BEDS.red;
  r.fill(1, 2, r.W - 2, r.D - 2, 1, CARPETS[(['red', 'light_gray', 'brown'] as const)[Math.floor(r.rnd() * 3)]]);
  const cu = r.W >> 1;
  // Dos camas con la cabecera contra el fondo y una mesilla con maceta entre ellas.
  for (const u of [cu - 2, cu + 2]) {
    r.set(u, r.D - 1, 1, stateOf(bed, { facing: r.face(0), part: 1 }));
    r.set(u, r.D - 2, 1, stateOf(bed, { facing: r.face(0), part: 0 }));
  }
  r.set(cu, r.D - 1, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.set(cu, r.D - 1, 2, r.pot());
  r.chest(0, r.D - 2, 1, 0.6);
  for (let dy = 1; dy <= 2; dy++) r.set(r.W - 1, r.D - 1, dy, BOOKSHELF);
  r.set(r.W - 1, r.D - 3, 1, CRAFTING_TABLE);
  r.lantern(cu, r.D >> 1);
}

function library(r: RoomDraw): void {
  r.perimeter((u, v) => {
    for (let dy = 1; dy <= 4; dy++) r.set(u, v, dy, BOOKSHELF);
  });
  // Pasillo de estanterías y una mesa de lectura con atril.
  const cu = r.W >> 1;
  for (let v = 3; v < r.D - 3; v += 3) for (const u of [2, r.W - 3]) for (let dy = 1; dy <= 3; dy++) if (u !== cu) r.set(u, v, dy, BOOKSHELF);
  r.set(cu, r.D - 3, 1, LECTERN);
  r.fill(cu - 1, 3, cu + 1, 3, 1, stateOf(SLABS.dark_oak, { type: 1 }));
  r.chest(cu, r.D - 2, 2, 0.4);
  r.lantern(cu, r.D >> 1);
  r.lantern(cu, 2);
}

function woolX(r: RoomDraw): void {
  r.fill(0, 0, r.W - 1, r.D - 1, 0, (u, v) => {
    const a = (u * (r.D - 1)) / Math.max(1, r.W - 1);
    return Math.abs(a - v) < 1 || Math.abs(r.D - 1 - a - v) < 1 ? WOOL.gray : WOOL.white;
  });
  r.lantern(r.W >> 1, r.D >> 1);
}

function diningSmall(r: RoomDraw): void {
  const cu = r.W >> 1;
  for (let v = 3; v <= r.D - 3; v++) {
    r.set(cu, v, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    if (v % 2 === 0) {
      r.set(cu - 1, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(3), half: 0 }));
      r.set(cu + 1, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(1), half: 0 }));
    }
  }
  r.set(cu, r.D >> 1, 2, CAKE);
  r.lantern(cu, r.D >> 1);
}

/** El falso portal del End: marco de obsidiana alrededor de un pozo negro, con un cofre dentro. */
function fakePortal(r: RoomDraw): void {
  const cu = r.W >> 1, cv = r.D >> 1;
  for (let du = -2; du <= 2; du++) {
    for (let dv = -2; dv <= 2; dv++) {
      const ring = Math.max(Math.abs(du), Math.abs(dv)) === 2;
      if (ring) {
        if (Math.abs(du) !== 2 || Math.abs(dv) !== 2) r.set(cu + du, cv + dv, 1, OBSIDIAN);
      } else r.set(cu + du, cv + dv, 0, WOOL.black);
    }
  }
  r.chest(cu, cv, 2);
  r.perimeter((u, v) => {
    if ((u + v) % 3 === 0) for (let dy = 1; dy <= 3; dy++) r.set(u, v, dy, BOOKSHELF);
  });
  r.lantern(cu - 2, cv - 2);
  r.lantern(cu + 2, cv + 2);
}

function dining(r: RoomDraw): void {
  const cu = r.W >> 1;
  // Mesa larga con sillas a los lados, tartas y faroles encima.
  for (let v = 3; v <= r.D - 3; v++) {
    for (const u of [cu - 1, cu, cu + 1]) r.set(u, v, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    if (v % 2 === 1) {
      r.set(cu - 2, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(3), half: 0 }));
      r.set(cu + 2, v, 1, stateOf(STAIRS.dark_oak, { facing: r.face(1), half: 0 }));
    }
    if (v % 4 === 1) r.set(cu, v, 2, CAKE);
    else if (v % 4 === 3) r.set(cu, v, 2, stateOf(LANTERN, { hanging: 0 }));
  }
  r.set(cu, r.D - 2, 1, stateOf(STAIRS.dark_oak, { facing: r.face(0), half: 0 }));
  r.fill(1, 1, r.W - 2, 1, 1, (u) => (Math.abs(u - r.doorU) <= 1 ? AIR : CARPETS.red));
  for (const v of [4, r.D - 5]) for (const u of [cu - 4, cu + 4]) r.lantern(u, v);
}

function conference(r: RoomDraw): void {
  const cu = r.W >> 1, cv = r.D >> 1;
  // Mesa redonda (anillo de losas) con sillas alrededor.
  for (let du = -2; du <= 2; du++) {
    for (let dv = -2; dv <= 2; dv++) {
      const d = Math.max(Math.abs(du), Math.abs(dv));
      if (d === 1 || (d === 2 && Math.abs(du) !== Math.abs(dv) && (du === 0 || dv === 0))) r.set(cu + du, cv + dv, 1, stateOf(SLABS.dark_oak, { type: 1 }));
    }
  }
  r.set(cu, cv, 1, DARK_OAK_LOG);
  r.set(cu, cv, 2, stateOf(LANTERN, { hanging: 0 }));
  for (const [du, dv, f] of [[0, -3, 2], [0, 3, 0], [-3, 0, 3], [3, 0, 1], [-2, -2, 2], [2, 2, 0], [-2, 2, 0], [2, -2, 2]] as const) {
    r.set(cu + du, cv + dv, 1, stateOf(STAIRS.dark_oak, { facing: r.face(f), half: 0 }));
  }
  r.fill(cu - 4, cv - 4, cu + 4, cv + 4, 0, (u, v) => (Math.max(Math.abs(u - cu), Math.abs(v - cv)) === 4 ? WOOL.red : DARK_OAK_PLANKS));
  r.lantern(cu - 4, cv - 4);
  r.lantern(cu + 4, cv + 4);
  r.lantern(cu - 4, cv + 4);
  r.lantern(cu + 4, cv - 4);
}

/** Sala del mapa: un gran mapa de lana en el suelo (bosque, agua y claros) y la mesa de cartografía. */
function mapRoom(r: RoomDraw): void {
  const cu = r.W >> 1, cv = r.D >> 1;
  const seed = r.room.seed;
  r.fill(2, 2, r.W - 3, r.D - 3, 0, (u, v) => {
    const n = Math.sin(u * 0.9 + seed) + Math.cos(v * 0.7 + seed * 0.3) + Math.sin((u + v) * 0.4);
    return n > 1.1 ? WOOL.blue : n > 0.2 ? WOOL.green : n > -0.8 ? WOOL.lime : WOOL.brown;
  });
  r.set(cu, r.D - 1, 1, CARTOGRAPHY_TABLE);
  r.set(cu - 1, r.D - 1, 1, BOOKSHELF);
  r.set(cu + 1, r.D - 1, 1, BOOKSHELF);
  r.chest(r.W - 1, cv, 3, 0.8);
  r.lantern(cu - 3, cv);
  r.lantern(cu + 3, cv);
}

/** Tablero de ajedrez de lana con piezas de calabaza y farol de calabaza. */
function chess(r: RoomDraw): void {
  const u0 = (r.W >> 1) - 4, v0 = (r.D >> 1) - 3;
  r.fill(u0, v0, u0 + 7, v0 + 7, 0, (u, v) => ((u + v) % 2 ? WOOL.black : WOOL.white));
  for (let u = u0; u <= u0 + 7; u++) {
    for (const [v, row] of [[v0, 0], [v0 + 7, 1]] as const) if (r.rnd() < 0.8) r.set(u, v, 1, row ? PUMPKIN : stateOf(JACK_O_LANTERN, { facing: r.face(0) }));
  }
  r.lantern(r.W >> 1, r.D >> 1);
}

/** Jardín interior: hierba, un árbol pequeño de roble oscuro y flores. */
function garden(r: RoomDraw): void {
  const cu = r.W >> 1, cv = r.D >> 1;
  r.fill(2, 2, r.W - 3, r.D - 3, 0, GRASS);
  for (let dy = 1; dy <= 4; dy++) r.set(cu, cv, dy, DARK_OAK_LOG);
  for (let du = -2; du <= 2; du++) {
    for (let dv = -2; dv <= 2; dv++) {
      for (let dy = 4; dy <= 5; dy++) if (Math.abs(du) + Math.abs(dv) <= (dy === 4 ? 3 : 2) && (du || dv || dy === 5)) r.set(cu + du, cv + dv, dy, DARK_OAK_LEAVES);
    }
  }
  for (let k = 0; k < 10; k++) {
    const u = 2 + Math.floor(r.rnd() * (r.W - 4)), v = 2 + Math.floor(r.rnd() * (r.D - 4));
    if (Math.abs(u - cu) + Math.abs(v - cv) > 1) r.set(u, v, 1, [POPPY, DANDELION, CORNFLOWER, FLOWERS.allium, FLOWERS.azure_bluet][k % 5]);
  }
  r.perimeter((u, v) => {
    if ((u + v) % 4 === 0) r.set(u, v, 1, r.pot());
  });
}

/** Estatua de una cabeza de illager hecha de lana, sobre un pedestal. */
function statue(r: RoomDraw): void {
  const cu = r.W >> 1, cv = (r.D >> 1) + 1;
  r.fill(cu - 3, cv - 3, cu + 3, cv + 3, 1, (u, v) => (Math.max(Math.abs(u - cu), Math.abs(v - cv)) === 3 ? stateOf(SLABS.cobblestone, { type: 0 }) : COBBLESTONE));
  // Cabeza de 5×5×5: piel gris, ceja oscura, ojos verdes y nariz; mira hacia la puerta.
  for (let dy = 2; dy <= 6; dy++) {
    for (let du = -2; du <= 2; du++) {
      for (let dv = -2; dv <= 2; dv++) {
        let id = WOOL.light_gray;
        if (dv === -2) {
          if (dy === 5) id = WOOL.gray;
          else if (dy === 4 && Math.abs(du) === 1) id = WOOL.green;
          else if (dy === 4 && Math.abs(du) === 2) id = WOOL.white;
          else if (dy === 2 && Math.abs(du) <= 1) id = WOOL.gray;
        }
        if (dy === 6 && Math.max(Math.abs(du), Math.abs(dv)) === 2) continue;
        r.set(cu + du, cv + dv, dy, id);
      }
    }
  }
  r.set(cu, cv - 3, 3, WOOL.light_gray);
  r.set(cu, cv - 3, 4, WOOL.light_gray);
  r.lantern(1, 1);
  r.lantern(r.W - 2, 1);
  r.lantern(1, r.D - 2);
  r.lantern(r.W - 2, r.D - 2);
}

function atticStorage(r: RoomDraw): void {
  r.perimeter((u, v) => {
    const k = r.rnd();
    if (k < 0.3) r.set(u, v, 1, BARREL);
    else if (k < 0.45) r.set(u, v, 1, HAY_BALE);
    else if (k < 0.55) r.set(u, v, 1, PUMPKIN);
    if (r.rnd() < 0.15) r.set(u, v, FH - 1, COBWEB);
  });
  r.chest(1, r.D - 1, 2, 0.7);
  if (r.W * r.D > 60) r.chest(r.W - 2, r.D - 1, 2, 0.7);
  r.lantern(r.W >> 1, r.D >> 1);
}
