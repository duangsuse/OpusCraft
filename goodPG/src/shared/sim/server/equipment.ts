// Fase 6.5 (equipo): lo que el servidor hace con el equipo nuevo de los jugadores.
// - Mechero ('ignite'): enciende una vela o una fogata apagadas, o fuego en la cara tocada.
// - Tridente y cohetes ('throw'): el tridente sale disparado (y se desgasta); el cohete sube desde
//   donde se usó.
// - Cuerno de cabra ('horn'): suena para todos los que estén a menos de 256 bloques (con enfriamiento).
// - Caña con zanahoria: el cerdo ensillado que se monta va hacia donde mira el jinete; con 'boost'
//   acelera un rato (y la caña se gasta).
// - Armaduras de caballo y de lobo (clic derecho sobre el animal): ver entities/mobGear.ts.
import { dyedColor } from '../../dyedColor';
import { STATE_DEAD, STATE_SNEAK, type ClientMsg } from '../../protocol';
import { MOB_PIG, MOB_STRIDER, FUNGUS_STICK_WEAR } from '../../mobs';
import { TRIDENT, FIREWORK_ROCKET, CARROT_ON_A_STICK, WARPED_FUNGUS_ON_A_STICK, FIRE_CHARGE, ITEMS } from '../../items';
import {
  TRIDENT_SPEED, GOAT_HORN_COOLDOWN, GOAT_HORN_RANGE, GOAT_HORN_TUNES, CARROT_BOOST_SECONDS, CARROT_BOOST_WEAR, PIG_STEER_SPEED,
  PIG_BOOST_SPEED,
} from '../../equipment';
import type { Entity, InteractResult } from '../entities';
// Fase 7 (encantamientos): el tridente lanzado conserva sus datos (encantamientos, nombre) e Irrompibilidad.
import { sanitizeStack } from '../../containers';
import { UNBREAKING, enchLevel } from '../../enchantments';
import { unbreakingSaves } from '../../enchantEffects';
import type { Fire } from './fire';
import type { Riding } from './riding';
import { DT, r2, type ServerContext, type Session } from './context';

export class Equipment {
  /** Último toque de cuerno de cada jugador (ms). */
  private horns = new Map<string, number>();
  /** Acelerón en curso de cada cerdo guiado (s que le quedan). */
  private boosts = new Map<number, number>();
  /** Cerdos que se están guiando con la caña (para soltarlos cuando se deja). */
  private steered = new Set<number>();

  constructor(private ctx: ServerContext, private fire: Fire, private riding: Riding) {}

