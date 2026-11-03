// Objetos 3D: bloques sueltos y sprites extruidos (herramientas, comida...). Se usan para los
// objetos tirados, los bloques que caen, las flechas, la mano en primera persona y las grietas
// de minado (modo multiplicativo).
import { COMMON } from './common';
import { ATMOSPHERE } from './atmosphere';
import { LIGHTING } from './terrain';

/**
 * Fase 7 (encantamientos): brillo de los objetos encantados. Dos franjas violetas que cruzan el objeto en
 * diagonal a distinto ritmo, más un velo tenue; se suma a la luz (se ve también a oscuras).
 */
export const GLINT = /* glsl */ `
vec3 glint(vec2 p, float t) {
  float a = sin((p.x * 1.1 + p.y * 0.45) * 5.2 - t * 2.3);
  float b = sin((p.x * -0.35 + p.y * 1.0) * 6.8 - t * 1.55 + 1.7);
  float g = pow(max(a, 0.0), 7.0) * 0.9 + pow(max(b, 0.0), 9.0) * 0.6;
  return vec3(0.52, 0.24, 1.0) * (0.09 + g * 0.55);
}
`;

export const ITEM3D_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aUVL;
uniform mat4 uModel;
uniform mat4 uProjM;
out vec3 vRel;
out vec3 vN;
out vec2 vUV;
flat out float vLayer;
out vec3 vObj; // Fase 7 (encantamientos): posición en el objeto (para el brillo)
void main() {
  vec4 p = uModel * vec4(aPos, 1.0);
  vObj = aPos;
  vRel = p.xyz;
  vN = normalize(mat3(uModel) * aNormal);
  vUV = aUVL.xy;
  vLayer = aUVL.z;
  gl_Position = uProjM * p;
}
`;

export const ITEM3D_FS = /* glsl */ `
${COMMON}
${ATMOSPHERE}
${LIGHTING}
uniform highp sampler2DArray uTex;
uniform highp sampler2DArray uSpecular;
uniform highp sampler2D uLayerProps;
uniform int uIsBlock;
uniform int uCutout;
uniform int uHand;
uniform int uCrack;
uniform vec3 uLightDirView;
uniform vec2 uLightLevel;
uniform vec3 uGrassTint;
uniform vec3 uTint;
// Fase 7 (encantamientos): brillo de lo encantado (0 = nada) y el reloj que lo hace correr.
uniform float uGlint;
uniform float uTime;
in vec3 vRel;
in vec3 vN;
in vec2 vUV;
flat in float vLayer;
in vec3 vObj;
layout(location = 0) out vec4 outColor;
${GLINT}
void main() {
  vec2 gdx = dFdx(vUV), gdy = dFdy(vUV);
  vec3 tuv = vec3(pixelArtUV(vUV, 16.0), vLayer);
  vec4 alb = textureGrad(uTex, tuv, gdx, gdy);
  if ((uCutout == 1 || uCrack == 1) && alb.a < 0.5) discard;
  if (uCrack == 1) {
    // Grietas: multiplican el color de la escena.
    outColor = vec4(mix(vec3(1.0), alb.rgb * 0.8, 0.9), 1.0);
    return;
  }
  vec3 albedo = alb.rgb;
  float emissive = 0.0;
  if (uIsBlock == 1) {
    vec4 props = texelFetch(uLayerProps, ivec2(int(vLayer + 0.5), 0), 0) * 255.0;
    int tintMode = int(props.r + 0.5);
    if (tintMode == 1) albedo *= uGrassTint;
    else if (tintMode == 2) albedo = mix(albedo, albedo * uGrassTint, alb.a);
    else if (tintMode == 3) albedo *= uGrassTint * vec3(0.78, 0.88, 0.62);
    emissive = textureGrad(uSpecular, tuv, gdx, gdy).a * 6.0;
    if (int(props.a + 0.5) == 2) emissive = 5.0;
  }
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 col;
  if (uHand == 1) {
    float sky = uLightLevel.x;
    vec3 up = texelFetch(uIrradiance, ivec2(2, 0), 0).rgb;
    vec3 side = texelFetch(uIrradiance, ivec2(0, 0), 0).rgb;
    float NdotL = saturate(dot(N, uLightDirView));
    vec4 sc = shadowCoord(vec3(0.0, -0.35, 0.0), vec3(0.0, 1.0, 0.0));
    float sh = sampleShadow(sc, gl_FragCoord.xy, 2.0);
    vec3 direct = uLightColor.rgb * NdotL * sh * smoothstep(0.55, 0.95, sky);
    vec3 amb = (mix(side, up, N.y * 0.5 + 0.5) * 1.6 + uLightColor.rgb * 0.05) * (sky * sky * uDim.x) + blockLightTinted(uLightLevel.y, uLightLevel.x) + minAmbient() + 0.003;
    amb += underwaterLight(up) * (0.6 + 0.4 * saturate(N.y * 0.5 + 0.5));
    col = albedo / PI * (direct + amb);
  } else {
    vec3 L = uLightDir.xyz;
    float NdotL = saturate(dot(N, L));
    float shadow = NdotL > 0.0 ? sampleShadow(shadowCoord(vRel, N), gl_FragCoord.xy, 1.5) : 0.0;
    vec3 lightCol = uLightColor.rgb * shadow * cloudShadow(vRel + uCamPos.xyz);
    vec3 amb = ambientCube(N) * 1.6 * skyLightCurve(uLightLevel.x) + blockLightTinted(uLightLevel.y, uLightLevel.x) + minAmbient();
    col = albedo / PI * (NdotL * lightCol + amb);
  }
  col = col * uTint + albedo * emissive;
  if (uGlint > 0.0) col += glint(vObj.xy + vObj.zz * 0.6, uTime) * uGlint; // Fase 7 (encantamientos)
  outColor = vec4(col, 1.0);
}
`;

export const ITEM3D_SHADOW_VS = /* glsl */ `
${COMMON}
layout(location = 0) in vec3 aPos;
layout(location = 2) in vec3 aUVL;
uniform mat4 uModel;
out vec2 vUV;
flat out float vLayer;
void main() {
  vec3 rel = (uModel * vec4(aPos, 1.0)).xyz;
  vec4 p = uShadowMat * vec4(rel + uShadowOffset.xyz, 1.0);
  p.xy = distortShadow(p.xy);
  vUV = aUVL.xy;
  vLayer = aUVL.z;
  gl_Position = p;
}
`;

export const ITEM3D_SHADOW_FS = /* glsl */ `
uniform highp sampler2DArray uTex;
uniform int uCutout;
in vec2 vUV;
flat in float vLayer;
out vec4 outColor;
void main() {
  if (uCutout == 1 && texture(uTex, vec3(vUV, vLayer)).a < 0.5) discard;
  outColor = vec4(1.0);
}
`;
