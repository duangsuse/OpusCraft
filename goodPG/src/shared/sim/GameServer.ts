// Servidor de juego autoritativo, independiente del transporte: lo usa el Durable Object de
// Cloudflare (multijugador) y un Web Worker en el navegador (modo un jugador).
//
// Este archivo sólo orquesta: conexiones y sesiones, reparto de mensajes (server/messageRouter.ts), el
// bucle de 20 ticks/s y el guardado. Los sistemas (server/systems.ts) viven en la carpeta server/ y
// sólo ven un ServerContext (ver server/context.ts).
import { hardBosses, BOSS_MODES, type BossMode } from '../bossRules'; // jefes reforzados
import { enderFromWire } from './server/containerSystem'; // Fase 8.6
import { stackToWire } from '../protocol';
import {
  PROTOCOL_VERSION, MAX_PLAYERS, MAX_CHAT, STATE_DEAD, encodeEdits, sanitizeName, sanitizeColor, worldTimeAt,
  type ClientMsg, type ServerMsg, type PlayerInfo, type WorldTime,
} from '../protocol';
import { CHUNK_SIZE } from '../constants';
import { AIR, isValidBlockId } from '../blocks';
import { sunHeightAt, rainAt } from '../weather';
import { WorldSim } from './WorldSim';
import { FluidSim, type FluidWorld } from './fluids';
import { Entities, type EntityHost, type PlayerView } from './entities';
import { blockDrops } from './drops';
import { migrateStore, type ServerStore } from './store';
import {
  TICK_RATE, DAY_RATE, SIM_RADIUS, r2, type Conn, type Session, type PlayerRecord, type ServerContext, type Arrival,
} from './server/context';
import { DIM_OVERWORLD, DIM_NETHER, DIM_END, dimensionDef, type DimensionDef } from '../dimensions'; // Fase 8 (dimensiones)
import type { PlayerSave } from '../protocol';
import { fallsThrough } from './server/blockRules';
import { potionView } from './server/potionPlayers'; // Fase 7 (pociones)
import { ServerSystems } from './server/systems';
import { routeMessage, type RouterHost } from './server/messageRouter';
import { applyPos, sanitizeSave, handPotions, playerInfo } from './server/playerState';
export { TICK_RATE, type Conn, type Arrival };
export { canSleepAt } from './server/beds';

/** Chunks generados como máximo por tick (la generación es lo más caro). */
const GEN_PER_TICK = 2;
/**
 * Tamaño máximo de un mensaje. Fase 6.5 (libros y estandartes): los libros escritos viajan con el
 * inventario, así que el estado del jugador puede pasar de 16 KB (1 MB es el límite de Cloudflare).
 */
const MAX_MESSAGE = 1 << 20;
const STALE_MS = 40_000;

export interface GameServerOptions {
  seed?: number;
  /** Reloj en ms (por defecto Date.now). */
  now?: () => number;
  /** Modo un jugador: sin límite de ritmo ni comprobaciones de distancia estrictas. */
  local?: boolean;
  /** Segundos entre guardados (las escrituras cuestan en el plan gratuito de Cloudflare). */
  flushSeconds?: number;
  /** Azar del servidor y de las criaturas (por defecto Math.random; las pruebas pasan uno con semilla). */
  rand?: () => number;
  /** Fase 8: dimensión de este servidor (por defecto el mundo normal). */
  dim?: number;
  /** Fase 8: el anfitrión de las dimensiones (sin él, sólo hay esta y no se viaja). */
  hub?: DimensionHub;
}

/** Fase 8 (dimensiones): lo que el anfitrión de las dimensiones (Multiverse) ofrece a cada servidor. */
export interface DimensionHub {
  /** Lleva al jugador a otra dimensión: lo saca de este servidor y lo mete en el de destino. */
  travel(from: GameServer, s: Session, dim: number, arrival: Arrival): void;
  /** Mensaje para los jugadores de todas las dimensiones. */
  broadcastAll(msg: ServerMsg, except?: Session): void;
  /** Jugadores en todas las dimensiones (el límite es de la sala). */
  totalPlayers(): number;
  /** Echa de las otras dimensiones a quien use ese nombre (entra desde otra ventana). */
  evictName(from: GameServer, name: string): void;
  /** Cambió la hora o la dificultad: que lo sepan las demás dimensiones. */
  sharedChanged(from: GameServer): void;
  /** Fase 8.5: reaparecer en el nexo de (x, y, z) de la dimensión `dim` (gasta una carga): dónde, o null. */
  anchorRespawn(dim: number, x: number, y: number, z: number): [number, number, number] | null;
}

