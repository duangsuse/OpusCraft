// rgl/shaders/taa.js —— goodGL taaFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u } from '../pass.js';
import { F } from '../frameref.js';
export const taa = (Pass, X = {}) => Pass({ tag: 'taa' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;

vec3 toY(vec3 c){ return vec3(0.25*c.r + 0.5*c.g + 0.25*c.b, 0.5*c.r - 0.5*c.b, -0.25*c.r + 0.5*c.g - 0.25*c.b); }
vec3 fromY(vec3 y){ return vec3(y.x + y.y - y.z, y.x + y.z, y.x - y.y - y.z); }
vec3 tm(vec3 c){ return c / (1.0 + max(c.r, max(c.g, c.b))); }
vec3 itm(vec3 c){ return c / max(1e-4, 1.0 - max(c.r, max(c.g, c.b))); }
void main(){
  vec3 cur = tm(max(texture(${X.taaCur}, v_uv).rgb, 0.0));
  if (${u('reset', () => (F.taaReset || !X.histValid()) ? 1 : 0)} > 0.5) { o = vec4(itm(cur), 1.0); return; }
  // closest depth in 3x3 (keeps edges of foreground objects stable)
  float dmin = 1.0; vec2 duv = v_uv;
  vec3 m1 = vec3(0.0), m2 = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 q = v_uv + vec2(x, y) * ${u('texel', () => [1 / F.w, 1 / F.h])};
    vec3 c = toY(tm(max(texture(${X.taaCur}, q).rgb, 0.0))); m1 += c; m2 += c * c;
    float dd = texture(${X.taaDepth}, q).r; if (dd < dmin) { dmin = dd; duv = q; }
  }
  m1 /= 9.0; m2 /= 9.0; vec3 sig = sqrt(max(m2 - m1 * m1, 0.0));
  vec4 w = ${() => F.invViewProj} * vec4(v_uv * 2.0 - 1.0, dmin * 2.0 - 1.0, 1.0);
  vec3 rel = w.xyz / w.w;
  vec3 prel = dmin >= 0.999999 ? normalize(rel) * 1e4 : rel + ${() => F.camDelta};
  vec4 pc = ${() => F.prevViewProj} * vec4(prel, 1.0);
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
  float motion = length((puv - v_uv) / ${u('texel', () => [1 / F.w, 1 / F.h])});
  float fb = mix(0.9, 0.75, clamp(motion * 0.08, 0.0, 1.0));
  vec3 res = fromY(mix(cy, hist, fb));
  o = vec4(itm(max(res, 0.0)), 1.0);
}`;
