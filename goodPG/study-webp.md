# bwebp 存档系统：跨实现经验、代码待修、文档待修

> 范围：`bwebp.js`（B）与 `doc/xyzb/chunks_dat.md`（B 文档）。
> 对照实现：A `VoxelCraft.html` localStorage、C `goodGP/js/save.js`、D `goodLiqPG/src/game/storage.js`、E `goodPG/src/shared/sim/store.ts`（TS 服务端/本地双形态）。
> 行号基于当前工作树；标注 `[INFERENCE]` 的是由代码算术得出、未做运行时测量。

---

## 0. 结论

1. **B 的格式定位是对的，不要改成 delta**：单文件归档 + 整个 modified 区块 + palette/bitpack/deflate，是五个实现里唯一同时做到“可携带、可预览、压缩好”的。代价是**每次保存必须重写所有已存区块**——这是单文件快照的固有成本，不是 bug。
2. **B 最危险的是“快照不一致 + 导入不校验”**：`dump` 在压缩 `await` 之后才序列化 head，而 head 持有 `inventory/bbat/tiles` 活引用；坏文件又会在 `world.reset()` 之后才炸。
3. **B 文档有多处会把实现带偏**：`L3028` 行号、`加列只要加一行` 与自己的版本门自相矛盾、`ent` 体积/实体上限、`world.stored` 回放时机、`pg` 符号、`ids` 只覆盖方块等。
4. 修复顺序：**快照 → 校验 → tile 脏标记 → brotli 回退 → fallStart**；文档先改“与代码直接矛盾”的 9 条，再谈 D2–D6 的格式演进。

---

## 1. 五个实现给 B 的经验

### 1.1 一张表

| 经验 | A VoxelCraft | B bwebp | C goodGP/js | D goodLiqPG | E goodPG |
|---|---|---|---|---|---|
| 存储单位 | 逐格 delta | 整个 modified 区块 | 整个 modified 区块 | 整个 modified 区块 | 逐格 delta |
| 压缩 | 无 | palette+deflate/brotli | 仅 RLE | 仅 RLE | 无 |
| 多世界 | ❌ 单槽 | ✅ seed 槽 | ✅ IDB | ✅ IDB | ✅ room/维度 |
| 实体 | ❌ | tile 在 head | ✅ mobs+BEs | ✅ 仅 BEs | ✅ players/containers/mobs |
| 版本/迁移 | v1 | v3 严格 | ❌ | ❌ | ✅ `blockFormat` |
| 卸载保存 | ✅ 同步 | ⚠ async | ⚠ async | ⚠ async | ✅ 服务端同步 / 本地 async |
| 可携带 | ❌ | ✅ 单文件 | ❌ | ❌ | ❌ |

### 1.2 逐条经验

1. **单文件 = 全量快照，别假装增量。**  
   B 的 `fill()` 把所有读档区块置 `modified=true`（`bwebp.js:107`），下次 `chunks()` 会把它们全部重编码。这不是浪费，而是**必要**：B 每次保存会覆盖旧文件，如果跳过未改区块，旧文件里的历史编辑就永久丢了。  
   → 优化只能来自“压缩更好 / 保存更少 / head 更瘦”，不能来自“跳过区块”。

2. **分区块存储才有增量。**  
   C 的 per-chunk IDB 可以让 `modified` 只覆盖真正改过的区块；D 却把读档区块置脏且保存后不清（`world.js:248, 361-366`），于是每分钟重写所有加载区块——这是 D 的最大性能问题。  
   → 若 B 将来改成“每区块一行”的容器，才适合做 dirty-only；单文件 `.webp` 不适合。

3. **快照必须原子。**  
   B 的 `columns()` 先取 `head`（含活的 `player.inventory`、`BBat.lib`、tile 对象）和列数据，再 `await` 压缩（`bwebp.js:100, 116-119`），最后 `file()` 才 `JSON.stringify(head)`（`:113`）。压缩期间游戏继续跑（`index.html:3767` 的自动保存不 await），于是**列是旧状态、玩家/BBat/熔炉是新状态**。  
   → 在 `await` 之前把 head 序列化成字符串（或 `structuredClone`），`file()` 只接收已冻结的 head。

