# 项目工具库速查（页面内 `gg` 库 · 面板 DSL · URL 参数 · `tools/*.mjs`）

> 真值在代码；本文只聚合**用法**，行号以当前版本为准（漂移时 `rg` 定位）。
> 现状中的分叉（两套面板 DSL、`c_*` 散落、vec2 两种语义）统一方案见 `../goal-panify/README.md`；渲染管线 / Pass DSL 见 `../goal-glmod/README.md`。

## 1. 页面内 `gg` 库（`index.html` L347–356；`gls.js / gen.js / mobsim.js / res_vam.js / bwebp.js` 共享 `window.gg`）

| 名字 | 用法 | 说明 |
|---|---|---|
| `gg.THREE / Pane / JSZip / idb` | importmap 的四个依赖（three 0.170、tweakpane 4.0.5、jszip 3.10、idb-keyval 6.2） | 其他 deferred 文件不 import，从 `gg` 取 |
| `gg.my(x)` | `const X = gg.my(new class X { … })` | 单例注册为 `gg.X` 并返回；类名即全局名。15 处 |
| `gg.ev(target, { type(e){…}, … }, opts)` | `gg.ev($0, { click() {…}, keydown(e) {…} })` | 批量 `addEventListener`，handler 的 `this` = target，返回 target。31 处 |
| `gg.err(msg)` | 页面顶部 ⚠ 消息（`c_Err`：15 s、最多 8 条） | 由 1scr 脚本预设，`error / unhandledrejection` 自动走它 |
| `CSS.fx(op)` | `CSS.fx(() => dom 更新)` | View Transition 包一层；Firefox 同形 stub |
| `gg.menu` | 面板声明表 `{ ESC, RT, DBG }`（§2） | |
| `gg.c_Touch / gg.c_MobSkin` | 跨文件要读的 `c_*` 手工挂到 `gg` | 其余 `c_*` 是文件内 `const`（→ panify 统一成 `c_.X`） |

**`c_*` 约定**（`doc/mat/game-spec.md` §9）：`c_X = {…}` 纯数据可调常量，`gg.my(new class X)` 放行为；面板只绑 `c_X`。现有 ~24 张：`c_SCHED c_XRay c_Fluid c_Motion c_LiquidFx c_Build c_BBat c_gm c_Dbg c_Save c_Title c_1scr c_Particles c_Saver c_Touch c_HelpKeys c_MobAI c_Flow c_BW c_MobSkin c_Audio c_Err …`。

**`gm` 五件套**（`index.html` L2504）：`gm.time / xyz / mob / bbat = { item, get, set, label, short, peek? }`；`gm.make(k) / use(stack) / kindOf(name) / cells()`。任何「可拿在手里的世界状态」照这个形状加；未来单玩家脚本 API（含面板写访问）挂在这里。

## 2. 面板 DSL · 宿主 B（`index.html` L3160–3320，`buildPane(pane, decl)`）

```
decl  = [ [title, rows, expanded?], … ]                 // 嵌套：rows 里再放 [title, rows]
row   = [key, () => target, tpOpts, onChange?]          // 绑 target()[key]
      | (folder) => void                                // 自定义行（toggle / pickLib / XRay 组）
```

| 组合子 | 形态 | 说明 |
|---|---|---|
| `R(min, max, step?)` | `{min,max,step}` | 真区间 |
| `V2(label, rx, ry)` | `{label, x: rx, y: ry}` | 给 vec2 / 原生 `{x,y}` 对象用 |
| `vec2(o, a, b)` | `() => ({ v: {x↔o[a], y↔o[b]} })` | 两个字段拼一个 2D 控件（**真区间**） |
| `rgbArr(arr)` | 颜色 → `[r,g,b]` 数组 | `color: {type:'float'}` |
| `toggle(o, k, title)` | 无标签布尔按钮 | F3 面板隐藏标签；注册到 `HUD.syncs` |
| `pickLib(title, pick, fields, onChange)` | 单选条目 → 行内编辑其字段 | `pick = { obj, key, options(), row(v), onSelect? }`，返回 `{sync}` |
| `lib(title, table, key, fields, onChange)` | 数组 / 字典表的 `pickLib` 快捷 | `HURT FLUID BIOMES TOOL_TIERS MOB_SKIN BLOCK_DEFS(手持)` |

三个 root：`#menu-pane`（Esc，`menu.ESC`）、`#rt-pane`（右上 F12，`menu.RT`）、`#dbg-pane`（F3，`menu.DBG`，隐藏标签列）。外部状态变化靠 `HUD.syncs[]` 手动刷新。无预设、无 URL 注入、无区间改写。

## 3. 面板 DSL · v2（`v2.js` L7–60，`buildPane(pane, spec, apply, resetDefaults)`）

```
spec  = [ [title, rows], … ]                            // 不嵌套；'性能' 默认展开
row   = [key, Pr|Dr|S, { label, ...R(), fx?, options?, bool? }]
      | ['v', vec2(Pr, kx, ky), V2(label, rx, ry, fx?)]
      | ['preset', null, PRESET_ROW] | [_, _, { button, fn }]
```

