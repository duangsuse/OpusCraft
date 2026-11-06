// Terrain shaders: vanilla (lightmap) path, PBR deferred-lite path for shader mode, and shadow pass.
import { TERRAIN_ATTRIBS, WAVING, NOISE, ATMOSPHERE, TONEMAP } from './common.js';

const DECODE = `
uniform mat4 u_viewProj;
uniform vec3 u_chunkOff;
uniform vec3 u_camPos;
uniform mat4 u_model;
uniform vec3 u_lightOverride;   // z > 0.5: use xy as (sky, block) light instead of the vertex light
uniform vec4 u_colorMul;        // multiplies vertex tint (hurt flash, etc.)
`;

export const VANILLA_TERRAIN_VS = `
${TERRAIN_ATTRIBS}
${WAVING}
${DECODE}
out vec2 v_uv; flat out float v_layer; out vec3 v_tint; out vec2 v_light; out float v_ao; flat out int v_flags; out float v_shade; out float v_fogDist; flat out float v_mat;
void main(){
  vec3 rel = (u_model * vec4(a_pos.xyz / 16.0, 1.0)).xyz + u_chunkOff;
  float mat = a_nrm.w;
  rel += wave(rel + u_camPos, mat, a_color.a);
  gl_Position = u_viewProj * vec4(rel, 1.0);
  v_uv = a_uv / 4096.0; v_layer = a_pos.w; v_tint = a_color.rgb * u_colorMul.rgb; v_light = u_lightOverride.z > 0.5 ? u_lightOverride.xy : a_light.xy; v_ao = a_light.z; v_mat = mat;
  v_flags = int(a_light.w * 255.0 + 0.5);
  vec3 n = normalize(mat3(u_model) * (a_nrm.xyz / 127.0));
  v_shade = n.y > 0.5 ? 1.0 : n.y < -0.5 ? 0.5 : abs(n.z) > 0.5 ? 0.8 : abs(n.x) > 0.5 ? 0.6 : 1.0;
  if ((v_flags & 2) != 0 && abs(n.y) < 0.5 && mat != 3.0) v_shade = mix(v_shade, 1.0, 0.0);
  v_fogDist = max(length(rel.xz), abs(rel.y));
}`;

export const VANILLA_TERRAIN_FS = `
uniform sampler2DArray u_albedo;
uniform sampler2D u_lightmap;
uniform float u_overlayLayer;
uniform vec4 u_fogColor;
uniform vec2 u_fog;
uniform float u_alphaCutoff;
uniform float u_translucent;
in vec2 v_uv; flat in float v_layer; in vec3 v_tint; in vec2 v_light; in float v_ao; flat in int v_flags; in float v_shade; in float v_fogDist; flat in float v_mat;
out vec4 o_color;
void main(){
  vec4 tex = texture(u_albedo, vec3(v_uv, v_layer));
  if (tex.a < u_alphaCutoff) discard;
  vec3 col = tex.rgb;
  if ((v_flags & 1) != 0) { vec4 ov = texture(u_albedo, vec3(v_uv, u_overlayLayer)); col = mix(col, ov.rgb * v_tint, ov.a); }
  else col *= v_tint;
  vec3 lm = texture(u_lightmap, (vec2(v_light.y, v_light.x) * 15.0 + 0.5) / 16.0).rgb;
  if (v_mat == 4.0 || v_mat == 10.0 || v_mat == 11.0) lm = vec3(1.0);
  col *= lm * v_ao * v_shade;
  float f = v_fogDist <= u_fog.x ? 0.0 : (v_fogDist < u_fog.y ? smoothstep(u_fog.x, u_fog.y, v_fogDist) : 1.0);
  col = mix(col, u_fogColor.rgb, f * u_fogColor.a);
  o_color = vec4(col, u_translucent > 0.5 ? tex.a : 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------
// Shadow pass
export const SHADOW_COMMON = `
const float SHADOW_DISTORT = 0.88;
vec3 shadowDistort(vec3 p){
  float d = length(p.xy);
  float f = d * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT);
  return vec3(p.xy / f, p.z * 0.2);
}
float distortFactor(vec2 p){ return length(p) * SHADOW_DISTORT + (1.0 - SHADOW_DISTORT); }
`;

export const SHADOW_VS = `
${TERRAIN_ATTRIBS}
${WAVING}
${SHADOW_COMMON}
uniform mat4 u_shadowMat;
uniform vec3 u_chunkOff;
uniform vec3 u_camPos;
uniform mat4 u_model;
out vec2 v_uv; flat out float v_layer;
void main(){
  vec3 rel = (u_model * vec4(a_pos.xyz / 16.0, 1.0)).xyz + u_chunkOff;
  rel += wave(rel + u_camPos, a_nrm.w, a_color.a);
  vec4 p = u_shadowMat * vec4(rel, 1.0);
  p.xyz = shadowDistort(p.xyz);
  gl_Position = p;
  v_uv = a_uv / 4096.0; v_layer = a_pos.w;
}`;

export const SHADOW_FS = `
uniform sampler2DArray u_albedo;
uniform float u_alphaCutoff;
in vec2 v_uv; flat in float v_layer;
void main(){
  if (u_alphaCutoff > 0.0) {
    float a = texture(u_albedo, vec3(v_uv, v_layer)).a;
    if (a < u_alphaCutoff) discard;
  }
}`;

// ---------------------------------------------------------------------------------------------------------
// Shader-mode PBR forward lighting (writes HDR color + normal/material buffer)
export const LIGHTING = `
${SHADOW_COMMON}
uniform sampler2DShadow u_shadowMap;
uniform mat4 u_shadowMat;
uniform float u_shadowRes;
uniform float u_shadowDist;
uniform vec3 u_lightDir;      // toward sun or moon
uniform vec3 u_lightColor;    // radiance of the active celestial light
uniform vec3 u_ambUp;
uniform vec3 u_ambHorizon;
uniform vec3 u_ambDown;
uniform vec3 u_torchColor;
uniform float u_rain;
uniform float u_wetness;
uniform float u_frame;
uniform vec2 u_screen;
uniform float u_caveAmbient;
uniform float u_nightVision;
uniform float u_shadowTaps;

