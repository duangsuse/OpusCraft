#!/usr/bin/env node
/* gode/tools/scascii.js —— 单字符 palette 快查（不启浏览器）。
   用法：
     node tools/scascii.js <cx> <cz> [--seed 11406] [--y Y] [--slice x|z]
   默认打 16×16 的俯视地图（每个字符 = 该列最高非空气块）；--y 打该层的 16×16 横切面；
   --slice x 打 x=8 的纵切（16 宽 × 256 高，纵向压缩 2:1）。
   字符表见 CHAR；大写的方块 id 与 SC 一致（dump 里的 top_id 可直接对照）。 */
import { createWorld } from '../vendor/sc/world.js';
import { genChunk, NAMES } from '../vendor/sc/terrain.js';

const args = process.argv.slice(2);
const cx = Number(args[0] ?? 0), cz = Number(args[1] ?? 0);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const seed = Number(opt('--seed', 11406));
const yOpt = opt('--y', null);
const slice = opt('--slice', null);

const CHAR = { 0: ' ', 1: '.', 2: ',', 3: '#', 4: ':', 6: 'o', 7: 's', 8: '"', 18: '~', 61: '*', 62: '+', 66: 'l', 67: 'b', 72: 'c' };
const ch = (id) => CHAR[id] ?? '?';

const world = createWorld(seed);
const blocks = new Uint16Array(65536), heights = new Int16Array(256), biomes = new Uint8Array(256);
genChunk(world, cx, cz, blocks, heights, biomes);
const at = (x, y, z) => blocks[(y << 8) | (z << 4) | x];

if (yOpt != null) {
  const y = Number(yOpt);
  console.log(`# chunk ${cx},${cz} y=${y}  ${[' ', '.', ',', '#', ':', 'o', 's', '"', '~', '*', '+', 'l', 'b', 'c'].map((c, i) => c + '=' + ['air', 'bedrock', 'dirt', 'granite', 'sandstone', 'gravel', 'sand', 'grass', 'water', 'snow', 'ice', 'limestone', 'basalt', 'clay'][i]).join(' ')}`);
  for (let z = 0; z < 16; z++) {
    let row = '';
    for (let x = 0; x < 16; x++) row += ch(at(x, y, z));
    console.log(row);
  }
}
else if (slice === 'x') {
  const x = 8;
  for (let y = 255; y >= 0; y -= 2) {
    let row = '';
    for (let z = 0; z < 16; z++) row += ch(at(x, y, z));
    console.log(String(y).padStart(3) + ' ' + row);
  }
}
else {
  console.log(`# chunk ${cx},${cz} seed=${seed}  top: space=air .=bedrock ,=dirt #=granite :=sandstone o=gravel s=sand "=grass ~=water *=snow +=ice l=limestone b=basalt c=clay`);
  for (let z = 0; z < 16; z++) {
    let row = '';
    for (let x = 0; x < 16; x++) {
      const h = heights[z * 16 + x];
      row += h < 0 ? ' ' : ch(at(x, h, z));
    }
    console.log(row);
  }
  let mn = 999, mx = -1;
  for (let i = 0; i < 256; i++) { mn = Math.min(mn, heights[i]); mx = Math.max(mx, heights[i]); }
  console.log(`# heights ${mn}..${mx}`);
}