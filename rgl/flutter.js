// rgl/flutter.js —— gm.flutter：体积内的「飘落 / 漂浮」粒子 API（落叶、气泡、微粒、雪片、花瓣……），与 firefly（锚在物体上的光效）并列。
//   firefly 是「一个精灵挂在一个锚点上」；flutter 是「往一个 xyz~xyz 区间里持续放精灵，精灵自己飘、自己落、碰到东西自己停 / 灭」。
//   精灵的绘制抽象成 shade()（内置 leaf / bubble / mote / flake，也可以传自己的 GLSL）；运动、光照、介质（空气 / 水）、深度合并全在这里。
//
// 用法（gm.flutter；宿主 B 才有，= renderer.flutter）：
//   const h = flutter.add({
//     preset: 'leaf',                 // 可选：从 flutter.presets（动态参数字典）取一套默认值，再被下面的字段覆盖
//     region: [x0, y0, z0, x1, y1, z1],   // 发射区间（世界坐标）；也可以是函数 () => [...]，每帧求值（跟着玩家 / 机位走）
//     emit: (cx, cy, cz) => null | { at?, color?, vel? },   // 可选：候选格（区间内随机一点所在的格）→ null = 拒绝；at 覆盖落点，color 覆盖颜色，vel 覆盖初速
//     rate: 6,                        // 每秒放几个（rate × dt 累加，满 1 个放 1 个；候选被 emit 拒绝时本个放弃）
//     ...
//   });
//   h.set({ ... })      改动态参数（下一帧生效；已经在飞的粒子也立刻按新参数运动 / 着色）
//   h.burst(n)          立刻放 n 个（走同一套 region / emit）
//   h.remove({ kill })  停止发射；kill = true 同时清掉已放出的粒子，否则让它们飞完 / 淡出
//   flutter.clear()  flutter.stats()  flutter.presets  flutter.add / update
//
// ---- 参数分两类 ----
// 静态（创建时定死，之后不可 set；改了要删了重建）：决定「这是什么东西」「画在哪个批次」「放在哪种介质里」
//   sprite   'leaf' | 'bubble' | 'mote' | 'flake'，或含 `vec4 shade(vec2 p, vec3 tint, float seed, float flip, vec4 look)` 的 GLSL 源码
//            p ∈ [−1,1]²（已按粒子朝向旋转，y 向上）；tint = 粒子颜色（已乘光照）；seed ∈ [0,1) 每粒子固定；flip = 翻转相位（弧度，叶片绕长轴）；look = 下面的 look
//            返回 straight（非预乘）rgb + alpha；预乘 / 门限 / 深度合并在这里
//   medium   'air' | 'water' | 'any'   粒子只能待在这种介质里；放出时不在 → 放弃；飞出去 → 见 onLiquid / 灭掉
//   onLiquid 'float' | 'kill' | 'pass' medium = 'air' 的粒子进了水：漂在水面 / 灭 / 穿过去
//   contact  'rest' | 'stop' | 'kill'  撞到实心方块：静止几秒再淡出 / 停住 / 灭
//   max      这个发射器同时最多多少个粒子（1..1024）
// 动态（set() 随时改）：
//   region emit rate tries      发射：tries = 单个粒子最多试几个候选点
//   size life color alpha       外观：size / life = [min, max]（或数字）；size = 精灵直径（格）；life = 秒；color = [r,g,b] 或 0xRRGGBB（emit 返回的 color 优先）
//   vel                         初速抖动幅度 ±[x, y, z]（基准速度 = (0, −fall, 0)）
//   fall bob resp               竖直：终端下落速度（格 / 秒，负 = 上升）、速度随时间起伏的比例、趋近速度（1 / 秒）
//   sway drift damp             水平：钟摆摆动加速度 / 三轴漫游加速度 / 水平阻尼
//   flip spin tilt              绕长轴翻转速率倍数 / 面内旋转角速度幅度（rad/s） / 摆动带动朝向偏转（rad）
//   rest                        contact = 'rest' 时静止多久 [min, max]（秒）
//   look                        [x, y, z, w]，原样传给 shade() 的 look（气泡：高光 / 不透明度 / 亮环）
//   fadeIn fadeOut              粒子淡入 / 淡出时长（秒）
//   lightMin                    亮度下限（0..1，显示空间）：水深处天光为 0 时不让粒子比雾还黑
// 世界适配器 env：{ solid(x,y,z) → bool, water(x,y,z) → bool, light(x,y,z, THREE.Color) → Color（entityLight）}；整格坐标。
import { P } from './anchor.js';

