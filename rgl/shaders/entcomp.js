// rgl/shaders/entcomp.js —— R4 方案 A：three 画进离屏目标的宿主实体（颜色 + 深度）合并进 goodGL 的 scene（color + gbuf + depth）。
//   颜色是显示空间的原始值（宿主 ColorManagement 关）→ 线性 = pow(rgb, 2.2)；three 的混合是预乘 alpha，所以先除 alpha 再 pow 再乘回去。
//   光照项已在 CPU 材质色里折成 E^(1/2.2)（entlight.js 的 scene 模式），所以 pow 之后正好是 反照率 × E。
//   深度：宿主相机 near / far → goodGL 的 near / far（depthout.js 的逆运算）；硬件深度测试（LESS）负责被地形遮挡。
//   gbuf = (0, 0, −1, 0)：ssrW = 0（实体不做 SSR），b = −1 是给 comp 的「实体像素」标记（→ alpha 0 → TAA 不混历史）。
import { F } from '../frameref.js';
export const entComp = (Pass, { entColor, entDepth, hostNear, hostFar }) => Pass({ tag: 'entComp' })`#version 300 es
precision highp float;
in vec2 v_uv; layout(location=0) out vec4 o; layout(location=1) out vec4 o2;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 e = texelFetch(${entColor}, p, 0);
  if (e.a < 0.004) discard;
  float zd = texelFetch(${entDepth}, p, 0).r;
  if (zd >= 1.0) discard;
  float d0 = 2.0 * ${hostNear} * ${hostFar} / (${hostFar} + ${hostNear} - (zd * 2.0 - 1.0) * (${hostFar} - ${hostNear}));
  float d = max(d0 - max(0.04, d0 * 0.002), ${() => F.near});                    // 往相机方向偏一点：贴地的脚下软影与地面深度几乎相等，不偏就会 z-fight 被剔掉
  float z = (${() => F.far} + ${() => F.near}) / (${() => F.far} - ${() => F.near}) - 2.0 * ${() => F.far} * ${() => F.near} / ((${() => F.far} - ${() => F.near}) * d);
  gl_FragDepth = z * 0.5 + 0.5;
  vec3 lin = pow(max(e.rgb / e.a, 0.0), vec3(2.2)) * e.a;
  o = vec4(lin, e.a); o2 = vec4(0.0, 0.0, -1.0, 0.0);
}`;
