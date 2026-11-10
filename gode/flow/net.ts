/**
 * gode/flow/net.ts —— 联机：一个权威档，大家用 appendOnly 日志 + 低频块 diff 同步 [议 11-10；只写协议，不排期（s06 S-4）；条目出处 s11 §2 N-1…N-9]
 *
 *   ① 权威档只有一份：谁是服务端，谁的存档（dumper）就是权威档；其他人是镜像，本地只缓存、不写权威档。
 *   ② 同步 = 两种东西：
 *        热：appendOnly 的 Δ 日志（s14 §4 的 seq 序，pile 的序号日志就是同步单位）。客户端发 op（没有 seq）→ 权威校验（版本、reachOk、人数，N-6）→ 定序 → 广播 log 段；
 *            客户端只追加：log.from = 本地 seq + 1 才接，否则要块（want）。断线期间的 op 排队，重连后按 cid 重放（N-5）。
 *        冷：低频块 diff（XZP 记录，s06 §4.1）。按需拿（N-7）：玩家进视野时要该区块的 diff；seq 对不上时重要；权威每 30 s 把脏块落进 dumper（N-8）。
 *      生成（Delta.src 'gen' / 'load'）不进 net：两端同种子同生成器各自生成，只同步 diff。天气是 (t, seed) 的纯函数，零同步（s11 B-5、s14 Q-wx）。
 *      收到的 log 应用成 world.set(…, 'net')：和本地写入走同一条路径，光照 / 网格 / sim 照常从 delta 来；src 'net' 的 delta 不再回传。
 *   ③ 单机与联机同一份代码：传输是接口，单机 = 本地回环（goodPG LocalTransport，s11 §3）。where: 'net' = 传输、心跳、重连、排队在 net worker，
 *      main 只有这里的 gg.net 门面；权威 tick 仍在 main（B-0，M1–M3），改世界的入口已经是消息形状（s07 动词 = Cmd）。
 *   玩家标识：Up / Down 里的玩家都用 who（'' = 本机服主在权威端的名字也是 ''，客户端看到的自己是它被分配的 who）；事件载荷带 p1.who（core.ts P1Tag）。
 * TODO(decide) 默认值已写明：
 *   1. 远端玩家的 pose：net 发 peer_pose 事件（8 Hz），由 render 画、audio 听；备选：并进 p1_move（p1 模块用 p1.now(who) 管远端身体，p1_move 的发出者仍只有 p1）。
 *   2. 谁当服务端：房主的页面（WebRTC，权威在房主 main）或中继（Durable Object，N-1）都走同一个 Transport 接口，具体留到联机里程碑。
 *   3. 客户端是否可另存一份副本：默认不可（避免两个权威）；备选可导出只读快照（s06 的导出）。
 */
import type { num, XYZ, Delta, PoseStr, Pose, Ref, P1Tag } from './core.ts'
import type { Mod } from './index.ts'

export type Role = 'solo' | 'host' | 'client'
export type NetState = 'off' | 'joining' | 'live' | 'lost'
export interface Peer { who: string; name: string; rtt: num }

export interface Out {
  net_state: { state: NetState; role: Role; peers: num }       // 变了才发（标题屏 / hud 的连接指示）
  net_peer: { name: string; on: boolean } & P1Tag              // 有人加入 / 离开
  peer_pose: { pose: Pose } & P1Tag                            // 其他玩家的机位（TODO 1），按 c_Net.posHz
}

/** 线上消息（单键动词 + 可选 id，同 s01 信封）。net worker 与权威端之间；单机时是本地回环 */
export type Up =
  | { op: { P: XYZ; v: num; st?: string }; cid: num }          // 客户端的 place / break（Delta 去掉 seq / src）；cid = 客户端自增，权威回 ack 对号；权威端先问 canPlace / canBreak（hooks.ts）
  | { pose: PoseStr }                                          // 约 8 Hz，只在动时发（N-8）
  | { want: { cx: num; cz: num } }                             // 要该区块的 diff（进视野 / 日志有缺口）
  | { cmd: string }                                            // 命令行；权威端校验 cheat
  | { hb: num }
export type Down =
  | { log: { from: num; deltas: readonly Delta[] } }           // 权威定序后的 appendOnly 日志段
  | { chunk: { cx: num; cz: num; rev: num; xzp: ArrayBuffer } } // 低频块 diff（XZP 记录，s06 §4.1）
  | { ack: { cid: num; seq: num | null } }                     // seq = null 表示被拒（reachOk / 版本 / 人数）
  | { pose: { who: string; pose: PoseStr } }
  | { peer: { who: string; name: string; on: boolean } }
  | { hb: num }

export interface GgApi {
  net: {
    state: Ref<NetState>; role: Ref<Role>
    host(o?: { max?: num }): Promise<string>                   // 开房，返回联机码（标题屏左输入框填的就是它，StartArg.code）
    join(code: string): Promise<void>
    leave(): void
    peers(): readonly Peer[]
  }
}

// 数值出自 goodPG（s11 §2）：N-5 超时 / 心跳 / 排队、N-6 校验、N-8 频率
export const c_Net = {
  connectMs: 8000, hbMs: 20000, deadMs: 45000, queueMax: 20000,
  posHz: 8, msgMax: 1 << 20, reach: 6, max: 8,
  dirtyFlushMs: 30000,                                         // 权威端：脏块落盘间隔
}

export const mod = {
  id: 'net', where: 'net', catalog: 'core', layer: 'core', axis: 'play', ms: '未排期',
  doc: 's06 §7、s11 §2：一个权威档，appendOnly Δ 日志 + 低频块 diff；单机 = 本地回环；只写协议，不排期',
  emit: { net_state: 'edge', net_peer: 'edge', peer_pose: '8Hz' },
  sub: ['delta', 'p1_move', 'chunk_in', 'game_ready'],          // delta：src ≠ gen / load / net 的广播出去；p1_move：降采样成 pose；chunk_in：进视野要块；game_ready：开始连接
  depends: ['world', 'pane'],
  tables: [], c_: ['$Net'], save: [],
} as const satisfies Mod
