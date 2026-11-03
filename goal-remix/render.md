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

- **阴影**：用户在 v2 上的结论是"地形用软阴影，花草要精确阴影"。⚠ 用户 11-03 更正：这一条 **goodGL 没有做到**（它不在"三个缺点"里，是要加的功能，实现容易踩坑）。goodGL 的软阴影（PCSS）可以直接用，不需要 v2 那种低分辨率软阴影 pass；花草要另加一张锐图，按方块类别分流（bench.md §7、§4.2、步骤 R3b）。前一版写的"alpha-test + PCSS 已满足"是读码误判，原因见 bench.md §7。
- **不丢的东西**：renderer-refactor 的 bench、`--ref`、0 px 回归、分 pass 计时、`shader-stats`、经验条目，全部按 bench.md 的对照表带过来。"换成 WebGL2"其实不换 API 版本（宿主早已是 WebGL2），换的是 three 的抽象；受影响的只有读 three 对象的几处工具（bench.md §0）。

## 1. 取什么

| # | pass | 目标 / 格式 | goodGL 代码 |
|---|---|---|---|
| 0 | 天空视角 LUT（Rayleigh + Mie + 臭氧单次散射，加多次散射近似） | 192×108 RGBA16F | `skyLutFS` L2971–3018 |
| 1 | 阴影图：单级，正交 ±150（`shadowQ≥2`）/ ±100，深度 ±320，带畸变，polygon offset 1.2/2；cutout 做 alpha test。**rgl 加第二张锐图（花草，±64），软图里不再画花草**（R3b） | 2048² DEPTH24 + 比较模式（×2） | `shadowVS/FS` L2652–2681；原点对齐 L6238–6243 |
| 2 | 场景：全屏天空，然后不透明段 + 实体，**前向 PBR，MRT 输出** | sceneC RGBA16F + gbuf RGBA16F（八面体法线、粗糙度、ssrW）+ DEPTH24 纹理 | `skyFancyFS` L3021–3083、`chunkVS` L2325–2359、`fancyFS` L3454–3654 |
| 3 | 把颜色和深度拷一份 | copyC / copyD | L4126–4128 |
| 4 | 水 / 冰（不混合）：从拷贝里取折射、Beer 吸收、SSR、GGX 太阳高光、岸边和瀑布泡沫 | scene | `waterFS` → **换成 LiqPG 的光学，泡沫和水底纹路用 v2/gl 的版本**（water.md §0.1，用户 11-03） |
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
| R3b | **方块分类函数 + 花草锐阴影**：`rgl/blockclass.js`（§4.2）；mesher 补丁（花草面进独立 builder → 每段多一个 `plant` VAO，`// remix:` 登记 PATCHES.md）；锐图 pass + 接收端 `min(soft, sharp)`；`flags` 加一个类别位让花草接收端跳过锐图（防自阴影） | `flora` 机位（bench.md §7 的五条验收）；锐图 pass 单独计时和花草顶点占比写进 §6；`shader-stats` 记 `fancyFS` 变化（它多一次采样）；其余机位 `--ref` 对 R3 基线只允许花草周围有差 |
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
   - **Ref 就是 Tweakpane 绑定的 `(owner, key)`**（用户 11-03）：`${c_.Gl.it.softStr}` 对应 `c_.Gl` 这个对象的 `softStr` 键，即 `pane.addBinding(c_.Gl, 'softStr')` 的两个参数；嵌套表同理，`it` 挂在持有该键的那个对象上（`c_.Gl.ao.it.strength` ≡ `addBinding(c_.Gl.ao, 'strength')`）。所以 Ref 要能直接给出 `owner` 和 `key`：面板行、Pass 的 uniform 声明、`ref.set` 的副作用路由用的是同一个东西，不再有「路径字符串 → 解析」这一步。**写法已定（用户 11-03）：`it` 在 key 的前一级**（`c_.Gl.ao.it.strength`）；每个 pass 局部先取别名再用：`const ao = c_.Gl.ao.it` → `${ao.strength}`。不采用 panify §2 的 `o.it.ao.strength`。`it` 只认声明过的 key，拼错直接抛错（声明式）。
3. **名字**：Ref 用 `key`（`softStr`）；箭头函数用源码末尾的 `.xxx` 或裸标识符（`() => softStr` → `softStr`，`() => F.sunDir` → `sunDir`）；其余情况用 `u('名字', f)`。同一个 program 里名字相同时，如果是同一个 Ref、或箭头函数源码文本相同，就是同一个 uniform（所以同一个 uniform 可以在多处内联）；否则报错。
4. **类型取自默认值，声明自动前置**：第一次编译时求值一次来定类型：`number` → `float`（`meta.glsl: 'int'` 时为 `int`）；`boolean` → `bool`；长度 2/3/4 的数组 → `vec2/3/4`；长度 16 的 `Float32Array` → `mat4`；纹理看 rgl 的纹理构造函数打在对象上的 `glslType`（`sampler2D / sampler2DArray / sampler2DShadow / usampler3D`，WebGLTexture 本身看不出类型）。`uniform <类型> <名字>;` 插在源码头部的 `#version` 和 `precision` 行之后：`#version` 必须在第一行，v2/pass.js 直接把兜底宏拼在最前面（`head + src`），这在 goodGL 的源码上会编译失败。上传函数（`uniform1f / 3fv / Matrix4fv / 1i`）在编译时按类型选好，每帧只调用。开发模式下，某帧值的类型变了就报错（"类型稳定"）。
5. **宏**：`#if ${f}` 取数值（布尔转成 0/1）；`#ifdef ${f}` 按真假决定定义与否。只出现在 `#if` 里的宏，头部补 `#ifndef X / #define X 0`（同 glmod §1.1b-3）；只出现在 `#ifdef` 里的不补，否则它永远为真；同一个宏两种用法混用就报错。
6. **编译缓存**：program 以「源码 id + 所有宏的当前值」为键缓存。宏值变了才换 program，切回旧值直接命中缓存，不重编译。只有 `#` 行里的值会让缓存失效，uniform 怎么变都不影响。有 `KHR_parallel_shader_compile` 扩展时，新变体在后台编译，编好之前继续用旧的（对应 panify 的 `timeit:'gl_wtf'` 呼吸灯）。
7. **自检**（同 glmod §1.1b-4）：链接后枚举活跃 uniform：活跃但没绑定就报错；绑定了但不活跃就警告一次（被 `#if` 剔掉是正常的）。goodGL `u1f` 那种名字写错就静默跳过的问题（L3882–3888）随之消失。
8. **几何 pass**：`Pass({ vs, attribs })` 同样模板化顶点着色器，VS 和 FS 共用一张 uniform 表（同名即同一个引用）。goodGL 的属性位置（`a_pos` 0、`a_uvl` 1……，L859–873）写进 `attribs`。
9. **糖的判据是声明式**（用户 11-03）：`it` 代理、`#` 行宏、uniform 自动前置这些简化，实现上用 Proxy、模板标签甚至猴子补丁都行，但**必须做成声明式**：位置决定种类，名字、类型、默认值、`meta` 都在声明处一次给全，不靠运行时猜、不靠事后再登记。做不到声明式的地方不做糖，退回显式写法（`u('名字', ref)`、`#define X ${() => v}`）；半吊子的糖比没有更糟：fsdump 里看不出它是什么、面板和 bench 枚举不到、A/B 切不了。验收里的两条静态检查（正文里没有裸值、rgl 里没有 `u1f(` 一类调用）就是这条的底线。
10. **参照物：`ref/ripple-regl.js` 的 Pass 工厂**（用户 11-03）：`Pass({ tag, ...regl选项 })\`GLSL ${_ => C.bru} ...\`` 是 tagged template，`${}` 里的箭头函数按源码里的 `.xxx` 取 uniform 名（`_ => C.bru` → `bru`），在 `U` 表里登记，名字、类型声明、取值都在用处一次给全。我们的 `rgl/pass.js` 是它的加强版：位置决定种类（`#` 行 = 宏，其他 = uniform）、类型从默认值推（它靠手写 `uniform float` 前置）、编译缓存、链接后自检；**它的写法可以直接当第 1–4 条的验收样例**（声明式、一处写全）。

**goodGL 的 GLSL 怎么转**：
- 一个 program 一个 program 地转：删掉 `uniform … u_x;` 声明，把用到它的地方改成 `${() => F.x}`（每帧算出来的量）或 `${c_.Gl.it.x}`（可调参数）；同时删掉 `Renderer` 里对应的 `u1f / u3v / m4` 调用（共 172 处，约 96 个名字）。R5 本来就要重写"宿主 Env → 帧对象 F"，上传代码反正要动。
- 名字会从 `u_fogDensity` 变成 `fogDensity`，所以验收不比文本，比的是：每个 program 的 `shader-stats` 指令数和 spill 相同，`--ref` 下 0 px。
- **常量变参数不在这一步做**：把 L3170 的 `0.018` 这类常量提成 `${c_.Gl.it.pcssK}` 会改变生成的代码（失去常量折叠），算调优，单独提交。调好之后可以冻结成 `#define PCSS_K ${c_.Gl.it.pcssK}`（tier 3）。
- 参数表：rgl 的可调参数放进 `c_.Gl = gg.vars({…})`。宿主 A 没有 `gg`，所以 `rgl/vars.js` 先实现 panify §2 的 Ref 核心，以后并进公共库。bench 契约不变：`P` 就是这个 vars 对象（读写值照旧），`apply(k)` 等于再触发一次 `P.it[k].set(P[k])`，`panelSpec` 从各 Ref 的 `meta` 生成。

## 4.2 方块分类函数 `rgl/blockclass.js`

用户（11-03）：花草的精确阴影要靠分类，需要写几个函数区分透明方块、植被、树叶。

goodGL 里没有这组函数：类别散落在几张表里，调用点各自写死 id（`LEAVES` 只列 11 / 18 / 20 / 79；L633 `FOLIAGE[b] && b !== 30`；L738 `b !== 10 && b !== 17 && b !== 19`）。rgl 集中到一处。**输入一律是 gl id**（过了 GLID 的 LUT 之后），由 `SH` 的表在加载时一次性建出，不手抄 id 列表：

| 函数 | 定义（goodGL 表） | 用处 |
|---|---|---|
| `isOpaqueCube(id)` | `OCC[id] && RT[id] === RT_CUBE && MAT[id] === 0` | 软图、AO、遮挡 |
| `isLeaf(id)` | `LEAVES[id]` | 软图（cutout）、树叶的次表面散射和摇动 |
| `isPlant(id)` | `RT[id] ∈ {RT_CROSS, RT_CROP}`（草、花、树苗、小麦…）；**不含**树叶和仙人掌 | 锐图、不进软图 |
| `isGrass(id)` | `isPlant` 里的草：`short_grass`、`fern`、`dead_bush`、`wheat`（宿主 A 的 `TALL_GRASS` 映到第一个）；其余 CROSS / CROP（花、树苗、蘑菇、作物）一律算 `isFlower`，要改在表里改 | **接收端是草时跳过锐图（草不用自阴影）**；`isFlower` = `isPlant && !isGrass`：**花渲染自体阴影**（用户 11-03） |
| `isCutout(id)` | `MAT[id] === 1` | 阴影 pass 的 alpha test |
| `isTranslucent(id)` | `MAT[id] >= 2 && !isLiquid(id)` | 玻璃、冰：goodGL 现状是半透明网格不进阴影图，**不投影**；要不要改由人定 |
| `isLiquid(id)` | `MAT[id] === 2` | 水（换成 LiqPG 之后仍由它自己的 pass 画） |
| `shadowClass(id)` | `null` 不投影（空气、液体、半透明）/ `'soft'`（其余，含树叶和不透明整块）/ `'sharp'`（`isPlant`） | mesher 分流（R3b）；代码里没有再套一层数字 |
| `flagTable()` | 256 项 `Uint16`：草 = `8192`（`NO_SHARP`），其余 0 | 经 Worker 消息的 `cls` 进 `meshSection`，OR 进顶点 `flags` |

