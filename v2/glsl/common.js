// common：精度 / 宿主 GLSL / 宏与计数器 / 流体与哈希 / 体素数据访问·平滑光照·贴图坐标（glmod 步骤 2：从 DDA_FS 原样搬出；拼接顺序见 gl.js 的 DDA_FS）
import { glsl } from '../pass.js';
// 精度、宿主 light/mat/fog、H、DBG 计数宏
export const head = ({ GLSL, H }) => glsl`  precision highp float; precision highp int;
  precision highp usampler3D; precision highp usampler2D;
  ${GLSL.light}
  ${GLSL.mat}
  ${GLSL.fog}
  #define H ${H}
  // ── 测量（handover §5 / §9.2-7）：DBG 1 主射线迭代 / 2 fetch 计数 / 3 跳过 smoothLight / 5 层级（列+段跳/砖/体素，A = 云步数）
  //    6 texture() 采样计数（图集 / 水面噪声 / 云 3D 噪声；不含每像素固定的 tScene/tDepth）；DBGRAW=1 输出原始计数 ──
  //    4 DF：R = 盒跳跃次数（k ≥ 1 的步），G = 砖级入口 v == 0 → 退化 uBrick 的次数，B = 逐格层遇到本区块 DF 未回包（v == 0）的次数
  #define DBG_HEAT (DBG == 1 || DBG == 2 || DBG == 4 || DBG == 5 || DBG == 6)
  int gFetch = 0, gIt = 0, gSIt = 0, gLvC = 0, gLvB = 0, gLvV = 0, gTex = 0, gCl = 0, gLvD = 0, gDf0 = 0, gDf2 = 0;
  #if DBG_HEAT
  #define CNT(n) gFetch += n
  #define TEXC(n) gTex += n
  #define CLC() gCl++
  #define matSampleLod(uv, l, d) (gTex++, matSampleLod(uv, l, d))
  #else
  #define CNT(n)
  #define TEXC(n)
  #define CLC()
  #endif
`;
// REF_MODE 入格、isFluid / fluidTop / hashU / ign
export const util = ({ BT }) => glsl`  // 流体（§10.2 / goal-renderapi TODO-4）：判定走 uVox.A 的 FLUID 位（不再注入 waterId）；lvl = meta&15（0 满/源，1–7 MC 等级，8 下落柱）
  // above = 上方同为流体 → 满格；否则水面下沉
  #define FLUID_TILE ${BT.tileSide[BT.waterId]}.0
  #if REF_MODE
  #define REFL_STEPS 576
  #else
  #define REFL_STEPS 64
  #endif
  bool isFluid(uvec4 v) { return (v.a & 128u) != 0u; }    // uVox.A FLUID 位（由 BlockState.fluid 打包）
  float fluidTop(uint lvl, bool above) { return above ? 1.0 : 1.0 - float(lvl) / 9.0 + uFluidTop0; }
  uint hashU(ivec3 c, uint s) {
    uint h = uint(c.x) * 73856093u ^ uint(c.y) * 19349663u ^ uint(c.z) * 83492791u ^ s * 2654435761u;
    h ^= h >> 13; h *= 0x5bd1e995u; h ^= h >> 15; return h;
  }
  // 体积云：云纹理每个 texel = 12×12 格，挤出成厚度 uCloud.w 的盒子；在云层 slab 内做 2D 网格 DDA
  // 沿射线累积云内路径长度 → Beer-Lambert 不透明度（边角薄、横穿厚）；入射面按朝向/太阳着色，越厚核心越暗
  float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }   // 交错梯度噪声（步进抖动）
`;
// voxAt / brickAt / colAt / infoOf / cellLO / smoothLight / faceUV / lodAt / solidAt
export const data = () => glsl`

  // 局部坐标（相对玩家所在区块原点）→ 环形纹素；被除数先加正偏移，避免负数取模（GLSL 未定义）
  // r = id，g = sky<<4|blk，b = meta，a = dist(低 5 位) | OPAQUE<<5 | LEAF<<6 | FLUID<<7
  uvec4 voxAt(ivec3 c) {
    int o = uSX * 4; CNT(1);
    return texelFetch(uVox, ivec3((c.x + uOrgSlot.x * 16 + o) % uSX, c.y, (c.z + uOrgSlot.y * 16 + o) % uSX), 0);
  }
  uint brickAt(ivec3 b) {
    int S4 = uSX / 4, o = uSX * 4; CNT(1);
    return texelFetch(uBrick, ivec3((b.x + uOrgSlot.x * 4 + o) % S4, b.y, (b.z + uOrgSlot.y * 4 + o) % S4), 0).r;
  }
  // 区块列：x = 列高 maxY+1，y = 全空段掩码，z = 全不透明段掩码；槽位归属（区块坐标低 8 位）不符 → 视为空
  uvec3 colAt(ivec2 ch) {
    CNT(1);
    uvec4 c = texelFetch(uCol, (ch + uOrgSlot + uN * 64) % uN, 0);
    ivec2 lo = (ch + uOrgLow + 4096) % 256;
    return (c.r == 0u || c.g != uint(lo.x | (lo.y << 8))) ? uvec3(0u) : c.rba;
  }
  // 方块状态 k0（hm = id | (meta&15)<<8，trace 的 hid 也按此打包）
  #if META
  uint vhm(uvec4 v) { return v.r | ((v.b & 15u) << 8u); }
  #define VMETA(v) ((v).b & 15u)
  #else
  uint vhm(uvec4 v) { return v.r; }                     // 无 meta 宿主（A）：不读 B 通道（Intel 采样按通道掩码返回，少读一个通道实测 −0.4 ms）
  #define VMETA(v) 0u
  #endif
  uvec4 infoOf(uint hm) { CNT(1); return texelFetch(uInfo, ivec2(int(hm & 255u), int((hm >> 8u) & 15u) * 4), 0); }
  // 邻域查询（越界：y<0 视为不透明，y>=H 视为满天空光的空气）
  void cellLO(ivec3 c, out float o, out float s, out float b) {
    if (c.y < 0) { o = 1.0; s = 0.0; b = 0.0; return; }
    if (c.y >= H) { o = 0.0; s = 15.0; b = 0.0; return; }
    uvec4 v = voxAt(c);                                 // 1 fetch：不透明位在 A 通道
    o = (v.a & 32u) != 0u ? 1.0 : 0.0; s = float(v.g >> 4u); b = float(v.g & 15u);
  }
  // v1 emitCube 同款：面前方体素 fc 的 3×3 邻域 → 四角平滑光照 + AO 等级，再按面内坐标 f 双线性
  // t1/t2 = 面内两条世界轴；f = 沿 t1/t2 的格内坐标（0..1）。返回 vec3(sky, blk, ao01)
  vec3 smoothLight(ivec3 fc, ivec3 t1, ivec3 t2, vec2 f) {
    float o[9], s[9], b[9];
    for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
      int k = j * 3 + i; cellLO(fc + t1 * (i - 1) + t2 * (j - 1), o[k], s[k], b[k]);
    }
    vec3 cr[4];
    for (int q = 0; q < 4; q++) {
      int a = (q & 1) * 2, c = (q >> 1) * 2;          // 角点在 3×3 中的列/行（0 或 2）
      int k1 = 3 + a, k2 = c * 3 + 1, k3 = c * 3 + a; // 侧 1（沿 t1）、侧 2（沿 t2）、对角
      float ss = s[4], bb = b[4], n = 1.0;
      if (o[k1] < 0.5) { ss += s[k1]; bb += b[k1]; n += 1.0; }
      if (o[k2] < 0.5) { ss += s[k2]; bb += b[k2]; n += 1.0; }
      if (o[k3] < 0.5 && !(o[k1] > 0.5 && o[k2] > 0.5)) { ss += s[k3]; bb += b[k3]; n += 1.0; }
      float lvl = (o[k1] > 0.5 && o[k2] > 0.5) ? 0.0 : 3.0 - o[k1] - o[k2] - o[k3];
      cr[q] = vec3(ss / n, bb / n, lvl / 3.0);
    }
    return mix(mix(cr[0], cr[1], f.x), mix(cr[2], cr[3], f.x), f.y);
  }
  ivec3 cellAt(vec3 ro, vec3 r, float t, float sz) { return ivec3(floor((ro + r * t) / sz)); }

  // 方块面贴图坐标（与 FACES/UVS 的朝向一致）；f = 格内坐标
  vec2 faceUV(ivec3 n, vec3 f, uvec4 inf, out float layer, out float shade) {
    if (n.x > 0) { layer = float(inf.a); shade = 0.6; return vec2(1.0 - f.z, f.y); }
    if (n.x < 0) { layer = float(inf.a); shade = 0.6; return vec2(f.z, f.y); }
    if (n.y > 0) { layer = float(inf.g); shade = 1.0; return vec2(f.x, 1.0 - f.z); }
    if (n.y < 0) { layer = float(inf.b); shade = 0.5; return vec2(f.x, f.z); }
    if (n.z > 0) { layer = float(inf.a); shade = 0.8; return vec2(f.x, f.y); }
    layer = float(inf.a); shade = 0.8; return vec2(1.0 - f.x, f.y);
  }
  float lodAt(float t) { return log2(max(t * uTexelAngle * 16.0, 1e-3)); }
  bool solidAt(ivec3 c) { return c.y >= 0 && c.y < H && (infoOf(vhm(voxAt(c))).r & 32u) != 0u; }

`;
