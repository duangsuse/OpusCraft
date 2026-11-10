/* gode/viz/gl.js —— pgviz 的 WebGL2 渲染（goal-pgviz §3.2、s13 V-4 / V-8）：R16UI 3D 纹理 + 轴向步进，六向正交，不走 rgl 管线。
   3D 窗口：环形容量 Wt 区块（按需增长到 48），纹理 (宽 x, 高 z, 深 y) = (16Wt, 16Wt, 256)，规范 YZX 的一块正好是 x 最快、z 次之、
   y 最慢，texSubImage3D 直接上传、不重排；实际载入的是以 uWin 起、边长 uWa（≤ Wt）的方块。槽表 uSlot（RGBA16I = cx, cz, 已载入）挡住环里的旧块。
   外圈 2D：固定 80×80 区块环，uCol（RGBA16I，每列 = 实体 type, y, 群系, 水深）+ 槽表 uSlot2；3D 窗口里的块也有列（群系色用它）。
   全屏三角形，每像素：屏幕 → 平面格 → 沿视线轴逐格 texelFetch，命中第一个「实体」（分类 1；流体累计水深继续，植物跳过）；
   3D 没有数据时俯视退到 2D 列（同一套光照规则，接缝处看不出），侧视画 2D 剖面轮廓（压暗）。
   选区 = 3D 盒（uSelMin/Max），每个视角画投影框；切片面穿过盒时高亮截面。只在状态变化时重绘（快放时由 app 驱动）。 */

