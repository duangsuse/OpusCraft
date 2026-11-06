// Menu screens: title, world selection/creation, options, pause, death, chat, loading.
import { Button, Slider, TextField } from './gui.js';

const SPLASHES = [
  'Now with shaders!', 'Procedurally painted!', '100% JavaScript!', 'Also try the vanilla look!', 'Cherry blossoms!', 'Ride the rails!',
  'Boats included!', 'Sunsets!', 'Volumetric clouds!', 'God rays!', 'Thunderstorms!', 'Made with WebGL2!', 'Pixel perfect!', 'Block by block!',
  'Infinite terrain!', 'Hello, world!', 'Shaders on, frames off?', 'Look up!', 'Rainbows after rain!', 'Punch a tree!', 'Watch out for creepers!',
];

class Screen {
  constructor() { this.widgets = []; this.pausesGame = true; }
  add(w) { this.widgets.push(w); return w; }
  render(mx, my) { for (const w of this.widgets) w.draw(this.gui, mx, my); }
  onMouseDown(mx, my, b) { if (b !== 0) return; for (const w of this.widgets) if (w.click && w.click(mx, my, this.gui)) return; }
  onMouseMove(mx) { for (const w of this.widgets) w.move?.(mx); }
  onMouseUp() { for (const w of this.widgets) w.release?.(); }
  onKey(e) { for (const w of this.widgets) if (w.key && w.key(e)) return true; return false; }
}

export class TitleScreen extends Screen {
  constructor(app) { super(); this.app = app; this.splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)]; this.pausesGame = false; }
  init() {
    const g = this.gui, x = Math.floor(g.w / 2) - 100, y = Math.floor(g.h / 4) + 48;
    this.widgets = [];
    this.add(new Button(x, y, 200, 20, 'Singleplayer', () => this.app.openWorldList()));
    this.add(new Button(x, y + 24, 200, 20, 'Multiplayer', null, { active: false }));
    this.add(new Button(x, y + 48, 200, 20, 'Minecraft Realms', null, { active: false }));
    this.add(new Button(x, y + 72 + 12, 98, 20, 'Options...', () => g.pushScreen(new OptionsScreen(this.app))));
    this.add(new Button(x + 102, y + 72 + 12, 98, 20, 'Quit Game', () => { this.app.quitMessage(); }));
  }
  render(mx, my) {
    const g = this.gui;
    if (this.lastW !== g.w || this.lastH !== g.h) { this.lastW = g.w; this.lastH = g.h; this.init(); }
    // logo
    const lx = Math.floor(g.w / 2 - 137), ly = 30;
    g.sprite('title_minecraft', lx, ly, 274, 44);
    g.sprite('title_edition', lx + 88, ly + 37, 98, 14);
    // splash
    const c = g.ctx;
    c.save();
    c.translate(g.w / 2 + 90, 70);
    c.rotate(-20 * Math.PI / 180);
    let f = 1.8 - Math.abs(Math.sin((Date.now() % 1000) / 1000 * Math.PI * 2) * 0.1);
    f = f * 100 / (g.width(this.splash) + 32);
    c.scale(f, f);
    g.textCentered(this.splash, 0, -8, 0xffff00);
    c.restore();
    g.text('Minecraft 1.20.1 (Replica)', 2, g.h - 10, 0xffffff);
    const r = 'Fan-made replica. Not an official product.';
    g.text(r, g.w - g.width(r) - 2, g.h - 10, 0xffffff);
    super.render(mx, my);
  }
}