/** Fase 8: lo que viaja con un jugador de una dimensión a otra. */
export interface Traveler {
  conn: Conn;
  id: string;
  name: string;
  shirt: string;
  mode: 's' | 'c';
  save: PlayerSave | null;
  bed: [number, number, number] | null;
  /** Fase 8.5: dimensión del punto de reaparición. */
  bedDim?: number;
}

export class GameServer {
  readonly world: WorldSim;
  readonly entities: Entities;
  private fluids: FluidSim;
  private fluidWorld: FluidWorld;
  private store: ServerStore;
  private sessions = new Map<Conn, Session>();
  private time: WorldTime;
  private difficulty = 2;
  /** Jefes reforzados (bossRules.ts): auto (en difícil), java o duros. Se guarda con el mundo. */
  private bossMode: BossMode = 'auto';
  private defaultMode: 's' | 'c' | null = null;
  /** Cambios de bloques por enviar: [x, y, z, id, jugador que lo hizo o null]. */
  private queue: [number, number, number, number, string | null][] = [];
  private actor: string | null = null;
  private tickCount = 0;
  private spawnPoint: [number, number, number] | null = null;
  private now: () => number;
  private local: boolean;
  private rand = Math.random;
  private lastMobSave = 0;
  private nextSessionId = 1;
  private flushTicks: number;
  /** Fase 8: dimensión de este servidor y el anfitrión de las dimensiones. */
  readonly dim: number;
  readonly dimDef: DimensionDef;
  private hub: DimensionHub | null;

  /** Los sistemas (reglas de bloques, naturaleza, contenedores, redstone, criaturas…). */
  readonly sys: ServerSystems;
  private ctx: ServerContext;
  private router: RouterHost;

  constructor(store: ServerStore, opts: GameServerOptions = {}) {
    this.store = store;
    // Mundos guardados con bloques de 1 byte: pasarlos al formato de 16 bits antes de leerlos.
    migrateStore(store);
    this.now = opts.now ?? Date.now;
    if (opts.rand) this.rand = opts.rand;
    this.local = !!opts.local;
    this.flushTicks = Math.max(1, Math.round((opts.flushSeconds ?? 30) * TICK_RATE));
    this.dim = opts.dim ?? DIM_OVERWORLD;
    this.fluids = new FluidSim(dimensionDef(this.dim).fastLava); // Fase 8.2: la lava rápida del Nether
    this.dimDef = dimensionDef(this.dim);
    this.hub = opts.hub ?? null;
    let seed = Number(store.getMeta('seed'));
    if (!store.getMeta('seed') || !Number.isFinite(seed)) {
      seed = opts.seed ?? ((Math.random() * 0x7fffffff) | 0);
      store.setMeta('seed', String(seed));
    }
    this.time = { base: 0.08, at: this.now(), rate: DAY_RATE };
    try {
      const t = JSON.parse(store.getMeta('time') ?? '') as WorldTime;
      if (Number.isFinite(t.base) && Number.isFinite(t.at)) this.time = { base: t.base, at: t.at, rate: DAY_RATE };
    } catch {
      store.setMeta('time', JSON.stringify(this.time));
    }
    const d = Number(store.getMeta('difficulty'));
    if (store.getMeta('difficulty') !== null && Number.isInteger(d) && d >= 0 && d <= 3) this.difficulty = d;
    const bm = store.getMeta('bossMode');
    if (bm && (BOSS_MODES as readonly string[]).includes(bm)) this.bossMode = bm as BossMode;
    const m = store.getMeta('mode');
    if (m === 's' || m === 'c') this.defaultMode = m;
    this.world = new WorldSim(seed | 0, store, this.dim);
    this.world.onChange = (x, y, z, old, id) => this.onBlockChanged(x, y, z, old, id);
    // Fase 8.2: los fluidos que el generador deja corriendo (manantiales de lava del Nether) empiezan al cargarse.
    this.world.onFluidTicks = (t) => {
      for (let i = 0; i < t.length; i += 3) this.fluids.schedule(t[i], t[i + 1], t[i + 2], 1);
    };
    this.fluidWorld = {
      getBlock: (x, y, z) => this.world.getBlock(x, y, z),
      setBlock: (x, y, z, id) => {
        this.world.setBlock(x, y, z, id);
      },
      washAway: (x, y, z, id) => this.entities.dropStacks(blockDrops(id, 0, this.rand), x + 0.5, y + 0.3, z + 0.5),
    };
    this.entities = new Entities(this.makeHost());
    this.entities.rand = this.rand;
    this.entities.restorePassive(store.getMeta('mobs'));

    this.ctx = this.makeContext();
    this.sys = new ServerSystems(this.ctx, store);
    this.router = {
      ctx: this.ctx,
      sys: this.sys,
      onPos: (s, msg) => this.onPos(s, msg),
      onState: (s, d) => this.onState(s, d),
      onChat: (s, m) => this.onChat(s, m),
    };
  }

