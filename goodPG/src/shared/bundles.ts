// Fase 6.5 (remate): el saco. Guarda pilas de objetos distintos hasta 64 de peso: cada objeto pesa
// 64 / (lo que se apila), así que caben 64 piedras, 16 perlas de ender o una sola herramienta. No se
// meten sacos dentro de sacos. El último que entra es el primero que sale.
import { ITEMS, BUNDLE, DYED_BUNDLES, maxStack, sameKind, type ItemStack } from './items';

export const BUNDLE_CAPACITY = 64;
const BUNDLE_IDS = new Set<number>([BUNDLE, ...Object.values(DYED_BUNDLES)]);

export function isBundle(id: number): boolean {
  return BUNDLE_IDS.has(id);
}

/** Peso de un objeto suelto dentro de un saco. */
export function itemWeight(id: number): number {
  return BUNDLE_CAPACITY / Math.max(1, maxStack(id));
}

/** Peso de lo que lleva el saco. */
export function bagWeight(bag: readonly ItemStack[] | undefined): number {
  let w = 0;
  for (const s of bag ?? []) w += itemWeight(s.id) * s.count;
  return w;
}

/** ¿Se puede meter este objeto en un saco? */
export function fitsInBundle(s: ItemStack | null): boolean {
  return !!s && s.count > 0 && !isBundle(s.id) && !!ITEMS[s.id];
}

/**
 * Mete en el saco todo lo que quepa de la pila; devuelve lo que sobra (o null). El saco se modifica.
 * Se junta con la pila de arriba si es del mismo objeto.
 */
export function bundleInsert(bundle: ItemStack, s: ItemStack | null): ItemStack | null {
  if (!fitsInBundle(s) || !isBundle(bundle.id)) return s;
  const room = Math.floor((BUNDLE_CAPACITY - bagWeight(bundle.bag)) / itemWeight(s!.id) + 1e-9);
  const n = Math.min(room, s!.count);
  if (n <= 0) return s;
  const bag = bundle.bag ?? [];
  const top = bag[0];
  if (top && sameKind(top, s) && top.count + n <= maxStack(s!.id)) top.count += n;
  else {
    const put: ItemStack = { id: s!.id, count: n };
    if (s!.dmg) put.dmg = s!.dmg;
    if (s!.data) put.data = s!.data; // Fase 6.5 (libros y estandartes)
    bag.unshift(put);
  }
  bundle.bag = bag;
  const rest = s!.count - n;
  return rest > 0 ? { ...s!, count: rest } : null;
}

/** Saca la última pila que entró (o null si está vacío). El saco se modifica. */
export function bundleTake(bundle: ItemStack): ItemStack | null {
  const bag = bundle.bag;
  if (!bag || bag.length === 0) return null;
  const out = bag.shift()!;
  if (bag.length === 0) delete bundle.bag;
  return out;
}

/** Saca todo (vaciar el saco usándolo). */
export function bundleEmpty(bundle: ItemStack): ItemStack[] {
  const out = bundle.bag ?? [];
  delete bundle.bag;
  return out;
}
