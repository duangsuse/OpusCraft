# VoxelCraft 渲染器重构交接（v1 / v2）

> 最终目标：把 `./old.htm`（青屿）里的 **DDA 后处理渲染器 + Tweakpane 面板** 移植到 `v2.js`，
> 让它直接渲染 VoxelCraft 的 3D 体素世界（而非高程图），并与 `v1.js` 共享同一套顶点 / 光照 / 材质接口。

## 0. 现状一览

| 文件 | 作用 | 状态 |
|---|---|---|
| `VoxelCraft.html` | 游戏主体：世界存储/生成、**光照（共享）**、实体、UI、输入、天空、HUD | 已改造：共享接口 + 渲染器加载器 |
| `v1.js` | 光栅化渲染器：逐面网格 + 顶点 AO + 四角平滑光照 + 水波 | 完成（与重构前画面一致） |
| `v2.js` | DDA 渲染器 | **占位**：内部直接复用 v1，`name = 'v2(stub→v1)'` |
| `tools/verify-renderer.mjs` | 无头 Chromium + CDP 接口验证脚本 | 完成，全部通过 |
| `old.htm` | 移植来源：Max-Mip 高程图 DDA + 水面/雾/AO/阴影 + Tweakpane | 只读参考 |

切换：`VoxelCraft.html?r=v1`（默认）/ `?r=v2`；非法值或加载失败 → 自动回退 v1（控制台 `console.error`）。
确认方式：F3 调试面板显示 `<name> <stats()>`；控制台打印 `[VoxelCraft] renderer <name>`；`window.game.VR.name`。

已完成的玩法功能点（与渲染器无关，验证脚本一并覆盖）：
- **N** noclip（无碰撞 + 飞行，HUD `NOCLIP`，生物不追踪）
- **F** 拾取准星方块到快捷栏（已有→选中；背包有→交换；否则放 64 个）；飞行改为 **双击空格**
- **E** 背包顶部「All Blocks」面板：左键拿 64 / 右键拿 1 / Shift 入包 / 持物点击=删除

## 1. 主文件结构（`VoxelCraft.html`，行号为当前版本近似值）

| 行 | 内容 |
|---|---|
| ~99 | importmap：`three@0.160.0`（old.htm 用 r170，移植时注意 API 差异很小，可按需升级） |
| ~884–895 | `renderer` / `scene` / `camera`（`renderer.autoClear = false`，`outputColorSpace = Linear`，`ColorManagement.enabled = false`） |
| ~897–922 | **共享接口**：`GLSL`、`U` |
| ~924–975 | 天空球 / 太阳 / 月亮 / 星星 / 云 / 选择框 / 裂纹（都是 `scene` 里的普通网格，由渲染器的 `render()` 一起画） |
| ~979 | `class Chunk` |
| ~1110–1199 | **共享光照**：`RB/RSKY/RBLK`、`FACES/UVS/AO_CURVE`、`buildRegion`、`computeLight`、`storeLight` |
| ~1200–1242 | **共享顶点**：`MeshBuilder`、`makeGeometry` |
| ~1243–1260 | 渲染器加载器 `RENDERER_ID` / `RCTX` / `VR`，以及 `meshChunk` / `disposeChunk` 包装 |
| ~1279 | `updateChunks`（流式加载，预算 ms） |
| ~1305 | `setBlock`（编辑 → `markUrgent` 本区块及接壤区块） |
| ~2138 | `hudScene`（手持物品，单独相机，渲染器**不负责**） |
| ~2183–2208 | `updateSky(dt)`：写 `U.*`、雾、天空，末尾调用 `VR.update(dt)` |
| ~2508–2527 | `frame()`：`renderer.clear()` → `VR.render()` → `clearDepth` → 画 `hudScene` |
| ~2531 | `window.game`（调试句柄，含 `VR`、`MeshBuilder`、`RCTX`） |

## 2. 渲染器模块接口

```js
// v1.js / v2.js 都必须导出：
export function createRenderer(ctx) {
  return {
    name,              // string，如 'v1'、'v2'
    buildChunk(c),     // 区块 c 的方块或光照变化后调用（见 §4 调用时序）
    disposeChunk(c),   // 区块卸载前调用；必须释放该区块的所有 GPU 资源，并把 c.mesh / c.waterMesh 置 null
    update(dt),        // 每帧调用一次，在 updateSky 写完 U.* 之后
    render(),          // 每帧绘制世界；主循环已 renderer.clear()，之后还会 clearDepth 画 HUD
    stats(),           // string，显示在 F3 面板
  };
}
```

加载方式（主文件）：`VR = (await import(\`./${RENDERER_ID}.js?t=...\`)).createRenderer(RCTX)`（顶层 await，`?t=` 防缓存）。

### 2.1 `ctx`（= `RCTX`）字段

