// Contenedores (cofres y hornos): contenido, reglas de clic compartidas por cliente (predicción)
// y servidor (autoridad), y la lógica del horno.
import { MAX_MAP_KEY } from './maps';
import { isBundle, fitsInBundle, bundleInsert } from './bundles'; // Fase 6.5 (remate)
import { stackToWire, stackFromWire, type WireStack } from './protocol';
import { ITEMS, BUCKET, LAVA_BUCKET, maxStack, sameKind, isValidItem, type ItemStack } from './items';
import { IRON_ORE, GOLD_ORE, ANCIENT_DEBRIS, NETHER_GOLD_ORE, NETHER_QUARTZ_ORE, isShulkerBox } from './blocks';
import { sanitizeItemData, cloneItemData } from './itemData'; // Fase 6.5 (libros y estandartes)
import { COPPER_ORE, DEEPSLATE_ORE } from './blocks'; // Fase 6.5 (materiales)
import { RAW_IRON, RAW_GOLD, RAW_COPPER } from './items'; // Fase 6.5 (materiales)
import { COAL_ORE, DIAMOND_ORE, EMERALD_ORE, LAPIS_ORE, REDSTONE_ORE } from './blocks'; // Fase 7.6
import { TOOLS, ARMOR, HORSE_ARMOR } from './items';
import { BREW_SLOTS, BREW_TIME, brewCanPlace, brewClick, brewInsert } from './brewing'; // Fase 7 (pociones)

export const CHEST_SLOTS = 27;
export const FURNACE_IN = 0;
export const FURNACE_FUEL = 1;
export const FURNACE_OUT = 2;
/** Segundos por objeto fundido. */
export const COOK_TIME = 10;

/** Fase 7 (pociones): 'brewing', el alambique alquímico (ver brewing.ts). */
export type ContainerKind = 'chest' | 'furnace' | 'brewing';

export interface ContainerState {
  kind: ContainerKind;
  slots: (ItemStack | null)[];
  /** Horno: segundos de combustible restantes y duración del combustible actual (alambique: destilaciones). */
  burn: number;
  burnMax: number;
  /** Horno: progreso de fundición (0..COOK_TIME). Alambique: segundos destilando (0..BREW_TIME). */
  cook: number;
  /** Fase 7 (pociones): alambique, ingrediente con el que empezó la destilación en curso. */
  brewing?: number;
  /** Fase 8.6: caja de shulker (no admite otras cajas de shulker). */
  noBoxes?: boolean;
}

/** Cofre grande (dos mitades de cofre doble). */
export const DOUBLE_CHEST_SLOTS = CHEST_SLOTS * 2;

export function newContainer(kind: ContainerKind, size = kind === 'chest' ? CHEST_SLOTS : kind === 'brewing' ? BREW_SLOTS : 3): ContainerState {
  return { kind, slots: new Array(size).fill(null), burn: 0, burnMax: 0, cook: 0 };
}

/** Tipos de horno: 0 horno, 1 ahumador (sólo comida), 2 alto horno (sólo minerales). */
export type FurnaceVariant = 0 | 1 | 2;
/** Lo que funde el alto horno. */
const BLAST_INPUTS = new Set([IRON_ORE, GOLD_ORE]);
// Fase 6.5 (materiales): también el mineral en bruto y las menas de cobre y de pizarra profunda.
for (const id of [RAW_IRON, RAW_GOLD, RAW_COPPER, COPPER_ORE, DEEPSLATE_ORE[IRON_ORE], DEEPSLATE_ORE[GOLD_ORE], DEEPSLATE_ORE[COPPER_ORE]]) BLAST_INPUTS.add(id);
// Fase 7.6 (auditoría de recetas): también las demás menas y las herramientas y armaduras de metal (dan pepitas).
for (const ore of [COAL_ORE, DIAMOND_ORE, EMERALD_ORE, LAPIS_ORE, REDSTONE_ORE]) BLAST_INPUTS.add(ore).add(DEEPSLATE_ORE[ore]);
for (const mat of ['iron', 'golden', 'copper'] as const) for (const id of [...Object.values(TOOLS[mat]), ...Object.values(ARMOR[mat])]) BLAST_INPUTS.add(id);
for (const id of [...Object.values(ARMOR.chainmail), HORSE_ARMOR.iron, HORSE_ARMOR.golden]) BLAST_INPUTS.add(id);
BLAST_INPUTS.add(ANCIENT_DEBRIS); // Fase 8.5 (lo que da el Nether)
// Las menas del Nether (gold_ingot_from_blasting_nether_gold_ore, quartz_from_blasting).
BLAST_INPUTS.add(NETHER_GOLD_ORE).add(NETHER_QUARTZ_ORE);

