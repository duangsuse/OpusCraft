/* res_vam.js — shares window.gg (see index.html) */
(() => {
'use strict';
const { THREE, JSZip } = gg;
const { Blocks, Events, FACE_NY, FACE_PX, FACE_PY, FACE_PZ, Items, Rand, WOOL_COLORS, WOOL_NAMES, clamp, floor, hashString, texFaces } = gg;

/* ============================================================================
   4. PROCEDURAL TEXTURES
   ----------------------------------------------------------------------------
   16x16 pixel-art generators keyed by vanilla texture name. They are only used
   for textures a resource pack does not provide, so the game is playable with
   zero external files. Every generator is deterministic (seeded by name).
   ========================================================================== */
const C = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const mulc = (c, f) => [clamp(c[0] * f, 0, 255), clamp(c[1] * f, 0, 255), clamp(c[2] * f, 0, 255)];

class Pix {
  constructor(seed, n = 16) { this.n = n; this.d = new Uint8ClampedArray(n * n * 4); this.r = new Rand(hashString('tex:' + seed)); }
  set(x, y, c, a = 255) { if (x < 0 || y < 0 || x >= this.n || y >= this.n) return; const i = (y * this.n + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = a; }
  get(x, y) { const i = (y * this.n + x) * 4; return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]]; }
  alpha(x, y) { return (x < 0 || y < 0 || x >= this.n || y >= this.n) ? 0 : this.d[(y * this.n + x) * 4 + 3]; }
  fill(c, a = 255) { for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) this.set(x, y, c, a); return this; }
  // Mottled noise: per-pixel jitter plus 2x2 blotches (the classic vanilla look)
  mottle(hex, v = 0.15, blotch = 0.5, a = 255) {
    const c = typeof hex === 'string' ? C(hex) : hex; const n = this.n; const bl = [];
    for (let i = 0; i < (n / 2 + 1) * (n / 2 + 1); i++) bl.push(this.r.next() - 0.5);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const f = 1 + v * ((this.r.next() - 0.5) * (1 - blotch) + bl[(y >> 1) * (n / 2 + 1) + (x >> 1)] * blotch * 2);
      this.set(x, y, mulc(c, f), a);
    }
    return this;
  }
  rect(x, y, w, h, c, a = 255) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a); return this; }
  ellipse(cx, cy, rx, ry, c, a = 255) { for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) { const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.set(x, y, c, a); } return this; }
  line(x0, y0, x1, y1, c, thick = 1, a = 255) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (let s = 0; s <= steps; s++) { const t = s / steps; const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; for (let dy = 0; dy < thick; dy++) for (let dx = 0; dx < thick; dx++) this.set(floor(x + dx), floor(y + dy), c, a); }
    return this;
  }
  speck(count, c, size = 1) { for (let i = 0; i < count; i++) { const x = this.r.int(this.n), y = this.r.int(this.n); this.rect(x, y, size, size, c); } return this; }
  // Sprinkle 2x2/3x2 ore clusters over the current texture
  ore(hex, count = 5) { const c = C(hex); for (let i = 0; i < count; i++) { const x = 1 + this.r.int(this.n - 4), y = 1 + this.r.int(this.n - 3); const w = 2 + this.r.int(2); this.rect(x, y, w, 2, c); this.set(x, y, mulc(c, 1.3)); this.set(x + w - 1, y + 1, mulc(c, 0.7)); } return this; }
  outline(c = [20, 20, 20], a = 255) { // dark outline around opaque pixels (icons)
    const add = [];
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) if (this.alpha(x, y) === 0 && (this.alpha(x + 1, y) > 0 || this.alpha(x - 1, y) > 0 || this.alpha(x, y + 1) > 0 || this.alpha(x, y - 1) > 0)) add.push([x, y]);
    for (const [x, y] of add) this.set(x, y, c, a);
    return this;
  }
  shade(fn) { for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) { const p = this.get(x, y); if (p[3] > 0) this.set(x, y, mulc(p, fn(x, y)), p[3]); } return this; }
  toCanvas() { const cv = document.createElement('canvas'); cv.width = cv.height = this.n; const ctx = cv.getContext('2d'); const img = ctx.createImageData(this.n, this.n); img.data.set(this.d); ctx.putImageData(img, 0, 0); return cv; }
}

