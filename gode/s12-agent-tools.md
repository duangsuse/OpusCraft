# s12 · Agent 开发工具：自主 loop、视觉验证、实时体素

> 上游：`handover/tools.md`（cdp + VR 调试入口 + 机位表）；`techstack/shoot.js`（CDP 与代码风格）；`tools/cdp.mjs`（`prime-run` 启动参数）；s06 §5 文本体素 `XZ1\n`；s09 §8 F4 相机与 `&cam=`。
> 目标：Agent 改一处 → **3 s 内**看到图、拿到断言结果 → 再改。性能 / 逐像素回归只做轻量、低频。
> **不移植旧 tools 代码**，只导入机位数据；新工具全部写在 `gode/tools/`。

## 0. 已踩的坑 → 对策

| 坑 | 原因 | 对策 |
|---|---|---|
| 测完后台浏览器不退、占资源 | 每个脚本自起自关，被 timeout / Ctrl-C 杀掉时 renderer、gpu 子进程成孤儿 | **一个常驻守护进程独占唯一浏览器**（T-1）；浏览器 `detached` 自成进程组，退出时杀整组；空闲 10 min 自退；每次 `up` 先 `sweepStale`（shoot.js 的 owner 文件 + `/proc` cmdline 匹配，只杀 `gode-gd-` profile 的进程，不碰用户浏览器） |
| 单次测试 > 30 s | 每次冷启动浏览器 + 重新生成世界 + 等区块 | 守护进程保持页面热；同种子同 rd 时**不 reload**，只 `pose` + `settle`；改了 js 才 reload（T-1 `reload` 自动判定） |
| 用户没有文件夹实时看截屏 | 截图散在 `tools/out/*` | **固定的实时目录 + 自刷新画廊页**（T-2） |
| 无头 SwiftShader 慢、画面与真机不同 | — | 视觉 / 正确性默认 `prime-run chromium --ozone-platform=x11`（独显、有头窗口但可最小化）；`--ss` 才用 SwiftShader |

## 1. 工具清单

全部为单文件、零依赖、Node / Bun 都能跑，结构照 `shoot.js`：文件头注释即 `--help`，`//// Lib` 段不引用 `//// App` 段，CDP 用 `Cdp` 类 + `rpc` Proxy（`page.Runtime.evaluate(...)`）。

| # | 工具 | 做什么 |
|---|---|---|
| T-1 | `gode/tools/gd.js` | 守护进程 + CLI，Agent 唯一入口（§2） |
| T-2 | `gode/shots/`（目录）+ `gode/shots/index.html` | 实时截图与画廊（§3） |
| T-3 | `gm.test`（写在 `gode/index.html` 里，不是 tools） | 页面侧的确定性测试钩子：冻结、settle、机位、体素追加、断言（§4） |
| T-4 | `defl/c_.json` 的 `c_.Bench.poses` | 机位表，从 `tools/bench-b-poses.json` 与 `handover/tools.md` §3 导入（§5） |
| T-5 | `gode/tools/sheet` 子命令（在 gd.js 内） | 多机位拼一张联系表，Agent 一次 Read 看全（§3.2） |
| T-6 | `gode/tools/checks.tsv` | 正确性检查清单，`gd check` 逐行跑（§6） |
| T-7 | `gode/viz/`（pgviz，s13） | 地形查看与调参；`gd go 'gode/viz/?…'` + `gd set c_.Gen.*` + `viz.stats()` 闭环 |

## 2. `gd.js`：守护进程 + CLI

