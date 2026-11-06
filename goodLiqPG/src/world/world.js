// Main-thread world: chunk streaming via a worker pool, block access, fluid simulation, block updates, random ticks.
import {
  BLOCKS, ID, T_OPAQUE, T_SOLID, T_FLUID, T_REPLACEABLE, TYPE_MASK, META_SHIFT, mk, typeOf, metaOf, collisionBoxes, selectionBoxes, FACE_DIR,
} from './blocks.js';
import { MIN_Y, MAX_Y, HEIGHT, CHUNK_VOL, CHUNK_BYTES, BIOME_OFF, HEIGHTMAP_OFF, ckey } from './constants.js';

// SharedArrayBuffer needs a cross-origin isolated page (COOP/COEP headers, see server.mjs). On plain static servers
// (python -m http.server, npx http-server, ...) fall back to ordinary buffers that are copied/transferred to workers.
export const HAS_SAB = typeof SharedArrayBuffer === 'function' && globalThis.crossOriginIsolated === true;

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz; this.key = ckey(cx, cz);
    this.adopt(HAS_SAB ? new SharedArrayBuffer(CHUNK_BYTES) : new ArrayBuffer(CHUNK_BYTES));
    this.state = 0;           // 0 new, 1 generating/loading, 2 ready
    this.light = null;        // Uint8Array sky<<4|block (from last mesh)
    this.mesh = null;         // GPU mesh (renderer-owned)
    this.version = 0;         // bumped on every edit
    this.meshedVersion = -1;
    this.meshing = false;
    this.priority = false;    // edit-triggered remesh
    this.modified = false;
    this.fromSave = false;
    this.lastSeen = 0;
  }
  adopt(buf) {
    this.sab = buf;
    this.blocks = new Uint16Array(buf, 0, CHUNK_VOL);
    this.biomes = new Uint8Array(buf, BIOME_OFF, 256);
    this.heightmap = new Int16Array(buf, HEIGHTMAP_OFF, 256);
  }
}

