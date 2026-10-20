# goalP4P5 —— 宿主 B 接入（P4a）→ P5 着色器拆 pass → P4b/c + §12 同步升级

> 任务包。`doc/` 是 `handover/renderer-refactor/`、`handover/tools.md`、`doc/dda-optim.md` 的**快照**（只含本任务要读的；真值在原处）。
> 接口单一真值：`../goal-renderapi.ts`（不复制；§9 TODO-1…7 已拍板；`[goalP3P4 实现]` 注释是已落地的修正，照它）。
> 宿主 B 约定真值：`doc/xyzb/meta.md`（纹理/状态布局，已评审）、`doc/xyzb/all.md`（`BLOCK_DEFS`/`model`）、`doc/xyzb/chunks_dat.md`、`doc/mat/game-spec.md`（`c_*` / `gg.my` 约定、模式开关）、`doc/mat/world-gen.md`（tint 决策）——按步骤读，**以文档约定为准，代码只在实现时 `rg` 定位读对应处**。
> 入口条件：`goalP3P4` 已完成（`handover/finished/goalP3P4/`）：v2 在宿主 A 上已是 RGBA8UI + `state()` + `Env` + 按区块 DF；回归基线 `p1fx`，5 机位 `plain,canopy,cave,water,uw`。

## 0. 两个前提（读完再排工）

**A. 为什么 P5 变了、又为什么插在 P4b 前**（`doc/dda-optim.md`、`doc/s06-milestones.md` §6.5「未达成项」+「对后续阶段的影响」、`doc/s08-lessons.md` §8.7）
- DF 把主射线迭代砍 35–40%，dda 时间只降 7–15%：**65–75% 成本不随步数变**；`steps` 100 与 500 无感。步进侧到此为止（树剪枝 + DF 是最佳平衡），不再追步数。
- 真正的杠杆是**寄存器压力**：`DDA_FS` 在 Intel 上 SIMD8 + ~230 spill；每多一份内联 `trace`、每多一个循环寄存器都全局变慢；第 5 步「fetch 降了、时间涨了」就是这个。阴影射线（2.5 次迭代）占 20–28%。
- 下一难点 = 阴影射线、GL 参数化的模块化、水与云。做法 = **把阴影射线、反射/折射、命中着色拆成独立 shader / pass**（G-buffer：命中 t / 格 / 法线 / 光照），`DDA_FS` 只剩主射线。
- P4b 的 kind 7 AABB、`uShape`、分级 `fluidTop`、door/ladder 全是往 `trace` 里加代码 → **拆 pass 之前加只会重演第 5 步**。所以顺序是 P4a（不碰 shader）→ P5 拆 pass → P4b/c。
- `faceAO`（旧 P5）降为可选：拆 pass 后若「着色 pass」单独计时仍是大头再议。

**B. 测试分工（用户拍板，贯穿全包）**
- **自动化只到截图**：`node tools/bench-v2.mjs --url index.html --save <tag>` / `--cmp <tag>`（机位来自 `c_Bench.poses`，§12.3）、`node tools/verify-renderer.mjs`、`node tools/shader-stats.mjs`（spill / SIMD）、`tools/df-seeds.mjs`（动 trace 后）。工具用法与参数见 `doc/tools.md`。截图对比对象：**gls 网格 vs v2** 同机位同冻结环境两张图（§12.1 热切换），以及 v2 自己的阶段回归。
- **动态项全部手工**：§12.2 冻结、§12.3 机位切换、§12.4 `c_Veg`、XRay/solidWater 强制回退等在 **Tweakpane 上由人调**，不写脚本驱动面板。
- **特殊场景由人类搭建**：需要验证世界（§12.5 `test/bw_models.webp`）或任何专用场景时，Agent 只提出**具体清单**并请求「搭好后站在某个方块上退出存档即可」，不自己写脚本造场景。存档后 `?xyzb=<url>&pose=models` 进入。
- 差异判读以 `doc/s11-hostB-bounds.md` §11.3「预期差异」表为准：表内的不算 bug。

## 1. 开工前必读

