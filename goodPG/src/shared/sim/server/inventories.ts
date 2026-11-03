// Fase 7 (mecanismos): lo que tolvas, soltadores y vagonetas con tolva saben meter y sacar de lo que tienen
// al lado, con las reglas de Minecraft por cara:
// - cofres (también dobles y trampa), barriles, tolvas, dispensadores, soltadores y vagonetas con cofre o
//   con tolva: cualquier hueco;
// - hornos (y ahumadores y altos hornos): por arriba, lo que se funde; por los lados, el combustible; por
//   abajo sale lo fundido (y los cubos vacíos del combustible);
// - soporte para pociones: por arriba, el ingrediente; por los lados, frascos y polvo de blaze; por abajo
//   salen los frascos cuando ya no hay nada que destilar;
// - compostador: por arriba se composta; por abajo sale el polvo de hueso cuando está listo;
// - tocadiscos: entra un disco si está vacío; estantería cincelada: entran y salen libros.
// La `face` de cada operación es la cara del inventario por la que entra o sale (0 +X … 5 −Z, como api.ts).
import {
  COMPOSTER, familyBase, isJukebox, isChiseledShelf, isContainer,
} from '../../blocks';
import { BUCKET, WATER_BUCKET, BONE_MEAL, maxStack, sameKind, type ItemStack } from '../../items';
import { composterLevel, COMPOSTER_READY } from '../../composting';
import { FURNACE_IN, FURNACE_FUEL, FURNACE_OUT, isFuel, type ContainerState } from '../../containers';
import { BREW_INGREDIENT, BREW_FUEL, BREW_BOTTLES, brewCanPlace, brewable } from '../../brewing';
import { vehicleContainerPos, ENT_CHEST_MINECART, ENT_HOPPER_MINECART } from '../../vehicles';
import { UP, DOWN } from '../../redstone';
import { ENT_ITEM } from '../../mobs';
import { posKey } from '../posKey';
import type { ContainerSystem } from './containerSystem';
import type { Composters } from './composters';
import type { Collections } from './collections';
import type { Shelves } from './shelves';
import type { Entity } from '../entities';
import type { ServerContext } from './context';

const ALL5 = [0, 1, 2, 3, 4];

/** Huecos de un contenedor por los que entra algo por la cara `face`. */
function insertSlots(c: ContainerState, face: number): number[] {
  if (c.kind === 'furnace') return face === UP ? [FURNACE_IN] : face === DOWN ? [FURNACE_OUT, FURNACE_FUEL] : [FURNACE_FUEL];
  if (c.kind === 'brewing') return face === UP ? [BREW_INGREDIENT] : face === DOWN ? [...BREW_BOTTLES, BREW_INGREDIENT] : [...BREW_BOTTLES, BREW_FUEL];
  return c.slots.length === 5 ? ALL5 : c.slots.map((_, i) => i);
}

/** Huecos por los que sale algo por la cara `face`. */
function extractSlots(c: ContainerState, face: number): number[] {
  if (c.kind === 'furnace') return face === UP ? [FURNACE_IN] : face === DOWN ? [FURNACE_OUT, FURNACE_FUEL] : [FURNACE_FUEL];
  if (c.kind === 'brewing') return face === UP ? [BREW_INGREDIENT] : face === DOWN ? [...BREW_BOTTLES, BREW_INGREDIENT] : [...BREW_BOTTLES, BREW_FUEL];
  return c.slots.length === 5 ? ALL5 : c.slots.map((_, i) => i);
}

function canInsert(c: ContainerState, slot: number, s: ItemStack): boolean {
  if (c.kind === 'furnace') {
    if (slot === FURNACE_OUT) return false;
    if (slot === FURNACE_FUEL) return isFuel(s.id) || (s.id === BUCKET && c.slots[FURNACE_FUEL]?.id !== BUCKET);
    return true;
  }
  if (c.kind === 'brewing') return brewCanPlace(slot, s) && (!BREW_BOTTLES.includes(slot) || !c.slots[slot]);
  return true;
}

