// Pesca: lanzar el flotador y recogerlo. Si se recoge en plena picada, el botín sale volando hacia el
// jugador junto con algo de experiencia. Avisa a todos de qué flotador es de quién (para el sedal) y
// al dueño del desgaste de la caña.
import { ENT_BOBBER } from '../../mobs';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { fishingLoot, FISH_XP } from '../../fishing';
import type { Entity } from '../entities';
import type { ServerContext, Session } from './context';
import { playerLuck } from './potionPlayers'; // Fase 7 (pociones)
// Fase 7 (encantamientos): Suerte marina y Atracción de la caña.
import { FISHING_ROD } from '../../items';
import { LUCK_OF_THE_SEA, LURE } from '../../enchantments';
import { sanitizeHeldEnchants, levelIn } from '../../enchantEffects';

/** Velocidad del lanzamiento (bloques/s). */
const CAST_SPEED = 16;
/** Segundos que tarda el botín en llegar al jugador. */
const PULL_TIME = 1;
/** Rozamiento y gravedad de los objetos tirados (itemPhysics): para apuntar el botín. */
const ITEM_DRAG = 0.5, ITEM_GRAVITY = 18;

export class Fishing {
  /** Flotador de cada jugador: id del jugador → id de la entidad. */
  private bobbers = new Map<string, number>();

  constructor(private ctx: ServerContext) {}

  onFish(s: Session, msg: Extract<ClientMsg, { t: 'fish' }>): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD) return;
    const cur = this.bobberOf(s.id);
    if (cur) {
      const wear = this.reel(s, cur);
      ctx.entities.remove(cur.id);
      this.bobbers.delete(s.id);
      ctx.broadcast({ t: 'rod', p: s.id, e: 0, ...(wear ? { w: wear } : {}) });
      return;
    }
    if (!Array.isArray(msg.p) || !Array.isArray(msg.d)) return;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite)) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const v = d.map((c) => (c / len) * CAST_SPEED);
    const e = ctx.entities.spawnBobber(p[0] + v[0] * 0.02, p[1], p[2] + v[2] * 0.02, v[0], v[1] + 3, v[2], s.id);
    const en = sanitizeHeldEnchants(FISHING_ROD, msg.en);
    e.luck = levelIn(en, LUCK_OF_THE_SEA);
    e.lure = levelIn(en, LURE);
    this.bobbers.set(s.id, e.id);
    ctx.broadcast({ t: 'rod', p: s.id, e: e.id });
    ctx.fx('rod_cast', p[0], p[1], p[2]);
  }

  /** Recoger: botín si picaba (desgaste 1), 2 si estaba en tierra, nada si no. */
  private reel(s: Session, e: Entity): number {
    const ctx = this.ctx;
    if ((e.fishBite ?? 0) > 0) {
      const stack = fishingLoot(ctx.rand, (e.luck ?? 0) + playerLuck(s)); // Fase 7: Suerte marina (caña) y Suerte/Mala suerte (pociones)
      // Tiro hacia el jugador teniendo en cuenta el rozamiento y la gravedad de los objetos.
      const reach = (1 - Math.exp(-ITEM_DRAG * PULL_TIME)) / ITEM_DRAG;
      const tx = s.p[0] - e.x, ty = s.p[1] + 1 - e.y, tz = s.p[2] - e.z;
      const g = ITEM_GRAVITY / ITEM_DRAG;
      const vy = (ty + g * PULL_TIME) / reach - g;
      ctx.entities.spawnItem(stack, e.x, e.y + 0.3, e.z, tx / reach, vy, tz / reach, undefined, 0);
      const xp = FISH_XP[0] + Math.floor(ctx.rand() * (FISH_XP[1] - FISH_XP[0] + 1));
      ctx.entities.xp.spawn(xp, s.p[0], s.p[1] + 0.5, s.p[2]);
      ctx.fx('fish_catch', e.x, e.y, e.z);
      return 1;
    }
    return e.onGround ? 2 : 0;
  }

  private bobberOf(id: string): Entity | null {
    const eid = this.bobbers.get(id);
    const e = eid !== undefined ? this.ctx.entities.list.get(eid) : undefined;
    return e && e.type === ENT_BOBBER ? e : null;
  }

  /** Flotadores que desaparecieron solos (el dueño cambió de objeto, se alejó, murió o se fue). */
  tick(): void {
    for (const [pid, eid] of this.bobbers) {
      if (this.ctx.entities.list.has(eid)) continue;
      this.bobbers.delete(pid);
      this.ctx.broadcast({ t: 'rod', p: pid, e: 0 });
    }
  }

  /** Flotadores que siguen fuera (para quien entra ahora). */
  active(): [string, number][] {
    return [...this.bobbers];
  }
}
