// rgl/shaders/fancy.js —— goodGL fancyFS + chunkVS（R5：uniform 声明删掉，用处内联；GLSL 逻辑一字不改，只有 u_xxx → xxx。由 tools/pass-conv.mjs 生成后人工检查）
import { glsl, Fps, Fpv } from '../pass.js';
import { NOISE, SHORE, CAUSTIC, POOL } from '../../water/glsl.js';
const lib = x => glsl([x]);
export const fancy = (Pass, X = {}) => Pass({ tag: 'fancy', vs: glsl`#version 300 es
precision highp float;
layout(location=0) in vec3 a_pos;
layout(location=1) in vec4 a_uvl;
layout(location=2) in vec4 a_light;
layout(location=3) in vec4 a_tint;
out vec3 v_uv; out vec4 v_tint; out vec3 v_light; out vec3 v_rel; out vec3 v_normal; out vec3 v_world;
flat out int v_flags;
const vec3 NRM[7] = vec3[7](vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1),vec3(0,1,0));
void main(){
  int flags = int(a_uvl.w + 0.5);
  vec3 p = a_pos;
  vec3 wp = p + ${X.origin};
  float wave = floor(a_tint.a*255.0+0.5);
  if (wave > 0.5 && ${X.wind} > 0.0) {
    float t = ${Fps.time};
    vec3 off = vec3(sin(t*1.6 + wp.x*0.55 + wp.z*0.3 + wp.y*0.4), 0.0, cos(t*1.25 + wp.z*0.6 + wp.x*0.25));
    off += 0.45*vec3(sin(t*3.3 + wp.x*1.7 + wp.y), 0.0, sin(t*2.9 + wp.z*1.9));
    float amp = wave < 1.5 ? 0.03 : 0.085;
    if (wave < 1.5) off.y = sin(t*2.1 + wp.x + wp.z) * 0.5;
    p += off * amp * ${X.wind};
  }
  vec3 rel = p + ${X.offset};
  v_rel = rel; v_world = p + ${X.origin};
  gl_Position = ${X.viewProj} * vec4(rel, 1.0);
  v_uv = vec3(a_uvl.xy / 256.0, a_uvl.z);
  v_tint = a_tint; v_light = a_light.xyz;
  v_normal = NRM[int(a_light.w * 255.0 + 0.5)];
  v_flags = flags;
}` })`#version 300 es

precision highp float;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp usampler2D;
#define SHADOW_ON ${X.shadowM}
#define PBR_ON ${X.pbrM}
#define POM_ON ${X.pomM}
#define CLOUDSH_ON ${X.cloudShM}
#define UNDER_ON ${X.underM}
#define WCAUS ${() => Fpv.waterCaustic | 0}   // 池底焦散：0 LiqPG（原有动态花纹）/ 1 Bliss（噪声脊线）/ 2 无 / 3 Pool




// remix: R3b 锐阴影图

float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float vnoise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float a = mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z); }
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
// 法线 / 高度图的手写双线性（图集对它们是 NEAREST：一个 texel 内高度 / 法线 / AO 恒定 → 近看一格一个平面）。
// 只在近处用（lod 0；贴图边界按 REPEAT 环绕，分辨率取自纹理本身，换高清包也对）。
vec4 nrmLin(vec3 uv){
  ivec2 sz = textureSize(${X.nrm}, 0).xy; vec2 t = uv.xy * vec2(sz) - 0.5; ivec2 i0 = ivec2(floor(t)); vec2 f = fract(t); int l = int(uv.z + 0.5);
  ivec2 m = sz - 1;
  vec4 a = texelFetch(${X.nrm}, ivec3(i0 & m, l), 0), b = texelFetch(${X.nrm}, ivec3((i0 + ivec2(1, 0)) & m, l), 0);
  vec4 c = texelFetch(${X.nrm}, ivec3((i0 + ivec2(0, 1)) & m, l), 0), d = texelFetch(${X.nrm}, ivec3((i0 + ivec2(1, 1)) & m, l), 0);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}


const float CB = 185.0, CT = 262.0;
float cloudMap(vec2 xz){
  vec2 p = xz * (1.0 / 520.0) + vec2(${Fps.cloudTime} * 0.0045, ${Fps.cloudTime} * 0.0016);
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.07 + vec2(3.1, 1.7); a *= 0.5; }
  return s / 0.9375;
}
float cloudCover(float n){ return clamp((n - (1.0 - ${Fps.cov})) * 2.6, 0.0, 1.0); }

float shadowAt(vec3 wp){
  vec4 sp = ${Fps.shadowMat} * vec4(wp, 1.0);
  float df = length(sp.xy) * 0.9 + 0.1;
  sp.xy /= df;
  vec3 c = sp.xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float a = ign(gl_FragCoord.xy) * 6.2831; mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  float uvPerBlock = 1.0 / (2.0 * ${X.shadowRange}) / df;
  // blocker search
  float sr = 0.45 * uvPerBlock; float zb = 0.0, nb = 0.0;
  for (int i = 0; i < 5; i++) { float fi = float(i); vec2 o2 = R * vec2(cos(fi * 2.4), sin(fi * 2.4)) * sqrt((fi + 0.5) / 5.0) * sr;
    float z = texture(${X.shadowRaw}, c.xy + o2).r; if (z < c.z - 0.00002) { zb += z; nb += 1.0; } }
  if (nb < 0.5) return 1.0;
  zb /= nb;
  float pen = clamp((c.z - zb) * 640.0 * 0.018, 0.02, 0.55) * uvPerBlock;
  pen = max(pen, 0.8 / ${X.shadowRes});
  float s = 0.0;
  for (int i = 0; i < 8; i++) { float fi = float(i); vec2 o2 = R * vec2(cos(fi * 2.4), sin(fi * 2.4)) * sqrt((fi + 0.5) / 8.0) * pen;
    s += texture(${X.shadow}, vec3(c.xy + o2, c.z)); }
  return s / 8.0;
}
float sharpAt(vec3 wp){   // remix: R3b：锐图只有花草；影子边缘是像素画 alpha 剪影 + 阴影图 texel，直接单 tap 会是方块锯齿。
  // 这里在 ~${Fps.sharpSoft} 个 texel 的圆盘里取 8 次比较（每次硬件 2x2 PCF），IGN 逐像素旋转，TAA 把噪声积分掉；不做遮挡物搜索，所以细草叶不漏
  vec3 c = (${Fps.sharpMat} * vec4(wp, 1.0)).xyz * 0.5 + 0.5;
  if (c.x <= 0.0 || c.x >= 1.0 || c.y <= 0.0 || c.y >= 1.0 || c.z >= 1.0) return 1.0;
  float a = ign(gl_FragCoord.xy + 17.0) * 6.2831; mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  float r = ${Fps.sharpSoft} / ${X.sharpRes}, s = 0.0;
  for (int i = 0; i < 8; i++) { float fi = float(i); vec2 o2 = R * vec2(cos(fi * 2.4), sin(fi * 2.4)) * sqrt((fi + 0.5) / 8.0) * r; s += texture(${X.sharp}, vec3(c.xy + o2, c.z)); }
  return s / 8.0;
}
float cloudShadow(vec3 wp){
  if (CLOUDSH_ON == 0 || ${X.lightDir}.y < 0.02) return 1.0;
  vec2 q = wp.xz + ${X.lightDir}.xz * ((CB + 25.0 - wp.y) / max(${X.lightDir}.y, 0.08));
  return 1.0 - 0.78 * cloudCover(cloudMap(q));
}
float chH(vec2 p){ return fract(sin(dot(p, vec2(32.52554, 45.5634))) * 12432.2355); }
float chN(vec2 p){ vec2 i = floor(p), f = fract(p); f *= f * (3.0 - 2.0 * f);
  return mix(mix(chH(i), chH(i + vec2(1, 0)), f.x), mix(chH(i + vec2(0, 1)), chH(i + vec2(1, 1)), f.x), f.y); }
// 水底焦散（LiqPG 版）：David Hoskins 的 caustics（shadertoy MdKXDm，CC BY-NC-SA 3.0）——3 层旋转缩放的 (x, z, t) 晶格，取到格心距离的最小值 → 细亮网状脊线
float caustic(vec2 p, float t){
  vec3 k = vec3(p * 0.8, t * 0.5);
  mat3 m = mat3(-2.0, -1.0, 2.0, 3.0, -2.0, 1.0, 1.0, 2.0, 2.0);
  float n = chN(p * 0.8);
  k = k * m * 0.5; float l = length(0.5 - fract(k + n));
  k = k * m * 0.4; l = min(l, length(0.5 - fract(k + n)));
  k = k * m * 0.3; l = min(l, length(0.5 - fract(k + n)));
  return pow(l, 7.0) * 25.0;
}
// 火光闪烁（火把 / 岩浆 / 火焰共用）。旧版相位随世界位置连续变化 → 亮度沿地面一圈圈传播，像水波纹（焦散）。
// 现在：相位只随位置做极缓慢的变化（梯度 < 0.1 rad/格，不成波纹），信号是不规则的火光 —— 快抖（~9 Hz）叠慢摇（~1.6 Hz）+ 偶发的「呛一口」，各路用不同种子的值噪声，没有固定周期。均值 ≈ 1
float fireFlicker(vec3 wp){
  float t = ${Fps.time} * ${Fps.flickSpeed};
  float ph = vnoise(wp.xz * 0.012 + wp.y * 0.02) * 6.0;
  float fast = vnoise(vec2(t * 9.0 + ph, 11.3)) * 2.0 - 1.0;
  float mid  = vnoise(vec2(t * 3.7 + ph * 1.3, 4.1)) * 2.0 - 1.0;
  float slow = vnoise(vec2(t * 1.6 + ph * 0.7, 23.7)) * 2.0 - 1.0;
  float gust = pow(max(0.0, vnoise(vec2(t * 0.8 + ph, 41.0)) * 2.0 - 1.0), 2.5);
  return 1.0 + ${Fps.flickAmp} * (0.09 * fast + 0.07 * mid + 0.09 * slow - 0.28 * gust);
}
float lb(float l){ float f = 1.0 - l; return (1.0 - f) / (f * 3.0 + 1.0); }
${lib(NOISE + SHORE + CAUSTIC + POOL)}
in vec3 v_uv; in vec4 v_tint; in vec3 v_light; in vec3 v_rel; in vec3 v_normal; in vec3 v_world;
flat in int v_flags;

layout(location=0) out vec4 o; layout(location=1) out vec4 o2;
vec2 octEnc(vec3 n){ n /= abs(n.x) + abs(n.y) + abs(n.z); vec2 e = n.xy; if (n.z < 0.0) e = (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0); return e * 0.5 + 0.5; }
vec2 skyUV(vec3 d){ float el = asin(clamp(d.y, -1.0, 1.0)); float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / 1.5707963); return vec2(atan(d.z, d.x) / 6.2831853 + 0.5, v); }
vec3 skyEnv(vec3 d){
  vec3 c = texture(${X.skyLut}, skyUV(normalize(vec3(d.x, max(d.y, 0.0), d.z)))).rgb;
  float l = dot(c, vec3(0.3, 0.55, 0.15));
  c = mix(c, vec3(l) * vec3(0.92, 0.96, 1.0), ${X.rain} * 0.75) * (1.0 - ${X.rain} * 0.35);
  return c + vec3(0.55, 0.6, 0.8) * ${X.flash} * 0.6;
}
// expanding raindrop rings for puddles (analytic normal perturbation)
vec2 ripples(vec2 p, float t){
  vec2 g = floor(p); vec2 acc = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 c0 = g + vec2(x, y); float h = hash12(c0);
    float ph = fract(t * 0.9 + h);
    vec2 c = c0 + vec2(hash12(c0 + 3.1), hash12(c0 + 7.7));
    vec2 dv = p - c; float r = length(dv); float R = ph * 0.9;
    float ring = sin((r - R) * 38.0) * smoothstep(0.12, 0.0, abs(r - R)) * (1.0 - ph) * (1.0 - ph);
    acc += dv / max(r, 1e-3) * ring;
  }
  return acc;
}
vec3 envBRDF(vec3 F0, float r, float NoV){
  const vec4 c0 = vec4(-1.0, -0.0275, -0.572, 0.022); const vec4 c1 = vec4(1.0, 0.0425, 1.04, -0.04);
  vec4 rr = r * c0 + c1; float a004 = min(rr.x * rr.x, exp2(-9.28 * NoV)) * rr.x + rr.y;
  vec2 AB = vec2(-1.04, 1.04) * a004 + rr.zw; return F0 * AB.x + AB.y;
}
void main(){
  o2 = vec4(0.0);
  if (${X.apFade} < 0.999 && ign(gl_FragCoord.xy) > ${X.apFade}) discard;   // 新网格段抖动淡入（屏幕空间 IGN，TAA 会把它抹匀）
  vec3 uv = v_uv;
  int mat = v_flags & 3; int tm = (v_flags >> 2) & 3;
  if ((v_flags & 256) != 0) { float lt = ${Fps.time} * ${Fps.lavaSpeed}; uv.xy += vec2(sin(lt*0.3 + v_world.z*0.1)*0.03, lt*0.02); }   // 岩浆贴图滚动（lavaSpeed：默认 2 倍速）
  // derivatives & tangent frame (computed before any divergent branch)
  vec2 gdx = dFdx(uv.xy), gdy = dFdy(uv.xy);
  if ((v_flags & 24576) != 0) uv.xy = clamp(uv.xy, vec2(0.002), vec2(0.998));   // remix: 植物贴图 v = 1.0 恰在边上，REPEAT 会绕回顶行（花瓣出现在底边）
  vec3 dp1 = dFdx(v_rel), dp2 = dFdy(v_rel);
  vec3 N0 = v_normal;
  vec3 dp2p = cross(dp2, N0), dp1p = cross(N0, dp1);
  vec3 Tg = dp2p * gdx.x + dp1p * gdy.x, Bg = dp2p * gdx.y + dp1p * gdy.y;
  float tl = max(dot(Tg, Tg), 1e-12), bl = max(dot(Bg, Bg), 1e-12);
  Tg *= inversesqrt(tl); Bg *= inversesqrt(bl);
  bool foliage = (v_flags & 128) != 0;
  if ((v_flags & 4096) != 0) { // weather particles
    vec4 c = texture(${X.atlas}, uv);
    vec3 albedo = pow(c.rgb * ${X.colorMul}.rgb, vec3(2.2));
    float blk = v_light.y;
    vec3 lc = ${Fps.ambCol} * 0.9 + ${X.lightCol} * 0.08 + ${Fps.torchCol} * lb(blk) * 0.3;
    o = vec4(lc * mix(vec3(0.8, 0.85, 0.95), albedo, 0.5), c.a * 0.2); return;
  }
  vec3 V = normalize(-v_rel);
  float d = length(v_rel);
  float pbr = float(PBR_ON);
  vec4 sp = textureGrad(${X.spec}, uv, gdx, gdy);
  // ---------------- parallax occlusion mapping
  float rainW = clamp(${X.wet} * ${X.rainPom}, 0.0, 1.0);   // 雨天的立体浮雕：wet × rainPom
  // 平滑 POM（双线性高度 + 自适应步数 + 二分）：pomSmooth 或下雨时启用，深度不变（雨天 ×1.5）；否则走下面原来的 14 步（逐 texel 平顶，关 TAA 时近看有横向纸片条纹）
  bool pomS = ${X.pomSmooth} > 0.5 || rainW > 0.01;
  float pomD = max(sp.a * 0.25, foliage ? 0.05 * ${Fps.leafPom} * ${Fps.leafPbr} : 0.0) * float(POM_ON) * pbr * (1.0 - smoothstep(10.0, 18.0, d)) * mix(1.0, 1.5, rainW);
  vec3 Vt = vec3(dot(V, Tg), dot(V, Bg), dot(V, N0));
  float hgt = 1.0; float pomSh = 1.0;
  // 掠射角限幅：原来 Vt.xy / max(Vt.z, 0.25) 最多放大到 4×pomD（cobblestone 0.12 → ~8 texel），14 步走不密 → 顶面横条 / 侧面竖条的阶梯拉丝。
  // 改成 offset limiting（分母 + 0.35，最多 ~1.8×），总位移再钳到 1.5×pomD 且不超过 3 texel；Vt.z 很小时整体淡出
  // 雨天（rainW > 0.01，走平滑搜索）保持原来的位移 / 深度：雨天浮雕要的就是这个立体感，下面的限幅与淡出只用于晴天
  bool pomRain = rainW > 0.01;
  if (!pomRain) pomD *= smoothstep(0.06, 0.25, Vt.z);
  // 屏幕足迹淡出：一个 texel 不到 ~2 像素时，几个 texel 的逐像素位移会混叠，TAA 抖动下逐帧变 → 远处闪烁。按 texel/像素（取较长轴，掠射角也跟着淡）淡出
  float pomTx = float(textureSize(${X.nrm}, 0).x);
  if (!pomRain) pomD *= 1.0 - smoothstep(0.3, 0.6, sqrt(max(dot(gdx, gdx), dot(gdy, gdy))) * pomTx);
  vec2 pomShift = -Vt.xy / (pomRain ? max(Vt.z, 0.25) : Vt.z + 0.35) * pomD;
  float pomMax = min(pomD * 1.5, 3.0 / pomTx), pomLen = length(pomShift);
  if (!pomRain && pomLen > pomMax) pomShift *= pomMax / pomLen;
  if (pomD > 0.002 && Vt.z > 0.04 && mat == 0) {
    if (pomS) {
      int NS = int(mix(10.0, 28.0, 1.0 - clamp(Vt.z, 0.0, 1.0)));
      float stepL = 1.0 / float(NS);
      vec2 delta = pomShift * stepL;
      vec2 cur = uv.xy; float layer = 0.0;
      float hd = 1.0 - nrmLin(vec3(cur, uv.z)).a;
      vec2 prev = cur;
      for (int i = 0; i < 28; i++) {
        if (i >= NS || layer >= hd) break;
        prev = cur; cur += delta; layer += stepL;
        hd = 1.0 - nrmLin(vec3(cur, uv.z)).a;
      }
      vec2 pa = prev, pb = cur; float la = max(layer - stepL, 0.0), lb = layer;
      for (int j = 0; j < 5; j++) {
        vec2 pm = (pa + pb) * 0.5; float lm = (la + lb) * 0.5;
        if (lm >= 1.0 - nrmLin(vec3(pm, uv.z)).a) { pb = pm; lb = lm; } else { pa = pm; la = lm; }
      }
      uv.xy = (pa + pb) * 0.5; hgt = 1.0 - (la + lb) * 0.5;
    } else {
      const int NS = 14;
      float stepL = 1.0 / float(NS);
      vec2 delta = pomShift * stepL;
      vec2 cur = uv.xy; float layer = 0.0;
      float hd = 1.0 - textureGrad(${X.nrm}, vec3(cur, uv.z), gdx, gdy).a;
      vec2 prev = cur;
      for (int i = 0; i < NS; i++) {
        if (layer >= hd) break;
        prev = cur;
        cur += delta; layer += stepL;
        hd = 1.0 - textureGrad(${X.nrm}, vec3(cur, uv.z), gdx, gdy).a;
      }
      // NEAREST 高度是逐 texel 台阶（不连续），线性插值会落在台阶中间、取到与命中不符的 texel → 近处细毛刺。改二分逼近台阶边界，取在表面下的一侧 pb（保证落在命中的那个 texel 里）
      vec2 pa = prev, pb = cur; float la = max(layer - stepL, 0.0), lb = layer;
      for (int j = 0; j < 5; j++) {
        vec2 pm = (pa + pb) * 0.5; float lm = (la + lb) * 0.5;
        if (lm >= 1.0 - textureGrad(${X.nrm}, vec3(pm, uv.z), gdx, gdy).a) { pb = pm; lb = lm; } else { pa = pm; la = lm; }
      }
      uv.xy = pb; hgt = 1.0 - lb;
    }
    // self shadowing toward the light
    vec3 Lt = vec3(dot(${X.lightDir}, Tg), dot(${X.lightDir}, Bg), dot(${X.lightDir}, N0));
    if (Lt.z > 0.02) {
      float lh = 1.0 - hgt; vec2 ld = Lt.xy / (pomRain ? max(Lt.z, 0.2) : Lt.z + 0.35) * pomD * lh / 6.0; float occ = 0.0;   // 与视线同样限幅：长阴影射线读到远处 texel 会拉出黑条
      vec2 q = uv.xy;
      for (int i = 1; i <= 6; i++) {
        q += ld; float hh = 1.0 - (pomS ? nrmLin(vec3(q, uv.z)).a : textureGrad(${X.nrm}, vec3(q, uv.z), gdx, gdy).a);   // 与表面同一套高度：平滑搜索 + NEAREST 比较会把表面自己遮成黑斑
        float lay = lh - float(i) * (1.0 / 6.0) * lh - (pomS ? 0.06 : 0.02);
        occ = max(occ, clamp((lay - hh) * 10.0, 0.0, 1.0));
      }
      pomSh = 1.0 - occ * ${X.pomShadow} * (pomS ? 0.4 : 1.0);   // 平滑搜索下高度连续，遮挡更连贯：同样强度会把山谷整片压黑（雨天环境光低时纯黑），取 0.4 倍
    }
    sp = textureGrad(${X.spec}, uv, gdx, gdy);
  }
  vec4 c = textureGrad(${X.atlas}, uv, gdx, gdy);
  if (mat == 1 && c.a < 0.5) discard;
  vec3 tint = v_tint.rgb;
  if (tm != 0 && pbr > 0.5) {
    // natural variation: lush / dry patches and per-block jitter, slightly less saturated than the raw biome tint
    vec2 wq = floor(v_world.xz + N0.xz * 0.01);
    float pv = vnoise(v_world.xz * 0.045) * 0.65 + vnoise(v_world.xz * 0.17) * 0.35;
    float jit = hash12(wq) - 0.5;
    vec3 dry = tint * vec3(1.12, 1.02, 0.72), lush = tint * vec3(0.82, 0.95, 0.86);
    tint = mix(lush, dry, smoothstep(0.3, 0.75, pv)) * (1.0 + jit * 0.07);
    float tl2 = dot(tint, vec3(0.3, 0.59, 0.11)); tint = mix(vec3(tl2), tint, 0.86);
  }
  if (tm == 1) c.rgb *= tint; else if (tm == 2) c.rgb = mix(c.rgb * tint, c.rgb, step(0.5, c.a));
  c.rgb *= ${X.colorMul}.rgb;
  vec3 albedo = pow(c.rgb, vec3(2.2));
  vec4 nm = textureGrad(${X.nrm}, uv, gdx, gdy);
  if (pomD <= 0.002) hgt = nm.a;
  // ---------------- material decode
  vec2 nxy = (nm.xy * 2.0 - 1.0) * pbr * (foliage ? ${Fps.leafNormal} : 1.0);
  vec3 nts = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
  vec3 N = normalize(Tg * nts.x + Bg * nts.y + N0 * nts.z);
  N = normalize(mix(N, N0, smoothstep(32.0, 80.0, d)));
  if (dot(N, V) < 0.0 && !foliage) N = normalize(N - V * dot(N, V) * 1.01);
  if (foliage && ${Fps.leafPbr} > 0.0 && dot(N, V) < 0.0) N = -N;   // pg: 叶片双面，逐纹素法线翻到朝向视线的一面，漫反射 / 高光 / 透射都按可见面算
  float smooth_ = mix(0.2, sp.r, pbr);
  float f0b = sp.g * 255.0; bool metal = f0b > 229.5 && pbr > 0.5;
  float sb = sp.b * 255.0; float por = sb < 64.5 ? sb / 64.0 : 0.0; float sss = sb > 64.5 ? (sb - 65.0) / 190.0 : 0.0;
  float cav = mix(1.0, nm.b, pbr * (foliage ? 0.35 : 1.0));   // pg: 树冠采用基于物理的方向光照：叶片具有逐纹素法线和高粗糙度镜面项，高光随太阳方向实时变化；同时对树叶开启次表面散射/透射，逆光时叶片边缘呈现暖色透光；配合 POM 视差让叶块产生厚度与层次感，并以 Fresnel 轮廓光强化树冠边缘。
  float sky = v_light.x, blk = v_light.y, ao = v_light.z;
  { // 光照量化抖动：4 bit 光照插值后仍有 1/15 级台阶（暗区马赫带明显）；±半级 IGN，满格（户外天空光）处淡出，避免晴天地表出噪点
    float dn = (ign(gl_FragCoord.xy + 31.0) - 0.5) * (1.0 / 15.0) * ${Fps.lightDither};
    sky = clamp(sky + dn * (1.0 - smoothstep(0.85, 1.0, sky)), 0.0, 1.0);
    blk = clamp(blk + dn * (1.0 - smoothstep(0.85, 1.0, blk)), 0.0, 1.0);
  }
  // ---------------- rain wetness (porous materials darken, puddles gather in low spots)
  float wet = ${X.wet} * smoothstep(0.8, 1.0, sky) * (N0.y > 0.5 ? 1.0 : 0.35) * (foliage ? 0.4 : 1.0);
  float puddle = 0.0;
  if (wet > 0.0 && N0.y > 0.5 && !foliage) puddle = smoothstep(0.52, 0.72, vnoise(v_world.xz * 0.22) + (0.55 - hgt) * (pomS ? 0.12 : 0.35) - (tm != 0 ? 0.08 : 0.0)) * wet;
  albedo *= mix(1.0, 1.0 - 0.5 * (0.35 + por * 0.65), max(wet, puddle));
  smooth_ = mix(smooth_, 0.88, wet * (1.0 - por * 0.75) * (1.0 - sss * 0.9) * (foliage ? 0.3 : 1.0));
  if (puddle > 0.0) { float t = ${Fps.time} * 2.0; vec2 rp = v_world.xz * 3.0;
    vec2 rr = ripples(v_world.xz * 2.2, ${Fps.time}) * 0.35 * ${X.rain};
    vec3 Np = normalize(vec3((vnoise(rp + t) - 0.5) * 0.08 + rr.x, 1.0, (vnoise(rp.yx - t) - 0.5) * 0.08 + rr.y));
    N = normalize(mix(N, Np, puddle)); smooth_ = mix(smooth_, 0.98, puddle); cav = mix(cav, 1.0, puddle); }
  float rough = max(pow(1.0 - smooth_, 2.0), 0.02);
  if (foliage) rough = mix(rough, max(rough, ${Fps.leafRough}), ${Fps.leafPbr});   // pg: 叶面高粗糙度：宽而柔的太阳高光，不出镜面亮点
  vec3 F0 = metal ? albedo : vec3(f0b > 229.5 ? 0.04 : sp.g);
  if (pbr < 0.5) F0 = vec3(0.02);
  vec3 diffAlb = metal ? vec3(0.0) : albedo;
  // ---------------- direct light
  float NdotL0 = dot(N0, ${X.lightDir});
  float NdotL = dot(N, ${X.lightDir});
  float diffG = foliage ? 0.55 + 0.45 * abs(NdotL0) : max(NdotL0, 0.0);
  float diff = foliage ? mix(0.55 + 0.45 * abs(NdotL), 0.3 + 0.7 * clamp((NdotL + 0.35) / 1.35, 0.0, 1.0), ${Fps.leafPbr}) : max(NdotL, 0.0) * clamp(NdotL0 * 8.0, 0.0, 1.0);
  diff = mix(diff, clamp((NdotL + 0.5) / 1.5, 0.0, 1.0) * clamp(NdotL0 * 8.0 + 1.0, 0.0, 1.0), sss * 0.5 * float(!foliage));
  float sh = 0.0;
  float gate = smoothstep(0.35, 0.8, sky);
  if (diffG > 0.0 && ${X.lightDir}.y > -0.05) {
    float slope = foliage ? 0.5 : clamp(1.0 - NdotL0, 0.0, 1.0);
    vec3 wp = v_rel + ${Fps.camToShadow} + N0 * (foliage ? 0.02 : 0.03 + 0.06 * slope);
    if (SHADOW_ON > 0 && d < ${Fps.shadowDist}) { sh = shadowAt(wp); sh = mix(sh, gate, smoothstep(${Fps.shadowDist} * 0.8, ${Fps.shadowDist}, d)); }
    else sh = gate;
    if (SHADOW_ON > 0 && (v_flags & 8192) == 0 && d < ${Fps.sharpDist})   // remix: R3b；8192 = 草（不接收锐阴影），花自遮挡
      sh = min(sh, mix(sharpAt(wp + ${X.lightDir} * ((v_flags & 16384) != 0 ? 0.012 : 0.04)), 1.0, smoothstep(${Fps.sharpDist} * 0.85, ${Fps.sharpDist}, d)));
    sh *= smoothstep(0.1, 0.5, sky);
    sh *= cloudShadow(v_world);
  }
  float fh = 1.0;   // remix: 花的体积感（折纸感）：花头在贴图的约 40%–85% 高度（不是整张图的顶 30%），这一段总带一层阴影，直射光和环境光一起压暗
  if ((v_flags & 16384) != 0) fh = 1.0 - 0.8 * smoothstep(0.35, 0.6, 1.0 - v_uv.y);
  float shL = sh * pomSh * fh;
  bool under = (v_flags & 1024) != 0;
  float NoV = max(dot(N, V), 1e-3);
  vec3 H = normalize(${X.lightDir} + V);
  float NoH = max(dot(N, H), 0.0), VoH = max(dot(V, H), 0.0), NoL = max(NdotL, 0.0);
  float a2 = rough * rough;
  float dd = NoH * NoH * (a2 - 1.0) + 1.0; float D = a2 / (3.14159 * dd * dd);
  float k = rough * 0.5; float G = (NoL / (NoL * (1.0 - k) + k)) * (NoV / (NoV * (1.0 - k) + k));
  vec3 Fs = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
  vec3 specD = min(vec3(D * G / (4.0 * NoV)) * Fs, vec3(60.0)) * (foliage ? 1.0 : clamp(NdotL0 * 8.0, 0.0, 1.0));
  vec3 lightI = ${X.lightCol} * shL;
  vec3 direct = lightI * diff * (1.0 - Fs * 0.5);
  if (under) {
#if WCAUS == 0
    float ca = caustic(v_world.xz + v_world.y * 0.3, ${Fps.time}); direct *= vec3(0.35, 0.6, 0.75) * (0.25 + ca * 1.6);
#elif WCAUS == 1
    float ca = causAt(${X.wnoise}, v_world.xz + v_world.y * 0.3, ${Fps.time}); direct *= vec3(0.35, 0.6, 0.75) * (0.3 + ca * 1.8);
#elif WCAUS == 3
    float ca = causPool(v_world.xz + v_world.y * 0.3, ${Fps.time}); direct *= vec3(0.35, 0.6, 0.75) * (0.3 + ca * 1.5);
#else
    direct *= vec3(0.35, 0.6, 0.75) * 0.6;                                  // 无焦散：只有水色
#endif
    specD *= 0.2; }
  // ---------------- ambient: sky irradiance, ground bounce, torch
  float up = N.y * 0.5 + 0.5;
  float occl = (0.22 + 0.78 * ao) * cav * fh;   // remix: 花的体积感，fh = 1 时与原版一致
  vec3 amb = ${Fps.ambCol} * (0.45 + 0.55 * up) * sky * sky * occl;
  vec3 bounce = ${X.lightCol} * max(${X.lightDir}.y, 0.0) * vec3(0.5, 0.55, 0.42) * 0.045 * (1.0 - up) * sky * occl;
  if (under) amb *= vec3(0.5, 0.75, 0.9);
  float b = lb(blk);
  vec3 torch = ${Fps.torchCol} * b * b * 2.4 * fireFlicker(v_world) * (0.45 + 0.55 * ao) * mix(1.0, cav, 0.6);
  vec3 minL = vec3(0.004, 0.005, 0.007) * (0.4 + 0.6 * ao);
  vec3 col = diffAlb * (direct + amb + bounce + torch + minL);
  // subsurface transmission (leaves, grass, snow, skin)
  float sssAmt = foliage ? max(sss, 0.6) : sss;
  if (sssAmt > 0.0 && diffG > 0.0) {
    float fw = pow(max(dot(-V, ${X.lightDir}), 0.0), 6.0);
    col += albedo * sqrt(max(albedo, 0.0)) * ${X.lightCol} * sh * fh * sssAmt * (0.1 + 0.65 * fw);
  }
  if (foliage && diffG > 0.0) {   // pg: 俯视受光——从上往下看树冠，叶层被太阳穿透、整面发亮发黄绿，叶团之间的暗处被天光填软（goodPG study-gl §3：叶子好看不在贴图）
    float topF = smoothstep(0.3, 1.0, N0.y) * (0.5 + 0.5 * smoothstep(0.0, 0.8, V.y));
    col += albedo * sqrt(max(albedo, 0.0)) * vec3(1.0, 1.0, 0.62) * ${X.lightCol} * sh * fh * max(${X.lightDir}.y, 0.0) * topF * 0.4 * ${Fps.leafGlow};
    col += albedo * ${Fps.ambCol} * sky * sky * topF * 0.3 * ${Fps.leafGlow};
  }
  if (foliage && ${Fps.leafPbr} > 0.0) {   // pg: 树冠 PBR——逆光透射（暖色，叶缘 / 低处更薄更透）+ Fresnel 轮廓光
    float lp = ${Fps.leafPbr};
    float back = smoothstep(0.15, -0.6, NdotL) * (0.35 + 0.65 * pow(max(dot(-V, ${X.lightDir}), 0.0), 3.0));
    float thin = 0.45 + 0.55 * (1.0 - hgt);
    col += albedo * vec3(1.0, 0.8, 0.32) * ${X.lightCol} * sh * fh * pomSh * back * thin * 0.9 * lp * ${Fps.leafTrans};
    float rim = pow(1.0 - NoV, 3.0) * cav;
    col += (${Fps.ambCol} * sky * sky * 0.3 + ${X.lightCol} * sh * fh * 0.22 * clamp(NdotL * 0.5 + 0.5, 0.0, 1.0)) * mix(vec3(1.0), albedo * 2.2, 0.5) * rim * lp * ${Fps.leafRim};
  }
  // specular: sun/moon + sky reflection (split-sum approximation)
  // 雨天顶面黑点：法线贴图斜率可到 ~50°（pbr.js ns × 1.8），湿面 smooth ≈ 0.88 时坑壁像素的反射方向钻到几何面以下 → 落进 horizon 的暗色兜底（ambCol × 0.25）且掠射 Fresnel 很大；
  // SSR 那边同一条射线立刻撞上本平面，用邻近暗像素减掉天空 → 黑点。环境反射把 R 折回几何面上方，SSR 权重按原 R 低于平面的程度淡掉。
  // 只对 POM 较深的像素（stone / cobblestone 等，pomD 已含 10–18 格距离淡出）按深度生效：grass_top 这类 pom = 0 的湿地面保持原来的暗反射，否则整个雨天地面发亮
  vec3 R = reflect(-V, N);
  float rN0 = foliage ? 1.0 : dot(R, N0);   // 植物双面，N0 不代表可见面
  float rFix = smoothstep(0.005, 0.05, pomD);
  if (rN0 < 0.05) R = normalize(R + N0 * (0.05 - rN0) * rFix);
  vec3 env = skyEnv(R);
  vec3 envRough = ${Fps.ambCol} * (0.9 + 0.6 * max(R.y, 0.0));
  env = mix(env, envRough, smoothstep(0.15, 0.75, rough));
  float horizon = smoothstep(-0.25, 0.15, R.y);
  env = mix(${Fps.ambCol} * 0.25 * (0.3 + 0.7 * ao), env, horizon);
  float specOcc = smoothstep(0.35, 0.95, sky) * clamp(pow(NoV + ao * cav, 1.5) - 1.0 + ao * cav, 0.0, 1.0);
  vec3 eb = envBRDF(F0, sqrt(rough), NoV) * specOcc * mix(0.5, 1.0, pbr);
  vec3 envS = env * eb / mix(0.5, 1.0, pbr);
  float ssrW = dot(eb, vec3(0.3, 0.59, 0.11)) * (1.0 - smoothstep(0.08, 0.22, rough)) * float(!under) * mix(1.0, smoothstep(0.0, 0.12, rN0), rFix);
  o2 = vec4(octEnc(N), rough, ssrW);
  envS += ${Fps.torchCol} * b * b * 0.08 * envBRDF(F0, sqrt(rough), NoV);
  col += (lightI * specD * (foliage ? ${Fps.leafSpec} : 1.0) + envS * (foliage ? ${Fps.leafEnv} : 1.0)) * mix(0.5, 1.0, pbr);
  // 岸壁水线（v2/gl shade.js:227–248）：紧邻水面格的侧面上，水线随涌浪升降（shoreH 在 d = 0 处），线下盖半透明水色，上方留湿痕。邻格是否为「最上面一格水」读岸线场（water/surfacefield.js）
  if (!under && abs(N0.y) < 0.5 && ${Fps.foamWidth} > 0.0 && ${Fps.shoreAmp} > 0.0 && length(v_rel) < 96.0) {
    int wy = int(floor(v_world.y - 0.001));
    uvec2 fv = texelFetch(${X.shoreFld}, ivec2(floor(v_world.xz + N0.xz * 0.01)) & (${X.shoreN} - 1), 0).rg;
    if (fv.r == 1u && int(fv.g) == wy) {
      float dy = v_world.y - (float(wy) + 8.0 / 9.0), top = ${Fps.shoreAmp} * 1.6;
      if (dy > -0.02 && dy < top) {
        float hh = shoreH(${X.wnoise}, v_world.xz, 0.0, ${Fps.foamWidth}, ${Fps.shoreSpd}, ${Fps.time}) * ${Fps.shoreAmp};
        float aw = 0.02 + length(v_rel) * 0.002, band = 1.0 - smoothstep(hh - aw, hh + aw, dy);
        vec3 wl = ${Fps.ambCol} * sky * sky * 1.5 + ${X.lightCol} * max(${X.lightDir}.y, 0.0) * sh * 0.1;
        col *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, top, dy));
        vec3 wv = mix(col * vec3(0.55, 0.8, 0.85), vec3(0.12, 0.38, 0.55) * wl, 0.45);
        wv += wl * 0.35 * (1.0 - smoothstep(0.0, aw * 3.0, abs(dy - hh)));
        col = mix(col, wv, band * 0.85);
      }
    }
  }
  // 岸壁泡沫：岸与水交界处的竖直一条（厚 foamThick），中心随涌浪水线 hh 起伏、沿墙方向用噪声撕成波浪边；泡在水里的墙（under）也画。颜色 foamColor
  if (${Fps.foamThick} > 0.0 && abs(N0.y) < 0.5 && ${Fps.foamWidth} > 0.0 && ${Fps.shoreAmp} > 0.0 && length(v_rel) < 96.0) {
    int wy = int(floor(v_world.y - 0.001));
    uvec2 fv = texelFetch(${X.shoreFld}, ivec2(floor(v_world.xz + N0.xz * 0.01)) & (${X.shoreN} - 1), 0).rg;
    if (fv.r == 1u && int(fv.g) == wy) {
      float dy = v_world.y - (float(wy) + 8.0 / 9.0), th = ${Fps.foamThick};
      float hh = shoreH(${X.wnoise}, v_world.xz, 0.0, ${Fps.foamWidth}, ${Fps.shoreSpd}, ${Fps.time}) * ${Fps.shoreAmp};
      float hx = v_world.x * abs(N0.z) + v_world.z * abs(N0.x);
      float e = hh + (vnoise(vec2(hx * 3.0, ${Fps.time} * 0.8)) - 0.5) * th * 0.6;
      float fm = (1.0 - smoothstep(0.0, th, abs(dy - e) * 1.6)) * smoothstep(0.15, 0.55, vnoise(vec2(hx * 7.0 + ${Fps.time} * 0.3, dy * 9.0)) + 0.3);
      vec3 fl = ${Fps.ambCol} * sky * sky * 1.5 + ${X.lightCol} * max(${X.lightDir}.y, 0.0) * sh * 0.1 + 0.15;
      col = mix(col, ${Fps.foamColor} * fl, clamp(fm, 0.0, 1.0) * 0.9);
    }
  }
  if ((v_flags & 64) != 0) { col = albedo * ((v_flags & 256) != 0 ? 3.0 : 2.6) + albedo * (direct + amb); o2 = vec4(0.0); }
  if (mat >= 2) o2 = vec4(0.0);
  o = vec4(col, (mat >= 2) ? c.a : 1.0);
}`;
