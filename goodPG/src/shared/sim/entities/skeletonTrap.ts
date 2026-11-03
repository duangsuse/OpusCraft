// Fase 7.5 (fauna): caballos no muertos y la trampa del rayo, en el servidor.
// - Caballo esqueleto: ya viene domado (se le pone la silla y se monta sin domarlo) y anda bajo el agua.
//   El caballo zombi se doma montándolo, como el caballo.
// - Trampa: en una tormenta, un rayo puede dejar un caballo esqueleto «trampa» en vez de caer (más cuanto
//   más difícil). Si un jugador se le acerca a 10 bloques, cae otro rayo (sólo de luz) y aparecen cuatro
//   jinetes esqueleto (el caballo trampa y tres más) con casco de hierro y arco encantados. Si nadie se
//   acerca en 15 minutos, el caballo trampa se va.
// - Jinete: el esqueleto piensa (busca al jugador, guarda las distancias y dispara) y su caballo lo lleva;
//   el esqueleto va sentado encima. Con el casco no arde al sol. Si el caballo muere, sigue a pie; si
//   muere el jinete, el caballo queda libre (y domado).
import { MOBS, MOB_SKELETON } from '../../mobs';
import { MOB_SKELETON_HORSE, TRAP_HORSE_SECONDS, TRAP_RANGE, TRAP_HORSEMEN, isUndeadHorse } from '../../critters';
import { MOUNTS } from '../../mounts';
import { ARMOR, BOW, type ItemStack } from '../../items';
import { POWER, enchLevel } from '../../enchantments';
import { enchantWithLevels, rndFrom, TABLE_POOL } from '../../enchanting';
import { armorReduce } from '../../armor';
import { moveBody, lineOfSight } from '../physics';
import { GRAVITY, TAU, angleTo, lerpAngle, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';

/** Caballos no muertos: segundos que le quedan a la trampa (0: no es trampa) y jinete esqueleto. */
interface HorseState {
  init: boolean;
  trap: number;
  rider: number | null;
}

/** Jinete esqueleto: su caballo, lo que quiere que haga el caballo y su equipo. */
interface Horseman {
  horse: number;
  steer: [number, number, number];
  think: number;
  helmet: ItemStack;
  bow: ItemStack;
}

const HORSES = new WeakMap<Entity, HorseState>();
const RIDERS = new WeakMap<Entity, Horseman>();

/** Probabilidad de que un rayo natural sea una trampa, por dificultad (1 %, 2,5 % y 4 % de media). */
const TRAP_CHANCE: readonly number[] = [0, 0.01, 0.025, 0.04];
/** Probabilidad de que el jinete suelte su casco o su arco al morir (la del equipo de las criaturas). */
const GEAR_DROP = 0.085;
/** Altura de la cadera del esqueleto sentado sobre sus pies (el largo de sus piernas). */
const SKELETON_HIP = 0.75;
/** Casco que protege del sol (cualquier casco de las armaduras). */
const HELMETS = new Set<number>(Object.values(ARMOR).map((a) => a.helmet).filter((id): id is number => id !== undefined));

function horseState(e: Entity): HorseState {
  let s = HORSES.get(e);
  if (!s) {
    s = { init: false, trap: 0, rider: null };
    HORSES.set(e, s);
  }
  return s;
}

/** ¿Lleva un casco puesto? (el jinete de la trampa: no arde al sol). */
export function wearsHelmet(e: Entity): boolean {
  return e.gear !== undefined && HELMETS.has(e.gear);
}

/** ¿Es un caballo trampa todavía sin disparar? */
export function isTrapHorse(e: Entity): boolean {
  return (HORSES.get(e)?.trap ?? 0) > 0;
}

/** ¿Va montado este esqueleto en un caballo? */
export function isHorseman(e: Entity): boolean {
  return RIDERS.has(e);
}

/** Probabilidad de trampa de un rayo natural con la dificultad `d`. */
export function trapChance(d: number): number {
  return TRAP_CHANCE[d] ?? 0;
}

// ------------------------------------------------------------------ trampa

/** Deja un caballo trampa en (x, y, z). */
export function spawnTrapHorse(m: Entities, x: number, y: number, z: number): Entity | null {
  const e = m.spawnMob(MOB_SKELETON_HORSE, x, y, z);
  if (!e) return null;
  const s = horseState(e);
  s.init = true;
  s.trap = TRAP_HORSE_SECONDS;
  e.tamed = false;
  return e;
}

/** Nivel de encantamiento del equipo según la dificultad (5 a 22 niveles, más en difícil). */
function gearLevels(m: Entities): number {
  const special = [0, 0, 0.35, 0.75][m.host.difficulty()] ?? 0.35;
  return 5 + Math.floor(special * m.rand() * 18);
}

/** Sube un esqueleto con casco y arco encantados al caballo `horse`. */
function mountHorseman(m: Entities, horse: Entity): Entity | null {
  const md = MOUNTS[horse.type];
  const sk = m.spawnMob(MOB_SKELETON, horse.x, horse.y + (md?.seat ?? 1.38) - SKELETON_HIP, horse.z);
  if (!sk) return null;
  const r = rndFrom(() => m.rand());
  const helmet = enchantWithLevels({ id: ARMOR.iron.helmet, count: 1 }, gearLevels(m), r, TABLE_POOL);
  const bow = enchantWithLevels({ id: BOW, count: 1 }, gearLevels(m), r, TABLE_POOL);
  RIDERS.set(sk, { horse: horse.id, steer: [0, 0, 0], think: 0, helmet, bow });
  sk.gear = helmet.id;
  sk.invuln = 3;
  sk.yaw = sk.bodyYaw = horse.bodyYaw;
  horseState(horse).rider = sk.id;
  return sk;
}

/** Salta la trampa: un rayo de luz y cuatro jinetes (el caballo trampa y tres más). */
export function springTrap(m: Entities, horse: Entity): Entity[] {
  const s = horseState(horse);
  s.trap = 0;
  horse.tamed = true;
  horse.growAge = 0;
  horse.invuln = 3;
  m.host.fx('lightning', horse.x, horse.y, horse.z);
  const out: Entity[] = [];
  const first = mountHorseman(m, horse);
  if (first) out.push(first);
  for (let i = 1; i < TRAP_HORSEMEN; i++) {
    const h = m.spawnMob(MOB_SKELETON_HORSE, horse.x, horse.y, horse.z);
    if (!h) continue;
    const hs = horseState(h);
    hs.init = true;
    h.tamed = true;
    h.invuln = 3;
    // Empujón al azar (distribución triangular, como en Minecraft) para que se separen.
    const tri = () => (m.rand() - m.rand()) * 1.15 * 20 * 0.3;
    h.vx = tri();
    h.vz = tri();
    const sk = mountHorseman(m, h);
    if (sk) out.push(sk);
  }
  return out;
}

// ------------------------------------------------------------------ caballos

/**
 * Tick de un caballo esqueleto o zombi. Devuelve true si ya lo movió (lleva un jinete esqueleto); false
 * para seguir con el cerebro común.
 */
export function undeadHorseTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): boolean {
  const s = horseState(e);
  if (!s.init) {
    s.init = true;
    // El caballo esqueleto ya viene domado (como en Minecraft); el zombi hay que domarlo.
    if (e.type === MOB_SKELETON_HORSE && s.trap <= 0) e.tamed = true;
  }
  if (s.trap > 0) {
    s.trap -= dt;
    if (s.trap <= 0) {
      m.remove(e.id);
      return true;
    }
    for (const p of players) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) <= TRAP_RANGE) {
        springTrap(m, e);
        break;
      }
    }
    return false;
  }
  if (s.rider === null) return false;
  const rider = m.list.get(s.rider);
  const r = rider ? RIDERS.get(rider) : undefined;
  if (!rider || rider.dead || !r || e.rider) {
    s.rider = null;
    return false;
  }
  carry(m, e, r.steer, dt);
  return true;
}

