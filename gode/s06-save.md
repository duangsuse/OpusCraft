# s06 · 存档：Pusc / XZP / OPFS / pile

> 上游：IDEA「存档理解」「存档格式」「细则：存档格式」；`doc/xyzb/chunks_dat.md`（宿主 B 现行 `bw_*.webp`，作为旧档导入）。
> 哲学 **Compose4Cascade**：间接查找优于硬编码，无克隆则无新建。存档只存与生成器输出不同的部分。

## 0. 已定 [11-08]

| # | 决定 |
|---|---|
| S-1 | 导出容器 = **webp 截图 + 追加的标准 zip**。改名 .zip 就能用任何解压工具打开；JSZip 已在依赖里 |
| S-2 | **一开始就用 zstd**（wasm），字典训练（ZDICT）和记录格式同期落地；LZ4 / raw 作为吞吐量选项保留 |
| S-3 | 文本体素 `XZ1\n` = **一行一个 op 的 pkv 风格**（§5） |
| S-4 | 联机：只把协议写清（pile 序号日志、服务端权威、联机码），不进 M1–M3 |

## 1. 布局

```
OPFS: /<seed 主键>/            运行时（ping-pong 双文件 + crc，§4）
导出: Pusc_<Name>_<seed 前 4 位>.webp
  [RIFF WEBP 截图]
  [PK zip]
    Pusc.json                  头（§2）
    BIME.tsv                   本档的方块 / 物品 / 生物定义与局部 id（s04 §1）
    xyzb.tsv                   有状态的格：linkBlk、箱子内容、告示、BfsLight 缓存（§3）
    mat.tsv                    Ent / Mob（s05 §3）
    pending.tsv                跨块装饰挂起表（s02 §3）
    XZP/16x16x256/g{zdict}@{cx},{cz}    体素柱（§4）
    X2V/{BBat 预制件名}…        结构 / 生物组装体素池（无 cxcz，有图层名，s08）
    gmdict/{zstd 字典}
    pic/                       分享截图，含「基础信息」；地图物品缩略图（s03 §3.4）
```

## 2. `Pusc.json`

```js
{ ver: 'v1.1 r{dataV}', seed, baseUrl /* 缺省 = html 同目录 */,
  $mode, $slicer,                         // 模组与生成器的 Worker URL（s07 M-1）
  $links: [ /* 资源包 / js 模组，只处理 {js, zip} */ ],
  created, accessed,
  base: { p1: '@x,z^y', dayHour, cheat, mode, … },     // 「基础信息」：p1 点位与时间、slicer 纯函数（象征物 = 种子）；天气由时间推
  author?: { link, desc, tags, nMaxPlayer },          // 有则删除按钮变 info 键，带 pic/ 展示行
  advancements: [], stats_Map: {},
  i18n_Map, dt: { hoursInGame }, searchHint: { … },    // IDEA「其他推荐引擎特征值」
}
```

- `A__B: [[A],[B]]` 键在导入 / 导出时投影为 `[[A,B], …]`；`_Map` 键投影为 `Map`（IDEA）。
- 玩家：`mat.tsv` 里的 `#p1 Player{P @x,z^y; HP …; xp …; items […]; spawn @…}` 是权威，`Pusc.json` 里只是冗余子集。
- **迁移**：`ver` 的 `dataV` 照 DataFixerUpper，`webp` 模块里定义 `MIGRATIONS`。未知调色板条目 → 不可破坏的「未知方块」。

## 3. tsv（pkv）

- 每行 `键 \t 类型{k v; …}`：`xyzb.tsv` 键是 `@x,z^y`，`mat.tsv` 键是 id，`BIME.tsv` 键是局部 id。
- pkv 语法：`{k v; k "v\n"; flag; NOT flag}`，嵌套 `{A 1; B [2 3]}`；读回时自动调用 `pkv.Item({…})` 等构造器，再 `.place()` 到世界坐标 / `.born()`。
- 记住挖掉前它在哪：条目自带 `P`（IDEA）。
- 物品堆叠：`.json` 元数据（如耐久损耗）不相等时**不可堆叠**；右键长按可弹多级 grid 细选。
- **所有 tsv / json 文件名透明兼容 cbor-x `useRecords`**（同名 `.cbor` 存在时优先读）。

## 4. XZP 体素柱

### 4.1 编码

- 文件 magic：`XZ1z`（zstd，默认）、`XZ1l`（LZ4）、`XZ1r`（raw）、`XZ1\n`（文本体素，§5）。shape 写在文件名里。
- 每个 16³ section 一条记录，三种编码**都算一遍取最小**：

