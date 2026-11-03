// Acciones de los jugadores sobre entidades: atacar, recoger y tirar objetos, disparar flechas y
// lanzar huevos.
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import { ITEMS, EGG, SNOWBALL } from '../../items';
import { attackCooldown, attackDamage, chargeFactor } from '../../combat';
import { sanitizeStack } from '../../containers';
import type { PlayerView } from '../entities';
import { CROSSBOW_SPEED, CROSSBOW_ARROW_DAMAGE } from '../../equipment'; // Fase 6.5 (equipo)
import { SPLASH_POTION, LINGERING_POTION } from '../../items'; // Fase 7 (pociones)
import { isPotionType, SPECTRAL_ARROW_TYPE } from '../../potions';

/** Fase 7 (pociones): velocidad (bloques/s) y ángulo hacia arriba con que salen las pociones lanzadas. */
const POTION_THROW_SPEED = 10;
const POTION_THROW_UP = (20 * Math.PI) / 180;
// Fase 7 (encantamientos): encantamientos del arma, del arco y de la ballesta.
import { meleeHit, shootArrows } from './enchantCombat';
import { EXPERIENCE_BOTTLE, ENDER_EYE, ENDER_PEARL } from '../../items';
import { DIM_OVERWORLD } from '../../dimensions'; // Fase 8.6
import { MOB_ENDER_DRAGON } from '../../mobs';
import { locateStructure } from '../../world/structures';
import type { ServerContext, Session } from './context';

export class PlayerActions {
  constructor(private ctx: ServerContext) {}

