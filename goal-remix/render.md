# `?r=gl`：移植 goodGL 的渲染管线与 PBR（步骤 8，本包主线）

> goodGL.html 是裸 WebGL2，单文件 6431 行，没有用 three。行号写作 `Lnnn`。
> ⚠ **GLSL 是靠给 `GLSL` 对象依次重新赋值拼出来的**，前面好几版 shader 是死代码。真正在用的是：`skyCommon` L2956、`skyFancyFS` L3021、`fancyCommonFS` L3144、`fancyFS` L3454、`waterFS` L3260（L3745、L3756 又打了补丁）、`compositeFS` L3360（L3758–3788 补丁）、`finalFS` L3699。模板字面量在赋值那一刻就展开了，所以抽取时必须按原赋值顺序求值（R1）。
> **先接宿主 A**（用户 2026-10-26：所有东西先在 A 上试玩），宿主 B 随后。测量工具、确定性、`REF_MODE`、经验对照、阴影决定都在 [bench.md](bench.md)，**开工前先读它**。

## 0. 为什么移植它

- 用户实测：去雾的 goodGL 几乎全面好过 v2/gl，也更快；只有 LiqPG 的水面 / 水下 pass 比它好（换上 LiqPG 的见 water.md）。仓库里**没有记录过数字**，所以 R0 先补表（bench.md §8）。
- 它快的原因（读码）：生成和网格都在 Worker 里做，用可转移缓冲；3D 噪声在粗网格上采样再插值；光照只算到高度图以下 16 格（L1900）；缓存最近一次的区块查找（L1844）；每帧有时间预算和任务上限（L2210、L5744）；云用 1/3 分辨率，天空 LUT 很小；环境光颜色在 CPU 上缓存；阴影图做了畸变，原点按 4 格对齐；空段直接跳过。还有一处反而拖慢：`preserveDrawingBuffer:true`（L3835）。共享 three 的上下文之后这个参数被忽略，问题自动消失（§2）。
- **goodGL 只有三个缺点**（用户 10-26），各自的处理：

  | 缺点 | 来源（读码） | 处理 |
  |---|---|---|
  | 雾感太大 | 指数距离雾 `fogDensity = 0.0016 + 0.004·rain`（L6247）；晨雾 / 夜雾 `mist = 0.12 + 0.45·morning + 0.3·夜 + 0.5·rain`（L6246）；边界雾从视距的 72% 开始（`compositeFS` L3403） | 全部提成 P 参数，**默认取"去雾版"**（`fogDensity 0`、`mist 0`），边界雾保留（遮区块加载边缘），起点改为参数。R0 也按去雾版测。加回多少雾属风格通道，由人调 |
  | 水面、水下差 | `waterFS`；水下雾 `compositeFS` L3395–3397（`exp(−dist·0.07)` 混 `u_waterFog`）、`F.waterFog`（L6249）、水下 `fogCol`（L6278） | 整套换 LiqPG（water.md），goodGL 这几处水下雾一起去掉 |
  | 默认分辨率偏低 | `resize()` 把像素数封顶在 2.1 MP（`shaders` 开时，L6132–6141） | rgl 不取 `resize()`：画布归宿主（three 的 pixel ratio），内部渲染目标用 P 的 `scale`、`maxMP`（与 v2 同名，v2 默认 `maxMP 7.6`）。显存随像素数涨（§5），R0 记 2.1 MP 和宿主默认两档 |

- **阴影**：用户在 v2 上的结论是"地形用软阴影，花草要精确阴影"。goodGL 的 alpha-test 阴影图 + PCSS 正好两样都满足，不需要 v2 那种低分辨率软阴影 pass（bench.md §7）。
- **不丢的东西**：renderer-refactor 的 bench、`--ref`、0 px 回归、分 pass 计时、`shader-stats`、经验条目，全部按 bench.md 的对照表带过来。"换成 WebGL2"其实不换 API 版本（宿主早已是 WebGL2），换的是 three 的抽象；受影响的只有读 three 对象的几处工具（bench.md §0）。

## 1. 取什么