// ---- Composite helpers ------------------------------------------------------
function planks(p, hex) {
  p.mottle(hex, 0.12, 0.3);
  const dark = mulc(C(hex), 0.55), light = mulc(C(hex), 1.15);
  for (let y = 3; y < 16; y += 4) p.rect(0, y, 16, 1, dark);
  for (let b = 0; b < 4; b++) { const sx = (b % 2) ? 12 : 4; p.rect(sx, b * 4, 1, 3, dark); p.set(sx + 1, b * 4 + 1, light); }
  return p;
}
function cobble(p, hex = '#7a7a7a') {
  p.mottle(mulc(C(hex), 0.6), 0.2, 0.2);
  for (let i = 0; i < 14; i++) { const x = p.r.int(16), y = p.r.int(16), w = 3 + p.r.int(3), h = 2 + p.r.int(3); const c = mulc(C(hex), 0.85 + p.r.next() * 0.3); p.rect(x, y, w, h, c); p.rect(x, y, w, 1, mulc(c, 1.15)); }
  return p;
}
function logSide(p, bark, dark) { p.mottle(bark, 0.1, 0.2); for (let x = 0; x < 16; x++) if ((x + p.r.int(2)) % 3 === 0) p.rect(x, 0, 1, 16, mulc(C(dark), 0.9 + p.r.next() * 0.2)); return p; }
function logTop(p, bark, inner) { p.mottle(bark, 0.1, 0.3); p.rect(2, 2, 12, 12, C(inner)); for (let r = 1; r < 6; r += 2) { const c = mulc(C(inner), 0.8); p.rect(8 - r, 8 - r, r * 2, 1, c); p.rect(8 - r, 7 + r, r * 2, 1, c); p.rect(8 - r, 8 - r, 1, r * 2, c); p.rect(7 + r, 8 - r, 1, r * 2, c); } return p; }
function leaves(p) { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = 120 + p.r.int(110); p.set(x, y, [v, v, v], p.r.next() < 0.22 ? 0 : 255); } return p; }
function pile(p, hex) { p.ellipse(8, 11, 6, 3.5, C(hex)); p.ellipse(7, 9.5, 3, 2, mulc(C(hex), 1.2)); return p.outline(); }
function gem(p, hex) { const c = C(hex); for (let y = 2; y < 14; y++) { const w = y < 8 ? (y - 1) * 1.2 : (13 - y) * 1.2; p.rect(floor(8 - w), y, floor(w * 2) + 1, 1, c); } p.line(6, 4, 4, 7, mulc(c, 1.6), 1); return p.outline(); }
function ingot(p, hex) { const c = C(hex); for (let y = 6; y < 11; y++) p.rect(2 + floor((10 - y) / 2), y, 11, 1, c); p.rect(4, 5, 10, 1, mulc(c, 1.25)); p.rect(2, 11, 10, 1, mulc(c, 0.7)); return p.outline(); }
function meat(p, hex, bone) { p.ellipse(9, 8, 5, 4, C(hex)); p.ellipse(8, 7, 2.5, 1.8, mulc(C(hex), 1.2)); if (bone) p.rect(2, 7, 3, 3, C('#f4f0e0')); return p.outline(); }
function bucket(p, fillHex) { const g = C('#9a9a9a'); for (let y = 5; y < 14; y++) p.rect(4 + ((y - 5) >> 2), y, 9 - ((y - 5) >> 1), 1, g); p.rect(4, 5, 9, 1, mulc(g, 1.3)); p.line(5, 4, 8, 2, mulc(g, 0.8), 1); p.line(8, 2, 11, 4, mulc(g, 0.8), 1); if (fillHex) p.rect(5, 6, 7, 2, C(fillHex)); return p.outline(); }
function drawMap(p, map, pal) { for (let y = 0; y < map.length; y++) for (let x = 0; x < map[y].length; x++) { const ch = map[y][x]; if (pal[ch]) p.set(x, y, pal[ch]); } return p.outline(); }

// Tool shapes: 'm' = head material, 'h' = handle
const TOOL_MAPS = {
  pickaxe: ['..........mmmm..', '........mmmmmmm.', '.......mm..h.mmm', '......mm...h..mm', '.....mm...h...m.', '....mm....h.....', '...mm....h......', '..mm....h.......', '.mm....h........', '.m....h.........', '.....h..........', '....h...........', '...h............', '..h.............', '.h..............', 'h...............'],
  axe: ['.........mmmm...', '........mmmmmm..', '.......mmmmmmm..', '......hhmmmmmm..', '.....hh.mmmmm...', '....hh...mmm....', '...hh...........', '..hh............', '.hh.............', 'hh..............', '................', '................', '................', '................', '................', '................'],
  shovel: ['...........mmm..', '..........mmmmm.', '..........mmmmm.', '.........hmmmmm.', '........hh.mmm..', '.......hh.......', '......hh........', '.....hh.........', '....hh..........', '...hh...........', '..hh............', '.hh.............', 'hh..............', '................', '................', '................'],
  hoe: ['..........mmmmm.', '.........mmmmmm.', '........hhmm....', '.......hh.......', '......hh........', '.....hh.........', '....hh..........', '...hh...........', '..hh............', '.hh.............', 'hh..............', '................', '................', '................', '................', '................'],
  sword: ['.............mm.', '............mmm.', '...........mmm..', '..........mmm...', '.........mmm....', '........mmm.....', '.......mmm......', '..hh..mmm.......', '...hhmmm........', '....hhh.........', '...hhhh.........', '..hh..hh........', '.hh.............', 'hh..............', '................', '................']
};
const TOOL_MAT_COLORS = { wooden: '#9c7a4a', stone: '#8f8f8f', iron: '#d8d8d8', golden: '#f4d03f', diamond: '#5decf5' };

