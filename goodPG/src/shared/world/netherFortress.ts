// Fase 8.4 (estructuras del Nether): la fortaleza del Nether, portada de NetherFortressPieces de la 26.3.
// Puentes (rectos, cruces y remates rotos) y el castillo (entrada con su pozo de lava, pasillos, giros con cofre,
// escaleras, balcones en T, salas de cruce y de escaleras, el trono con el generador de blazes y la sala de
// cultivo de verrugas). Como en Java: la pieza de inicio es un cruce de puentes y cada pieza pide hijas por sus
// salidas eligiendo por pesos entre las que quedan (con topes por tipo, sin repetir en fila las que no pueden y
// sin chocar con las ya puestas), a menos de 112 bloques del inicio y a 30 de profundidad; luego todo se sube
// o se baja para que quede entre y = 48 y 70. Cada pieza se dibuja en coordenadas propias que se giran y
// reflejan según su orientación, y los pilares bajan hasta dar con algo firme.
//
// Las piezas se calculan una vez por fortaleza (con su propio azar) y cada chunk dibuja sólo lo que le toca.
import { AIR, LAVA, NETHER_BRICKS, NETHER_BRICK_FENCE, STAIRS, SOUL_SAND, MOB_SPAWNER, CHEST, BLOCK_FLUID, BLOCK_OPAQUE, stateOf } from '../blocks';
import { NETHER_WART_CROP } from '../blocks';
import { mulberry32 } from './noise';
import type { Canvas } from './structures';

// ------------------------------------------------------------------ utilidades

/** Direcciones como las nuestras (y las de Java en el plano): 0 norte (−z), 1 este, 2 sur, 3 oeste. */
const N = 0, E = 1, S = 2, W = 3;

/** Azar de una fortaleza (entero en [0, n), flotante y entero de 32 bits como RandomSource). */
export class FortressRandom {
  private r: () => number;
  constructor(seed: number) {
    this.r = mulberry32(seed | 0);
  }
  nextInt(n?: number): number {
    if (n === undefined) return (this.r() * 4294967296) | 0;
    return Math.floor(this.r() * n);
  }
  nextFloat(): number {
    return this.r();
  }
}

export class Box {
  constructor(public x0: number, public y0: number, public z0: number, public x1: number, public y1: number, public z1: number) {}
  intersects(o: Box): boolean {
    return this.x1 >= o.x0 && this.x0 <= o.x1 && this.z1 >= o.z0 && this.z0 <= o.z1 && this.y1 >= o.y0 && this.y0 <= o.y1;
  }
  isInside(x: number, y: number, z: number): boolean {
    return x >= this.x0 && x <= this.x1 && y >= this.y0 && y <= this.y1 && z >= this.z0 && z <= this.z1;
  }
}

/** BoundingBox.orientBox. */
export function orientBox(fx: number, fy: number, fz: number, ox: number, oy: number, oz: number, w: number, h: number, d: number, dir: number): Box {
  switch (dir) {
    case N:
      return new Box(fx + ox, fy + oy, fz - d + 1 + oz, fx + w - 1 + ox, fy + h - 1 + oy, fz + oz);
    case W:
      return new Box(fx - d + 1 + oz, fy + oy, fz + ox, fx + oz, fy + h - 1 + oy, fz + w - 1 + ox);
    case E:
      return new Box(fx + oz, fy + oy, fz + ox, fx + d - 1 + oz, fy + h - 1 + oy, fz + w - 1 + ox);
    default:
      return new Box(fx + ox, fy + oy, fz + oz, fx + w - 1 + ox, fy + h - 1 + oy, fz + d - 1 + oz);
  }
}

// ------------------------------------------------------------------ piezas

type Kind =
  | 'bridge_straight' | 'bridge_crossing' | 'room_crossing' | 'stairs_room' | 'monster_throne' | 'castle_entrance'
  | 'castle_corridor' | 'castle_corridor_crossing' | 'castle_right_turn' | 'castle_left_turn' | 'castle_corridor_stairs'
  | 'castle_t_balcony' | 'castle_stalk_room' | 'bridge_end_filler';

/** Tipo de pieza con su peso, su tope (0: sin tope) y si puede repetirse en fila (PieceWeight). */
interface Weight {
  kind: Kind;
  weight: number;
  max: number;
  inRow: boolean;
  placed: number;
}
const w = (kind: Kind, weight: number, max: number, inRow = false): Weight => ({ kind, weight, max, inRow, placed: 0 });
const BRIDGE_WEIGHTS = (): Weight[] => [
  w('bridge_straight', 30, 0, true), w('bridge_crossing', 10, 4), w('room_crossing', 10, 4), w('stairs_room', 10, 3),
  w('monster_throne', 5, 2), w('castle_entrance', 5, 1),
];
const CASTLE_WEIGHTS = (): Weight[] => [
  w('castle_corridor', 25, 0, true), w('castle_corridor_crossing', 15, 5), w('castle_right_turn', 5, 10),
  w('castle_left_turn', 5, 10), w('castle_corridor_stairs', 10, 3, true), w('castle_t_balcony', 7, 2), w('castle_stalk_room', 5, 2),
];

