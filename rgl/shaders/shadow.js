// rgl/shaders/shadow.js —— goodGL shadowFS + shadowVS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u, glsl } from '../pass.js';
import { F } from '../frameref.js';
// sharp = R3b 锐阴影图（植物）：同一份 VS，只是不做 df 扭曲、矩阵换成 F.sharpMat（原先是对 VS 文本做 .replace 得到第二个 program，现在是宏）
export const shadow = (Pass, X = {}, sharp = false) => Pass({ tag: sharp ? 'shadowS' : 'shadow', vs: glsl`#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_uvl;
layout(location=3) in vec4 a_tint;
out vec3 v_uv; flat out int v_flags;
void main(){
  vec3 p = a_pos; vec3 wp = p + ${X.origin};
  float wave = floor(a_tint.a*255.0+0.5);
  if (wave > 0.5 && ${u('wind', () => F.waving ? 1 : 0)} > 0.0) {
    float t = ${() => F.time};
    vec3 off = vec3(sin(t*1.6 + wp.x*0.55 + wp.z*0.3 + wp.y*0.4), 0.0, cos(t*1.25 + wp.z*0.6 + wp.x*0.25));
    off += 0.45*vec3(sin(t*3.3 + wp.x*1.7 + wp.y), 0.0, sin(t*2.9 + wp.z*1.9));
    float amp = wave < 1.5 ? 0.03 : 0.085;
    if (wave < 1.5) off.y = sin(t*2.1 + wp.x + wp.z) * 0.5;
    p += off * amp * ${u('wind', () => F.waving ? 1 : 0)};
  }
  vec4 sp = ${u('shadowMat', () => sharp ? F.sharpMat : F.shadowMat)} * vec4(p + ${X.offset}, 1.0);
#if ${() => sharp}
  float df = 1.0;
#else
  float df = length(sp.xy) * 0.9 + 0.1;
#endif
  sp.xy /= df;
  gl_Position = sp;
  v_uv = vec3(a_uvl.xy / 256.0, a_uvl.z);
  v_flags = int(a_uvl.w + 0.5);
}` })`#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 v_uv; flat in int v_flags;
void main(){ if ((v_flags & 3) == 1) { if (texture(${X.atlas}, vec3(clamp(v_uv.xy, vec2(0.002), vec2(0.998)), v_uv.z)).a < 0.5) discard; } }`;
