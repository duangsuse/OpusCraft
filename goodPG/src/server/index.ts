// Servidor multijugador en Cloudflare: un Worker enruta cada sala a un Durable Object (GameWorld)
// que ejecuta el servidor de juego autoritativo a 20 ticks/s mientras haya jugadores conectados, y
// guarda en SQLite las ediciones, los contenedores, los jugadores y los animales. Fase 8: una sala tiene
// varias dimensiones (Multiverse: un GameServer por dimensión, todas en el mismo objeto).
//
// Cada mundo avisa al directorio (WorldDirectory, un único objeto) de cuánta gente tiene conectada; la portada
// pide ahí cuántos mundos hay activos y cuántos jugadores (/api/stats). Un mundo sin nadie durante 48 horas se
// borra entero (una alarma que se pone al irse el último y se quita al entrar alguien).
import { DurableObject } from 'cloudflare:workers';
import { TICK_RATE, type Conn } from '../shared/sim/GameServer';
import { Multiverse } from '../shared/sim/Multiverse';
import type { ServerStore } from '../shared/sim/store';
import { regionFor, cityOf, type GeoInfo } from './region';

export interface Env {
  GAME_WORLDS: DurableObjectNamespace<GameWorld>;
  WORLD_DIRECTORY: DurableObjectNamespace<WorldDirectory>;
  /** Sólo para pruebas en local (.dev.vars): acorta el plazo de borrado (ms). */
  IDLE_DELETE_MS?: string;
}

/** Tiempo sin nadie tras el que un mundo se borra (48 horas). */
const IDLE_DELETE_MS = 48 * 60 * 60 * 1000;
const idleMs = (env: Env): number => {
  const v = Number(env.IDLE_DELETE_MS);
  return Number.isFinite(v) && v > 0 ? v : IDLE_DELETE_MS;
};

