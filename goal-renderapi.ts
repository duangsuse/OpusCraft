/**
 * goal-renderapi.ts — 渲染器的目标接口 + 目标数据流（伪代码）
 *   本文件 = 宿主契约（§0–§3、§7–§9），v1 / v2/old / v2/gl / gl（rgl，goal-remix 主线）共用。
 *   v2 DDA 内部（§4 GPU 布局、§5 镜像 / 编辑队列 / Worker、§6 数据流伪代码）拆在 goal-renderapi-v2.ts，节号不变。
 *
 * 用途：给后续 Agent 一份「单一真值」的接口/数据流草图，代替散落在
 *   handover/renderer-refactor.md §0.1 / §2.1 / §3.4 / §10 / §11 / §12
 *   doc/xyzb/meta.md（已评审）、doc/mat/game-spec.md、doc/mat/world-gen.md、doc/xyzb/chunks_dat.md
 * 里的多份不完全一致的描述。
 *
 * 约定：
 *   - 标 [confirmed §x] 的 interface = renderer-refactor.md 里用户已确认的 ts 块，字段**不改名**，只加可选字段。
 *   - 标 [meta.md §x] 的 = 已评审的 meta.md 决定；与 renderer-refactor.md 冲突时以 meta.md 为准（它自述「P2 以此为准」）。
 *   - 标 TODO(decide) 的 = 两份文档仍有分歧、需要用户拍板；默认取值已写明。
 *   - 标 [rgl 实现] 的 = rgl/index.js、rgl/host-b.js 已落地的形状（2026-11-05 对齐）；与旧草案冲突时以它为准。
 *   - 本文件不是实现，不被任何模块 import；伪代码函数体用注释 / 块注释表示。
 *
 * 基准（用户，2026-11-05）：**rgl（?r=gl）是基准渲染器，宿主 B 是主宿主**。宿主 A 基本淘汰（只差云、树的移植与 panify），
 *   新字段先满足「rgl + 宿主 B」；v2 / 宿主 A 只要求不被破坏（缺省值保持旧行为）。
 */

// ───────────────────────────────────────────────────────────────────────────────
// 0. 渲染器契约（宿主 ↔ 渲染器）  [confirmed §0.1]
// ───────────────────────────────────────────────────────────────────────────────

type U8 = Uint8Array
type num = number


export interface RendererCtx {
  // 宿主现有（宿主 A VoxelCraft.html 直接传 RCTX；宿主 B 新建一个同形对象）
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  settings: { rd: num; fov: num; scale?: num /* 分辨率缩放 */ };
  U: SharedUniforms;                 // 共享 uniform：uSunDir / uFogNear / uFogFar / uFogColor …
  // P1 起由适配器注入；缺省时 v2 用 voxelCraft* 适配器（宿主 A 行为不变）
  source?: ChunkSource;              // ctx.source     ?? voxelCraftSource(ctx)
  blockTable?: BlockTable;           // ctx.blockTable ?? voxelCraftBlocks(ctx)
  env?: Env;                         // ctx.env        ?? voxelCraftEnv(ctx)     （§10.3，待做）

  // —— [rgl 实现] gl 读的额外字段（宿主 A 由 RCTX 原样带，宿主 B 由 host-b.js createGlRenderer 建）——
  THREE?: unknown;                   // three 命名空间（实体 / 粒子 / 斑点阴影建 three 对象用）
  scene?: THREE.Scene;               // 宿主的 three 场景：实体 / 粒子 / 特殊模型（宿主 B Mesher.only）画进实体合成
  getBlock?(x: num, y: num, z: num): num;   // ⟶ 过渡字段：目标是 source.getBlock（§1）。rgl 现在读它（斑点阴影落地、flutter 碰撞 / 入水）
  SOLID?: U8;                        // ⟶ 过渡字段：与 blockTable.solid 同值（两宿主都由 Blocks/SOLID 表拼），目标是删掉、rgl 改读 BT.solid
  glid?: U8;                         // 256 项，宿主 id → goodGL 方块 id；缺省 = idLUT(ctx.B) 按方块名同名映射（宿主 A）
  B?: Record<string, num>;           // 宿主 A 的方块名 → id 表（只给 idLUT 用）
  textures?: TextureSource;          // 贴图来源（§2b，labPBR）；缺省 = 渲染器自带 procgen
  texturePack?(tx: unknown): num;    // ⟶ 过渡字段：被 textures 取代（宿主 B glsPack：按名字覆盖进 goodGL 贴图、HD 平均降到 16）
  pgTex?: boolean;                   // false = 关掉 goodPG 程序化草顶 / 雪 / 冰贴图（procgen 层内部的选择，与 textures 正交）
  shadowCasters?: { x: num; y: num; z: num; r: num; sky: num }[];   // 每帧读（getter）：生物 / 掉落物的斑点阴影；键不存在 = 不建斑点阴影
  sky?: { visible: boolean }; sun?: { visible: boolean }; moon?: { visible: boolean };
  stars?: { visible: boolean }; clouds?: { visible: boolean };      // 宿主天空对象：gl 每帧置 visible = false（TODO：改走 Env.hide，见 §3）
}

