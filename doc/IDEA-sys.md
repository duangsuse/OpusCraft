## 外部依赖清单

艺术资源

- https://fonts.google.com/share?selection.family=Press+Start+2P|VT323
- https://www.planetminecraft.com/texture-pack/survivalpack-read-description-please/
- https://polyhaven.com/hdris/pure-skies
- procgen的生物模型和材质
- AI生成的默认方块贴图
- 基于迷你3D建筑/2D画布编辑器和rgl渲染器的 SVOX(Smooth-Voxels, 3D glTF ASCII Arts) 创造工具

```
three.module.js r180
addons/loaders/HDRLoader.js
OPFS （允许与dirPicker同步、devServer ./test/文件夹同步）

https://www.npmjs.com/package/cuelume 部分的预制themes交互音效

jszip@3.10
https://github.com/bokuweb/zstd-wasm
https://cdn.jsdelivr.net/npm/wasm-lz4/

https://github.com/webspace-sdk/svox-tools 转换器兼容，以及其渲染库


tweakpane.js@4.0.5
https://github.com/0b5vr/tweakpane-plugin-rotation
https://github.com/tweakpane/plugin-essentials

导入或重写：
https://github.com/donmccurdy/tweakpane-plugin-thumbnail-list
https://github.com/brunoimbrizi/tweakpane-plugin-audio-player
```

## 资源tsv面板的体系化

文件保存那一刻就检查目标资源（路径）是否存在，enum合法性，并把补齐放在 gg.Tabs 数组。  反向索引（Where used），要像有引用计数一样，添加一个描述，在所有TSV之间存在


table多选时 Pane 显示交集字段，改一处批量应用

实体检视器、Pick to edit、Fork自动追加到 TSV、一个命令 /arena zombie 10 生成一排怪

在相应 Pane 下面加一个只读区：工具 vs 方块的挖掘时间矩阵、武器 DPS对每种生物的 time-to-kill、生物属性散点图（速度 vs 血量 vs 伤害）、配方资源成本展开，改一个值即时刷新。


## 其他IDEA

小 canvas, 原点列表marker, xz2scr/scr2xz API要外提，方案先说

世界面板有【添加Seed对比】按钮，独立于目前其他视角的小地图，排在下边 可关闭

解耦 preview 函数（为分解视图和 seed 对比铺路）

- V3：gg.pane 参数面板和湖泊 lake.* 都没做。调参目前靠 viz.tune 或 URL

人这边没有面板： Agent功能需要结合 gg.pane，可动态创造调参脚本与面板

深度直方图，纵轴"该层空气占比 / 水占比 / 岩浆占比 / 矿石占比"，一条曲线。这是调 3D 洞穴最直接的数字：你想要 y=-40 附近 cheese 洞穴占 12%，一眼看到是不是。

传统渲染器除了支持XRay，还要3D 剖切面，vec4 clipPlane与p1位置和pgviz联动

XRay 的方块选择，加一个世界里的 UV debug 模式：所有选中方块面贴 UV 棋盘格+直接显示纹理名

相机书签（可以从pgviz格式导入 游戏内编辑角度）、冻结视锥、相机路径（书签插值spline）轨迹录制-frameMs检查点


每层归一化显示 + 同时显示 spline 映射曲线。（比如 continentalness → 高度那条曲线）改完热力图即时刷新。某层开关前后 final height 的差值图，支持 freeze 某几层的噪声输出。 就用biome那个多选grid来做

GBuffer 查看器：一个 mode 枚举选要看哪张纹理。 开启分屏预设对比时：不用改渲染管线。整帧渲染两次（预设 A → FBO_A，预设 B → FBO_B），最后 composite pass 按 uv.x < split 选一张。  每个Pass耗时的占比(1~100)用 EXT_disjoint_timer_query_webgl2 显示为slider

显示刷新率 Hz, rAF 时间戳差, CPU sim 频率, slicer 频率
画成一根横条：[tick][update][mesh upload][render CPU][GPU][idle=vsync等待] 显示 P99 而不是平均值


## 微体素玩法

微体素物件建议用纯色调色板 + 材质属性（粗糙度/发光/透明/..），chunk greedy mesher转化。

一定要避免：放置态/物品态/自由态 使用不同的数据类型

方块模型（楼梯、半砖、栅栏、管道）微体素物件（家具、机械件、雕像）， 甚至可以制作每个图层能旋转的实体（载具、生物、门）

工具：笔刷、填充、线/面/盒、对称镜像（X/Y/Z 任意组合，做家具和生物几乎必开）、调色板吸管、图层。
选中体素范围 → 建组 → 拖 pivot。动画 = 组的关键帧，js可控制轮子按速度转、炮塔朝向目标、anchors（座位、轮子）对齐p1、firefly等等。撤销栈在GCreat模式有，可导入 .vox

mod 作者用编辑器画一只狼、拖 4 条腿成组、录一个走路循环、挂 ai:hostile 组件，零代码出新生物。design 支持 damageStates（几个预做的损坏版本），用切换代替物理。

"Fork this"：对着世界里任何方块、家具、生物按键 → 复制 design 到我的 mod → 进编辑器。


1. 体素生成生物模型（类似 VeloREN）：
   - 模型 = 小体素网格（例如 16³）加调色板，存成 .vox 或文本。
   - 同一个 greedy + AO 函数直接出网格，每个生物一个小 mesh，骨骼按体素组分块。
   - 现有的 MobSkin 和 Mobs.rebuild 可以换成这条路径。
   - 好处：生物外观可以由用户或 Agent 编辑，不用画贴图。
2. Agent 协作：
   - 给 Agent 一个很小的接口：describe(region) → 文本、place(text, origin)、preview(region, view) → 图片。
   - Agent 写文本，引擎渲染预览，Agent 看图后再改。
   - 加一个按区域加锁和撤销的机制，防止多个 Agent 互相覆盖。
3. 预览与缓存：同一份体素加调色板的哈希就是缓存键，可以复用 mesh 和预览图，也方便做版本对比。

## 理解体素世界

绝大多数方块钩子事件携带局部快照，mod 和模拟同线程。 SAB 只读快照作为补充

interface BlockEvent {
  P: Vec3;
  blk: BlockState;
  face6Blk: BlockState[6];          // 直接给
  region(r: number): RegionSnapshot; // 需要更大范围时惰性拷贝
  p1?: PlayerSnapshot;
  // 写操作全部是命令
  setBlock(pos, state): void;        // 入队，tick 末尾应用
  spawn(entity): void;
  schedule(pos, delayTicks): void;
}

即时钩子：onPlace / onBreak / onTap / onFaceBlkChanged / onEntityCollide——由玩家或邻居变化触发，频率低，随便挂。
调度 tick：mod 调 schedule(pos, delay) 后才会收到 onSched。流体、生长都用这个。
随机 tick：每 chunk 每 tick 随机选 N 个方块，只有方块定义声明 schedRandom: true 的才会回调。作物、树叶、火。

实体不要用逐实体回调，用组件系统：引擎每 tick 批量调用一次 fn(entities) ，比如 ai:hostile 组件

世界生成要求纯函数 + 传入 seeded RNG：onGenChunk(phase, chunkBuffer, ctx)，phase 固定为 terrain / carve / surface / decorate / structure。

