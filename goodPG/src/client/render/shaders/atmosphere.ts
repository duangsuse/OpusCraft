// Cielo físico (modelo de Hillaire 2020): LUT de transmitancia, de dispersión múltiple y
// de vista del cielo; más el dibujado del cielo (sol, luna y estrellas) e irradiancia ambiental.
import { COMMON } from './common';

export const ATMOSPHERE = /* glsl */ `
const float Rg = 6360.0;
const float Rt = 6460.0;
const vec3 RAY_SCAT = vec3(5.802, 13.558, 33.1) * 1e-3;
const float RAY_H = 8.0;
const float MIE_SCAT = 3.996e-3;
const float MIE_EXT = 4.44e-3;
const float MIE_H = 1.2;
const vec3 OZONE_ABS = vec3(0.650, 1.881, 0.085) * 1e-3;
const vec3 GROUND_ALBEDO = vec3(0.3);

void mediumAt(float h, out vec3 rayScat, out float mieScat, out vec3 ext) {
  h = max(h, 0.0);
  float dR = exp(-h / RAY_H);
  float dM = exp(-h / MIE_H);
  float dO = max(0.0, 1.0 - abs(h - 25.0) / 15.0);
  rayScat = RAY_SCAT * dR;
  mieScat = MIE_SCAT * dM;
  ext = rayScat + MIE_EXT * dM + OZONE_ABS * dO;
}

float raySphereFar(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  return -b + sqrt(d);
}
float raySphereNear(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return -1.0;
  float s = sqrt(d);
  float t0 = -b - s;
  float t1 = -b + s;
  if (t0 > 0.0) return t0;
  if (t1 > 0.0) return t1;
  return -1.0;
}

float rayleighPhase(float c) { return 3.0 / (16.0 * PI) * (1.0 + c * c); }
float miePhase(float c) {
  const float g = 0.8;
  float k = 3.0 / (8.0 * PI) * (1.0 - g * g) / (2.0 + g * g);
  return k * (1.0 + c * c) / pow(max(1.0 + g * g - 2.0 * g * c, 1e-4), 1.5);
}

vec2 transmittanceUV(float r, float mu) {
  float H = sqrt(Rt * Rt - Rg * Rg);
  float rho = sqrt(max(0.0, r * r - Rg * Rg));
  float disc = r * r * (mu * mu - 1.0) + Rt * Rt;
  float d = max(0.0, -r * mu + sqrt(max(disc, 0.0)));
  float dMin = Rt - r;
  float dMax = rho + H;
  vec2 uv = vec2((d - dMin) / max(dMax - dMin, 1e-4), rho / H);
  // Corrección a centros de texel (LUT de 256x64).
  return vec2(0.5 / 256.0 + uv.x * (255.0 / 256.0), 0.5 / 64.0 + uv.y * (63.0 / 64.0));
}

/** Radio (km) de la cámara en el modelo de atmósfera. */
float cameraRadius() {
  return Rg + 0.2 + max(uCamPos.y - 63.0, 0.0) * 0.001;
}

/** Mapeo dirección → UV de la LUT de vista del cielo (más resolución en el horizonte). */
vec2 skyViewUV(vec3 rd) {
  float az = atan(rd.z, rd.x);
  float lat = asin(clamp(rd.y, -1.0, 1.0));
  float v = lat >= 0.0 ? 0.5 + 0.5 * sqrt(lat / (PI * 0.5)) : 0.5 - 0.5 * sqrt(-lat / (PI * 0.5));
  return vec2(az / TAU + 0.5, v);
}

/** Radiancia del cielo en una dirección (por debajo del horizonte se usa el horizonte). */
vec3 skyRadiance(sampler2D skyView, vec3 rd) {
  vec3 l = normalize(vec3(rd.x, max(rd.y, 0.0) + 1e-4, rd.z));
  return texture(skyView, skyViewUV(l)).rgb;
}

/**
 * Color "lejano" en una dirección: el cielo o, bajo el horizonte, un océano infinito al nivel
 * del mar que refleja el cielo (así el horizonte nunca muestra el vacío).
 */
uniform sampler2D uFarOcean;
vec3 farColor(sampler2D skyView, vec3 rd) {
  if (rd.y >= 0.0) return skyRadiance(skyView, rd);
  vec3 horizon = skyRadiance(skyView, normalize(vec3(rd.x, 0.0, rd.z)));
  // Tierra lejana: bruma azulada algo más oscura que el horizonte.
  vec3 land = mix(horizon, horizon * vec3(0.62, 0.7, 0.72), saturate(-rd.y * 6.0));
  float h = uCamPos.y - 62.9;
  if (h <= 0.5) return horizon * mix(1.0, 0.5, saturate(-rd.y * 4.0));
  float oceanAmt = texture(uFarOcean, vec2(atan(rd.z, rd.x) / TAU + 0.5, 0.5)).r;
  if (oceanAmt < 0.01) return land;
  float t = h / -rd.y;
  vec2 hit = uCamPos.xz + rd.xz * t;
  // Oleaje procedural barato para romper el reflejo en destellos.
  vec2 w = vec2(sin(hit.x * 0.21 + hit.y * 0.07 + uWind.w * 1.3) + sin(hit.y * 0.37 - hit.x * 0.11 - uWind.w * 1.1),
                cos(hit.y * 0.23 + hit.x * 0.13 + uWind.w * 0.9) + sin((hit.x - hit.y) * 0.29 + uWind.w * 1.7));
  // Las olas se atenúan con la distancia (a lo lejos el agua se ve lisa, como un espejo rugoso).
  float wa = 0.035 * exp(-t / 260.0);
  vec3 n = normalize(vec3(w.x * wa, 1.0, w.y * wa));
  vec3 R = reflect(rd, n);
  R.y = abs(R.y);
  float fres = 0.02 + 0.98 * pow(1.0 - saturate(-rd.y), 5.0);
  vec3 zen = skyRadiance(skyView, vec3(0.0, 1.0, 0.0));
  vec3 deep = zen * vec3(0.05, 0.16, 0.2);
  vec3 ocean = mix(deep, skyRadiance(skyView, R), fres);
  float sd = saturate(dot(R, uLightDir.xyz));
  float glint = pow(sd, 2400.0) * 9.0 + pow(sd, 120.0) * 0.12;
  ocean += uLightColor.rgb * glint * (0.3 + fres);
  float haze = 1.0 - exp(-t / 4000.0);
  return mix(land, mix(ocean, horizon, haze), oceanAmt);
}

`;

