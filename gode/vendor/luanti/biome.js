/* gode/vendor/luanti/biome.js —— Luanti「原版」群系生成（热度 / 湿度最近点 + 垂直范围 + 垂直渗透），独立重写；参考：mg_biome.cpp BiomeGenOriginal。
   群系表是声明式数据（defl/g/lt/biomes.tsv → rows），本模块不含任何群系内容。 */
import { np, fractal2d } from './noise.js';
import { PcgRandom } from './pcg.js';

export const LIMIT = 31007;   // MAX_MAP_GENERATION_LIMIT
// mg_biome 默认噪声
export const BIOME_NP = {
  heat: np({ offset: 50, scale: 50, spread: 1000, seed: 5349, octaves: 3, persist: 0.5 }),
  humid: np({ offset: 50, scale: 50, spread: 1000, seed: 842, octaves: 3, persist: 0.5 }),
  heatBlend: np({ offset: 0, scale: 1.5, spread: 8, seed: 13, octaves: 2, persist: 1.0 }),
  humidBlend: np({ offset: 0, scale: 1.5, spread: 8, seed: 90003, octaves: 2, persist: 1.0 }),
};

// tsv 文本 → 行对象（# 开头为注释，第一条非注释行是表头）
export function parseTsv(text) {
  let head = null; const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line[0] === '#') continue;
    const f = line.replace(/\r$/, '').split('\t');
    if (!head) { head = f; continue; }
    const r = {}; head.forEach((k, i) => { r[k] = f[i] ?? ''; });
    rows.push(r);
  }
  return rows;
}

/* rows → 群系集。id(name) 把节点名换成调用者的数字 id（'' → 0 = 不设）。
   第 0 项是默认群系（没有任何群系命中时用）：全石头，stone / water / river 取调用者给的。 */
export class BiomeSet {
  constructor(rows, id, base) {
    const d = { index: 0, name: 'default', ymin: -LIMIT, ymax: LIMIT, heat: 50, humid: 50, vblend: 0, weight: 1, top: base.stone, dtop: 0, filler: base.stone, dfiller: 0, stone: base.stone,
      wtop: base.water, dwtop: 0, water: base.water, river: base.river, riverbed: base.stone, driverbed: 0, dust: 0, color: 0x808080 };
    this.list = [d];
    for (const r of rows) {
      const n = (k, def = 0) => (r[k] === '' || r[k] === undefined ? def : Number(r[k]));
      this.list.push({ index: this.list.length, name: r.name, ymin: n('y_min', -LIMIT), ymax: n('y_max', LIMIT), heat: n('heat', 50), humid: n('humid', 50), vblend: n('vblend'), weight: r.weight ? Number(r.weight) : 1,
        top: id(r.top) || base.stone, dtop: n('dtop'), filler: id(r.filler) || base.stone, dfiller: n('dfiller'), stone: id(r.stone) || base.stone,
        wtop: id(r.wtop) || base.water, dwtop: n('dwtop'), water: id(r.water) || base.water, river: id(r.river) || base.river, riverbed: id(r.riverbed) || base.stone, driverbed: n('driverbed'),
        dust: id(r.dust), color: r.color ? Number(r.color) : 0x808080 });
    }
    // 垂直过渡点（从高到低）：每个群系的 ymax 与 ymin−1
    const v = new Set();
    for (const b of this.list) { v.add(b.ymax); if (b.ymin > -LIMIT) v.add(b.ymin - 1); }
    this.trans = [...v].sort((a, b) => b - a);
  }
  // 第一个 < y 的过渡点（没有则 -32768）
  nextTransitionY(y) { for (const t of this.trans) if (t < y) return t; return -32768; }
  // 热度 / 湿度 / y → 群系（含垂直渗透）。最近点距离 = Δheat² + Δhumid²（÷ weight）
  at(heat, humid, y) {
    let best = null, bestBlend = null, dmin = Infinity, dminBlend = Infinity;
    for (let i = 1; i < this.list.length; i++) {
      const b = this.list[i];
      if (y < b.ymin || y > b.ymax + b.vblend) continue;
      const dh = heat - b.heat, dm = humid - b.humid;
      let dist = dh * dh + dm * dm;
      if (b.weight > 0) dist /= b.weight;
      if (y <= b.ymax) { if (dist < dmin) { dmin = dist; best = b; } }
      else if (dist < dminBlend) { dminBlend = dist; bestBlend = b; }
    }
    if (bestBlend && dminBlend <= dmin) {
      const rng = new PcgRandom(Math.trunc(y + (heat + humid) * 0.9));
      if (rng.range(0, bestBlend.vblend) >= y - bestBlend.ymax) return bestBlend;
    }
    return best ?? this.list[0];
  }
}

// 一列的热度 / 湿度（噪声 + 细尺度混合），seed = 世界种子
export function heatHumid(seed, x, z, out = [0, 0]) {
  out[0] = fractal2d(BIOME_NP.heat, x, z, seed) + fractal2d(BIOME_NP.heatBlend, x, z, seed);
  out[1] = fractal2d(BIOME_NP.humid, x, z, seed) + fractal2d(BIOME_NP.humidBlend, x, z, seed);
  return out;
}
