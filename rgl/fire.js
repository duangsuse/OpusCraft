// rgl/fire.js —— 火把 / 火焰 / 岩浆的粒子光效：火焰精灵（火焰着色器的 fbm 湍流 + 底部蓝焰 + 光晕）+ 火星（火把 / 火焰上升，岩浆抛射）。
//   发射点 = 相机附近区块里扫出来的方块：按区块缓存（ChunkSource 的 onChunkChanged / onBlockChanged 使缓存失效），每 0.3 s 汇总一次。
//   粒子全在 GPU 上过程式生成（位置 = f(发射点, 种子, 时间)），CPU 只在发射点变化时重写属性缓冲。
//   画进宿主 three 场景：方案 A 随实体进 entRT（要写深度，entComp 按深度合并），方案 B 在 final 之后叠画。输出预乘 alpha、显示空间过曝色（entComp 会 pow 2.2 还原）。
//   方块分类（BlockTable）：kind 3 火把；kind 4 且 emissive > 0 = 岩浆；kind 2 且 emissive ≥ 8 = 火焰。宿主 A 没有 emissive / 岩浆 / 火焰，只会有火把。
const GLSL_COMMON = `
float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return (vn(p) - 0.5) * 0.5 + (vn(p * 2.0) - 0.5) * 0.25 + (vn(p * 3.0) - 0.5) * 0.125 + 0.5; }
mat2 rotz(float a){ float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
`;

const FLAME_VS = `
attribute vec3 aInfo;           // x = 类型（0 火把 / 1 火焰），y = 种子，z = 火苗序号 j
uniform float uTime, uPx, uFar;
varying float vH, vSeed, vType, vRot, vK;
${GLSL_COMMON}
void main(){
  vec3 wp = position;
  float sd = aInfo.y, j = aInfo.z, torch = aInfo.x < 0.5 ? 1.0 : 0.0;
  float ph = vn(wp.xz * 0.23 + wp.y * 0.31) * 53.0 + sd * 17.0;
  float h = fbm(vec2(uTime * 0.9 + ph, sd * 7.0));                   // 高度起伏（原作 variationH = fbm(时间)）
  // 火苗摇动：基础扇形（4 只呈扇面散开）+ 每只各自的快慢摆动 + 阵风，转角最大 ≈ ±0.8 rad，绕火苗根部转
  float fan = (j - (torch > 0.5 ? 1.5 : 1.0)) * (torch > 0.5 ? 0.17 : 0.3);
  float sw = sin(uTime * (2.3 + sd * 2.6) + sd * 40.0) * 0.32 + (fbm(vec2(uTime * 1.7 + sd * 9.0, 3.0)) - 0.5) * 0.5;
  vRot = fan + sw;
  float sz = (torch > 0.5 ? 0.85 : 1.4) * (0.8 + 0.5 * (h - 0.5)) * (0.8 + 0.35 * fract(sd * 7.31));
  vec3 off = vec3(fract(sd * 3.7) - 0.5, 0.0, fract(sd * 5.3) - 0.5) * (torch > 0.5 ? 0.16 : 0.4);   // 根部散开：火把在头部（顶面 2/16 宽）内错位，火焰在方块内错位
  const float M = 1.7;                                                // 点精灵比火苗框大一圈：转角大时火苗尖不会被方框截掉（与片元里的 M 一致）
  vec4 mv = modelViewMatrix * vec4(wp + off + vec3(0.0, sz * 0.3, 0.0), 1.0);   // 粒子中心 = 火苗框中心；根部在框底边，再下沉 0.2 个火苗长（0.5 − 0.2）插进火把头里
  float want = sz * M * uPx / max(-mv.z, 0.05);
  gl_PointSize = clamp(want, 0.0, 256.0);
  vK = gl_PointSize / max(want, 1e-4);                                // 钳制比例：片元据此还原 sz 单位，否则近处根部会漂离火把
  vH = h; vSeed = sd; vType = aInfo.x;
  gl_Position = (-mv.z > uFar) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}`;

