// Fragmentos GLSL compartidos.

/** Bloque uniforme por frame (std140). Debe coincidir con FrameUniforms en Renderer.ts. */
export const FRAME_UBO = /* glsl */ `
layout(std140) uniform Frame {
  mat4 uView;
  mat4 uProj;
  mat4 uViewProj;
  mat4 uInvViewProj;
  mat4 uPrevViewProj;
  mat4 uShadowMat;
  vec4 uCamPos;       // xyz posición de cámara, w = tiempo (s, envuelto)
  vec4 uShadowOffset; // xyz = cámara - origen de sombras, w = distancia de sombras
  vec4 uSunDir;       // xyz dirección al sol, w = factor de día (0..1)
  vec4 uMoonDir;      // xyz dirección a la luna, w = fase (0..1)
  vec4 uLightDir;     // xyz dirección de la luz que proyecta sombras, w = 1 si es el sol
  vec4 uLightColor;   // rgb iluminancia directa en el suelo (tras la atmósfera), w = luz filtrada bajo el agua (0..1)
  vec4 uSunIllum;     // rgb iluminancia solar fuera de la atmósfera, w = iluminancia lunar
  vec4 uFog;          // x = densidad de niebla, y = caída con la altura, z/w = inicio/fin de niebla de borde
  vec4 uRes;          // xy = tamaño, zw = 1/tamaño
  vec4 uJitter;       // xy = jitter actual (NDC), zw = jitter anterior
  vec4 uMisc;         // x = frame, y = lluvia, z = bajo el agua, w = exposición al cielo del ojo
  vec4 uCloud;        // x = cobertura, y = base, z = techo, w = densidad
  vec4 uWind;         // xy = desplazamiento del viento de nubes, z = fuerza del viento en plantas, w = tiempo continuo
  vec4 uQuality;      // x = tamaño del mapa de sombras, y = muestras PCF, z = pasos SSR, w = pasos volumétricos
  vec4 uNearFar;      // x = near, y = far, z = tan(fov/2), w = aspecto
  vec4 uDim;          // Fase 8 (dimensiones): x = hay cielo (sol, luna, luz del cielo), y = altura de su mar de lava (0: no), z = densidad de su niebla, w = el canal del cielo lleva la luz de alma (sin luz del cielo)
  vec4 uDimFog;       // rgb = color de la niebla y del fondo sin cielo (lineal), w = cielo del End
  vec4 uDimAmb;       // rgb = luz mínima de todo sin cielo (la penumbra del Nether)
  vec4 uEndFlash;     // Fase 8.6: xyz = dirección del destello del End, w = su intensidad (0..1)
};
`;

