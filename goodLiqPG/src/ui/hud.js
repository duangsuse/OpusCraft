// In-game HUD (port of vanilla Gui.render layout): hotbar, hearts, hunger, armor, air, XP, item name, chat, F3 overlay.
import { ITEMS } from '../game/items.js';
import { BLOCKS, TYPE_MASK, META_SHIFT } from '../world/blocks.js';
import { MIN_Y } from '../world/constants.js';

export class HUD {
  constructor(gui, game, icons) {
    this.gui = gui; this.game = game; this.icons = icons;
    this.chat = [];
    this.toolHighlightTimer = 0; this.lastHeld = null;
    this.tickCount = 0;
    this.lastHealth = 20; this.displayHealth = 20; this.healthBlinkTime = 0; this.lastHealthTime = 0;
    this.title = null;
    this.actionbar = null;
    this.random = Math.random;
  }
  tick() {
    this.tickCount++;
    const held = this.game.inventory.held();
    const key = held ? held.id : null;
    if (key !== this.lastHeld) { this.toolHighlightTimer = held ? 40 : 0; this.lastHeld = key; }
    else if (this.toolHighlightTimer > 0) this.toolHighlightTimer--;
    for (const m of this.chat) m.age++;
    if (this.title && --this.title.time <= 0) this.title = null;
    if (this.actionbar && --this.actionbar.time <= 0) this.actionbar = null;
  }
  addChat(text) { this.chat.unshift({ text, age: 0 }); if (this.chat.length > 100) this.chat.pop(); }
  showTitle(t, sub = '') { this.title = { text: t, sub, time: 70 }; }
  showActionbar(t, time = 60) { this.actionbar = { text: t, time }; }

  drawItem(id, x, y, stack) {
    const g = this.gui;
    const c = this.icons.get(id);
    g.ctx.drawImage(c, 0, 0, c.width, c.height, x, y, 16, 16);
    if (stack) this.drawDecorations(stack, x, y);
  }
  drawDecorations(s, x, y) {
    const g = this.gui;
    const def = ITEMS[s.id];
    if (def && def.durability && s.damage > 0) {
      const f = Math.max(0, 1 - s.damage / def.durability);
      const w = Math.round(13 * f);
      const hue = f / 3;
      g.fill(x + 2, y + 13, 13, 2, '#000');
      g.fill(x + 2, y + 13, w, 1, `hsl(${hue * 360},100%,50%)`);
    }
    if (s.count > 1) {
      const t = String(s.count);
      g.text(t, x + 19 - 2 - g.width(t) - 1, y + 6 + 3, 0xffffff);
    }
  }

  render() {
    const g = this.gui, game = this.game, p = game.player;
    if (game.hideHud) return;
    const W = g.w, H = g.h;
    const survival = p.gamemode === 'survival' || p.gamemode === 'adventure';
    if (p.gamemode !== 'spectator') {
      // hotbar
      g.sprite('hotbar', Math.floor(W / 2) - 91, H - 22, 182, 22);
      g.sprite('hotbar_selection', Math.floor(W / 2) - 91 - 1 + game.inventory.selected * 20, H - 22 - 1, 24, 23);
      for (let i = 0; i < 9; i++) {
        const s = game.inventory.slots[i];
        if (!s) continue;
        const x = Math.floor(W / 2) - 90 + i * 20 + 2, y = H - 16 - 3;
        this.drawItem(s.id, x, y, s);
      }
    }
    if (survival) {
      this.renderXp(W, H);
      this.renderPlayerHealth(W, H);
    } else if (p.gamemode === 'creative' && false) { /* nothing */ }
    // selected item name
    if (this.toolHighlightTimer > 0 && game.inventory.held()) {
      const s = game.inventory.held();
      const name = ITEMS[s.id]?.displayName || '?';
      let y = H - 59; if (!survival) y += 14;
      const a = Math.min(255, Math.floor(this.toolHighlightTimer * 256 / 10));
      if (a > 0) { g.ctx.globalAlpha = a / 255; g.textCentered(name, W / 2, y, 0xffffff); g.ctx.globalAlpha = 1; }
    }
    if (this.actionbar) { const a = Math.min(1, this.actionbar.time / 10); g.ctx.globalAlpha = a; g.textCentered(this.actionbar.text, W / 2, H - 68, 0xffffff); g.ctx.globalAlpha = 1; }
    if (this.title) {
      const c = g.ctx; const a = Math.min(1, this.title.time / 20);
      c.save(); c.globalAlpha = a; c.translate(W / 2, H / 2); c.scale(4, 4);
      g.text(this.title.text, -g.width(this.title.text) / 2, -10, 0xffffff); c.restore();
      if (this.title.sub) { c.save(); c.globalAlpha = a; c.translate(W / 2, H / 2); c.scale(2, 2); g.text(this.title.sub, -g.width(this.title.sub) / 2, 5, 0xffffff); c.restore(); }
    }
    this.renderChat(W, H, !!game.chatOpen);
    if (game.showDebug) this.renderDebug(W, H);
  }

