// Fase 8.3 (criaturas del Nether): el comportamiento de las criaturas del Nether en el servidor. MobBrain le cede
// el tick de cada una después del ambiente (sol, lava, caída); si devuelve true, ya pensó y se movió.
//
// Aquí va lo que comparten todas, portado de Java 26.3 tick a tick (el servidor va a 20 ticks por segundo):
// - Sentidos cada 20 ticks (como los Sensor de Java): las criaturas y los jugadores que ven a menos de su
//   alcance de seguimiento (16 por defecto), de la más cercana a la más lejana.
// - Movimiento de LivingEntity.travel: en el suelo acelera s · s (Mob.setSpeed pone zza = s) con el
//   rozamiento del bloque; en el aire 0,02 · s; en el agua y en la lava, 0,02 · s con su frenado y su gravedad.
// - Caminos (A* con las penalizaciones de cada una), puntos al azar para pasear (LandRandomPos) y para alejarse
//   (DefaultRandomPos.getPosAway), alcance cuerpo a cuerpo (getAttackBoundingBox, 0,828 alrededor).
// - Voces: el sonido ambiente con el reloj de Java (ambientSoundTime) y la variante que toque (enfadado,
//   celoso, huyendo…), que el cliente pinta con el sintetizador ('nvoice').
// - Criaturas montadas en otras (jinete de strider, strider cría sobre su madre, piglin cría sobre un hoglin
//   cría): el jinete va encima y el que manda es él (la montura va donde quiere el jinete).
// - Zombificación fuera del Nether (piglins y hoglins, 300 ticks), armadura (la del cubo de magma, el oro de los
//   piglins) y resistencia al empuje (hoglin y zoglin, 0,6).
// Cada familia va en su archivo: netherPiglins.ts, netherBeasts.ts, netherFlyers.ts y netherMonsters.ts.
import { MOBS } from '../../mobs';
import {
  MOB_PIGLIN, MOB_PIGLIN_BRUTE, MOB_ZOMBIFIED_PIGLIN, MOB_GHAST, MOB_BLAZE, MOB_HOGLIN, MOB_ZOGLIN, MOB_STRIDER,
  MOB_WITHER_SKELETON, MOB_MAGMA_CUBE, MOB_MAGMA_CUBE_MEDIUM, MOB_MAGMA_CUBE_SMALL, EF_ZOMBIFYING, ZOMBIFY_TICKS,
  ZOMBIFY_NAUSEA_TICKS, isNetherMob, isMagmaCube, magmaSize, gearArmor, gearMain, gearOff, packGear,
} from '../../netherMobs';
import { BLOCKS, BLOCK_SOLID, BLOCK_FLUID, BLOCK_COLLIDE, SKULLS, type SkullKind } from '../../blocks';
import type { ItemStack } from '../../items';
import { EF_ACTION, EF_ANGRY, EF_FIRE } from '../../protocol';
import { EFFECT_NAUSEA, invisibleRange } from '../../effects';
import { skullDisguises } from '../../collections';
import { DIM_NETHER } from '../../dimensions';
import type { InteractResult } from './types';
import { moveBody, lineOfSight } from '../physics';
import { findPath, standable, type PathOpts } from '../pathfind';
import { blockUnder } from '../../materialPhysics';
import { TAU, angleTo, lerpAngle, type PlayerView, type Entity } from './types';
import type { Entities } from './Entities';
import type { MobBrain } from './mobBrain';
import { PiglinAI } from './netherPiglins';
import { BeastAI } from './netherBeasts';
import { FlyerAI } from './netherFlyers';
import { NetherMonsterAI } from './netherMonsters';

/** Segundos por tick del servidor. */
export const DT = 0.05;

/** Objetivo: un jugador (su id de sesión) o una criatura (su id de entidad). */
export type TargetId = string | number;

/** Objetivo resuelto: posición y caja, y quién es. */
export interface Tgt {
  id: TargetId;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  p?: PlayerView;
  e?: Entity;
}

/** Estado común de cada criatura del Nether (no se guarda: casi todas son monstruos que no se guardan). */
export interface NState {
  /** Ticks hasta volver a mirar alrededor. */
  sense: number;
  /** Criaturas vivas a la vista, de la más cercana a la más lejana. */
  seen: Entity[];
  /** Jugadores atacables a la vista, del más cercano al más lejano. */
  players: PlayerView[];
  /** A quién ataca y ticks que le quedan a ese recuerdo (−1: hasta que deje de valer). */
  target: TargetId | null;
  targetT: number;
  /** Ticks hasta poder volver a golpear. */
  cool: number;
  /** Tarea de paseo: ticks que le quedan, destino y velocidad. */
  idle: number;
  walk: [number, number, number] | null;
  walkS: number;
  /** A quién mira (y ticks). */
  look: TargetId | null;
  lookT: number;
  /** Reloj del sonido ambiente (ambientSoundTime de Java). */
  ambient: number;
  /** Ticks fuera del Nether (piglins y hoglins). */
  zombify: number;
  /** Lo que pide el jinete a su montura: dirección, velocidad y salto (y ticks que vale). */
  steer: [number, number, number, boolean] | null;
  steerT: number;
  /** Quién lo hirió por última vez y ticks que le quedan a ese recuerdo (HURT_BY, 100 ticks). */
  hurtBy: TargetId | null;
  hurtT: number;
  /** Criaturas montadas encima (ids). */
  riders: number[];
}

