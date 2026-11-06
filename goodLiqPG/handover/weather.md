# 天气系统 · 状态机 / 视觉映射 / 受天气影响的方块

> 天气只有一份全局状态（`Weather`，environment.js:30），每 tick 推进，每帧由 `computeEnvironment`（environment.js:138）展开成 `env`，渲染、玩法、音频各取所需。**没有按群系区分的天气状态**，群系只在"落地"环节起作用（下雪 / 结冰、雨声静音）。

## 0. 一页管线

```
Weather.tick()  (20 TPS)                                        environment.js:49
  cur{clouds, rain, thunder, fog, wind, cirrus} 按固定步长逼近 target   rain/thunder 0.01/tick，其余 0.002/tick
  rainLevel = cur.rain ；thunderLevel = cur.thunder × cur.rain ；rainbow 衰减 ；flash 递减
      │
computeEnvironment(game, pt)  每帧                               environment.js:138
  ├─ 原版：skyColor / fogColor 去饱和变暗，skyDarken（光照图），starBrightness×(1−rain)
  ├─ 光影：lightColor 变暗，环境光变灰，sky LUT 去饱和，云量 / 卷云 / 体积雾 / 空气透视 / 泛光
  └─ env.wind → 植被晃动幅度、水面波强
      │
渲染   pipeline.js：wetness 迟滞 → G-buffer 水洼 → 延迟光照湿润 → 水面雨涟漪
玩法   gameplay.js randomTicks：寒带积雪 / 结冰、熄火、耕地湿润、闪电
音频   main.js:454  setWeather(snowy ? 0 : rain, thunder)，setCovered(头顶有遮挡)
```

## 1. 状态机（environment.js:19–80）

### 1.1 七种预设（`PRESETS`，environment.js:20–28）

| 类型 | clouds 云量 | rain | thunder | fog 天气雾 | wind 风 | cirrus 卷云 |
|---|---|---|---|---|---|---|
| clear 晴 | 0.32 | 0 | 0 | 0.00 | 0.25 | 0.5 |
| cloudy 多云 | 0.62 | 0 | 0 | 0.05 | 0.45 | 0.7 |
| overcast 阴 | 0.90 | 0 | 0 | 0.15 | 0.50 | 0.2 |
| rain 雨 | 0.95 | 1 | 0 | 0.30 | 0.70 | 0.0 |
| thunder 雷暴 | 1.00 | 1 | 1 | 0.35 | 1.00 | 0.0 |
| fog 雾 | 0.50 | 0 | 0 | 1.00 | 0.10 | 0.2 |
| snow 雪 | 0.92 | 1 | 0 | 0.45 | 0.60 | 0.0 |

`snow` 的 `rain = 1`：在温带它就是下雨（地面照样湿）；只有寒带群系的落地逻辑会把它变成积雪。反过来，寒带下 `rain` 也会积雪。

### 1.2 转移（`cycle = true` 时，environment.js:51–66）

持续时间：`clear` 为 12000 + rand·60000 tick（10–60 分钟），其余为 6000 + rand·12000 tick（5–15 分钟）。到期按下表掷 r ∈ [0,1)：

| 当前 | 下一个 |
|---|---|
| clear | r<0.45 cloudy ／ <0.60 fog ／ <0.85 overcast ／ 其余 clear |
| cloudy | r<0.35 clear ／ <0.70 overcast ／ 其余 rain |
| overcast | r<0.50 rain ／ <0.75 cloudy ／ 其余 thunder |
| rain | r<0.25 thunder ／ <0.75 cloudy ／ 其余 overcast |
| thunder | r<0.60 rain ／ 其余 cloudy |
| fog | r<0.60 clear ／ 其余 cloudy |
| snow | cloudy |

