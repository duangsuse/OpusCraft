// rgl/shaders/final.js —— goodGL finalFS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { u } from '../pass.js';
import { F } from '../frameref.js';
export const final = (Pass, X = {}) => Pass({ tag: 'final' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;


vec3 aces(vec3 x){ const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14; return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0.0, 1.0); }
void main(){
  vec3 col = texture(${X.finalSrc}, v_uv).rgb;
  vec3 bl = texture(${X.finalBloom}, v_uv).rgb;
  col += bl * ${() => F.bloomAmt};
  // lens ghosts: circular aperture reflections mirrored through the optical centre, gated by sun visibility
  if (${u('flare', () => F.flare || 0)} > 0.0) {
    vec3 sb = texture(${X.finalBloom}, ${() => F.sunUV}).rgb; float vis = clamp(dot(sb, vec3(0.3, 0.59, 0.11)) * 0.25, 0.0, 1.0);
    vec2 sv = ${() => F.sunUV} - 0.5; float asp = 16.0 / 9.0;
    vec3 fl = vec3(0.0);
    for (int i = 0; i < 5; i++) {
      float s = i == 0 ? -0.35 : i == 1 ? -0.7 : i == 2 ? -1.05 : i == 3 ? 0.45 : -1.6;
      float r = i == 0 ? 0.035 : i == 1 ? 0.06 : i == 2 ? 0.1 : i == 3 ? 0.025 : 0.16;
      vec3 tint = i == 0 ? vec3(1.0, 0.75, 0.45) : i == 1 ? vec3(0.45, 0.85, 1.0) : i == 2 ? vec3(0.6, 1.0, 0.65) : i == 3 ? vec3(1.0, 0.6, 0.85) : vec3(0.5, 0.6, 1.0);
      vec2 c = 0.5 + sv * s; vec2 dv = (v_uv - c) * vec2(asp, 1.0); float dl = length(dv);
      float disc = smoothstep(r, r * 0.8, dl) * (0.55 + 0.45 * smoothstep(0.0, r, dl));
      fl += tint * disc * (i == 4 ? 0.35 : 1.0);
    }
    col += fl * ${u('flare', () => F.flare || 0)} * vis * 1.6;
  }
  col *= ${() => F.exposure} * ${() => F.grade};
  // Purkinje shift: in dim light rods take over (blue-shifted, desaturated)
  float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float rodL = dot(col, vec3(0.04, 0.56, 0.40));
  float sat = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  float k = ${u('scotopic', () => F.scotopic || 0)} * (1.0 - smoothstep(0.01, 0.22, L)) * (1.0 - smoothstep(0.02, 0.12, sat) * 0.6);
  col = mix(col, rodL * vec3(0.6, 0.76, 1.08), k * 0.5);
  col = aces(col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, ${() => F.saturation});
  vec2 q = v_uv - 0.5; float vig = 1.0 - dot(q, q) * 0.55;
  col *= vig;
  col = pow(col, vec3(1.0 / 2.2));
  col = mix(col, col * vec3(0.55, 0.75, 1.0), ${u('underwater', () => F.underwater ? 1 : 0)} * 0.35);
  col = mix(col, vec3(0.7, 0.05, 0.05), ${() => F.hurt} * 0.3 * (0.3 + 1.8 * dot(q, q)));
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}`;
