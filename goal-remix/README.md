# goal-remix —— 多供体合流：生成器 `?g=old|v1|v2`、goodGL 管线移植、调参工具链

> 任务包。供体：`gen.js`（自有）、`goodGP/`、`goodLiqPG/`、`goodGL.html`。
> 宿主：**生成器**落在宿主 B（`index.html` + `gls.js` + `gen.js`，three r170）；**渲染器 `?r=gl` 先接宿主 A**（`VoxelCraft.html`，所有东西先在 A 上试玩），再接宿主 B。
> 分册：[layout.md](layout.md)（**数据布局不兼容总表** + 改高 256 + 转换层表结构）· [gen.md](gen.md)（生成器）· [tools.md](tools.md)（URL / 离线出图 / genscope / 探针）· [render.md](render.md)（goodGL 管线 + PBR，**主线**）· [bench.md](bench.md)（renderer-refactor 的测量工具与经验怎么带到 gl）· [water.md](water.md)（LiqPG 水面 / 水下）· [metal.md](metal.md)（铜块与金属材质）。
> 与 `goalP4P5` 的关系：宿主 B 的机位 / 冻结 / F6 仍归 goalP4P5 步骤 1；**改高 256（步骤 1）要在 P4a 接 v2 之前**，否则 v2 的 uVox 环、DF 按 128 接好后再返工。接口真值仍是 `../goal-renderapi.ts`，本包要加的字段（`Renderer.name:'gl'`、`Env.dayTime / weather`、`Env.hide('sky'|'weather')`）**先改 ts 再实现**。

## 0. 已拍板（用户评估，2026-10-26）

| 供体 | 结论 | 在本包里的角色 |
|---|---|---|
| VoxelCraft.html | 不过关：山顶尖利，草地、沙滩太平，矿洞基本废了 | 不用 |
| `gen.js` | 平原和沙滩较自然，但整体太单调。**可以辅助 v1** | `?g=old`（原样保留，做回归基准）；平原 / 沙滩规则并入 v1 |
| `goodGP/` | **作为 v1**。山体高度要往上兼容 256 | `?g=v1` |
| `goodLiqPG/` | **作为 v2 生成器**。洞窟和内部镂空很好；meadow 大型山的频率过高；plains 上不该有超大镂空。代码库太大，不当主干 | `?g=v2`，只取 `src/world/gen/` 子树；渲染只取水面和水下 pass，以及铜块材质 |
| `goodGL.html` | 整体地图 scale 太大，不适合游玩，作为世界不过关。草甸、平原、石林（尤其是拱）可以少量加入 v2（第二轮修正：平原不取，草甸作为平原的补充，见下表）。**管线和 PBR 是移植要点**：用户实测比 v2/gl 快（只有 LiqPG 的水面 / 水下 pass 比它好） | 石林 / 拱、草甸坡移植到 v2；渲染管线做成 `?r=gl` |

第二轮（用户，2026-10-26）：

| 事项 | 决定 | 落点 |
|---|---|---|
| v2 的 y 平移 | **+64**，v2 世界海平面 127 | layout.md §4 |
| 海岸 | gen.js 的沙滩太薄（每段海岸都有、只是贴着海面的一层），但它近海约 10 格的落差更合理 → v1 取 gen.js 的离岸坡度，沙滩高度 / 厚度可调，并加「海边没有沙滩」的概率参数（数据见 §1） | gen.md §4 海岸行 |
| goodGL 的草甸、平原 | 平原不取；**草甸**梯度较大、与 v2 不冲突，作为平原的补充（10-26 第二条消息修正） | gen.md §6 最后一行 |
| 宿主 B 的 `?json=` 等 URL | 以后会加，不急：所有东西先在宿主 A 上试玩 | tools.md §1、步骤 0 缩小 |
| 重点 | **goodGL 渲染器移植** | render.md、bench.md |
| 测量与经验 | renderer-refactor 的 bench、`--ref`、0 px、分 pass 计时、`shader-stats`、s08 各条经验**不能因为换管线丢掉** | bench.md（逐条对照） |
| 阴影 | 地形用软阴影，草和花要精确阴影（v2 上 DF 砍掉约 30% DDA 开销、整帧只降约 10%，大头是阴影） | bench.md §7：goodGL 的 alpha-test 阴影图 + PCSS 已满足 |
| goodGL 的缺点 | 只有三条：雾太重、水面和水下差、默认分辨率偏低 | render.md §0：雾参数默认按「去雾版」、水换 LiqPG、分辨率交给宿主 + `scale / maxMP` |
| glmod 的 spill | 后来解决了，但花了很大精力；可能是架构不如 goodGL | bench.md §6：保持 goodGL 多 program 分散的形态，新效果优先做成独立 pass |