- **彩虹**：从 rain / thunder 转到 cloudy / clear 时 `rainbow = 1`；之后只要 `rainLevel < 0.05`，每 tick 减 1/4000（约 200 秒淡完）。
- **过渡时长**：雨从 0 到 1 需要 100 tick（5 秒），云量 / 雾 / 风从 0 到 1 需要 500 tick（25 秒）。所以"先起风变阴，再下雨"是自然出现的，不用另写编排。
- **命令**：`/weather <类型> [秒数] [now]`（gameplay.js `runCommand`）。标题界面的背景世界固定为 `cloudy` 且 `cycle = false`。

## 2. 视觉映射：env 字段 → 着色器

### 2.1 原版模式（照搬 1.20 公式）

| 项 | 公式 | 位置 |
|---|---|---|
| 天空色 | 雨：向 `0.6·luma` 混合，系数 `1 − 0.75·rain`；雷：向 `0.2·luma` 混合，系数 `1 − 0.75·thunder` | environment.js:151–152（`ClientLevel.getSkyColor`） |
| 雾色 | `×(1−0.5·rain, 1−0.5·rain, 1−0.4·rain)`，再 `×(1 − 0.5·thunder)` | environment.js:169–170 |
| 光照图 | `skyDarken *= (1 − rain·5/16)(1 − thunder·5/16)` | environment.js:176（`Level.getSkyDarken`） |
| 星星 / 日月 | `×(1 − rain)` | environment.js:194；原版天空 `alpha = 1 − rain` |
| 闪电 | 天空色向 `(0.8, 0.8, 1.0)` 混合 `min(1, flash)·0.45` | environment.js:153 |

### 2.2 光影模式

| 效果 | 公式 / 参数 | 位置 |
|---|---|---|
| 阴天压低直射光 | `overcast = clamp((clouds − 0.6)/0.4)`；`lightColor ×= 1 − 0.75·max(rain, 0.8·overcast)` | environment.js:231–235 |
| 环境光变灰 | 向自身灰度插值 `max(rain, overcast)·0.6`，再 `×(1 − 0.35·rain)` | environment.js:237–239 |
| 闪电补光 | `ambUp += 1.5·f`，`ambHorizon += 1.0·f`；云的散射 `+3.0` | environment.js:242；post.js 云 `u_flash` |
| 天空 LUT | 向灰 `(0.95, 1.0, 1.08)` 插值 `0.75·rain`，整体 `×(1 − 0.45·rain)` | sky.js:240 |
| 日盘 / 月 / 星 | `×(1 − rain)` | sky.js:300, 310, 314 |
| 云量 | `local = clamp(wm − (1 − cov)·0.9, 0, 1)·1.6`；`cov > 0.75` 起高度剖面从积云混向层云（最多 0.7） | post.js:72–77 |
| 云的光 | 云层高度（1100 m）处的透射率 `×(1 − 0.7·rain)` | pipeline.js:423 |
| 卷云 | 7000 m 二维层（随云平移 ×3），`smoothstep(0.55, 0.9, fbm)·cirrus·0.6·(1 − rain)` | post.js:162–171 |
| 体积雾密度 | `0.0016 + 0.006·fog + 0.004·rain`，高度衰减 `exp(−max(y−62, 0)/28)` | pipeline.js:334；post.js 体积光 |
| 晨雾 | `morning = max(0, 1 − ((t − 0.96 + 1) mod 1)/0.06)`，t = dayTime/24000；`mist = max(morning, fog)·0.02`，高度 `exp(−max(y−64, 0)/10)`，带 `vnoise(0.03·xz + 0.05t)` 起伏 | pipeline.js:331–334 |
| 空气透视 | `0.0011 + 0.004·fog + 0.003·rain` | pipeline.js:345 |
| 泛光 | `0.055 + 0.02·rain` | pipeline.js:394 |
| 彩虹 | 主虹 40.6°–42.8°（反日点角），副虹 50.5°–53.5°、强度 0.35、色序反转；只在太阳高度 −0.05…0.7 出现；天空处被云透射率遮挡，地形处 `smoothstep(60, 300, d)·0.6` | post.js:285–329 |

