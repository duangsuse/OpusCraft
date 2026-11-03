// Fase 6.5 (remate): etiquetas y correas.
// - Etiqueta sobre una criatura: le pone el nombre que escribe el jugador (se ve encima y ya no
//   desaparece). En Minecraft el nombre se escribe en el yunque; aquí, al usarla.
// - Correa sobre un animal: queda atado al jugador y lo sigue; con clic derecho en una valla, los que
//   lleva quedan atados a ella. Si se aleja más de 10 bloques la correa se rompe y cae.
// El nombre y la atadura se envían con las entidades (campo `ex` de 'ents') y se guardan con los animales.
// Fase 7 (remate): las barcas también se atan (como en Minecraft): con la correa en la mano se atan al
// jugador y siguen a las vallas igual; sin correa, clic derecho sube (lo hace Transport). De ellas tira
// Transport (mueve su cuerpo), con el punto que deja aquí en leashTo; la valla se guarda con la barca.
import { isFence } from '../../blocks';
import { ITEMS, NAME_TAG, LEAD } from '../../items';
import { MOBS } from '../../mobs';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import type { Entity, InteractResult } from '../entities';
import type { ServerContext, Session } from './context';
import { cleanName } from '../../nameTags';
import { isBoatType } from '../../vehicles'; // Fase 7 (remate)

/** Largo de la correa: a partir de aquí tira de la criatura; más allá de BREAK se rompe. */
const SLACK = 4;
const BREAK = 10;

/** ¿Se le puede poner una correa? (animales y gólems; no los monstruos ni los aldeanos). */
export function leashable(e: Entity): boolean {
  const def = MOBS[e.type];
  return !!e.ai && !!def && !def.hostile && !e.villager && !def.aquatic;
}

export class Leashes {
  constructor(private ctx: ServerContext) {}

  /** Etiqueta o correa sobre una criatura. null si no le toca a este sistema. */
  onInteract(s: Session, e: Entity, msg: Extract<ClientMsg, { t: 'interact' }>): InteractResult | null {
    const item = Number(msg.item);
    if (isBoatType(e.type)) return this.onBoat(s, e, item); // Fase 7 (remate)
    if (e.dead || !e.ai) return null;
    if (item === NAME_TAG) {
      const name = cleanName(msg.n);
      if (!name) return { ok: false };
      e.customName = name;
      e.despawn = false;
      this.ctx.fx('name_tag', e.x, e.y + 1, e.z);
      return { ok: true, take: 1 };
    }
    // Atada a este jugador: se suelta (la correa cae) con cualquier cosa en la mano.
    if (e.leash === s.id) {
      this.release(e, true);
      return { ok: true };
    }
    // Atada a una valla: pasa a la mano del jugador.
    if (Array.isArray(e.leash)) {
      e.leash = s.id;
      this.ctx.fx('leash', e.x, e.y + 0.5, e.z);
      return { ok: true };
    }
    if (item === LEAD && leashable(e) && !e.leash && !e.rider) {
      e.leash = s.id;
      this.ctx.fx('leash', e.x, e.y + 0.5, e.z);
      return { ok: true, take: 1 };
    }
    return null;
  }

  /**
   * Fase 7 (remate): correa y barca. Atada a este jugador: se suelta (la correa cae). Con la correa en la
   * mano: se ata al jugador (si estaba en una valla, pasa a su mano sin gastar otra). null: no es cosa de
   * correas (clic derecho para subirse).
   */
  private onBoat(s: Session, e: Entity, item: number): InteractResult | null {
    if (e.dead) return null;
    if (e.leash === s.id) {
      this.release(e, true);
      return { ok: true };
    }
    if (item !== LEAD) return null;
    if (Array.isArray(e.leash)) {
      e.leash = s.id;
      this.ctx.fx('leash', e.x, e.y + 0.5, e.z);
      return { ok: true };
    }
    if (e.leash) return null;
    e.leash = s.id;
    this.ctx.fx('leash', e.x, e.y + 0.5, e.z);
    return { ok: true, take: 1 };
  }

  /** Clic derecho en una valla: las criaturas que lleva el jugador quedan atadas a ella. */
  onFence(s: Session, msg: Extract<ClientMsg, { t: 'leash' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isInteger) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) return;
    if (!isFence(ctx.world.getBlock(x, y, z))) return;
    let n = 0;
    for (const e of ctx.entities.list.values()) {
      if (e.leash !== s.id || e.dead) continue;
      e.leash = [x, y, z];
      n++;
    }
    if (n) ctx.fx('leash', x + 0.5, y + 0.5, z + 0.5);
  }

  /** Suelta una criatura (si `drop`, la correa cae a su lado). */
  release(e: Entity, drop: boolean): void {
    e.leash = undefined;
    e.leashTo = undefined;
    if (drop && ITEMS[LEAD]) this.ctx.entities.dropStacks([{ id: LEAD, count: 1 }], e.x, e.y + 0.5, e.z);
    this.ctx.fx('leash_break', e.x, e.y + 0.5, e.z);
  }

  /** Punto del que tira la correa (jugador o valla), o null si ya no existe. */
  private holderPos(e: Entity): [number, number, number] | null {
    const h = e.leash!;
    // Fase 7.5 (fauna): llama atada a una criatura ('@' + id): la del comerciante ambulante.
    if (typeof h === 'string' && h.startsWith('@')) {
      const t = this.ctx.entities.list.get(Number(h.slice(1)));
      return t && !t.dead ? [t.x, t.y + t.height * 0.55, t.z] : null;
    }
    if (Array.isArray(h)) {
      const b = this.ctx.world.getBlock(h[0], h[1], h[2]);
      if (b >= 0 && !isFence(b)) return null; // la valla se rompió
      return [h[0] + 0.5, h[1] + 0.5, h[2] + 0.5];
    }
    for (const s of this.ctx.sessions()) if (s.id === h && s.joined && !(s.s & STATE_DEAD)) return [s.p[0], s.p[1] + 1, s.p[2]];
    return null;
  }

  /** Cada tick: las correas tiran de las criaturas y se rompen si se estiran demasiado. */
  tick(dt: number): void {
    for (const e of this.ctx.entities.list.values()) {
      if (!e.leash) {
        e.leashTo = undefined;
        continue;
      }
      if (e.dead) {
        this.release(e, true);
        continue;
      }
      const h = this.holderPos(e);
      if (!h) {
        this.release(e, true);
        continue;
      }
      const dx = h[0] - e.x, dy = h[1] - (e.y + e.height * 0.5), dz = h[2] - e.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > BREAK) {
        this.release(e, true);
        continue;
      }
      e.leashTo = h;
      if (isBoatType(e.type)) continue; // Fase 7 (remate): de la barca tira Transport
      if (d > SLACK + 2) {
        // Muy estirada: además de caminar hacia allí, la correa tira de ella (más cuanto más estirada).
        const k = Math.min(1, (d - SLACK - 2) / (BREAK - SLACK - 2)) * 18 * dt;
        e.vx += (dx / d) * k * 4;
        e.vz += (dz / d) * k * 4;
        if (dy > 0.5 && e.onGround) e.vy = Math.max(e.vy, 6);
        const sp = Math.hypot(e.vx, e.vz), max = 5.5;
        if (sp > max) {
          e.vx *= max / sp;
          e.vz *= max / sp;
        }
        e.yaw = Math.atan2(-dx, -dz);
      }
    }
  }

  /** Un jugador se va: lo que llevaba atado se suelta (la correa cae). */
  onLeave(s: Session): void {
    for (const e of this.ctx.entities.list.values()) if (e.leash === s.id) this.release(e, true);
  }
}
