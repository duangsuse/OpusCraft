// rgl/entity.js —— 实体（生物、掉落物、TNT、粒子）：CPU 光照、脚下软影、合并进 goodGL 场景。由 entlight / blobshadow / shaders/entcomp.js 合并。
import { Fps } from './pass.js';

// ======== entlight.js ========
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

// ======== blobshadow.js ========
// rgl/blobshadow.js —— 实体脚下的圆形软影（CPU 摆放，一个贴花四边形每实体，不采样阴影图）。
// depthWrite 必须开：方案 A 的合并 pass 靠 entRT 的深度判定像素有没有实体（深度 = 1 视为空），透明不写深度的影子会被整个丢掉。
// 实体由 three 在 final 之后画，进不了 goodGL 的阴影图；这个只给「站在地上」的感觉：半径随碰撞体宽，离地越高越淡越大，
// 浓度跟天空光（洞里、夜里几乎没有）和直射光强度走。casters() 给 [{ x, y, z, r, sky }]（脚下世界坐标 + 半径 + 所在格天空光 0..15）；groundY(x, y, z) 给脚下地面的世界 y（没有则 null）。
export function createBlobShadows(THREE, scene, { casters, groundY, getF, max = 48, strength = () => 0.38 }) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const pool = [];
  const mk = () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
    m.renderOrder = -1; m.visible = false; m.frustumCulled = false; scene.add(m); pool.push(m); return m;
  };
  return {
    update() {
      const F = getF(), list = F ? casters() : [];
      const sun = F ? Math.min(1, Math.max(0, F.lightDir[1] * 3)) * Math.min(1, (F.lightCol[0] + F.lightCol[1] + F.lightCol[2]) / 2.5) : 0;
      let n = 0;
      for (const e of list) {
        if (n >= max) break;
        const gy = groundY(e.x, e.y, e.z); if (gy == null) continue;
        const h = Math.max(0, e.y - gy), fade = 1 / (1 + h * 0.9);
        const a = strength() * fade * Math.pow(e.sky / 15, 2) * (0.25 + 0.75 * sun);           // 夜里 / 洞里留 25%：环境遮蔽的暗斑
        if (a < 0.02) continue;
        const m = pool[n] || mk(); n++;
        const s = e.r * 2.8 * (1 + h * 0.25);
        m.position.set(e.x, gy + 0.03, e.z); m.scale.set(s, 1, s); m.material.opacity = a; m.visible = true;
      }
      for (let i = n; i < pool.length; i++) pool[i].visible = false;
    },
    dispose() { for (const m of pool) { scene.remove(m); m.material.dispose(); } pool.length = 0; geo.dispose(); tex.dispose(); },
  };
}

// ======== entcomp.js ========
// rgl/shaders/entcomp.js —— R4 方案 A：three 画进离屏目标的宿主实体（颜色 + 深度）合并进 goodGL 的 scene（color + gbuf + depth）。
//   颜色是显示空间的原始值（宿主 ColorManagement 关）→ 线性 = pow(rgb, 2.2)；three 的混合是预乘 alpha，所以先除 alpha 再 pow 再乘回去。
//   光照项已在 CPU 材质色里折成 E^(1/2.2)（entlight.js 的 scene 模式），所以 pow 之后正好是 反照率 × E。
//   深度：宿主相机 near / far → goodGL 的 near / far（depthout.js 的逆运算）；硬件深度测试（LESS）负责被地形遮挡。
//   gbuf = (0, 0, −1, 0)：ssrW = 0（实体不做 SSR），b = −1 是给 comp 的「实体像素」标记（→ alpha 0 → TAA 不混历史）。
//   两遍合并（soft = 0 / 1）：实心像素（e.a ≥ 0.5）用 depthMask(true) 画，深度进场景（水 / 云 / 雾按它当作实体表面）；
//   软边像素（火焰光晕 / 火星边缘 / 脚下软影）用 depthMask(false) 画，只混色、深度保持场景原值——否则光晕那块方框在 comp 里
//   变成「近处表面」，isSky / dist 全变，云、雾、水汽在这块方框里整块消失（火把对着天空 = 一圈黑洞）。
export const entComp = (Pass, { entColor, entDepth, hostNear, hostFar, soft }) => Pass({ tag: 'entComp' })`#version 300 es
precision highp float;
in vec2 v_uv; layout(location=0) out vec4 o; layout(location=1) out vec4 o2;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 e = texelFetch(${entColor}, p, 0);
  if (e.a < 0.004) discard;
  if ((${soft} > 0.5) != (e.a < 0.5)) discard;                                // 本遍只处理实心 / 软边中的一类
  float zd = texelFetch(${entDepth}, p, 0).r;
  if (zd >= 1.0) discard;
  float d0 = 2.0 * ${hostNear} * ${hostFar} / (${hostFar} + ${hostNear} - (zd * 2.0 - 1.0) * (${hostFar} - ${hostNear}));
  float d = max(d0 - max(0.04, d0 * 0.002), ${Fps.near});                    // 往相机方向偏一点：贴地的脚下软影与地面深度几乎相等，不偏就会 z-fight 被剔掉
  float z = (${Fps.far} + ${Fps.near}) / (${Fps.far} - ${Fps.near}) - 2.0 * ${Fps.far} * ${Fps.near} / ((${Fps.far} - ${Fps.near}) * d);
  gl_FragDepth = z * 0.5 + 0.5;                                               // 软边那一遍 depthMask 关着：只用于深度测试（地形遮挡），不写回
  vec3 lin = pow(max(e.rgb / e.a, 0.0), vec3(2.2)) * e.a;
  o = vec4(lin, e.a); o2 = vec4(0.0, 0.0, -1.0, 0.0);
}`;
