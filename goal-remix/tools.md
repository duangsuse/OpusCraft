# 工具：确定性 URL · genview（离线）· genscope（浏览器）· 探针面板

## 1. 一条 URL 复现一切（步骤 0）

⚠ **现状和预期不一样**：`?seed= / ?pose= / ?json=` 在宿主 B 上**都还没有**。`?r=` 和 `?seed=` 只在宿主 A（VoxelCraft.html:1323–1333、2660–2689）；`?json=` 只有 v2 自己会解析（v2.js:127–133、v2/gl.js:138–144）；`?pose= / &gizmo= / &tpause=` 是 goalP4P5 步骤 1 的计划。宿主 B 现在只认 `?tex=`（3594）和 `?xyzb=`（3597）。
用户（10-26）：宿主 B 以后会加 `?json=`，现在不急，**所有东西先在宿主 A 上试玩**（渲染器 `?r=gl` 也先接 A，见 render.md）。所以本包的步骤 0 缩小为：在宿主 B 里建这张表，先只填生成器要的 `g / seed` 和已有的 `tex / xyzb`；其余行留给 goalP4P5 步骤 1 或以后，表的形状照下面写，免得以后返工。

| 参数 | 值 | 作用 | 生效时机 | 来源 |
|---|---|---|---|---|
| `tex` | url | 资源包 | `Menus.init` | 已有（3594） |
| `xyzb` | url | 读入存档并进入世界 | `Title.bootFile → Title.boot` | 已有（3597、3388–3395） |
| `seed` | 字符串 | 一次性世界：不存档，跳过标题页 | 启动 | 新增，语义照宿主 A 2660–2689 |
| `g` | `old \| v1 \| v2` | 生成器（gen.md §1）。存档头里记录的 g 优先于 URL | `Game.start` 之前 | 新增。用户说的 `?gen=liq\|old` 统一写成 `g=v2\|old` |
| `t` | 0…1，一天里的比例，0 = 06:00（与 `Sky.time` 的 0 点一致） | `Sky.time = t·24000`，并**冻结昼夜** | `Game.start` 之后 | 新增 |
| `weather` | `clear \| rain \| thunder` | 设置 `Weather.raining / thunder`，并加锁，让 `tick`（gls.js:660）不再随机翻转 | 同上 | 新增 |
| `pose` / `gizmo` | 名字 / `x,y,z,yaw,pitch,fov` | 机位；`pose` 是 `c_Bench.poses` 里的别名 | 同上 | goalP4P5 步骤 1（§12.3） |
| `tpause` | 1 | 暂停生物和模拟，锁 1 帧 | 同上 | goalP4P5 步骤 1 |
| `r` | `gls \| v2 \| v2/gl \| gl` | 渲染器 | 启动 | goalP4P5 §12.1；`gl` 见 render.md |
| `json` | URL 编码的 JSON | v2 的 `P`；宿主侧对 `c_` 表做深赋值 | 启动后 | v2 已有；宿主侧随 goal-panify §3.2 |

- 写法：一张 `BOOT` 表，每行 `{ k, parse, phase: 'pre' | 'start' | 'post', apply }`，各阶段各遍历一次。别处不再直接读 `location.search`。
- 反向的 `Boot.url()` 根据当前状态拼出 URL：种子、g、相机 → `gizmo`、`Sky.time / 24000` → `t`、天气、r。探针面板的「复制 URL」用的就是它。
- 验收：同一条 URL 截两次，0 px；`Boot.url()` 打开后再调一次，输出相同。

## 2. `tools/genview.mjs`：离线出图，不进游戏（步骤 3）

由 `goodLiqPG/tools/preview_world.mjs`（393 行）改造。改法：**通用部分原样留下，LiqPG 专有的部分换成 pgen 契约 + 宿主布局**。所有生成器经过 xlate 之后都是同一种布局，所以工具只需要认一种。

