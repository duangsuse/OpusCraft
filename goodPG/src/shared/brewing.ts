// Fase 7 (pociones): el alambique alquímico (soporte para pociones). Tres huecos para frascos abajo, el
// ingrediente arriba y el combustible (polvo de blaze, 20 destilaciones cada uno) a la izquierda. Como en
// Minecraft: con combustible y un ingrediente que cambie alguno de los frascos, destila en 20 segundos
// (si se quita el ingrediente o deja de valer, se para); al acabar transforma los frascos y gasta un
// ingrediente. Los huecos de los frascos admiten un solo objeto. Lo usan el servidor (autoridad) y el
// cliente (predicción de los clics).
import { GLASS_BOTTLE, BLAZE_POWDER, maxStack, sameKind, type ItemStack } from './items';
import { brewResult, isBrewIngredient, potionKind } from './potions';
import type { ContainerState } from './containers';

export const BREW_BOTTLES: readonly number[] = [0, 1, 2];
export const BREW_INGREDIENT = 3;
export const BREW_FUEL = 4;
export const BREW_SLOTS = 5;
/** Segundos por destilación y destilaciones por polvo de blaze. */
export const BREW_TIME = 20;
export const BREW_FUEL_USES = 20;

const isBottleSlot = (slot: number) => slot >= 0 && slot < 3;

/** ¿Va en un hueco de frasco? (frascos de cristal, pociones, arrojadizas y persistentes). */
export function isBrewBottle(id: number): boolean {
  const k = potionKind(id);
  return id === GLASS_BOTTLE || (k !== null && k !== 'arrow');
}

/** ¿Se puede dejar esta pila en ese hueco del alambique? */
export function brewCanPlace(slot: number, s: ItemStack | null): boolean {
  if (!s) return true;
  if (isBottleSlot(slot)) return isBrewBottle(s.id);
  if (slot === BREW_INGREDIENT) return isBrewIngredient(s.id);
  if (slot === BREW_FUEL) return s.id === BLAZE_POWDER;
  return false;
}

/** Tope de cada hueco: uno en los de frasco. */
function slotMax(slot: number, id: number): number {
  return isBottleSlot(slot) ? 1 : maxStack(id);
}

const copy = (s: ItemStack | null | undefined): ItemStack | null => (s && s.count > 0 ? { ...s } : null);

/** Clic en un hueco del alambique (btn 0 izquierdo, 1 derecho). Devuelve el cursor nuevo. */
export function brewClick(c: ContainerState, slot: number, btn: number, cursorIn: ItemStack | null): ItemStack | null {
  if (slot < 0 || slot >= c.slots.length) return copy(cursorIn);
  const cursor = copy(cursorIn);
  const cur = copy(c.slots[slot]);
  if (!cursor) {
    if (!cur) return null;
    // Con el cursor vacío: el izquierdo coge todo y el derecho, la mitad.
    const n = btn === 1 ? Math.ceil(cur.count / 2) : cur.count;
    c.slots[slot] = cur.count - n > 0 ? { ...cur, count: cur.count - n } : null;
    return { ...cur, count: n };
  }
  if (!brewCanPlace(slot, cursor)) return cursor;
  const max = slotMax(slot, cursor.id);
  if (!cur) {
    const n = btn === 1 ? 1 : Math.min(max, cursor.count);
    c.slots[slot] = { ...cursor, count: n };
    cursor.count -= n;
    return cursor.count > 0 ? cursor : null;
  }
  if (sameKind(cur, cursor)) {
    const n = Math.min(max - cur.count, btn === 1 ? 1 : cursor.count);
    if (n > 0) {
      c.slots[slot] = { ...cur, count: cur.count + n };
      cursor.count -= n;
    }
    return cursor.count > 0 ? cursor : null;
  }
  // Intercambio (si todo lo del cursor cabe en el hueco).
  if (cursor.count > max) return cursor;
  c.slots[slot] = cursor;
  return cur;
}