| 字段 | 说明 |
|---|---|
| `THREE, scene, camera, renderer` | 同一 three 实例；`scene` 中包含天空、太阳月亮、星星、云、生物、掉落物、粒子、选择框 |
| `U` | 共享 uniform **对象**（用 `{...U}` 展开到材质里，使所有材质共享同一份引用）：`uAtlas, uSkyDarken, uSkyTint, uFogColor, uFogNear, uFogFar` |
| `GLSL.light / .mat / .fog` | 共享 GLSL 片段（见 §3） |
| `MeshBuilder, makeGeometry` | 共享顶点格式构建器（见 §3.1） |
| `atlas` | `THREE.DataArrayTexture`，16×16×NT，RGBA8，Nearest/NearestMipmapLinear，Repeat |
| `CS=16, CH=96, SEA=40, RS=48, RSCH=RS*CH, PS=64` | 常量 |
| `B, BLOCKS` | 方块 id 表 / 方块定义 |
| `SOLID, OPAQUE, LIGHT_PASS, RENDER, EMIT` | `Uint8Array(256)` 按方块 id 查表 |
| `T_TOP, T_BOT, T_SIDE` | 每个方块顶面 / 底面 / 侧面的 atlas 图层号 |
| `R_NONE=0, R_CUBE=1, R_CROSS=2, R_TORCH=3, R_WATER=4` | `RENDER[id]` 的取值 |
| `FACES, UVS, AO_CURVE` | 面表（+X,−X,+Y,−Y,+Z,−Z；含角点 `c`、`shade`、区域偏移 `n` 与 AO 邻居偏移 `ao`） |
| `RB, RSKY, RBLK` | 3×3 区块区域缓冲（48×48×96），**只在 `buildChunk` 调用期间有效** |
| `chunks, ck, getBlock` | 区块 Map / key 函数 / 世界坐标取方块 |

## 3. 共享接口细节

### 3.1 顶点（`MeshBuilder` → `makeGeometry`）

| attribute | 类型 | 含义 |
|---|---|---|
| `position` | Int16×3 | 区块内坐标 × `PS`（64），着色器里 `/PS` |
| `aUv` | Uint8×2 | texel 单位，16 = 一格；着色器里 `aUv/16` |
| `aData` | Uint8×4 | `x` = atlas 图层，`y` = 天空光×16，`z` = 方块光×16，`w` = 明暗（面方向 × AO）×255 |

- `mb.vert(x,y,z,u,v,layer,sky,blk,shade)`，`mb.quad(base, flip)`（`flip` 用于 AO 各向异性翻转对角线）。
- `makeGeometry` 会在上传 GPU 后释放 CPU 数组（`onUpload(releaseArray)`），并为区块设置 bounding sphere。网格位置 = `(cx*16, 0, cz*16)`。

### 3.2 光照（主文件统一计算，渲染器只读）

- 体素光等级 0..15：`sky`（天空光，竖直无衰减 + BFS），`blk`（方块光，`EMIT[id]`，火把 = 14）。
- 每次 `meshChunk(c)` 都执行 `buildRegion → computeLight → storeLight`：
  - `RB/RSKY/RBLK`：区域缓冲，索引 `rx*RSCH + rz*CH + y`；中心区块位于 `rx,rz ∈ [16,32)`。
  - `c.sky / c.blk`：中心区块持久化的光照，`Uint8Array(16*16*96)`，**索引与 `c.blocks` 相同**：`(lx*16 + lz)*96 + y`。
  - 区块边界光照变化时自动 `markDirty` 邻居（随后邻居会再次 `buildChunk`）。
- GLSL：`vec3 voxLight(float sky, float blk)`（参数 0..15），内部使用 `bright()`、`uSkyDarken`（夜晚整体压低天空光，0..10）、`uSkyTint`，方块光色 `(1, .86, .66)`。
- JS 等价函数：`brightJS`、`lightColor(x,y,z,out)`（实体/粒子用）。

### 3.3 材质

- GLSL：`vec4 matSample(vec2 uv, float layer)`（`uv` 以方块为单位，0..1 = 一格），`vec3 applyFog(vec3 c, float viewDist)`。
- 透明规则：`a < 0.5` 视为镂空（树叶、花草、火把）；水为半透明（v1 中 `depthWrite=false`、`DoubleSide`、水面顶部下沉 1/8）。
- `GLSL.mat` 自带 `precision highp sampler2DArray;`，需放在片元着色器里、使用 `uAtlas` 之前。

## 4. 调用时序

```
启动:   createRenderer(RCTX)
每帧:   updateChunks(budget)
          ├─ 对 urgent / 尚未构建 / dirty 的区块: meshChunk(c)
          │     buildRegion → computeLight → storeLight(c) → VR.buildChunk(c) → c.meshed = true
          └─ 每 60 帧卸载远处区块: VR.disposeChunk(c) → chunks.delete
        updateSky(dt)   → 写 U.*、scene.fog → VR.update(dt)
        renderer.clear(); VR.render(); clearDepth; render(hudScene)
编辑:   setBlock → markUrgent(本区块 + 接壤区块) → 下一帧 meshChunk
```

注意：
- `buildChunk` 可能对同一区块被**反复**调用（编辑、邻居光照变化），必须可重入、先释放旧资源。
- 区块只有在 3×3 邻居都已生成时才会被构建；`disposeChunk` 只在卸载时调用。
- `c.mesh / c.waterMesh` 这两个字段名由 v1 使用，验证脚本也会检查 `disposeChunk` 之后它们为空。v2 若不产出网格，保持为 `null` 即可。

## 5. v2 移植计划：old.htm → v2.js

### 5.1 来源拆解（old.htm）