```
u32 crc
u8  type               // 1 同质 / 2 稀疏 diff / 3 调色板快照
u16 id0                // 0 = 生成器输出；否则同质 id。选 count(≠生成器) 与 count(≠众数 id) 中较小的
[1] u16 blockId
[2] u16 count, count × { u16 localIdx(0..4095), u16 blockId }
[3] u8 paletteLen, paletteLen × u16, u8 bitsPerBlock, 4096·bits/8 字节
```

- 体素顺序 YZX（与运行时布局一致，s02 §1），未改的格写 0（= 生成器输出，s04 §1）。
- 存档里的 id 是 u16 全宽：`0x8000 | n` 为本档现场局部 id，区别于生成器字典里的 id（IDEA）。
- 最高 256 格。XRay 模式开启时，「分享」可以导出不做 diff 的旧式全量。

### 4.2 字典

- 一个世界的方块分布与官方样本差很远（全雪地 / 全沙漠），针对本档 `ZDICT_trainFromBuffer` 训练的字典能再省 20–40%。
- **训练完不做全量重压**：新记录用新字典，旧记录保留旧字典 id；只有「旧字典要删」时才强制重压剩下的记录。

### 4.3 OPFS 与 io worker

- 所有读写在**唯一的 io worker** 里（s01）。slicer 的结果不经过它；main 落盘时 transfer 给它，带内存缓存。
- region = 32 × 32 列一个文件；**ping-pong 双文件，每文件一个 crc**，写一半崩溃时读另一个。
- 小东西在 unload 时同步写 idb-kv，落盘前写 OPFS。多标签页互斥（Web Locks）。
- 配额用到 80% 时提示：一键转存 OPFS 文件夹 / 导出所有档。

## 5. 文本体素 `XZ1\n` [定 11-08]

```
XZ1
@0,0^64 house
box  @0,0^0  9x7x4  :cobblestone
box  @1,1^1  7x5x3  :air
face @0,0^4  9x7    :oak_planks
tile @0,0^0  9x1x1  :glass  every 2
cyl  @4,3^5  r2 h3  :oak_leaves
ball @12,3^3 r3     :stone
```

- 第二行是零点与名字：每个连续建筑以 xz 轴左下角为零点，op 内坐标相对零点。
- 形状：`box face ball cyl line tile`（周期平铺）。**后写的覆盖先写的**，`:air` 即挖空。
- 方块写法同 BIME（`:oak_stairs{linkBlk @0,1; half bottom}`）。
- **识别器**：place 操作中识别盒子、轴向 RLE、周期平铺，产生 op 集合。**光栅化结果必须与原栅格逐格相等**，否则保留原始 point / raster。识别结果在 `xyzb.tsv` 里以 ref 引用。
- 面向 agent：可读、可 diff、可手写；s08 的 λ. / clawd 也用它做剪贴板的文本形式。

## 6. pile：增量与周期存档

- 小改动（防抖、跨端 / 跨标签页通信）按 pile：只对变更做 RLE，未改的填 0，或单块 append-only。
- **pile 靠序号，不认时间戳**。周期存档：每 60 s 或每 20 次 place 行为；写入期间新的 place 追加到下一段日志。
- XZP 是零转换（只解压 / RLE / 调色板）且为联机优化；大改动走 §4 的 OPFS region。

## 7. 联机（只写协议，S-4）

- 服务端权威。具体条目见 s11 §2（N-1…N-9）。pile 的序号日志就是同步单位：客户端发 place，服务端定序、广播 pile 段。
- 主界面左输入框：seed **或联机码**。具体传输（WebRTC / 中继）、谁当服务端、冲突处理留到联机里程碑再议。

## 8. URL 参数（IDEA）

`?r= &g= &tex= &start=<旧档 seed | 新建 | https 链接导种> &mode= &p1=@x,z^y(,yaw,pitch,fov) | @地名 &tpause=5,1.0x &json= &pts=name@x,z^y;home@…`

- `tpause=5,1.0x`：效果像暂停菜单透明了一次。时间 5…23，24 = 日出；日出方向为东，`mat.t` 的 0deg（顺时针）也是东，`@0,1` 是南。

## 9. 待议

- 旧档导入：宿主 B `bw_*.webp`（chunks_dat）与 goodPG / LiqPG 存档是否要导入器
- 区块加载记录（地图「没去过的地方是空白羊皮纸」，s03）放哪：`Pusc.json` 的位图，还是 XZP 目录本身
