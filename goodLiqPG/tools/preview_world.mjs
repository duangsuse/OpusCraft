// World generator preview + verification.
//   node tools/preview_world.mjs [--seed N] [--size 1024] [--cx 0] [--cz 0] [--workers 8] [--skip-map] [--bench 400]
// Outputs: /tmp/world_top.png, /tmp/world_biomes.png, /tmp/world_slice*.png, timing + seam checks on stdout.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { writePNG } from './png.mjs';
import { Generator, BIOMES, MIN_Y, HEIGHT } from '../src/world/gen/generator.js';
import { ID, BLOCKS, TYPE_MASK, T_REPLACEABLE, T_FLUID } from '../src/world/blocks.js';

// ---- block colors for maps ------------------------------------------------------------------------------
const COL = new Int32Array(4096).fill(-1);
const setc = (name, c) => { if (ID[name] !== undefined) COL[ID[name]] = c; };
Object.entries({
  stone: 0x7d7d7d, granite: 0x956755, diorite: 0xc4c4c4, andesite: 0x8a8a8a, deepslate: 0x4f4f55, tuff: 0x6c6d66, bedrock: 0x2b2b2b,
  dirt: 0x866043, coarse_dirt: 0x77553b, podzol: 0x6a4a22, sand: 0xdbd3a0, red_sand: 0xbe6621, gravel: 0x847f7e, clay: 0xa0a6b3,
  sandstone: 0xd8cb9b, red_sandstone: 0xba631d, snow_block: 0xf6fbfb, snow: 0xf6fbfb, ice: 0x8fb0f0, packed_ice: 0x9fbcf2, obsidian: 0x15111f,
  lava: 0xe8641a, terracotta: 0x985e43, white_terracotta: 0xd1b2a1, orange_terracotta: 0xa15325, yellow_terracotta: 0xba8523,
  brown_terracotta: 0x4d3323, red_terracotta: 0x8f3d2e, light_gray_terracotta: 0x876b62,
  coal_ore: 0x262626, iron_ore: 0xe0b090, copper_ore: 0xe0794a, gold_ore: 0xfcee4b, redstone_ore: 0xff2020, lapis_ore: 0x2050d0,
  diamond_ore: 0x5decf5, emerald_ore: 0x17dd62,
  deepslate_coal_ore: 0x161616, deepslate_iron_ore: 0xc09070, deepslate_copper_ore: 0xc06040, deepslate_gold_ore: 0xe0d030,
  deepslate_redstone_ore: 0xe00000, deepslate_lapis_ore: 0x1030b0, deepslate_diamond_ore: 0x40c8d8, deepslate_emerald_ore: 0x10b050,
  oak_log: 0x6b5332, spruce_log: 0x3b2912, birch_log: 0xd5cda5, jungle_log: 0x56441c, acacia_log: 0x6b6158, dark_oak_log: 0x3e2912, cherry_log: 0x3a1d26,
  spruce_leaves: 0x3f6b3f, birch_leaves: 0x5f8040, cherry_leaves: 0xe8a8c8,
  cactus: 0x2f7a22, pumpkin: 0xe38a1d, melon: 0x7aa628, sugar_cane: 0x88c060, mossy_cobblestone: 0x6a7a5a, cobblestone: 0x7a7a7a,
  dead_bush: 0x8a6a3a, brown_mushroom: 0x9a7050, red_mushroom: 0xd03030, lily_pad: 0x208030,
  dandelion: 0xf0e020, poppy: 0xe02020, blue_orchid: 0x30a0e0, allium: 0xb060e0, azure_bluet: 0xe0e0f0, red_tulip: 0xe03030,
  orange_tulip: 0xf08020, white_tulip: 0xf0f0f0, pink_tulip: 0xf0a0c0, oxeye_daisy: 0xf0f0e0, cornflower: 0x4060e0, lily_of_the_valley: 0xffffff,
  sunflower: 0xf0d020, lilac: 0xc080d0, rose_bush: 0xd02040, peony: 0xe0a0d0, pink_petals: 0xf0a0c8,
  seagrass: -2, tall_seagrass: -2, kelp: -2, kelp_plant: -2, short_grass: -3, tall_grass: -3, fern: -3, large_fern: -3, vine: -4,
}).forEach(([k, v]) => setc(k, v));