// ---- Generator table --------------------------------------------------------
const G = {};
const M = (hex, v = 0.15, bl = 0.5) => (p) => p.mottle(hex, v, bl);
G.stone = M('#7d7d7d', 0.2); G.andesite = M('#868a86', 0.2); G.dirt = M('#79553a', 0.22); G.sand = M('#dbd3a0', 0.12);
G.granite = (p) => p.mottle('#9a6b5a', 0.2).speck(20, C('#b98a7a')); G.diorite = (p) => p.mottle('#bcbcbc', 0.25).speck(18, C('#7a7a7a'));
G.gravel = (p) => p.mottle('#8a8480', 0.3, 0.7).speck(10, C('#5a5652'), 2);
G.bedrock = M('#5a5a5a', 0.55, 0.6); G.snow = M('#f2f8f8', 0.04); G.netherrack = M('#6f2e2a', 0.3, 0.6);
G.end_stone = (p) => p.mottle('#dcdfa5', 0.12).speck(14, C('#b5b57a'), 2); G.obsidian = (p) => p.mottle('#15101f', 0.35, 0.7).speck(8, C('#3b2a5a'), 2);
G.grass_block_top = M('#9c9c9c', 0.32, 0.5);
G.grass_block_side = (p) => { G.dirt(p); for (let x = 0; x < 16; x++) { const h = 3 + p.r.int(2); p.rect(x, 0, 1, h, mulc(C('#5d9c3c'), 0.85 + p.r.next() * 0.3)); } return p; };
G.grass_block_snow = (p) => { G.dirt(p); for (let x = 0; x < 16; x++) p.rect(x, 0, 1, 3 + p.r.int(2), mulc(C('#f2f8f8'), 0.9 + p.r.next() * 0.1)); return p; };
G.cobblestone = (p) => cobble(p); G.mossy_cobblestone = (p) => { cobble(p); for (let i = 0; i < 8; i++) p.rect(p.r.int(14), p.r.int(14), 2 + p.r.int(2), 2, C('#5c7a3a')); return p; };
G.stone_bricks = (p) => { p.mottle('#5f5f5f', 0.1); for (let y = 0; y < 16; y += 4) { const off = (y / 4) % 2 ? 4 : 0; for (let x = 0; x < 16; x += 8) { p.rect(((x + off) % 16), y, 7, 3, mulc(C('#8a8a8a'), 0.9 + p.r.next() * 0.2)); if (x + off + 7 > 16) p.rect(0, y, x + off + 7 - 16, 3, C('#8a8a8a')); } } return p; };
G.sandstone = (p) => { p.mottle('#d6cc8f', 0.1); p.rect(0, 5, 16, 1, C('#bfb07a')); p.rect(0, 10, 16, 1, C('#bfb07a')); return p; };
G.sandstone_top = M('#dbd3a0', 0.08); G.sandstone_bottom = M('#d1c78a', 0.1);
G.oak_log = (p) => logSide(p, '#6b5232', '#4e3a22'); G.oak_log_top = (p) => logTop(p, '#6b5232', '#b08b5a');
G.birch_log = (p) => { p.mottle('#d7d3cc', 0.08); for (let i = 0; i < 7; i++) p.rect(p.r.int(14), p.r.int(15), 2 + p.r.int(3), 1 + p.r.int(2), C('#2a2a2a')); return p; };
G.birch_log_top = (p) => logTop(p, '#d7d3cc', '#c8b68a'); G.spruce_log = (p) => logSide(p, '#3f2a16', '#2c1c0e'); G.spruce_log_top = (p) => logTop(p, '#3f2a16', '#8f6a44');
G.oak_planks = (p) => planks(p, '#b08b5a'); G.birch_planks = (p) => planks(p, '#c8b58a'); G.spruce_planks = (p) => planks(p, '#7a5a36');
G.oak_leaves = leaves; G.birch_leaves = leaves; G.spruce_leaves = leaves;
const sapling = (hex, tri) => (p) => { p.rect(7, 8, 2, 8, C('#6b4a2b')); if (tri) { for (let y = 2; y < 11; y++) p.rect(8 - (y >> 1), y, y, 1, C(hex)); } else p.ellipse(8, 6, 4.5, 4, C(hex)); return p; };
G.oak_sapling = sapling('#4a8f2b'); G.birch_sapling = sapling('#7bb54a'); G.spruce_sapling = sapling('#2d5a34', true);
G.glass = (p) => { p.rect(0, 0, 16, 1, C('#dfeeee')); p.rect(0, 15, 16, 1, C('#dfeeee')); p.rect(0, 0, 1, 16, C('#dfeeee')); p.rect(15, 0, 1, 16, C('#dfeeee')); p.line(2, 6, 6, 2, C('#ffffff'), 1, 140); p.line(2, 9, 9, 2, C('#ffffff'), 1, 90); return p; };
G.ice = (p) => { p.mottle('#a8d4ff', 0.06, 0.3, 215); p.line(2, 12, 9, 3, C('#e8f4ff'), 1, 200); return p; };
G.water_still = (p) => p.mottle('#c9d9ff', 0.12, 0.6, 190);
G.lava_still = (p) => { p.mottle('#d4531b', 0.15, 0.7); for (let i = 0; i < 6; i++) p.ellipse(p.r.int(16), p.r.int(16), 2 + p.r.int(3), 1.5 + p.r.int(2), C('#f5b021')); p.speck(10, C('#9a2e0c'), 2); return p; };
const ORE = { coal: '#2a2a2a', iron: '#c9a37a', gold: '#f6e27a', lapis: '#2758c9', diamond: '#5ce6e6', emerald: '#28d45a' };
for (const k of Object.keys(ORE)) G[k + '_ore'] = (p) => { G.stone(p); return p.ore(ORE[k], 5); };
const MB = { coal_block: '#232323', iron_block: '#d8d8d8', gold_block: '#f5d548', diamond_block: '#63e8e2', lapis_block: '#2c4fa8', emerald_block: '#2fbf5a' };
for (const k of Object.keys(MB)) G[k] = (p) => { const c = C(MB[k]); p.mottle(c, 0.08, 0.2); p.rect(0, 0, 16, 1, mulc(c, 1.25)); p.rect(0, 0, 1, 16, mulc(c, 1.25)); p.rect(15, 0, 1, 16, mulc(c, 0.7)); p.rect(0, 15, 16, 1, mulc(c, 0.7)); return p; };
G.crafting_table_top = (p) => { planks(p, '#b08b5a'); const d = C('#5a3d22'); p.rect(0, 0, 16, 1, d); p.rect(0, 15, 16, 1, d); p.rect(0, 0, 1, 16, d); p.rect(15, 0, 1, 16, d); p.rect(5, 1, 1, 14, d); p.rect(10, 1, 1, 14, d); p.rect(1, 5, 14, 1, d); p.rect(1, 10, 14, 1, d); return p; };
G.crafting_table_side = (p) => { planks(p, '#b08b5a'); p.rect(0, 0, 16, 2, C('#5a3d22')); p.rect(3, 4, 4, 6, C('#8a8a8a')); p.rect(4, 10, 2, 4, C('#5a3d22')); p.rect(10, 4, 3, 8, C('#6a6a6a')); return p; };
G.crafting_table_front = (p) => { planks(p, '#b08b5a'); p.rect(0, 0, 16, 2, C('#5a3d22')); p.line(3, 12, 10, 5, C('#8a8a8a'), 2); p.rect(10, 3, 4, 3, C('#3a3a3a')); return p; };
G.furnace_side = (p) => cobble(p); G.furnace_top = (p) => cobble(p);
G.furnace_front = (p) => { cobble(p); p.rect(4, 7, 8, 7, C('#1e1e1e')); p.rect(4, 6, 8, 1, C('#3a3a3a')); return p; };
G.furnace_front_on = (p) => { G.furnace_front(p); for (let x = 5; x < 11; x++) { const h = 2 + p.r.int(4); p.rect(x, 13 - h, 1, h, C('#ff8a1a')); p.rect(x, 13 - (h >> 1), 1, h >> 1, C('#ffd23c')); } return p; };
const chest = (front) => (p) => { p.mottle('#a5793f', 0.1, 0.3); const d = C('#3b2a14'); p.rect(0, 0, 16, 1, d); p.rect(0, 15, 16, 1, d); p.rect(0, 0, 1, 16, d); p.rect(15, 0, 1, 16, d); p.rect(1, 6, 14, 1, mulc(d, 1.4)); if (front) p.rect(7, 5, 2, 4, C('#8a8a8a')); return p; };
G.chest_top = chest(false); G.chest_side = chest(false); G.chest_front = chest(true);
G.tnt_side = (p) => { p.mottle('#c9331d', 0.12); p.rect(0, 5, 16, 5, C('#e8e8e8')); const k = C('#2a2a2a'); p.rect(2, 6, 3, 1, k); p.rect(3, 6, 1, 3, k); p.rect(6, 6, 1, 3, k); p.rect(7, 7, 1, 1, k); p.rect(8, 6, 1, 3, k); p.rect(10, 6, 3, 1, k); p.rect(11, 6, 1, 3, k); return p; };
G.tnt_top = (p) => { p.mottle('#8a2a1a', 0.12); p.rect(3, 3, 10, 10, C('#9a9a9a')); p.speck(12, C('#6a6a6a')); return p; };
G.tnt_bottom = M('#6a1e12', 0.12);
G.bookshelf = (p) => { planks(p, '#b08b5a'); const cols = ['#b02e26', '#3c44aa', '#5e7c16', '#f9801d', '#8932b8', '#169c9c']; for (const row of [1, 9]) { p.rect(1, row, 14, 6, C('#2b1d10')); let x = 1; while (x < 15) { const w = 1 + p.r.int(2); p.rect(x, row + p.r.int(2), w, 6, C(cols[p.r.int(cols.length)])); x += w + (p.r.chance(0.3) ? 1 : 0); } } return p; };
const torch = (top, glow) => (p) => { p.rect(7, 8, 2, 8, C('#8a6a3a')); p.rect(8, 8, 1, 8, C('#6b4a2b')); p.rect(7, 7, 2, 1, C(top)); p.rect(7, 5, 2, 2, C(glow)); return p; };
G.torch = torch('#ff9a1a', '#ffd648');
G.ladder = (p) => { const c = C('#8a6a3a'); p.rect(1, 0, 2, 16, c); p.rect(13, 0, 2, 16, c); for (const y of [1, 5, 9, 13]) p.rect(1, y, 14, 2, mulc(c, 1.1)); return p; };
for (const c of WOOL_NAMES) G[c + '_wool'] = (p) => { p.mottle(WOOL_COLORS[c], 0.1, 0.3); p.shade((x, y) => ((x + y) & 3) === 0 ? 0.9 : 1); return p; };
G.glowstone = (p) => { p.mottle('#c8a25a', 0.12, 0.6); for (let i = 0; i < 6; i++) p.rect(p.r.int(14), p.r.int(14), 2 + p.r.int(3), 2 + p.r.int(2), C('#f7e39a')); p.speck(10, C('#8a6a3a'), 2); return p; };
G.farmland = (p) => { p.mottle('#5b3d22', 0.15); for (const y of [1, 5, 9, 13]) p.rect(0, y, 16, 1, C('#3d2816')); return p; };
G.farmland_moist = (p) => { p.mottle('#3a2716', 0.15); for (const y of [1, 5, 9, 13]) p.rect(0, y, 16, 1, C('#241a0e')); return p; };
G.dirt_path_top = M('#9c8046', 0.12); G.dirt_path_side = (p) => { G.dirt(p); p.rect(0, 0, 16, 3, C('#9c8046')); return p; };
G.cactus_side = (p) => { p.mottle('#1f6b23', 0.1); for (const x of [3, 7, 11]) p.rect(x, 0, 1, 16, C('#165a1a')); p.speck(10, C('#e6f0b0')); return p; };
G.cactus_top = (p) => { p.mottle('#2f8a34', 0.1); p.rect(4, 4, 8, 8, C('#4aa64a')); return p; }; G.cactus_bottom = M('#2f8a34', 0.1);
G.dead_bush = (p) => { const c = C('#7a5a2a'); p.rect(7, 9, 2, 7, c); p.line(7, 9, 3, 3, c); p.line(8, 9, 12, 4, c); p.line(8, 7, 11, 1, c); p.line(7, 8, 4, 8, c); return p; };
G.short_grass = (p) => { for (let i = 0; i < 9; i++) { const x = 1 + p.r.int(14), h = 5 + p.r.int(9), v = 150 + p.r.int(90); p.rect(x, 16 - h, 1, h, [v, v, v]); } return p; };
G.fern = (p) => { const v = [170, 170, 170]; p.rect(7, 4, 2, 12, v); for (let y = 5; y < 15; y += 2) { p.line(7, y, 2, y - 2, v); p.line(8, y, 13, y - 2, v); } return p; };
const flower = (hex, center) => (p) => { p.rect(7, 8, 2, 8, C('#3f7a2a')); p.line(8, 11, 11, 9, C('#3f7a2a')); p.ellipse(8, 6, 3.5, 3.5, C(hex)); if (center) p.ellipse(8, 6, 1.5, 1.5, C(center)); return p; };
G.dandelion = flower('#f6e23a'); G.poppy = flower('#d62a1a', '#1a1a1a'); G.cornflower = flower('#4a5ee0', '#2a2a8a'); G.oxeye_daisy = flower('#f4f4f4', '#f6e23a');
for (let s = 0; s < 8; s++) G['wheat_stage' + s] = (p) => { const h = 4 + s * 1.5; const c = C(s >= 7 ? '#c9a23a' : s >= 5 ? '#8fb34a' : '#5aa64a'); for (const x of [2, 6, 10, 14]) { p.rect(x, floor(16 - h), 1, floor(h), c); if (s >= 3) p.line(x, 16 - h + 3, x - 2, 16 - h + 1, mulc(c, 0.85)); if (s >= 6) p.rect(x - 1, floor(16 - h), 3, 3, mulc(c, 1.15)); } return p; };
G.pumpkin_side = (p) => { p.mottle('#d68a1e', 0.1); for (const x of [2, 6, 10, 14]) p.rect(x, 0, 1, 16, C('#b06a12')); return p; };
G.pumpkin_top = (p) => { p.mottle('#d68a1e', 0.1); p.rect(7, 7, 2, 2, C('#5a8a2a')); for (let r = 3; r < 8; r += 2) { p.rect(8 - r, 8 - r, r * 2, 1, C('#b06a12')); p.rect(8 - r, 7 + r, r * 2, 1, C('#b06a12')); } return p; };
G.jack_o_lantern = (p) => { G.pumpkin_side(p); const y = C('#f7d24a'); p.rect(3, 4, 3, 3, y); p.rect(10, 4, 3, 3, y); p.rect(4, 10, 8, 2, y); p.rect(3, 9, 2, 2, y); p.rect(11, 9, 2, 2, y); return p; };
G.spawner = (p) => { p.fill(C('#0d0d0d'), 60); for (let i = 0; i < 16; i += 4) { p.rect(i, 0, 1, 16, C('#2a2a2a')); p.rect(0, i, 16, 1, C('#2a2a2a')); } p.rect(15, 0, 1, 16, C('#2a2a2a')); p.rect(0, 15, 16, 1, C('#2a2a2a')); return p; };
G.fire_0 = (p) => { for (let x = 0; x < 16; x++) { const h = 6 + p.r.int(10); p.rect(x, 16 - h, 1, h, C('#ff7a1a')); p.rect(x, 16 - (h >> 1), 1, h >> 1, C('#ffd23c')); } return p; };
G.oak_door_top = (p) => { planks(p, '#a57b45'); p.rect(3, 3, 10, 7, C('#2b1d10')); p.rect(4, 4, 8, 5, C('#a8d8ff'), 200); p.rect(7, 4, 2, 5, C('#2b1d10')); return p; };
G.oak_door_bottom = (p) => { planks(p, '#a57b45'); p.rect(3, 2, 10, 10, C('#6b4a2b')); p.rect(4, 3, 8, 8, C('#a57b45')); return p; };
G.oak_door = (p) => { p.rect(4, 0, 8, 16, C('#a57b45')); p.rect(5, 2, 6, 4, C('#a8d8ff')); p.rect(5, 9, 6, 5, C('#6b4a2b')); p.set(10, 8, C('#c8c8c8')); return p.outline(); };
for (let s = 0; s < 10; s++) G['destroy_stage_' + s] = (p) => { for (let i = 0; i < 3 + s * 2; i++) { let x = 8, y = 8; const len = 3 + s * 2; let dx = p.r.int(3) - 1, dy = p.r.int(3) - 1; for (let k = 0; k < len; k++) { p.set(x, y, [10, 10, 10], 150 + s * 10); if (p.r.chance(0.4)) dx = p.r.int(3) - 1; if (p.r.chance(0.4)) dy = p.r.int(3) - 1; x += dx; y += dy; } } return p; };
G.missing = (p) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, ((x >> 3) + (y >> 3)) & 1 ? C('#f800f8') : C('#000000')); return p; };
// ---- Items ----
G.stick = (p) => p.line(3, 12, 12, 3, C('#8a6a3a'), 2).outline();
G.coal = (p) => { p.ellipse(8, 8, 5, 4.5, C('#1e1e1e')); p.rect(6, 5, 2, 2, C('#3a3a3a')); return p.outline(); }; G.charcoal = (p) => { p.ellipse(8, 8, 5, 4.5, C('#2f2a25')); p.rect(6, 5, 2, 2, C('#4a4038')); return p.outline(); };
G.iron_ingot = (p) => ingot(p, '#d8d8d8'); G.gold_ingot = (p) => ingot(p, '#f5d548');
G.diamond = (p) => gem(p, '#5decf5'); G.emerald = (p) => gem(p, '#28d45a'); G.lapis_lazuli = (p) => gem(p, '#2758c9');
G.glowstone_dust = (p) => pile(p, '#f5d548'); G.gunpowder = (p) => pile(p, '#5a5a5a'); G.sugar = (p) => pile(p, '#f4f4f4');
G.flint = (p) => { for (let y = 3; y < 13; y++) p.rect(3 + (y >> 1), y, 12 - y, 1, C('#3a3a3a')); p.line(5, 5, 9, 9, C('#5a5a5a')); return p.outline(); };
G.string = (p) => { const c = C('#f0f0f0'); p.line(3, 3, 6, 8, c); p.line(6, 8, 10, 5, c); p.line(10, 5, 12, 12, c); return p.outline(); };
G.feather = (p) => { p.ellipse(8, 8, 3, 6.5, C('#f4f4f4')); p.line(6, 13, 10, 3, C('#c8c8c8')); return p.outline(); };
G.bone = (p) => { const c = C('#f0f0e0'); p.line(4, 11, 11, 4, c, 2); p.ellipse(4, 12, 2, 2, c); p.ellipse(12, 4, 2, 2, c); return p.outline(); };
G.leather = (p) => { p.ellipse(8, 8, 6, 5, C('#a06a3a')); p.rect(3, 4, 3, 3, C('#a06a3a')); p.rect(11, 9, 3, 3, C('#a06a3a')); return p.outline(); };
G.rotten_flesh = (p) => { p.ellipse(8, 8, 6, 4.5, C('#7a8a3a')); p.speck(6, C('#5a4a2a'), 2); return p.outline(); };
G.book = (p) => { p.rect(4, 2, 9, 12, C('#7a3a1a')); p.rect(6, 3, 6, 10, C('#f0e8d0')); p.rect(4, 2, 2, 12, C('#5a2a10')); return p.outline(); };
G.paper = (p) => { p.rect(4, 2, 8, 12, C('#f4f4f4')); for (let y = 4; y < 13; y += 3) p.rect(5, y, 6, 1, C('#c8c8d8')); return p.outline(); };
G.snowball = (p) => { p.ellipse(8, 8, 5.5, 5.5, C('#f4faff')); p.ellipse(6.5, 6.5, 2, 2, C('#ffffff')); return p.outline(); };
G.egg = (p) => { p.ellipse(8, 8.5, 4, 5.5, C('#f8f0d8')); p.ellipse(6.5, 6, 1.5, 2, C('#ffffff')); return p.outline(); };
G.wheat = (p) => { for (const x of [4, 8, 12]) { p.rect(x, 6, 1, 10, C('#8fa03a')); p.ellipse(x + 0.5, 5, 1.6, 4, C('#c9a23a')); } return p.outline(); };
G.wheat_seeds = (p) => { for (const [x, y] of [[4, 5], [9, 4], [6, 9], [11, 9], [8, 12]]) p.ellipse(x, y, 1.6, 1.2, C('#5aa64a')); return p.outline(); };
G.apple = (p) => { p.ellipse(8, 9, 5, 5, C('#d62a1a')); p.rect(8, 3, 1, 3, C('#5a3a1a')); p.ellipse(10.5, 4, 2, 1, C('#4a8f2b')); p.ellipse(6, 7, 1.5, 2, C('#ff6a5a')); return p.outline(); };
G.carrot = (p) => { for (let y = 5; y < 15; y++) p.rect(8 - ((15 - y) >> 2), y, ((15 - y) >> 1) + 1, 1, C('#e8801a')); p.rect(7, 1, 1, 4, C('#3f7a2a')); p.rect(9, 2, 1, 3, C('#3f7a2a')); return p.outline(); };
G.melon_slice = (p) => { p.ellipse(8, 9, 6.5, 6, C('#2f8a34')); p.ellipse(8, 9, 5, 4.5, C('#d62a3a')); p.rect(0, 0, 16, 6, [0, 0, 0], 0); p.speck(5, C('#1a1a1a')); return p.outline(); };
G.bread = (p) => { p.ellipse(8, 8, 6.5, 4, C('#c98a3a')); for (const x of [4, 7, 10]) p.line(x, 6, x + 2, 9, C('#8a5a2a')); return p.outline(); };
G.porkchop = (p) => meat(p, '#f4a0a0', true); G.cooked_porkchop = (p) => meat(p, '#b46a3a', true);
G.beef = (p) => meat(p, '#b8302a', false); G.cooked_beef = (p) => meat(p, '#6a3a2a', false);
G.chicken = (p) => meat(p, '#f0c8b0', true); G.cooked_chicken = (p) => meat(p, '#c98a4a', true);
G.mutton = (p) => meat(p, '#d05050', true); G.cooked_mutton = (p) => meat(p, '#8a4a3a', true);
G.bucket = (p) => bucket(p, null); G.water_bucket = (p) => bucket(p, '#3f76e4'); G.lava_bucket = (p) => bucket(p, '#ff8a1a');
G.bow = (p) => { const c = C('#8a6a3a'); p.line(3, 3, 7, 2, c); p.line(7, 2, 13, 8, c); p.line(13, 8, 13, 13, c); p.line(3, 3, 12, 13, C('#e8e8e8')); return p.outline(); };
G.arrow = (p) => { p.line(3, 12, 11, 4, C('#8a6a3a')); p.rect(11, 2, 3, 3, C('#c8c8c8')); p.rect(2, 11, 3, 3, C('#f4f4f4')); return p.outline(); };
G.shears = (p) => { const g = C('#c8c8c8'); p.line(4, 4, 11, 11, g, 2); p.line(11, 4, 4, 11, g, 2); p.ellipse(4, 12.5, 2, 2, C('#d62a1a')); p.ellipse(12, 12.5, 2, 2, C('#d62a1a')); return p.outline(); };
G.flint_and_steel = (p) => { for (let y = 3; y < 9; y++) p.rect(3 + (y >> 1), y, 8 - y, 1, C('#3a3a3a')); p.ellipse(10, 10, 4, 4, C('#c8c8c8')); p.ellipse(10, 10, 2, 2, [0, 0, 0], 0); p.rect(10, 8, 4, 4, [0, 0, 0], 0); return p.outline(); };
for (const tier of Object.keys(TOOL_MAT_COLORS)) for (const kind of Object.keys(TOOL_MAPS)) G[tier + '_' + kind] = (p) => drawMap(p, TOOL_MAPS[kind], { m: C(TOOL_MAT_COLORS[tier]), h: C('#6b4a2b') });

