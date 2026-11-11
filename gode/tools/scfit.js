#!/usr/bin/env node
/* gode/tools/scfit.js —— Survivalcraft TerrainDump.tsv ↔ vendor/sc 的对拍工具。
   用法：node tools/scfit.js [dump.tsv] [--tolerance 0.01] [--surface] [--dump-offsets]
     --surface       额外按区块重算地表高度，和 dump 的 top_height 比（跳过顶上长植物的列）
     --dump-offsets  用 dump 里的 gen.m_*Offset 而不是从 seed 推导（默认推导，验证整条链）
   输出：每个字段的最大/平均绝对误差、超差行数。 */
import { readFileSync } from 'node:fs';
import { createWorld } from '../vendor/sc/world.js';
import { Rand } from '../vendor/sc/rand.js';
import { genChunk } from '../vendor/sc/terrain.js';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const optVal = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const file = argv.find((a) => !a.startsWith('--') && isNaN(Number(a))) ?? `${process.env.HOME}/bin/SurvivalcraftAPI-1.9.5.1/TerrainDump.tsv`;
const tol = Number(optVal('--tolerance', 0.01));

const head = {}, dumpedOffsets = {}, grid = [], points = [];
let section = null;
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line) continue;
  if (line[0] === '#') {
    const m = /^# (\S+?)=(.*)$/.exec(line);
    if (m) head[m[1]] = m[2];
    const g = /^# gen\.(m_\w+)=(-?[\d.eE+]+),(-?[\d.eE+]+)$/.exec(line);
    if (g) dumpedOffsets[g[1]] = [Number(g[2]), Number(g[3])];
    continue;
  }
  if (line === 'GRID') { section = 'grid'; continue; }
  if (line === 'POINTS') { section = 'points'; continue; }
  const c = line.split(' ');
  if (section === 'grid') {
    grid.push({
      x: +c[0], z: +c[1], h: +c[2], temp: +c[3], hum: +c[4], mountain: +c[5], shore: +c[6],
      top: +c[7], topId: +c[8], topCls: c[9], loaded: c[10] === '1'
    });
  }
  else if (section === 'points') {
    points.push({ x: +c[0], z: +c[1], h: +c[2], temp: +c[3], hum: +c[4], mountain: +c[5], shore: +c[6] });
  }
}

const seed = Number(head.world_seed);
if (!Number.isFinite(seed)) throw new Error('dump 里没有 world_seed');

const offsets = flag('--dump-offsets')
  ? { temp: dumpedOffsets.m_temperatureOffset, hum: dumpedOffsets.m_humidityOffset, mount: dumpedOffsets.m_mountainsOffset, river: dumpedOffsets.m_riversOffset }
  : {};
const w = createWorld(seed, {
  biomeSize: Number(head['world.BiomeSize'] ?? 1),
  seaLevelOffset: Number(head['world.SeaLevelOffset'] ?? 0),
  temperatureOffset: Number(head['world.TemperatureOffset'] ?? 0),
  humidityOffset: Number(head['world.HumidityOffset'] ?? 0),
  offsets
});

const F = [
  { name: 'height', key: 'h', get: (p) => w.height(p.x, p.z) },
  { name: 'temp', key: 'temp', get: (p) => w.temperature(p.x, p.z) },
  { name: 'humidity', key: 'hum', get: (p) => w.humidity(p.x, p.z) },
  { name: 'mountain', key: 'mountain', get: (p) => w.mountainRangeFactor(p.x, p.z) },
  { name: 'shore', key: 'shore', get: (p) => w.shoreDistance(p.x, p.z) }
];

function compare(rows, label) {
  for (const f of F) {
    let max = 0, sum = 0, bad = 0, worst = null;
    for (const r of rows) {
      const want = r[f.key ?? f.name], got = f.get(r);
      const d = Math.abs(got - want);
      sum += d;
      if (d > max) { max = d; worst = [r.x, r.z, want, got]; }
      if (d > tol) bad++;
    }
    console.log(`${label} ${f.name.padEnd(9)} max=${max.toExponential(3)} mean=${(sum / rows.length).toExponential(3)} bad=${bad}/${rows.length}` +
      (worst ? `  worst@(${worst[0]},${worst[1]}) want=${worst[2]} got=${worst[3]}` : ''));
  }
}

