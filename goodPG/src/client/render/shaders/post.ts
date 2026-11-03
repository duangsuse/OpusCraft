// Post-procesado: luz volumétrica, composición atmosférica, TAA, exposición automática,
// bloom, tonemapping ACES y FXAA.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';

const FOG = /* glsl */ `
float fogDensityAt(float y) {
  return uFog.x * exp(-max(y - 62.0, 0.0) * uFog.y);
}
/** Integral analítica de la niebla exponencial en altura a lo largo del rayo. */
float fogOpticalDepth(vec3 rd, float dist) {
  float y0 = uCamPos.y;
  float k = uFog.y;
  float a = uFog.x * exp(-max(y0 - 62.0, 0.0) * k);
  float dy = rd.y * dist;
  if (abs(dy) < 1e-3 || y0 < 62.0) return a * dist;
  return a * dist * (1.0 - exp(-k * dy)) / (k * dy);
}

// Fase 8 (entorno del Nether): uDim.y = altura del mar de lava de la dimensión (0 si no tiene).
/** Integral de exp(-(y - L) / h) a lo largo del rayo (la capa que se espesa junto al mar de lava). */
float seaLayer(vec3 rd, float dist, float h) {
  float e0 = exp(-max(uCamPos.y - uDim.y, -3.0) / h);
  float k = rd.y / h;
  if (abs(k * dist) < 1e-3) return e0 * dist;
  return e0 * (1.0 - exp(-k * dist)) / k;
}
/** Espesor óptico de la niebla sin cielo: la del bioma, más densa en los 10 bloques de encima de la lava. */
float netherFogDepth(vec3 rd, float dist) {
  float d = uDim.z;
  // Como en Java, la niebla empieza a unos bloques de la cámara (el 5 % de la distancia de visión).
  float clear = uFog.w * 0.054;
  if (uDim.y <= 0.0) return d * max(dist - clear, 0.0);
  return d * (0.62 * max(dist - clear, 0.0) + 1.15 * seaLayer(rd, dist, 10.0));
}
/** Color de la niebla sin cielo a la altura y: la del bioma, encendida desde abajo por el mar de lava. */
vec3 netherFogColor(float y, float rdy) {
  vec3 base = uDimFog.rgb;
  if (uDim.y <= 0.0) return base;
  float glow = exp(-max(y - uDim.y, 0.0) / 16.0);
  vec3 c = base * (0.5 + 0.95 * glow) + vec3(1.0, 0.34, 0.07) * (luma(base) * 0.9 + 0.0035) * glow;
  // Hacia arriba, la oscuridad del techo; hacia abajo, el resplandor.
  return c * mix(1.18, 0.62, smoothstep(-0.35, 0.6, rdy));
}
/** Fase 8.6: ruido de valor 3D (para las nebulosas del cielo del End). */
float vnoise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(i), b = hash13(i + vec3(1, 0, 0)), c = hash13(i + vec3(0, 1, 0)), d = hash13(i + vec3(1, 1, 0));
  float e = hash13(i + vec3(0, 0, 1)), g = hash13(i + vec3(1, 0, 1)), h = hash13(i + vec3(0, 1, 1)), k = hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}
/**
 * Fase 8.6: el cielo del End. En Java es un mosaico gris; aquí, el vacío: casi negro arriba y abajo, con la
 * niebla en la línea del horizonte (para que las islas lejanas se fundan con él), nebulosas violetas y verdosas
 * que derivan muy despacio, estrellas tenues que titilan y el destello (EndFlashState de la 26.3): un resplandor
 * violeta en su dirección que también aclara todo el cielo.
 */
vec3 endSky(vec3 rd) {
  vec3 fogc = uDimFog.rgb;
  float band = exp(-abs(rd.y) * 5.0);
  vec3 c = mix(vec3(0.0022, 0.0016, 0.0032), fogc, band);
  vec3 p = rd * 2.6 + vec3(0.0, uWind.w * 0.0015, 0.0);
  float n = fbm3(p);
  float tint = fbm3(p * 1.9 + 11.3);
  float neb = smoothstep(0.42, 0.85, n) * (1.0 - 0.6 * band);
  c += mix(vec3(0.030, 0.008, 0.045), vec3(0.006, 0.024, 0.026), tint) * neb;
  // Estrellas: una de cada muchas celdas de una rejilla sobre la esfera.
  vec3 q = rd * 150.0;
  vec3 cell = floor(q);
  float h = hash13(cell);
  if (h > 0.982) {
    float d = length(fract(q) - 0.5);
    float tw = 0.6 + 0.4 * sin(uWind.w * (1.5 + h * 3.0) + h * 97.0);
    c += vec3(0.75, 0.7, 1.0) * smoothstep(0.32, 0.0, d) * (h - 0.982) * 18.0 * tw * (1.0 - band);
  }
  float fl = uEndFlash.w;
  if (fl > 0.0) {
    float d = max(dot(rd, normalize(uEndFlash.xyz)), 0.0);
    c += vec3(0.67, 0.38, 0.80) * fl * (pow(d, 90.0) * 5.0 + pow(d, 10.0) * 0.5 + 0.035);
  }
  return c;
}
/** Camino que recorre el rayo dentro de la capa de aire caliente (2,5 bloques sobre la lava). */
float heatPath(vec3 rd, float dist) {
  if (uDim.y <= 0.0) return 0.0;
  float lo = uDim.y, hi = uDim.y + 2.5, y0 = uCamPos.y;
  if (abs(rd.y) < 1e-4) return y0 >= lo && y0 <= hi ? dist : 0.0;
  float t1 = (lo - y0) / rd.y, t2 = (hi - y0) / rd.y;
  float a = max(min(t1, t2), 0.0), b = min(max(t1, t2), dist);
  return max(b - a, 0.0);
}
`;

