# 水面 / 水下：LiqPG 的 pass 换进 goodGL 管线（步骤 9）

> 整理自 `goodLiqPG/handover/waterface.md`（原文是真值；表里数值都按代码逐行核对过，§5.1 黑圈成因是读码推导）。LiqPG 文件：顶点 / 片元 `src/render/shaders/water.js`，水下介质 `src/render/shaders/post.js`，调度 `src/render/pipeline.js`，几何 `src/world/mesher.js:267-334`。
> 前置：render.md 的 R3–R5 已完成（goodGL pass 4 的槽位、copyC/copyD、天空 LUT、阴影都已就位）。先在宿主 A 上做（它有水，bench 的 `water / uw` 机位现成）；属于风格通道，前后截图交人审（bench.md §6 最后一行）。

## 0. 取舍

| 来自 LiqPG（替换） | 保留 goodGL |
|---|---|
| `WATER_FS` 的光学部分：波高场法线、Fresnel、折射"镜头"、吸收与内散射、SSR、太阳 GGX、雨涟漪、风（water.js:107–253） | 水的网格：角点高度 + 水面背面（L1026–1061）。⚠ 要核对两条行为与 LiqPG 一致：只有正面顶面做顶点波；在水上时丢弃背面（water.js:144 的修复） |
| 水下看水面的分支 `fromBelow`（water.js:191–202），**修好再用**（§3） | ~~岸边泡沫和瀑布泡沫（L3745–3753 的 `shoreline` 补丁）~~ → **用户 11-03：水面 foam 用 v2/gl 的版本**（见 §0.1） |
| 水下介质：体积光的 `uw` 分支（post.js:229–256）；composite 在水下跳过空气透视和边界雾（:311、:322）；final 的屏幕扰动（:450）。goodGL 自己的水下雾一起去掉：`compositeFS` L3395–3397、`F.waterFog`（L6249）、水下 `fogCol`（L6278）——用户评价 goodGL 水面和水下都差 | MRT 补丁 L3756（`o2 = vec4(0)`，goodGL 的 composite 要读 gbuf） |
| 顶点波（water.js:21–24） | 冰（MAT 3）也走水 shader：LiqPG 的冰有单独分支（water.js:121–139），一起搬过来 |

不取：LiqPG 的 Classic 水风格（:204–226，以后要再加）；LiqPG 的 `meshFluid` 几何（除非 goodGL 的水网格在 R3 暴露出问题）。

### 0.1 用户 11-03：泡沫和水底纹路用 v2/gl 的版本