/** Medidas (desplazamientos y tamaño de orientBox) de cada tipo. */
const SHAPE: Record<Kind, [number, number, number, number, number, number]> = {
  bridge_straight: [-1, -3, 0, 5, 10, 19],
  bridge_crossing: [-8, -3, 0, 19, 10, 19],
  room_crossing: [-2, 0, 0, 7, 9, 7],
  stairs_room: [-2, 0, 0, 7, 11, 7],
  monster_throne: [-2, 0, 0, 7, 8, 9],
  castle_entrance: [-5, -3, 0, 13, 14, 13],
  castle_corridor: [-1, 0, 0, 5, 7, 5],
  castle_corridor_crossing: [-1, 0, 0, 5, 7, 5],
  castle_right_turn: [-1, 0, 0, 5, 7, 5],
  castle_left_turn: [-1, 0, 0, 5, 7, 5],
  castle_corridor_stairs: [-1, -7, 0, 5, 14, 10],
  castle_t_balcony: [-3, 0, 0, 9, 7, 9],
  castle_stalk_room: [-5, -3, 0, 13, 14, 13],
  bridge_end_filler: [-1, -3, 0, 5, 10, 8],
};

export interface FortressPiece {
  kind: Kind;
  box: Box;
  dir: number;
  depth: number;
  /** Cofre de los giros (1 de cada 3). */
  chest?: boolean;
  /** Semilla propia de los remates rotos (su dibujo al azar). */
  selfSeed?: number;
}

/** Estado de la generación (StartPiece): tipos que quedan, el último puesto, las pendientes y las ya puestas. */
interface Gen {
  rng: FortressRandom;
  start: FortressPiece;
  bridge: Weight[];
  castle: Weight[];
  previous: Weight | null;
  pending: FortressPiece[];
  pieces: FortressPiece[];
}

const collides = (g: Gen, b: Box): boolean => g.pieces.some((p) => p.box.intersects(b));
const okBox = (b: Box): boolean => b.y0 > 10;

/** createPiece de cada tipo: la caja orientada si cabe (y > 10, sin chocar); los giros y remates tiran su azar al crearse. */
function createPiece(g: Gen, kind: Kind, fx: number, fy: number, fz: number, dir: number, depth: number): FortressPiece | null {
  const [ox, oy, oz, sw, sh, sd] = SHAPE[kind];
  const box = orientBox(fx, fy, fz, ox, oy, oz, sw, sh, sd, dir);
  if (!okBox(box) || collides(g, box)) return null;
  const p: FortressPiece = { kind, box, dir, depth };
  if (kind === 'castle_right_turn' || kind === 'castle_left_turn') p.chest = g.rng.nextInt(3) === 0;
  if (kind === 'bridge_end_filler') p.selfSeed = g.rng.nextInt();
  return p;
}

/** NetherBridgePiece.generatePiece: por pesos entre los tipos de la lista; si nada vale, un remate roto. */
function generatePiece(g: Gen, list: Weight[], fx: number, fy: number, fz: number, dir: number, depth: number): FortressPiece | null {
  let total = 0, any = false;
  for (const p of list) {
    if (p.max > 0 && p.placed < p.max) any = true;
    total += p.weight;
  }
  if (!any) total = -1;
  const doStuff = total > 0 && depth <= 30;
  for (let attempts = 0; attempts < 5 && doStuff; attempts++) {
    let sel = g.rng.nextInt(total);
    for (const p of list) {
      sel -= p.weight;
      if (sel < 0) {
        if ((p.max !== 0 && p.placed >= p.max) || (p === g.previous && !p.inRow)) break;
        const piece = createPiece(g, p.kind, fx, fy, fz, dir, depth);
        if (piece) {
          p.placed++;
          g.previous = p;
          if (p.max !== 0 && p.placed >= p.max) list.splice(list.indexOf(p), 1);
          return piece;
        }
      }
    }
  }
  return createPiece(g, 'bridge_end_filler', fx, fy, fz, dir, depth);
}

/** generateAndAddPiece: a menos de 112 bloques del inicio; si no, un remate que no se añade (como en Java). */
function addPiece(g: Gen, fx: number, fy: number, fz: number, dir: number, depth: number, castle: boolean): void {
  if (Math.abs(fx - g.start.box.x0) <= 112 && Math.abs(fz - g.start.box.z0) <= 112) {
    const p = generatePiece(g, castle ? g.castle : g.bridge, fx, fy, fz, dir, depth + 1);
    if (p) {
      g.pieces.push(p);
      g.pending.push(p);
    }
  } else createPiece(g, 'bridge_end_filler', fx, fy, fz, dir, depth);
}

