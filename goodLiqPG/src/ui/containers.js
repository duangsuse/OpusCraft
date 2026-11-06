// Container screens with vanilla slot interaction (AbstractContainerMenu.clicked semantics).
import { ITEMS, IID } from '../game/items.js';
import { matchRecipe, SMELTING } from '../game/recipes.js';
import { fuelTime } from '../game/items.js';
import { Inventory, maxStack, sameItem, cloneStack } from '../game/inventory.js';
import { TextField } from './gui.js';

const LABEL = 0x404040;

export class ContainerScreen {
  constructor(game, sprite, w, h) {
    this.game = game; this.sprite = sprite; this.iw = w; this.ih = h;
    this.slots = [];
    this.drag = null; this.pausesGame = false;
    this.title = ''; this.titleX = 8; this.titleY = 6; this.invLabelY = h - 94;
    this.lastClick = { t: 0, slot: null };
  }
  get carried() { return this.game.carried; }
  set carried(s) { this.game.carried = s && s.count > 0 ? s : null; }
  addSlot(x, y, inv, index, opts = {}) { const s = { x, y, inv, index, ...opts }; this.slots.push(s); return s; }
  addPlayerSlots(y0 = 84, hotY = 142) {
    const inv = this.game.inventory;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.addSlot(8 + c * 18, y0 + r * 18, inv, 9 + r * 9 + c, { group: 'main' });
    for (let c = 0; c < 9; c++) this.addSlot(8 + c * 18, hotY, inv, c, { group: 'hotbar' });
  }
  get left() { return Math.floor((this.gui.w - this.iw) / 2); }
  get top() { return Math.floor((this.gui.h - this.ih) / 2); }
  slotAt(mx, my) {
    for (const s of this.slots) if (mx >= this.left + s.x - 1 && mx < this.left + s.x + 17 && my >= this.top + s.y - 1 && my < this.top + s.y + 17) return s;
    return null;
  }
  get(s) { return s.inv.slots[s.index]; }
  set(s, v) { s.inv.set(s.index, v && v.count > 0 ? v : null); this.onSlotChanged(s); }
  onSlotChanged() { }
  mayPlace(s, st) { if (s.result) return false; if (s.accept) return s.accept(st); return true; }
  slotMax(s, st) { return Math.min(maxStack(st), s.maxStack || 64); }

  render(mx, my) {
    const g = this.gui;
    this.renderBackground();
    g.sprite(this.sprite, this.left, this.top, this.iw, this.ih, 0, 0, this.iw, this.ih);
    this.renderBg?.(mx, my);
    const c = g.ctx;
    c.save(); c.translate(this.left, this.top);
    if (this.title) g.text(this.title, this.titleX, this.titleY, LABEL, false);
    if (this.showInvLabel !== false) g.text('Inventory', 8, this.invLabelY, LABEL, false);
    const hover = this.slotAt(mx, my);
    for (const s of this.slots) {
      let st = this.get(s);
      if (this.drag && this.drag.slots.includes(s) && this.drag.slots.length > 1 && this.carried) {
        const add = this.dragAmount(s);
        st = st ? { ...st, count: st.count + add } : { id: this.carried.id, count: add, damage: this.carried.damage };
      }
      if (!st && s.emptyIcon) g.sprite(s.emptyIcon, s.x, s.y, 16, 16);
      if (st) this.game.hud.drawItem(st.id, s.x, s.y, st);
      if (s === hover) { c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(s.x, s.y, 16, 16); }
    }
    this.renderFg?.(mx, my);
    c.restore();
    // carried item
    if (this.carried) {
      let st = this.carried;
      if (this.drag && this.drag.slots.length > 1) { const left = this.dragRemainder(); st = left > 0 ? { ...st, count: left } : null; }
      if (st) { this.game.hud.drawItem(st.id, mx - 8, my - 8, st); }
    } else if (hover && this.get(hover)) {
      const st = this.get(hover);
      const def = ITEMS[st.id];
      const lines = [def ? def.displayName : '?'];
      if (def && def.durability && this.game.showAdvancedTooltips) lines.push(`Durability: ${def.durability - (st.damage || 0)} / ${def.durability}`);
      if (def && def.attackDamage) { lines.push(''); lines.push('§7When in Main Hand:'); lines.push(` §2${(def.attackSpeed || 4).toFixed(1)} Attack Speed`); lines.push(` §2${def.attackDamage} Attack Damage`); }
      if (def && def.armor) { lines.push(''); lines.push('§7When on Body:'); lines.push(` §9+${def.armor.value} Armor`); }
      g.tooltip(lines, mx, my);
    }
  }
  renderBackground() {
    const g = this.gui;
    g.gradient(0, 0, g.w, g.h, 'rgba(16,16,16,0.75)', 'rgba(16,16,16,0.82)');
  }

