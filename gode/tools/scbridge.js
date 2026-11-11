#!/usr/bin/env node
/* gode/tools/scbridge.js —— 和常驻游戏进程的 ScBridge 插件对话（文件 IPC）。
   用法：
     node tools/scbridge.js --x 256 --z 224 [--size 129] [--seed 11406] [--check] [--game <游戏目录>] [--timeout 40]
   流程：写 ScBridge/req.txt（原子 rename）→ 轮询 resp.txt 等 id 匹配 → 读固定大小 data.tsv。
   --check 用 vendor/sc 在同一批坐标上重算，打印误差（高度 / 温度 / 湿度 / 山 / 岸距 / 顶块 id）。
   输出：一行摘要；--json 输出 JSON。 */
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createWorld } from '../vendor/sc/world.js';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const num = (k, d) => { const v = opt(k, d); return v == null ? d : Number(v); };

const gameDir = opt('--game', `${process.env.HOME}/bin/SurvivalcraftAPI-1.9.5.1`);
const dir = join(gameDir, 'ScBridge');
const reqPath = join(dir, 'req.txt'), respPath = join(dir, 'resp.txt'), dataPath = join(dir, 'data.tsv');
const x = num('--x', 0), z = num('--z', 0);
let size = num('--size', 129);
if ((size & 1) === 0) size++;
size = Math.min(513, Math.max(9, size));
const timeout = num('--timeout', 40) * 1000;
const id = (Date.now() % 1e9) | 0;

if (!existsSync(dir)) throw new Error(`没有 ${dir}：游戏里没装 ScBridge（或还没跑过）`);
const cmd = flag('--pos') ? 'pos' : flag('--move') ? 'move' : 'dump';
const yOpt = opt('--y', null);
let req = `id=${id} x=${x} z=${z} cmd=${cmd}`;
if (cmd === 'dump') req += ` size=${size}`;
if (cmd === 'move') {
  if (yOpt != null) req += ` y=${yOpt}`;
  req += ` fly=${flag('--nofly') ? 0 : 1}`;
}
writeFileSync(reqPath + '.tmp', req + '\n');
renameSync(reqPath + '.tmp', reqPath);

const t0 = Date.now();
let resp = null;
while (Date.now() - t0 < timeout) {
  await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(respPath)) continue;
  const text = readFileSync(respPath, 'utf8').trim();
  const kv = Object.fromEntries(text.split(/\s+/).map((p) => { const i = p.indexOf('='); return i > 0 ? [p.slice(0, i), p.slice(i + 1)] : [p, '']; }));
  if (Number(kv.id) !== id) continue;
  resp = kv;
  break;
}
if (!resp) throw new Error(`等 ${timeout / 1000}s 没有应答（游戏在跑吗？窗口是不是被最小化了 → 帧停了区块就不会生成）`);
if (resp.ok !== '1') throw new Error(`插件失败：${JSON.stringify(resp)}`);
if ((resp.cmd ?? 'dump') !== 'dump') {
  if (flag('--json')) console.log(JSON.stringify(resp));
  else console.log(`${resp.cmd} pos=${resp.pos}`);
  process.exit(0);
}

const HDR = 128, ROW = 65;
const buf = readFileSync(dataPath);
const rows = [];
const n = size * size;
const r = (size - 1) / 2;
for (let idx = 0; idx < n; idx++) {
  const off = HDR + idx * ROW;
  const line = buf.toString('latin1', off, off + ROW - 1);
  rows.push({
    x: Number(line.slice(0, 9)), z: Number(line.slice(9, 18)),
    h: Number(line.slice(18, 28)), temp: Number(line.slice(28, 31)), hum: Number(line.slice(31, 34)),
    mountain: Number(line.slice(34, 42)), shore: Number(line.slice(42, 52)),
    top: Number(line.slice(52, 57)), topId: Number(line.slice(57, 62)), loaded: line.slice(62, 64).trim() === '1'
  });
}

const out = {
  id, ms: Number(resp.ms), size, rows: rows.length,
  loaded: Number(resp.loaded), total: Number(resp.total),
  heightMin: Math.min(...rows.map((q) => q.top)), heightMax: Math.max(...rows.map((q) => q.top))
};

if (flag('--check')) {
  const seed = num('--seed', null);
  if (seed == null) throw new Error('--check 需要 --seed');
  const w = createWorld(seed);
  let maxH = 0, maxT = 0, maxHum = 0, maxM = 0, maxS = 0, badTop = 0, nTop = 0;
  for (const q of rows) {
    maxH = Math.max(maxH, Math.abs(w.height(q.x, q.z) - q.h));
    maxT = Math.max(maxT, Math.abs(w.temperature(q.x, q.z) - q.temp));
    maxHum = Math.max(maxHum, Math.abs(w.humidity(q.x, q.z) - q.hum));
    maxM = Math.max(maxM, Math.abs(w.mountainRangeFactor(q.x, q.z) - q.mountain));
    maxS = Math.max(maxS, Math.abs(w.shoreDistance(q.x, q.z) - q.shore));
    if (q.loaded && q.top >= 0) nTop++;
  }
  out.check = { maxHeight: +maxH.toExponential(3), maxTemp: maxT, maxHum, maxMountain: +maxM.toExponential(3), maxShore: +maxS.toExponential(3), columns: nTop };
}

if (flag('--json')) console.log(JSON.stringify(out));
else {
  console.log(`bridge id=${out.id} ${size}×${size} center=(${x},${z}) ms=${out.ms} chunks=${out.loaded}/${out.total} top=${out.heightMin}..${out.heightMax}`);
  if (out.check) console.log(`check: ${JSON.stringify(out.check)}`);
}