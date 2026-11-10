/* gode/vendor/pg1/load.js —— 运行时载入 goodPG1.html 里的生成器（单文件经典脚本）。
   供体自己在 Worker 里就是“整段 <script> + self.IS_WORKER=true”执行（goodPG1.html:3350），这里照做：
   fetch 原文 → 切出 <script> → new Function 执行 → 返回生成需要的全局。不复制源码，供体更新自动跟上。
   顶部对 DOM 的引用都在函数体内或有 typeof 守卫，boot 只在 !IS_WORKER 时挂 load（goodPG1.html:7749），
   在 Worker / node 里执行整段脚本不会启动游戏。 */
const SRC = new URL('../../../goodPG1.html', import.meta.url);

export async function loadPG1() {
  let html;
  if (SRC.protocol === 'file:') {                         // node 测试：fetch 不认 file:
    const { readFile } = await import('node:fs/promises');
    html = await readFile(SRC, 'utf8');
  } else {
    const r = await fetch(SRC);
    if (!r.ok) throw new Error('goodPG1.html 载入失败 ' + r.status);
    html = await r.text();
  }
  const m = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('goodPG1.html：找不到 <script>');
  const g = globalThis;
  if (g.self === undefined) g.self = g;                   // node：脚本顶层用 self.IS_WORKER 守卫
  const prev = g.self.IS_WORKER;
  g.self.IS_WORKER = true;
  try {
    return new Function(m[1] + `
;return { WorldGen, Chunk, BLOCKS, BL, BIOMES, BIO, OCEANS, DIM_OVER, WH, SEA };
//# sourceURL=goodPG1-gen.js`)();
  } finally {
    g.self.IS_WORKER = prev;
  }
}