// Fase 8.6 (el End): la fortaleza, portada de StrongholdPieces y StrongholdStructure de la 26.3.
// - Dónde: 128 fortalezas en anillos concéntricos alrededor del origen (ConcentricRingsStructurePlacement:
//   distancia 32, reparto 3): el primer anillo a unos 128 chunks con tres, el segundo con seis más lejos… cada una
//   con su ángulo y su distancia al azar, y movida a un bioma de tierra a menos de 112 bloques si lo hay.
// - Piezas: empieza en una escalera de caracol (en el bloque 2,2 del chunk) que obliga a que la siguiente sea un
//   cruce de cinco; luego cada pieza pide hijas por sus puertas eligiendo por pesos entre las que quedan (pasillos,
//   giros, celdas, salas de cruce, escaleras, pasillos con cofre, bibliotecas a partir de 5 de hondura y la sala
//   del portal a partir de 6; con topes por tipo, sin repetir la última y sin chocar), a menos de 112 bloques del
//   inicio y a 50 de hondura; lo que no cabe se remata con un tramo de pasillo corto. Sin sala del portal se
//   vuelve a empezar. Al final se entierra entera por debajo del nivel del mar.
// - Dibujo: las paredes son ladrillos de piedra (a veces agrietados, musgosos o infestados) que no rellenan las
//   cuevas que las cruzan; las puertas son huecos, de madera, de rejas o de hierro con botones. En la sala del
//   portal, el generador de lepismas y los doce marcos (cada uno con un 10 % de llevar ya su ojo; con los doce, el
//   portal ya abierto).
//
// Las piezas se calculan una vez por fortaleza (con su propio azar) y cada chunk dibuja sólo lo que le toca; el
// azar del dibujo (qué ladrillo, qué antorcha, qué telaraña) va por posición para que casen los bordes de chunk.
import {
  AIR, WATER, LAVA, STONE_BRICKS, MOSSY_STONE_BRICKS, CRACKED_STONE_BRICKS, INFESTED_STONE_BRICKS, COBBLESTONE, OAK_PLANKS,
  BOOKSHELF, TORCH, WALL_TORCH, LADDER, COBWEB, IRON_BARS, IRON_DOOR, DOORS, BUTTONS, SLABS, STAIRS, FENCES, MOB_SPAWNER,
  END_PORTAL_FRAME, END_PORTAL, MOUNT_WALL, stateOf,
} from '../blocks';
import { SEA_LEVEL, MIN_Y, hash2, hash3 } from '../constants';
import { mulberry32 } from './noise';
import { Box, FortressRandom, Drawer, orientBox, turn, type OrientedPiece } from './netherFortress';
import { isOceanBiome, baseBiome, BIOME_RIVER, BIOME_FROZEN_RIVER, BIOME_BEACH } from './biomeIds';
import type { Canvas } from './structures';
import type { TerrainGenerator } from './terrain';

const N = 0, E = 1, S = 2, W = 3;

// ------------------------------------------------------------------ piezas

type Kind =
  | 'start' | 'straight' | 'prison_hall' | 'left_turn' | 'right_turn' | 'room_crossing' | 'straight_stairs_down'
  | 'stairs_down' | 'five_crossing' | 'chest_corridor' | 'library' | 'portal_room' | 'filler_corridor';

/** Puertas pequeñas (SmallDoorType): hueco, de madera, de rejas o de hierro con botones. */
const OPENING = 0, WOOD_DOOR = 1, GRATES = 2, IRON = 3;

export interface StrongholdPiece extends OrientedPiece {
  kind: Kind;
  depth: number;
  door: number;
  /** Pasillo recto: salidas a los lados. Cruce de cinco: las cuatro salidas laterales (bajas y altas). */
  left?: boolean;
  right?: boolean;
  leftHigh?: boolean;
  rightHigh?: boolean;
  /** Sala de cruce: su decoración (0 pilar con antorchas, 1 fuente, 2 almacén con cofre; 3 y 4, vacía). */
  type?: number;
  /** Biblioteca de dos plantas. */
  tall?: boolean;
  /** Tramo de relleno: su largo. */
  steps?: number;
  /** Sala del portal: el azar de sus ojos (igual en todos los chunks que la dibujan). */
  seed?: number;
}

interface Weight {
  kind: Kind;
  weight: number;
  max: number;
  placed: number;
  /** Hondura mínima (la biblioteca, > 4; la sala del portal, > 5). */
  minDepth: number;
}
const w = (kind: Kind, weight: number, max: number, minDepth = 0): Weight => ({ kind, weight, max, placed: 0, minDepth });
const WEIGHTS = (): Weight[] => [
  w('straight', 40, 0), w('prison_hall', 5, 5), w('left_turn', 20, 0), w('right_turn', 20, 0), w('room_crossing', 10, 6),
  w('straight_stairs_down', 5, 5), w('stairs_down', 5, 5), w('five_crossing', 5, 4), w('chest_corridor', 5, 4),
  w('library', 10, 2, 5), w('portal_room', 20, 1, 6),
];
/** PieceWeight.doPlace. */
const canPlace = (p: Weight, depth: number) => (p.max === 0 || p.placed < p.max) && depth >= p.minDepth;

