<!-- handover/renderer-refactor/s10-interfaces.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§10 接口预设计：ChunkSource v2 / BlockTable v2 / 流体 / Env / Mesher 对接 / 落地顺序**
> 状态：有效，但存储细节被 §11.1 与 goal-renderapi.ts 修正（见文内 ⚠）；**ts 代码块为用户已确认版本**
> 何时读：接口改动前必读；goal-renderapi.ts 是它的整理后真值
> 对应 goal-renderapi.ts：§10.1 ↔ ts §1/§2；§10.3 ↔ ts §3；§10.5 ↔ 实施顺序

## 10. 接口预设计：体素 / 流体 / 光照管线（面向 Mesher 副产品与宿主 B）

目标：v2 继续当「完整光影 shader」长，但它对世界的全部认知只经过三个输入面：**`ChunkSource`（体素 + 副产品）、`BlockTable`（方块语义）、`Env`（环境/光照）**。
宿主 A/B 各写一个适配器；`index.html` 的 `Mesher.greedy` 与增量 `Lighting` 是这些接口的天然生产者。
原则沿用 §8.3：v2 只认接口，不认宿主；接口字段全部**可缺省**，缺省时 v2 自己算（现状）。

### 10.1 体素管线：`ChunkSource` v2（在 §2.1/§6.3 基础上扩展）

```ts
interface ChunkSource {
  size: 16; height: number;                       // height = 16 的倍数，≤256（index.html 128）
  getChunk(cx, cz): null | {
    blocks: Uint8Array;                            // (lx*16+lz)*H + y
    light?: Uint8Array;  sky?: Uint8Array; blk?: Uint8Array;   // 二选一；都缺省 = sky15/blk0
    rev?: number;                                  // 单调递增版本号：uploadChunk 用它去重（同 rev 不重传）
    aux?: ChunkAux;                                // Mesher/光照副产品，缺省 v2 在 uploadChunk 里自算
  };
  getBlocks(cx, cz): Uint8Array | undefined;       // leafPost 读邻块；可缺省（退化为 getChunk().blocks）
  forEachChunk(fn(cx, cz)): void;
  onChunkChanged(cb(cx, cz, what: 'blocks' | 'light' | 'gone')): void;   // 新增 what
}
interface ChunkAux {                               // 全部可选；每一项都是 mesher 扫描时「顺手」产出的
  maxY?: number;                                   // 列高 +1（0 = 空）
  sectEmpty?: number; sectFull?: number;           // 16 位段掩码（§3.1）
  brick?: Uint8Array;                              // 4×(H/4)×4 占用（§3.3 布局同 stBrick）
  dist?: Uint8Array;                               // P2 Chebyshev 距离场（§3.4），≤ 真实距离
  faceAO?: Uint8Array;                             // §3.5 逐面 AO 四角（最后做）
  fluid?: Uint8Array;                              // §10.2：逐体素流体等级 nibble（稀疏：只给有流体的区块）
  shoreD?: Uint8Array;                             // 水面层岸距 nibble（§9.2 第 4 条）
}
```
- **`what` 粒度是关键**：`'light'` 只重传 `uVox` 的 G 通道（CPU 侧跳过 `leafPost`/砖/列高/DF 扫描；GPU 侧仍是整块 `copyTextureToTexture3D`，可接受），`'gone'` = `clearChunk`。
  现状 `SRC.onChunkChanged((cx,cz))` 等价于全部 `'blocks'`；VoxelCraft 适配器把 `buildChunk` 映射成 `'blocks'`（它分不出光照变化，先这样）。
- **`aux` 的来源**：`Mesher.greedy` 无论如何要扫全区块，`maxY/sectEmpty/sectFull/brick` 是零成本副产品；`dist` 由 §3.4 的 Worker 产出后挂到同一对象。
  `uploadChunk` 的规则：**有 `aux.x` 就用，没有就算**；`aux` 的每项单独可缺省。这样宿主 B 先接空 `aux` 也能跑，再逐项把 mesher 的产出挂上来。
- **不变量**（写进 verify）：`aux.maxY ≥ 实际最高非空 y+1`、`sectEmpty` 置位段确实全空、`dist ≤ 真实`；违反 = 画面漏空（§7）。
- 宿主 B 适配器草案（对照 `voxelCraftSource` 1728–1744 行）：`live` 表由 `index.html` 的区块 Map 代替；事件源 = mesher 任务完成回调（`'blocks'`）与 `Lighting` 的脏区块回调（`'light'`）；`getBlocks` 直接返回 `chunk.blocks`。
  需要宿主 B 暴露：区块 Map、mesher 完成钩子、光照完成钩子、`CHUNK_H`。预计 ≤ 40 行。

