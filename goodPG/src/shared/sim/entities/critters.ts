// Fase 7.5 (fauna): criaturas sueltas del mundo normal en el servidor. mobBrain.ts llama a critterTick()
// en cada tick de estas criaturas (y de los esqueletos, por los jinetes); si devuelve true, el movimiento
// de ese tick ya está hecho.
// - Murciélago: revolotea sin rumbo en cuevas oscuras y, si tiene un bloque encima, se cuelga boca abajo;
//   despierta si le pegan, si pierde el techo o si un jugador se le acerca a 4 bloques. No suelta nada.
//   Aparece en grupos bajo el nivel del mar a oscuras (más luz permitida en Halloween).
// - Ocelote: huye de los jugadores salvo que se queden quietos con bacalao o salmón crudos en la mano (si se
//   mueven deprisa se asusta un rato). Darle pescado: 1 de cada 3 veces confía (ya no huye y cría con
//   pescado). Caza gallinas y tortugas crías; los creepers huyen de él y los phantoms no se le acercan.
// - Champiñaca: roja o marrón (un rayo la cambia). Tijeras: se queda en vaca y suelta 5 champiñones;
//   cuenco: estofado de champiñones; cubo: leche. A la marrón se le da una flor pequeña y el próximo cuenco
//   es un estofado sospechoso con el efecto de esa flor.
// - Llama de comerciante: llegan dos atadas al comerciante ambulante; le defienden (escupen a quien le
//   pegue) y se van con él. Si el comerciante muere se quedan: se pueden domar; si no, se van a los 40 min.
// Los caballos no muertos y la trampa del rayo, en skeletonTrap.ts.
import {
  MOBS, MOB_COW, MOB_SKELETON, MOB_CHICKEN, MOB_TURTLE, MOB_LLAMA, MOB_WITCH,
  MOB_BAT, MOB_OCELOT, MOB_MOOSHROOM, MOB_TRADER_LLAMA, MOB_SKELETON_HORSE, MOB_ZOMBIE_HORSE,
  EF_BAT_HANGING, EF_BROWN_MOOSHROOM, EF_HORSEMAN, MOOSHROOM_SHEAR_MUSHROOMS, OCELOT_TRUST_CHANCE, TRADER_LLAMA_SECONDS,
  MOB_CAT, batLightOk, isHalloween,
} from '../../mobs';
import {
  GRASS, MYCELIUM, RED_MUSHROOM, BROWN_MUSHROOM, BLOCK_SOLID, BLOCK_OPAQUE, BLOCK_FLUID, isLeaves,
} from '../../blocks';
import { SHEARS, BOWL, BUCKET, MILK_BUCKET, MUSHROOM_STEW, SUSPICIOUS_STEW, BREED_FOOD, type ItemStack } from '../../items';
import { SUSPICIOUS_FLOWERS } from '../../decorFood';
import { BIOME_JUNGLE, BIOME_MUSHROOM_FIELDS, baseBiome } from '../../world/biomeIds';
import { inHutBox } from '../../world/swampHut';
import { locateStructure } from '../../world/structures';
import type { TerrainGenerator } from '../../world/terrain';
import { SEA_LEVEL, MIN_Y } from '../../constants';
import { moveBody, lineOfSight } from '../physics';
import { standable } from '../pathfind';
import { GRAVITY, TAU, lerpAngle, type PlayerView, type InteractResult, type Entity } from './types';
import { playerSpeed } from './wildlife';
import {
  undeadHorseTick, horsemanTick, horsemanKilled, isHorseman, undeadHorseSave, undeadHorseRestore,
} from './skeletonTrap';
import type { Entities } from './Entities';

/** Felinos: los creepers huyen de ellos y los phantoms no se les acercan; caen de pie. */
export function isFeline(type: number): boolean {
  return type === MOB_CAT || type === MOB_OCELOT;
}

