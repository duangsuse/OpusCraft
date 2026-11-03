// Fase 7.5 (océano): guardián y guardián anciano. MobBrain les cede el tick (como a los monstruos de
// monsterAi.ts); si devuelve true, ya se movieron.
// - Nadan por el agua a rachas hacia puntos al azar (el anciano muy de vez en cuando). Fuera del agua dan
//   saltos en el suelo, pero no se ahogan.
// - Púas: salen cuando están quietos y se recogen al nadar. Con ellas fuera, quien les pega cuerpo a cuerpo
//   recibe 2 de daño (Espinas).
// - Láser (como en Minecraft): se fijan en un jugador (o un calamar o un ajolote) a más de 3 bloques y a la
//   vista, se paran, lo miran medio segundo y cargan el rayo (4 s el guardián, 3 s el anciano; el cliente
//   lo dibuja y cambia de color). Al terminar hace daño mágico (1, +2 en difícil, +2 el anciano) y además
//   el de su ataque (6 o 8, según la dificultad); si pierden de vista a la presa, se corta.
// - Botín: fragmentos de prismarina, bacalao o cristales de prismarina y, el anciano, una esponja mojada;
//   a veces, si lo mató un jugador, un pez al azar.
import { MOBS, MOB_SQUID, MOB_GLOW_SQUID, MOB_AXOLOTL } from '../../mobs';
import {
  MOB_ELDER_GUARDIAN, EF_GUARDIAN_MOVING, LASER_CHARGE, LASER_WARMUP, LASER_RANGE, THORNS_DAMAGE, isGuardian, laserMagic,
} from '../../oceanMobs';
import { BLOCK_FLUID, WET_SPONGE } from '../../blocks';
import { COD, COOKED_COD, PRISMARINE_CRYSTALS, SALMON, TROPICAL_FISH, PUFFERFISH, type ItemStack } from '../../items';
import { lineOfSight, moveBody } from '../physics';
import { GRAVITY, TAU, angleTo, lerpAngle, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';
import type { MobBrain } from './mobBrain';

/** Presas que no son jugadores (Minecraft: calamares, calamares brillantes y ajolotes). */
const PREY: ReadonlySet<number> = new Set([MOB_SQUID, MOB_GLOW_SQUID, MOB_AXOLOTL]);
/** Peces del botín raro (si lo mató un jugador: 2,5 % + 1 % por nivel de Saqueo). */
const RARE_FISH = [COD, SALMON, TROPICAL_FISH, PUFFERFISH];

interface GuardianState {
  /** Presa del láser: id de sesión de un jugador o id de entidad; null sin presa. */
  prey: string | number | null;
  /** Segundos desde que se fijó en la presa (los primeros LASER_WARMUP, sin rayo). */
  laser: number;
  /** Punto al que nada y espera hasta elegir otro. */
  goal: [number, number, number] | null;
  wait: number;
  moving: boolean;
  /** Mirada al azar cuando no hay presa. */
  look: number;
  /** Segundos hasta volver a buscar un calamar o un ajolote (con su espera propia: no depende del ritmo del tick). */
  scan: number;
}

/** Daño de un ataque cuerpo a cuerpo de Minecraft según la dificultad (fácil: mitad + 1; difícil: ×1,5). */
export function scaledAttack(damage: number, difficulty: number): number {
  if (difficulty <= 1) return Math.min(damage / 2 + 1, damage);
  return difficulty === 3 ? damage * 1.5 : damage;
}

export class GuardianAI {
  private states = new WeakMap<Entity, GuardianState>();

  constructor(private m: Entities, private brain: MobBrain) {}

  state(e: Entity): GuardianState {
    let s = this.states.get(e);
    if (!s) {
      s = { prey: null, laser: 0, goal: null, wait: this.m.rand() * 3, moving: false, look: this.m.rand() * 4, scan: this.m.rand() };
      this.states.set(e, s);
    }
    return s;
  }

  /** ¿Tiene las púas fuera? (está quieto). */
  spikesOut(e: Entity): boolean {
    return !this.state(e).moving;
  }

  /** Tick del guardián; false si no es uno. */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    if (!isGuardian(e.type)) return false;
    const st = this.state(e);
    const ai = e.ai!;
    ai.attackCd -= dt;
    st.scan -= dt;
    const prey = this.findPrey(e, st, players);
    let lookAt: [number, number, number] | null = null;
    if (prey) {
      // Parado mirando a la presa: medio segundo de aviso y luego el rayo cargando.
      lookAt = prey.pos;
      st.laser += dt;
      if (st.laser >= LASER_WARMUP && st.laser - dt < LASER_WARMUP) this.m.host.fx('guardian_laser', e.x, e.y + e.height / 2, e.z, e.type);
      if (st.laser >= LASER_WARMUP + LASER_CHARGE[e.type]) {
        this.fire(e, prey.id);
        st.prey = null;
        st.laser = 0;
      }
    } else st.laser = 0;
    // El rayo se ve (EF_ACTION) mientras carga.
    ai.fuse = prey && st.laser >= LASER_WARMUP ? st.laser - LASER_WARMUP + 0.001 : 0;
    ai.target = typeof st.prey === 'string' ? st.prey : null;
    if (e.inWater) this.swim(e, st, !!prey, dt);
    else this.flop(e, st, dt);
    // Orientación: el cuerpo hacia donde nada; la cabeza (y el ojo) hacia la presa o a su aire.
    const h = Math.hypot(e.vx, e.vz);
    if (h > 0.2) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 4);
    if (lookAt) {
      e.yaw = angleTo(e.x, e.z, lookAt[0], lookAt[2]);
      e.bodyYaw = lerpAngle(e.bodyYaw, e.yaw, dt * 6);
      e.pitch = Math.atan2(lookAt[1] - (e.y + e.height / 2), Math.hypot(lookAt[0] - e.x, lookAt[2] - e.z));
    } else {
      st.look -= dt;
      if (st.look <= 0) {
        st.look = 2 + this.m.rand() * 4;
        ai.lookYaw = e.bodyYaw + (this.m.rand() - 0.5) * 1.6;
      }
      e.yaw = lerpAngle(e.yaw, ai.lookYaw, dt * 3);
      e.pitch *= 1 - Math.min(1, dt * 2);
    }
    this.brain.updateFlags(e, ai);
    if (st.moving) e.flags |= EF_GUARDIAN_MOVING;
    return true;
  }

  /** Presa actual (si sigue valiendo) o una nueva: posición de los ojos e identidad. */
  private findPrey(e: Entity, st: GuardianState, players: PlayerView[]): { id: string | number; pos: [number, number, number] } | null {
    const ex = e.x, ey = e.y + e.height / 2, ez = e.z;
    const w = this.m.w;
    const valid = (x: number, y: number, z: number, keep: boolean) => {
      const d2 = (x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2;
      // Minecraft: la presa ha de estar a más de 3 bloques (el anciano sigue aunque se acerque).
      if (d2 > LASER_RANGE * LASER_RANGE || (d2 <= 9 && !(keep && e.type === MOB_ELDER_GUARDIAN))) return false;
      return lineOfSight(w, ex, ey, ez, x, y, z);
    };
    if (st.prey !== null) {
      if (typeof st.prey === 'string') {
        const p = players.find((q) => q.id === st.prey && q.alive && !q.creative);
        if (p && valid(p.x, p.y + 1.6, p.z, true)) return { id: p.id, pos: [p.x, p.y + 1.2, p.z] };
      } else {
        const o = this.m.list.get(st.prey);
        if (o && !o.dead && valid(o.x, o.y + o.height / 2, o.z, true)) return { id: o.id, pos: [o.x, o.y + o.height / 2, o.z] };
      }
      st.prey = null;
      st.laser = 0;
    }
    if (this.m.host.difficulty() === 0) return null;
    // Un jugador a la vista o, si no, un calamar o un ajolote.
    const p = this.brain.nearestPlayer(e, players, LASER_RANGE, false);
    if (p && valid(p.x, p.y + 1.6, p.z, false)) {
      st.prey = p.id;
      return { id: p.id, pos: [p.x, p.y + 1.2, p.z] };
    }
    // Más o menos una vez por segundo (antes miraba `age % 1`, que se saltaba con ticks más largos).
    if (st.scan <= 0) {
      st.scan = 0.5 + this.m.rand();
      for (const o of this.m.list.values()) {
        if (!PREY.has(o.type) || o.dead || Math.abs(o.x - ex) > LASER_RANGE || Math.abs(o.z - ez) > LASER_RANGE) continue;
        if (!valid(o.x, o.y + o.height / 2, o.z, false)) continue;
        st.prey = o.id;
        return { id: o.id, pos: [o.x, o.y + o.height / 2, o.z] };
      }
    }
    return null;
  }

  /** Fin de la carga: daño mágico y luego el del ataque (con la invulnerabilidad, cuenta el mayor). */
  private fire(e: Entity, id: string | number): void {
    const def = MOBS[e.type];
    const diff = this.m.host.difficulty();
    const magic = laserMagic(e.type, diff);
    if (typeof id === 'string') {
      this.m.host.hurtPlayer(id, magic, 0, 0, 0, 'guardian_laser');
      this.m.host.hurtPlayer(id, scaledAttack(def.damage, diff), 0, 1, 0, def.key, e);
    } else {
      const o = this.m.list.get(id);
      if (o) this.m.damage(o, Math.max(magic, def.damage), e.x, e.z, e.id, 0.2);
    }
    this.m.host.fx('mob_attack', e.x, e.y + e.height / 2, e.z, e.type);
  }

  /** Nado a rachas hacia un punto de agua al azar; quieto mientras dispara. */
  private swim(e: Entity, st: GuardianState, attacking: boolean, dt: number): void {
    const def = MOBS[e.type];
    st.wait -= dt;
    if (attacking) st.goal = null;
    else if (!st.goal && st.wait <= 0) {
      // El anciano apenas se mueve (Minecraft: intenta pasear cada 400 ticks en vez de cada 80).
      st.wait = e.type === MOB_ELDER_GUARDIAN ? 12 + this.m.rand() * 16 : 2 + this.m.rand() * 4;
      st.goal = this.waterGoal(e);
    }
    let tx = 0, ty = 0, tz = 0;
    if (st.goal) {
      const dx = st.goal[0] - e.x, dy = st.goal[1] - (e.y + e.height / 2), dz = st.goal[2] - e.z;
      const d = Math.hypot(dx, dy, dz);
      if (d < 0.8 || e.hitWall) st.goal = null;
      else {
        const sp = def.walk;
        tx = (dx / d) * sp;
        ty = (dy / d) * sp;
        tz = (dz / d) * sp;
      }
    }
    const k = Math.min(1, dt * 2);
    e.vx += (tx - e.vx) * k;
    e.vy += (ty - e.vy) * k;
    e.vz += (tz - e.vz) * k;
    st.moving = Math.hypot(e.vx, e.vy, e.vz) > 0.35;
    moveBody(e, this.m.w, dt);
    e.fallStart = e.y;
  }

  /** Punto de agua al azar a unos 10 bloques (null si no encuentra). */
  private waterGoal(e: Entity): [number, number, number] | null {
    const w = this.m.w;
    for (let i = 0; i < 10; i++) {
      const a = this.m.rand() * TAU, r = 3 + this.m.rand() * 7;
      const x = e.x + Math.cos(a) * r, y = e.y + e.height / 2 + (this.m.rand() - 0.5) * 6, z = e.z + Math.sin(a) * r;
      const b = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (b > 0 && BLOCK_FLUID[b] === 1 && lineOfSight(w, e.x, e.y + e.height / 2, e.z, x, y, z)) return [x, y, z];
    }
    return null;
  }

  /** Fuera del agua: da saltos al azar en el suelo (Minecraft: 0,5 hacia arriba y un poco de lado). */
  private flop(e: Entity, st: GuardianState, dt: number): void {
    st.goal = null;
    e.vy = Math.max(-60, e.vy - GRAVITY * dt);
    if (e.onGround) {
      e.vx *= Math.max(0, 1 - dt * 8);
      e.vz *= Math.max(0, 1 - dt * 8);
      if (this.m.rand() < dt * 2.5) {
        e.vy = 8;
        e.vx = (this.m.rand() - 0.5) * 8;
        e.vz = (this.m.rand() - 0.5) * 8;
        e.bodyYaw = this.m.rand() * TAU;
        this.m.host.fx('guardian_flop', e.x, e.y, e.z, e.type);
      }
    }
    st.moving = !e.onGround;
    moveBody(e, this.m.w, dt);
    if (e.onGround) e.fallStart = e.y;
  }

  /** Un jugador le pega cuerpo a cuerpo: con las púas fuera, se pincha (2 de daño). */
  meleeThorns(e: Entity, playerId: string, px: number, pz: number): void {
    if (!isGuardian(e.type) || !e.ai || !this.spikesOut(e)) return;
    const dx = px - e.x, dz = pz - e.z, d = Math.hypot(dx, dz) || 1;
    this.m.host.hurtPlayer(playerId, THORNS_DAMAGE, (dx / d) * 2, 2, (dz / d) * 2, 'guardian_thorns');
    this.m.host.fx('guardian_thorns', e.x, e.y + e.height / 2, e.z, e.type);
  }

  /** Botín propio (además de los fragmentos de MobDef.drops). */
  onKilled(e: Entity): void {
    if (!isGuardian(e.type)) return;
    const r = this.m.rand();
    const out: ItemStack[] = [];
    const looting = this.m.looting;
    // Bacalao (3), cristales de prismarina (2) o nada (1); con Saqueo, alguno más.
    if (r < 3 / 6) out.push({ id: e.fire > 0 ? COOKED_COD : COD, count: 1 + Math.floor(this.m.rand() * (looting + 1)) });
    else if (r < 5 / 6) out.push({ id: PRISMARINE_CRYSTALS, count: 1 + Math.floor(this.m.rand() * (looting + 1)) });
    if (e.type === MOB_ELDER_GUARDIAN) out.push({ id: WET_SPONGE, count: 1 });
    // Pez raro si lo mató un jugador.
    const byPlayer = !!e.lastHurtBy && e.age - (e.lastHurtAt ?? -99) < 5;
    if (byPlayer && this.m.rand() < 0.025 + 0.01 * looting) out.push({ id: RARE_FISH[Math.floor(this.m.rand() * RARE_FISH.length)], count: 1 });
    this.m.dropStacks(out, e.x, e.y + 0.3, e.z);
  }
}
