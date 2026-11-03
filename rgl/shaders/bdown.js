// rgl/shaders/bdown.js —— goodGL bloomDownFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u } from '../pass.js';
import { F } from '../frameref.js';
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
