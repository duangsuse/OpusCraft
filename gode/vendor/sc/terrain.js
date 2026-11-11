/* gode/vendor/sc/terrain.js —— Survivalcraft TerrainContentsGenerator24 的区块填充副本。
   v1 覆盖：GenerateTerrain（密度场 + 3D turbulence + 四类岩石）、GenerateSurface（地表置换）、
   GenerateSnowAndIce（雪/冰）、GenerateBedrockAndAir（基岩）。
   不覆盖：洞穴 / 矿脉 / 植物 / 树 / 流体下渗 —— 这些只改局部，不影响高度场与地表，后续再补。
   方块 id 直接用 SC 的数字（和 TerrainDump.tsv 的 top_id 对得上），NAMES 按 id 填名字给 gode 查色。 */
import { octaved2, octaved3 } from './noise.js';
import { Rand } from './rand.js';
import { hash32 } from './rand.js';

const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const B = {
  AIR: 0, BEDROCK: 1, DIRT: 2, GRANITE: 3, SANDSTONE: 4, GRAVEL: 6, SAND: 7, GRASS: 8,
  WATER: 18, SNOW: 61, ICE: 62, LIMESTONE: 66, BASALT: 67, CLAY: 72
};

// id → gode 方块名（未列出的洞用 air；id 与 SC 一致，方便和 dump 对照）
export const NAMES = (() => {
  const n = new Array(73).fill('air');
  n[1] = 'bedrock'; n[2] = 'dirt'; n[3] = 'granite'; n[4] = 'sandstone'; n[6] = 'gravel';
  n[7] = 'sand'; n[8] = 'grass_block'; n[18] = 'water'; n[61] = 'snow_block'; n[62] = 'ice';
  n[66] = 'limestone'; n[67] = 'basalt'; n[72] = 'clay';
  return n;
})();

// 群系只给 pgviz / 迷你地图上色用；SC 本身只有温度/湿度，没有群系 id
export const BIOMES = ['ocean', 'beach', 'plains', 'forest', 'desert', 'snowy', 'mountains'];
export const BIOME_COL = [0x2f5f9e, 0xd8cf8a, 0x6aa84f, 0x2f7d32, 0xd9c15b, 0xe8eef2, 0x8a8a8a];

// SubsystemWeather.IsPlaceFrozen / ShaftHasSnowOnIce
const tempAdj = (y) => Math.round(y > 64 ? -0.0008 * (y - 64) * (y - 64) : 0.1 * (64 - y));
const frozen = (t, y) => t + tempAdj(y) <= 0;
const shaftSnow = (x, z) => hash32(((x & 0xFFFF) | (z << 16)) >>> 0) > 429496729;

const GX = 5, GY = 33, GZ = 5;   // 16/4+1, 256/8+1, 16/4+1