function forward(g: Gen, p: FortressPiece, xOff: number, yOff: number, castle: boolean): void {
  const b = p.box;
  switch (p.dir) {
    case N: return addPiece(g, b.x0 + xOff, b.y0 + yOff, b.z0 - 1, p.dir, p.depth, castle);
    case S: return addPiece(g, b.x0 + xOff, b.y0 + yOff, b.z1 + 1, p.dir, p.depth, castle);
    case W: return addPiece(g, b.x0 - 1, b.y0 + yOff, b.z0 + xOff, p.dir, p.depth, castle);
    case E: return addPiece(g, b.x1 + 1, b.y0 + yOff, b.z0 + xOff, p.dir, p.depth, castle);
  }
}
function left(g: Gen, p: FortressPiece, yOff: number, zOff: number, castle: boolean): void {
  const b = p.box;
  if (p.dir === N || p.dir === S) addPiece(g, b.x0 - 1, b.y0 + yOff, b.z0 + zOff, W, p.depth, castle);
  else addPiece(g, b.x0 + zOff, b.y0 + yOff, b.z0 - 1, N, p.depth, castle);
}
function right(g: Gen, p: FortressPiece, yOff: number, zOff: number, castle: boolean): void {
  const b = p.box;
  if (p.dir === N || p.dir === S) addPiece(g, b.x1 + 1, b.y0 + yOff, b.z0 + zOff, E, p.depth, castle);
  else addPiece(g, b.x0 + zOff, b.y0 + yOff, b.z1 + 1, S, p.depth, castle);
}

/** addChildren de cada tipo. */
function addChildren(g: Gen, p: FortressPiece): void {
  switch (p.kind) {
    case 'bridge_straight': return forward(g, p, 1, 3, false);
    case 'bridge_crossing':
      forward(g, p, 8, 3, false);
      left(g, p, 3, 8, false);
      right(g, p, 3, 8, false);
      return;
    case 'room_crossing':
      forward(g, p, 2, 0, false);
      left(g, p, 0, 2, false);
      right(g, p, 0, 2, false);
      return;
    case 'stairs_room': return right(g, p, 6, 2, false);
    case 'castle_entrance': return forward(g, p, 5, 3, true);
    case 'castle_corridor': return forward(g, p, 1, 0, true);
    case 'castle_corridor_crossing':
      forward(g, p, 1, 0, true);
      left(g, p, 0, 1, true);
      right(g, p, 0, 1, true);
      return;
    case 'castle_right_turn': return right(g, p, 0, 1, true);
    case 'castle_left_turn': return left(g, p, 0, 1, true);
    case 'castle_corridor_stairs': return forward(g, p, 1, 0, true);
    case 'castle_t_balcony': {
      const zOff = p.dir === W || p.dir === N ? 5 : 1;
      left(g, p, 0, zOff, g.rng.nextInt(8) > 0);
      right(g, p, 0, zOff, g.rng.nextInt(8) > 0);
      return;
    }
    case 'castle_stalk_room':
      forward(g, p, 5, 3, true);
      forward(g, p, 5, 11, true);
      return;
  }
}

/**
 * Piezas de una fortaleza que empieza en el chunk (cx, cz) (NetherFortressStructure.generatePieces): el cruce de
 * inicio en el bloque 2,2 del chunk mirando al azar, sus hijas y luego las pendientes en orden al azar; al final
 * se mueve entera para que quede entre y = 48 y 70 (moveInsideHeights).
 */
export function fortressPieces(seed: number, cx: number, cz: number): FortressPiece[] {
  const rng = new FortressRandom(seed);
  const dir = [N, E, S, W][rng.nextInt(4)];
  const x = cx * 16 + 2, z = cz * 16 + 2;
  const start: FortressPiece = { kind: 'bridge_crossing', box: new Box(x, 64, z, x + 18, 64 + 9, z + 18), dir, depth: 0 };
  const g: Gen = { rng, start, bridge: BRIDGE_WEIGHTS(), castle: CASTLE_WEIGHTS(), previous: null, pending: [], pieces: [start] };
  addChildren(g, start);
  while (g.pending.length > 0) {
    const p = g.pending.splice(rng.nextInt(g.pending.length), 1)[0];
    addChildren(g, p);
  }
  let y0 = 1e9, y1 = -1e9;
  for (const p of g.pieces) {
    y0 = Math.min(y0, p.box.y0);
    y1 = Math.max(y1, p.box.y1);
  }
  const span = y1 - y0 + 1;
  const heightSpan = 70 - 48 + 1 - span;
  const target = heightSpan > 1 ? 48 + rng.nextInt(heightSpan) : 48;
  const dy = target - y0;
  for (const p of g.pieces) {
    p.box.y0 += dy;
    p.box.y1 += dy;
  }
  return g.pieces;
}

// ------------------------------------------------------------------ dibujo

/** Giro y reflejo de una pieza según su orientación (StructurePiece.setOrientation). */
export function turn(dir: number, facing: number): number {
  let f = facing;
  if (dir === S || dir === W) f = f === N ? S : f === S ? N : f; // Mirror.LEFT_RIGHT
  if (dir === W || dir === E) f = (f + 1) % 4; // Rotation.CLOCKWISE_90
  return f;
}

