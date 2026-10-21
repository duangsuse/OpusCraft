// 任务包文档快照同步：goalX/doc/<basename> ← 真值文件
// 清单 goalX/doc/SNAP：每行一个相对仓库根的源路径，# 起注释
// node tools/snap.mjs [goalDir ...] [--check]   无目录参数 = 所有带 doc/SNAP 的 goal*/
//   默认：把漂移的快照覆盖成真值；--check：只报漂移，有漂移 exit 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), check = argv.includes('--check');
let dirs = argv.filter(a => !a.startsWith('--')).map(d => d.replace(/\/+$/, ''));
if (!dirs.length) dirs = fs.readdirSync(root).filter(d => d.startsWith('goal') && fs.existsSync(path.join(root, d, 'doc/SNAP')));

let drift = 0;
for (const d of dirs) {
  const doc = path.join(root, d, 'doc');
  const list = fs.readFileSync(path.join(doc, 'SNAP'), 'utf8').split('\n')
    .map(l => l.replace(/#.*/, '').trim()).filter(Boolean);
  const seen = new Map();
  for (const src of list) {
    const name = path.basename(src);
    if (seen.has(name)) throw new Error(`${d}/doc/SNAP：${src} 与 ${seen.get(name)} 同名`);
    seen.set(name, src);
    const a = fs.readFileSync(path.join(root, src)), dst = path.join(doc, name);
    const b = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
    if (b && a.equals(b)) continue;
    drift++;
    console.log(`${check ? 'DRIFT' : 'copy '} ${d}/doc/${name} ← ${src}${b ? '' : '（新）'}`);
    if (!check) fs.writeFileSync(dst, a);
  }
  for (const f of fs.readdirSync(doc))
    if (f.endsWith('.md') && !seen.has(f)) console.log(`extra ${d}/doc/${f}（不在 SNAP 清单，未处理）`);
}
console.log(drift ? `${drift} 个快照${check ? '漂移' : '已同步'}` : '快照与真值一致');
if (check && drift) process.exit(1);
