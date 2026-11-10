/**
 * gode/flow/input.ts —— 输入 · 触屏 · 相机，一个核心模块 [定 11-09，用户]（相机手感拆到 feel.ts，可停用）
 *
 *   物理键 / 触屏手势 / 屏幕按钮（data-act、data-btn）/ 命令行 / 模组 gm.act.press ──ACTS 表（虚拟键）──▶ Intent ──▶ p1（物理）、interact（挖放）
 *                                                                                     └─▶ key 事件 ──▶ kernel 的 MOVES（screen、cam 转移）、命令行、音频解锁、模组 worker {key}
 *   Body + feel + CAMS ──POSE──▶ Pose ──▶ render、audio（听者）、fx（发射区）、world（Here 采样）、hud（Gizmo）
 *
 * 宿主 B 出处：Input :1552 · Touch :3860（把触摸合成成 KeyboardEvent 塞回键盘管线）· HelpKeys :4072（点帮助文字里的 <b> 模拟按键）· Motion :1603。
 * 与宿主 B 的差别：
 *   - 虚拟键 [定 11-09，用户]：键盘、触屏、页面按钮、帮助键、命令行、模组都只产生「动作名」，进同一个 press(act)。触屏不再合成键盘事件。
 *     帮助文字里的 <b>Esc</b> 写成 <b data-act="pause">Esc</b>，不再解析键名。
 *   - 脚步声的计步搬到 p1（p1_step），本模块只管「看」。
 *   - Pose 是本模块唯一的输出画面数据；渲染器不读 player、不读相机对象（连接点规则 ②）。
 */
import type { num, XYZ, PStr, Pose, Action, Intent, Ref, Blk, Mob, P1Tag } from './core.ts'
import type { Mod } from './index.ts'
import type { MoveRow } from './kernel.ts'

export interface Out {
  intent: Intent & P1Tag                           // 每帧
  key: { action: Action | null; code: string }   // 按下边沿（物理键 / 屏幕按钮 / 命令行 / 模组都发；非物理键 code = ''）：kernel 的 MOVES、命令行、音频解锁、模组 worker 的 {key:'G'}（s07 §2）都订阅它
  pose: Pose                               // 每帧，已含晃动 / 下沉 / FOV 变化（feel 在时）
}

export type CamMode = 'fp' | 'orbit' | 'back'   // [定 11-09，用户：CAMS 只留这三个] = URL &cam=（s09 §8）；也是 cam.mode 的 meta.options 顺序（F4 轮转）
export type Focus = 'game' | 'ui' | 'text'   // text = 命令行 / 面板输入框在打字：除 ` F3 F4 Esc 外的键不进游戏（s09 §6.1）

/** 点选结果（scr2xyz）：与 aim 事件同形，多一个精确命中点 */
export interface Hit { P: XYZ; face: num; blk: Blk; mob: Mob | null; id?: num; at: XYZ }
/** gm.act [定 11-10，用户]：键鼠 / 触屏操作与屏幕 ↔ 世界换算都在这里（模组、gm.test、Agent、命令行共用；页面 data-act 也走 press） */
export interface Api {
  act: {
    press(act: Action, edge?: 'down' | 'up' | 'tap'): void   // 虚拟键。默认 tap = down + up；hold 型动作按住时 down、松开时 up
    key(code: string, edge?: 'down' | 'up' | 'tap'): void    // 物理键码 'KeyW' / 'Mouse0'：按 ACTS 的键列转成动作，等同键盘 / 鼠标事件（gm.test 与 Agent 用）
    move(x: num, z: num): void                               // 本帧摇杆 / WASD 合成值，−1..1（同 Intent.move）
    look(dyaw: num, dpitch: num): void                       // 弧度增量（同 Intent.look，已乘灵敏度）
    wheel(dy: num): void
    tap(sx: num, sy: num, how?: 'tap' | 'long' | 'dbl'): void   // 触屏点击屏幕坐标（CSS px，左上原点）：命中屏幕按钮就当按钮，否则查 ACTS 触屏列的区域手势
    scr2xyz(sx: num, sy: num, reach?: num): Hit | null       // 屏幕点 → 射线选取；没打到（天空 / 超出 reach）返回 null。原 gm.act.scr2xyz（s05）
    xyz2scr(P: XYZ): readonly [sx: num, sy: num] | null      // 世界点 → 屏幕像素；在相机背后或视锥外返回 null（marker 绘制用）
  }   // 只有输入与屏幕 ↔ 世界换算；标记层开关在 gm.marks.view [11-10 挪出]，小地图的在 gm.actOnMap（render.ts）
}
/** gg：焦点与相机（装置） */
export interface GgApi {
  input: {
    focus(to?: Focus): Focus
    lock(): void; unlock(): void
  }
  cam: {
    mode: Ref<CamMode>                             // 也是 $Cam.mode（⚡ 快调）；F4 轮转由 MOVES 的 cam 行改它
    pose(): Pose
    look(P: XYZ | PStr): void                      // 朝向某点（gm.test.frame、/tp 后的朝向）
  }
}