const BIOME_MAP_COL = {
  ocean: 0x000070, deep_ocean: 0x000030, frozen_ocean: 0x7070d6, deep_frozen_ocean: 0x404090, cold_ocean: 0x202070, deep_cold_ocean: 0x202038,
  lukewarm_ocean: 0x000090, deep_lukewarm_ocean: 0x000040, warm_ocean: 0x0000ac, river: 0x0000ff, frozen_river: 0xa0a0ff, beach: 0xfade55,
  snowy_beach: 0xfaf0c0, stony_shore: 0xa2a284, plains: 0x8db360, sunflower_plains: 0xb5db88, snowy_plains: 0xffffff, ice_spikes: 0xb4dcdc,
  desert: 0xfa9418, swamp: 0x07f9b2, forest: 0x056621, flower_forest: 0x2d8e49, birch_forest: 0x307444, old_growth_birch_forest: 0x589c6c,
  dark_forest: 0x40511a, taiga: 0x0b6a5f, snowy_taiga: 0x31554a, old_growth_pine_taiga: 0x596651, old_growth_spruce_taiga: 0x818e79,
  jungle: 0x537b09, sparse_jungle: 0x628b17, savanna: 0xbdb25f, savanna_plateau: 0xa79d64, windswept_savanna: 0xe5da87,
  windswept_hills: 0x606060, windswept_gravelly_hills: 0x888888, windswept_forest: 0x507050, meadow: 0x60a445, cherry_grove: 0xffa0d0,
  grove: 0x47726c, snowy_slopes: 0xc4c4c4, frozen_peaks: 0xa0a0d0, jagged_peaks: 0xdcdcf0, stony_peaks: 0x7b7b7b, badlands: 0xd94515,
  eroded_badlands: 0xff6d3d, wooded_badlands: 0xb09765, mushroom_fields: 0xff00ff,
};

function topColor(blocks, c, biome) {
  // returns [rgb, y, waterDepth]
  let y = HEIGHT - 1;
  while (y >= 0 && blocks[c + y * 256] === 0) y--;
  if (y < 0) return [0, MIN_Y, 0];
  const bi = BIOMES[biome];
  let wd = 0, plantCol = -1;
  for (; y >= 0; y--) {
    const v = blocks[c + y * 256], t = v & TYPE_MASK;
    if (t === 0) continue;
    if (t === ID.water || COL[t] === -2) { wd++; continue; }
    const k = COL[t];
    if (k === -3 || k === -4) continue;           // grass plants / vines: show block below
    if (BLOCKS[t].model === 'cross' || BLOCKS[t].model === 'double_plant' || BLOCKS[t].model === 'petals') {
      if (k >= 0 && plantCol < 0) plantCol = k;
      continue;
    }
    let rgb;
    if (t === ID.grass_block) rgb = bi.grassColor;
    else if (t === ID.oak_leaves || t === ID.jungle_leaves || t === ID.acacia_leaves || t === ID.dark_oak_leaves) rgb = scale(bi.foliageColor, 0.8);
    else rgb = k >= 0 ? k : 0xff00ff;
    if (plantCol >= 0 && wd === 0) rgb = blend(rgb, plantCol, 0.6);
    if (wd > 0) {
      const f = Math.min(1, 0.45 + wd * 0.04);
      rgb = blend(rgb, scale(bi.waterColor, 0.85), f);
    }
    return [rgb, y + MIN_Y + wd * 0, wd];
  }
  return [0, MIN_Y, 0];
}
function blend(a, b, f) {
  const r = ((a >> 16) & 255) * (1 - f) + ((b >> 16) & 255) * f, g = ((a >> 8) & 255) * (1 - f) + ((b >> 8) & 255) * f, bb = (a & 255) * (1 - f) + (b & 255) * f;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bb);
}
function scale(a, f) {
  const c = (x) => Math.max(0, Math.min(255, Math.round(x * f)));
  return (c((a >> 16) & 255) << 16) | (c((a >> 8) & 255) << 8) | c(a & 255);
}

