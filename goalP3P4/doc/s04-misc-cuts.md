<!-- handover/renderer-refactor/s04-misc-cuts.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§4 与加速结构无关、但应一起做的开销削减（= P3 内容）**
> 状态：有效
> 何时读：P3 必读；细化版见 §9.2
> 对应 goal-renderapi.ts：第 3 条 ↔ goal-renderapi.ts §4 UVOX.A

## 4. 与加速结构无关、但应一起做的开销削减

| # | 项 | 做法 | 预期 |
|---|---|---|---|
| 1 | 阴影射线默认 20 步 | 先测关闭/开启差值；保留时：只对 `n.y>0` 顶面 + `G>0.3` 发射；或棋盘格半数像素发射、comp 时 2×2 取邻 | 核显上可能是 20–30% 的帧 |
| 2 | `cloudHit` 每像素执行 | 射线不可能到云 slab（`r.y<=0 && ro.y<y0`，或 slab 入口 `t` 已超过命中 `tHit`）时跳过；**先 trace 再算云**，把 `tHit*cosF` 作为云的 `tX` 上限 | 地面像素省 ≤96 次 2D 步 |
| 3 | `cellLO` 两次依赖 fetch | §3.5 的 flags 入体素纹理，或至少把 `opaque` 塞进 `uInfo` 之外的更小纹理 | 着色 fetch 18 → 9 |
| 4 | `voxAt/brickAt` 的取模 | `uOrgSlot*16 + o` 预合并为一个 uniform 偏移；`% uSX` 在 `SX` 为 2 的幂时换 `&`（N=2rd+5 不是 2 的幂 → 可把 SX 向上取到 2 的幂，多占内存换 ALU；核显上 ALU 不是瓶颈，**低优先**） | 小 |
| 5 | `scale<1` 时不做场景深度裁剪（`uClipScene=0`） | 对 `tDepth` 做 2×2 **max**（最远）采样作为保守裁剪，仍安全 | 实体/近景多时省步数 |
| 6 | sceneRT 全分辨率 + comp 全屏 pass | 不可省（深度合成需要），但 comp 可与 HUD 深度写合并……留着 | — |
| 7 | 预算耗尽像素 | 热力图里若成片 kind=4，说明结构没起作用，而不是 `steps` 太小 | 诊断用 |