const FS_HEADER = COMMON + ATMOSPHERE;

export const TRANSMITTANCE_FS = /* glsl */ `
${FS_HEADER}
in vec2 vUV;
out vec4 outColor;
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) / vec2(255.0, 63.0);
  float H = sqrt(Rt * Rt - Rg * Rg);
  float rho = H * uv.y;
  float r = sqrt(rho * rho + Rg * Rg);
  float dMin = Rt - r;
  float dMax = rho + H;
  float d = dMin + uv.x * (dMax - dMin);
  float mu = d == 0.0 ? 1.0 : (H * H - rho * rho - d * d) / (2.0 * r * d);
  mu = clamp(mu, -1.0, 1.0);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float tMax = raySphereFar(ro, rd, Rt);
  vec3 od = vec3(0.0);
  const int N = 48;
  float dt = tMax / float(N);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (float(i) + 0.5) * dt;
    vec3 rs; float ms; vec3 ext;
    mediumAt(length(p) - Rg, rs, ms, ext);
    od += ext * dt;
  }
  outColor = vec4(exp(-od), 1.0);
}
`;

export const MULTISCAT_FS = /* glsl */ `
${FS_HEADER}
uniform sampler2D uTransmittance;
in vec2 vUV;
out vec4 outColor;
vec3 transmittance(float r, float mu) { return texture(uTransmittance, transmittanceUV(r, mu)).rgb; }
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) / 31.0;
  float cosSun = uv.x * 2.0 - 1.0;
  float r = Rg + max(uv.y * (Rt - Rg), 0.01);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - cosSun * cosSun)), cosSun, 0.0);
  vec3 lumTotal = vec3(0.0);
  vec3 fms = vec3(0.0);
  const int SQ = 8;
  const int STEPS = 20;
  for (int i = 0; i < SQ; i++) {
    for (int j = 0; j < SQ; j++) {
      float theta = TAU * (float(i) + 0.5) / float(SQ);
      float phi = acos(1.0 - 2.0 * (float(j) + 0.5) / float(SQ));
      vec3 rd = vec3(sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
      float tG = raySphereNear(ro, rd, Rg);
      float tA = raySphereFar(ro, rd, Rt);
      float tMax = tG > 0.0 ? tG : tA;
      float cosTheta = dot(rd, sunDir);
      float pR = rayleighPhase(-cosTheta);
      float pM = miePhase(cosTheta);
      vec3 lum = vec3(0.0);
      vec3 lumFactor = vec3(0.0);
      vec3 T = vec3(1.0);
      float dt = tMax / float(STEPS);
      for (int s = 0; s < STEPS; s++) {
        vec3 p = ro + rd * (float(s) + 0.3) * dt;
        float pr = length(p);
        vec3 up = p / pr;
        vec3 rs; float msc; vec3 ext;
        mediumAt(pr - Rg, rs, msc, ext);
        vec3 sT = exp(-dt * ext);
        vec3 scat = rs + msc;
        vec3 scatF = (scat - scat * sT) / max(ext, vec3(1e-7));
        lumFactor += T * scatF;
        float muS = dot(up, sunDir);
        float shadow = raySphereNear(p, sunDir, Rg) > 0.0 ? 0.0 : 1.0;
        vec3 sunT = transmittance(pr, muS) * shadow;
        vec3 inS = (rs * pR + msc * pM) * sunT;
        lum += T * (inS - inS * sT) / max(ext, vec3(1e-7));
        T *= sT;
      }
      if (tG > 0.0) {
        vec3 hit = ro + rd * tG;
        vec3 up = normalize(hit);
        float muS = dot(up, sunDir);
        lum += T * transmittance(Rg, muS) * GROUND_ALBEDO / PI * saturate(muS);
      }
      lumTotal += lum;
      fms += lumFactor;
    }
  }
  lumTotal /= float(SQ * SQ);
  fms /= float(SQ * SQ);
  vec3 psi = lumTotal / (1.0 - fms);
  outColor = vec4(psi, 1.0);
}
`;

