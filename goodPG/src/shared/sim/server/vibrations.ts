// Fase 7.5 (abismo): el sistema de vibraciones (los «game events» de Minecraft), para cualquier sistema
// del servidor. Ver docs/vibraciones.md.
//
// - Quien hace algo llama a `emit(suceso, x, y, z, fuente)`. Los pasos, caídas, nados, comidas, disparos
//   y cofres de los jugadores, y los pasos, caídas, chapoteos y proyectiles de las entidades, los
//   detecta este sistema solo, mirando cada tick lo que hay cerca de algún oyente.
// - Oyentes de bloque (sensores de sculk, sensores calibrados y chilladores), apuntados por chunk: se
//   apuntan al colocarlos o al cargar su chunk (con la API de la redstone) y un suceso sólo mira los
//   chunks que tiene a su alcance. Si no hay ningún oyente, emitir no cuesta nada.
// - Oyentes que son entidades (el warden): se apuntan con `listen` y se miran aparte.
// - Como en Minecraft, cada oyente se queda con la vibración más cercana de cada tick; al tick siguiente
//   empieza a viajar (un bloque por tick, con su partícula) y al llegar actúa. Mientras una viaja, el
//   oyente no atiende otras. La lana en medio las ocluye; la lana y las alfombras ahogan lo que pasa
//   encima de ellas; agachado no se oyen los pasos ni las caídas; lo que causa un warden, tampoco.
// - Los sensores se activan con una potencia según la distancia (15 junto a ellos, 1 en el límite) que
//   dan por todos lados (y fuerte hacia abajo) durante 30 ticks (el calibrado, 10), y luego se enfrían
//   10; el comparador lee la frecuencia de la última vibración. Al activarse chasquean sus zarcillos
//   (lo oyen los chilladores) y hacen resonar la amatista de al lado con su frecuencia. El calibrado sólo
//   atiende la frecuencia que le llega por su lado de entrada (si le llega alguna).
import {
  AMETHYST_BLOCK, BLOCK_SOLID, BLOCK_FLUID, familyBase, stateProps, SCULK_SENSOR, CALIBRATED_SCULK_SENSOR, SCULK_SHRIEKER,
  isAnySensor, isCalibratedSensor, isShrieker, sensorPhase, sensorWithPhase, calibratedInputFace, shriekerProps, sculkSignal,
  PHASE_INACTIVE, PHASE_ACTIVE, PHASE_COOLDOWN, isSoulGround, isWaterlogged, isDoor, isTrapdoor, isFenceGate, isLever, isButton,
  isPressurePlate, isTripwireHook, isPiston, isNoteBlock,
} from '../../blocks';
import {
  vibrationFrequency, vibrationOccluded, dampensVibrations, occludesVibrations, sensorPower, travelTicks, IGNORED_WHEN_SNEAKING,
  SENSOR_RANGE, CALIBRATED_RANGE, SHRIEKER_RANGE, SENSOR_ACTIVE_TICKS, CALIBRATED_ACTIVE_TICKS, SENSOR_COOLDOWN_TICKS,
  packDelta, type VibrationEvent,
} from '../../vibrations';
import { registerRedstone, FACE_X, FACE_Y, FACE_Z, type RedstoneApi } from '../../redstone/api';
import { STATE_SNEAK, STATE_FLY, STATE_SWIM, STATE_DEAD, STATE_EAT, STATE_BOW } from '../../protocol';
import { MOBS, ENT_ITEM, ENT_ARROW, ENT_THROWN, MOB_WARDEN } from '../../mobs';
import { ENT_TRIDENT } from '../../equipment';
import { posKey, keyX, keyY, keyZ } from '../posKey';
import type { Entity } from '../entities';
import type { ServerContext, Session } from './context';

/** Quién causa una vibración. */
export interface VibrationSource {
  /** Jugador (id de sesión) o entidad (id) que la causa; null si nadie (un bloque que cambia solo). */
  who?: string | number | null;
  /** Dueño de lo que la causa (quien disparó la flecha o tiró el objeto). */
  owner?: string | number | null;
  /** Quien la causa va agachado. */
  sneaking?: boolean;
  /** Bloque afectado (colocado o roto): si ahoga las vibraciones (lana), no vibra. */
  block?: number;
}

