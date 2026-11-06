// Chunk worker: terrain generation + light + meshing. Chunk data lives in SharedArrayBuffers shared with the main thread
// when the page is cross-origin isolated; otherwise generated chunks are transferred back and mesh jobs carry copies.
import { initMesher, meshChunk } from './mesher.js';
import { CHUNK_VOL, CHUNK_BYTES, BIOME_OFF, HEIGHTMAP_OFF, ckey } from './constants.js';

const chunks = new Map();
let generator = null;

function view(sab) {
  return {
    blocks: new Uint16Array(sab, 0, CHUNK_VOL),
    biomes: new Uint8Array(sab, BIOME_OFF, 256),
    heightmap: new Int16Array(sab, HEIGHTMAP_OFF, 256),
  };
}
const getChunk = (cx, cz) => chunks.get(ckey(cx, cz));

async function loadGenerator(seed) {
  try {
    const mod = await import('./gen/generator.js');
    generator = new mod.Generator(seed);
  } catch (e) {
    console.warn('Falling back to stub generator:', e);
    const mod = await import('./stubgen.js');
    generator = new mod.Generator(seed);
  }
}

let ready = null;
self.onmessage = async (e) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      initMesher(msg.texLayers, msg.biomeColors);
      ready = loadGenerator(msg.seed);
      await ready;
      self.postMessage({ type: 'ready' });
      break;
    case 'register':
      chunks.set(msg.key, view(msg.sab));
      break;
    case 'unregister':
      chunks.delete(msg.key);
      break;
    case 'gen': {
      await ready;
      const t0 = performance.now();
      const buf = msg.sab || new ArrayBuffer(CHUNK_BYTES);
      const ch = view(buf);
      if (msg.sab) chunks.set(ckey(msg.cx, msg.cz), ch);
      const res = generator.generateChunk(msg.cx, msg.cz, ch.blocks) || {};
      if (res.biomes) ch.biomes.set(res.biomes);
      // heightmap as internal y index
      const hm = ch.heightmap;
      const b = ch.blocks;
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        let y = 383;
        while (y >= 0 && b[(y * 16 + z) * 16 + x] === 0) y--;
        hm[z * 16 + x] = y;
      }
      const outside = res.outside ? (res.outside instanceof Int32Array ? res.outside : Int32Array.from(res.outside.flat ? res.outside.flat() : res.outside)) : new Int32Array(0);
      if (msg.sab) self.postMessage({ type: 'gen', id: msg.id, cx: msg.cx, cz: msg.cz, outside, ms: performance.now() - t0 }, [outside.buffer]);
      else self.postMessage({ type: 'gen', id: msg.id, cx: msg.cx, cz: msg.cz, outside, buffer: buf, ms: performance.now() - t0 }, [outside.buffer, buf]);
      break;
    }
    case 'mesh': {
      const t0 = performance.now();
      let get = getChunk;
      if (msg.chunks) {
        const local = new Map();
        for (const c of msg.chunks) local.set(ckey(c.cx, c.cz), c);
        get = (cx, cz) => local.get(ckey(cx, cz));
      }
      const r = meshChunk(msg.cx, msg.cz, get);
      self.postMessage({ type: 'mesh', id: msg.id, cx: msg.cx, cz: msg.cz, version: msg.version, data: r.data, layers: r.layers, light: r.light, ms: performance.now() - t0 }, [r.data, r.light.buffer]);
      break;
    }
    case 'biomeAt': {
      await ready;
      self.postMessage({ type: 'biomeAt', id: msg.id, biome: generator.biomeAt(msg.x, msg.y, msg.z) });
      break;
    }
    case 'spawn': {
      await ready;
      self.postMessage({ type: 'spawn', id: msg.id, pos: generator.findSpawn() });
      break;
    }
  }
};
