# s09 · 面板化在 gode 的落地

> 上游：`goal-panify/README.md` 全文（本节只写 gode 的差异）；IDEA「三大件」；`doc/lib.md`。

## 0. 已定 [11-08]

| # | 决定 |
|---|---|
| P-1 | gode 在 **M1 从零实现** goal-panify 第 1–3 步（`c_` 命名空间、`gg.vars` Ref、`gg.pane`、四层优先级）；rgl 的 P 面板直接用它。宿主 B 不改 |
| P-2 | **`it` 写在键的前一级**：`c_.Gl.ao.it.strength` ≡ `pane.addBinding(c_.Gl.ao, 'strength')`；Ref 直接给出 owner + key，不解析路径字符串（关闭 goal-panify §2 的 ⚠） |
| P-3 | 所有 `c_Topic` 的默认值放进一个 `defl/c_.json`（s07 M-6），**取代** goal-panify §3.2 的 `{页面名}.json` |

## 1. 取值优先级

```
声明字面量  <  defl/c_.json  <  $links / $mode 模组的 c_.json  <  存档 Pusc.json 的 c_  <  gg_v（上次）  <  &json=
```

- 比 goal-panify 多了两层：模组层（Compose4Cascade，s07 §4 同一顺序）和存档层。
- 「恢复默认」回到 `defl/c_.json` + 模组层，不回到字面量。
- `✎ 写为 js 默认` 改写 `defl/c_.json`（`tools/perf-collect.mjs` 的 `PUT /default`，路径换成这个文件）。

## 2. Worker 里的 `c_`

- slicer、模组 worker 收到 `onkwarg.kw`（s01 §2）后，用同一个 `gg.vars` 实现建自己的 `c_` 表。
- 面板改 worker 侧参数（生成器 knobs、渲染器 P）：main 的 Ref.set → 发 `{set:{路径: 值}}` 给对应 worker。worker 的 Ref 是 main 的镜像，不直接挂面板。
- `meta.fx` 路由：`fx: 'regen'` 表示改后重生成视野内区块（生成器 knobs），`fx: 'gl_wtf'` 表示 GL 重编译（goal-panify §3.3）。

## 3. DEF 表

- 有面板的 DEF 表（`BLOCK_DEFS ITEM_DEFS MOB_TYPES HURT FLUID BIOMES TOOL_TIERS …`）都成为 `defl/*.tsv`（s04 §6、s07 M-6）。
- 面板用 `pickLib`（可搜索 `<input list>`），编辑后按行写回 tsv。
- 路径写法：`blk.:sand.gravity`、`mob.zombie.ATK`、`p1.HP`，与 s07 的 `set` 共用。

## 4. 沿用 goal-panify、不改的部分

行类型（数值 / vec2 / bool / 单选按钮组 / `timeit` / `pickLib`）、区间 force 改写、`perf-collect` 投送、`tier 0–3`、多 root + taskbar、BroadcastChannel 跨窗口热改、预设动作项 `＋ / － / ⎘ / ✎`。

## 5. 常调参数（用户 11-08 指定）

「要容易在 UI 里调」的参数全部是 **tier 0**，放进 §6 的「⚡ 快调」root，渲染类再在「渲染」root 按 IDEA 光影关键分文件夹。

| 参数 | 路径（示意） | 行类型 | 所在 root |
|---|---|---|---|
| 时间 | `c_.Time.hour`（5…29，24 = 日出，IDEA） | 数值 + `tpause` 按钮组（暂停菜单 / 暂停生物 / 暂停模拟 / 锁 1 帧） | ⚡ |
| 天气 | `c_.Weather.state` | 按钮组 晴 / 雨 / 雷 | ⚡ |
| 航速 | `c_.Motion.flySpeed` | 数值，log 区间 | ⚡ |
| FOV / 视距 | `[c_.Cam.fov, c_.R.rd]` | vec2 `→FOV, 视距` | ⚡ |
| 渲染 scale | `c_.R.scale`（+ `maxMP` 在 tier 1） | 数值 | ⚡ |
| 阴影质量 | `c_.R.shadow` | 按钮组 关 / 软 / 软 + 锐（花草，[承] render.md） | ⚡ |
| sunDir 偏移 | `[c_.Sun.azOff, c_.Sun.elOff]` | vec2 `→方位, 仰角`（度） | ⚡ |
| 岸边 / 水体涌浪 | `[c_.Water.shoreSurge, c_.Water.rippleSurge]` | vec2 | ⚡ |

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

## 6. 屏幕布局（人体工学）

原则：**玩的时候不离开准星就能调常用的几个；要细调时才打开大面板；面板永远不挡画面中央。**

