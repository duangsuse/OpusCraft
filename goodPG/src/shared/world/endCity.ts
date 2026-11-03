// Fase 8.6 (el End): las ciudades del End, portadas de EndCityPieces y EndCityStructure de la 26.3.
// - Dónde: en las tierras altas y medias del End, en una rejilla de regiones de 20 chunks (11 de separación, reparto
//   triangular); la ciudad empieza en el bloque 7,7 de su chunk, girada al azar, a la menor altura del suelo en un
//   cuadrado de 5 × 5 hacia donde mira; si queda por debajo de y = 60, no hay ciudad.
// - Cómo crece (como en Java): una casa de tres pisos con su tejado y encima una torre; cada torre sube de 2 a 4 tramos
//   y a veces echa puentes hacia los lados (de 1 a 4 tramos rectos o de escalera) que acaban en otra casa, o se
//   convierte en una torre gorda (de 1 a 3 cuerpos, con puentes a su vez) rematada por la sala del tesoro. Un puente
//   puede acabar en el barco del End (uno por ciudad) en vez de en otra casa. Nada se pone si choca con lo ya puesto,
//   hasta 8 niveles de hondura.
// - Las piezas: sus medidas, dónde van sus marcas (cofres, centinelas shulker y los élitros del barco) y cómo se
//   encadenan salen de las plantillas de Java; su contenido se construye aquí con reglas (paredes de ladrillos de
//   piedra del End con pilares de púrpura en las esquinas y ventanas de cristal magenta, suelos y tejados de púrpura
//   con cornisa de escaleras, torres redondas con su escalera de caracol de losas, puentes con barandilla, el barco
//   con su casco, su bodega, su cubierta, el mástil con la cofa y el camarote).
import {
  AIR, PURPUR_BLOCK, PURPUR_PILLAR, END_STONE_BRICKS, OBSIDIAN, END_ROD, LADDER, STAIRS, SLABS, STAINED_GLASS, WALL_BANNERS,
  stateOf, ENDER_CHEST, SKULLS, WALL_SKULLS, brewingStandWith,
} from '../blocks';
import { LOG_AXIS, AXIS_X, AXIS_Z } from '../blocks/logAxis';
import { hash2, CHUNK_SIZE } from '../constants';
import { FortressRandom } from './netherFortress';
import type { Canvas } from './structures';

// ------------------------------------------------------------------ piezas (plantillas)

/** Direcciones de Java en el plano: 0 norte (−z), 1 este, 2 sur, 3 oeste. */
const N = 0, E = 1, S = 2, W = 3;

/** Lo que hay en una celda de una plantilla, en sus coordenadas y con las orientaciones de Java. */
type Cell =
  | { k: 'air' } | { k: 'purpur' } | { k: 'bricks' } | { k: 'glass' } | { k: 'obsidian' }
  | { k: 'pillar'; axis: 'x' | 'y' | 'z' } | { k: 'stairs'; f: number; top: boolean } | { k: 'slab'; top: boolean }
  | { k: 'rod'; f: number | 'up' } | { k: 'ladder'; f: number } | { k: 'chest'; f: number } | { k: 'ender_chest'; f: number }
  | { k: 'banner'; f: number } | { k: 'dragon_head'; f: number } | { k: 'brewing' };

export type MarkerKind = 'Chest' | 'Sentry' | 'Elytra';

interface Template {
  size: [number, number, number];
  cells: Map<number, Cell>;
  markers: [MarkerKind, number, number, number][];
}

const key = (x: number, y: number, z: number) => (y * 64 + z) * 64 + x;

/** Constructor de una plantilla. */
class Builder {
  readonly cells = new Map<number, Cell>();
  readonly markers: [MarkerKind, number, number, number][] = [];
  constructor(readonly size: [number, number, number]) {}
  set(x: number, y: number, z: number, c: Cell): void {
    this.cells.set(key(x, y, z), c);
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: Cell): void {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c);
  }
  /** Todo el volumen de aire (las plantillas que despejan lo que había). */
  clear(): void {
    const [w, h, d] = this.size;
    this.box(0, 0, 0, w - 1, h - 1, d - 1, AIRC);
  }
  p(x: number, y: number, z: number): void {
    this.set(x, y, z, PUR);
  }
  mark(k: MarkerKind, x: number, y: number, z: number): void {
    this.markers.push([k, x, y, z]);
  }
  done(): Template {
    return { size: this.size, cells: this.cells, markers: this.markers };
  }
}

const AIRC: Cell = { k: 'air' }, PUR: Cell = { k: 'purpur' }, BRK: Cell = { k: 'bricks' }, GLS: Cell = { k: 'glass' };
const pil = (axis: 'x' | 'y' | 'z'): Cell => ({ k: 'pillar', axis });
const st = (f: number, top: boolean): Cell => ({ k: 'stairs', f, top });
const sl = (top: boolean): Cell => ({ k: 'slab', top });

/** La cornisa: alterna escaleras de arriba y de abajo según la distancia a la esquina (dos y dos, empezando arriba). */
const rimTop = (d: number) => d % 4 === 0 || d % 4 === 1;
/** Otras alternancias de cornisa (la de cada pieza). */
const RIM_THIRDS = (d: number) => d % 3 === 1;
const RIM_FLOOR = (d: number) => d === 1 || d === 3 || d === 4;
const RIM_WIDE = (d: number) => d === 1 || d === 4 || d === 5 || d === 7;
const RIM_ODD = (d: number) => d % 2 === 1;

/**
 * Suelo o tejado de n × n en (x0, y, z0): cornisa de escaleras que miran hacia dentro (las esquinas, de arriba) y el
 * resto de púrpura, salvo lo que diga `hole`.
 */
function slabFloor(b: Builder, x0: number, y: number, z0: number, n: number, hole?: ((x: number, z: number) => boolean) | null,
  top: (d: number) => boolean = rimTop, altCorners = false): void {
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = x0 + i, z = z0 + j;
      const edgeX = i === 0 || i === n - 1, edgeZ = j === 0 || j === n - 1;
      if (edgeX && edgeZ) {
        // Las esquinas miran a un lado u otro según la pieza (la escalera de esquina de Java, exterior izquierda o derecha).
        const f = altCorners ? (i === 0 ? E : j === 0 ? W : N) : i === 0 ? (j === 0 ? E : N) : j === 0 ? S : W;
        b.set(x, y, z, st(f, true));
      } else if (edgeZ) {
        b.set(x, y, z, st(j === 0 ? S : N, top(Math.min(i, n - 1 - i))));
      } else if (edgeX) {
        b.set(x, y, z, st(i === 0 ? E : W, top(Math.min(j, n - 1 - j))));
      } else if (!hole?.(x, z)) b.p(x, y, z);
    }
  }
}

/** Varas del End (hacia arriba) en las cuatro esquinas de un cuadrado de n desde (x0, z0). */
function cornerRods(b: Builder, x0: number, y: number, z0: number, n: number): void {
  for (const [x, z] of [[x0, z0], [x0 + n - 1, z0], [x0, z0 + n - 1], [x0 + n - 1, z0 + n - 1]]) b.set(x, y, z, { k: 'rod', f: 'up' });
}

/**
 * Paredes de una sala de n × n desde (x0, z0), de y0 a y1: pilares de púrpura en las esquinas, ladrillos de piedra del
 * End y ventanas de cristal donde diga `win` (lado 0 norte, 1 este, 2 sur, 3 oeste; i a lo largo del lado) y huecos
 * donde diga `open`.
 */
