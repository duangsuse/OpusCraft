
# 1

DDA（光线步进微分法）复用mesher信息的思路达到了瓶颈的百分之几？

答：DF （方块距离场）把主射线迭代砍掉约 35–40%（÷1.4–1.7），但 dda 时间只降了 `7–15%`。换算下来，65–75% 成本不随DDA步数变化。

DDA 400步或500步根本没影响。 目前游戏最多做到16x区块 10的视距，到100步就看不出性能差异了…… 阴影射线、GL参数化的模块化、水和云是下一个难点。 step成本本身被高估了，是可优化空间的三分之一到一半。另一方面是核显本身有限，显得DDA步进合并的效果不佳

**层级加速已经有octree，fetch也优化了，瓶颈不在这。树叶的LOD也实测过，fps感不明显，短FoV甚至是负收益，主要还是在视距>9区块时起效。 体素和顶点结构专门对标过，够紧凑。**

Opus反馈DDA步数上还有2/3可以拿到。

但这个天花板是按已知技术的来，可实际上能玩的沙盒都没有要到这种程度。树剪枝+DF跳过是平衡最好的，继续只会吃没有模块化的面条代码的亏

# 2

SIMD8转4基本上是怎么样：Intel iGPU 上，极端复杂的 shader 经常被强制 SIMD8 + 大量 spill；简化后有机会落到 SIMD4。

`chromium --use-angle=vulkan --ozone-platform=x11` 后webgl1的效果有问题，而且N卡不是我们的目标

把阴影射线、反射、着色等拆成单独的 shader 或 compute pass。

经测试，降低scale到0.6并使用整体树叶阴影就能让游戏达到窄屏可玩。 阴影迭代4， 关掉树叶就能1080p可玩，噪音的水风格优化似乎Reimagined比还差
7. 我倒不是很在乎，游戏有其他特性补充

关于A/B的问题，现在Tweakpane其实大体已经成框架了，就差一键事： 加一种性能开关的类型，统计fps，落盘或者fetch投送到agent的收集点。玩家大体上在seed范围内活动，这样PGO也会准确不少。 或者给p1做个puppet replay功能也行

# 3

VeloREN 比较值得借鉴的就是体素转建模和洞穴光效，如果能像LOD体素转生物模型（MagicaVoxel）一样，热重载编辑贴图的光效部分（如矿石发光、夜光蘑菇）可能会很好二创

水、光、天空和树叶，基本上就是验证视觉的最基线，凭材质包能搞定一个就足够想很多了

VeloREN 纯 Rust + 直接 wgpu、体素 chunk 的 greedy meshing（把共面面合并成大四边形，大幅压顶点数）、BFS 传播的体素光照（阳光 + 局部 glow，洞穴里点光源的衰减和渗透感做得不错）、LOD + 地平线阴影、体积云/大气散射这些。这些在开源体素项目里属于偏高的完成度

chunk 级 BFS 烘焙（阳光 + glow 扩散）负责"渗透感"，再加真正的动态点光源 + 点光阴影（cubemap）负责火把、法术。洞穴看着舒服是 BFS 的软衰减打底、动态光做高光……

Terraria和Teardown才是非MC偏乐高里有意义最优秀的，可惜这个领域里没有LibreSVIP那样的技术存档互转

https://news.ycombinator.com/item?id=41278862

# fin

其实我对目前纯THREE的代码质量也不满意（因为这边高强度用Tweakpane手工调优）。也有推荐用 threepipe.org/ 但觉得它UI太差

之前的2d项目是用ES6模板的

// 🛠️ 工厂：Pass({ tag: 'N' })`...${_=>P.param}`
const Pass = ({tag,...kws} = {}) => (code, ...argFns) => {
    let
        frag_std = `precision highp float; uniform sampler2D S, B; uniform vec2 R, M, pM; varying vec2 u;`,
        U = { S: regl.prop('S'), B: () => bg, R: () => R, M: () => M, pM: () => pM },
        A=argFns,
        frag = frag_std+code.reduce((s, t, i) => s + t + (!A[i]?"": (U[A[i].k = (A[i]+'').match(/\.(\w+)/)[1]] = A[i], A[i].k)), "")
    return regl({ ...kws, uniforms: U, ...(tag && { framebuffer: regl.prop(tag) }), frag});
}

可惜它和three磨合会比较艰难

我们可以乘这个机会正式把项目工具库整理一下，用法聚合到 ./doc/lib.md 。 Tweakpane确实是两个宿主都在用，除了我对vec2的理解是两个-1~+1 slider搁一起（而不是真区间）整体没啥问题

然后 win.gg.ev($0,{}), gg.my(new class KEY{}) 也帮助htm部分节省很多模块化和动作绑定的噪声。 gm.xyz 什么的是我设想给单玩家脚本用的API，未来可能会把pane写访问也装进来

const c_XX 或许应该改成 c_.XX ，方便探测参数和热重载。 重构的部分你也写个 ./goal-panify

但目前pane仍然不够用。首先是presets和CLI的问题。 状态管理在v2 buildPane() 已经解决了（注入到第一个文件夹末尾，提供预置json），CLI也可以用 &json=部分深赋值 来指定，这个应该作为 gg.pane 扩充的一个特性

然后是声明式绑定，需要和Pass DSL能兼容。有一个值或ref的问题，我认为把需要的 c_XX={} 用 gg.vars({}) 包一下，然后面板用 c_XX.it.yy 引用。 pane封装需要兼容两个宿主有的文件夹等语法，尤其是多root上最好做成root可拖拽，并且有一个taskbar控制可见性（持久化）

pane类型的扩展上，首先会有一个单项select后编辑的文件夹模式(BLOCK_DEFS, ITEM_DEFS csv)，应该做成可搜索的（直接用htm datalist补齐），然后就是 bool switch 都悬停显示平均性能影响，也可以绑定timeit:'topic'自动提交 tools/perf-collect.mjs ，触发gl重编译的(timeit:'gl_wtf') 可能要给canvas放个CSS呼吸灯变暗的动画

状态管理在这有个附加：perf要顺便负责投影编辑对应的默认preset。 "删除预设"下边还要加一个当前预设写为js默认的功能，静默失败

我们使用vec2本质上是组合slider，所以我希望直接用参数名去整理，比如相邻的 x-AO y-曲线 就命名为"→AO, 曲线" 。显示上把值的文字hack一下即可，不要在名字上显示值

最重要的是，pane的区间应当可force编辑。交互是，你右键属性，它往左边展示一个专门的root，可以调整左右两端(0.5~1.5)，应用后可继续这样。 vec2.xy的话重复两行 ，临时区间遮盖用属性名放本地存储gg_range，值是gg_v

folder也要加个动作，就是记住展开折叠状态，然后presets下拉的下面再做一个文件夹级的预设下拉，针对上次展开的文件夹。这个API上透明，但select内的“预设写为js”要改成复制路径键值，&json= 可用的那种

如果folder里存在硬编码的单选，比如3项，就把3个按钮堆在文件夹内第一行

排在DSL之外，游戏的tweak上，我也给一些Inspectable建议

第一个文件夹里要放上调试视图(dview)、玩家速度、时间(t)、时间冻结(tpause) （暂停菜单、暂停生物、暂停模拟、锁1帧），F3 面板里要放可复制粘贴的摄像机 Gizmo(6个数)，信息的排序就像现在 debugText()这样 ，确保可以用 &xyzb=档&gizmo=xyzXYZ 由agent快速截图验证交接
