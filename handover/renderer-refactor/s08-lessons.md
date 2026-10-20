<!-- handover/renderer-refactor/s08-lessons.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§8 结构经验（P0–P1 沉淀）+ §8.6 对 P2+ 的直接要求**
> 状态：有效（方法论，所有阶段遵守）
> 何时读：每阶段开工前读一遍
> 对应 goal-renderapi.ts：—

## 8. 结构经验（P0–P1 落地后沉淀，后续阶段照此执行）

> 依据：`v2.js` 当前 936 行（P0 测量 + P1 适配层/段标记），`tools/bench-v2.mjs --cmp p0` 四机位 0 px。
> 下面每条都对应一处已经写出来并验证过的代码，不是设想。

### 8.1 流程：没有数字不动结构

| 步骤 | 工具 / 代码 | 经验 |
|---|---|---|
| ① 先量触发率 | CPU 全环统计（P1 对 137 区块数全空/全实段） | **结构的收益上限 = 触发率**。段标记在 VoxelCraft 地形上 0 触发，shader 分支却常驻 +0.3–0.5 ms。以后任何新层级（DF、位图）先在 `uploadChunk` 里统计「射线会走到这个分支的比例」，再决定写 shader |
| ② 编译期开关 | `post.defines: { DBG, DBGRAW, SECT }` | A/B 必须用 `#if`，不用 uniform 分支：`DBG=0` 与生产着色器**逐字节相同**，测出来的差值才可信；uniform 分支本身就是被测对象的一部分 |
| ③ 正确性 = 0 px | `--save/--cmp` 读 ddaRT 原始像素 | 加速结构只许改步数不许改画面。0 px 是最强也最便宜的正确性测试，比目测/截图对比可靠得多；每阶段都对 `p0` 比，不对上一阶段比（避免误差累积） |
| ④ 分 pass 计时 | `gpuPass(i)` 三查询一组 + `qPool` 复用 + disjoint 丢弃 | 帧内第一次写默认帧缓冲的查询会吃掉 vsync 等待 → comp 的帧内数字不可信，要单独在两帧间测。**先搞清楚计时器量的是什么，再看数字** |
| ⑤ 热力图原始编码 | `DBGRAW=1`：RG = 16 位计数、B = 阴影迭代 | 热力色给人看，原始计数给脚本算均值；两套输出共用一个 `dbgOut()`，`gl_FragDepth=0` 让合成时盖住一切 |
| ⑥ 结果写回文档 | §6.1–6.3 表格 | 每阶段固定四列：实现要点 / 结果表 / **未达成项及原因** / 对后续阶段的影响。P1 的「未达成」直接改写了 P2 的优先级 |

### 8.2 数据通路：搭便车，不开新纹理

- **新信息优先塞进已有的 fetch**：段掩码没有单开 `uSect`，而是把 `uCol` 从 R16UI 扩成 RGBA16UI（r 列高、g 归属、b 空段、a 实段），换列那一次 `colAt` 顺带拿到，**零额外 fetch**。同理 `uInfo.r` 用位域打包 `kind|opaque<<4|solid<<5|cullSelf<<6`。原则：核显上 fetch 数 > ALU 数 > 纹理字节数。
- **每个纹理的「无效」要有一个在带内的编码**：列高 `r=0` = 整列空、DF `v=0` = 未计算、`owner[s]=null`。卸载区块只写列高 0，不清 24 KB 体素——「清」是 O(体积)，「标无效」是 O(1)。
- **环形槽位 + 带内归属校验**：`uCol.g` 存区块坐标低 8 位，shader 里 `colAt` 自查 `(ch+uOrgLow)%256`，槽位被别的区块复用时自动视为空。所有新结构（DF/位图）**必须和 `uVox` 用同一套 `wrap`/槽位**，并在 `rebuildRing` 里一起重建。
- **增量维护全局量**：`worldMaxY` 只在最高列下降时 O(N²) 重算（`setColumn`）。任何「全局 max/min」都按这个模式写，不要每次编辑都扫。
- **上传暂存区复用**：`stVox/stBrick` 两个固定 16×H×16 的 `Data3DTexture` 做 staging，`copyTextureToTexture3D` 拷进环形大纹理；大纹理 `image.data=null` 只留 GPU 副本。新结构照抄（`stDist`）。

### 8.3 适配层：v2 只认接口，不认宿主

