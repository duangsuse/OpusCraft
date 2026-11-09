# s14 · 子系统与数据流

> 缘起 [定 11-09，用户]：gode 立项是为了试验 **λ. 等新功能**，以及**存档 / 游戏状态 / 资源的理解**；**子系统的数据流整理同样不能落下**。
> 本节只回答三件事：①每类状态归谁、谁能写、怎么落盘；②宿主 B 现在的数据流长什么样（读码，11-09）；③gode 里每个子系统落在哪、哪个里程碑。
> 带 **[议]** 的是我的提案，未确认。其余是读码事实，行号指 `index.html`（宿主 B）。

## 1. 四类状态 [议]

数据流乱，多半因为不分类就都叫 `player` / `world` 全局。先分四类，每类只有一个权威和一条写入路径：

| 类 | 内容 | 权威 | 谁能写 | 落盘 | 丢了能重建吗 |
|---|---|---|---|---|---|
| **世界** | 方块 type+meta、biome、高度、tile（箱子 / 告示）、`pending`（跨块外溢） | main `World` | `world.set` 一条路径（§4） | XZP 只存 diff（s06 §4），pile 日志 | 方块不能（只能靠生成器重放 diff）；光照能 |
| **实体** | Mob / Ent / 掉落物 / BBat 实例 / 玩家 `#p1` | main 实体表 | 引擎 tick + 事件钩子 | `mat.tsv`；`Pusc.json` 里只留冗余子集 | 不能 |
| **规则与资源** | BIME 表、`c_` 参数、贴图 / 模型 / i18n、配方 | `defl → $links → $mode → 存档 → gg_v → &json=`（s09 §1，Compose4Cascade） | 面板 / `gm.pane.set` / 模组 `{set}`，同一条 `Ref.set` | `c_.json`、`BIME.tsv`；贴图只存链接 | 能（重新加载） |
| **派生缓存** | 光照、网格、天空盒、存档截图 `pic/` | 各自的计算者 | 只由上游变化触发重算 | 光照存 `xyzb.tsv` 尾部的 `BfsLight`（可选），其余不存 | 能，必须能 |

「理解存档」要验证的就是**第一、二类**的 dump → load 往返相等，第三类只验证覆盖顺序，第四类只验证不依赖落盘也能重算。

## 2. 宿主 B 的数据流现状（读码）

**主循环**（`Game.loop` :3746，`Game.tick` :3737）：

```
帧：stepPlayer（≤1/60 s 子步）→ ChunkManager.update → [≤4 次] 20 Hz tick → Interaction → Entities → Mobs → Particles → Weather → autosave(60 s) → 相机 → Sky → HUD → 渲染
tick：Scheduler.run(runScheduledTick) → Player.tick → RandomTicks.tick → Weather.tick → Events.emit('tick')   // Mobs.tick / 炉子订阅 'tick'
```

**写方块**（`World.setBlock` :1137）是唯一的正规写入点，顺序固定：

```
setBlock → 清 tile（emit tileRemoved）→ 写 blocks/meta → 高度图
        → c.modified = true                        ← 存档脏标记
        → Lighting.onBlockChanged（直接调用）       ← 光照
        → ChunkManager.markDirty                   ← 重网格
        → emit blockChanged + notifyNeighbors      ← 流体 / 重力 / 火 / 依存检查
              └ mobsim.js:513 订阅：Fluids.schedule / Scheduler.add(TICK_FALL / TICK_FIRE)
```

**存档读写**（`Save` :3021）是**手工枚举全部状态**：

- 写：`Save.head()` :3057 逐个读 `player / Sky / Weather / Game.mode / BBat.lib`。
- 读：`Game.start()` :3672 逐个往 `Sky / Weather / player / BBat / Game.mode` 里塞。
- 流向：`world → bwebp.dump → idb 槽`；`槽 / URL / 粘贴 → bwebp.load → data → Game.start → world`。

**耦合点**（这些是整理时要拆的）：

