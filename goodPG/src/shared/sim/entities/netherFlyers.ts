// Fase 8.3 (criaturas del Nether): ghast, blaze y sus bolas de fuego, como Ghast, Blaze, LargeFireball y
// SmallFireball de Java 26.3.
//
// Ghast: vuela sin gravedad (frena × 0,91 por tick) hacia puntos al azar a 16 bloques, con un empujón de 0,1 cada
// 2–6 ticks si el camino está libre. Persigue con la mirada a un jugador (a 100 bloques y a 4 de altura como
// mucho) y, si lo ve a menos de 64, carga 20 ticks (a los 10 avisa con un chillido y abre los ojos) y le lanza una
// bola de fuego desde 4 bloques delante; descansa 40 ticks. Si su propia bola de fuego, devuelta por un jugador,
// le da, muere (1000 de daño) y suelta el disco «Tears».
// Blaze: cae despacio (× 0,6), sube hacia su presa si está por encima de un margen que cambia cada 100 ticks;
// de cerca golpea (cada 20 ticks); de lejos carga 60 ticks (arde) y lanza tres bolas pequeñas separadas 6 ticks,
// con una dispersión que crece con la distancia; descansa 100. Avisa a los suyos al recibir un golpe. El agua le
// hace daño. Sólo suelta su vara si lo mata un jugador.
// Bolas de fuego: salen a 0,1 bloques por tick y aceleran 0,1 por tick en su dirección con un rozamiento de 0,95
// (0,8 en el agua): hasta unos 1,9 por tick. La grande explota con fuerza 1 (y prende fuego) y hace 6 de daño a lo
// que toca; un golpe de un jugador la devuelve hacia donde mira. La pequeña hace 5 y prende 5 s; en un bloque,
// enciende fuego al lado.
import {
  MOB_GHAST, MOB_BLAZE, ENT_LARGE_FIREBALL, ENT_SMALL_FIREBALL, GHAST_SHOOT_RANGE, BLAZE_CHARGE_TICKS, BLAZE_REST_TICKS,
  FIREBALL_ACCEL, FIREBALL_INERTIA, FIREBALL_WATER_INERTIA, LARGE_FIREBALL_POWER, LARGE_FIREBALL_DAMAGE, SMALL_FIREBALL_DAMAGE,
  SMALL_FIREBALL_FIRE_SECONDS, isNetherMob,
} from '../../netherMobs';
import { MOBS } from '../../mobs';
import { BLOCK_COLLIDE, BLOCK_FLUID, BLOCK_SOLID } from '../../blocks';
import { BLAZE_ROD, MUSIC_DISC_TEARS } from '../../items';
import { EF_ACTION, EF_FIRE } from '../../protocol';
import { boxCollides, moveBody } from '../physics';
import type { Entity, PlayerView } from './types';
import { DT, type NetherAI, type NState, type Tgt, type TargetId } from './netherMobs';

interface FlyerState {
  /** Ghast: carga del disparo (ticks; negativa: descansando), destino del vuelo y espera hasta el siguiente empujón. */
  charge: number;
  wanted: [number, number, number] | null;
  floatWait: number;
  /** Ghast: ticks sin ver a su objetivo. */
  unseen: number;
  /** Ghast: le mató su bola de fuego devuelta por un jugador. */
  reflected: boolean;
  /** Blaze: paso del ataque, espera, ticks sin verlo, margen de altura y cuándo cambia. */
  step: number;
  attackTime: number;
  lastSeen: number;
  heightOffset: number;
  heightTicks: number;
  charged: boolean;
}

/** Voces: normal, aviso del disparo (el chillido del ghast), disparo. */
export const FV_AMBIENT = 0;
export const FV_WARN = 1;
export const FV_SHOOT = 2;

export class FlyerAI {
  private states = new WeakMap<Entity, FlyerState>();

  constructor(private ai: NetherAI) {}

  /** Engancha el tick de las bolas de fuego (lo llama Entities cuando ya tiene su mapa de entidades especiales). */
  register(): void {
    this.m.custom.set(ENT_LARGE_FIREBALL, (e) => this.fireballTick(e));
    this.m.custom.set(ENT_SMALL_FIREBALL, (e) => this.fireballTick(e));
  }

