/* gode/main/rgl.js —— gode 世界 → rgl 的适配器（s03 §2；M1-6）：source / blockTable / env / meshPool + three 上下文。
   与宿主 B（rgl/host-b.js）的差别：
   · 区块是 YZX u16（type | meta<<12）+ 独立光照数组；padded / 段哈希 / 空段判断由这里提供（rgl/terrain.js 的 source.padded / secHash / secHas 钩子），
     type → goodGL id 走 glTable 的 lut（按生成器 meta.names 的名字对接，w/glid.js），宿主 B 的 SUBST 与 256 项 id LUT 都不再需要；
   · 网格不再自带 Worker：rgl 的 createWorld 拿 source.meshPool，请求发给 slicer 池的 mesh 动词（M1-3）；
   · 方块表按 type（4096 项）而不是 u8 id。 */
import { SH } from '../../vendor/gl/shared.js';
import { H, key } from './world.js';

const KIND_OF_RT = [0 /* none */, 1 /* cube */, 2 /* cross */, 4 /* liquid */, 3 /* torch */, 2 /* crop */, 1 /* cactus */, 1 /* low */, 1 /* chest */, 0 /* decal */];   // goal-renderapi MODEL_TO_KIND

export function blockTable(tbl, names) {
  const N = 4096, kind = new Uint8Array(N), emissive = new Uint8Array(N), opaque = new Uint8Array(N), solid = new Uint8Array(N), occupied = new Uint8Array(N), cullSelf = new Uint8Array(N), tile = new Uint8Array(N);
  for (let t = 1; t < N; t++) {
    const g = tbl.lut[t];
    kind[t] = KIND_OF_RT[SH.RT[g]] ?? 1; emissive[t] = Math.min(15, SH.EMIT[g]); opaque[t] = SH.OCC[g]; solid[t] = tbl.solid[t];
    occupied[t] = kind[t] && kind[t] !== 4 ? 1 : 0; cullSelf[t] = SH.CULLSAME[g] ? 1 : 0;
  }
  const id = (...ns) => { for (const n of ns) { const i = names.indexOf(n); if (i >= 0) return i; } return -1; };
  return { kind, emissive, opaque, solid, occupied, cullSelf, tileTop: tile, tileBot: tile, tileSide: tile, waterId: id('water'), leavesId: id('oak_leaves'), tallGrassId: id('short_grass', 'tall_grass') };
}

// rgl 的 padded()（rgl/terrain.js）的 YZX 版：18³，p = (y+1)*324 + (z+1)*18 + (x+1)；块缺失 = 石头 + 无光，y < 0 基岩，y ≥ H 空气 + 满天光
function makePadded(world, lut) {
  const bedrock = SH.BID.bedrock;
  return (cx, cz, s) => {
    const pb = new Uint8Array(5832), pm = new Uint8Array(5832), pl = new Uint8Array(5832), y0 = s * 16, cs = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) cs.push(world.chunks.get(key(cx + dx, cz + dz)));
    for (let z = -1; z <= 16; z++) {
      const czi = z < 0 ? 0 : z > 15 ? 2 : 1, lz = z & 15;
      for (let x = -1; x <= 16; x++) {
        const cxi = x < 0 ? 0 : x > 15 ? 2 : 1, lx = x & 15, ch = cs[czi * 3 + cxi];
        let p = (z + 1) * 18 + (x + 1);
        if (!ch) { for (let y = -1; y <= 16; y++, p += 324) { pb[p] = 1; pl[p] = 0; } continue; }
        const col = (lz << 4) | lx, B = ch.blocks, L = ch.light;
        for (let y = -1; y <= 16; y++, p += 324) {
          const wy = y0 + y;
          if (wy < 0) { pb[p] = bedrock; pl[p] = 0; continue; }
          if (wy >= H) { pb[p] = 0; pl[p] = 0xf0; continue; }
          const v = B[(wy << 8) | col]; pb[p] = lut[v & 0xfff]; pm[p] = v >> 12; pl[p] = L[(wy << 8) | col];
        }
      }
    }
    return { pb, pm, pl };
  };
}

// 段 s = 连续 4096 格（YZX）：内容哈希（方块 + 光照）与「有没有方块」
function secHash(ch, s) {
  const B = ch.blocks, L = ch.light, o = s << 12; let h = 0x811c9dc5 | 0;
  for (let i = o; i < o + 4096; i++) { h = Math.imul(h ^ B[i], 16777619); h = Math.imul(h ^ L[i], 16777619); }
  return h;
}
function secHas(ch, s) { const B = ch.blocks, o = s << 12; for (let i = o; i < o + 4096; i++) if (B[i]) return true; return false; }