const vec2 POISSON[12] = vec2[](
  vec2(-0.326,-0.406), vec2(-0.840,-0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621), vec2( 0.962,-0.195), vec2( 0.473,-0.480),
  vec2( 0.519, 0.767), vec2( 0.185,-0.893), vec2( 0.507, 0.064), vec2( 0.896, 0.412), vec2(-0.322,-0.933), vec2(-0.792,-0.598));

float shadowLookup(vec3 rel, vec3 nGeo, float NdotL, float noise, out float inRange){
  vec4 sp = u_shadowMat * vec4(rel, 1.0);
  float df = distortFactor(sp.xy);
  // normal offset bias scaled by distortion
  vec3 offs = nGeo * (0.06 + 0.10 * (1.0 - abs(NdotL))) * df * 2.0;
  sp = u_shadowMat * vec4(rel + offs, 1.0);
  vec3 p = shadowDistort(sp.xyz) * 0.5 + 0.5;
  inRange = step(abs(sp.x), 0.98) * step(abs(sp.y), 0.98);
  if (inRange < 0.5) return 1.0;
  float bias = 0.00004;
  p.z -= bias;
  float a = noise * 6.2831853;
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  float radius = 1.3 / u_shadowRes / df * 1.0;
  float s = 0.0;
  int n = int(u_shadowTaps);
  for (int i = 0; i < 12; i++) {
    if (i >= n) break;
    vec2 o = rot * POISSON[i] * radius;
    s += texture(u_shadowMap, vec3(p.xy + o, p.z));
  }
  return s / float(n);
}

float D_GGX(float NdotH, float a){ float a2 = a*a; float d = NdotH*NdotH*(a2-1.0)+1.0; return a2 / (3.14159 * d*d + 1e-6); }
float V_SmithGGX(float NdotV, float NdotL, float a){ float k = a*0.5; return 0.25 / ((NdotV*(1.0-k)+k) * (NdotL*(1.0-k)+k) + 1e-5); }
vec3 F_Schlick(vec3 f0, float c){ return f0 + (1.0 - f0) * pow(1.0 - c, 5.0); }

