// Minas abandonadas como en Java 26.3 (MineshaftStructure y MineshaftPieces, con la colocación de
// structure_set/mineshafts): una de cada 250 chunks (random_spread con frecuencia 0,004), la de madera oscura en
// las badlands y ninguna en el Deep Dark.
//
// Piezas: empieza en una sala de tierra (MineShaftRoom) de la que salen, por sus cuatro lados, pasillos
// (MineShaftCorridor: de 2 a 4 tramos de 5 bloques con soportes de postes y viga, telarañas, raíles, antorchas y,
// a veces, vagonetas con cofre o un generador de arañas de cueva con su maraña), cruces (de uno o dos pisos) y
// escaleras que suben o bajan, hasta 8 niveles de profundidad y a menos de 80 bloques de la sala, sin que dos
// piezas se pisen. Luego todo se baja por debajo del nivel del mar (las de las badlands, a una altura entre el mar
// y la superficie: pueden asomar). Donde falta suelo pone tablones y, si hace falta, un pilar de troncos hasta el
// fondo o una cadena colgada del techo; no se dibuja una pieza que toque agua o lava.
//
// Las piezas de una mina se calculan una vez (con su propio azar) y cada chunk dibuja lo que le toca. Lo que Java
// decide al azar mientras dibuja (telarañas, raíles, vagonetas…) sale aquí de la posición, así que no depende del
// orden en que se generen los chunks.
import {
  AIR, OAK_PLANKS, OAK_LOG, DARK_OAK_PLANKS, DARK_OAK_LOG, FENCES, COBWEB, MOB_SPAWNER, RAIL, RAIL_NS, RAIL_EW, WALL_TORCH, IRON_CHAIN,
  BLOCK_FLUID, BLOCK_SOLID, BLOCK_COLLIDE, stateOf, isGlowLichen, SEAGRASS,
} from '../blocks';
import { hash2, hash3, hashToFloat, SEA_LEVEL, MIN_Y } from '../constants';
import { Box, turn } from './netherFortress';
import type { Canvas } from './structures';

/** Direcciones (las nuestras y las de Java en el plano): 0 norte (−z), 1 este, 2 sur, 3 oeste. */
const N = 0, E = 1, S = 2, W = 3;

/** Azar de una mina (RandomSource: entero en [0, n), flotante y booleano). */
class MineRandom {
  private s: number;
  constructor(seed: number) {
    this.s = seed | 0;
  }
  private next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(n: number): number {
    return n <= 0 ? 0 : Math.floor(this.next() * n);
  }
  nextFloat(): number {
    return this.next();
  }
  nextDouble(): number {
    return this.next();
  }
  nextBoolean(): boolean {
    return this.next() < 0.5;
  }
}

type Kind = 'room' | 'corridor' | 'crossing' | 'stairs';

export interface MinePiece {
  kind: Kind;
  box: Box;
  /** Orientación (pasillos y escaleras); −1 las que usan coordenadas del mundo (sala y cruce). */
  dir: number;
  depth: number;
  /** Semilla propia de la pieza (lo que decide al dibujarse). */
  seed: number;
  rails?: boolean;
  spider?: boolean;
  sections?: number;
  /** Cruce: hacia dónde siguió y si tiene dos pisos. */
  cdir?: number;
  twoFloored?: boolean;
  /** Sala: las bocas de los pasillos que salen de ella. */
  entrances?: Box[];
}

export interface Mineshaft {
  x: number;
  y: number;
  z: number;
  mesa: boolean;
  pieces: MinePiece[];
  /** Caja que ocupa entera (para saber qué chunks toca). */
  bounds: Box;
}

// ------------------------------------------------------------------ piezas

class Builder {
  pieces: MinePiece[] = [];
  collides(b: Box): boolean {
    for (const p of this.pieces) if (p.box.intersects(b)) return true;
    return false;
  }
}

const move = (b: Box, x: number, y: number, z: number): Box => new Box(b.x0 + x, b.y0 + y, b.z0 + z, b.x1 + x, b.y1 + y, b.z1 + z);

function findCorridor(g: Builder, r: MineRandom, x: number, y: number, z: number, dir: number): Box | null {
  for (let len = r.nextInt(3) + 2; len > 0; len--) {
    const l = len * 5;
    const b = dir === S ? new Box(0, 0, 0, 2, 2, l - 1) : dir === W ? new Box(-(l - 1), 0, 0, 0, 2, 2)
      : dir === E ? new Box(0, 0, 0, l - 1, 2, 2) : new Box(0, 0, -(l - 1), 2, 2, 0);
    const box = move(b, x, y, z);
    if (!g.collides(box)) return box;
  }
  return null;
}

