# s15 · 画面反馈与渲染参数（11-09）

> 缘起 [定 11-09，用户]：rgl 的几处光影、天气、粒子不如 v2/gl、goodLiqPG、VoxelLibre。用户要求：小的现在修，大的先写进 `gode/flow/`（s14 §8）再开工；要拍板的问题和 API / 代码质量的选型都用表单问。
> 本节每条写四件事：反馈、现状（读码）、拍板、去向。文件名不带目录的指 `gode/flow/`。

## 1. 反馈与拍板

| # | 反馈 | 现状（读码，11-09） | 拍板 [定 11-09] | 去向 |
|---|---|---|---|---|
| L-1 | 云很差，不如全景 | rgl 的云是 goodGL `cloudsFS`（`rgl/long/sky.js:188`），面板只有开关 | 移植 v2/gl 可调云（厚度 / 密度 / 暗部 / 日照）之前，**关程序云**；白天用 `res/puresky2k.hdr`，**夜里用程序星空**；默认全景由默认模组声明，rgl 不认文件名 | **已修**（§2）；`render.ts` `SKY` `c_Sky`，移植后 `c_Cloud` |
| L-2 | 草阴影不如 v2/gl | 花草进单独的锐阴影图，但草（`v_flags & 8192`）不接收阴影，飞行时整张不画；面板只有范围、柔化。v2/gl 是体素光线追踪，每片草都准 | **草也接收阴影**，加浓度、草接收强度、草丛根部压暗、锐图分辨率 | `render.ts` `c_Shadow` |
| L-3 | 水面反射不如 v2/gl | 只有 SSR（`rgl/long/water.js:145`），画面外的岸边树只能反射天空；面板只有步数。v2/gl 是体素追踪，有反射强度 | **半分辨率平面反射 + SSR 兜底**；加反射强度、F0、模糊 | `render.ts` `c_Water` |
| L-4 | 要有手持火把光（VoxelLibre） | 没有 | **着色器点光源**，只给玩家（Iris HELD_LIGHT）；不动光照网格、不进存档。手持物经 **`Here.held`** 给渲染器，渲染器查 `blk.tsv` 的 emit 列 | `core.ts` `Here.held`；`render.ts` `c_HeldLight` |
| L-5 | 掉落物要有厚度（VoxelLibre） | 宿主 B `Entities.itemGeometry`（`index.html:2782`）：方块是小立方，其余是平面 | **复用 goodLiqPG `itemrender.js` 的挤出网格**，手持物同一套；堆叠多时画 2–5 份 | `render.ts` `c_Items` |
| L-6 | 方块破坏效果 / 粒子 goodLiqPG 最好 | 宿主 B 挖掉一块 = 14 个均色点（`:2075`） | 照 goodLiqPG `particles.js`：每粒取贴图的 1/4 小块，4×4×4 网格，按光照着色、撞方块 | `fx.ts` `Burst.tex / grid / face`、`BURSTS` |
| L-7 | 探矿要有雾感（含洞穴火把暖雾） | rgl 有 `caveHaze`（默认 1，偏弱） | 用**眼处天光** `Here.sky` 判断在地下：越低雾越浓、能见度越短，火把附近染暖 | `render.ts` `c_Fog.cave / caveDist / caveWarm` |
| L-8 | 雷暴默认过曝 | **bug**：`rgl/host-b.js` 把持续的雷暴强度 `Weather.storm` 当成 `flash` 传给 rgl，雷暴期间天空和环境光一直 +0.6；真正的闪光脉冲 `Weather.flash` 没传 | 只有落雷那一下提亮；平时雷暴压暗 | **已修**（§2） |
| L-9 | 没有闪电 | 宿主 B 每 tick 1/300 只放一声爆炸音 | **电光条 + 闪光 + 延迟雷声 + 雷击点火 + 伤害** | `weather.ts` `lightning` → `render.ts` `c_Bolt`、`sim.ts` `c_Fire.bolt`、p1 / ents（`hurt.js`）、audio |
| L-10 | 没有大风天气 | 宿主 B 只有晴 / 雨 / 雷暴 | 天气换成 **goodLiqPG 的 7 种**，每种一行连续参数，大风 = `wind` 列；**仍是确定性**（转移概率照抄，骰子 = `hash(seed, 段号)`）。风影响：植物与树叶摆动、雨丝倾斜与雪漂移、落叶与粒子（不含风声、火势） | `weather.ts` `WEATHER` `NEXT` `wxRow`；`core.ts` `WxRow` `Clock.wind / windDir`；`fx.ts` `windDrift / windLeaf` |
| L-11 | 没有积雪 | 没有 | **着色器雪盖 + 真实雪层**：下雪时露天顶面先渐白；ABM 在露天最高格堆雪层，走 delta、进 pile | `core.ts` `Clock.cover`；`render.ts` `c_Precip.cover`；`sim.ts` ABM「积雪」、`c_Snow` |
| L-12 | 体积光联动差 | 光柱只乘云影（`volCloud`）；雨天在 `rgl/long/comp.js:195` 按 `1 + rain` 放大，此外不看天气 | 跟**火把与洞穴、天气参数（fog / rain 列）、闪电**联动；不跟昼夜 | `render.ts` `c_Fog` |
| L-13 | 雨雪视效差，溅落不像水 | 宿主 B 1400 个纯色点精灵（`gls.js:641`），只在落进水里时冒一个粒子 | **rgl GPU 雨丝**（受风倾斜、拖影、按高度图遮挡，屋檐下不下雨）+ **水面涟漪**（接 `rgl/ripple.js`）+ 地面小水花；雪花慢、飘、有大小差 | `render.ts` `c_Precip` |

