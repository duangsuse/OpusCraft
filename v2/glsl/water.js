// water：水面辅助与反射（glmod 步骤 2：从 DDA_FS 原样搬出；拼接顺序见 gl.js 的 DDA_FS）
import { glsl } from '../pass.js';
// nB / shoreH / shoreDist / skyDir / seaOct·seaH（WATER_STYLE 2）
export const fn = () => glsl`  // ── 水面辅助 ──
  float nB(vec2 uv) { TEXC(1); return texture2D(uWaterNoise, uv).b * 1.417; }      // 可平铺噪声高度 ≈ 0..1
  // 岸边波纹（替代泡沫）：平行于岸线、向岸推进的涌浪。d = 到岸距离（格），返回起伏 0..1（× uShore.x = 格）
  // 相位沿岸线由噪声打乱 → 拍岸时刻不同步；d = 0 处即岸壁上水线的升降
  float shoreH(vec2 q, float d) {
    float R = uWater0.w;
    if (R <= 0.0 || d >= R) return 0.0;
    float ph = d * 3.6 + uTime * 1.7 * uShore.y + nB(q * 0.17 + uTime * vec2(0.006, 0.004)) * 7.0;
    float s = 0.5 + 0.5 * sin(ph);
    return s * s * (1.0 - smoothstep(0.25 * R, R, d));
  }
  // 到岸距离（水平，格）：水面层 5×5 邻格里最近的非水非空方块的 AABB 距离（MC 水至少 0.875 深，竖直水深分不出岸边）
  // dir = 离岸方向（距离场梯度，单位向量；无岸 = 0）
  float shoreDist(vec3 wp, float R, out vec2 dir) {
    ivec3 c = ivec3(floor(wp - vec3(0.0, 0.01, 0.0)));
    vec2 f = wp.xz - vec2(c.xz);
    float d = 9.0; dir = vec2(0.0);
    for (int dz = -2; dz <= 2; dz++) for (int dx = -2; dx <= 2; dx++) {
      if (dx == 0 && dz == 0) continue;
      vec2 lo = vec2(float(dx), float(dz));
      float dd = length(f - clamp(f, lo, lo + 1.0));
      if (dd >= min(d, R)) continue;
      uvec4 v = voxAt(c + ivec3(dx, 0, dz)); uint id = v.r;
      if (id != 0u && !isFluid(v)) { d = dd; dir = (f - clamp(f, lo, lo + 1.0)) / max(dd, 1e-4); }
    }
    return d;
  }
  vec3 skyDir(vec3 d) { float h = clamp(d.y * 1.5 + 0.04, 0.0, 1.0); return mix(uSkyHor, uSkyTop, sqrt(h)); }   // 同宿主天空球
  #if WATER_STYLE == 2
  // 光影式水面：Seascape（TDM）式尖峰波高度场（双向对撞 + 噪声域扭曲 + 旋转倍频）→ 差分法线；
  // 反射射线在体素世界里真实追踪（地形/树/体积云/天空），透射按波长吸收 + 内散射，水底焦散，太阳高光带阴影射线
  float seaOct(vec2 uv, float ch) {
    uv += nB(uv * 0.11) * 2.0 - 1.0;
    vec2 wv = 1.0 - abs(sin(uv)), swv = abs(cos(uv));
    wv = mix(wv, swv, wv);
    return pow(1.0 - pow(wv.x * wv.y, 0.65), ch);
  }
  float seaH(vec2 p, int oct) {
    float fq = 0.42 * uWave1.y, amp = 1.0, ch = 4.0, h = 0.0, tt = uTime * 0.9;
    vec2 uv = p * vec2(0.75, 1.0);
    const mat2 M = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 4; i++) {
      if (i >= oct) break;
      h += (seaOct((uv + tt) * fq, ch) + seaOct((uv - tt) * fq, ch)) * amp;
      uv = M * uv; amp *= 0.22; ch = mix(ch, 1.0, 0.2);
    }
    return h;
  }
  #endif
`;
// reflHit / reflScene
export const refl = () => glsl`  // 反射：追踪命中 → 简化着色（体素光 + 朝阳面，无 AO/阴影）；未命中 → 天空渐变 + 云（低采样）
  bool reflHit(vec3 p, vec3 d, float tMax, float t0, out vec3 col) {
    float th; ivec3 hc, n; uint id; int kind; vec3 uvl; float tw_; ivec3 wn_;
    col = vec3(0.0);
    if (tMax > 0.0 && trace(p, d, tMax, REFL_STEPS, false, th, hc, n, id, kind, uvl, tw_, wn_) && kind != 4) {
      uvec4 inf = infoOf(id);
      vec2 uv; float layer, shade; ivec3 lc;
      if (kind == 0) { uv = faceUV(n, clamp(p + d * th - vec3(hc), 0.0, 1.0), inf, layer, shade); lc = hc + n; }
      else { uv = uvl.xy; layer = uvl.z; shade = 1.0; lc = hc; }
      lc.y = clamp(lc.y, 0, H - 1);
      uvec4 g = voxAt(lc);
      float sky = float(g.g >> 4u), dayF = smoothstep(-0.05, 0.12, uSunDir.y);
      float ndl = kind == 0 ? max(dot(vec3(n), uSunDir), 0.0) : 0.5 * max(uSunDir.y, 0.0);
      vec3 lv = max(uSkyTint * bright(max(sky - uSkyDarken, 0.0)) * (1.0 + uSun * ndl * dayF * clamp((sky - 7.0) / 8.0, 0.0, 1.0)),
                    vec3(1.0, 0.86, 0.66) * bright(float(g.g & 15u)));
      vec3 c = matSampleLod(uv, layer, lodAt(t0 + th)).rgb * lv * shade * exposure;
      col = applyFog(c, t0 + th);
      return true;
    }
    return false;
  }
  #if WATER_STYLE == 2
  // Bliss 水反射（仅 WATER_STYLE 2 编译）
  vec3 reflScene(vec3 p, vec3 d, float tMax, float t0, float skyK) {
    vec3 hc_;
    if (reflHit(p, d, tMax, t0, hc_)) return hc_;
    vec3 s = skyDir(d) * mix(0.25, 1.0, skyK);
    float tc; vec4 cc;
    #if CLOUD_STYLE == 2
    if (skyK > 0.5 && cloudVol(p, d, 14, 1, 1e30, tc, cc)) s = mix(s, cc.rgb, cc.a);
    #else
    if (skyK > 0.5 && cloudHit(p, d, 1e30, tc, cc)) s = mix(s, cc.rgb, cc.a);
    #endif
    return s;
  }
  #endif

`;