/** Alcance de seguimiento (FOLLOW_RANGE): 16 salvo el bruto (12), el blaze (48) y el ghast (100). */
export function followRange(type: number): number {
  return type === MOB_PIGLIN_BRUTE ? 12 : type === MOB_BLAZE ? 48 : type === MOB_GHAST ? 100 : 16;
}

/** Altura de los ojos (eyeHeight de EntityTypes; si no, el 85 % de la altura). */
export function eyeHeight(e: Entity): number {
  const baby = (e.growAge ?? 0) > 0;
  switch (e.type) {
    case MOB_PIGLIN:
    case MOB_PIGLIN_BRUTE:
    case MOB_ZOMBIFIED_PIGLIN:
      return baby ? 0.78 : 1.79;
    case MOB_GHAST:
      return 2.6;
    case MOB_WITHER_SKELETON:
      return 2.1;
    case MOB_HOGLIN:
    case MOB_ZOGLIN:
      return baby ? 0.625 : 1.19;
    default:
      return e.height * 0.85;
  }
}

/** Rozamiento de un bloque (friction de Java): 0,6; el hielo 0,98 (el azul 0,989) y el slime 0,8. */
function friction(id: number): number {
  const k = id > 0 ? BLOCKS[id]?.key ?? '' : '';
  if (k === 'blue_ice') return 0.989;
  if (k === 'ice' || k === 'packed_ice' || k === 'frosted_ice') return 0.98;
  if (k === 'slime_block') return 0.8;
  return 0.6;
}

export class NetherAI {
  readonly piglins: PiglinAI;
  readonly beasts: BeastAI;
  readonly flyers: FlyerAI;
  readonly monsters: NetherMonsterAI;
  private states = new WeakMap<Entity, NState>();

  constructor(readonly m: Entities, readonly brain: MobBrain) {
    this.piglins = new PiglinAI(this);
    this.beasts = new BeastAI(this);
    this.flyers = new FlyerAI(this);
    this.monsters = new NetherMonsterAI(this);
  }

  get rand(): () => number {
    return this.m.rand;
  }

  state(e: Entity): NState {
    let s = this.states.get(e);
    if (!s) {
      s = {
        sense: Math.floor(this.m.rand() * 20), seen: [], players: [], target: null, targetT: -1, cool: 0, idle: 0, walk: null, walkS: 0,
        look: null, lookT: 0, ambient: -80, zombify: 0, steer: null, steerT: 0, hurtBy: null, hurtT: 0, riders: [],
      };
      this.states.set(e, s);
    }
    return s;
  }

  // ------------------------------------------------------------------ aparición

  /**
   * Lo que Java hace en finalizeSpawn: armas y armadura de los piglins, crías, jinetes de los striders, tamaño
   * del cubo de magma… `reason`: aparición natural, huevo generador o jinete que sale con su montura.
   */
  finalizeSpawn(e: Entity, reason: 'natural' | 'egg' | 'jockey' | 'structure'): Entity {
    if (!isNetherMob(e.type)) return e;
    if (isMagmaCube(e.type) && reason !== 'jockey') e = this.monsters.magmaSpawnSize(e);
    switch (e.type) {
      case MOB_PIGLIN:
      case MOB_PIGLIN_BRUTE:
      case MOB_ZOMBIFIED_PIGLIN:
        this.piglins.finalizeSpawn(e, reason);
        break;
      case MOB_HOGLIN:
      case MOB_ZOGLIN:
      case MOB_STRIDER:
        this.beasts.finalizeSpawn(e, reason);
        break;
      case MOB_WITHER_SKELETON:
        this.monsters.finalizeSpawn(e);
        break;
    }
    return e;
  }

  // ------------------------------------------------------------------ tick

