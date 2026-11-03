// Agua y hielo: refracción, absorción física, reflejos en espacio de pantalla (SSR),
// reflejo del cielo, brillo especular del sol y espuma en la orilla.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';
import { TERRAIN_VERTEX_COMMON, LIGHTING } from './terrain';

export const WATER_VS = /* glsl */ `
${COMMON}
${TERRAIN_VERTEX_COMMON}
uniform sampler2D uBiomeMap;
out vec3 vRel;
out vec3 vWorld;
out vec2 vUV;
flat out int vLayer;
flat out int vNormal;
flat out vec4 vProps;
out vec2 vLight;
out vec4 vBiome;

float waveHeight(vec2 p, float t) {
  return sin(p.x * 0.35 + t * 1.1) * 0.5 + sin(p.y * 0.42 - t * 0.9) * 0.35 + sin((p.x + p.y) * 0.8 + t * 1.7) * 0.15;
}

void main() {
  TerrainVertex v = decodeVertex();
  vec3 rel = uChunkOffset + v.local;
  vec3 world = rel + uCamPos.xyz;
  int special = int(v.props.a + 0.5);
  // Los vértices de la superficie del agua ondulan (mismo desplazamiento en caras vecinas).
  if (special == 1 && abs(fract(v.local.y) - 0.875) < 0.01) {
    rel.y += waveHeight(world.xz, uWind.w) * 0.035 - 0.02;
  }
  vRel = rel;
  vWorld = rel + uCamPos.xyz;
  vUV = v.uv;
  vLayer = v.layer;
  vNormal = v.normal;
  vProps = v.props;
  vLight = vec2(v.sky, v.blk);
  vBiome = textureLod(uBiomeMap, world.xz / 1024.0, 0.0);
  gl_Position = uViewProj * vec4(rel, 1.0);
}
`;

export const WATER_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform sampler2D uSceneCopy;
uniform sampler2D uDepthCopy;
uniform sampler2D uSkyView;
uniform sampler2D uWaterNormal;
uniform highp sampler2DArray uAlbedo;

in vec3 vRel;
in vec3 vWorld;
in vec2 vUV;
flat in int vLayer;
flat in int vNormal;
flat in vec4 vProps;
in vec2 vLight;
in vec4 vBiome;
layout(location = 0) out vec4 outColor;

vec3 faceNormal(int n) {
  if (n == 0) return vec3(1, 0, 0);
  if (n == 1) return vec3(-1, 0, 0);
  if (n == 2) return vec3(0, 1, 0);
  if (n == 3) return vec3(0, -1, 0);
  if (n == 4) return vec3(0, 0, 1);
  return vec3(0, 0, -1);
}

vec3 waterNormal(vec2 p, float t, float strength) {
  vec2 a = texture(uWaterNormal, p / 11.0 + vec2(t * 0.019, t * 0.011)).xy * 2.0 - 1.0;
  vec2 b = texture(uWaterNormal, p / 6.1 + vec2(-t * 0.015, t * 0.024)).xy * 2.0 - 1.0;
  vec2 c = texture(uWaterNormal, p / 27.0 + vec2(t * 0.007, -t * 0.012)).xy * 2.0 - 1.0;
  vec2 d = texture(uWaterNormal, p / 2.3 + vec2(t * 0.03, t * 0.021)).xy * 2.0 - 1.0;
  vec2 s = a * 0.45 + b * 0.3 + c * 0.55 + d * 0.12 * (1.0 + uMisc.y * 3.0);
  return normalize(vec3(s.x * strength, 1.0, s.y * strength));
}

vec3 skyColor(vec3 d) {
  vec3 l = normalize(vec3(d.x, max(d.y, 0.0) + 0.002, d.z));
  return texture(uSkyView, skyViewUV(l)).rgb;
}

vec3 traceSSR(vec3 origin, vec3 R, float jitter, out float hit) {
  hit = 0.0;
  int steps = int(uQuality.z);
  if (steps <= 0) return vec3(0.0);
  float stepLen = 0.35 + jitter * 0.35;
  vec3 p = origin;
  for (int i = 0; i < 64; i++) {
    if (i >= steps) break;
    vec3 prev = p;
    p += R * stepLen;
    vec4 clip = uViewProj * vec4(p, 1.0);
    if (clip.w <= 0.05) break;
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) break;
    float sceneLin = linearDepth(texture(uDepthCopy, uv).r);
    float diff = clip.w - sceneLin;
    if (diff > 0.0 && diff < stepLen * 2.5 + 0.4) {
      vec3 a = prev;
      vec3 b = p;
      for (int j = 0; j < 6; j++) {
        vec3 m = (a + b) * 0.5;
        vec4 cm = uViewProj * vec4(m, 1.0);
        vec2 um = cm.xy / cm.w * 0.5 + 0.5;
        if (cm.w > linearDepth(texture(uDepthCopy, um).r)) b = m; else a = m;
      }
      vec4 cb = uViewProj * vec4(b, 1.0);
      vec2 huv = cb.xy / cb.w * 0.5 + 0.5;
      vec2 edge = smoothstep(0.0, 0.08, huv) * smoothstep(1.0, 0.92, huv);
      hit = edge.x * edge.y * (1.0 - float(i) / float(steps));
      return texture(uSceneCopy, huv).rgb;
    }
    stepLen *= 1.16;
  }
  return vec3(0.0);
}