  dragAmount(s) {
    const d = this.drag, c = this.carried;
    const valid = d.slots.length;
    if (d.button === 0) return Math.floor(c.count / valid) > 0 ? Math.min(Math.floor(c.count / valid), this.slotMax(s, c) - (this.get(s)?.count || 0)) : 0;
    return 1;
  }
  dragRemainder() {
    let left = this.carried.count;
    for (const s of this.drag.slots) left -= this.dragAmount(s);
    return left;
  }

  onMouseDown(mx, my, button, e) {
    const s = this.slotAt(mx, my);
    if (this.onMouseDownExtra && this.onMouseDownExtra(mx, my, button, e)) return;
    const outside = mx < this.left || my < this.top || mx >= this.left + this.iw || my >= this.top + this.ih;
    if (!s) {
      if (outside && this.carried && !this.isOverExtra?.(mx, my)) {
        if (button === 0) { this.game.playerDrop(this.carried); this.carried = null; }
        else if (button === 1) { this.game.playerDrop({ ...this.carried, count: 1 }); this.carried.count--; if (this.carried.count <= 0) this.carried = null; }
      }
      return;
    }
    if (button === 2 && this.game.player.creative) {
      const st = this.get(s);
      if (st && !this.carried) this.carried = { id: st.id, count: maxStack(st), damage: st.damage || 0 };
      return;
    }
    if (e.shiftKey && button === 0) { this.quickMove(s); this.afterChange(); return; }
    // double click: collect
    const now = performance.now();
    if (button === 0 && this.lastClick.slot === s && now - this.lastClick.t < 250 && this.carried && !s.result) {
      this.collectAll(this.carried); this.lastClick = { t: 0, slot: null }; return;
    }
    this.lastClick = { t: now, slot: s };
    if (this.carried && !s.result && (button === 0 || button === 1)) { this.drag = { button, slots: [s], start: s }; return; }
    this.clickSlot(s, button);
  }
  onMouseMove(mx, my) {
    if (!this.drag) return;
    const s = this.slotAt(mx, my);
    if (!s || this.drag.slots.includes(s) || !this.carried) return;
    const st = this.get(s);
    if (s.result || !this.mayPlace(s, this.carried)) return;
    if (st && !sameItem(st, this.carried)) return;
    if (this.drag.slots.length >= this.carried.count && this.drag.button === 0) return;
    if (this.drag.button === 1 && this.drag.slots.length >= this.carried.count) return;
    this.drag.slots.push(s);
  }
  onMouseUp(mx, my, button) {
    const d = this.drag;
    if (!d || d.button !== button) return;
    this.drag = null;
    if (d.slots.length <= 1) { this.clickSlot(d.start, button); return; }
    const c = this.carried;
    let total = c.count;
    const amounts = d.slots.map(s => this.dragAmountFor(d, s, c));
    d.slots.forEach((s, i) => {
      const n = amounts[i]; if (n <= 0) return;
      const st = this.get(s);
      this.set(s, st ? { ...st, count: st.count + n } : { id: c.id, count: n, damage: c.damage || 0 });
      total -= n;
    });
    this.carried = total > 0 ? { ...c, count: total } : null;
    this.afterChange();
  }
  dragAmountFor(d, s, c) {
    const room = this.slotMax(s, c) - (this.get(s)?.count || 0);
    const per = d.button === 0 ? Math.floor(c.count / d.slots.length) : 1;
    return Math.max(0, Math.min(per, room));
  }

