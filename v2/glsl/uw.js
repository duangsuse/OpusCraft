// uw：水下光效（仰视波纹 / 焦散 / 吸收 / 光束）（glmod 步骤 2：从 DDA_FS 原样搬出；拼接顺序见 gl.js 的 DDA_FS）
import { glsl } from '../pass.js';
// uwRip … uwShafts
export const uw = () => glsl`  // 水下仰视波纹（改编自 Shadertoy「water ripple」：7 向余弦叠加 → cos(相位)，有限差分得折射偏移 + 高光）
  float uwRip(vec2 c, float t) {
    const float DT = 6.2831853 / 7.0;
    float a = 0.0;
    for (int i = 0; i < 8; i++) {
      float th = DT * float(i), cs = cos(th), sn = sin(th);
      vec2 q = c + vec2(cs * t * 0.2 + t * 0.3, -(sn * t * 0.2 - t * 0.3));
      a += cos((q.x * cs - q.y * sn) * 6.0) * 2.4;
    }
    return cos(a);
  }
  // 返回 (dx, dy, 亮度系数)：dx/dy 量级同原 shader（±0.016 屏幕 uv）；面板 0.5/1 = 原着色器 0.14/2.15
  vec3 uwRipple(vec2 wxz, float k) {
    vec2 c = wxz * 0.04 * uUw.y * 2.15; float t = uTime * 1.3;
    float c0 = uwRip(c, t);
    float dx = 0.5 * (c0 - uwRip(c + vec2(21.33, 0.0), t)) / 60.0;
    float dy = 0.5 * (c0 - uwRip(c + vec2(0.0, 10.95), t)) / 60.0;
    float al = 1.0 + dx * dy * 700.0;
    float ddx = dx - 0.012, ddy = dy - 0.012;
    if (ddx > 0.0 && ddy > 0.0) al = pow(al, ddx * ddy * 200000.0);
    return vec3(dx, dy, mix(1.0, al, k));
  }
  // ── 水下（相机在水中）的低成本光效 ──
  // 焦散图样：两层反向漂移噪声之差 → 亮脊（同水上看水底）
  float causAt(vec2 fp) {
    float c1 = nB(fp * 0.31 + uTime * vec2(0.031, 0.017)), c2 = nB(fp * 0.43 - uTime * vec2(0.022, -0.027));
    return pow(clamp(1.0 - abs(c1 - c2) * 3.0, 0.0, 1.0), 6.0);
  }
  // 水面波纹场（与 causAt 同频率/漂移）：返回 (高度梯度 xz, 亮脊图样)
  vec3 uwField(vec2 fp) {
    vec2 A = uTime * vec2(0.031, 0.017), B = uTime * vec2(0.022, -0.027);
    float c1 = nB(fp * 0.31 + A), c2 = nB(fp * 0.43 - B), e = 0.15;
    float hx = nB((fp + vec2(e, 0.0)) * 0.31 + A) + nB((fp + vec2(e, 0.0)) * 0.43 - B);
    float hz = nB((fp + vec2(0.0, e)) * 0.31 + A) + nB((fp + vec2(0.0, e)) * 0.43 - B);
    float h0 = c1 + c2;
    return vec3((hx - h0) / e, (hz - h0) / e, pow(clamp(1.0 - abs(c1 - c2) * 3.0, 0.0, 1.0), 6.0));
  }
  // 水下的太阳：光照方向（含面板方位 / 仰角偏移）与天上可见太阳按 uShaft1.y 混合 —— 光束、焦散、斯涅尔窗光斑共用，方向一致
  vec3 uwL() { return normalize(mix(uSunDir, uSunVis, uShaft1.y)); }
  vec3 uwSunC() { return mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.95, 0.85), smoothstep(0.02, 0.35, uwL().y)); }
  // 水中阳光传播方向（向下）。透过水面看天空时本渲染器不做折射（水下仰视只做波纹偏移），所以默认也不折射，
  // 光束 / 斯涅尔窗光斑才会汇聚在看到的太阳上；uShaft1.z → 1 混到物理折射方向（更陡，太阳显得更高）
  vec3 uwLs() { vec3 L = uwL(); return normalize(mix(-L, refract(-L, vec3(0.0, 1.0, 0.0), 0.752), uShaft1.z)); }
  // 水体颜色吸收：按水体本身的颜色（= 宿主水下雾色 cWater×昼夜）逐通道 Beer 衰减 + 向水色内散射
  vec3 uwAbsorb(vec3 c, float d) {
    vec3 wc = uFogColor / max(max(uFogColor.r, uFogColor.g), max(uFogColor.b, 1e-3));
    vec3 Tr = exp(-uUw.z * 0.3 * (1.05 - wc) * d);
    return c * Tr + uFogColor * (1.0 - Tr);
  }
  // 水下物体表面焦散：从所在水格向上找水面（≤ 8 格），按水深衰减；投影沿折射阳光方向
  float uwCaustic(vec3 p, ivec3 c) {
    if (c.y < 0 || c.y >= H || !isFluid(voxAt(c))) return 0.0;
    int k = 1;
    for (; k < 8; k++) { ivec3 q = c + ivec3(0, k, 0); if (q.y >= H || !isFluid(voxAt(q))) break; }
    if (k >= 8) return 0.0;
    float dz = max(float(c.y + k) - (1.0 - fluidTop(0u, false)) - p.y, 0.0);
    vec3 Ls = uwLs();
    vec2 fp = p.xz + uWOff - Ls.xz / min(Ls.y, -0.2) * dz;
    return causAt(fp) * exp(-dz * 0.15);
  }
  // 水中光束（god rays）：沿视线 6 个抖动采样点，把焦散噪声沿折射阳光方向投到 y=0 平面 → 与太阳方向一致的光柱；前向散射加权
  // 图样沿折射阳光 Ls 方向不变（投到 y = 0 平面取噪声）→ 光柱方向 = 水中阳光方向；强度随太阳高度（水面入射越斜越弱），
  // 颜色 = 阳光色 × 水色（光柱在水里本来就带水色），前向散射按 uShaft1.x 收紧到太阳方向
  vec3 uwShafts(vec3 ro, vec3 r, float tMax, float skyK) {
    vec3 L = uwL();
    float dayF = smoothstep(-0.05, 0.12, L.y);
    if (uUw.w <= 0.0 || dayF <= 0.0 || skyK <= 0.0) return vec3(0.0);
    vec3 Ls = uwLs();
    vec2 sl = Ls.xz / min(Ls.y, -0.2);
    float tm = min(tMax, uShaft0.y), dt = tm / 6.0, t = dt * ign(gl_FragCoord.xy), a = 0.0;
    for (int i = 0; i < 6; i++) {
      vec3 p = ro + r * t;
      vec2 q = (p.xz + uWOff - sl * p.y) * uShaft0.x;
      float n1 = nB(q * 0.09 + uTime * vec2(0.012, 0.007)), n2 = nB(q * 0.13 - uTime * vec2(0.009, -0.011));
      a += pow(clamp(1.0 - abs(n1 - n2) * 2.2, 0.0, 1.0), uShaft0.w) * exp(-t * uShaft0.z);
      t += dt;
    }
    float ph = 0.3 + 1.7 * pow(max(dot(r, -Ls), 0.0), uShaft1.x);
    vec3 wc = uFogColor / max(max(uFogColor.r, uFogColor.g), max(uFogColor.b, 1e-3));
    return uwSunC() * mix(vec3(1.0), wc, 0.5) * (a / 6.0) * ph * uUw.w * 0.5 * dayF * (0.4 + 0.6 * L.y) * skyK * exposure * min(tm / 8.0, 1.0);
  }
`;