/** ¿Es una llama o una llama de comerciante? (crían entre ellas y escupen igual). */
export function isLlamaLike(type: number): boolean {
  return type === MOB_LLAMA || type === MOB_TRADER_LLAMA;
}

interface CritterState {
  /** Murciélago: colgado del techo y punto hacia el que revolotea. */
  hanging: boolean;
  goal: [number, number, number] | null;
  goalT: number;
  /** Ocelote: confía en los jugadores; segundos que le quedan asustado; presa y espera hasta buscar otra. */
  trusting: boolean;
  scared: number;
  prey: number | null;
  huntCd: number;
  /** Champiñaca: marrón y flor del próximo estofado (índice en SUSPICIOUS_FLOWERS + 1; 0 ninguna). */
  brown: boolean;
  stew: number;
  /** Llama de comerciante: segundos hasta irse (sin comerciante ni dueño) y último golpe al comerciante visto. */
  leaveIn: number;
  hurtSeen: number;
}

const STATES = new WeakMap<Entity, CritterState>();

function st(e: Entity): CritterState {
  let s = STATES.get(e);
  if (!s) {
    s = {
      hanging: false, goal: null, goalT: 0, trusting: false, scared: 0, prey: null, huntCd: 2, brown: false, stew: 0,
      leaveIn: TRADER_LLAMA_SECONDS, hurtSeen: -1,
    };
    STATES.set(e, s);
  }
  return s;
}

/** Estado de una criatura nueva (para las pruebas y los demás sistemas). */
export function critterState(e: Entity): Readonly<CritterState> {
  return st(e);
}

// ------------------------------------------------------------------ tick por criatura

/**
 * Comportamiento propio de las criaturas sueltas (y de los jinetes esqueleto). Devuelve true si ya la
 * movió en este tick; false para seguir con el cerebro común.
 */
export function critterTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): boolean {
  switch (e.type) {
    case MOB_BAT:
      return batTick(m, e, dt, players);
    case MOB_OCELOT:
      return ocelotTick(m, e, dt, players);
    case MOB_TRADER_LLAMA:
      return traderLlamaTick(m, e, dt);
    case MOB_SKELETON_HORSE:
    case MOB_ZOMBIE_HORSE:
      return undeadHorseTick(m, e, dt, players);
    case MOB_SKELETON:
      return horsemanTick(m, e, dt, players);
    default:
      return false;
  }
}

/** Bits de estado para los clientes (ver shared/critters.ts). */
export function critterFlags(e: Entity): number {
  switch (e.type) {
    case MOB_BAT:
      return STATES.get(e)?.hanging ? EF_BAT_HANGING : 0;
    case MOB_MOOSHROOM:
      return STATES.get(e)?.brown ? EF_BROWN_MOOSHROOM : 0;
    case MOB_SKELETON:
      return isHorseman(e) ? EF_HORSEMAN : 0;
    default:
      return 0;
  }
}

/** Camina hacia (mx, mz) a `speed` bloques/s con la física de las criaturas de tierra. */
function walk(m: Entities, e: Entity, mx: number, mz: number, speed: number, jump: boolean, dt: number): void {
  const acc = Math.min(1, dt * (e.onGround ? 10 : e.inWater ? 4 : 2));
  e.vx += (mx * speed - e.vx) * acc;
  e.vz += (mz * speed - e.vz) * acc;
  if (e.inWater) e.vy += (1.8 - e.vy) * Math.min(1, dt * 3);
  else e.vy = Math.max(-60, e.vy - GRAVITY * dt);
  if (e.onGround && (jump || (e.hitWall && speed > 0))) e.vy = 8.6;
  moveBody(e, m.w, dt, 0.6);
  if (e.onGround || e.inWater) e.fallStart = e.y;
  if (Math.hypot(e.vx, e.vz) > 0.3) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 8);
  e.yaw = lerpAngle(e.yaw, e.bodyYaw, dt * 8);
}

// ------------------------------------------------------------------ murciélago

