// Fase 6.5 (colores): el hormigón en polvo se endurece al tocar agua (por los lados o por arriba, como
// en Minecraft): al colocarlo o caer junto a ella, al caer dentro de una fuente o cuando el agua llega.
import { BLOCK_FLUID, isConcretePowder, concreteOf } from '../../blocks';
import type { ServerContext } from './context';

/** Vecinos cuyo agua endurece el polvo: los cuatro lados y arriba (el de abajo no cuenta). */
const WET_SIDES = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]] as const;

export class ColorBlocks {
  constructor(private ctx: ServerContext) {}

  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    const w = this.ctx.world;
    if (isConcretePowder(id)) {
      // Puede que ya haya empezado a caer (la celda vuelve a ser aire).
      if (w.getBlock(x, y, z) !== id) return;
      let wet = BLOCK_FLUID[old] === 1;
      for (const [dx, dy, dz] of WET_SIDES) if (!wet && BLOCK_FLUID[Math.max(0, w.getBlock(x + dx, y + dy, z + dz))] === 1) wet = true;
      if (wet) w.setBlock(x, y, z, concreteOf(id));
    } else if (BLOCK_FLUID[id] === 1) {
      // El agua llega junto a un polvo (al lado o encima de él).
      for (const [dx, dy, dz] of WET_SIDES) {
        const nx = x - dx, ny = y - dy, nz = z - dz;
        const n = w.getBlock(nx, ny, nz);
        if (n > 0 && isConcretePowder(n)) w.setBlock(nx, ny, nz, concreteOf(n));
      }
    }
  }
}
