// Fase 8.7: el Wither y su calavera, portados de WitherBoss y WitherSkull de la 26.3 (a 20 ticks por segundo).
// - Nace (invocado) con un tercio de la vida y 220 ticks de invulnerabilidad: no se mueve ni ataca, se cura 10 cada 10
//   ticks y, al acabar, explota con fuerza 7 (el rugido se oye en toda la dimensión). Con el huevo nace entero.
// - Vuela hacia su objetivo (la criatura viva más cercana a 40 bloques que no sea un no muerto, o quien le haya
//   herido), por encima de él (5 bloques más alto mientras no esté blindado) y a más de 3 bloques en horizontal.
// - Cabeza del centro (RangedAttackGoal): cada 40 ticks, si ve a su objetivo, le lanza una calavera (1 de cada 1000,
//   azul). Cabezas de los lados: cada 10–20 ticks buscan una criatura viva a 20 × 8 × 20 y le disparan cada 40–60
//   ticks si la ven a 30 bloques; en normal y difícil, tras unas cuantas vueltas sin nada, lanzan una azul al azar.
// - Por debajo de la mitad está blindado: las flechas le rebotan (y baja a la altura de su objetivo). Recibe daño
//   de todo menos de los no muertos y de otros Withers; 1 segundo después de cada golpe rompe los bloques que le
//   rodean (salvo los que resisten al Wither). Se cura 1 por segundo. Armadura 4. No le afectan los efectos.
// - Muere soltando una estrella del Nether; lo que él mata deja una rosa marchita.
// - Calavera (AbstractHurtingProjectile): acelera 0,1 bloques por tick y frena con el aire (0,95; la azul, 0,73);
//   a lo que alcanza le hace 8 de daño (si lo mata, el Wither se cura 5) y le da Marchitamiento II (10 s en normal,
//   40 s en difícil); explota con fuerza 1. La azul rompe hasta lo que resiste 0,8 (la obsidiana).
// Con los jefes reforzados (bossRules.ts) gana vida con cada jugador y, en furia, sus cabezas disparan el doble.
import {
  MOB_WITHER, ENT_WITHER_SKULL, WITHER_HEALTH, WITHER_ARMOR, WITHER_INVULNERABLE_TICKS, WITHER_SPAWN_BLAST, WITHER_ATTACK_INTERVAL,
  WITHER_FOLLOW_RANGE, WITHER_HEAD_RANGE, WITHER_SKULL_DAMAGE, WITHER_SKULL_HEAL, WITHER_SKULL_WITHER_NORMAL, WITHER_SKULL_WITHER_HARD,
  WITHER_SKULL_POWER, WITHER_SKULL_ACCEL, WITHER_SKULL_INERTIA, WITHER_SKULL_DANGEROUS_INERTIA, WITHER_SKULL_WATER_INERTIA,
  WITHER_SKULL_SIZE, witherHeadPos,
} from '../../witherMobs';
import { MOBS } from '../../mobs';
import { BLOCK_COLLIDE, BLOCK_FLUID, AIR, WITHER_ROSE, supportsWitherRose } from '../../blocks';
import { NETHER_STAR } from '../../items';
import { EFFECT_WITHER } from '../../effects';
import { armorReduce } from '../../armor';
import { isUndead } from './mobEffects';
import { witherImmune } from '../../explosions';
import { FURY_FRACTION } from '../../bossRules';
import { lineOfSight, moveBody } from '../physics';
import type { Entity, PlayerView } from './types';
import type { Entities } from './Entities';

const DT = 0.05;
const DEG = Math.PI / 180;

/** Objetivo: un jugador (id de sesión) o una criatura (id de entidad). */
type Target = string | number;

