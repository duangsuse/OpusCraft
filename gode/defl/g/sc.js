/* gode/defl/g/sc.js —— `?g=sc` 生成器 Worker：Survivalcraft API 1.9.5.1 的 TerrainContentsGenerator24。
   代码在 vendor/sc/（noise / rand / world / terrain），这里只做 Worker 契约的胶水：
   直接把 SC 的方块 id 写进运行时给的规范 YZX u16（out.blocks），不产生中间对象、不 JSON、不拷贝；
   outside 恒空（SC 的区块生成是纯列函数，树/结构跨块的部分 v1 没实现）。 */
import { serve } from '../../w/slicer.js';
import { resolveParams } from '../../w/params.js';
import { createWorld } from '../../vendor/sc/world.js';
import { genChunk, NAMES, BIOMES, BIOME_COL } from '../../vendor/sc/terrain.js';

// 调参表：默认值全部等于 SC 1.9.5.1 的常量，默认输出与 SC 逐格一致（见 tools/scfit.js）
export const PARAMS = [
  { k: 'terrain.seaLevel', def: 64, min: 10, max: 200, note: '海平面（SC: 64 + SeaLevelOffset）' },
  { k: 'terrain.heightBias', def: 1, min: -30, max: 30, note: 'TGHeightBias：整体抬升/下沉' },
  { k: 'terrain.hillsStrength', def: 32, min: 0, max: 120, note: 'TGHillsStrength：丘陵幅度' },
  { k: 'terrain.hillsPercentage', def: 0.28, min: 0, max: 1, note: 'TGHillsPercentage：丘陵占比' },
  { k: 'terrain.mountainsStrength', def: 220, min: 0, max: 600, note: 'TGMountainsStrength：山脉幅度' },
  { k: 'terrain.mountainsPercentage', def: 0.11, min: 0, max: 1, note: 'TGMountainsPercentage：山脉占比' },
  { k: 'terrain.riversStrength', def: 1, min: 0, max: 4, note: 'TGRiversStrength：河谷切割强度' },
  { k: 'terrain.oceanSlope', def: 0.006, min: 0, max: 0.05, note: 'TGOceanSlope：海岸坡度' },
  { k: 'terrain.densityBias', def: 55, min: 20, max: 120, note: 'TGDensityBias：地壳密度偏置（大 = 地表更实）' },
  { k: 'terrain.turbulence', def: 55, min: 0, max: 150, note: 'TGTurbulenceStrength：3D 扰动强度' },
  { k: 'terrain.surfaceMultiplier', def: 2, min: 0, max: 8, note: 'TGSurfaceMultiplier：高海拔裸岩倾向' }
];

export const meta = {
  id: 'sc', ver: 1, knobs: PARAMS, sea: 64, h: 256, h0: 256, outside: false,
  names: NAMES, biomes: BIOMES.slice(), colors: { biomes: BIOME_COL.slice() }
};

// 字符串种子 → int（和 mini 的 cyrb53-ish 一致，URL ?seed=abc 也能用）
function hashString(str) {
  let h1 = 0xdeadbeef ^ 7, h2 = 0x41c6ce57 ^ 7;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) ^ (h1 >>> 0);
}

let W = null;
let K = null;

function applyKw(flat) {
  const P = W.P;
  P.oceanLevel = flat['terrain.seaLevel'];
  P.heightBias = flat['terrain.heightBias'];
  P.hillsStrength = flat['terrain.hillsStrength'];
  P.hillsPercentage = flat['terrain.hillsPercentage'];
  P.mountStrength = flat['terrain.mountainsStrength'];
  P.mountPercentage = flat['terrain.mountainsPercentage'];
  P.riversStrength = flat['terrain.riversStrength'];
  P.oceanSlope = flat['terrain.oceanSlope'];
  P.densityBias = flat['terrain.densityBias'];
  P.turbStrength = flat['terrain.turbulence'];
  P.surfaceMul = flat['terrain.surfaceMultiplier'];
}

export function onkwarg({ seed, kw }) {
  const s = String(seed ?? '').trim();
  const n = /^-?\d+$/.test(s) ? parseInt(s, 10) | 0 : hashString(s) | 0;
  W = createWorld(n);
  K = resolveParams(meta.knobs, kw);
  applyKw(K);
  return { meta };
}

export function set(kv) {
  if (!W) return;
  K = resolveParams(meta.knobs, { ...K, ...kv });
  applyKw(K);
}

// 热路径：out.blocks / out.heights / out.biomes 由运行时分配，直接写，零分配零拷贝
export function gen({ cx, cz }, out) {
  genChunk(W, cx, cz, out.blocks, out.heights, out.biomes);
  // 不回 outside：slicer 会把它 transfer 掉，复用一个共享空数组第二次就会抛 detached → 区块丢失（viz 全是黑块）
  return {};
}

export function sample({ x, z }) {
  const h = W.height(x, z);
  const temp = W.temperature(x, z), hum = W.humidity(x, z);
  const frozen = temp <= 1;
  const biome = h < W.P.oceanLevel ? 0
    : frozen ? 5
      : temp >= 10 && hum <= 4 ? 4
        : hum >= 8 ? 3
          : h > 120 ? 6
            : 2;
  return { h, temp, hum, biome };
}

export function spawn() {
  for (let r = 0; r < 128; r += 4) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const x = Math.round(Math.cos(ang) * r * 4), z = Math.round(Math.sin(ang) * r * 4);
      const h = W.height(x, z);
      if (h > W.P.oceanLevel + 2 && h < 120) {
        const s = Math.max(Math.abs(W.height(x + 2, z) - W.height(x - 2, z)), Math.abs(W.height(x, z + 2) - W.height(x, z - 2)));
        if (s < 6) return [x + 0.5, h + 2, z + 0.5];
      }
    }
  }
  return [0.5, W.P.oceanLevel + 10, 0.5];
}

serve(import.meta.url);