export class WorldListScreen extends Screen {
  constructor(app) { super(); this.app = app; this.worlds = []; this.selected = -1; this.scroll = 0; }
  async init() {
    this.worlds = await this.app.storage.listWorlds();
    this.layout();
  }
  layout() {
    const g = this.gui; this.widgets = [];
    const bx = Math.floor(g.w / 2) - 154, by = g.h - 52;
    this.playBtn = this.add(new Button(bx, by, 150, 20, 'Play Selected World', () => this.play(), { active: this.selected >= 0 }));
    this.add(new Button(bx + 154, by, 150, 20, 'Create New World', () => this.gui.pushScreen(new CreateWorldScreen(this.app))));
    this.delBtn = this.add(new Button(bx, by + 24, 72, 20, 'Delete', () => this.del(), { active: this.selected >= 0 }));
    this.add(new Button(bx + 76, by + 24, 72, 20, 'Edit', null, { active: false }));
    this.add(new Button(bx + 154, by + 24, 150, 20, 'Cancel', () => this.gui.popScreen()));
  }
  play() { const w = this.worlds[this.selected]; if (w) this.app.playWorld(w); }
  async del() { const w = this.worlds[this.selected]; if (!w) return; await this.app.storage.deleteWorld(w.id); this.selected = -1; await this.init(); }
  render(mx, my) {
    const g = this.gui;
    g.dirtBackground();
    g.fill(0, 32, g.w, g.h - 64 - 32, 'rgba(0,0,0,0.55)');
    g.textCentered('Select World', g.w / 2, 13, 0xffffff);
    const lx = Math.floor(g.w / 2) - 110;
    this.worlds.forEach((w, i) => {
      const y = 36 + i * 36 - this.scroll;
      if (y < 32 || y > g.h - 100) return;
      if (i === this.selected) { g.fill(lx - 2, y - 2, 224, 36, '#808080'); g.fill(lx - 1, y - 1, 222, 34, '#000'); }
      g.fill(lx, y, 32, 32, '#3a2a1a');
      if (w.icon) { const img = this.icons?.[w.id]; if (img) g.ctx.drawImage(img, lx, y, 32, 32); }
      g.text(w.name, lx + 35, y + 1, 0xffffff);
      g.text(`${w.id.slice(0, 18)} (${new Date(w.lastPlayed).toLocaleString()})`, lx + 35, y + 12, 0x808080);
      g.text(`${w.gamemode === 'creative' ? 'Creative Mode' : 'Survival Mode'}, Cheats: ON, Version: 1.20.1`, lx + 35, y + 22, 0x808080);
    });
    if (!this.worlds.length) g.textCentered('No worlds yet - create one!', g.w / 2, 60, 0xa0a0a0);
    if (this.playBtn) { this.playBtn.active = this.selected >= 0; this.delBtn.active = this.selected >= 0; }
    super.render(mx, my);
  }
  onMouseDown(mx, my, b) {
    const g = this.gui, lx = Math.floor(g.w / 2) - 110;
    if (my > 32 && my < g.h - 64 && mx >= lx && mx < lx + 220) {
      const i = Math.floor((my - 36 + this.scroll) / 36);
      if (i >= 0 && i < this.worlds.length) {
        if (this.selected === i && performance.now() - (this.lastClick || 0) < 300) { this.play(); return; }
        this.selected = i; this.lastClick = performance.now(); return;
      }
    }
    super.onMouseDown(mx, my, b);
  }
  onWheel(d) { this.scroll = Math.max(0, this.scroll + d * 18); }
}