  clickSlot(s, button) {
    const st = this.get(s), c = this.carried;
    if (s.result) { this.takeResult(s, false); return; }
    if (button === 0) {
      if (!c) { if (st) { this.carried = st; this.set(s, null); } }
      else if (!st) { if (this.mayPlace(s, c)) { const n = Math.min(c.count, this.slotMax(s, c)); this.set(s, { ...c, count: n }); this.carried = c.count - n > 0 ? { ...c, count: c.count - n } : null; } }
      else if (sameItem(st, c)) { const n = Math.min(c.count, this.slotMax(s, c) - st.count); if (n > 0) { this.set(s, { ...st, count: st.count + n }); this.carried = c.count - n > 0 ? { ...c, count: c.count - n } : null; } }
      else if (this.mayPlace(s, c) && c.count <= this.slotMax(s, c)) { this.set(s, c); this.carried = st; }
    } else if (button === 1) {
      if (!c) { if (st) { const take = Math.ceil(st.count / 2); this.carried = { ...st, count: take }; this.set(s, st.count - take > 0 ? { ...st, count: st.count - take } : null); } }
      else if (!st) { if (this.mayPlace(s, c)) { this.set(s, { ...c, count: 1 }); this.carried = c.count > 1 ? { ...c, count: c.count - 1 } : null; } }
      else if (sameItem(st, c) && st.count < this.slotMax(s, c)) { this.set(s, { ...st, count: st.count + 1 }); this.carried = c.count > 1 ? { ...c, count: c.count - 1 } : null; }
      else if (this.mayPlace(s, c)) { this.set(s, c); this.carried = st; }
    }
    this.afterChange();
  }
  collectAll(c) {
    const ms = maxStack(c);
    for (const pass of [0, 1]) for (const s of this.slots) {
      if (c.count >= ms) break;
      const st = this.get(s);
      if (!st || s.result || !sameItem(st, c)) continue;
      if (pass === 0 && st.count === maxStack(st)) continue;
      const n = Math.min(ms - c.count, st.count);
      c.count += n; this.set(s, st.count - n > 0 ? { ...st, count: st.count - n } : null);
    }
    this.carried = c;
  }
  // move stack into a list of slots (merge then empty)
  moveInto(stack, targets) {
    for (const t of targets) { const st = this.get(t); if (st && sameItem(st, stack) && st.count < this.slotMax(t, st)) { const n = Math.min(stack.count, this.slotMax(t, st) - st.count); this.set(t, { ...st, count: st.count + n }); stack.count -= n; if (!stack.count) return 0; } }
    for (const t of targets) { if (!this.get(t) && this.mayPlace(t, stack)) { const n = Math.min(stack.count, this.slotMax(t, stack)); this.set(t, { ...stack, count: n }); stack.count -= n; if (!stack.count) return 0; } }
    return stack.count;
  }
  quickMove(s) {
    const st = this.get(s);
    if (!st) return;
    if (s.result) { this.takeResult(s, true); return; }
    const targets = this.quickTargets(s, st);
    const copy = { ...st };
    const left = this.moveInto(copy, targets);
    this.set(s, left > 0 ? { ...st, count: left } : null);
  }
  quickTargets(s) {
    const main = this.slots.filter(t => t.group === 'main'), hot = this.slots.filter(t => t.group === 'hotbar');
    const cont = this.slots.filter(t => t.group === 'container');
    if (s.group === 'container' || s.group === 'craft' || s.group === 'armor' || s.group === 'input' || s.group === 'output' || s.group === 'fuel') return [...main, ...hot].reverse();
    if (cont.length) return cont;
    return s.group === 'main' ? hot : main;
  }
  takeResult(s, all) {
    const res = this.get(s);
    if (!res) return;
    let times = 0;
    do {
      const r = this.get(s);
      if (!r) break;
      if (all) {
        const copy = { ...r };
        const left = this.moveInto(copy, [...this.slots.filter(t => t.group === 'hotbar')].reverse().concat([...this.slots.filter(t => t.group === 'main')].reverse()));
        if (left > 0) { if (left !== r.count) { /* partial */ } break; }
      } else {
        const c = this.carried;
        if (c && (!sameItem(c, r) || c.count + r.count > maxStack(c))) return;
        this.carried = c ? { ...c, count: c.count + r.count } : { ...r };
      }
      this.onTakeResult(r);
      times++;
    } while (all && times < 64);
    this.afterChange();
  }
  onTakeResult() { }
  afterChange() { }
  onKey(e) {
    const mx = this.gui.mouse.x, my = this.gui.mouse.y;
    const s = this.slotAt(mx, my);
    if (s && /^Digit[1-9]$/.test(e.code)) {
      const n = +e.code.slice(5) - 1;
      const inv = this.game.inventory;
      const a = this.get(s), b = inv.slots[n];
      if (s.result) return true;
      if (b && !this.mayPlace(s, b)) return true;
      this.set(s, b); inv.set(n, a);
      this.afterChange();
      return true;
    }
    if (s && e.code === 'KeyQ' && !this.carried) {
      const st = this.get(s);
      if (st) { const n = e.ctrlKey ? st.count : 1; this.game.playerDrop({ ...st, count: n }); this.set(s, st.count - n > 0 ? { ...st, count: st.count - n } : null); this.afterChange(); }
      return true;
    }
    return false;
  }
  onClose() {
    if (this.carried) { const left = this.game.inventory.addItem(this.carried); if (left) this.game.playerDrop({ ...this.carried, count: left }); this.carried = null; }
    this.returnGrid?.();
    this.game.closeContainerHook?.(this);
  }
}

