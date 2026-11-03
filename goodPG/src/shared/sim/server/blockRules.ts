// Reglas físicas de los bloques tras cada cambio: lo que se queda sin apoyo se rompe (plantas,
// antorchas, puertas, camas, cultivos…), la arena y la grava caen, y un bloque sólido encima de la
// tierra de cultivo la aplasta. También agrupa ediciones de varias celdas (puertas, camas) para que
// las comprobaciones de apoyo se hagan cuando ya están todas puestas.
import {
  AIR, SAND, RED_SAND, GRAVEL, CACTUS, SUGAR_CANE, DIRT, BLOCK_FLUID, BLOCK_SOLID, BLOCK_RENDER, BLOCK_REPLACEABLE, BLOCK_WALL,
  BLOCK_NEEDS_SUPPORT, R_CROSS, R_TORCH, blockSupported, isFarmland, DRAGON_EGG,
} from '../../blocks';
import { isConcretePowder } from '../../blocks'; // Fase 6.5 (colores)
import { isAnvil } from '../../blocks'; // Fase 7 (encantamientos)
import type { Edit } from '../../placement';
import { blockDrops } from '../drops';
import { SAPLINGS, SOIL } from './plants';
import { emptyAfterBreak } from '../../blocks'; // Fase 6.5 (océano y plantas)
import type { ServerContext } from './context';

const NEIGHBORS7 = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** Plantas, antorchas de pie y cactus: necesitan el bloque de abajo. */
function needsSupport(id: number): boolean {
  const r = BLOCK_RENDER[id];
  if (BLOCK_NEEDS_SUPPORT[id]) return false; // enredaderas de cueva, amatista…: su propio apoyo
  return ((r === R_CROSS || r === R_TORCH) && BLOCK_WALL[id] < 0) || id === CACTUS;
}

function supportOk(id: number, below: number): boolean {
  if (below < 0) return true; // sin cargar: no tocar
  if (id === CACTUS) return below === CACTUS || below === SAND || below === RED_SAND;
  if (id === SUGAR_CANE) return below === SUGAR_CANE || below === SAND || below === RED_SAND || SOIL.has(below);
  if (SAPLINGS.has(id)) return SOIL.has(below);
  return BLOCK_SOLID[below] === 1 && BLOCK_RENDER[below] !== R_CROSS;
}

function isFalling(id: number): boolean {
  return id === SAND || id === RED_SAND || id === GRAVEL || isConcretePowder(id) || // Fase 6.5 (colores): hormigón en polvo
    isAnvil(id) || // Fase 7 (encantamientos)
    id === DRAGON_EGG; // Fase 8.6
}

/** ¿Puede ocupar una celda un bloque que cae (o se desplaza) sobre ella? */
export function fallsThrough(id: number): boolean {
  return id === AIR || BLOCK_FLUID[id] > 0 || (BLOCK_SOLID[id] === 0 && BLOCK_REPLACEABLE[id] === 1);
}

export class BlockRules {
  /** Mientras se colocan varias celdas a la vez, las comprobaciones de apoyo se aplazan. */
  private supportBatch: [number, number, number][] | null = null;
  /** Romper sin soltar objetos (jugador en creativo). */
  private silentDrops = false;

  constructor(private ctx: ServerContext) {}

  onBlockChanged(x: number, y: number, z: number, id: number): void {
    const w = this.ctx.world;
    // Un bloque sólido encima de la tierra de cultivo la aplasta.
    if (id > 0 && BLOCK_SOLID[id] && isFarmland(w.getBlock(x, y - 1, z))) w.setBlock(x, y - 1, z, DIRT);
    if (this.supportBatch) this.supportBatch.push([x, y, z]);
    else this.checkSupport(x, y, z, id);
    // Arena y grava caen.
    const above = w.getBlock(x, y + 1, z);
    if (above > 0 && isFalling(above) && fallsThrough(id)) this.startFall(x, y + 1, z, above);
    if (isFalling(id)) {
      const below = w.getBlock(x, y - 1, z);
      if (below >= 0 && fallsThrough(below)) this.startFall(x, y, z, id);
    }
  }

  /** Aplica varias ediciones como una sola (las dos mitades de una puerta, una cama...). */
  applyEdits(edits: Edit[]): void {
    this.supportBatch = [];
    try {
      for (const [x, y, z, id] of edits) this.ctx.world.setBlock(x, y, z, id);
    } finally {
      const batch = this.supportBatch;
      this.supportBatch = null;
      for (const [x, y, z] of batch) this.checkSupport(x, y, z, this.ctx.world.getBlock(x, y, z));
    }
  }

  /** Ejecuta `fn` sin que lo que se rompa por falta de apoyo suelte objetos (creativo). */
  /** Fase 8.6: ¿se está rompiendo sin soltar nada (un jugador en creativo)? */
  get silentBreak(): boolean {
    return this.silentDrops;
  }

  withoutDrops<T>(silent: boolean, fn: () => T): T {
    const prev = this.silentDrops;
    this.silentDrops = silent;
    try {
      return fn();
    } finally {
      this.silentDrops = prev;
    }
  }

  /** Rompe lo que se quedó sin apoyo alrededor de un cambio en (x, y, z). */
  private checkSupport(x: number, y: number, z: number, id: number): void {
    const w = this.ctx.world;
    // Plantas y antorchas de pie encima.
    const above = w.getBlock(x, y + 1, z);
    if (above > 0 && needsSupport(above) && !supportOk(above, id)) this.breakWithDrops(x, y + 1, z, above);
    // Este mismo bloque sin apoyo (por ejemplo, colocado por un fluido que arrastra).
    if (id > 0 && needsSupport(id) && !supportOk(id, w.getBlock(x, y - 1, z))) this.breakWithDrops(x, y, z, id);
    // Antorchas de pared, escaleras de mano, puertas, camas, cultivos y tartas: la celda y sus vecinas.
    for (const [dx, dy, dz] of NEIGHBORS7) {
      const nx = x + dx, ny = y + dy, nz = z + dz;
      const n = w.getBlock(nx, ny, nz);
      if (n <= 0 || !BLOCK_NEEDS_SUPPORT[n]) continue;
      if (!blockSupported(n, (ax, ay, az) => w.getBlock(nx + ax, ny + ay, nz + az))) this.breakWithDrops(nx, ny, nz, n);
    }
  }

  /** Suelta lo que suelta el bloque sin quitarlo (el pistón lo quita después, con sus opciones). */
  dropOnly(x: number, y: number, z: number, id: number): void {
    if (!this.silentDrops) this.ctx.entities.dropStacks(blockDrops(id, 0, () => this.ctx.rand()), x + 0.5, y + 0.3, z + 0.5);
  }

  /** Lo que queda al romper el bloque (agua si estaba anegado). */
  emptyAfter(id: number): number {
    return emptyAfterBreak(id);
  }

  breakWithDrops(x: number, y: number, z: number, id: number): void {
    this.ctx.world.setBlock(x, y, z, emptyAfterBreak(id)); // Fase 6.5: las plantas anegadas dejan agua
    if (!this.silentDrops) this.ctx.entities.dropStacks(blockDrops(id, 0, () => this.ctx.rand()), x + 0.5, y + 0.3, z + 0.5);
  }

  private startFall(x: number, y: number, z: number, id: number): void {
    this.ctx.world.setBlock(x, y, z, AIR);
    this.ctx.entities.spawnFalling(id, x + 0.5, y, z + 0.5);
  }
}