| 项 | 说明 |
|---|---|
| `R(min, max, step=0.01, log=false)` | 支持对数区间 |
| `vec2(get, kx, ky)` + `toN/fromN` | 两个字段**各自归一化到 -1…+1** 拼 2D 控件（与宿主 B 的 vec2 语义不同）；标签后缀显示实际值 |
| 三桶 | `Pr=()=>P`（持久化参数）、`Dr=()=>D`（调试，不持久化：`view raw time cloudX ref`）、`S=()=>ctx.settings`（宿主设置 `rd`） |
| `fx` 路由 | `apply(key, fx)`：`def/leaf` → `syncDefines()` 重编译；`rt` → `ensureRT()`；`tex` → 同步宿主视距；`dbg` → `setDebug`；`sh`；其余只存盘（300 ms 去抖） |
| 预设 | 内置 `@default @vol @mc @bliss`（`CLOUD_PRESETS × WATER_PRESETS`）+ 命名预设 `localStorage vc.v2.presets`；「上次」`vc.v2.params`（`P_VER=3`）；下拉含「＋保存 / －删除」动作项，注入在第一个文件夹末尾 |
| URL | `&json=` / `#json=`：`{…P 键}` 或 `{P:{…}, D:{…}, preset:'名'}` 深赋值（`assignTyped` 只认 `P_DEFAULTS` 里同类型键） |
| 导出 | `VR = createRenderer()` 返回 `P P_DEFAULTS panelSpec apply setDebug setRef presets perf post comp D …`；bench `--set k=v` 走 `apply` 同一路由 |

## 4. URL 参数

| 参数 | 页面 | 说明 |
|---|---|---|
| `?r=v1\|v2\|bogus` | VoxelCraft | 渲染器选择（宿主 B 接入后 `index.html?r=v2`） |
| `?seed=N` | VoxelCraft | 一次性世界，不读不存 |
| `&json=…` | v2 | 面板参数深赋值（§3） |
| `&xyzb=url` | index | bwebp 存档导入（覆盖其 seed 的槽位） |
| `?tex=url` | index | 资源包 |
| `?family= &display=` | index | 字体 |
| `&pose=名` / `&gizmo=x,y,z,yaw,pitch,fov` / `&tpause=` | 两宿主 | **计划**（goalP4P5 第 1 步）：机位 + 暂停 → agent 截图交接 |
| `{页面名}.json` | 两宿主 | **计划**（panify §3.2）：启动自动加载的默认预设；优先级 字面量 < json < 上次 < `&json=` |

## 5. `tools/*.mjs`（Node + 无头 Chromium，`tools/cdp.mjs` 零依赖；需 `http://localhost:8765/`；详见 `handover/tools.md`）

| 命令 | 用途 |
|---|---|
| `node tools/verify-renderer.mjs [base]` | v1 / v2 / bogus 三组接口与不变量验证 + v2.js 静态检查。**每次改动后** |
| `node tools/bench-v2.mjs --views … --cmp NAME` / `--save NAME` / `--ref` / `--set k=v` / `--preset` / `--probe x,y` / `--url` | 固定机位 GPU 计时 + 计数 + 逐像素回归（`tools/out/ref/`） |
| `node tools/shader-stats.mjs [url]` | `INTEL_DEBUG=fs`：SIMD 宽度 / 指令 / spill。**改着色器结构前后** |
| `node tools/df-seeds.mjs a b [gpu\|ss] [yaws]` | 随机种子 × 朝向，参考模式 DF 开/关 0 px |
| `node tools/refdiff.mjs A B view [n]` | 两组基准差异像素列表 |
| `node tools/upload-cost.mjs [url]` | 区块上传主线程成本 |
| `tools/shots-sky.mjs`、`tools/diag-water.mjs` | 截图诊断（历史） |
| `tools/asm.mjs split.mjs extract.mjs tl.mjs` | **一次性**拆分脚本（acorn / eslint-scope，依赖在 `/tmp`），不维护 |
| `node tools/snap.mjs [goalDir] [--check]` | 任务包 `doc/` 快照 ← 真值（清单 `goalX/doc/SNAP`）；`--check` 只报漂移 |
| `tools/perf-collect.mjs` | **计划**（panify §4）：接收面板 `timeit` 投送的 JSONL；`PUT /default?page=` 写 `{页面名}.json` |

## 6. 现状分叉（panify 要统一的）

1. 两套 `buildPane`（宿主 B 的 `[key, target(), opts, onChange]` vs v2 的 `[key, bucket, {…fx}]`），两种 `vec2` 语义，`R/V2` 各一份。
2. 预设 / `&json=` / `apply` 路由只有 v2 有；宿主 B 靠 `HUD.syncs` 手刷。
3. `c_*` 是 24 个孤立 `const`，跨文件要手挂 `gg`，不可枚举、不可热重载。
4. 面板绑的是「值」（`target()[key]`），GLSL uniform 回填是另一套手写——值 / 引用没有统一形态。