| # | pass | 目标 / 格式 | goodGL 代码 |
|---|---|---|---|
| 0 | 天空视角 LUT（Rayleigh + Mie + 臭氧单次散射，加多次散射近似） | 192×108 RGBA16F | `skyLutFS` L2971–3018 |
| 1 | 阴影图：单级，正交 ±150（`shadowQ≥2`）/ ±100，深度 ±320，带畸变，polygon offset 1.2/2；cutout 做 alpha test | 2048² DEPTH24 + 比较模式 | `shadowVS/FS` L2652–2681；原点对齐 L6238–6243 |
| 2 | 场景：全屏天空，然后不透明段 + 实体，**前向 PBR，MRT 输出** | sceneC RGBA16F + gbuf RGBA16F（八面体法线、粗糙度、ssrW）+ DEPTH24 纹理 | `skyFancyFS` L3021–3083、`chunkVS` L2325–2359、`fancyFS` L3454–3654 |
| 3 | 把颜色和深度拷一份 | copyC / copyD | L4126–4128 |
| 4 | 水 / 冰（不混合）：从拷贝里取折射、Beer 吸收、SSR、GGX 太阳高光、岸边和瀑布泡沫 | scene | `waterFS` → **换成 LiqPG 的**（water.md） |
| 5 | 体积云（y 185–262，16 步 + 3 步光照） | 1/3 分辨率 RGBA16F | `cloudsFS` L3086–3142、`cloudCommon` L2945 |
| 6 | 合成：不透明面的 SSR、云、按地平线色的指数高度雾、晨雾、体积光（14 次阴影采样）、径向日光、闪电 | compC RGBA16F | `compositeFS` L3360–3449 + L3758–3788 |
| 7 | TAA：Halton(2,3) 8 点抖动（L6181–6189），YCoCg 方差裁剪 | 2× RGBA16F 乒乓 | `taaFS` L3657–3696 |
| 8 | 手（TAA 之后画） | comp | `drawHand` L4212 |
| 9 | Bloom：6 级下采样（13 tap）+ tent 上采样 | 半分辨率起 | L2872–2895、L4182–4195 |
| 10 | Final：镜头鬼影、曝光、Purkinje 夜视偏移、ACES、饱和度、暗角、gamma、抖动 | 画布 | `finalFS` L3699–3742 |

- **PBR**（`fancyFS`）：GGX D、Smith/Schlick G（k = r/2）、Schlick F；漫反射用 Lambert × (1 − F/2)；环境光是 split-sum + 解析 `envBRDF`（L3484），环境图就是天空 LUT，粗糙度越大越偏向 `u_ambCol`（CPU 算，`Atmos.ambient` L3822）。另外还有地面反弹、树叶次表面散射、POM（只在 18 格内）、法线贴图随距离淡出（32–80 格）、考虑孔隙度的湿润、水洼与涟漪。阴影是 PCSS（5 tap 找遮挡物 + 8 tap Vogel PCF，按 IGN 逐像素旋转，L3156–3176）；还有云影 L3177、水下焦散 L3182。
- **材质贴图**是从 albedo 推导出来的（L1593–1731）。nrm：RG 法线、B 腔体 AO、A 高度。spec：R 光滑度、G F0（**≥230 表示金属**）、B 孔隙度 / SSS、A POM 深度。材质参数表 `M` 按**贴图名**索引（L1603–1651）。
- **网格器** `meshSection` L917–1066：**每个可见面一个四边形，不做 greedy**；读 18³ padded 数组；逐顶点 AO 和 4 点平滑光照，按 AO 选对角线翻转。顶点 28 字节：`a_pos f32×3 | a_uvl u16×4 | a_light u8n×4 | a_tint u8n×4`（L859–873），flags 位定义见 L897。每个 16³ 段一个不透明 VAO、一个半透明 VAO，共用一个 Uint32 四边形索引缓冲（L3858–3860），每段每 pass 一次 draw。要不要补 greedy 先按 bench.md §6 第 1 行量。

**不取**：原版（无光影）回退 `renderVanilla` L4043–4066；goodGL 自己的光照（两个宿主都有自己的光照）；goodGL 的天气状态机；`Game` / UI / 音频；`waterFS`（换成 LiqPG 的）。

## 2. 架构