```
gd up [--ss] [--seed N] [--rd N] [--size 1280x720]   起浏览器 + 打开 gode/index.html（已在跑则复用）
gd down                                              关浏览器、杀进程组、删 profile
gd ps                                                列出守护进程、浏览器 pid、空闲时长、当前 URL
gd go '<query>'                                      改 URL 参数（&g= &r= &cam= &json=）；参数与当前相同则跳过
gd reload                                            强制整页重载（引擎核心 js 有改动时 shot 前自动做；defl/ 的改动走热更新，s16 §13.5）
gd pose plain|@x,z^y,yaw,pitch[,fov]|iso-ne          摆机位（c_.Bench.poses 名字、坐标，或 iso-ne 这类框景名）
gd shot [pose…] [--tag T] [--sheet]                  settle → 截图 → 写 gode/shots/；打印文件路径
gd xz <file.xz|-> [--at @x,z^y] [--frame] [--shot]   追加文本体素（s06 §5），--frame 自动用 iso 相机框住 bbox
gd mark / gd revert                                  世界改动打点 / 回滚到打点（试错不累积）
gd set c_.Path=v …                                   走 gm.pane.set（与 &json= 同路由）；也收标记语言写法 '$Path=v'（shell 里 $ 要加引号）
gd mods [list | on <id> | off <id> | reload <id> | graph]   [新 11-09，s16 §13.5] 模块：状态、启停、热替换、依赖图（走 gg.mods）
gd eval '<js>'                                       页面里执行，按值返回
gd check [name…] [--matrix mini,gp,liq|all]           跑 checks.tsv（§6）；--matrix = pgviz 检查在每个生成器下各跑一遍；check mods = 登记处观察 ⊆ 规格、热替换不泄漏、语法错回滚、表就地 diff（s16 §13.5）
gd perf [--frames 120]                               低频：帧时间中位数 + 渲染器 stats()，不进默认 loop
gd log [-f]                                          页面 console / 异常（自上次调用以来）
```

- **进程模型**：`gd up` fork 出守护进程，守护进程 spawn 浏览器（`detached`，进程组 = 浏览器 pid），在 `/tmp/gode-gd/sock` 上开 HTTP（unix socket，只给 CLI 用，不是静态服务），CLI 每条命令是一个请求。守护进程写 `/tmp/gode-gd/state.json`（pid、浏览器 pgid、CDP 端口、profile、URL、最后活动时间）。
- **不留尸体**：① 空闲 10 min（`GD_IDLE`）自动 `down`；② 浏览器意外退出 → 守护进程也退；③ 守护进程收 SIGTERM / SIGINT / 未捕获异常都先 `process.kill(-pgid)` 再删 profile；④ `up` 前 `sweepStale`；⑤ `gd ps` 让 Agent 能看见在跑什么。
- **快**：页面常驻；`shot` 只做 `pose → settle → capture`，目标热路径 < 2 s；冷 `up` < 6 s。每条命令打印耗时，超过 `GD_SLOW`（默认 8 s）时打出卡在哪一步（settle 的 pending 数）。
- **默认启动**：`prime-run chromium --ozone-platform=x11 --use-angle=gl --enable-gpu --ignore-gpu-blocklist`，有头窗口放在屏幕外角落（`--window-position`）；视口用 `Emulation.setDeviceMetricsOverride` 钉死尺寸，与窗口大小无关。
- **静态服务**：用户的 `http-server -p 8765 -c 1` 常驻在仓库根目录，`localhost:8765/gode/` 总是可用；gd **不自带服务器**，`up` 时探一下 `:8765`，不通就报错并提示启动命令（`GD_BASE` 可改）。**[改 11-09，s16 §13.4 / K-14]** 服务器换成 `gode/tools/dev.js`（同端口、同 `-c 1` 语义，另加文件变更推送、写回、目录清单、perf-collect）；`up` 发现端口不通时改为自己拉起它（仍是用户可以常驻的同一个进程，不是 gd 的子进程：gd down 不杀它）。**dev.js 已写（`gode/tools/dev.js`，测试 `gode/tools/test-dev.mjs`），`gd up` 已接 [11-09]**：先探 `GD_BASE`——① 是 dev.js（`/__dev/info` 回 `gode-dev`）→ 直接用；② 是别的静态服务（http-server 等）→ 照用，提示一句「没有热更新 / 写回」；③ 不通且 `GD_BASE` 指向本机（localhost / 127.0.0.1 / [::1]）→ 拉起 dev.js（`-p` 取 `GD_BASE` 的端口）；④ 不通且不是本机 → 报错，不代起。拉起的 dev.js 是**独立进程**（detached，日志 `/tmp/gode-gd/dev.log`），不是 gd 的子进程：`gd down` 不会停它，`gd ps` 的 `dev` 行有它的 pid，要停就 `kill <pid>`。拉起失败（端口被不服务 `gode/` 的东西占了）→ 打印 dev.log 末尾并退出 1，不起守护进程。
- **输出全部是一行一个结果的 tsv / 文本**，便于 Agent 读；失败时退出码非 0 并打印 `gd log` 的最后 20 行。

## 3. 实时截图目录

