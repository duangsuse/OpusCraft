# 画面目标与解法（v2 DDA 为主，v1 对照）

> 配套文档：`handover/renderer-refactor.md`（性能阶段 P0–P5、§8 结构经验）。
> 本文只记**画面/手感**类目标。每条：现状 → 解法 → 面板参数 → 性能/验证约束。
> 约定沿用 §8.5：新参数进 `P`（持久化）或 `D`（调试）；副作用走 `apply(key, fx)`；预设按钮只写 `P`，不加 shader 分支。

## 1. 树叶阴影 / 摇动：面板可调范围，范围外降精度

**现状**
- v2 树叶 = `kind 1 + opaque 0` 的镂空方块：主射线和阴影射线每次进入都 `matSampleLod` 做 alpha 测试（`nAlpha ≤ 8`）。阴影射线（`shadowSteps 20 / shadowDist 6`）在树冠下是第二大开销（§1）。
- 没有任何摇动。v1 也没有（`uWave` 只给水 UV 流动）。

**解法（v2）**
- 摇动不动体素，只动**采样坐标**：命中 cutout 面后，对格内坐标 `f` 加一个与世界坐标/时间相关的剪切再做 alpha 测试与取色：
  `f.xz += amp · sin(uTime·freq + hash(hc)·6.28 + (wq.x+wq.z)·0.3) · f.y`（顶部摆幅大、底部为 0，像 MC 的 waving leaves）。
  只对 `id == LEAVES`（`uInfo` 加 bit 7 = sway）且 `tHit < swayDist` 生效；`amp` 随 `tHit` 在 `[swayDist·0.7, swayDist]` 线性衰减到 0，避免边界突变。
  阴影射线**不**做摇动（阴影里看不出，省一次 sin）。
- 树叶阴影三档 `leafShadow`：`精确`（现状：每格 alpha 测试）/ `实心`（阴影射线遇 LEAVES 直接视为不透明，省采样；树冠下略暗，视觉上接近 MC 原版阴影）/ `无`（阴影射线把 LEAVES 当空气）。
  加距离 `leafShadowDist`：`tHit > leafShadowDist` 的像素强制用 `实心`；`tHit > shadowDist·2` 之外原本就不发阴影射线。
- 降精度：`tHit > leafLodDist` 时主射线对 LEAVES **跳过 alpha 测试直接命中**（远处 mip 后的 alpha 本来就糊成一片，实心更稳、也消掉远处树冠闪烁）。这同时是性能项：远树冠的 `nAlpha` 循环归零。

**解法（v1，若要对齐）**
- 顶点着色器按 `aData.x == leaves 层` 做顶点偏移（同公式，`vy` 分量权重），`vFog > swayDist` 时权重 0；v1 没有阴影，不用管。

**面板**（新 folder「植被」）
| 参数 | 范围 | fx |
|---|---|---|
| `swayAmp / swayFreq` | 0–0.15 / 0.3–3（vec2） | — |
| `swayDist` | 8–96 格（log） | — |
| `leafShadow` | 下拉 精确/实心/无 | `sh` |
| `leafShadowDist / leafLodDist` | 4–64 / 16–160（vec2，log） | — |

**约束**：`swayAmp=0, leafShadow=精确, leafLodDist=∞` 必须与 p0 **0 px**（`--cmp p0`），其余为显式画面改动。bench 加「canopy」机位的 `leafShadow` 三档 gpu 对比。

## 2. 树叶太厚重：Lush / Better Leaves 风格的蓬松树冠

**现状**：树叶是实心 1×1×1 立方 + 22% 镂空像素（`tile('leaves')`），树冠轮廓全是方块棱角；树冠内部的叶子格也参与 alpha 测试（主射线穿透时每格一次采样）。

**参考**：Better Leaves / Lush Leaves 资源包的做法 = 每个叶子方块在**6 个面外侧**各加一片倾斜/交叉的卡片（伸出方块 ~0.25），卡片用更茂密、边缘不规则的叶子贴图；只给**暴露面**加卡片。效果是轮廓被卡片打碎、看不出立方体，但方块本身还是碰撞体。

**解法（v2）**
1. **内部剔除（先做，纯收益）**：`uploadChunk` 扫描时，6 邻全是 LEAVES 的叶子格写成一个新 id `LEAVES_INNER`（BlockTable 里 `opaque=1`、同贴图）。射线进入即命中、不做 alpha 测试；`smoothLight` 的 AO 判定也用它。树冠内部本来就看不见，这一步只省不亏。
2. **交叉卡片三层**（`leafStyle = 卡片`）：命中 LEAVES 格时，在格内求交三组平面并取最近的通过 alpha 测试者：
   - 层 A：两条竖直对角面（复用 `crossHit`，水平范围扩到 0..1）；
   - 层 B：两条水平/倾斜对角面（`y = 0.5 ± 0.35·(x−0.5)`、`y = 0.5 ± 0.35·(z−0.5)`）；
   - 层 C：方块 6 面本身（现状）。
   `leafCardLayers ∈ {1,2,3}` 控制启用 A / A+B / A+B+C。每层单独贴图：`tile('leaves_card')` = 圆形/不规则叶簇、边缘 40% 透明。