const solidAt = (m: Entities, x: number, y: number, z: number): boolean => {
  const b = m.w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return b > 0 && BLOCK_OPAQUE[b] === 1 && BLOCK_SOLID[b] === 1;
};

function batTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): boolean {
  const s = st(e);
  if (s.hanging) {
    const top = Math.floor(e.y + e.height + 0.05);
    const near = players.some((p) => p.alive && Math.hypot(p.x - e.x, p.y + 0.9 - (e.y + e.height / 2), p.z - e.z) < 4);
    if (!solidAt(m, e.x, top, e.z) || near || e.hurt < 0.2) {
      s.hanging = false;
      s.goal = null;
      e.vy = -1.5;
      m.host.fx('bat_takeoff', e.x, e.y + e.height / 2, e.z);
    } else {
      e.vx = e.vy = e.vz = 0;
      e.y = top - e.height;
      e.fallStart = e.y;
      // Colgado, gira la cabeza de vez en cuando.
      if (m.rand() < dt * 0.1) e.yaw = e.bodyYaw + (m.rand() - 0.5) * 2;
      e.pitch = 0;
      return true;
    }
  }
  // Revoloteo errático: un punto cercano al azar, a menudo cambiado (como en Minecraft).
  s.goalT -= dt;
  const g = s.goal;
  if (!g || s.goalT <= 0 || Math.hypot(g[0] - e.x, g[1] - e.y, g[2] - e.z) < 2 || m.rand() < dt * 0.67) {
    const tx = Math.floor(e.x) + Math.floor(m.rand() * 7) - Math.floor(m.rand() * 7);
    const ty = Math.floor(e.y) + Math.floor(m.rand() * 6) - 2;
    const tz = Math.floor(e.z) + Math.floor(m.rand() * 7) - Math.floor(m.rand() * 7);
    const b = m.w.getBlock(tx, ty, tz);
    if (ty > MIN_Y + 1 && b >= 0 && !BLOCK_SOLID[b] && !BLOCK_FLUID[b]) {
      s.goal = [tx + 0.5, ty + 0.1, tz + 0.5];
      s.goalT = 1 + m.rand() * 2;
    }
  }
  const [gx, gy, gz] = s.goal ?? [e.x, e.y, e.z];
  const k = Math.min(1, dt * 2.5);
  e.vx += (Math.sign(gx - e.x) * 5 - e.vx) * k;
  e.vy += (Math.sign(gy - e.y) * 3.5 - e.vy) * k;
  e.vz += (Math.sign(gz - e.z) * 5 - e.vz) * k;
  if (e.inWater) e.vy = Math.max(e.vy, 2);
  moveBody(e, m.w, dt);
  e.fallStart = e.y;
  if (Math.hypot(e.vx, e.vz) > 0.2) e.bodyYaw = lerpAngle(e.bodyYaw, Math.atan2(-e.vx, -e.vz), dt * 10);
  e.yaw = e.bodyYaw;
  e.pitch = 0;
  // A veces se cuelga, si tiene un bloque justo encima.
  const top = Math.floor(e.y) + 1;
  if (m.rand() < dt * 0.2 && solidAt(m, e.x, top, e.z) && !e.inWater) {
    s.hanging = true;
    e.y = top - e.height;
    e.vx = e.vy = e.vz = 0;
  }
  return true;
}

/** ¿Está colgado este murciélago? */
export function batHanging(e: Entity): boolean {
  return STATES.get(e)?.hanging ?? false;
}

/** Cuelga un murciélago del techo que tenga encima (para las pruebas y la aparición). */
export function hangBat(m: Entities, e: Entity): boolean {
  const top = Math.floor(e.y) + 1;
  if (!solidAt(m, e.x, top, e.z)) return false;
  const s = st(e);
  s.hanging = true;
  e.y = top - e.height;
  return true;
}

// ------------------------------------------------------------------ ocelote

