// Fase 6 (monstruos): comportamiento de los monstruos nuevos. MobBrain le cede el tick de cada
// criatura antes de decidir; si devuelve true, el monstruo ya se movió y MobBrain no hace nada más.
//
// - Zombis bajo el agua: se hunden y caminan por el fondo; tras 30 s con la cabeza sumergida se
//   convierten en ahogados (y los zombis momificados, en zombis).
// - Ahogado: nada en tres dimensiones hacia su presa; fuera del agua, es un zombi más.
// - Bruja: guarda las distancias, lanza pociones arrojadizas y bebe curación (o resistencia al
//   fuego) cuando lo necesita. Fase 7 (pociones): como en Minecraft, bebe respiración acuática bajo
//   el agua, resistencia al fuego si arde, curación si está herida y velocidad si su presa está lejos;
//   lanza lentitud (de lejos), veneno, debilidad (de cerca) o daño según lo que ya tenga su presa.
// - Slime: avanza a saltos y hace daño al tocar (los pequeños no); al morir se divide.
// - Phantom: vuela en círculos sobre su presa y se lanza en picado de vez en cuando.
// - Lepisma: si un jugador la hiere, al poco despierta a las de los bloques infestados cercanos.
// - Araña de cueva: su mordisco envenena (normal 7 s, difícil 15 s).
import {
  MOBS, MOB_ZOMBIE, MOB_HUSK, MOB_SPIDER, MOB_DROWNED, MOB_WITCH, MOB_SLIME, MOB_SLIME_MEDIUM, MOB_SLIME_SMALL, MOB_PHANTOM,
  MOB_SILVERFISH, MOB_CAVE_SPIDER, MOB_ZOMBIE_VILLAGER, MOB_ENDERMITE, ENDERMITE_LIFE_TICKS,
} from '../../mobs';
import { BLOCK_FLUID, BLOCK_SOLID, isInfested } from '../../blocks';
import { EFFECT_POISON } from '../../effects';
// Fase 7 (pociones): las brujas beben y lanzan pociones de verdad; a los invisibles los pierden de vista.
import {
  EFFECT_WATER_BREATHING, EFFECT_FIRE_RESISTANCE, EFFECT_SPEED, EFFECT_SLOWNESS, EFFECT_WEAKNESS, packColor, invisibleRange,
} from '../../effects';
import { SPLASH_POTION } from '../../items';
import {
  PT_HARMING, PT_POISON, PT_SLOWNESS, PT_WEAKNESS, PT_HEALING, PT_FIRE_RESISTANCE, PT_WATER_BREATHING, PT_SWIFTNESS,
  potionEffects, potionColor,
} from '../../potions';
import { EF_ACTION } from '../../protocol';
import { felineNear } from './critters'; // Fase 7.5 (fauna): los phantoms no se acercan a gatos ni ocelotes
import { moveBody, lineOfSight } from '../physics';
import { canMeleeHit } from './meleeReach'; // alcance y línea de visión de Java
import { GRAVITY, TAU, angleTo, lerpAngle, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';
import type { MobBrain } from './mobBrain';

/** Segundos con la cabeza bajo el agua para que un zombi se convierta en ahogado. */
export const DROWN_CONVERT_SECONDS = 30;
/** En qué se convierte cada zombi que se ahoga. */
export const DROWNS_INTO: Readonly<Record<number, number>> = {
  [MOB_ZOMBIE]: MOB_DROWNED,
  [MOB_ZOMBIE_VILLAGER]: MOB_DROWNED,
  [MOB_HUSK]: MOB_ZOMBIE,
};
/** Slime que sale al dividirse cada tamaño. */
export const SLIME_SPLIT: Readonly<Record<number, number>> = {
  [MOB_SLIME]: MOB_SLIME_MEDIUM,
  [MOB_SLIME_MEDIUM]: MOB_SLIME_SMALL,
};
/** Gravedad de los objetos lanzados (la misma que usa projectiles.ts). */
const THROWN_GRAVITY = 12;

/** Arañas (normal y de cueva): trepan, saltan al atacar y sólo son hostiles a oscuras. */
export function isSpiderLike(type: number): boolean {
  return type === MOB_SPIDER || type === MOB_CAVE_SPIDER;
}

export function isSlime(type: number): boolean {
  return type === MOB_SLIME || type === MOB_SLIME_MEDIUM || type === MOB_SLIME_SMALL;
}

/** Estado propio de cada monstruo (no se guarda: los monstruos no se guardan). */
interface MonsterState {
  /** Zombis: segundos con la cabeza sumergida. */
  underwater: number;
  /** Bruja: segundos que le quedan bebiendo, qué bebe y cuándo podrá volver a beber. */
  drink: number;
  /** Fase 7 (pociones): tipo de la poción que bebe (-1 ninguna). */
  drinking: number;
  drinkCd: number;
  /** Slime: espera hasta el próximo salto. */
  jumpIn: number;
  /** Phantom: centro y ángulo del círculo, picado en curso y espera hasta el siguiente. */
  cx: number;
  cy: number;
  cz: number;
  angle: number;
  radius: number;
  swoop: number;
  swoopCd: number;
  /** Lepisma: segundos hasta llamar a las demás (≤ 0: no va a llamar). */
  call: number;
}

export class MonsterAI {
  private states = new WeakMap<Entity, MonsterState>();

  constructor(private m: Entities, private brain: MobBrain) {}

  state(e: Entity): MonsterState {
    let s = this.states.get(e);
    if (!s) {
      const r = this.m.rand;
      s = {
        underwater: 0, drink: 0, drinking: -1, drinkCd: 0, jumpIn: r(), cx: e.x, cy: e.y, cz: e.z,
        angle: r() * TAU, radius: 6 + r() * 8, swoop: 0, swoopCd: 3 + r() * 5, call: 0,
      };
      this.states.set(e, s);
    }
    return s;
  }

  /** Tick propio del monstruo; true si ya se encargó de todo (movimiento incluido). */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    if (DROWNS_INTO[e.type] !== undefined) return this.zombieInWater(e, dt, players);
    switch (e.type) {
      case MOB_DROWNED:
        return e.inWater ? this.swim(e, dt, players) : false;
      case MOB_WITCH:
        this.witch(e, dt, players);
        return true;
      case MOB_SLIME:
      case MOB_SLIME_MEDIUM:
      case MOB_SLIME_SMALL:
        this.slime(e, dt, players);
        return true;
      case MOB_PHANTOM:
        this.phantom(e, dt, players);
        return true;
      // Fase 8.6: la endermita sin nombre se va a los 2400 ticks (Endermite.aiStep).
      case MOB_ENDERMITE:
        if (!e.customName && e.age * 20 >= ENDERMITE_LIFE_TICKS) this.m.remove(e.id);
        return false;
      case MOB_SILVERFISH: {
        const s = this.state(e);
        if (s.call > 0) {
          s.call -= dt;
          if (s.call <= 0) this.wakeFriends(e);
        }
        return false;
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ avisos de MobBrain y Entities

  /** Un monstruo acaba de golpear cuerpo a cuerpo a un jugador. */
  onMelee(e: Entity, target: PlayerView): void {
    if (e.type === MOB_CAVE_SPIDER) {
      const d = this.m.host.difficulty();
      if (d >= 2) this.m.host.effectPlayer?.(target.id, EFFECT_POISON, d === 3 ? 15 : 7, 0);
    }
  }

  /** Una criatura recibió daño (antes de comprobar si muere). */
  onDamaged(e: Entity, attacker: string | number | null): void {
    if (e.type === MOB_SILVERFISH && typeof attacker === 'string') {
      const s = this.state(e);
      if (s.call <= 0) s.call = 1;
    }
  }

  /** Una criatura murió (con botín): los slimes se dividen. */
  onKilled(e: Entity): void {
    const child = SLIME_SPLIT[e.type];
    if (child === undefined) return;
    const def = MOBS[e.type];
    const n = 2 + Math.floor(this.m.rand() * 3);
    for (let i = 0; i < n; i++) {
      const ox = ((i & 1) - 0.5) * def.width * 0.5, oz = ((i >> 1) - 0.5) * def.width * 0.5;
      const c = this.m.spawnMob(child, e.x + ox, e.y + 0.1, e.z + oz);
      if (!c) continue;
      c.vx = ox * 4;
      c.vz = oz * 4;
      c.vy = 3;
      c.ai!.target = e.ai?.target ?? null;
    }
  }

  // ------------------------------------------------------------------ utilidades

  /** Presa actual o la más cercana a la vista. */
  private target(e: Entity, players: PlayerView[], range: number, needLos = true): PlayerView | null {
    const ai = e.ai!;
    let t: PlayerView | null = null;
    if (ai.target) t = players.find((p) => p.id === ai.target && p.alive && !p.creative) ?? null;
    if (t && Math.hypot(t.x - e.x, t.z - e.z) > Math.max(40, range)) t = null;
    // Fase 7 (pociones): a alguien invisible lo pierde de vista en cuanto se aleja un poco.
    if (t?.invisible && Math.hypot(t.x - e.x, t.z - e.z) > range * invisibleRange(t.armorPieces ?? 0)) t = null;
    if (!t) t = this.brain.nearestPlayer(e, players, range, needLos);
    ai.target = t ? t.id : null;
    return t;
  }

  /** Golpe cuerpo a cuerpo si la presa está al alcance y a la vista (MeleeAttackGoal.canPerformAttack). */
  private melee(e: Entity, target: PlayerView): boolean {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const dx = target.x - e.x, dz = target.z - e.z;
    const dist = Math.hypot(dx, dz);
    if (def.damage <= 0 || ai.attackCd > 0 || !canMeleeHit(this.m.w, e, target.x, target.y, target.z, 0.6, 1.8, 1.62)) return false;
    ai.attackCd = 1;
    const d = dist || 1;
    this.m.host.hurtPlayer(target.id, def.damage * this.m.difficultyScale(), (dx / d) * 5, 4, (dz / d) * 5, def.key, e); // Fase 7: e (Espinas)
    this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
    this.onMelee(e, target);
    return true;
  }

  /** Paseo sin rumbo: dirección [x, z] y velocidad (0 = quieto). */
  wander(e: Entity): [number, number, number] {
    const ai = e.ai!;
    if (ai.think <= 0) {
      ai.think = 3 + this.m.rand() * 6;
      if (this.m.rand() < 0.6) {
        const a = this.m.rand() * TAU, r = 3 + this.m.rand() * 7;
        ai.goal = [Math.floor(e.x + Math.cos(a) * r), Math.floor(e.y), Math.floor(e.z + Math.sin(a) * r)];
      } else ai.goal = null;
    }
    if (!ai.goal) return [0, 0, 0];
    const dx = ai.goal[0] + 0.5 - e.x, dz = ai.goal[2] + 0.5 - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      ai.goal = null;
      return [0, 0, 0];
    }
    return [dx / d, dz / d, MOBS[e.type].walk];
  }

  /** Orientación del cuerpo según la velocidad y de la cabeza hacia `lookAt`. */
  private orient(e: Entity, lookAt: [number, number, number] | null, dt: number): void {
    if (Math.hypot(e.vx, e.vz) > 0.3) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 8);
    if (lookAt) {
      e.yaw = lerpAngle(e.yaw, angleTo(e.x, e.z, lookAt[0], lookAt[2]), dt * 10);
      e.pitch = Math.atan2(lookAt[1] - (e.y + e.height * 0.85), Math.hypot(lookAt[0] - e.x, lookAt[2] - e.z));
    } else {
      e.yaw = lerpAngle(e.yaw, e.bodyYaw, dt * 3);
      e.pitch *= 1 - Math.min(1, dt * 3);
    }
  }

  /** Movimiento a pie (como el de MobBrain): aceleración, flotar, gravedad, saltos y caídas. */
  walk(e: Entity, mx: number, mz: number, speed: number, lookAt: [number, number, number] | null, dt: number): void {
    const ai = e.ai!;
    const want = speed > 0 && (mx !== 0 || mz !== 0);
    if (want) {
      const l = Math.hypot(mx, mz) || 1;
      mx /= l;
      mz /= l;
    }
    const acc = e.onGround ? 10 : e.inWater ? 4 : 2;
    e.vx += (mx * speed - e.vx) * Math.min(1, dt * acc);
    e.vz += (mz * speed - e.vz) * Math.min(1, dt * acc);
    if (e.inWater || e.inLava) {
      e.vy += (1.8 - e.vy) * Math.min(1, dt * 3);
      if (e.hitWall) e.vy = Math.max(e.vy, 4);
    } else {
      e.vy = Math.max(-60, e.vy - GRAVITY * dt);
    }
    if (e.onGround && e.hitWall && want) e.vy = 8.6;
    const wasGround = e.onGround;
    const prevVy = e.vy;
    moveBody(e, this.m.w, dt, 0.6);
    if (!wasGround && e.onGround && !e.inWater) {
      const fall = e.fallStart - e.y;
      if (fall > 3.5 && prevVy < -8) this.m.damage(e, Math.floor(fall - 3), e.x, e.z, null, 0);
    }
    if (e.onGround || e.inWater) e.fallStart = e.y;
    else e.fallStart = Math.max(e.fallStart, e.y);
    const moved = Math.hypot(e.x - ai.lastX, e.z - ai.lastZ);
    ai.stuck = want && moved < speed * dt * 0.2 ? ai.stuck + dt : 0;
    if (ai.stuck > 2) {
      ai.goal = null;
      ai.path = null;
      ai.stuck = 0;
      ai.think = 0;
    }
    ai.lastX = e.x;
    ai.lastZ = e.z;
    this.orient(e, lookAt, dt);
  }

  /** Cambia una criatura por otra en el mismo sitio (zombi ahogado → ahogado). */
  convert(e: Entity, type: number): Entity | null {
    const n = this.m.spawnMob(type, e.x, e.y, e.z);
    if (!n) return null;
    n.yaw = e.yaw;
    n.bodyYaw = e.bodyYaw;
    n.vx = e.vx;
    n.vy = e.vy;
    n.vz = e.vz;
    n.health = Math.max(1, Math.min(n.maxHealth, e.health));
    n.ai!.target = e.ai?.target ?? null;
    this.m.host.fx('mob_convert', e.x, e.y + e.height / 2, e.z, type);
    this.m.remove(e.id);
    return n;
  }

  // ------------------------------------------------------------------ zombis y ahogados

  /** Zombis en el agua: se hunden y caminan por el fondo; si se ahogan, se convierten. */
  private zombieInWater(e: Entity, dt: number, players: PlayerView[]): boolean {
    const s = this.state(e);
    const w = this.m.w;
    const eye = w.getBlock(Math.floor(e.x), Math.floor(e.y + e.height * 0.85), Math.floor(e.z));
    s.underwater = eye > 0 && BLOCK_FLUID[eye] === 1 ? s.underwater + dt : 0;
    if (s.underwater >= DROWN_CONVERT_SECONDS) {
      this.convert(e, DROWNS_INTO[e.type]);
      return true;
    }
    if (!e.inWater) return false;
    const def = MOBS[e.type];
    const target = this.target(e, players, 24);
    let mx = 0, mz = 0, speed = 0;
    let lookAt: [number, number, number] | null = null;
    if (target) {
      const dx = target.x - e.x, dz = target.z - e.z;
      const d = Math.hypot(dx, dz) || 1;
      mx = dx / d;
      mz = dz / d;
      speed = def.walk;
      lookAt = [target.x, target.y + 1.6, target.z];
      this.melee(e, target);
    } else [mx, mz, speed] = this.wander(e);
    e.vx += (mx * speed - e.vx) * Math.min(1, dt * 4);
    e.vz += (mz * speed - e.vz) * Math.min(1, dt * 4);
    // Se hunde despacio; contra una orilla, trepa para salir.
    e.vy += (-1.2 - e.vy) * Math.min(1, dt * 2);
    if (e.hitWall && speed > 0) e.vy = 4;
    moveBody(e, w, dt, 0.6);
    e.fallStart = e.y;
    this.orient(e, lookAt, dt);
    this.brain.updateFlags(e, e.ai!);
    return true;
  }

  /** Ahogado dentro del agua: nada hacia su presa en tres dimensiones; sin presa, ronda el fondo. */
  private swim(e: Entity, dt: number, players: PlayerView[]): boolean {
    const ai = e.ai!;
    const target = this.target(e, players, 24);
    let mx = 0, my = 0, mz = 0, speed = 0;
    let lookAt: [number, number, number] | null = null;
    if (target) {
      const dx = target.x - e.x, dy = target.y + 0.9 - (e.y + e.height / 2), dz = target.z - e.z;
      const d = Math.hypot(dx, dy, dz) || 1;
      mx = dx / d;
      my = dy / d;
      mz = dz / d;
      speed = 2.6;
      lookAt = [target.x, target.y + 1.6, target.z];
      this.melee(e, target);
    } else {
      if (ai.think <= 0) {
        ai.think = 3 + this.m.rand() * 4;
        const a = this.m.rand() * TAU;
        ai.swimDir = this.m.rand() < 0.4 ? [0, 0, 0] : [Math.cos(a), 0, Math.sin(a)];
      }
      mx = ai.swimDir[0];
      mz = ai.swimDir[2];
      my = -0.8;
      speed = 0.9;
    }
    const k = Math.min(1, dt * 3);
    e.vx += (mx * speed - e.vx) * k;
    e.vy += (my * speed - e.vy) * k;
    e.vz += (mz * speed - e.vz) * k;
    if (e.hitWall && speed > 0) e.vy = Math.max(e.vy, 3);
    moveBody(e, this.m.w, dt, 0.6);
    e.fallStart = e.y;
    this.orient(e, lookAt, dt);
    this.brain.updateFlags(e, ai);
    return true;
  }

  // ------------------------------------------------------------------ bruja

  private witch(e: Entity, dt: number, players: PlayerView[]): void {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const s = this.state(e);
    const target = this.target(e, players, 16);
    // Fase 7 (pociones): beber (como en Minecraft, con probabilidades por tick: 15 % las de agua y fuego,
    // 5 % la curación y 50 % la velocidad) y, al acabar, notar sus efectos.
    if (s.drink > 0) {
      s.drink -= dt;
      if (s.drink <= 0) {
        for (const [id, secs, amp] of potionEffects(s.drinking)) this.m.effects.add(e, id, secs, amp);
        this.m.host.fx('witch_drink', e.x, e.y + 1.6, e.z, packColor(potionColor(s.drinking)));
        s.drinking = -1;
      }
    } else {
      const chance = (perTick: number) => this.m.rand() < 1 - Math.pow(1 - perTick, dt * 20);
      const fx = this.m.effects;
      const eyes = this.m.w.getBlock(Math.floor(e.x), Math.floor(e.y + e.height * 0.85), Math.floor(e.z));
      let p = -1;
      if (eyes > 0 && BLOCK_FLUID[eyes] === 1 && !fx.has(e, EFFECT_WATER_BREATHING) && chance(0.15)) p = PT_WATER_BREATHING;
      else if ((e.fire > 0 || e.inLava) && !fx.has(e, EFFECT_FIRE_RESISTANCE) && chance(0.15)) p = PT_FIRE_RESISTANCE;
      else if (e.health < e.maxHealth && chance(0.05)) p = PT_HEALING;
      else if (target && !fx.has(e, EFFECT_SPEED) && Math.hypot(target.x - e.x, target.z - e.z) > 11 && chance(0.5)) p = PT_SWIFTNESS;
      if (p >= 0) {
        s.drink = 1.6;
        s.drinking = p;
      }
    }
    let mx = 0, mz = 0, speed = 0;
    let lookAt: [number, number, number] | null = null;
    if (target) {
      const dx = target.x - e.x, dz = target.z - e.z;
      const dist = Math.hypot(dx, dz) || 1;
      lookAt = [target.x, target.y + 1.6, target.z];
      const los = dist < 20 && lineOfSight(this.m.w, e.x, e.y + e.height * 0.85, e.z, target.x, target.y + 1.5, target.z);
      if (s.drink <= 0) {
        if (dist < 5) {
          mx = -dx / dist;
          mz = -dz / dist;
          speed = def.walk;
        } else if (dist > 10 || !los) {
          const [fx, fz] = this.brain.followPath(e, target, dt);
          mx = fx;
          mz = fz;
          speed = def.run;
        } else {
          const side = Math.sin(e.age * 0.5 + e.id) > 0 ? 1 : -1;
          mx = (-dz / dist) * side;
          mz = (dx / dist) * side;
          speed = def.walk * 0.5;
        }
        // RangedAttackGoal de la bruja: a 10 bloques como mucho (en 3D, no sólo en horizontal).
        if (los && Math.hypot(dx, target.y - e.y, dz) <= 10 && ai.shootCd <= 0) {
          ai.shootCd = 2.5 + this.m.rand() * 1.5;
          this.throwPotion(e, target, dist);
        }
      }
    } else if (s.drink <= 0) [mx, mz, speed] = this.wander(e);
    this.walk(e, mx, mz, speed, lookAt, dt);
    this.brain.updateFlags(e, ai);
    if (s.drink > 0) e.flags |= EF_ACTION;
  }

  /**
   * Poción arrojadiza hacia la presa (Fase 7, como en Minecraft): lentitud si está lejos y no la tiene;
   * si no, veneno si le queda vida y no lo tiene; debilidad a veces si está muy cerca; si no, daño.
   */
  throwPotion(e: Entity, target: PlayerView, dist: number): Entity {
    const has = (id: number) => !!target.fx?.has(id);
    const type = dist >= 8 && !has(EFFECT_SLOWNESS) ? PT_SLOWNESS
      : (target.hp ?? 20) >= 8 && !has(EFFECT_POISON) ? PT_POISON
        : dist <= 3 && !has(EFFECT_WEAKNESS) && this.m.rand() < 0.25 ? PT_WEAKNESS : PT_HARMING;
    const sx = e.x, sy = e.y + e.height * 0.8, sz = e.z;
    const dx = target.x - sx, dz = target.z - sz;
    const horiz = Math.max(1e-3, Math.hypot(dx, dz));
    const t = Math.max(0.15, horiz / 12);
    const vy = (target.y + 1 - sy) / t + 0.5 * THROWN_GRAVITY * t;
    const p = this.m.spawnThrown(SPLASH_POTION, sx + (dx / horiz) * 0.5, sy, sz + (dz / horiz) * 0.5, dx / t, vy, dz / t, '', type);
    p.shooter = e.id;
    this.m.host.fx('throw', sx, sy, sz);
    return p;
  }

  // ------------------------------------------------------------------ slime

  private slime(e: Entity, dt: number, players: PlayerView[]): void {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const s = this.state(e);
    const target = this.target(e, players, 16);
    if (e.onGround) {
      // En el suelo se queda quieto hasta el próximo salto.
      const k = Math.min(1, dt * 12);
      e.vx -= e.vx * k;
      e.vz -= e.vz * k;
      s.jumpIn -= dt;
      if (s.jumpIn <= 0) {
        s.jumpIn = target ? 0.4 + this.m.rand() * 0.8 : 1 + this.m.rand() * 2.5;
        let dx = 0, dz = 0, sp = 0;
        if (target) {
          dx = target.x - e.x;
          dz = target.z - e.z;
          sp = def.run;
        } else if (this.m.rand() < 0.6) {
          const a = this.m.rand() * TAU;
          dx = Math.cos(a);
          dz = Math.sin(a);
          sp = def.walk;
        }
        const d = Math.hypot(dx, dz);
        if (d > 0.01) {
          e.vy = 5.5 + def.scale * 0.4;
          e.vx = (dx / d) * sp;
          e.vz = (dz / d) * sp;
          e.bodyYaw = Math.atan2(-dx, -dz);
          this.m.host.fx('slime_jump', e.x, e.y, e.z, e.type);
        }
      }
    }
    if (e.inWater || e.inLava) e.vy += (1.8 - e.vy) * Math.min(1, dt * 3);
    else e.vy = Math.max(-60, e.vy - GRAVITY * dt);
    moveBody(e, this.m.w, dt);
    // Los slimes no se hacen daño al caer.
    e.fallStart = e.y;
    if (target) {
      const dx = target.x - e.x, dz = target.z - e.z;
      // Slime.dealDamage: al alcance (la caja de ataque de Java) y viéndolo.
      if (def.damage > 0 && ai.attackCd <= 0 && canMeleeHit(this.m.w, e, target.x, target.y, target.z, 0.6, 1.8, 1.62)) {
        ai.attackCd = 1;
        const d = Math.hypot(dx, dz) || 1;
        this.m.host.hurtPlayer(target.id, def.damage * this.m.difficultyScale(), (dx / d) * 4, 3, (dz / d) * 4, 'slime', e); // Fase 7: e (Espinas)
        this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.5, e.z, e.type);
      }
      e.yaw = lerpAngle(e.yaw, angleTo(e.x, e.z, target.x, target.z), dt * 6);
    } else e.yaw = lerpAngle(e.yaw, e.bodyYaw, dt * 4);
    this.brain.updateFlags(e, ai);
    // En el aire: los clientes lo estiran.
    if (!e.onGround) e.flags |= EF_ACTION;
  }

  // ------------------------------------------------------------------ phantom

  private phantom(e: Entity, dt: number, players: PlayerView[]): void {
    const def = MOBS[e.type];
    const ai = e.ai!;
    const s = this.state(e);
    const target = this.target(e, players, 64, false);
    if (target) {
      s.cx = target.x;
      s.cz = target.z;
      s.cy = target.y + 12;
    }
    // Fase 7.5 (fauna): con un gato u ocelote a 16 bloques no se lanza en picado (y remonta).
    if (felineNear(this.m, e.x, e.y, e.z, 16)) {
      if (s.swoop > 0) s.cy = Math.max(s.cy, e.y + 6);
      s.swoop = 0;
      s.swoopCd = Math.max(s.swoopCd, 1);
    }
    let tx: number, ty: number, tz: number, speed: number, turn: number;
    if (s.swoop > 0 && target) {
      // Picado: directo al jugador; tras golpear (o si pasa el tiempo) vuelve a subir.
      s.swoop -= dt;
      tx = target.x;
      ty = target.y + 0.9;
      tz = target.z;
      speed = def.run;
      turn = 4;
      const d = Math.hypot(target.x - e.x, target.y + 0.9 - (e.y + e.height / 2), target.z - e.z);
      if (d < 1.3 && ai.attackCd <= 0) {
        ai.attackCd = 1;
        const h = Math.hypot(e.vx, e.vz) || 1;
        this.m.host.hurtPlayer(target.id, def.damage * this.m.difficultyScale(), (e.vx / h) * 4, 3, (e.vz / h) * 4, def.key, e); // Fase 7: e (Espinas)
        this.m.host.fx('mob_attack', e.x, e.y, e.z, e.type);
        s.swoop = 0;
      }
      if (s.swoop <= 0) s.swoopCd = 4 + this.m.rand() * 6;
    } else {
      s.swoop = 0;
      s.angle += dt * (def.walk / s.radius);
      tx = s.cx + Math.cos(s.angle) * s.radius;
      tz = s.cz + Math.sin(s.angle) * s.radius;
      ty = s.cy + Math.sin(e.age * 0.8 + e.id) * 1.5;
      speed = def.walk;
      turn = 2;
      if (target) {
        s.swoopCd -= dt;
        if (s.swoopCd <= 0 && lineOfSight(this.m.w, e.x, e.y, e.z, target.x, target.y + 1.5, target.z)) s.swoop = 3;
      }
    }
    const dx = tx - e.x, dy = ty - e.y, dz = tz - e.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, dt * turn);
    e.vx += ((dx / d) * speed - e.vx) * k;
    e.vy += ((dy / d) * speed - e.vy) * k;
    e.vz += ((dz / d) * speed - e.vz) * k;
    moveBody(e, this.m.w, dt);
    if (e.hitWall || e.onGround || e.inWater) {
      // Chocó: remonta el vuelo y abandona el picado.
      e.vy = Math.max(e.vy, 4);
      s.cy = Math.max(s.cy, e.y + 4);
      s.swoop = 0;
    }
    e.fallStart = e.y;
    const h = Math.hypot(e.vx, e.vz);
    if (h > 0.3) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 6);
    e.yaw = e.bodyYaw;
    e.pitch = Math.atan2(e.vy, Math.max(0.5, h)) * 0.8;
    this.brain.updateFlags(e, ai);
    if (s.swoop > 0) e.flags |= EF_ACTION;
  }

  // ------------------------------------------------------------------ lepisma

  /** Rompe bloques infestados cercanos: de cada uno sale una lepisma (ver server/monsters.ts). */
  wakeFriends(e: Entity): number {
    const w = this.m.w;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    let woken = 0;
    for (let dy = -5; dy <= 5 && woken < 8; dy++) {
      for (let dz = -10; dz <= 10 && woken < 8; dz++) {
        for (let dx = -10; dx <= 10 && woken < 8; dx++) {
          if (!isInfested(w.getBlock(bx + dx, by + dy, bz + dz))) continue;
          if (this.m.rand() < 0.5) continue;
          this.m.host.breakBlock(bx + dx, by + dy, bz + dz, false);
          woken++;
        }
      }
    }
    return woken;
  }
}

/** ¿Cabe una criatura de `width` de ancho en (x, y, z)? (celdas libres alrededor, a 2 alturas). */
export function roomFor(get: (x: number, y: number, z: number) => number, x: number, y: number, z: number, width: number): boolean {
  const r = Math.ceil(width / 2 - 0.5);
  for (let dy = 0; dy < Math.max(1, Math.ceil(width)); dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const b = get(x + dx, y + dy, z + dz);
        if (b < 0 || BLOCK_SOLID[b]) return false;
      }
    }
  }
  return true;
}
