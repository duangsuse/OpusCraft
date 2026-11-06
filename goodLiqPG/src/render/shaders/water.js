// Shader-mode translucent pass: water with waves, refraction, absorption, SSR + sky reflections, sun glitter.
import { TERRAIN_ATTRIBS, NOISE, TONEMAP } from './common.js';
import { LIGHTING } from './terrain.js';
import { SKY_SAMPLE } from '../sky.js';

export const WATER_VS = `
${TERRAIN_ATTRIBS}
uniform mat4 u_viewProj;
uniform vec3 u_chunkOff;
uniform vec3 u_camPos;
uniform mat4 u_model;
uniform vec2 u_jitter;
uniform float u_time;
uniform float u_waterStyle;   // 0 = shader (procedural waves), 1 = classic (vanilla texture)
uniform float u_underwater;   // underwater always uses the original (shader) style
out vec2 v_uv; flat out float v_layer; out vec3 v_tint; out vec2 v_light; flat out float v_mat; out vec3 v_rel; out vec3 v_nrm; flat out int v_flags;
void main(){
  vec3 rel = (u_model * vec4(a_pos.xyz / 16.0, 1.0)).xyz + u_chunkOff;
  float mat = a_nrm.w;
  vec3 n = a_nrm.xyz / 127.0;
  if (mat == 3.0 && n.y > 0.9 && (u_waterStyle < 0.5 || u_underwater > 0.5)) {
    vec3 wp = mod(rel + u_camPos, 512.0);
    rel.y += (sin(wp.x * 0.7 + u_time * 1.6) * 0.5 + sin(wp.z * 0.9 + u_time * 1.3) * 0.5) * 0.025 - 0.03;
  }
  vec4 cp = u_viewProj * vec4(rel, 1.0);
  cp.xy += u_jitter * cp.w;
  gl_Position = cp;
  v_uv = a_uv / 4096.0; v_layer = a_pos.w; v_tint = a_color.rgb; v_light = a_light.xy; v_mat = mat; v_rel = rel; v_nrm = n;
  v_flags = int(a_light.w * 255.0 + 0.5);
}`;

