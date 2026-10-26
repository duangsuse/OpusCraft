# 测量与经验迁移：renderer-refactor 的工具和结论怎么带进 `?r=gl`（步骤 8 的前置）

> 用户要求（2026-10-26）：移植 goodGL 管线时，`handover/renderer-refactor`（s05 工具、s06 数字、s08 经验、s09 开销账）、`handover/tools.md`、`goal-glmod`、`doc/dda-optim.md` 里沉淀的测量方法和性能决策**不能因为换管线就丢掉**。
> 本册是对照表：每一条在 `?r=gl` 上怎么继续成立、工具要改哪里、哪些只对 DDA 有意义。真值仍在原处，本册只写映射。工具用法见 `../handover/tools.md`。

## 0. "迁移到 WebGL2" 实际换掉的是什么

- 宿主 A（three r160）、宿主 B（r170）、v2、v2/gl **现在就跑在 WebGL2 上**（three 默认建 WebGL2 上下文）。goodGL 也是 WebGL2，API 版本不变。
- 真正换掉的是 **three 的材质 / RT 抽象**：goodGL 直接调 `gl.*`。工具里依赖 three 对象的部分会失效；依赖驱动、浏览器的部分照常可用。

| 工具 / 机制 | 依赖 | 在 `?r=gl` 上 |
|---|---|---|
| GPU 分 pass 计时（`EXT_disjoint_timer_query_webgl2`，`v2/gl.js:1050–1078` 的 `gpuPass / gpuPoll`） | 裸 GL | **照搬**：那段本来就是裸 GL，复制进 rgl，pass 名换成 §2 的列表 |
| 墙钟吞吐（bench `timeFrames` 后半：关查询、连续提交 ≥ 40 帧、`readPixels` 1 像素同步） | 裸 GL | 照用，**仍是裁决指标**（glmod §1.1） |
| `shader-stats.mjs`（`INTEL_DEBUG=fs`） | 驱动 | 照用，URL 换成 `?r=gl`。它取最大的几个片元着色器，gl 下会是 `fancyFS / compositeFS / waterFS / cloudsFS` |
| CDP、`--use-angle=gl`、无头 / 有头、SwiftShader | 浏览器 | 照用 |
| `--save / --cmp`、`refdiff.mjs`（逐像素） | bench 读 `VR.ddaRT`（three RT），用 `readRenderTargetPixels` | **要改**：rgl 提供 `readOut()`（§2） |
| `compIso`（独立计时合成 pass） | `VR.comp`（three 材质） | 只对 v2；gl 给 `final` 做独立计时（§6 第 4 行） |
| `fsdump.mjs` | `VR.post.fragmentShader`（three 材质） | **要改**：rgl 导出 `programs`（§2） |
| DBG 热力图（迭代 / fetch / DF / 云步 / tex）、`--probe`、`df-seeds.mjs`、`upload-cost.mjs` | DDA 着色器 / 环 | 只对 v2。gl 有自己的一组 DBG（§5） |
| `verify-renderer.mjs` | 页面接口 | 加 `gl` 组（§3） |
| `v2/pass.js`（`Pass` 工厂，基于 RawShaderMaterial） | three | gl 不用（goodGL 有自己的 `use / u1f / m4`）；但 glmod §1.1b 的**规则**照用：宏和 uniform 的区分、首次链接后的双向自检（§6） |

## 1. 先在宿主 A 上测

- 用户（2026-10-26）：所有东西都先在宿主 A 上试玩。bench 的默认值本来就是宿主 A：`VoxelCraft.html`、seed 20240607、rd 6、1280×657、5 机位（`../handover/tools.md` §3）。
- 所以 `?r=gl` **先接宿主 A**。rgl 只认 `ChunkSource / BlockTable / Env`（goal-renderapi.ts）。宿主 A 的三个适配器 `voxelCraftSource / voxelCraftEnv / voxelCraftBlocks` 已经在 `v2/gl.js:1192–1236` export 了，直接 import，不复制（§8.3「渲染器只认接口」）。
- 好处：同一页面、同一世界、同一机位，`--r v2/gl` 和 `--r gl` 两张图可以直接对比。glmod §-1.B 那张软阴影数字表就是现成的对照组。
- 宿主 B 等 goalP4P5 步骤 2 的 `glsSource / glsBlocks / glsEnv` 落地后再接（render.md R6）。

