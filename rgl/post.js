// rgl/post.js —— 画面后期（最后几步）：TAA 抗锯齿、泛光、色调映射、深度写回。comp 在 long/comp.js。由 shaders/{taa,bdown,bup,final,depthout}.js 合并，GLSL 一字未改。
import { Fps, Fpv } from './pass.js';

// ======== taa.js ========
// rgl/shaders/taa.js —— goodGL taaFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
export const taa = (Pass, X = {}) => Pass({ tag: 'taa' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;

vec3 toY(vec3 c){ return vec3(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b); }
vec3 fromY(vec3 y){ return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
vec3 tm(vec3 c){ return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 itm(vec3 c){ return c / max(1e-4, 1.0 - max(c.r, max(c.g, c.b))); }
void main(){
  vec4 cur4 = texture(${X.taaCur}, v_uv);
  vec3 cur = tm(max(cur4.rgb, 0.0));
  if (cur4.a < 0.5) { o = vec4(itm(cur), 1.0); return; }                       // remix: A 方案：宿主实体像素（comp 写的 alpha 0）不混历史，避免拖影
  if (${reset => (Fpv.taaReset || !X.histValid()) ? 1 : 0} > 0.5) { o = vec4(itm(cur), 1.0); return; }
  // closest depth in 3x3 (keeps edges of foreground objects stable)
  float dmin = 1.0; vec2 duv = v_uv;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 q = v_uv + vec2(x, y) * ${texel => [1 / Fpv.w, 1 / Fpv.h]};
    vec3 c = toY(tm(max(texture(${X.taaCur}, q).rgb, 0.0))); m1 += c; m2 += c * c;
    float dd = texture(${X.taaDepth}, q).r; if (dd < dmin) { dmin = dd; duv = q; }
  }
  m1 /= 9.0; m2 /= 9.0; vec3 sig = sqrt(max(m2 - m1 * m1, 0.0));
  vec4 w = ${Fps.invViewProj} * vec4(v_uv * 2.0 - 1.0, dmin * 2.0 - 1.0, 1.0);
  vec3 rel = w.xyz / w.w;
  vec3 prel = dmin >= 0.999999 ? normalize(rel) * 1e4 : rel + ${Fps.camDelta};
  vec4 pc = ${Fps.prevViewProj} * vec4(prel, 1.0);
  vec2 puv = pc.xy / pc.w * 0.5 + 0.5;
  if (pc.w <= 0.0 || puv.x < 0.0 || puv.y < 0.0 || puv.x > 1.0 || puv.y > 1.0) { o = vec4(itm(cur), 1.0); return; }
  vec3 hist = toY(tm(max(texture(${X.taaHist}, puv).rgb, 0.0)));
  // variance clip toward the neighbourhood mean
  vec3 cy = toY(cur);
  float g = 1.1;
  vec3 mn = m1 - sig * g, mx = m1 + sig * g;
  vec3 ctr = 0.5 * (mx + mn), ext = 0.5 * (mx - mn) + 1e-4;
  vec3 vv = hist - ctr; vec3 a = abs(vv / ext); float ma = max(a.x, max(a.y, a.z));
  if (ma > 1.0) hist = ctr + vv / ma;
  float motion = length((puv - v_uv) / ${texel => [1 / Fpv.w, 1 / Fpv.h]});
  float fb = mix(0.9, 0.75, clamp(motion * 0.08, 0.0, 1.0));
  vec3 res = fromY(mix(cy, hist, fb));
  o = vec4(itm(max(res, 0.0)), 1.0);
}`;

// ======== bdown.js ========
// rgl/shaders/bdown.js —— goodGL bloomDownFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
export const bdown = (Pass, X = {}) => Pass({ tag: 'bdown' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o; 
vec3 s(vec2 uv){ return texture(${X.blSrc}, uv).rgb; }
void main(){
  vec2 t = ${X.blTexel};
  vec3 a = s(v_uv + t * vec2(-2, 2)), b = s(v_uv + t * vec2(0, 2)), c = s(v_uv + t * vec2(2, 2));
  vec3 d = s(v_uv + t * vec2(-2, 0)), e = s(v_uv), f = s(v_uv + t * vec2(2, 0));
  vec3 g = s(v_uv + t * vec2(-2, -2)), h = s(v_uv + t * vec2(0, -2)), i = s(v_uv + t * vec2(2, -2));
  vec3 j = s(v_uv + t * vec2(-1, 1)), k = s(v_uv + t * vec2(1, 1)), l = s(v_uv + t * vec2(-1, -1)), m = s(v_uv + t * vec2(1, -1));
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (${X.blFirst} > 0.5) { float br = max(col.r, max(col.g, col.b)); float soft = clamp(br - 0.8, 0.0, 1.6); soft = soft * soft / 6.4; float contrib = max(soft, br - 1.6) / max(br, 1e-4); col *= clamp(contrib, 0.0, 1.0); col = min(col, vec3(60.0)); }
  o = vec4(col, 1.0);
}`;

// ======== bup.js ========
// rgl/shaders/bup.js —— goodGL bloomUpFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
export const bup = (Pass, X = {}) => Pass({ tag: 'bup' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o; 
void main(){
  vec2 t = ${X.blTexel};
  vec3 c = texture(${X.blSrc}, v_uv).rgb * 4.0;
  c += (texture(${X.blSrc}, v_uv + vec2(-t.x, 0)).rgb + texture(${X.blSrc}, v_uv + vec2(t.x, 0)).rgb + texture(${X.blSrc}, v_uv + vec2(0, t.y)).rgb + texture(${X.blSrc}, v_uv + vec2(0, -t.y)).rgb) * 2.0;
  c += texture(${X.blSrc}, v_uv + t).rgb + texture(${X.blSrc}, v_uv - t).rgb + texture(${X.blSrc}, v_uv + vec2(t.x, -t.y)).rgb + texture(${X.blSrc}, v_uv + vec2(-t.x, t.y)).rgb;
  o = vec4(c / 16.0, 1.0);
}`;

// ======== final.js ========
// rgl/shaders/final.js —— goodGL finalFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
export const final = (Pass, X = {}) => Pass({ tag: 'final' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;


// 镜头光斑：musk's lens flare（shadertoy 4sX3Rs，icecool 改）。noise 贴图换成程序化值噪声；
// f0 = 带噪声起伏的星芒，f2–f6 = 色散（RGB 偏移不同）的光学反射环
float fh1(float n){ return fract(sin(n * 127.1) * 43758.5453); }
float fh2(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float fn1(float t){ float i = floor(t), f = fract(t); f = f * f * (3.0 - 2.0 * f); return mix(fh1(i), fh1(i + 1.0), f); }
float fn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh2(i), fh2(i + vec2(1, 0)), f.x), mix(fh2(i + vec2(0, 1)), fh2(i + vec2(1, 1)), f.x), f.y); }
vec3 flareMusk(vec2 uv, vec2 pos, float T){
  vec2 mn = uv - pos;
  vec2 uvd = uv * length(uv);
  float ang = atan(mn.y, mn.x);
  float dist = pow(length(mn), 0.1);
  float n = fn2(vec2((ang - T / 9.0) * 16.0, dist * 32.0));
  float f0 = 1.0 / (length(uv - pos) * 16.0 + 1.0);
  f0 = f0 + f0 * (sin((ang + T / 18.0 + fn1(abs(ang) + n / 2.0) * 2.0) * 12.0) * 0.1 + dist * 0.1 + 0.8);
  float f2  = max(1.0 / (1.0 + 32.0 * pow(length(uvd + 0.80 * pos), 2.0)), 0.0) * 0.25;
  float f22 = max(1.0 / (1.0 + 32.0 * pow(length(uvd + 0.85 * pos), 2.0)), 0.0) * 0.23;
  float f23 = max(1.0 / (1.0 + 32.0 * pow(length(uvd + 0.90 * pos), 2.0)), 0.0) * 0.21;
  vec2 uvx = mix(uv, uvd, -0.5);
  float f4  = max(0.01 - pow(length(uvx + 0.40 * pos), 2.4), 0.0) * 6.0;
  float f42 = max(0.01 - pow(length(uvx + 0.45 * pos), 2.4), 0.0) * 5.0;
  float f43 = max(0.01 - pow(length(uvx + 0.50 * pos), 2.4), 0.0) * 3.0;
  uvx = mix(uv, uvd, -0.4);
  float f5  = max(0.01 - pow(length(uvx + 0.2 * pos), 5.5), 0.0) * 2.0;
  float f52 = max(0.01 - pow(length(uvx + 0.4 * pos), 5.5), 0.0) * 2.0;
  float f53 = max(0.01 - pow(length(uvx + 0.6 * pos), 5.5), 0.0) * 2.0;
  uvx = mix(uv, uvd, -0.5);
  float f6  = max(0.01 - pow(length(uvx - 0.300 * pos), 1.6), 0.0) * 6.0;
  float f62 = max(0.01 - pow(length(uvx - 0.325 * pos), 1.6), 0.0) * 3.0;
  float f63 = max(0.01 - pow(length(uvx - 0.350 * pos), 1.6), 0.0) * 5.0;
  vec3 c = vec3(0.0);
  const float RG = 8.0;   // 细环（f4–f6）峰值只有 ~0.06：原作叠在黑底上可见，叠在 HDR 亮天空上要放大；f2 系是宽光晕，不放大
  c.r += f2 + RG * (f4 + f5 + f6); c.g += f22 + RG * (f42 + f52 + f62); c.b += f23 + RG * (f43 + f53 + f63);
  return c + vec3(f0);
}
vec3 flareCC(vec3 color, float factor, float factor2){ float w = color.x + color.y + color.z; return mix(color, vec3(w) * factor, w * factor2); }
vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
void main(){
  vec3 col = texture(${X.finalSrc}, v_uv).rgb;
  vec3 bl = texture(${X.finalBloom}, v_uv).rgb;
  col += bl * ${Fps.bloomAmt};
  // lens ghosts: circular aperture reflections mirrored through the optical centre, gated by sun visibility
  if (${Fps.flare} > 0.0) {
    vec3 sb = texture(${X.finalBloom}, ${Fps.sunUV}).rgb; float vis = clamp(dot(sb, vec3(0.3, 0.59, 0.11)) * 0.25, 0.0, 1.0);
    float asp = ${Fps.w} / ${Fps.h};
    vec2 fuv = (v_uv - 0.5) * vec2(asp, 1.0), fpos = (${Fps.sunUV} - 0.5) * vec2(asp, 1.0);
    vec3 fl = flareMusk(fuv, fpos, ${Fps.time});
    col += flareCC(vec3(1.4, 1.2, 1.0) * fl, 0.5, 0.1) * ${Fps.flare} * vis;
  }
  col *= ${Fps.exposure} * ${Fps.grade};
  // Purkinje shift: in dim light rods take over (blue-shifted, desaturated)
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float rodL = dot(col, vec3(0.04, 0.56, 0.40));
  float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  float k = ${Fps.scotopic} * (1.0 - smoothstep(0.01, 0.22, L)) * (1.0 - smoothstep(0.02, 0.12, sat) * 0.6);
  col = mix(col, rodL * vec3(0.6, 0.76, 1.08), k * 0.5);
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, ${Fps.saturation});
  vec2 q = v_uv - 0.5; float vig = 1.0 - dot(q, q) * 0.55;
  col *= vig;
  col = pow(col, vec3(1.0 / 2.2));
  col = mix(col, col * vec3(0.55, 0.75, 1.0), ${underwater => Fpv.underwater ? 1 : 0} * 0.35);
  col = mix(col, vec3(0.7, 0.05, 0.05), ${Fps.hurt} * 0.3 * (0.3 + 1.8 * dot(q, q)));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;

// ======== depthout.js ========
// rgl/shaders/depthout.js —— R4 方案 B：goodGL 深度 → 宿主 three 相机的深度（只写深度进默认帧缓冲）
//   goodGL 的 near / far 与宿主相机不同 → 还原线性视深，再按宿主投影重新映射。
export const depthOut = (Pass, { sceneDepth, hostNear, hostFar }) => Pass({ tag: 'depthOut' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
void main() {
  float z = texelFetch(${sceneDepth}, ivec2(gl_FragCoord.xy), 0).r;
  if (z >= 1.0) { gl_FragDepth = 1.0; o = vec4(0.0); return; }
  float d = 2.0 * ${Fps.near} * ${Fps.far} / (${Fps.far} + ${Fps.near} - (z * 2.0 - 1.0) * (${Fps.far} - ${Fps.near}));
  float n = (${hostFar} + ${hostNear}) / (${hostFar} - ${hostNear}) - 2.0 * ${hostFar} * ${hostNear} / ((${hostFar} - ${hostNear}) * d);
  gl_FragDepth = n * 0.5 + 0.5; o = vec4(0.0);
}`;