const MAXG = 1024;

// ---------------------------------------------------------------- 精灵库（shade 约定见头注释）
const SPRITES = {
  leaf: `   // 叶片：卵形轮廓 + 细锯齿 + 叶柄 + 中脉 + 斜向侧脉；绕长轴翻转时变窄变暗，背面更淡更黄
vec4 shade(vec2 p, vec3 tint, float seed, float flip, vec4 look) {
  float cf = cos(flip);
  float k = max(abs(cf), 0.16); p.x /= k;
  float t = clamp((p.y + 0.92) / 1.86, 0.0, 1.0);
  float w = 0.62 * pow(max(sin(3.14159 * pow(t, 0.72)), 0.0), 0.85);
  w *= 1.0 + 0.07 * sin(p.y * 31.0 + seed * 9.0) * smoothstep(0.1, 0.5, t);
  float d = abs(p.x) - w, px = max(fwidth(d), 1e-3);
  float cover = 1.0 - smoothstep(-px, px, d);
  float stem = (1.0 - smoothstep(0.03, 0.06, abs(p.x))) * step(p.y, -0.88) * step(-1.0, p.y);
  cover = max(cover * step(-0.9, p.y) * step(p.y, 0.98), stem);
  vec3 col = tint * (0.72 + 0.4 * t) * (0.88 + 0.24 * seed);
  float mid = 1.0 - smoothstep(0.035, 0.07, abs(p.x));
  float side = 1.0 - smoothstep(0.02, 0.06, abs(fract(p.y * 3.2 - abs(p.x) * 2.6) - 0.5) * 0.5);
  float vein = max(mid, side * smoothstep(0.06, 0.16, abs(p.x)) * step(abs(p.x), w * 0.9));
  col = mix(col, col * vec3(1.35, 1.25, 0.9), vein * 0.55);
  col *= 1.0 - 0.28 * smoothstep(w * 0.55, w, abs(p.x));
  col = cf >= 0.0 ? col : mix(col * 1.12, vec3(dot(col, vec3(0.33))) * vec3(1.1, 1.0, 0.8), 0.3);
  col *= 0.6 + 0.4 * abs(cf);
  return vec4(col, cover);
}`,
  bubble: `   // 气泡：几乎全透明的球；look = (高光, 不透明度, 亮环)。只有淡边缘 + 一块大而柔的窗口反光 + 对侧弱反光
vec4 shade(vec2 p, vec3 tint, float seed, float flip, vec4 look) {
  float r = length(p), body = smoothstep(1.0, 0.92, r), rim = body * smoothstep(0.62, 0.97, r);
  float hi = smoothstep(0.34, 0.0, length(p - vec2(-0.36, 0.38))) * 0.5 + smoothstep(0.2, 0.0, length(p - vec2(0.4, -0.42))) * 0.18;
  float a = (0.06 * body + 0.5 * look.z * rim) * look.y + hi * look.x * body * look.y;
  return vec4(mix(tint, vec3(1.0), clamp(hi * look.x, 0.0, 0.5)), a);
}`,
  mote: `   // 微粒：软圆
vec4 shade(vec2 p, vec3 tint, float seed, float flip, vec4 look) { float a = smoothstep(1.0, 0.0, length(p)); return vec4(tint, a * a); }`,
  flake: `   // 雪片 / 花瓣碎：边缘稍硬的圆，带一点内部明暗
vec4 shade(vec2 p, vec3 tint, float seed, float flip, vec4 look) { float r = length(p); return vec4(tint * (1.0 - 0.18 * r), 1.0 - smoothstep(0.55, 0.95, r)); }`,
};

