// Abejas (fase 6): vuelan entre su nido y las flores, polinizan (se cargan de néctar) y vuelven a
// casa, donde el néctar llena el nido de miel (hasta 5). De noche y con lluvia se quedan dentro.
// Si se rompe su nido o se cosecha sin una fogata debajo, se enfadan con el jugador: pican (daño y
// veneno, que pone el cliente) y la abeja que pica muere al poco rato.
//
// Las abejas que están dentro de un nido no son entidades: se cuentan en `hives` y salen de una en
// una. Los nidos generados con el terreno se pueblan (tres abejas) la primera vez que se ven cerca de
// un jugador.
import { MOBS, MOB_BEE } from '../../mobs';
import {
  BEE_NEST, HONEY_MAX, isBeeHome, honeyLevel, withHoney, beeHomeFacing, familyBase, stateProps, FLOWERS, POPPY, DANDELION,
  CORNFLOWER, PINK_PETALS, FLOWERING_AZALEA, isCampfire, BLOCK_SOLID,
} from '../../blocks';
import { SHEARS, GLASS_BOTTLE, HONEYCOMB } from '../../items';
import { DIR_X, DIR_Z } from '../../blockModels';
import { BEE_STING_CAUSE } from '../../fauna';
import { MIN_Y } from '../../constants';
import { flyToward, hover, randomAirPoint } from './flight';
import type { PlayerView, Entity } from './types';
import type { Entities } from './Entities';

type Pos = [number, number, number];

/** Abejas por nido. */
export const BEES_PER_NEST = 3;
/** Segundos que pasa dentro una abeja (con néctar: lo que tarda en hacer la miel). */
const STAY_EMPTY = 30;
const STAY_NECTAR = 60;
/** Segundos posada en una flor para cargarse de néctar. */
const SIP_SECONDS = 3;
/** Tras picar, muere entre 20 y 40 s después. */
const STING_DEATH = [20, 40];

export interface BeeState {
  home: Pos | null;
  nectar: boolean;
  flower: Pos | null;
  sip: number;
  goal: Pos | null;
  goalT: number;
  searchCd: number;
  homeCd: number;
  stung: boolean;
  dieIn: number;
  /** Segundos fuera de casa desde la última visita. */
  out: number;
  /** Atascos: distancia al destino hace un rato, reloj de la comprobación y rodeo en curso. */
  checkD: number;
  checkT: number;
  detour: Pos | null;
  detourT: number;
}

/** Abejas dentro de un nido o colmena. */
interface Hive {
  pos: Pos;
  bees: number;
  /** De ellas, cuántas traen néctar (llenan el nido al salir la miel). */
  nectar: number;
  /** Reloj en el que sale la siguiente. */
  next: number;
  /** Jugador contra el que salen enfadadas (nido cosechado o roto). */
  angryAt: string | null;
}

interface BeeWorld {
  clock: number;
  hives: Map<string, Hive>;
  /** Nidos naturales ya poblados: clave → reloj en que se poblaron. */
  seeded: Map<string, number>;
  scanT: number;
}

const STATES = new WeakMap<Entity, BeeState>();
const WORLDS = new WeakMap<Entities, BeeWorld>();

const keyOf = (p: Pos): string => `${p[0]},${p[1]},${p[2]}`;

export function beeState(e: Entity): BeeState {
  let s = STATES.get(e);
  if (!s) {
    s = {
      home: null, nectar: false, flower: null, sip: 0, goal: null, goalT: 0, searchCd: 0, homeCd: 0, stung: false, dieIn: 0, out: 0,
      checkD: Infinity, checkT: 0, detour: null, detourT: 0,
    };
    STATES.set(e, s);
  }
  return s;
}

function world(m: Entities): BeeWorld {
  let w = WORLDS.get(m);
  if (!w) {
    w = { clock: 0, hives: new Map(), seeded: new Map(), scanT: 2 };
    WORLDS.set(m, w);
  }
  return w;
}