void main() {
  int special = int(vProps.a + 0.5);
  bool isWater = special == 1;
  vec3 V = normalize(-vRel);
  float dist = length(vRel);
  vec3 Nf = faceNormal(vNormal);
  bool fromBelow = dot(V, Nf) < 0.0;
  float t = uWind.w;

  vec3 n;
  if (isWater) {
    if (vNormal == 2 || vNormal == 3) {
      float strength = mix(0.55, 0.18, saturate(dist / 90.0));
      // Agua en pendiente (fluyendo): la normal geométrica marca la dirección de la corriente.
      vec3 gN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
      if (gN.y < 0.0) gN = -gN;
      float flowAmt = vNormal == 2 ? smoothstep(0.9997, 0.996, gN.y) : 0.0;
      vec2 flow = flowAmt > 0.0 ? normalize(gN.xz) : vec2(0.0);
      n = waterNormal(vWorld.xz - flow * t * 1.6, t * (1.0 - flowAmt * 0.6), strength * (1.0 + flowAmt * 0.8));
      if (flowAmt > 0.0) n = normalize(mix(n, normalize(n + (gN - vec3(0.0, 1.0, 0.0)) * 1.5), flowAmt));
      if (vNormal == 3) n.y = -n.y;
    } else {
      // Caras laterales (cascadas y bordes de corriente): el patrón baja con el tiempo.
      vec3 wn = waterNormal(vWorld.xz * 0.5 + vec2(vWorld.y + t * 2.2), t, 0.45);
      n = normalize(Nf + vec3(wn.x, 0.0, wn.z) * 0.35);
    }
  } else {
    n = Nf;
  }
  if (fromBelow) n = -n;

  vec2 suv = gl_FragCoord.xy * uRes.zw;
  float surfLin = linearDepth(gl_FragCoord.z);
  float rayScale = dist / max(surfLin, 1e-3);

  // Refracción con distorsión por la normal (se anula si golpea algo delante del agua).
  vec2 refrOffset = (n.xz - Nf.xz) * 0.06 / (1.0 + surfLin * 0.03);
  if (!isWater) refrOffset *= 0.3;
  vec2 ruv = suv + refrOffset;
  float rLin = linearDepth(texture(uDepthCopy, ruv).r);
  if (rLin < surfLin) {
    ruv = suv;
    rLin = linearDepth(texture(uDepthCopy, ruv).r);
  }
  vec3 refracted = texture(uSceneCopy, ruv).rgb;
  float thickness = max(rLin - surfLin, 0.0) * rayScale;

  // Sombra y luz directa sobre la superficie.
  vec4 sc = shadowCoord(vRel, Nf);
  float shadow = uLightColor.r + uLightColor.g + uLightColor.b > 1e-4 ? sampleShadow(sc, gl_FragCoord.xy, 1.5) : 0.0;
  vec3 lightCol = uLightColor.rgb * shadow * cloudShadow(vWorld);
  float skyF = skyLightCurve(vLight.x);
  vec3 ambient = ambientCube(vec3(0.0, 1.0, 0.0)) * skyF + blockLightTinted(vLight.y, vLight.x);

  vec3 color;
  if (isWater) {
    // Absorción: el rojo se pierde primero (aguas someras turquesa, profundas azul oscuro).
    float warm = vBiome.a;
    vec3 absorb = mix(vec3(0.52, 0.11, 0.075), vec3(0.42, 0.065, 0.055), warm);
    vec3 scatterAlb = mix(vec3(0.010, 0.040, 0.060), vec3(0.012, 0.070, 0.070), warm);
    vec3 below;
    if (!fromBelow) {
      vec3 Tw = exp(-absorb * thickness);
      vec3 inLight = ambient + lightCol * max(uLightDir.y, 0.0) * 0.8;
      below = refracted * Tw + scatterAlb * inLight * (1.0 - Tw);
    } else {
      below = refracted;
    }
    // Reflejo: SSR + cielo (atenuado bajo techo según la luz de cielo).
    vec3 R = reflect(-V, n);
    if (!fromBelow) R.y = abs(R.y);
    float hit = 0.0;
    vec3 ssr = fromBelow ? vec3(0.0) : traceSSR(vRel + n * 0.05, R, ign(gl_FragCoord.xy), hit);
    vec3 envRefl = fromBelow ? scatterAlb * ambient * 0.5 : skyColor(R) * skyF + ambient * 0.02;
    vec3 refl = mix(envRefl, ssr, hit);
    float NdotV = saturate(dot(n, V));
    float F = F_SchlickScalar(0.02, NdotV);
    if (fromBelow) {
      // Reflexión total interna más allá del ángulo crítico (n = 1.33).
      float sinT2 = (1.0 - NdotV * NdotV) * 1.77;
      F = sinT2 > 1.0 ? 1.0 : mix(F, 1.0, smoothstep(0.7, 1.0, sinT2));
    }
    color = mix(below, refl, F);
    // Brillo del sol (GGX muy liso).
    if (!fromBelow) color += specularGGX(n, V, uLightDir.xyz, 0.08, vec3(0.02)) * lightCol * 1.5;
    // Espuma suave en la orilla.
    if (!fromBelow && vNormal == 2) {
      float foamN = texture(uWaterNormal, vWorld.xz / 3.0 + t * 0.02).b;
      float foam = smoothstep(0.35, 0.0, thickness) * smoothstep(0.35, 0.75, foamN + 0.25 * sin(t * 1.5 + vWorld.x * 0.7));
      color = mix(color, (ambient + lightCol * max(uLightDir.y, 0.0)) * 0.55 / PI, foam * 0.55);
    }
  } else {
    // Hielo: superficie translúcida con textura.
    vec4 alb = textureGrad(uAlbedo, vec3(pixelArtUV(vUV, 16.0), float(vLayer)), dFdx(vUV), dFdy(vUV));
    // Fase 6.5 (colores): el cristal de color (special 4) tiñe más y no tiene la absorción azulada del hielo.
    bool stained = special == 4;
    vec3 tint = mix(vec3(1.0), alb.rgb, stained ? 0.9 : 0.75);
    vec3 Tw = stained ? vec3(1.0) : exp(-vec3(0.25, 0.12, 0.08) * min(thickness, 6.0));
    vec3 below = refracted * tint * Tw;
    vec3 diffuseIce = alb.rgb / PI * (ambient + lightCol * max(dot(Nf, uLightDir.xyz), 0.0));
    below = mix(below, diffuseIce, alb.a * (stained ? 0.6 : 0.45));
    vec3 R = reflect(-V, n);
    float F = F_SchlickScalar(0.03, saturate(dot(n, V)));
    color = mix(below, skyColor(R) * skyF, F) + specularGGX(n, V, uLightDir.xyz, 0.12, vec3(0.03)) * lightCol;
  }
  outColor = vec4(color, 1.0);
}
`;

export const WATER_SHADOW_VS = /* glsl */ `
${COMMON}
${TERRAIN_VERTEX_COMMON}
void main() {
  TerrainVertex v = decodeVertex();
  vec3 rel = uChunkOffset + v.local;
  vec4 p = uShadowMat * vec4(rel + uShadowOffset.xyz, 1.0);
  p.xy = distortShadow(p.xy);
  // Sólo nos interesa la superficie del agua (el hielo también bloquea).
  gl_Position = p;
}
`;

export const WATER_SHADOW_FS = /* glsl */ `
out vec4 outColor;
void main() { outColor = vec4(1.0); }
`;

/** Genera un mapa de normales de agua periódico (256x256): ruido fractal repetible + mar de fondo. */
export const WATER_NORMAL_GEN_FS = /* glsl */ `
in vec2 vUV;
out vec4 outColor;
const float TAU2 = 6.28318530718;
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy) * 2.0 - 1.0;
}
// Ruido de gradiente 2D periódico (período en celdas).
float gnoise(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(mod(i, period)), f);
  float b = dot(hash22(mod(i + vec2(1.0, 0.0), period)), f - vec2(1.0, 0.0));
  float c = dot(hash22(mod(i + vec2(0.0, 1.0), period)), f - vec2(0.0, 1.0));
  float d = dot(hash22(mod(i + vec2(1.0, 1.0), period)), f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float h(vec2 p) {
  float s = 0.0;
  float amp = 0.5;
  float freq = 6.0;
  for (int o = 0; o < 6; o++) {
    // Ondas "afiladas" (valor absoluto invertido) para crestas más naturales.
    float n = gnoise(p * freq + float(o) * 7.13, freq);
    s += (0.55 - abs(n)) * amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  s += sin(TAU2 * (p.x * 2.0 + p.y * 1.0) + 1.3) * 0.12;
  s += sin(TAU2 * (p.x * -1.0 + p.y * 3.0) + 0.4) * 0.08;
  return s;
}
void main() {
  vec2 p = vUV;
  float e = 1.0 / 256.0;
  float hx = (h(p + vec2(e, 0.0)) - h(p - vec2(e, 0.0))) / (2.0 * e);
  float hy = (h(p + vec2(0.0, e)) - h(p - vec2(0.0, e))) / (2.0 * e);
  vec3 n = normalize(vec3(-hx * 0.012, -hy * 0.012, 1.0));
  float foam = clamp(h(p * 2.0 + 0.3) * 0.9 + 0.5, 0.0, 1.0);
  outColor = vec4(n.xy * 0.5 + 0.5, foam, h(p) * 0.5 + 0.5);
}
`;