/** Oyente que es una entidad (el warden). */
export interface EntityVibrationListener {
  readonly entity: Entity;
  readonly range: number;
  /** Altura de sus «oídos» sobre los pies. */
  readonly eye: number;
  /** ¿Atiende este suceso ahora? */
  accepts(ev: VibrationEvent, src: VibrationSource): boolean;
  /** Llega una vibración que salió de (x, y, z) a `distance` bloques. */
  receive(ev: VibrationEvent, x: number, y: number, z: number, src: VibrationSource, distance: number): void;
}

interface Flight {
  ev: VibrationEvent;
  freq: number;
  x: number;
  y: number;
  z: number;
  src: VibrationSource;
  distance: number;
  /** Tick en que llega (sólo cuando ya viaja). */
  due: number;
}

/** Lo que se sigue de cada jugador para sus pasos, caídas, bocados, disparos y cofres. */
interface PlayerTrack {
  x: number;
  y: number;
  z: number;
  s: number;
  walked: number;
  top: number;
  container: number | null;
}

/** Lo que se sigue de cada entidad cercana a un oyente. */
interface EntityTrack {
  x: number;
  z: number;
  onGround: boolean;
  inWater: boolean;
  walked: number;
  top: number;
  stuck: boolean;
}

/** Distancia que se anda entre dos pasos (como el sonido de las pisadas de Minecraft). */
const STEP_DISTANCE = 1.67;
/** Caída mínima para que el aterrizaje vibre. */
const FALL_MIN = 0.9;

const chunkKey = (cx: number, cz: number): number => (cx + 32768) * 65536 + (cz + 32768);

/** Sistemas de vibraciones de cada motor de redstone (los manejadores de los bloques lo buscan aquí). */
const SYSTEMS = new WeakMap<RedstoneApi, Vibrations>();

export class Vibrations {
  /** Oyentes de bloque por chunk. */
  private byChunk = new Map<number, Set<number>>();
  private blockCount = 0;
  /** Chunks a menos de 16 bloques de un oyente de bloque (se rehace cuando cambian). */
  private hot = new Set<number>();
  private hotDirty = false;
  readonly entityListeners = new Set<EntityVibrationListener>();
  /** Candidata de este tick y vibración en vuelo de cada oyente de bloque (por posición) y de entidad. */
  private blockCand = new Map<number, Flight>();
  private blockFlight = new Map<number, Flight>();
  private entCand = new Map<EntityVibrationListener, Flight>();
  private entFlight = new Map<EntityVibrationListener, Flight>();
  private players = new Map<string, PlayerTrack>();
  private tracks = new WeakMap<Entity, EntityTrack>();
  /** Proyectiles lanzados que se siguen: al desaparecer, aterrizan (id → último punto y dueño). */
  private thrown = new Map<number, [number, number, number, string | number | null]>();
  /** Un chillador oye el chasquido de un sensor que activó un jugador (lo atiende sculk). */
  onShriekerHeard: ((x: number, y: number, z: number, player: string) => void) | null = null;
  /** Un sensor se activó (para las pruebas y los efectos). */
  onSensor: ((x: number, y: number, z: number, power: number, freq: number) => void) | null = null;
  /** Estadística para las pruebas: vibraciones que llegaron. */
  delivered = 0;

  constructor(private ctx: ServerContext, private redstone: RedstoneApi) {
    SYSTEMS.set(redstone, this);
  }

  /** Cuántos oyentes de bloque hay apuntados (para las pruebas). */
  get listenerCount(): number {
    return this.blockCount;
  }

  // ------------------------------------------------------------------ oyentes

