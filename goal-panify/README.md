# goal-panify —— 面板化：`c_` 命名空间 · `gg.vars` 引用 · `gg.pane` 封装 · 性能投送 · Inspectable

> 目标：两个宿主 + v2 用**同一套**面板封装；参数是可枚举、可热重载、可被脚本 / agent / Biome 自动化写的引用；
> 面板自己负责预设、URL 注入、区间改写、折叠记忆、性能标注——这些现在要么只有 v2 有，要么没有。
> 与 `goal-glmod` 的接口：Pass DSL 的 `${…}` 既接受箭头函数也接受 `gg.vars` 的引用（§2），glmod §1.3 的 `params.js` 即本文 §1–§2。
> 现状速查见 `doc/lib.md`。

## 0. 原则

- 一行声明一个参数；面板 / uniform / 预设 / `&json=` / API / 性能采集全从同一个引用推导，不再手写五份。
- 不换 UI 库，Tweakpane 4 留着；封装只做「行类型 + 状态 + 多 root」，不做主题。
- 两个宿主的现有声明表（`menu.ESC/RT/DBG`、v2 `PANEL`）**语法兼容**地迁入，先不改内容，再按 §6 的 tier 剔微参数。
- 每一步可单独停下；面板行为用手测，数据路径（预设 / URL / API）用 `verify-renderer` 加断言。

## 1. `c_` 命名空间（替代 24 个孤立 `const c_X`）

```js
const c_ = window.c_ = gg.conf = _404({},gg.vars);                       // 一个全局字典Proxy，赋值自动封装
c_.Motion = { stepLen: 3.20, bobFreq: 1.6, … };  // 原 const c_Motion
```

- 代码里 `c_Motion.stepLen` → `c_.Motion.stepLen`（纯重命名，`sed` 级）。跨文件不再手挂 `gg.c_Touch`。
- **探测**：`Object.keys(c_)` 即全部可调表；agent / 面板可自动枚举。
- **热重载**：`c_.hot('Motion', {…})` = `Object.assign` + 触发该表的 `onChange`；配合 `&json={"c_":{"Motion":{"stepLen":2}}}` 深赋值（§3.2）。
- 行为单例 `gg.my(new class X)` 不动；`game-spec.md` §9 的「数据 + 单例」约定不变。

## 2. `gg.vars(obj)`：值 / 引用问题

```js
const o = gg.vars({ stepLen: 3.2, ao: { strength: 0.6, curve: 1.9 } });
o.stepLen            // 3.2            —— 游戏代码照常读写值
o.it.stepLen         // Ref            —— 面板 / Pass DSL / API 用引用
o.it.ao.strength     // 嵌套同样可用
```

`Ref = { get(), set(v), path: 'Motion.stepLen', owner, key, meta }`，`it` 是惰性 Proxy，返回同一路径的同一个 Ref（可做 Map 键）。

- `meta` 由面板声明时写入（label / range / tier / fx / timeit），所以**面板行就是 `[ref, opts]`**，不需要 `[key, () => target]`。
- Pass DSL：`uniform float ${c_.Fog.it.a1};` → 名字 `Fog_a1`（路径下划线化），每帧 `get()` 回填；仍兼容 `${_ => P.fogA1}`。
- `set()` 带副作用路由：`meta.fx` 对应 v2 的 `apply(key, fx)`（`def/rt/tex/dbg/leaf/sh`），宿主 B 的 `onChange` 同样挂在 `meta.fx` 上 → `HUD.syncs` 退役。
- 订阅：`ref.As(u=>u+1)` ，API 写入和面板写入走同一条，面板用它刷新自己。如果是 =>{} 语法且不含"return"就纯on监听

## 3. `gg.pane`：封装

### 3.1 声明语法（兼容两宿主 + v2）

```js
gg.pane(root, [                                   // root: 'esc' | 'rt' | 'lt' | '锚定位置' | 任意名
  ['性能', (u=c_.R.it)=>[ // 一般使用u为缩写
    [u.rd,    { label: '视距', ...R(2, 16, 1), tier: 0, fx: 'tex' }],
    [[u.aoStrength, u.aoCurve], { r: [R(0, 1), R(0.5, 3)], tier: 1 }],   // vec2：标签自动 '→AO, 曲线'
    [u.leafShadow, { options: { 精确: 0, 实心: 1, 无: 2 }, timeit: 'gl_wtf', fx: 'def' }],
    [c_.R.needPerf, {}] // bool值
    (f) => { … },                                 // 自定义行照旧
    ['子文件夹', [ … ]],
  ], { expanded: true }],
], { title: 'v2 DDA', drag: true, taskbar: true });
```

兼容层：`[key, () => target, opts, onChange]`（宿主 B）与 `[key, Pr, opts]`（v2）在构建时转成 `Ref`（`gg.vars.ref(target(), key)` 临时包装），迁移可分批。

### 3.2 状态管理（v2 已有的，上提为 `gg.pane` 特性）