  get seed(): number {
    return this.world.seed;
  }

  get playerCount(): number {
    let n = 0;
    for (const s of this.sessions.values()) if (s.joined) n++;
    return n;
  }

  get connectionCount(): number {
    return this.sessions.size;
  }

  isKnown(conn: Conn): boolean {
    return this.sessions.has(conn);
  }

  // ------------------------------------------------------------------ contexto de los sistemas

  private makeContext(): ServerContext {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const gs = this;
    return {
      world: this.world,
      entities: this.entities,
      dim: this.dim,
      travel: (s, dim, arrival) => {
        if (!this.hub || dim === this.dim || !s.joined) return false;
        this.hub.travel(this, s, dim, arrival);
        return true;
      },
      local: this.local,
      get seed() {
        return gs.seed;
      },
      get tickCount() {
        return gs.tickCount;
      },
      get playerCount() {
        return gs.playerCount;
      },
      get difficulty() {
        return gs.difficulty;
      },
      rand: () => this.rand(),
      now: () => this.now(),
      worldTime: () => this.worldTime(),
      sessions: () => this.sessions.values(),
      send: (s, msg) => this.send(s, msg),
      sendRaw: (s, data) => this.sendRaw(s, data),
      broadcast: (msg, except) => this.broadcast(msg, except),
      tell: (s, m) => this.send(s, { t: 'chat', id: null, name: '', m }),
      fx: (kind, x, y, z, a, b) => this.fx(kind, x, y, z, a, b),
      allow: (s, cost) => this.allow(s, cost),
      reachOk: (s, x, y, z, max) => this.reachOk(s, x, y, z, max),
      reject: (s, x, y, z) => this.reject(s, x, y, z),
      asActor: (id, fn) => {
        const prev = this.actor;
        this.actor = id;
        try {
          return fn();
        } finally {
          this.actor = prev;
        }
      },
      savePlayer: (s) => this.savePlayer(s),
      setTime: (days) => this.setTime(days),
      get bossMode() {
        return gs.bossMode;
      },
      setBossMode: (m) => {
        this.bossMode = m;
        this.store.setMeta('bossMode', m);
      },
      setDifficulty: (dd) => {
        this.difficulty = dd;
        this.store.setMeta('difficulty', String(dd));
        this.broadcast({ t: 'diff', d: dd });
        this.hub?.sharedChanged(this);
      },
      markCollected: (id, who) => this.sys.entitySync.markCollected(id, who),
    };
  }

  // ------------------------------------------------------------------ anfitrión de entidades

  private makeHost(): EntityHost {
    return {
      world: this.world,
      players: () => this.playerViews(),
      // Fase 8: sin cielo no hay sol (los muertos vivientes no arden) ni lluvia.
      sunHeight: () => (this.dimDef.sky ? sunHeightAt(this.worldTime()) : -1),
      worldTime: () => this.worldTime(),
      raining: () => (this.dimDef.weather ? rainAt(this.worldTime(), this.seed) : 0),
      difficulty: () => this.difficulty,
      hardBosses: () => hardBosses(this.bossMode, this.difficulty),
      hurtPlayer: (id, amount, kx, ky, kz, cause, src) => {
        for (const s of this.sessions.values()) {
          if (s.id !== id || !s.joined || s.mode === 'c' || s.s & STATE_DEAD) continue;
          const th = src ? this.sys.enchantWork.thorns(s, src) : 0; // Fase 7 (encantamientos): Espinas
          this.send(s, { t: 'hurt', a: Math.round(amount * 10) / 10, k: [r2(kx), r2(ky), r2(kz)], c: cause, ...(th ? { th } : {}) });
        }
      },
      fx: (kind, x, y, z, a, b) => this.fx(kind, x, y, z, a, b),
      // Fase 8.6: la perla de ender lleva a su dueño a donde cae.
      teleportPlayer: (id, x, y, z) => {
        for (const s of this.sessions.values()) {
          if (s.id !== id || !s.joined || s.s & STATE_DEAD) continue;
          s.p = [x, y, z];
          this.send(s, { t: 'moveTo', p: [r2(x), r2(y), r2(z)] });
        }
      },
      breakBlock: (x, y, z, drop) => {
        const id = this.world.getBlock(x, y, z);
        if (id <= 0) return;
        this.world.setBlock(x, y, z, AIR);
        if (drop) this.entities.dropStacks(blockDrops(id, 0, this.rand), x + 0.5, y + 0.3, z + 0.5);
      },
      trample: (x, y, z) => this.sys.farming.trample(x, y, z),
      landBlock: (x, y, z, block) => {
        const cur = this.world.getBlock(x, y, z);
        if (cur >= 0 && fallsThrough(cur) && isValidBlockId(block)) this.world.setBlock(x, y, z, block);
        else this.entities.dropStacks([{ id: block, count: 1 }], x + 0.5, y + 0.5, z + 0.5);
      },
      giveXp: (id, n) => {
        for (const s of this.sessions.values()) if (s.id === id && s.joined) this.send(s, { t: 'xp', n });
      },
      // Fase 7 (redstone): proyectiles que se clavan (diana, botones de madera).
      igniteBlock: (x, y, z) => this.sys?.fire.ignite(x, y, z) ?? false, // Fase 8.3: bolas de fuego
      projectileHit: (kind, bx, by, bz, px, py, pz, fire) => {
        this.sys?.redstone.projectileHit(kind, bx, by, bz, px, py, pz);
        this.sys?.mechanisms.projectileHit(kind, bx, by, bz, !!fire); // Fase 7 (mecanismos): flechas en llamas y dinamita
      },
      // Fase 6 (monstruos): efectos de estado que causan las criaturas (los aplica el cliente).
      // Fase 7 (pociones): las pociones también afectan a los jugadores en creativo (`creativeToo`).
      effectPlayer: (id, effect, seconds, amp, creativeToo) => {
        for (const s of this.sessions.values()) {
          if (s.id !== id || !s.joined || (s.mode === 'c' && !creativeToo) || s.s & STATE_DEAD) continue;
          this.send(s, { t: 'effect', id: effect, s: seconds, a: amp });
        }
      },
    };
  }

