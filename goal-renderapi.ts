/**
 * goal-renderapi.ts — v2 DDA 渲染器的目标接口 + 目标数据流（伪代码）
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
 *   - 本文件不是实现，不被任何模块 import；伪代码函数体用注释/`/* … */` 表示。
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
}

export interface Renderer {
  name: 'v1' | 'v2';
  buildChunk(c: HostChunk): void;    // 可重入；宿主 A 的事件源（映射为 'blocks'）
  disposeChunk(c: HostChunk): void;  // 之后 c.mesh = c.waterMesh = null（宿主 A 约定）
  update(dt: num): void;          // 每帧：flush 编辑队列 → 轮询 Env → 更新 uniform
  render(): void;                    // 主循环：clear; VR.render(); clearDepth; hudScene
  stats(): RendererStats;
  // v2 额外导出（已有）
  source?: ChunkSource; blockTable?: BlockTable;
  apply?(key: string): void;         // 面板参数同步（§12.4 宿主 B 的 c_Veg → P）
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
  biomes?: U8;               // 宿主 B：256 项 (z,x) 序群系 id（chunks_dat.md 'bio' 列）
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
  rev?: num;                                  // 单调递增版本号：uploadChunk 用它去重（同 rev 不重传）
                                                 //   ★ meta.md 写成必填；这里保持可选：缺省 = 每次事件都重传
  aux?: ChunkAux;                                // Mesher/光照副产品，缺省 v2 在 uploadChunk 里自算
}

export interface ChunkSource {
  size: 16; height: num;                      // height = 16 的倍数，≤256（宿主 A 96 / 宿主 B 128）
  getChunk(cx: num, cz: num): ChunkData | null;   // null = 未加载/已卸载 → v2 清槽位
  getBlocks?(cx: num, cz: num): U8 | undefined;  // leafPost 读邻块；可缺省（退化为 getChunk().blocks）
  forEachChunk(fn: (cx: num, cz: num) => void): void;    // rebuildRing 后整环重传用
  onChunkChanged(cb: (cx: num, cz: num, what: ChunkEvent) => void): void;
  onBlockChanged?(cb: (x: num, y: num, z: num) => void): void;
  // ★ meta.md §4.1：单格编辑 / 流体 tick / 作物生长 / 门开关 → 走 §4 编辑队列；没有它则退化为整块 'blocks'
}

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
// 事件语义：
//   'blocks' → 整块重扫（镜像重建 + 整块上传 + 砖/列高/段 + Worker load）
//   'light'  → 只改镜像 G 通道 + 整块上传；不碰砖/列高/DF/leafPost，不发 Worker（宿主每帧去抖，每区块最多一次）
//   'gone'   → clearChunk（列高 0）+ Worker unload + 槽位释放
// 宿主 A 适配器：buildChunk → 'blocks'（分不出光照变化，先这样）；disposeChunk → 'gone'；setBlock → onBlockChanged。
// 宿主 B 适配器：mesher 完成 → 'blocks'；Lighting 收敛 → 'light'；world.chunks.delete → 'gone'；Events 'blockChanged' → onBlockChanged。

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
  tint?: U8;       // 生物群系染色组：0 无 1 grass 2 foliage 3 water 4 birch 5 spruce …（宿主 A 全 0）
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
// occupied（DF 占据位）定义：kind ≠ 0 ∧ !fluid  —— [meta.md §2.1]，覆盖 renderer-refactor §2.1/§3.4 的「kind≠0 含水」。
// uBrick 砖占用仍按 kind ≠ 0（含流体）：它是 DF 未就绪时的退化路径，必须保守。[meta.md §2.4]

/** 宿主 B `model` → kind 映射（renderer-refactor §11.2，覆盖 doc/xyzb/all.md 全部 11 种 model） */
export const MODEL_TO_KIND = {
  cube: Kind.Cube, cross: Kind.Cross, crop: Kind.Cross /* TODO-5: 四片平行面变体 */, torch: Kind.Torch,
  box: Kind.Shape, layer: Kind.Shape, ladder: Kind.Shape, door: Kind.Shape,
  liquid: Kind.Fluid, fire: Kind.Cross /* emissive，meta=年龄不影响外观 → 16 行同状态 */, none: Kind.None,
} as const;

// ───────────────────────────────────────────────────────────────────────────────
// 3. 环境输入 Env  [confirmed §10.3]
// ───────────────────────────────────────────────────────────────────────────────

export interface Env {
  sunDir: THREE.Vector3; sunVis: THREE.Vector3;              // 光照方向（含面板偏移前的原值）/ 可见日月方向
  skyTop: THREE.Color; skyHor: THREE.Color;                  // 天空球渐变（反射、云的环境光、星空背景）
  fogColor: THREE.Color; fogNear: num; fogFar: num;
  cloud?: { tex: THREE.Texture; color: THREE.Color; offset: THREE.Vector2; y: num };   // 2D 云图（风格 0/1）；无则只有风格 2 可用
  time: num;
  underwater?(flag: boolean): void;             // v2 通知宿主：相机在水中（宿主 B 自己决定要不要雾/遮罩）
  hide?(what: 'clouds' | 'stars', flag: boolean): void;   // v2 接管了这些天空元素，请宿主别画
}
// 落地后 v2 对 U 的写入只剩 uFogNear/uFogFar，并通过 env.underwater 改为宿主自己写；
// verify 加 grep 检查：v2.js 不再直接读 ctx.skyMat / cloudMat / clouds / stars / getBlock / document#water。

// ───────────────────────────────────────────────────────────────────────────────
// 4. GPU 侧数据布局  [meta.md §2]（已评审；renderer-refactor §3.4/§3.5/§9.2-3/§11.1 的 uDist/RGB8UI 方案作废）
// ───────────────────────────────────────────────────────────────────────────────

/** uVox · RGBA8UI 3D · SX × H × SX（环形，SX = (2rd+5)·16），z 主序：((lz*H + y)*16 + lx)*4 */
export const UVOX = {
  R: 'id',                             // 宿主 blocks；192..255 为 v2 派生 id（仅 LEAF_OK）
  G: 'sky<<4 | blk',                   // 缺省 0xF0
  B: 'meta',                           // 宿主 meta 原样（宿主 A 恒 0）；shader 只用 meta&15 选 uInfo 行
  A: {                                 // dist | flags
    DIST_MASK: 0x1f,                   // bit0–4：v = 0 未计算 / 1 本格占据 / v≥2 → d = v−1 / 上限 T+1（T=16，可到 30）
    OPAQUE: 1 << 5,                    // 冗余拷贝自 uInfo：smoothLight / 砖内判定省一次查表
    LEAF: 1 << 6,                      // 阴影档 / LOD 分支不查表
    FLUID: 1 << 7,                     // DF occupancy 不含流体；trace 用它走 fluidTop 相交
    // ⚠ renderer-refactor §11.1 写的「高 3 位 = opaque/solid/leaf」作废：solid 不进 A 通道（meta.md）。
  },
} as const;

/** uInfo · 2D · 256 × 64：列 = id，行 = (meta & 15) * 4 + k。宿主 A 无 meta → 16 个变体行复制同一状态 */
export const UINFO = {
  format: 'RGBA8UI' as 'RGBA8UI' | 'RGBA16UI',   // TODO-3：资源包 tile > 255 时整表升 RGBA16UI（128 KB），布局不变
  k0: { r: 'kind(0–3) | opaque<<4 | solid<<5 | cullSelf<<6 | leaf<<7', g: 'tileTop', b: 'tileBot', a: 'tileSide' },
  k1: { r: 'shape 行号', g: 'facing(0–1) | axis<<2 | flip<<4', b: 'emissive(0–3) | fluid<<4 | translucent<<5 | occupied<<6 | sway<<7', a: 'tileFront' },
  k2: { rgb: 'transmit ×255', a: 'tint 组' },
  k3: { all: '保留 0（§3.5 faceAO 若做放这里）' },
} as const;
// ⚠ renderer-refactor §11.2 的另一套 texel 分配（k0 含 sway/crop4、g = shape 行、RGBA16UI）与 meta.md 冲突 → 以上表为准；
//   crop4 位见 TODO-5。

/** uShape · RGBA8UI 2D · 8 × 256：行 = shape id（0 = 满格），每行 ≤4 个 AABB，1/16 单位，canonical 朝向（facing 0, flip 0） */
export const USHAPE = {
  texel: (k: num) => ({ even: `2k   : (x0,y0,z0, n)        n = AABB 个数，仅 k=0 有效`, odd: `2k+1 : (x1,y1,z1, uvMode)  0 世界投影 / 1 按 AABB 展开` }),
  preset: { cube: 0, slab: 1, stairs: 2, torch_floor: 5, torch_wall: 6, door: 7, ladder: 8, layer_1_8: '9..16', box_host: '17+（宿主 def.box 按出现顺序分配）' },
} as const;
// 共享 JS 模块 shapes.js（≤100 行）：形状表 + rotateBox(box, facing, flip)；宿主 B 的 blockBoxes 与 v2 适配器都 import 它（只能有一处真值）。

/** uCol · RGBA16UI 2D（不变）：r = maxY+1，g = 区块坐标低 8 位 x | z<<8，b = 全空段掩码，a = 全不透明段掩码 */
/** uBrick · R8UI 3D（不变）：4³ 砖占用，kind≠0 含流体 */
/** uBio · RG8（LINEAR）2D · SX × SX（新增，P4c）：量化 temp/hum；配 3 张 64² 色图（草/叶/水）。过渡期由 biomes[256] 映射到群系代表点 */

/** 内存上限（RGBA8UI，H=128，N=2rd+5）：rd 6 → 37.9 MB，8 → 57.8，10 → 81.9，12 → 110，16 → 179。宿主 B 里 v2 钳 rd ≤ 10（硬约束）。 */
export const HOST_B_RD_MAX = 10;

// ───────────────────────────────────────────────────────────────────────────────
// 5. CPU 镜像 + 编辑队列 + Worker 协议  [meta.md §4.2/§5] + [renderer-refactor §3.4]
// ───────────────────────────────────────────────────────────────────────────────

/** 镜像 = GPU 内容的真值；所有上传都从镜像切出；reuploadAll 遍历镜像，不回宿主重扫 */
export interface Mirror {
  buf: U8;                   // N² 槽位 × 16·H·16 × 4，布局与 stVox 相同
  owner: string[];                   // 槽位 → "cx,cz"（归属校验）
  rev: Int32Array;                   // 槽位 → 上次上传的 rev
}

/** 编辑队列：连续 Int32Array，每帧 flush 一次 */
export const EDITQ = {
  QMAX: 4096,
  pack: (slot: num, lx: num, lz: num, y: num) => (slot << 16) | ((lx * 16 + lz) << 8) | y,  // slot < 841 → 10 bit
  overflow: '该帧降级：涉及的 slot 全部走 blocks 整块重传',
} as const;

/** DF Worker（v2-dist.worker.js）消息 */
export type ToWorker =
  | { t: 'init'; height: num; occupied: U8 /*256×16: state(id,meta).occupied*/ }
  | { t: 'load'; cx: num; cz: num; blocks: U8; meta?: U8 }   // copy，不要 transfer 掉宿主数组
  | { t: 'unload'; cx: num; cz: num }                                         // 不重算邻居（边界 d 偏小，安全）
  | { t: 'edit'; edits: Int32Array /*[x,y,z,occ]×n，一帧一条*/ };
export type FromWorker =
  | { t: 'dist'; cx: num; cz: num; a: U8 /*16·H·16，只含 A 通道低 5 位*/ };  // transfer；主线程校验槽位归属后合并进镜像 A 通道
// Worker 规则：edit 优先于 load；同区块入队去重；load 完成后把 8 个邻居入队重算；邻居未加载视为空气。

// ───────────────────────────────────────────────────────────────────────────────
// 6. 目标数据流（伪代码）
// ───────────────────────────────────────────────────────────────────────────────

/*
┌─ 宿主 ───────────────────────────┐   ┌─ 适配器 ─────────────────┐   ┌─ v2（CPU）──────────────────┐   ┌─ GPU ─────────┐
│ 生成 / 光照 BFS / 流体 tick / 编辑 │──▶│ ChunkSource 事件 + rev    │──▶│ mirror[slot] RGBA8 (A.dist ←─ Worker)│──▶│ uVox RGBA8UI   │
│ Mesher.greedy（宿主 B）          │──▶│ aux: maxY/sect/brick      │──▶│ uCol / uBrick 增量              │──▶│ uCol / uBrick   │
│ Blocks.byId / RENDER 表          │──▶│ BlockTable.state/boxes    │──▶│ rebuildInfo（建表一次，改表重建）│──▶│ uInfo / uShape  │
│ 天空 / 雾 / 云 / 时间            │──▶│ Env（每帧轮询）           │──▶│ uniform                         │──▶│ trace → main    │
│ 实体 / 粒子 / 天气（three 场景） │──────────────────────────────────▶ sceneRT（深度）────────────────▶│ comp 合成       │
└──────────────────────────────────┘   └──────────────────────────┘   └────────────────────────────────┘   └────────────────┘
*/

declare const SRC: ChunkSource, BT: BlockTable, ENV: Env, MIR: Mirror, WORKER: Worker;
declare function slotOf(cx: num, cz: num): num;
declare function packLight(sky?: U8, blk?: U8, light?: U8, i?: num): num;

/** 6.1 建表（创建时 + BlockTable 变化时：加载资源包 / 改方块表 → rebuildInfo + reuploadAll） */
function rebuildInfo() {
  for (let id = 0; id < 256; id++) for (let m = 0; m < 16; m++) {
    const s = BT.state ? BT.state(id, m) : defaultState(BT, id);   // 宿主 A：16 行复制同一状态
    /* 写 uInfo[(m*4+0..3)][id] 四个 texel（UINFO 布局）；收集 s.shape 的 AABB → uShape 行 */
  }
  /* 上传 uInfo (64 KB) / uShape；同时把 state.occupied 表发给 Worker init */
}
declare function defaultState(bt: BlockTable, id: num): BlockState;

/** 6.2 事件入口 */
function onSourceEvent(cx: num, cz: num, what: ChunkEvent) {
  const slot = slotOf(cx, cz); const c = SRC.getChunk(cx, cz);
  if (what === 'gone' || !c) { /* clearChunk(slot)：uCol 列高 0；MIR.owner[slot] = ''；WORKER.postMessage({t:'unload'}) */ return; }
  if (c.rev !== undefined && c.rev === MIR.rev[slot] && MIR.owner[slot] === `${cx},${cz}`) return;   // rev 去重
  if (what === 'light') { uploadLight(slot, c); return; }
  uploadChunk(slot, cx, cz, c);
}

/** 6.3 整块上传（'blocks'）：有 aux.x 就用，没有就算 */
function uploadChunk(slot: num, cx: num, cz: num, c: ChunkData) {
  const H = SRC.height, keepDist = MIR.owner[slot] === `${cx},${cz}`;
  for (let lx = 0; lx < 16; lx++) for (let lz = 0; lz < 16; lz++) for (let y = 0; y < H; y++) {
    const i = (lx * 16 + lz) * H + y, id = c.blocks[i], m = c.meta ? c.meta[i] : 0;
    const st = cachedState(id, m);                                    // 256×16 预解码
    /* mirror R = id (leafPost 可改写为 192..255)；G = packLight(...)；B = m；
       A.flags = st.opaque<<5 | st.leaf<<6 | st.fluid<<7；
       A.dist  = keepDist && !becameOccupied ? 旧值 : (st.occupied ? 1 : 0)   // 新占据格写 1（偏小安全） */
  }
  /* aux.maxY/sectEmpty/sectFull → uCol[slot]（缺省则扫描计算）；aux.brick → stBrick（缺省则按 kind≠0 置位）；
     aux.dist → 直接写 A 通道低 5 位（跳过 Worker）；否则 WORKER.postMessage({t:'load', cx, cz, blocks: copy, meta: copy})
     copyTextureToTexture3D(mirror[slot] → uVox[slot])；MIR.owner/rev 更新；worldMaxY 按需重算 */
}
declare function cachedState(id: num, meta: num): BlockState;

/** 6.4 光照快路径（'light'）：只动 G 通道，整块重传；CPU 侧零扫描副作用 */
function uploadLight(slot: num, c: ChunkData) {
  /* for i: mirror[slot][i].G = packLight(c.sky, c.blk, c.light, i)；copyTextureToTexture3D；MIR.rev 更新 */
}

/** 6.5 单格编辑 → 队列 → 每帧 flush（update() 开头、updateChunks 之后）[meta.md §4.2] */
const editQ = new Int32Array(EDITQ.QMAX); let qLen = 0;
function onBlockChanged(x: num, y: num, z: num) {
  const cx = x >> 4, cz = z >> 4, slot = slotOf(cx, cz);
  if (qLen === EDITQ.QMAX) { /* 标记 slot 整块降级 */ return; }
  editQ[qLen++] = EDITQ.pack(slot, x & 15, z & 15, y);
}
function flushEdits() {
  /* 1. 按 slot 分组 → 每槽位一个脏包围盒 lo/hi
     2. 包围盒内每格：getChunk 读 id/meta/light → state() → 写镜像 RGBA（A.dist 保留，只改 flags 三位）
     3. occupied 0→1（放置）：对 (2T+1)³ 盒子（跨槽位，仅已加载且归属正确）dist = min(dist, cheb+1)；主线程同步，不等 Worker
     4. occupied 1→0（移除）：该格 dist 写 1（仍当占据 → shader 取 id 发现空 → 步进 1 格，安全）；等 Worker edit 回包覆盖
     5. 每槽位一次 texSubImage3D（脏盒；≥半块时整块 copyTextureToTexture3D）；增量重算触及的砖 / 列高 / 段掩码
     6. 本帧全部编辑打成一条 {t:'edit'} 发给 Worker；qLen = 0 */
}

/** 6.6 Worker 回包 */
function onWorkerDist(msg: FromWorker) {
  const slot = slotOf(msg.cx, msg.cz);
  if (MIR.owner[slot] !== `${msg.cx},${msg.cz}`) return;             // 槽位已被别的区块占用 → 丢弃
  /* 合并：mirror[slot][i].A = (A & 0xe0) | (msg.a[i] & 0x1f)；整块 copyTextureToTexture3D */
}

/** 6.7 每帧 */
function update(dt: num) {
  flushEdits();
  /* 轮询 ENV：uSunDir/uSky*/ /* fog → 宿主自己写；相机格流体判定用 SRC.getChunk + state().fluid → ENV.underwater?(flag) */
  /* 面板 P 变化 → syncDefines()（#if SHAPES / LEAF / WATER_STYLE / CLOUD_STYLE / DF / SECT …） */
}

/** 6.8 着色器主射线分派（伪 GLSL，trace 体素级；[meta.md §3] + [renderer-refactor §3.6]） */
/*
clip to ring AABB / maxD；天空早退 (uWorldMaxY)
loop (≤512, 预算 uSteps):
  换区块列 → uCol：cell.y ≥ maxY → 跳列出口；[#if SECT] 全空段跳 / 全实段命中入口
  vox = texelFetch(uVox, cell)
  v = vox.a & 0x1f
    v == 0 → 退化：uBrick 砖级一步（现有）
    v >= 3 → 盒跳跃 k = v-2：t = 出口；cell = floor(ro + r*(t+ε))
    v == 2 → 体素步进 1 格（本格确定空，不取 id）
    v == 1 → 命中候选：
      if (vox.a & FLUID)        → fluidTop(cell, id, meta, aboveSameFluid)；记录 tw；首次入水 maxD = min(maxD, tw + uWaterVis)   // [meta.md §4.3]
      else kind = info0.r & 15
        1 cube   → opaque ? 命中 : cutout alpha；translucent → transmit *= info2.rgb 继续
        2/3      → crossHit / torchHit（现有）
        7 shape  → boxesHit(info1.r, info1.g, ro, r)：射线转 canonical（−facing·90°，flip y→1−y），≤4 AABB slab 取最近   [#if SHAPES]
        5/6      → v2 内部 halo / 卡片（现有）
      emissive > 0 → light = max(light, emissive/15)，不打阴影射线
预算耗尽 → kind=4 全雾（现有）
阴影射线复用同一循环（shadow=true：不记录水、不做 cutout 采样、nAlpha ≤ 2）
*/

// ───────────────────────────────────────────────────────────────────────────────
// 7. 两个宿主的适配器（草案）
// ───────────────────────────────────────────────────────────────────────────────

/** 宿主 A VoxelCraft.html（已有 voxelCraftSource/voxelCraftBlocks；voxelCraftEnv 待做，放 v2.js 尾部） */
export declare function voxelCraftSource(ctx: RendererCtx): ChunkSource;   // getChunk → {blocks, sky, blk}（无 meta/rev → rev = buildChunk 计数）；buildChunk→'blocks' disposeChunk→'gone' setBlock→onBlockChanged
export declare function voxelCraftBlocks(ctx: RendererCtx): BlockTable;    // 由 RENDER/OPAQUE/SOLID/T_* 拼；state() 默认实现（形状 0，忽略 meta）；EMIT → emissive；boxes = solid ? 满格 : 0
export declare function voxelCraftEnv(ctx: RendererCtx): Env;              // 把 render() 里对 ctx.U/skyMat/cloudMat/clouds/stars/#water 的直接读取搬进来（≈30 行）

/** 宿主 B index.html + gls.js（全部新建；需要宿主暴露：区块 Map、mesher 完成钩子、Lighting 完成钩子、CHUNK_H、Blocks.byId、tilesFor、blockBoxes、图集） */
export declare function glsSource(gg: unknown): ChunkSource;    // getChunk 读 world.chunks（state ≥ CH_LIT）：{blocks, meta: c.meta, sky, blk, rev: mesher 计数, aux}；事件见 §1 注释
export declare function glsBlocks(gg: unknown): BlockTable;     // state(id, meta) = Blocks.byId + tilesFor(def, meta) + blockBoxes(def, meta)：model→kind/shape、tint→组、light→emissive、transparent&&cube→translucent
export declare function glsEnv(gg: unknown): Env;               // 从宿主 B 的天空/雾/云/时间状态构造；underwater → 宿主自己的水下雾/遮罩
// 宿主 B 的材质：2D 图集 → 逐 16×16 tile 拷贝成 DataArrayTexture（资源包加载后重建），matSample GLSL 原样复用；动画帧先取第 0 帧。
// 宿主 B 的 gls 网格与 v2 并存（热切换）时，体素 / aux 只算一次，两边共用。

// ───────────────────────────────────────────────────────────────────────────────
// 8. 宿主 B 同步升级的数据对象（renderer-refactor §12；沿用 game-spec §9：数据进 c_*，行为进 gg.my(new class …)）
// ───────────────────────────────────────────────────────────────────────────────

export interface c_Render { backend: 'gls' | 'v2'; key: 'F6' }      // Render 单例：切 v2 → chunkGroup.visible=false，复用 VR；XRay / modeDef.solidWater / 标题预览 / 屏保 → 强制 gls
export interface c_DbgFreeze { on: boolean; time: num /*0.12*/; weather: 'clear'; cloudX: num; tick: boolean }   // 停 Weather / Scheduler / RandomTicks / Mobs 20 Hz tick / 云偏移 / 水波相位
export interface BenchPose { name: string; x: num; y: num; z: num; yaw: num; pitch: num; time?: num }
export interface c_Bench { poses: BenchPose[] }                      // 默认 plain / canopy / cave / water / uw / models；?pose=name；bench-v2.mjs --url 读它
export interface c_Veg {                                             // gls mesher/着色器 与 v2 适配器同读；默认全 0/关 = 与 p0 一致
  swayAmp: num; swayFreq: num; swayDist: num; crossSway: boolean;
  leafCull: boolean; tintMode: 'biome' | 'climate';
  leafStyle: 'block' | 'card'; leafShadow: num; leafShadowDist: num; leafLodDist: num;   // 后三组「仅 v2」
}
// 验证世界：test/bw_models.webp（TODO-6 定名）；?xyzb=<url>&pose=models；bwebp 只存改动区块，head.seed 固定（chunks_dat.md）。

// ───────────────────────────────────────────────────────────────────────────────
// 9. 用户已经确认 —— 默认值已按 meta.md 取
// ───────────────────────────────────────────────────────────────────────────────
/*
TODO-1  ChunkSource.rev 必填（meta.md）还是可选（§10.1 已确认版）？         默认：可选
TODO-2  DF occupied 是否含流体？§2.1/§3.4 含、meta.md 不含。                默认：不含（meta.md），配合 uWaterVis 截断；uBrick 仍含。DF 未就绪时的退化路径，必须保守，避免漏步进。
TODO-3  uInfo 位宽：meta.md RGBA8UI；宿主 B 资源包 tile 可能 > 255。        默认：布局不变、整表升 RGBA16UI（128 KB）；宿主 A 不受影响。
TODO-4  fluidTop(meta 0)：§11.2 = 14/16；meta.md = 1 − level/9 + uFluidTop0 微调。  默认：meta.md 公式，uFluidTop0 使 meta 0 → 0.875（宿主 A 0 px 硬要求）。
TODO-5  crop 的「四片平行面」几何：meta.md 没有该位。                         默认：按 cross 画（P4a/b 允许偏差）；不做
TODO-6  验证世界文件名：§12.5 标题 bw_topic.webp / 正文 bw_house.webp。     默认：test/bw_models.webp。
TODO-7  BlockTable 的 JS 形态：§11.2 的 variants/shape 大数组 vs meta.md 的 state()/boxes()。  默认：state()/boxes()（已确认字段名不动，只加方法）。
*/