/** Medidas (desplazamientos y tamaño de orientBox) de cada tipo. */
const SHAPE: Record<Exclude<Kind, 'start' | 'filler_corridor'>, [number, number, number, number, number, number]> = {
  straight: [-1, -1, 0, 5, 5, 7],
  prison_hall: [-1, -1, 0, 9, 5, 11],
  left_turn: [-1, -1, 0, 5, 5, 5],
  right_turn: [-1, -1, 0, 5, 5, 5],
  room_crossing: [-4, -1, 0, 11, 7, 11],
  straight_stairs_down: [-1, -7, 0, 5, 11, 8],
  stairs_down: [-1, -7, 0, 5, 11, 5],
  five_crossing: [-4, -3, 0, 10, 9, 11],
  chest_corridor: [-1, -1, 0, 5, 5, 7],
  library: [-4, -1, 0, 14, 11, 15],
  portal_room: [-4, -1, 0, 11, 8, 16],
};

interface Gen {
  rng: FortressRandom;
  start: StrongholdPiece;
  list: Weight[];
  total: number;
  previous: Weight | null;
  imposed: Kind | null;
  portalRoom: boolean;
  pending: StrongholdPiece[];
  pieces: StrongholdPiece[];
}

const collision = (g: Gen, b: Box): StrongholdPiece | undefined => g.pieces.find((p) => p.box.intersects(b));
const okBox = (b: Box): boolean => b.y0 > 10;

/** randomSmallDoor: 2 de cada 5 huecos; si no, de madera, de rejas o de hierro. */
function randomDoor(r: FortressRandom): number {
  const s = r.nextInt(5);
  return s === 2 ? WOOD_DOOR : s === 3 ? GRATES : s === 4 ? IRON : OPENING;
}

/** createPiece de cada tipo: la caja si cabe (y > 10, sin chocar); cada pieza tira su azar al crearse. */
function createPiece(g: Gen, kind: Kind, fx: number, fy: number, fz: number, dir: number, depth: number): StrongholdPiece | null {
  if (kind === 'start' || kind === 'filler_corridor') return null;
  const [ox, oy, oz, sw, sh, sd] = SHAPE[kind];
  let box = orientBox(fx, fy, fz, ox, oy, oz, sw, sh, sd, dir);
  if (kind === 'library' && (!okBox(box) || collision(g, box))) box = orientBox(fx, fy, fz, ox, oy, oz, sw, 6, sd, dir);
  if (!okBox(box) || collision(g, box)) return null;
  const r = g.rng;
  const p: StrongholdPiece = { kind, box, dir, depth, door: OPENING };
  if (kind !== 'portal_room') p.door = randomDoor(r);
  if (kind === 'straight') {
    p.left = r.nextInt(2) === 0;
    p.right = r.nextInt(2) === 0;
  } else if (kind === 'room_crossing') p.type = r.nextInt(5);
  else if (kind === 'five_crossing') {
    p.left = r.nextInt(2) === 0;
    p.leftHigh = r.nextInt(2) === 0;
    p.right = r.nextInt(2) === 0;
    p.rightHigh = r.nextInt(3) > 0;
  } else if (kind === 'library') p.tall = box.y1 - box.y0 + 1 > 6;
  else if (kind === 'portal_room') p.seed = r.nextInt();
  return p;
}

/** FillerCorridor.findPieceBox: si lo que choca empieza a la misma altura, un tramo corto hasta tocarlo. */
function fillerBox(g: Gen, fx: number, fy: number, fz: number, dir: number): Box | null {
  let box = orientBox(fx, fy, fz, -1, -1, 0, 5, 5, 4, dir);
  const hit = collision(g, box);
  if (!hit) return null;
  if (hit.box.y0 === box.y0) {
    for (let d = 2; d >= 1; d--) {
      box = orientBox(fx, fy, fz, -1, -1, 0, 5, 5, d, dir);
      if (!hit.box.intersects(box)) return orientBox(fx, fy, fz, -1, -1, 0, 5, 5, d + 1, dir);
    }
  }
  return null;
}

/** updatePieceWeight: el peso total y si queda algún tipo con tope sin agotar. */
function updateWeights(g: Gen): boolean {
  let any = false;
  g.total = 0;
  for (const p of g.list) {
    if (p.max > 0 && p.placed < p.max) any = true;
    g.total += p.weight;
  }
  return any;
}

/** generatePieceFromSmallDoor. */
function generatePiece(g: Gen, fx: number, fy: number, fz: number, dir: number, depth: number): StrongholdPiece | null {
  if (!updateWeights(g)) return null;
  if (g.imposed) {
    const p = createPiece(g, g.imposed, fx, fy, fz, dir, depth);
    g.imposed = null;
    if (p) return p;
  }
  for (let attempts = 0; attempts < 5; attempts++) {
    let sel = g.rng.nextInt(g.total);
    for (const p of g.list) {
      sel -= p.weight;
      if (sel < 0) {
        if (!canPlace(p, depth) || p === g.previous) break;
        const piece = createPiece(g, p.kind, fx, fy, fz, dir, depth);
        if (piece) {
          p.placed++;
          g.previous = p;
          if (p.max !== 0 && p.placed >= p.max) g.list.splice(g.list.indexOf(p), 1);
          return piece;
        }
      }
    }
  }
  const box = fillerBox(g, fx, fy, fz, dir);
  if (!box || box.y0 <= 1) return null;
  return { kind: 'filler_corridor', box, dir, depth, door: OPENING, steps: dir === N || dir === S ? box.z1 - box.z0 + 1 : box.x1 - box.x0 + 1 };
}