export const WATER_FS = `
${NOISE}
${TONEMAP}
${LIGHTING}
${SKY_SAMPLE}
uniform sampler2DArray u_albedo;
uniform sampler2D u_sceneColor;
uniform sampler2D u_sceneDepth;
uniform sampler2D u_skyLUT;
uniform mat4 u_viewProjNoJitter;
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform float u_time;
uniform float u_near; uniform float u_far;
uniform float u_underwater;
uniform vec3 u_waterFogColor;
uniform float u_ssrSteps;
uniform float u_wind;
uniform float u_waterStyle;
in vec2 v_uv; flat in float v_layer; in vec3 v_tint; in vec2 v_light; flat in float v_mat; in vec3 v_rel; in vec3 v_nrm; flat in int v_flags;
layout(location=0) out vec4 o_color;
layout(location=1) out vec4 o_normal;

float linDepth(float d){ float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }

// wave height field: sum of directional waves + noise (world units)
float waveH(vec2 p, float t){
  float h = 0.0;
  h += sin(dot(p, vec2(0.82, 0.57)) * 1.35 + t * 1.9) * 0.22;
  h += sin(dot(p, vec2(-0.43, 0.90)) * 2.10 + t * 2.4) * 0.14;
  h += sin(dot(p, vec2(0.97, -0.24)) * 3.30 + t * 3.1) * 0.08;
  h += (vnoise(p * 1.7 + vec2(t * 0.6, t * 0.35)) - 0.5) * 0.30;
  h += (vnoise(p * 4.1 - vec2(t * 0.9, -t * 0.5)) - 0.5) * 0.12;
  h += (vnoise(p * 9.0 + vec2(t * 1.3, t * 1.1)) - 0.5) * 0.05;
  return h;
}
vec3 waveNormal(vec2 p, float t, float strength){
  float e = 0.05;
  float h0 = waveH(p, t);
  float hx = waveH(p + vec2(e, 0.0), t), hz = waveH(p + vec2(0.0, e), t);
  return normalize(vec3(-(hx - h0) / e * strength, 1.0, -(hz - h0) / e * strength));
}

vec3 ssr(vec3 origin, vec3 dir, float jitter, out float hit){
  hit = 0.0;
  vec3 p = origin;
  float stepLen = 0.6;
  vec4 prev = u_viewProjNoJitter * vec4(p, 1.0);
  int N = int(u_ssrSteps);
  for (int i = 0; i < 48; i++) {
    if (i >= N) break;
    p += dir * stepLen * (1.0 + jitter * 0.5);
    stepLen *= 1.22;
    vec4 c = u_viewProjNoJitter * vec4(p, 1.0);
    if (c.w <= 0.0) break;
    vec3 s = c.xyz / c.w * 0.5 + 0.5;
    if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) break;
    float sd = texture(u_sceneDepth, s.xy).r;
    float sceneZ = linDepth(sd), rayZ = linDepth(s.z);
    if (rayZ > sceneZ && rayZ - sceneZ < stepLen * 2.5 + 0.5 && sd < 0.99999) {
      // binary refinement
      vec3 a = p - dir * stepLen, b = p;
      for (int k = 0; k < 5; k++) {
        vec3 m = (a + b) * 0.5;
        vec4 cm = u_viewProjNoJitter * vec4(m, 1.0);
        vec3 sm = cm.xyz / cm.w * 0.5 + 0.5;
        if (linDepth(sm.z) > linDepth(texture(u_sceneDepth, sm.xy).r)) b = m; else a = m;
      }
      vec4 cb = u_viewProjNoJitter * vec4(b, 1.0);
      vec2 uv = cb.xy / cb.w * 0.5 + 0.5;
      vec2 edge = smoothstep(vec2(0.0), vec2(0.08), uv) * smoothstep(vec2(1.0), vec2(0.92), uv);
      hit = edge.x * edge.y;
      return texture(u_sceneColor, uv).rgb;
    }
  }
  return vec3(0.0);
}

void main(){
  int mat = int(v_mat + 0.5);
  vec3 V = normalize(-v_rel);
  vec2 scr = gl_FragCoord.xy / u_screen;
  float sceneD = texture(u_sceneDepth, scr).r;
  float sceneLin = linDepth(sceneD);
  float waterLin = linDepth(gl_FragCoord.z);
  float skyL = v_light.x, blkL = v_light.y;
  vec3 wp = v_rel + u_camPos;
  float noise = ign(gl_FragCoord.xy + u_frame * 5.588);

  if (mat != 3) {
    // other translucent blocks (ice, portal, stained glass): textured alpha blend over the refracted scene
    vec4 t = texture(u_albedo, vec3(v_uv, v_layer));
    if (t.a < 0.01) discard;
    vec3 alb = srgbToLinear(t.rgb * v_tint);
    vec3 N = normalize(v_nrm) * (gl_FrontFacing ? 1.0 : -1.0);
    float inR;
    float sh = shadowLookup(v_rel, N, dot(N, u_lightDir), noise, inR);
    vec3 lit = alb * (u_lightColor * sh * max(dot(N, u_lightDir), 0.0) + skyAmbient(N) * skyL * skyL * skyL + u_torchColor * pow(blkL, 4.0) * 3.0);
    if (mat == 11) lit = alb * 6.0;
    vec3 behind = texture(u_sceneColor, scr + N.xz * 0.01).rgb;
    vec3 R = reflect(-V, N);
    vec3 env = sampleSkyLUT(u_skyLUT, normalize(vec3(R.x, abs(R.y), R.z))) * smoothstep(0.6, 1.0, skyL);
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 col = mix(behind * mix(vec3(1.0), alb, t.a), lit, t.a * 0.85) + env * F * 0.5;
    o_color = vec4(col, 1.0);
    o_normal = vec4(N * 0.5 + 0.5, 0.9);
    return;
  }

  // ---- water ----
  // water quads are meshed with both windings so they can be seen from below; above water only the
  // front-facing side is valid (the back-facing copy would otherwise z-fight and take the underwater path)
  if (u_underwater < 0.5 && !gl_FrontFacing) discard;
  vec3 Ng = normalize(v_nrm);
  bool top = Ng.y > 0.5;
  bool fromBelow = !gl_FrontFacing || u_underwater > 0.5;
  vec3 N = Ng;
  if (top) {
    float strength = mix(0.25, 0.55, u_wind) * (fromBelow ? 0.6 : 1.0);
    N = waveNormal(wp.xz, u_time, strength);
    // fade normals with distance to avoid aliasing
    float d = length(v_rel);
    N = normalize(mix(N, vec3(0.0, 1.0, 0.0), smoothstep(30.0, 140.0, d) * 0.7));
    // rain ripples
    if (u_wetness > 0.0) {
      vec2 cell = floor(wp.xz * 2.0);
      vec2 f = fract(wp.xz * 2.0) - 0.5;
      float ph = fract(u_time * 0.9 + hash12(cell));
      float r = length(f - (hash22(cell) - 0.5) * 0.4);
      float ring = sin((r - ph * 0.6) * 40.0) * smoothstep(0.0, 0.1, ph) * (1.0 - ph) * smoothstep(0.35, 0.0, r);
      N = normalize(N + vec3(f.x, 0.0, f.y) * ring * 0.8 * u_wetness * smoothstep(0.8, 1.0, skyL));
    }
    if (fromBelow) N = -N;
  } else N = Ng * (gl_FrontFacing ? 1.0 : -1.0);

  vec3 tint = v_tint;   // biome water color
  float NdotV = max(dot(N, V), 0.0);
  float F = 0.02 + 0.98 * pow(1.0 - NdotV, 5.0);

  // refraction
  vec2 refrOff = N.xz * 0.06 / max(1.0, waterLin * 0.15) * (top ? 1.0 : 0.3);
  vec2 ruv = scr + refrOff;
  float rD = texture(u_sceneDepth, ruv).r;
  if (linDepth(rD) < waterLin) { ruv = scr; rD = sceneD; }
  vec3 behind = texture(u_sceneColor, ruv).rgb;
  float thick = max(0.0, linDepth(rD) - waterLin);
  if (rD >= 0.99999) thick = 60.0;

  // absorption + in-scattering inside the water body
  vec3 absorb = vec3(0.45, 0.075, 0.035) * 1.2;
  vec3 waterAlbedo = srgbToLinear(tint) * vec3(0.55, 0.85, 1.0);
  vec3 T = exp(-absorb * thick);
  float sunVis = 0.0, inR;
  sunVis = shadowLookup(v_rel, vec3(0.0, 1.0, 0.0), 1.0, noise, inR);
  if (inR < 0.5) sunVis = smoothstep(0.8, 1.0, skyL);
  vec3 scatterLight = (u_lightColor * max(u_lightDir.y, 0.0) * 0.6 * sunVis + skyAmbient(vec3(0.0, 1.0, 0.0)) * 0.9) * skyL * skyL + u_torchColor * pow(blkL, 4.0);
  vec3 inscatter = waterAlbedo * scatterLight * 0.18;
  vec3 refracted = behind * T + inscatter * (1.0 - T);

  if (fromBelow) {
    // looking up at the surface from underwater: Snell window + total internal reflection
    float cosT = dot(-N, V);
    float tir = smoothstep(0.62, 0.70, 1.0 - max(dot(V, vec3(0.0, -1.0, 0.0)), 0.0));
    vec3 abovee = texture(u_sceneColor, scr + N.xz * 0.04).rgb;
    if (texture(u_sceneDepth, scr + N.xz * 0.04).r >= 0.99999) abovee = sampleSkyLUT(u_skyLUT, normalize(refract(-V, N, 1.33)));
    vec3 deep = u_waterFogColor * 0.4;
    vec3 col = mix(abovee * 0.9, deep, tir);
    o_color = vec4(col, 1.0);
    o_normal = vec4(N * 0.5 + 0.5, 1.0);
    return;
  }

  if (u_waterStyle > 0.5) {
    // classic style: vanilla animated water texture (biome tinted, translucent) lit by the shader lighting,
    // flat surface with a mild fresnel sky reflection and sun highlight
    vec3 Nf = top ? vec3(0.0, 1.0, 0.0) : Ng * (gl_FrontFacing ? 1.0 : -1.0);
    vec4 wt = texture(u_albedo, vec3(v_uv, v_layer));
    vec3 walb = srgbToLinear(wt.rgb * tint);
    float sh = shadowLookup(v_rel, Nf, dot(Nf, u_lightDir), noise, inR);
    if (inR < 0.5) sh = smoothstep(0.8, 1.0, skyL);
    vec3 litW = walb * (u_lightColor * sh * max(dot(Nf, u_lightDir), 0.0) + skyAmbient(Nf) * skyL * skyL * skyL + u_torchColor * pow(blkL, 4.0) * 3.0 + 0.004);
    vec3 behindC = texture(u_sceneColor, scr).rgb;
    vec3 colC = mix(behindC, litW, clamp(wt.a, 0.0, 1.0));
    float NdotVf = max(dot(Nf, V), 0.0);
    float Fc = 0.02 + 0.98 * pow(1.0 - NdotVf, 5.0);
    vec3 Rf = reflect(-V, Nf);
    vec3 skyC = sampleSkyLUT(u_skyLUT, normalize(vec3(Rf.x, max(Rf.y, 0.0), Rf.z))) * smoothstep(0.5, 1.0, skyL);
    colC = mix(colC, skyC, Fc * 0.6);
    vec3 Hf = normalize(u_lightDir + V);
    float specC = D_GGX(max(dot(Nf, Hf), 0.0), 0.05) * V_SmithGGX(NdotVf, max(dot(Nf, u_lightDir), 0.0), 0.05) * max(dot(Nf, u_lightDir), 0.0);
    colC += min(u_lightColor * specC * 0.02 * sh, vec3(20.0));
    o_color = vec4(colC, 1.0);
    o_normal = vec4(Nf * 0.5 + 0.5, 1.0);
    return;
  }

  // reflection
  vec3 R = reflect(-V, N);
  if (R.y < 0.0 && top) R.y = -R.y * 0.3;
  float hit;
  vec3 refl = vec3(0.0);
  if (u_ssrSteps > 0.5) refl = ssr(v_rel + N * 0.05, normalize(R), noise, hit); else hit = 0.0;
  vec3 skyRefl = sampleSkyLUT(u_skyLUT, normalize(vec3(R.x, max(R.y, 0.0), R.z)));
  float skyOcc = smoothstep(0.5, 1.0, skyL);
  skyRefl *= skyOcc;
  // clouds are not in the scene buffer, approximate their reflection with the sky LUT brightness
  refl = mix(skyRefl, refl, hit);

  // sun specular (sharp GGX, gives the glitter path at sunset)
  vec3 L = u_lightDir;
  vec3 H = normalize(L + V);
  float NdotH = max(dot(N, H), 0.0), NdotL = max(dot(N, L), 0.0);
  float a = 0.012;
  float spec = D_GGX(NdotH, a) * V_SmithGGX(NdotV, NdotL, a) * NdotL;
  float shadowS = shadowLookup(v_rel, vec3(0.0, 1.0, 0.0), 1.0, noise, inR);
  if (inR < 0.5) shadowS = skyOcc;
  vec3 sun = u_lightColor * spec * F_Schlick(vec3(0.02), max(dot(H, V), 0.0)) * shadowS * 1.0;

  vec3 col = mix(refracted, refl, F) + min(sun, vec3(60.0));
  o_color = vec4(col, 1.0);
  o_normal = vec4(N * 0.5 + 0.5, 1.0);
}`;
