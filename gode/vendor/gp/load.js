/* gode/vendor/gp/load.js —— 载入 goodGP 的生成器源码（goodGP/js/util.js + blocks.js + world.js，classic script、全局依赖）。
   不复制：运行时 fetch 供体原文，拼成一个函数体执行，返回需要的全局（供体更新自动跟上；供体里的 GEN_PARAMS / setParams 是为 pgviz 调参加的，默认值不改输出）。
   供体对外部的依赖只有两处，在这里补桩：ASSETS.tiles（blocks.js 的贴图下标，生成用不到 → 全 0）、world.grassMap / foliageMap（群系色图 → 全 0）。 */
const SRC = ['util.js', 'blocks.js', 'world.js'].map(f => new URL('../../../goodGP/js/' + f, import.meta.url));
const EXPORTS = ['World', 'BLOCKS', 'BIOMES', 'BI', 'HEIGHT', 'SEA', 'hashStr', 'GEN_PARAMS'];

export async function loadGP() {
  const text = await Promise.all(SRC.map(async u => { const r = await fetch(u); if (!r.ok) throw new Error('goodGP 源码载入失败 ' + u); return r.text(); }));
  const body = text.join('\n;\n') + `\nreturn { ${EXPORTS.join(', ')} };\n//# sourceURL=goodGP-gen.js`;
  const ASSETS = { tiles: new Proxy({}, { get: () => 0 }) };
  return new Function('ASSETS', body)(ASSETS);
}

const MAP0 = new Uint8Array(256 * 256 * 4);
export function newWorld(G, seed) { const w = new G.World(seed); w.grassMap = w.foliageMap = MAP0; return w; }