function walls(b: Builder, x0: number, z0: number, n: number, y0: number, y1: number,
  win: (y: number, side: number, i: number) => boolean, open?: (y: number, side: number, i: number) => boolean): void {
  for (let y = y0; y <= y1; y++) {
    for (let i = 0; i < n; i++) {
      for (let side = 0; side < 4; side++) {
        const x = side === 0 || side === 2 ? x0 + i : side === 1 ? x0 + n - 1 : x0;
        const z = side === 1 || side === 3 ? z0 + i : side === 0 ? z0 : z0 + n - 1;
        const corner = i === 0 || i === n - 1;
        if (corner) b.set(x, y, z, pil('y'));
        else if (open?.(y, side, i)) b.set(x, y, z, AIRC);
        else b.set(x, y, z, win(y, side, i) ? GLS : BRK);
      }
    }
  }
}

/** Anillo de una torre redonda (5 × 5 sin esquinas) desde (x0, z0). */
function ringCells(x0: number, z0: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
    const border = i === 0 || i === 4 || j === 0 || j === 4;
    const corner = (i === 0 || i === 4) && (j === 0 || j === 4);
    if (border && !corner) out.push([x0 + i, z0 + j]);
  }
  return out;
}

/** La escalera de caracol de las torres: una losa por altura que gira alrededor del centro (3, 3). */
const SPIRAL: [number, number][] = [[2, 3], [3, 2], [4, 3], [3, 4]];

/**
 * Tres alturas de fuste de torre desde y (anillo de pilares; en el medio, los pilares tumbados del centro de cada cara
 * con una escalera por fuera) y la escalera de caracol empezando en la fase `phase`.
 */
function towerShaft(b: Builder, y: number, phase: number): void {
  for (let k = 0; k < 3; k++) {
    for (const [x, z] of ringCells(1, 1)) b.set(x, y + k, z, pil('y'));
    const [sx, sz] = SPIRAL[(phase + k) % 4];
    b.set(sx, y + k, sz, sl(false));
  }
  const m = y + 1;
  b.set(3, m, 1, pil('z'));
  b.set(3, m, 5, pil('z'));
  b.set(1, m, 3, pil('x'));
  b.set(5, m, 3, pil('x'));
  b.set(3, m, 0, st(S, true));
  b.set(3, m, 6, st(N, true));
  b.set(0, m, 3, st(E, true));
  b.set(6, m, 3, st(W, true));
}

function towerBase(): Template {
  const b = new Builder([7, 7, 7]);
  b.box(0, 3, 0, 6, 6, 6, AIRC);
  // La escalera de mano que baja hasta el tejado de debajo, sobre su pilar.
  for (let y = 0; y <= 2; y++) {
    b.set(3, y, 4, { k: 'ladder', f: N });
    b.set(3, y, 5, pil('y'));
  }
  // El suelo con el hueco de la escalera.
  b.box(0, 3, 0, 6, 3, 6, PUR);
  b.box(2, 3, 2, 4, 3, 4, AIRC);
  b.set(2, 3, 3, sl(false));
  towerShaft(b, 4, 1);
  return b.done();
}

function towerPiece(): Template {
  const b = new Builder([7, 4, 7]);
  b.clear();
  for (const [x, z] of ringCells(1, 1)) b.p(x, 0, z);
  b.set(2, 0, 3, sl(false));
  towerShaft(b, 1, 1);
  return b.done();
}

function towerTop(): Template {
  const b = new Builder([9, 5, 9]);
  b.clear();
  // El suelo: cornisa de escaleras (7 × 7) con el hueco de la escalera y los estandartes colgando por fuera.
  slabFloor(b, 1, 0, 1, 7, (x, z) => (x >= 3 && x <= 5 && z >= 4 && z <= 5), RIM_ODD, true);
  b.set(3, 0, 3, sl(false));
  b.set(4, 0, 3, sl(false));
  for (const [x, z, f] of [[2, 0, N], [6, 0, N], [2, 8, S], [6, 8, S], [0, 2, W], [0, 6, W], [8, 2, E], [8, 6, E]] as const) b.set(x, 0, z, { k: 'banner', f });
  // La sala: paredes de 5 × 5, con la puerta al este (dos de alto) y ventanas en el centro de tres lados.
  walls(b, 2, 2, 5, 1, 3, (y, side, i) => y >= 2 && i === 2 && side !== 1, (y, side, i) => side === 1 && y <= 2 && (i === 1 || i === 2));
  cornerRods(b, 1, 1, 1, 7);
  b.mark('Sentry', 4, 3, 4);
  slabFloor(b, 0, 4, 0, 9);
  return b.done();
}

function baseFloor(): Template {
  const b = new Builder([10, 4, 10]);
  b.clear();
  b.box(1, 0, 1, 8, 0, 8, PUR);
  // El escalón de la puerta.
  b.box(3, 0, 9, 6, 0, 9, PUR);
  b.set(2, 0, 9, st(N, false));
  b.set(7, 0, 9, st(N, false));
  walls(b, 1, 1, 8, 1, 3, (y, side, i) => y >= 2 && side !== 2 && (i === 2 || i === 5), (_y, side, i) => side === 2 && (i === 3 || i === 4));
  b.mark('Sentry', 3, 2, 9);
  b.mark('Sentry', 6, 2, 9);
  return b.done();
}

/** Tejado de n × n: cornisa y púrpura, con las varas del End en las esquinas de dentro. */
function roof(n: number): Template {
  const b = new Builder([n, 2, n]);
  b.clear();
  slabFloor(b, 0, 0, 0, n, null, n === 12 ? RIM_THIRDS : n === 16 ? RIM_WIDE : rimTop, n === 16);
  cornerRods(b, 1, 1, 1, n - 2);
  return b.done();
}

/** Parte común de los pisos: el suelo (y = 4) con su hueco y las paredes con ventanas (y = 5..7). */
function floorShell(b: Builder, n: number, hole: (x: number, z: number) => boolean, win: (y: number, side: number, i: number) => boolean): void {
  slabFloor(b, 0, 4, 0, n, hole, n === 12 ? RIM_FLOOR : rimTop);
  walls(b, 1, 1, n - 2, 5, 7, win);
  cornerRods(b, 0, 5, 0, n);
}

function secondFloor1(): Template {
  const b = new Builder([12, 8, 12]);
  // La escalera que sube desde la planta baja (losas en zigzag) y tapa dos de sus ventanas.
  b.set(8, 1, 3, sl(true)); b.p(8, 1, 4); b.set(8, 1, 5, sl(false));
  b.set(6, 2, 3, sl(true)); b.p(7, 2, 3); b.set(8, 2, 3, sl(false));
  b.set(4, 3, 3, sl(true)); b.p(5, 3, 3); b.set(6, 3, 3, sl(false));
  for (let y = 2; y <= 3; y++) {
    b.set(4, y, 2, BRK);
    b.set(7, y, 2, BRK);
  }
  floorShell(b, 12, (x, z) => (z === 3 && x >= 5 && x <= 8) || (x === 8 && z >= 4 && z <= 6),
    (y, _side, i) => y >= 6 && (i === 2 || i === 7));
  b.set(4, 4, 3, sl(false));
  return b.done();
}