export const SKYVIEW_FS = /* glsl */ `
${FS_HEADER}
uniform sampler2D uTransmittance;
uniform sampler2D uMultiScat;
in vec2 vUV;
out vec4 outColor;
vec3 transmittance(float r, float mu) { return texture(uTransmittance, transmittanceUV(r, mu)).rgb; }
vec3 multiScat(float r, float mu) {
  vec2 uv = vec2(mu * 0.5 + 0.5, (r - Rg) / (Rt - Rg));
  uv = vec2(0.5 / 32.0, 0.5 / 32.0) + uv * (31.0 / 32.0);
  return texture(uMultiScat, uv).rgb;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) / vec2(191.0, 107.0);
  float az = (uv.x - 0.5) * TAU;
  float v = uv.y;
  float lat;
  if (v < 0.5) { float c = 1.0 - 2.0 * v; lat = -c * c * PI * 0.5; }
  else { float c = 2.0 * v - 1.0; lat = c * c * PI * 0.5; }
  vec3 rd = vec3(cos(lat) * cos(az), sin(lat), cos(lat) * sin(az));
  vec3 ro = vec3(0.0, cameraRadius(), 0.0);
  float tG = raySphereNear(ro, rd, Rg);
  float tA = raySphereFar(ro, rd, Rt);
  float tMax = tG > 0.0 ? tG : tA;
  vec3 sunDir = uSunDir.xyz;
  vec3 moonDir = uMoonDir.xyz;
  vec3 sunE = uSunIllum.rgb;
  vec3 moonE = vec3(0.75, 0.85, 1.0) * uSunIllum.w;
  float cS = dot(rd, sunDir);
  float cM = dot(rd, moonDir);
  float pRS = rayleighPhase(cS), pMS = miePhase(cS);
  float pRM = rayleighPhase(cM), pMM = miePhase(cM);
  vec3 L = vec3(0.0);
  vec3 T = vec3(1.0);
  const int N = 36;
  for (int i = 0; i < N; i++) {
    float a0 = float(i) / float(N);
    float a1 = float(i + 1) / float(N);
    float t0 = tMax * a0 * a0;
    float t1 = tMax * a1 * a1;
    float dt = t1 - t0;
    vec3 p = ro + rd * (t0 + 0.3 * dt);
    float pr = length(p);
    vec3 up = p / pr;
    vec3 rs; float ms; vec3 ext;
    mediumAt(pr - Rg, rs, ms, ext);
    vec3 sT = exp(-ext * dt);
    float muS = dot(up, sunDir);
    float muM = dot(up, moonDir);
    float shS = raySphereNear(p, sunDir, Rg) > 0.0 ? 0.0 : 1.0;
    float shM = raySphereNear(p, moonDir, Rg) > 0.0 ? 0.0 : 1.0;
    vec3 S = sunE * (transmittance(pr, muS) * shS * (rs * pRS + ms * pMS) + multiScat(pr, muS) * (rs + ms))
           + moonE * (transmittance(pr, muM) * shM * (rs * pRM + ms * pMM) + multiScat(pr, muM) * (rs + ms));
    L += T * (S - S * sT) / max(ext, vec3(1e-7));
    T *= sT;
  }
  // Cielo encapotado cuando llueve: más gris y oscuro.
  float rain = uMisc.y;
  if (rain > 0.0) {
    float l = dot(L, vec3(0.2126, 0.7152, 0.0722));
    L = mix(L, vec3(l) * vec3(0.92, 0.96, 1.0), 0.75 * rain) * (1.0 - 0.45 * rain);
  }
  outColor = vec4(L, 1.0);
}
`;

