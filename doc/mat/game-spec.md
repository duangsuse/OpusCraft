# 游戏规则速查 · 声明式表格汇总

> 范围：`index.html` / `mobsim.js` / `res_vam.js` 里以 `c_Xxx = {…}`、`(declarative)` 注释、`gg.my(new class Xxx …)` 单例标明的规则表。
> 约定：**`c_*` 是纯数据，对应的 `new class` 单例是行为**；改玩法先改 `c_*`（Tweakpane 可以直接挂），不动类。数值只写量级。
> 素材（方块 / 物品 / 生物）见 `handover/xyzb/all.md`；体素格式见 `handover/xyzb/meta.md`。

## 0. 索引（按系统）

| 系统 | 数据 `c_*` / 表 | 行为单例 | 位置 |
|---|---|---|---|
| 游戏模式 | `MODES` | `Game.modeDef` | index L1669 |
| 状态伤害 | `HURT` | `Player.update` | index L1680 |
| 调度 / 流体预算 | `c_SCHED` | `Scheduler` | index L526 |
| 流体 / 火 / 随机 tick | `FLUID` `c_Flow` | `Fluids` `Fire` `RandomTicks` | mobsim L377 |
| 生物 AI | `c_MobAI` | `Mobs` | mobsim L12 |
| 移动手感 | `c_Motion` | `Motion` | index L1603 |
| 入水 / 出水特效 | `c_LiquidFx` | `LiquidFx` | index L1630 |
| 实心水 | `c_Fluid` `isSolidFluid` | `Physics` | index L1464 |
| 线 / 面放置 | `c_Build` | `Build` | index L1885 |
| 结构库 | `c_BBat` | `BBat` | index L2415 |
| 值物品 | `c_gm` | `gm` | index L2504 |
| X 光 diff | `c_XRay` | `XRay` | index L1365 |
| 存档 | `c_Save` | `Save` | index L3028 |
| 标题 / 首屏 | `c_TitleStates` `c_Title` `c_1scr` | `Title` | index L3126 |
| 屏保 | `c_Saver` | `Screensaver` | index L3320 |
| 触屏 | `c_Touch` | `Touch` | index L3801 |
| 帮助按键回放 | `c_HelpKeys` | `HelpKeys` | index L4023 |
| 粒子 / 调试 / 错误 | `c_Particles` `c_Dbg` `c_Err` | – | index L3159 / L2934 / L283 |
| 音效 | `c_Audio` `SOUND_MAT` `SOUND_RULES` `MOB_VOICE` | `res_vam.a` | res_vam L466 |
| 生物皮肤 | `c_MobSkin` | `MobSkin` | res_vam L409 |

`gg.my(new class X {…})` 的约定：单例注册为 `gg.X` 并返回，类名即全局名，`instanceof`/`constructor.name` 可用于调试面板自动枚举。

## 1. 游戏模式 `MODES`（G 键循环，存档存 key）

| key | 标签 | 开关 | 含义 |
|---|---|---|---|
| survival | 生存 | – | 基线 |
| creative | 创造 | `creative` | 无限物品、不受伤、飞行 |
| creative+water | 创造W | `creative solidWater depthPlace` | **实心水**：水/岩浆可碰撞、半透明渲染、像土一样挖（回流防抖）；**开启 Build 的距离/线/面放置，可配合XRay+BBat** |
| survival+peace | 生存P | `peaceful` | 怪物不生成且已有的消失（刷怪笼也停） |
| survival+puzzle | 生存T | `toolOnly` | 徒手挖不动任何东西 |

模式就是**一组布尔开关**，系统各自读 `Game.modeDef.xxx`，不做 `mode === 'creative'` 字符串比较——新增模式只需加一行。

## 2. 状态伤害 `HURT`（仅生存）

`[id, 死因, every(tick), amount, first, ignite, when(p, touching)]`

| id | 周期 | 伤害 | 首击偏移 | 余烬 | 条件 |
|---|---|---|---|---|---|
| lava | 10 | 2 | 0 | 100 | `p.inLava` |
| burn | 20 | 1 | 19 | – | `p.fire>0 && !inLava` |
| drown | 20 | 2 | 0 | – | 头在水里且 `air<=0` |
| cactus | 10 | 1 | 0 | – | 碰到 cactus |
| fire | 10 | 1 | 0 | 80 | 碰到 fire |
| starve | 80 | 1 | 79 | – | 饥饿 0 且 HP>1（饿不死） |
| void | 10 | 4 | 0 | – | `y < -64` |

比原版温和（岩浆 2♥/0.5 s + 5 s 余烬，原版 4 + 15 s）。可在 `menu.RT › 声明库` 现场改。

## 3. 调度 `Scheduler` + `c_SCHED`

