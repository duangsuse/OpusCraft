#!/usr/bin/env node
/* gode/tools/luanti/cmp.mjs —— 把参考服务器导出的真实输出（run.mjs）与 JS 移植逐格对拍。
   用法：node tools/luanti/cmp.mjs --mg v7|valleys --seed 12345 [--bin /tmp/gode-lt/v7-12345.bin] [--show 10] [--nodeco]（run.mjs 用了 --nodeco 这里也要加）[--kw cavern.limit:-20,…]（run.mjs 的 --conf 要写对应的原生设置）
   输出：节点一致率、按（参考 → 移植）类型对统计的差异、差异格离「噪声阈值」的距离不可得时给出 y 分布；群系列（get_biome_data @ biomeY）对拍。 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url)), G = path.join(HERE, '..', '..');
const a = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const mg = a('mg', 'v7'), seed = a('seed', '12345'), bin = a('bin', `/tmp/gode-lt/${mg}-${seed}.bin`), show = +a('show', 8);
const buf = fs.readFileSync(bin), nl = buf.indexOf(10), hd = JSON.parse(buf.subarray(0, nl).toString()), body = buf.subarray(nl + 1);
const [x0, z0, x1, z1, y0, y1] = hd.region, H = y1 - y0 + 1;
const { createGen } = await import(path.join(G, 'defl/g/lt/core.js'));
const { parseKw } = await import(path.join(G, 'w/params.js'));
const kw = parseKw(a('kw', ''));   // 与 run.mjs 的 --conf 对应的 knobs，如 cavern.limit:-20,cavern.threshold:0.2
const deco = !process.argv.includes('--nodeco');
const gen = await createGen(mg, seed, { biomesText: fs.readFileSync(path.join(G, 'defl/g/lt/biomes.tsv'), 'utf8'), kw, decoText: deco ? { decorations: fs.readFileSync(path.join(G, 'defl/g/lt/decorations.json'), 'utf8'), schematics: fs.readFileSync(path.join(G, 'defl/g/lt/schematics.json'), 'utf8') } : null,
  bounds: deco ? { x0: x0 - 96, z0: z0 - 96, x1: x1 + 96, z1: z1 + 96, y0, y1 } : null });   // run.mjs 多 emerge 了 96 格；参考里不存在的块不能当前驱
const refName = (i) => hd.names[i].replace(/^gode_ref:/, '').replace(/_source$/, '');
const mine = (id) => gen.names[id];
let same = 0, tot = 0, treeRef = 0, treeMine = 0; const pairs = new Map(), yh = new Map(); const first = [];
let bSame = 0, bTot = 0, hMax = 0, uMax = 0;
const cols = fs.readFileSync(bin + '.cols', 'utf8').split('\n').map(l => l.split(','));
let ci = 0;
const col = new Uint16Array(H);
for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++, ci++) {
  gen.finalColumn(x, z, col);
  const off = ((x - x0) * (z1 - z0 + 1) + (z - z0)) * H * 2;
  for (let i = 0; i < H; i++) {
    const rn = refName(body[off + 2 * i] | body[off + 2 * i + 1] << 8), mn = mine(col[i]);
    tot++; if (/_(log|leaves)$/.test(rn)) treeRef++; if (/_(log|leaves)$/.test(mn)) treeMine++;
    if (rn === mn) same++;
    else { const k = rn + ' → ' + mn; pairs.set(k, (pairs.get(k) ?? 0) + 1); const yy = Math.floor((y0 + i) / 16) * 16; yh.set(yy, (yh.get(yy) ?? 0) + 1); if (first.length < show) first.push(`@${x},${y0 + i},${z} ${k}`); }
  }
  const [rb, rh, ru] = cols[ci]; const hh = gen.heatHumid(x, z);
  hMax = Math.max(hMax, Math.abs(hh[0] - rh)); uMax = Math.max(uMax, Math.abs(hh[1] - ru));
  const mb = gen.biomeAt(x, z, +hd.biomeY); const rbn = hd.biomes.find(b => b.id === +rb)?.name; bTot++; if (mb === rbn) bSame++;
}
console.log(`${mg} seed ${seed} 区域 ${x0},${z0}…${x1},${z1} y ${y0}…${y1}：节点一致 ${same}/${tot} = ${(100 * same / tot).toFixed(4)}%；树格 参考 ${treeRef} / 移植 ${treeMine}；群系列一致 ${bSame}/${bTot}；热度 / 湿度最大差 ${hMax.toExponential(2)} / ${uMax.toExponential(2)}`);
const top = [...pairs.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8);
if (top.length) console.log('差异（参考 → 移植）：' + top.map(([k, n]) => `${k} ×${n}`).join('；'));
if (yh.size) console.log('差异 y 分布（16 格一档）：' + [...yh.entries()].sort((p, q) => p[0] - q[0]).map(([y, n]) => `${y}:${n}`).join(' '));
for (const f of first) console.log('  ' + f);
process.exit(same / tot >= 0.999 && bSame === bTot ? 0 : 2);
