# 生成器 gizmo · 世界俯瞰图 / 横截面切片 / 接缝检查，及做成游戏内渲染工具

> 现有工具是 Node 命令行：`tools/preview_world.mjs`（生成器 agent 写的，纯 JS，不碰浏览器）。它直接调用 `src/world/gen/generator.js`，在 `worker_threads` 里并行生成，按引擎同样的规则合并 `outside`，再把结果画成 PNG。下面先说怎么用、每个像素是什么意思，再给出搬进游戏、做成实时渲染工具的方案。

## 0. 一页管线

```
node tools/preview_world.mjs --seed N ...
  ├─ (1) bench      单线程 generateChunk ×N（先预热 20 次）→ avg / median / p95 / max
  ├─ (5) seamCheck  13 个块正序、逆序各生成一次 → 方块差异 / outside 差异 / 合并后世界差异 / 跨块边高差
  ├─     findSpawn  出生点 + 群系 + 耗时
  ├─ (4) slices     3 条 x–y 剖面（256 宽 × 384 高）→ /tmp/world_slice0..2.png
  ├─     overview   可选：只算气候 + 样条高度（不跑 3D 噪声），大尺度看大陆 / 群系分布
  ├─     tiles      可选：多个兴趣点各裁一块 N×N 并排
  └─ (2)(3) maps    size×size 俯瞰：runRegions 分区 → worker 生成（带 1 块边距）→ 合并 outside → topColor
                    → /tmp/world_top.png（地表色 + 山体阴影）、/tmp/world_biomes.png（群系色）
```

## 1. 用法

```bash
node tools/preview_world.mjs                                    # 全套：bench 400 + seam + slices + 1024×1024 地图（seed 12345，原点居中）
node tools/preview_world.mjs --seed 42 --size 2048 --scale 1     # 换种子、扩大范围
node tools/preview_world.mjs --cx 1360 --cz 563 --size 512 --scale 2 --bench 0 --skip-seams   # 盯一个区域（坐标是方块，不是区块）
node tools/preview_world.mjs --overview 8                        # 8 格/像素 × 1024 像素 = 8192 格见方的大陆图
node tools/preview_world.mjs --tiles "cherry:135:325,meadow:65:214,ocean:-288:949" --tile-size 160 --scale 2
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--seed` | 12345 | 与游戏内"世界种子"同一个数（字符串种子在游戏里会先哈希成整数） |
| `--size` | 1024 | 俯瞰图边长（方块），向下取整到 16 的倍数 |
| `--cx` / `--cz` | 0 / 0 | 地图中心（方块坐标）；切片也用它 |
| `--workers` | `min(12, cpu−2)` | worker_threads 数；区域按 10×10 块切（tiles 按 4×4） |
| `--bench` | 400 | 计时样本数（取 √n × √n 方阵），0 跳过 |
| `--skip-seams` / `--skip-slices` / `--skip-map` | – | 跳过对应步骤 |
| `--overview` | 0 | 每像素多少格；只用 `gen.tn.climate()` + `jagTerm()`，不生成方块，很快 |
| `--tiles` | – | `标签:x:z,…`，每个点裁 `--tile-size`（默认 160）见方，最多 3 列 |
| `--scale` | 1 | PNG 放大倍数（最近邻） |

产物都在 `/tmp`。在 Claude Code 里可以直接用 Read 工具打开 PNG 看图；终端输出里还有陆地占比、高度极值和群系面积占比（降序）。

找群系坐标可以用一个更小的脚本，按螺旋扫 `biomeAt`，例如：
`for r in 0..4000 step 32, a in 0..63: biomeAt(cos·r, 80, sin·r)`。本次会话里就是这样找到 seed 12345 的 meadow (65, 214) 和 cherry_grove (135, 325)。

## 2. 每个像素的含义

### 2.1 `world_top.png`（tools/preview_world.mjs:46–74, 199–214）

`topColor(blocks, c, biome)` 从列顶往下扫：

| 遇到 | 处理 |
|---|---|
| 空气 | 跳过 |
| 水 29，或海草 / 海带（`COL = −2`） | 记一层水深 `wd++`，继续往下 |
| 草丛 / 蕨（`−3`）、藤蔓（`−4`） | 跳过，显示下面的方块（否则草原会是一片草丛色） |
| 花等其他十字 / 双格植物 | 记下第一株的颜色，最后按 0.6 混进地面色（花海可见） |
| grass_block 11 | 用群系 `grassColor`（和游戏内 tint 同源） |
| 橡 / 丛林 / 金合欢 / 深色橡树叶 | 群系 `foliageColor × 0.8`；云杉 / 白桦 / 樱花叶用固定色 |
| 其他 | `COL` 表固定色（:12–41）；表里没有的 → 品红 `0xff00ff`，一眼能看出漏色 |
| 水下 | 地面色混 `waterColor × 0.85`，系数 `min(1, 0.45 + 0.04·水深)` |