function secondFloor2(): Template {
  const b = new Builder([12, 8, 12]);
  // Escalera de caracol en el centro.
  b.p(5, 1, 5); b.p(6, 1, 5); b.p(5, 1, 6); b.set(6, 1, 6, st(N, false)); b.set(6, 1, 7, sl(false));
  b.p(5, 2, 5); b.set(6, 2, 5, st(W, false)); b.set(7, 2, 5, sl(false)); b.p(5, 2, 6);
  b.set(5, 3, 4, sl(false)); b.set(5, 3, 5, st(S, false)); b.set(4, 3, 6, sl(true)); b.p(5, 3, 6);
  floorShell(b, 12, (x, z) => x >= 3 && x <= 8 && z >= 3 && z <= 8 && !(z === 6 && x >= 5), (y, side, i) => y >= 6 && (i === 2 || (i === 7 && side !== 1)));
  b.set(5, 4, 6, st(E, false));
  for (let x = 6; x <= 8; x++) b.set(x, 4, 6, sl(true));
  // La escalera que sube pegada a la pared este hasta el piso de arriba.
  for (const z of [7, 8]) {
    b.set(9, 5, z, st(E, true));
    b.set(9, 6, z, st(E, false));
    b.set(8, 7, z, sl(true));
    b.set(9, 7, z, st(E, true));
  }
  b.mark('Sentry', 8, 5, 6);
  return b.done();
}

function thirdFloor1(): Template {
  const b = new Builder([14, 8, 14]);
  b.set(3, 1, 10, sl(false)); b.p(4, 1, 10); b.set(5, 1, 10, sl(true));
  b.set(5, 2, 10, sl(false)); b.p(6, 2, 10); b.set(7, 2, 10, sl(true)); b.set(9, 2, 11, BRK);
  b.set(7, 3, 10, sl(false)); b.p(8, 3, 10); b.set(9, 3, 10, sl(true)); b.set(9, 3, 11, BRK);
  floorShell(b, 14, (x, z) => z === 10 && x >= 3 && x <= 8, (y, _side, i) => y >= 6 && (i === 2 || i === 4 || i === 7 || i === 9));
  b.set(9, 4, 10, sl(false));
  // La columna del centro con los asientos de escaleras a los lados.
  for (const z of [2, 3, 4, 5, 7]) {
    b.set(6, 5, z, st(E, false));
    b.set(7, 5, z, st(W, false));
  }
  b.set(6, 5, 8, st(N, false));
  b.set(7, 5, 8, st(N, false));
  for (let y = 5; y <= 7; y++) {
    b.set(6, y, 6, pil('y'));
    b.set(7, y, 6, pil('y'));
  }
  return b.done();
}

function thirdFloor2(): Template {
  const b = new Builder([14, 8, 14]);
  // La escalera maciza que sube de abajo.
  b.box(4, 0, 9, 6, 0, 9, PUR); b.box(6, 0, 10, 9, 0, 10, PUR);
  b.set(4, 1, 9, st(E, false)); b.p(5, 1, 9); b.p(6, 1, 9); b.box(6, 1, 10, 9, 1, 10, PUR);
  b.set(5, 2, 9, st(E, false)); b.p(6, 2, 9); b.box(6, 2, 10, 9, 2, 10, PUR); b.set(9, 2, 11, BRK);
  b.set(8, 3, 10, st(E, false)); b.p(9, 3, 10); b.set(9, 3, 11, BRK);
  floorShell(b, 14, (x, z) => x >= 3 && x <= 10 && z >= 3 && z <= 10 && !((z === 3 || z === 4) && (x === 6 || x === 7)) &&
    !(z === 8 && x >= 5 && x <= 8) && !(z === 10 && x >= 9), (y, side, i) => y >= 6 && (i === 2 || i === 4 || ((side === 0 || side === 2) && (i === 7 || i === 9))));
  b.set(9, 4, 10, st(E, false));
  b.set(6, 4, 4, { k: 'rod', f: S });
  b.set(7, 4, 4, { k: 'rod', f: S });
  // La sala del tesoro pequeña: cofre y cofre de ender contra la pared norte, entre dos centinelas.
  b.set(6, 5, 2, { k: 'chest', f: S });
  b.set(7, 5, 2, { k: 'ender_chest', f: S });
  b.mark('Sentry', 2, 5, 2);
  b.mark('Sentry', 11, 5, 2);
  b.mark('Chest', 6, 6, 2);
  // Pilares de púrpura contra las paredes y el muro bajo del centro.
  for (let y = 5; y <= 7; y++) for (const z of [6, 8, 10]) {
    b.p(2, y, z);
    b.p(11, y, z);
  }
  b.p(5, 5, 8); b.p(8, 5, 8);
  for (const x of [3, 4, 5, 8, 9, 10]) b.p(x, 6, 8);
  return b.done();
}

// ------------------------------------------------------------------ puentes

function bridgeEnd(): Template {
  const b = new Builder([5, 6, 2]);
  b.clear();
  b.set(2, 0, 0, pil('z'));
  b.box(1, 0, 1, 3, 0, 1, PUR);
  b.p(0, 1, 0); b.p(4, 1, 0); b.box(0, 1, 1, 4, 1, 1, PUR);
  for (let x = 1; x <= 3; x++) b.set(x, 1, 0, st(S, false));
  for (let y = 2; y <= 3; y++) for (const x of [0, 4]) {
    b.p(x, y, 1);
    if (y === 2) b.p(x, y, 0);
  }
  b.set(0, 3, 0, { k: 'rod', f: 'up' });
  b.set(4, 3, 0, { k: 'rod', f: 'up' });
  b.p(0, 4, 1); b.set(1, 4, 1, sl(true)); b.set(3, 4, 1, sl(true)); b.p(4, 4, 1);
  b.set(0, 5, 1, sl(false)); b.box(1, 5, 1, 3, 5, 1, PUR); b.set(4, 5, 1, sl(false));
  return b.done();
}

function bridgePiece(): Template {
  const b = new Builder([5, 6, 4]);
  b.clear();
  for (let z = 0; z <= 3; z++) b.set(2, 0, z, pil('z'));
  b.set(1, 0, 0, st(E, true)); b.set(3, 0, 0, st(W, true));
  b.box(0, 1, 0, 4, 1, 3, PUR);
  b.set(0, 1, 0, st(E, true)); b.set(4, 1, 0, st(W, true));
  b.p(0, 2, 0); b.p(4, 2, 0);
  for (let z = 1; z <= 3; z++) {
    b.set(0, 2, z, st(E, false));
    b.set(4, 2, z, st(W, false));
  }
  return b.done();
}

function bridgeSteepStairs(): Template {
  const b = new Builder([5, 7, 4]);
  b.clear();
  b.set(2, 0, 3, pil('z'));
  b.box(1, 1, 3, 3, 1, 3, PUR);
  // Un escalón por fila, subiendo hacia z = 0, con su apoyo debajo y la barandilla al lado.
  for (let z = 3; z >= 0; z--) {
    const y = 5 - z;
    b.p(0, y, z); b.p(4, y, z);
    for (let x = 1; x <= 3; x++) b.set(x, y, z, st(N, false));
    if (z < 3) {
      b.set(1, y - 1, z, st(E, true)); b.set(2, y - 1, z, z === 0 ? pil('z') : PUR); b.set(3, y - 1, z, st(W, true));
    }
    if (z > 0) {
      b.set(0, y + 1, z, st(E, false));
      b.set(4, y + 1, z, st(W, false));
    }
  }
  b.p(0, 6, 0); b.p(4, 6, 0);
  return b.done();
}