| # | 事实 | 后果 |
|---|---|---|
| D-1 | **多一条写路径**：`flushFluidDig` :2051 不走 `setBlock`，直接 `emit blockChanged` + `notifyNeighbors` | 订阅者看得到变化，但光照 / 脏标记 / 重网格没人触发；pile 日志会漏 |
| D-2 | `setMeta` :1165 **不发事件、不通知邻居**，只置 `modified` 与重网格 | 模组（`subs`）、联机广播、pile 日志都看不到 meta 变化（门开关、作物长大、流体液位） |
| D-3 | `SET_SILENT`（生成写入）直接绕过全部下游 | 合理，但 gode 里等价物是「slicer 生成」，要明确它不进 pile |
| D-4 | `Save.head` / `Game.start` 各自枚举状态 | 加一个子系统就要改两处，漏一处就是存档丢字段；DataFixerUpper 式迁移（s06）也无处挂 |
| D-5 | 子系统互相摸全局：`Scheduler` 读 `gg.Game.camera`、`gg.player`；`Interaction.checkSupport` 被 `World` 直接调 | 无法单独测，也无法搬进 Worker |
| D-6 | 文件名与内容不符：`mobsim.js` 里是 Mobs + **Fluids + Fire + RandomTicks**；`gls.js` 里是 Lighting + Mesher + Sky + Weather；`res_vam.js` 里是 Atlas + ResourcePack + MobSkin + **SND** | 找东西靠记忆；音效表混在贴图文件里 |
| D-7 | 服务定位器：`gg.my(new class X)` 把单例挂到全局 `gg.X`，`index.html` 顶层 `const` 表 | 好处是模组能摸到，坏处是依赖关系看不出来 |

## 3. gode 里的子系统一览 [议]

「状态」列用 §1 的四类。「归属」：**main** = 主线程引擎；**w** = slicer / io worker；**defl** = 默认模组（数据）；**r** = 渲染器模块。

| 子系统 | 宿主 B 位置 | 状态 | 在 gode 的归属 | 订阅 / 产出 | M |
|---|---|---|---|---|---|
| 区块 / 世界镜像 | `World` :1084 | 世界 | main `world.js` ✅ | 产出 Δ（§4） | M1 ✅ |
| 生成 | `Terrain`、`gen.js` | 派生（可重放） | w `slicer.js` + `defl/g/*` ✅ | 产出 `gen` | M1 ✅ |
| 光照 | `Lighting`（`gls.js`:15） | 派生 | w 初始光 ✅ + main 增量 | 订阅 Δ | M1-8 |
| 网格 | `Mesher` | 派生 | w `mesh` 动词 ✅ | 订阅 Δ | M1 ✅ |
| 移动 / 碰撞 | `Physics` :1464、`Player.update` | 实体（玩家） | main `phys.js` ✅ | 读世界 | M1 ✅ |
| 输入 / 触屏 / 帮助键 | `Input` :1552、`Touch` :3860、`HelpKeys` :4072 | — | main `input.js`：把键 / 触摸归一成**意图**（move / jump / use / tap） | 产出意图 | **未排期** |
| 交互（挖 / 放 / 使用物品） | `Interaction` :1933 | — | main `interact.js`：意图 → `ontap` → 无返回才走破坏 → `world.set` | 产出 Δ | M3-7 |
| 玩家状态（HP / 饥饿 / 物品栏） | `player`、`Player`、`HURT` | 实体（`#p1`） | main；机制在引擎，规则在 `defl/hurt` | 订阅 `tick`、Δ | M3 |
| 物品栏 / 熔炉 / 容器 | `Inventory` :2297、`Furnace` :2332 | 世界（tile）+ 实体 | main 引擎管格子逻辑，`recipe.tsv` 给规则 | 订阅 `tick` | M3-1 |
| 调度 + 流体 / 火 / 随机 tick | `Scheduler` :525、`Fluids / Fire / RandomTicks`（`mobsim.js`） | 世界（pending 表） | main `sim/`，20 Hz，订阅 Δ。**留 main 还是下沉 sim worker 待议**（s01） | 订阅 Δ → 产出 Δ | **未排期** |
| Mob / Ent / BIME | `Mobs`（`mobsim.js`）、`MOB_TYPES` | 实体 | main + `defl/mob.json / on.js` | 订阅 `tick`、Δ | M3-6/7 |
| 粒子 | `Particles` :2731 | 派生（不存） | r 侧或 main `fx/`：订阅 `blk_break` 之类的事后事件 | 订阅事件 | **未排期** |
| 音效 | `SND`（`res_vam.js`:575） | 派生 | 同上，订阅事件；**文档里全无** | 订阅事件 | **未排期** |
| 天气 / 天空 / 时钟 | `Sky / Weather`（`gls.js`）、`$Time` | 规则（时钟）+ 派生 | main 时钟 ✅（`boot.js` 最小版）；渲染在 rgl | `c_Time / c_Weather` | M1-9 |
| 资源（贴图 / 模型 / 包） | `Atlas / ResourcePack / MobSkin` | 规则与资源 | main 加载，`$links` 里的 `{js,zip}`（s06） | 产出 `atlasRebuilt` | M3 |
| 参数 / 面板 | `gg.rndr / gg.sim`、`menu` | 规则 | main `gg.vars / c_ / gg.pane` | 产出 `set` | **M1-2** |
| 存档 / 标题屏 / 屏保 | `Save` :3021、`Title`、`Screensaver` | 世界 + 实体 | w `io.js` + main 状态注册表（§5） | 订阅 Δ（pile） | M2 |
| BBat / gm / λ. | `BBat` :2391、`gm` :2477 | 实体 + 规则 | main；λ. 是 BBat 的 LS 扩展（s08） | 订阅 / 产出 Δ | M4 |
| Agent 工具 | — | — | `gode/tools/` ✅ | — | M0 ✅ |

