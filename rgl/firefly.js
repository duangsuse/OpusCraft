// rgl/firefly.js —— 用户光效（firefly）：锚定在 Mob / 实体 / 世界点上的像素风发光精灵，着色器由调用方给。
//   与 fire.js（火把 / 岩浆 / 火焰粒子）完全分开：不共享着色器、不过曝（输出就是 shade() 返回的显示空间色）、不摇晃（位置 = 锚点位姿 + 偏移，没有任何随机扰动）。
//   一个 firefly = 一张 instanced 四边形；按「着色器源码 + hard」分组，同一份着色器的所有实例一次 draw。
//   画进宿主 three 场景（renderOrder 6，排在 fire.js 之后）：方案 A 随实体进 entRT（写深度，entComp 按深度合并），方案 B 在 final 之后叠画。输出预乘 alpha。
//
// 用法（gm.firefly；宿主 B 才有，= renderer.firefly）：
//   const h = firefly.add({
//     shader: 'vec4 shade(vec2 uv, float t, float seed, vec3 tint) { ... }',   // 必填，见下
//     anchor: { mob } | { ent } | { at: [x, y, z] },                          // 必填
//     offset: [0, 0, 0],      // 锚点局部坐标下的偏移（mob / ent 有 mesh 时 = mesh 的物体空间，随朝向转；at = 世界轴向）
//     axis: [0, 0, -1],       // 省略 = 面向相机的方块；给了 = 沿该方向（锚点局部）伸长：uv.y 0 = 偏移点（根部）→ 1 = 梢，宽度朝相机
//     size: 0.5,              // 世界尺寸（格）；数字 = 正方形，[宽, 高]
//     color: [1, 1, 1],       // tint：[r,g,b] 0..1 或 0xRRGGBB，原样传给 shade()
//     pixel: 16,              // 短边的像素格数（uv 先吸附到格心再进 shade）；0 = 不吸附
//     fps: 8,                 // shade() 的时间 t 按此帧率阶梯推进（像素画的「抽帧」感）；0 = 连续
//     hard: true,             // alpha 二值化（< 0.5 丢弃）；淡入 / 淡出按格抖动溶解。false = 保留 shade() 的 alpha
//     life: Infinity,         // 寿命（秒），到期后淡出
//     fadeIn: 0.2, fadeOut: 0.3,
//     onLost: 'fade',         // 锚点没了（mob 死亡 / 被移除、实体 dead、mesh 离开场景）：'fade' 停在最后位姿淡出 | 'remove' 立即删 | 'stay' 停在最后位姿一直留到 life
//     onEnd: (h, reason) => {},   // reason: 'life' | 'lost' | 'removed'
//   });
//   h.set({ offset, axis, size, color, pixel, fps, life, fadeIn, fadeOut })   // 改参数（shader / anchor / hard 不可改：删了重建）
//   h.remove({ fade = true })  h.alive  h.age
//   firefly.clear()  firefly.stats()
//
// 着色器约定：用户只写 shade()，其余（四边形、朝向、uv 吸附、alpha 门限、预乘）在这里：
//   vec4 shade(vec2 uv, float t, float seed, vec3 tint)
//     uv   ∈ [0,1]²，y 向上；已吸附到像素格心   t = 存活秒数（按 fps 阶梯化）   seed ∈ [0,1)，每个实例固定   返回 straight（非预乘）rgb + alpha
//   可用的小工具：float ffHash(vec2) / float ffNoise(vec2)。
// 实例上限：每份着色器 MAX 个。
import { createPool, P } from './anchor.js';
const MAX = 256;
const PRELUDE = `
float ffHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float ffNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ffHash(i), ffHash(i + vec2(1.0, 0.0)), f.x), mix(ffHash(i + vec2(0.0, 1.0)), ffHash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

const VS = `
attribute vec3 aPos;     // 世界坐标（偏移点）
attribute vec3 aAxis;    // 世界单位向量；零 = 面向相机
attribute vec2 aSize;
attribute vec4 aCol;     // rgb = tint，a = 淡入淡出系数
attribute vec3 aT;       // x = t（已阶梯化），y = seed，z = pixel
uniform float uFar;
varying vec2 vUv, vGrid;
varying vec4 vCol;
varying vec2 vT;
void main(){
  vec3 toEye = cameraPosition - aPos;
  float dist = length(toEye); toEye /= max(dist, 1e-4);
  vec3 camR = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), camU = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 r = camR, u = camU; float y0 = 0.5;
  if (dot(aAxis, aAxis) > 0.5) {
    u = aAxis; y0 = 0.0;
    vec3 c = cross(u, toEye);
    r = length(c) > 1e-3 ? normalize(c) : camR;
  }
  vec2 q = position.xy;
  vec3 wp = aPos + r * (q.x - 0.5) * aSize.x + u * (q.y - y0) * aSize.y;
  vUv = q; vCol = aCol; vT = aT.xy;
  vGrid = aT.z > 0.5 ? vec2(max(floor(aT.z * aSize.x / min(aSize.x, aSize.y) + 0.5), 1.0), max(floor(aT.z * aSize.y / min(aSize.x, aSize.y) + 0.5), 1.0)) : vec2(0.0);
  gl_Position = dist > uFar ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const fs = (user, hard) => `
precision highp float;
varying vec2 vUv, vGrid;
varying vec4 vCol;
varying vec2 vT;
${PRELUDE}
${user}
void main(){
  vec2 uv = vUv, cell = vec2(0.0);
  if (vGrid.x > 0.5) { cell = floor(uv * vGrid); uv = (cell + 0.5) / vGrid; }
  vec4 s = shade(uv, vT.x, vT.y, vCol.rgb);
  ${hard ? 'float a = step(0.5, s.a) * step(ffHash(cell * 1.7 + vT.y * 91.0), vCol.a);' : 'float a = s.a * vCol.a;'}
  if (a < 0.01) discard;
  gl_FragColor = vec4(s.rgb * a, a);
}`;

