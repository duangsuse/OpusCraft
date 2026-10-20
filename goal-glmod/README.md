# goal-glmod —— v2 渲染管线模块化（= goalP4P5 第 4 步「P5 拆 pass」的落地方案）

> 立场：**不换框架**（three 持有 GL 上下文，regl / threepipe 都要么抢上下文要么再包一层 UI）。
> 在 three 之上加一个 ~40 行的 `Pass` 工厂（移植 2D 项目的 ES6 模板写法），把 `DDA_FS` 切成 GLSL 模块 + 两个 program，
> 参数表变成单一真值（面板 / uniform / 宏 / 预设 / URL / JS API / 性能采集全从它推导）。
> 每一步都有 0 px 回归和 `shader-stats` 数字；拆 pass 之前先做 1 天 spike 决定要不要押注。

## 0. 为什么是这个形态

- §8.7 结论：成本在寄存器压力（SIMD8 + ~230 spill），不在 fetch / 步数。拆 pass 的唯一目的是让**每个 program 的活跃变量集变小**。两个文件不够，要两个 program、两次 draw。
- 现状代码的不满（纯 three 手写）集中在三处，都是「同一件事写了 N 遍」：
  1. `uni` 声明 ~60 个 uniform（L2025–2035）+ `render()` 里 ~50 行 `uni.uX.value = P.y`（L2160–2210）+ GLSL 里再声明一遍；
  2. `P_DEFAULTS` / `PANEL` / `syncDefines()` / `apply(key, fx)` / 预设 / `&json=` 各自维护一份键的知识；
  3. `DDA_FS` 一个 1200 行模板串，云 / 水 / 水下 / 树叶 / 调试靠 `#if` 共存，加一段全局变慢。
- 2D 项目的 `Pass({tag})\`...${_=>P.param}\`` 解决的正是 1；它和 three「磨合艰难」只因为它是 regl。把它的**模板部分**搬过来、底层换成 `THREE.RawShaderMaterial` + 全屏 quad，磨合成本为零。

## 1. 三个构件（按引入顺序）

### 1.1 `Pass` 工厂（`v2/pass.js`，~40 行）

```js
// 用法与 2D 项目一致：GLSL 里 `uniform float ${_ => P.fogA1};` → 自动声明名 fogA1、每帧回填
//   类型写在 GLSL 里；名字从箭头函数源码 `.xxx` 取（冲突 / 非属性表达式时 u('name', fn) 显式给名）
//   vec/mat/纹理：fn 返回同一个对象即可（three 按引用读，不分配）
const Pass = ({ glsl3 = true, defines = {}, depth = false, out } = {}) => (code, ...fns) => {
  const uniforms = {}, src = code.reduce((s, t, i) => {
    const f = fns[i]; if (!f) return s + t;
    const k = f.k || (f.k = (f + '').match(/\.(\w+)\s*$/)[1]);
    uniforms[k] = { value: null, get: f }; return s + t + k;
  }, '');
  const mat = new THREE.RawShaderMaterial({ glslVersion: glsl3 ? THREE.GLSL3 : null, uniforms, defines,
    vertexShader: VS_QUAD, fragmentShader: src, depthTest: depth, depthWrite: depth, depthFunc: THREE.AlwaysDepth });
  return { mat, uniforms,
    run(renderer, rt) { for (const k in uniforms) uniforms[k].value = uniforms[k].get(); renderer.setRenderTarget(rt); renderer.render(quadScene(mat), quadCam); },
    define(k, v) { if (mat.defines[k] !== v) { mat.defines[k] = v; mat.needsUpdate = true; } } };
};
```

- GLSL 模块 = 返回字符串片段的函数 `mod.water(u)`，内部同样用 `${_ => P.x}` 声明自己的 uniform；一个 pass 的源码 = 若干模块拼接，uniform 集自动合并（同名同 getter 允许，同名不同 getter 抛错）。
- 删掉：`uni` 字面量、`render()` 的回填段、`cloudMats` 的 defines 同步（`define()` 改为按 pass 调）。`post.defines` 的 A/B 语义不变（仍是编译期 `#if`，§8.7-1）。
- 计时槽：`run()` 可选 `gpuPass(name)` 包裹；**裁决指标改为整帧吞吐**（墙钟数帧），分 pass 计时只做参考（§8.7-6 重叠问题）。

### 1.1b 编译期开关（`#if`）在 DSL 里的规则（必须照做，不设计替代方案）

