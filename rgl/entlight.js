// rgl/entlight.js —— 实体（生物、掉落物、TNT、手持物）的 CPU 光照：three 在 final 之后画它们，不经过 goodGL 的光照和 tonemap。
// 两个模式：显示空间（方案 B，final 之后叠画）/ scene（方案 A，进 goodGL 场景，只输出 E^(1/2.2)）。
// 这里按 fancy.js 的光照项（直射 + 天空环境 + 火把 + 最小光）求一个场景辐亮度 E，再套 final.js 的曝光 / 分级 / ACES / 饱和度 / gamma，
// 折成显示空间的乘子，直接写进材质 color。每个实体每帧一次，GPU 零成本；没有阴影、没有逐面朝向（取半球平均）。
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lb = l => { const f = 1 - l; return (1 - f) / (f * 3 + 1); };                          // fancy.js 的 lb()
const aces = x => { const v = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14); return v < 0 ? 0 : v > 1 ? 1 : v; };
const A_REF = 0.35;                                                                           // 参考反照率（线性）：中灰；乘子 = 显示(A_REF·E) / 显示(A_REF 本身)，灰阶对、亮 / 暗贴图近似
const D_REF = Math.pow(A_REF, 1 / 2.2);

// getF()：当前帧对象（需要 ambCol / lightCol / lightDir / torchCol / exposure / grade / saturation / flicker / underwater）；没有帧时返回 null
export function createEntityLight(getF, { maxGain = 1.8, scene = () => false, gain = () => 1 } = {}) {
  return function entityLight(sky15, blk15, out) {
    const F = getF();
    if (!F) return out.setRGB(1, 1, 1);
    const sky = Math.min(1, Math.max(0, sky15 / 15)), b = lb(Math.min(1, Math.max(0, blk15 / 15)));
    const sunUp = Math.max(F.lightDir[1], 0), vis = smooth(0.8, 1, sky);                    // 无阴影图：直射只看天空光是否满格（同 fancy 在 shadowOff 下的 sh）
    const fl = F.flicker || 1;
    const g = gain();                                                                          // P.entExposure：实体亮度倍率（面板「实体」）
    const E = [0, 1, 2].map(i => {
      const direct = F.lightCol[i] * 0.4 * (0.35 + 0.65 * sunUp) * vis;                    // 半球平均的 N·L ≈ 0.4；太阳低时略收
      const amb = F.ambCol[i] * 0.725 * sky * sky;                                          // (0.45 + 0.55·up) 在 up 均匀时的均值
      const torch = F.torchCol[i] * b * b * 2.4 * fl * 0.8;
      return (direct + amb + torch + [0.004, 0.005, 0.007][i] * 0.7) * g;
    });
    if (scene()) return out.setRGB(...E.map(e => Math.pow(Math.max(e, 0), 1 / 2.2)));         // 方案 A：实体进 goodGL 场景，曝光 / tonemap 由管线做；材质色 = E^(1/2.2)，合并 pass 的 pow(2.2) 还原成 反照率 × E
    const col = E.map((e, i) => A_REF * e * F.exposure * F.grade[i]);
    let d = col.map(aces);
    const l = d[0] * 0.2126 + d[1] * 0.7152 + d[2] * 0.0722;
    d = d.map(v => Math.pow(Math.max(0, l + (v - l) * F.saturation), 1 / 2.2));
    if (F.underwater) d = [d[0] * (1 - 0.35 * 0.45), d[1] * (1 - 0.35 * 0.25), d[2]];      // final.js：mix(col, col·(0.55,0.75,1), 0.35)
    return out.setRGB(Math.min(maxGain, d[0] / D_REF), Math.min(maxGain, d[1] / D_REF), Math.min(maxGain, d[2] / D_REF));
  };
}
