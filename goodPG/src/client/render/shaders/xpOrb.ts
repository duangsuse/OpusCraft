// Orbes de experiencia: billboards instanciados con un orbe pixelado emisivo que cambia de verde a
// amarillo (los colores de Minecraft).
import { COMMON } from './common';

export const XP_ORB_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec4 aPosSize;   // xyz relativo a cámara, w = tamaño
layout(location = 1) in vec4 aMisc;      // x = edad (s), y = semilla
out vec2 vUV;
out vec3 vColor;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) - 0.5;
  // Leve balanceo en el plano de la pantalla.
  float a = sin(aMisc.x * 1.3 + aMisc.y * TAU) * 0.25;
  vec2 c = vec2(corner.x * cos(a) - corner.y * sin(a), corner.x * sin(a) + corner.y * cos(a));
  vec3 right = vec3(uView[0][0], uView[1][0], uView[2][0]);
  vec3 up = vec3(uView[0][1], uView[1][1], uView[2][1]);
  vec3 p = aPosSize.xyz + (right * c.x + up * c.y) * aPosSize.w;
  vUV = corner + 0.5;
  // Minecraft: rojo = (sin(t) + 1) / 2, verde = 1, azul = (sin(t + 4,19) + 1) / 10, con t = ticks / 2.
  float t = aMisc.x * 10.0 + aMisc.y * 20.0;
  vColor = vec3((sin(t) + 1.0) * 0.5, 1.0, (sin(t + 4.1887903) + 1.0) * 0.1);
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;

export const XP_ORB_FS = /* glsl */ `
${COMMON}
in vec2 vUV;
in vec3 vColor;
layout(location = 0) out vec4 outColor;
void main() {
  // Rejilla de 8x8 píxeles: borde oscuro, cuerpo del color del orbe y brillo en el centro.
  vec2 q = (floor(vUV * 8.0) + 0.5) / 8.0 * 2.0 - 1.0;
  float r = length(q);
  if (r > 0.9) discard;
  vec3 col = r > 0.66 ? vColor * 0.45 : r > 0.3 ? vColor : mix(vColor, vec3(1.0, 1.0, 0.8), 0.55);
  // Destello arriba a la izquierda.
  if (q.x < -0.2 && q.x > -0.5 && q.y > 0.2 && q.y < 0.5) col = mix(col, vec3(1.0), 0.6);
  outColor = vec4(col * 2.2, 1.0);
}
`;