  private get m() {
    return this.ai.m;
  }

  fstate(e: Entity): FlyerState {
    let f = this.states.get(e);
    if (!f) {
      f = {
        charge: 0, wanted: null, floatWait: 0, unseen: 0, reflected: false, step: 0, attackTime: 0, lastSeen: 0, heightOffset: 0.5,
        heightTicks: 0, charged: false,
      };
      this.states.set(e, f);
    }
    return f;
  }

  tick(e: Entity, s: NState, players: PlayerView[]): void {
    if (e.type === MOB_GHAST) this.ghast(e, s, this.fstate(e), players);
    else this.blaze(e, s, this.fstate(e), players);
  }

  // ------------------------------------------------------------------ ghast

  private ghast(e: Entity, s: NState, f: FlyerState, players: PlayerView[]): void {
    // Objetivo: un jugador a menos de 100 que vea y a 4 bloques de altura como mucho (uno de cada diez ticks lo busca).
    let t = this.ai.resolve(s.target, players);
    if (t) {
      if (this.ai.canSee(e, t)) f.unseen = 0;
      else if (++f.unseen > 60) t = null;
      if (t && Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z) > 100) t = null;
      if (t?.p && !this.ai.attackable(e, t.p, 100)) t = null;
    }
    if (!t) {
      s.target = null;
      if (this.m.rand() < 0.1) {
        const p = s.players.find((q) => Math.abs(q.y - e.y) <= 4);
        if (p) {
          s.target = p.id;
          s.targetT = -1;
          f.unseen = 0;
          t = this.ai.resolve(p.id, players);
        }
      }
    }
    // Vuelo al azar (RandomFloatAroundGoal): nuevo destino al llegar o si queda a más de 60.
    const d2 = f.wanted ? (f.wanted[0] - e.x) ** 2 + (f.wanted[1] - e.y) ** 2 + (f.wanted[2] - e.z) ** 2 : 0;
    if (!f.wanted || d2 < 1 || d2 > 3600) {
      const r = () => (this.m.rand() * 2 - 1) * 16;
      f.wanted = [e.x + r(), e.y + r(), e.z + r()];
    }
    // GhastMoveControl: cada 2–6 ticks, un empujón de 0,1 hacia el destino si el camino está libre.
    if (--f.floatWait <= 0) {
      f.floatWait += 2 + Math.floor(this.m.rand() * 5);
      const dx = f.wanted[0] - e.x, dy = f.wanted[1] - e.y, dz = f.wanted[2] - e.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > 1e-3 && this.canReach(e, dx, dy, dz)) {
        const k = (0.06 * 5) / 3 / d / DT;
        e.vx += dx * k;
        e.vy += dy * k;
        e.vz += dz * k;
      } else f.wanted = null;
    }
    this.fly(e);
    // Mira hacia donde va o hacia su objetivo (a menos de 64).
    if (t && Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z) < 64) {
      e.yaw = e.bodyYaw = Math.atan2(-(t.x - e.x), -(t.z - e.z));
      e.pitch = Math.atan2(t.y + 1 - (e.y + 2.6), Math.hypot(t.x - e.x, t.z - e.z));
    } else if (Math.hypot(e.vx, e.vz) > 1e-3) {
      e.yaw = e.bodyYaw = Math.atan2(-e.vx, -e.vz);
      e.pitch *= 0.8;
    }
    // Disparo (GhastShootFireballGoal).
    if (t) {
      const dist = Math.hypot(t.x - e.x, t.y - e.y, t.z - e.z);
      if (dist < GHAST_SHOOT_RANGE && this.ai.canSee(e, t)) {
        f.charge++;
        if (f.charge === 10) this.ai.voice(e, FV_WARN);
        if (f.charge === 20) {
          this.shootLarge(e, t);
          f.charge = -40;
        }
      } else if (f.charge > 0) f.charge--;
    } else f.charge = 0;
    this.ai.ambient(e, s, () => FV_AMBIENT);
  }

  /** ¿Puede ir en línea recta? (sin chocar su caja por el camino; GhastMoveControl.canReach). */
  private canReach(e: Entity, dx: number, dy: number, dz: number): boolean {
    const d = Math.hypot(dx, dy, dz);
    const steps = Math.ceil(d);
    const hw = e.width / 2;
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const x = e.x + dx * k, y = e.y + dy * k, z = e.z + dz * k;
      if (boxCollides(this.m.w, x - hw, y, z - hw, x + hw, y + e.height, z + hw)) return false;
    }
    return true;
  }

  /** Vuelo sin gravedad (travelFlying): frena × 0,91 en el aire, × 0,8 en el agua y × 0,5 en la lava. */
  private fly(e: Entity): void {
    moveBody(e, this.m.w, DT, 0);
    const k = e.inWater ? 0.8 : e.inLava ? 0.5 : 0.91;
    e.vx *= k;
    e.vy *= k;
    e.vz *= k;
    e.fallStart = e.y;
  }

  /** Bola de fuego grande desde 4 bloques delante, apuntada al centro del objetivo. */
  private shootLarge(e: Entity, t: Tgt): void {
    const vx = -Math.sin(e.yaw) * Math.cos(e.pitch), vz = -Math.cos(e.yaw) * Math.cos(e.pitch);
    const sx = e.x + vx * 4, sz = e.z + vz * 4, sy = e.y + e.height / 2 + 0.5;
    const dx = t.x - sx, dy = t.y + t.h / 2 - (0.5 + e.y + e.height / 2), dz = t.z - sz;
    this.ai.voice(e, FV_SHOOT);
    this.spawnFireball(ENT_LARGE_FIREBALL, sx, sy, sz, dx, dy, dz, e.id);
  }

  // ------------------------------------------------------------------ blaze

  private blaze(e: Entity, s: NState, f: FlyerState, players: PlayerView[]): void {
    // Margen de altura: cambia cada 100 ticks (triangular alrededor de 0,5 con amplitud 6,891).
    if (--f.heightTicks <= 0) {
      f.heightTicks = 100;
      f.heightOffset = 0.5 + (this.m.rand() - this.m.rand()) * 6.891;
    }
    // Objetivo: quien le hirió (HurtByTargetGoal) o el jugador más cercano que vea a menos de 48.
    let t = this.ai.resolve(s.target, players);
    if (t?.p && !this.ai.attackable(e, t.p, 48)) t = null;
    if (!t) {
      s.target = null;
      if (this.m.rand() < 0.1 && s.players[0]) {
        s.target = s.players[0].id;
        s.targetT = -1;
        t = this.ai.resolve(s.target, players);
      }
    }
    // Sube hacia su objetivo si le queda por encima del margen.
    if (t && t.y + (t.p ? 1.62 : t.h * 0.85) > e.y + 1.53 + f.heightOffset) e.vy += (0.3 - e.vy * DT) * 0.3 / DT;
    let mx = 0, mz = 0, sp = 0, jump = false;
    if (t) {
      f.attackTime--;
      const sees = this.ai.canSee(e, t);
      f.lastSeen = sees ? 0 : f.lastSeen + 1;
      const d2 = (t.x - e.x) ** 2 + (t.y - e.y) ** 2 + (t.z - e.z) ** 2;
      if (d2 < 4) {
        if (sees) {
          if (f.attackTime <= 0) {
            f.attackTime = 20;
            this.ai.hit(e, t, MOBS[MOB_BLAZE].damage, 'blaze');
          }
          [mx, mz, jump] = this.ai.direct(e, t.x, t.z);
          sp = 0.23;
        }
      } else if (d2 < 48 * 48 && sees) {
        if (f.attackTime <= 0) {
          f.step++;
          if (f.step === 1) {
            f.attackTime = BLAZE_CHARGE_TICKS;
            f.charged = true;
          } else if (f.step <= 4) f.attackTime = 6;
          else {
            f.attackTime = BLAZE_REST_TICKS;
            f.step = 0;
            f.charged = false;
          }
          if (f.step > 1) this.shootSmall(e, t, Math.sqrt(Math.sqrt(d2)) * 0.5);
        }
        this.ai.lookAt(e, t.x, t.y + t.h * 0.85, t.z);
      } else if (f.lastSeen < 5) {
        [mx, mz, jump] = this.ai.direct(e, t.x, t.z);
        sp = 0.23;
      }
      e.bodyYaw = Math.atan2(-(t.x - e.x), -(t.z - e.z));
      this.ai.lookAt(e, t.x, t.y + t.h * 0.85, t.z);
    } else {
      f.step = 0;
      f.charged = false;
      f.lastSeen = 0;
      // WaterAvoidingRandomStrollGoal(1.0): uno de cada 120 ticks elige un sitio.
      if (!s.walk && this.m.rand() < 1 / 120) s.walk = this.ai.landPos(e, 10, 7);
      if (s.walk) {
        if (Math.hypot(s.walk[0] - e.x, s.walk[2] - e.z) < 1 || e.ai!.stuck > 60) s.walk = null;
        else {
          [mx, mz, jump] = this.ai.steerTo(e, s.walk[0], s.walk[1], s.walk[2]);
          sp = 0.23;
        }
      }
      const near = s.players.find((p) => Math.hypot(p.x - e.x, p.z - e.z) < 8);
      if (near) this.ai.lookAt(e, near.x, near.y + 1.62, near.z);
      else this.ai.relaxLook(e);
      if (sp > 0) this.ai.face(e, e.x + mx, e.z + mz);
    }
    this.ai.walk(e, mx, mz, sp, jump);
    // Cae despacio (Blaze.aiStep: × 0,6 al bajar).
    if (!e.onGround && e.vy < 0) e.vy *= 0.6;
    e.fallStart = e.y;
    // El agua (y la lluvia) le hacen daño.
    if (e.inWater || (this.m.host.raining() > 0.3 && this.ai.brain.isSunlit({ ...e, inWater: false } as Entity))) this.m.damage(e, 1, e.x, e.z, null, 0);
    this.ai.ambient(e, s, () => FV_AMBIENT);
  }

  /** Bola de fuego pequeña con la dispersión del blaze (triangular de 2,297 · √√d · 0,5). */
  private shootSmall(e: Entity, t: Tgt, spread: number): void {
    const tri = (c: number, w: number) => c + (this.m.rand() - this.m.rand()) * w;
    const dx = tri(t.x - e.x, 2.297 * spread), dy = t.y + t.h / 2 - (e.y + e.height / 2), dz = tri(t.z - e.z, 2.297 * spread);
    this.ai.voice(e, FV_SHOOT);
    this.spawnFireball(ENT_SMALL_FIREBALL, e.x, e.y + e.height / 2 + 0.5, e.z, dx, dy, dz, e.id);
  }

  // ------------------------------------------------------------------ bolas de fuego

  /** Crea una bola de fuego en (x, y, z) hacia (dx, dy, dz) a 0,1 bloques por tick. */
  spawnFireball(type: number, x: number, y: number, z: number, dx: number, dy: number, dz: number, owner: string | number): Entity {
    const size = type === ENT_LARGE_FIREBALL ? 1 : 0.3125;
    const e = this.m.spawnBare(type, x, y - size / 2, z, size, size);
    const d = Math.hypot(dx, dy, dz) || 1;
    e.vx = (dx / d) * FIREBALL_ACCEL / DT;
    e.vy = (dy / d) * FIREBALL_ACCEL / DT;
    e.vz = (dz / d) * FIREBALL_ACCEL / DT;
    e.shooter = owner;
    e.yaw = Math.atan2(-dx, -dz);
    return e;
  }

  /** Un tick de una bola de fuego (AbstractHurtingProjectile.tick). */
  private fireballTick(e: Entity): void {
    e.flags = 0;
    if (e.age > 60 || e.y < -64) {
      this.m.remove(e.id);
      return;
    }
    const w = this.m.w;
    const vx = e.vx * DT, vy = e.vy * DT, vz = e.vz * DT;
    const len = Math.hypot(vx, vy, vz);
    const steps = Math.max(1, Math.ceil(len / 0.25));
    const half = e.width / 2;
    const players = this.m.host.players();
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const x = e.x + vx * k, y = e.y + half + vy * k, z = e.z + vz * k;
      // Criaturas y jugadores (no quien la lanzó, hasta que se aleje).
      const hitMob = this.entityAt(e, x, y, z, half);
      if (hitMob) {
        this.hitEntity(e, hitMob, x, y, z);
        return;
      }
      const hitPlayer = players.find((p) => p.alive && !p.creative && p.id !== e.shooter && Math.abs(p.x - x) < 0.3 + half && Math.abs(p.z - z) < 0.3 + half && y > p.y - half && y < p.y + 1.8 + half);
      if (hitPlayer) {
        this.hitPlayer(e, hitPlayer, x, y, z);
        return;
      }
      const b = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (b > 0 && BLOCK_COLLIDE[b]) {
        this.hitBlock(e, x - (vx / len) * 0.3, y - (vy / len) * 0.3, z - (vz / len) * 0.3);
        return;
      }
    }
    e.x += vx;
    e.y += vy;
    e.z += vz;
    // Acelera hacia donde va y frena con el aire (o el agua).
    const water = (() => {
      const b = w.getBlock(Math.floor(e.x), Math.floor(e.y + half), Math.floor(e.z));
      return b > 0 && BLOCK_FLUID[b] === 1;
    })();
    const inertia = water ? FIREBALL_WATER_INERTIA : FIREBALL_INERTIA;
    const n = len || 1;
    e.vx = (vx + (vx / n) * FIREBALL_ACCEL) * inertia / DT;
    e.vy = (vy + (vy / n) * FIREBALL_ACCEL) * inertia / DT;
    e.vz = (vz + (vz / n) * FIREBALL_ACCEL) * inertia / DT;
    e.yaw = Math.atan2(-e.vx, -e.vz);
    e.pitch = Math.atan2(e.vy, Math.hypot(e.vx, e.vz));
  }

  private entityAt(e: Entity, x: number, y: number, z: number, half: number): Entity | null {
    for (const m of this.m.list.values()) {
      if (!m.ai || m.dead || MOBS[m.type]?.inert) continue;
      if (m.id === e.shooter && e.age < 1) continue;
      const hw = m.width / 2 + half;
      if (Math.abs(m.x - x) < hw && Math.abs(m.z - z) < hw && y > m.y - half && y < m.y + m.height + half) return m;
    }
    return null;
  }

  private hitEntity(e: Entity, m: Entity, x: number, y: number, z: number): void {
    const owner = e.shooter ?? null;
    if (e.type === ENT_LARGE_FIREBALL) {
      // Devuelta por un jugador y alcanza a un ghast: le mata (y suelta el disco).
      if (m.type === MOB_GHAST && typeof owner === 'string') {
        this.fstate(m).reflected = true;
        m.invuln = 0;
        this.m.damage(m, 1000, x, z, owner, 1);
      } else this.m.damage(m, LARGE_FIREBALL_DAMAGE, x, z, owner, 1);
      this.explode(e, x, y, z);
      return;
    }
    if (!MOBS[m.type]?.fireImmune) {
      m.fire = Math.max(m.fire, SMALL_FIREBALL_FIRE_SECONDS);
      this.m.damage(m, SMALL_FIREBALL_DAMAGE, x, z, owner, 1);
    }
    this.m.remove(e.id);
  }

  private hitPlayer(e: Entity, p: PlayerView, x: number, y: number, z: number): void {
    const d = Math.hypot(e.vx, e.vz) || 1;
    if (e.type === ENT_LARGE_FIREBALL) {
      this.m.host.hurtPlayer(p.id, LARGE_FIREBALL_DAMAGE * this.m.difficultyScale(), (e.vx / d) * 5, 4, (e.vz / d) * 5, 'fireball');
      this.explode(e, x, y, z);
      return;
    }
    this.m.host.hurtPlayer(p.id, SMALL_FIREBALL_DAMAGE * this.m.difficultyScale(), (e.vx / d) * 3, 3, (e.vz / d) * 3, 'small_fireball');
    this.m.remove(e.id);
  }

  private hitBlock(e: Entity, x: number, y: number, z: number): void {
    if (e.type === ENT_LARGE_FIREBALL) {
      this.explode(e, x, y, z);
      return;
    }
    // La pequeña enciende fuego en el hueco de delante del bloque (si lo lanzó una criatura: mobGriefing).
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    this.m.host.igniteBlock?.(bx, by, bz);
    this.m.host.fx('fireball_hit', x, y, z);
    this.m.remove(e.id);
  }

  /** La grande explota con fuerza 1 y prende fuego (uno de cada tres huecos alcanzados con suelo sólido). */
  private explode(e: Entity, x: number, y: number, z: number): void {
    this.m.remove(e.id);
    this.m.explode(x, y, z, LARGE_FIREBALL_POWER);
    const w = this.m.w;
    const r = Math.ceil(LARGE_FIREBALL_POWER * 1.5);
    for (let dy = -r; dy <= r; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy + dz * dz > 2.25 || this.m.rand() >= 1 / 3) continue;
          const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
          if (w.getBlock(bx, by, bz) !== 0) continue;
          const below = w.getBlock(bx, by - 1, bz);
          if (below > 0 && BLOCK_SOLID[below]) this.m.host.igniteBlock?.(bx, by, bz);
        }
      }
    }
  }

  /**
   * Un jugador golpea una bola de fuego: la grande sale hacia donde mira (y ahora es suya); la pequeña no se
   * desvía. true si era una bola de fuego (el golpe no va a otra parte).
   */
  deflect(e: Entity, playerId: string, yaw: number, pitch: number): boolean {
    if (e.type === ENT_SMALL_FIREBALL) return true;
    if (e.type !== ENT_LARGE_FIREBALL) return false;
    const cp = Math.cos(pitch);
    e.vx = -Math.sin(yaw) * cp / DT;
    e.vy = Math.sin(pitch) / DT;
    e.vz = -Math.cos(yaw) * cp / DT;
    e.shooter = playerId;
    e.age = 0;
    this.m.host.fx('fireball_deflect', e.x, e.y + 0.5, e.z);
    return true;
  }

  // ------------------------------------------------------------------ daño, muerte, bits

  onDamaged(e: Entity, s: NState, attacker: TargetId | null): void {
    if (attacker === null || e.type !== MOB_BLAZE) return;
    const atk = typeof attacker === 'number' ? this.m.list.get(attacker) : undefined;
    if (atk?.type === MOB_BLAZE) return;
    s.target = attacker;
    s.targetT = -1;
    // HurtByTargetGoal.alertOthers: los demás blazes a su alcance (48, y 10 de altura) sin objetivo.
    for (const o of this.m.list.values()) {
      if (o === e || o.type !== MOB_BLAZE || o.dead || !o.ai) continue;
      if (Math.abs(o.x - e.x) > 48 || Math.abs(o.z - e.z) > 48 || Math.abs(o.y - e.y) > 10) continue;
      const os = this.ai.state(o);
      if (os.target === null) {
        os.target = attacker;
        os.targetT = -1;
      }
    }
  }

  onKilled(e: Entity, killer: TargetId | null): void {
    // La vara del blaze, sólo si lo mata un jugador (0–1, +Saqueo).
    if (e.type === MOB_BLAZE && typeof killer === 'string') {
      const n = Math.floor(this.m.rand() * 2) + (this.m.looting > 0 ? Math.floor(this.m.rand() * (this.m.looting + 1)) : 0);
      if (n > 0) this.ai.drop(e, BLAZE_ROD, n);
    }
    // El ghast al que mata su propia bola de fuego devuelta por un jugador: el disco «Tears».
    if (e.type === MOB_GHAST && typeof killer === 'string' && this.fstate(e).reflected) this.ai.drop(e, MUSIC_DISC_TEARS);
  }

  flags(e: Entity, s: NState): number {
    const f = this.fstate(e);
    void s;
    if (e.type === MOB_GHAST) return f.charge > 10 ? EF_ACTION : 0;
    return f.charged ? EF_FIRE : 0;
  }
}

/** ¿Es una bola de fuego? */
export function isFireball(type: number): boolean {
  return type === ENT_LARGE_FIREBALL || type === ENT_SMALL_FIREBALL;
}

void isNetherMob;
