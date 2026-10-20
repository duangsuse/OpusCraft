<!-- handover/renderer-refactor/s09-fx-costs.md · 从 renderer-refactor.md 拆出（原文未改，只加 ⚠ 标注）· 索引见 ../renderer-refactor.md -->
> **§9 效果期新增开销预估 + 优化建议排序 + 进基准前要补的数字**
> 状态：有效；§9.2 末尾给出实施顺序 7→1→3→P2 DF→2→4/5/6
> 何时读：P3 必读（§9.2 是 §4 的细化）；开工第一步是 §9.3
> 对应 goal-renderapi.ts：§9.2-3 ↔ goal-renderapi.ts §4 UVOX

## 9. P1 之后的开销预估与优化建议（效果期新增代码，**未进基准**）

§6.3 的数字是 P1 时测的（默认参数：`cloudStyle 0 / waterStyle 0 / leafStyle 0 / shadowSteps 20 / shadowDist 6`）。
之后加进来的效果全部在 `main` 和 `trace` 的分支里，有的是编译期开关（预设里的 bliss/mc 才编进去），有的是**每像素无条件执行**。
下面按代码逐项数 fetch/采样次数得出估算，**先按 §9.3 测过再动**（§8.1）。

### 9.1 每像素成本账（以「fetch 或纹理采样次数」计；`CNT` 只覆盖 texelFetch，`texture()` 类采样目前不计入 DBG 2）

| 项 | 触发条件 | 估算 / 像素 | 备注 |
|---|---|---|---|
| 主射线 `trace` | 全部 | plain 26 迭代 ≈ 30 fetch；water 52 迭代 ≈ 60 fetch（§6.3 实测） | 体素级步数占 ~50%（12.6/26），列跳/砖步便宜 → DF（P2）仍是正解 |
| 命中着色 `smoothLight` | 全部命中像素 | **18 fetch** 固定 + 1 atlas | 两级 fetch（voxAt + infoR）只为取 opaque 位 |
| 阴影射线 | 命中 ∧ ndl>0 ∧ sky≥8 | `shadowDist 6` → ≤ ~10 迭代 ≈ 12 fetch | 已经很便宜；别再碰 |
| **`cloudHit` 风格 0/1** | **每像素无条件**（L1211，含近处地面命中的像素） | 水平射线 ≤ 600/12 = 50 步 × 1 fetch；俯视射线 slab 外早退 | 在 plain 这种平视机位，地面像素也在白付这 20–50 fetch |
| **`cloudVol` 风格 2** | 同上，无条件 | 44 步 × (1–2 次 3D `texture`) + 稠密点 ×3 次朝光采样 ≈ **60–150 次 3D 采样** | 是全部项里最重的单项；三线性 3D 采样比 texelFetch 贵 |
| 水面 风格 0/1 | 水像素 | `shoreDist` **≤24 voxAt** + 2 噪声 + 几个 sin | 岸边判定占大头 |
| 水面 风格 2 | 水像素 | 上项 + `seaH`×3×(4 倍频×2) = **24 次 `nB`** + `reflScene` **64 步 trace**（+`cloudVol(14,1)`）+ **高光阴影 20 步 trace** + 焦散 2 `nB` | 一个水像素 ≈ 3 个 plain 像素；P1 时 water 机位就已是 29 ms |
| 水下（camW） | 全部像素 | `uwShafts` 6×2 `nB`；命中像素再 `uwCaustic` ≤8 voxAt；仰视水面像素 `reflHit` **96 步** 折射重追踪 | 水下仰视 ≈ 2 条主射线 |
| 树叶卡片 `LEAF_CARDS` | 树冠像素 | 每个树叶格 ≤4 平面 × 1 atlas；halo 格 ≤3 邻 × 4 = **12 atlas**；`nAlpha≤8` 格 → 最坏 **~100 次 atlas 采样** | 只在 `leafStyle 1`；canopy 机位需单测 |
| 星星 | 夜间天空像素 | 2 hash + 若干 ALU | 可忽略 |

**预估 top3（默认预设）**：① 主射线体素级步数（P2 DF 的目标）；② 命中着色固定 18 fetch + atlas；③ 无条件 `cloudHit`（平视时地面像素白付 20–50 fetch）。
**预估 top3（bliss 预设）**：① `cloudVol` 每像素 60–150 次 3D 采样；② 水像素三条射线（主 52 + 反射 64 + 高光阴影 20）；③ 同上①主射线。

### 9.2 建议（按「收益 / 改动量」排序；每条都给出该用哪个数字验证）

1. **云的门控**（改动最小，先做）：`cloudHit` 之前先算 slab 入口 `tE`（风格 0/1 两次除法；风格 2 已有 `tE` 公式），
   `if (hit && kind != 4 && tHit < tE && !camW) → 不调云`。相机在云层下方时，所有命中地面/树/水面的像素都省掉云。
   验证：`--views plain,canopy` 的 `gpu dda` 与 DBG 2 平均 fetch；`--cmp` 应 0 px（云在地形之后本来就被盖掉）。
   例外要保留：`kind==4` 上行射线仍要画云（L1433 那条注释的 bug）。
