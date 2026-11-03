// Fase 6.5 (remate): estanterías cinceladas. Qué libro hay en cada hueco (el bloque sólo sabe qué huecos
// están llenos). Clic derecho en un hueco lleno saca el libro; en uno vacío con un libro en la mano, lo
// mete. Al romper la estantería caen los libros. Se guarda con los contenedores (clave 'cb').
import { isChiseledShelf, shelfWithBooks, stateProps, SHELF_SLOTS, SHELF_BOOK_KEYS } from '../../blocks';
import { ITEMS, BOOK, type ItemStack } from '../../items';
import { sanitizeStack } from '../../containers';
import { STATE_DEAD, type ClientMsg } from '../../protocol';
import type { ServerStore } from '../store';
import { posKey } from '../posKey';
import type { ServerContext, Session } from './context';

type Slots = (ItemStack | null)[];

export class Shelves {
  private books = new Map<number, Slots>();
  private dirty = new Set<number>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const w = JSON.parse(data) as { k?: string; s?: unknown[]; d?: unknown[] };
        if (w.k !== 'cb' || !Array.isArray(w.s)) continue;
        const slots: Slots = [];
        for (let i = 0; i < SHELF_SLOTS; i++) {
          const s = w.s[i];
          // Fase 6.5 (libros y estandartes): `d` lleva el texto de los libros escritos (0 si no tienen).
          const data = Array.isArray(w.d) ? w.d[i] || undefined : undefined;
          slots.push(Array.isArray(s) ? sanitizeStack({ id: Number(s[0]), count: 1, dmg: s[1] === undefined ? undefined : Number(s[1]), data }) : null);
        }
        this.books.set(key, slots);
      } catch {
        /* ignorar */
      }
    }
  }

  onShelf(s: Session, msg: Extract<ClientMsg, { t: 'shelf' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), slot = Number(msg.slot), item = Number(msg.item);
    const q = Number(msg.q);
    const reply = (ok: boolean, take = 0, give?: ItemStack) =>
      ctx.send(s, { t: 'ires', q: Number.isInteger(q) ? q : 0, ok, take, ...(give ? { give } : {}) });
    if (![x, y, z].every(Number.isInteger) || !Number.isInteger(slot) || slot < 0 || slot >= SHELF_SLOTS) return reply(false);
    if (s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) return reply(false);
    const id = ctx.world.getBlock(x, y, z);
    if (!isChiseledShelf(id)) return reply(false);
    const k = posKey(x, y, z);
    const slots = this.books.get(k) ?? new Array<ItemStack | null>(SHELF_SLOTS).fill(null);
    const mask = stateProps(id)!.books;
    const bit = 1 << slot;
    if (mask & bit) {
      // Sacar el libro (si el servidor no sabía cuál era, un libro normal).
      const book = slots[slot] ?? { id: BOOK, count: 1 };
      slots[slot] = null;
      this.store(k, slots);
      ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, shelfWithBooks(id, mask & ~bit)));
      ctx.fx('shelf_take', x + 0.5, y + 0.5, z + 0.5);
      return reply(true, 0, book);
    }
    if (!(Number.isInteger(item) && item > 0 && SHELF_BOOK_KEYS.has(ITEMS[item]?.key ?? ''))) return reply(false);
    // Fase 6.5 (libros y estandartes): con su texto si lo tiene (la pila entera llega en `st`).
    const st = msg.st && Number(msg.st.id) === item ? sanitizeStack({ ...msg.st, count: 1 }) : null;
    slots[slot] = st ?? { id: item, count: 1 };
    this.store(k, slots);
    ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, shelfWithBooks(id, mask | bit)));
    ctx.fx('shelf_put', x + 0.5, y + 0.5, z + 0.5);
    reply(true, 1);
  }

  /** Fase 7 (mecanismos): una tolva mete un libro en el primer hueco libre; true si entró. */
  insertBook(x: number, y: number, z: number, stack: ItemStack): boolean {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isChiseledShelf(id) || !SHELF_BOOK_KEYS.has(ITEMS[stack.id]?.key ?? '')) return false;
    const mask = stateProps(id)!.books;
    for (let i = 0; i < SHELF_SLOTS; i++) {
      if (mask & (1 << i)) continue;
      const k = posKey(x, y, z);
      const slots = this.books.get(k) ?? new Array<ItemStack | null>(SHELF_SLOTS).fill(null);
      slots[i] = { ...stack, count: 1 };
      this.store(k, slots);
      this.ctx.world.setBlock(x, y, z, shelfWithBooks(id, mask | (1 << i)));
      return true;
    }
    return false;
  }

  /** Fase 7 (mecanismos): una tolva de debajo saca el primer libro; null si no hay. */
  takeBook(x: number, y: number, z: number): ItemStack | null {
    const id = this.ctx.world.getBlock(x, y, z);
    if (!isChiseledShelf(id)) return null;
    const mask = stateProps(id)!.books;
    for (let i = 0; i < SHELF_SLOTS; i++) {
      if (!(mask & (1 << i))) continue;
      const k = posKey(x, y, z);
      const slots = this.books.get(k) ?? new Array<ItemStack | null>(SHELF_SLOTS).fill(null);
      const book = slots[i] ?? { id: BOOK, count: 1 };
      slots[i] = null;
      this.store(k, slots);
      this.ctx.world.setBlock(x, y, z, shelfWithBooks(id, mask & ~(1 << i)));
      return book;
    }
    return null;
  }

  private store(k: number, slots: Slots): void {
    if (slots.some(Boolean)) this.books.set(k, slots);
    else this.books.delete(k);
    this.dirty.add(k);
  }

  /** Se rompe una estantería: caen sus libros. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (!isChiseledShelf(old) || isChiseledShelf(id)) return;
    const k = posKey(x, y, z);
    const mask = stateProps(old)!.books;
    const slots = this.books.get(k);
    const drops: ItemStack[] = [];
    for (let i = 0; i < SHELF_SLOTS; i++) if (mask & (1 << i)) drops.push(slots?.[i] ?? { id: BOOK, count: 1 });
    if (slots) {
      this.books.delete(k);
      this.dirty.add(k);
    }
    if (drops.length) this.ctx.entities.dropStacks(drops, x + 0.5, y + 0.5, z + 0.5);
  }

  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const slots = this.books.get(k);
      const d = slots?.some((st) => st?.data) ? slots.map((st) => st?.data ?? 0) : undefined; // Fase 6.5 (libros y estandartes)
      store.saveContainer(k, slots ? JSON.stringify({ k: 'cb', s: slots.map((st) => (st ? (st.dmg ? [st.id, st.dmg] : [st.id]) : 0)), d }) : null);
    }
    this.dirty.clear();
  }
}