interface WitherState {
  acc: number;
  ticks: number;
  /** Ticks de invulnerabilidad que le quedan (se ven en `variant`). */
  invul: number;
  /** Objetivos: 0 la cabeza del centro (el de la IA), 1 y 2 las de los lados. */
  targets: (Target | null)[];
  nextHeadUpdate: [number, number];
  idleHeadUpdates: [number, number];
  destroyBlocksTick: number;
  /** RangedAttackGoal: ticks hasta el disparo y ticks viéndolo. */
  attackTime: number;
  seeTime: number;
  /** Giros de las cabezas de los lados (grados de Java) y de la del centro. */
  xRotHeads: [number, number];
  yRotHeads: [number, number];
  /** Paseo sin objetivo (WaterAvoidingRandomFlyingGoal). */
  wander: [number, number, number] | null;
  wanderT: number;
  /** Velocidad en bloques por tick. */
  vel: [number, number, number];
  /** Jefes reforzados: jugadores con los que se ha peleado (el máximo). */
  fighters: number;
}

interface SkullState {
  dangerous: boolean;
  owner: number;
}

export class WitherAI {
  private states = new Map<number, WitherState>();
  private skulls = new Map<number, SkullState>();

  constructor(private m: Entities) {
    m.custom.set(MOB_WITHER, (e, dt) => this.tick(e, dt));
    m.custom.set(ENT_WITHER_SKULL, (e, dt) => this.skullTick(e, dt));
  }

  private state(e: Entity): WitherState {
    let s = this.states.get(e.id);
    if (!s) {
      s = {
        acc: 0, ticks: 0, invul: e.variant ?? 0, targets: [null, null, null], nextHeadUpdate: [0, 0], idleHeadUpdates: [0, 0], destroyBlocksTick: 0,
        attackTime: -1, seeTime: 0, xRotHeads: [0, 0], yRotHeads: [0, 0], wander: null, wanderT: 0, vel: [0, 0, 0],
        fighters: Math.max(1, 1 + Math.ceil((e.maxHealth - WITHER_HEALTH) / (WITHER_HEALTH / 2))),
      };
      this.states.set(e.id, s);
    }
    return s;
  }

  // ------------------------------------------------------------------ nacer

  /**
   * Invocado con los cráneos (WitherSkullBlock.checkSpawn + makeInvulnerable): un tercio de la vida y 220 ticks de
   * invulnerabilidad. `yawJavaDeg`: 0 si la T va a lo largo de X, 90 si va a lo largo de Z.
   */
  summon(x: number, y: number, z: number, yawJavaDeg: number): Entity | null {
    const e = this.m.spawnMob(MOB_WITHER, x, y, z);
    if (!e) return null;
    e.persist = true;
    e.yaw = e.bodyYaw = Math.PI - yawJavaDeg * DEG;
    e.health = e.maxHealth / 3;
    e.variant = WITHER_INVULNERABLE_TICKS;
    this.state(e).invul = WITHER_INVULNERABLE_TICKS;
    return e;
  }

  /** ¿Blindado? (isPowered: con la mitad de la vida o menos). */
  powered(e: Entity): boolean {
    return e.health <= e.maxHealth / 2;
  }

  /** Ticks de invulnerabilidad que le quedan. */
  invulnerable(e: Entity): number {
    return e.type === MOB_WITHER ? this.state(e).invul : 0;
  }

  /** Giros de las cabezas de los lados (grados de Java, relativos al cuerpo) para los clientes. */
  headRots(e: Entity): [number, number, number, number] {
    const s = this.state(e);
    const body = 180 - (e.bodyYaw / DEG);
    const rel = (y: number) => ((y - body + 540) % 360) - 180;
    return [Math.round(rel(s.yRotHeads[0])), Math.round(s.xRotHeads[0]), Math.round(rel(s.yRotHeads[1])), Math.round(s.xRotHeads[1])];
  }

  // ------------------------------------------------------------------ daño

  /**
   * WitherBoss.hurtServer: invulnerable al nacer, no le hieren ni los no muertos ni otros Withers (tampoco sus propias
   * explosiones). true si ignora el golpe.
   */
  ignores(e: Entity, attacker: string | number | null): boolean {
    if (e.type !== MOB_WITHER) return false;
    if (this.state(e).invul > 0) return true;
    if (typeof attacker === 'number') {
      const a = this.m.list.get(attacker);
      if (a && (a.type === MOB_WITHER || isUndead(a.type))) return true;
    }
    return false;
  }