export class CreateWorldScreen extends Screen {
  constructor(app) { super(); this.app = app; this.mode = 'survival'; this.shaders = app.settings.shaders; }
  init() {
    const g = this.gui, cx = Math.floor(g.w / 2);
    this.widgets = [];
    this.name = this.add(new TextField(cx - 100, 60, 200, 20, 'New World'));
    this.name.focused = true;
    this.add(new Button(cx - 100, 100, 200, 20, () => `Game Mode: ${this.mode === 'survival' ? 'Survival' : this.mode === 'creative' ? 'Creative' : 'Hardcore'}`, () => { this.mode = { survival: 'creative', creative: 'hardcore', hardcore: 'survival' }[this.mode]; }));
    this.seed = this.add(new TextField(cx - 100, 148, 200, 20, '', { hint: 'Leave blank for a random seed' }));
    this.add(new Button(cx - 100, 176, 200, 20, () => `Shaders: ${this.shaders ? 'ON' : 'OFF'}`, () => { this.shaders = !this.shaders; }));
    this.add(new Button(cx - 155, g.h - 28, 150, 20, 'Create New World', () => this.create()));
    this.add(new Button(cx + 5, g.h - 28, 150, 20, 'Cancel', () => this.gui.popScreen()));
  }
  create() {
    let seed = this.seed.value.trim();
    let n;
    if (!seed) n = Math.floor(Math.random() * 2 ** 31);
    else if (/^-?\d+$/.test(seed)) n = Number(seed) | 0;
    else { n = 0; for (const ch of seed) n = (Math.imul(n, 31) + ch.charCodeAt(0)) | 0; }
    this.app.settings.shaders = this.shaders; this.app.saveSettings();
    this.app.createWorld({ name: this.name.value || 'New World', seed: n, gamemode: this.mode === 'hardcore' ? 'survival' : this.mode, hardcore: this.mode === 'hardcore' });
  }
  render(mx, my) {
    const g = this.gui;
    g.dirtBackground();
    g.textCentered('Create New World', g.w / 2, 20, 0xffffff);
    g.text('World Name', g.w / 2 - 100, 47, 0xa0a0a0);
    g.text('Seed for the world generator', g.w / 2 - 100, 135, 0xa0a0a0);
    super.render(mx, my);
  }
  onMouseDown(mx, my, b) { this.name.click(mx, my); this.seed.click(mx, my); super.onMouseDown(mx, my, b); }
  onKey(e) { if (e.key === 'Enter') { this.create(); return true; } if (e.key === 'Tab') { const n = this.name.focused; this.name.focused = !n; this.seed.focused = n; return true; } return super.onKey(e); }
}

export class OptionsScreen extends Screen {
  constructor(app) { super(); this.app = app; }
  init() {
    const g = this.gui, s = this.app.settings, cx = Math.floor(g.w / 2);
    this.widgets = [];
    const y0 = Math.floor(g.h / 6) - 12;
    this.add(new Slider(cx - 155, y0 + 24 * 0, 150, 20, (v) => `FOV: ${Math.round(30 + v * 80) === 70 ? 'Normal' : Math.round(30 + v * 80) === 110 ? 'Quake Pro' : Math.round(30 + v * 80)}`, (s.fov - 30) / 80, (v) => { s.fov = Math.round(30 + v * 80); this.app.applySettings(); }));
    this.add(new Button(cx + 5, y0, 150, 20, () => `Shaders: ${s.shaders ? 'ON' : 'OFF'}`, () => { s.shaders = !s.shaders; this.app.applySettings(); }));
    this.add(new Button(cx - 155, y0 + 48, 150, 20, 'Video Settings...', () => g.pushScreen(new VideoScreen(this.app))));
    this.add(new Button(cx + 5, y0 + 48, 150, 20, 'Music & Sounds...', () => g.pushScreen(new SoundScreen(this.app))));
    this.add(new Button(cx - 155, y0 + 72, 150, 20, 'Controls...', () => g.pushScreen(new ControlsScreen(this.app))));
    this.add(new Button(cx + 5, y0 + 72, 150, 20, () => `Shader Quality: ${s.shaderQuality[0].toUpperCase() + s.shaderQuality.slice(1)}`, () => { s.shaderQuality = { auto: 'low', low: 'medium', medium: 'high', high: 'ultra', ultra: 'auto' }[s.shaderQuality] || 'auto'; this.app.applySettings(); }));
    this.add(new Slider(cx - 155, y0 + 96, 150, 20, (v) => `Mouse Sensitivity: ${Math.round(v * 200)}%`, s.sensitivity, (v) => { s.sensitivity = v; this.app.applySettings(); }));
    this.add(new Slider(cx + 5, y0 + 96, 150, 20, (v) => `Brightness: ${v < 0.01 ? 'Moody' : v > 0.99 ? 'Bright' : '+' + Math.round(v * 100) + '%'}`, s.gamma, (v) => { s.gamma = v; this.app.applySettings(); }));
    this.add(new Button(cx - 100, g.h / 6 + 168, 200, 20, 'Done', () => { this.app.saveSettings(); g.popScreen(); }));
  }
  render(mx, my) {
    const g = this.gui;
    if (this.app.inWorld) g.gradient(0, 0, g.w, g.h, 'rgba(16,16,16,0.75)', 'rgba(16,16,16,0.82)'); else g.dirtBackground();
    g.textCentered('Options', g.w / 2, 15, 0xffffff);
    super.render(mx, my);
  }
}