易踩的点：
- **`FOLIAGE` 位不等于 `isPlant`**：它在 `def()` 里是手写的 `foliage: true`（15 处），同时覆盖草和树叶；着色器里它只管漫反射的双面光照（`abs(NdotL)`）和法线偏置（0.02），和阴影分流无关。R3b 没用它，`isPlant` 直接按 `RT`。
- **宿主新增方块**（GLID 里 `'+'` 的 ADD 行，goodGL 没有对应 RT）：类别在 ADD 行里显式写 `cls`；缺省按宿主 `BlockDef` 的 opaque / cutout 推。门、梯子、雪层、火走 R6 的混合路径，**暂不投影**。
- **按 id 不按 meta**：双格高草的上下半、台阶、流体液位都是同一个类别。
- **宿主 A 的 `TALL_GRASS`** 等在 GLID 里映到 `short_grass`，类别随 gl id 走，不单独判。

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
| plain | 见下 | 6 | 25.2 | 21.0 | 17.6 | | | |
| canopy | 见下 | 6 | 28.3 | 18.3 | 13.3 | | | |
| cave | | | | | | | | |
| water | 见下 | 6 | 27.2 | 36.2 | 29.6 | | | |
| uw | | | | | | | | |
| flora（bench.md §7） | | | | | | | | |

goodGL 原版的效果上界（每项单独关，ms / 占比）：

| 关掉的项 | plain | canopy | water |
|---|---|---|---|
| 阴影（skip:shadow，只作上界） | −4.8 | −5.8 | −5.5 |
| 体积光 | −3.7 | −3.4 | −2.9 |
| 云 | −0.3 | −2.0 | −1.4 |
| TAA | −3.2 | −1.0 | −2.0 |
| PBR（含 SSR） | −2.9 | −2.1 | −1.9 |
| POM | −0.3 | −0.8 | −1.6 |
| bloom（skip:bloom，只作上界） | −1.3 | −1.0 | −1.1 |

### R1 vendor 抽取（已完成）

- **实现要点**：`node tools/vendor.mjs gl` 按 `goodGL.html` 里的 `// ==== xxx.js` 分段标记切成 `vendor/gl/*.js`（ESM，生成物，头部有 GENERATED 注释），不写死行号。供体文本原样搬运，只加 import / export。`--check` 重新生成并与磁盘逐字节比较；`--cdp` 载入 goodGL 页面 dump 运行时的 `GLSL`，与 `glsl.js` 逐字符比较。
  - `shared.js`：`SHARED_SRC` 函数体立即求值，导出 `SH`（主线程和 Worker 共用）。
  - `glsl.js`：`shaders / shaders2 / shaders3` 三段在 Node 里按原顺序求值（后面的覆盖前面的，含三处 `.replace` 补丁），输出求值后的 25 项。
  - `pool.js` + `worker.js`：`WorkerPool` 的 Blob Worker 换成模块 Worker，消息协议（init / gen / mesh）不变。
  - `mathx / textures / pbr / atmos / renderer`：原文 + 自动算出的 import（扫描时属性访问 `S.tex` 不算引用；用了但没出处的顶层名会报错）。
- **结果**：`--check` OK（10 个文件）；`--cdp` OK（GLSL 25 项与运行时逐字符相等）；各文件 `node --check` 通过；Node 里 `new SH.Generator(1).generate(0,0)` 出 65536 格、16221 非空。
- **未达成项**：Worker 和 `Renderer` 在浏览器里还没实际跑（R2 才接）；`Textures` 只验了能 import，没验像素。
- **对后续阶段的影响**：`renderer.js` 只依赖 `SH` 和 `GLSL`，`Textures / PBR / Atmos / M4` 由 `Game` 层传入，R2 的 `createRenderer` 要自己组装。供体改动（`CB / CT`、`62.0`、水）还没做；做的时候在 `vendor.mjs` 里加补丁表，`--check` 才能继续成立。

### R0 基线（已完成，2026-11-03）

- **实现要点**：`tools/frametime.mjs` 载入 `goodGL.html#auto&seed&rd`，`Game.manual` + `freezeTicks` + 晴天 + `Game.time` 钉死，`Game.dbg = {fog:0, mist:0}` 去雾；等 `world.pool.pendingCount` 连续 12 次为 0 再计时。口径同 bench-v2：N 帧连续 `Game.render`，最后读 1 像素同步，多组取中位数（默认 7 组 × 40 帧）；goodGL 没有 GPU 计时查询，只有墙钟。机位在已加载区域里按特征挑（plain = 树叶最少、起伏最小、无水；canopy = 树叶最密；water = 邻域水最多）。`--ablate` 逐项关；`shadowQ` 只改阴影范围（±150 / ±100），不是开关，所以「关阴影 / bloom」靠包一层 `gl.draw*` 丢掉往对应 FBO 的绘制，**只是上界**（下游仍读旧内容）。GPU：Intel RPL-S 核显（ANGLE / Mesa），无头 Chromium，种子 1，`rd 6`，`t 6000`。
- **结果**（墙钟 ms/帧，中位数；复现：`node tools/frametime.mjs [--size 1920x1080] [--ablate]`、`node tools/bench-v2.mjs --r v2/gl --set softShadow=1 --scale 1`）：

  | 口径 | 机位 | goodGL（去雾） | 宿主 A v2 | 宿主 A v2/gl（软阴影） |
  |---|---|---|---|---|
  | 各用各的默认：goodGL 1280×657（0.84 MP，未触顶）；v2 系 DDA ×0.8 = 1024×526 | plain / canopy / water | 25.2 / 28.3 / 27.2 | 21.0 / 18.3 / 36.2 | 17.6 / 13.3 / 29.6 |
  | 输出分辨率相同：1280×657 | plain / canopy / water | 25.2 / 28.3 / 27.2 | 未测 | 26.6 / 21.2 / 45.1 |
  | goodGL 2.1 MP 封顶档：1920×1080（2.07 MP） | plain / canopy / water | 51.1 / 57.6 / 57.9 | — | — |

  goodGL 每项单独关：阴影 −5 ms 左右、体积光 −3 ms 左右、TAA −1…−3、PBR −2…−3、bloom −1、云和 POM 在噪声之内（见上表）。基线约 25–28 ms，所以阴影 + 体积光 + TAA + PBR 加起来约占 12–15 ms，其余是场景 / 天空 / 合成 / final 的固定成本。分辨率翻 2.5 倍（0.84 → 2.07 MP）耗时翻约 2 倍（25→51），基本是像素受限。
- **未达成项及原因**：
  - **宿主 A 的 `v2` 没测同分辨率档**（bench-v2 的 `--r v2` 默认 ×0.8，要补一次 `--scale 1`）。
  - **没有同一世界、同一机位的对比**：goodGL 的世界和宿主 A 不同，出生点在山地森林（y≈154，树叶占顶层 45%），机位只是「特征相近」。严格对比要等 R3 的 `?r=gl`（bench.md §8）。
  - **测量噪声大**：核显和桌面上正在跑的 Chrome / Electron 共用，同一配置第一次整套是 60–80 ms，之后稳定在 25–31 ms；单次运行内部组间离散常达 20–40%。表里的数字是在 GPU 没被占用的几次里取的，差 ±2 ms 以内的项（云、POM、shadowQ）不能当真。工具会在组间离散 > 30% 时警告。
- **和用户实测的关系**：用户的结论是「去雾的 goodGL 几乎全面好过 v2/gl，也更快」。这里**没有完全复现**：同分辨率（1280×657）下，goodGL 在 plain 与 v2/gl 持平（25 vs 27），water 明显更快（27 vs 45），但 canopy 反而慢（28 vs 21）；按各自默认分辨率，v2/gl 在 plain / canopy 更快（DDA 少渲染 36% 的像素）。可能的解释：① 机位和世界不同（goodGL 的 canopy 是山地密林，几何和半透明树叶多）；② 用户机器、全屏和 vsync 的条件不同；③ 用户说的「更快」可能含加载和流式生成（goodGL 在 Worker 里生成、网格化），这里只测稳定后的单帧。**不能据此推翻移植的决定**（画质、阴影、PBR 的收益不变），但「goodGL 稳定帧更快」这一条要等 R3 的同世界对比才算数。
- **对后续阶段的影响**：① R3 的对比要用同一世界，并把 `--ref` 之外再加一条「GPU 被占用」的检测（同 URL 前后各测一次，差 > 30% 就重测）。② 阴影（−5 ms）和体积光（−3 ms）是 goodGL 里最大的两块可调成本，R7 的 PCSS 参数和 `vel` 预设要先对着这两项量。③ 2.1 MP 档 ≈ 51 ms，宿主默认 `maxMP 7.6` 在这块核显上不可用，`scale / maxMP` 的默认值要按显卡档位给，不能照搬 v2。

### R0b bench 契约与工具泛化（已完成，2026-11-03）

- **实现要点**：契约成员按 bench.md §2 补进 `v2/gl.js`：`readOut()`（最终画面的 RGBA8 读回）、`programs`（`{ post, comp }` 各含 `vs / fs / defines`）、`pending`（= 距离场未回包数）、`perf.passes`。`v2.js` 是单文件原版，不动：工具对没有这些成员的渲染器退回旧路径（`ddaRT`、`post / comp`、`df.pending`）。
  - `tools/bench-v2.mjs`：`name.startsWith('v2')` 换成检查 `perf / setDebug / D`；DDA 专属测量（DBG 1/2/4/5/6 五次 grab、`compIso`、DF 未算槽位、平滑光照占比）只在有 `VR.df` 且没加 `--generic` 时跑；`timeFrames` 按 `perf.passes` 采样；`grab` 走 `readOut`；新增 `--generic`：按 `perf.passes` 生成表头的通用表（rgl 走这条）。
  - `tools/fsdump.mjs`：读 `programs`，没有就退回 `post / comp`；文件名按程序名（`post.glsl / comp.glsl` 不变），`--vs` 另写顶点着色器。
  - `tools/verify-renderer.mjs`：`startsWith('v2')` 换成 `VR.df`；「逐个阴影模式」的条件换成 `P.softShadow` 是否存在。`gl` 组等 R2 有渲染器后再加（R0b 没有 rgl，验收只要求三组）。