// ---- worker: generate a strip of chunks, return per-column top colors/heights/biomes ---------------------
if (!isMainThread) {
  // workerData: { seed, regions: [[cx0, cz0, cx1, cz1], ...] } inclusive inner chunk rectangles.
  // Each region is generated with a 1-chunk margin and `outside` feature blocks are applied like World.applyFeatureBlocks.
  const { seed, regions } = workerData;
  const gen = new Generator(seed);
  const out = [];
  let ms = 0, n = 0;
  for (const [ax, az, bx, bz] of regions) {
    const W = bx - ax + 3, H = bz - az + 3;
    const store = new Map();
    const outs = [];
    for (let cz = az - 1; cz <= bz + 1; cz++) for (let cx = ax - 1; cx <= bx + 1; cx++) {
      const blocks = new Uint16Array(16 * 16 * HEIGHT);
      const t0 = performance.now();
      const res = gen.generateChunk(cx, cz, blocks);
      ms += performance.now() - t0; n++;
      store.set(cx + ',' + cz, { blocks, biomes: res.biomes });
      outs.push(res.outside);
    }
    for (const o of outs) for (let i = 0; i < o.length; i += 4) {
      const ch = store.get((o[i] >> 4) + ',' + (o[i + 2] >> 4));
      if (!ch) continue;
      const y = o[i + 1] - MIN_Y; if (y < 0 || y >= HEIGHT) continue;
      const idx = (y * 16 + (o[i + 2] & 15)) * 16 + (o[i] & 15);
      const cur = ch.blocks[idx], ct = cur & TYPE_MASK;
      if (cur === 0 || (T_REPLACEABLE[ct] && !T_FLUID[ct])) ch.blocks[idx] = o[i + 3];
    }
    for (let cz = az; cz <= bz; cz++) for (let cx = ax; cx <= bx; cx++) {
      const { blocks, biomes } = store.get(cx + ',' + cz);
      const rgb = new Int32Array(256), h = new Int16Array(256), wd = new Int16Array(256);
      for (let c = 0; c < 256; c++) {
        const [col, y, w] = topColor(blocks, c, biomes[c]);
        rgb[c] = col; h[c] = y; wd[c] = w;
      }
      out.push({ cx, cz, rgb, h, wd, biomes });
    }
  }
  parentPort.postMessage({ out, ms, n });
} else {
  main();
}

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : (typeof def === 'number' ? Number(v) : v);
}