/** Lo que tiene toda pieza orientada (de la fortaleza del Nether o del mundo normal). */
export interface OrientedPiece {
  box: Box;
  dir: number;
}

/** Lo que dibuja una pieza: posiciones locales pasadas al mundo y escritas en el chunk del lienzo. */
export class Drawer {
  constructor(protected c: Canvas, protected p: OrientedPiece, protected ticks: number[]) {}
  wx(x: number, z: number): number {
    const b = this.p.box;
    return this.p.dir === W ? b.x1 - z : this.p.dir === E ? b.x0 + z : b.x0 + x;
  }
  wy(y: number): number {
    return this.p.box.y0 + y;
  }
  wz(x: number, z: number): number {
    const b = this.p.box;
    return this.p.dir === N ? b.z1 - z : this.p.dir === S ? b.z0 + z : b.z0 + x;
  }
  place(id: number, x: number, y: number, z: number): void {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z)) return;
    this.c.set(X, Y, Z, id);
    if (id > 0 && BLOCK_FLUID[id]) this.ticks.push(X, Y, Z);
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.place(id, x, y, z);
  }
  /** Escalera de ladrillos del Nether mirando a `facing` (dirección local, girada con la pieza). */
  stairs(facing: number): number {
    return stateOf(STAIRS.nether_brick, { facing: turn(this.p.dir, facing), half: 0 });
  }
  /** fillColumnDown: rellena hacia abajo mientras haya aire o líquido (y por encima del fondo). */
  column(id: number, x: number, y: number, z: number): void {
    const X = this.wx(x, z), Z = this.wz(x, z);
    let Y = this.wy(y);
    if (!this.c.inside(X, Y, Z)) return;
    for (; Y > 1; Y--) {
      const b = this.c.get(X, Y, Z);
      if (b < 0 || (b !== AIR && !BLOCK_FLUID[b])) return;
      this.c.set(X, Y, Z, id);
    }
  }
  /** createChest con reorient: mira al lado contrario de su única pared (o al norte si no hay una sola). */
  chest(x: number, y: number, z: number, table: string): void {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z)) return;
    const DX = [0, 1, 0, -1], DZ = [-1, 0, 1, 0];
    let solid = -1, count = 0;
    for (let d = 0; d < 4; d++) {
      const b = this.c.get(X + DX[d], Y, Z + DZ[d]);
      if (b > 0 && BLOCK_OPAQUE[b]) {
        solid = d;
        count++;
      }
    }
    let facing = count === 1 ? (solid + 2) % 4 : N;
    if (count !== 1) {
      // Sin una sola pared: norte, salvo que esté tapado (entonces el contrario, luego a un lado…).
      const blocked = (d: number) => {
        const b = this.c.get(X + DX[d], Y, Z + DZ[d]);
        return b > 0 && BLOCK_OPAQUE[b];
      };
      if (blocked(facing)) facing = (facing + 2) % 4;
      if (blocked(facing)) facing = (facing + 1) % 4;
      if (blocked(facing)) facing = (facing + 2) % 4;
    }
    this.c.chest(X, Y, Z, facing, table);
  }
}

const NB = NETHER_BRICKS, FENCE = NETHER_BRICK_FENCE;

function drawBridgeCrossing(d: Drawer): void {
  d.box(7, 3, 0, 11, 4, 18, NB);
  d.box(0, 3, 7, 18, 4, 11, NB);
  d.box(8, 5, 0, 10, 7, 18, AIR);
  d.box(0, 5, 8, 18, 7, 10, AIR);
  d.box(7, 5, 0, 7, 5, 7, NB);
  d.box(7, 5, 11, 7, 5, 18, NB);
  d.box(11, 5, 0, 11, 5, 7, NB);
  d.box(11, 5, 11, 11, 5, 18, NB);
  d.box(0, 5, 7, 7, 5, 7, NB);
  d.box(11, 5, 7, 18, 5, 7, NB);
  d.box(0, 5, 11, 7, 5, 11, NB);
  d.box(11, 5, 11, 18, 5, 11, NB);
  d.box(7, 2, 0, 11, 2, 5, NB);
  d.box(7, 2, 13, 11, 2, 18, NB);
  d.box(7, 0, 0, 11, 1, 3, NB);
  d.box(7, 0, 15, 11, 1, 18, NB);
  for (let x = 7; x <= 11; x++) {
    for (let z = 0; z <= 2; z++) {
      d.column(NB, x, -1, z);
      d.column(NB, x, -1, 18 - z);
    }
  }
  d.box(0, 2, 7, 5, 2, 11, NB);
  d.box(13, 2, 7, 18, 2, 11, NB);
  d.box(0, 0, 7, 3, 1, 11, NB);
  d.box(15, 0, 7, 18, 1, 11, NB);
  for (let x = 0; x <= 2; x++) {
    for (let z = 7; z <= 11; z++) {
      d.column(NB, x, -1, z);
      d.column(NB, 18 - x, -1, z);
    }
  }
}