const VS = `attribute vec3 aColor; attribute vec4 aLook; attribute float aSize, aAlpha, aAngle, aFlip, aSeed; uniform float uScale;
varying vec3 vC; varying vec4 vLook; varying float vA, vAng, vFlip, vSeed;
void main(){ vC = aColor; vLook = aLook; vA = aAlpha; vAng = aAngle; vFlip = aFlip; vSeed = aSeed; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 1.0, 128.0); }`;
const fs = user => `varying vec3 vC; varying vec4 vLook; varying float vA, vAng, vFlip, vSeed;
${user}
void main(){
  vec2 p = vec2(gl_PointCoord.x * 2.0 - 1.0, 1.0 - gl_PointCoord.y * 2.0); float c = cos(vAng), s = sin(vAng); p = mat2(c, -s, s, c) * p;
  vec4 r = shade(p, vC, vSeed, vFlip, vLook); float a = r.a * vA; if (a < 0.02) discard;
  gl_FragColor = vec4(r.rgb * a, a);   // 预乘 alpha（entComp / 方案 B 都吃这个）
}`;

// ---------------------------------------------------------------- 参数
const pair = (label, lo, hi) => { const f = P.num(label, lo, hi); return v => Array.isArray(v) ? [f(v[0]), f(v[1])] : [f(v), f(v)]; };
const RGB = c => typeof c === 'number' ? [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255] : Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every(Number.isFinite) ? [c[0], c[1], c[2]] : null;
const oneOf = (label, list) => v => { if (!list.includes(v)) throw new TypeError(`${label} 必须是 ${list.join(' / ')}`); return v; };
const fn = (label, nullable) => v => { if (v == null && nullable) return null; if (typeof v !== 'function') throw new TypeError(`${label} 必须是函数`); return v; };
const SPEC = {   // 动态参数的解析器：(值) → 新值，不合法就 throw
  region: v => { if (v == null || typeof v === 'function') return v; if (!Array.isArray(v) || v.length < 6 || !v.slice(0, 6).every(Number.isFinite)) throw new TypeError('region 必须是 [x0, y0, z0, x1, y1, z1] 或返回它的函数'); return v.slice(0, 6); },
  emit: fn('emit', true), rate: P.num('rate', 0, 1e4), tries: P.int('tries', 1, 256),
  size: pair('size', 0.005, 16), life: pair('life', 0.05, 3600), alpha: P.num('alpha', 0, 1),
  color: v => { const c = RGB(v); if (!c) throw new TypeError('color 必须是 [r,g,b] 或 0xRRGGBB'); return c; },
  vel: P.vec3('vel'), fall: P.num('fall', -20, 20), bob: P.num('bob', 0, 2), resp: P.num('resp', 0.01, 50),
  sway: P.num('sway', 0, 20), drift: P.num('drift', 0, 20), damp: P.num('damp', 0, 20),
  flip: P.num('flip', 0, 20), spin: P.num('spin', 0, 20), tilt: P.num('tilt', 0, 3), rest: pair('rest', 0, 600),
  look: v => { if (!Array.isArray(v) || v.length < 4 || !v.slice(0, 4).every(Number.isFinite)) throw new TypeError('look 必须是 [x, y, z, w]'); return v.slice(0, 4); },
  fadeIn: P.num('fadeIn', 0, 60), fadeOut: P.num('fadeOut', 0, 60), lightMin: P.num('lightMin', 0, 1),
};
const STATIC = {
  sprite: v => { if (typeof v !== 'string') throw new TypeError('sprite 必须是内置名或 GLSL 源码'); if (SPRITES[v]) return v; if (!/\bvec4\s+shade\s*\(/.test(v)) throw new TypeError(`sprite 必须是 ${Object.keys(SPRITES).join(' / ')} 或含 vec4 shade(...) 的 GLSL 源码`); return v; },
  medium: oneOf('medium', ['air', 'water', 'any']), onLiquid: oneOf('onLiquid', ['float', 'kill', 'pass']), contact: oneOf('contact', ['rest', 'stop', 'kill']), max: P.int('max', 1, MAXG),
};

/** 动态参数字典（可在运行时直接改：flutter.presets.leaf.fall = 1.2，下次 add 起生效；已有句柄用 h.set） */
export const presets = {
  base: { sprite: 'mote', medium: 'any', onLiquid: 'pass', contact: 'stop', max: 256, rate: 4, tries: 16, size: [0.1, 0.1], life: [6, 10], color: [1, 1, 1], alpha: 1, vel: [0.2, 0.2, 0.2],
    fall: 0.5, bob: 0, resp: 2.5, sway: 0, drift: 0, damp: 1, flip: 0, spin: 0, tilt: 0, rest: [2.5, 4.5], look: [0, 0, 0, 0], fadeIn: 0.3, fadeOut: 0.6, lightMin: 0.12, region: null, emit: null },
  leaf: { sprite: 'leaf', medium: 'air', onLiquid: 'float', contact: 'rest', max: 400, rate: 6, tries: 40, size: [0.2, 0.29], life: [16, 16], vel: [0.15, 0.1, 0.15],
    fall: 0.55, bob: 0.55, resp: 2.5, sway: 1, damp: 1.4, flip: 1, spin: 1.6, tilt: 0.55 },
  bubble: { sprite: 'bubble', medium: 'water', contact: 'stop', max: 200, rate: 2.4, tries: 4, size: [0.045, 0.085], life: [4, 4], color: [0.8, 0.95, 1], vel: [0.1, 0.2, 0.1],
    fall: -1.0, resp: 1.5, drift: 1, damp: 0, look: [0.3, 0.45, 0.5, 0], lightMin: 0.3 },
  mote: { sprite: 'mote', medium: 'water', contact: 'stop', max: 400, rate: 25, tries: 8, size: [0.035, 0.065], life: [5, 8], color: [0.75, 0.9, 0.95], alpha: 0.55, vel: [0.03, 0.02, 0.03],
    fall: 0, resp: 2.5, drift: 1, damp: 0.8, lightMin: 0.3 },
  flake: { sprite: 'flake', medium: 'air', onLiquid: 'kill', contact: 'rest', max: 600, rate: 20, tries: 8, size: [0.05, 0.09], life: [10, 14], vel: [0.1, 0.1, 0.1], fall: 1.2, bob: 0.2, sway: 0.5, damp: 1.2, rest: [1, 2] },
};

export function createFlutter(THREE, scene, { camera, renderer, env, enabled = () => true }) {
  const uniforms = { uScale: { value: 500 } }, groups = new Map(), live = new Set(), tmpC = new THREE.Color(), v2 = new THREE.Vector2(), rnd = Math.random, floor = Math.floor;
  let nextId = 1, t = 0;

  function makeGroup(src) {
    const geo = new THREE.BufferGeometry(), a = {
      pos: new Float32Array(MAXG * 3), col: new Float32Array(MAXG * 3), size: new Float32Array(MAXG), alpha: new Float32Array(MAXG), ang: new Float32Array(MAXG), angOut: new Float32Array(MAXG), flip: new Float32Array(MAXG), seed: new Float32Array(MAXG), look: new Float32Array(MAXG * 4),
      vel: new Float32Array(MAXG * 3), life: new Float32Array(MAXG), life0: new Float32Array(MAXG), spin: new Float32Array(MAXG), rest: new Float32Array(MAXG), lt: new Float32Array(MAXG), light: new Float32Array(MAXG * 3), base: new Float32Array(MAXG * 3), f0: new Float32Array(MAXG),
      resting: new Uint8Array(MAXG), owner: new Array(MAXG),
    };
    const at = (k, arr, s) => geo.setAttribute(k, new THREE.BufferAttribute(arr, s).setUsage(THREE.DynamicDrawUsage));
    at('position', a.pos, 3); at('aColor', a.col, 3); at('aSize', a.size, 1); at('aAlpha', a.alpha, 1); at('aAngle', a.angOut, 1); at('aFlip', a.flip, 1); at('aSeed', a.seed, 1); at('aLook', a.look, 4); geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: fs(SPRITES[src] || src), uniforms, transparent: true, depthTest: true, depthWrite: true, depthFunc: THREE.LessEqualDepth,   // depthWrite：方案 A 的 entComp 靠 entRT 深度判定「有没有实体」
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const g = { a, n: 0, geo, mesh: new THREE.Points(geo, mat) };
    g.mesh.frustumCulled = false; g.mesh.renderOrder = 10; g.mesh.visible = false; scene.add(g.mesh);
    return g;
  }
  const dropFrom = (g, i) => {   // 交换删除：把最后一个挪到 i
    const a = g.a, l = --g.n; if (a.owner[i]) a.owner[i].count--; if (i === l) { a.owner[l] = null; return; }
    for (const [arr, w] of [[a.pos, 3], [a.col, 3], [a.vel, 3], [a.light, 3], [a.base, 3], [a.look, 4]]) for (let k = 0; k < w; k++) arr[i * w + k] = arr[l * w + k];
    for (const k of ['size', 'alpha', 'ang', 'angOut', 'flip', 'seed', 'life', 'life0', 'spin', 'rest', 'lt', 'f0', 'resting', 'owner']) a[k][i] = a[k][l];
    a.owner[l] = null;
  };

  function parse(o, p) {
    const q = { ...p };
    try { for (const k in SPEC) if (k in o) q[k] = SPEC[k](o[k]); } catch (e) { throw new e.constructor(`flutter: ${e.message}`); }
    return q;
  }

  function spawn(fx) {
    const p = fx.p, g = fx.g, a = g.a; if (g.n >= MAXG || fx.count >= fx.max) return false;
    const r = typeof p.region === 'function' ? p.region() : p.region; if (!r) return false;
    for (let tr = 0; tr < p.tries; tr++) {
      const x = r[0] + (r[3] - r[0]) * rnd(), y = r[1] + (r[4] - r[1]) * rnd(), z = r[2] + (r[5] - r[2]) * rnd(), cx = floor(x), cy = floor(y), cz = floor(z);
      const w = env.water(cx, cy, cz); if (fx.medium === 'water' ? !w : fx.medium === 'air' ? w : false) continue;
      const e = p.emit ? p.emit(cx, cy, cz) : {}; if (e === null || e === false) continue;
      const at = e && e.at || [x, y, z], col = RGB(e && e.color) || p.color, vv = e && e.vel;
      const i = g.n++; fx.count++; a.owner[i] = fx;
      a.pos[i * 3] = at[0]; a.pos[i * 3 + 1] = at[1]; a.pos[i * 3 + 2] = at[2];
      a.vel[i * 3] = vv ? vv[0] : (rnd() * 2 - 1) * p.vel[0]; a.vel[i * 3 + 1] = vv ? vv[1] : -p.fall + (rnd() * 2 - 1) * p.vel[1]; a.vel[i * 3 + 2] = vv ? vv[2] : (rnd() * 2 - 1) * p.vel[2];
      a.base[i * 3] = col[0]; a.base[i * 3 + 1] = col[1]; a.base[i * 3 + 2] = col[2];
      a.life0[i] = a.life[i] = p.life[0] + (p.life[1] - p.life[0]) * rnd(); a.size[i] = p.size[0] + (p.size[1] - p.size[0]) * rnd();
      a.ang[i] = rnd() * 6.283; a.flip[i] = rnd() * 6.283; a.seed[i] = rnd(); a.spin[i] = (rnd() * 2 - 1); a.rest[i] = 0; a.resting[i] = 0; a.lt[i] = 0; a.alpha[i] = 0; a.f0[i] = rnd() * 100;
      return true;
    }
    return false;
  }

  function add(o) {
    if (!o || typeof o !== 'object') throw new TypeError('flutter: add 需要参数对象');
    const base = presets[o.preset] ? { ...presets.base, ...presets[o.preset] } : o.preset == null ? { ...presets.base } : (() => { throw new TypeError(`flutter: 没有 preset '${o.preset}'（${Object.keys(presets).filter(k => k !== 'base').join(' / ')}）`); })();
    const st = {}; try { for (const k in STATIC) st[k] = STATIC[k](k in o ? o[k] : base[k]); } catch (e) { throw new e.constructor(`flutter: ${e.message}`); }
    const p = parse(o, parse(base, {}));   // 先套 preset，再套调用方的字段
    if (!p.region) throw new TypeError('flutter: region 必须给：[x0, y0, z0, x1, y1, z1] 或返回它的函数');
    const key = st.sprite; let g = groups.get(key); if (!g) { g = makeGroup(key); groups.set(key, g); }
    const fx = { id: nextId++, p, ...st, g, count: 0, acc: 0, age: 0, state: 'alive', handle: null };
    live.add(fx);
    const h = fx.handle = {
      id: fx.id, get alive() { return fx.state === 'alive'; }, get age() { return fx.age; }, get count() { return fx.count; },
      set(q) { if (fx.state !== 'alive') return h; for (const k in STATIC) if (k in q) throw new TypeError(`flutter: ${k} 不可修改，删了重建`); fx.p = parse(q, fx.p); return h; },
      burst(n) { let k = 0; for (let i = 0; i < n; i++) if (fx.state === 'alive' && spawn(fx)) k++; return k; },
      remove(opt) { remove(h, opt); return h; },
    };
    return h;
  }
  function remove(h, opt) {
    for (const fx of live) if (fx.id === (h && h.id)) {
      fx.state = 'dead'; live.delete(fx);
      if (opt && opt.kill) for (let i = fx.g.n - 1; i >= 0; i--) if (fx.g.a.owner[i] === fx) dropFrom(fx.g, i);
    }
  }
  function clear() { for (const fx of [...live]) remove(fx.handle, { kill: true }); for (const g of groups.values()) { while (g.n) dropFrom(g, g.n - 1); } }

  function update(dtMs) {
    const dt = Math.min(dtMs / 1000, 0.1), on = enabled(); t += dt;
    for (const g of groups.values()) g.mesh.visible = false;
    if (!on) return;
    for (const fx of live) { fx.age += dt; fx.acc = Math.min(fx.acc + fx.p.rate * dt, 8); while (fx.acc >= 1) { fx.acc -= 1; spawn(fx); } }
    renderer.getDrawingBufferSize(v2); uniforms.uScale.value = v2.y / (2 * Math.tan(camera.fov * Math.PI / 360));
    for (const g of groups.values()) {
      const a = g.a;
      for (let i = 0; i < g.n;) {
        const fx = a.owner[i], p = fx.p;
        if ((a.life[i] -= dt) <= 0) { dropFrom(g, i); continue; }
        const x = a.pos[i * 3], y = a.pos[i * 3 + 1], z = a.pos[i * 3 + 2], cx = floor(x), cy = floor(y), cz = floor(z), s = a.seed[i] * 100, wet = env.water(cx, cy, cz);
        let dead = false;
        if (fx.medium === 'water' && !wet) dead = true;                                            // 水里的东西离开水就消失（气泡在水面破掉）
        else if (fx.medium === 'air' && wet) { if (fx.onLiquid === 'kill') dead = true; else if (fx.onLiquid === 'float' && a.vel[i * 3 + 1] < -0.15) a.vel[i * 3 + 1] = -0.15; }
        if (dead) { dropFrom(g, i); continue; }
        if (a.resting[i]) { a.rest[i] -= dt; a.flip[i] += (0.25 - a.flip[i]) * Math.min(1, dt * 6); if (a.rest[i] <= 0) a.life[i] = Math.min(a.life[i], p.fadeOut); }
        else {
          const vx = a.vel[i * 3], vy = a.vel[i * 3 + 1], vz = a.vel[i * 3 + 2]; let nvx = vx, nvy = vy, nvz = vz;
          const target = -p.fall * (1 + p.bob * Math.sin((t + a.f0[i] * 0.01) * 2.6 + s * 2));    // 竖直：趋近（起伏的）终端速度
          nvy += (target - vy) * Math.min(1, dt * p.resp);
          nvx += Math.sin(t * 2.1 + s) * dt * 1.8 * p.sway + Math.sin(t * 1.3 + s) * dt * 0.25 * p.drift;   // 水平：钟摆 + 漫游
          nvz += Math.cos(t * 1.7 + s * 1.3) * dt * 1.8 * p.sway + Math.cos(t * 1.1 + s * 1.7) * dt * 0.25 * p.drift;
          nvy += Math.sin(t * 0.9 + s * 0.6) * dt * 0.1 * p.drift;
          const dm = Math.max(0, 1 - dt * p.damp); nvx *= dm; nvz *= dm;
          a.vel[i * 3] = nvx; a.vel[i * 3 + 1] = nvy; a.vel[i * 3 + 2] = nvz;
          a.ang[i] += a.spin[i] * p.spin * dt; a.flip[i] += dt * (2.2 + (s % 3) * 0.9) * (0.6 + 0.4 * Math.sin(t * 1.9 + s)) * p.flip;
          const nx = x + nvx * dt, ny = y + nvy * dt, nz = z + nvz * dt;
          if (env.solid(floor(nx), floor(ny), floor(nz))) {
            if (fx.contact === 'kill') { dropFrom(g, i); continue; }
            a.vel[i * 3] = a.vel[i * 3 + 1] = a.vel[i * 3 + 2] = 0;
            if (fx.contact === 'rest') { a.resting[i] = 1; a.rest[i] = p.rest[0] + (p.rest[1] - p.rest[0]) * rnd(); }
          } else { a.pos[i * 3] = nx; a.pos[i * 3 + 1] = ny; a.pos[i * 3 + 2] = nz; }
        }
        a.angOut[i] = a.resting[i] ? a.ang[i] : a.ang[i] + p.tilt * Math.sin(t * 2.1 + s);   // 朝向 = 面内角 + 随钟摆的偏转（落地后不偏转）
        if ((a.lt[i] -= dt) <= 0) { a.lt[i] = 0.2 + rnd() * 0.1; env.light(cx, cy, cz, tmpC); a.light[i * 3] = tmpC.r; a.light[i * 3 + 1] = tmpC.g; a.light[i * 3 + 2] = tmpC.b; }
        const lm = p.lightMin;
        a.col[i * 3] = a.base[i * 3] * Math.max(a.light[i * 3], lm); a.col[i * 3 + 1] = a.base[i * 3 + 1] * Math.max(a.light[i * 3 + 1], lm); a.col[i * 3 + 2] = a.base[i * 3 + 2] * Math.max(a.light[i * 3 + 2], lm);
        a.look[i * 4] = p.look[0]; a.look[i * 4 + 1] = p.look[1]; a.look[i * 4 + 2] = p.look[2]; a.look[i * 4 + 3] = p.look[3];
        const born = p.fadeIn > 0 ? Math.min(1, (a.life0[i] - a.life[i]) / p.fadeIn) : 1, die = p.fadeOut > 0 ? Math.min(1, a.life[i] / p.fadeOut) : 1;
        a.alpha[i] = Math.min(born, die) * p.alpha;
        i++;
      }
      g.mesh.visible = g.n > 0;
      if (g.n) { for (const k of ['position', 'aColor', 'aSize', 'aAlpha', 'aAngle', 'aFlip', 'aSeed', 'aLook']) g.geo.attributes[k].needsUpdate = true; g.geo.setDrawRange(0, g.n); }
    }
  }

  return {
    add, update, remove: h => remove(h), clear, presets,
    stats: () => ({ live: live.size, particles: [...groups.values()].reduce((n, g) => n + g.n, 0), groups: [...groups.values()].filter(g => g.n).length }),
  };
}