1. **位置决定种类**：`${ref}` / `${fn}` 出现在以 `#` 开头的行里（`#define LEAF_SH ${c_.V.it.leafShadow}`）→ 编译期宏；其他位置 → uniform。没有第二种语法。
2. **宏统一求值**：模块级 `Defs`（= 现 `syncDefines()` 的 `want`）每帧算一次；每个 pass 只取自己源码引用到的子集，子集值变了才 `needsUpdate`。同一帧内所有 pass 看到的宏值必然相同（G-buffer 两端布局一致的前提）。派生宏（`LEAF_SH_LOD` 这类）写在 `Defs` 里，不写在 GLSL 里。
3. **未定义宏兑底**：GLSL ES 3.00 的 `#if X` 在 X 未定义时是编译错误（不是 C 的 0）。`Pass` 在源码头部为 `Defs` 全部键补 `#ifndef X\n#define X 0\n#endif`。
4. **双向自检**：首次链接后 `gl.getActiveUniform` 枚举活跃 uniform，与已绑定 getter 集合比对：活跃但未绑定 → `throw`；绑定但不活跃 → `console.warn`（被 `#if` 剔掉是正常的）。uniform 名写错在 three 里是静默的，这条把它变成硬错误。
5. 宏变化触发重编译 = panify 的 `timeit:'gl_wtf'`；哪些参数是宏由 GLSL 里的使用位置决定，面板从 `Pass` 反查（`pass.defineRefs`），不在面板里重复标。

### 1.2 GLSL 模块（`v2/glsl/*.js`，纯搬运，不改逻辑）

| 模块 | 内容（现 `DDA_FS` 行段） | 被哪些 pass 用 |
|---|---|---|
| `common` | 宏 / 计数器 / `GLSL.light,mat,fog` / `hashU,ign` / 数据访问 `voxAt…smoothLight` / `isFluid,fluidTop` | 全部 |
| `trace` | `cellIn`、`trace()`、树叶 / 花草 / 火把命中 | A（主射线）、B（阴影 / 反射 / 折射） |
| `shade` | 命中着色：平滑光照 / AO / 贴图 / 岸壁水线 / 雾合成 | B |
| `water` | `nB,shoreH,shoreDist,seaH`、水面分支、`reflHit,reflScene` | B（`#if WATER_STYLE`） |
| `uw` | `uwRip…uwShafts`、水下仰视分支 | B |
| `cloud` | `cloudDen,cloudVol,cloudHit,starAt` | B、cloud-lr |
| `dbg` | `heat,dbgOut,RET`、DBG 7–9 探针 | A / B（`#if DBG`） |

验收：拼接后的 B（单 pass 模式，`#if SPLIT==0`）与现 `DDA_FS` **预处理后文本相同**（`tools/shader-stats` 指令数 / spill 逐项相等），`--cmp p1fx` 0 px。

### 1.3 参数表（单一真值）—— 实现形态以 `../goal-panify/README.md` §1–§2 为准（`c_` 命名空间 + `gg.vars` 的 `Ref`）

下面的 `def()` 只是语义示意；落地时 `def(key, …)` = `gg.vars({…})` 的字段 + 面板行的 `opts`，Pass DSL 的 `${…}` 直接吃 `c_.X.it.key` 引用。

```js
// def(key, default, { label, group, r | options | bool, tier, fx, perf })
def('fogA1',      0.6, { label: '雾强度',     group: '性能', r: R(0, 1),            tier: 1 });
def('df',         1,   { label: '距离场跳跃', group: '性能', bool: true, fx: 'def', tier: 2, perf: true });
def('leafShadow', 0,   { label: '树叶阴影',   group: '植被', options: {…}, fx: 'def', tier: 0, perf: true });
```

从它推导（现在是手写五份）：`P_DEFAULTS`、`PANEL`（按 group + tier + order）、`loadP/assignTyped` 的类型校验、`&json=`、预设快照、`VR.params` JS API、性能采集的开关清单。uniform 不在这里——uniform 跟着 GLSL 模块走（1.1），参数表只管「人可调的东西」。

**tier（解决「怎么剔微参数」）**：
- `0` 玩家：质量预设（低 = scale 0.6 + 实心树叶阴影 + 阴影 4 步；中 = 关树叶卡片；高 = 当前默认）、rd、scale。默认只显示这层。
- `1` 调优：面板「高级」折叠里。
- `2` 微参数 / 调试：面板不显示，只走 `&json=` / JS API / bench `--set`。
- `3` 冻结：可提示用户从 `P` 移除、GLSL 里改常量。加在verify工具里，如果有tier3就在输出提示

## 2. 步骤