  renderXp(W, H) {
    const g = this.gui, p = this.game.player;
    const x = Math.floor(W / 2) - 91;
    g.sprite('experience_bar_background', x, H - 32 + 3, 182, 5);
    const w = Math.floor(p.xpProgress * 183);
    if (w > 0) g.sprite('experience_bar_progress', x, H - 32 + 3, w, 5, 0, 0, w, 5);
    if (p.xpLevel > 0) {
      const t = String(p.xpLevel), tx = Math.floor((W - g.width(t)) / 2), ty = H - 31 - 4;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.text(t, tx + dx, ty + dy, 0x000000, false);
      g.text(t, tx, ty, 0x80ff20, false);
    }
  }

  renderPlayerHealth(W, H) {
    const g = this.gui, p = this.game.player, tick = this.tickCount;
    const health = Math.ceil(p.health);
    const blink = this.healthBlinkTime > tick && (this.healthBlinkTime - tick) / 3 % 2 === 1;
    if (health < this.lastHealth && p.invulnerable > 0) { this.lastHealthTime = tick; this.healthBlinkTime = tick + 20; }
    else if (health > this.lastHealth && p.invulnerable > 0) { this.lastHealthTime = tick; this.healthBlinkTime = tick + 10; }
    if (tick - this.lastHealthTime > 20) { this.displayHealth = health; this.lastHealthTime = tick; }
    this.lastHealth = health;
    const left = Math.floor(W / 2) - 91, right = Math.floor(W / 2) + 91, top = H - 39;
    const maxH = p.maxHealth, absorb = Math.ceil(p.absorb || 0);
    const rows = Math.ceil((maxH + absorb) / 2 / 10);
    const rowH = Math.max(10 - (rows - 2), 3);
    const armor = this.game.inventory.armorValue();
    // armor
    const armorY = top - (rows - 1) * rowH - 10;
    if (armor > 0) for (let i = 0; i < 10; i++) {
      const x = left + i * 8;
      if (i * 2 + 1 < armor) g.sprite('armor_full', x, armorY, 9, 9);
      else if (i * 2 + 1 === armor) g.sprite('armor_half', x, armorY, 9, 9);
      else g.sprite('armor_empty', x, armorY, 9, 9);
    }
    // hearts
    const regenOffset = p.regenTicks > 0 ? tick % Math.ceil(maxH + 5) : -1;
    const n = Math.ceil(maxH / 2);
    const rand = mulberry(tick * 312871);
    for (let i = n + Math.ceil(absorb / 2) - 1; i >= 0; i--) {
      const row = Math.floor(i / 10), col = i % 10;
      let x = left + col * 8, y = top - row * rowH;
      if (health <= 4) y += Math.floor(rand() * 2);
      if (i < n && i === regenOffset) y -= 2;
      g.sprite(blink ? 'heart_container_blinking' : 'heart_container', x, y, 9, 9);
      const hv = i * 2;
      if (i >= n) { const a = hv - maxH; if (a < absorb) g.sprite(a + 1 === absorb ? 'heart_absorbing_half' : 'heart_absorbing_full', x, y, 9, 9); continue; }
      if (blink && hv < this.displayHealth) g.sprite(hv + 1 === this.displayHealth ? 'heart_half_blinking' : 'heart_full_blinking', x, y, 9, 9);
      if (hv < health) g.sprite(hv + 1 === health ? 'heart_half' : 'heart_full', x, y, 9, 9);
    }
    // food (or mount health)
    const food = p.food;
    const hunger = !!p.hungerEffect;
    if (!p.vehicle || !p.vehicle.health) for (let i = 0; i < 10; i++) {
      let y = top;
      if (p.saturation <= 0 && tick % (food * 3 + 1) === 0) y += Math.floor(rand() * 3) - 1;
      const x = right - i * 8 - 9;
      g.sprite(hunger ? 'food_empty_hunger' : 'food_empty', x, y, 9, 9);
      if (i * 2 + 1 < food) g.sprite(hunger ? 'food_full_hunger' : 'food_full', x, y, 9, 9);
      else if (i * 2 + 1 === food) g.sprite(hunger ? 'food_half_hunger' : 'food_half', x, y, 9, 9);
    }
    // air
    const eyeWater = p.eyeFluid() === 1;
    if (eyeWater || p.air < 300) {
      const air = Math.min(p.air, 300);
      const full = Math.ceil((air - 2) * 10 / 300), burst = Math.ceil(air * 10 / 300) - full;
      for (let i = 0; i < full + burst; i++) g.sprite(i < full ? 'air' : 'air_bursting', right - i * 8 - 9, top - 10, 9, 9);
    }
  }