晨雾公式注意：它是单边窗口，在 t = 0.96（dayTime 23040）时为 1，之后线性衰减，到 dayTime 24480（即次日 480）归零；23040 之前恒为 0。日出前没有雾"渐浓"的过程。

### 2.3 湿润（迟滞 + 孔隙度 + 水洼）

```
pipeline.js:185   tgt = (rain > 0.1 && !this.snowy) ? 1 : 0
pipeline.js:186   wetness += (tgt − wetness) · min(1, dt · (tgt ? 0.08 : 0.03))     变湿约 12 s，晾干约 33 s（时间常数）
deferred.js:75–78 G-buffer：仅 非植被 && Ng.y > 0.7 && skyLight > 0.86 时
                  puddle = smoothstep(0.45, 0.7, fbm2(worldXZ · 0.15))           写入 g3.a
deferred.js:140–147 光照：exposure = smoothstep(0.86, 0.96, skyL)；wet = wetness · exposure · (植被 ? 0 : 1)
                  albedo ×= mix(1, 0.55 + 0.45·smoothness, wet)                    越粗糙越暗（湿泥巴比湿石板暗）
                  smoothness = mix(s, 0.9, wet · max(puddle, 0.35·[Ng.y>0.7]))      水平面至少 0.35 的镜面度
                  N = mix(N, Ng, wet · puddle)                                      水洼抹平法线贴图
water.js:156–163  水面雨涟漪：0.5 格网格，每格相位 hash，环 sin((r − 0.6·ph)·40)，半径 0.35，幅度 0.8·wetness·smoothstep(0.8, 1, skyL)
```

这一组就是"雨后草地"效果的来源：草方块顶面（mat 14）不算植被，会变暗、出现水洼高光；而草丛、花、树叶（植被材质）保持干燥的颜色和次表面透光，两者叠在一起层次很清楚。晾干比变湿慢，所以雨停后地面还会湿一阵。

### 2.4 风

`env.wind = cur.wind` 同时驱动两处：

- 植被晃动幅度：`(0.04 + 0.08·wind)·sway`，即晴 0.06 → 雨 0.096 → 雷暴 0.12 格（common.js:31，曲线见 `vegetation.md` §3）。
- 水面法线强度：`mix(0.25, 0.55, wind)`（water.js:150）。

云的平移速度**不受风影响**，固定为 `windOff = time·(6, 2.5)` 格/秒（post.js:66）。

## 3. 受天气影响的方块 ID

方块 ID 由 blocks.js 的注册顺序决定，下表是当前值，可用 `node -e "import('./src/world/blocks.js').then(m=>console.log(m.ID.short_grass))"` 复核。材质 id 见 `vegetation.md` §0。

### 3.1 视觉（每帧，着色器）

| 影响 | 判定 | 方块（ID） |
|---|---|---|
| **变湿 + 水洼** | G-buffer 里 mat ∉ {1, 2, 9} 且天空光 > 0.86；水洼另需几何法线朝上 | 地表一切非植被方块：grass_block 11（mat 14，顶面变湿，侧面只变暗）、dirt 12、coarse_dirt 13、podzol 14、farmland 15、dirt_path 16、sand 18 / red_sand 19（mat 13）、gravel 20、snow_block 24 / snow 25（mat 12）、石头 / 建材等 |
| ⚠ 也会变湿的"植物" | mat 0 的十字模型，法线朝上 → 能出水洼高光 | sugar_cane 119、brown_mushroom 130、red_mushroom 131、cobweb 179；pink_petals 132（平铺，mat 0）也会出水洼 |
| **不变湿** | mat 1 PLANT | short_grass 97、tall_grass 98、fern 99、large_fern 100、花 101–112、sunflower 113、lilac 114、rose_bush 115、peony 116、dead_bush 117、lily_pad 124、seagrass 126、tall_seagrass 127、kelp 128、kelp_plant 129、wheat 133、树苗 72 / 76 / 80 / 84 / 88 / 92 / 96 |
| **不变湿** | mat 2 LEAVES | 树叶 71 / 75 / 79 / 83 / 87 / 91 / 95、vine 125 |
| **随风晃** | 顶点 sway > 0（只有网格器给 PLANT 十字、双格植物、作物、藤蔓写了 sway） | 97–117（除 cactus 118）、126–129、133、125、树苗；**不晃**：树叶方块、sugar_cane 119、cactus 118、蘑菇、lily_pad 124、向日葵花盘 |
| **雨涟漪 / 波强** | mat 3 | water 29；含水方块 126–129 内部按满格源头水网格化，同样有涟漪 |
| 积雪侧面 | 网格器：草方块上方是 snow 25 / snow_block 24 → 侧面换 `grass_block_snow`，取消 overlay | grass_block 11（mesher.js:567–597） |