| # | 步骤 | 验收 | 风险 / 退出条件 |
|---|---|---|---|
| 0 | **Spike（≤1 天，宿主 A）**：不做任何整理，直接在 `DDA_FS` 里 `#if SPLIT`：A = 现 `trace` 主射线 → 写 `RGBA32UI`（布局见 §3）；B = 现 `main` 从 `camW` 判定起读 G-buffer 继续。只跑 plain / water 两机位 | `shader-stats`：A 的 spill / SIMD；A+B 整帧吞吐 vs 单 pass；`--ref` 下 0 px（或列出差异像素原因） | A 不比单 pass 瘦（spill 没降一半以上）或 A+B 吞吐更慢 → **放弃拆 pass**，只做 1、2、5、6（它们本身就值），P4b 直接在单 pass 里加 `#if SHAPES` |
| 1 | `Pass` 工厂 + uniform 自动回填；`post / cloudMats / comp` 三个改走它 | 0 px；`render()` 回填段消失；`uni` 字面量消失 | 名字冲突（`P.scale` vs `D.scale`）→ 显式 `u()` |
| 2 | GLSL 切模块（§1.2），仍单 pass | 预处理后文本相同、spill 相同、0 px | 无 |
| 3 | **G-buffer 拆分**（spike 转正）：pass A `trace` → G-buffer；pass B 读回 → 阴影射线 / 水 / 水下 / 云 / 雾 / 深度。单 pass 路径保留在 `#if SPLIT==0` 做 A/B | 5 机位 `--ref` 0 px；`shader-stats` A/B 各自 spill；整帧吞吐 ≥ 单 pass；`df-seeds` 0 px | `uvl` 重算不逐位（见 §3）→ 允许 ≤ 1e-6 级差异并记录；RT 切换在本驱动上有未知开销（云 pass 旧案）→ spike 已排除 |
| 4 | 可选：阴影射线再独立成 pass S（读 G-buffer，写 1 通道遮蔽）；只在 B 的 spill 仍 > 100 时做 | B spill 显著下降；0 px | 不做也能收尾 |
| 5 | 参数表（= panify 第 1–3 步在 v2 侧的落地）+ tier + `gm.pane` API；面板从表生成；质量预设三档入表 | 面板行为不变（手测）；`&json=` / 预设 / bench `--set` 走同一条路；`tier 0` 默认视图 ≤ 8 行 | 现有 localStorage 预设迁移：键名不变即可 |
| 6 | 性能钩子：① 轨迹录制（`{t,pos,yaw,pitch,edits}` 10 Hz + seed → `tools/out/traj/`）+ `bench --replay`；② `perf: true` 参数的交错 A/B（uniform 类开关每 2–3 s 自动翻转、配对记 fps；`#if` 类预编译两份 program 热切）；③ 落盘：localStorage 环形缓冲 + 可选 `sendBeacon` → `tools/perf-collect.mjs`（JSONL） | replay 同轨迹重复跑 0 px、吞吐抖动 < 3%；采集 JSONL 能被一个脚本聚合成「参数 → 影响」表（回灌 §1.3 排序） | 短期只做 ①（它直接替代 timer query 做裁决）；②③ 等试玩阶段 |
| 7 | 回写：`handover/renderer-refactor` §6 / §8 / s00 索引；`goalP4P5` 第 4 步指向本目录 | verify 三组 PASS | — |

步骤 1、2、5 不依赖 spike 结果，可以先做；3 等 spike。

## 3. G-buffer 布局（一张 `RGBA32UI`，DDA 分辨率，Nearest，`texelFetch` 读）

| 通道 | 内容 |
|---|---|
| R | `floatBitsToUint(tHit)`（未命中 = `0xFFFFFFFF`） |
| G | `floatBitsToUint(tw)`（无水 = `0xFFFFFFFF`） |
| B | `hc` 环内坐标打包：x 9 位 \| z 9 位 \| y 8 位（N ≤ 512，H ≤ 256；B 读回时加回 `uLo` 的整数部分） |
| A | `hid` 16 位 \| `kind` 3 位 \| 法线（轴 2 + 符号 1）\| `wn`（轴 2 + 符号 1）\| hit 1 \| 预留 |

- `uvl`（格内 uv + 光照插值位置）在 B 里用 `ro + r * tHit` 与法线重算，公式与 `trace` 里**同一行源码**（抽成 `common` 里的函数两边都调），这是 0 px 的前提；若驱动重排导致个别像素舍入不同，验收允许并记录像素数。
- three r160+：`new WebGLRenderTarget(w, h, { type: UnsignedIntType, format: RGBAIntegerFormat, internalFormat: 'RGBA32UI', minFilter/magFilter: NearestFilter, depthBuffer: false })`，着色器 `glslVersion: GLSL3`、`layout(location=0) out uvec4`。`DDA_FS` 现在靠 three 的 `gl_FragColor` 兼容宏，转 GLSL3 时顺手改成 `out vec4`（步骤 2 里做）。
- 深度仍由 B 写 `gl_FragDepth`；`comp` 不变。

## 4. 不做

- 换 regl / threepipe / 自写 GL 封装；改 v1 / gls；动 `ChunkSource/BlockTable/Env` 接口（`goal-renderapi.ts` 不变）。
- 再追步数（§dda-optim）；阴影画面门控（改画面，已否决）。
- 面板换 UI 库：Tweakpane 留着，`buildPane` 改成从 `params.js` 生成即可。
- 拆 pass 之外的任何「顺手优化」——每步只做一件事，0 px。

## 5. 命令

```
node tools/shader-stats.mjs                                   # 每步前后；A / B 分开列
node tools/bench-v2.mjs --views plain,canopy,cave,water,uw --ref --cmp p1fx-ref   # 开工先 --save p1fx-ref
node tools/bench-v2.mjs --views plain,water --set split=1 --set split=0           # spike A/B（吞吐列）
node tools/bench-v2.mjs --replay tools/out/traj/xxx.jsonl                         # 步骤 6 之后
node tools/verify-renderer.mjs
```