1. `doc/s08-lessons.md`（§8.3 适配层、**§8.7 寄存器压力七条**）。
2. `doc/dda-optim.md`；`doc/s06-milestones.md` §6.5（结果表、实现要点、未达成项）。
3. `doc/s00-status.md` §0.1/§0.2（结构索引已按 2207 行版更新；开工先 `git log -3 -- v2.js` 确认无漂移）。
4. `../goal-renderapi.ts` 全文；`doc/s10-interfaces.md` §10.1 已确认块、§10.4、§10.5-4。
5. `doc/s11-hostB-bounds.md` 全文（含 ⚠）；`doc/s12-hostB-upgrade.md` 全文；`doc/tools.md`。
6. `doc/xyzb/meta.md` 整篇；其余 `doc/xyzb|mat/*` 在对应步骤读。

## 2. 步骤

| # | 步骤 | 读什么 | 验收（自动 → 人工） |
|---|---|---|---|
| 1 | **宿主 B 前置**（§12.1–12.3）：`c_Render` 热切换 F6（`chunkGroup.visible`；XRay / solidWater / 标题预览强制 gls）、`c_Dbg.freeze`、`c_Bench.poses`（plain/canopy/cave/water/uw/models）+ `?pose=`；`bench-v2 --url index.html` 读这张表 | §12.1–12.3、ts §8、`doc/mat/game-spec.md` §9 | bench 能按 poses 出 gls 截图且同代码重复跑 0 px（§8.7-7）→ 人切 F6 / 冻结确认世界不漂移 |
| 2 | **P4a 几何占位（不改 shader）**：`glsSource`（区块 Map；mesher 完成 → `'blocks'`、`Lighting` → `'light'`；`CHUNK_H=128`；`aux.dist` 可由宿主逐块产出直接 `dfMerge`）、`glsBlocks`（`state(id,meta)`：`MODEL_TO_KIND`，非 cube/cross/torch/liquid 先按 kind 1 整格；tiles 来自图集转 `DataArrayTexture` 第 0 帧；tint 用群系代表点；`uInfo` 升 RGBA16UI，TODO-3）、`glsEnv`；`rd` 钳 ≤10；流体表皮规则按 `state().fluid` 检查 | §11.1/§11.2/§11.4 P4a、§10.4、ts §7、`doc/xyzb/all.md` | verify：`state()` 256×16 可调用、`uInfo` 256×64 / `uShape` 8×256 尺寸、`height` 一致、DF 不变量 → `index.html?r=v2` 出图，5 机位 gls/v2 截图对；SECT 触发率统计（§11.4 末）决定开不开；`shader-stats` 记一次 P4a 基线 |
| 3 | **请求验证世界**（人类搭）：按 §12.5 清单（11 种 model 各一排、8 档雪层、8 阶段小麦、门开关、4 向梯子/火把、半砖台阶、仙人掌、火、静水池 + 7 级流水、岩浆、1 格厚贴天空墙、每种树；玩家正对小麦，站在方块上退出） | §12.5 | 用户交付 `test/bw_models.webp`；`?xyzb=…&pose=models` 能进；存 gls 基准 `--save p4a-gls`、v2 基准 `--save p4a` |
| 4 | **P5 着色器拆 pass**（宿主 A 上做、两宿主受益；每一小步 `shader-stats` + `--cmp p4a`/`p1fx`）：① G-buffer pass = 现 `trace` 主射线，输出命中 t / 格 id+meta / 法线+面 / 平滑光照（打包 int）；② 阴影射线独立 pass（读 G-buffer，只带它需要的变量）；③ 水面反射 / 水下折射 pass；④ 着色 pass（贴图 / AO / 雾 / 云合成）；⑤ `trace` 的 out 参数与循环状态再瘦（`nrm/wn` 合一 int、去 `bc`）。`#if` 保留单 pass 路径做 A/B 直到拆分版全面不慢 | §8.7、§6.5「对后续阶段的影响」、`doc/dda-optim.md`、`doc/s03-accel.md` §3.6、`doc/tools.md`（shader-stats、计时槽、§8.7-6 计时重叠坑） | `shader-stats`：主射线 pass spill 显著下降 / SIMD 变宽；5 机位 `--cmp` 0 px（预算放大 `--ref` 下；默认预算差异只允许已知项）；阴影 / 反射 / 着色各 pass 有独立计时槽；整帧不慢于 §6.5 最终行，目标重新逼近 12 ms → 人看 bliss 预设与水下 |
| 5 | **P4b 状态表 + `uShape`**（在拆分后的主射线 pass 里加）：kind 7 ≤4 AABB slab 求交、`shapes.js` 共享模块（宿主 B `blockBoxes` 与适配器同源）、door/ladder/layer/box 状态行、torch facing、liquid 走 `fluidTop` 公式（TODO-4）、crop 按 cross（TODO-5）、fire = cross + emissive；`#if SHAPES` 让宿主 A 不编译 kind 7 | §11.2（以 ⚠ 后的 ts 为准）、ts `USHAPE`/§6.8、`doc/xyzb/meta.md` 形状节 | `cube/cross/torch/liquid(meta 0)` 与 `p4a` 0 px；`shader-stats` 对第 4 步无显著回退；`pose=models` 下 11 种 model 全部可见 → 人在冻结环境下目测与 gls 一致（§11.3 偏差除外） |
| 6 | **P4c mesher 副产品 + 光照快路径 + tint**：`Mesher.greedy` 顺手产 `aux.maxY/sectEmpty/sectFull/brick`（DF 占据亦可顺手 → `aux.dist`）；`onChunkChanged('light')` 走 G 通道快路径；`uBio` RG8 + 3 张色图；`c_Veg` 面板 + `VR.apply(key)` 导出 | §10.4、§2.2、§11.3 tint 行、§12.4、`doc/mat/world-gen.md` §5.1 | `Mesher` 额外耗时 ≤5%（`upload-cost` 同类口径）；放火把只走 light 路径；tint `biome` 时 gls/v2 同硬缝 0 px → 人调 `c_Veg` 看两边同源 |
| 7 | **收尾**：§6 加 P4/P5 结果（含各 pass 计时与 spill 表）；`goal-renderapi.ts` 与实现有出入先改 ts；s00 结构索引、`tools.md`（`--url` 用法）更新；`faceAO` 去留写明 | — | verify 三组 PASS；`bench --url index.html --cmp` 回归 |