const RGB = c => typeof c === 'number' ? [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255] : Array.isArray(c) && c.length >= 3 ? [c[0], c[1], c[2]] : null;

export function createFirefly(THREE, scene, { camera, enabled = () => true, opacity = () => 1, radius = 64 }) {
  const groups = new Map();
  const uniforms = { uFar: { value: radius } };
  const _v = new THREE.Vector3();

  function makeGroup(src, hard) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), 3));
    const inst = (k, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * n), n); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); return a.array; };
    const g = { items: [], geo, arr: { pos: inst('aPos', 3), axis: inst('aAxis', 3), size: inst('aSize', 2), col: inst('aCol', 4), t: inst('aT', 3) } };
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: fs(src, hard), uniforms, transparent: true, depthTest: true, depthWrite: true, depthFunc: THREE.LessEqualDepth, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    g.mesh = new THREE.Mesh(geo, mat); g.mesh.frustumCulled = false; g.mesh.renderOrder = 6; g.mesh.visible = false;
    scene.add(g.mesh);
    return g;
  }

  const dim = P.num('size', 0.01, 1e4);
  const pool = createPool(THREE, {
    name: 'firefly',
    immutable: ['shader', 'anchor', 'hard'],
    spec: {
      offset: P.vec3('offset'),
      axis: v => { if (!v) return null; const a = P.vec3('axis')(v); if (Math.hypot(...a) < 1e-6) throw new TypeError('axis 不能是零向量'); return a; },
      size: v => Array.isArray(v) ? [dim(v[0]), dim(v[1])] : [dim(v), dim(v)],
      color: v => { const c = RGB(v); if (!c) throw new TypeError('color 必须是 [r,g,b] 或 0xRRGGBB'); return c; },
      pixel: P.int('pixel', 0, 1024), fps: P.num('fps', 0, 240),
    },
    defaults: () => ({ offset: [0, 0, 0], axis: null, size: [0.5, 0.5], color: [1, 1, 1], pixel: 16, fps: 8, life: Infinity, fadeIn: 0.2, fadeOut: 0.3 }),
    onAdd: fx => { fx.seed = (fx.id * 0.6180339887) % 1; fx.g.items.push(fx); },
    onDead: fx => fx.g.items.splice(fx.g.items.indexOf(fx), 1),
  });

  function add(o) {
    if (!o || typeof o.shader !== 'string' || !/\bvec4\s+shade\s*\(/.test(o.shader)) throw new TypeError('firefly: shader 必须是含 vec4 shade(vec2 uv, float t, float seed, vec3 tint) 的 GLSL 源码');
    const hard = o.hard !== false, gk = (hard ? 'H' : 'S') + o.shader;
    let g = groups.get(gk); if (!g) { g = makeGroup(o.shader, hard); groups.set(gk, g); }
    if (g.items.length >= MAX) throw new RangeError(`firefly: 同一份着色器最多 ${MAX} 个实例`);
    return pool.add(o, { g });
  }

  function update(dt) {
    const on = enabled() && opacity() > 0, op = Math.min(opacity(), 1);
    pool.tick(dt / 1000);
    for (const g of groups.values()) {
      const n = g.items.length;
      g.mesh.visible = on && n > 0;
      if (!g.mesh.visible) continue;
      const { pos, axis, size, col, t } = g.arr;
      for (let i = 0; i < n; i++) {
        const fx = g.items[i], p = fx.p;
        _v.set(p.offset[0], p.offset[1], p.offset[2]).applyMatrix4(fx.last); pos[i * 3] = _v.x; pos[i * 3 + 1] = _v.y; pos[i * 3 + 2] = _v.z;
        if (p.axis) { _v.set(p.axis[0], p.axis[1], p.axis[2]).transformDirection(fx.last); axis[i * 3] = _v.x; axis[i * 3 + 1] = _v.y; axis[i * 3 + 2] = _v.z; } else axis[i * 3] = axis[i * 3 + 1] = axis[i * 3 + 2] = 0;
        size[i * 2] = p.size[0]; size[i * 2 + 1] = p.size[1];
        col[i * 4] = p.color[0]; col[i * 4 + 1] = p.color[1]; col[i * 4 + 2] = p.color[2]; col[i * 4 + 3] = pool.fade(fx) * op;
        t[i * 3] = p.fps > 0 ? Math.floor(fx.age * p.fps) / p.fps : fx.age; t[i * 3 + 1] = fx.seed; t[i * 3 + 2] = p.pixel;
      }
      for (const k of ['aPos', 'aAxis', 'aSize', 'aCol', 'aT']) g.geo.attributes[k].needsUpdate = true;
      g.geo.instanceCount = n;
    }
  }

  return {
    add, update, remove: pool.remove, clear: pool.clear,
    stats: () => ({ live: pool.live.size, groups: [...groups.values()].filter(g => g.items.length).length }),
  };
}
