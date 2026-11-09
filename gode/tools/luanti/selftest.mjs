#!/usr/bin/env node
/* gode/tools/luanti/selftest.mjs —— vendor/luanti 里不需要 Luanti 就能验证的部分：快速 PCG32 与 BigInt 版逐值相同、噪声的已知性质。 */
import { PcgRandom, Pcg32 } from '../../vendor/luanti/pcg.js';
import { np, fractal3d, col3d } from '../../vendor/luanti/noise.js';
let bad = 0;
for (const seed of [0, 1, 53, 12345, 4294967295, 0xdeadbeef, 2 ** 40 + 7]) {
  const a = new PcgRandom(seed), b = new Pcg32(seed);
  for (let i = 0; i < 20000; i++) { const x = i % 3 ? a.next() : a.range(-5, 77), y = i % 3 ? b.next() : b.range(-5, 77); if (x !== y) { console.log('PCG 不同', seed, i, x, y); bad++; break; } }
}
for (const flags of ['defaults', 'eased', 'absvalue,eased']) {
  const P = np({ offset: 0.3, scale: 12, spread: [61, 47, 53], seed: 52534, octaves: 4, persist: 0.55, lacunarity: 2, flags });
  for (const [x, z, seed] of [[0, 0, 7], [-123, 456, 12345], [999, -1000, -5]]) {
    const c = col3d(P, x, z, seed); let n = 0, m = 0;
    for (let y = -70; y <= 200; y += 1) { n++; if (c.at(y) !== fractal3d(P, x, y, z, seed)) m++; }      // 升序
    for (let y = 200; y >= -70; y -= 1) { n++; if (c.at(y) !== fractal3d(P, x, y, z, seed)) m++; }      // 降序
    for (const y of [5, 120, -40, 77, 78, 13]) { n++; if (c.at(y) !== fractal3d(P, x, y, z, seed)) m++; } // 乱序
    if (m) { console.log('col3d 与 fractal3d 不同', flags, x, z, m, '/', n); bad++; }
  }
}
console.log(bad ? 'FAIL' : 'ok  PCG32 快慢两版相同；col3d 与 fractal3d 逐位相同（3 种 flags × 升 / 降 / 乱序）');
process.exit(bad ? 1 : 0);