| old.htm 位置 | 内容 | 在 v2 中的去向 |
|---|---|---|
| L359–412 | 天空渐变球 + 星星、太阳色、曝光、雾、「光照与风」面板 | 视觉参数并入 v2 后处理 uniform；天空仍由主文件 `updateSky` 管，v2 读 `U.uFogColor` 等 |
| L611 `VOX` | 参数默认值（steps / shadowSteps / scale / fog* / ambient / ao* / shadow* / water* / wave / refl / foam / spec） | v2 的 `P` 参数对象（可存 localStorage） |
| L740–790 | 全屏四边形 `blit`、高程图 RT、Max-Mip 金字塔 | **替换**为 3D 体素纹理 + 占用金字塔（见 5.2） |
| L792–1060 `post` 着色器 | `trace()` 分层 DDA、`faceAO()`、阴影射线、水面（菲涅尔 / 焦散 / 泡沫 / 高光 / 两阶不透明度）、两阶雾、水下雾 | 移植主体：`trace()` 改为 3D，其余着色逻辑基本照搬 |
| L1062–1095 | `compMat` 低分辨率合成；`sceneRT`（带 DepthTexture）/ `lowRT` | 照搬：场景先画到 `sceneRT`，DDA 读深度后合成 |
| L1098–1145 `gg.render` | 每帧：隐藏地形层 → 场景 → `sceneRT` → 设置 uniform → `post` | 改写成 `v2.render()` |
| L1150–1188 | Tweakpane 绑定（`scale / steps / shadowSteps / ambient / ao / shadow / fog / water...`） | 照搬到 v2 面板 |

old.htm 的依赖（`gg.P.lightDir`、`gg.p1`、`gg.waterY()`、`gg.ctl.rising`、`terrainLayer`、`hmCam`）在 VoxelCraft 中都不存在，需要替换：
太阳方向 ← `worldTime`（需由主文件通过 ctx 暴露 `sunDir`，或 v2 读 `scene` 中的 sun 网格位置）；水面 ← 体素 `B.WATER`（不再是单一水平面）；地形层 ← v2 根本不往 `scene` 里加区块网格。

### 5.2 v2 数据通路（建议；**与 §7 冲突处以 §7 为准**）

1. **体素 3D 纹理**（环形寻址，跟随玩家）：尺寸 `(2*rd+3)*16 × 96 × 同`，格式 `RG8UI`，`R` = 方块 id，`G` = `sky<<4 | blk`。
   - `buildChunk(c)`：用 `c.blocks + c.sky + c.blk` 打包出 16×96×16 的数据，`texSubImage3D` 写入槽位 `((cx mod N), (cz mod N))`。three r160 的 `Data3DTexture` 不支持局部更新，需要直接调用 GL：`renderer.properties.get(tex).__webglTexture` + `renderer.state.bindTexture`，写完后调用 `renderer.resetState()`。
   - `disposeChunk(c)`：把该槽位清零（视为空气或「未加载」）。
2. **占用金字塔**（对应 old.htm 的 Max-Mip）：4³ 砖与 16³ 区块段各一级 `R8` 3D 纹理，记录「是否有非空气」。DDA 在空砖之间大步跳跃，进入非空砖后做逐格 DDA。
3. **着色**：命中面后用 `matSample` 取 atlas，光照用 `voxLight(sky, blk)`（取命中面前方体素的光照，可三线性平滑），AO 用 old.htm 的 `vAO` 公式，查询邻居 `SOLID`。阴影：沿太阳方向发射第二条 DDA 射线，并乘以 `sky/15` 防止洞穴漏光。
4. **特殊方块**：
   - 树叶 / 玻璃：命中后 `a < 0.5` 继续步进。
   - 花草 `R_CROSS`：格内两条对角平面求交并做 alpha 测试。
   - 火把 `R_TORCH`：格内小盒子求交（贴墙时倾斜，可先只做直立版本）。
   - 水 `R_WATER`：命中水面时记录 `tw`，按 old.htm 的水面逻辑叠加，再继续追踪水底。
5. **合成**：`scene`（天空、实体、粒子、选择框、云）→ `sceneRT`（带深度）；`post` 读取 `tDepth`，只在体素比场景更近时覆盖，并输出深度。`scale < 1` 时走低分辨率 RT，再用 `compMat` 合成。
6. **Tweakpane**：`tweakpane@4.0.5`（CDN 可用），只在 v2 中创建面板；若采用动态 `import('https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.js')` 不需要改 importmap。

### 5.3 v2 验收标准

- `node tools/verify-renderer.mjs` 全部通过（v2 不产出网格时，会自动跳过顶点检查）。
- 放置 / 破坏方块、火把光照在下一帧可见；跨区块移动时没有空洞或闪烁。
- 实体、粒子、选择框和 DDA 地形相互遮挡正确（依赖深度）。
- 面板可调 `scale / steps / shadowSteps / ambient / ao / shadow / fog* / water*`，F3 中的 `stats()` 显示 DDA 分辨率和耗时。

## 6. 验证

```bash
# 需要本地服务：http://localhost:8765/（已有 http-server）
node tools/verify-renderer.mjs            # 或传入 baseURL 参数
```

脚本依次加载 `?r=v1`、`?r=v2`、`?r=bogus`，检查以下项目：
- 渲染器选择和回退。
- 接口函数是否齐全。
- 区块构建完成后，每个已构建区块都有 `c.sky/c.blk`。
- 顶点格式（Int16/Uint8/Uint8，itemSize 3/2/4）。
- 着色器使用了 `voxLight / matSample / applyFog`，并且共享 `U`。
- 放置火把会触发 `buildChunk`，且 `c.blk = 14`；移除后恢复为 0。
- `disposeChunk` 释放资源。
- `render()` 无 GL 错误，且有绘制调用。
- 功能点 1 的 N/F/E 按键。
- 页面没有未捕获异常。

当前结果：**3 组全部 PASS**。

