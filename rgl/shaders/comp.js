// rgl/shaders/comp.js —— goodGL compositeFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u, glsl } from '../pass.js';
import { NOISE, CAUSTIC, MEDIUM } from '../../water/glsl.js';
const lib = x => glsl([x]);
import { F } from '../frameref.js';
export const comp = (Pass, X = {}) => Pass({ tag: 'comp' })`#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec2 v_uv; out vec4 o;








float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

vec2 skyUV(vec3 d){ float el = asin(clamp(d.y, -1.0, 1.0)); float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963); return vec2(atan(d.z, d.x) / 6.2831853 + 0.5, v); }
vec3 skyBase(vec3 d){
  vec3 c = texture(${X.skyLut}, skyUV(d)).rgb;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.0), ${u('rain', () => F.rain || 0)} * 0.75) * (1.0 - ${u('rain', () => F.rain || 0)} * 0.35);
  return c + vec3(0.55, 0.6, 0.8) * ${u('flash', () => F.flash || 0)} * 0.6;
}
vec3 skyHorizon(vec3 d){ return skyBase(normalize(vec3(d.x, max(d.y, 0.0), d.z))); }

const float CB = 185.0;
float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * ${() => F.near} * ${() => F.far} / (${() => F.far} + ${() => F.near} - z * (${() => F.far} - ${() => F.near})); }
vec3 octDec(vec2 e){ e = e * 2.0 - 1.0; vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y)); if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0); return normalize(v); }
float shadowRaw(vec3 wp){
  vec4 sp = ${() => F.shadowMat} * vec4(wp, 1.0);
  float df = length(sp.xy) * 0.9 + 0.1; sp.xy /= df;
  vec3 c = sp.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  return texture(${X.cShadow}, c);
}
${lib(NOISE + CAUSTIC + MEDIUM)}
void main(){
  vec3 col = texture(${X.cColor}, v_uv).rgb;
  float d = texture(${X.cDepth}, v_uv).r;
  vec4 w = ${() => F.invViewProj} * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 rel = w.xyz / w.w;
  bool isSky = d >= 0.999999;
  vec3 dir = normalize(rel);
  float dist = isSky ? 2000.0 : length(rel);
  float mu = dot(dir, ${() => F.lightDir});
  float sunUp = smoothstep(-0.1, 0.05, ${() => F.sunDir}.y);
  float g = 0.72; float mie = (1.0 - g*g) / (4.0 * 3.14159 * pow(1.0 + g*g - 2.0*g*mu, 1.5));
  float iso = 1.0 / (4.0 * 3.14159);
  // screen-space reflections on smooth / wet opaque surfaces
  vec4 gb = texture(${X.cGbuf}, v_uv);
  if (${u('ssrOn', () => F.pbr === false ? 0 : 1)} > 0.5 && !isSky && gb.a > 0.004 && ${u('camUnder', () => F.underwater ? 1 : 0)} < 0.5) {
    vec3 N = octDec(gb.xy); float rough = gb.z;
    vec3 jr = vec3(ign(gl_FragCoord.xy), ign(gl_FragCoord.yx + 17.0), ign(gl_FragCoord.xy * 1.7 + 5.0)) - 0.5;
    vec3 R = normalize(reflect(dir, N) + jr * rough * 0.9);
    if (dot(R, N) < 0.0) R = reflect(R, N);
    vec3 vp = (${() => F.view} * vec4(rel, 1.0)).xyz; vec3 vr = normalize((${() => F.view} * vec4(R, 0.0)).xyz);
    float stepL = 0.35 + dist * 0.02; vec3 pp = vp + vr * stepL * ign(gl_FragCoord.xy + 3.3) + (${() => F.view} * vec4(N, 0.0)).xyz * 0.02;
    float hit = 0.0; vec3 hc = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      pp += vr * stepL; stepL *= 1.14;
      if (pp.z > -${() => F.near}) break;
      vec4 cp = ${() => F.proj} * vec4(pp, 1.0); vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float sd = linZ(texture(${X.cDepth}, uv).r); float pz = -pp.z;
      if (pz > sd && pz - sd < stepL * 2.0 + 0.4) {
        vec3 a = pp - vr * stepL, b = pp;
        for (int j = 0; j < 5; j++) { vec3 m = (a + b) * 0.5; vec4 mc = ${() => F.proj} * vec4(m, 1.0); vec2 mu = mc.xy / mc.w * 0.5 + 0.5; if (-m.z > linZ(texture(${X.cDepth}, mu).r)) b = m; else a = m; }
        vec4 hcp = ${() => F.proj} * vec4(b, 1.0); vec2 huv = hcp.xy / hcp.w * 0.5 + 0.5;
        if (texture(${X.cDepth}, huv).r < 0.999999) { vec2 ed = smoothstep(0.0, 0.1, huv) * smoothstep(1.0, 0.9, huv); hit = ed.x * ed.y; hc = texture(${X.cColor}, huv).rgb; }
        break;
      }
    }
    if (hit > 0.0) { vec3 envC = skyHorizon(R); col = max(col + (hc - envC) * gb.a * hit, vec3(0.0)); }
  }
  // clouds (behind terrain only when terrain is farther than the cloud base)
  if (${u('cloudsOn', () => F.clouds ? 1 : 0)} > 0.5 && ${u('camUnder', () => F.underwater ? 1 : 0)} < 0.5) {
    float tc = dir.y > 0.0 ? (CB - ${() => F.camPos}.y) / dir.y : -1.0;
    if (isSky || (tc > 0.0 && dist > tc)) { vec4 cl = texture(${X.cClouds}, v_uv); col = col * cl.a + cl.rgb; }
  }
  if (${u('camUnder', () => F.underwater ? 1 : 0)} > 0.5) {
    // 水下：焦散（v2/gl 图样，沿折射阳光方向投影，水深起点 = Env.eyeWaterTop）+ 介质（吸收 / 内散射 / 光束，LiqPG post.js:229；光束图样 = 焦散图样沿阳光方向拉出的体积）
    float wTop = ${() => F.waterTop}, dayF = smoothstep(-0.05, 0.12, ${() => F.sunDir}.y);
    vec3 Ls = waterLs(${() => F.sunDir}, 0.0);
    float shV = ${u('shadowOn', () => 1)} > 0.5 ? shadowRaw(rel + ${() => F.camToShadow} + vec3(0.0, 0.05, 0.0)) : 1.0;
    if (!isSky) {
      vec3 pw = ${() => F.camPos} + rel; float dz = wTop - pw.y;
      if (dz > 0.12 && dz < 14.0) col *= 1.0 + causticAt(${X.wnoise}, pw, dz, Ls, ${() => F.time}) * ${() => F.uwCaustic} * dayF * shV;
    }
    vec3 sigS = (${() => F.waterCol} * 0.05 + 0.012) * ${() => F.uwDensity}, sigE = (vec3(0.25, 0.06, 0.04) * ${() => F.uwDensity} + sigS);
    float maxD = min(dist, 64.0), dt = maxD / 12.0, jit = ign(gl_FragCoord.xy + fract(${() => F.time} * 7.0) * 13.0);
    float ph = waterPhase(dot(dir, ${() => F.lightDir}));
    vec3 Tm = vec3(1.0), Sm = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float t = (float(i) + jit) * dt; vec3 p = dir * t; vec3 pw = ${() => F.camPos} + p;
      float dep = max(wTop - pw.y, 0.0);
      vec3 att = exp(-vec3(0.25, 0.06, 0.04) * ${() => F.uwDensity} * dep);
      float vis = ${u('shadowOn', () => 1)} > 0.5 && ${u('volOn', () => F.volumetric ? 1 : 0)} > 0.5 ? shadowRaw(p + ${() => F.camToShadow}) : 1.0;
      float mod_ = 0.45 + 1.1 * causticAt(${X.wnoise}, pw, dep, Ls, ${() => F.time});
      vec3 Lm = ${() => F.lightCol} * ph * vis * mix(1.0, mod_, min(${() => F.uwShafts}, 1.0)) * ${() => F.uwShafts} * att * (1.0 - ${() => F.caveFactor}) + ${() => F.ambCol} * 0.08 * att;
      vec3 Ts = exp(-sigE * dt);
      Sm += Tm * Lm * sigS * (1.0 - Ts) / max(sigE, vec3(1e-6)); Tm *= Ts;
    }
    col = col * Tm + Sm;
  } else {
    if (!isSky) {
      vec3 fogC = skyHorizon(dir); float fl = dot(fogC, vec3(0.3, 0.55, 0.15)); float flim = dot(${() => F.ambCol}, vec3(0.3, 0.55, 0.15)) * 2.2 + 0.02; fogC *= min(1.0, flim / max(fl, 1e-4));
      float hf = exp(-max(${() => F.camPos}.y + rel.y * 0.5 - 62.0, 0.0) / 90.0);
      float fa = 1.0 - exp(-dist * ${() => F.fogDensity} * (0.35 + 0.65 * hf));
      float border = smoothstep(${() => F.renderDist} * 0.72, ${() => F.renderDist} * 0.98, length(rel.xz));
      col = mix(col, fogC, clamp(max(fa * (1.0 - ${() => F.caveFactor}), border), 0.0, 1.0));
    }
    float H = 7.0; float h0 = 62.0;
    float D0 = ${() => F.mist} * 0.022;
    float cy = ${() => F.camPos}.y - h0;
    float L = min(dist, isSky ? 300.0 : 600.0);
    float dy = dir.y * L;
    float integ;
    if (abs(dy) < 0.01) integ = D0 * exp(-cy / H) * L;
    else integ = D0 * H * exp(-cy / H) * (1.0 - exp(-dy / H)) * L / dy;
    integ = min(integ, 20.0);
    float tr = exp(-integ);
    vec3 mistCol = ${() => F.ambCol} * 0.8 + ${() => F.lightCol} * (min(mie, 0.25) * 1.2 + iso * 0.9) * sunUp * 0.8;
    col = col * tr + mistCol * (1.0 - tr) * (1.0 - ${() => F.caveFactor} * 0.9);
    if (${u('volOn', () => F.volumetric ? 1 : 0)} > 0.5 && ${u('shadowOn', () => 1)} > 0.5 && ${() => F.lightDir}.y > 0.0) {
      float maxL = min(dist, 110.0);
      const int NS = 14;
      float stepL = maxL / float(NS);
      float jit = ign(gl_FragCoord.xy + fract(${() => F.time} * 7.0) * 13.0);
      float acc = 0.0;
      for (int i = 0; i < NS; i++) {
        float t = (float(i) + jit) * stepL;
        vec3 p = dir * t;
        float y = ${() => F.camPos}.y + p.y;
        float dens = 0.1 + 1.5 * exp(-max(y - h0, 0.0) / 12.0) * (0.3 + ${() => F.mist});
        acc += shadowRaw(p + ${() => F.camToShadow}) * dens * stepL;
      }
      col += ${() => F.lightCol} * acc * (mie * 0.9 + iso * 0.2) * 0.011 * (1.0 - ${() => F.caveFactor}) * (1.0 + ${u('rain', () => F.rain || 0)});
    }
    if (${() => F.sunVis} > 0.0) {
      vec2 dv = (${() => F.sunUV} - v_uv); float len = length(dv);
      const int NR = 24; vec2 st = dv / float(NR);
      vec2 p = v_uv + st * ign(gl_FragCoord.xy);
      float acc = 0.0; float wsum = 0.0;
      for (int i = 0; i < NR; i++) {
        float dd = texture(${X.cDepth}, p).r; float wgt = 1.0 - float(i) / float(NR);
        float occ = dd >= 0.999999 ? texture(${X.cClouds}, p).a : 0.0;
        acc += occ * wgt; wsum += wgt; p += st;
      }
      float rays = acc / wsum;
      col += ${() => F.sunCol} * rays * exp(-len * 2.6) * ${() => F.sunVis} * 0.14 * (1.0 - ${() => F.caveFactor});
    }
  }
  col += vec3(0.5, 0.55, 0.7) * ${u('flash', () => F.flash || 0)} * 0.08;
  o = vec4(col, 1.0);
}`;
