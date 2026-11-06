// Shader-mode post processing GLSL: noise volumes, clouds, volumetric light, composite, TAA, bloom, final grade.
import { NOISE, ATMOSPHERE, TONEMAP } from './common.js';
import { SKY_SAMPLE } from '../sky.js';
import { SHADOW_COMMON } from './terrain.js';

// ---- tileable 3D noise generators (rendered slice by slice into 3D textures) ----
export const NOISE3D_FS = `
uniform float u_slice; uniform float u_size; uniform int u_kind;
in vec2 v_uv; out vec4 o;
vec3 hash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float worley(vec3 p, float period){
  vec3 id = floor(p), f = fract(p);
  float d = 1e9;
  for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(x, y, z);
    vec3 c = mod(id + o, period);
    vec3 r = o + hash33(c) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
float grad(vec3 c, vec3 f, float period){ vec3 g = hash33(mod(c, period)) * 2.0 - 1.0; return dot(normalize(g), f); }
float perlin(vec3 p, float period){
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = grad(i, f, period), n100 = grad(i + vec3(1,0,0), f - vec3(1,0,0), period);
  float n010 = grad(i + vec3(0,1,0), f - vec3(0,1,0), period), n110 = grad(i + vec3(1,1,0), f - vec3(1,1,0), period);
  float n001 = grad(i + vec3(0,0,1), f - vec3(0,0,1), period), n101 = grad(i + vec3(1,0,1), f - vec3(1,0,1), period);
  float n011 = grad(i + vec3(0,1,1), f - vec3(0,1,1), period), n111 = grad(i + vec3(1,1,1), f - vec3(1,1,1), period);
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z) * 0.5 + 0.5;
}
float worleyFbm(vec3 p, float f){ return worley(p * f, f) * 0.625 + worley(p * f * 2.0, f * 2.0) * 0.25 + worley(p * f * 4.0, f * 4.0) * 0.125; }
float perlinFbm(vec3 p, float f){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += perlin(p * f, f) * a; f *= 2.0; a *= 0.5; } return s / 0.97; }
float remap(float v, float a, float b, float c, float d){ return c + (v - a) / (b - a) * (d - c); }
void main(){
  vec3 p = vec3(v_uv, (u_slice + 0.5) / u_size);
  if (u_kind == 0) {
    float pf = perlinFbm(p, 4.0);
    float w1 = worleyFbm(p, 4.0), w2 = worleyFbm(p, 8.0), w3 = worleyFbm(p, 16.0);
    float pw = remap(pf, 0.0, 1.0, w1, 1.0);
    o = vec4(clamp(pw, 0.0, 1.0), w1, w2, w3);
  } else {
    o = vec4(worleyFbm(p, 2.0), worleyFbm(p, 4.0), worleyFbm(p, 8.0), 1.0);
  }
}`;