## 7. 计划评审与修订（可行性 + 性能）

> 背景：old.htm 的高程图 DDA 在 `scale=0.8`、`steps=72`、`shadowSteps=48` 下流畅。
> 3D 体素 DDA 每像素成本天然更高（没有「一列一个高度」的捷径、没有 y>hMax 直接判空），
> 所以要靠 **射线更短（雾距裁剪）+ 空区跳得更快（砖块 + 列高）+ 天空像素早退** 把成本拉回同一量级。

### 7.1 §5.2 中需要修正的点

| # | 原计划 | 问题 | 修订 |
|---|---|---|---|
| 1 | 环形纹理 `N = 2*rd+3` | 卸载半径是 `R+2`（`updateChunks`），已 mesh 的区块可分布在 `2R+5` 宽度内，`cx mod N` 会撞槽；`disposeChunk` 清零时可能清掉别人的数据 | `N = 2*rd + 5`，并为每个槽位记录 `owner = ck(cx,cz)`：`disposeChunk` 仅在 `owner === 自己` 时清零；`buildChunk` 覆盖时更新 owner |
| 2 | `buildChunk` 用 `RB/RSKY/RBLK` 打包 | 区域缓冲只在 `meshChunk` 期间有效；改 `rd`（重建纹理）、恢复上下文时需要 **重传所有已 mesh 区块** | 打包一律用持久化的 `c.blocks / c.sky / c.blk`（索引同为 `(lx*16+lz)*96+y`）；提供 `reuploadAll()` 遍历 `ctx.chunks` |
| 3 | 直接调 GL `texSubImage3D` | 可行，但要手动处理 `UNPACK_*` 状态与 `resetState()` | 优先用 three 自带 `renderer.copyTextureToTexture3D(box, pos, srcData3DTexture, dstTex)`（r160 已有，内部即 `texSubImage3D`；dst 先 `renderer.initTexture()`）。只有它对 `RG8UI` 不工作时才退回裸 GL（**待验证**：RGIntegerFormat + UnsignedByteType → RG8UI） |
| 4 | 占用金字塔用 GPU pass 生成 | 没必要：4³ 砖占用在 CPU 打包时顺手算（每区块 4×24×4 = 384 字节） | CPU 生成，与体素数据同帧上传；另加 **每区块列高 `maxY`**（N×N `R8` 2D 纹理）和全局 `uWorldMaxY` uniform，取代 16³ 层级 |
| 5 | 「post 输出深度」只写了一句 | 这是正确遮挡的关键，而且 `scale<1` 时低分辨率深度也要传到全分辨率 | 见 7.3 的三段式合成；`depthTest:true + depthFunc:AlwaysDepth + depthWrite:true + gl_FragDepth`（`depthTest:false` 时 GL 会连深度写入一起关掉） |
| 6 | 世界坐标直接进 shader | 玩家走远后（坐标 >1e5）float 精度不够，DDA 会出现裂缝/抖动 | 所有射线数学在 **「玩家所在区块原点」局部坐标** 中进行：JS 用 double 算 `ro = camPos - origin`，shader 只见 ±(N/2·16) 范围的数值 |
| 7 | `matSample` 隐式 mip | 光线步进中相邻像素 uv 不连续，隐式导数在体素边缘乱跳 → 闪烁/糊 | 用 `textureLod`：`lod = log2(tHit * uTexelAngle * 16)`（`uTexelAngle` = 单个 DDA 像素的视角弧度）。建议在主文件 `GLSL.mat` 增加 `matSampleLod(uv, layer, lod)`（v1 不受影响） |
| 8 | 太阳方向待定 | — | 主文件 `U` 增加 `uSunDir`（`updateSky` 里由 `worldTime` 算：`normalize(sx, sy, 0.2)`，与 `sun.position` 同源），v1 不用但也无害 |
| 9 | 水面按 old.htm 的「单一水平面」 | 水是体素（海平面 + 水桶放置任意高度） | 在 DDA 中处理：从非水进入水体素时记录 `tw` 与入射法线，继续步进直到命中非水非空气（水底）或离开水体；`depth = tHit - tw`；水色逻辑照搬。顶面下沉 1/8 可后做 |
| 10 | 阴影射线 | 3D 中阴影射线最贵，且 v1 本来没有太阳阴影 | 默认关闭（`shadowSteps=0`）；开启时：`sky<8` 或 `ndl<=0` 直接跳过；`shadowDist` 默认 24；射线超过 `uWorldMaxY` 立即判无遮挡 |

### 7.2 推荐的 shader 结构：两级嵌套 DDA（比 old.htm 的 L 升降更易写对）

```
trace(ro, rd, maxD):
  if (rd.y >= 0 && ro.y >= uWorldMaxY) return miss           // 天空早退
  clip [tEnter,tExit] to ring AABB (局部坐标) 与 maxD          // 不读环外数据
  outer: Amanatides–Woo over 4³ bricks (ivec3 cell, vec3 tMax/tDelta)
    每进入一个新区块列(16×16)且 rd.y>=0 且 y>chunkMaxY → 直接跳到列出口   // 列高跳过
    brick 空 → 继续
    brick 非空 → inner: 体素 DDA，限定在该 brick 内（≤10 步），从 brick 入口 t 开始
        id==AIR → 继续
        OPAQUE  → 命中，返回 (t, normal, cell)
        CUTOUT(叶/玻璃/花草/火把) → 求交 + alpha 测试，不透则命中，透则继续；总 alpha 测试次数 ≤8，超过按不透明处理
        WATER   → 首次进入记 tw/normal，之后继续
    inner 无命中 → 回到 outer
```