/** Velocidad del jugador (bloques/s) a partir de la cual asusta al ocelote que le sigue (como en Minecraft). */
const OCELOT_SCARE_SPEED = 2;

function ocelotTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): boolean {
  const s = st(e);
  const ai = e.ai!;
  if (s.scared > 0) s.scared -= dt;
  // Caza: gallinas y tortugas crías a menos de 10 bloques (con o sin confianza).
  if (huntTick(m, e, s, dt)) return true;
  if (s.trusting) return false;
  const fish = BREED_FOOD.ocelot;
  let tempted = false;
  let flee: PlayerView | null = null;
  let best = 16;
  for (const p of players) {
    if (!p.alive || p.creative) continue;
    const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    if (d > 16) continue;
    const holding = p.held !== undefined && fish.includes(p.held);
    if (holding && d < 10) {
      // Moverse deprisa cerca asusta al ocelote un rato (5 s) en vez de atraerlo.
      if (d < 6 && playerSpeed(m, p.id) > OCELOT_SCARE_SPEED) s.scared = 5;
      if (s.scared <= 0) {
        tempted = true;
        continue;
      }
    }
    if (d < best && (d < 6 || lineOfSight(m.w, e.x, e.y + e.height * 0.8, e.z, p.x, p.y + 1.5, p.z))) {
      best = d;
      flee = p;
    }
  }
  if (!tempted && flee) {
    ai.panic = Math.max(ai.panic, 0.6);
    ai.panicFrom = [flee.x, flee.z];
  } else if (tempted && ai.panic > 0 && !(e.age - (e.lastHurtAt ?? -99) < 5)) ai.panic = 0;
  return false;
}

function huntTick(m: Entities, e: Entity, s: CritterState, dt: number): boolean {
  const ai = e.ai!;
  if (ai.panic > 0 || (e.growAge ?? 0) > 0 || (e.love ?? 0) > 0) {
    s.prey = null;
    return false;
  }
  let prey = s.prey !== null ? m.list.get(s.prey) : undefined;
  if (prey && (prey.dead || Math.hypot(prey.x - e.x, prey.z - e.z) > 16)) prey = undefined;
  if (!prey) {
    s.prey = null;
    s.huntCd -= dt;
    if (s.huntCd > 0) return false;
    s.huntCd = 2 + m.rand() * 4;
    let bd = 10;
    for (const o of m.list.values()) {
      if (!o.ai || o.dead) continue;
      const ok = o.type === MOB_CHICKEN || (o.type === MOB_TURTLE && (o.growAge ?? 0) > 0 && !o.inWater);
      if (!ok) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y, o.z - e.z);
      if (d < bd) {
        bd = d;
        prey = o;
      }
    }
    if (!prey) return false;
    s.prey = prey.id;
  }
  const dx = prey.x - e.x, dz = prey.z - e.z;
  const dist = Math.hypot(dx, dz);
  let mx: number, mz: number, jump = false;
  if (dist < 2.5) {
    mx = dx / (dist || 1);
    mz = dz / (dist || 1);
  } else {
    const view: PlayerView = { id: '', name: '', x: prey.x, y: prey.y, z: prey.z, alive: true, creative: false, lookingAt: -1 };
    [mx, mz, jump] = m.mobs.followPath(e, view, dt);
  }
  walk(m, e, mx, mz, MOBS[MOB_OCELOT].run, jump, dt);
  if (dist < e.width / 2 + prey.width / 2 + 0.6 && Math.abs(prey.y - e.y) < 1.2 && ai.attackCd <= 0) {
    ai.attackCd = 1;
    m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
    m.damage(prey, MOBS[MOB_OCELOT].damage, e.x, e.z, e.id);
  }
  ai.attackCd -= dt;
  return true;
}

/** ¿Confía este ocelote en los jugadores? */
export function ocelotTrusts(e: Entity): boolean {
  return STATES.get(e)?.trusting ?? false;
}

// ------------------------------------------------------------------ llama de comerciante