- **水面 foam**（岸边波纹 / 岸壁水线）= v2/gl：`shoreDist / shoreH`（v2/glsl/water.js:8–29）、使用处 `shade.js:227–287`（岸壁水线、水面法线沿岸线方向的扰动 `sg`）、`P.foamWidth / shoreFade`（面板 `v2/gl.js:238`，`uWater0.w / uShore`）。取代 goodGL 的 `shoreline` 补丁（L3745–3753）和 LiqPG 没有的这一项。
- **水底纹路**（水下表面焦散）= v2/gl：`uwCaustic`（v2/glsl/uw.js:54）、`uwRipple`（uw.js:16）、使用处 `shade.js:217–223`（水底焦散 `ck`）、`shade.js:293`（透射里的焦散：两层反向漂移噪声的差 → 亮脊）。取代 LiqPG post.js:249–250 的光束 / 焦散项。
- ⚠ **这两段不能原样拷**：`shoreDist` 读 `voxAt(...)`（v2 的体素 3D 纹理 `uVox`，查周围 5×5 格有没有非流体实心格），`uwCaustic(p, ivec3 c)` 也要格坐标；goodGL 管线没有这张纹理。光栅管线要给等价数据，两条路（① 网格器在水面顶点上算 `shoreDist / dir`；② 相机周围维护一张小的 2D「实心格」纹理，片元里照 v2 查 5×5），**用户 11-03 选 ②**。理由是以后要做水面波纹（**Eulerian 高度场**：波方程 + Verlet 双缓冲，用户 11-03 更正，之前我误写成拉格朗日法），它和岸线要共用同一张以相机为中心的 2D 场，不适合把岸线烤进顶点。
  - 做法：环形（toroidal）2D 纹理，边长 ≈ 2·rd·16（宿主 A rd 6 约 192），原点按区块对齐、随相机滚动，只重写滚进来的行 / 列和被改动的区块（沿用 `rgl/world.js` 的区块事件：`blocks` 变了就重写该区块的 16×16）。R8，每列 1 字节：该列**水面所在高度**上相邻格是否为实心非流体（5×5 查询所需的就是这一位）。只记每列最上面一层水，叠水（瀑布下的水池之类）忽略；水面高度另用一个通道（RG8：G = 水面相对 `sea` 的偏移）以便河湖、不同海平面（v2 世界 127）也能用。
  - 片元里 `shoreDist` 改读这张纹理，其余照搬；`uwCaustic` 不需要纹理。
  - **为 Eulerian 高度场波纹留的口子**（现在不做，只定约束）。参照物是 `ref/ripple-regl.js`（用户贴的 regl 片段，原样保存）：
    - 状态 = 一张 2D 纹理 `S = {h, 上一帧 h}`，ping-pong 两张（`F[t%2]`），每帧一个 sim pass：4 邻拉普拉斯 `n = Σ邻居·0.5 − 上一帧` 就是波方程的 Verlet 一步，再乘阻尼。
    - **边界遮罩 `B.a` 决定阻尼**：`px >= 0.999` 用整体阻尼 `dmp`，否则在 0.75 / 0.87 到 0.99 之间按遮罩混合（实心处衰减快 = 波在岸边被吸收）。**这个遮罩就是上面的岸线 2D 场**（R8 实心格），所以两者共用一张纹理、同一套 `origin / size`，波纹不需要额外的边界数据。
    - 扰动源 = **线段 SDF 连续笔刷**：`sd(p, a, b)` 是点到线段 `a→b`（上一帧位置 → 这一帧位置）的距离，`dist < bru` 时按 `frc·(1 − smoothstep(0, bru, dist))` 往 `h` 里加。我们的 `a→b` 是实体 / 玩家 / 落水点的相邻两帧位置（高速移动也不断点）；一帧里多个源就多画几次或把源列表打进 uniform 数组。
    - 光学 = 高度差分出法线 `n = normalize(vec3(h(x+1)−h, h(y+1)−h, 0.012))`，折射偏移 `n.xy·ref`、三通道色散 `chr`、Fresnel `pow(1−n·v, 2.5)`、高光、虹彩调色板 `pal()`。我们是把 `n.xy` 叠到水面着色器已有的波高场法线上，而不是单独出一层。
    - 所以现在就不要把 2D 场的坐标写死在水着色器里：新建 `rgl/surfacefield.js`（原点 / 尺寸 / 滚动规则，岸线和波纹的纹理都挂在它上面），用 uniform 传 `origin / size / texel`。滚动时高度场要按整格平移（或清零重来），不能插值。
- 验收：`water / uw` 机位与 `?r=v2/gl` 同机位对比，岸边波纹宽度（`foamWidth`）、水线、水底亮脊图案一致 → 人看（风格通道）。

## 1. 资源对照（LiqPG uniform → goodGL）

| LiqPG | 含义 | goodGL / 宿主 |
|---|---|---|
| `u_sceneColor` / `u_sceneDepth` | 画水之前的不透明场景（含天空，不含云和体积光） | copyC / copyD（L4126–4128） |
| `u_skyLUT` + `sampleSkyLUT` | 天空反射兜底、Snell 窗口里的天空 | ⚠ goodGL 的天空视角 LUT（L2971–3018）**参数化方式不同**，改用 `skyCommon`（L2956）里的采样函数，不要把 LiqPG 的 `sampleSkyLUT` 搬过来 |
| `sunVis` | 水面点的阴影 | goodGL 的阴影采样函数（`fancyCommonFS` L3156–3176） |
| `lightColor`、`skyAmbient(+Y)` | 内散射光源 | 帧对象 F 里的太阳色、`u_ambCol` |
| `u_waterFogColor`、`u_waterColor` | 水下雾色 / 散射色。⚠ LiqPG 里 `env.waterFogLinear` **从来没有被赋值**，一直用的是常量（pipeline.js:289、:335） | 相机所在群系的 `BIOMES[b].waterRGB` 转线性，再乘 `clamp(相机处天空光 / 15, 0.1, 1)`（LiqPG environment.js:185–189 的原版公式） |
| `wind` | 法线强度 `mix(0.25, 0.55, wind)` | 宿主 `Weather`：晴 0.25 → 雷暴 1.0，由 `amount / storm` 插值（写在 `xlate.frame`） |
| `wetness` | 雨涟漪幅度 | goodGL 的湿润渐变（L6290） |
| SSR 步数 0 / 16 / 24 / 40（pipeline.js:12–15） | 画质档 | goodGL 的 `shadowQ` 等画质设置（R7） |
| `u_underwater` | 相机在水里 | 宿主的水下判定 → `Env.underwater` |

