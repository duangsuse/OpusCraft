/* gode/defl/g/lt/adapter.js —— Luanti 系生成器的 Worker 适配（slicer 契约，s02 §2）：adapter('luan0' | 'luanV') → { meta, onkwarg, gen, sample, spawn }。
   规范 y = Luanti 原生 y + 64（同 liq）：原生 −64…191 ↔ 规范 0…255，海平面 water_level 1 ↔ 65。无外写（地形与群系都是逐点的，没有跨块特征；装饰 / 矿 / 地牢另说）。 */
import { createGen, DY, KNOBS } from './core.js';
import { colReduce } from '../../../w/slicer.js';

export function adapter(mg) {
  let G = null, text = null, dtext = null;
  const col = new Uint16Array(256);
  const meta0 = { id: mg, ver: 1, sea: 1 + DY, h: 256, y0: -DY, outside: false, knobs: KNOBS[mg], names: ['air', 'stone', 'water', 'river_water'], biomes: ['default'] };
  const api = {
    meta: meta0,
    async onkwarg({ seed, kw }) {
      text ??= await (await fetch(new URL('./biomes.tsv', import.meta.url))).text();
      dtext ??= { decorations: await (await fetch(new URL('./decorations.json', import.meta.url))).text(), schematics: await (await fetch(new URL('./schematics.json', import.meta.url))).text() };
      G = await createGen(mg, seed, { biomesText: text, decoText: dtext, kw });
      api.meta = { ...meta0, sea: G.waterLevel + DY, names: G.names, biomes: G.biomes.list.map(b => b.name), colors: { biomes: G.biomes.list.map(b => b.color) } };
      return { meta: api.meta };
    },
    // depth：装饰前驱可见性层数（缺省 = knob deco.depth）；pgviz 外圈 2D 的 col 用 0（省 2–4 倍时间，树的位置在块边界附近略有出入）
    gen({ cx, cz }, out, depth) {
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const c = z * 16 + x, b = G.baseCol(cx * 16 + x, cz * 16 + z);   // 默认 y 范围 = 原生 −64…191，下标即规范 y
        G.finalColumn(cx * 16 + x, cz * 16 + z, col, depth);
        const r = b;
        let top = -1;
        for (let y = 0; y < 256; y++) { const v = col[y]; if (v) { out.blocks[(y << 8) | c] = v; top = y; } }
        out.heights[c] = top; out.biomes[c] = r.biome;
      }
      return { outside: new Int32Array(0) };
    },
    // 列级地表（pgviz 外圈 2D，s13 V-8）：覆盖引擎默认 col（整块 gen 再归约）
    col({ cx, cz, cls }) {
      const out = { blocks: new Uint16Array(65536), biomes: new Uint8Array(256), heights: new Int16Array(256) };
      api.gen({ cx, cz }, out, 0);
      return { cx, cz, col: colReduce(out.blocks, out.biomes, cls) };
    },
    sample({ x, z }) {
      const hh = G.heatHumid(x, z), o = { biome: G.biomes.at(hh[0], hh[1], 30).index, heat: +hh[0].toFixed(2), humid: +hh[1].toFixed(2), ...G.terrain.sample(x, z) };
      return o;
    },
    spawn() {
      for (let r = 0; r < 64; r++) for (let a = 0; a < 8; a++) {
        const x = Math.round(Math.cos(a * Math.PI / 4) * r * 16), z = Math.round(Math.sin(a * Math.PI / 4) * r * 16), t = G.finalColumn(x, z, col);
        let top = -1; for (let y = 255; y >= 0; y--) if (col[y] && col[y] !== G.ids.water && col[y] !== G.ids.river) { top = y; break; }
        if (top > G.waterLevel + DY && col[top + 1] === 0 && top < 200) return [x + 0.5, top + 2, z + 0.5];
      }
      return [0.5, G.waterLevel + DY + 10, 0.5];
    },
  };
  return api;
}
