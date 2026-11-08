
==光影关键==

绝对重心：水云树、影/云光/渲/花  满天星/HDRI 交叉片树叶 花草折纸感（自阴影调优）

水面高度场模拟 新区块有riseFade 全屏和落叶flutter 火把顶附着2D着色器:firefly,热空气和粒子

岸边波浪 水底焦散 水散射和仰视。树冠有粗糙度镜面项、sunDir色温、透射

==体素关键==

**空气/水/岩浆，草土石岩沙雪叶植（按顺序预分配id1~14，雪=雪,冰,玻璃 沙=沙,沙砾 岩=板岩 植=草丛）。 木头燃烧+发光，流体有液位|GL流向|是否源头**，植物与铜有生长有氧化

镂空贴图|交叉片|透光度、半方、邻接并联块（多格依存、多格变形、内部剔面/cull）

无碰撞、依存块（“方向”就是依存空气，床和家具尤其要）、下落/依存与禁放规则/直接替换（=可冲毁）

BfsLight+sunDir, biome tint,  **RGBA贴图, PBR贴图： 自发光|视差坑洼（法线高线）|光滑度 镜面度**

流体.meta.liq=0~8 ，0为源头格，7最薄，>8为下落水柱。

光照值 1~15，熔炉13 火把14。每格衰1级其他看opacity(水2 树叶1)。 Bfs注意区块边界，天空光和方块光取最大值，方块光是暖色加色

==存档理解==

唯一口诀： @xzyb#matBIME, "@x,z^y" 列通用于 pile,P1,entmob 也可在 `/t命令 触发 @地名 #人或附近动物` 补齐，或直输跳过去

BIME即Blk方块、Item物件、Mob动物和敌人、Ent实体。 多方块可以并联为右键可交互体(Bat)，但不叫Ent。**方块和Mob，可以带物品栏贴图当Item值来用**

Ent的特征是能像磁悬浮那样转。(mat的t; mdlID,animID,turn%)，如矿车-船、抛射物、重力下落/掉落的块和薄片、告示和画框、区域效果如flutter落叶区和firefly火精灵。

Mob是有更多监听的Ent：如刷怪蛋投掷，基于Ent注册的 `.on({blk_Any:P=>{}, ent_arrow:.., item_carrot}` 碰撞事件; ondie, ontap; Name,HP,SPD,drops,ATK(0则为友善); 或 gm.scr2world 查询。大写属性走 hp=HP_buf?? HP 的临时覆盖

ondie那段【左右键覆盖】在Blk类上也支持，HP就是hardness，.tool: 'must shovel Lv1'|'axe' .linkBlk: '[@0,0^-1 farmland]' 这样写

`gm.p1.{P,biome}, dayHour,mob(引用:tpause), bbat` 控制相应的脚本API，服主玩家本身也在mat里有 #p1 Player{P @x,z^y HP .. xp .. items[] spawn @..} 条目 Pusc.json 内只是冗余子集

**存档是 webp|zip, tsv,json 的联合体，哲学是 Compose4Cascade —— 间接查找优于硬编码，无克隆则无新建。 **

（并且还用 {P @x,z^y; ..} 记得挖掉前它在哪，因为.P原本就记着。.json（元数据如损耗）不相等可堆叠，右键长按可弹多级grid来细选）

地形生成(slicer)、渲染器(gls) 能点开Worker链接，剔面器(mesher) 要支持从方块图层(BBat) 生成可缩放/旋转有原点的动画多图层实体，比kaalus的锤子家具高级些。

