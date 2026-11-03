// Fauna de la fase 6 en el servidor: abejas (bees.ts), loros que vuelan y se posan, pandas que se
// sientan a comer, se tumban y ruedan, y armadillos que se enroscan al asustarse y sueltan escamas
// (también con un cepillo). mobBrain.ts llama a faunaMobTick() en cada tick de estas criaturas; si
// devuelve true, el movimiento de ese tick ya está hecho.
import { MOBS, MOB_BEE, MOB_PANDA, MOB_PARROT, MOB_ARMADILLO } from '../../mobs';
import { GRASS, DIRT, SAND, RED_SAND, TERRACOTTA, COLORED_TERRACOTTA, isLeaves, BLOCK_SOLID } from '../../blocks';
import { ARMADILLO_SCUTE, BRUSH, BREED_FOOD } from '../../items';
import { BIOME_JUNGLE, BIOME_SAVANNA, BIOME_BADLANDS, baseBiome } from '../../world/biomeIds';
import { EF_FAUNA_A, EF_FAUNA_B } from '../../fauna';
import { moveBody } from '../physics';
import { GRAVITY, lerpAngle, type PlayerView, type InteractResult, type Entity } from './types';
import { flyToward, fallAndRest, randomAirPoint, groundBelow } from './flight';
import { beeTick, beeHasNectar, beeWorldTick } from './bees';
import type { Entities } from './Entities';

/** Estados de los pandas. */
const P_NORMAL = 0, P_SIT = 1, P_LIE = 2, P_ROLL = 3;

interface WildState {
  /** Panda: P_*; armadillo: 1 enroscado; loro: 1 posado. */
  mode: number;
  /** Segundos que le quedan al estado actual. */
  t: number;
  /** Espera hasta el próximo estado espontáneo. */
  cd: number;
  /** Armadillo: segundos hasta soltar la próxima escama. */
  scute: number;
  /** Loro: destino de vuelo y punto alrededor del que vive. */
  goal: [number, number, number] | null;
  anchor: [number, number, number] | null;
}

const STATES = new WeakMap<Entity, WildState>();

function st(m: Entities, e: Entity): WildState {
  let s = STATES.get(e);
  if (!s) {
    s = { mode: 0, t: 0, cd: 5 + m.rand() * 20, scute: 300 + m.rand() * 300, goal: null, anchor: null };
    STATES.set(e, s);
  }
  return s;
}

/** Velocidad horizontal de cada jugador (para saber quién corre cerca de un armadillo). */
interface PlayerTrack {
  x: number;
  z: number;
  speed: number;
}
const TRACKS = new WeakMap<Entities, Map<string, PlayerTrack>>();

function tracks(m: Entities): Map<string, PlayerTrack> {
  let t = TRACKS.get(m);
  if (!t) {
    t = new Map();
    TRACKS.set(m, t);
  }
  return t;
}

/** Fase 7.5 (fauna): velocidad horizontal suavizada de un jugador (bloques/s); el ocelote se asusta si corre. */
export function playerSpeed(m: Entities, id: string): number {
  return tracks(m).get(id)?.speed ?? 0;
}

/** Reloj de la fauna (lo llama el spawner en cada tick): abejas y velocidad de los jugadores. */
export function faunaWorldTick(m: Entities, dt: number, players: PlayerView[]): void {
  const t = tracks(m);
  for (const p of players) {
    const prev = t.get(p.id);
    if (!prev) t.set(p.id, { x: p.x, z: p.z, speed: 0 });
    else {
      const v = dt > 0 ? Math.hypot(p.x - prev.x, p.z - prev.z) / dt : 0;
      // Suavizado: los paquetes de posición no llegan en cada tick.
      prev.speed += (Math.min(v, 30) - prev.speed) * Math.min(1, dt * 4);
      prev.x = p.x;
      prev.z = p.z;
    }
  }
  if (t.size > players.length * 2 + 8) for (const id of t.keys()) if (!players.some((p) => p.id === id)) t.delete(id);
  beeWorldTick(m, dt, players);
}