**没有排期或没有文档的**：输入 / 触屏、调度与流体 / 火、粒子、音效。它们在宿主 B 里占很大篇幅（`Touch` 一个模块约 210 行，它把触摸合成成键盘事件塞进 `Input.keys`，等于已有一个雏形的意图层），M3 做完不会自动收进来。

## 4. 一条写路径、一种 Δ [议]

这是整理数据流的核心提案。宿主 B 的 D-1、D-2 说明：**「谁关心方块变了」** 现在是各处手写。而 gode 已经有四个消费者想要同一条流：

| 消费者 | 要什么 | 出处 |
|---|---|---|
| 光照 | 方块 type 改变（opacity / emit 变） | M1-8 |
| 网格 | 受影响的 section | rgl `onBlockChanged` |
| **pile 存档** | 有序的 place 序列（序号，不认时间戳） | s06 §6 |
| **联机** | 同一个序列，服务端权威 | s06 S-4、s11 §2 |
| 模组 `subs` | 事后事件（`blk_*`、`onhit`） | s07 M-3 |

```
意图（输入 / 模组 / 命令）
   └→ world.set(x,y,z, v, {src})        ← 唯一写入口（包括 meta；宿主 B 的 setMeta / flushFluidDig 并进来）
         ├→ 写 chunk、置 rev
         └→ Δ { seq, x, y, z, old, new, src }  → 同步总线
               ├ light      增量 BFS（M1-8）
               ├ mesh       标脏 section（rgl 已接 onBlockChanged）
               ├ sim        schedule 流体 / 重力 / 火 / 依存检查
               ├ pile       追加日志（60 s 或 20 次 place 成段）  ← 存档
               ├ net        广播（只写协议，不排期）
               └ mods       只发订阅了的（s07 M-3）
```

要点：

- `src` 区分 `gen`（slicer 生成，**不进** pile、不进 net，对应 D-3）/ `player` / `sim` / `mod`。
- **存档就是 Δ 的持久化订阅者**：「存档 = 生成器 + Δ 重放」。这样 `gd check` 可以直接断言：**重放 Δ 到全新世界 = 现世界**（见 §6）。
- 当前 `World.set`（`main/world.js`）只写不发 Δ（`onBlock` 回调已有，但不带 `old` / `seq` / `src`）。M1-8 做增量光照时顺手把 Δ 的形状定下来，成本最小。
- 宿主 B 的字符串事件总线（`Events`）在 gode 里**不再用**：Δ 是类型固定的同步回调，其余（`tick`、`unlock` 等）才是命名事件。**[议]**

## 5. 状态注册表，取代手工枚举 [议]

对应 D-4。每个子系统声明自己要存的键，`Save` 只遍历注册表：

```js
// 声明式，同 G-9 的表格风格；不写 reg() 调用
export const save = {
  'p1':      { get: () => p1.toJSON(), set: (v) => p1.fromJSON(v), ver: 2, migrate: { 1: (v) => … } },
  'time':    { get: …, set: … },
  'weather': …,
}
```

- 迁移（`MIGRATIONS`，s06）跟着条目走，加字段只改一处。
- 与 s06 的文件对应：`p1` → `mat.tsv #p1`；`time / weather` → `Pusc.json` 基础信息；模组自己的状态 → `Pusc.json` 里按模组 id 分区。
- 读存档的顺序固定：**世界 → 规则（BIME 先于方块）→ 实体 → 玩家 → 时钟**，因为实体放置依赖 BIME 局部 id。