```
宿主 A（VoxelCraft.html，H 96）── voxelCraftSource / Blocks / Env（v2/gl.js:1192–1236，已 export）──┐
宿主 B（index.html，H 128→256）── glsSource / glsBlocks / glsEnv（goalP4P5 步骤 2）────────────────┤
                                                                                                    ▼
                                         ChunkSource / BlockTable / Env（../goal-renderapi.ts）
  └─ xlate.padded(src, host, cx, sy, cz)   ChunkData 下标 (lx*16+lz)*H+y → 18³ x 最快；id 按宿主行查 LUT → gl id；
       │                                   sky<<4|blk 打包；每列 tint（layout.md §2）
       └─ Worker：vendor/gl 的 meshSection → 段 VBO / VAO（goodGL 自己的缓冲管理）
  Env ─ xlate.frame(env, host) ─→ 帧对象 F（照 goodGL Game.render L6142–6300 的字段）
rgl/index.js：createRenderer(RCTX) → { name: 'gl', buildChunk, disposeChunk, update, render, stats, …bench 契约（bench.md §2） }
```

- **入口**：宿主 A 的渲染器白名单（`VoxelCraft.html:1324`）改成一张表，加 `gl: './rgl/index.js'`（bench.md §3）。宿主 B 走 goalP4P5 §12.1 的 F6 热切换。
- **共享上下文**：goodGL 的 `new Renderer(canvas)` 自己调用 `canvas.getContext('webgl2', …)`（L3835）。把 three 的画布传进去，拿到的就是 three **已经建好的同一个上下文**：同类型重复调用会返回已有对象，参数被忽略。所以供体不用改，`preserveDrawingBuffer` 也随之失效。goodGL 画完后调用 `renderer.resetState()`，再交给 three 画 HUD。宿主 A 的主循环 `VR.render(); renderer.clearDepth(); renderer.render(hudScene, hudCam)`（VoxelCraft.html:2764–2765）不用改。
- **光照沿用宿主**：两个宿主都把 `sky / blk` 交给 `ChunkData`，padded 里直接打包，goodGL 的光照不取。
- **增量更新**：`onChunkChanged('blocks' | 'light' | 'gone')` / `onBlockChanged(x, y, z)` → 标脏段 `y>>4`，边界格（`x&15`、`z&15` ∈ {0, 15}，`y&15` ∈ {0, 15}）同时标相邻段。
- **宿主自己画的天空要让出来**：宿主 A 是天空球 `skyMat`、星星、平面云；宿主 B 再加天气粒子。由 goodGL 接管 → `Env.hide('sky' | 'stars' | 'clouds' | 'weather')`。ts 里现在只有 `'clouds' | 'stars'`，**先改 ts**。
- **Env 缺的两项**（先改 ts）：`dayTime?`（0…1，0 = 06:00：宿主 A 是 `worldTime`，宿主 B 是 `Sky.time / 24000`；goodGL 的 tick 就是 `dayTime·24000`，0 点相同）；`weather?`（`{ rain, thunder, wet }`，宿主 A 没有，恒为晴）。极光强度要眼处群系（L6236），没有 `Env.biomeAt` 时取常量 0.35。

## 3. 渲染侧的数据布局不兼容