function findCrossing(g: Builder, r: MineRandom, x: number, y: number, z: number, dir: number): Box | null {
  const y1 = r.nextInt(4) === 0 ? 6 : 2;
  const b = dir === S ? new Box(-1, 0, 0, 3, y1, 4) : dir === W ? new Box(-4, 0, -1, 0, y1, 3)
    : dir === E ? new Box(0, 0, -1, 4, y1, 3) : new Box(-1, 0, -4, 3, y1, 0);
  const box = move(b, x, y, z);
  return g.collides(box) ? null : box;
}

function findStairs(g: Builder, x: number, y: number, z: number, dir: number): Box | null {
  const b = dir === S ? new Box(0, -5, 0, 2, 2, 8) : dir === W ? new Box(-8, -5, 0, 0, 2, 2)
    : dir === E ? new Box(0, -5, 0, 8, 2, 2) : new Box(0, -5, -8, 2, 2, 0);
  const box = move(b, x, y, z);
  return g.collides(box) ? null : box;
}

function randomPiece(g: Builder, r: MineRandom, x: number, y: number, z: number, dir: number, depth: number): MinePiece | null {
  const sel = r.nextInt(100);
  if (sel >= 80) {
    const box = findCrossing(g, r, x, y, z, dir);
    if (box) return { kind: 'crossing', box, dir: -1, depth, seed: 0, cdir: dir, twoFloored: box.y1 - box.y0 + 1 > 3 };
  } else if (sel >= 70) {
    const box = findStairs(g, x, y, z, dir);
    if (box) return { kind: 'stairs', box, dir, depth, seed: 0 };
  } else {
    const box = findCorridor(g, r, x, y, z, dir);
    if (box) {
      const rails = r.nextInt(3) === 0;
      const spider = !rails && r.nextInt(23) === 0;
      const sections = (dir === N || dir === S ? box.z1 - box.z0 + 1 : box.x1 - box.x0 + 1) / 5;
      return { kind: 'corridor', box, dir, depth, seed: 0, rails, spider, sections };
    }
  }
  return null;
}

/** generateAndAddPiece: una pieza nueva en (x, y, z) hacia `dir`, si cabe (8 niveles y 80 bloques como mucho). */
function addPiece(start: MinePiece, g: Builder, r: MineRandom, x: number, y: number, z: number, dir: number, depth: number): MinePiece | null {
  if (depth > 8) return null;
  if (Math.abs(x - start.box.x0) > 80 || Math.abs(z - start.box.z0) > 80) return null;
  const p = randomPiece(g, r, x, y, z, dir, depth + 1);
  if (p) {
    p.seed = (r.nextDouble() * 0x7fffffff) | 0;
    g.pieces.push(p);
    addChildren(p, start, g, r);
  }
  return p;
}