function bridgeGentleStairs(): Template {
  const b = new Builder([5, 7, 8]);
  b.clear();
  b.set(2, 0, 7, pil('z'));
  b.set(2, 4, 0, pil('z'));
  // Un escalón cada dos filas, subiendo hacia z = 0: sus apoyos, la losa con los postes de púrpura a los lados, el
  // suelo macizo de delante y la barandilla de escaleras (en la última fila, postes).
  for (let s = 0; s < 4; s++) {
    const z = 7 - s * 2, y = 1 + s;
    b.set(0, y, z, st(E, true)); b.box(1, y, z, 3, y, z, PUR); b.set(4, y, z, st(W, true));
    if (z - 1 >= 0) b.box(0, y + 1, z - 1, 4, y + 1, z - 1, PUR);
    b.p(0, y + 1, z); b.p(4, y + 1, z);
    for (let x = 1; x <= 3; x++) b.set(x, y + 1, z, sl(false));
    for (const zz of [z, z - 1]) {
      if (zz < 0) continue;
      if (s === 3 && zz === z - 1) {
        b.p(0, y + 2, zz);
        b.p(4, y + 2, zz);
      } else {
        b.set(0, y + 2, zz, st(E, false));
        b.set(4, y + 2, zz, st(W, false));
      }
    }
  }
  return b.done();
}

// ------------------------------------------------------------------ torre gorda

/** Anillo de la torre gorda (casi un círculo de 11 de diámetro) desde (1, 1). */
function fatRing(): [number, number][] {
  const out: [number, number][] = [];
  const rows = [[5, 7], [3, 4, 8, 9], [2, 10], [2, 10], [1, 11], [1, 11], [1, 11], [2, 10], [2, 10], [3, 4, 8, 9], [5, 7]];
  rows.forEach((xs, j) => {
    const z = j + 1;
    if (xs.length === 2 && xs[1] - xs[0] === 2 && (j === 0 || j === 10)) for (let x = xs[0]; x <= xs[1]; x++) out.push([x, z]);
    else for (const x of xs) out.push([x, z]);
  });
  return out;
}

/** Cuatro alturas de cuerpo de torre gorda desde y (pilares, con las escaleras de caracol de los lados). */
function fatBody(b: Builder, y: number, floorBlock: boolean, rods: [number, number, number, number][]): void {
  const ring = fatRing();
  for (let k = 0; k < 4; k++) for (const [x, z] of ring) b.set(x, y + k, z, k === 0 && floorBlock ? PUR : pil('y'));
  const m = y + 2;
  b.set(6, m, 1, pil('z')); b.set(6, m, 11, pil('z')); b.set(1, m, 6, pil('x')); b.set(11, m, 6, pil('x'));
  b.set(6, m, 0, st(S, true)); b.set(6, m, 12, st(N, true)); b.set(0, m, 6, st(E, true)); b.set(12, m, 6, st(W, true));
  for (const [x, dy, z, f] of rods) b.set(x, y + dy, z, { k: 'rod', f });
}

function fatTowerBase(): Template {
  const b = new Builder([13, 4, 13]);
  b.clear();
  // El suelo macizo con el hueco del centro.
  for (const [x, z] of fatRing()) b.p(x, 0, z);
  for (let x = 2; x <= 10; x++) for (let z = 2; z <= 10; z++) {
    const inRing = Math.hypot(x - 6, z - 6) <= 4.6;
    if (inRing && !(x >= 5 && x <= 7 && z >= 5 && z <= 7)) b.p(x, 0, z);
  }
  b.set(6, 0, 7, sl(false));
  fatBody(b, 0, false, [[3, 2, 4, E], [9, 2, 8, W], [4, 3, 3, S], [8, 3, 9, N]]);
  for (const [x, z] of fatRing()) b.p(x, 0, z);
  b.set(2, 1, 5, sl(false));
  b.set(10, 1, 7, sl(false));
  return b.done();
}

function fatTowerMiddle(): Template {
  const b = new Builder([13, 8, 13]);
  b.clear();
  fatBody(b, 0, true, [[8, 2, 3, S], [4, 2, 9, N], [9, 3, 4, W], [3, 3, 8, E]]);
  fatBody(b, 4, true, [[3, 2, 4, E], [9, 2, 8, W], [4, 3, 3, S], [8, 3, 9, N]]);
  // La escalera de caracol por dentro de la pared.
  b.set(5, 0, 2, sl(false)); b.set(7, 0, 10, sl(false)); b.set(7, 1, 2, sl(false)); b.set(5, 1, 10, sl(false));
  b.set(10, 4, 5, sl(false)); b.set(2, 4, 7, sl(false)); b.set(2, 5, 5, sl(false)); b.set(10, 5, 7, sl(false));
  // El remate de arriba: la cara norte y oeste de púrpura (asiento de la parte de encima).
  b.box(5, 7, 1, 7, 7, 1, PUR);
  b.box(1, 7, 5, 1, 7, 7, PUR);
  b.set(6, 7, 0, pil('z'));
  b.set(0, 7, 6, pil('x'));
  b.mark('Sentry', 2, 2, 6); b.mark('Sentry', 10, 2, 6); b.mark('Sentry', 6, 6, 2); b.mark('Sentry', 6, 6, 10);
  return b.done();
}

function fatTowerTop(): Template {
  const b = new Builder([17, 6, 17]);
  b.clear();
  // El suelo de la sala del tesoro con el hueco de la escalera que llega de abajo.
  const hole: Record<number, [number, number]> = { 4: [8, 8], 5: [5, 8], 6: [5, 8], 7: [4, 8], 8: [4, 12], 9: [8, 12], 10: [8, 11], 11: [8, 11], 12: [8, 8] };
  slabFloor(b, 1, 0, 1, 15, (x, z) => !!hole[z] && x >= hole[z][0] && x <= hole[z][1]);
  b.set(7, 0, 4, sl(false)); b.set(9, 0, 12, sl(false));
  walls(b, 2, 2, 13, 1, 3, (y, side, i) => y >= 2 && (side === 0 ? i === 2 || i === 5 : side === 1 ? i === 5 || i === 7 || i === 10 : i === 2 || i === 5 || i === 7 || i === 10));
  cornerRods(b, 1, 1, 1, 15);
  // Dos columnas dentro y la escalera de losas que sube por la pared norte.
  for (let y = 1; y <= 3; y++) {
    b.set(9, y, 7, pil('y'));
    b.set(7, y, 9, pil('y'));
  }
  b.set(7, 1, 3, sl(false)); b.p(8, 1, 3); b.set(9, 1, 3, sl(true));
  b.set(9, 2, 3, sl(false)); b.p(10, 2, 3); b.set(11, 2, 3, sl(true));
  b.set(11, 3, 3, sl(false)); b.p(12, 3, 3); b.set(13, 3, 3, sl(true));
  // Los dos cofres del tesoro.
  b.set(3, 1, 11, { k: 'chest', f: E });
  b.set(5, 1, 13, { k: 'chest', f: N });
  b.mark('Chest', 3, 2, 11);
  b.mark('Chest', 5, 2, 13);
  slabFloor(b, 0, 4, 0, 17, (x, z) => z === 3 && x >= 8 && x <= 13);
  b.set(13, 4, 3, sl(false));
  // La barandilla de la salida al tejado.
  b.set(7, 5, 2, st(E, false)); for (let x = 8; x <= 11; x++) b.set(x, 5, 2, st(S, false));
  b.set(7, 5, 3, st(E, false));
  b.set(7, 5, 4, st(E, false)); for (let x = 8; x <= 11; x++) b.set(x, 5, 4, st(N, false));
  return b.done();
}

// ------------------------------------------------------------------ el barco

/**
 * El barco del End (13 × 24 × 29, la proa hacia z = 0): la quilla de pilares que se curva hacia la proa, el casco con
 * sus cuadernas de escaleras, la bodega de obsidiana y púrpura (con el tesoro y los élitros en la proa), la cubierta
 * con su barandilla, el bauprés con la cabeza de dragón, el mástil con la escala y la cofa, y el castillo de popa con
 * el camarote (y su soporte para pociones).
 */
