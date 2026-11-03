// water/glsl.js —— 水体 GLSL 函数库（goal-remix/water.md §6）：纯函数，不引用任何 uniform，一切经参数传入。
// 因此既能被 rgl 的 Pass 模板（rgl/pass.js，`${lib(...)}`）嵌入，也能被 v2/gl 的 glsl 拼接（v2/pass.js）嵌入；
// 各宿主只负责给参数（噪声贴图 / 时间 / 方向）。图样来自 v2/gl 的 uw.js（causAt / uwLs / uwCaustic），改它们要两边一起看。

// 噪声贴图高度（water/noise.js 的 B 通道，≈ 0..1）
export const NOISE = `
float wnB(sampler2D nz, vec2 uv) { return texture(nz, uv).b * 1.417; }`;

// 水底焦散：两层反向漂移噪声之差 → 亮脊
export const CAUSTIC = `
float causAt(sampler2D nz, vec2 fp, float t) {
  float c1 = wnB(nz, fp * 0.31 + t * vec2(0.031, 0.017)), c2 = wnB(nz, fp * 0.43 - t * vec2(0.022, -0.027));
  return pow(clamp(1.0 - abs(c1 - c2) * 3.0, 0.0, 1.0), 6.0);
}
// 水中阳光传播方向（向下）：L = 指向光源的单位向量；refr = 0 → 不折射（光束 / 光斑汇聚在看到的太阳上），1 = 物理折射（η = 1/1.33）
vec3 waterLs(vec3 L, float refr) { return normalize(mix(-L, refract(-L, vec3(0.0, 1.0, 0.0), 0.752), refr)); }
// 水下表面焦散：p = 表面点的世界坐标，dz = 它在水面下的垂直深度，Ls = waterLs(...)；投影沿折射阳光方向，随深度衰减
float causticAt(sampler2D nz, vec3 p, float dz, vec3 Ls, float t) {
  vec2 fp = p.xz + Ls.xz / min(Ls.y, -0.2) * dz;                                  // 水面上的入射点 = p − Ls·(dz / −Ls.y)；⚠ v2/gl 的 uwCaustic 这里是 −（与它自己的 uwShafts 相反，疑似符号写反，未改）
  return causAt(nz, fp, t) * exp(-dz * 0.15);
}
// 透过水面看到的池底花纹（v2/gl shade.js:293 的版本）：图样直接落在被看到的点上（不沿阳光投影），按视线在水里走过的距离衰减
float causticSeen(sampler2D nz, vec3 p, float pathLen, float t) { return causAt(nz, p.xz, t) * exp(-pathLen * 0.12); }`;

// 水下介质：HG 相函数（LiqPG post.js:229）
export const MEDIUM = `
float hgPhase(float c, float g) { float g2 = g * g; return (1.0 - g2) / (4.0 * 3.14159 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
float waterPhase(float c) { return hgPhase(c, 0.75) * 0.7 + 0.3 / (4.0 * 3.14159); }`;

// 岸边波纹（v2/gl water.js 的 shoreH / shoreDist）。shoreDist 原来读 v2 的体素 3D 纹理，这里读 SurfaceField 的 RG8UI 纹理（water/surfacefield.js）：
// 邻格是「非流体实心」⇔ 邻列 R == 2 且 G ≥ 查询格 y。field = usampler2D，N = 纹理边长（2 的幂，按世界格取模）
export const SHORE = `
float shoreH(sampler2D nz, vec2 q, float d, float R, float spd, float t) {
  if (R <= 0.0 || d >= R) return 0.0;
  float ph = d * 3.6 + t * 1.7 * spd + wnB(nz, q * 0.17 + t * vec2(0.006, 0.004)) * 7.0;
  float s = 0.5 + 0.5 * sin(ph);
  return s * s * (1.0 - smoothstep(0.25 * R, R, d));
}
float shoreDist(usampler2D fld, int N, vec3 wp, float R, out vec2 dir) {
  ivec3 c = ivec3(floor(wp - vec3(0.0, 0.01, 0.0)));
  vec2 f = wp.xz - vec2(c.xz);
  float d = 9.0; dir = vec2(0.0);
  for (int dz = -2; dz <= 2; dz++) for (int dx = -2; dx <= 2; dx++) {
    if (dx == 0 && dz == 0) continue;
    vec2 lo = vec2(float(dx), float(dz));
    float dd = length(f - clamp(f, lo, lo + 1.0));
    if (dd >= min(d, R)) continue;
    uvec2 v = texelFetch(fld, (c.xz + ivec2(dx, dz)) & (N - 1), 0).rg;
    if (v.r == 2u && int(v.g) >= c.y) { d = dd; dir = (f - clamp(f, lo, lo + 1.0)) / max(dd, 1e-4); }
  }
  return d;
}`;
