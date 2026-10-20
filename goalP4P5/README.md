# goalP4P5 —— 宿主 B 接入（P4a/b/c + §12 同步升级）→ P5 faceAO 决策

> 任务包。`doc/` 是 `handover/renderer-refactor/` 的**快照**（只含本任务要读的章节；真值在原目录）。
> 接口单一真值：`../goal-renderapi.ts`（不复制；§9 TODO-1…7 已拍板）。宿主 B 的约定真值：`doc/xyzb/meta.md`（纹理/状态布局，已评审）、`doc/xyzb/all.md`（`BLOCK_DEFS`/`model`）、`doc/xyzb/chunks_dat.md`、`doc/mat/game-spec.md`（`c_*` / `gg.my` 约定、模式开关）、`doc/mat/world-gen.md`（tint 决策）——按需读，**以文档约定为准，代码只在实现时读对应处**。
> 入口条件：`goalP3P4` 全部验收（v2 在宿主 A 上已是 RGBA8UI + `state()` + `Env` + DF）。

## 0. 测试分工（用户拍板，贯穿全包）

- **自动化只到截图**：`tools/bench-v2.mjs --url index.html --save <tag>` / `--cmp <tag>`（机位来自 `c_Bench.poses`，§12.3），`tools/verify-renderer.mjs`（接口/尺寸/不变量断言）。截图对比的对象是 **gls 网格 vs v2** 同机位同冻结环境两张图（§12.1 热切换），以及 v2 自己的阶段回归。
- **动态项全部手工**：§12.2 冻结、§12.3 机位切换、§12.4 `c_Veg`、XRay/solidWater 强制回退等都在 **Tweakpane 上由人调**，不写脚本驱动面板。
- **特殊场景由人类搭建**：需要验证世界（§12.5 `test/bw_models.webp`）或任何专用场景时，Agent 只提出**具体清单**（见 §12.5 正文）并请求「搭好后站在某个方块上退出存档即可」；不要自己写生成脚本造场景。存档后 `?xyzb=<url>&pose=models` 进入。
- HITL 的差异判读以 `doc/s11-hostB-bounds.md` §11.3「预期差异」表为准：表内的不算 bug。

## 1. 开工前必读

1. `doc/s08-lessons.md`（§8.3 适配层：v2 只认接口不认宿主）。
2. `doc/s00-status.md` §0.1；`doc/s10-interfaces.md` §10.1 已确认 ts 块、§10.4、§10.5-4。
3. `doc/s11-hostB-bounds.md` 全文（含 ⚠）；`../goal-renderapi.ts` §2（`BlockState/MODEL_TO_KIND/UINFO/USHAPE`）、§4、§7（`glsSource/glsBlocks/glsEnv`）、§8（`c_*`）。
4. `doc/s12-hostB-upgrade.md` 全文；`doc/s06-milestones.md` P4/P5 行。
5. `doc/xyzb/meta.md`（整篇）。其余 `doc/xyzb|mat/*` 在对应步骤读。

## 2. 步骤