async function main() {
  const seed = arg('seed', 12345);
  const size = arg('size', 1024);
  const ccx = arg('cx', 0), ccz = arg('cz', 0);   // center in blocks
  const nw = arg('workers', Math.max(1, Math.min(12, os.cpus().length - 2)));
  const bench = arg('bench', 400);
  const gen = new Generator(seed);
  console.log(`seed ${seed}`);

  // (1) timing
  if (bench > 0) {
    const blocks = new Uint16Array(16 * 16 * HEIGHT);
    const n = Math.round(Math.sqrt(bench));
    // warmup
    for (let i = 0; i < 20; i++) gen.generateChunk(100 + i, 100, blocks);
    const times = [];
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const t0 = performance.now();
      gen.generateChunk(x - (n >> 1), z - (n >> 1), blocks);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    console.log(`generateChunk x${times.length}: avg ${avg.toFixed(2)} ms, median ${times[times.length >> 1].toFixed(2)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(2)} ms, max ${times[times.length - 1].toFixed(2)} ms`);
  }

  // (5) seams / order independence
  if (!arg('skip-seams', false)) seamCheck(seed);

  // spawn
  const t0 = performance.now();
  const sp = gen.findSpawn();
  console.log(`spawn: ${sp.map(v => v.toFixed(1)).join(', ')} (${(performance.now() - t0).toFixed(0)} ms), biome ${BIOMES[gen.biomeAt(sp[0], sp[1], sp[2])].name}`);

  // (4) slices
  if (!arg('skip-slices', false)) slices(gen, ccx, ccz);
  // optional large-scale overview from climate + spline heights (no 3D noise): --overview <blocksPerPixel>
  const ov = arg('overview', 0);
  if (ov) overview(gen, ccx, ccz, ov, 1024);

  const tilesArg = arg('tiles', '');
  if (tilesArg) { await tiles(seed, tilesArg, arg('tile-size', 160), nw, arg('scale', 2)); return; }
  if (arg('skip-map', false)) return;
  // (2)(3) maps
  const nc = size >> 4;
  const c0x = (ccx >> 4) - (nc >> 1), c0z = (ccz >> 4) - (nc >> 1);
  const tm = performance.now();
  const { map: chunkMap, ms: wms, n: wn } = await runRegions(seed, c0x, c0z, c0x + nc - 1, c0z + nc - 1, nw);
  const results = [{ ms: wms, out: [...chunkMap.values()] }];
  let totalMs = 0, cnt = 0;
  const W = nc * 16;
  const rgb = new Int32Array(W * W), hh = new Int16Array(W * W), wdA = new Int16Array(W * W), bio = new Uint8Array(W * W);
  const biomeCount = new Map();
  for (const r of results) {
    totalMs += r.ms;
    for (const ch of r.out) {
      cnt++;
      const ox = (ch.cx - c0x) * 16, oz = (ch.cz - c0z) * 16;
      for (let z = 0; z < 16; z++) for (let x = 0; x < 16; x++) {
        const i = (oz + z) * W + ox + x, c = z * 16 + x;
        rgb[i] = ch.rgb[c]; hh[i] = ch.h[c]; wdA[i] = ch.wd[c]; bio[i] = ch.biomes[c];
        biomeCount.set(ch.biomes[c], (biomeCount.get(ch.biomes[c]) || 0) + 1);
      }
    }
  }
  console.log(`map: ${cnt} chunks (+margins: ${wn} generated) in ${((performance.now() - tm) / 1000).toFixed(1)} s wall, ${(totalMs / wn).toFixed(2)} ms/chunk in workers`);
  const img = new Uint8ClampedArray(W * W * 4), bimg = new Uint8ClampedArray(W * W * 4);
  let maxH = -999, minH = 999, landCols = 0;
  for (let z = 0; z < W; z++) for (let x = 0; x < W; x++) {
    const i = z * W + x;
    let c = rgb[i];
    if (wdA[i] === 0) {
      const hn = z > 0 ? hh[i - W] : hh[i], hw = x > 0 ? hh[i - 1] : hh[i];
      const d = (hh[i] - hn) + (hh[i] - hw) * 0.5;
      const f = d > 0 ? Math.min(1.25, 1 + d * 0.08) : Math.max(0.6, 1 + d * 0.08);
      c = scale(c, f);
      landCols++;
      // subtle elevation tint
      const e = (hh[i] - 64) / 200;
      if (e > 0) c = blend(c, 0xffffff, Math.min(0.25, e * 0.2));
    }
    if (hh[i] > maxH) maxH = hh[i];
    if (hh[i] < minH) minH = hh[i];
    img[i * 4] = (c >> 16) & 255; img[i * 4 + 1] = (c >> 8) & 255; img[i * 4 + 2] = c & 255; img[i * 4 + 3] = 255;
    const bc = BIOME_MAP_COL[BIOMES[bio[i]].name] ?? 0xff00ff;
    const bcs = scale(bc, wdA[i] > 0 ? 1 : (0.85 + Math.max(-0.15, Math.min(0.15, (hh[i] - 64) / 400))));
    bimg[i * 4] = (bcs >> 16) & 255; bimg[i * 4 + 1] = (bcs >> 8) & 255; bimg[i * 4 + 2] = bcs & 255; bimg[i * 4 + 3] = 255;
  }
  // mark origin
  const oi = ((-c0z * 16) * W + (-c0x * 16));
  if (oi >= 0 && oi < W * W) for (let d = -3; d <= 3; d++) for (const [ii] of [[oi + d], [oi + d * W]]) if (ii >= 0 && ii < W * W) { img[ii * 4] = 255; img[ii * 4 + 1] = 0; img[ii * 4 + 2] = 0; }
  const sc = arg('scale', 1);
  writePNG('/tmp/world_top.png', W, W, img, sc);
  writePNG('/tmp/world_biomes.png', W, W, bimg, sc);
  console.log(`heights: min ${minH} max ${maxH}; land ${(100 * landCols / (W * W)).toFixed(1)}%`);
  const sorted = [...biomeCount.entries()].sort((a, b) => b[1] - a[1]);
  console.log('biomes: ' + sorted.map(([b, n]) => `${BIOMES[b].name} ${(100 * n / (W * W)).toFixed(1)}%`).join(', '));
  console.log('wrote /tmp/world_top.png /tmp/world_biomes.png');
}