### 3.2 玩法（随机 tick，gameplay.js）

| 规则 | 条件 | 方块变化 | 位置 |
|---|---|---|---|
| 降雪 | `rainLevel > 0.2`；渲染距离内（≤8 块）每块每 tick 1/16 概率取一列；群系 `precipitation === 'snow'` 或基础温度 < 0.15（**不含海拔递减**） | 顶层源头水 29（meta 0）→ ice 26；顶层不透明块且上方为空 → snow 25（1 层）；已有 snow 25 且 meta < 2 → meta+1（最多 3 层） | gameplay.js:95–106 |
| 融化 | 方块光 > 11 | snow 25 → 空气；ice 26 → water 29 | gameplay.js:166–168 |
| 熄火 | `rainLevel > 0.5` 且露天（`rainHeight ≤ y`） | fire 178 → 空气 | gameplay.js:163 |
| 耕地湿润 | `rainLevel > 0.2` 且露天 | farmland 15 → meta 7（换 `farmland_moist` 纹理） | gameplay.js:136 |
| 闪电 | `thunderLevel > 0.5`；每块每 tick 1/20000 | 雷击点空气且下方实心 → 50% 放 fire 178；3 格内实体受 5 点伤害；`flash = 2` | gameplay.js:108–111, 262–275 |
| 玩家着火 | `rainLevel > 0.5` 且头顶露天 | 熄灭 | main.js:223 |

`rainHeight(x, z)`（world.js:119）从 heightmap 往下找第一个实心、流体、树叶或非实心层的整方块（玻璃 / 冰），用于"露天"判定和音频遮挡。

## 4. 已知问题（读码确认，未修）

- **没有降水几何**：雨丝 / 雪片 / 落地水花都没有实现。渲染器在两种模式里都会调用 `'weather'` 和 `'clouds'` pass，但挂载点 `game.extraPass`（main.js:153）为空，可选模块 `src/game/extras.js` 不存在。原版模式的方块云同样缺失（光影模式有体积云）。
- `pipeline.js:185` 的 `this.snowy` 从未赋值 → 寒带下雪时地面也会"变湿"。
- 自动循环永远不会进入 `snow`，只能用 `/weather snow`。
- environment.js:76 `this.rainbow = Math.max(this.rainbow, 0)` 不起作用（本意可能是下雨时清零彩虹）。
- 降雪用群系基础温度，没有调用生成器的 `temperatureAt`（带海拔递减）；高山顶如果群系温度 ≥ 0.15 就不会积雪。

## 5. 可调旋钮

| 位置 | 字段 | 现值 |
|---|---|---|
| environment.js:20–28 | `PRESETS` | 见 §1.1 |
| environment.js:69 | 逼近步长 | rain/thunder 0.01，其余 0.002 /tick |
| pipeline.js:186 | 湿润时间常数 | 变湿 0.08/s，变干 0.03/s |
| deferred.js:78 | 水洼噪声 | 频率 0.15，`smoothstep(0.45, 0.7)` |
| deferred.js:145–146 | 湿润 | 暗化下限 0.55，镜面度目标 0.9，最低 0.35 |
| common.js:31 | 风 → 晃动 | `0.04 + 0.08·wind` |
| gameplay.js:96, 108 | 降雪 / 闪电概率 | 1/16，1/20000 |
