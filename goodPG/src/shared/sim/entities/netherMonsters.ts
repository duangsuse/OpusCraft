// Fase 8.3 (criaturas del Nether): cubo de magma y esqueleto wither, como MagmaCube (AbstractCubeMob) y
// WitherSkeleton (AbstractSkeleton) de Java 26.3.
//
// Cubo de magma: se mueve a saltos (espera entre saltos (10–29) × 4 ticks, un tercio si persigue a alguien),
// salta 0,42 + 0,1 por tamaño (en la lava, 0,22 + 0,05 por tamaño) y, en el aire, apenas corrige; persigue a los
// jugadores a menos de 16 bloques y 4 de altura (y a los gólems de hierro) y hace daño al tocarlos (tamaño + 2;
// hasta el pequeño). Tamaños 1, 2 y 4 al aparecer; al morir se divide en 2–4 de la mitad de tamaño. Armadura 3 por
// tamaño; no le afectan el fuego ni la lava; flota en la lava.
// Esqueleto wither: espada de piedra (8 de daño en normal) y Marchitamiento 10 s al golpear; ataca a los
// jugadores, a los piglins (y piglins brutos) y a los gólems de hierro; huye de los lobos; pasea por el Nether.
import {
  MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM, MOB_WITHER_SKELETON, MAGMA_SPLIT, WITHER_HIT_SECONDS, isMagmaCube, magmaSize,
  magmaOfSize, isPiglin, packGear, gearMain,
} from '../../netherMobs';
import { MOBS, MOB_IRON_GOLEM, MOB_WOLF } from '../../mobs';
import { TOOLS, ITEMS } from '../../items';
import { EFFECT_WITHER } from '../../effects';
import { EF_ACTION } from '../../protocol';
import type { Entity, PlayerView } from './types';
import { DT, type NetherAI, type NState, type Tgt, type TargetId } from './netherMobs';

interface MonsterState {
  /** Cubo: espera hasta el siguiente salto, rumbo elegido, cuándo elige otro y si iba por el aire. */
  jumpDelay: number;
  heading: number;
  headingT: number;
  airborne: boolean;
  tired: number;
}

export const MV_AMBIENT = 0;
/** Voz del cubo al saltar. */
export const MV_JUMP = 1;

export class NetherMonsterAI {
  private states = new WeakMap<Entity, MonsterState>();

  constructor(private ai: NetherAI) {}

  private get m() {
    return this.ai.m;
  }

  mstate(e: Entity): MonsterState {
    let st = this.states.get(e);
    if (!st) {
      st = { jumpDelay: 0, heading: e.bodyYaw, headingT: 0, airborne: false, tired: 0 };
      this.states.set(e, st);
    }
    return st;
  }

  // ------------------------------------------------------------------ aparición

  /** Tamaño al aparecer (AbstractCubeMob.setSpawnSize): 1, 2 o 4 (en difícil, a veces uno más). */
  magmaSpawnSize(e: Entity): Entity {
    let scale = Math.floor(this.m.rand() * 3);
    const hard = this.m.host.difficulty() === 3 ? 0.125 : 0;
    if (scale < 2 && this.m.rand() < 0.5 * hard) scale++;
    const type = magmaOfSize(1 << scale);
    if (type === e.type) return e;
    const n = this.m.spawnMob(type, e.x, e.y, e.z);
    if (!n) return e;
    n.yaw = n.bodyYaw = e.yaw;
    if (e.customName) n.customName = e.customName;
    this.m.remove(e.id);
    return n;
  }

  finalizeSpawn(e: Entity): void {
    if (e.type === MOB_WITHER_SKELETON) e.gear = packGear(TOOLS.stone.sword, 0, 0);
  }

  // ------------------------------------------------------------------ tick

  tick(e: Entity, s: NState, players: PlayerView[]): void {
    if (isMagmaCube(e.type)) this.magma(e, s, this.mstate(e), players);
    else this.witherSkeleton(e, s, players);
  }

  // ------------------------------------------------------------------ cubo de magma