const ProcTex = {
  cache: new Map(),
  has(name) { return !!G[name]; },
  get(name) {
    if (this.cache.has(name)) return this.cache.get(name);
    const gen = G[name];
    let cv = null;
    if (gen) { const p = new Pix(name); gen(p); cv = p.toCanvas(); }
    this.cache.set(name, cv);
    return cv;
  }
};
/* ============================================================================
   5. TEXTURE ATLAS + RESOURCE PACK LOADER + INVENTORY ICONS
   ----------------------------------------------------------------------------
   All block and item textures live in one atlas (NearestFilter, no mipmaps).
   Tile indices are assigned once from texture *names*, so loading a resource
   pack only redraws the atlas canvas — chunk meshes stay valid.
   ========================================================================== */
const TINTS = { grass: '#79c05a', foliage: '#59ae30', birch: '#80a755', spruce: '#619961', water: '#3f76e4' };

const Atlas = {
  names: [], indexOf: new Map(),
  tileRes: 16, tilesPerRow: 1, size: 16,
  canvas: null, texture: null,
  packImages: new Map(),       // texture name -> ImageBitmap/Image from the loaded pack
  avgColor: null,              // Float32Array(n*3): average colour per tile (particles)
  iconCache: new Map(),

  register(name) {
    if (!this.indexOf.has(name)) { this.indexOf.set(name, this.names.length); this.names.push(name); }
    return this.indexOf.get(name);
  },
  index(name) { const i = this.indexOf.get(name); return i === undefined ? this.indexOf.get('missing') : i; },

  // (Re)draw the atlas from pack images, falling back to procedural tiles.
  build() {
    // Pick the tile resolution from the pack (mode of image widths, capped at 128).
    let res = 16;
    if (this.packImages.size) {
      const hist = new Map();
      for (const img of this.packImages.values()) { const w = Math.min(img.width, 128); hist.set(w, (hist.get(w) || 0) + 1); }
      let best = 0; for (const [w, n] of hist) if (n > best) { best = n; res = w; }
    }
    this.tileRes = res;
    this.tilesPerRow = Math.ceil(Math.sqrt(this.names.length));
    this.size = this.tilesPerRow * res;
    const cv = this.canvas || document.createElement('canvas');
    cv.width = cv.height = this.size;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cv.width, cv.height);
    this.avgColor = new Float32Array(this.names.length * 3);
    let missing = 0;
    for (let i = 0; i < this.names.length; i++) {
      const name = this.names[i];
      let src = this.packImages.get(name) || ProcTex.get(name);
      if (!src) { src = ProcTex.get('missing'); missing++; }
      const sw = src.width, sh = src.height;
      // Animated textures are vertical strips of square frames: use the first frame.
      const frame = (sh > sw && sh % sw === 0) ? sw : sh;
      const tx = (i % this.tilesPerRow) * res, ty = floor(i / this.tilesPerRow) * res;
      ctx.drawImage(src, 0, 0, sw, frame, tx, ty, res, res);
      // average colour (used for break particles and ambient tints)
      const data = ctx.getImageData(tx, ty, res, res).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let p = 0; p < data.length; p += 4) if (data[p + 3] > 0) { r += data[p]; g += data[p + 1]; b += data[p + 2]; n++; }
      if (n) { this.avgColor[i * 3] = r / n / 255; this.avgColor[i * 3 + 1] = g / n / 255; this.avgColor[i * 3 + 2] = b / n / 255; }
    }
    this.canvas = cv;
    if (!this.texture) {
      this.texture = new THREE.CanvasTexture(cv);
      this.texture.magFilter = THREE.NearestFilter;
      this.texture.minFilter = THREE.NearestFilter;
      this.texture.generateMipmaps = false;
      this.texture.flipY = false; // v=0 is the top row of the canvas (see mesher UV conventions)
    }
    this.texture.needsUpdate = true;
    this.iconCache.clear();
    Events.emit('atlasRebuilt');
    if (missing) console.warn('Atlas: ' + missing + ' textures had no generator and use the missing texture');
  },

  // Draw one atlas tile into a context at (dx,dy,dw,dh), optionally tinted.
  drawTile(ctx, index, dx, dy, dw, dh, tint) {
    const res = this.tileRes, sx = (index % this.tilesPerRow) * res, sy = floor(index / this.tilesPerRow) * res;
    if (!tint) { ctx.drawImage(this.canvas, sx, sy, res, res, dx, dy, dw, dh); return; }
    const t = Atlas._tmp || (Atlas._tmp = document.createElement('canvas'));
    t.width = t.height = res;
    const tc = t.getContext('2d');
    tc.clearRect(0, 0, res, res);
    tc.globalCompositeOperation = 'source-over';
    tc.drawImage(this.canvas, sx, sy, res, res, 0, 0, res, res);
    tc.globalCompositeOperation = 'multiply'; tc.fillStyle = tint; tc.fillRect(0, 0, res, res);
    tc.globalCompositeOperation = 'destination-in'; tc.drawImage(this.canvas, sx, sy, res, res, 0, 0, res, res);
    ctx.drawImage(t, 0, 0, res, res, dx, dy, dw, dh);
  },

  // Inventory icon as a data URL (isometric cube for cube blocks, flat sprite otherwise).
  getIcon(itemName) {
    if (this.iconCache.has(itemName)) return this.iconCache.get(itemName);
    const item = Items.get(itemName);
    const cv = document.createElement('canvas'); cv.width = cv.height = 48;
    const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
    const block = item && item.block !== null ? Blocks.byId[item.block] : null;
    if (block && block.icon === 'cube') {
      const tiles = Blocks.tilesFor(block, 0);
      const tintTop = tintColor(block, FACE_PY), tintSide = tintColor(block, FACE_PZ);
      ctx.setTransform(16, -8, 16, 8, 8, 14); this.drawTile(ctx, tiles[FACE_PY], 0, 0, 1, 1, tintTop);
      ctx.setTransform(16, 8, 0, 20, 8, 14); this.drawTile(ctx, tiles[FACE_PZ], 0, 0, 1, 1, tintSide);
      ctx.setTransform(16, -8, 0, 20, 24, 22); this.drawTile(ctx, tiles[FACE_PX], 0, 0, 1, 1, tintSide);
      // shade the two side faces
      ctx.globalCompositeOperation = 'multiply';
      ctx.setTransform(16, 8, 0, 20, 8, 14); ctx.fillStyle = 'rgb(200,200,200)'; ctx.fillRect(0, 0, 1, 1);
      ctx.setTransform(16, -8, 0, 20, 24, 22); ctx.fillStyle = 'rgb(150,150,150)'; ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      const texName = item ? item.tex : 'missing';
      const idx = this.index(block && !block.itemTex ? texFaces(block.tex)[0] : texName);
      const tint = block ? tintColor(block, FACE_PZ) : null;
      this.drawTile(ctx, idx, 4, 4, 40, 40, tint);
    }
    const url = cv.toDataURL();
    this.iconCache.set(itemName, url);
    return url;
  }
};
// Tint colour (CSS) used by icons; the mesher uses biome-aware variants of the same table.
function tintColor(block, face) {
  const t = block.tint;
  if (!t) return null;
  if (typeof t === 'string') return TINTS[t] || null;
  if (face === FACE_PY && t.top) return TINTS[t.top] || null;
  if (face !== FACE_PY && face !== FACE_NY && t.side) return TINTS[t.side] || null;
  return null;
}

