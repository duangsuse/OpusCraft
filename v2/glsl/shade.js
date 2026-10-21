// shade：main()（云 pass / 阴影 pass / 主射线 → 命中着色 / 水面 / 水下 / 雾合成）（glmod 步骤 2：从 DDA_FS 原样搬出；拼接顺序见 gl.js 的 DDA_FS）
import { glsl } from '../pass.js';
// main()
export const main = ({ BT }) => glsl`  void main() {
    #if CLOUD_PASS
    { // 低分辨率云 pass（§9.2-2）：同一份着色器源码，只追体积云。1 → 颜色 + alpha；2 → tc（与可见表面的比较留给主 pass）
      vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec3 r = normalize(mat3(uCamWorld) * normalize(vp.xyz / vp.w));
      r = mix(r, vec3(1e-6), vec3(lessThan(abs(r), vec3(1e-6))));
      float tc; vec4 cc; bool hc = cloudVol(uRo, r, 44, 3, 1e30, tc, cc);
      gl_FragColor = CLOUD_PASS == 1 ? (hc ? cc : vec4(0.0)) : vec4(hc ? tc : -1.0, 0.0, 0.0, 1.0);
    }
    #elif SH_PASS
    { // 低分辨率阴影 pass（glmod §-1.B）：每 uShF×uShF 块取一个需要阴影的 DDA 纹素（先中心，再块内 4 点），追太阳阴影射线
      // 输出 (可见度, 起点到相机距离)；块内都不需要阴影 → 距离 −1（模糊 / 合成时权重 0）
      ivec2 gs = textureSize(tGeo, 0), f = ivec2(int(uShF)), b0 = ivec2(gl_FragCoord.xy) * f;
      ivec2 src = min(b0 + f / 2, gs - 1);
      vec4 g = texelFetch(tGeo, src, 0);
      for (int i = 0; i < 4 && g.w < 0.0; i++) g = texelFetch(tGeo, min(b0 + ivec2(2 * (i & 1) + 1, 2 * (i >> 1) + 1) * f / 4, gs - 1), 0);
      if (g.w < 0.0) { gl_FragColor = vec4(1.0, -1.0, 0.0, 1.0); return; }
      int fl = int(g.w);
      g.xyz += uGeoShift;
      vec3 sd = uSunDir;
      if (softShCone > 0.0) {                                     // 太阳方向在锥内抖动（逐像素固定图样，由模糊 pass 抹平）→ 半影随遮挡距离变宽
        vec3 tA = normalize(cross(sd, abs(sd.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0))), tB = cross(sd, tA);
        uint hh = hashU(ivec3(ivec2(gl_FragCoord.xy), 7), 0u);
        vec2 o = (vec2(hh & 65535u, hh >> 16) / 65535.0 * 2.0 - 1.0) * softShCone;
        sd = normalize(sd + tA * o.x + tB * o.y);
      }
      #if LEAF_SH == 0
      gLeafSolid = (fl & 2) != 0;
      #endif
      if ((fl & 1) != 0) gShHome = ivec3(floor(g.xyz));
      gCrossRecv = (fl & 4) != 0;
      float st; ivec3 sc_, sn_; uint si_; int sk_; vec3 su_; float stw_; ivec3 swn_;
      bool occ = trace(g.xyz, sd, shadowDist, uShadowSteps, true, st, sc_, sn_, si_, sk_, su_, stw_, swn_);
      gl_FragColor = vec4(occ ? 0.0 : 1.0, distance(g.xyz, uRo), 0.0, 1.0);
    }
    #else
    #if SHADOW_PASS
    oDirect = vec4(0.0); oGeo = vec4(0.0, 0.0, 0.0, -1.0);
    #endif
    vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 vd = normalize(vp.xyz / vp.w);
    float cosF = -vd.z;
    vec3 r = normalize(mat3(uCamWorld) * vd);
    r = mix(r, vec3(1e-6), vec3(lessThan(abs(r), vec3(1e-6))));
    float d = texture2D(tDepth, vUv).r;
    vec4 sc = texture2D(tScene, vUv);
    float sceneZ = d >= 1.0 ? 1e9 : 2.0 * uNear * uFar / (uFar + uNear - (d * 2.0 - 1.0) * (uFar - uNear));
    // 雾远端之外与天空无差 → 射线裁到雾距。场景深度裁剪：DDA 与 sceneRT 一一对应（scale = 1）直接用本像素深度；
    // 0.5 ≤ scale < 1（§4-5）：本 DDA 像素覆盖的场景纹素（每轴 ≤ 3 个）取最远深度 → 保守，只裁掉被实体整格挡住的部分
    float zClip = uClipScene > 0.5 ? sceneZ : 1e9;
    #if SCENE_CLIP
    if (uClipScene > 1.5) {
      vec2 c = vUv * uSceneSize, hf = 0.5 * uClipFoot;
      ivec2 a = max(ivec2(floor(c - hf)), ivec2(0)), b = min(ivec2(ceil(c + hf)) - 1, ivec2(uSceneSize) - 1);
      float dm = 0.0;
      for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) if (a.x + i <= b.x && a.y + j <= b.y) dm = max(dm, texelFetch(tDepth, a + ivec2(i, j), 0).r);
      zClip = dm >= 1.0 ? 1e9 : 2.0 * uNear * uFar / (uFar + uNear - (dm * 2.0 - 1.0) * (uFar - uNear));
    }
    #endif
    float zLim = min(zClip, fogA1 >= 0.999 ? uFogFar : 1e9);
    float tHit; ivec3 hc, n; uint id; int kind; vec3 uvl; float tw; ivec3 wn;
    // ×1.03：给雾远端留一点余量，否则正好落在 far 面上的几何会被 tX 裁掉（边缘一圈漏空）
    bool hit = trace(uRo, r, zLim * 1.03 / cosF, uSteps, false, tHit, hc, n, id, kind, uvl, tw, wn);
    bool camW = uRo.y >= 0.0 && uRo.y < float(H) && isFluid(voxAt(ivec3(floor(uRo))));
    #if DBG >= 7
    // 探针（bench --probe）：7 = tHit / 8 = tw 的 float 位模式（RGBA 小端字节），9 = 命中格低 8 位 xyz + (kind | hit<<3 | 法线轴<<4)
    { uint u = DBG == 7 ? floatBitsToUint(hit ? tHit : -1.0) : floatBitsToUint(tw);
      gl_FragColor = DBG == 9 ? vec4(uvec4(uvec3(hc & 255), uint(kind) | (hit ? 8u : 0u) | uint(n.x != 0 ? 16 : n.y != 0 ? 32 : 48))) / 255.0
                              : vec4(uvec4(u, u >> 8, u >> 16, u >> 24) & 255u) / 255.0;
      gl_FragDepth = 0.0; return; }
    #endif
    bool water = !camW && tw >= 0.0 && (!hit || tw < tHit);
    bool uwSurf = camW && tw >= 0.0 && (!hit || tw < tHit);   // 水下仰视：水面 = 半透明贴图面（同 v1）
    // 水下仰视波纹 = 水面图样 + 对水上内容的折射扭曲，两者出自同一个波纹场（图样与扭曲同步移动，不再分层「打鼓」）
    //   经典：Shadertoy 7 向余弦（高光 → 图样，差分 → 扭曲）；水底式：与水底焦散同源的噪声（亮脊 → 图样，高度梯度 → 扭曲）
    //   uUw2.x 混合两者；uUw2.y 图样亮度。图样只叠在水面层上，不再调制水上内容的整体亮度
    //   去突兀：远处/掠射水面、屏幕边缘逐渐减弱
    float uwK = uUw.x * 0.28;                                  // 波纹强度（面板→着色器）
    vec3 rc = r; vec2 uwOff = vec2(0.0); float uwPat = 0.0;
    if (uwSurf && uwK > 0.0) {
      vec3 wp0 = uRo + r * tw; vec2 wq0 = wp0.xz + uWOff;
      vec2 se = min(vUv, 1.0 - vUv);
      float fade = exp(-tw * 0.035) * smoothstep(0.04, 0.3, abs(r.y)) * smoothstep(0.0, 0.06, min(se.x, se.y));
      float mN = uUw2.x, mS = 1.0 - mN;
      if (mS > 0.0) {
        vec3 uwR = uwRipple(wq0, uwK);
        uwOff += uwR.xy * 3.0 * uwK * mS;
        uwPat += clamp((uwR.z - 1.0) / max(uwK, 1e-3) * 0.25, 0.0, 1.0) * mS;
      }
      if (mN > 0.0 && wn.y != 0) {
        vec3 fl = uwField(wq0 * (uUw.y / 0.64));
        uwOff -= fl.xy * 0.045 * uUw.x * mN;
        uwPat += fl.z * mN;
      }
      uwOff *= fade; uwPat *= fade;
      rc = normalize(r + vec3(uwOff.x, 0.0, uwOff.y));
    }
    float camSky = 15.0;                                       // 相机所在水格的天空光（水下光效按它衰减：洞穴/深处无光束）
    if (camW) camSky = float(voxAt(ivec3(floor(uRo))).g >> 4u);
    // 云门控（§9.2-1 / §4-2）：云只在 tc < 可见表面距离时被合成（水下仰视 behind / 天空 / 地形前），而 tc ≥ 云层入口 →
    // 入口在可见表面之后就不追云。相机在水中且看不到水面：云不参与。上行射线预算耗尽（kind 4）仍要画云（见末尾）
    float tCl = 1e30;
    if (camW) tCl = uwSurf ? 1e30 : -1.0;
    else if ((hit || water) && !(hit && kind == 4 && r.y > 0.0)) tCl = water ? tw : tHit;
    #if CLOUD_LR
    // 低分辨率云：水下仰视的折射方向按屏幕偏移近似（同 skyB）；入口门控等价于 tc < tCl（tc ≥ 云层入口）
    vec2 uvC = uwSurf ? clamp(vUv + uwOff * (2.0 / 3.0), 0.0, 1.0) : vUv;
    vec4 cc = texture2D(tCloud, uvC); float tc = texture2D(tCloudT, uvC).r;
    bool cloud = tCl > 0.0 && tc >= 0.0 && cc.a > 0.01 && tc < tCl;
    #else
    float tc = -1.0; vec4 cc = vec4(0.0); bool cloud = tCl > 0.0 && cloudHit(uRo, rc, tCl, tc, cc);
    #endif
    if (!hit && !water && !uwSurf) {
      if (camW) {                                              // 水下且出不了水（深水/洞穴/水下平视）：水体雾色
        float zf = uFogFar;
        gl_FragColor = vec4(uFogColor + uwShafts(uRo, r, 24.0, camSky / 15.0), 1.0);
        gl_FragDepth = uFar * (zf - uNear) / (zf * (uFar - uNear));
        RET;
      }
      float dayN = 1.0 - smoothstep(-0.05, 0.12, uSunDir.y);
      if (d >= 1.0 && dayN > 0.0) {                            // 夜空：压暗 + 程序化星星（云遮星）
        vec3 skyc = sc.rgb * (1.0 - uStar1.w * dayN);
        float ca = cloud ? cc.a : 0.0;
        if (cloud) skyc = mix(skyc, cc.rgb, cc.a);
        if (uStarOn > 0.5) skyc += starAt(r) * dayN * (1.0 - ca * uStar1.y);
        float zc = min(tc * cosF, uFar * 0.999);
        gl_FragColor = vec4(skyc, 1.0);
        gl_FragDepth = cloud ? uFar * (zc - uNear) / (zc * (uFar - uNear)) : 0.99999;
        RET;
      }
      if (cloud && tc * cosF < sceneZ) {                         // 天空前的云
        float zc = min(tc * cosF, uFar * 0.999);
        gl_FragColor = vec4(mix(sc.rgb, cc.rgb, cc.a), 1.0); gl_FragDepth = uFar * (zc - uNear) / (zc * (uFar - uNear));
        RET;
      } else { gl_FragColor = vec4(sc.rgb, 0.0); gl_FragDepth = 1.0; }
      RET;
    }
    vec3 col = sc.rgb; float z = sceneZ;
    #if SHADOW_PASS
    vec3 colD = vec3(0.0);                                     // 直射增量：之后对 col 的每个仿射变换 col·k + b，colD 只乘 k
    #endif
    if (hit && kind == 4) {                                    // 预算耗尽：视作全雾远景
      z = tHit * cosF; col = uFogColor;
    } else if (hit) {
      // 寄存器压力（tools/shader-stats.mjs）：阴影射线是第二份内联 trace，先只算它要的（光照 / ndl / G / 树叶位）就发射，
      // 贴图坐标 / 图块 / AO 等阴影之后再算（纯重排，结果逐位不变）
      vec3 f = clamp(uRo + r * tHit - vec3(hc), 0.0, 1.0);
      vec3 L;
      if (kind == 0) {
        ivec3 t1, t2; vec2 fl;                                // 平滑光照用的面内轴与格内坐标
        if (n.x != 0)      { t1 = ivec3(0, 0, 1); t2 = ivec3(0, 1, 0); fl = f.zy; }
        else if (n.y != 0) { t1 = ivec3(1, 0, 0); t2 = ivec3(0, 0, 1); fl = f.xz; }
        else               { t1 = ivec3(1, 0, 0); t2 = ivec3(0, 1, 0); fl = f.xy; }
        #if DBG == 3
        { float o_, s_, b_; cellLO(hc + n, o_, s_, b_); L = vec3(s_, b_, 1.0); }   // 测着色占比：本格光照、无 AO
        #else
        L = smoothLight(hc + n, t1, t2, fl);
        #endif
      } else {                                                // 树叶卡片：命中点所在格光照；花草 / 火把：本格光照（同 v1）
        ivec3 lp = kind == 6 ? ivec3(floor(uRo + r * (tHit - 1e-3))) : hc; lp.y = clamp(lp.y, 0, H - 1);
        uvec4 g = voxAt(lp); L = vec3(float(g.g >> 4u), float(g.g & 15u), 1.0);
      }
      // 太阳：朝阳面 + 阴影射线。sky 光 <8（洞穴/室内）不发射；shadowSteps=0 且 sun=0 时与 v1 等价
      vec3 nW = kind == 0 ? vec3(n) : vec3(0.0, 1.0, 0.0);
      float dayF = smoothstep(-0.05, 0.12, uSunDir.y), G = dayF * clamp((L.x - 7.0) / 8.0, 0.0, 1.0);
      float ndl = kind == 0 ? max(dot(nW, uSunDir), 0.0) : 0.8 * max(uSunDir.y, 0.0);
      float sh = 1.0;
      #if SHADOW_PASS
      // 不追阴影：底色按「阴影内」(sh = 0) 着色，另输出「阴影外 − 阴影内」增量；射线起点 + 受光面标志交给 SH_PASS
      bool shReq = uShadowSteps > 0 && ndl > 0.0 && G > 0.0;
      if (shReq) {
        sh = 0.0;
        bool lsF = kind == 6 || (kind == 0 && (infoOf(id).r & 128u) != 0u);
        bool crF = kind == 2 && (id & 255u) == ${BT.tallGrassId != null ? BT.tallGrassId : 256}u;
        oGeo = vec4(uRo + r * tHit + (kind == 0 ? nW * 2e-3 : uSunDir * 0.02), float((kind == 6 ? 1 : 0) | (lsF ? 2 : 0) | (crF ? 4 : 0)));
      }
      #else
      if (uShadowSteps > 0 && ndl > 0.0 && G > 0.0) {
        float st; ivec3 sc_, sn_; uint si_; int sk_; vec3 su_; float stw_; ivec3 swn_;
        vec3 p0 = uRo + r * tHit + (kind == 0 ? nW * 2e-3 : uSunDir * 0.02);
        // 树叶受光面：树叶之间只做「实心」级统一处理（不做 alpha / 距离渐变）；精确档只用于投到地面等非树叶表面的整体拖影
        #if LEAF_SH == 0
        gLeafSolid = kind == 6 || (kind == 0 && (infoOf(id).r & 128u) != 0u);
        #endif
        if (kind == 6) gShHome = ivec3(floor(p0));
        gCrossRecv = kind == 2 && (id & 255u) == ${BT.tallGrassId != null ? BT.tallGrassId : 256}u;
        if (trace(p0, uSunDir, shadowDist, uShadowSteps, true, st, sc_, sn_, si_, sk_, su_, stw_, swn_)) sh = 0.0;
      }
      #endif
      uvec4 inf = infoOf(id);                                 // id = trace 的 hid（id | meta<<8）
      vec2 uv; float layer, shade, ao = 1.0;
      if (kind == 0) {
        uv = faceUV(n, (inf.r & 128u) != 0u ? swayF(hc, f) : f, inf, layer, shade);   // 树叶：贴图随摇动剪切
        // AO：old.htm 公式 mix(1-强度, 1, ao^曲线)；强度 0.58 / 曲线 1 ≈ v1 的 AO_CURVE
        ao = mix(1.0 - aoStrength, 1.0, pow(clamp(L.z, 0.0, 1.0), aoCurve));
      } else if (kind == 6) {                                 // 树叶卡片：逐簇明度抖动
        uv = uvl.xy; layer = uvl.z;
        shade = 235.0 / 255.0 * mix(0.85, 1.1, float((lhash(hc) >> 11) & 255u) / 255.0);
      } else { uv = uvl.xy; layer = uvl.z; shade = kind == 2 ? 235.0 / 255.0 : 1.0; }
      float occl = uShadowSteps > 0 ? 1.0 - sh * smoothstep(0.0, 0.25, ndl) : 0.0;
      float sunK = 1.0 + uSun * ndl * sh * G - shadowStrength * 0.5 * occl * G;
      vec3 lv = max(uSkyTint * bright(max(L.x - uSkyDarken, 0.0)) * sunK, vec3(1.0, 0.86, 0.66) * bright(L.y));
      #if SHADOW_PASS
      vec3 tex = matSampleLod(uv, layer, lodAt(tHit)).rgb;
      col = tex * lv * shade * ao * exposure;
      if (shReq) {                                             // sh = 1 时的 sunK / lv（同上两行公式）
        float sunK1 = 1.0 + uSun * ndl * G - shadowStrength * 0.5 * (1.0 - smoothstep(0.0, 0.25, ndl)) * G;
        vec3 lv1 = max(uSkyTint * bright(max(L.x - uSkyDarken, 0.0)) * sunK1, vec3(1.0, 0.86, 0.66) * bright(L.y));
        colD = tex * lv1 * shade * ao * exposure - col;
      }
      #else
      col = matSampleLod(uv, layer, lodAt(tHit)).rgb * lv * shade * ao * exposure;
      #endif
      if (camW) {                                              // 相机在水中：水下表面焦散
        ivec3 wc_ = kind == 0 ? hc + n : hc;
        #if SHADOW_PASS
        float ck = 1.0 + uwCaustic(uRo + r * tHit, wc_) * 1.4 * dayF * clamp((L.x - 7.0) / 8.0, 0.0, 1.0);
        col *= ck; colD *= ck;
        #else
        col *= 1.0 + uwCaustic(uRo + r * tHit, wc_) * 1.4 * dayF * clamp((L.x - 7.0) / 8.0, 0.0, 1.0);
        #endif
      }
      z = tHit * cosF;
      // 岸壁水线（纵向的岸边波纹）：紧邻水面格的侧面上，水线随涌浪升降（shoreH 在 d = 0 处），水线以下盖半透明水色，上方留湿痕变暗
      if (!camW && !water && kind == 0 && n.y == 0 && uWater0.w > 0.0 && uShore.x > 0.0 && tHit < 96.0) {
        ivec3 wc = hc + n;
        if (wc.y >= 0 && wc.y < H - 1 && isFluid(voxAt(wc)) && !isFluid(voxAt(wc + ivec3(0, 1, 0)))) {
          vec3 p = uRo + r * tHit;
          float dy = p.y - (float(wc.y) + fluidTop(0u, false)), top = uShore.x * 1.6;
          if (dy > -0.02 && dy < top) {
            float hh = shoreH(p.xz + uWOff, 0.0) * uShore.x;
            float aw = 0.02 + tHit * 0.002;                      // 水线抗锯齿
            float band = 1.0 - smoothstep(hh - aw, hh + aw, dy);
            uvec4 g = voxAt(wc);
            vec3 wl = voxLight(float(g.g >> 4u), float(g.g & 15u)) * exposure;
            col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, top, dy));                 // 湿痕
            vec3 wv = mix(col * vec3(0.55, 0.8, 0.85), vec3(0.12, 0.38, 0.55) * wl, 0.45);
            wv += wl * 0.35 * (1.0 - smoothstep(0.0, aw * 3.0, abs(dy - hh)));   // 水线处的细亮边（水面弯月面反光）
            col = mix(col, wv, band * 0.85);
            #if SHADOW_PASS
            colD *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, top, dy));
            colD = mix(colD, colD * vec3(0.55, 0.8, 0.85) * 0.55, band * 0.85);
            #endif
          }
        }
      }
    }
    if (water) {                                              // 水面（old.htm：波纹法线 + 菲涅尔 + 透射 + 高光 + 岸边波纹）
      vec3 wp = uRo + r * tw, wq = wp + vec3(uWOff.x, 0.0, uWOff.y);
      float depth = hit ? tHit - tw : 60.0;
      float vd = depth * max(-r.y, 0.15);                      // 竖直水深近似 → 岸边泡沫 / 软化
      vec3 wN = vec3(wn);
      // 岸边波纹：到岸距离 + 离岸方向 → 涌浪起伏 sh0 与其沿离岸方向的斜率 sg（法线倾斜）
      float sd = 9.0, sh0 = 0.0, sg = 0.0; vec2 sdir = vec2(0.0);
      if (hit && wn.y > 0 && tw < 96.0 && uWater0.w > 0.0 && uShore.x > 0.0) {
        sd = shoreDist(wp, min(uWater0.w, 2.0), sdir);
        sh0 = shoreH(wq.xz, sd);
        sg = (shoreH(wq.xz, sd + 0.05) - shoreH(wq.xz, max(sd - 0.05, 0.0))) / 0.1;
      }
      // 噪声法线：两层不同尺度/流向的可平铺噪声叠加（打破纯正弦的机械感）
      vec2 nq = wq.xz * (0.06 * uWave1.y), nq2 = wq.xz * (0.15 * uWave1.y);
      #if WATER_STYLE == 1
      vec2 ns = vec2(0.0);                                     // Reimagined：法线来自贴图（见下）
      #else
      TEXC(2);
      vec2 ns = (texture2D(uWaterNoise, nq + uTime * vec2(0.013, 0.007)).rg * 2.0 - 1.0)
              + (texture2D(uWaterNoise, nq2 - uTime * vec2(0.009, -0.012)).rg * 2.0 - 1.0) * 0.6;
      #endif
      ivec3 ac0 = ivec3(floor(wp + vec3(wn) * 0.01));          // 水面外侧那格的光照（夜晚/洞穴变暗）
      float sky = 15.0, blk = 0.0;
      if (ac0.y >= 0 && ac0.y < H) { uvec4 g = voxAt(ac0); sky = float(g.g >> 4u); blk = float(g.g & 15u); }
      vec3 lit = voxLight(sky, blk) * exposure;
      float dayF = smoothstep(-0.05, 0.12, uSunDir.y), skyK = sky / 15.0;
      vec3 shallow = vec3(0.45, 0.85, 0.80), deep = mix(vec3(0.05, 0.30, 0.60), vec3(0.04, 0.22, 0.55), uWater2.z);
      vec3 wcol; float a;
      #if WATER_STYLE == 2
      if (wn.y > 0) {                                          // 尖峰波高度场 → 差分法线（远处降八度 + 压平，抗闪烁）
        int oct = tw < 40.0 ? 4 : 3;
        float eps = 0.03 + tw * 0.002;
        float h0 = seaH(wq.xz, oct), hx = seaH(wq.xz + vec2(eps, 0.0), oct), hz = seaH(wq.xz + vec2(0.0, eps), oct);
        float A = uWater0.z * 1.6 * (1.0 - smoothstep(32.0, 120.0, tw));
        wN = normalize(vec3(-(hx - h0) / eps * A - ns.x * uWave1.x * 2.0, 1.0, -(hz - h0) / eps * A - ns.y * uWave1.x * 2.0));
      }
      wN = normalize(wN - vec3(sdir.x, 0.0, sdir.y) * sg * uShore.x * 1.5);
      float cv = max(dot(-r, wN), 0.0);
      float fres = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
      vec3 rr = reflect(r, wN);
      if (wn.y > 0 && rr.y < 0.03) rr = normalize(vec3(rr.x, 0.03, rr.z));
      vec3 refl = reflScene(wp + vec3(wn) * 0.03, rr, tw < 96.0 ? 64.0 : 0.0, tw, skyK);
      // 透射：按波长吸收（红最快）+ 水体内散射；水底焦散（两层反向漂移噪声的差 → 亮脊）
      vec3 ext = vec3(0.45, 0.085, 0.055) * mix(3.0, 0.35, clamp(uWater0.x, 0.0, 1.0));
      vec3 Tr = exp(-ext * depth);
      vec3 flo = col;
      #if SHADOW_PASS
      vec3 floD = colD;
      #endif
      if (hit) {
        vec2 fp = (uRo + r * tHit).xz + uWOff;
        float c1 = nB(fp * 0.31 + uTime * vec2(0.031, 0.017)), c2 = nB(fp * 0.43 - uTime * vec2(0.022, -0.027));
        float caus = pow(clamp(1.0 - abs(c1 - c2) * 3.0, 0.0, 1.0), 6.0);
        #if SHADOW_PASS
        float ck = 1.0 + caus * 1.4 * dayF * skyK * exp(-depth * 0.12);
        flo *= ck; floD *= ck;
        #else
        flo *= 1.0 + caus * 1.4 * dayF * skyK * exp(-depth * 0.12);
        #endif
      }
      vec3 seen = flo * Tr + deep * lit * 0.55 * (1.0 - Tr);
      seen += vec3(0.08, 0.45, 0.38) * lit * pow(clamp(dot(r, uSunDir) * 0.5 + 0.5, 0.0, 1.0), 4.0) * (1.0 - wN.y) * 6.0 * dayF;   // 浪尖透光
      vec3 sunC = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.95, 0.85), smoothstep(0.02, 0.35, uSunDir.y));
      float spec = pow(max(dot(rr, uSunDir), 0.0), uWater2.x) * uWater2.x * 0.03 * dayF * skyK;
      if (spec > 0.01 && uShadowSteps > 0) {                   // 高光阴影：树/山挡住的水面没有太阳倒影
        float st; ivec3 sc_, sn_; uint si_; int sk_; vec3 su_; float stw_; ivec3 swn_;
        #if LEAF_SH == 0
        gLeafSolid = false;                                    // 水面高光：非树叶受光面
        #endif
        gCrossRecv = false;
        if (trace(wp + vec3(0.0, 0.05, 0.0), uSunDir, max(shadowDist, 16.0), uShadowSteps, true, st, sc_, sn_, si_, sk_, su_, stw_, swn_)) spec = 0.0;
      }
      wcol = mix(seen, refl, clamp(fres * (0.4 + uWater0.y), 0.0, 1.0)) + sunC * min(spec, 8.0);
      a = 1.0;
      #if SHADOW_PASS
      vec3 wD = floD * Tr * (1.0 - clamp(fres * (0.4 + uWater0.y), 0.0, 1.0));
      #endif
      #else
      #if WATER_STYLE == 1
      // Reimagined（SurvivalCraft 式）：不是噪声法线，而是贴图本身在动 —— 贴图坐标做连续的双向正弦摆动（同树叶摇动的剪切思路），
      // 法线取摆动后贴图明度的逐 texel 梯度 → 波纹跟着贴图图案走；菲涅尔 / 反射（面板「透亮/反射」）/ 高光都吃这个法线
      vec2 tuv = wq.xz + uTime * vec2(0.02, 0.01)
               + uWTex.x * vec2(sin(uTime * uWTex.y + (wq.x + wq.z) * 0.9), cos(uTime * uWTex.y * 0.83 + (wq.x - wq.z) * 1.1));
      float tl = lodAt(tw);
      vec3 tex = matSampleLod(fract(tuv), FLUID_TILE, tl).rgb;
      if (wn.y > 0) {
        const float E = 1.0 / 16.0;
        float l0 = dot(tex, vec3(0.333));
        float lx = dot(matSampleLod(fract(tuv + vec2(E, 0.0)), FLUID_TILE, tl).rgb, vec3(0.333));
        float lz = dot(matSampleLod(fract(tuv + vec2(0.0, E)), FLUID_TILE, tl).rgb, vec3(0.333));
        float k = uWTex.z * 8.0 * (1.0 - smoothstep(24.0, 96.0, tw));   // 远处压平（抗闪烁）
        wN = normalize(vec3(-(lx - l0) * k, 1.0, -(lz - l0) * k));
      }
      #else
      if (wn.y > 0) {
        float w1 = sin(wq.x * 0.9 + uTime * 1.2) + 0.5 * sin(wq.z * 1.7 - uTime * 0.8 + wq.x * 0.4);
        float w2 = sin(wq.z * 0.8 - uTime * 1.0) + 0.5 * sin((wq.x + wq.z) * 1.3 + uTime * 1.5);
        wN = normalize(vec3(-(w1 * uWater0.z + ns.x * uWave1.x * 4.0), 1.0, -(w2 * uWater0.z + ns.y * uWave1.x * 4.0)));
      }
      #endif
      wN = normalize(wN - vec3(sdir.x, 0.0, sdir.y) * sg * uShore.x * 1.5);
      float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-r, wN), 0.0), 5.0);
      #if WATER_STYLE != 1
      vec3 tex = matSampleLod(fract(wq.xz), FLUID_TILE, lodAt(tw)).rgb;
      #endif
      float trans = exp(-depth * mix(1.5, 0.06, clamp(uWater0.x, 0.0, 1.0)));
      vec3 body = mix(shallow, deep, 1.0 - exp(-depth * 0.10)) * (0.7 + 0.6 * dot(tex, vec3(0.333))) * lit;
      vec3 seen = mix(body, col * mix(vec3(1.0), shallow * 1.15, 0.5), trans);
      float caus = 0.5 + 0.5 * sin(wq.x * 2.3 + uTime * 0.7 + ns.x * 2.5) * sin(wq.z * 2.1 - uTime * 0.6 + ns.y * 2.5);
      seen += caus * caus * 0.10 * trans * lit;
      vec3 skyC = mix(mix(uFogColor, uSkyTop, uWater2.y), vec3(1.0), 0.35 * dayF) * mix(0.3, 1.0, skyK);   // 反射：雾色 → 天顶色
      float spec = pow(max(dot(wN, normalize(-r + uSunDir)), 0.0), uWater2.x) * dayF * skyK;
      wcol = mix(seen, skyC, fres * uWater0.y) + spec * 0.6;
      a = clamp(mix(uWater1.x, uWater1.y, smoothstep(uWater1.z, uWater1.w, depth)) + fres * uWater0.y * 0.5, 0.0, 1.0);
      #if SHADOW_PASS
      vec3 wD = colD * mix(vec3(1.0), shallow * 1.15, 0.5) * trans * (1.0 - fres * uWater0.y);
      #endif
      #endif
      if (hit && wn.y > 0) {
        wcol += lit * sh0 * 0.12 * (1.0 - smoothstep(0.0, 1.0, sd));           // 浪峰略亮（水体增厚），不再画白色泡沫
        if (shoreFade > 0.0) a *= smoothstep(0.0, shoreFade, vd + sh0 * uShore.x * 2.0);   // 岸边软化：边缘随涌浪进退
      }
      col = mix(col, wcol, a);
      #if SHADOW_PASS
      colD = mix(colD, wD, a);
      #endif
      z = tw * cosF;
    }
    if (uwSurf) {                                             // 水下仰视：水面 = 半透明水贴图（同 v1 waterMat），再按水中路径加水下雾
      vec3 behind = hit ? col : (cloud ? mix(sc.rgb, cc.rgb, cc.a) : sc.rgb);
      #if SHADOW_PASS
      vec3 oD = hit && uwK <= 0.0 ? colD : vec3(0.0);        // 有波纹时水上内容是重新追踪的简化着色（无阴影）
      #endif
      if (uwK > 0.0) {                                      // 波纹：沿折射方向重新追踪水上（简化着色），未命中 → 偏移采样天空
        vec3 p0 = uRo + r * tw + rc * 0.03, hb;
        vec3 skyB = texture2D(tScene, clamp(vUv + uwOff * (2.0 / 3.0), 0.0, 1.0)).rgb;   // 屏幕偏移 = 折射偏移 × 2/3（同原版比例）
        behind = reflHit(p0, rc, 96.0, tw, hb) ? hb : (cloud ? mix(skyB, cc.rgb, cc.a) : skyB);
      }
      {                                                       // 斯涅尔窗里的太阳：沿折射阳光反方向的光斑
        vec3 Ls = uwLs();
        float gl = pow(max(dot(r, -Ls), 0.0), 180.0) * 3.0 + pow(max(dot(r, -Ls), 0.0), 12.0) * 0.25;
        behind += uwSunC() * gl * smoothstep(-0.05, 0.12, uwL().y) * (camSky / 15.0) * exposure;
      }
      vec3 wp = uRo + r * tw, wq = wp + vec3(uWOff.x, 0.0, uWOff.y);
      ivec3 ac = ivec3(floor(wp + r * 0.01)); ac.y = clamp(ac.y, 0, H - 1);   // 出水点外侧那格的光照（同 v1 水面顶点光）
      uvec4 g = voxAt(ac);
      vec2 suv = (wn.y != 0 ? wq.xz : wn.x != 0 ? wq.zy : wq.xy) + vec2(1.0, 0.5) * uTime / 12.0 + uwOff * 4.0;   // 水面贴图随波纹场轻微扭动
      vec4 st = matSampleLod(fract(suv), FLUID_TILE, lodAt(tw));
      float shd = wn.y != 0 ? 1.0 : wn.x != 0 ? 0.6 : 0.8;
      vec3 surf = st.rgb * voxLight(float(g.g >> 4u), float(g.g & 15u)) * shd * exposure;
      vec3 o = mix(behind, surf, clamp(st.a * uwSurfaceAlpha / 0.667, 0.0, 1.0));
      o += voxLight(float(g.g >> 4u), float(g.g & 15u)) * exposure * uwPat * uUw2.y * 0.6;   // 水面波纹图样（同水底焦散的亮网）
      o = uwAbsorb(o, tw);                                    // 水体本身的颜色（替代旧的屏幕滤镜色）
      o = mix(o, uFogColor, smoothstep(uFogNear, uFogFar, tw) * fogA1);
      o += uwShafts(uRo, r, tw, camSky / 15.0);
      float zw = max(tw * cosF, uNear * 1.01);
      #if SHADOW_PASS
      oD *= 1.0 - clamp(st.a * uwSurfaceAlpha / 0.667, 0.0, 1.0);
      oD = (uwAbsorb(oD, tw) - uwAbsorb(vec3(0.0), tw)) * (1.0 - smoothstep(uFogNear, uFogFar, tw) * fogA1);
      oDirect = vec4(oD, 0.0);
      #endif
      gl_FragColor = vec4(o, 1.0);
      gl_FragDepth = uFar * (zw - uNear) / (zw * (uFar - uNear));
      RET;
    }
    if (camW && hit && kind != 4) col = uwAbsorb(col, tHit);
    col = mix(col, applyFog(col, z), fogA1);
    if (camW && hit) col += uwShafts(uRo, r, tHit, camSky / 15.0);
    #if SHADOW_PASS
    if (camW && hit && kind != 4) colD = uwAbsorb(colD, tHit) - uwAbsorb(vec3(0.0), tHit);
    colD = mix(colD, applyFog(colD, z) - applyFog(vec3(0.0), z), fogA1);
    if (cloud && !camW && (tc * cosF < z || (kind == 4 && r.y > 0.0))) colD *= 1.0 - cc.a;
    oDirect = vec4(colD, 0.0);
    #endif
    if (cloud && !camW && tc * cosF < z) { col = mix(col, cc.rgb, cc.a); z = tc * cosF; }   // 地形在云后（高处俯视）
    else if (cloud && !camW && kind == 4 && r.y > 0.0) col = mix(col, cc.rgb, cc.a);       // 上行射线预算耗尽（=远景雾）：云仍画在其上，否则地平线上方出现无云带
    gl_FragColor = vec4(col, 1.0);
    gl_FragDepth = uFar * (z - uNear) / (z * (uFar - uNear));
    RET;
    #endif
  }`;
