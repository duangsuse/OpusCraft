# s10 · 里程碑

> 顺序 [定 11-08]：M0 Agent 工具 + pgviz → M1 生成 + 渲染 Worker → M2 存档 → M3 模组 / 生物 → M4 λ.。联机只写协议（s06 S-4），不排期。

## M0 · Agent 工具 + pgviz（先于 M1）

> 11-09 本轮：M0-1…5 + pgviz V1（已提交 `393cc8a`）；V2 / V3 下一轮。M0-1…5 已完成，实测数字见 s12 §9。
> 11-09 追加（二）：pgviz 快捷键 E R C ⏎ + 页面 → Agent 收件箱（`gd inbox`、「→ Agent」一键提交），见 s12 §10、s13 §8。
> 11-09 追加：调参闭环最小集已提前做出（`meta.knobs` + `kw`、`viz.params / stats({sel}) / tune`，供体加了默认等价的参数）+ 空气距离 select，见 s13 §7；V2 的图层 chip / 群系 / 层叠 / 切片热力图、V3 的 `gg.pane` 与湖泊仍未做。

| # | 内容 | 节 | 验收 |
|---|---|---|---|
| 1 | `gode/tools/gd.js`：守护进程、进程组、空闲自退、`sweepStale`、复用 :8765；`up down ps go reload eval log` | s12 §2 | 连续 `up / Ctrl-C / kill -9` 十次后 `pgrep -f gode-gd-` 为空；热 `eval` < 200 ms |
| 2 | `gode/shots/` 实时目录 + 画廊页 + `latest.webp`；`shot --sheet --vs` | s12 §3 | 用户开着画廊页，Agent `gd shot` 后 2 s 内出现 |
| 3 | `gm.test` 骨架（先挂宿主 B 的等价物验证工具链，gode/index.html 起来后换成 gode 版） | s12 §4 | `freeze → pose → settle → shot` 热路径 < 2 s |
| 4 | 机位表导入 `c_.Bench.poses`、参考图机位 | s12 §5 | `gd shot --ref` 出与 `reference-vision/` 的对照表 |
| 5 | `checks.tsv` + `gd check`；`xz / mark / revert / hash`（XZ1 **解析与放置**提前到这里；识别器 `read` 仍在 M4-2） | s12 §4, §6 | 全量 < 30 s |
| 6 | pgviz V1–V3（s13 §4）：生成器 Worker 池与三个适配器、gg.pane 由此提前 | s13 | s13 §4 各段验收 |

## M1 · 生成 + 渲染 Worker 跑通

| # | 内容 | 节 | 验收 |
|---|---|---|---|
| 1 | `gode/index.html` 新宿主骨架：规范区块（u16 YZX H256）、权威区块 Map、移动与碰撞（宿主 B `Physics` 搬来） | s02 §1 · s03 R-1 | 能在平地上走、跳、飞 |
| 2 | `gg.vars` / `c_` / `gg.pane` + 四层优先级（M0-6 已为 pgviz 做出，此处接入游戏）（含 `defl/c_.json`） | s09 P-1 | `&json=` 深赋值断言；`Object.keys(c_)` 列全 |
| 3 | slicer worker：单键动词信封、`onkwarg`、`gen`（M0-6 已有）、初始光照、`mesh`（`vendor/gl/pool.js` 搬入）、池大小 | s01 | 同种子两次运行哈希一致；main 帧时间不因生成抖动 |
| 4 | 生成器适配器 `mini / gp / liq`（M0-6 已有，此处补 `outside` 之外的游戏侧接入）（liq：y + 64、峰顶 < 250），`?g=` 模块 URL | s02 | 各自 `genHash(n)` 内圈稳定；`mini` 与宿主 B 基线相同 |
| 5 | `outside` + 挂起表合并 | s02 §3 | 跨块树冠无缺口（截图比对） |
| 6 | rgl 接 gode 适配器（YZX、名字 → glid LUT、稀疏状态表）、`?r=gl` | s03 §1–§2 | 与宿主 B 同机位截图主观对照；bench 帧时间不劣于宿主 B |
| 7 | `?r=lite`（`renderVanilla`）+ 运行时热切换 | s03 R-3 | 无 `EXT_color_buffer_float` 时自动回落 |
| 8 | main 增量光照、改块、`blk.tsv` 前 14 行 + 宿主 B 方块导出 | s04 | 挖洞 / 放火把光照正确，跨区块接缝无暗缝 |
| 9 | ⚡ 快调 / 渲染 root / 钉住条 + Alt 滚轮、F3 调试文字、F4 相机（fp / orbit / back）、`&cam=` | s09 §5–§8 | F3 文字与宿主 B 逐行一致；`&cam=orbit&gizmo=…` 一条链接截图到位 |
| 10 | v2 Bliss 体积云移植成 rgl pass（半分辨率 + IGN + TAA，水面 SSR 回落时反云）；`:stained_glass` 走冰的半透明分支；s11 B-1…B-7 | s03 §7 · s11 §1 | `clouds1/2`、`cloud-match-sunDir`、`ice-alike-coloredglass` 同机位对照 |

