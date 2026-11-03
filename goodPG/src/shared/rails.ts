// Fase 7 (transporte): reglas de los raíles compartidas por el cliente (predicción) y el servidor.
// - Salidas de cada forma (por dónde entra y sale una vagoneta).
// - Colocación: el raíl nuevo se une solo a los vecinos que aún tienen un extremo libre y éstos se
//   tuercen o se ponen en cuesta hacia él (el algoritmo de RailState de Minecraft).
// - Potencia de los propulsores y activadores: un raíl encendido directamente (gancho `direct`) enciende
//   hasta 8 raíles del mismo tipo unidos a él en línea, como en Minecraft.
import {
  RAIL_SHAPE, RAIL_KIND, RAIL_PLAIN, RAIL_POWERED, RAIL_ACTIVATOR, RAIL_NS, RAIL_EW, RAIL_ASC_E, RAIL_ASC_W, RAIL_ASC_N,
  RAIL_ASC_S, RAIL_SE, RAIL_SW, RAIL_NW, RAIL_NE, isRail, railIsPowered, railState, RAIL_BASES, familyBase,
} from './blocks';

export type RailGet = (x: number, y: number, z: number) => number;
export type RailEdit = [number, number, number, number];

/**
 * Salidas de cada forma, [dx, dy, dz] desde el centro del bloque (dy = -1: ese extremo es el bajo de
 * una cuesta, medido desde lo alto). Igual que en Minecraft.
 */
export const RAIL_EXITS: readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[] = [
  [[0, 0, -1], [0, 0, 1]], // norte-sur
  [[-1, 0, 0], [1, 0, 0]], // este-oeste
  [[-1, -1, 0], [1, 0, 0]], // sube hacia el este
  [[-1, 0, 0], [1, -1, 0]], // sube hacia el oeste
  [[0, 0, -1], [0, -1, 1]], // sube hacia el norte
  [[0, -1, -1], [0, 0, 1]], // sube hacia el sur
  [[0, 0, 1], [1, 0, 0]], // sur-este
  [[0, 0, 1], [-1, 0, 0]], // sur-oeste
  [[0, 0, -1], [-1, 0, 0]], // norte-oeste
  [[0, 0, -1], [1, 0, 0]], // norte-este
];

/** Celdas vecinas con las que se une cada forma (las cuestas, con la de arriba en el lado alto). */
function connectionsOf(shape: number, x: number, y: number, z: number): [number, number, number][] {
  switch (shape) {
    case RAIL_NS: return [[x, y, z - 1], [x, y, z + 1]];
    case RAIL_EW: return [[x - 1, y, z], [x + 1, y, z]];
    case RAIL_ASC_E: return [[x - 1, y, z], [x + 1, y + 1, z]];
    case RAIL_ASC_W: return [[x - 1, y + 1, z], [x + 1, y, z]];
    case RAIL_ASC_N: return [[x, y + 1, z - 1], [x, y, z + 1]];
    case RAIL_ASC_S: return [[x, y, z - 1], [x, y + 1, z + 1]];
    case RAIL_SE: return [[x + 1, y, z], [x, y, z + 1]];
    case RAIL_SW: return [[x - 1, y, z], [x, y, z + 1]];
    case RAIL_NW: return [[x - 1, y, z], [x, y, z - 1]];
    default: return [[x + 1, y, z], [x, y, z - 1]];
  }
}

/** Mundo de trabajo: lee del mundo real y guarda los cambios aparte (se devuelven como ediciones). */
class Overlay {
  readonly changed = new Map<string, RailEdit>();
  constructor(private base: RailGet) {}
  get(x: number, y: number, z: number): number {
    return this.changed.get(`${x},${y},${z}`)?.[3] ?? this.base(x, y, z);
  }
  set(x: number, y: number, z: number, id: number): void {
    this.changed.set(`${x},${y},${z}`, [x, y, z, id]);
  }
}

/** Un raíl con sus uniones (RailState de Minecraft). */
class RailNode {
  conns: [number, number, number][];
  readonly kind: number;
  readonly straight: boolean;
  constructor(private w: Overlay, readonly x: number, readonly y: number, readonly z: number, public id: number) {
    this.kind = RAIL_KIND[id];
    this.straight = this.kind !== RAIL_PLAIN;
    this.conns = connectionsOf(RAIL_SHAPE[id], x, y, z);
  }

  get shape(): number {
    return RAIL_SHAPE[this.id];
  }

  /** ¿Tiene una unión con la columna (x, z)? */
  has(x: number, z: number): boolean {
    return this.conns.some((c) => c[0] === x && c[2] === z);
  }

  connectsTo(o: RailNode): boolean {
    return this.has(o.x, o.z);
  }

  canConnectTo(o: RailNode): boolean {
    return this.connectsTo(o) || this.conns.length !== 2;
  }

