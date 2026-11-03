// Partículas: billboards instanciados con alfa premultiplicado. Las iluminadas (humo, hojas, trozos
// de bloque) escriben su alfa; las emisivas (llamas, chispas, brillos) escriben alfa 0, así se suman
// a la escena con la misma mezcla (ONE, ONE_MINUS_SRC_ALPHA). Se dibujan sin buffer de profundidad:
// leen la de la escena para ocultarse tras la geometría y desvanecerse al tocarla, y se funden con
// la niebla del borde.
import { COMMON } from './common';

export const PARTICLE2_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec4 aPosSize;  // xyz relativo a la cámara, w = tamaño (bloques)
layout(location = 1) in vec4 aColor;    // rgb lineal (puede pasar de 1 si es emisiva), a = opacidad
layout(location = 2) in vec4 aInfo;     // x = sprite (o capa del bloque), y = giro, z = luz empaquetada, w = banderas
layout(location = 3) in vec4 aVel;      // xyz velocidad (para estirar chispas); w = uv del trozo de bloque (u*4 + v)
out vec2 vUV;
out vec4 vColor;
flat out float vSprite;
flat out float vFlags;
out vec2 vLight;
out vec3 vRel;
out float vSize;
const float GRID = 8.0;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) - 0.5;
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  float flags = aInfo.w;
  float size = aPosSize.w;
  vec3 ax, ay;
  if (mod(floor(flags / 4.0), 2.0) > 0.5) {
    // Estirada en la dirección de la velocidad (chispas, gotas que caen).
    vec3 fwd = cross(right, up);
    vec3 vel = aVel.xyz - fwd * dot(aVel.xyz, fwd);
    float sp = length(vel);
    vec3 dir = sp > 1e-3 ? vel / sp : up;
    vec3 side = normalize(cross(dir, fwd));
    ax = dir * (size + sp * 0.035);
    ay = side * size * 0.45;
  } else {
    float c = cos(aInfo.y), s = sin(aInfo.y);
    ax = (right * c + up * s) * size;
    ay = (-right * s + up * c) * size;
  }
  vec3 p = aPosSize.xyz + ax * corner.x + ay * corner.y;
  vRel = p;
  vSize = size;
  vec2 uv = corner + 0.5;
  uv.y = 1.0 - uv.y;
  vSprite = aInfo.x;
  vFlags = flags;
  if (mod(floor(flags / 2.0), 2.0) > 0.5) {
    // Trozo de bloque: un cuarto de la textura, en la posición que diga aVel.w.
    float k = aVel.w;
    vUV = vec2(floor(k / 4.0), mod(k, 4.0)) * 0.25 + uv * 0.25;
  } else {
    float cx = mod(aInfo.x, GRID), cy = floor(aInfo.x / GRID);
    vUV = (vec2(cx, cy) + uv) / GRID;
  }
  vColor = aColor;
  float lp = aInfo.z;
  vLight = vec2(floor(lp / 16.0), mod(lp, 16.0)) / 15.0;
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;

export const PARTICLE2_FS = /* glsl */ `
${COMMON}
uniform sampler2D uAtlas;
uniform highp sampler2DArray uAlbedo;
uniform sampler2D uIrradiance;
uniform highp sampler2D uDepth;
in vec2 vUV;
in vec4 vColor;
flat in float vSprite;
flat in float vFlags;
in vec2 vLight;
in vec3 vRel;
in float vSize;
layout(location = 0) out vec4 outColor;
void main() {
  bool emissive = mod(vFlags, 2.0) > 0.5;
  bool block = mod(floor(vFlags / 2.0), 2.0) > 0.5;
  vec4 t;
  if (block) {
    vec4 alb = texture(uAlbedo, vec3(vUV, vSprite));
    if (alb.a < 0.5) discard;
    t = vec4(alb.rgb, 1.0);
  } else {
    t = texture(uAtlas, vUV); // premultiplicado
  }
  float alpha = t.a * vColor.a;
  // Suave contra la geometría: se desvanece al acercarse a lo que tiene detrás.
  float scene = linearDepth(texelFetch(uDepth, ivec2(gl_FragCoord.xy), 0).r);
  float mine = linearDepth(gl_FragCoord.z);
  // (Es también la prueba de oclusión: se dibuja sin buffer de profundidad.)
  float soft = clamp((scene - mine) / (block ? 0.03 : max(0.08, vSize * 0.6)), 0.0, 1.0);
  alpha *= soft;
  if (alpha < 0.003) discard;
  vec3 albedo = block ? t.rgb : (t.a > 0.0 ? t.rgb / t.a : vec3(0.0));
  albedo *= vColor.rgb;
  vec3 col;
  if (emissive) {
    col = albedo;
  } else {
    // Luz del cielo (según la luz del cielo del bloque), de antorchas y algo de sol directo.
    vec3 up = texelFetch(uIrradiance, ivec2(2, 0), 0).rgb;
    float sky = vLight.x * uDim.x; // Fase 8: sin cielo no hay luz del cielo
    vec3 lt = up * sky * sky + blockLightTinted(vLight.y, vLight.x) + uLightColor.rgb * 0.3 * smoothstep(0.55, 1.0, sky) + minAmbient();
    lt += underwaterLight(up);
    col = albedo / PI * lt;
  }
  // Niebla del borde de la distancia de dibujado.
  vec3 horizon = texelFetch(uIrradiance, ivec2(6, 0), 0).rgb;
  float d = length(vRel);
  float fog = smoothstep(uFog.z, uFog.w, d);
  col = mix(col, emissive ? vec3(0.0) : horizon, fog);
  alpha *= 1.0 - fog * 0.5;
  outColor = emissive ? vec4(col * alpha, 0.0) : vec4(col * alpha, alpha);
}
`;