function drawBridgeEndFiller(d: Drawer, p: FortressPiece): void {
  const r = new FortressRandom(p.selfSeed ?? 0);
  for (let x = 0; x <= 4; x++) {
    for (let y = 3; y <= 4; y++) {
      const z = r.nextInt(8);
      d.box(x, y, 0, x, y, z, NB);
    }
  }
  let z = r.nextInt(8);
  d.box(0, 5, 0, 0, 5, z, NB);
  z = r.nextInt(8);
  d.box(4, 5, 0, 4, 5, z, NB);
  for (let x = 0; x <= 4; x++) {
    const zx = r.nextInt(5);
    d.box(x, 2, 0, x, 2, zx, NB);
  }
  for (let x = 0; x <= 4; x++) {
    for (let y = 0; y <= 1; y++) {
      const zx = r.nextInt(3);
      d.box(x, y, 0, x, y, zx, NB);
    }
  }
}

function drawBridgeStraight(d: Drawer): void {
  d.box(0, 3, 0, 4, 4, 18, NB);
  d.box(1, 5, 0, 3, 7, 18, AIR);
  d.box(0, 5, 0, 0, 5, 18, NB);
  d.box(4, 5, 0, 4, 5, 18, NB);
  d.box(0, 2, 0, 4, 2, 5, NB);
  d.box(0, 2, 13, 4, 2, 18, NB);
  d.box(0, 0, 0, 4, 1, 3, NB);
  d.box(0, 0, 15, 4, 1, 18, NB);
  for (let x = 0; x <= 4; x++) {
    for (let z = 0; z <= 2; z++) {
      d.column(NB, x, -1, z);
      d.column(NB, x, -1, 18 - z);
    }
  }
  d.box(0, 1, 1, 0, 4, 1, FENCE);
  d.box(0, 3, 4, 0, 4, 4, FENCE);
  d.box(0, 3, 14, 0, 4, 14, FENCE);
  d.box(0, 1, 17, 0, 4, 17, FENCE);
  d.box(4, 1, 1, 4, 4, 1, FENCE);
  d.box(4, 3, 4, 4, 4, 4, FENCE);
  d.box(4, 3, 14, 4, 4, 14, FENCE);
  d.box(4, 1, 17, 4, 4, 17, FENCE);
}

function drawCorridorStairs(d: Drawer): void {
  const stairs = d.stairs(S);
  for (let step = 0; step <= 9; step++) {
    const floor = Math.max(1, 7 - step);
    const roof = Math.min(Math.max(floor + 5, 14 - step), 13);
    const z = step;
    d.box(0, 0, step, 4, floor, step, NB);
    d.box(1, floor + 1, step, 3, roof - 1, step, AIR);
    if (step <= 6) {
      d.place(stairs, 1, floor + 1, step);
      d.place(stairs, 2, floor + 1, step);
      d.place(stairs, 3, floor + 1, step);
    }
    d.box(0, roof, step, 4, roof, step, NB);
    d.box(0, floor + 1, step, 0, roof - 1, step, NB);
    d.box(4, floor + 1, step, 4, roof - 1, step, NB);
    if ((step & 1) === 0) {
      d.box(0, floor + 2, step, 0, floor + 3, step, FENCE);
      d.box(4, floor + 2, step, 4, floor + 3, step, FENCE);
    }
    for (let x = 0; x <= 4; x++) d.column(NB, x, -1, z);
  }
}

function drawTBalcony(d: Drawer): void {
  d.box(0, 0, 0, 8, 1, 8, NB);
  d.box(0, 2, 0, 8, 5, 8, AIR);
  d.box(0, 6, 0, 8, 6, 5, NB);
  d.box(0, 2, 0, 2, 5, 0, NB);
  d.box(6, 2, 0, 8, 5, 0, NB);
  d.box(1, 3, 0, 1, 4, 0, FENCE);
  d.box(7, 3, 0, 7, 4, 0, FENCE);
  d.box(0, 2, 4, 8, 2, 8, NB);
  d.box(1, 1, 4, 2, 2, 4, AIR);
  d.box(6, 1, 4, 7, 2, 4, AIR);
  d.box(1, 3, 8, 7, 3, 8, FENCE);
  d.place(FENCE, 0, 3, 8);
  d.place(FENCE, 8, 3, 8);
  d.box(0, 3, 6, 0, 3, 7, FENCE);
  d.box(8, 3, 6, 8, 3, 7, FENCE);
  d.box(0, 3, 4, 0, 5, 5, NB);
  d.box(8, 3, 4, 8, 5, 5, NB);
  d.box(1, 3, 5, 2, 5, 5, NB);
  d.box(6, 3, 5, 7, 5, 5, NB);
  d.box(1, 4, 5, 1, 5, 5, FENCE);
  d.box(7, 4, 5, 7, 5, 5, FENCE);
  for (let z = 0; z <= 5; z++) for (let x = 0; x <= 8; x++) d.column(NB, x, -1, z);
}