const FLOWER_SET = new Set<number>([POPPY, DANDELION, CORNFLOWER, PINK_PETALS, FLOWERING_AZALEA, ...Object.values(FLOWERS)]);

export function isFlower(id: number): boolean {
  return id > 0 && FLOWER_SET.has(familyBase(id));
}

/**
 * Delante de la entrada de un nido (donde entran y salen las abejas). Si la entrada está tapada
 * (hojas), por debajo o por encima del nido.
 */
export function homeFront(m: Entities, p: Pos): [number, number, number] {
  const w = m.w;
  const f = beeHomeFacing(w.getBlock(p[0], p[1], p[2]));
  const free = (x: number, y: number, z: number) => {
    const b = w.getBlock(x, y, z);
    return b >= 0 && !BLOCK_SOLID[b];
  };
  if (free(p[0] + DIR_X[f], p[1], p[2] + DIR_Z[f])) return [p[0] + 0.5 + DIR_X[f] * 0.95, p[1] + 0.2, p[2] + 0.5 + DIR_Z[f] * 0.95];
  if (free(p[0], p[1] - 1, p[2])) return [p[0] + 0.5, p[1] - 0.65, p[2] + 0.5];
  return [p[0] + 0.5, p[1] + 1.05, p[2] + 0.5];
}

/**
 * Vuela hacia un destino y, si lleva un rato sin acercarse (atascada contra la copa de un árbol),
 * da un rodeo corto hacia un lado.
 */
function approach(m: Entities, e: Entity, s: BeeState, tx: number, ty: number, tz: number, speed: number, dt: number): number {
  const w = m.w;
  if (s.detour) {
    s.detourT -= dt;
    flyToward(w, e, s.detour[0], s.detour[1], s.detour[2], speed, dt);
    if (s.detourT <= 0) s.detour = null;
    return Math.hypot(tx - e.x, ty - e.y, tz - e.z);
  }
  const d = flyToward(w, e, tx, ty, tz, speed, dt);
  s.checkT -= dt;
  if (s.checkT <= 0) {
    if (d > 1 && d > s.checkD - 0.5) {
      const a = m.rand() * Math.PI * 2;
      s.detour = [e.x + Math.cos(a) * 3, e.y + (ty < e.y ? -1.5 : 1.5), e.z + Math.sin(a) * 3];
      s.detourT = 1.2;
    }
    s.checkD = d;
    s.checkT = 2;
  }
  return d;
}

const daytime = (m: Entities): boolean => m.host.sunHeight() > 0.02 && m.host.raining() < 0.3;

/** Bloques de nido cercanos a (x, y, z). */
function findHome(m: Entities, x: number, y: number, z: number, r: number, bw: BeeWorld): Pos | null {
  const w = m.w;
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  let best: Pos | null = null, bd = Infinity;
  for (let dy = -6; dy <= 6; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const px = fx + dx, py = fy + dy, pz = fz + dz;
        if (!isBeeHome(w.getBlock(px, py, pz))) continue;
        const d = dx * dx + dy * dy + dz * dz;
        if (d >= bd) continue;
        const p: Pos = [px, py, pz];
        if (occupants(m, bw, keyOf(p)) >= BEES_PER_NEST) continue;
        bd = d;
        best = p;
      }
    }
  }
  return best;
}

/** Abejas de un nido: las de fuera que lo tienen por casa más las de dentro. */
function occupants(m: Entities, bw: BeeWorld, key: string): number {
  let n = bw.hives.get(key)?.bees ?? 0;
  for (const e of m.list.values()) {
    if (e.type !== MOB_BEE || e.dead) continue;
    const s = STATES.get(e);
    if (s?.home && keyOf(s.home) === key) n++;
  }
  return n;
}