- **结果**（改前 / 改后各跑一次，同命令；改前先 `--save`）：
  - `bench-v2 --r v2` 与 `--r v2/gl`（plain / canopy / cave / water）：**`--cmp` 全部 0 px**；确定性列（分辨率、主射线迭代、阴影迭代、耗尽、fetch、tex、列跳 / 砖 / 体素、DF、云步）逐字相同。「平滑光照占比」不在其内：它是 `(dda − dda 跳过光照) / dda`，由两次计时相减得到，本来就有噪声（改前 / 改后同一机位出现过 9.2% vs −15.6%）。
  - `fsdump`：`v2/gl` 和 `v2` 两个目录与改前 `diff -r` 无差异（逐字节相同）。
  - `verify-renderer`：186 项 PASS、0 FAIL，与改前相同（唯一的文本差异是 `VR.stats()` 字符串里的毫秒数）。
  - `--generic` 在 v2/gl 上能出通用表（列 = `perf.passes` + 合计 + 墙钟），plain 与基线 0 px。
- **发现 / 未达成项**：`--generic` 的 v2/gl `water` 机位与基线差了 3983 px（max Δ106），但通用路径自己连跑两次是 0 px。当时的判断是「帧历史不同（标准路径多跑了 `compIso` 和五次调试视图 `grab`）」。**R2 更正：这个判断不对。**R2 给非 DDA 路径加了规范帧序列（`resetLag` + 固定 16 帧）后重测，差异仍然是**同样的 3983 px、max Δ106**，一个像素没变：它不随帧数变，是确定性的状态差异。候选是标准路径读回前跑过的 DDA 调试视图 / `compIso` 改了某个只有它们会碰的状态，最可疑的是 v2/gl 的读回路径（`ddaOut / resolveSoft`，「只在被读时画」）。只影响 `water` 机位，没有继续查，不影响 R0b 验收（标准路径与基线 0 px）。
- **对后续阶段的影响**：① rgl 的 bench 要有固定的规范帧序列（`resetLag` → 固定帧数 → 读回），`--save` 和 `--cmp` 用同一条（R2 已落实，见下；对带 TAA 的 gl 它确实是必须的）；② `gl` 的结构步骤（R1、R3、R5、R7）验收「0 px」时要先用同一条序列自比一次；③ 通用表的 pass 列由渲染器的 `perf.passes` 决定，rgl 的名字用 render.md §1 的 pass 列表。

### R2 空帧（已完成，2026-11-03）

- **实现要点**：`?r=gl` 载入 `rgl/index.js`，用 `vendor/gl` 的 `Renderer` 在 three 的画布上跑 goodGL 整条管线，**零几何**（`F.visible = []`、`dyn.n = 0`）：天空 LUT、阴影（空）、天空、复制、水（空）、体积云、合成、TAA、bloom、final。宿主随后用 three 画 HUD，`VoxelCraft.html` 的主循环没动。
  - `rgl/frame.js`：`Game.render`（L6142–6300）fancy 路径的逐行搬运（保留行号注释），宿主输入作为参数；差异都标了 `// remix:`（宿主相机的 up、无世界时 `eyeSky = 1`、`aurora` 取常量、REF 口子）。R5 再整理成 `xlate.frame`。
  - `rgl/index.js`：**共享上下文**：`new Renderer(canvas)` 里的 `getContext('webgl2', …)` 拿到 three 已建好的上下文（实测 `antialias:false`、`samples 0`）；每帧开头 `resetGLState` 显式设一遍 goodGL 依赖的状态，画完 `renderer.resetState()`；`Renderer` 子类只为记下每个 program 的源码（16 个，`programs` / fsdump 用）；`mk()` 编译或链接失败会抛异常 → 宿主回落 v1。
  - **分 pass 计时**：goodGL 没有逐 pass 钩子，所以在 `renderFancy` 期间临时包一层 `gl.bindFramebuffer`，按目标 FBO 切段（lut / shadow / scene / water / cloud / comp / taa / bloom / final），之后删掉。踩过的坑：必须等上一组查询读完再开始下一组（GPU 结果晚一两帧才可用，每帧都覆盖就永远读不到，`frame` 只推进过 2 次）；现在隔约 3 帧采一组。
  - 宿主侧：`VoxelCraft.html` 的渲染器白名单改成表（`RENDERERS`，加 `gl: './rgl/index.js'`）；`RCTX` 加惰性 `get worldTime`；`voxelCraftEnv` 加 `dayTime`（= `worldTime`，0 = 06:00 = goodGL 的 tick 0）；`goal-renderapi.ts` 的 `Env` 加 `dayTime?`。
  - 契约：`readOut`（读默认帧缓冲，要在 `render()` 的同一任务里读）、`programs`、`pending`、`resetLag`（TAA 序号 / 历史 / 曝光 / 环境光缓存归零）、`setRef`（TAA 关、曝光每帧取目标值）、`D.time / D.cloudX` 钉点、`perf.passes`。`setDebug` 只记下，DBG 宏还没接（bench.md §5）；`P` 只列已接上的项，`fog / mist` 默认 0（去雾版）；`scale / maxMP` 等 R5 接上 `vars.js` 再加。
  - 工具：verify 加 `gl` 组（`--only` 可单跑）；`bench-v2` 的 `grab` 对非 DDA 渲染器走规范序列（`resetLag` + 同步固定 16 帧），`med` 容忍渲染器没有的 pass。
- **结果**：
  - `verify-renderer` 全量 **229 项全 PASS、0 FAIL**（含 `gl` 组 ：契约成员、读回尺寸、不是单色（471 种颜色）、无 GL 错误、`resetLag` 后同序列两次读回 0 px、three 在 goodGL 之后还能画、REF 模式重复 0 px、宿主主循环下无 GL 错误）。
  - 回归：`bench-v2 --r v2` 与 `--r v2/gl` 对 R0b 基线 **`--cmp` 全部 0 px**；`fsdump v2/gl` 与 R0b 逐字节相同。
  - `bench-v2 --r gl`（4 机位，`--save` → `--cmp`）：**0 px**。未加规范序列时是 ±1（plain 36315 px，其余 < 60 px）：来源是读回前的帧数随 `timeFrames` 采样了多少宿主帧而变，TAA 抖动序号 8 帧一循环，相位跟着变。
  - `fsdump gl --vs` 导出 16 个程序（`fancy / water / skyF / comp / final / taa / clouds …`）的片元和顶点着色器。
- **整帧墙钟（空帧，Intel RPL-S 核显，1280×657）**：gl 在宿主 A 的 4 个机位 43–70 ms（plain 52、canopy 51、cave 50、water 53，各机位差异不大；一次较吵的运行到过 72）；分 pass：scene 8–13、cloud 7–10、comp 12–22、taa 10–15、其余 < 1。**比 R0 里 goodGL 带地形的 25–28 ms 还慢，原因不是共享上下文**：同一内容的 A/B（相机抬到 y=200、仰视 0.3，全是天空）——rgl 50.7 ms（min 44.4）对 goodGL 原版 46.0 ms（min 44.9），基本一致。也就是说**全天空的帧本身就最贵**（云、体积光、合成对天空像素更重；地形像素不用走这一套），空帧是这条管线的最坏情形，不能拿它和 R0 的带地形数字比。
- **未达成项**：没有区块 / 实体 / 手 / 天气粒子（R3 / R4）：宿主的 three 场景在 `?r=gl` 下完全不画（生物、粒子、选框、手持物暂时看不到，HUD 照常）；`water` 与 `underwater` 恒为假（`Env` 还没接水下通知，R5）；`scale / maxMP` 没接（final 直接写默认帧缓冲，内部目标 = 绘制缓冲大小）；`setDebug` 的 DBG 宏没接；goodGL 的 `renderFancy` 里 `F.visible` 为空所以 `cull` 还没用上。
- **对后续阶段的影响**：① R3 一接上区块，第一件事是用同机位重测整帧墙钟，和 R0 的 goodGL 原版（带地形）对比才是严格的；② 云 / comp / taa 三项合计占空帧的 70% 以上，R7 的优化顺序应该先看它们在**天空占比高的机位**上的成本（体积云 16+3 步在 1/3 分辨率，comp 的体积光 14 次采样在全分辨率）；③ 规范帧序列是 gl 的结构验收（R3、R5、R7 的 0 px）的前提，`--save` 与 `--cmp` 必须走同一条；④ 宿主 B 接入时 `dayTime` 要由适配器给（`Sky.time / 24000`）。

### R3 区块（宿主 A）（已完成，2026-11-03）

- **实现要点**：宿主 A 的区块经 `padded → Worker 网格化 → 段缓冲 → 视锥剔除` 画出来，用 goodGL 自己的程序化贴图和 PBR。
  - `rgl/xlate.js`：`GLID_A`（宿主 `B.*` 26 个 → goodGL 方块名，按键名查）、`idLUT`（256 项，表外 id 当石头）、`padded`（宿主 `blocks[(lx*16+lz)*H+y]`、`sky / blk` 两个数组 → goodGL 18³，`p = (y+1)*324 + (z+1)*18 + (x+1)`，光照打成 `sky<<4|blk`；邻块缺失 = 石头 + 无光，`y<0` 基岩，`y≥H` 空气 + 满天空光，规则同 goodGL `buildPadded`）、`sectionHasBlocks`。
  - `rgl/world.js`：区块记录、脏段、Worker 调度、上传。宿主 A 只发「某区块 blocks 变了 / 没了」，所以：新区块 = 自己 + 8 个邻居的段脏；重建 = 自己 + 4 个边邻居；一个区块的 3×3 邻居都有了才网格化（同 goodGL 的 `neighborsAtLeast`，否则初始加载每块要被重做好几遍）；每帧按离相机距离、最多 `P.meshJobs`（6）个；回包带版本号，过期的丢弃；`pending()` = 在途 + 已可提交的脏段（环边缘邻居永远不全的区块不算）。
  - tint：宿主 A 没有群系，整块用平原的草 / 叶色常量（0x91bd59 / 0x77ab2f，256 列 × RGB）。第一版我把数组填成了 `140`，三个通道相同 = 灰色，草和树叶是灰的，已改。
  - `tools/vendor.mjs`：renderer.js 里 `cull` 用到 `ST_LIT`，它在 world.js 里和另外两个名字写在同一行（`const ST_TERRAIN = 1, ST_DECOR = 2, ST_LIT = 3`），顶层扫描只认第一个名字，所以 R1 没发现它缺出处，到 R3 才在运行时暴露。现在 vendor.mjs 有一张 `CONSTS` 表，自动给用到它们的模块加前导声明。
- **结果**：
  - `verify-renderer` 全量 **230 项全 PASS、0 FAIL**；`gl` 组新增「放置方块后画面改变（网格化 + 上传生效）」「移除后画面恢复到放置前 0 px」（在相机前 4 格放 5×5×5 石头，等 `pending() == 0`）。
  - `bench-v2 --r gl`（plain / canopy / cave / water）`--save → --cmp`：**0 px**。
  - `vendor.mjs gl --check` OK。
  - 冒烟（出生点附近）：137 个区块、120 段、62620 个四边形；水面（折射 / 泡沫 / 反射）、阴影、PBR、树叶镂空、云都正确；截图见 `/tmp/r2/gl.png`。