function ship(): Template {
  const b = new Builder([13, 24, 29]);
  b.clear();
  const C = 6;
  // Quilla y roda: pilares a lo largo que suben hacia la proa.
  const keel: [number, number, number][] = [[0, 11, 23], [1, 8, 11], [1, 23, 24], [2, 6, 12], [3, 5, 6], [5, 4, 5], [6, 3, 4], [7, 1, 4]];
  for (const [y, z0, z1] of keel) for (let z = z0; z <= z1; z++) b.set(C, y, z, pil('z'));
  // Fondo del casco.
  for (let z = 12; z <= 24; z++) b.box(C - 1, 1, z, C + 1, 1, z, PUR);
  for (const z of [23, 24]) b.set(C, 1, z, pil('z'));
  // Sollado de obsidiana con su marco de púrpura.
  b.box(C - 1, 2, 8, C + 1, 2, 9, PUR); b.box(C - 2, 2, 10, C + 2, 2, 11, PUR);
  for (let z = 12; z <= 25; z++) {
    b.p(C - 2, 2, z); b.p(C + 2, 2, z);
    b.set(C - 1, 2, z, z === 25 ? PUR : { k: 'obsidian' }); b.set(C + 1, 2, z, z === 25 ? PUR : { k: 'obsidian' });
  }
  for (let z = 6; z <= 25; z++) b.set(C, 2, z, z === 14 ? pil('y') : pil('z'));
  // Cuadernas: escaleras por fuera del casco cada cuatro filas, a tres alturas.
  for (const z of [13, 17, 21]) {
    b.set(C - 2, 1, z, st(E, true)); b.set(C + 2, 1, z, st(W, true));
    b.set(C - 3, 2, z, st(E, true)); b.set(C + 3, 2, z, st(W, true));
    b.set(C - 4, 3, z, st(E, true)); b.set(C + 4, 3, z, st(W, true));
  }
  b.set(C - 3, 2, 25, st(E, true)); b.set(C + 3, 2, 25, st(W, true)); b.set(C - 4, 3, 25, st(E, true)); b.set(C + 4, 3, 25, st(W, true));
  // Costados del casco (y = 3..6): se abren de la proa al centro.
  const half = (z: number, y: number): number => {
    if (z <= 4) return -1;
    if (z === 5) return 0;
    if (z === 6) return -1;
    if (z <= 8) return 2;
    if (z === 9) return y === 3 ? 2 : 3;
    if (z === 10) return 3;
    return y <= 3 ? 3 : 4;
  };
  for (let y = 3; y <= 6; y++) {
    for (let z = 5; z <= 25; z++) {
      const h = half(z, y);
      if (h < 0) continue;
      if (h === 0) {
        if (y >= 4 && y <= 6) b.p(C, y, z);
        continue;
      }
      if (y === 3 && z <= 8 && z !== 6) {
        if (z === 7) b.box(C - 1, y, z, C + 1, y, z, PUR);
        else if (z === 8) b.box(C - 2, y, z, C + 2, y, z, PUR);
        continue;
      }
      if (y === 6 && (z === 13 || z === 16)) continue; // las portillas
      b.p(C - h, y, z);
      b.p(C + h, y, z);
    }
  }
  b.box(C - 3, 3, 25, C + 3, 3, 25, PUR);
  b.set(C - 4, 3, 25, st(E, true)); b.set(C + 4, 3, 25, st(W, true));
  b.box(C - 4, 4, 25, C + 4, 4, 25, PUR);
  for (const x of [C - 4, C, C + 4]) b.set(x, 4, 26, st(N, true));
  // La proa de la bodega: el tesoro (dos cofres y los élitros en medio) y su guardián.
  b.box(C - 1, 4, 6, C + 1, 4, 6, PUR); b.p(C, 4, 5); b.box(C - 1, 5, 6, C + 1, 5, 6, PUR);
  b.p(C - 2, 4, 7); b.p(C + 2, 4, 7); b.p(C - 2, 5, 7); b.p(C + 2, 5, 7);
  b.set(C - 1, 4, 7, { k: 'chest', f: S }); b.set(C + 1, 4, 7, { k: 'chest', f: S });
  b.mark('Sentry', C, 4, 8);
  b.mark('Chest', C - 1, 5, 7); b.mark('Elytra', C, 5, 7); b.mark('Chest', C + 1, 5, 7);
  for (const z of [4, 5]) b.set(C, 5, z, pil('z'));
  b.set(C, 6, 5, PUR); b.set(C - 1, 6, 6, PUR); b.set(C + 1, 6, 6, PUR); b.set(C, 6, 6, { k: 'rod', f: S });
  // La escalera de la bodega a la cubierta (a popa, junto al costado de estribor).
  b.box(C + 2, 3, 15, C + 3, 3, 24, PUR); b.set(C + 2, 3, 15, st(S, false));
  b.box(C + 2, 4, 20, C + 4, 4, 24, PUR); b.set(C + 2, 4, 19, st(S, false)); b.set(C + 3, 4, 19, st(S, false));
  // El mástil (desde la sobrequilla hasta la cofa) con su escala.
  for (let y = 3; y <= 22; y++) b.set(C, y, 14, pil('y'));
  b.set(C, 7, 12, pil('z')); b.set(C, 7, 13, GLS);
  for (let y = 8; y <= 21; y++) b.set(C, y, 15, { k: 'ladder', f: S });
  b.p(C, 23, 14);
  // La cofa.
  for (const [x, z] of [[C - 1, 13], [C + 1, 13], [C - 1, 14], [C + 1, 14], [C - 1, 15], [C + 1, 15]]) b.set(x, 20, z, sl(true));
  for (let x = C - 2; x <= C + 2; x++) {
    b.set(x, 21, 12, st(S, true));
    b.set(x, 21, 16, st(N, true));
  }
  for (let z = 13; z <= 15; z++) {
    b.set(C - 2, 21, z, st(E, true));
    b.set(C + 2, 21, z, st(W, true));
  }
  b.set(C - 2, 21, 12, st(S, true)); b.set(C + 2, 21, 12, st(W, true)); b.set(C - 2, 21, 16, st(E, true)); b.set(C + 2, 21, 16, st(N, true));
  // La cubierta (y = 7): cubre el casco de la proa al castillo de popa.
  const deck = (z: number): number => (z <= 4 ? -1 : z === 5 ? 1 : z <= 7 ? 2 : z <= 9 ? 3 : 4);
  for (let z = 5; z <= 18; z++) {
    const h = deck(z);
    for (let x = C - h; x <= C + h; x++) if (!(x === C && (z === 12 || z === 13 || z === 14))) b.p(x, 7, z);
  }
  // La barandilla de la cubierta: postes de púrpura y escaleras mirando hacia dentro.
  const rail = (z: number): number => (z <= 5 ? 0 : z <= 7 ? 2 : z <= 9 ? 3 : 4);
  for (let z = 4; z <= 18; z++) {
    const h = rail(z);
    if (h === 0) {
      b.p(C, 8, z);
      if (z === 5) {
        b.p(C - 1, 8, 5);
        b.p(C + 1, 8, 5);
        b.set(C, 8, 5, AIRC);
      }
      continue;
    }
    const post = z === 8 || z === 10 || z === 13 || z === 16 || z === 6;
    for (const [x, f] of [[C - h, E], [C + h, W]] as const) b.set(x, 8, z, post ? PUR : st(f, false));
  }
  b.set(C - 2, 8, 8, st(S, false)); b.set(C + 2, 8, 8, st(S, false));
  b.set(C - 3, 8, 10, st(S, false)); b.set(C + 3, 8, 10, st(S, false));
  for (const x of [C - 4, C + 4]) b.set(x, 9, 10, { k: 'rod', f: 'up' });
  // Bauprés: la cabeza de dragón en la punta y el tajamar que sube en escalera.
  b.set(C, 8, 0, { k: 'dragon_head', f: N });
  b.set(C, 8, 1, st(N, false));
  b.set(C, 9, 4, { k: 'rod', f: 'up' });
  for (const [y, z] of [[8, 10], [9, 8], [10, 6], [11, 4], [12, 2]] as const) {
    b.set(C, y, z, pil('z'));
    b.set(C, y, z + 1, pil('z'));
    b.set(C, y, z + 2, st(N, false));
  }
  b.set(C, 12, 1, sl(true));
  // El castillo de popa: el puente con su cornisa y el camarote debajo.
  b.box(C - 4, 5, 20, C + 4, 5, 26, PUR);
  b.set(C + 2, 5, 20, st(S, false)); b.set(C + 3, 5, 20, st(S, false));
  for (let z = 20; z <= 27; z++) {
    const top = z !== 22 && z !== 25;
    b.set(C - 5, 5, z, z === 27 ? st(E, true) : z === 20 ? st(S, true) : st(E, top));
    b.set(C + 5, 5, z, z === 27 ? st(N, true) : z === 20 ? st(S, true) : st(W, top));
  }
  for (let x = C - 4; x <= C + 4; x++) b.set(x, 5, 27, st(N, x !== C - 3 && x !== C));
  b.set(C - 5, 5, 13, st(E, true)); b.set(C + 5, 5, 13, st(W, true)); b.set(C - 5, 5, 16, st(E, true)); b.set(C + 5, 5, 16, st(W, true));
  b.set(C - 5, 6, 27, { k: 'rod', f: 'up' }); b.set(C + 5, 6, 27, { k: 'rod', f: 'up' });
  b.mark('Sentry', C + 2, 6, 27);
  // Paredes del camarote (y = 6..8) con ventanas.
  for (let y = 6; y <= 8; y++) {
    for (let z = 21; z <= 26; z++) {
      const corner = z === 21 || z === 26;
      b.set(C - 4, y, z, corner ? pil('y') : y === 7 && (z === 23 || z === 24) ? GLS : BRK);
      b.set(C + 4, y, z, corner ? pil('y') : y === 7 && (z === 23 || z === 24) ? GLS : BRK);
    }
    for (let x = C - 3; x <= C + 3; x++) b.set(x, y, 26, x === C ? pil('y') : y === 7 && (x === C - 2 || x === C + 2) ? GLS : BRK);
  }
  b.set(C, 6, 25, pil('y'));
  b.set(C, 7, 25, { k: 'brewing' });
  // El tabique del castillo con la escalera que baja al camarote (a babor) y la que sube a la toldilla (a estribor).
  for (let y = 6; y <= 8; y++) {
    b.p(C - 3, y, 21);
    b.p(C, y, 21);
    b.p(C + 1, y, 21);
    b.p(C + 4, y, 19);
    b.p(C + 4, y, 20);
  }
  b.box(C - 4, 6, 19, C + 1, 6, 19, PUR);
  b.box(C - 4, 6, 20, C - 3, 7, 20, PUR); b.box(C, 6, 20, C + 1, 7, 20, PUR);
  b.box(C - 4, 7, 19, C - 3, 7, 19, PUR); b.box(C, 7, 19, C + 1, 7, 19, PUR);
  b.set(C - 2, 6, 20, st(N, false)); b.set(C - 1, 6, 20, st(N, false));
  b.set(C - 2, 7, 19, st(N, false)); b.set(C - 1, 7, 19, st(N, false));
  b.p(C - 4, 8, 19); b.p(C - 4, 8, 20);
  b.set(C + 2, 8, 19, st(S, false)); b.set(C + 3, 8, 19, st(S, false));
  b.box(C + 2, 8, 20, C + 3, 8, 20, PUR);
  b.set(C + 2, 8, 21, st(N, true)); b.set(C + 3, 8, 21, st(N, true));
  // La cubierta de popa (y = 9) con su cornisa, y la barandilla (y = 10).
  b.box(C - 5, 9, 20, C + 5, 9, 27, PUR);
  b.box(C - 2, 9, 20, C - 1, 9, 20, AIRC);
  b.set(C + 2, 9, 20, st(S, false)); b.set(C + 3, 9, 20, st(S, false));
  for (let z = 19; z <= 28; z++) {
    const d = Math.min(z - 19, 28 - z);
    b.set(C - 6, 9, z, z === 19 ? st(E, true) : z === 28 ? st(N, true) : st(E, rimTop(d)));
    b.set(C + 6, 9, z, z === 19 ? st(S, true) : z === 28 ? st(W, true) : st(W, rimTop(d)));
  }
  for (let x = C - 5; x <= C + 5; x++) {
    if (x < C - 2 || x > C + 4) b.set(x, 9, 19, st(S, true));
    b.set(x, 9, 28, st(N, rimTop(Math.min(x - (C - 6), C + 6 - x))));
  }
  b.p(C - 5, 10, 20); b.set(C - 4, 10, 20, st(S, false)); b.p(C - 3, 10, 20); b.p(C, 10, 20); b.p(C + 1, 10, 20); b.p(C + 4, 10, 20); b.p(C + 5, 10, 20);
  for (let z = 21; z <= 26; z++) {
    b.set(C - 5, 10, z, st(E, false));
    b.set(C + 5, 10, z, st(W, false));
  }
  b.set(C - 3, 10, 21, st(W, false)); b.set(C - 2, 10, 21, st(S, false)); b.set(C - 1, 10, 21, st(S, false)); b.set(C, 10, 21, st(E, false));
  b.set(C - 2, 10, 22, pil('y'));
  b.set(C - 2, 10, 26, st(E, false)); for (let x = C - 1; x <= C + 1; x++) b.set(x, 10, 26, st(S, false)); b.set(C + 2, 10, 26, st(W, false));
  for (let x = C - 5; x <= C + 5; x++) {
    const post = x === C - 5 || x === C - 2 || x === C + 2 || x === C + 5;
    b.set(x, 10, 27, post ? PUR : st(N, false));
  }
  b.mark('Sentry', C - 2, 11, 27);
  return b.done();
}