/** generateAndAddPiece: a 50 de hondura como mucho y a menos de 112 bloques del inicio. */
function addPiece(g: Gen, fx: number, fy: number, fz: number, dir: number, depth: number): void {
  if (depth > 50) return;
  if (Math.abs(fx - g.start.box.x0) > 112 || Math.abs(fz - g.start.box.z0) > 112) return;
  const p = generatePiece(g, fx, fy, fz, dir, depth + 1);
  if (p) {
    g.pieces.push(p);
    g.pending.push(p);
  }
}

function forward(g: Gen, p: StrongholdPiece, xOff: number, yOff: number): void {
  const b = p.box;
  switch (p.dir) {
    case N: return addPiece(g, b.x0 + xOff, b.y0 + yOff, b.z0 - 1, p.dir, p.depth);
    case S: return addPiece(g, b.x0 + xOff, b.y0 + yOff, b.z1 + 1, p.dir, p.depth);
    case W: return addPiece(g, b.x0 - 1, b.y0 + yOff, b.z0 + xOff, p.dir, p.depth);
    case E: return addPiece(g, b.x1 + 1, b.y0 + yOff, b.z0 + xOff, p.dir, p.depth);
  }
}
function left(g: Gen, p: StrongholdPiece, yOff: number, zOff: number): void {
  const b = p.box;
  if (p.dir === N || p.dir === S) addPiece(g, b.x0 - 1, b.y0 + yOff, b.z0 + zOff, W, p.depth);
  else addPiece(g, b.x0 + zOff, b.y0 + yOff, b.z0 - 1, N, p.depth);
}
function right(g: Gen, p: StrongholdPiece, yOff: number, zOff: number): void {
  const b = p.box;
  if (p.dir === N || p.dir === S) addPiece(g, b.x1 + 1, b.y0 + yOff, b.z0 + zOff, E, p.depth);
  else addPiece(g, b.x0 + zOff, b.y0 + yOff, b.z1 + 1, S, p.depth);
}

/** addChildren de cada tipo. */
function addChildren(g: Gen, p: StrongholdPiece): void {
  switch (p.kind) {
    case 'start':
      g.imposed = 'five_crossing';
      return forward(g, p, 1, 1);
    case 'straight':
      forward(g, p, 1, 1);
      if (p.left) left(g, p, 1, 2);
      if (p.right) right(g, p, 1, 2);
      return;
    case 'prison_hall':
    case 'chest_corridor':
    case 'straight_stairs_down':
    case 'stairs_down':
      return forward(g, p, 1, 1);
    // Los giros miran al revés en las piezas reflejadas (sur y oeste).
    case 'left_turn':
      return p.dir !== N && p.dir !== E ? right(g, p, 1, 1) : left(g, p, 1, 1);
    case 'right_turn':
      return p.dir !== N && p.dir !== E ? left(g, p, 1, 1) : right(g, p, 1, 1);
    case 'room_crossing':
      forward(g, p, 4, 1);
      left(g, p, 1, 4);
      right(g, p, 1, 4);
      return;
    case 'five_crossing': {
      let a = 3, b = 5;
      if (p.dir === W || p.dir === N) {
        a = 8 - a;
        b = 8 - b;
      }
      forward(g, p, 5, 1);
      if (p.left) left(g, p, 1, a);
      if (p.leftHigh) left(g, p, 7, b);
      if (p.right) right(g, p, 1, a);
      if (p.rightHigh) right(g, p, 7, b);
      return;
    }
    case 'portal_room':
      g.portalRoom = true;
      return;
  }
}

/**
 * Piezas de la fortaleza que empieza en el chunk (cx, cz) (StrongholdStructure.generatePieces): lo intenta con
 * semillas sucesivas hasta que sale una con sala del portal y la entierra (moveBelowSeaLevel, 10 por debajo).
 */
export function strongholdPieces(seed: number, cx: number, cz: number): StrongholdPiece[] {
  for (let tries = 0; ; tries++) {
    const rng = new FortressRandom(hash2(tries, 0x57, seed));
    const dir = [N, E, S, W][rng.nextInt(4)];
    const x = cx * 16 + 2, z = cz * 16 + 2;
    const box = new Box(x, 64, z, x + 4, 74, z + 4);
    const start: StrongholdPiece = { kind: 'start', box, dir, depth: 0, door: OPENING };
    const g: Gen = { rng, start, list: WEIGHTS(), total: 0, previous: null, imposed: null, portalRoom: false, pending: [], pieces: [start] };
    addChildren(g, start);
    while (g.pending.length > 0) addChildren(g, g.pending.splice(rng.nextInt(g.pending.length), 1)[0]);
    if (!g.portalRoom && tries < 40) continue;
    const b = strongholdBounds(g.pieces);
    const maxY = SEA_LEVEL - 10;
    let top = b.y1 - b.y0 + 1 + MIN_Y + 1;
    if (top < maxY) top += rng.nextInt(maxY - top);
    const dy = top - b.y1;
    for (const p of g.pieces) {
      p.box.y0 += dy;
      p.box.y1 += dy;
    }
    return g.pieces;
  }
}

/** Caja que envuelve todas las piezas. */
export function strongholdBounds(pieces: readonly StrongholdPiece[]): Box {
  const b = new Box(1e9, 1e9, 1e9, -1e9, -1e9, -1e9);
  for (const p of pieces) {
    b.x0 = Math.min(b.x0, p.box.x0);
    b.y0 = Math.min(b.y0, p.box.y0);
    b.z0 = Math.min(b.z0, p.box.z0);
    b.x1 = Math.max(b.x1, p.box.x1);
    b.y1 = Math.max(b.y1, p.box.y1);
    b.z1 = Math.max(b.z1, p.box.z1);
  }
  return b;
}

