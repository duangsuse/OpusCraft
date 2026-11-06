// IndexedDB persistence: world metadata + modified chunks (RLE compressed).
const DB_NAME = 'mc-replica', VERSION = 1;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('worlds')) db.createObjectStore('worlds', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) db.createObjectStore('chunks');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
const tx = (db, store, mode, fn) => new Promise((res, rej) => {
  const t = db.transaction(store, mode);
  const s = t.objectStore(store);
  let out;
  const r = fn(s);
  if (r) r.onsuccess = () => { out = r.result; };
  t.oncomplete = () => res(out);
  t.onerror = () => rej(t.error);
});

export function rleEncode(u16) {
  const out = [];
  let i = 0;
  while (i < u16.length) {
    const v = u16[i]; let n = 1;
    while (i + n < u16.length && u16[i + n] === v && n < 65535) n++;
    out.push(v, n); i += n;
  }
  return Uint16Array.from(out);
}
export function rleDecode(rle, len) {
  const out = new Uint16Array(len);
  let o = 0;
  for (let i = 0; i < rle.length; i += 2) { out.fill(rle[i], o, o + rle[i + 1]); o += rle[i + 1]; }
  return out;
}

export class Storage {
  constructor() { this.dbp = openDB().catch(e => { console.warn('IndexedDB unavailable', e); return null; }); }
  async listWorlds() {
    const db = await this.dbp; if (!db) return [];
    const all = await tx(db, 'worlds', 'readonly', s => s.getAll());
    return (all || []).sort((a, b) => b.lastPlayed - a.lastPlayed);
  }
  async saveWorldMeta(meta) { const db = await this.dbp; if (!db) return; await tx(db, 'worlds', 'readwrite', s => s.put(meta)); }
  async getWorld(id) { const db = await this.dbp; if (!db) return null; return tx(db, 'worlds', 'readonly', s => s.get(id)); }
  async deleteWorld(id) {
    const db = await this.dbp; if (!db) return;
    await tx(db, 'worlds', 'readwrite', s => s.delete(id));
    await tx(db, 'chunks', 'readwrite', s => s.delete(IDBKeyRange.bound(id + '/', id + '/￿')));
  }
  // per-world chunk store used by World
  async openWorld(id) {
    const db = await this.dbp;
    const keys = db ? await tx(db, 'chunks', 'readonly', s => s.getAllKeys(IDBKeyRange.bound(id + '/', id + '/￿'))) : [];
    const set = new Set((keys || []).map(k => k.slice(id.length + 1)));
    return new WorldStore(db, id, set);
  }
}

class WorldStore {
  constructor(db, id, keys) { this.db = db; this.id = id; this.keys = keys; this.cache = new Map(); }
  hasChunk(key) { return this.keys.has(key) || this.cache.has(key); }
  async loadChunk(key) {
    if (this.cache.has(key)) return this.cache.get(key);
    if (!this.db) return null;
    const rec = await tx(this.db, 'chunks', 'readonly', s => s.get(this.id + '/' + key));
    if (!rec) return null;
    return { blocks: rleDecode(rec.blocks, 16 * 16 * 384), biomes: rec.biomes, blockEntities: rec.blockEntities };
  }
  saveChunk(c, blockEntities) {
    const rec = { blocks: rleEncode(c.blocks), biomes: new Uint8Array(c.biomes), blockEntities: blockEntities.map(([k, be]) => [k, serializeBE(be)]) };
    this.keys.add(c.key);
    this.cache.set(c.key, { blocks: new Uint16Array(c.blocks), biomes: rec.biomes, blockEntities: rec.blockEntities });
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    if (!this.db) return Promise.resolve();
    return tx(this.db, 'chunks', 'readwrite', s => s.put(rec, this.id + '/' + c.key)).catch(e => console.warn('save failed', e));
  }
}

function serializeBE(be) {
  const o = { type: be.type };
  if (be.inv) o.inv = be.inv.toJSON ? be.inv.toJSON() : be.inv;
  for (const k of ['burn', 'burnMax', 'cook']) if (be[k] !== undefined) o[k] = be[k];
  return o;
}
