// Shaders del terreno: pasada principal (opaca y con recorte), pasada de sombras y agua.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';

/** Decodificación del vértice empaquetado y viento en hojas/plantas. */
export const TERRAIN_VERTEX_COMMON = /* glsl */ `
layout(location = 0) in uvec2 aData;
uniform vec3 uChunkOffset;
uniform highp sampler2D uLayerProps;

struct TerrainVertex {
  vec3 local;
  vec2 uv;
  int layer;
  int normal;
  float ao;
  float sky;
  float blk;
  vec4 props;
};

TerrainVertex decodeVertex() {
  TerrainVertex v;
  uint a = aData.x;
  uint b = aData.y;
  v.local = vec3(float(a & 511u) - 16.0, float((a >> 18) & 8191u), float((a >> 9) & 511u) - 16.0) / 16.0;
  v.uv = vec2(float(b & 31u), float((b >> 5) & 31u)) / 16.0;
  v.layer = int(((b >> 10) & 511u) | ((a >> 31) << 9));
  v.normal = int((b >> 19) & 7u);
  v.ao = float((b >> 22) & 3u) / 3.0;
  v.sky = float((b >> 24) & 15u) / 15.0;
  v.blk = float((b >> 28) & 15u) / 15.0;
  v.props = texelFetch(uLayerProps, ivec2(v.layer, 0), 0) * 255.0;
  return v;
}

vec3 windOffset(TerrainVertex v, vec3 world) {
  float wave = v.props.g;
  if (wave < 0.5) return vec3(0.0);
  float t = uCamPos.w;
  float strength = uWind.z * smoothstep(0.35, 0.9, v.sky) * uDim.x; // Fase 8: sin cielo, ese canal es la luz de alma
  if (strength <= 0.0) return vec3(0.0);
  if (wave < 1.5) {
    // Hojas: vaivén suave coherente entre bloques vecinos (depende sólo de la posición).
    float ph = world.x * 0.7 + world.z * 0.45 + world.y * 0.35;
    return vec3(sin(t * 1.7 + ph) * 0.045, sin(t * 2.3 + ph * 1.3) * 0.02, cos(t * 1.4 + ph * 0.9) * 0.045) * strength;
  }
  // Plantas: sólo se mueven los vértices superiores.
  if (v.uv.y > 0.01) return vec3(0.0);
  float ph = world.x * 0.5 + world.z * 0.35;
  float gust = 0.6 + 0.4 * sin(t * 0.37 + world.x * 0.03 + world.z * 0.02);
  return vec3(
    (sin(t * 1.9 + ph) + 0.35 * sin(t * 4.1 + ph * 2.3)) * 0.1,
    0.0,
    (cos(t * 1.6 + ph * 1.1) + 0.3 * cos(t * 3.7 + ph * 1.7)) * 0.08
  ) * strength * gust;
}
`;

export const TERRAIN_VS = /* glsl */ `
${COMMON}
${TERRAIN_VERTEX_COMMON}
uniform sampler2D uBiomeMap;
out vec3 vRel;
out vec3 vWorld;
out vec2 vUV;
flat out int vLayer;
flat out int vNormal;
flat out vec4 vProps;
out float vAO;
out vec2 vLight;
out vec4 vBiome;

void main() {
  TerrainVertex v = decodeVertex();
  vec3 rel = uChunkOffset + v.local;
  vec3 world = rel + uCamPos.xyz;
  rel += windOffset(v, world);
  vRel = rel;
  vWorld = rel + uCamPos.xyz;
  vUV = v.uv;
  vLayer = v.layer;
  vNormal = v.normal;
  vProps = v.props;
  vAO = v.ao;
  vLight = vec2(v.sky, v.blk);
  vBiome = textureLod(uBiomeMap, world.xz / 1024.0, 0.0);
  gl_Position = uViewProj * vec4(rel, 1.0);
}
`;