  /** Mechero sobre la cara `n` del bloque (x, y, z). */
  onIgnite(s: Session, msg: Extract<ClientMsg, { t: 'ignite' }>): void {
    const ctx = this.ctx;
    const q = Number(msg.q) | 0;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    const n = Array.isArray(msg.n) && msg.n.length === 3 ? msg.n.map(Number) : [];
    const ok = [x, y, z].every(Number.isInteger) && n.length === 3 && n.every((v) => v === -1 || v === 0 || v === 1) &&
      Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]) === 1 && !(s.s & STATE_DEAD) && ctx.reachOk(s, x, y, z, 8);
    if (!ok) {
      ctx.send(s, { t: 'ires', q, ok: false });
      return;
    }
    const lit = ctx.asActor(s.id, () => this.fire.lightBlock(x, y, z) || this.fire.ignite(x + n[0], y + n[1], z + n[2]));
    // Fase 8.3: con la carga de fuego se gasta una (y suena como la bola de fuego); el mechero se desgasta.
    const charge = s.h === FIRE_CHARGE;
    if (lit) ctx.fx(charge ? 'fire_charge_use' : 'ignite', x + 0.5 + n[0] * 0.5, y + 0.5 + n[1] * 0.5, z + 0.5 + n[2] * 0.5);
    else ctx.reject(s, x + n[0], y + n[1], z + n[2]);
    ctx.send(s, { t: 'ires', q, ok: lit, ...(lit && s.mode !== 'c' ? (charge ? { take: 1 } : { wear: 1 }) : {}) });
  }

  /** Lanzar un tridente o soltar un cohete; false si el objeto no es de éstos. */
  onThrow(s: Session, msg: Extract<ClientMsg, { t: 'throw' }>): boolean {
    const ctx = this.ctx;
    const item = Number(msg.item);
    if (item !== TRIDENT && item !== FIREWORK_ROCKET) return false;
    if (s.s & STATE_DEAD || !Array.isArray(msg.p) || !Array.isArray(msg.d)) return true;
    const p = msg.p.map(Number), d = msg.d.map(Number);
    if (p.length !== 3 || d.length !== 3 || ![...p, ...d].every(Number.isFinite)) return true;
    const w = Number(msg.w);
    const data = Number.isInteger(w) && w > 0 ? w : 0;
    if (item === TRIDENT) {
      if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 3) return true;
      const len = Math.hypot(d[0], d[1], d[2]) || 1;
      const max = ITEMS[TRIDENT].tool!.durability;
      // Fase 7 (encantamientos): la pila entera (con sus encantamientos), si la manda el cliente.
      const st = sanitizeStack(msg.st);
      const held = st && st.id === TRIDENT ? st : { id: TRIDENT, count: 1 };
      const worn = st && st.id === TRIDENT ? st.dmg ?? 0 : data;
      // Lanzarlo lo desgasta uno (salvo que Irrompibilidad lo evite); si llega al límite se rompe en el aire.
      const wear = s.mode === 'c' || unbreakingSaves(enchLevel(held, UNBREAKING), false, () => ctx.rand()) ? 0 : 1;
      const dmg = Math.min(max, worn + wear);
      if (dmg >= max) {
        ctx.fx('trident_break', p[0], p[1], p[2]);
        return true;
      }
      const thrown = { ...held, count: 1 };
      if (dmg) thrown.dmg = dmg;
      else delete thrown.dmg;
      ctx.entities.gearShots.spawnTrident(p[0], p[1], p[2], (d[0] / len) * TRIDENT_SPEED, (d[1] / len) * TRIDENT_SPEED, (d[2] / len) * TRIDENT_SPEED, s.id,
        thrown);
      ctx.fx('trident_throw', p[0], p[1], p[2]);
      return true;
    }
    // Fase 8.6: planeando con élitros, el cohete se queda pegado al jugador (lt: los ticks que dura, los del cliente).
    const lt = Number(msg.lt);
    if (Number.isInteger(lt) && lt >= 10 && lt <= 50) {
      ctx.entities.gearShots.attachFirework(s.id, s.p[0], s.p[1], s.p[2], { id: FIREWORK_ROCKET, count: 1, ...(data ? { dmg: data } : {}) }, lt / 20);
      ctx.fx('firework_launch', s.p[0], s.p[1], s.p[2]);
      return true;
    }
    // Cohete: sale del punto donde se usó (junto a la cara del bloque).
    if (!ctx.local && Math.hypot(p[0] - s.p[0], p[1] - s.p[1] - 1.6, p[2] - s.p[2]) > 7) return true;
    ctx.entities.gearShots.spawnFirework(p[0], p[1], p[2], { id: FIREWORK_ROCKET, count: 1, ...(data ? { dmg: data } : {}) }, s.id);
    ctx.fx('firework_launch', p[0], p[1], p[2]);
    return true;
  }

  /** Tocar el cuerno de cabra (tonada `v`, 1..8): lo oyen todos los que estén cerca. */
  onHorn(s: Session, msg: Extract<ClientMsg, { t: 'horn' }>): void {
    const ctx = this.ctx;
    if (s.s & STATE_DEAD) return;
    const now = ctx.now();
    if (now - (this.horns.get(s.id) ?? -Infinity) < GOAT_HORN_COOLDOWN * 1000 - 250) return;
    this.horns.set(s.id, now);
    const tune = Math.max(1, Math.min(GOAT_HORN_TUNES.length, Number(msg.v) | 0 || 1));
    const data = JSON.stringify({ t: 'fx', k: 'goat_horn', p: [r2(s.p[0]), r2(s.p[1] + 1.6), r2(s.p[2])], a: tune });
    for (const o of ctx.sessions()) {
      if (!o.joined) continue;
      if (Math.hypot(o.p[0] - s.p[0], o.p[1] - s.p[1], o.p[2] - s.p[2]) <= GOAT_HORN_RANGE) ctx.sendRaw(o, data);
    }
  }

  /** Acelerón del cerdo que monta el jugador (con la caña con zanahoria en la mano). */
  onBoost(s: Session, msg: Extract<ClientMsg, { t: 'boost' }>): void {
    const ctx = this.ctx;
    const q = Number(msg.q) | 0;
    // Fase 8.3: el strider con la caña con hongo distorsionado (ItemBasedSteering: 140–980 ticks, un uso).
    const strider = this.riddenStrider(s);
    if (strider) {
      const ok = s.h === WARPED_FUNGUS_ON_A_STICK && ctx.entities.mobs.nether.beasts.boost(strider);
      if (ok) ctx.fx('strider_boost', strider.x, strider.y + 1, strider.z);
      ctx.send(s, { t: 'ires', q, ok, ...(ok && s.mode !== 'c' ? { wear: FUNGUS_STICK_WEAR } : {}) });
      return;
    }
    const pig = this.ridden(s);
    if (!pig || (this.boosts.get(pig.id) ?? 0) > 0) {
      ctx.send(s, { t: 'ires', q, ok: false });
      return;
    }
    this.boosts.set(pig.id, CARROT_BOOST_SECONDS);
    ctx.fx('pig_boost', pig.x, pig.y + 0.6, pig.z);
    ctx.send(s, { t: 'ires', q, ok: true, ...(s.mode !== 'c' ? { wear: CARROT_BOOST_WEAR } : {}) });
  }

  /** Fase 8.3: strider ensillado que monta el jugador, o null. */
  private riddenStrider(s: Session): Entity | null {
    const id = this.riding.mountOf(s.id);
    const e = id !== undefined ? this.ctx.entities.list.get(id) : undefined;
    return e && e.type === MOB_STRIDER && e.saddled && !e.dead && e.rider === s.id ? e : null;
  }

  /** Cerdo ensillado que monta el jugador, o null. */
  private ridden(s: Session): Entity | null {
    const id = this.riding.mountOf(s.id);
    const e = id !== undefined ? this.ctx.entities.list.get(id) : undefined;
    return e && e.type === MOB_PIG && e.saddled && !e.dead && e.rider === s.id ? e : null;
  }

  /** Armaduras de caballo y de lobo (poner, quitar); null si no le toca a este sistema. */
  onInteract(s: Session, e: Entity, msg: Extract<ClientMsg, { t: 'interact' }>): InteractResult | null {
    const item = Number(msg.item);
    if (!Number.isInteger(item)) return null;
    // El color de la armadura teñida va en la pila entera (si el cliente la manda y es el mismo objeto).
    const full = msg.st && Number(msg.st.id) === item ? sanitizeStack({ ...msg.st, count: 1 }) : null;
    return this.ctx.entities.gear.interact(e, item, s.name, Number(msg.d) || 0, (s.s & STATE_SNEAK) !== 0, dyedColor(full));
  }

  /** Cada tick: el cerdo va hacia donde mira quien lo monta con la caña en la mano. */
  tick(): void {
    const ctx = this.ctx;
    const now = new Set<number>();
    for (const s of ctx.sessions()) {
      // Fase 8.3: el strider va hacia donde mira quien lo monta con la caña con hongo distorsionado.
      if (s.joined && s.h === WARPED_FUNGUS_ON_A_STICK) {
        const st = this.riddenStrider(s);
        if (st) {
          now.add(st.id);
          const yaw = s.r[0];
          st.leashTo = [st.x - Math.sin(yaw) * 4, st.y + 0.5, st.z - Math.cos(yaw) * 4];
          st.steerSpeed = ctx.entities.mobs.nether.beasts.boostFactor(st);
        }
        continue;
      }
      if (!s.joined || s.h !== CARROT_ON_A_STICK) continue;
      const pig = this.ridden(s);
      if (!pig) continue;
      now.add(pig.id);
      const boost = this.boosts.get(pig.id) ?? 0;
      if (boost > 0) this.boosts.set(pig.id, boost - DT);
      const yaw = s.r[0];
      const reach = 4;
      pig.leashTo = [pig.x - Math.sin(yaw) * reach, pig.y + 0.5, pig.z - Math.cos(yaw) * reach];
      pig.steerSpeed = boost > 0 ? PIG_BOOST_SPEED : PIG_STEER_SPEED;
    }
    for (const id of this.steered) {
      if (now.has(id)) continue;
      const e = ctx.entities.list.get(id);
      if (e) {
        e.steerSpeed = undefined;
        if (!e.leash) e.leashTo = undefined;
      }
      this.boosts.delete(id);
    }
    this.steered = now;
  }
}