## 2. rgl 要导出的 bench 契约（与 v2/gl 同名，bench 不按渲染器分支）

| 成员 | v2/gl 现状 | rgl |
|---|---|---|
| `name` | `'v2/gl'` | `'gl'` |
| `P / P_DEFAULTS / panelSpec / apply(k, fx) / presets` | 面板参数 + 副作用路由（bench 的 `--set / --preset` 走它） | goodGL `Game.settings` 的画质项（`shadowQ volumetric pbr pom taa clouds waving`，L5563）+ `Game.dbg` 的 `fog mist vol exp`（L6248）+ 本包新增的旋钮（PCSS 参数，§7）。`fx`：`def` = 宏重编译，`rt` = 重建渲染目标，缺省 = 只改 uniform。面板用 `buildPane`（`v2/gl.js:29`，已 export） |
| `&json=` | `v2/gl.js:138–143` 解析 | 同一个函数（改成 export，属于结构改动） |
| `D` | `{ view, raw, time, cloudX, ref, noTimer }` | 同名：`time` 钉住 `F.time`、火把闪烁和水波相位；`cloudX` 钉住 `cloudTime`；`ref` → REF 宏；`noTimer` 关掉计时查询 |
| `setRef(on) / setDebug(view, raw)` | REF_MODE / DBG 宏 | 同名，含义见 §4、§5 |
| `perf` | `{ hasTimer, gpu, gpuLast{…, frame}, cpuMs }` | 同形；新增 `passes: [...]`（各 pass 名），bench 按它出列 |
| `resetLag()` | 滞后相机直接对齐 | 清 TAA 历史和抖动序号，曝光和 `caveFactor` 直接取目标值（§4） |
| `ddaRT` | 读回目标（three RT） | 改为 `readOut() → { w, h, px }`：final 的 LDR 结果（HUD 之前）。v2/gl 也补一个同名包装 |
| `df.pending()` | settle 时等 DF 回包 | `pending()` = 网格 Worker 在途数 + 上传队列长度。bench 的 settle 先认 `VR.pending`，没有再退到 `VR.df.pending` |
| `post / comp` | fsdump、compIso 用 | 改为 `programs: { 名字: { vs, fs, defines } }`；v2/gl 也补一个（从 three 材质里取） |
| `stats()` | 状态字符串 | 段数 / 四边形数 / draw 数 / 本帧网格耗时 |

## 3. 工具侧要改的（只改分支条件，v2 的输出不变）

| 文件 | 改动 | 验收 |
|---|---|---|
| `VoxelCraft.html:1324` | 渲染器白名单改成一张表：`{ v1: './v1.js', v2: './v2.js', 'v2/gl': './v2/gl.js', gl: './rgl/index.js' }` | `?r=gl` 能载入；`?r=bogus` 仍回落到 v1（verify 现有的组） |
| `tools/bench-v2.mjs` | 把 `name.startsWith('v2')` 换成检查 §2 的契约成员；DDA 专属的测量（DBG 1/2/4/5/6 五次 grab、`compIso`、DF 未算槽位、`--probe`）只在 `VR.df` 存在时跑；表头的 gpu 列由 `perf.passes` 生成；`grab` 改走 `readOut()` | **v2 和 v2/gl 跑出来的表与改前逐列相同，`--cmp` 0 px**（改脚本前先 `--save`） |
| `tools/fsdump.mjs` | 改读 `programs` | v2/gl 导出的文本与改前逐字节相同 |
| `tools/verify-renderer.mjs` | 加 `gl` 组：能创建、无异常、`buildChunk / disposeChunk`、1 格厚墙贴天空的放置 / 移除（宿主 `setBlock` 和 `onBlockChanged` 两条路径，用 `readOut` 检查）、静态检查（rgl 主体不读宿主私有字段，与 v2 同一条 grep 规则） | 三组变四组，全部 PASS |
| `tools/shader-stats.mjs` | 不改，URL 传 `?r=gl` | 输出前 8 个着色器 |
| 新增 `tools/frametime.mjs` | 给**不是本仓库渲染器**的页面测墙钟：`--url … --step '<js>' --frames N`，每帧调一次 step，最后读 1 像素同步。goodGL 原版用 `Game.manual = true` 加 `Game.step(16.7)`（L5727–5728，它自带的手动时钟） | goodGL 原版同一 URL 跑两次，吞吐差 < 3% |