function findFlower(m: Entities, x: number, y: number, z: number, r: number): Pos | null {
  const w = m.w;
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  const found: Pos[] = [];
  for (let dy = -4; dy <= 3; dy++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (isFlower(w.getBlock(fx + dx, fy + dy, fz + dz))) found.push([fx + dx, fy + dy, fz + dz]);
      }
    }
  }
  return found.length ? found[Math.floor(m.rand() * found.length)] : null;
}

/** Enfada a las abejas (no las que ya picaron) a menos de `r` bloques contra un jugador. */
export function angerBees(m: Entities, x: number, y: number, z: number, r: number, player: string): void {
  for (const e of m.list.values()) {
    if (e.type !== MOB_BEE || e.dead || !e.ai) continue;
    if (Math.hypot(e.x - x, e.y - y, e.z - z) > r) continue;
    if (beeState(e).stung) continue;
    e.ai.angry = 25 + m.rand() * 10;
    e.ai.target = player;
    e.ai.panic = 0;
  }
}

/** Enfada a las abejas de un nido (las de dentro salen todas). */
function angerHome(m: Entities, p: Pos, player: string): void {
  const bw = world(m);
  const key = keyOf(p);
  for (const e of m.list.values()) {
    if (e.type !== MOB_BEE || e.dead || !e.ai) continue;
    const s = beeState(e);
    if (s.stung || !s.home || keyOf(s.home) !== key) continue;
    e.ai.angry = 25 + m.rand() * 10;
    e.ai.target = player;
  }
  const hive = bw.hives.get(key);
  if (hive && hive.bees > 0) {
    hive.angryAt = player;
    hive.next = bw.clock;
  }
  angerBees(m, p[0] + 0.5, p[1] + 0.5, p[2] + 0.5, 8, player);
}

function nearestPlayerId(m: Entities, x: number, y: number, z: number, r: number): string | null {
  let best: string | null = null, bd = r;
  for (const p of m.host.players()) {
    if (!p.alive || p.creative) continue;
    const d = Math.hypot(p.x - x, p.y - y, p.z - z);
    if (d < bd) {
      bd = d;
      best = p.id;
    }
  }
  return best;
}

/** Saca una abeja de un nido (null si la salida está tapada). */
function releaseBee(m: Entities, hive: Hive, anywhere: boolean): Entity | null {
  const [x, y, z] = hive.pos;
  let [sx, sy, sz] = homeFront(m, hive.pos);
  const b = m.w.getBlock(Math.floor(sx), Math.floor(sy), Math.floor(sz));
  if (b < 0 || BLOCK_SOLID[b]) {
    if (!anywhere) return null;
    [sx, sy, sz] = [x + 0.5, y + 1.05, z + 0.5];
  }
  const e = m.spawnMob(MOB_BEE, sx, sy, sz);
  if (!e) return null;
  const s = beeState(e);
  s.home = [x, y, z];
  s.out = 0;
  hive.bees--;
  if (hive.nectar > 0) hive.nectar--;
  return e;
}

/** La abeja entra en su nido (deja el néctar: una miel más). */
function enterHome(m: Entities, e: Entity, s: BeeState): void {
  const bw = world(m);
  const p = s.home!;
  const key = keyOf(p);
  const id = m.w.getBlock(p[0], p[1], p[2]);
  if (s.nectar) {
    const lvl = honeyLevel(id);
    if (lvl >= 0 && lvl < HONEY_MAX) m.w.setBlock(p[0], p[1], p[2], withHoney(id, lvl + 1));
  }
  let hive = bw.hives.get(key);
  if (!hive) {
    hive = { pos: [p[0], p[1], p[2]], bees: 0, nectar: 0, next: 0, angryAt: null };
    bw.hives.set(key, hive);
  }
  hive.bees++;
  if (s.nectar) hive.nectar++;
  hive.next = Math.max(hive.next, bw.clock + (s.nectar ? STAY_NECTAR : STAY_EMPTY) * (0.8 + m.rand() * 0.4));
  m.host.fx('bee_enter', p[0] + 0.5, p[1] + 0.5, p[2] + 0.5);
  m.remove(e.id);
}

