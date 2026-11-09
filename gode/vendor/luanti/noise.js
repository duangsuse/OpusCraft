/* gode/vendor/luanti/noise.js —— Luanti 风格的值噪声（lattice value noise），**独立重写**；Luanti 的 noise.cpp 只作参考（公式 / 常量 / 默认参数是算法与数据）。
   与参考的约定一致之处（逐位对拍靠这个）：整数哈希 noise2d / noise3d、每个倍频 seed + i、缓和曲线 6t⁵−15t⁴+10t³、
   2D 在 defaults|eased 标志下缓和，**3D 只在 eased 标志下缓和**（参考的既有不对称，保留）、absvalue、
   倍频 f *= lacunarity、g *= persist、结果 = offset + Σ·scale。
   差异：参考里噪声值是 f32，这里是 f64，阈值附近极少数格子会翻转（验收口径是「≥ 99.9% 格一致」，见 tools/luanti/）。
   NoiseParams 形状：{ offset, scale, spread:[x,y,z], seed, octaves, persist, lacunarity, flags }；flags 是字符串 'defaults,absvalue,eased' 或位掩码。 */
export const F_DEFAULTS = 1, F_EASED = 2, F_ABSVALUE = 4;

const hash = (n) => {   // 末段整数混洗：u31 → u31
  n = ((n >>> 13) ^ n) >>> 0;
  const m = (Math.imul(Math.imul(n, n), 60493) + 19990303) | 0;
  return (Math.imul(n, m) + 1376312589) & 0x7fffffff;
};
export function noise2d(x, y, seed) {
  const n = (Math.imul(1619, x) + Math.imul(31337, y) + Math.imul(1013, seed)) & 0x7fffffff;
  return 1 - hash(n) / 0x40000000;
}
export function noise3d(x, y, z, seed) {
  const n = (Math.imul(1619, x) + Math.imul(31337, y) + Math.imul(52591, z) + Math.imul(1013, seed)) & 0x7fffffff;
  return 1 - hash(n) / 0x40000000;
}
const ease = (t) => t * t * t * (t * (6 * t - 15) + 10);

export function value2d(x, y, seed, eased) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let u = x - x0, v = y - y0;
  if (eased) { u = ease(u); v = ease(v); }
  const a = noise2d(x0, y0, seed), b = noise2d(x0 + 1, y0, seed), c = noise2d(x0, y0 + 1, seed), d = noise2d(x0 + 1, y0 + 1, seed);
  const p = a + (b - a) * u, q = c + (d - c) * u;
  return p + (q - p) * v;
}
export function value3d(x, y, z, seed, eased) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  let u = x - x0, v = y - y0, w = z - z0;
  if (eased) { u = ease(u); v = ease(v); w = ease(w); }
  const lerp = (a, b, t) => a + (b - a) * t;
  const p0 = lerp(lerp(noise3d(x0, y0, z0, seed), noise3d(x0 + 1, y0, z0, seed), u), lerp(noise3d(x0, y0 + 1, z0, seed), noise3d(x0 + 1, y0 + 1, z0, seed), u), v);
  const p1 = lerp(lerp(noise3d(x0, y0, z0 + 1, seed), noise3d(x0 + 1, y0, z0 + 1, seed), u), lerp(noise3d(x0, y0 + 1, z0 + 1, seed), noise3d(x0 + 1, y0 + 1, z0 + 1, seed), u), v);
  return lerp(p0, p1, w);
}

export function parseFlags(f) {
  if (typeof f === 'number') return f;
  let m = 0;
  for (const s of String(f ?? 'defaults').split(',')) { const k = s.trim(); if (k === 'defaults') m |= F_DEFAULTS; else if (k === 'eased') m |= F_EASED; else if (k === 'absvalue') m |= F_ABSVALUE; }
  return m || F_DEFAULTS;
}
// np 声明（对象字面量）→ 规范化（spread 标量 / 三元数组、flags 掩码）
export function np(o) {
  const s = Array.isArray(o.spread) ? o.spread : [o.spread, o.spread, o.spread];
  return { offset: o.offset, scale: o.scale, spread: s, seed: o.seed, octaves: o.octaves, persist: o.persist ?? 0.6, lacunarity: o.lacunarity ?? 2, flags: parseFlags(o.flags) };
}