function addChildren(p: MinePiece, start: MinePiece, g: Builder, r: MineRandom): void {
  const b = p.box, d = p.depth;
  if (p.kind === 'room') {
    let hs = b.y1 - b.y0 + 1 - 3 - 1;
    if (hs <= 0) hs = 1;
    const xs = b.x1 - b.x0 + 1, zs = b.z1 - b.z0 + 1;
    const entrances = p.entrances!;
    const side = (span: number, place: (pos: number, y: number) => MinePiece | null, entrance: (c: Box) => Box) => {
      let pos = 0;
      while (pos < span) {
        pos += r.nextInt(span);
        if (pos + 3 > span) break;
        const child = place(pos, b.y0 + r.nextInt(hs) + 1);
        if (child) entrances.push(entrance(child.box));
        pos += 4;
      }
    };
    side(xs, (pos, y) => addPiece(start, g, r, b.x0 + pos, y, b.z0 - 1, N, d), (c) => new Box(c.x0, c.y0, b.z0, c.x1, c.y1, b.z0 + 1));
    side(xs, (pos, y) => addPiece(start, g, r, b.x0 + pos, y, b.z1 + 1, S, d), (c) => new Box(c.x0, c.y0, b.z1 - 1, c.x1, c.y1, b.z1));
    side(zs, (pos, y) => addPiece(start, g, r, b.x0 - 1, y, b.z0 + pos, W, d), (c) => new Box(b.x0, c.y0, c.z0, b.x0 + 1, c.y1, c.z1));
    side(zs, (pos, y) => addPiece(start, g, r, b.x1 + 1, y, b.z0 + pos, E, d), (c) => new Box(b.x1 - 1, c.y0, c.z0, b.x1, c.y1, c.z1));
    return;
  }
  if (p.kind === 'corridor') {
    const end = r.nextInt(4);
    const o = p.dir;
    const yy = () => b.y0 - 1 + r.nextInt(3);
    if (o === N) {
      if (end <= 1) addPiece(start, g, r, b.x0, yy(), b.z0 - 1, o, d);
      else if (end === 2) addPiece(start, g, r, b.x0 - 1, yy(), b.z0, W, d);
      else addPiece(start, g, r, b.x1 + 1, yy(), b.z0, E, d);
    } else if (o === S) {
      if (end <= 1) addPiece(start, g, r, b.x0, yy(), b.z1 + 1, o, d);
      else if (end === 2) addPiece(start, g, r, b.x0 - 1, yy(), b.z1 - 3, W, d);
      else addPiece(start, g, r, b.x1 + 1, yy(), b.z1 - 3, E, d);
    } else if (o === W) {
      if (end <= 1) addPiece(start, g, r, b.x0 - 1, yy(), b.z0, o, d);
      else if (end === 2) addPiece(start, g, r, b.x0, yy(), b.z0 - 1, N, d);
      else addPiece(start, g, r, b.x0, yy(), b.z1 + 1, S, d);
    } else {
      if (end <= 1) addPiece(start, g, r, b.x1 + 1, yy(), b.z0, o, d);
      else if (end === 2) addPiece(start, g, r, b.x1 - 3, yy(), b.z0 - 1, N, d);
      else addPiece(start, g, r, b.x1 - 3, yy(), b.z1 + 1, S, d);
    }
    if (d < 8) {
      if (o !== N && o !== S) {
        for (let x = b.x0 + 3; x + 3 <= b.x1; x += 5) {
          const sel = r.nextInt(5);
          if (sel === 0) addPiece(start, g, r, x, b.y0, b.z0 - 1, N, d + 1);
          else if (sel === 1) addPiece(start, g, r, x, b.y0, b.z1 + 1, S, d + 1);
        }
      } else {
        for (let z = b.z0 + 3; z + 3 <= b.z1; z += 5) {
          const sel = r.nextInt(5);
          if (sel === 0) addPiece(start, g, r, b.x0 - 1, b.y0, z, W, d + 1);
          else if (sel === 1) addPiece(start, g, r, b.x1 + 1, b.y0, z, E, d + 1);
        }
      }
    }
    return;
  }
  if (p.kind === 'crossing') {
    const c = p.cdir!;
    if (c === S) {
      addPiece(start, g, r, b.x0 + 1, b.y0, b.z1 + 1, S, d);
      addPiece(start, g, r, b.x0 - 1, b.y0, b.z0 + 1, W, d);
      addPiece(start, g, r, b.x1 + 1, b.y0, b.z0 + 1, E, d);
    } else if (c === W) {
      addPiece(start, g, r, b.x0 + 1, b.y0, b.z0 - 1, N, d);
      addPiece(start, g, r, b.x0 + 1, b.y0, b.z1 + 1, S, d);
      addPiece(start, g, r, b.x0 - 1, b.y0, b.z0 + 1, W, d);
    } else if (c === E) {
      addPiece(start, g, r, b.x0 + 1, b.y0, b.z0 - 1, N, d);
      addPiece(start, g, r, b.x0 + 1, b.y0, b.z1 + 1, S, d);
      addPiece(start, g, r, b.x1 + 1, b.y0, b.z0 + 1, E, d);
    } else {
      addPiece(start, g, r, b.x0 + 1, b.y0, b.z0 - 1, N, d);
      addPiece(start, g, r, b.x0 - 1, b.y0, b.z0 + 1, W, d);
      addPiece(start, g, r, b.x1 + 1, b.y0, b.z0 + 1, E, d);
    }
    if (p.twoFloored) {
      if (r.nextBoolean()) addPiece(start, g, r, b.x0 + 1, b.y0 + 4, b.z0 - 1, N, d);
      if (r.nextBoolean()) addPiece(start, g, r, b.x0 - 1, b.y0 + 4, b.z0 + 1, W, d);
      if (r.nextBoolean()) addPiece(start, g, r, b.x1 + 1, b.y0 + 4, b.z0 + 1, E, d);
      if (r.nextBoolean()) addPiece(start, g, r, b.x0 + 1, b.y0 + 4, b.z1 + 1, S, d);
    }
    return;
  }
  // Escaleras: siguen en su dirección desde lo más bajo.
  const o = p.dir;
  if (o === S) addPiece(start, g, r, b.x0, b.y0, b.z1 + 1, S, d);
  else if (o === W) addPiece(start, g, r, b.x0 - 1, b.y0, b.z0, W, d);
  else if (o === E) addPiece(start, g, r, b.x1 + 1, b.y0, b.z0, E, d);
  else addPiece(start, g, r, b.x0, b.y0, b.z0 - 1, N, d);
}