## 2. 已修（11-09）

| 改动 | 文件 |
|---|---|
| 雷暴：`flash` 只传 `Weather.flash`（落雷脉冲）；雷暴强度改叫 `storm`，把直射光和环境光再压暗 25%（宿主 B `Sky.skyBright` 的 −0.25·storm） | `rgl/host-b.js` `glsEnv.weather`、`rgl/index.js:292`、`rgl/frame.js`、`goal-renderapi.ts` `Env.weather.flash` |
| 程序云默认关（云影、光柱的云遮挡跟着关） | `rgl/index.js` `P_DEFAULTS.clouds` |
| 默认全景：宿主 B 声明 `SKY_DEFAULT = { pano: 'res/puresky2k.hdr' }`，`?r=gl` 且没写 `&pano=` 时加载；放进 `ResourcePack.defaultHdr`，层级最低（包里的全景、`&pano=`、拖入的 `.hdr` 都盖过它）；`&pano=` 留空 = 不要全景 | `index.html`、`res_vam.js`、`rgl/host-b.js` `decodeSky` |

验证：`gd shot plain`，`gode/shots/261109/2181`（晴，全景）、`2183`（雷暴无落雷：比雨天暗）、`2184`（落雷那一帧：提亮）；页面无报错。

## 3. 选型 [定 11-09，用户]

| # | 问题 | 拍板 |
|---|---|---|
| A-1 | 渲染参数放哪 | rgl 的 `P_DEFAULTS`（98 个键，一行）**按面板文件夹拆成 `c_` 主题写进 `render.ts`**；新参数写成 `[默认, 最小, 最大, 标签]` 一行。现有键先在 `TOPICS` 分好主题（已核对：98 个键各进一个主题，粒子相关的在 `fx.ts` `c_Fx`），数值搬迁时照抄 |
| A-2 | 搬 goodLiqPG 代码的写法 | **转成 rgl 的 Pass 写法**（uniform 改成 glsl 里的 `${}` getter），算法与数值不改，头注释写出处 |
| A-3 | 手持光怎么到渲染器 | **`Here.held`**（世界每秒 4 次的眼处采样里带上主手物品名；最多晚 250 ms，渲染器自己渐变） |
| A-4 | 每帧 `Clock` 带什么 | **插值后的参数行**（`WxRow` 各列 + 名字）；消费者只读数字，模组加天气不用改消费者 |
| A-5 | 天气是否确定性 | **确定性**（`wxAt` / `wxRow` 是 `(t, seed)` 的纯函数；只存命令改过的覆盖段） |
| A-6 | 「效果显著的 tune」怎么验收 | **每个文件夹配预设按钮，人眼对比**；不做自动扫参门槛（`render.ts` `PRESETS`） |
| A-7 | 默认全景从哪加载 | **默认模组声明**（`defl/sky.json`，即 `render.ts` `SKY`）；宿主 B 里暂由 `index.html` 的 `SKY_DEFAULT` 代替 |

## 4. 开工顺序（建议，未排期）

1. **天气数据**：`weather.ts` 7 种 + `Clock` 参数行，宿主 B 先把 `Weather` 换成 `wxRow`；rgl 改读 `Clock`（`c_Sky.overcastDim` 让全景在阴天变暗）。闪电、风、雪盖都依赖这一步。
2. **画面三件**：`c_Precip`（雨丝 + 涟漪 + 水花）、`c_Bolt`、`c_Fog`（洞穴雾、天气雾、闪电照雾）。
3. **光影两件**：`c_Shadow`（草接收阴影）、`c_Water`（平面反射）。
4. **goodLiqPG 两件**：破坏粒子、掉落物挤出网格（A-2 写法）。
5. **手持光**：`Here.held` + `c_HeldLight`。
6. **积雪雪层**（`sim.ts`，随 Q-2 的 sim 模块一起做）。
7. **v2/gl 可调云**（`c_Cloud`）做完后再评估是否默认开云、全景改为可选。
