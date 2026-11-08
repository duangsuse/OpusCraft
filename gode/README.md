# gode —— 体素游戏总体设计

> 来源：`doc/IDEA.md`（玩法 / 存档 / λ. 构想）、`doc/mat/*`（现行规则表）、`doc/xyzb/*`（体素与存档格式）、`goal-panify/`（面板化）、`goal-remix/`（rgl 移植、生成器 remix）、`goal-renderapi.ts`（宿主契约）。
> 本目录现在只放文档，后续新宿主页面与模块也落在 `gode/` 下，所以各节同时写「目标文件布局」。
> 约定：**[定]** = 用户已确认；**[议]** = 待问；**[承]** = 沿用已有文档的结论，括号给出处。

## 0. 已定

| # | 决定 | 日期 |
|---|---|---|
| G-1 | 文档组织：本 README + `sNN-*.md` 每节一个子系统 | 11-08 |
| G-2 | `gode/` 先放文档，代码随后也进 `gode/` | 11-08 |
| G-3 | 渲染器 = **rgl**（基准，goodGL 管线）+ **新写的简版**。简版有两种：①无光影前向渲染（共用 rgl 的网格器和 Worker，给手机和低端机）②无头 / 地图渲染（M 键小地图的 Y 切片动画、存档截图、genview 俯视） | 11-08 |
| G-4 | Mob 与模型取自 goodPG（`src/shared/mobs.ts` 数据 + `mobTextures.ts` 程序贴图 + 姿态函数） | 11-08 |
| G-5 | 地形生成器有统一接口，goodGP / goodLiqPG 都可迁移进来，用 `?g=` 切换；生成器和 `createRenderer` 都要重构进 Worker，统一响应 `onkwarg` 初始化（IDEA §细则存档格式） | 11-08 |
| G-6 | M1 = 生成 + 渲染 Worker 跑通：两个生成器接口化并放进 Worker，`createRenderer` 接 `onkwarg`，`?g= / ?r=` 可切换，能走动，不含存档 | 11-08 |
| G-7 | 游戏本身是引擎，`$baseUrl/defl/` 只是默认模组（照 Luanti）；`$mode / $slicer` 可指向任意 Worker（s07） | 11-08 |
| G-8 | 所有模块（生成器 worker、渲染器、模组 worker）共用一个约定：**`onkwarg` 只用来设模块全局变量**，导出函数名 = 动词名，不再有 `create()` / `createRenderer()` 工厂（s02 §2、s03 §1） | 11-08 |
| G-9 | 常被模组改的子系统（BIME、配方、伤害、模式…）一律用 json / tsv / 声明式 js 表格列举（照 index.html 的 `BLOCK_DEFS / MOB_TYPES / HURT`），不写 `X.def(…)` 注册调用；BIME 四要素按 IDEA 划分与复用（s05 §1–§2） | 11-08 |
| [承] | rgl + 宿主 B 是基准，宿主 A 退役，贴图用 labPBR，tint 走回调（`goal-renderapi.ts` D-8…D-11） | 11-05 |

## 1. 节索引

| 节 | 文件 | 内容 | 状态 |
|---|---|---|---|
| s01 | `s01-arch.md` | 线程 / Worker 拓扑，`onkwarg` 与消息协议 | 初稿，已定 |
| s02 | `s02-gen.md` | 地形生成器接口（goodGP / goodLiqPG / gen.js） | 初稿，已定 |
| s03 | `s03-render.md` | rgl / lite / map 模块约定、minimap API 与 marker 事件、原生实体 pass | 初稿，已定 |
| s04 | `s04-blocks.md` | id 1–14、meta、linkBlk 状态、光照、方块能力 | 初稿，有待议 |
| s05 | `s05-mob-ent.md` | goodPG mob / 模型移植，Ent / Mob 事件模型 | 初稿，有待议 |
| s06 | `s06-save.md` | webp+zip、Pusc.json、XZP zstd、OPFS、文本体素、pile | 初稿，有待议 |
| s07 | `s07-play.md` | 引擎 / 默认模组划分、模组 worker 协议、cheat、iframe UI | 初稿，已定 |
| s08 | `s08-claw.md` | λ. 栏目答 / clawd / BBat / 钻石箱，零点同步 | 初稿，有待议 |
| s09 | `s09-panify.md` | `c_` / `gg.pane`、常调参数、屏幕布局、F3 调试、F4 相机 | 初稿，已定 |
| s10 | `s10-milestones.md` | M1 生成渲染 → M2 存档 → M3 模组生物 → M4 λ. | 初稿 |
| s11 | `s11-borrow.md` | 借鉴 goodPG：顶点格式、layerProps、存档健壮性、Durable Object 联机协议 | 初稿，已定 |
| s12 | `s12-agent-tools.md` | Agent 工具：`gd` 守护进程、实时截图目录、`gm.test` 钩子、机位导入、检查清单 | 初稿，已定 |
| s13 | `s13-pgviz.md` | pgviz 地形查看 / 调参（M0）：直接用生成器 Worker，参考 seed map 与 mcweb 的 UI | 初稿 |

## 2. 现状速查（读码，11-08）

| 来源 | 区块 / 高度 | 方块编码 | 索引 | Worker | 备注 |
|---|---|---|---|---|---|
| 宿主 B `gen.js` | 16², H 128，海 62 | u8 id + u8 meta | `x<<11\|z<<7\|y`（XZY） | 无，主线程 | 10 群系，`pendingFeatures` 跨块 |
| goodGP `js/world.js` | 16², H 256，海 62 | u8 id + meta + light（sky<<4\|blk） | `(y<<8)\|(z<<4)\|x` | 无 | `World.generate(cx,cz)` :153；12 群系；树靠重算 3×3 邻块（不外写） |
| goodLiqPG `src/world` | 16², y −64…320（H 384），海 63 | u16 = 12 位 type + 4 位 meta | `(yi*16+z)*16+x` | 有：池 2–8 个，SAB 或 transfer | 协议 `init/register/gen/mesh/biomeAt/spawn`；`generateChunk` 返回 `{biomes, outside}`；流体在主线程 |
| goodPG `src` | y −64…320 | u16 | `((y−MIN)<<8)\|(z<<4)\|x` | 有：`worldWorker.ts` `init/gen/mesh/spawn/error`；单机服务器也在 Worker | mob 数据纯表，AI 在服务端 20 Hz |
| rgl | 读宿主 `ChunkSource`，`(lx*16+lz)*H+y` | 经 `idLUT` 转 goodGL id | 18³ padded | `vendor/gl/pool.js`：`init{seed} / gen / mesh` | `createRenderer(ctx)` rgl/index.js:48 |
| IDEA 存档 | 最高 256 | 现场 id `0x8000\|自增` | YZX + RLE + 调色板 | Gen ×N → IO ×1 transfer | `onkwarg` 只在 IDEA:127 出现，未实现 |
