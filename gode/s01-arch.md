# s01 · 线程拓扑与消息协议

> 上游：IDEA「Worker 都必须响应 `{onkwarg:{seed:..}|{mode}}` 的初始化，以及 `key / onhit` 这类消息」；README G-5、G-6。
> 玩法消息（`key / onhit / mode` 的具体划分）放在 s07，本节只定**信封**和**生成 / 网格 / IO** 三类 Worker。

## 1. 拓扑 [定 11-08]

```
main ── 权威世界镜像（chunks Map）+ 20 Hz tick（流体 / 火 / 随机 tick / mob）+ 输入 / UI + rgl 或简版渲染器
  ├─ slicer#1..N   生成 + 初始光照 + 网格（M1）。池大小 max(2, min(8, cores−2))，同 LiqPG。
  │                **渲染器不再自带网格池**，rgl / 简版都通过 ctx 拿到这个池发 {mesh} [定 11-08]
  │     ↑ {onkwarg:{seed, g, …}}       ↓ transfer：区块缓冲 / 网格缓冲
  ├─ io#1          OPFS 唯一读写者（M2，见 s06）。slicer 生成的区块不经过它；main 落盘时 transfer 过去
  └─ sim?          流体 / mob 是否下沉到 Worker，M1 之后再议（s07）
```

- **main 持有权威数据**：生成结果 transfer 回 main 后，worker 不再保留副本。改块、流体、光照增量都在 main 发生。
- **网格请求由 main 发起**：main 把 18³ padded 块（含邻块一圈）transfer 给任意空闲 slicer。这与 rgl 现有的 `vendor/gl/pool.js` `mesh{pb,pm,pl,…}` 一致，worker 之间不共享区块，也不需要 SharedArrayBuffer（不强制 COOP/COEP，可放在任意静态托管上）。
- 有 SAB 时可以作为优化（LiqPG 的 `register{key,sab}` 路径），但协议不依赖它。

## 2. 信封 [定 11-08：单键动词 + id]

IDEA 的写法是**单键对象**：键是动词，值是参数。gode 全部消息照这个写，额外加可选 `id` 做请求 / 应答配对。

```js
// main → worker
{ onkwarg: { seed, g, mode, kw } }            // 初始化。必须是第一条；再次发送 = 热重置（换种子 / 换生成器）
{ gen:  { cx, cz }, id: 7 }                   // 请求
{ mesh: { cx, cy, cz, pad, rev }, id: 8 }     // 请求，pad 为 transfer 的 ArrayBuffer
{ key:  'G' }                                 // 广播事件，无 id，不应答（s07）
// worker → main
{ ready: { meta } }                           // onkwarg 应答，meta 是生成器 / 渲染器自描述（s02 §1）
{ gen:  { cx, cz, blocks, biomes, heights, light, outside, ms }, id: 7 }
{ err:  { msg, stack }, id: 7 }
```

- 一条消息只有一个动词键（`id` 除外）。worker 用 `for (k in msg)` 分派到同名方法，未知动词忽略。这样 MOD worker 只需要实现它关心的动词。
- `onkwarg` 里的 `kw` 是面板 / URL 的深赋值（`&json=`，s09），worker 内部同样用 `c_` 表接收。

## 3. Worker 清单

| Worker | 入口 | 必须实现 | 可选 |
|---|---|---|---|
| slicer | **生成器脚本本身**（`?g=` 的 URL），它 import 引擎运行时 `gode/w/slicer.js`（s02 §2） | `onkwarg gen`（生成器写）；`mesh light map`（运行时提供） | `set sample explain spawn tree` |
| io | `gode/w/io.js`（M2） | `onkwarg read write flush` | `export train` |
| ~~rgl 网格池~~ | 并入 slicer [定 11-08]：`vendor/gl/pool.js` 的 mesh 实现搬进 slicer 的 `mesh` 动词 | — | — |

## 4. 光照 [定 11-08]

- slicer 生成完立即算本块光照（块边界外视为露天 / 黑暗），和区块一起 transfer 回去（goodGP `initLight`、LiqPG worker 的做法）。
- main 负责跨块接缝和改块的增量 BFS（宿主 B `gls.js` 现有逻辑）。规则见 s04。