const VS = `#version 300 es
void main() { vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float; precision highp int;
precision highp usampler3D; precision highp isampler2D;
uniform usampler3D uVox; uniform isampler2D uSlot; uniform isampler2D uCol; uniform isampler2D uSlot2; uniform sampler2D uLut; uniform sampler2D uBio; uniform sampler2D uBsel;
uniform int uW, uWa, uC, uWa2, uH, uSea;
uniform ivec2 uWin, uWin2;          // 3D / 2D 窗口最小区块
uniform vec2 uRes, uVp;             // 视口像素大小、左下角
uniform vec3 uCenter;               // 屏幕中心对应的世界点（视线轴分量无用）
uniform float uZoom;                // 像素 / 格
uniform ivec3 uF, uR, uD;           // 视线前向、屏幕右、屏幕下（单位轴向量）
uniform int uStart, uEnd;           // 视线轴上起止坐标（含），沿 uF 步进
uniform int uShade;                 // 0 方块色 1 群系色 2 洞窟（noclip 进地下：岩石剔除，只看洞窟空气围出来的墙面）
uniform int uTerr;                  // 俯视的地表阴影：0 默认台阶式（西 / 北邻列更高 → 压暗）1 2.5D 地形（邻列高度算法线的山体阴影）2 平滑光照（四角环境光遮蔽双线性插值）
uniform int uBMode;                 // 群系 finder：0 无 1 只显示（射线里剪枝）2 高亮 3 取消高亮（选中集 = uBsel，256×1 R8）
uniform vec3 uLight, uSun;          // 光色乘子（时间 / 光色覆盖；默认白）、太阳方向（指向光源；默认左上）
uniform int uAir, uGrid, uSel, uXray;   // uAir：0 无 1 灰渐变（格 > 22 px 叠黑色数字）；uXray：>0 = 切面往里这么多格内的方块半透明叠加（看穿、洞穴不只是截面）；uSel：0 无 1 选区 2 拉框预览
uniform ivec3 uSelMin, uSelMax;
uniform ivec4 uClip;                // 端点快放：轴、符号、值、开关 —— 越过的部分压暗并画切线
uniform ivec4 uInv;                 // 反色标记格 (x,y,z,开关)：选区近端格
uniform ivec4 uMark;                // 悬停格 (x,y,z,开关)
uniform int uFont[11];              // 3×5 位图：0–9 与 '-'
out vec4 o;

int fa;
int axisOf(ivec3 v) { return v.x != 0 ? 0 : v.y != 0 ? 1 : 2; }
int imod(int a, int m) { return (a + m * 65536) % m; }   // GLSL 的 % 对负数未定义：先平移成正数
int vox(ivec3 c) {   // -1 = 未载入；否则 u16 值
  if (c.y < 0 || c.y >= uH) return 0;
  ivec2 ch = ivec2(c.x >> 4, c.z >> 4);
  if (ch.x < uWin.x || ch.y < uWin.y || ch.x >= uWin.x + uWa || ch.y >= uWin.y + uWa) return -1;
  ivec4 s = texelFetch(uSlot, ivec2(imod(ch.x, uW), imod(ch.y, uW)), 0);
  if (s.z == 0 || s.x != ch.x || s.y != ch.y) return -1;
  return int(texelFetch(uVox, ivec3(imod(c.x, uW * 16), imod(c.z, uW * 16), c.y), 0).r);
}
bool col2(int x, int z, out ivec4 v) {
  ivec2 ch = ivec2(x >> 4, z >> 4);
  if (ch.x < uWin2.x || ch.y < uWin2.y || ch.x >= uWin2.x + uWa2 || ch.y >= uWin2.y + uWa2) return false;
  ivec4 s = texelFetch(uSlot2, ivec2(imod(ch.x, uC), imod(ch.y, uC)), 0);
  if (s.z == 0 || s.x != ch.x || s.y != ch.y) return false;
  v = texelFetch(uCol, ivec2(imod(x, uC * 16), imod(z, uC * 16)), 0); return true;
}
vec4 lut(int v) { return texelFetch(uLut, ivec2(v & 4095, 0), 0); }
int clsOf(vec4 l) { return int(l.a * 255.0 + 0.5) / 64; }
bool treeBlk(vec4 l) { return (int(l.a * 255.0 + 0.5) & 1) == 1; }   // LUT alpha 最低位 = 树类（叶 / 原木 / 藤 / 仙人掌）
bool underRock(ivec3 c) {   // 往上数：先碰到的实体是岩石（非树类）= 头顶有顶 = 地下；树冠下的空气先碰到树叶 → 不算
  for (int k = 1; k <= 48; k++) {
    int v = vox(ivec3(c.x, c.y + k, c.z));
    if (v < 0) return false;
    if (v > 0) { vec4 l = lut(v); if (clsOf(l) == 1) return !treeBlk(l); }
  }
  return false;
}
vec3 caveRamp(float y) {   // 洞底高度色：深处冷（紫蓝）→ 浅处暖（黄），跨度 0 … 海平面 + 24
  float t = clamp(y / float(uSea + 24), 0.0, 1.0);
  vec3 a = vec3(0.35, 0.20, 0.65), b = vec3(0.15, 0.45, 0.85), c = vec3(0.20, 0.75, 0.60), d = vec3(0.95, 0.85, 0.35);
  return t < 0.33 ? mix(a, b, t / 0.33) : t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34);
}
bool solidAt(ivec3 c) { int v = vox(c); return v > 0 && clsOf(lut(v)) == 1; }
vec3 caveFloor(ivec3 c, int v) {   // 俯视洞窟：玩家站在洞底看到的样子——高度分色 + 每 4 格一档明暗 + 头顶净空（矮洞暗）+ 贴墙 / 落差压暗；岩浆、水保持本色
  int hr = 0;
  for (int k = 1; k <= 24; k++) { int u = vox(ivec3(c.x, c.y + k, c.z)); if (u < 0 || (u > 0 && clsOf(lut(u)) == 1)) break; hr++; }
  vec3 bc = lut(v).rgb; float mx = max(bc.r, max(bc.g, bc.b)), sat = (mx - min(bc.r, min(bc.g, bc.b))) / max(mx, 0.001);
  vec3 b = mix(mix(caveRamp(float(c.y)), bc, 0.2), bc, smoothstep(0.35, 0.6, sat));
  ivec3 up = c - uF;
  int walls = int(solidAt(up + uR)) + int(solidAt(up - uR)) + int(solidAt(up + uD)) + int(solidAt(up - uD));
  int drops = int(!solidAt(c + uR)) + int(!solidAt(c - uR)) + int(!solidAt(c + uD)) + int(!solidAt(c - uD));
  float band = mod(float(c.y), 8.0) < 4.0 ? 1.0 : 0.86;
  float head = 0.5 + 0.5 * clamp(float(hr) / 5.0, 0.0, 1.0);
  return b * band * head * (1.0 - 0.12 * float(walls)) * (1.0 - 0.1 * float(drops));
}
bool bsel(int b) { return texelFetch(uBsel, ivec2(b & 255, 0), 0).r > 0.5; }
vec3 bio(int b) { return texelFetch(uBio, ivec2(b & 255, 0), 0).rgb; }
const vec3 WATER = vec3(0.247, 0.463, 0.894);

bool hgt(int x, int z, out float h) { ivec4 v; if (!col2(x, z, v)) return false; h = float(min(max(v.y, 0) + v.w, uStart)); return true; }   // 水面按水面高（湖面平）；切片面以下的列按切面压平
float terrShade(int x, int z, vec2 fr) {   // uTerr 1：光从 uSun 来；平地 = 1。uTerr 2：MC 平滑光照式的四角 AO（本格每角被 3 个更高的邻格遮挡 0…3 级），在格内双线性插值
  float a, b, c, d;
  if (uTerr == 2) {
    float h; if (!hgt(x, z, h)) return 1.0;
    float ao[4];   // 角：(−x,−z) (+x,−z) (−x,+z) (+x,+z)
    for (int k = 0; k < 4; k++) {
      int sx = (k & 1) == 0 ? -1 : 1, sz = k < 2 ? -1 : 1; float p, q, r;
      bool A = hgt(x + sx, z, p) && p > h, B = hgt(x, z + sz, q) && q > h, C = hgt(x + sx, z + sz, r) && r > h;
      ao[k] = A && B ? 3.0 : float(int(A) + int(B) + int(C));
    }
    float v = mix(mix(ao[0], ao[1], fr.x), mix(ao[2], ao[3], fr.x), fr.y);
    return 1.0 - 0.17 * v;
  }
  if (!hgt(x - 1, z, a) || !hgt(x + 1, z, b) || !hgt(x, z - 1, c) || !hgt(x, z + 1, d)) return 1.0;
  vec3 n = normalize(vec3((a - b) * 0.75, 1.0, (c - d) * 0.75));
  return clamp(dot(n, uSun) / uSun.y, 0.35, 1.4);
}
float topLight(int y) { return 0.82 + 0.18 * clamp(float(y - uSea + 32) / 96.0, 0.0, 1.0); }

void main() {
  fa = axisOf(uF);
  vec2 px = vec2(gl_FragCoord.x - uVp.x, uRes.y - (gl_FragCoord.y - uVp.y));
  vec2 s = (px - uRes * 0.5) / uZoom;
  vec3 wp = uCenter + vec3(uR) * s.x + vec3(uD) * s.y;
  ivec3 c = ivec3(floor(wp));
  int dir = uF[fa];
  c[fa] = uStart;
  ivec3 c0 = c;
  int n = (uEnd - uStart) * dir + 1;
  vec3 bg = vec3(0.075, 0.08, 0.095);
  int hitV = 0, wd = 0, dist = 0, waterV = 0, step = 0; bool known = false, hit = false, cave = false;
  vec3 xacc = vec3(0.0); float xa = 0.0;   // uXray：切面往里每格实体按深度衰减的叠加（前 + 后透出来）
  for (int i = 0; i < 1024; i++) {
    if (i >= n) break;
    step++;
    if (uBMode == 1) { ivec4 b0; if (col2(c.x, c.z, b0) && !bsel(b0.z)) { known = true; if (fa == 1) break; c[fa] += dir; if (wd == 0) dist++; continue; } }   // 只显示：未选中群系的列直接剪掉（当空气；俯视整条射线一步退出，侧视 / 切片沿线跳过）
    int v = vox(c);
    if (v < 0) { if (fa == 1 || known) break; c[fa] += dir; dist++; continue; }
    known = true;
    if (uShade == 2) {   // 洞窟：岩石（含地表）剔除；地表以下、头顶有岩石的空气 = 洞窟空气；进过洞窟后碰到的第一个实体 = 墙面
      bool open = v == 0 || clsOf(lut(v)) != 1;
      if (open) { ivec4 g0; if (col2(c.x, c.z, g0) && c.y < g0.y && underRock(c)) { cave = true; dist++; } }
      else if (cave) { hitV = v; hit = true; break; }
      c[fa] += dir; continue;
    }
    if (v != 0) {
      int k = clsOf(lut(v));
      if (uXray > 0 && (k == 1 || k == 2)) {   // xray：切面往里每格按 alpha 前到后合成；实体用方块色
        float al = k == 1 ? 0.26 : 0.14;
        xacc += (1.0 - xa) * al * lut(v).rgb; xa += (1.0 - xa) * al;
      }
      if (k == 1) {
        if (!hit) { hitV = v; hit = true; if (uXray == 0) break; }                                   // 无 xray：停在第一格实体
        if (uXray > 0 && step > uXray) break;
      }
      if (k == 2) { if (wd == 0) waterV = v; wd++; }
    }
    if (uXray > 0 && v == 0 && hit) { float al = 0.10; xacc += (1.0 - xa) * al * vec3(0.62, 0.30, 0.95); xa += (1.0 - xa) * al; }   // 地表以下的空气 = 紫色薄雾：洞 / 空腔在后面透出来（天空不染）
    if (wd == 0) dist++;
    c[fa] += dir;
  }
  vec3 col; bool shown = known;
  if (!known) {
    ivec4 cv;
    if (uF.y < 0 && col2(c0.x, c0.z, cv)) {          // 俯视：2D 列地表，光照规则同 3D（西 / 北邻列更高 → 压暗）
      shown = true;
      int y = cv.y, w = cv.w;
      vec3 base = uShade == 1 ? bio(cv.z) : (y >= 0 ? lut(cv.x).rgb : WATER);
      float sh = 1.0; ivec4 nw, nn;
      if (uTerr != 0) sh = terrShade(c0.x, c0.z, fract(wp.xz));
      else if (y >= 0 && col2(c0.x - 1, c0.z, nw) && col2(c0.x, c0.z - 1, nn)) {
        sh = 1.0 - 0.13 * float(int(nw.y > y) + int(nn.y > y));
        if (nw.y < y && nn.y < y) sh *= 1.06;
      }
      sh *= topLight(y);
      col = base * sh;
      if (w > 0) col = y >= 0 ? mix(col, uShade == 0 ? WATER * 0.85 : vec3(0.15, 0.3, 0.7), min(1.0, 0.45 + float(w) * 0.04)) : WATER * 0.7;
      if (uStart < y + w) col *= 0.35;               // 切片面在地表以下：外圈只有地表，压暗示意「这里看不到切面」
      if (uShade == 2) col = bg * 0.7;               // 洞窟模式：外圈没有洞窟数据，只留暗底
    } else if (fa != 1 && col2(c0.x, c0.z, cv)) {    // 侧视：2D 剖面轮廓（压暗）
      shown = true;
      int y = c0.y, sy = cv.y, w = cv.w;
      vec3 t = cv.x > 0 ? lut(cv.x).rgb : WATER;
      if (y == sy) col = t; else if (y < sy) col = mix(t, vec3(0.45), 0.7) * 0.7; else if (y <= sy + w) col = WATER * 0.8; else col = bg * 0.6;
      col *= 0.7;
    } else {   // 未生成：斜纹
      float k = mod(floor((px.x + px.y) / 6.0), 2.0);
      col = bg * (0.8 + 0.25 * k);
    }
  } else if (!hit && wd == 0) col = bg * 0.6;
  else {
    vec3 base;
    if (uShade == 1) { ivec4 cv; base = col2(c.x, c.z, cv) ? bio(cv.z) : vec3(0.5); }
    else base = hit ? lut(hitV).rgb : lut(waterV).rgb;
    float sh = 1.0;
    if (hit) {   // 光从屏幕左上、朝相机一侧来：那两个方向上更近一层有实体 → 压暗
      if (uTerr != 0 && uShade != 2 && fa == 1 && uF.y < 0) sh = terrShade(c.x, c.z, fract(wp.xz));
      else {
        int occ = int(solidAt(c - uF - uR)) + int(solidAt(c - uF - uD));
        sh = 1.0 - 0.13 * float(occ);
        if (!solidAt(c - uR) && !solidAt(c - uD)) sh *= 1.06;
      }
      if (uShade != 2) { if (fa == 1) sh *= topLight(c.y); else sh *= 1.0 - 0.45 * clamp(float(abs(c[fa] - uStart)) / 128.0, 0.0, 1.0); }
    }
    col = base * sh;
    if (uShade == 2 && fa == 1) col = caveFloor(c, hitV);
    else if (uShade == 2) col = mix(vec3(0.02, 0.03, 0.06), col * (0.55 + 0.9 * exp(-float(dist) / 40.0)), 0.25 + 0.75 * exp(-float(dist) / 56.0));   // 洞窟空气的深度雾：越深越暗、偏蓝黑（手电筒式）
    if (wd > 0) {
      vec3 w = uShade == 0 ? lut(waterV).rgb * 0.85 : vec3(0.15, 0.3, 0.7);
      col = hit ? mix(col, w, min(1.0, 0.45 + float(wd) * 0.04)) : w * 0.7;
    }
    if (uXray > 0) col = xacc + bg * (1.0 - xa);   // xray：纯体积合成（方块色 + 背景），洞 / 空腔是没被填上的暗区
  }
  if (uBMode != 0 && (known ? (hit || wd > 0) : shown)) {   // 群系 finder
    ivec2 xz = known ? c.xz : c0.xz; ivec4 bv;
    if (col2(xz.x, xz.y, bv)) {
      bool sel = bsel(bv.z); float lum = dot(col, vec3(0.3, 0.59, 0.11));
      if (uBMode == 1) col = sel ? col : vec3(lum) * 0.32;   // 正常到不了（已剪枝）；只剩纯水体射线的兜底
      else if (uBMode == 2) col = sel ? min(col * 1.12, vec3(1.0)) : mix(vec3(lum), col, 0.6) * 0.5;
      else col = sel ? vec3(lum) * 0.3 : col;
      if (uBMode != 3 && sel && fa == 1 && uZoom >= 1.5) {   // 选中群系朝外的边：格内 1.3 px 的亮线
        vec2 f2 = fract(wp.xz); ivec4 nb; bool ed = false;
        if (f2.x * uZoom < 1.3 && col2(xz.x - 1, xz.y, nb) && !bsel(nb.z)) ed = true;
        if ((1.0 - f2.x) * uZoom < 1.3 && col2(xz.x + 1, xz.y, nb) && !bsel(nb.z)) ed = true;
        if (f2.y * uZoom < 1.3 && col2(xz.x, xz.y - 1, nb) && !bsel(nb.z)) ed = true;
        if ((1.0 - f2.y) * uZoom < 1.3 && col2(xz.x, xz.y + 1, nb) && !bsel(nb.z)) ed = true;
        if (ed) col = vec3(1.0, 0.93, 0.45);
      }
    }
  }
  col *= uLight;
  if (uClip.w != 0) {   // 端点快放：越过切面的部分压暗，切面画亮线
    float d = (wp[uClip.x] - float(uClip.z)) * float(uClip.y);
    if (d > 0.0) col *= 0.35;
    if (abs(d) * uZoom < 1.0) col = vec3(1.0, 0.85, 0.2);
  }
  int ra = axisOf(uR), da = axisOf(uD);
  vec2 ab = vec2(wp[ra], wp[da]);
  if (uGrid != 0) {
    vec2 g = abs(fract(ab / 16.0 + 0.5) - 0.5) * 16.0 * uZoom;
    if (min(g.x, g.y) < 0.75) col = mix(col, vec3(1.0), 0.25);
  }
  vec2 f = fract(ab);
  if (uMark.w != 0 && uZoom >= 4.0) {
    ivec3 mc = uMark.xyz; ivec3 pc = ivec3(floor(wp));
    if (pc[ra] == mc[ra] && pc[da] == mc[da]) { vec2 e = min(f, 1.0 - f) * uZoom; if (min(e.x, e.y) < max(1.0, uZoom * 0.06)) col = mix(col, vec3(1.0), 0.6); }
  }
  if (uInv.w != 0) {   // 反色标：格 ≥ 8 px 整格反色；更小时画 8 px 的反色小方块（保证可见）
    vec2 d = abs(ab - (vec2(float(uInv[ra]), float(uInv[da])) + 0.5)) * uZoom;
    if (max(d.x, d.y) < max(uZoom * 0.5, 4.5)) col = vec3(1.0) - col;
  }
  if (uSel != 0) {   // 选区盒的投影框；切片面在盒的视线轴范围内 → 截面高亮
    vec2 lo = vec2(float(uSelMin[ra]), float(uSelMin[da])), hi = vec2(float(uSelMax[ra] + 1), float(uSelMax[da] + 1));
    bool cut = uStart >= uSelMin[fa] && uStart <= uSelMax[fa];
    vec3 lc = uSel == 2 ? vec3(1.0, 0.85, 0.2) : cut ? vec3(0.25, 0.95, 1.0) : vec3(1.0);
    bool inA = ab.x >= lo.x && ab.x < hi.x, inB = ab.y >= lo.y && ab.y < hi.y;
    if (inA && inB && uSel == 1) col = mix(col, cut ? vec3(0.2, 0.9, 1.0) : vec3(1.0), cut ? 0.25 : 0.08);
    vec2 e0 = abs(ab - lo) * uZoom, e1 = abs(ab - hi) * uZoom, m = vec2(1.5) / uZoom;
    bool edge = (min(e0.x, e1.x) < 1.25 && ab.y >= lo.y - m.y && ab.y <= hi.y + m.y) || (min(e0.y, e1.y) < 1.25 && ab.x >= lo.x - m.x && ab.x <= hi.x + m.x);
    if (edge && (uSel == 1 || mod(floor((px.x + px.y) / 5.0), 2.0) == 0.0)) col = lc;
  }
  if (uAir == 1 && known && (hit || wd > 0)) {   // 空气距离：水体风格灰渐变（和水深越深越暗同一思路：近亮远暗，任何缩放都能看；底下的明暗留一点点）
    float g = mix(0.92, 0.10, 1.0 - exp(-float(dist) / 14.0));
    col = mix(col, vec3(g) * (0.8 + 0.2 * dot(col, vec3(0.3, 0.59, 0.11))), 0.92);
    if (uZoom > 22.0 && dist < 10) {   // 格 > 22 px：叠黑色数字（3×5 位图，< 10）
      float gp = max(1.0, floor(uZoom / 6.0));
      vec2 q = (f * uZoom - (uZoom - vec2(3.0, 5.0) * gp) * 0.5) / gp;
      if (q.x >= 0.0 && q.y >= 0.0 && q.x < 3.0 && q.y < 5.0) {
        int bits = uFont[dist == 0 ? 10 : dist];
        int bi = int(q.y) * 3 + int(q.x);
        if (((bits >> (14 - bi)) & 1) != 0) col = vec3(0.0);
      }
    }
  }
  o = vec4(col, 1.0);
}`;