  /** Tick de una criatura del Nether; true si ya se encargó de todo. */
  tick(e: Entity, dt: number, players: PlayerView[]): boolean {
    if (!isNetherMob(e.type) || !e.ai) return false;
    void dt;
    const s = this.state(e);
    if (s.cool > 0) s.cool--;
    if (s.targetT > 0 && --s.targetT === 0) s.target = null;
    if (s.lookT > 0 && --s.lookT === 0) s.look = null;
    if (s.steerT > 0 && --s.steerT === 0) s.steer = null;
    if (s.hurtT > 0 && --s.hurtT === 0) s.hurtBy = null;
    e.ai.repath -= DT;
    if (--s.sense <= 0) {
      s.sense = 20;
      this.senseAround(e, s, players);
    }
    // Montada en otra criatura: el jinete sigue pensando, pero va donde vaya su montura.
    if (e.mountId !== undefined && !this.stayMounted(e)) e.mountId = undefined;
    switch (e.type) {
      case MOB_PIGLIN:
      case MOB_PIGLIN_BRUTE:
      case MOB_ZOMBIFIED_PIGLIN:
        this.piglins.tick(e, s, players);
        break;
      case MOB_HOGLIN:
      case MOB_ZOGLIN:
      case MOB_STRIDER:
        this.beasts.tick(e, s, players);
        break;
      case MOB_GHAST:
      case MOB_BLAZE:
        this.flyers.tick(e, s, players);
        break;
      case MOB_MAGMA_CUBE:
      case MOB_MAGMA_CUBE_MEDIUM:
      case MOB_MAGMA_CUBE_SMALL:
      case MOB_WITHER_SKELETON:
        this.monsters.tick(e, s, players);
        break;
    }
    if (e.dead || !this.m.list.has(e.id)) return true;
    this.placeRiders(e, s);
    this.brain.updateFlags(e, e.ai);
    e.flags = (e.flags & ~(EF_ANGRY | EF_ACTION | EF_FIRE)) | this.flags(e, s);
    return true;
  }

  /** Bits de estado de cada familia (y el enfado de quien tiene a quién atacar). */
  private flags(e: Entity, s: NState): number {
    let f = s.target !== null ? EF_ANGRY : 0;
    if (s.zombify > 0) f |= EF_ZOMBIFYING;
    switch (e.type) {
      case MOB_PIGLIN:
      case MOB_PIGLIN_BRUTE:
      case MOB_ZOMBIFIED_PIGLIN:
        return f | this.piglins.flags(e, s);
      case MOB_HOGLIN:
      case MOB_ZOGLIN:
      case MOB_STRIDER:
        return f | this.beasts.flags(e, s);
      case MOB_GHAST:
      case MOB_BLAZE:
        return f | this.flyers.flags(e, s);
      default:
        return f | this.monsters.flags(e, s);
    }
  }

  // ------------------------------------------------------------------ sentidos

  /** ¿Puede atacar a este jugador? (vivo, en supervivencia; invisible o con la cabeza de su especie lo ve menos). */
  attackable(e: Entity, p: PlayerView, range: number): boolean {
    if (!p.alive || p.creative) return false;
    const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
    let r = range;
    if (p.head && skullDisguises(p.head, e.type)) r *= 0.5;
    if (p.invisible) r *= invisibleRange(p.armorPieces ?? 0);
    return d <= r;
  }

  /** Lo que ve alrededor (NearestLivingEntitySensor y PlayerSensor): criaturas y jugadores con línea de visión. */
  private senseAround(e: Entity, s: NState, players: PlayerView[]): void {
    const r = followRange(e.type);
    const w = this.m.w;
    const ey = e.y + eyeHeight(e);
    const seen: [number, Entity][] = [];
    for (const o of this.m.list.values()) {
      if (o === e || !o.ai || o.dead || MOBS[o.type]?.inert) continue;
      const dx = o.x - e.x, dy = o.y - e.y, dz = o.z - e.z;
      if (Math.abs(dx) > r || Math.abs(dy) > r || Math.abs(dz) > r) continue;
      if (!lineOfSight(w, e.x, ey, e.z, o.x, o.y + eyeHeight(o), o.z)) continue;
      seen.push([dx * dx + dy * dy + dz * dz, o]);
    }
    seen.sort((a, b) => a[0] - b[0]);
    s.seen = seen.map((p) => p[1]);
    const vis: [number, PlayerView][] = [];
    for (const p of players) {
      if (!this.attackable(e, p, r)) continue;
      if (!lineOfSight(w, e.x, ey, e.z, p.x, p.y + 1.62, p.z)) continue;
      vis.push([(p.x - e.x) ** 2 + (p.y - e.y) ** 2 + (p.z - e.z) ** 2, p]);
    }
    vis.sort((a, b) => a[0] - b[0]);
    s.players = vis.map((p) => p[1]);
  }

  /** Objetivo resuelto (null si ya no vale: muerto, lejos, creativo). */
  resolve(id: TargetId | null, players: PlayerView[]): Tgt | null {
    if (id === null) return null;
    if (typeof id === 'string') {
      const p = players.find((q) => q.id === id);
      if (!p || !p.alive || p.creative) return null;
      return { id, x: p.x, y: p.y, z: p.z, w: 0.6, h: 1.8, p };
    }
    const o = this.m.list.get(id);
    if (!o || o.dead || !o.ai) return null;
    return { id, x: o.x, y: o.y, z: o.z, w: o.width, h: o.height, e: o };
  }

  /** ¿Lo ve desde sus ojos? */
  canSee(e: Entity, t: Tgt): boolean {
    return lineOfSight(this.m.w, e.x, e.y + eyeHeight(e), e.z, t.x, t.y + (t.p ? 1.62 : t.h * 0.85), t.z);
  }

  // ------------------------------------------------------------------ movimiento

