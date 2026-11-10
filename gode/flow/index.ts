/**
 * gode/flow/index.ts —— 事件总表 Ev、gm 总表 Gm、模块描述 Mod，以及数据流的连通性检查（只在类型层）
 *
 * 读法：想知道「X 从哪来、到哪去」，先在 Ev 里找到事件名，再跑 node gode/flow/graph.ts 看谁发、谁订阅；
 *   想知道「模组能调什么」，看 Gm（= window.gm，模组高频 API）与 Gg（= window.gg，引擎装置）；命名空间由模块提供（同名的 game / hooks / sim 两边各一部分）。
 * 检查（tsc -p gode/flow 报错 = 数据流断了）：
 *   ① 每个被订阅的事件都有模块发出（Unheard = never）
 *   ② 每个事件只有一个模块发出（一个权威，Multi = never）
 *   ③ 每个模块 emit 的键与它文件里 Out 接口的键完全一致（owns）
 *   ④ 两个模块的 Out 里同名事件的类型冲突 → interface Ev extends 直接报错
 *   ⑤ depends 只能写 Gm / Gg 里有的命名空间（Mod 的类型约束）
 *   ⑥ 「事件 → 动作」表（audio.SFX、fx.BURSTS）里的事件都在该模块的 sub 里
 *   ⑦ MOVES 行（kernel.ts）：动作名在 ACTS 里，否则是事件名；事件名列在 kernel.sub；Ref 路径是 Gm / Gg 里的 Ref 型成员
 *   ⑧ BIND 行：路径的头部是 Ref 型成员或 c_ 参数
 *   ⑨ 非核心模块必须写 off（停用后消费者看到什么）；核心模块不可停（Mod 的类型约束）
 *   ⑩ hooks.HOOKS 表与 BlockHooks 的键一致   ⑪ HOOKS 里的触发事件（by）都列在 hooks.sub 里   ⑫ Mod.wake 的事件都在该模块的 sub 里   ⑬ hooks.CMD_ROUTE 与 Cmd 的动词一一对应
 *   另：Mod 必填 layer / axis / ms（README 概览总表由 node gode/flow/graph.ts readme --write 生成）；layer 为 defl ⇔ 非核心
 * 这里的 emit / sub / depends / tables / c_ / save 是设计期规格。运行时登记处自己观察这些（kernel.ts ③），gd check mods 比对「观察到的 ⊆ 规格」；
 * doc 在 Mod 里只是运行时 Ref mod.<id>.doc 的初值（defl/doc.tsv，面板里可改）。
 */
import type * as core from './core.ts'
import type * as host from './host.ts'
import type * as input from './input.ts'
import type * as audio from './audio.ts'
import type * as fx from './fx.ts'
import type * as sim from './sim.ts'
import type * as weather from './weather.ts'
import type * as title from './title.ts'
import type * as hud from './hud.ts'
import type * as render from './render.ts'
import type * as kernel from './kernel.ts'
import type * as pane from './pane.ts'
import type * as feel from './feel.ts'
import type * as hooks from './hooks.ts'
import type * as net from './net.ts'
import type { Ref, CPath } from './core.ts'

/** 全部事件：名字 → 载荷。命名照 s05 的「类别_名字」；模组订阅写 'blk_break' 或通配 'blk_Any'（s07 M-3） */
export interface Ev extends host.Out, hooks.Out, net.Out, kernel.Out, pane.Out, input.Out, feel.Out, audio.Out, fx.Out, sim.Out, weather.Out, title.Out, hud.Out, render.Out {}
export type EvName = keyof Ev