  renderChat(W, H, open) {
    const g = this.gui;
    const lines = [];
    for (const m of this.chat) {
      if (!open && m.age >= 200) continue;
      lines.push(m);
      if (lines.length >= (open ? 20 : 10)) break;
    }
    const baseY = H - 40;
    lines.forEach((m, i) => {
      let a = 1;
      if (!open) { const t = 1 - m.age / 200; a = Math.min(1, Math.max(0, t * 10)); a *= a; }
      if (a <= 0.02) return;
      const y = baseY - i * 9;
      g.ctx.globalAlpha = a * 0.5; g.fill(0, y - 1, 320, 9, '#000'); g.ctx.globalAlpha = a;
      g.text(m.text, 2, y, 0xffffff);
      g.ctx.globalAlpha = 1;
    });
  }

  renderDebug(W, H) {
    const g = this.gui, game = this.game, p = game.player, w = game.world;
    const pos = p.pos;
    const bx = Math.floor(pos[0]), by = Math.floor(pos[1]), bz = Math.floor(pos[2]);
    const yaw = ((p.yaw % 360) + 540) % 360 - 180;
    const dirs = ['south', 'west', 'north', 'east'];
    const di = ((Math.round(p.yaw / 90) % 4) + 4) % 4;
    const axis = ['Towards positive Z', 'Towards negative X', 'Towards negative Z', 'Towards positive X'][di];
    const L = w.getLight(bx, by, bz);
    const biome = game.biomes[w.biomeAt(bx, bz)];
    const r = game.renderer;
    const st = w.genStats;
    const left = [
      `Minecraft 1.20.1 (replica/vanilla)`,
      `${game.fps} fps T: inf ${game.settings.shaders ? 'shaders' : 'vsync'} ${game.settings.shaders ? 'fancy' : 'fancy'} clouds`,
      `C: ${r.meshes.size}/${w.chunks.size} D: ${game.settings.renderDistance} pE: ${game.entities.length} quads: ${r.stats.quads}`,
      `Chunk gen ${(st.genMs / Math.max(1, st.gen)).toFixed(1)}ms mesh ${(st.meshMs / Math.max(1, st.mesh)).toFixed(1)}ms`,
      `minecraft:overworld`,
      ``,
      `XYZ: ${pos[0].toFixed(3)} / ${pos[1].toFixed(5)} / ${pos[2].toFixed(3)}`,
      `Block: ${bx} ${by} ${bz} [${bx & 15} ${by & 15} ${bz & 15}]`,
      `Chunk: ${bx >> 4} ${by >> 4} ${bz >> 4}`,
      `Facing: ${dirs[di]} (${axis}) (${yaw.toFixed(1)} / ${p.pitch.toFixed(1)})`,
      `Client Light: ${Math.max(L[0], L[1])} (${L[0]} sky, ${L[1]} block)`,
      `Biome: minecraft:${biome ? biome.name : 'unknown'}`,
      `Local Difficulty: ?? // 0.00 (Day ${w.dayCount})`,
      `Day time: ${Math.floor(w.time)}  Weather: ${game.weather.type}`,
      ``,
      `Debug: Pie [shift]: hidden FPS + TPS [alt]: hidden`,
      `For help: press F3 + Q`,
    ];
    const t = game.target;
    const right = [
      `JavaScript: WebGL2`, `Mem: ${performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + 'MB' : 'n/a'}`,
      `CPU: ${navigator.hardwareConcurrency}x`, ``, `Display: ${r.canvas.width}x${r.canvas.height}`, r.glInfo || '', ``,
    ];
    if (t && !t.entity) {
      const v = w.getBlock(t.x, t.y, t.z);
      right.push(`Targeted Block: ${t.x}, ${t.y}, ${t.z}`, `minecraft:${BLOCKS[v & TYPE_MASK].name}`, `meta: ${v >>> META_SHIFT}`);
    } else if (t && t.entity) right.push(`Targeted Entity`, `minecraft:${t.entity.type}`);
    const draw = (lines, alignRight) => lines.forEach((l, i) => {
      if (!l) return;
      const tw = g.width(l);
      const x = alignRight ? W - 2 - tw : 2, y = 2 + 9 * i;
      g.ctx.fillStyle = 'rgba(80,80,80,0.565)'; g.ctx.fillRect(x - 1, y - 1, tw + 2, 9);
      g.text(l, x, y, 0xe0e0e0, false);
    });
    draw(left, false); draw(right, true);
    void MIN_Y;
  }
}

function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
