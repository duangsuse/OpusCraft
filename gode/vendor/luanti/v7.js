/* gode/vendor/luanti/v7.js —— Luanti mapgen v7 的地形（基础地形 + 山地 + 山脊河；悬岛未做），列式独立重写；参考：mapgen_v7.cpp。
   默认值 = 参考的默认噪声与 spflags「mountains,ridges,nofloatlands,caverns」。knobs 在 opts.k：{ shift, contScale, mountAmp, riverWidth } 默认等价于参考。 */
import { np, fractal2d, col3d, bounds } from './noise.js';

export const V7_NP = {
  terrainBase: { offset: 4, scale: 70, spread: 600, seed: 82341, octaves: 5, persist: 0.6 },
  terrainAlt: { offset: 4, scale: 25, spread: 600, seed: 5934, octaves: 5, persist: 0.6 },
  terrainPersist: { offset: 0.6, scale: 0.1, spread: 2000, seed: 539, octaves: 3, persist: 0.6 },
  heightSelect: { offset: -8, scale: 16, spread: 500, seed: 4213, octaves: 6, persist: 0.7 },
  fillerDepth: { offset: 0, scale: 1.2, spread: 150, seed: 261, octaves: 3, persist: 0.7 },
  mountHeight: { offset: 256, scale: 112, spread: 1000, seed: 72449, octaves: 3, persist: 0.6 },
  ridgeUwater: { offset: 0, scale: 1, spread: 1000, seed: 85039, octaves: 5, persist: 0.6 },
  mountain: { offset: -0.6, scale: 1, spread: [250, 350, 250], seed: 5333, octaves: 5, persist: 0.63 },
  ridge: { offset: 0, scale: 1, spread: 100, seed: 6467, octaves: 4, persist: 0.75 },
  cavern: { offset: 0, scale: 1, spread: [384, 128, 384], seed: 723, octaves: 5, persist: 0.63 },
  cave1: { offset: 0, scale: 12, spread: 61, seed: 52534, octaves: 3, persist: 0.5 },
  cave2: { offset: 0, scale: 12, spread: 67, seed: 10325, octaves: 3, persist: 0.5 },
};
// 对外 knobs（s02 §2.1）：key 是 makeV7 的 k 里的名字
export const V7_KNOBS = [
  { k: 'terrain.shift', key: 'shift', def: 0, min: -60, max: 60, note: '基础 / 备用地形整体抬升（格）' },
  { k: 'terrain.contScale', key: 'contScale', def: 1, min: 0.25, max: 4, note: '水平尺度（> 1 = 更大）' },
  { k: 'terrain.mountAmp', key: 'mountAmp', def: 1, min: 0, max: 3, note: '山地噪声振幅（0 = 无山）' },
  { k: 'river.width', key: 'riverWidth', def: 0.2, min: 0, max: 0.5, note: '山脊河（ridges）最大宽度，0 = 无河' },
  { k: 'cave.rate', key: 'caveRate', def: 1, min: 0, max: 3, note: '噪声交线洞宽度（cave_width ÷ rate），0 = 无洞' },
  { k: 'cavern.threshold', key: 'cavernThreshold', def: 0.7, min: 0, max: 1, note: '大洞穴（caverns）阈值，越小洞越大（VoxeLibre 用 0.2）' },
  { k: 'cavern.limit', key: 'cavernLimit', def: -256, min: -256, max: 120, note: '大洞穴最高处（原生 y）；默认 −256 在窗口（−64…191）之外看不见，想看就调到 −30 左右' },
];
export const V7_DEFAULTS = { mountZeroLevel: 0, caveWidth: 0.09, cavernLimit: -256, cavernTaper: 256, cavernThreshold: 0.7, waterLevel: 1,
  flags: { mountains: true, ridges: true, caverns: true } };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function makeV7(seed, o = {}) {
  const P = { ...V7_DEFAULTS, ...o, flags: { ...V7_DEFAULTS.flags, ...o.flags } }, k = { shift: 0, contScale: 1, mountAmp: 1, riverWidth: 0.2, caveRate: 1, cavernThreshold: 0.7, cavernLimit: -256, ...o.k };
  // knobs 落到噪声：contScale 放大 / 缩小水平尺度（spread ×），shift 平移 offset，mountAmp 乘山地噪声的 scale
  const sp = (s) => (Array.isArray(s) ? s.map(v => v * k.contScale) : s * k.contScale);
  const N = {};
  for (const n in V7_NP) N[n] = np({ ...V7_NP[n] });
  for (const n of ['terrainBase', 'terrainAlt']) { N[n] = np({ ...V7_NP[n], spread: sp(V7_NP[n].spread), offset: V7_NP[n].offset + k.shift }); }
  for (const n of ['terrainPersist', 'heightSelect', 'mountHeight', 'ridgeUwater']) N[n] = np({ ...V7_NP[n], spread: sp(V7_NP[n].spread) });
  N.mountain = np({ ...V7_NP.mountain, scale: V7_NP.mountain.scale * k.mountAmp, offset: V7_NP.mountain.offset });
  const wl = P.waterLevel, width = k.riverWidth, mb = bounds(N.mountain);

  // 基础地表高度（s16：向零截断）与各中间量
  function base(x, z) {
    const persist = fractal2d(N.terrainPersist, x, z, seed);
    const hs = clamp(fractal2d(N.heightSelect, x, z, seed), 0, 1);
    const b = fractal2d(N.terrainBase, x, z, seed, persist), a = fractal2d(N.terrainAlt, x, z, seed, persist);
    return { persist, hs, b, a, y: a > b ? a : b * hs + a * (1 - hs) };
  }
  return {
    P, N, noises: N,
    // 填一列地形：col[i] ← stone / water / air（下标 i = y − ymin）。bh 未用（v7 的热度 / 湿度不受地形影响）
    fill(x, z, col, ymin, ymax, ids) {
      const s = base(x, z), sy = Math.trunc(s.y);
      const mh = P.flags.mountains ? Math.max(fractal2d(N.mountHeight, x, z, seed), 1) : 0;
      const absu = P.flags.ridges ? Math.abs(fractal2d(N.ridgeUwater, x, z, seed)) * 2 : Infinity;
      const riv = absu <= width;
      const mountainAt = (y) => {
        const grad = -((y - P.mountZeroLevel) / mh);
        if (mb[0] + grad >= 0) return true;
        if (mb[1] + grad < 0) return false;
        return (mn ??= col3d(N.mountain, x, z, seed)).at(y) + grad >= 0;
      };
      let top = -Infinity, rg = null, mn = null;                       // 3D 噪声按列缓存格点（col3d），只在用到时建
      for (let y = ymin; y <= ymax; y++) {
        let channel = false;
        if (riv) {
          const alt = y - wl, hm = (alt + 17) / 2.5, wm = width - absu;
          channel = (rg ??= col3d(N.ridge, x, z, seed)).at(y) * Math.max(alt, 0) / 7 + wm * hm >= 0.6;
        }
        let v;
        if (y <= sy && !channel) v = ids.stone;
        else if (P.flags.mountains && !channel && mountainAt(y)) v = ids.stone;   // 山地：mnt_n + 梯度 ≥ 0；噪声区间能直接判出符号时不取噪声
        else if (y <= wl) v = ids.water;
        else v = 0;
        col[y - ymin] = v;
        if (v === ids.stone) top = y;
      }
      return { surface: sy, top };
    },
    fillerNoise: (x, z) => fractal2d(N.fillerDepth, x, z, seed),
    base,
    // 供 pgviz 热力图的数值场（native y，加偏移由适配器做）
    sample(x, z) {
      const s = base(x, z), r = (v) => +v.toFixed(3);
      return { hBase: Math.round(s.y), hBaseTerrain: Math.round(s.b), hAlt: Math.round(s.a), hselect: r(s.hs), persist: r(s.persist), mountH: Math.round(Math.max(fractal2d(N.mountHeight, x, z, seed), 1)), river: r(Math.abs(fractal2d(N.ridgeUwater, x, z, seed)) * 2) };
    },
    cave: k.caveRate > 0 ? { np1: N.cave1, np2: N.cave2, width: P.caveWidth / k.caveRate } : null,
    cavern: P.flags.caverns ? { np: N.cavern, limit: k.cavernLimit, taper: P.cavernTaper, threshold: k.cavernThreshold } : null,
  };
}
