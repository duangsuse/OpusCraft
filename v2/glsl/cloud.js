// cloud：体积云 / MC 方块云 / 程序化星星（glmod 步骤 2：从 DDA_FS 原样搬出；拼接顺序见 gl.js 的 DDA_FS）
import { glsl } from '../pass.js';
// cloudDen / cloudVol（CLOUD_STYLE 2）/ cloudHit
export const vol = () => glsl`  #if CLOUD_STYLE == 2
  // ── 光影式体积积云（思路同 iq "Clouds" / Horizon Zero Dawn / Hillaire 2016）──
  // 云层 slab [y0, y0 + 厚度·4]；密度 = 低频 Perlin-Worley 覆盖 remap × 高度剖面（平底、圆顶）− 高频 Worley 侵蚀
  // 主射线抖动步进 + 朝光源 3 步次级步进（Beer × powder），双瓣 HG 相位给银边，能量守恒积分
  float cloudDen(vec3 p, float hN, bool detail) {
    float cov = min(0.22 + 0.635 * uCloud2.x, 0.85);                          // 面板系数对齐体积/MC：密度 0.34 ≈ 覆盖 0.44
    vec3 q = p * (1.0 / 384.0);
    float base = texture(uCloudNoise, q).r; TEXC(1);
    float prof = smoothstep(0.0, 0.08, hN) * smoothstep(1.0, 0.45, hN);              // 底平、顶部收窄
    float d = clamp((base * mix(1.0, prof, 0.85) - (1.0 - cov)) / cov, 0.0, 1.0);
    d *= smoothstep(0.0, 0.06, hN) * smoothstep(1.0, 0.85, hN);
    if (detail && d > 0.0) {
      TEXC(1);
      float hi = texture(uCloudNoise, p * (1.0 / 72.0) + vec3(uTime * 0.004, -uTime * 0.002, 0.0)).g;
      d = clamp((d - hi * mix(0.32, 0.12, hN)) / (1.0 - hi * 0.3), 0.0, 1.0);    // 底部侵蚀更多（蓬松下缘）
    }
    return d;
  }
  float hgPh(float c, float g) { float g2 = g * g; return (1.0 - g2) / (12.566 * pow(1.0 + g2 - 2.0 * g * c, 1.5)); }
  // tLim：云层入口超过它就不追（调用方保证 tc ≥ tLim 的云不会被画出，见 main 的云门控）
  bool cloudVol(vec3 ro, vec3 r, int nS, int nL, float tLim, out float tc, out vec4 cc) {
    tc = -1.0; cc = vec4(0.0);
    ro.xz += uWOff + uCloud.xy;
    float y0 = uCloud.z, T = uCloud.w * 9.6, y1 = y0 + T;                // 厚度 5 → 48 格（与体积/MC 同参数观感一致）
    // 行星曲率：点的「等效高度」= y + 水平距²/(2R) → 远处云层压向地平线（光影包的做法），否则平板云在约 3° 仰角处截断
    const float RC = 1.0 / (2.0 * 4500.0);
    float hl = max(length(r.xz), 1e-4), ka = hl * hl * RC;
    // y(t) = ro.y + r.y·t + ka·t² 单调（t > 顶点）；求与 y0 / y1 的正根
    float c0 = ro.y - y0, c1 = ro.y - y1;
    if (c1 >= 0.0 && r.y >= 0.0) return false;                        // 在云层上方且向上
    float tE = 0.0, tX;
    if (c0 < 0.0) tE = -2.0 * c0 / max(r.y + sqrt(r.y * r.y - 4.0 * ka * c0), 1e-6);   // 数值稳定的正根
    tX = c1 < 0.0 ? -2.0 * c1 / max(r.y + sqrt(r.y * r.y - 4.0 * ka * c1), 1e-6) : 2400.0 / hl;
    tX = min(tX, 2400.0 / hl);                                         // 水平距离上限
    if (tE >= tX || tE >= tLim) return false;
    float dt = max((tX - tE) / float(nS), 1.2);
    float t = tE + dt * ign(gl_FragCoord.xy);
    // 光源用宿主可见的太阳/月亮方向（东升西落于 x-y 平面，z 略偏 0.2），不含面板「光向量偏移」——银边/高亮点与天上的日月对齐
    bool day = uSunVis.y > -0.05;
    vec3 Ld = day ? uSunVis : -uSunVis;                                 // 夜间用月光（宿主月亮 = 太阳对向）
    float dayF = smoothstep(-0.05, 0.12, uSunVis.y);
    vec3 sunC = mix(vec3(1.0, 0.5, 0.25), vec3(1.0, 0.96, 0.9), smoothstep(0.02, 0.35, uSunVis.y));
    vec3 lightC = mix(vec3(0.10, 0.13, 0.20), sunC * (1.0 + 1.83 * uCloud2.z), dayF);   // 日照 0.36 → ×1.66
    vec3 amb = mix(vec3(0.75), mix(uSkyTop, uSkyHor, 0.5), dayF) * uCloudColor * 0.9;   // 天空光（宿主云色已含昼夜；夜间不再乘暗天色）
    float cth = dot(r, Ld);
    float ph = mix(hgPh(cth, 0.65), hgPh(cth, -0.25), 0.35) * 12.566 * 0.5 + 0.25;
    const float SIG = 0.22;
    float Tr = 1.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < 64; i++) {
      if (i >= nS || t >= tX || Tr < 0.03) break;
      CLC();
      vec3 p = ro + r * t; float hN = (p.y + ka * t * t - y0) / T;
      float den = cloudDen(p, hN, true);
      if (den > 0.003) {
        if (tc < 0.0) tc = t;
        float od = 0.0, ls = 2.5;
        for (int j = 0; j < 4; j++) {
          if (j >= nL) break;
          vec3 lp = p + Ld * ls; vec2 lq = lp.xz - ro.xz; float lh = (lp.y + dot(lq, lq) * RC - y0) / T;
          od += cloudDen(lp, lh, false) * ls * (j == 0 ? 1.0 : 0.6); ls *= 2.6;
        }
        od *= SIG;
        float beer = exp(-od) + 0.25 * exp(-od * 0.25);                // 多次散射近似：加一条弱衰减的尾巴
        float powder = 1.0 - 0.7 * exp(-den * 6.0);
        vec3 S = lightC * beer * powder * ph + amb * mix(0.5 - 0.5 * uCloud2.y, 1.0, hN * hN);   // 暗部 0.28 → 底部 0.36
        float st = den * SIG, e = exp(-st * dt);
        acc += Tr * S * (1.0 - e);
        Tr *= e;
        t += dt;
      } else t += dt * 1.6;                                            // 空区大步
    }
    if (tc < 0.0) return false;
    float hd = length(r.xz) * tc;
    float a = (1.0 - Tr) * (1.0 - smoothstep(1400.0, 2400.0, hd));
    acc = mix(acc, uSkyHor * (1.0 - Tr), smoothstep(200.0, 2000.0, hd) * 0.7);   // 空气透视：远处云融进地平线色
    a *= mix(1.0, min(uStar1.z, 1.6), 1.0 - dayF) * 0.98;
    cc = vec4(acc / max(1.0 - Tr, 1e-3), clamp(a, 0.0, 1.0));
    return cc.a > 0.01;
  }
  #endif
  bool cloudHit(vec3 ro, vec3 r, float tLim, out float tc, out vec4 cc) {
    #if CLOUD_STYLE == 2
    return cloudVol(ro, r, 44, 3, tLim, tc, cc);
    #endif
    ro.xz += uWOff + uCloud.xy;
    float y0 = uCloud.z, y1 = uCloud.z + uCloud.w;
    float ta = (y0 - ro.y) / r.y, tb = (y1 - ro.y) / r.y;
    float tE = max(min(ta, tb), 0.0), tX = max(ta, tb);
    bool inside = ro.y >= y0 && ro.y <= y1;
    if (inside) tX = r.y > 0.0 ? tb : ta; else if (tX < 0.0) return false;
    tX = min(tX, 600.0);
    if (tE >= tX || tE >= tLim) return false;
    const float SZ = 768.0 / 64.0;
    vec2 p = (ro.xz + r.xz * tE) / SZ, d = r.xz / SZ;
    ivec2 cell = ivec2(floor(p)), st = ivec2(sign(d));
    vec2 inv = 1.0 / mix(d, vec2(1e-6), vec2(lessThan(abs(d), vec2(1e-6))));
    vec2 tM = tE + (vec2(cell + max(st, ivec2(0))) - p) * inv, tD = abs(inv);
    float t = tE, od = 0.0; int face = inside ? 4 : (r.y > 0.0 ? 3 : 2), f0 = -1;   // 2 顶 3 底 0 x侧 1 z侧 4 相机在云内
    tc = -1.0;
    for (int i = 0; i < 96; i++) {
      if (t >= tX) break;
      CNT(1); CLC();
      float tn = min(min(tM.x, tM.y), tX);
      if (texelFetch(uCloudTex, ((cell % 64) + 64) % 64, 0).a > 0.5) {
        if (f0 < 0) { tc = t; f0 = face; }
        #if CLOUD_STYLE == 1
        break;                                        // MC 方块云：首个入射面即结果
        #else
        od += tn - t;
        if (od * uCloud2.x > 4.0) break;              // 已基本不透明
        #endif
      }
      if (tM.x < tM.y) { t = tM.x; cell.x += st.x; tM.x += tD.x; face = 0; }
      else             { t = tM.y; cell.y += st.y; tM.y += tD.y; face = 1; }
    }
    if (f0 < 0) return false;
    float dayF = smoothstep(-0.05, 0.12, uSunVis.y), hd = length(r.xz * tc);   // 云一律对齐宿主可见日月
    float nightA = mix(uStar1.z, 1.0, dayF);         // 夜间云更实（按住星星）
    #if CLOUD_STYLE == 1
    float baseM = f0 == 2 ? 1.0 : f0 == 3 ? 0.75 : f0 == 4 ? 0.92 : 0.85;   // 顶亮、底暗、侧中等
    cc = vec4(uCloudColor * baseM, min(cloudAlpha * nightA, 1.0) * (1.0 - smoothstep(250.0, 480.0, hd)));
    return cc.a > 0.01;
    #endif
    vec3 nF = f0 == 2 ? vec3(0.0, 1.0, 0.0) : f0 == 3 ? vec3(0.0, -1.0, 0.0) : f0 == 0 ? vec3(-sign(r.x), 0.0, 0.0)
            : f0 == 1 ? vec3(0.0, 0.0, -sign(r.z)) : -r;
    float base = f0 == 2 ? 1.0 : f0 == 3 ? 0.8 : f0 == 0 ? 0.92 : f0 == 1 ? 0.87 : 0.92;   // 底面比天空亮（白云）
    float faceSh = 1.0 - (1.0 - base) * (0.6 + 0.8 * uCloud2.y);
    float core = 1.0 - 0.3 * uCloud2.y * (1.0 - exp(-od / max(uCloud.w, 1.0)));
    float lit = 1.0 + uCloud2.z * (max(dot(nF, uSunVis), 0.0) - 0.2) * dayF;
    cc = vec4(uCloudColor * faceSh * core * lit, min((1.0 - exp(-od * uCloud2.x)) * nightA, 1.0) * (1.0 - smoothstep(250.0, 480.0, hd)));
    return cc.a > 0.01;
  }
`;
// starAt
export const star = () => glsl`  // 程序化星星：立方体贴图方向分格，每格按概率放一颗约 1 像素的星（亮度 pow 分布 + 闪烁 + 地平线淡出）
  vec3 starAt(vec3 r) {
    if (r.y < uStar1.x) return vec3(0.0);
    vec3 a = abs(r); vec2 uv; int fid;
    if (a.x >= a.y && a.x >= a.z) { uv = r.yz / a.x; fid = r.x > 0.0 ? 0 : 1; }
    else if (a.y >= a.z)          { uv = r.xz / a.y; fid = r.y > 0.0 ? 2 : 3; }
    else                          { uv = r.xy / a.z; fid = r.z > 0.0 ? 4 : 5; }
    vec2 q = (uv * 0.5 + 0.5) * uStar0.x, c = floor(q);
    uint h = hashU(ivec3(ivec2(c), fid), 977u);
    float h0 = float(h & 65535u) / 65535.0;
    if (h0 >= uStar0.y) return vec3(0.0);
    uint h2 = hashU(ivec3(ivec2(c), fid), 1913u);
    vec2 ctr = 0.2 + 0.6 * vec2(float(h2 & 255u), float((h2 >> 8) & 255u)) / 255.0;
    float px = max(uTexelAngle * uStar0.x * 0.5, 1e-4);   // 一个像素在 q 单位下的大小
    float k = 1.0 - smoothstep(0.3 * px, 1.3 * px, length(q - c - ctr));
    if (k <= 0.0) return vec3(0.0);
    float br = pow(float((h2 >> 16) & 1023u) / 1023.0, uStar0.z) * 1.6;
    br *= 1.0 - uStar0.w * (0.5 + 0.5 * sin(uTime * 2.3 + h0 * 997.0));
    vec3 tint = mix(vec3(1.0, 0.88, 0.78), vec3(0.8, 0.9, 1.0), float((h2 >> 26) & 63u) / 63.0);
    return tint * br * k * smoothstep(uStar1.x, uStar1.x + 0.25, r.y);
  }

`;
