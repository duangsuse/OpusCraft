// rgl/shaders/bup.js —— goodGL bloomUpFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u } from '../pass.js';
import { F } from '../frameref.js';
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
