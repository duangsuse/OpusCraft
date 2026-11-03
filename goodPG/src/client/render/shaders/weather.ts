// Precipitación: gotas de lluvia (o copos de nieve) instanciadas en una caja que envuelve a la
// cámara pero se mueven en coordenadas del mundo. No caen bajo techo (mapa de alturas).
import { COMMON } from './common';

export const RAIN_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec4 aSeed; // xyz en [0,1), w = aleatorio
uniform float uIntensity;
uniform float uSnow;
uniform vec3 uCamFrac;      // posición de cámara módulo el tamaño de la caja
uniform sampler2D uRainHeight;
uniform vec2 uRainOrigin;   // esquina (x, z) del mapa de alturas en coordenadas del mundo
uniform float uTime;
out vec2 vUV;
out float vAlpha;
const vec3 BOX = vec3(36.0, 28.0, 36.0);

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1));
  vAlpha = 0.0;
  vUV = corner;
  // Menos gotas con poca intensidad.
  if (aSeed.w > uIntensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float speed = mix(11.0 + aSeed.w * 4.0, 1.4 + aSeed.w * 0.6, uSnow);
  vec3 p = aSeed.xyz * BOX;
  p.y -= uTime * speed;
  vec2 wind = vec2(1.2, 0.5) * mix(1.0, 0.6, uSnow);
  p.xz += wind * uTime * mix(0.12, 1.0, uSnow);
  if (uSnow > 0.5) p.xz += vec2(sin(uTime * 1.3 + aSeed.w * 40.0), cos(uTime * 1.1 + aSeed.x * 40.0)) * 0.5;
  // Envolver en una caja centrada en la cámara (posición relativa a la cámara).
  vec3 rel = mod(p - uCamFrac, BOX) - BOX * 0.5;
  vec3 world = rel + uCamPos.xyz;
  // Oclusión por techo: altura del bloque más alto de la columna.
  vec2 hp = floor(world.xz) - uRainOrigin;
  float top = -1e4;
  if (hp.x >= 0.0 && hp.y >= 0.0 && hp.x < 64.0 && hp.y < 64.0) top = texelFetch(uRainHeight, ivec2(hp), 0).r;
  if (world.y < top + 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // Desvanecer en los bordes de la caja.
  float edge = 1.0 - smoothstep(0.35, 0.5, length(rel.xz / BOX.xz));
  edge *= 1.0 - smoothstep(0.3, 0.5, abs(rel.y / BOX.y));
  vAlpha = edge;
  // Quad orientado: vertical para la lluvia (estirado en la dirección de caída), cuadrado para la nieve.
  vec3 fall = normalize(vec3(-wind.x * 0.12, -speed * 0.1, -wind.y * 0.12));
  vec3 toCam = normalize(-rel);
  vec3 side = normalize(cross(fall, toCam));
  float w = mix(0.018, 0.07, uSnow);
  float len = mix(0.75, 0.07, uSnow);
  vec3 up = uSnow > 0.5 ? normalize(cross(toCam, side)) : -fall;
  vec3 pos = rel + side * (corner.x - 0.5) * w * (1.0 + length(rel) * 0.02) + up * (corner.y - 0.5) * len;
  gl_Position = uViewProj * vec4(pos, 1.0);
}
`;

export const RAIN_FS = /* glsl */ `
${COMMON}
uniform sampler2D uIrradiance;
uniform float uSnow;
in vec2 vUV;
in float vAlpha;
out vec4 outColor;
void main() {
  if (vAlpha <= 0.0) discard;
  vec3 amb = texelFetch(uIrradiance, ivec2(2, 0), 0).rgb / PI;
  float shape;
  if (uSnow > 0.5) {
    vec2 d = vUV - 0.5;
    shape = smoothstep(0.5, 0.15, length(d));
  } else {
    shape = smoothstep(0.5, 0.0, abs(vUV.x - 0.5)) * smoothstep(0.0, 0.25, vUV.y) * smoothstep(1.0, 0.7, vUV.y);
  }
  // Siempre algo más claras que el horizonte para que se lean (blancas en el caso de la nieve).
  vec3 horizon = texelFetch(uIrradiance, ivec2(6, 0), 0).rgb;
  vec3 col = mix(horizon * 1.15 + amb * 0.5, horizon * 1.9 + amb, uSnow) + uLightColor.rgb * 0.04;
  outColor = vec4(col, shape * vAlpha * mix(0.28, 0.85, uSnow));
}
`;
