// Recreated vanilla 1.20 GUI sprites (pure JS, no DOM).
// paintGuiTextures() -> { [name]: { w, h, data: Uint8ClampedArray(w*h*4) } }  (RGBA, row-major)
// Sprite sizes and container slot coordinates match vanilla so the engine can lay them out like Gui.java /
// AbstractContainerScreen. Container backgrounds are 256x256 with the panel at (0,0), like gui/container/*.png.
import { getGlyph } from '../ui/font.js';

// ---------------------------------------------------------------------------------------------
// tiny raster helpers
// ---------------------------------------------------------------------------------------------
const mk = (w, h) => ({ w, h, data: new Uint8ClampedArray(w * h * 4) });
function hex(s, a = 255) {
  if (Array.isArray(s)) return s;
  const v = parseInt(s.replace('#', ''), 16);
  return [v >> 16 & 255, v >> 8 & 255, v & 255, a];
}
function set(im, x, y, c) {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h || !c) return;
  const i = (y * im.w + x) * 4;
  im.data[i] = c[0]; im.data[i + 1] = c[1]; im.data[i + 2] = c[2]; im.data[i + 3] = c[3] ?? 255;
}
function get(im, x, y) {
  if (x < 0 || y < 0 || x >= im.w || y >= im.h) return [0, 0, 0, 0];
  const i = (y * im.w + x) * 4;
  return [im.data[i], im.data[i + 1], im.data[i + 2], im.data[i + 3]];
}
function rect(im, x, y, w, h, c) { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) set(im, xx, yy, c); }
// draw ASCII art: rows of chars, pal maps char -> color (unmapped chars are skipped)
function art(im, rows, pal, ox = 0, oy = 0) {
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = pal[row[x]]; if (c) set(im, ox + x, oy + y, hex(c)); } });
  return im;
}
const fromArt = (rows, pal) => art(mk(rows[0].length, rows.length), rows, pal);
function copy(src) { const o = mk(src.w, src.h); o.data.set(src.data); return o; }
function blit(dst, src, x, y) {
  for (let yy = 0; yy < src.h; yy++) for (let xx = 0; xx < src.w; xx++) {
    const c = get(src, xx, yy); if (c[3]) set(dst, x + xx, y + yy, c);
  }
}
// map every pixel through fn([r,g,b,a], x, y) -> [r,g,b,a] | null(transparent)
function mapPx(src, fn) {
  const o = mk(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const c = fn(get(src, x, y), x, y); if (c) set(o, x, y, c); }
  return o;
}
const shade = (c, k) => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k), c[3] ?? 255];
const grey = (v, a = 255) => [v, v, v, a];
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 >>> 0; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// vanilla GUI palette
const C_PANEL = hex('#C6C6C6'), C_WHITE = hex('#FFFFFF'), C_SHADOW = hex('#555555'), C_BLACK = hex('#000000');
const C_SLOT_DARK = hex('#373737'), C_SLOT_FILL = hex('#8B8B8B');

// ---------------------------------------------------------------------------------------------
// HUD icons (9x9)
// ---------------------------------------------------------------------------------------------
const HEART_CONTAINER = [
  '.KK...KK.',
  'KDDK.KDDK',
  'KDDDKDDDK',
  'KDDDDDDDK',
  'KDDDDDDDK',
  '.KDDDDDK.',
  '..KDDDK..',
  '...KDK...',
  '....K....',
];
const HEART_FILL = [
  '.........',
  '.RR...RR.',
  '.RWR.RRR.',
  '.RRRRRRR.',
  '.RRRRRRd.',
  '..RRRRd..',
  '...RRd...',
  '....d....',
  '.........',
];
const half = (rows, keepLeft, split = 4) => rows.map(r => r.split('').map((ch, x) => (keepLeft ? x <= split : x >= split) ? ch : '.').join(''));

function heartSet(T, prefix, pal) {
  T[prefix + 'full'] = fromArt(HEART_FILL, pal);
  T[prefix + 'half'] = fromArt(half(HEART_FILL, true), pal);
}