// ---- crafting grid helper ----
class CraftingMixin {
  static setup(screen, n, gx, gy, rx, ry) {
    screen.grid = new Inventory(n * n);
    screen.resultInv = new Inventory(1);
    screen.gridN = n;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) screen.addSlot(gx + c * 18, gy + r * 18, screen.grid, r * n + c, { group: 'craft' });
    screen.addSlot(rx, ry, screen.resultInv, 0, { result: true, group: 'result' });
    screen.afterChange = () => CraftingMixin.update(screen);
    screen.onSlotChanged = (s) => { if (s.inv === screen.grid) CraftingMixin.update(screen); };
    screen.onTakeResult = () => {
      for (let i = 0; i < n * n; i++) {
        const st = screen.grid.slots[i];
        if (!st) continue;
        const remain = ITEMS[st.id]?.name === 'milk_bucket' || ITEMS[st.id]?.name === 'water_bucket' || ITEMS[st.id]?.name === 'lava_bucket' ? { id: IID.bucket, count: 1 } : null;
        st.count--;
        screen.grid.slots[i] = st.count > 0 ? st : remain;
      }
      screen.game.audio?.play('random.click', { volume: 0.0 });
      CraftingMixin.update(screen);
    };
    screen.returnGrid = () => {
      for (let i = 0; i < n * n; i++) { const st = screen.grid.slots[i]; if (st) { const left = screen.game.inventory.addItem(st); if (left) screen.game.playerDrop({ ...st, count: left }); screen.grid.slots[i] = null; } }
    };
  }
  static update(screen) {
    const m = matchRecipe(screen.grid.slots, screen.gridN);
    screen.resultInv.slots[0] = m ? { id: m.out, count: m.count, damage: 0 } : null;
  }
}

export class InventoryScreen extends ContainerScreen {
  constructor(game) {
    super(game, 'inventory', 176, 166);
    this.title = 'Crafting'; this.titleX = 97; this.titleY = 8; this.showInvLabel = false;
    const inv = game.inventory;
    const armorIcons = ['empty_armor_slot_helmet', 'empty_armor_slot_chestplate', 'empty_armor_slot_leggings', 'empty_armor_slot_boots'];
    for (let i = 0; i < 4; i++) this.addSlot(8, 8 + i * 18, inv, 39 - i, { group: 'armor', maxStack: 1, emptyIcon: armorIcons[i], accept: (st) => ITEMS[st.id]?.armor?.slot === i });
    this.addSlot(77, 62, inv, 40, { group: 'offhand', emptyIcon: 'empty_slot_shield' });
    CraftingMixin.setup(this, 2, 98, 18, 154, 28);
    this.addPlayerSlots();
  }
  quickTargets(s, st) {
    const main = this.slots.filter(t => t.group === 'main'), hot = this.slots.filter(t => t.group === 'hotbar');
    const armor = this.slots.filter(t => t.group === 'armor');
    if (s.group === 'main' || s.group === 'hotbar') {
      const a = ITEMS[st.id]?.armor;
      if (a) { const t = armor.find(x => x.accept(st)); if (t && !this.get(t)) return [t]; }
      return s.group === 'main' ? hot : main;
    }
    return [...main, ...hot];
  }
  renderBg() {
    // player preview
    const pv = this.game.playerPreview?.(this.gui.mouse.x - (this.left + 51), this.gui.mouse.y - (this.top + 75 - 50));
    if (pv) this.gui.ctx.drawImage(pv, this.left + 26, this.top + 8, 49, 70);
  }
}