export interface Renderer {
  name: 'v1' | 'v2/old' | 'v2/gl' | 'gl';   // [rgl 实现] 原 'v2' = 现 'v2/old'（v2.js → v2/old.js，弃用作回归基准）；裸 'v2' 无别名
  buildChunk(c: HostChunk): void;    // 可重入；宿主 A 的事件源（映射为 'blocks'）
  disposeChunk(c: HostChunk): void;  // 之后 c.mesh = c.waterMesh = null（宿主 A 约定）
  update(dt: num): void;          // 每帧：flush 编辑队列 → 轮询 Env → 更新 uniform
  render(): void;                    // 主循环：clear; VR.render(); clearDepth; hudScene
  stats(): RendererStats;
  // v2 额外导出（已有）
  source?: ChunkSource; blockTable?: BlockTable;
  apply?(key: string): void;         // 面板参数同步：宿主写 VR.P[key] 后调（§8 c_Veg 经 VEG_KEYS 映射到 P 键）
  P?: Record<string, unknown>;       // 渲染器参数表（rgl：P / P_DEFAULTS，键名即真值；类型取自默认值）
  retint?(): void;                   // 群系染色规则变了（c_Veg.tintMode、换生成器）：重取 source.tintColor 并重网格化受影响的段
  // [rgl 实现] gl 额外导出；bench 契约成员（P / setRef / resetLag / readOut / perf / programs …）见 goal-remix/bench.md §2
  env?: Env;
  pending?(): num;                   // 视距内待网格化的段数；0 = 画面已稳（bench / verify 取基准前等它）
  reloadTextures?(): void;           // ⟶ 过渡：资源包换了 → 重传贴图 + 重算 PBR（宿主 B 包 Atlas.build 调它）；有 textures 后改由 TextureSource.onChange 驱动
  entityLight?(sky15: num, blk15: num, out: THREE.Color): THREE.Color;   // 宿主 lightColor() 的钩子（光照 0..15）：实体在 final 之后画，按渲染器曝光 / tonemap 折算
}
export interface RendererStats { steps?: num; fetch?: num; gpuMs?: num; [k: string]: unknown }
export declare function createRenderer(ctx: RendererCtx): Renderer;

/** 宿主区块对象的最小形状（两个宿主都满足；索引 i = (lx*16 + lz) * H + y） */
export interface HostChunk {
  cx: num; cz: num;
  blocks: U8;                // id
  meta?: U8;                 // 宿主 B 有；宿主 A 无（缺省 0）
  sky?: U8; blk?: U8;// 宿主 A/B 的光照（nibble 各占一个 u8）
  light?: U8;                // 或打包 sky<<4 | blk
  biomes?: U8;               // 宿主 B：256 项群系 id，下标 lx*16 + lz（与 blocks 同为 x 主序；index.html getBiome、gls.js:555）
                             //   ⚠ 旧稿写「(z,x) 序」有歧义，按代码更正。goodGL 是 lz*16 + lx，转置只在适配器里做
  temp?: U8; hum?: U8; // 宿主 B 未来：量化温湿度（world-gen.md §5.1 已确认，尚未落地）
  mesh?: unknown; waterMesh?: unknown;
}

// ───────────────────────────────────────────────────────────────────────────────
// 1. 体素入口 ChunkSource  [confirmed §10.1]（v2 版）+ [meta.md §4.1]（v3 增量，标 ★）
// ───────────────────────────────────────────────────────────────────────────────

export type ChunkEvent = 'blocks' | 'light' | 'gone';

export interface ChunkData {
  blocks: U8;                            // (lx*16+lz)*H + y
  meta?: U8;                             // ★ meta.md：缺省 = 全 0（宿主 A）
  light?: U8; sky?: U8; blk?: U8;   // 二选一；都缺省 = sky15/blk0 (0xF0)
  biomes?: U8;                           // 256 项，下标 lx*16 + lz（同 HostChunk.biomes）；缺省 = 全 0（宿主 A）  [rgl 实现：host-b.js 已返回]
  temp?: U8; hum?: U8;                   // 256 项，量化温 / 湿 0..255，下标同 biomes（world-gen.md §5.1；生成器落盘后才有）；缺省 = 由 biomes 取群系代表点
  rev?: num;                                  // 单调递增版本号：uploadChunk 用它去重（同 rev 不重传）
                                                 //   ★ meta.md 写成必填；这里保持可选：缺省 = 每次事件都重传
  aux?: ChunkAux;                                // Mesher/光照副产品，缺省 v2 在 uploadChunk 里自算
}