4. **失败必须可见。**  
   - A 用同步 `setItem`，失败保留旧档（只是 `console.warn`）。  
   - C 在 DB 写之前就清 `modified`/`dirtySaved`（`game.js:185-187`），失败即丢。  
   - D 的 `saveChunk` `.catch(warn)` 后 resolve（`storage.js:82`），调用方以为成功。  
   - E 的本地 `IdbStore.commit` 在 `onerror/onabort` 也 resolve（`idbStore.ts:80-84`），并提前清空 pending。  
   → B 的 `dump`/`put` 失败路径要返回错误，且**不要先清任何状态**。

5. **版本要么严格，要么可迁移；不要两者都没有。**  
   E 是唯一有真正迁移的（`store.ts:105-159`：v1/v2→v3、容器键迁移）；B 是严格 v3（`bwebp.js:57`）；C/D 没有 chunk 版本。  
   → B 的“v 只随体素编码变化”只有在**列名/head 字段的兼容规则**写清楚后才成立；D4/D6 是 head schema 变化，不能悄悄塞进同一个 v。

6. **实体/瞬时状态决定“读档像不像原世界”。**  
   E 覆盖 players/containers/passive+named mobs/坐骑/村民/装备（`Entities.ts:552-590`），C 覆盖 persistent mobs + BEs；B 只有 tile；A/D 更少。  
   → B 的 `ent` 列值得做，但字段要覆盖 `spawnMob` 的 AI 状态，不能只存 `{t,p,yaw,hp}`；掉落物还要 `pickupDelay/onGround/age`。调度队列（流体/火/下落）另立 `sched` 或至少读档时重建。

7. **delta 与整区块是两种正确性模型。**  
   A/E 存“相对生成器的改动”，稀疏最省，但换生成器/噪声就错位；B/C/D 存“改过的完整区块”，生成器变化不影响已存区块。  
   → B 保持整区块模型；不要为了省空间改 delta。若要做“增量”，应该做“新增列/压缩”，而不是改索引语义。

8. **head 应该只放格式 + 小型状态。**  
   B 把 `tiles`、`bbat` 都放 head，且 head **完全不压缩**（`bwebp.js:113`）。一个 16K 格的 BBat 组 base64 就约 43 KB `[INFERENCE: 16384×2 B×4/3]`；`tiles` 里的箱子 27 格也会膨胀。  
   → 至少先把 head 用同一 `enc` 压成一条 record；更进一步把 `tile`/`bbat` 移成列（D6/D4）。

9. **可携带是 B 的护城河。**  
   C/D/E 都绑 IDB/SQLite，A 绑 localStorage；只有 B 能“发一张图就是存档”。  
   → 任何格式演进（head 压缩、列增加、实体列）都必须保住“单文件 + 封面 + 旧 v3 可读”或明确 v4 迁移。

10. **卸载路径要诚实。**  
    A 同步写；E 服务端同步、本地 flush+commit；B 的 `dumpSync` 只同步编码，`Save.put` 仍是异步 IDB，而且 `beforeunload` 与 `pagehide` 各调一次（`index.html:3121, 3788, 3794`）。  
    → 文档应写“best-effort 同步编码”，不要暗示“关页一定存成功”；代码可合并成一次 handler，并接受 IDB 无法同步完成的事实。

11. **服务端权威是另一种质量维度。**  
    E 的同一 `GameServer` 跑 Cloudflare SQLite 和本地 IDB，玩家/容器/生物都在服务端；B 是纯客户端。  
    → B 不需要变成服务端，但可以借鉴 E 的 `ServerStore` 分层：`file/columns/head` 与“游戏状态编码”解耦，方便以后换容器。

---

## 2. B 代码待修问题

### P0：数据正确性

#### 2.1 `dump` 不是原子快照

- 证据：`columns()` 生成 `head`（`bwebp.js:100`），其中 `player.inventory`、`bbat`、`tiles` 来自 `Save.head()` 的活引用（`index.html:3083-3086`）；随后 `await Promise.all(...)` 压缩（`bwebp.js:118`），最后由 `file()` 才 `JSON.stringify(head)`（`:113`）。
- 影响：自动保存/分享期间玩家拾取、BBat 捕获、熔炉/箱子变化，会得到“区块旧、head 新”的混合存档；读档后玩家可能站在已被回退的方块里。
- 修法：`columns()` 里立即 `headJson = JSON.stringify(headWithCover)`，`file()` 接收 `headJson`；或 `structuredClone(head)`。`dumpSync` 已经是同步，无需改。

#### 2.2 导入不校验，且错误发生在 `world.reset()` 之后