export const CLOUD_FS = `
${NOISE}
${ATMOSPHERE}
${SKY_SAMPLE}
uniform sampler3D u_shape; uniform sampler3D u_detail;
uniform sampler2D u_depth; uniform sampler2D u_lut;
uniform mat4 u_invViewProj;
uniform vec3 u_camPos;
uniform vec3 u_lightDir; uniform vec3 u_lightColor; uniform vec3 u_ambUp; uniform vec3 u_ambHorizon;
uniform float u_coverage; uniform float u_cirrus; uniform float u_rain; uniform float u_time; uniform float u_frame;
uniform float u_steps; uniform float u_lightSteps;
uniform float u_near; uniform float u_far;
uniform float u_flash;
in vec2 v_uv; out vec4 o;

const float CB = 640.0, CT = 1250.0, PRAD = 60000.0;
float linDepth(float d){ float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
vec2 shell(vec3 ro, vec3 rd, float r){ return raySphere(ro, rd, r); }
float remap(float v, float a, float b, float c, float d){ return c + (v - a) / max(b - a, 1e-5) * (d - c); }
vec2 windOff(){ return vec2(u_time * 6.0, u_time * 2.5); }

float cloudDensity(vec3 p, float h, bool cheap){
  vec2 w = windOff();
  vec2 q = (p.xz + w) / 9000.0;
  float wm = fbm2(q * 2.0) * 0.75 + fbm2(q * 7.0 + 3.1) * 0.35;
  float cov = clamp(u_coverage, 0.0, 1.0);
  float local = clamp(wm - (1.0 - cov) * 0.9, 0.0, 1.0) * 1.6;
  // height profile: rounded bases, puffy tops; stratus when overcast
  float cum = smoothstep(0.0, 0.12, h) * smoothstep(1.0, 0.55, h);
  float strat = smoothstep(0.0, 0.08, h) * smoothstep(0.45, 0.25, h);
  float prof = mix(cum, strat, smoothstep(0.75, 1.0, cov) * 0.7);
  vec3 sp = (p + vec3(w.x, 0.0, w.y) * 1.3) / 1600.0;
  vec4 s = texture(u_shape, sp);
  float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float shape = remap(s.r, fbm - 1.0, 1.0, 0.0, 1.0);
  float d = clamp(remap(shape * prof, 1.0 - local, 1.0, 0.0, 1.0), 0.0, 1.0) * local;
  if (d <= 0.0 || cheap) return d;
  vec3 dt = texture(u_detail, p / 380.0 + vec3(u_time * 0.01, -u_time * 0.004, 0.0)).rgb;
  float df = dt.r * 0.625 + dt.g * 0.25 + dt.b * 0.125;
  float er = mix(df, 1.0 - df, clamp(h * 4.0, 0.0, 1.0));
  d = clamp(remap(d, er * 0.35, 1.0, 0.0, 1.0), 0.0, 1.0);
  return d;
}
float HG(float c, float g){ float g2 = g * g; return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }

void main(){
  vec4 ndc = vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec4 wp = u_invViewProj * ndc;
  vec3 rd = normalize(wp.xyz / wp.w);
  float sceneD = texture(u_depth, v_uv).r;
  float sceneDist = sceneD >= 0.99999 ? 1e9 : linDepth(sceneD) / max(dot(rd, normalize((u_invViewProj * vec4(0.0, 0.0, 1.0, 1.0)).xyz)), 0.1);
  // planet-curved shell centered below the camera
  vec3 ro = vec3(0.0, PRAD + u_camPos.y, 0.0);
  vec2 b0 = shell(ro, rd, PRAD + CB), b1 = shell(ro, rd, PRAD + CT);
  float camH = u_camPos.y;
  // rays that hit the ground before reaching the cloud layer see no clouds
  vec2 gnd = shell(ro, rd, PRAD + 62.0);
  if (camH < CB && gnd.x > 0.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float t0, t1;
  if (camH < CB) { t0 = b0.y; t1 = b1.y; }
  else if (camH > CT) { if (b1.x < 0.0) { o = vec4(0.0, 0.0, 0.0, 1.0); return; } t0 = b1.x; t1 = b0.x > 0.0 ? b0.x : b1.y; }
  else { t0 = 0.0; t1 = b0.x > 0.0 ? b0.x : b1.y; }
  t1 = min(t1, t0 + 30000.0);
  if (t1 <= t0 || t0 > sceneDist || rd.y < -0.3 && camH < CB) { o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  t1 = min(t1, sceneDist);
  float steps = mix(u_steps, u_steps * 0.6, clamp(rd.y, 0.0, 1.0));
  float dt = (t1 - t0) / steps;
  float jitter = ign(gl_FragCoord.xy + mod(u_frame, 64.0) * 7.31);
  float cosT = dot(rd, u_lightDir);
  float phase = mix(HG(cosT, 0.8), HG(cosT, -0.25), 0.35) * 0.9 + HG(cosT, 0.0) * 0.1;
  vec3 T = vec3(1.0);
  vec3 S = vec3(0.0);
  float sigma = 0.045;
  float firstHit = -1.0;
  vec3 camXZ = vec3(u_camPos.x, 0.0, u_camPos.z);
  for (int i = 0; i < 96; i++) {
    if (float(i) >= steps) break;
    float t = t0 + (float(i) + jitter) * dt;
    vec3 pr = ro + rd * t;
    float alt = length(pr) - PRAD;
    float h = (alt - CB) / (CT - CB);
    if (h < 0.0 || h > 1.0) continue;
    vec3 p = vec3(pr.x, alt, pr.z) + camXZ;
    float d = cloudDensity(p, h, false);
    if (d > 0.002) {
      if (firstHit < 0.0) firstHit = t;
      // light march toward the sun
      float od = 0.0, ls = 40.0;
      vec3 lp = p;
      for (int j = 0; j < 6; j++) {
        if (float(j) >= u_lightSteps) break;
        lp += u_lightDir * ls;
        float lh = (lp.y - CB) / (CT - CB);
        if (lh > 1.0) break;
        od += cloudDensity(lp, clamp(lh, 0.0, 1.0), j > 2) * ls;
        ls *= 1.8;
      }
      // multiple-scattering octaves (Wrenninge)
      vec3 sun = vec3(0.0);
      float a = 1.0, bb = 1.0, c = 1.0;
      for (int k = 0; k < 3; k++) {
        sun += a * exp(-od * sigma * bb) * mix(HG(cosT * c, 0.8), HG(cosT * c, -0.25), 0.35);
        a *= 0.5; bb *= 0.4; c *= 0.6;
      }
      float powder = 1.0 - exp(-d * dt * sigma * 2.0);
      sun *= mix(1.0, powder * 2.0, 0.5);
      vec3 amb = mix(u_ambHorizon * 0.6, u_ambUp * 1.1, h) * (0.6 + 0.4 * h);
      vec3 Lsc = u_lightColor * sun * 7.0 + amb * 1.6 + vec3(u_flash * 3.0);
      float ext = d * sigma;
      vec3 Ts = vec3(exp(-ext * dt));
      S += T * Lsc * ext * (1.0 - Ts) / max(ext, 1e-6);
      T *= Ts;
      if (T.r < 0.01) break;
    }
  }
  // cirrus layer (2D, high altitude)
  if (u_cirrus > 0.0 && rd.y > 0.0) {
    vec2 bc = shell(ro, rd, PRAD + 7000.0);
    if (bc.y > 0.0) {
      vec3 pc = ro + rd * bc.y + camXZ;
      vec2 cq = (pc.xz + windOff() * 3.0) / 6000.0;
      float c = fbm2(cq * vec2(1.0, 3.0) + fbm2(cq * 2.0) * 1.5);
      c = smoothstep(0.55, 0.9, c) * u_cirrus * 0.6 * (1.0 - u_rain);
      vec3 cl = u_lightColor * mix(HG(cosT, 0.6), 0.08, 0.5) * 5.0 + u_ambUp * 1.4;
      S += T * cl * c;
      T *= 1.0 - c;
    }
  }
  // aerial perspective on distant clouds
  if (firstHit > 0.0) {
    float fade = exp(-firstHit / 22000.0);
    vec3 sky = sampleSkyLUT(u_lut, rd);
    S = mix(sky * (1.0 - T), S, fade);
  }
  o = vec4(S, T.r);
}`;