// ------------------------------------------------------------------ tick por criatura

/**
 * Comportamiento propio de la fauna nueva. Devuelve true si ya movió a la criatura en este tick
 * (vuelo, panda sentado o rodando, armadillo enroscado); false para seguir con el cerebro común.
 */
export function faunaMobTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): boolean {
  switch (e.type) {
    case MOB_BEE:
      beeTick(m, e, dt, players);
      return true;
    case MOB_PARROT:
      parrotTick(m, e, dt, players);
      return true;
    case MOB_PANDA:
      return pandaTick(m, e, dt, players);
    case MOB_ARMADILLO:
      return armadilloTick(m, e, dt, players);
    default:
      return false;
  }
}

/** Bits de estado de la fauna para los clientes (ver shared/fauna.ts). */
export function faunaFlags(e: Entity): number {
  switch (e.type) {
    case MOB_BEE:
      return beeHasNectar(e) ? EF_FAUNA_A : 0;
    case MOB_PARROT:
    case MOB_ARMADILLO:
      return STATES.get(e)?.mode === 1 ? EF_FAUNA_A : 0;
    case MOB_PANDA: {
      const mode = STATES.get(e)?.mode ?? 0;
      return (mode === P_SIT || mode === P_ROLL ? EF_FAUNA_A : 0) | (mode === P_LIE || mode === P_ROLL ? EF_FAUNA_B : 0);
    }
    default:
      return 0;
  }
}

/** Física de suelo sin intención de moverse (sentado, tumbado, enroscado). */
function restOnGround(m: Entities, e: Entity, dt: number, vx = 0, vz = 0): void {
  const acc = Math.min(1, dt * (e.onGround ? 10 : 2));
  e.vx += (vx - e.vx) * acc;
  e.vz += (vz - e.vz) * acc;
  if (e.inWater) e.vy += (1.8 - e.vy) * Math.min(1, dt * 3);
  else e.vy = Math.max(-60, e.vy - GRAVITY * dt);
  moveBody(e, m.w, dt, 0.6);
  if (e.onGround || e.inWater) e.fallStart = e.y;
}

/** ¿Hay un precipicio (3 bloques o más) justo delante? */
function cliffAhead(m: Entities, e: Entity, fx: number, fz: number): boolean {
  const ax = Math.floor(e.x + fx * (e.width / 2 + 0.6)), az = Math.floor(e.z + fz * (e.width / 2 + 0.6)), y = Math.floor(e.y);
  for (let k = 1; k <= 3; k++) {
    const b = m.w.getBlock(ax, y - k, az);
    if (b < 0 || BLOCK_SOLID[b]) return false;
  }
  return true;
}

/** ¿Algún jugador cerca con la comida del animal en la mano? */
function lured(e: Entity, players: PlayerView[]): boolean {
  const food = BREED_FOOD[MOBS[e.type].key];
  if (!food) return false;
  return players.some((p) => p.alive && p.held !== undefined && food.includes(p.held) && Math.hypot(p.x - e.x, p.z - e.z) < 10);
}

// ------------------------------------------------------------------ panda

function pandaTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): boolean {
  const s = st(m, e);
  const ai = e.ai!;
  // Asustado, enfadado, enamorado o siguiendo la comida: se levanta y sigue el cerebro común.
  if (ai.panic > 0 || ai.angry > 0 || ai.target || (e.love ?? 0) > 0 || lured(e, players)) {
    s.mode = P_NORMAL;
    return false;
  }
  if (s.mode === P_NORMAL) {
    s.cd -= dt;
    if (s.cd > 0 || !e.onGround || e.inWater) return false;
    const r = m.rand();
    if (r < 0.45) {
      s.mode = P_SIT;
      s.t = 6 + m.rand() * 8;
    } else if (r < 0.8) {
      s.mode = P_LIE;
      s.t = 8 + m.rand() * 10;
    } else {
      s.mode = P_ROLL;
      s.t = 1.2 + m.rand() * 1.2;
    }
    s.cd = 15 + m.rand() * 30;
  }
  s.t -= dt;
  if (s.t <= 0 || e.inWater) {
    s.mode = P_NORMAL;
    return false;
  }
  if (s.mode === P_ROLL) {
    // Rueda hacia delante: si choca con algo o llega a un precipicio, se acaba la voltereta.
    const sp = MOBS[MOB_PANDA].walk * 2;
    const fx = -Math.sin(e.bodyYaw), fz = -Math.cos(e.bodyYaw);
    if (cliffAhead(m, e, fx, fz)) {
      s.t = 0;
      restOnGround(m, e, dt);
    } else {
      restOnGround(m, e, dt, fx * sp, fz * sp);
      if (e.hitWall) s.t = 0;
    }
  } else {
    restOnGround(m, e, dt);
    if (s.mode === P_SIT && m.rand() < dt * 0.7) m.host.fx('panda_eat', e.x, e.y + 1, e.z);
  }
  e.yaw = lerpAngle(e.yaw, e.bodyYaw, dt * 3);
  e.pitch *= 1 - Math.min(1, dt * 3);
  return true;
}

// ------------------------------------------------------------------ armadillo

function armadilloTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): boolean {
  const s = st(m, e);
  const ai = e.ai!;
  // Escamas que se le caen solas (adultos, cada 5–10 minutos).
  if (!((e.growAge ?? 0) > 0)) {
    s.scute -= dt;
    if (s.scute <= 0) {
      s.scute = 300 + m.rand() * 300;
      m.spawnItem({ id: ARMADILLO_SCUTE, count: 1 }, e.x, e.y + 0.3, e.z, 0, 1.5, 0, undefined, 0.5);
      m.host.fx('scute', e.x, e.y + 0.3, e.z);
    }
  }
  // Amenazas: que le peguen, un jugador corriendo cerca o un monstruo a pocos bloques.
  const t = tracks(m);
  let threat = ai.panic > 0;
  if (!threat) {
    for (const p of players) {
      if (!p.alive || p.creative) continue;
      const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
      if (d < 7 && (t.get(p.id)?.speed ?? 0) > 5) threat = true;
    }
  }
  if (!threat) {
    for (const o of m.list.values()) {
      if (!o.ai || o.dead || !MOBS[o.type]?.hostile || MOBS[o.type].neutral) continue;
      if (Math.abs(o.x - e.x) < 5 && Math.abs(o.z - e.z) < 5 && Math.abs(o.y - e.y) < 3) {
        threat = true;
        break;
      }
    }
  }
  if (threat) {
    if (s.mode !== 1) m.host.fx('armadillo_roll', e.x, e.y + 0.3, e.z, 1);
    s.mode = 1;
    s.t = Math.max(s.t, 3 + m.rand() * 2);
    // Enroscado no huye: se queda quieto dentro de su caparazón.
    ai.panic = 0;
    ai.goal = null;
    ai.path = null;
  }
  if (s.mode !== 1) return false;
  s.t -= dt;
  if (s.t <= 0) {
    s.mode = 0;
    m.host.fx('armadillo_roll', e.x, e.y + 0.3, e.z, 0);
    return false;
  }
  restOnGround(m, e, dt);
  e.yaw = e.bodyYaw;
  e.pitch = 0;
  return true;
}

// ------------------------------------------------------------------ loro

function parrotTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): void {
  const s = st(m, e);
  const ai = e.ai!;
  const def = MOBS[MOB_PARROT];
  const w = m.w;
  if (ai.panic > 0) ai.panic -= dt;
  if (!s.anchor) s.anchor = [e.x, e.y, e.z];
  // Asustado: echa a volar lejos y hacia arriba.
  if (ai.panic > 0) {
    s.mode = 0;
    const dx = e.x - ai.panicFrom[0], dz = e.z - ai.panicFrom[1];
    const d = Math.hypot(dx, dz) || 1;
    flyToward(w, e, e.x + (dx / d) * 6, groundBelow(w, e.x, e.y + 4, e.z) + 6, e.z + (dz / d) * 6, def.run, dt);
    s.goal = null;
    return;
  }
  if (s.mode === 1) {
    // Posado: quieto hasta que se cansa o se le acerca alguien.
    s.t -= dt;
    fallAndRest(w, e, dt, 3);
    e.pitch = 0;
    const near = players.some((p) => p.alive && !p.creative && Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) < 2.5);
    if (s.t <= 0 || near || e.inWater) {
      s.mode = 0;
      s.goal = null;
      e.vy = 4;
    }
    return;
  }
  // Volando entre árboles alrededor de su zona.
  if (!s.goal) {
    const [ax, ay, az] = s.anchor;
    s.goal = randomAirPoint(w, m.rand, ax, Math.max(ay, e.y), az, 2, 14, 1.5, 6);
    s.t = 6 + m.rand() * 6;
  }
  s.t -= dt;
  const d = flyToward(w, e, s.goal[0], s.goal[1], s.goal[2], def.walk, dt);
  if (d < 0.8 || s.t <= 0) {
    s.goal = null;
    if (m.rand() < 0.45) {
      // Bajar a posarse (en una rama o en el suelo).
      s.mode = 1;
      s.t = 6 + m.rand() * 12;
    }
  }
  // Si se aleja mucho de su zona, la zona se mueve con él (poco a poco).
  const [ax, , az] = s.anchor;
  if (Math.hypot(e.x - ax, e.z - az) > 32) s.anchor = [e.x, e.y, e.z];
}

// ------------------------------------------------------------------ usar objetos

/** Cepillar un armadillo: una escama y 16 de desgaste del cepillo. */
export function faunaInteract(m: Entities, e: Entity, item: number, creative: boolean): InteractResult | null {
  if (e.type === MOB_ARMADILLO && item === BRUSH && !((e.growAge ?? 0) > 0)) {
    m.spawnItem({ id: ARMADILLO_SCUTE, count: 1 }, e.x, e.y + e.height, e.z, (m.rand() - 0.5) * 2, 3, (m.rand() - 0.5) * 2);
    m.host.fx('brush', e.x, e.y + e.height * 0.7, e.z);
    return { ok: true, wear: creative ? 0 : 16 };
  }
  return null;
}

// ------------------------------------------------------------------ aparición

/** Animal de la fauna nueva para un bioma (0: ninguno; entonces decide el spawner de siempre). */
export function faunaPassiveFor(biome: number, rand: () => number): number {
  const r = rand();
  biome = baseBiome(biome); // Fase 7.6
  if (biome === BIOME_JUNGLE) return r < 0.35 ? MOB_PARROT : r < 0.6 ? MOB_PANDA : 0;
  if (biome === BIOME_SAVANNA) return r < 0.3 ? MOB_ARMADILLO : 0;
  if (biome === BIOME_BADLANDS) return r < 0.7 ? MOB_ARMADILLO : 0;
  return 0;
}

/** Tamaño de grupo de la fauna nueva. */
export const FAUNA_GROUPS: Readonly<Record<number, [number, number]>> = {
  [MOB_PANDA]: [1, 2],
  [MOB_PARROT]: [1, 3],
  [MOB_ARMADILLO]: [1, 2],
};

const ARMADILLO_FLOORS = new Set<number>([GRASS, SAND, RED_SAND, TERRACOTTA, DIRT, ...Object.values(COLORED_TERRACOTTA)]);

/** ¿Puede aparecer este animal de la fauna nueva sobre ese bloque? (undefined: no es de la fauna nueva). */
export function faunaFloor(type: number, floor: number): boolean | undefined {
  if (floor <= 0) return type in FAUNA_GROUPS ? false : undefined;
  switch (type) {
    case MOB_PARROT:
      return floor === GRASS || isLeaves(floor);
    case MOB_PANDA:
      return floor === GRASS;
    case MOB_ARMADILLO:
      return ARMADILLO_FLOORS.has(floor) && BLOCK_SOLID[floor] === 1;
    default:
      return undefined;
  }
}