export const VOLUMETRIC_FS = /* glsl */ `
${COMMON}
${FOG}
uniform sampler2D uDepth;
uniform sampler2DShadow uShadowMap;
uniform sampler2D uWaterShadow;
uniform float uSteps;
uniform float uTemporal;
in vec2 vUV;
out vec4 outColor;
void main() {
  float depth = texture(uDepth, vUV).r;
  vec3 rel = relFromDepth(vUV, depth);
  float dist = depth >= 1.0 ? 1e6 : length(rel);
  vec3 rd = normalize(rel);
  bool under = uMisc.z > 0.5;
  float maxD = min(dist, uShadowOffset.w * (under ? 0.5 : 0.95));
  int steps = int(uSteps);
  float dt = maxD / float(steps);
  float jitter = uTemporal > 0.5 ? ign(gl_FragCoord.xy) : ignStatic(gl_FragCoord.xy);
  vec3 L = uLightDir.xyz;
  float cosT = dot(rd, L);
  vec3 sum = vec3(0.0);
  float T = 1.0;
  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    float t = (float(i) + jitter) * dt;
    vec3 p = rd * t;
    vec4 sp = uShadowMat * vec4(p + uShadowOffset.xyz, 1.0);
    vec2 d = distortShadow(sp.xy) * 0.5 + 0.5;
    float z = sp.z * 0.5 + 0.5;
    float vis = texture(uShadowMap, vec3(d, z - 0.0003));
    if (under) {
      float wd = texture(uWaterShadow, d).r;
      float depthW = max(z - wd, 0.0) * 512.0;
      vec3 att = exp(-vec3(0.35, 0.09, 0.06) * (depthW + t));
      float dens = 0.035;
      sum += vis * att * dens * dt;
    } else {
      float dens = fogDensityAt(uCamPos.y + p.y) + 0.00035 + uMisc.y * 0.002;
      sum += vec3(vis * dens * T * dt);
      T *= exp(-dens * dt);
    }
  }
  float phase = under ? mix(phaseHG(cosT, 0.6), 1.0 / (4.0 * PI), 0.4) : mix(phaseHG(cosT, 0.78), 1.0 / (4.0 * PI), 0.35);
  vec3 col = sum * uLightColor.rgb * phase * (under ? vec3(0.4, 0.9, 1.0) * 3.0 : vec3(1.0));
  // En cuevas no hay rayos de sol visibles desde dentro.
  col *= under ? 1.0 : mix(0.15, 1.0, uMisc.w);
  outColor = vec4(col, 1.0);
}
`;

