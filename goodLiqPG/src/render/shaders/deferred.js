// Deferred shading: G-buffer writers (terrain/entities) and the full-screen lighting pass.
import { NOISE, TONEMAP } from './common.js';
import { LIGHTING } from './terrain.js';
import { SKY_SAMPLE } from '../sky.js';

// G-buffer layout (all RGBA8):
//  0: albedo.rgb (sRGB), ao
//  1: shading normal (oct, 2x8bit), geometric normal (oct)
//  2: skyLight, blockLight, material id / 255, sss
//  3: smoothness, f0 (1 = metal), emissive, wetness/puddle
export const GBUF_COMMON = `
vec2 octEncode(vec3 n){
  n /= (abs(n.x) + abs(n.y) + abs(n.z));
  vec2 o = n.y >= 0.0 ? n.xz : (1.0 - abs(n.zx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.z >= 0.0 ? 1.0 : -1.0);
  return o * 0.5 + 0.5;
}
vec3 octDecode(vec2 e){
  e = e * 2.0 - 1.0;
  vec3 n = vec3(e.x, 1.0 - abs(e.x) - abs(e.y), e.y);
  float t = max(-n.y, 0.0);
  n.x += n.x >= 0.0 ? -t : t;
  n.z += n.z >= 0.0 ? -t : t;
  return normalize(n);
}
`;

export const GBUF_TERRAIN_FS = `
${NOISE}
${GBUF_COMMON}
uniform sampler2DArray u_albedo;
uniform sampler2DArray u_normalTex;
uniform sampler2DArray u_specTex;
uniform float u_overlayLayer;
uniform float u_alphaCutoff;
uniform vec3 u_camPos;
uniform float u_wetness;
in vec2 v_uv; flat in float v_layer; in vec3 v_tint; in vec2 v_light; in float v_ao; flat in int v_flags; flat in float v_mat; in vec3 v_rel; in vec3 v_nrm; in float v_sway;
layout(location=0) out vec4 g0;
layout(location=1) out vec4 g1;
layout(location=2) out vec4 g2;
layout(location=3) out vec4 g3;

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
  if ((v_flags & 1) != 0) { vec4 ov = texture(u_albedo, vec3(v_uv, u_overlayLayer)); col = mix(col, ov.rgb * v_tint, ov.a); }
  else col *= v_tint;
  int mat = int(v_mat + 0.5);
  bool foliage = mat == 1 || mat == 2 || mat == 9;
  vec3 Ng = normalize(v_nrm);
  if (!gl_FrontFacing && !foliage) Ng = -Ng;
  vec4 sp = texture(u_specTex, vec3(v_uv, v_layer));
  float smoothness = sp.r, f0v = sp.g, sss = sp.b, emissive = sp.a;
  vec3 N = Ng;
  if (!foliage) {
    vec3 nt = texture(u_normalTex, vec3(v_uv, v_layer)).xyz * 2.0 - 1.0;
    nt.xy *= 0.9;
    N = normalize(cotangentFrame(Ng, v_rel, v_uv * 16.0) * nt);
    if (dot(N, -v_rel) < 0.0) N = normalize(N + Ng * 0.5);
  } else {
    N = normalize(mix(Ng, vec3(0.0, 1.0, 0.0), mat == 2 ? 0.25 : 0.8));
    Ng = N;
  }
  float puddle = 0.0;
  if (u_wetness > 0.0 && !foliage && Ng.y > 0.7 && v_light.x > 0.86) {
    vec3 wp = v_rel + u_camPos;
    puddle = smoothstep(0.45, 0.7, fbm2(wp.xz * 0.15));
  }
  g0 = vec4(col, v_ao);
  g1 = vec4(octEncode(N), octEncode(Ng));
  g2 = vec4(v_light.x, v_light.y, float(mat) / 255.0, sss);
  g3 = vec4(smoothness, f0v, emissive, puddle);
}`;

export const GBUF_ENTITY_FS = `
${GBUF_COMMON}
uniform sampler2D u_tex;
uniform vec2 u_lightLevels;
uniform vec4 u_overlay;
uniform vec4 u_tint;
uniform float u_emissive;
in vec2 v_uv; in vec3 v_nrm; in vec3 v_rel;
layout(location=0) out vec4 g0;
layout(location=1) out vec4 g1;
layout(location=2) out vec4 g2;
layout(location=3) out vec4 g3;
void main(){
  vec4 c = texture(u_tex, v_uv);
  if (c.a < 0.1) discard;
  c *= u_tint;
  c.rgb = mix(c.rgb, u_overlay.rgb, u_overlay.a);
  vec3 N = normalize(v_nrm);
  if (!gl_FrontFacing) N = -N;
  g0 = vec4(c.rgb, 1.0);
  g1 = vec4(octEncode(N), octEncode(N));
  g2 = vec4(u_lightLevels, 20.0 / 255.0, 0.0);
  g3 = vec4(0.15, 0.04, u_emissive, 0.0);
}`;