/** Iluminación compartida por terreno, agua y entidades. */
export const LIGHTING = /* glsl */ `
uniform sampler2DShadow uShadowMap;
uniform sampler2D uWaterShadow;
uniform sampler2D uIrradiance;
uniform sampler2D uCloudWeather;

const vec2 VOGEL[16] = vec2[16](
  vec2(0.1767767, 0.0), vec2(-0.2279, 0.2085), vec2(0.0379, -0.4174), vec2(0.3232, 0.3547),
  vec2(-0.5409, -0.0799), vec2(0.4926, -0.3419), vec2(-0.1415, 0.6451), vec2(-0.3577, -0.6106),
  vec2(0.7155, 0.1916), vec2(-0.7187, 0.3223), vec2(0.2786, -0.7704), vec2(0.2918, 0.8052),
  vec2(-0.7872, -0.4191), vec2(0.8791, -0.2394), vec2(-0.4839, 0.8043), vec2(-0.1957, -0.9435)
);

/** Coordenadas en el mapa de sombras (xy distorsionado en [0,1], z profundidad) y magnificación. */
vec4 shadowCoord(vec3 rel, vec3 N) {
  vec4 sp = uShadowMat * vec4(rel + uShadowOffset.xyz, 1.0);
  float mag = shadowMagnification(sp.xy);
  // Desplazamiento según la normal proporcional al tamaño del texel en ese punto.
  float texelWorld = (2.0 * uShadowOffset.w / uQuality.x) / mag;
  float NdotL = dot(N, uLightDir.xyz);
  vec3 offs = N * texelWorld * (1.2 + 1.5 * (1.0 - saturate(NdotL)));
  sp = uShadowMat * vec4(rel + uShadowOffset.xyz + offs, 1.0);
  vec2 d = distortShadow(sp.xy);
  return vec4(d * 0.5 + 0.5, sp.z * 0.5 + 0.5, mag);
}

float sampleShadow(vec4 sc, vec2 pixel, float radiusTexels) {
  if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0) return 1.0;
  float bias = 0.00012;
  float ref = sc.z - bias;
  int n = int(uQuality.y);
  if (n <= 1) return texture(uShadowMap, vec3(sc.xy, ref));
  float ang = ign(pixel) * TAU;
  float ca = cos(ang), sa = sin(ang);
  mat2 rot = mat2(ca, sa, -sa, ca);
  float texel = 1.0 / uQuality.x;
  float sum = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= n) break;
    vec2 o = rot * VOGEL[i] * radiusTexels * texel;
    sum += texture(uShadowMap, vec3(sc.xy + o, ref));
  }
  return sum / float(n);
}

/** Cantidad de agua (en metros) entre el punto y la superficie iluminada por el sol. */
float waterDepthToLight(vec4 sc) {
  if (sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0) return 0.0;
  float wd = texture(uWaterShadow, sc.xy).r;
  float diff = sc.z - wd;
  if (diff <= 0.0004) return 0.0;
  return diff * 2.0 * 256.0;
}

/** Cáusticas de agua (patrón procedural animado). */
float caustics(vec2 p, float t) {
  vec2 q = mod(p, TAU) - 250.0;
  vec2 i = q;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = q + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(q.x / (sin(i.x + tt) / inten), q.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}

/** Cobertura de nubes proyectada sobre el suelo (sombras de nubes). */
float cloudShadow(vec3 world) {
  if (uLightDir.y < 0.05 || uCloud.x <= 0.01) return 1.0;
  float h = mix(uCloud.y, uCloud.z, 0.35);
  float t = (h - world.y) / uLightDir.y;
  vec2 p = world.xz + uLightDir.xz * t + uWind.xy;
  float w = texture(uCloudWeather, p / 9000.0).r;
  float n = texture(uCloudWeather, p / 1400.0 + 0.37).g;
  float cov = saturate(uCloud.x + (w - 0.5) * 0.7);
  float d = saturate((n * 0.6 + w * 0.4 - (1.0 - cov)) * 3.0);
  return mix(1.0, 0.22, smoothstep(0.0, 0.7, d) * saturate(uLightDir.y * 5.0));
}

/** Irradiancia del cielo para una normal (cubo ambiental de 6 direcciones). */
vec3 ambientCube(vec3 n) {
  vec3 n2 = n * n;
  vec3 px = texelFetch(uIrradiance, ivec2(n.x >= 0.0 ? 0 : 1, 0), 0).rgb;
  vec3 py = texelFetch(uIrradiance, ivec2(n.y >= 0.0 ? 2 : 3, 0), 0).rgb;
  vec3 pz = texelFetch(uIrradiance, ivec2(n.z >= 0.0 ? 4 : 5, 0), 0).rgb;
  return px * n2.x + py * n2.y + pz * n2.z;
}

/** Curva de la luz del cielo (0..1 → factor). */
float skyLightCurve(float s) {
  return s * s * (0.35 + 0.65 * s) * uDim.x; // Fase 8: sin cielo no hay luz del cielo
}
`;