// temporal accumulation of clouds (reprojection by view direction since clouds are far away)
export const CLOUD_TAA_FS = `
uniform sampler2D u_cur; uniform sampler2D u_hist;
uniform mat4 u_invViewProj; uniform mat4 u_prevViewProjRot;
uniform vec2 u_texel; uniform float u_reset;
in vec2 v_uv; out vec4 o;
void main(){
  vec4 c = texture(u_cur, v_uv);
  vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(wp.xyz / wp.w);
  vec4 pc = u_prevViewProjRot * vec4(rd, 0.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  vec4 mn = c, mx = c;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec4 s = texture(u_cur, v_uv + vec2(x, y) * u_texel); mn = min(mn, s); mx = max(mx, s); }
  vec4 h = texture(u_hist, puv);
  h = clamp(h, mn - (mx - mn) * 0.25, mx + (mx - mn) * 0.25);
  float valid = (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0 && u_reset < 0.5) ? 1.0 : 0.0;
  o = mix(c, h, 0.88 * valid);
}`;

export const VOLUMETRIC_FS = `
${NOISE}
${SHADOW_COMMON}
uniform sampler2D u_depth;
uniform sampler2DShadow u_shadowMap; uniform mat4 u_shadowMat;
uniform mat4 u_invViewProj; uniform vec3 u_camPos;
uniform vec3 u_lightDir; uniform vec3 u_lightColor; uniform vec3 u_ambUp;
uniform float u_density; uniform float u_mist; uniform float u_rain; uniform float u_time; uniform float u_frame;
uniform float u_steps; uniform float u_near; uniform float u_far; uniform float u_underwater; uniform vec3 u_waterColor;
uniform float u_maxDist; uniform float u_caveFactor;
in vec2 v_uv; out vec4 o;
float linDepth(float d){ float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
float HG(float c, float g){ float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
void main(){
  vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(wp.xyz / wp.w);
  float d = texture(u_depth, v_uv).r;
  vec4 sp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  float dist = d >= 0.99999 ? u_maxDist : min(length(sp.xyz / sp.w), u_maxDist);
  float jitter = ign(gl_FragCoord.xy + mod(u_frame, 64.0) * 5.588);
  int N = int(u_steps);
  float dt = dist / u_steps;
  float cosT = dot(rd, u_lightDir);
  vec3 T = vec3(1.0), S = vec3(0.0);
  bool uw = u_underwater > 0.5;
  float phase = uw ? HG(cosT, 0.75) * 0.7 + 0.3 / (4.0 * 3.14159) : HG(cosT, 0.72) * 0.55 + HG(cosT, -0.2) * 0.1 + 0.35 / (4.0 * 3.14159);
  for (int i = 0; i < 48; i++) {
    if (i >= N) break;
    float t = (float(i) + jitter) * dt;
    vec3 p = rd * t;
    float y = p.y + u_camPos.y;
    float dens;
    vec3 sigS, sigE;
    if (uw) {
      dens = 1.0;
      sigS = u_waterColor * 0.05 + 0.012; sigE = vec3(0.25, 0.06, 0.04) + sigS;
    } else {
      float hf = exp(-max(y - 62.0, 0.0) / 28.0);
      float mist = u_mist * exp(-max(y - 64.0, 0.0) / 10.0) * (0.55 + 0.45 * vnoise(vec2((p.x + u_camPos.x) * 0.03 + u_time * 0.05, (p.z + u_camPos.z) * 0.03)));
      dens = u_density * hf + mist + u_rain * 0.006;
      sigS = vec3(dens); sigE = vec3(dens) * 1.05;
    }
    vec4 sc = u_shadowMat * vec4(p, 1.0);
    vec3 q = shadowDistort(sc.xyz) * 0.5 + 0.5;
    float vis = (abs(sc.x) < 0.98 && abs(sc.y) < 0.98) ? texture(u_shadowMap, vec3(q.xy, q.z - 0.0002)) : 1.0;
    if (uw) vis *= 0.6 + 0.4 * vnoise(vec2((p.x + u_camPos.x) * 0.8 + u_time * 0.4, (p.z + u_camPos.z) * 0.8));
    vec3 L = u_lightColor * vis * phase * (1.0 - u_caveFactor) + u_ambUp * (uw ? 0.08 : 0.05) * (1.0 - u_caveFactor * 0.9);
    vec3 Ts = exp(-sigE * dt);
    S += T * L * sigS * (1.0 - Ts) / max(sigE, vec3(1e-6));
    T *= Ts;
  }
  o = vec4(S, dot(T, vec3(0.3333)));
  if (uw) o.a = T.g;
}`;