const mineCache = new Map<string, Mineshaft | null>();

/** Lo que el generador sabe del sitio: bioma de las badlands, el Deep Dark y la superficie. */
export interface MineSite {
  seed: number;
  isBadlands(x: number, z: number): boolean;
  isDeepDark(x: number, y: number, z: number): boolean;
  surface(x: number, z: number): number;
}

/** Mina que empieza en el chunk (cx, cz), si la hay. */
export function mineshaftAt(site: MineSite, cx: number, cz: number): Mineshaft | null {
  const key = `${site.seed}:${cx},${cz}`;
  const cached = mineCache.get(key);
  if (cached !== undefined) return cached;
  if (mineCache.size > 8000) mineCache.clear();
  let m: Mineshaft | null = null;
  // random_spread con frecuencia 0,004 (legacy_type_3): una tirada por chunk.
  if (hashToFloat(hash2(cx, cz, site.seed ^ 0x3a1e5)) < 0.004) m = buildMineshaft(site, cx, cz);
  mineCache.set(key, m);
  return m;
}

function buildMineshaft(site: MineSite, cx: number, cz: number): Mineshaft | null {
  const r = new MineRandom(hash2(cx, cz, site.seed ^ 0x5a17e));
  r.nextDouble();
  const mesa = site.isBadlands(cx * 16 + 8, cz * 16);
  // MineShaftRoom en (chunk x + 2, 50, chunk z + 2).
  const west = cx * 16 + 2, north = cz * 16 + 2;
  const room: MinePiece = {
    kind: 'room', dir: -1, depth: 0, seed: 0, entrances: [],
    box: new Box(west, 50, north, west + 7 + r.nextInt(6), 54 + r.nextInt(6), north + 7 + r.nextInt(6)),
  };
  room.seed = (r.nextDouble() * 0x7fffffff) | 0;
  const g = new Builder();
  g.pieces.push(room);
  addChildren(room, room, g, r);
  // Caja de todo.
  let bx0 = Infinity, by0 = Infinity, bz0 = Infinity, bx1 = -Infinity, by1 = -Infinity, bz1 = -Infinity;
  for (const p of g.pieces) {
    bx0 = Math.min(bx0, p.box.x0); by0 = Math.min(by0, p.box.y0); bz0 = Math.min(bz0, p.box.z0);
    bx1 = Math.max(bx1, p.box.x1); by1 = Math.max(by1, p.box.y1); bz1 = Math.max(bz1, p.box.z1);
  }
  let dy: number;
  if (mesa) {
    // Las de las badlands: el centro, entre el nivel del mar y la superficie.
    const cxm = Math.floor((bx0 + bx1) / 2), czm = Math.floor((bz0 + bz1) / 2), cym = Math.floor((by0 + by1) / 2);
    const surface = site.surface(cxm, czm);
    const target = surface <= SEA_LEVEL ? SEA_LEVEL : SEA_LEVEL + r.nextInt(surface - SEA_LEVEL + 1);
    dy = target - cym;
  } else {
    // moveBelowSeaLevel(mar, fondo, azar, 10): que acabe por debajo de y = 53.
    const maxY = SEA_LEVEL - 10;
    let y = by1 - by0 + 1 + MIN_Y + 1;
    if (y < maxY) y += r.nextInt(maxY - y);
    dy = y - by1;
  }
  const pieces = g.pieces.map((p) => ({ ...p, box: move(p.box, 0, dy, 0), entrances: p.entrances?.map((e) => move(e, 0, dy, 0)) }));
  const start = pieces[0].box;
  // En el Deep Dark (mineshaft_blocking) no empieza.
  if (site.isDeepDark(start.x0, start.y0, start.z0)) return null;
  return { x: start.x0, y: start.y0, z: start.z0, mesa, pieces, bounds: new Box(bx0, by0 + dy, bz0, bx1, by1 + dy, bz1) };
}