## 6. 数据流是否对，靠检查说话 [议]

都挂在 `checks.tsv`（`gd check`），每条对应一个「理解」目标：

| 检查 | 断言 | 验证的理解 |
|---|---|---|
| `delta-replay` | 随机改 N 个方块 + meta 后，导出 Δ 序列，重放到同种子新世界，`hash` 相等 | 存档 / 联机的基础 |
| `save-roundtrip` | dump → load 后 `hash`、`#p1`、时钟、天气相等 | 存档 / 游戏状态 |
| `save-unknown` | 存档带未知调色板条目 → 渲染成打不破的未知方块，不崩 | s06 |
| `cascade` | `&json=` > `gg_v` > 存档 > 模组 > `defl` > 字面量，逐层断言取值 | 资源与参数的覆盖顺序 |
| `single-write` | 全部写入口只剩 `world.set`（grep + 运行期计数：Δ 数 = 版本号增量） | 一条写路径 |
| `relight` | 改块后增量光照 = 全量重算光照 | M1-8 |

`genhash-g`（M1 已有）验证的是**生成器 → 世界**这一段；上面几条补**世界 → 存档 → 世界**。

## 7. 确认结果

| # | 问题 | 结论 |
|---|---|---|
| Q-1 | §4 的 Δ 总线与「一条写路径」是否采用？是则 M1-8 里一起做 | **[定 11-09]** 采用 |
| Q-2 | 流体 / 火 / 随机 tick：M1–M3 留 main 的 20 Hz（s01 的现状），写成订阅 Δ 的独立模块，以后好下沉？（s11 §2 已讨论过整体下沉 `sim` worker 的代价，这里只是不堵死那条路） | **[定 11-09]** 留 main，按 Δ 订阅写，接口不依赖 main |
| Q-3 | 粒子、音效：归引擎的事后事件订阅者（渲染器可无），还是归渲染器模块？ | **[定 11-09]**（§8）引擎订阅者，lite / gl 都能用 |
| Q-4 | 输入 / 触屏 / 帮助键：M3 前补一个「意图层」，让物理、交互、λ. 都只吃意图？ | **[定 11-09]**（§8）补，M1-9 的 F3 / F4 之前 |
| Q-5 | §5 状态注册表是否取代 `Save.head` 式枚举？ | **[定 11-09]** 取代 |

## 8. TS 声明式数据流：`gode/flow/` [定 11-09，用户]

> 用户 11-09：子系统先用 TS 写出声明式数据流，再开工程；粒度到 KubeJS / Luanti 模组 API 的程度；模块之间的连接点与数据类型要一眼能懂。

**模块划分（用户定）**：音效（BGM / 持续状态 / SFX）· 粒子（挖方块 / firefly / flutter / fire）· 模拟（流体 / 火 / 光照 BFS）· 天气 · 标题屏 UI · HUD + 命令 · 输入 + 触屏 + 相机抖动。屏保不做。对应 `flow/audio fx sim weather title hud input feel.ts`（s16 起输入拆出 `feel`）、框架 `kernel.ts`；已有或后续里程碑的模块（game world p1 interact ents render save pane slicer）只在 `flow/host.ts` 写连接点。

**连接点规则（用户定）**：跨模块的数据，信息量不超过它的口诀文本。例：相机 → 渲染器只同步 `Pose`，即 `&p1=@x,z^y,yaw,pitch,fov` 的 6 个数（IDEA L68）；渲染器要的其余信息自己经 gm 取（`Here` 4 Hz、`Clock` 每帧、`gm.world.at`）。rgl 现在读的 `env.flying`（锐阴影距离）不在 Pose 里，改成 p1 切飞行时写 `c_.Gl` 参数。

每个模块文件的结构相同：

| 段 | 内容 |
|---|---|
| `Out` | 本模块发出的事件与载荷（合进 `index.ts` 的 `Ev`） |
| `Api` | 本模块提供的 gm 命名空间（合进 `Gm` = `window.gm` 的形状） |
| 声明表 | `defl/` 下的表，行类型 + 宿主 B 的现值：`ACTS CAMS`（原 `KEYS`）、`SND SFX LOOPS BGM`、`BURSTS EMIT AMBIENT`、`FLUID HARDEN ABM`、`PRECIP`、`MOVES BIND`（原 `STATES / ELEMS`，s16）、`F3 CMDS` |
| `c_*` | 面板参数的字面量默认值（s09 §1 最底层） |
| `mod` | 位置、发出（带频率）、订阅、`depends`（经 gm 调用的命名空间）、读的 `defl/` 表、`c_` 主题、存档键；`core` / `off`（s16）。这是设计期规格，运行时登记处自己观察；`doc` 只是 Ref `mod.<id>.doc` 的初值 |

