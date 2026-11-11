/* gode/vendor/sc/world.js —— Survivalcraft TerrainContentsGenerator24 的形状/气候部分逐行副本。
   覆盖：构造函数派生的世界参数（四个 offset、海面、丘陵/山脉/河流/岸线系数），以及
   CalculateHeight / CalculateTemperature / CalculateHumidity / CalculateMountainRangeFactor / CalculateOceanShoreDistance。
   不含：洞穴、矿脉、地表置换、植被（terrain.js 处理）。所有 x, z 都是方块坐标（整数或浮点均可）。 */
import { octaved2 } from './noise.js';
import { Rand } from './rand.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
const min = (...a) => Math.min(...a);
const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const powSign = (v, n) => sign(v) * Math.pow(Math.abs(v), n);
const squish = (v, zero, one) => sat((v - zero) / (one - zero));

export function createWorld(seed, settings = {}) {
  const island = settings.island ?? null;                 // [x, y] 或 null（非岛屿模式）
  const biomeSize = settings.biomeSize ?? 1;
  const num = island ? Math.min(island[0], island[1]) : Infinity;
  const r = new Rand(seed);
  const o = settings.offsets ?? {};
  const P = {
    seed,
    island,
    oceanCorner: [-200, -200],
    tempOff: o.temp ?? [r.range(-3000, 3000), r.range(-3000, 3000)],
    humOff: o.hum ?? [r.range(-3000, 3000), r.range(-3000, 3000)],
    mountOff: o.mount ?? [r.range(-3000, 3000), r.range(-3000, 3000)],
    riverOff: o.river ?? [r.range(-3000, 3000), r.range(-3000, 3000)],
    biomeScaling: (island ? 1 : 1.75) * biomeSize,
    shoreFluct: clamp(2 * num, 0, 150),
    shoreFluctScaling: clamp(0.04 * num, 0.5, 3),
    oceanSlope: 0.006,
    oceanSlopeVar: 0.004,
    islandsFreq: 0.01,
    densityBias: 55,
    heightBias: 1,
    riversStrength: 1,
    mountStrength: 220,
    mountRangeFreq: 0.0006,
    mountPercentage: 0.11,
    mountDetailFreq: 0.003,
    mountDetailOctaves: 3,
    mountDetailPersistence: 0.53,
    hillsPercentage: 0.28,
    hillsStrength: 32,
    hillsOctaves: 1,
    hillsFreq: 0.014,
    hillsPersistence: 0.5,
    turbStrength: 55,
    turbFreq: 0.03,
    turbOctaves: 1,
    turbPersistence: 0.5,
    minTurbulence: 0.04,
    turbZero: 0.84,
    surfaceMul: 2,
    oceanLevel: 64 + (settings.seaLevelOffset ?? 0),
    worldTempOffset: settings.temperatureOffset ?? 0,      // WorldSettings.TemperatureOffset
    worldHumOffset: settings.humidityOffset ?? 0
  };
  return new World(P);
}

export class World {
  constructor(P) { this.P = P; }

  oceanShoreX(z) {
    const P = this.P;
    return P.oceanCorner[0] + P.shoreFluct * octaved2(z, 0, 0.005 / P.shoreFluctScaling, 4, 1.95, 1);
  }

  oceanShoreZ(x) {
    const P = this.P;
    return P.oceanCorner[1] + P.shoreFluct * octaved2(0, x, 0.005 / P.shoreFluctScaling, 4, 1.95, 1);
  }

  mountainRangeFactor(x, z) {
    const P = this.P;
    return octaved2(x + P.mountOff[0], z + P.mountOff[1], P.mountRangeFreq / P.biomeScaling, 3, 1.91, 0.75, true);
  }

  shoreDistance(x, z) {
    const P = this.P;
    if (P.island) {
      const a = this.oceanShoreX(z), b = this.oceanShoreZ(x);
      const c = this.oceanShoreX(z + 1000) + P.island[0];
      const d = this.oceanShoreZ(x + 1000) + P.island[1];
      return min(x - a, z - b, c - x, d - z);
    }
    return min(x - this.oceanShoreX(z), z - this.oceanShoreZ(x));
  }

  height(x, z) {
    const P = this.P;
    const slope = P.oceanSlope
      + P.oceanSlopeVar * powSign(2 * octaved2(x + P.mountOff[0], z + P.mountOff[1], 0.01, 1, 2, 0.5) - 1, 0.5);
    const shore = this.shoreDistance(x, z);
    const nShore = sat(2 - 0.05 * Math.abs(shore));
    const islands = sat(Math.sin(P.islandsFreq * shore));
    const n5 = sat(sat(-slope * shore) - 0.85 * islands);
    const n6 = sat(sat(0.05 * (-shore - 10)) - islands);
    const v = this.mountainRangeFactor(x, z);
    const f = (1 - nShore) * octaved2(x, z, 0.001 / P.biomeScaling, 2, 2, 0.5);
    const f2 = (1 - nShore) * octaved2(x, z, 0.0017 / P.biomeScaling, 2, 4, 0.7);
    const hillsK = (1 - n6) * (1 - nShore) * squish(v, 1 - P.hillsPercentage, 1 - P.mountPercentage);
    const mountK = (1 - n6) * squish(v, 1 - P.mountPercentage, 1);
    const ampStep = lerp(0.75 * P.mountDetailPersistence, 1.33 * P.mountDetailPersistence, f);
    const detail = 1.5 * octaved2(x, z, P.mountDetailFreq, P.mountDetailOctaves, 1.98, ampStep) - 0.5;
    const hillsNoise = octaved2(x, z, P.hillsFreq, P.hillsOctaves, 1.93, P.hillsPersistence);
    const num11 = lerp(80, 35, sat(mountK + 0.5 * hillsK + sat(1 - shore / 30)));
    const x2 = lerp(-2, -4, sat(mountK + 0.5 * hillsK));
    const river = sat(1.5 - num11 * Math.abs(2 * octaved2(x + P.riverOff[0], z + P.riverOff[1], 0.001, 4, 2, 0.5) - 1));
    const base = -50 * n5 + P.heightBias;
    const plains = lerp(0, 8, f);
    const plains2 = lerp(0, -6, f2);
    const mountains = P.mountStrength * mountK * detail;
    const hillsAdd = P.hillsStrength * hillsK * hillsNoise;
    const sum = base + plains + plains2 + mountains + hillsAdd;
    const riverCut = P.riversStrength * river;
    return clamp(64 + Math.min(lerp(sum, x2, riverCut), sum), 10, 251);
  }

  temperature(x, z) {
    const P = this.P;
    return clamp(Math.trunc(sat(
      3 * octaved2(x + P.tempOff[0], z + P.tempOff[1], 0.0015 / P.biomeScaling, 5, 2, 0.6)
      - 1.1 + P.worldTempOffset / 16) * 16), 0, 15);
  }

  humidity(x, z) {
    const P = this.P;
    return clamp(Math.trunc(sat(
      3 * octaved2(x + P.humOff[0], z + P.humOff[1], 0.0012 / P.biomeScaling, 5, 2, 0.6)
      - 0.9 + P.worldHumOffset / 16) * 16), 0, 15);
  }
}