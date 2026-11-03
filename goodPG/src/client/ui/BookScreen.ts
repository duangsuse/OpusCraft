// Fase 6.5 (libros y estandartes): pantalla del libro. Tres modos: escribir un libro y pluma (una página
// cada vez, hasta 50 de 256 caracteres; se pasa página con las flechas o Re Pág/Av Pág, y pasar de la
// última añade otra), firmarlo (título; ya no se podrá editar) y leer un libro escrito o el de un atril
// (sólo lectura; en el atril, quien lo puso lo puede sacar). Esc cierra guardando.
import './bookScreen.css';
import { BOOK_MAX_PAGES, BOOK_PAGE_CHARS, BOOK_PAGE_LINES, BOOK_TITLE_CHARS } from '../../shared/itemData';
import { BOOK_GENERATIONS } from '../../shared/books';

type Mode = 'edit' | 'sign' | 'read';

export interface BookEditHandlers {
  /** Al cerrar el editor: las páginas escritas. */
  save(pages: string[]): void;
  /** Al firmar: el título (las páginas ya se guardaron con save). */
  sign(title: string): void;
}

export interface BookReadInfo {
  pages: readonly string[];
  title?: string;
  author?: string;
  gen?: number;
  /** Sacar el libro del atril (sólo quien lo puso). */
  take?: () => void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class BookScreen {
  private root: HTMLElement;
  private mode: Mode | null = null;
  private pages: string[] = [''];
  private page = 0;
  private edit: BookEditHandlers | null = null;
  private read: BookReadInfo | null = null;
  private onClose: (() => void) | null = null;
  private author = '';
  private els: {
    head: HTMLElement; text: HTMLTextAreaElement; view: HTMLElement; count: HTMLElement; num: HTMLElement;
    prev: HTMLButtonElement; next: HTMLButtonElement; actions: HTMLElement; signBox: HTMLElement; title: HTMLInputElement;
    signNote: HTMLElement;
  };

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'book-screen';
    this.root.className = 'hidden';
    this.root.innerHTML =
      '<div class="book">' +
      '<div class="book-head"></div>' +
      '<div class="book-page">' +
      '<textarea spellcheck="false" autocomplete="off"></textarea><div class="book-view"></div>' +
      '<div class="book-sign"><label>Título del libro</label><input type="text" spellcheck="false" autocomplete="off">' +
      '<p class="book-sign-note"></p></div>' +
      '</div>' +
      '<div class="book-nav"><button type="button" class="book-arrow" data-k="prev" aria-label="Página anterior">‹</button>' +
      '<span class="book-num"></span><span class="book-count"></span>' +
      '<button type="button" class="book-arrow" data-k="next" aria-label="Página siguiente">›</button></div>' +
      '<div class="book-actions"></div>' +
      '<p class="book-hint">Re Pág / Av Pág: pasar página · Esc: cerrar</p>' +
      '</div>';
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector(sel) as T;
    this.els = {
      head: q('.book-head'), text: q('textarea'), view: q('.book-view'), count: q('.book-count'), num: q('.book-num'),
      prev: q('[data-k="prev"]'), next: q('[data-k="next"]'), actions: q('.book-actions'), signBox: q('.book-sign'),
      title: q('.book-sign input'), signNote: q('.book-sign-note'),
    };
    const { text, title, prev, next } = this.els;
    text.maxLength = BOOK_PAGE_CHARS;
    title.maxLength = BOOK_TITLE_CHARS;
    text.addEventListener('input', () => {
      // Como mucho las líneas que caben en la página.
      const lines = text.value.split('\n');
      if (lines.length > BOOK_PAGE_LINES) {
        const pos = text.selectionStart;
        text.value = lines.slice(0, BOOK_PAGE_LINES).join('\n');
        text.selectionStart = text.selectionEnd = Math.min(pos, text.value.length);
      }
      this.pages[this.page] = text.value;
      this.renderNav();
    });
    title.addEventListener('input', () => this.renderActions());
    prev.addEventListener('click', () => this.turn(-1));
    next.addEventListener('click', () => this.turn(1));
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    this.root.addEventListener('keyup', (e) => e.stopPropagation());
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.appendChild(this.root);
  }

  isOpen(): boolean {
    return this.mode !== null;
  }

  /** Escribir un libro y pluma. `author`: quien firmaría. */
  openEdit(pages: readonly string[], author: string, handlers: BookEditHandlers, onClose: () => void): void {
    this.pages = pages.length ? pages.slice(0, BOOK_MAX_PAGES) : [''];
    this.page = 0;
    this.edit = handlers;
    this.read = null;
    this.author = author;
    this.onClose = onClose;
    this.show('edit');
  }

  /** Leer un libro (escrito, o el de un atril). */
  openRead(info: BookReadInfo, onClose: () => void): void {
    this.pages = info.pages.length ? info.pages.slice() : [''];
    this.page = 0;
    this.edit = null;
    this.read = info;
    this.onClose = onClose;
    this.show('read');
  }