/* ---- Resource pack loader ------------------------------------------------ */
// Legacy (1.12 and older) texture names mapped onto modern names.
const TEX_ALIASES = {
  grass_top: 'grass_block_top', grass_side: 'grass_block_side', grass_side_snowed: 'grass_block_snow',
  log_oak: 'oak_log', log_oak_top: 'oak_log_top', log_birch: 'birch_log', log_birch_top: 'birch_log_top', log_spruce: 'spruce_log', log_spruce_top: 'spruce_log_top',
  planks_oak: 'oak_planks', planks_birch: 'birch_planks', planks_spruce: 'spruce_planks',
  leaves_oak: 'oak_leaves', leaves_birch: 'birch_leaves', leaves_spruce: 'spruce_leaves',
  sapling_oak: 'oak_sapling', sapling_birch: 'birch_sapling', sapling_spruce: 'spruce_sapling',
  stone_granite: 'granite', stone_diorite: 'diorite', stone_andesite: 'andesite', stonebrick: 'stone_bricks', cobblestone_mossy: 'mossy_cobblestone',
  tallgrass: 'short_grass', grass: 'short_grass', flower_dandelion: 'dandelion', flower_rose: 'poppy', flower_oxeye_daisy: 'oxeye_daisy',
  pumpkin_face_off: 'pumpkin_side', pumpkin_face_on: 'jack_o_lantern', furnace_front_off: 'furnace_front', mob_spawner: 'spawner', fire_layer_0: 'fire_0',
  grass_path_top: 'dirt_path_top', grass_path_side: 'dirt_path_side', door_wood_upper: 'oak_door_top', door_wood_lower: 'oak_door_bottom', door_wood: 'oak_door',
  seeds_wheat: 'wheat_seeds', dye_powder_blue: 'lapis_lazuli', porkchop_raw: 'porkchop', porkchop_cooked: 'cooked_porkchop', beef_raw: 'beef', beef_cooked: 'cooked_beef',
  chicken_raw: 'chicken', chicken_cooked: 'cooked_chicken', mutton_raw: 'mutton', mutton_cooked: 'cooked_mutton', bucket_empty: 'bucket', bucket_water: 'water_bucket', bucket_lava: 'lava_bucket',
  melon: 'melon_slice', apple_red: 'apple', snowball: 'snowball', string: 'string'
};
for (const c of WOOL_NAMES) TEX_ALIASES['wool_colored_' + c.replace('light_', 'silver_').replace('silver_gray', 'silver')] = c + '_wool';
for (const k of ['pickaxe', 'axe', 'shovel', 'hoe', 'sword']) { TEX_ALIASES['wood_' + k] = 'wooden_' + k; TEX_ALIASES['gold_' + k] = 'golden_' + k; }
for (let i = 0; i < 8; i++) TEX_ALIASES['wheat_stage_' + i] = 'wheat_stage' + i;

