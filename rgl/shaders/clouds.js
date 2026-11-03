// rgl/shaders/clouds.js —— goodGL cloudsFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u } from '../pass.js';
import { F } from '../frameref.js';
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
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.0), ${u('rain', () => F.rain || 0)} * 0.75) * (1.0 - ${u('rain', () => F.rain || 0)} * 0.35);
  return c + vec3(0.55, 0.6, 0.8) * ${u('flash', () => F.flash || 0)} * 0.6;
}
vec3 skyHorizon(vec3 d){ return skyBase(normalize(vec3(d.x, max(d.y, 0.0), d.z))); }


const float CB = 185.0, CT = 262.0;
float cloudMap(vec2 xz){
  vec2 p = xz * (1.0 / 520.0) + vec2(${() => F.cloudTime} * 0.0045, ${() => F.cloudTime} * 0.0016);
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; }
  return s / 0.9375;
}
float cloudCover(float n){ return clamp((n - (1.0 - ${() => F.cov})) * 2.6, 0.0, 1.0); }

float density(vec3 p, float lod){
  float h = (p.y - CB) / (CT - CB); if (h < 0.0 || h > 1.0) return 0.0;
  float n = cloudMap(p.xz);
  float cov = cloudCover(n);
  float topH = 0.25 + 0.75 * cov;
  float prof = smoothstep(0.0, 0.1, h) * smoothstep(topH, topH * 0.55, h);
  float d = cov * prof;
  if (d <= 0.0) return 0.0;
  if (lod < 0.5) d -= (vnoise3(p * 0.045 + vec3(${() => F.cloudTime} * 0.02, 0.0, 0.0)) - 0.3) * 0.35 * (1.0 - d);
  return max(d, 0.0);
}
void main(){
  vec4 w = ${() => F.invViewProjSky} * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 d = normalize(w.xyz / w.w);
  vec3 ro = ${() => F.camPos};
  float t0, t1;
  if (abs(d.y) < 1e-4) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float ta = (CB - ro.y) / d.y, tb = (CT - ro.y) / d.y;
  t0 = max(min(ta, tb), 0.0); t1 = max(ta, tb);
  if (t1 <= 0.0 || t0 > 5000.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  t1 = min(t1, t0 + 900.0);
  const int N = 16; float stepL = (t1 - t0) / float(N);
  float t = t0 + stepL * ign(gl_FragCoord.xy + fract(${() => F.time}) * 17.0);
  vec3 L = ${() => F.useSun} ? ${() => F.sunDir} : ${() => F.moonDir};
  vec3 lcol = ${() => F.useSun} ? ${() => F.sunCol} : ${() => F.moonCol};
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