## 4. 确定性与参考模式（gl 版）

§8.7-7「先做到同一份代码重复跑 0 px，再相信任何对比」照旧。goodGL 里会让同一份代码出不同像素的来源：

| # | 来源 | 位置 | 钉法 |
|---|---|---|---|
| 1 | TAA 抖动序号 `_taaI`，1…8 循环 | L6186 | `resetLag` 归零；grab 之前固定渲染 16 帧（两轮 Halton） |
| 2 | TAA 历史：`histValid`；`taaReset` 只在相机一帧跳 > 4 格时置位 | L4170–4176、L6192 | `resetLag` 强制 reset |
| 3 | 自动曝光（`exposure += (target − exposure)·dt/1200`）；眼处天空光 `eyeSky` 按 `dt/800` 渐变，`caveFactor` 由它推出 | L6258、L6201–6203 | `resetLag` 让两者直接取目标值；`D.exp` 存在时曝光固定 |
| 4 | `F.time = now()/1000`、火把闪烁 `flicker`、`cloudTime` | L6194–6196 | 改取 `D.time / D.cloudX`（与 v2 的 `VR.D.time = 10; VR.D.cloudX = 0` 同一口径） |
| 5 | 网格 Worker 的回包顺序 | `WorkerPool` L1753–1801 | settle 等到 `pending() == 0`。每段网格只依赖自己的 padded 输入，顺序不影响结果 |
| 6 | 天气随机（雨量、闪电） | goodGL 自己的 `weather` 状态机 | rgl 不用它，只读 `Env.weather`；宿主 A 没有天气，恒为晴 |
| 7 | 宿主 A 水下 FOV 指数逼近 | bench 的 `place()` 已经钉死 | 不变 |

PCSS 的旋转噪声 `ign(gl_FragCoord.xy)`（L3162）只依赖像素坐标，不用钉。

**`REF_MODE`（`setRef(1)`）在 gl 里是什么**：在 v2 里它是"步数预算全部放大 + 精确入格"，让结构改动的对比只剩真差异。gl 里的对应物是**去掉所有时间累积和自适应**：TAA 关、曝光固定、`taaReset` 每帧置位。预算类参数（PCSS 5+8 次采样、云 16+3 步、体积光 14 次、SSR 步数）现在都是 GLSL 常量，不用动；以后做成可调的，REF 下取最高档。结构步骤（vendor 抽取、uniform 改宏、ID 表、padded）都要求在 REF 下 0 px。

## 5. gl 的调试视图（`setDebug(view, raw)`，编译期宏 `DBG`；`DBG=0` 时与生产着色器逐字节相同）

v2 的 DBG 量的是"射线走了多少步"。光栅管线里对应的是"一个像素被画了几次、每次多贵"。

| view | 内容 | 用途 |
|---|---|---|
| 1 | overdraw：场景 pass 改成加法混合（JS 端切状态），片元写常量 1/255 | 看树冠、草地被重复着色多少次；决定要不要做 greedy 或预深度 |
| 2 | 片元成本下界：`fancyFS` 只输出 albedo（保留 alpha test） | 整帧减去它 = PBR + 阴影 + POM + SSS 的着色成本（思路同 v2 的「平滑光照占比」列） |
| 3 | `shadowAt` 直接返回 1 | 阴影采样占比（对应 v2 的 `shadowSteps=0`） |
| 4 | PCSS：R = 遮挡物命中数 `nb`，G = 半影宽度（量化） | 调 §7 的半影参数 |
| 5 | POM 迭代数 | 18 格以内 POM 的代价 |