export class CraftingScreen extends ContainerScreen {
  constructor(game) {
    super(game, 'crafting_table', 176, 166);
    this.title = 'Crafting'; this.titleX = 29; this.titleY = 6;
    CraftingMixin.setup(this, 3, 30, 17, 124, 35);
    this.addPlayerSlots();
  }
}

export class ChestScreen extends ContainerScreen {
  constructor(game, inv, title = 'Chest') {
    super(game, 'generic_27', 176, 168);
    this.title = title;
    this.invLabelY = 168 - 94;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.addSlot(8 + c * 18, 18 + r * 18, inv, r * 9 + c, { group: 'container' });
    this.addPlayerSlots(85, 143);
  }
  quickTargets(s) {
    if (s.group === 'container') return [...this.slots.filter(t => t.group === 'hotbar')].reverse().concat([...this.slots.filter(t => t.group === 'main')].reverse()).reverse();
    return this.slots.filter(t => t.group === 'container');
  }
}

export class FurnaceScreen extends ContainerScreen {
  constructor(game, be) {
    super(game, 'furnace', 176, 166);
    this.be = be;
    this.title = 'Furnace';
    this.addSlot(56, 17, be.inv, 0, { group: 'input' });
    this.addSlot(56, 53, be.inv, 1, { group: 'fuel', accept: (st) => fuelTime(st.id) > 0 || ITEMS[st.id]?.name === 'bucket' });
    this.addSlot(116, 35, be.inv, 2, { group: 'output', accept: () => false });
    this.addPlayerSlots();
  }
  render(mx, my) { this.titleX = Math.floor((176 - this.gui.width(this.title)) / 2); super.render(mx, my); }
  renderFg() {
    const g = this.gui, be = this.be;
    if (be.burn > 0) {
      const h = Math.ceil(be.burn / Math.max(1, be.burnMax) * 13) + 1;
      g.sprite('furnace_lit_progress', 56, 36 + 14 - h, 14, h, 0, 14 - h, 14, h);
    }
    const w = Math.ceil(be.cook / 200 * 24);
    if (w > 0) g.sprite('furnace_burn_progress', 79, 34, w, 17, 0, 0, w, 17);
  }
  quickTargets(s, st) {
    const main = this.slots.filter(t => t.group === 'main'), hot = this.slots.filter(t => t.group === 'hotbar');
    if (s.group === 'main' || s.group === 'hotbar') {
      if (SMELTING.has(st.id)) return this.slots.filter(t => t.group === 'input');
      if (fuelTime(st.id) > 0) return this.slots.filter(t => t.group === 'fuel');
      return s.group === 'main' ? hot : main;
    }
    return [...main, ...hot];
  }
  takeResult() { }
}

// ---- Creative inventory ----------------------------------------------------------------------------
const TABS = [
  { id: 'building', name: 'Building Blocks', icon: 'bricks', row: 0 },
  { id: 'colored', name: 'Colored Blocks', icon: 'cyan_wool', row: 0 },
  { id: 'natural', name: 'Natural Blocks', icon: 'grass_block', row: 0 },
  { id: 'functional', name: 'Functional Blocks', icon: 'crafting_table', row: 0 },
  { id: 'redstone', name: 'Redstone Blocks', icon: 'redstone', row: 0 },
  { id: 'search', name: 'Search Items', icon: 'compass', row: 0, right: true },
  { id: 'tools', name: 'Tools & Utilities', icon: 'diamond_pickaxe', row: 1 },
  { id: 'combat', name: 'Combat', icon: 'diamond_sword', row: 1 },
  { id: 'food', name: 'Food & Drinks', icon: 'golden_apple', row: 1 },
  { id: 'ingredients', name: 'Ingredients', icon: 'iron_ingot', row: 1 },
  { id: 'transport', name: 'Transportation', icon: 'minecart', row: 1 },
  { id: 'inventory', name: 'Survival Inventory', icon: 'chest', row: 1, right: true },
];

