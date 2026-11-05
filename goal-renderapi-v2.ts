/**
 * goal-renderapi-v2.ts — v2 DDA 渲染器（v2/old.js、v2/gl.js）的内部布局与数据流（伪代码）
 *
 * 从 goal-renderapi.ts 拆出（2026-11-05）：宿主契约（§0–§3、§7–§9）留在那边，这里只放 v2 私有的 §4–§6。
 *   节号与拆分前相同，代码 / 文档里「goal-renderapi §4 UVOX」「§6.5 EDITQ」这类引用照旧有效，只是换到本文件。
 *   rgl（?r=gl）不读本文件的任何内容；换掉 v2 时整份文件随之作废。
 * 约定同 goal-renderapi.ts 文件头（[confirmed §x] / [meta.md §x] / [goalP3P4 实现] / TODO-n）。
 */

import type { ChunkSource, ChunkData, ChunkEvent, BlockTable, BlockState, Env } from './goal-renderapi';

type U8 = Uint8Array
type num = number

// ───────────────────────────────────────────────────────────────────────────────
// 2′. 占据位与 DF（原 goal-renderapi.ts §2 末尾）
// ───────────────────────────────────────────────────────────────────────────────
// occupied（DF 占据位）定义：kind ≠ 0 ∧ !fluid  —— [meta.md §2.1]，覆盖 renderer-refactor §2.1/§3.4 的「kind≠0 含水」。
// [goalP3P4 实现补充] DF 实际用的占据 = occupied ∪ 流体表皮。纯「不含流体」时盒跳跃会整个跳过水面（首次入水格、出水格都在盒里）→ 画面错；
//   表皮保证入水 / 出水格必被逐格走到，内部流体照跳。v2 保留 id（halo 192..254、LEAVES_INNER 255）的 state.occupied = 1。
// uBrick 砖占用仍按 kind ≠ 0（含流体）：它是 DF 未就绪时的退化路径，必须保守。[meta.md §2.4]

// ───────────────────────────────────────────────────────────────────────────────
// 3′. Env 在 v2 里的落点（原 goal-renderapi.ts §3 末尾）
// ───────────────────────────────────────────────────────────────────────────────
// 落地后 v2 对 U 的写入只剩 uFogNear/uFogFar，并通过 env.underwater 改为宿主自己写；
// verify 加 grep 检查：v2.js 不再直接读 ctx.skyMat / cloudMat / clouds / stars / getBlock / document#water。
// [已落地 goalP3P4 第 3 步] voxelCraftEnv 用 getter 包宿主状态；宿主 #water 遮罩隐藏也搬进 underwater()；相机格流体判定走 SRC.getBlocks。
// GLSL 侧：bool isFluid(uvec4 vox)（读 uVox.A FLUID 位）、float fluidTop(uint lvl, bool above)（不需要格坐标 / id，TODO-4 公式）。

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
                                       //   [goalP3P4 实现] d = 到「本区块」最近 DF 占据格的切比雪夫距离（区块外视为空，y<0 视为占据），
                                       //   着色器把跳跃盒裁到当前区块 xz → 区块间零依赖（邻块加载 / 卸载不需要重算，也没有不安全窗口）。
                                       //   DF 占据 = occupied ∪ 流体表皮（流体格且 6 邻有非流体；y 越界与跨区块邻格按非流体），见 TODO-2 补充
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

/** DF Worker 消息  [goalP3P4 实现：无状态 Worker，替代原 init/load/unload/edit 草案]
 *  DF 只依赖本区块（见 UVOX.A），占据分类（含树叶后处理改写的 v2 id 与流体表皮）主线程扫描时本来就要算 →
 *  主线程每次整块上传 / 编辑 flush 后发一份占据数组，Worker 只做截断切比雪夫变换（v2.js 的 dfTransform，toString 后进 Blob Worker）。
 *  没有镜像、没有邻居重算队列；无 Worker 环境主线程同步算。 */
export type ToWorker =
  | { t: 'occ'; cx: num; cz: num; seq: num; occ: U8 /*16·H·16，索引同 blocks，1 = DF 占据*/ };   // transfer（是主线程拷贝）
export type FromWorker =
  | { t: 'dist'; cx: num; cz: num; seq: num; a: U8 /*16·H·16，v = min(d,T)+1*/ };   // transfer；主线程校验槽位归属 + seq 是最新请求后合并进镜像 A 低 5 位