### 3.1 布局

```
gode/shots/                    （gitignore）
  index.html                   画廊：轮询 index.tsv（1 s），最新在上，点开看大图；同 tag 的前后两张可左右滑对比
  latest.webp                  永远是最新一张（用户可以直接在看图软件里开着它）
  index.tsv                    seq ts tag pose url files note verdict
  YYMMDD/NNNN-<tag>-<pose>.webp
  YYMMDD/NNNN-<tag>.sheet.webp 联系表
```

- 用户打开 `http://localhost:8765/gode/shots/` 就能实时看到 Agent 的每一张图；也可以直接用文件管理器看 `gode/shots/latest.webp`。
- `index.tsv` 列沿用 shoot.js 的写法（按表头名读，列可增）；`note` 是 Agent 自己写的一句话（「加了云影」），`verdict` 是 §6 的检查结果。
- webp q82，与 shoot.js 一致；超过 500 张或 7 天的自动删到只剩每个 tag 最后 20 张。

### 3.2 联系表（T-5）

`gd shot plain canopy water uw --sheet`：在**同一个页面里**用离屏 canvas 把多张截图拼成一张带标签的网格（每格标 pose、`c_` 改动、耗时），只存一张 webp。Agent 一次 Read 看完 4–6 个机位，比读 6 张图省上下文。可选 `--vs <seq>`：每格左右并排「上一张 / 这一张」。

### 3.3 轻量像素差（可选）

`--vs <seq>` 时顺带算一个**粗**差异：缩到 1/8 后逐像素 ΔE > 阈值的比例，标在格子角上（如 `Δ3.2%`）。只做提示，不做 bench 那种逐像素回归。

## 4. `gm.test`：页面侧测试钩子（T-3）

写在 `gode/index.html` 里，M1 第 1 步起就有；只有 `&test=1` 时挂到 `window`。

```js
gm.test = {
  freeze({ hour = 10, wave = 10, cloud = 0, mobs = false }),  // 冻结时间 / 水波 / 云偏移，清 mob 与掉落物（handover/tools.md §3「冻结」「清场」）
  settle({ ms = 15000 }),       // Promise：区块 pending 0、slicer 队列空、网格上传完、riseFade 结束；超时 reject 并带 pending 计数
  pose(p),                      // 名字 | {x,y,z,yaw,pitch,fov} | '@x,z^y,yaw,pitch' | 'iso-ne' 等框景名（gd 自己的，不是游戏相机）
  xz(text, { at }),             // 解析并放置 XZ1 文本（s06 §5）→ { bbox, placed, hash }
  frame(bbox, cam = 'iso-ne'),  // 用透视相机从 iso 方向斜上框住 bbox（框景是 gd 的事；游戏 F4 只有 fp / orbit / back，s09 §8）
  mark(), revert(),             // 记录 / 撤回自 mark 以来的全部改块（走正常 setBlock 路径，光照、网格一起回滚）
  hash(bbox),                   // 区域体素哈希（u16 + states），正确性断言不靠像素
  read(bbox),                   // 区域 → XZ1 文本（识别器输出，s06 §5）；用于「写进去再读出来」比对
  probe(x, y, z),               // { blk, meta, sky, blk light, states }
  stats(),                      // 渲染器 stats() + chunks / XZP / X2V 计数（F3 同源，s09 §7）
  errors(),                     // 自上次调用以来的 console.error / 未捕获异常 / GL 错误
};
```

**Agent 实时追加体素的标准循环**（s06 §5 的用法）：

```
gd mark
gd xz house.xz --at @12,40^64 --frame --shot      # 放 → 框住 → 截图（实时目录里出现）
gd eval 'gm.test.read(LAST.bbox)' > back.xz        # 读回
diff house.xz back.xz                              # 识别器输出应与输入等价（逐格相等时允许 op 不同，比 hash）
gd revert                                          # 回到干净世界，下一轮
```

- M0 只有放置 + `hash`（读回比对用 `hash(bbox)` 对比「同一文本放两次」）；`read` 识别器到 M4-2 才有（s10）。
- `xz` 从 stdin 读（`gd xz -`），Agent 可以直接 heredoc 写几行就放；多次 `xz` 追加在同一 mark 之后，直到 `revert`。
- 放置走正常改块路径（s04 / s01 §4 增量光照），所以同时也在测光照与重网格；`--shot` 前自动 `settle`。

