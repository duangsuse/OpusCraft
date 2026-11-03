// Fase 6.5 (libros y estandartes) en el cliente: escribir, firmar y leer libros; poner, leer y sacar el
// libro de un atril; abrir el telar; y las capas de los estandartes (las que manda el servidor, las del
// que se acaba de colocar y su dibujo en el mundo).
import { isLectern, LECTERN_BOOK, LOOM, CRAFTING_TABLE, STONECUTTER, isContainer, familyBase } from '../../shared/blocks';
import { WRITABLE_BOOK, WRITTEN_BOOK, type ItemStack } from '../../shared/items';
import { bookPages, writeBook, signBook, isLecternBook } from '../../shared/books';
import { bannerLayers, type BannerLayer } from '../../shared/bannerPatterns';
import { isUsable, type Edit } from '../../shared/placement';
import type { ServerMsg } from '../../shared/protocol';
import { BookScreen, type BookReadInfo } from '../ui/BookScreen';
import { BannerLayers } from './banners';
import type { ClientEntity } from './ClientEntities';
import type { RayHit } from './raycast';
import type { Game } from './Game';

export class BooksClient {
  readonly banners = new BannerLayers();
  readonly screen = new BookScreen();
  /** Atril cuyo libro se ha pedido para leerlo (esperando 'lbook'). */
  private reading: [number, number, number] | null = null;

  constructor(private g: Game) {}

  isOpen(): boolean {
    return this.screen.isOpen();
  }

  /** Estandartes con dibujos de la bienvenida: [x, y, z, capas]. */
  onWelcome(list: unknown): void {
    this.banners.clear();
    for (const b of Array.isArray(list) ? list : []) {
      if (Array.isArray(b) && b.slice(0, 3).every(Number.isInteger)) this.banners.set(b[0], b[1], b[2], b[3]);
    }
  }

  /** Mensajes del servidor que son suyos ('banner' y 'lbook'). */
  onMessage(msg: ServerMsg): boolean {
    if (msg.t === 'banner') {
      if ([msg.x, msg.y, msg.z].every(Number.isInteger)) this.banners.set(msg.x, msg.y, msg.z, msg.l);
      return true;
    }
    if (msg.t === 'lbook') {
      const r = this.reading;
      this.reading = null;
      if (!r || r[0] !== msg.x || r[1] !== msg.y || r[2] !== msg.z || !msg.b || this.anyOtherScreen()) return true;
      const [x, y, z] = r;
      this.openReader(msg.b, msg.own ? () => this.askLectern(x, y, z, 'take', 0) : undefined);
      return true;
    }
    return false;
  }

  /**
   * Clic derecho: telar, atril (poner o leer) y libros en la mano (escribir o leer). Devuelve true si lo
   * atendió. Agachado sobre un bloque, o con los bloques que se usan (cofres, puertas…), sigue lo normal.
   */
  use(pressed: boolean, hit: RayHit | null, target: ClientEntity | null, held: ItemStack | null): boolean {
    const g = this.g;
    if (!pressed || target) return false;
    if (hit && !g.player.sneaking) {
      if (hit.id === LOOM) {
        g.openScreen('loom', null);
        g.audio.playUi('open');
        return true;
      }
      if (isLectern(hit.id)) {
        if (hit.id === LECTERN_BOOK) {
          this.reading = [hit.x, hit.y, hit.z];
          g.net?.send({ t: 'lectern', x: hit.x, y: hit.y, z: hit.z, a: 'read', q: 0 });
          g.swing(true);
          return true;
        }
        if (held && isLecternBook(held.id)) {
          this.askLectern(hit.x, hit.y, hit.z, 'put', held.id, held);
          g.swing(true);
          return true;
        }
        return false;
      }
      if (isContainer(hit.id) || isUsable(hit.id) || hit.id === CRAFTING_TABLE || familyBase(hit.id) === STONECUTTER) return false;
    }
    if (held?.id === WRITABLE_BOOK) {
      this.openEditor(g.selected);
      return true;
    }
    if (held?.id === WRITTEN_BOOK) {
      this.openReader(held);
      return true;
    }
    return false;
  }

  /**
   * Al colocar un bloque desde `stack`: si es un estandarte con dibujos, sus capas (para el mensaje
   * 'place') y la predicción de su dibujo mientras llega la del servidor.
   */
  placeExtras(stack: ItemStack | null, edits: readonly Edit[]): { l?: BannerLayer[] } {
    const l = bannerLayers(stack);
    if (!l.length || !edits.length) return {};
    const [x, y, z] = edits[0];
    this.banners.set(x, y, z, l);
    return { l };
  }

  // ---------------------------------------------------------------- libros

  private anyOtherScreen(): boolean {
    return this.screen.isOpen() || this.g.screen.isOpen();
  }

  /** Pregunta al servidor por el atril (poner con take 1 o sacar con give), como las demás interacciones. */
  private askLectern(x: number, y: number, z: number, a: 'put' | 'take', item: number, book?: ItemStack): void {
    const ia = this.g.interaction;
    const q = ++ia.interactQ;
    ia.pendingInteract.set(q, { slot: this.g.selected, item });
    if (ia.pendingInteract.size > 32) ia.pendingInteract.delete(ia.pendingInteract.keys().next().value!);
    this.g.net?.send({ t: 'lectern', x, y, z, a, q, ...(book ? { book } : {}) });
  }

  /** Suelta el ratón y para lo que se estuviera haciendo (como las demás ventanas). */
  private prepare(): void {
    const g = this.g;
    g.interaction.mining = null;
    g.interaction.use = null;
    g.input.gameKeys = false;
    g.input.releaseAll();
    g.input.exitLock();
  }

  /** Editor del libro y pluma del hueco `slot` (se guarda en la pila al cerrar). */
  private openEditor(slot: number): void {
    const g = this.g;
    const stack = g.inv.get(slot);
    if (!stack) return;
    this.prepare();
    g.audio.playUi('open');
    const same = () => {
      const cur = g.inv.get(slot);
      return cur?.id === WRITABLE_BOOK ? cur : null;
    };
    this.screen.openEdit(bookPages(stack), g.cfg.name, {
      save: (pages) => {
        const cur = same();
        if (cur) g.inv.set(slot, writeBook(cur, pages));
      },
      sign: (title) => {
        const cur = same();
        const signed = cur && signBook(cur, title, g.cfg.name);
        if (signed) {
          g.inv.set(slot, signed);
          g.ui.toast(`Libro firmado: «${signed.data?.title}»`);
        }
      },
    }, () => g.afterScreenClosed());
  }

  /** Lector de un libro (el de la mano o el de un atril; `take` si se puede sacar del atril). */
  private openReader(book: ItemStack, take?: () => void): void {
    const g = this.g;
    this.prepare();
    g.audio.playUi('open');
    const d = book.data;
    const info: BookReadInfo = { pages: bookPages(book), take };
    if (book.id === WRITTEN_BOOK) Object.assign(info, { title: d?.title ?? 'Libro escrito', author: d?.author, gen: d?.gen });
    this.screen.openRead(info, () => g.afterScreenClosed());
  }
}