const ResourcePack = {
  loaded: false, name: '', count: 0, total: 0,
  async load(file) {
    const zip = await JSZip.loadAsync(file);
    const wanted = new Set(Atlas.names);
    const found = new Map();
    const re = /(^|\/)assets\/minecraft\/textures\/(block|blocks|item|items)\/([a-z0-9_\-]+)\.png$/;
    zip.forEach((path, entry) => {
      if (entry.dir) return;
      const lower = path.toLowerCase();
      // Ignore OptiFine / MCPatcher extensions (CTM, CIT, emissive, random mobs) and metadata files.
      if (lower.includes('optifine/') || lower.includes('mcpatcher/') || lower.includes('/ctm/') || lower.endsWith('.mcmeta') || lower.endsWith('.properties')) return;
      const m = lower.match(re); if (!m) return;
      let name = m[3];
      if (TEX_ALIASES[name]) name = TEX_ALIASES[name];
      if (!wanted.has(name)) return;
      const isItemFolder = m[2].startsWith('item');
      const it = Items.byName[name];
      const wantsItemFolder = !!(it && it.type !== 'block');
      // Root-level assets beat version overlay folders (components_1.21/assets/...), and the matching folder type beats the other.
      const prio = (lower.startsWith('assets/') ? 4 : 0) + ((isItemFolder === wantsItemFolder) ? 2 : 1);
      const prev = found.get(name);
      if (!prev || prev.prio < prio) found.set(name, { entry, prio });
    });
    const images = new Map();
    await Promise.all([...found].map(async ([name, { entry }]) => {
      try { const blob = await entry.async('blob'); images.set(name, await blobToImage(blob)); }
      catch (e) { console.warn('Resource pack: could not decode ' + name, e); }
    }));
    Atlas.packImages = images;
    Atlas.build();
    this.loaded = true; this.name = file.name; this.count = images.size; this.total = wanted.size;
    return { count: images.size, total: wanted.size };
  },
  unload() { Atlas.packImages = new Map(); Atlas.build(); this.loaded = false; this.name = ''; this.count = 0; }
};
function blobToImage(blob) {
  if (window.createImageBitmap) return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }).catch(() => createImageBitmap(blob));
  return new Promise((res, rej) => { const url = URL.createObjectURL(blob); const img = new Image(); img.onload = () => { URL.revokeObjectURL(url); res(img); }; img.onerror = rej; img.src = url; });
}
/* ============================================================================
   15. MOBS — box models, AI, spawning, combat, drops
   ----------------------------------------------------------------------------
   Models are built from coloured boxes (procedural, like the block fallback).
   STUB: entity textures from resource packs (entity/pig/pig.png ...) are not
   mapped onto the box UV layout yet — mobs always use procedural colours.
   ========================================================================== */