- 证据：`fill()` 直接信任 `head.n`、`xz` 长度、`head.tiles` 下标（`bwebp.js:104-106`）；`loadData` 只包了 `bwebp.load`，没包 `Game.start → data.fill`（`index.html:3124, 3669-3673`）。
- 影响：`head.n=1e9` 可 OOM；`xz` 短会造出 NaN 区块；tile 下标越界会抛错；此时世界已经被 `world.reset()` 清空，游戏半启动。
- 修法：在 `load()` 返回前校验：
  - `Number.isInteger(head.n) && head.n >= 0 && head.n <= MAX_CHUNKS`；
  - `arrays.length === c_BW.cols.length`；
  - `arrays[0].byteLength === head.n * 8`；
  - `head.tiles` 是数组，`k < head.n`，`i` 在 `[0, CHUNK_VOL)`；
  - 失败时 `throw`，`Game.start` 捕获后保持旧世界。

#### 2.3 tile-only 变更不落盘（箱子战利品可刷）

- 证据：`world.setTile` 会 `c.modified=true`（`index.html:1188`），但箱子槽位是直接改 `tile.slots`（`index.html:2611, 2727`）；卸载时只存 `c.modified` 的区块（`:1274`）；`bwebp.chunks()` 只看 `modified`/`stored`（`bwebp.js:97`）。
- 影响：天然结构里的箱子 `setTileGen` 不置脏；拿走物品后若没有别的方块改动，区块既不进 `stored` 也不进 `saved`，读档战利品重置，可反复刷。文档 §1.3 的“tile 实体 ✅”不成立。
- 修法：任何容器槽位变化（或关闭容器时）把所在 chunk 置 `modified=true`；刷怪笼 `cooldown` 同样处理，或统一走 `world.setTile(...)` 重写一次。

#### 2.4 brotli 依赖 CDN，且无回退

- 证据：`big` 时 `head.enc='brotli'`（`bwebp.js:117`），实现来自 `index.html:301-335` 的 jsdelivr 模块；`new CompressionStream('brotli')` 原生不支持。
- 影响：离线/CDN 被墙时，超过 `50<<20` 的世界保存直接失败；自动保存只弹一次 `Save failed`，随后继续失败。
- 修法：先探测 `CompressionStream('brotli')` 是否可用；不可用则 `head.enc='deflate'`。压缩阶段 `try/catch`，失败后用 deflate 重压所有列（不能只换一部分，`head.enc` 统一）。

#### 2.5 读档不重置 `fallStart`

- 证据：`Player.reset(pl.spawn || ...)` 把 `fallStart` 设为出生点高度（`index.html:3676` 调用；`Player.reset` 在 `:1691`），随后只覆盖 `x/y/z`（`:3677`）。
- 影响：出生点高于存档位置时，首帧可能按旧高度结算摔落伤害。
- 修法：读档分支里 `player.fallStart = pl.y; player.vy = 0;`，必要时 `onGround=false`。

### P1：性能 / 健壮性

#### 2.6 head 完全不压缩

- 证据：`file()` 直接 `record(te.encode(JSON.stringify(head)))`（`bwebp.js:113`）；`bbat`、`tiles`、`inventory` 全在里面。
- 影响：`bbat` 可到几十 KB/组，`tiles` 多时更大；文档“68 KB”只覆盖 blocks+meta 列，完整文件可能被 head/封面主导。
- 修法：把 head 作为一条压缩 record（新增 `headEnc` 或在 v4 固定用 `head.enc`），或把 `tile`/`bbat` 移成列。

#### 2.7 `chunks()` 是 concat，不是集合

- 证据：`[...w.chunks.values()].filter(modified).concat([...w.stored.values()])`（`bwebp.js:97`）。
- 影响：正常流程下 `modified` 与 `stored` 互斥；一旦 `fill` 与 `scan` 的交错/自定义 sink 破坏不变量，同一 key 会出现两次，`n` 与 tile 索引膨胀，`fill` 创建重复区块后 last-wins。
- 修法：用 `Map<key, Chunk>` 去重后再取 values；或在 `chunks()` 中断言 key 唯一。

#### 2.8 `unpack` 静默损坏

- 证据：`pal[k]` 越界写进 `Uint8Array` 变 0；`u8[o++]` 越界读成 `undefined`（`bwebp.js:80-86`）。
- 影响：截断/篡改文件静默变成空气或错误方块，不报错。
- 修法：校验 `k < size`、`o + bytes <= u8.length`、palette 长度；失败抛错。

#### 2.9 `saveSync` 不是“同步保存”

