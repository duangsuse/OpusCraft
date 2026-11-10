<!-- handover/renderer-refactor/s12-hostB-upgrade.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§12 宿主 B 同步升级（热切换 / 冻结 / 机位 / 植被面板 / 验证世界）**
> 状态：有效；只在 P4 用
> 何时读：P4a 之前做 12.1–12.3
> 对应 goal-renderapi.ts：↔ ts §8

## 12. 宿主 B 同步升级（精简版：只为减少渲染前差异、方便 HITL）

> 目标不是给宿主 B 加功能，而是让 gls 网格路径与 v2 **吃同一份输入、受同一组旋钮控制、在同一机位同一时刻出图**，HITL 只需要比较两张画面。每项都给出「它消除了哪种渲染前差异」。
> 约定沿用 `game-spec.md` §9：数据进 `c_*`，行为进 `gg.my(new class …)` 单例，面板只绑 `c_*`。

### 12.1 渲染器热切换（不刷新页面）

- `c_Render = { backend: 'gls' | 'v2', key: 'F6' }`；`Render` 单例：切到 v2 时 `chunkGroup.visible=false`、创建/复用 `VR`，切回时反向；**两边共享同一套 `Chunk` 数据与 `Lighting` 输出**，不重新生成世界。
- `XRay` 开启、`modeDef.solidWater`、标题预览 / 屏保状态 → 强制 `gls`（§11.3），面板上该项灰掉并显示原因。
- 消除的差异：世界 / 时间 / 玩家位置在两次观察之间的漂移；HITL 不再需要「开两个标签页对齐」。

### 12.2 环境冻结开关 `c_Dbg.freeze`

> ⚠ goal-renderapi.ts §8 的类型名为 `c_DbgFreeze`（字段 `on/time/weather/cloudX/tick` 一致）；落地时是独立 `c_DbgFreeze` 还是 `c_Dbg.freeze` 子对象由宿主 B 的 `c_*` 命名习惯（game-spec.md §9）决定，v2 不感知。

- 一个布尔 + 一组字段：`{ on, time: 0.12, weather: 'clear', cloudX: 0, tick: false }`。`on` 时：`time` 固定（复用 `gm_time.set` 的路径）、`Weather` 停、`Scheduler`/`RandomTicks`/`Mobs` 的 20 Hz tick 暂停（流体不流、草不长、生物不动）、云偏移不前进、水波相位冻结（gls 的 `uWave`/v2 的 `D.time` 同源）。
- 消除的差异：两次截图之间的流体 / 植被 / 天光变化；与 `bench-v2.mjs` 的 `worldTime 0.12` 冻结口径一致。

### 12.3 机位书签 `c_Bench.poses`

- `[{ name, x, y, z, yaw, pitch, time? }]`，URL `?pose=plain` 或面板下拉直接传送（复用 `gm_xyz.set`）。默认四个与 §6.1 同名（plain / canopy / cave / water）+ `uw`（水下仰视，goals-trees §3）+ `models`（§12.5 验证世界的全景机位）。
- `tools/bench-v2.mjs --url index.html` 直接读这张表，不再在脚本里硬编码坐标。
- 消除的差异：机位误差；gls/v2 截图可逐像素对齐（同 FOV：宿主 B 的 FOV 乘数 `c_Motion` 在 freeze 时取 1）。

### 12.4 植被面板 `c_Veg`（gls 与 v2 同源）

> ⚠ `VR.apply(key)` 尚未导出（§0.2 L1698 的导出表里没有）；goal-renderapi.ts §0 `Renderer.apply?` 已列为可选方法，P4c 接 `c_Veg` 时补。

宿主 B 的 Tweakpane 加 folder「渲染 › 植被」，绑一个纯数据对象；**gls 的 mesher/着色器和 v2 适配器都读它**，v2 侧通过 `VR.apply(key)` 同步到 `P`（持久化仍在宿主 B 这边，v2 的 `vc.v2.params` 在宿主 B 里只作缓存）。