/** ¿Funde este horno lo que hay en la entrada? */
export function variantSmelts(variant: FurnaceVariant, input: number): boolean {
  const result = smeltResult(input);
  if (result === undefined) return false;
  if (variant === 1) return !!ITEMS[result]?.food;
  if (variant === 2) return BLAST_INPUTS.has(input);
  return true;
}

export function cloneStack(s: ItemStack | null | undefined): ItemStack | null {
  if (!s || s.count <= 0) return null;
  const c: ItemStack = { id: s.id, count: s.count };
  if (s.dmg) c.dmg = s.dmg;
  if (s.bag?.length) c.bag = s.bag.map((b) => cloneStack(b)).filter((b): b is ItemStack => !!b); // Fase 6.5 (remate)
  if (s.data) c.data = cloneItemData(s.data); // Fase 6.5 (libros y estandartes)
  return c;
}

/** Valida una pila recibida por la red. */
export function sanitizeStack(raw: unknown, inBag = false, inBox = false): ItemStack | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { id?: unknown; count?: unknown; dmg?: unknown; bag?: unknown; data?: unknown };
  const id = Number(r.id), count = Number(r.count), dmg = r.dmg === undefined ? 0 : Number(r.dmg);
  if (!Number.isInteger(id) || !isValidItem(id)) return null;
  if (!Number.isInteger(count) || count < 1 || count > maxStack(id)) return null;
  // El desgaste de las herramientas o, en los mapas, la celda del mundo que muestran.
  if (!Number.isInteger(dmg) || dmg < 0 || dmg > MAX_MAP_KEY) return null;
  const s: ItemStack = { id, count };
  if (dmg > 0) s.dmg = dmg;
  // Fase 8.6: una caja de shulker no va dentro de otra (ni de un saco).
  if ((inBox || inBag) && isShulkerBox(id)) return null;
  // Fase 6.5 (remate): lo que lleva un saco, pila a pila, sin pasarse de su capacidad.
  if (!inBag && isBundle(id) && Array.isArray(r.bag)) {
    const holder: ItemStack = { id, count: 1 };
    for (const b of r.bag.slice(0, 64).reverse()) {
      const inner = sanitizeStack(b, true);
      if (inner && fitsInBundle(inner)) bundleInsert(holder, inner);
    }
    if (holder.bag?.length) s.bag = holder.bag;
  } else if (inBag && isBundle(id)) return null;
  // Fase 6.5 (libros y estandartes): páginas y capas, validadas y acotadas.
  const data = sanitizeItemData(id, r.data);
  if (data) s.data = data;
  // Fase 8.6: lo que lleva la caja de shulker (hasta 27 pilas, cada una en su hueco).
  if (isShulkerBox(id)) {
    const slots = boxContents({ id, count: 1, bag: Array.isArray(r.bag) ? (r.bag as unknown[]).slice(0, 27).map((b) => sanitizeStack(b, false, true)).filter((b): b is ItemStack => !!b) : [], ...(data ? { data } : {}) });
    const packed = packBox(id, slots);
    if (packed.bag) s.bag = packed.bag;
    else delete s.bag;
    if (packed.data?.slots) s.data = { ...(s.data ?? {}), slots: packed.data.slots };
    else if (s.data) {
      delete s.data.slots;
      if (!Object.keys(s.data).length) delete s.data;
    }
  }
  return s;
}

/**
 * Fase 8.6: los 27 huecos de una caja de shulker (lo que lleva en `bag`, cada pila en el hueco que dice
 * `data.slots`; si no lo dice o no cuadra, por orden).
 */
export function boxContents(s: ItemStack | null | undefined): (ItemStack | null)[] {
  const out: (ItemStack | null)[] = new Array(CHEST_SLOTS).fill(null);
  const bag = s?.bag ?? [];
  const slots = s?.data?.slots;
  const ok = !!slots && slots.length === bag.length;
  bag.forEach((b, i) => {
    const at = ok ? slots![i] : out.indexOf(null);
    if (at >= 0 && at < CHEST_SLOTS && !out[at]) out[at] = cloneStack(b);
  });
  return out;
}

/** Fase 8.6: la pila de la caja de shulker `id` con lo que hay en sus huecos (sin nada, una caja vacía). */
export function packBox(id: number, slots: readonly (ItemStack | null)[]): ItemStack {
  const s: ItemStack = { id, count: 1 };
  const bag: ItemStack[] = [], idx: number[] = [];
  slots.forEach((b, i) => {
    const c = cloneStack(b);
    if (c && i < CHEST_SLOTS) {
      bag.push(c);
      idx.push(i);
    }
  });
  if (bag.length) {
    s.bag = bag;
    s.data = { slots: idx };
  }
  return s;
}

export function isFuel(id: number): boolean {
  return (ITEMS[id]?.fuel ?? 0) > 0;
}