/** window.gm：每个命名空间由一个模块提供（Api），另加订阅入口 on */
export interface Gm extends host.Api, hooks.Api, kernel.Api, pane.Api, input.Api, fx.Api, sim.Api, hud.Api, render.Api {
  on(h: { [K in EvName]?: (e: Ev[K]) => void } & { up?: (prev?: any) => void; down?: () => unknown; genChunk?: hooks.GenHook }): () => void   // 同宿主 B gm.on（:2518），返回取消函数；up / down / genChunk = 模块私有的伪事件，不进 Ev（genChunk 只在 where: 'slicer' 的模块里有，hooks.ts ⑤）：down 返回交接对象，下一个实例的 up(prev) 收到（形状是模块私有的，所以 prev 是 any；kernel.ts ⑤'）
}
/** window.gg：引擎装置与表现层（只在 main，不进 worker 白名单，不进 delta）+ 模块视图自带的登记工具 GgTools [定 11-10，用户：gm 只放模组高频 API] */
export interface Gg extends kernel.GgTools, host.GgApi, hooks.GgApi, net.GgApi, kernel.GgApi, input.GgApi, feel.GgApi, audio.GgApi, sim.GgApi, weather.GgApi, title.GgApi, hud.GgApi, render.GgApi {}
export type GmNs = Exclude<keyof Gm, 'on'>
export type GgNs = Exclude<keyof Gg, keyof kernel.GgTools>
export type Ns = GmNs | GgNs                       // 同名命名空间（game / hooks / sim）两边各有一部分，depends 写一次两边都给

/** 频率：frame = 每帧；tick = 20 Hz；sync = 写入时同步、有序（delta）；edge = 变了才发 / 发生时发；'4Hz' 等 = 固定采样
 *  转发给模组 worker（s07 M-3 subs）的只有 tick / edge / 低频采样；frame 与 sync 只在 main 里（太密） */
export type Rate = 'frame' | 'tick' | 'sync' | 'edge' | `${number}Hz`
/** 模块在哪运行。HTML 不是运行位置：页面是 Ref 的视图（kernel.ts ⑤），title / hud 是 main 里的普通模块 [定 11-09] */
/** dumper = 存档的唯一读写者（OPFS，s06 §4.3）；net = 联机传输（心跳 / 重连 / 排队，net.ts）；slicer = 生成 + 光照 + 网格池；render = 渲染器 */
export type Where = 'main' | 'worker' | 'render' | 'slicer' | 'dumper' | 'net'

/** 升级轴（README 概览）：play = 玩法（doc 简版 → 引擎 + 默认模组）· look = 渲染与反馈（rgl / lite / map + 粒子 + 音效）· ui = 主屏幕 · 触屏 · 面板 · 命令 */
export type Axis = 'play' | 'look' | 'ui'
/** 目录 [定 11-10，用户：取代 core: boolean]：模块出自哪个目录。core = 引擎核心（不可停，引擎启动时直接加载）；defl = 默认模组（`$baseUrl/defl/`，mod.tsv 里的行，可停可换）。
 *  第三方模组包在运行时 ModInfo 里另有包名（kernel.ts），规格里只有这两个 */
export type Catalog = 'core' | 'defl'
/** 层（README 矩阵的行）：core 目录再分 kernel = 模块框架 · core = 引擎核心 · render = 渲染器（可换 ?r=）；defl 目录的层就是 defl，不用写 */
export type CoreLayer = 'kernel' | 'core' | 'render'
/** 里程碑（s10）：'M1 ✅' = 已做完；'M3-7' = 第 3 阶段第 7 项；'未排期' = 还没进 s10（README 总表里会显眼地列出来，逐个子系统对照时定） */
export type Ms = `M${number}${string}` | '未排期'

interface ModBase {
  id: string
  where: Where
  axis: Axis
  ms: Ms
  doc: string                           // 运行时 Ref mod.<id>.doc 的初值；不是元数据，面板里可改、✎ 写回 defl/doc.tsv
  emit: { readonly [K in EvName]?: Rate }
  sub: readonly EvName[]
  depends: readonly Ns[]                // = mod.tsv 的 depends 列：加载顺序 + 受限 gm / gg 视图（只暴露这些命名空间；越权抛错）。连接点规则：模块之间只经 gm / gg 与事件
  tables: readonly string[]             // 读的默认模组表（$baseUrl/defl/，模组同名表覆盖，s07 §4）；脚本里用 gm.tbl.<名字> 取
  c_: readonly core.CPath[]             // 面板参数主题（defl/c_.json 的键）
  save: readonly string[]               // 状态注册表的键（s14 §5）
}
/** catalog 'core' 不可停用；catalog 'defl'（mod.tsv 里的行）可停、可被同 id 模组替换，必须写明停用后的样子（off） */
export type Mod = ModBase & ({ catalog: 'core'; layer: CoreLayer } | { catalog: 'defl'; off: string; wake?: readonly EvName[] /* 停用期间这些事件一发出就重新启用，必须在 sub 里（kernel.ts ④） */ })

