// XZ1 文本体素：解析 + 光栅化（s06 §5）。纯 ESM、无 DOM，页面（gm.test.xz）和 node（gd check）共用。
// 识别器（栅格 → op，gm.test.read）不在这里，留到 M4-2。
//
//   XZ1
//   @0,0^64 house                      零点（世界坐标）+ 名字；可出现多次，之后的 op 相对最近的零点
//   box  @0,0^0  9x7x4  :cobblestone   实心盒，尺寸 = x × z × y
//   box  @1,1^1  7x5x3  :air           后写的覆盖先写的；:air 即挖空
//   face @0,0^4  9x7    :oak_planks    水平面（y 厚 1）；9x1x3 这类三维写法也收，等同 box
//   tile @0,0^0  9x1x1  :glass every 2 盒内周期平铺：相对 op 起点，各轴坐标都是 every 的倍数才放
//   cyl  @4,3^5  r2 h3  :oak_leaves    竖直圆柱（底面圆心 + 半径 + 高）
//   ball @12,3^3 r3     :stone         球（球心 + 半径）
//   line @0,0^0 @5,3^2  :stone         两端点间的 3D 直线（含端点）
//   # 行注释；空行忽略
//
// 方块写法同 BIME：`:name` 或 `:name{k v; k v}`，状态原样保留在 props（字符串），放置端自己解释。

const COORD = /^@(-?\d+),(-?\d+)\^(-?\d+)$/;

/** '@x,z^y' → [x, y, z]（注意文本顺序是 x,z^y，返回按 xyz） */
export function coord(s) {
  const m = COORD.exec(s);
  if (!m) throw new Error(`坐标应为 @x,z^y：${s}`);
  return [+m[1], +m[3], +m[2]];
}

function block(s) {
  const m = /^:([a-z0-9_]+)(?:\{(.*)\})?$/.exec(s);
  if (!m) throw new Error(`方块应为 :name 或 :name{…}：${s}`);
  return m[2] == null ? { name: m[1] } : { name: m[1], props: m[2].trim() };
}

/** 文本 → { name, ops: [{ op, at:[x,y,z], size?, r?, h?, to?, every?, blk, line }] }（at / to 已加上零点） */
export function parse(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0].trim() !== 'XZ1') throw new Error('第一行应为 XZ1');
  let origin = [0, 0, 0], name = '';
  const ops = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i].replace(/#.*/, '').trim();
    if (!raw) continue;
    const t = raw.split(/\s+/), ln = i + 1;
    const err = msg => { throw new Error(`第 ${ln} 行：${msg}\n  ${lines[i]}`); };
    try {
      if (t[0].startsWith('@')) { origin = coord(t[0]); name ||= t.slice(1).join(' '); continue; }
      const op = t[0], at = coord(t[1]).map((v, k) => v + origin[k]);
      const bi = t.findIndex(s => s.startsWith(':'));
      if (bi < 0) err('缺方块 :name');
      const o = { op, at, blk: block(t.slice(bi).join(' ').replace(/\s+every\s+\d+$/, '')), line: ln };
      const args = t.slice(2, bi), tail = t.slice(bi + 1).join(' ');
      if (op === 'box' || op === 'face' || op === 'tile') {
        const d = (args[0] || '').split('x').map(Number);
        if (d.some(v => !(v > 0))) err('尺寸应为 XxZ 或 XxZxY');
        o.size = [d[0], d[2] ?? 1, d[1]];   // 文本 x×z×y → [sx, sy, sz]
        if (op === 'tile') { const m = /every\s+(\d+)/.exec(tail); o.every = m ? +m[1] : 2; }
      } else if (op === 'cyl' || op === 'ball') {
        for (const a of args) { if (a[0] === 'r') o.r = +a.slice(1); else if (a[0] === 'h') o.h = +a.slice(1); }
        if (!(o.r >= 0)) err('缺半径 rN');
        if (op === 'cyl' && !(o.h > 0)) err('缺高度 hN');
      } else if (op === 'line') {
        o.to = coord(args[0] || '').map((v, k) => v + origin[k]);
      } else err(`未知形状 ${op}（box face tile cyl ball line）`);
      ops.push(o);
    } catch (e) { if (/^第 \d+ 行/.test(e.message)) throw e; err(e.message); }
  }
  return { name, ops };
}

/** 逐 op 产出格子 cb(x, y, z, blk)；同一格后写覆盖先写，由调用方的 Map / setBlock 自然实现 */
export function each(doc, cb) {
  for (const o of doc.ops) {
    const [x0, y0, z0] = o.at;
    if (o.size) {
      const [sx, sy, sz] = o.size, e = o.every || 1;
      for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++)
        if (x % e === 0 && y % e === 0 && z % e === 0) cb(x0 + x, y0 + y, z0 + z, o.blk);
    } else if (o.op === 'cyl') {
      const r = o.r, r2 = (r + 0.5) ** 2;
      for (let y = 0; y < o.h; y++) for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++)
        if (x * x + z * z <= r2) cb(x0 + x, y0 + y, z0 + z, o.blk);
    } else if (o.op === 'ball') {
      const r = o.r, r2 = (r + 0.5) ** 2;
      for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++)
        if (x * x + y * y + z * z <= r2) cb(x0 + x, y0 + y, z0 + z, o.blk);
    } else if (o.op === 'line') {
      const d = o.to.map((v, k) => v - o.at[k]), n = Math.max(...d.map(Math.abs));
      for (let i = 0; i <= n; i++) cb(...o.at.map((v, k) => v + Math.round(n ? d[k] * i / n : 0)), o.blk);
    }
  }
}

/** 光栅化成 Map 'x,y,z' → blk（最后写入为准）+ bbox [x0,y0,z0,x1,y1,z1]（含端点） */
export function raster(doc) {
  const cells = new Map(), b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  each(doc, (x, y, z, blk) => {
    cells.delete(`${x},${y},${z}`); cells.set(`${x},${y},${z}`, blk);   // 先删再插：迭代顺序 = 最后写入顺序
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.min(b[2], z);
    b[3] = Math.max(b[3], x); b[4] = Math.max(b[4], y); b[5] = Math.max(b[5], z);
  });
  return { cells, bbox: cells.size ? b : null };
}