export const TERRAIN_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform highp sampler2DArray uAlbedo;
uniform highp sampler2DArray uNormalTex;
uniform highp sampler2DArray uSpecular;
uniform sampler2D uSkyView;
uniform float uPom;

in vec3 vRel;
in vec3 vWorld;
in vec2 vUV;
flat in int vLayer;
flat in int vNormal;
flat in vec4 vProps;
in float vAO;
in vec2 vLight;
in vec4 vBiome;
layout(location = 0) out vec4 outColor;

void faceFrame(int n, out vec3 N, out vec3 T, out vec3 B) {
  if (n == 0) { N = vec3(1, 0, 0); T = vec3(0, 0, -1); B = vec3(0, 1, 0); }
  else if (n == 1) { N = vec3(-1, 0, 0); T = vec3(0, 0, 1); B = vec3(0, 1, 0); }
  else if (n == 2) { N = vec3(0, 1, 0); T = vec3(1, 0, 0); B = vec3(0, 0, -1); }
  else if (n == 3) { N = vec3(0, -1, 0); T = vec3(1, 0, 0); B = vec3(0, 0, 1); }
  else if (n == 4) { N = vec3(0, 0, 1); T = vec3(1, 0, 0); B = vec3(0, 1, 0); }
  else if (n == 5) { N = vec3(0, 0, -1); T = vec3(-1, 0, 0); B = vec3(0, 1, 0); }
  else { N = vec3(0, 1, 0); T = vec3(1, 0, 0); B = vec3(0, 0, -1); }
}