## 5. 机位表导入（T-4）

- `tools/bench-b-poses.json`（seed 20240607：`plain canopy cave water uw`，宿主 B 坐标）→ `defl/c_.json` 的 `c_.Bench.poses['20240607@mini']`。键带生成器名，因为同一种子在 `gp / liq` 下地形不同；`liq` 的 y 要 +64（s02 §4）。
- 没有对应条目时，`gd shot` 按 handover/tools.md §3 的规则搜索一次（「±6 起伏最小」「树叶最密」……），写回 `c_.Bench.poses`（走 `✎ 写为 js 默认`，s09 §1）。
- 新增**视觉目标机位**，与 `reference-vision/` 一一对应：`trees`（tree-and-shadow）、`clouds`、`sunset`、`caustic`、`uwrefl`、`ice`、`mobs`、`map`。`gd shot --ref` 把这些机位的截图与参考图拼成左右对照的联系表，供 Agent / 用户主观判断。
- 冻结参数沿用 handover/tools.md §3：白天、水波时间 10、云偏移 0、清 mob；**机位按固定顺序访问**（访问顺序会影响已加载区块）。

## 6. 正确性检查（T-6）

`gode/tools/checks.tsv`，一行一条，`gd check` 逐行在热页面里跑，结果写到 `index.tsv` 的 `verdict` 列：

| name | 做什么 | 通过条件 |
|---|---|---|
| `errors` | 加载 + settle 后 `gm.test.errors()` | 空 |
| `genhash` | 内圈 5×5 列 `hash`，同种子 reload 再算一次 | 相等（s10 M1-3） |
| `seam` | 区块边界挖 3×3 洞、放火把，`probe` 两侧光照 | 两侧连续（s10 M1-8） |
| `xz-roundtrip` | `tools/xz/*.xz` 逐个 `xz → read → hash` | hash 相等（s06 §5「逐格相等」） |
| `outside` | 跨块树冠所在列的 `hash` 与单块生成 + 挂起合并结果比较 | 相等（s02 §3） |
| `viz-seam` | pgviz：两种到达顺序下生成器输出与合并结果逐位相等、跨块写入无丢失、块边界地表连续（s13 §11；M1 的 `outside` 检查可沿用同一套判定） | 见 s13 §11 |
| `r-switch` | `?r=gl → lite → gl` 热切换后 `stats()` 与 `errors()` | 无报错、draw calls 恢复 |
| `cam` | F4 九个相机各截一张进联系表 | 无报错（画面人看） |

- 每条检查 < 3 s；全量 < 30 s。`gd check` 默认只跑与最近改动文件相关的几条（按 `checks.tsv` 的 `files` 列匹配 `git diff --name-only`）。
- 性能（`gd perf`）不在默认 check 里，**低频**：里程碑步骤结束时跑一次，记一行 tsv。

## 7. 一次典型的 Agent loop

```
gd up                                   # 一次（已在跑则秒回）
loop:
  改代码
  gd check                              # 相关检查，< 10 s
  gd shot trees clouds --sheet --vs -1  # 联系表 + 上一张对比，Read 一张图判断
  （需要体素实验）gd mark; gd xz - <<EOF … EOF; gd shot --frame; gd revert
gd down                                 # 收尾（忘了也会 10 min 自退）
```

## 8. 已定 [11-09]

| # | 决定 |
|---|---|
| A-1 | `gd` 用**守护进程**（unix socket HTTP），不做每条命令直连 CDP |
| A-2 | 用户看图：`gode/shots/` 画廊页 + `latest.webp`；不挂进游戏 taskbar |
| A-3 | XZ1 **解析与放置提前到 M0**；识别器（`read`）留在 M4 |
| A-4 | M0 先对**宿主 B**（`index.html`）跑通工具链，`gm.test` 先做宿主 B 的等价垫片；gode/index.html 起来后换成 gode 版，同机位数字可对照 |
| A-5 | 宿主 B 垫片的挂法：`index.html` 读 `&test=1` 时 `import('./gode/tools/gmtest-b.js')`（宿主 B 唯一的改动）；gd 打开宿主 B 时自动带 `&test=1` [11-09] |

## 9. 实现状态 [11-09，M0-1…5]