export const COMPOSITE_FS = `
${NOISE}
${ATMOSPHERE}
${SKY_SAMPLE}
${TONEMAP}
uniform sampler2D u_color; uniform sampler2D u_depth; uniform sampler2D u_clouds; uniform sampler2D u_vol; uniform sampler2D u_lut;
uniform mat4 u_invViewProj; uniform vec3 u_camPos;
uniform float u_near; uniform float u_far; uniform float u_renderDist;
uniform float u_aerial; uniform float u_underwater; uniform vec3 u_waterFog; uniform float u_inLava;
uniform vec3 u_sunDir; uniform float u_rainbow; uniform vec3 u_sunColor;
uniform vec2 u_halfTexel;
uniform float u_blindness;
in vec2 v_uv; out vec4 o;
float linDepth(float d){ float z = d * 2.0 - 1.0; return 2.0 * u_near * u_far / (u_far + u_near - z * (u_far - u_near)); }
vec4 upsample(sampler2D tex, vec2 uv, float zc){
  // depth-aware 4 tap upsample from half resolution
  vec4 acc = vec4(0.0); float wsum = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(i & 1, i >> 1) * 2.0 - 1.0;
    vec2 suv = uv + o * u_halfTexel * 0.5;
    float zs = linDepth(texture(u_depth, suv).r);
    float w = 1.0 / (abs(zs - zc) / max(zc, 1.0) * 40.0 + 0.05);
    acc += texture(tex, suv) * w; wsum += w;
  }
  return acc / wsum;
}
vec3 rainbowColor(float a){
  // angle from antisolar point in degrees, primary bow ~ 40.5-42.5 deg
  float x = (a - 40.6) / 2.2;
  if (x < -0.2 || x > 1.2) {
    float x2 = (a - 50.5) / 3.0; // faint secondary (reversed)
    if (x2 < 0.0 || x2 > 1.0) return vec3(0.0);
    x = 1.0 - x2;
    return 0.35 * clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0).bgr * smoothstep(0.0, 0.2, x2) * smoothstep(1.0, 0.8, x2);
  }
  vec3 c = clamp(vec3(abs(x * 6.0 - 3.0) - 1.0, 2.0 - abs(x * 6.0 - 2.0), 2.0 - abs(x * 6.0 - 4.0)), 0.0, 1.0).bgr;
  return c * smoothstep(-0.2, 0.15, x) * smoothstep(1.2, 0.85, x);
}
void main(){
  vec3 col = texture(u_color, v_uv).rgb;
  float d = texture(u_depth, v_uv).r;
  vec4 wp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 rel = wp.xyz / wp.w;
  vec4 fp = u_invViewProj * vec4(v_uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(fp.xyz / fp.w);
  bool sky = d >= 0.99999;
  float dist = sky ? 1e6 : length(rel);
  float zc = linDepth(d);
  vec4 cl = texture(u_clouds, v_uv);
  vec3 skyCol = sampleSkyLUT(u_lut, normalize(vec3(rd.x, max(rd.y, 0.015), rd.z)));
  if (sky) {
    col = col * cl.a + cl.rgb;
  } else if (u_underwater < 0.5) {
    // aerial perspective (height-dependent haze) + border fog toward the sky color at the render distance
    float h = rel.y + u_camPos.y;
    float dens = u_aerial * exp(-max(h - 63.0, 0.0) / 120.0);
    float f = 1.0 - exp(-dist * dens);
    col = mix(col, skyCol, f);
    float hd = length(rel.xz);
    float border = smoothstep(u_renderDist * 0.78, u_renderDist * 0.98, hd);
    col = mix(col, skyCol * cl.a + cl.rgb, border);
  }
  // rainbow opposite the sun after rain
  if (u_rainbow > 0.0 && u_sunDir.y > -0.05 && u_underwater < 0.5) {
    float a = degrees(acos(clamp(dot(rd, -u_sunDir), -1.0, 1.0)));
    vec3 rb = rainbowColor(a) * u_rainbow * smoothstep(-0.05, 0.1, u_sunDir.y) * smoothstep(0.7, 0.2, u_sunDir.y);
    float occ = sky ? cl.a : smoothstep(60.0, 300.0, dist) * 0.6;
    col += rb * dot(u_sunColor, vec3(0.3)) * 0.35 * occ * smoothstep(-0.02, 0.05, rd.y);
  }
  vec4 vol = upsample(u_vol, v_uv, zc);
  col = col * vol.a + vol.rgb;
  if (u_inLava > 0.5) col = mix(col, vec3(1.5, 0.35, 0.02), 1.0 - exp(-dist * 1.5));
  if (u_blindness > 0.0) col *= 1.0 - u_blindness;
  o = vec4(max(col, vec3(0.0)), 1.0);
}`;