/** Comerciante al que está atada (id de entidad) o null. */
function traderOf(e: Entity): number | null {
  return typeof e.leash === 'string' && e.leash.startsWith('@') ? Number(e.leash.slice(1)) : null;
}

function traderLlamaTick(m: Entities, e: Entity, dt: number): boolean {
  const s = st(e);
  const tid = traderOf(e);
  if (tid !== null) {
    const t = m.list.get(tid);
    if (!t) {
      // El comerciante se fue: la llama se va con él.
      m.host.fx('teleport', e.x, e.y + 1, e.z, e.type);
      m.remove(e.id);
      return true;
    }
    if (t.villager) s.leaveIn = t.villager.life;
    // Le defiende: escupe a quien le acaba de pegar.
    if (t.lastHurtBy && t.lastHurtAt !== undefined && t.lastHurtAt !== s.hurtSeen && t.age - t.lastHurtAt < 1) {
      s.hurtSeen = t.lastHurtAt;
      const ai = e.ai!;
      ai.panic = 0;
      ai.angry = 20;
      ai.target = t.lastHurtBy;
    }
    return false;
  }
  // Suelta y sin dueño ni correa: al rato se va.
  if (!e.tamed && !e.leash && !e.rider && !e.customName) {
    s.leaveIn -= dt;
    if (s.leaveIn <= 0) {
      m.host.fx('teleport', e.x, e.y + 1, e.z, e.type);
      m.remove(e.id);
      return true;
    }
  }
  return false;
}

/** Dos llamas de comerciante atadas al comerciante `trader`, a pocos bloques de él. */
export function spawnTraderLlamas(m: Entities, trader: Entity): Entity[] {
  const out: Entity[] = [];
  for (let i = 0; i < 2; i++) {
    let spot: [number, number, number] = [trader.x, trader.y, trader.z];
    for (let k = 0; k < 12; k++) {
      const x = Math.floor(trader.x + (m.rand() * 2 - 1) * 4), z = Math.floor(trader.z + (m.rand() * 2 - 1) * 4);
      let found = false;
      for (let y = Math.floor(trader.y) + 3; y >= Math.floor(trader.y) - 3; y--) {
        if (standable(m.w, x, y, z, 2)) {
          spot = [x + 0.5, y, z + 0.5];
          found = true;
          break;
        }
      }
      if (found) break;
    }
    const e = m.spawnMob(MOB_TRADER_LLAMA, spot[0], spot[1], spot[2]);
    if (!e) continue;
    e.leash = `@${trader.id}`;
    out.push(e);
  }
  return out;
}

// ------------------------------------------------------------------ champiñaca

/** ¿Es marrón esta champiñaca? */
export function mooshroomBrown(e: Entity): boolean {
  return STATES.get(e)?.brown ?? false;
}

export function setMooshroomBrown(e: Entity, brown: boolean): void {
  st(e).brown = brown;
}

/** Tijeras: la champiñaca se queda en vaca (con su vida, nombre y correa) y suelta 5 champiñones. */
function shearMooshroom(m: Entities, e: Entity): Entity | null {
  const s = st(e);
  const cow = m.spawnMob(MOB_COW, e.x, e.y, e.z);
  if (cow) {
    cow.yaw = e.yaw;
    cow.bodyYaw = e.bodyYaw;
    cow.health = Math.min(cow.maxHealth, e.health);
    cow.customName = e.customName;
    cow.leash = e.leash;
    cow.fire = e.fire;
  }
  const mush = s.brown ? BROWN_MUSHROOM : RED_MUSHROOM;
  for (let i = 0; i < MOOSHROOM_SHEAR_MUSHROOMS; i++) {
    m.spawnItem({ id: mush, count: 1 }, e.x, e.y + e.height, e.z, (m.rand() - 0.5) * 2, 3, (m.rand() - 0.5) * 2);
  }
  m.host.fx('mooshroom_shear', e.x, e.y + e.height * 0.6, e.z);
  e.leash = undefined;
  m.remove(e.id);
  return cow;
}

