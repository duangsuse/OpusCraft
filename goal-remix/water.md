# 水面 / 水下：LiqPG 的 pass 换进 goodGL 管线（步骤 9）

> 整理自 `goodLiqPG/handover/waterface.md`（原文是真值；表里数值都按代码逐行核对过，§5.1 黑圈成因是读码推导）。LiqPG 文件：顶点 / 片元 `src/render/shaders/water.js`，水下介质 `src/render/shaders/post.js`，调度 `src/render/pipeline.js`，几何 `src/world/mesher.js:267-334`。
> 前置：render.md 的 R3–R5 已完成（goodGL pass 4 的槽位、copyC/copyD、天空 LUT、阴影都已就位）。

## 0. 取舍

| 来自 LiqPG（替换） | 保留 goodGL |
|---|---|
| `WATER_FS` 的光学部分：波高场法线、Fresnel、折射"镜头"、吸收与内散射、SSR、太阳 GGX、雨涟漪、风（water.js:107–253） | 水的网格：角点高度 + 水面背面（L1026–1061）。⚠ 要核对两条行为与 LiqPG 一致：只有正面顶面做顶点波；在水上时丢弃背面（water.js:144 的修复） |
| 水下看水面的分支 `fromBelow`（water.js:191–202），**修好再用**（§3） | 岸边泡沫和瀑布泡沫（L3745–3753 的 `shoreline` 补丁） |
| 水下介质：体积光的 `uw` 分支（post.js:229–256）；composite 在水下跳过空气透视和边界雾（:311、:322）；final 的屏幕扰动（:450） | MRT 补丁 L3756（`o2 = vec4(0)`，goodGL 的 composite 要读 gbuf） |
| 顶点波（water.js:21–24） | 冰（MAT 3）也走水 shader：LiqPG 的冰有单独分支（water.js:121–139），一起搬过来 |

不取：LiqPG 的 Classic 水风格（:204–226，以后要再加）；LiqPG 的 `meshFluid` 几何（除非 goodGL 的水网格在 R3 暴露出问题）。

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

- 自动：`water`、`uw` 两个机位，加一个新机位"水下仰视 60°"（加进 `c_Bench.poses`），换 pass 前后各截一张；同 URL 重复截图 0 px。
- 人看：俯视能透过 2–4 格深的水看到沙底且偏青绿；平视远处几乎全是反射；低太阳角有一路通向太阳的碎金光带；水下仰视在 48.75° 处出现全反射边缘，**没有黑圈**；雨天水面有涟漪，洞里的水不反射天空。
