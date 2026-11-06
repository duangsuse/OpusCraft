// Inventories and stack helpers (vanilla slot semantics).
import { ITEMS } from './items.js';

export const maxStack = (s) => (s && ITEMS[s.id] ? ITEMS[s.id].maxStack : 64);
export const sameItem = (a, b) => a && b && a.id === b.id && (a.damage || 0) === (b.damage || 0) && !ITEMS[a.id]?.durability;
export const cloneStack = (s) => (s ? { id: s.id, count: s.count, damage: s.damage || 0 } : null);

export class Inventory {
  constructor(size) { this.size = size; this.slots = new Array(size).fill(null); this.listeners = []; }
  get(i) { return this.slots[i]; }
  set(i, s) { this.slots[i] = s && s.count > 0 ? s : null; this.changed(); }
  changed() { for (const l of this.listeners) l(this); }
  // add a stack, returns remaining count
  add(stack, order) {
    let left = stack.count;
    const idxs = order || [...Array(this.size).keys()];
    const ms = maxStack(stack);
    for (const i of idxs) {
      const s = this.slots[i];
      if (s && sameItem(s, stack) && s.count < ms) { const n = Math.min(left, ms - s.count); s.count += n; left -= n; if (!left) break; }
    }
    if (left) for (const i of idxs) {
      if (!this.slots[i]) { const n = Math.min(left, ms); this.slots[i] = { id: stack.id, count: n, damage: stack.damage || 0 }; left -= n; if (!left) break; }
    }
    this.changed();
    return left;
  }
  count(id) { let n = 0; for (const s of this.slots) if (s && s.id === id) n += s.count; return n; }
  remove(id, n) {
    for (let i = 0; i < this.size && n > 0; i++) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(n, s.count); s.count -= k; n -= k; if (!s.count) this.slots[i] = null; }
    }
    this.changed();
    return n;
  }
  toJSON() { return this.slots.map(cloneStack); }
  load(arr) { for (let i = 0; i < this.size; i++) this.slots[i] = arr && arr[i] ? cloneStack(arr[i]) : null; this.changed(); }
}

// Player inventory layout: 0-8 hotbar, 9-35 main, 36-39 armor (boots..helmet like vanilla 36=feet), 40 offhand
export class PlayerInventory extends Inventory {
  constructor() { super(41); this.selected = 0; }
  held() { return this.slots[this.selected]; }
  heldDef() { const s = this.held(); return s ? ITEMS[s.id] : null; }
  addItem(stack) {
    const order = [...Array(36).keys()];
    return this.add(stack, order);
  }
  armorValue() {
    let v = 0;
    for (let i = 36; i < 40; i++) { const s = this.slots[i]; if (s && ITEMS[s.id]?.armor) v += ITEMS[s.id].armor.value; }
    return v;
  }
  damageHeld(n = 1) {
    const s = this.held(); if (!s) return false;
    const d = ITEMS[s.id];
    if (!d || !d.durability) return false;
    s.damage = (s.damage || 0) + n;
    if (s.damage >= d.durability) { this.slots[this.selected] = null; this.changed(); return true; }
    this.changed();
    return false;
  }
  consumeHeld(n = 1) {
    const s = this.held(); if (!s) return;
    s.count -= n; if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }
}
