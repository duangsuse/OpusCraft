# 测试工具与测试参数（v2 DDA 渲染器 · 宿主 A VoxelCraft）

> 所有工具都是 Node 脚本 + 无头 Chromium（`tools/cdp.mjs`，Node 内置 WebSocket，无 npm 依赖）。
> 前提：仓库根目录起静态服务在 `http://localhost:8765/`；系统有 `chromium`。输出目录 `tools/out/`（已 gitignore）。
> 结果与结论见 `handover/renderer-refactor/s06-milestones.md` §6.4–§6.5，方法论见 `s08-lessons.md` §8.7。

## 1. 工具一览

| 命令 | 用途 | 何时跑 |
|---|---|---|
| `node tools/verify-renderer.mjs [baseURL]` | 接口 / 行为验证：`?r=v1` / `?r=v2` / `?r=bogus` 三组 + v2.js 静态检查。SwiftShader，随机种子世界 | **每次改动后**，必须「全部通过」 |
| `node tools/bench-v2.mjs [选项]` | 固定种子、固定机位的 GPU 分 pass 计时 + 步数 / fetch / 采样统计 + 逐像素回归 | 每个优化前后 |
| `node tools/shader-stats.mjs [url] [ms]` | `INTEL_DEBUG=fs` 启动 Chromium，列出最大片元着色器的 **SIMD 宽度 / 指令数 / spill:fill** | **改着色器结构前后**（核显上 spill 比 fetch / 步数更决定帧时间） |
| `node tools/df-seeds.mjs a b [gpu\|ss] [yaw,...]` | 种子 a..b 的随机世界 × 若干朝向，参考模式下比 DF 开 / 关 ddaRT | 动 `trace` / DF / 入格逻辑后 |
| `node tools/refdiff.mjs A B view [n]` | 两组 bench 基准像素逐像素列出差异（坐标从下数、两边 RGB） | `--cmp` 报差异时定位 |
| `node tools/upload-cost.mjs [url]` | 初次加载 rd 6：`ring.upMs / uploads`（整块上传主线程 CPU 部分）与 `updateChunks` 总耗时 | 动 `uploadChunk` / DF 占据 / Worker 后 |
| `tools/diag-water.mjs`、`tools/shots-sky.mjs` | 早期水面 / 天空截图诊断（历史） | 按需 |

## 2. bench-v2.mjs

```
node tools/bench-v2.mjs --views plain,canopy,cave,water,uw --cmp p1fx        # 标准回归（5 机位）
node tools/bench-v2.mjs --views ... --save NAME                              # 存基准像素到 tools/out/ref/NAME/
node tools/bench-v2.mjs --ref --set df=0 --save ref0 && \
node tools/bench-v2.mjs --ref --cmp ref0                                     # DF 开/关 0 px（参考模式）
node tools/bench-v2.mjs --preset bliss --views plain,canopy,water,uw         # 光影预设
node tools/bench-v2.mjs --set shadowSteps=0 --views plain,canopy             # 阴影射线占比
node tools/bench-v2.mjs --views uw --probe 632,144                           # 单像素 DF 关/开的 tHit / tw / 命中格
```