- 步数上限：`uSteps`（uniform，不必 recompile；old.htm 已是 `if (i>=maxSteps) break` 形式）。
- 命中后着色：取面前方 3×3 体素（9 次 `texelFetch`，同一纹素含 id+sky+blk），同时得到 **v1 同款四角平滑光照与 AO**（复用 `emitCube` 的「两侧都不透明则不计角点」规则），双线性到像素 → 与 v1 像素级一致，然后 `voxLight() * shade`、`matSampleLod()`、`applyFog()`。
- 方块表（`RENDER / OPAQUE / SOLID / T_TOP / T_BOT / T_SIDE`）打进一张 256×1 `RGBA8UI` 纹理 `uBlockInfo`，shader 里 `texelFetch(uBlockInfo, ivec2(id,0), 0)` 一次取全。
- 体素纹理用 `usampler3D` + `texelFetch`（WebGL2，项目已依赖 `sampler2DArray`，无额外要求）。

### 7.3 合成流程（解决实体 / 粒子 / 裂纹 / 选择框遮挡）

```
① renderer.render(scene, camera) → sceneRT(color + DepthTexture)   // 整个 scene：天空、生物、掉落物、粒子（Points 写深度）、选择框…
② DDA pass:
     scale==1: 直接画到屏幕，material.depthTest=true, depthFunc=AlwaysDepth, depthWrite=true, 写 gl_FragDepth
     scale<1 : 画到 lowRT（RGBA + R32F/深度打包在 alpha 或第二个附件），再由 compMat 画到屏幕并写 gl_FragDepth = 低分辨率深度（nearest 采样）
   tDepth 用于 maxD = min(uFogFar, sceneZ/cosF)：体素比场景远时不覆盖场景颜色
③ 第二次只画「覆盖层」：crackMesh（polygonOffset 依赖真实深度）、highlight、以及其它 transparent/depthWrite=false 的对象 —— 这样它们能被 DDA 地形正确遮挡
   （v2 每帧 traverse 一次 scene 把这些对象临时 visible=false/true，对象数很少，成本可忽略；也可让主文件把它们挂到 ctx.overlay 组）
④ 主循环照旧 clearDepth → hudScene
```

`gl_FragDepth` 公式（z = 视空间正距离 = `tHit*cosF`）：`depth = far*(z-near) / (z*(far-near))`。

### 7.4 性能建议（按收益排序）

1. **射线长度裁到雾距**：`maxD = min(uFogFar, sceneZ/cosF)`。雾远端颜色 == 天空地平线色（`tmpHor`），超出雾距显示天空与 v1 视觉无差，但射线从「视距」缩到 `rd*16-2`（rd=6 时 94 格；rd=10 时 158 格）。这是把 3D DDA 拉回 old.htm 成本的第一要素。
2. **天空像素早退**：`uWorldMaxY`（全局）+ 每区块 `chunkMaxY`（2D 纹理）。平地场景天空占屏 40–50%，这两步让这些像素接近零成本；没有它们，近水平略向上的射线会穿过几十个空砖。
3. **4³ 砖跳跃**：rd=10 时对角线射线最坏 ≈ 60 砖步 + ≤10 体素步；通常 <25 步命中地面。估算 1080p×0.8² ≈ 1.3M 射线 × ~30 次 fetch ≈ 40M 3D fetch/帧，与 old.htm（72 步 × 2D fetch）同一量级，桌面 GPU 60 fps 可期；核显建议默认 `scale 0.6`。
4. **DDA 分辨率上限**：主文件 `pixelRatio` 可到 1.5，4K/高 DPR 下 0.8 仍太大。`scale` 之外再设 `maxDDAPixels`（如 1920×1080 或 2.1M 像素）取 min；面板显示实际 DDA 分辨率。
5. **阴影**：默认关闭；开启时按 7.1-#10 跳过无效射线。进阶可用棋盘格/半分辨率阴影或只对 `n.y>0` 的顶面算。
6. **着色只在命中后做**：9 次邻域 fetch + 1 次 atlas 采样 + fog，对比步进可忽略；不要在循环内采样 atlas（除 cutout 方块的 alpha 测试）。
7. **alpha 测试上限**：树冠区域每条射线最多 8 次透明命中，防止森林场景单像素几十次 atlas 采样；超过后按不透明处理（视觉差异极小）。
8. **局部坐标 + 整数 DDA**：除精度外，`ivec3` 单元 + `tMax/tDelta` 的分支少，比 old.htm 的 float `floor()`/`exp2()` 升降更省 ALU。
9. **上传成本**：每区块打包 16×96×16×2B = 48 KB + 384 B 砖 + 1 B 列高，CPU <0.3 ms/区块，可在 `updateChunks` 的 5 ms 预算内与光照一起完成；不要每帧全量重传。
10. **低分辨率合成**：先照搬 old.htm 的 `l.a` 掩码混合；若地形/实体边缘锯齿明显再升级为深度感知上采样（比较 lowRT 深度与 sceneRT 深度选最近）。时间域重投影（TAA 式）留作最后手段。
11. **统计**：`stats()` 用 `EXT_disjoint_timer_query_webgl2` 读 DDA pass GPU 时间（不可用时退回帧时间 EMA），F3 同时显示 `DDA WxH / steps / shadow`。

### 7.5 主文件需要的最小改动