**`BlockTable` v2**：
```ts
interface BlockTable {
  kind: Uint8Array;        // 0 无 / 1 立方 / 2 花草 / 3 火把 / 4 流体；5 halo、6 卡片 由 v2 内部保留，宿主勿用
  opaque, solid, occupied, cullSelf: Uint8Array; tileTop, tileBot, tileSide: Uint8Array;
  waterId: number; leavesId?: number; tallGrassId?: number; tileCard?: number;
  // 预留（§10.2/10.3）：
  fluid?: Uint8Array;      // 1 = 可分级流体（水/岩浆）；kind 4 ∧ fluid 0 = 满格静水（现状）
  emissive?: Uint8Array;   // 自发光 0..15（火把/岩浆/萤石），替代「blk 光照即发光」的近似
  tint?: Uint8Array;       // 生物群系染色组（草/叶）：0 无；v2 用 uInfo 第二行放 RGB
  idReserve?: boolean;     // 默认 true：id 192..255 归 v2（树叶 halo/INNER）；宿主占用时设 false → LEAF_OK 关闭
}
```
~~`uInfo` 升为 256×2：第 0 行同现状（r 位：0–3 kind、4 opaque、5 solid、6 cullSelf、7 leaf），第 1 行 r = fluid|emissive<<1、gba = tint RGB。着色器里 `texelFetch(uInfo, ivec2(id, 1))` 只在需要时取。~~

> ⚠ **已决定**：`uInfo` = 256×64（列 id，行 `(meta&15)*4 + k`，k0..k3 见 goal-renderapi.ts `UINFO`；k0 与现状完全兼容），宿主 A 无 meta → 16 行复制同一状态。`BlockTable` 的 JS 形态按 TODO-7：上面的数组字段不改名，**加** `state?(id, meta): BlockState` 与 `boxes?(id, meta, out)`；宿主 A 由数组拼出默认 `state()`。tile 字段按 TODO-3 整表 RGBA16UI 预留。

### 10.2 流体管线

现状：流体 = `id == waterId` 的满格体素；水面检测在 `trace` 里（`tw/wn`，上方非水则顶面下沉 1/8）；水下 = 相机格是水；风格差异只在 `main` 的着色分支。
宿主 B 若有流动水位（MC 式 0–7 级）或岩浆，现状表达不了。预设计的分层：

| 层 | 接口 | 生产者 | 消费者 |
|---|---|---|---|
| 数据 | 逐体素 **流体等级 nibble**：~~放 `uVox` 第三通道高 4 位~~ ⚠ 已决定：= `uVox.B`（meta）的低 4 位，宿主 B 的 meta 本身就是等级，`aux.fluid` 对有 meta 的宿主冗余；宿主 A 恒 0 = 满/源；0 = 满/源，1–7 = MC 等级，8 = 下落柱 | `uploadChunk` | `trace`、水面着色 |
| 几何 | GLSL `float fluidTop(ivec3 c, uint id, uint lvl, bool above)`：返回格内水面高度（⚠ TODO-4 已决定：`above ? 1 : 1 − lvl/9 + uFluidTop0`，`uFluidTop0` 使 meta 0 → 0.875，宿主 A 0 px 硬要求；不查 `uShape`），`trace` 的「入水点 / 出水点」与岸壁水线统一走它 | v2 | `trace` L797/L870/L925、`main` L1287 |
| 判定 | GLSL `bool isFluid(uint id)`（现状 `id == waterId`，升级后查 `uInfo` 第 1 行）；JS 侧 `BT.fluid[id] \|\| id === BT.waterId` | v2 | 全部 `${BT.waterId}u` 字面量（目前 ≈12 处）收口到这两个函数 |
| 着色 | `WATER_STYLE` 分支不变；岩浆 = 另一个 `kind 4` 子类型，按 `emissive` 走自发光路径，不走反射/透射 | v2 | `main` 水面分支 |
| 宿主耦合 | `update()` 里的 `#water` DOM 遮罩隐藏、`U.uFogNear/uFogFar` 改写 → 收口为 **`Env.underwater(flag)`** 回调（§10.3）；`ctx.getBlock` 只用于相机格判定，改为 `SRC.getChunk` 查 | 适配器 | v2 |

分级流体先**不**实现，只把字面量收口 + 第三通道位置预留；等宿主 B 真有分级水位再填 `fluidTop`。

### 10.3 光照管线：`Env` + 光照数据契约

**光照数据**（体素侧）：与现状一致——每体素 sky/blk 两个 nibble 由宿主算，v2 在着色器里做四角平滑 + AO + 太阳项。
宿主 B 的增量 `Lighting` 产出同一形状（`light` 打包或 `sky+blk`），通过 `onChunkChanged('light')` 走快路径。
P2 之后若接 §3.5 `faceAO`，仍由 mesher 产出（它已经为 v1 风格网格算过顶点 AO）。