/** Minas cuyas piezas pueden tocar el chunk (cx, cz) (empiezan a 6 chunks como mucho). */
export function mineshaftsNear(site: MineSite, cx: number, cz: number): Mineshaft[] {
  const out: Mineshaft[] = [];
  const x0 = cx * 16, z0 = cz * 16;
  for (let dz = -6; dz <= 6; dz++) {
    for (let dx = -6; dx <= 6; dx++) {
      const m = mineshaftAt(site, cx + dx, cz + dz);
      if (m && m.bounds.x1 >= x0 && m.bounds.x0 <= x0 + 15 && m.bounds.z1 >= z0 && m.bounds.z0 <= z0 + 15) out.push(m);
    }
  }
  return out;
}

// ------------------------------------------------------------------ dibujo

/** Lo que el dibujo necesita del sitio además del lienzo: la superficie (para isInterior) y el agua de fuera. */
export interface MineDrawSite {
  /** y del bloque más alto que no es aire ni fluido de la columna (heightmap OCEAN_FLOOR_WG − 1). */
  floorTop(x: number, z: number): number;
  /** ¿Hay agua o lava generada en (x, y, z)? (fuera del chunk). */
  fluidOutside(x: number, y: number, z: number): boolean;
  isDeepDark(x: number, y: number, z: number): boolean;
}

/** Vagoneta con cofre de una mina (la crea el servidor al cargar el chunk, con el botín de la mina). */
export interface MineCart {
  x: number;
  y: number;
  z: number;
}

class MineDrawer {
  private readonly planks: number;
  private readonly wood: number;
  private readonly fence: number;
  constructor(private c: Canvas, private p: MinePiece, private m: Mineshaft, private site: MineDrawSite, private carts: MineCart[]) {
    this.planks = m.mesa ? DARK_OAK_PLANKS : OAK_PLANKS;
    this.wood = m.mesa ? DARK_OAK_LOG : OAK_LOG;
    this.fence = m.mesa ? FENCES.dark_oak : FENCES.oak;
  }

  // Coordenadas locales → mundo (getWorldX/Y/Z; sin orientación, son las del mundo).
  wx(x: number, z: number): number {
    const b = this.p.box, d = this.p.dir;
    return d < 0 ? x : d === W ? b.x1 - z : d === E ? b.x0 + z : b.x0 + x;
  }
  wy(y: number): number {
    return this.p.dir < 0 ? y : this.p.box.y0 + y;
  }
  wz(x: number, z: number): number {
    const b = this.p.box, d = this.p.dir;
    return d < 0 ? z : d === N ? b.z1 - z : d === S ? b.z0 + z : b.z0 + x;
  }

  /** Azar fijo de una celda local (lo que Java tira al dibujar, aquí según la posición). */
  chance(x: number, y: number, z: number, salt: number): number {
    return hashToFloat(hash3(this.wx(x, z) * 31 + salt, this.wy(y), this.wz(x, z), this.p.seed));
  }

  /** getBlock: lo que hay en una celda local (aire fuera del chunk). */
  get(x: number, y: number, z: number): number {
    const b = this.c.get(this.wx(x, z), this.wy(y), this.wz(x, z));
    return b < 0 ? AIR : b;
  }

  private isOwn(id: number): boolean {
    return id === this.planks || id === this.wood || id === this.fence || id === IRON_CHAIN;
  }