// rgl 的 WorkerPool 接口（submit / local / mode / pumpLocal）→ slicer 池的 mesh 动词；池里没有空闲 worker 时排队，池每完成一个任务就来 drain
class MeshPool {
  constructor(pool) { this.pool = pool; this.q = []; this.local = false; this.mode = 'workers'; }
  submit(msg, tr, cb) { const { type, ...arg } = msg; this.q.push([arg, tr, cb]); this.drain(); }
  drain() {
    while (this.q.length) {
      const [arg, tr, cb] = this.q[0];
      const ok = this.pool.job('mesh', arg, cb, () => cb({ opaque: null, on: 0, trans: null, tn: 0, plant: null, pn: 0 }), tr);
      if (!ok) break; this.q.shift();
    }
  }
  pumpLocal() {}
  get pendingCount() { return this.q.length; }
}

export function glSource(world, tbl) {
  const cbs = [], lut = tbl.lut;
  world.onChunk((cx, cz, what) => { for (const f of cbs) f(cx, cz, what); });
  const pool = new MeshPool(world.pool);
  const prev = world.pool.pump;
  world.pool.pump = () => { pool.drain(); world.pump(); prev?.(); };   // 网格先于生成（近处看得见的先出）
  return {
    size: 16, height: H, layout: 'yzx16', meshPool: pool,
    padded: makePadded(world, lut), secHash, secHas,
    getChunk(cx, cz) { const c = world.chunks.get(key(cx, cz)); return c ? { blocks: c.blocks, light: c.light, biomes: c.biomes, rev: c.rev } : null; },
    getBlocks(cx, cz) { return world.chunks.get(key(cx, cz))?.blocks; },
    getBlock: (x, y, z) => world.getBlock(x, y, z),
    forEachChunk(fn) { for (const c of [...world.chunks.values()]) fn(c.cx, c.cz); },
    onChunkChanged(cb) { cbs.push(cb); },
    onBlockChanged(cb) { world.onBlock(cb); },
  };
}

// 时间 / 天气 / 水下（s07 的世界状态；M1 先是静态时钟：c.hour，0 = 06:00 = goodGL 的 tick 0）
export function glEnv(world, ctl, clock) {
  const p = ctl.p, eye = () => [Math.floor(p.x), Math.floor(p.y + p.eyeHeight), Math.floor(p.z)];
  return {
    get dayTime() { return clock.day(); },
    get weather() { return clock.weather; },
    get flying() { return !!(p.flying || p.noclip); },
    get eyeInWater() { return !!p.headInWater; },
    get eyeSky() { const [x, y, z] = eye(); return (world.lightAt(x, y, z) >> 4) / 15; },
    get eyeBlk() { const [x, y, z] = eye(); return (world.lightAt(x, y, z) & 15) / 15; },
    get eyeWaterTop() {
      if (!p.headInWater) return undefined;
      const [x, y0, z] = eye(); let y = y0; while (y < H && ctl.tbl.fluid[world.getBlock(x, y + 1, z)]) y++;
      return y + 1 - 1 / 9;
    },
    get time() { return (performance.now() / 1000) % 3600; },
    underwater() {},
  };
}

/** 建 rgl：THREE 是宿主 import 的命名空间；renderer / camera / scene 由宿主建好（共享同一个 WebGL2 上下文，rgl 画完调 resetState 还给 three） */
export async function createGl({ THREE, renderer, camera, scene, world, tbl, names, ctl, clock, rd }) {
  if (tbl.miss.length) console.warn('[gode] goodGL 没有也没有代用品的方块（当石头）:', tbl.miss.join(' '));
  renderer.autoClear = false;
  const source = glSource(world, tbl);
  const ctx = {
    THREE, scene, camera, renderer,
    settings: { get rd() { return rd(); }, get fov() { return camera.fov; } },
    source, blockTable: blockTable(tbl, names), env: glEnv(world, ctl, clock), glid: new Uint8Array(256),
    SOLID: tbl.solid, getBlock: (x, y, z) => world.getBlock(x, y, z),
  };
  const { createRenderer } = await import('../../rgl/index.js');
  return createRenderer(ctx);
}
