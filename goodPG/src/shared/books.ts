// Fase 6.5 (libros y estandartes): libros. El libro y pluma (libro + saco de tinta + pluma) se escribe
// en un editor de páginas y, al firmarlo, se convierte en un libro escrito con título, autor (quien lo
// firma) y generación, que ya no se edita. Un libro escrito y de 1 a 8 libros y pluma en la cuadrícula
// dan otras tantas copias (el original se queda); las copias de copias ya no se copian.
import { WRITABLE_BOOK, WRITTEN_BOOK, type ItemStack } from './items';
import { sanitizePages, sanitizeTitle, type ItemData } from './itemData';

/** Nombre de cada generación de un libro escrito. */
export const BOOK_GENERATIONS = ['Original', 'Copia del original', 'Copia de una copia', 'Hecho jirones'];

/** ¿Se puede poner en un atril? (libros con texto: el libro y pluma o el escrito). */
export function isLecternBook(id: number): boolean {
  return id === WRITABLE_BOOK || id === WRITTEN_BOOK;
}

/** Páginas del libro (al menos una, aunque esté vacía). */
export function bookPages(s: ItemStack | null | undefined): string[] {
  const p = s?.data?.pages;
  return p && p.length ? p : [''];
}

/** El libro y pluma con estas páginas (sin datos si están todas vacías). */
export function writeBook(s: ItemStack, pages: readonly string[]): ItemStack {
  const clean = sanitizePages(pages);
  const out: ItemStack = { id: s.id, count: s.count };
  if (clean) out.data = { pages: clean };
  return out;
}

/** Firma un libro y pluma: libro escrito original con título y autor. Null si el título está vacío. */
export function signBook(s: ItemStack, title: string, author: string): ItemStack | null {
  const t = sanitizeTitle(title);
  if (s.id !== WRITABLE_BOOK || !t) return null;
  const data: ItemData = { pages: sanitizePages(s.data?.pages) ?? [], title: t, author: author || '?', gen: 0 };
  return { id: WRITTEN_BOOK, count: 1, data };
}

/**
 * Copia de libros en la cuadrícula: un libro escrito que aún se pueda copiar (original o copia del
 * original) y de 1 a 8 libros y pluma, nada más. Devuelve las copias y el hueco del original (se queda).
 */
export function bookCopy(grid: readonly (ItemStack | null)[]): { out: ItemStack; original: number } | null {
  let original = -1, blanks = 0;
  for (let i = 0; i < grid.length; i++) {
    const s = grid[i];
    if (!s) continue;
    if (s.id === WRITTEN_BOOK && original < 0) original = i;
    else if (s.id === WRITABLE_BOOK) blanks++;
    else return null;
  }
  if (original < 0 || blanks < 1 || blanks > 8) return null;
  const src = grid[original]!.data;
  const gen = src?.gen ?? 0;
  if (!src || gen >= 2) return null;
  return { out: { id: WRITTEN_BOOK, count: blanks, data: { ...src, pages: (src.pages ?? []).slice(), gen: gen + 1 } }, original };
}

/** Nombre visible de un libro escrito: su título (o el del objeto). */
export function bookTitle(s: ItemStack): string {
  return s.id === WRITTEN_BOOK && s.data?.title ? s.data.title : 'Libro escrito';
}
