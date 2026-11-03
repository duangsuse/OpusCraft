// rgl/shaders/skylut.js —— sky-view LUT（goodGL skyLutFS，R5 试点：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx）
import { u } from '../pass.js';
import { F } from '../frameref.js';
export const skyLut = Pass => Pass({ tag: 'skyLut' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
const float PI = 3.14159265, Rg = 6360.0, Rt = 6420.0;
const vec3 BR = vec3(5.802, 13.558, 33.1) * 1e-3; const float HR = 8.0;
const float BMS = 3.996e-3, BME = 4.40e-3, HM = 1.2;
const vec3 BO = vec3(0.650, 1.881, 0.085) * 1e-3;
vec3 extinction(float h, out vec3 sR, out float sM){
  float r = exp(-h / HR), m = exp(-h / HM) * (1.0 + ${u('rain', () => F.rain || 0)} * 4.0); float oz = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
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
  vec3 ro = vec3(0.0, Rg + ${() => F.camAlt}, 0.0);
  float tg = sphereNear(ro, d, Rg); float tt = sphereFar(ro, d, Rt);
  float tMax = min(tg > 0.0 ? tg : tt, 260.0);
  const int N = 22; float dt = tMax / float(N);
  vec3 L = vec3(0.0), T = vec3(1.0);
  float muS = dot(d, ${() => F.sunDir}), muM = dot(d, ${() => F.moonDir});
  float pRs = phaseR(muS), pMs = phaseM(muS), pRm = phaseR(muM), pMm = phaseM(muM);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + d * (dt * (float(i) + 0.5)); float h = length(p) - Rg;
    vec3 sR; float sM; vec3 e = extinction(h, sR, sM);
    vec3 Ts = transTo(p, ${() => F.sunDir}) * ${() => F.sunI};
    vec3 Tm = ${() => F.moonI} > 0.0 ? transTo(p, ${() => F.moonDir}) * ${() => F.moonI} : vec3(0.0);
    vec3 S = (sR * pRs + sM * pMs) * Ts + (sR * pRm + sM * pMm) * Tm;
    S += (sR + sM) * (Ts + Tm) * 0.014; // multiple scattering approximation
    vec3 st = exp(-e * dt);
    L += T * S * (1.0 - st) / max(e, vec3(1e-7));
    T *= st;
  }
  if (tg > 0.0) { vec3 p = ro + d * tg; float cs = max(dot(normalize(p), ${() => F.sunDir}), 0.0); L += T * transTo(p + normalize(p) * 0.01, ${() => F.sunDir}) * ${() => F.sunI} * cs * 0.12 / PI; }
  L += vec3(0.0012, 0.0016, 0.0032) * (0.4 + 0.6 * max(d.y, 0.0)); // airglow / starlight
  o = vec4(L, 1.0);
}`;
