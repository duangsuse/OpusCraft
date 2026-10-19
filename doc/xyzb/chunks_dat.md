# 世界文件格式 · `bwebp`（`bw_<name>.webp`）现状与优化建议

> 来源：`bwebp.js`（203 行，`c_BW` / `bwebp` 单例）、`index.html` `c_Save` / `Save`（L3028）、`Scheduler`（L527）、`World.stored`（L1089）。
> 结论先行：**压缩效能已经够好（64 区块 ≈ 68 KB deflate / 55 KB brotli），不建议再折腾编码**；要改的是"**存了什么**"与"**版本演进方式**"。
> 决策见 §5（已评审）。

## 1. 文件长什么样

```
┌──────────────────────────────┐
│ cover.webp  (RIFF … WEBP …)  │  ← 可为空。图片解码器只读 RIFF 头里的长度，后面的字节被当作不存在
├──────────────────────────────┤  ← split(): 8 + RIFF.size (+1 奇数补齐)；u8[0]=='\b' 则无封面
│ \b<len>:  record 0  JSON head│  ← UTF-8；见 §1.1
│ \b<len>:  record 1  'xz'     │  ← Int32[cx, cz] × n（小端，直接 .buffer）
│ \b<len>:  record 2  'b'      │  ← 每区块：[palSize-1 u8][palette u8…][bit-packed 索引, ceil(log2 pal) 位, LSB 先]
│ \b<len>:  record 3  'm'      │  ← 同上（meta）
│ \b<len>:  record 4  'bio'    │  ← Uint8 256 / 区块，(z, x) 序
└──────────────────────────────┘
```

- **帧格式** `"\b" + 十进制字节数 + ":" + bytes`：`records()` 生成器顺序切片；文本长度前缀让 `headOf()` 不解压就能读 head（标题页预览只取封面 + head）。
- **列压缩**：record 1..k 各自过 `CompressionStream(head.enc)`；`enc ∈ {deflate, brotli(>50 MB 未压缩列时), raw(unload 同步保存)}`。
- **体素序**：文件内 `yzx`（y 最外、x 最快，层状数据压得好）；内存 `bidx = x<<11 | z<<7 | y`。`yzx()/native()` 只做位重排。
- **封面**：`Save.capture()` 把 GL 画面 + 半透明热栏画到 canvas → webp（q 0.85）；下载副本再用 `stamp()` 盖 logo，**payload 不动**。

### 1.1 `head`（record 0）

```jsonc
{ "v": 3, "enc": "deflate", "order": "yzx", "cols": ["xz","b","m","bio"], "n": 64,
  "tiles": [[chunkIdx, yzxIdx, { type: "furnace"|"chest"|"spawner", … }]],   // tile 实体整个 JSON 内联
  "cover": { "w", "h" } | null,
  // ↓ Save.head() 拼进来的"游戏头"
  "seed", "time", "day", "mode", "raining", "thunder",
  "player": { x,y,z,yaw,pitch, health,hunger,saturation, inventory[36], hotbar, spawn, flying },
  "bbat": BBat.lib }                                                            // 整个方块组库每存档复制一份
```

### 1.2 哪些区块进文件

`chunks()` = 内存中 `modified` 的区块 ∪ `world.stored`（卸载但改过、专为持久化保留）。未改动的区块**不存**，靠 seed 重生成。加载时 `fill()` 把区块放回 `world.stored`，玩家走近时取出、状态回退到 `CH_GENERATED` 重新算光、建网格。

### 1.3 存 / 不存一览

