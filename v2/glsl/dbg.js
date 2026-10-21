// dbg：热力图 / 原始计数输出、RET（glmod 步骤 2：从 DDA_FS 原样搬出；拼接顺序见 gl.js 的 DDA_FS）
import { glsl } from '../pass.js';
// heat / dbgOut / RET
export const dbg = () => glsl`  #if DBG_HEAT
  vec3 heat(float x) { x = clamp(x, 0.0, 1.0); return clamp(vec3(1.5) - abs(4.0 * x - vec3(3.0, 2.0, 1.0)), 0.0, 1.0); }
  // 覆写输出：热力色（或 DBGRAW 原始计数：RG = 16 位计数，B = 阴影迭代），深度 0 → 合成时盖住一切
  void dbgOut() {
    int v = DBG == 1 ? gIt : DBG == 6 ? gTex : gFetch;
    #if SHADOW_PASS && !CLOUD_PASS && !SH_PASS
    oDirect = vec4(0.0);                                       // 软阴影合成只透传计数
    #endif
    #if DBGRAW
    if (DBG == 5) gl_FragColor = vec4(min(ivec4(gLvC, gLvB, gLvV, gCl), 255)) / 255.0;
    else if (DBG == 4) gl_FragColor = vec4(vec3(min(ivec3(gLvD, gDf0, gDf2), 255)) / 255.0, 1.0);
    else gl_FragColor = vec4(float(v & 255) / 255.0, float(min(v >> 8, 255)) / 255.0, float(min(gSIt, 255)) / 255.0, 1.0);
    #else
    if (DBG == 5) gl_FragColor = vec4(sqrt(vec3(gLvC, gLvB, gLvV) / vec3(8.0, 32.0, 64.0)), 1.0);
    else if (DBG == 4) gl_FragColor = vec4(sqrt(vec3(gLvD, gDf0, gDf2) / 16.0), 1.0);
    else gl_FragColor = vec4(heat(DBG == 1 ? float(v) / float(uSteps) : DBG == 6 ? float(v) / 64.0 : float(v) / 256.0), 1.0);
    #endif
    gl_FragDepth = 0.0;
  }
  #define RET { dbgOut(); return; }
  #else
  #define RET return
  #endif

`;