```
┌─────────────────────────────────────────────────────────────┐
│ F3 调试文字      [区间]          │            ⚡ 快调（` 键）│
│ + 相机 Gizmo     ← 弹在被改      │            时间 ▬▬●▬ ⏸   │
│                    root 的外侧   │            晴 雨 雷       │
│                                  │            …              │
│                                  │                  ┌──────┐ │
│                  （画面中央留空）  │                  │ 渲染  │ │
│                                  │                  │ 文件夹│ │
│                                  │                  └──────┘ │
│ ▣ ⚡ 渲 玩 F3  ← taskbar          [时间 ●][方位 ●]  ← 钉住条 │
│                         [ hotbar 1 2 3 … 9 ]                 │
└─────────────────────────────────────────────────────────────┘
```

| 位置 | 内容 | 打开方式 |
|---|---|---|
| 左上 | F3 调试文字（§7）+ 相机 Gizmo 一行 `x y z yaw pitch fov`（可复制 / 粘贴传送）+ 调试面板 | F3 |
| 右上 | **⚡ 快调**：§5 的 tier 0 参数，约 8 行，不超过屏高 40% | `` ` ``（Backquote）；F12 作宿主 B 兼容别名 |
| 右侧中段 | **渲染** root（原 rgl F4 面板，按 §5 文件夹） | Esc 暂停屏自动展开；平时从 taskbar 点 |
| 左侧中段 | **玩法** root（模式、cheat、Mob 表、方块表 `pickLib`、存档） | Esc 暂停屏自动展开 |
| 被改 root 的外侧 | 区间改写 root（goal-panify §3.4）：右侧 root 的往左弹，左侧的往右弹 | 右键数值行 |
| 底部 hotbar 上方 | **钉住条**：任意行右键「钉到底部」变成小滑块 chip；默认钉 时间、sunDir 方位 | 常驻；没有钉住项时隐藏 |
| 左下角 | taskbar：各 root 的小标签，点击显隐，可搜索并临时启用被禁用的 root | 常驻（半透明） |

### 6.1 不离开准星的调法

- **Alt + 滚轮**：调当前选中的钉住 chip（指针锁定时也有效）；**Alt + 1…4** 选 chip；chip 上方浮出数值，1.5 s 后淡出。
- 面板里：**悬停行 + 滚轮** = 一步，Shift ×10，Ctrl ×0.1；vec2 行悬停在左半 / 右半分别调 x / y。
- 右键任一行的菜单：区间改写 / 钉到底部 / ⎘ 复制为 `&json=` / 恢复默认。
- 打开 ⚡ 快调或渲染 root 时**不暂停游戏**（只释放指针）；Esc 暂停屏按 `tpause` 半透明，所以调渲染时能看到画面。
- 面板内键盘输入不传给游戏（rgl panel.js 现有逻辑），但 `` ` `` F3 F4 Esc 例外。

### 6.2 触屏

各 root 变成底部抽屉（一次只开一个），钉住条变成可横滑的一行；Alt + 滚轮换成在 chip 上左右拖。

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
- 上方加一行相机 Gizmo（goal-panify §5），F4 切到非第一人称时显示的是当前相机。

## 8. F4 相机

**F4 不再开关 rgl 面板**（那个面板并入 §6 的「渲染」root）。F4 轮转相机，Shift + F4 反向，长按 F4 回到第一人称：

| # | 相机 | 操作 | 用途 |
|---|---|---|---|
| 1 | 第一人称 | — | 默认 |
| 2 | 背后第三人称 | 滚轮调距离 | 看自己 / 看生物模型 |
| 3 | 正面第三人称 | 同上 | 看皮肤、手持物 |
| 4 | **环绕玩家** | 鼠标拖动旋转（松开后慢速自转）、滚轮距离；WASD 仍然控制玩家 | 调光影、截图、看建筑 |
| 5 | **minimap 俯视** | 正交、跟随玩家、北朝上；滚轮缩放 | 3D 版小地图，看地形走势 |
| 6–9 | **minimap 斜视 ×4**（东北 / 东南 / 西南 / 西北 45°） | 方向键 ← → 在四个方向间转 90°；滚轮缩放 | 等距视角看建筑、clawd 编辑（s08） |

- 5–9 由当前渲染器（rgl / lite）用正交相机画：距离雾与边界雾关掉，阴影保留；视距按正交范围自动取。它们和 M 键的 2D 地图（s03 §3）是两回事：M 键是羊皮纸平面图，这里是真 3D。
- URL：`&cam=orbit | top | iso-ne | iso-se | iso-sw | iso-nw`，与 `&gizmo=` 一起用即可一条链接到位截图（goal-panify §5）。
- 相机模式本身是 `c_.Cam.mode`（tier 0），也会出现在 ⚡ 快调里。