| 项 | 宿主 A | 宿主 B | goodGL | 处理 |
|---|---|---|---|---|
| 方块下标 | ⚠ `(lx*16+lz)*96+y`，y 最快 | 同，H 128（步骤 1 后 256） | x 最快；网格器读 18³ padded（步长 x 1、z 18、y 324，`buildPadded` L2253–2273） | `xlate.padded` 转置 |
| 高度 | 96 = 6 段 | 128 / 256 | 256 = 16 段 | 段数 = `source.height / 16`；不必等步骤 1 |
| 光照 | ⚠ `sky`、`blk` 两个数组 | 同 | `(sky<<4)\|blk` 一个字节 | 打包 |
| 方块 id | ⚠ 26 个（VoxelCraft.html:659–661），全是 cube / cross / torch / 水 | ⚠ 88 个，按名注册 | 82 个；网格器里有**写死的 id**：L964 `id === 2`（草方块底面）、L965 `nb === 7`（贴水标记）、L979 / L983 `id === 47`（小麦）、L982 `30 / 55 / 31–34`（植物随机偏移）、L1027 `isW = id === 7` | **每格查 LUT 把宿主 id 换成 gl id**（每个宿主一张名字表，在 xlate 里），保证 water→7、grass→2、wheat→47……。网格器一个字不改 |
| goodGL 没有的宿主方块 | 2 个：tnt、gold_block | ⚠ 约 18 个：lapis_ore、emerald_ore、coal / iron / gold / diamond / lapis / emerald_block、ladder、tnt、snow（层）、pumpkin、jack_o_lantern、spawner、fire、netherrack、end_stone、oak_door（开工时用 `Blocks.byName` 全表重新核对，羊毛、耕地、箱子、熔炉都要查） | — | 立方体类：在 xlate 里追加 gl id 行（相当于 goodGL 的 `def()`：`RT / OCC / MAT / TEXF / FLAGS …`）。**goodGL 没有对应 RT 的模型**（门、梯子、雪层、火…；它只有 `NONE CUBE CROSS LIQUID TORCH CROP CACTUS LOW CHEST`）走 R6 的混合路径 |
| meta | 无（全 0） | 流体 0 源头 / 1–7 液位 / 8 下落 | 流体 bit0-2 液位、bit3 下落 | **相同**，不用转。火把朝向等经 `META` 规则行转换 |
| 群系 tint | 无（宿主 A 全 0） | ⚠ 每列 1 个 id，列下标 `x*16+z` | 每列 RGB `tintG / tintF`，列下标 `z*16+x`（L422、L471–472） | 宿主 A：常量行；宿主 B：padded 时按 `BIOMES` 行生成（5b 之后改用 temp/hum colormap） |
| 海平面、绝对 y 常量 | 海平面 40 | 62（v2 世界 127） | 63；**帧对象和 GLSL 里有写死的绝对 y**：云底 `CB = 185 / CT = 262`（L2947、L3370）、高度雾和晨雾的基准 `62.0`（`compositeFS` L3401、L3406）、洞穴雾 `eye[1] < 50`（L6282） | xlate 的宿主行给出 `sea / cloudBase / cloudTop / caveY`；GLSL 里的 `CB / CT` 和两处 `62.0` 改成宏（`// remix:`，登记 PATCHES.md） |
| 贴图 | 宿主图集 `TEX` | 资源包 / `res_vam.js` 图集 | `Textures` 程序化生成（L1126–1591），按 `TEX_NAMES` 排成纹理数组；mip 链为保 alpha 覆盖手工生成，按 16 px 写的（L3891–3922） | R3 选择：默认用 goodGL 自己的贴图（材质参数和贴图是一起调出来的），没有的从宿主图集补。宿主 B 用 `?tex=` 加载资源包时整体切到宿主图集，PBR 贴图由 `PBR.build` 从 albedo 推导。⚠ 资源包大于 16 px 的要先降采样，否则要改 mip 生成 |
| 天气 | 无 | `Weather` | 自己的状态机 | 只读 `Env.weather` |

## 4. 步骤