export const COMPOSITE_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${FOG}
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uClouds;
uniform sampler2D uVolumetric;
uniform sampler2D uSkyView;
uniform sampler2D uIrradiance;
uniform float uCloudsOn;
uniform float uCloudBlur;
uniform float uVolumetricOn;
in vec2 vUV;
out vec4 outColor;

vec3 skyAt(vec3 rd) {
  return farColor(uSkyView, rd);
}

void main() {
  float depth = texture(uDepth, vUV).r;
  vec3 rel = relFromDepth(vUV, depth);
  float dist = length(rel);
  vec3 rd = rel / max(dist, 1e-5);
  bool sky = depth >= 1.0;
  bool under = uMisc.z > 0.5;
  bool dark = !under && uDim.x < 0.5;
  // Fase 8 (entorno del Nether): calima sobre el mar de lava: el aire caliente de la capa de encima ondula lo
  // que se ve a través de ella (más cuanto más camino recorre el rayo dentro de la capa).
  vec2 suv = vUV;
  if (dark) {
    float hot = heatPath(rd, sky ? 400.0 : dist);
    if (hot > 0.0) {
      float t = uWind.w;
      vec3 wp = uCamPos.xyz + rd * min(sky ? 400.0 : dist, 64.0);
      vec2 wob = vec2(sin(wp.x * 1.7 + t * 3.1) + sin(wp.z * 2.3 - t * 2.3), cos(wp.z * 1.9 + t * 2.7) + sin(wp.x * 1.1 + t * 1.9));
      suv += wob * 0.0009 * saturate(hot / 6.0);
    }
  }
  vec3 col = texture(uScene, suv).rgb;
  float eyeSky = uMisc.w;
  vec3 ambUp = texelFetch(uIrradiance, ivec2(2, 0), 0).rgb;
  if (dark) {
    // Fase 8: dimensión sin cielo (el Nether): la niebla de su bioma, más espesa y encendida junto al mar de
    // lava (la luz de la lava la ilumina desde abajo) y más oscura hacia el techo; el fondo, un degradado.
    float far = sky ? 1.0 / max(uDim.z, 1e-4) : dist;
    float yEnd = uCamPos.y + rd.y * min(far, 160.0);
    vec3 fogCol = netherFogColor(0.5 * (uCamPos.y + yEnd), rd.y);
    // Fase 8.6: el End tiene su cielo (y la niebla, que se aclara con el destello).
    if (uDimFog.w > 0.5) fogCol += vec3(0.67, 0.38, 0.80) * uEndFlash.w * 0.02;
    if (sky) col = uDimFog.w > 0.5 ? endSky(rd) : fogCol;
    else {
      col = mix(col, fogCol, 1.0 - exp(-netherFogDepth(rd, dist)));
      col = mix(col, fogCol, smoothstep(uFog.z, uFog.w, length(rel.xz)));
    }
  } else if (!under) {
    if (!sky) {
      vec3 skyC = skyAt(rd);
      // Niebla de altura (bruma matinal, valles).
      float fogT = exp(-fogOpticalDepth(rd, dist));
      vec3 fogCol = texelFetch(uIrradiance, ivec2(6, 0), 0).rgb * mix(0.08, 1.0, eyeSky) + ambUp * 0.02;
      col = col * fogT + fogCol * (1.0 - fogT);
      // Bajo tierra (sin cielo a la vista) la lejanía se funde con la niebla oscura, no con el cielo:
      // en una caverna grande (Deep Dark) se veía un «cielo» al fondo.
      vec3 farC = mix(fogCol, skyC, eyeSky);
      // Perspectiva aérea (bruma azulada con la distancia).
      float haze = 1.0 - exp(-dist * 0.0011);
      col = mix(col, farC, haze * (0.35 + 0.65 * eyeSky) * 0.75);
      // Niebla de borde para ocultar el final de la distancia de renderizado.
      float hd = length(rel.xz);
      float border = smoothstep(uFog.z, uFog.w, hd);
      col = mix(col, farC, border);
    }
    if (uCloudsOn > 0.5) {
      vec4 cl = texture(uClouds, vUV);
      if (uCloudBlur > 0.5) {
        // Sin TAA: suavizado de 5 muestras para ocultar la baja resolución de las nubes.
        vec2 ct = 0.75 / vec2(textureSize(uClouds, 0));
        cl = (cl * 2.0 + texture(uClouds, vUV + vec2(ct.x, ct.y)) + texture(uClouds, vUV + vec2(-ct.x, ct.y))
              + texture(uClouds, vUV + vec2(ct.x, -ct.y)) + texture(uClouds, vUV - ct)) / 6.0;
      }
      col = col * cl.a + cl.rgb;
    }
  } else {
    // Bajo el agua: absorción y dispersión con la distancia.
    float d = sky ? 48.0 : min(dist, 48.0);
    vec3 absorb = vec3(0.30, 0.075, 0.055);
    vec3 Tw = exp(-absorb * d);
    vec3 scatter = vec3(0.012, 0.055, 0.07) * (ambUp * eyeSky + uLightColor.rgb * max(uLightDir.y, 0.0) * 0.5 + 0.02);
    col = col * Tw + scatter * (1.0 - Tw);
  }
  if (uVolumetricOn > 0.5) col += texture(uVolumetric, vUV).rgb;
  outColor = vec4(max(col, 0.0), 1.0);
}
`;

export const TAA_FS = /* glsl */ `
${COMMON}
uniform sampler2D uCurrent;
uniform sampler2D uHistory;
uniform sampler2D uDepth;
uniform float uReset;
in vec2 vUV;
out vec4 outColor;

