/**
 * gode/flow/core.ts —— 模块连接点的公共词汇（口诀类型）
 *
 * gode/flow/ 是 s14 的 TS 版：开工程之前，先把子系统的**声明式数据流**写清 —— 谁发什么事件、谁订阅、经哪个 gm 命名空间调用、
 *   读哪张 defl/ 表、有哪些 c_ 参数、存哪些键。粒度对齐 KubeJS / Luanti 模组 API：模组作者只读这几份文件就能写模组。
 * 文件：core（词汇）· kernel（框架：模块 = 脚本 + 受限视图、登记处、mod.tsv、通用 MOVES、HTML 绑定、gm.mods，s16）·
 *       index（事件表 Ev、gm 表 Gm、模块描述 Mod、连通性检查）· host（已有 / 后续里程碑的边界模块，只写连接点）
 *       input · feel · audio · fx · sim · weather · title · hud（11-09 用户划分的七个模块；输入与相机手感分成两个文件，手感可停用）·
 *       render（渲染器的连接点与 c_ 参数主题，s15）· graph（node 直接运行，打印事件 × 模块矩阵、mod.tsv）
 * 检查：node ~/.bun/install/cache/typescript@5.9.3@@@1/bin/tsc -p gode/flow   （类型检查通过 = 连接点对得上，见 index.ts 末尾）
 *       node gode/flow/graph.ts                                               （打印数据流矩阵）
 * 约定同 goal-renderapi.ts：本目录不是实现，运行时代码不 import 它；[宿主 B :行号] = index.html 出处，[新] = 宿主 B 没有，
 *   TODO(decide) = 待拍板，默认值已写明；[定 日期] = 用户已拍板（s14 §8、s15）。表格里的数值是宿主 B 的现值（= s09 §1 的「声明字面量」层）。
 *
 * 连接点规则 [定 11-09，用户]：
 *   ① 跨模块的数据，信息量不超过它的口诀文本：坐标 '@x,z^y'、偏移 '+@x,z^y'、体积盒 '@x,z^y XxZxY'、机位 '&p1=@x,z^y,yaw,pitch,fov'（IDEA L68）、
 *      方块 ':name{k v}'、生物 '#name'、参数路径 '$Topic.key'。热路径可以用元组 / 对象（不拼字符串），但字段与文本形一一对应，不多带。
 *      记法 [定 11-09，用户]：标记语言里（pkv、tsv 的列、命令行、`Mod.c_` 的登记）参数主题写 $Fx；JS 里仍是 c_.Fx（$Fx.gravity ≡ c_.Fx.gravity）。
 *      名字空间同理：pkv 里 ':stone' 是默认空间（''）的写法，其他空间直接写 'ns:stone'；游戏内部（类型、事件载荷、gm API）带空间的写成 '::ns:stone'。
 *   ② 例：相机 → 渲染器只同步 Pose（6 个数）。渲染器要的其余信息（眼睛是否在水里、眼处光照、时间与天气）自己经 gm 取：Here / Clock / gm.world.at。
 */

export type num = number

/** 世界坐标（格坐标时为整数）。文本形 '@x,z^y'：z 写在 y 前，y 用 ^ 标出（IDEA「@xzyb」）。@0,1 = 南，@1,0 = 东 */
export type XYZ = readonly [x: num, y: num, z: num]
export type PStr = `@${num},${num}^${num}`
export type P2Str = `@${num},${num}`                  // 不带 y 的列坐标（小地图、群系、柱高）
/** 偏移 [定 11-09，用户]：文本形 '+@x,z^y'（y 可省：'+@1,0' = 东、'+@0,1' = 南，IDEA L70 的 mat.t / linkBlk 依赖方块偏移）。
 *  元组与点同为 XYZ，靠字段名区分（off / size），文本形靠 + 区分 */
export type OffStr = `+@${num},${num}` | `+@${num},${num}^${num}`
/** 体积盒 [定 11-09，用户]：起点 + 尺寸，文本形 '@x,z^y XxZxY'（尺寸也是 z 在 y 前，同 s06 §5 的 XZ1 box / face：'@0,0^0 9x7x4'）。
 *  元组 size 按 XYZ 的 [x, y, z] 排，与文本形的 XxZxY 一一对应 */
export interface Box { P: XYZ; size: XYZ }
export type BoxStr = `${PStr} ${num}x${num}x${num}`
/** 地名 / 别名：'@home'（&pts=，hud.ts 管）、'@p1'。命令行补全、小地图标记（s03 §3.4）共用 */
export type PName = `@${string}`
export type RGB = readonly [r: num, g: num, b: num]   // 0..1