// ── ACTS：虚拟键表（defl/acts.tsv；宿主 B 的 Player.handleKey :1834 + HelpKeys + Touch 合成一张）[定 11-09，用户]
//    一行 = 一个动作。动作、键（| 分隔多个；A×2 = 双击）、触屏手势（区域.手势；⛏ 之类是屏幕按钮的 data-btn）、方式、何时有效（屏幕名空格分隔，'*' = 任何）、标签。
//    没有键位的行（continue / start / ask）也是合法的虚拟键：只给页面按钮用。第一列也可以是命令行（'/time 7'）。
//    帮助键、触屏按钮提示、键位设置界面都从这张表生成。模组往 acts.tsv 追加行 = 新增动作。带 [新] 的是 gode 新增。
type How = 'hold' | 'press' | 'dbl' | 'long'     // long = 长按触发（松开时若未长按则不触发 press 行）
export type ActRow = readonly [act: Action, keys: string, touch: string, how: How, when: string, label: string]
export const ACTS = [
  //  动作        键                              触屏                       方式     何时有效              标签
  ['jump',     'Space',                        'right.tap | look.hold',   'hold',  'game',              '跳'],
  ['fly',      'Space×2',                      'look.dbl',                'dbl',   'game',              '飞行'],    // 双击 300 ms（宿主 B lastSpaceTap）
  ['sprint',   'ShiftLeft | W×2 | ControlLeft', '🏃.tap',                 'hold',  'game',              '疾跑'],    // 双击 W = 疾跑锁；飞行时 Shift = 朝鼠标方向飞（IDEA）
  ['sneak',    'AltLeft',                      '🏃.long',                 'hold',  'game',              '潜行'],
  ['dig',      'Mouse0',                       '⛏.hold | look.hold',      'hold',  'game',              '挖'],
  ['place',    'Mouse2',                       '▣.tap',                   'press', 'game',              '放 / 使用'],
  ['pick',     'KeyF | Mouse1',                'Ⅱ.long',                  'press', 'game',              '取方块'],
  ['drop',     'KeyQ',                         '⛏.dbl | hot.long',        'press', 'game',              '丢弃'],    // λ. 的 Q 牵绳（M4）到时再分键
  ['bag',      'KeyE',                         '▣.long | hot.dbl',        'press', 'game',              '背包（bag）'],
  ['undo',     'Ctrl+KeyZ',                    '⛏.dbl',                   'press', 'game',              '撤销'],    // 宿主 B 触屏 Q：有可撤销时 = Ctrl+Z
  ['noclip',   'KeyV',                         '',                        'press', 'game',              '穿墙'],
  ['mode',     'KeyG',                         '',                        'press', 'game',              '模式'],
  ['f3',       'F3',                           '',                        'press', '*',                 '调试'],
  ['cam',      'F4',                           '',                        'press', 'game',              '相机'],    // F4 短按；不再开 rgl 面板（s09 §8）
  ['camBack',  'Shift+F4',                     '',                        'press', 'game',              '相机（反向）'],
  ['camHome',  'F4',                           '',                        'long',  'game',              '回第一人称'],   // [新] 长按 F4（s09 §8）
  ['quick',    'Backquote | F12',              '',                        'press', '*',                 '快调'],    // ⚡ 快调（s09 §6）
  ['pause',    'Escape',                       'Ⅱ.tap',                   'press', 'game paused ask',   '暂停'],
  ['cmd',      'Slash | Enter',                '',                        'press', 'game',              '命令行'],  // [新] 命令行（hud.ts）；Q-cmd [定 11-09]
  ['map',      'KeyM',                         '',                        'press', 'game',              '地图'],    // M4
  ['hot1',     'Digit1',                       'hot.tap',                 'press', 'game',              '物品栏 1'], // hot2…hot9 同理；滚轮 = Intent.wheel
  ['/time 7',      'KeyT',                     '',                        'press', 'game',              '早上'],    // 宿主 B T = 早上（cheat 键，现在是命令）
  ['/weather next','KeyR',                     '',                        'press', 'game',              '切天气'],  // 宿主 B R = 切天气
  // 界面按钮：没有键位，只给 data-act 用（title.ts 的 MOVES 吃它们）
  ['continue', '',                             '',                        'press', 'title',             '继续'],
  ['start',    '',                             '',                        'press', '*',                 '开始'],    // 左 / 右输入框、列表点选
  ['ask',      '',                             '',                        'press', 'title paused',      '读档'],
  ['respawn',  '',                             '',                        'press', 'game',              '重生'],    // 死亡屏按钮（hud.ts BIND p1.dead）；p1 订阅 key 处理
] as const satisfies readonly ActRow[]

