// rgl/shaders/skyf.js —— goodGL skyFancyFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u } from '../pass.js';
import { F } from '../frameref.js';
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
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.0), ${u('rain', () => F.rain || 0)} * 0.75) * (1.0 - ${u('rain', () => F.rain || 0)} * 0.35);
  return c + vec3(0.55, 0.6, 0.8) * ${u('flash', () => F.flash || 0)} * 0.6;
}
vec3 skyHorizon(vec3 d){ return skyBase(normalize(vec3(d.x, max(d.y, 0.0), d.z))); }

vec3 rotAxis(vec3 v, vec3 k, float a){ float c = cos(a), s = sin(a); return v*c + cross(k, v)*s + k*dot(k, v)*(1.0-c); }
void main(){
  vec4 w = ${() => F.invViewProjSky} * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w);
  vec3 col = d.y >= 0.0 ? skyBase(d) : skyBase(normalize(vec3(d.x, 0.0, d.z))) * mix(1.0, 0.45, smoothstep(0.0, -0.5, d.y));
  float night = 1.0 - smoothstep(-0.22, 0.02, ${() => F.sunDir}.y);
  float clear = 1.0 - ${u('rain', () => F.rain || 0)};
  if (night > 0.0 && d.y > -0.1) {
    vec3 sd = rotAxis(d, ${() => F.pathAxis}, -${() => F.starRot});
    vec3 p = sd * 190.0; vec3 ip = floor(p); vec3 fp = fract(p); float h = hash13(ip); float star = 0.0;
    if (h > 0.9962) { vec3 j = vec3(hash13(ip + 3.1), hash13(ip + 7.7), hash13(ip + 1.3)) * 0.6 + 0.2; float r = length(fp - j);
      star = smoothstep(0.13, 0.0, r) * (0.3 + 0.7 * pow(hash13(ip + 9.0), 3.0)) * (0.7 + 0.3 * sin(${() => F.time} * (2.0 + h * 40.0) + h * 100.0)); }
    vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash13(ip + 5.0));
    vec3 gn = normalize(vec3(0.35, 0.55, 0.76)); float band = abs(dot(sd, gn)); float mw = exp(-band * band * 16.0);
    float cl = vnoise3(sd * 5.0) * 0.55 + vnoise3(sd * 13.0) * 0.3 + vnoise3(sd * 31.0) * 0.15;
    float dust = smoothstep(0.4, 0.75, vnoise3(sd * 8.0 + 4.0)) * smoothstep(0.02, 0.0, band - 0.06);
    vec3 mwc = mix(vec3(0.16, 0.14, 0.30), vec3(0.62, 0.55, 0.62), cl) * mw * pow(cl, 1.4) * (1.0 - dust * 0.8);
    float fine = step(0.982, hash13(floor(sd * 560.0))) * mw * 0.5;
    float hf = smoothstep(-0.02, 0.22, d.y);
    col += (tint * star * 2.4 + mwc * 0.42 + fine * 0.35) * night * hf * clear;
    // meteors
    float slot = floor(${() => F.time} / 7.0); float ph = fract(${() => F.time} / 7.0);
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
    if (${() => F.aurora} > 0.0 && d.y > 0.0) {
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 14; i++) {
        float hh = 1.0 + (float(i) + ign(gl_FragCoord.xy + float(i) * 7.3)) * 0.09;
        vec2 q = d.xz / (d.y + 0.08) * hh * 0.9;
        float n1 = vnoise(q * vec2(0.55, 0.9) + vec2(${() => F.time} * 0.02, 0.0));
        float rib = pow(1.0 - abs(n1 * 2.0 - 1.0), 7.0) * smoothstep(0.35, 0.7, vnoise(q * 0.35 + vec2(0.0, ${() => F.time} * 0.01)));
        vec3 c = mix(vec3(0.1, 1.0, 0.45), vec3(0.55, 0.2, 0.9), float(i) / 13.0);
        acc += c * rib * (1.0 - float(i) / 16.0);
      }
      col += acc * 0.11 * ${() => F.aurora} * night * clear * smoothstep(0.0, 0.25, d.y);
    }
  }
  // sun & moon discs (square, soft limb)
  { vec3 U = ${() => F.pathAxis}; vec3 V = normalize(cross(${() => F.sunDir}, U)); float mu = dot(d, ${() => F.sunDir});
    if (mu > 0.0) { vec2 q = vec2(dot(d, U), dot(d, V)) / mu; float m = max(abs(q.x), abs(q.y));
      float disk = smoothstep(0.05, 0.043, m); col += ${() => F.sunCol} * disk * 16.0 * (1.0 - ${u('rain', () => F.rain || 0)}) * smoothstep(-0.05, 0.02, ${() => F.sunDir}.y); } }
  { vec3 U = ${() => F.pathAxis}; vec3 V = normalize(cross(${() => F.moonDir}, U)); float mm = dot(d, ${() => F.moonDir});
    if (mm > 0.0) { vec2 q = vec2(dot(d, U), dot(d, V)) / mm; float m = max(abs(q.x), abs(q.y));
      if (m < 0.042) { vec2 pq = floor((q / 0.042 * 0.5 + 0.5) * 8.0); float crater = hash12(pq) > 0.72 ? 0.7 : 1.0;
        float xx = q.x / 0.042; float ph = ${() => F.moonPhase}; float lit = 1.0;
        if (ph > 0.0) lit = ph < 0.5 ? smoothstep(-1.0 + ph * 4.0 - 0.05, -1.0 + ph * 4.0 + 0.05, xx) : smoothstep(-1.0 + (ph - 0.5) * 4.0 + 0.05, -1.0 + (ph - 0.5) * 4.0 - 0.05, xx);
        col += vec3(0.85, 0.9, 1.0) * crater * (0.08 + 0.92 * lit) * 2.2 * smoothstep(-0.1, 0.05, ${() => F.moonDir}.y) * (1.0 - ${u('rain', () => F.rain || 0)}) * (0.12 + 0.88 * night); }
      col += vec3(0.5, 0.6, 0.9) * pow(max(mm, 0.0), 400.0) * 0.25 * (1.0 - ${u('rain', () => F.rain || 0)}) * night; } }
  o = vec4(col, 1.0);
}`;