function paintHearts(T) {
  const dark = '#3B3B3B';
  T.heart_container = fromArt(HEART_CONTAINER, { K: '#000000', D: dark });
  T.heart_container_blinking = fromArt(HEART_CONTAINER, { K: '#FFFFFF', D: dark });
  T.heart_container_hardcore = T.heart_container;
  T.heart_container_hardcore_blinking = T.heart_container_blinking;
  heartSet(T, 'heart_', { R: '#E8141C', W: '#FFFFFF', d: '#B30A0F' });
  heartSet(T, 'heart_blinking_', { R: '#FF7A7A', W: '#FFFFFF', d: '#E8505A' });
  T.heart_full_blinking = T.heart_blinking_full; T.heart_half_blinking = T.heart_blinking_half;
  delete T.heart_blinking_full; delete T.heart_blinking_half;
  // hardcore: same heart with a darker rim and two "eye" pixels
  const HC = HEART_FILL.map((r, y) => y === 3 ? '.RRbRbRR.' : r);
  T.heart_hardcore_full = fromArt(HC, { R: '#E8141C', W: '#FFFFFF', d: '#8E0A0A', b: '#5A0000' });
  T.heart_hardcore_half = fromArt(half(HC, true), { R: '#E8141C', W: '#FFFFFF', d: '#8E0A0A', b: '#5A0000' });
  T.heart_hardcore_full_blinking = fromArt(HC, { R: '#FF7A7A', W: '#FFFFFF', d: '#C04040', b: '#902020' });
  T.heart_hardcore_half_blinking = fromArt(half(HC, true), { R: '#FF7A7A', W: '#FFFFFF', d: '#C04040', b: '#902020' });
  // status variants (cheap palette swaps)
  const variants = {
    poisoned: { R: '#94841E', W: '#E6DC8C', d: '#5E5410' },
    withered: { R: '#2E2E2E', W: '#8C8C8C', d: '#141414' },
    absorbing: { R: '#E8C21C', W: '#FFFFCC', d: '#B38A0A' },
    frozen: { R: '#7FB8E8', W: '#FFFFFF', d: '#4C7FB3' },
  };
  for (const [k, pal] of Object.entries(variants)) {
    heartSet(T, `heart_${k}_`, pal);
    heartSet(T, `heart_${k}_blinking_`, { R: shadeHex(pal.R, 1.35), W: '#FFFFFF', d: shadeHex(pal.d, 1.35) });
    // rename *_blinking_full -> *_full_blinking for consistency with vanilla sprite names
    T[`heart_${k}_full_blinking`] = T[`heart_${k}_blinking_full`]; T[`heart_${k}_half_blinking`] = T[`heart_${k}_blinking_half`];
    delete T[`heart_${k}_blinking_full`]; delete T[`heart_${k}_blinking_half`];
  }
}
function shadeHex(h, k) { const c = shade(hex(h), k); return [c[0] | 0, c[1] | 0, c[2] | 0, 255]; }

const FOOD = [
  '....KKK..',
  '...KLLMK.',
  '..KLMMMMK',
  '..KMMMMMK',
  '..KMMMMdK',
  '.KBKMddK.',
  'KBBbKKK..',
  'KBbK.....',
  '.KK......',
];
function paintFood(T) {
  const pal = { K: '#2B1607', L: '#E2A06A', M: '#B5662E', d: '#7A3E14', B: '#F4F0E6', b: '#C9C2B0' };
  const hun = { K: '#0F2A07', L: '#A8C86A', M: '#6E8F2E', d: '#44601A', B: '#DDE8C4', b: '#A8B890' };
  const empty = FOOD.map(r => r.replace(/[LMdBb]/g, 'D'));
  T.food_empty = fromArt(empty, { K: '#000000', D: '#3B3B3B' });
  T.food_empty_hunger = fromArt(empty, { K: '#0E2A04', D: '#2C3A22' });
  T.food_full = fromArt(FOOD, pal);
  T.food_half = fromArt(half(FOOD, false, 4).map(r => r.replace(/K/g, '.')), pal);
  T.food_full_hunger = fromArt(FOOD, hun);
  T.food_half_hunger = fromArt(half(FOOD, false, 4).map(r => r.replace(/K/g, '.')), hun);
  // keep the outline of full sprites transparent like vanilla (the container provides it)
  for (const k of ['food_full', 'food_full_hunger']) T[k] = fromArt(FOOD.map(r => r.replace(/K/g, '.')), k.endsWith('hunger') ? hun : pal);
}

const ARMOR = [
  '.KKK.KKK.',
  'KWLLKLLGK',
  'KLLLLLLGK',
  'KKLLLLGKK',
  '.KLLLLGK.',
  '.KLLLLGK.',
  '.KLGGGGK.',
  '.KKKKKKK.',
  '.........',
];
function paintArmor(T) {
  const pal = { K: '#262626', W: '#FFFFFF', L: '#D8D8D8', G: '#9A9A9A' };
  T.armor_empty = fromArt(ARMOR.map(r => r.replace(/[WLG]/g, 'D')), { K: '#000000', D: '#3B3B3B' });
  T.armor_full = fromArt(ARMOR, pal);
  T.armor_half = fromArt(ARMOR.map((r, y) => r.split('').map((ch, x) => x <= 4 ? ch : (ch === '.' ? '.' : (/[WLG]/.test(ch) ? 'D' : 'k'))).join('')),
    { ...pal, D: '#3B3B3B', k: '#000000' });
}