- 证据：`dumpSync` 同步编码（`bwebp.js:122`），但 `Save.saveSync` 的 `put` 是异步 IDB（`index.html:3121`）；`beforeunload` 与 `pagehide` 都调 `unloadSave`（`:3788, 3794`）。
- 影响：关页时可能只完成一部分写入；两次 handler 重复写同一 blob。
- 修法：合并成一个 handler；文案改为“best-effort”；若必须更可靠，考虑 `visibilitychange` 时提前 `dumpSync`/`put`，而不是只靠卸载。

#### 2.10 `pendingFeatures` 不落盘

- 证据：`world.pendingFeatures` 只在内存（`index.html:1090`）；`bwebp` 的 head/列没有它；文档 §1.3 说“由生成器重放”。
- 影响：如果源区块 `modified` 被保存，读档不会重新生成它，目标区块再生成时也无人重放；跨块树冠/结构边缘会丢。
- 修法：加 `pend` 列（按 chunk key 的 `[lx,y,lz,id,meta,soft]` 列表），或把 pending 写进 head；或者确保源区块总是可重新生成（与 delta 模型的取舍）。

#### 2.11 `load()` 解析 head 两次

- 证据：`load()` 先 `headOf`（`bwebp.js:132`），`cover()` 里又 `headOf`（`:127`）；`cover` 即使 `keep=false` 也先 `slice` 封面（`:128`）。
- 影响：`bbat`/`tiles` 大时，标题预览/读档多一次 JSON 解析和一次封面拷贝。
- 修法：`load()` 把已解析的 `head`/`end` 传给 `cover`；`cover(keep=false)` 不 slice。

#### 2.12 `paste` 选“最小”的有效文件

- 证据：`[...files].sort((a,b)=>a.size-b.size)` 后取第一个 `has()` 为真的（`bwebp.js:196`）。
- 影响：粘贴多个合法存档时，导入的可能是最旧的/最小的检查点，而不是用户意图的最新文件。
- 修法：优先第一个（或按修改时间）；至少把规则写进 UI 文案。

#### 2.13 `objectURL` 泄漏

- 证据：`cover()` 每次创建 `URL.createObjectURL`（`bwebp.js:128`）；`Save.capture` 也创建；`Save.remove` 删除 `shots` 但不 revoke。
- 影响：长时间切换存档/多次捕获会积累内存。
- 修法：替换 shot 时 revoke 旧 URL；`Save.remove` 同步 revoke。

#### 2.14 8-bit 方块 id / 7-bit y 的格式上限

- 证据：`slot = new Int16Array(256)`、`out[0] = pal.length - 1`（`bwebp.js:67, 74`）；`yzx()` 固定 `i & 127`、`i >> 11`（`:62`）；`Chunk.blocks` 是 `Uint8Array`（`index.html:1063`）。
- 影响：方块表一旦超过 255 个 id，或世界高度不再是 128，格式静默截断/错位。
- 修法：在文档和 `head` 里写死上限；达到上限必须升 v；`ids` 表只解决重映射，不解决容量。

### P2：细节

- `head.cover` 在 `shot.u8` 是空 `Uint8Array` 时仍为真（`bwebp.js:112`），但 `cover()` 因 `end <= 0` 返回 null；元数据与内容不一致。
- `headOf` 对 cols/order 不匹配也报 `unsupported world format v${head.v}`（`:57`），诊断误导。
- `bwebp.js:12` 顶部注释“this.world = gg.world”与实际的 getter（`:32-35`）不符。
- `index.html:251` 把 `<input>` 嵌在 `<button>` 里，是无效交互内容嵌套；`focus()` 里 `pick.click()`（`bwebp.js:167`）在部分移动浏览器不可靠。
- `dump` 的 `big` 只按 blocks+meta 计算（`bwebp.js:117`），head/cover 不参与；大 head 时 brotli 不一定划算。

---

## 3. B 文档待修问题（`doc/xyzb/chunks_dat.md`）

### 3.1 与当前代码直接矛盾（优先改）