/** Las plantillas por nombre (construidas una vez). */
const TEMPLATES: Record<string, () => Template> = {
  base_floor: baseFloor, base_roof: () => roof(12), second_floor_1: secondFloor1, second_floor_2: secondFloor2, second_roof: () => roof(14),
  third_floor_1: thirdFloor1, third_floor_2: thirdFloor2, third_roof: () => roof(16), tower_base: towerBase, tower_piece: towerPiece,
  tower_top: towerTop, bridge_end: bridgeEnd, bridge_piece: bridgePiece, bridge_steep_stairs: bridgeSteepStairs,
  bridge_gentle_stairs: bridgeGentleStairs, fat_tower_base: fatTowerBase, fat_tower_middle: fatTowerMiddle, fat_tower_top: fatTowerTop,
  ship,
};
const built = new Map<string, Template>();
export function endCityTemplate(name: string): Template {
  let t = built.get(name);
  if (!t) {
    t = TEMPLATES[name]();
    built.set(name, t);
  }
  return t;
}

// ------------------------------------------------------------------ generación (EndCityPieces)

/** Giro de una plantilla: 0 ninguno, 1 horario, 2 media vuelta, 3 antihorario (Rotation). */
export type Rot = 0 | 1 | 2 | 3;

/** StructureTemplate.transform con el pivote en el origen. */
function rotXZ(x: number, z: number, r: Rot): [number, number] {
  switch (r) {
    case 1: return [-z, x];
    case 2: return [-x, -z];
    case 3: return [z, -x];
    default: return [x, z];
  }
}

