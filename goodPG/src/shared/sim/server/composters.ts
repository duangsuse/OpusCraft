// Compostador: cada objeto compostable puede subir un nivel; al llenarse (nivel 7) tarda un segundo
// en quedar listo (nivel 8) y entonces suelta polvo de hueso al usarlo.
import { COMPOSTER } from '../../blocks';
import { BONE_MEAL } from '../../items';
import { COMPOSTER_FULL, COMPOSTER_READY, canCompost, compostRises, composterLevel } from '../../composting';
import type { ServerContext, Session } from './context';

/** Ticks (20 por segundo) que tarda un compostador lleno en estar listo. */
const READY_TICKS = 20;

export class Composters {
  /** Compostadores llenos esperando: "x,y,z" → ticks que faltan. */
  private pending = new Map<string, number>();

  constructor(private ctx: ServerContext) {}

  /** Clic derecho con `item` (0 = mano) sobre el compostador de (x, y, z). */
  use(s: Session, x: number, y: number, z: number, item: number): void {
    const ctx = this.ctx;
    const level = composterLevel(ctx.world.getBlock(x, y, z));
    if (level < 0) return;
    if (level === COMPOSTER_READY) {
      ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, COMPOSTER));
      ctx.entities.spawnItem({ id: BONE_MEAL, count: 1 }, x + 0.5, y + 1.05, z + 0.5, 0, 2.5, 0);
      ctx.fx('compost_empty', x + 0.5, y + 0.9, z + 0.5);
      return;
    }
    if (level === COMPOSTER_FULL) {
      // Lleno: si se perdió la espera (el servidor se reinició), vuelve a contar.
      const key = `${x},${y},${z}`;
      if (!this.pending.has(key)) this.pending.set(key, READY_TICKS);
      ctx.reject(s, x, y, z);
      return;
    }
    if (!canCompost(level, item)) {
      ctx.reject(s, x, y, z);
      return;
    }
    // El objeto ya lo gastó el cliente; aquí sólo se decide si sube.
    const up = compostRises(level, item, ctx.rand());
    if (up) {
      ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, COMPOSTER + level + 1));
      if (level + 1 === COMPOSTER_FULL) this.pending.set(`${x},${y},${z}`, READY_TICKS);
    }
    ctx.fx('compost', x + 0.5, y + 0.3 + (level + (up ? 1 : 0)) / 8, z + 0.5, up ? 1 : 0);
  }

  /** Fase 7 (mecanismos): una tolva echa `item` desde arriba; true si lo aceptó (se gasta aunque no suba). */
  insert(x: number, y: number, z: number, item: number): boolean {
    const ctx = this.ctx;
    const level = composterLevel(ctx.world.getBlock(x, y, z));
    if (level < 0 || level >= COMPOSTER_FULL || !canCompost(level, item)) return false;
    const up = compostRises(level, item, ctx.rand());
    if (up) {
      ctx.world.setBlock(x, y, z, COMPOSTER + level + 1);
      if (level + 1 === COMPOSTER_FULL) this.pending.set(`${x},${y},${z}`, READY_TICKS);
    }
    ctx.fx('compost', x + 0.5, y + 0.3 + (level + (up ? 1 : 0)) / 8, z + 0.5, up ? 1 : 0);
    return true;
  }

  /** Fase 7 (mecanismos): una tolva de debajo saca el polvo de hueso de un compostador listo; true si lo había. */
  takeReady(x: number, y: number, z: number): boolean {
    const ctx = this.ctx;
    if (composterLevel(ctx.world.getBlock(x, y, z)) !== COMPOSTER_READY) return false;
    ctx.world.setBlock(x, y, z, COMPOSTER);
    ctx.fx('compost_empty', x + 0.5, y + 0.9, z + 0.5);
    return true;
  }

  tick(): void {
    if (this.pending.size === 0) return;
    const ctx = this.ctx;
    for (const [key, t] of this.pending) {
      if (t > 1) {
        this.pending.set(key, t - 1);
        continue;
      }
      this.pending.delete(key);
      const [x, y, z] = key.split(',').map(Number);
      if (composterLevel(ctx.world.getBlock(x, y, z)) !== COMPOSTER_FULL) continue;
      ctx.world.setBlock(x, y, z, COMPOSTER + COMPOSTER_READY);
      ctx.fx('compost_ready', x + 0.5, y + 1, z + 0.5);
    }
  }
}