export interface ChunkSource {
  size: 16; height: num;                      // height = 16 的倍数，≤256（宿主 A 96 / 宿主 B 128）
  getChunk(cx: num, cz: num): ChunkData | null;   // null = 未加载/已卸载 → v2 清槽位
  getBlocks?(cx: num, cz: num): U8 | undefined;  // leafPost 读邻块；可缺省（退化为 getChunk().blocks）
  getBlock?(x: num, y: num, z: num): num;         // 世界坐标查 id：未加载 / y 越界 = 0（空气）。相机格流体、斑点阴影落地、粒子碰撞 / 入水用；
                                                 //   宿主有更快的 world.getBlock 就直接给；缺省 = blockAt(src, x, y, z)（下面）
  neighborsReady?: boolean;                       // true = getChunk 非 null 已隐含 8 邻块数据与光照就绪（宿主 B：网格化前提 neighborsAtLeast(CH_LIT)）；
                                                 //   缺省 false → 要读邻域的渲染器自己等 3×3 到齐（就绪规则 R3）
  tintColor?(group: Tint, biome: num, temp: num, hum: num): num;   // → 0xRRGGBB。渲染器按列求值（每区块 256 列 × 用到的组），结果按 (group, biome, temp, hum) 缓存
                                                 //   宿主自己的网格器（gls tintFor）也走同一个函数 → gls / rgl 同源。tintMode 'biome' 只看 biome，'climate' 查色图（temp, hum）；
                                                 //   模式切换由宿主调 VR.retint()。缺省 = 平原常量（草 0x91bd59 / 叶 0x77ab2f / 水 0x3f76e4）
  forEachChunk(fn: (cx: num, cz: num) => void): void;    // rebuildRing 后整环重传用
  onChunkChanged(cb: (cx: num, cz: num, what: ChunkEvent) => void): void;
  onBlockChanged?(cb: (x: num, y: num, z: num, ch?: BlockChange) => void): void;
  //   [rgl 实现] 第 4 个参数可选：宿主 B 从 Events 'blockChanged' 原样带出（rgl 的水波纹按水位差缩放）；没有 = 只知道「这格变了」
  // ★ meta.md §4.1：单格编辑 / 流体 tick / 作物生长 / 门开关 → 走 §4 编辑队列；没有它则退化为整块 'blocks'
}

export interface BlockChange { oldId: num; id: num; oldMeta: num; meta: num }

/** 染色组：编号按 goodGL（vendor/gl/shared.js TINT_*，rgl 是基准）。grass / foliage / water 随群系或气候；birch / spruce 固定色
 *  ⚠ 旧稿顺序「3 water 4 birch 5 spruce」作废（当时无人实现：宿主 A 全 0，v2 uInfo k2.a 未接） */
export const enum Tint { None = 0, Grass = 1, Foliage = 2, Birch = 3, Spruce = 4, Water = 5 }

/** source.getBlock 的缺省实现：只用 getBlocks / getChunk，任何宿主都能拼出来 */
export function blockAt(src: ChunkSource, x: num, y: num, z: num): num {
  if (y < 0 || y >= src.height) return 0;
  const cx = x >> 4, cz = z >> 4, b = src.getBlocks ? src.getBlocks(cx, cz) : src.getChunk(cx, cz)?.blocks;
  return b ? b[((x & 15) * 16 + (z & 15)) * src.height + y] : 0;
}

// 就绪与邻块规则（[rgl 实现] 2026-11-05 按两宿主代码核过）：
//   R1 宿主：getChunk 非 null ⇒ 本块 blocks / meta 是终态（装饰完、跨块结构已写入），sky / blk 已按当前已知邻块收敛。
//      宿主 A：buildChunk 在区块 meshed 之后才调；宿主 B：c.meshed（ChunkManager 要求本块与 8 邻都 ≥ CH_LIT 才建网格）。
//      sky / blk 至少要有其一形式：rgl（padded / sectionHash）只读 sky + blk 两个数组，不认打包的 light → 给 gl 的宿主必须给 sky / blk。
//   R2 宿主：本块边格（lx 或 lz ∈ {0, 15}）的方块或光照变了，宿主也给受影响的边邻 / 角邻发事件（不只是本块）。
//      宿主 A：setBlock → markUrgent 边 / 角邻；storeLight 边界光变 → 邻块重建。宿主 B：ChunkManager.markDirty（边 / 角）；Lighting.set 边格 → markDirty。
//      光照跨区块传播导致的邻块变化同样走事件（宿主 B 现为 'blocks'，P4c 后为 'light'）。
//   R3 渲染器：邻块「到达」或 'gone' 时，宿主**不会**给本块补事件 → 读邻域的渲染器自己标脏
//      （rgl/terrain.js：新区块 / gone 标 8 邻，重建标 4 邻）；邻块缺失时按「石头 + 无光」读（挡住朝向它的面，goodGL 做法），到达后重做。
//      v2 的 DF 只看本区块，不受本条约束；leafPost 读邻块，规则同上。
//   R4 rev：同一 (cx, cz) 'gone' 后再出现，rev 继续递增、不回 0（两宿主适配器都用全局 ++REV），旧回包按 rev / 归属丢弃。