/** Muros, coronación y basas de la entrada del castillo y de la sala de cultivo (comunes a las dos). */
function drawCastleShell(d: Drawer): void {
  d.box(0, 3, 0, 12, 4, 12, NB);
  d.box(0, 5, 0, 12, 13, 12, AIR);
  d.box(0, 5, 0, 1, 12, 12, NB);
  d.box(11, 5, 0, 12, 12, 12, NB);
  d.box(2, 5, 11, 4, 12, 12, NB);
  d.box(8, 5, 11, 10, 12, 12, NB);
  d.box(5, 9, 11, 7, 12, 12, NB);
  d.box(2, 5, 0, 4, 12, 1, NB);
  d.box(8, 5, 0, 10, 12, 1, NB);
  d.box(5, 9, 0, 7, 12, 1, NB);
  d.box(2, 11, 2, 10, 12, 10, NB);
}
function drawCastleBattlements(d: Drawer): void {
  for (let i = 1; i <= 11; i += 2) {
    d.box(i, 10, 0, i, 11, 0, FENCE);
    d.box(i, 10, 12, i, 11, 12, FENCE);
    d.box(0, 10, i, 0, 11, i, FENCE);
    d.box(12, 10, i, 12, 11, i, FENCE);
    d.place(NB, i, 13, 0);
    d.place(NB, i, 13, 12);
    d.place(NB, 0, 13, i);
    d.place(NB, 12, 13, i);
    if (i !== 11) {
      d.place(FENCE, i + 1, 13, 0);
      d.place(FENCE, i + 1, 13, 12);
      d.place(FENCE, 0, 13, i + 1);
      d.place(FENCE, 12, 13, i + 1);
    }
  }
  d.place(FENCE, 0, 13, 0);
  d.place(FENCE, 0, 13, 12);
  d.place(FENCE, 12, 13, 12);
  d.place(FENCE, 12, 13, 0);
}
function drawCastleBase(d: Drawer): void {
  d.box(4, 2, 0, 8, 2, 12, NB);
  d.box(0, 2, 4, 12, 2, 8, NB);
  d.box(4, 0, 0, 8, 1, 3, NB);
  d.box(4, 0, 9, 8, 1, 12, NB);
  d.box(0, 0, 4, 3, 1, 8, NB);
  d.box(9, 0, 4, 12, 1, 8, NB);
  for (let x = 4; x <= 8; x++) {
    for (let z = 0; z <= 2; z++) {
      d.column(NB, x, -1, z);
      d.column(NB, x, -1, 12 - z);
    }
  }
  for (let x = 0; x <= 2; x++) {
    for (let z = 4; z <= 8; z++) {
      d.column(NB, x, -1, z);
      d.column(NB, 12 - x, -1, z);
    }
  }
}

function drawCastleEntrance(d: Drawer): void {
  drawCastleShell(d);
  d.box(5, 8, 0, 7, 8, 0, FENCE);
  drawCastleBattlements(d);
  for (let z = 3; z <= 9; z += 2) {
    d.box(1, 7, z, 1, 8, z, FENCE);
    d.box(11, 7, z, 11, 8, z, FENCE);
  }
  drawCastleBase(d);
  // El pozo de lava del centro: una columna hueca con una fuente de lava arriba que cae.
  d.box(5, 5, 5, 7, 5, 7, NB);
  d.box(6, 1, 6, 6, 4, 6, AIR);
  d.place(NB, 6, 0, 6);
  d.place(LAVA, 6, 5, 6);
}

function drawSmallCorridorBase(d: Drawer): void {
  d.box(0, 0, 0, 4, 1, 4, NB);
  d.box(0, 2, 0, 4, 5, 4, AIR);
}
function drawSmallCorridorTop(d: Drawer): void {
  d.box(0, 6, 0, 4, 6, 4, NB);
  for (let x = 0; x <= 4; x++) for (let z = 0; z <= 4; z++) d.column(NB, x, -1, z);
}

function drawCorridorCrossing(d: Drawer): void {
  drawSmallCorridorBase(d);
  d.box(0, 2, 0, 0, 5, 0, NB);
  d.box(4, 2, 0, 4, 5, 0, NB);
  d.box(0, 2, 4, 0, 5, 4, NB);
  d.box(4, 2, 4, 4, 5, 4, NB);
  drawSmallCorridorTop(d);
}

function drawLeftTurn(d: Drawer, p: FortressPiece): void {
  drawSmallCorridorBase(d);
  d.box(4, 2, 0, 4, 5, 4, NB);
  d.box(4, 3, 1, 4, 4, 1, FENCE);
  d.box(4, 3, 3, 4, 4, 3, FENCE);
  d.box(0, 2, 0, 0, 5, 0, NB);
  d.box(0, 2, 4, 3, 5, 4, NB);
  d.box(1, 3, 4, 1, 4, 4, FENCE);
  d.box(3, 3, 4, 3, 4, 4, FENCE);
  if (p.chest) d.chest(3, 2, 3, 'nether_bridge');
  drawSmallCorridorTop(d);
}