  private magma(e: Entity, s: NState, st: MonsterState, players: PlayerView[]): void {
    const size = magmaSize(e.type);
    const attr = 0.2 + 0.1 * size;
    // Objetivo: jugador a 16 que vea y a 4 de altura como mucho (o un gólem de hierro); se cansa a los 300 ticks.
    let t = this.ai.resolve(s.target, players);
    if (t?.p && (!this.ai.attackable(e, t.p, 16) || Math.abs(t.y - e.y) > 4)) t = null;
    if (t && st.tired > 0 && --st.tired === 0) t = null;
    if (!t) {
      s.target = null;
      if (this.m.rand() < 0.1) {
        const p = s.players.find((q) => Math.abs(q.y - e.y) <= 4);
        const golem = s.seen.find((o) => o.type === MOB_IRON_GOLEM);
        const pick = p?.id ?? golem?.id ?? null;
        if (pick !== null) {
          s.target = pick;
          s.targetT = -1;
          st.tired = 300;
          t = this.ai.resolve(pick, players);
        }
      }
    }
    // Rumbo: hacia su objetivo, o uno al azar que cambia cada 40–100 ticks.
    let aggressive = false;
    if (t) {
      st.heading = Math.atan2(-(t.x - e.x), -(t.z - e.z));
      aggressive = true;
    } else if ((e.onGround || e.inLava || e.inWater) && --st.headingT <= 0) {
      st.headingT = 40 + Math.floor(this.m.rand() * 60);
      st.heading = Math.floor(this.m.rand() * 360) * (Math.PI / 180);
    }
    // Gira como mucho 90° por tick.
    let dy = st.heading - e.bodyYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    e.bodyYaw += Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dy));
    e.yaw = e.bodyYaw;
    e.pitch = 0;
    const fx = -Math.sin(e.bodyYaw), fz = -Math.cos(e.bodyYaw);
    const fluid = e.inLava || e.inWater;
    let speed = 0, jump = false;
    if (fluid) {
      // CubeMobFloatGoal: en un líquido, un 80 % de los ticks salta (en la lava, 0,22 + 0,05 por tamaño).
      speed = 1.2 * attr;
      if (this.m.rand() < 0.8) {
        e.vy = (e.inLava ? 0.22 + size * 0.05 : 0.04 + e.vy * DT) / DT;
      }
    } else if (e.onGround) {
      if (st.jumpDelay-- <= 0) {
        st.jumpDelay = (10 + Math.floor(this.m.rand() * 20)) * 4;
        if (aggressive) st.jumpDelay = Math.floor(st.jumpDelay / 3);
        speed = attr;
        jump = true;
        this.ai.voice(e, MV_JUMP);
      }
    } else speed = attr;
    if (jump) {
      this.ai.walk(e, fx, fz, speed, false);
      e.vy = (0.42 + size * 0.1) / DT;
      e.onGround = false;
    } else this.ai.walk(e, speed > 0 ? fx : 0, speed > 0 ? fz : 0, speed, false);
    st.airborne = !e.onGround;
    // Daño al tocar (a cualquier jugador que toque, y a su objetivo).
    if (s.cool === 0) {
      const dmg = size + 2;
      for (const p of players) {
        if (!p.alive || p.creative) continue;
        const tp: Tgt = { id: p.id, x: p.x, y: p.y, z: p.z, w: 0.6, h: 1.8, p };
        if (this.touching(e, tp) && this.ai.inReach(e, tp) && this.ai.canSee(e, tp)) {
          this.ai.hit(e, tp, dmg, 'magma_cube');
          s.cool = 10;
          break;
        }
      }
      if (s.cool === 0 && t?.e && this.touching(e, t) && this.ai.inReach(e, t)) {
        this.ai.hit(e, t, dmg, 'magma_cube');
        s.cool = 10;
      }
    }
  }

  private touching(e: Entity, t: Tgt): boolean {
    const hw = e.width / 2 + t.w / 2;
    return Math.abs(t.x - e.x) < hw + 0.05 && Math.abs(t.z - e.z) < hw + 0.05 && t.y < e.y + e.height && t.y + t.h > e.y;
  }

  // ------------------------------------------------------------------ esqueleto wither

  private witherSkeleton(e: Entity, s: NState, players: PlayerView[]): void {
    let t = this.ai.resolve(s.target, players);
    if (t?.p && !this.ai.attackable(e, t.p, 16)) t = null;
    if (!t) {
      s.target = null;
      // NearestAttackableTargetGoal: jugador, gólem de hierro y piglins (uno de cada diez ticks busca).
      if (this.m.rand() < 0.1) {
        const p = s.players[0];
        const mob = s.seen.find((o) => o.type === MOB_IRON_GOLEM || isPiglin(o.type));
        const dp = p ? Math.hypot(p.x - e.x, p.z - e.z) : Infinity, dm = mob ? Math.hypot(mob.x - e.x, mob.z - e.z) : Infinity;
        const pick = dp <= dm ? p?.id ?? null : mob?.id ?? null;
        if (pick !== null) {
          s.target = pick;
          s.targetT = -1;
          t = this.ai.resolve(pick, players);
        }
      }
    }
    // Huye de los lobos (AvoidEntityGoal: a 6 bloques, 1,0 lejos y 1,2 cerca).
    const wolf = s.seen.find((o) => o.type === MOB_WOLF && Math.hypot(o.x - e.x, o.z - e.z) < 6);
    const sp = 0.25;
    if (wolf) {
      const near = Math.hypot(wolf.x - e.x, wolf.z - e.z) < 3;
      if (!s.walk || Math.hypot(s.walk[0] - wolf.x, s.walk[2] - wolf.z) < 6) s.walk = this.ai.awayPos(e, wolf.x, wolf.z, 16, 7);
      if (s.walk && this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], sp * (near ? 1.2 : 1), 1)) s.walk = null;
      if (!s.walk) this.ai.walk(e, 0, 0, 0);
    } else if (t) {
      // MeleeAttackGoal(1.2): se acerca y golpea cada 20 ticks (con Marchitamiento).
      this.ai.lookAt(e, t.x, t.y + (t.p ? 1.62 : t.h * 0.85), t.z);
      if (!this.ai.inReach(e, t)) this.ai.goTo(e, t.x, t.y, t.z, sp * 1.2, 0.5, undefined, true);
      else {
        this.ai.walk(e, 0, 0, 0);
        this.ai.face(e, t.x, t.z);
        if (s.cool === 0 && this.ai.canSee(e, t)) {
          s.cool = 20;
          this.ai.hit(e, t, MOBS[MOB_WITHER_SKELETON].damage, 'wither_skeleton');
          if (t.p) this.m.host.effectPlayer?.(t.p.id, EFFECT_WITHER, WITHER_HIT_SECONDS, 0);
          else if (t.e) this.m.effects.add(t.e, EFFECT_WITHER, WITHER_HIT_SECONDS, 0, 1, e.id);
        }
      }
    } else {
      // WaterAvoidingRandomStrollGoal(1.0): uno de cada 120 ticks.
      if (s.walk) {
        if (this.ai.goTo(e, s.walk[0], s.walk[1], s.walk[2], sp, 1) || e.ai!.stuck > 60) s.walk = null;
      } else {
        this.ai.walk(e, 0, 0, 0);
        if (this.m.rand() < 1 / 120) s.walk = this.ai.landPos(e, 10, 7);
      }
      const near = s.players.find((p) => Math.hypot(p.x - e.x, p.z - e.z) < 8);
      if (near) this.ai.lookAt(e, near.x, near.y + 1.62, near.z);
      else this.ai.relaxLook(e);
    }
    this.ai.ambient(e, s, () => MV_AMBIENT);
  }

  // ------------------------------------------------------------------ daño y muerte

  onDamaged(e: Entity, s: NState, attacker: TargetId | null): void {
    if (attacker === null || e.type !== MOB_WITHER_SKELETON) return;
    const atk = typeof attacker === 'number' ? this.m.list.get(attacker) : undefined;
    if (atk?.type === MOB_WITHER_SKELETON) return;
    s.target = attacker;
    s.targetT = -1;
  }

  onKilled(e: Entity, killer: TargetId | null): void {
    // Los cubos grandes se dividen en 2–4 de la mitad de tamaño.
    const child = MAGMA_SPLIT[e.type];
    if (child !== undefined) {
      const n = 2 + Math.floor(this.m.rand() * 3);
      const half = MOBS[e.type].width / 2;
      for (let i = 0; i < n; i++) {
        const ox = ((i % 2) - 0.5) * half, oz = (Math.floor(i / 2) - 0.5) * half;
        const c = this.m.spawnMob(child, e.x + ox, e.y + 0.5, e.z + oz);
        if (!c) continue;
        c.yaw = c.bodyYaw = this.m.rand() * Math.PI * 2;
        if (e.customName) c.customName = e.customName;
      }
      return;
    }
    if (e.type !== MOB_WITHER_SKELETON) return;
    // La espada (8,5 % + 1 % por nivel de Saqueo, desgastada) y el cráneo (2,5 %; 3,5 % + 1 % por nivel más con Saqueo).
    const main = gearMain(e.gear);
    if (main && this.m.rand() < 0.085 + this.m.looting * 0.01) {
      const max = ITEMS[main]?.tool?.durability ?? 0;
      const r1 = Math.floor(this.m.rand() * Math.max(max - 3, 1));
      const r2 = Math.floor(this.m.rand() * (1 + r1));
      this.ai.drop(e, main, 1, max > 0 ? Math.max(0, max - r2) : undefined);
    }
    if (typeof killer === 'string') {
      const c = this.m.looting > 0 ? 0.035 + (this.m.looting - 1) * 0.01 : 0.025;
      if (this.m.rand() < c) this.ai.drop(e, this.ai.skullItem('wither_skeleton'));
    }
  }

  flags(e: Entity, s: NState): number {
    void s;
    if (isMagmaCube(e.type)) return this.mstate(e).airborne ? EF_ACTION : 0;
    return 0;
  }
}

void MOB_MAGMA_CUBE;
void MOB_MAGMA_CUBE_MEDIUM;