| 部分 | preview_world.mjs 行号 | 处理 |
|---|---|---|
| `blend / scale / arg / runRegions / tiles`、bench 计时、山体阴影算法、PNG 输出 | 76–83、128–133、236–282 | 原样保留；PNG 改用宿主自己的 `tools/png.mjs` |
| `COL / BIOME_MAP_COL / topColor` | 11–75 | 移到 `pgen/mapcolors.js`，改成按**宿主方块名**索引；群系颜色改从 `meta.biomes[i].map` 取 |
| import 生成器、`TYPE_MASK` 解码、`(yi*16+z)*16+x` 扫描、`Uint16Array` 缓冲、`BLOCKS[t].model` 判断、`y + MIN_Y`、以 64 为基准的高程着色 | 8–9、49、54、56–65、72、98、108–109、146、213、220、325、342–343、356、365、376–383 | 改为 `create(seed, miniworld)`，走宿主布局（`xlate.LAYOUT.host`），判断用宿主 `DEF` |
| `outside` 合并规则 | 105–112、338–347 | 改为 `pgen/pending.js`，与游戏里同一份代码 |
| `--overview`（只用气候噪声近似地表） | 284–319（291–294、299） | 改用 `sample(x,z).h`：old / v1 是精确值，v2 仍是近似（gizmo.md §5） |
| `findSpawn / biomeAt` | 166–167 | 用契约里的 `findSpawn / sample` |

新增参数：

| 参数 | 输出 |
|---|---|
| `--g a,b` | 同种子、同范围的两张图并排拼在一起（俯瞰、群系、切片各一张），并加标注 |
| `--hash n` | 按行优先生成 n×n 块，输出内圈每块的 FNV 哈希（gen.md §2）。用于 old 回归和 vendor 等价性检查 |
| `--hist` | 地表 y 的分位数；洞穴空气按 y 分段的占比；某个 y 以上的实心占比（就是 README §1 那张表） |
| `--stats` | 群系占比；`pgen` 自报的特征列占比（例如石林） |
| `--knob K=V` | 改 knob 后再出图，和 genscope 的滑杆用同一套参数 |
| `--at x,z[,y]` | 打印 `sample` 和 `explain` 的 JSON，用来和探针、genscope 对数 |

- 输出目录从 `/tmp` 改为 `tools/out/gen/<tag>-*.png`。
- Worker 并行沿用 `runRegions`：每个 worker 自己 `create` 一份，接缝检查在合并之后做。

## 3. `tools/genscope.html`：点格子看项树，热力图调参（步骤 3）

浏览器页面，`http://localhost:8765/tools/genscope.html`，直接 `import` `pgen/*.js` 和 `pgen/mapcolors.js`。pgen 是纯 ESM，没有 DOM 依赖。

```
┌──────────── 左：画布 ─────────────────────┐┌──── 右：项树 ─────────────────┐
│ 俯瞰（topColor）│ 群系 │ 热力图[项 ▾] [y ▾] ││ (x, y, z)  biome  block        │
│ 拖动平移 / 滚轮缩放 / 点击选格              ││ density = 0.31   ← min 胜出：  │
│────────────────────────────────────────── ││   underground  0.31 ███████    │
│ 切片：过选中点的 x 向或 z 向竖剖面            ││     cheese    -0.12 ██         │
│ y 0…255；按方块着色 / 按项着色 / 按胜出项着色 ││     layer      0.40 ████████   │
│ 点切片上的格子 → 右侧换成该 (x, y, z)        ││   entrances    0.55            │
└────────────────────────────────────────────┘│ 8 角点 + 插值权重（v2）         │
 [g: v2 ▾] [种子] [knob 滑杆…] [并排: old ▾]     └───────────────────────────────┘
```