console.log(`# ${file}`);
console.log(`# seed=${seed} points=${points.length} grid=${grid.length} tol=${tol} offsets=${flag('--dump-offsets') ? 'dump' : 'seed'}`);
compare(points, 'point');
compare(grid, 'grid ');

if (flag('--surface')) {
  const PLANT = /Grass|Flower|Bush|Rye|Cotton|Leaves|Wood|Kelp|Seagrass|Ivy|Torch|Sapling|Fern|Moss|Vine|Cactus|Pumpkin/i;
  const chunks = new Map();
  let bad = 0, n = 0, max = 0, higher = 0, lower = 0, worst = null;
  for (const r of grid) {
    if (!r.loaded || r.top < 0 || PLANT.test(r.topCls)) continue;
    const cx = r.x >> 4, cz = r.z >> 4, key = `${cx},${cz}`;
    if (!chunks.has(key)) {
      const blocks = new Uint16Array(65536), hs = new Int16Array(256), bio = new Uint8Array(256);
      genChunk(w, cx, cz, blocks, hs, bio);
      chunks.set(key, hs);
    }
    const got = chunks.get(key)[(r.z & 15) * 16 + (r.x & 15)];
    const d = Math.abs(got - r.top);
    n++;
    if (d > max) { max = d; worst = [r.x, r.z, r.top, got]; }
    if (got > r.top) higher++; else if (got < r.top) lower++;
    if (d > 2) bad++;
  }
  console.log(`surface top_height: max=${max} bad(>2)=${bad}/${n} js_higher=${higher} (≥SC = 洞穴/植被缺失) js_lower=${lower} (应为 0)` + (worst ? `  worst@(${worst[0]},${worst[1]}) want=${worst[2]} got=${worst[3]}` : ''));
}

const r = new Rand(seed);
const derived = [r.range(-3000, 3000), r.range(-3000, 3000), r.range(-3000, 3000), r.range(-3000, 3000)];
const dumped = [...(dumpedOffsets.m_temperatureOffset ?? []), ...(dumpedOffsets.m_humidityOffset ?? [])];
console.log(`# seed->offset: derived=[${derived.map((v) => v.toFixed(3)).join(',')}] dumped=[${dumped.map((v) => v.toFixed(3)).join(',')}]`);
// ── 逐格对拍：dump 的 CHUNK 段（玩家所在区块 16×256×16）──────────────
if (process.argv.includes('--chunk')) {
  let chunkRows = null;
  const lines = readFileSync(file, 'utf8').split('\n');
  const i0 = lines.indexOf('CHUNK');
  if (i0 < 0) throw new Error('dump 里没有 CHUNK 段');
  chunkRows = [];
  for (let i = i0 + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l || l[0] === '#') continue;
    if (l === 'POINTS') break;
    const [x, z, hex] = l.split(' ');
    chunkRows.push({ x: +x, z: +z, hex });
  }
  const cx = chunkRows[0].x >> 4, cz = chunkRows[0].z >> 4;
  const blocks = new Uint16Array(65536), hs = new Int16Array(256), bio = new Uint8Array(256);
  genChunk(w, cx, cz, blocks, hs, bio);
  let bad = 0, n = 0;
  const byY = new Map();
  const samples = [];
  for (const row of chunkRows) {
    const lx = row.x & 15, lz = row.z & 15;
    for (let y = 0; y < 256; y++) {
      const want = parseInt(row.hex.substr(y * 2, 2), 16);
      const got = blocks[(y << 8) | (lz << 4) | lx];
      n++;
      if (got !== want) {
        bad++;
        byY.set(y, (byY.get(y) ?? 0) + 1);
        if (samples.length < 12) samples.push(`(${row.x},${y},${row.z}) want=${want} got=${got}`);
      }
    }
  }
  console.log(`chunk ${cx},${cz}: mismatched cells=${bad}/${n}`);
  const top = [...byY.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('  worst layers: ' + top.map(([y, c]) => `y${y}:${c}`).join(' '));
  for (const s of samples) console.log('  ' + s);
}
