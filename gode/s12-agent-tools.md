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
gd reload                                            强制重载（gode/ 下 js 有改动时 shot 前自动做）
gd pose plain|@x,z^y,yaw,pitch[,fov]|iso-ne          摆机位（c_.Bench.poses 名字、坐标或 F4 相机名）
gd shot [pose…] [--tag T] [--sheet]                  settle → 截图 → 写 gode/shots/；打印文件路径
gd xz <file.xz|-> [--at @x,z^y] [--frame] [--shot]   追加文本体素（s06 §5），--frame 自动用 iso 相机框住 bbox
gd mark / gd revert                                  世界改动打点 / 回滚到打点（试错不累积）
gd set c_.Path=v …                                   走 gm.pane.set（与 &json= 同路由）
gd eval '<js>'                                       页面里执行，按值返回
gd check [name…]                                     跑 checks.tsv（§6）
gd perf [--frames 120]                               低频：帧时间中位数 + 渲染器 stats()，不进默认 loop
gd log [-f]                                          页面 console / 异常（自上次调用以来）
```

- **进程模型**：`gd up` fork 出守护进程，守护进程 spawn 浏览器（`detached`，进程组 = 浏览器 pid），在 `/tmp/gode-gd/sock` 上开 HTTP（unix socket，只给 CLI 用，不是静态服务），CLI 每条命令是一个请求。守护进程写 `/tmp/gode-gd/state.json`（pid、浏览器 pgid、CDP 端口、profile、URL、最后活动时间）。
- **不留尸体**：① 空闲 10 min（`GD_IDLE`）自动 `down`；② 浏览器意外退出 → 守护进程也退；③ 守护进程收 SIGTERM / SIGINT / 未捕获异常都先 `process.kill(-pgid)` 再删 profile；④ `up` 前 `sweepStale`；⑤ `gd ps` 让 Agent 能看见在跑什么。
- **快**：页面常驻；`shot` 只做 `pose → settle → capture`，目标热路径 < 2 s；冷 `up` < 6 s。每条命令打印耗时，超过 `GD_SLOW`（默认 8 s）时打出卡在哪一步（settle 的 pending 数）。
- **默认启动**：`prime-run chromium --ozone-platform=x11 --use-angle=gl --enable-gpu --ignore-gpu-blocklist`，有头窗口放在屏幕外角落（`--window-position`）；视口用 `Emulation.setDeviceMetricsOverride` 钉死尺寸，与窗口大小无关。
- **静态服务**：用户的 `http-server -p 8765 -c 1` 常驻在仓库根目录，`localhost:8765/gode/` 总是可用；gd **不自带服务器**，`up` 时探一下 `:8765`，不通就报错并提示启动命令（`GD_BASE` 可改）。
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
  pose(p),                      // 名字 | {x,y,z,yaw,pitch,fov} | '@x,z^y,yaw,pitch' | 'iso-ne' 等 F4 相机
  xz(text, { at }),             // 解析并放置 XZ1 文本（s06 §5）→ { bbox, placed, hash }
  frame(bbox, cam = 'iso-ne'),  // 用 F4 正交 / 斜视相机框住 bbox（s09 §8）
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

- `tools/bench-b-poses.json`（seed 20240607：`plain canopy cave water uw`，宿主 B 坐标）→ `defl/c_.json` 的 `c_.Bench.poses['20240607@old']`。键带生成器名，因为同一种子在 `gp / liq` 下地形不同；`liq` 的 y 要 +64（s02 §4）。
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