| 数据 | 存？ | 说明 |
|---|---|---|
| blocks / meta / biomes（改过的区块） | ✅ | palette + bit-pack + deflate |
| tile 实体（熔炉进度、箱子 27 格、刷怪笼类型） | ✅ | head.tiles JSON |
| 玩家（位置/朝向/血饥饱/背包/出生点/飞行） | ✅ | head.player |
| 时间 / 天气 / 模式 / seed | ✅ | head |
| BBat 方块组库 | ✅ | 每个存档一整份 |
| 光照 sky / blk | ❌ | 加载时重算（缓存，不是数据源，**正确**） |
| 高度图 / 网格 | ❌ | `recomputeHeights()` 重算 |
| **生物 Mobs.list** | ❌ | 读档后全部消失，剪过毛的羊、跟随的动物都丢 |
| **实体 Entities（掉落物 / 箭 / 点燃的 TNT）** | ❌ | 掉在地上的物品读档即蒸发 |
| **Scheduler 待执行 tick（流体 / 下落 / 火）** | ❌ | 正在流动的水读档后**冻结**，直到邻居再变化 |
| 未生成区块的 pendingFeatures（跨块树冠） | ❌ | 由生成器重放 |
| XRay 对比基准 | ❌ | 调试态，不该存 |

## 2. 现状评价

**好的地方（保留）**
- 封面即文件、文件即图片：发给别人一张图就是存档；标题页不解压只读 head。
- 列式 + 每区块 palette：一个只有 3 种方块的区块 2 bit/格，deflate 前就缩 3.4×；再 deflate 比裸 YZX 还小 4%。
- `enc:'raw'` 同步路径让 `beforeunload` 也能存；`split()` 对 RIFF 奇数补齐处理正确。
- 列表 `c_BW.cols` 是声明式的 `[name, encode, decode]`，加列只要加一行。

**不优雅的地方**
1. **版本检查过严**：`String(head.cols) !== String(c_BW.cols…)` 要求列名序列逐字相同——加任何一列都让旧文件读不了，而不是"缺的列用默认值"。
2. **head 承担了两种角色**：既是格式描述（v/enc/cols/n/tiles），又是游戏状态（player/bbat）。`bbat` 库每个存档复制一整份，和世界无关却随世界走。
3. **瞬态对象没有去处**：mobs / entities / 定时 tick 三类"活物"都没槽位，不是格式放不下，是没人写它们的 encode。
4. **`xz` 列直接 `Int32Array.buffer`**：依赖平台小端（浏览器全是小端，实际无害，但和其它列"自描述"的风格不一致）。
5. **tile 内联在 head**：箱子多了 head 会变胖，标题页 `headOf()` 要解析全部箱子内容才能拿到 `cover.w/h`。

## 3. 建议（按改动量从小到大）

### 3.1 读档即恢复流体（零格式改动）

`fill()` 之后、区块被取出进入 `CH_GENERATED` 时，对 `meta ≠ 0` 的 water/lava 格和 `gravity` 方块下方为空的格 `Scheduler.add()` 一次。只在被还原的区块上做（`world.stored` 来源），成本可忽略；流动中的水不再"冻住"。

### 3.2 松开版本门：列按名字可选

```js
// headOf(): 只要求 v 相同、'xz'/'b'/'m' 存在；其它列缺失 → decode 跳过（chunk 字段保持构造默认值）
const need = ['xz', 'b', 'm']; if (head.v !== c_BW.v || need.some(n => !head.cols.includes(n))) throw …
// fill(): 按 head.cols 的名字找 decoder，而不是按位置
head.cols.forEach((name, j) => c_BW.byName[name]?.[2]?.(arrays[j], cs));
```
这样 3.3 / 3.4 加列都**不用升 v**，旧文件照读。`v` 只在体素编码（palette 格式、yzx 序）变化时才升。

### 3.3 新增 `ent` 列：生物 + 实体（JSON，压缩后几百字节）

```jsonc
// record 'ent'（JSON → UTF-8 → 和其它列一样 deflate）
{ "mobs": [ { "t": "sheep", "p": [x,y,z], "yaw", "hp": 7, "c": "pink", "sh": 1, "rg": 800 } ],   // 只存 spawnMob 后会被改写的字段
  "items": [ { "p": [x,y,z], "v": [vx,vy,vz], "s": { name, count, dur?, v? }, "age" } ],
  "tnt":   [ { "p", "v", "fuse" } ],
  "arrows": []  /* 建议不存：插在墙上的箭价值低，飞行中的 0.5 s 后落地 */ }
```
- **存全部**而不是"FoV 内"：`Mobs.list` 上限 14 + 26，`Entities` 掉落物通常 < 100，JSON 压缩后远小于一个区块；按 FoV 筛选反而引入"读档后背后的牛没了"的不一致。
- 读档：`Game.start()` 里 `Mobs.clear(); Entities.clear()` 之后、首批区块就绪后再 `spawnMob/spawnItem` 回放（否则落在未生成区块里会掉出世界——用 `world.stored` 里的区块坐标判断，不在已存区块范围内的实体延迟到该区块 `CH_LIT` 再放）。
- 存档：`Save.head()` 不动，`c_BW.cols` 加一行 `['ent', encodeEnt, decodeEnt]`。