/** Cerebro de una abeja (siempre se encarga de todo su movimiento). */
export function beeTick(m: Entities, e: Entity, dt: number, players: PlayerView[]): void {
  const ai = e.ai!;
  const s = beeState(e);
  const def = MOBS[MOB_BEE];
  const w = m.w;
  const bw = world(m);
  if (ai.angry > 0) ai.angry -= dt;
  if (ai.panic > 0) ai.panic -= dt;
  ai.attackCd -= dt;
  s.searchCd -= dt;
  s.homeCd -= dt;
  s.goalT -= dt;
  s.out += dt;
  // Golpeada por un jugador: ella y las de alrededor se enfadan.
  if (ai.panic > 0 && e.lastHurtBy && e.age - (e.lastHurtAt ?? -99) < 0.5 && !s.stung) {
    angerBees(m, e.x, e.y, e.z, 16, e.lastHurtBy);
    ai.panic = 0;
  }
  if (s.stung) {
    s.dieIn -= dt;
    if (s.dieIn <= 0) {
      m.kill(e, false);
      return;
    }
  }
  // ¿Sigue ahí su nido? Si lo rompieron, las abejas de alrededor van a por el jugador más cercano.
  if (s.home && s.homeCd <= 0) {
    s.homeCd = 0.5;
    const [hx, hy, hz] = s.home;
    const cur = w.getBlock(hx, hy, hz);
    if (cur >= 0 && !isBeeHome(cur)) {
      const who = nearestPlayerId(m, hx + 0.5, hy + 0.5, hz + 0.5, 12);
      s.home = null;
      if (who) angerBees(m, hx + 0.5, hy + 0.5, hz + 0.5, 20, who);
    }
  }
  // Sin casa: buscar una cerca de vez en cuando.
  if (!s.home && s.searchCd <= 0 && !(ai.angry > 0)) {
    s.home = findHome(m, e.x, e.y, e.z, 12, bw);
    if (!s.home) s.searchCd = 8 + m.rand() * 6;
  }

  // --- Enfadada: a por el jugador (una sola picadura) ---
  if (ai.angry > 0 && ai.target && !s.stung) {
    const p = players.find((q) => q.id === ai.target && q.alive && !q.creative);
    if (!p || Math.hypot(p.x - e.x, p.z - e.z) > 40 || m.host.difficulty() === 0) {
      ai.angry = 0;
      ai.target = null;
    } else {
      const d = approach(m, e, s, p.x, p.y + 1.1, p.z, def.run, dt);
      if (d < 1.4 && ai.attackCd <= 0) {
        ai.attackCd = 1;
        const dx = p.x - e.x, dz = p.z - e.z, dl = Math.hypot(dx, dz) || 1;
        m.host.hurtPlayer(p.id, def.damage * m.difficultyScale(), (dx / dl) * 3, 3, (dz / dl) * 3, BEE_STING_CAUSE, e); // Fase 7: e (Espinas)
        m.host.fx('mob_attack', e.x, e.y + 0.3, e.z, MOB_BEE);
        s.stung = true;
        s.dieIn = STING_DEATH[0] + m.rand() * (STING_DEATH[1] - STING_DEATH[0]);
        ai.angry = 0;
        ai.target = null;
      }
      return;
    }
  }

  // --- A casa: de noche, con lluvia, con néctar o tras mucho rato fuera ---
  if (s.home && !s.stung && (!daytime(m) || s.nectar || s.out > 150)) {
    const [fx, fy, fz] = homeFront(m, s.home);
    const d = approach(m, e, s, fx, fy, fz, def.walk, dt);
    if (d < 0.9) enterHome(m, e, s);
    return;
  }

  // --- Polinizar: ir a una flor y quedarse encima hasta cargarse de néctar ---
  if (!s.nectar && !s.stung && daytime(m)) {
    if (s.flower && !isFlower(w.getBlock(s.flower[0], s.flower[1], s.flower[2]))) s.flower = null;
    if (!s.flower && s.searchCd <= 0) {
      s.flower = findFlower(m, e.x, e.y, e.z, 10);
      s.searchCd = s.flower ? 20 : 5 + m.rand() * 5;
      s.sip = 0;
      s.goalT = 0;
    }
    if (s.flower) {
      const [fx, fy, fz] = s.flower;
      const d = approach(m, e, s, fx + 0.5, fy + 0.45, fz + 0.5, def.walk, dt);
      if (d < 0.45) {
        s.sip += dt;
        if (s.sip >= SIP_SECONDS) {
          s.nectar = true;
          s.flower = null;
          s.sip = 0;
          m.host.fx('bee_pollen', e.x, e.y + 0.2, e.z);
        }
      } else if (s.goalT < -12) {
        // No consigue llegar (flor tapada): probar con otra.
        s.flower = null;
        s.goalT = 0;
      }
      return;
    }
  }

  // --- Pasear alrededor de casa (o de donde esté) ---
  if (!s.goal || s.goalT <= 0) {
    const [ax, ay, az] = s.home ? [s.home[0] + 0.5, s.home[1], s.home[2] + 0.5] : [e.x, e.y, e.z];
    s.goal = randomAirPoint(w, m.rand, ax, ay, az, 1, s.home ? 8 : 5, 0.5, 3);
    s.goalT = 3 + m.rand() * 4;
  }
  if (Math.hypot(s.goal[0] - e.x, s.goal[1] - e.y, s.goal[2] - e.z) < 0.5) hover(w, e, dt);
  else approach(m, e, s, s.goal[0], s.goal[1], s.goal[2], def.walk * 0.7, dt);
}