  /** Cierra (en el editor, guardando lo escrito). `notify` false: sin avisar (al salir de la partida). */
  close(notify = true): void {
    if (!this.mode) return;
    if ((this.mode === 'edit' || this.mode === 'sign') && this.edit) this.edit.save(this.pages);
    if (!notify) this.onClose = null;
    this.finish();
  }

  private finish(): void {
    this.mode = null;
    this.edit = null;
    this.read = null;
    this.root.classList.add('hidden');
    (document.activeElement as HTMLElement | null)?.blur();
    const done = this.onClose;
    this.onClose = null;
    done?.();
  }

  private show(mode: Mode): void {
    this.mode = mode;
    this.root.classList.remove('hidden');
    this.root.dataset.mode = mode;
    this.render();
    setTimeout(() => {
      if (this.mode === 'edit') this.els.text.focus();
      else if (this.mode === 'sign') this.els.title.focus();
      else (this.root.querySelector('.book-actions button') as HTMLElement | null)?.focus();
    }, 0);
  }

  private turn(d: number): void {
    if (this.mode === 'sign') return;
    const n = this.page + d;
    if (n < 0) return;
    if (n >= this.pages.length) {
      // Pasar de la última página del editor añade otra (hasta 50).
      if (this.mode !== 'edit' || this.pages.length >= BOOK_MAX_PAGES) return;
      this.pages.push('');
    }
    this.page = n;
    this.render();
    if (this.mode === 'edit') {
      const t = this.els.text;
      t.focus();
      t.selectionStart = t.selectionEnd = t.value.length;
    }
  }

  private onKey(e: KeyboardEvent): void {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this.mode === 'sign') this.show('edit');
      else this.close();
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      this.turn(e.key === 'PageUp' ? -1 : 1);
    } else if (this.mode === 'read' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      this.turn(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (this.mode === 'sign' && e.key === 'Enter') {
      e.preventDefault();
      this.doSign();
    }
  }

  private doSign(): void {
    const t = this.els.title.value.trim();
    if (!t || !this.edit) return;
    const edit = this.edit;
    edit.save(this.pages);
    edit.sign(t);
    this.finish();
  }

  // ---------------------------------------------------------------- dibujo

  private render(): void {
    const { head, text, view, signBox, title, signNote } = this.els;
    const mode = this.mode!;
    const r = this.read;
    if (mode === 'read' && r) {
      const gen = BOOK_GENERATIONS[r.gen ?? 0] ?? '';
      head.innerHTML = r.title
        ? `<b>${esc(r.title)}</b><span>de ${esc(r.author ?? '?')} · ${esc(gen)}</span>`
        : '<b>Libro y pluma</b><span>Sin firmar</span>';
    } else if (mode === 'sign') {
      head.innerHTML = '<b>Firmar el libro</b>';
    } else {
      head.innerHTML = '<b>Libro y pluma</b><span>Escribe; al firmarlo tendrá título y autor</span>';
    }
    text.hidden = mode !== 'edit';
    view.hidden = mode !== 'read';
    signBox.hidden = mode !== 'sign';
    if (mode === 'edit') text.value = this.pages[this.page] ?? '';
    if (mode === 'read') view.textContent = this.pages[this.page] ?? '';
    if (mode === 'sign') {
      title.value = '';
      signNote.textContent = `Autor: ${this.author}. Una vez firmado ya no se podrá editar.`;
    }
    this.renderNav();
    this.renderActions();
  }

  private renderNav(): void {
    const { num, count, prev, next } = this.els;
    const mode = this.mode;
    num.textContent = mode === 'sign' ? '' : `Página ${this.page + 1} de ${this.pages.length}`;
    count.textContent = mode === 'edit' ? `${[...(this.pages[this.page] ?? '')].length}/${BOOK_PAGE_CHARS}` : '';
    prev.disabled = mode === 'sign' || this.page === 0;
    next.disabled = mode === 'sign' || (this.page >= this.pages.length - 1 && (mode !== 'edit' || this.pages.length >= BOOK_MAX_PAGES));
    prev.style.visibility = next.style.visibility = mode === 'sign' ? 'hidden' : '';
  }

  private renderActions(): void {
    const a = this.els.actions;
    const mode = this.mode;
    const btn = (k: string, label: string, primary = false, disabled = false) =>
      `<button type="button" class="btn${primary ? ' primary' : ''}" data-a="${k}"${disabled ? ' disabled' : ''}>${label}</button>`;
    if (mode === 'edit') a.innerHTML = btn('sign', 'Firmar') + btn('done', 'Hecho', true);
    else if (mode === 'sign') a.innerHTML = btn('back', 'Cancelar') + btn('confirm', 'Firmar y cerrar', true, !this.els.title.value.trim());
    else a.innerHTML = (this.read?.take ? btn('take', 'Sacar libro') : '') + btn('done', 'Cerrar', true);
    a.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.addEventListener('click', () => this.action(b.dataset.a!)));
  }

  private action(k: string): void {
    if (k === 'done') this.close();
    else if (k === 'sign') this.show('sign');
    else if (k === 'back') this.show('edit');
    else if (k === 'confirm') this.doSign();
    else if (k === 'take') {
      const take = this.read?.take;
      this.finish();
      take?.();
    }
  }
}