  /** Olvida las uniones con celdas que ya no le devuelven la unión. */
  removeSoft(): void {
    this.conns = this.conns.filter((c) => {
      const r = railNear(this.w, c[0], c[1], c[2]);
      return !!r && r.connectsTo(this);
    });
  }

  private hasNeighbor(x: number, y: number, z: number): boolean {
    const r = railNear(this.w, x, y, z);
    if (!r) return false;
    r.removeSoft();
    return r.canConnectTo(this);
  }

  private setShape(shape: number): void {
    this.id = railState(this.kind, shape, this.kind !== RAIL_PLAIN && railIsPowered(this.id));
    this.conns = connectionsOf(shape, this.x, this.y, this.z);
    this.w.set(this.x, this.y, this.z, this.id);
  }

  /** Recto → en cuesta si hay un raíl arriba en uno de sus extremos. */
  private slope(shape: number): number {
    const { x, y, z, w } = this;
    if (shape === RAIL_NS) {
      if (isRail(w.get(x, y + 1, z - 1))) shape = RAIL_ASC_N;
      if (isRail(w.get(x, y + 1, z + 1))) shape = RAIL_ASC_S;
    } else if (shape === RAIL_EW) {
      if (isRail(w.get(x + 1, y + 1, z))) shape = RAIL_ASC_E;
      if (isRail(w.get(x - 1, y + 1, z))) shape = RAIL_ASC_W;
    }
    return shape;
  }

  /**
   * Coloca el raíl eligiendo su forma según los vecinos libres y tuerce a éstos hacia él. `powered`: el
   * raíl recibe potencia (en un cruce en T cambia hacia qué lado tuerce, como en Minecraft).
   */
  place(fallback: number, powered = false): void {
    const { x, y, z } = this;
    const n = this.hasNeighbor(x, y, z - 1), s = this.hasNeighbor(x, y, z + 1);
    const wv = this.hasNeighbor(x - 1, y, z), e = this.hasNeighbor(x + 1, y, z);
    const ns = n || s, ew = wv || e;
    let shape = -1;
    if (ns && !ew) shape = RAIL_NS;
    if (ew && !ns) shape = RAIL_EW;
    const se = s && e, sw = s && wv, ne = n && e, nw = n && wv;
    if (!this.straight) {
      if (se && !n && !wv) shape = RAIL_SE;
      if (sw && !n && !e) shape = RAIL_SW;
      if (nw && !s && !e) shape = RAIL_NW;
      if (ne && !s && !wv) shape = RAIL_NE;
    }
    if (shape < 0) {
      if (ns && ew) shape = fallback;
      else if (ns) shape = RAIL_NS;
      else if (ew) shape = RAIL_EW;
      if (!this.straight) {
        // Cruce en T: sin potencia manda el sur y el este; con potencia, el norte y el oeste (Minecraft).
        if (powered) {
          if (se) shape = RAIL_SE;
          if (sw) shape = RAIL_SW;
          if (ne) shape = RAIL_NE;
          if (nw) shape = RAIL_NW;
        } else {
          if (nw) shape = RAIL_NW;
          if (ne) shape = RAIL_NE;
          if (sw) shape = RAIL_SW;
          if (se) shape = RAIL_SE;
        }
      }
    }
    if (shape < 0) shape = fallback;
    this.setShape(this.slope(shape));
    for (const c of [...this.conns]) {
      const r = railNear(this.w, c[0], c[1], c[2]);
      if (!r) continue;
      r.removeSoft();
      if (r.canConnectTo(this)) r.connectTo(this);
    }
  }

  /** Se une a `o` (que acaba de colocarse) y cambia de forma para mirarlo. */
  connectTo(o: RailNode): void {
    this.conns.push([o.x, o.y, o.z]);
    const { x, z } = this;
    const n = this.has(x, z - 1), s = this.has(x, z + 1), wv = this.has(x - 1, z), e = this.has(x + 1, z);
    let shape = -1;
    if (n || s) shape = RAIL_NS;
    if (wv || e) shape = RAIL_EW;
    if (!this.straight) {
      if (s && e && !n && !wv) shape = RAIL_SE;
      if (s && wv && !n && !e) shape = RAIL_SW;
      if (n && wv && !s && !e) shape = RAIL_NW;
      if (n && e && !s && !wv) shape = RAIL_NE;
    }
    if (shape < 0) shape = RAIL_NS;
    this.setShape(this.slope(shape));
  }
}

/** El raíl de la celda o, si no, el de justo encima o debajo (como getRail de Minecraft). */
function railNear(w: Overlay, x: number, y: number, z: number): RailNode | null {
  for (const dy of [0, 1, -1]) {
    const id = w.get(x, y + dy, z);
    if (isRail(id)) return new RailNode(w, x, y + dy, z, id);
  }
  return null;
}