/** Estado de las abejas con néctar (para los bits de estado). */
export function beeHasNectar(e: Entity): boolean {
  return STATES.get(e)?.nectar ?? false;
}

/** Reloj de las abejas: salidas de los nidos, nidos rotos con abejas dentro y nidos naturales nuevos. */
export function beeWorldTick(m: Entities, dt: number, players: PlayerView[]): void {
  const bw = world(m);
  bw.clock += dt;
  const day = daytime(m);
  for (const [key, hive] of bw.hives) {
    const [x, y, z] = hive.pos;
    if (!m.w.isLoaded(Math.floor(x / 16), Math.floor(z / 16))) continue;
    const id = m.w.getBlock(x, y, z);
    if (id < 0) continue;
    if (!isBeeHome(id)) {
      // Nido roto con abejas dentro: salen todas, furiosas.
      const who = hive.angryAt ?? nearestPlayerId(m, x + 0.5, y + 0.5, z + 0.5, 16);
      while (hive.bees > 0) {
        const e = releaseBee(m, hive, true);
        if (!e) break;
        beeState(e).home = null;
        if (who) {
          e.ai!.angry = 25 + m.rand() * 10;
          e.ai!.target = who;
        }
      }
      bw.hives.delete(key);
      continue;
    }
    if (hive.bees <= 0) {
      bw.hives.delete(key);
      continue;
    }
    if (bw.clock < hive.next || (!day && !hive.angryAt)) continue;
    const e = releaseBee(m, hive, !!hive.angryAt);
    if (e && hive.angryAt) {
      e.ai!.angry = 25 + m.rand() * 10;
      e.ai!.target = hive.angryAt;
    }
    hive.next = bw.clock + (hive.angryAt ? 0.2 : 1.5 + m.rand() * 2.5);
    if (hive.bees <= 0) bw.hives.delete(key);
  }
  // Poblar los nidos naturales que aparecen cerca de los jugadores.
  bw.scanT -= dt;
  if (bw.scanT > 0) return;
  bw.scanT = 1;
  for (const p of players) seedNestsNear(m, bw, p.x, p.z);
}