function drawCorridor(d: Drawer): void {
  drawSmallCorridorBase(d);
  d.box(0, 2, 0, 0, 5, 4, NB);
  d.box(4, 2, 0, 4, 5, 4, NB);
  d.box(0, 3, 1, 0, 4, 1, FENCE);
  d.box(0, 3, 3, 0, 4, 3, FENCE);
  d.box(4, 3, 1, 4, 4, 1, FENCE);
  d.box(4, 3, 3, 4, 4, 3, FENCE);
  drawSmallCorridorTop(d);
}

function drawRightTurn(d: Drawer, p: FortressPiece): void {
  drawSmallCorridorBase(d);
  d.box(0, 2, 0, 0, 5, 4, NB);
  d.box(0, 3, 1, 0, 4, 1, FENCE);
  d.box(0, 3, 3, 0, 4, 3, FENCE);
  d.box(4, 2, 0, 4, 5, 0, NB);
  d.box(1, 2, 4, 4, 5, 4, NB);
  d.box(1, 3, 4, 1, 4, 4, FENCE);
  d.box(3, 3, 4, 3, 4, 4, FENCE);
  if (p.chest) d.chest(1, 2, 3, 'nether_bridge');
  drawSmallCorridorTop(d);
}

function drawStalkRoom(d: Drawer): void {
  drawCastleShell(d);
  drawCastleBattlements(d);
  for (let z = 3; z <= 9; z += 2) {
    d.box(1, 7, z, 1, 8, z, FENCE);
    d.box(11, 7, z, 11, 8, z, FENCE);
  }
  const stairs = d.stairs(N);
  for (let ix = 0; ix <= 6; ix++) {
    const z = ix + 4;
    for (let x = 5; x <= 7; x++) d.place(stairs, x, 5 + ix, z);
    if (z >= 5 && z <= 8) d.box(5, 5, z, 7, ix + 4, z, NB);
    else if (z >= 9 && z <= 10) d.box(5, 8, z, 7, ix + 4, z, NB);
    if (ix >= 1) d.box(5, 6 + ix, z, 7, 9 + ix, z, AIR);
  }
  for (let x = 5; x <= 7; x++) d.place(stairs, x, 12, 11);
  d.box(5, 6, 7, 5, 7, 7, FENCE);
  d.box(7, 6, 7, 7, 7, 7, FENCE);
  d.box(5, 13, 12, 7, 13, 12, AIR);
  d.box(2, 5, 2, 3, 5, 3, NB);
  d.box(2, 5, 9, 3, 5, 10, NB);
  d.box(2, 5, 4, 2, 5, 8, NB);
  d.box(9, 5, 2, 10, 5, 3, NB);
  d.box(9, 5, 9, 10, 5, 10, NB);
  d.box(10, 5, 4, 10, 5, 8, NB);
  const east = d.stairs(E), west = d.stairs(W);
  d.place(west, 4, 5, 2);
  d.place(west, 4, 5, 3);
  d.place(west, 4, 5, 9);
  d.place(west, 4, 5, 10);
  d.place(east, 8, 5, 2);
  d.place(east, 8, 5, 3);
  d.place(east, 8, 5, 9);
  d.place(east, 8, 5, 10);
  // Los dos bancales de verrugas sobre arena de alma.
  d.box(3, 4, 4, 4, 4, 8, SOUL_SAND);
  d.box(8, 4, 4, 9, 4, 8, SOUL_SAND);
  d.box(3, 5, 4, 4, 5, 8, NETHER_WART_CROP);
  d.box(8, 5, 4, 9, 5, 8, NETHER_WART_CROP);
  drawCastleBase(d);
}

function drawMonsterThrone(d: Drawer): void {
  d.box(0, 2, 0, 6, 7, 7, AIR);
  d.box(1, 0, 0, 5, 1, 7, NB);
  d.box(1, 2, 1, 5, 2, 7, NB);
  d.box(1, 3, 2, 5, 3, 7, NB);
  d.box(1, 4, 3, 5, 4, 7, NB);
  d.box(1, 2, 0, 1, 4, 2, NB);
  d.box(5, 2, 0, 5, 4, 2, NB);
  d.box(1, 5, 2, 1, 5, 3, NB);
  d.box(5, 5, 2, 5, 5, 3, NB);
  d.box(0, 5, 3, 0, 5, 8, NB);
  d.box(6, 5, 3, 6, 5, 8, NB);
  d.box(1, 5, 8, 5, 5, 8, NB);
  d.place(FENCE, 1, 6, 3);
  d.place(FENCE, 5, 6, 3);
  d.place(FENCE, 0, 6, 3);
  d.place(FENCE, 6, 6, 3);
  d.box(0, 6, 4, 0, 6, 7, FENCE);
  d.box(6, 6, 4, 6, 6, 7, FENCE);
  d.place(FENCE, 0, 6, 8);
  d.place(FENCE, 6, 6, 8);
  d.box(1, 6, 8, 5, 6, 8, FENCE);
  d.place(FENCE, 1, 7, 8);
  d.box(2, 7, 8, 4, 7, 8, FENCE);
  d.place(FENCE, 5, 7, 8);
  d.place(FENCE, 2, 8, 8);
  d.place(FENCE, 3, 8, 8);
  d.place(FENCE, 4, 8, 8);
  // El generador de blazes en el trono.
  d.place(MOB_SPAWNER, 3, 5, 5);
  for (let x = 0; x <= 6; x++) for (let z = 0; z <= 6; z++) d.column(NB, x, -1, z);
}

