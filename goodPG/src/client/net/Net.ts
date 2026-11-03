// Cliente de red con reconexión automática. Habla con el servidor de Cloudflare por WebSocket o
// con el servidor local (Web Worker) en el modo un jugador: ambos usan el mismo protocolo.
import {
  PROTOCOL_VERSION, decodeEdits, type ClientMsg, type ServerMsg, type WorldTime, type PlayerInfo, type GameMode,
  type PlayerSave,
} from '../../shared/protocol';
import { isDimension } from '../../shared/dimensions'; // Fase 8 (dimensiones)

export interface Welcome {
  id: string;
  seed: number;
  time: WorldTime;
  players: PlayerInfo[];
  edits: [number, number, number, number][];
  mode: GameMode;
  diff: number;
  save: PlayerSave | null;
  spawn: [number, number, number];
  bed?: [number, number, number] | null;
  /** Fase 8.5: dimensión del punto de reaparición. */
  bd?: number;
  /** Flotadores de pesca ya lanzados: [jugador, entidad]. */
  rods?: [string, number][];
  /** Carteles con texto: [x, y, z, líneas]. */
  signs?: [number, number, number, string[]][];
  /** Fase 6.5 (libros y estandartes): estandartes con dibujos: [x, y, z, capas]. */
  banners?: unknown[];
  /** Fase 8: dimensión y, al llegar de otra, dónde aparece. */
  dim: number;
  at?: [number, number, number];
}

/** Lo mínimo de un WebSocket que usamos (el servidor local imita esta interfaz). */
export interface Transport {
  readonly readyState: number;
  binaryType: string;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: { code: number; reason: string }) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export interface NetEvents {
  onWelcome(w: Welcome, reconnect: boolean): void;
  /** Resto de mensajes del servidor. */
  onMessage(msg: ServerMsg): void;
  onStatus(status: 'connected' | 'reconnecting' | 'closed'): void;
}

const OPEN = 1;
/** Cierres definitivos: versión, sala llena, sustituido por otra ventana. */
const TERMINAL = new Set([4000, 4001, 4005]);

export class Net {
  private ws: Transport | null = null;
  private factory: () => Transport;
  private name: string;
  private shirt: string;
  private mode: GameMode;
  private events: NetEvents;
  private pendingWelcome: Omit<Welcome, 'edits'> | null = null;
  private welcomed = false;
  private closedByUser = false;
  private retries = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  /** Diferencia (servidor - cliente) en ms. */
  serverOffset = 0;
  latency = 0;
  id: string | null = null;
  readonly local: boolean;
  private everConnected = false;
  /** Fase 8: la bienvenida que se espera es de un cambio de dimensión (no de una conexión nueva). */
  private transfer = false;
  /** Ediciones hechas sin conexión: se reenvían al reconectar. */
  private pendingSets: [number, number, number, number][] = [];
  private lastMessageAt = 0;

  constructor(factory: () => Transport, name: string, shirt: string, mode: GameMode, events: NetEvents, local = false) {
    this.factory = factory;
    this.name = name;
    this.shirt = shirt;
    this.mode = mode;
    this.events = events;
    this.local = local;
  }

  /** Conexión al mundo `room`; `seed` sólo cuenta si el mundo aún no existe. */
  static websocketFactory(room: string, seed: number | null = null): () => Transport {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const q = seed === null ? '' : `?semilla=${seed}`;
    const url = `${proto}://${location.host}/api/room/${encodeURIComponent(room)}/ws${q}`;
    return () => new WebSocket(url) as unknown as Transport;
  }