  addBlockListener(x: number, y: number, z: number): void {
    const ck = chunkKey(Math.floor(x / 16), Math.floor(z / 16));
    let set = this.byChunk.get(ck);
    if (!set) this.byChunk.set(ck, (set = new Set()));
    const k = posKey(x, y, z);
    if (set.has(k)) return;
    set.add(k);
    this.blockCount++;
    this.hotDirty = true;
  }

  removeBlockListener(x: number, y: number, z: number): void {
    const ck = chunkKey(Math.floor(x / 16), Math.floor(z / 16));
    const set = this.byChunk.get(ck);
    const k = posKey(x, y, z);
    if (!set || !set.delete(k)) return;
    if (set.size === 0) this.byChunk.delete(ck);
    this.blockCount--;
    this.blockCand.delete(k);
    this.blockFlight.delete(k);
    this.hotDirty = true;
  }

  /** Apunta una entidad que oye (hasta que muere o desaparece). */
  listen(l: EntityVibrationListener): void {
    this.entityListeners.add(l);
  }

  private rebuildHot(): void {
    this.hotDirty = false;
    this.hot.clear();
    for (const ck of this.byChunk.keys()) {
      const cx = Math.floor(ck / 65536) - 32768, cz = (ck % 65536) - 32768;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) this.hot.add(chunkKey(cx + dx, cz + dz));
    }
  }

  /** ¿Hay algún oyente que pueda oír algo en (x, z)? */
  near(x: number, z: number): boolean {
    if (this.hotDirty) this.rebuildHot();
    if (this.hot.has(chunkKey(Math.floor(x / 16), Math.floor(z / 16)))) return true;
    for (const l of this.entityListeners) {
      const e = l.entity;
      if (Math.abs(e.x - x) <= l.range + 2 && Math.abs(e.z - z) <= l.range + 2) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ emitir

  /**
   * Algo vibra en (x, y, z): cada oyente a su alcance que pueda atenderlo se lo apunta como candidata
   * (gana la más cercana del tick). `resonance`: frecuencia de una resonancia de amatista.
   */
  emit(ev: VibrationEvent, x: number, y: number, z: number, src: VibrationSource = {}, resonance = 0): void {
    if (this.blockCount === 0 && this.entityListeners.size === 0) return;
    if (src.sneaking && IGNORED_WHEN_SNEAKING.has(ev)) return;
    if (src.block !== undefined && dampensVibrations(src.block)) return;
    if (typeof src.who === 'number' && this.ctx.entities.list.get(src.who)?.type === MOB_WARDEN) return;
    const freq = vibrationFrequency(ev, resonance);
    const get = (bx: number, by: number, bz: number) => this.ctx.world.getBlock(bx, by, bz);
    if (this.blockCount > 0) {
      const cx0 = Math.floor((x - CALIBRATED_RANGE) / 16), cx1 = Math.floor((x + CALIBRATED_RANGE) / 16);
      const cz0 = Math.floor((z - CALIBRATED_RANGE) / 16), cz1 = Math.floor((z + CALIBRATED_RANGE) / 16);
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const set = this.byChunk.get(chunkKey(cx, cz));
          if (!set) continue;
          for (const k of set) this.offerBlock(k, ev, freq, x, y, z, src, get);
        }
      }
    }
    for (const l of this.entityListeners) this.offerEntity(l, ev, freq, x, y, z, src, get);
  }

  private offerBlock(
    k: number, ev: VibrationEvent, freq: number, x: number, y: number, z: number, src: VibrationSource,
    get: (x: number, y: number, z: number) => number,
  ): void {
    const bx = keyX(k), by = keyY(k), bz = keyZ(k);
    const id = get(bx, by, bz);
    if (id < 0) return;
    let range: number;
    if (isShrieker(id)) {
      if (ev !== 'tendrils_clicking' || shriekerProps(id).shrieking || !playerOf(src)) return;
      range = SHRIEKER_RANGE;
    } else if (isAnySensor(id)) {
      if (freq <= 0 || sensorPhase(id) !== PHASE_INACTIVE) return;
      range = isCalibratedSensor(id) ? CALIBRATED_RANGE : SENSOR_RANGE;
    } else {
      this.removeBlockListener(bx, by, bz);
      return;
    }
    const cx = bx + 0.5, cy = by + 0.5, cz = bz + 0.5;
    const d = Math.hypot(x - cx, y - cy, z - cz);
    if (d > range) return;
    // Lo que pasa en su propia celda (colocarlo o romperlo) no lo oye.
    if (Math.floor(x) === bx && Math.floor(y) === by && Math.floor(z) === bz && (ev === 'block_place' || ev === 'block_destroy')) return;
    if (this.blockFlight.has(k)) return;
    const cur = this.blockCand.get(k);
    if (cur && (cur.distance < d || (cur.distance === d && cur.freq >= freq))) return;
    if (isCalibratedSensor(id)) {
      const want = this.redstone.powerFrom(bx, by, bz, calibratedInputFace(id));
      if (want > 0 && want !== freq) return;
    }
    if (vibrationOccluded(get, x, y, z, cx, cy, cz)) return;
    this.blockCand.set(k, { ev, freq, x, y, z, src, distance: d, due: 0 });
  }

  private offerEntity(
    l: EntityVibrationListener, ev: VibrationEvent, freq: number, x: number, y: number, z: number, src: VibrationSource,
    get: (x: number, y: number, z: number) => number,
  ): void {
    const e = l.entity;
    if (e.dead) return;
    if (freq <= 0 && ev !== 'shriek' && ev !== 'tendrils_clicking') return;
    const ey = e.y + l.eye;
    const d = Math.hypot(x - e.x, y - ey, z - e.z);
    if (d > l.range || this.entFlight.has(l) || !l.accepts(ev, src)) return;
    const cur = this.entCand.get(l);
    if (cur && (cur.distance < d || (cur.distance === d && cur.freq >= freq))) return;
    if (vibrationOccluded(get, x, y, z, e.x, ey, e.z)) return;
    this.entCand.set(l, { ev, freq, x, y, z, src, distance: d, due: 0 });
  }

  // ------------------------------------------------------------------ tick

  tick(): void {
    const now = this.ctx.tickCount;
    this.watchPlayers();
    if (this.blockCount === 0 && this.entityListeners.size === 0) {
      this.thrown.clear();
      return;
    }
    this.watchEntities();
    // Las candidatas del tick anterior empiezan a viajar.
    for (const [k, f] of this.blockCand) {
      f.due = now + travelTicks(f.distance);
      this.blockFlight.set(k, f);
      this.ctx.fx('vibration', f.x, f.y, f.z, packDelta(keyX(k) + 0.5 - f.x, keyY(k) + 0.5 - f.y, keyZ(k) + 0.5 - f.z), f.due - now);
    }
    this.blockCand.clear();
    for (const [l, f] of this.entCand) {
      f.due = now + travelTicks(f.distance);
      this.entFlight.set(l, f);
      const e = l.entity;
      this.ctx.fx('vibration', f.x, f.y, f.z, packDelta(e.x - f.x, e.y + l.eye - f.y, e.z - f.z), f.due - now);
    }
    this.entCand.clear();
    // Las que llegan.
    for (const [k, f] of this.blockFlight) {
      if (f.due > now) continue;
      this.blockFlight.delete(k);
      this.delivered++;
      this.arriveBlock(keyX(k), keyY(k), keyZ(k), f);
    }
    for (const [l, f] of this.entFlight) {
      if (f.due > now) continue;
      this.entFlight.delete(l);
      if (l.entity.dead || !this.ctx.entities.list.has(l.entity.id)) continue;
      this.delivered++;
      l.receive(f.ev, f.x, f.y, f.z, f.src, f.distance);
    }
    for (const l of this.entityListeners) {
      if (l.entity.dead || !this.ctx.entities.list.has(l.entity.id)) {
        this.entityListeners.delete(l);
        this.entCand.delete(l);
        this.entFlight.delete(l);
      }
    }
  }

  /** Llega una vibración a un bloque que oye. */
  private arriveBlock(x: number, y: number, z: number, f: Flight): void {
    const id = this.ctx.world.getBlock(x, y, z);
    if (isShrieker(id)) {
      const p = playerOf(f.src);
      if (p && !shriekerProps(id).shrieking) this.onShriekerHeard?.(x, y, z, p);
      return;
    }
    if (!isAnySensor(id) || sensorPhase(id) !== PHASE_INACTIVE) return;
    const calibrated = isCalibratedSensor(id);
    const power = sensorPower(f.distance, calibrated ? CALIBRATED_RANGE : SENSOR_RANGE);
    this.activate(x, y, z, id, power, f.freq, f.src);
  }

  /** Activa un sensor: potencia, sonido, chasquido para los chilladores y resonancia de la amatista. */
  activate(x: number, y: number, z: number, id: number, power: number, freq: number, src: VibrationSource): void {
    const rs = this.redstone;
    rs.setData(x, y, z, sculkSignal(power, freq));
    rs.setBlock(x, y, z, sensorWithPhase(id, PHASE_ACTIVE));
    rs.schedule(x, y, z, isCalibratedSensor(id) ? CALIBRATED_ACTIVE_TICKS : SENSOR_ACTIVE_TICKS);
    rs.outputChanged(x, y, z);
    rs.analogChanged(x, y, z);
    this.ctx.fx('sculk_clicking', x + 0.5, y + 0.5, z + 0.5, power);
    this.onSensor?.(x, y, z, power, freq);
    this.emit('tendrils_clicking', x + 0.5, y + 0.5, z + 0.5, { who: src.who, owner: src.owner });
    for (let f = 0; f < 6; f++) {
      const ax = x + FACE_X[f], ay = y + FACE_Y[f], az = z + FACE_Z[f];
      if (this.ctx.world.getBlock(ax, ay, az) !== AMETHYST_BLOCK) continue;
      this.ctx.fx('amethyst_resonate', ax + 0.5, ay + 0.5, az + 0.5, freq);
      this.emit('resonate', ax + 0.5, ay + 0.5, az + 0.5, { who: src.who, owner: src.owner }, freq);
    }
  }

  // ------------------------------------------------------------------ lo que se detecta solo

  /** Jugadores: pasos, nados, caídas, bocados, disparos con el arco, cofres y chilladores pisados. */
  private watchPlayers(): void {
    const seen = new Set<string>();
    for (const s of this.ctx.sessions()) {
      if (!s.joined) continue;
      seen.add(s.id);
      const [x, y, z] = s.p;
      let t = this.players.get(s.id);
      if (!t) {
        this.players.set(s.id, (t = { x, y, z, s: s.s, walked: 0, top: y, container: s.container }));
        continue;
      }
      const prev = { ...t };
      t.x = x;
      t.y = y;
      t.z = z;
      t.s = s.s;
      t.container = s.container;
      if (s.s & STATE_DEAD || s.mode === 'c' && s.s & STATE_FLY) {
        t.walked = 0;
        t.top = y;
        continue;
      }
      if (!this.near(x, z)) {
        t.walked = 0;
        t.top = y;
        continue;
      }
      this.playerEvents(s, t, prev);
    }
    for (const id of this.players.keys()) if (!seen.has(id)) this.players.delete(id);
  }

  private playerEvents(s: Session, t: PlayerTrack, prev: PlayerTrack): void {
    const w = this.ctx.world;
    const src: VibrationSource = { who: s.id, sneaking: (s.s & STATE_SNEAK) !== 0 };
    const flying = (s.s & STATE_FLY) !== 0;
    const swimming = (s.s & STATE_SWIM) !== 0;
    const under = w.getBlock(Math.floor(t.x), Math.floor(t.y - 0.08), Math.floor(t.z));
    const here = w.getBlock(Math.floor(t.x), Math.floor(t.y), Math.floor(t.z));
    const onGround = !flying && (standsOn(under) || (standsOn(here) && t.y - Math.floor(t.y) < 0.6));
    const horiz = Math.hypot(t.x - prev.x, t.z - prev.z);
    // Caídas: lo más alto desde que dejó el suelo.
    if (!onGround && !swimming) t.top = Math.max(prev.top, t.y);
    else {
      const fall = prev.top - t.y;
      if (onGround && fall >= FALL_MIN && !dampensVibrations(under) && !dampensVibrations(here)) {
        this.emit('hit_ground', t.x, t.y, t.z, src);
      }
      t.top = t.y;
    }
    // Pasos (andando) y brazadas (en el agua).
    if ((onGround || swimming) && horiz > 0 && horiz < 4) {
      t.walked = prev.walked + horiz;
      if (t.walked >= STEP_DISTANCE) {
        t.walked = 0;
        const cell = standsOn(here) ? here : under;
        if (swimming) this.emit('swim', t.x, t.y, t.z, src);
        else if (!dampensVibrations(cell)) this.emit('step', t.x, t.y, t.z, src);
      }
    } else t.walked = prev.walked;
    // Pisar un chillador (sin ir agachado) lo hace chillar.
    const feet = isShrieker(here) ? [Math.floor(t.x), Math.floor(t.y), Math.floor(t.z)] : isShrieker(under) ? [Math.floor(t.x), Math.floor(t.y - 0.08), Math.floor(t.z)] : null;
    if (feet && onGround && !src.sneaking && !shriekerProps(w.getBlock(feet[0], feet[1], feet[2])).shrieking) {
      this.onShriekerHeard?.(feet[0], feet[1], feet[2], s.id);
    }
    // Terminó de comer o beber; soltó la cuerda del arco.
    if (prev.s & STATE_EAT && !(t.s & STATE_EAT)) this.emit('eat', t.x, t.y + 1.5, t.z, src);
    if (prev.s & STATE_BOW && !(t.s & STATE_BOW)) this.emit('projectile_shoot', t.x, t.y + 1.5, t.z, src);
    // Cofres y demás contenedores que abre o cierra.
    if (prev.container !== t.container) {
      if (prev.container !== null) this.emit('container_close', keyX(prev.container) + 0.5, keyY(prev.container) + 0.5, keyZ(prev.container) + 0.5, src);
      if (t.container !== null) this.emit('container_open', keyX(t.container) + 0.5, keyY(t.container) + 0.5, keyZ(t.container) + 0.5, src);
    }
  }

  /** Entidades cerca de un oyente: pasos, caídas, chapoteos y proyectiles que aterrizan. */
  private watchEntities(): void {
    const list = this.ctx.entities.list;
    for (const [id, [x, y, z, owner]] of this.thrown) {
      const e = list.get(id);
      if (e && !e.dead) continue;
      this.thrown.delete(id);
      this.emit('projectile_land', x, y, z, { who: id, owner });
    }
    for (const e of list.values()) {
      if (e.dead) continue;
      if (!this.near(e.x, e.z)) {
        this.tracks.delete(e);
        continue;
      }
      let t = this.tracks.get(e);
      if (!t) {
        this.tracks.set(e, { x: e.x, z: e.z, onGround: e.onGround, inWater: e.inWater, walked: 0, top: e.y, stuck: !!e.stuck });
        if (e.type === ENT_THROWN || e.type === ENT_TRIDENT) this.thrown.set(e.id, [e.x, e.y, e.z, shooterOf(e)]);
        continue;
      }
      const src: VibrationSource = { who: e.id, owner: shooterOf(e) };
      if (e.type === ENT_ARROW || e.type === ENT_TRIDENT) {
        if (e.stuck && !t.stuck) this.emit('projectile_land', e.x, e.y, e.z, src);
        t.stuck = !!e.stuck;
        if (e.type === ENT_TRIDENT) this.thrown.set(e.id, [e.x, e.y, e.z, shooterOf(e)]);
        continue;
      }
      if (e.type === ENT_THROWN) {
        this.thrown.set(e.id, [e.x, e.y, e.z, shooterOf(e)]);
        continue;
      }
      const isItem = e.type === ENT_ITEM;
      if (!isItem && (!e.ai || !MOBS[e.type])) continue;
      const w = this.ctx.world;
      const under = w.getBlock(Math.floor(e.x), Math.floor(e.y - 0.08), Math.floor(e.z));
      if (!e.onGround && !e.inWater) t.top = Math.max(t.top, e.y);
      else {
        if (e.onGround && !t.onGround && t.top - e.y >= (isItem ? 0.2 : FALL_MIN) && !dampensVibrations(under)) {
          this.emit('hit_ground', e.x, e.y, e.z, src);
        }
        t.top = e.y;
      }
      if (e.inWater && !t.inWater && !isItem) this.emit('splash', e.x, e.y, e.z, src);
      if (!isItem && (e.onGround || e.inWater)) {
        const horiz = Math.hypot(e.x - t.x, e.z - t.z);
        if (horiz < 4) t.walked += horiz;
        if (t.walked >= STEP_DISTANCE) {
          t.walked = 0;
          if (e.inWater) this.emit('swim', e.x, e.y, e.z, src);
          else if (!dampensVibrations(under)) this.emit('step', e.x, e.y, e.z, src);
        }
      }
      t.x = e.x;
      t.z = e.z;
      t.onGround = e.onGround;
      t.inWater = e.inWater;
    }
  }

  // ------------------------------------------------------------------ cambios de bloques y efectos

  /**
   * Un bloque cambió (`actor`: el jugador que lo hizo, o null). Colocar y romper vibran si lo hace un
   * jugador; abrir y cerrar puertas, trampillas y portillos, y encender o apagar palancas, botones, placas,
   * ganchos y pistones, lo haga quien lo haga.
   */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number, actor: string | null): void {
    if (this.blockCount === 0 && this.entityListeners.size === 0) return;
    const ev = blockEvent(old, id, actor !== null);
    if (!ev) return;
    const src: VibrationSource = { who: actor, block: ev === 'block_destroy' || ev === 'fluid_pickup' ? old : id };
    this.emit(ev, x + 0.5, y + 0.5, z + 0.5, src);
  }

  /**
   * Efectos del servidor que son también vibraciones (explosiones, notas, campanas, golpes y muertes…). `a`: el
   * dato del efecto (en los de las criaturas, su tipo: lo que le pasa al warden no vibra).
   */
  onFx(kind: string, x: number, y: number, z: number, a?: number): void {
    if (this.blockCount === 0 && this.entityListeners.size === 0) return;
    if (a === MOB_WARDEN && kind.startsWith('mob_')) return;
    const ev = FX_EVENTS[kind];
    if (ev) this.emit(ev, x, y, z);
  }
}