  private playerViews(): PlayerView[] {
    const now = this.now();
    const out: PlayerView[] = [];
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      out.push({
        id: s.id, name: s.name, x: s.p[0], y: s.p[1], z: s.p[2], alive: !(s.s & STATE_DEAD), creative: s.mode === 'c',
        lookingAt: s.lookUntil > now ? s.lookAt : -1, held: s.h,
        head: s.a[0], // Fase 6.5 (colecciones)
        armor: s.a, offhand: s.o, // Fase 8.3 (criaturas del Nether): el oro que calma a los piglins y lo que atrae al strider
        ...potionView(s), // Fase 7 (pociones): invisible, armadura, efectos y vida
      });
    }
    return out;
  }

  private worldTime(): number {
    return worldTimeAt(this.time, this.now());
  }

  private fx(kind: string, x: number, y: number, z: number, a?: number, b?: number): void {
    this.sys?.heard(kind, x, y, z, a); // campanas, vibraciones, notas que oyen los alays…
    const msg: ServerMsg = { t: 'fx', k: kind, p: [r2(x), r2(y), r2(z)] };
    if (a !== undefined) msg.a = a;
    if (b !== undefined) msg.b = b;
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const dx = s.p[0] - x, dz = s.p[2] - z;
      if (dx * dx + dz * dz < 64 * 64) this.sendRaw(s, data);
    }
  }

  // ------------------------------------------------------------------ envío

  private sendRaw(s: Session, data: string | ArrayBuffer): void {
    try {
      s.conn.send(data);
    } catch {
      /* conexión cerrada */
    }
  }

  private send(s: Session, msg: ServerMsg): void {
    this.sendRaw(s, JSON.stringify(msg));
  }

  private broadcast(msg: ServerMsg, except?: Session): void {
    const data = JSON.stringify(msg);
    for (const s of this.sessions.values()) if (s.joined && s !== except) this.sendRaw(s, data);
  }

  /** Envía las ediciones pendientes respetando el orden en que se aplicaron. */
  private flushQueue(): void {
    const q = this.queue;
    if (q.length === 0) return;
    this.queue = [];
    let batch: number[] = [];
    const sendBatch = () => {
      if (batch.length) this.broadcast({ t: 'sets', l: batch });
      batch = [];
    };
    for (const [x, y, z, b, who] of q) {
      if (who) {
        sendBatch();
        this.broadcast({ t: 'set', id: who, x, y, z, b });
      } else batch.push(x, y, z, b);
    }
    sendBatch();
  }

  // ------------------------------------------------------------------ conexiones

  connect(conn: Conn): void {
    const now = this.now();
    this.sessions.set(conn, {
      conn, id: (this.nextSessionId++).toString(36) + Math.random().toString(36).slice(2, 7), joined: false,
      joinedAt: now, lastMsg: now, name: '', shirt: '#3a7bd5', p: [0, 100, 0], r: [0, 0], s: 0, h: 0, o: 0, a: [0, 0, 0, 0], mode: 's',
      lookAt: -1, lookUntil: 0, lastAttack: 0, tokens: 60, tokenTime: now, known: new Map(), container: null,
      save: null, saveDirty: false, sleeping: null, sleepTicks: 0, bed: null,
    });
  }

  disconnect(conn: Conn): void {
    const s = this.sessions.get(conn);
    if (!s) return;
    this.sessions.delete(conn);
    if (!s.joined) return;
    this.sys.onLeave(s);
    this.savePlayer(s);
    this.broadcast({ t: 'leave', id: s.id });
    this.chatAll({ t: 'chat', id: null, name: '', m: `${s.name} salió del mundo.` });
    if (this.playerCount === 0) this.flush(true);
  }

  /** Fase 8: chat y avisos para todas las dimensiones. */
  private chatAll(msg: ServerMsg, except?: Session): void {
    if (this.hub) this.hub.broadcastAll(msg, except);
    else this.broadcast(msg, except);
  }

  /** Fase 8: manda un mensaje a todos los jugadores de este servidor (para el anfitrión). */
  broadcastHere(msg: ServerMsg, except?: Session): void {
    this.broadcast(msg, except);
  }

  /** Fase 8: echa a quien use este nombre (entró desde otra ventana, quizá en otra dimensión). */
  kickName(name: string, except?: Session): void {
    for (const other of [...this.sessions.values()]) {
      if (other === except || !other.joined || other.name.toLowerCase() !== name.toLowerCase()) continue;
      this.send(other, { t: 'error', m: 'Has entrado con este nombre desde otra ventana.' });
      this.disconnect(other.conn);
      try {
        other.conn.close(4005, 'replaced');
      } catch {
        /* ya cerrada */
      }
    }
  }

  /** Fase 8: la hora y la dificultad guardadas cambiaron en otra dimensión. */
  reloadShared(): void {
    try {
      const t = JSON.parse(this.store.getMeta('time') ?? '') as WorldTime;
      if (Number.isFinite(t.base) && Number.isFinite(t.at)) {
        this.time = { base: t.base, at: t.at, rate: DAY_RATE };
        this.broadcast({ t: 'time', time: this.time, now: this.now() });
      }
    } catch {
      /* sin hora guardada */
    }
    const d = Number(this.store.getMeta('difficulty'));
    if (this.store.getMeta('difficulty') !== null && Number.isInteger(d) && d >= 0 && d <= 3 && d !== this.difficulty) {
      this.difficulty = d;
      this.broadcast({ t: 'diff', d });
    }
  }

  // ------------------------------------------------------------------ Fase 8: viajes entre dimensiones

  /** Saca a un jugador de esta dimensión para llevarlo a otra (sin avisar de que salió del mundo). */
  detach(conn: Conn): Traveler | null {
    const s = this.sessions.get(conn);
    if (!s || !s.joined) return null;
    this.sys.onLeave(s);
    this.sessions.delete(conn);
    this.broadcast({ t: 'leave', id: s.id });
    if (this.playerCount === 0) this.flush(true);
    return { conn, id: s.id, name: s.name, shirt: s.shirt, mode: s.mode, save: s.save, bed: s.bed, bedDim: s.bedDim };
  }

  /** Mete en esta dimensión a un jugador que viene de otra, en el sitio que toca según cómo llega. */
  attach(t: Traveler, arrival: Arrival): void {
    const now = this.now();
    const s: Session = {
      conn: t.conn, id: t.id, joined: true, joinedAt: now, lastMsg: now, name: t.name, shirt: t.shirt, p: [0, 100, 0], r: [0, 0], s: 0,
      h: 0, o: 0, a: [0, 0, 0, 0], mode: t.mode, lookAt: -1, lookUntil: 0, lastAttack: 0, tokens: 60, tokenTime: now, known: new Map(),
      container: null, save: t.save, saveDirty: true, sleeping: null, sleepTicks: 0, bed: t.bed, bedDim: t.bedDim, dimPending: true,
    };
    this.sessions.set(t.conn, s);
    // Fase 8.6: la plataforma de llegada del End (salvo a unas coordenadas concretas).
    if (this.dim === DIM_END && !(arrival.kind === 'pos' && Number.isFinite(arrival.x))) this.sys.endGoods.rebuildPlatform();
    s.p = this.arrivalPos(s, arrival);
    if (arrival.kind === 'portal') this.sys.portals.justArrived(s);
    if (s.save) s.save = { ...s.save, pos: [s.p[0], s.p[1], s.p[2]] };
    this.savePlayer(s);
    this.welcome(s, true);
  }

  /**
   * Fase 8.5: el jugador muerto pide reaparecer (donde el cliente no lo resuelve solo: en el Nether o con el
   * punto de reaparición en otra dimensión). Con un nexo de reaparición cargado en el Nether, allí (gasta una
   * carga); si no vale, se pierde el punto y se va a la cama o al punto de aparición del mundo normal.
   */
  private respawn(s: Session): void {
    if (s.bed && s.bedDim === DIM_NETHER) {
      const [x, y, z] = s.bed;
      const at = this.dim === DIM_NETHER ? this.sys.netherGoods.respawnAt(x, y, z) : this.hub?.anchorRespawn(DIM_NETHER, x, y, z) ?? null;
      if (at) {
        if (this.dim === DIM_NETHER) {
          s.p = at;
          this.send(s, { t: 'respawnAt', p: at });
        } else this.ctx.travel(s, DIM_NETHER, { kind: 'pos', x: at[0], y: at[1], z: at[2] });
        return;
      }
      s.bed = null;
      s.bedDim = DIM_OVERWORLD;
      this.savePlayer(s);
      this.send(s, { t: 'spawn', p: null });
      this.ctx.tell(s, 'No tenías cama o nexo de reaparición cargado, o estaba obstruido.');
    }
    if (this.dim !== DIM_OVERWORLD) {
      this.ctx.travel(s, DIM_OVERWORLD, { kind: 'spawn' });
      return;
    }
    const p = this.arrivalPos(s, { kind: 'spawn' });
    s.p = p;
    this.send(s, { t: 'respawnAt', p });
  }

  /** Fase 8.5: reaparición en un nexo de esta dimensión (lo pide otra dimensión a través del anfitrión). */
  anchorRespawn(x: number, y: number, z: number): [number, number, number] | null {
    return this.sys.netherGoods.respawnAt(x, y, z);
  }

  /** Dónde aparece quien llega. */
  private arrivalPos(s: Session, arrival: Arrival): [number, number, number] {
    if (arrival.kind === 'portal') {
      const p = this.sys.portals.arrive(arrival.x, arrival.y, arrival.z, arrival.axis);
      return [p[0], p[1], p[2]];
    }
    if (arrival.kind === 'pos' && [arrival.x, arrival.y, arrival.z].every(Number.isFinite)) return [arrival.x!, arrival.y!, arrival.z!];
    if (arrival.kind === 'spawn' && s.bed && (s.bedDim ?? DIM_OVERWORLD) === this.dim) return [s.bed[0] + 0.5, s.bed[1] + 0.5625, s.bed[2] + 0.5];
    const sp = this.spawn();
    return [sp[0], sp[1] + 0.1, sp[2]];
  }

  private spawn(): [number, number, number] {
    if (!this.spawnPoint) {
      const sp = this.world.gen.findSpawn();
      this.spawnPoint = [sp.x, sp.y, sp.z];
    }
    return this.spawnPoint;
  }

  message(conn: Conn, data: string | ArrayBuffer): void {
    const s = this.sessions.get(conn);
    if (!s || typeof data !== 'string' || data.length > MAX_MESSAGE) return;
    let msg: ClientMsg;
    try {
      const parsed: unknown = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      msg = parsed as ClientMsg;
    } catch {
      return;
    }
    s.lastMsg = this.now();
    try {
      this.handle(s, msg);
    } catch (err) {
      console.error('Error procesando mensaje', err);
    }
    this.sys.redstone.flush(); // Fase 7 (redstone): la redstone reacciona en el acto a lo que hizo el jugador
    this.flushQueue();
  }

  private allow(s: Session, cost: number): boolean {
    if (this.local) return true;
    const now = this.now();
    s.tokens = Math.min(80, s.tokens + ((now - s.tokenTime) / 1000) * 40);
    s.tokenTime = now;
    if (s.tokens < cost) return false;
    s.tokens -= cost;
    return true;
  }

  /** Reparte cada mensaje a su sistema. */
  private handle(s: Session, msg: ClientMsg): void {
    if (msg.t === 'hello') {
      this.onHello(s, msg);
      return;
    }
    if (msg.t === 'ping') {
      this.send(s, { t: 'pong', c: Number(msg.c) || 0, now: this.now() });
      return;
    }
    // Fase 8: hasta que su cliente monte esta dimensión, lo que mande es de la anterior.
    if (msg.t === 'dimok') {
      if (msg.d === this.dim) s.dimPending = false;
      return;
    }
    if (!s.joined || s.dimPending) return;
    if (msg.t === 'respawn') {
      this.respawn(s);
      return;
    }
    routeMessage(this.router, s, msg);
  }

  // ------------------------------------------------------------------ jugadores

  private onHello(s: Session, msg: Extract<ClientMsg, { t: 'hello' }>): void {
    if (s.joined) return;
    if (msg.v !== PROTOCOL_VERSION) {
      this.send(s, { t: 'error', m: 'Versión del juego desactualizada: recarga la página.' });
      s.conn.close(4000, 'version');
      return;
    }
    this.sweepStale(true);
    const name = sanitizeName(msg.name);
    // Mismo nombre conectado: la conexión nueva sustituye a la antigua (p. ej. tras un corte), esté en la
    // dimensión que esté.
    this.kickName(name, s);
    this.hub?.evictName(this, name);
    if ((this.hub?.totalPlayers() ?? this.playerCount) >= MAX_PLAYERS) {
      this.send(s, { t: 'error', m: `La sala está llena (máximo ${MAX_PLAYERS} jugadores).` });
      s.conn.close(4001, 'full');
      return;
    }
    if (!this.defaultMode) {
      this.defaultMode = msg.mode === 'c' ? 'c' : 's';
      this.store.setMeta('mode', this.defaultMode);
    }
    s.name = name;
    s.shirt = sanitizeColor(msg.shirt);
    const rec = this.loadRecord(name);
    s.mode = rec?.mode ?? this.defaultMode;
    s.save = rec?.save ?? null;
    const bed = rec?.bed;
    s.bed = Array.isArray(bed) && bed.length === 3 && bed.every(Number.isInteger) ? bed : null;
    s.bedDim = Number.isInteger(rec?.bedDim) ? rec!.bedDim : DIM_OVERWORLD; // Fase 8.5
    s.ender = enderFromWire(rec?.ender); // Fase 8.6
    if (s.save?.pos && s.save.pos.every(Number.isFinite)) s.p = [s.save.pos[0], s.save.pos[1], s.save.pos[2]];
    // Fase 8: sin posición guardada fuera del mundo normal, el punto de aparición de esta dimensión.
    else if (this.dim !== DIM_OVERWORLD) s.p = this.arrivalPos(s, { kind: 'pos' });
    s.joined = true;
    s.joinedAt = this.now();
    this.welcome(s);
  }

  /** Bienvenida a esta dimensión: el estado del mundo y los demás jugadores. */
  private welcome(s: Session, arriving = false): void {
    const edits = this.world.allEdits();
    const players: PlayerInfo[] = [];
    for (const o of this.sessions.values()) if (o.joined && o !== s) players.push(playerInfo(o));
    this.send(s, {
      t: 'welcome', id: s.id, seed: this.seed, time: this.time, now: this.now(), players, editCount: edits.length,
      mode: s.mode, diff: this.difficulty, save: s.save, spawn: this.spawn(), bed: s.bed, bd: s.bedDim ?? DIM_OVERWORLD, rods: this.sys.fishing.active(),
      signs: this.sys.signs.all(),
      banners: this.sys.banners.all(), // Fase 6.5 (libros y estandartes)
      dim: this.dim, // Fase 8
      ...(arriving ? { at: [s.p[0], s.p[1], s.p[2]] as [number, number, number] } : {}),
    });
    this.sendRaw(s, encodeEdits(edits));
    this.broadcast({ t: 'join', p: playerInfo(s) }, s);
    this.sys.onJoin(s);
  }

  private loadRecord(name: string): PlayerRecord | null {
    const raw = this.store.loadPlayer(name.toLowerCase());
    if (!raw) return null;
    try {
      const r = JSON.parse(raw) as PlayerRecord;
      if (r.mode !== 's' && r.mode !== 'c') r.mode = this.defaultMode ?? 's';
      return r;
    } catch {
      return null;
    }
  }

  private savePlayer(s: Session): void {
    if (!s.joined) return;
    const rec: PlayerRecord = { mode: s.mode, save: s.save, bed: s.bed, bedDim: s.bedDim ?? DIM_OVERWORLD, dim: this.dim };
    if (s.ender?.slots.some(Boolean)) rec.ender = s.ender.slots.map((st) => stackToWire(st)); // Fase 8.6
    this.store.savePlayer(s.name.toLowerCase(), JSON.stringify(rec));
    s.saveDirty = false;
  }

  private onPos(s: Session, msg: Extract<ClientMsg, { t: 'pos' }>): void {
    if (!applyPos(s, msg)) return;
    this.broadcast({ t: 'pos', id: s.id, p: s.p, r: s.r, s: s.s, h: s.h, o: s.o, a: s.a, ...(s.ec ? { ec: s.ec } : {}), ...(s.g ? { g: s.g } : {}), ...handPotions(s) }, s);
  }

  /** Distancia del ojo del jugador al centro del bloque. */
  private reachOk(s: Session, x: number, y: number, z: number, max: number): boolean {
    if (this.local) return true;
    const dx = x + 0.5 - s.p[0], dy = y + 0.5 - (s.p[1] + 1.6), dz = z + 0.5 - s.p[2];
    return dx * dx + dy * dy + dz * dz <= max * max;
  }

  /** Rechaza una edición: devuelve al emisor el bloque real para deshacer su predicción. */
  private reject(s: Session, x: number, y: number, z: number): void {
    const cur = this.world.getBlock(x, y, z);
    if (cur >= 0) this.send(s, { t: 'sets', l: [x, y, z, cur] });
  }

  private onState(s: Session, d: unknown): void {
    const save = sanitizeSave(d);
    if (!save) return;
    if (!save.rb && s.save?.rb) save.rb = s.save.rb; // Fase 9: el libro sólo se manda cuando cambia
    s.save = save;
    s.saveDirty = true;
  }

  private onChat(s: Session, raw: unknown): void {
    if (typeof raw !== 'string') return;
    const m = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_CHAT);
    if (!m || !this.allow(s, 3)) return;
    if (m.startsWith('/')) {
      this.sys.commands.run(s, m);
      return;
    }
    this.chatAll({ t: 'chat', id: s.id, name: s.name, m }, s);
  }

  private setTime(days: number): void {
    if (!Number.isFinite(days)) return;
    this.time = { base: days, at: this.now(), rate: DAY_RATE };
    this.store.setMeta('time', JSON.stringify(this.time));
    this.broadcast({ t: 'time', time: this.time, now: this.now() });
    this.hub?.sharedChanged(this);
  }

  // ------------------------------------------------------------------ cambios de bloques

  /** Cada cambio de bloque (de quien sea) se difunde y avisa a los sistemas que dependen de él. */
  private onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    this.queue.push([x, y, z, id, this.actor]);
    this.fluids.onBlockChanged(this.fluidWorld, x, y, z);
    this.sys?.blockChanged(x, y, z, old, id, this.actor);
  }

  // ------------------------------------------------------------------ bucle

  /** Avanza un tick (1/20 s). Llamar a 20 Hz mientras haya jugadores. */
  tick(): void {
    this.tickCount++;
    const now = this.now();
    this.loadChunks(now);
    // Fases de Java: ticks programados de los bloques, fluidos y luego lo demás (ServerSystems.tick).
    this.sys.redstone.handlingTick = true; // hasta que acaben los eventos de bloque
    this.sys.redstone.tickScheduled();
    this.fluids.step(this.fluidWorld);
    this.sys.tick(this.tickCount);
    this.flushQueue();
    if (this.tickCount % 2 === 0) this.sys.entitySync.sync();
    if (this.tickCount % (TICK_RATE * 5) === 0) this.sweepStale(false);
    if (this.tickCount % this.flushTicks === 0) this.flush(false);
    if (this.tickCount % (TICK_RATE * 10) === 0) {
      this.world.unloadUnused(now, (cx, cz) => this.nearPlayer(cx, cz, SIM_RADIUS + 2));
    }
  }

  private nearPlayer(cx: number, cz: number, r: number): boolean {
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      if (Math.abs(cx - pcx) <= r && Math.abs(cz - pcz) <= r) return true;
    }
    return false;
  }

  /** Carga los chunks cercanos a los jugadores (los más próximos primero) y los marca en uso. */
  private loadChunks(now: number): void {
    let budget = GEN_PER_TICK;
    for (const s of this.sessions.values()) {
      if (!s.joined) continue;
      const pcx = Math.floor(s.p[0] / CHUNK_SIZE), pcz = Math.floor(s.p[2] / CHUNK_SIZE);
      for (let ring = 0; ring <= SIM_RADIUS; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const cx = pcx + dx, cz = pcz + dz;
            const c = this.world.getChunk(cx, cz);
            if (c) c.lastUsed = now;
            else if (budget > 0) {
              budget--;
              this.world.ensureChunk(cx, cz, now);
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ persistencia

  private sweepStale(force: boolean): void {
    if (this.local) return;
    const now = this.now();
    for (const s of [...this.sessions.values()]) {
      if (now - s.lastMsg > STALE_MS || (force && !s.joined && now - s.joinedAt > STALE_MS)) {
        this.disconnect(s.conn);
        try {
          s.conn.close(4002, 'timeout');
        } catch {
          /* ya cerrada */
        }
      }
    }
  }

  /** Guarda lo pendiente: ediciones, contenedores, jugadores y animales. */
  flush(all: boolean): void {
    this.world.flush();
    this.sys.flush(this.store);
    for (const s of this.sessions.values()) if (s.saveDirty) this.savePlayer(s);
    const now = this.now();
    if (all || now - this.lastMobSave > 60_000) {
      this.lastMobSave = now;
      this.store.setMeta('mobs', this.entities.serializePassive());
    }
  }

  /** Para pruebas y depuración. */
  stats(): { chunks: number; entities: number; fluids: number; containers: number; players: number } {
    return {
      chunks: this.world.loadedCount, entities: this.entities.list.size, fluids: this.fluids.pending,
      containers: this.sys.containers.count, players: this.playerCount,
    };
  }
}