// Split an inclusive chunk rectangle into regions and generate them on worker threads.
async function runRegions(seed, ax, az, bx, bz, nw, R = 10) {
  const regions = [];
  for (let z = az; z <= bz; z += R) for (let x = ax; x <= bx; x += R) regions.push([x, z, Math.min(x + R - 1, bx), Math.min(z + R - 1, bz)]);
  const per = Math.ceil(regions.length / nw);
  const results = await Promise.all(Array.from({ length: Math.min(nw, regions.length) }, (_, i) => new Promise((res, rej) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { seed, regions: regions.slice(i * per, (i + 1) * per) } });
    w.on('message', res); w.on('error', rej);
  })));
  const map = new Map();
  let ms = 0, n = 0;
  for (const r of results) { ms += r.ms; n += r.n; for (const ch of r.out) map.set(ch.cx + ',' + ch.cz, ch); }
  return { map, ms, n };
}

// --tiles "label:x:z,label:x:z,..." renders N x N crops side by side into /tmp/world_tiles.png
async function tiles(seed, spec, N, nw, sc) {
  const spots = spec.split(',').map(s => { const [l, x, z] = s.split(':'); return { l, x: Number(x), z: Number(z) }; });
  const map = new Map();
  for (const sp of spots) {
    const r = await runRegions(seed, (sp.x - N / 2 - 1) >> 4, (sp.z - N / 2 - 1) >> 4, (sp.x + N / 2) >> 4, (sp.z + N / 2) >> 4, nw, 4);
    for (const [k, v] of r.map) map.set(k, v);
  }
  const cols = Math.min(3, spots.length), rows = Math.ceil(spots.length / cols);
  const W = cols * (N + 4), H = rows * (N + 4);
  const img = new Uint8ClampedArray(W * H * 4);
  spots.forEach((sp, k) => {
    const ox = (k % cols) * (N + 4), oy = Math.floor(k / cols) * (N + 4);
    const cnt = new Map();
    const col = (x, z) => { const ch = map.get((x >> 4) + ',' + (z >> 4)); const c = (z & 15) * 16 + (x & 15); return [ch.rgb[c], ch.h[c], ch.wd[c], ch.biomes[c]]; };
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wx = sp.x - N / 2 + x, wz = sp.z - N / 2 + y;
      let [c, h, wd, b] = col(wx, wz);
      cnt.set(b, (cnt.get(b) || 0) + 1);
      if (wd === 0) {
        const hn = col(wx, wz - 1)[1], hw = col(wx - 1, wz)[1];
        const d = (h - hn) + (h - hw) * 0.5;
        c = scale(c, d > 0 ? Math.min(1.25, 1 + d * 0.08) : Math.max(0.6, 1 + d * 0.08));
      }
      const di = ((oy + y) * W + ox + x) * 4;
      img[di] = (c >> 16) & 255; img[di + 1] = (c >> 8) & 255; img[di + 2] = c & 255; img[di + 3] = 255;
    }
    const top = [...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([b, n]) => `${BIOMES[b].name} ${(100 * n / N / N).toFixed(0)}%`).join(', ');
    console.log(`tile ${k} (${sp.l} @ ${sp.x},${sp.z}): ${top}`);
  });
  writePNG('/tmp/world_tiles.png', W, H, img, sc);
  console.log('wrote /tmp/world_tiles.png');
}