const FONT = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111',
  '111100111101111', '111001001010010', '111101111101111', '111101111001111', '000000111000000'].map(s => parseInt(s, 2));
export const C2 = 80;   // 外圈 2D 环（区块）

export class Renderer {
  constructor(canvas) {
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('需要 WebGL2');
    this.canvas = canvas;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const p = this.prog = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), k = a.name.replace(/\[0\]$/, ''); this.u[k] = gl.getUniformLocation(p, a.name); }
    gl.uniform1iv(this.u.uFont, FONT);
    ['uVox', 'uSlot', 'uCol', 'uSlot2', 'uLut', 'uBio', 'uBsel'].forEach((k, i) => gl.uniform1i(this.u[k], i));
    this.vao = gl.createVertexArray();
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.max3d = gl.getParameter(gl.MAX_3D_TEXTURE_SIZE);
    // 外圈 2D 环：固定 80×80 区块
    this.tCol = this.tex(2, gl.TEXTURE_2D); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16I, C2 * 16, C2 * 16);
    this.tSlot2 = this.tex(3, gl.TEXTURE_2D); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16I, C2, C2);
    this.slots2 = new Int16Array(C2 * C2 * 4);
    this.W = 0;
  }
  tex(unit, target) { const gl = this.gl, t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target, t);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; }
  // 3D 环容量 W 区块、高 H（换生成器或窗口长大时重分配；调用方随后重新上传全部已载入块）
  alloc(W, H) {
    const gl = this.gl, S = W * 16;
    if (S > this.max3d) throw new Error(`窗口 ${S} 超过 MAX_3D_TEXTURE_SIZE ${this.max3d}`);
    for (const t of [this.tVox, this.tSlot]) if (t) gl.deleteTexture(t);
    this.W = W; this.H = H;
    this.tVox = this.tex(0, gl.TEXTURE_3D); gl.texStorage3D(gl.TEXTURE_3D, 1, gl.R16UI, S, S, H);
    this.tSlot = this.tex(1, gl.TEXTURE_2D); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16I, W, W);
    this.slots = new Int16Array(W * W * 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, W, gl.RGBA_INTEGER, gl.SHORT, this.slots);
  }
  clear2() { const gl = this.gl; this.slots2.fill(0); gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tSlot2);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, C2, C2, gl.RGBA_INTEGER, gl.SHORT, this.slots2); }
  palette(blockLut, biomeLut) {
    const gl = this.gl;
    if (!this.tLut) { this.tLut = this.tex(4, gl.TEXTURE_2D); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 4096, 1); this.tBio = this.tex(5, gl.TEXTURE_2D); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, 256, 1); this.tBsel = this.tex(6, gl.TEXTURE_2D); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, 256, 1); this.bmask(null); }
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.tLut); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 4096, 1, gl.RGBA, gl.UNSIGNED_BYTE, blockLut);
    gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, this.tBio); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RGBA, gl.UNSIGNED_BYTE, biomeLut);
  }
  bmask(ids) {   // 群系 finder 的选中集（ids = 群系 id 数组 / null）
    const gl = this.gl, a = new Uint8Array(256); for (const i of ids ?? []) a[i & 255] = 255;
    gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.tBsel); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 256, 1, gl.RED, gl.UNSIGNED_BYTE, a);
  }
  // 一块进 3D 环：体素 + 槽表
  upload(rec) {
    const gl = this.gl, W = this.W, sx = ((rec.cx % W) + W) % W, sz = ((rec.cz % W) + W) % W;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, this.tVox);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, sx * 16, sz * 16, 0, 16, 16, this.H, gl.RED_INTEGER, gl.UNSIGNED_SHORT, rec.blocks, 0);
    this.setSlot(sx, sz, rec.cx, rec.cz, 1);
  }
  setSlot(sx, sz, cx, cz, on) {
    const gl = this.gl, s = this.slots, i = (sz * this.W + sx) * 4;
    s[i] = cx; s[i + 1] = cz; s[i + 2] = on;
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tSlot);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx, sz, 1, 1, gl.RGBA_INTEGER, gl.SHORT, s.subarray(i, i + 4));
  }
  // 一块的列进 2D 环
  uploadCol(cx, cz, col) {
    const gl = this.gl, sx = ((cx % C2) + C2) % C2, sz = ((cz % C2) + C2) % C2;
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tCol);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx * 16, sz * 16, 16, 16, gl.RGBA_INTEGER, gl.SHORT, col);
    const s = this.slots2, i = (sz * C2 + sx) * 4; s[i] = cx; s[i + 1] = cz; s[i + 2] = 1;
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.tSlot2);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, sx, sz, 1, 1, gl.RGBA_INTEGER, gl.SHORT, s.subarray(i, i + 4));
  }
  /* p: { vp:[x,y], res:[w,h], center:[x,y,z], zoom, F,R,D:[3], start, end, shade, air(0 无 1 数字 2 水体风格), grid, clip:[4], mark:[4],
          win:[cx0,cz0], wa, win2, wa2, sea, sel: 0|1|2, selMin:[3], selMax:[3] } */
  draw(p) {
    const gl = this.gl, u = this.u, vp = p.vp ?? [0, 0];
    gl.viewport(vp[0], vp[1], p.res[0], p.res[1]);
    gl.useProgram(this.prog); gl.bindVertexArray(this.vao);
    gl.uniform1i(u.uW, this.W); gl.uniform1i(u.uWa, p.wa); gl.uniform1i(u.uC, C2); gl.uniform1i(u.uWa2, p.wa2);
    gl.uniform1i(u.uH, this.H); gl.uniform1i(u.uSea, p.sea);
    gl.uniform2i(u.uWin, p.win[0], p.win[1]); gl.uniform2i(u.uWin2, p.win2[0], p.win2[1]);
    gl.uniform2f(u.uRes, p.res[0], p.res[1]); gl.uniform2f(u.uVp, vp[0], vp[1]);
    gl.uniform3f(u.uCenter, ...p.center); gl.uniform1f(u.uZoom, p.zoom);
    gl.uniform3i(u.uF, ...p.F); gl.uniform3i(u.uR, ...p.R); gl.uniform3i(u.uD, ...p.D);
    gl.uniform1i(u.uStart, p.start); gl.uniform1i(u.uEnd, p.end); gl.uniform1i(u.uShade, p.shade); gl.uniform1i(u.uTerr, p.terr | 0); gl.uniform1i(u.uBMode, p.bmode | 0); gl.uniform3f(u.uLight, ...(p.light ?? [1, 1, 1])); gl.uniform3f(u.uSun, ...(p.sun ?? [-0.5, 0.67, -0.5]));
    gl.uniform1i(u.uAir, p.air | 0); gl.uniform1i(u.uXray, p.xray | 0); gl.uniform1i(u.uGrid, p.grid ? 1 : 0);
    gl.uniform4i(u.uClip, ...p.clip); gl.uniform4i(u.uMark, ...p.mark); gl.uniform4i(u.uInv, ...(p.inv ?? [0, 0, 0, 0]));
    gl.uniform1i(u.uSel, p.sel ?? 0); gl.uniform3i(u.uSelMin, ...(p.selMin ?? [0, 0, 0])); gl.uniform3i(u.uSelMax, ...(p.selMax ?? [0, 0, 0]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const e = gl.getError();
    return e === gl.NO_ERROR ? null : 'GL error 0x' + e.toString(16);
  }
}