vec3 rgb2ycocg(vec3 c) {
  return vec3(0.25 * c.r + 0.5 * c.g + 0.25 * c.b, 0.5 * c.r - 0.5 * c.b, -0.25 * c.r + 0.5 * c.g - 0.25 * c.b);
}
vec3 ycocg2rgb(vec3 c) {
  return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z);
}
vec3 tmap(vec3 c) { return c / (1.0 + luma(c)); }
vec3 itmap(vec3 c) { return c / max(1.0 - luma(c), 1e-4); }

vec3 historyCatmullRom(vec2 uv) {
  vec2 size = uRes.xy;
  vec2 sp = uv * size;
  vec2 tp1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - tp1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 o12 = w2 / w12;
  vec2 tp0 = (tp1 - 1.0) / size;
  vec2 tp3 = (tp1 + 2.0) / size;
  vec2 tp12 = (tp1 + o12) / size;
  vec3 r = texture(uHistory, vec2(tp12.x, tp0.y)).rgb * (w12.x * w0.y)
         + texture(uHistory, vec2(tp0.x, tp12.y)).rgb * (w0.x * w12.y)
         + texture(uHistory, vec2(tp12.x, tp12.y)).rgb * (w12.x * w12.y)
         + texture(uHistory, vec2(tp3.x, tp12.y)).rgb * (w3.x * w12.y)
         + texture(uHistory, vec2(tp12.x, tp3.y)).rgb * (w12.x * w3.y);
  float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(r / ws, 0.0);
}