export function smeltResult(id: number): number | undefined {
  return ITEMS[id]?.smelt;
}

/** ¿Se puede colocar esta pila en esa ranura? */
export function canPlace(kind: ContainerKind, slot: number, s: ItemStack | null): boolean {
  if (!s) return true;
  if (kind === 'chest') return true;
  if (kind === 'brewing') return brewCanPlace(slot, s); // Fase 7 (pociones)
  if (slot === FURNACE_OUT) return false;
  if (slot === FURNACE_FUEL) return isFuel(s.id);
  return true;
}

/**
 * Clic en una ranura (btn 0 izquierdo, 1 derecho) con `cursor` en la mano.
 * Modifica `c.slots` y devuelve el nuevo cursor. No comparte referencias con la entrada.
 */
export function clickSlot(c: ContainerState, slot: number, btn: number, cursorIn: ItemStack | null): ItemStack | null {
  if (slot < 0 || slot >= c.slots.length) return cloneStack(cursorIn);
  if (c.kind === 'brewing') return brewClick(c, slot, btn, cursorIn); // Fase 7 (pociones): frascos de uno en uno
  let cursor = cloneStack(cursorIn);
  let cur = cloneStack(c.slots[slot]);
  const accept = canPlace(c.kind, slot, cursor) && !(c.noBoxes && cursor && isShulkerBox(cursor.id)); // Fase 8.6
  if (c.kind === 'furnace' && slot === FURNACE_OUT) {
    if (!cur) return cursor;
    if (!cursor) {
      c.slots[slot] = null;
      return cur;
    }
    if (sameKind(cursor, cur) && cursor.count + cur.count <= maxStack(cur.id)) {
      cursor.count += cur.count;
      c.slots[slot] = null;
    }
    return cursor;
  }
  if (btn === 0) {
    if (!cursor) {
      c.slots[slot] = null;
      return cur;
    }
    if (!cur) {
      if (!accept) return cursor;
      c.slots[slot] = cursor;
      return null;
    }
    if (sameKind(cur, cursor)) {
      const n = Math.min(maxStack(cur.id) - cur.count, cursor.count);
      cur.count += n;
      cursor.count -= n;
      c.slots[slot] = cur;
      return cursor.count > 0 ? cursor : null;
    }
    if (!accept) return cursor;
    c.slots[slot] = cursor;
    return cur;
  }
  // Botón derecho.
  if (!cursor) {
    if (!cur) return null;
    const half = Math.ceil(cur.count / 2);
    const take: ItemStack = { ...cur, count: half };
    cur.count -= half;
    c.slots[slot] = cur.count > 0 ? cur : null;
    return take;
  }
  if (!accept) return cursor;
  if (!cur) {
    c.slots[slot] = { ...cursor, count: 1 };
    cursor.count -= 1;
    return cursor.count > 0 ? cursor : null;
  }
  if (sameKind(cur, cursor)) {
    if (cur.count < maxStack(cur.id)) {
      cur.count++;
      cursor.count--;
      c.slots[slot] = cur;
    }
    return cursor.count > 0 ? cursor : null;
  }
  c.slots[slot] = cursor;
  cur = cloneStack(cur);
  return cur;
}

/** Mete una pila en el contenedor (mayúsculas + clic desde el inventario). Devuelve lo que sobra. */
export function insertStack(c: ContainerState, s: ItemStack | null): ItemStack | null {
  if (c.kind === 'brewing') return brewInsert(c, s); // Fase 7 (pociones)
  const rest = cloneStack(s);
  if (!rest) return null;
  if (c.noBoxes && isShulkerBox(rest.id)) return rest; // Fase 8.6: una caja de shulker no va dentro de otra
  const targets: number[] = [];
  if (c.kind === 'chest') for (let i = 0; i < c.slots.length; i++) targets.push(i);
  else {
    if (smeltResult(rest.id) !== undefined) targets.push(FURNACE_IN);
    else if (isFuel(rest.id)) targets.push(FURNACE_FUEL);
    else targets.push(FURNACE_IN);
  }
  // Primero completar pilas iguales, luego huecos libres.
  for (const i of targets) {
    const cur = c.slots[i];
    if (cur && sameKind(cur, rest)) {
      const n = Math.min(maxStack(cur.id) - cur.count, rest.count);
      if (n > 0) {
        c.slots[i] = { ...cur, count: cur.count + n };
        rest.count -= n;
        if (rest.count <= 0) return null;
      }
    }
  }
  for (const i of targets) {
    if (!c.slots[i] && canPlace(c.kind, i, rest)) {
      c.slots[i] = rest;
      return null;
    }
  }
  return rest;
}