// 火焰片元：火焰着色器的移植（uv 以火苗框为准；_uv.y 自下而上 0..1，先绕根部转 vRot）。
const FLAME_FS = `
precision highp float;
uniform float uTime, uOpacity;
varying float vH, vSeed, vType, vRot, vK;
${GLSL_COMMON}
void main(){
const float M = 1.7;
// 点精灵局部坐标：1 单位 = sz，y 向下（gl_PointCoord 原点在左上）；火苗框 1×1，框中心 = 粒子中心；vK = 点大小被钳制的比例
vec2 q0 = (gl_PointCoord - 0.5) * M * vK;
vec2 piv = vec2(0.0, 0.5);              // 火苗根部 = 框底边中点 = 粒子中心下方半个框高
vec2 p = rotz(-vRot) * (q0 - piv);      // 绕根部转（p 相对根部，y 向下为正）
vec2 rotated = p + piv;                 // 相对粒子中心（光晕用）

// 映射到原着色器期望的 _uv：根部 (0.5, 0)，向上到框顶 1；x 以 0.5 居中，与 y 同尺度
vec2 _uv = vec2(p.x + 0.5, -p.y);
vec2 uv = _uv - 0.5;
vec2 centerUV = rotated;   // 光晕相对粒子中心（火苗框中心），略向下偏置仍有效
  float variationH = vH * 1.1;
  vec2 offset = vec2(0.0, -uTime * 0.6) + vSeed * 13.0;
  float f = fbm(uv * 2.5 + offset);                                      // 湍流转角（原作低频贴图噪声 → 这里放大频率才有起伏）
  float l = max(0.1, length(uv));
  uv += rotz(((f - 0.5) / l) * smoothstep(-0.2, 0.4, _uv.y) * 0.22) * uv;
  float flame = 1.3 - abs(uv.x) * 3.4;                                    // 火焰厚度
  float blueflame = pow(max(flame * 0.9, 0.0), 15.0);                     // 底部蓝焰
  blueflame *= smoothstep(0.2, -1.0, _uv.y);
  blueflame /= max(abs(uv.x * 2.0), 0.02);
  blueflame = clamp(blueflame, 0.0, 1.0);
  flame *= smoothstep(1.0, variationH * 0.5, _uv.y) * step(0.0, _uv.y);
  flame = clamp(flame, 0.0, 1.0);
  flame = pow(flame, 3.0);
  flame /= max(smoothstep(1.1, -0.1, _uv.y), 0.12);
  flame = clamp(flame, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 1.0, 0.6), flame);
  col = mix(vec3(1.0, 0.0, 0.0), col, smoothstep(0.0, 1.6, flame));
  col = mix(col, mix(vec3(0.0, 0.0, 1.0), col, 0.95), blueflame);
  // 光晕：中心偏下的柔和暖光，边缘淡出（点精灵是方的）；多只火苗叠加，每只压低
  float halo = clamp(1.0 - length(centerUV + vec2(0.0, 0.1)) / (0.5 * M), 0.0, 1.0);
  halo *= halo * (0.55 + 0.45 * vH) * 0.5;
  float a = clamp(max(flame, halo * 0.55), 0.0, 1.0);
  if (a < 0.01) discard;
  vec3 c = (col * flame + vec3(0.8, 0.3, 0.12) * halo) * 3.5;            // 显示空间过曝：entComp 的 pow 2.2 会还原成线性高亮
  float o = a * uOpacity;
  gl_FragColor = vec4(c / max(flame + halo, 0.2) * a * o, o);
}`;

// 火焰深度遍片元：只用光晕的覆盖范围做 discard（不跑 fbm，省掉每个火焰像素的第二遍湍流）；颜色遍不写深度，这条遍只写深度。
//   光晕范围覆盖整个火苗（火苗框在 0.85 半径内），与颜色遍 a ≥ 0.01 的区域基本重合。
const FLAME_DEPTH_FS = `
precision highp float;
varying float vH, vSeed, vType, vRot, vK;
${GLSL_COMMON}
void main(){
  const float M = 1.7;
  vec2 q0 = (gl_PointCoord - 0.5) * M * vK;
  vec2 piv = vec2(0.0, 0.5);
  vec2 centerUV = rotz(-vRot) * (q0 - piv) + piv;
  float halo = clamp(1.0 - length(centerUV + vec2(0.0, 0.1)) / (0.5 * M), 0.0, 1.0);
  halo *= halo * (0.55 + 0.45 * vH) * 0.5;
  if (halo * 0.55 < 0.01) discard;
  gl_FragColor = vec4(0.0);
}`;