## 2. 参数（照搬，可调）

| 位置 | 项 | 值 |
|---|---|---|
| water.js:23 | 顶点波 | 振幅 0.025，下沉 0.03，频率 0.7 / 0.9，速度 1.6 / 1.3（只作用在正面顶面） |
| water.js:58–66 | 波高场 `waveH` | 3 个正弦（方向 (0.82, 0.57)·1.35 / (−0.43, 0.90)·2.10 / (0.97, −0.24)·3.30，振幅 0.22 / 0.14 / 0.08）+ 3 层平移值噪声（×1.7 / 4.1 / 9.0，振幅 0.30 / 0.12 / 0.05）；法线用前向差分，e = 0.05 |
| water.js:150 | 法线强度 | `mix(0.25, 0.55, wind)`，水下 ×0.6 |
| water.js:154 | 远处淡化 | `smoothstep(30, 140, d)·0.7`，远处最多保留 30% 的波动 |
| water.js:156–163 | 雨涟漪 | 0.5 格网格，环 `sin((r − 0.6·ph)·40)`，半径 0.35；幅度 `0.8·wetness·smoothstep(0.8, 1, skyL)`（只在露天） |
| water.js:169 | Fresnel | Schlick，F0 = 0.02，用波法线算 |
| water.js:172 | 折射偏移 | `N.xz · 0.06 / max(1, 0.15·waterLin)`，侧面 ×0.3；偏移后比水面还近就退回不偏移 |
| water.js:181 | 吸收 | `(0.45, 0.075, 0.035) × 1.2` 每格 → 红光 4 格基本吃光：浅滩青绿，深海发蓝 |
| water.js:188 | 内散射 | `waterAlbedo · scatterLight · 0.18` |
| water.js:228–238 | SSR | 首步 0.6 格，每步 ×1.22，IGN 抖动，二分 5 次，屏幕边缘淡出 0.08；未命中 → 天空 × `smoothstep(0.5, 1, skyL)`（洞里、屋檐下不反射天空）；顶面 `R.y < 0` 时改成 `−0.3·R.y` |
| water.js:244 | 太阳高光 | GGX α = 0.012，Smith，`F_Schlick(0.02, H·V)`，乘阴影，截断到 60 |
| post.js:239 | 水下消光 | σs = `waterColor·0.05 + 0.012`；σe = `(0.25, 0.06, 0.04) + σs` 每格 |
| post.js:229 | 相函数 | `HG(cos, 0.75)·0.7 + 0.3/4π` |
| pipeline.js:336 | 水下体积光 | 最远 64 格，步数按画质 8 / 10 / 14 / 20 |
| post.js:249–250 | 光束 / 焦散、环境项 | 阴影可见性 × `0.6 + 0.4·vnoise(0.8·xz + 0.4t, …)`；`ambUp × 0.08` |
| post.js:450 | 屏幕扰动 | `uv += (sin(30v + 2t), cos(25u + 1.7t)) × 0.0012` |

## 3. 移植时一并修掉的 LiqPG bug

| # | 问题（waterface.md） | 修法 |
|---|---|---|
| 1 | **Snell 窗口太宽**：`tir = smoothstep(0.62, 0.70, 1 − cosθ)`（water.js:194），窗口一直开到 67.7°–72.5°，物理值是 48.75°（`1 − cosθc = 0.341`）。窗口外填常量 → 水下仰视时出现一圈"黑圈" | 用 `k = 1 − η²(1 − (N·I)²)`，`k < 0` 即全反射，边缘会跟着波浪起伏；或者至少改成 `smoothstep(0.30, 0.36, …)` |
| 2 | 超过临界角时 `refract` 返回零向量，`normalize` 得到 NaN，经 `atan / asin` 传到天空采样（推导，未抓帧） | `refract` 结果为零就走全反射分支，不再 `normalize` |
| 3 | 窗口外填常量 `deep = waterFog × 0.4`（:197），与群系、时间、深度都无关 | 用 `reflect(−V, N)` 方向在屏幕空间取水下场景（复用 SSR 循环），未命中时用水雾色 × 天空光 |
| 4 | `waterFogLinear` 从未赋值（pipeline.js:289、:335） | §1 表里的群系水色公式 |
| 5 | 水下不画天空，直接清成常量 (0.02, 0.05, 0.08)（pipeline.js:261） | 清成水雾色 |
| 6 | `:193 cosT` 算了没用；水下 FOV 收缩不生效（game.js:157，宿主不搬这段） | 删掉；FOV 归宿主管 |

