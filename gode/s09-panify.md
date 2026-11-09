# s09 · 面板：最终需求与落地（11-09 对齐）

> 上游：IDEA「三大件」L82–92（**最终需求的唯一出处**）；`goal-panify/README.md` 是很久之前的策划，旧需求可能有多余，已按 §4.1 删减，只有仍有效的部分才引用；`doc/lib.md`。
> 规格在 `gode/flow/pane.ts`（面板声明与独立窗口协议）和 `kernel.ts`（Ref、页面绑定、模块框架）。用户用表单两轮拍板（11-09）。

## 0. 已定

| # | 决定 |
|---|---|
| P-1 | gode 在 **M1 从零实现** `c_` 命名空间、`gg.vars` Ref、`gg.pane`、取值优先级（goal-panify 第 1–3 步，按 §4.1 删减后）；rgl 的 P 面板直接用它。宿主 B 不改 [11-08] |
| P-2 | **`it` 写在键的前一级**：`c_.Gl.ao.it.strength` ≡ `pane.addBinding(c_.Gl.ao, 'strength')`；Ref 直接给出 owner + key，不解析路径字符串（关闭 goal-panify §2 的 ⚠） [11-08] |
| P-3 | 所有 `c_Topic` 的默认值放进一个 `defl/c_.json`（s07 M-6），**取代** goal-panify §3.2 的 `{页面名}.json` [11-08] |
| P-0 | **记法** [11-09，用户]：标记语言里（pkv、tsv 的列、命令行、`Mod.c_` 的登记、`{set}` 的路径）参数主题写 `$Fx`（`$Fx.gravity`）；JS 里仍是 `c_.Fx`（访问写法，`it` / `addBinding` 照旧）。两者等价 |
| P-4 | [11-09，s16] Ref 另带 owner **模块 id** 与 `meta.doc`（任何路径都可有 doc，存 `defl/doc.tsv`，运行时可改）、`meta.options`（枚举取值顺序，MOVES 的 `<next>` 用）；路径根新增 `mod / tbl / act`，以及 gm 的 Ref 型成员（`title.screen`、`cam.mode`…） |
| P-5 | [11-09，s16] 面板多一个「模组」root：列表、启停、改 doc / 参数 / 表行、实时订阅与发出计数、依赖图。没有管理工具的模块化无效 |
| P-6 | [11-09] **最终需求以 IDEA L82–92 为准**（§4）；panify 里 IDEA 没提的旧需求按 §4.1 处理 |
| P-7 | [11-09] **面板声明是纯数据**（§9）：行 = Ref 路径 / 路径对（vec2）/ 动作名 / 表名；**没有函数行**（旧 `(folder) => {…}` 取消）。按钮 = 虚拟键或命令，与 `ACTS` 同一套 |
| P-8 | [11-09] **独立窗口 = 独立面板页，游戏窗口为唯一真相**（§10）：`gode/panel.html` 经 `BroadcastChannel` 要 schema、订阅变化、回写 `set` / 动作。不做「把 DOM 搬进弹窗」 |
| P-9 | [11-09] **两个窗口各一条任务栏，root 有「归属窗口」**（§6）。游戏窗口可停左上 / 右上 / 暂停菜单（IDEA L90），独立窗口自由摆放。每个 root 同一时刻只在一处 |
| P-10 | [11-09] **R7 = 枚举行的前 3 项在文件夹标题行显示成链接**，折叠着也能点（§9） |

## 1. 取值优先级

```
声明字面量  <  defl/c_.json  <  $links / $mode 模组的 c_.json  <  存档 Pusc.json 的 c_  <  gg_v（上次）  <  &json=
```

- 比 goal-panify 多了两层：模组层（Compose4Cascade，s07 §4 同一顺序）和存档层。
- 「恢复默认」回到 `defl/c_.json` + 模组层，不回到字面量。
- `✎ 落盘 js 默认` 改写 `defl/c_.json`：经开发服务器 `PUT /__dev/write`（`gode/tools/dev.js`，s16 §13.4）。IDEA L92 里的「port:8766 热重载助手」就是它，已合并在 `:8765`。

## 2. Worker 里的 `c_`

