// Nubes volumétricas (raymarching sobre capas esféricas) y generación de ruido 3D periódico.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';

const NOISE_LIB = /* glsl */ `
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
/** Worley 3D periódico (1 en los centros de celda). */
float worley(vec3 p, float period) {
  vec3 id = floor(p);
  vec3 f = fract(p);
  float minD = 1.0;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 off = vec3(float(x), float(y), float(z));
    vec3 cell = mod(id + off, period);
    vec3 d = off + hash33(cell) - f;
    minD = min(minD, dot(d, d));
  }
  return 1.0 - sqrt(minD);
}
/** Ruido de gradiente 3D periódico. */
float gradNoise(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n = 0.0;
  float res[8];
  for (int k = 0; k < 8; k++) {
    vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 g = hash33(mod(i + o, period)) * 2.0 - 1.0;
    res[k] = dot(normalize(g + 1e-5), f - o);
  }
  float x00 = mix(res[0], res[1], u.x);
  float x10 = mix(res[2], res[3], u.x);
  float x01 = mix(res[4], res[5], u.x);
  float x11 = mix(res[6], res[7], u.x);
  n = mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z);
  return n;
}
float worleyFbm(vec3 p, float freq) {
  return worley(p * freq, freq) * 0.625 + worley(p * freq * 2.0, freq * 2.0) * 0.25 + worley(p * freq * 4.0, freq * 4.0) * 0.125;
}
float remap(float v, float l0, float h0, float l1, float h1) {
  return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}
`;

export const CLOUD_SHAPE_GEN_FS = /* glsl */ `
${NOISE_LIB}
uniform float uZ;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec3 p = vec3(vUV, uZ);
  float perlin = 0.0;
  float amp = 1.0, freq = 4.0, norm = 0.0;
  for (int o = 0; o < 5; o++) {
    perlin += gradNoise(p * freq, freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  perlin = perlin / norm * 0.5 + 0.5;
  float w1 = worleyFbm(p, 4.0);
  float w2 = worleyFbm(p, 8.0);
  float w3 = worleyFbm(p, 16.0);
  float pw = remap(perlin, w1 - 1.0, 1.0, 0.0, 1.0);
  outColor = vec4(clamp(pw, 0.0, 1.0), w1, w2, w3);
}
`;

export const CLOUD_DETAIL_GEN_FS = /* glsl */ `
${NOISE_LIB}
uniform float uZ;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec3 p = vec3(vUV, uZ);
  outColor = vec4(worleyFbm(p, 2.0), worleyFbm(p, 4.0), worleyFbm(p, 8.0), 1.0);
}
`;

export const CLOUD_WEATHER_GEN_FS = /* glsl */ `
${NOISE_LIB}
in vec2 vUV;
out vec4 outColor;
void main() {
  vec3 p = vec3(vUV, 0.5);
  float a = 0.0, amp = 1.0, freq = 3.0, norm = 0.0;
  for (int o = 0; o < 5; o++) {
    a += gradNoise(vec3(p.xy * freq, 0.37 * freq), freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2.0;
  }
  a = a / norm * 0.5 + 0.5;
  float b = 0.0; amp = 1.0; freq = 8.0; norm = 0.0;
  for (int o = 0; o < 4; o++) {
    b += gradNoise(vec3(p.xy * freq, 0.71 * freq), freq) * amp;
    norm += amp; amp *= 0.5; freq *= 2.0;
  }
  b = b / norm * 0.5 + 0.5;
  float w = worley(vec3(p.xy * 8.0, 0.5), 8.0);
  outColor = vec4(smoothstep(0.25, 0.75, a), clamp(b * 0.6 + w * 0.5 - 0.05, 0.0, 1.0), w, 1.0);
}
`;

export const CLOUDS_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
uniform highp sampler3D uShape;
uniform highp sampler3D uDetail;
uniform sampler2D uWeather;
uniform sampler2D uDepth;
uniform sampler2D uSkyView;
uniform sampler2D uIrradiance;
uniform float uSteps;
uniform float uTemporal;
in vec2 vUV;
out vec4 outColor;

const float EARTH_R = 6360000.0;

float remapC(float v, float l0, float h0, float l1, float h1) {
  return l1 + (v - l0) * (h1 - l1) / (h0 - l0);
}

float cloudDensity(vec3 wp, float hf, bool detail) {
  vec3 p = wp + vec3(uWind.x, 0.0, uWind.y);
  vec4 weather = texture(uWeather, p.xz / 18000.0);
  float coverage = saturate(uCloud.x + (weather.r - 0.5) * 0.75);
  // Perfil de cúmulo: base plana y cima redondeada que se estrecha.
  float grad = smoothstep(0.0, 0.07, hf) * smoothstep(1.0, 0.25, hf);
  vec4 s = texture(uShape, vec3(p.x, p.y * 1.2, p.z) / 2300.0 + vec3(hf * 0.05, 0.0, 0.0));
  float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float base = remapC(s.r, -(1.0 - fbm), 1.0, 0.0, 1.0) * grad;
  float cov = remapC(base, 1.0 - coverage * mix(1.0, 0.75, hf), 1.0, 0.0, 1.0) * coverage;
  if (cov <= 0.0) return 0.0;
  if (detail) {
    vec3 d = texture(uDetail, p / 380.0 + vec3(0.0, uWind.w * 0.002, 0.0)).rgb;
    float dfbm = d.r * 0.625 + d.g * 0.25 + d.b * 0.125;
    float m = mix(dfbm, 1.0 - dfbm, saturate(hf * 4.0));
    cov = remapC(cov, m * 0.4, 1.0, 0.0, 1.0);
  }
  return max(cov, 0.0) * uCloud.w;
}