| 位置 | 现文/问题 | 应改 |
|---|---|---|
| 开头来源行 | `index.html c_Save / Save（L3028）` | `c_Save` 在 **3042**，`Save` 在 **3047**；3028 是 HUD 的 `drawBars` |
| §2 “好的地方” | “列表 `c_BW.cols` … 加列只要加一行” | 与同节“版本检查过严”自相矛盾。当前 `headOf` 要求 `cols` 逐字同序（`bwebp.js:57`），`fill` 固定 `arrays[0]` 是 `xz` 并按位置解码（`:104-105`）；加列必须先做 §3.2 |
| §3.2 示例代码 | `c_BW.byName[name]` | 该表不存在；需先建 `Object.fromEntries(cols.map(c=>[c[0],c]))` |
| §3.2 `headOf` 检查 | 只查 `v` + `xz/b/m` | 还必须校验 `head.order === 'yzx'`（`native()` 依赖它）；否则会按错误顺序解码 |
| §3.2 `fill` 说明 | “按名字找 decoder” | 仍要先从 `xz` 建 chunk，并校验 `arrays.length`/`xz.length`；`xz` 的 decoder 是 `null`，不能只靠 `byName` 循环 |
| §3.3 标题与正文 | `ent` 列“JSON，压缩后几百字节”“远小于一个区块” | 单区块压缩后约 **68 KB/64 ≈ 1.06 KB**；40 mob + 100 item 的 JSON 是数 KB。且 **head 不压缩**（`bwebp.js:113`） |
| §3.3 实体上限 | “Mobs.list 上限 14 + 26” | 只是刷怪阈值：passive<14（`mobsim.js:132`）、hostile<26（`:148`），刷怪笼允许 `hostile>30`（`:172`），刷怪蛋/命令无上限 |
| §3.3 回放时机 | “用 `world.stored` 里的区块坐标判断” | `scan` 会把近处 stored **取出并 delete**（`index.html:1283-1284`）；回放时已不含它们。应使用 `head` 里的 xz 集合或 `XRay` 式 `map` |
| §3.6 | “XRay 的 `pg`” | 代码没有 `pg`；是 `XRay.gen/ref/diff`（`index.html:1374-1418`） |
| §1.3 表 | “tile 实体 ✅” | 只对 `modified` 区块成立；箱子槽位直接改 `tile.slots`，不置脏（`index.html:2611, 2727`），读档可能重置战利品 |
| §1.3 表 | “pendingFeatures ❌ 由生成器重放” | 仅当源区块未修改时成立；源区块被保存后不会重新生成，pending 丢失 |

### 3.2 口径/量化需要修正

| 位置 | 问题 | 建议 |
|---|---|---|
| §1 / §2 | “64 区块 ≈ 68 KB deflate / 55 KB brotli” | 这是 **blocks+meta 列**的测量，不含封面 WebP、未压缩 head、`bbat`/`tiles`；文档应明确“不是文件总大小” |
| §2 | “deflate-9” | `CompressionStream('deflate')` 不设 level；brotli shim 也没固定 quality；68/55 KB 是基准数据，不是运行时承诺 |
| §3.3 | 字段示例 `{t,p,yaw,hp,c,sh,rg}` | `spawnMob` 初始化约 30 个字段（`mobsim.js:110-111`）；示例缺 `vx/vy/vz/state/stateTimer/fuse/age/onGround/inWater/steerCd/attackCooldown/fire` 等，回放只恢复 7 个字段会得到“站着不动的羊” |
| §3.3 | items 示例 | 实际 `spawnItem` 还有 `pickupDelay/onGround/age/w/h`（`index.html:2829`）；回放要按 `CH_LIT` 后再 spawn，否则光照烘错 |
| §4 | `ids` “≈1 KB” | 方块名表通常 3–5 KB（未压缩）；且 `bio` 列是**群系 id**（`bwebp.js:93`），同样需要名字表 |
| §3.6 | “重算一次 48×48×128 BFS” | `Lighting.initChunk` 只填 16×16×128 并从 3×3 邻居取种子（`gls.js:35-70`）；“48×48×128 BFS”是上界，不是实际遍历量 |
| §3.1 | “成本可忽略” | 扫描 24 个区块 × 32768 格约 80 万次；只调度 `meta≠0` 时通常可忽略，但大水体/大量流动格要受 `Scheduler` 预算约束 |

### 3.3 计划自身的漏洞

