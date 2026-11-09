#!/usr/bin/env node
/* gode/tools/luanti/parity.mjs —— 回归：v7 / valleys 在若干种子与区域上与真实 Luanti 逐格对拍，每行一条，≥ 99.9% 且群系列全对才算过。
   用法：node tools/luanti/parity.mjs [--quick]（--quick 只跑每个 mapgen 一组）。需要本机装了 luanti；每组约 5 s。 */
import { spawnSync } from 'node:child_process'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETS = [['v7', '12345', '-48,-48,47,47'], ['v7', '42', '-500,100,-405,195'], ['v7', 'hello', '0,0,95,95'], ['v7', '777', '200,-300,295,-205'], ['v7', '2024', '100,100,195,195'],
  ['valleys', '1', '-48,-48,47,47'], ['valleys', '5', '-300,-300,-205,-205'], ['valleys', '2024', '100,100,195,195'], ['valleys', 'hello', '0,0,95,95'], ['valleys', '31337', '-40,-40,55,55'],
  // 参数组：大洞穴窗口内可见（limit 100）+ VoxeLibre 式 valleys 气候开关
  ['v7', '12345', '-48,-48,47,47', 'mgv7_cavern_limit=100;mgv7_cavern_threshold=0.3', 'cavern.limit:100,cavern.threshold:0.3'],
  ['valleys', '1', '-48,-48,47,47', 'mgvalleys_cavern_limit=100;mgvalleys_cavern_threshold=0.3;mgvalleys_spflags=noaltitude_chill,noaltitude_dry,nohumid_rivers,vary_river_depth', 'cavern.limit:100,cavern.threshold:0.3,climate.altChill:0,climate.altDry:0,climate.humidRivers:0']];   // 含树（装饰 + schematic）的区域：hello = 密林，777 = 混合林
const sets = process.argv.includes('--quick') ? [SETS[0], SETS[3]] : SETS;
let bad = 0;
for (const [mg, seed, region, conf = '', kw = ''] of sets) {
  const r = spawnSync('node', [path.join(HERE, 'run.mjs'), '--mg', mg, '--seed', seed, '--region', region, '--conf', conf], { encoding: 'utf8' });
  if (r.status) { console.log(`${mg}\t${seed}\tERROR\t${(r.stderr || r.stdout).split('\n')[0]}`); bad++; continue; }
  const c = spawnSync('node', [path.join(HERE, 'cmp.mjs'), '--mg', mg, '--seed', seed, '--show', '0', '--kw', kw], { encoding: 'utf8' });
  console.log(`${mg}\t${seed}${conf ? '+参数' : ''}\t${c.status ? 'FAIL' : 'ok'}\t${c.stdout.split('\n')[0].replace(/^.*?：/, '')}`); if (c.status) bad++;
}
process.exit(bad ? 1 : 0);
