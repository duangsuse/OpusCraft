# s07 · 引擎与模组：玩法 API 化、UI 通信、模式

> 上游：IDEA L127「Worker 都必须响应 `{onkwarg:{seed:..}|{mode}}` 的初始化，以及 `key / onhit` 这类消息……具体如何划分接口以实现玩法解耦，请与我确认」；IDEA「三大件」（gpane 多 root、BroadcastChannel、`&r= &g=` Worker 不担心恶意插件删档）；s01 信封。

## 0. 已定 [11-08]

| # | 决定 |
|---|---|
| M-1 | **游戏本身是引擎，`$baseUrl/defl/` 只是一个默认模组**（照 Luanti）。存档的 `$mode`、`$slicer` 可以指向任意 Worker URL |
| M-2 | 模组 worker 能要求 main 做的事 = **`gm.pane` 路径写入**（`{set:{路径: 值}}`）+ 少量动词（`give / take / tp / time / weather / popup / spawn`）；不能写存档，不能批量删块 |
| M-3 | 事件**按订阅发送**：worker 在 `{ready:{meta}}` 里声明 `subs`，main 只发匹配的；未订阅的事件零开销 |
| M-4 | 需要返回值的钩子（`ontap` 返回空才走破坏、`ondie` 决定掉落、`on{…}`）**只在 main 的 JS 里运行**；worker 收到事后事件，下一 tick 再改 |
| M-5 | 不提供模式选择界面：**cheat 开关 + G 键轮转**，默认进入创造模式（§3） |
| M-6 | 所有 `c_Topic` 外提成一个 JSON；有面板的 DEF 表（`BLOCK_DEFS` 等）外提成 `$baseUrl` 下的 tsv（§1） |

## 1. 引擎 / 默认模组的划分

| 引擎提供（gode 本体） | 模组注册（`defl/` 或 `$mode` 指向的模组） |
|---|---|
| 物品栏、grid / 搜索 UI、合成台与熔炉的**界面和格子逻辑** | 创造模式物品栏的内容与分页、生存模式合成配方、熔炼表、燃料表 |
| Mob 的 `ATK / HP / SPD` 等属性**机制**（含 `_buf` 临时覆盖，s05 §1.1） | Mob 集合（有哪些、各自数值、掉落、生成规则） |
| 方块能力字段的**机制**（s04 §5） | 方块表本身（`blk.tsv`） |
| 玩家状态（HP、饥饿、湿度、速度、飞行）的机制 | 伤害规则（`HURT`）、模式表 |
| 渲染器、生成器的**加载**（`?r= / ?g=`） | 默认渲染器、默认生成器（`defl/r/*`、`defl/g/*`） |
| 存档读写（io worker）、面板 `gg.pane`、消息总线 | `c_.json` 默认值、i18n |

`defl/` 的文件布局：

```
defl/
  mode.js          默认模组 worker（$mode 的默认值）
  c_.json          全部 c_Topic 的默认值，一个文件（取代 goal-panify §3.2 的 {页面名}.json）
  blk.tsv  item.tsv  mob.tsv  recipe.tsv  smelt.tsv  hurt.tsv  …   （宿主 B 里有面板的 DEF 表各一张）
  g/mini.js g/gp.js g/liq.js g/old.js g/v7.js g/valleys.js      生成器（s02）
  r/gl.js  r/lite.js             渲染器（s03）
```

## 2. 模组 worker 协议（在 s01 信封上）

```js
// main → worker
{ onkwarg: { seed, mode: { key, flags }, cheat, kw } }
{ key: 'G' }  { onhit: { zombie: meta } }  { ondie: … }  { tick: n }      // 只发订阅了的（M-3）
// worker → main
{ ready: { meta: { id, subs: ['key:G E Space', 'onhit:zombie', 'ondie', 'tick:20'] } } }
{ set: { '$Motion.speed': 2, 'mob.zombie.ATK_buf': 0 } }                 // M-2
{ give: [':bow', ':arrow*16'] }  { tp: '@home' }  { time: 6 }  { weather: 'rain' }
{ spawn: ['zombie', '@x,z^y'] }  { popup: { url, w, h } }
```