/** 全部可选；每一项都是 mesher 扫描时「顺手」产出的；uploadChunk 规则：有 aux.x 就用，没有就算 */
export interface ChunkAux {
  maxY?: num;                                 // 列高 +1（0 = 空）
  sectEmpty?: num; sectFull?: num;         // 16 位段掩码（H/16 段；全空 / 全不透明）
  brick?: U8;                            // 4×(H/4)×4 占用（布局同 stBrick；按 kind≠0 含流体，保守）
  dist?: U8;                             // P2 Chebyshev 距离场（≤ 真实距离）；由 Worker 产出后挂回
  faceAO?: U8;                           // §3.5 逐面 AO 四角（最后做，先测再做）
  fluid?: U8;                            // 逐体素流体等级 nibble（稀疏：只给有流体的区块）
                                                 //   ★ 有 meta 时冗余：level 就在 meta 低 4 位，宿主 B 不必给
  shoreD?: U8;                           // 水面层岸距 nibble（§9.2 第 4 条）
}
// 不变量（写进 verify）：aux.maxY ≥ 实际最高非空 y+1；sectEmpty 置位段确实全空；dist ≤ 真实距离。违反 = 漏空/穿帮。
// 事件语义（宿主侧：'blocks' = 本块方块 / meta 可能变了；'light' = 只有 sky / blk 变了；'gone' = 卸载）。渲染器侧，v2 的做法：
//   'blocks' → 整块重扫（镜像重建 + 整块上传 + 砖/列高/段 + Worker load）
//   'light'  → 只改镜像 G 通道 + 整块上传；不碰砖/列高/DF/leafPost，不发 Worker（宿主每帧去抖，每区块最多一次）
//   'gone'   → clearChunk（列高 0）+ Worker unload + 槽位释放
// 宿主 A 适配器：buildChunk → 'blocks'（分不出光照变化，先这样）；disposeChunk → 'gone'；setBlock → onBlockChanged。
// 宿主 B 适配器：mesher 完成 → 'blocks'；Lighting 收敛 → 'light'；world.chunks.delete → 'gone'；Events 'blockChanged' → onBlockChanged。
//   [rgl 实现] host-b.js 现状：包 Mesher.buildChunk（c.meshed）→ 'blocks'，包 world.chunks.delete / clear → 'gone'，每个非 gone 事件 rev++；
//   **不发 'light'**（光照变化随 mesher 重建走 'blocks'），P4c 再接。getChunk 只返回已网格化区块 → 隐含「8 邻块已 LIT」（ChunkManager 建网格前提）。

// ───────────────────────────────────────────────────────────────────────────────
// 2. 方块语义表 BlockTable  [confirmed §10.1]（数组视图）+ [meta.md §2.2/§2.3]（state/boxes，标 ★）
// ───────────────────────────────────────────────────────────────────────────────

/** kind 枚举：0..4 宿主可用；5/6 v2 内部保留；7 形状表（meta.md，宿主 B 的 box/layer/ladder/door 走它） */
export const enum Kind { None = 0, Cube = 1, Cross = 2, Torch = 3, Fluid = 4, Halo = 5, Card = 6, Shape = 7 }

export interface BlockTable {
  // —— 数组视图（现状 + §10.1 预留；索引 = id，长度 256；宿主 A 只有这些）——
  kind: U8;        // 0 无 / 1 立方 / 2 花草 / 3 火把 / 4 流体；5 halo、6 卡片 由 v2 内部保留，宿主勿用
  opaque: U8; solid: U8; occupied: U8; cullSelf: U8;
  tileTop: U8 | Uint16Array; tileBot: U8 | Uint16Array; tileSide: U8 | Uint16Array;
  waterId: num; leavesId?: num; tallGrassId?: num; tileCard?: num;
  fluid?: U8;      // 1 = 可分级流体（水/岩浆）；kind 4 ∧ fluid 0 = 满格静水（现状）
  emissive?: U8;   // 自发光 0..15（火把/岩浆/萤石），替代「blk 光照即发光」的近似；只是着色加亮，不是光源
  tint?: U8;       // 染色组 Tint（§1）；宿主 A 全 0。rgl 用 goodGL 自己方块表的组（经 ctx.glid），这一列给 v2 与宿主网格器
                   //   逐面差异（草方块顶染、侧不染）不在这里：rgl 靠 goodGL tintMode（只染 albedo α < 0.5 的像素），宿主 B 靠 def.tint.{top,side}
  idReserve?: boolean;     // 默认 true：id 192..255 归 v2（树叶 halo/INNER）；宿主占用时设 false → LEAF_OK 关闭

  // —— ★ meta.md：状态化入口（有 meta 的宿主 B 必须提供；宿主 A 用默认实现由上面的数组拼出）——
  state?(id: num, meta: num): BlockState;             // v2 建 uInfo 时对 id∈0..255 × m∈0..15 各调一次
  boxes?(id: num, meta: num, out: Float32Array /*24*/): num;  // 已按 facing/flip 变换到格内坐标的 AABB 个数；碰撞与渲染同源
}

/** [meta.md §2.2] 一个「状态」= uInfo 的 4 个 texel */
export interface BlockState {
  kind: Kind; opaque: 0 | 1; solid: 0 | 1; cullSelf: 0 | 1; leaf: 0 | 1;
  sway: 0 | 1; occupied: 0 | 1; fluid: 0 | 1; translucent: 0 | 1; emissive: num /*0..15*/;
  shape: num /*uShape 行号；kind≠7 时 0*/; facing: 0 | 1 | 2 | 3; axis: 0 | 1 | 2; flip: 0 | 1;
  tiles: [top: num, bot: num, side: num, front: num];   // 图集层号（宿主 B 资源包 → 可能 > 255，见 TODO-3）
  transmit: [r: num, g: num, b: num];                      // ×255；普通方块 255,255,255
  tint: num;                                                     // 染色组
}
// occupied 在 v2 里的确切用法（DF 占据 = occupied ∪ 流体表皮、uBrick 含流体）见 goal-renderapi-v2.ts §2′。