| 位置 | 问题 | 建议 |
|---|---|---|
| §3.2 “缺列用默认值” | `bio` 缺列时 `Chunk.biomes` 是 0（`index.html:1065`），不是生成器默认群系 | 要么要求 `bio` 必填，要么缺列时按 `Terrain` 重算 |
| D1 `meta ≠ 0` | 只调度流动水/岩浆；**源头水（meta 0）** 在边界处也可能需要重新扩散 | 至少对“液体且邻接空气/非液体”的格也调度一次，或全部液体格 + 预算 |
| D2 `ids` | 只覆盖方块；`bio`、meta 位域、容器/实体类型也应考虑 | 加 `bioIds`；明确缺失名字的回退（空气/保留 id/报错） |
| D2 | “旧档仍成立” | `ids` 不能追溯修复 D2 之前已写入的数字 id；只能保证 D2 之后的档 |
| D3 vs D4/D6 | “v 只随体素编码变化”，但 D4 把 `bbat`、D6 把 `tiles` 移出 head 是 **head schema 变化** | 要么用列存在性做 capability 探测并写清两套布局，要么把这些变更统一升 v4 |
| D4 `bbatHash` | `BBat.lib` 的 `id` 是 `Date.now()+rng`（`index.html:2461`） | hash 必须基于“排除 id 的内容”做规范化，否则独立捕获的相同结构无法去重 |
| §3.3 `ent` 回放 | “等所在区块 `CH_LIT` 再放” | 需要一个 `savedChunks` 集合 + `onChunkLit` 钩子；`world.stored` 会被 `scan` 消耗，不能当持久集合 |
| §1.3 `bbat` | “每个存档一整份” | 文件上确实复制，但运行时是全局 `localStorage` + `merge`（`index.html:2421-2425`）；删除/改名不跨档同步，D4 的“去重”要说明这一点 |

---

## 4. 修复顺序与验收

### 4.1 代码（B）

1. `dump`：`await` 前序列化 head（P0-1）。
2. `load`/`fill`：边界校验，`Game.start` 捕获失败（P0-2）。
3. `setTile`/容器槽位变更置脏（P0-3）。
4. brotli 探测 + deflate 回退（P0-4）。
5. 读档 `fallStart=y`（P0-5）。
6. head 压缩 / `tile`+`bbat` 列（P1-6）。
7. `chunks()` 去重、`unpack` 边界、卸载 handler 合并（P1-7/8/9）。
8. `pendingFeatures` 列（P1-10）。
9. `load` 只解析一次 head、`paste` 选第一个、URL revoke（P1-11/12/13）。
10. 文档化 8-bit id / 7-bit y 上限（P1-14）。

### 4.2 验收

- **快照**：在 `dump` 压缩期间移动/拾取/改 BBat，读档后 head 与列都对应保存开始时刻。
- **坏文件**：`n=1e9`、`xz` 截断、tile 越界、palette 截断，均应报错且旧世界不被清空。
- **箱子**：天然箱子拿战利品 → 保存 → 重载，不重置、不复制。
- **离线**：断网保存 >50 MB 世界，应回退 deflate 或明确报错，不能静默失败。
- **卸载**：大世界 `beforeunload`/`pagehide` 后检查最新 blob 是否为合法 bwebp；接受“best-effort”时在 UI 说明。
- **体积**：含 10 组 16K BBat + 50 个箱子的存档，分别测 head/cover/列大小，确认“68 KB”不是文件总大小。

### 4.3 文档（B）

先改 §3.1 的 10 条“与代码直接矛盾”，再改 §3.2 的量化口径，最后补 §3.3 的 D2–D6 决策。每改一条，最好在 `chunks_dat.md` 里贴当前代码行号，避免下次再漂移。

---

## 5. 参考索引

| 主题 | 位置 |
|---|---|
| B 分帧/head 校验 | `bwebp.js:37-59` |
| B 区块编码 | `bwebp.js:62-88` |
| B 世界→列 | `bwebp.js:96-108` |
| B dump/load | `bwebp.js:110-135` |
| B UI/粘贴/回滚 | `bwebp.js:150-200` |
| B 默认保存/卸载 | `index.html:3083-3087, 3121, 3788, 3794` |
| B 容器槽位 | `index.html:2611, 2727` |
| B tile 置脏 | `index.html:1187-1189` |
| B 卸载只存 modified | `index.html:1274` |
| B 依赖 brotli | `index.html:301-335` |
| B 读档 | `index.html:3666-3679` |
| A delta 存档 | `VoxelCraft.html:1058, 1407-1415, 2692-2713` |
| C RLE 存档 | `goodGP/js/save.js:12-104`、`goodGP/js/game.js:182-198` |
| D RLE 存档 | `goodLiqPG/src/game/storage.js:26-83`、`goodLiqPG/src/world/world.js:235-366` |
| E 服务端存档 | `goodPG/src/shared/sim/store.ts:5-159`、`GameServer.ts:122-167, 675-680, 807-816` |
| E 本地 IDB | `goodPG/src/client/net/idbStore.ts:15-121` |