  /** Armadura 4. */
  absorb(e: Entity, amount: number): number {
    return e.type === MOB_WITHER ? armorReduce(amount, WITHER_ARMOR, 0) : amount;
  }

  /** Blindado, las flechas le rebotan. */
  deflectsArrow(e: Entity): boolean {
    return e.type === MOB_WITHER && this.powered(e);
  }

  /** Tras un golpe: dentro de 1 s rompe lo que le rodea; las cabezas de los lados se impacientan (HurtByTarget). */
  onDamaged(e: Entity, attacker: string | number | null): void {
    if (e.type !== MOB_WITHER || e.dead) return;
    const s = this.state(e);
    if (s.destroyBlocksTick <= 0) s.destroyBlocksTick = 20;
    s.idleHeadUpdates[0] += 3;
    s.idleHeadUpdates[1] += 3;
    if (attacker !== null && this.valid(e, attacker, WITHER_FOLLOW_RANGE)) s.targets[0] = attacker;
  }

  /** Al morir: la estrella del Nether (que no desaparece enseguida) y el rugido. */
  onKilled(e: Entity): void {
    if (e.type !== MOB_WITHER) return;
    const star = this.m.spawnItem({ id: NETHER_STAR, count: 1 }, e.x, e.y + 1, e.z, 0, 2, 0);
    if (star) star.age = -600;
    this.m.host.fx('wither_death', e.x, e.y + 2, e.z);
    this.states.delete(e.id);
  }

  /**
   * LivingEntity.createWitherRose: lo que mata un Wither deja una rosa marchita donde muere (si está libre y la
   * aguanta el suelo); si no, la suelta.
   */
  onVictim(victim: Entity, killer: string | number | null): void {
    if (typeof killer !== 'number' || victim.type === MOB_WITHER) return;
    if (this.m.list.get(killer)?.type !== MOB_WITHER) return;
    const w = this.m.w;
    const x = Math.floor(victim.x), y = Math.floor(victim.y + 0.01), z = Math.floor(victim.z);
    if (w.getBlock(x, y, z) === AIR && supportsWitherRose(w.getBlock(x, y - 1, z))) w.setBlock(x, y, z, WITHER_ROSE);
    else this.m.spawnItem({ id: WITHER_ROSE, count: 1 }, victim.x, victim.y + 0.3, victim.z, 0, 2, 0);
  }

  // ------------------------------------------------------------------ guardado

  save(e: Entity): { wi: number; wm?: number } | null {
    if (e.type !== MOB_WITHER) return null;
    const s = this.state(e);
    return e.maxHealth > WITHER_HEALTH ? { wi: s.invul, wm: e.maxHealth } : { wi: s.invul };
  }

  restore(e: Entity, row: unknown[]): void {
    if (e.type !== MOB_WITHER) return;
    const r = row.find((c) => !!c && typeof c === 'object' && 'wi' in (c as object)) as { wi?: unknown; wm?: unknown } | undefined;
    e.persist = true;
    if (!r) return;
    const wm = Number(r.wm);
    if (Number.isFinite(wm) && wm > WITHER_HEALTH) e.maxHealth = Math.min(WITHER_HEALTH * 20, wm);
    const wi = Number(r.wi);
    const s = this.state(e);
    s.invul = Number.isInteger(wi) ? Math.max(0, Math.min(WITHER_INVULNERABLE_TICKS, wi)) : 0;
    s.fighters = Math.max(1, 1 + Math.ceil((e.maxHealth - WITHER_HEALTH) / (WITHER_HEALTH / 2)));
    e.variant = s.invul;
  }

  // ------------------------------------------------------------------ tick