- slicer、模组 worker 收到 `onkwarg.kw`（s01 §2）后，用同一个 `gg.vars` 实现建自己的 `c_` 表。
- 面板改 worker 侧参数（生成器 knobs、渲染器 P）：main 的 Ref.set → 发 `{set:{路径: 值}}` 给对应 worker。worker 的 Ref 是 main 的镜像，不直接挂面板；**独立面板页也只跟 main 说话**，worker 对它不可见（R9：「`&r= &g=` Worker 都能用」）。
- `meta.fx` 路由：`fx: 'regen'` 表示改后重生成视野内区块（生成器 knobs），`fx: 'gl_wtf'` 表示 GL 重编译（goal-panify §3.3）。

## 3. DEF 表

- 有面板的 DEF 表（`BLOCK_DEFS ITEM_DEFS MOB_TYPES HURT FLUID BIOMES TOOL_TIERS …`）都成为 `defl/*.tsv`（s04 §6、s07 M-6）。
- 面板用 `pickLib`（可搜索，先划选一行再改它的字段，R5），编辑后按行写回 tsv。
- 路径写法：`blk.:sand.gravity`、`mob.zombie.ATK`、`p1.HP`，与 s07 的 `set` 共用。

## 4. 最终需求 [定 11-09，用户：以 IDEA L82–92 为准，加 N1–N3]

「声明式，方便、跟手。」（IDEA L88）

| # | 需求 | 出处 | 落点 |
|---|---|---|---|
| R1 | 声明式：pane 的行、Pass 的 `${}` getter、`$Fx` 参数是**同一个 Ref**（动态调优项目基建，边做游戏边准备 MOD 生态） | L84 | P-2、§9 |
| R2 | 文件夹级预设；预设头部是动作项：＋保存 / －删除 / ⎘ 转 `&json=` / ✎ 落盘 js 默认 | L86、L92 | §9（预设头部由面板自动给），§1 |
| R3 | 两个相关键并成 vec2，±1 手调 | L86 | §9 `PaneRow` 的路径对 |
| R4 | 键区间 / 默认值可热编辑并落盘 | L86 | §9：行右键直接改 min / max，✎ 落盘 |
| R5 | `pickLib`：先划选条目，再改 KV | L86 | §9 `{ pick, fields }` |
| R6 | checkbox 切换后能看到 fps 差异 | L86 | §9 `timeit`：切换后等 2 s 稳定，前后各取 1 s 的 fps / gpu 中位数，悬停显示差值 |
| R7 | 前 3 个下拉项转 `<a>`，折叠时也可见 | L86 | P-10、§9 `tabs` |
| R8 | 多 root、任务栏、文件夹折叠记忆；可停在左上 / 右上 / 暂停菜单 | L90 | P-9、§6 |
| R9 | 通信走 BroadcastChannel；`&r= &g=` 的 Worker 也能用；模组只拿白名单，所以不担心删档 | L90 | §2、§10、s07 M-2 / §5 |
| R10 | Compose4Cascade 分层取值 | L92 | §1 |
| N1 | tsv / json 外提，能热重载 | 用户 | s16 §13、`dev.js` ✔ |
| N2 | 模块插拔 | 用户 | s16 |
| N3 | **panes 放进单个独立窗口（带任务栏）调游戏属性** | 用户，新增 | P-7…P-9、§10 |

### 4.1 取消的旧需求 [定 11-09]

| 旧需求 | 为什么 |
|---|---|
| 宿主 B / v2 两套面板 DSL 的兼容层（`[key, () => target, opts, onChange]`、`HUD.syncs`） | gode 从零写，宿主 B 不改（P-1） |
| `{页面名}.json` 自动加载 | 被 `defl/c_.json` 取代（P-3） |
| `&gizmo=`、`&pose=名` | IDEA 的 `&p1=@x,z^y,yaw,pitch,fov`（L68）已经是机位口诀 |
| 手工剔微参数流程（tier 人工分级、每 root ≤ 8 行、降级建议表） | `tier` 字段留着，只当写权限：0 玩家 / 1 调优 / 2 仅 API / 3 冻结；模组 `set` 的白名单 tier ≤ 2（s07 M-2）。「整理」不是功能 |
| 钉住条 + Alt + 滚轮 + 悬停滚轮微调（旧 §6.1） | 「不离开准星调参」由独立窗口承担；单屏时用暂停菜单 |
| 交错 A/B 性能测量 + `/agg` 聚合悬停 | 只留 R6（切换前后 fps 差）。`dev.js` 的 `/t`、`/agg` 已写，留作可选，不进需求 |
| 专用「区间」root（右键弹出、×0.5…1.5 缩放） | R4 改为行右键直接改 min / max |
| 旧 §6 的固定屏幕布局（⚡ 右上、渲染右中、玩法左中、钉住条、区间 root 弹在外侧） | IDEA 只说「左上、右上、暂停菜单都能停」；改为 §6 的归属窗口 + 停靠位置 |
| 面板里的函数行 `(folder) => {…}` | 过不了窗口（P-7） |