- **整帧墙钟**（宿主 A，1280×657，Intel RPL-S 核显，`bench-v2 --r gl`，单次运行；用户 11-03 要求 bench 脚本开头自动清残留无头 Chromium，已加 `killStray`，并让 `launch` 的 Chromium 自成进程组、`close()` 杀整组）：

  | 机位 | shadow | scene | water | cloud | comp | taa | 其余 | gpu 合计 | **墙钟/帧** | 同分辨率 v2/gl（R0） |
  |---|---|---|---|---|---|---|---|---|---|---|
  | plain | 13.9 | 26.2 | 4.4 | 2.0 | 10.1 | 8.1 | 2.4 | 71.4 | **65.3** | 26.6 |
  | canopy | 5.3 | 15.5 | 0.1 | 2.5 | 4.3 | 2.2 | 1.1 | 31.6 | **33.9** | 21.2 |
  | cave | 3.0 | 10.7 | 0.1 | 1.6 | 4.3 | 2.2 | 1.1 | 23.8 | **25.2** | 未测 |
  | water | 3.6 | 8.7 | 11.1 | 1.5 | 4.5 | 2.2 | 1.1 | 33.4 | **36.0** | 45.1 |

  ⚠ **plain 一行（65.3 ms）在 R3b 时无法复现**：同一会话里 R3b 前的版本（`git checkout-index` 导出的暂存区）重测 plain 27.2 ms、canopy 32.7 ms，R3b 后 26.3 / 33.1（见 R3b 记录）。R3 表里的 plain 71.4 gpu 应是那次运行的异常（原因没查清，单次运行、当时没有留 `--json`）。下面「plain 最差」的推论和「先量顶点占比」的待办**撤回**，canopy / cave / water 三行同一天内未重测，按原样保留。

  gl 比 v2/gl：plain 慢 2.5 倍、canopy 慢 1.6 倍、water 快 20%（plain 一项作废，见上）。plain 最差：远景大量地形，shadow 13.9 + scene 26.2 占一半以上（goodGL 不做 greedy，每个可见面一个四边形，见 §1 网格器；`world.stat()` 给出 120 段 / 62620 四边形是出生点冒烟的数）。R0 里 goodGL 原版（带地形，另一个世界）是 25–28 ms，所以 plain 的 65 ms 比它高很多，**不能直接归因为世界不同**：下一步先量 plain 的顶点阶段占比（DBG 2 的下界加顶点数，bench.md §6 第 1 行）再决定做不做 greedy / 预深度。
- **未达成项**：
  - ~~整帧墙钟被残留进程污染~~ 已重测，见上面的「整帧墙钟」。
  - 宿主 A 的 `TNT` / `GOLD_BLOCK` 是**暂代**（红砖 / 黄色陶瓦）：goodGL 没有这两个方块，ADD 行要给 `SH` 加方块定义和贴图，属于供体补丁（`// remix:`），R3 没做。
  - 实体、手、天气粒子（R4）；宿主 A 水面高度：goodGL 的水按 meta 算液面（meta 0 = 8/9 格高），宿主 A 的水没有 meta，所以水面比宿主自己的低约 1/9 格。
  - `Env` 水下通知（R5）、`scale / maxMP`、DBG 宏仍未接。
- **对后续阶段的影响**：① R3 的「与 `?r=v2/gl` 同机位并排交人看」要人看一眼截图（`bench-v2 --shots`）；② 第一个可信的整帧墙钟必须在没有残留 Chromium 的干净环境里测，并和 R0 的 goodGL 原版对比；③ 花草锐阴影（R3b）和分类函数（§4.2）现在可以开工：区块已经在 `rgl/world.js` 里分段，mesher 补丁的落点就是 `meshSection` 的输出分流。

### R3b 花草锐阴影（已完成，2026-11-03）

- **实现要点**：
  - **PATCHES 机制落地**：`tools/vendor.mjs` 新增按文件 / GLSL 键的替换表，原文必须恰好出现一次，否则构建失败；补丁处都带 `// remix:`；`--cdp` 比较的是未打补丁的 GLSL 原文（补丁后的 `glsl.js` 按设计与运行时不同）。补丁清单在 vendor.mjs 的 `PATCH_FILES` / `GLSL.fancyFS` 段（`vendor/PATCHES.md` 还没单独建，等 R5 补丁变多再拆）。
  - **mesher**：`meshSection(..., OB, TB, PB, CLS)`：`RT_CROSS / RT_CROP` 的面写进 `PB`（其余进 `OB / TB`）；`CLS[id]` OR 进顶点 `flags`。返回值多 `plant / pn`；Worker 和主线程回退路径都带 `PB`；`cls` 随每个网格任务发（256 项 Uint16，数据量可忽略）。
  - **renderer**：每段多一个 `plant` VAO（`uploadSection / freeChunk / cull / renderFancy` 的 scene pass 都认它）；软阴影 pass 只画 `opaque`，所以**花草不再进软图**；新增 `shadowS` 程序（`shadowVS` 去掉 `df` 畸变）和 `sharpFBO`（2048² DEPTH24 + 比较采样器，clamp）；锐图 pass 画 `plant`，同一光向、同一原点（`shadowOrigin` / `camToShadow` 共用），正交 ±`sharpDist`（默认 64，每格 16 texel，正好等于 16 px 贴图密度）。
  - **fancyFS**：`sharpAt()` 一次比较（硬件 2×2 PCF，没有遮挡物搜索，所以细草叶不漏）；`sh = min(sh, mix(sharpAt(wp + L·0.04), 1, smoothstep(0.85·D, D, d)))`，`(v_flags & 8192)`（草）跳过，花照常读（含自己的，靠 polygon offset 1.2/2 + 沿光向 0.04 格的偏移，目测无条纹）；超过 `sharpDist` 在最后 15% 平滑过渡到 1。
  - `rgl/blockclass.js`（§4.2）：函数集合 + `flagTable()`；`P.sharpDist`（0 = 关接收，pass 本身仍画）。
- **结果**：
  - 同机位开 / 关对比（`/tmp/r2/flora.mjs`，机位挑在空旷地上，低太阳）：关时花下没有影子，开时地面上出现花的剪影形影子，花瓣本身没有条纹（看了一张截图）。草不带自阴影这一条**没验证**：草那张机位贴脸、没有可比的草丛，要换机位重拍。截图 `/tmp/r2/flora-{flower,flower-off,grass,grass-off}.png`。**第 5 条（4 倍放大看影子边缘 ≤ 1 贴图像素、草摇动时影子同步、`sharpDist` 处无硬切边）还没做，要人看**。
  - `verify-renderer --only gl` 全 PASS（含 0 px 重复、REF 0 px、放置 / 移除、无 GL 错误）；`vendor.mjs gl --check` OK。
  - 成本（`bench-v2 --r gl --generic`，同一会话 A/B：R3b 前 = 暂存区导出）：

    | 机位 | shadow（前 → 后） | scene | 墙钟/帧（前 → 后） |
    |---|---|---|---|
    | plain | 4.37 → 4.51 | 9.94 → 10.25 | 27.2 → 26.3 |
    | canopy | 5.26 → 5.38 | 15.54 → 16.07 | 32.7 → 33.1 |

    锐图 pass + 接收端的代价在噪声量级以内（≤ +0.5 ms gpu）。`sharpDist=0`（pass 画但不接收）对 `64` 的差也在噪声内，说明成本主要在 pass 本身 + 多一个 VAO 的 draw。**花草顶点占比、`shader-stats` 的 `fancyFS` 前后对比没记**（成本小到不影响决策，留给 R7 做宏化时一起量）。
- **未达成项**：
  - 验收 ①④⑤ 要人看（边缘宽度、摇动同步、`sharpDist` 边界）；② 细草叶不闪：没验证（没看连续帧，也没做逐帧差分）。
  - **近地面黑底白斑块状噪点（R3b 前后同机位截图逐像素一样，与 R3b 无关）**：用户 11-03 说明这是已知问题，和特定方块类型 / 树干有关，或出现在网格器还没更新的短暂间隔。我对 **`flora` 脚本里复现的那一张**的二分结果：白斑 = 透出的天空（几何缺失），不是着色噪点；关 POM / PBR / TAA / 体积光 / 云 / 阴影、跳过 trans / plant、关视锥剔除，亮斑数都不变（37441 ± 30）；原因是脚本把相机放在 `目标 y + 1.6`，而该处地面更高，相机落在 (7,48,4) 的草方块**内部**，背面剔除透出方块内侧。相机抬到 y 50.6 后降到 92 px。所以**这一张是测试机位错误，不是渲染器 bug**；用户说的那个游戏内已知问题（树干 / 网格器间隔）是另一回事，我没复现、没验证。`flora.mjs` 要补一项「相机点所在方块必须是空气」。
  - 体积光（compositeFS）只读软图，花草不挡光柱，按设计。
- **对后续阶段的影响**：① 补丁机制可用，R5 的 `pass.js` 生成 GLSL 时沿用 `once()` 的「必须恰好一次」规则；② R4 的实体走 `dyn` 缓冲，不经 `meshSection`，其 `flags` 没有 8192，会接收锐图（符合预期：实体不是草）；③ 水（步骤 9）的 `waterFS` 没接锐图，花草影子不落在水面；要接的话 `setFancyUniforms` 已经绑好 `u_sharp`（TEXTURE9），只需要 `waterFS` 里照抄 `sharpAt`。

**R3b 补充（用户 11-03 反馈）**
- **花的立体感**：花瓣是贴图平面，自阴影只能落在另一片十字面上，立体感先天不足。补丁：`CLS` 给花加位 `16384`（`blockclass.FLOWER`），`fancyFS` 里 `fh = mix(0.55, 1, smoothstep(0, 0.75, 1 - v_uv.y))`，直射光乘 `fh`、环境遮蔽乘 `mix(0.5, 1, fh)`：花瓣受光足、茎和叶根偏暗；非花 `fh = 1`，与原版一致。同机位截图里黄花 / 红花从花瓣到茎有明暗梯度，地面影子仍在；**是否"够立体"要人看**（强度 0.55 / 0.5 是我定的，可调）。
- **草花影子 LOD（walk / fly）**：`Env.flying`（宿主 A = `player.fly || player.noclip`，`goal-renderapi.ts` 已加可选字段）。walk：`P.sharpDist = 48`（比之前 64 更密，约 21 texel/格）；fly：`P.sharpFly = 0`，`sharpDist < 1` 时**整个锐图 pass 不画**、接收端也关。两者之间按 ~0.3 s 缓动，切换不跳变。验证了：`Env.flying` 随 `player.fly` 翻转、walk→fly→walk 无 GL 错误；fly 时锐图 pass 省了多少 ms **没量**（计时被平滑，差异在噪声内）。
- 验证：`verify-renderer --only gl` 全 PASS，`vendor.mjs --check` OK。