  /** placeBlock con canBeReplaced de las minas: no pisa los tablones, troncos, vallas ni cadenas de otra pieza. */
  place(id: number, x: number, y: number, z: number): void {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z)) return;
    if (this.isOwn(this.c.get(X, Y, Z))) return;
    this.c.set(X, Y, Z, id);
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number): void {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) this.place(id, x, y, z);
  }

  /** isInterior: la celda de encima está por debajo de la superficie (sin contar el agua). */
  interior(x: number, y: number, z: number): boolean {
    const X = this.wx(x, z), Y = this.wy(y + 1), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z)) return false;
    return Y <= this.site.floorTop(X, Z);
  }

  private sturdy(id: number): boolean {
    return id > 0 && BLOCK_COLLIDE[id] === 1 && BLOCK_SOLID[id] === 1;
  }

  /** isReplaceableByStructures: aire, fluidos, liquen y praderas marinas. */
  private replaceable(id: number): boolean {
    return id === AIR || (id > 0 && BLOCK_FLUID[id] > 0) || isGlowLichen(id) || (id >= SEAGRASS && id < SEAGRASS + 4);
  }

  /** setPlanksBlock: tablones donde el suelo no aguanta (dentro del terreno). */
  planksAt(x: number, y: number, z: number): void {
    if (!this.interior(x, y, z)) return;
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z)) return;
    if (!this.sturdy(this.c.get(X, Y, Z))) this.c.set(X, Y, Z, this.planks);
  }

  /** isInInvalidLocation: la caja ampliada un bloque (recortada al chunk) toca un líquido, o está en el Deep Dark. */
  invalid(): boolean {
    const b = this.p.box, c = this.c;
    const X0 = c.x0, X1 = c.x0 + 15, Z0 = c.z0, Z1 = c.z0 + 15;
    const x0 = Math.max(b.x0 - 1, X0), x1 = Math.min(b.x1 + 1, X1);
    const z0 = Math.max(b.z0 - 1, Z0), z1 = Math.min(b.z1 + 1, Z1);
    const y0 = b.y0 - 1, y1 = b.y1 + 1;
    if (x0 > x1 || z0 > z1) return true;
    if (this.site.isDeepDark((x0 + x1) >> 1, (y0 + y1) >> 1, (z0 + z1) >> 1)) return true;
    const liquid = (x: number, y: number, z: number) => {
      const id = c.get(x, y, z);
      return id > 0 && BLOCK_FLUID[id] > 0;
    };
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (liquid(x, y0, z) || liquid(x, y1, z)) return true;
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (liquid(x, y, z0) || liquid(x, y, z1)) return true;
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) if (liquid(x0, y, z) || liquid(x1, y, z)) return true;
    // Además, el agua que el generador deja al otro lado de los bordes del chunk (en Java se queda como pared).
    const out = (x: number, y: number, z: number) => this.site.fluidOutside(x, y, z);
    for (let y = y0; y <= y1; y++) {
      if (b.x0 - 1 < X0) for (let z = z0; z <= z1; z++) if (out(X0 - 1, y, z)) return true;
      if (b.x1 + 1 > X1) for (let z = z0; z <= z1; z++) if (out(X1 + 1, y, z)) return true;
      if (b.z0 - 1 < Z0) for (let x = x0; x <= x1; x++) if (out(x, y, Z0 - 1)) return true;
      if (b.z1 + 1 > Z1) for (let x = x0; x <= x1; x++) if (out(x, y, Z1 + 1)) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- piezas

  room(): void {
    const b = this.p.box;
    this.box(b.x0, b.y0 + 1, b.z0, b.x1, Math.min(b.y0 + 3, b.y1), b.z1, AIR);
    for (const e of this.p.entrances ?? []) this.box(e.x0, e.y1 - 2, e.z0, e.x1, e.y1, e.z1, AIR);
    // generateUpperHalfSphere del techo.
    const x0 = b.x0, y0 = b.y0 + 4, z0 = b.z0, x1 = b.x1, y1 = b.y1, z1 = b.z1;
    const dx = x1 - x0 + 1, dyy = y1 - y0 + 1, dz = z1 - z0 + 1;
    const cx = x0 + dx / 2, cz = z0 + dz / 2;
    for (let y = y0; y <= y1; y++) {
      const ny = (y - y0) / dyy;
      for (let x = x0; x <= x1; x++) {
        const nx = (x - cx) / (dx * 0.5);
        for (let z = z0; z <= z1; z++) {
          const nz = (z - cz) / (dz * 0.5);
          if (nx * nx + ny * ny + nz * nz <= 1.05) this.place(AIR, x, y, z);
        }
      }
    }
  }

  corridor(): void {
    const p = this.p;
    const n = p.sections!;
    const len = n * 5 - 1;
    this.box(0, 0, 0, 2, 1, len, AIR);
    // generateMaybeBox 0,8 de la fila de arriba.
    for (let x = 0; x <= 2; x++) for (let z = 0; z <= len; z++) if (this.chance(x, 2, z, 1) <= 0.8) this.place(AIR, x, 2, z);
    if (p.spider) {
      // Pasillo de arañas: telarañas por el 60 % de lo de dentro.
      for (let y = 0; y <= 1; y++) for (let x = 0; x <= 2; x++) for (let z = 0; z <= len; z++) {
        if (this.chance(x, y, z, 2) <= 0.6 && this.interior(x, y, z)) {
          const edge = y === 0 || y === 1 || x === 0 || x === 2 || z === 0 || z === len;
          this.place(edge ? COBWEB : AIR, x, y, z);
        }
      }
    }
    const spiderSection = p.spider ? p.seed % n : -1;
    for (let s = 0; s < n; s++) {
      const z = 2 + s * 5;
      this.support(z, s);
      this.maybeCobweb(0.1, 0, 2, z - 1, 3);
      this.maybeCobweb(0.1, 2, 2, z - 1, 4);
      this.maybeCobweb(0.1, 0, 2, z + 1, 5);
      this.maybeCobweb(0.1, 2, 2, z + 1, 6);
      this.maybeCobweb(0.05, 0, 2, z - 2, 7);
      this.maybeCobweb(0.05, 2, 2, z - 2, 8);
      this.maybeCobweb(0.05, 0, 2, z + 2, 9);
      this.maybeCobweb(0.05, 2, 2, z + 2, 10);
      if (this.chance(0, 0, z, 11) < 0.01) this.cart(2, 0, z - 1);
      if (this.chance(0, 0, z, 12) < 0.01) this.cart(0, 0, z + 1);
      if (s === spiderSection) {
        const nz = z - 1 + ((p.seed >>> 5) % 3);
        if (this.interior(1, 0, nz)) this.place(MOB_SPAWNER, 1, 0, nz);
      }
    }
    for (let x = 0; x <= 2; x++) for (let z = 0; z <= len; z++) this.planksAt(x, -1, z);
    this.doubleSupport(0, -1, 2);
    if (n > 1) this.doubleSupport(0, -1, len - 2);
    if (p.rails) {
      const rail = stateOf(RAIL, { shape: p.dir === E || p.dir === W ? RAIL_EW : RAIL_NS });
      for (let z = 0; z <= len; z++) {
        const floor = this.get(1, -1, z);
        if (floor !== AIR && this.sturdy(floor)) {
          const prob = this.interior(1, 0, z) ? 0.7 : 0.9;
          if (this.chance(1, 0, z, 13) < prob) this.place(rail, 1, 0, z);
        }
      }
    }
  }

  /** createChest de los pasillos: un raíl con una vagoneta con cofre encima (donde hay aire con suelo). */
  private cart(x: number, y: number, z: number): void {
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y, Z) || this.c.get(X, Y, Z) !== AIR || this.c.get(X, Y - 1, Z) === AIR) return;
    const shape = this.chance(x, y, z, 14) < 0.5 ? RAIL_NS : RAIL_EW;
    this.place(stateOf(RAIL, { shape }), x, y, z);
    this.carts.push({ x: X + 0.5, y: Y + 0.5, z: Z + 0.5 });
  }

  private maybeCobweb(prob: number, x: number, y: number, z: number, salt: number): void {
    if (!this.interior(x, y, z) || this.chance(x, y, z, salt) >= prob) return;
    // hasSturdyNeighbours: al menos dos caras firmes alrededor.
    const X = this.wx(x, z), Y = this.wy(y), Z = this.wz(x, z);
    let n = 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (this.sturdy(this.c.get(X + dx, Y + dy, Z + dz)) && ++n >= 2) break;
    }
    if (n >= 2) this.place(COBWEB, x, y, z);
  }

  /** placeSupport: dos postes de valla y una viga de tablones (o sólo los extremos), con alguna antorcha. */
  private support(z: number, s: number): void {
    for (let x = 0; x <= 2; x++) if (this.get(x, 3, z) === AIR) return; // isSupportingBox
    this.box(0, 0, z, 0, 1, z, this.fence);
    this.box(2, 0, z, 2, 1, z, this.fence);
    if (this.chance(0, 2, z, 20 + s) < 0.25) {
      this.place(this.planks, 0, 2, z);
      this.place(this.planks, 2, 2, z);
    } else {
      this.box(0, 2, z, 2, 2, z, this.planks);
      if (this.chance(1, 2, z - 1, 30) < 0.05) this.place(stateOf(WALL_TORCH, { facing: turn(this.p.dir, S) }), 1, 2, z - 1);
      if (this.chance(1, 2, z + 1, 31) < 0.05) this.place(stateOf(WALL_TORCH, { facing: turn(this.p.dir, N) }), 1, 2, z + 1);
    }
  }

  /** placeDoubleLowerOrUpperSupport: bajo los tablones del suelo, un pilar de troncos o una cadena al techo. */
  private doubleSupport(x: number, y: number, z: number): void {
    if (this.get(x, y, z) === this.planks) this.pillar(x, y, z);
    if (this.get(x + 2, y, z) === this.planks) this.pillar(x + 2, y, z);
  }

  private pillar(x: number, y: number, z: number): void {
    const X = this.wx(x, z), Y0 = this.wy(y), Z = this.wz(x, z);
    if (!this.c.inside(X, Y0, Z)) return;
    let below = true, above = true;
    for (let d = 1; below || above; d++) {
      if (below) {
        const id = this.c.get(X, Y0 - d, Z);
        const empty = id < 0 ? false : this.replaceable(id) && !(id > 0 && BLOCK_FLUID[id] === 2);
        if (!empty && this.sturdy(id)) {
          for (let yy = Y0 - d + 1; yy < Y0; yy++) this.c.set(X, yy, Z, this.wood);
          return;
        }
        below = d <= 20 && empty && Y0 - d > MIN_Y + 1;
      }
      if (above) {
        const id = this.c.get(X, Y0 + d, Z);
        const empty = id >= 0 && this.replaceable(id);
        if (!empty && this.sturdy(id)) {
          this.c.set(X, Y0 + 1, Z, this.fence);
          for (let yy = Y0 + 2; yy < Y0 + d; yy++) this.c.set(X, yy, Z, IRON_CHAIN);
          return;
        }
        above = d <= 50 && empty;
      }
    }
  }

  crossing(): void {
    const b = this.p.box;
    if (this.p.twoFloored) {
      this.box(b.x0 + 1, b.y0, b.z0, b.x1 - 1, b.y0 + 2, b.z1, AIR);
      this.box(b.x0, b.y0, b.z0 + 1, b.x1, b.y0 + 2, b.z1 - 1, AIR);
      this.box(b.x0 + 1, b.y1 - 2, b.z0, b.x1 - 1, b.y1, b.z1, AIR);
      this.box(b.x0, b.y1 - 2, b.z0 + 1, b.x1, b.y1, b.z1 - 1, AIR);
      this.box(b.x0 + 1, b.y0 + 3, b.z0 + 1, b.x1 - 1, b.y0 + 3, b.z1 - 1, AIR);
    } else {
      this.box(b.x0 + 1, b.y0, b.z0, b.x1 - 1, b.y1, b.z1, AIR);
      this.box(b.x0, b.y0, b.z0 + 1, b.x1, b.y1, b.z1 - 1, AIR);
    }
    for (const [x, z] of [[b.x0 + 1, b.z0 + 1], [b.x0 + 1, b.z1 - 1], [b.x1 - 1, b.z0 + 1], [b.x1 - 1, b.z1 - 1]]) {
      if (this.get(x, b.y1 + 1, z) !== AIR) this.box(x, b.y0, z, x, b.y1, z, this.planks);
    }
    for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) this.planksAt(x, b.y0 - 1, z);
  }

  stairs(): void {
    this.box(0, 5, 0, 2, 7, 1, AIR);
    this.box(0, 0, 7, 2, 2, 8, AIR);
    for (let i = 0; i < 5; i++) this.box(0, 5 - i - (i < 4 ? 1 : 0), 2 + i, 2, 7 - i, 2 + i, AIR);
  }
}

/** Dibuja en el lienzo del chunk las piezas de una mina que lo tocan; devuelve sus vagonetas con cofre. */
export function drawMineshaft(c: Canvas, m: Mineshaft, site: MineDrawSite, carts: MineCart[]): void {
  for (const p of m.pieces) {
    const b = p.box;
    if (b.x1 < c.x0 - 1 || b.x0 > c.x0 + 16 || b.z1 < c.z0 - 1 || b.z0 > c.z0 + 16) continue;
    const d = new MineDrawer(c, p, m, site, carts);
    if (d.invalid()) continue;
    if (p.kind === 'room') d.room();
    else if (p.kind === 'corridor') d.corridor();
    else if (p.kind === 'crossing') d.crossing();
    else d.stairs();
  }
}