const MOB_TYPES = {
  pig:      { w: 0.45, h: 0.9,  health: 10, speed: 1.6, passive: true,  drops: [['porkchop', 1, 3]], name: 'Pig' },
  cow:      { w: 0.45, h: 1.4,  health: 10, speed: 1.5, passive: true,  drops: [['beef', 1, 3], ['leather', 0, 2]], name: 'Cow' },
  sheep:    { w: 0.45, h: 1.3,  health: 8,  speed: 1.5, passive: true,  drops: [['mutton', 1, 2]], name: 'Sheep' },
  chicken:  { w: 0.2,  h: 0.7,  health: 4,  speed: 1.7, passive: true,  drops: [['chicken', 1, 1], ['feather', 0, 2]], name: 'Chicken' },
  zombie:   { w: 0.3,  h: 1.95, health: 20, speed: 2.4, hostile: true,  damage: 3, drops: [['rotten_flesh', 0, 2]], burns: true, name: 'Zombie' },
  skeleton: { w: 0.3,  h: 1.99, health: 20, speed: 2.6, hostile: true,  ranged: true, drops: [['bone', 0, 2], ['arrow', 0, 2]], burns: true, name: 'Skeleton' },
  creeper:  { w: 0.3,  h: 1.7,  health: 20, speed: 2.6, hostile: true,  explodes: true, drops: [['gunpowder', 0, 2]], name: 'Creeper' }
};
const SHEEP_COLOR_WEIGHTS = [['white', 81], ['black', 5], ['gray', 5], ['light_gray', 5], ['brown', 3], ['pink', 1]];
Object.assign(gg, { C, mulc, Pix, planks, cobble, logSide, logTop, leaves, pile, gem, ingot, meat, bucket, drawMap, TOOL_MAPS, TOOL_MAT_COLORS, G, M, sapling, ORE, MB, chest, torch, flower, ProcTex, TINTS, Atlas, tintColor, TEX_ALIASES, ResourcePack, blobToImage, MOB_TYPES, SHEEP_COLOR_WEIGHTS });

})();