vec3 clipAABB(vec3 mn, vec3 mx, vec3 p, vec3 q) {
  vec3 pc = 0.5 * (mx + mn);
  vec3 e = 0.5 * (mx - mn) + 1e-5;
  vec3 v = q - pc;
  vec3 a = abs(v / e);
  float m = max(a.x, max(a.y, a.z));
  return m > 1.0 ? pc + v / m : q;
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 cur = tmap(texelFetch(uCurrent, ip, 0).rgb);
  // Vecindario 3x3 (varianza) en YCoCg.
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  vec3 curY = rgb2ycocg(cur);
  float closestDepth = 1.0;
  ivec2 maxP = ivec2(uRes.xy) - 1;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      ivec2 q = clamp(ip + ivec2(x, y), ivec2(0), maxP);
      vec3 c = rgb2ycocg(tmap(texelFetch(uCurrent, q, 0).rgb));
      m1 += c;
      m2 += c * c;
      closestDepth = min(closestDepth, texelFetch(uDepth, q, 0).r);
    }
  }
  vec3 mean = m1 / 9.0;
  vec3 sigma = sqrt(abs(m2 / 9.0 - mean * mean));
  float gamma = 1.1;
  vec3 mn = mean - gamma * sigma;
  vec3 mx = mean + gamma * sigma;
  // Reproyección con la profundidad más cercana (bordes más estables).
  vec3 rel = relFromDepth(vUV, closestDepth);
  vec4 pc = uPrevViewProj * vec4(rel, 1.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  bool offscreen = puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0 || pc.w <= 0.0;
  if (uReset > 0.5 || offscreen) {
    outColor = vec4(itmap(cur), 1.0);
    return;
  }
  vec3 hist = rgb2ycocg(tmap(historyCatmullRom(puv)));
  hist = clipAABB(mn, mx, curY, hist);
  float motion = length((puv - vUV) * uRes.xy);
  float blend = mix(0.92, 0.8, saturate(motion / 12.0));
  vec3 res = ycocg2rgb(mix(curY, hist, blend));
  outColor = vec4(itmap(max(res, 0.0)), 1.0);
}
`;

export const LUMINANCE_FS = /* glsl */ `
uniform sampler2D uColor;
uniform sampler2D uDepth;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec3 c = texture(uColor, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  vec2 d = vUV - 0.5;
  float w = exp(-dot(d, d) * 6.0);
  // El cielo y las nubes influyen menos: se expone para el terreno.
  if (texture(uDepth, vUV).r >= 1.0) w *= 0.3;
  outColor = vec4(log(max(l, 1e-5)) * w, w, 0.0, 1.0);
}
`;

export const ADAPT_FS = /* glsl */ `
uniform sampler2D uLum;
uniform sampler2D uPrev;
uniform float uDt;
uniform float uEV;
uniform float uLevels;
uniform float uReset;
out vec4 outColor;
void main() {
  vec2 a = textureLod(uLum, vec2(0.5), uLevels).rg;
  float avgLog = a.x / max(a.y, 1e-5);
  float avg = exp(avgLog);
  // Clave automática: las escenas oscuras (noche, cuevas) se mantienen oscuras.
  float key = 1.03 - 2.0 / (2.0 + log(avg * 400.0 + 1.0) / log(10.0));
  key = clamp(key, 0.05, 0.3);
  float target = key * exp2(uEV) / clamp(avg, 0.0001, 50.0);
  target = clamp(target, 0.04, 14.0 * exp2(uEV));
  float prev = texelFetch(uPrev, ivec2(0), 0).r;
  if (uReset > 0.5 || prev <= 0.0) { outColor = vec4(target, avg, 0.0, 1.0); return; }
  float speed = target > prev ? 1.1 : 2.2;
  float lp = mix(log(prev), log(target), 1.0 - exp(-uDt * speed));
  outColor = vec4(exp(lp), avg, 0.0, 1.0);
}
`;

export const BLOOM_DOWN_FS = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uFirst;
in vec2 vUV;
out vec4 outColor;
vec3 s(vec2 o) { return texture(uSrc, vUV + o * uTexel).rgb; }
float karis(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)) * 0.25); }
void main() {
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 res;
  if (uFirst > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = karis(g0), w1 = karis(g1), w2 = karis(g2), w3 = karis(g3), w4 = karis(g4);
    res = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) /
          (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  } else {
    res = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  outColor = vec4(max(res, 0.0), 1.0);
}
`;

export const BLOOM_UP_FS = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 r = uTexel * uRadius;
  vec3 c = texture(uSrc, vUV + vec2(-r.x, r.y)).rgb + texture(uSrc, vUV + vec2(0.0, r.y)).rgb * 2.0 + texture(uSrc, vUV + r).rgb
         + texture(uSrc, vUV + vec2(-r.x, 0.0)).rgb * 2.0 + texture(uSrc, vUV).rgb * 4.0 + texture(uSrc, vUV + vec2(r.x, 0.0)).rgb * 2.0
         + texture(uSrc, vUV - r).rgb + texture(uSrc, vUV + vec2(0.0, -r.y)).rgb * 2.0 + texture(uSrc, vUV + vec2(r.x, -r.y)).rgb;
  outColor = vec4(c / 16.0, 1.0);
}
`;

export const FINAL_FS = /* glsl */ `
${COMMON}
uniform sampler2D uColor;
uniform sampler2D uBloom;
uniform sampler2D uExposure;
uniform float uBloomStrength;
uniform float uSharpen;
uniform float uSaturation;
uniform float uVignette;
uniform float uUnderwater;
in vec2 vUV;
out vec4 outColor;

