// Estantería cincelada: bloque de roble con 6 huecos en el frente (dos filas de tres) donde se meten y
// se sacan libros de uno en uno con clic derecho, según el hueco al que se apunte. El estado guarda qué
// huecos están llenos (para dibujarlos); qué libro hay en cada uno lo guarda el servidor.
// Se registra la última (export * al final de index.ts): no mueve ningún id guardado.
import { family, L, familyBase, stateOf, stateProps, R_MODEL } from './registry';
import { mbox, rotateBoxes, DIR_X, DIR_Z, type ModelBox } from '../blockModels';

/** Huecos: 0..2 arriba y 3..5 abajo, de izquierda a derecha mirando el frente. */
export const SHELF_SLOTS = 6;
/** Columnas de cada hueco en x (mirando al norte, la izquierda del que mira está en +X): 5, 6 y 5 px. */
const COLS: [number, number][] = [[11, 16], [5, 11], [0, 5]];

function shelfBoxes(books: number): ModelBox[] {
  const side = L('chiseled_bookshelf_side'), top = L('chiseled_bookshelf_top');
  const empty = L('chiseled_bookshelf_empty'), full = L('chiseled_bookshelf_occupied');
  const out = [mbox(0, 0, 0, 16, 16, 16, [side, side, top, top, side, -1])];
  for (let k = 0; k < SHELF_SLOTS; k++) {
    const [x0, x1] = COLS[k % 3];
    const y0 = k < 3 ? 8 : 0;
    out.push(mbox(x0, y0, 0, x1, y0 + 8, 0, [-1, -1, -1, -1, -1, books & (1 << k) ? full : empty]));
  }
  return out;
}

/** `facing` es hacia donde mira el frente; `books`, un bit por hueco lleno. */
export const CHISELED_BOOKSHELF = family('chiseled_bookshelf', 'Estantería', [['facing', 4], ['books', 64]], (st) => ({
  render: R_MODEL, opaque: true, hardness: 1.5, tool: 'axe', sound: 'wood', category: 'decoracion', all: 'chiseled_bookshelf_side',
  model: rotateBoxes(shelfBoxes(st.books), st.facing), itemModel: rotateBoxes(shelfBoxes(0), 2),
}));

export function isChiseledShelf(id: number): boolean {
  return familyBase(id) === CHISELED_BOOKSHELF;
}

/** La misma estantería con otros huecos llenos. */
export function shelfWithBooks(id: number, books: number): number {
  return stateOf(CHISELED_BOOKSHELF, { facing: stateProps(id)!.facing, books: books & 63 });
}

/**
 * Hueco al que apunta un clic en (px, py, pz) de la estantería de (x, y, z), o -1 si no es el frente.
 * (nx, nz) es la normal de la cara tocada.
 */
export function shelfSlotAt(id: number, x: number, y: number, z: number, px: number, py: number, pz: number, nx: number, nz: number): number {
  const f = stateProps(id)!.facing;
  if (nx !== DIR_X[f] || nz !== DIR_Z[f]) return -1;
  // Izquierda de quien mira el frente: (−nz, nx).
  const u = (px - x - 0.5) * -DIR_Z[f] + (pz - z - 0.5) * DIR_X[f] + 0.5; // 1 en el borde izquierdo
  const col = u > 11 / 16 ? 0 : u > 5 / 16 ? 1 : 2;
  const row = py - y >= 0.5 ? 0 : 1;
  return row * 3 + col;
}

/** Objetos que caben en la estantería (libros). */
export const SHELF_BOOK_KEYS: ReadonlySet<string> = new Set(['book', 'writable_book', 'written_book', 'enchanted_book', 'knowledge_book']);