export interface CityBox {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
}

export interface CityPiece {
  name: string;
  x: number;
  y: number;
  z: number;
  rot: Rot;
  overwrite: boolean;
  box: CityBox;
  /** genDepth de Java: la etiqueta con la que se deciden los choques permitidos. */
  tag: number;
}

function makePiece(name: string, x: number, y: number, z: number, rot: Rot, overwrite: boolean): CityPiece {
  const [w, h, d] = endCityTemplate(name).size;
  const [ax, az] = rotXZ(w - 1, d - 1, rot);
  return {
    name, x, y, z, rot, overwrite, tag: 0,
    box: { x0: x + Math.min(0, ax), y0: y, z0: z + Math.min(0, az), x1: x + Math.max(0, ax), y1: y + h - 1, z1: z + Math.max(0, az) },
  };
}

/** addPiece: la hija en la posición de la madre más el desplazamiento girado con la madre. */
function addPiece(parent: CityPiece, off: [number, number, number], name: string, rot: Rot, overwrite: boolean): CityPiece {
  const [dx, dz] = rotXZ(off[0], off[2], parent.rot);
  return makePiece(name, parent.x + dx, parent.y + off[1], parent.z + dz, rot, overwrite);
}

const intersects = (a: CityBox, b: CityBox) => a.x1 >= b.x0 && a.x0 <= b.x1 && a.y1 >= b.y0 && a.y0 <= b.y1 && a.z1 >= b.z0 && a.z0 <= b.z1;
const addRot = (a: Rot, b: Rot): Rot => ((a + b) & 3) as Rot;

type SectionGen = (depth: number, parent: CityPiece, off: [number, number, number] | null, out: CityPiece[]) => boolean;

class CityGen {
  shipCreated = false;
  constructor(private r: FortressRandom, readonly pieces: CityPiece[]) {}

  /**
   * recursiveChildren: genera la sección y, si no choca con las piezas de `into` (salvo con las de la misma etiqueta
   * que la madre), la añade a `into`. Como en Java, las secciones que salen dentro de otra van a la lista de su
   * madre (y se comprueban contra ella): sólo llegan a la ciudad si la madre también se acepta.
   */
  recurse(gen: SectionGen, depth: number, parent: CityPiece, off: [number, number, number] | null, into: CityPiece[]): boolean {
    if (depth > 8) return false;
    const children: CityPiece[] = [];
    if (!gen(depth, parent, off, children)) return false;
    const tag = this.r.nextInt();
    for (const c of children) {
      c.tag = tag;
      const hit = into.find((p) => intersects(p.box, c.box));
      if (hit && hit.tag !== parent.tag) return false;
    }
    into.push(...children);
    return true;
  }

  house: SectionGen = (depth, parent, off, out) => {
    if (depth > 8) return false;
    const rot = parent.rot;
    let last = addPiece(parent, off!, 'base_floor', rot, true);
    out.push(last);
    const floors = this.r.nextInt(3);
    if (floors === 0) out.push(addPiece(last, [-1, 4, -1], 'base_roof', rot, true));
    else if (floors === 1) {
      last = addPiece(last, [-1, 0, -1], 'second_floor_2', rot, false);
      out.push(last);
      last = addPiece(last, [-1, 8, -1], 'second_roof', rot, false);
      out.push(last);
      this.recurse(this.tower, depth + 1, last, null, out);
    } else {
      last = addPiece(last, [-1, 0, -1], 'second_floor_2', rot, false);
      out.push(last);
      last = addPiece(last, [-1, 4, -1], 'third_floor_2', rot, false);
      out.push(last);
      last = addPiece(last, [-1, 8, -1], 'third_roof', rot, true);
      out.push(last);
      this.recurse(this.tower, depth + 1, last, null, out);
    }
    return true;
  };

  tower: SectionGen = (depth, parent, _off, out) => {
    const rot = parent.rot;
    let last = addPiece(parent, [3 + this.r.nextInt(2), -3, 3 + this.r.nextInt(2)], 'tower_base', rot, true);
    out.push(last);
    last = addPiece(last, [0, 7, 0], 'tower_piece', rot, true);
    out.push(last);
    let bridge = this.r.nextInt(3) === 0 ? last : null;
    const height = 1 + this.r.nextInt(3);
    for (let i = 0; i < height; i++) {
      last = addPiece(last, [0, 4, 0], 'tower_piece', rot, true);
      out.push(last);
      if (i < height - 1 && this.r.nextInt(2) === 0) bridge = last;
    }
    if (bridge) {
      for (const [br, off] of TOWER_BRIDGES) {
        if (this.r.nextInt(2) === 0) {
          const start = addPiece(bridge, off, 'bridge_end', addRot(rot, br), true);
          out.push(start);
          this.recurse(this.bridge, depth + 1, start, null, out);
        }
      }
      out.push(addPiece(last, [-1, 4, -1], 'tower_top', rot, true));
    } else {
      if (depth !== 7) return this.recurse(this.fat, depth + 1, last, null, out);
      out.push(addPiece(last, [-1, 4, -1], 'tower_top', rot, true));
    }
    return true;
  };

  bridge: SectionGen = (depth, parent, _off, out) => {
    const rot = parent.rot;
    const len = this.r.nextInt(4) + 1;
    let last = addPiece(parent, [0, 0, -4], 'bridge_piece', rot, true);
    out.push(last);
    last.tag = -1;
    let nextY = 0;
    for (let i = 0; i < len; i++) {
      if (this.r.nextInt(2) === 0) {
        last = addPiece(last, [0, nextY, -4], 'bridge_piece', rot, true);
        nextY = 0;
      } else {
        last = this.r.nextInt(2) === 0 ? addPiece(last, [0, nextY, -4], 'bridge_steep_stairs', rot, true)
          : addPiece(last, [0, nextY, -8], 'bridge_gentle_stairs', rot, true);
        nextY = 4;
      }
      out.push(last);
    }
    if (!this.shipCreated && this.r.nextInt(10 - depth) === 0) {
      out.push(addPiece(last, [-8 + this.r.nextInt(8), nextY, -70 + this.r.nextInt(10)], 'ship', rot, true));
      this.shipCreated = true;
    } else if (!this.recurse(this.house, depth + 1, last, [-3, nextY + 1, -11], out)) return false;
    last = addPiece(last, [4, nextY, 0], 'bridge_end', addRot(rot, 2), true);
    out.push(last);
    last.tag = -1;
    return true;
  };

  fat: SectionGen = (depth, parent, _off, out) => {
    const rot = parent.rot;
    let last = addPiece(parent, [-3, 4, -3], 'fat_tower_base', rot, true);
    out.push(last);
    last = addPiece(last, [0, 4, 0], 'fat_tower_middle', rot, true);
    out.push(last);
    for (let i = 0; i < 2 && this.r.nextInt(3) !== 0; i++) {
      last = addPiece(last, [0, 8, 0], 'fat_tower_middle', rot, true);
      out.push(last);
      for (const [br, off] of FAT_TOWER_BRIDGES) {
        if (this.r.nextInt(2) === 0) {
          const start = addPiece(last, off, 'bridge_end', addRot(rot, br), true);
          out.push(start);
          this.recurse(this.bridge, depth + 1, start, null, out);
        }
      }
    }
    out.push(addPiece(last, [-2, 8, -2], 'fat_tower_top', rot, true));
    return true;
  };
}

const TOWER_BRIDGES: [Rot, [number, number, number]][] = [[0, [1, -1, 0]], [1, [6, -1, 1]], [3, [0, -1, 5]], [2, [5, -1, 6]]];
const FAT_TOWER_BRIDGES: [Rot, [number, number, number]][] = [[0, [4, -1, 0]], [1, [12, -1, 4]], [3, [0, -1, 8]], [2, [8, -1, 12]]];