XZP为零转换（只解压/RLE/palette）和联机优化，大改动见 [OPFS](#细则存档格式)，小改防抖/跨端通信一样按pile，但只RLE压缩变更，没改的都用基岩方块填，或单块 append-only。pile靠序号不认时间戳，周期存档按60s和20次place行为做，写入期间新的 place 直接追加到下一段日志。服务端权威。

==存档格式==

`//OPFS/seed主键/ 导出 {存档默认名=Pusc_{Name|要求无符号+中划线空格}_{seed|head -c4}}.webp`

Pusc.json(ver,seed, baseUrl??html同目录, $mode链接,$slicer链接,创建访问时间,基础信息,$links:资源包, advancements:[],stats_Map:{})

【基础信息】包含p1点位和时间、slicer的纯函数（象征物是种子），天气能从时间推。

当然，也含物品包（前N项是物品栏） 血量 饥饿 湿度 皮肤链接等

xzyb.tsv (P-Type{k v;k"v\n"}) 如箱子内数目表、告示牌、火把的依赖方块偏移量（即朝向）。每个Item都可以表示为str（如 "Item{}"），或嵌套的 {k {A 1; B [2 3]; C_is_true; NOT D_false E_false}} ———本文中使用pkv。它是webp模块的极简标记语言，它自动调用 pkv.Item({}) 等等.place(到世界坐标)

mat.tsv (id-浮点P-turn-#mdlID{k v}?) 同理, .born()

BIME.tsv (id-Blk{k v如毛色半砖}, id-#mdlID.animID{}) 是为自描述优化的特殊设计。基本上所有与原档不同的方块和生物都以webp档局部id分配，由load()读回，id1~14已预分配

默认命名空间，木阶，放置时朝向南 `:oak_stairs{linkBlk @0,1; half bottom; shape straight; NOT waterlogged}` ；7阶段麦子 `:wheat{age 7}`

ver 类似 "v1.1 r{dataV}"，数据版本类似 DataFixerUpper，webp模块下定义MIGRATIONS。 未知调色板条目，渲染为无法打破的【未知方块】

XZP.16x16x{H}/g{zdict}@{cx},{cz} X2V/{BBat(预制件名),生物组装体素池(无cxcz有图层名)..} gmdict/{zstd训练字典..} pic/包含【基础信息】的游戏分享截图。

链接可以传入 ?r=渲染器&g=生成器&tex=资源包&start=旧存档的seed或新建 或&start=https链接导种 &mode=G键切换模式号 &p1=@x,z^y(,yaw,pitch,fov)或p1=@地名&tpause=5&json=面板深赋值&pts=name@x,z^y;home@..

tpause=5,1.0x 效果就像暂停菜单透明了一次。包含 5~23 24点就是日出，日出方向是东(E) mat.t(0deg 顺时针, 或偏移 @1,0)也是东，@0,1 是向南边

==有趣的优化==

走的晃动、跑速、登块和跌落动画经过曲线调优。双击W再Shift在允许cheat时，还能再加速。飞行时Shift不是下降，是朝鼠标方向飞。触屏时按钮可以长按切换点击是破坏或是放置

默认使用(ontap xyz) 返回空时才走破坏。主界面横排俩按钮，里边各放1个input，左seed/联机码 右webp粘贴就进去。存档退就保存截图，悬停时全屏看。 Esc菜单底部有水 燧石TNT 弓箭 等方块点就拿，带你试玩各个子系统。

存档带的 pic/ 在标题屏有UI，可以多选两个图做对比，可以点开四周看，也可以直接多图复制去发帖

==三大件==

pkv/gm API × (gpane (Tweakpane分支) + Pass.js) 以glsl里${}getter注入为基础，提供了动态调优项目基建，同时是边做游戏，边准备MOD生态

大量使用文件夹级预设、两个相关键并成vec2,+-1手调、键区间/默认值可热编辑落盘、[{pickLib}]先划选后改KV、checkbox开关后可看fps差异、前3下拉项目转 `<a>` 折叠时也可见，等等

总之就是声明式，方便、跟手。

同时可开多个root，有【任务栏】和文件夹折叠记忆，左上、右上、暂停菜单都能停，通信都基于BroadcastChannel，可以放另一个窗口/屏幕里热重载改游戏。这个接口 &r=&g= Worker 都能用，却不担心恶意插件删你档

预设头部就是动作项： `＋保存 / －删除 / ⎘ 转&json= / ✎ 落盘js默认`（如果有跑 port:8766 热重载助手）。Compose4Cascade。

BBat 内部的【依存块】天然构成一棵树——骨骼树。通过GCreat只按深度透视选方块的方法链接，然后与控制点UI/图层UI投影编辑。碰撞盒用AABB效仿矿车


## Lambda Claw(λ.)

作为 OpusCraft 里最具象征性的玩法兼建筑工具，我们在【方块图层】剪贴板的基础上设计了【栏目答物品栏】。它与按Q牵绳在你身后的小螃蟹"clawd"，以及按M开关的多级小地图一同出现。

在软件工程中，流传着一种像空气般常见的“栏目答”方块。它是只一种列表式“选区替换”，但特征是重复出现、可以套娃，甚至，可以利用【模式匹配-剪枝】来搭起通天塔而不被无限套娃困扰。我们致敬了它的名字和λ.的视觉符号，以下简称LS。

LS允许通过【钻石箱子】来保存clawd（下称为cd），而cd能让你轻松替换房顶上的砖块种类、地板砖的颜色，甚至子建筑的有无，因为它能拆解并操作方块图层。 

你可以通过【嵌套的钻石箱子】用emoji命名并控制很大的区域，更激进的，你还可以收藏树类、调节池塘，甚至圈地“打捞”上一整条地形储藏起来，用来补间、调整和重生成另一段平面中的地表、群系或矿洞。

clawd 就是 Etoys Halo 在方块世界的兄弟。它只在创造模式通过Z键剪掉+不CtrlZ创建（否则就切出更简单的BBat），但在生存模式、在JS代码里也能用。而且，栏目答栏还支持同类方块和颜色补齐，也会记住你选好的“快速换块菜单”。

创造模式cd可执行图层切分、缩容扩容（支持直线BBat平铺和单项变动）、拖动、四向旋转，把BBat装进刷怪蛋投掷，或剪切掉/存钻石箱/扔掉，都做的到。

你按Z，就会用XRay求差（或不接地测试-如导入档不支持diff），抠出各种体积的建筑，cd就在你面前刷出。 大建筑可能要按Z先放出cd，再指挥它调好角度，帮你横纵激光切分/小地图鼠标切分出 "Subagents" 各自处理，完事点它变钻石箱。

钻石箱子有两个格子专门用来存检查点/做查看器，右侧一排是【当前栏目答】。 一般在LS上放置的方块，会修改LS和其所有实例本身。这个规则适用于GCreat模式0/9键一键连到脚的线段和面。 它的实现可以是实例化Mesh，或一般的记零点同步，但在cd里可以选择单独保护/显隐一个子建筑，也可以靠钻石箱派生(fork)或反查(XRay xref)。改 LS 防抖结束时，视野里所有实例都一起闪一下。

cd有手、头和脚，每处都能点。左键激活右键退出 滚轮使用， `左脚切移动/缩放 右脚管旋转，点头往上下滚，点左手往下滚 上滚最多回原位`。 你可以边挪边看，它就牵绳在你身后，每个工具都对应颜色

`黄缩放 绿移动 橙魔棒选取 紫色查看器UI`（点右帽子，类似Shulkr的超平坦托盘，在形状和参考线/切面渐变等工具体验上照着Structmatic）

cd在身后时，你的右键就有paint和(Shift=)place两种，左键也默认是选区，选中了可以弹出右键菜单：`移动、扩充并顺延尾部、参数化到LS上、[增选上次、从上次减选、矩选到上一点、设置选区(默认)]、[只选视口中的、按方块类型选、选不接地的、魔棒(默认)]`、各种插件脚本……

你的物品栏，按Ctrl+1就能代入进这个cd的参数1，无需【点左帽子】打开换块菜单。 当你在钻石箱里拖参数进去，它会把cd自己也fork一份带进去，从而可以直接在箱里换块（同时与当下的屋子解绑定）。 M键小地图的特征是自带Y-slice动画循环播放，可以看透视走势

## 细则：存档格式

Pusc.json 额外包含 author?:{link,desc,tags,nMaxPlayer} 如果有，删除按钮会变成infoUI键，含pic/展示行

$mode 等语法是相对 `$baseUrl/defl/mode.js` 寻址Worker和资源包加载，$links里只处理{js,zip}文件(-> gm.load Blob)。`A__B:[[A],[B],.]` 的键导入导出时投影为 A__B:[[A,B, ..], ]，_Map{str:val}投影为Map

Worker 都必须响应 {onkwarg:{seed:..}|{mode}} 的初始化，以及 key:{'G'|'E'|' '}, onhit:{zombie:meta} 这类消息，处理模式切换。如改变Mob.ATK、改变玩家速度/切飞行、时间和天气、物品包、弹框iframe…… **具体如何划分接口以实现玩法解耦，请与我确认**

其他推荐引擎特征值： `i18n_Map: {emoji:"⛏ 🏰", [默认en 有中文符zh]:[任何in-game自定义名]}, dt:{hoursInGame, 时间都包在这里}, searchHint: {sign__date:[[告示牌文字],[最后修改时间..],"[@x,z  ..]"], rangeXZ_Map:{main:[4]},weather, biomes__shown:[[群系],[计数],脚下群系号],  blk_hist_Map: { [特征方块]:(玩家放置数量/有玩家活动的 chunk 数) }, blk_dense:{n: 高密区数量, mean: 全局均值, top: "[@x,z score 此区主要特征方块 ...取前 5]"}}` ，i18n是游戏内【文本常量池】

【特征方块】：木板,箱子,耕地,床数,铁轨,火把,刷怪笼数, 玻璃/石砖混凝土/陶瓦, 红石,漏斗等红石效应器（没支持此类块/为0就不填）

---

XZP/体素柱的magic是"XZ1z"，方便做文件预览，shape放文件名里，XZ1l是LZ4 XZ1r是raw 默认zstd，XZ1\n 是【文本体素】

换吞吐量，不换压缩率。 LZ4, zstd level3, raw, txt

最高高度256，只存diff（未变块填基岩id0），XRay模式开启时点分享可旧式导出。 biome和FoV以内的光照放在 xyzb.tsv 尾部，格式 BfsLight{val 0.0}

体素用OPFS+双文件 ping-pong+每文件一个crc，region 大小取 32×32 列即可。所有读写必须在单 IO worker 里，Gen worker x N 直接transfer，带内存缓存，小东西unload时同步idb-kv落盘前写OPFS（多标签页互斥、配额满80%提示一键转存OPFS文件夹/导出所有档）

一个世界的方块分布和官方样本差很远（全是雪地 vs 全是沙漠），针对该存档ZDICT_trainFromBuffer的字典能再省 20–40%。关键原则：训练完不做全量重压。现场 id 用 0x8000 | 自增，区别于生成器字典，只在"旧字典要删"时才强制重压剩余 record。

数据早已是 RLE（排列顺序从XZY改成了YZX） + paletted container + bit-packing（每个 16³ section 一个 section 只有 2 种方块时每格只占 1 bit + 紧凑位数组存），真正冗余的大头是大面积空气/石头、重复的 CBOR tag 名字。所有tsv和json文件名都透明兼容 cbro-x useRecords

```
// 编码时三种全算一遍取最小。
u32 crc
u8   type               // 1 同质 / 2 稀疏diff / 3 调色板快照
u16  id0     // 0 = 生成器输出；1 = 同质ID 选法：count(≠生成器) 和 count(≠众数 id)，取小的。
[type 1] u16 blockId
[type 2] u16 count, count × { u16 localIdx(0..4095), u16 blockId }   // 4 字节/条
[type 3] u8  paletteLen, paletteLen × u16, u8 bitsPerBlock, 4096×bits/8 字节

```

盒子、轴向RLE、周期平铺可在游戏的place操作中识别到（产生XZ1\n），每个连续建筑按xz轴左下角为零点。识别器产生的 op 集合光栅化结果必须与原栅格逐格相等，或保留原始 point/raster

文本体素会涉及盒子与面、圆球和圆柱、平铺，同时是识别器产生的表示(ref in xyzb.tsv)，需要对Agent友好。**请与我确认**
