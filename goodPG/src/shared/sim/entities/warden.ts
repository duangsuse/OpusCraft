// Fase 7.5 (abismo): comportamiento del warden (el WardenAi de Minecraft). MobBrain le cede el tick entero.
//
// - Es ciego: sólo siente vibraciones (a 16 bloques; tras cada una, 2 s sordo) y huele (cada 5–10 s, si
//   hay alguien a 24 bloques, olfatea 4,2 s: a quien esté a menos de 6 le tiene más enfado).
// - Enfado por cada criatura o jugador (0..150): +35 por cada vibración suya, +35 al olerlo o tocarlo, +100
//   al pegarle; con un proyectil, +10 a quien lo lanzó (+35 si repite en 5 s). Baja 1 por segundo. A partir
//   de 80 ruge (4,2 s) y lo persigue; mientras no, va a mirar de dónde vino la última vibración.
// - Ataca cuerpo a cuerpo (30 en normal, cada 0,9 s) y, si no puede alcanzarlo, con el estampido sónico:
//   lo carga 1,7 s y golpea a 15 bloques en horizontal y 20 en vertical, atravesando paredes, armadura,
//   escudos y encantamientos (10 de daño y un buen empujón). Tras cada golpe, 2 s sin estampido; al
//   elegir presa, 10 s.
// - Cada 6 s da Oscuridad a los jugadores a menos de 20 bloques.
// - Sale del suelo (6,7 s, invulnerable) y, tras 60 s sin que nada lo moleste, se vuelve a hundir (5 s).
// - No lo empujan los golpes y no arde.
import { MOBS, MOB_WARDEN, ENT_ARROW, ENT_THROWN, WARDEN_POSE_SHIFT, WARDEN_ANGER_SHIFT, WARDEN_TENDRILS, POSE_IDLE,
  POSE_EMERGING, POSE_DIGGING, POSE_SNIFFING, POSE_ROARING, POSE_SONIC, POSE_ATTACK, EMERGE_TICKS, DIG_TICKS, ROAR_TICKS,
  SNIFF_TICKS, SONIC_TICKS, SONIC_HIT_TICK, ANGER_ANGRY, ANGER_MAX, angerBits } from '../../mobs';