export const DEFERRED_FS = `
${NOISE}
${TONEMAP}
${LIGHTING}
${SKY_SAMPLE}
${GBUF_COMMON}
uniform sampler2D u_g0; uniform sampler2D u_g1; uniform sampler2D u_g2; uniform sampler2D u_g3; uniform sampler2D u_depth;
uniform sampler2D u_skyLUT;
uniform mat4 u_invViewProj;
uniform float u_ssao;
in vec2 v_uv;
out vec4 o_color;
void main(){
  float d = texture(u_depth, v_uv).r;
  if (d >= 0.99999) discard;
  vec4 g0 = texture(u_g0, v_uv), g1 = texture(u_g1, v_uv), g2 = texture(u_g2, v_uv), g3 = texture(u_g3, v_uv);
  vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 rel = wp.xyz / wp.w;
  vec3 V = normalize(-rel);
  vec3 albedo = srgbToLinear(g0.rgb);
  float ao = g0.a;
  vec3 N = octDecode(g1.xy), Ng = octDecode(g1.zw);
  float skyL = g2.x, blkL = g2.y;
  int mat = int(g2.z * 255.0 + 0.5);
  float sss = g2.w;
  float smoothness = g3.r, f0v = g3.g, emissive = g3.b, puddle = g3.a;
  bool foliage = mat == 1 || mat == 2 || mat == 9;
  bool entity = mat == 20;

  // rain wetness
  float exposure = smoothstep(0.86, 0.96, skyL);
  float wet = u_wetness * exposure * (foliage ? 0.0 : 1.0);
  if (wet > 0.0) {
    float porosity = 1.0 - smoothness;
    albedo *= mix(1.0, 0.55 + 0.45 * (1.0 - porosity), wet);
    smoothness = mix(smoothness, 0.9, wet * max(puddle, 0.35 * step(0.7, Ng.y)));
    N = normalize(mix(N, Ng, wet * puddle));
  }

  float noise = ign(gl_FragCoord.xy + u_frame * 5.588238);
  vec3 L = u_lightDir;
  float NdotL = dot(N, L);
  float NgdotL = dot(Ng, L);
  float inRange = 0.0;
  float shadow = 0.0;
  if (NgdotL > -0.05 || foliage) shadow = shadowLookup(rel, foliage ? vec3(0.0, 1.0, 0.0) : Ng, NgdotL, noise, inRange);
  if (inRange < 0.5) shadow *= smoothstep(0.80, 0.97, skyL);
  shadow *= smoothstep(0.05, 0.35, skyL);

  float rough = clamp(1.0 - smoothness, 0.03, 1.0);
  float a = rough * rough;
  bool metal = f0v > 0.9;
  vec3 F0 = metal ? albedo : vec3(max(0.02, f0v));
  float NdotV = max(dot(N, V), 1e-3);
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0);
  vec3 F = F_Schlick(F0, max(dot(H, V), 0.0));
  float diff;
  if (foliage) {
    float wrap = clamp((NdotL + 0.5) / 1.5, 0.0, 1.0);
    float back = pow(clamp(dot(-V, L), 0.0, 1.0), 4.0) * 0.8;
    diff = wrap * 0.85 + back * max(sss, 0.5);
  } else diff = max(NdotL, 0.0);
  vec3 direct = u_lightColor * shadow * diff;
  vec3 specDirect = (metal || smoothness > 0.05) ? u_lightColor * shadow * D_GGX(NdotH, a) * V_SmithGGX(NdotV, max(NdotL, 0.0), a) * F * max(NdotL, 0.0) : vec3(0.0);
  float skyVis = skyL * skyL * skyL;
  float aoTerm = ao * ao;
  vec3 ambient = skyAmbient(N) * skyVis * aoTerm;
  ambient += vec3(0.010, 0.011, 0.014) * u_caveAmbient * aoTerm + u_nightVision * 0.5;
  vec3 torch = u_torchColor * (pow(blkL, 4.0) * 3.2 + pow(blkL, 1.8) * 0.12) * mix(1.0, aoTerm, 0.6);
  vec3 kd = metal ? vec3(0.0) : (1.0 - F * 0.5);
  vec3 color = albedo * kd * (direct + ambient + torch) + specDirect;
  if (smoothness > 0.3 || metal) {
    vec3 R = reflect(-V, N);
    vec3 env = sampleSkyLUT(u_skyLUT, normalize(vec3(R.x, max(R.y, 0.02), R.z))) * smoothstep(0.7, 1.0, skyL);
    vec3 Fe = F_Schlick(F0, NdotV);
    color += env * Fe * smoothstep(0.3, 1.0, smoothness) * aoTerm * (metal ? 1.0 : 0.6);
  }
  float em = emissive;
  if (mat == 4) em = max(em, 1.0);
  if (mat == 5 && em <= 0.0) em = smoothstep(0.55, 0.9, luma(g0.rgb));
  if (mat == 10 || mat == 11) em = 1.0;
  color += albedo * em * (mat == 4 ? 6.0 : 8.0);
  o_color = vec4(color, 1.0);
}`;