## 1. 本包实测（2026-10-26，Node，不进游戏）

| 项 | 数字 | 结论 |
|---|---|---|
| LiqPG 地表 y（3 个种子 × 1600 块，跨约 8000 格） | 中位 63–64，99% ≈130，99.9% ≈165，**最高 181**；y ≥ 192 无任何实心方块 | 384 层里真正有内容的只有 −64…191 |
| LiqPG 洞穴空气按 y 分布 | **y < 0 占 38–41%**；y < −32 占 10–13%；y ≥ 128 不到 0.5% | 截掉 y<0 等于丢掉 LiqPG 最好的那部分洞窟 → 平移 +64 正好无损装进 0…255（layout.md §4） |
| LiqPG 生成速度 | 1600 块 4.5 s ≈ **2.8 ms/块**（单线程） | 可以放在主线程 6 ms 预算里跑，Worker 不急 |
| goodGP `column().h`（3 个种子 × 14400 列） | 中位 62，99% 111，99.9% 122–125，**最高 128–135** | ⚠ 上一轮说"山顶约 190"是按山体系数 95 估的；工作区里 `world.js:106` 现在是 `mount * pk**2 * 45`（已经压过），所以实际很少超过 128。升 256 的理由是让这个系数能调回去（`MOUNT_H`，给登山的人）、让 v2 能无损平移，不是 goodGP 现状会溢出 |
| 海岸剖面（3 个种子，沿 x 扫 400 条线，只算海岸、不算河岸） | gen.js：**每段海岸都有沙滩**，沙滩带宽中位 12 格；内陆 16 格只高出海面 3 格；**离岸 32 格水深中位 9（p75 15）**。goodGP：27% 的海岸没有沙滩，带宽中位 10；内陆 16 格高 1；离岸 32 格水深中位 4（浅水大陆架） | 用户说的"gen.js 沙滩太薄、近海 10 格落差更合理"对得上：gen.js 的落差在水下，陆上两边都很平。v1 取 gen.js 的离岸坡度（gen.md §4） |
| goodGL `column().h`（未加石林 / 浮岛） | 中位 73，99% 162，99.9% 191，**最高 237**，海平面 63 | 证实"scale 太大"：只借地貌特征，尺度按 gen.md §6 缩小 |

脚本在 `/tmp/remix/{liqy,gpy,gly,coast}.mjs`（临时文件，步骤 3 的 `genview --hist` 会取代它们）。

## 2. 约定（贯穿全包）

1. **供体原样**：供体文件逐字节复制到 `vendor/{gp,liq,gl}/`，由 `tools/vendor.mjs` 维护：清单 `vendor/VENDOR`，`--check` 报漂移，用法同 `tools/snap.mjs`。goodGP 是经典脚本，goodGL 是单文件里的函数和 `GLSL` 重赋值链，这两种由 vendor 工具**生成** ESM 包装（追加 `export` 尾巴，或按行段抽出），不手改。确实非改不可的地方：加 `// remix:` 注释，并登记到 `vendor/PATCHES.md`（文件、行、原文、理由）。
2. **行为改动优先放在包装层**：子类覆写方法（`class V1 extends World`）、注入数据（`W.grassMap = …`）、改导出的表。供体内部只允许 `// remix:` 级的一词改动，例如 `95 → this.MOUNT_H`。
3. **唯一转换层 `remix/xlate.js`**：ID 映射、y 偏移、下标布局、光照打包、群系映射、跨块写入规则、宿主 → 供体渲染帧对象，**全部写成按供体分行的数据表**，再加少量通用函数。别处不准出现 `if (donor === …)`、`<< 8`、`+ 64` 这类转换。过了 xlate，宿主侧只认宿主布局（`bidx`）和宿主方块名。
4. **群系判定改查表**：`BIO_DESERT` 这类数字比较（`gls.js:665/670`、`mobsim.js:570`）改为读 `BIOMES[b]` 的字段（`dry / snow / sapling`）。新生成器追加群系时只加表行。
5. **确定性**：同 `seed + g` 必须出同样的字节。`genview --hash` 产出逐块哈希，`old` 改造前后要 0 差异。所有截图、bug 报告、交接都只靠一条 URL（tools.md §1）。
6. **测试分工同 goalP4P5 §0.B**：自动化只做到截图和哈希；Tweakpane 上的动态项、肉眼判断（地貌好不好看、水好不好看）由人做。需要专用场景时，Agent 只列清单，由人搭好。