export const COMMON = /* glsl */ `
${FRAME_UBO}
#define PI 3.14159265359
#define TAU 6.28318530718

float saturate(float x) { return clamp(x, 0.0, 1.0); }
vec2 saturate(vec2 x) { return clamp(x, 0.0, 1.0); }
vec3 saturate(vec3 x) { return clamp(x, 0.0, 1.0); }
vec4 saturate(vec4 x) { return clamp(x, 0.0, 1.0); }
vec3 saturate3(vec3 x) { return clamp(x, 0.0, 1.0); }
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
/** Luz mínima (para que la oscuridad total no sea negro puro); Fase 8: la penumbra de las dimensiones sin cielo. */
vec3 minAmbient() { return mix(vec3(0.012, 0.013, 0.016), uDimAmb.rgb, 1.0 - uDim.x); }
/**
 * Fase 8 (entorno del Nether): la luz de fondo sin cielo según la cara y la altura: la penumbra del bioma, algo más
 * por arriba que por los lados, y el resplandor del mar de lava que sube desde abajo (más cerca de su altura y en
 * las caras que miran hacia abajo: los techos y los salientes se tiñen de naranja).
 */
vec3 minAmbientAt(vec3 n, float y) {
  if (uDim.x > 0.5) return vec3(0.012, 0.013, 0.016);
  vec3 a = uDimAmb.rgb * (0.8 + 0.2 * n.y);
  if (uDim.y > 0.0) a += vec3(1.0, 0.36, 0.09) * 0.06 * exp(-max(y - uDim.y, 0.0) / 22.0) * (0.55 - 0.45 * n.y);
  return a;
}
// Bajo el agua abierta: luz del sol y del cielo que llega filtrada por el agua (azul verdosa).
vec3 underwaterLight(vec3 skyUp) {
  return (uLightColor.rgb * max(uLightDir.y, 0.0) * 0.45 + skyUp * 0.8) * vec3(0.3, 0.8, 0.95) * uLightColor.w;
}
float sq(float x) { return x * x; }

// Ruido de gradiente entrelazado (Jimenez) con desplazamiento temporal para el TAA.
float ign(vec2 p) {
  p += 5.588238 * mod(uMisc.x, 64.0);
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}
float ignStatic(vec2 p) {
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

/** Posición relativa a la cámara a partir de UV de pantalla y profundidad [0,1]. */
vec3 relFromDepth(vec2 uv, float depth) {
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 p = uInvViewProj * ndc;
  return p.xyz / p.w;
}

float linearDepth(float d) {
  float n = uNearFar.x, f = uNearFar.y;
  float z = d * 2.0 - 1.0;
  return 2.0 * n * f / (f + n - z * (f - n));
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

// ---------------------------------------------------------------- texturas pixel art
// Muestreo "pixel art": texels nítidos al ampliar (con borde antialiasado) y filtrado
// anisótropo/mipmaps al reducir, independiente del backend (ANGLE/D3D11 ignora MAG=NEAREST
// cuando hay anisotropía).
/** Igual que pixelArtUV pero con el ancho de filtro precalculado (usable en bucles). */
vec2 pixelArtUVw(vec2 uv, float size, vec2 w) {
  vec2 p = uv * size;
  vec2 seam = floor(p + 0.5);
  p = seam + clamp((p - seam) / w, -0.5, 0.5);
  return p / size;
}
#ifdef IS_FRAGMENT
vec2 pixelArtUV(vec2 uv, float size) {
  return pixelArtUVw(uv, size, max(fwidth(uv * size), vec2(1e-4)));
}
#endif

// ---------------------------------------------------------------- sombras
#define SHADOW_DISTORT 0.85
vec2 distortShadow(vec2 p) {
  float d = length(p);
  return p / (d * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT));
}
/** Magnificación local del mapa de sombras en la posición p (sin distorsionar). */
float shadowMagnification(vec2 p) {
  float d = length(p);
  float k = d * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT);
  return (1.0 - SHADOW_DISTORT) / (k * k);
}

// ---------------------------------------------------------------- BRDF
float D_GGX(float NdotH, float a) {
  float a2 = a * a;
  float d = NdotH * NdotH * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d + 1e-7);
}
float V_SmithGGX(float NdotV, float NdotL, float a) {
  float a2 = a * a;
  float gv = NdotL * sqrt(NdotV * NdotV * (1.0 - a2) + a2);
  float gl = NdotV * sqrt(NdotL * NdotL * (1.0 - a2) + a2);
  return 0.5 / (gv + gl + 1e-6);
}
vec3 F_Schlick(vec3 f0, float VdotH) {
  float f = pow(1.0 - VdotH, 5.0);
  return f0 + (1.0 - f0) * f;
}
float F_SchlickScalar(float f0, float c) {
  return f0 + (1.0 - f0) * pow(1.0 - c, 5.0);
}
vec3 specularGGX(vec3 N, vec3 V, vec3 L, float rough, vec3 f0) {
  vec3 H = normalize(V + L);
  float NdotL = saturate(dot(N, L));
  float NdotV = max(dot(N, V), 1e-4);
  float NdotH = saturate(dot(N, H));
  float VdotH = saturate(dot(V, H));
  float a = max(rough * rough, 0.002);
  return D_GGX(NdotH, a) * V_SmithGGX(NdotV, NdotL, a) * F_Schlick(f0, VdotH) * NdotL;
}
float phaseHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-4), 1.5));
}

/** Iluminancia de luz de bloque (antorchas) para un nivel 0..1. */
vec3 blockLightColor(float level) {
  float l = level * level;
  float i = l * l * 3.2 + l * 0.35;
  return vec3(1.0, 0.58, 0.28) * i;
}
/**
 * Fase 8 (entorno del Nether): luz de bloque con su tono. Sin luz del cielo, ese canal lleva la luz de alma: donde
 * manda ella (fuego, antorchas y faroles de alma), la luz es turquesa en vez de naranja (Java la pinta igual).
 */
vec3 blockLightTinted(float level, float soul) {
  vec3 c = blockLightColor(level);
  if (uDim.w < 0.5 || soul <= 0.0) return c; // Fase 8.6: sólo donde ese canal es la luz de alma (el Nether)
  float share = smoothstep(level - 0.2, level, soul);
  // Más suave con la distancia que la naranja (llega más lejos) y algo más fuerte: el suelo de alrededor se tiñe.
  float s2 = soul * soul;
  vec3 soulC = vec3(0.26, 0.76, 1.0) * (s2 * s2 * 3.6 + s2 * 0.9);
  return mix(c, soulC, share);
}
`;
