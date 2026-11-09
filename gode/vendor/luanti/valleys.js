/* gode/vendor/luanti/valleys.js —— Luanti mapgen valleys 的地形（河谷剖面 + 河流 + 随海拔 / 河流改热度湿度），列式独立重写；参考：mapgen_valleys.cpp。
   默认值 = 参考的默认噪声与 spflags「altitude_chill,humid_rivers,vary_river_depth,altitude_dry」。 */
import { np, fractal2d, col3d } from './noise.js';

export const VALLEYS_NP = {
  fillerDepth: { offset: 0, scale: 1.2, spread: 256, seed: 1605, octaves: 3, persist: 0.5 },
  interValleyFill: { offset: 0, scale: 1, spread: [256, 512, 256], seed: 1993, octaves: 6, persist: 0.8 },
  interValleySlope: { offset: 0.5, scale: 0.5, spread: 128, seed: 746, octaves: 1, persist: 1.0 },
  rivers: { offset: 0, scale: 1, spread: 256, seed: -6050, octaves: 5, persist: 0.6 },
  terrainHeight: { offset: -10, scale: 50, spread: 1024, seed: 5202, octaves: 6, persist: 0.4 },
  valleyDepth: { offset: 5, scale: 4, spread: 512, seed: -1914, octaves: 1, persist: 1.0 },
  valleyProfile: { offset: 0.6, scale: 0.5, spread: 512, seed: 777, octaves: 1, persist: 1.0 },
  cavern: { offset: 0, scale: 1, spread: [768, 256, 768], seed: 59033, octaves: 6, persist: 0.63 },
  cave1: { offset: 0, scale: 12, spread: 61, seed: 52534, octaves: 3, persist: 0.5 },
  cave2: { offset: 0, scale: 12, spread: 67, seed: 10325, octaves: 3, persist: 0.5 },
};
export const VALLEYS_KNOBS = [
  { k: 'terrain.shift', key: 'shift', def: 0, min: -60, max: 60, note: '地形整体抬升（格）' },
  { k: 'terrain.contScale', key: 'contScale', def: 1, min: 0.25, max: 4, note: '水平尺度（> 1 = 更大）' },
  { k: 'valley.depth', key: 'valleyDepth', def: 1, min: 0, max: 3, note: '河谷深度乘子（valley_d = (n·乘子)²，0 = 无谷）' },
  { k: 'river.size', key: 'riverSize', def: 5, min: 0, max: 20, note: '河宽（占河噪声的百分比，参考 river_size），0 = 无河' },
  { k: 'river.depth', key: 'riverDepth', def: 4, min: 0, max: 20, note: '河床深度（参考 river_depth）' },
  { k: 'cave.rate', key: 'caveRate', def: 1, min: 0, max: 3, note: '噪声交线洞宽度（cave_width ÷ rate），0 = 无洞' },
  { k: 'cavern.threshold', key: 'cavernThreshold', def: 0.6, min: 0, max: 1, note: '大洞穴阈值，越小洞越大（VoxeLibre 用 0.2）' },
  { k: 'cavern.limit', key: 'cavernLimit', def: -256, min: -256, max: 120, note: '大洞穴最高处（原生 y），默认在窗口之外' },
  { k: 'climate.altChill', key: 'altChill', def: 1, min: 0, max: 1, note: '热度随海拔降低（参考 altitude_chill；VoxeLibre 关，因为它的群系自带雪版）' },
  { k: 'climate.altDry', key: 'altDry', def: 1, min: 0, max: 1, note: '湿度随海拔降低（altitude_dry；VoxeLibre 关）' },
  { k: 'climate.humidRivers', key: 'humidRivers', def: 1, min: 0, max: 1, note: '河边湿度升高（humid_rivers；VoxeLibre 关，免得蘑菇岛群系老出现在河边）' },
  { k: 'river.varyDepth', key: 'varyDepth', def: 1, min: 0, max: 1, note: '河水位随热度 / 湿度变（vary_river_depth；VoxeLibre 保留）' },
];
export const VALLEYS_DEFAULTS = { caveWidth: 0.09, cavernLimit: -256, cavernTaper: 192, cavernThreshold: 0.6, waterLevel: 1, altitudeChill: 90,
  flags: { altChill: true, humidRivers: true, varyRiverDepth: true, altDry: true } };