const ROOM_RE = /^\/api\/room\/([a-z0-9_-]{1,32})\/ws$/i;
const WHERE_RE = /^\/api\/room\/([a-z0-9_-]{1,32})\/donde$/i;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(ROOM_RE);
    if (m) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Se esperaba una conexión WebSocket', { status: 426 });
      }
      const room = m[1].toLowerCase();
      // Un mundo nuevo nace en la región de quien lo crea (a uno que ya existe la pista no le afecta).
      const hint = regionFor(request.cf as GeoInfo | undefined);
      const stub = env.GAME_WORLDS.getByName(room, hint ? { locationHint: hint } : undefined);
      // El objeto no sabe su propio nombre: se lo pasamos (lo necesita para avisar al directorio).
      const u = new URL(request.url);
      u.searchParams.set('sala', room);
      return stub.fetch(new Request(u, request));
    }
    if (url.pathname === '/api/health') return Response.json({ ok: true });
    // Diagnóstico de la latencia: dónde está el servidor del mundo y por dónde entra el jugador.
    const w = url.pathname.match(WHERE_RE);
    if (w) {
      const cf = request.cf as (GeoInfo & { colo?: string }) | undefined;
      const hint = regionFor(cf);
      const world = await env.GAME_WORLDS.getByName(w[1].toLowerCase(), hint ? { locationHint: hint } : undefined).where();
      return Response.json({
        servidor: world, ciudad: world ? cityOf(world) : null, entrada: cf?.colo ?? null, pais: cf?.country ?? null,
        region: regionFor(cf) ?? null,
      });
    }
    if (url.pathname === '/api/stats') {
      const stats = await env.WORLD_DIRECTORY.getByName('global').stats();
      return Response.json(stats, { headers: { 'Cache-Control': 'public, max-age=10' } });
    }
    return new Response('No encontrado', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

/** Almacenamiento del servidor de juego sobre el SQLite del Durable Object. */
class SqlStore implements ServerStore {
  private sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS chunks (key TEXT PRIMARY KEY, data BLOB NOT NULL)`);
    sql.exec(`CREATE TABLE IF NOT EXISTS players (name TEXT PRIMARY KEY, data TEXT NOT NULL) WITHOUT ROWID`);
    sql.exec(`CREATE TABLE IF NOT EXISTS containers (pos INTEGER PRIMARY KEY, data TEXT NOT NULL)`);
    // Fase 8: los contenedores de las otras dimensiones.
    sql.exec(`CREATE TABLE IF NOT EXISTS dim_containers (dim INTEGER NOT NULL, pos INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (dim, pos))`);
  }

  getMeta(key: string): string | null {
    const rows = this.sql.exec<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key).toArray();
    return rows.length ? rows[0].value : null;
  }

  setMeta(key: string, value: string): void {
    this.sql.exec(`INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value);
  }

  loadChunkEdits(key: string): Uint8Array | null {
    const rows = this.sql.exec<{ data: ArrayBuffer }>(`SELECT data FROM chunks WHERE key = ?`, key).toArray();
    return rows.length ? new Uint8Array(rows[0].data) : null;
  }

  loadAllChunkEdits(): [string, Uint8Array][] {
    return this.sql
      .exec<{ key: string; data: ArrayBuffer }>(`SELECT key, data FROM chunks`)
      .toArray()
      .map((r) => [r.key, new Uint8Array(r.data)]);
  }

  saveChunkEdits(key: string, data: Uint8Array): void {
    this.sql.exec(
      `INSERT INTO chunks (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data`,
      key,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
    );
  }

  loadPlayer(name: string): string | null {
    const rows = this.sql.exec<{ data: string }>(`SELECT data FROM players WHERE name = ?`, name).toArray();
    return rows.length ? rows[0].data : null;
  }

  savePlayer(name: string, data: string): void {
    this.sql.exec(`INSERT INTO players (name, data) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET data = excluded.data`, name, data);
  }

  loadContainers(dim = 0): [number, string][] {
    if (dim) {
      return this.sql
        .exec<{ pos: number; data: string }>(`SELECT pos, data FROM dim_containers WHERE dim = ?`, dim)
        .toArray()
        .map((r) => [Number(r.pos), r.data]);
    }
    return this.sql
      .exec<{ pos: number; data: string }>(`SELECT pos, data FROM containers`)
      .toArray()
      .map((r) => [Number(r.pos), r.data]);
  }

  saveContainer(pos: number, data: string | null, dim = 0): void {
    if (dim) {
      if (data === null) this.sql.exec(`DELETE FROM dim_containers WHERE dim = ? AND pos = ?`, dim, pos);
      else this.sql.exec(`INSERT INTO dim_containers (dim, pos, data) VALUES (?, ?, ?) ON CONFLICT(dim, pos) DO UPDATE SET data = excluded.data`, dim, pos, data);
      return;
    }
    if (data === null) this.sql.exec(`DELETE FROM containers WHERE pos = ?`, pos);
    else this.sql.exec(`INSERT INTO containers (pos, data) VALUES (?, ?) ON CONFLICT(pos) DO UPDATE SET data = excluded.data`, pos, data);
  }
}

export class GameWorld extends DurableObject<Env> {
  private gameServer: Multiverse | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private sqlStore: SqlStore | null = null;
  /** Nombre de la sala (llega en la URL de conexión y se guarda). */
  private room: string | null = null;
  /** Lo último que se contó al directorio (para no repetirlo). */
  private reported = -1;

  private get store(): SqlStore {
    return (this.sqlStore ??= new SqlStore(this.ctx.storage.sql));
  }