// ------------------------------------------------------------------ dibujo

/** El dibujante de la fortaleza: el de las piezas orientadas más el azar por posición y las puertas. */
class StrongholdDrawer extends Drawer {
  constructor(c: Canvas, p: StrongholdPiece, ticks: number[], private readonly seed: number) {
    super(c, p, ticks);
  }
  /** Azar en [0, 1) de la posición local (x, y, z) (el mismo en todos los chunks). */
  rnd(x: number, y: number, z: number, salt: number): number {
    return hash3(this.wx(x, z), this.wy(y), this.wz(x, z), this.seed ^ salt) / 4294967296;
  }
  /** generateBox con SMOOTH_STONE_SELECTOR: el borde de ladrillos variados y el interior de aire; con `skipAir` no
   *  toca lo que ya es aire (las cuevas que la cruzan). */
  stone(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, skipAir: boolean): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (skipAir && this.c.get(this.wx(x, z), this.wy(y), this.wz(x, z)) === AIR) continue;
          const edge = y === y0 || y === y1 || x === x0 || x === x1 || z === z0 || z === z1;
          let id = AIR;
          if (edge) {
            const f = this.rnd(x, y, z, 0x5e1);
            id = f < 0.2 ? CRACKED_STONE_BRICKS : f < 0.5 ? MOSSY_STONE_BRICKS : f < 0.55 ? INFESTED_STONE_BRICKS : STONE_BRICKS;
          }
          this.place(id, x, y, z);
        }
      }
    }
  }
  /** maybeGenerateBlock. */
  maybe(chance: number, id: number, x: number, y: number, z: number): void {
    if (this.rnd(x, y, z, 0x3a7) < chance) this.place(id, x, y, z);
  }
  /** generateMaybeBox (sin respetar el aire). */
  maybeBox(chance: number, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.maybe(chance, id, x, y, z);
  }
  /** Bloque con orientación (dirección de Java, girada con la pieza). */
  facing(block: number, facing: number, extra: Record<string, number> = {}): number {
    return stateOf(block, { facing: turn(this.p.dir, facing), ...extra });
  }
  torch(facing: number): number {
    return this.facing(WALL_TORCH, facing);
  }
  /** generateSmallDoor en (x, y, z): la puerta de 3 × 3 de la pared de delante. */
  door(type: number, x: number, y: number, z: number): void {
    const SB = STONE_BRICKS;
    if (type === OPENING) {
      this.box(x, y, z, x + 2, y + 2, z, AIR);
      return;
    }
    if (type === GRATES) {
      this.place(AIR, x + 1, y, z);
      this.place(AIR, x + 1, y + 1, z);
      for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]]) this.place(IRON_BARS, x + dx, y + dy, z);
      return;
    }
    for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2], [2, 1], [2, 0]]) this.place(SB, x + dx, y + dy, z);
    const door = type === WOOD_DOOR ? DOORS.oak : IRON_DOOR;
    this.place(this.facing(door, N, { half: 0, open: 0, hinge: 0 }), x + 1, y, z);
    this.place(this.facing(door, N, { half: 1, open: 0, hinge: 0 }), x + 1, y + 1, z);
    if (type === IRON) {
      this.place(this.facing(BUTTONS.stone, N, { mount: MOUNT_WALL, powered: 0 }), x + 2, y + 1, z + 1);
      this.place(this.facing(BUTTONS.stone, S, { mount: MOUNT_WALL, powered: 0 }), x + 2, y + 1, z - 1);
    }
  }
}

const SB = STONE_BRICKS;
const BRICK_SLAB = () => stateOf(SLABS.stone_brick, { type: 0 });
const SMOOTH_SLAB = () => stateOf(SLABS.smooth_stone, { type: 0 });

function drawStraight(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 4, 4, 6, true);
  d.door(p.door, 1, 1, 0);
  d.door(OPENING, 1, 1, 6);
  d.maybe(0.1, d.torch(E), 1, 2, 1);
  d.maybe(0.1, d.torch(W), 3, 2, 1);
  d.maybe(0.1, d.torch(E), 1, 2, 5);
  d.maybe(0.1, d.torch(W), 3, 2, 5);
  if (p.left) d.box(0, 1, 2, 0, 3, 4, AIR);
  if (p.right) d.box(4, 1, 2, 4, 3, 4, AIR);
}

function drawChestCorridor(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 4, 4, 6, true);
  d.door(p.door, 1, 1, 0);
  d.door(OPENING, 1, 1, 6);
  d.box(3, 1, 2, 3, 1, 4, SB);
  d.place(BRICK_SLAB(), 3, 1, 1);
  d.place(BRICK_SLAB(), 3, 1, 5);
  d.place(BRICK_SLAB(), 3, 2, 2);
  d.place(BRICK_SLAB(), 3, 2, 4);
  for (let z = 2; z <= 4; z++) d.place(BRICK_SLAB(), 2, 1, z);
  d.chest(3, 2, 3, 'stronghold_corridor');
}

function drawTurn(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 4, 4, 4, true);
  d.door(p.door, 1, 1, 0);
  const mirrored = p.dir !== N && p.dir !== E;
  const toRight = (p.kind === 'left_turn') === mirrored;
  if (toRight) d.box(4, 1, 1, 4, 3, 3, AIR);
  else d.box(0, 1, 1, 0, 3, 3, AIR);
}