// Fase 8.6 (el End): el velo del portal del End. En Java es un dibujo en pantalla (16 capas de la textura de
// estrellas giradas y desplazadas sobre el cielo del End): no tiene hondura. Aquí cada capa está de verdad a una
// profundidad bajo la superficie y se ve con paralaje al mover la cámara: un pozo de estrellas que se hunde, con
// los colores de las capas de Java (de un turquesa oscuro a un azul vivo), una nebulosa honda que deriva y estrellas
// que titilan.
const vec3 END_LAYER[16] = vec3[16](
  vec3(0.022087, 0.098399, 0.110818), vec3(0.011892, 0.095924, 0.089485), vec3(0.027636, 0.101689, 0.100326),
  vec3(0.046564, 0.109883, 0.114838), vec3(0.064901, 0.117696, 0.097189), vec3(0.063761, 0.086895, 0.123646),
  vec3(0.084817, 0.111994, 0.166380), vec3(0.097489, 0.154120, 0.091064), vec3(0.106152, 0.131144, 0.195191),
  vec3(0.097721, 0.110188, 0.187229), vec3(0.133516, 0.138278, 0.148582), vec3(0.070006, 0.243332, 0.235792),
  vec3(0.196766, 0.142899, 0.214696), vec3(0.047281, 0.315338, 0.321970), vec3(0.204675, 0.390010, 0.302066),
  vec3(0.080955, 0.314821, 0.661491)
);
vec3 endHash3(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
vec3 endPortalSky(vec3 world, vec3 view, vec3 N, vec3 T, vec3 B, float t) {
  // Coordenadas en el plano de la cara y, por cada bloque de hondura (hacia dentro de la cara), cuánto se desplaza lo
  // que se ve (mirando de lado, más; se limita la rasante).
  float vn = max(abs(dot(view, N)), 0.12);
  vec2 base = vec2(dot(world, T), dot(world, B));
  vec2 slide = vec2(dot(view, T), dot(view, B)) / vn;
  // Fondo: el vacío verdoso con una nebulosa que deriva despacio a mucha hondura.
  vec2 deep = base + slide * 9.0;
  float neb = texture(uCloudWeather, deep / 26.0 + vec2(t * 0.004, -t * 0.003)).g;
  float neb2 = texture(uCloudWeather, deep / 9.0 - vec2(t * 0.007, t * 0.005)).g;
  vec3 col = END_LAYER[0] * 0.06 + mix(vec3(0.004, 0.018, 0.024), vec3(0.020, 0.008, 0.030), neb2) * smoothstep(0.4, 0.8, neb) * 0.35;
  float pxw = max(fwidth(base.x) + fwidth(base.y), 1e-3);
  for (int i = 1; i < 16; i++) {
    float fi = float(i);
    float depth = 0.25 + fi * 0.45;
    vec2 p = base + slide * depth;
    float a = (fi * fi * 4321.0 + fi * 9.0) * 0.0349 + t * 0.012 * (1.0 + fi * 0.15);
    float ca = cos(a), sa = sin(a);
    p = mat2(ca, sa, -sa, ca) * p + vec2(17.0 / fi, (2.0 + fi / 1.5) * t * 0.02);
    float dens = 1.1 + fi * 0.22;
    vec2 q = p * dens;
    vec2 cell = floor(q);
    vec3 h = endHash3(cell + fi * 57.31);
    if (h.z < 0.8) continue;
    vec2 f = fract(q) - (0.2 + 0.6 * h.xy);
    float size = 0.025 + 0.12 * (h.z - 0.8);
    // Borde suave en píxeles de pantalla (sin parpadeo del TAA lejos).
    float aa = pxw * dens * (1.0 + depth * 0.25);
    float d = length(f);
    // Lo que se pierde por el borde suave se devuelve en brillo: de lejos las estrellas no se apagan ni se llenan.
    float star = smoothstep(size + aa, size * 0.3, d) * min(1.0, size / max(aa, 1e-4));
    float glow = exp(-d * d / (size * size * 4.0)) * 0.05;
    float tw = 0.6 + 0.4 * sin(t * (1.5 + h.x * 3.0) + h.y * 40.0);
    float fade = 1.0 - fi / 19.0;
    col += END_LAYER[i] * (star * 5.0 + glow) * tw * fade;
  }
  return col;
}

void main() {
  vec2 uv = vUV;
  int special = int(vProps.a + 0.5);
  if (special == 6) {
    vec3 pN, pT, pB;
    faceFrame(vNormal, pN, pT, pB);
    outColor = vec4(endPortalSky(vWorld, normalize(vRel), pN, pT, pB, uCamPos.w) * 1.4, 1.0);
    return;
  }
  if (special == 2) {
    // Lava: flujo lento de la textura; en pendiente avanza en la dirección de la corriente.
    vec3 gN = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (gN.y < 0.0) gN = -gN;
    float flowAmt = vNormal == 2 ? smoothstep(0.9997, 0.996, gN.y) : 0.0;
    if (flowAmt > 0.0) uv -= normalize(gN.xz) * uCamPos.w * 0.12 * flowAmt;
    else if (vNormal != 2 && vNormal != 3) uv.y -= uCamPos.w * 0.25;
    else uv += vec2(sin(uCamPos.w * 0.15 + vWorld.z * 0.1) * 0.05, uCamPos.w * 0.035);
  }
  // Fase 6.5 (equipo): fuego: las llamas suben, ondulan y su borde de arriba parpadea.
  bool fireCut = false;
  if (special == 5) {
    float ft = uCamPos.w;
    float up = 1.0 - vUV.y;
    float col = floor(vUV.x * 8.0);
    float seed = dot(floor(vWorld + 0.001), vec3(1.7, 2.3, 3.1));
    uv.x += sin(vUV.y * 9.0 + ft * 7.0 + seed) * 0.04 * up;
    uv.y += ft * 1.3;
    float env = 0.62 + 0.3 * sin(ft * 6.3 + col * 1.9 + seed) * sin(ft * 3.1 + col * 0.7 + seed * 1.3);
    fireCut = up > env;
  }
  vec2 gdx = dFdx(uv), gdy = dFdy(uv);
  vec2 fw = max(fwidth(uv * 16.0), vec2(1e-4));
  vec3 N, T, B;
  faceFrame(vNormal, N, T, B);
  bool plant = vNormal == 6;
#ifndef CUTOUT
  // Parallax occlusion mapping: relieve real de los píxeles a corta distancia.
  float viewDist = length(vRel);
  if (uPom > 0.5 && !plant && special == 0 && viewDist < 18.0) {
    vec3 V0 = -vRel / viewDist;
    vec3 Vt = vec3(dot(V0, T), dot(V0, B), dot(V0, N));
    if (Vt.z > 0.05) {
      const int STEPS = 20;
      float scale = 0.07 * (1.0 - smoothstep(12.0, 18.0, viewDist));
      vec2 P = vec2(Vt.x, -Vt.y) / max(Vt.z, 0.3) * scale;
      vec2 delta = P / float(STEPS);
      float layerD = 1.0 / float(STEPS);
      float cur = 0.0;
      vec2 cuv = uv;
      float lay = float(vLayer);
      float d = 1.0 - textureGrad(uNormalTex, vec3(pixelArtUVw(cuv, 16.0, fw), lay), gdx, gdy).a;
      for (int i = 0; i < STEPS; i++) {
        if (cur >= d) break;
        cuv -= delta;
        cur += layerD;
        d = 1.0 - textureGrad(uNormalTex, vec3(pixelArtUVw(cuv, 16.0, fw), lay), gdx, gdy).a;
      }
      uv = cuv;
    }
  }
#endif
  vec3 tuv = vec3(pixelArtUVw(uv, 16.0, fw), float(vLayer));
  vec4 alb = textureGrad(uAlbedo, tuv, gdx, gdy);
#ifdef CUTOUT
  if (alb.a < 0.5 || fireCut) discard;
#endif
  vec3 albedo = alb.rgb;
  int tintMode = int(vProps.r + 0.5);
  vec3 grass = vBiome.rgb;
  if (tintMode == 1) albedo *= grass;
  else if (tintMode == 2) albedo = mix(albedo, albedo * grass, alb.a);
  else if (tintMode == 3) albedo *= grass * vec3(0.78, 0.88, 0.62);

  vec4 nm = textureGrad(uNormalTex, tuv, gdx, gdy);
  vec4 sp = textureGrad(uSpecular, tuv, gdx, gdy);
  vec3 n = plant ? N : normalize(T * (nm.x * 2.0 - 1.0) + B * (nm.y * 2.0 - 1.0) + N * max(nm.z * 2.0 - 1.0, 0.05));

  float smoothness = sp.r;
  // Superficies mojadas y charcos cuando llueve (sólo lo expuesto al cielo).
  float rain = uMisc.y;
  if (rain > 0.001 && !plant && special != 2) {
    float exposed = smoothstep(0.8, 0.97, vLight.x);
    float wet = rain * exposed * (0.3 + 0.7 * saturate(N.y));
    float pn = texture(uCloudWeather, vWorld.xz / 40.0).g;
    float puddle = N.y > 0.5 ? smoothstep(0.44, 0.56, pn) * wet : 0.0;
    albedo *= 1.0 - 0.5 * wet * (1.0 - smoothness);
    smoothness = mix(smoothness, max(smoothness, 0.5), wet);
    smoothness = mix(smoothness, 0.97, puddle);
    n = normalize(mix(n, N, puddle));
  }
  float rough = max(sq(1.0 - smoothness), 0.03);
  bool metal = sp.g > 0.899;
  vec3 f0 = metal ? albedo : vec3(sp.g);
  float sss = max(sp.b, vProps.b / 255.0);
  float emission = sp.a;
  // Fase 8.4 (entorno del Nether): la lava no es una baldosa repetida: manchas grandes de costra enfriada (roja
  // oscura, apagada) que derivan despacio y zonas más vivas, con las vetas más brillantes de la textura siempre
  // encendidas. Rompe la repetición de 16 píxeles que de lejos se ve como rayas.
  if (special == 2) {
    float lt = uCamPos.w;
    float m1 = texture(uCloudWeather, vWorld.xz / 34.0 + vec2(lt * 0.0035, lt * 0.0022)).g;
    float m2 = texture(uCloudWeather, vWorld.xz / 9.0 - vec2(lt * 0.0060, -lt * 0.0045)).g;
    float m = m1 * 0.6 + m2 * 0.4;
    float veins = smoothstep(0.8, 1.0, emission);
    float crust = smoothstep(0.4, 0.58, m) * (1.0 - 0.7 * veins);
    albedo = mix(albedo, albedo * vec3(0.5, 0.16, 0.05), crust);
    emission *= mix(1.0, 0.18, crust);
    emission *= 1.0 + 0.25 * smoothstep(0.38, 0.26, m); // lo más caliente, algo más encendido
  }

  vec3 V = normalize(-vRel);
  vec3 L = uLightDir.xyz;
  float NdotLgeom = plant ? 1.0 : dot(N, L);
  float NdotL = plant ? 0.6 : saturate(dot(n, L)) * step(0.0, NdotLgeom);

  // Sombras (PCF rotado; el TAA integra el ruido).
  float shadow = 0.0;
  vec4 sc = vec4(0.0);
  bool lit = uLightColor.r + uLightColor.g + uLightColor.b > 1e-4;
  if (lit && (NdotLgeom > 0.0 || sss > 0.05)) {
    sc = shadowCoord(vRel, plant ? vec3(0.0, 1.0, 0.0) : N);
    float radius = 1.2 + 1.5 * sc.w;
    shadow = sampleShadow(sc, gl_FragCoord.xy, radius);
  }
  // Fase 8.6: donde no llega la luz del cielo tampoco llega el sol (bajo tierra, el mapa de sombras puede no
  // alcanzar el terreno de encima y el sol se colaba en salas y cuevas hondas).
  vec3 lightCol = uLightColor.rgb * shadow * smoothstep(0.2, 0.55, vLight.x);
  if (shadow > 0.0) {
    lightCol *= cloudShadow(vWorld);
    float wd = waterDepthToLight(sc);
    if (wd > 0.0) {
      vec3 absorb = exp(-vec3(0.35, 0.09, 0.06) * wd);
      float c = caustics(vWorld.xz * 0.55 + vWorld.y * 0.1, uWind.w * 0.9);
      lightCol *= absorb * (0.45 + 1.6 * c * exp(-wd * 0.08));
    }
  }
  // AO: curva suave, aplicada con fuerza al ambiente y parcialmente a la luz directa.
  float ao = mix(0.3, 1.0, vAO);
  ao *= ao;
  float aoDirect = mix(0.65, 1.0, vAO);

  vec3 diffuse = metal ? vec3(0.0) : albedo / PI * NdotL * lightCol * aoDirect;
  vec3 spec = plant ? vec3(0.0) : specularGGX(n, V, L, rough, f0) * lightCol * aoDirect;
  // Luz transmitida (hojas, plantas, nieve): más intensa a contraluz.
  vec3 trans = vec3(0.0);
  if (sss > 0.05) {
    float back = pow(saturate(dot(V, -L)), 5.0);
    trans = albedo * sss * lightCol * (0.18 + 1.6 * back) / PI;
  }
  // Ambiente del cielo y luz de bloques.
  float skyF = skyLightCurve(vLight.x);
  // Cielo + luz rebotada aproximada del terreno iluminado (GI barata).
  vec3 bounce = uLightColor.rgb * saturate(uLightDir.y) * 0.07 * (0.6 - 0.45 * n.y);
  vec3 amb = (ambientCube(n) * 1.6 + bounce) * skyF;
  // Parpadeo sutil de las llamas (varía en el espacio para que cada antorcha sea distinta).
  float ft = uCamPos.w * 7.0 + dot(floor(vWorld * 0.25), vec3(1.7, 3.1, 2.3));
  float flicker = 0.93 + 0.05 * sin(ft) + 0.03 * sin(ft * 2.37 + 1.3);
  vec3 blockE = blockLightTinted(vLight.y, vLight.x) * flicker;
  vec3 minAmb = minAmbientAt(n, vWorld.y); // Fase 8 (entorno del Nether)
  vec3 ambient = (metal ? albedo * 0.25 : albedo) / PI * (amb + blockE + minAmb) * ao;
  // Reflejo especular del cielo en materiales pulidos.
  vec3 R = reflect(-V, n);
  float NdotV = saturate(dot(n, V));
  vec3 Fa = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - NdotV, 5.0);
  vec3 skyRefl = texture(uSkyView, skyViewUV(normalize(vec3(R.x, max(R.y, 0.02), R.z)))).rgb;
  vec3 envSpec = Fa * skyRefl * skyF * sq(1.0 - rough) * ao;

  vec3 color = diffuse + spec + trans + ambient + envSpec;
  // Fase 8.6: el destello del End alumbra en violeta lo que ve el cielo, más por el lado de donde viene.
  if (uEndFlash.w > 0.0) {
    float sk = vLight.x * vLight.x;
    color += albedo / PI * vec3(0.67, 0.38, 0.80) * 2.4 * uEndFlash.w * sk * (0.3 + 0.7 * saturate(dot(n, normalize(uEndFlash.xyz)))) * ao;
  }
  // Fase 8 (entorno del Nether): sin cielo la exposición sube mucho y lo que brilla se quemaba a blanco: la emisión
  // es menor y la de la lava va en un naranja más hondo (al cuadrado), con sus vetas claras aún encendidas.
  vec3 emitCol = special == 2 && uDim.x < 0.5 ? albedo * albedo : albedo;
  color += emitCol * emission * mix(1.2, 6.0, uDim.x);
  if (special == 2) color += albedo * 5.0 * uDim.x;
  outColor = vec4(color, 1.0);
}
`;

// ------------------------------------------------------------------ sombras

export const SHADOW_VS = /* glsl */ `
${COMMON}
${TERRAIN_VERTEX_COMMON}
out vec2 vUV;
flat out int vLayer;
void main() {
  TerrainVertex v = decodeVertex();
  vec3 rel = uChunkOffset + v.local;
  vec3 world = rel + uCamPos.xyz;
  rel += windOffset(v, world);
  vec4 p = uShadowMat * vec4(rel + uShadowOffset.xyz, 1.0);
  p.xy = distortShadow(p.xy);
  vUV = v.uv;
  vLayer = v.layer;
  gl_Position = p;
}
`;

export const SHADOW_FS = /* glsl */ `
uniform highp sampler2DArray uAlbedo;
in vec2 vUV;
flat in int vLayer;
out vec4 outColor;
void main() {
#ifdef CUTOUT
  if (texture(uAlbedo, vec3(vUV, float(vLayer))).a < 0.5) discard;
#endif
  outColor = vec4(1.0);
}
`;