function overview(gen, ccx, ccz, step, N) {
  const tn = gen.tn, cl = new Float64Array(16);
  const img = new Uint8ClampedArray(N * N * 4), bimg = new Uint8ClampedArray(N * N * 4);
  const hs = new Float64Array(N * N);
  const bi = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = Math.round(ccx + (i - N / 2) * step), z = Math.round(ccz + (j - N / 2) * step);
    tn.climate(x, z, cl, 0, true);
    const jag = tn.jagTerm(x, z, cl[8]);
    hs[j * N + i] = -64 + 128 * (1.5 + cl[6] + jag);
    bi[j * N + i] = cl[9];
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i, h = hs[k];
    let c;
    if (h < 63) c = blend(0x3050c0, 0x000830, Math.min(1, (63 - h) / 50));
    else {
      c = BIOMES[bi[k]].grassColor;
      const name = BIOMES[bi[k]].name;
      if (/desert|beach/.test(name)) c = 0xdbd3a0;
      if (/badlands/.test(name)) c = 0xb05a28;
      if (/peaks|slopes|snowy|frozen|ice|grove/.test(name)) c = 0xf0f4f8;
      if (/stony/.test(name)) c = 0x8a8a8a;
      const hn = j > 0 ? hs[k - N] : h;
      c = scale(c, Math.max(0.6, Math.min(1.3, 1 + (h - hn) * 0.15 / step * 4)));
      c = blend(c, 0x000000, Math.max(0, Math.min(0.35, (h - 64) / 500)));
    }
    img[k * 4] = (c >> 16) & 255; img[k * 4 + 1] = (c >> 8) & 255; img[k * 4 + 2] = c & 255; img[k * 4 + 3] = 255;
    const bc = BIOME_MAP_COL[BIOMES[bi[k]].name] ?? 0xff00ff;
    bimg[k * 4] = (bc >> 16) & 255; bimg[k * 4 + 1] = (bc >> 8) & 255; bimg[k * 4 + 2] = bc & 255; bimg[k * 4 + 3] = 255;
  }
  writePNG('/tmp/world_overview.png', N, N, img);
  writePNG('/tmp/world_overview_biomes.png', N, N, bimg);
  let mx = -1e9; for (const h of hs) mx = Math.max(mx, h);
  console.log(`wrote /tmp/world_overview.png (${N * step} blocks wide, ${step} blocks/px), max spline height ${mx.toFixed(0)}`);
}