- `U.uSunDir`（`updateSky` 内更新）。
- `GLSL.mat` 增加 `matSampleLod(vec2 uv, float layer, float lod)`。
- （可选）`ctx.overlay` 组 / 或 `ctx.settings` 真正赋值为 `settings`（现在是 `null`），以便 v2 监听 `rd` 变化重建环形纹理。
- `tools/verify-renderer.mjs` 增加 v2 专项：放火把后下一帧读回 DDA 像素亮度变化；跨区块移动 N 帧后无 GL 错误；`rd` 从 6→8 后 `render()` 正常。

### 7.6 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| M0 | 环形 3D 纹理 + 砖占用 + 列高，仅 `OPAQUE` 方块，纯色/atlas 无 AO，`scale=1`，与 sceneRT 深度合成 | verify 通过；跨区块移动无洞；放/挖方块下一帧可见 |
| M1 | 平滑光照 + AO + `voxLight/applyFog` + `matSampleLod`；cutout（叶/玻璃/花草/火把）；水 | 与 v1 并排截图对比光照一致；火把光下一帧可见 |
| M2 ✅ | `gl_FragDepth` + 覆盖层二次绘制；`scale<1` 低分辨率路径；Tweakpane；stats GPU 计时 | 实体/粒子/裂纹遮挡正确；`scale 0.8` 下桌面 60 fps |
| M3 | 阴影射线；`rd` 变更重建；参数持久化 localStorage；核显调优 | 面板全部参数可调，默认值写回 §5.1 的 `P` |

## 8. v2 调参面板 DSL（Tweakpane，右上角）

> 目标：面板由一份**声明式表**生成；所有 vec2 参数不直接绑定 pane，而是绑定一个 `xy ∈ [-1,1]²` 的代理点，
> 由 DSL 把 xy 线性/对数映射回各自真实区间，方便在同一个方形拾取器里手调两个量纲不同的参数。
> 区间按 VoxelCraft 的尺度（1 方块 = 1 单位，CH=96，视距 ≤ 16 区块 = 256 格）重新设定，old.htm 的 0..2000 一类区间不再适用。

### 8.1 语法

```
spec   := [ section, ... ]
section:= [ title, [ row, ... ] ]
row    := [ key, target, opts ]              // 标量
        | [ 'v', vec2(target, kx, ky), V2(label, Rx, Ry) ]   // 二维：key 固定写 'v'（占位，不参与持久化）
target := () => object                       // 惰性取对象（P / ctx.settings 可能在声明之后才存在）
opts   := { label, ...R(min, max, step?, log?), fx? }
R(min, max, step = 0.01, log = false)  → { min, max, step, log }
V2(label, Rx, Ry)                       → { label, rx: Rx, ry: Ry, fx? }
vec2(target, kx, ky)                    → { __vec2: true, get: target, kx, ky }
```

- `fx`：参数生效方式，缺省 `'u'`（只改 uniform）。`'rt'` = 重建 RT（scale）、`'tex'` = 重建环形纹理并重传（rd）、`'sh'` = 重编译着色器（steps/shadowSteps 若以 define 形式存在；若用 uniform 上限则无需）。
- 映射（n ∈ [-1,1]，r = R(...)）：
  - 线性：`v = min + (n+1)/2 · (max−min)`；反向 `n = 2(v−min)/(max−min) − 1`
  - 对数（`log=true`，要求 min>0）：`v = min · (max/min)^((n+1)/2)`；反向 `n = 2·ln(v/min)/ln(max/min) − 1`
  - 量化：`v = round(v/step)·step`；写回前 `n` clamp 到 [-1,1]
- 二维行的 pane 绑定是 `{x:{min:-1,max:1}, y:{min:-1,max:1, inverted:true}, picker:'inline', expanded:true}`（`inverted` 让"上 = 大"）；
  change 时把 label 更新为 `"<label> <vx> / <vy>"` 显示真实值。
- Tweakpane 的 point2d 是**就地写属性**（`target.writeProperty('x', …)`），所以代理点必须用 x/y 访问器对象，而不是每次返回新对象。

### 8.2 参考实现（放在 v2.js 内，约 60 行）

```js
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const R = (min, max, step = 0.01, log = false) => ({ min, max, step, log });
export const V2 = (label, rx, ry, fx) => ({ label, rx, ry, fx });
export const vec2 = (get, kx, ky) => ({ __vec2: true, get, kx, ky });
const toN = (v, r) => clamp(r.log ? 2 * Math.log(v / r.min) / Math.log(r.max / r.min) - 1
                                  : 2 * (v - r.min) / (r.max - r.min) - 1, -1, 1);
const fromN = (n, r) => {
  n = clamp(n, -1, 1);
  const v = r.log ? r.min * Math.pow(r.max / r.min, (n + 1) / 2) : r.min + (n + 1) / 2 * (r.max - r.min);
  return r.step ? Math.round(v / r.step) * r.step : v;
};
const fmt = v => Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

// apply(key, fx) 由 v2 提供：按 fx 决定只更新 uniform / 重建 RT / 重传纹理 / 重编译
// resetDefaults() 把 P 恢复为 §8.4 默认值（并触发所有 fx）
export function buildPane(pane, spec, apply, resetDefaults) {
  const refreshers = [];
  for (const [title, rows] of spec) {
    const f = pane.addFolder({ title, expanded: title === '性能' });
    for (const [key, tgt, o] of rows) {
      if (tgt && tgt.__vec2) {
        const { get, kx, ky } = tgt, { rx, ry, label, fx } = o;
        const pt = { get x() { return toN(get()[kx], rx); }, set x(n) { get()[kx] = fromN(n, rx); },
                     get y() { return toN(get()[ky], ry); }, set y(n) { get()[ky] = fromN(n, ry); } };
        const b = f.addBinding({ v: pt }, 'v', { label, x: { min: -1, max: 1 }, y: { min: -1, max: 1, inverted: true },
                                                  picker: 'inline', expanded: true });
        const relabel = () => { b.label = `${label} ${fmt(get()[kx])} / ${fmt(get()[ky])}`; };
        b.on('change', () => { relabel(); apply(kx, fx); apply(ky, fx); });
        relabel(); refreshers.push(relabel);
      } else {
        const { label, min, max, step, fx } = o;
        f.addBinding(tgt(), key, { label, min, max, step }).on('change', () => apply(key, fx));
      }
    }
  }
  const refresh = () => { pane.refresh(); refreshers.forEach(r => r()); };
  pane.addButton({ title: '重置默认' }).on('click', () => { resetDefaults(); refresh(); });
  return { refresh };
}
```

