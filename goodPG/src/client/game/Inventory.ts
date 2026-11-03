// Inventario del jugador: 36 ranuras (0–8 barra rápida, 9–35 mochila), la mano secundaria, la pila
// del cursor y la armadura puesta (4 ranuras).
import { ITEMS, maxStack, sameKind, isValidItem, type ItemStack } from '../../shared/items';
import { stackToWire, stackFromWire, type WireStack } from '../../shared/protocol';
import { cloneStack } from '../../shared/containers';
import { ARMOR_SLOTS, ARMOR_KNOCKBACK_RESISTANCE } from '../../shared/armor';
import { UNBREAKING, BINDING_CURSE, enchLevel } from '../../shared/enchantments'; // Fase 7 (encantamientos)
import { unbreakingSaves } from '../../shared/enchantEffects';

export const INV_SIZE = 36;
export const HOTBAR = 9;
/** Índice de la mano secundaria para get/set/consume/wear (no está en `slots`). */
export const OFFHAND = 40;

/** Ranura de armadura del objeto (−1 si no es armadura). */
export function armorSlotOf(id: number): number {
  return ITEMS[id]?.armor?.slot ?? -1;
}

/** Usos antes de romperse (herramientas y armaduras; 0 si no se desgasta). */
function durabilityOf(id: number): number {
  const def = ITEMS[id];
  return def?.tool ? def.tool.durability : def?.armor?.durability ?? 0;
}

export class Inventory {
  slots: (ItemStack | null)[] = new Array(INV_SIZE).fill(null);
  cursor: ItemStack | null = null;
  /** Armadura puesta: [cabeza, pecho, piernas, pies]. */
  armor: (ItemStack | null)[] = new Array(ARMOR_SLOTS).fill(null);
  /** Mano secundaria (escudo, antorcha, comida…). */
  offhand: ItemStack | null = null;
  /** Aumenta con cada cambio (para refrescar la interfaz y guardar). */
  version = 0;

  changed(): void {
    this.version++;
  }

  get(i: number): ItemStack | null {
    return i === OFFHAND ? this.offhand : this.slots[i] ?? null;
  }

  set(i: number, s: ItemStack | null): void {
    const v = s && s.count > 0 ? s : null;
    if (i === OFFHAND) this.offhand = v;
    else this.slots[i] = v;
    this.changed();
  }

  /** Intercambia la ranura i (barra o mochila) con la mano secundaria (tecla F). */
  swapOffhand(i: number): void {
    if (i < 0 || i >= INV_SIZE) return;
    const s = this.slots[i];
    this.slots[i] = this.offhand;
    this.offhand = s;
    this.changed();
  }

  /** Cuántos objetos de esta pila caben. */
  room(s: ItemStack): number {
    let n = 0;
    const max = maxStack(s.id);
    for (const cur of this.slots) {
      if (!cur) n += max;
      else if (sameKind(cur, s)) n += Math.max(0, max - cur.count);
      if (n >= s.count) return s.count;
    }
    return Math.min(n, s.count);
  }