3. **外伸卡片 + 外部感知剔除**：卡片伸出方块 `leafOverhang`（0–0.5）需要射线在**相邻空气格**里就停下来测试。做法：`uploadChunk` 把「与暴露叶子面相邻的空气格」写成 `LEAF_HALO`（占据砖 `brick=1`，`kind=5`）；shader 进入 `kind 5` 格时只测试来自相邻叶子格的外伸部分（最多 3 个邻居：按 halo 格与叶子格的位置差）。**只有暴露面产生 halo**（6 邻中至少一个非 LEAVES 才算暴露）——这就是「外部感知剔除」，树冠内部零成本。
   halo 会抬高树冠周围的砖占用 → 体素级步数增加；用 `leafHaloDist` 限制：`t > leafHaloDist` 的射线把 `kind 5` 当空气。
4. **位置种子**：`hash(hc)`（整格哈希）决定每格卡片的旋转（4 向）、UV 翻转、沿法线 ±0.1 偏移、`leafSeed` 混入哈希；同一棵树不会出现重复图案。
5. **颜色**：卡片采样后乘 `mix(0.85, 1.1, hash)` 的亮度抖动，叶片层次感更强。

**解法（v1）**：`emitCube` 对 LEAVES 额外 emit 卡片 quad（Better Leaves 的 json 模型几何），同样只对暴露面；内部剔除同上。

**面板**（folder「树叶」）
| 参数 | 说明 |
|---|---|
| `leafStyle` | 方块 / 卡片 |
| `leafCardLayers` | 1–3 |
| `leafOverhang / leafHaloDist` | 0–0.5 / 8–96（vec2） |
| `leafSeed` | 0–255 整数 |
| `leafCullInterior` | 开关（默认开） |
| `leafDensity` | 0.5–1.5：`leaves_card` 贴图的 alpha 阈值偏移（越小越稀疏透光） |

**约束**：`leafStyle=方块, leafCullInterior=关` 与 p0 0 px。`leafCullInterior=开` 允许差异只出现在树冠内部像素（用 canopy 机位目测 + 步数热力图应下降）。halo 会改 `brick/maxY`，`verify-renderer.mjs` 的「列高与区块数据一致」要按新规则比对。

## 3. 水下看水面：回到 v1 的表现

**现状对比**
- v1：水面 mesh `DoubleSide + transparent`，水下仰视看到的是**整片水面贴图**（`T_SIDE[WATER]`，alpha 来自贴图）× 水面上方格子的 `voxLight`，再按距离混入水下雾（near 0.5 / far 18，水色）；水面之外是天空球/地形。所有仰角一致，没有「窗口」。
- v2：`camW` 分支用 Snell 窗（`r.y > 0.66` 才透出天空，`uwWindow` 调强度），窗外全是雾色，且 `camW && hit` 时根本不画水面（`water = !camW && …`）。物理上对，但观感生硬、与 v1 不一致。

**解法（v2）**：`uwSurface` 两档，默认 `v1`。
- `v1` 档：`camW && tw ≥ 0`（射线出水；`tw` 已在 `trace` 里记录为出水点）且 `(!hit || tw < tHit)` 时：
  ```
  behind = hit ? 地形着色 : (cloud ? mix(sky, cloud) : sky)        // 水面之外看到什么
  ac     = 出水点外侧那格 → voxLight(sky, blk)                        // 同 v1 的顶点光
  surf   = matSampleLod(fract(wq.xz), tileSide[WATER], lodAt(tw)).rgb * ac * exposure
  a      = 贴图 alpha（或 P.uwSurfaceAlpha）
  col    = mix(behind, surf, a)
  col    = mix(col, uFogColor, smoothstep(uwNear, uwFar, tw))       // 水下雾按到水面的距离
  z      = tw * cosF
  ```
  不加菲涅尔、不加 Snell、不加反射——**就是 v1**。`uwWindow` 保留但只在 `Snell` 档生效。
- `Snell` 档：现状代码。
- 出不了水的射线（`tw < 0`）两档都走雾色（现状）。
- 侧向出水（洞穴/水体侧面）同样套 v1 公式：v1 的 DoubleSide 侧面也是这样画的。

**面板**（folder「水下」）：`uwSurface` 下拉 v1/Snell；`uwSurfaceAlpha` 0–1（默认取贴图 alpha ≈ 0.6）；现有 `uwNear/uwFar/uwWindow` 保留。

**约束**：水下不在 bench 四机位里；加第五机位 `uw`（水下仰视 30°，`--save` 一次作为基线）。v1/v2 对照截图进 `tools/out/sky/`。

## 4. 星空参数 + 云/星搭配 + Reimagined 风格切换