/** Irradiancia ambiental: 6 direcciones de eje (+X,-X,+Y,-Y,+Z,-Z), color de niebla y cenit. */
export const IRRADIANCE_FS = /* glsl */ `
${FS_HEADER}
uniform sampler2D uSkyView;
out vec4 outColor;
vec3 sky(vec3 d) {
  d.y = max(d.y, 0.0);
  return texture(uSkyView, skyViewUV(normalize(d + vec3(0.0, 1e-4, 0.0)))).rgb;
}
void main() {
  int idx = int(gl_FragCoord.x);
  vec3 zenith = sky(vec3(0.0, 1.0, 0.0));
  // Radiancia aproximada del suelo (albedo medio del terreno).
  vec3 groundE = uLightColor.rgb * max(uLightDir.y, 0.0) + PI * zenith * 0.8;
  vec3 groundL = vec3(0.16, 0.17, 0.13) / PI * groundE;
  if (idx < 6) {
    vec3 N = idx == 0 ? vec3(1, 0, 0) : idx == 1 ? vec3(-1, 0, 0) : idx == 2 ? vec3(0, 1, 0)
           : idx == 3 ? vec3(0, -1, 0) : idx == 4 ? vec3(0, 0, 1) : vec3(0, 0, -1);
    vec3 up = abs(N.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
    vec3 T = normalize(cross(up, N));
    vec3 B = cross(N, T);
    vec3 E = vec3(0.0);
    const int K = 96;
    for (int k = 0; k < K; k++) {
      // Muestreo coseno con espiral de Fibonacci.
      float u = (float(k) + 0.5) / float(K);
      float r = sqrt(u);
      float phi = float(k) * 2.39996323;
      vec3 d = normalize(T * (r * cos(phi)) + B * (r * sin(phi)) + N * sqrt(1.0 - u));
      E += d.y >= 0.0 ? sky(d) : groundL;
    }
    outColor = vec4(E * PI / float(K), 1.0);
  } else if (idx == 6) {
    vec3 s = vec3(0.0);
    for (int k = 0; k < 16; k++) {
      float a = TAU * (float(k) + 0.5) / 16.0;
      s += sky(normalize(vec3(cos(a), 0.06, sin(a))));
    }
    outColor = vec4(s / 16.0, 1.0);
  } else {
    outColor = vec4(zenith, 1.0);
  }
}
`;