> 注意 `tgt()` 在 `addBinding` 时才求值，所以 `P` / `ctx.settings` 只需在调用 `buildPane` 之前存在即可。
> 对数区间在 xy 拾取器中是"等比"滑动：`shadowDist` 从 4→96 正好跨 -1→+1。

### 8.3 面板声明（最终版，区间已按 VoxelCraft 尺度调整）

```js
const S = () => ctx.settings, Pr = () => P;
export const PANEL = [
  ['性能', [
    ['rd',          S,  { label: '视距(区块)', ...R(2, 16, 1), fx: 'tex' }],          // 与主菜单 settings.rd 同一字段
    ['scale',       Pr, { label: 'DDA 分辨率', ...R(0.25, 1.5, 0.05), fx: 'rt' }],    // >1 为超采样，仅排错用
    ['steps',       Pr, { label: '渲染迭代', ...R(32, 256, 8) }],                    // 外层砖步 + 内层体素步 合计上限
    ['shadowSteps', Pr, { label: '阴影迭代', ...R(0, 64, 4) }],                      // 0 = 关闭阴影射线
    ['v', vec2(Pr, 'shadowStrength', 'shadowDist'), V2('阴影 强度/距离', R(0, 1), R(4, 96, 1, true))],
    ['v', vec2(Pr, 'waterClarity', 'reflStrength'), V2('水 透亮/反射',   R(0, 1), R(0, 1))],
    ['fogA1',       Pr, { label: '雾强度', ...R(0, 1) }],                             // 1 = 与 v1 一致（uFogNear/Far 由主文件给）
  ]],
  ['光影', [
    ['sun',         Pr, { label: '日照倍率', ...R(0, 1) }],                           // 0 = 纯 voxLight（= v1）
    ['exposure',    Pr, { label: '曝光度', ...R(0.2, 3, 0.01) }],
    ['v', vec2(Pr, 'sunAz', 'sunEl'),           V2('光向量 方位/仰角偏移', R(-3.14, 3.14, 0.01), R(-1, 1, 0.01))],
    ['v', vec2(Pr, 'aoStrength', 'aoCurve'),    V2('AO 强度/曲线', R(0, 1), R(0.5, 3, 0.01, true))],
    ['v', vec2(Pr, 'waterA2', 'waterA1'),       V2('水体不透明 深/浅', R(0, 1), R(0, 1))],
    ['v', vec2(Pr, 'waterD2', 'waterD1'),       V2('水深过渡 深/浅(格)', R(1, 24, 0.5, true), R(0, 8, 0.25))],
    ['v', vec2(Pr, 'waveStrength', 'foamWidth'),V2('水面 波纹/泡沫', R(0, 0.2, 0.005), R(0, 1.5, 0.05))],
  ]],
];
```

与草案的差异：
- `viewDist` → 直接绑 `ctx.settings.rd`（主文件需把 `RCTX.settings = settings`），避免两个视距。
- `ambient` 改名 `sun`：VoxelCraft 的基础光来自 `voxLight(sky, blk)`，不存在 old.htm 那种"环境光 + 太阳"模型；
  `sun` 定义为叠加项 `light *= 1 + sun · max(dot(n, sunDir), 0) · dayF · shadow · sky/15`，取 0 时与 v1 完全一致。
- `lightDir` 改为 `sunAz/sunEl` **偏移**（太阳基准方向来自 `worldTime`/`U.uSunDir`），默认 0/0；用于手调而非替代昼夜。
- `shadowDist` 10..1000 → 4..96（对数）；`waterD1/D2` 0..20/0..60 → 0..8/1..24 格；`fogEnd/fogEnd2/fogA2` 删除（雾距由主文件 `U` 决定，v2 只保留强度 `fogA1`）。
- `steps` 上限 512 → 256（砖级 DDA 下 160 格视距最坏约 70 步，256 足够）；`shadowSteps` 128 → 64。
- `scale` 上限 2 → 1.5。

### 8.4 默认值（`P`，持久化到 localStorage `vc.v2.params`，带 `ver` 字段）

