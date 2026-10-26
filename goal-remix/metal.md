# 铜块与金属 / 宝石材质（步骤 10）

> 整理自 `goodLiqPG/handover/lights.md` §2（真值在原处）。材质最终落在 goodGL 的 PBR 表里（render.md §1）：spec 贴图的 R = 光滑度，G = F0 字节，**G ≥ 230 表示金属（F0 取 albedo，漫反射为 0）**（L1596、L3574–3591）。
> 前置：render.md 的 R3 已完成；新方块 id 走 layout.md §5 的 ADD 流程。

## 1. 现状

- 宿主 B **和** goodGL 都没有铜块，`rg copper` 两边都是 0。LiqPG 有 8 个：copper_block、exposed / weathered / oxidized_copper、cut_copper 和它的 3 个氧化阶段（LiqPG id 61–68）。LiqPG 另有铜半砖和楼梯，形状不归本包（README §4）。
- 宿主 B 有、goodGL 没有的金属 / 宝石块：coal / iron / gold / diamond / lapis / emerald_block（render.md §3）。goodGL 的 `PBR.build` 只按名字正则识别 iron / gold / diamond 像素（L1715–1720），这几个块都要补材质行。

## 2. 要做的

| 项 | 来源 | 落点 |
|---|---|---|
| 8 个铜块 id | LiqPG `blocks.js` | 宿主 `BLOCK_DEFS` 追加（cube，镐挖），layout.md §5 的 ADD 行 |
| 贴图 | LiqPG `src/textures/bt_built.js`：调色板 `COPPER` :217–222，`copperBlock(kind)` :223–233，`cutCopper(kind)` :234–242（8×8 切缝，亮边 ×1.14、暗边 ×0.72），程序化，没有资源版权问题 | `rgl` 的贴图源：goodGL `Textures.gen(name)` 没有这个名字时，调用移植过来的绘制函数。资源包里有同名贴图时照常覆盖 |
| 材质行 | §3 | goodGL `PBR` 的 `M` 表（L1603–1651），用的是 `P({ sm, sv, f0, … })` 写法 |
| 金属 / 宝石块材质行 | LiqPG lights.md §2 的数值 | 同上 |

## 3. 材质数值

LiqPG 原值（smooth / f0，其中 f0 = 1 表示金属），以及换算到 goodGL 字节后的建议值：

| 方块 | LiqPG smooth | LiqPG f0 | goodGL 建议 | 说明 |
|---|---|---|---|---|
| copper_block / cut_copper | 0.72 | 1（金属） | 铜色像素 `sm .72, f0 230` | — |
| exposed（含 cut） | 0.60 | 1 | 铜色像素 `sm .60, f0 230`；铜绿像素按下一行 | — |
| weathered（含 cut） | 0.40 | ⚠ **0.5** | **逐像素区分**：铜色像素是金属 `sm .50, f0 230`；铜绿像素是电介质 `sm .28, f0 10` | LiqPG 已知问题：f0 0.5 既不是金属也不是正常电介质，掠射角反射很强，像漆面，与 exposed 之间断层明显。改成按铜绿覆盖率过渡，四个阶段就连续了 |
| oxidized（含 cut） | 0.25 | 0.06 | 铜绿像素 `sm .25, f0 15`；残留的铜色像素仍是金属 | — |
| iron_block | 0.70 | 1 | `sm .70, f0 230` | goodGL 正则只认含 iron 的名字里低饱和、亮的像素（L1718），整块写材质行更稳 |
| gold_block | 0.78 | 1 | `sm .78, f0 231` | 同上（L1719） |
| diamond_block | 0.85 | 0.17 | `sm .85, f0 44` | goodGL 的钻石矿点用的就是 f0 44（L1715） |
| emerald_block | 0.82 | 0.15 | `sm .82, f0 38` | — |
| lapis_block / redstone_block | 0.55 / 0.50 | 0.06 | `f0 15` | — |
| coal_block | 0.35 | 非金属 | `sm .35, f0 10` | — |

- 铜色和铜绿的判定写成调色板下标：绘制函数知道每个像素用的是哪一档颜色，把这个下标一起输出给 `PBR.build`，比按色相猜更准。
- 天空反射的门控：LiqPG 只在露天时加天空反射（`× smoothstep(0.7, 1, skyL)`，deferred.js:160–187）。⚠ 开工时先核对 goodGL `fancyFS` 的 split-sum 环境项有没有按天空光遮蔽。没有的话，洞里的铜块会反射天空，要补上同样的门控。

## 4. 验收

- 自动：新加一个机位 `metal`：一排 8 个铜块 + 6 个金属 / 宝石块，分别在露天和洞内各放一排；晴天正午、阴天、黄昏三条 URL（`&t=`、`&weather=`）各截一张。
- 人看：四个氧化阶段过渡连续，weathered 不再是漆面；金块、铁块在露天反射天空，洞内不反射；钻石、绿宝石有尖锐高光但没有金属色。
- 需要人搭场景：上面那两排方块，按 goalP4P5 §0.B 的方式交付存档。
