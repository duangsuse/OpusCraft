// UI manager: 2D canvas overlay drawn at Minecraft's integer GUI scale, sprite cache, widgets, screen stack.
import { drawText, measureText, LINE_HEIGHT } from './font.js';
import { paintGuiTextures } from '../textures/guitex.js';

export class GUI {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.sprites = {};
    const tex = paintGuiTextures();
    for (const [n, t] of Object.entries(tex)) this.sprites[n] = toCanvas(t.w, t.h, t.data);
    this.screens = [];
    this.mouse = { x: -1, y: -1, down: 0 };
    this.scale = 2;
    this.w = 320; this.h = 240;
    this.settingScale = 0;
    window.addEventListener('mousemove', (e) => this.onMouse('move', e));
    window.addEventListener('mousedown', (e) => this.onMouse('down', e));
    window.addEventListener('mouseup', (e) => this.onMouse('up', e));
    window.addEventListener('wheel', (e) => { const s = this.top(); if (s && s.onWheel) s.onWheel(Math.sign(e.deltaY)); }, { passive: true });
    window.addEventListener('dblclick', (e) => { const s = this.top(); if (s && s.onDoubleClick) { this.updateMouse(e); s.onDoubleClick(this.mouse.x, this.mouse.y, e.button); } });
  }
  top() { return this.screens[this.screens.length - 1]; }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.floor(window.innerWidth * dpr), H = Math.floor(window.innerHeight * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    // Window.calculateScale
    let s = 1;
    const max = this.settingScale || 1000;
    while (s < max && s < W && s < H && W / (s + 1) >= 320 && H / (s + 1) >= 240) s++;
    this.scale = s;
    this.w = Math.ceil(W / s); this.h = Math.ceil(H / s);
    this.dpr = dpr;
  }
  updateMouse(e) {
    this.mouse.x = Math.floor(e.clientX * this.dpr / this.scale);
    this.mouse.y = Math.floor(e.clientY * this.dpr / this.scale);
  }
  onMouse(type, e) {
    this.updateMouse(e);
    const s = this.top();
    if (!s) return;
    if (type === 'move') s.onMouseMove?.(this.mouse.x, this.mouse.y, e);
    else if (type === 'down') { this.mouse.down |= 1 << e.button; s.onMouseDown?.(this.mouse.x, this.mouse.y, e.button, e); }
    else { this.mouse.down &= ~(1 << e.button); s.onMouseUp?.(this.mouse.x, this.mouse.y, e.button, e); }
  }
  begin() {
    this.resize();
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.imageSmoothingEnabled = false;
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
  }
  // ---- drawing helpers (GUI units) ----
  sprite(name, x, y, w, h, sx = 0, sy = 0, sw, sh) {
    const s = this.sprites[name];
    if (!s) return;
    sw = sw ?? (w ?? s.width); sh = sh ?? (h ?? s.height);
    this.ctx.drawImage(s, sx, sy, sw, sh, x, y, w ?? sw, h ?? sh);
  }
  text(str, x, y, color = 0xffffff, shadow = true) {
    return drawText(this.ctx, str, x, y, { color: typeof color === 'number' ? '#' + color.toString(16).padStart(6, '0') : color, shadow, scale: 1 });
  }
  textCentered(str, cx, y, color = 0xffffff, shadow = true) { return this.text(str, Math.floor(cx - (measureText(str) - 1) / 2), y, color, shadow); }
  width(str) { return measureText(str) - 1; }
  fill(x, y, w, h, color) { this.ctx.fillStyle = color; this.ctx.fillRect(x, y, w, h); }
  gradient(x, y, w, h, c1, c2) {
    const g = this.ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    this.ctx.fillStyle = g; this.ctx.fillRect(x, y, w, h);
  }
  // nine-slice-ish button drawing using the 200x20 sprite (left + right halves like vanilla)
  button(x, y, w, h, label, state = 'normal') {
    const sp = state === 'disabled' ? 'button_disabled' : state === 'hover' ? 'button_highlighted' : 'button';
    const hw = Math.floor(w / 2);
    // vanilla draws left half from the sprite's left and right half from the sprite's right edge
    this.sprite(sp, x, y, hw, h, 0, 0, hw, Math.min(h, 20));
    this.sprite(sp, x + hw, y, w - hw, h, 200 - (w - hw), 0, w - hw, Math.min(h, 20));
    if (h > 20) { /* rare */ }
    const color = state === 'disabled' ? 0xa0a0a0 : state === 'hover' ? 0xffffa0 : 0xe0e0e0;
    this.textCentered(label, x + w / 2, y + Math.floor((h - 8) / 2), color);
  }
  tooltip(lines, mx, my) {
    const c = this.ctx;
    let w = 0; for (const l of lines) w = Math.max(w, this.width(l));
    let x = mx + 12, y = my - 12;
    const h = lines.length === 1 ? 8 : 8 + 2 + (lines.length - 1) * 10;
    if (x + w + 4 > this.w) x = mx - 16 - w;
    if (y + h + 6 > this.h) y = this.h - h - 6;
    if (y < 4) y = 4;
    c.fillStyle = 'rgba(16,0,16,0.94)';
    c.fillRect(x - 3, y - 4, w + 6, 1); c.fillRect(x - 3, y + h + 3, w + 6, 1);
    c.fillRect(x - 3, y - 3, w + 6, h + 6); c.fillRect(x - 4, y - 3, 1, h + 6); c.fillRect(x + w + 3, y - 3, 1, h + 6);
    const g = c.createLinearGradient(0, y - 3, 0, y + h + 3);
    g.addColorStop(0, 'rgba(80,0,255,0.31)'); g.addColorStop(1, 'rgba(40,0,127,0.31)');
    c.fillStyle = g;
    c.fillRect(x - 3, y - 3, 1, h + 6); c.fillRect(x + w + 2, y - 3, 1, h + 6);
    c.fillRect(x - 3, y - 3, w + 6, 1); c.fillRect(x - 3, y + h + 2, w + 6, 1);
    lines.forEach((l, i) => this.text(l, x, y + (i === 0 ? 0 : 2 + i * 10), i === 0 ? 0xffffff : 0xaaaaaa));
  }
  // dirt background (vanilla options background)
  dirtBackground(dark = 0x40) {
    const s = this.sprites.options_background || this.sprites.dirt;
    if (!s) { this.fill(0, 0, this.w, this.h, '#2a1f14'); return; }
    const c = this.ctx;
    for (let y = 0; y < this.h; y += 32) for (let x = 0; x < this.w; x += 32) c.drawImage(s, 0, 0, s.width, s.height, x, y, 32, 32);
    void dark;
  }
  pushScreen(s) { this.screens.push(s); s.gui = this; s.init?.(); }
  popScreen() { const s = this.screens.pop(); s?.onClose?.(); return s; }
  setScreen(s) { while (this.screens.length) this.popScreen(); if (s) this.pushScreen(s); }
}

