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


vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
void main(){
  vec3 col = texture(${X.finalSrc}, v_uv).rgb;
  vec3 bl = texture(${X.finalBloom}, v_uv).rgb;
  col += bl * ${Fps.bloomAmt};
  // lens ghosts: circular aperture reflections mirrored through the optical centre, gated by sun visibility
  if (${Fps.flare} > 0.0) {
    vec3 sb = texture(${X.finalBloom}, ${Fps.sunUV}).rgb; float vis = clamp(dot(sb, vec3(0.3, 0.59, 0.11)) * 0.25, 0.0, 1.0);
    vec2 sv = ${Fps.sunUV} - 0.5; float asp = 16.0 / 9.0;
    vec3 fl = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      float s = i == 0 ? -0.35 : i == 1 ? -0.7 : i == 2 ? -1.05 : i == 3 ? 0.45 : -1.6;
      float r = i == 0 ? 0.035 : i == 1 ? 0.06 : i == 2 ? 0.1 : i == 3 ? 0.025 : 0.16;
      vec3 tint = i == 0 ? vec3(1.0, 0.75, 0.45) : i == 1 ? vec3(0.45, 0.85, 1.0) : i == 2 ? vec3(0.6, 1.0, 0.65) : i == 3 ? vec3(1.0, 0.6, 0.85) : vec3(0.5, 0.6, 1.0);
      vec2 c = 0.5 + sv * s; vec2 dv = (v_uv - c) * vec2(asp, 1.0); float dl = length(dv);
      float disc = smoothstep(r, r * 0.8, dl) * (0.55 + 0.45 * smoothstep(0.0, r, dl));
      fl += tint * disc * (i == 4 ? 0.35 : 1.0);
    }
    col += fl * ${Fps.flare} * vis * 1.6;
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