vec2 shellIntersect(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  float s = sqrt(d);
  return vec2(-b - s, -b + s);
}

float altitude(vec3 p) {
  return length(p + vec3(0.0, EARTH_R, 0.0)) - EARTH_R;
}

void main() {
  vec3 rel = relFromDepth(vUV, 1.0);
  vec3 rd = normalize(rel);
  float camY = uCamPos.y;
  float bottom = uCloud.y, top = uCloud.z;
  if (uCloud.x <= 0.001 || (camY < bottom && rd.y < -0.015)) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  vec3 ro = vec3(0.0, camY, 0.0);
  vec3 roE = ro + vec3(0.0, EARTH_R, 0.0);
  vec2 ib = shellIntersect(roE, rd, EARTH_R + bottom);
  vec2 it = shellIntersect(roE, rd, EARTH_R + top);
  float t0, t1;
  if (camY < bottom) {
    t0 = ib.y;
    t1 = it.y;
  } else if (camY > top) {
    if (it.x < 0.0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    t0 = it.x;
    t1 = ib.x > 0.0 ? ib.x : it.y;
  } else {
    t0 = 0.0;
    t1 = ib.x > 0.0 ? ib.x : it.y;
  }
  // Oclusión por el terreno.
  float depth = texture(uDepth, vUV).r;
  if (depth < 1.0) {
    float sceneDist = length(relFromDepth(vUV, depth));
    if (sceneDist < t0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
    t1 = min(t1, sceneDist);
  }
  if (t1 <= t0 || t0 > 60000.0) { outColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float len = min(t1 - t0, 7000.0);
  int steps = int(uSteps);
  float dt = len / float(steps);
  float jitter = uTemporal > 0.5 ? ign(gl_FragCoord.xy) : ignStatic(gl_FragCoord.xy);
  vec3 L = uLightDir.xyz;
  float cosT = dot(rd, L);
  float phase = mix(phaseHG(cosT, 0.75), phaseHG(cosT, -0.25), 0.35);
  float phase2 = mix(phaseHG(cosT, 0.37), phaseHG(cosT, -0.12), 0.35);
  vec3 sunCol = uLightColor.rgb * 1.3;
  vec3 ambTop = texelFetch(uIrradiance, ivec2(2, 0), 0).rgb / PI;
  vec3 ambBottom = texelFetch(uIrradiance, ivec2(3, 0), 0).rgb / PI;
  const float SIGMA = 0.055;
  vec3 scat = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 96; i++) {
    if (i >= steps) break;
    float t = t0 + (float(i) + jitter) * dt;
    vec3 p = uCamPos.xyz * vec3(1.0, 0.0, 1.0) + ro + rd * t;
    float hf = saturate((altitude(ro + rd * t) - bottom) / (top - bottom));
    float d = cloudDensity(p, hf, true);
    if (d > 0.002) {
      // Profundidad óptica hacia la luz (6 muestras en cono).
      float od = 0.0;
      float ls = 28.0;
      vec3 lp = p;
      for (int k = 0; k < 6; k++) {
        lp += L * ls;
        float lhf = saturate((altitude(lp - uCamPos.xyz * vec3(1.0, 0.0, 1.0)) - bottom) / (top - bottom));
        od += cloudDensity(lp, lhf, k < 2) * ls;
        ls *= 1.7;
      }
      float ext = SIGMA * d;
      float beer = exp(-SIGMA * od) * phase + exp(-SIGMA * od * 0.25) * phase2 * 0.55 + exp(-SIGMA * od * 0.06) * 0.08;
      float powder = 1.0 - exp(-SIGMA * od * 2.0 - d * 0.8);
      vec3 amb = mix(ambBottom * 0.7, ambTop, hf) * (0.55 + 0.45 * hf);
      vec3 S = (sunCol * beer * mix(0.55, 1.0, powder) * 4.0 * PI * 0.25 + amb) * ext;
      float Ts = exp(-ext * dt);
      scat += T * (S - S * Ts) / max(ext, 1e-6);
      T *= Ts;
      if (T < 0.01) break;
    }
  }
  // Perspectiva aérea: las nubes lejanas se funden con el cielo.
  float fade = exp(-t0 / 14000.0);
  vec3 skyC = texture(uSkyView, skyViewUV(normalize(vec3(rd.x, max(rd.y, 0.0) + 0.002, rd.z)))).rgb;
  vec3 col = mix(skyC * (1.0 - T), scat, fade);
  // Disolver suavemente las nubes en la bruma del horizonte.
  float hz = camY < bottom ? smoothstep(-0.015, 0.07, rd.y) : 1.0;
  outColor = vec4(col * hz, mix(1.0, T, hz));
}
`;