- **[改 11-09，s16 K-11]** 模组 worker 与 main 里的游戏模块同写法：一段脚本，`gg / gm / c_` 是注入的形参（worker 里的 `gm` 是消息代理）。订阅写 `gm.on({ key(k) {…}, onhit(h) {…} })`，不再 `export function`；`ready.meta.subs` 由 `gm.on` 的键自动生成，不手写；向 main 发请求就是调 `gm.<命名空间>.<动词>()`（经 M-2 白名单，运行时转成下面的 `{set / give / tp …}` 消息）。信封和消息本身不变；`onkwarg` 里的 `seed / mode / cheat` 变成 `gm.game` 的只读成员，`kw` 写进模组自己的 `c_` 主题。
- 旧写法（`import '…/w/mod.js'` + `export function onkwarg / key / onhit`，s02 §2 / G-8）只留给生成器和渲染器 Worker。
- `set` 的路径就是 `gm.pane.set` 的路径（goal-panify §5），面板写入、API 写入、模组写入走同一条 `Ref.set` 路由，面板自己会刷新。
- 可写范围由面板 `tier` 决定：tier ≤ 2 可写，tier 3（冻结）不可写。

## 3. 模式与 cheat [定 11-08]

- 模式仍是 game-spec §1 的**一组布尔开关**（`MODES`），G 键在其中轮转。
- **默认进入创造模式，cheat 开**。
- **cheat 关闭的条件**：生成 P1 时在脚下垫一块**红羊毛**。如果游戏内 1 天之内玩家挖掉了它，并且当时不是创造模式 → cheat 关闭。（玩家用「挖掉起点标记」表明想认真玩生存。）
- cheat 关闭之后：G 键失效，只能在暂停屏幕切换模式，并且会弹框确认。
- 红羊毛事件本身也是一个可订阅事件（`cheat`），模组可以据此发欢迎提示等。

## 4. 模组注册 [定 11-08：tsv + reg 补丁]

- 模组目录里放与 `defl/` **同名**的 tsv（`recipe.tsv item.tsv blk.tsv …`），main 先当纯数据加载，不执行代码。
- worker 可以在运行时用 `{reg: { recipe: [...], creative: { tab: [...] } }}` 打补丁（例如按进度解锁配方）。
- 加载顺序 `defl → $links → $mode`，**后加载的覆盖先加载的**（Compose4Cascade）。

## 5. iframe UI [定 11-08]

| 挂载点 | 打开方式 | 输入 | 用途 |
|---|---|---|---|
| 弹框（暂停屏层） | `{popup: {url, w, h}}` | 独占；游戏照 `tpause` 半透明暂停 | 对话、商店、任务书 |
| HUD 叠层 | `{hud: {url, rect}}` | 默认穿透（`pointer-events: none`），iframe 可申请临时接收输入 | 计分板、提示、bossbar |
| 方块绑定 | 方块表字段 `ui: 'url'`，右键打开 | 独占；与引擎容器格子（物品栏 grid）同一布局，引擎负责格子拖放 | 模组工作台、类熔炉机器 |

- 面板 root 形式不做（11-08 未选）：持久工具仍用 `gg.pane` 原生行。
- **通信**：iframe 通过 `postMessage` / `BroadcastChannel` 发与模组 worker **相同的动词、相同的白名单**（§2），也能按 `subs` 订阅事件。引擎提供约 1 KB 的 `gode-ui.js`，封装 `gm.pane.get/set`、`give`、订阅。
- **隔离**：`sandbox="allow-scripts"`，不给 same-origin，读不到 OPFS。
- 方块绑定 UI 打开时，引擎额外发 `{open: {P: '@x,z^y', slots: […]}}`，关闭时回收；格子内容的权威在引擎。

## 6. cheat 与模组权限 [定 11-08]

cheat 只约束**玩家**（G 键、gm 值物品等作弊行为）。模组是游戏规则本身，cheat 关闭后权限不变，否则生存模组无法调难度。