vec3 skyAmbient(vec3 n){
  float u = n.y;
  vec3 hz = u_ambHorizon;
  return u > 0.0 ? mix(hz, u_ambUp, u) : mix(hz, u_ambDown, -u);
}
`;

export const PBR_TERRAIN_VS = `
${TERRAIN_ATTRIBS}
${WAVING}
${DECODE}
uniform vec2 u_jitter;
out vec2 v_uv; flat out float v_layer; out vec3 v_tint; out vec2 v_light; out float v_ao; flat out int v_flags; flat out float v_mat; out vec3 v_rel; out vec3 v_nrm; out float v_sway;
void main(){
  vec3 rel = (u_model * vec4(a_pos.xyz / 16.0, 1.0)).xyz + u_chunkOff;
  float mat = a_nrm.w;
  rel += wave(rel + u_camPos, mat, a_color.a);
  vec4 cp = u_viewProj * vec4(rel, 1.0);
  cp.xy += u_jitter * cp.w;
  gl_Position = cp;
  v_uv = a_uv / 4096.0; v_layer = a_pos.w; v_tint = a_color.rgb * u_colorMul.rgb; v_light = u_lightOverride.z > 0.5 ? u_lightOverride.xy : a_light.xy; v_ao = a_light.z; v_mat = mat;
  v_flags = int(a_light.w * 255.0 + 0.5);
  v_nrm = mat3(u_model) * (a_nrm.xyz / 127.0);
  v_rel = rel;
  v_sway = a_color.a;
}`;

export const PBR_TERRAIN_FS = `
${NOISE}
${TONEMAP}
${LIGHTING}
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_normalTex;
uniform sampler2DArray u_specTex;
uniform sampler2D u_skyLUT;
uniform float u_overlayLayer;
uniform float u_alphaCutoff;
uniform vec3 u_camPos;
uniform float u_time;
in vec2 v_uv; flat in float v_layer; in vec3 v_tint; in vec2 v_light; in float v_ao; flat in int v_flags; flat in float v_mat; in vec3 v_rel; in vec3 v_nrm; in float v_sway;
layout(location=0) out vec4 o_color;
layout(location=1) out vec4 o_normal;

vec3 sampleSkyLUT(vec3 d){
  float az = atan(d.z, d.x) / 6.2831853 + 0.5;
  float el = asin(clamp(d.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963);
  return texture(u_skyLUT, vec2(az, v)).rgb;
}

mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv){
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T,T), dot(B,B)) + 1e-12);
  return mat3(T * invmax, B * invmax, N);
}