## 5. 常调参数（用户 11-08 指定）

「要容易在 UI 里调」的参数全部是 **tier 0**，放进「⚡ 快调」root（默认归属 `game:tr`，`` ` `` 键开关），渲染类再在「渲染」root 按 IDEA 光影关键分文件夹。

| 参数 | 路径（示意） | 行类型 | 所在 root |
|---|---|---|---|
| 时间 | `$Time.hour`（5…29，24 = 日出，IDEA） | 数值 + `tpause` 单选（暂停菜单 / 暂停生物 / 暂停模拟 / 锁 1 帧） | ⚡ |
| 天气 | `$Weather.state` | 枚举 晴 / 雨 / 雷（`tabs`） | ⚡ |
| 航速 | `$Motion.flySpeed` | 数值，log 区间 | ⚡ |
| FOV / 视距 | `[$Cam.fov, $R.rd]` | vec2 `→FOV, 视距` | ⚡ |
| 渲染 scale | `$R.scale`（+ `maxMP` 在 tier 1） | 数值 | ⚡ |
| 阴影质量 | `$R.shadow` | 枚举 关 / 软 / 软 + 锐（花草，[承] render.md；`tabs`） | ⚡ |
| sunDir 偏移 | `[$Sun.azOff, $Sun.elOff]` | vec2 `→方位, 仰角`（度） | ⚡ |
| 岸边 / 水体涌浪 | `[$Water.shoreSurge, $Water.rippleSurge]` | vec2 | ⚡ |

「渲染」root 的文件夹（IDEA「光影关键」，每个文件夹第一行是该文件夹的开关或风格单选）：

| 文件夹 | 内容 |
|---|---|
| 天空 | 满天星 / HDRI / 夜空风格（[承] sky-fog 计划：夜空 fork 自 goodGL，配 Bliss 云） |
| 云 | Bliss 云、云光与 sunDir 匹配（`reference-vision/cloud-match-sunDir.png`） |
| 雾与云隙光 | 体积光、距离雾、晨雾（默认 0）、边界雾起点 |
| 水 | 水面高度场、岸边波浪、水底焦散、水散射与仰视（`bliss-caustics / bliss-reflect.png`） |
| 树与花草 | 树冠粗糙度 / 镜面、sunDir 色温、透射；交叉片树叶与花草的折纸感（自阴影调优）；flutter 落叶 |
| 影 | PCSS 软图、花草锐图、云影 |
| 光与粒子 | BfsLight 暖色、火把顶 2D 着色器（firefly、热空气）、粒子 |
| 新区块 | riseFade 下沉量与时长 |
| 后期 | TAA、bloom、曝光、ACES、饱和度、暗角 |

## 6. 停靠与任务栏 [定 11-09，用户：两个窗口各一条任务栏，root 有归属窗口]

IDEA L90：「同时可开多个 root，有【任务栏】和文件夹折叠记忆，左上、右上、暂停菜单都能停」，再加独立窗口（N3）。旧版的完整固定布局取消（§4.1）。

| `Home` | 在哪 | 打开方式 |
|---|---|---|
| `game:tl` | 游戏窗口左上（F3 调试文字也在这，§7） | 任务栏 |
| `game:tr` | 游戏窗口右上 | `` ` ``（Backquote，F12 作宿主 B 兼容别名）开关 ⚡ 快调；其余从任务栏 |
| `game:pause` | Esc 暂停屏里展开，不暂停时不显示 | Esc |
| `panel` | 独立面板页，自由摆放（拖拽标题栏），位置持久化 | 「↗ 独立窗口」（§10） |

- **root 有归属窗口，同一时刻只在一处**。标题栏有「↗ 移到另一窗口」（游戏窗口里 = 移去独立窗口，反之亦然），`gm.pane.home(root, to)` 同效。归属、位置、折叠、显隐都持久化：`gg_roots`、`gg_fold`，两个窗口各写各的键（`gg_roots.game` / `gg_roots.panel`），互不覆盖。
- **任务栏每窗口一条**：列出归属本窗口的 root，点标签显隐；末尾一个可搜索的单选条目（临时启用被禁用的 root，刷新页面后恢复）；另有「其它窗口」分组列出归属在别处的 root，点它 = 把 root 拉回本窗口。游戏窗口的任务栏在左下、半透明；面板页的在窗口底部。
- 默认归属：⚡ 快调 `game:tr`；渲染、玩法、模组 `game:pause`。