/** El caballo va hacia donde quiere su jinete ([dirección x, z, velocidad]). */
function carry(m: Entities, e: Entity, steer: [number, number, number], dt: number): void {
  const [mx, mz, speed] = steer;
  const acc = Math.min(1, dt * (e.onGround ? 8 : 2));
  e.vx += (mx * speed - e.vx) * acc;
  e.vz += (mz * speed - e.vz) * acc;
  if (e.inWater && !sinksInWater(e.type)) e.vy += (1.8 - e.vy) * Math.min(1, dt * 3);
  else if (e.inWater) e.vy = Math.max(-3, e.vy - GRAVITY * 0.3 * dt);
  else e.vy = Math.max(-60, e.vy - GRAVITY * dt);
  if (e.onGround && e.hitWall && speed > 0) e.vy = 9;
  moveBody(e, m.w, dt, 1.05);
  if (e.onGround || e.inWater) e.fallStart = e.y;
  if (Math.hypot(e.vx, e.vz) > 0.3) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 6);
  e.yaw = lerpAngle(e.yaw, e.bodyYaw, dt * 6);
  e.pitch = 0;
  m.mobs.updateFlags(e, e.ai!);
}

/** El caballo esqueleto no flota: se hunde y anda por el fondo. */
export function sinksInWater(type: number): boolean {
  return type === MOB_SKELETON_HORSE;
}