| 字段 | 范围 / 默认 | gls 路径怎么做 | v2 路径 | 消除的差异 |
|---|---|---|---|---|
| `swayAmp / swayFreq / swayDist` | 0–0.15 / 0.3–3 / 8–96；默认 0（关） | 顶点着色器对 `leaves` 层与 `cross/crop` 顶点做剪切（goals-trees §1 的 v1 解法），超出 `swayDist` 权重 0 | `P.swayAmp…`（已有） | 摇动相位：两边同用 `hash(格坐标)` + 同一 `uTime` |
| `crossSway` | 开关 | 同上只作用于 cross/crop | 已有高草摇动 | 花草是否动 |
| `leafCull` | 开关，默认开 | mesher 跳过 6 邻全叶的叶子格（本来不出面，差异只在 alpha 穿透） | `leafCullInterior` | 树冠内部透光 |
| `tintMode` | `biome` / `climate` | `tintFor` 二选一：按群系 RGB，或 (temp,hum) 查共享色图 | `uBio` + 同一色图 | **草 / 叶 / 水颜色**——HITL 最先注意到的差异 |
| `leafStyle` | 方块 / 卡片 | gls 不实现，面板标「仅 v2」 | `P.leafStyle` | — |
| `leafShadow / leafShadowDist / leafLodDist` | 同 goals-trees §1 | 不适用（gls 无阴影射线） | 已有 | — |

改 `c_Veg` 任何字段：gls 侧 `markDirty` 全部已建网格区块（预算内逐帧重建），v2 侧 `reuploadAll` 或仅改 uniform。两边**默认值全 0 / 关 = 与 p0 一致**。

### 12.5 验证世界 `test/bw_topic.webp`

> ⚠ TODO-6 已决定：文件名统一为 **`test/bw_models.webp`**（本节标题的 `bw_topic` / 正文的 `bw_house` 均读作它）；入口 `?xyzb=<url>&pose=models`。

当需要时，请求用户搭建世界存档，要求用户站在某个方块上退出即可。示例说明如下：

- 用创造 W + `BBat` 搭一组结构并存档到 ./test/bw_house.webp：每种 `model` 各一排（含 8 档雪层、8 阶段小麦、开 / 关门、4 向梯子与火把、半砖 / 台阶组合、仙人掌、火），一池静水 + 一条从源头流下 7 级的水、一格岩浆、一面 1 格厚贴天空的墙（§5-4 穿帮测试）、一棵每种树，玩家正对小麦。
- `bwebp` 只存改动过的区块，文件几十 KB；`head.seed` 固定 → 周围地形确定。`?xyzb=.webp链接` 进入，`?pose=models` 到位。
- 消除的差异：每次 HITL 自己临时搭场景造成的不可复现。

### 12.6 明确不做

> ⚠ **测试分工（用户拍板）**：需要特殊场景（如 12.5 验证世界）时由**人类搭建**——Agent 只需请求「搭好后站在某个方块上退出存档」；自动化只到**截图**为止（`tools/bench-v2.mjs --url index.html --save/--cmp`、`?pose=` 机位），12.2 冻结 / 12.3 机位 / 12.4 植被等**动态项一律由人在 Tweakpane 手工调**，不写脚本驱动面板。

- 不给 gls 网格加卡片树叶、阴影、反射等 v2 效果（HITL 比的是「渲染前输入一致」，不是「画面一样」）。
- 不做分屏合成；热切换 + 截图对已够。
- 不改 `c_*` 以外的玩法逻辑；`freeze` 只暂停，不改状态。
- 顺序：12.1 → 12.2 → 12.3（三者合计很小，P4a 之前做完）→ 12.5（P4b 验收依赖）→ 12.4（P4c 的 `uBio` 就绪时一起）→ 12.6。
