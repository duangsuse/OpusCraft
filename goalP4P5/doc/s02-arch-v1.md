<!-- handover/renderer-refactor/s02-arch-v1.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§2 目标架构（第一版）：ChunkSource v1 + mesher 副产品**
> 状态：**历史**：§2.1 的 `ChunkSource/ChunkAccel` 已被 §10.1 的 `ChunkSource v2/ChunkAux` 取代；§2.2 的副产品收益表仍有效
> 何时读：只在做宿主 B mesher 对接（P4c）时读 §2.2
> 对应 goal-renderapi.ts：§2.1 → goal-renderapi.ts §1（字段以后者为准）

## 2. 目标架构：`ChunkSource` + mesher 副产品 + 距离场 Worker

### 2.1 `ChunkSource`（v2 唯一的世界入口，取代直接读 `ctx.chunks / c.blocks / c.sky / c.blk`）

> ⚠ **历史版**：下面的 `ChunkSource` / `ChunkAccel` 已被 §10.1 的 `ChunkSource v2` / `ChunkAux` 取代（`sectionFlags` → `sectEmpty/sectFull`，`bitmap` 已弃，见 §3.2 ⚠），字段以 goal-renderapi.ts §1 为准。仍有效的：`onBlockChanged?` 回调（ts §1 写作 `(x,y,z)`，本节的 `oldId,newId` 为可选尾参，宿主可传可不传；v2 的 `flushEdits` 从镜像/`getChunk` 自己取新旧状态）、两个宿主的适配器草案、`buildChunk` 可重入等约束。

```ts
interface ChunkSource {
  size: 16;                                  // 区块边长
  height: number;                            // 96 / 128 / 256，不能写死；要求 height % 16 == 0
  getChunk(cx, cz): {
    blocks: Uint8Array | Uint16Array;        // (lx*16+lz)*height + y
    light?: Uint8Array;                      // 同索引，sky<<4 | blk；缺省视为 sky=15, blk=0
    maxY?: number;                           // 可选：最高非空 y+1（index.html 的 Chunk.height 已有逐列版本）
    accel?: ChunkAccel;                      // 可选：mesher 顺手产出的加速结构（§3），没有则 v2 自己算
  } | null;                                  // null = 未加载/已卸载 → v2 清槽位
  onChunkChanged(cb: (cx, cz) => void);      // 生成完成、光照变化、编辑、卸载 都走它
  onBlockChanged?(cb: (x, y, z, oldId, newId) => void);   // 可选：有它才能走 §3.4 的「单格即时路径」
}
interface ChunkAccel {
  sectionFlags: Uint8Array;                  // height/16 项：0 空 1 混合 2 全不透明
  brick: Uint8Array;                         // 4×(height/4)×4，1 = 非空（RENDER!=0）
  bitmap?: Uint32Array;                      // 可选：16³ 占据位图，height/16 × 128 个 uint32（布局见 §3.2）
  faceAO?: Uint8Array;                       // 可选：§3.5
}
```

- **方块表**单独一个适配对象 `BlockTable`：`kind[id]`（0 无 / 1 立方 / 2 花草 / 3 火把 / 4 水）、`opaque[id]`、`solid[id]`、`occupied[id]`（= 射线必须停下检查的：`kind != 0`）、`tileTop/Bot/Side[id]`。v2 用它生成 `uInfo`，Worker 用 `occupied` 算距离场。
- 两个宿主的适配器：
  - **VoxelCraft**：`getChunk` 直接返回 `{blocks: c.blocks, light: pack(c.sky, c.blk)}`；`onChunkChanged` 挂在 `meshChunk`（build 之后）和 `disposeChunk`；`onBlockChanged` 挂在 `setBlock`（L1308）。`accel` 由 v2 自己在打包时算（现状）。
  - **index.html**：`getChunk` 读 `gg.world` 的 `Chunk`（`state >= CH_LIT`），`maxY = max(c.height)`；`onChunkChanged` 挂 `Mesher.buildChunk`（L1332）和 `world.chunks.delete`（L1272）；`onBlockChanged` 挂 `Events.on('blockChanged')`。`accel` 由 `Mesher.fillPadded / greedy` 顺手产出（§3）。
    着色侧差异（2D tile 图集而非 `DataArrayTexture`、生物群系 tint、`model: box/layer/door/liquid`）**不在本阶段范围**，先只接几何 + 加速结构，用 VoxelCraft 的材质路径验证性能。
- v2 内部：`buildChunk(c)` → `source.onChunkChanged` 回调 → `uploadChunk(cx,cz)`；环形槽位/归属校验逻辑不变；`${CH}` 在 shader 里全部改成 `uH`/`#define H`（由 `source.height` 注入）。

### 2.2 mesher 副产品 → DDA 加速结构（对照现状）

| 副产品 | mesher 额外成本 | v2 现状 | 对 DDA 的收益（相对**现状**，非相对裸体素 DDA） |
|---|---|---|---|
| 区块级空/实标记（16³ 段） | ~0（quad 数==0 时判断全空/全实） | 无；只有列高 | 列高已经干掉了地表以上的空段；新增收益在**山体侧面、悬崖、洞穴**（列高很高但大半是空气）和地下全实段（进入即命中，不下探到体素级）。估 1.2–1.5× |
| 16³ 占据位图（512 B/区块段，R32UI） | +5% | 无；体素级直接读 RG8UI | 体素级每步 1 bit 代替 2 B，一个 texel 覆盖 2×4×4 格，**连续几步命中同一 texel 不用 fetch**；树冠/草地里 1.5–2× |
| 4³ 砖占用 | +2% | **已有** | — |
| Chebyshev 距离场（截断 16） | +50–100% mesher 时间 → 放 Worker | 无 | **单项最大**：开阔处一步跳 ≤16 格（砖级是 4 格），掠射角沿地表的射线从「每 4 格一次 fetch」变「每 d 格一次」。相对现状估 2–4× 步数下降；替代砖级循环 |
| 逐面 AO 四角打包 | +3%（greedy 合并前 `k1>>>16 & 255` 就是它） | 无；shader 9 邻域 | 只省掉 AO 的不透明判定，平滑光照仍要 9 个邻居的 sky/blk；存储是难点（§3.5）。估着色 10–20%，总帧 <5% |
