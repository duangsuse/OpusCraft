/**
 * gode/flow/mesh.ts —— 剔面器（mesher）：体素 → 网格 + 实例 + 发射点 [定 11-10，用户：mesher 是 slicer 池的第二个动词；出区块网格时顺带吐出实例]
 *
 *   chunk_in / delta / light / tbl_change ──▶ 本模块（main 里的驱动）──{mesh}──▶ slicer 池 ──▶ 网格缓冲 + 实例 + 发射点
 *        ├─▶ mesh_ready ──▶ render（上传网格）、fx（常驻发射器：火把 / 火 / 岩浆 / 瀑布）
 *        └─▶ gg.render.inst.set('grid@cx,cz', 实例列表) ──▶ 渲染器（与实体、手持同一种 ModelInstance）
 *   ents / 手持物 / 方块里的模型 ──{bake}──▶ slicer 池 ──▶ ModelAsset（SVOX / X2V / 贴图压厚度 → 网格 + 碰撞盒 + 锚点）
 *
 * 为什么是一个池两个动词：生成与剔面都是「体素进、缓冲出」，同一套 worker、同一个 transfer 约定（s01 §1）。
 *   mesh：18³ padded 块（含邻块一圈）→ 区块网格。块里 Kind.Model 的方块不出面（goal-svox §8.1），改出 ModelInstance；
 *         blk.tsv 的 fx 字段命中的格出发射点。这样渲染器不扫区块，fx 不遍历 chunk_in / delta。
 *   bake：一个 Bime 值的模型（BIME 表 #mdlID.animID → SVOX / XZ1 文本 / BBat 图层）→ ModelAsset。
 *         可缩放 / 旋转 / 有原点、多图层（IDEA「剔面器要支持从方块图层生成动画多图层实体」）；固定 randomSeed，结果可复现（goal-svox §4.4）。
 * 对齐：1 体素 = 1/16 格。place 的方块模型自带 Foot（占格范围）；born 的实体建模时就与网格对齐，碰撞盒都由体素生成，方块与实体共用 gg.mesh.boxes（goal-svox §4.3）。
 *
 * 出处：goal-svox.md §3 §4.4 §8；s01 §1（拓扑）；宿主 B：vendor/gl/pool.js 的 mesh{pb,pm,pl,…}。
 * 位置：驱动在 main（要订阅事件）；动词在 slicer 池里（host.ts 的 slicer 模块 serves）。
 */
import type { num, XYZ, Box, Bime, Foot, ModelInstance } from './core.ts'
import type { Mod } from './index.ts'

export type EmitKind = 'torch' | 'fire' | 'lava' | 'drop'   // 对应 fx.RenderFx 的 fire.blocks / drops
export interface Out {
  /** 该区块若干段的网格已上传可画（rev = 请求时的版本，过期的结果丢弃）。emit = 本区块全部常驻发射点（整表替换） */
  mesh_ready: { cx: num; cz: num; sec: num /* 16 段位掩码 */; rev: num; emit: readonly (readonly [XYZ, EmitKind])[] }
}

/** 烘焙产物（goal-svox §4.4 ModelAsset 的连接点形；缓冲是 transfer 的 ArrayBuffer） */
export interface ModelAsset {
  of: Bime
  mesh: { pos: ArrayBuffer; nrm: ArrayBuffer; col: ArrayBuffer; mat: ArrayBuffer; idx: ArrayBuffer }
  parts: readonly { name: string; parent: string | null; pivot: XYZ; from: num; n: num }[]
  boxes: readonly Box[]                         // 碰撞盒，由体素 greedy 生成；方块与实体共用
  bounds: Box
  foot?: Foot                                   // 方块来源的多格模型
  anchors?: Readonly<Record<string, XYZ>>       // 手持位置 / 眼 / 嘴
}

/** slicer 池里的 mesh / bake 两个动词（SlicerRpc 的 gen / tree 在 host.ts） */
export interface Rpc {
  mesh(a: { cx: num; cz: num; pad: ArrayBuffer; rev: num; secs: num }): Promise<{
    cx: num; cz: num; sec: num; rev: num
    bufs: { pos: ArrayBuffer; idx: ArrayBuffer; light: ArrayBuffer }
    inst: readonly ModelInstance[]              // 本区块的 Kind.Model 方块；id = 锚格 '@x,z^y'
    emit: readonly (readonly [XYZ, EmitKind])[]
    ms: num
  }>
  bake(a: { of: Bime; src: string; seed?: num }): Promise<ModelAsset>
}

export interface GgApi {
  mesh: {
    /** 值的模型（烘焙在后台，未完成 = null；渲染器跳过、不报错）。方块、掉落物、手持物、生物同口径 */
    model(of: Bime): ModelAsset | null
    boxes(of: Bime): readonly Box[]             // 碰撞盒：p1 物理、ents、interact 的射线共用
    stats(): { queue: num; busy: num; ms: num }
  }
}

export const c_Mesh = { pool: 'slicer', maxQueue: 256, budgetMs: 4 /* 一帧最多花在上传上的时间 */ }

export const mod = {
  id: 'mesh', where: 'main', catalog: 'core', layer: 'core', axis: 'look', ms: 'M1 ✅',
  doc: 's01 §1；goal-svox §3：区块网格 + 实例 + 发射点；bake 把 Bime 值烘成 ModelAsset',
  emit: { mesh_ready: 'edge' },
  sub: ['chunk_in', 'chunk_out', 'delta', 'light', 'tbl_change'],   // light：sim 的光照增量；tbl_change：blk.tsv 的 model / fx 列变了要重出
  depends: ['world', 'render', 'pane'],         // render.inst.set：网格来源的实例
  tables: ['blk.tsv'], c_: ['$Mesh'], save: [],
  calls: ['mesh', 'bake'],
} as const satisfies Mod
