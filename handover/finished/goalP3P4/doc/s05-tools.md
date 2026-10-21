<!-- handover/renderer-refactor/s05-tools.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§5 测量工具（P0）**
> 状态：已落地（§6.1）；DBG 4/5/6/7–9、verify 的 DF / 编辑 / 静态检查、shader-stats 等见 §5.1（goalP3P4）
> 何时读：每阶段验收时读
> 对应 goal-renderapi.ts：—

## 5. 测量工具（P0，先做）

1. **分 pass GPU 计时**：现在只有一个查询包整帧；改为 `scene / dda / comp` 三个顺序查询（`qWait` 改数组），`stats()` 显示 `gpu s/d/c`。
2. **步数热力图**（已实现为编译期宏 `DBG`/`DBGRAW`，`VR.setDebug(view, raw)`；`DBG=0` 与生产着色器完全相同；`4`=dist 留到 P2）：`1` = 主射线迭代次数 / `uSteps` 映射成热力色，`2` = 总 fetch 次数（循环内计数），`3` = 跳过 `smoothLight`（本格光照），`4` = 显示 `dist` 值，`5` = 显示命中层级（段/砖/DF 跳/体素）。面板加「调试视图」下拉。
3. **固定机位基准**：`tools/bench-v2.mjs`（参考 `diag-water.mjs` 的写法）：同一种子、固定 4 个机位（平地远眺 / 树冠仰视掠射 / 洞穴 / 水面），每机位读 30 帧 `stats()` 的 `gpu` 与热力图平均步数（`readPixels` 求均值），输出表格。每个优化前后都跑它，**数字写进本文档 §6**。
4. 验证脚本增项：`VR.source` 存在且 `height` 与宿主一致；DF 开关切换后画面逐像素一致（DF 只应影响步数，不应影响画面——这是最好的正确性测试）；放置方块后下一帧无穿帮（放一个 1 格厚的墙，背后贴天空色，`readPixels` 检查）。

### 5.1 goalP3P4 新增 / 变更（P2–P3）

| 工具 | 用途 |
|---|---|
| DBG 4 | DF：R = 盒跳跃次数，G = 砖级入口 v==0 退化 uBrick，B = 逐格层遇到 DF 未回包；bench 列 `DF 跳/退0/退2` |
| DBG 5 A 通道 | 云步数（bench 列 `云步`） |
| DBG 6 | `texture()` 采样计数（图集 / 水面噪声 / 云 3D 噪声），bench 列 `tex` |
| DBG 7 / 8 / 9 | 探针：tHit / tw 的 float 位模式、命中格低 8 位 + kind/hit/法线轴；配合 `bench --probe x,y`（打印该像素 DF 关 / 开的值） |
| `bench --views ...,uw` | 水下仰视机位（默认不跑） |
| `bench --preset NAME` | 云 + 水面预设（`VR.presets`），`--set` 在其后覆盖 |
| `bench` 列 `gpu 云 pass` | CLOUD_LR 低分辨率云 pass 的独立计时槽（**注意**：本机相邻 pass 的计时查询会重叠，见 §6.5 第 7 步） |
| `bench` 输出 `DF 未算槽位` | 每机位统计仍有 v==0 的已占槽位数与 `df.pending()`；bench 的 `settle` 会等 DF 全部回包 |
| `node tools/shader-stats.mjs [url]` | 用 `INTEL_DEBUG=fs` 启动 Chromium，列出最大的几个片元着色器的 **SIMD 宽度 / 指令数 / spill:fill**。**改着色器结构前先跑它**（§8.7） |
| `node tools/refdiff.mjs A B view [n]` | 两组基准像素逐像素列出差异像素（坐标、两边 RGB） |
| `bench --ref` / `VR.setRef(1)` | 参考模式：全部步数预算 576 + 精确入格（`REF_MODE`），DF 开/关逐像素对比专用 |
| `node tools/df-seeds.mjs a b [gpu\|ss] [yaws]` | 随机世界 × 多个朝向的 DF 开/关对比（参考模式） |
| `node tools/upload-cost.mjs [url]` | 初次加载 rd 6：`VR.ring.upMs/uploads`（整块上传的主线程 CPU 部分）与 `updateChunks` 总耗时 |
| verify 新增项 | 静态检查（v2 主体不读宿主私有字段、waterId 注入 ≤1）、事件三路径 + rev 去重 + aux、DF Worker 回包、**DF 不变量 v−1 ≤ 真实距离**（独立重算，编辑前后各一次）、**1 格厚墙贴天空**放置 / 移除（宿主 setBlock 与 onBlockChanged 两条路径）、DF 开 / 关 0 px（steps 576） |
| 基准 | `tools/out/ref/p1fx/`（效果期，HEAD b5bd4be 代码、5 机位序列）替代 `p0`；`bliss1` = bliss 预设下的同代码基准 |

可复现性：bench 的 `place()` 钉死宿主水下 FOV、调用 `VR.resetLag()`；机位**访问顺序**会影响环边缘已加载的区块集合，DF 让射线在预算内走得更远后画面会依赖它 → 基准一律用完整 5 机位序列（§6.5「未达成项」）。
