// Preview block textures as contact sheets in /tmp.
// usage: node tools/preview_blocks.mjs [filter-substring ...] [--scale=5] [--height] [--raw] [--tile] [--comp] [--anim=name]
//   default sheets (/tmp/blocks_N.png) show tintable textures multiplied by plains grass / foliage / water colours.
//   --raw: untinted sheets, --height: height maps as grayscale, --tile: 3x3 tiling check, --comp: grass side composite,
//   --anim=name: all frames of an animated texture.
import { writePNG, sheet } from './png.mjs';
import { paintBlockTextures, TEX_SIZE } from '../src/textures/blocktex.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((s) => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const filters = args.filter((a) => !a.startsWith('--'));
const scale = +opt('scale', 5);
const S = TEX_SIZE;

const t0 = performance.now();
const tex = paintBlockTextures();
console.log('painted', Object.keys(tex).length, 'textures in', (performance.now() - t0).toFixed(1), 'ms');

const GRASS = 0x91bd59, FOLIAGE = 0x77ab2f, WATER = 0x3f76e4, SPRUCE = 0x619961, BIRCH = 0x80a755;
const TINT = {
  grass_block_top: GRASS, grass_block_side_overlay: GRASS, short_grass: GRASS, tall_grass_top: GRASS, tall_grass_bottom: GRASS,
  fern: GRASS, large_fern_top: GRASS, large_fern_bottom: GRASS, sugar_cane: GRASS,
  oak_leaves: FOLIAGE, jungle_leaves: FOLIAGE, acacia_leaves: FOLIAGE, dark_oak_leaves: FOLIAGE, vine: FOLIAGE,
  birch_leaves: BIRCH, spruce_leaves: SPRUCE, lily_pad: 0x208030, water_still: WATER, water_flow: WATER,
};
function tinted(name, rgba) {
  const t = TINT[name]; if (t == null) return rgba;
  const o = new Uint8ClampedArray(rgba); const r = (t >> 16) & 255, g = (t >> 8) & 255, b = t & 255;
  for (let i = 0; i < o.length; i += 4) { o[i] = o[i] * r / 255; o[i + 1] = o[i + 1] * g / 255; o[i + 2] = o[i + 2] * b / 255; }
  return o;
}
function heightImg(h) {
  const o = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = Math.round(h[i] * 255); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255; }
  return o;
}
function tile(rgba, n = 3) { // n x n tiling preview
  const W = S * n; const o = new Uint8ClampedArray(W * W * 4);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const si = ((y % S) * S + (x % S)) * 4; o.set(rgba.subarray(si, si + 4), (y * W + x) * 4); }
  return { w: W, h: W, data: o };
}

let names = Object.keys(tex);
if (filters.length) names = names.filter((n) => filters.some((f) => n.includes(f)));
const PER = 48; const COLS = 8;
for (let p = 0; p * PER < names.length; p++) {
  const part = names.slice(p * PER, (p + 1) * PER);
  const imgs = part.map((n) => ({ w: S, h: S, data: tinted(n, tex[n].frames[0]) }));
  const sh = sheet(imgs, COLS, scale, 6);
  writePNG(`/tmp/blocks_${p + 1}.png`, sh.w, sh.h, sh.data, 1);
  console.log(`/tmp/blocks_${p + 1}.png:`, part.join(' '));
  if (args.includes('--raw')) { // untinted (as stored)
    const rs = sheet(part.map((n) => ({ w: S, h: S, data: tex[n].frames[0] })), COLS, scale, 6);
    writePNG(`/tmp/blocks_raw_${p + 1}.png`, rs.w, rs.h, rs.data, 1);
  }
  if (args.includes('--height')) {
    const hs = sheet(part.map((n) => ({ w: S, h: S, data: heightImg(tex[n].height) })), COLS, scale, 6);
    writePNG(`/tmp/blocks_h_${p + 1}.png`, hs.w, hs.h, hs.data, 1);
  }
  if (args.includes('--tile')) {
    const ts = sheet(part.map((n) => tile(tinted(n, tex[n].frames[0]))), COLS, 2, 6);
    writePNG(`/tmp/blocks_t_${p + 1}.png`, ts.w, ts.h, ts.data, 1);
  }
}
// composites: grass side = side + tinted overlay
if (args.includes('--comp')) {
  const side = new Uint8ClampedArray(tex.grass_block_side.frames[0]); const ov = tinted('grass_block_side_overlay', tex.grass_block_side_overlay.frames[0]);
  for (let i = 0; i < side.length; i += 4) if (ov[i + 3] > 0) { side[i] = ov[i]; side[i + 1] = ov[i + 1]; side[i + 2] = ov[i + 2]; }
  const list = [side, tinted('grass_block_top', tex.grass_block_top.frames[0]), tex.dirt.frames[0], tex.grass_block_snow.frames[0], tex.podzol_side.frames[0], tex.dirt_path_side.frames[0]];
  const cs = sheet(list.map((d) => tile(d, 2)), 6, 4, 6);
  writePNG('/tmp/blocks_comp.png', cs.w, cs.h, cs.data, 1);
}
const anim = opt('anim', null);
if (anim) {
  const t = tex[anim];
  const sh = sheet(t.frames.map((f) => ({ w: S, h: S, data: tinted(anim, f) })), 8, scale, 4);
  writePNG(`/tmp/anim_${anim}.png`, sh.w, sh.h, sh.data, 1);
  console.log(`/tmp/anim_${anim}.png frames:`, t.frames.length, 'frameTime', t.frameTime);
}
// sanity checks
for (const [n, t] of Object.entries(tex)) {
  if (!t.frames?.length || t.frames.some((f) => f.length !== S * S * 4)) console.log('BAD frames', n);
  if (!(t.height instanceof Float32Array) || t.height.length !== S * S) console.log('BAD height', n);
}
