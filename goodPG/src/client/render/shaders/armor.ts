// Armadura puesta sobre los jugadores: la misma luz que la piel (ENTITY_FS) más brillo de metal.
// El alfa de la textura (128..255) dice cuánto está pulido cada téxel; uMat, cómo es el material.
// Se usa con ENTITY_VS y, para las sombras, con ENTITY_SHADOW_VS/FS.
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';
import { LIGHTING } from './terrain';
import { GLINT } from './items'; // Fase 7 (encantamientos)

export const ARMOR_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform sampler2D uSkin;
uniform sampler2D uSkyView;
uniform vec2 uLightLevel;
/** x = rugosidad pulida, y = cuánto es metal, z = luz ambiente extra (oro y diamante). */
uniform vec3 uMat;
// Fase 7 (encantamientos): brillo de la pieza encantada.
uniform float uGlint;
uniform float uTime;
${GLINT}
in vec3 vRel;
in vec3 vNormal;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
void main() {
  vec4 tex = texture(uSkin, vUV);
  if (tex.a < 0.5) discard;
  float gloss = saturate((tex.a - 0.5) * 2.0);
  vec3 albedo = srgbToLinear(tex.rgb);
  float metal = uMat.y * gloss;
  float rough = mix(0.8, uMat.x, gloss);
  vec3 f0 = mix(vec3(0.04), albedo, metal);
  vec3 diff = albedo * (1.0 - 0.45 * metal);
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
  vec3 col = diff / PI * NdotL * lightCol;
  col += specularGGX(N, V, L, rough, f0) * lightCol;
  float skyF = skyLightCurve(uLightLevel.x);
  vec3 bounce = uLightColor.rgb * saturate(uLightDir.y) * 0.07 * (0.6 - 0.45 * N.y);
  vec3 amb = (ambientCube(N) * 1.6 + bounce) * skyF + blockLightTinted(uLightLevel.y, uLightLevel.x) + minAmbientAt(N, vRel.y + uCamPos.y); // Fase 8 (entorno del Nether)
  col += diff / PI * amb * (1.0 + uMat.z);
  // Reflejo del cielo en las placas pulidas (nada bajo tierra).
  vec3 R = reflect(-V, N);
  float NdotV = saturate(dot(N, V));
  vec3 Fa = f0 + (max(vec3(1.0 - rough), f0) - f0) * pow(1.0 - NdotV, 5.0);
  vec3 sky = texture(uSkyView, skyViewUV(normalize(vec3(R.x, max(R.y, 0.02), R.z)))).rgb;
  col += Fa * sky * skyF * sq(1.0 - rough) * gloss;
  if (uGlint > 0.0) col += glint(vUV * vec2(6.0, 3.0), uTime) * uGlint; // Fase 7 (encantamientos)
  outColor = vec4(col, 1.0);
}
`;