## 4. 验收

- 自动：`water`、`uw` 两个机位，加一个新机位"水下仰视 60°"（宿主 A 加进 `bench-v2.mjs` 的机位搜索规则，宿主 B 加进 `c_Bench.poses`），换 pass 前后各截一张；同代码重复截图 0 px；`gpu water` 列和墙钟前后对比。
- 人看：俯视能透过 2–4 格深的水看到沙底且偏青绿；平视远处几乎全是反射；低太阳角有一路通向太阳的碎金光带；水下仰视在 48.75° 处出现全反射边缘，**没有黑圈**；雨天水面有涟漪，洞里的水不反射天空。

## 5. 进度（宿主 A，`?r=gl`）

### 9a（11-03）：LiqPG 水面光学已换进 `rgl/shaders/water.js`
- 换了：波高场法线（`waveH` 三正弦 + 三层噪声，强度 `mix(0.25, 0.55, rain)`，远处淡化，雨涟漪）、折射偏移 / 厚度（天空背景 thick = 60）、吸收 + 内散射（光源 = `lightCol`·阴影·云影 + `ambCol`，所以夜里是月光）、SSR（LiqPG 步进，未命中退天空 × 遮蔽，`P.ssrSteps` 默认 24，面板文件夹「水」）、GGX α = 0.012 的太阳光斑。
- 水下看水面（§3 的 bug 1、2、3、5 的一部分）：窗口判据 `k = 1 − η²(1 − c²) < 0` 全反射，`smoothstep(0, 0.05, k)` 过渡，边缘随波法线起伏；折射向量只在 `k > 0` 时才算，没有 NaN；窗口外用反射方向做 SSR，未命中用内散射色。上表面和下表面共用一个波高场。新机位 `uwup`（水下仰视 60°，`bench-v2 --views uwup`）：窗口边缘是波浪形，没有黑圈。
- 没动：goodGL 的水网格 / 顶点波；泡沫仍是 goodGL 的（临时，9b 换）；`wind` 用 `rain` 代替（宿主 A 没有风）。
- 没验：前后 0 px 不适用（风格通道，画面本来就变）；水下窗口里的天空偏暗灰（窗口外是 comp 的水下雾色，更亮），属于水下介质（9c）要一起调的东西。
- GPU：water pass 在 `water` 机位 ≈10 ms（SSR 关）→ 17 ms（24 步），机器当时负载高、数字噪声大，R7 统一复测。

### 9c（11-03）：水下介质 + v2/gl 的水底花纹（用户：水下缺口最大，复用 rgl 现有体积光，天空透亮度太低，池底图样要 v2/gl 的）
- **介质**（`rgl/shaders/comp.js` camUnder 分支，替换原来的 `exp(-dist·0.07)` 水雾）：LiqPG post.js:229 的消光 / 内散射（12 步，最远 64 格，HG 相函数），光源 = `F.lightCol`（夜里是月光）× 阴影图可见性（`shadowRaw`，即 rgl 现有体积光用的那张）× 水面以下深度衰减，加 `ambCol × 0.08`。光束图样 = 焦散图样沿折射阳光方向拉出来的体积，所以光柱方向和池底亮斑方向一致。`volumetric` 关了就没有光束。
- **焦散**：v2/gl 的 `causAt`（两层反向漂移噪声之差 → 亮脊）+ `uwLs`，用**同一张噪声贴图**（`water/noise.js`，v2/gl 已改为从它取，`--cmp` 0 px）。水深不查体素：水下用 `Env.eyeWaterTop`（相机眼上方水面 y，宿主 A 向上数水格；`goal-renderapi.ts` 新增 `eyeWaterTop?`），水上看池底用本片元水面 y 减去折射后看到的点的 y。阴影可见性（水下用阴影图、水上用 `sh`）当作屋檐下没有焦散的判据，代替 v2 的体素天空光。强度 `P.uwCaustic`（面板「水下」）。
- **水下仰视窗口**：窗口内辐亮度 × 1.77（n²），加折射后的太阳盘（随波起伏的光斑）。窗口现在比周围水体亮得多。
- **没做**：水下群系水色（宿主 A 没有群系，`F.waterCol` 用常量 `[0.05, 0.22, 0.5]` × 眼处天空光）；水下屏幕扰动（post.js:450）；`F.waterFog` 已不再被 comp 使用（字段还在）。