const BUBBLE = [
  '..KKKKK..',
  '.KLLLLLK.',
  'KLWW..LLK',
  'KLW....LK',
  'KL.....LK',
  'KL.....LK',
  'KLL...LLK',
  '.KLLLLLK.',
  '..KKKKK..',
];
const BUBBLE_POP = [
  '..K...K..',
  '.K.....K.',
  'K.W.....K',
  '.........',
  'K.......K',
  '.........',
  'K.......K',
  '.K.....K.',
  '..K...K..',
];
function paintAir(T) {
  const pal = { K: '#14389C', L: '#3E7CDE', W: '#FFFFFF', '.': null };
  T.air = fromArt(BUBBLE, pal);
  // translucent pale interior
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (BUBBLE[y][x] === '.' && insideRows(BUBBLE, x, y)) set(T.air, x, y, [160, 200, 255, 110]);
  T.air_bursting = fromArt(BUBBLE_POP, { K: '#3E7CDE', W: '#FFFFFF' });
}
function insideRows(rows, x, y) { const r = rows[y]; return r.slice(0, x).includes('K') && r.slice(x + 1).includes('K'); }

// ---------------------------------------------------------------------------------------------
// hotbar, crosshair, xp bar
// ---------------------------------------------------------------------------------------------
const HB_OUTER = [0, 0, 0, 220], HB_RING = [137, 137, 137, 255], HB_FILL = [0, 0, 0, 105], HB_RING_DK = [96, 96, 96, 255];
function hotbarSlot(im, x0, y0) { // 20x20 cell: light ring + translucent interior
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    const ring = x === 0 || y === 0 || x === 19 || y === 19;
    const c = ring ? ((x === 19 || y === 19) ? HB_RING_DK : HB_RING) : HB_FILL;
    set(im, x0 + x, y0 + y, c);
  }
}
function paintHotbar(T) {
  const im = mk(182, 22);
  for (let x = 0; x < 182; x++) { set(im, x, 0, HB_OUTER); set(im, x, 21, HB_OUTER); }
  for (let y = 0; y < 22; y++) { set(im, 0, y, HB_OUTER); set(im, 181, y, HB_OUTER); }
  for (let i = 0; i < 9; i++) hotbarSlot(im, 1 + i * 20, 1);
  T.hotbar = im;

  // selection: 24x23, outer dark ring, 2px light frame, transparent 18x17 hole (x 3..20, y 3..19)
  const s = mk(24, 23);
  for (let y = 0; y < 23; y++) for (let x = 0; x < 24; x++) {
    const d = Math.min(x, y, 23 - x, 22 - y);
    if (d === 0) set(s, x, y, [0, 0, 0, 255]);
    else if (d <= 2) set(s, x, y, d === 1 ? [255, 255, 255, 255] : [200, 200, 200, 255]);
  }
  // cut the outer corners like vanilla
  for (const [x, y] of [[0, 0], [23, 0], [0, 22], [23, 22]]) set(s, x, y, [0, 0, 0, 0]);
  T.hotbar_selection = s;

  // offhand slots 29x24 (a single 22x22 framed slot)
  const off = (fx) => {
    const o = mk(29, 24);
    for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) if (x === 0 || y === 0 || x === 21 || y === 21) set(o, fx + x, 1 + y, HB_OUTER);
    hotbarSlot(o, fx + 1, 2);
    return o;
  };
  T.hotbar_offhand_left = off(0);
  T.hotbar_offhand_right = off(7);

  // crosshair 15x15, 1px plus (engine draws with inverted blending)
  const c = mk(15, 15);
  for (let i = 0; i < 15; i++) { set(c, 7, i, C_WHITE); set(c, i, 7, C_WHITE); }
  T.crosshair = c;

  // experience bar 182x5
  const bg = mk(182, 5), fg = mk(182, 5);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 182; x++) {
    const edge = x === 0 || y === 0 || x === 181 || y === 4;
    const notch = !edge && x % 10 === 0 && x < 180;
    if (edge) { set(bg, x, y, C_BLACK); set(fg, x, y, C_BLACK); continue; }
    set(bg, x, y, notch ? grey(26) : (y === 1 ? grey(58) : grey(42)));
    const g = y === 1 ? [190, 255, 120] : y === 2 ? [128, 255, 32] : [80, 186, 18];
    set(fg, x, y, notch ? [56, 120, 10, 255] : [...g, 255]);
  }
  T.experience_bar_background = bg;
  T.experience_bar_progress = fg;
}

