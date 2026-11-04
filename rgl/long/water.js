// rgl/shaders/water.js —— goodGL waterFS + chunkVS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { glsl, Fps } from '../pass.js';
import { NOISE, CAUSTIC, SHORE } from '../../water/glsl.js';
import { RIP } from '../ripple.js';
const lib = x => glsl([x]);
export const water = (Pass, X = {}) => Pass({ tag: 'water', vs: glsl`#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_uvl;
layout(location=2) in vec4 a_light;
layout(location=3) in vec4 a_tint;
out vec3 v_uv; out vec4 v_tint; out vec3 v_light; out vec3 v_rel; out vec3 v_normal; out vec3 v_world;
flat out int v_flags;
const vec3 NRM[7] = vec3[7](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1),vec3(0,1,0));
void main(){
  int flags = int(a_uvl.w + 0.5);
  vec3 p = a_pos;
  vec3 wp = p + ${X.origin};
  float wave = floor(a_tint.a*255.0+0.5);
  if (wave > 0.5 && ${X.wind} > 0.0) {
    float t = ${Fps.time};
    vec3 off = vec3(sin(t*1.6 + wp.x*0.55 + wp.z*0.3 + wp.y*0.4), 0.0, cos(t*1.25 + wp.z*0.6 + wp.x*0.25));
    off += 0.45*vec3(sin(t*3.3 + wp.x*1.7 + wp.y), 0.0, sin(t*2.9 + wp.z*1.9));
    float amp = wave < 1.5 ? 0.03 : 0.085;
    if (wave < 1.5) off.y = sin(t*2.1 + wp.x + wp.z) * 0.5;
    p += off * amp * ${X.wind};
  }
  vec3 rel = p + ${X.offset};
  v_rel = rel; v_world = p + ${X.origin};
  gl_Position = ${X.viewProj} * vec4(rel, 1.0);
  v_uv = vec3(a_uvl.xy / 256.0, a_uvl.z);
  v_tint = a_tint; v_light = a_light.xyz;
  v_normal = NRM[int(a_light.w * 255.0 + 0.5)];
  v_flags = flags;
}` })`#version 300 es

precision highp float;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp usampler2D;
#define SHADOW_ON ${X.shadowM}
#define PBR_ON ${X.pbrM}
#define POM_ON ${X.pomM}
#define CLOUDSH_ON ${X.cloudShM}
#define UNDER_ON ${X.underM}
#define RIP_N ${() => RIP.N}
#define RIP_T ${() => RIP.T}





float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }


const float CB = 185.0, CT = 262.0;
float cloudMap(vec2 xz){
  vec2 p = xz * (1.0 / 520.0) + vec2(${Fps.cloudTime} * 0.0045, ${Fps.cloudTime} * 0.0016);
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; }
  return s / 0.9375;
}
float cloudCover(float n){ return clamp((n - (1.0 - ${Fps.cov})) * 2.6, 0.0, 1.0); }

float shadowAt(vec3 wp){
  vec4 sp = ${Fps.shadowMat} * vec4(wp, 1.0);
  float df = length(sp.xy) * 0.9 + 0.1;
  sp.xy /= df;
  vec3 c = sp.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float a = ign(gl_FragCoord.xy) * 6.2831; mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  float uvPerBlock = 1.0 / (2.0 * ${X.shadowRange}) / df;
  // blocker search
  float sr = 0.45 * uvPerBlock; float zb = 0.0, nb = 0.0;
  for (int i = 0; i < 5; i++) { float fi = float(i); vec2 o2 = R * vec2(cos(fi * 2.4), sin(fi * 2.4)) * sqrt((fi + 0.5) / 5.0) * sr;
    float z = texture(${X.shadowRaw}, c.xy + o2).r; if (z < c.z - 0.00002) { zb += z; nb += 1.0; } }
  if (nb < 0.5) return 1.0;
  zb /= nb;
  float pen = clamp((c.z - zb) * 640.0 * 0.018, 0.02, 0.55) * uvPerBlock;
  pen = max(pen, 0.8 / ${X.shadowRes});
  float s = 0.0;
  for (int i = 0; i < 8; i++) { float fi = float(i); vec2 o2 = R * vec2(cos(fi * 2.4), sin(fi * 2.4)) * sqrt((fi + 0.5) / 8.0) * pen;
    s += texture(${X.shadow}, vec3(c.xy + o2, c.z)); }
  return s / 8.0;
}
float cloudShadow(vec3 wp){
  if (CLOUDSH_ON == 0 || ${X.lightDir}.y < 0.02) return 1.0;
  vec2 q = wp.xz + ${X.lightDir}.xz * ((CB + 25.0 - wp.y) / max(${X.lightDir}.y, 0.08));
  return 1.0 - 0.78 * cloudCover(cloudMap(q));
}
float caustic(vec2 p, float t){
  vec2 q = p * 0.9;
  float c = 0.0;
  for (int i = 0; i < 2; i++) {
    vec2 w = q + vec2(vnoise(q * 0.8 + t * 0.35), vnoise(q * 0.8 - t * 0.3 + 5.0)) * 1.8;
    float n = vnoise(w * 1.6 + float(i) * 7.0);
    c += pow(1.0 - abs(n * 2.0 - 1.0), 7.0);
    q *= 1.7;
  }
  return c;
}
float lb(float l){ float f = 1.0 - l; return (1.0 - f) / (f * 3.0 + 1.0); }



vec2 skyUV(vec3 d){ float el = asin(clamp(d.y, -1.0, 1.0)); float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963); return vec2(atan(d.z, d.x) / 6.2831853 + 0.5, v); }
vec3 skyBase(vec3 d){ vec3 c = texture(${X.skyLut}, skyUV(d)).rgb; float l = dot(c, vec3(0.3, 0.55, 0.15)); c = mix(c, vec3(l), ${X.rain} * 0.75) * (1.0 - ${X.rain} * 0.35); return c + vec3(0.55, 0.6, 0.8) * ${X.flash} * 0.6; }
in vec3 v_uv; in vec4 v_tint; in vec3 v_light; in vec3 v_rel; in vec3 v_normal; in vec3 v_world;
flat in int v_flags;
layout(location=0) out vec4 o; layout(location=1) out vec4 o2;
float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * ${Fps.near} * ${Fps.far} / (${Fps.far} + ${Fps.near} - z * (${Fps.far} - ${Fps.near})); }
// ---- 水面光学：LiqPG（goodLiqPG/src/render/shaders/water.js）的波高场 / 折射 / 吸收 / SSR / GGX，goal-remix/water.md §0–§3
float hash22x(vec2 p){ return hash12(p + 17.3); }
vec2 hash22(vec2 p){ return vec2(hash12(p), hash12(p + 41.7)); }
float waveH(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2(0.82, 0.57)) * 1.35 + t * 1.9) * 0.22;
  h += sin(dot(p, vec2(-0.43, 0.90)) * 2.10 + t * 2.4) * 0.14;
  h += sin(dot(p, vec2(0.97, -0.24)) * 3.30 + t * 3.1) * 0.08;
  h += (vnoise(p * 1.7 + vec2(t * 0.6, t * 0.35)) - 0.5) * 0.30;
  h += (vnoise(p * 4.1 - vec2(t * 0.9, -t * 0.5)) - 0.5) * 0.12;
  h += (vnoise(p * 9.0 + vec2(t * 1.3, t * 1.1)) - 0.5) * 0.05;
  return h;
}
vec3 waveNormal(vec2 p, float t, float strength){
  float e = 0.05, h0 = waveH(p, t), hx = waveH(p + vec2(e, 0.0), t), hz = waveH(p + vec2(0.0, e), t);
  return normalize(vec3(-(hx - h0) / e * strength, 1.0, -(hz - h0) / e * strength));
}
${lib(NOISE + CAUSTIC + SHORE)}
float D_GGX(float NdotH, float a){ float a2 = a*a; float d = NdotH*NdotH*(a2-1.0)+1.0; return a2 / (3.14159 * d*d + 1e-6); }
float V_Smith(float NdotV, float NdotL, float a){ float k = a*0.5; return 0.25 / ((NdotV*(1.0-k)+k) * (NdotL*(1.0-k)+k) + 1e-5); }
// 屏幕空间反射（视空间步进；LiqPG：首步 0.6、×1.22、IGN 抖动、二分 5 次、边缘淡出 0.08）；${X.sceneDepth} 里没有云和体积光
vec3 ssr(vec3 vp, vec3 vr, float jit, out float hit){
  hit = 0.0; float stepL = 0.6; vec3 pp = vp;
  for (int i = 0; i < int(${Fps.ssrSteps}); i++) {
    pp += vr * stepL * (1.0 + jit * 0.5); stepL *= 1.22;
    if (pp.z > -${Fps.near}) break;
    vec4 cp = ${Fps.proj} * vec4(pp, 1.0); vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float d0 = texture(${X.sceneDepth}, uv).r, sd = linZ(d0), pz = -pp.z;
    if (pz > sd && pz - sd < stepL * 2.5 + 0.5 && d0 < 0.99999) {
      vec3 a = pp - vr * stepL, b = pp;
      for (int j = 0; j < 5; j++) { vec3 m = (a + b) * 0.5; vec4 mc = ${Fps.proj} * vec4(m, 1.0); vec2 mu = mc.xy / mc.w * 0.5 + 0.5; if (-m.z > linZ(texture(${X.sceneDepth}, mu).r)) b = m; else a = m; }
      vec4 hc = ${Fps.proj} * vec4(b, 1.0); vec2 huv = hc.xy / hc.w * 0.5 + 0.5;
      vec2 ed = smoothstep(vec2(0.0), vec2(0.08), huv) * smoothstep(vec2(1.0), vec2(0.92), huv); hit = ed.x * ed.y;
      return texture(${X.sceneColor}, huv).rgb;
    }
  }
  return vec3(0.0);
}
void main(){
  o2 = vec4(0.0);
  bool top = (v_flags & 512) != 0;
  bool falling = (v_flags & 2048) != 0;
  bool underFace = v_normal.y < -0.5;
  bool fromBelow = underFace || UNDER_ON > 0;
  float t = ${Fps.time};
  vec3 N = v_normal;
  float dist = length(v_rel);
  float sky = v_light.x;
  float sd = 9.0, sh0 = 0.0, sg = 0.0; vec2 sdir = vec2(0.0);                 // 岸边波纹（v2/gl 版：到岸距离 + 离岸方向 → 涌浪起伏 sh0 与沿离岸方向的斜率 sg）
  bool shore = top && !fromBelow && dist < 96.0 && ${Fps.foamWidth} > 0.0 && ${Fps.shoreAmp} > 0.0;
  if (shore) {
    sd = shoreDist(${X.shoreFld}, ${X.shoreN}, vec3(v_world.x, v_world.y - 0.15, v_world.z), min(${Fps.foamWidth}, 2.0), sdir);
    sh0 = shoreH(${X.wnoise}, v_world.xz, sd, ${Fps.foamWidth}, ${Fps.shoreSpd}, t);
    sg = (shoreH(${X.wnoise}, v_world.xz, sd + 0.05, ${Fps.foamWidth}, ${Fps.shoreSpd}, t) - shoreH(${X.wnoise}, v_world.xz, max(sd - 0.05, 0.0), ${Fps.foamWidth}, ${Fps.shoreSpd}, t)) / 0.1;
  }
  if (top || underFace) {                                                   // 波法线：上下表面共用同一个波高场，水下看到的全反射边缘才会跟着起伏
    float strength = mix(0.25, 0.55, ${X.rain}) * (fromBelow ? 0.6 : 1.0);
    vec3 wn = waveNormal(v_world.xz, t, strength);
    wn = normalize(mix(wn, vec3(0.0, 1.0, 0.0), smoothstep(30.0, 140.0, dist) * 0.7));
    if (${Fps.ripple} > 0.0) {                                                // 玩家 / 入水波纹：Eulerian 高度场的梯度（rgl/ripple.js）；相机 ±22–31 格淡出（窗口 64 格）
      vec2 ru = v_world.xz * (float(RIP_T) / float(RIP_N)); float re = 1.0 / float(RIP_N);
      float rx = texture(${X.rip}, ru + vec2(re, 0.0)).r - texture(${X.rip}, ru - vec2(re, 0.0)).r;
      float rz = texture(${X.rip}, ru + vec2(0.0, re)).r - texture(${X.rip}, ru - vec2(0.0, re)).r;
      float rfade = 1.0 - smoothstep(22.0, 31.0, length(v_world.xz - ${Fps.camPos}.xz));
      wn = normalize(wn + vec3(-rx, 0.0, -rz) * (float(RIP_T) * 0.5) * 1.5 * ${Fps.ripple} * rfade);
    }
    if (${X.wet} > 0.0) {                                                    // 雨涟漪
      vec2 cell = floor(v_world.xz * 2.0), f = fract(v_world.xz * 2.0) - 0.5;
      float ph = fract(t * 0.9 + hash12(cell)), r = length(f - (hash22(cell) - 0.5) * 0.4);
      float ring = sin((r - ph * 0.6) * 40.0) * smoothstep(0.0, 0.1, ph) * (1.0 - ph) * smoothstep(0.35, 0.0, r);
      wn = normalize(wn + vec3(f.x, 0.0, f.y) * ring * 0.8 * ${X.wet} * smoothstep(0.8, 1.0, sky));
    }
    if (shore) wn = normalize(wn - vec3(sdir.x, 0.0, sdir.y) * sg * ${Fps.shoreAmp} * 1.5);
    N = fromBelow ? -wn : wn;
  }
  vec3 V = normalize(-v_rel);
  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float Fr = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  vec2 suv = gl_FragCoord.xy / ${X.res};
  float fragZ = linZ(gl_FragCoord.z);
  float sd0 = texture(${X.sceneDepth}, suv).r;
  vec2 ruv = suv + N.xz * 0.06 / max(1.0, fragZ * 0.15) * (top ? 1.0 : 0.3);
  float rD = texture(${X.sceneDepth}, ruv).r;
  if (linZ(rD) < fragZ) { ruv = suv; rD = sd0; }
  float thick = max(linZ(rD) - fragZ, 0.0); if (rD >= 0.99999) thick = 60.0;
  vec3 behind = texture(${X.sceneColor}, ruv).rgb;
  vec3 behind0 = behind;
  vec3 wcol = pow(v_tint.rgb, vec3(2.2)) * vec3(0.55, 0.85, 1.0);
  float sh = 1.0;
  if (SHADOW_ON > 0 && dist < ${Fps.shadowDist}) sh = shadowAt(v_rel + ${Fps.camToShadow} + vec3(0.0, 0.05, 0.0)); else sh = smoothstep(0.8, 1.0, sky);
  sh *= cloudShadow(v_world);
  vec3 scatterLight = (${X.lightCol} * max(${X.lightDir}.y, 0.0) * 0.6 * sh + ${Fps.ambCol} * 0.9) * sky * sky + ${Fps.torchCol} * pow(lb(v_light.y), 2.0) * 0.3;
  vec3 inscatter = wcol * scatterLight * 0.18;
  vec3 col;
  if (fromBelow) {
    // 水下仰视：Snell 窗口 + 全反射。k < 0 即全反射（物理临界角 48.75°），边缘随波法线起伏；折射向量为零时不再 normalize（LiqPG 的 NaN 与黑圈）
    vec3 I = -V; float c = dot(-N, V);
    float k = 1.0 - 1.33 * 1.33 * (1.0 - c * c);
    float win = smoothstep(0.0, 0.05, k);
    vec3 abv = vec3(0.0);
    if (win > 0.0) {
      vec3 rf = refract(I, N, 1.33); vec2 auv = suv + N.xz * 0.04; float ad = texture(${X.sceneDepth}, auv).r;
      abv = ad >= 0.99999 ? skyBase(normalize(rf)) : texture(${X.sceneColor}, auv).rgb;
      abv *= 1.97;                                                            // 进入水体辐亮度 × n²：水下仰视的窗口应当比周围水体亮得多
      if (ad >= 0.99999) abv += ${Fps.sunCol} * smoothstep(0.99985, 0.99997, dot(normalize(rf), ${Fps.sunDir})) * 16.0 * (1.0 - ${X.rain}) * float(${Fps.useSun});
    }
    vec3 rd = reflect(I, N), deep = scatterLight * wcol * 0.6;
    float hit = 0.0; vec3 tr = vec3(0.0);
    if (win < 1.0 && ${Fps.camDepth} > ${Fps.uwWindow}) { vec3 vp = (${Fps.view} * vec4(v_rel, 1.0)).xyz, vr = normalize((${Fps.view} * vec4(rd, 0.0)).xyz); tr = ssr(vp, vr, ign(gl_FragCoord.xy), hit); }
    col = mix(mix(deep, tr, hit), abv, win);
    // 离水面近（桶、瀑布、浅池）时窗口只有 ~2 格宽，抬头会被全反射的暗色遮满：深度不够就不用 Snell 窗口，按带扭曲的透视直接看水面上方的场景；足够深（uwWindowDepth 起渐变到 +3 格）才切到窗口 + 全反射
    float deepK = smoothstep(${Fps.uwWindow}, ${Fps.uwWindow} + 3.0, ${Fps.camDepth});
    if (deepK < 1.0) col = mix(texture(${X.sceneColor}, suv + N.xz * 0.05).rgb * 1.97, col, deepK);
  } else {
    if (rD < 0.99999 && top) {                                                // 池底花纹：v2/gl 的版本（shade.js:293）：图样直接落在透过水面看到的点上，× 太阳高度 × 水面天空光 × exp(−水中路径·0.12)
      vec4 fw = ${Fps.invViewProj} * vec4(ruv * 2.0 - 1.0, rD * 2.0 - 1.0, 1.0);
      behind *= 1.0 + causticSeen(${X.wnoise}, ${Fps.camPos} + fw.xyz / fw.w, thick, t) * ${Fps.uwCaustic} * smoothstep(-0.05, 0.12, ${Fps.sunDir}.y) * sky;
    }
    vec3 T = exp(-vec3(0.45, 0.075, 0.035) * 1.2 * thick);
    vec3 refr = behind * T + inscatter * (1.0 - T);
    vec3 R = reflect(-V, N);
    if (R.y < 0.0 && top) R.y = -R.y * 0.3;
    float skyOcc = smoothstep(0.5, 1.0, sky);
    vec3 refl = skyBase(normalize(vec3(R.x, max(R.y, 0.0), R.z))) * skyOcc + ${Fps.torchCol} * lb(v_light.y) * 0.02;
    float hit = 0.0;
    if (!falling) { vec3 vp = (${Fps.view} * vec4(v_rel + N * 0.05, 1.0)).xyz, vr = normalize((${Fps.view} * vec4(R, 0.0)).xyz); vec3 sc = ssr(vp, vr, ign(gl_FragCoord.xy), hit); refl = mix(refl, sc, hit); }
    vec3 L = ${X.lightDir}, H = normalize(L + V);
    float NdotH = max(dot(N, H), 0.0), NdotL = max(dot(N, L), 0.0);
    vec3 sun = ${X.lightCol} * D_GGX(NdotH, 0.012) * V_Smith(NdotV, NdotL, 0.012) * NdotL * (0.02 + 0.98 * pow(1.0 - max(dot(H, V), 0.0), 5.0)) * sh;
    col = mix(refr, refl, Fr) + min(sun, vec3(60.0));
    if (shore) {                                                              // 浪峰略亮（水体增厚）+ 岸边软化（边缘随涌浪进退），v2/gl shade.js:370–371
      col += scatterLight * wcol * sh0 * 0.25 * (1.0 - smoothstep(0.0, 1.0, sd));
      float vd = thick * max(V.y, 0.15);
      if (${Fps.shoreFade} > 0.0) col = mix(behind0, col, smoothstep(0.0, ${Fps.shoreFade}, vd + sh0 * ${Fps.shoreAmp} * 2.0));
    }
    if (falling && !top) {
      float s = vnoise(vec2(v_world.x * 3.0 + v_world.z * 3.0, v_world.y * 1.2 + t * 6.0)), foam = smoothstep(0.35, 0.8, s);
      vec3 fc = (${Fps.ambCol} * sky * 1.3 + ${X.lightCol} * 0.35 * max(${X.lightDir}.y, 0.0)) * vec3(0.9, 0.95, 1.0);
      col = mix(mix(refr, refl, 0.3), fc, 0.35 + foam * 0.5);
    }
  }
  o = vec4(col, 1.0);
}`;