### 6.1 键盘焦点

面板内键盘输入不传给游戏（rgl panel.js 现有逻辑），但 `` ` `` F3 F4 Esc 例外（只对游戏窗口里的面板；独立窗口是另一个窗口，天然不抢游戏的键盘）。右键数值行的菜单：改 min / max（R4）、⎘ 复制为 `&json=`、恢复默认。

打开游戏窗口里的 ⚡ 快调（`game:tr`）时**不暂停游戏**（只释放指针）；Esc 暂停屏按 `tpause` 半透明，所以调渲染时能看到画面。放进独立窗口的 root 连指针都不用释放。

### 6.2 触屏

游戏窗口里各 root 变成底部抽屉（一次只开一个）。手机上没有独立窗口。

## 7. F3 调试信息

**与宿主 B `HUD.debugText`（index.html:2927）逐行一致**，分组与顺序不变：

```
Seed …
Draw calls · Tris
Liq +pending rm parked  <脚下流体 L meta>
Sun <天光> · torch <方块光>

Chunk (cx,cz)
Biome …
<时钟> is <天气>

Chunks loaded · XZP generated · X2V meshed
Ents · Mobs · Particles (宿主+fire)+(firefly+flutter)
Mob <type.state ♥ hp/max (x,y,z)>
XYZB <准星方块 (x,y,z)>