- 桶式延迟队列：`add(x,y,z,delay,type)`，`pending` 用 `posKey*8+type` 去重；类型 `TICK_FLUID / TICK_FALL / TICK_FIRE`。
- **流体单独排队**：每 tick 最多 `fluidBudget 320` 格；超预算时按离玩家距离排序先近后远。
- **视锥停车**：`underSeaFovOnly` 时，海平面以下且不在视锥内（球半径 `parkMargin 2`）的流体更新丢进 `parked`，每 `parkEvery 10` tick 放回一次。这是"挖开海底不卡"的关键。
- `blockChanged` 事件：新块是液体→按 `FLUID.delay` 排队；重力块→2 tick 后下落；fire→10 tick；6 邻里的液体重排、上方重力块触发。

## 4. 流体 `FLUID` / `Fluids`（MC 1.12 语义）

| | water | lava |
|---|---|---|
| delay | 5 tick | 25 tick |
| drop（每格衰减） | 1 | 2 |
| seek（坡度搜索半径） | 0 | 0 |

- `strength = meta 0 或 ≥8 ? 8 : 8-meta`；meta 8 = 下落柱。
- 非源格每次 tick 重算供给：水有 ≥2 源邻且下方固体/源 → 变源（无限水）；上方同液 → 8；否则取最强邻 − drop，≤0 消失。
- 先下落（只垂直），落不了才横向 `spread`；源总是扩散，流动格坐在"洞"上不横流。
- `seek > 0` 时按原版坡度搜索只朝最近的落差流；现设 0 = 四向全铺（更省）。
- 水遇岩浆：源→obsidian，流动→cobblestone；岩浆 `hardenDirs` 5 向检测水。
- `washable`：非固体、带 `needsSupport` 或 `replaceable` 的附着物被冲掉并掉落（雪层例外不掉）。

**火** `Fire`：meta 为年龄，>15+rand(10) 熄灭；无可燃邻居且（下方非固体或年龄>3）熄灭；下雨且露天熄灭；每 tick 按邻居 `flammable/300` 概率烧掉（一半变 fire 一半变空）；25% 向 ±1 随机空格蔓延；下次 10–30 tick。

**随机 tick** `RandomTicks`：玩家 ±4 区块、每区块每 tick 24 次抽样。草蔓延/退化（光≥9）

耕地 ±4 格找水保湿否则退化、小麦（湿 30% / 干 12%）、树苗 15%、离原木 >4 的树叶腐烂、岩浆 10% 点火、仙人掌长到 3、雪层光≥12 融化、冰光≥11 化水。

## 5. 移动手感 `c_Motion` / `Physics`

- `Physics`：GRAVITY 32、TERMINAL 78、JUMP_VEL 8.4；AABB 逐轴 sweep，**未加载区块视为实心**。
- `c_Motion`：步长 3.2 m 触发脚步；bob 频率 1.6、幅度 y 0.11 / x 0.035；落地下沉 0.4 衰减 7；FOV 乘数 sprint 1.1 / water 0.92 / fly 1.23；受伤翻滚 0.46 rad 持续 0.15 s；死亡视线高 1.6 并按 `deathRoll(t)` 倒下；`eyeEase 0.5` 台阶上行平滑；自动跳 `autoJumpReach 0.25`、疾跑时 1.65。
- `c_LiquidFx`：入水 / 出水全屏特效（`splashVy -4`、820 ms、42 滴），水 / 岩浆各两色。
- `c_Fluid.ghostAlpha 0.4`：**实心水模式下"流入格"（挖掉源后会干的非源液体）半透明显示，XRay也效仿。**

## 6. 创造W 的建造工具

构造均可使用CtrlZ

### 6.1 `Build`（线 / 面放置，`depthPlace` 模式）

- 数字键 `2..9` 设放置距离（`depth 4`，范围 `minDepth 2 .. maxDepth 9`）：无目标时在视线前方 depth 格放置。
- `1` = 直线起点、`0` = 斜面起点（蓝羊毛幽灵框 `ghost: blue_wool`, 0.5 透明），下一次放置把起点→终点填满：
  - `line(a,b)`：沿最长轴取整的 3D DDA；
  - `plane(a,b)`：一轴平坦 → 矩形；否则沿较长水平轴线性插 y 的**斜坡**。
- 上限 `max 4096` 格；`undo 3` 步 Ctrl+Z（记录 `[x,y,z,oldId,oldMeta]`）。
- 手持 `air` 物品 = 橡皮擦，起点落在目标方块本身。

### 6.2 `BBat`（结构库，Block Battery）

- 对准方块按捕获：从该格 flood fill **同色链接块** `link: blue_wool` 连通的结构，包围盒 ≤ `span 64`、≤ `max 16384` 格，存为 `{id, name, w, d, h, q(朝向), cells}` 到 `localStorage['bbat']`。
- 放置时按玩家当前朝向与捕获朝向差做 90° 旋转（`rot` 四分之一圈变换 `(x,z)→(z,w-1-x)`）。
- 名字可带 emoji 头（`emojiHead`），图标由 `BBat.icon` 渲染；`rename('')` 即删除。