- **项树**：`explain(x, y, z)` 返回的树。`+` 节点显示每一项占 Σ|项| 的比例；`min / max` 节点高亮胜出的一支；"主导项"是从根往下、每一层都取贡献最大或胜出的那一支，直到叶子。old 和 v1 是高度场，项树就是一层加法：大陆样条基线、`mount·pk²·MOUNT_H`、丘陵、细节、河流下拉。
- **热力图**：可以选 `fields` 里的任意一项，也可以选项树里的任意节点路径（例如 `underground.cheese`），逐像素求值。3D 项取"地表 y"或滑杆指定的 y。还有一种**胜出项**图：按顶层 `min / max` 是哪一支胜出来分类着色。例如"整片山是被 jaggedness 撑起来的"，在 `jag` 热力图上一眼就能看出来；plains 的大空腔是 cheese 还是 entrances 造成的，看胜出项图。
- **滑杆**：来自 `knobs`，改完后重建可见区域。**并排**：两个生成器，或同一生成器的两组 knob，平移和缩放同步，点一个格子两边同时出项树。
- **URL 状态**：`?g=v2&seed=…&x=…&z=…&zoom=…&field=jag&knob=MOUNT_H:70`，可以分享，也可以交接给 AI。
- **性能**：缩得很小时，俯瞰只调用 `sample`（每列一次）；放大后才生成真实区块，切片也用真实区块。v2 每块 2.8 ms，32×32 块约 3 s，所以放进 Worker 生成。
- **复用**：着色规则来自 gizmo.md §4.1（mapcolors）；切片配色照 §4.3：地表以上的空气是天蓝色，洞穴空气近黑色。

验收：同一坐标在 `genview --at` 和 genscope 里显示的数值相同 → 人用它调一轮参数（例如 gen.md §6 的 meadow）。

## 4. 探针面板（步骤 7）

**挂在哪里、调用什么**（index.html 行号）：

| 用途 | 位置 / 调用 |
|---|---|
| 数据和单例 | `c_Probe`（显示哪些字段、叠加开关）+ `gg.my(new class Probe {…})`，放在 `HUD` 旁边（约 2934，那里现在只有 `c_Dbg`） |
| 刷新 | `HUD.update`（3012–3019）里，`this.debug` 打开时调用 `Probe.update()`，每秒 10 次 |
| 准星目标 | `Interaction.target ?? Interaction.raycast(...Player.eye(), ...Player.lookDir(), 64, true)`（raycast 1992，返回 `{x,y,z,face,dist,px,py,pz}`；`Player.eye / lookDir` 1697–1698）。⚠ `Interaction.target` 只在指针锁定、未暂停时更新（2032），面板打开时指针是解锁的 → 保留最后一次有效目标 |
| 方块 | `world.getBlock / getMeta / getDef`（1109–1132）：id、名字、meta；**生成时的 id** 取 `XRay.ref(c)?.b[bidx]`（1375），与当前不同就标"已编辑" |
| 光照 | 取命中面外侧那一格（`t + DIRS[t.face]`，`DIRS` 的顺序和 `FACE_*` 一致，374–375）：`getSky / getBlockLight / getLightLevel(x, y, z, Sky.dayFactor)` |
| 区块 | `chunkAt`（1106）：`cx, cz, state, modified, dirty` |
| 群系 | `c.biomes[x*16+z]` → `BIOMES` 行：名字、`snow / dry`，步骤 5b 之后还有列级 `temp / hum` |
| 气候 | `gg.Terrain.sample(x, z)`：**原样打印所有字段**，不同生成器各有各的字段；有 `explain` 的话再附上主导的前 3 项 |
| 草色 | `Mesher.tintFor(def, face, BIOMES[b])`（gls.js:288）的 RGB |
| 世界 | `g`、种子、`SEA_LEVEL` |
| 界面 | `menu.DBG`（3276）加一个「探针」文件夹，经 `buildPane`（3305）挂一行 `['text', () => Probe.text, { readonly: true, multiline: true, rows: 14, interval: 250 }]` |

控件：

- **强制天气**：晴 / 雨 / 雷，外加一个锁。设置 `Weather.raining / thunder`（gls.js:640–688），`tick`（660）看到锁就不再翻转。与 `?weather=` 共用这把锁。
- **群系色叠加**：`c_Probe.overlay` 打开后，`gls.js tintFor` 对所有面都返回 `BIOMES[b].map` 色，然后整体重建网格。`?r=gl` 和 v2 以后改成 uniform 开关，先只做 gls。
- **冻结时间**：与 `?t=` 共用。
- **复制 URL**：`Boot.url()`（§1）。

验收：用 CDP 设 `gizmo`，读出 `Probe.data` 的 JSON，与 `genview --at x,z,y` 比对：方块 id 与 `sample` 的字段一致 → 人用它回答"这里为什么是这个群系"。