  onAttack(s: Session, msg: Extract<ClientMsg, { t: 'attack' }>): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD) return;
    const e = ctx.entities.list.get(Number(msg.e));
    if (!e || !e.ai || e.dead) return;
    const reach = ctx.local ? 8 : 6;
    if (e.type === MOB_ENDER_DRAGON) {
      // Fase 8.6: al dragón se le golpea en la parte a la que se mira (y el alcance cuenta hasta esa parte).
      const [yaw, pitch] = s.r;
      const part = ctx.entities.dragon.partOnRay(e, s.p[0], s.p[1] + 1.62, s.p[2], -Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch), reach);
      const near = ctx.entities.dragon.distanceToParts(e, s.p[0], s.p[1] + 1.62, s.p[2]);
      if (near > reach) return;
      ctx.entities.dragon.pendingPart = part >= 0 ? part : ctx.entities.dragon.partAt(e, s.p[0], s.p[1] + 1.62, s.p[2]);
    } else {
      const dx = e.x - s.p[0], dy = e.y + e.height / 2 - (s.p[1] + 1.6), dz = e.z - s.p[2];
      if (dx * dx + dy * dy + dz * dz > reach * reach) return;
    }
    const now = ctx.now();
    // Enfriamiento del ataque (como en Minecraft 1.9+): cada arma tiene su ritmo y golpear antes de
    // tiempo hace menos daño.
    const item = Number(msg.item);
    const valid = Number.isInteger(item) && item > 0;
    const tool = valid ? ITEMS[item]?.tool : undefined;
    // Fase 7 (efectos): Prisa y Fatiga minera (el cliente manda el multiplicador; aquí se acota).
    const k = Number(msg.k);
    const speedK = Number.isFinite(k) ? Math.max(0.3, Math.min(1.7, k)) : 1;
    const charge = Math.min(1, (now - s.lastAttack) / (attackCooldown(valid ? item : 0) / speedK * 1000));
    s.lastAttack = now;
    let dmg = valid ? attackDamage(item) : 1;
    // Efectos del jugador (Fuerza, Debilidad): el cliente los manda y aquí se acotan.
    const bonus = Number(msg.b);
    if (Number.isFinite(bonus)) dmg = Math.max(0, dmg + Math.max(-20, Math.min(15, bonus)));
    dmg *= chargeFactor(charge);
    if (msg.crit && charge > 0.9) dmg *= 1.5;
    // Fase 7 (encantamientos): Filo, Castigo, Perdición, Empalamiento, Empuje, Aspecto de fuego, Saqueo y barrido.
    meleeHit(ctx, s, e, valid ? item : 0, msg, dmg, charge, tool?.kind === 'sword' ? 1.2 : 1);
  }

  onPickup(s: Session, id: number): void {
    if (s.s & STATE_DEAD || !Number.isInteger(id)) return;
    const view: PlayerView = {
      id: s.id, name: s.name, x: s.p[0], y: s.p[1], z: s.p[2], alive: true, creative: s.mode === 'c', lookingAt: -1,
    };
    const stack = this.ctx.entities.tryPickup(id, view);
    if (stack) {
      this.ctx.markCollected(id, s.id);
      this.ctx.send(s, { t: 'picked', e: id, s: stack });
    }
  }

  onDrop(s: Session, msg: Extract<ClientMsg, { t: 'drop' }>): void {
    const ctx = this.ctx;
    if (!Array.isArray(msg.items) || !Array.isArray(msg.p) || msg.items.length > 64) return;
    if (!ctx.allow(s, 1 + msg.items.length * 0.5)) return;
    const p = msg.p.map(Number);
    if (p.length !== 3 || !p.every(Number.isFinite)) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1], p[2] - s.p[2]) > 4) return;
    const v = Array.isArray(msg.v) && msg.v.length === 3 && msg.v.map(Number).every(Number.isFinite) ? msg.v.map(Number) : null;
    for (const raw of msg.items) {
      const st = sanitizeStack(raw);
      if (!st) continue;
      if (v) {
        const clampV = (a: number) => Math.max(-12, Math.min(12, a));
        ctx.entities.spawnItem(st, p[0], p[1], p[2], clampV(v[0]), clampV(v[1]), clampV(v[2]), s.id, 2);
      } else {
        const a = ctx.rand() * Math.PI * 2, sp = ctx.rand() * 3;
        ctx.entities.spawnItem(st, p[0], p[1] + 0.5, p[2], Math.cos(a) * sp, 3 + ctx.rand() * 2, Math.sin(a) * sp, s.id, 2);
      }
    }
  }

  onShoot(s: Session, msg: Extract<ClientMsg, { t: 'shoot' }>): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD || !Array.isArray(msg.p) || !Array.isArray(msg.d)) return;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    const f = Math.max(0, Math.min(1, Number(msg.f) || 0));
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite) || f < 0.1) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    // Fase 6.5 (equipo): el virote de la ballesta sale siempre a tope y pega más fuerte.
    const crossbow = msg.c === 1;
    const speed = crossbow ? CROSSBOW_SPEED : 55 * f;
    // Fase 7 (encantamientos): Poder, Retroceso, Fuego e Infinidad; Multidisparo y Perforación.
    const arrows = shootArrows(ctx, s, p, [d[0] / len, d[1] / len, d[2] / len], speed, crossbow ? CROSSBOW_ARROW_DAMAGE : 2, crossbow, msg.en);
    // Fase 7 (pociones): flecha con efecto (el tipo de poción que lleva); Infinidad no vale con ellas.
    const ap = Number(msg.ap);
    if (msg.ap !== undefined && (isPotionType(ap) || ap === SPECTRAL_ARROW_TYPE)) { // Fase 8.3: o la flecha espectral
      for (const a of arrows) a.arrowPotion = ap;
      if (arrows[0]) arrows[0].noPickup = false;
    }
    if (crossbow) ctx.fx('crossbow_shoot', p[0], p[1], p[2]);
    else ctx.fx('bow', p[0], p[1], p[2], f);
  }

  /** Lanzar un huevo (el cliente ya lo quitó del inventario). Fase 7 (pociones): o una poción (w, su tipo). */
  onThrow(s: Session, msg: Extract<ClientMsg, { t: 'throw' }>): void {
    const ctx = this.ctx;
    const item = Number(msg.item);
    if (item === SPLASH_POTION || item === LINGERING_POTION) {
      this.throwPotion(s, msg, item);
      return;
    }
    if (item === ENDER_EYE) {
      this.throwEye(s, msg);
      return;
    }
    if (s.s & STATE_DEAD || (item !== EGG && item !== SNOWBALL && item !== EXPERIENCE_BOTTLE && item !== ENDER_PEARL) || !Array.isArray(msg.p) || !Array.isArray(msg.d)) return;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite)) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    // Fase 7 (encantamientos): la botella con experiencia sale más despacio (0,7 bloques por tick) y 20° más alta.
    const bottle = item === EXPERIENCE_BOTTLE;
    if (bottle) d[1] += 0.36 * Math.hypot(d[0], d[1], d[2]);
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    // 1,5 bloques por tick, como en Minecraft.
    const speed = bottle ? 14 : 30;
    ctx.entities.spawnThrown(item, p[0], p[1], p[2], (d[0] / len) * speed, (d[1] / len) * speed, (d[2] / len) * speed, s.id);
    ctx.fx('throw', p[0], p[1], p[2]);
  }

  /**
   * Fase 8.6: el ojo de ender (EnderEyeItem.use + EyeOfEnder.signalTo): sale del jugador hacia la fortaleza más
   * cercana; si está a más de 12 bloques, apunta a 12 bloques en su dirección y 8 más arriba. Sólo en el mundo
   * normal (en las otras dimensiones no hay fortalezas y el cliente no lo lanza).
   */
  private throwEye(s: Session, msg: Extract<ClientMsg, { t: 'throw' }>): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD || ctx.dim !== DIM_OVERWORLD || !Array.isArray(msg.p)) return;
    const p = msg.p.map(Number);
    if (p.length !== 3 || !p.every(Number.isFinite)) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    const at = locateStructure(ctx.world.gen, 'stronghold', Math.floor(s.p[0]), Math.floor(s.p[2]));
    if (!at) return;
    const x = s.p[0], y = s.p[1] + 0.9, z = s.p[2];
    const dx = at[0] - x, dz = at[2] - z, h = Math.hypot(dx, dz);
    const target: [number, number, number] = h > 12 ? [x + (dx / h) * 12, y + 8, z + (dz / h) * 12] : [at[0], at[1], at[2]];
    const e = ctx.entities.spawnThrown(ENDER_EYE, x, y, z, 0, 0, 0, s.id);
    e.eyeTarget = target;
    e.eyeSurvive = ctx.rand() * 5 >= 1;
    ctx.fx('ender_eye_launch', x, y, z);
  }

  /**
   * Fase 7 (pociones): poción arrojadiza o persistente. Como en Minecraft sale algo hacia arriba (20°) y
   * más despacio que un huevo.
   */
  private throwPotion(s: Session, msg: Extract<ClientMsg, { t: 'throw' }>, item: number): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD || !Array.isArray(msg.p) || !Array.isArray(msg.d)) return;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite)) return;
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return;
    const type = Number(msg.w ?? 0);
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const pitch = Math.asin(Math.max(-1, Math.min(1, d[1] / len))) + POTION_THROW_UP;
    const h = Math.hypot(d[0], d[2]) || 1;
    const c = Math.cos(pitch) * POTION_THROW_SPEED;
    const vx = (d[0] / h) * c, vz = (d[2] / h) * c, vy = Math.sin(pitch) * POTION_THROW_SPEED;
    ctx.entities.spawnThrown(item, p[0], p[1], p[2], vx, vy, vz, s.id, isPotionType(type) ? type : 0);
    ctx.fx('throw', p[0], p[1], p[2]);
  }
}