**`Env`（环境输入）**：现状 `render()` 直接读 `ctx.U.uSunDir`、`ctx.skyMat.uniforms.uTop/uHorizon`、`ctx.cloudMat.uniforms.uTex/uColor/uOffset`、`ctx.clouds.position.y/visible`、`ctx.stars.visible`、`ctx.U.uFogNear/uFogFar/uFogColor`、`document#water`——这些是对宿主 A 的全部隐式耦合（§0.2 L1632–1723）。预设计为一个每帧轮询的对象：
```ts
interface Env {
  sunDir: Vector3; sunVis: Vector3;              // 光照方向（含面板偏移前的原值）/ 可见日月方向
  skyTop: Color; skyHor: Color;                  // 天空球渐变（反射、云的环境光、星空背景）
  fogColor: Color; fogNear: number; fogFar: number;
  cloud?: { tex: Texture; color: Color; offset: Vector2; y: number };   // 2D 云图（风格 0/1）；无则只有风格 2 可用
  time: number;
  underwater?(flag: boolean): void;             // v2 通知宿主：相机在水中（宿主 B 自己决定要不要雾/遮罩）
  hide?(what: 'clouds' | 'stars', flag: boolean): void;   // v2 接管了这些天空元素，请宿主别画
}
createRenderer(ctx)  // ctx.env ?? voxelCraftEnv(ctx)
```
宿主 A 的 `voxelCraftEnv` 就是把上面那堆 `ctx.*` 读取搬进去（≈30 行，放在 v2.js 尾部与另外两个适配器并列）；宿主 B 的 `glsEnv` 从它自己的天空/雾状态构造。
共享 GLSL（`voxLight/matSample/applyFog`）与共享 uniform `U` 的约定不变（§0.1），但 v2 对 `U` 的**写入**只剩 `uFogNear/uFogFar`，并通过 `env.underwater` 改为宿主自己写。

### 10.4 Mesher 侧的对接点（宿主 B）

`Mesher.greedy(chunk)` 一次扫描里顺手产出 `ChunkAux`：
- 扫描逐列时记录 `maxY`、每 16 段的非空/不透明计数（→ `sectEmpty/sectFull`，与 `uploadChunk` L296–309 同一算法，可直接复制）；
- 逐 4³ 砖置位 `brick`（greedy 的 mask 循环已经按层遍历，加一个 `bd[...] = 1`）；
- 需要 DF 时把「边界体素」列表一并给 Worker（§3.4），Worker 回传 `dist` 后再发一次 `onChunkChanged('blocks')`（或新增 `'aux'`，uploadChunk 只重传 `uDist`）。
mesher 若在 Worker 里跑：`aux` 的各 buffer 走 transfer（§7：`blocks` 本身不要 transfer）。

两个宿主共用同一份 `aux` 产出：宿主 B 的光栅化网格与 v2 DDA 并存时（`?r=` 切换），体素/副产品只算一次。

### 10.5 落地顺序

> ⚠ goalP3P4 已完成 1–3 与 5（宿主 A 侧；`aux.dist` 通路 = `dfMerge`），4 在 `goalP4P5`。`Env.underwater` 补了可选 `fog` 参数，见 goal-renderapi.ts §3。

1. 字面量收口（`isFluid/fluidTop`、`Env` 轮询对象 + `voxelCraftEnv`），`--cmp` 0 px；verify 加「v2 不再直接读 `ctx.skyMat/cloudMat/clouds/stars/getBlock`」检查（grep 即可）。
2. `onChunkChanged(what)` + `rev` 去重 + `aux` 可选字段（先只接 `maxY/sectEmpty/sectFull/brick`），VoxelCraft 适配器全传 `'blocks'`。
3. `uVox` ~~RGB8UI 第三通道~~ ⚠ RGBA8UI（goal-renderapi.ts `UVOX`：B = meta，A = dist|flags），同时建 CPU 镜像（ts §5 `Mirror`）。岸距 nibble（`aux.shoreD`）的 GPU 落点**未定**（B 高 4 位已保留给宿主 meta），做 §9.2-4 时再定。
4. 宿主 B 适配器三件套（`glsSource/glsBlocks/glsEnv`），`index.html?r=v2` 跑通；bench 加 `--url` 指向 index.html 的机位集。
5. 之后 P2 DF 的 `aux.dist` 直接落在同一条通路上。

> §10 写于只看过宿主 A 的时候。§11 按 `doc/xyzb/meta.md`、`doc/xyzb/all.md`、`doc/mat/*` 对照宿主 B 的真实特性边界，**修正了 §3.5 / §9.2 第 3 条 / §10.1 的几处存储决定**；冲突时以 §11 为准。