陆地再叠两层（:203–211）：
- 山体阴影：`d = (h − h北) + 0.5·(h − h西)`，亮度 `×clamp(1 + 0.08·d, 0.6, 1.25)`，光从西北来；
- 海拔泛白：`blend(白, min(0.25, (h − 64)/200·0.2))`。

原点画一个 7 像素红十字。

### 2.2 `world_biomes.png`

群系色表 `BIOME_MAP_COL`（:43–55，沿用常见 MC 地图查看器的配色），陆地按 `0.85 ± clamp((h−64)/400, ±0.15)` 明暗。

### 2.3 `world_slice{0,1,2}.png`（:364–393）

- 三条 x–y 剖面，z 分别为 `cz+8`、`cz+300`、`cz−400`，x 从 `cx` 所在块的左边 −128 起，宽 256；
- y 从 −64（图底）到 319（图顶），`scale 2`；
- 地表以上的空气画天空蓝 `0xa8c8ff`，**地表以下的空气画近黑 `0x161616`** ⇒ 洞穴、峡谷、含水层边界一目了然；水为 `0x2850c8`，矿石用高饱和色（钻石青、红石红、金黄），deepslate 层是深灰带。

### 2.4 接缝检查（:321–362）

固定 13 个区块，其中包括跨块边的成对坐标、远处丛林坐标：

| 指标 | 期望 | 代表的问题 |
|---|---|---|
| block diffs between generation orders | 0 | 生成依赖了调用顺序（共享可变 RNG / 缓存） |
| outside-list diffs | 0 | 溢出列表依赖顺序 |
| merged-world diffs | 0 | 按引擎规则正序 / 逆序合并 outside 后世界不同（树叶互相覆盖顺序问题） |
| avg \|dh\| across chunk border vs inside | 两者接近 | 地形在块边断层 |

生成 agent 交付时的结果：前三项全为 0，`generateChunk` 平均 2.73 ms（p95 3.3，max 7.2）。

## 3. 验证清单（看图时具体看什么）

| 看哪里 | 合格的样子 | 常见毛病 |
|---|---|---|
| top：海岸线 | 大陆 / 海洋成片，海岸有沙滩带，河流连续穿过陆地入海 | 河流断成小段（PV 样条阈值）；海里一格一格的陆地噪点 |
| top：高度 | 平原大致 64–75，山脉才超过 120；出现山峰类群系时 `heights max` 可到 200+（seed 12345 原点 1024² 实测 min −5 / max 160，陆地 94.9%） | 全图很平或到处尖峰（offset / factor 样条） |
| top：植被 | 森林深绿有树冠阴影，平原能看到花点，沙漠里零星仙人掌 | 块边上树冠被切直（outside 没合并） |
| biomes：分布 | 群系几百格宽，冷热过渡顺（冻洋 → 冷海 → 温海） | 碎成很多小块、沙漠紧挨雪原 |
| biomes：占比 | 终端占比与原版大致相当；山峰类只占约 1%（原版噪声本身如此） | 某个群系完全不出现（多重噪声表漏项） |
| slice：地层 | y≈0 附近 deepslate 噪声过渡带，底部基岩起伏，−55 以下洞穴里是岩浆 | 过渡是一条直线；基岩成平面 |
| slice：洞穴 | 奶酪洞的大空腔 + 面条洞细管，偶尔通到地表 | 洞穴被海水灌满（含水层规则）；地表到处是洞 |
| slice：矿石 | 煤在高处、钻石贴近底部、铜铁有大矿脉 | 分布高度不对 |
| seam | 四项见 §2.4 | 任何一项非 0 都要先修 |

## 4. 做成游戏内渲染工具（方案，未实现）

### 4.1 复用：把着色规则抽成共享模块

`COL`、`BIOME_MAP_COL`、`topColor`、`blend`、`scale`（tools/preview_world.mjs:11–83）都是纯函数，移到 `src/world/gen/mapcolors.js`，命令行工具和游戏共用一份。**引擎区块和工具用的是同一种内存布局**（`blocks[(yi·16 + z)·16 + x]`，列号 `c = z·16 + x`），`topColor(c.blocks, c, c.biomes[c])` 可以直接作用在游戏区块上，不需要转换；还可以从 `c.heightmap[c]` 开始扫，省掉从 383 往下的空扫。