function drawStairsDown(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 4, 10, 4, true);
  d.door(p.door, 1, 7, 0);
  d.door(OPENING, 1, 1, 4);
  const slab = SMOOTH_SLAB();
  d.place(SB, 2, 6, 1);
  d.place(SB, 1, 5, 1);
  d.place(slab, 1, 6, 1);
  d.place(SB, 1, 5, 2);
  d.place(SB, 1, 4, 3);
  d.place(slab, 1, 5, 3);
  d.place(SB, 2, 4, 3);
  d.place(SB, 3, 3, 3);
  d.place(slab, 3, 4, 3);
  d.place(SB, 3, 3, 2);
  d.place(SB, 3, 2, 1);
  d.place(slab, 3, 3, 1);
  d.place(SB, 2, 2, 1);
  d.place(SB, 1, 1, 1);
  d.place(slab, 1, 2, 1);
  d.place(SB, 1, 1, 2);
  d.place(slab, 1, 1, 3);
}

function drawStraightStairsDown(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 4, 10, 7, true);
  d.door(p.door, 1, 7, 0);
  d.door(OPENING, 1, 1, 7);
  const stairs = d.facing(STAIRS.cobblestone, S, { half: 0 });
  for (let i = 0; i < 6; i++) {
    for (let x = 1; x <= 3; x++) {
      d.place(stairs, x, 6 - i, 1 + i);
      if (i < 5) d.place(SB, x, 5 - i, 1 + i);
    }
  }
}

function drawPrisonHall(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 8, 4, 10, true);
  d.door(p.door, 1, 1, 0);
  d.box(1, 1, 10, 3, 3, 10, AIR);
  d.stone(4, 1, 1, 4, 3, 1, false);
  d.stone(4, 1, 3, 4, 3, 3, false);
  d.stone(4, 1, 7, 4, 3, 7, false);
  d.stone(4, 1, 9, 4, 3, 9, false);
  for (let y = 1; y <= 3; y++) {
    d.place(IRON_BARS, 4, y, 4);
    d.place(IRON_BARS, 4, y, 5);
    d.place(IRON_BARS, 4, y, 6);
    d.place(IRON_BARS, 5, y, 5);
    d.place(IRON_BARS, 6, y, 5);
    d.place(IRON_BARS, 7, y, 5);
  }
  d.place(IRON_BARS, 4, 3, 2);
  d.place(IRON_BARS, 4, 3, 8);
  d.place(d.facing(IRON_DOOR, W, { half: 0, open: 0, hinge: 0 }), 4, 1, 2);
  d.place(d.facing(IRON_DOOR, W, { half: 1, open: 0, hinge: 0 }), 4, 2, 2);
  d.place(d.facing(IRON_DOOR, W, { half: 0, open: 0, hinge: 0 }), 4, 1, 8);
  d.place(d.facing(IRON_DOOR, W, { half: 1, open: 0, hinge: 0 }), 4, 2, 8);
}

function drawRoomCrossing(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 10, 6, 10, true);
  d.door(p.door, 4, 1, 0);
  d.box(4, 1, 10, 6, 3, 10, AIR);
  d.box(0, 1, 4, 0, 3, 6, AIR);
  d.box(10, 1, 4, 10, 3, 6, AIR);
  const slab = SMOOTH_SLAB();
  switch (p.type) {
    case 0:
      // El pilar del centro con una antorcha a cada lado y losas alrededor del pie.
      d.box(5, 1, 5, 5, 3, 5, SB);
      d.place(d.torch(W), 4, 3, 5);
      d.place(d.torch(E), 6, 3, 5);
      d.place(d.torch(S), 5, 3, 4);
      d.place(d.torch(N), 5, 3, 6);
      for (const [x, z] of [[4, 4], [4, 5], [4, 6], [6, 4], [6, 5], [6, 6], [5, 4], [5, 6]]) d.place(slab, x, 1, z);
      break;
    case 1:
      // La fuente: el pretil de ladrillo y el caño de agua que cae del pilar.
      for (let i = 0; i < 5; i++) {
        d.place(SB, 3, 1, 3 + i);
        d.place(SB, 7, 1, 3 + i);
        d.place(SB, 3 + i, 1, 3);
        d.place(SB, 3 + i, 1, 7);
      }
      d.box(5, 1, 5, 5, 3, 5, SB);
      d.place(WATER, 5, 4, 5);
      break;
    case 2: {
      // El almacén: la galería de tablones con su escalera de mano, el cofre arriba y el pilar de roca.
      for (let z = 1; z <= 9; z++) {
        d.place(COBBLESTONE, 1, 3, z);
        d.place(COBBLESTONE, 9, 3, z);
      }
      for (let x = 1; x <= 9; x++) {
        d.place(COBBLESTONE, x, 3, 1);
        d.place(COBBLESTONE, x, 3, 9);
      }
      for (const [x, y, z] of [[5, 1, 4], [5, 1, 6], [5, 3, 4], [5, 3, 6], [4, 1, 5], [6, 1, 5], [4, 3, 5], [6, 3, 5]]) d.place(COBBLESTONE, x, y, z);
      for (let y = 1; y <= 3; y++) {
        d.place(COBBLESTONE, 4, y, 4);
        d.place(COBBLESTONE, 6, y, 4);
        d.place(COBBLESTONE, 4, y, 6);
        d.place(COBBLESTONE, 6, y, 6);
      }
      d.place(d.torch(N), 5, 3, 5);
      for (let z = 2; z <= 8; z++) {
        d.place(OAK_PLANKS, 2, 3, z);
        d.place(OAK_PLANKS, 3, 3, z);
        if (z <= 3 || z >= 7) {
          d.place(OAK_PLANKS, 4, 3, z);
          d.place(OAK_PLANKS, 5, 3, z);
          d.place(OAK_PLANKS, 6, 3, z);
        }
        d.place(OAK_PLANKS, 7, 3, z);
        d.place(OAK_PLANKS, 8, 3, z);
      }
      const ladder = d.facing(LADDER, W);
      for (let y = 1; y <= 3; y++) d.place(ladder, 9, y, 3);
      d.chest(3, 4, 8, 'stronghold_crossing');
      break;
    }
  }
}