  /**
   * Un tick de movimiento de Java (LivingEntity.travel) con dirección (dx, dz) (normalizada, o 0 para quedarse)
   * y velocidad `s` (modificador × atributo). Las velocidades de la entidad van en bloques por segundo.
   */
  walk(e: Entity, dx: number, dz: number, s: number, jump = false, step = 0.6): void {
    const w = this.m.w;
    const m = e.mountId !== undefined ? this.m.list.get(e.mountId) : undefined;
    if (m) {
      // Montada: se lo pide a su montura (que va a su propia velocidad) y se deja llevar.
      const ms = this.state(m);
      ms.steer = [dx, dz, s, jump];
      ms.steerT = 2;
      return;
    }
    let vx = e.vx * DT, vy = e.vy * DT, vz = e.vz * DT;
    const fluid = e.inWater || e.inLava;
    if (fluid) {
      vx += dx * 0.02 * s;
      vz += dz * 0.02 * s;
      if (jump) vy += 0.04;
    } else {
      const bf = e.onGround ? friction(blockUnder(w, e.x, e.y, e.z)) : 1;
      const acc = e.onGround ? s * s * (0.21600002 / (bf * bf * bf)) : 0.02 * s;
      vx += dx * acc;
      vz += dz * acc;
      if (jump && e.onGround) vy = 0.42;
    }
    e.vx = vx / DT;
    e.vy = vy / DT;
    e.vz = vz / DT;
    const x0 = e.x, z0 = e.z;
    this.moveAndFall(e, step);
    // Atasco (ticks sin avanzar queriendo andar): lo usan los paseos para rendirse y los caminos para recalcular.
    const ai = e.ai!;
    const want = s > 0 && (dx !== 0 || dz !== 0);
    ai.stuck = want && Math.hypot(e.x - x0, e.z - z0) < s * s * 0.25 ? ai.stuck + 1 : 0;
    vx = e.vx * DT;
    vy = e.vy * DT;
    vz = e.vz * DT;
    if (fluid) {
      const k = e.inLava ? 0.5 : 0.8;
      vx *= k;
      vz *= k;
      vy = vy * (e.inLava ? 0.5 : 0.8) - (e.inLava ? 0.02 : 0.005);
    } else {
      const f = e.onGround ? friction(blockUnder(w, e.x, e.y, e.z)) * 0.91 : 0.91;
      vx *= f;
      vz *= f;
      vy = (vy - 0.08) * 0.98;
    }
    e.vx = vx / DT;
    e.vy = Math.max(-78.4, vy / DT);
    e.vz = vz / DT;
  }

  /** Mueve con colisiones y aplica el daño por caída (como MonsterAI.walk). */
  moveAndFall(e: Entity, step = 0.6, noFallDamage = false): void {
    const wasGround = e.onGround;
    const vy0 = e.vy;
    moveBody(e, this.m.w, DT, step);
    if (!wasGround && e.onGround && !e.inWater && !e.inLava && !noFallDamage) {
      const fall = e.fallStart - e.y;
      if (fall > 3.5 && vy0 < -8) this.m.damage(e, Math.floor(fall - 3), e.x, e.z, null, 0);
    }
    if (e.onGround || e.inWater || e.inLava) e.fallStart = e.y;
    else e.fallStart = Math.max(e.fallStart, e.y);
  }

  /** ¿Falló el último camino? (el destino no se puede alcanzar desde aquí). */
  pathFailed = false;

  /**
   * Dirección hacia (x, y, z) siguiendo un camino A*: [dx, dz, saltar]. Como PathNavigation, el camino se calcula
   * una vez y sólo se rehace si el destino se aleja más de 2 bloques del de antes, si se atasca o (con `moving`,
   * persiguiendo a alguien) cada 1–1,6 s; si no hay camino, lo intenta de nuevo al cabo de 2 s.
   */
  steerTo(e: Entity, x: number, y: number, z: number, opts?: PathOpts, moving = false): [number, number, boolean] {
    const ai = e.ai!;
    const tx = Math.floor(x), ty = Math.floor(y), tz = Math.floor(z);
    const far = !ai.goal || Math.abs(ai.goal[0] - tx) + Math.abs(ai.goal[1] - ty) + Math.abs(ai.goal[2] - tz) > 2;
    const stuck = ai.stuck > 30;
    if (far || stuck || (ai.repath <= 0 && (moving || !ai.path || ai.path.length === 0))) {
      ai.goal = [tx, ty, tz];
      const path = findPath(this.m.w, Math.floor(e.x), Math.floor(e.y + 0.01), Math.floor(e.z), tx, ty, tz, Math.ceil(e.height), moving ? 350 : 220, opts);
      ai.path = path ?? [];
      ai.pathIdx = 0;
      ai.repath = path ? 1 + this.m.rand() * 0.6 : 2;
      if (stuck) ai.stuck = 0;
    }
    this.pathFailed = !ai.path || ai.path.length === 0;
    const path = ai.path;
    if (path && ai.pathIdx < path.length) {
      let node = path[ai.pathIdx];
      if (Math.hypot(node[0] + 0.5 - e.x, node[2] + 0.5 - e.z) < Math.max(0.4, e.width * 0.5) && Math.abs(node[1] - e.y) < 1.2) {
        ai.pathIdx++;
        if (ai.pathIdx >= path.length) return this.direct(e, x, z);
        node = path[ai.pathIdx];
      }
      const ndx = node[0] + 0.5 - e.x, ndz = node[2] + 0.5 - e.z;
      const d = Math.hypot(ndx, ndz) || 1;
      // Salta sólo si el nodo queda más alto que un escalón (MoveControl: dy > maxUpStep); el strider a media
      // altura sobre la lava tiene sus nodos 0,5 más arriba y no salta.
      return [ndx / d, ndz / d, node[1] - e.y > 0.6 || (e.hitWall && e.onGround)];
    }
    return this.direct(e, x, z);
  }