| # | 内容 | 验收 |
|---|---|---|
| R0 | **基线**（bench.md §8）：新增 `tools/frametime.mjs`；测 goodGL 原版（去雾）、宿主 A `?r=v2/gl`（软阴影开）、`?r=v2`；goodGL 原版各效果关一次的上界；写进 §6 | 表格填好；结论和用户的实测一致，或者把差异解释清楚 |
| R0b | **bench 契约与工具泛化**（bench.md §2–3），这时还没有 rgl：bench / fsdump / verify 改成认契约；v2/gl 补 `readOut / programs / pending / perf.passes` | v2、v2/gl 的 bench 表与改前逐列相同、`--cmp` 0 px；fsdump 输出逐字节相同；verify 三组 PASS |
| R1 | **vendor 抽取**（`tools/vendor.mjs gl`）：`SHARED_SRC` L13–1072 → `vendor/gl/shared.js`；按赋值顺序求值后的 GLSL → `glsl.js`；`Renderer` L3832–4250、`Atmos` L3790–3828、`PBR` L1593–1731、`Textures` L1126–1591 各成一个模块；`WorkerPool`（L1753–1801，`toString()` 塞进 Worker 的写法）换成模块 Worker 的包装 | 用 CDP 把 goodGL 页面运行时的 `GLSL` 对象整份 dump 出来，与 `glsl.js` 逐字符相等 |
| R2 | **空帧（宿主 A）**：`createRenderer(RCTX)` 只画天空和云，three 照常画 HUD；`?r=gl` 载入；分 pass 计时、`readOut`、`setRef / setDebug` 接上 | verify `gl` 组：创建、无 GL 错误、HUD 正常；同 URL 重复截图 0 px |
| R3 | **区块（宿主 A）**：padded → Worker 网格化 → 段缓冲 → 视锥剔除（`cull` L4021–4042），加上贴图 / PBR；宿主 A 的 ID 名表 + tnt、gold_block 两行 ADD | `bench-v2 --r gl` 5 机位出图，与 `--r v2/gl` 同机位并排交人看；放一个方块，下一帧可见（verify 的贴天空墙）；`shader-stats` 记 `fancyFS` 等的基线；每段网格耗时和顶点数写进 §6 |
| R4 | **实体合成 spike（宿主 A）**：A 方案 = three 把实体、粒子、选框画进 `sceneRT`（带深度），在 bloom / final 之前按深度合成进 goodGL 的 comp（与 v2 的 `comp` 同一招，v2/gl.js:917–946），实体也会被 tonemap；B 方案 = 先用一个只写深度的全屏 pass 把 goodGL 深度写进默认帧缓冲，three 在 final 之后直接画，最简单，但实体不走 tonemap | plain / canopy 两个机位上生物被地形正确遮挡；手可见；实体没有 TAA 拖影 → 人挑方案 |
| R5 | **Env → 帧对象 + 框架化**：时间（`Env.dayTime`）、日月、天气（`Env.weather` → 雨量、湿润渐变、云量）、雾、曝光；bench.md §4 的确定性钉点全部接上。同时按 §4.1 写 `rgl/pass.js` + `rgl/vars.js`，把 goodGL 各 program 的 uniform 改成用处内联的引用，删掉 `Renderer` 里全部上传调用（v2/gl 不动） | bench 同代码重复跑 0 px；`--ref` 下 0 px；每个 program 的 `shader-stats` 与 R3 基线相同；verify 静态检查：rgl 里不再有 `u1f(` 一类上传调用；宏来回切换第二次命中编译缓存 → 人看晨、昏、雨（宿主 B）三种天 |
| R6 | **接宿主 B**（等 goalP4P5 步骤 2 的 gls* 适配器）+ **特殊模型混合路径**：门、梯子、雪层、火等由 gls 网格器只出这些方块的网格，three 画进 `sceneRT`，走 R4 的合成 | `index.html?r=gl` 5 机位出图；`pose=models`（goalP4P5 §12.5 的验证世界 `test/bw_models.webp`）里 11 种 model 全部可见 |
| R7 | **设置与性能**：goodGL 的画质项接进 `P`（bench.md §2）；**uniform 开关换成宏**（bench.md §6 第 3 行）：`if (u_pbrOn > 0.5)` 改成 `#if ${c_.Gl.it.pbr}`（§4.1 第 1、5 条），切换靠编译缓存，不再每次重编译；PCSS 参数化和 `vel` 预设（bench.md §7）；按 R0 口径复测 | §6 表填完；每次换宏前后 `shader-stats` 不回退；整帧墙钟不慢于 R0 时 goodGL 原版的数字（同分辨率、同视距） |

结构步骤（R0b、R1、R2、R3 的 padded / ID 表、R7 的换宏）在 `--ref` 下 0 px；风格步骤（换 LiqPG 水、PCSS 参数、色调）走人审，通过后另存基准（glmod §-1.A 的两条通道，不混在一次提交里）。

## 4.1 R5 顺带完成框架化：`rgl/pass.js` + `rgl/vars.js`

用户（10-26）：旧的 v2/gl 和 `v2/pass.js` 不动；rgl 另写一份，按下面的语义。glmod §1.1b 里仍然对的照搬；v2/glsl 现在的两种写法不是本意，不照抄。

**现状哪里不对**（v2/glsl，只作反例）：