function drawFiveCrossing(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 9, 8, 10, true);
  d.door(p.door, 4, 3, 0);
  if (p.left) d.box(0, 3, 1, 0, 5, 3, AIR);
  if (p.right) d.box(9, 3, 1, 9, 5, 3, AIR);
  if (p.leftHigh) d.box(0, 5, 7, 0, 7, 9, AIR);
  if (p.rightHigh) d.box(9, 5, 7, 9, 7, 9, AIR);
  d.box(5, 1, 10, 7, 3, 10, AIR);
  d.stone(1, 2, 1, 8, 2, 6, false);
  d.stone(4, 1, 5, 4, 4, 9, false);
  d.stone(8, 1, 5, 8, 4, 9, false);
  d.stone(1, 4, 7, 3, 4, 9, false);
  d.stone(1, 3, 5, 3, 3, 6, false);
  const slab = SMOOTH_SLAB();
  d.box(1, 3, 4, 3, 3, 4, slab);
  d.box(1, 4, 6, 3, 4, 6, slab);
  d.stone(5, 1, 7, 7, 1, 8, false);
  d.box(5, 1, 9, 7, 1, 9, slab);
  d.box(5, 2, 7, 7, 2, 7, slab);
  d.box(4, 5, 7, 4, 5, 9, slab);
  d.box(8, 5, 7, 8, 5, 9, slab);
  d.box(5, 5, 7, 7, 5, 9, stateOf(SLABS.smooth_stone, { type: 2 }));
  d.place(d.torch(S), 6, 5, 6);
}

function drawLibrary(d: StrongholdDrawer, p: StrongholdPiece): void {
  const height = p.tall ? 11 : 6;
  d.stone(0, 0, 0, 13, height - 1, 14, true);
  d.door(p.door, 4, 1, 0);
  d.maybeBox(0.07, 2, 1, 1, 11, 4, 13, COBWEB);
  for (let z = 1; z <= 13; z++) {
    const shelf = (z - 1) % 4 === 0 ? OAK_PLANKS : BOOKSHELF;
    d.box(1, 1, z, 1, 4, z, shelf);
    d.box(12, 1, z, 12, 4, z, shelf);
    if (shelf === OAK_PLANKS) {
      d.place(d.torch(E), 2, 3, z);
      d.place(d.torch(W), 11, 3, z);
    }
    if (p.tall) {
      d.box(1, 6, z, 1, 9, z, shelf);
      d.box(12, 6, z, 12, 9, z, shelf);
    }
  }
  for (let z = 3; z < 12; z += 2) {
    d.box(3, 1, z, 4, 3, z, BOOKSHELF);
    d.box(6, 1, z, 7, 3, z, BOOKSHELF);
    d.box(9, 1, z, 10, 3, z, BOOKSHELF);
  }
  if (p.tall) {
    // La galería de arriba: suelo de tablones alrededor, barandillas, la escalera de mano y la lámpara del centro.
    d.box(1, 5, 1, 3, 5, 13, OAK_PLANKS);
    d.box(10, 5, 1, 12, 5, 13, OAK_PLANKS);
    d.box(4, 5, 1, 9, 5, 2, OAK_PLANKS);
    d.box(4, 5, 12, 9, 5, 13, OAK_PLANKS);
    d.place(OAK_PLANKS, 9, 5, 11);
    d.place(OAK_PLANKS, 8, 5, 11);
    d.place(OAK_PLANKS, 9, 5, 10);
    const fence = FENCES.oak;
    d.box(3, 6, 3, 3, 6, 11, fence);
    d.box(10, 6, 3, 10, 6, 9, fence);
    d.box(4, 6, 2, 9, 6, 2, fence);
    d.box(4, 6, 12, 7, 6, 12, fence);
    d.place(fence, 3, 6, 2);
    d.place(fence, 3, 6, 12);
    d.place(fence, 10, 6, 2);
    for (let i = 0; i <= 2; i++) {
      d.place(fence, 8 + i, 6, 12 - i);
      if (i !== 2) d.place(fence, 8 + i, 6, 11 - i);
    }
    const ladder = d.facing(LADDER, S);
    for (let y = 1; y <= 7; y++) d.place(ladder, 10, y, 13);
    for (const [x, y, z] of [[6, 9, 7], [7, 9, 7], [6, 8, 7], [7, 8, 7], [6, 7, 7], [7, 7, 7], [5, 7, 7], [8, 7, 7], [6, 7, 6], [6, 7, 8], [7, 7, 6], [7, 7, 8]]) {
      d.place(fence, x, y, z);
    }
    for (const [x, y, z] of [[5, 8, 7], [8, 8, 7], [6, 8, 6], [6, 8, 8], [7, 8, 6], [7, 8, 8]]) d.place(TORCH, x, y, z);
  }
  d.chest(3, 3, 5, 'stronghold_library');
  if (p.tall) {
    d.place(AIR, 12, 9, 1);
    d.chest(12, 8, 1, 'stronghold_library');
  }
}