- `ctx.source || voxelCraftSource(ctx)`、`ctx.blockTable || voxelCraftBlocks(ctx)`：**默认适配器放在 v2.js 文件尾部**，宿主零改动即可运行；第二宿主（index.html）只需提供自己的两个对象。
- `getChunk` 允许返回 `sky+blk` 或打包 `light`：**接口宽松、实现只走一条路径**（`uploadChunk` 里一个三元）。不要为了接口纯净强迫宿主多做一次打包拷贝。
- 事件源放在适配器里（`built/disposed`），v2 的 `buildChunk/disposeChunk` 只是转发。中途创建渲染器时适配器接管已 `meshed` 的区块（构造函数里扫一遍 `ctx.chunks`）。
- 键用 `"cx,cz"` 字符串，**不复用宿主的 `ck`**——宿主的键格式是宿主的事。
- shader 常量用模板注入（`#define H ${H}`、`${BT.waterId}u`、`${BT.tileSide[BT.waterId]}.0`）而不是 uniform：编译期折叠；但注入点要少、集中（目前 4 处），`${CH}/${B.*}` 这类宿主符号已全部去掉。

### 8.4 shader：一条 `trace`，分支靠标志

- 主射线和阴影射线共用 `trace(..., bool shadow, ...)`：`shadow` 为常量折叠时几乎零开销，且 cutout/花草/火把/水的命中逻辑只维护一份。代价是寄存器压力（out 参数 8 个）——**加 DF 跳跃时若 occupancy 掉，先考虑把阴影射线拆成精简版，而不是砍功能**。
- 层级切换用 `fine` 标志 + `continue`，不嵌套循环：砖级→体素级（`fine=true; cell=clamp(...)`）、体素级离开砖→砖级（`fine=false`）。三级（段/DF）照此加标志，**不要加内层 for**。
- 掠射角稳定性三件套（已踩过坑，新跳跃代码必须沿用）：
  1. 跨越维度的坐标**直接整数赋值**（`cell.x = st.x>0 ? (ch.x+1)*4 : ch.x*4-1`），不用 `floor(ro+r*(t+ε))` 推——ε 推不过 4 的倍数平面会原地打转到预算耗尽（横线伪影）。
  2. `r` 分量为 0 钳到 `±1e-6`，否则 `0*inf=NaN`（整列穿透天空的细线）。
  3. 负数取模先加正偏移（`+uSX*4`、`+uN*64`、`+4096`），GLSL 负数 `%` 未定义。
- 预算耗尽不返回「未命中」而是 `kind=4` 全雾：**失败模式选择视觉上最不显眼的那个**（远景雾色而不是天空透出）。
- `home` 格排除、`nAlpha≤8`、`prevId` 同种相邻不重复 alpha 测试：这些上限都是防病态输入的护栏，新路径（DF `v==1` 分支）要保留。

### 8.5 面板 DSL：三类状态源，副作用走标签

- 参数分三桶：`P`（持久化 `vc.v2.params`，带 `P_VER`）、`D`（调试状态，**不持久化**：view/raw/冻结时间）、`S`（宿主 `settings`，如 `rd`，改动要回写宿主 UI）。面板行用 getter（`Pr/Dr/S`）指向桶，DSL 不关心来源。
- `apply(key, fx)` 的 `fx` 标签路由副作用：`rt` 重建 RT、`tex` 同步宿主视距滑块、`sh` 阴影、`dbg` 重编译着色器、默认只存盘（300 ms 去抖）。新参数先想清楚归哪个 fx，不要在 `render()` 里 diff。
- `vec2(...)` 把两个标量归一化到 [-1,1] 二维滑块、`R(min,max,step,log)` 描述范围：**一行一个参数对**，面板高度可控。调试下拉用 `options`。
- 面板与 bench 共用一套入口：`VR.setDebug / VR.D.time / VR.D.cloudX / VR.perf.gpuLast` 都是为无头脚本准备的，面板只是它们的 UI。

### 8.6 对 P2+ 的直接要求

1. DF 上线前先在 `uploadChunk` 里统计四机位视线上 `v≥3` 的格子占比（CPU 版 DF 即可），写进 §6.4 再写 shader。
2. `#if DF` 编译期开关 + 面板 `df` 下拉（0 退化 / 1 开），`--cmp p0` 必须 0 px。
3. `uDist` 走 `stDist` staging + 同一套 `wrap`；`clearChunk` 不清它；光照重传不触发 Worker。
4. 新增 DBG 视图 `4 = dist 值`、`5` 增加 DF 跳跃计数（`gLvD`）。
5. 如果 DF 让洞穴/水面机位的 occupancy 下降（gpu 不随步数线性降），回到 8.4 第一条。