raw 输出给脚本求均值，热力色给人看（§8.1-⑤）。每个视图都是 `#if DBG == n`，不用 uniform 分支。

## 6. 经验对照（s08 / glmod / dda-optim → gl）

| 出处 | 经验 | 在 gl 上 |
|---|---|---|
| §8.1-① | 结构的收益上限 = 触发率；先量再写 | 同样适用。例：goodGL 网格器不做 greedy，先量顶点阶段占比（用 DBG 2 的下界加上顶点数）再决定做不做 |
| 用户（10-26）、dda-optim #1 | 用 DF（复用网格器的信息）砍掉约 30% 的 DDA 开销，整帧只降了约 10%；后来发现大头是阴影选错了 | **任何优化之前先量"关掉它"的上界**。R0 给每个效果各关一次（阴影 / 体积光 / 云 / TAA / PBR / POM / bloom），写成 §6.4 那样的表，再定优化顺序（就是 §9.3 的做法） |
| §8.1-②、§8.7-1 | A/B 用编译期 `#if`；uniform 分支即使永不进入也占寄存器 | ⚠ goodGL 的画质开关**全是 uniform 分支**：`u_pbrOn / u_pomOn`（L4084）、`u_volOn`（L4158）、`u_shadowOn`、`u_cloudShadowOn`、`u_wind`。R7 按一张表把它们换成宏（在 rgl 的 GLSL 装配层做，登记进 PATCHES.md），换前换后各跑一次 `shader-stats` |
| §8.1-③ | 正确性 = 0 px | 结构步骤在 REF 下 0 px（§4） |
| §8.1-④ | 帧内第一次写默认帧缓冲的计时查询，会把等交换链 / vsync 的时间算进去（v2 的 comp 帧内约 10 ms，独立测约 1 ms） | gl 里第一次写默认帧缓冲的是 `final`，它的帧内计时同样不可信 → 照 `compIso` 的办法独立计时，或者只看墙钟 |
| §8.7-6 | 本机相邻 pass 的计时查询会重叠；Chrome 的 `gl.finish()` 不阻塞 | 分 pass 计时只作参考，裁决看墙钟 |
| glmod §-1.B | 本机在 DDA pass 之后每多一个 RT pass，整帧 +5 ms；放在它之前几乎为 0 | goodGL 在场景之后还有 copy / 水 / 云 / 合成 / TAA / bloom / final。R0 要确认这个现象在 gl 上存不存在：逐个关掉后处理 pass，看墙钟是否按约 5 ms 一档跳 |
| §8.7-1 | 先看编译结果（SIMD 宽度、spill），再谈别的 | `fancyFS` 把 PBR、PCSS、POM、SSS、湿润都放在一个着色器里。R3 第一次出图就记一次 `shader-stats` 基线 |
| §8.7-5 | 预算本身是画面的一部分 | gl 的预算：PCSS 5+8 次采样、云 16+3 步、体积光 14 次、SSR、POM 18 格、法线贴图 32–80 格淡出。改预算属于风格通道（人审），不属于结构通道 |
| §8.3 | 渲染器只认接口；默认适配器放在文件尾 | rgl 只认 renderapi；宿主专属的东西（ID 名表、海平面、云底高度、绝对 y 常量）全部放在 `xlate` 的宿主行（render.md §3） |
| §8.5 | 面板分 P / D / S 三桶，副作用走 `fx` 标签 | rgl 照用；以后随 goal-panify 一起换 |
| §8.4 | `trace` 的寄存器压力、掠射角三件套 | 只对 DDA。gl 里相关的只有 SSR 和云的步进循环：循环里携带的变量越少越好 |
| glmod §-1.A | 结构 / 风格两条验收通道，不混在一次提交里 | 照用：R1–R3 是结构（0 px）；换 LiqPG 水面、改 PCSS 参数、改色调是风格（人审后另存基准） |

