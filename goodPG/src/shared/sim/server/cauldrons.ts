// Fase 6.5 (calderos): llenar y vaciar calderos con los cubos, lavar estandartes, la lluvia (o la nieve)
// que los llena poco a poco y lo que les pasa a las criaturas que se meten dentro (el agua apaga el fuego y
// la lava las prende).
import { cauldronFill, cauldronOf, CAULDRON_EMPTY, CAULDRON_WATER, CAULDRON_LAVA, CAULDRON_SNOW } from '../../blocks';
import { cauldronUseServer } from '../../cauldronUse';
import { rainAt } from '../../weather';
import { BUCKET } from '../../items';
import { GLASS_BOTTLE, POTION } from '../../items'; // Fase 7 (pociones)
import type { Nature } from './nature';
import type { ServerContext, Session } from './context';

export class Cauldrons {
  private t = 0;

  constructor(private ctx: ServerContext, nature: Nature) {
    nature.addRandomTickHandler((id, x, y, z) => this.randomTick(id, x, y, z));
  }

  /** Clic derecho con `item` sobre el caldero (x, y, z). Devuelve si lo atendió. */
  use(s: Session, x: number, y: number, z: number, id: number, item: number): boolean {
    if (!cauldronFill(id) || !Number.isInteger(item) || item <= 0) return false;
    const next = cauldronUseServer(id, item);
    if (next < 0) return false;
    this.ctx.world.setBlock(x, y, z, next);
    const before = cauldronFill(id)!, after = cauldronFill(next)!;
    // Sonido: el cubo se llena, se vacía en el caldero o se lava un estandarte (a = 1 si es lava).
    // Fase 7 (pociones): frascos que se llenan o se vacían.
    if (item === GLASS_BOTTLE || item === POTION) {
      this.ctx.fx(item === GLASS_BOTTLE ? 'bottle_fill' : 'bottle_empty', x + 0.5, y + 0.8, z + 0.5);
      return true;
    }
    const kind = item === BUCKET ? 'fill' : after.kind === CAULDRON_WATER && after.level < before.level ? 'wash' : 'empty';
    this.ctx.fx(`cauldron_${kind}`, x + 0.5, y + 0.8, z + 0.5, after.kind === CAULDRON_LAVA || before.kind === CAULDRON_LAVA ? 1 : 0);
    void s;
    return true;
  }

  /** La lluvia llena poco a poco el caldero a la intemperie (de nieve polvo donde nieva). */
  private randomTick(id: number, x: number, y: number, z: number): boolean {
    const f = cauldronFill(id);
    if (!f) return false;
    const ctx = this.ctx, w = ctx.world;
    if (f.kind === CAULDRON_LAVA || f.level >= 3) return true;
    if (rainAt(ctx.worldTime(), ctx.seed) <= 0.2 || w.skyTop(x, z) > y || ctx.rand() > 0.35) return true;
    const cold = w.gen.columnInfo(x, z).temp < -0.5;
    const kind = cold ? CAULDRON_SNOW : CAULDRON_WATER;
    if (f.kind !== CAULDRON_EMPTY && f.kind !== kind) return true;
    w.setBlock(x, y, z, cauldronOf(kind, f.level + 1));
    return true;
  }

  /** Cada medio segundo: las criaturas dentro de un caldero con agua dejan de arder; con lava, arden. */
  tick(): void {
    if (++this.t % 10 !== 0) return;
    const w = this.ctx.world;
    for (const e of this.ctx.entities.list.values()) {
      if (!e.ai || e.dead) continue;
      const f = cauldronFill(w.getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z)));
      if (!f || f.level === 0) continue;
      if (f.kind === CAULDRON_WATER) e.fire = 0;
      else if (f.kind === CAULDRON_LAVA) e.fire = Math.max(e.fire, 8);
    }
  }
}