/** 机位：&p1=@x,z^y,yaw,pitch,fov 的全部信息量。
 *  yaw / pitch 用弧度（同 gm.test.pose）；yaw 0 = 朝 −Z（北），增大 = 向左转（北 → 西）；pitch > 0 = 抬头。fov = 竖直视角（度）。
 *  Q-ortho [取消 11-09，用户：CAMS 只留 第一人称 / 环绕玩家 / 背后第三]：没有正交相机，fov 恒 > 0。
 *  Q-roll [定 11-09]：不加 roll。宿主 B 的受伤歪头、死亡侧倒（:1623）改为 pitch 下压、眼高降低（input.ts c_Feel）。 */
export interface Pose { x: num; y: num; z: num; yaw: num; pitch: num; fov: num }
export type PoseStr = `@${num},${num}^${num},${num},${num},${num}`

/** 方块名，可带状态：':oak_stairs{half bottom}'（s04 §3）。':stone' = 默认空间（''）；带空间的内部形 '::ns:stone'（pkv 文本里是 'ns:stone'，读入时升成内部形，写出时降回去）。
 *  模板类型对两种内部形都成立（'::ns:stone' 也以 ':' 开头）；认空间的代码走 pkv 模块的解析，不在字符串上乱切 */
export type Blk = `:${string}`
export type Item = `:${string}`     // 物品名；规则同 Blk。方块 / Mob 也可当物品用（s05 §1）
export type Mob = `#${string}`      // '#zombie'；玩家是 '#p1'
export type CPath = `$${string}`    // 参数路径：'$Fx.gravity'（JS 里 c_.Fx.gravity；s09）
/** 登记处里的路径（s16 §3）：参数 '$Fx.gravity'、表行 'blk.:sand.gravity' / 'tbl.bursts.blk_break.n'、模块 'mod.fx.doc' / 'mod.fx.on'、
 *  虚拟键 'act.pause.keys'，以及任何 Ref 型 gm 成员，如 'title.screen'、'cam.mode'（index.ts 的 RefPath）。gm.pane / 模组 {set} / 命令 /set / MOVES / BIND 共用。
 *  参数主题在标记语言里写 $Fx（CPath），其余仍是点分路径 */
export type Path = CPath | `${string}.${string}`
export interface Stack { name: Item; count: num; dur?: num; v?: unknown }      // 宿主 B 物品栈（gm 值物品带 v，:2469）

/** 世界写入的唯一记录（s14 §4）。v / old = u16（type | meta<<12）。文本形 '@x,z^y :name{…}'（pile、联机、模组都用这一种） */
export type Src = 'gen' | 'p1' | 'sim' | 'mod' | 'net' | 'load'
export interface Delta { seq: num; P: XYZ; old: num; v: num; st?: string /* xyzb.tsv 状态条目（linkBlk 等）的 pkv，变了才带 */; src: Src }

/** 相机所在处的环境：world 模块按 Pose 每秒采样 4 次（host.ts）。音效持续层、BGM、粒子、HUD、渲染器（水下 / 眼处光照）都读它 */
export interface Here {
  P: XYZ              // 眼睛所在格
  biome: string       // 生成器 meta.biomes 里的名字
  fluid: Blk | null   // 眼睛所在格的流体（':water' / ':lava'）；= rgl env.eyeInWater
  waterTop?: num      // 在水里时的水面 y（rgl env.eyeWaterTop）
  sky: num; blk: num  // 眼处天光 / 方块光 0..15（rgl env.eyeSky / eyeBlk ×15）
  depth: num          // 在地表以下多深（柱高 − y；≤ 0 = 地面以上）
  held: Item | null   // 主手物品 [定 11-09，用户：放 Here]。render 查 blk.tsv 的 emit 列得到手持光（render.ts c_HeldLight）；最多晚 250 ms，render 自己渐变
}

/** 天气 [定 11-09，用户：goodLiqPG 的 7 种]。名字只给 HUD / 命令 / 模组看；渲染、音效、模拟只读 WxRow 的数字 */
export type Wx = 'clear' | 'cloudy' | 'overcast' | 'rain' | 'thunder' | 'fog' | 'snow'
/** 天气参数行（weather.ts WEATHER 表的一行，goodLiqPG environment.js PRESETS），全部 0..1。大风 = wind 列，不另设状态 */
export interface WxRow { clouds: num; rain: num; thunder: num; fog: num; wind: num; cirrus: num }
/** 时钟 + 天气（weather.ts，每帧）[定 11-09，用户：Clock 带插值后的参数行]。模组加一种天气（一行数字）不用改消费者 */
export interface Clock extends WxRow {
  t: num              // 世界 tick（20/s）；t = 0 = 第 1 天 06:00（同宿主 B Sky.time、goodGL tick 0）
  day: num; hour: num // hour 0..24 小数（= 墙上时钟）
  f: num              // 一天中的比例 0..1（= rgl env.dayTime）
  state: Wx           // 当前天气段的名字
  // WxRow 各列：已从上一段插值到这一段；rain / thunder 再按相机处群系遮罩（沙漠 = 0，同宿主 B Weather.update），其余列是全局的
  windDir: num        // 风往哪吹（弧度，同 Pose.yaw：0 = 朝 −Z 北）。wind × windDir → 雨丝倾斜、雪漂移、落叶 / 烟 / 火星、植物摆动
  wet: num            // 地面湿度：rain 的滞后量（goodLiqPG wetness）
  flash: num          // 闪电脉冲：落雷那一下 ~1，几百 ms 衰减到 0。只有它提亮画面；thunder 列只压暗（11-09 修过宿主 B 把两者混用的过曝）
  precip: 'rain' | 'snow' | 'none'   // 相机处下的是什么（按群系与高度，weather.ts PRECIP）
  cover: num          // 雪盖 0..1：相机处下雪时涨、不下时化；着色器把露天顶面渐白（真实雪层另由 sim.ts ABM 堆）
}