  /** Conecta y resuelve cuando llega la bienvenida con las ediciones (o rechaza si falla). */
  connect(timeoutMs = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.closedByUser = true;
        this.ws?.close();
        reject(new Error('Tiempo de espera agotado al conectar con el servidor.'));
      }, timeoutMs);
      this.open(
        () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve();
        },
        (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  private open(onReady?: () => void, onFail?: (e: Error) => void): void {
    let ws: Transport;
    try {
      ws = this.factory();
    } catch (e) {
      onFail?.(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.welcomed = false;
    this.pendingWelcome = null;
    ws.onopen = () => {
      this.lastMessageAt = performance.now();
      this.sendRaw({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, shirt: this.shirt, mode: this.mode });
      if (!this.local) {
        this.timers.push(setInterval(() => {
          if (this.ws?.readyState === OPEN) this.ws.send('{"t":"hb"}');
        }, 20000));
        // Si no llega nada en 45 s, la conexión está muerta: reconectar.
        this.timers.push(setInterval(() => {
          if (this.ws === ws && ws.readyState === OPEN && performance.now() - this.lastMessageAt > 45000) ws.close();
        }, 5000));
      }
      // Ping frecuente: mide la latencia y mantiene viva la simulación del servidor.
      this.timers.push(setInterval(() => this.sendRaw({ t: 'ping', c: performance.now() }), 5000));
    };
    ws.onmessage = (e) => {
      this.lastMessageAt = performance.now();
      if (e.data instanceof ArrayBuffer) {
        if (this.pendingWelcome && !this.welcomed) {
          const edits = decodeEdits(e.data);
          this.welcomed = true;
          const reconnect = this.everConnected;
          this.everConnected = true;
          this.retries = 0;
          this.events.onWelcome({ ...this.pendingWelcome, edits }, reconnect);
          if (!this.transfer) this.events.onStatus('connected');
          this.transfer = false;
          const queued = this.pendingSets;
          this.pendingSets = [];
          for (const [x, y, z, b] of queued) this.sendRaw({ t: 'set', x, y, z, b });
          onReady?.();
        }
        return;
      }
      let msg: ServerMsg | { t: 'hb' };
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      this.handle(msg);
    };
    ws.onerror = () => {
      /* se gestiona en onclose */
    };
    ws.onclose = (ev) => {
      this.clearTimers();
      if (!this.welcomed) onFail?.(new Error(ev.reason || 'No se pudo conectar con el servidor.'));
      if (this.closedByUser || !this.everConnected || TERMINAL.has(ev.code)) {
        this.events.onStatus('closed');
        return;
      }
      this.events.onStatus('reconnecting');
      const delay = ev.code === 4003 ? 300 : Math.min(15000, 1000 * 2 ** this.retries);
      this.retries++;
      setTimeout(() => {
        if (!this.closedByUser) this.open();
      }, delay);
    };
  }

  private handle(msg: ServerMsg | { t: 'hb' }): void {
    switch (msg.t) {
      case 'hb':
        return;
      case 'welcome':
        // Fase 8: otra bienvenida por la misma conexión = cambio de dimensión. Lo que iba a la anterior
        // (ediciones pendientes) ya no vale; hasta que lleguen sus ediciones no se manda nada.
        if (this.welcomed) {
          this.welcomed = false;
          this.pendingSets = [];
          this.transfer = true;
        }
        if (!Number.isFinite(msg.time?.base) || !Number.isFinite(msg.time?.at)) msg.time = { base: 0.08, at: msg.now, rate: msg.time?.rate || 1 / 1200 };
        this.id = msg.id;
        this.serverOffset = msg.now - Date.now();
        this.pendingWelcome = {
          id: msg.id, seed: msg.seed, time: msg.time, players: msg.players, mode: msg.mode === 'c' ? 'c' : 's',
          diff: Number.isInteger(msg.diff) ? msg.diff : 2, save: msg.save ?? null, spawn: msg.spawn,
          bed: msg.bed ?? null, bd: isDimension(msg.bd) ? msg.bd : 0, rods: Array.isArray(msg.rods) ? msg.rods : [],
          signs: Array.isArray(msg.signs) ? msg.signs : [],
          banners: Array.isArray(msg.banners) ? msg.banners : [], // Fase 6.5 (libros y estandartes)
          dim: isDimension(msg.dim) ? msg.dim : 0, // Fase 8
          at: Array.isArray(msg.at) && msg.at.length === 3 && msg.at.every(Number.isFinite) ? msg.at : undefined,
        };
        return;
      case 'time':
        if (!Number.isFinite(msg.time?.base) || !Number.isFinite(msg.time?.at)) return;
        this.serverOffset = msg.now - Date.now();
        break;
      case 'pong': {
        const rtt = performance.now() - msg.c;
        this.latency = rtt;
        this.serverOffset = msg.now + rtt / 2 - Date.now();
        return;
      }
    }
    this.events.onMessage(msg);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
  }

  private sendRaw(msg: ClientMsg): void {
    if (this.ws && this.ws.readyState === OPEN) this.ws.send(JSON.stringify(msg));
  }

  get connected(): boolean {
    return !!this.ws && this.ws.readyState === OPEN && this.welcomed;
  }

  /** Envía un mensaje (se descarta si no hay conexión). */
  send(msg: ClientMsg): void {
    if (this.welcomed) this.sendRaw(msg);
  }

  /** Fase 7 (encantamientos): `en`, los encantamientos de la herramienta (Toque de seda, Fortuna). */
  sendSet(x: number, y: number, z: number, b: number, tool = 0, en?: [number, number][]): void {
    if (this.connected) this.sendRaw({ t: 'set', x, y, z, b, tool, ...(en?.length ? { en } : {}) });
    else if (this.pendingSets.length < 20000) this.pendingSets.push([x, y, z, b]);
  }

  close(): void {
    this.closedByUser = true;
    this.clearTimers();
    this.ws?.close();
  }
}