**现状**
- 星星是宿主的 900 个 `Points`（方向 `y ∈ [-0.2, 1]` 均匀 → 地平线附近密度最高），画进 `sceneRT`；v2 的体积云只是 `mix(sc.rgb, cc.rgb, cc.a)` 盖上去，云薄处/云层以下仍满是星，和云的搭配「云下太多星」。
- 云：Beer-Lambert 体积云（厚度/密度/暗部/日照 4 个参数），噪声感强；水面：两层噪声法线 + 正弦。

**解法**
1. **星空搬进 v2 天空分支**（像云一样 `stars.visible = false` 隐藏宿主的）：程序化
   ```
   d = r 的方向 → 立方体贴图式分格 cell = floor(d * starDensity)
   h = hash(cell)；是星：h < starProb；亮度 = pow(hash2, starGamma) * twinkle(sin(uTime*2 + h*6.28))
   地平线衰减：* smoothstep(starMinElev, starMinElev + 0.25, r.y)
   夜间系数：* (1 - dayF)（dayF 同云的 smoothstep(-0.05, 0.12, uSunDir.y)）
   ```
   星只加到**未命中、未入水、云后**的像素：`sky += star * (1 - cc.a * cloudStarBlock)`。
2. **云/星搭配**：
   - `cloudStarBlock`（0–1，默认 1）：云对星的遮挡系数，云 alpha 再乘 `cloudNightAlpha`（夜间云更不透明，Reimagined 的夜云是厚实深灰块）。
   - `starMinElev`（默认 0.15）：云层视角线以下不出星——地平线附近的星本来也会被大气消光。
   - 星的密度在 `starDensity 24–96` / `starProb 0.02–0.2`：Reimagined 观感 ≈ 密度 48、概率 0.06、亮度 gamma 2.2、轻微闪烁。
3. **云风格 `cloudStyle`**：`体积`（现状）/ `MC 方块`：进入云 texel 即 `od = 厚度`（不累积、硬边），面着色固定顶 1.0 / 底 0.75 / 侧 0.85（`faceSh` 的 base 表），不做 `core` 衰减；alpha = `cloudAlpha` 常数（Reimagined 云是不透明白块 + 柔和底面阴影）。编译期 `#if CLOUD_MC`，两档互不影响。
4. **水面风格 `waterStyle`**：`噪声`（现状）/ `Reimagined`：
   - 法线：去掉噪声层（`uWave1.x = 0`），只留低频正弦 + 贴图 UV 流动（v1 的 `uWave` 风格，`wq.xz + uTime*(0.02, 0.01)`）；
   - 菲涅尔反射更强（`reflStrength` → 0.6）、天空色反射权重用天顶色而不是雾色；
   - 水体更清（`waterClarity 0.85`）、`deep` 色更饱和 `(0.04, 0.22, 0.55)`、泡沫关（`foamWidth 0`）；
   - 高光更锐（指数 20 → 64）。
   除法线分支外都是参数 → 做成**预设按钮**「水面：Reimagined / 噪声」写 `P`，法线分支用 `#if WATER_MC`。
5. 天空整体：Reimagined 的天顶更深蓝、地平线带偏暖；宿主 `cDayTop/cDayHor` 已经可调，v2 只加 `skyDarkenNight`（夜晚天空再压暗，让星更突出）。

**面板**（「水下」folder 改名「天空/水下」）
| 参数 | 范围 |
|---|---|
| `starDensity / starProb` | 24–96 / 0.02–0.2（vec2） |
| `starGamma / starTwinkle` | 1–4 / 0–1（vec2） |
| `starMinElev / cloudStarBlock` | 0–0.4 / 0–1（vec2） |
| `cloudNightAlpha` | 0.5–2 |
| `cloudStyle` | 体积 / MC 方块 |
| `waterStyle` | 噪声 / Reimagined（预设按钮 + 法线分支） |

**约束**：`shots-sky.mjs` 加夜间机位（`worldTime 0.62`，仰角 20°/60° 两张）；`cloudStyle=体积, waterStyle=噪声, 星星隐藏=宿主版` 时 p0 0 px（星星搬进 v2 会改天空像素，p0 比对时用 `D.hostStars=1` 保留宿主星）。

## 优先级与依赖

| 序 | 项 | 依赖 | 备注 |
|---|---|---|---|
| 1 | §1 `leafShadow 实心/无` + `leafLodDist` | 无 | 同时是 P3 性能项（canopy 机位阴影开销） |
| 2 | §2 内部剔除 `LEAVES_INNER` | `BlockTable` 可加 id | 纯收益，先于卡片 |
| 3 | §3 水下 v1 档 | 无 | 改动小，默认切到 v1 |
| 4 | §4 星空入 v2 + 云星搭配 | 无 | 先做参数，再做 `cloudStyle` |
| 5 | §2 卡片 + halo | 内部剔除、DF（P2）就绪后再评估 halo 对步数的影响 | 最重 |
| 6 | §1 摇动、§4 `waterStyle` | 以上 | 纯观感 |
