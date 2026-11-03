// rgl/shaders/water.js —— goodGL waterFS + chunkVS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u, glsl } from '../pass.js';
import { F } from '../frameref.js';
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
    float t = ${() => F.time};
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
  vec2 p = xz * (1.0 / 520.0) + vec2(${() => F.cloudTime} * 0.0045, ${() => F.cloudTime} * 0.0016);
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; }
  return s / 0.9375;
}
float cloudCover(float n){ return clamp((n - (1.0 - ${() => F.cov})) * 2.6, 0.0, 1.0); }

float shadowAt(vec3 wp){
  vec4 sp = ${() => F.shadowMat} * vec4(wp, 1.0);
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
  if (${X.cloudShadowOn} < 0.5 || ${X.lightDir}.y < 0.02) return 1.0;
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
float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * ${() => F.near} * ${() => F.far} / (${() => F.far} + ${() => F.near} - z * (${() => F.far} - ${() => F.near})); }
float wh(vec2 p){
  float t = ${() => F.time}; float h = 0.0;
  h += sin(dot(p, vec2(0.85, 0.52)) * 1.1 + t * 1.4) * 0.1;
  h += sin(dot(p, vec2(-0.6, 0.8)) * 1.7 + t * 1.9) * 0.07;
  h += (vnoise(p * 0.9 + vec2(t * 0.35, t * 0.2)) - 0.5) * 0.26;
  h += (vnoise(p * 2.3 - vec2(t * 0.5, -t * 0.4)) - 0.5) * 0.12;
  h += (vnoise(p * 5.1 + vec2(t * 0.9, t * 0.7)) - 0.5) * 0.05 * (1.0 + ${X.rain} * 3.0);
  return h;
}
void main(){
  o2 = vec4(0.0);
  bool top = (v_flags & 512) != 0;
  bool falling = (v_flags & 2048) != 0;
  vec3 N = v_normal;
  float dist = length(v_rel);
  if (top) {
    vec2 p = v_world.xz; float e = 0.08;
    float h0 = wh(p), hx = wh(p + vec2(e, 0.0)), hz = wh(p + vec2(0.0, e));
    float k = 0.55 * exp(-dist * 0.012);
    vec3 wn = normalize(vec3(-(hx - h0) / e * k, 1.0, -(hz - h0) / e * k));
    N = v_normal.y > 0.0 ? wn : -wn;
  }
  vec3 V = normalize(-v_rel);
  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);
  vec2 suv = gl_FragCoord.xy / ${X.res};
  float fragZ = linZ(gl_FragCoord.z);
  bool underFace = v_normal.y < -0.5;
  vec2 ruv = suv + N.xz * (underFace ? 0.015 : 0.06) / (1.0 + dist * 0.08);
  float sz = linZ(texture(${X.sceneDepth}, ruv).r);
  if (sz < fragZ) { ruv = suv; sz = linZ(texture(${X.sceneDepth}, suv).r); }
  float thick = max(sz - fragZ, 0.0);
  vec3 refr = texture(${X.sceneColor}, ruv).rgb;
  float sky = v_light.x;
  vec3 wcol = pow(v_tint.rgb, vec3(2.2));
  vec3 scatterCol = (${() => F.ambCol} * sky * sky * 0.8 + ${X.lightCol} * 0.12 * max(${X.lightDir}.y, 0.0)) * wcol * 0.35 + ${() => F.torchCol} * pow(lb(v_light.y), 2.0) * 0.05;
  vec3 absorb = exp(-thick * vec3(0.36, 0.10, 0.07) * 1.1);
  bool under = underFace || ${X.camUnder} > 0.5;
  if (under) absorb = vec3(1.0);
  refr = refr * absorb + scatterCol * (1.0 - absorb);
  vec3 R = reflect(-V, N);
  if (R.y < 0.02 && !under) R.y = 0.02;
  vec3 refl = skyBase(normalize(R)) * smoothstep(0.3, 0.9, sky);
  refl += ${() => F.torchCol} * lb(v_light.y) * 0.02;
  vec3 vp = (${() => F.view} * vec4(v_rel, 1.0)).xyz;
  vec3 vr = normalize((${() => F.view} * vec4(R, 0.0)).xyz);
  float hit = 0.0; vec3 hitCol = vec3(0.0);
  if (!under && !falling) {
    float stepL = 0.6 + dist * 0.02; vec3 pp = vp; float jit = ign(gl_FragCoord.xy);
    pp += vr * stepL * jit;
    for (int i = 0; i < 26; i++) {
      pp += vr * stepL; stepL *= 1.16;
      if (pp.z > -${() => F.near}) break;
      vec4 cp = ${() => F.proj} * vec4(pp, 1.0); vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float sd = linZ(texture(${X.sceneDepth}, uv).r);
      float pz = -pp.z;
      if (pz > sd && pz - sd < stepL * 2.5 + 0.5) {
        vec3 a = pp - vr * stepL, b = pp;
        for (int j = 0; j < 5; j++) { vec3 m = (a + b) * 0.5; vec4 mc = ${() => F.proj} * vec4(m, 1.0); vec2 mu = mc.xy / mc.w * 0.5 + 0.5; float md = linZ(texture(${X.sceneDepth}, mu).r); if (-m.z > md) b = m; else a = m; }
        vec4 hc = ${() => F.proj} * vec4(b, 1.0); vec2 huv = hc.xy / hc.w * 0.5 + 0.5;
        if (texture(${X.sceneDepth}, huv).r < 0.99999) { vec2 ed = smoothstep(0.0, 0.12, huv) * smoothstep(1.0, 0.88, huv); hit = ed.x * ed.y; hitCol = texture(${X.sceneColor}, huv).rgb; }
        break;
      }
    }
  }
  refl = mix(refl, hitCol, hit);
  float sh = 1.0;
  if (${X.shadowOn} > 0.5 && dist < ${() => F.shadowDist}) sh = shadowAt(v_rel + ${() => F.camToShadow} + vec3(0.0, 0.05, 0.0));
  sh *= smoothstep(0.5, 0.9, sky) * cloudShadow(v_world);
  vec3 H = normalize(${X.lightDir} + V);
  float NdotH = max(dot(N, H), 0.0);
  float rough = 0.06 + ${X.rain} * 0.1; float a2 = rough * rough; float dd = NdotH * NdotH * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159 * dd * dd);
  vec3 spec = ${X.lightCol} * D * F * 0.9 * sh * max(dot(N, ${X.lightDir}), 0.0);
  vec3 col;
  if (under) { float Fu = smoothstep(0.35, 0.05, NdotV); col = mix(refr * vec3(0.55, 0.8, 0.95), scatterCol * 1.2, Fu); }
  else col = mix(refr, refl, F) + min(spec, vec3(40.0));
  if (top && !under && !falling) {
    float fn = vnoise(v_world.xz * 2.4 + vec2(${() => F.time} * 0.25, -${() => F.time} * 0.18)) * 0.6 + vnoise(v_world.xz * 6.0 - ${() => F.time} * 0.4) * 0.4;
    float edge = 1.0 - smoothstep(0.0, 0.7, thick * NdotV + thick * 0.15);
    float foam = smoothstep(0.45, 0.8, fn + edge * 0.55 - 0.2) * edge;
    vec3 fc = ${() => F.ambCol} * sky * 1.1 + ${X.lightCol} * 0.28 * max(${X.lightDir}.y, 0.0) * sh;
    col = mix(col, fc, foam * 0.5);
  }
  if (falling && !top) { // waterfall foam streaks
    float s = vnoise(vec2(v_world.x * 3.0 + v_world.z * 3.0, v_world.y * 1.2 + ${() => F.time} * 6.0));
    float foam = smoothstep(0.35, 0.8, s);
    vec3 fc = (${() => F.ambCol} * sky * 1.3 + ${X.lightCol} * 0.35 * max(${X.lightDir}.y, 0.0)) * vec3(0.9, 0.95, 1.0);
    col = mix(mix(refr, refl, 0.3), fc, 0.35 + foam * 0.5);
  }
  o = vec4(col, 1.0);
}`;