| 文件 | 内容 |
|---|---|
| `tools/gd.js` | 守护进程 + CLI，§2 全部命令；`node gode/tools/gd.js help` 即 `--help` |
| `tools/gmtest-b.js` | 宿主 B 的 `gm.test`（A-5）：`freeze settle pose frame xz mark revert hash probe stats errors set find` + `checks.*` |
| `tools/gmtest-g.js` | **gode 版**（M1 首刀 11-09）：`host: 'gode'`，同名同参；`boot.js` 启动后自动 import，无需 `&test=1`。没有 mob / tick，`freeze` 只钉时钟与 rgl 相位并冻结控制器；`find` 搜索规则未做（返回 null）；`checks.genhash / phys`（checks.tsv 里 `genhash-g`、`phys`） |
| `tools/xz.js` | XZ1 解析 + 光栅化（页面与 node 共用） |
| `tools/xz/*.xz` | `xz-roundtrip` 的样例 |
| `tools/checks.tsv` | 列 `name host files js note`；`host` = `b / viz / gode`，只跑适用于当前页面的行 |
| `shots/index.html` | 画廊（← → 同 tag 翻页、V 并排上一张） |
| `defl/c_.json` | `c_.Bench.poses['20240607@mini']`（导入）+ `c_.Bench.ref`（视觉目标 ↔ 参考图） |

实测（宿主 B，RTX，1280×720）：冷 `up` 7–8 s（大头是 rd 6 世界 settle）；热 `shot` 0.15–0.4 s；四机位联系表 2.3 s；`eval` 10 ms；`check all` 1.5 s；`--ref` 3 s。十轮 `up / 超时杀 / kill -9` 后再 `up` 由 `sweepStale` 清干净，`pgrep` 无残留。

与 §2–§6 的差异 / 补充：

- `sweepStale` 只清**带 owner 文件且 owner 已死**的 `/tmp/gode-gd-*`，别的工具（如 pgviz 自测脚本）起的同前缀浏览器不碰。守护进程被 `kill -9` 时浏览器会留到下一次 `up` / `down` / `ps` 才清。
- 自动重载 **[改 11-09，s16 §13.5：按 kernel 的 `HOT` 表]**：shot / check / pose / mark / xz **之前**比较 `main/ rgl/ w/ vendor/` 与宿主 B 的 js/html 修改时间，有改动才整页重载（`gd.js` 自身不算，改了要 `down / up`）。`defl/` 的脚本、表、ui 变了**不整页重载**：开发服务器把文件事件推给页面，页面自己热更新，gd 只调 `gg.mods.sync()` 等它落定；`defl/g/` 的生成器脚本走 `gode.restart`（世界重生）。没起开发服务器（`gg.dev.up` 为假）时，gd 按 mtime 自己调 `gg.mods.reload` / `Table.reload`。xz 若触发整页重载会重新 `mark`。
- `frame / iso-*` 是 gd 的框景：用透视相机从斜上 35° 框住 bbox，与游戏的 F4 相机无关（11-09 起游戏 F4 只有 fp / orbit / back）。
- 机位名不在表里且是 `plain canopy cave water uw` 之一时，`gm.test.find` 按 handover/tools.md §3 的规则搜索并写回 `c_.json`。`--ref` 的格子默认 hour 10、隐藏 HUD；`ice / mobs / map` 还没有机位（只放参考图），`trees / caustic / uwrefl` 借用 bench 机位，与参考图的构图差很多，M1 起补专门机位。
- 一个守护进程只有**一个页面**：两个 Agent 共用时会互相 `go` 走对方的页面（命令会报「当前页面没有机位」）。需要时再加 `--tab`。
- `freeze` 默认同时停宿主 B 的游戏 tick（随机 tick / 流体 / 火 / 草蔓延），否则世界随 settle 时长变化，`genhash` 时好时坏；要看动态时 `freeze({ tick: true })`。
- `settle` 用 `freeze` 后 `VR.D.time` 非空的事实关掉 rgl 的升起 / 淡入动画，不再单独等 riseFade。

## 10. 页面 → Agent：收件箱 [11-09]

gd 的浏览器是有头的，用户可以直接在 Agent 打开的页面里操作（pgviz 查点、画选区）。要让用户「查了一些点、框了几个范围」之后**一键交给 Agent**，页面需要一条单向通道：