/** 宿主 B `model` → kind 映射（renderer-refactor §11.2，覆盖 doc/xyzb/all.md 全部 11 种 model） */
export const MODEL_TO_KIND = {
  cube: Kind.Cube, cross: Kind.Cross, crop: Kind.Cross /* TODO-5: 四片平行面变体 */, torch: Kind.Torch,
  box: Kind.Shape, layer: Kind.Shape, ladder: Kind.Shape, door: Kind.Shape,
  liquid: Kind.Fluid, fire: Kind.Cross /* emissive，meta=年龄不影响外观 → 16 行同状态 */, none: Kind.None,
} as const;

// ───────────────────────────────────────────────────────────────────────────────
// 2b. 贴图来源 TextureSource（用户 2026-11-05：兼容 procgen + 材质包 zip，材质包升到 Iris / labPBR；要 POM 与自发光贴图）
// ───────────────────────────────────────────────────────────────────────────────

/** 一个 tile 的 RGBA8 像素，行主序，res × res × 4 */
export type Px = Uint8ClampedArray;

/** 一层 = 一个贴图名的三张图；格式 = labPBR 1.3（Iris / OptiFine 包的 `<名>.png` / `<名>_n.png` / `<名>_s.png`）：
 *    albedo     RGBA（A = cutout / 半透明；goodGL tintMode 2 另把 α < 0.5 当「染色掩码」，见 BlockTable.tint）
 *    normal  _n R,G = 切线空间法线 xy（B 重建）；B = AO（255 = 无遮蔽）；A = 高度（255 = 表面顶，POM 用）
 *    specular _s R = 感知光滑度；G = F0（0..229 线性 ×255；≥ 230 = 金属预设，albedo 当 F0）；B = 孔隙 0..64 / SSS 65..255；A = 自发光 0..254（255 = 0）
 *  缺哪张就由渲染器从 albedo 推（rgl：PBR.build 的预设表），逐通道回退，不要求包三张齐。
 *  与 goodGL 现状的差：spec.A 在 goodGL 是 POM 深度 → 渲染器内部改为「每材质 POM 深度表」（预设 pom，包不覆盖），spec.A 让给自发光。 */
export interface TexLayer { albedo?: Px; normal?: Px; specular?: Px }   // 都已是 res²；缺 albedo = 只带 _n / _s 的 PBR 叠加包：albedo 用渲染器 procgen

export interface TextureSource {
  res: num;                                    // 本来源的 tile 分辨率（16 / 32 / 64 / 128）。渲染器自己定目标分辨率并缩放：放大最近邻、缩小按 α 加权平均
  get(name: string): TexLayer | null;          // name = **渲染器的贴图名**（rgl：SH.TEX_NAMES）；宿主名 ↔ 渲染器名的对照只在适配器（host-b.js PACK_NAME）
                                               //   null = 这层用渲染器自带 procgen（rgl：Textures.build + pgtex + PBR.build）；动画只取第 0 帧（.mcmeta 以后）
  version: num;                                // 换包 / 卸包 / 拖入 +1；渲染器发现变了就整表重建
  onChange?(cb: (what: 'blocks' | 'sky') => void): void;   // 推送（宿主 B：包 Atlas.build → 'blocks'；HDR 解码完 / 拖入 .hdr → 'sky'）；没有则渲染器每帧比 version
  name?: string;                               // 包名（面板 / 截图标注）
  sky?: SkyAssets;                             // 天空资产与开关（同一个包；缺省 = 渲染器自带的天空全开）
  props?: Record<string, string>;              // 包里的 properties 原文键值（见下）；渲染器只认它列出的键，其余忽略
}
// 叠加规则：「包里有的名字赢，其余 procgen」，**逐张**：包给了 `_n` / `_s` 就用包的，哪怕该层是 pgtex 的「保留」层（草顶 pgKeep 只在包只给 albedo 时生效）。
// 宿主 B 适配器 glsTextures(gg)：ResourcePack.load 收 `textures/block/<名>.png` 进 Atlas.packImages（按 Atlas.names 过滤），
//   `<名>_n.png` / `<名>_s.png` 另收进 ResourcePack.maps（同样按 <名> 过滤，⚠ 旧稿说「packImages 已经收了」是错的）；
//   Atlas.tileRes = 包内众数分辨率（≤128）。ProcTex（宿主 B 自己的程序化贴图）不经过这里：没有包的名字一律交给渲染器 procgen。
// 热重载：`?tex=url` 与「把 .zip 拖进游戏窗口」走同一个 ResourcePack.load，加载完 version + 1 并推 onChange('blocks')；POM / 自发光 / 天空一起重建，不用刷新页面。
// POM 深度：渲染器内部的每层深度表（rgl：PBR 预设 pom、pgtex pom），包不改表；包给了 `_n`（带高度）而预设 pom = 0 的层取 P.packPom。props.pomDepth 覆盖 P.packPom。

