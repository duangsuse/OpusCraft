// Fase 6.5 (maderas): el bambú crece con los ticks aleatorios, un tallo más cada vez, hasta 12–16 de
// alto (según la columna); los tres de arriba llevan hojas (dos grandes y una pequeña). Al romper un
// tallo se caen los de encima (su apoyo, en woods2.ts, lo resuelve blockRules).
import {
  AIR, isBamboo, bambooWithLeaves, BAMBOO_NO_LEAVES, BAMBOO_SMALL_LEAVES, BAMBOO_LARGE_LEAVES,
} from '../../blocks';
import { MAX_Y, hash2 } from '../../constants';
import type { Nature } from './nature';
import type { ServerContext } from './context';

/** Probabilidad de crecer en un tick aleatorio. */
const GROW_CHANCE = 1 / 3;

/** Altura máxima de un bambú en (x, z): de 12 a 16 (determinista, como en Minecraft varía por planta). */
export function bambooMaxHeight(x: number, z: number): number {
  return 12 + (hash2(x, z, 0xba4b) % 5);
}

/** Hojas de un tallo según cuántos tallos tiene encima (0 = el de arriba). */
export function bambooLeavesAt(fromTop: number): number {
  return fromTop < 2 ? BAMBOO_LARGE_LEAVES : fromTop === 2 ? BAMBOO_SMALL_LEAVES : BAMBOO_NO_LEAVES;
}

export class BambooGrowth {
  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  private randomTick(id: number, x: number, y: number, z: number): boolean {
    if (!isBamboo(id)) return false;
    if (this.ctx.rand() < GROW_CHANCE) this.grow(x, y, z);
    return true;
  }

  /** Hace crecer el bambú de (x, y, z) un tallo, si el de arriba tiene aire encima y no es ya muy alto. */
  grow(x: number, y: number, z: number): boolean {
    const w = this.ctx.world;
    let top = y;
    while (top + 1 < MAX_Y && isBamboo(w.getBlock(x, top + 1, z))) top++;
    let bottom = y;
    while (isBamboo(w.getBlock(x, bottom - 1, z))) bottom--;
    if (top + 1 >= MAX_Y || w.getBlock(x, top + 1, z) !== AIR || top - bottom + 1 >= bambooMaxHeight(x, z)) return false;
    w.setBlock(x, top + 1, z, bambooWithLeaves(BAMBOO_LARGE_LEAVES));
    for (let k = 1; k <= 3 && top + 1 - k >= bottom; k++) {
      const id = bambooWithLeaves(bambooLeavesAt(k));
      if (w.getBlock(x, top + 1 - k, z) !== id) w.setBlock(x, top + 1 - k, z, id);
    }
    return true;
  }
}
