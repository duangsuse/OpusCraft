// Fase 8 (dimensiones): el anfitrión de todas las dimensiones de una sala. Cada dimensión es un GameServer
// completo (su mundo, sus criaturas, sus sistemas y su parte de lo guardado: ver scopeStore); el
// anfitrión decide en cuál entra cada conexión (la del registro del jugador), las pasa de una a otra
// cuando alguien viaja (portal, reaparición, comandos… y lo que venga) y reparte lo común: el chat, el
// límite de jugadores, la hora y la dificultad. Las dimensiones sin nadie no avanzan.
//
// Es lo que usan el Durable Object de Cloudflare y el servidor local; GameServer sigue valiendo solo (con
// una única dimensión) para las pruebas.
import { GameServer, type GameServerOptions, type DimensionHub, type Conn, type Arrival } from './GameServer';
import { scopeStore, type ServerStore } from './store';
import { sanitizeName, type ServerMsg } from '../protocol';
import type { PlayerRecord, Session } from './server/context';
import { DIM_OVERWORLD, isDimension } from '../dimensions';

/** Conexiones que aún no han dicho quiénes son: se cierran si tardan (ms). */
const HELLO_TIMEOUT = 40_000;

export type MultiverseOptions = Omit<GameServerOptions, 'dim' | 'hub'>;

export class Multiverse {
  private servers = new Map<number, GameServer>();
  /** Servidor (dimensión) de cada conexión que ya entró. */
  private owner = new Map<Conn, GameServer>();
  /** Conexiones que aún no han mandado su saludo (y cuándo llegaron). */
  private pending = new Map<Conn, number>();
  private hub: DimensionHub;
  private now: () => number;

  constructor(private store: ServerStore, private opts: MultiverseOptions = {}) {
    this.now = opts.now ?? Date.now;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const mv = this;
    this.hub = {
      travel: (from, s, dim, arrival) => mv.travel(from, s, dim, arrival),
      broadcastAll: (msg, except) => mv.broadcastAll(msg, except),
      totalPlayers: () => mv.playerCount,
      evictName: (from, name) => {
        for (const g of mv.servers.values()) if (g !== from) g.kickName(name);
      },
      sharedChanged: (from) => {
        for (const g of mv.servers.values()) if (g !== from) g.reloadShared();
      },
      anchorRespawn: (dim, x, y, z) => mv.server(dim).anchorRespawn(x, y, z), // Fase 8.5
    };
    this.server(DIM_OVERWORLD);
  }

  /** Servidor de una dimensión (se crea la primera vez que hace falta). */
  server(dim: number): GameServer {
    let g = this.servers.get(dim);
    if (!g) {
      g = new GameServer(scopeStore(this.store, dim), { ...this.opts, dim, hub: this.hub });
      this.servers.set(dim, g);
    }
    return g;
  }

  /** El mundo normal (el que existía antes de las dimensiones). */
  get overworld(): GameServer {
    return this.server(DIM_OVERWORLD);
  }

  get seed(): number {
    return this.overworld.seed;
  }

  get playerCount(): number {
    let n = 0;
    for (const g of this.servers.values()) n += g.playerCount;
    return n;
  }

  get connectionCount(): number {
    let n = this.pending.size;
    for (const g of this.servers.values()) n += g.connectionCount;
    return n;
  }

  isKnown(conn: Conn): boolean {
    return this.pending.has(conn) || !!this.owner.get(conn)?.isKnown(conn);
  }

  /** Dimensión en la que está una conexión (-1 si aún no ha entrado). */
  dimensionOf(conn: Conn): number {
    return this.owner.get(conn)?.dim ?? -1;
  }

  connect(conn: Conn): void {
    this.pending.set(conn, this.now());
  }

  disconnect(conn: Conn): void {
    this.pending.delete(conn);
    const g = this.owner.get(conn);
    this.owner.delete(conn);
    g?.disconnect(conn);
  }

  message(conn: Conn, data: string | ArrayBuffer): void {
    const g = this.owner.get(conn);
    if (g) {
      g.message(conn, data);
      return;
    }
    if (!this.pending.has(conn)) return;
    // El primer mensaje decide la dimensión: la del registro de quien saluda.
    this.pending.delete(conn);
    const target = this.server(this.dimensionFor(data));
    this.owner.set(conn, target);
    target.connect(conn);
    target.message(conn, data);
  }

  /** Dimensión guardada del jugador que saluda con `data` (el mundo normal si no hay o no se entiende). */
  private dimensionFor(data: string | ArrayBuffer): number {
    if (typeof data !== 'string') return DIM_OVERWORLD;
    try {
      const msg = JSON.parse(data) as { t?: unknown; name?: unknown };
      if (msg.t !== 'hello' || typeof msg.name !== 'string') return DIM_OVERWORLD;
      const raw = this.store.loadPlayer(sanitizeName(msg.name).toLowerCase());
      if (!raw) return DIM_OVERWORLD;
      const rec = JSON.parse(raw) as PlayerRecord;
      return isDimension(rec.dim) ? rec.dim : DIM_OVERWORLD;
    } catch {
      return DIM_OVERWORLD;
    }
  }

  /** Lleva un jugador de una dimensión a otra. */
  private travel(from: GameServer, s: Session, dim: number, arrival: Arrival): void {
    const t = from.detach(s.conn);
    if (!t) return;
    const to = this.server(dim);
    this.owner.set(t.conn, to);
    to.attach(t, arrival);
  }

  private broadcastAll(msg: ServerMsg, except?: Session): void {
    for (const g of this.servers.values()) g.broadcastHere(msg, except);
  }

  /** Avanza un tick las dimensiones en las que hay alguien. */
  tick(): void {
    const now = this.now();
    for (const [conn, at] of this.pending) {
      if (now - at < HELLO_TIMEOUT) continue;
      this.pending.delete(conn);
      try {
        conn.close(4002, 'timeout');
      } catch {
        /* ya cerrada */
      }
    }
    for (const g of this.servers.values()) if (g.connectionCount > 0) g.tick();
    // Conexiones que su servidor ya soltó (echadas, caducadas).
    for (const [conn, g] of this.owner) if (!g.isKnown(conn)) this.owner.delete(conn);
  }

  flush(all: boolean): void {
    for (const g of this.servers.values()) g.flush(all);
  }
}