import { ENT_TRIDENT } from '../../equipment';
import { ENT_ARMOR_STAND } from '../../armorStands';
import { EF_HURT, EF_DEAD, EF_ANGRY } from '../../protocol';
import { EFFECT_DARKNESS } from '../../effects';
import { VOID_Y } from '../../constants';
import { moveBody } from '../physics';
import { GRAVITY, TAU, angleTo, lerpAngle, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';
import type { MobBrain } from './mobBrain';
import type { EntityVibrationListener, VibrationSource } from '../server/vibrations';
import { packDelta, type VibrationEvent } from '../../vibrations';

/** A quién tiene enfado: id de sesión de un jugador o id de una entidad. */
type Who = string | number;

interface WardenState {
  pose: number;
  /** Ticks que le quedan a la pose actual (0: sin pose). */
  poseT: number;
  anger: Map<Who, number>;
  target: Who | null;
  roarAt: Who | null;
  /** Lugar al que va a mirar (la última vibración) y ticks que lo recuerda. */
  disturb: [number, number, number] | null;
  disturbT: number;
  sniffCd: number;
  digCd: number;
  vibrationCd: number;
  touchCd: number;
  recentProjectile: number;
  attackCd: number;
  sonicCd: number;
  tendrils: number;
  /** Ticks hasta el próximo paseo. */
  strollCd: number;
  stroll: [number, number] | null;
  listening: boolean;
  /** Ticks que lleva vivo (su reloj) y último tick en que dio Oscuridad a cada jugador. */
  t: number;
  darkAt: Map<string, number>;
}

/** Ticks entre pulsos de Oscuridad y su alcance. */
const DARKNESS_EVERY = 120;
const DARKNESS_RANGE = 20;
/** Oscuridad: 13 s; no se renueva si le quedan más de 10 s. */
const DARKNESS_SECONDS = 13;
const DARKNESS_RENEW_TICKS = 60;
/** Distancia a la que busca presa para olfatear y la que huele. */
const SNIFF_RANGE = 24;
const SMELL_RANGE = 6;
/** Espera tras una vibración, tras tocarlo y memoria de proyectiles (ticks). */
const VIBRATION_COOLDOWN = 40;
const TOUCH_COOLDOWN = 20;
const RECENT_PROJECTILE = 100;
/** Ticks sin que nada lo moleste hasta hundirse, y los que recuerda un lugar al que ir. */
const DIG_COOLDOWN = 1200;
const DISTURBANCE_TICKS = 100;
const ATTACK_COOLDOWN = 18;
const SONIC_COOLDOWN = 40;
const TARGET_SONIC_COOLDOWN = 200;
const SONIC_RANGE_XZ = 15, SONIC_RANGE_Y = 20;
const SONIC_DAMAGE = 10;
/** Alcance del golpe (horizontal, desde el centro). */
const MELEE_REACH = 2.1;
/** Velocidades (bloques/s): paseo, ir a mirar y persecución. */
const STROLL_SPEED = 1.4;
const INVESTIGATE_SPEED = 2.2;
const CHASE_SPEED = 4.6;
/** Altura de los «oídos» (donde llegan las vibraciones). */
const EAR = 2.4;

export class WardenAI {
  private states = new WeakMap<Entity, WardenState>();
  /** Sistema de vibraciones del servidor (lo pone sim/server/deepDark.ts). */
  vibrations: { listen(l: EntityVibrationListener): void } | null = null;

  constructor(private m: Entities, private brain: MobBrain) {}

  state(e: Entity): WardenState {
    let s = this.states.get(e);
    if (!s) {
      s = {
        pose: POSE_IDLE, poseT: 0, anger: new Map(), target: null, roarAt: null, disturb: null, disturbT: 0,
        sniffCd: 100 + Math.floor(this.m.rand() * 100), digCd: DIG_COOLDOWN, vibrationCd: 0, touchCd: 0, recentProjectile: 0,
        attackCd: 0, sonicCd: 0, tendrils: 0, strollCd: 60, stroll: null, listening: false, t: 0, darkAt: new Map(),
      };
      this.states.set(e, s);
      // No desaparece por estar lejos y se guarda con el mundo (se hunde él solo).
      e.persist = true;
    }
    return s;
  }

  /** Sale del suelo (invocado por un chillador o con un huevo). */
  emerge(e: Entity): void {
    const s = this.state(e);
    s.pose = POSE_EMERGING;
    s.poseT = EMERGE_TICKS;
    this.m.host.fx('warden_emerge', e.x, e.y, e.z, this.m.w.getBlock(Math.floor(e.x), Math.floor(e.y - 0.5), Math.floor(e.z)));
  }

  /** Enfado actual hacia alguien (para las pruebas y el cliente). */
  angerAt(e: Entity, who: Who): number {
    return this.state(e).anger.get(who) ?? 0;
  }

  /** Presa actual (null si ninguna). */
  targetOf(e: Entity): Who | null {
    return this.state(e).target;
  }

  poseOf(e: Entity): number {
    return this.state(e).pose;
  }

  // ------------------------------------------------------------------ avisos

  /** Le han pegado: +100 de enfado y, si no tenía presa, va a por quien le pegó. */
  onDamaged(e: Entity, attacker: Who | null): void {
    if (e.type !== MOB_WARDEN) return;
    // No lo empujan los golpes.
    e.vx = 0;
    e.vz = 0;
    e.vy = Math.min(e.vy, 0);
    const s = this.state(e);
    if (attacker === null || s.pose === POSE_EMERGING || s.pose === POSE_DIGGING) return;
    this.increaseAnger(e, s, attacker, ANGER_ANGRY + 20);
    if (s.target === null && this.valid(attacker)) this.setTarget(e, s, attacker);
  }

  /** Llega una vibración (onReceiveVibration de Minecraft). */
  private onVibration(e: Entity, ev: VibrationEvent, x: number, y: number, z: number, src: VibrationSource): void {
    const s = this.state(e);
    s.vibrationCd = VIBRATION_COOLDOWN;
    s.tendrils = 10;
    this.m.host.fx('warden_tendril', e.x, e.y + 2.9, e.z, e.id);
    let loc: [number, number, number] = [x, y, z];
    const owner = ev === 'projectile_land' ? src.owner ?? null : null;
    if (owner !== null) {
      const o = this.posOf(owner);
      if (o && Math.hypot(o[0] - e.x, o[1] - e.y, o[2] - e.z) < 30) {
        if (s.recentProjectile > 0) {
          if (this.valid(owner)) loc = o;
          this.increaseAnger(e, s, owner, 35);
        } else this.increaseAnger(e, s, owner, 10);
      }
      s.recentProjectile = RECENT_PROJECTILE;
    } else if (src.who !== undefined && src.who !== null) this.increaseAnger(e, s, src.who, 35);
    if (this.activeAnger(s) < ANGER_ANGRY) {
      const active = this.active(s);
      if (owner !== null || active === null || active === src.who) this.setDisturbance(s, loc);
    }
    s.digCd = DIG_COOLDOWN;
  }

  // ------------------------------------------------------------------ tick

  /** Tick propio del warden; true si era un warden. */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    if (e.type !== MOB_WARDEN) return false;
    const s = this.state(e);
    const ticks = Math.max(1, Math.round(dt * 20));
    const before = s.t;
    s.t += ticks;
    const every = (n: number) => Math.floor((s.t + e.id) / n) !== Math.floor((before + e.id) / n);
    if (e.y < VOID_Y) {
      this.m.kill(e, false);
      return true;
    }
    if (!s.listening && this.vibrations) {
      s.listening = true;
      this.vibrations.listen({
        entity: e, range: 16, eye: EAR,
        accepts: () => !e.dead && s.vibrationCd <= 0 && s.pose !== POSE_EMERGING && s.pose !== POSE_DIGGING,
        receive: (ev, x, y, z, src) => this.onVibration(e, ev, x, y, z, src),
      });
    }
    // No arde (ni en la lava).
    e.fire = 0;
    e.burnAcc = 0;
    for (const k of ['vibrationCd', 'touchCd', 'recentProjectile', 'attackCd', 'sonicCd', 'tendrils', 'strollCd'] as const) {
      if (s[k] > 0) s[k] = Math.max(0, s[k] - ticks);
    }
    if (s.disturbT > 0 && (s.disturbT -= ticks) <= 0) s.disturb = null;
    // Enfado: baja 1 por segundo y se olvida de quien ya no está.
    if (every(20)) {
      for (const [who, a] of s.anger) {
        if (a <= 1 || !this.valid(who)) s.anger.delete(who);
        else s.anger.set(who, a - 1);
      }
    }
    // Pulso de Oscuridad.
    if (every(DARKNESS_EVERY) && s.pose !== POSE_EMERGING && s.pose !== POSE_DIGGING) this.darkness(e, s, players);
    const speed = this.decide(e, s, ticks, players);
    this.move(e, s, dt, speed);
    this.updateFlags(e, s);
    return true;
  }

  /** Decide qué hace este tick; devuelve [dirección x, dirección z, velocidad, mirar a] en `s.stroll`… */
  private decide(e: Entity, s: WardenState, ticks: number, players: PlayerView[]): [number, number, number] {
    // Saliendo del suelo o hundiéndose: quieto e invulnerable.
    if (s.pose === POSE_EMERGING || s.pose === POSE_DIGGING) {
      e.invuln = 1;
      s.poseT -= ticks;
      if (s.poseT <= 0) {
        if (s.pose === POSE_DIGGING) {
          this.m.remove(e.id);
          return [0, 0, 0];
        }
        s.pose = POSE_IDLE;
        s.digCd = DIG_COOLDOWN;
      }
      return [0, 0, 0];
    }
    // Tocarlo enfada.
    if (s.touchCd <= 0) {
      for (const p of players) {
        if (!p.alive || p.creative) continue;
        if (Math.abs(p.x - e.x) < 0.75 && Math.abs(p.z - e.z) < 0.75 && p.y < e.y + e.height && p.y + 1.8 > e.y) {
          s.touchCd = TOUCH_COOLDOWN;
          this.increaseAnger(e, s, p.id, 35);
          this.setDisturbance(s, [p.x, p.y, p.z]);
          break;
        }
      }
    }
    // Presa: la que tiene enfado de sobra; si se le pasa, la deja.
    if (s.target !== null && (!this.valid(s.target) || (s.anger.get(s.target) ?? 0) < ANGER_ANGRY)) {
      if (!this.valid(s.target)) s.anger.delete(s.target);
      s.target = null;
      s.digCd = DIG_COOLDOWN;
    }
    const active = this.active(s);
    if (s.target === null && s.roarAt === null && active !== null && (s.anger.get(active) ?? 0) >= ANGER_ANGRY && s.pose !== POSE_SONIC) {
      s.roarAt = active;
      s.pose = POSE_ROARING;
      s.poseT = ROAR_TICKS;
      this.m.host.fx('warden_roar', e.x, e.y + 2.2, e.z);
    }
    // Rugiendo: mira a su presa y al terminar va a por ella.
    if (s.pose === POSE_ROARING) {
      const t = s.roarAt !== null ? this.posOf(s.roarAt) : null;
      if (t) this.look(e, t[0], t[2]);
      s.poseT -= ticks;
      if (s.poseT <= 0) {
        s.pose = POSE_IDLE;
        if (s.roarAt !== null && this.valid(s.roarAt)) this.setTarget(e, s, s.roarAt);
        s.roarAt = null;
      }
      return [0, 0, 0];
    }
    if (s.target !== null) return this.fight(e, s, ticks);
    if (s.pose === POSE_SONIC || s.pose === POSE_ATTACK) s.pose = POSE_IDLE;
    // Olfatear.
    if (s.pose === POSE_SNIFFING) {
      s.poseT -= ticks;
      if (s.poseT <= 0) {
        s.pose = POSE_IDLE;
        const near = this.nearestAttackable(e, players);
        if (near) {
          if (Math.hypot(near.x - e.x, near.z - e.z) <= SMELL_RANGE && Math.abs(near.y - e.y) <= 20) this.increaseAnger(e, s, near.id, 35);
          if (!s.disturb) this.setDisturbance(s, [near.x, near.y, near.z]);
        }
      }
      return [0, 0, 0];
    }
    if (s.sniffCd <= 0 && e.onGround && this.nearestAttackable(e, players)) {
      s.sniffCd = 100 + Math.floor(this.m.rand() * 100);
      s.pose = POSE_SNIFFING;
      s.poseT = SNIFF_TICKS;
      this.m.host.fx('warden_sniff', e.x, e.y + 2.2, e.z);
      return [0, 0, 0];
    }
    s.sniffCd = Math.max(0, s.sniffCd - ticks);
    // Ir a mirar de dónde vino la vibración.
    if (s.disturb) {
      const [dx, , dz] = s.disturb;
      if (Math.hypot(dx - e.x, dz - e.z) < 2) s.disturb = null;
      else return this.walkTo(e, s.disturb, INVESTIGATE_SPEED);
    }
    // Sin nada que hacer durante un minuto: se hunde.
    if (s.digCd > 0) s.digCd = Math.max(0, s.digCd - ticks);
    else if (e.onGround && s.anger.size === 0) {
      s.pose = POSE_DIGGING;
      s.poseT = DIG_TICKS;
      this.m.host.fx('warden_dig', e.x, e.y, e.z, this.m.w.getBlock(Math.floor(e.x), Math.floor(e.y - 0.5), Math.floor(e.z)));
      return [0, 0, 0];
    }
    // Paseo lento de vez en cuando.
    if (s.strollCd <= 0) {
      s.strollCd = 120 + Math.floor(this.m.rand() * 200);
      const a = this.m.rand() * TAU, r = 3 + this.m.rand() * 7;
      s.stroll = this.m.rand() < 0.6 ? [e.x + Math.cos(a) * r, e.z + Math.sin(a) * r] : null;
    }
    if (s.stroll) {
      if (Math.hypot(s.stroll[0] - e.x, s.stroll[1] - e.z) < 1) s.stroll = null;
      else return this.walkTo(e, [s.stroll[0], e.y, s.stroll[1]], STROLL_SPEED);
    }
    return [0, 0, 0];
  }

  /** Pelea con su presa: golpes, estampido sónico y persecución. */
  private fight(e: Entity, s: WardenState, ticks: number): [number, number, number] {
    const t = this.posOf(s.target!)!;
    this.look(e, t[0], t[2]);
    const dx = t[0] - e.x, dz = t[2] - e.z;
    const horiz = Math.hypot(dx, dz);
    const dy = t[1] - e.y;
    s.digCd = DIG_COOLDOWN;
    // Estampido sónico en curso: golpea a los 34 ticks y dura 60.
    if (s.pose === POSE_SONIC) {
      const before = s.poseT;
      s.poseT -= ticks;
      const elapsed = SONIC_TICKS - s.poseT;
      if (SONIC_TICKS - before < SONIC_HIT_TICK && elapsed >= SONIC_HIT_TICK) this.sonicBoom(e, s);
      if (s.poseT <= 0) {
        s.pose = POSE_IDLE;
        s.sonicCd = SONIC_COOLDOWN;
      }
      return [0, 0, 0];
    }
    if (s.pose === POSE_ATTACK && (s.poseT -= ticks) <= 0) s.pose = POSE_IDLE;
    // Cuerpo a cuerpo.
    if (horiz < MELEE_REACH && dy > -2 && dy < 2.9 && s.attackCd <= 0) {
      s.attackCd = ATTACK_COOLDOWN;
      s.sonicCd = Math.max(s.sonicCd, SONIC_COOLDOWN);
      s.pose = POSE_ATTACK;
      s.poseT = 10;
      this.melee(e, s.target!, dx / (horiz || 1), dz / (horiz || 1));
    } else if (s.sonicCd <= 0 && horiz <= SONIC_RANGE_XZ && Math.abs(dy) <= SONIC_RANGE_Y) {
      s.pose = POSE_SONIC;
      s.poseT = SONIC_TICKS;
      this.m.host.fx('warden_sonic_charge', e.x, e.y + 1.6, e.z);
      return [0, 0, 0];
    }
    if (horiz < 1.2) return [0, 0, 0];
    return this.walkTo(e, t, CHASE_SPEED, true);
  }

  private melee(e: Entity, who: Who, nx: number, nz: number): void {
    const dmg = MOBS[MOB_WARDEN].damage * this.m.difficultyScale();
    this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
    if (typeof who === 'string') this.m.host.hurtPlayer(who, dmg, nx * 14, 6, nz * 14, 'warden', e);
    else {
      const o = this.m.list.get(who);
      if (o) this.m.damage(o, dmg, e.x, e.z, e.id, 2.5);
    }
  }

  /** El estampido: atraviesa lo que haya en medio y golpea a su presa si sigue a su alcance. */
  private sonicBoom(e: Entity, s: WardenState): void {
    if (s.target === null || !this.valid(s.target)) return;
    const t = this.posOf(s.target)!;
    const ex = e.x, ey = e.y + 1.6, ez = e.z;
    const tx = t[0], ty = t[1] + (typeof s.target === 'string' ? 1.6 : 0.5), tz = t[2];
    if (Math.hypot(tx - ex, tz - ez) > SONIC_RANGE_XZ || Math.abs(ty - ey) > SONIC_RANGE_Y) return;
    const len = Math.hypot(tx - ex, ty - ey, tz - ez) || 1;
    const nx = (tx - ex) / len, ny = (ty - ey) / len, nz = (tz - ez) / len;
    this.m.host.fx('warden_sonic_boom', ex, ey, ez, packDelta(tx - ex, ty - ey, tz - ez));
    if (typeof s.target === 'string') this.m.host.hurtPlayer(s.target, SONIC_DAMAGE, nx * 30, ny * 6 + 3, nz * 30, 'sonic_boom');
    else {
      const o = this.m.list.get(s.target);
      if (o) {
        o.invuln = 0;
        this.m.damage(o, SONIC_DAMAGE, e.x, e.z, e.id, 0);
        o.vx += nx * 30;
        o.vy += ny * 6 + 3;
        o.vz += nz * 30;
      }
    }
  }

  private setTarget(e: Entity, s: WardenState, who: Who): void {
    s.target = who;
    s.roarAt = null;
    s.disturb = null;
    s.sonicCd = Math.max(s.sonicCd, TARGET_SONIC_COOLDOWN);
    if (s.pose === POSE_ROARING || s.pose === POSE_SNIFFING) s.pose = POSE_IDLE;
    const p = this.posOf(who);
    if (p) this.look(e, p[0], p[2]);
  }

  private increaseAnger(e: Entity, s: WardenState, who: Who, amount: number): void {
    if (!this.valid(who) || who === e.id) return;
    s.digCd = DIG_COOLDOWN;
    const playerTarget = typeof s.target === 'string';
    const v = Math.min(ANGER_MAX, (s.anger.get(who) ?? 0) + amount);
    s.anger.set(who, v);
    // Un jugador que lo enfada se lleva la atención aunque estuviera con otra criatura.
    if (typeof who === 'string' && !playerTarget && v >= ANGER_ANGRY && s.target !== null && s.target !== who) s.target = null;
  }

  private setDisturbance(s: WardenState, at: [number, number, number]): void {
    s.disturb = [at[0], at[1], at[2]];
    s.disturbT = DISTURBANCE_TICKS;
    s.stroll = null;
  }

  /** Con quién está más enfadado (los jugadores enfadándolo, primero). */
  private active(s: WardenState): Who | null {
    let best: Who | null = null, bv = -1, bestPlayer = false;
    for (const [who, a] of s.anger) {
      const player = typeof who === 'string' && a >= ANGER_ANGRY;
      if ((player && !bestPlayer) || (player === bestPlayer && a > bv)) {
        best = who;
        bv = a;
        bestPlayer = player;
      }
    }
    return best;
  }

  private activeAnger(s: WardenState): number {
    const a = this.active(s);
    return a === null ? 0 : s.anger.get(a) ?? 0;
  }

  /** ¿Sigue siendo alguien a quien atacar? (jugadores vivos en supervivencia y criaturas vivas que no son wardens). */
  private valid(who: Who): boolean {
    if (typeof who === 'string') {
      for (const p of this.m.host.players()) if (p.id === who) return p.alive && !p.creative;
      return false;
    }
    const o = this.m.list.get(who);
    return !!o && !o.dead && !!o.ai && o.type !== MOB_WARDEN && o.type !== ENT_ARMOR_STAND && !MOBS[o.type]?.inert;
  }

  private posOf(who: Who): [number, number, number] | null {
    if (typeof who === 'string') {
      for (const p of this.m.host.players()) if (p.id === who) return [p.x, p.y, p.z];
      return null;
    }
    const o = this.m.list.get(who);
    if (!o) return null;
    // Un proyectil que ya no está: su dueño, si lo hay.
    if (o.type === ENT_ARROW || o.type === ENT_THROWN || o.type === ENT_TRIDENT) return null;
    return [o.x, o.y, o.z];
  }

  private nearestAttackable(e: Entity, players: PlayerView[]): PlayerView | null {
    let best: PlayerView | null = null, bd = SNIFF_RANGE;
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  private darkness(e: Entity, s: WardenState, players: PlayerView[]): void {
    for (const p of players) {
      if (!p.alive || Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) > DARKNESS_RANGE) continue;
      const last = s.darkAt.get(p.id);
      if (last !== undefined && s.t - last < DARKNESS_RENEW_TICKS) continue;
      s.darkAt.set(p.id, s.t);
      this.m.host.effectPlayer?.(p.id, EFFECT_DARKNESS, DARKNESS_SECONDS, 0);
    }
  }

  // ------------------------------------------------------------------ movimiento

  private look(e: Entity, x: number, z: number): void {
    e.yaw = lerpAngle(e.yaw, angleTo(e.x, e.z, x, z), 0.5);
    e.bodyYaw = lerpAngle(e.bodyYaw, e.yaw, 0.3);
  }

  /** Dirección hacia un punto (siguiendo un camino si hace falta). */
  private walkTo(e: Entity, to: [number, number, number], speed: number, chase = false): [number, number, number] {
    const target = { x: to[0], y: to[1], z: to[2] } as PlayerView;
    const [mx, mz] = chase || Math.abs(to[1] - e.y) > 1.5 ? this.brain.followPath(e, target, 0) : this.brain.direct(e, target);
    return [mx, mz, speed];
  }

  private move(e: Entity, s: WardenState, dt: number, [mx, mz, speed]: [number, number, number]): void {
    const w = this.m.w;
    const tvx = mx * speed, tvz = mz * speed;
    const acc = e.onGround ? 10 : e.inWater ? 4 : 2;
    e.vx += (tvx - e.vx) * Math.min(1, dt * acc);
    e.vz += (tvz - e.vz) * Math.min(1, dt * acc);
    if (e.inWater || e.inLava) {
      e.vy += (1.4 - e.vy) * Math.min(1, dt * 3);
      if (e.hitWall) e.vy = Math.max(e.vy, 4);
    } else {
      e.vy -= GRAVITY * dt;
      if (e.vy < -60) e.vy = -60;
    }
    const moving = speed > 0 && (mx !== 0 || mz !== 0);
    if (e.onGround && moving && e.hitWall) e.vy = 8.6;
    if (s.pose !== POSE_IDLE && s.pose !== POSE_ATTACK) {
      e.vx = 0;
      e.vz = 0;
    }
    moveBody(e, w, dt, 0.6);
    if (e.onGround || e.inWater) e.fallStart = e.y;
    else e.fallStart = Math.max(e.fallStart, e.y);
    if (moving && Math.hypot(e.vx, e.vz) > 0.3) {
      e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 6);
      if (s.target === null) e.yaw = lerpAngle(e.yaw, e.bodyYaw, dt * 6);
    }
  }

  private updateFlags(e: Entity, s: WardenState): void {
    let f = 0;
    if (e.hurt < 0.4) f |= EF_HURT;
    if (e.dead) f |= EF_DEAD;
    const anger = this.activeAnger(s);
    if (anger >= ANGER_ANGRY) f |= EF_ANGRY;
    f |= (s.pose & 7) << WARDEN_POSE_SHIFT;
    f |= angerBits(anger) << WARDEN_ANGER_SHIFT;
    if (s.tendrils > 0) f |= WARDEN_TENDRILS;
    e.flags = f;
  }
}