// ---------------------------------------------------------------------------------------------
// buttons, sliders, text field
// ---------------------------------------------------------------------------------------------
function stoneNoise(seed) {
  const r = rng(seed);
  const cells = new Float32Array(64 * 16);
  for (let i = 0; i < cells.length; i++) cells[i] = r();
  return (x, y) => {
    const a = cells[((y >> 1) % 16) * 64 + ((x >> 1) % 64)], b = cells[(y % 16) * 64 + ((x * 7 + 3) % 64)];
    return (a - 0.5) * 10 + (b - 0.5) * 6;
  };
}
function button(w, h, kind) {
  const im = mk(w, h);
  const n = stoneNoise(kind === 'hover' ? 7 : 3);
  const base = kind === 'hover' ? 126 : kind === 'disabled' ? 44 : 111;
  const outline = kind === 'hover' ? C_WHITE : C_BLACK;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { set(im, x, y, outline); continue; }
    if (kind === 'disabled') { set(im, x, y, grey(base)); continue; }
    let v = base + n(x, y);
    if (y === 1 || x === 1) v = base + 52;              // top/left highlight
    if (y >= h - 3 || x === w - 2) v = base - 36;       // bottom (2px) / right shadow
    if ((y === 1 && x === w - 2) || (x === 1 && y >= h - 3)) v = base;
    set(im, x, y, grey(Math.round(v)));
  }
  return im;
}
function paintWidgets(T) {
  T.button = button(200, 20, 'normal');
  T.button_highlighted = button(200, 20, 'hover');
  T.button_disabled = button(200, 20, 'disabled');
  T.slider = button(200, 20, 'disabled');
  T.slider_highlighted = mapPx(T.slider, (c, x, y) => (x === 0 || y === 0 || x === 199 || y === 19) ? C_WHITE : c);
  T.slider_handle = button(8, 20, 'normal');
  T.slider_handle_highlighted = button(8, 20, 'hover');
  const tf = (border) => { const im = mk(200, 20); rect(im, 0, 0, 200, 20, border); rect(im, 1, 1, 198, 18, C_BLACK); return im; };
  T.text_field = tf(hex('#A0A0A0'));
  T.text_field_highlighted = tf(C_WHITE);
  // small checkbox (20x20) in button style
  T.checkbox = button(20, 20, 'normal');
  T.checkbox_highlighted = button(20, 20, 'hover');
  const tick = ['.........#', '........##', '.......##.', '#.....##..', '##...##...', '.##.##....', '..###.....', '...#......'];
  T.checkbox_selected = art(copy(T.checkbox), tick, { '#': '#FFFFFF' }, 5, 6);
  T.checkbox_selected_highlighted = art(copy(T.checkbox_highlighted), tick, { '#': '#FFFFFF' }, 5, 6);
}

// ---------------------------------------------------------------------------------------------
// container backgrounds
// ---------------------------------------------------------------------------------------------
// vanilla panel: #C6C6C6 fill, 2px white top/left highlight, 2px #555555 bottom/right shadow,
// 1px black outline with rounded (cut) corners.
function panel(im, x0, y0, w, h) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = x, Y = y, R = w - 1 - x, B = h - 1 - y;
    let c;
    if (X + Y < 2 || R + B < 2 || R + Y < 3 || X + B < 3) continue;           // cut corners (transparent)
    if (X === 0 || Y === 0 || R === 0 || B === 0 || X + Y === 2 || R + B === 2 || R + Y === 3 || X + B === 3) c = C_BLACK;
    else {
      const hi = X <= 2 || Y <= 2, sh = R <= 2 || B <= 2;
      c = hi && sh ? C_PANEL : hi ? C_WHITE : sh ? C_SHADOW : C_PANEL;
    }
    set(im, x0 + x, y0 + y, c);
  }
}
// recessed frame (dark top/left, white bottom/right, corner pixels = fill) around an inner area
function recess(im, x, y, w, h, fill = C_SLOT_FILL) {
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    let c = fill;
    const top = yy === 0, left = xx === 0, bot = yy === h - 1, right = xx === w - 1;
    if ((top && right) || (bot && left)) c = C_SLOT_FILL;
    else if (top || left) c = C_SLOT_DARK;
    else if (bot || right) c = C_WHITE;
    set(im, x + xx, y + yy, c);
  }
}
// standard 18x18 slot; (x,y) = top-left of the 16x16 item area
const slot = (im, x, y) => recess(im, x - 1, y - 1, 18, 18);
// large 26x26 result slot centered on the item
const bigSlot = (im, x, y) => recess(im, x - 5, y - 5, 26, 26);
function playerInv(im, x0, y0, hotY) {
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) slot(im, x0 + c * 18, y0 + r * 18);
  for (let c = 0; c < 9; c++) slot(im, x0 + c * 18, hotY);
}
// right-pointing arrow of size w x h (head is a triangle of h rows)
function arrowMask(w, h, shaft) {
  const headW = Math.ceil(h / 2), sx = w - headW, s0 = Math.floor((h - shaft) / 2);
  const m = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      let on = false;
      if (x < sx) on = y >= s0 && y < s0 + shaft;
      else { const k = x - sx; on = y >= k && y <= h - 1 - k; }
      row += on ? '#' : '.';
    }
    m.push(row);
  }
  return m;
}
const ARROW_22 = arrowMask(22, 15, 6);
const ARROW_16 = arrowMask(16, 13, 4);