function canExtract(c: ContainerState, slot: number, s: ItemStack, face: number): boolean {
  if (c.kind === 'furnace') return !(face === DOWN && slot === FURNACE_FUEL) || s.id === BUCKET || s.id === WATER_BUCKET;
  if (c.kind === 'brewing') {
    if (slot === BREW_INGREDIENT) return false;
    // Los frascos, cuando ya no hay nada más que destilar.
    return !BREW_BOTTLES.includes(slot) || !brewable(c);
  }
  return true;
}

/** Tope de un hueco (los de frasco del alambique, de uno en uno). */
function slotLimit(c: ContainerState, slot: number, id: number): number {
  return c.kind === 'brewing' && BREW_BOTTLES.includes(slot) ? 1 : maxStack(id);
}

/**
 * Mete en el contenedor `c` todo lo que quepa de `s` por la cara `face` (primero junta con pilas iguales,
 * hueco a hueco, como en Minecraft). Devuelve cuántos entraron.
 */
export function insertStack(c: ContainerState, s: ItemStack, face: number): number {
  let left = s.count;
  for (const i of insertSlots(c, face)) {
    if (left <= 0) break;
    const probe = { ...s, count: left };
    if (!canInsert(c, i, probe)) continue;
    const cur = c.slots[i];
    const max = slotLimit(c, i, s.id);
    if (!cur) {
      const n = Math.min(left, max);
      c.slots[i] = { ...s, count: n };
      left -= n;
    } else if (sameKind(cur, s) && cur.count < max) {
      const n = Math.min(left, max - cur.count);
      c.slots[i] = { ...cur, count: cur.count + n };
      left -= n;
    }
  }
  return s.count - left;
}

/** Lo que tiene una tolva, un dispensador o un contenedor abierto para operar: su contenido y cómo guardarlo. */
export interface Opened {
  state: ContainerState;
  done(): void;
}

export class Inventories {
  /** Vagonetas con inventario por celda (se rehace una vez por tick, cuando hace falta). */
  private carts = new Map<number, Entity[]>();
  private cartsTick = -1;
  /** Objetos tirados por celda (igual, una vez por tick). */
  private items = new Map<number, Entity[]>();
  private itemsTick = -1;

  constructor(
    private ctx: ServerContext, private containers: ContainerSystem, private composters: Composters, private collections: Collections,
    private shelves: Shelves,
  ) {}

  /** Vagonetas con cofre o con tolva cuya caja toca la celda (x, y, z). */
  cartsAt(x: number, y: number, z: number): Entity[] {
    if (this.cartsTick !== this.ctx.tickCount) {
      this.cartsTick = this.ctx.tickCount;
      this.carts.clear();
      for (const e of this.ctx.entities.list.values()) {
        if ((e.type !== ENT_CHEST_MINECART && e.type !== ENT_HOPPER_MINECART) || e.dead) continue;
        const k = posKey(Math.floor(e.x), Math.floor(e.y + 0.3), Math.floor(e.z));
        const l = this.carts.get(k);
        if (l) l.push(e);
        else this.carts.set(k, [e]);
      }
    }
    return this.carts.get(posKey(x, y, z)) ?? [];
  }

  /** Objetos tirados en la celda (x, y, z) (índice de este tick). */
  itemsAt(x: number, y: number, z: number): Entity[] {
    if (this.itemsTick !== this.ctx.tickCount) {
      this.itemsTick = this.ctx.tickCount;
      this.items.clear();
      for (const e of this.ctx.entities.list.values()) {
        if (e.type !== ENT_ITEM || e.dead || !e.stack) continue;
        const k = posKey(Math.floor(e.x), Math.floor(e.y), Math.floor(e.z));
        const l = this.items.get(k);
        if (l) l.push(e);
        else this.items.set(k, [e]);
      }
    }
    return this.items.get(posKey(x, y, z)) ?? [];
  }