export class VideoScreen extends Screen {
  constructor(app) { super(); this.app = app; }
  init() {
    const g = this.gui, s = this.app.settings, cx = Math.floor(g.w / 2);
    this.widgets = [];
    const y0 = 32;
    const cyc = (x, y, label, get, next) => this.add(new Button(x, y, 150, 20, () => `${label}: ${get()}`, () => { next(); this.app.applySettings(); }));
    this.add(new Slider(cx - 155, y0, 150, 20, (v) => `Render Distance: ${Math.round(2 + v * 30)} chunks`, (s.renderDistance - 2) / 30, (v) => { s.renderDistance = Math.round(2 + v * 30); this.app.applySettings(); }));
    cyc(cx + 5, y0, 'Graphics', () => 'Fancy', () => { });
    cyc(cx - 155, y0 + 24, 'Smooth Lighting', () => 'ON', () => { });
    this.add(new Slider(cx + 5, y0 + 24, 150, 20, (v) => v < 0.05 ? 'Render Scale: Auto' : `Render Scale: ${Math.round((0.4 + v * 0.6) * 100)}%`, s.renderScale ? (s.renderScale - 0.4) / 0.6 : 0, (v) => { s.renderScale = v < 0.05 ? 0 : 0.4 + Math.round(v * 12) / 20; this.app.applySettings(); }));
    cyc(cx - 155, y0 + 48, 'GUI Scale', () => s.guiScale ? s.guiScale : 'Auto', () => { s.guiScale = (s.guiScale + 1) % 5; });
    cyc(cx + 5, y0 + 48, 'View Bobbing', () => s.viewBobbing ? 'ON' : 'OFF', () => { s.viewBobbing = !s.viewBobbing; });
    cyc(cx - 155, y0 + 72, 'Clouds', () => s.clouds === 'fancy' ? 'Fancy' : s.clouds === 'fast' ? 'Fast' : 'OFF', () => { s.clouds = { fancy: 'fast', fast: 'off', off: 'fancy' }[s.clouds]; });
    cyc(cx + 5, y0 + 72, 'Shaders', () => s.shaders ? 'ON' : 'OFF', () => { s.shaders = !s.shaders; });
    cyc(cx - 155, y0 + 96, 'Shader Quality', () => s.shaderQuality, () => { s.shaderQuality = { auto: 'low', low: 'medium', medium: 'high', high: 'ultra', ultra: 'auto' }[s.shaderQuality] || 'auto'; });
    cyc(cx + 5, y0 + 96, 'Show FPS', () => s.showFps ? 'ON' : 'OFF', () => { s.showFps = !s.showFps; });
    cyc(cx - 155, y0 + 120, 'Water', () => (s.waterStyle === 'classic' ? 'Classic' : 'Shader'), () => { s.waterStyle = s.waterStyle === 'classic' ? 'shader' : 'classic'; });
    this.add(new Button(cx - 100, g.h - 27, 200, 20, 'Done', () => { this.app.saveSettings(); g.popScreen(); }));
  }
  render(mx, my) {
    const g = this.gui;
    if (this.app.inWorld) g.gradient(0, 0, g.w, g.h, 'rgba(16,16,16,0.75)', 'rgba(16,16,16,0.82)'); else g.dirtBackground();
    g.textCentered('Video Settings', g.w / 2, 15, 0xffffff);
    super.render(mx, my);
  }
}