export class CreativeScreen extends ContainerScreen {
  constructor(game) {
    super(game, 'creative_inventory', 195, 136);
    this.showInvLabel = false;
    this.tab = game.lastCreativeTab || 'building';
    this.scroll = 0;
    this.gridInv = new Inventory(45);
    this.search = new TextField(82, 6, 89, 9, '', { max: 50 });
    this.buildTab();
  }
  itemsFor(tab) {
    const out = [];
    for (const it of ITEMS) {
      if (!it || it.category === 'hidden') continue;
      if (tab === 'search') { const q = this.search.value.toLowerCase(); if (!q || it.displayName.toLowerCase().includes(q)) out.push(it.id); continue; }
      const cat = it.category === 'transport' ? 'transport' : it.category;
      if (cat === tab) out.push(it.id);
    }
    return out;
  }
  buildTab() {
    this.slots = [];
    const inv = this.game.inventory;
    if (this.tab === 'inventory') {
      this.sprite = 'creative_inventory_survival';
      const armor = 39;
      for (let i = 0; i < 4; i++) this.addSlot(54 + Math.floor(i / 2) * 54, 6 + (i % 2) * 27, inv, armor - i, { group: 'armor' });
      this.addSlot(35, 20, inv, 40, { group: 'offhand' });
      for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) this.addSlot(9 + c * 18, 54 + r * 18, inv, 9 + r * 9 + c, { group: 'main' });
      for (let c = 0; c < 9; c++) this.addSlot(9 + c * 18, 112, inv, c, { group: 'hotbar' });
      this.trash = { x: 173, y: 112 };
    } else {
      this.sprite = 'creative_inventory';
      this.list = this.itemsFor(this.tab);
      this.rows = Math.ceil(this.list.length / 9);
      this.fillGrid();
      for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) this.addSlot(9 + c * 18, 18 + r * 18, this.gridInv, r * 9 + c, { group: 'creative', creative: true });
      for (let c = 0; c < 9; c++) this.addSlot(9 + c * 18, 112, inv, c, { group: 'hotbar' });
      this.trash = null;
    }
  }
  fillGrid() {
    const maxScroll = Math.max(0, this.rows - 5);
    const row = Math.round(this.scroll * maxScroll);
    for (let i = 0; i < 45; i++) {
      const id = this.list[row * 9 + i];
      this.gridInv.slots[i] = id !== undefined ? { id, count: 1, damage: 0 } : null;
    }
  }
  onWheel(d) { const max = Math.max(1, this.rows - 5); this.scroll = Math.max(0, Math.min(1, this.scroll + d / max)); this.fillGrid(); }
  tabRect(t) {
    const idxInRow = TABS.filter(x => x.row === t.row && !x.right).indexOf(t);
    const x = this.left + (t.right ? 195 - 28 : idxInRow * 29);
    const y = t.row === 0 ? this.top - 28 : this.top + 136 - 4;
    return [x, y, 26, 32];
  }
  isOverExtra(mx, my) { for (const t of TABS) { const [x, y, w, h] = this.tabRect(t); if (mx >= x && my >= y && mx < x + w && my < y + h) return true; } return false; }
  onMouseDownExtra(mx, my, button, e) {
    for (const t of TABS) {
      const [x, y, w, h] = this.tabRect(t);
      if (mx >= x && my >= y && mx < x + w && my < y + h) { this.tab = t.id; this.game.lastCreativeTab = t.id; this.scroll = 0; this.buildTab(); this.search.focused = t.id === 'search'; return true; }
    }
    // scrollbar
    const sx = this.left + 175, sy = this.top + 18;
    if (this.tab !== 'inventory' && mx >= sx && mx < sx + 14 && my >= sy && my < sy + 112) { this.draggingScroll = true; this.onMouseMove(mx, my); return true; }
    if (this.trash && mx >= this.left + this.trash.x && mx < this.left + this.trash.x + 16 && my >= this.top + this.trash.y && my < this.top + this.trash.y + 16) {
      if (this.carried) this.carried = null;
      else if (e.shiftKey) for (let i = 0; i < 41; i++) this.game.inventory.set(i, null);
      return true;
    }
    const s = this.slotAt(mx, my);
    if (s && s.creative) {
      const st = this.get(s);
      if (button === 0 || button === 2) {
        if (this.carried) { if (st && sameItem(this.carried, st) && this.carried.count < maxStack(this.carried)) this.carried.count++; else this.carried = null; }
        else if (st) {
          if (e.shiftKey) { this.game.inventory.addItem({ id: st.id, count: maxStack(st) }); }
          else this.carried = { id: st.id, count: maxStack(st), damage: 0 };
        }
      } else if (button === 1) {
        if (this.carried) this.carried = null; else if (st) this.carried = { id: st.id, count: 1, damage: 0 };
      }
      return true;
    }
    if (!s && this.carried && !(mx < this.left || my < this.top || mx >= this.left + this.iw || my >= this.top + this.ih)) return true;
    return false;
  }
  onMouseMove(mx, my) {
    if (this.draggingScroll) { this.scroll = Math.max(0, Math.min(1, (my - this.top - 18 - 7.5) / (112 - 15))); this.fillGrid(); return; }
    super.onMouseMove(mx, my);
  }
  onMouseUp(mx, my, b) { this.draggingScroll = false; super.onMouseUp(mx, my, b); }
  onKey(e) {
    if (this.tab === 'search' && this.search.focused) {
      if (e.code === 'Escape') return false;
      if (this.search.key(e)) { this.list = this.itemsFor('search'); this.rows = Math.ceil(this.list.length / 9); this.scroll = 0; this.fillGrid(); }
      return true;
    }
    if (e.code === 'KeyT' && this.tab !== 'search') { this.tab = 'search'; this.buildTab(); this.search.focused = true; return true; }
    return super.onKey(e);
  }
  render(mx, my) {
    const g = this.gui;
    this.renderBackground();
    // unselected tabs first
    for (const t of TABS) if (t.id !== this.tab) this.drawTab(t, false);
    g.sprite(this.sprite, this.left, this.top, this.iw, this.ih, 0, 0, this.iw, this.ih);
    if (this.tab === 'search') { this.search.x = this.left + 82; this.search.y = this.top + 6; this.drawSearch(); }
    const tab = TABS.find(t => t.id === this.tab);
    if (this.tab !== 'search') g.text(tab.name, this.left + 8, this.top + 6, LABEL, false);
    // scrollbar
    if (this.tab !== 'inventory') g.sprite(this.rows > 5 ? 'creative_scroller' : 'creative_scroller_disabled', this.left + 175, this.top + 18 + Math.round(this.scroll * (112 - 17)), 12, 15);
    this.drawTab(tab, true);
    if (this.tab === 'inventory') {
      const pv = this.game.playerPreview?.(mx - (this.left + 88), my - (this.top + 45 - 30));
      if (pv) g.ctx.drawImage(pv, this.left + 73, this.top + 6, 32, 43);
    }
    // slots & carried via base (without the base background/panel)
    const savedSprite = this.sprite;
    this.sprite = null;
    const bg = this.renderBackground; this.renderBackground = () => { };
    super.render(mx, my);
    this.renderBackground = bg; this.sprite = savedSprite;
    // tab tooltip
    for (const t of TABS) { const [x, y, w, h] = this.tabRect(t); if (mx >= x && my >= y && mx < x + w && my < y + h && !this.carried) g.tooltip([t.name], mx, my); }
  }
  drawSearch() { this.gui.fill(this.search.x - 1, this.search.y - 1, 90, 11, '#000'); this.gui.text(this.search.value + (this.search.focused && (Date.now() >> 9) % 2 ? '_' : ''), this.search.x + 1, this.search.y + 1, 0xffffff); }
  drawTab(t, sel) {
    const g = this.gui;
    const [x, y] = this.tabRect(t);
    const idx = TABS.filter(q => q.row === t.row && !q.right).indexOf(t);
    const sprite = sel ? (idx === 0 ? 'creative_tab_top_selected_1' : 'creative_tab_top_selected') : 'creative_tab_top_unselected';
    const c = g.ctx;
    if (t.row === 1) { c.save(); c.translate(x, y + 32); c.scale(1, -1); g.sprite(sprite, 0, 0, 26, 32); c.restore(); }
    else g.sprite(sprite, x, y, 26, 32);
    const iid = IID[t.icon];
    if (iid !== undefined) this.game.hud.drawItem(iid, x + 5, y + (t.row === 0 ? 9 : 7));
  }
}
export { cloneStack };