/** Índice + 1 de la flor en SUSPICIOUS_FLOWERS (0 si no es una flor del estofado). */
function stewFlower(item: number): number {
  return SUSPICIOUS_FLOWERS.findIndex(([f]) => f === item) + 1;
}

/** Un rayo toca a una criatura: la champiñaca cambia de color (y no se hace daño). true si lo resolvió. */
export function critterStruck(m: Entities, e: Entity): boolean {
  if (e.type !== MOB_MOOSHROOM || e.dead) return false;
  const s = st(e);
  s.brown = !s.brown;
  m.host.fx('mooshroom_convert', e.x, e.y + e.height * 0.6, e.z);
  return true;
}

// ------------------------------------------------------------------ usar objetos

/** Clic derecho con un objeto sobre una criatura nueva (null: que decida la regla común). */
export function critterInteract(m: Entities, e: Entity, item: number, creative: boolean): InteractResult | null {
  const baby = (e.growAge ?? 0) > 0;
  if (e.type === MOB_OCELOT) {
    const s = st(e);
    if (s.trusting || !BREED_FOOD.ocelot.includes(item)) return null;
    // Desconfiado: 1 de cada 3 pescados se gana su confianza.
    if (m.rand() < OCELOT_TRUST_CHANCE) {
      s.trusting = true;
      e.ai!.panic = 0;
      m.host.fx('tame', e.x, e.y + e.height, e.z, e.type);
    } else m.host.fx('tame_fail', e.x, e.y + e.height, e.z, e.type);
    return { ok: true, take: creative ? 0 : 1 };
  }
  if (e.type === MOB_MOOSHROOM && !baby) {
    const s = st(e);
    if (item === SHEARS) {
      shearMooshroom(m, e);
      return { ok: true, wear: creative ? 0 : 1 };
    }
    if (item === BOWL) {
      const give: ItemStack = s.stew ? { id: SUSPICIOUS_STEW, count: 1, dmg: s.stew } : { id: MUSHROOM_STEW, count: 1 };
      s.stew = 0;
      m.host.fx('milk', e.x, e.y + e.height * 0.5, e.z);
      return { ok: true, take: 1, give };
    }
    if (item === BUCKET) {
      m.host.fx('milk', e.x, e.y + e.height * 0.5, e.z);
      return { ok: true, take: 1, give: { id: MILK_BUCKET, count: 1 } };
    }
    const flower = stewFlower(item);
    if (flower && s.brown) {
      // Ya tiene una flor: humo y nada más.
      if (s.stew) {
        m.host.fx('tame_fail', e.x, e.y + e.height, e.z, e.type);
        return { ok: true };
      }
      s.stew = flower;
      m.host.fx('stew_flower', e.x, e.y + e.height, e.z);
      return { ok: true, take: creative ? 0 : 1 };
    }
  }
  return null;
}

// ------------------------------------------------------------------ crías y muertes

/** Una cría recién nacida de a y b: el color de la champiñaca y el pelaje de la llama de comerciante. */
export function critterBorn(m: Entities, baby: Entity, a: Entity, b: Entity): void {
  if (baby.type === MOB_MOOSHROOM) {
    const ca = mooshroomBrown(a), cb = mooshroomBrown(b);
    // Como en Minecraft: si los padres son iguales, 1 de cada 1024 sale del otro color.
    st(baby).brown = ca === cb && m.rand() < 1 / 1024 ? !ca : m.rand() < 0.5 ? ca : cb;
  } else if (baby.type === MOB_TRADER_LLAMA || (baby.type === MOB_LLAMA && isLlamaLike(a.type) && isLlamaLike(b.type))) {
    baby.variant = (m.rand() < 0.5 ? a : b).variant ?? 0;
  }
}