export function makeValleys(seed, o = {}) {
  const P = { ...VALLEYS_DEFAULTS, ...o, flags: { ...VALLEYS_DEFAULTS.flags, ...o.flags } };
  const k = { shift: 0, contScale: 1, valleyDepth: 1, riverSize: 5, riverDepth: 4, caveRate: 1, cavernThreshold: 0.6, cavernLimit: -256, altChill: 1, altDry: 1, humidRivers: 1, varyDepth: 1, ...o.k };
  P.flags = { altChill: !!Math.round(k.altChill), altDry: !!Math.round(k.altDry), humidRivers: !!Math.round(k.humidRivers), varyRiverDepth: !!Math.round(k.varyDepth) };
  const sp = (s) => (Array.isArray(s) ? s.map(v => v * k.contScale) : s * k.contScale);
  const N = {};
  for (const n in VALLEYS_NP) N[n] = np({ ...VALLEYS_NP[n] });
  for (const n of ['interValleySlope', 'rivers', 'terrainHeight', 'valleyDepth', 'valleyProfile']) N[n] = np({ ...VALLEYS_NP[n], spread: sp(VALLEYS_NP[n].spread), ...(n === 'terrainHeight' ? { offset: VALLEYS_NP[n].offset + k.shift } : {}) });
  const wl = P.waterLevel, rsf = k.riverSize / 100, rdb = k.riverDepth + 1, ac = P.altitudeChill;
  const fillMax = (() => { let s = 0, g = 1; for (let i = 0; i < N.interValleyFill.octaves; i++) { s += g; g *= N.interValleyFill.persist; } return s * Math.abs(N.interValleyFill.scale); })();
  return {
    P, N, noises: N,
    // 填一列；bh = [heat, humid] 只读（河深用）。返回的 adjust(raw, lo, hi) 给出块 [lo, hi] 里用的修正后热度 / 湿度
    fill(x, z, col, ymin, ymax, ids, bh) {
      const ns = fractal2d(N.interValleySlope, x, z, seed), nr = fractal2d(N.rivers, x, z, seed), nth = fractal2d(N.terrainHeight, x, z, seed);
      const nv = fractal2d(N.valleyDepth, x, z, seed) * k.valleyDepth, nvp = fractal2d(N.valleyProfile, x, z, seed);
      const valleyD = nv * nv, base = nth + valleyD, river = Math.abs(nr) - rsf;
      const tv = Math.max(river / nvp, 0), valleyH = valleyD * (1 - Math.exp(-tv * tv));
      let surfaceY = base + valleyH, slope = ns * valleyH, riverY = base - 1;
      if (river < 0) {
        const tr = river / rsf + 1, depth = rdb * Math.sqrt(Math.max(0, 1 - tr * tr));
        surfaceY = Math.min(Math.max(base - depth, wl - 3), surfaceY); slope = 0;
      }
      if (P.flags.varyRiverDepth) {
        const heat = P.flags.altChill ? bh[0] + 5 - (base - wl) * 20 / ac : bh[0], delta = bh[1] - 50;
        if (delta < 0) riverY += delta * Math.max((heat - 32) / 300, 0.08);
      }
      const riverYi = Math.trunc(riverY);
      let colMax = Math.trunc(surfaceY), top = -Infinity, fl = null;
      for (let y = ymin; y <= ymax; y++) {
        const delta = y - surfaceY;
        let density;
        if (slope * fillMax < Math.abs(delta)) density = -delta;                    // 噪声区间不改变符号
        else density = slope * (fl ??= col3d(N.interValleyFill, x, z, seed)).at(y) - delta;
        let v;
        if (density > 0) { v = ids.stone; if (y > colMax) colMax = y; top = y; }
        else if (y <= wl) v = ids.water;
        else if (y <= riverYi) v = ids.river;
        else v = 0;
        col[y - ymin] = v;
      }
      // 热度 / 湿度的海拔与河流修正：参考在每个 mapchunk 里按「块内最高石面」算（block 之外的石面不算），所以交给 finishColumn 按块调用
      const surf = Math.trunc(surfaceY), h0 = bh[0], m0 = bh[1];
      const adjust = (raw, lo, hi) => {
        let cm = surf;
        for (let y = Math.max(lo - 1, ymin); y <= Math.min(hi + 1, ymax); y++) if (raw[y - ymin] === ids.stone && y > cm) cm = y;
        const tAlt = Math.max(base, cm); let h = h0, m = m0;
        if (P.flags.humidRivers) { m *= 0.8; m *= 1 + Math.pow(0.5, Math.max((tAlt - base) / 4, 1)); }
        if (P.flags.altDry && tAlt > wl) m -= (tAlt - wl) * 10 / ac;
        if (P.flags.altChill) { h += 5; if (tAlt > wl) h -= (tAlt - wl) * 20 / ac; }
        return [h, m];
      };
      return { surface: surf, top, adjust };
    },
    fillerNoise: (x, z) => fractal2d(N.fillerDepth, x, z, seed),
    sample(x, z) {
      const r = (v) => +v.toFixed(3), nv = fractal2d(N.valleyDepth, x, z, seed) * k.valleyDepth;
      return { terrainHeight: Math.round(fractal2d(N.terrainHeight, x, z, seed)), valleyD: r(nv * nv), valleyProfile: r(fractal2d(N.valleyProfile, x, z, seed)), rivers: r(fractal2d(N.rivers, x, z, seed)), slope: r(fractal2d(N.interValleySlope, x, z, seed)) };
    },
    cave: k.caveRate > 0 ? { np1: N.cave1, np2: N.cave2, width: P.caveWidth / k.caveRate } : null,
    cavern: { np: N.cavern, limit: k.cavernLimit, taper: P.cavernTaper, threshold: k.cavernThreshold },
  };
}