OpusCraft fps · sim ms
p1 (bx,by,bz) 朝向
(x,y,z)
```

- 同样附带 noclip + 飞行（宿主 B `toggleDebug` 行为）。
- 数据来源换成 gode：`Chunks / XZP / X2V` 三个计数分别是已加载 / slicer 已生成 / 已出网格；`Draw calls` 取渲染器 `stats()`。
- 上方加一行相机 Gizmo：`x y z yaw pitch fov` 六个数，可复制 / 粘贴传送（= `&p1=` 的口诀）；F4 切到非第一人称时显示的是当前相机。

## 8. F4 相机

**F4 不再开关 rgl 面板**（那个面板并入「渲染」root）。F4 轮转相机，Shift + F4 反向，长按 F4 回到第一人称。**[改 11-09，用户：只留三个]**

| # | 相机 | 旋转逻辑 | 操作 | 用途 |
|---|---|---|---|---|
| 1 | 第一人称 | look 转玩家朝向 | — | 默认 |
| 2 | **环绕玩家** | **look 转相机绕玩家的角度，玩家朝向不变**，WASD 相对相机方向 | 鼠标拖动旋转（松开后慢速自转）、滚轮距离 | 调光影、截图、看建筑 |
| 3 | 背后第三人称 | look 转玩家朝向（相机跟在后面） | 滚轮调距离 | 看自己 / 看生物模型 |

- 取消了：正面第三人称、minimap 俯视、斜视 ×4、全部正交相机（原 4–9）。M 键的 2D 地图（s03 §3）与相机无关，不受影响；`Pose` 不再有「fov ≤ 0 = 正交」的约定（core.ts）。
- 环绕与背后第三的区别在**旋转逻辑**（`CAMS.rot`：`orbit` / `body`），不只是距离。
- URL：`&cam=orbit | back`，与 `&p1=@x,z^y,yaw,pitch,fov` 一起用即可一条链接到位截图。gd 的 `iso-ne` 之类机位名是 Agent 工具自己的透视框景（s12），不对应游戏里的相机。
- 相机模式本身是 `$Cam.mode`（tier 0），也会出现在 ⚡ 快调里。

## 9. 面板声明 = 纯数据 [定 11-09，P-7]

模块脚本里 `gg.pane(root, rows, { home })`，`rows` 全是数据（类型 `PaneRow`，`pane.ts`）。下面这段用 `tsc` 的 `checkJs` 对着类型验过，零报错；把函数塞进 `rows`、`home` 写错、vec2 少一个键、`pick` 缺 `fields` 都会报：

```js
gg.pane('渲染', [
  ['光影', [
    ['$Shadow.shadowQ', { tabs: true }],                      // R7：枚举的前 3 项在文件夹标题行显示成链接
    [['$Shadow.sharpDist', '$Shadow.sharpSoft']],             // R3：两个相关键并成 vec2，±1 手调
    ['$Gl.taa', { timeit: 'taa' }],                           // R6：切换后显示前后 fps 差
    { act: '/time 7' },                                       // 按钮 = 虚拟键或命令
    { act: 'pause', label: '暂停' },
  ], { open: true }],
  ['方块', [{ pick: 'blk', fields: ['gravity', 'light'] }]],  // R5：先划选一行，再改字段
], { home: 'game:tr', title: '渲染' })
```

| 行 | 形状 | 说明 |
|---|---|---|
| Ref 行 | `[路径, 选项?]` | 控件种类由 Ref 的值与 `meta` 定（数 → 滑块，布尔 → 勾选，枚举 → 下拉 / 链接，色 → 取色器，多行文本）；标签、区间、`options`、`tier`、`fx` 都在 Ref 的 `meta` 里，声明处一次给全；选项只覆盖本行的 `label` / `tabs` / `timeit` |
| vec2 | `[[路径, 路径], 选项?]` | 两个相关键并成一行，各自 −1…+1 归一化手调，标签由键名拼（`→FOV, 视距`）；值文字显示在控件内 |
| 按钮 | `{ act, label? }` | `act` = 虚拟键名或命令（`'/time 7'`）；走 `input.press`，和页面的 `data-act` 同一条路；`label` 缺省取 `ACTS` 的标签 |
| pickLib | `{ pick, fields }` | `pick` = 表名（`gm.tbl` 的键：`blk`、`mob`、`bursts`），行可搜索；选中后只列 `fields`；大表不整张下发（§10） |
| 文件夹 | `[标题, rows, { open? }]` | 可嵌套；折叠状态持久化（`gg_fold`） |

- **预设头部不写在 rows 里**（R2）：每个文件夹和每个 root 的头部由面板自动给：＋保存 / －删除 / ⎘ 转 `&json=` / ✎ 落盘 js 默认。文件夹级预设只存 diff。
- **R4**：右键数值行 → 行内改 min / max 两个输入框；区间存 `gg_range`，✎ 落盘时连同默认值写进 `defl/c_.json`（格式见 §12）。
- **R6**：布尔行有 `timeit` 时，切换后等 `$Pane.fpsSettleMs`（2 s）稳定，前后各取 `$Pane.fpsSampleMs`（1 s）的 fps / gpu 中位数，悬停显示差值。不做交错 A/B。
- **R7**：`tabs` 行的枚举，前 `$Pane.tabs`（3）项在文件夹标题行显示成链接，折叠着也能点；选项 ≤ 3 的单选等于一组标题行按钮。
- 「模组」root（s16 §7）也是纯数据：每个模块一个文件夹，行是 `mod.<id>.on`、`mod.<id>.doc`（多行文本）与 `mod.<id>.*` 的只读 Ref（订阅数、发出次数）；重载 / 停用是按钮动作。

## 10. 独立窗口 [定 11-09，P-8]

### 10.1 形态

`gode/panel.html`：一张只有面板的小页面（Tweakpane + 任务栏 + 约 100 行客户端），**不含游戏代码、不开世界**。游戏窗口里「↗ 独立窗口」按钮调 `gm.pane.popOut()`（`window.open('gode/panel.html')`）；被浏览器拦截时在页面角落给一个回退链接（`goal-pgviz` §6 同款）；也可以手动打开同一个 URL。要求同源 http（`dev.js` 提供）；`file://` 下 `BroadcastChannel` 不通，页面检测到时提示。

```
游戏窗口（唯一真相）            面板页（远程视图）
  Ref 树 / 表 / 模块 / ACTS        Tweakpane + 任务栏
       ▲   │                           │
       │   └── schema / changed ─────▶│
       └────── set / act / home ───────┘
            BroadcastChannel('gode-pane')
```

### 10.2 协议（`pane.ts`：`PanelMsg` / `GameMsg` / `Schema`，同源，带版本 `v`）