// flame (14x14) for furnaces
// 14x14 cell with a 1px transparent margin at top/left (vanilla draws lit_progress at (56,36); flame shows from (57,37))
const FLAME = [
  '..............',
  '.......#......',
  '.......##.....',
  '......###...#.',
  '......####..#.',
  '.....#####.##.',
  '.....########.',
  '....#########.',
  '...##########.',
  '..############',
  '..############',
  '..############',
  '...##########.',
  '....########..',
];
function flameLit() {
  const im = mk(14, 14);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
    if (FLAME[y][x] !== '#') continue;
    // distance from the flame edge -> hotter core
    let d = 9;
    for (let r = 1; r < 5; r++) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      const yy = y + dy, xx = x + dx;
      if (yy < 0 || yy > 13 || xx < 0 || xx > 13 || FLAME[yy][xx] !== '#') d = Math.min(d, r);
    }
    const col = d <= 1 ? '#C8320A' : d === 2 ? '#F07818' : d === 3 ? '#FFC21E' : '#FFF0A0';
    set(im, x, y, hex(col));
  }
  return im;
}

function containerBase() { return mk(256, 256); }

function paintContainers(T) {
  // --- player inventory (176x166)
  {
    const im = containerBase();
    panel(im, 0, 0, 176, 166);
    for (let i = 0; i < 4; i++) slot(im, 8, 8 + i * 18);           // armor
    slot(im, 77, 62);                                              // offhand
    recess(im, 25, 7, 51, 72, C_BLACK);                            // player preview: black area 26..74 x 8..77
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) slot(im, 98 + c * 18, 18 + r * 18);
    slot(im, 154, 28);                                             // crafting result
    art(im, ARROW_16, { '#': C_SLOT_FILL }, 135, 29);
    playerInv(im, 8, 84, 142);
    T.inventory = im;
  }
  // --- crafting table (176x166)
  {
    const im = containerBase();
    panel(im, 0, 0, 176, 166);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) slot(im, 30 + c * 18, 17 + r * 18);
    bigSlot(im, 124, 35);
    art(im, ARROW_22, { '#': C_SLOT_FILL }, 90, 35);
    playerInv(im, 8, 84, 142);
    T.crafting_table = im;
  }
  // --- furnace (176x166)
  {
    const im = containerBase();
    panel(im, 0, 0, 176, 166);
    slot(im, 56, 17); slot(im, 56, 53);
    bigSlot(im, 116, 35);
    art(im, FLAME, { '#': C_SLOT_FILL }, 56, 36);                  // visible flame starts at (57,37)
    art(im, ARROW_22, { '#': C_SLOT_FILL }, 80, 35);               // 22x15 arrow centered in the 24x17 cell at (79,34)
    playerInv(im, 8, 84, 142);
    T.furnace = im;
    T.furnace_lit_progress = flameLit();
    const prog = mk(24, 17); art(prog, ARROW_22, { '#': C_WHITE }, 1, 1);
    T.furnace_burn_progress = prog;
  }
  // --- chests: generic_27 (176x168) and generic_54 (176x222)
  for (const rows of [3, 6]) {
    const im = containerBase();
    const h = 114 + rows * 18;
    panel(im, 0, 0, 176, h);
    for (let r = 0; r < rows; r++) for (let c = 0; c < 9; c++) slot(im, 8 + c * 18, 18 + r * 18);
    playerInv(im, 8, rows * 18 + 31, rows * 18 + 89);
    T['generic_' + rows * 9] = im;
  }
  // --- creative inventory (195x136, like creative_inventory/tab_items.png)
  {
    const im = containerBase();
    panel(im, 0, 0, 195, 136);
    for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) slot(im, 9 + c * 18, 18 + r * 18);
    for (let c = 0; c < 9; c++) slot(im, 9 + c * 18, 112);
    recess(im, 174, 17, 14, 112);                                   // scroll track: inner area x=175..186, y=18..127
    T.creative_inventory = im;
  }
  // --- creative "Survival Inventory" tab
  {
    const im = containerBase();
    panel(im, 0, 0, 195, 136);
    for (let j = 0; j < 4; j++) slot(im, 54 + (j >> 1) * 54, 6 + (j & 1) * 27);
    slot(im, 35, 20);
    recess(im, 72, 5, 34, 45, C_BLACK);                             // player preview 73..104 x 6..48
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) slot(im, 9 + c * 18, 54 + r * 18);
    for (let c = 0; c < 9; c++) slot(im, 9 + c * 18, 112);
    slot(im, 173, 112);                                             // destroy item slot
    T.creative_inventory_survival = im;
  }
  // scrollers 12x15
  const scroller = (fill, hi, sh) => {
    const im = mk(12, 15);
    for (let y = 0; y < 15; y++) for (let x = 0; x < 12; x++) {
      const R = 11 - x, B = 14 - y;
      let c = fill;
      if (x === 0 || y === 0) c = hi;
      if (R === 0 || B === 0) c = sh;
      if ((x === 0 && B === 0) || (R === 0 && y === 0)) c = fill;
      set(im, x, y, c);
    }
    return im;
  };
  T.creative_scroller = scroller(C_PANEL, C_WHITE, C_SHADOW);
  T.creative_scroller_disabled = scroller(hex('#A8A8A8'), hex('#C6C6C6'), hex('#6E6E6E'));
  // creative tabs 26x32: rounded top, open bottom (overlaps the panel by 4px)
  const tab = (selected, first) => {
    const im = mk(26, 32);
    const fill = selected ? C_PANEL : hex('#A9A9A9'), hi = selected ? C_WHITE : hex('#D2D2D2'), sh = selected ? C_SHADOW : hex('#6E6E6E');
    const bottom = selected ? 32 : 30;
    for (let y = 0; y < bottom; y++) for (let x = 0; x < 26; x++) {
      const X = x, R = 25 - x, Y = y;
      if (X + Y < 2 || R + Y < 2) continue;
      let c;
      if (X === 0 || R === 0 || Y === 0 || X + Y === 2 || R + Y === 2) c = C_BLACK;
      else if (!selected && y === bottom - 1) c = C_BLACK;
      else if (X <= 2 || Y <= 2) c = (R <= 2) ? fill : hi;
      else if (R <= 2) c = sh;
      else c = fill;
      if (selected && y >= 28) { // merge into the panel below
        c = X === 0 ? (first ? C_BLACK : (y < 31 ? C_WHITE : C_PANEL)) : X <= 2 ? C_WHITE : C_PANEL;
        if (R === 0 && !first) c = C_PANEL;
        if (R === 0 && first) c = C_PANEL;
      }
      set(im, x, y, c);
    }
    return im;
  };
  T.creative_tab_top_selected = tab(true, false);
  T.creative_tab_top_selected_1 = tab(true, true);
  T.creative_tab_top_unselected = tab(false, false);
}