export class World {
  constructor({ seed, renderDistance = 10, texLayers, biomeColors, storage = null, onMesh = null, onUnload = null }) {
    this.seed = seed;
    this.renderDistance = renderDistance;
    this.chunks = new Map();
    this.pending = new Map();        // key -> Int32Array chunks of outside blocks waiting for that chunk
    this.storage = storage;
    this.onMesh = onMesh; this.onUnload = onUnload;
    this.blockEntities = new Map();  // "x,y,z" -> object
    this.scheduled = new Map();      // "x,y,z" -> due tick
    this.tickCount = 0;
    this.time = 1000;                // day time ticks (0 = sunrise)
    this.dayCount = 0;
    this.genStats = { gen: 0, mesh: 0, genMs: 0, meshMs: 0 };
    this.listeners = [];
    const n = Math.max(2, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
    this.workers = [];
    this.jobId = 1;
    this.jobs = new Map();
    this.readyPromise = Promise.all(Array.from({ length: n }, (_, i) => new Promise((res) => {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.busy = 0; w.idx = i;
      w.onmessage = (e) => this.onWorkerMessage(w, e.data, res);
      w.onerror = (e) => console.error('worker error', e.message || e);
      w.postMessage({ type: 'init', texLayers, biomeColors, seed });
      this.workers.push(w);
    })));
  }

  ready() { return this.readyPromise; }

  onWorkerMessage(w, msg, res) {
    if (msg.type === 'ready') { res(); return; }
    w.busy--;
    if (msg.type === 'gen') this.onGenerated(msg);
    else if (msg.type === 'mesh') this.onMeshed(msg);
    else { const cb = this.jobs.get(msg.id); if (cb) { this.jobs.delete(msg.id); cb(msg); } }
  }

  pickWorker() {
    let best = null;
    for (const w of this.workers) if (!best || w.busy < best.busy) best = w;
    return best;
  }
  request(type, data) {
    return new Promise((resolve) => {
      const id = this.jobId++;
      this.jobs.set(id, resolve);
      const w = this.pickWorker(); w.busy++;
      w.postMessage({ type, id, ...data });
    });
  }
  async findSpawn() { return (await this.request('spawn', {})).pos; }
  async biomeAtAsync(x, y, z) { return (await this.request('biomeAt', { x, y, z })).biome; }

  // ---- Chunk access -------------------------------------------------------------------------------------
  getChunk(cx, cz) { return this.chunks.get(ckey(cx, cz)); }
  getBlock(x, y, z) {
    if (y < MIN_Y) return ID.bedrock;
    if (y >= MAX_Y) return 0;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || c.state < 2) return y < 0 ? ID.stone : 0;
    return c.blocks[((y - MIN_Y) * 16 + (z & 15)) * 16 + (x & 15)];
  }
  isLoaded(x, z) { const c = this.chunks.get(ckey(x >> 4, z >> 4)); return !!(c && c.state === 2); }
  getLight(x, y, z) {
    // returns [sky, block] 0..15
    if (y >= MAX_Y) return [15, 0];
    if (y < MIN_Y) return [0, 0];
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || !c.light) return [15, 0];
    const v = c.light[((y - MIN_Y) * 16 + (z & 15)) * 16 + (x & 15)];
    return [v >> 4, v & 15];
  }
  biomeAt(x, z) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || c.state < 2) return 0;
    return c.biomes[(z & 15) * 16 + (x & 15)];
  }
  heightAt(x, z) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || c.state < 2) return 64;
    return c.heightmap[(z & 15) * 16 + (x & 15)] + MIN_Y;
  }
  // top y of a block that blocks rain (for weather): first solid or fluid block from the top
  rainHeight(x, z) {
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || c.state < 2) return -1000;
    const lx = x & 15, lz = z & 15;
    for (let yi = c.heightmap[lz * 16 + lx]; yi >= 0; yi--) {
      const t = c.blocks[(yi * 16 + lz) * 16 + lx] & TYPE_MASK;
      if (t && (T_SOLID[t] || T_FLUID[t] || BLOCKS[t].layer !== 0 && BLOCKS[t].model === 'cube')) return yi + MIN_Y;
      if (t && BLOCKS[t].name.endsWith('leaves')) return yi + MIN_Y;
    }
    return MIN_Y;
  }

  setBlock(x, y, z, v, flags = 3) {
    // flags: 1 = notify neighbors (block updates), 2 = re-mesh
    if (y < MIN_Y || y >= MAX_Y) return false;
    const c = this.chunks.get(ckey(x >> 4, z >> 4));
    if (!c || c.state < 2) return false;
    const lx = x & 15, lz = z & 15, yi = y - MIN_Y;
    const i = (yi * 16 + lz) * 16 + lx;
    const old = c.blocks[i];
    if (old === v) return false;
    c.blocks[i] = v;
    c.modified = true;
    // heightmap
    const hi = lz * 16 + lx;
    if (v !== 0 && yi > c.heightmap[hi]) c.heightmap[hi] = yi;
    else if (v === 0 && yi === c.heightmap[hi]) {
      let h = yi - 1;
      while (h >= 0 && c.blocks[(h * 16 + lz) * 16 + lx] === 0) h--;
      c.heightmap[hi] = h;
    }
    // block entity cleanup
    if (typeOf(old) !== typeOf(v)) {
      const be = this.blockEntities.get(x + ',' + y + ',' + z);
      if (be) { this.blockEntities.delete(x + ',' + y + ',' + z); for (const l of this.listeners) l.blockEntityRemoved?.(x, y, z, be); }
    }
    if (flags & 2) this.markDirtyAround(x, y, z, true);
    if (flags & 1) this.notifyNeighbors(x, y, z, old, v);
    for (const l of this.listeners) l.blockChanged?.(x, y, z, old, v);
    return true;
  }

  markDirtyAround(x, y, z, priority) {
    // Light changes may affect up to 15 blocks away; re-mesh the 3x3 chunks around the edit.
    const cx = x >> 4, cz = z >> 4;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chunks.get(ckey(cx + dx, cz + dz));
      if (!c) continue;
      c.version++;
      if (dx === 0 && dz === 0) c.priority = priority;
      else if (priority) {
        // neighbours only need urgent update if the edit is near their border
        const lx = x & 15, lz = z & 15;
        if ((dx === -1 && lx === 0) || (dx === 1 && lx === 15) || (dz === -1 && lz === 0) || (dz === 1 && lz === 15)) c.priority = true;
      }
    }
  }

  // ---- Streaming ------------------------------------------------------------------------------------------
  update(px, pz, frameBudgetMs = 4) {
    const pcx = Math.floor(px) >> 4, pcz = Math.floor(pz) >> 4;
    const R = this.renderDistance;
    const genR = R + 1;
    // collect needed chunks sorted by distance
    if (this._lastCenter !== pcx + ',' + pcz + ',' + R) {
      this._lastCenter = pcx + ',' + pcz + ',' + R;
      const list = [];
      for (let dz = -genR; dz <= genR; dz++) for (let dx = -genR; dx <= genR; dx++) {
        const d = dx * dx + dz * dz;
        if (d > (genR + 0.5) * (genR + 0.5)) continue;
        list.push([d, pcx + dx, pcz + dz]);
      }
      list.sort((a, b) => a[0] - b[0]);
      this._wanted = list;
      // unload far chunks
      const unloadR = genR + 2;
      for (const [key, c] of this.chunks) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > unloadR * unloadR && c.state === 2 && !c.meshing) this.unloadChunk(c);
      }
    }
    // dispatch generation
    let inflight = 0;
    for (const w of this.workers) inflight += w.busy;
    const maxInflight = this.workers.length * 2;
    // priority remeshes first
    for (const c of this.chunks.values()) {
      if (inflight >= maxInflight) break;
      if (c.priority && !c.meshing && c.state === 2 && c.meshedVersion !== c.version && this.neighborsReady(c)) { this.dispatchMesh(c); inflight++; }
    }
    for (const [d, cx, cz] of this._wanted) {
      if (inflight >= maxInflight) break;
      const key = ckey(cx, cz);
      let c = this.chunks.get(key);
      if (!c) {
        c = new Chunk(cx, cz);
        this.chunks.set(key, c);
        if (HAS_SAB) for (const w of this.workers) w.postMessage({ type: 'register', key, sab: c.sab });
        this.loadOrGenerate(c);
        inflight++;
        continue;
      }
      if (c.state !== 2 || c.meshing) continue;
      if (d > (R + 0.5) * (R + 0.5)) continue;
      if (c.meshedVersion !== c.version && this.neighborsReady(c)) { this.dispatchMesh(c); inflight++; }
    }
  }

  neighborsReady(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz));
      if (!n || n.state !== 2) return false;
    }
    return true;
  }

  async loadOrGenerate(c) {
    c.state = 1;
    if (this.storage && this.storage.hasChunk(c.key)) {
      const saved = await this.storage.loadChunk(c.key);
      if (saved && this.chunks.get(c.key) === c) {
        c.blocks.set(saved.blocks);
        if (saved.biomes) c.biomes.set(saved.biomes);
        for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
          let y = HEIGHT - 1;
          while (y >= 0 && c.blocks[(y * 16 + z) * 16 + x] === 0) y--;
          c.heightmap[z * 16 + x] = y;
        }
        if (saved.blockEntities) for (const [k, be] of saved.blockEntities) this.blockEntities.set(k, be);
        c.fromSave = true; c.modified = true;
        this.pending.delete(c.key);
        this.finishChunk(c);
        return;
      }
    }
    const w = this.pickWorker(); w.busy++;
    if (HAS_SAB) w.postMessage({ type: 'gen', cx: c.cx, cz: c.cz, sab: c.sab });
    else w.postMessage({ type: 'gen', cx: c.cx, cz: c.cz });
  }

  onGenerated(msg) {
    const c = this.chunks.get(ckey(msg.cx, msg.cz));
    this.genStats.gen++; this.genStats.genMs += msg.ms;
    if (!c) return;
    if (msg.buffer) c.adopt(msg.buffer);
    // distribute outside feature blocks
    const out = msg.outside;
    const byChunk = new Map();
    for (let i = 0; i < out.length; i += 4) {
      const k = ckey(out[i] >> 4, out[i + 2] >> 4);
      let arr = byChunk.get(k);
      if (!arr) byChunk.set(k, arr = []);
      arr.push(out[i], out[i + 1], out[i + 2], out[i + 3]);
    }
    for (const [k, arr] of byChunk) {
      const t = this.chunks.get(k);
      if (t && t.state === 2) { if (!t.fromSave) { this.applyFeatureBlocks(t, arr); t.version++; } }
      else {
        let p = this.pending.get(k);
        if (!p) this.pending.set(k, p = []);
        p.push(arr);
      }
    }
    const p = this.pending.get(c.key);
    if (p) { for (const arr of p) this.applyFeatureBlocks(c, arr); this.pending.delete(c.key); }
    this.finishChunk(c);
  }

  applyFeatureBlocks(c, arr) {
    for (let i = 0; i < arr.length; i += 4) {
      const x = arr[i] & 15, y = arr[i + 1] - MIN_Y, z = arr[i + 2] & 15;
      if (y < 0 || y >= HEIGHT) continue;
      const idx = (y * 16 + z) * 16 + x;
      const cur = c.blocks[idx];
      const ct = cur & TYPE_MASK;
      if (cur === 0 || (T_REPLACEABLE[ct] && !T_FLUID[ct])) {
        c.blocks[idx] = arr[i + 3];
        if (y > c.heightmap[z * 16 + x]) c.heightmap[z * 16 + x] = y;
      }
    }
  }

  finishChunk(c) {
    c.state = 2;
    c.version++;
    // neighbours may now be meshable / need light updates at borders
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz));
      if (n && n.state === 2 && n.meshedVersion >= 0) n.version++;
    }
    for (const l of this.listeners) l.chunkLoaded?.(c);
  }

  dispatchMesh(c) {
    c.meshing = true;
    c.priority = false;
    const w = this.pickWorker(); w.busy++;
    if (HAS_SAB) { w.postMessage({ type: 'mesh', cx: c.cx, cz: c.cz, version: c.version }); return; }
    // no shared memory: send copies of the 3x3 neighbourhood (only the rows the mesher reads: a prefix of the y-major array)
    const chunks = [], transfer = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get(ckey(c.cx + dx, c.cz + dz));
      if (!n) continue;
      let top = 0;
      for (let i = 0; i < 256; i++) if (n.heightmap[i] > top) top = n.heightmap[i];
      const rows = Math.min(HEIGHT, top + 4);
      const blocks = n.blocks.slice(0, rows * 256), biomes = n.biomes.slice(), heightmap = n.heightmap.slice();
      chunks.push({ cx: n.cx, cz: n.cz, blocks, biomes, heightmap });
      transfer.push(blocks.buffer, biomes.buffer, heightmap.buffer);
    }
    w.postMessage({ type: 'mesh', cx: c.cx, cz: c.cz, version: c.version, chunks }, transfer);
  }

  onMeshed(msg) {
    const c = this.chunks.get(ckey(msg.cx, msg.cz));
    this.genStats.mesh++; this.genStats.meshMs += msg.ms;
    if (!c) return;
    c.meshing = false;
    c.meshedVersion = msg.version;
    c.light = new Uint8Array(msg.light);
    if (this.onMesh) this.onMesh(c, msg);
  }

  unloadChunk(c) {
    if (this.storage && c.modified) this.storage.saveChunk(c, this.blockEntitiesIn(c));
    this.chunks.delete(c.key);
    if (HAS_SAB) for (const w of this.workers) w.postMessage({ type: 'unregister', key: c.key });
    if (this.onUnload) this.onUnload(c);
    // drop block entities of this chunk
    for (const k of this.blockEntitiesIn(c).map(e => e[0])) this.blockEntities.delete(k);
  }

  blockEntitiesIn(c) {
    const res = [];
    for (const [k, be] of this.blockEntities) {
      const [x, , z] = k.split(',').map(Number);
      if (x >> 4 === c.cx && z >> 4 === c.cz) res.push([k, be]);
    }
    return res;
  }

  saveAll() {
    if (!this.storage) return Promise.resolve();
    const ps = [];
    for (const c of this.chunks.values()) if (c.modified && c.state === 2) ps.push(this.storage.saveChunk(c, this.blockEntitiesIn(c)));
    return Promise.all(ps);
  }

  setRenderDistance(r) { this.renderDistance = r; this._lastCenter = null; }

  destroy() {
    for (const w of this.workers) w.terminate();
    this.workers = [];
  }

  // ---- Geometry queries ---------------------------------------------------------------------------------
  // collect collision boxes intersecting an AABB (world coords)
  getCollisions(minX, minY, minZ, maxX, maxY, maxZ, out = []) {
    out.length = 0;
    const x0 = Math.floor(minX), x1 = Math.floor(maxX), y0 = Math.floor(minY) - 1, y1 = Math.floor(maxY), z0 = Math.floor(minZ), z1 = Math.floor(maxZ);
    const get = (x, y, z) => this.getBlock(x, y, z);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const v = this.getBlock(x, y, z);
      if (v === 0) continue;
      if (!this.isLoaded(x, z)) { out.push([x, y, z, x + 1, y + 1, z + 1]); continue; }
      const bx = collisionBoxes(v, get, x, y, z);
      if (!bx) continue;
      for (const b of bx) {
        const a = [x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]];
        if (a[3] > minX && a[0] < maxX && a[4] > minY && a[1] < maxY && a[5] > minZ && a[2] < maxZ) out.push(a);
      }
    }
    return out;
  }

  // DDA raycast against selection boxes. Returns {x,y,z,face,dist,hit:[px,py,pz],v} or null
  raycast(ox, oy, oz, dx, dy, dz, maxDist, opts = {}) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity, tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity, tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx > 0 ? (x + 1 - ox) * tdx : dx < 0 ? (ox - x) * tdx : Infinity;
    let tmy = dy > 0 ? (y + 1 - oy) * tdy : dy < 0 ? (oy - y) * tdy : Infinity;
    let tmz = dz > 0 ? (z + 1 - oz) * tdz : dz < 0 ? (oz - z) * tdz : Infinity;
    const get = (a, b, c) => this.getBlock(a, b, c);
    for (let i = 0; i < 256; i++) {
      const v = this.getBlock(x, y, z);
      if (v !== 0) {
        const t = v & TYPE_MASK;
        const isFluid = T_FLUID[t] && !BLOCKS[t].waterlogged;
        if (isFluid ? (opts.fluids && (metaOf(v) & 7) === 0) : true) {
          const boxes = isFluid ? [[0, 0, 0, 1, 8 / 9, 1]] : selectionBoxes(v, get, x, y, z);
          if (boxes) {
            let best = null;
            for (const b of boxes) {
              const r = rayBox(ox, oy, oz, dx, dy, dz, x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]);
              if (r && r.t <= maxDist && (!best || r.t < best.t)) best = r;
            }
            if (best) return { x, y, z, face: best.face, dist: best.t, hit: [ox + dx * best.t, oy + dy * best.t, oz + dz * best.t], v, boxes };
          }
        }
      }
      if (Math.min(tmx, tmy, tmz) > maxDist + 1) break;
      if (tmx < tmy && tmx < tmz) { x += sx; tmx += tdx; }
      else if (tmy < tmz) { y += sy; tmy += tdy; }
      else { z += sz; tmz += tdz; }
    }
    return null;
  }

  // ---- Simulation ---------------------------------------------------------------------------------------
  schedule(x, y, z, delay) {
    const k = x + ',' + y + ',' + z;
    const due = this.tickCount + delay;
    const cur = this.scheduled.get(k);
    if (cur === undefined || cur > due) this.scheduled.set(k, due);
  }

  notifyNeighbors(x, y, z, oldV, newV) {
    for (let f = 0; f < 6; f++) {
      const d = FACE_DIR[f];
      this.neighborChanged(x + d[0], y + d[1], z + d[2], x, y, z);
    }
    this.neighborChanged(x, y, z, x, y, z);
  }

  neighborChanged(x, y, z) {
    const v = this.getBlock(x, y, z);
    const t = v & TYPE_MASK;
    if (t === 0) return;
    const b = BLOCKS[t];
    if (T_FLUID[t] && !b.waterlogged) { this.schedule(x, y, z, T_FLUID[t] === 1 ? 5 : 30); return; }
    if (b.waterlogged) {
      // waterlogged plants also spread water
      this.schedule(x, y, z, 5);
    }
    if (b.gravity) { this.schedule(x, y, z, 2); return; }
    if (!this.canSurvive(v, x, y, z)) this.schedule(x, y, z, 0);
    else if (b.rail) this.schedule(x, y, z, 1);
  }

  canSurvive(v, x, y, z) {
    const t = v & TYPE_MASK, b = BLOCKS[t], m = v >>> META_SHIFT;
    const below = this.getBlock(x, y - 1, z), bt = below & TYPE_MASK;
    const belowSolid = T_SOLID[bt] && (BLOCKS[bt].model === 'cube' || (BLOCKS[bt].model === 'slab' && (below >>> META_SHIFT) !== 0) || BLOCKS[bt].model === 'farmland' || BLOCKS[bt].model === 'stairs' && ((below >>> META_SHIFT) & 4));
    switch (b.model) {
      case 'cross': {
        if (b.name === 'cobweb') return true;
        if (b.waterlogged) return T_SOLID[bt] || bt === ID.kelp_plant || bt === ID.kelp;
        if (t === ID.sugar_cane) {
          if (bt === ID.sugar_cane) return true;
          if (![ID.grass_block, ID.dirt, ID.sand, ID.red_sand, ID.podzol, ID.coarse_dirt].includes(bt)) return false;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T_FLUID[this.getBlock(x + dx, y - 1, z + dz) & TYPE_MASK] === 1) return true;
          return false;
        }
        if (t === ID.dead_bush) return [ID.sand, ID.red_sand, ID.terracotta, ID.dirt, ID.grass_block, ID.coarse_dirt, ID.podzol].includes(bt) || BLOCKS[bt].name.endsWith('terracotta');
        if (b.name.endsWith('mushroom')) return T_SOLID[bt] && T_OPAQUE[bt];
        return [ID.grass_block, ID.dirt, ID.coarse_dirt, ID.podzol, ID.farmland].includes(bt);
      }
      case 'double_plant': {
        if (m & 1) return (below & TYPE_MASK) === t;
        const above = this.getBlock(x, y + 1, z);
        if ((above & TYPE_MASK) !== t) return false;
        if (b.waterlogged) return T_SOLID[bt];
        return [ID.grass_block, ID.dirt, ID.coarse_dirt, ID.podzol, ID.farmland].includes(bt);
      }
      case 'crop': return bt === ID.farmland;
      case 'petals': return [ID.grass_block, ID.dirt, ID.coarse_dirt, ID.podzol].includes(bt);
      case 'torch': {
        if (m === 0) return belowSolid || BLOCKS[bt].model === 'fence' || BLOCKS[bt].model === 'wall';
        const f = m - 1; const d = [[0, 1], [0, -1], [1, 0], [-1, 0]][f];
        const wall = this.getBlock(x + d[0], y, z + d[1]) & TYPE_MASK;
        return T_OPAQUE[wall] === 1;
      }
      case 'rail': return belowSolid;
      case 'lily_pad': return T_FLUID[bt] === 1 && !BLOCKS[bt].waterlogged;
      case 'cactus': {
        if (bt !== ID.cactus && bt !== ID.sand && bt !== ID.red_sand) return false;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (T_SOLID[this.getBlock(x + dx, y, z + dz) & TYPE_MASK]) return false;
        return true;
      }
      case 'layer': return T_OPAQUE[bt] === 1 || (bt === ID.snow && ((below >>> META_SHIFT) & 7) === 7) || BLOCKS[bt].name.endsWith('leaves');
      case 'carpet': return bt !== 0;
      case 'door': {
        if (m & 8) return (below & TYPE_MASK) === t;
        return belowSolid && (this.getBlock(x, y + 1, z) & TYPE_MASK) === t;
      }
      case 'ladder': {
        const f = m & 3; const d = [[0, 1], [0, -1], [1, 0], [-1, 0]][f];
        return T_OPAQUE[this.getBlock(x + d[0], y, z + d[1]) & TYPE_MASK] === 1;
      }
      case 'lantern': {
        if (m & 1) { const a = this.getBlock(x, y + 1, z) & TYPE_MASK; return T_SOLID[a] || BLOCKS[a].model === 'fence' || BLOCKS[a].model === 'pane'; }
        return T_SOLID[bt] || BLOCKS[bt].model === 'fence' || BLOCKS[bt].model === 'wall';
      }
      case 'fire': return T_SOLID[bt] || bt === ID.netherrack;
      default: return true;
    }
  }

  // runs scheduled ticks (called at 20 TPS)
  tick(game) {
    this.tickCount++;
    this.time = (this.time + 1);
    if (this.time >= 24000) { this.time -= 24000; this.dayCount++; }
    // scheduled
    const due = [];
    for (const [k, t] of this.scheduled) if (t <= this.tickCount) due.push(k);
    let n = 0;
    for (const k of due) {
      if (n++ > 2000) break;
      this.scheduled.delete(k);
      const [x, y, z] = k.split(',').map(Number);
      this.scheduledTick(x, y, z, game);
    }
  }

  scheduledTick(x, y, z, game) {
    const v = this.getBlock(x, y, z);
    const t = v & TYPE_MASK;
    if (t === 0) return;
    const b = BLOCKS[t];
    if (T_FLUID[t] && !b.waterlogged) { this.fluidTick(x, y, z, v); return; }
    if (b.waterlogged) this.spreadFluid(x, y, z, 1, 7, false);
    if (b.gravity) {
      const below = this.getBlock(x, y - 1, z);
      const bt = below & TYPE_MASK;
      if (bt === 0 || T_FLUID[bt] || (T_REPLACEABLE[bt] && !T_SOLID[bt])) {
        this.setBlock(x, y, z, 0);
        game?.spawnFallingBlock?.(x, y, z, v);
      }
      return;
    }
    if (b.rail) { game?.railUpdate?.(x, y, z); return; }
    if (!this.canSurvive(v, x, y, z)) {
      game?.breakBlockNaturally?.(x, y, z, v, true);
    }
  }

  // ---- Fluids (FlowingFluid port) -----------------------------------------------------------------------
  fluidAmount(v, ft) {
    const t = v & TYPE_MASK;
    if (T_FLUID[t] !== ft) return 0;
    if (BLOCKS[t].waterlogged) return 8;
    const m = v >>> META_SHIFT;
    if (m & 8) return 8;
    return 8 - (m & 7);
  }
  isSource(v) { const t = v & TYPE_MASK; return T_FLUID[t] && (BLOCKS[t].waterlogged || (v >>> META_SHIFT) === 0); }

  canFlowInto(v, ft) {
    const t = v & TYPE_MASK;
    if (t === 0) return true;
    if (T_FLUID[t]) return T_FLUID[t] === ft && !BLOCKS[t].waterlogged && !this.isSource(v);
    const b = BLOCKS[t];
    if (b.waterlogged) return false;
    return !b.solid && b.model !== 'portal' && (b.replaceable || b.model === 'cross' || b.model === 'double_plant' || b.model === 'torch' || b.model === 'rail' || b.model === 'crop' || b.model === 'fire' || b.model === 'petals' || b.model === 'vine');
  }

  fluidTick(x, y, z, v) {
    const t = v & TYPE_MASK, ft = T_FLUID[t];
    const fluidBlock = ft === 1 ? ID.water : ID.lava;
    const drop = ft === 1 ? 1 : 2;
    // lava/water interaction
    if (ft === 2) {
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
        if (T_FLUID[this.getBlock(x + dx, y + dy, z + dz) & TYPE_MASK] === 1) {
          this.setBlock(x, y, z, this.isSource(v) ? ID.obsidian : ID.cobblestone);
          this.game?.audio?.play('random.fizz', { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
          return;
        }
      }
    }
    let cur = v;
    if (!this.isSource(v)) {
      // compute new state
      let want;
      const above = this.getBlock(x, y + 1, z);
      if (T_FLUID[above & TYPE_MASK] === ft) want = mk(fluidBlock, 8);
      else {
        let maxA = 0, sources = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.getBlock(x + dx, y, z + dz);
          if (T_FLUID[n & TYPE_MASK] !== ft) continue;
          if (this.isSource(n)) sources++;
          maxA = Math.max(maxA, this.fluidAmount(n, ft));
        }
        const below = this.getBlock(x, y - 1, z);
        if (ft === 1 && sources >= 2 && (T_SOLID[below & TYPE_MASK] || this.isSource(below))) want = mk(fluidBlock, 0);
        else {
          const a = maxA - drop;
          want = a <= 0 ? 0 : mk(fluidBlock, 8 - a);
        }
      }
      if (want !== v) {
        this.setBlock(x, y, z, want);
        if (want === 0) return;
        cur = want;
        this.schedule(x, y, z, ft === 1 ? 5 : 30);
      }
    }
    this.spreadFluid(x, y, z, ft, this.fluidAmount(cur, ft), this.isSource(cur));
  }

  spreadFluid(x, y, z, ft, amount, isSource) {
    const fluidBlock = ft === 1 ? ID.water : ID.lava;
    const drop = ft === 1 ? 1 : 2;
    const delay = ft === 1 ? 5 : 30;
    const below = this.getBlock(x, y - 1, z);
    const bt = below & TYPE_MASK;
    // lava below water -> stone
    if (ft === 1 && T_FLUID[bt] === 2) {
      this.setBlock(x, y - 1, z, this.isSource(below) ? ID.obsidian : ID.stone);
      return;
    }
    if (this.canFlowInto(below, ft) && y - 1 >= MIN_Y) {
      if (bt !== 0 && !T_FLUID[bt]) this.game?.breakBlockNaturally?.(x, y - 1, z, below, true);
      this.setBlock(x, y - 1, z, mk(fluidBlock, 8));
      this.schedule(x, y - 1, z, delay);
      if (!isSource) return;
      let srcN = 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.isSource(this.getBlock(x + dx, y, z + dz)) && T_FLUID[this.getBlock(x + dx, y, z + dz) & TYPE_MASK] === ft) srcN++;
      if (srcN < 3) return;
    } else if (T_FLUID[bt] === ft && !this.isSource(below) && !(BLOCKS[bt].waterlogged)) {
      // flowing into existing flowing fluid below acts like a hole
      if (!isSource) return;
    }
    const a = (amount >= 8 ? 8 : amount) - drop;
    if (a <= 0) return;
    // find directions toward nearest drop within slope distance
    const slope = ft === 1 ? 4 : 2;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = 1000;
    const costs = [];
    for (const [dx, dz] of dirs) {
      const n = this.getBlock(x + dx, y, z + dz);
      if (!this.canFlowInto(n, ft) && !(T_FLUID[n & TYPE_MASK] === ft && !this.isSource(n))) { costs.push(1000); continue; }
      let c;
      const nb = this.getBlock(x + dx, y - 1, z + dz);
      if (this.canFlowInto(nb, ft) || (T_FLUID[nb & TYPE_MASK] === ft)) c = 0;
      else c = this.slopeDistance(x + dx, y, z + dz, 1, -dx, -dz, ft, slope);
      costs.push(c);
      if (c < best) best = c;
    }
    for (let i = 0; i < 4; i++) {
      if (costs[i] >= 1000 || costs[i] !== best) continue;
      const [dx, dz] = dirs[i];
      const nx = x + dx, nz = z + dz;
      const n = this.getBlock(nx, y, nz);
      const nt = n & TYPE_MASK;
      if (T_FLUID[nt] === ft) { if (this.fluidAmount(n, ft) >= a) continue; }
      else if (T_FLUID[nt]) {
        // meeting the other fluid
        if (ft === 2) { this.setBlock(nx, y, nz, ID.cobblestone); }
        continue;
      }
      if (!this.canFlowInto(n, ft)) continue;
      if (nt !== 0 && !T_FLUID[nt]) this.game?.breakBlockNaturally?.(nx, y, nz, n, true);
      this.setBlock(nx, y, nz, mk(fluidBlock, 8 - a));
      this.schedule(nx, y, nz, delay);
    }
  }

  slopeDistance(x, y, z, depth, fromDx, fromDz, ft, maxDepth) {
    let best = 1000;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (dx === fromDx && dz === fromDz) continue;
      const n = this.getBlock(x + dx, y, z + dz);
      if (!this.canFlowInto(n, ft) && !(T_FLUID[n & TYPE_MASK] === ft && !this.isSource(n))) continue;
      const nb = this.getBlock(x + dx, y - 1, z + dz);
      if (this.canFlowInto(nb, ft) || T_FLUID[nb & TYPE_MASK] === ft) return depth;
      if (depth < maxDepth) {
        const d = this.slopeDistance(x + dx, y, z + dz, depth + 1, -dx, -dz, ft, maxDepth);
        if (d < best) best = d;
      }
    }
    return best;
  }
}

// ray vs AABB; returns {t, face} where face is the face index hit (0 down..5 east)
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity, face = -1;
  const ax = [[ox, dx, x0, x1, 4, 5], [oy, dy, y0, y1, 0, 1], [oz, dz, z0, z1, 2, 3]];
  for (const [o, d, lo, hi, fneg, fpos] of ax) {
    if (Math.abs(d) < 1e-12) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, f1 = fneg, f2 = fpos;
    if (t1 > t2) { [t1, t2] = [t2, t1]; [f1, f2] = [f2, f1]; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  return { t: Math.max(0, tmin), face };
}