| v2/gl 现状 | 问题 | rgl 的写法 |
|---|---|---|
| 模块函数收静态常量，在 GLSL 正文里做 JS 三元或直接拼值：`${LEAF_OK ? 'id == 255u' : 'false'}`（trace.js:270、321）、`${BT.tallGrassId != null ? … : 256}`（trace.js:344、346，shade.js:177、189）、`${LEAF_CARD_LAYER}`、`${H}` | 静态常量走了文本注入，没经过宏通道：fsdump 里看不出它是开关，面板和 bench 枚举不到，也没法 A/B | 静态值一律写在 `#` 行：`#if ${() => LEAF_OK}`、`#define TALL_GRASS ${() => BT.tallGrassId}`，正文里用宏名 |
| uniform 集中声明在 `U_MAIN`，名字和类型手写：`uniform float ${u('uStr', () => softStr)}` | 名字写两遍（`u('uStr')` 一遍，GLSL 类型声明一遍）；`u()` 本该是逃生口，结果成了常态 | 在用的地方写 `${c_.Gl.it.softStr}` 或 `${() => softStr}`，声明由 Pass 自动前置 |

**语义**：

1. **位置决定种类**（同 glmod §1.1b-1）：`${f}` 在以 `#` 开头的行里是宏，其他位置是 uniform。正文里的 `${}` 只允许两种东西：`glsl` 片段（模块拼接）和函数（uniform）。数字、字符串这类裸值放在正文里直接报错，逼静态值走 `#` 行。
2. **函数就是引用**：`c_.Gl.it.softStr` 本身是一个 getter 函数，调用它就是读当前值，和 `() => softStr` 走同一条路径。`set / As / path / key / meta` 放在共享原型 `RefProto` 上（原型链底是 `Function.prototype`），所以每个 Ref 只是一个闭包。`it` 对同一路径总返回同一个 Ref，可以当 Map 键。
3. **名字**：Ref 用 `key`（`softStr`）；箭头函数用源码末尾的 `.xxx` 或裸标识符（`() => softStr` → `softStr`，`() => F.sunDir` → `sunDir`）；其余情况用 `u('名字', f)`。同一个 program 里名字相同时，如果是同一个 Ref、或箭头函数源码文本相同，就是同一个 uniform（所以同一个 uniform 可以在多处内联）；否则报错。
4. **类型取自默认值，声明自动前置**：第一次编译时求值一次来定类型：`number` → `float`（`meta.glsl: 'int'` 时为 `int`）；`boolean` → `bool`；长度 2/3/4 的数组 → `vec2/3/4`；长度 16 的 `Float32Array` → `mat4`；纹理看 rgl 的纹理构造函数打在对象上的 `glslType`（`sampler2D / sampler2DArray / sampler2DShadow / usampler3D`，WebGLTexture 本身看不出类型）。`uniform <类型> <名字>;` 插在源码头部的 `#version` 和 `precision` 行之后：`#version` 必须在第一行，v2/pass.js 直接把兜底宏拼在最前面（`head + src`），这在 goodGL 的源码上会编译失败。上传函数（`uniform1f / 3fv / Matrix4fv / 1i`）在编译时按类型选好，每帧只调用。开发模式下，某帧值的类型变了就报错（"类型稳定"）。
5. **宏**：`#if ${f}` 取数值（布尔转成 0/1）；`#ifdef ${f}` 按真假决定定义与否。只出现在 `#if` 里的宏，头部补 `#ifndef X / #define X 0`（同 glmod §1.1b-3）；只出现在 `#ifdef` 里的不补，否则它永远为真；同一个宏两种用法混用就报错。
6. **编译缓存**：program 以「源码 id + 所有宏的当前值」为键缓存。宏值变了才换 program，切回旧值直接命中缓存，不重编译。只有 `#` 行里的值会让缓存失效，uniform 怎么变都不影响。有 `KHR_parallel_shader_compile` 扩展时，新变体在后台编译，编好之前继续用旧的（对应 panify 的 `timeit:'gl_wtf'` 呼吸灯）。
7. **自检**（同 glmod §1.1b-4）：链接后枚举活跃 uniform：活跃但没绑定就报错；绑定了但不活跃就警告一次（被 `#if` 剔掉是正常的）。goodGL `u1f` 那种名字写错就静默跳过的问题（L3882–3888）随之消失。
8. **几何 pass**：`Pass({ vs, attribs })` 同样模板化顶点着色器，VS 和 FS 共用一张 uniform 表（同名即同一个引用）。goodGL 的属性位置（`a_pos` 0、`a_uvl` 1……，L859–873）写进 `attribs`。