// ---------------------------------------------------------------------------------------------
// title logo ("MINECRAFT", 274x44) + edition banner
// ---------------------------------------------------------------------------------------------
const R_ = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const LOGO_LETTERS = {
  M: { w: 36, p: [R_(0, 0, 8, 36), R_(28, 0, 36, 36), [[0, 0], [9, 0], [18, 11], [27, 0], [36, 0], [36, 5], [18, 26], [0, 5]]] },
  I: { w: 10, p: [R_(0, 0, 10, 36)] },
  N: { w: 30, p: [R_(0, 0, 8, 36), R_(22, 0, 30, 36), [[0, 0], [9, 0], [30, 27], [30, 36], [21, 36], [0, 9]]] },
  E: { w: 26, p: [R_(0, 0, 8, 36), R_(0, 0, 26, 8), R_(0, 14, 22, 22), R_(0, 28, 26, 36)] },
  C: { w: 28, p: [[[5, 0], [28, 0], [28, 8], [8, 8], [8, 28], [28, 28], [28, 36], [5, 36], [0, 31], [0, 5]]] },
  R: { w: 30, p: [R_(0, 0, 8, 36), R_(0, 0, 25, 8), [[21, 0], [25, 0], [30, 5], [30, 17], [25, 22], [21, 22]], R_(0, 14, 25, 22), R_(22, 20, 30, 36)] },
  A: { w: 30, p: [[[5, 0], [25, 0], [30, 5], [30, 8], [0, 8], [0, 5]], R_(0, 5, 8, 36), R_(22, 5, 30, 36), R_(0, 16, 30, 24)] },
  F: { w: 26, p: [R_(0, 0, 8, 36), R_(0, 0, 26, 8), R_(0, 14, 22, 22)] },
  T: { w: 28, p: [R_(0, 0, 28, 8), R_(10, 0, 18, 36)] },
};
function inPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function paintTitle(T) {
  const W = 274, H = 44, word = 'MINECRAFT', gap = 3, top = 1, DEPTH = 6;
  const face = new Uint8Array(W * H), depth = new Uint8Array(W * H), letterId = new Int8Array(W * H).fill(-1);
  let ox = 1;
  [...word].forEach((ch, li) => {
    const L = LOGO_LETTERS[ch];
    for (let y = 0; y < 36; y++) for (let x = 0; x < L.w; x++) {
      if (L.p.some(p => inPoly(x + 0.5, y + 0.5, p))) { face[(top + y) * W + ox + x] = 1; letterId[(top + y) * W + ox + x] = li; }
    }
    ox += L.w + gap;
  });
  // extrusion toward bottom-right
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!face[y * W + x]) continue;
    for (let d = 1; d <= DEPTH; d++) {
      const xx = x + (d >> 1), yy = y + d;
      if (xx >= W || yy >= H) break;
      const i = yy * W + xx;
      if (!face[i] && (!depth[i] || depth[i] > d)) depth[i] = d;
    }
  }
  const im = mk(W, H);
  const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (face[y * W + x] || depth[y * W + x]);
  const isFace = (x, y) => x >= 0 && y >= 0 && x < W && y < H && face[y * W + x];
  // cobblestone-ish voronoi texture for the letter faces
  const r = rng(1234), seeds = [];
  const CS = 5; // stone cell size
  for (let sy = -4; sy < H + 4; sy += CS) for (let sx = -4; sx < W + 4; sx += CS) seeds.push([sx + r() * CS, sy + r() * CS, r()]);
  const cellAt = (x, y) => {
    let b1 = 1e9, b2 = 1e9, v = 0;
    const gx = Math.floor((x + 4) / CS), gy = Math.floor((y + 4) / CS), cols = Math.ceil((W + 8) / CS);
    for (let j = gy - 2; j <= gy + 2; j++) for (let i = gx - 2; i <= gx + 2; i++) {
      const s = seeds[j * cols + i]; if (!s) continue;
      const d = Math.hypot(s[0] - x, s[1] - y);
      if (d < b1) { b2 = b1; b1 = d; v = s[2]; } else if (d < b2) b2 = d;
    }
    return { v, edge: b2 - b1 };
  };
  const nz = rng(99);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (face[i]) {
      const { v, edge } = cellAt(x, y);
      let l = 126 + v * 46 + (nz() - 0.5) * 12;
      if (edge < 0.9) l = 90 + (nz() - 0.5) * 10;                // mortar between stones
      l += (1 - (y - top) / 36) * 20 - 6;                         // slightly lighter toward the top
      if (!isFace(x, y - 1)) l = 214;                             // top highlight
      else if (!isFace(x - 1, y)) l = Math.max(l, 178);           // left highlight
      else if (!isFace(x, y + 1) || !isFace(x + 1, y)) l *= 0.8;   // inner shading at bottom/right edges
      set(im, x, y, grey(Math.max(0, Math.min(255, Math.round(l)))));
    } else if (depth[i]) {
      const d = depth[i];
      // faces pointing down are darker than faces pointing right
      const downFacing = isFace(x - ((d) >> 1), y - d) && !isFace(x - ((d - 1) >> 1) + 1, y - d + 1);
      let l = 80 - d * 7 + (nz() - 0.5) * 6;
      if (downFacing) l -= 10;
      set(im, x, y, grey(Math.max(18, Math.round(l))));
    }
  }
  // 1px black outline around everything
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (solid(x, y)) continue;
    if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1) || solid(x - 1, y - 1) || solid(x + 1, y + 1) || solid(x + 1, y - 1) || solid(x - 1, y + 1)) set(im, x, y, C_BLACK);
  }
  T.title_minecraft = im;

  // "JAVA EDITION" banner (98x14): font glyphs at 2x height, bold, light grey with dark drop shadow
  const ed = mk(98, 14), str = 'JAVA EDITION';
  let w = 0; for (const ch of str) w += ch === ' ' ? 4 : getGlyph(ch).w + 2;
  w -= 1;
  let x = Math.floor((98 - w) / 2);
  const plot = (px, py, c) => { set(ed, px, py, c); };
  for (const ch of str) {
    if (ch === ' ') { x += 4; continue; }
    const g = getGlyph(ch);
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < g.w; gx++) {
      if (g.rows[gy][gx] !== '#') continue;
      for (let b = 0; b < 2; b++) for (let sy = 0; sy < 2; sy++) {
        const px = x + gx + b, py = gy * 2 + sy;
        if (get(ed, px + 1, py + 1)[3] === 0 && py + 1 < 14) plot(px + 1, py + 1, [56, 56, 56, 255]);
      }
    }
    for (let gy = 0; gy < 7; gy++) for (let gx = 0; gx < g.w; gx++) {
      if (g.rows[gy][gx] !== '#') continue;
      for (let b = 0; b < 2; b++) for (let sy = 0; sy < 2; sy++) {
        const py = gy * 2 + sy;
        plot(x + gx + b, py, grey(Math.round(255 - py * 4)));
      }
    }
    x += g.w + 2;
  }
  T.title_edition = ed;
}

