/**
 * gode/flow/feel.ts —— 相机手感：晃动 · 落地下沉 · FOV 变化 · 受伤下压 · 抖动 [定 11-09，用户：核心不可停、默认模组可停；从 input 拆出]
 *
 *   Body + p1_land / p1_hurt / p1_die / explode ──FEEL──▶ feel（Pose 大小的 6 个差量）──▶ input（加到 Pose 上）
 *
 * 停用后 Pose 只剩眼位与朝向，没有晃动 / 下沉 / FOV 变化（input.ts 把没收到的 feel 当 0）。
 * 偏移晚一帧（≤ 16 ms）到 input：input 在 p1_move 时用「最近一次 feel」合成 Pose。换来的是 feel 可以随时停用，input 不依赖它。
 * 宿主 B 出处：Motion :1603（晃动 / 落地下沉 / FOV / 眼高 / 受伤歪头）。
 */
import type { num } from './core.ts'
import type { Mod } from './index.ts'

/** 差量，与 Pose 同大小（连接点规则 ①）：dx / dy / dz 是位移（格），dyaw / dpitch 是弧度，fovK 是 FOV 的倍数（1 = 不变） */
export interface Feel { dx: num; dy: num; dz: num; dyaw: num; dpitch: num; fovK: num }

export interface Out {
  feel: Feel                               // 每帧
}

export interface GgApi {
  feel: {
    shake(amp: num, sec: num): void        // [新] 爆炸（explode 事件自动调）、模组
  }
}

// ── FEEL：每帧按顺序算；输入 Body 与事件，输出只有 Feel 的 6 个数。宿主 B Motion :1601 的数值
export const c_Feel = {
  bobFreq: 1.6, bobY: 0.11, bobX: 0.035,       // 走路晃动：幅度随水平速度（÷ 4.3）
  landDip: 0.40, landDecay: 7.0,               // 落地下沉：land = min(1, fall / 8)，按 landDecay 回弹；pitch 同时下压 land × 0.08
  sprintFov: 1.1, flyFov: 1.23, waterFov: 0.92, fovEase: 8,
  hurtDur: 0.15, hurtPitch: 0.06,              // Q-roll [定 11-09]：受伤改成 pitch 下压（宿主 B 是 roll 0.46，:1623）
  shakeDecay: 6,                               // [新] explode → 振幅 = power / (1 + 距离)
}
export const FEEL = ['bob', 'land', 'hurt', 'shake', 'fov'] as const

export const mod = {
  id: 'feel', where: 'main', catalog: 'defl', axis: 'ui', ms: 'M1-9',
  doc: '相机手感：Body + 事件 → 6 个差量（晃动 / 落地下沉 / FOV / 受伤下压 / 抖动）',
  off: 'Pose 只有眼位与朝向，没有晃动、落地下沉、FOV 变化与抖动',
  emit: { feel: 'frame' },
  sub: ['p1_move', 'p1_land', 'p1_hurt', 'p1_die', 'explode'],
  depends: ['pane'],
  tables: [], c_: ['$Feel'], save: [],
} as const satisfies Mod