### 6.3 `gm` 值物品（`c_gm.kinds = time xyz mob bbat`）

Food 页签里 4 个**生成格**显示实时值，点一下生成一个带 `stack.v` 的物品，右键 = `set(v)`：

| kind | item | get | set |
|---|---|---|---|
| time | gm_time（钟） | 当前小时（钳 7..24） | 跳到该小时 |
| xyz | gm_xyz（罗盘） | 玩家坐标 0.1 精度 | 传送 |
| mob | gm_mob（蛋） | 准星下的生物，否则 24 格内最近 | 在目标面 / 前方 3 格生成（羊带颜色） |
| bbat | gm_bbat（门） | 捕获准星结构（副作用：入库） | 放置结构 |

每个 kind 是 `{item, get, set, label, short, peek?}` 五件套——**新增一种"可携带的世界状态"只要加一个对象**。

## 7. 诊断 / 周边

- **`XRay`**（`c_XRay`）：调试模式下的世界 diff 视图——把"仍等于生成结果"的格画成幽灵、"生成有但被挖掉"的格画成红体（见 `gls.js` 的 `pg/pr` 通道）；`filter: '!*_leaves !dirt !wood'` 排除噪音；可选以某存档为 diff 基准（同 seed 才可比）；`far 160 / lift 30 / pitch -1.2` 是跳到改动上方俯视的镜头参数。
- **`Save`**（`c_Save`）：`localStorage` 前缀 `vc_w_`，索引 `vc_saves`，自动存 60 s；存档带 WebP 截图（q 0.85，hotbar 半透明叠加）；随机姓氏表 `lastNames` 生成世界名。
- **`Title`**：`c_TitleStates` 是 5 态 × 4 元素（start/loading/hotbar/preview）的显隐矩阵；`c_Title` 控制上一世界在标题后面的预览（FOV 105、rd 16、慢速环视 `lookSpeed 1.9 drift 0.04`）与 `tryItems`；`c_1scr` 为 TTFP 首屏快照（把天空渐变写成 CSS、保存列表 HTML 存 `_1scr`）。
- **`Screensaver`**（`c_Saver`）：闲置后在 160 格内随机挑高度 24–64、俯角 −0.6..−0.15 的机位，9 条射线验证视野开阔，每候选等 3 s，不行换下一个。
- **`Touch`**（`c_Touch`）：双指 pad（`padH 0.6 / padW 0.27`）+ 4 个按钮表 `[class, icon, hint, {hold: 鼠标键, dbl, long, tap}]`，状态标签 `FLY/SWIM/DUCK/RUN/WALK`；时序 `slop 5 px / hold 70 / dbl 150 / long 200 ms`。
- **`HelpKeys`**（`c_HelpKeys`）：帮助卡上的按键文本（如 `Ctrl+Z`、`1 / 0`）可点击**回放成真实按键事件**：先 Esc 恢复 150 ms，再每 90 ms 一个和弦；别名表把 `Esc/Ctrl/…` 映射到 `code`。
- `c_Particles { gravity 18 }`、`c_Dbg.facing` 八方位箭头、`c_Err { keep 15 s, max 8 }` 屏幕右上错误条。

## 8. 音效（`res_vam.js`）

- 全程序化 WebAudio：噪声突发 + 振荡器啁啾，`c_Audio { volume 0.55, range 28 }` 空间衰减。
- `SOUND_MAT`：材质 → `[滤波频率, 时长系数, 滤波类型]`（stone 1700 bandpass、wood 850、grass 2600 highpass、gravel 700 lowpass…）。
- `SOUND_RULES`：**按顺序匹配的谓词表** `[d => /glass|ice/.test(d.name), 'glass'] …`，最后 `[() => true, 'stone']` 兜底——方块不用逐个标注材质。
- `MOB_VOICE`：每种生物的叫声参数。

## 9. 这些表的共同模式（给后续新增系统的约定）

1. **数据表 + 单例**：`c_X` 放可调常量，`gg.my(new class X)` 放行为；面板只绑 `c_X`。
2. **布尔开关而非枚举**：模式、生物阵营（`food`）、方块能力（`liquid/gravity/climbable`）都是独立开关，系统各取所需。
3. **按名字后挂钩子**：`Blocks.byName.x.onRandomTick = …`、`Items.byName.x.onUse = …`，定义表保持纯数据。
4. **谓词列表兜底**：`SOUND_RULES`、`HURT.when` 这类"规则 = 条件函数 + 结果"的表，新增规则插一行即可。
5. **五件套对象**（`gm.*`）：`get/set/label/short/peek`——任何想做成"可拿在手里的世界状态"都照这个形状。