### 6. 模块化：水体做成可被 v2/gl 下拉选择的一套
目标：这套「水面 + 水下」既是 `?r=gl` 的水，也是 v2/gl 面板「水面风格」里的一个选项（和 噪声 / Reimagined / Bliss 并列），以后宿主 B（v3）也直接用。
1. **纯函数库**（已开始）`water/glsl.js`：只放不引用 uniform 的 GLSL 函数，噪声贴图、时间、方向全经参数传入，所以能同时嵌进 rgl 的 `Pass` 模板（`glsl([lib])`）和 v2/gl 的 `glsl` 拼接。已有 `NOISE / CAUSTIC / MEDIUM`；9b 加 `SHORE`（`shoreDist / shoreH`，参数化掉 `voxAt`，改读 `surfacefield` 采样器）、波高 / 波法线 / GGX / Snell（现在写在 `rgl/shaders/water.js` 里，下一步抽出来）。
2. **共享资源** `water/noise.js`（噪声贴图数据，v2/gl 已改用）；以后 `water/surfacefield.js` 放岸线场 + 高度场波纹的 CPU 侧（原点 / 滚动 / 区块事件），也是纯 JS，两个渲染器各自上传纹理。
3. **宿主适配只剩 Env**：`sunDir / dayTime / eyeInWater / eyeWaterTop / eyeSky`（以及以后的 `waterColorAt`、`weather`）。v2/gl 的 `voxelCraftEnv` 已转发；宿主 B 补 `eyeWaterTop` 即可。
4. **v2/gl 里的下拉选项**：`waterStyle` 加第 4 项 `'Remix'`（`WATER_STYLE == 3`）——法线 / 反射 / 折射 / 吸收用 `water/glsl.js` 的函数，岸线用 `surfacefield`，水下介质用 MEDIUM；v2/gl 的 DDA 里没有「水面 pass」，所以这一项只替换 `shade.js` 里水面分支的光学部分，不改 DDA。`CLOUD_STYLE / WATER_STYLE` 宏切换机制已有（`v2/gl.js:706`），预设按钮 `WATER_PRESETS.remix` 同理。
5. **验收**：同一机位（`water / uw / uwup`）`?r=gl` 与 `?r=v2/gl` 选 Remix 对比，人看一致（风格通道）；`--ref` 0 px 只对「不选 Remix 时 v2/gl 不变」成立（本段 `wn_pre` 已验）。

### 9c 修正（11-03，用户：水底花纹没改、水下光线 y 方向反了）
- **光线方向**：焦散 / 光束把图样沿阳光方向投回水面，入射点应为 `p − Ls·(dz / −Ls.y)`，即朝太阳一侧偏移；之前照抄 v2/gl `uwCaustic` 的符号（朝背离太阳一侧偏）。数值核对：太阳在 +x、仰角 53°，水深 4 格的点，入射点在 +x 方向 +2.5 格。已改 `water/glsl.js` 的 `causticAt`（光束同用它，同步修正）。⚠ v2/gl 的 `uwCaustic`（uw.js:62）符号与它自己的 `uwShafts`（uw.js:78，`− sl·p.y`，正确）相反，疑似同一个写反；我没改 v2/gl（会动它的基准），要不要改你定。
- **水底花纹**：透过水面看池底原来也用了「沿阳光投影」的版本；v2/gl 对应处（shade.js:293）是图样直接落在被看到的点上、按视线在水里的路程 `exp(−路程·0.12)` 衰减、乘 `dayF·skyK`。新增 `causticSeen`，水面 pass 改用它。`uwCaustic` 0 ↔ 1.4 对比，`water` 机位约 9.5 万像素差 > 6，说明图样确实叠上去了，但强度 1.4 下偏淡（乘在已经被水吸收的池底上）。

