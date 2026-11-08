# s11 · 借鉴 goodPG：性能 / 技术 / 联机 / GL

> 上游：`goodPG/study-vers.md`、`study-gl.md`、`study-webp.md`、`case-study.md` 与 goodPG 源码。
> **只取性能、技术、联机、GL 实现上的长处**；视觉效果与操作 UI 已定（s03、s09），不从 goodPG 取。

## 1. 采纳（不与已定冲突）

| # | 内容 | 出处 | 落到 |
|---|---|---|---|
| B-1 | **顶点 2×u32**：相机相对坐标、UV 5 bit、层号 10 bit、AO + 天光 + 块光 10 bit。层号 1024 已偏紧，gode 留 11 bit | `case-study.md:49`，`study-gl.md:26-32,118` | s03 §1 网格格式 |
| B-2 | **每层 4 字节 `layerProps`**：VS 里 `texelFetch` 读出，flat 传给 FS，`special` 只在一处分支 —— 作为 `blk.tsv` 能力字段到 GPU 的通道 | `study-gl.md:20-24,399-420` | s04 §5 |
| B-3 | **风摆在 VS**，相位只取世界坐标，CPU 不碰网格，邻块连续 | `study-gl.md:180-190` | s03 树与花草 |
| B-4 | **`pixelArtUVw` + `textureGrad`**：开各向异性仍保像素（ANGLE 忽略 MAG=NEAREST）；**POM 6 步 + 割线细化**代替 20 步 | `study-gl.md:34-46,503` | `rgl/texpack.js` |
| B-5 | **天气不加大 pass**：降水一次 9000 实例绘制，其余只改 uniform；闪电接 `uLightColor`。`rainAt(time, seed)` 确定性函数，联机两端各算、零同步 | `study-gl.md:338-387,507` | s06 §2「天气由时间推」的实现 |
| B-6 | 粒子 / 雨画在 **TAA 之后、曝光之前**（无残影、共用自动曝光）；光照前 **IGN 抖动**消马赫带 | `study-gl.md:323,494`，`case-study.md:374` | rgl pass 顺序核对 |
| B-7 | 骨骼隐藏用 **缩放 1e-3 不用 0**（0 矩阵奇异会画出穿屏线） | `case-study.md:315` | s03 §4 |
| B-8 | 存档：**快照原子**（先序列化成字符串再 await 压缩）、**导入先校验、失败不清旧世界**、**写盘失败可见、成功前不清脏标记**、**容器格子变化单独标脏** | `study-webp.md:42-51,87-108,136-140` | s06 §4.3、§3 |

已覆盖、只作印证：3×3 列光环 BFS（s01 §4；gode 用 main 增量，避开了 goodPG 每次重网格都重跑 BFS 的问题）、存档版本迁移（s06 `MIGRATIONS`）、挂起表落盘（`pending.tsv`）、地形不同步只同步编辑（XZP diff）、生物实例化走骨骼纹理（s03 §4）。

## 2. 联机协议补全（s06 §7，仍只写协议，S-4）

| # | 内容 | 出处 |
|---|---|---|
| N-1 | **每房间一个 Durable Object**：有人时 20 Hz tick，最后一人离开停 tick，48 h 无人 alarm 删除 | `goodPG/src/server/index.ts:233-268` |
| N-2 | **WebSocket hibernation + 自动心跳应答**（心跳不唤醒 DO）；DO 重启后以 4003 关旧连接让客户端重连 | `index.ts:169-177` |
| N-3 | `locationHint` 按创建者地区放 DO，`/donde` 诊断延迟 | `server/region.ts:18-41` |
| N-4 | 一份代码两种部署：`wrangler.jsonc`（Cloudflare）/ `wrangler.vps.jsonc`（自建） | `goodPG/docs/despliegue-vps.md` |
| N-5 | 客户端：连接 8 s 超时回落离线；20 s 心跳、45 s 无消息判断线重连；断线期间的 place 排队（上限 2 万）重连后按 pile 序号重放 | `client/net/Net.ts:98-166,258` |
| N-6 | 服务端校验：协议版本号、单消息 ≤ 1 MB、交互距离 `reachOk`、人数上限 | `shared/protocol.ts:8`，`GameServer.ts:41,552,619,689` |
| N-7 | **新玩家按区块按需拿编辑**（XZP 记录），不像 goodPG 一次发全世界编辑（`GameServer.ts:647-658`） | gode 改进 |
| N-8 | 频率预算：位置约 8 Hz 且只在移动时发；脏行 30 s 落一次（goodPG 估算每玩家小时 1.5–2.5k 请求，在免费额度内） | `goodPG/README.md:389-400` |
| N-9 | 语音：WebRTC P2P，DO 只转发信令（可选） | `goodPG/ROADMAP.md:779` |

## 3. B-0 权威放哪 [定 11-08：M1–M3 仍在 main]

- M1–M3 照 s01，权威在 main。**约束**：改世界的入口收窄成消息形状（`{place}` `{tick}` 等，同 s07 动词），将来可以整体下沉到 `sim` worker，换成 goodPG 式 `LocalTransport`。
- 背景：goodPG 把服务器写成与存储、传输无关的 `GameServer`，单机时放进 Worker，用伪装成 WebSocket 的 `LocalTransport`，单机与联机走同一份 `Net` 代码（`client/net/localServerWorker.ts`、`LocalServer.ts:62-95`）。gode 若照搬，s01 的 20 Hz tick、改块、增量光照要从 main 下沉到 `sim` worker，main 只留镜像 + 预测。好处是联机零改造；代价是 M1 多一跳延迟和一套预测 / 回滚。