| 特性 | 行为 |
|---|---|
| 「上次」自动保存 | `localStorage gg_v`：`{ 'Motion.stepLen': 2.1, … }` 按路径存，去抖 300 ms；只存与默认值不同的键 |
| 命名预设 | 下拉注入第一个文件夹末尾；`localStorage gg_presets`；动作项 `＋保存 / －删除 / ⎘ 复制为 &json= / ✎ 写为 js 默认` |
| `✎ 写为 js 默认` | 把当前 root 的**完整值**（不是 diff）`PUT` 到 `tools/perf-collect.mjs` 的 `/default?page=<页面名>`，服务器把它按 root 合并进**页面同名 JSON**（`index.html` → `index.json`，`VoxelCraft.html` → `VoxelCraft.json`），格式同 `&json=`（`{"c_":{…},"P":{…}}`），键排序、2 空格缩进，方便 git diff。**不改源码**：js 里的 `gg.vars({…})` / `P_DEFAULTS` 字面量只是兜底默认值。没起服务器时**静默失败**，面板不提示 |
| `{页面名}.json` 自动加载 | 启动时 `fetch('./<页面名>.json')`（404 / 解析失败静默）。取值优先级从低到高：声明字面量 < `{页面名}.json` < `gg_v`（上次）< `&json=`。「恢复默认」回到 `{页面名}.json` 这一层，不回到字面量。该文件进 git，就是项目的默认预设 |
| `⎘ 复制为 &json=` | 复制 `{"c_":{"Motion":{"stepLen":2}}}` 路径键值（深赋值格式），文件夹级预设也用它 |
| `&json=` / `#json=` | 深赋值：`{preset:'名'}` 先套预设；`{c_:{…}}` / `{P:{…}}` / `{D:{…}}` 按根；顶层键按 v2 旧习惯视为 `P` |
| 文件夹折叠记忆 | `localStorage gg_fold`：`{ 'v2/性能': 1 }` |
| 文件夹级预设 | 预设下拉下方再一个下拉，作用域 = **上次展开的文件夹**；存的也是 diff |
| 多 root | 每个 root 可拖拽（标题栏），位置持久化；**taskbar**（屏幕边缘一排小标签）控制各 root 可见性，持久化 `gg_roots` |

### 3.3 行类型

| 类型 | 规则 |
|---|---|
| 数值 | `R(min, max, step?, log?)`；**区间可 force 改写**（§3.4） |
| vec2 | 本质是两个 slider 拼一行（各自 -1…+1 归一化，和 v2 一致；宿主 B 的真区间 vec2 迁过来后行为一样）。标签由参数名拼：`'→AO, 曲线'`；**值文字用 DOM hack 显示在控件内**，不进标签 |
| bool | checkbox；`timeit` 非空时**悬停显示平均性能影响**（来自 §4 采集的聚合）|
| 单选 options | 选项 ≤ 3 且文件夹里是硬编码单选 → **堆成文件夹第一行的按钮组**；> 3 → 下拉 |
| `timeit: 'topic'` | 改动后自动投送一条到 `perf-collect`（§4）；`timeit: 'gl_wtf'` = 触发 GL 重编译的开关，改动时 canvas 加 CSS 呼吸灯变暗动画直到下一帧渲染完 |
| `pickLib` | 单选条目 → 编辑字段（BLOCK_DEFS / ITEM_DEFS / HURT…）；条目选择改成 `<input list>` + `datalist` **可搜索**；表可来自 csv |
| readonly / graph / multiline | 透传 Tweakpane |

### 3.4 区间 force 改写（最重要）

- 右键任一数值行 → 在该 root **左侧**弹一个专用 root「区间」：两行 `min ×0.5…1.5`、`max ×0.5…1.5`（相对当前区间），`应用` 后行重建，可反复；vec2 重复两组（x 行、y 行）。
- 改写存 `localStorage gg_range`：`{ 'Motion.stepLen': [min, max] }`，按路径遮盖声明里的 `R()`；值仍在 `gg_v`。清除 = 回到声明区间。
- `⎘ 复制为 &json=` 把被改写的区间一起带上（`{"_range":{…}}`），方便把试出来的区间回写声明。

## 4. 性能投送（`timeit` / `perf`）与状态的附加职责

- `tools/perf-collect.mjs`：本地 dev 服务器，`POST /t` 收 JSONL（`{t, topic, path, from, to, fps, gpu, scale, preset, pos, yaw, seed, build}`），`PUT /default?page=` 写 `{页面名}.json`（§3.2），`GET /agg` 返回按 `path` 聚合的影响表（面板悬停用）。无服务器时全部静默。
- 投送时机：`timeit` 行改动后，等 2 s 稳定，取前后各 1 s 的 fps / gpu 中位数差。`perf: true` 的 bool 另支持交错 A/B（每 2–3 s 翻转，只对 uniform 类；`gl_wtf` 类不翻）。
- **状态附加职责**：perf 服务器常驻项目目录，顺便承担「面板编辑 → 默认预设」的落盘：`PUT /default?page=` 收到某个 root 的完整值后，读 `{页面名}.json`、替换该 root 涉及的表（`c_.X` 一张表整体替换）、写回。只写这一个 JSON，**不解析也不改写任何 js / html**。`gg.pane` 不维护 diff，只把当前值整体交出去。投送记录仍带 `preset` 字段，仅供聚合归因。
- 短期只做投送 + 聚合表两件事；replay / 交错 A/B 见 `goal-glmod` §2 步骤 6。

