# vendor/luanti —— 来源与许可证边界

本目录是 **Luanti（原 Minetest）mapgen 的独立重写**（JavaScript）：算法 / 默认噪声参数 / 字段语义取自 Luanti 源码（`src/noise.cpp`、`src/mapgen/mapgen_v7.cpp`、
`mapgen_valleys.cpp`、`mapgen.cpp`、`cavegen.cpp`、`mg_biome.cpp`、`mg_decoration.cpp`、`mg_schematic.cpp`），C++ 只作**参考**，没有逐行翻译，也没有拷贝任何源文件。
Luanti 引擎本身是 LGPL-2.1-or-later（`src/noise.cpp` 头部另带 BSD 式条款）。这些模块是否构成衍生作品、需要什么许可证，**由仓库所有者裁定**；
因此边界做成了可拆的：

- 本目录（`noise.js pcg.js biome.js mapgen.js deco.js v7.js valleys.js`）只含算法，不含群系 / 方块内容，不依赖 gode 的其它代码；
- gode 一侧只有薄适配：`defl/g/lt/{core,adapter}.js`、`defl/g/{v7,valleys}.js`，群系是 gode 自己的声明式表 `defl/g/lt/biomes.tsv`；
- 删掉本目录与这几个适配文件，其余部分不受影响。

正确性靠真实 Luanti 对拍（`tools/luanti/run.mjs` 起参考服务器导出，`cmp.mjs` 逐格比较），不靠阅读源码。

VoxeLibre（GPLv3）只作**思路**参考（参数取舍，见 s13 §14.1），没有使用它的任何代码 / 群系表 / schematic / 贴图。