## 7. 阴影：用户的结论怎么落在 gl 上

用户（2026-10-26）：之前 DDA 整帧降不下来是因为阴影选错了，**应该用软阴影**；但**草和花仍然要有精确阴影**。goodGL 在这点上问题较小。

goodGL 为什么问题小（读码）：
- 阴影图 pass 对 cutout 做 alpha test：`shadowFS`（L2677–2681）在 `(v_flags & 3) == 1` 时丢弃 `alpha < 0.5` 的片元。花草、树叶投出的是贴图剪影，不是方格。
- 阴影 VS 用和主 pass 同一个摇动公式，`u_wind` 都是 1（L2661–2668、L4073、L4102），所以摇动的草和它的影子不会脱节。
- PCSS 的半影随遮挡距离变宽：`pen = clamp(Δz·640·0.018, 0.02, 0.55)` 格（L3170）。贴地的花草（遮挡距离不到 1 格）半影约 0.02 格，基本是硬边；树冠（5–10 格）0.1–0.2 格；30 格以上封顶 0.55 格。
- 精度够：2048² 覆盖 ±150 格，阴影坐标做了中心加密（`df = 0.9·r + 0.1`，L3158），相机附近约 1/68 格一个 texel，比 16 px 贴图的一个像素（1/16 格）还细。

所以 rgl 不需要 v2 那种"低分辨率软阴影 pass"。要做的：

| 项 | 做法 |
|---|---|
| 参数化 | `0.018 / 0.02 / 0.55` 和遮挡物搜索半径 `0.45`（L3165）提成 P 参数（tier 1），默认取 goodGL 原值 |
| 与 smooth-gls 的冲突 | ⚠ glmod §-1.A 定的 Veloren 风格要求阴影"边缘 ≥ 1.5 格、强度 ≤ 0.35"；PCSS 原值的半影上限是 0.55 格、强度 1。把上限拉到 1.5 格必须同时加大搜索半径和采样数，否则宽半影会漏检遮挡物，出现斑点。先按原值出图，由人决定要不要加一个 `vel` 预设 |
| 验收 | 新机位 `flora`：花草密集、太阳角低、相机离花草 2–6 格；和 `?r=v2/gl` 的软阴影在同一机位对比 → 人看：花草影子清楚，树冠影子柔和，远处地形影子不闪 |
| 成本 | 阴影 pass 单独计时（`perf.passes` 里的 `shadow`），再加 DBG 3 的采样占比 |

## 8. R0：移植前先填的数字

| 组 | 页面 | 怎么跑 |
|---|---|---|
| goodGL 原版（去雾） | `goodGL.html#auto&seed=1&rd=6&x=…&z=…&t=…`，载入后执行 `Game.dbg = { fog: 0, mist: 0 }`（L6248 的调试覆写） | `frametime.mjs --step 'Game.step(16.7)'`。它和宿主 A 不是同一个世界，机位只能挑相近的地形（平地远眺 / 树冠 / 水面） |
| 宿主 A v2/gl（软阴影开） | `VoxelCraft.html?r=v2/gl` | `bench-v2 --r v2/gl --set softShadow=1` |
| 宿主 A v2 | `?r=v2` | `bench-v2 --r v2` |
| 宿主 A gl | `?r=gl`（R3 之后） | `bench-v2 --r gl`：**同一世界、同一机位**，这才是严格的对比 |

- 分辨率：v2 的 DDA 默认 scale 0.8，goodGL 原版有 `renderScale`。两组都记："输出分辨率相同"和"各用各的默认值"。
- goodGL 原版的效果上界：每项各关一次（`shadowQ`、`volumetric`、`clouds`、`taa`、`pbr`、`pom`；bloom 没有开关，在 rgl 里补宏），表头同 §6.4。
- 结果写进 render.md §6，按 §8.1-⑥ 的四栏写：实现要点 / 结果表 / 未达成项及原因 / 对后续阶段的影响。