/** 玩家身体（p1 = main/phys.js，每帧）。相机、HUD、音效只读它，不碰 player 全局 */
export interface Body {
  x: num; y: num; z: num; vx: num; vy: num; vz: num; yaw: num; pitch: num
  eye: num            // 眼高目标（站 1.62 / 潜行 1.27）；平滑在相机里做
  onGround: boolean; flying: boolean; noclip: boolean; sneaking: boolean; sprinting: boolean; dead: boolean
  feet: Blk | null; head: Blk | null   // 脚 / 头所在格的流体
}
export interface Stat { hp: num; maxHp: num; hunger: num; sat: num; air: num; fire: num }   // 生存状态（宿主 B player :1592）

/** 虚拟键名 [定 11-09，用户]：defl/acts.tsv 的第一列（input.ts ACTS）。物理键、触屏手势、页面元素的 data-act、命令行、模组都只产生动作名。
 *  开放集合：模组往 acts.tsv 追加行就多一个动作；命令行 '/time 7' 本身也是一个动作。MOVES 的 on、Intent 都用它 */
export type Action = string

/** 输入意图（input.ts，每帧）。键鼠、触屏、帮助键点击都先变成它；物理与交互只吃意图，不认设备 */
export interface Intent {
  move: readonly [x: num, z: num]           // −1..1：x 右，z 前（WASD / 摇杆合成）
  look: readonly [dyaw: num, dpitch: num]   // 本帧的弧度增量（已乘灵敏度）
  wheel: num
  hold: ReadonlySet<Action>                 // 按住中
  press: readonly Action[]                  // 本帧按下的边沿；双击已合成（双击空格 = 'fly'）
}

/** 画面（title.ts 的 MOVES 管；屏保不做）。基础五个；模组往 moves.tsv 追加行就能加新屏（背包 / 地图 / clawd）。
 *  宿主 B 的 c_TitleStates（逐列推 DOM）取消 [定 11-09]：页面按 html[data-screen] 自己决定怎么显示，游戏只留「是否暂停」= screen ≠ 'game' */
export type Screen = 'title' | 'paused' | 'ask' | 'loading' | 'game' | (string & {})

/** Ref：一个函数既读又写（s03 §3.4 markers 与 s09 Ref 同形）：r() 读，r(v) / r(old => v) 写。
 *  同一 (owner, key) 总是同一个 Ref；面板、Pass、MOVES、HTML 绑定、模组 {set} 走同一条路由（s09 P-2、goal-panify §2）。
 *  meta 在声明处一次给全（位置决定种类）；任何路径都可以有 doc（defl/doc.tsv，运行时可编辑，s16 §5） */
export interface Meta {
  label?: string; doc?: string
  range?: readonly [min: num, max: num, step?: num]; log?: boolean
  fx?: string                               // 改后的副作用路由：'regen' 重生成视野、'gl_wtf' GL 重编译…（s09 §2）
  options?: readonly string[]               // 枚举的取值顺序：MOVES 的 '<next>' / '<prev>' 照它循环
}
export type Ref<T> = { (): T; (v: T | ((old: T) => T)): T; readonly key: string; readonly owner: object; readonly meta: Meta }

/** 存档列表的一项（宿主 B Save.idx :3012；M2 换成 Pusc.json 的子集） */
export interface SaveEntry { seed: string; name: string; mode: string; t: num; born: num; kb: num; day: num; time: num; author?: { link: string; desc: string } }
/** 开局参数：标题屏两个输入框（左 seed / 联机码，右 webp 粘贴，IDEA）+ URL &start= */
export type StartArg = ({ seed: string } | { code: string } | { file: Blob } | { url: string }) & { g?: string; mode?: string; p1?: PoseStr | PName }