// seq 全局递增：同一区块更新的请求作废旧回包；'light' 不发；'gone' 不发（回包按归属丢弃）。

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
       A.dist  = keepDist && !becameOccupied ? 旧值 : (st.occupied ? 1 : 0)   // 新占据格写 1（偏小安全）
       [goalP3P4] keepDist 时新占据格（旧值 ≥2）还要在本区块做 min 更新（> 24 个 → 整块退回未计算），否则周围格的旧 d 偏大 */
  }
  /* aux.maxY/sectEmpty/sectFull → uCol[slot]（缺省则扫描计算）；aux.brick → stBrick（缺省则按 kind≠0 置位）；
     aux.dist → 直接写 A 通道低 5 位（跳过 Worker）；否则 WORKER.postMessage({t:'occ', cx, cz, seq, occ})（goalP3P4：占据在这遍扫描里顺手算）
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
  /* 1. 按 slot 分组 → 每槽位一个脏包围盒 lo/hi（队列溢出的槽位 → 整块 uploadChunk）
     2. 包围盒内每格：getChunk 读 id/meta/light → 写镜像 RGBA（A.dist 保留，只改 flags 三位）
     3. 整块从镜像重算 DF 占据（含流体表皮）：新占据（旧 dist ≥2）→ 1 并在「本区块内」做 dist = min(dist, cheb+1)（DF 只按本区块，不跨槽位）；
        新占据格 > 24 个 → 整块退回未计算（只留占据 = 1）
     4. 变空的格保留旧值（必为 1，仍当占据 → shader 取 id 发现空 → 步进 1 格，安全）
     5. 每槽位一次 copyTextureToTexture3D（脏盒外扩 1；有 min 更新或盒 ≥ 半块时整块）；砖 / 列高 / 段掩码从镜像整块重算（≈24K 查表）
     6. 发 {t:'occ'} 给 Worker 精确重算；qLen = 0
     [goalP3P4 实现] 树叶后处理开着（内部剔除 / halo 依赖 6 邻与邻区块）时该槽位直接整块 uploadChunk。
     宿主 A 适配器不提供 onBlockChanged（宿主 setBlock 后自己 buildChunk → 'blocks'），整块路径同样保持 DF 安全（保留旧 dist + 新占据 min 更新） */
}

/** 6.6 Worker 回包 */
function onWorkerDist(msg: FromWorker) {
  const slot = slotOf(msg.cx, msg.cz);
  if (MIR.owner[slot] !== `${msg.cx},${msg.cz}`) return;             // 槽位已被别的区块占用 → 丢弃（goalP3P4：另校验 seq 为最新请求）
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
[goalP3P4 实现] 平面时间一律现算 (平面 − ro)·inv，不跨迭代保存 tM（任何路径到达同一平面的 t 逐位相同；少 3 个循环寄存器）
loop (≤576, 预算 uSteps):
  砖级：换区块列 → uCol：cell.y ≥ maxY → 跳列出口；[#if SECT] 全空段跳 / 全实段命中入口
        入口格 vc = clamp(floor(ro + r·t), 砖)；[#if DF] voxAt(vc).a & 31 ≠ 0 → 进逐格层（dfm，本区块内不再回砖级）
        否则 uBrick：非空砖 → 砖内逐格（旧路径）/ 空砖 → 砖级一步
  逐格层：vox = texelFetch(uVox, cell)；v = vox.a & 0x1f
    dfm ∧ v == 0 → 本区块 DF 尚未回包 → 退回砖内逐格
    dfm ∧ v >= 3 → k = v−2（本格非占据，不看内容）
    否则 → 命中候选（下面的分派，v == 1 / 2 与 v == 0 一样取 id 判断）：
      if (vox.a & FLUID)        → fluidTop(cell, id, meta, aboveSameFluid)；记录 tw；首次入水 maxD = min(maxD, tw + uWaterVis)   // [meta.md §4.3]
      else kind = info0.r & 15
        1 cube   → opaque ? 命中 : cutout alpha；translucent → transmit *= info2.rgb 继续
        2/3      → crossHit / torchHit（现有）
        7 shape  → boxesHit(info1.r, info1.g, ro, r)：射线转 canonical（−facing·90°，flip y→1−y），≤4 AABB slab 取最近   [#if SHAPES]
        5/6      → v2 内部 halo / 卡片（现有）
      emissive > 0 → light = max(light, emissive/15)，不打阴影射线
    步进 = 盒 [cell−k, cell+k+1)（xz 裁到本区块）的出口面：k = 0 即普通一步（走与跳同一条代码，SIMD 不分叉）；
          出口轴平局优先级 z > y > x（= 原步进的 < 比较）；非出口轴落点 clamp(floor(ro + r·t), 盒)，出口轴直接给整数
    dfm ∧ 落点换了区块 → 回砖级（列校验）
  → DF 开/关画面 0 px：参考模式 VR.setRef(1)（全部预算 576 + 精确入格 REF_MODE）下；tools/verify-renderer.mjs / bench --ref / tools/df-seeds.mjs
预算耗尽 → kind=4 全雾（现有）
阴影射线复用同一循环（shadow=true：不记录水、不做 cutout 采样、nAlpha ≤ 2）
*/