  direct(e: Entity, x: number, z: number): [number, number, boolean] {
    const dx = x - e.x, dz = z - e.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) return [0, 0, false];
    return [dx / d, dz / d, e.hitWall && e.onGround];
  }

  /**
   * Camina hacia (x, y, z) con velocidad `s`; true si ya llegó (a menos de `near` bloques) o, si es un sitio fijo (un
   * paseo), si no hay camino hasta él (se rinde). `moving`: el destino es alguien que se mueve (se persigue en línea
   * recta si no hay camino).
   */
  goTo(e: Entity, x: number, y: number, z: number, s: number, near = 1, opts?: PathOpts, moving = false): boolean {
    if (Math.hypot(x - e.x, z - e.z) <= near && Math.abs(y - e.y) < 2) {
      this.walk(e, 0, 0, 0);
      return true;
    }
    const [dx, dz, jump] = this.steerTo(e, x, y, z, opts, moving);
    if (this.pathFailed && !moving) {
      this.walk(e, 0, 0, 0);
      return true;
    }
    this.walk(e, dx, dz, s, jump);
    this.face(e, e.x + dx, e.z + dz);
    return false;
  }

  /** Gira el cuerpo hacia donde va (y la cabeza también si no mira a nada). */
  face(e: Entity, x: number, z: number, rate = 0.45): void {
    if (Math.hypot(x - e.x, z - e.z) > 1e-3) e.bodyYaw = lerpAngle(e.bodyYaw, angleTo(e.x, e.z, x, z), rate);
  }

  /** Gira la cabeza hacia un punto (LookControl). */
  lookAt(e: Entity, x: number, y: number, z: number): void {
    e.yaw = lerpAngle(e.yaw, angleTo(e.x, e.z, x, z), 0.5);
    e.pitch = Math.atan2(y - (e.y + eyeHeight(e)), Math.hypot(x - e.x, z - e.z) || 1e-3);
  }

  /** Sin nada que mirar: la cabeza vuelve con el cuerpo. */
  relaxLook(e: Entity): void {
    e.yaw = lerpAngle(e.yaw, e.bodyYaw, 0.15);
    e.pitch *= 0.85;
  }

  /** Punto al azar donde puede estar de pie (LandRandomPos.getPos: `h` en horizontal y `v` en vertical). */
  landPos(e: Entity, h: number, v: number, opts?: PathOpts, accept?: (x: number, y: number, z: number) => boolean): [number, number, number] | null {
    const w = this.m.w;
    const hgt = Math.ceil(e.height);
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(e.x) + Math.floor(this.m.rand() * (2 * h + 1)) - h;
      const z = Math.floor(e.z) + Math.floor(this.m.rand() * (2 * h + 1)) - h;
      let y = Math.floor(e.y) + Math.floor(this.m.rand() * (2 * v + 1)) - v;
      // Baja hasta el suelo (o sube si está enterrado), como el ajuste de LandRandomPos.
      let k = 0;
      while (k++ < 8 && !standable(w, x, y, z, hgt, opts)) {
        const b = w.getBlock(x, y, z);
        if (b > 0 && BLOCK_SOLID[b]) y++;
        else y--;
      }
      if (!standable(w, x, y, z, hgt, opts)) continue;
      if (accept && !accept(x, y, z)) continue;
      return [x + 0.5, y, z + 0.5];
    }
    return null;
  }

  /** Punto al azar que lo aleja de (fx, fz) (DefaultRandomPos.getPosAway). */
  awayPos(e: Entity, fx: number, fz: number, h: number, v: number, opts?: PathOpts): [number, number, number] | null {
    const ax = e.x - fx, az = e.z - fz;
    return this.landPos(e, h, v, opts, (x, _y, z) => (x + 0.5 - e.x) * ax + (z + 0.5 - e.z) * az > 0);
  }

  // ------------------------------------------------------------------ combate

  /** ¿Lo alcanza cuerpo a cuerpo? (la caja del atacante crece 0,828 en horizontal y toca la del objetivo). */
  inReach(e: Entity, t: Tgt): boolean {
    const r = e.width / 2 + Math.sqrt(2.04) - 0.6;
    const m = e.mountId !== undefined ? this.m.list.get(e.mountId) : undefined;
    const rx = Math.max(r, m ? m.width / 2 + Math.sqrt(2.04) - 0.6 : 0);
    return Math.abs(t.x - e.x) <= rx + t.w / 2 && Math.abs(t.z - e.z) <= rx + t.w / 2 && t.y < e.y + e.height && t.y + t.h > e.y;
  }

  /** Golpea a un objetivo con `dmg` (medios corazones; a los jugadores, según la dificultad). */
  hit(e: Entity, t: Tgt, dmg: number, cause: string, knock = 1): boolean {
    const dx = t.x - e.x, dz = t.z - e.z;
    const d = Math.hypot(dx, dz) || 1;
    this.m.host.fx('mob_attack', e.x, e.y + e.height * 0.7, e.z, e.type);
    if (t.p) {
      this.m.host.hurtPlayer(t.p.id, dmg * this.m.difficultyScale(), (dx / d) * 5 * knock, 4 * Math.min(1, knock), (dz / d) * 5 * knock, cause, e);
      this.m.companions.onPlayerHurtBy(t.p.id, e);
      return true;
    }
    if (t.e) {
      this.m.damage(t.e, dmg, e.x, e.z, e.id, knock);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ voces

  /** Una voz de la criatura para los clientes (variante: 0 normal, 1 enfadada, 2 huyendo…). */
  voice(e: Entity, variant = 0): void {
    this.m.host.fx('nvoice', e.x, e.y + e.height * 0.8, e.z, e.type, variant);
  }

  /** El reloj del sonido ambiente de Java: sonará `variant()` (o nada si devuelve −1). */
  ambient(e: Entity, s: NState, variant: () => number): void {
    if (this.m.rand() * 1000 < s.ambient++) {
      s.ambient = -80;
      const v = variant();
      if (v >= 0) this.voice(e, v);
    }
  }

  // ------------------------------------------------------------------ zombificación

  /**
   * Fuera del Nether (el atributo piglins_zombify), 300 ticks después se convierte en `into`: con su equipo, su
   * nombre y su edad, y con Náuseas 10 s. true si se convirtió (la entidad vieja ya no está).
   */
  zombify(e: Entity, s: NState, into: number, immune: boolean, before?: () => void): boolean {
    if (immune || this.m.host.world.dim === DIM_NETHER) {
      s.zombify = 0;
      return false;
    }
    if (++s.zombify <= ZOMBIFY_TICKS) return false;
    before?.();
    this.convert(e, into, true);
    return true;
  }

  /** Convierte una criatura en otra en su mismo sitio (ConversionParams.single). */
  convert(e: Entity, into: number, keepGear: boolean): Entity | null {
    const baby = (e.growAge ?? 0) > 0;
    const n = this.m.spawnMob(into, e.x, e.y, e.z, baby);
    if (!n) return null;
    n.yaw = e.yaw;
    n.bodyYaw = e.bodyYaw;
    if (baby) n.growAge = e.growAge;
    if (e.customName) n.customName = e.customName;
    if (e.persist) n.persist = true;
    if (keepGear) n.gear = packGear(gearMain(e.gear), gearOff(e.gear), gearArmor(e.gear));
    this.m.effects.add(n, EFFECT_NAUSEA, ZOMBIFY_NAUSEA_TICKS * DT, 0);
    this.m.host.fx('nether_convert', e.x, e.y + e.height * 0.6, e.z, e.type);
    this.m.remove(e.id);
    return n;
  }

  // ------------------------------------------------------------------ montadas

  /** Monta a `rider` sobre `vehicle`. */
  mount(rider: Entity, vehicle: Entity): void {
    rider.mountId = vehicle.id;
    const vs = this.state(vehicle);
    if (!vs.riders.includes(rider.id)) vs.riders.push(rider.id);
    this.placeRider(rider, vehicle);
  }

  /** Baja de su montura. */
  dismount(rider: Entity): void {
    const v = rider.mountId !== undefined ? this.m.list.get(rider.mountId) : undefined;
    if (v) {
      const vs = this.state(v);
      vs.riders = vs.riders.filter((id) => id !== rider.id);
    }
    rider.mountId = undefined;
    rider.fallStart = rider.y;
  }

  /** ¿Sigue la montura ahí? (si no, se baja). */
  private stayMounted(e: Entity): boolean {
    const v = this.m.list.get(e.mountId!);
    if (v && !v.dead && v.ai) return true;
    this.dismount(e);
    return false;
  }

  /** Altura de los pies del jinete sobre los de la montura (enganches de pasajero y de vehículo de EntityTypes). */
  riderHeight(rider: Entity, vehicle: Entity): number {
    const vBaby = (vehicle.growAge ?? 0) > 0, rBaby = (rider.growAge ?? 0) > 0;
    let seat: number;
    switch (vehicle.type) {
      case MOB_HOGLIN:
      case MOB_ZOGLIN:
        seat = vBaby ? 0.875 : 1.49375;
        break;
      case MOB_PIGLIN:
        seat = vBaby ? 0.98 : 2.0125;
        break;
      default:
        seat = vehicle.height;
    }
    const piglinLike = rider.type === MOB_PIGLIN || rider.type === MOB_ZOMBIFIED_PIGLIN || rider.type === MOB_PIGLIN_BRUTE;
    const hang = piglinLike ? (rBaby ? 0.1875 : 0.7) : 0;
    return seat - hang;
  }

  private placeRider(rider: Entity, vehicle: Entity): void {
    rider.x = vehicle.x;
    rider.z = vehicle.z;
    rider.y = vehicle.y + this.riderHeight(rider, vehicle);
    rider.vx = rider.vy = rider.vz = 0;
    rider.onGround = false;
    rider.fallStart = rider.y;
    rider.bodyYaw = vehicle.bodyYaw;
  }

  /** Coloca encima a los jinetes de `e` después de que se movió. */
  private placeRiders(e: Entity, s: NState): void {
    if (s.riders.length === 0) return;
    s.riders = s.riders.filter((id) => {
      const r = this.m.list.get(id);
      if (!r || r.dead || r.mountId !== e.id) return false;
      this.placeRider(r, e);
      return true;
    });
  }

  /** Lo que pide su jinete (si lo lleva y lo manda él): [dx, dz, velocidad, saltar]. */
  steering(e: Entity, s: NState): [number, number, number, boolean] | null {
    return s.steerT > 0 ? s.steer : null;
  }

  // ------------------------------------------------------------------ daño

  /** Armadura: la del cubo de magma (3 por tamaño) y el oro de los piglins (CombatRules.getDamageAfterAbsorb). */
  absorb(e: Entity, amount: number): number {
    let armor = 0;
    if (isMagmaCube(e.type)) armor = magmaSize(e.type) * 3;
    else if (e.type === MOB_PIGLIN) {
      const a = gearArmor(e.gear);
      armor = (a & 1 ? 2 : 0) + (a & 2 ? 5 : 0) + (a & 4 ? 3 : 0) + (a & 8 ? 1 : 0);
    }
    if (armor <= 0) return amount;
    const g = Math.max(armor * 0.2, Math.min(20, armor - amount / 2));
    return amount * (1 - g / 25);
  }

  /** Resistencia al empuje (0..1). */
  knockbackResistance(e: Entity): number {
    return e.type === MOB_HOGLIN || e.type === MOB_ZOGLIN ? 0.6 : 0;
  }

  /** Recibió daño (antes de ver si muere). */
  onDamaged(e: Entity, attacker: string | number | null): void {
    if (!isNetherMob(e.type) || !e.ai) return;
    const s = this.state(e);
    if (attacker !== null) {
      s.hurtBy = attacker;
      s.hurtT = 100;
    }
    switch (e.type) {
      case MOB_PIGLIN:
      case MOB_PIGLIN_BRUTE:
      case MOB_ZOMBIFIED_PIGLIN:
        this.piglins.onDamaged(e, s, attacker);
        break;
      case MOB_HOGLIN:
      case MOB_ZOGLIN:
      case MOB_STRIDER:
        this.beasts.onDamaged(e, s, attacker);
        break;
      case MOB_GHAST:
      case MOB_BLAZE:
        this.flyers.onDamaged(e, s, attacker);
        break;
      default:
        this.monsters.onDamaged(e, s, attacker);
    }
  }

  /** Murió con botín: lo que suelta aparte (equipo, varas, cráneos, discos) y los cubos que se dividen. */
  onKilled(e: Entity, killer: string | number | null): void {
    if (!isNetherMob(e.type)) return;
    const s = this.state(e);
    for (const id of s.riders) {
      const r = this.m.list.get(id);
      if (r) this.dismount(r);
    }
    if (e.mountId !== undefined) this.dismount(e);
    switch (e.type) {
      case MOB_PIGLIN:
      case MOB_PIGLIN_BRUTE:
      case MOB_ZOMBIFIED_PIGLIN:
        this.piglins.onKilled(e, killer);
        break;
      case MOB_GHAST:
      case MOB_BLAZE:
        this.flyers.onKilled(e, killer);
        break;
      case MOB_HOGLIN:
      case MOB_ZOGLIN:
      case MOB_STRIDER:
        this.beasts.onKilled(e, killer);
        break;
      default:
        this.monsters.onKilled(e, killer);
    }
  }

  /** Un jugador usa un objeto sobre una criatura del Nether (null si no le toca a este sistema). */
  interact(e: Entity, item: number, creative: boolean, who?: string): InteractResult | null {
    if (!isNetherMob(e.type) || !e.ai || e.dead) return null;
    if (e.type === MOB_PIGLIN) return this.piglins.interact(e, item, creative, who);
    if (e.type === MOB_HOGLIN || e.type === MOB_STRIDER) return this.beasts.interact(e, item, creative, who);
    return null;
  }

  // ------------------------------------------------------------------ utilidades

  /** ¿Hay un bloque que cumpla `pred` a menos de h en horizontal y v en vertical? El más cercano (por Manhattan). */
  nearestBlock(e: Entity, h: number, v: number, pred: (id: number) => boolean): [number, number, number] | null {
    const w = this.m.w;
    const bx = Math.floor(e.x), by = Math.floor(e.y), bz = Math.floor(e.z);
    let best: [number, number, number] | null = null;
    let bd = Infinity;
    for (let dy = -v; dy <= v; dy++) {
      for (let dz = -h; dz <= h; dz++) {
        for (let dx = -h; dx <= h; dx++) {
          const d = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
          if (d >= bd) continue;
          const id = w.getBlock(bx + dx, by + dy, bz + dz);
          if (id > 0 && pred(id)) {
            bd = d;
            best = [bx + dx, by + dy, bz + dz];
          }
        }
      }
    }
    return best;
  }

  /** Suelta una pila en su posición (hacia arriba y un poco al azar). */
  drop(e: Entity, id: number, count = 1, dmg?: number): void {
    if (id <= 0 || count <= 0) return;
    this.m.dropStacks([dmg !== undefined ? { id, count, dmg } : { id, count }], e.x, e.y + 0.3, e.z);
  }

  /**
   * Lanza objetos hacia un punto (BehaviorUtils.throwItem): salen de la mano (0,3 bajo los ojos) a 0,3 bloques por
   * tick en la dirección del punto (un bloque por encima).
   */
  throwItems(e: Entity, stacks: { id: number; count: number; dmg?: number; ench?: unknown }[], tx: number, ty: number, tz: number): void {
    const sy = e.y + eyeHeight(e) - 0.3;
    const dx = tx - e.x, dy = ty + 1 - e.y, dz = tz - e.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    for (const st of stacks) {
      if (!st || st.count <= 0) continue;
      this.m.spawnItem(st as never, e.x, sy, e.z, (dx / d) * 6, (dy / d) * 6, (dz / d) * 6, undefined, 0.5);
    }
  }

  /** Sitio libre para una criatura de este tipo en (x, y, z) (sin bloques con colisión). */
  roomAt(type: number, x: number, y: number, z: number): boolean {
    const def = MOBS[type];
    const hw = def.width / 2;
    for (let yy = Math.floor(y); yy < Math.ceil(y + def.height); yy++) {
      for (let zz = Math.floor(z - hw); zz <= Math.floor(z + hw); zz++) {
        for (let xx = Math.floor(x - hw); xx <= Math.floor(x + hw); xx++) {
          const b = this.m.w.getBlock(xx, yy, zz);
          if (b < 0 || BLOCK_COLLIDE[b] || BLOCK_FLUID[b]) return false;
        }
      }
    }
    return true;
  }

  /** Ángulo al azar (para impulsos y direcciones). */
  randomAngle(): number {
    return this.m.rand() * TAU;
  }

  /** Objeto de la cabeza de un tipo (cráneo de esqueleto wither, cabeza de piglin). */
  skullItem(kind: SkullKind): number {
    return SKULLS[kind];
  }

  // ------------------------------------------------------------------ guardado

  /**
   * Lo que se guarda de una criatura del Nether que se guarda (striders, y los monstruos con nombre o que cogieron
   * algo): su equipo, el inventario del piglin, si es cría y dónde vive el bruto.
   */
  save(e: Entity): { nm: { g?: number; inv?: ItemStack[]; b?: number; h?: [number, number, number] } } | null {
    if (!isNetherMob(e.type)) return null;
    const nm: { g?: number; inv?: ItemStack[]; b?: number; h?: [number, number, number] } = {};
    if (e.gear) nm.g = e.gear;
    if (e.pinv?.length) nm.inv = e.pinv.map((s) => ({ ...s }));
    if ((e.growAge ?? 0) > 0 && MOBS[e.type].hostile) nm.b = 1;
    const home = e.type === MOB_PIGLIN_BRUTE ? this.piglins.pstate(e).home : null;
    if (home) nm.h = home;
    return Object.keys(nm).length ? { nm } : null;
  }

  restore(e: Entity, row: unknown[]): void {
    if (!isNetherMob(e.type)) return;
    const c = row.find((x) => !!x && typeof x === 'object' && !Array.isArray(x) && 'nm' in (x as object)) as { nm?: Record<string, unknown> } | undefined;
    const nm = c?.nm;
    if (!nm) return;
    const g = Number(nm.g);
    if (Number.isFinite(g) && g > 0) e.gear = g;
    if (Array.isArray(nm.inv)) {
      e.pinv = nm.inv
        .filter((s): s is ItemStack => !!s && typeof s === 'object' && Number.isInteger((s as ItemStack).id) && Number.isInteger((s as ItemStack).count))
        .slice(0, 8)
        .map((s) => ({ ...s, count: Math.max(1, Math.min(64, s.count)) }));
    }
    if (nm.b === 1 && !((e.growAge ?? 0) > 0)) this.m.animals.setBaby(e, 1e9);
    const h = nm.h;
    if (Array.isArray(h) && h.length === 3 && h.every(Number.isFinite)) this.piglins.pstate(e).home = [h[0], h[1], h[2]];
  }
}
