// rgl/long/comp.js —— 合成：体积光 / 云隙光、屏幕空间反射、水下雾与光束、云叠加（goodGL compositeFS）。GLSL 一字未改。
import { glsl, Fps, Fpv } from '../pass.js';
import { NOISE, CAUSTIC, MEDIUM } from '../../water/glsl.js';
const lib = x => glsl([x]);
// rgl/shaders/comp.js —— goodGL compositeFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
export const comp = (Pass, X = {}) => Pass({ tag: 'comp' })`#version 300 es
precision highp float; precision highp sampler2DShadow;
#define SSR_ON ${() => Fpv.pbr === false ? 0 : 1}
#define CLOUDS_ON ${() => Fpv.clouds ? 1 : 0}
#define UNDER_ON ${() => Fpv.underwater ? 1 : 0}
#define VOL_ON ${() => Fpv.volumetric ? 1 : 0}
in vec2 v_uv; out vec4 o;








float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

vec2 skyUV(vec3 d){ float el = asin(clamp(d.y, -1.0, 1.0)); float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963); return vec2(atan(d.z, d.x) / 6.2831853 + 0.5, v); }
vec3 skyBase(vec3 d){
  vec3 c = texture(${X.skyLut}, skyUV(d)).rgb;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.0), ${Fps.rain} * 0.75) * (1.0 - ${Fps.rain} * 0.35);
  return c + vec3(0.55, 0.6, 0.8) * ${Fps.flash} * 0.6;
}
vec3 skyHorizon(vec3 d){ return skyBase(normalize(vec3(d.x, max(d.y, 0.0), d.z))); }

const float CB = 185.0;
// 云影（2 倍频低频版：光柱尺度只看大块云；地面着色用 fancy.js 的 4 倍频，边缘细节不同但位置一致）
float cloudShadowV(vec3 wp){
  if (${Fps.volCloud} <= 0.0 || ${Fps.lightDir}.y < 0.02) return 1.0;
  vec2 q = wp.xz + ${Fps.lightDir}.xz * ((CB + 25.0 - wp.y) / max(${Fps.lightDir}.y, 0.08));
  vec2 p = q * (1.0 / 520.0) + vec2(${Fps.cloudTime} * 0.0045, ${Fps.cloudTime} * 0.0016);
  float n = (0.5 * vnoise(p) + 0.25 * vnoise(p * 2.07 + vec2(3.1, 1.7))) / 0.75;
  return 1.0 - 0.78 * ${Fps.volCloud} * clamp((n - (1.0 - ${Fps.cov})) * 2.6, 0.0, 1.0);
}
float linZ(float d){ float z = d * 2.0 - 1.0; return 2.0 * ${Fps.near} * ${Fps.far} / (${Fps.far} + ${Fps.near} - z * (${Fps.far} - ${Fps.near})); }
vec3 octDec(vec2 e){ e = e * 2.0 - 1.0; vec3 v = vec3(e, 1.0 - abs(e.x) - abs(e.y)); if (v.z < 0.0) v.xy = (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0); return normalize(v); }
float shadowRaw(vec3 wp){
  vec4 sp = ${Fps.shadowMat} * vec4(wp, 1.0);
  float df = length(sp.xy) * 0.9 + 0.1; sp.xy /= df;
  vec3 c = sp.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  return texture(${X.cShadow}, c);
}
${lib(NOISE + CAUSTIC + MEDIUM)}
void main(){
  vec3 col = texture(${X.cColor}, v_uv).rgb;
  float d = texture(${X.cDepth}, v_uv).r;
  vec4 w = ${Fps.invViewProj} * vec4(v_uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec3 rel = w.xyz / w.w;
  bool isSky = d >= 0.999999;
  vec3 dir = normalize(rel);
  float dist = isSky ? 2000.0 : length(rel);
  float mu = dot(dir, ${Fps.lightDir});
  float sunUp = smoothstep(-0.1, 0.05, ${Fps.sunDir}.y);
  float g = 0.72; float mie = (1.0 - g*g) / (4.0 * 3.14159 * pow(1.0 + g*g - 2.0*g*mu, 1.5));
  float iso = 1.0 / (4.0 * 3.14159);
  // screen-space reflections on smooth / wet opaque surfaces
  vec4 gb = texture(${X.cGbuf}, v_uv);
  if (SSR_ON > 0 && !isSky && gb.a > 0.004 && UNDER_ON == 0) {
    vec3 N = octDec(gb.xy); float rough = gb.z;
    vec3 jr = vec3(ign(gl_FragCoord.xy), ign(gl_FragCoord.yx + 17.0), ign(gl_FragCoord.xy * 1.7 + 5.0)) - 0.5;
    vec3 R = normalize(reflect(dir, N) + jr * rough * 0.9);
    if (dot(R, N) < 0.0) R = reflect(R, N);
    vec3 vp = (${Fps.view} * vec4(rel, 1.0)).xyz; vec3 vr = normalize((${Fps.view} * vec4(R, 0.0)).xyz);
    float stepL = 0.35 + dist * 0.02; vec3 pp = vp + vr * stepL * ign(gl_FragCoord.xy + 3.3) + (${Fps.view} * vec4(N, 0.0)).xyz * 0.02;
    float hit = 0.0; vec3 hc = vec3(0.0);
    for (int i = 0; i < 24; i++) {
      pp += vr * stepL; stepL *= 1.14;
      if (pp.z > -${Fps.near}) break;
      vec4 cp = ${Fps.proj} * vec4(pp, 1.0); vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float sd = linZ(texture(${X.cDepth}, uv).r); float pz = -pp.z;
      if (pz > sd && pz - sd < stepL * 2.0 + 0.4) {
        vec3 a = pp - vr * stepL, b = pp;
        for (int j = 0; j < 5; j++) { vec3 m = (a + b) * 0.5; vec4 mc = ${Fps.proj} * vec4(m, 1.0); vec2 mu = mc.xy / mc.w * 0.5 + 0.5; if (-m.z > linZ(texture(${X.cDepth}, mu).r)) b = m; else a = m; }
        vec4 hcp = ${Fps.proj} * vec4(b, 1.0); vec2 huv = hcp.xy / hcp.w * 0.5 + 0.5;
        if (texture(${X.cDepth}, huv).r < 0.999999) { vec2 ed = smoothstep(0.0, 0.1, huv) * smoothstep(1.0, 0.9, huv); hit = ed.x * ed.y; hc = texture(${X.cColor}, huv).rgb; }
        break;
      }
    }
    if (hit > 0.0) { vec3 envC = skyHorizon(R); col = max(col + (hc - envC) * gb.a * hit, vec3(0.0)); }
  }
  // clouds (behind terrain only when terrain is farther than the cloud base)
  if (CLOUDS_ON > 0 && UNDER_ON == 0) {
    float tc = dir.y > 0.0 ? (CB - ${Fps.camPos}.y) / dir.y : -1.0;
    if (isSky || (tc > 0.0 && dist > tc)) { vec4 cl = texture(${X.cClouds}, v_uv); col = col * cl.a + cl.rgb; }
  }
  if (UNDER_ON > 0) {
    // 水下：焦散（v2/gl 图样，沿折射阳光方向投影，水深起点 = Env.eyeWaterTop）+ 介质（吸收 / 内散射 / 光束，LiqPG post.js:229；光束图样 = 焦散图样沿阳光方向拉出的体积）
    float wTop = ${Fps.waterTop}, dayF = smoothstep(-0.05, 0.12, ${Fps.sunDir}.y);
    vec3 Ls = waterLs(${Fps.sunDir}, 0.0);
    float shV = shadowRaw(rel + ${Fps.camToShadow} + vec3(0.0, 0.05, 0.0));
    if (!isSky) {
      vec3 pw = ${Fps.camPos} + rel; float dz = wTop - pw.y;
      if (dz > 0.12 && dz < 14.0) col *= 1.0 + causticAt(${X.wnoise}, pw, dz, Ls, ${Fps.time}) * ${Fps.uwCaustic} * dayF * shV;
    }
    vec3 sigS = (${Fps.waterCol} * 0.05 + 0.012) * ${Fps.uwDensity}, sigE = (vec3(0.25, 0.06, 0.04) * ${Fps.uwDensity} + sigS);
    float maxD = min(dist, 64.0), dt = maxD / 12.0, jit = ign(gl_FragCoord.xy + fract(${Fps.time} * 7.0) * 13.0);
    float ph = waterPhase(dot(dir, ${Fps.lightDir}));
    vec3 Tm = vec3(1.0), Sm = vec3(0.0);
    for (int i = 0; i < 12; i++) {
      float t = (float(i) + jit) * dt; vec3 p = dir * t; vec3 pw = ${Fps.camPos} + p;
      float dep = max(wTop - pw.y, 0.0);
      vec3 att = exp(-vec3(0.25, 0.06, 0.04) * ${Fps.uwDensity} * dep);
      float vis = VOL_ON > 0 ? shadowRaw(p + ${Fps.camToShadow}) : 1.0;
      float mod_ = 0.45 + 1.1 * causticAt(${X.wnoise}, pw, dep, Ls, ${Fps.time});
      vec3 Lm = ${Fps.lightCol} * ph * vis * mix(1.0, mod_, min(${Fps.uwShafts}, 1.0)) * ${Fps.uwShafts} * att * (1.0 - ${Fps.caveFactor}) + ${Fps.ambCol} * 0.08 * att;
      vec3 Ts = exp(-sigE * dt);
      Sm += Tm * Lm * sigS * (1.0 - Ts) / max(sigE, vec3(1e-6)); Tm *= Ts;
    }
    col = col * Tm + Sm;
  } else {
    if (!isSky) {
      vec3 fogC = skyHorizon(dir); float fl = dot(fogC, vec3(0.3, 0.55, 0.15)); float flim = dot(${Fps.ambCol}, vec3(0.3, 0.55, 0.15)) * 2.2 + 0.02; fogC *= min(1.0, flim / max(fl, 1e-4));
      float hf = exp(-max(${Fps.camPos}.y + rel.y * 0.5 - 62.0, 0.0) / 90.0);
      float fa = 1.0 - exp(-dist * ${Fps.fogDensity} * (0.35 + 0.65 * hf));
      float border = smoothstep(${Fps.renderDist} * 0.72, ${Fps.renderDist} * 0.98, length(rel.xz));
      col = mix(col, fogC, clamp(max(fa * (1.0 - ${Fps.caveFactor}), border), 0.0, 1.0));
    }
    float H = 7.0; float h0 = 62.0;
    float D0 = ${Fps.mist} * 0.022;
    float cy = ${Fps.camPos}.y - h0;
    float L = min(dist, isSky ? 300.0 : 600.0);
    float dy = dir.y * L;
    float integ;
    if (abs(dy) < 0.01) integ = D0 * exp(-cy / H) * L;
    else integ = D0 * H * exp(-cy / H) * (1.0 - exp(-dy / H)) * L / dy;
    integ = min(integ, 20.0);
    float tr = exp(-integ);
    vec3 mistCol = ${Fps.ambCol} * 0.8 + ${Fps.lightCol} * (min(mie, 0.25) * 1.2 + iso * 0.9) * sunUp * 0.8;
    col = col * tr + mistCol * (1.0 - tr) * (1.0 - ${Fps.caveFactor} * 0.9);
    {  // 洞穴火把暖雾：平行光柱在地下被压掉（caveFactor），但火把周围空气应该有体积感。没有光源网格，用眼处方块光近似局部光场：越亮、看得越远，暖雾越浓
      float eb = ${Fps.eyeBlk}, hb = eb / (4.0 - 3.0 * eb);
      float Lc = min(dist, 32.0);
      float hz = (1.0 - exp(-Lc * 0.03)) * hb * hb * (0.35 + 0.65 * ${Fps.caveFactor}) * ${Fps.caveHaze};   // hb² 让亮处才有雾，暗处保持黑
      col += ${Fps.torchCol} * hz * 0.1;
    }
    if (VOL_ON > 0 && ${Fps.lightDir}.y > 0.0) {
      float maxL = min(dist, 110.0);
      const int NS = 14;
      float stepL = maxL / float(NS);
      float jit = ign(gl_FragCoord.xy + fract(${Fps.time} * 7.0) * 13.0);
      float acc = 0.0;
      vec4 cs = vec4(1.0);   // 云影沿射线变化很慢：4 点采样 + 步号线性插值（每步都算要 +9 ms @1280x657），地下 / 关闭时整段跳过
      if (CLOUDS_ON > 0 && ${Fps.volCloud} > 0.0 && ${Fps.caveFactor} < 0.99) {
        for (int k = 0; k < 4; k++) cs[k] = cloudShadowV(${Fps.camPos} + dir * ((float(k) * (float(NS - 1) / 3.0) + jit) * stepL));
      }
      for (int i = 0; i < NS; i++) {
        float t = (float(i) + jit) * stepL;
        vec3 p = dir * t;
        float y = ${Fps.camPos}.y + p.y;
        float dens = 0.1 + 1.5 * exp(-max(y - h0, 0.0) / 12.0) * (0.3 + ${Fps.mist});
        acc += shadowRaw(p + ${Fps.camToShadow}) * mix(cs[min(int(float(i) * (3.0 / float(NS - 1))), 3)], cs[min(int(float(i) * (3.0 / float(NS - 1))) + 1, 3)], fract(float(i) * (3.0 / float(NS - 1)))) * dens * stepL;
      }
      col += ${Fps.lightCol} * acc * (mie * 0.9 + iso * 0.2) * 0.011 * (1.0 - ${Fps.caveFactor}) * (1.0 + ${Fps.rain});
    }
    if (${Fps.sunVis} > 0.0) {
      vec2 dv = (${Fps.sunUV} - v_uv); float len = length(dv);
      const int NR = 24; vec2 st = dv / float(NR);
      vec2 p = v_uv + st * ign(gl_FragCoord.xy);
      float acc = 0.0; float wsum = 0.0;
      for (int i = 0; i < NR; i++) {
        float dd = texture(${X.cDepth}, p).r; float wgt = 1.0 - float(i) / float(NR);
        float occ = dd >= 0.999999 ? texture(${X.cClouds}, p).a : 0.0;
        acc += occ * wgt; wsum += wgt; p += st;
      }
      float rays = acc / wsum;
      col += ${Fps.sunCol} * rays * exp(-len * 2.6) * ${Fps.sunVis} * 0.14 * (1.0 - ${Fps.caveFactor});
    }
  }
  col += vec3(0.5, 0.55, 0.7) * ${Fps.flash} * 0.08;
  o = vec4(col, gb.b < -0.5 ? 0.0 : 1.0);                                      // remix: A 方案：gbuf.b = −1 标记宿主实体像素 → alpha 0，TAA 据此不用历史（实体没有运动向量）
}`;