**goodGL 的 GLSL 怎么转**：
- 一个 program 一个 program 地转：删掉 `uniform … u_x;` 声明，把用到它的地方改成 `${() => F.x}`（每帧算出来的量）或 `${c_.Gl.it.x}`（可调参数）；同时删掉 `Renderer` 里对应的 `u1f / u3v / m4` 调用（共 172 处，约 96 个名字）。R5 本来就要重写"宿主 Env → 帧对象 F"，上传代码反正要动。
- 名字会从 `u_fogDensity` 变成 `fogDensity`，所以验收不比文本，比的是：每个 program 的 `shader-stats` 指令数和 spill 相同，`--ref` 下 0 px。
- **常量变参数不在这一步做**：把 L3170 的 `0.018` 这类常量提成 `${c_.Gl.it.pcssK}` 会改变生成的代码（失去常量折叠），算调优，单独提交。调好之后可以冻结成 `#define PCSS_K ${c_.Gl.it.pcssK}`（tier 3）。
- 参数表：rgl 的可调参数放进 `c_.Gl = gg.vars({…})`。宿主 A 没有 `gg`，所以 `rgl/vars.js` 先实现 panify §2 的 Ref 核心，以后并进公共库。bench 契约不变：`P` 就是这个 vars 对象（读写值照旧），`apply(k)` 等于再触发一次 `P.it[k].set(P[k])`，`panelSpec` 从各 Ref 的 `meta` 生成。

## 5. 风险

- **共享上下文的状态泄漏**：three 有状态缓存，goodGL 画完后必须 `resetState()`。goodGL 默认假设上下文是新的（`pixelStorei`、启用的 caps、绑定的 VAO），R2 在每帧开始时显式设一遍。
- **后处理 pass 的本机异常**：glmod §-1.B 测到"在 DDA pass 之后每多一个 RT pass，整帧 +5 ms"。goodGL 在场景之后有 6 个以上的 pass。R0 先确认这个现象在 gl 上是否存在（bench.md §6）。
- **uniform 分支**：goodGL 的画质开关全是 uniform（bench.md §6）。在 `shader-stats` 证明它们不占寄存器之前，不要拿"关掉某开关"的计时去做取舍。
- **显存**：RGBA16F 目标有 scene、gbuf、copy、comp、TAA×2、1/3 云、bloom 链，在 2.1 M 像素预算下大约 120 MB，另加 2048² 阴影图。不做 greedy，顶点数比 gls 多，R3 要量。
- **主线程**：`padded` 在主线程拷贝 18³；宿主光照要先完成（宿主 B 的 `ChunkManager` 本来就是 8 邻块都 LIT 才建网格，1331；宿主 A 是 `meshed` 之后才 `buildChunk`）。R3 记录每段耗时。
- **TAA 与确定性**：截图 0 px 的前提是机位冻结、抖动序号固定、历史帧数固定（bench.md §4）。

## 6. 数字（R0 / R3 / R7 填；按 §8.1-⑥ 写实现要点 / 结果表 / 未达成项及原因 / 对后续阶段的影响）

整帧墙钟是裁决指标，分 pass 计时只作参考（bench.md §6）。

| 场景 | 分辨率 | 视距 | goodGL 原版（去雾） | 宿主 A v2 | 宿主 A v2/gl（软阴影） | 宿主 A gl | 宿主 B gls | 宿主 B gl |
|---|---|---|---|---|---|---|---|---|
| plain | | | | | | | | |
| canopy | | | | | | | | |
| cave | | | | | | | | |
| water | | | | | | | | |
| uw | | | | | | | | |
| flora（bench.md §7） | | | | | | | | |

goodGL 原版的效果上界（每项单独关，ms / 占比）：

| 关掉的项 | plain | canopy | water |
|---|---|---|---|
| 阴影 | | | |
| 体积光 | | | |
| 云 | | | |
| TAA | | | |
| PBR | | | |
| POM | | | |
| bloom | | | |