function drawPortalRoom(d: StrongholdDrawer, p: StrongholdPiece): void {
  d.stone(0, 0, 0, 10, 7, 15, false);
  d.door(GRATES, 4, 1, 0);
  d.stone(1, 6, 1, 1, 6, 14, false);
  d.stone(9, 6, 1, 9, 6, 14, false);
  d.stone(2, 6, 1, 8, 6, 2, false);
  d.stone(2, 6, 14, 8, 6, 14, false);
  d.stone(1, 1, 1, 2, 1, 4, false);
  d.stone(8, 1, 1, 9, 1, 4, false);
  d.box(1, 1, 1, 1, 1, 3, LAVA);
  d.box(9, 1, 1, 9, 1, 3, LAVA);
  d.stone(3, 1, 8, 7, 1, 12, false);
  d.box(4, 1, 9, 6, 1, 11, LAVA);
  for (let z = 3; z < 14; z += 2) {
    d.box(0, 3, z, 0, 4, z, IRON_BARS);
    d.box(10, 3, z, 10, 4, z, IRON_BARS);
  }
  for (let x = 2; x < 9; x += 2) d.box(x, 3, 15, x, 4, 15, IRON_BARS);
  const stairs = d.facing(STAIRS.stone_brick, N, { half: 0 });
  d.stone(4, 1, 5, 6, 1, 7, false);
  d.stone(4, 2, 6, 6, 2, 7, false);
  d.stone(4, 3, 7, 6, 3, 7, false);
  for (let x = 4; x <= 6; x++) {
    d.place(stairs, x, 1, 4);
    d.place(stairs, x, 2, 5);
    d.place(stairs, x, 3, 6);
  }
  // Los doce marcos (mirando hacia dentro), cada uno con un 10 % de llevar ya el ojo.
  const r = new FortressRandom(p.seed ?? 0);
  const eyes: number[] = [];
  let all = true;
  for (let i = 0; i < 12; i++) {
    eyes.push(r.nextFloat() > 0.9 ? 1 : 0);
    all &&= eyes[i] === 1;
  }
  const frame = (f: number, i: number) => d.facing(END_PORTAL_FRAME, f, { eye: eyes[i] });
  for (let i = 0; i < 3; i++) {
    d.place(frame(N, i), 4 + i, 3, 8);
    d.place(frame(S, 3 + i), 4 + i, 3, 12);
    d.place(frame(E, 6 + i), 3, 3, 9 + i);
    d.place(frame(W, 9 + i), 7, 3, 9 + i);
  }
  if (all) d.box(4, 3, 9, 6, 3, 11, END_PORTAL);
  d.place(MOB_SPAWNER, 5, 3, 6);
}

function drawFiller(d: StrongholdDrawer, p: StrongholdPiece): void {
  for (let i = 0; i < (p.steps ?? 0); i++) {
    d.box(0, 0, i, 4, 0, i, SB);
    for (let y = 1; y <= 3; y++) {
      d.place(SB, 0, y, i);
      d.box(1, y, i, 3, y, i, AIR);
      d.place(SB, 4, y, i);
    }
    d.box(0, 4, i, 4, 4, i, SB);
  }
}

/** Dibuja en el lienzo (un chunk) la parte de cada pieza que le toca; los fluidos que pone, a `ticks`. */
export function drawStronghold(c: Canvas, pieces: readonly StrongholdPiece[], ticks: number[], seed: number): void {
  const x0 = c.x0, z0 = c.z0;
  for (const p of pieces) {
    const b = p.box;
    if (b.x1 < x0 || b.x0 > x0 + 15 || b.z1 < z0 || b.z0 > z0 + 15) continue;
    const d = new StrongholdDrawer(c, p, ticks, seed);
    switch (p.kind) {
      case 'start':
      case 'stairs_down': drawStairsDown(d, p); break;
      case 'straight': drawStraight(d, p); break;
      case 'chest_corridor': drawChestCorridor(d, p); break;
      case 'left_turn':
      case 'right_turn': drawTurn(d, p); break;
      case 'straight_stairs_down': drawStraightStairsDown(d, p); break;
      case 'prison_hall': drawPrisonHall(d, p); break;
      case 'room_crossing': drawRoomCrossing(d, p); break;
      case 'five_crossing': drawFiveCrossing(d, p); break;
      case 'library': drawLibrary(d, p); break;
      case 'portal_room': drawPortalRoom(d, p); break;
      case 'filler_corridor': drawFiller(d, p); break;
    }
  }
}

// ------------------------------------------------------------------ colocación

/** ConcentricRingsStructurePlacement de las fortalezas (structure_set strongholds). */
export const STRONGHOLD_RINGS = { distance: 32, spread: 3, count: 128 };

interface RingStart {
  /** Chunk de partida (sin mover al bioma) y el azar de la búsqueda de bioma. */
  cx: number;
  cz: number;
  search: number;
}

const ringCache = new Map<number, RingStart[]>();