| 选项 | 默认 | 说明 |
|---|---|---|
| `--url` | `http://localhost:8765/VoxelCraft.html` | 宿主页面（实际打开 `?r=v2&seed=N`） |
| `--seed N` | `20240607` | 世界种子（`?seed=N`：不读档不存档的一次性世界） |
| `--rd N` | 6 | 视距（环 N = 2rd+5 = 17） |
| `--size WxH` | `1280x657` | 视口；`scale 0.8` → DDA 1024×526 |
| `--scale S` | v2 默认 0.8 | DDA 分辨率 |
| `--frames N` | 30 | 每机位计时帧数（取中位数）；只看像素可用 2 |
| `--views a,b` | `plain,canopy,cave,water` | 机位；`uw` 需显式加 |
| `--set k=v,...` | — | 覆盖 `VR.P`，走面板同一条副作用路由（宏重编译） |
| `--preset NAME` | — | `vol / noise / mc / bliss`（`VR.presets`），`--set` 在其后覆盖 |
| `--ref` | 关 | 参考模式 `VR.setRef(1)`：全部步数预算 576 + 精确入格 |
| `--save / --cmp NAME` | — | 存 / 比 ddaRT 原始像素 |
| `--probe x,y` | — | 打印该像素 DF 关/开的 DBG 7/8/9 探针值 |
| `--no-shade` | — | 跳过「平滑光照占比」的额外计时 |
| `--json FILE`、`--shots DIR`、`--headed`、`--swiftshader` | — | 结果 JSON / 截图目录 / 有头 / 软件渲染（无计时） |

输出列：`gpu scene / dda / comp*`（comp* 为独立计时）、`s+d+comp*`（整帧）、主射线 / 阴影迭代、耗尽占比、`fetch`（DBG 2）、`tex`（DBG 6）、列跳/砖/体素（DBG 5）、`DF 跳/退0/退2`（DBG 4）、云步（DBG 5 A）、平滑光照占比（DBG 3）、`gpu 云 pass`、`vs NAME`。每机位另打印 `DF 未算槽位`（应为 0 且 pend 0）。

## 3. 体素游戏测试参数（宿主 A，固定）

| 项 | 值 |
|---|---|
| 世界 | `seed 20240607`，`rd 6`，`setTestMode(true)` + `startGame()`，`player.noclip = true` |
| 冻结 | `freezeTime = true`、`worldTime = 0.12`（白天）、`VR.D.time = 10`（水波 / 摇动 / 星星）、`VR.D.cloudX = 0`（云偏移） |
| 清场 | 每次 settle 后 `mobs.length = 0`、`items.length = 0` |
| settle | 循环 `updateChunks(40)` + `VR.update` 直到 `pendingChunks == 0` 且 `VR.df.pending() == 0` |
| 可复现性 | `place()` 里 `VR.resetLag()`（滞后相机）+ 钉死宿主水下 FOV（`settings.fov × 0.92`）；**机位按固定顺序访问**（访问顺序会改变环边缘已加载的区块，DF 让射线走得更远后画面会依赖它） |
| GPU | Intel RPL-S 核显，ANGLE/GL（`--use-angle=gl`），无头；对比只在同一模式（无头/有头）内做 |

机位（由 bench 在已加载区块里按规则搜索，同种子结果确定；下为 seed 20240607 实际落点）：

| 机位 | 规则 | 位置（眼下脚） | yaw / pitch |
|---|---|---|---|
| plain | ±6 起伏最小、非水非叶的地表，平视远眺 | 24.5, 53, 32.5 | 0.6 / −0.04 |
| canopy | 周围树叶最密的树干旁，仰视掠射树冠 | 51.5, 53, 20.5 | 0.6 / 0.45 |
| cave | 地下 9×5×9 空气最多的格，朝最长空气方向（无光，只看步数 / 着色） | −53.5, 11, −71.5 | — |
| water | 水面上方 3 格，朝开阔水面 | −17.5, 42.4, −9.5 | 0.6 / −0.18 |
| uw | 离岸最远且水深 ≥5 的水柱，眼在水面下 ~2 格仰视 | −29.5, 37.2, −11.5 | 0.6 / 0.35 |

基准像素（`tools/out/ref/`）：

| 名称 | 内容 |
|---|---|
| `p0` | P0 时（加效果之前），**已不可比** |
| `p1fx` | 效果期（HEAD 6cdf06c 代码）、5 机位 —— 当前回归基准 |
| `bliss1` | 同上代码、`--preset bliss`（plain/canopy/water/uw） |
| `ref0` / `dfoff576` 等 | 临时（DF 开/关对比用），可随时重建 |