| 方向 | 消息 | 作用 |
|---|---|---|
| 面板 → 游戏 | `hello` | 面板页上线：要 schema |
| | `set { path, v, seq }` | 改值。滑块拖动按帧合并，每路径每帧至多一条；游戏窗口走同一条 `Ref.set` 路由 |
| | `act { act, edge? }` | 按钮：虚拟键或命令 |
| | `home { root, to }` | 「移到另一窗口」 |
| | `tbl { name, q?, from?, n? }` | 懒取表行（`pickLib` 搜索 / 翻页；`blk.tsv` 这种大表不整张下发） |
| | `bye` | 面板页关闭 |
| 游戏 → 面板 | `schema` | 回应 `hello`；游戏启动完成、模块启停、root 变了也主动发，面板页整张重画。含 roots（rows 全是数据）、每个路径的 `meta`、当前值、按钮标签与键位提示 |
| | `changed { from, d }` | 值变了，每帧至多一条；`from` = 谁改的，发起者不重复应用 |
| | `tbl { name, from, rows, total }` | 表行 |
| | `beat { n }` | 心跳，每 `$Pane.beatMs`（1 s）一条；面板页 3 个周期没收到就变灰 |
| | `gone` | 游戏窗口 `pagehide`（关闭 / 刷新）：面板页变灰，等下一个 `schema` |
| | `err { path?, msg }` | 写被拒（tier 3 冻结 / 路径不存在） |

### 10.3 生命周期与一致性

- 面板页刷新：重发 `hello`，不影响游戏（IDEA L90「放另一个窗口里热重载改游戏」）。`dev.js` 的 SSE 让面板页自己也能热更新。
- 游戏窗口刷新：先发 `gone`，启动完成后主动发 `schema`；面板页自动重连。
- 冲突：最后写入者赢；`changed.from` 防回声；游戏窗口里的面板也收 `changed`（同一份值，两边一致）。
- 持久化：**值（`gg_v`、预设、`gg_range`）只由游戏窗口写**（单一写者）；界面状态（位置、折叠、归属、任务栏）各窗口写自己的键（§6）。
- **只开一个面板页**（N3「单个独立窗口」）：用 Web Locks，第二个面板页提示「已有面板页」并退出。

### 10.4 信任与限制

- `BroadcastChannel` 只在同源同浏览器内通；模组的 iframe（跨源）和 Worker **拿不到它**，只能走引擎转发的白名单动词（s07 M-2 / §5）。所以面板页（用户自己的页面）可以写 tier ≤ 2，模组仍只能写白名单 —— 「不担心恶意插件删你档」（R9）。tier 3（冻结）谁都不能写。
- **渲染节流风险**：浏览器可能节流被完全遮挡 / 最小化窗口的 `requestAnimationFrame`。独立窗口放在另一个屏幕或不遮挡游戏窗口时没问题；遮挡时游戏会「卡住」，面板页靠 `beat` 心跳发现并变灰提示。
- 独立窗口放在另一个屏幕时，游戏窗口**不必为调参释放指针锁**，也不必暂停：这是它相对暂停菜单的主要好处。

## 11. 落地顺序（工程，未排期）

1. **Ref + `c_` + `gg.vars`**：以 `rgl/vars.js` 为底，补 `owner / meta.doc / options`（P-2、P-4）。
2. **`gg.pane` 核心（游戏窗口）**：纯数据行 → Tweakpane；vec2、`pick`、`act`、`tabs`、`timeit`；右键菜单；预设头部；停靠位置 + 任务栏；把 rgl 现有的 `panel.js` 迁进来。**声明从第一天起就是纯数据**，否则第 5 步要返工。
3. **状态**：`gg_v`、命名预设、`gg_range`、`&json=`、✎ 经 `dev.js` 写 `defl/c_.json`。
4. **kernel（s16）**：模块加载、「模组」root。
5. **独立面板页**：`gode/panel.html` + 协议 + 「↗」+ 归属窗口。
6. `gd` 配合：`gd mods`、`gd check mods`（s16 §13.5）。

## 12. 默认值已写明、仍可改的小项（`TODO(decide)`）

| 项 | 默认 | 备选 |
|---|---|---|
| 首次打开面板页时，归属 `game:pause` 的 root | 自动迁到面板页（暂停菜单留一行「已移到独立窗口」） | 不动，用户从任务栏「其它窗口」分组拉 |
| 区间落盘格式 | `defl/c_.json` 里与主题同级的 `"_range": { "$Fx.gravity": [0, 2] }` | `gg_range` 只留 localStorage，不落盘 |
| 面板页文件 | `gode/panel.html` | `index.html?panel=1`（同一入口） |
| 多个面板页 | 只允许一个（Web Locks） | 都允许，各自任务栏状态按窗口 id 分开 |
| 收不到游戏心跳时（3 个周期） | 面板页变灰提示 | 不提示 |