const SPARK_VS = `
attribute vec4 aSeed;
attribute float aType;          // 0 火把 / 1 火焰 / 2 岩浆
uniform float uTime, uPx, uFar;
varying float vLife, vType;
${GLSL_COMMON}
void main(){
  vec3 p = position; float life = 0.0, sz = 0.04;
  if (aType < 1.5) {          // 上升火星：慢、轻飘、横向摆动
    float per = mix(1.1, 2.2, aSeed.x);
    float age = fract(uTime / per + aSeed.y);
    float sp = 0.5 + aSeed.z * 0.9;
    p += vec3(sin(aSeed.x * 40.0 + age * 6.0) * 0.1 + 0.05 * age, age * sp * (aType < 0.5 ? 1.1 : 1.8), cos(aSeed.w * 40.0 + age * 5.0) * 0.1);
    p.y += aType < 0.5 ? 0.35 : 0.5;
    life = 1.0 - age; sz = (aType < 0.5 ? 0.028 : 0.04) * (0.5 + 0.8 * aSeed.z);
  } else {                    // 岩浆迸溅：抛射体，隔很久才蹦一下
    vec3 v0 = vec3((aSeed.x - 0.5) * 1.6, 1.6 + aSeed.z * 2.6, (aSeed.w - 0.5) * 1.6);
    float tL = 2.0 * v0.y / 9.8, per = 2.0 + aSeed.y * 5.0;
    float t = mod(uTime + aSeed.x * 31.0, per);
    if (t < tL) { p += v0 * t - vec3(0.0, 4.9 * t * t, 0.0); p.y += 0.1; life = 1.0 - t / tL; sz = 0.05 * (0.6 + aSeed.w); }
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = life > 0.0 ? max(sz * uPx / max(-mv.z, 0.05), 1.6) : 0.0;
  vLife = life; vType = aType;
  gl_Position = (life <= 0.0 || -mv.z > uFar) ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
}`;

const SPARK_FS = `
precision highp float;
uniform float uOpacity;
varying float vLife, vType;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, d) * smoothstep(0.0, 0.35, vLife);
  if (a < 0.02) discard;
  vec3 hot = vType > 1.5 ? vec3(1.0, 0.45, 0.1) : vec3(1.0, 0.7, 0.25);
  vec3 c = mix(vec3(0.7, 0.1, 0.02), hot, vLife) * 3.0;                   // 越老越暗红
  float o = a * uOpacity;
  gl_FragColor = vec4(c * o, o);
}`;

// 每类发射点的上限和每点火星数
const CAP = { torch: 64, fire: 32, lava: 200 }, SPARKS = { torch: 5, fire: 10, lava: 2 }, TONGUES = { torch: 4, fire: 3 };   // TONGUES：每个发射点的火苗数（火把聚 4 只在头部）