/** Busca nidos naturales en una zona de 16×16 al azar cerca de (px, pz) y les pone abejas. */
function seedNestsNear(m: Entities, bw: BeeWorld, px: number, pz: number): void {
  const w = m.w;
  const cx = Math.floor(px / 16) + Math.floor(m.rand() * 7) - 3;
  const cz = Math.floor(pz / 16) + Math.floor(m.rand() * 7) - 3;
  if (!w.isLoaded(cx, cz)) return;
  for (let lz = 0; lz < 16; lz++) {
    for (let lx = 0; lx < 16; lx++) {
      const x = cx * 16 + lx, z = cz * 16 + lz;
      const top = w.skyTop(x, z);
      if (top < MIN_Y) continue;
      for (let y = top; y > top - 10; y--) {
        const id = w.getBlock(x, y, z);
        if (familyBase(id) !== BEE_NEST) continue;
        const key = `${x},${y},${z}`;
        const when = bw.seeded.get(key);
        if (when !== undefined && bw.clock - when < 1200) continue;
        bw.seeded.set(key, bw.clock);
        if (bw.seeded.size > 4096) bw.seeded.delete(bw.seeded.keys().next().value!);
        const n = BEES_PER_NEST - occupants(m, bw, key);
        if (n <= 0) continue;
        const hive = bw.hives.get(key) ?? { pos: [x, y, z] as Pos, bees: 0, nectar: 0, next: bw.clock + 1, angryAt: null };
        hive.bees += n;
        bw.hives.set(key, hive);
      }
    }
  }
}

/** Abejas dentro del nido de (x, y, z) (para pruebas y depuración). */
export function beesInside(m: Entities, x: number, y: number, z: number): number {
  return world(m).hives.get(`${x},${y},${z}`)?.bees ?? 0;
}

/** Mete abejas en un nido (comando o pruebas): salen de una en una. */
export function addBeesToHome(m: Entities, x: number, y: number, z: number, n: number): void {
  const bw = world(m);
  const key = `${x},${y},${z}`;
  const hive = bw.hives.get(key) ?? { pos: [x, y, z] as Pos, bees: 0, nectar: 0, next: bw.clock, angryAt: null };
  hive.bees += n;
  bw.hives.set(key, hive);
  bw.seeded.set(key, bw.clock);
}

/** ¿Hay una fogata encendida hasta 5 bloques por debajo? (el humo calma a las abejas). */
function smoked(m: Entities, x: number, y: number, z: number): boolean {
  for (let k = 1; k <= 5; k++) {
    const id = m.w.getBlock(x, y - k, z);
    if (isCampfire(id) && stateProps(id)?.lit === 1) return true; // Fase 8.5: también la de almas
    if (id > 0 && BLOCK_SOLID[id] && !isCampfire(id)) return false;
  }
  return false;
}

/**
 * Cosechar un nido o colmena lleno: con tijeras suelta 3 panales, con un frasco de cristal lo que se
 * lleva el jugador es un frasco de miel (lo pone el cliente). Sin humo debajo, las abejas se enfadan.
 * Devuelve false si no se puede (no está lleno o el objeto no sirve).
 */
export function harvestBeeHome(m: Entities, x: number, y: number, z: number, item: number, player: string): boolean {
  const id = m.w.getBlock(x, y, z);
  if (honeyLevel(id) < HONEY_MAX || (item !== SHEARS && item !== GLASS_BOTTLE)) return false;
  m.w.setBlock(x, y, z, withHoney(id, 0));
  const [fx, fy, fz] = homeFront(m, [x, y, z]);
  if (item === SHEARS) {
    m.spawnItem({ id: HONEYCOMB, count: 3 }, fx, fy + 0.2, fz, (fx - x - 0.5) * 2, 3, (fz - z - 0.5) * 2);
  }
  m.host.fx('honey_harvest', fx, fy + 0.3, fz, item === SHEARS ? 1 : 0);
  if (!smoked(m, x, y, z)) angerHome(m, [x, y, z], player);
  return true;
}