### 4.2 俯瞰图层：增量更新的 2D 贴图

```js
// src/debug/gizmo.js（示意）
import { topColor, BIOME_MAP_COL } from '../world/gen/mapcolors.js';
export class MapGizmo {
  constructor(world, biomes, radiusChunks = 16) {
    this.N = (radiusChunks * 2 + 1) * 16;
    this.canvas = new OffscreenCanvas(this.N, this.N);           // 每列一个像素
    this.dirty = new Set();
    world.listeners.push({                                         // World 已经有这两个回调（world.js finishChunk / setBlock）
      chunkLoaded: (c) => this.dirty.add(c.key),
      blockChanged: (x, y, z) => this.dirty.add((x >> 4) + ',' + (z >> 4)),
    });
  }
  update(world, centerCx, centerCz, budget = 8) {                // 每帧最多重画 8 个块：一块 16×16 列，约 0.1 ms
    // 中心块变化时整体平移 canvas（drawImage 自身偏移），新露出的边全部标脏
    for (const key of take(this.dirty, budget)) { /* 256 列 topColor + 山体阴影 → putImageData 到对应 16×16 位置 */ }
  }
  draw(gui, x, y, w, player) { /* drawImage + 玩家箭头 + 区块网格 + 未加载块画棋盘格 */ }
}
```

- 开关：HUD 右上角小地图（F6）／全屏地图（`/gizmo map [半径]`），群系模式（`/gizmo biome`）用 `BIOME_MAP_COL`。
- 未加载 / 未网格化的块画棋盘格，能直接看出调度前沿（参考 `chunks.md` 的 R+1 生成圈）。
- 群系模式下再叠一层群系边界线（相邻列 biome 不同则描边），用来检查 tint 的 5×5 混合是否在边界上平滑。

### 4.3 切片层：按需生成的剖面

```js
sliceImage(world, axis /* 'x' | 'z' */, k, a0, a1) {           // 例如 axis='z', k=玩家 z，a0..a1 = 玩家 x ± 128
  // 256 × 384 次 world.getBlock ≈ 10 万次，十几毫秒，只在命令触发或玩家越过 4 格时重画
  // 颜色沿用 §2.3：地表上空气天蓝、地下空气近黑；另加两个游戏内才有的通道：
  //   光照通道：world.getLight → 天空光 / 方块光两色叠加，检查洞穴漏光
  //   网格通道：c.meshedVersion !== c.version 的块整列打红，检查重建是否卡住
}
```

- 2D：GUI 画布上显示，横轴标坐标、纵轴标 y（−64 / 0 / 63 / 128 / 320 刻度）。
- 3D：把剖面贴图放到世界里，在半透明 pass 画一个竖直四边形（宽 256、高 384，位于 `axis = k`），并在对侧画半透明遮罩。站在地形里可以直接对照"剖面上的洞"和"眼前的洞"。
- 区块边界线框（类似原版 F3+G）可以在同一个 pass 里一起画，用来对照 `outside` 溢出、tint 硬缝等块边问题。

### 4.4 游戏内一致性检查

- **重生成比对**：对已加载且 `!modified && !fromSave` 的块，在任一 worker 里用同一个种子重新 `generateChunk`，把 3×3 邻块的 `outside` 按 `applyFeatureBlocks` 规则合并后逐格比较。若有差异，说明引擎合并路径（pending 顺序、`fromSave` 跳过、存档读回）和生成器契约不一致。
- **存读档回环**：`saveChunk → loadChunk` 后比 blocks（RLE 编解码，storage.js）。
- **建世界前预览**：Generator 是纯函数，`runRegions` 的 worker 代码可以原样搬进 Web Worker，在"创建世界"界面输入种子时实时出一张 256×256 俯瞰图（实测 Node 里 1024² 地图 3.6 s 墙钟：含 1 块边距共生成 6084 块，worker 内 4.6 ms/块，约 9 核并行；256² 约为 1/16）。

## 5. 已知限制

- `--overview` 只用气候噪声和样条高度，没有 3D 密度、洞穴、地表规则，不能代表实际地表（高度是 `−64 + 128·(1.5 + offset + jag)` 的近似）。
- 俯瞰图只显示最上层，树冠下的地面和水下植被看不到；需要"去树冠"模式时，可在 `topColor` 里把树叶也当成 `−3` 跳过。
- 切片是固定的三条 z，没有命令行参数改 z；要看指定位置时改 :366 的 `zs` 或用 `--cz` 平移。