当前代码对 `p1fx` 的已知差异（默认预算）：plain 3463 / canopy 92 / cave 12 / water 61191 / uw 3437 px —— 来自 DF 让原「耗尽 → 全雾」像素走到真实命中，加旧进砖 ε 修正（DF 关时 plain 214 px、其余 ≤16 px）。DF 开/关在参考模式下 0 px。

verify 的固定检查参数：DF 不变量取前 12 个已构建区块逐格；放墙测试在玩家头顶 y=78、朝视线 7 格处放 3×3 石墙（宿主 `setBlock` 一次、`onBlockChanged` 脏盒路径一次，后者临时关 `leafCullInterior`）；DF 开/关在 y=60、俯 0.1，参考模式。

## 4. v2 运行时调试入口（`window.game.VR`）

| 入口 | 说明 |
|---|---|
| `VR.setDebug(view, raw)` | DBG 宏：1 主射线迭代 / 2 fetch / 3 跳过平滑光照 / 4 DF 跳跃·退化 / 5 层级 + 云步 / 6 texture() 采样 / 7–9 探针；`raw=1` 输出原始计数 |
| `VR.setRef(on)` | 参考模式（全部预算 576 + 精确入格，编译期 `REF_MODE`） |
| `VR.resetLag()` | 滞后相机对齐 |
| `VR.D` | `time / cloudX / hostStars / ref`（不持久化） |
| `?json=<URL 编码 JSON>`（或 `#json=`） | 启动时覆盖参数：顶层 P 键直接赋；`{"P":{…},"D":{…}}` 分桶 deep 赋值；`{"preset":"@mc"}` 先套预设（`@default/@vol/@mc/@bliss` 或自存名）。只认 `P_DEFAULTS` 里有且类型相同的键。例：`VoxelCraft.html?r=v2&json=%7B%22preset%22%3A%22%40mc%22%2C%22shadowSteps%22%3A12%7D` |
| 面板「预设」下拉（调试视图下方） | 内置 / 自存预设；下拉里的「＋ 保存为新预设…」「－ 删除当前预设」是动作项。自存在 `localStorage['vc.v2.presets']`，「上次」仍是 `vc.v2.params` 自动保存 |
| `VR.P` + `VR.apply(key, fx)` | 面板参数；`df`（距离场）、`cloudLowRes`、`sceneClip`（后两者默认关） |
| `VR.ring` | 环状态与计数：`uploads / upMs / lightUploads / clears / dedup / dfSent / dfDone / dfDrop / dfMin / dfInval / edits`，镜像 `mir[]` |
| `VR.df` | `{ T, pending(), cls(id, meta), transform }` |
| `VR.onChunkEvent(cx, cz, what)`、`VR.onBlockChanged(x, y, z)`、`VR.flushEdits()` | 事件 / 编辑队列入口（verify 用） |
| `VR.source.emit(c, what)` | 宿主 A 适配器：rev 递增后发事件（走 `'light'` 路径） |
| `VR.perf` | `gpu`（EMA）/ `gpuLast`（`scene / cloud / dda / comp / total`）/ `hasTimer` |

## 5. 注意事项（踩过的坑）

- 计时只信同一组 `TIME_ELAPSED` 查询、同一流程下的 A/B；本机相邻 pass 的查询会重叠（低分辨率云 pass 的「DDA 变慢」就是这么来的）。Chrome 的 `gl.finish()` 不阻塞，墙钟循环测不准。
- 改 `v2.js` 时不要有 bench 在跑：bench 每次运行都从磁盘重新加载 `v2.js`。
- 着色器改动先跑 `shader-stats.mjs` 看 spill；uniform 分支也占寄存器，A/B 用编译期 `#if`。
- 逐像素对比 DF 开/关必须用参考模式：只放大主射线预算不够（阴影 20 步、反射/折射 64 步也受 DF 影响）。