export const TAA_FS = `
${TONEMAP}
uniform sampler2D u_cur; uniform sampler2D u_hist; uniform sampler2D u_depth;
uniform mat4 u_invViewProj; uniform mat4 u_prevViewProj; uniform vec3 u_camDelta;
uniform vec2 u_texel; uniform float u_reset; uniform vec2 u_jitterUV;
in vec2 v_uv; out vec4 o;
vec3 toYCoCg(vec3 c){ return vec3(c.r * 0.25 + c.g * 0.5 + c.b * 0.25, c.r * 0.5 - c.b * 0.5, -c.r * 0.25 + c.g * 0.5 - c.b * 0.25); }
vec3 fromYCoCg(vec3 c){ return vec3(c.x + c.y - c.z, c.x + c.z, c.x - c.y - c.z); }
vec3 tm(vec3 c){ return c / (1.0 + luma(c)); }
vec3 itm(vec3 c){ return c / max(1.0 - luma(c), 1e-4); }
void main(){
  vec2 uv = v_uv;
  // closest depth in a cross for reprojection
  float dmin = texture(u_depth, uv).r;
  dmin = min(dmin, texture(u_depth, uv + vec2(u_texel.x, 0.0)).r);
  dmin = min(dmin, texture(u_depth, uv - vec2(u_texel.x, 0.0)).r);
  dmin = min(dmin, texture(u_depth, uv + vec2(0.0, u_texel.y)).r);
  dmin = min(dmin, texture(u_depth, uv - vec2(0.0, u_texel.y)).r);
  vec4 wp = u_invViewProj * vec4(uv * 2.0 - 1.0, dmin * 2.0 - 1.0, 1.0);
  vec3 rel = wp.xyz / wp.w;
  if (dmin >= 0.99999) rel = normalize(rel) * 50000.0;
  vec4 pc = u_prevViewProj * vec4(rel + u_camDelta, 1.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  vec3 c0 = toYCoCg(tm(texture(u_cur, uv).rgb));
  vec3 c1 = toYCoCg(tm(texture(u_cur, uv + vec2(u_texel.x, 0.0)).rgb));
  vec3 c2 = toYCoCg(tm(texture(u_cur, uv - vec2(u_texel.x, 0.0)).rgb));
  vec3 c3 = toYCoCg(tm(texture(u_cur, uv + vec2(0.0, u_texel.y)).rgb));
  vec3 c4 = toYCoCg(tm(texture(u_cur, uv - vec2(0.0, u_texel.y)).rgb));
  vec3 m1 = (c0 + c1 + c2 + c3 + c4) / 5.0;
  vec3 m2 = (c0 * c0 + c1 * c1 + c2 * c2 + c3 * c3 + c4 * c4) / 5.0;
  vec3 mn = min(c0, min(min(c1, c2), min(c3, c4))), mx = max(c0, max(max(c1, c2), max(c3, c4)));
  vec3 c = fromYCoCg(c0);
  vec3 sd = sqrt(max(m2 - m1 * m1, 0.0));
  vec3 lo = max(mn, m1 - sd * 1.5), hi = min(mx, m1 + sd * 1.5);
  vec3 h = toYCoCg(tm(texture(u_hist, puv).rgb));
  h = fromYCoCg(clamp(h, lo, hi));
  float valid = (puv.x > 0.0 && puv.x < 1.0 && puv.y > 0.0 && puv.y < 1.0 && u_reset < 0.5) ? 1.0 : 0.0;
  float motion = length((puv - uv) / u_texel);
  float w = valid * mix(0.92, 0.75, clamp(motion / 20.0, 0.0, 1.0));
  vec3 res = mix(c, h, w);
  o = vec4(itm(res), 1.0);
}`;