  /**
   * Mete en `c` (por arriba) los objetos tirados cuyo centro está en la caja dada: el primero que quepa, entero
   * o lo que quepa de él (como una tolva). true si cogió algo.
   */
  suckItems(c: ContainerState, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): boolean {
    for (let cy = Math.floor(y0); cy <= Math.floor(y1); cy++) {
      for (let cz = Math.floor(z0); cz <= Math.floor(z1); cz++) {
        for (let cx = Math.floor(x0); cx <= Math.floor(x1); cx++) {
          for (const e of this.itemsAt(cx, cy, cz)) {
            if (e.dead || !e.stack || !this.ctx.entities.list.has(e.id)) continue;
            if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1 || e.z < z0 || e.z > z1) continue;
            const n = insertStack(c, e.stack, UP);
            if (n <= 0) continue;
            if (n >= e.stack.count) this.ctx.entities.remove(e.id);
            else e.stack = { ...e.stack, count: e.stack.count - n };
            return true;
          }
        }
      }
    }
    return false;
  }

  /** Contenedor de bloque de (x, y, z) o, si no hay, el de una vagoneta que esté ahí. */
  open(x: number, y: number, z: number): Opened | null {
    const id = this.ctx.world.getBlock(x, y, z);
    if (isContainer(id)) return this.containers.access(x, y, z);
    for (const e of this.cartsAt(x, y, z)) {
      const [cx, cy, cz] = vehicleContainerPos(e.id);
      const o = this.containers.access(cx, cy, cz);
      if (o) return o;
    }
    return null;
  }

  /** ¿Hay en (x, y, z) algo que guarde objetos (un contenedor, un compostador, un tocadiscos…)? */
  hasInventory(x: number, y: number, z: number): boolean {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id <= 0) return this.cartsAt(x, y, z).length > 0;
    return isContainer(id) || familyBase(id) === COMPOSTER || isJukebox(id) || isChiseledShelf(id) || this.cartsAt(x, y, z).length > 0;
  }

  /** Mete un objeto de `s` en lo que haya en (x, y, z) por su cara `face`; true si entró. */
  insertOne(x: number, y: number, z: number, face: number, s: ItemStack): boolean {
    return this.insert(x, y, z, face, { ...s, count: 1 }) === 1;
  }

  /** Mete lo que quepa de `s` en lo que haya en (x, y, z) por su cara `face`; devuelve cuántos entraron. */
  insert(x: number, y: number, z: number, face: number, s: ItemStack): number {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id > 0 && familyBase(id) === COMPOSTER) return face === UP && this.composters.insert(x, y, z, s.id) ? 1 : 0;
    if (id > 0 && isJukebox(id)) return this.collections.insertDisc(x, y, z, s.id) ? 1 : 0;
    if (id > 0 && isChiseledShelf(id)) return this.shelves.insertBook(x, y, z, s) ? 1 : 0;
    const o = this.open(x, y, z);
    if (!o) return 0;
    const n = insertStack(o.state, s, face);
    if (n > 0) o.done();
    return n;
  }

  /**
   * Saca un objeto de lo que haya en (x, y, z) por su cara `face`: el del primer hueco que pueda salir y
   * que acepte `take` (que lo guarda; si no cabe, devuelve false y se prueba el siguiente). true si sacó algo.
   */
  extractOne(x: number, y: number, z: number, face: number, take: (s: ItemStack) => boolean): boolean {
    const id = this.ctx.world.getBlock(x, y, z);
    if (id > 0 && familyBase(id) === COMPOSTER) {
      if (face !== DOWN || composterLevel(id) !== COMPOSTER_READY || !take({ id: BONE_MEAL, count: 1 })) return false;
      return this.composters.takeReady(x, y, z);
    }
    if (id > 0 && isChiseledShelf(id)) {
      const book = this.shelves.takeBook(x, y, z);
      if (!book) return false;
      if (take(book)) return true;
      this.shelves.insertBook(x, y, z, book);
      return false;
    }
    const o = this.open(x, y, z);
    if (!o) return false;
    const c = o.state;
    for (const i of extractSlots(c, face)) {
      const s = c.slots[i];
      if (!s || s.count <= 0 || !canExtract(c, i, s, face)) continue;
      if (!take({ ...s, count: 1 })) continue;
      c.slots[i] = s.count > 1 ? { ...s, count: s.count - 1 } : null;
      o.done();
      return true;
    }
    return false;
  }
}

/** ¿Está vacío o lleno un contenedor? (para no mirar lo que no hace falta). */
export function isEmpty(c: ContainerState): boolean {
  return c.slots.every((s) => !s || s.count <= 0);
}
export function isFull(c: ContainerState): boolean {
  return c.slots.every((s) => !!s && s.count >= maxStack(s.id));
}