/** Mayúsculas + clic desde el inventario: combustible, ingrediente o frascos. Devuelve lo que sobra. */
export function brewInsert(c: ContainerState, s: ItemStack | null): ItemStack | null {
  const rest = copy(s);
  if (!rest) return null;
  const targets: number[] = [];
  // El polvo de blaze va primero al combustible (y lo que sobre, de ingrediente).
  if (rest.id === BLAZE_POWDER) targets.push(BREW_FUEL);
  if (isBrewIngredient(rest.id)) targets.push(BREW_INGREDIENT);
  if (isBrewBottle(rest.id)) targets.push(...BREW_BOTTLES);
  for (const i of targets) {
    const cur = c.slots[i];
    const max = slotMax(i, rest.id);
    if (cur && !sameKind(cur, rest)) continue;
    const n = Math.min(max - (cur?.count ?? 0), rest.count);
    if (n <= 0) continue;
    c.slots[i] = { ...rest, count: (cur?.count ?? 0) + n };
    rest.count -= n;
    if (rest.count <= 0) return null;
  }
  return rest;
}

/** ¿Cambiaría el ingrediente puesto alguno de los frascos? */
export function brewable(c: ContainerState): boolean {
  const ing = c.slots[BREW_INGREDIENT];
  if (!ing) return false;
  return BREW_BOTTLES.some((i) => brewResult(ing.id, c.slots[i]) !== null);
}

/**
 * Avanza el alambique dt segundos (`cook` = segundos destilando, `burn` = destilaciones que le quedan al
 * combustible). `brewing`: ingrediente con que empezó (si cambia, se para). Devuelve si cambió el
 * contenido y si acabó una destilación.
 */
export function brewTick(c: ContainerState, dt: number): { changed: boolean; done: boolean } {
  let changed = false, done = false;
  c.burnMax = BREW_FUEL_USES;
  // Sin combustible: se gasta un polvo de blaze en cuanto lo hay (llena la barra).
  const fuel = c.slots[BREW_FUEL];
  if (c.burn <= 0 && fuel?.id === BLAZE_POWDER) {
    c.burn = BREW_FUEL_USES;
    c.slots[BREW_FUEL] = fuel.count > 1 ? { ...fuel, count: fuel.count - 1 } : null;
    changed = true;
  }
  const ing = c.slots[BREW_INGREDIENT];
  const can = brewable(c);
  if (c.cook > 0) {
    if (!can || ing?.id !== c.brewing) {
      // Se quitó el ingrediente o ya no vale: se para.
      c.cook = 0;
      c.brewing = undefined;
      changed = true;
    } else {
      c.cook += dt;
      if (c.cook >= BREW_TIME) {
        for (const i of BREW_BOTTLES) {
          const out = brewResult(ing!.id, c.slots[i]);
          if (out) c.slots[i] = out;
        }
        c.slots[BREW_INGREDIENT] = ing!.count > 1 ? { ...ing!, count: ing!.count - 1 } : null;
        c.cook = 0;
        c.brewing = undefined;
        changed = done = true;
      }
    }
  } else if (can && c.burn > 0) {
    c.burn -= 1;
    c.cook = dt;
    c.brewing = ing!.id;
    changed = true;
  }
  return { changed, done };
}

/** Huecos de frasco ocupados (bit 0, 1, 2): el bloque los dibuja. */
export function brewBottleMask(c: ContainerState): number {
  let m = 0;
  for (const i of BREW_BOTTLES) if (c.slots[i]) m |= 1 << i;
  return m;
}

/**
 * Lo lleno que está un contenedor (0..15), como lo lee el comparador de Minecraft: 0 si está vacío; si
 * no, 1 + 14 × la media de lo lleno de cada hueco (redondeando hacia abajo).
 */
export function containerFill(c: ContainerState): number {
  let sum = 0, any = false;
  c.slots.forEach((s, i) => {
    if (!s) return;
    any = true;
    sum += s.count / (c.kind === 'brewing' ? slotMax(i, s.id) : maxStack(s.id));
  });
  return any ? Math.floor(1 + (sum / c.slots.length) * 14) : 0;
}

/** Fase 7: lo lleno que está el alambique (para el comparador). */
export const brewingStandFill = containerFill;