export class SoundScreen extends Screen {
  constructor(app) { super(); this.app = app; }
  init() {
    const g = this.gui, s = this.app.settings, cx = Math.floor(g.w / 2);
    this.widgets = [];
    s.volumes = s.volumes || { master: 1, music: 0.5, blocks: 1, hostile: 1, neutral: 1, player: 1, ambient: 1, weather: 1 };
    const cats = Object.keys(s.volumes);
    cats.forEach((c, i) => {
      const x = i === 0 ? cx - 155 : (i % 2 ? cx - 155 : cx + 5), y = 32 + (i === 0 ? 0 : Math.ceil(i / 2) * 24);
      const label = { master: 'Master Volume', music: 'Music', blocks: 'Blocks', hostile: 'Hostile Creatures', neutral: 'Friendly Creatures', player: 'Players', ambient: 'Ambient/Environment', weather: 'Weather' }[c];
      this.add(new Slider(i === 0 ? cx - 155 : x, y, i === 0 ? 310 : 150, 20, (v) => `${label}: ${v === 0 ? 'OFF' : Math.round(v * 100) + '%'}`, s.volumes[c], (v) => { s.volumes[c] = v; this.app.applySettings(); }));
    });
    this.add(new Button(cx - 100, g.h - 27, 200, 20, 'Done', () => { this.app.saveSettings(); g.popScreen(); }));
  }
  render(mx, my) {
    const g = this.gui;
    if (this.app.inWorld) g.gradient(0, 0, g.w, g.h, 'rgba(16,16,16,0.75)', 'rgba(16,16,16,0.82)'); else g.dirtBackground();
    g.textCentered('Music & Sound Options', g.w / 2, 15, 0xffffff);
    super.render(mx, my);
  }
}

export class ControlsScreen extends Screen {
  constructor(app) { super(); this.app = app; }
  init() { const g = this.gui; this.widgets = [new Button(Math.floor(g.w / 2) - 100, g.h - 27, 200, 20, 'Done', () => g.popScreen())]; }
  render(mx, my) {
    const g = this.gui;
    if (this.app.inWorld) g.gradient(0, 0, g.w, g.h, 'rgba(16,16,16,0.75)', 'rgba(16,16,16,0.82)'); else g.dirtBackground();
    g.textCentered('Controls', g.w / 2, 15, 0xffffff);
    const rows = [['Walk', 'W A S D'], ['Jump / Fly (double tap)', 'Space'], ['Sneak / Descend', 'Shift'], ['Sprint', 'Ctrl or double-tap W'], ['Attack / Destroy', 'Left Button'], ['Use / Place', 'Right Button'],
      ['Pick Block', 'Middle Button'], ['Inventory', 'E'], ['Drop Item', 'Q'], ['Hotbar', '1-9 / Scroll'], ['Chat / Command', 'T  /'], ['Perspective', 'F5'], ['Hide HUD', 'F1'], ['Debug', 'F3'], ['Toggle Shaders', 'K'], ['Pause', 'Esc'], ['Dismount', 'Shift']];
    rows.forEach(([a, b], i) => { g.text(a, g.w / 2 - 150, 36 + i * 11, 0xffffff); g.text(b, g.w / 2 + 40, 36 + i * 11, 0xffff55); });
    super.render(mx, my);
  }
}

export class PauseScreen extends Screen {
  constructor(app) { super(); this.app = app; }
  init() {
    const g = this.gui, cx = Math.floor(g.w / 2), y = Math.floor(g.h / 4) + 8;
    this.widgets = [];
    this.add(new Button(cx - 102, y + 24 - 16, 204, 20, 'Back to Game', () => this.app.closeScreen()));
    this.add(new Button(cx - 102, y + 48 - 16, 98, 20, 'Advancements', null, { active: false }));
    this.add(new Button(cx + 4, y + 48 - 16, 98, 20, 'Statistics', null, { active: false }));
    this.add(new Button(cx - 102, y + 72 - 16, 98, 20, 'Give Feedback', null, { active: false }));
    this.add(new Button(cx + 4, y + 72 - 16, 98, 20, 'Report Bugs', null, { active: false }));
    this.add(new Button(cx - 102, y + 96 - 16, 98, 20, 'Options...', () => g.pushScreen(new OptionsScreen(this.app))));
    this.add(new Button(cx + 4, y + 96 - 16, 98, 20, 'Open to LAN', null, { active: false }));
    this.add(new Button(cx - 102, y + 120 - 16, 204, 20, 'Save and Quit to Title', () => this.app.quitToTitle()));
  }
  render(mx, my) {
    const g = this.gui;
    g.gradient(0, 0, g.w, g.h, 'rgba(16,16,16,0.75)', 'rgba(16,16,16,0.82)');
    g.textCentered('Game Menu', g.w / 2, 40, 0xffffff);
    super.render(mx, my);
  }
}