## 3. 本包不做（§11.3 / §12.6 / dda-optim）

- 再追步数（更深的层级、位图 §3.2、更激进 DF）、树叶 LOD 调参：实测无感或负收益。
- 生物 / 掉落物 / 粒子 / 雨雪：宿主 B 照常 three 画进 `sceneRT`，`comp` 深度合成。
- XRay ghost/red、`solidWater` 半透明：强制回退 gls，不加 v2 分支。
- 资源包动画帧（先第 0 帧）、流动水面斜面插值、gls 侧加 v2 效果、分屏合成。
- 标题预览 / 屏保（`previewRd 16`）不接 v2。
- 阴影射线的画面门控（只发顶面 / 棋盘格）：改画面，违反 0 px，已否决（§6.5 第 7 步）。

## 4. 硬约束

- 每次动 shader 先后各跑一次 `shader-stats`，spill 上升即回退（§8.7-1）；A/B 用编译期 `#if`，不用 uniform 分支。
- 画面回归在参考模式（`--ref`）下 0 px；默认预算下的差异只允许 §6.5 列出的已知项。
- `rd ≤ 10`；`[confirmed §x]` 字段不改名；`BlockTable` 只加 `state()/boxes()`（TODO-7）；`shapes.js` 是形状唯一真值。
- 读码范围：只读实现当前步骤所需的 `index.html`/`gls.js` 区段（先 `rg` 定位），不整文件通读。

## 5. 命令

```
node tools/verify-renderer.mjs                                   # 需 http://localhost:8765/
node tools/shader-stats.mjs                                      # 每次改着色器结构前后
node tools/bench-v2.mjs --views plain,canopy,cave,water,uw --cmp p1fx      # 宿主 A 回归
node tools/bench-v2.mjs --url index.html --save p4a-gls          # gls 基准（F6 在 gls 侧）
node tools/bench-v2.mjs --url index.html --save p4a / --cmp p4a  # 宿主 B 上 v2 的阶段回归
```