  /**
   * Añade una pila: primero completa pilas iguales (barra y luego mochila) y después ocupa
   * huecos (barra primero). Devuelve lo que no cupo.
   */
  add(stack: ItemStack | null, preferSlot = -1): ItemStack | null {
    const rest = cloneStack(stack);
    if (!rest) return null;
    const max = maxStack(rest.id);
    for (let i = 0; i < INV_SIZE && rest.count > 0; i++) {
      const cur = this.slots[i];
      if (cur && sameKind(cur, rest) && cur.count < max) {
        const n = Math.min(max - cur.count, rest.count);
        cur.count += n;
        rest.count -= n;
      }
    }
    if (rest.count > 0 && preferSlot >= 0 && !this.slots[preferSlot]) {
      const n = Math.min(max, rest.count);
      this.slots[preferSlot] = { ...rest, count: n };
      rest.count -= n;
    }
    for (let i = 0; i < INV_SIZE && rest.count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, rest.count);
        this.slots[i] = { ...rest, count: n };
        rest.count -= n;
      }
    }
    this.changed();
    return rest.count > 0 ? rest : null;
  }

  /** Añade en un rango de ranuras (para mayúsculas + clic entre barra y mochila). */
  addRange(stack: ItemStack, from: number, to: number): ItemStack | null {
    const rest = { ...stack };
    const max = maxStack(rest.id);
    for (let i = from; i < to && rest.count > 0; i++) {
      const cur = this.slots[i];
      if (cur && sameKind(cur, rest) && cur.count < max) {
        const n = Math.min(max - cur.count, rest.count);
        cur.count += n;
        rest.count -= n;
      }
    }
    for (let i = from; i < to && rest.count > 0; i++) {
      if (!this.slots[i]) {
        const n = Math.min(max, rest.count);
        this.slots[i] = { ...rest, count: n };
        rest.count -= n;
      }
    }
    this.changed();
    return rest.count > 0 ? rest : null;
  }

  count(id: number, match?: (s: ItemStack) => boolean): number {
    const ok = (s: ItemStack | null): s is ItemStack => !!s && s.id === id && (!match || match(s));
    let n = ok(this.offhand) ? this.offhand.count : 0;
    for (const s of this.slots) if (ok(s)) n += s.count;
    return n;
  }

  /** Quita n objetos del tipo id (primero de la mano secundaria y luego de la mochila). Devuelve cuántos quitó. */
  remove(id: number, n: number, match?: (s: ItemStack) => boolean): number {
    let left = n;
    const off = this.offhand;
    if (off && off.id === id && (!match || match(off))) {
      const k = Math.min(left, off.count);
      off.count -= k;
      left -= k;
      if (off.count <= 0) this.offhand = null;
    }
    for (let i = INV_SIZE - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (!s || s.id !== id || (match && !match(s))) continue;
      const k = Math.min(left, s.count);
      s.count -= k;
      left -= k;
      if (s.count <= 0) this.slots[i] = null;
    }
    this.changed();
    return n - left;
  }

  /** Gasta objetos de una ranura. */
  consume(i: number, n = 1): void {
    const s = this.get(i);
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.set(i, null);
    this.changed();
  }

  /** Desgasta la herramienta (o la pieza de armadura) de una ranura. Devuelve true si se rompió. */
  wear(i: number, amount = 1): boolean {
    const s = this.get(i);
    if (!s || !this.wearStack(s, amount)) return false;
    this.set(i, null);
    return true;
  }

  /** Suma desgaste a una pila; true si llegó a su durabilidad (se rompe). */
  wearStack(s: ItemStack, amount: number): boolean {
    const dur = durabilityOf(s.id);
    if (dur <= 0) return false;
    // Fase 7 (encantamientos): Irrompibilidad se libra de cada punto de desgaste con su probabilidad.
    const unb = enchLevel(s, UNBREAKING);
    if (unb > 0) {
      const armor = !!ITEMS[s.id]?.armor;
      let n = 0;
      for (let k = 0; k < amount; k++) if (!unbreakingSaves(unb, armor, Math.random)) n++;
      amount = n;
      if (amount <= 0) return false;
    }
    s.dmg = (s.dmg ?? 0) + amount;
    this.changed();
    return s.dmg >= dur;
  }

  /** Vacía el inventario (el cursor y la armadura) y devuelve todo lo que había. */
  takeAll(): ItemStack[] {
    const out: ItemStack[] = [];
    for (let i = 0; i < INV_SIZE; i++) {
      if (this.slots[i]) out.push(this.slots[i]!);
      this.slots[i] = null;
    }
    if (this.cursor) out.push(this.cursor);
    this.cursor = null;
    if (this.offhand) out.push(this.offhand);
    this.offhand = null;
    for (let k = 0; k < ARMOR_SLOTS; k++) {
      if (this.armor[k]) out.push(this.armor[k]!);
      this.armor[k] = null;
    }
    this.changed();
    return out;
  }

  // ---------------------------------------------------------------- armadura

  /** Puntos de armadura de lo puesto (medias corazas del HUD). */
  armorPoints(): number {
    let n = 0;
    for (const s of this.armor) if (s) n += ITEMS[s.id]?.armor?.points ?? 0;
    return n;
  }

  /** Dureza total de lo puesto. */
  armorToughness(): number {
    let n = 0;
    for (const s of this.armor) if (s) n += ITEMS[s.id]?.armor?.toughness ?? 0;
    return n;
  }

  /** Fase 8.5: resistencia al empuje de lo puesto (0,1 por pieza de netherita; como mucho 1). */
  knockbackResistance(): number {
    let n = 0;
    for (const s of this.armor) {
      const m = s ? ITEMS[s.id]?.armor?.material : undefined;
      if (m) n += ARMOR_KNOCKBACK_RESISTANCE[m] ?? 0;
    }
    return Math.min(1, n);
  }

  /** Desgasta cada pieza puesta. Devuelve cuántas se rompieron (desaparecen). */
  wearArmor(amount: number): number {
    let broken = 0;
    for (let k = 0; k < ARMOR_SLOTS; k++) {
      const s = this.armor[k];
      if (s && ITEMS[s.id]?.armor?.material === 'elytra') continue; // Fase 8.6: los élitros no se gastan con los golpes
      if (s && this.wearStack(s, amount)) {
        this.armor[k] = null;
        broken++;
      }
    }
    return broken;
  }

  /**
   * Pone una unidad de la pieza s en su ranura y devuelve la que había (o null). Si s no es
   * armadura no hace nada y la devuelve tal cual.
   */
  equip(s: ItemStack): ItemStack | null {
    const k = armorSlotOf(s.id);
    if (k < 0) return s;
    const prev = this.armor[k];
    this.armor[k] = { ...s, count: 1 };
    this.changed();
    return prev;
  }

  /**
   * Se pone la pieza de la ranura i del inventario. Con swap la que había ocupa su lugar; sin él
   * (mayúsculas + clic) sólo si su ranura de armadura está libre. Devuelve true si se la puso.
   */
  equipFromSlot(i: number, swap: boolean): boolean {
    const s = this.slots[i];
    const k = s ? armorSlotOf(s.id) : -1;
    if (!s || k < 0 || (!swap && this.armor[k])) return false;
    const prev = this.equip(s);
    s.count--;
    if (s.count <= 0) this.slots[i] = prev;
    else if (prev) this.add(prev);
    this.changed();
    return true;
  }

  /** Fase 7 (encantamientos): ¿lleva la pieza de la ranura k la Maldición de ligamiento? (no se quita). */
  armorBound(k: number): boolean {
    return enchLevel(this.armor[k], BINDING_CURSE) > 0;
  }

  /** Quita la pieza de la ranura k y la guarda en el inventario (si cabe). */
  unequip(k: number): boolean {
    const s = this.armor[k];
    if (!s || this.room(s) < s.count) return false;
    this.armor[k] = null;
    this.add(s);
    return true;
  }

  /** Clic en una ranura de armadura: coge la pieza, deja la del cursor o las intercambia. */
  clickArmor(k: number): void {
    const cur = this.cursor;
    // Sólo acepta la pieza que corresponde (las armaduras no se apilan: el cursor lleva una).
    if (cur && armorSlotOf(cur.id) !== k) return;
    this.cursor = this.armor[k];
    this.armor[k] = cur;
    this.changed();
  }

  /** Ids de la armadura puesta (0 = nada), para la red. */
  armorIds(): number[] {
    return this.armor.map((s) => s?.id ?? 0);
  }

  armorToWire(): (WireStack | null)[] {
    return this.armor.map((s) => stackToWire(s));
  }

  armorFromWire(w: (WireStack | null)[] | undefined): void {
    this.armor = new Array(ARMOR_SLOTS).fill(null);
    if (Array.isArray(w)) {
      for (let i = 0; i < Math.min(ARMOR_SLOTS, w.length); i++) {
        const s = stackFromWire(w[i]);
        if (s && isValidItem(s.id) && ITEMS[s.id]?.armor?.slot === i) this.armor[i] = { ...s, count: 1 };
      }
    }
    this.changed();
  }

  offhandToWire(): WireStack | null {
    return stackToWire(this.offhand);
  }

  offhandFromWire(w: WireStack | null | undefined): void {
    const s = w ? stackFromWire(w) : null;
    this.offhand = s && isValidItem(s.id) && s.count > 0 ? { ...s, count: Math.min(s.count, maxStack(s.id)) } : null;
    this.changed();
  }

  toWire(): (WireStack | null)[] {
    const out = this.slots.map((s) => stackToWire(s));
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  }

  fromWire(w: (WireStack | null)[] | undefined): void {
    this.slots = new Array(INV_SIZE).fill(null);
    if (Array.isArray(w)) {
      for (let i = 0; i < Math.min(INV_SIZE, w.length); i++) {
        const s = stackFromWire(w[i]);
        if (s && isValidItem(s.id) && s.count > 0) this.slots[i] = { ...s, count: Math.min(s.count, maxStack(s.id)) };
      }
    }
    this.cursor = null;
    this.changed();
  }
}
