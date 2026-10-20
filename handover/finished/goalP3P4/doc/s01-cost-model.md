<!-- handover/renderer-refactor/s01-cost-model.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§1 成本模型：一个 DDA 像素里钱花在哪**
> 状态：有效（P1 时写；效果期新增开销见 §9.1）
> 何时读：P2/P3 优化前读
> 对应 goal-renderapi.ts：—

## 1. 成本模型：一个 DDA 像素里钱花在哪

当前 `trace` 的每步成本（每个循环迭代）：

| 阶段 | 每步 fetch | 备注 |
|---|---|---|
| 砖级（空砖区） | 1×`brickAt`（R8UI）+ 换区块列时 1×`colMaxAt` | 每步前进 4 格；列高跳过处理天空/山脊 |
| 体素级（进入非空砖） | 1×`voxAt`（RG8UI）+ 命中非空时 1×`uInfo` | ≤10 步/砖；树冠/草地几乎每步都非空 |
| 命中着色 | `smoothLight` 9×(`voxAt`+`uInfo`) = **18 fetch** + 1 atlas | 固定一次；和 ~25 步的步进相比不可忽略（≈30–40% 的 fetch） |
| 阴影射线 | 又一次 `trace`（默认 20 步）| `sky<8` / 背光面跳过；仍是第二大项 |
| 体积云 | `cloudHit` **每像素都跑**，最多 96 次 2D 步 | 云 slab 裁剪后多数射线仍要走一段；未测 |
| 水面 | 2 次噪声采样 + 若干 sin | 只在水像素 |

现有的加速结构（都在 `uploadChunk` CPU 打包时顺手算，与 mesher 无关）：
**4³ 砖占用**（R8UI）、**区块列高 `maxY`**（`uCol`，附带槽位归属校验）、**全局 `uWorldMaxY`**（天空早退）、**雾距裁剪** `maxD = min(uFogFar, sceneZ)`。
没有的：16³ 区块级标记、占据位图、距离场、预打包 AO。

> 在动手加结构之前，**先把 §5 的测量工具做出来**（步数热力图 + 分 pass 计时）。
> 没有它们，下面每一项的收益都只是估算。