## 5. Inspectable（DSL 之外，游戏侧要有的东西）

> ⚠ `&gizmo=`、`tpause`、F3 相机 Gizmo 已前移到 `goalP4P5` 第 1 步（先用宿主现有面板实现，不依赖 `gg.pane`）；本包第 7 步只负责把它们迁进 `gg.pane` 并补 `gm.pane`。

| 位置 | 内容 |
|---|---|
| 第一个文件夹（Esc 面板顶部） | `dview` 调试视图下拉；玩家速度；`t` 时间；`tpause` 单选按钮组：暂停菜单 / 暂停生物 / 暂停模拟 / 锁 1 帧 |
| F3 面板 | **相机 Gizmo**：`x y z yaw pitch fov` 六个数一行，可复制 / 粘贴（粘贴即传送）；其余信息顺序保持 `HUD.debugText()` 现状（perf · 位置 · 环境 · 世界 · 流体/目标） |
| URL | `&xyzb=档链接或种子&gizmo=x,y,z,yaw,pitch,fov`：进入即到位，`tpause` 全开 → agent 一条 URL 截图验证交接；`&pose=名` 是它的别名表（`c_.Bench.poses`） |
| `gm` | `gm.xyz` 等五件套不变；加 `gm.pane = { get(path), set(path, v), preset(name), json() }` 作单玩家脚本 / Biome 自动化的写入口（走 `Ref.set`，和面板同一路由） |

## 6. 剔微参数与排序（手工投入最大的部分，规则化）

- `tier`：0 玩家（.tp-fldv_b #464背景色） / 1 调优 / 2 仅 API（面板不显示）/ 3 冻结（不再读取）。默认视图只显示 tier 0；「高级」开关显示 1。
- 降级规则：手动改写
- taskbar有一栏就是单选条目，可搜索和临时启用被禁用的pane，刷新页面后恢复原状

## 7. 步骤

| # | 步骤 | 验收 |
|---|---|---|
| 1 | `c_` 命名空间 + `gg.vars`（Ref / `it` Proxy / `on` / `fx` 路由）；24 个 `c_X` 改名，不动面板 | 游戏行为不变；`Object.keys(c_)` 列全；`verify` 加「无孤立 `const c_`」静态检查 |
| 2 | `gg.pane` 核心：声明 + 兼容层；三个宿主 B root 与 v2 root 迁入；多 root 拖拽 + taskbar | 四个面板行为与现在一致（手测）；折叠记忆 |
| 3 | 状态：`{页面名}.json` 自动加载 / `gg_v` / 预设 / `&json=` / 文件夹级预设 / `⎘ 复制` / `✎ 写为 js 默认` | v2 旧 `vc.v2.*` 一次性迁移；四层优先级（字面量 < json < 上次 < URL）verify 断言；`&json=` 对 `c_` 与 `P` 都能深赋值（verify 断言）；bench `--set` 改走 `gm.pane.set` |
| 4 | 行类型：vec2 标签 / 值 hack、按钮组、可搜索 `pickLib`、`timeit` 呼吸灯 | 手测 |
| 5 | 区间 force 改写（§3.4） | 手测；`gg_range` 持久、`&json=` 带 `_range` |
| 6 | `perf-collect.mjs` + `timeit/perf` 投送 + 悬停影响 | 改一个 `perf` 开关后 `GET /agg` 有记录；无服务器静默 |
| 7 | Inspectable（§5）：首文件夹迁入 `gg.pane`、`gm.pane`（Gizmo / `&gizmo=` / `tpause` 已在 goalP4P5 第 1 步落地） | `node tools/bench-v2.mjs --url index.html --gizmo …` 能截图；`&xyzb=&gizmo=` 一条 URL 到位 |
| 8 | tier 标注 + 第一轮降级建议表；`doc/lib.md` 更新为新用法 | 默认视图 ≤ 8 行 / root |

1 → 2 → 3 有依赖；4、5、6、7 彼此独立，可按需要先后；8 最后。`goal-glmod` 的 Pass DSL 从第 1 步起就能吃 `Ref`。

## 8. 不做

- 换 UI 库 / 自绘控件；Tweakpane 插件生态以外的控件（区间改写用普通 slider 组合）。
- 面板脚本化驱动（动态项仍由人调，goalP4P5 §0-B）。
- 把 `BLOCK_DEFS` 等声明表本身改格式（只加可搜索编辑）。