function drawRoomCrossing(d: Drawer): void {
  d.box(0, 0, 0, 6, 1, 6, NB);
  d.box(0, 2, 0, 6, 7, 6, AIR);
  d.box(0, 2, 0, 1, 6, 0, NB);
  d.box(0, 2, 6, 1, 6, 6, NB);
  d.box(5, 2, 0, 6, 6, 0, NB);
  d.box(5, 2, 6, 6, 6, 6, NB);
  d.box(0, 2, 0, 0, 6, 1, NB);
  d.box(0, 2, 5, 0, 6, 6, NB);
  d.box(6, 2, 0, 6, 6, 1, NB);
  d.box(6, 2, 5, 6, 6, 6, NB);
  d.box(2, 6, 0, 4, 6, 0, NB);
  d.box(2, 5, 0, 4, 5, 0, FENCE);
  d.box(2, 6, 6, 4, 6, 6, NB);
  d.box(2, 5, 6, 4, 5, 6, FENCE);
  d.box(0, 6, 2, 0, 6, 4, NB);
  d.box(0, 5, 2, 0, 5, 4, FENCE);
  d.box(6, 6, 2, 6, 6, 4, NB);
  d.box(6, 5, 2, 6, 5, 4, FENCE);
  for (let x = 0; x <= 6; x++) for (let z = 0; z <= 6; z++) d.column(NB, x, -1, z);
}

function drawStairsRoom(d: Drawer): void {
  d.box(0, 0, 0, 6, 1, 6, NB);
  d.box(0, 2, 0, 6, 10, 6, AIR);
  d.box(0, 2, 0, 1, 8, 0, NB);
  d.box(5, 2, 0, 6, 8, 0, NB);
  d.box(0, 2, 1, 0, 8, 6, NB);
  d.box(6, 2, 1, 6, 8, 6, NB);
  d.box(1, 2, 6, 5, 8, 6, NB);
  d.box(0, 3, 2, 0, 5, 4, FENCE);
  d.box(6, 3, 2, 6, 5, 2, FENCE);
  d.box(6, 3, 4, 6, 5, 4, FENCE);
  d.place(NB, 5, 2, 5);
  d.box(4, 2, 5, 4, 3, 5, NB);
  d.box(3, 2, 5, 3, 4, 5, NB);
  d.box(2, 2, 5, 2, 5, 5, NB);
  d.box(1, 2, 5, 1, 6, 5, NB);
  d.box(1, 7, 1, 5, 7, 4, NB);
  d.box(6, 8, 2, 6, 8, 4, AIR);
  d.box(2, 6, 0, 4, 8, 0, NB);
  d.box(2, 5, 0, 4, 5, 0, FENCE);
  for (let x = 0; x <= 6; x++) for (let z = 0; z <= 6; z++) d.column(NB, x, -1, z);
}

/** Dibuja en el lienzo (un chunk) la parte de cada pieza que le toca; los fluidos que pone, a `ticks`. */
export function drawFortress(c: Canvas, pieces: readonly FortressPiece[], ticks: number[]): void {
  const x0 = c.x0, z0 = c.z0;
  for (const p of pieces) {
    const b = p.box;
    if (b.x1 < x0 || b.x0 > x0 + 15 || b.z1 < z0 || b.z0 > z0 + 15) continue;
    const d = new Drawer(c, p, ticks);
    switch (p.kind) {
      case 'bridge_crossing': drawBridgeCrossing(d); break;
      case 'bridge_end_filler': drawBridgeEndFiller(d, p); break;
      case 'bridge_straight': drawBridgeStraight(d); break;
      case 'castle_corridor_stairs': drawCorridorStairs(d); break;
      case 'castle_t_balcony': drawTBalcony(d); break;
      case 'castle_entrance': drawCastleEntrance(d); break;
      case 'castle_corridor_crossing': drawCorridorCrossing(d); break;
      case 'castle_left_turn': drawLeftTurn(d, p); break;
      case 'castle_corridor': drawCorridor(d); break;
      case 'castle_right_turn': drawRightTurn(d, p); break;
      case 'castle_stalk_room': drawStalkRoom(d); break;
      case 'monster_throne': drawMonsterThrone(d); break;
      case 'room_crossing': drawRoomCrossing(d); break;
      case 'stairs_room': drawStairsRoom(d); break;
    }
  }
}

/** Caja que envuelve todas las piezas. */
export function fortressBounds(pieces: readonly FortressPiece[]): Box {
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

void CHEST;