/** Al morir con botín: el jinete esqueleto suelta a veces su equipo y deja libre al caballo. */
export function critterKilled(m: Entities, e: Entity): void {
  if (e.type === MOB_SKELETON) horsemanKilled(m, e);
}

// ------------------------------------------------------------------ guardado

/** Lo que se guarda de las criaturas nuevas ({ crit: [...] } al final de la fila), o null. */
export function critterSave(e: Entity): { crit: number[] } | null {
  const s = STATES.get(e);
  switch (e.type) {
    case MOB_OCELOT:
      return s?.trusting ? { crit: [1] } : null;
    case MOB_MOOSHROOM:
      return s && (s.brown || s.stew) ? { crit: [s.brown ? 1 : 0, s.stew] } : null;
    case MOB_TRADER_LLAMA:
      return { crit: [Math.round(s?.leaveIn ?? TRADER_LLAMA_SECONDS)] };
    case MOB_SKELETON_HORSE:
    case MOB_ZOMBIE_HORSE: {
      const trap = undeadHorseSave(e);
      return trap > 0 ? { crit: [trap] } : null;
    }
    default:
      return null;
  }
}

export function critterRestore(e: Entity, row: unknown[]): void {
  const c = row.find((v) => !!v && typeof v === 'object' && !Array.isArray(v) && 'crit' in (v as object)) as { crit?: unknown } | undefined;
  if (!c || !Array.isArray(c.crit)) return;
  const [a, b] = c.crit.map(Number);
  switch (e.type) {
    case MOB_OCELOT:
      st(e).trusting = a === 1;
      break;
    case MOB_MOOSHROOM:
      st(e).brown = a === 1;
      if (Number.isInteger(b) && b > 0 && b <= SUSPICIOUS_FLOWERS.length) st(e).stew = b;
      break;
    case MOB_TRADER_LLAMA:
      if (Number.isFinite(a) && a > 0) st(e).leaveIn = Math.min(TRADER_LLAMA_SECONDS, a);
      break;
    case MOB_SKELETON_HORSE:
    case MOB_ZOMBIE_HORSE:
      if (Number.isFinite(a)) undeadHorseRestore(e, a);
      break;
  }
}

// ------------------------------------------------------------------ aparición

/** Criatura nueva para un bioma (0: ninguna; entonces decide el spawner de siempre). */
export function critterPassiveFor(biome: number, rand: () => number): number {
  if (biome === BIOME_MUSHROOM_FIELDS) return MOB_MOOSHROOM;
  if (baseBiome(biome) === BIOME_JUNGLE) return rand() < 0.12 ? MOB_OCELOT : 0;
  return 0;
}

/** Tamaño de grupo de las criaturas nuevas. */
export const CRITTER_GROUPS: Readonly<Record<number, [number, number]>> = {
  [MOB_OCELOT]: [1, 3],
  [MOB_MOOSHROOM]: [4, 8],
};

/** ¿Puede aparecer esta criatura nueva sobre ese bloque? (undefined: no es de las nuevas). */
export function critterFloor(type: number, floor: number): boolean | undefined {
  switch (type) {
    case MOB_OCELOT:
      return floor === GRASS || isLeaves(floor);
    case MOB_MOOSHROOM:
      return floor === MYCELIUM;
    default:
      return undefined;
  }
}

/** Los campos de champiñones no tienen monstruos (como en Minecraft). */
export function biomeWithoutMonsters(biome: number): boolean {
  return biome === BIOME_MUSHROOM_FIELDS;
}

/** ¿Está (x, y, z) dentro de alguna cabaña de bruja? */
export function inSwampHut(gen: TerrainGenerator, x: number, y: number, z: number): boolean {
  const o = locateStructure(gen, 'swamp_hut', Math.floor(x), Math.floor(z), 1);
  if (!o || Math.abs(o[0] - x) > 8 || Math.abs(o[2] - z) > 8) return false;
  return inHutBox(gen.seed, o[0], o[1], o[2], x, y, z);
}