/** ¿Es un bloque base de raíl (el que se obtiene como objeto)? */
export function isRailItem(block: number): boolean {
  return Object.values(RAIL_BASES).includes(familyBase(block));
}

/**
 * Colocar un raíl de la familia `base` en (x, y, z) mirando hacia `facing` (0 N, 1 E, 2 S, 3 O): el raíl
 * y los vecinos que se tuercen hacia él. null si no hay suelo firme debajo.
 */
export function planRail(
  get: RailGet, x: number, y: number, z: number, base: number, facing: number, firm: (id: number) => boolean, powered = false,
): RailEdit[] | null {
  if (!firm(get(x, y - 1, z))) return null;
  const kind = RAIL_KIND[base];
  const w = new Overlay(get);
  const fallback = facing === 1 || facing === 3 ? RAIL_EW : RAIL_NS;
  const id = railState(kind, fallback);
  w.set(x, y, z, id);
  new RailNode(w, x, y, z, id).place(fallback, powered);
  return [...w.changed.values()];
}

/**
 * Para la redstone: el raíl normal de (x, y, z) que está en un cruce en T vuelve a elegir su forma
 * con o sin potencia (en Minecraft, dar potencia a un cruce lo cambia de lado). Devuelve los cambios.
 */
export function replanJunction(get: RailGet, x: number, y: number, z: number, powered: boolean): RailEdit[] {
  const id = get(x, y, z);
  if (!isRail(id) || RAIL_KIND[id] !== RAIL_PLAIN) return [];
  const w = new Overlay(get);
  new RailNode(w, x, y, z, id).place(RAIL_SHAPE[id], powered);
  return [...w.changed.values()].filter(([a, b, c, v]) => get(a, b, c) !== v);
}

// ------------------------------------------------------------------ potencia

/** Vecinos unidos de un raíl del mismo tipo (para repartir la potencia a lo largo de la vía). */
function linked(get: RailGet, x: number, y: number, z: number): [number, number, number][] {
  const id = get(x, y, z);
  const shape = RAIL_SHAPE[id];
  if (shape < 0) return [];
  const w = new Overlay(get);
  const self = new RailNode(w, x, y, z, id);
  const out: [number, number, number][] = [];
  for (const c of self.conns) {
    const r = railNear(w, c[0], c[1], c[2]);
    if (r && r.kind === self.kind && r.connectsTo(self)) out.push([r.x, r.y, r.z]);
  }
  return out;
}

/**
 * Recalcula el encendido de los propulsores o activadores unidos a (x, y, z): cada uno está encendido si
 * él mismo o uno de los 8 siguientes de la vía recibe potencia (`direct`). Devuelve los cambios de los
 * raíles que están a 8 o menos de (x, y, z) (los demás no pueden haber cambiado).
 */
export function railPowerEdits(get: RailGet, x: number, y: number, z: number, direct: RailGet): RailEdit[] {
  const kind = RAIL_KIND[get(x, y, z)];
  if (kind !== RAIL_POWERED && kind !== RAIL_ACTIVATOR) return [];
  const key = (a: number, b: number, c: number) => `${a},${b},${c}`;
  // Tramo de vía hasta 16 raíles a cada lado.
  const dist = new Map<string, number>([[key(x, y, z), 0]]);
  const cells: [number, number, number][] = [[x, y, z]];
  for (let i = 0; i < cells.length; i++) {
    const [cx, cy, cz] = cells[i];
    const d = dist.get(key(cx, cy, cz))!;
    if (d >= 16) continue;
    for (const n of linked(get, cx, cy, cz)) {
      const k = key(n[0], n[1], n[2]);
      if (dist.has(k)) continue;
      dist.set(k, d + 1);
      cells.push(n);
    }
  }
  // Distancia a la fuente más cercana (en raíles).
  const src = new Map<string, number>();
  const queue: [number, number, number][] = [];
  for (const c of cells) {
    if (direct(c[0], c[1], c[2])) {
      src.set(key(c[0], c[1], c[2]), 0);
      queue.push(c);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const [cx, cy, cz] = queue[i];
    const d = src.get(key(cx, cy, cz))!;
    if (d >= 8) continue;
    for (const n of linked(get, cx, cy, cz)) {
      const k = key(n[0], n[1], n[2]);
      if (src.has(k) || !dist.has(k)) continue;
      src.set(k, d + 1);
      queue.push(n);
    }
  }
  const out: RailEdit[] = [];
  for (const c of cells) {
    const k = key(c[0], c[1], c[2]);
    if (dist.get(k)! > 8) continue;
    const id = get(c[0], c[1], c[2]);
    const on = src.has(k);
    if (on !== railIsPowered(id)) out.push([c[0], c[1], c[2], railState(kind, RAIL_SHAPE[id], on)]);
  }
  return out;
}