/** Las 128 posiciones de partida (generateRingPositions), antes de buscarles bioma. */
function ringStarts(seed: number): RingStart[] {
  const hit = ringCache.get(seed);
  if (hit) return hit;
  const { distance, count } = STRONGHOLD_RINGS;
  let spread = STRONGHOLD_RINGS.spread;
  const r = mulberry32(hash2(seed, 0x57a0, 0x3e4d));
  let angle = r() * Math.PI * 2;
  let inCircle = 0, circle = 0;
  const out: RingStart[] = [];
  for (let i = 0; i < count; i++) {
    const dist = 4 * distance + distance * circle * 6 + (r() - 0.5) * (distance * 2.5);
    out.push({ cx: Math.round(Math.cos(angle) * dist), cz: Math.round(Math.sin(angle) * dist), search: (r() * 4294967296) >>> 0 });
    angle += (Math.PI * 2) / spread;
    if (++inCircle === spread) {
      circle++;
      inCircle = 0;
      spread += Math.floor((2 * spread) / (circle + 1));
      spread = Math.min(spread, count - i);
      angle += r() * Math.PI * 2;
    }
  }
  if (ringCache.size > 8) ringCache.clear();
  ringCache.set(seed, out);
  return out;
}

/** ¿Es de tierra (stronghold_biased_to)? Todo menos océanos, ríos y playas. */
function landBiome(b: number): boolean {
  return !isOceanBiome(b) && b !== BIOME_RIVER && b !== BIOME_FROZEN_RIVER && baseBiome(b) !== BIOME_BEACH;
}

export interface StrongholdStart {
  cx: number;
  cz: number;
  pieces: StrongholdPiece[];
  bounds: Box;
}

const startCache = new Map<string, StrongholdStart>();

/**
 * La fortaleza `i` del mundo: la partida movida a un bioma de tierra (findBiomeHorizontal: uno al azar entre los
 * que hay a menos de 112 bloques, mirando cada 4 bloques… aquí cada 8) y sus piezas.
 */
function strongholdStart(gen: TerrainGenerator, i: number): StrongholdStart {
  const k = `${gen.seed}:${i}`;
  const hit = startCache.get(k);
  if (hit) return hit;
  const s0 = ringStarts(gen.seed)[i];
  const bx = s0.cx * 16 + 8, bz = s0.cz * 16 + 8;
  const r = mulberry32(s0.search);
  let found: [number, number] | null = null, n = 0;
  for (let dz = -112; dz <= 112; dz += 8) {
    for (let dx = -112; dx <= 112; dx += 8) {
      if (dx * dx + dz * dz > 112 * 112) continue;
      if (!landBiome(gen.biomeAt(bx + dx, bz + dz))) continue;
      // Uno al azar entre los que valen (muestreo de embalse, como findBiomeHorizontal).
      if (Math.floor(r() * ++n) === 0) found = [bx + dx, bz + dz];
    }
  }
  const cx = found ? found[0] >> 4 : s0.cx, cz = found ? found[1] >> 4 : s0.cz;
  const pieces = strongholdPieces(hash2(cx, cz, gen.seed ^ 0x5709), cx, cz);
  const s: StrongholdStart = { cx, cz, pieces, bounds: strongholdBounds(pieces) };
  if (startCache.size > 32) startCache.clear();
  startCache.set(k, s);
  return s;
}

/** Margen (bloques) entre la partida sin mover y cualquier bloque de su fortaleza. */
const REACH = 112 + 112 + 32;

/** Fortalezas cuya caja toca el rectángulo [x0, x1] × [z0, z1]. */
export function strongholdsNear(gen: TerrainGenerator, x0: number, z0: number, x1: number, z1: number): StrongholdStart[] {
  const out: StrongholdStart[] = [];
  const starts = ringStarts(gen.seed);
  for (let i = 0; i < starts.length; i++) {
    const s0 = starts[i];
    const sx = s0.cx * 16, sz = s0.cz * 16;
    if (sx + REACH < x0 || sx - REACH > x1 || sz + REACH < z0 || sz - REACH > z1) continue;
    const s = strongholdStart(gen, i);
    const b = s.bounds;
    if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
    out.push(s);
  }
  return out;
}

/** Dibuja en el chunk del lienzo las fortalezas que lo tocan. */
export function placeStrongholds(gen: TerrainGenerator, c: Canvas, ticks: number[]): void {
  for (const s of strongholdsNear(gen, c.x0, c.z0, c.x0 + 15, c.z0 + 15)) drawStronghold(c, s.pieces, ticks, gen.seed ^ (s.cx * 31 + s.cz));
}

/**
 * La fortaleza más cercana a (x, z): la esquina de su chunk de partida (a donde vuelan los ojos de ender, como
 * findNearestMapStructure) y la altura de la escalera de entrada.
 */
export function locateStronghold(gen: TerrainGenerator, x: number, z: number): [number, number, number] | null {
  const starts = ringStarts(gen.seed);
  // Primero por la partida sin mover (a 112 bloques como mucho de la buena); luego se afinan las más cercanas.
  const order = starts.map((s, i) => [Math.hypot(s.cx * 16 + 8 - x, s.cz * 16 + 8 - z), i]).sort((a, b) => a[0] - b[0]);
  let best: [number, number, number] | null = null, bd = Infinity;
  for (const [d0, i] of order) {
    if (d0 - 160 > bd) break;
    const s = strongholdStart(gen, i);
    const d = Math.hypot(s.cx * 16 - x, s.cz * 16 - z);
    if (d < bd) {
      bd = d;
      best = [s.cx * 16, s.pieces[0].box.y0 + 1, s.cz * 16];
    }
  }
  return best;
}