export function toCanvas(w, h, data) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---- Widgets ----------------------------------------------------------------------------------------
export class Button {
  constructor(x, y, w, h, label, onClick, opts = {}) { Object.assign(this, { x, y, w, h, label, onClick, active: opts.active !== false, tooltip: opts.tooltip }); }
  hover(mx, my) { return mx >= this.x && my >= this.y && mx < this.x + this.w && my < this.y + this.h; }
  draw(gui, mx, my) { const lbl = typeof this.label === 'function' ? this.label() : this.label; gui.button(this.x, this.y, this.w, this.h, lbl, !this.active ? 'disabled' : this.hover(mx, my) ? 'hover' : 'normal'); }
  click(mx, my, gui) { if (this.active && this.hover(mx, my)) { gui.onClick?.(); this.onClick?.(this); return true; } return false; }
}

export class Slider {
  constructor(x, y, w, h, labelFn, value, onChange) { Object.assign(this, { x, y, w, h, labelFn, value, onChange, dragging: false }); }
  hover(mx, my) { return mx >= this.x && my >= this.y && mx < this.x + this.w && my < this.y + this.h; }
  draw(gui, mx, my) {
    const hw = Math.floor(this.w / 2);
    gui.sprite('slider', this.x, this.y, hw, this.h, 0, 0, hw, 20);
    gui.sprite('slider', this.x + hw, this.y, this.w - hw, this.h, 200 - (this.w - hw), 0, this.w - hw, 20);
    const hx = this.x + Math.round(this.value * (this.w - 8));
    gui.sprite(this.hover(mx, my) || this.dragging ? 'slider_handle_highlighted' : 'slider_handle', hx, this.y, 8, 20);
    gui.textCentered(this.labelFn(this.value), this.x + this.w / 2, this.y + 6, this.hover(mx, my) ? 0xffffa0 : 0xe0e0e0);
  }
  set(mx) { this.value = Math.max(0, Math.min(1, (mx - (this.x + 4)) / (this.w - 8))); this.onChange?.(this.value); }
  click(mx, my, gui) { if (this.hover(mx, my)) { this.dragging = true; this.set(mx); gui.onClick?.(); return true; } return false; }
  move(mx) { if (this.dragging) this.set(mx); }
  release() { this.dragging = false; }
}

export class TextField {
  constructor(x, y, w, h, value = '', opts = {}) { Object.assign(this, { x, y, w, h, value, focused: false, max: opts.max || 32, hint: opts.hint || '', cursorTick: 0 }); }
  hover(mx, my) { return mx >= this.x && my >= this.y && mx < this.x + this.w && my < this.y + this.h; }
  draw(gui) {
    gui.fill(this.x - 1, this.y - 1, this.w + 2, this.h + 2, this.focused ? '#ffffff' : '#a0a0a0');
    gui.fill(this.x, this.y, this.w, this.h, '#000000');
    const t = this.value;
    if (!t && !this.focused && this.hint) gui.text(this.hint, this.x + 4, this.y + (this.h - 8) / 2, 0x707070, false);
    gui.text(t, this.x + 4, this.y + Math.floor((this.h - 8) / 2), 0xe0e0e0);
    this.cursorTick++;
    if (this.focused && (this.cursorTick >> 4) % 2 === 0) gui.text('_', this.x + 4 + gui.width(t) + 1, this.y + Math.floor((this.h - 8) / 2), 0xd0d0d0);
  }
  click(mx, my) { this.focused = this.hover(mx, my); return this.focused; }
  key(e) {
    if (!this.focused) return false;
    if (e.key === 'Backspace') { this.value = this.value.slice(0, -1); return true; }
    if (e.key.length === 1 && this.value.length < this.max && e.key.charCodeAt(0) >= 32 && e.key.charCodeAt(0) < 127) { this.value += e.key; return true; }
    if (e.key === 'v' && (e.ctrlKey || e.metaKey)) return false;
    return false;
  }
}

export { LINE_HEIGHT, measureText };