// ------------------------------------------------------------------ jinetes

/**
 * Tick de un esqueleto: si va montado, decide (buscar al jugador, guardar las distancias, disparar) y se
 * sienta sobre su caballo. Devuelve true si ya lo movió; false si va a pie (sigue el cerebro común).
 */
export function horsemanTick(m: Entities, sk: Entity, dt: number, players: PlayerView[]): boolean {
  const r = RIDERS.get(sk);
  if (!r) return false;
  const horse = m.list.get(r.horse);
  if (!horse || horse.dead || horse.rider || !isUndeadHorse(horse.type)) {
    // Sin caballo: sigue a pie desde donde esté (cae si estaba arriba).
    RIDERS.delete(sk);
    sk.fallStart = sk.y;
    return false;
  }
  const ai = sk.ai!;
  ai.shootCd -= dt;
  r.think -= dt;
  const target = m.mobs.nearestPlayer(sk, players, 24, true);
  ai.target = target ? target.id : null;
  let mx = 0, mz = 0, speed = 0;
  let lookAt: [number, number, number] | null = null;
  if (target) {
    const dx = target.x - sk.x, dz = target.z - sk.z;
    const dist = Math.hypot(dx, dz) || 1;
    lookAt = [target.x, target.y + 1.5, target.z];
    const los = dist < 24 && lineOfSight(m.w, sk.x, sk.y + sk.height * 0.85, sk.z, target.x, target.y + 1.5, target.z);
    if (dist < 7) {
      mx = -dx / dist;
      mz = -dz / dist;
      speed = MOBS[horse.type].run;
    } else if (dist > 14 || !los) {
      mx = dx / dist;
      mz = dz / dist;
      speed = MOBS[horse.type].run;
    } else {
      // Rodeo a caballo alrededor del jugador.
      const side = Math.sin(sk.age * 0.5 + sk.id) > 0 ? 1 : -1;
      mx = (-dz / dist) * side;
      mz = (dx / dist) * side;
      speed = MOBS[horse.type].walk * 1.5;
    }
    if (los && dist < 20 && ai.shootCd <= 0) {
      // Como el esqueleto: un disparo por segundo en difícil y cada dos en el resto.
      ai.shootCd = m.host.difficulty() >= 3 ? 1 : 2;
      shoot(m, sk, target, r);
    }
  } else {
    // Sin nadie a la vista: paseo tranquilo.
    if (r.think <= 0) {
      r.think = 3 + m.rand() * 5;
      if (m.rand() < 0.5) {
        const a = m.rand() * TAU;
        r.steer = [Math.cos(a), Math.sin(a), MOBS[horse.type].walk * 0.7];
      } else r.steer = [0, 0, 0];
    }
    [mx, mz, speed] = r.steer;
  }
  r.steer = [mx, mz, speed];
  // Sentado sobre el caballo (que ya se movió en este tick).
  sk.x = horse.x;
  sk.z = horse.z;
  sk.y = horse.y + (MOUNTS[horse.type]?.seat ?? 1.38) - SKELETON_HIP;
  sk.vx = sk.vy = sk.vz = 0;
  sk.fallStart = sk.y;
  sk.bodyYaw = horse.bodyYaw;
  if (lookAt) {
    sk.yaw = lerpAngle(sk.yaw, angleTo(sk.x, sk.z, lookAt[0], lookAt[2]), dt * 10);
    sk.pitch = Math.atan2(lookAt[1] - (sk.y + sk.height * 0.85), Math.hypot(lookAt[0] - sk.x, lookAt[2] - sk.z));
  } else {
    sk.yaw = lerpAngle(sk.yaw, sk.bodyYaw, dt * 3);
    sk.pitch *= 1 - Math.min(1, dt * 3);
  }
  m.mobs.updateFlags(sk, ai);
  return true;
}

