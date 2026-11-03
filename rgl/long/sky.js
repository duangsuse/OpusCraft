// rgl/long/sky.js —— 天空：大气查找表、天空球（日、月、星）、体积云（1/3 分辨率）。由 shaders/{skylut,skyf}.js 合并，GLSL 一字未改。
import { Fps } from '../pass.js';

// ======== skylut.js ========
// rgl/shaders/skylut.js —— sky-view LUT（goodGL skyLutFS，R5 试点：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx）
export const skyLut = Pass => Pass({ tag: 'skyLut' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
const float PI = 3.14159265, Rg = 6360.0, Rt = 6420.0;
const vec3 BR = vec3(5.802, 13.558, 33.1) * 1e-3; const float HR = 8.0;
const float BMS = 3.996e-3, BME = 4.40e-3, HM = 1.2;
const vec3 BO = vec3(0.650, 1.881, 0.085) * 1e-3;
vec3 extinction(float h, out vec3 sR, out float sM){
  float r = exp(-h / HR), m = exp(-h / HM) * (1.0 + ${Fps.rain} * 4.0); float oz = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  sR = BR * r; sM = BMS * m; return BR * r + BME * m + BO * oz;
}
float sphereFar(vec3 ro, vec3 rd, float R){ float b = dot(ro, rd), c = dot(ro, ro) - R * R, d = b * b - c; return d < 0.0 ? -1.0 : -b + sqrt(d); }
float sphereNear(vec3 ro, vec3 rd, float R){ float b = dot(ro, rd), c = dot(ro, ro) - R * R, d = b * b - c; if (d < 0.0) return -1.0; return -b - sqrt(d); }
vec3 transTo(vec3 p, vec3 L){
  float tg = sphereNear(p, L, Rg); if (tg > 0.0) return vec3(0.0);
  float t = sphereFar(p, L, Rt); float dt = t / 6.0; vec3 od = vec3(0.0); vec3 a; float b;
  for (int i = 0; i < 6; i++) { vec3 q = p + L * (dt * (float(i) + 0.5)); od += extinction(length(q) - Rg, a, b) * dt; }
  return exp(-od);
}
float phaseR(float mu){ return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseM(float mu){ const float g = 0.8; float g2 = g * g; return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); }
void main(){
  float v = (v_uv.y - 0.5) * 2.0; float el = sign(v) * v * v * PI * 0.5;
  float az = (v_uv.x - 0.5) * 2.0 * PI;
  vec3 d = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vec3 ro = vec3(0.0, Rg + ${Fps.camAlt}, 0.0);
  float tg = sphereNear(ro, d, Rg); float tt = sphereFar(ro, d, Rt);
  float tMax = min(tg > 0.0 ? tg : tt, 260.0);
  const int N = 22; float dt = tMax / float(N);
  vec3 L = vec3(0.0), T = vec3(1.0);
  float muS = dot(d, ${Fps.sunDir}), muM = dot(d, ${Fps.moonDir});
  float pRs = phaseR(muS), pMs = phaseM(muS), pRm = phaseR(muM), pMm = phaseM(muM);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + d * (dt * (float(i) + 0.5)); float h = length(p) - Rg;
    vec3 sR; float sM; vec3 e = extinction(h, sR, sM);
    vec3 Ts = transTo(p, ${Fps.sunDir}) * ${Fps.sunI};
    vec3 Tm = ${Fps.moonI} > 0.0 ? transTo(p, ${Fps.moonDir}) * ${Fps.moonI} : vec3(0.0);
    vec3 S = (sR * pRs + sM * pMs) * Ts + (sR * pRm + sM * pMm) * Tm;
    S += (sR + sM) * (Ts + Tm) * 0.014; // multiple scattering approximation
    vec3 st = exp(-e * dt);
    L += T * S * (1.0 - st) / max(e, vec3(1e-7));
    T *= st;
  }
  if (tg > 0.0) { vec3 p = ro + d * tg; float cs = max(dot(normalize(p), ${Fps.sunDir}), 0.0); L += T * transTo(p + normalize(p) * 0.01, ${Fps.sunDir}) * ${Fps.sunI} * cs * 0.12 / PI; }
  L += vec3(0.0012, 0.0016, 0.0032) * (0.4 + 0.6 * max(d.y, 0.0)); // airglow / starlight
  o = vec4(L, 1.0);
}`;

// ======== skyf.js ========
// rgl/shaders/skyf.js —— goodGL skyFancyFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
export const skyF = (Pass, X = {}) => Pass({ tag: 'skyF' })`#version 300 es
precision highp float;
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
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.0), ${Fps.rain} * 0.75) * (1.0 - ${Fps.rain} * 0.35);
  return c + vec3(0.55, 0.6, 0.8) * ${Fps.flash} * 0.6;
}
vec3 skyHorizon(vec3 d){ return skyBase(normalize(vec3(d.x, max(d.y, 0.0), d.z))); }

vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0-c); }
void main(){
  vec4 w = ${Fps.invViewProjSky} * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w);
  vec3 col = d.y >= 0.0 ? skyBase(d) : skyBase(normalize(vec3(d.x, 0.0, d.z))) * mix(1.0, 0.45, smoothstep(0.0, -0.5, d.y));
  float night = 1.0 - smoothstep(-0.22, 0.02, ${Fps.sunDir}.y);
  float clear = 1.0 - ${Fps.rain};
  if (night > 0.0 && d.y > -0.1) {
    vec3 sd = rotAxis(d, ${Fps.pathAxis}, -${Fps.starRot});
    vec3 p = sd * 190.0; vec3 ip = floor(p); vec3 fp = fract(p); float h = hash13(ip); float star = 0.0;
    if (h > 0.9962) { vec3 j = vec3(hash13(ip + 3.1), hash13(ip + 7.7), hash13(ip + 1.3)) * 0.6 + 0.2; float r = length(fp - j);
      star = smoothstep(0.13, 0.0, r) * (0.3 + 0.7 * pow(hash13(ip + 9.0), 3.0)) * (0.7 + 0.3 * sin(${Fps.time} * (2.0 + h * 40.0) + h * 100.0)); }
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash13(ip + 5.0));
    vec3 gn = normalize(vec3(0.35, 0.55, 0.76)); float band = abs(dot(sd, gn)); float mw = exp(-band * band * 16.0);
    float cl = vnoise3(sd * 5.0) * 0.55 + vnoise3(sd * 13.0) * 0.3 + vnoise3(sd * 31.0) * 0.15;
    float dust = smoothstep(0.4, 0.75, vnoise3(sd * 8.0 + 4.0)) * smoothstep(0.02, 0.0, band - 0.06);
    vec3 mwc = mix(vec3(0.16, 0.14, 0.30), vec3(0.62, 0.55, 0.62), cl) * mw * pow(cl, 1.4) * (1.0 - dust * 0.8);
    float fine = step(0.982, hash13(floor(sd * 560.0))) * mw * 0.5;
    float hf = smoothstep(-0.02, 0.22, d.y);
    col += (tint * star * 2.4 + mwc * 0.42 + fine * 0.35) * night * hf * clear;
    // meteors
    float slot = floor(${Fps.time} / 7.0); float ph = fract(${Fps.time} / 7.0);
    if (ph < 0.12 && hash12(vec2(slot, 3.0)) > 0.35) {
      vec3 m0 = normalize(vec3(hash12(vec2(slot, 1.0)) - 0.5, 0.45 + hash12(vec2(slot, 2.0)) * 0.5, hash12(vec2(slot, 4.0)) - 0.5));
      vec3 tdir = normalize(cross(m0, vec3(hash12(vec2(slot, 5.0)) - 0.5, 0.2, hash12(vec2(slot, 6.0)) - 0.5)));
      float pr = ph / 0.12; vec3 head = normalize(m0 + tdir * pr * 0.35);
      vec3 tail = normalize(m0 + tdir * max(pr - 0.1, 0.0) * 0.35);
      vec3 ab = head - tail; float tt = clamp(dot(d - tail, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
      float dist = length(d - (tail + ab * tt));
      col += vec3(0.9, 0.95, 1.0) * smoothstep(0.0025, 0.0, dist) * tt * (1.0 - pr) * 3.0 * night * clear;
    }
    // aurora curtains
    if (${Fps.aurora} > 0.0 && d.y > 0.0) {
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 14; i++) {
        float hh = 1.0 + (float(i) + ign(gl_FragCoord.xy + float(i) * 7.3)) * 0.09;
        vec2 q = d.xz / (d.y + 0.08) * hh * 0.9;
        float n1 = vnoise(q * vec2(0.55, 0.9) + vec2(${Fps.time} * 0.02, 0.0));
        float rib = pow(1.0 - abs(n1 * 2.0 - 1.0), 7.0) * smoothstep(0.35, 0.7, vnoise(q * 0.35 + vec2(0.0, ${Fps.time} * 0.01)));
        vec3 c = mix(vec3(0.1, 1.0, 0.45), vec3(0.55, 0.2, 0.9), float(i) / 13.0);
        acc += c * rib * (1.0 - float(i) / 16.0);
      }
      col += acc * 0.11 * ${Fps.aurora} * night * clear * smoothstep(0.0, 0.25, d.y);
    }
  }
  // sun & moon discs (square, soft limb)
  { vec3 U = ${Fps.pathAxis}; vec3 V = normalize(cross(${Fps.sunDir}, U)); float mu = dot(d, ${Fps.sunDir});
    if (mu > 0.0) { vec2 q = vec2(dot(d, U), dot(d, V)) / mu; float m = max(abs(q.x), abs(q.y));
      float disk = smoothstep(0.05, 0.043, m); col += ${Fps.sunCol} * disk * 16.0 * (1.0 - ${Fps.rain}) * smoothstep(-0.05, 0.02, ${Fps.sunDir}.y); } }
  { vec3 U = ${Fps.pathAxis}; vec3 V = normalize(cross(${Fps.moonDir}, U)); float mm = dot(d, ${Fps.moonDir});
    if (mm > 0.0) { vec2 q = vec2(dot(d, U), dot(d, V)) / mm; float m = max(abs(q.x), abs(q.y));
      if (m < 0.042) { vec2 pq = floor((q / 0.042 * 0.5 + 0.5) * 8.0); float crater = hash12(pq) > 0.72 ? 0.7 : 1.0;
        float xx = q.x / 0.042; float ph = ${Fps.moonPhase}; float lit = 1.0;
        if (ph > 0.0) lit = ph < 0.5 ? smoothstep(-1.0 + ph * 4.0 - 0.05, -1.0 + ph * 4.0 + 0.05, xx) : smoothstep(-1.0 + (ph - 0.5) * 4.0 + 0.05, -1.0 + (ph - 0.5) * 4.0 - 0.05, xx);
        col += vec3(0.85, 0.9, 1.0) * crater * (0.08 + 0.92 * lit) * 2.2 * smoothstep(-0.1, 0.05, ${Fps.moonDir}.y) * (1.0 - ${Fps.rain}) * (0.12 + 0.88 * night); }
      col += vec3(0.5, 0.6, 0.9) * pow(max(mm, 0.0), 400.0) * 0.25 * (1.0 - ${Fps.rain}) * night; } }
  o = vec4(col, 1.0);
}`;

// ======== clouds.js ========
// rgl/shaders/clouds.js —— goodGL cloudsFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
export const clouds = (Pass, X = {}) => Pass({ tag: 'clouds' })`#version 300 es
precision highp float;
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
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.0), ${Fps.rain} * 0.75) * (1.0 - ${Fps.rain} * 0.35);
  return c + vec3(0.55, 0.6, 0.8) * ${Fps.flash} * 0.6;
}
vec3 skyHorizon(vec3 d){ return skyBase(normalize(vec3(d.x, max(d.y, 0.0), d.z))); }