检查方法：

- `node ~/.bun/install/cache/typescript@5.9.3@@@1/bin/tsc -p gode/flow`：类型检查通过，就说明连接点对得上。共九条检查，见 `index.ts` 头注释：没人发的订阅、一个事件有多个发出者、`emit` 与 `Out` 不一致、同名事件载荷冲突、`depends` 写了不存在的命名空间、表里的事件没订阅，以及 s16 加的三条（MOVES 行、BIND 行、非核心模块要写 `off`）。除第五条外都已用故意弄断的副本验证会报错（s16 §10 的三条与 `depends` 也验过）。
- `node gode/flow/graph.ts`：打印模块表与事件矩阵。没有模块订阅的事件标「（模组）」，目前有 `biome fire_burn fire_out grow hour cmd`。加参数 `mermaid` 打印流程图。

本节对 §7 的影响：

- **Q-3**：粒子、音效归引擎的事后事件订阅者。粒子的模拟与绘制在渲染器（`RenderFx`，lite 至少实现 `burst`）。
- **Q-4**：意图层采用，即 `Intent`。触屏不再合成键盘事件。
- **Q-1、Q-2、Q-5**：写进了 TS（`delta` 总线；sim 留 main，只订阅 `delta / tick`；`mod.save` 列状态注册表的键），用户 11-09 确认。

新增问题（11-09 已拍板，TS 已按结论写）：

| # | 问题 | 结论 [定 11-09] |
|---|---|---|
| Q-roll | 宿主 B 的受伤歪头、死亡侧倒是相机 roll，Pose 没有这一项 | 不加 roll，受伤改成 pitch 下压 |
| Q-ortho | F4 5–9 正交相机没有 fov | **取消** [11-09，用户：CAMS 只留第一人称 / 环绕玩家 / 背后第三]；没有正交相机，`fov` 恒 > 0 |
| Q-cmd | 命令行的键：宿主 B 的 T（早上）/ R（切天气）是 cheat 键 | `/` 与 Enter 开命令行；T、R 绑成命令 `/time 7`、`/weather next`（`ACTS` 第一列可以直接写命令） |
| Q-wx | 宿主 B 的天气是随机计时器，联机两端会不同 | 全局天气 = `wxAt(t, seed)` 纯函数（s11 B-5），命令改天气只存覆盖段。天气换成 goodLiqPG 的 7 种后仍是确定性（s15 L-10） |

**模块框架（s16，11-09 用户指出 `STATES` 过度拆解、`doc` 不该是元数据、`uses` 没牙之后）**：

- 模块描述符字段：`uses → depends`（有牙：加载顺序 + 受限 gm 视图），`defl → tables`；新增 `core`（引擎核心不可停）和 `off`（默认模组停用后消费者看到什么）；`where` 去掉 `'dom'`（页面是 Ref 的视图，不是运行位置），加 `'worker'`。`doc` 只是运行时 Ref `mod.<id>.doc` 的初值。
- `STATES`、`ELEMS` 取消，换成 kernel 的 `BIND` 表 + 页面 `html[data-*]`；`KEYS → ACTS`（虚拟键表，`Action` 开放）；`MOVES` 通用化为 `[Ref, 从, 动作, 到]`；`Screen` 开放。
- `input` 拆出可停用的 `feel`（Pose 大小的 6 个差量 `Feel`）；新增 `kernel`（登记处、脚本加载、MOVES 执行、绑定器、`gm.mods / gm.tbl`）。
- 状态型事件在持有者命名空间里各有一个同名的「最新值」Ref（`world.here`、`p1.stat`、`inv.hot`、`weather.clock`…），供页面绑定。

画面反馈（云、阴影、反射、天气、粒子）带来的改动见 **s15**：新增 `flow/render.ts`（渲染器的连接点与 `c_` 参数主题，原先写在 `host.ts`），`Clock` 改带天气参数行，`Here` 加 `held`。