/** cam.mode 的转移行（kernel 执行）：F4 轮转、Shift+F4 反向、长按 F4 回第一人称 */
export const MOVES = [
  ['cam.mode', '*', 'cam',     '<next>'],
  ['cam.mode', '*', 'camBack', '<prev>'],
  ['cam.mode', '*', 'camHome', 'fp'],
] as const satisfies readonly MoveRow[]

// ── TOUCH：触屏判定参数（宿主 B c_Touch :3849，按 handover/mobile.webp）。手势名就是 ACTS 第三列用的名字。
//    屏幕按钮（⛏ ▣ Ⅱ 🏃）不再是这里的数据：它们是 defl/ui.html 里的 <b data-btn="⛏">（kernel 绑定器把手势转成 press）
export const c_Touch = {
  look: 1.8, dead: 14, jumpMs: 120, slop: 5, hold: 70, dbl: 150, long: 200, padH: 0.6, padW: 0.27, fullscreen: true,
  zones: { pad: '左下 60% 高：WASD 摇杆，条上显示 WALK/RUN/DUCK/FLY/SWIM；长按条 = 挖 ↔ 放', look: '画面拖动', right: '右侧区：点 = 跳', hot: '热键栏（bar）' },
} as const

export const c_Input = { sens: 0.0022 /* 宿主 B Player.SENS */, invertY: false, dbl: 300 /* 双击窗口 ms */ }

// ── CAMS：F4 相机（s09 §8）[定 11-09，用户：只要第一、环绕玩家、背后第三；正视角 / 俯视 / 斜视 / 正交都不要]
//    rot = 旋转逻辑：'body' = look 转玩家的朝向（相机跟着）；'orbit' = look 转相机绕玩家的角度，玩家朝向不变，WASD 相对相机方向（这是环绕与背后第三的区别）
export const CAMS: Readonly<Record<CamMode, { label: string; rot: 'body' | 'orbit'; dist?: num; spin?: num }>> = {
  'fp':    { label: '第一人称', rot: 'body' },
  'orbit': { label: '环绕玩家', rot: 'orbit', dist: 8, spin: 0.1 },   // 鼠标拖转，滚轮距离，松开后慢速自转；调光影、截图、看建筑
  'back':  { label: '背后第三人称', rot: 'body', dist: 4 },            // 滚轮调距离；看自己 / 生物模型
}
export const c_Cam = {
  mode: 'fp' as CamMode, fov: 70,
  previewFov: 105,                             // 标题屏（screen = 'title'）的宽视角预览；原来是 STATES 的 preview 列，现在相机订阅 screen 自己决定 [定 11-09]
  eyeEase: 0.50,                               // 眼高每 tick 逼近 50%（MC）；站 1.62 / 潜行 1.27
  deathEye: 1.60,                              // 死亡：眼高降到 1.60（宿主 B 另有 deathRoll，同 Q-roll）
}
/** Pose 的合成顺序（每帧，p1_move 时）：眼位 → 加最近一次 feel（没有就 0）→ 按 CAMS 换背后第三 / 环绕（环绕用自己的绕行角，不用 Body.yaw） */
export const POSE = ['eye', 'feel', 'cam'] as const

export const mod = {
  id: 'input', where: 'main', catalog: 'core', layer: 'core', axis: 'ui', ms: 'M1-9',
  doc: '虚拟键（ACTS）→ Intent / key；Body + feel + 相机模式 → Pose',
  emit: { intent: 'frame', key: 'edge', pose: 'frame' },
  sub: ['p1_move', 'feel', 'screen'],          // screen：标题屏预览视角、焦点；feel：差量（晚一帧，feel.ts）
  depends: ['world', 'pane'],                  // world：第三人称 / 环绕相机防穿墙；pane：$Cam / $Input
  tables: ['acts.tsv'], c_: ['$Input', '$Touch', '$Cam'], save: [],   // 无世界状态；键位与相机模式走 gg_v
} as const satisfies Mod