export function createFireFx(THREE, scene, { source, bt, camera, getF, opacity = () => 1, radius = 40 }) {
  const H = source.height, cls = new Uint8Array(256);     // 1 火把 / 2 岩浆 / 3 火焰
  for (let id = 1; id < 256; id++) { const k = bt.kind[id], e = bt.emissive ? bt.emissive[id] : 0; cls[id] = k === 3 ? 1 : k === 4 && e > 0 ? 2 : k === 2 && e >= 8 ? 3 : 0; }
  const cache = new Map(), key = (cx, cz) => cx + ',' + cz;
  source.onChunkChanged((cx, cz) => cache.delete(key(cx, cz)));
  if (source.onBlockChanged) source.onBlockChanged((x, y, z) => cache.delete(key(x >> 4, z >> 4)));

  // 扫一个区块：[锚点 x, y, z, 类] 平铺（锚点 = 火焰根部世界坐标）。岩浆只收露天表面（上方是空气）并限量
  //   火把锚点：站立火把（meta 0）= 格心、顶面下沿（box 0..10/16）；墙上的火把（meta 1..4）是倾斜的——goodGL emitTorch：底部朝墙偏 6/16、顶部朝墙偏 2/16，
  //   整体抬高 3/16 → 火头 = 朝墙偏 2/16、顶面 13/16 下沿。（gls.js 的 box 版是直立的，偏 6/16 不适用于 goodGL。）没有 meta 的宿主（A）全是站立火把。
  const TDIR = [[1, 0], [-1, 0], [0, 1], [0, -1]];   // meta 1..4 = 朝墙方向（同 HDIRS / torchAttached）
  function scan(cx, cz) {
    const b = source.getBlocks ? source.getBlocks(cx, cz) : (source.getChunk(cx, cz) || {}).blocks;
    if (!b) return null;
    const meta = source.getChunk ? (source.getChunk(cx, cz) || {}).meta : null;
    const out = [], lava = [];
    for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) {
      const base = (lx * 16 + lz) * H;
      for (let y = 0; y < H; y++) {
        const c = cls[b[base + y]]; if (!c) continue;
        const x = cx * 16 + lx, z = cz * 16 + lz;
        if (c === 2) { if (y + 1 >= H || b[base + y + 1] === 0) lava.push(x + 0.5, y + 0.1, z + 0.5, 2); }
        else if (c === 1) {
          const m = meta ? meta[base + y] : 0, d = m >= 1 && m <= 4 ? TDIR[m - 1] : null;
          out.push(x + 0.5 + (d ? d[0] * 0.125 : 0), y + (d ? 0.7875 : 0.6), z + 0.5 + (d ? d[1] * 0.125 : 0), 1);
        } else out.push(x + 0.5, y + 0.1, z + 0.5, 3);
      }
    }
    if (lava.length > 4 * 160) { const st = Math.ceil(lava.length / 4 / 160); for (let i = 0; i < lava.length; i += 4 * st) out.push(lava[i], lava[i + 1], lava[i + 2], 2); }   // 大岩浆湖：每区块最多 ~160 个点
    else out.push(...lava);
    return out;
  }

  const mkGeo = (n, attrs) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    for (const [k, sz] of attrs) g.setAttribute(k, new THREE.BufferAttribute(new Float32Array(n * sz), sz).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0); return g;
  };
  const common = { uTime: { value: 0 }, uPx: { value: 1000 }, uFar: { value: radius + 8 }, uOpacity: { value: 1 } };
  // 两遍画：颜色遍不写深度（火苗之间 / 火把之间 / 火星之间只混合，不互相遮挡；同深度的火苗以前会被 LEQUAL 剔掉，一簇火把只剩最近的一只），
  //   随后各一条 depth-only 遍写深度（方案 A 的 entComp 靠 entRT 的深度判定像素有没有实体，不写深度整片火焰会被丢掉）。
  //   renderOrder 必须是「颜色遍 → 深度遍」且都排在其它透明物之后；深度遍用 LEQUAL，同像素取最近的那只。
  const mat = (vs, fs, color) => new THREE.ShaderMaterial({
    vertexShader: vs, fragmentShader: fs, uniforms: common, transparent: true, depthTest: true,
    depthWrite: !color, colorWrite: color, depthFunc: THREE.LessEqualDepth,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const NF = CAP.torch * TONGUES.torch + CAP.fire * TONGUES.fire, NS = CAP.torch * SPARKS.torch + CAP.fire * SPARKS.fire + CAP.lava * SPARKS.lava;
  const flameGeo = mkGeo(NF, [['aInfo', 3]]), sparkGeo = mkGeo(NS, [['aSeed', 4], ['aType', 1]]);
  const flames = new THREE.Points(flameGeo, mat(FLAME_VS, FLAME_FS, true)), sparks = new THREE.Points(sparkGeo, mat(SPARK_VS, SPARK_FS, true));
  const flameD = new THREE.Points(flameGeo, mat(FLAME_VS, FLAME_DEPTH_FS, false)), sparkD = new THREE.Points(sparkGeo, mat(SPARK_VS, SPARK_FS, false));
  flames.renderOrder = 5; sparks.renderOrder = 5.1; flameD.renderOrder = 5.2; sparkD.renderOrder = 5.3;
  for (const o of [flames, sparks, flameD, sparkD]) { o.frustumCulled = false; scene.add(o); }

  const rnd = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  let acc = 1e9, stats = { torch: 0, fire: 0, lava: 0 }, heatSrc = [];
  function rebuild(cam) {
    const R = radius, cr = Math.ceil(R / 16), ccx = Math.floor(cam.x / 16), ccz = Math.floor(cam.z / 16), R2 = R * R;
    const found = { 1: [], 2: [], 3: [] };
    for (let cx = ccx - cr; cx <= ccx + cr; cx++) for (let cz = ccz - cr; cz <= ccz + cr; cz++) {
      const k = key(cx, cz); let e = cache.get(k);
      if (e === undefined) { e = scan(cx, cz); if (e) cache.set(k, e); }
      if (!e) continue;
      for (let i = 0; i < e.length; i += 4) {
        const dx = e[i] - cam.x, dy = e[i + 1] - cam.y, dz = e[i + 2] - cam.z, d = dx * dx + dz * dz + dy * dy * 0.5;
        if (d <= R2) found[e[i + 3]].push(d, e[i], e[i + 1], e[i + 2]);
      }
    }
    // 每类取最近的 CAP 个
    const pick = (arr, cap) => { const n = arr.length / 4, idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => arr[a * 4] - arr[b * 4]).slice(0, cap); return idx.map(i => [arr[i * 4 + 1], arr[i * 4 + 2], arr[i * 4 + 3]]); };
    const T = pick(found[1], CAP.torch), Fi = pick(found[3], CAP.fire), L = pick(found[2], CAP.lava);
    const fp = flameGeo.attributes.position.array, fi = flameGeo.attributes.aInfo.array;
    let nf = 0;
    for (const [list, type, nt] of [[T, 0, TONGUES.torch], [Fi, 1, TONGUES.fire]]) for (const [x, y, z] of list) for (let j = 0; j < nt; j++) {
      fp[nf * 3] = x; fp[nf * 3 + 1] = y; fp[nf * 3 + 2] = z;
      fi[nf * 3] = type; fi[nf * 3 + 1] = rnd(x * 31 + z + j * 1.7, y + j); fi[nf * 3 + 2] = j; nf++;
    }
    const sp = sparkGeo.attributes.position.array, ss = sparkGeo.attributes.aSeed.array, st = sparkGeo.attributes.aType.array;
    let ns = 0;
    const emit = (list, type, m, dy) => { for (const [x, y, z] of list) for (let j = 0; j < m; j++) {
      const s = x * 131 + y * 17 + z * 7 + j * 3.7;
      sp[ns * 3] = x + (type === 2 ? (rnd(s, 5) - 0.5) * 0.8 : 0); sp[ns * 3 + 1] = y + dy; sp[ns * 3 + 2] = z + (type === 2 ? (rnd(s, 6) - 0.5) * 0.8 : 0);
      ss[ns * 4] = rnd(s, 1); ss[ns * 4 + 1] = rnd(s, 2); ss[ns * 4 + 2] = rnd(s, 3); ss[ns * 4 + 3] = rnd(s, 4); st[ns] = type; ns++;
    } };
    emit(T, 0, SPARKS.torch, 0.05); emit(Fi, 1, SPARKS.fire, 0.2); emit(L, 2, SPARKS.lava, 0.9);
    for (const a of [flameGeo.attributes.position, flameGeo.attributes.aInfo, sparkGeo.attributes.position, sparkGeo.attributes.aSeed, sparkGeo.attributes.aType]) a.needsUpdate = true;
    flameGeo.setDrawRange(0, nf); sparkGeo.setDrawRange(0, ns);
    heatSrc = [];   // 热浪候选：[x, y, z, 世界尺寸]（头部 / 火焰 / 岩浆面）
    for (const [x, y, z] of T.slice(0, 16)) heatSrc.push([x, y + 0.2, z, 0.9]);
    for (const [x, y, z] of Fi.slice(0, 8)) heatSrc.push([x, y + 0.6, z, 1.5]);
    for (const [x, y, z] of L.slice(0, 8)) heatSrc.push([x, y + 0.9, z, 1.8]);
    stats = { torch: T.length, fire: Fi.length, lava: L.length };
  }

  return {
    stats: () => stats,
    // F：当前帧对象（可写）。热浪：把最近的 6 个热源投影成屏幕 uv + 线性深度 + 屏幕尺寸，写进 F.heat0..5（comp 里 heatOff 读）
    update(dt, Fw) {
      if (Fw) {
        const vp = Fw.viewProjU, pr = Fw.proj, cp = Fw.camPos, c = [];
        for (const [x, y, z, sz] of heatSrc) {
          const rx = x - cp[0], ry = y - cp[1], rz = z - cp[2];
          const w = vp[3] * rx + vp[7] * ry + vp[11] * rz + vp[15]; if (w < 0.3 || w > radius) continue;
          const u = (vp[0] * rx + vp[4] * ry + vp[8] * rz + vp[12]) / w * 0.5 + 0.5, v = (vp[1] * rx + vp[5] * ry + vp[9] * rz + vp[13]) / w * 0.5 + 0.5;
          if (u < -0.3 || u > 1.3 || v < -0.3 || v > 1.3) continue;
          c.push([u, v, w, sz * pr[5] / w * 0.5]);
        }
        c.sort((a, b) => a[2] - b[2]);
        for (let i = 0; i < 6; i++) { const e = c[i]; Fw['heat' + i] = e ? [e[0], e[1], e[2], e[3]] : [0, 0, 1, 0]; }
      }
      const F = getF(), op = opacity();
      flames.visible = sparks.visible = flameD.visible = sparkD.visible = !!F && op > 0;
      if (!flames.visible) return;
      common.uTime.value = F.time % 3600; common.uOpacity.value = Math.min(op, 2) * 0.8;
      common.uPx.value = F.h / (2 * Math.tan(camera.fov * Math.PI / 360));
      acc += dt;
      if (acc >= 300) { acc = 0; rebuild(camera.position); }
    },
  };
}