// ───────────────────────────── 连通性检查 ─────────────────────────────
type Mods = typeof host.mods & {
  kernel: typeof kernel.mod; hooks: typeof hooks.mod; net: typeof net.mod; pane: typeof pane.mod; input: typeof input.mod; feel: typeof feel.mod; audio: typeof audio.mod; fx: typeof fx.mod; sim: typeof sim.mod
  weather: typeof weather.mod; title: typeof title.mod; hud: typeof hud.mod; render: typeof render.mod
}
type M = keyof Mods
type EmitOf<K extends M> = keyof Mods[K]['emit'] & EvName
type SubOf<K extends M> = Mods[K]['sub'][number]
type AllEmit = { [K in M]: EmitOf<K> }[M]
type AllSub = { [K in M]: SubOf<K> }[M]
type Emitters<E> = { [K in M]: E extends EmitOf<K> ? K : never }[M]
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never

/** ① 有人订阅、没人发 */
export type Unheard = Exclude<AllSub, AllEmit>
/** ② 被多个模块发出 */
export type Multi = { [E in AllEmit]: true extends IsUnion<Emitters<E>> ? E : never }[AllEmit]
/** 发了但模块里没人订阅：允许（留给模组 worker），graph.ts 会标「（模组）」 */
export type ForMods = Exclude<AllEmit, AllSub>

type Ok<T, Msg extends string> = [T] extends [never] ? true : { [k in Msg]: T }
export const closed: Ok<Unheard, '有人订阅却没人发'> = true
export const single: Ok<Multi, '同一事件有多个发出者'> = true

type Diff<A, B> = Exclude<A, B> | Exclude<B, A>
type HostEmit = { [K in keyof typeof host.mods]: keyof (typeof host.mods)[K]['emit'] }[keyof typeof host.mods]
export const owns: {
  host: Ok<Diff<HostEmit, keyof host.Out>, 'emit 与 Out 不一致'>
  hooks: Ok<Diff<EmitOf<'hooks'>, keyof hooks.Out>, 'emit 与 Out 不一致'>
  net: Ok<Diff<EmitOf<'net'>, keyof net.Out>, 'emit 与 Out 不一致'>
  kernel: Ok<Diff<EmitOf<'kernel'>, keyof kernel.Out>, 'emit 与 Out 不一致'>
  pane: Ok<Diff<EmitOf<'pane'>, keyof pane.Out>, 'emit 与 Out 不一致'>
  input: Ok<Diff<EmitOf<'input'>, keyof input.Out>, 'emit 与 Out 不一致'>
  feel: Ok<Diff<EmitOf<'feel'>, keyof feel.Out>, 'emit 与 Out 不一致'>
  audio: Ok<Diff<EmitOf<'audio'>, keyof audio.Out>, 'emit 与 Out 不一致'>
  fx: Ok<Diff<EmitOf<'fx'>, keyof fx.Out>, 'emit 与 Out 不一致'>
  sim: Ok<Diff<EmitOf<'sim'>, keyof sim.Out>, 'emit 与 Out 不一致'>
  weather: Ok<Diff<EmitOf<'weather'>, keyof weather.Out>, 'emit 与 Out 不一致'>
  title: Ok<Diff<EmitOf<'title'>, keyof title.Out>, 'emit 与 Out 不一致'>
  hud: Ok<Diff<EmitOf<'hud'>, keyof hud.Out>, 'emit 与 Out 不一致'>
  render: Ok<Diff<EmitOf<'render'>, keyof render.Out>, 'emit 与 Out 不一致'>
} = { host: true, hooks: true, net: true, kernel: true, pane: true, input: true, feel: true, audio: true, fx: true, sim: true, weather: true, title: true, hud: true, render: true }