const float CB = 185.0, CT = 262.0;
float cloudMap(vec2 xz){
  vec2 p = xz * (1.0 / 520.0) + vec2(${Fps.cloudTime} * 0.0045, ${Fps.cloudTime} * 0.0016);
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; }
  return s / 0.9375;
}
float cloudCover(float n){ return clamp((n - (1.0 - ${Fps.cov})) * 2.6, 0.0, 1.0); }

float density(vec3 p, float lod){
  float h = (p.y - CB) / (CT - CB); if (h < 0.0 || h > 1.0) return 0.0;
  float n = cloudMap(p.xz);
  float cov = cloudCover(n);
  float topH = 0.25 + 0.75 * cov;
  float prof = smoothstep(0.0, 0.1, h) * smoothstep(topH, topH * 0.55, h);
  float d = cov * prof;
  if (d <= 0.0) return 0.0;
  if (lod < 0.5) d -= (vnoise3(p * 0.045 + vec3(${Fps.cloudTime} * 0.02, 0.0, 0.0)) - 0.3) * 0.35 * (1.0 - d);
  return max(d, 0.0);
}
void main(){
  vec4 w = ${Fps.invViewProjSky} * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w);
  vec3 ro = ${Fps.camPos};
  float t0, t1;
  if (abs(d.y) < 1e-4) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float ta = (CB - ro.y) / d.y, tb = (CT - ro.y) / d.y;
  t0 = max(min(ta, tb), 0.0); t1 = max(ta, tb);
  if (t1 <= 0.0 || t0 > 5000.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  t1 = min(t1, t0 + 900.0);
  const int N = 16; float stepL = (t1 - t0) / float(N);
  float t = t0 + stepL * ign(gl_FragCoord.xy + fract(${Fps.time}) * 17.0);
  vec3 L = ${Fps.useSun} ? ${Fps.sunDir} : ${Fps.moonDir};
  vec3 lcol = ${Fps.useSun} ? ${Fps.sunCol} : ${Fps.moonCol};
  float mu = dot(d, L);
  float ph = mix((1.0 - 0.36) / (4.0 * 3.14159 * pow(1.0 + 0.36 - 1.2 * mu, 1.5)), (1.0 - 0.04) / (4.0 * 3.14159 * pow(1.0 + 0.04 + 0.4 * mu, 1.5)), 0.3);
  vec3 ambTop = skyBase(vec3(0.0, 1.0, 0.0)) * 1.1, ambBot = skyHorizon(vec3(d.x, 0.0, d.z)) * 0.55;
  vec3 acc = vec3(0.0); float T = 1.0; const float sigma = 0.045;
  for (int i = 0; i < N; i++) {
    vec3 p = ro + d * t;
    float den = density(p, 0.0);
    if (den > 0.01) {
      float od = 0.0;
      for (int k = 1; k <= 3; k++) od += density(p + L * (float(k) * 18.0), 1.0) * 18.0;
      float Tl = exp(-od * sigma * 0.9);
      float powder = 1.0 - exp(-den * 6.0);
      float h = (p.y - CB) / (CT - CB);
      vec3 S = lcol * Tl * ph * 6.0 * (0.4 + 0.6 * powder) + mix(ambBot, ambTop, h) * (0.55 + 0.45 * h);
      float st = exp(-den * sigma * stepL);
      acc += T * S * (1.0 - st); T *= st;
      if (T < 0.02) break;
    }
    t += stepL;
  }
  float fade = exp(-t0 * 0.00045);
  vec3 hz = skyHorizon(d);
  acc = mix(hz * (1.0 - T), acc, fade);
  T = mix(1.0, T, fade * 0.98 + 0.02);
  o = vec4(acc, T);
}`;