/** 天空资产（宿主 B：zip 里 `assets/minecraft/textures/environment/` 下的同名文件；`?pano=` / 拖入 .hdr 也进这里） */
export interface Img { w: num; h: num; data: Px }               // RGBA8，行 0 在上
export interface Pano { w: num; h: num; data: Uint16Array; mean: num }   // 等距柱状 HDR，RGBA16F（half 位模式），行 0 在上；mean = 上半球平均亮度（渲染器做自动曝光）
export interface SkyAssets {
  sun?: Img;                                   // sun.png（原版 32×32，黑底叠加；渲染器按原版几何画：半宽 0.15 tan）
  moon?: Img;                                  // moon_phases.png（4 × 2 格，第 0 格 = 满月，按 moonPhase 取格）
  show: { sun: boolean; moon: boolean; sky: boolean; stars: boolean };   // Iris shaders.properties 的同名键（缺省全 true）；sky = 大气天空底色
  day: Pano[];                                 // pano.hdr 或 pano1..9.hdr（按数字排序）
  night: Pano[];                               // pano_night.hdr 或 pano_night1..9.hdr
  timed: boolean;                              // 有数字 = 按昼夜进度在相邻两张间渐变；没数字 = 静态，不随时间 fade
}
// 全景规则（用户 2026-11-05）：
//   · 只有 day：整球都用它（地平线以下是全景自己的地面）；亮度跟大气天顶走，夜里自然变暗，渲染器的星星 / 银河照常叠在上面（受 show.stars 管）。
//   · 有 night：day / night 都只取上半球（d.y 钳到 ≥ 0），按太阳高度在两者间渐变成一个天空。
//   · timed：有 night 时 day 的 N 张均分白天（dayTime 0 → 0.5），night 的均分夜里；没 night 时 day 循环均分整个昼夜。
//   · 亮度：按 mean 归一化后乘大气天空天顶亮度（下雨 / 黄昏自动变暗），再乘 P.panoExp；P.panoClamp 截掉烘进全景的太阳（位置和游戏太阳对不上）。
// properties：zip 里任意 `shaders.properties` 或 `environment/*.properties`，`键=值` 行，# 注释。渲染器认 sun / moon / sky / stars（true/false）与 pomDepth（格）。
// 方块级的 BlockTable.emissive 仍保留（火把 / 岩浆没有 _s 的包也要发光）；有 _s.A 时逐纹素乘它。

// ───────────────────────────────────────────────────────────────────────────────
// 3. 环境输入 Env  [confirmed §10.3]
// ───────────────────────────────────────────────────────────────────────────────

export interface Env {
  sunDir: THREE.Vector3; sunVis: THREE.Vector3;              // 光照方向（含面板偏移前的原值）/ 可见日月方向
  skyTop: THREE.Color; skyHor: THREE.Color;                  // 天空球渐变（反射、云的环境光、星空背景）
  fogColor: THREE.Color; fogNear: num; fogFar: num;
  cloud?: { tex: THREE.Texture; color: THREE.Color; offset: THREE.Vector2; y: num };   // 2D 云图（风格 0/1）；无则只有风格 2 可用
  time: num;
  flying?: boolean;                                            // 玩家在飞 / 穿墙：rgl 据此降级花草锐阴影（walk 要质量，fly 随意）  [goal-remix R3b]
  dayTime?: num;                                             // 0..1，0 = 06:00（宿主 A = worldTime，宿主 B = Sky.time / 24000）；goodGL 管线（rgl）用它定日月位置，没有就当 0.02  [goal-remix R2]
  eyeInWater?: boolean;                                       // 相机在水中（读；与下面的 underwater() 通知是两回事）  [goal-remix R5]
  eyeBlk?: num;                                                // 眼处方块光 0..1（rgl：洞穴火把暖雾）；没有就当 0
  eyeSky?: num;                                                // 眼处天空光 0..1（洞穴系数 → 曝光 / 雾）；没有就当 1  [goal-remix R5]
  eyeWaterTop?: num;                                          // 相机在水里时，眼上方水面的世界 y（水下焦散 / 光束的水深起点）；不在水里 = undefined  [goal-remix 步骤 9c]
  weather?: { rain: num; thunder: num; wet: num; flash?: num };   // 宿主 A 没有（恒晴）；宿主 B = Weather 状态机  [goal-remix R5]
                                                //   thunder = 雷暴强度（持续，用来压暗）；flash = 闪电脉冲（落雷那一下 ~0.8，几百 ms 衰减到 0，用来提亮）  [11-09 修：曾把 thunder 当 flash]
  underwater?(flag: boolean, fog?: { near: num; far: num }): void;   // v2 通知宿主：相机在水中（宿主 B 自己决定要不要雾/遮罩）
                                                //   fog = v2 面板的水下雾近/远建议值（宿主 A 适配器照写进共享 U）；每帧调用一次  [goalP3P4 实现补充]
  hide?(what: 'clouds' | 'stars' | 'sky' | 'weather', flag: boolean): void;   // 渲染器接管了这些元素，请宿主别画
                                                //   'sky' = 天球 + 日月 + 星 + 云整组；'weather' = 宿主雨雪粒子  [goal-remix 加]
                                                //   [rgl 实现] gl 还没调 hide：直接把 ctx.sky/sun/moon/stars/clouds.visible 置 false（§0）；宿主 B 的 glsEnv 未实现 hide
}
// v2 对共享 U 的写入、GLSL 侧 isFluid / fluidTop 见 goal-renderapi-v2.ts §3′。

