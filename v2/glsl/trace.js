// trace：花草 / 火把 / 树叶命中、cellIn、trace()（glmod 步骤 2：从 DDA_FS 原样搬出；拼接顺序见 gl.js 的 DDA_FS）
import { glsl } from '../pass.js';
// crossHit … trace
export const trace = ({ BT, LEAF_CARD_LAYER, LEAF_OK, LV }) => glsl`  // 花草：格内两条对角竖直平面（v1 emitCross：x=z 与 x+z=1，水平范围 0.15..0.85）
  // sw = 摇动剪切量（高草；底部固定、顶部偏移 sw·(1, 0.6)，同树叶）；线性剪切不改变射线参数 t
  bool crossHit(vec3 o, vec3 d, float t0, float t1, float layer, float sw, inout float tH, inout vec2 uvH) {
    if (sw != 0.0) { vec2 sv = sw * vec2(1.0, 0.6); o.xz -= sv * o.y; d.xz -= sv * d.y; }
    float ta = -(o.x - o.z) / (d.x - d.z), tb = (1.0 - o.x - o.z) / (d.x + d.z);
    for (int k = 0; k < 2; k++) {
      float tt = (k == 0) == (ta < tb) ? ta : tb;
      if (tt < t0 || tt > t1) continue;
      vec3 p = o + d * tt;
      if (p.x < 0.15 || p.x > 0.85 || p.y < 0.0 || p.y > 1.0) continue;
      vec2 uv = vec2((p.x - 0.15) / 0.7, p.y);
      if (matSampleLod(uv, layer, lodAt(tt)).a >= 0.5) { tH = tt; uvH = uv; return true; }
    }
    return false;
  }
  // 火把：2×10×2 texel 小盒子；贴墙时按 v1 emitTorch 的剪切变换倾斜（在剪切空间里做 slab 求交）
  bool torchHit(ivec3 cell, vec3 o, vec3 d, float t0, float t1, float layer, inout float tH, inout vec2 uvH) {
    int wx = 0, wz = 0;
    if (!solidAt(cell - ivec3(0, 1, 0))) {
      if (solidAt(cell + ivec3(1, 0, 0))) wx = 1; else if (solidAt(cell - ivec3(1, 0, 0))) wx = -1;
      else if (solidAt(cell + ivec3(0, 0, 1))) wz = 1; else if (solidAt(cell - ivec3(0, 0, 1))) wz = -1;
    }
    if (wx != 0 || wz != 0) {
      o.y -= 0.2;
      vec2 w = vec2(wx, wz);
      o.xz -= w * (0.35 - 0.45 * o.y); d.xz += w * 0.45 * d.y;
    }
    vec3 inv = 1.0 / d, lo = vec3(7.0, 0.0, 7.0) / 16.0, hi = vec3(9.0, 10.0, 9.0) / 16.0;
    vec3 a = (lo - o) * inv, b = (hi - o) * inv, tn = min(a, b), tf = max(a, b);
    float te = max(max(tn.x, tn.y), tn.z), tx = min(min(tf.x, tf.y), tf.z);
    if (te > tx || tx < t0 || te > t1) return false;
    float tt = max(te, t0);
    vec3 p = o + d * tt;
    vec2 uv = (tn.y == te && te >= t0) ? vec2(p.x * 16.0, p.z * 16.0 + 1.0) / 16.0
            : (tn.x == te ? vec2(p.z, p.y) : vec2(p.x, p.y));
    if (matSampleLod(uv, layer, lodAt(tt)).a < 0.5) return false;
    tH = tt; uvH = uv; return true;
  }

  // ── 树叶（goals §1/§2）──
  bool gLeafSolid = false;             // LEAF_SH == 0 时：本次阴影射线的受光面是树叶 → 树叶按实心
  // 距离一律按「格中心到相机」量化：整块树叶一起切换精度/摇动幅度，不会出现一个球面扫过所有树
  float cellD(ivec3 c) { return length(vec3(c) + 0.5 - uRo); }
  ivec3 gShHome = ivec3(-1 << 20);     // 阴影射线跳过的起点格（卡片命中点在树叶格内）
  bool gCrossRecv = false;             // 本次阴影射线的受光面是高草：高草不互相投影（同树叶：自身只有投到地面的拖影；花照常受影）
  uint lhash(ivec3 c) { return hashU(c + ivec3(int(uWOff.x), 0, int(uWOff.y)), uint(uLeaf1.w)); }
  // 精度切换渐变（leafLodMs）：宿主维护一个指数滞后的相机 uRoLag（τ = leafLodMs）。
  // 格中心对「当前」和「滞后」相机的距离在阈值 L 两侧 → 该格正在切换；进度 = 滞后相机走到阈值球面还差多少
  // （匀速移动时滞后距离 = v·τ → 每格切换历时 ≈ τ，与速度无关）。返回「实心度」0..1
  float lodK(ivec3 c, float L) {
    if (L > 1e29) return 0.0;
    vec3 cc = vec3(c) + 0.5;
    float dn = length(cc - uRo) - L, dl = length(cc - uRoLag) - L;
    if ((dn > 0.0) == (dl > 0.0)) return dn > 0.0 ? 1.0 : 0.0;
    float p = dn / (dn - dl);                         // 0 = 刚跨过（仍是旧状态）→ 1 = 完成
    return dn > 0.0 ? p : 1.0 - p;
  }
  // 溶解拖尾：入射面上按 16² texel 的世界哈希逐像素切换（和贴图像素对齐，像是叶子逐片填满/长出孔洞）
  float lodDither(ivec3 c, ivec3 nrm, vec3 f) {
    vec2 p = nrm.x != 0 ? f.zy : nrm.y != 0 ? f.xz : f.xy;
    ivec2 tx = ivec2(clamp(floor(p * 16.0), 0.0, 15.0));
    int fid = nrm.x != 0 ? 0 : nrm.y != 0 ? 1 : 2;
    ivec3 w = c + ivec3(int(uWOff.x), 0, int(uWOff.y));
    return float(hashU(ivec3(w.x * 16 + tx.x, w.y * 16 + tx.y, w.z * 3 + fid), 4241u) & 1023u) / 1023.0;
  }
  bool lodSolid(ivec3 c, float L, ivec3 nrm, vec3 f) {
    float k = lodK(c, L);
    return k >= 1.0 || (k > 0.0 && lodDither(c, nrm, f) < k);
  }
  // 摇动：按世界格哈希错相的正弦剪切量；距离 [0.7, 1]·swayDist 内淡出，之外为 0（阴影射线不摇）
  float swayK(ivec3 c) {
    float dc = cellD(c);
    if (uSway.x <= 0.0 || dc >= uSway.z) return 0.0;
    vec2 w = vec2(c.xz) + uWOff;
    return uSway.x * clamp((uSway.z - dc) / (0.3 * uSway.z), 0.0, 1.0)
         * sin(uTime * uSway.y + float(lhash(c) & 1023u) / 1023.0 * 6.2832 + (w.x + w.y) * 0.3);
  }
  vec3 swayF(ivec3 c, vec3 f) { f.xz += swayK(c) * vec2(1.0, 0.6) * f.y; return f; }
  bool leafFace(ivec3 c, vec3 o, vec3 r, float t, ivec3 nrm, uvec4 inf) {   // 主射线：入射面 alpha（带摇动）
    float ly, sh; vec2 uv = faceUV(nrm, swayF(c, clamp(o + r * t, 0.0, 1.0)), inf, ly, sh);
    return matSampleLod(uv, ly, lodAt(t)).a >= 0.5;
  }
  #if LEAF_CARDS
  // 叶簇卡片：格内 2 张对角竖卡 + 2 张斜卡（层数≥2），按格哈希旋转/翻转/法向偏移；边长 +外伸 可伸出格外
  // lc = 树叶格，o = ro - lc，[t0,t1] = 射线在当前所在格内的区间；tH 保留最近命中
  bool leafCards(ivec3 lc, vec3 o, vec3 d, float t0, float t1, float sw, inout float tH, inout vec2 uvH) {
    uint h = lhash(lc);
    vec3 q = o - 0.5, e = d;
    vec2 sv = sw * vec2(1.0, 0.6);
    q.xz -= sv * (q.y + 0.5); e.xz -= sv * e.y;      // 摇动剪切（底部固定）
    if ((h & 1u) != 0u) { q.xz = vec2(-q.z, q.x); e.xz = vec2(-e.z, e.x); }
    if ((h & 2u) != 0u) { q.xz = -q.xz; e.xz = -e.xz; }
    bool flip = (h & 4u) != 0u;
    float off = float((h >> 3) & 255u) / 255.0 * 0.2 - 0.1, ov = uLeaf1.x;
    int np = uLeaf1.z >= 1.5 ? 4 : 2;
    bool got = false;
    for (int k = 0; k < 4; k++) {
      if (k >= np) break;
      vec3 n, ua, va; float hu;
      if (k == 0)      { n = vec3(0.7071, 0.0, -0.7071); ua = vec3(0.7071, 0.0, 0.7071);  va = vec3(0.0, 1.0, 0.0); hu = 0.7071; }
      else if (k == 1) { n = vec3(0.7071, 0.0, 0.7071);  ua = vec3(0.7071, 0.0, -0.7071); va = vec3(0.0, 1.0, 0.0); hu = 0.7071; }
      else if (k == 2) { n = vec3(-0.3304, 0.9439, 0.0); ua = vec3(0.9439, 0.3304, 0.0);  va = vec3(0.0, 0.0, 1.0); hu = 0.53; }
      else             { n = vec3(0.0, 0.9439, 0.3304);  ua = vec3(0.0, -0.3304, 0.9439); va = vec3(1.0, 0.0, 0.0); hu = 0.53; }
      float dn = dot(n, e); if (abs(dn) < 1e-5) continue;
      float tt = (off - dot(n, q)) / dn;
      if (tt < t0 || tt > t1 || tt >= tH) continue;
      vec3 p = q + e * tt;
      float eu = hu + ov, ev = 0.5 + ov, u = dot(p, ua), v = dot(p, va);
      if (abs(u) > eu || abs(v) > ev) continue;
      vec2 uv = vec2(u / eu, v / ev) * 0.5 + 0.5; if (flip) uv.x = 1.0 - uv.x;
      if (matSampleLod(uv, ${LEAF_CARD_LAYER}.0, lodAt(tt)).a >= uLeaf1.y) { tH = tt; uvH = uv; got = true; }
    }
    return got;
  }
  #endif


  // 入格（逐格进砖 / DF 入口探测 / DF 盒跳跃落点共用）：t 时刻、刚跨过 a 轴的面（a = −1：未跨面）后，在盒 [lo, hi) 里所在的格。
  // 生产：clamp(floor(ro + r·t))——跨越轴由 clamp 落到盒内第一格；其余轴只在浮点舍入级（~1e-6）的平局上与逐格步进分歧
  //   （逐格层连续走过砖界、砖级在砖界重新入格，两边在平局上可能选不同的邻格：同样安全，DF 开/关会差个别像素）。
  // REF_MODE（参考模式，setRef）：每轴取最近格面 k，用与步进完全相同的式子算平面时间 P = (k − ro)·inv：P < t（或 P == t 且该轴
  //   优先于 a；平局优先级 z > y > x = 步进分支的 < 比较）→ 已跨过 → 进入 k 那一侧的格。逐位等于逐格步进 → DF 开/关 0 px；
  //   代价约 5%（默认预设）/ 10%（bliss），所以只在逐像素对比时编进去。
  // 旧写法 floor(ro + r·(t + 1e-4)) 在两个面相距 < 1e-4 时会跳过一格（报砖入口的 t / 法线：草地上的黑点）
  ivec3 cellIn(vec3 ro, vec3 r, vec3 inv, ivec3 st, float t, int a, ivec3 lo, ivec3 hi) {
    #if REF_MODE
    vec3 k = floor(ro + r * t + 0.5), P = (k - ro) * inv;
    vec3 cr = step(0.5, vec3(lessThan(P, vec3(t))) + vec3(equal(P, vec3(t))) * vec3(greaterThan(ivec3(0, 1, 2), ivec3(a))));
    vec3 neg = vec3(lessThan(st, ivec3(0)));
    return clamp(ivec3(k - mix(1.0 - neg, neg, cr)), lo, hi - 1);   // 跨过：st>0 → k，st<0 → k−1；未跨过：st>0 → k−1，st<0 → k
    #else
    return clamp(ivec3(floor(ro + r * t)), lo, hi - 1);
    #endif
  }

  int nAx(ivec3 n) { return n.x != 0 ? 0 : n.y != 0 ? 1 : 2; }

  // 两级 DDA（4³ 砖 → 体素）。kind：0 = 方块面（含镂空方块），2 = 花草，3 = 火把，6 = 树叶卡片
  bool trace(vec3 ro, vec3 r, float maxD, int maxSteps, bool shadow,
             out float tHit, out ivec3 hc, out ivec3 nrm, out uint hid, out int kind, out vec3 uvl,
             out float tw, out ivec3 wn) {
    // 分量为 0 时 inv=inf、sign=0，起点恰在格边界会得到 0*inf=NaN（整列/整行穿到天空的细线）→ 钳到 ±1e-7
    vec3 inv = 1.0 / r;
    ivec3 st = ivec3(sign(r)), up = max(st, ivec3(0));
    vec3 t1, t2, tn, tf;
    t1 = (uLo - ro) * inv; t2 = (uHi - ro) * inv; tn = min(t1, t2); tf = max(t1, t2);
    float tE = max(max(tn.x, tn.y), tn.z), tX = min(min(min(tf.x, tf.y), tf.z), maxD);
    nrm = ivec3(0, 1, 0); kind = 0; uvl = vec3(0.0); hid = 0u; tHit = 0.0; hc = ivec3(0); tw = -1.0; wn = ivec3(0, 1, 0);
    if (tE > 0.0) nrm = tn.x == tE ? ivec3(-st.x, 0, 0) : tn.y == tE ? ivec3(0, -st.y, 0) : ivec3(0, 0, -st.z);
    float t = max(tE, 0.0);
    if (t >= tX || (r.y >= 0.0 && ro.y >= uWorldMaxY)) return false;   // 环外 / 天空早退
    ivec3 home = shadow ? gShHome : ivec3(floor(ro));
    // 平面时间一律现算 (平面 − ro)·inv（不累加、不跨迭代保存 tM）：任何路径（逐格 / 砖级 / DF 盒跳跃）到达同一平面的 t 逐位相同，
    // 循环携带的寄存器也少 3 个（tools/shader-stats.mjs：本着色器是 SIMD8 且有 spill，循环状态每多一个寄存器都直接变慢）
    bool fine = false, dfm = false;                     // dfm：逐格层位于 DF 已算的区块（步进 = 盒跳跃，k = 0 即普通一步，不再按砖分段）
    ivec3 bc = ivec3(0), cell = cellAt(ro, r, t + 1e-4, 4.0);
    ivec2 curCh = ivec2(-1 << 20); int cmax = 0; uint sEmpty = 0u, sFull = 0u;
    uint prevId = 0u; int nAlpha = 0;
    // 相机在水中：不画水面（由水下雾表现）；tw 改为记录出水点（水中路径长度，用于仰视透光窗）
    bool camWater = !shadow && home.y >= 0 && home.y < H && isFluid(voxAt(home));
    bool exh = false;
    for (int i = 0; i < 576; i++) {
      if (t >= tX) break;
      if (i >= maxSteps) { exh = true; break; }
      #if DBG_HEAT
      if (shadow) gSIt++; else gIt++;
      #endif
      if (!fine) {
        ivec2 ch = ivec2(floor(vec2(cell.xz) / 4.0));
        if (ch != curCh) { curCh = ch; uvec3 cc = colAt(ch); cmax = int(cc.x); sEmpty = cc.y; sFull = cc.z; }
        if (cell.y * 4 >= cmax) {
          if (camWater && tw < 0.0) { tw = t; wn = nrm; }               // 相机在水中：记录出水点
          // 整段高于本区块列高：直接跳到列出口，或下降到 y = 列高 的平面
          vec2 tc = (vec2((ch + up.xz) * 16) - ro.xz) * inv.xz;
          float tCol = min(tc.x, tc.y), tY = (r.y < 0.0 && cmax > 0) ? (float(cmax) - ro.y) * inv.y : 1e30;
          // 跨越的那一维直接按整数给出（掠射时 t+ε 推不过平面：cmax 为 4 的倍数会原地打转直到耗尽 → 横线）
          if (tY < tCol) {
            t = max(t, tY); nrm = ivec3(0, 1, 0);
            cell = cellAt(ro, r, t, 4.0); cell.y = (cmax - 1) / 4;
          } else {
            t = max(t, tCol); cell = cellAt(ro, r, t, 4.0);
            if (tc.x < tc.y) { nrm = ivec3(-st.x, 0, 0); cell.x = st.x > 0 ? (ch.x + 1) * 4 : ch.x * 4 - 1; }
            else             { nrm = ivec3(0, 0, -st.z); cell.z = st.z > 0 ? (ch.y + 1) * 4 : ch.y * 4 - 1; }
          }
          prevId = 0u;
          #if DBG_HEAT
          if (!shadow) gLvC++;
          #endif
          continue;
        }
        // 区块段标记（handover §3.1；此处 cell.y*4 < cmax ≤ H，段号 < 16）
        #if SECT
        uint sb = cell.y >= 0 ? 1u << uint(cell.y >> 2) : 0u;
        if ((sEmpty & sb) != 0u) {                         // 全空段：直接跳到段 AABB 出口（同列高跳过的写法）
          if (camWater && tw < 0.0) { tw = t; wn = nrm; }
          int sy = cell.y >> 2;
          vec3 tb = (vec3(ivec3(ch.x, sy, ch.y) + up) * 16.0 - ro) * inv;
          cell = cellAt(ro, r, max(t, min(min(tb.x, tb.y), tb.z)), 4.0);
          if (tb.x < tb.y && tb.x < tb.z) { t = max(t, tb.x); nrm = ivec3(-st.x, 0, 0); cell.x = st.x > 0 ? (ch.x + 1) * 4 : ch.x * 4 - 1; }
          else if (tb.y < tb.z)           { t = max(t, tb.y); nrm = ivec3(0, -st.y, 0); cell.y = st.y > 0 ? (sy + 1) * 4 : sy * 4 - 1; }
          else                            { t = max(t, tb.z); nrm = ivec3(0, 0, -st.z); cell.z = st.z > 0 ? (ch.y + 1) * 4 : ch.y * 4 - 1; }
          prevId = 0u;
          #if DBG_HEAT
          if (!shadow) gLvC++;
          #endif
          continue;
        }
        if ((sFull & sb) != 0u) {                          // 全不透明段：入口格必然命中（除非相机就在这格里）
          ivec3 fc = clamp(cellAt(ro, r, t + 1e-4, 1.0), cell * 4, cell * 4 + 3);
          if (fc != home) {
            if (camWater && tw < 0.0) { tw = t; wn = nrm; }
            tHit = t; hc = fc; hid = vhm(voxAt(fc)); return true;
          }
        }
        #endif
        ivec3 vc = cellIn(ro, r, inv, st, t, i == 0 && tE <= 0.0 ? -1 : nAx(nrm), cell * 4, cell * 4 + 4);   // 进砖时的入口格（起点在环内 = 未跨面）
        #if DF
        // 入口格的 v ≠ 0 → 本区块 DF 已算（或本格占据）→ 逐格层，之后整块区块内不再回砖级
        if (cell.y >= 0 && (voxAt(vc).a & 31u) != 0u) { fine = true; dfm = true; cell = vc; continue; }
        #if DBG_HEAT
        if (!shadow && cell.y >= 0) gDf0++;
        #endif
        #endif
        if (cell.y >= 0 && brickAt(cell) != 0u) {          // 非空砖 → 逐格 DDA（限定在砖内）
          fine = true; dfm = false; bc = cell; cell = vc;
          continue;
        }
        prevId = 0u;
        if (camWater && tw < 0.0) { tw = t; wn = nrm; }
        #if DBG_HEAT
        if (!shadow) gLvB++;
        #endif
        vec3 tb = (vec3((cell + up) * 4) - ro) * inv;
        if (tb.x < tb.y && tb.x < tb.z) { t = tb.x; cell.x += st.x; nrm = ivec3(-st.x, 0, 0); }
        else if (tb.y < tb.z)           { t = tb.y; cell.y += st.y; nrm = ivec3(0, -st.y, 0); }
        else                            { t = tb.z; cell.z += st.z; nrm = ivec3(0, 0, -st.z); }
      } else {
        if (!dfm && ivec3(floor(vec3(cell) / 4.0)) != bc) {   // 离开砖 → 回到砖级
          fine = false; cell = ivec3(floor(vec3(cell) / 4.0));   // 精确：刚跨出的格所在砖
          continue;
        }
        uvec4 vx = voxAt(cell);
        uint id = vx.r, hm = vhm(vx), v = vx.a & 31u;
        #if DF
        if (dfm && v == 0u) {                               // 区块 DF 尚未回包（只有占据格 = 1）→ 退回砖内逐格
          dfm = false; bc = ivec3(floor(vec3(cell) / 4.0));
          #if DBG_HEAT
          if (!shadow) gDf2++;
          #endif
        }
        #endif
        if (camWater && tw < 0.0 && !isFluid(vx)) {         // 出水点；向上穿出顶面时水面按 fluidTop 下沉（v1 lowerTop 1/8）
          tw = t; wn = nrm;                                  // （逐格层才下沉；DF 逐格层里本格所在砖为空时 = 原砖级记录，不下沉）
          if (nrm.y < 0 && (!dfm || brickAt(ivec3(floor(vec3(cell) / 4.0))) != 0u)) tw = max(t - (1.0 - fluidTop(0u, false)) / r.y, 0.0);
        }
        vec3 tc = (vec3(cell + up) - ro) * inv;             // 本格出口面
        int k = 0;
        #if DF
        if (dfm && v >= 3u) k = int(v) - 2;                 // 本格非 DF 占据且 d ≥ 2：盒内全空，不看内容
        else
        #endif
        if (id != 0u) {
          float tN = min(min(tc.x, tc.y), tc.z);
          vec3 o = ro - vec3(cell);
          // 不透明非树叶（A：OPAQUE 且非 LEAF）→ 直接命中，不查 uInfo（树叶阴影「无」时内部树叶 255 例外，走下面的通用分支）
          #if LEAF_SH == 2
          if ((vx.a & 96u) == 32u && cell != home && !(shadow && ${LEAF_OK ? 'id == 255u' : 'false'})) { tHit = t; hc = cell; hid = hm; return true; }
          #else
          if ((vx.a & 96u) == 32u && cell != home) { tHit = t; hc = cell; hid = hm; return true; }
          #endif
          if (isFluid(vx)) {
            if (!shadow && tw < 0.0 && !camWater) {                          // 流体：只记录首次入水点，射线继续穿过
              // 上方不是同种流体 → 水面下沉到 fluidTop（同 v1 lowerTop 7/8）：入射点高于水面时改求与水面平面的交点
              float top = fluidTop(VMETA(vx), cell.y + 1 < H && isFluid(voxAt(cell + ivec3(0, 1, 0))));
              float y0 = o.y + r.y * t;
              if (top >= 1.0 || y0 <= top) { tw = t; wn = nrm; }
              else if (r.y < 0.0) { float tp = (top - o.y) / r.y; if (tp <= tN) { tw = tp; wn = ivec3(0, 1, 0); } }
            }
          } else {
          uvec4 inf = infoOf(hm);
          uint rk = inf.r & 15u;
          if ((inf.r & 128u) != 0u) {                                       // 树叶（LEAVES_INNER 走下面的不透明分支）
            if (cell != home) {
              if (shadow) {                                                  // 阴影（不摇）：LEAF_SH 编译期三档
                #if LEAF_SH == 0
                bool h = gLeafSolid;                                         // 树叶受光面：树叶之间按实心
                #if LEAF_SH_LOD
                h = h || lodSolid(cell, uLeaf0.y, nrm, clamp(o + r * t, 0.0, 1.0));   // 远处叶块整格投实心影（带渐变）
                #endif
                h = h || ++nAlpha > 8;
                if (!h) { float ly, sh; vec2 uv = faceUV(nrm, clamp(o + r * t, 0.0, 1.0), inf, ly, sh); h = matSampleLod(uv, ly, lodAt(t)).a >= 0.5; }
                if (h) { tHit = t; hc = cell; hid = hm; return true; }
                #elif LEAF_SH == 1
                tHit = t; hc = cell; hid = hm; return true;                  // 实心：直接命中
                #endif
                                                                             // LEAF_SH == 2：穿过
              }
              #if LEAF_LOD
              else if (lodSolid(cell, uLeaf0.x, nrm, clamp(o + r * t, 0.0, 1.0)) || ++nAlpha > 8) {   // 远处 LOD：实心（带渐变）
              #else
              else if (++nAlpha > 8) {
              #endif
                tHit = t; hc = cell; hid = hm; return true;
              } else {
                #if LEAF_CARDS
                if (uLeaf1.z >= 2.5 && leafFace(cell, o, r, t, nrm, inf)) { tHit = t; hc = cell; hid = hm; return true; }
                float tt = 1e30; vec2 uv = vec2(0.0);
                if (leafCards(cell, o, r, t, tN, swayK(cell), tt, uv)) {
                  tHit = tt; hc = cell; hid = hm; kind = 6; uvl = vec3(uv, ${LEAF_CARD_LAYER}.0); return true;
                }
                #else
                if (leafFace(cell, o, r, t, nrm, inf)) { tHit = t; hc = cell; hid = hm; return true; }
                #endif
              }
            }
          } else {
            #if LEAF_SH == 2
            if (cell != home && (inf.r & 16u) != 0u && !(shadow && ${LEAF_OK ? 'id == 255u' : 'false'})) {   // 不透明方块（树叶阴影「无」时内部树叶也不挡）
            #else
            if (cell != home && (inf.r & 16u) != 0u) {                     // 不透明方块
            #endif
              tHit = t; hc = cell; hid = hm; return true;
            }
            if (cell != home && rk == 1u && !((inf.r & 64u) != 0u && prevId == id)) {   // 镂空方块（玻璃等）：入射面 alpha 测试
              float ly, sh; vec2 uv = faceUV(nrm, clamp(o + r * t, 0.0, 1.0), inf, ly, sh);
              if (++nAlpha > 8 || matSampleLod(uv, ly, lodAt(t)).a >= 0.5) { tHit = t; hc = cell; hid = hm; return true; }
            }
            #if LEAF_CARDS
            if (rk == 5u && !shadow && cellD(cell) < uLeaf0.w && ++nAlpha <= 8) {     // 外伸格：测相邻树叶格（≤ 3 个）伸进来的卡片
              uint m = id - 191u; float tt = 1e30; vec2 uv = vec2(0.0); ivec3 lb = ivec3(0); bool fd = false; int nt = 0;
              for (int k = 0; k < 6; k++) {
                if ((m & (1u << uint(k))) == 0u) continue;
                if (++nt > 3) break;
                ivec3 lc = cell + ivec3(k == 0 ? 1 : k == 1 ? -1 : 0, k == 2 ? 1 : k == 3 ? -1 : 0, k == 4 ? 1 : k == 5 ? -1 : 0);
                if (leafCards(lc, ro - vec3(lc), r, t, tN, swayK(lc), tt, uv)) { lb = lc; fd = true; }
              }
              if (fd) { tHit = tt; hc = lb; hid = ${LV != null ? LV : 0}u; kind = 6; uvl = vec3(uv, ${LEAF_CARD_LAYER}.0); return true; }
            }
            #endif
          }
          if ((rk == 2u || rk == 3u) && !(shadow && gCrossRecv && id == ${BT.tallGrassId != null ? BT.tallGrassId : 256}u)) {   // 花草 / 火把（高草受光面的阴影射线穿过高草）
            float tt = 0.0; vec2 uv = vec2(0.0);
            bool h = ++nAlpha > 8 ? false : rk == 2u ? crossHit(o, r, t, tN, float(inf.a), !shadow && id == ${BT.tallGrassId != null ? BT.tallGrassId : 256}u ? swayK(cell) : 0.0, tt, uv)
                                                     : torchHit(cell, o, r, t, tN, float(inf.a), tt, uv);
            if (h) { tHit = tt; hc = cell; hid = hm; kind = int(rk); uvl = vec3(uv, float(inf.a)); return true; }
          }
          }
        }
        prevId = id;
        #if DBG_HEAT
        if (!shadow) { if (k > 0) gLvD++; else gLvV++; }
        #endif
        // 步进：盒 [cell−k, cell+k+1)（xz 裁到本区块）的出口面；k = 0 即逐格一步。出口轴按平局优先级 z > y > x（= < 比较）
        ivec3 lo = cell, hi = cell + 1;
        vec3 tb = tc;
        #if DF
        ivec2 c0 = cell.xz & ~15;                           // 本区块原点（补码按位与 = 向 −∞ 取整到 16 的倍数）
        if (k > 0) { lo = cell - k; hi = cell + k + 1; lo.xz = max(lo.xz, c0); hi.xz = min(hi.xz, c0 + 16); tb = (vec3(lo + (hi - lo) * up) - ro) * inv; }
        #endif
        int a = tb.x < tb.y && tb.x < tb.z ? 0 : tb.y < tb.z ? 1 : 2;
        t = a == 0 ? tb.x : a == 1 ? tb.y : tb.z;
        #if DF
        if (k > 0) cell = cellIn(ro, r, inv, st, t, a, lo, hi);   // 非出口轴的落点（出口轴下面直接给整数）
        #endif
        if (a == 0)      { cell.x = st.x > 0 ? hi.x : lo.x - 1; nrm = ivec3(-st.x, 0, 0); }
        else if (a == 1) { cell.y = st.y > 0 ? hi.y : lo.y - 1; nrm = ivec3(0, -st.y, 0); }
        else             { cell.z = st.z > 0 ? hi.z : lo.z - 1; nrm = ivec3(0, 0, -st.z); }
        #if DF
        if (dfm && (cell.xz & ~15) != c0) { fine = false; cell = ivec3(floor(vec3(cell) / 4.0)); }   // 进入别的区块 → 砖级做列校验
        #endif
      }
    }
    // 迭代预算耗尽：按「全雾的远景」处理，避免掠射角下整片天空从山体/树冠里透出来
    if (exh && !shadow) { tHit = min(t, tX); hc = ivec3(0); hid = 0u; kind = 4; nrm = ivec3(0, 1, 0); return true; }
    return false;
  }

`;
