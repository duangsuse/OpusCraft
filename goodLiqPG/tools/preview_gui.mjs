// Preview the recreated Minecraft font + GUI sprites as PNG contact sheets in /tmp.
// Usage: node tools/preview_gui.mjs   -> /tmp/gui_font.png, /tmp/gui_icons.png, /tmp/gui_widgets.png,
//        /tmp/gui_containers.png, /tmp/gui_title.png, /tmp/gui_hud.png, /tmp/gui_menu.png
import { writePNG, sheet } from './png.mjs';
import { textToImageData, measureText, drawText, drawTextCentered, LINE_HEIGHT } from '../src/ui/font.js';

let paintGuiTextures = null;
try { ({ paintGuiTextures } = await import('../src/textures/guitex.js')); } catch (e) { console.warn('guitex not loaded:', e.message); }

// --- tiny RGBA surface helpers -------------------------------------------------------------
const surf = (w, h, bg = [0, 0, 0, 0]) => { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set(bg, i * 4); return { w, h, data: d }; };
function blit(dst, src, x, y, opts = {}) {
  const sx0 = opts.sx || 0, sy0 = opts.sy || 0, sw = opts.sw ?? src.w, sh = opts.sh ?? src.h;
  for (let yy = 0; yy < sh; yy++) for (let xx = 0; xx < sw; xx++) {
    const tx = x + xx, ty = y + yy; if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
    const si = ((sy0 + yy) * src.w + sx0 + xx) * 4, di = (ty * dst.w + tx) * 4;
    const a = src.data[si + 3] / 255 * (opts.alpha ?? 1); if (!a) continue;
    if (opts.invert) { for (let c = 0; c < 3; c++) dst.data[di + c] = (255 - dst.data[di + c]) * a + dst.data[di + c] * (1 - a); continue; }
    const tint = opts.tint || [1, 1, 1];
    for (let c = 0; c < 3; c++) dst.data[di + c] = src.data[si + c] * tint[c] * a + dst.data[di + c] * (1 - a);
    dst.data[di + 3] = Math.max(dst.data[di + 3], a * 255);
  }
}
// a fake CanvasRenderingContext2D (fillStyle + fillRect) to exercise drawText()
function fakeCtx(img) {
  return {
    fillStyle: '#000', fillRect(x, y, w, h) {
      const v = parseInt(this.fillStyle.slice(1), 16), c = [v >> 16 & 255, v >> 8 & 255, v & 255, 255];
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (xx >= 0 && yy >= 0 && xx < img.w && yy < img.h) img.data.set(c, (yy * img.w + xx) * 4);
    },
  };
}
const text = (dst, s, x, y, color = '#ffffff', shadow = true) => blit(dst, textToImageData(s, { color, shadow }), x, y);
const textC = (dst, s, cx, y, color, shadow) => text(dst, s, Math.round(cx - measureText(s) / 2), y, color, shadow);

// --- font sheet ------------------------------------------------------------------------------
{
  let ascii = '';
  for (let c = 32; c < 127; c++) ascii += String.fromCharCode(c);
  const lines = [
    ascii.slice(0, 32), ascii.slice(32, 64), ascii.slice(64),
    'Minecraft 1.20.1', 'Singleplayer', 'Multiplayer', 'Options...', 'Quit Game', 'Minecraft Realms',
    'the quick brown fox jumps over the lazy dog', 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
    '0123456789 !?.,:;\'"()[]{}<>@#$%^&*-+=_/\\|~`',
    '§cRed §aGreen §9Blue §eYellow §6Gold §lBold§r reset §7grey',
    'XYZ: 12.500 / 64.00000 / -3.250', 'Block: 12 64 -4  Chunk: 12 0 -4 in 0 4 -1',
    'Missing: éü☃ <- boxes', '§nUnderline§r §mStrike§r §oItalic',
  ];
  const W = 300, H = lines.length * 11 + 40;
  const img = surf(W, H, [56, 56, 64, 255]);
  lines.forEach((s, i) => text(img, s, 4, 4 + i * 11));
  // button with centered label, drawn with the canvas-style API through a fake ctx
  const yb = 6 + lines.length * 11;
  if (paintGuiTextures) {
    const T = paintGuiTextures();
    blit(img, T.button, 4, yb); blit(img, T.button_highlighted, 4 + 204, yb, { sw: 90 });
  }
  const ctx = fakeCtx(img);
  drawTextCentered(ctx, 'Singleplayer', 4 + 100, yb + 6, { color: '#e0e0e0' });
  drawText(ctx, 'Hover', 4 + 214, yb + 6, { color: '#ffffa0' });
  writePNG('/tmp/gui_font.png', img.w, img.h, img.data, 4);
  console.log('wrote /tmp/gui_font.png', img.w * 4, 'x', img.h * 4, ' width("Singleplayer")=', measureText('Singleplayer'));
}