// ───────────────────────────────────────────────────────────────────────────────
// 4–6. v2 DDA 内部（GPU 布局 UVOX/UINFO/USHAPE、CPU 镜像 / 编辑队列 / Worker、目标数据流）
//      → 已拆到 goal-renderapi-v2.ts，节号不变。rgl 不用这几节。
// ───────────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────────
// 7. 两个宿主的适配器（草案）
// ───────────────────────────────────────────────────────────────────────────────

/** 宿主 A VoxelCraft.html（已有 voxelCraftSource/voxelCraftBlocks；voxelCraftEnv 待做，放 v2.js 尾部） */
export declare function voxelCraftSource(ctx: RendererCtx): ChunkSource;   // getChunk → {blocks, sky, blk}（无 meta；rev = 适配器全局 ++REV）；buildChunk→'blocks' disposeChunk→'gone' setBlock→onBlockChanged
export declare function voxelCraftBlocks(ctx: RendererCtx): BlockTable;    // 由 RENDER/OPAQUE/SOLID/T_* 拼；state() 默认实现（形状 0，忽略 meta）；EMIT → emissive；boxes = solid ? 满格 : 0
export declare function voxelCraftEnv(ctx: RendererCtx): Env;              // 把 render() 里对 ctx.U/skyMat/cloudMat/clouds/stars/#water 的直接读取搬进来（≈30 行）

/** 宿主 B index.html + gls.js（全部新建；需要宿主暴露：区块 Map、mesher 完成钩子、Lighting 完成钩子、CHUNK_H、Blocks.byId、tilesFor、blockBoxes、图集） */
export declare function glsSource(gg: unknown): ChunkSource;    // getChunk 读 world.chunks（state ≥ CH_LIT）：{blocks, meta: c.meta, sky, blk, rev: mesher 计数, aux}；事件见 §1 注释
export declare function glsBlocks(gg: unknown): BlockTable;     // state(id, meta) = Blocks.byId + tilesFor(def, meta) + blockBoxes(def, meta)：model→kind/shape、tint→组、light→emissive、transparent&&cube→translucent
export declare function glsEnv(gg: unknown): Env;               // 从宿主 B 的天空/雾/云/时间状态构造；underwater → 宿主自己的水下雾/遮罩
// [rgl 实现] 三者已在 rgl/host-b.js（给 gl 用的子集）：glsSource 有 biomes / rev / onBlockChanged(…, ch)，无 aux、不发 'light'；
//   glsBlocks 只有数组视图（kind/opaque/solid/occupied/cullSelf/emissive），无 state()/boxes()，tile* 为占位（gl 按名字走 ctx.glid）；
//   glsEnv 有 dayTime/weather/flying/eyeInWater/eyeSky/eyeBlk/eyeWaterTop/time/underwater，无 sunDir/sky*/fog*（gl 自算）、无 hide。
//   v2 on B 要的部分（state()/boxes()/uInfo RGBA16UI/aux/rd 钳）仍按 goalP4P5 步骤 2。
export declare function glsTextures(gg: unknown): TextureSource;   // §2b：Atlas.packImages + ResourcePack.maps → labPBR 三张；ResourcePack.sky → SkyAssets（HDR 用 three/addons/loaders/HDRLoader.js 解码）
// 宿主 B 的材质：图集 → DataArrayTexture 由渲染器从 TextureSource 建（albedo / normal / specular 三个阵列，同层号），资源包加载后重建；动画帧先取第 0 帧。
//   v2 若还接宿主 B，同样从 TextureSource 建自己的阵列（matSample GLSL 原样复用），不再另走图集拷贝。
// 宿主 B 的 gls 网格与 v2 并存（热切换）时，体素 / aux 只算一次，两边共用。

// ───────────────────────────────────────────────────────────────────────────────
// 8. 宿主 B 同步升级的数据对象（renderer-refactor §12；沿用 game-spec §9：数据进 c_*，行为进 gg.my(new class …)）
// ───────────────────────────────────────────────────────────────────────────────

