// Fase 6.5 (libros y estandartes): atriles. Con un libro y pluma o un libro escrito en la mano, clic
// derecho en un atril vacío pone el libro (el atril pasa a tener un libro encima); cualquiera lo lee
// (sólo lectura) y quien lo puso lo puede sacar. Qué libro hay y de quién es se guarda por posición con
// los contenedores (clave 'lc'); al romper el atril cae el libro.
import { LECTERN, LECTERN_BOOK } from '../../blocks';
import { isLecternBook } from '../../books';
import { sanitizeStack } from '../../containers';
import { STATE_DEAD, stackFromWire, stackToWire, type ClientMsg } from '../../protocol';
import type { ItemStack } from '../../items';
import type { ServerStore } from '../store';
import { posKey } from '../posKey';
import type { ServerContext, Session } from './context';

interface LecternBook {
  book: ItemStack;
  /** Nombre de quien lo puso (en minúsculas). */
  owner: string;
}

export class Lecterns {
  private books = new Map<number, LecternBook>();
  private dirty = new Set<number>();

  constructor(private ctx: ServerContext, store: ServerStore) {
    for (const [key, data] of store.loadContainers()) {
      try {
        const w = JSON.parse(data) as { k?: string; b?: unknown; o?: unknown };
        if (w.k !== 'lc') continue;
        const book = sanitizeStack(stackFromWire(w.b));
        if (book && isLecternBook(book.id)) this.books.set(key, { book: { ...book, count: 1 }, owner: typeof w.o === 'string' ? w.o : '' });
      } catch {
        /* ignorar */
      }
    }
  }

  /** Libro del atril de (x, y, z) (para pruebas y depuración). */
  bookAt(x: number, y: number, z: number): ItemStack | null {
    return this.books.get(posKey(x, y, z))?.book ?? null;
  }

  onLectern(s: Session, msg: Extract<ClientMsg, { t: 'lectern' }>): void {
    const ctx = this.ctx;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z), q = Number(msg.q);
    const reply = (ok: boolean, take = 0, give?: ItemStack) =>
      ctx.send(s, { t: 'ires', q: Number.isInteger(q) ? q : 0, ok, take, ...(give ? { give } : {}) });
    if (![x, y, z].every(Number.isInteger) || s.s & STATE_DEAD || !ctx.reachOk(s, x, y, z, 8)) return reply(false);
    const id = ctx.world.getBlock(x, y, z);
    const k = posKey(x, y, z);
    const cur = this.books.get(k);
    const me = s.name.toLowerCase();
    if (msg.a === 'read') {
      ctx.send(s, { t: 'lbook', x, y, z, b: id === LECTERN_BOOK && cur ? cur.book : null, own: !!cur && cur.owner === me });
      return;
    }
    if (msg.a === 'put') {
      const book = sanitizeStack(msg.book);
      if (id !== LECTERN || !book || !isLecternBook(book.id)) return reply(false);
      this.books.set(k, { book: { ...book, count: 1 }, owner: me });
      this.dirty.add(k);
      ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, LECTERN_BOOK));
      ctx.fx('shelf_put', x + 0.5, y + 1, z + 0.5);
      return reply(true, 1);
    }
    if (msg.a === 'take') {
      if (id !== LECTERN_BOOK || !cur || cur.owner !== me) return reply(false);
      this.books.delete(k);
      this.dirty.add(k);
      ctx.asActor(s.id, () => ctx.world.setBlock(x, y, z, LECTERN));
      ctx.fx('shelf_take', x + 0.5, y + 1, z + 0.5);
      return reply(true, 0, cur.book);
    }
    reply(false);
  }

  /** Se rompe el atril (o se le quita el libro por otra vía): cae el libro. */
  onBlockChanged(x: number, y: number, z: number, old: number, id: number): void {
    if (old !== LECTERN_BOOK || id === LECTERN_BOOK) return;
    const k = posKey(x, y, z);
    const cur = this.books.get(k);
    if (!cur) return;
    this.books.delete(k);
    this.dirty.add(k);
    this.ctx.entities.dropStacks([cur.book], x + 0.5, y + 1, z + 0.5);
  }

  flush(store: ServerStore): void {
    for (const k of this.dirty) {
      const cur = this.books.get(k);
      store.saveContainer(k, cur ? JSON.stringify({ k: 'lc', b: stackToWire(cur.book), o: cur.owner }) : null);
    }
    this.dirty.clear();
  }
}
