# vendor/npm —— 原先走 CDN 的依赖，本地化（11-09）

从 CDN 下载，**文件内容逐字节原样，只有两处不是**：jszip 换成 jsdelivr 的自包含包（原先是 esm.sh 的版本），brotli-wasm.js 有一处机械替换（见下）。sha256 为前 16 位（下载时的原始文件）。
`index.html` 的 importmap 与 `rgl/panel.js` 指向这里；没有 service worker / Cache API，纯静态文件（`http-server -c 1`）。

| 文件 | 来源 | sha256 | 许可 |
|---|---|---|---|
| three.module.js | cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js | ce1fa418de16a194 | MIT |
| addons/loaders/HDRLoader.js | …/three@**0.180.0**/examples/jsm/loaders/HDRLoader.js（原 importmap 就是 0.180，与 three 0.170 混用，保持原样） | d7053cfc4019f520 | MIT |
| addons/loaders/RGBELoader.js | …/three@0.170.0/examples/jsm/loaders/RGBELoader.js（HDRLoader 不可用时的回退） | f0e87d0008d9484d | MIT |
| tweakpane.js | …/tweakpane@4.0.5/dist/tweakpane.js | cd99b8cbe0fb4ac6 | MIT |
| idb-keyval.js | …/idb-keyval@6.2.1/+esm | cb064e359e479401 | Apache-2.0 |
| jszip.js | …/jszip@3.10.1/+esm（jsdelivr 自包含打包；原先是 esm.sh 的版本，带 process / buffer / events / tty 等 node shim 链，慢） | 014e9a0868feeaf8 | MIT OR GPL-3.0 |
| brotli-wasm.js | …/brotli-wasm@3.0.1/+esm | 6dc7615d8b3aaeb8 | MIT OR Apache-2.0 |
| brotli_wasm_bg.wasm | …/brotli-wasm@3.0.1/pkg.web/brotli_wasm_bg.wasm | 9ef0a025046bf7d8 | 同上 |

**brotli-wasm.js 的唯一改动**：jsdelivr 把 wasm 路径改写成了绝对路径 `new URL("/npm/brotli-wasm@3.0.1/pkg.web/brotli_wasm.js", import.meta.url).href`，换成 `import.meta.url`（wasm 与本文件同目录）。

**brotli 是懒加载的**（`index.html` 的 CompressionStream 垫片）：只有 `new CompressionStream('brotli')` / `new DecompressionStream('brotli')` 时才会 import 它和 1 MB 的 wasm；默认的 deflate 存档完全不碰。以前是模块顶层 `await import(...)`，会把后面的模块脚本（整个游戏）一起挡住。

字体见 `../fonts/`：Press Start 2P v16、VT323 v18 的 woff2（8 个子集，OFL），`fonts.css` 是 Google Fonts CSS 把 URL 改成本地文件名。