export interface c_Render { backend: 'gls' | 'v2'; key: 'F6' }      // Render 单例：切 v2 → chunkGroup.visible=false，复用 VR；XRay / modeDef.solidWater / 标题预览 / 屏保 → 强制 gls
export interface c_DbgFreeze { on: boolean; time: num /*0.12*/; weather: 'clear'; cloudX: num; tick: boolean }   // 停 Weather / Scheduler / RandomTicks / Mobs 20 Hz tick / 云偏移 / 水波相位
export interface BenchPose { name: string; x: num; y: num; z: num; yaw: num; pitch: num; time?: num }
export interface c_Bench { poses: BenchPose[] }                      // 默认 plain / canopy / cave / water / uw / models；?pose=name；bench-v2.mjs --url 读它
export interface c_Veg {                                             // 宿主 B 的植被设置（数据对象）；gls 网格器 / 着色器与渲染器同读
  // —— 宿主自己用（gls 网格器 + source.tintColor；不进渲染器 P）——
  tintMode: 'biome' | 'climate';                                     // 改了 → VR.retint()
  leafCull: boolean; crossSway: boolean; swayAmp: num; swayFreq: num; swayDist: num;   // gls 侧摆动 / 树叶内部剔除
  // —— 渲染器参数：经 VEG_KEYS 映射到 rgl P 键（rgl 是基准，键名以 rgl/index.js P_DEFAULTS 为准）——
  waving: boolean; sharpDist: num; sharpFly: num; leafPbr: num; leafGlow: num;
}
/** c_Veg 字段 → 渲染器 P 键；null = 只给宿主用。写入：VR.P[k] = c_Veg[f]; VR.apply(k)。放在适配器里（host-b.js），渲染器不认 c_Veg */
export const VEG_KEYS: Record<keyof c_Veg, string | null> = {
  tintMode: null, leafCull: null, crossSway: null, swayAmp: null, swayFreq: null, swayDist: null,
  waving: 'waving', sharpDist: 'sharpDist', sharpFly: 'sharpFly', leafPbr: 'leafPbr', leafGlow: 'leafGlow',
};
// 旧稿的 leafStyle / leafShadow / leafShadowDist / leafLodDist 是 v2 专用，随 v2 退出 c_Veg（v2 若再接，用它自己的 P 键）。
// swayAmp / swayFreq 在 rgl 里还没有对应（goodGL WAVE 幅度固定）；rgl 加了 P 键后把 null 改成键名即可。
// 验证世界：test/bw_models.webp（TODO-6 定名）；?xyzb=<url>&pose=models；bwebp 只存改动区块，head.seed 固定（chunks_dat.md）。

// ───────────────────────────────────────────────────────────────────────────────
// 9. 用户已经确认 —— 默认值已按 meta.md 取
// ───────────────────────────────────────────────────────────────────────────────
/*
TODO-1  ChunkSource.rev 必填（meta.md）还是可选（§10.1 已确认版）？         默认：可选
TODO-2  DF occupied 是否含流体？§2.1/§3.4 含、meta.md 不含。                默认：不含（meta.md），配合 uWaterVis 截断；uBrick 仍含。DF 未就绪时的退化路径，必须保守，避免漏步进。
        [goalP3P4 实现补充] state.occupied 不含流体照旧；DF 用的占据另加「流体表皮」（见 §2 注释），否则跳跃会越过水面。
        uWaterVis 截断未做（会改画面，不满足 0 px 约束）。
TODO-3  uInfo 位宽：meta.md RGBA8UI；宿主 B 资源包 tile 可能 > 255。        默认：布局不变、整表升 RGBA16UI（128 KB）；宿主 A 不受影响。
TODO-4  fluidTop(meta 0)：§11.2 = 14/16；meta.md = 1 − level/9 + uFluidTop0 微调。  默认：meta.md 公式，uFluidTop0 使 meta 0 → 0.875（宿主 A 0 px 硬要求）。
TODO-5  crop 的「四片平行面」几何：meta.md 没有该位。                         默认：按 cross 画（P4a/b 允许偏差）；不做
TODO-6  验证世界文件名：§12.5 标题 bw_topic.webp / 正文 bw_house.webp。     默认：test/bw_models.webp。
TODO-7  BlockTable 的 JS 形态：§11.2 的 variants/shape 大数组 vs meta.md 的 state()/boxes()。  默认：state()/boxes()（已确认字段名不动，只加方法）。
（以下为 2026-11-05 用户拍板）
D-8     基准：rgl 是基准渲染器、宿主 B 是主宿主；宿主 A 只差云 / 树移植与 panify 后退役。新字段先满足 rgl + 宿主 B。
D-9     贴图：TextureSource（§2b），procgen + 材质包 zip，包格式按 Iris / labPBR（_n / _s）；本轮只要 POM（_n.A 高度）与自发光（_s.A）。
        宿主 B 做 glsTextures（图集 → 渲染器的 DataArrayTexture）。
D-10    染色：做 uBio / tint。颜色走回调 source.tintColor(group, biome, temp, hum)（宿主网格器同源）；组编号按 goodGL（Tint 枚举）。
D-11    c_Veg：渲染器参数以 rgl P 键为准，对应表 VEG_KEYS 放适配器，经 VR.P + apply(key) 写入。
D-12    天空资产随资源包走（§2b SkyAssets）：sun.png / moon_phases.png、Iris 开关 sun / moon / sky / stars、pano{,1-9}.hdr + pano_night{,1-9}.hdr；
        HDR 用 three/addons/loaders/HDRLoader.js（three 0.170 没有，importmap 单独指到 0.180 的文件）。.zip / .hdr 拖进窗口热重载（2026-11-05）。
*/