/** Dentro de una cabaña de bruja sólo aparecen brujas (el monstruo elegido cambia por la bruja). */
export function structureMonster(m: Entities, type: number, x: number, y: number, z: number): number {
  return inSwampHut(m.w.gen, x, y, z) ? MOB_WITCH : type;
}

/** Murciélagos como mucho cerca de cada jugador (el límite de las criaturas del ambiente). */
const BAT_CAP = 12;

interface WorldClock {
  batT: number;
}
const CLOCKS = new WeakMap<Entities, WorldClock>();

/** Fecha que miran los murciélagos (Halloween); se puede cambiar en las pruebas. */
export const critterCalendar = { now: (): Date => new Date() };

/** Reloj de las criaturas nuevas (lo llama el spawner en cada tick): murciélagos en las cuevas. */
export function critterWorldTick(m: Entities, dt: number, players: PlayerView[]): void {
  let c = CLOCKS.get(m);
  if (!c) CLOCKS.set(m, (c = { batT: 3 }));
  c.batT -= dt;
  if (c.batT > 0) return;
  c.batT = 2 + m.rand() * 2;
  const halloween = isHalloween(critterCalendar.now());
  for (const p of players) if (p.alive) spawnBats(m, p, halloween);
}

/** Un grupo de murciélagos en una cueva oscura cerca del jugador `p`; devuelve cuántos salieron. */
export function spawnBats(m: Entities, p: PlayerView, halloween: boolean): number {
  let n = 0;
  for (const e of m.list.values()) if (e.type === MOB_BAT && !e.dead && Math.hypot(e.x - p.x, e.z - p.z) < 64) n++;
  if (n >= BAT_CAP) return 0;
  const w = m.w;
  const a = m.rand() * TAU, r = 16 + m.rand() * 32;
  const x = Math.floor(p.x + Math.cos(a) * r), z = Math.floor(p.z + Math.sin(a) * r);
  const top = w.skyTop(x, z);
  if (top < MIN_Y) return 0;
  let y = Math.min(SEA_LEVEL - 1, Math.floor(p.y + (m.rand() - 0.5) * 32));
  for (let k = 0; k < 12; k++, y--) {
    if (y <= MIN_Y + 1) return 0;
    const floor = w.getBlock(x, y - 1, z);
    if (floor <= 0 || !BLOCK_OPAQUE[floor] || !standable(w, x, y, z, 1)) continue;
    const feet = w.getBlock(x, y, z);
    // Bajo techo, sin agua y a oscuras.
    if ((feet > 0 && BLOCK_FLUID[feet]) || y >= top) return 0;
    if (!batLightOk(w.blockLightAt(x, y, z), m.rand(), halloween)) return 0;
    let spawned = 0;
    const group = 1 + Math.floor(m.rand() * 4);
    for (let i = 0; i < group && n + spawned < BAT_CAP; i++) {
      const ox = x + Math.floor((m.rand() - 0.5) * 3), oz = z + Math.floor((m.rand() - 0.5) * 3);
      const b = w.getBlock(ox, y, oz), b2 = w.getBlock(ox, y + 1, oz);
      if (b < 0 || BLOCK_SOLID[b] || BLOCK_FLUID[b] || b2 < 0 || BLOCK_SOLID[b2]) continue;
      if (m.spawnMob(MOB_BAT, ox + 0.5, y + 0.2, oz + 0.5)) spawned++;
    }
    return spawned;
  }
  return 0;
}

// ------------------------------------------------------------------ felinos

/** Un gato u ocelote a menos de `r` bloques de (x, y, z), o null. */
export function felineNear(m: Entities, x: number, y: number, z: number, r: number): Entity | null {
  for (const o of m.list.values()) {
    if (!isFeline(o.type) || o.dead) continue;
    if (Math.abs(o.x - x) > r || Math.abs(o.z - z) > r) continue;
    if (Math.hypot(o.x - x, o.y - y, o.z - z) <= r) return o;
  }
  return null;
}