export function genChunk(world, cx, cz, blocks, heights, biomes) {
  const P = world.P;
  const ox = cx * 16, oz = cz * 16;
  const oceanLevel = P.oceanLevel;
  const tidx = (x, y, z) => (y << 8) | (z << 4) | x;

  // 列气候：SC 在 GenerateSurfaceParameters 里先存进 chunk（温度/湿度按列），GenerateTerrain 再读
  const temp = new Int32Array(256), hum = new Int32Array(256);
  const shore = new Float64Array(256), mount = new Float64Array(256);
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const c = z * 16 + x, wx = ox + x, wz = oz + z;
      temp[c] = world.temperature(wx, wz);
      hum[c] = world.humidity(wx, wz);
      shore[c] = world.shoreDistance(wx, wz);
      mount[c] = world.mountainRangeFactor(wx, wz);
    }
  }

  // 密度场：每 4×8×4 一个格
  const g = new Float64Array(GX * GY * GZ);
  const gi = (k, m, l) => (k * GY + m) * GZ + l;
  for (let k = 0; k < GX; k++) {
    for (let l = 0; l < GZ; l++) {
      const wx = ox + k * 4, wz = oz + l * 4;
      const h = world.height(wx, wz);
      const mt = world.mountainRangeFactor(wx, wz);
      const amp = lerp(P.minTurbulence, 1, sat((mt - P.turbZero) / (1 - P.turbZero)));
      for (let m = 0; m < GY; m++) {
        const y = m * 8;
        const turb = P.turbStrength * amp * sat(h - y) * (2 * octaved3(wx, y, wz, P.turbFreq, P.turbOctaves, 4, P.turbPersistence) - 1);
        let d = h - (y + turb);
        d += Math.max(4 * (P.densityBias - y), 0);
        g[gi(k, m, l)] = d;
      }
    }
  }

  // 三线性插值 + 逐格选块（GenerateTerrain 的内层循环逐行照搬）
  for (let n = 0; n < GX - 1; n++) {
    for (let l = 0; l < GZ - 1; l++) {
      for (let m = 0; m < GY - 1; m++) {
        const v111 = g[gi(n, m, l)], v211 = g[gi(n + 1, m, l)], v121 = g[gi(n, m + 1, l)], v221 = g[gi(n + 1, m + 1, l)];
        const v112 = g[gi(n, m, l + 1)], v212 = g[gi(n + 1, m, l + 1)], v122 = g[gi(n, m + 1, l + 1)], v222 = g[gi(n + 1, m + 1, l + 1)];
        const dx1 = (v211 - v111) / 4, dx2 = (v221 - v121) / 4, dx3 = (v212 - v112) / 4, dx4 = (v222 - v122) / 4;
        let a0 = v111, b0 = v121, c0 = v112, d0 = v122;
        for (let i = 0; i < 4; i++) {
          const dz1 = (c0 - a0) / 4, dz2 = (d0 - b0) / 4;
          let p = a0, q = b0;
          for (let j = 0; j < 4; j++) {
            const dy = (q - p) / 8;
            let cell = p;
            const x = i + n * 4, z = j + l * 4;
            const col = z * 16 + x;
            const t = temp[col], hm = hum[col], sh = shore[col], mt = mount[col];
            const f = mt - 0.01 * hm;
            const th34 = lerp(100, 0, f), th35 = lerp(300, 30, f);
            const flag = (t > 8 && hm < 8 && mt < 0.97) || (Math.abs(sh) < 16 && mt < 0.97);
            let v;
            for (let k = 0; k < 8; k++) {
              const y = k + m * 8;
              if (cell < 0) {
                v = y <= oceanLevel ? B.WATER : B.AIR;
              }
              else if (flag) {
                v = cell < th34 ? B.SANDSTONE : cell < th35 ? B.GRANITE : B.BASALT;
              }
              else {
                v = cell < th35 ? B.GRANITE : B.BASALT;
              }
              blocks[tidx(x, y, z)] = v;
              cell += dy;
            }
            p += dz1; q += dz2;
          }
          a0 += dx1; b0 += dx2; c0 += dx3; d0 += dx4;
        }
      }
    }
  }


  // GenerateSurface
  const rand = new Rand(P.seed + cx + 101 * cz);
  const getV = (x, y, z) => blocks[tidx(x, y, z)];
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const col = z * 16 + x;
      const t = temp[col], hm = hum[col], mt = mount[col];
      let y = 254;
      while (y >= 0) {
        const v = getV(x, y, z);
        if (v !== B.AIR && v !== B.WATER) {
          let mat;
          if (v === B.SANDSTONE) {
            mat = t > 4 && t < 7 ? B.GRAVEL : B.SAND;
          }
          else {
            const t4 = (t / 4) | 0;
            const above = y + 1 < 255 ? getV(x, y + 1, z) : B.AIR;
            mat = y > 120 && frozen(t, y) ? B.ICE
              : ((y < 66 || y === 84 + t4 || y === 103 + t4) && hm === 9 && t % 6 === 1) ? B.LIMESTONE
              : (above !== B.WATER || hm <= 8 || hm % 2 !== 0 || t % 3 !== 0) ? B.DIRT
              : B.CLAY;
          }
          let depth;
          if (mat === B.ICE) {
            depth = Math.trunc(clamp(-t, 1, 7));
          }
          else {
            const n11 = sat((y - 100) * 0.05);
            const fz = sat(sat((mt - 0.9) / 0.1) - sat((hm - 3) / 12) + P.surfaceMul * n11);
            const mn = lerp(4, 0, fz) | 0;
            const mx = lerp(7, 0, fz) | 0;
            depth = Math.min(rand.irange(mn, mx), y);
          }
          for (let k = y + 1 - depth; k <= y; k++) {
            if (k >= 0 && getV(x, k, z) !== B.AIR) blocks[tidx(x, k, z)] = mat;
          }
          break;
        }
        y--;
      }
    }
  }


  // GenerateSnowAndIce
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const col = z * 16 + x, t = temp[col];
      const wx = ox + x, wz = oz + z;
      for (let y = 254; y >= 0; y--) {
        const v = getV(x, y, z);
        if (v === B.AIR) continue;
        if (!frozen(t, y)) break;
        if (v === B.WATER) {
          if (shore[col] > -20) {
            const sn = octaved2(wx, wz, 0.2, 1, 2, 1);
            const n5 = 1 + (2 * sn * sn | 0);
            for (let k = 0; k < n5; k++) {
              if (y - k > 0) {
                if (getV(x, y - k, z) !== B.WATER) break;
                blocks[tidx(x, y - k, z)] = B.ICE;
              }
            }
            if (shaftSnow(wx, wz)) blocks[tidx(x, y + 1, z)] = B.SNOW;
          }
        }
        else {
          blocks[tidx(x, y + 1, z)] = B.SNOW;   // 近似 CanSupportSnow：v1 的实心方块都成立
        }
        break;
      }
    }
  }

  // GenerateBedrockAndAir
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      const n = 2 + Math.trunc(4 * octaved2(ox + x, oz + z, 0.1, 1, 1, 1));
      for (let y = 0; y < n; y++) blocks[tidx(x, y, z)] = B.BEDROCK;
      blocks[tidx(x, 255, z)] = B.AIR;
    }
  }

  // 列高 + 群系（只给 viz 上色）
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      const col = z * 16 + x;
      const t = temp[col], hm = hum[col];
      let top = -1;
      for (let y = 255; y >= 0; y--) {
        if (getV(x, y, z) !== B.AIR) { top = y; break; }
      }
      heights[col] = top;
      const topId = top >= 0 ? getV(x, top, z) : B.AIR;
      biomes[col] =
        topId === B.WATER ? 0
          : topId === B.SNOW || topId === B.ICE ? 5
            : topId === B.SAND || topId === B.SANDSTONE ? (t >= 9 ? 4 : 1)
              : topId === B.GRASS ? (hm >= 8 ? 3 : 2)
                : topId === B.GRANITE || topId === B.BASALT ? 6
                  : 2;
    }
  }
}