### 3.4 `sched` 列（可选，3.1 做了就不必）

若想精确恢复火的 age 倒计时、TNT 连锁等，把 `Scheduler.buckets` 展平成 `[x, y, z, tickLeft, type]` Int32 列即可。流体靠 3.1 已足够，火/下落本来就是随机过程，**不推荐**。

### 3.5 head 瘦身：把 `tiles` 和 `bbat` 各移成一列

- `tiles` → `'tile'` 列（JSON）；head 只留格式字段 + `player/seed/time`，标题页解析更快。
- `bbat` → `'bbat'` 列，**可选**：同一个库在多个存档里重复，可以加 `head.bbatHash`，读档时若与本地库 hash 相同就不解析。
这两条只是整洁度，收益小，排在最后。

### 3.6 不建议做的

- **增量存档（只存与生成不同的格）**：现有 XRay 的 `pg`（ghost = 仍等于生成值）已经能算出 delta；轻改区块能从 ~1 KB 缩到几十字节。但它把存档正确性绑死在 `gen.js` 的确定性上——改一次噪声参数就让所有旧档"长出"新地形。当前规模下不值得，**除非**将来要做分享/多存档同步。
- **保存光照列**：4 bit 数据压缩后很小，但它是缓存；重算一次 48×48×128 BFS 的代价在加载阶段可接受，且 v2 渲染器以后可能自己维护光照。
- **换容器（zip / 自定义二进制）**：webp 尾巴方案的"文件即图片"是产品特性，不是技术债。

## 4. 与 `meta.md` 的关系

`meta.md` 定义的 id + meta 位域直接落在 `b` / `m` 两列，格式无需变化：meta 高 4 位被用起来后 palette 大小自然增加，bit-pack 自动适应。若将来 `BlockTable` 的 id 分配变化（增删方块），需要 head 里带一张 **`ids: [name…]` 名字表**（≈1 KB）做读档时的 id 重映射——这是比 `v` 更重要的前向兼容手段，建议在 3.2 时一并加上。

## 5. 决策（已评审）

| # | 事项 | 决定 | 理由 / 备注 |
|---|---|---|---|
| D1 | 读档后流体冻住（§3.1） | **做，优先级最高** | 真实可感知的 bug；零格式改动，只在 `world.stored` 还原的区块上补 `Scheduler.add` |
| D2 | head 带 `ids: [name…]` 名字表（§4） | **做**，与 D3 同批 | 提升**自包含性**：读档按名字重映射 id，方块表增删、换新版贴图/资源包后旧档仍成立，甚至能让旧档里的格子接上新加的方块定义 |
| D3 | 列按名字可选、缺列默认（§3.2） | **做** | D2 / D4 / D5 的前提；`v` 只随体素编码变化 |
| D4 | `bbat` 独立成列 + `bbatHash` 跨存档去重（§3.5 后半） | **做** | 方块组库是跨世界资产，不该随每个存档复制一份 |
| D5 | `ent` 列：全部 mobs + 掉落物 + TNT（§3.3） | 做，排在 D1–D4 之后 | 不按 FoV 筛；箭不存；回放等所在区块 `CH_LIT` |
| D6 | `tiles` 移出 head（§3.5 前半） | 顺手做，不单独立项 | 属于经验教训（head 该只放格式字段），当前规模没有实际痛点 |
| D7 | `sched` 列、增量存档、保存光照、换容器 | **不做** | 见 §3.4 / §3.6 |

实施顺序：D1 → D3+D2 → D4 → D5 → D6。D3 之前不要加任何列。