## 3. 步骤

| # | 步骤 | 文档 | 依赖 | 验收（自动 → 人工） |
|---|---|---|---|---|
| 0 | **宿主 B 启动参数表 `Boot`（缩小版）**：先只做生成器要的 `g / seed`，加上已有的 `tex / xyzb` 搬进表里；`t / weather / pose·gizmo / tpause / json / r` 等 goalP4P5 步骤 1 或以后再加（用户：先在宿主 A 上试） | tools.md §1 | — | `index.html?seed=…&g=v2` 进入一次性世界；同 URL 两次生成哈希相同 |
| 1 | **高度 128 → 256**：先把字面量移位全部收进 `bidx / bdec`，再改常量；`height` 改 Uint16；bwebp 头加 `h`，旧存档补齐 | layout.md §3 | — | 旧 128 存档读入后逐格相等；`old` 在 256 下哈希与 128 下的 y<128 部分一致；每块生成 + 光照耗时、内存记录在案 → 人进旧存档走一圈 |
| 2 | **pgen 骨架 + xlate + `old.js`**：抽出 `Noise / Rand / hashString` 为 ESM；`gen.js` 改 ESM（依赖注入）；`setBlockGen` 的 soft 规则表化；`gg.Terrain / BIOMES` 原地替换 | gen.md §1–3 | 1 | `?g=old` 与改造前 `gen.js` 逐块哈希 0 差异（同种子 32×32 块） |
| 3 | **工具**：`tools/genview.mjs`（由 `preview_world.mjs` 改成与生成器无关）+ `tools/genscope.html` + `pgen/mapcolors.js` | tools.md §2–3 | 2 | `genview --g old,v2` 出同种子并排图；genscope 点格子出项树、切换热力图 → 人用它调一轮参数 |
| 4 | **v2 = LiqPG**：vendor `liq/`；xlate 加 `liq` 行（平移 +64、u16 解码、轴序转置、ID 先 SUB 后 ADD、48 个群系追加）；`explain` | gen.md §5 | 2、3 | 接缝检查 4 项为 0；`--hist` 与本文件 §1 一致（平移后）→ 人进 `?g=v2` 看洞窟 |
| 5 | **v1 = goodGP + gen.js 群系**：vendor `gp/`；子类覆写 `biomeOf / decorate`；海岸取 gen.js 的离岸坡度，沙滩高度 / 厚度 / 无沙滩概率可调；程序化 colormap 替换 MC 资源图；`MOUNT_H` 可调；列级 temp/hum 落盘（world-gen.md §5.1 已确认） | gen.md §4 | 2、3 | goodGP 原版与 vendor 版同种子字节相等（不加覆写时）；接缝 0 → 人看群系渐变和登山落差 |
| 6 | **v2 调参 + goodGL 地貌**：meadow 大山频率、plains 大镂空、石林和拱（缩尺、低频、群系白名单）、goodGL 草甸坡作为平原的补充（`off` 钩子，连续遮罩） | gen.md §6 | 4 | genscope 热力图定位到具体项，再改；`genview --stats` 给出石林占陆地比例 → 人确认"少量" |
| 7 | **探针面板**：准星处的方块 id/meta、光照、群系、气候字段、tint、生成态 id；强制天气；群系色叠加 | tools.md §4 | 2 | 探针字段与 `genview` 同坐标输出一致 → 人用它回答"这里为什么是这个群系" |
| 8 | **`?r=gl`：goodGL 管线 + PBR（主线，先接宿主 A）**：R0 基线 → R0b bench 契约与工具泛化 → R1 vendor 抽取 → R2 空帧 → R3 区块 / PBR → R4 实体合成 → R5 Env→帧对象 → R6 接宿主 B + 特殊模型 → R7 设置、uniform 改宏、复测 | render.md、bench.md | 无（宿主 A 上随时可开工；R6 等 goalP4P5 步骤 2） | 宿主 A 5 机位与 `?r=v2/gl` 同机位对比；结构步骤 `--ref` 0 px；整帧墙钟写进 render.md §6 → 人看画面 |
| 9 | **水面 / 水下换 LiqPG pass**，并修 LiqPG 的已知 bug（Snell 窗口、`refract` NaN、水雾色从未赋值） | water.md | 8 | water / uw 两个机位前后截图；水下仰视无黑圈 → 人看 |
| 10 | **铜块 + 金属 / 宝石材质**：新增 8 个铜块 id、程序化贴图、PBR 材质行；修 weathered 铜的断层 | metal.md | 8；铜块 id 走步骤 4 的 ADD 流程 | 材质球截图（晴天 / 阴天 / 洞内）→ 人看 |