/** EndCityPieces.startHouseTower: la casa de tres pisos con su tejado y la primera torre. */
export function endCityPieces(seed: number, x: number, y: number, z: number, rot: Rot): CityPiece[] {
  const pieces: CityPiece[] = [];
  const g = new CityGen(new FortressRandom(seed), pieces);
  let last = makePiece('base_floor', x, y, z, rot, true);
  pieces.push(last);
  last = addPiece(last, [-1, 0, -1], 'second_floor_1', rot, false);
  pieces.push(last);
  last = addPiece(last, [-1, 4, -1], 'third_floor_1', rot, false);
  pieces.push(last);
  last = addPiece(last, [-1, 8, -1], 'third_roof', rot, true);
  pieces.push(last);
  g.recurse(g.tower, 1, last, null, pieces);
  return pieces;
}

export function cityBounds(pieces: readonly CityPiece[]): CityBox {
  const b: CityBox = { x0: 1e9, y0: 1e9, z0: 1e9, x1: -1e9, y1: -1e9, z1: -1e9 };
  for (const p of pieces) {
    b.x0 = Math.min(b.x0, p.box.x0); b.y0 = Math.min(b.y0, p.box.y0); b.z0 = Math.min(b.z0, p.box.z0);
    b.x1 = Math.max(b.x1, p.box.x1); b.y1 = Math.max(b.y1, p.box.y1); b.z1 = Math.max(b.z1, p.box.z1);
  }
  return b;
}

// ------------------------------------------------------------------ dibujo

/** Lo que el dibujo necesita para las marcas (el servidor pone el botín, los shulkers y el marco con los élitros). */
export interface CityMarks {
  chest(x: number, y: number, z: number, facing: number): void;
  sentry(x: number, y: number, z: number): void;
  elytra(x: number, y: number, z: number, facing: number): void;
}

/** Bloques que dependen de la fase 4 (se registran después: se piden aquí para no cargar su módulo antes). */
export const CITY_BLOCKS = { enderChest: ENDER_CHEST, dragonWallHead: WALL_SKULLS.dragon, dragonHead: SKULLS.dragon };

const DIR6_OF = [5, 0, 4, 1]; // N, E, S, W → caras de la vara (−z, +x, +z, −x)

function cellId(c: Cell, r: Rot): number {
  const f = (d: number) => (d + r) & 3;
  switch (c.k) {
    case 'air': return AIR;
    case 'purpur': return PURPUR_BLOCK;
    case 'bricks': return END_STONE_BRICKS;
    case 'glass': return STAINED_GLASS.magenta;
    case 'obsidian': return OBSIDIAN;
    case 'pillar': {
      if (c.axis === 'y') return PURPUR_PILLAR;
      const alongX = (c.axis === 'x') !== (r % 2 === 1);
      return LOG_AXIS.purpur_pillar + (alongX ? AXIS_X : AXIS_Z);
    }
    case 'stairs': return stateOf(STAIRS.purpur, { facing: f(c.f), half: c.top ? 1 : 0 });
    case 'slab': return stateOf(SLABS.purpur, { type: c.top ? 1 : 0 });
    case 'rod': return END_ROD + (c.f === 'up' ? 2 : DIR6_OF[f(c.f)]);
    case 'ladder': return stateOf(LADDER, { facing: f(c.f) });
    case 'banner': return stateOf(WALL_BANNERS.magenta, { facing: f(c.f) });
    case 'brewing': return brewingStandWith(0b101);
    case 'ender_chest': return CITY_BLOCKS.enderChest ? stateOf(CITY_BLOCKS.enderChest, { facing: f(c.f) }) : AIR;
    case 'dragon_head': return CITY_BLOCKS.dragonWallHead ? stateOf(CITY_BLOCKS.dragonWallHead, { facing: f(c.f) }) : AIR;
    case 'chest': return AIR; // los cofres los pone el lienzo (con su botín)
  }
}

/** «Botín» del alambique del barco (lo llena ContainerSystem.fillLoot). */
export const SHIP_BREWING = 'end_ship_brewing';

/** Dibuja en el lienzo (un chunk) la parte de cada pieza que le toca. */
export function drawEndCity(c: Canvas, pieces: readonly CityPiece[], marks: CityMarks): void {
  const x0 = c.x0, z0 = c.z0, x1 = x0 + CHUNK_SIZE - 1, z1 = z0 + CHUNK_SIZE - 1;
  for (const p of pieces) {
    const b = p.box;
    if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
    const t = endCityTemplate(p.name);
    const [w, h, d] = t.size;
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        for (let x = 0; x < w; x++) {
          const cell = t.cells.get(key(x, y, z));
          if (!cell || (cell.k === 'air' && !p.overwrite)) continue;
          const [dx, dz] = rotXZ(x, z, p.rot);
          const X = p.x + dx, Y = p.y + y, Z = p.z + dz;
          if (X < x0 || X > x1 || Z < z0 || Z > z1) continue;
          if (cell.k === 'chest') {
            c.chest(X, Y, Z, (cell.f + p.rot) & 3, 'end_city_treasure');
            continue;
          }
          if (cell.k === 'brewing' && c.inside(X, Y, Z)) {
            // El alambique del barco, con dos pociones de curación II (en los huecos 1 y 3).
            c.set(X, Y, Z, cellId(cell, p.rot));
            c.chests.push({ x: X, y: Y, z: Z, table: SHIP_BREWING });
            continue;
          }
          c.set(X, Y, Z, cellId(cell, p.rot));
        }
      }
    }
    for (const [k, mx, my, mz] of t.markers) {
      const [dx, dz] = rotXZ(mx, mz, p.rot);
      const X = p.x + dx, Y = p.y + my, Z = p.z + dz;
      if (X < x0 || X > x1 || Z < z0 || Z > z1) continue;
      if (k === 'Sentry') marks.sentry(X, Y, Z);
      else if (k === 'Elytra') marks.elytra(X, Y, Z, (S + p.rot) & 3);
      else marks.chest(X, Y - 1, Z, 0);
    }
  }
}

// ------------------------------------------------------------------ colocación

/** La rejilla de las ciudades (structure_set end_cities: 20 de separación entre regiones, 11 mínimo, reparto triangular). */
export const END_CITY_GRID = { spacing: 20, separation: 11, salt: 10387313 };

/** Chunk de la región (rx, rz) donde se intenta la ciudad (reparto triangular: la media de dos al azar). */
export function endCityRegionChunk(seed: number, rx: number, rz: number): [number, number] {
  const { spacing, separation, salt } = END_CITY_GRID;
  const range = spacing - separation;
  const h1 = hash2(rx, rz, seed ^ salt), h2 = hash2(rz, rx, seed ^ (salt * 3));
  const tri = (a: number, b: number) => Math.floor(((a % range) + (b % range)) / 2);
  return [rx * spacing + tri(h1, h2), rz * spacing + tri(h1 >>> 8, h2 >>> 8)];
}

/** getLowestYIn5by5Box: la menor altura del suelo (el primer bloque libre) en las cuatro esquinas hacia donde mira. */
export function endCityStartY(surface: (x: number, z: number) => number, x: number, z: number, rot: Rot): number {
  let ox = 5, oz = 5;
  if (rot === 1) ox = -5;
  else if (rot === 2) {
    ox = -5;
    oz = -5;
  } else if (rot === 3) oz = -5;
  return Math.min(surface(x, z), surface(x, z + oz), surface(x + ox, z), surface(x + ox, z + oz)) + 1;
}
