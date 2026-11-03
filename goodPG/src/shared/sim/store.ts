// Almacenamiento persistente del servidor de juego (SQLite en el Durable Object, memoria o
// localStorage en el modo un jugador). Todas las operaciones son síncronas.
import { legacyPosKey } from './posKey';

export interface ServerStore {
  getMeta(key: string): string | null;
  setMeta(key: string, value: string): void;
  /** Ediciones de un chunk codificadas (ver encodeChunkEdits). */
  loadChunkEdits(key: string): Uint8Array | null;
  loadAllChunkEdits(): [string, Uint8Array][];
  saveChunkEdits(key: string, data: Uint8Array): void;
  loadPlayer(name: string): string | null;
  savePlayer(name: string, data: string): void;
  /** Contenedores guardados por posición; Fase 8: los de cada dimensión aparte (0, el mundo normal). */
  loadContainers(dim?: number): [number, string][];
  saveContainer(pos: number, data: string | null, dim?: number): void;
}

export class MemoryStore implements ServerStore {
  meta = new Map<string, string>();
  chunks = new Map<string, Uint8Array>();
  players = new Map<string, string>();
  containers = new Map<number, string>();
  /** Fase 8: contenedores de las otras dimensiones ("dim:pos"). */
  dimContainers = new Map<string, string>();
  getMeta(key: string): string | null {
    return this.meta.get(key) ?? null;
  }
  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
  }
  loadChunkEdits(key: string): Uint8Array | null {
    return this.chunks.get(key) ?? null;
  }
  loadAllChunkEdits(): [string, Uint8Array][] {
    return [...this.chunks.entries()];
  }
  saveChunkEdits(key: string, data: Uint8Array): void {
    this.chunks.set(key, data);
  }
  loadPlayer(name: string): string | null {
    return this.players.get(name) ?? null;
  }
  savePlayer(name: string, data: string): void {
    this.players.set(name, data);
  }
  loadContainers(dim = 0): [number, string][] {
    if (!dim) return [...this.containers.entries()];
    return dimEntries(this.dimContainers, dim);
  }
  saveContainer(pos: number, data: string | null, dim = 0): void {
    const m: Map<number | string, string> = dim ? this.dimContainers : this.containers;
    const k = dim ? `${dim}:${pos}` : pos;
    if (data === null) m.delete(k);
    else m.set(k, data);
  }
}

/** Contenedores de una dimensión de un mapa "dim:pos" → dato. */
export function dimEntries(m: Map<string, string>, dim: number): [number, string][] {
  const prefix = `${dim}:`;
  const out: [number, string][] = [];
  for (const [k, v] of m) if (k.startsWith(prefix)) out.push([Number(k.slice(prefix.length)), v]);
  return out;
}

/** Fase 8: lo guardado que comparten todas las dimensiones (el resto de `meta` va con prefijo). */
const SHARED_META = new Set(['seed', 'time', 'difficulty', 'mode']);

/**
 * Fase 8: vista del almacenamiento para una dimensión. El mundo normal usa las claves de siempre (los
 * mundos guardados no cambian); las demás, las mismas tablas con la dimensión delante ("1:3,-2"). Los
 * jugadores y lo de SHARED_META son de todas.
 */
export function scopeStore(base: ServerStore, dim: number): ServerStore {
  const prefix = `${dim}:`;
  const own = (k: string) => (dim ? !k.startsWith(prefix) ? null : k.slice(prefix.length) : k.includes(':') ? null : k);
  const metaKey = (k: string) => (dim && !SHARED_META.has(k) ? prefix + k : k);
  const chunkKey = (k: string) => (dim ? prefix + k : k);
  return {
    getMeta: (k) => base.getMeta(metaKey(k)),
    setMeta: (k, v) => base.setMeta(metaKey(k), v),
    loadChunkEdits: (k) => base.loadChunkEdits(chunkKey(k)),
    loadAllChunkEdits: () => {
      const out: [string, Uint8Array][] = [];
      for (const [k, data] of base.loadAllChunkEdits()) {
        const key = own(k);
        if (key !== null) out.push([key, data]);
      }
      return out;
    },
    saveChunkEdits: (k, data) => base.saveChunkEdits(chunkKey(k), data),
    loadPlayer: (name) => base.loadPlayer(name),
    savePlayer: (name, data) => base.savePlayer(name, data),
    loadContainers: () => base.loadContainers(dim),
    saveContainer: (pos, data) => base.saveContainer(pos, data, dim),
  };
}

/**
 * Versión del formato de las ediciones guardadas (clave `blockFormat` en meta):
 * 1 = [u16 índice][u8 bloque]; 2 = [u16 índice][u16 bloque]; 3 = [u24 índice][u16 bloque], con el
 * mundo de y = −64 a 319 (en los formatos 1 y 2 la fila 0 del índice era y = 0).
 */
export const BLOCK_FORMAT = '3';

/** Filas que se añadieron por debajo de y = 0 al pasar a 384 de alto. */
const ROWS_BELOW_ZERO = 64;

/** Ediciones de un chunk: n × [u24 índice][u16 bloque] (little endian). */
export function encodeChunkEdits(m: Map<number, number>): Uint8Array {
  const out = new Uint8Array(m.size * 5);
  let o = 0;
  for (const [idx, b] of m) {
    out[o] = idx & 255;
    out[o + 1] = (idx >> 8) & 255;
    out[o + 2] = idx >> 16;
    out[o + 3] = b & 255;
    out[o + 4] = b >> 8;
    o += 5;
  }
  return out;
}

export function decodeChunkEdits(data: Uint8Array): Map<number, number> {
  const m = new Map<number, number>();
  for (let o = 0; o + 5 <= data.length; o += 5) {
    m.set(data[o] | (data[o + 1] << 8) | (data[o + 2] << 16), data[o + 3] | (data[o + 4] << 8));
  }
  return m;
}

/** Formatos 1 y 2 (índice de 16 bits con la fila 0 en y = 0), ya con el índice del mundo actual. */
function decodeOldChunkEdits(data: Uint8Array, format: string): Map<number, number> {
  const m = new Map<number, number>();
  const step = format === '2' ? 4 : 3;
  for (let o = 0; o + step <= data.length; o += step) {
    const idx = (data[o] | (data[o + 1] << 8)) + (ROWS_BELOW_ZERO << 8);
    m.set(idx, step === 4 ? data[o + 2] | (data[o + 3] << 8) : data[o + 2]);
  }
  return m;
}

/** Pasa las ediciones guardadas al formato actual (una sola vez por mundo). */
export function migrateStore(store: ServerStore): number {
  const format = store.getMeta('blockFormat') ?? '1';
  if (format === BLOCK_FORMAT) return 0;
  let n = 0;
  for (const [key, data] of store.loadAllChunkEdits()) {
    store.saveChunkEdits(key, encodeChunkEdits(decodeOldChunkEdits(data, format)));
    n++;
  }
  // Cofres, hornos, fogatas y carteles se guardan por posición: la clave cambió con la altura.
  // Primero se borran todas las antiguas y luego se escriben las nuevas, para que no se pisen.
  const containers = store.loadContainers();
  for (const [pos] of containers) store.saveContainer(pos, null);
  for (const [pos, data] of containers) store.saveContainer(legacyPosKey(pos), data);
  store.setMeta('blockFormat', BLOCK_FORMAT);
  return n;
}