先后关系：**8 是主线，宿主 A 上现在就能开工**，9、10 跟在 8 后面。生成器线：0 → 1 → 2 → 3 → {4, 5} → 6；7 在 2 之后随时可做。两条线只在 R6（宿主 B 出图）汇合。

## 4. 本包不做

- LiqPG 里以后容易加的：天气七预设状态机、植被 `GRASSD / patch` 与树形、半砖 / 玻璃板 / 铁轨形状、彩色方块光、粒子、自然方块页。这些等 v2 跑通后按需从 `goodLiqPG/handover/{weather,vegetation,shapes,lights,natural}.md` 取。
- goodGL 的浮空岛、晶洞、冰刺、村庄、玩法和 UI；goodGL 的原版（无光影）回退路径。
- VoxelCraft 生成器。
- 改宿主 A 的玩法或生成器。宿主 A 只动两处：渲染器白名单改成表（加 `gl`），以及 v2/gl 补 bench 契约成员（bench.md §2–3，结构改动、0 px）。
- v2 / v2/gl 的 shader（归 goalP4P5 / goal-glmod）。
- 宿主 B 的生成器挪进 Worker：v2 实测 2.8 ms/块，先在主线程跑，等 genview 量出卡顿再说。

## 5. 命令

```
node tools/vendor.mjs [--check]                          # 供体副本同步 / 漂移检查（步骤 2 新建）
node tools/genview.mjs --g old,v2 --seed 20240607 --size 512        # 并排俯瞰 / 群系 / 切片 / 接缝
node tools/genview.mjs --g old --hash 32 > tools/out/gen/old.hash  # 逐块哈希（回归基准）
node tools/genview.mjs --g v2 --hist --stats              # 地表 y 直方图、洞穴空气按 y 分布、特征占比
open http://localhost:8765/tools/genscope.html?g=v2&seed=20240607
open http://localhost:8765/index.html?seed=20240607&g=v2
node tools/frametime.mjs --url 'http://localhost:8765/goodGL.html#auto&seed=1&rd=6' --step 'Game.step(16.7)'   # R0：goodGL 原版
node tools/bench-v2.mjs --r v2/gl --set softShadow=1 --views plain,canopy,cave,water,uw --save v2gl-r0      # R0：对照组
node tools/bench-v2.mjs --r gl --views plain,canopy,cave,water,uw --save gl0                                 # R3 起：宿主 A 上的 ?r=gl
node tools/bench-v2.mjs --r gl --ref --cmp gl0-ref                                                           # 结构步骤：参考模式 0 px
node tools/shader-stats.mjs 'http://localhost:8765/VoxelCraft.html?r=gl'                                     # 改着色器前后
```