  private tick(e: Entity, dt: number): void {
    const s = this.state(e);
    s.acc += dt;
    while (s.acc >= DT) {
      s.acc -= DT;
      this.step(e, s);
      if (e.dead || !this.m.list.has(e.id)) return;
    }
    e.vx = s.vel[0] * 20;
    e.vy = s.vel[1] * 20;
    e.vz = s.vel[2] * 20;
    // Lo que ven los clientes: los ticks de invulnerabilidad o, blindado, 255 (el aura).
    e.variant = s.invul > 0 ? s.invul : this.powered(e) ? 255 : 0;
  }

  private step(e: Entity, s: WitherState): void {
    s.ticks++;
    // checkDespawn: en pacífico se va.
    if (this.m.host.difficulty() === 0) {
      this.states.delete(e.id);
      this.m.remove(e.id);
      return;
    }
    e.fire = 0;
    if (s.invul > 0) {
      // customServerAiStep: la cuenta atrás de la invulnerabilidad; al acabar, la explosión.
      s.invul--;
      if (s.invul <= 0) {
        this.m.explode(e.x, e.y + e.height * 0.85, e.z, WITHER_SPAWN_BLAST, false, { source: e.id });
        this.m.host.fx('wither_spawn', e.x, e.y + 2, e.z);
      }
      if (s.ticks % 10 === 0) e.health = Math.min(e.maxHealth, e.health + 10);
      s.vel = [0, 0, 0];
      return;
    }
    this.reinforce(e, s);
    this.retarget(e, s);
    this.move(e, s);
    this.heads(e, s);
    this.mainAttack(e, s);
    this.sideHeads(e, s);
    this.destroyBlocks(e, s);
    if (s.ticks % 20 === 0) e.health = Math.min(e.maxHealth, e.health + 1);
    if (s.ticks % 160 === 0 && this.m.rand() < 0.5) this.m.host.fx('wither_ambient', e.x, e.y + 2, e.z);
  }

  /** Jefes reforzados: 150 de vida más por cada jugador de más cerca (a 64 bloques); no baja si alguien se va. */
  private reinforce(e: Entity, s: WitherState): void {
    if (!this.m.host.hardBosses() || s.ticks % 20 !== 0) return;
    const n = this.m.host.players().filter((p) => p.alive && !p.creative && Math.hypot(p.x - e.x, p.z - e.z) <= 64).length;
    if (n <= s.fighters) return;
    const per = WITHER_HEALTH / 2;
    const extra = (n - s.fighters) * per;
    s.fighters = n;
    e.maxHealth += extra;
    e.health += extra;
  }

  /** ¿Está furioso? (jefes reforzados, por debajo de un cuarto de la vida). */
  furious(e: Entity): boolean {
    return this.m.host.hardBosses() && e.health <= e.maxHealth * FURY_FRACTION;
  }

  // ------------------------------------------------------------------ objetivos

  private playerOf(t: Target): PlayerView | undefined {
    return typeof t === 'string' ? this.m.host.players().find((p) => p.id === t) : undefined;
  }

  /** Posición (pies y altura) de un objetivo, o null si ya no vale. */
  private where(t: Target): [number, number, number, number] | null {
    if (typeof t === 'string') {
      const p = this.playerOf(t);
      return p && p.alive && !p.creative ? [p.x, p.y, p.z, 1.8] : null;
    }
    const o = this.m.list.get(t);
    return o && o.ai && !o.dead ? [o.x, o.y, o.z, o.height] : null;
  }

  /** ¿Vale como objetivo? (LIVING_ENTITY_SELECTOR: vivo, atacable y que no sea un no muerto). */
  private valid(e: Entity, t: Target, range: number): boolean {
    if (typeof t === 'number') {
      const o = this.m.list.get(t);
      if (!o || !o.ai || o.dead || o.id === e.id || MOBS[o.type]?.inert || isUndead(o.type) || o.type === MOB_WITHER) return false;
    }
    const w = this.where(t);
    return !!w && Math.hypot(w[0] - e.x, w[1] - e.y, w[2] - e.z) <= range;
  }