export const SHARPEN_FS = `
${TONEMAP}
uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_amount;
in vec2 v_uv; out vec4 o;
void main(){
  vec3 c = texture(u_tex, v_uv).rgb;
  vec3 n = texture(u_tex, v_uv + vec2(0.0, u_texel.y)).rgb + texture(u_tex, v_uv - vec2(0.0, u_texel.y)).rgb + texture(u_tex, v_uv + vec2(u_texel.x, 0.0)).rgb + texture(u_tex, v_uv - vec2(u_texel.x, 0.0)).rgb;
  vec3 s = c + (c * 4.0 - n) * u_amount * 0.25;
  o = vec4(max(s, c * 0.5), 1.0);
}`;

export const DOWNSAMPLE_FS = `
${TONEMAP}
uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_first;
in vec2 v_uv; out vec4 o;
vec3 s(vec2 off){ return texture(u_tex, v_uv + off * u_texel).rgb; }
float kw(vec3 c){ return 1.0 / (1.0 + luma(c)); }
void main(){
  vec3 a = s(vec2(-2, 2)), b = s(vec2(0, 2)), c = s(vec2(2, 2));
  vec3 d = s(vec2(-2, 0)), e = s(vec2(0, 0)), f = s(vec2(2, 0));
  vec3 g = s(vec2(-2, -2)), h = s(vec2(0, -2)), i = s(vec2(2, -2));
  vec3 j = s(vec2(-1, 1)), k = s(vec2(1, 1)), l = s(vec2(-1, -1)), m = s(vec2(1, -1));
  vec3 r;
  if (u_first > 0.5) {
    vec3 g0 = (a + b + d + e) * 0.25, g1 = (b + c + e + f) * 0.25, g2 = (d + e + g + h) * 0.25, g3 = (e + f + h + i) * 0.25, g4 = (j + k + l + m) * 0.25;
    float w0 = kw(g0), w1 = kw(g1), w2 = kw(g2), w3 = kw(g3), w4 = kw(g4);
    r = (g0 * w0 * 0.125 + g1 * w1 * 0.125 + g2 * w2 * 0.125 + g3 * w3 * 0.125 + g4 * w4 * 0.5) / (w0 * 0.125 + w1 * 0.125 + w2 * 0.125 + w3 * 0.125 + w4 * 0.5);
  } else {
    r = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  o = vec4(min(r, vec3(500.0)), 1.0);
}`;

