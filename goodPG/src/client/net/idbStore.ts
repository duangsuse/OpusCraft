// Almacenamiento del servidor local en IndexedDB: se carga todo en memoria al abrir (las
// operaciones del servidor son síncronas) y las escrituras se vuelcan en segundo plano.
import { dimEntries, type ServerStore } from '../../shared/sim/store';

const STORES = ['meta', 'chunks', 'players', 'containers'] as const;
type StoreName = (typeof STORES)[number];

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export class IdbStore implements ServerStore {
  private db: IDBDatabase;
  private meta = new Map<string, string>();
  private chunks = new Map<string, Uint8Array>();
  private players = new Map<string, string>();
  private containers = new Map<number, string>();
  /** Fase 8: contenedores de las otras dimensiones, con clave "dim:pos" (en el mismo almacén). */
  private dimContainers = new Map<string, string>();
  private pending = new Map<StoreName, Map<IDBValidKey, unknown | null>>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(db: IDBDatabase) {
    this.db = db;
  }

  static async open(name: string): Promise<IdbStore> {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      for (const s of STORES) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s);
    };
    const db = await req(open);
    const store = new IdbStore(db);
    const tx = db.transaction([...STORES], 'readonly');
    const load = async (s: StoreName, fn: (k: IDBValidKey, v: unknown) => void) => {
      const os = tx.objectStore(s);
      const [keys, vals] = await Promise.all([req(os.getAllKeys()), req(os.getAll())]);
      keys.forEach((k, i) => fn(k, vals[i]));
    };
    await Promise.all([
      load('meta', (k, v) => store.meta.set(String(k), String(v))),
      load('chunks', (k, v) => store.chunks.set(String(k), new Uint8Array(v as ArrayBuffer))),
      load('players', (k, v) => store.players.set(String(k), String(v))),
      load('containers', (k, v) => {
        if (typeof k === 'string') store.dimContainers.set(k, String(v));
        else store.containers.set(Number(k), String(v));
      }),
    ]);
    return store;
  }

  private queue(s: StoreName, key: IDBValidKey, value: unknown | null): void {
    let m = this.pending.get(s);
    if (!m) {
      m = new Map();
      this.pending.set(s, m);
    }
    m.set(key, value);
    if (!this.timer) this.timer = setTimeout(() => this.commit(), 1000);
  }

  /** Vuelca las escrituras pendientes. */
  commit(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.size === 0) return Promise.resolve();
    const pending = this.pending;
    this.pending = new Map();
    const tx = this.db.transaction([...pending.keys()], 'readwrite');
    for (const [s, m] of pending) {
      const os = tx.objectStore(s);
      for (const [k, v] of m) {
        if (v === null) os.delete(k);
        else os.put(v, k);
      }
    }
    return new Promise((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  }

  getMeta(key: string): string | null {
    return this.meta.get(key) ?? null;
  }
  setMeta(key: string, value: string): void {
    this.meta.set(key, value);
    this.queue('meta', key, value);
  }
  loadChunkEdits(key: string): Uint8Array | null {
    return this.chunks.get(key) ?? null;
  }
  loadAllChunkEdits(): [string, Uint8Array][] {
    return [...this.chunks.entries()];
  }
  saveChunkEdits(key: string, data: Uint8Array): void {
    const copy = data.slice();
    this.chunks.set(key, copy);
    this.queue('chunks', key, copy.buffer);
  }
  loadPlayer(name: string): string | null {
    return this.players.get(name) ?? null;
  }
  savePlayer(name: string, data: string): void {
    this.players.set(name, data);
    this.queue('players', name, data);
  }
  loadContainers(dim = 0): [number, string][] {
    return dim ? dimEntries(this.dimContainers, dim) : [...this.containers.entries()];
  }
  saveContainer(pos: number, data: string | null, dim = 0): void {
    const m: Map<number | string, string> = dim ? this.dimContainers : this.containers;
    const k = dim ? `${dim}:${pos}` : pos;
    if (data === null) m.delete(k);
    else m.set(k, data);
    this.queue('containers', k, data);
  }
}