/** Sucesos que salen de los efectos del servidor (sin quién los causa). */
const FX_EVENTS: Readonly<Record<string, VibrationEvent>> = {
  explode: 'explode', mob_death: 'entity_die', mob_hurt: 'entity_damage', teleport: 'teleport', note: 'note_block_play',
  bell: 'block_change', mob_shoot: 'projectile_shoot', crossbow_shoot: 'projectile_shoot', creeper_fuse: 'prime_fuse',
  tnt_primed: 'prime_fuse', shear: 'shear', witch_drink: 'drink', milk: 'drink', throw: 'projectile_shoot',
};

/**
 * Vibración de un cambio de bloque (null si no la hay). `byPlayer`: lo hizo un jugador (colocar, romper,
 * vaciar o llenar un cubo y demás cambios de estado; los que no hace nadie sólo vibran si abren, cierran,
 * encienden o apagan algo).
 */
export function blockEvent(old: number, id: number, byPlayer: boolean): VibrationEvent | null {
  if (old < 0) return null;
  const was = old > 0, is = id > 0;
  if (was && is && familyBase(old) === familyBase(id)) {
    const toggled = toggleState(old, id);
    if (toggled !== null) return toggled;
    return byPlayer && old !== id ? 'block_change' : null;
  }
  if (!byPlayer) return null;
  // Fluido suelto (agua o lava; no un bloque anegado).
  const fluid = (b: number) => b > 0 && BLOCK_FLUID[b] !== 0 && !isWaterlogged(b);
  if ((!was || fluid(old)) && is) return fluid(id) ? 'fluid_place' : 'block_place';
  if (was && (!is || fluid(id))) return fluid(old) ? 'fluid_pickup' : 'block_destroy';
  return 'block_change';
}