const mat3 ACES_IN = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
const mat3 ACES_OUT = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
vec3 aces(vec3 c) {
  c = ACES_IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(ACES_OUT * (a / b), 0.0, 1.0);
}

void main() {
  vec2 uv = vUV;
  if (uUnderwater > 0.5) {
    uv += vec2(sin(uv.y * 22.0 + uWind.w * 2.0), cos(uv.x * 18.0 + uWind.w * 1.7)) * 0.0022;
  }
  vec3 c = texture(uColor, uv).rgb;
  if (uSharpen > 0.0) {
    // Nitidez adaptativa al contraste (compensa el suavizado del TAA).
    vec2 px = uRes.zw;
    vec3 n = texture(uColor, uv + vec2(0.0, px.y)).rgb;
    vec3 s = texture(uColor, uv - vec2(0.0, px.y)).rgb;
    vec3 e = texture(uColor, uv + vec2(px.x, 0.0)).rgb;
    vec3 w = texture(uColor, uv - vec2(px.x, 0.0)).rgb;
    vec3 mn = min(c, min(min(n, s), min(e, w)));
    vec3 mx = max(c, max(max(n, s), max(e, w)));
    vec3 amp = sqrt(saturate(min(mn, 2.0 - mx) / max(mx, 1e-4)));
    vec3 wgt = -amp * uSharpen * 0.2;
    c = max((c + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0);
  }
  // El bloom acumula 6 niveles: se normaliza antes de mezclar.
  vec3 bloom = texture(uBloom, uv).rgb * (1.0 / 6.0);
  c = mix(c, bloom, uBloomStrength);
  float exposure = texelFetch(uExposure, ivec2(0), 0).r;
  c *= exposure;
  // Visión nocturna (desplazamiento de Purkinje): menos saturación y tono azulado en la oscuridad.
  float l = luma(c);
  float scot = smoothstep(0.06, 0.002, l);
  c = mix(c, vec3(l) * vec3(0.72, 0.88, 1.18), scot * 0.55 * uDim.x); // Fase 8: en el Nether lo oscuro no se vuelve azul
  c = aces(c);
  float lc = luma(c);
  c = mix(vec3(lc), c, uSaturation);
  // Viñeta suave.
  vec2 d = vUV - 0.5;
  c *= mix(1.0, smoothstep(0.95, 0.25, length(d * vec2(uRes.x * uRes.w, 1.0))), uVignette);
  c = linearToSrgb(c);
  c += (ignStatic(gl_FragCoord.xy + mod(uMisc.x, 16.0) * 7.0) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}
`;

export const FXAA_FS = /* glsl */ `
uniform sampler2D uColor;
uniform vec2 uTexel;
in vec2 vUV;
out vec4 outColor;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 rgbNW = texture(uColor, vUV + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture(uColor, vUV + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture(uColor, vUV + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 rgbSE = texture(uColor, vUV + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 rgbM = texture(uColor, vUV).rgb;
  float lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE), lM = lum(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;
  vec3 rgbA = 0.5 * (texture(uColor, vUV + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uColor, vUV + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(uColor, vUV + dir * -0.5).rgb + texture(uColor, vUV + dir * 0.5).rgb);
  float lB = lum(rgbB);
  outColor = vec4((lB < lMin || lB > lMax) ? rgbA : rgbB, 1.0);
}
`;

export const COPY_FS = /* glsl */ `
uniform sampler2D uSrc;
in vec2 vUV;
out vec4 outColor;
void main() { outColor = texture(uSrc, vUV); }
`;
