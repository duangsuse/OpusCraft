/* gode/vendor/pg1/load.js —— 载入 gode 自己的 PG1 生成器副本 vendor/pg1/gen.js。
   副本由 tools/build-pg1.mjs 从 goodPG1.html 切出（§1 核心工具 + §2 注册表 + §4 世界生成），之后**手改在副本里**做
   （洞穴入口 / 地表起伏 / 树密度 / 参数表）；donor 原文不改。
   执行方式与供体自己的 Worker 路径一致：整段脚本 + self.IS_WORKER=true + new Function（goodPG1.html:3350）。
   顶部对 DOM 的引用都在函数体内或有 typeof 守卫，不会启动游戏。 */
const SRC = new URL('./gen.js', import.meta.url);

export async function loadPG1() {
  let src;
  if (SRC.protocol === 'file:') {                         // node 测试：fetch 不认 file:
    const { readFile } = await import('node:fs/promises');
    src = await readFile(SRC, 'utf8');
  } else {
    const r = await fetch(SRC);
    if (!r.ok) throw new Error('vendor/pg1/gen.js 载入失败 ' + r.status);
    src = await r.text();
  }
  const g = globalThis;
  if (g.self === undefined) g.self = g;                   // node：脚本顶层用 self.IS_WORKER 守卫
  const prev = g.self.IS_WORKER;
  g.self.IS_WORKER = true;
  try {
    return new Function(src + `
;return { WorldGen, Chunk, BLOCKS, BL, BIOMES, BIO, OCEANS, DIM_OVER, WH, SEA, GEN_PARAMS, setGenParams };
//# sourceURL=pg1-gen.js`)();
  } finally {
    g.self.IS_WORKER = prev;
  }
}
