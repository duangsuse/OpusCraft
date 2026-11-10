#!/usr/bin/env node
/* build-pg1 —— 从 goodPG1.html 切出 gode 自己的生成器副本 vendor/pg1/gen.js。
   只取三段：§1 核心工具（math/RNG/噪声）、§2 注册表（方块 / 群系定义）、§4 世界生成（Chunk / WorldGen / 结构 / 特征）。
   跳过 §3 纹理、§5 之后的渲染 / 玩法 / UI / 存档。切出后由 vendor/pg1/load.js 用 new Function 执行（同一个 Worker 路径）。
   用法：node gode/tools/build-pg1.mjs [--check]
     --check  只比对，不写文件；有差异退出 1（donor 更新后先看 diff 再重建） */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GODE = dirname(dirname(fileURLToPath(import.meta.url)));
const ROOT = dirname(GODE);
const DONOR = join(ROOT, 'goodPG1.html');
const OUT = join(GODE, 'vendor', 'pg1', 'gen.js');
const SHA = join(GODE, 'vendor', 'pg1', 'gen.donor.sha');
const HEAD = `/* gode/vendor/pg1/gen.js —— goodPG1.html 的生成器副本（§1 核心工具 + §2 注册表 + §4 世界生成）。
   由 tools/build-pg1.mjs 切出；**本文件可改**（洞穴 / 地表 / 树密度），donor 原文不动。
   donor 更新后：node gode/tools/build-pg1.mjs --check 看差异，确认不影响手改再重建，然后重放本文件的改动。 */
`;

const html = readFileSync(DONOR, 'utf8');
const m = /<script>([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.error('goodPG1.html：找不到 <script>'); process.exit(2); }
const src = m[1].split('\n');

/** 取 [startMarker, endMarker) 行（1 基），endMarker 为空表示到文件尾 */
function cut(startMarker, endMarker) {
  const a = src.findIndex(l => l.includes(startMarker));
  if (a < 0) throw new Error('找不到起点 ' + startMarker);
  let b = src.length;
  if (endMarker) { const i = src.findIndex((l, k) => k > a && l.includes(endMarker)); if (i < 0) throw new Error('找不到终点 ' + endMarker); b = i; }
  return src.slice(a, b);
}

const parts = [
  ...cut('1. CORE UTILITIES', '3. PROCEDURAL TEXTURES'),   // §1 + §2（到 §3 之前）
  ...cut('4. WORLD GENERATION', '5. WORLD STATE'),          // §4（到 §5 之前）
];
const body = HEAD + parts.join('\n') + '\n';
const sha = createHash('sha256').update(body).digest('hex').slice(0, 16);
const old = existsSync(SHA) ? readFileSync(SHA, 'utf8').trim() : null;

if (process.argv.includes('--check')) {
  if (old === sha) console.log('ok\t' + SHA + '\t' + sha + '（donor 未变）');
  else { console.log('drift\t' + SHA + '\t' + (old ?? '（无记录）') + ' → ' + sha + '（donor 变了：先 diff 再 --force）'); process.exit(1); }
} else if (process.argv.includes('--force')) {
  writeFileSync(OUT, body); writeFileSync(SHA, sha + '\n');
  console.log('wrote\t' + OUT + '\t' + parts.length + ' 行\tsha ' + sha + '（会覆盖手改）');
} else {
  console.log('dry\t' + OUT + '\t副本由 --force 重写；--check 只比对 donor 是否变化');
}