/** Saca hasta `max` objetos de una ranura (mayúsculas + clic hacia el inventario). */
export function takeFromSlot(c: ContainerState, slot: number, max: number): ItemStack | null {
  const cur = c.slots[slot];
  if (!cur || max <= 0) return null;
  const n = Math.min(max, cur.count);
  const out: ItemStack = { ...cur, count: n };
  c.slots[slot] = cur.count - n > 0 ? { ...cur, count: cur.count - n } : null;
  return out;
}

/**
 * Avanza el horno dt segundos. Devuelve si cambió el contenido y si está encendido. El ahumador y el
 * alto horno van al doble de velocidad (y gastan el combustible al doble), pero sólo con lo suyo.
 */
export function furnaceTick(c: ContainerState, dt: number, variant: FurnaceVariant = 0): { changed: boolean; lit: boolean } {
  const wasLit = c.burn > 0;
  let changed = false;
  const input = c.slots[FURNACE_IN];
  const out = c.slots[FURNACE_OUT];
  const result = input && variantSmelts(variant, input.id) ? smeltResult(input.id) : undefined;
  const canSmelt = result !== undefined && (!out || (out.id === result && out.count < maxStack(result)));
  if (variant !== 0) dt *= 2;
  if (c.burn > 0) c.burn -= dt;
  if (c.burn <= 0 && canSmelt) {
    const fuel = c.slots[FURNACE_FUEL];
    const secs = fuel ? ITEMS[fuel.id]?.fuel ?? 0 : 0;
    if (fuel && secs > 0) {
      c.burnMax = secs;
      c.burn = Math.max(0, c.burn) + secs;
      if (fuel.id === LAVA_BUCKET) c.slots[FURNACE_FUEL] = { id: BUCKET, count: 1 };
      else c.slots[FURNACE_FUEL] = fuel.count > 1 ? { ...fuel, count: fuel.count - 1 } : null;
      changed = true;
    }
  }
  if (c.burn > 0 && canSmelt) {
    c.cook += dt;
    if (c.cook >= COOK_TIME) {
      c.cook = 0;
      const inp = c.slots[FURNACE_IN]!;
      c.slots[FURNACE_IN] = inp.count > 1 ? { ...inp, count: inp.count - 1 } : null;
      const o = c.slots[FURNACE_OUT];
      c.slots[FURNACE_OUT] = o ? { ...o, count: o.count + 1 } : { id: result!, count: 1 };
      changed = true;
    }
  } else if (c.cook > 0) {
    c.cook = Math.max(0, c.cook - dt * 2);
  }
  if (c.burn < 0) c.burn = 0;
  const lit = c.burn > 0;
  return { changed: changed || lit !== wasLit, lit };
}

/** Serialización compacta para guardar y enviar. */
export interface ContainerWire {
  /** Fase 7 (pociones): 'b', alambique. */
  k: 'c' | 'f' | 'b';
  s: (WireStack | null)[];
  b?: number;
  bm?: number;
  ck?: number;
}

export function containerToWire(c: ContainerState): ContainerWire {
  const w: ContainerWire = {
    k: c.kind === 'chest' ? 'c' : c.kind === 'brewing' ? 'b' : 'f', // Fase 7 (pociones): alambique
    s: c.slots.map((s) => stackToWire(s)), // Fase 6.5: con el contenido de los sacos
  };
  if (c.kind !== 'chest') {
    w.b = Math.round(c.burn * 100) / 100;
    w.bm = c.burnMax;
    w.ck = Math.round(c.cook * 100) / 100;
  }
  return w;
}

export function containerFromWire(w: ContainerWire): ContainerState | null {
  if (!w || (w.k !== 'c' && w.k !== 'f' && w.k !== 'b') || !Array.isArray(w.s)) return null;
  const kind = w.k === 'c' ? 'chest' : w.k === 'b' ? 'brewing' : 'furnace'; // Fase 7 (pociones): alambique
  // Fase 7 (mecanismos): también los de 5 huecos (tolva) y 9 (dispensador y soltador).
  const c = newContainer(kind, w.k === 'c' && [5, 9, DOUBLE_CHEST_SLOTS].includes(w.s.length) ? w.s.length : undefined);
  for (let i = 0; i < c.slots.length; i++) {
    const s = w.s[i];
    c.slots[i] = Array.isArray(s) ? sanitizeStack(stackFromWire(s)) : null;
  }
  if (c.kind !== 'chest') {
    c.burn = Number.isFinite(w.b) ? Math.max(0, w.b!) : 0;
    c.burnMax = Number.isFinite(w.bm) ? Math.max(0, w.bm!) : 0;
    c.cook = Number.isFinite(w.ck) ? Math.max(0, Math.min(c.kind === 'brewing' ? BREW_TIME : COOK_TIME, w.ck!)) : 0;
  }
  return c;
}