// 分形噪声（点采样）。persist 可临时覆盖（v7 的 terrain_persist 逐点改倍频衰减）
export function fractal2d(p, x, z, seed, persist = p.persist) {
  let a = 0, f = 1, g = 1;
  x /= p.spread[0]; z /= p.spread[1];   // 与参考一致：2D 的第二轴（世界 z）除以 spread 的第二个分量
  seed += p.seed;
  const eased = !!(p.flags & (F_DEFAULTS | F_EASED)), abs = !!(p.flags & F_ABSVALUE);
  for (let i = 0; i < p.octaves; i++) {
    let v = value2d(x * f, z * f, seed + i, eased);
    if (abs) v = Math.abs(v);
    a += g * v; f *= p.lacunarity; g *= persist;
  }
  return p.offset + a * p.scale;
}
export function fractal3d(p, x, y, z, seed, persist = p.persist) {
  let a = 0, f = 1, g = 1;
  x /= p.spread[0]; y /= p.spread[1]; z /= p.spread[2];
  seed += p.seed;
  const eased = !!(p.flags & F_EASED), abs = !!(p.flags & F_ABSVALUE);
  for (let i = 0; i < p.octaves; i++) {
    let v = value3d(x * f, y * f, z * f, seed + i, eased);
    if (abs) v = Math.abs(v);
    a += g * v; f *= p.lacunarity; g *= persist;
  }
  return p.offset + a * p.scale;
}

// 噪声值的保守区间 [lo, hi]（倍频衰减之和 × scale）：地形里「这格一定是石头 / 一定是空气」的判定用它跳过 3D 噪声（结果与不跳过完全相同）
export function bounds(p, persist = p.persist) {
  let sum = 0, g = 1;
  for (let i = 0; i < p.octaves; i++) { sum += g; g *= persist; }
  const a = Math.abs(p.scale) * sum;
  return [p.offset - a, p.offset + a];
}

/* 沿一列（固定 x、z）逐层取 3D 分形噪声：每个倍频只缓存相邻两层格点（y0、y0+1 各 4 个哈希），y 连续变化时几乎不再算哈希。
   运算顺序与 fractal3d 完全相同，所以结果逐位相同（tools/luanti/selftest.mjs 对拍）。at(y) 的 y 可以升序也可以降序。 */
export function col3d(p, x, z, seed, persist = p.persist) {
  const n = p.octaves, eased = !!(p.flags & F_EASED), abs = !!(p.flags & F_ABSVALUE);
  const sx = x / p.spread[0], sz = z / p.spread[2], sy = p.spread[1];
  const O = [];
  let f = 1, g = 1;
  for (let i = 0; i < n; i++) {
    const xs = sx * f, zs = sz * f, x0 = Math.floor(xs), z0 = Math.floor(zs);
    let u = xs - x0, w = zs - z0; if (eased) { u = ease(u); w = ease(w); }
    O.push({ x0, z0, u, w, f, g, sd: seed + p.seed + i, y0: NaN, lo: new Float64Array(4), hi: new Float64Array(4) });
    f *= p.lacunarity; g *= persist;
  }
  const layer = (o, y, out) => { out[0] = noise3d(o.x0, y, o.z0, o.sd); out[1] = noise3d(o.x0 + 1, y, o.z0, o.sd); out[2] = noise3d(o.x0, y, o.z0 + 1, o.sd); out[3] = noise3d(o.x0 + 1, y, o.z0 + 1, o.sd); };
  return {
    at(y) {
      let a = 0;
      for (let i = 0; i < n; i++) {
        const o = O[i], ys = (y / sy) * o.f, y0 = Math.floor(ys);   // 与 fractal3d 同样的 (y / spread) * f，保证逐位相同
        let v = ys - y0; if (eased) v = ease(v);
        if (y0 !== o.y0) {
          if (y0 === o.y0 + 1) { const t = o.lo; o.lo = o.hi; o.hi = t; layer(o, y0 + 1, o.hi); }
          else if (y0 === o.y0 - 1) { const t = o.hi; o.hi = o.lo; o.lo = t; layer(o, y0, o.lo); }
          else { layer(o, y0, o.lo); layer(o, y0 + 1, o.hi); }
          o.y0 = y0;
        }
        const lo = o.lo, hi = o.hi, u = o.u;
        const p0 = (lo[0] + (lo[1] - lo[0]) * u), p1 = (hi[0] + (hi[1] - hi[0]) * u), q0 = (lo[2] + (lo[3] - lo[2]) * u), q1 = (hi[2] + (hi[3] - hi[2]) * u);
        const r0 = p0 + (p1 - p0) * v, r1 = q0 + (q1 - q0) * v;
        let val = r0 + (r1 - r0) * o.w;
        if (abs) val = Math.abs(val);
        a += o.g * val;
      }
      return p.offset + a * p.scale;
    },
  };
}