/** Flecha del jinete: el Poder del arco suma daño (0,5 por nivel + 0,5, como en Minecraft). */
function shoot(m: Entities, sk: Entity, target: PlayerView, r: Horseman): void {
  const sx = sk.x, sy = sk.y + sk.height * 0.8, sz = sk.z;
  const dx = target.x - sx, dz = target.z - sz;
  const horiz = Math.max(1e-3, Math.hypot(dx, dz));
  const speed = 30;
  const t = Math.max(0.05, horiz / speed);
  const spread = [0.12, 0.09, 0.06, 0.03][m.host.difficulty()] ?? 0.06;
  const vy = (target.y + 1.2 - sy) / t + 0.5 * 20 * t;
  const power = enchLevel(r.bow, POWER);
  const dmg = 2 + (power > 0 ? power * 0.5 + 0.5 : 0);
  m.spawnArrow(
    sx + (dx / horiz) * 0.6, sy, sz + (dz / horiz) * 0.6,
    dx / t + (m.rand() - 0.5) * spread * speed, vy + (m.rand() - 0.5) * spread * speed, dz / t + (m.rand() - 0.5) * spread * speed,
    sk.id, dmg,
  );
  m.host.fx('mob_shoot', sx, sy, sz, sk.type);
}

/** Daño que llega al jinete tras su casco de hierro (2 puntos de armadura). */
export function horsemanAbsorb(e: Entity, amount: number): number {
  return RIDERS.has(e) && wearsHelmet(e) ? armorReduce(amount, 2, 0) : amount;
}

/** Al morir un jinete: a veces suelta el casco o el arco (encantados); su caballo queda libre. */
export function horsemanKilled(m: Entities, sk: Entity): void {
  const r = RIDERS.get(sk);
  if (!r) return;
  RIDERS.delete(sk);
  const out: ItemStack[] = [];
  const bonus = 0.01 * m.looting;
  if (m.rand() < GEAR_DROP + bonus) out.push(r.helmet);
  if (m.rand() < GEAR_DROP + bonus) out.push(r.bow);
  if (out.length) m.dropStacks(out, sk.x, sk.y + 0.3, sk.z);
  const horse = m.list.get(r.horse);
  if (horse) horseState(horse).rider = null;
  sk.gear = undefined;
}

// ------------------------------------------------------------------ guardado

/** Lo que se guarda de un caballo no muerto: los segundos de trampa que le quedan (0 si no es trampa). */
export function undeadHorseSave(e: Entity): number {
  return Math.round(HORSES.get(e)?.trap ?? 0);
}

export function undeadHorseRestore(e: Entity, trap: number): void {
  if (!(trap > 0)) return;
  const s = horseState(e);
  s.init = true;
  s.trap = Math.min(TRAP_HORSE_SECONDS, trap);
  e.tamed = false;
}