/** Dibujado del cielo en los píxeles de fondo (profundidad = 1). */
export const SKY_FS = /* glsl */ `
${FS_HEADER}
uniform sampler2D uSkyView;
uniform sampler2D uTransmittance;
in vec2 vUV;
out vec4 outColor;

vec3 starField(vec3 rd) {
  // Rotación lenta de la bóveda celeste con la hora del día.
  float a = atan(uSunDir.y, uSunDir.x);
  float c = cos(a), s = sin(a);
  vec3 d = vec3(c * rd.x + s * rd.y, -s * rd.x + c * rd.y, rd.z);
  vec3 p = d * 110.0;
  vec3 cell = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash13(cell);
  if (h < 0.992) return vec3(0.0);
  vec3 offs = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
  float dist = length(f - offs * 0.5);
  float bright = 0.15 + pow((h - 0.992) / 0.008, 4.0) * 1.6;
  float tw = 0.7 + 0.3 * sin(uWind.w * (2.0 + h * 5.0) + h * 100.0);
  vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.88, 0.7), hash13(cell + 3.3));
  return tint * bright * tw * smoothstep(0.22, 0.0, dist);
}

void main() {
  vec3 rel = relFromDepth(vUV, 1.0);
  vec3 rd = normalize(rel);
  vec3 col = farColor(uSkyView, rd);
  float r = cameraRadius();
  vec3 camT = texture(uTransmittance, transmittanceUV(r, max(rd.y, 0.0))).rgb;
  float above = smoothstep(-0.02, 0.01, rd.y);
  // Sol con oscurecimiento de limbo.
  float cosSun = dot(rd, uSunDir.xyz);
  const float SUN_R = 0.0105;
  float sunCos = cos(SUN_R);
  if (cosSun > cos(SUN_R * 1.6)) {
    float x = saturate((1.0 - cosSun) / (1.0 - sunCos));
    float disc = smoothstep(1.08, 0.94, x);
    float limb = pow(max(1.0 - x * x, 0.0), 0.35);
    col += uSunIllum.rgb * camT * disc * limb * 90.0 * above * (1.0 - uMisc.y);
  }
  // Luna con fases.
  float cosMoon = dot(rd, uMoonDir.xyz);
  const float MOON_R = 0.028;
  float night = 1.0 - smoothstep(-0.05, 0.12, uSunDir.y);
  if (cosMoon > cos(MOON_R * 1.3)) {
    vec3 md = uMoonDir.xyz;
    vec3 mt = normalize(cross(vec3(0.0, 0.0, 1.0), md));
    vec3 mb = cross(md, mt);
    vec2 q = vec2(dot(rd - md, mt), dot(rd - md, mb)) / MOON_R;
    float rr = dot(q, q);
    if (rr < 1.0) {
      vec3 n = vec3(q, sqrt(1.0 - rr));
      float phase = uMoonDir.w * TAU;
      vec3 lightDirM = vec3(sin(phase), 0.0, -cos(phase));
      float lit = smoothstep(-0.05, 0.1, dot(n, lightDirM));
      float craters = 0.78 + 0.22 * smoothstep(0.35, 0.6, hash12(floor(q * 7.0 + 20.0)));
      craters *= 0.85 + 0.15 * sin(q.x * 9.0 + 1.3) * sin(q.y * 7.0);
      float edge = smoothstep(1.0, 0.92, rr);
      vec3 moonCol = vec3(0.9, 0.92, 1.0) * craters * (0.03 + lit) * edge;
      col += moonCol * camT * 0.35 * above * (0.4 + 0.6 * night);
    }
  }
  // Estrellas.
  if (night > 0.0 && rd.y > -0.05) col += starField(rd) * night * camT * 0.05;
  outColor = vec4(col, 1.0);
}
`;