export const UPSAMPLE_FS = `
uniform sampler2D u_tex; uniform vec2 u_texel; uniform float u_radius;
in vec2 v_uv; out vec4 o;
void main(){
  vec2 t = u_texel * u_radius;
  vec3 r = texture(u_tex, v_uv).rgb * 4.0;
  r += (texture(u_tex, v_uv + vec2(-t.x, 0)).rgb + texture(u_tex, v_uv + vec2(t.x, 0)).rgb + texture(u_tex, v_uv + vec2(0, -t.y)).rgb + texture(u_tex, v_uv + vec2(0, t.y)).rgb) * 2.0;
  r += texture(u_tex, v_uv + vec2(-t.x, -t.y)).rgb + texture(u_tex, v_uv + vec2(t.x, -t.y)).rgb + texture(u_tex, v_uv + vec2(-t.x, t.y)).rgb + texture(u_tex, v_uv + vec2(t.x, t.y)).rgb;
  o = vec4(r / 16.0, 1.0);
}`;

export const EXPOSURE_FS = `
${TONEMAP}
uniform sampler2D u_tex; uniform sampler2D u_prev; uniform float u_dt; uniform float u_reset;
in vec2 v_uv; out vec4 o;
void main(){
  float s = 0.0, wsum = 0.0;
  for (int y = 0; y < 8; y++) for (int x = 0; x < 8; x++) {
    vec2 uv = (vec2(x, y) + 0.5) / 8.0;
    float w = exp(-dot(uv - 0.5, uv - 0.5) * 6.0);
    s += log(max(luma(texture(u_tex, uv).rgb), 1e-4)) * w; wsum += w;
  }
  float avg = exp(s / wsum);
  float prev = texture(u_prev, vec2(0.5)).r;
  float target = clamp(avg, 0.0006, 50.0);
  float speed = target > prev ? 2.2 : 1.1;
  float a = u_reset > 0.5 ? 1.0 : 1.0 - exp(-u_dt * speed);
  o = vec4(exp(mix(log(max(prev, 1e-5)), log(target), a)), 0.0, 0.0, 1.0);
}`;

export const FINAL_FS = `
${TONEMAP}
${NOISE}
uniform sampler2D u_color; uniform sampler2D u_bloom; uniform sampler2D u_exposure;
uniform float u_bloomStrength; uniform float u_exposureBias; uniform float u_underwater; uniform float u_time;
uniform float u_saturation; uniform float u_vignette; uniform float u_nightDesat;
in vec2 v_uv; out vec4 o;
void main(){
  vec2 uv = v_uv;
  if (u_underwater > 0.5) uv += vec2(sin(uv.y * 30.0 + u_time * 2.0), cos(uv.x * 25.0 + u_time * 1.7)) * 0.0012;
  vec3 c = texture(u_color, uv).rgb;
  vec3 b = texture(u_bloom, uv).rgb;
  c = mix(c, b, u_bloomStrength);
  float avg = texture(u_exposure, vec2(0.5)).r;
  float key = 0.16 * u_exposureBias;
  float exposure = clamp(key / max(avg, 1e-4), 0.25, 160.0);
  c *= exposure;
  // purkinje-like night desaturation
  float L = luma(c);
  c = mix(c, vec3(L) * vec3(0.85, 0.95, 1.15), u_nightDesat * smoothstep(0.25, 0.0, L) * 0.6);
  c = acesFitted(c * 1.05);
  float l2 = luma(c);
  c = mix(vec3(l2), c, u_saturation);
  vec2 q = v_uv - 0.5;
  c *= 1.0 - dot(q, q) * u_vignette;
  c = linearToSrgb(c);
  c += (hash12(gl_FragCoord.xy + fract(u_time) * 100.0) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

export const COPY_FS = `uniform sampler2D u_tex; in vec2 v_uv; out vec4 o; void main(){ o = texture(u_tex, v_uv); }`;