- **通道**：守护进程启动时 `Runtime.addBinding('gdSend')`，页面里就有 `window.gdSend(jsonString)`（导航后仍在；普通浏览器没有它，页面一切照旧）。binding 事件进守护进程的收件箱（≤ 200 条），守护进程回调页面 `window.gdAck(seq, 在听?, 待取, kind)`，页面弹 toast「已通知 Agent #3」/「（Agent 暂未在听，留在收件箱）」。
- **Agent 取消息**：`gd inbox`（取走并清空）、`--keep`（只看）、`--wait N`（≤ 280 s，空则阻塞到有消息）、`-f`（持续跟随，每条一行）。**被唤醒的做法**：用户说「我选好了」之前就后台跑 `gd inbox --wait 280`（run_in_background，退出即唤醒我），或 Monitor 跑 `gd inbox -f`。一行 = `#序号 时间 kind JSON`；JSON 里 `ctx` 是页面状态（生成器 / 种子 / 视角 / 位置 / kw / `href` 可直接 `gd go`）。
- **健壮性**：客户端被杀（Ctrl-C / 超时 / Monitor 停了）时，等待中的请求不取走消息（`res.on('close')`）；`gd ps` 显示「待取 / 在听」；`gd check` 期间页面置 `window.gdQuiet`，检查里点的按钮不进收件箱。
- **kind**：`copy:point | sample | sel | url | gd | origins`（任何 ⎘ 复制都会通知，带 `text`）、`submit`（「→ Agent」按钮 / Ctrl+⏎ / `viz.submit()`）：`{ sel, selAt, hit, origins, originsText, sample, stats }`，其中 `stats` 就是 `viz.stats({sel})` 的整份结果（Agent 一收到就有数字，见 s13 §7）。
- 页面入口：顶栏「→ Agent」、⑤ 选区行、原点菜单；`viz.submit({dry:true})` 只返回要发的内容。检查 `viz-agent`（binding、按钮、提交内容，dry）。

## 11. 生成器基线与 `--matrix` [11-09]

**`gd check --matrix all`**：pgviz 的检查默认只在当前页面的生成器下跑；`--matrix mini,gp,liq`（`all` = 三个）逐个 `gd go gode/viz/?g=…` 各跑一遍，行名带 `@g`，跑完回原页面。

**基线（人类可读，只提醒人）**。生成器默认输出不该「悄悄变」，但创作者本来就会改生成器，所以**不用哈希指纹**（一改就红，还会让 Agent 去把有意的改动「修」回去），而是：

- `gode/tools/baseline.tsv`：`gen region key value`，默认参数、种子 20240607、每个生成器 3 个 96×96 区域（原点 / 东北 / 西南）的 `viz.stats`（地表高、方块计数、矿、群系、水、洞、树按种、噪声场……，约 900 项）。可读、可 `git diff`、可手改。
- **偏差的流向**：`gd down`（含空闲 10 min 自退）时，若 `gode/w、defl/g、vendor、goodGP/js、goodLiqPG/src/world、viz/stats.js、viz/species.js` 自上次测量以来动过（mtime 摘要，记在 `shots/drift.json`），守护进程在**回复完 `down` 之后**留在后台量一遍（约 10–25 s，浏览器窗口多留一会儿）；有偏差 → 写 `shots/drift.md`（按生成器 / 区域列「量：旧 → 新（+x%）」，相对变化大的在前）+ `shots/index.tsv` 一行 `tag=drift`（画廊里置顶、橙色、链到 drift.md）+ **桌面通知**（`notify-send -u critical`）。**不进任何命令输出**：`gd down` 只回 `down`，`gd check`、`gd ps` 都不提。
- 人的动作：有意的改动 → `gd baseline accept`（重新量并写入基线，清掉 drift.md）；不是有意的 → 看 drift.md 决定。`gd baseline run` 现在就量并打印是否有偏差；`gd baseline` 看基线日期与上次结果。**这些是给人用的，Agent 不要自作主张去 accept 或「修」偏差。**
- 没有基线时第一次 `gd down` 自动建立并通知一次。统计口径变了（`stats.js` 的 `STATS_VER`）→ 新旧不可比，不当偏差，只通知「口径过期」让人重建。
- 实测：全部 3 个生成器连量两遍逐项相同（确定性）；默认等价性在加 `meta.knobs` 当时已对拍过（旧工作树 vs 新，哈希相同），基线从那之后的状态建立。