  /**
   * El servidor del mundo se crea con la primera conexión: así un mundo nuevo puede nacer con la
   * semilla que eligió quien lo creó (si ya existe, manda la guardada).
   */
  private get game(): Multiverse {
    return (this.gameServer ??= new Multiverse(this.store));
  }

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Respuesta automática a los latidos sin despertar al objeto.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"hb"}', '{"t":"hb"}'));
    // Conexiones que sobrevivieron a un reinicio no tienen sesión: que se reconecten.
    for (const ws of ctx.getWebSockets()) {
      try {
        ws.close(4003, 'restart');
      } catch {
        /* ya cerrada */
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    const params = new URL(request.url).searchParams;
    const sala = params.get('sala');
    if (sala && !this.room) {
      this.room = sala;
      this.store.setMeta('room', sala);
    }
    if (!this.gameServer) {
      const raw = params.get('semilla');
      const seed = raw !== null && /^-?\d{1,10}$/.test(raw) ? Number(raw) | 0 : undefined;
      this.gameServer = new Multiverse(this.store, { seed });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    this.game.connect(server as Conn);
    this.startTicking();
    // Hay alguien: el mundo ya no se borra.
    await this.ctx.storage.deleteAlarm();
    this.report();
    return new Response(null, { status: 101, webSocket: client });
  }

  private roomName(): string | null {
    return (this.room ??= this.store.getMeta('room'));
  }

  /** Centro de datos donde vive este mundo (lo dice la traza de Cloudflare de una petición saliente). */
  private colo: string | null = null;

  async where(): Promise<string | null> {
    if (this.colo) return this.colo;
    try {
      const r = await fetch('https://cloudflare.com/cdn-cgi/trace');
      const m = (await r.text()).match(/^colo=([A-Z]{3})$/m);
      this.colo = m ? m[1] : null;
    } catch {
      this.colo = null;
    }
    return this.colo;
  }

  /** Cuenta al directorio cuánta gente hay (si cambió). */
  private report(): void {
    const n = this.gameServer ? this.gameServer.connectionCount : 0;
    if (n === this.reported) return;
    const room = this.roomName();
    if (!room) return;
    this.reported = n;
    this.ctx.waitUntil(this.env.WORLD_DIRECTORY.getByName('global').update(room, n, Date.now()).catch(() => {}));
  }

  /** Se fue alguien: si ya no queda nadie y en 48 horas no vuelve nadie, se borra el mundo. */
  private async whenEmpty(): Promise<void> {
    this.report();
    if (this.gameServer && this.gameServer.connectionCount > 0) return;
    await this.ctx.storage.setAlarm(Date.now() + idleMs(this.env));
  }

  /** La alarma de las 48 horas: sin nadie, se borra todo (ediciones, jugadores, cofres…) y se quita del directorio. */
  async alarm(): Promise<void> {
    if ((this.gameServer && this.gameServer.connectionCount > 0) || this.ctx.getWebSockets().length > 0) return;
    const room = this.roomName();
    this.stopTicking();
    this.gameServer = null;
    this.sqlStore = null;
    this.reported = -1;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
    if (room) await this.env.WORLD_DIRECTORY.getByName('global').remove(room).catch(() => {});
  }

  private startTicking(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.game.tick();
      } catch (err) {
        console.error('Error en el tick del servidor', err);
      }
      // Sin nadie conectado se detiene la simulación (el objeto puede hibernar y no consume).
      if (this.game.connectionCount === 0) this.stopTicking();
    }, 1000 / TICK_RATE);
  }

  private stopTicking(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.game.isKnown(ws as Conn)) {
      try {
        ws.close(4003, 'restart');
      } catch {
        /* ya cerrada */
      }
      return;
    }
    this.game.message(ws as Conn, message);
    this.startTicking();
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    void wasClean;
    this.game.disconnect(ws as Conn);
    try {
      ws.close(code, reason);
    } catch {
      /* ya cerrada */
    }
    await this.whenEmpty();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.game.disconnect(ws as Conn);
    await this.whenEmpty();
  }
}

/**
 * Directorio de mundos: cuánta gente hay en cada sala y cuándo cambió por última vez. La portada sólo pide el
 * resumen: mundos activos (con gente ahora o usados en las últimas 48 horas, los que aún no se han borrado) y
 * jugadores conectados.
 */
export class WorldDirectory extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS rooms (name TEXT PRIMARY KEY, players INTEGER NOT NULL, last INTEGER NOT NULL)`);
  }

  async update(room: string, players: number, at: number): Promise<void> {
    this.sql.exec(
      `INSERT INTO rooms (name, players, last) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET players = excluded.players, last = excluded.last`,
      room, Math.max(0, players | 0), at,
    );
  }

  async remove(room: string): Promise<void> {
    this.sql.exec(`DELETE FROM rooms WHERE name = ?`, room);
  }

  async stats(): Promise<{ servers: number; players: number }> {
    // Los que llevan más de 48 horas vacíos ya se han borrado (o lo harán al saltar su alarma).
    this.sql.exec(`DELETE FROM rooms WHERE players = 0 AND last < ?`, Date.now() - idleMs(this.env));
    const row = this.sql.exec<{ servers: number; players: number }>(
      `SELECT COUNT(*) AS servers, COALESCE(SUM(players), 0) AS players FROM rooms`,
    ).one();
    return { servers: Number(row.servers), players: Number(row.players) };
  }
}