if (!paintGuiTextures) process.exit(0);
const T = paintGuiTextures();

// --- small icons sheet (8x)
{
  const names = Object.keys(T).filter(k => T[k].w <= 16 && T[k].h <= 16);
  const sh = sheet(names.map(n => T[n]), 12, 8, 6, [90, 110, 140, 255]);
  writePNG('/tmp/gui_icons.png', sh.w, sh.h, sh.data, 1);
  console.log('icons:', names.join(' '));
}
// --- widgets sheet (4x)
{
  const names = ['hotbar', 'hotbar_selection', 'hotbar_offhand_left', 'hotbar_offhand_right', 'experience_bar_background', 'experience_bar_progress',
    'button', 'button_highlighted', 'button_disabled', 'slider', 'slider_handle', 'slider_handle_highlighted', 'text_field', 'text_field_highlighted',
    'creative_scroller', 'creative_scroller_disabled', 'creative_tab_top_selected', 'creative_tab_top_unselected', 'toast', 'recipe_book_button',
    'furnace_lit_progress', 'furnace_burn_progress', 'checkbox', 'checkbox_selected', 'title_edition'];
  const sh = sheet(names.map(n => T[n]), 2, 4, 8, [90, 110, 140, 255]);
  writePNG('/tmp/gui_widgets.png', sh.w, sh.h, sh.data, 1);
}
// --- containers (3x)
{
  const names = ['inventory', 'crafting_table', 'furnace', 'generic_27', 'generic_54', 'creative_inventory', 'creative_inventory_survival'];
  for (const n of names) {
    const img = surf(256, 256, [30, 30, 36, 255]); blit(img, T[n], 0, 0);
    writePNG(`/tmp/gui_c_${n}.png`, 256, 256, img.data, 3);
  }
  const sh = sheet(names.map(n => T[n]), 4, 2, 8, [30, 30, 36, 255]);
  writePNG('/tmp/gui_containers.png', sh.w, sh.h, sh.data, 1);
}
// --- title screen mock (2x): tiled dark dirt, logo, edition, buttons with labels
{
  const W = 427, H = 240; // like a 854x480 window at gui scale 2
  const img = surf(W, H, [0, 0, 0, 255]);
  for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) blit(img, T.options_background, x, y);
  const lx = Math.floor(W / 2 - 137);
  blit(img, T.title_minecraft, lx, 30);
  blit(img, T.title_edition, lx + 88, 30 + 37);
  const btn = (s, x, y, w, kind = "button") => {
    x = Math.floor(x); y = Math.floor(y);
    const tex = T[kind];
    blit(img, tex, x, y, { sw: Math.floor(w / 2), sh: 20 });
    blit(img, tex, x + Math.floor(w / 2), y, { sx: 200 - Math.ceil(w / 2), sw: Math.ceil(w / 2), sh: 20 });
    const col = kind === 'button_disabled' ? '#a0a0a0' : '#ffffff';
    textC(img, s, x + w / 2, y + 6, col);
  };
  const by = H / 4 + 48;
  btn('Singleplayer', W / 2 - 100, by, 200);
  btn('Multiplayer', W / 2 - 100, by + 24, 200, 'button_highlighted');
  btn('Minecraft Realms', W / 2 - 100, by + 48, 200, 'button_disabled');
  btn('Options...', W / 2 - 100, by + 72 + 12, 98);
  btn('Quit Game', W / 2 + 2, by + 72 + 12, 98);
  text(img, 'Minecraft 1.20.1', 2, H - 10);
  const cr = 'Copyright Mojang AB. Do not distribute!';
  text(img, cr, W - measureText(cr) - 1, H - 10);
  writePNG('/tmp/gui_menu.png', W, H, img.data, 2);
}
// --- in-game HUD mock (3x)
{
  const W = 320, H = 120;
  const img = surf(W, H, [0, 0, 0, 255]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.data.set(y < 60 ? [120 + y, 166 + y / 2, 255, 255] : [90 + (x * 7 % 13), 140 + (x * y % 17), 60, 255], (y * W + x) * 4);
  const cx = W / 2 | 0;
  blit(img, T.crosshair, cx - 7, 30, { invert: true });
  const hb = H - 22;
  blit(img, T.hotbar, cx - 91, hb);
  blit(img, T.hotbar_selection, cx - 91 - 1 + 2 * 20, hb - 1);
  blit(img, T.hotbar_offhand_left, cx - 91 - 29, hb - 1);
  // xp bar
  blit(img, T.experience_bar_background, cx - 91, H - 29);
  blit(img, T.experience_bar_progress, cx - 91, H - 29, { sw: 120 });
  const lvl = '30'; const lw = measureText(lvl);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) text(img, lvl, cx - lw / 2 + dx | 0, H - 35 + dy, '#000000', false);
  text(img, lvl, cx - lw / 2 | 0, H - 35, '#80ff20', false);
  // hearts (17/20), food (15/20), armor (7/20), air (5/10)
  const hy = H - 39, left = cx - 91, right = cx + 91;
  for (let i = 0; i < 10; i++) {
    blit(img, T.heart_container, left + i * 8, hy);
    if (i * 2 + 1 < 17) blit(img, T.heart_full, left + i * 8, hy); else if (i * 2 + 1 === 17) blit(img, T.heart_half, left + i * 8, hy);
    blit(img, T.armor_empty, left + i * 8, hy - 10);
    if (i * 2 + 1 < 7) blit(img, T.armor_full, left + i * 8, hy - 10); else if (i * 2 + 1 === 7) blit(img, T.armor_half, left + i * 8, hy - 10);
    const fx = right - i * 8 - 9;
    blit(img, T.food_empty, fx, hy);
    if (i * 2 + 1 < 15) blit(img, T.food_full, fx, hy); else if (i * 2 + 1 === 15) blit(img, T.food_half, fx, hy);
    if (i < 6) blit(img, i === 5 ? T.air_bursting : T.air, right - i * 8 - 9, hy - 10);
  }
  // second row: blinking + hunger + hardcore variants
  for (let i = 0; i < 10; i++) {
    blit(img, T.heart_container_blinking, left + i * 8, 4);
    blit(img, i < 5 ? T.heart_full_blinking : T.heart_hardcore_full, left + i * 8, 4);
    blit(img, T.food_empty_hunger, right - i * 8 - 9, 4);
    if (i < 6) blit(img, i === 5 ? T.food_half_hunger : T.food_full_hunger, right - i * 8 - 9, 4);
    blit(img, T.heart_container, left + i * 8, 15);
    blit(img, [T.heart_poisoned_full, T.heart_withered_full, T.heart_absorbing_full, T.heart_frozen_full][i % 4], left + i * 8, 15);
  }
  writePNG('/tmp/gui_hud.png', W, H, img.data, 3);
}
console.log('wrote /tmp/gui_icons.png /tmp/gui_widgets.png /tmp/gui_containers.png /tmp/gui_c_*.png /tmp/gui_menu.png /tmp/gui_hud.png');
// --- creative inventory mock with tabs (3x)
{
  const W = 215, H = 200, img = surf(W, H, [40, 40, 48, 255]);
  const px = 10, py = 34;
  for (let i = 1; i < 6; i++) blit(img, T.creative_tab_top_unselected, px + i * 27, py - 28);
  blit(img, T.creative_inventory, px, py);
  blit(img, T.creative_tab_top_selected_1, px, py - 28);
  blit(img, T.creative_tab_top_unselected, px, py + 132); // bottom tab preview (unflipped)
  blit(img, T.creative_scroller, px + 175, py + 18);
  text(img, 'Building Blocks', px + 8, py + 6, '#404040', false);
  writePNG('/tmp/gui_creative.png', W, H, img.data, 3);
}
// --- coordinate self-check: every slot's item area must be slot fill, its frame top-left dark, bottom-right white
{
  const px = (img, x, y) => { const i = (y * img.w + x) * 4; return (img.data[i] << 16 | img.data[i + 1] << 8 | img.data[i + 2]) >>> 0; };
  const errs = [];
  const chk = (name, x, y, big = false) => {
    const im = T[name], o = big ? 5 : 1, n = big ? 26 : 18;
    if (px(im, x, y) !== 0x8B8B8B || px(im, x + 15, y + 15) !== 0x8B8B8B) errs.push(`${name} item@${x},${y}`);
    if (px(im, x - o, y - o + 1) !== 0x373737) errs.push(`${name} frameTL@${x},${y}`);
    if (px(im, x - o + n - 1, y - o + n - 1) !== 0xFFFFFF) errs.push(`${name} frameBR@${x},${y}`);
  };
  const inv = (name, y0, hy) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) chk(name, 8 + c * 18, y0 + r * 18); for (let c = 0; c < 9; c++) chk(name, 8 + c * 18, hy); };
  [8, 26, 44, 62].forEach(y => chk('inventory', 8, y)); chk('inventory', 77, 62);
  for (const x of [98, 116]) for (const y of [18, 36]) chk('inventory', x, y);
  chk('inventory', 154, 28); inv('inventory', 84, 142);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) chk('crafting_table', 30 + c * 18, 17 + r * 18);
  chk('crafting_table', 124, 35, true); inv('crafting_table', 84, 142);
  chk('furnace', 56, 17); chk('furnace', 56, 53); chk('furnace', 116, 35, true); inv('furnace', 84, 142);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) chk('generic_27', 8 + c * 18, 18 + r * 18);
  inv('generic_27', 85, 143);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) chk('generic_54', 8 + c * 18, 18 + r * 18);
  inv('generic_54', 139, 197);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) chk('creative_inventory', 9 + c * 18, 18 + r * 18);
  for (let c = 0; c < 9; c++) chk('creative_inventory', 9 + c * 18, 112);
  const sizes = { hotbar: [182, 22], hotbar_selection: [24, 23], crosshair: [15, 15], experience_bar_background: [182, 5], experience_bar_progress: [182, 5],
    button: [200, 20], button_highlighted: [200, 20], button_disabled: [200, 20], slider: [200, 20], slider_handle: [8, 20], slider_handle_highlighted: [8, 20],
    heart_container: [9, 9], heart_full: [9, 9], food_full: [9, 9], armor_full: [9, 9], air: [9, 9], air_bursting: [9, 9], inventory: [256, 256],
    furnace_lit_progress: [14, 14], furnace_burn_progress: [24, 17], creative_scroller: [12, 15], creative_tab_top_selected: [26, 32],
    title_minecraft: [274, 44], title_edition: [98, 14], options_background: [16, 16], hotbar_offhand_left: [29, 24] };
  for (const [k, [w, h]] of Object.entries(sizes)) if (!T[k] || T[k].w !== w || T[k].h !== h || T[k].data.length !== w * h * 4) errs.push(`size ${k}`);
  // font sanity
  const t = textToImageData('Hello', {});
  if (t.w !== measureText('Hello') || t.h !== LINE_HEIGHT) errs.push('textToImageData size');
  if (measureText('§lAB') !== 14 || measureText('§cA§rB') !== 12 || measureText(' ') !== 4 || measureText('il') !== 5) errs.push('measureText');
  console.log(errs.length ? 'SELF-CHECK FAILURES:\n  ' + errs.join('\n  ') : 'self-check OK (slot coordinates, sprite sizes, font metrics)');
}