## M2 · 存档

| # | 内容 | 节 |
|---|---|---|
| 1 | io worker、OPFS region 32×32、ping-pong + crc、Web Locks 互斥、配额提示 + s11 B-8（快照原子、导入先校验、失败可见、容器标脏） | s06 §4.3 · s11 |
| 2 | XZP 三种 section 编码取最小 + zstd wasm + 字典训练（不全量重压） | s06 §4.1–§4.2 |
| 3 | `Pusc.json` / `BIME.tsv` / `xyzb.tsv` / `mat.tsv` / `pending.tsv`，pkv 读写 | s06 §2–§3 |
| 4 | 导出 / 导入 webp + zip，标题屏两个输入框（seed / 联机码，webp 粘贴） | s06 §1 |
| 5 | pile 周期存档（60 s / 20 次 place，序号） | s06 §6 |
| 6 | URL 参数全集、`tpause` | s06 §8 |

## M3 · 模组 / 生物

| # | 内容 | 节 |
|---|---|---|
| 1 | `defl/` 默认模组：`mode.js`、宿主 B DEF 表 → tsv、`c_.json` | s07 §1 |
| 2 | 模组协议：`ready.subs`、`set` 白名单（tier ≤ 2）、`give / tp / time / weather / spawn / popup` | s07 §2 |
| 3 | 模式 + cheat：默认创造、红羊毛、G 键、暂停屏切换弹框 | s07 §3 |
| 4 | 注册：模组 tsv 覆盖 + `{reg}` 补丁 | s07 §4 |
| 5 | iframe：弹框、HUD 叠层、方块绑定；`gode-ui.js` | s07 §5 |
| 6 | `tools/vendor-pg.mjs`；7 种生物换 goodPG 模型 / 贴图 / 姿态；原生骨骼 pass | s05 · s03 §4 |
| 7 | BIME 声明表（`item.json ent.json mob.json on.js`）按键合并、`on / ondie / ontap`、`_buf` 覆盖、Blk 与 Mob 共用可交互字段 | s05 §1–§2 |

## M4 · λ. 与地图

