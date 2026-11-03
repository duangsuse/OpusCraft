// Shaders de entidades: jugadores remotos, bloque en la mano, contorno de selección y partículas.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';
import { LIGHTING, TERRAIN_VERTEX_COMMON } from './terrain';

export const ENTITY_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUV;
uniform mat4 uModel;
out vec3 vRel;
out vec3 vNormal;
out vec2 vUV;
void main() {
  vec4 p = uModel * vec4(aPos, 1.0);
  vRel = p.xyz;
  vNormal = normalize(mat3(uModel) * aNormal);
  vUV = aUV;
  gl_Position = uViewProj * p;
}
`;

export const ENTITY_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform sampler2D uSkin;
uniform vec2 uLightLevel;
uniform vec3 uTint;
in vec3 vRel;
in vec3 vNormal;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
void main() {
  vec4 tex = texture(uSkin, vUV);
  if (tex.a < 0.5) discard;
  vec3 albedo = srgbToLinear(tex.rgb) * uTint;
  vec3 N = normalize(vNormal);
  vec3 L = uLightDir.xyz;
  float NdotL = saturate(dot(N, L));
  float shadow = 0.0;
  if (NdotL > 0.0) {
    vec4 sc = shadowCoord(vRel, N);
    shadow = sampleShadow(sc, gl_FragCoord.xy, 1.5);
  }
  vec3 V = normalize(-vRel);
  vec3 lightCol = uLightColor.rgb * shadow * cloudShadow(vRel + uCamPos.xyz);
  vec3 col = albedo / PI * NdotL * lightCol;
  col += specularGGX(N, V, L, 0.7, vec3(0.04)) * lightCol;
  vec3 bounce = uLightColor.rgb * saturate(uLightDir.y) * 0.07 * (0.6 - 0.45 * N.y);
  vec3 amb = (ambientCube(N) * 1.6 + bounce) * skyLightCurve(uLightLevel.x) + blockLightTinted(uLightLevel.y, uLightLevel.x) + minAmbientAt(N, vRel.y + uCamPos.y); // Fase 8 (entorno del Nether)
  col += albedo / PI * amb;
  outColor = vec4(col, 1.0);
}
`;

export const ENTITY_SHADOW_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec2 aUV;
uniform mat4 uModel;
out vec2 vUV;
void main() {
  vec3 rel = (uModel * vec4(aPos, 1.0)).xyz;
  vec4 p = uShadowMat * vec4(rel + uShadowOffset.xyz, 1.0);
  p.xy = distortShadow(p.xy);
  vUV = aUV;
  gl_Position = p;
}
`;

export const ENTITY_SHADOW_FS = /* glsl */ `
uniform sampler2D uSkin;
in vec2 vUV;
out vec4 outColor;
void main() {
  if (texture(uSkin, vUV).a < 0.5) discard;
  outColor = vec4(1.0);
}
`;

// ------------------------------------------------------------------ contorno de selección

export const OUTLINE_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
uniform vec3 uOffset;
uniform vec3 uScale;
void main() {
  gl_Position = uViewProj * vec4(uOffset + aPos * uScale, 1.0);
  gl_Position.z -= 0.0004 * gl_Position.w;
}
`;

export const OUTLINE_FS = /* glsl */ `
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = uColor; }
`;