/** Abrir o cerrar, encender o apagar: la vibración que corresponde (null si no es uno de ésos). */
function toggleState(old: number, id: number): VibrationEvent | null {
  const a = stateProps(old), b = stateProps(id);
  if (!a || !b) return null;
  if ((isDoor(id) || isTrapdoor(id) || isFenceGate(id)) && a.open !== b.open) return b.open ? 'block_open' : 'block_close';
  if ((isLever(id) || isButton(id) || isTripwireHook(id)) && a.powered !== b.powered) return b.powered ? 'block_activate' : 'block_deactivate';
  if (isPressurePlate(id)) {
    const pa = (a.powered ?? a.power ?? 0) > 0, pb = (b.powered ?? b.power ?? 0) > 0;
    if (pa !== pb) return pb ? 'block_activate' : 'block_deactivate';
    return null;
  }
  if (isPiston(id) && a.extended !== b.extended) return b.extended ? 'block_activate' : 'block_deactivate';
  if (isNoteBlock(id) && !a.powered && b.powered) return 'note_block_play';
  return null;
}

/** Jugador al que se atribuye una vibración (él mismo, o el dueño de su flecha o de lo que tiró). */
export function playerOf(src: VibrationSource): string | null {
  if (typeof src.who === 'string') return src.who;
  if (typeof src.owner === 'string') return src.owner;
  return null;
}

