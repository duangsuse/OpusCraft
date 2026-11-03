// Fase 7 (transporte): qué objeto pone cada barca o vagoneta (y cuál suelta al romperse) y los tipos de
// vagoneta. Para una vagoneta nueva (con tolva, con TNT…) basta con registrarla con addCartKind (y darle
// comportamiento en el servidor con CART_BEHAVIORS de sim/server/vehicles.ts y dibujo en el cliente).
import { BOAT_ITEMS, CHEST_BOAT_ITEMS, MINECART, CHEST_MINECART, FURNACE_MINECART } from './items';
import { CHEST, FURNACE } from './blocks';
import { HOPPER_MINECART, TNT_MINECART } from './items'; // Fase 7 (mecanismos)
import { HOPPER, TNT } from './blocks';
import { ENT_HOPPER_MINECART, ENT_TNT_MINECART } from './vehicles';
import {
  BOAT_WOODS, ENT_BOAT, ENT_CHEST_BOAT, ENT_MINECART, ENT_CHEST_MINECART, ENT_FURNACE_MINECART, addCartType, isBoatType,
} from './vehicles';

export interface CartKind {
  type: number;
  /** Objeto que la pone y que suelta al romperse (sin creativo). */
  item: number;
  /** Se monta en ella un jugador o una criatura. */
  rideable: boolean;
  /** Huecos de inventario (0: sin inventario). */
  slots: number;
  /** Bloque que lleva dentro (se dibuja; 0 nada). */
  block: number;
  /** Fase 7 (mecanismos): nombre de la ventana de su inventario. */
  title?: string;
}

export const CART_KINDS: Record<number, CartKind> = {};

export function addCartKind(k: CartKind): void {
  CART_KINDS[k.type] = k;
  addCartType(k.type);
}

addCartKind({ type: ENT_MINECART, item: MINECART, rideable: true, slots: 0, block: 0 });
addCartKind({ type: ENT_CHEST_MINECART, item: CHEST_MINECART, rideable: false, slots: 27, block: CHEST });
addCartKind({ type: ENT_FURNACE_MINECART, item: FURNACE_MINECART, rideable: false, slots: 0, block: FURNACE });
// Fase 7 (mecanismos): con tolva (recoge objetos y los saca de los contenedores de encima) y con dinamita.
addCartKind({ type: ENT_HOPPER_MINECART, item: HOPPER_MINECART, rideable: false, slots: 5, block: HOPPER, title: 'Vagoneta con tolva' });
addCartKind({ type: ENT_TNT_MINECART, item: TNT_MINECART, rideable: false, slots: 0, block: TNT });

/** Qué pone un objeto: tipo de entidad y variante (madera de la barca). null si no es de transporte. */
export function vehicleForItem(item: number): { type: number; variant: number } | null {
  const b = BOAT_WOODS.findIndex((w) => BOAT_ITEMS[w] === item);
  if (b >= 0) return { type: ENT_BOAT, variant: b };
  const c = BOAT_WOODS.findIndex((w) => CHEST_BOAT_ITEMS[w] === item);
  if (c >= 0) return { type: ENT_CHEST_BOAT, variant: c };
  for (const k of Object.values(CART_KINDS)) if (k.item === item) return { type: k.type, variant: 0 };
  return null;
}

/** Objeto de una barca o vagoneta (el que suelta al romperla). */
export function itemForVehicle(type: number, variant: number): number {
  const wood = BOAT_WOODS[Math.max(0, Math.min(BOAT_WOODS.length - 1, variant | 0))];
  if (type === ENT_BOAT) return BOAT_ITEMS[wood];
  if (type === ENT_CHEST_BOAT) return CHEST_BOAT_ITEMS[wood];
  return CART_KINDS[type]?.item ?? 0;
}

/** Huecos del inventario (barca con cofre: 27). */
export function vehicleSlots(type: number): number {
  if (isBoatType(type)) return type === ENT_CHEST_BOAT ? 27 : 0;
  return CART_KINDS[type]?.slots ?? 0;
}

/** Nombre de la ventana del cofre. */
export function vehicleTitle(type: number, variant: number): string {
  return type === ENT_CHEST_BOAT
    ? (variant === BOAT_WOODS.indexOf('bamboo') ? 'Balsa con cofre' : 'Barca con cofre')
    : type === ENT_CHEST_MINECART ? 'Vagoneta con cofre' : CART_KINDS[type]?.title ?? 'Cofre'; // Fase 7 (mecanismos)
}

/** ¿Pueden montarse jugadores o criaturas? */
export function isRideable(type: number): boolean {
  return isBoatType(type) || !!CART_KINDS[type]?.rideable;
}