export class DeathScreen extends Screen {
  constructor(app, msg) { super(); this.app = app; this.msg = msg; this.pausesGame = false; this.delay = 20; }
  init() {
    const g = this.gui, cx = Math.floor(g.w / 2);
    this.widgets = [];
    this.respawn = this.add(new Button(cx - 100, g.h / 4 + 72, 200, 20, this.app.game?.hardcore ? 'Spectate World' : 'Respawn', () => this.app.respawn(), { active: false }));
    this.add(new Button(cx - 100, g.h / 4 + 96, 200, 20, 'Title Screen', () => this.app.quitToTitle(), { active: false }));
  }
  render(mx, my) {
    const g = this.gui;
    g.gradient(0, 0, g.w, g.h, 'rgba(80,0,0,0.38)', 'rgba(160,48,48,0.63)');
    const c = g.ctx;
    c.save(); c.scale(2, 2); g.textCentered(this.app.game?.hardcore ? 'Game Over!' : 'You Died!', g.w / 4, 30, 0xffffff); c.restore();
    g.textCentered(this.msg || '', g.w / 2, 85, 0xffffff);
    g.textCentered(`Score: §e${this.app.game?.player?.xpTotal || 0}`, g.w / 2, 100, 0xffffff);
    if (--this.delay <= 0) for (const w of this.widgets) w.active = true;
    super.render(mx, my);
  }
}

export class ChatScreen extends Screen {
  constructor(app, initial = '') { super(); this.app = app; this.pausesGame = false; this.field = new TextField(2, 0, 0, 12, initial, { max: 256 }); this.field.focused = true; this.histIdx = -1; }
  render() {
    const g = this.gui;
    this.field.y = g.h - 14; this.field.w = g.w - 4;
    g.fill(2, g.h - 14, g.w - 4, 12, 'rgba(0,0,0,0.5)');
    g.text(this.field.value + ((Date.now() >> 8) % 2 ? '_' : ''), 4, g.h - 12, 0xffffff);
  }
  onKey(e) {
    const hist = this.app.chatHistory;
    if (e.key === 'Enter') { const v = this.field.value.trim(); this.app.closeScreen(); if (v) { hist.push(v); this.app.submitChat(v); } return true; }
    if (e.key === 'ArrowUp') { if (hist.length) { this.histIdx = this.histIdx < 0 ? hist.length - 1 : Math.max(0, this.histIdx - 1); this.field.value = hist[this.histIdx]; } return true; }
    if (e.key === 'ArrowDown') { if (this.histIdx >= 0) { this.histIdx = Math.min(hist.length, this.histIdx + 1); this.field.value = hist[this.histIdx] || ''; } return true; }
    if (e.key === 'Tab') { this.field.value = this.app.completeCommand(this.field.value); return true; }
    return this.field.key(e);
  }
}

export class LoadingScreen extends Screen {
  constructor(text) { super(); this.text = text; this.progress = 0; this.pausesGame = false; }
  render() {
    const g = this.gui;
    g.dirtBackground();
    g.textCentered(this.text, g.w / 2, g.h / 2 - 20, 0xffffff);
    const w = 100, x = Math.floor(g.w / 2 - w / 2), y = Math.floor(g.h / 2);
    g.fill(x, y, w, 2, '#808080'); g.fill(x, y, Math.floor(w * this.progress), 2, '#80ff80');
    g.textCentered(`${Math.floor(this.progress * 100)}%`, g.w / 2, y + 8, 0xa0a0a0);
  }
}