// ---------------------------------------------------------------------------------------------
// menu backgrounds (vanilla dirt, darkened by 0x40 like Screen.renderDirtBackground)
// ---------------------------------------------------------------------------------------------
function dirtTile(seed) {
  const r = rng(seed), im = mk(16, 16);
  const pal = ['#593D29', '#6C4A32', '#79553A', '#866043', '#966C4A', '#B9855C'].map(c => hex(c));
  const weights = [0.12, 0.16, 0.26, 0.28, 0.12, 0.06];
  const pick = () => { let t = r(); for (let i = 0; i < weights.length; i++) { if ((t -= weights[i]) < 0) return i; } return 3; };
  const idx = new Uint8Array(256);
  for (let i = 0; i < 256; i++) idx[i] = pick();
  // small clusters: occasionally copy a neighbour to form 2-3px blobs (wrapping)
  for (let k = 0; k < 120; k++) {
    const x = (r() * 16) | 0, y = (r() * 16) | 0, d = (r() * 4) | 0;
    const [dx, dy] = [[1, 0], [0, 1], [-1, 0], [0, -1]][d];
    idx[((y + dy) & 15) * 16 + ((x + dx) & 15)] = idx[y * 16 + x];
  }
  for (let i = 0; i < 256; i++) set(im, i & 15, i >> 4, pal[idx[i]]);
  return im;
}
function paintBackgrounds(T) {
  const dirt = dirtTile(4242);
  T.dirt = dirt;
  T.options_background = mapPx(dirt, c => shade(c, 64 / 255).map((v, i) => i < 3 ? Math.round(v) : 255));
  T.menu_background_dark = mapPx(dirt, c => shade(c, 32 / 255).map((v, i) => i < 3 ? Math.round(v) : 255));
}

