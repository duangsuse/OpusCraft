// rgl/shaders/depthout.js —— R4 方案 B：goodGL 深度 → 宿主 three 相机的深度（只写深度进默认帧缓冲）
//   goodGL 的 near / far 与宿主相机不同 → 还原线性视深，再按宿主投影重新映射。
import { F } from '../frameref.js';
export const depthOut = (Pass, { sceneDepth, hostNear, hostFar }) => Pass({ tag: 'depthOut' })`#version 300 es
precision highp float;
in vec2 v_uv; out vec4 o;
void main() {
  float z = texelFetch(${sceneDepth}, ivec2(gl_FragCoord.xy), 0).r;
  if (z >= 1.0) { gl_FragDepth = 1.0; o = vec4(0.0); return; }
  float d = 2.0 * ${() => F.near} * ${() => F.far} / (${() => F.far} + ${() => F.near} - (z * 2.0 - 1.0) * (${() => F.far} - ${() => F.near}));
  float n = (${hostFar} + ${hostNear}) / (${hostFar} - ${hostNear}) - 2.0 * ${hostFar} * ${hostNear} / ((${hostFar} - ${hostNear}) * d);
  gl_FragDepth = n * 0.5 + 0.5; o = vec4(0.0);
}`;