| key | 默认 | fx | 说明 |
|---|---|---|---|
| scale | 0.65 | rt | 用户上限；实际 = `min(scale, sqrt(maxMP·1e6 / 像素数))` |
| maxMP | 0.7 | rt | DDA 像素上限（百万），大窗口自动降内部分辨率保帧 |
| steps | 128 | u | uniform 上限，循环硬上限 512；耗尽时按「全雾远景」返回（见 §7.7） |
| shadowSteps | 0 | sh | 0 时着色器剔除阴影分支 |
| shadowStrength / shadowDist | 0.6 / 24 | u | |
| waterClarity / reflStrength | 0.72 / 0.36 | u | |
| fogA1 | 1.0 | u | |
| sun | 0.33 | u | |
| exposure | 0.86 | u | |
| sunAz / sunEl | 1.18 / 0.32 | u | 弧度偏移 |
| aoStrength / aoCurve | 0.59 / 1.92 | u | v1 的 AO_CURVE≈[0.42,0.62,0.8,1]，aoStrength 0.58 + aoCurve 1 最接近 |
| waterA2 / waterA1 | 1 / 0.78 | u | |
| waterD2 / waterD1 | 11 / 1.5 | u | 格 |
| waveStrength / foamWidth | 0.06 / 1.2 | u | 正弦波幅 / 岸边泡沫宽 |
| waveNoise / waveScale | 0.08 / 1 | u | 噪声法线强度（可平铺 128² 噪声贴图）/ 噪声频率 |
| uwNear / uwFar | 2 / 44 | u | **水下**雾近/远，覆盖主程序的 0.5 / 18（那档太浑） |
| (rd) | settings.rd | tex | 不在 P 中，改动同步主菜单滑块 |

### 8.5 集成约定

- 加载：`const { Pane } = await import('https://cdn.jsdelivr.net/npm/tweakpane@4.0.5/dist/tweakpane.js')`，仅 v2 创建；CDN 失败只 `console.warn`，渲染不受影响。
- 位置：Tweakpane 默认 `position:fixed; top:8px; right:8px`，正好右上；`z-index` 需高于 `#debug`/HUD。面板宽 280px，标题 `v2 DDA`，初始折叠。
- 开关：`F4` 切换显示（主文件 keydown 已处理 F3，需为 F4 加 `preventDefault` 并派发给 `VR.togglePanel?.()`）；显示时若处于 pointer lock 则 `exitPointerLock()`，面板关闭不自动重新锁定（点击画布即可）。
- 面板打开期间，`uiMode` 保持 `null` 但鼠标事件被 pane 吞掉；为避免误触方块，pane 容器上 `pointerdown` 需 `stopPropagation`（Tweakpane 已做，确认即可）。
- `apply(key, fx)`：`'u'` → 下一帧统一写 uniform（标脏即可）；`'rt'` → `ensureRT()`；`'tex'` → `rebuildRing(); reuploadAll()` 并同步 `$('rd')` 滑块；`'sh'` → `post.defines.SHADOW = shadowSteps>0 ? 1 : 0; post.needsUpdate = true`。
- `stats()` 增加 `P.scale` 与实际 DDA 像素尺寸，方便看面板改动是否生效。
- 验证脚本增项：`window.game.VR.P` 存在且含上表全部 key；`VR.panelSpec` 中每个 vec2 行 `fromN(toN(v)) === v`（在 step 精度内）往返一致。

### 7.7 M2 实施记录（用户反馈的三个问题）

数值都在 `--use-gl=angle --use-angle=gl`（Intel RPL-S 核显）+ 1280×657 绘制缓冲下测得。

1. **帧数低** → `stats()` 接 `EXT_disjoint_timer_query_webgl2`，HUD 里能直接看到整帧 GPU 耗时；
   新增 `maxMP` 像素上限，窗口变大时自动降 DDA 内部分辨率。
   实测（整帧 GPU，含 scene pass）：`scale 0.65 + 阴影 20 步` = 8.7 ms / 60 fps、`0.5` = 6.1 ms、`0.4` = 4.4 ms、`1.0` = 13.8 ms (54 fps)；
   2560×1400 窗口未加上限时 1.5 MP → 48 ms，`maxMP=0.7` 后降到 ×0.58 / 0.7 MP。
2. **横向穿屏毛刺**（对着树/山时整行透出天空）→ 根因是掠射角下**迭代预算耗尽**：
   `steps` 用尽时旧实现直接 `return false`，该像素就变成天空色，一整行掠射角射线同时耗尽 → 横向条纹。
   重现：树冠仰视机位 `steps=128` 漏空 3335 px（4.8%，集中在连续几十行），`steps=250` 归零。
   修法：① 循环硬上限 256→512；② 耗尽时返回 `kind=4` 的「全雾远景」而不是未命中，漏空变成雾色（在雾距上肉眼不可见）；
   ③ 雾远裁剪留 3% 余量，避免正好落在 far 面的几何被 `tX` 裁掉。
   验证：同分辨率下 `steps=64/96/128/160` vs `384` 的最终画面逐像素对比，全部机位差异 **0 px**（修前 `steps=8` 差异 27%、最长横向连通 866 px）。
3. **水体** → ① 水面波纹换成「正弦 + 可平铺 128² 噪声法线」两层滚动叠加（`waveNoise`/`waveScale` 上面板），
   实测高频能量 +10%、时间维逐帧差异 0.74（确认在动），焦散/泡沫也吃噪声相位；
   ② 新增 `uwNear/uwFar`（默认 2 / 44）覆盖主程序水下的 0.5 / 18，水下可视距离翻倍；
   ③ 修掉水下**漏空方向输出天空色且不加雾**的 bug（水下向外看会漏出亮天空），改为输出雾色并按 `uFogFar` 写深度。