| # | 内容 | 节 |
|---|---|---|
| 1 | slicer `map` 动词、`gm.addMiniMap`、M 键 Y 切片动画、地图物品 | s03 §3 |
| 2 | 文本体素识别器（`gm.test.read`，解析与放置已在 M0-5）（逐格相等校验） | s06 §5 |
| 3 | BBat 多图层 + 依存骨骼树 → 动画实体 | s08 §5 |
| 4 | clawd、LS、零点同步写回、钻石箱 | s08 |
- [11-09 追加] pgviz：快放 N 框去掉（层数 = 选区深度，速度单框挪到「选区深度」下）；左 / 右键选区只有俯视到基岩，其余视角按 seld（检查 `viz-seldepth`）。
- [11-09 追加] pgviz V2 一部分：图层 chip（树种 + 各 sample 场热力图，`L` 键）、树按种统计；slicer 引擎默认动词 `field`；`gd check --matrix`；生成器基线 `gd baseline`（偏差只写 shots + `gd down` 时桌面通知，不进 Agent 的输出），见 s13 §9、s12 §11。genhash 在宿主 B 连跑 39 次（含 check all 之后、reload 之后）全稳定。
- [11-09 追加（三）] pgviz：空气距离改复选框（灰渐变，> 22 px 叠黑数字）、深度 / 快放一行、giz 悬停 = Numpad 帮助；Numpad 4 6 8 2 翻页、5 图层暂时关、9 按住快放，见 s13 §10。
- [11-09 追加（四）] **M1 首刀：1 · 3 · 4 · 5 · 6 的主干跑通**（`gode/index.html?g=mini|gp|liq|old&seed=&rd=…`，v7 / valleys 未接）。实测：mini 在 gode 与宿主 B 的 128×128×128 区域**逐格哈希相同**（含跨块树冠）；`gd check genhash-g`（同种子热重置，区块到达顺序重来）mini / gp / liq / old 都稳；`phys` 跳高 1.10（理论 1.103）、走 4.27 格 / s；plain 机位帧时间中位数 gode 5.5 ms / 宿主 B 5.7 ms（p95 9.4 / 9.8）；宿主 B 与 pgviz 的 `gd check all` 照旧（`viz-keys` 的 ⏎ 项在改动前就已失败：`b7435b2` 给 `gameUrl()` 加了 `test=1`，检查里的正则没跟上，未动）。
  - 落地形状（与 s01–s03 的差异都在这里）：`w/slicer.js` 的 `gen` 带 `light:true` 才算初始光照（`w/light.js`，块边界外不看；`w/glid.js` 按 `meta.names` 查 goodGL 名字，找不到按 SUBST + 后缀规则落到已有块，实在没有当石头并在控制台列出：liq 3 个、gp 约 30 个，多是染色玻璃 / 混凝土）；新动词 `mesh` 的参数沿用 `vendor/gl/pool.js` 的 `{pb,pm,pl,tg,tf,cls,wx,wy,wz}` 并 transfer，没有改成 s01 写的 `{cx,cy,cz,pad,rev}`（padded 由 main 拼，规则同 rgl `padded()` 的 YZX 版）；`viz/pool.js` 搬到 `w/pool.js`（`job` 多一个 transfer 参数），pgviz 照旧 re-export。
  - rgl 的改动（宿主 B 行为不变，靠钩子）：`source.layout === 'yzx16'`、`source.padded / secHash / secHas`、`source.meshPool`（`rgl/terrain.js`）；`SurfaceField({ yzx })`；`rgl/fire.js` 的 YZX 读法与按 type 的 `bt.kind`（4096 项）；`rgl/index.js` 读 `ch.light`。适配器在 `main/rgl.js`，物理在 `main/phys.js`（宿主 B `Physics` + `Player.update` 的搬运，去掉生存 / 摔伤 / 梯子 / 视角晃动），世界镜像在 `main/world.js`（流式加载、outside 合并 + 挂起表、`onChunk` 事件）。
  - **还没做**（对应 M1 其余项）：#2 `gg.vars / c_ / gg.pane / &json=`（`main/phys.js` 的 `c_Motion` 是临时常量表）；#7 `?r=lite`；#8 增量光照与改块（`World.set` 只写不重算光；outside 合并也不重算，树冠下的光照偏亮；块间光照接缝未补）、`blk.tsv`；#9 F3 逐行对齐 / F4 相机 / 快调面板（现在 F3 只是简版）；#10 体积云。已知小毛病：gp 出生点可能落在树里（取柱顶高度，没跳过树叶）；rgl 群系 tint 仍是平原常量（`source.tintColor` 回调未接）；`find` 机位规则未做所以只有 `20240607@mini` 的五个命名机位可用。