| # | 步骤 | 读什么 | 验收（自动 → 人工） |
|---|---|---|---|
| 1 | **宿主 B 前置**（§12.1–12.3，P4a 之前，合计很小）：`c_Render` 热切换 F6（`chunkGroup.visible` 切换、XRay/solidWater/标题预览强制 gls）；`c_Dbg.freeze`；`c_Bench.poses`（plain/canopy/cave/water/uw/models）+ `?pose=` | `doc/s12-hostB-upgrade.md` 12.1–12.3、ts §8、`doc/mat/game-spec.md` §9（`c_*` 约定） | `bench-v2 --url index.html` 能按 poses 出 gls 截图 → 人在面板上切 F6/冻结确认世界不漂移 |
| 2 | **P4a 几何占位**：`glsSource`（区块 Map / mesher 完成 → `'blocks'`、`Lighting` → `'light'`、`CHUNK_H=128`）、`glsBlocks`（`state(id,meta)`：`model→kind` 按 `MODEL_TO_KIND`，非 cube/cross/torch/liquid 先按 kind 1 整格；tiles 来自图集转 `DataArrayTexture`，第 0 帧；tint 用群系代表点）、`glsEnv`；`rd` 钳 ≤10；`uInfo` 升 RGBA16UI（TODO-3，tile > 255） | §11.1/§11.2/§11.4 P4a、§10.4、ts §7、`doc/xyzb/all.md`（`BLOCK_DEFS`） | verify：`state()` 对 256×16 可调用、`uInfo` 256×64 / `uShape` 8×256 尺寸、`height` 一致 → `index.html?r=v2` 出图，四机位 gls/v2 截图对；SECT 触发率统计（§11.4 末、§8.1 ①）决定是否开 |
| 3 | **请求验证世界**：向用户提出 §12.5 清单（11 种 model 各一排、8 档雪层、8 阶段小麦、门开关、4 向梯子/火把、半砖台阶、仙人掌、火、静水池 + 7 级流水、岩浆、1 格厚贴天空墙、每种树；玩家正对小麦，站在方块上退出） | §12.5 | 用户交付 `test/bw_models.webp`；`?xyzb=…&pose=models` 能进；先存一组 gls 基准截图 `--save p4a-gls` |
| 4 | **P4b 状态表 + `uShape`**：kind 7 AABB slab 求交（≤4 盒）、`shapes.js` 共享模块（宿主 B `blockBoxes` 与适配器同源）、door/ladder/layer/box 状态行、torch facing、liquid 走 `fluidTop` 公式（TODO-4，meta 0 → 0.875）、crop 按 cross（TODO-5）、fire = cross + emissive | §11.2（以 ⚠ 后的 ts 为准）、ts `USHAPE`/§6.8、`doc/xyzb/meta.md` 形状节 | `cube/cross/torch/liquid(meta 0)` 与 P4a 截图 0 px；验证世界 `pose=models` 下 11 种 model 全部可见 → 人在冻结环境下目测与 gls 一致（§11.3 偏差除外） |
| 5 | **P4c mesher 副产品 + 光照快路径 + tint**：`Mesher.greedy` 顺手产 `aux.maxY/sectEmpty/sectFull/brick`；`onChunkChanged('light')` 走 G 通道快路径；`uBio` RG8 + 3 张色图；`c_Veg` 面板 + `VR.apply(key)` 导出 | §10.4、§2.2、§11.3 tint 行、§12.4、`doc/mat/world-gen.md` §5.1 | `Mesher` 额外耗时 ≤5%；放火把只走 light 路径（CPU 无 `leafPost`/砖扫描）；tint 开 `biome` 时 gls/v2 同硬缝 0 px → 人调 `c_Veg` 各项看两边同源 |
| 6 | **P5 决策**：用 P3 的 DBG 2 / 分 pass 计时测着色占比；>20% 才做 `faceAO`（mesher 产 `aux.faceAO` → `uInfo` k3 或 ts 保留位），否则关闭 P5 | `doc/s03-accel.md` §3.5、`doc/s05-tools.md` | 着色占比数字写进 s06；做了则 `--cmp` 允许 AO 像素差异并附前后截图 |
| 7 | **收尾**：§6 加 P4/P5 结果；`goal-renderapi.ts` 与实现有出入时先改 ts；`handover/renderer-refactor/s00` 结构索引更新 | — | verify 三组 PASS；`bench --url index.html --cmp` 回归 |

## 3. 本包不做（§11.3 / §12.6）

- 生物 / 掉落物 / 粒子 / 雨雪：宿主 B 照常 three 画进 `sceneRT`，`comp` 深度合成。
- XRay ghost/red、`solidWater` 半透明：强制回退 gls，不加 v2 分支。
- 资源包动画帧（先第 0 帧）、流动水面斜面插值、§3.2 位图、gls 侧加 v2 效果、分屏合成。
- 标题预览 / 屏保（`previewRd 16`）不接 v2。

## 4. 硬约束

- `rd ≤ 10`（内存表见 ts §4 / §11.1），面板回写取 min。
- `[confirmed §x]` 字段不改名；`BlockTable` 只加 `state()/boxes()`（TODO-7）。
- `shapes.js` 是形状唯一真值，宿主 B 与适配器都 import。
- 读码范围：只读实现当前步骤所需的 `index.html`/`gls.js` 区段（先 `rg` 定位），不整文件通读。

## 5. 命令

```
node tools/verify-renderer.mjs                                   # 需 http://localhost:8765/
node tools/bench-v2.mjs --url index.html --save p4a-gls          # gls 基准（F6 在 gls 侧）
node tools/bench-v2.mjs --url index.html --save p4a / --cmp p4a  # v2 阶段回归
```
