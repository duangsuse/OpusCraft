<!-- handover/renderer-refactor/s05-tools.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§5 测量工具（P0）**
> 状态：已落地（§6.1）；第 2 条 DBG 4/5 与第 4 条验证增项留给 P2
> 何时读：每阶段验收时读
> 对应 goal-renderapi.ts：—

## 5. 测量工具（P0，先做）

1. **分 pass GPU 计时**：现在只有一个查询包整帧；改为 `scene / dda / comp` 三个顺序查询（`qWait` 改数组），`stats()` 显示 `gpu s/d/c`。
2. **步数热力图**（已实现为编译期宏 `DBG`/`DBGRAW`，`VR.setDebug(view, raw)`；`DBG=0` 与生产着色器完全相同；`4`=dist 留到 P2）：`1` = 主射线迭代次数 / `uSteps` 映射成热力色，`2` = 总 fetch 次数（循环内计数），`3` = 跳过 `smoothLight`（本格光照），`4` = 显示 `dist` 值，`5` = 显示命中层级（段/砖/DF 跳/体素）。面板加「调试视图」下拉。
3. **固定机位基准**：`tools/bench-v2.mjs`（参考 `diag-water.mjs` 的写法）：同一种子、固定 4 个机位（平地远眺 / 树冠仰视掠射 / 洞穴 / 水面），每机位读 30 帧 `stats()` 的 `gpu` 与热力图平均步数（`readPixels` 求均值），输出表格。每个优化前后都跑它，**数字写进本文档 §6**。
4. 验证脚本增项：`VR.source` 存在且 `height` 与宿主一致；DF 开关切换后画面逐像素一致（DF 只应影响步数，不应影响画面——这是最好的正确性测试）；放置方块后下一帧无穿帮（放一个 1 格厚的墙，背后贴天空色，`readPixels` 检查）。
