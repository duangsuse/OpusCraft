<!-- handover/renderer-refactor/s07-risks.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§7 风险与注意（DF / Worker / 纹理上传）**
> 状态：有效
> 何时读：P2 必读
> 对应 goal-renderapi.ts：—

## 7. 风险与注意

> ⚠ goalP3P4 的实现（按区块 DF + 无状态 Worker，§6.5）让「Worker 镜像 / 邻居标脏重算 / transfer 掉 `c.blocks`」三条不再适用：主线程只发占据数组的拷贝（transfer 拷贝本身）。「d 永远 ≤ 真实 d」照旧，verify 有逐格检查。新增风险见 §8.7：寄存器压力（SIMD8 + spill）比步数更决定帧时间。

- `postMessage` **transfer 会把 `c.blocks` 从主线程拿走**，必须 `slice()` 或 structured clone；回传的 `dist` buffer 可以 transfer。
- Worker 积压时（快速移动大量加载）编辑必须插队；主线程的放置 min-更新不依赖 Worker，所以画面不会穿帮，只是跳跃暂时偏保守。
- DF 的不变量：**纹理里的 d 永远 ≤ 真实 d**。任何改 occupancy 的路径（生成、编辑、卸载邻居后再加载）都要对照检查；违反的症状是「掠射角下方块背面透出天空/雾的细条」。
- 区块光照变化（火把）会反复 `buildChunk` → 不要让它触发 DF 重算，也不要清 `uDist` 槽位。
- `copyTextureToTexture3D` 在 r160 对 RG8UI/R8UI 可用；R32UI（位图）需验证 `RedIntegerFormat + UnsignedIntType`，不行则裸 GL `texSubImage3D` + `resetState()`。
- 三级/多路径循环会抬高寄存器占用，核显 occupancy 下降可能吃掉收益——每加一级都用 P0 工具测，不要凭估算叠加。
- 环形 N 与 `uSect/uDist/uBits` 的槽位寻址必须与 `uVox` 同一套 `wrap`；`rebuildRing` 时一起重建、`reuploadAll` 时一起重传（DF 需向 Worker 请求 `resend-all`，或主线程镜像直接重传）。