void main(){
  vec4 tex = texture(u_albedo, vec3(v_uv, v_layer));
  if (tex.a < u_alphaCutoff) discard;
  vec3 col = tex.rgb;
  bool overlay = (v_flags & 1) != 0;
  if (overlay) { vec4 ov = texture(u_albedo, vec3(v_uv, u_overlayLayer)); col = mix(col, ov.rgb * v_tint, ov.a); }
  else col *= v_tint;
  vec3 albedo = srgbToLinear(col);
  int mat = int(v_mat + 0.5);
  bool foliage = mat == 1 || mat == 2 || mat == 9;
  vec3 Ng = normalize(v_nrm);
  if (!gl_FrontFacing && !foliage) Ng = -Ng;
  vec3 V = normalize(-v_rel);

  // material maps
  vec4 nh = texture(u_normalTex, vec3(v_uv, v_layer));
  vec4 sp = texture(u_specTex, vec3(v_uv, v_layer));
  float smoothness = sp.r, f0v = sp.g, sss = sp.b, emissive = sp.a;
  vec3 N = Ng;
  if (!foliage) {
    vec3 nt = nh.xyz * 2.0 - 1.0;
    nt.xy *= 0.9;
    mat3 TBN = cotangentFrame(Ng, v_rel, v_uv * 16.0);
    N = normalize(TBN * nt);
    if (dot(N, V) < 0.0) N = normalize(N + Ng * 0.5);
  } else {
    // foliage: soft normals pointing mostly up so grass is lit like a canopy
    N = normalize(mix(Ng, vec3(0.0, 1.0, 0.0), mat == 2 ? 0.25 : 0.8));
  }

  float skyL = v_light.x, blkL = v_light.y;
  float ao = v_ao;
  if (mat == 3) smoothness = 0.95;

  // rain wetness / puddles on exposed up-facing surfaces
  vec3 wp = v_rel + u_camPos;
  float exposure = smoothstep(0.86, 0.96, skyL);
  float wet = u_wetness * exposure;
  if (wet > 0.0 && !foliage) {
    float pud = smoothstep(0.45, 0.7, fbm2(wp.xz * 0.15)) * step(0.7, Ng.y);
    float porosity = 1.0 - smoothness;
    albedo *= mix(1.0, 0.55 + 0.45 * (1.0 - porosity), wet);
    smoothness = mix(smoothness, 0.9, wet * max(pud, 0.35 * step(0.7, Ng.y)));
    N = normalize(mix(N, Ng, wet * pud));
  }

  float noise = ign(gl_FragCoord.xy + u_frame * 5.588238);
  vec3 L = u_lightDir;
  float NdotL = dot(N, L);
  float NgdotL = dot(Ng, L);
  float inRange;
  float shadow = 0.0;
  if (NgdotL > -0.05 || foliage) shadow = shadowLookup(v_rel, foliage ? vec3(0.0, 1.0, 0.0) : Ng, NgdotL, noise, inRange);
  // outside the shadow map use skylight as a coarse visibility estimate
  if (inRange < 0.5) shadow *= smoothstep(0.80, 0.97, skyL);
  // light leaking guard: cave interiors never get direct light
  shadow *= smoothstep(0.05, 0.35, skyL);

  float rough = clamp(1.0 - smoothness, 0.03, 1.0);
  float a = rough * rough;
  bool metal = f0v > 0.9;
  vec3 F0 = metal ? albedo : vec3(max(0.02, f0v));
  float NdotV = max(dot(N, V), 1e-3);
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  vec3 F = F_Schlick(F0, max(dot(H, V), 0.0));

  // diffuse
  float diff;
  if (foliage) {
    float wrap = clamp((NdotL + 0.5) / 1.5, 0.0, 1.0);
    float back = pow(clamp(dot(-V, L), 0.0, 1.0), 4.0) * 0.8;
    diff = wrap * 0.85 + back * max(sss, 0.5);
  } else diff = max(NdotL, 0.0);
  vec3 direct = u_lightColor * shadow * diff;
  vec3 specDirect = metal || smoothness > 0.05 ? u_lightColor * shadow * D_GGX(NdotH, a) * V_SmithGGX(NdotV, max(NdotL, 0.0), a) * F * max(NdotL, 0.0) : vec3(0.0);

  float skyVis = skyL * skyL * skyL;
  float aoTerm = ao * ao;
  vec3 ambient = skyAmbient(N) * skyVis * aoTerm;
  ambient += vec3(0.010, 0.011, 0.014) * u_caveAmbient * aoTerm + u_nightVision * 0.5;
  float bl = blkL;
  vec3 torch = u_torchColor * (pow(bl, 4.0) * 3.2 + pow(bl, 1.8) * 0.12) * mix(1.0, aoTerm, 0.6);

  vec3 kd = metal ? vec3(0.0) : (1.0 - F * 0.5);
  vec3 color = albedo * kd * (direct + ambient + torch) + specDirect;

  // environment reflection approximation (sky only, occluded by skylight)
  if (smoothness > 0.3 || metal) {
    vec3 R = reflect(-V, N);
    vec3 env = sampleSkyLUT(normalize(vec3(R.x, max(R.y, 0.02), R.z))) * smoothstep(0.7, 1.0, skyL);
    vec3 Fe = F_Schlick(F0, NdotV);
    float envW = smoothstep(0.3, 1.0, smoothness);
    color += env * Fe * envW * aoTerm * (metal ? 1.0 : 0.6);
  }

  // emissive
  float em = emissive;
  if (mat == 4) em = max(em, 1.0);
  if (mat == 5 && em <= 0.0) em = smoothstep(0.55, 0.9, luma(col));
  if (mat == 10 || mat == 11) em = 1.0;
  color += albedo * em * (mat == 4 ? 6.0 : 8.0);

  o_color = vec4(color, 1.0);
  o_normal = vec4(N * 0.5 + 0.5, smoothness * (metal ? -1.0 : 1.0) * 0.5 + 0.5);
}`;