function shooterOf(e: Entity): string | number | null {
  return e.shooter ?? e.owner ?? null;
}

/** ¿Se puede estar de pie sobre este bloque? */
function standsOn(id: number): boolean {
  return id < 0 || (id > 0 && BLOCK_SOLID[id] === 1) || occludesVibrations(id) || isSoulGround(id);
}


// ------------------------------------------------------------------ bloques que oyen (registro en la redstone)

/** Al colocarse, quitarse o cargar su chunk, los sensores y chilladores se apuntan o se borran. */
function listenerChanged(api: RedstoneApi, x: number, y: number, z: number, old: number, id: number): void {
  const v = SYSTEMS.get(api);
  if (!v) return;
  const isNow = isAnySensor(id) || isShrieker(id);
  if (isNow) v.addBlockListener(x, y, z);
  else v.removeBlockListener(x, y, z);
  // Guardado a medio activarse o chillando: que vuelva a su estado de reposo.
  if (old === -1 && isNow && (sensorPhase(id) > PHASE_INACTIVE || shriekerProps(id).shrieking)) api.schedule(x, y, z, 1);
}

registerRedstone([SCULK_SENSOR, CALIBRATED_SCULK_SENSOR], {
  changed: listenerChanged,
  // Activo → enfriándose (10 ticks, sin potencia) → en reposo.
  tick: (api, x, y, z, id) => {
    const phase = sensorPhase(id);
    if (phase === PHASE_ACTIVE) {
      api.setData(x, y, z, 0);
      api.setBlock(x, y, z, sensorWithPhase(id, PHASE_COOLDOWN));
      api.schedule(x, y, z, SENSOR_COOLDOWN_TICKS);
      api.outputChanged(x, y, z);
      api.analogChanged(x, y, z);
    } else if (phase === PHASE_COOLDOWN) api.setBlock(x, y, z, sensorWithPhase(id, PHASE_INACTIVE));
  },
});
registerRedstone(SCULK_SHRIEKER, { changed: listenerChanged });

/** El chillador termina de chillar (lo registra sculk.ts con lo que pasa después). */
export function registerShriekerTick(fn: (api: RedstoneApi, x: number, y: number, z: number, id: number) => void): void {
  registerRedstone(SCULK_SHRIEKER, { tick: fn });
}

