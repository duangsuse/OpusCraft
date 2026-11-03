// Búsqueda de caminos A* para criaturas terrestres sobre la rejilla de bloques.
import { BLOCK_SOLID, BLOCK_FLUID, BLOCK_WALKTHROUGH, BLOCK_TALL } from '../blocks';
import { DIRT_PATH } from '../blocks'; // Fase 6.5 (materiales)
import { isFire, SOUL_FIRE, familyBase } from '../blocks'; // Fase 8.3 (criaturas del Nether)
import type { BlockGetter } from './physics';
import { posKey } from './posKey';

export type PathNode = [number, number, number];

/**
 * Fase 8.3 (criaturas del Nether): opciones de la búsqueda, como las penalizaciones de camino de Java.
 * - lavaFloor: la superficie de la lava también sirve de suelo (el strider camina por encima).
 * - avoidFire: no cruza el fuego y evita pasar a su lado (los piglins: FIRE −1, FIRE_IN_NEIGHBOR 16).
 * - cost: coste extra de pisar la celda (x, y, z) (Infinity: no se pisa).
 */
export interface PathOpts {
  lavaFloor?: boolean;
  avoidFire?: boolean;
  cost?: (x: number, y: number, z: number) => number;
}

/** Fuego (normal o de alma) en esa celda. */
function fireAt(w: BlockGetter, x: number, y: number, z: number): boolean {
  const b = w.getBlock(x, y, z);
  return b > 0 && (isFire(b) || familyBase(b) === SOUL_FIRE);
}

function passable(w: BlockGetter, x: number, y: number, z: number, opts?: PathOpts): boolean {
  const b = w.getBlock(x, y, z);
  if (b < 0) return false;
  if (BLOCK_FLUID[b] === 2) return false; // evitar la lava
  if (opts?.avoidFire && fireAt(w, x, y, z)) return false;
  if (BLOCK_SOLID[b] === 1 && BLOCK_WALKTHROUGH[b] === 0) return false;
  // Las vallas miden 1,5: la celda de encima tampoco se puede cruzar.
  const below = w.getBlock(x, y - 1, z);
  return below < 0 || BLOCK_TALL[below] === 0;
}

function floorAt(w: BlockGetter, x: number, y: number, z: number, opts?: PathOpts): boolean {
  const b = w.getBlock(x, y - 1, z);
  if (b < 0) return false;
  if (BLOCK_SOLID[b] === 1) return BLOCK_WALKTHROUGH[b] === 0 && BLOCK_TALL[b] === 0;
  // Nadando: la superficie del agua también sirve (Fase 8.3: y la de la lava para el strider).
  return BLOCK_FLUID[b] === 1 || (!!opts?.lavaFloor && BLOCK_FLUID[b] === 2);
}

/** ¿Puede estar de pie una criatura de `h` bloques de alto con los pies en (x, y, z)? */
export function standable(w: BlockGetter, x: number, y: number, z: number, h: number, opts?: PathOpts): boolean {
  for (let i = 0; i < h; i++) if (!passable(w, x, y + i, z, opts)) return false;
  return floorAt(w, x, y, z, opts);
}

class Heap {
  private items: number[] = [];
  private prio: number[] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: number, p: number): void {
    const a = this.items, q = this.prio;
    a.push(item);
    q.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= q[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]];
      [q[parent], q[i]] = [q[i], q[parent]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items, q = this.prio;
    const top = a[0];
    const last = a.pop()!;
    const lp = q.pop()!;
    if (a.length > 0) {
      a[0] = last;
      q[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        [q[m], q[i]] = [q[i], q[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41],
];

/**
 * Camino desde (sx, sy, sz) hasta (tx, ty, tz) (celdas de los pies). Si no se alcanza el destino
 * dentro del presupuesto devuelve el camino al nodo explorado más cercano.
 */
export function findPath(
  w: BlockGetter, sx: number, sy: number, sz: number, tx: number, ty: number, tz: number, h: number, budget = 400, opts?: PathOpts,
): PathNode[] | null {
  const start = posKey(sx, sy, sz);
  const goal = posKey(tx, ty, tz);
  const open = new Heap();
  const g = new Map<number, number>();
  const from = new Map<number, number>();
  const coords = new Map<number, PathNode>();
  const hFn = (x: number, y: number, z: number) => Math.hypot(x - tx, (y - ty) * 1.2, z - tz);
  g.set(start, 0);
  coords.set(start, [sx, sy, sz]);
  open.push(start, hFn(sx, sy, sz));
  let best = start;
  let bestH = hFn(sx, sy, sz);
  let expanded = 0;
  while (open.size > 0 && expanded < budget) {
    const cur = open.pop();
    if (cur === goal) {
      best = cur;
      break;
    }
    expanded++;
    const [cx, cy, cz] = coords.get(cur)!;
    const cg = g.get(cur)!;
    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      // Diagonales sólo si ambos lados están libres (no cortar esquinas).
      if (dx !== 0 && dz !== 0 && (!passable(w, cx + dx, cy, cz, opts) || !passable(w, cx, cy, cz + dz, opts) || !passable(w, cx + dx, cy + h - 1, cz, opts) || !passable(w, cx, cy + h - 1, cz + dz, opts))) continue;
      let ny = -999;
      let extra = 0;
      if (standable(w, nx, cy, nz, h, opts)) ny = cy;
      else if (standable(w, nx, cy + 1, nz, h, opts) && passable(w, cx, cy + h, cz, opts)) {
        ny = cy + 1;
        extra = 0.6;
      } else {
        for (let d = 1; d <= 3; d++) {
          if (!passable(w, nx, cy - d + h - 1, nz, opts)) break;
          if (standable(w, nx, cy - d, nz, h, opts)) {
            ny = cy - d;
            extra = d * 0.3;
            break;
          }
        }
      }
      if (ny === -999) continue;
      const nb = w.getBlock(nx, ny, nz);
      if (opts) {
        if (opts.avoidFire && (fireAt(w, nx + 1, ny, nz) || fireAt(w, nx - 1, ny, nz) || fireAt(w, nx, ny, nz + 1) || fireAt(w, nx, ny, nz - 1))) extra += 16;
        if (opts.cost) {
          const c = opts.cost(nx, ny, nz);
          if (c === Infinity) continue;
          extra += c;
        }
      }
      if (nb > 0 && BLOCK_FLUID[nb] === 1) extra += 1.5;
      // Fase 6.5 (materiales): las criaturas prefieren los caminos de tierra (pisarlos cuesta algo menos).
      else if (w.getBlock(nx, ny - 1, nz) === DIRT_PATH) extra -= cost * 0.3;
      const nk = posKey(nx, ny, nz);
      const ng = cg + cost + extra;
      const old = g.get(nk);
      if (old !== undefined && old <= ng) continue;
      g.set(nk, ng);
      from.set(nk, cur);
      coords.set(nk, [nx, ny, nz]);
      const hh = hFn(nx, ny, nz);
      if (hh < bestH) {
        bestH = hh;
        best = nk;
      }
      open.push(nk, ng + hh);
    }
  }
  if (best === start) return null;
  const path: PathNode[] = [];
  let k: number | undefined = best;
  while (k !== undefined && k !== start) {
    path.push(coords.get(k)!);
    k = from.get(k);
  }
  path.reverse();
  return path;
}
