/* gode/viz/species.js —— 树种：由方块名认（`<种>_log|wood|stem` 树干、`<种>_leaves` 树叶），各生成器通用。
   统计（stats.js 的 trees.bySpecies）和图层（layers.js 的「树种」）共用同一张表，以后加图层（如林下植物、矿脉）也按这个套路：名字表 → 类别表 → 着色。 */
// 图层用的醒目色（方块色太接近地表绿 / 棕）；没列出的种按名字哈希
const SP_COL = { oak: 0x4cd964, spruce: 0x1fb5c8, birch: 0xf2e05c, jungle: 0xb6ff3b, acacia: 0xff9a3c, dark_oak: 0xa070ff, cherry: 0xff7ac8, mangrove: 0xff5a5a, azalea: 0xd070ff };
const hue = (n) => { let h = 2166136261; for (let i = 0; i < n.length; i++) h = Math.imul(h ^ n.charCodeAt(i), 16777619); return ((h >>> 8) & 0x7f7f7f) + 0x808080; };

const RE = /^(.*?)_?(log|wood|stem|leaves)$/;

// names → { list: ['', 'oak', 'birch', …]（下标 0 = 非树）, sp: Uint8Array(4096) 方块 type → 种下标, kind: Uint8Array(4096) 1 树叶 2 树干, color: 下标 → 0xRRGGBB }
export function speciesTable(names = []) {
  const list = [''], sp = new Uint8Array(4096), kind = new Uint8Array(4096), color = [0];
  names.forEach((n, i) => {
    if (i >= 4096) return;
    const m = RE.exec(n); if (!m) return;
    const name = m[1] || 'oak';
    let k = list.indexOf(name);
    if (k < 0) { k = list.push(name) - 1; color[k] = SP_COL[name] ?? hue(name); }
    sp[i] = k; kind[i] = m[2] === 'leaves' ? 1 : 2;
  });
  return { list, sp, kind, color };
}
