// Fase 6.5 (libros y estandartes): atril con un libro puesto. Es el mismo atril con un libro abierto
// encima; qué libro es lo guarda el servidor (por posición). Al romperlo suelta el atril (su base) y el
// servidor suelta además el libro. Se registra el último (export * al final de index.ts): no mueve ids.
import { family, defs, L, R_MODEL } from './registry';
import { LECTERN } from './villagerBlocks';
import { mbox } from '../blockModels';

export const LECTERN_BOOK = family('lectern_book', 'Atril', [], () => {
  const lectern = defs[LECTERN];
  const pages = L('lectern_book'), cover = L('brown_concrete');
  return {
    render: R_MODEL, opaque: false, lightOpacity: 0, hardness: 2.5, tool: 'axe', sound: 'wood', category: null,
    top: 'lectern_top', side: 'lectern_side', bottom: 'oak_planks',
    model: [...lectern.model!, mbox(2, 16, 3, 14, 17, 13, [cover, cover, pages, cover, cover, cover])],
    collision: lectern.collision, selection: lectern.selection, base: LECTERN,
  };
});

/** ¿Atril (con o sin libro)? */
export function isLectern(id: number): boolean {
  return id === LECTERN || id === LECTERN_BOOK;
}