**R3b 补充 2（用户 11-03：影子太像方块，antialias 没调好）**
- 原因：锐图接收端是单 tap（只有硬件 2×2 PCF），影子边缘 = 像素画 alpha 剪影 × 阴影图 texel（walk 时约 21 texel/格），台阶感明显。
- 改：`sharpAt` 改成 8 tap 圆盘（每 tap 仍是硬件 PCF），IGN 逐像素旋转，TAA 积分；半径 `P.sharpSoft`（texel，默认 **0.8**，0 = 回到单 tap）。同机位低太阳对比：0 → 台阶感；0.7 → 边缘平滑、细茎影子还在；**1.5 / 2.5 把细茎的影子稀释到几乎看不见**（它只有 1–2 texel 宽），所以不取。默认 0.8 是我看了 0 / 0.7 / 1.0 / 1.5 / 2.5 的截图挑的，**要人对着自己的机位再确认**；花瓣大块影子（用户截图里的那种）我这次机位里没有，没直接验证。
- 「花有很强折纸感」：我读成对现状的认可（两片十字面一亮一暗），**没改花的着色**；如果其实是嫌弃，告诉我，`fh` 的 0.55 / 0.5 两个系数在 vendor.mjs 里。

**R3b 补充 3（用户 11-03：折纸感 = 花自阴影要开大、顶部 30% 总有阴影；部分花顶部回环到底部）**
- **回环 bug**：植物的 UV 在贴图边上取到恰好 1.0，贴图是 `REPEAT`，`fract(1.0) = 0` 就取到了顶行 → 花瓣像素出现在底边。补丁：`fancyFS` 和 `shadowFS`（alpha test 同理）里对植物把 `uv.xy` 夹到 `[0.002, 0.998]`。只对带 8192 / 16384 位的方块生效。**这是供体自带的 bug（goodGL 原版同样会）**。
- **折纸感**：我上一版方向反了（顶亮底暗）。现在 `fh = 1 − 0.8·smoothstep(0.35, 0.6, 1 − v)`：花头段压暗到 0.2。⚠ 「顶 30%」不是按几何，是按贴图：花头画在贴图 ~40%–85% 的高度，不是整张图的最上 30%，所以阈值是实测的（0.55–0.8 完全没效果）。`fh` 同时乘直射、环境遮蔽和**透射项**（逆光时它才是花瓣亮度的主要来源，最初漏了这一项）。
- 自阴影：花接收锐图的偏置从 0.04 降到 0.012 格，让花瓣更容易落影在茎和另一片十字面上。
- 验证：同机位（逆光）截图里花头由亮黄变成带橙的暗面，两片十字面能分出来；回环：底边没有花瓣像素了。**没做左右 / 正光向对比，也没量化**；系数（0.8 / 0.35–0.6 / 0.012）是我目测挑的，在 vendor.mjs 里。

**R3b 补充 4（用户 11-03：花贴图随时间向上飘，直到变成绿杆子）**
- **原因是我的笔误**：`blockclass.js` 里 `FLOWER` 常量被写成了 `19384`（应为 `16384`）。多出来的位里有 `256`——着色器里「岩浆 UV 滚动」的标志（`uv.y += u_time * 0.02`），所以花的贴图随时间上移，花头滑出画面、只剩茎。补充 3 的截图是固定时间（`D.time = 10`）拍的，**看不出任何随时间变化的问题**，这是验证漏洞。
- 修：改回 `16384`；`flagTable()` 加了**位冲突断言**（额外位不得与供体 `FLAGS` 重叠、`NO_SHARP / FLOWER` 必须是 8192 / 16384），写错常量会在建表时直接抛错，不会再静默画错。
- 验证：同机位在 `D.time = 10 / 300 / 1000` 三个时间点拍，修前花头逐步上移直到只剩茎（t=300、t=1000 两张），修后三个时间点位置一致。`verify-renderer --only gl` 全 PASS。
- 教训：涉及着色器 flags 位的改动，验证要包含「时间推进」这一维；`flora.mjs` 现在默认拍三个时间点。


### R4 实体合成 spike（方案 B）记录
- **做法**：`rgl/index.js` 的 `drawThree()`：`renderFancy`（含 final）之后，用 `depthOut` 全屏 pass 把 goodGL 的 `sceneD` 还原成线性视深、按宿主相机 near/far 重映射，只写深度（colorMask 关）进默认帧缓冲；然后 `renderer.render(scene, camera)`（autoClear 已关）画实体、掉落物、粒子、选框、裂纹。`sky / sun / moon / stars / clouds` 每帧隐藏（RCTX 新增 `sky, sun, moon`）。手仍由宿主 hudScene 在 `VR.render()` 之后画，无需改。
- **验证（人眼）**：花旁的猪被地形遮挡正确；石块挡住的第二只猪只露出探出的部分；选框线框与花、地形深度关系正确；无 TAA 拖影（实体不进 TAA）。截图脚本 `/tmp/r2/ent.mjs`（未入库）。
- **代价**：多一个全屏深度 pass（计时落在 `final` 段内）；实体不走 tonemap / bloom / 阴影（`MeshBasicMaterial` 原色，不受昼夜光照，夜里会偏亮）——这是 B 的固有缺点，A 方案（实体画进 `sceneRT` 再合成）才能解决。**待人挑：B 够用，还是上 A。**

### 备忘：天空 / 雾 / 云隙光（用户意图，待 R5 / R7 / v2/gl 移植时落实）
- **问题不在「有没有天空」**：`?r=gl` 的天空是 goodGL 自己的，但相对 goodGL 的体积雾 + 云隙光（`volumetric`）显得简陋，晨间雾与天空不搭，出戏风险大。
- **计划**：goodGL 的夜空版本要进 v2/gl 的 Tweak，配合 Bliss 云做成一个选项；移植时雾（`fog / mist`）和云隙光（`volumetric`）各给一个面板文件夹（Tweakpane，`it` Refs），不再只是 `P` 里的裸参数。
- **对 R5 / R7 的约束**：`pass.js / vars.js` 里这些量要按「面板文件夹」成组声明（雾、云隙光、夜空 / 云风格），而不是散落的 uniform；`fog / mist` 默认仍为 0（去雾版）。