  /** Candidatos a objetivo en una caja alrededor del Wither. */
  private candidates(e: Entity, h: number, v: number): Target[] {
    const out: Target[] = [];
    for (const p of this.m.host.players()) {
      if (p.alive && !p.creative && Math.abs(p.x - e.x) <= h && Math.abs(p.y - e.y) <= v && Math.abs(p.z - e.z) <= h) out.push(p.id);
    }
    for (const o of this.m.list.values()) {
      if (!this.valid(e, o.id, Infinity)) continue;
      if (Math.abs(o.x - e.x) <= h && Math.abs(o.y - e.y) <= v && Math.abs(o.z - e.z) <= h) out.push(o.id);
    }
    return out;
  }

  /** NearestAttackableTargetGoal (a 40 bloques) y HurtByTargetGoal (lo pone onDamaged). */
  private retarget(e: Entity, s: WitherState): void {
    const cur = s.targets[0];
    if (cur !== null && this.valid(e, cur, WITHER_FOLLOW_RANGE)) return;
    s.targets[0] = null;
    let best: Target | null = null, bd = WITHER_FOLLOW_RANGE;
    for (const t of this.candidates(e, WITHER_FOLLOW_RANGE, WITHER_FOLLOW_RANGE)) {
      const w = this.where(t)!;
      const d = Math.hypot(w[0] - e.x, w[1] - e.y, w[2] - e.z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    s.targets[0] = best;
  }

  // ------------------------------------------------------------------ vuelo

  /** WitherBoss.aiStep y el vuelo (sin gravedad, frenando 0,91 en horizontal y 0,98 en vertical). */
  private move(e: Entity, s: WitherState): void {
    let [vx, vy, vz] = s.vel;
    vy *= 0.6;
    const t = s.targets[0] !== null ? this.where(s.targets[0]) : null;
    if (t) {
      if (e.y < t[1] || (!this.powered(e) && e.y < t[1] + 5)) {
        vy = Math.max(0, vy);
        vy += 0.3 - vy * 0.6;
      }
      const dx = t[0] - e.x, dz = t[2] - e.z;
      const hd = Math.hypot(dx, dz);
      if (hd * hd > 9) {
        vx += (dx / hd) * 0.3 - vx * 0.6;
        vz += (dz / hd) * 0.3 - vz * 0.6;
      }
    } else {
      // Sin objetivo: vuela sin prisa hacia un punto al azar cercano.
      if (!s.wander || --s.wanderT <= 0) {
        s.wander = [e.x + (this.m.rand() - 0.5) * 20, e.y + (this.m.rand() - 0.5) * 10, e.z + (this.m.rand() - 0.5) * 20];
        s.wanderT = 60 + Math.floor(this.m.rand() * 80);
      }
      const dx = s.wander[0] - e.x, dy = s.wander[1] - e.y, dz = s.wander[2] - e.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 1) {
        // Sin prisa (unos 2,5 bloques por segundo con el frenado del aire).
        vx += (dx / d) * 0.012;
        vy += (dy / d) * 0.012;
        vz += (dz / d) * 0.012;
      }
    }
    if (vx * vx + vz * vz > 0.05) e.bodyYaw = Math.atan2(-vx, -vz);
    // Se mueve (chocando con los bloques) y frena con el aire.
    e.vx = vx * 20;
    e.vy = vy * 20;
    e.vz = vz * 20;
    moveBody(e, this.m.w, DT);
    s.vel = [(e.vx / 20) * 0.91, (e.vy / 20) * 0.98, (e.vz / 20) * 0.91];
  }

  // ------------------------------------------------------------------ cabezas

  /** Giros de las cabezas (rotlerp: 40° por tick en vertical y 10° en horizontal), hacia su objetivo o al frente. */
  private heads(e: Entity, s: WitherState): void {
    const body = 180 - e.bodyYaw / DEG;
    for (let i = 0; i < 2; i++) {
      const t = s.targets[i + 1] !== null ? this.where(s.targets[i + 1]!) : null;
      if (t) {
        const [hx, hy, hz] = this.headAt(e, i + 1);
        const xd = t[0] - hx, yd = t[1] + t[3] * 0.85 - hy, zd = t[2] - hz;
        const yRotD = Math.atan2(zd, xd) / DEG - 90;
        const xRotD = -(Math.atan2(yd, Math.hypot(xd, zd)) / DEG);
        s.xRotHeads[i] = rotlerp(s.xRotHeads[i], xRotD, 40);
        s.yRotHeads[i] = rotlerp(s.yRotHeads[i], yRotD, 10);
      } else s.yRotHeads[i] = rotlerp(s.yRotHeads[i], body, 10);
    }
    // La del centro mira a su objetivo (la cabeza de la criatura: yaw y pitch de la entidad).
    const t0 = s.targets[0] !== null ? this.where(s.targets[0]) : null;
    if (t0) {
      const [hx, hy, hz] = this.headAt(e, 0);
      const xd = t0[0] - hx, yd = t0[1] + t0[3] * 0.85 - hy, zd = t0[2] - hz;
      e.yaw = Math.atan2(-xd, -zd);
      e.pitch = Math.atan2(yd, Math.hypot(xd, zd));
    } else {
      e.yaw = e.bodyYaw;
      e.pitch = 0;
    }
  }

  private headAt(e: Entity, head: number): [number, number, number] {
    const [x, y, z] = witherHeadPos(180 - e.bodyYaw / DEG, head);
    return [e.x + x, e.y + y, e.z + z];
  }

  /** RangedAttackGoal(1.0, 40, 20): cada 40 ticks, si ve a su objetivo, la cabeza del centro le dispara. */
  private mainAttack(e: Entity, s: WitherState): void {
    const t = s.targets[0];
    const w = t !== null ? this.where(t) : null;
    if (t === null || !w) {
      s.seeTime = 0;
      s.attackTime = -1;
      return;
    }
    const [hx, hy, hz] = this.headAt(e, 0);
    const see = lineOfSight(this.m.w, hx, hy, hz, w[0], w[1] + w[3] * 0.85, w[2]);
    s.seeTime = see ? s.seeTime + 1 : 0;
    const interval = this.furious(e) ? WITHER_ATTACK_INTERVAL / 2 : WITHER_ATTACK_INTERVAL;
    if (--s.attackTime === 0) {
      if (!see) return;
      this.shoot(e, 0, w[0], w[1] + w[3] * 0.5, w[2], this.m.rand() < 0.001);
      s.attackTime = interval;
    } else if (s.attackTime < 0) s.attackTime = interval;
  }

  /** Las cabezas de los lados (customServerAiStep). */
  private sideHeads(e: Entity, s: WitherState): void {
    const hard = this.m.host.difficulty() >= 2;
    const fury = this.furious(e);
    for (let i = 1; i < 3; i++) {
      if (s.ticks < s.nextHeadUpdate[i - 1]) continue;
      s.nextHeadUpdate[i - 1] = s.ticks + 10 + Math.floor(this.m.rand() * 10);
      if (hard && s.idleHeadUpdates[i - 1]++ > 15) {
        const x = e.x + (this.m.rand() - 0.5) * 20, y = e.y + (this.m.rand() - 0.5) * 10, z = e.z + (this.m.rand() - 0.5) * 20;
        this.shoot(e, i, x, y, z, true);
        s.idleHeadUpdates[i - 1] = 0;
      }
      const t = s.targets[i];
      if (t !== null) {
        const w = this.where(t);
        const [hx, hy, hz] = this.headAt(e, i);
        if (w && this.valid(e, t, 30) && lineOfSight(this.m.w, hx, hy, hz, w[0], w[1] + w[3] * 0.85, w[2])) {
          this.shoot(e, i, w[0], w[1] + w[3] * 0.5, w[2], false);
          s.nextHeadUpdate[i - 1] = s.ticks + (fury ? 20 + Math.floor(this.m.rand() * 10) : 40 + Math.floor(this.m.rand() * 20));
          s.idleHeadUpdates[i - 1] = 0;
        } else s.targets[i] = null;
      } else {
        const list = this.candidates(e, WITHER_HEAD_RANGE, 8);
        if (list.length) s.targets[i] = list[Math.floor(this.m.rand() * list.length)];
      }
    }
  }

  /** Un segundo después de un golpe, rompe los bloques que le rodean (menos los que resisten al Wither). */
  private destroyBlocks(e: Entity, s: WitherState): void {
    if (s.destroyBlocksTick <= 0 || --s.destroyBlocksTick > 0) return;
    const w = this.m.w;
    const width = Math.floor(e.width / 2 + 1), height = Math.floor(e.height);
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    let broke = false;
    for (let y = by; y <= by + height; y++) {
      for (let z = bz - width; z <= bz + width; z++) {
        for (let x = bx - width; x <= bx + width; x++) {
          const id = w.getBlock(x, y, z);
          if (id <= 0 || BLOCK_FLUID[id] || witherImmune(id)) continue;
          this.m.host.breakBlock(x, y, z, true);
          broke = true;
        }
      }
    }
    if (broke) this.m.host.fx('wither_break', e.x, e.y + 1, e.z);
  }

  // ------------------------------------------------------------------ calavera

  /** performRangedAttack: una calavera desde la cabeza `head` hacia (tx, ty, tz). */
  private shoot(e: Entity, head: number, tx: number, ty: number, tz: number, dangerous: boolean): void {
    const [hx, hy, hz] = this.headAt(e, head);
    const dx = tx - hx, dy = ty - hy, dz = tz - hz;
    const d = Math.hypot(dx, dy, dz) || 1;
    const k = this.m.spawnBare(ENT_WITHER_SKULL, hx, hy - WITHER_SKULL_SIZE / 2, hz, WITHER_SKULL_SIZE, WITHER_SKULL_SIZE);
    k.vx = (dx / d) * WITHER_SKULL_ACCEL * 20;
    k.vy = (dy / d) * WITHER_SKULL_ACCEL * 20;
    k.vz = (dz / d) * WITHER_SKULL_ACCEL * 20;
    k.shooter = e.id;
    k.variant = dangerous ? 1 : 0;
    k.yaw = Math.atan2(-dx, -dz);
    k.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    this.skulls.set(k.id, { dangerous, owner: e.id });
    this.m.host.fx('wither_shoot', hx, hy, hz);
  }

  /** AbstractHurtingProjectile.tick de la calavera. */
  private skullTick(k: Entity, dt: number): void {
    k.flags = 0;
    const st = this.skulls.get(k.id) ?? { dangerous: k.variant === 1, owner: typeof k.shooter === 'number' ? k.shooter : -1 };
    if (k.age > 60 || k.y < -64) {
      this.skulls.delete(k.id);
      this.m.remove(k.id);
      return;
    }
    const w = this.m.w;
    const steps = Math.max(1, Math.round(dt / DT));
    for (let n = 0; n < steps; n++) {
      const vx = k.vx * DT, vy = k.vy * DT, vz = k.vz * DT;
      const len = Math.hypot(vx, vy, vz) || 1e-6;
      const sub = Math.max(1, Math.ceil(len / 0.25));
      const half = k.width / 2;
      for (let i = 1; i <= sub; i++) {
        const f = i / sub;
        const x = k.x + vx * f, y = k.y + half + vy * f, z = k.z + vz * f;
        const mob = this.skullMob(k, st, x, y, z, half);
        if (mob) return this.skullHitMob(k, st, mob, x, y, z);
        const p = this.m.host.players().find((pp) => pp.alive && !pp.creative && Math.abs(pp.x - x) < 0.3 + half && Math.abs(pp.z - z) < 0.3 + half && y > pp.y - half && y < pp.y + 1.8 + half);
        if (p) return this.skullHitPlayer(k, st, p, x, y, z);
        const b = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        if (b > 0 && BLOCK_COLLIDE[b]) return this.skullExplode(k, st, x - (vx / len) * 0.3, y - (vy / len) * 0.3, z - (vz / len) * 0.3);
      }
      k.x += vx;
      k.y += vy;
      k.z += vz;
      const water = (() => {
        const b = w.getBlock(Math.floor(k.x), Math.floor(k.y + half), Math.floor(k.z));
        return b > 0 && BLOCK_FLUID[b] === 1;
      })();
      const inertia = water ? WITHER_SKULL_WATER_INERTIA : st.dangerous ? WITHER_SKULL_DANGEROUS_INERTIA : WITHER_SKULL_INERTIA;
      k.vx = (vx + (vx / len) * WITHER_SKULL_ACCEL) * inertia / DT;
      k.vy = (vy + (vy / len) * WITHER_SKULL_ACCEL) * inertia / DT;
      k.vz = (vz + (vz / len) * WITHER_SKULL_ACCEL) * inertia / DT;
    }
    k.yaw = Math.atan2(-k.vx, -k.vz);
    k.pitch = Math.atan2(k.vy, Math.hypot(k.vx, k.vz));
  }

  private skullMob(k: Entity, st: SkullState, x: number, y: number, z: number, half: number): Entity | null {
    for (const o of this.m.list.values()) {
      if (!o.ai || o.dead || MOBS[o.type]?.inert || (o.id === st.owner && k.age < 1)) continue;
      if (o.id === st.owner) continue;
      const hw = o.width / 2 + half;
      if (Math.abs(o.x - x) < hw && Math.abs(o.z - z) < hw && y > o.y - half && y < o.y + o.height + half) return o;
    }
    return null;
  }

  /** onHitEntity: 8 de daño (el Wither se cura 5 si mata) y Marchitamiento II; luego explota. */
  private skullHitMob(k: Entity, st: SkullState, o: Entity, x: number, y: number, z: number): void {
    const owner = this.m.list.get(st.owner);
    const hurt = owner && owner.type === MOB_WITHER ? this.m.damage(o, WITHER_SKULL_DAMAGE, x, z, owner.id, 1) : this.m.damage(o, 5, x, z, null, 1);
    if (owner && owner.type === MOB_WITHER && o.dead) owner.health = Math.min(owner.maxHealth, owner.health + WITHER_SKULL_HEAL);
    void hurt;
    const secs = this.witherSeconds();
    if (secs > 0 && !o.dead) this.m.effects.add(o, EFFECT_WITHER, secs, 1, 1, st.owner);
    this.skullExplode(k, st, x, y, z);
  }

  private skullHitPlayer(k: Entity, st: SkullState, p: PlayerView, x: number, y: number, z: number): void {
    const d = Math.hypot(k.vx, k.vz) || 1;
    const owned = this.m.list.get(st.owner)?.type === MOB_WITHER;
    this.m.host.hurtPlayer(p.id, (owned ? WITHER_SKULL_DAMAGE : 5) * this.m.difficultyScale(), (k.vx / d) * 3, 3, (k.vz / d) * 3, 'wither_skull');
    const secs = this.witherSeconds();
    if (secs > 0) this.m.host.effectPlayer?.(p.id, EFFECT_WITHER, secs, 1);
    this.skullExplode(k, st, x, y, z);
  }

  /** 10 s en normal, 40 s en difícil, nada en fácil. */
  private witherSeconds(): number {
    const d = this.m.host.difficulty();
    return d === 2 ? WITHER_SKULL_WITHER_NORMAL : d === 3 ? WITHER_SKULL_WITHER_HARD : 0;
  }

  /** onHit: explota con fuerza 1 (la azul rompe hasta lo que resiste 0,8). */
  private skullExplode(k: Entity, st: SkullState, x: number, y: number, z: number): void {
    this.skulls.delete(k.id);
    this.m.remove(k.id);
    this.m.explode(x, y, z, WITHER_SKULL_POWER, false, {
      source: st.owner,
      ...(st.dangerous ? { resist: (id: number, r: number) => (witherImmune(id) ? r : Math.min(0.8, r)) } : {}),
    });
  }
}

function rotlerp(a: number, b: number, max: number): number {
  let diff = ((b - a + 540) % 360) - 180;
  if (diff > max) diff = max;
  if (diff < -max) diff = -max;
  return a + diff;
}
