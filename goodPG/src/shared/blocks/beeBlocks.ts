// Bloques de las abejas (fase 6): nido de abejas (en los robles y abedules de llanuras y praderas),
// colmena fabricable, bloque de miel y bloque de panal. El nido y la colmena guardan su orientación
// (el frente con la entrada) y cuánta miel tienen (0..5); con 5 el frente gotea miel y se puede
// cosechar: con tijeras da panal y con un frasco de cristal, un frasco de miel.
// Se registran al final de index.ts para no mover ningún id guardado.
import { family, familyBase, stateProps, stateOf, type BlockCategory, type BlockDef } from './registry';
import { DIR_FACE } from '../blockModels';

/** Nivel de miel con el que el nido o la colmena están llenos (se pueden cosechar). */
export const HONEY_MAX = 5;

interface HomeTextures {
  top: string;
  bottom: string;
  side: string;
  front: string;
  frontHoney: string;
}

function beeHome(key: string, name: string, t: HomeTextures, hardness: number, category: BlockCategory): number {
  return family(key, name, [['facing', 4], ['honey', HONEY_MAX + 1]], (st) => {
    const tex: BlockDef['tex'] = [t.side, t.side, t.top, t.bottom, t.side, t.side];
    tex[DIR_FACE[st.facing]] = st.honey >= HONEY_MAX ? t.frontHoney : t.front;
    return { hardness, tool: 'axe', sound: 'wood', category, tex };
  });
}

/** Nido de abejas natural: la entrada mira hacia fuera del tronco. */
export const BEE_NEST = beeHome('bee_nest', 'Nido de abejas', {
  top: 'bee_nest_top', bottom: 'bee_nest_bottom', side: 'bee_nest_side', front: 'bee_nest_front', frontHoney: 'bee_nest_front_honey',
}, 0.3, 'naturaleza');

/** Colmena: tablones y panal; las abejas sin casa la adoptan igual que un nido. */
export const BEEHIVE = beeHome('beehive', 'Colmena', {
  top: 'beehive_end', bottom: 'beehive_end', side: 'beehive_side', front: 'beehive_front', frontHoney: 'beehive_front_honey',
}, 0.6, 'decoracion');

export const HONEY_BLOCK = family('honey_block', 'Bloque de miel', [], () => ({
  all: 'honey_block', hardness: 0, sound: 'wool', category: 'decoracion',
}));

export const HONEYCOMB_BLOCK = family('honeycomb_block', 'Bloque de panal', [], () => ({
  all: 'honeycomb_block', hardness: 0.6, sound: 'wood', category: 'decoracion',
}));

/** Bloques de las abejas en el orden del inventario creativo. */
export const BEE_INVENTORY: readonly number[] = [BEE_NEST, BEEHIVE, HONEY_BLOCK, HONEYCOMB_BLOCK];

/** ¿Nido o colmena (cualquier estado)? */
export function isBeeHome(id: number): boolean {
  const b = familyBase(id);
  return b === BEE_NEST || b === BEEHIVE;
}

/** Miel de un nido o colmena (0..5), o -1 si no lo es. */
export function honeyLevel(id: number): number {
  return isBeeHome(id) ? stateProps(id)!.honey : -1;
}

/** El mismo nido o colmena (misma orientación) con otro nivel de miel. */
export function withHoney(id: number, honey: number): number {
  const st = stateProps(id)!;
  return stateOf(familyBase(id), { facing: st.facing, honey: Math.max(0, Math.min(HONEY_MAX, honey)) });
}

/** Hacia dónde mira la entrada (0 N, 1 E, 2 S, 3 O). */
export function beeHomeFacing(id: number): number {
  return stateProps(id)?.facing ?? 0;
}