// ---------------------------------------------------------------------------------------------
// misc extras
// ---------------------------------------------------------------------------------------------
function paintMisc(T) {
  const hl = mk(16, 16); rect(hl, 0, 0, 16, 16, [255, 255, 255, 128]); T.slot_highlight = hl;

  // toast frame 160x32: dark fill, light inner border, black cut-corner outline
  const toast = mk(160, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 160; x++) {
    const X = x, Y = y, R = 159 - x, B = 31 - y;
    if (X + Y < 2 || R + Y < 2 || X + B < 2 || R + B < 2) continue;
    let c = hex('#212121');
    if (X === 0 || Y === 0 || R === 0 || B === 0 || X + Y === 2 || R + Y === 2 || X + B === 2 || R + B === 2) c = C_BLACK;
    else if (X === 1 || Y === 1 || R === 1 || B === 1 || X + Y === 3 || R + Y === 3 || X + B === 3 || R + B === 3) c = hex('#555555');
    set(toast, x, y, c);
  }
  T.toast = toast;

  // recipe book button (20x18): green book with white pages
  const BOOK = [
    '....................',
    '..KKKKKKKKKKKKKKK...',
    '..KGGGGGGGGGGGGGGK..',
    '..KGLLLLLLLLLLLLGK..',
    '..KGLGGGGGGGGGGLGK..',
    '..KGLGYYYYYYYYGLGK..',
    '..KGLGGGGGGGGGGLGK..',
    '..KGLLLLLLLLLLLLGK..',
    '..KGGGGGGGGGGGGGGK..',
    '..KGGGGGGGGGGGGGGK..',
    '..KGGGGGGGGGGGGGGK..',
    '..KGGGGGGGGGGGGGGK..',
    '..KdddddddddddddGK..',
    '..KdWWWWWWWWWWWWWK..',
    '..KdWwwwwwwwwwwwwK..',
    '...KKKKKKKKKKKKKKK..',
    '....................',
    '....................',
  ];
  T.recipe_book_button = fromArt(BOOK, { K: '#1E1E1E', G: '#3E8A3A', L: '#6FC46A', Y: '#E8D44A', d: '#24561F', W: '#FFFFFF', w: '#C8C8C8' });
  T.recipe_book_button_highlighted = fromArt(BOOK, { K: '#FFFFFF', G: '#4EA84A', L: '#8FE48A', Y: '#FFF07A', d: '#2E6E28', W: '#FFFFFF', w: '#DCDCDC' });

  // empty equipment slot silhouettes (16x16), drawn in the slot when empty
  const sil = rows => fromArt(rows, { '#': [55, 55, 55, 150] });
  T.empty_armor_slot_helmet = sil([
    '................', '................', '................', '...##########...', '..############..', '..############..',
    '..####....####..', '..###......###..', '..###......###..', '..###......###..', '................', '................',
    '................', '................', '................', '................']);
  T.empty_armor_slot_chestplate = sil([
    '................', '..####....####..', '.######..######.', '.##############.', '.##############.', '.#.##########.#.',
    '...##########...', '...##########...', '...##########...', '...##########...', '...##########...', '...##########...',
    '...##########...', '...##########...', '................', '................']);
  T.empty_armor_slot_leggings = sil([
    '................', '................', '...##########...', '...##########...', '...##########...', '...####..####...',
    '...###....###...', '...###....###...', '...###....###...', '...###....###...', '...###....###...', '...###....###...',
    '...###....###...', '................', '................', '................']);
  T.empty_armor_slot_boots = sil([
    '................', '................', '................', '................', '................', '................',
    '...###....###...', '...###....###...', '...###....###...', '...###....###...', '..####....####..', '.#####....#####.',
    '.#####....#####.', '................', '................', '................']);
  T.empty_slot_shield = sil([
    '................', '................', '..############..', '..############..', '..############..', '..############..',
    '..############..', '..############..', '..############..', '...##########...', '...##########...', '....########....',
    '.....######.....', '......####......', '................', '................']);
}

// ---------------------------------------------------------------------------------------------
let CACHE = null;
export function paintGuiTextures() {
  if (CACHE) return CACHE;
  const T = {};
  paintHearts(T);
  paintFood(T);
  paintArmor(T);
  paintAir(T);
  paintHotbar(T);
  paintWidgets(T);
  paintContainers(T);
  paintTitle(T);
  paintBackgrounds(T);
  paintMisc(T);
  CACHE = T;
  return T;
}