type WakeOf<K extends M> = Mods[K] extends { wake: readonly (infer E)[] } ? E : never
export const wake: Ok<{ [K in M]: Exclude<WakeOf<K>, SubOf<K>> }[M], 'wake 的事件没列进 sub'> = true

export const tables: {
  sfx: Ok<Exclude<keyof typeof audio.SFX, SubOf<'audio'>>, '表里有、sub 里没有'>
  bursts: Ok<Exclude<keyof typeof fx.BURSTS, SubOf<'fx'>>, '表里有、sub 里没有'>
  hookKeys: Ok<Diff<keyof typeof hooks.HOOKS, hooks.HookName>, 'HOOKS 表与 BlockHooks 的键不一致'>
  hookBy: Ok<Exclude<Exclude<(typeof hooks.HOOKS)[hooks.HookName]['by'], 'call'>, SubOf<'hooks'>>, 'HOOKS 的触发事件没列进 hooks.sub'>
} = { sfx: true, bursts: true, hookKeys: true, hookBy: true }

// ⑦ ⑧：MOVES / BIND 与虚拟键表、Gm 的 Ref 型成员对得上
/** gm / gg 里的 Ref 型成员，如 'title.screen' | 'cam.mode' | 'p1.stat' | 'p1.bar.hot'（再深一层的对象也算）：MOVES 改它们，BIND 把它们镜像到页面 */
type GgNsMap = Omit<Gg, keyof kernel.GgTools>
type NsVal<N> = (N extends keyof Gm ? Gm[N] : unknown) & (N extends keyof GgNsMap ? GgNsMap[N] : unknown)
type RefsIn<T, P extends string> = { [K in keyof T & string]: T[K] extends Ref<any> ? `${P}.${K}` : T[K] extends (...a: any[]) => any ? never : T[K] extends object ? { [J in keyof T[K] & string]: T[K][J] extends Ref<any> ? `${P}.${K}.${J}` : never }[keyof T[K] & string] : never }[keyof T & string]
export type RefPath = { [N in Ns]: RefsIn<NsVal<N>, N> }[Ns]
/** 路径的所有前缀：'p1.bar.sel' → 'p1' | 'p1.bar' | 'p1.bar.sel'。BIND 的路径只要某个前缀是 Ref（后面是钻进对象值的字段）或 c_ 参数就合法 */
type Prefixes<P extends string, Acc extends string = ''> = P extends `${infer A}.${infer B}` ? `${Acc}${A}` | Prefixes<B, `${Acc}${A}.`> : `${Acc}${P}`
type ActName = (typeof input.ACTS)[number][0]
type MoveRows = (typeof title.MOVES)[number] | (typeof input.MOVES)[number]
type NonAct = Exclude<MoveRows[2], ActName>
type BindRows = (typeof kernel.BIND)[number] | (typeof hud.BIND)[number]
export const moves: {
  on: Ok<Exclude<NonAct, EvName>, 'MOVES 的动作既不在 ACTS 里也不是事件'>
  kernel: Ok<Exclude<NonAct, SubOf<'kernel'>>, 'MOVES 用到的事件没列进 kernel.sub'>
  ref: Ok<Exclude<MoveRows[0], RefPath>, 'MOVES 的 Ref 路径不是 Gm 里的 Ref 型成员'>
  bind: Ok<{ [R in BindRows[0]]: [Extract<Prefixes<R>, RefPath | CPath>] extends [never] ? R : never }[BindRows[0]], 'BIND 路径没有任何前缀是 Ref 型成员或 c_ 参数'>
} = { on: true, kernel: true, ref: true, bind: true }