function seamCheck(seed) {
  const A = new Generator(seed), Bg = new Generator(seed);
  const coords = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [5, -3], [6, -3], [-201, 165], [-200, 165], [-201, 166], [-200, 166], [93, 171], [94, 171]];
  const ra = new Map(), rb = new Map();
  const bufs = () => new Uint16Array(16 * 16 * HEIGHT);
  for (const [x, z] of coords) { const b = bufs(); const r = A.generateChunk(x, z, b); ra.set(x + ',' + z, { b, r }); }
  for (const [x, z] of [...coords].reverse()) { const b = bufs(); const r = Bg.generateChunk(x, z, b); rb.set(x + ',' + z, { b, r }); }
  let diff = 0, outDiff = 0;
  for (const k of ra.keys()) {
    const a = ra.get(k), b = rb.get(k);
    for (let i = 0; i < a.b.length; i++) if (a.b[i] !== b.b[i]) diff++;
    if (a.r.outside.length !== b.r.outside.length || a.r.outside.some((v, i) => v !== b.r.outside[i])) outDiff++;
  }
  // simulate engine merge in two different orders and compare the final world
  const merge = (order, src) => {
    const world = new Map();
    for (const k of order) world.set(k, Uint16Array.from(src.get(k).b));
    const apply = (outside) => {
      for (let i = 0; i < outside.length; i += 4) {
        const k = (outside[i] >> 4) + ',' + (outside[i + 2] >> 4);
        const w = world.get(k); if (!w) continue;
        const y = outside[i + 1] - MIN_Y; if (y < 0 || y >= HEIGHT) continue;
        const idx = (y * 16 + (outside[i + 2] & 15)) * 16 + (outside[i] & 15);
        const ct = w[idx] & TYPE_MASK;
        if (w[idx] === 0 || (T_REPLACEABLE[ct] && !T_FLUID[ct])) w[idx] = outside[i + 3];
      }
    };
    for (const k of order) apply(src.get(k).r.outside);
    return world;
  };
  const keys = [...ra.keys()];
  const w1 = merge(keys, ra), w2 = merge([...keys].reverse(), rb);
  let mergeDiff = 0;
  for (const k of keys) { const a = w1.get(k), b = w2.get(k); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) mergeDiff++; }
  // border continuity: compare surface heights across the (0,0)|(1,0) border vs inside
  const top = (b, x, z) => { let y = HEIGHT - 1; while (y > 0 && b[(y * 16 + z) * 16 + x] === 0) y--; return y; };
  const b0 = ra.get('0,0').b, b1 = ra.get('1,0').b;
  let borderJump = 0, innerJump = 0;
  for (let z = 0; z < 16; z++) { borderJump += Math.abs(top(b0, 15, z) - top(b1, 0, z)); innerJump += Math.abs(top(b0, 14, z) - top(b0, 15, z)); }
  console.log(`seams: block diffs between generation orders = ${diff}, outside-list diffs = ${outDiff}, merged-world diffs = ${mergeDiff}; ` +
    `avg |dh| across chunk border ${(borderJump / 16).toFixed(2)} vs inside ${(innerJump / 16).toFixed(2)}`);
}

function slices(gen, ccx, ccz) {
  const W = 256, buf = new Uint16Array(16 * 16 * HEIGHT);
  const zs = [ccz + 8, ccz + 300, ccz - 400];
  zs.forEach((zw, si) => {
    const img = new Uint8ClampedArray(W * HEIGHT * 4);
    const cz = zw >> 4, lz = zw & 15;
    const x0 = (ccx >> 4) * 16 - 128;
    for (let cx = x0 >> 4; cx < (x0 + W) >> 4; cx++) {
      const res = gen.generateChunk(cx, cz, buf);
      for (let lx = 0; lx < 16; lx++) {
        const px = cx * 16 + lx - x0;
        let topY = HEIGHT - 1;
        while (topY > 0 && buf[(topY * 16 + lz) * 16 + lx] === 0) topY--;
        for (let yi = 0; yi < HEIGHT; yi++) {
          const v = buf[(yi * 16 + lz) * 16 + lx], t = v & TYPE_MASK;
          let c;
          if (t === 0) c = yi > topY ? 0xa8c8ff : 0x161616;
          else if (t === ID.water) c = 0x2850c8;
          else if (t === ID.grass_block) c = BIOMES[res.biomes[lz * 16 + lx]].grassColor;
          else if (t === ID.oak_leaves || t === ID.jungle_leaves || t === ID.acacia_leaves || t === ID.dark_oak_leaves) c = 0x3a7a2a;
          else c = COL[t] >= 0 ? COL[t] : (COL[t] === -3 ? 0x60a040 : COL[t] === -2 ? 0x208050 : 0xff00ff);
          const i = ((HEIGHT - 1 - yi) * W + px) * 4;
          img[i] = (c >> 16) & 255; img[i + 1] = (c >> 8) & 255; img[i + 2] = c & 255; img[i + 3] = 255;
        }
      }
    }
    writePNG(`/tmp/world_slice${si}.png`, W, HEIGHT, img, 2);
  });
  console.log('wrote /tmp/world_slice0..2.png (x-y sections, 256 wide, y -64..320)');
}
