// Fase 6.5 (materiales) en el servidor: la pala abre caminos de tierra, la azada labra la tierra gruesa,
// la enraizada (que suelta raíces colgantes) y el camino; el polvo de hueso hace colgar raíces bajo la
// tierra enraizada; la tarta con vela se enciende, se apaga o se come (y suelta la vela); y el camino
// de tierra vuelve a ser tierra si le ponen un bloque sólido encima.
import { AIR, DIRT, DIRT_PATH, ROOTED_DIRT, HANGING_ROOTS, BLOCK_SOLID, isCandleCake } from '../../blocks';
import { BONE_MEAL } from '../../items';
import { soilUse, candleCakeUse } from '../../materialPlacement';
import type { ServerContext, Session } from './context';

export class Materials {
  constructor(private ctx: ServerContext) {}

  /**
   * Clic derecho sobre un bloque con `item` (0 = mano); `h` es la altura del clic dentro del bloque.
   * true si era asunto de este sistema (hecho o rechazado).
   */
  useBlock(s: Session, x: number, y: number, z: number, id: number, item: number, h: number): boolean {
    const ctx = this.ctx;
    const w = ctx.world;
    const get = (bx: number, by: number, bz: number) => w.getBlock(bx, by, bz);
    if (isCandleCake(id)) {
      const r = candleCakeUse(id, Number.isFinite(h) ? h : 0);
      if (!r) return false;
      w.setBlock(x, y, z, r.block);
      if (r.drop && s.mode !== 'c') ctx.entities.dropStacks([{ id: r.drop, count: 1 }], x + 0.5, y + 0.6, z + 0.5);
      return true;
    }
    if (!Number.isInteger(item) || item <= 0) return false;
    if (item === BONE_MEAL && id === ROOTED_DIRT) {
      if (w.getBlock(x, y - 1, z) !== AIR) {
        ctx.reject(s, x, y - 1, z);
        return true;
      }
      w.setBlock(x, y - 1, z, HANGING_ROOTS);
      ctx.fx('bonemeal', x + 0.5, y - 0.5, z + 0.5);
      return true;
    }
    const soil = soilUse(get, x, y, z, item, HANGING_ROOTS);
    if (!soil) return false;
    w.setBlock(x, y, z, soil.block);
    if (soil.drop) ctx.entities.dropStacks([{ id: soil.drop, count: 1 }], x + 0.5, y + 1.1, z + 0.5);
    return true;
  }

  /** Un bloque sólido encima de un camino de tierra lo aplasta (vuelve a ser tierra). */
  onBlockChanged(x: number, y: number, z: number, id: number): void {
    const w = this.ctx.world;
    if (id > 0 && BLOCK_SOLID[id] && w.getBlock(x, y - 1, z) === DIRT_PATH) w.setBlock(x, y - 1, z, DIRT);
    if (id === DIRT_PATH) {
      const above = w.getBlock(x, y + 1, z);
      if (above > 0 && BLOCK_SOLID[above]) w.setBlock(x, y, z, DIRT);
    }
  }
}