### 9b（11-03）：岸线场 + v2/gl 的岸边波纹（水面部分）
- **场**：`water/surfacefield.js`（纯 JS）：以**世界格坐标取模**索引的环形 RG8UI（N = 512，够 rd ≤ 14；不滚动，所以也没有「按整格平移」问题），R = 0 无 / 1 水面列 / 2 实心列，G = 该列最上面一格水（或实心）的 y。实心 = `BT.kind === 1`（立方体；花草、火把不算岸）。由 `SRC.onChunkChanged` 驱动（`'blocks'` 重写该区块 16×16，`'gone'` 清零），每帧只上传脏区块（`texSubImage2D`）。以后的 Eulerian 波纹挂在同一套坐标上，沿用 R=2 当边界遮罩。
- **GLSL**：`water/glsl.js` 的 `SHORE`（`shoreH` / `shoreDist`）= v2/gl water.js 的原文，只把 `voxAt` 换成场采样：邻格是非流体实心 ⇔ 邻列 R == 2 且 G ≥ 查询格 y。
- **水面 pass 用法**（对应 v2/gl shade.js:256–262、370–371）：到岸距离 + 离岸方向 → 涌浪起伏 `sh0` 与斜率 `sg` → 水面法线沿离岸方向倾斜、浪峰略亮、边缘软化（`shoreFade`，随涌浪进退）。原来 goodGL 的白色泡沫块删掉。参数在面板「水」：`foamWidth / shoreFade / shoreWaveAmp / shoreWaveSpeed`，默认值同 v2/gl。
- 新机位 `shore`（`bench-v2 --views shore`）：5–7 格外有 ≥ 5 个采样点的直岸。
- **没做（9b-2）**：岸壁水线（shade.js:227–248，岸边实心格侧面上随涌浪升降的水线 / 湿痕）——它在不透明地形的 fancy 片元里，要在 `fancy` 的 FS 里读同一张场，改动较大，单独做。瀑布泡沫仍是 goodGL 的。
- 我这里肉眼看了 `shore`（有 / 无 `foamWidth`）：岸边多了一圈随波推进的明暗带，边缘软化；没有做 v2/gl 同机位并排对比（两边的水面法线、反射本来就不同，只能人看）。

### 9b-2（11-03）：岸壁水线
- `rgl/shaders/fancy.js`（不透明地形的片元）末尾加 v2/gl shade.js:227–248 的岸壁水线：侧面片元向外一格查岸线场，若那一列是水面列且「最上面一格水」的 y 等于本片元所在格，则水线高度 `shoreH(…, d = 0) × shoreWaveAmp` 随涌浪升降，线下盖半透明水色，线上留湿痕（0.3 暗化）。水面高度取 8/9（`vendor/gl/shared.js` 的 `cornerHeight` 源头水高，与 `Env.eyeWaterTop` 一致）。相机在水下（`under`）不画。
- 水色亮度 `wl` 用 `ambCol·sky²·1.5 + lightCol·sunY·阴影·0.1`（v2 用体素光 × 曝光，这里没有对应量，数值是目测）。
- 肉眼看：`shoreWaveAmp = 0.3` 时岸边侧面出现一圈随波升降的暗青水线；默认 0.12 下很窄（岸壁在水面以上只有 ~0.2 格）。同样没有和 v2/gl 并排对比。

### 9c 再修正（11-03，用户：离水面近时抬头被全反射遮满天空）
- 水下仰视的 Snell 窗口半径 ≈ 1.14 × 水深，水深 2 格时窗口只有 ~2 格宽，窗口外的全反射暗色盖住整个视野（水桶、瀑布、浅池）。
- 现在 `P.uwWindow`（面板「水下」，默认 4 格）：相机离水面不到这个深度，水面从下面看就**不做窗口 / 全反射**，直接取水面上方场景，只按波法线做偏移（带扭曲的透视），亮度同窗口（× 1.97，所以过渡连续）；深度从 `uwWindow` 起 3 格内渐变到完整的窗口 + 全反射。深度 = `Env.eyeWaterTop − 相机 y`（`F.camDepth`）。浅处不再跑 SSR。
- 之前写的「窗口 × 1.77（n²）」实际代码值是 1.97（用户看过画面说色调可以，保留），文档以代码为准。

### 6 的修订（用户 11-03）
- **不做 v2/gl 的 Remix 下拉**：水体要由用户专门移植到 pane / v3，v2/gl 保持不动。所以 §6 第 4 条取消；`v2/gl uwCaustic` 的符号疑似写反也不改。`water/noise.js`（v2/gl 已改用，0 px）与 `water/glsl.js`（纯函数库）保留，作为 v3 移植的接口。