### R5 进度记录（第 1 段：基础设施 + skyLut 试点）
- **`rgl/vars.js`**：Ref 核心（`it` 在 key 的前一级，见 §4.1 第 2 条；`tools/test-vars.mjs`）。
- **`rgl/pass.js`**：`createPassKit(gl, { dev }).Pass({ vs?, attribs?, tag })\`…\``：位置决定种类（`#` 行 = 宏，其他 = uniform）、名字取 Ref key / 箭头函数末尾标识符 / `u('名字', f)`、类型取自默认值并自动前置声明（插在 `#version` / `precision` 之后）、`#if / #ifdef / #ifndef / #define` 的宏值进编译缓存键（切回旧值不新增变体）、链接后自检（活跃未绑定 → 抛错；绑定未活跃 → 开发模式警告一次）、正文裸值抛错、VS / FS 共用 uniform 表、采样器按声明顺序占纹理单元。`dev` 开关（`?passdev`）打开「类型稳定」检查。纯函数部分 `tools/test-pass.mjs`（node），GL 部分 `tools/test-pass-gl.mjs`（无头 Chromium：缓存命中、类型变化抛错、裸值抛错、活跃未绑定抛错）。**尚未做**：`KHR_parallel_shader_compile` 后台编译（宏切换现在同步编译）。
- **试点 `skyLut`**：`rgl/shaders/skylut.js`（GLSL 一字不改，只有 `u_xxx` → 用处内联的 `${() => F.xxx}`；`rain` 因 `F.rain || 0` 用 `u('rain', …)`）；vendor 的 `renderer.js` 两处补丁（删 `mk('skyLut')`，`use + 6 个上传` → `this.passes.skyLut.use()`）；`rgl/frameref.js` 提供 `F` 句柄（`render()` 每帧 `setFrame(F)`）。
- **验证**：`bench-v2 --r gl --ref` 四机位（plain / canopy / cave / water）转换前后 0 px 差（基线两次重复也是 0 px）；`?passdev` 下无警告、无错误；`R.programs.skyLut` 能导出带自动声明的源码。**shader-stats 未单独对（skyLut 太小进不了「最大几个」榜单）**。
- **bench 修正**：`tools/bench-v2.mjs` 之前 `--ref` 的 plain 机位两次相差 4521 px —— 不是渲染不确定，而是 R4 之后 three 画的生物进了画面、随机刷怪；现在 settle 之后把 `g.mobs.push` 置空，四机位重复 0 px。（教训：`| tail -0` 会让 node 因 EPIPE 提前死，别用。）
- **verify**：静态检查新增「rgl 里没有 u1f( 一类上传调用」+ vars / pass 单元测试。
- **后面**：把其余 program 一个个转（每个都 `--ref` 0 px），再 Env→F（天气 / 雾 / 曝光）。每转一个 program，vendor `renderer.js` 里对应的 `use + 上传` 行加一条补丁。

### R5 进度记录（第 2 段：fullscreen program 转换 + 工具）
- **已转（模板 Pass，0 px）**：`skyLut`、`clouds`、`skyF`、`taa`、`bdown`、`bup`、`final`、`depthOut`（R4）。每个都是：`tools/pass-conv.mjs` 机械生成 `rgl/shaders/*.js`（删 `uniform` 声明、`u_xxx` → 用处内联的 `${…}`，GLSL 逻辑一字不改）+ `tools/vendor.mjs` 里对 `renderer.js` 的补丁（删 `mk`、`use + 上传` → `this.passes.X.use()`）+ `rgl/index.js` 的 `X`（纹理 / 循环状态等外部量）。
- **验证**：`bench-v2 --r gl --ref` 四机位对「转换前」基线 0 px；`--ref` 会关 TAA，所以 `taa` 另做了非 ref（TAA 开）A/B：plain / water 转换前后 0 px，且同代码重复 0 px（TAA 在固定帧数下是确定的）。`verify-renderer --only gl` 全过，整体静态检查（rgl 无 `u1f(`、vars / pass 单元测试）全过。
- **踩到的坑**：① 内联名字会和 GLSL 局部变量重名：`vec3 cur = tm(texture(cur, …))` 里局部 `cur` 在自己的初始化式里就可见，把 `u_cur` 内联成 `cur` 直接编译失败 → 采样器统一加 `Tex` 后缀（`curTex / histTex / depthTex`）。pass 编译失败时报整份带行号的源码，容易定位；以后转 program 先看有没有同名局部变量。② `u('rain', …)` 在同一份源码里出现多次是多个函数对象 → `sameSource` 对 `u()` 改成「同名 + 同源码文本」才算同一个。③ bench 里 `g.mobs.push = () => 0` 拦不住 `new Mob()` 构造函数自己 `scene.add(group)` → 孤儿生物网格进了场景，plain 机位每次不同 → 一并拦 `scene.add` 的 Group；注意 three 的 `add()` 零参数会打错误日志，过滤后为空要跳过。④ zsh 里 `C="node …"; $C args` 不分词；用函数。
- **还没转**：`comp`（38 个 uniform，最大）、`fancy / water / shadow / shadowS / vanilla`（几何 pass，要 `Pass({ vs, attribs })` 和每段 VS 模板化）、`lines / overlay / blit`、`setFancyUniforms / setSkyUniforms` 本身（转完最后一个调用者后整个删掉）。之后才是 Env→F。

### R5 进度记录（第 3 段：comp）
- **`comp` 已转**（38 个 uniform，最大的全屏 program）：`rgl/shaders/comp.js`；`--ref` 四机位 0 px，非 ref（TAA 开）plain / water 对「taa / comp 转换前」基线 0 px；`verify --only gl` 全过。已转共 9 个：`skyLut / clouds / skyF / taa / bdown / bup / final / comp / depthOut`。
- **坑：纹理单元上留着 Sampler 对象**。`comp` 的 `sampler2DShadow shadow` 被 Pass 分到单元 5，画第一下就 `INVALID_OPERATION`、整屏黑：goodGL 的 `setFancyUniforms` 在单元 5 绑了 `rawSampler`（`gl.bindSampler(5, …)`，compare 关、NEAREST）且永不解绑，其他单元则没有；有 Sampler 对象时它覆盖贴图参数，和 `sampler2DShadow` 冲突。→ Pass 上传采样器时一律 `bindSampler(unit, null)`（以贴图自带参数为准）；`setFancyUniforms` 下一帧自己会再绑。教训：Pass 不能假设单元是干净的；定位方法是在页面里手动把 `table.get(k).unit` 改成各种组合二分，比盯着代码快。
- **还没转**：几何 pass（`fancy / water / shadow / shadowS / vanilla`）、`lines / overlay / blit`、`setSkyUniforms / setFancyUniforms`（最后整个删掉）；之后 Env→F。

### R5 进度记录（第 4 段：几何 pass 试点 shadow / shadowS）
- **已转**：`shadow`、`shadowS`（共 11 个 program）。`pass-conv.mjs` 新增 `--vs <键>`（VS 也转成 `glsl` 片段）；`rgl/shaders/shadow.js` 一份 VS 两个实例：R3b 的 `shadowS` 以前是对 VS 文本做 `.replace` 得到第二个 program，现在是 `#if ${() => sharp}` 宏变体（矩阵 `F.sharpMat / F.shadowMat` 也随实例）。
- **每次 draw 都变的量**（`u_offset / u_origin`）：`Pass.touch(...names)` 只重传这几个；`R.setDraw(pass, ox,oy,oz, ax,ay,az)` 写进 `dr` 再 touch（fancy / water 以后同用）。
- **Pass 修正**：VS / FS 共用一张 uniform 表，但声明各自只写本阶段用到的（VS 里声明 `sampler2DArray` 会因「没有精度」编译失败）。
- **补丁顺序坑**：`tools/vendor.mjs` 的补丁按顺序应用，依赖「R3b 补丁注入的文本」的 R5 补丁必须排在 R3b 之后（shadowS 那块），只依赖供体原文的可以排前面。
- **验证**：`--ref` 四机位 0 px；`flora`（锐阴影图真正被画的机位）单机位前后 0 px。注意：**`flora` 在多机位一次跑里和单独跑相差 ±1~23（2910 px），同代码也如此**（先跑别的机位会改变状态，疑似 TAA / 抖动序列或锐阴影的帧计数相关）→ flora 对比要单机位跑；多机位串跑下不能当 0 px 基线。（已知，待查。）

### R5 进度记录（第 5 段：fancy / water + 删 setFancyUniforms / setSkyUniforms）
- **已转**：`fancy`（+ chunkVS，含画手）、`water`（+ chunkVS）。共 13 个 program 已是模板 Pass；`setFancyUniforms / setSkyUniforms` 已无调用者，由补丁整体删除。`fancy` 一个 program 服务三处调用（场景、`dynW`、手）：`R.fm.hand` 在 `use()` 前置位，`rgl/shaders/common.js` 里 `viewProj / wind / shadowOn / lightDir / lightCol / pomOn` 按 hand 取另一组值，不重复编译。`tools/pass-conv.mjs` 支持 `@映射文件`（`tools/pass-maps/*.map`）。
- **Pass 增强**：采样器的值可以是 `{ texture, sampler, glslType }`（`shadowRaw` 要用 goodGL 的 `rawSampler`；其余一律 `bindSampler(unit, null)`）。`drawSections` 补丁：已转的 program 走 `setDraw`，未转的（vanilla）仍旧路。
- **验证**：`--ref` 四机位 0 px；`flora` 单机位 0 px；非 ref（TAA 开）plain / water 0 px；`verify --only gl` 全过。**手（`drawHand`）在 `?r=gl` 下不走**（宿主用 three 画手，`dynHand` 恒空），所以 `fm.hand = true` 那组值没有被像素验证过；等 R6 接宿主 B 才会走到。
- **shader-stats**：当前 `?r=gl` 最大的片元着色器 SIMD8 4229 条指令、spill 81:97（fancy），其余在 2018 以下、spill 0。**没有 R5 之前的同口径基线**（R3 当时没记 gl 的 shader-stats），所以「每个 program 的 shader-stats 与 R3 基线相同」这条验收只能从现在起建基线、下次改 GLSL 时比，无法追溯；名字改动不改变生成的代码，`--ref` 0 px 是主要证据。
- **还没转**：`vanilla / lines / overlay / blit`（`?r=gl` 恒走 fancy，vanilla 不会被调用；lines / overlay 只有 `F.crack / F.lines` 才画，宿主 A 用 three 画选框和裂纹，所以也不走）。它们可以最后一起转，或在 R6 接宿主 B 时转。**R5 下一步：Env → 帧对象（天气 / 雾 / 曝光）+ 面板文件夹**。

### R5 进度记录（第 6 段：Env → F、P 变成 vars、面板文件夹）
- **Env 补三项**（ts + 两个适配器）：`eyeInWater`、`eyeSky`（眼处天空光 0..1）、`weather?`（`{rain, thunder, wet}`，宿主 A 没有，`rgl` 当恒晴）。宿主 A：`RCTX.eyeInWater = player.eyeInWater`，`eyeSky = lightAt(相机格).sky / 15`；`v2/gl.js` 的 Env 适配器转发（v2 / v2/gl 自己不读）。
- **`rgl/index.js` 的 `render()`**：`underwater / eyeSky / rain / flash / wet` 现在都从 Env 进 `fb.build`，并每帧调 `ENV.underwater(flag)` 隐藏宿主的水下 CSS 遮罩（goodGL 的 comp 自己画水下）。结果：`uw` 机位是真的水下（以前 `F.underwater` 恒假）；洞穴系数真的起作用（`cave` 机位平均亮度 4.3 → 7.8，曝光往上调，洞里本来就几乎没光所以仍很暗）。**所以 `cave` 的 0 px 基线从这里换新**（plain / canopy / water 不变，仍 0 px）。
- **`P` 是 `vars()` 对象**（读写值照旧，bench 契约不变）；`meta.folder` 分组：渲染 / 雾（`mist`、`fog`）/ 云隙光（`volumetric`）/ 花草锐阴影 / 调试。`VR.apply(k)` = `P.it[k].set(P[k])`（hooks 以后路由宏切换）；`VR.panelRows = P.panelSpec` 给 R7 的面板用（`panelSpec` 仍是 `[]`：bench-v2 按 v2 的 `[[标题, 行]]` 格式遍历它，格式不同会炸）。云隙光现在只有一个开关（`volumetric`）；强度 / 光束参数在 GLSL 常量里，提成参数属于「调优」（§4.1：失去常量折叠，单独提交），留给夜空 / 云隙光 fork 时一起做。
- **已知**：`water` 机位在「不同机位组合」的两次跑之间会差 16538 px（R5 之前就有，和 `flora` 的 ±1~23 同类，疑似机位顺序带来的状态）；比较时用同一组机位串。
- **R5 还没做的**：`vanilla / lines / overlay / blit` 转换（?r=gl 不走，留给 R6）；宏来回切换命中编译缓存的 GL 级验收已有（`tools/test-pass-gl.mjs`）但尚未接 `P` 的宏开关（R7）；「人看晨、昏、雨三种天」要宿主 B（雨）；bench.md §4 确定性钉点除 `time / cloudX / ref` 外，`cov`、天气钉点等宿主 B 才有意义。

### 日月轨迹同源（时间分配跟 goodGL）
- 宿主 A 的 `updateSky` 原来用 `sin(2π·t)`（06:00 / 18:00 过地平线、正午 90°），rgl 用 goodGL 的 `celestial()`（约 05:15 / 18:45 过地平线、倾角 28°、正午 62°）。两套曲线同时存在：mob 光照、刷怪 / 燃烧（`skyDarken`）、v2/gl 的 `uSunDir` 走前一条，rgl 画面走后一条。
- 现在 A 的 `celestialDir(t)`（VoxelCraft.html）= rgl/frame.js 的同一份公式，`U.uSunDir` / 太阳 / 月亮位置 / 白天系数都从它出；`?r=gl&passdev` 每帧核对 `Env.sunDir` 与 `F.sunDir`，偏差 > 2e-3 就 warn 一次。
- `DAY_LENGTH` 600 → 1200 s（= goodGL 的 24000 tick × 20 tps）：原来黄昏光带（tick 12000–13800）只有 45 s，现在 90 s；想保留旧节奏改回 600 即可。
- 日 / 月切换只认 `F.useSun`（`sunH > -0.02`）；云光原先用 `-0.05` 另一个阈值，已改读它。

### 面板绑定（11-03，用户指出 P 虽然是 vars() 但没接 UI）
- 之前只做了 `panelSpec` getter（从各 Ref 的 meta 生成行），R7 才计划做面板，所以 `?r=gl` 按 F4 什么也没有。现在补上：`rgl/panel.js` 的 `createPanel(P)` 直接由 `P.panelSpec` 建 Tweakpane（同 v2/gl 的 CDN 版本 4.0.5），一行 = 一个 Ref，文件夹 = `meta.folder`（渲染 / 云隙光 / 花草锐阴影 / 雾 / 水 / 水下 / 调试），写值走 `ref.set`（hooks 统一路由）。`VR.paneReady / togglePanel / panelVisible` 与宿主 F4 现成接口对上，面板里的键盘输入不传给游戏。「重置默认」按钮按 `P_DEFAULTS` 逐项 `set`。
- `vars.js` 给 `P` 加了不可枚举的 `refs`（path → Ref）。
- 验证：无头浏览器里 `?r=gl` 等 `paneReady`，7 个文件夹、26 行，`togglePanel(true)` 后 `expanded` / `panelVisible` 为真，`P.it.uwWindow.set(7)` 生效。**没做的**：参数持久化（v2/gl 有 localStorage 的 `vc.v2.params` / 命名预设）；宏类开关（R7）要等 `P.hooks` 接上。

### 实体 CPU 光照（11-03，R4 方案 B 的过渡，A 方案也沿用）
- 实体由 three 在 final 之后画，不经过 goodGL 的光照和 tonemap，原先用宿主的 `lightColor()`（`brightJS` + `skyTint`），与 goodGL 画面的曝光 / 昼夜对不上。
- `rgl/entlight.js` 的 `createEntityLight(getF)`：按 fancy.js 的项（直射 × 半球平均 N·L 0.4 × 天空光满格、天空环境 × 0.725·sky²、火把 `lb²·2.4`、最小光）求辐亮度 E，再套 final.js 的曝光 / 分级 / ACES / 饱和度 / gamma，用参考反照率 0.35 折成显示空间乘子（上限 1.8）写进材质 `color`。每实体每帧一次，GPU 零成本；**没有阴影、没有逐面朝向**。
- 钩子：`VR.entityLight`（rgl 提供）→ 宿主 `entityLightHook`，`lightColor()` 命中就走它；v1 / v2 / v2/gl 没有这个成员，行为不变。
- 验证：同一机位晨 / 午 / 昏 / 夜四个时间，猪的乘子 (1.04,0.99,0.93) / (1.21,1.20,1.19) / (0.96,0.84,0.72) / (0.26,0.31,0.42)，截图里夜里猪明显变暗；`verify --only gl` 见提交前输出。**没量化与地形亮度的匹配度，夜里猪偏紫（红 / 蓝通道乘子差大），要人看**。
- 没做：脚下圆形软影；A 方案（实体进 `sceneC`）。
- **脚下软影**（同日）：`rgl/blobshadow.js`，每个实体一个贴地的径向渐变四边形（池 48 个），宿主 `RCTX.shadowCasters`（只读，惰性）给 `{x,y,z,r,sky}`；位置 = 脚下第一个 SOLID 格顶 +0.03，浓度 = `P.blobShadow`（面板「实体」，默认 0.5，0 = 关）× 离地高度衰减 × 天空光² × (0.25 + 0.75·直射强度)；深度测试走 `depthOut` 写入的 goodGL 深度。验证：同帧开 / 关深度测试对比，位置正确、被地形边缘正确遮挡；`verify --only gl` 通过。**看图时影子很淡（正午侧视下几乎看不出），浓度和半径要人调**；掉落物、玩家没有影子。

### R4 方案 A：实体进 goodGL 场景（11-03，`P.entScene`，默认开；关 = 方案 B）
- **做法**：vendor 补丁在 scene pass 的 `drawEntities` 之后调 `R.onEntities(F)`（`tools/vendor.mjs`，`--check` 仍成立）。`rgl/index.js` 的钩子：three 把 `ctx.scene`（实体、掉落物、粒子、选框、裂纹、脚下软影）画进离屏 RGBA16F + 深度纹理（**未抖动**的宿主相机）→ `rgl/shaders/entcomp.js` 全屏合并进 `T.scene`：预乘 alpha 混合（`ONE, ONE_MINUS_SRC_ALPHA`，dst alpha 不动）、`gl_FragDepth` = 宿主 near/far 换算到 goodGL 的深度、硬件 `LESS` 测试负责被地形遮挡。之后复制、水、云、comp（雾、云、体积光、水下介质）、TAA、bloom、final 都照常处理实体；`depthOut` 与 final 之后的叠画在 A 下不再执行。
- **颜色**：宿主 ColorManagement 关、输出线性，纹理 × 材质色是显示空间原始值。`entlight.js` 的 scene 模式把材质色写成 `E^(1/2.2)`（E = 直射 + 环境 + 火把 + 最小光，无曝光），合并 pass 做 `pow(rgb/a, 2.2)·a`，正好 = 反照率 × E，曝光 / ACES / 饱和度由 final 统一做。
- **TAA**：实体没有运动向量。合并 pass 往 gbuf.b 写 −1（ssrW = 0 所以 comp 的 SSR 不碰），comp 据此把 alpha 写 0，`taa.js` 看到 alpha 0 就不混历史（实体边缘无抗锯齿，但不拖影；半透明像素不标记，粒子会有一点拖影）。
- **验证**：`verify --only gl` 通过；晨 / 午 / 昏 / 夜截图里实体被花和地形正确遮挡，夜里和地形同样暗，白天和天空雾 / 曝光一致；没有 GL 错误。
- **未验证 / 没做**：带实体的 TAA 拖影没有逐帧差分，只看了静止帧；半透明粒子的拖影、掉落物经 tonemap 后的观感没看；手仍由宿主 hudScene 在 final 之后画；脚下软影在 A 下是和实体一起走深度合并，没单独看有无闪烁。
- **方块碎屑与掉落物（用户反馈：碎屑和环境光融入差、悬浮方块 / 素材没有影子）**：① 碎屑原先在生成时按「被打碎那一格」的光照烘进颜色（该格刚变成空气，光照还是实心格的旧值，偏暗且之后不再变）。现在粒子带 `lit` 标记，存未打光的反照率，`updateParticles` 每帧按**当前所在格**的 `lightColor` 上色（同格粒子共用一次查询，每帧一张 Map）；烟 / 火星仍是自发光，不打光。对所有渲染器生效。② `RCTX.shadowCasters` 除生物外加入掉落物（半径 0.2，悬浮高度按 `mesh.y − 0.2` 算，越高越淡）和点燃的 TNT（半径 0.49）。验证：昼 / 夜各打碎一块石头，碎屑昼间浅灰、夜里偏蓝灰且比地面略亮；TNT 进了 casters；`verify --only gl` 通过。**没验证**：掉落物实际出现的画面（测试里石头在测试模式下没掉出物品，只验证了 casters 的结构）；夜里碎屑偏蓝紫、比周围地面亮，是石头反照率 × 蓝色夜间环境光，没有遮蔽，要人看。
- **A 下悬浮物没有影子（用户反馈）**：原因是合并 pass 靠 entRT 的深度判定「这个像素有没有实体」（深度 = 1 视为空），脚下软影是透明材质、`depthWrite: false`，深度没写 → 整个被丢掉。改：影子 `depthWrite: true`；合并 pass 里把深度往相机方向偏 `max(4 cm, 0.2%·距离)`（影子贴地 3 cm，不偏会和地面 z-fight）；`blobs.update()` 挪到 `renderFancy` 之前（A 下实体在 renderFancy 里画，原先晚一帧）。验证：同帧开 / 关 `blobShadow` 差异像素 A 与 B 同量级（≈1.9 万 px，原先 A 为 0），平地上掉落物下面能看到暗斑。
- **实体亮度缓动 + 滑块**：`lightAt` 是整数格，实体走过格界亮度会跳。宿主 `easeLight(o, target, dt)`：每个生物 / 掉落物 / TNT 自带 `lc`，按时间常数 ~0.2 s 追目标（对所有渲染器生效）。`P.entExposure`（面板「实体」，0.3–3，默认 1）乘进 `entlight.js` 的 E（A 和 B 两个模式都生效；改 2 → 材质色 ×1.37，与 E^(1/2.2) 一致）。**缓动只验证了数值逻辑，没拍走过格界的连续帧**。

### R7 第一步：uniform 开关 → 宏（pbr / pom / shadow / cloudShadow / underwater / ssr / clouds / vol）
- `fancy / water / comp` 里这些开关改成 `#define XXX_ON ${…}`（`common.js` 的 `shadowM / pbrM / pomM / cloudShM / underM`），切换靠 `pass.js` 编译缓存；`comp` 里恒为 1 的 `shadowOn` 判断直接删。
- 验收：`--ref` 六机位（plain / canopy / water / shore / uw / flora）对改前 `r7base` **0 px**；`test-pass`、`test-pass-gl`、`verify-renderer --only gl` 通过。
- `shader-stats`（前 → 后，按指令数排序，无法对应到具体 program）：最大一条 4223 → 4312 ins（spill 73:80 → 81:97，+2%，**未回退验收通过，原因没查**）；两条 loops 2 的 2028 / 2023 → 1721 / 1717 ins 且 loops 1（分支被折叠）。
- 墙钟：改后的一轮 water / shore / flora 的 gpu 时间被 GPU 占用拉高（water 146 ms vs 36），**不可用**，复测要在空闲 GPU 上交替跑。
- 未做：宏来回切换在真实页面的缓存命中检查、PCSS 参数化 / `vel` 预设、整帧墙钟对 R0 的复测。

### 面板：两个并排 root（v2 / v3）
- `P` 的 meta 多一个 `root`（`FOLDER()` 按 `V3_FOLDERS` 自动给：花草锐阴影 / 水 / 水下 / 实体 = `v3`，其余 = `v2`；单项可在 meta 里覆盖）。`rgl/panel.js` 每个 root 一个 Tweakpane（各自标题条、折叠、「重置默认」），并排放在一个固定容器里，F4 一起开关；缺省 root = `v3`。
- 验证（无头）：`?r=gl` 两个 Pane（v2 · goodGL：渲染 / 云隙光 / 雾 / 调试；v3 · remix：花草锐阴影 / 水 / 水下 / 实体），`togglePanel` / `panelVisible` / `P.it.uwWindow.set` 正常。
- 没做：参数持久化；v2/gl 自己的面板（`?r=v2/gl`）没动，仍是单 Pane。

### 文件整理（按玩家视角 + 行数）
`rgl/shaders/` 撤掉，23 个文件 → 8 个模块 + `long/`（`index.js` 的 import 从 30 行降到 17 行）：
| 文件 | 行 | 内容（玩家看到的） |
|---|---|---|
| `index.js` | 257 | 装配：参数、帧循环、计时、实体合成钩子 |
| `terrain.js` | 242 | 地形与阴影：ID 翻译 / 方块分类 / 区块网格调度 / 阴影图 pass / fancy·water 共用 uniform |
| `sky.js` | 140 | 天空：大气 LUT、天空球 |
| `post.js` | 306 | 画面后期：comp（体积光 / 反射 / 水下）、TAA、泛光、色调映射、深度写回 |
| `entity.js` | 99 | 实体：CPU 光照、脚下软影、合并进场景 |
| `long/fancy.js` `water.js` `clouds.js` | 337 / 254 / 90 | 三个长 GLSL 各自成文件 |
| `pass.js` `vars.js` `frameref.js` `frame.js` `panel.js` | — | 框架（不变；测试脚本按这些路径引用） |
GLSL 一字未改，合并只去掉重复 import。验证：`verify-renderer` 全过，`vendor.mjs gl --check` OK，`--ref` 六机位对 `r7base` 0 px。`tools/pass-conv.mjs` 输出目录改为 `rgl/long/`，旧 render.md 正文里的 `rgl/shaders/xxx.js` 路径是历史记录，对应关系见上表。

### DSL 收口：`Fps` / `Fpv` / `named` / 形参命名（rgl/pass.js）
- **`frameref.js` 并进 `pass.js`**：`import { glsl, Fps, Fpv, named, setFrame } from './pass.js'`。`Fps.sunDir` = 模板里的命名引用（同键同函数，名字就是键）；`Fpv.w` = JS 里读值。`${() => F.x}`（222 处）→ `${Fps.x}`。
- **形参名即 uniform 名**：`${texel => [1 / Fpv.w, 1 / Fpv.h]}`、`${reset => (Fpv.taaReset || …) ? 1 : 0}`；无参或 `_` 仍取末尾标识符。`u('名', f)` 保留作逃生口，rgl 内已无使用。
- **`named({ wnoise: () => tex(wnoise), … })`**：一组来源按键名自动命名，`X` 与 `commonX` 里 31 处 `u('同名', …)` 去掉；14 处「键名 ≠ goodGL 原 uniform 名」的（`blSrc → src`、`atlas → tex` 等）一律改用键名，GLSL 里已不依赖旧名。
- **文件归类**：云并进 `sky.js`（天空 + 云）；`comp` 移入 `long/`（`long/` = `fancy` `water` `comp` 三个最长的着色器）；`post.js` 只剩 TAA / 泛光 / 色调映射 / 深度写回。
- 验证：`test-pass`（新增形参名、`Fps`、`named` 断言）、`test-pass-gl`、`verify-renderer` 全过，`vendor.mjs gl --check` OK，`--ref` 六机位对 `r7base` 0 px。`tools/pass-conv.mjs` 仍输出旧写法，已标注为历史工具。
- GLSL 工具函数去重（`hash12` / `vnoise` / `skyUV` 等各 3–5 份）按用户决定**不做**。

### 验证分层 + `sky.js` 入 `long/`（R7 收尾）
- **文件**：`sky.js`（229 行，天空 + 云）移入 `rgl/long/`；`long/` 现为 `fancy` 336 / `water` 253 / `comp` 169 / `sky` 229，`rgl/` 顶层只剩 `index` `terrain` `post` `entity` `pass` `vars` `frame` `panel`。`vendor.mjs` 注释路径与 `vendor/gl/renderer.js` 已重新生成，`--check` OK。上面「文件整理」表里 `sky.js` 的位置以本节为准。
- **验证分三层，互不耦合**（之前一条命令里既跑 verify 又跑 bench，改一行也要等几分钟）：
  | 层 | 命令 | 回答什么 | 耗时 |
  |---|---|---|---|
  | 闸门 | `node tools/check.mjs` | 还对不对：单元（pass / vars）→ vendor 一致 → pass GL 自检 → `?r=gl` 契约 + 画面非黑 + 0 px 确定性 + 无 GL 错误 + program 全链接 | ~11 s（预算 30 s，超了会提示） |
  | 全量 | `node tools/verify-renderer.mjs [--only 组]` | 四个渲染器的完整契约；gl 组含放 / 移方块、REF 重复、rd 重建 | gl 组 ~30 s，全部 ~2 min |
  | 像素 / 性能 | `node tools/bench-v2.mjs --r gl --generic --ref --views … --save/--cmp NAME` | 和基线逐像素一致吗 / 快了还是慢了 | 按机位数，且需要空闲 GPU |
- 约定：**改代码 → `check.mjs`；动 shader 或管线 → 再加 `--ref --cmp`；动性能 → bench（空闲 GPU）；提交前 / 动宿主接口 → 全量 verify。** `verify-renderer.mjs` 新增 `--fast`（跳过慢项）和组名 `static`（单独跑静态检查），`check.mjs` 就是它们加其它快测试的编排。
- 故意弄坏 `long/sky.js` 的 import 验证过：`check.mjs` 在 5 s 内报红（renderer 回退 v1 + 动态 import 失败）。
- 没覆盖：`check.mjs` 不跑 v1 / v2 / v2/gl 组（宿主改动时请跑全量）；不看画面内容是否「正确」，只看非黑、非单色、可重复——画面回归靠 `--ref --cmp`。

### 宿主 B 接入（R6-b 第一步）：`index.html?r=gl` 出图（11-03）
- **做了什么**：`rgl/host-b.js`（新）= 宿主 B 的全部耦合。`glsSource`（包 `Mesher.buildChunk` → `'blocks'`；包 `world.chunks.delete / clear` → `'gone'`；宿主一行不改；中途创建时接管已网格化区块）、`glsBlocks`（`kind / opaque / solid / occupied / cullSelf / waterId`，由 `Blocks.byId` 的 `model` 推；box / layer / ladder / door 先按整格）、`glsEnv`（`dayTime = Sky.time / 24000`——B 的 `Sky.update` 里 `time = 0` 正好是日出，和 goodGL 的 tick 0 对得上；`weather = {Weather.amount, storm}`；`flying / eyeInWater / eyeSky / eyeWaterTop`；`underwater()` 隐藏 `#water-tint`）、`glid()`（B 方块名 → goodGL 方块名的 256 项表，同名直通 + `SUBST` 代用品）、`createGlRenderer(gg, terrain)`（建 ctx、动态 import `./index.js`）。
- **rgl 本体的改动只有四处**：`SRC / ENV / BT` 先取 `ctx.source / env / blockTable`（缺省仍是宿主 A 的适配器）；`ctx.glid` 优先于 `idLUT(ctx.B)`；`padded()` 把 `ch.meta`（若有）原样写进 `pm`（流体液位 / 作物阶段 / 火把朝向 / 朝向方块的语义和 goodGL 相同，逐项核过 `FACING_FACE`、`HDIRS`）；`hideSky` 多隐藏 `ctx.terrain`（宿主 B 的区块网格组）。
- **index.html 两处**：`Game.init` 里 `?r=gl` 时把 `ChunkManager.scene` 指到一个 Group 并动态加载 `host-b.js`（失败就保留宿主自己的渲染）；`Game.loop` 末尾 `gg.VR ? (VR.update; renderer.clear(); VR.render()) : renderer.render(...)`。
- **踩到的坑**：贴图全黑。three 先用过这个上下文，`UNPACK_*` 状态是它的，`texSubImage3D` 报 `INVALID_OPERATION`，纹理数组整层是 0（宿主 A 碰巧没事）。`createRenderer` 在上传贴图前调 `resetGLState(gl)`。定位靠读回纹理层（`framebufferTextureLayer` + `readPixels`）。
- **验证**：`node tools/verify-host-b.mjs`（全量 ~60 s：适配器契约、画面非黑 / 非单色、0 px 可重复、放置 3×3×3 石头 → rev 递增 → 画面变 → 移除后 0 px 恢复且光照 / 方块数据逐格一致、卸载 → `'gone'`、无 GL 错误 / 异常 / 未映射方块）；`--fast`（~15 s）只做前半。`node tools/check.mjs --b` 把 `--fast` 加进闸门（总 ~30 s，已到预算边）。人眼：草坡 + 树 + 花 + 水 + 天空 + 云；羊 / 掉落物 / 粒子由 three 画进实体合成，被地形正确遮挡。
- **验证里学到的**：编辑往返要等 `ChunkManager.progress() === 1` 且 `VR.pending() === 0` 才取基准，否则远处区块还在陆续网格化，同一静止画面隔 1.5 s 会差 1.4 万 px（不是 bug，是基准没稳）；读回前要把相机同步钉回去（主循环每帧按 `player` 重算，弹跳 / fov 缓动有残差）。
- **和 goalP4P5 第 2 步的关系**：那一步的 `glsSource / glsBlocks / glsEnv` 是给 B 上的 **v2（DDA）** 用的，要带 `state() / boxes() / uInfo`。这里只做了 rgl 要的子集（无 `state()`、无 `aux`）；v2 on B 真要做时可在此基础上扩，不冲突。第 1 步（F6 热切换 / `c_Bench.poses` / `&gizmo=` / `tpause` / 轨迹录制）**没做**，所以还没有 B 上的 `bench-v2 --url index.html` 机位。
- **还没做 / 已知差距**：
  1. **特殊模型**（梯子、门、雪层、火）当前当空气（`SPECIAL`）——R6-a 本体：让宿主网格器只出这些方块、three 画进实体合成（`entScene` 同一路径）。B 的 `Mesher.buildChunk` 目前整套照跑（CPU 双份，只是隐藏）；R6-a 要改成按方块 id 过滤，同时能省掉大头。
  2. **群系染色**：`createWorld` 仍是平原常量；B 有逐列 `biomes`（`x*16+z`，goodGL 是 `z*16+x`），要按 `BIOMES` 行生成 `tintG / tintF`。
  3. **代用品方块**：矿 / 矿块 / 羊毛 15 色 / tnt / 南瓜等用最接近的 goodGL 方块顶替（表在 `SUBST`），要真的得给 `SH` 追加方块 + 贴图（供体补丁）。草方块 meta 1（积雪）没映射到 `snowy_grass`。
  4. **实体光照**：B 的实体 / 生物用 `Mesher.material`（自带烘焙光照 + 宿主雾），没走 `P.entExposure` / CPU 光照；夜里亮度、与 goodGL 曝光是否一致没看。手、选框、裂纹、雨雪粒子没逐项看。
  5. 没接 F6 热切换、`rd` 钳 ≤ 10、标题预览 / 屏保（`previewRd 16`）；`scale / maxMP` 没接；世界存档 / 读档往返没测。

### R6-a 特殊模型混合路径（宿主 B，11-03）
- **做法**：`gls.js` 的 `Mesher` 加一个 `only`（id 集合）：非空时跳过 `greedy`（整格方块）、跳过流体和其它模型，只出集合里的方块。`?r=gl` 时 `index.html` 设 `Mesher.only = {ladder, oak_door, snow, fire}`（与 `host-b.js` 的 `SPECIAL` 同表，两处要一起改），区块网格照旧进 `ChunkManager.scene`（现在就是主场景，不再有 terrain 组），由 `R.onEntities` 的 three 渲染一起画进实体合成：被地形深度遮挡、走 comp / tonemap，和羊、掉落物同一路径。VR 加载失败 → `only = null` 并把所有区块标脏，回到宿主自己的渲染。
- **顺带的收益**：B 的整格方块 greedy 网格和流体网格不再跑（之前整套照跑只是隐藏）；没有特殊方块的区块 `c.mesh` 为空，three 侧几乎没有 draw call。没单独量 CPU 省了多少。
- **`rgl/` 的改动**：撤掉 `hideSky` 里的 `terrain`（`ctx.terrain` 不再传）。
- **验证**：`verify-host-b.mjs` 加三项：没有特殊方块的区块不出 three 网格；放门（上下半）/ 雪层 / 梯子 / 火 → 该区块出网格、画面变；移除后 0 px 恢复且网格释放。人眼：门、雪层、梯子在 goodGL 的地面上，被石块遮挡关系正确。
- **没做 / 看到的问题**：
  1. 门的下半截颜色偏淡绿（B 的 `Mesher.material` 自带烘焙光 + 宿主雾，贴图本身没查）；这几个模型的亮度和 goodGL 曝光 / 昼夜没对齐，夜里没看。要对齐：给 `Mesher.material` 加 `P.entExposure` 同款乘子，或把它们的光照改走 `createEntityLight`。
  2. 火的发光（`emissive`）、门开关动画 / 铰链朝向、梯子靠墙朝向都用 B 原网格，没逐项对照；火 / 雪层 / 梯子的方块阴影（不投影）、AO 没有。
  3. 特殊方块不投阴影、不进水面反射和 SSR（只在实体合成里，gbuf 里 ssrW = 0）。
  4. `pose=models` 验证世界（goalP4P5 §12.5）还没有，要人搭；现在的验证是脚本放几个方块。