2. **云独立低分辨率 pass**（风格 2 必做）：云只依赖方向 + 深度，不依赖体素；单开 `cloudRT`（¼×¼，RGBA = 颜色 + alpha，第二目标或打包 `tc`），
   `main` 里改为采样 `cloudRT` 并用 `tc` 与 `z` 比较。预估 `cloudVol` 成本 ÷16。再进一步：云每 2–4 帧更新一次 + 按 `uCloud.xy` 偏移重投影（云移动慢）。
   验证：`--set cloudStyle=2` 的 `gpu dda` 前后对比；画面允许云边缘有差异（`--cmp` 对云像素不要求 0）。
3. **`uVox` 升为 RGBA8UI（§11.1：B = meta，A = DF|flags；不是 RGB）**，标志位放 A 通道高 3 位（~~b = opaque|solid<<1|leaf<<2|fluidLevel<<4…~~ ⚠ 已决定为 goal-renderapi.ts `UVOX.A`：`OPAQUE<<5 | LEAF<<6 | FLUID<<7`，**无 solid，无 fluidLevel**；流体等级在 B 通道 `meta & 15`），`uploadChunk` 打包时查 `BT.state()` 一次写入：
   `cellLO` 1 fetch 代替 2 → `smoothLight` 18→9；`trace` 体素级「是否不透明」判断不再查 `uInfo`（仅命中后取 tile 时查一次）。
   代价：环纹理 +50%（rd 6：19 MB → 28 MB）。与 §8.2「搭便车」一致：扩宽已有纹理，不开新采样器。
   验证：DBG 2 平均 fetch 应下降 ≥ 9 + 体素步数×(非空占比)；`--cmp p0` 0 px。
   **这条也是 §10 流体接口的落点**（流体等级/标志有地方放）。
4. **水面二次射线降档**：`reflScene` 的 64 步 trace 只走到砖级（`fine` 永不开启，命中砖即取砖内任意格着色；远处反射本来就模糊）+ 反射距离按 `tw` 缩放（`tw>32` 时 ≤16 步）；
   高光阴影射线只在 `spec > 0.1`（而非 0.01）时发射。`shoreDist` 的 5×5 换成 `uploadChunk` 时按水面层预算的岸距 nibble（放进上条的第三通道高 4 位）→ 0 fetch。
   验证：`--views water --set waterStyle=2`。
5. **水下光束 / 仰视折射**：`uwShafts` 改为 ¼ 分辨率 pass（同云的思路，可合并进同一个低分辨率 RT 的另一通道）；仰视折射 `reflHit` 96 步 → 砖级 32 步。
   验证：需要新增 `underwater` 机位（bench 的 `VIEWS` 目前没有）。
6. **树叶卡片**：卡片与 halo 各自独立预算（卡片 `nAlpha` 上限 4、halo 邻格 ≤2），`leafCards` 里 4 张卡先做 AABB 粗判再采 atlas。
   验证：`--views canopy --set leafStyle=1`，看 `gpu dda` 与「着色占比」。
7. **测量工具补齐**（做 1–6 前）：`CNT` 覆盖 `texture()` 采样（`nB/matSampleLod/cloudDen` 各加一个 `gTex` 计数器，DBG 6 = 采样热力图）；
   bench 加 `underwater` 机位与 `--set` 的预设快捷（`--preset bliss`）；`DBG 5` 增加「云步数」通道。
8. **不建议**：粗分辨率深度预 pass（8×8 tile 最小 t 起步）——plain 机位列跳+砖步只占 26 中的 4.8，省不出多少；时域/棋盘格上采样——收益 ~2× 但引入历史缓冲与鬼影，留到 DF 之后再评估。

顺序建议：7 → 1 → 3 → P2 DF（§3.4）→ 2 → 4/5/6。1 和 3 对默认预设有效且不改画面；2/4/5/6 只对对应预设/场景有效。

### 9.3 进基准前要补的数字

```
node tools/bench-v2.mjs --save p1fx                                   # 当前默认预设的画面基准（替代 p0：p0 是加效果前的）
node tools/bench-v2.mjs --set cloudStyle=2 --views plain,canopy        # 云风格 2 的增量
node tools/bench-v2.mjs --set waterStyle=2 --views water               # 水风格 2 的增量
node tools/bench-v2.mjs --set leafStyle=1 --views canopy               # 树叶卡片的增量
node tools/bench-v2.mjs --set shadowSteps=0 --views plain              # 阴影射线占比（应 < 10%）
```
把结果写成 §6.4（与 §6.3 同表头），再决定 §9.2 的顺序是否调整。
